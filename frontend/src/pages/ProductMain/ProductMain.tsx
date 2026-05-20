import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useGeneratedStore, type ProductDraft } from '../../store/generated.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { aiApi } from '../../api/ai';
import { buildProductMaterial } from '../../utils/projectMaterials';
import FormattedText from '../../components/FormattedText/FormattedText';
import html2pdf from 'html2pdf.js';
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

function fitAiMessage(value: string, max = 15500): string {
  if (value.length <= max) return value;
  const head = value.slice(0, Math.floor(max * 0.72)).trim();
  const tail = value.slice(-Math.floor(max * 0.2)).trim();
  return `${head}\n\n...[часть контекста сокращена, чтобы запрос прошёл лимит API]...\n\n${tail}`;
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

function buildMainProductMarkdown(product: ProductState): string {
  const hasStructuredData = Boolean(
    product.nameOptions?.some(Boolean) ||
    product.offer ||
    product.productDescription ||
    product.modulesText ||
    product.transformation,
  );

  if (!hasStructuredData && product.description?.trim() && product.description.includes('# Основной продукт')) {
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

function buildMainProductBrief(product: ProductState): string {
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

function extractMarkdownSection(markdown: string, titlePattern: RegExp): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => titlePattern.test(line.trim()));
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s+/.test(line.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

function getRequestErrorMessage(err: unknown): string {
  const error = err as AxiosError<{ error?: string }>;
  return error.response?.data?.error || (err instanceof Error ? err.message : 'Ошибка AI-сервиса');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function markdownToPdfHtml(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<div style="height: 10px"></div>';
      if (trimmed.startsWith('# ')) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      if (trimmed.startsWith('## ')) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (/^\d+\.\s+/.test(trimmed) || /^[-•]\s+/.test(trimmed)) return `<p class="bullet">${escapeHtml(trimmed)}</p>`;
      return `<p>${escapeHtml(trimmed)}</p>`;
    })
    .join('');
}

async function downloadProductPresentationPdf(product: ProductState, projectName: string): Promise<void> {
  const markdown = buildMainProductMarkdown(product);
  const safeFileName = (product.name || projectName || 'main-product')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.left = '0';
  root.style.top = '0';
  root.style.zIndex = '-1';
  root.innerHTML = `
    <style>
      .product-pdf {
        width: 794px;
        min-height: 1123px;
        box-sizing: border-box;
        padding: 44px 52px;
        background: #ffffff;
        color: #1a1a1a;
        font-family: Inter, Arial, sans-serif;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 34px;
        color: #1a1a1a;
        font-weight: 900;
        font-size: 18px;
      }
      .mark {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: #1a1a1a;
        color: #D4A847;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      h1 {
        font-size: 34px;
        line-height: 1.15;
        margin: 0 0 22px;
      }
      h2 {
        margin: 26px 0 10px;
        padding-top: 14px;
        border-top: 1px solid #E5E3DC;
        color: #9A6A00;
        font-size: 16px;
        text-transform: uppercase;
        letter-spacing: 1.1px;
      }
      p {
        margin: 0 0 8px;
        font-size: 14px;
        line-height: 1.55;
      }
      .bullet {
        padding-left: 10px;
      }
      .footer {
        margin-top: 34px;
        padding-top: 14px;
        border-top: 1px solid #E5E3DC;
        color: #888;
        font-size: 11px;
        display: flex;
        justify-content: space-between;
      }
    </style>
    <div class="product-pdf">
      <div class="brand"><div class="mark">✦</div><div><span style="color:#D4A847">Luma</span>IQ</div></div>
      ${markdownToPdfHtml(markdown)}
      <div class="footer"><span>${escapeHtml(projectName)}</span><span>lumaiq.ru</span></div>
    </div>
  `;

  document.body.appendChild(root);
  try {
    const pdfElement = root.querySelector<HTMLElement>('.product-pdf');
    if (!pdfElement) throw new Error('Не удалось подготовить PDF');
    await (html2pdf() as {
      set: (opts: Record<string, unknown>) => {
        from: (el: HTMLElement) => { save: () => Promise<void> };
      };
    })
      .set({
        margin: 0,
        filename: `LumaIQ_${safeFileName || 'main-product'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794, windowWidth: 794 },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
      })
      .from(pdfElement)
      .save();
  } finally {
    document.body.removeChild(root);
  }
}

export default function ProductMain() {
  const { activeProjectId, projectName, context } = useProjectMarketingContext();
  const savedData = useGeneratedStore((s) => s.getProject(activeProjectId));
  const saveProductMain = useGeneratedStore((s) => s.setProductMain);
  const upsertMaterial = useMaterialsStore((s) => s.upsertMaterial);
  const completeProductMain = useProgressStore((s) => s.completeProductMain);

  const [state, setState] = useState<ProductState>(EMPTY_PRODUCT);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedProduct = normalizeProduct(savedData.productMain);
    setState(savedProduct);
    if (activeProjectId && savedProduct.generated) {
      upsertMaterial(activeProjectId, {
        ...buildProductMaterial('product-main', 'Основной продукт', savedProduct),
        summaryStatus: 'fresh',
      });
    }
  }, [activeProjectId, savedData.productMain, upsertMaterial]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.chatMessages?.length, loading]);

  function persistState(next: ProductState, opts: { syncMaterial?: boolean } = {}) {
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

  async function requestAi(message: string, maxTokens = 2200): Promise<string> {
    if (!activeProjectId) {
      throw new Error('Сначала выберите проект');
    }
    try {
      const resp = await aiApi.startWorkflow('product.main.generate', {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs: {
          prompt: fitAiMessage(message),
          maxTokens,
        },
      });
      return cleanCodeFence(resp.content);
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
      next = {
        ...next,
        stepStatuses: {
          ...(next.stepStatuses ?? EMPTY_STATUSES),
          names: 'running',
          offer: 'running',
          description: 'running',
        },
      };
      persistState(next, { syncMaterial: false });

      const introContent = await requestAi(`${basePrompt()}

Сейчас сформируй первые 3 блока основного продукта одним ответом.
Верни строго markdown с такими заголовками:

## Варианты названия
1. **Название** — коротко почему подходит
2. **Название** — коротко почему подходит
3. **Название** — коротко почему подходит

## Оффер
2-3 варианта главного оффера и в конце рекомендуемый вариант.

## Описание продукта
2-4 коротких абзаца: для кого продукт, какую проблему решает, как устроен путь, какой результат получает клиент.`, 4200);

      const namesContent = extractMarkdownSection(introContent, /^##\s+варианты\s+названия/i) || introContent;
      const offerContent = extractMarkdownSection(introContent, /^##\s+оффер/i);
      const descriptionContent = extractMarkdownSection(introContent, /^##\s+описание/i);
      const nameLines = stripMarkdown(namesContent).split('\n').filter(Boolean).slice(0, 3);
      next = {
        ...next,
        nameOptions: nameLines,
        name: nameLines[0]?.replace(/^\d+\.\s*/, '').split('—')[0]?.trim() || 'Основной продукт',
        offer: offerContent,
        productDescription: descriptionContent,
        stepStatuses: {
          ...(next.stepStatuses ?? EMPTY_STATUSES),
          names: 'done',
          offer: 'done',
          description: 'done',
        },
      };
      for (const step of firstSteps) {
        const content = step.id === 'names'
          ? namesContent
          : step.id === 'offer'
            ? offerContent
            : descriptionContent;
        next = withMessage(next, { role: 'assistant', content, stepId: step.id, stepTitle: step.label });
      }
      persistState(next, { syncMaterial: false });

      const moduleStep = PRODUCT_STEPS.find((step) => step.id === 'modules')!;
      next = {
        ...next,
        stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), modules: 'running' },
      };
      persistState(next, { syncMaterial: false });
      const modulesContent = await requestAi(buildStepPrompt(moduleStep, next), 5200);
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
      const promiseContent = await requestAi(buildStepPrompt(promiseStep, next), 1600);
      next = withMessage({
        ...next,
        transformation: promiseContent,
        stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), promise: 'done' },
      }, { role: 'assistant', content: promiseContent, stepId: promiseStep.id, stepTitle: promiseStep.label });
      persistState(next);
      toast.success('Основной продукт создан');
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
    persistState(stateWithUser);
    setLoading(true);

    try {
      const response = await requestAi(`${basePrompt()}

Пользователь хочет отредактировать основной продукт через чат.
Его запрос:
${text}

Текущая версия продукта:
${buildMainProductBrief(stateWithUser)}

Задача:
- Выполни правку по запросу пользователя.
- Верни только обновлённую полную версию продукта в markdown.
- Сохраняй структуру: # Основной продукт, варианты названия, оффер, описание, модули программы, продуктовое обещание.
- Продуктовое обещание держи коротким: 30-40 слов максимум.
- Не добавляй служебные комментарии вроде “готово” или “я изменил”. Только обновлённый продукт.`, 5200);

      const next = withMessage(
        {
          ...stateWithUser,
          generated: true,
          description: response.includes('# Основной продукт') ? response : `# Основной продукт\n\n${response}`,
        },
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
      });
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
    if (!state.generated || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadProductPresentationPdf(state, projectName);
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
              disabled={pdfLoading}
              style={{
                ...btnOutlined,
                width: '100%',
                padding: '9px 0',
                fontSize: 12,
                color: pdfLoading ? '#bbb' : '#555',
              }}
            >
              {pdfLoading ? 'Генерирую PDF...' : 'Скачать PDF'}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          padding: '20px 28px 16px',
          borderBottom: '1px solid #F0EEE8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
              Продуктовая упаковка
            </h2>
            <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
              {projectName} · название, оффер, описание, модули и обещание
            </p>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', minHeight: 0 }}>
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
          padding: '16px 28px',
        }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleChatSend();
                }
              }}
              disabled={loading || !state.generated}
              placeholder={state.generated
                ? 'Напишите, что изменить в продукте: модули, оффер, описание, обещание...'
                : 'Сначала создайте продукт, затем здесь можно будет редактировать его через ИИ...'}
              rows={3}
              style={{
                flex: 1,
                minHeight: 76,
                resize: 'none',
                border: '1px solid #E5E3DC',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 14,
                lineHeight: 1.5,
                fontFamily: 'inherit',
                outline: 'none',
                background: state.generated ? '#fff' : '#F8F7F3',
              }}
            />
            <button
              onClick={() => void handleChatSend()}
              disabled={loading || !chatInput.trim() || !state.generated}
              style={{
                height: 44,
                border: 'none',
                borderRadius: 8,
                background: loading || !chatInput.trim() || !state.generated ? '#F0EEE8' : '#D4A847',
                color: loading || !chatInput.trim() || !state.generated ? '#bbb' : '#fff',
                padding: '0 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: loading || !state.generated ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Думаю...' : 'Отправить'}
            </button>
          </div>
          <div style={{ maxWidth: 900, margin: '8px auto 0', color: '#aaa', fontSize: 11, textAlign: 'right' }}>
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
