import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useGeneratedStore, type AiResultVersion, type ProductDraft } from '../../store/generated.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { useModelStore } from '../../store/model.store';
import { aiApi, type WorkflowResponse } from '../../api/ai';
import { buildProductMaterial } from '../../utils/projectMaterials';
import { exportMarkdownToDocx, exportMarkdownToPdf } from '../../utils/exportDocx';
import { applyProductNameToMarkdown, confirmationForProductName, extractPreferredProductName, productDocFilename } from '../../utils/productDraftEdits';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import FormattedText from '../../components/FormattedText/FormattedText';
import { MessageActions, MessageInput } from '../../components/MessageInput/MessageInput';
import type { AxiosError } from 'axios';

type StepStatus = 'idle' | 'running' | 'done';

interface ProductChatMessage {
  role: 'user' | 'assistant';
  content: string;
  stepId?: string;
  stepTitle?: string;
}

interface ProductState extends ProductDraft {
  nameOptions?: string[];
  offer?: string;
  productDescription?: string;
  modulesText?: string;
  transformation?: string;
  chatMessages?: ProductChatMessage[];
  stepStatuses?: Record<string, StepStatus>;
}

interface ProductStep {
  id: 'names' | 'offer' | 'description' | 'modules' | 'promise';
  label: string;
}

const PRODUCT_STEPS: ProductStep[] = [
  { id: 'names', label: 'Название продукта' },
  { id: 'offer', label: 'Оффер' },
  { id: 'description', label: 'Описание продукта' },
  { id: 'modules', label: 'Модули программы' },
  { id: 'promise', label: 'Продуктовое обещание' },
];

const EMPTY_STATUSES = PRODUCT_STEPS.reduce<Record<string, StepStatus>>((acc, step) => {
  acc[step.id] = 'idle';
  return acc;
}, {});

const EMPTY_PRODUCT: ProductState = {
  name: '',
  price: '',
  format: '',
  duration: '',
  description: '',
  generated: false,
  nameOptions: [],
  offer: '',
  productDescription: '',
  modulesText: '',
  transformation: '',
  chatMessages: [],
  stepStatuses: EMPTY_STATUSES,
};

function cleanCodeFence(value: string): string {
  return value.replace(/```(?:json|markdown|md)?/gi, '').replace(/```/g, '').trim();
}

function limitText(value: string | undefined, max = 1200): string {
  const text = value?.trim() ?? '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}\n...`;
}

