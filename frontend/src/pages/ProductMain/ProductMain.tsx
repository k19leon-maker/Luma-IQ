import { useEffect, useRef, useState } from 'react';
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

interface ProductState {
  name: string;
  price: string;
  format: string;
  duration: string;
  description: string;
  generated: boolean;
  nameOptions?: string[];
  offer?: string;
  productDescription?: string;
  modules?: ModuleBlock[];
  transformation?: string;
  tariffs?: TariffBlock[];
  aiReview?: string;
}

interface ModuleBlock {
  title: string;
  job: string;
  offer: string;
  theses: string;
  result: string;
}

interface TariffBlock {
  name: 'Эконом' | 'Стандарт' | 'VIP' | string;
  price: string;
  description: string;
  included: string;
  support: string;
}

type AiTextValue = string | string[] | null | undefined;

interface MainProductAiModule {
  title?: AiTextValue;
  job?: AiTextValue;
  offer?: AiTextValue;
  theses?: AiTextValue;
  result?: AiTextValue;
}

interface ProductIntroAiDraft {
  name?: string;
  nameOptions?: string[];
  offer?: string;
  productDescription?: string;
}

interface ProductModulesAiDraft {
  modules?: MainProductAiModule[];
}

interface ProductChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProductChatPatch {
  nameOptions?: string[];
  offer?: AiTextValue;
  productDescription?: AiTextValue;
  modules?: MainProductAiModule[];
  activeModule?: MainProductAiModule;
  transformation?: AiTextValue;
}

interface ProductChatAiDraft {
  reply?: string;
  patch?: ProductChatPatch;
}

const DEFAULT_MODULES: ModuleBlock[] = Array.from({ length: 10 }, (_, index) => ({
  title: `Модуль ${index + 1}`,
  job: '',
  offer: '',
  theses: '',
  result: '',
}));

const DEFAULT_TARIFFS: TariffBlock[] = [
  {
    name: 'Эконом',
    price: '35 000 ₽',
    description: 'Самостоятельное прохождение с базовой поддержкой.',
    included: '8 модулей\nЗакрытый Telegram-чат\nМатериалы и задания',
    support: 'Общий чат без индивидуальной обратной связи',
  },
  {
    name: 'Стандарт',
    price: '50 000 ₽',
    description: 'Оптимальный формат с групповой динамикой и поддержкой.',
    included: '8 модулей\nМини-группа\nЗакрытый Telegram-чат\nГрупповая обратная связь',
    support: 'Мини-группа и регулярная обратная связь',
  },
  {
    name: 'VIP',
    price: '80 000 ₽',
    description: 'Максимальное сопровождение и персональная доработка под клиента.',
    included: 'Все 10 модулей\nИндивидуальная работа\nМини-группа\nЗакрытый Telegram-чат\nПерсональная обратная связь',
    support: 'Индивидуальное сопровождение + группа + чат',
  },
];

function createEmptyModule(index: number): ModuleBlock {
  return {
    title: `Модуль ${index + 1}`,
    job: '',
    offer: '',
    theses: '',
    result: '',
  };
}

function normalizeNameOptions(options?: string[], fallback = ''): string[] {
  const source = options?.slice(0, 3) ?? [];
  return Array.from({ length: 3 }, (_, index) => source[index] ?? (index === 0 ? fallback : ''));
}

const EMPTY_PRODUCT: ProductState = {
  name: '',
  price: '35 000 / 50 000 / 80 000 ₽',
  format: '3 месяца / 10 модулей / еженедельно',
  duration: '3 месяца',
  description: '',
  generated: false,
  nameOptions: ['', '', ''],
  offer: '',
  productDescription: '',
  modules: DEFAULT_MODULES,
  transformation: '',
  tariffs: DEFAULT_TARIFFS,
  aiReview: '',
};

function cleanCodeFence(value: string): string {
  return value.replace(/```(?:json|markdown|md)?/gi, '').replace(/```/g, '').trim();
}

function extractJsonObject(value: string): string {
  const cleaned = cleanCodeFence(value);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return cleaned;
  return cleaned.slice(start, end + 1);
}

function parseAiJson<T>(value: string): T {
  return JSON.parse(extractJsonObject(value)) as T;
}

function tryParseAiJson<T>(value: string): T | null {
  try {
    return parseAiJson<T>(value);
  } catch {
    return null;
  }
}

function aiText(value: AiTextValue): string {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join('\n');
  return typeof value === 'string' ? value : '';
}

function cleanModuleTitle(value: string, index: number): string {
  const fallback = `Модуль ${index + 1}`;
  const cleaned = value
    .replace(new RegExp(`^\\s*модуль\\s*${index + 1}\\s*[.\\-:—–]?\\s*`, 'i'), '')
    .replace(/^\s*модуль\s*\d+\s*[.\-:—–]?\s*/i, '')
    .trim();
  return cleaned || fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPdfText(value?: string): string {
  return escapeHtml(value || '—')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
}

function AutoTextarea({
  value,
  onChange,
  style,
  minHeight = 84,
  maxHeight,
}: {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  minHeight?: number;
  maxHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.max(minHeight, el.scrollHeight);
    el.style.height = `${maxHeight ? Math.min(maxHeight, nextHeight) : nextHeight}px`;
    el.style.overflowY = maxHeight && nextHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, minHeight, maxHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...style, minHeight, maxHeight, overflow: 'hidden' }}
    />
  );
}

function normalizeProduct(saved?: ProductDraft): ProductState {
  if (!saved) return EMPTY_PRODUCT;
  const raw = saved as ProductState;
  const hasStructuredBlocks = Boolean(
    raw.offer || raw.productDescription || raw.transformation || raw.modules?.some((module) =>
      module.title || module.job || module.offer || module.theses || module.result,
    ),
  );
  return {
    ...EMPTY_PRODUCT,
    ...raw,
    description: hasStructuredBlocks ? raw.description : '',
    modules: normalizeModules(raw.modules),
    nameOptions: normalizeNameOptions(raw.nameOptions, raw.name),
    tariffs: normalizeTariffs(raw.tariffs),
  };
}

