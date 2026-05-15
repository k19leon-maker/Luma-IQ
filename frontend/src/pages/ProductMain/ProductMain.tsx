import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useModelStore } from '../../store/model.store';
import { useGeneratedStore, type ProductDraft } from '../../store/generated.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { aiApi } from '../../api/ai';
import { buildProductMaterial } from '../../utils/projectMaterials';
import { exportToDocx } from '../../utils/exportDocx';
import FormattedText from '../../components/FormattedText/FormattedText';

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

interface MainProductAiTariff {
  name?: string;
  price?: AiTextValue;
  description?: AiTextValue;
  included?: AiTextValue;
  support?: AiTextValue;
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

interface ProductTransformationAiDraft {
  transformation?: string;
}

interface ProductTariffsAiDraft {
  tariffs?: MainProductAiTariff[];
}

interface ProductChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProductChatAiDraft {
  reply?: string;
  patch?: Partial<ModuleBlock>;
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

function aiText(value: AiTextValue): string {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join('\n');
  return typeof value === 'string' ? value : '';
}

function AutoTextarea({
  value,
  onChange,
  style,
  minHeight = 84,
}: {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  minHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [value, minHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...style, minHeight, overflow: 'hidden' }}
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
    tariffs: raw.tariffs?.length ? raw.tariffs : DEFAULT_TARIFFS,
  };
}

function normalizeModules(modules?: ModuleBlock[]): ModuleBlock[] {
  const source = modules?.length ? modules : DEFAULT_MODULES;
  return source.map((module, index) => ({
    ...createEmptyModule(index),
    ...module,
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

function normalizeAiTariffs(tariffs?: MainProductAiTariff[]): TariffBlock[] {
  return normalizeTariffs(
    tariffs?.map((tariff, index) => ({
      name: tariff.name || DEFAULT_TARIFFS[index]?.name || `Тариф ${index + 1}`,
      price: aiText(tariff.price),
      description: aiText(tariff.description),
      included: aiText(tariff.included),
      support: aiText(tariff.support),
    })),
  );
}

function cleanModulePatch(patch?: Partial<ModuleBlock>): Partial<ModuleBlock> {
  if (!patch) return {};
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => typeof value === 'string' && value.trim()),
  ) as Partial<ModuleBlock>;
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

  async function requestProductAiJson<T>(message: string, maxTokens = 2200): Promise<T> {
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
    return parseAiJson<T>(resp.content);
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
- Обязательно сделай 3 тарифа: Эконом, Стандарт, VIP.
- Базовые цены: Эконом 35 000 ₽, Стандарт 50 000 ₽, VIP 80 000 ₽.
- Логика тарифов:
  - Эконом: 8 модулей + закрытый Telegram-чат.
  - Стандарт: 8 модулей + мини-группа + закрытый Telegram-чат.
  - VIP: все 10 модулей + мини-группа + индивидуальная работа + закрытый Telegram-чат.
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
      const resultDraft = await requestProductAiJson<ProductTransformationAiDraft>(`${baseContext}

Уже создан продукт:
${buildMainProductMarkdown(next)}

Сейчас создай только общий результат продукта / продуктовое обещание.
Опиши итоговую трансформацию клиента после прохождения всей программы: что изменится в бизнесе/жизни, какие решения появятся, какой результат станет возможен.

Верни только JSON без markdown-блоков:
{
  "transformation": "общий результат продукта / продуктовое обещание"
}`, 1600);

      next = {
        ...next,
        transformation: resultDraft.transformation ?? '',
      };
      persistState(next);

      setLoadingStep('Генерирую тарифы...');
      const tariffsDraft = await requestProductAiJson<ProductTariffsAiDraft>(`${baseContext}

Уже создан продукт:
${buildMainProductMarkdown(next)}

Сейчас создай только 3 тарифа.

Верни только JSON без markdown-блоков:
{
  "tariffs": [
    {
      "name": "Эконом",
      "price": "35 000 ₽",
      "description": "для кого тариф",
      "included": ["что входит 1", "что входит 2", "что входит 3"],
      "support": "формат поддержки"
    }
  ]
}

В tariffs должно быть строго 3 элемента: Эконом, Стандарт, VIP.`, 1800);

      next = {
        ...next,
        tariffs: normalizeAiTariffs(tariffsDraft.tariffs),
      };
      persistState(next);
      toast.success('Основной продукт создан');
    } catch (err) {
      console.error('[ProductMain] AI error:', err);
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
    const fileName = state.name || state.nameOptions?.find(Boolean) || 'Основной продукт';
    void exportToDocx(fileName, buildMainProductMarkdown(state), fileName || 'product-main');
  }

  async function handleGenerateTransformation() {
    if (!state.generated || loading) return;
    setLoading(true);
    setLoadingStep('Дозаполняю общий результат продукта...');
    try {
      const resultDraft = await requestProductAiJson<ProductTransformationAiDraft>(`${buildProductBaseContext()}

Текущий продукт:
${buildMainProductMarkdown(state)}

Сгенерируй только общий результат продукта / продуктовое обещание.
Верни только JSON:
{
  "transformation": "итоговая трансформация клиента после всей программы"
}`, 1600);

      patchState({ transformation: resultDraft.transformation ?? '' });
      toast.success('Общий результат заполнен');
    } catch (err) {
      console.error('[ProductMain transformation] AI error:', err);
      toast.error('Не удалось дозаполнить общий результат');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
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
      const resp = await requestProductAiJson<ProductChatAiDraft>(`${buildProductBaseContext()}

Ты работаешь как продуктовый методолог внутри редактора модуля.
Пользователь редактирует модуль ${activeModuleIndex + 1}.

Текущий продукт:
${buildMainProductMarkdown(state)}

Текущий модуль:
Название: ${activeModule.title}
Job клиента: ${activeModule.job}
Оффер модуля: ${activeModule.offer}
Тезисы / содержание:
${activeModule.theses}
Результат модуля: ${activeModule.result}

История диалога по этому модулю:
${nextMessages.map((msg) => `${msg.role === 'user' ? 'Пользователь' : 'ИИ'}: ${msg.content}`).join('\n')}

Ответь пользователю коротко и по делу. Если пользователь просит улучшить, переписать, усилить или применить идею к модулю, верни patch только для полей, которые нужно изменить.

Верни только JSON:
{
  "reply": "короткий ответ пользователю, что именно предлагаешь или что изменил",
  "patch": {
    "title": "новое название модуля, если нужно",
    "job": "новая job клиента, если нужно",
    "offer": "новый оффер модуля, если нужно",
    "theses": "новые тезисы через переносы строк, если нужно",
    "result": "новый результат модуля, если нужно"
  }
}`, 2200);

      const patch = cleanModulePatch(resp.patch);
      if (Object.values(patch).some(Boolean)) {
        patchModule(activeModuleIndex, patch);
      }

      setProductChatMessages((current) => [
        ...current,
        { role: 'assistant', content: resp.reply || 'Предложил правку для выбранного модуля.' },
      ]);
    } catch (err) {
      console.error('[ProductMain chat] AI error:', err);
      setProductChatMessages((current) => [
        ...current,
        { role: 'assistant', content: 'Не получилось обработать запрос. Попробуйте сформулировать короче.' },
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
    padding: '10px 20px',
    fontSize: 14,
    cursor: loading ? 'not-allowed' : 'pointer',
    fontWeight: 500,
  };

  const btnOutlined: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #E5E3DC',
    color: '#555',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 500,
  };

  const blockStyle: React.CSSProperties = {
    background: '#F8F7F3',
    border: '1.5px solid #D8D4C8',
    borderRadius: 12,
    padding: 18,
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
    padding: '10px 12px',
    fontSize: 14,
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
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 700,
  };
  const dangerButton: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #D8D4C8',
    color: '#7A2727',
    borderRadius: 8,
    padding: '7px 10px',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 700,
  };
  const modules = state.modules ?? DEFAULT_MODULES;
  const activeModule = modules[activeModuleIndex] ?? modules[0] ?? createEmptyModule(0);

  return (
    <div style={{ background: '#fff', minHeight: '100%', maxWidth: 1320, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', marginBottom: 8, marginTop: 0 }}>
        Основной продукт
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 32, marginTop: 0 }}>
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
            <button style={btnOutlined} onClick={handleDownload}>Скачать .docx</button>
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
                  <textarea
                    value={name}
                    onChange={(e) => patchNameOption(index, e.target.value)}
                    style={{ ...textareaStyle, minHeight: 72, fontWeight: 800, fontSize: 16, background: '#fff' }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            <div style={blockStyle}>
              <div style={labelStyle}>Оффер</div>
              <textarea value={state.offer ?? ''} onChange={(e) => patchState({ offer: e.target.value })} style={{ ...textareaStyle, minHeight: 130, background: '#fff' }} />
            </div>

            <div style={blockStyle}>
              <div style={labelStyle}>Описание продукта</div>
              <textarea value={state.productDescription ?? ''} onChange={(e) => patchState({ productDescription: e.target.value })} style={{ ...textareaStyle, minHeight: 130, background: '#fff' }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a' }}>
                Программа по модулям
              </div>
              <button style={subtleButton} onClick={addModule}>+ Добавить модуль</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
              <div style={{ ...blockStyle, padding: 10, position: 'sticky', top: 12 }}>
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
                        padding: 12,
                        marginBottom: 8,
                        cursor: 'pointer',
                        color: '#1a1a1a',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 900 }}>Модуль {index + 1}</span>
                        <span style={{ fontSize: 11, color: filledFields >= 5 ? '#3B6D11' : '#9A6A00', fontWeight: 800 }}>
                          {filledFields >= 5 ? 'заполнен' : `${filledFields}/5`}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.35, marginBottom: 6 }}>
                        {module.title || `Модуль ${index + 1}`}
                      </div>
                      {module.result && (
                        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4 }}>
                          {module.result.slice(0, 120)}{module.result.length > 120 ? '...' : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.65fr)', gap: 16, alignItems: 'start' }}>
                <div style={{ ...blockStyle, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                    <div>
                      <div style={labelStyle}>Редактор выбранного модуля</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#1a1a1a' }}>Модуль {activeModuleIndex + 1}</div>
                    </div>
                    <button
                      style={{ ...dangerButton, opacity: modules.length <= 1 ? 0.45 : 1 }}
                      onClick={() => removeModule(activeModuleIndex)}
                      disabled={modules.length <= 1}
                    >
                      Удалить модуль
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <div style={labelStyle}>Название модуля</div>
                      <AutoTextarea value={activeModule.title} onChange={(value) => patchModule(activeModuleIndex, { title: value })} style={{ ...textareaStyle, fontSize: 16, fontWeight: 800, background: '#fff' }} minHeight={52} />
                    </div>
                    <div>
                      <div style={labelStyle}>Job клиента</div>
                      <AutoTextarea value={activeModule.job} onChange={(value) => patchModule(activeModuleIndex, { job: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={82} />
                    </div>
                    <div>
                      <div style={labelStyle}>Оффер модуля</div>
                      <AutoTextarea value={activeModule.offer} onChange={(value) => patchModule(activeModuleIndex, { offer: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={82} />
                    </div>
                    <div>
                      <div style={labelStyle}>Тезисы / содержание</div>
                      <AutoTextarea value={activeModule.theses} onChange={(value) => patchModule(activeModuleIndex, { theses: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={130} />
                    </div>
                    <div style={{ background: '#F1EFE8', border: '1.5px solid #D8D4C8', borderRadius: 8, padding: 10 }}>
                      <div style={labelStyle}>Результат модуля</div>
                      <AutoTextarea value={activeModule.result} onChange={(value) => patchModule(activeModuleIndex, { result: value })} style={{ ...textareaStyle, background: '#fff' }} minHeight={90} />
                    </div>
                  </div>
                </div>

                <div style={{ ...blockStyle, background: '#111', color: '#fff', position: 'sticky', top: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 4 }}>ИИ по модулю {activeModuleIndex + 1}</div>
                  <div style={{ fontSize: 12, color: '#bbb', lineHeight: 1.45, marginBottom: 14 }}>
                    Обсуждайте модуль, просите усилить оффер, упростить язык или добавить содержание. Если ИИ предложит правку, она применится к выбранному модулю.
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                    {productChatMessages.length === 0 && (
                      <div style={{ background: '#1f1f1f', borderRadius: 10, padding: 10, fontSize: 13, color: '#ddd', lineHeight: 1.45 }}>
                        Например: “Усиль результат модуля и сделай его конкретнее для клиента”.
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
                          padding: '9px 10px',
                          fontSize: 13,
                          lineHeight: 1.45,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {message.content}
                      </div>
                    ))}
                    {productChatLoading && (
                      <div style={{ fontSize: 13, color: '#bbb' }}>ИИ думает...</div>
                    )}
                  </div>
                  <AutoTextarea
                    value={productChatInput}
                    onChange={setProductChatInput}
                    style={{ ...textareaStyle, background: '#fff', color: '#1a1a1a', border: 'none', marginBottom: 10 }}
                    minHeight={80}
                  />
                  <button
                    style={{ ...btnGold, width: '100%', opacity: productChatLoading || !productChatInput.trim() ? 0.6 : 1 }}
                    onClick={() => void handleProductChatSend()}
                    disabled={productChatLoading || !productChatInput.trim()}
                  >
                    {productChatLoading ? 'Отправляю...' : 'Отправить ИИ'}
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 10 }}>
                    {['Усиль оффер модуля', 'Сделай результат конкретнее', 'Упрости язык для клиента'].map((quickPrompt) => (
                      <button
                        key={quickPrompt}
                        style={{ ...btnOutlined, padding: '8px 10px', fontSize: 12, background: '#1f1f1f', color: '#fff', borderColor: '#333' }}
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
