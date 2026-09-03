import { Prisma } from '@prisma/client';
import {
  ChatbotScenarioDefinitionV1,
  validateChatbotScenarioDefinition,
} from '../contracts/chatbot-scenario.contract';
import { prisma } from '../lib/prisma';
import { telegramBotService } from './telegram-bot.service';
import { telegramSecretService } from './telegram-secret.service';
import {
  calculateWaitUntil,
  matchRuntimeEntrypoint,
  parseTelegramRuntimeUpdate,
  renderTelegramTemplate,
  RuntimeEntrypointMatch,
  telegramDeliveryPayloadSchema,
  TelegramRuntimeTrigger,
  unconditionalNextNodeId,
} from './telegram-runtime-v2.logic';

type Tx = Prisma.TransactionClient;

interface ClaimedInboundUpdate {
  id: string;
  userId: string;
  botId: string;
  telegramUpdateId: string;
  payload: unknown;
}

interface ClaimedDelivery {
  id: string;
  userId: string;
  botId: string;
  subscriberId: string;
  enrollmentId: string | null;
  payload: unknown;
}

interface RuntimeScenario {
  id: string;
  publishedVersionId: string;
  definition: ChatbotScenarioDefinitionV1;
  entrypoint: RuntimeEntrypointMatch;
}

interface EnrollmentRuntime {
  id: string;
  userId: string;
  botId: string;
  subscriberId: string;
  scenarioId: string;
  scenarioVersionId: string;
  telegramChatId: string;
  state: Record<string, unknown>;
}

export interface TelegramRuntimeInboundResult {
  outcome: 'ignored' | 'subscriber_updated' | 'stopped' | 'blocked' | 'unblocked' | 'enrolled' | 'already_enrolled';
  subscriberId?: string;
  enrollmentId?: string;
}

export class TelegramRuntimeDataError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'TelegramRuntimeDataError';
    this.code = code;
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function upsertSubscriber(input: {
  userId: string;
  botId: string;
  telegramUserId: string;
  telegramChatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  source: string;
  startParameter: string | null;
}) {
  const where = {
    userId: input.userId,
    botId: input.botId,
    telegramUserId: input.telegramUserId,
  };
  const data = {
    telegramChatId: input.telegramChatId,
    username: input.username,
    firstName: input.firstName,
    lastName: input.lastName,
    languageCode: input.languageCode,
    status: 'ACTIVE' as const,
    source: input.source,
    ...(input.startParameter ? { startParameter: input.startParameter } : {}),
    lastSeenAt: new Date(),
    stoppedAt: null,
    blockedAt: null,
    archivedAt: null,
  };

  const existing = await prisma.botSubscriber.findFirst({ where });
  if (existing) {
    await prisma.botSubscriber.updateMany({
      where: { id: existing.id, ...where },
      data,
    });
    return { ...existing, ...data };
  }

  try {
    return await prisma.botSubscriber.create({
      data: {
        userId: input.userId,
        botId: input.botId,
        telegramUserId: input.telegramUserId,
        ...data,
      },
    });
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
    const raced = await prisma.botSubscriber.findFirst({ where });
    if (!raced) throw error;
    await prisma.botSubscriber.updateMany({
      where: { id: raced.id, ...where },
      data,
    });
    return { ...raced, ...data };
  }
}

