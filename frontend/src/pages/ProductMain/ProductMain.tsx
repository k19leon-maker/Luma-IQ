import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useModelStore } from '../../store/model.store';
import { useGeneratedStore, type ProductDraft } from '../../store/generated.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { aiApi } from '../../api/ai';
import { buildProductMaterial } from '../../utils/projectMaterials';
import FormattedText from '../../components/FormattedText/FormattedText';
import html2pdf from 'html2pdf.js';

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

function normalizeProduct(saved?: ProductDraft): ProductState {
  const raw = (saved ?? {}) as ProductState;
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
    chatMessages: raw.chatMessages?.length
      ? raw.chatMessages
      : raw.description?.trim()
        ? [{ role: 'assistant', content: raw.description, stepTitle: 'Сохранённая версия продукта' }]
        : [],
  };
}

function buildMainProductMarkdown(product: ProductState): string {
  if (product.description?.trim() && product.description.includes('# Основной продукт')) {
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

function stripMarkdown(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
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
  const { activeProjectId, projectName, context, mergedProfile } = useProjectMarketingContext();
  const getSettings = useModelStore((s) => s.getSettings);
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
      upsertMaterial(activeProjectId, buildProductMaterial('product-main', 'Основной продукт', savedProduct));
    }
  }, [activeProjectId, savedData.productMain, upsertMaterial]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.chatMessages?.length, loading]);

  const finalMarkdown = useMemo(() => buildMainProductMarkdown(state), [state]);

  function persistState(next: ProductState) {
    const withMarkdown = { ...next, description: buildMainProductMarkdown(next) };
    setState(withMarkdown);
    if (activeProjectId) {
      saveProductMain(activeProjectId, withMarkdown as ProductDraft);
      upsertMaterial(activeProjectId, buildProductMaterial('product-main', 'Основной продукт', withMarkdown as ProductDraft));
    }
    if (withMarkdown.generated) completeProductMain();
  }

  function withMessage(product: ProductState, message: ProductChatMessage): ProductState {
    return { ...product, chatMessages: [...(product.chatMessages ?? []), message] };
  }

  async function requestAi(message: string, maxTokens = 2200): Promise<string> {
    const settings = getSettings('product-main');
    const resp = await aiApi.chat({
      model: settings.provider === 'claude' ? 'claude' : 'chatgpt',
      claudeModel: settings.claudeModel,
      section: 'product-main',
      message,
      conversationHistory: [],
      projectName,
      unpackingProfile: mergedProfile as Record<string, string>,
      maxTokens,
    });
    return cleanCodeFence(resp.content);
  }

  function basePrompt() {
    return `Ты продуктовый маркетолог и методолог экспертных продуктов.
Работай как стратег по продуктовой линейке в нише пользователя.

Контекст проекта:
${context || 'Контекст пока не заполнен.'}

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
    const currentProduct = buildMainProductMarkdown(current);
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
    persistState(next);

    try {
      for (const step of PRODUCT_STEPS) {
        next = {
          ...next,
          stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), [step.id]: 'running' },
        };
        persistState(next);

        const content = await requestAi(buildStepPrompt(step, next), step.id === 'modules' ? 5200 : 2200);
        if (step.id === 'names') {
          const lines = stripMarkdown(content).split('\n').filter(Boolean).slice(0, 3);
          next.nameOptions = lines;
          next.name = lines[0]?.replace(/^\d+\.\s*/, '').split('—')[0]?.trim() || 'Основной продукт';
        }
        if (step.id === 'offer') next.offer = content;
        if (step.id === 'description') next.productDescription = content;
        if (step.id === 'modules') next.modulesText = content;
        if (step.id === 'promise') next.transformation = content;

        next = withMessage(
          {
            ...next,
            stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), [step.id]: 'done' },
          },
          { role: 'assistant', content, stepId: step.id, stepTitle: step.label },
        );
        persistState(next);
      }
      toast.success('Основной продукт создан');
    } catch (err) {
      console.error('[ProductMain create] AI error:', err);
      toast.error('Не удалось завершить создание продукта. Уже созданные шаги сохранены.');
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
${buildMainProductMarkdown(stateWithUser)}

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
      persistState(next);
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
    <div style={{ background: '#fff', minHeight: '100%', maxWidth: 1320, margin: '0 auto' }}>
      <h1 style={{ fontSize: 21, fontWeight: 800, color: '#1a1a1a', margin: '0 0 6px' }}>
        Основной продукт
      </h1>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 22px' }}>
        Диалоговая проработка флагманского продукта: название, оффер, описание, модули и продуктовое обещание
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <button style={btnGold} onClick={() => void handleCreate()} disabled={loading}>
          {loading ? 'ИИ работает...' : state.generated ? 'Пересобрать продукт с ИИ' : 'Создать продукт с ИИ'}
        </button>
        {state.generated && (
          <button style={btnOutlined} onClick={() => void handleDownload()} disabled={pdfLoading}>
            {pdfLoading ? 'Генерирую PDF...' : 'Скачать PDF-презентацию'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <aside style={{
          border: '1px solid #E5E3DC',
          borderRadius: 12,
          padding: 14,
          background: '#F8F7F3',
          position: 'sticky',
          top: 0,
        }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#9A6A00', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
            Чеклист продукта
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PRODUCT_STEPS.map((step, index) => {
              const status = state.stepStatuses?.[step.id] ?? 'idle';
              return (
                <div
                  key={step.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 11px',
                    borderRadius: 10,
                    background: status === 'running' ? '#FFF8E8' : status === 'done' ? '#fff' : '#F0EEE8',
                    border: status === 'running' ? '1px solid #D4A847' : '1px solid #E5E3DC',
                  }}
                >
                  <span style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: status === 'done' ? '#3B6D11' : status === 'running' ? '#D4A847' : '#ddd',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}>
                    {status === 'done' ? '✓' : status === 'running' ? '…' : index + 1}
                  </span>
                  <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: status === 'running' ? 800 : 600 }}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        <section style={{
          border: '1px solid #E5E3DC',
          borderRadius: 12,
          minHeight: 'calc(100vh - 210px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 22, background: '#F5F4F0' }}>
            {!state.chatMessages?.length && (
              <div style={{
                background: '#fff',
                border: '1px dashed #D8D4C8',
                borderRadius: 12,
                padding: 28,
                color: '#777',
                fontSize: 14,
                lineHeight: 1.6,
              }}>
                Нажмите «Создать продукт с ИИ». Я пройду чеклист по шагам и буду выдавать каждый элемент продукта прямо в этом диалоге.
              </div>
            )}

            {state.chatMessages?.map((message, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 14,
                }}
              >
                <div style={{
                  maxWidth: message.role === 'user' ? '72%' : '86%',
                  background: message.role === 'user' ? '#D4A847' : '#fff',
                  color: '#1a1a1a',
                  border: message.role === 'assistant' ? '1px solid #E5E3DC' : 'none',
                  borderRadius: 12,
                  padding: '14px 16px',
                  boxShadow: message.role === 'assistant' ? '0 8px 20px rgba(25,24,20,0.04)' : 'none',
                }}>
                  {message.stepTitle && (
                    <div style={{ fontSize: 11, color: message.role === 'user' ? '#5b4107' : '#9A6A00', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      {message.role === 'user' ? 'Вы' : 'ИИ'} · {message.stepTitle}
                    </div>
                  )}
                  {message.role === 'assistant' ? (
                    <FormattedText>{message.content}</FormattedText>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{message.content}</div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ color: '#9A6A00', fontSize: 13, fontWeight: 700, padding: '4px 2px' }}>
                ИИ думает...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {state.generated && (
            <div style={{ borderTop: '1px solid #E5E3DC', background: '#fff', padding: 14 }}>
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Например: Хочу отредактировать продукт: сделай программу короче, добавь больше практики и усили продуктовое обещание..."
                style={{
                  width: '100%',
                  minHeight: 82,
                  resize: 'vertical',
                  border: '1px solid #E5E3DC',
                  borderRadius: 10,
                  padding: 12,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  boxSizing: 'border-box',
                  marginBottom: 10,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#999' }}>
                  ИИ обновит продукт в диалоге, а PDF будет скачиваться из последней сохранённой версии.
                </div>
                <button
                  style={{ ...btnGold, opacity: loading || !chatInput.trim() ? 0.6 : 1 }}
                  disabled={loading || !chatInput.trim()}
                  onClick={() => void handleChatSend()}
                >
                  {loading ? 'Думаю...' : 'Отправить'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {state.generated && (
        <details style={{ marginTop: 18, border: '1px solid #E5E3DC', borderRadius: 12, padding: 14, background: '#fff' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#555' }}>
            Итоговый markdown продукта
          </summary>
          <div style={{ marginTop: 12 }}>
            <FormattedText>{finalMarkdown}</FormattedText>
          </div>
        </details>
      )}
    </div>
  );
}
