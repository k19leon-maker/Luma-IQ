import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { eventService } from './event.service';
import { projectService } from './project.service';
import { tasksService } from './tasks.service';

export const ONBOARDING_VERSION = 'b2b_v1';

export interface OnboardingData {
  projectName?: string;
  projectShortDescription?: string;
  targetAudience?: string;
  products?: string;
  strengths?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function setIfEmpty(target: Record<string, unknown>, key: string, value: unknown) {
  if (!nonEmpty(value)) return;
  if (nonEmpty(target[key])) return;
  target[key] = value.trim();
}

function buildAboutSummary(data: OnboardingData): string {
  const parts = [
    data.projectShortDescription,
    data.targetAudience ? `Аудитория: ${data.targetAudience}` : '',
    data.products ? `Продукты/услуги: ${data.products}` : '',
    data.strengths ? `Сильные стороны: ${data.strengths}` : '',
  ].filter(nonEmpty);
  return parts.join('\n\n');
}

async function resolveExistingProject(userId: string, projectId?: string | null) {
  if (projectId) {
    const project = await projectService.getOwned(userId, projectId);
    if (project) return project;
  }
  return prisma.project.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

async function ensureProject(userId: string, data: OnboardingData, preferredProjectId?: string | null) {
  const existing = await resolveExistingProject(userId, preferredProjectId);
  if (existing) {
    const patch: { name?: string; description?: string } = {};
    if (nonEmpty(data.projectName) && !nonEmpty(existing.name)) patch.name = data.projectName.trim();
    if (nonEmpty(data.projectShortDescription) && !nonEmpty(existing.description)) {
      patch.description = data.projectShortDescription.trim();
    }
    if (Object.keys(patch).length > 0) {
      return prisma.project.update({ where: { id: existing.id }, data: patch });
    }
    return existing;
  }

  return projectService.create(userId, {
    name: data.projectName?.trim() || 'Первый проект',
    description: data.projectShortDescription?.trim(),
  });
}

async function mapOnboardingToAbout(userId: string, projectId: string, data: OnboardingData) {
  const project = await projectService.getOwned(userId, projectId);
  if (!project) throw Object.assign(new Error('Проект не найден'), { status: 404 });

  const strategyData = asRecord(project.strategyData);
  const expertProfileData = asRecord(strategyData.expertProfileData);

  setIfEmpty(expertProfileData, 'whoYouAre', data.projectShortDescription);
  setIfEmpty(expertProfileData, 'targetAudience', data.targetAudience);
  setIfEmpty(expertProfileData, 'productsAndServices', data.products);
  setIfEmpty(expertProfileData, 'expertiseAndStrengths', data.strengths);

  setIfEmpty(expertProfileData, 'role', data.projectShortDescription);
  setIfEmpty(expertProfileData, 'niche', data.targetAudience);
  setIfEmpty(expertProfileData, 'productsAndPrices', data.products);
  setIfEmpty(expertProfileData, 'competencies', data.strengths);
  setIfEmpty(expertProfileData, 'summary', buildAboutSummary(data));

  expertProfileData.updatedAt = new Date().toISOString();
  strategyData.expertProfileData = expertProfileData;
  strategyData.onboardingData = {
    ...(asRecord(strategyData.onboardingData)),
    ...data,
    version: ONBOARDING_VERSION,
    updatedAt: new Date().toISOString(),
  };

  return prisma.project.update({
    where: { id: projectId },
    data: {
      description: nonEmpty(project.description)
        ? project.description
        : (data.projectShortDescription?.trim() || project.description),
      strategyData: strategyData as Prisma.InputJsonValue,
    },
  });
}

export const onboardingService = {
  async getState(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        onboardingStatus: true,
        onboardingStep: true,
        onboardingVersion: true,
        onboardingCompletedAt: true,
        onboardingData: true,
        recommendedRoute: true,
        createdProjectId: true,
        projects: { select: { id: true }, take: 1 },
      },
    });
    if (!user) throw Object.assign(new Error('Пользователь не найден'), { status: 404 });

    if (!user.onboardingStatus && user.projects.length > 0) {
      return {
        onboardingStatus: 'completed',
        onboardingStep: 5,
        onboardingVersion: ONBOARDING_VERSION,
        onboardingCompletedAt: null,
        onboardingData: null,
        recommendedRoute: '/app/tasks',
        createdProjectId: user.projects[0]?.id ?? null,
      };
    }

    return user;
  },

  async saveProgress(userId: string, step: number, data: OnboardingData) {
    const normalizedStep = Math.max(0, Math.min(5, Math.round(step)));
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingStatus: normalizedStep > 0 ? 'in_progress' : 'not_started',
        onboardingStep: normalizedStep,
        onboardingVersion: ONBOARDING_VERSION,
        onboardingData: data as Prisma.InputJsonValue,
      },
    });
    void eventService.track('onboarding_step_completed', {
      userId,
      metadata: { step: normalizedStep, onboardingVersion: ONBOARDING_VERSION },
    }).catch(() => {});
    if (normalizedStep === 1) {
      void eventService.track('onboarding_started', { userId, metadata: { onboardingVersion: ONBOARDING_VERSION } }).catch(() => {});
    }
    if (normalizedStep === 4) {
      void eventService.track('onboarding_tasks_preview_seen', { userId, metadata: { onboardingVersion: ONBOARDING_VERSION } }).catch(() => {});
    }
    return user;
  },

  async skip(userId: string, data: OnboardingData) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingStatus: 'skipped',
        onboardingStep: 1,
        onboardingVersion: ONBOARDING_VERSION,
        onboardingData: data as Prisma.InputJsonValue,
        recommendedRoute: '/app/strategy/about',
      },
    });
    void eventService.track('onboarding_skipped', { userId, metadata: { onboardingVersion: ONBOARDING_VERSION } }).catch(() => {});
    return user;
  },

  async complete(userId: string, data: OnboardingData, preferredProjectId?: string | null) {
    const project = await ensureProject(userId, data, preferredProjectId);
    void eventService.track('onboarding_project_created', {
      userId,
      metadata: { projectId: project.id, reusedExistingProject: project.createdAt < new Date(Date.now() - 1000) },
    }).catch(() => {});

    const updatedProject = await mapOnboardingToAbout(userId, project.id, data);
    let starterTasks: Awaited<ReturnType<typeof tasksService.ensureStarterTasks>> = { created: false, tasks: [] };
    let starterTasksError = false;
    try {
      starterTasks = await tasksService.ensureStarterTasks(userId, project.id);
    } catch (err) {
      starterTasksError = true;
      console.error('[Onboarding] starter tasks:', err);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingStatus: 'completed',
        onboardingStep: 5,
        onboardingVersion: ONBOARDING_VERSION,
        onboardingCompletedAt: new Date(),
        onboardingData: data as Prisma.InputJsonValue,
        recommendedRoute: '/app/tasks',
        createdProjectId: project.id,
      },
    });

    void eventService.track('onboarding_completed', {
      userId,
      metadata: {
        projectId: project.id,
        onboardingVersion: ONBOARDING_VERSION,
        starterTasksCreated: starterTasks.created,
      },
    }).catch(() => {});

    return {
      user,
      project: updatedProject,
      tasks: starterTasks.tasks,
      recommendedRoute: '/app/tasks',
      starterTasksCreated: starterTasks.created,
      starterTasksError,
    };
  },
};