function normalizeModules(modules?: ModuleBlock[]): ModuleBlock[] {
  const source = modules?.length ? modules : DEFAULT_MODULES;
  return source.map((module, index) => ({
    ...createEmptyModule(index),
    ...module,
    title: cleanModuleTitle(module.title, index),
  }));
}

function normalizeAiModules(modules?: MainProductAiModule[]): ModuleBlock[] {
  return normalizeModules(
    modules?.map((module) => ({
      title: aiText(module.title),
      job: aiText(module.job),
      offer: aiText(module.offer),
      theses: aiText(module.theses),
      result: aiText(module.result),
    })),
  );
}

function normalizeTariffs(tariffs?: TariffBlock[]): TariffBlock[] {
  const source = tariffs?.slice(0, 3) ?? [];
  return Array.from({ length: 3 }, (_, index) => ({
    ...DEFAULT_TARIFFS[index]!,
    ...(source[index] ?? {}),
  }));
}

function cleanModulePatch(patch?: MainProductAiModule): Partial<ModuleBlock> {
  if (!patch) return {};
  const normalized = {
    title: aiText(patch.title),
    job: aiText(patch.job),
    offer: aiText(patch.offer),
    theses: aiText(patch.theses),
    result: aiText(patch.result),
  };
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value.trim())) as Partial<ModuleBlock>;
}

function buildMainProductMarkdown(product: ProductState): string {
  const nameOptions = normalizeNameOptions(product.nameOptions, product.name);
  const primaryName = product.name || nameOptions.find(Boolean) || '';
  const modules = (product.modules?.length ? product.modules : DEFAULT_MODULES)
    .map((module, index) => [
      `### Модуль ${index + 1}. ${module.title || `Модуль ${index + 1}`}`,
      module.job ? `**Job клиента:** ${module.job}` : '',
      module.offer ? `**Оффер модуля:** ${module.offer}` : '',
      module.theses ? `**Что разбираем:**\n${module.theses}` : '',
      module.result ? `**Результат модуля:** ${module.result}` : '',
    ].filter(Boolean).join('\n\n'))
    .join('\n\n');

  const tariffs = (product.tariffs?.length ? product.tariffs : DEFAULT_TARIFFS)
    .map((tariff) => [
      `### ${tariff.name}`,
      tariff.price ? `**Цена:** ${tariff.price}` : '',
      tariff.description ? `**Описание:** ${tariff.description}` : '',
      tariff.included ? `**Что входит:**\n${tariff.included}` : '',
      tariff.support ? `**Поддержка:** ${tariff.support}` : '',
    ].filter(Boolean).join('\n\n'))
    .join('\n\n');

  return [
    '# Основной продукт',
    nameOptions.filter(Boolean).length
      ? `## Варианты названия\n${nameOptions.filter(Boolean).map((name, index) => `${index + 1}. ${name}`).join('\n')}`
      : '',
    primaryName ? `## Основное название\n${primaryName}` : '',
    product.offer ? `## Оффер\n${product.offer}` : '',
    product.productDescription ? `## Описание\n${product.productDescription}` : '',
    `## Программа\n${modules}`,
    product.transformation ? `## Общий результат продукта\n${product.transformation}` : '',
    `## Тарифы\n${tariffs}`,
  ].filter(Boolean).join('\n\n');
}

function compactText(value?: string, limit = 260): string {
  const cleaned = (value || '').replace(/\s+/g, ' ').trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit).trim()}...` : cleaned;
}

function buildCompactProductContext(product: ProductState): string {
  const modules = (product.modules?.length ? product.modules : DEFAULT_MODULES)
    .map((module, index) => [
      `Модуль ${index + 1}: ${cleanModuleTitle(module.title, index)}`,
      module.job ? `Job: ${compactText(module.job, 180)}` : '',
      module.offer ? `Оффер: ${compactText(module.offer, 180)}` : '',
      module.theses ? `Содержание: ${compactText(module.theses, 260)}` : '',
      module.result ? `Результат: ${compactText(module.result, 180)}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  return [
    `Название: ${product.name || normalizeNameOptions(product.nameOptions, product.name).find(Boolean) || 'Основной продукт'}`,
    product.offer ? `Оффер: ${compactText(product.offer, 320)}` : '',
    product.productDescription ? `Описание: ${compactText(product.productDescription, 420)}` : '',
    `Модули:\n${modules}`,
    product.transformation ? `Общий результат: ${compactText(product.transformation, 320)}` : '',
  ].filter(Boolean).join('\n\n');
}

function extractRequestedModuleCount(value: string): number | null {
  const normalized = value.toLowerCase().replace(/ё/g, 'е');
  const hasProgramCommand = /(остав|сократ|удал|убер|пересоб|модул)/i.test(normalized);
  if (!hasProgramCommand) return null;
  const match = normalized.match(/(?:до|в|из|остав(?:ь|ить)?|сократ(?:и|ить)?|убер(?:и|ать)?|удал(?:и|ить)?)[^\d]{0,32}(\d{1,2})\s*модул/i)
    || normalized.match(/(\d{1,2})\s*модул/i);
  if (!match) return null;
  const count = Number(match[1]);
  return count >= 1 && count <= 20 ? count : null;
}

function buildLocalTransformation(product: ProductState): string {
  const modules = (product.modules ?? []).filter((module) =>
    module.title.trim() || module.job.trim() || module.offer.trim() || module.result.trim(),
  );
  const moduleResults = modules
    .map((module, index) => `${index + 1}. ${cleanModuleTitle(module.title, index)}: ${module.result || module.offer || module.job}`)
    .filter((line) => line.replace(/\d+\.|:/g, '').trim())
    .slice(0, 10)
    .join('\n');

  return [
    product.offer ? `После прохождения продукта клиент получает главный результат: ${product.offer}` : '',
    product.productDescription ? `Программа ведет клиента через понятный путь: ${product.productDescription}` : '',
    moduleResults ? `По шагам клиент проходит такие изменения:\n${moduleResults}` : '',
    'Итоговое продуктовое обещание: клиент выходит с понятной системой действий, снижает хаос в текущей ситуации и получает практический план, который можно применять сразу после завершения программы.',
  ].filter(Boolean).join('\n\n');
}

