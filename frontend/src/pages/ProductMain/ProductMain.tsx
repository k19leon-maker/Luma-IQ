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
}

const FIELDS: { key: keyof Omit<ProductState, 'description' | 'generated'>; label: string }[] = [
  { key: 'name',     label: 'Название' },
  { key: 'price',    label: 'Тарифы' },
  { key: 'format',   label: 'Формат' },
  { key: 'duration', label: 'Длительность' },
];

function extractName(markdown: string, fallback: string): string {
  const heading = markdown.match(/^##\s+1\.\s+Название продукта\s*\n+(.+)$/im)?.[1]
    ?? markdown.match(/^#\s+(.+)$/m)?.[1];
  return heading?.replace(/^\d+[\.\)]\s*/, '').replace(/\*/g, '').trim().slice(0, 80) || fallback;
}

export default function ProductMain() {
  const { activeProjectId, projectName, context, mergedProfile } = useProjectMarketingContext();
  const getSettings = useModelStore((s) => s.getSettings);
  const savedData = useGeneratedStore((s) => s.getProject(activeProjectId));
  const saveProductMain = useGeneratedStore((s) => s.setProductMain);
  const upsertMaterial = useMaterialsStore((s) => s.upsertMaterial);
  const completeProductMain = useProgressStore((s) => s.completeProductMain);

  const [state,   setState]   = useState<ProductState>({ name: '', price: '', format: '', duration: '', description: '', generated: false });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [materialStatus, setMaterialStatus] = useState('');

  useEffect(() => {
    const savedProduct = savedData.productMain ?? { name: '', price: '', format: '', duration: '', description: '', generated: false };
    setState(savedProduct);
    setEditing(false);
    if (activeProjectId && savedProduct.generated) {
      upsertMaterial(activeProjectId, buildProductMaterial('product-main', 'Основной продукт', savedProduct));
    }
  }, [activeProjectId, savedData.productMain, upsertMaterial]);

  function persistState(next: ProductState) {
    setState(next);
    if (activeProjectId) saveProductMain(activeProjectId, next as ProductDraft);
    if (activeProjectId) upsertMaterial(activeProjectId, buildProductMaterial('product-main', 'Основной продукт', next as ProductDraft));
    if (next.generated) completeProductMain();
    if (next.generated) {
      setMaterialStatus('Материал product-main.md обновлен в knowledge base');
      setTimeout(() => setMaterialStatus(''), 2500);
    }
  }

  async function handleCreate() {
    if (loading) return;
    setLoading(true);
    try {
      const settings = getSettings('product-main');
      const prompt   = `Ты продуктовый маркетолог и методолог экспертных продуктов с большим опытом в нише пользователя.
Создай флагманский ОСНОВНОЙ ПРОДУКТ эксперта.

Контекст проекта:
${context || 'Контекст пока не заполнен.'}

Требования:
- Это флагман на 2–3 месяца.
- Логика: еженедельные модули, 8–12 модулей.
- Каждый модуль решает отдельную job-to-be-done клиента.
- В каждом модуле должны быть: Job клиента, оффер модуля, тезисы, практика, результат.
- В конце нужна итоговая трансформация: результат результата.
- Обязательно сделай 3 тарифа: Эконом, Стандарт, VIP.
- Не подставляй психологию или другую нишу, если ее нет в контексте.
- Пиши как готовую структуру продукта для эксперта, без вступлений от себя.

Верни markdown строго по структуре:

# Основной продукт

## 1. Название продукта
Дай 3 варианта названия.

## 2. Главный оффер продукта
Для кого -> какую проблему решает -> к какому результату приводит -> за счет чего.

## 3. Краткое описание продукта
5–7 предложений.

## 4. Формат и длительность
- Длительность
- Количество модулей
- Ритм прохождения
- Формат встреч / уроков / сопровождения
- Практика между модулями

## 5. Программа по модулям
Сделай 8–12 модулей.
Для каждого модуля:
### Модуль N. [Название как job-to-be-done клиента]
**Job клиента:** ...
**Оффер модуля:** ...
**Что разбираем:**
- ...
- ...
- ...
**Практика / задание:** ...
**Результат модуля:** ...

## 6. Итоговая трансформация
Опиши, что меняется в проблеме, поведении, деньгах/времени/энергии/уверенности/бизнесе, если релевантно.

## 7. Тарифы
### Эконом
**Для кого:** ...
**Что входит:**
- ...
**Формат поддержки:** ...
**Ограничения:** ...
**Главная ценность:** ...

### Стандарт
...

### VIP
...

## 8. Как продавать этот продукт
- Главный продающий акцент
- 3 боли
- 3 желания
- 3 CTA`;

      const resp   = await aiApi.chat({
        model:               settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel:         settings.claudeModel,
        section:             'product-main',
        message:             prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile:    mergedProfile as Record<string, string>,
      });

      const content = resp.content.replace(/```(?:markdown|md)?|```/g, '').trim();
      persistState({
        name: extractName(content, 'Основной продукт'),
        price: 'Эконом / Стандарт / VIP',
        format: 'Флагманская программа по модулям',
        duration: '2–3 месяца',
        description: content,
        generated: true,
      });
    } catch (err) {
      console.error('[ProductMain] AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!state.description) return;
    navigator.clipboard.writeText(state.description).catch(() => undefined);
    toast.success('Скопировано');
  }

  function handleDownload() {
    if (!state.description) return;
    void exportToDocx(state.name || 'Основной продукт', state.description, state.name || 'product-main');
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

  const labelStyle: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', color: '#999', letterSpacing: 1.5, marginBottom: 4 };
  const valueStyle: React.CSSProperties = { fontSize: 14, color: '#1a1a1a', fontWeight: 500 };

  return (
    <div style={{ background: '#fff', minHeight: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', marginBottom: 8, marginTop: 0 }}>
        Основной продукт
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 32, marginTop: 0 }}>
        Флагманская программа на 2–3 месяца: оффер, модули, итоговая трансформация и тарифы
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
        {['8–12 еженедельных модулей', '3 тарифа: Эконом / Стандарт / VIP', 'Каждый модуль = отдельная job клиента'].map((item) => (
          <div key={item} style={{ background: '#FFF8E8', border: '1px solid rgba(212,168,71,0.22)', borderRadius: 10, padding: 14, fontSize: 13, color: '#6f5516', fontWeight: 600 }}>
            {item}
          </div>
        ))}
      </div>

      {state.generated ? (
        <div style={{ background: '#F5F4F0', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <div style={labelStyle}>{label}</div>
                {editing ? (
                  <input
                    value={state[key]}
                    onChange={(e) => persistState({ ...state, [key]: e.target.value })}
                    style={{ fontSize: 14, border: '1px solid #D4A847', borderRadius: 6, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
                  />
                ) : (
                  <div style={valueStyle}>{state[key]}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
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
          {loading ? 'Создаю...' : 'Создать с AI'}
        </button>
        {state.generated && (
          <>
            <button style={btnOutlined} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Готово' : 'Редактировать'}
            </button>
            <button style={btnOutlined} onClick={handleCopy}>Копировать</button>
            <button style={btnOutlined} onClick={handleDownload}>Скачать .docx</button>
          </>
        )}
      </div>

      {state.generated && state.description && (
        editing ? (
          <textarea
            value={state.description}
            onChange={(e) => persistState({ ...state, description: e.target.value })}
            style={{
              width: '100%', minHeight: 520, padding: 16,
              border: '1px solid #D4A847',
              borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
              color: '#333', background: '#fff', resize: 'vertical', boxSizing: 'border-box',
              lineHeight: 1.65,
            }}
          />
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E5E3DC', borderRadius: 12, padding: 24 }}>
            <FormattedText>{state.description}</FormattedText>
          </div>
        )
      )}
      {materialStatus && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#3B6D11' }}>{materialStatus}</div>
      )}
    </div>
  );
}
