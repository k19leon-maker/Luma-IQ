import { actionKeyForFeature, type AIActionKey } from '../config/ai-action-registry';
import { env } from '../config/env';
import { withGlobalAiBehaviorPrompt } from '../config/system-prompt';
import { promptRegistry } from '../prompts/registry';
import type { RunWorkflowInput } from './ai-workflow.service';
import { aiWorkflowService } from './ai-workflow.service';
import { aiFeatureFlagsService } from './ai-feature-flags.service';
import { aiOrchestratorService } from './ai-orchestrator.service';
import { aiActionRegistryService } from './ai-action-registry.service';
import { aiActionResolverService } from './ai-action-resolver.service';
import { accessPolicyService } from './access-policy.service';
import { aiBalanceService } from './ai-balance.service';
import { aiPointLedgerService } from './ai-point-ledger.service';
import { aiPilotAccessService } from './ai-pilot-access.service';
import { promptCmsService } from './prompt-cms.service';

function enabledActions(): Set<string> {
  return new Set(
    env.AI_ORCHESTRATION_V2_ACTIONS
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function enabledForAction(actionKey: AIActionKey): boolean {
  const enabled = enabledActions();
  if (enabled.has('*')) return true;
  if (enabled.has(actionKey)) return true;
  if (actionKey.startsWith('ai_chat_') && enabled.has('ai_chat')) return true;
  if (actionKey.startsWith('content_post_') && enabled.has('content_post')) return true;
  if (actionKey.startsWith('content_reel_') && enabled.has('content_reel')) return true;
  if (actionKey.startsWith('content_thread_') && enabled.has('content_thread')) return true;
  if (actionKey === 'product_main_edit' && enabled.has('product_main')) return true;
  if (actionKey === 'product_mini_edit' && enabled.has('product_mini')) return true;
  if (actionKey === 'lead_magnet_edit' && enabled.has('lead_magnet')) return true;
  if (actionKey === 'youtube_script_selling' && enabled.has('youtube_script')) return true;
  if (actionKey === 'audience_followup' && enabled.has('audience')) return true;
  if (actionKey === 'castdev_synthesis' && enabled.has('castdev_analysis')) return true;
  return false;
}

export const aiRuntimeService = {
  async shouldUseV2(actionKey: AIActionKey, userId: string): Promise<boolean> {
    if (!(await aiFeatureFlagsService.isEnabled('AI_ORCHESTRATION_V2'))) return false;
    if (!(await aiFeatureFlagsService.isEnabled('AI_POINTS_V2'))) return false;
    if (!enabledForAction(actionKey)) return false;
    return aiPilotAccessService.isSelected(userId);
  },

  async quote(input: RunWorkflowInput) {
    const config = promptRegistry.get(input.workflow, input.step);
    const selectedActionKey = aiActionResolverService.resolve({
      featureCode: config.feature,
      workflow: input.workflow,
      step: input.step,
      inputs: input.inputs,
    });
    const useV2 = await aiRuntimeService.shouldUseV2(selectedActionKey, input.userId);
    const actionKey = useV2 ? selectedActionKey : actionKeyForFeature(config.feature);
    const definition = await aiActionRegistryService.resolve(actionKey);
    const access = await accessPolicyService.getUserAccess(input.userId);
    const remaining = useV2
      ? (await aiPointLedgerService.getState(input.userId, access.billingPeriod.id)).available
      : Math.max(0, access.limits.monthlyCredits - await aiBalanceService.getUsedInPeriod({
        userId: input.userId,
        billingPeriodId: access.billingPeriod.id,
      }));
    return {
      actionKey,
      aiPoints: definition.aiPoints,
      aiBalanceRemaining: remaining,
      aiBalanceAfter: Math.max(0, remaining - definition.aiPoints),
      affordable: remaining >= definition.aiPoints,
      runtime: useV2 ? 'v2' as const : 'legacy' as const,
    };
  },

  async runWorkflow(input: RunWorkflowInput) {
    const config = promptRegistry.get(input.workflow, input.step);
    const actionKey = aiActionResolverService.resolve({
      featureCode: config.feature,
      workflow: input.workflow,
      step: input.step,
      inputs: input.inputs,
    });
    if (!(await aiRuntimeService.shouldUseV2(actionKey, input.userId))) {
      if (env.AI_LEGACY_RUNTIME_ENABLED === false) {
        throw Object.assign(
          new Error('AI_RUNTIME_NOT_AVAILABLE: действие ещё не переведено на новый AI-runtime'),
          { status: 503 },
        );
      }
      return aiWorkflowService.run(input);
    }

    return aiOrchestratorService.run({
      userId: input.userId,
      projectId: input.projectId,
      actionKey,
      featureCode: config.feature,
      workflow: input.workflow,
      inputs: input.inputs,
      promptVersion: config.version,
      artifactType: config.artifactType,
      validationRules: config.validationRules,
      title: String(input.inputs.topic ?? input.inputs.title ?? config.artifactType),
      idempotencyKey: input.idempotencyKey,
      buildStagePrompt: async ({ context, stage, payload }) => {
        const baseSystemPrompt = withGlobalAiBehaviorPrompt(config.systemPrompt(context));
        const baseUserPrompt = config.userPromptBuilder({ inputs: input.inputs, context });
        const effective = await promptCmsService.resolve({
          config,
          userId: input.userId,
          projectId: input.projectId,
          context,
          inputs: input.inputs,
          baseSystemPrompt,
          baseUserPrompt,
        });
        const isFirstStage = 'context' in payload && 'inputs' in payload;
        const planningStage = /^(analysis|architecture|normalize|outline|angle|strategy)$/i.test(stage.stage);
        const reviewStage = /^(review|validate|quality)$/i.test(stage.stage);
        const strategicDecisionStage = stage.modelAlias === 'SOL';
        let userPrompt = effective.userPrompt;
        let systemPrompt = effective.systemPrompt;
        if (actionKey === 'castdev_analysis' && stage.stage === 'normalize') {
          systemPrompt = [
            'Ты нормализатор реальных клиентских интервью Luma IQ.',
            'Извлекай только факты и короткие дословные цитаты из переданного transcript.',
            'Не делай стратегических выводов и не добавляй информацию от себя.',
            'Верни компактный валидный JSON.',
          ].join('\n');
          userPrompt = [
            effective.userPrompt,
            '',
            'На этом этапе не формируй итоговый отчёт.',
            'Верни JSON evidencePack: задачи, страхи/проблемы/возражения, желания/результаты и короткие цитаты.',
          ].join('\n');
        } else if (actionKey === 'castdev_analysis' && stage.stage === 'analysis') {
          systemPrompt = [
            'Ты исследователь CustDev и маркетинговый аналитик Luma IQ.',
            'Собери итоговый аналитический JSON только из нормализованного evidence pack.',
            'Не добавляй факты и не запрашивай исходный transcript.',
          ].join('\n');
          userPrompt = [
            'Собери финальный JSON CustDev со следующими полями:',
            'customerTasks, fearsProblemsObjections, desiresGoalsResults, summaryForContext.',
            'Для каждого пункта сохрани title, quote, а для страхов также type: fear, problem или objection.',
            '',
            'Нормализованный evidence pack:',
            JSON.stringify(payload),
            '',
            'Верни только валидный JSON.',
          ].join('\n');
        } else if (actionKey === 'castdev_synthesis' && stage.stage === 'synthesis') {
          systemPrompt = [
            'Ты стратегическая модель синтеза CustDev Luma IQ.',
            'Работай только с агрегированным структурированным отчётом предыдущего этапа.',
            'Не запрашивай и не используй исходные транскрипты.',
            'Не выдумывай частотность и сохраняй ограничения выборки.',
          ].join('\n');
          userPrompt = [
            'Собери финальный стратегический JSON по агрегированному CustDev-отчёту.',
            'Обязательные поля: executiveSummary, segments, topJobs, topFearsProblemsObjections,',
            'topDesiredResults, strategicImplications, contentAngles, productHypotheses, limitations.',
            '',
            'Агрегированный отчёт:',
            JSON.stringify(payload),
            '',
            'Верни только валидный JSON.',
          ].join('\n');
        } else if (strategicDecisionStage) {
          systemPrompt = [
            'Ты стратегическая модель Luma IQ.',
            'Принимай решение только по структурированному анализу предыдущего этапа.',
            'Не запрашивай и не пересказывай полную историю проекта.',
            'Не создавай длинный пользовательский текст: верни компактный JSON с решением, аргументами, рисками и ограничениями.',
            'Не добавляй факты, которых нет во входном анализе.',
          ].join('\n');
          userPrompt = [
            `Прими стратегическое решение для действия "${actionKey}" и этапа "${stage.stage}".`,
            `Тип итогового материала: ${config.artifactType}.`,
            `Обязательные элементы финального результата: ${(config.validationRules.requiredIncludes ?? []).join(', ') || 'не заданы'}.`,
            '',
            'Структурированный анализ предыдущего этапа:',
            JSON.stringify(payload),
            '',
            'Верни только компактный JSON.',
          ].join('\n');
        } else if (isFirstStage && planningStage) {
          userPrompt = [
            `Спроектируй структуру результата для этапа "${stage.stage}".`,
            'Не пиши длинный финальный материал. Верни компактный JSON-план: разделы, цель каждого раздела, факты и ограничения.',
            'План должен позволить следующей модели собрать полный результат без домыслов.',
            '',
            'Исходная задача:',
            effective.userPrompt,
          ].join('\n');
        } else if (!isFirstStage && reviewStage) {
          userPrompt = [
            'Проверь предыдущий черновик на полноту, логику, непротиворечивость контексту и требования исходной задачи.',
            'Исправь найденные проблемы и верни ПОЛНУЮ финальную версию материала, а не список замечаний.',
            'Сохрани требуемый формат, включая валидный JSON, если он указан в исходной задаче.',
            '',
            'Исходная задача:',
            effective.userPrompt,
            '',
            'Предыдущий черновик:',
            JSON.stringify(payload),
          ].join('\n');
        } else if (!isFirstStage) {
          userPrompt = [
            `Собери полную готовую версию материала на этапе "${stage.stage}" по плану предыдущего этапа.`,
            'Верни только конечный пользовательский материал. Не описывай процесс и не сокращай обязательные разделы.',
            'Сохрани требуемый формат, включая валидный JSON, если он указан в исходной задаче.',
            '',
            'Исходная задача:',
            effective.userPrompt,
            '',
            'План предыдущего этапа:',
            JSON.stringify(payload),
          ].join('\n');
        }
        return {
          systemPrompt,
          userPrompt,
          temperature: effective.temperature,
        };
      },
    });
  },
};
