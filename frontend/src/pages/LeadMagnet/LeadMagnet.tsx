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
  { key: 'price',    label: 'Цена' },
  { key: 'format',   label: 'Формат' },
  { key: 'duration', label: 'Длительность / изучение' },
];

function extractName(markdown: string, fallback: string): string {
  const heading = markdown.match(/^##\s+2\.\s+Тема лид-магнита\s*\n+(.+)$/im)?.[1]
    ?? markdown.match(/^#\s+(.+)$/m)?.[1];
  return heading?.replace(/^\d+[\.\)]\s*/, '').replace(/\*/g, '').trim().slice(0, 80) || fallback;
}

export default function LeadMagnet() {
  const { activeProjectId, projectName, context, mergedProfile } = useProjectMarketingContext();
  const getSettings = useModelStore((s) => s.getSettings);
  const savedData = useGeneratedStore((s) => s.getProject(activeProjectId));
  const saveLeadMagnet = useGeneratedStore((s) => s.setLeadMagnet);
  const upsertMaterial = useMaterialsStore((s) => s.upsertMaterial);
  const completeLeadMagnet = useProgressStore((s) => s.completeLeadMagnet);

  const [state,   setState]   = useState<ProductState>({ name: '', price: '', format: '', duration: '', description: '', generated: false });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [materialStatus, setMaterialStatus] = useState('');

  useEffect(() => {
    const savedProduct = savedData.leadMagnet ?? { name: '', price: '', format: '', duration: '', description: '', generated: false };
    setState(savedProduct);
    setEditing(false);
    if (activeProjectId && savedProduct.generated) {
      upsertMaterial(activeProjectId, buildProductMaterial('lead-magnet', 'Лид-магнит', savedProduct));
    }
  }, [activeProjectId, savedData.leadMagnet, upsertMaterial]);

  function persistState(next: ProductState) {
    setState(next);
    if (activeProjectId) saveLeadMagnet(activeProjectId, next as ProductDraft);
    if (activeProjectId) upsertMaterial(activeProjectId, buildProductMaterial('lead-magnet', 'Лид-магнит', next as ProductDraft));
    if (next.generated) completeLeadMagnet();
    if (next.generated) {
      setMaterialStatus('Материал lead-magnet.md обновлен в knowledge base');
      setTimeout(() => setMaterialStatus(''), 2500);
    }
  }

  async function handleCreate() {
    if (loading) return;
    setLoading(true);
    try {
      const settings = getSettings('lead-magnet');
      const prompt   = `Ты продуктовый маркетолог и копирайтер воронок. Спроектируй ЛИД-МАГНИТ для проекта.
Лид-магнит — бесплатный вход в воронку. Его задача: не просто дать пользу, а подготовить человека к следующему шагу.

Контекст проекта:
${context || 'Контекст пока не заполнен.'}

Важное различие:
- Статья в разделе “Контент” — публичная статья для площадки.
- Лид-магнитная статья — продающий лонгрид внутри воронки, цель которого привести к диагностике, мини-продукту или консультации.

Форматы лид-магнита только два:
1. Продающий лонгрид / статья
2. Видеоурок

Требования:
- Выбери лучший формат под аудиторию и запрос.
- Не предлагай PDF-гайд, чек-лист или другие форматы.
- Обязательно покажи структуру материала.
- Обязательно дай CTA на следующий шаг.
- Не подставляй психологию или другую нишу, если ее нет в контексте.

Верни markdown строго по структуре:

# Лид-магнит

## 1. Лучший формат
Выбери: продающий лонгрид или видеоурок. Объясни почему.

## 2. Тема лид-магнита
Дай 3 варианта темы.

## 3. Главный крючок
Формулировка, которая заставляет открыть материал.

## 4. Обещание
Что человек поймет или сможет сделать после материала.

## 5. Структура материала
Если формат продающий лонгрид:
1. Заголовок
2. Узнаваемая проблема
3. Почему это происходит
4. Главная ошибка аудитории
5. Новый взгляд / инсайт
6. Мини-метод или рамка решения
7. Пример / кейс
8. Что сделать прямо сейчас
9. Почему самостоятельно сложно
10. Переход к следующему шагу

Если формат видеоурок:
1. Хук первых 30 секунд
2. Диагностика проблемы
3. Ошибка, из-за которой человек застрял
4. Новый подход
5. 3–5 ключевых тезисов
6. Мини-практика
7. Пример / кейс
8. CTA на следующий шаг

## 6. CTA
Сформулируй 3 варианта:
- на диагностику;
- на мини-продукт;
- на консультацию / следующий шаг.

## 7. Как использовать в воронке
- где человек получает лид-магнит;
- что происходит сразу после получения;
- какие сообщения нужны после;
- как переводить в следующий шаг.`;

      const resp = await aiApi.chat({
        model:               settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel:         settings.claudeModel,
        section:             'lead-magnet',
        message:             prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile:    mergedProfile as Record<string, string>,
      });

      const content = resp.content.replace(/```(?:markdown|md)?|```/g, '').trim();
      persistState({
        name: extractName(content, 'Лид-магнит'),
        price: 'Бесплатно',
        format: 'Продающий лонгрид или видеоурок',
        duration: '10–30 минут изучения',
        description: content,
        generated: true,
      });
    } catch (err) {
      console.error('[LeadMagnet] AI error:', err);
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
    void exportToDocx(state.name || 'Лид-магнит', state.description, state.name || 'lead-magnet');
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
        Лид-магнит
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 32, marginTop: 0 }}>
        Бесплатный вход в воронку: продающий лонгрид или видеоурок, который ведет к следующему шагу
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
        {['Только 2 формата: лонгрид или видеоурок', 'Цель — следующий шаг в воронке', 'Не обычная статья из раздела Контент'].map((item) => (
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
          <div style={{ fontSize: 14, color: '#999' }}>Лид-магнит ещё не создан</div>
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