async function findRuntimeScenario(
  userId: string,
  botId: string,
  trigger: TelegramRuntimeTrigger,
): Promise<RuntimeScenario | null> {
  const scenarios = await prisma.botScenario.findMany({
    where: {
      userId,
      botId,
      status: 'PUBLISHED',
      archivedAt: null,
      publishedVersionId: { not: null },
    },
    select: {
      id: true,
      publishedVersionId: true,
      publishedVersion: {
        select: { id: true, definition: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  for (const scenario of scenarios) {
    if (!scenario.publishedVersionId || !scenario.publishedVersion) continue;
    const validation = validateChatbotScenarioDefinition(scenario.publishedVersion.definition);
    if (!validation.valid || !validation.definition) continue;
    const entrypoint = matchRuntimeEntrypoint(validation.definition, trigger);
    if (entrypoint) {
      return {
        id: scenario.id,
        publishedVersionId: scenario.publishedVersion.id,
        definition: validation.definition,
        entrypoint,
      };
    }
  }
  return null;
}

function initialState(input: {
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
}): Record<string, unknown> {
  return {
    variables: {
      telegram_user_id: input.telegramUserId,
      username: input.username ?? '',
      first_name: input.firstName ?? '',
      last_name: input.lastName ?? '',
      language_code: input.languageCode ?? '',
    },
    goals: [],
  };
}

function stateVariables(state: Record<string, unknown>): Record<string, unknown> {
  return jsonObject(state.variables);
}

async function setEnrollmentPosition(
  tx: Tx,
  runtime: EnrollmentRuntime,
  data: Prisma.BotScenarioEnrollmentUpdateManyMutationInput,
): Promise<void> {
  const result = await tx.botScenarioEnrollment.updateMany({
    where: {
      id: runtime.id,
      userId: runtime.userId,
      botId: runtime.botId,
      subscriberId: runtime.subscriberId,
      scenarioId: runtime.scenarioId,
      scenarioVersionId: runtime.scenarioVersionId,
      status: { in: ['ACTIVE', 'WAITING'] },
    },
    data: { ...data, lastActivityAt: new Date() },
  });
  if (result.count !== 1) {
    throw new TelegramRuntimeDataError('Активный запуск сценария не найден', 'ENROLLMENT_NOT_ACTIVE');
  }
}

async function createScheduledAction(
  tx: Tx,
  runtime: EnrollmentRuntime,
  nodeId: string,
  scheduledAt: Date,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await tx.botMessageDelivery.createMany({
    data: [{
      userId: runtime.userId,
      botId: runtime.botId,
      subscriberId: runtime.subscriberId,
      enrollmentId: runtime.id,
      scenarioId: runtime.scenarioId,
      scenarioVersionId: runtime.scenarioVersionId,
      nodeId,
      idempotencyKey: `${runtime.id}:${nodeId}`,
      payload,
      scheduledAt,
      nextAttemptAt: scheduledAt,
      status: 'PENDING',
    }],
    skipDuplicates: true,
  });
  await setEnrollmentPosition(tx, runtime, {
    currentNodeId: nodeId,
    status: 'WAITING',
    nextActionAt: scheduledAt,
  });
}

async function ensureTag(tx: Tx, runtime: EnrollmentRuntime, name: string): Promise<string> {
  const existing = await tx.botTag.findFirst({
    where: { userId: runtime.userId, botId: runtime.botId, name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.botTag.upsert({
    where: { botId_name: { botId: runtime.botId, name } },
    create: { userId: runtime.userId, botId: runtime.botId, name },
    update: {},
    select: { id: true, userId: true },
  });
  if (created.userId !== runtime.userId) {
    throw new TelegramRuntimeDataError('Метка принадлежит другому владельцу', 'TAG_OWNER_MISMATCH');
  }
  return created.id;
}

async function subscriberTags(tx: Tx, runtime: EnrollmentRuntime): Promise<Set<string>> {
  const rows = await tx.botSubscriberTag.findMany({
    where: {
      subscriberId: runtime.subscriberId,
      subscriber: { userId: runtime.userId, botId: runtime.botId },
      tag: { userId: runtime.userId, botId: runtime.botId },
    },
    select: { tag: { select: { name: true } } },
  });
  return new Set(rows.map((row) => row.tag.name));
}

async function conditionMatches(
  tx: Tx,
  runtime: EnrollmentRuntime,
  condition: NonNullable<ChatbotScenarioDefinitionV1['edges'][number]['condition']>,
): Promise<boolean> {
  const variables = stateVariables(runtime.state);
  switch (condition.type) {
    case 'field_exists':
      return variables[condition.field] !== undefined && variables[condition.field] !== null && variables[condition.field] !== '';
    case 'field_equals':
      return variables[condition.field] === condition.value;
    case 'tag_present':
      return (await subscriberTags(tx, runtime)).has(condition.tag);
    case 'tag_absent':
      return !(await subscriberTags(tx, runtime)).has(condition.tag);
    default:
      return false;
  }
}

async function conditionNextNodeId(
  tx: Tx,
  runtime: EnrollmentRuntime,
  definition: ChatbotScenarioDefinitionV1,
  nodeId: string,
): Promise<string | null> {
  const outgoing = definition.edges.filter((edge) => edge.fromNodeId === nodeId);
  for (const edge of outgoing) {
    if (edge.condition && await conditionMatches(tx, runtime, edge.condition)) return edge.toNodeId;
  }
  return outgoing.find((edge) => !edge.condition)?.toNodeId ?? null;
}

async function scheduleNode(
  tx: Tx,
  runtime: EnrollmentRuntime,
  definition: ChatbotScenarioDefinitionV1,
  nodeId: string | null,
  scheduledAt: Date,
  depth = 0,
): Promise<void> {
  if (depth > definition.nodes.length + 1) {
    throw new TelegramRuntimeDataError('Превышен безопасный лимит переходов', 'SCENARIO_TRANSITION_LIMIT');
  }
  if (!nodeId) {
    await setEnrollmentPosition(tx, runtime, {
      currentNodeId: null,
      status: 'COMPLETED',
      nextActionAt: null,
      completedAt: new Date(),
    });
    return;
  }
  const node = definition.nodes.find((item) => item.id === nodeId);
  if (!node) throw new TelegramRuntimeDataError(`Узел ${nodeId} не найден`, 'SCENARIO_NODE_NOT_FOUND');

  if (node.type === 'wait') {
    const resumeAt = calculateWaitUntil(node.schedule, scheduledAt);
    const nextNodeId = unconditionalNextNodeId(definition, node.id);
    if (!nextNodeId) throw new TelegramRuntimeDataError('После ожидания отсутствует переход', 'WAIT_NEXT_NODE_MISSING');
    await createScheduledAction(tx, runtime, node.id, resumeAt, {
      kind: 'resume',
      targetNodeId: nextNodeId,
    });
    return;
  }

  if (node.type === 'send_message' || node.type === 'handoff' || node.type === 'collect_input') {
    const variables = stateVariables(runtime.state);
    const text = renderTelegramTemplate(node.type === 'collect_input' ? node.prompt : node.text, variables);
    const buttons = 'buttons' in node ? node.buttons ?? [] : [];
    const waitsForInteraction = node.type === 'collect_input'
      || buttons.some((button) => button.type === 'callback');
    await createScheduledAction(tx, runtime, node.id, scheduledAt, {
      kind: 'send_message',
      chatId: runtime.telegramChatId,
      text,
      parseMode: 'parseMode' in node ? node.parseMode : 'plain',
      disableWebPreview: 'disableWebPreview' in node ? node.disableWebPreview : false,
      buttons,
      nextNodeId: waitsForInteraction ? null : unconditionalNextNodeId(definition, node.id),
      waitsForInteraction,
    });
    return;
  }

  if (node.type === 'add_tag') {
    const tagId = await ensureTag(tx, runtime, node.tag);
    await tx.botSubscriberTag.createMany({
      data: [{ subscriberId: runtime.subscriberId, tagId, source: 'runtime' }],
      skipDuplicates: true,
    });
    await scheduleNode(tx, runtime, definition, unconditionalNextNodeId(definition, node.id), scheduledAt, depth + 1);
    return;
  }

  if (node.type === 'remove_tag') {
    const tag = await tx.botTag.findFirst({
      where: { userId: runtime.userId, botId: runtime.botId, name: node.tag },
      select: { id: true },
    });
    if (tag) {
      await tx.botSubscriberTag.deleteMany({
        where: {
          subscriberId: runtime.subscriberId,
          tagId: tag.id,
          subscriber: { userId: runtime.userId, botId: runtime.botId },
        },
      });
    }
    await scheduleNode(tx, runtime, definition, unconditionalNextNodeId(definition, node.id), scheduledAt, depth + 1);
    return;
  }

  if (node.type === 'set_field') {
    const variables = stateVariables(runtime.state);
    const value = typeof node.value === 'string' ? renderTelegramTemplate(node.value, variables) : node.value;
    runtime.state = { ...runtime.state, variables: { ...variables, [node.field]: value } };
    const subscriberField = {
      first_name: 'firstName',
      last_name: 'lastName',
      phone: 'phone',
      email: 'email',
    }[node.field] as 'firstName' | 'lastName' | 'phone' | 'email' | undefined;
    if (subscriberField) {
      await tx.botSubscriber.updateMany({
        where: { id: runtime.subscriberId, userId: runtime.userId, botId: runtime.botId },
        data: { [subscriberField]: String(value) },
      });
    }
    await setEnrollmentPosition(tx, runtime, { state: runtime.state as Prisma.InputJsonValue });
    await scheduleNode(tx, runtime, definition, unconditionalNextNodeId(definition, node.id), scheduledAt, depth + 1);
    return;
  }

  if (node.type === 'goal') {
    const goals = Array.isArray(runtime.state.goals) ? runtime.state.goals : [];
    runtime.state = { ...runtime.state, goals: [...new Set([...goals.map(String), node.goalKey])] };
    await setEnrollmentPosition(tx, runtime, { state: runtime.state as Prisma.InputJsonValue });
    await scheduleNode(tx, runtime, definition, unconditionalNextNodeId(definition, node.id), scheduledAt, depth + 1);
    return;
  }

  if (node.type === 'condition') {
    await scheduleNode(tx, runtime, definition, await conditionNextNodeId(tx, runtime, definition, node.id), scheduledAt, depth + 1);
    return;
  }

  if (node.type === 'end') {
    await setEnrollmentPosition(tx, runtime, {
      currentNodeId: node.id,
      status: 'COMPLETED',
      nextActionAt: null,
      completedAt: new Date(),
    });
    return;
  }

  throw new TelegramRuntimeDataError(
    `Тип узла ${node.type} ещё не поддерживается Runtime v1`,
    'SCENARIO_NODE_UNSUPPORTED',
  );
}

async function stopSubscriber(userId: string, botId: string, subscriberId: string, status: 'STOPPED' | 'BLOCKED') {
  const timestamp = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.botSubscriber.updateMany({
      where: { id: subscriberId, userId, botId },
      data: status === 'BLOCKED'
        ? { status, blockedAt: timestamp, stoppedAt: timestamp }
        : { status, stoppedAt: timestamp },
    });
    await tx.botScenarioEnrollment.updateMany({
      where: { userId, botId, subscriberId, status: { in: ['ACTIVE', 'WAITING'] } },
      data: { status: 'STOPPED', stoppedAt: timestamp, nextActionAt: null },
    });
    await tx.botMessageDelivery.updateMany({
      where: { userId, botId, subscriberId, status: 'PENDING' },
      data: { status: 'CANCELLED', failedAt: timestamp, nextAttemptAt: null },
    });
  });
}

export const telegramRuntimeV2Service = {
  async processInboundUpdate(update: ClaimedInboundUpdate): Promise<TelegramRuntimeInboundResult> {
    const bot = await prisma.telegramBot.findFirst({
      where: { id: update.botId, userId: update.userId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!bot) return { outcome: 'ignored' };

    const parsed = parseTelegramRuntimeUpdate(update.payload);
    if (!parsed || parsed.telegramUpdateId !== update.telegramUpdateId) return { outcome: 'ignored' };

    if (parsed.trigger.type === 'blocked') {
      const subscriber = await prisma.botSubscriber.findFirst({
        where: { userId: update.userId, botId: update.botId, telegramUserId: parsed.telegramUserId },
        select: { id: true },
      });
      if (subscriber) await stopSubscriber(update.userId, update.botId, subscriber.id, 'BLOCKED');
      return { outcome: 'blocked', subscriberId: subscriber?.id };
    }

    const subscriber = await upsertSubscriber({
      userId: update.userId,
      botId: update.botId,
      telegramUserId: parsed.telegramUserId,
      telegramChatId: parsed.telegramChatId,
      username: parsed.username,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      languageCode: parsed.languageCode,
      source: parsed.trigger.type === 'start' ? 'telegram_start' : 'telegram_message',
      startParameter: parsed.trigger.type === 'start' ? parsed.trigger.parameter : null,
    });

    if (parsed.trigger.type === 'unblocked') {
      return { outcome: 'unblocked', subscriberId: subscriber.id };
    }
    if (parsed.trigger.type === 'stop') {
      await stopSubscriber(update.userId, update.botId, subscriber.id, 'STOPPED');
      return { outcome: 'stopped', subscriberId: subscriber.id };
    }

    const scenario = await findRuntimeScenario(update.userId, update.botId, parsed.trigger);
    if (!scenario) return { outcome: 'subscriber_updated', subscriberId: subscriber.id };

    const enrollmentResult = await prisma.$transaction(async (tx) => {
      const byTrigger = await tx.botScenarioEnrollment.findFirst({
        where: {
          userId: update.userId,
          botId: update.botId,
          scenarioId: scenario.id,
          triggerUpdateId: update.telegramUpdateId,
        },
        select: { id: true },
      });
      if (byTrigger) return { id: byTrigger.id, existing: true };

      const active = await tx.botScenarioEnrollment.findFirst({
        where: {
          userId: update.userId,
          botId: update.botId,
          subscriberId: subscriber.id,
          scenarioId: scenario.id,
          status: { in: ['ACTIVE', 'WAITING'] },
        },
        select: { id: true },
      });
      if (active) return { id: active.id, existing: true };

      const state = initialState(parsed);
      const enrollment = await tx.botScenarioEnrollment.create({
        data: {
          userId: update.userId,
          botId: update.botId,
          subscriberId: subscriber.id,
          scenarioId: scenario.id,
          scenarioVersionId: scenario.publishedVersionId,
          triggerUpdateId: update.telegramUpdateId,
          entrypointId: scenario.entrypoint.entrypointId,
          source: scenario.entrypoint.source,
          startParameter: scenario.entrypoint.startParameter,
          currentNodeId: scenario.entrypoint.targetNodeId,
          state: state as Prisma.InputJsonValue,
          status: 'ACTIVE',
        },
      });
      const runtime: EnrollmentRuntime = {
        id: enrollment.id,
        userId: update.userId,
        botId: update.botId,
        subscriberId: subscriber.id,
        scenarioId: scenario.id,
        scenarioVersionId: scenario.publishedVersionId,
        telegramChatId: parsed.telegramChatId,
        state,
      };
      await scheduleNode(tx, runtime, scenario.definition, scenario.entrypoint.targetNodeId, new Date());
      return { id: enrollment.id, existing: false };
    });

    return {
      outcome: enrollmentResult.existing ? 'already_enrolled' : 'enrolled',
      subscriberId: subscriber.id,
      enrollmentId: enrollmentResult.id,
    };
  },

  async processDelivery(delivery: ClaimedDelivery): Promise<{ telegramMessageId: string | null }> {
    if (!delivery.enrollmentId) {
      throw new TelegramRuntimeDataError('У доставки отсутствует запуск сценария', 'DELIVERY_ENROLLMENT_MISSING');
    }
    const parsedPayload = telegramDeliveryPayloadSchema.safeParse(delivery.payload);
    if (!parsedPayload.success) {
      throw new TelegramRuntimeDataError('Некорректная нагрузка доставки', 'DELIVERY_PAYLOAD_INVALID');
    }
    const payload = parsedPayload.data;

    const enrollment = await prisma.botScenarioEnrollment.findFirst({
      where: {
        id: delivery.enrollmentId,
        userId: delivery.userId,
        botId: delivery.botId,
        subscriberId: delivery.subscriberId,
        status: { in: ['ACTIVE', 'WAITING'] },
      },
      select: {
        id: true,
        userId: true,
        botId: true,
        subscriberId: true,
        scenarioId: true,
        scenarioVersionId: true,
        state: true,
        subscriber: { select: { telegramChatId: true } },
        scenarioVersion: { select: { definition: true } },
      },
    });
    if (!enrollment) throw new TelegramRuntimeDataError('Активный запуск не найден', 'ENROLLMENT_NOT_ACTIVE');
    const validation = validateChatbotScenarioDefinition(enrollment.scenarioVersion.definition);
    if (!validation.valid || !validation.definition) {
      throw new TelegramRuntimeDataError('Опубликованный сценарий не прошёл валидацию', 'SCENARIO_DEFINITION_INVALID');
    }
    const telegramChatId = enrollment.subscriber.telegramChatId;
    if (!telegramChatId) throw new TelegramRuntimeDataError('Telegram chat id не сохранён', 'SUBSCRIBER_CHAT_ID_MISSING');
    const runtime: EnrollmentRuntime = {
      id: enrollment.id,
      userId: enrollment.userId,
      botId: enrollment.botId,
      subscriberId: enrollment.subscriberId,
      scenarioId: enrollment.scenarioId,
      scenarioVersionId: enrollment.scenarioVersionId,
      telegramChatId,
      state: jsonObject(enrollment.state),
    };

    if (payload.kind === 'resume') {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.botMessageDelivery.updateMany({
          where: { id: delivery.id, userId: delivery.userId, botId: delivery.botId, status: 'PROCESSING' },
          data: { status: 'SENT', sentAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
        });
        if (changed.count !== 1) throw new TelegramRuntimeDataError('Доставка уже обработана', 'DELIVERY_NOT_PROCESSING');
        await scheduleNode(tx, runtime, validation.definition!, payload.targetNodeId, new Date());
      });
      return { telegramMessageId: null };
    }

    const bot = await prisma.telegramBot.findFirst({
      where: { id: delivery.botId, userId: delivery.userId, status: 'ACTIVE', deletedAt: null },
      select: { encryptedToken: true },
    });
    if (!bot?.encryptedToken) throw new TelegramRuntimeDataError('Токен бота недоступен', 'BOT_TOKEN_UNAVAILABLE');
    const token = telegramSecretService.decrypt(bot.encryptedToken);
    const result = await telegramBotService.sendMessage({
      token,
      chatId: payload.chatId,
      text: payload.text,
      parseMode: payload.parseMode === 'plain' ? undefined : payload.parseMode,
      disableWebPreview: payload.disableWebPreview,
      buttons: payload.buttons,
    });

    await prisma.$transaction(async (tx) => {
      const changed = await tx.botMessageDelivery.updateMany({
        where: { id: delivery.id, userId: delivery.userId, botId: delivery.botId, status: 'PROCESSING' },
        data: {
          status: 'SENT',
          telegramMessageId: result.messageId,
          sentAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          nextAttemptAt: null,
          lastErrorCode: null,
          lastError: null,
        },
      });
      if (changed.count !== 1) {
        throw new TelegramRuntimeDataError('Результат отправки требует ручной сверки', 'DELIVERY_OUTCOME_UNKNOWN');
      }
      if (payload.waitsForInteraction) {
        await setEnrollmentPosition(tx, runtime, { status: 'WAITING', nextActionAt: null });
      } else {
        await scheduleNode(tx, runtime, validation.definition!, payload.nextNodeId, new Date());
      }
    });
    return { telegramMessageId: result.messageId };
  },
};