function splitProductMarkdownToMessages(markdown: string): ProductChatMessage[] {
  const cleaned = cleanCodeFence(markdown);
  if (!cleaned.trim()) return [];
  const sections = cleaned
    .split(/\n(?=##\s+)/g)
    .map((section) => section.trim())
    .filter((section) => section && section.replace(/^#\s+Основной продукт\s*/i, '').trim());

  if (sections.length <= 1) {
    return [{ role: 'assistant', content: cleaned, stepTitle: 'Основной продукт' }];
  }

  return sections.map((section) => {
    const titleMatch = section.match(/^##\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() || 'Основной продукт';
    return { role: 'assistant', content: section, stepTitle: title };
  });
}

function normalizeProduct(saved?: ProductDraft): ProductState {
  const raw = (saved ?? {}) as ProductState;
  const savedMessages = raw.chatMessages?.length === 1 && raw.chatMessages[0]?.content.includes('# Основной продукт')
    ? splitProductMarkdownToMessages(raw.chatMessages[0].content)
    : raw.chatMessages;
  const stepStatuses = { ...EMPTY_STATUSES, ...(raw.stepStatuses ?? {}) };
  if (raw.name || raw.offer || raw.productDescription || raw.modulesText || raw.transformation || raw.description) {
    for (const step of PRODUCT_STEPS) {
      const hasValue =
        (step.id === 'names' && (raw.name || raw.nameOptions?.some(Boolean))) ||
        (step.id === 'offer' && raw.offer) ||
        (step.id === 'description' && raw.productDescription) ||
        (step.id === 'modules' && raw.modulesText) ||
        (step.id === 'promise' && raw.transformation);
      if (hasValue && stepStatuses[step.id] === 'idle') stepStatuses[step.id] = 'done';
    }
  }

  return {
    ...EMPTY_PRODUCT,
    ...raw,
    stepStatuses,
    chatMessages: savedMessages?.length
      ? savedMessages
      : raw.description?.trim()
        ? splitProductMarkdownToMessages(raw.description)
        : [],
  };
}

function buildMainProductMarkdownFromParts(product: ProductState): string {
  const assistantContent = (product.chatMessages ?? [])
    .filter((message) => (
      message.role === 'assistant' &&
      !message.stepTitle?.toLowerCase().includes('ошибка') &&
      !message.content.startsWith('Да, зафиксировал название:')
    ))
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');

  if (assistantContent) {
    return ['# Основной продукт', product.name ? `## Название\n${product.name}` : '', assistantContent].filter(Boolean).join('\n\n');
  }

  if (product.description?.trim().includes('# Основной продукт')) {
    return product.description.trim();
  }

  return [
    '# Основной продукт',
    product.nameOptions?.filter(Boolean).length
      ? `## Варианты названия\n${product.nameOptions.filter(Boolean).map((name, index) => `${index + 1}. ${name}`).join('\n')}`
      : product.name ? `## Название\n${product.name}` : '',
    product.offer ? `## Оффер\n${product.offer}` : '',
    product.productDescription ? `## Описание продукта\n${product.productDescription}` : '',
    product.modulesText ? `## Модули программы\n${product.modulesText}` : '',
    product.transformation ? `## Продуктовое обещание\n${product.transformation}` : '',
  ].filter(Boolean).join('\n\n');
}

function buildMainProductMarkdown(product: ProductState): string {
  return product.currentMarkdown?.trim() || buildMainProductMarkdownFromParts(product);
}

function buildMainProductBrief(product: ProductState): string {
  if (product.currentMarkdown?.trim()) {
    return limitText(product.currentMarkdown, 6500);
  }

  const assistantBlocks = (product.chatMessages ?? [])
    .filter((message) => (
      message.role === 'assistant' &&
      !message.stepTitle?.toLowerCase().includes('ошибка') &&
      !message.content.startsWith('Да, зафиксировал название:')
    ))
    .map((message) => {
      const title = message.stepTitle ? `## ${message.stepTitle}` : '';
      return [title, limitText(message.content, 1200)].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  if (assistantBlocks) {
    return ['# Основной продукт', product.name ? `## Название\n${product.name}` : '', assistantBlocks].filter(Boolean).join('\n\n');
  }

  return [
    '# Основной продукт',
    product.nameOptions?.filter(Boolean).length
      ? `## Варианты названия\n${product.nameOptions.filter(Boolean).map((name, index) => `${index + 1}. ${limitText(name, 240)}`).join('\n')}`
      : product.name ? `## Название\n${limitText(product.name, 240)}` : '',
    product.offer ? `## Оффер\n${limitText(product.offer, 1200)}` : '',
    product.productDescription ? `## Описание продукта\n${limitText(product.productDescription, 1200)}` : '',
    product.modulesText ? `## Модули программы\n${limitText(product.modulesText, 5200)}` : '',
    product.transformation ? `## Продуктовое обещание\n${limitText(product.transformation, 500)}` : '',
  ].filter(Boolean).join('\n\n');
}

function stripMarkdown(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function getRequestErrorMessage(err: unknown): string {
  const error = err as AxiosError<{ error?: string }>;
  return error.response?.data?.error || (err instanceof Error ? err.message : 'Ошибка AI-сервиса');
}

function withWorkflowMeta<T extends ProductState>(product: T, resp: WorkflowResponse): T {
  return {
    ...product,
    workflowRunId: resp.workflowRunId,
    workflowStepId: resp.workflowStepId,
    artifactId: resp.artifactId,
    generationId: resp.generationId,
  };
}

function withoutVersionHistory<T extends ProductState>(product: T): T {
  const { versionHistory: _versionHistory, ...rest } = product;
  void _versionHistory;
  return rest as T;
}

function appendProductVersion(product: ProductState, title: string, source: AiResultVersion<ProductDraft>['source']): ProductState {
  if (!product.generated) return product;
  const value = withoutVersionHistory({ ...product, description: buildMainProductMarkdown(product) });
  const version: AiResultVersion<ProductDraft> = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: new Date().toISOString(),
    source,
    workflowRunId: product.workflowRunId,
    workflowStepId: product.workflowStepId,
    artifactId: product.artifactId,
    generationId: product.generationId,
    value: value as ProductDraft,
  };
  return { ...product, versionHistory: [version, ...(product.versionHistory ?? [])].slice(0, 20) };
}

export default function ProductMain() {
  const { activeProjectId, projectName, context } = useProjectMarketingContext();
  const getSettings = useModelStore((s) => s.getSettings);
  const savedProductMain = useGeneratedStore((s) => activeProjectId ? s.projects[activeProjectId]?.productMain : undefined);
  const saveProductMain = useGeneratedStore((s) => s.setProductMain);
  const upsertMaterial = useMaterialsStore((s) => s.upsertMaterial);
  const completeProductMain = useProgressStore((s) => s.completeProductMain);

  const [state, setState] = useState<ProductState>(EMPTY_PRODUCT);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const loadedProductKeyRef = useRef('');

  useEffect(() => {
    if (loading) return;
    const nextKey = `${activeProjectId ?? 'none'}:${JSON.stringify(savedProductMain ?? null)}`;
    if (loadedProductKeyRef.current === nextKey) return;
    loadedProductKeyRef.current = nextKey;
    const savedProduct = normalizeProduct(savedProductMain);
    setState(savedProduct);
  }, [activeProjectId, loading, savedProductMain]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.chatMessages?.length, loading]);

  function persistState(next: ProductState, opts: { syncMaterial?: boolean; versionTitle?: string; versionSource?: AiResultVersion<ProductDraft>['source'] } = {}) {
    if (opts.versionTitle) {
      next = appendProductVersion(next, opts.versionTitle, opts.versionSource ?? 'ai');
    }
    const withMarkdown = { ...next, description: buildMainProductMarkdown(next) };
    setState(withMarkdown);
    if (activeProjectId) {
      saveProductMain(activeProjectId, withMarkdown as ProductDraft);
      if (opts.syncMaterial !== false && withMarkdown.generated) {
        upsertMaterial(activeProjectId, {
          ...buildProductMaterial('product-main', 'Основной продукт', withMarkdown as ProductDraft),
          summaryStatus: 'fresh',
        });
      }
    }
    if (withMarkdown.generated) completeProductMain();
  }

  function withMessage(product: ProductState, message: ProductChatMessage): ProductState {
    return { ...product, chatMessages: [...(product.chatMessages ?? []), message] };
  }

  function restoreVersion(version: AiResultVersion<ProductDraft>) {
    const restored = normalizeProduct(version.value);
    persistState(
      appendProductVersion({ ...restored, generated: true }, `Восстановлено: ${version.title}`, 'restore'),
      { syncMaterial: true },
    );
    toast.success('Версия восстановлена');
  }

  async function requestProductStep(
    stepId: ProductStep['id'] | 'edit',
    current: ProductState,
    userRequest = '',
  ): Promise<WorkflowResponse> {
    if (!activeProjectId) {
      throw new Error('Сначала выберите проект');
    }
    try {
      const settings = getSettings('product-main');
      const workflow = `product.main.${stepId}`;
      const inputs = {
        currentProduct: buildMainProductBrief(current),
        userRequest,
      };
      const resp = await aiApi.startWorkflow(workflow, {
        projectId: activeProjectId,
        provider: settings.provider,
        openaiModel: settings.openaiModel,
        claudeModel: settings.claudeModel,
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      return { ...resp, content: cleanCodeFence(resp.content) };
    } catch (err) {
      throw new Error(getRequestErrorMessage(err));
    }
  }

  function basePrompt() {
    return `Ты продуктовый маркетолог и методолог экспертных продуктов.
Работай как стратег по продуктовой линейке в нише пользователя.

Контекст проекта:
${limitText(context || 'Контекст пока не заполнен.', 6200)}

Роли:
- Когда оцениваешь рынок, спрос, модули и программу — ты продуктовый маркетолог.
- Когда нужно понять экспертную логику программы — подключай роль самого пользователя: эксперт с 25-летним опытом, большой клиентской базой и практическим пониманием клиентов.

Правила:
- Не подставляй психологию или другую нишу, если её нет в контексте.
- Пиши конкретно, как рабочий черновик для эксперта.
- Не перегружай ответ, но не теряй смысл.
- Тарифы сейчас не прорабатывай.
- Отвечай только на русском языке.`;
  }

  function buildStepPrompt(step: ProductStep, current: ProductState) {
    const currentProduct = buildMainProductBrief(current);
    switch (step.id) {
      case 'names':
        return `${basePrompt()}

Сформируй 3 варианта названия флагманского основного продукта.
Название должно отражать результат клиента, а не просто тему.

Формат:
1. **Название** — коротко почему подходит
2. **Название** — коротко почему подходит
3. **Название** — коротко почему подходит`;
      case 'offer':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Сформулируй главный оффер основного продукта.
Дай 2-3 варианта и в конце выбери рекомендуемый.
Оффер должен быть понятен холодной аудитории и опираться на спрос из целевой аудитории.`;
      case 'description':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Сделай описание основного продукта: для кого, какую проблему решает, как устроен путь, какой результат получает клиент.
Длина: 2-4 коротких абзаца.`;
      case 'modules':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Предложи оптимальное количество модулей для программы. Не фиксируйся на 10.
Сделай программу по модулям.

Для каждого модуля:
- название модуля как job клиента;
- что клиент делает/понимает;
- оффер модуля;
- ключевое содержание;
- результат модуля.

Форматируй так, чтобы это было удобно читать в чате.`;
      case 'promise':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Сформулируй продуктовое обещание одной сильной офферной фразой.
Длина: 30-40 слов максимум.
Без списка, без markdown, без пересказа модулей.`;
      default:
        return basePrompt();
      }
  }
  void buildStepPrompt;

  async function handleCreate() {
    if (loading) return;
    setLoading(true);
    let next: ProductState = {
      ...EMPTY_PRODUCT,
      generated: true,
      chatMessages: [],
      stepStatuses: { ...EMPTY_STATUSES },
    };
    persistState(next, { syncMaterial: false });

    try {
      const firstSteps = PRODUCT_STEPS.slice(0, 3);
      for (const step of firstSteps) {
        next = {
          ...next,
          stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), [step.id]: 'running' },
        };
        persistState(next, { syncMaterial: false });

        const resp = await requestProductStep(step.id, next);
        const content = resp.content;
        next = withWorkflowMeta(next, resp);
        if (step.id === 'names') {
          const nameLines = stripMarkdown(content).split('\n').filter(Boolean).slice(0, 3);
          next.nameOptions = nameLines;
          next.name = nameLines[0]?.replace(/^\d+\.\s*/, '').split('—')[0]?.trim() || 'Основной продукт';
        }
        if (step.id === 'offer') next.offer = content;
        if (step.id === 'description') next.productDescription = content;
        next = withMessage({
          ...next,
          stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), [step.id]: 'done' },
        }, { role: 'assistant', content, stepId: step.id, stepTitle: step.label });
        persistState(next, { syncMaterial: false });
      }

      const moduleStep = PRODUCT_STEPS.find((step) => step.id === 'modules')!;
      next = {
        ...next,
        stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), modules: 'running' },
      };
      persistState(next, { syncMaterial: false });
      const modulesResp = await requestProductStep(moduleStep.id, next);
      const modulesContent = modulesResp.content;
      next = withWorkflowMeta(next, modulesResp);
      next = withMessage({
        ...next,
        modulesText: modulesContent,
        stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), modules: 'done' },
      }, { role: 'assistant', content: modulesContent, stepId: moduleStep.id, stepTitle: moduleStep.label });
      persistState(next, { syncMaterial: false });

      const promiseStep = PRODUCT_STEPS.find((step) => step.id === 'promise')!;
      next = {
        ...next,
        stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), promise: 'running' },
      };
      persistState(next, { syncMaterial: false });
      const promiseResp = await requestProductStep(promiseStep.id, next);
      const promiseContent = promiseResp.content;
      next = withWorkflowMeta(next, promiseResp);
      next = withMessage({
        ...next,
        transformation: promiseContent,
        stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), promise: 'done' },
      }, { role: 'assistant', content: promiseContent, stepId: promiseStep.id, stepTitle: promiseStep.label });
      persistState(next, { versionTitle: 'Полная AI-сборка основного продукта', versionSource: 'ai' });
      toast.success('Основной продукт создан. Списано 60 AI-баллов.');
    } catch (err) {
      console.error('[ProductMain create] AI error:', err);
      const message = getRequestErrorMessage(err);
      persistState(withMessage(next, {
        role: 'assistant',
        content: `Не удалось продолжить создание продукта: ${message}`,
        stepTitle: 'Ошибка создания',
      }), { syncMaterial: false });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || loading) return;
    const userMessage: ProductChatMessage = { role: 'user', content: text };
    const stateWithUser = withMessage(state, userMessage);
    setChatInput('');

    const preferredName = extractPreferredProductName(text);
    if (preferredName) {
      const currentMarkdown = applyProductNameToMarkdown(
        stateWithUser.currentMarkdown || buildMainProductMarkdownFromParts(stateWithUser),
        'Основной продукт',
        preferredName,
      );
      const next = withMessage({
        ...stateWithUser,
        name: preferredName,
        nameOptions: [preferredName, ...(stateWithUser.nameOptions ?? []).filter((name) => name && name !== preferredName)].slice(0, 3),
        currentMarkdown,
        generated: true,
      }, {
        role: 'assistant',
        content: confirmationForProductName(preferredName),
        stepId: 'names',
        stepTitle: 'Название продукта',
      });
      persistState(next, { versionTitle: `Ручной выбор названия: ${preferredName}`, versionSource: 'manual' });
      toast.success('Название продукта обновлено');
      return;
    }

    persistState(stateWithUser);
    setLoading(true);

    try {
      const resp = await requestProductStep('edit', stateWithUser, text);
      const response = resp.content;

      const next = withMessage(
        withWorkflowMeta({
          ...stateWithUser,
          generated: true,
          currentMarkdown: response.includes('# Основной продукт') ? response : `# Основной продукт\n\n${response}`,
          description: response.includes('# Основной продукт') ? response : `# Основной продукт\n\n${response}`,
        }, resp),
        { role: 'assistant', content: response, stepTitle: 'Редактирование продукта' },
      );
      persistState({
        ...next,
        chatMessages: [
          ...(stateWithUser.chatMessages ?? []),
          ...splitProductMarkdownToMessages(next.description).map((message) => ({
            ...message,
            stepTitle: message.stepTitle ? `Обновлено · ${message.stepTitle}` : 'Обновлено',
          })),
        ],
      }, { versionTitle: 'AI-правка основного продукта', versionSource: 'ai' });
    } catch (err) {
      console.error('[ProductMain chat] AI error:', err);
      persistState(withMessage(stateWithUser, {
        role: 'assistant',
        content: 'Не смог обработать правку. Попробуйте сформулировать действие конкретнее: что именно изменить в продукте и какой результат нужен.',
      }));
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!state.generated || docxLoading) return;
    setDocxLoading(true);
    try {
      await exportMarkdownToDocx(
        state.name || 'Основной продукт',
        buildMainProductMarkdown(state),
        `LumaIQ_${productDocFilename(state.name, projectName || 'main-product')}`,
      );
    } catch (err) {
      console.error('[ProductMain DOCX]', err);
      toast.error('Не удалось скачать DOCX');
    } finally {
      setDocxLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!state.generated || pdfLoading) return;
    setPdfLoading(true);
    try {
      await exportMarkdownToPdf(
        state.name || 'Основной продукт',
        buildMainProductMarkdown(state),
        `LumaIQ_${productDocFilename(state.name, projectName || 'main-product')}`,
      );
    } catch (err) {
      console.error('[ProductMain PDF]', err);
      toast.error('Не удалось скачать PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  const btnGold: React.CSSProperties = {
    background: loading ? '#e8d498' : '#D4A847',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 13,
    cursor: loading ? 'not-allowed' : 'pointer',
    fontWeight: 700,
  };

  const btnOutlined: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #E5E3DC',
    color: '#555',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 700,
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', backgroundColor: '#fff' }}>
      <div style={{
        width: 280,
        flexShrink: 0,
        backgroundColor: '#F5F4F0',
        borderRight: '1px solid #E5E3DC',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 20px 16px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px' }}>
            Основной продукт
          </h2>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
            AI-проработка флагмана
          </p>
          <button
            style={{ ...btnGold, width: '100%', display: 'flex', justifyContent: 'center', gap: 6 }}
            onClick={() => void handleCreate()}
            disabled={loading}
          >
            {loading && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>}
            {loading ? 'ИИ работает...' : state.generated ? 'Пересобрать продукт' : 'Создать продукт'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
          {PRODUCT_STEPS.map((step, index) => {
            const status = state.stepStatuses?.[step.id] ?? 'idle';
            return (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 8px',
                  borderRadius: 6,
                  marginBottom: 2,
                  backgroundColor: status === 'running' ? 'rgba(212,168,71,0.1)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>
                  {status === 'idle' && <span style={{ color: '#ccc' }}>○</span>}
                  {status === 'running' && <span style={{ color: '#D4A847', display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>}
                  {status === 'done' && <span>✅</span>}
                </span>
                <span style={{
                  fontSize: 12,
                  color: status === 'idle' ? '#aaa' : '#1a1a1a',
                  fontWeight: status === 'running' ? 500 : 400,
                  flex: 1,
                }}>
                  {index + 1}. {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {state.generated && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E3DC', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => void handleDownload()}
              disabled={docxLoading}
              style={{
                ...btnOutlined,
                width: '100%',
                padding: '9px 0',
                fontSize: 12,
                color: docxLoading ? '#bbb' : '#555',
              }}
            >
              {docxLoading ? 'Готовлю DOCX...' : 'Скачать DOCX'}
            </button>
            <button
              onClick={() => void handleDownloadPdf()}
              disabled={pdfLoading}
              style={{
                ...btnOutlined,
                width: '100%',
                padding: '9px 0',
                fontSize: 12,
                color: pdfLoading ? '#bbb' : '#555',
              }}
            >
              {pdfLoading ? 'Готовлю PDF...' : 'Скачать PDF'}
            </button>
          </div>
        )}

        {Boolean(state.versionHistory?.length) && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E3DC' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#777', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
              История версий
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.versionHistory?.slice(0, 6).map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => restoreVersion(version)}
                  style={{
                    textAlign: 'left',
                    background: '#fff',
                    border: '1px solid #E5E3DC',
                    borderRadius: 6,
                    padding: '8px 9px',
                    cursor: 'pointer',
                    color: '#333',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{version.title}</div>
                  <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>
                    {new Date(version.createdAt).toLocaleString('ru-RU')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 12px', minHeight: 0 }}>
          {!state.chatMessages?.length ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 320,
              gap: 16,
              textAlign: 'center',
              maxWidth: 900,
              margin: '0 auto',
            }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: '#F5F4F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
              }}>🚀</div>
              <p style={{ fontSize: 14, color: '#888', maxWidth: 390, lineHeight: 1.6 }}>
                Нажмите «Создать продукт» — ИИ пройдёт чеклист и выдаст каждый блок продукта отдельным сообщением.
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {state.chatMessages?.map((message, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                    gap: 10,
                    alignItems: 'flex-end',
                  }}
                >
                  {message.role === 'assistant' && (
                    <div style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: '#D4A847',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      color: '#fff',
                    }}>AI</div>
                  )}
                  <div style={{
                    maxWidth: 'min(760px, 78%)',
                    padding: '12px 16px',
                    borderRadius: message.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                    background: message.role === 'user' ? '#1a1a1a' : '#F5F4F0',
                    color: message.role === 'user' ? '#fff' : '#1a1a1a',
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}>
                    <div style={{
                      fontSize: 10,
                      color: message.role === 'user' ? 'rgba(255,255,255,0.55)' : '#888',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: 1.2,
                    }}>
                      {message.role === 'user' ? 'Вы' : 'AI'}{message.stepTitle ? ` · ${message.stepTitle}` : ''}
                    </div>
                    {message.role === 'assistant'
                      ? <FormattedText compact>{message.content}</FormattedText>
                      : <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>}
                    {message.role === 'assistant' && <MessageActions content={message.content} compact />}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: '#D4A847',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#fff',
                  }}>AI</div>
                  <div style={{
                    display: 'flex',
                    gap: 5,
                    padding: '14px 18px',
                    borderRadius: '12px 12px 12px 0',
                    background: '#F5F4F0',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A847', animation: 'pulse 1.2s ease-in-out infinite' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A847', animation: 'pulse 1.2s ease-in-out infinite 0.2s' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A847', animation: 'pulse 1.2s ease-in-out infinite 0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <div style={{
          flexShrink: 0,
          borderTop: '1px solid #E5E3DC',
          background: '#fff',
          padding: '10px 28px 8px',
        }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <MessageInput
              value={chatInput}
              onChange={setChatInput}
              onSend={() => void handleChatSend()}
              isLoading={loading}
              disabled={!state.generated}
              section="product-main"
              placeholder={state.generated
                ? 'Напишите, что изменить в продукте: модули, оффер, описание, обещание...'
                : 'Сначала создайте продукт, затем здесь можно будет редактировать его через ИИ...'}
            />
          </div>
          <div style={{ maxWidth: 900, margin: '5px auto 0', color: '#aaa', fontSize: 10.5, textAlign: 'right' }}>
            Enter — отправить · Shift+Enter — перенос строки
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.35; transform: scale(0.9); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
