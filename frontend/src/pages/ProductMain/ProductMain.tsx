import { useEffect, useState } from 'react';
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

interface MainProductAiDraft {
  name?: string;
  nameOptions?: string[];
  offer?: string;
  productDescription?: string;
  modules?: ModuleBlock[];
  transformation?: string;
  tariffs?: TariffBlock[];
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

function normalizeTariffs(tariffs?: TariffBlock[]): TariffBlock[] {
  const source = tariffs?.slice(0, 3) ?? [];
  return Array.from({ length: 3 }, (_, index) => ({
    ...DEFAULT_TARIFFS[index]!,
    ...(source[index] ?? {}),
  }));
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
  const [reviewing, setReviewing] = useState(false);
  const [materialStatus, setMaterialStatus] = useState('');

  useEffect(() => {
    const savedProduct = normalizeProduct(savedData.productMain);
    setState(savedProduct);
    if (activeProjectId && savedProduct.generated) {
      upsertMaterial(activeProjectId, buildProductMaterial('product-main', 'Основной продукт', savedProduct));
    }
  }, [activeProjectId, savedData.productMain, upsertMaterial]);

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

  async function handleCreate() {
    if (loading) return;
    setLoading(true);
    try {
      const settings = getSettings('product-main');
      const prompt   = `Ты продуктовый маркетолог и методолог экспертных продуктов с большим опытом в нише пользователя.
Создай структурированный черновик флагманского ОСНОВНОГО ПРОДУКТА эксперта.

Контекст проекта:
${context || 'Контекст пока не заполнен.'}

Требования:
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

Верни только JSON без markdown-блоков:
{
  "name": "название продукта",
  "nameOptions": ["вариант названия 1", "вариант названия 2", "вариант названия 3"],
  "offer": "главный оффер продукта",
  "productDescription": "описание продукта в 5-7 предложениях",
  "modules": [
    {
      "title": "название модуля как job-to-be-done",
      "job": "что клиент хочет сделать/понять/изменить",
      "offer": "оффер этого модуля",
      "theses": "- тезис 1\\n- тезис 2\\n- тезис 3",
      "result": "конкретный результат модуля"
    }
  ],
  "transformation": "общий результат продукта / продуктовое обещание",
  "tariffs": [
    {
      "name": "Эконом",
      "price": "35 000 ₽",
      "description": "для кого тариф",
      "included": "что входит списком через переносы строк",
      "support": "формат поддержки"
    }
  ]
}

В modules должно быть строго 10 элементов.
В tariffs должно быть строго 3 элемента: Эконом, Стандарт, VIP.`;

      const resp   = await aiApi.chat({
        model:               settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel:         settings.claudeModel,
        section:             'product-main',
        message:             prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile:    mergedProfile as Record<string, string>,
      });

      const draft = JSON.parse(cleanCodeFence(resp.content)) as MainProductAiDraft;
      const nameOptions = normalizeNameOptions(
        draft.nameOptions?.length ? draft.nameOptions : [draft.name ?? 'Основной продукт', '', ''],
        draft.name,
      );
      const next: ProductState = {
        ...EMPTY_PRODUCT,
        nameOptions,
        name: draft.name?.trim() || nameOptions.find(Boolean)?.trim() || 'Основной продукт',
        price: '35 000 / 50 000 / 80 000 ₽',
        format: '3 месяца / 10 модулей / еженедельно',
        duration: '3 месяца',
        offer: draft.offer ?? '',
        productDescription: draft.productDescription ?? '',
        modules: normalizeModules(draft.modules),
        transformation: draft.transformation ?? '',
        tariffs: normalizeTariffs(draft.tariffs),
        description: '',
        generated: true,
      };
      persistState(next);
    } catch (err) {
      console.error('[ProductMain] AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
    } finally {
      setLoading(false);
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14 }}>
              {(state.modules ?? DEFAULT_MODULES).map((module, index) => (
                <div key={index} style={{ ...blockStyle, padding: 0, overflow: 'hidden', background: '#F8F7F3' }}>
                  <div style={{ background: '#E7E1D4', borderBottom: '1.5px solid #D8D4C8', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#1a1a1a', minWidth: 78 }}>Модуль {index + 1}</div>
                    <input
                      value={module.title}
                      onChange={(e) => patchModule(index, { title: e.target.value })}
                      style={{ ...inputStyle, padding: '7px 9px', fontWeight: 800, background: '#fff', borderColor: '#CEC8B8' }}
                    />
                    <button
                      style={{ ...dangerButton, opacity: (state.modules?.length ?? DEFAULT_MODULES.length) <= 1 ? 0.45 : 1 }}
                      onClick={() => removeModule(index)}
                      disabled={(state.modules?.length ?? DEFAULT_MODULES.length) <= 1}
                    >
                      Удалить
                    </button>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={labelStyle}>Job клиента</div>
                      <textarea value={module.job} onChange={(e) => patchModule(index, { job: e.target.value })} style={{ ...textareaStyle, background: '#fff' }} />
                    </div>
                    <div>
                      <div style={labelStyle}>Оффер модуля</div>
                      <textarea value={module.offer} onChange={(e) => patchModule(index, { offer: e.target.value })} style={{ ...textareaStyle, background: '#fff' }} />
                    </div>
                    <div>
                      <div style={labelStyle}>Тезисы / содержание</div>
                      <textarea value={module.theses} onChange={(e) => patchModule(index, { theses: e.target.value })} style={{ ...textareaStyle, minHeight: 120, background: '#fff' }} />
                    </div>
                    <div style={{ background: '#F1EFE8', border: '1.5px solid #D8D4C8', borderRadius: 8, padding: 10 }}>
                      <div style={labelStyle}>Результат модуля</div>
                      <textarea value={module.result} onChange={(e) => patchModule(index, { result: e.target.value })} style={{ ...textareaStyle, background: '#fff' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...blockStyle, background: '#EAF2FF', borderColor: '#BFD4F4' }}>
            <div style={{ ...labelStyle, color: '#2F5F9F' }}>Общий результат продукта / продуктовое обещание</div>
            <textarea value={state.transformation ?? ''} onChange={(e) => patchState({ transformation: e.target.value })} style={{ ...textareaStyle, minHeight: 120, background: '#fff' }} />
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
