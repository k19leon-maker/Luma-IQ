import { Prisma } from '@prisma/client';
import { actionKeyForFeature } from '../config/ai-action-registry';
import { prisma } from '../lib/prisma';
import { accessPolicyService } from './access-policy.service';
import { aiBalanceService } from './ai-balance.service';
import { aiPointLedgerService } from './ai-point-ledger.service';

export const aiPointReconciliationService = {
  async refundGeneration(input: { generationId: string; reason: string; actorUserId: string }) {
    const generation = await prisma.aIGeneration.findUnique({
      where: { id: input.generationId },
    });
    if (!generation?.billingPeriodId) throw Object.assign(new Error('Генерация не найдена'), { status: 404 });
    const refund = await aiPointLedgerService.refund({
      userId: generation.userId,
      projectId: generation.projectId,
      billingPeriodId: generation.billingPeriodId,
      generationId: generation.id,
      actionKey: actionKeyForFeature(generation.featureCode),
      reason: input.reason,
      metadata: { actorUserId: input.actorUserId, confirmedCompensation: true },
    });
    await prisma.$transaction([
      prisma.aIGeneration.update({
        where: { id: generation.id },
        data: { aiPointsRefunded: refund.quantity },
      }),
      prisma.aIConfigurationAuditLog.create({
        data: {
          actorUserId: input.actorUserId,
          configType: 'ai_point_refund',
          configKey: generation.id,
          operation: 'CONFIRMED_REFUND',
          after: {
            userId: generation.userId,
            generationId: generation.id,
            points: refund.quantity,
            reason: input.reason,
          },
        },
      }),
    ]);
    return refund;
  },

  async reconcileUserCurrentPeriod(userId: string) {
    const access = await accessPolicyService.getUserAccess(userId);
    await aiPointLedgerService.ensurePlanAccrual({
      userId,
      billingPeriodId: access.billingPeriod.id,
      amount: access.limits.monthlyCredits,
      planCode: access.plan,
      expiresAt: access.billingPeriod.periodEnd,
    });

    const generations = await prisma.aIGeneration.findMany({
      where: {
        userId,
        billingPeriodId: access.billingPeriod.id,
        status: 'SUCCEEDED',
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        projectId: true,
        featureCode: true,
        metadata: true,
        createdAt: true,
      },
    });

    let captured = 0;
    let alreadyReconciled = 0;
    for (const generation of generations) {
      const existing = await prisma.creditLedgerEntry.findFirst({
        where: {
          unit: 'AI_POINT',
          generationId: generation.id,
          type: 'CAPTURE',
        },
        select: { id: true },
      });
      if (existing) {
        alreadyReconciled += 1;
        continue;
      }
      const points = await aiBalanceService.resolvePointsForGeneration(generation);
      await aiPointLedgerService.reconcileCapture({
        userId,
        projectId: generation.projectId,
        billingPeriodId: access.billingPeriod.id,
        generationId: generation.id,
        actionKey: actionKeyForFeature(generation.featureCode),
        points,
        metadata: {
          originalGenerationCreatedAt: generation.createdAt.toISOString(),
        },
      });
      await prisma.aIGeneration.update({
        where: { id: generation.id },
        data: { aiPointsCaptured: points },
      });
      captured += 1;
    }

    const state = await aiPointLedgerService.getState(userId, access.billingPeriod.id);
    return {
      userId,
      billingPeriodId: access.billingPeriod.id,
      generations: generations.length,
      captured,
      alreadyReconciled,
      state,
    };
  },

  async sweepStaleReservations(input: { olderThanMinutes?: number } = {}) {
    const cutoff = new Date(Date.now() - (input.olderThanMinutes ?? 45) * 60_000);
    const reservations = await prisma.creditLedgerEntry.findMany({
      where: {
        unit: 'AI_POINT',
        type: 'RESERVE',
        createdAt: { lt: cutoff },
      },
      include: {
        generation: {
          select: {
            id: true,
            status: true,
            userId: true,
            projectId: true,
            billingPeriodId: true,
            featureCode: true,
            workflowRun: { select: { status: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    let captured = 0;
    let released = 0;
    let skipped = 0;
    for (const reservation of reservations) {
      const settlement = reservation.generationId
        ? await prisma.creditLedgerEntry.findFirst({
          where: {
            unit: 'AI_POINT',
            generationId: reservation.generationId,
            type: { in: ['CAPTURE', 'RELEASE'] },
          },
          select: { id: true },
        })
        : null;
      if (settlement) {
        skipped += 1;
        continue;
      }
      const generation = reservation.generation;
      if (!generation || !generation.billingPeriodId) {
        const release = await aiPointLedgerService.release({
          userId: reservation.userId,
          projectId: reservation.projectId,
          billingPeriodId: reservation.billingPeriodId!,
          generationId: reservation.generationId!,
          actionKey: reservation.actionKey ?? 'unknown',
          reason: 'Stale reservation without generation',
          metadata: { sweptAt: new Date().toISOString() },
        });
        if (release) released += 1;
        continue;
      }

      if (generation.status === 'SUCCEEDED') {
        await aiPointLedgerService.capture({
          userId: generation.userId,
          projectId: generation.projectId,
          billingPeriodId: generation.billingPeriodId,
          generationId: generation.id,
          actionKey: reservation.actionKey ?? actionKeyForFeature(generation.featureCode),
          metadata: { capturedBySweeper: true },
        });
        captured += 1;
        continue;
      }

      if (generation.status === 'RUNNING' && generation.workflowRun?.status === 'RUNNING') {
        skipped += 1;
        continue;
      }

      if (generation.status === 'RUNNING' || generation.status === 'QUEUED') {
        await prisma.aIGeneration.update({
          where: { id: generation.id },
          data: {
            status: 'TIMEOUT',
            errorCode: 'STALE_AI_POINT_RESERVATION',
            errorMessage: 'Reservation expired before generation completed',
            finishedAt: new Date(),
          },
        });
      }
      const release = await aiPointLedgerService.release({
        userId: generation.userId,
        projectId: generation.projectId,
        billingPeriodId: generation.billingPeriodId,
        generationId: generation.id,
        actionKey: reservation.actionKey ?? actionKeyForFeature(generation.featureCode),
        reason: 'Stale reservation released by sweeper',
        metadata: { sweptAt: new Date().toISOString() } as Prisma.InputJsonValue,
      });
      if (release) released += 1;
    }
    return { checked: reservations.length, captured, released, skipped };
  },
};
