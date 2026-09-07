import { randomUUID } from 'crypto';
import { BotAssetMediaType, Prisma } from '@prisma/client';
import {
  ChatbotScenarioDefinitionV1,
  ChatbotScenarioNode,
  validateChatbotScenarioDefinition,
} from '../contracts/chatbot-scenario.contract';
import { prisma } from '../lib/prisma';
import { telegramBotService } from './telegram-bot.service';
import { telegramBotAssetService } from './telegram-bot-asset.service';
import { telegramSecretService } from './telegram-secret.service';
import { telegramTestRecipientService } from './telegram-test-recipient.service';
import {
  calculateWaitUntil,
  collectInputButtons,
  matchRuntimeEntrypoint,
  parseTelegramRuntimeUpdate,
  parseCollectedInput,
  ParsedTelegramRuntimeUpdate,
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
  nodeId: string;
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
  outcome: 'ignored' | 'subscriber_updated' | 'test_recipient_verified' | 'stopped' | 'blocked' | 'unblocked' | 'enrolled' | 'already_enrolled' | 'interaction_processed' | 'interaction_rejected';
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
  reactivate: boolean;
}) {
  const where = {
    userId: input.userId,
    botId: input.botId,
    telegramUserId: input.telegramUserId,
  };
  const profileData = {
    telegramChatId: input.telegramChatId,
    username: input.username,
    firstName: input.firstName,
    lastName: input.lastName,
    languageCode: input.languageCode,
    source: input.source,
    ...(input.startParameter ? { startParameter: input.startParameter } : {}),
    lastSeenAt: new Date(),
    archivedAt: null,
  };
  const lifecycleData = input.reactivate
    ? { status: 'ACTIVE' as const, stoppedAt: null, blockedAt: null }
    : {};
  const data = { ...profileData, ...lifecycleData };

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
        status: 'ACTIVE',
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

  const candidates: Array<Omit<RuntimeScenario, 'entrypoint'>> = [];
  for (const scenario of scenarios) {
    if (!scenario.publishedVersionId || !scenario.publishedVersion) continue;
    const validation = validateChatbotScenarioDefinition(scenario.publishedVersion.definition);
    if (!validation.valid || !validation.definition) continue;
    candidates.push({
      id: scenario.id,
      publishedVersionId: scenario.publishedVersion.id,
      definition: validation.definition,
    });
  }

  // A generic /start in a recently edited scenario must not steal a deep link
  // from another published scenario that owns the exact start parameter.
  if (trigger.type === 'start' && trigger.parameter) {
    for (const scenario of candidates) {
      const entrypoint = matchRuntimeEntrypoint(scenario.definition, trigger);
      if (entrypoint?.source === 'telegram_deep_link') return { ...scenario, entrypoint };
    }
  }

  for (const scenario of candidates) {
    const entrypoint = matchRuntimeEntrypoint(scenario.definition, trigger);
    if (entrypoint) {
      return { ...scenario, entrypoint };
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

async function recordBotEvent(
  tx: Tx,
  input: {
    userId: string;
    botId: string;
    subscriberId?: string;
    enrollmentId?: string;
    scenarioId?: string;
    eventType: string;
    nodeId?: string;
    sourceId?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.botEvent.createMany({
    data: [{
      userId: input.userId,
      botId: input.botId,
      subscriberId: input.subscriberId,
      enrollmentId: input.enrollmentId,
      scenarioId: input.scenarioId,
      eventType: input.eventType,
      nodeId: input.nodeId,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    }],
    skipDuplicates: true,
  });
}

async function recordEnrollmentEvent(
  tx: Tx,
  runtime: EnrollmentRuntime,
  eventType: string,
  options?: {
    nodeId?: string;
    sourceId?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await recordBotEvent(tx, {
    userId: runtime.userId,
    botId: runtime.botId,
    subscriberId: runtime.subscriberId,
    enrollmentId: runtime.id,
    scenarioId: runtime.scenarioId,
    eventType,
    ...options,
  });
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
  idempotencySuffix?: string,
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
      idempotencyKey: `${runtime.id}:${nodeId}${idempotencySuffix ? `:${idempotencySuffix}` : ''}`,
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
  interaction?: { answer?: string | number; callbackData?: string },
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
    case 'answer_equals': {
      if (interaction?.answer === undefined) return false;
      const actual = String(interaction.answer);
      return condition.caseSensitive
        ? actual === condition.value
        : actual.toLocaleLowerCase('ru-RU') === condition.value.toLocaleLowerCase('ru-RU');
    }
    case 'answer_contains': {
      if (interaction?.answer === undefined) return false;
      const actual = String(interaction.answer);
      return condition.caseSensitive
        ? actual.includes(condition.value)
        : actual.toLocaleLowerCase('ru-RU').includes(condition.value.toLocaleLowerCase('ru-RU'));
    }
    case 'button_callback':
      return interaction?.callbackData === condition.callbackData;
    default:
      return false;
  }
}

async function conditionNextNodeId(
  tx: Tx,
  runtime: EnrollmentRuntime,
  definition: ChatbotScenarioDefinitionV1,
  nodeId: string,
  interaction?: { answer?: string | number; callbackData?: string },
): Promise<string | null> {
  const outgoing = definition.edges.filter((edge) => edge.fromNodeId === nodeId);
  for (const edge of outgoing) {
    if (edge.condition && await conditionMatches(tx, runtime, edge.condition, interaction)) return edge.toNodeId;
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
  await recordEnrollmentEvent(tx, runtime, 'STEP_ENTERED', {
    nodeId: node.id,
    idempotencyKey: `${runtime.id}:step:${node.id}`,
    metadata: { nodeType: node.type },
  });

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
    const buttons = node.type === 'collect_input' && node.inputType === 'choice'
      ? collectInputButtons(node.choices ?? [])
      : 'buttons' in node ? node.buttons ?? [] : [];
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

  if (node.type === 'send_media') {
    const variables = stateVariables(runtime.state);
    const caption = node.caption ? renderTelegramTemplate(node.caption, variables) : '';
    const buttons = node.buttons ?? [];
    const waitsForInteraction = buttons.some((button) => button.type === 'callback');
    await createScheduledAction(tx, runtime, node.id, scheduledAt, {
      kind: 'send_media',
      chatId: runtime.telegramChatId,
      mediaType: node.mediaType,
      assetId: node.assetId,
      caption,
      parseMode: node.parseMode,
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
    await recordEnrollmentEvent(tx, runtime, 'GOAL_REACHED', {
      nodeId: node.id,
      idempotencyKey: `${runtime.id}:goal:${node.goalKey}`,
      metadata: { goalKey: node.goalKey },
    });
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

  throw new TelegramRuntimeDataError('Тип узла не поддерживается Runtime v1', 'SCENARIO_NODE_UNSUPPORTED');
}

function writableSubscriberField(field: string): 'firstName' | 'lastName' | 'phone' | 'email' | undefined {
  return {
    first_name: 'firstName',
    last_name: 'lastName',
    phone: 'phone',
    email: 'email',
  }[field] as 'firstName' | 'lastName' | 'phone' | 'email' | undefined;
}

function isInteractionNode(
  node: ChatbotScenarioNode,
  parsed: ParsedTelegramRuntimeUpdate,
  definition: ChatbotScenarioDefinitionV1,
): boolean {
  if (node.type === 'collect_input') {
    return parsed.trigger.type === 'keyword'
      || parsed.trigger.type === 'message'
      || (parsed.trigger.type === 'callback' && node.inputType === 'choice' && parsed.trigger.data.startsWith('lqci:'));
  }
  if ((node.type === 'send_message' || node.type === 'send_media' || node.type === 'handoff') && parsed.trigger.type === 'callback') {
    const callbackData = parsed.trigger.data;
    return definition.edges.some((edge) => (
      edge.fromNodeId === node.id
      && edge.condition?.type === 'button_callback'
      && edge.condition.callbackData === callbackData
    ));
  }
  return false;
}

async function continueWaitingEnrollment(input: {
  update: ClaimedInboundUpdate;
  parsed: ParsedTelegramRuntimeUpdate;
  subscriberId: string;
}): Promise<TelegramRuntimeInboundResult | null> {
  if (!['keyword', 'message', 'callback'].includes(input.parsed.trigger.type)) return null;

  const candidates = await prisma.botScenarioEnrollment.findMany({
    where: {
      userId: input.update.userId,
      botId: input.update.botId,
      subscriberId: input.subscriberId,
      status: 'WAITING',
      currentNodeId: { not: null },
    },
    select: {
      id: true,
      userId: true,
      botId: true,
      subscriberId: true,
      scenarioId: true,
      scenarioVersionId: true,
      currentNodeId: true,
      state: true,
      scenarioVersion: { select: { definition: true } },
    },
    orderBy: { lastActivityAt: 'desc' },
    take: 10,
  });

  const candidate = candidates.find((item) => {
    if (!item.currentNodeId) return false;
    const validation = validateChatbotScenarioDefinition(item.scenarioVersion.definition);
    if (!validation.valid || !validation.definition) return false;
    const node = validation.definition.nodes.find((entry) => entry.id === item.currentNodeId);
    return Boolean(node && isInteractionNode(node, input.parsed, validation.definition));
  });
  if (!candidate?.currentNodeId) return null;

  return prisma.$transaction(async (tx) => {
    const current = await tx.botScenarioEnrollment.findFirst({
      where: {
        id: candidate.id,
        userId: input.update.userId,
        botId: input.update.botId,
        subscriberId: input.subscriberId,
        status: 'WAITING',
        currentNodeId: candidate.currentNodeId,
      },
      select: {
        id: true,
        userId: true,
        botId: true,
        subscriberId: true,
        scenarioId: true,
        scenarioVersionId: true,
        currentNodeId: true,
        state: true,
        subscriber: { select: { telegramChatId: true } },
        scenarioVersion: { select: { definition: true } },
      },
    });
    if (!current?.currentNodeId || !current.subscriber.telegramChatId) return null;

    const state = jsonObject(current.state);
    if (state.lastInboundUpdateId === input.update.telegramUpdateId) {
      return {
        outcome: 'interaction_processed',
        subscriberId: current.subscriberId,
        enrollmentId: current.id,
      };
    }

    const validation = validateChatbotScenarioDefinition(current.scenarioVersion.definition);
    if (!validation.valid || !validation.definition) {
      throw new TelegramRuntimeDataError('Опубликованный сценарий не прошёл валидацию', 'SCENARIO_DEFINITION_INVALID');
    }
    const definition = validation.definition;
    const node = definition.nodes.find((entry) => entry.id === current.currentNodeId);
    if (!node || !isInteractionNode(node, input.parsed, definition)) return null;

    const claimed = await tx.botScenarioEnrollment.updateMany({
      where: {
        id: current.id,
        userId: current.userId,
        botId: current.botId,
        subscriberId: current.subscriberId,
        status: 'WAITING',
        currentNodeId: current.currentNodeId,
      },
      data: { status: 'ACTIVE', lastActivityAt: new Date() },
    });
    if (claimed.count !== 1) return null;

    const runtime: EnrollmentRuntime = {
      id: current.id,
      userId: current.userId,
      botId: current.botId,
      subscriberId: current.subscriberId,
      scenarioId: current.scenarioId,
      scenarioVersionId: current.scenarioVersionId,
      telegramChatId: current.subscriber.telegramChatId,
      state,
    };

    if (node.type === 'collect_input') {
      const collected = parseCollectedInput(node, input.parsed.trigger);
      runtime.state = { ...state, lastInboundUpdateId: input.update.telegramUpdateId };
      await setEnrollmentPosition(tx, runtime, { state: runtime.state as Prisma.InputJsonValue });

      if (!collected.valid) {
        await recordEnrollmentEvent(tx, runtime, 'INPUT_REJECTED', {
          nodeId: node.id,
          sourceId: input.update.telegramUpdateId,
          idempotencyKey: `${runtime.id}:input-rejected:${input.update.telegramUpdateId}`,
          metadata: { field: node.field, inputType: node.inputType },
        });
        const buttons = node.inputType === 'choice' ? collectInputButtons(node.choices ?? []) : [];
        await createScheduledAction(tx, runtime, node.id, new Date(), {
          kind: 'send_message',
          chatId: runtime.telegramChatId,
          text: `${collected.message}\n\n${renderTelegramTemplate(node.prompt, stateVariables(state))}`,
          parseMode: 'plain',
          disableWebPreview: false,
          buttons,
          nextNodeId: null,
          waitsForInteraction: true,
        }, `retry-${input.update.telegramUpdateId}`);
        return {
          outcome: 'interaction_rejected',
          subscriberId: current.subscriberId,
          enrollmentId: current.id,
        };
      }

      const variables = stateVariables(state);
      runtime.state = {
        ...runtime.state,
        variables: { ...variables, [node.field]: collected.value },
        lastAnswer: collected.value,
      };
      const subscriberField = writableSubscriberField(node.field);
      if (subscriberField) {
        await tx.botSubscriber.updateMany({
          where: { id: current.subscriberId, userId: current.userId, botId: current.botId },
          data: { [subscriberField]: String(collected.value) },
        });
      }
      await setEnrollmentPosition(tx, runtime, { state: runtime.state as Prisma.InputJsonValue });
      await recordEnrollmentEvent(tx, runtime, 'INPUT_COLLECTED', {
        nodeId: node.id,
        sourceId: input.update.telegramUpdateId,
        idempotencyKey: `${runtime.id}:input:${input.update.telegramUpdateId}`,
        metadata: { field: node.field, inputType: node.inputType },
      });
      const nextNodeId = await conditionNextNodeId(tx, runtime, definition, node.id, { answer: collected.value });
      await scheduleNode(tx, runtime, definition, nextNodeId, new Date());
    } else if (input.parsed.trigger.type === 'callback') {
      runtime.state = {
        ...state,
        lastInboundUpdateId: input.update.telegramUpdateId,
        lastCallbackData: input.parsed.trigger.data,
      };
      await setEnrollmentPosition(tx, runtime, { state: runtime.state as Prisma.InputJsonValue });
      await recordEnrollmentEvent(tx, runtime, 'BUTTON_CLICKED', {
        nodeId: node.id,
        sourceId: input.update.telegramUpdateId,
        idempotencyKey: `${runtime.id}:callback:${input.update.telegramUpdateId}`,
      });
      const nextNodeId = await conditionNextNodeId(tx, runtime, definition, node.id, {
        callbackData: input.parsed.trigger.data,
      });
      await scheduleNode(tx, runtime, definition, nextNodeId, new Date());
    }

    return {
      outcome: 'interaction_processed',
      subscriberId: current.subscriberId,
      enrollmentId: current.id,
    };
  });
}

async function acknowledgeCallback(
  encryptedToken: string | null,
  parsed: ParsedTelegramRuntimeUpdate,
  rejected: boolean,
): Promise<void> {
  if (parsed.trigger.type !== 'callback' || !encryptedToken) return;
  try {
    await telegramBotService.answerCallbackQuery({
      token: telegramSecretService.decrypt(encryptedToken),
      callbackQueryId: parsed.trigger.callbackQueryId,
      ...(rejected ? { text: 'Кнопка больше не активна.' } : {}),
    });
  } catch {
    console.warn('[TelegramRuntimeV2] callback acknowledgement failed', {
      telegramUpdateId: parsed.telegramUpdateId,
    });
  }
}

async function stopSubscriber(
  userId: string,
  botId: string,
  subscriberId: string,
  status: 'STOPPED' | 'BLOCKED',
  sourceId: string,
) {
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
    await recordBotEvent(tx, {
      userId,
      botId,
      subscriberId,
      eventType: status === 'BLOCKED' ? 'SUBSCRIBER_BLOCKED' : 'SUBSCRIBER_STOPPED',
      sourceId,
      idempotencyKey: `subscriber:${subscriberId}:${sourceId}:${status.toLocaleLowerCase('en-US')}`,
    });
  });
}

export async function recordTelegramRuntimeErrorEvent(input: {
  userId: string;
  botId: string;
  subscriberId?: string;
  enrollmentId?: string | null;
  scenarioId?: string | null;
  sourceId: string;
  queue: 'inbound' | 'delivery';
  code: string;
}): Promise<void> {
  await prisma.botEvent.createMany({
    data: [{
      userId: input.userId,
      botId: input.botId,
      subscriberId: input.subscriberId,
      enrollmentId: input.enrollmentId ?? undefined,
      scenarioId: input.scenarioId ?? undefined,
      eventType: 'RUNTIME_ERROR',
      sourceId: input.sourceId,
      idempotencyKey: `error:${input.queue}:${input.sourceId}:${input.code}`,
      metadata: { queue: input.queue, code: input.code },
    }],
    skipDuplicates: true,
  });
}

export const telegramRuntimeV2Service = {
  async processInboundUpdate(update: ClaimedInboundUpdate): Promise<TelegramRuntimeInboundResult> {
    const bot = await prisma.telegramBot.findFirst({
      where: { id: update.botId, userId: update.userId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, encryptedToken: true },
    });
    if (!bot) return { outcome: 'ignored' };

    const parsed = parseTelegramRuntimeUpdate(update.payload);
    if (!parsed || parsed.telegramUpdateId !== update.telegramUpdateId) return { outcome: 'ignored' };

    if (parsed.trigger.type === 'blocked') {
      const subscriber = await prisma.botSubscriber.findFirst({
        where: { userId: update.userId, botId: update.botId, telegramUserId: parsed.telegramUserId },
        select: { id: true },
      });
      if (subscriber) await stopSubscriber(
        update.userId,
        update.botId,
        subscriber.id,
        'BLOCKED',
        update.telegramUpdateId,
      );
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
      source: parsed.trigger.type === 'start'
        ? 'telegram_start'
        : parsed.trigger.type === 'callback'
          ? 'telegram_callback'
          : 'telegram_message',
      startParameter: parsed.trigger.type === 'start' ? parsed.trigger.parameter : null,
      reactivate: parsed.trigger.type === 'start' || parsed.trigger.type === 'unblocked',
    });

    if (parsed.trigger.type === 'start'
      && telegramTestRecipientService.isVerificationStartParameter(parsed.trigger.parameter)) {
      const verified = await telegramTestRecipientService.consumeVerification({
        userId: update.userId,
        botId: update.botId,
        subscriberId: subscriber.id,
        telegramUserId: parsed.telegramUserId,
        telegramChatId: parsed.telegramChatId,
        startParameter: parsed.trigger.parameter,
      });
      return {
        outcome: verified ? 'test_recipient_verified' : 'subscriber_updated',
        subscriberId: subscriber.id,
      };
    }

    if (parsed.trigger.type === 'unblocked') {
      await prisma.botEvent.createMany({
        data: [{
          userId: update.userId,
          botId: update.botId,
          subscriberId: subscriber.id,
          eventType: 'SUBSCRIBER_UNBLOCKED',
          sourceId: update.telegramUpdateId,
          idempotencyKey: `subscriber:${subscriber.id}:${update.telegramUpdateId}:unblocked`,
        }],
        skipDuplicates: true,
      });
      return { outcome: 'unblocked', subscriberId: subscriber.id };
    }
    if (parsed.trigger.type === 'stop') {
      await stopSubscriber(
        update.userId,
        update.botId,
        subscriber.id,
        'STOPPED',
        update.telegramUpdateId,
      );
      return { outcome: 'stopped', subscriberId: subscriber.id };
    }
    if (subscriber.status === 'STOPPED' || subscriber.status === 'BLOCKED') {
      if (parsed.trigger.type === 'callback') {
        await acknowledgeCallback(bot.encryptedToken, parsed, true);
      }
      return { outcome: 'subscriber_updated', subscriberId: subscriber.id };
    }

    const interaction = await continueWaitingEnrollment({
      update,
      parsed,
      subscriberId: subscriber.id,
    });
    if (parsed.trigger.type === 'callback') {
      await acknowledgeCallback(
        bot.encryptedToken,
        parsed,
        !interaction || interaction.outcome === 'interaction_rejected',
      );
    }
    if (interaction) return interaction;

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
      await recordEnrollmentEvent(tx, runtime, 'ENROLLMENT_STARTED', {
        sourceId: update.telegramUpdateId,
        idempotencyKey: `${enrollment.id}:started`,
        metadata: {
          entrypointId: scenario.entrypoint.entrypointId,
          source: scenario.entrypoint.source,
        },
      });
      await scheduleNode(tx, runtime, scenario.definition, scenario.entrypoint.targetNodeId, new Date());
      return { id: enrollment.id, existing: false };
    });

    return {
      outcome: enrollmentResult.existing ? 'already_enrolled' : 'enrolled',
      subscriberId: subscriber.id,
      enrollmentId: enrollmentResult.id,
    };
  },

  async startTestRun(input: {
    userId: string;
    botId: string;
    scenarioId: string;
    scenarioVersionId: string;
    subscriberId: string;
    definition: ChatbotScenarioDefinitionV1;
    entrypointId?: string;
  }): Promise<{ enrollmentId: string; versionId: string; entrypointId: string }> {
    const validation = validateChatbotScenarioDefinition(input.definition);
    if (!validation.valid || !validation.definition) {
      throw new TelegramRuntimeDataError('Тестируемый сценарий не прошёл валидацию', 'SCENARIO_DEFINITION_INVALID');
    }
    const subscriber = await prisma.botSubscriber.findFirst({
      where: {
        id: input.subscriberId,
        userId: input.userId,
        botId: input.botId,
        status: 'ACTIVE',
        archivedAt: null,
      },
      select: {
        id: true,
        telegramUserId: true,
        telegramChatId: true,
        username: true,
        firstName: true,
        lastName: true,
        languageCode: true,
      },
    });
    if (!subscriber?.telegramChatId) {
      throw new TelegramRuntimeDataError('Подтверждённый Telegram-получатель недоступен', 'TEST_RECIPIENT_UNAVAILABLE');
    }
    const entrypoint = input.entrypointId
      ? validation.definition.entrypoints.find((item) => item.id === input.entrypointId)
      : validation.definition.entrypoints.find((item) => item.type === 'manual')
        ?? validation.definition.entrypoints.find((item) => item.type === 'start')
        ?? validation.definition.entrypoints[0];
    if (!entrypoint) {
      throw new TelegramRuntimeDataError('Точка входа для теста не найдена', 'TEST_ENTRYPOINT_NOT_FOUND');
    }

    const triggerUpdateId = `owner-test:${randomUUID()}`;
    const state = initialState({
      telegramUserId: subscriber.telegramUserId,
      username: subscriber.username,
      firstName: subscriber.firstName,
      lastName: subscriber.lastName,
      languageCode: subscriber.languageCode,
    });
    const enrollment = await prisma.$transaction(async (tx) => {
      const previous = await tx.botScenarioEnrollment.findMany({
        where: {
          userId: input.userId,
          botId: input.botId,
          subscriberId: subscriber.id,
          scenarioId: input.scenarioId,
          source: 'owner_test',
          status: { in: ['ACTIVE', 'WAITING'] },
        },
        select: { id: true },
      });
      const previousIds = previous.map((item) => item.id);
      if (previousIds.length > 0) {
        const now = new Date();
        await tx.botScenarioEnrollment.updateMany({
          where: {
            id: { in: previousIds },
            userId: input.userId,
            botId: input.botId,
            subscriberId: subscriber.id,
            status: { in: ['ACTIVE', 'WAITING'] },
          },
          data: { status: 'STOPPED', stoppedAt: now, nextActionAt: null },
        });
        await tx.botMessageDelivery.updateMany({
          where: {
            enrollmentId: { in: previousIds },
            userId: input.userId,
            botId: input.botId,
            subscriberId: subscriber.id,
            status: 'PENDING',
          },
          data: { status: 'CANCELLED', failedAt: now, nextAttemptAt: null },
        });
      }

      const created = await tx.botScenarioEnrollment.create({
        data: {
          userId: input.userId,
          botId: input.botId,
          subscriberId: subscriber.id,
          scenarioId: input.scenarioId,
          scenarioVersionId: input.scenarioVersionId,
          triggerUpdateId,
          entrypointId: entrypoint.id,
          source: 'owner_test',
          startParameter: null,
          currentNodeId: entrypoint.targetNodeId,
          state: state as Prisma.InputJsonValue,
          status: 'ACTIVE',
        },
      });
      const runtime: EnrollmentRuntime = {
        id: created.id,
        userId: input.userId,
        botId: input.botId,
        subscriberId: subscriber.id,
        scenarioId: input.scenarioId,
        scenarioVersionId: input.scenarioVersionId,
        telegramChatId: subscriber.telegramChatId!,
        state,
      };
      await recordEnrollmentEvent(tx, runtime, 'TEST_ENROLLMENT_STARTED', {
        sourceId: triggerUpdateId,
        idempotencyKey: `${created.id}:test-started`,
        metadata: { entrypointId: entrypoint.id },
      });
      await scheduleNode(tx, runtime, validation.definition!, entrypoint.targetNodeId, new Date());
      return created;
    });

    return { enrollmentId: enrollment.id, versionId: input.scenarioVersionId, entrypointId: entrypoint.id };
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
        scenario: { select: { projectId: true } },
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
    const result = payload.kind === 'send_message'
      ? await telegramBotService.sendMessage({
        token,
        chatId: payload.chatId,
        text: payload.text,
        parseMode: payload.parseMode === 'plain' ? undefined : payload.parseMode,
        disableWebPreview: payload.disableWebPreview,
        buttons: payload.buttons,
      })
      : await (async () => {
        const asset = await telegramBotAssetService.getForDelivery(
          delivery.userId,
          enrollment.scenario.projectId,
          payload.assetId,
          payload.mediaType.toUpperCase() as BotAssetMediaType,
        );
        return telegramBotService.sendMedia({
          token,
          chatId: payload.chatId,
          mediaType: payload.mediaType,
          content: asset.content,
          fileName: asset.originalName,
          mimeType: asset.mimeType,
          caption: payload.caption,
          parseMode: payload.parseMode === 'plain' ? undefined : payload.parseMode,
          buttons: payload.buttons,
        });
      })();

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
      await recordEnrollmentEvent(tx, runtime, 'MESSAGE_SENT', {
        nodeId: delivery.nodeId,
        sourceId: delivery.id,
        idempotencyKey: `${runtime.id}:delivery:${delivery.id}:sent`,
        metadata: { deliveryId: delivery.id, telegramMessageId: result.messageId, kind: payload.kind },
      });
      if (payload.waitsForInteraction) {
        await setEnrollmentPosition(tx, runtime, { status: 'WAITING', nextActionAt: null });
      } else {
        await scheduleNode(tx, runtime, validation.definition!, payload.nextNodeId, new Date());
      }
    });
    return { telegramMessageId: result.messageId };
  },
};
