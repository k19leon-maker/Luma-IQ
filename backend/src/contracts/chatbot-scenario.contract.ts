import { z } from 'zod';

export const CHATBOT_SCENARIO_SCHEMA_VERSION = '1.0' as const;
export const MAX_SCENARIO_NODES = 100;
export const MAX_SCENARIO_EDGES = 200;
export const MAX_SCENARIO_HORIZON_SECONDS = 366 * 24 * 60 * 60;

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Use Latin letters, numbers, underscores and hyphens');

const variableNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/, 'Invalid variable name');

const tagNameSchema = z.string().trim().min(1).max(80);
const ianaTimezoneSchema = z.string().trim().min(1).max(64).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, { message: 'Invalid IANA timezone' });
const httpUrlSchema = z.string().url().refine((value) => /^https?:\/\//i.test(value), {
  message: 'Only http and https links are allowed',
});

const urlButtonSchema = z.object({
  type: z.literal('url'),
  label: z.string().trim().min(1).max(64),
  url: httpUrlSchema,
}).strict();

const callbackButtonSchema = z.object({
  type: z.literal('callback'),
  label: z.string().trim().min(1).max(64),
  callbackData: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 64, {
    message: 'Telegram callbackData must not exceed 64 bytes',
  }),
}).strict();

export const chatbotButtonSchema = z.discriminatedUnion('type', [
  urlButtonSchema,
  callbackButtonSchema,
]);

const buttonsSchema = z.array(chatbotButtonSchema).max(10).optional();

const entrypointBase = {
  id: identifierSchema,
  targetNodeId: identifierSchema,
};

export const chatbotEntrypointSchema = z.discriminatedUnion('type', [
  z.object({
    ...entrypointBase,
    type: z.literal('start'),
  }).strict(),
  z.object({
    ...entrypointBase,
    type: z.literal('start_parameter'),
    value: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  }).strict(),
  z.object({
    ...entrypointBase,
    type: z.literal('keyword'),
    value: z.string().trim().min(1).max(80),
    match: z.enum(['exact', 'contains']).default('exact'),
    caseSensitive: z.boolean().default(false),
  }).strict(),
  z.object({
    ...entrypointBase,
    type: z.literal('manual'),
  }).strict(),
]);

export const chatbotVariableSchema = z.object({
  name: variableNameSchema,
  type: z.enum(['string', 'number', 'boolean', 'date']),
  description: z.string().trim().max(240).optional(),
  required: z.boolean().default(false),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
}).strict();

const nodeBase = {
  id: identifierSchema,
  label: z.string().trim().min(1).max(120).optional(),
};

const sendMessageNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('send_message'),
  text: z.string().min(1).max(4096),
  parseMode: z.enum(['plain', 'HTML', 'MarkdownV2']).default('plain'),
  disableWebPreview: z.boolean().default(false),
  buttons: buttonsSchema,
}).strict();

const sendMediaNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('send_media'),
  mediaType: z.enum(['image', 'document', 'video', 'audio']),
  assetId: z.string().trim().min(1).max(160),
  caption: z.string().max(1024).optional(),
  parseMode: z.enum(['plain', 'HTML', 'MarkdownV2']).default('plain'),
  buttons: buttonsSchema,
}).strict();

const durationScheduleSchema = z.object({
  type: z.literal('duration'),
  seconds: z.number().int().min(1).max(30 * 24 * 60 * 60),
}).strict();

const nextLocalTimeScheduleSchema = z.object({
  type: z.literal('next_local_time'),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: ianaTimezoneSchema.default('Europe/Moscow'),
  minDelaySeconds: z.number().int().min(0).max(24 * 60 * 60).default(60),
}).strict();

const waitNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('wait'),
  schedule: z.discriminatedUnion('type', [durationScheduleSchema, nextLocalTimeScheduleSchema]),
}).strict();

const conditionNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('condition'),
}).strict();

const collectInputNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('collect_input'),
  field: variableNameSchema,
  inputType: z.enum(['text', 'email', 'phone', 'number', 'choice']),
  prompt: z.string().min(1).max(4096),
  required: z.boolean().default(true),
  choices: z.array(z.string().trim().min(1).max(120)).min(2).max(10).optional(),
}).strict();

const setFieldNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('set_field'),
  field: variableNameSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
}).strict();

const addTagNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('add_tag'),
  tag: tagNameSchema,
}).strict();

const removeTagNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('remove_tag'),
  tag: tagNameSchema,
}).strict();

const goalNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('goal'),
  goalKey: identifierSchema,
  goalLabel: z.string().trim().min(1).max(120).optional(),
}).strict();

const handoffNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('handoff'),
  text: z.string().min(1).max(4096),
  buttons: buttonsSchema,
}).strict();

const endNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('end'),
  reason: z.string().trim().max(240).optional(),
}).strict();

export const chatbotScenarioNodeSchema = z.discriminatedUnion('type', [
  sendMessageNodeSchema,
  sendMediaNodeSchema,
  waitNodeSchema,
  conditionNodeSchema,
  collectInputNodeSchema,
  setFieldNodeSchema,
  addTagNodeSchema,
  removeTagNodeSchema,
  goalNodeSchema,
  handoffNodeSchema,
  endNodeSchema,
]);

const edgeConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer_equals'), value: z.string().max(240), caseSensitive: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal('answer_contains'), value: z.string().min(1).max(240), caseSensitive: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal('button_callback'), callbackData: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 64) }).strict(),
  z.object({ type: z.literal('tag_present'), tag: tagNameSchema }).strict(),
  z.object({ type: z.literal('tag_absent'), tag: tagNameSchema }).strict(),
  z.object({ type: z.literal('field_equals'), field: variableNameSchema, value: z.union([z.string(), z.number(), z.boolean()]) }).strict(),
  z.object({ type: z.literal('field_exists'), field: variableNameSchema }).strict(),
]);

export const chatbotScenarioEdgeSchema = z.object({
  id: identifierSchema,
  fromNodeId: identifierSchema,
  toNodeId: identifierSchema,
  condition: edgeConditionSchema.optional(),
}).strict();

export const chatbotScenarioDefinitionV1Schema = z.object({
  schemaVersion: z.literal(CHATBOT_SCENARIO_SCHEMA_VERSION),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  timezone: ianaTimezoneSchema.default('Europe/Moscow'),
  entrypoints: z.array(chatbotEntrypointSchema).min(1).max(20),
  variables: z.array(chatbotVariableSchema).max(50).default([]),
  nodes: z.array(chatbotScenarioNodeSchema).min(1).max(MAX_SCENARIO_NODES),
  edges: z.array(chatbotScenarioEdgeSchema).max(MAX_SCENARIO_EDGES),
  goals: z.array(z.object({
    key: identifierSchema,
    label: z.string().trim().min(1).max(120),
  }).strict()).max(30).default([]),
  metadata: z.object({
    locale: z.string().trim().min(2).max(16).default('ru'),
    source: z.enum(['manual', 'ai', 'import']).default('manual'),
  }).strict().default({ locale: 'ru', source: 'manual' }),
}).strict();

export type ChatbotScenarioDefinitionV1 = z.infer<typeof chatbotScenarioDefinitionV1Schema>;
export type ChatbotScenarioNode = z.infer<typeof chatbotScenarioNodeSchema>;

export interface ChatbotScenarioValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ChatbotScenarioValidationReport {
  valid: boolean;
  issues: ChatbotScenarioValidationIssue[];
  stats?: {
    nodeCount: number;
    edgeCount: number;
    maximumHorizonSeconds: number;
  };
  definition?: ChatbotScenarioDefinitionV1;
}

const BUILT_IN_VARIABLES = new Set([
  'first_name',
  'last_name',
  'username',
  'telegram_user_id',
  'phone',
  'email',
  'language_code',
]);