async function downloadProductPresentationPdf(product: ProductState, projectName: string): Promise<void> {
  const nameOptions = normalizeNameOptions(product.nameOptions, product.name).filter(Boolean);
  const productTitle = product.name || nameOptions[0] || 'Основной продукт';
  const modules = product.modules?.length ? product.modules : DEFAULT_MODULES;
  const safeFileName = productTitle.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'product';

  const root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.left = '0';
  root.style.top = '0';
  root.style.zIndex = '-1';
  root.style.pointerEvents = 'none';
  root.innerHTML = `
    <style>
      .product-pdf {
        width: 1123px;
        background: #ffffff;
        color: #1a1a1a;
        font-family: Inter, Arial, sans-serif;
      }
      .product-slide {
        width: 1123px;
        min-height: 794px;
        box-sizing: border-box;
        padding: 42px 50px;
        page-break-after: always;
        background: #ffffff;
      }
      .product-cover {
        background: linear-gradient(135deg, #fff8e8 0%, #ffffff 56%, #f2efe7 100%);
        border: 1px solid #ead8a6;
      }
      .product-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 70px;
      }
      .product-mark {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: #1a1a1a;
        color: #d4a847;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: 900;
      }
      .product-logo {
        font-size: 20px;
        font-weight: 900;
      }
      .product-logo span { color: #d4a847; }
      .product-kicker {
        color: #9a6a00;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 1.6px;
        font-weight: 900;
        margin: 0 0 12px;
      }
      .product-title {
        max-width: 790px;
        margin: 0;
        font-size: 42px;
        line-height: 1.1;
        font-weight: 900;
      }
      .product-subtitle {
        max-width: 780px;
        margin: 20px 0 0;
        color: #555;
        font-size: 18px;
        line-height: 1.55;
      }
      .product-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }
      .product-card {
        border: 1.5px solid #d8d4c8;
        border-radius: 14px;
        padding: 22px;
        background: #f8f7f3;
      }
      .product-label {
        color: #9a6a00;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 1.3px;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .product-card h2 {
        margin: 0 0 12px;
        font-size: 24px;
        line-height: 1.2;
      }
      .product-text {
        font-size: 15px;
        line-height: 1.55;
        color: #282828;
      }
      .product-module-title {
        font-size: 28px;
        line-height: 1.2;
        margin: 0 0 22px;
        font-weight: 900;
      }
      .product-module-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .product-result {
        background: #111111;
        color: #ffffff;
        border-radius: 14px;
        padding: 20px;
        margin-top: 16px;
      }
      .product-result .product-label { color: #d4a847; }
      .product-footer {
        margin-top: 28px;
        color: #8a867d;
        font-size: 12px;
        display: flex;
        justify-content: space-between;
      }
    </style>
    <div class="product-pdf">
      <section class="product-slide product-cover">
        <div class="product-brand">
          <div class="product-mark">✦</div>
          <div class="product-logo"><span>Luma</span>IQ</div>
        </div>
        <p class="product-kicker">PDF-презентация основного продукта</p>
        <h1 class="product-title">${escapeHtml(productTitle)}</h1>
        <p class="product-subtitle">${formatPdfText(product.offer || product.productDescription || projectName)}</p>
        <div class="product-footer"><span>${escapeHtml(projectName)}</span><span>lumaiq.ru</span></div>
      </section>

      <section class="product-slide">
        <p class="product-kicker">Архитектура продукта</p>
        <div class="product-grid">
          <div class="product-card">
            <div class="product-label">Оффер</div>
            <div class="product-text">${formatPdfText(product.offer)}</div>
          </div>
          <div class="product-card">
            <div class="product-label">Описание</div>
            <div class="product-text">${formatPdfText(product.productDescription)}</div>
          </div>
          <div class="product-card" style="grid-column: 1 / -1;">
            <div class="product-label">Общий результат продукта</div>
            <div class="product-text">${formatPdfText(product.transformation)}</div>
          </div>
        </div>
        <div class="product-footer"><span>LumaIQ</span><span>Основной продукт</span></div>
      </section>

      ${modules.map((module, index) => `
        <section class="product-slide">
          <p class="product-kicker">Модуль ${index + 1}</p>
          <h2 class="product-module-title">${escapeHtml(cleanModuleTitle(module.title, index))}</h2>
          <div class="product-module-grid">
            <div class="product-card">
              <div class="product-label">Job клиента</div>
              <div class="product-text">${formatPdfText(module.job)}</div>
            </div>
            <div class="product-card">
              <div class="product-label">Оффер модуля</div>
              <div class="product-text">${formatPdfText(module.offer)}</div>
            </div>
            <div class="product-card" style="grid-column: 1 / -1;">
              <div class="product-label">Тезисы / содержание</div>
              <div class="product-text">${formatPdfText(module.theses)}</div>
            </div>
          </div>
          <div class="product-result">
            <div class="product-label">Результат модуля</div>
            <div class="product-text" style="color: #ffffff;">${formatPdfText(module.result)}</div>
          </div>
          <div class="product-footer"><span>${escapeHtml(productTitle)}</span><span>Модуль ${index + 1}</span></div>
        </section>
      `).join('')}
    </div>
  `;

  document.body.appendChild(root);
  try {
    const pdfElement = root.querySelector<HTMLElement>('.product-pdf');
    if (!pdfElement) throw new Error('Не удалось подготовить PDF-презентацию');
    await (html2pdf() as {
      set: (opts: Record<string, unknown>) => {
        from: (el: HTMLElement) => { save: () => Promise<void> };
      };
    })
      .set({
        margin: 0,
        filename: `LumaIQ_${safeFileName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1123, windowWidth: 1123 },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'] },
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

  const [state,   setState]   = useState<ProductState>(EMPTY_PRODUCT);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [productChatMessages, setProductChatMessages] = useState<ProductChatMessage[]>([]);
  const [productChatInput, setProductChatInput] = useState('');
  const [productChatLoading, setProductChatLoading] = useState(false);
  const [materialStatus, setMaterialStatus] = useState('');

  useEffect(() => {
    const savedProduct = normalizeProduct(savedData.productMain);
    setState(savedProduct);
    if (activeProjectId && savedProduct.generated) {
      upsertMaterial(activeProjectId, buildProductMaterial('product-main', 'Основной продукт', savedProduct));
    }
  }, [activeProjectId, savedData.productMain, upsertMaterial]);

  useEffect(() => {
    const modulesLength = state.modules?.length ?? 0;
    if (modulesLength && activeModuleIndex >= modulesLength) {
      setActiveModuleIndex(modulesLength - 1);
    }
  }, [activeModuleIndex, state.modules?.length]);

  function persistState(next: ProductState) {
    const withMarkdown = { ...next, description: next.generated ? buildMainProductMarkdown(next) : next.description };
    setState(withMarkdown);
    if (activeProjectId) saveProductMain(activeProjectId, withMarkdown as ProductDraft);
    if (activeProjectId) upsertMaterial(activeProjectId, buildProductMaterial('product-main', 'Основной продукт', withMarkdown as ProductDraft));
    if (withMarkdown.generated) completeProductMain();
    if (next.generated) {
      setMaterialStatus('Материал product-main.md обновлен в knowledge base');
      setTimeout(() => setMaterialStatus(''), 2500);
    }
  }

  function patchState(patch: Partial<ProductState>) {
    persistState({ ...state, ...patch });
  }

  function patchModule(index: number, patch: Partial<ModuleBlock>) {
    const modules = [...(state.modules ?? DEFAULT_MODULES)];
    modules[index] = { ...(modules[index] ?? createEmptyModule(index)), ...patch };
    patchState({ modules });
  }

  function addModule() {
    const modules = [...(state.modules ?? DEFAULT_MODULES)];
    modules.push(createEmptyModule(modules.length));
    patchState({ modules, format: `3 месяца / ${modules.length} модулей / еженедельно` });
  }

  function removeModule(index: number) {
    const modules = [...(state.modules ?? DEFAULT_MODULES)];
    if (modules.length <= 1) {
      toast.error('Должен остаться хотя бы один модуль');
      return;
    }
    modules.splice(index, 1);
    setActiveModuleIndex((current) => Math.min(current, modules.length - 1));
    patchState({ modules, format: `3 месяца / ${modules.length} модулей / еженедельно` });
  }

  function patchNameOption(index: number, value: string) {
    const options = normalizeNameOptions(state.nameOptions, state.name);
    const previousValue = options[index];
    options[index] = value;
    const shouldUpdatePrimary = index === 0 || !state.name || state.name === previousValue;
    patchState({ nameOptions: options, name: shouldUpdatePrimary ? value : state.name });
  }

  function patchTariff(index: number, patch: Partial<TariffBlock>) {
    const tariffs = [...(state.tariffs ?? DEFAULT_TARIFFS)];
    tariffs[index] = { ...(tariffs[index] ?? DEFAULT_TARIFFS[index]!), ...patch };
    patchState({ tariffs });
  }

  async function requestProductAiRaw(message: string, maxTokens = 2200): Promise<string> {
    const settings = getSettings('product-main');
    const resp = await aiApi.chat({
      model:               settings.provider === 'claude' ? 'claude' : 'chatgpt',
      claudeModel:         settings.claudeModel,
      section:             'product-main',
      message,
      conversationHistory: [],
      projectName,
      unpackingProfile:    mergedProfile as Record<string, string>,
      maxTokens,
    });
    return resp.content;
  }

  async function requestProductAiJson<T>(message: string, maxTokens = 2200): Promise<T> {
    return parseAiJson<T>(await requestProductAiRaw(message, maxTokens));
  }

  async function requestProductAiText(message: string, maxTokens = 1600): Promise<string> {
    return cleanCodeFence(await requestProductAiRaw(message, maxTokens));
  }

  function buildProductBaseContext() {
    return `Ты продуктовый маркетолог и методолог экспертных продуктов с большим опытом в нише пользователя.
Создаёшь флагманский ОСНОВНОЙ ПРОДУКТ эксперта.

Контекст проекта:
${context || 'Контекст пока не заполнен.'}

Общие требования:
- Это флагман на 3 месяца.
- Логика: 10 еженедельных модулей.
- Каждый модуль решает отдельную job-to-be-done клиента.
- У каждого модуля должны быть: название, job клиента, оффер модуля, тезисы/содержание, результат модуля.
- Нужен общий результат продукта / продуктовое обещание.
- Тарифы пользователь заполняет вручную. Не меняй тарифы, если пользователь прямо не просит.
- Не подставляй психологию или другую нишу, если ее нет в контексте.
- Пиши конкретно, как рабочий черновик, который эксперт сможет редактировать руками.
- Верни валидный JSON. Без markdown, без комментариев, без текста до или после JSON.
- Для списков используй массивы строк, а не текст с переносами внутри строки.`;
  }

  async function handleCreate() {
    if (loading) return;
    setLoading(true);
    setLoadingStep('Готовлю структуру продукта...');
    try {
      const baseContext = buildProductBaseContext();

      setLoadingStep('Генерирую названия, оффер и описание...');
      const intro = await requestProductAiJson<ProductIntroAiDraft>(`${baseContext}

Сейчас создай только верхнюю часть продукта: 3 варианта названия, главный оффер и описание продукта.

Верни только JSON без markdown-блоков:
{
  "name": "название продукта",
  "nameOptions": ["вариант названия 1", "вариант названия 2", "вариант названия 3"],
  "offer": "главный оффер продукта",
  "productDescription": "описание продукта в 5-7 предложениях"
}`, 1600);

      const nameOptions = normalizeNameOptions(
        intro.nameOptions?.length ? intro.nameOptions : [intro.name ?? 'Основной продукт', '', ''],
        intro.name,
      );

      let next: ProductState = {
        ...EMPTY_PRODUCT,
        nameOptions,
        name: intro.name?.trim() || nameOptions.find(Boolean)?.trim() || 'Основной продукт',
        price: '35 000 / 50 000 / 80 000 ₽',
        format: '3 месяца / 10 модулей / еженедельно',
        duration: '3 месяца',
        offer: intro.offer ?? '',
        productDescription: intro.productDescription ?? '',
        modules: Array.from({ length: 10 }, (_, index) => createEmptyModule(index)),
        transformation: '',
        tariffs: DEFAULT_TARIFFS,
        description: '',
        generated: true,
      };
      persistState(next);

      const moduleRanges = [
        { start: 1, end: 3 },
        { start: 4, end: 6 },
        { start: 7, end: 10 },
      ];

      for (const range of moduleRanges) {
        setLoadingStep(`Генерирую модули ${range.start}-${range.end}...`);
        const modulesDraft = await requestProductAiJson<ProductModulesAiDraft>(`${baseContext}

Уже создана верхняя часть продукта:
Название: ${next.name}
Оффер: ${next.offer}
Описание: ${next.productDescription}

Сейчас создай только модули ${range.start}-${range.end}.
Количество элементов в modules: ${range.end - range.start + 1}.
Первый элемент массива соответствует модулю ${range.start}, последний — модулю ${range.end}.

Верни только JSON без markdown-блоков:
{
  "modules": [
    {
      "title": "название модуля как job-to-be-done",
      "job": "что клиент хочет сделать/понять/изменить",
      "offer": "оффер этого модуля",
      "theses": ["тезис 1", "тезис 2", "тезис 3"],
      "result": "конкретный результат модуля"
    }
  ]
}`, range.end === 10 ? 3200 : 2600);

        const currentModules = [...(next.modules ?? [])];
        const normalizedBatch = normalizeAiModules(modulesDraft.modules);
        normalizedBatch.slice(0, range.end - range.start + 1).forEach((module, batchIndex) => {
          currentModules[range.start - 1 + batchIndex] = module;
        });
        next = { ...next, modules: currentModules };
        persistState(next);
      }

      setLoadingStep('Генерирую общий результат продукта...');
      let transformation = '';
      try {
        transformation = await requestProductAiText(`${baseContext}

Уже создан продукт:
${buildCompactProductContext(next)}

Сейчас создай только общий результат продукта / продуктовое обещание.
Опиши итоговую трансформацию клиента после прохождения всей программы: что изменится в бизнесе/жизни, какие решения появятся, какой результат станет возможен.

Верни только текст общего результата без JSON и без markdown-блоков.`, 1400);
      } catch (err) {
        console.error('[ProductMain create transformation] AI error:', err);
        transformation = buildLocalTransformation(next);
      }

      next = {
        ...next,
        transformation: transformation.trim() || buildLocalTransformation(next),
      };
      persistState(next);
      toast.success('Основной продукт создан');
    } catch (err) {
      console.error('[ProductMain] AI error:', err);
      if (state.generated && !state.transformation) {
        patchState({ transformation: buildLocalTransformation(state) });
      }
      toast.error('Не удалось завершить генерацию продукта. Уже созданные блоки сохранены, попробуйте ещё раз.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }

  function handleCopy() {
    if (!state.generated) return;
    navigator.clipboard.writeText(buildMainProductMarkdown(state)).catch(() => undefined);
    toast.success('Скопировано');
  }

  function handleDownload() {
    if (!state.generated) return;
    void downloadProductPresentationPdf(state, projectName);
  }

  async function handleGenerateTransformation() {
    if (!state.generated || loading) return;
    setLoading(true);
    setLoadingStep('Дозаполняю общий результат продукта...');
    try {
      const transformation = await requestProductAiText(`${buildProductBaseContext()}

Текущий продукт:
${buildCompactProductContext(state)}

Сгенерируй только общий результат продукта / продуктовое обещание.
Опиши итоговую трансформацию клиента после всей программы.
Не повторяй дословно модули. Собери цельное обещание: из какой точки клиент приходит, через какие изменения проходит, что получает в итоге.
Верни только текст без JSON и без markdown-блоков.`, 1400);

      patchState({ transformation: transformation.trim() || buildLocalTransformation(state) });
      toast.success('Общий результат заполнен');
    } catch (err) {
      console.error('[ProductMain transformation] AI error:', err);
      patchState({ transformation: buildLocalTransformation(state) });
      toast.success('Заполнил черновик общего результата');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }

  function applyProductChatPatch(patch?: ProductChatPatch) {
    if (!patch) return;
    const statePatch: Partial<ProductState> = {};
    if (patch.offer) statePatch.offer = aiText(patch.offer);
    if (patch.productDescription) statePatch.productDescription = aiText(patch.productDescription);
    if (patch.transformation) statePatch.transformation = aiText(patch.transformation);
    if (patch.nameOptions?.length) {
      statePatch.nameOptions = normalizeNameOptions(patch.nameOptions, state.name);
      statePatch.name = statePatch.nameOptions.find(Boolean) || state.name;
    }
    if (patch.modules?.length) {
      statePatch.modules = normalizeAiModules(patch.modules);
      statePatch.format = `3 месяца / ${statePatch.modules.length} модулей / еженедельно`;
      setActiveModuleIndex((current) => Math.min(current, statePatch.modules!.length - 1));
    }
    if (Object.keys(statePatch).length) {
      patchState(statePatch);
    }

    const activePatch = cleanModulePatch(patch.activeModule);
    if (Object.values(activePatch).some(Boolean) && !patch.modules?.length) {
      patchModule(activeModuleIndex, activePatch);
    }
  }

  async function handleModuleCountCommand(text: string, count: number): Promise<string> {
    let raw = '';
    try {
      raw = await requestProductAiRaw(`${buildProductBaseContext()}

Пользователь просит пересобрать программу по модулям.
Команда пользователя: ${text}

Текущий продукт:
${buildCompactProductContext(state)}

Сделай новую программу строго из ${count} модулей.
Важно:
- сохрани главный смысл продукта и путь клиента;
- убери лишние шаги;
- перепиши все оставшиеся модули так, чтобы программа была цельной;
- название каждого модуля пиши без слов "Модуль 1", "Модуль 2";
- не меняй тарифы.

Верни только JSON:
{
  "reply": "коротко что изменил",
  "patch": {
    "modules": [
      {
        "title": "название модуля",
        "job": "job клиента",
        "offer": "оффер модуля",
        "theses": ["тезис 1", "тезис 2", "тезис 3", "тезис 4"],
        "result": "результат модуля"
      }
    ],
    "transformation": "обновленное продуктовое обещание под новую программу"
  }
}`, 8000);
    } catch (err) {
      console.error('[ProductMain module count] AI error:', err);
    }

    const parsed = tryParseAiJson<ProductChatAiDraft>(raw);
    const aiModules = parsed?.patch?.modules?.length ? normalizeAiModules(parsed.patch.modules).slice(0, count) : [];

    if (aiModules.length === count) {
      applyProductChatPatch({
        ...parsed?.patch,
        modules: parsed?.patch?.modules?.slice(0, count),
        transformation: parsed?.patch?.transformation || buildLocalTransformation({ ...state, modules: aiModules }),
      });
      return parsed?.reply || `Пересобрал программу: теперь в ней ${count} модулей.`;
    }

    const fallbackModules = (state.modules ?? DEFAULT_MODULES).slice(0, count).map((module, index) => ({
      ...module,
      title: cleanModuleTitle(module.title, index),
    }));
    patchState({
      modules: fallbackModules,
      format: `3 месяца / ${fallbackModules.length} модулей / еженедельно`,
      transformation: state.transformation || buildLocalTransformation({ ...state, modules: fallbackModules }),
    });
    setActiveModuleIndex((current) => Math.min(current, fallbackModules.length - 1));
    return `Сократил программу до ${count} модулей и сохранил текущую логику. ИИ не вернул структуру в нужном формате, поэтому я аккуратно убрал лишние модули и оставил блоки редактируемыми.`;
  }

  async function handleProductChatSend() {
    const text = productChatInput.trim();
    const activeModule = state.modules?.[activeModuleIndex];
    if (!text || productChatLoading || !activeModule) return;

    const nextMessages: ProductChatMessage[] = [...productChatMessages, { role: 'user', content: text }];
    setProductChatMessages(nextMessages);
    setProductChatInput('');
    setProductChatLoading(true);

    try {
      const requestedModuleCount = extractRequestedModuleCount(text);
      if (requestedModuleCount) {
        const reply = await handleModuleCountCommand(text, requestedModuleCount);
        setProductChatMessages((current) => [...current, { role: 'assistant', content: reply }]);
        return;
      }

      const raw = await requestProductAiRaw(`${buildProductBaseContext()}

Ты работаешь как продуктовый методолог внутри конструктора основного продукта.
Ты можешь помогать и по выбранному модулю, и по всей программе сразу.
Если пользователь просит удалить лишние модули, сократить программу до 6 модулей, добавить модуль, пересобрать структуру, доработать все модули — выполни это в patch.modules.
Если пользователь просит доработать только выбранный модуль — выполни это в patch.activeModule.
Не отказывайся от комплексных правок. Делай их аккуратно и сохраняй смысл продукта.

Сейчас выбран модуль ${activeModuleIndex + 1}.

Текущий продукт:
${buildCompactProductContext(state)}

Текущий модуль:
Название: ${activeModule.title}
Job клиента: ${activeModule.job}
Оффер модуля: ${activeModule.offer}
Тезисы / содержание:
${activeModule.theses}
Результат модуля: ${activeModule.result}

История диалога по этому модулю:
${nextMessages.map((msg) => `${msg.role === 'user' ? 'Пользователь' : 'ИИ'}: ${msg.content}`).join('\n')}

Ответь пользователю коротко и по делу.

Верни только JSON:
{
  "reply": "короткий ответ пользователю, что именно предлагаешь или что изменил",
  "patch": {
    "offer": "новый общий оффер продукта, если нужно",
    "productDescription": "новое описание продукта, если нужно",
    "transformation": "новый общий результат продукта, если нужно",
    "activeModule": {
      "title": "новое название выбранного модуля, если нужно",
      "job": "новая job клиента, если нужно",
      "offer": "новый оффер модуля, если нужно",
      "theses": ["новый тезис 1", "новый тезис 2"],
      "result": "новый результат модуля, если нужно"
    },
    "modules": [
      {
        "title": "название модуля без слов Модуль 1 / Модуль 2",
        "job": "job клиента",
        "offer": "оффер модуля",
        "theses": ["тезис 1", "тезис 2", "тезис 3"],
        "result": "результат модуля"
      }
    ]
  }
}`, 4200);

      const resp = tryParseAiJson<ProductChatAiDraft>(raw);
      if (resp?.patch) {
        applyProductChatPatch(resp.patch);
      }

      setProductChatMessages((current) => [
        ...current,
        { role: 'assistant', content: resp?.reply || cleanCodeFence(raw) || 'Предложил правку для выбранного модуля.' },
      ]);
    } catch (err) {
      console.error('[ProductMain chat] AI error:', err);
      setProductChatMessages((current) => [
        ...current,
        { role: 'assistant', content: 'ИИ сейчас не смог применить правку автоматически. Попробуйте отправить команду ещё раз или используйте быстрые кнопки ниже.' },
      ]);
    } finally {
      setProductChatLoading(false);
    }
  }

  async function handleAiReview() {
    if (!state.generated || reviewing) return;
    setReviewing(true);
    try {
      const settings = getSettings('product-main');
      const prompt = `Ты продуктовый маркетолог. Проверь структуру основного продукта и дай рекомендации, НЕ переписывая продукт за пользователя.

Контекст проекта:
${context || 'Контекст пока не заполнен.'}

Текущий продукт:
${buildMainProductMarkdown(state)}

Дай короткий аудит:
1. Что сильное в продукте.
2. Что непонятно или слабо упаковано.
3. Какие модули стоит усилить.
4. Что улучшить в тарифах.
5. 5 точечных рекомендаций, которые эксперт может внести руками.

Не переписывай весь продукт. Только рекомендации.`;

      const resp = await aiApi.chat({
        model: settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel: settings.claudeModel,
        section: 'product-main',
        message: prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile: mergedProfile as Record<string, string>,
      });
      patchState({ aiReview: cleanCodeFence(resp.content) });
    } catch (err) {
      console.error('[ProductMain review] AI error:', err);
      toast.error('Не удалось проверить продукт с ИИ');
    } finally {
      setReviewing(false);
    }
  }

  const btnGold: React.CSSProperties = {
    background: loading ? '#e8d498' : '#D4A847',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 16px',
    fontSize: 13,
    cursor: loading ? 'not-allowed' : 'pointer',
    fontWeight: 500,
  };

  const btnOutlined: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #E5E3DC',
    color: '#555',
    borderRadius: 8,
    padding: '9px 16px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 500,
  };

  const blockStyle: React.CSSProperties = {
    background: '#F8F7F3',
    border: '1.5px solid #D8D4C8',
    borderRadius: 12,
    padding: 14,
    boxShadow: '0 8px 22px rgba(25, 24, 20, 0.04)',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    color: '#1a1a1a',
    letterSpacing: 1.3,
    marginBottom: 8,
    fontWeight: 800,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid #E5E3DC',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    color: '#1a1a1a',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };
  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: 86,
    resize: 'vertical',
    lineHeight: 1.55,
  };
  const subtleButton: React.CSSProperties = {
    background: '#1a1a1a',
    border: '1px solid #1a1a1a',
    color: '#fff',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 700,
  };
  const dangerButton: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #D8D4C8',
    color: '#7A2727',
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 700,
  };
  const modules = state.modules ?? DEFAULT_MODULES;
  const activeModule = modules[activeModuleIndex] ?? modules[0] ?? createEmptyModule(0);
  const stickyTop = 0;
  const stickyHeight = 'calc(100vh - 136px)';

  return (
    <div style={{ background: '#fff', minHeight: '100%', maxWidth: 1320, margin: '0 auto' }}>
      <h1 style={{ fontSize: 19, fontWeight: 600, color: '#1a1a1a', marginBottom: 6, marginTop: 0 }}>
        Основной продукт
      </h1>
      <p style={{ color: '#888', fontSize: 12, marginBottom: 24, marginTop: 0 }}>
        Блочный конструктор флагманской программы: оффер, 10 модулей, результат продукта и тарифы
      </p>

      {!state.generated && (
        <div style={{
          border: '1.5px dashed #D3D1C7', borderRadius: 12, padding: 40, marginBottom: 24,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160,
        }}>
          <div style={{ fontSize: 28, marginBottom: 12, color: '#ccc' }}>+</div>
          <div style={{ fontSize: 14, color: '#999' }}>Продукт ещё не создан</div>
          <div style={{ fontSize: 13, color: '#bbb', marginTop: 4 }}>Нажмите «Создать с AI»</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <button style={btnGold} onClick={() => void handleCreate()} disabled={loading}>
          {loading ? 'Создаю черновик...' : state.generated ? 'Пересоздать с AI' : 'Создать черновик с AI'}
        </button>
        {state.generated && (
          <>
            <button style={btnOutlined} onClick={() => void handleAiReview()} disabled={reviewing}>
              {reviewing ? 'Проверяю...' : 'Проверить с ИИ'}
            </button>
            <button style={btnOutlined} onClick={handleCopy}>Копировать</button>
            <button style={btnOutlined} onClick={handleDownload}>Скачать презентацию .pdf</button>
          </>
        )}
      </div>

      {loadingStep && (
        <div style={{
          marginBottom: 20,
          background: '#FFF8E8',
          border: '1px solid rgba(212,168,71,0.28)',
          borderRadius: 10,
          padding: '12px 14px',
          color: '#6f5516',
          fontSize: 13,
          fontWeight: 700,
        }}>
          {loadingStep}
        </div>
      )}

      {state.generated && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a', marginBottom: 12 }}>
              Варианты названия продукта
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              {normalizeNameOptions(state.nameOptions, state.name).map((name, index) => (
                <div key={index} style={{ ...blockStyle, background: index === 0 ? '#F1EBDD' : '#F8F7F3' }}>
                  <div style={labelStyle}>{index === 0 ? 'Вариант 1 / основной' : `Вариант ${index + 1}`}</div>
                  <AutoTextarea
                    value={name}
                    onChange={(value) => patchNameOption(index, value)}
                    style={{ ...textareaStyle, fontWeight: 800, fontSize: 15, background: '#fff' }}
                    minHeight={72}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            <div style={blockStyle}>
              <div style={labelStyle}>Оффер</div>
              <AutoTextarea value={state.offer ?? ''} onChange={(value) => patchState({ offer: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={130} />
            </div>

            <div style={blockStyle}>
              <div style={labelStyle}>Описание продукта</div>
              <AutoTextarea value={state.productDescription ?? ''} onChange={(value) => patchState({ productDescription: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={130} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a' }}>
                Программа по модулям
              </div>
              <button style={subtleButton} onClick={addModule}>+ Добавить модуль</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 320px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
              <div style={{ ...blockStyle, padding: 10, position: 'sticky', top: stickyTop, height: stickyHeight, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                {modules.map((module, index) => {
                  const filledFields = [module.title, module.job, module.offer, module.theses, module.result].filter((value) => value?.trim()).length;
                  const isActive = index === activeModuleIndex;
                  return (
                    <button
                      key={index}
                      onClick={() => setActiveModuleIndex(index)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: isActive ? '1.5px solid #D4A847' : '1px solid #E5E3DC',
                        background: isActive ? '#FFF8E8' : '#fff',
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 7,
                        cursor: 'pointer',
                        color: '#1a1a1a',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 900 }}>Модуль {index + 1}</span>
                        <span style={{ fontSize: 11, color: filledFields >= 5 ? '#3B6D11' : '#9A6A00', fontWeight: 800 }}>
                          {filledFields >= 5 ? 'заполнен' : `${filledFields}/5`}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.35, marginBottom: 5 }}>
                        {cleanModuleTitle(module.title, index)}
                      </div>
                      {module.result && (
                        <div style={{ fontSize: 11, color: '#666', lineHeight: 1.4 }}>
                          {module.result.slice(0, 120)}{module.result.length > 120 ? '...' : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(300px, 0.75fr)', gap: 14, alignItems: 'stretch', position: 'sticky', top: stickyTop, height: stickyHeight, overflow: 'hidden' }}>
                <div style={{ ...blockStyle, background: '#fff', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexShrink: 0 }}>
                    <div>
                      <div style={labelStyle}>Редактор выбранного модуля</div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a1a' }}>Модуль {activeModuleIndex + 1}</div>
                    </div>
                    <button
                      style={{ ...dangerButton, opacity: modules.length <= 1 ? 0.45 : 1 }}
                      onClick={() => removeModule(activeModuleIndex)}
                      disabled={modules.length <= 1}
                    >
                      Удалить модуль
                    </button>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column', gap: 7, paddingRight: 4 }}>
                    <div>
                      <div style={labelStyle}>Название модуля</div>
                      <AutoTextarea value={activeModule.title} onChange={(value) => patchModule(activeModuleIndex, { title: value })} style={{ ...textareaStyle, fontSize: 13, fontWeight: 800, background: '#fff' }} minHeight={42} maxHeight={76} />
                    </div>
                    <div>
                      <div style={labelStyle}>Job клиента</div>
                      <AutoTextarea value={activeModule.job} onChange={(value) => patchModule(activeModuleIndex, { job: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={54} maxHeight={92} />
                    </div>
                    <div>
                      <div style={labelStyle}>Оффер модуля</div>
                      <AutoTextarea value={activeModule.offer} onChange={(value) => patchModule(activeModuleIndex, { offer: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={54} maxHeight={92} />
                    </div>
                    <div>
                      <div style={labelStyle}>Тезисы / содержание</div>
                      <AutoTextarea value={activeModule.theses} onChange={(value) => patchModule(activeModuleIndex, { theses: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={76} maxHeight={150} />
                    </div>
                    <div style={{ background: '#F1EFE8', border: '1.5px solid #D8D4C8', borderRadius: 8, padding: 8 }}>
                      <div style={labelStyle}>Результат модуля</div>
                      <AutoTextarea value={activeModule.result} onChange={(value) => patchModule(activeModuleIndex, { result: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={56} maxHeight={96} />
                    </div>
                  </div>
                </div>

                <div style={{ ...blockStyle, background: '#111', color: '#fff', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 4 }}>ИИ по продукту</div>
                  <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.4, marginBottom: 10 }}>
                    Можно дорабатывать выбранный модуль или всю программу сразу: удалить лишние модули, сократить до 6, добавить блоки, усилить логику и результат.
                  </div>
                  <div style={{ flex: 1, minHeight: 90, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                    {productChatMessages.length === 0 && (
                      <div style={{ background: '#1f1f1f', borderRadius: 10, padding: 9, fontSize: 12, color: '#ddd', lineHeight: 1.4 }}>
                        Например: “Сократи программу до 6 модулей и пересобери логику так, чтобы клиент проходил путь без лишних шагов”.
                      </div>
                    )}
                    {productChatMessages.map((message, index) => (
                      <div
                        key={index}
                        style={{
                          alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '92%',
                          background: message.role === 'user' ? '#D4A847' : '#252525',
                          color: message.role === 'user' ? '#111' : '#fff',
                          borderRadius: 10,
                          padding: '8px 9px',
                          fontSize: 12,
                          lineHeight: 1.4,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {message.content}
                      </div>
                    ))}
                    {productChatLoading && (
                      <div style={{ fontSize: 12, color: '#bbb' }}>ИИ думает...</div>
                    )}
                  </div>
                  <AutoTextarea
                    value={productChatInput}
                    onChange={setProductChatInput}
                    style={{ ...textareaStyle, background: '#fff', color: '#1a1a1a', border: 'none', marginBottom: 10 }}
                    minHeight={58}
                  />
                  <button
                    style={{ ...btnGold, width: '100%', opacity: productChatLoading || !productChatInput.trim() ? 0.6 : 1 }}
                    onClick={() => void handleProductChatSend()}
                    disabled={productChatLoading || !productChatInput.trim()}
                  >
                    {productChatLoading ? 'Отправляю...' : 'Отправить ИИ'}
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 10 }}>
                    {['Усиль выбранный модуль', 'Сократи программу до 6 модулей', 'Пересобери логику всех модулей'].map((quickPrompt) => (
                      <button
                        key={quickPrompt}
                        style={{ ...btnOutlined, padding: '7px 9px', fontSize: 11, background: '#1f1f1f', color: '#fff', borderColor: '#333' }}
                        onClick={() => setProductChatInput(quickPrompt)}
                      >
                        {quickPrompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...blockStyle, background: '#EAF2FF', borderColor: '#BFD4F4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ ...labelStyle, color: '#2F5F9F', marginBottom: 0 }}>Общий результат продукта / продуктовое обещание</div>
              <button style={btnOutlined} onClick={() => void handleGenerateTransformation()} disabled={loading}>
                {state.transformation ? 'Пересобрать с ИИ' : 'Дозаполнить с ИИ'}
              </button>
            </div>
            <AutoTextarea value={state.transformation ?? ''} onChange={(value) => patchState({ transformation: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={120} />
          </div>

          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a', marginBottom: 12 }}>
              Тарифы
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              {(state.tariffs ?? DEFAULT_TARIFFS).map((tariff, index) => (
                <div key={index} style={{ ...blockStyle, background: index === 1 ? '#FFF8E8' : '#fff' }}>
                  <input value={tariff.name} onChange={(e) => patchTariff(index, { name: e.target.value })} style={{ ...inputStyle, fontSize: 17, fontWeight: 800, marginBottom: 10 }} />
                  <input value={tariff.price} onChange={(e) => patchTariff(index, { price: e.target.value })} style={{ ...inputStyle, fontSize: 16, fontWeight: 800, color: '#9A6A00', marginBottom: 10 }} />
                  <div style={labelStyle}>Описание тарифа</div>
                  <textarea value={tariff.description} onChange={(e) => patchTariff(index, { description: e.target.value })} style={textareaStyle} />
                  <div style={labelStyle}>Что входит</div>
                  <textarea value={tariff.included} onChange={(e) => patchTariff(index, { included: e.target.value })} style={{ ...textareaStyle, minHeight: 130 }} />
                  <div style={labelStyle}>Поддержка</div>
                  <textarea value={tariff.support} onChange={(e) => patchTariff(index, { support: e.target.value })} style={textareaStyle} />
                </div>
              ))}
            </div>
          </div>

          {state.aiReview && (
            <div style={{ ...blockStyle, borderColor: 'rgba(212,168,71,0.35)', background: '#FFFDF7' }}>
              <div style={labelStyle}>Рекомендации ИИ</div>
              <FormattedText>{state.aiReview}</FormattedText>
            </div>
          )}
        </div>
      )}
      {materialStatus && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#3B6D11' }}>{materialStatus}</div>
      )}
    </div>
  );
}