const WRITABLE_BUILT_IN_FIELDS = new Set(['first_name', 'last_name', 'phone', 'email']);
const TEMPLATE_VARIABLE_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*}}/g;

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => (seen.has(value) ? duplicates.add(value) : seen.add(value)));
  return [...duplicates];
}

function addIssue(
  issues: ChatbotScenarioValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function extractTemplateVariables(value: string): string[] {
  return [...value.matchAll(TEMPLATE_VARIABLE_PATTERN)].map((match) => match[1]);
}

function getNodeTextValues(node: ChatbotScenarioNode): string[] {
  switch (node.type) {
    case 'send_message':
      return [node.text];
    case 'send_media':
      return node.caption ? [node.caption] : [];
    case 'collect_input':
      return [node.prompt];
    case 'handoff':
      return [node.text];
    case 'set_field':
      return typeof node.value === 'string' ? [node.value] : [];
    default:
      return [];
  }
}

function maximumScenarioHorizon(
  entryNodeIds: string[],
  nodesById: Map<string, ChatbotScenarioNode>,
  outgoing: Map<string, string[]>,
): number {
  const memo = new Map<string, number>();
  const visit = (nodeId: string): number => {
    const cached = memo.get(nodeId);
    if (cached !== undefined) return cached;
    const node = nodesById.get(nodeId);
    if (!node) return 0;
    const ownWait = node.type === 'wait'
      ? node.schedule.type === 'duration'
        ? node.schedule.seconds
        : 24 * 60 * 60
      : 0;
    const descendants = outgoing.get(nodeId) ?? [];
    const result = ownWait + Math.max(0, ...descendants.map(visit));
    memo.set(nodeId, result);
    return result;
  };
  return Math.max(0, ...entryNodeIds.map(visit));
}

export function validateChatbotScenarioDefinition(input: unknown): ChatbotScenarioValidationReport {
  const parsed = chatbotScenarioDefinitionV1Schema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        code: `schema.${issue.code}`,
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const definition = parsed.data;
  const issues: ChatbotScenarioValidationIssue[] = [];
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  findDuplicates(definition.nodes.map((node) => node.id)).forEach((id) =>
    addIssue(issues, 'graph.duplicate_node_id', 'nodes', `Duplicate node id: ${id}`));
  findDuplicates(definition.edges.map((edge) => edge.id)).forEach((id) =>
    addIssue(issues, 'graph.duplicate_edge_id', 'edges', `Duplicate edge id: ${id}`));
  findDuplicates(definition.entrypoints.map((entrypoint) => entrypoint.id)).forEach((id) =>
    addIssue(issues, 'entrypoint.duplicate_id', 'entrypoints', `Duplicate entrypoint id: ${id}`));
  findDuplicates(definition.variables.map((variable) => variable.name)).forEach((name) =>
    addIssue(issues, 'variable.duplicate_name', 'variables', `Duplicate variable: ${name}`));
  findDuplicates(definition.goals.map((goal) => goal.key)).forEach((key) =>
    addIssue(issues, 'goal.duplicate_key', 'goals', `Duplicate goal key: ${key}`));

  definition.variables.forEach((variable, index) => {
    if (BUILT_IN_VARIABLES.has(variable.name)) {
      addIssue(issues, 'variable.reserved_name', `variables.${index}.name`, `Built-in variable cannot be redeclared: ${variable.name}`);
    }
    if (variable.defaultValue === undefined) return;
    const validDefault = variable.type === 'date'
      ? typeof variable.defaultValue === 'string'
      : typeof variable.defaultValue === variable.type;
    if (!validDefault) {
      addIssue(issues, 'variable.invalid_default_type', `variables.${index}.defaultValue`, `Default value must match type ${variable.type}`);
    }
  });

  const normalizedEntrypoints = definition.entrypoints.map((entrypoint) => {
    if (entrypoint.type === 'keyword') {
      return `keyword:${entrypoint.caseSensitive ? entrypoint.value : entrypoint.value.toLocaleLowerCase('ru-RU')}`;
    }
    if (entrypoint.type === 'start_parameter') return `start_parameter:${entrypoint.value}`;
    return entrypoint.type;
  });
  findDuplicates(normalizedEntrypoints).forEach((value) =>
    addIssue(issues, 'entrypoint.duplicate_trigger', 'entrypoints', `Duplicate trigger: ${value}`));

  definition.entrypoints.forEach((entrypoint, index) => {
    if (!nodesById.has(entrypoint.targetNodeId)) {
      addIssue(issues, 'graph.missing_entry_node', `entrypoints.${index}.targetNodeId`, `Unknown node: ${entrypoint.targetNodeId}`);
    }
  });

  definition.edges.forEach((edge, index) => {
    if (!nodesById.has(edge.fromNodeId)) {
      addIssue(issues, 'graph.missing_from_node', `edges.${index}.fromNodeId`, `Unknown node: ${edge.fromNodeId}`);
      return;
    }
    if (!nodesById.has(edge.toNodeId)) {
      addIssue(issues, 'graph.missing_to_node', `edges.${index}.toNodeId`, `Unknown node: ${edge.toNodeId}`);
      return;
    }
    outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge.toNodeId]);
    incoming.set(edge.toNodeId, [...(incoming.get(edge.toNodeId) ?? []), edge.fromNodeId]);
  });

  definition.nodes.forEach((node, index) => {
    const nodeEdges = definition.edges.filter((edge) => edge.fromNodeId === node.id);
    const unconditionalEdges = nodeEdges.filter((edge) => !edge.condition);
    const callbackButtons = 'buttons' in node
      ? (node.buttons ?? []).filter((button): button is z.infer<typeof callbackButtonSchema> => button.type === 'callback')
      : [];

    if (node.type === 'end') {
      if (nodeEdges.length > 0) addIssue(issues, 'graph.end_has_outgoing', `nodes.${index}`, 'End node cannot have outgoing edges');
    } else if (node.type === 'condition') {
      if (nodeEdges.length < 2) addIssue(issues, 'graph.condition_branches', `nodes.${index}`, 'Condition node requires at least two branches');
      if (unconditionalEdges.length !== 1) addIssue(issues, 'graph.condition_fallback', `nodes.${index}`, 'Condition node requires exactly one fallback edge');
    } else if (callbackButtons.length > 0) {
      const callbackEdges = nodeEdges.filter((edge) => edge.condition?.type === 'button_callback');
      const callbackValues = callbackButtons.map((button) => button.callbackData);
      findDuplicates(callbackValues).forEach((value) =>
        addIssue(issues, 'button.duplicate_callback', `nodes.${index}.buttons`, `Duplicate callbackData: ${value}`));
      callbackValues.forEach((value) => {
        if (!callbackEdges.some((edge) => edge.condition?.type === 'button_callback' && edge.condition.callbackData === value)) {
          addIssue(issues, 'button.missing_edge', `nodes.${index}.buttons`, `No edge for callbackData: ${value}`);
        }
      });
      if (unconditionalEdges.length > 1) addIssue(issues, 'graph.multiple_fallbacks', `nodes.${index}`, 'Only one fallback edge is allowed');
    } else if (nodeEdges.length !== 1 || unconditionalEdges.length !== 1) {
      addIssue(issues, 'graph.linear_node_transition', `nodes.${index}`, 'Node requires exactly one unconditional outgoing edge');
    }
  });

  const availableVariables = new Set([
    ...BUILT_IN_VARIABLES,
    ...definition.variables.map((variable) => variable.name),
  ]);
  const writableFields = new Set([
    ...WRITABLE_BUILT_IN_FIELDS,
    ...definition.variables.map((variable) => variable.name),
  ]);

  definition.nodes.forEach((node, index) => {
    getNodeTextValues(node).flatMap(extractTemplateVariables).forEach((variable) => {
      if (!availableVariables.has(variable)) {
        addIssue(issues, 'variable.unknown_template', `nodes.${index}`, `Unknown template variable: ${variable}`);
      }
    });
    if ((node.type === 'collect_input' || node.type === 'set_field') && !writableFields.has(node.field)) {
      addIssue(issues, 'variable.unknown_writable_field', `nodes.${index}.field`, `Field is not declared or writable: ${node.field}`);
    }
    if (node.type === 'collect_input' && node.inputType === 'choice' && !node.choices) {
      addIssue(issues, 'input.choices_required', `nodes.${index}.choices`, 'Choices are required for choice input');
    }
    if (node.type === 'collect_input' && node.inputType !== 'choice' && node.choices) {
      addIssue(issues, 'input.choices_not_allowed', `nodes.${index}.choices`, 'Choices are only allowed for choice input');
    }
    if (node.type === 'goal' && !definition.goals.some((goal) => goal.key === node.goalKey)) {
      addIssue(issues, 'goal.unknown_key', `nodes.${index}.goalKey`, `Goal is not declared: ${node.goalKey}`);
    }
  });

  definition.edges.forEach((edge, index) => {
    if (edge.condition?.type === 'field_equals' || edge.condition?.type === 'field_exists') {
      if (!availableVariables.has(edge.condition.field)) {
        addIssue(issues, 'variable.unknown_edge_field', `edges.${index}.condition.field`, `Unknown field: ${edge.condition.field}`);
      }
    }
  });

  const entryNodeIds = definition.entrypoints
    .map((entrypoint) => entrypoint.targetNodeId)
    .filter((nodeId) => nodesById.has(nodeId));
  const reachable = new Set<string>();
  const stack = [...entryNodeIds];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    (outgoing.get(nodeId) ?? []).forEach((nextNodeId) => stack.push(nextNodeId));
  }
  definition.nodes.forEach((node, index) => {
    if (!reachable.has(node.id)) addIssue(issues, 'graph.unreachable_node', `nodes.${index}`, `Node is unreachable: ${node.id}`);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const detectCycle = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    const hasCycle = (outgoing.get(nodeId) ?? []).some(detectCycle);
    visiting.delete(nodeId);
    visited.add(nodeId);
    return hasCycle;
  };
  if (entryNodeIds.some(detectCycle)) {
    addIssue(issues, 'graph.cycle_not_allowed', 'edges', 'Scenario V1 must not contain cycles');
  }

  const canReachEnd = new Set<string>();
  const reverseStack = definition.nodes.filter((node) => node.type === 'end').map((node) => node.id);
  while (reverseStack.length > 0) {
    const nodeId = reverseStack.pop()!;
    if (canReachEnd.has(nodeId)) continue;
    canReachEnd.add(nodeId);
    (incoming.get(nodeId) ?? []).forEach((previousNodeId) => reverseStack.push(previousNodeId));
  }
  reachable.forEach((nodeId) => {
    if (!canReachEnd.has(nodeId)) addIssue(issues, 'graph.no_path_to_end', `nodes.${nodeId}`, `Node has no path to an end: ${nodeId}`);
  });

  const maximumHorizonSeconds = issues.some((issue) => issue.code === 'graph.cycle_not_allowed')
    ? 0
    : maximumScenarioHorizon(entryNodeIds, nodesById, outgoing);
  if (maximumHorizonSeconds > MAX_SCENARIO_HORIZON_SECONDS) {
    addIssue(issues, 'graph.horizon_too_long', 'nodes', 'Scenario horizon exceeds 366 days');
  }

  return {
    valid: issues.length === 0,
    issues,
    stats: {
      nodeCount: definition.nodes.length,
      edgeCount: definition.edges.length,
      maximumHorizonSeconds,
    },
    definition,
  };
}

export function assertValidChatbotScenarioDefinition(input: unknown): ChatbotScenarioDefinitionV1 {
  const report = validateChatbotScenarioDefinition(input);
  if (!report.valid || !report.definition) {
    const summary = report.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`Invalid chatbot scenario: ${summary}`);
  }
  return report.definition;
}
