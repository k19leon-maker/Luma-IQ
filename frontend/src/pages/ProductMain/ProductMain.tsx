import { useState } from 'react';
import toast from 'react-hot-toast';
import { useProjectsStore } from '../../store/projects.store';
import { useModelStore } from '../../store/model.store';
import { useUnpackingStore } from '../../store/unpacking.store';
import { aiApi } from '../../api/ai';

interface ProductState {
  name: string;
  price: string;
  format: string;
  duration: string;
  description: string;
  generated: boolean;
}

const MOCK_DATA = {
  name: 'Программа «Гармоничные отношения»',
  price: '25 000 ₽',
  format: 'Индивидуальная работа',
  duration: '3 месяца',
  description:
    'Трёхмесячная программа индивидуальной работы по восстановлению отношений. Включает 12 сессий, домашние задания, поддержку в мессенджере.',
};

const FIELDS: { key: keyof Omit<ProductState, 'description' | 'generated'>; label: string }[] = [
  { key: 'name',     label: 'Название' },
  { key: 'price',    label: 'Цена' },
  { key: 'format',   label: 'Формат' },
  { key: 'duration', label: 'Длительность' },
];

export default function ProductMain() {
  const projectName = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name ?? '');
  const getSettings = useModelStore((s) => s.getSettings);
  const profileData = useUnpackingStore((s) => s.profileData);

  const [state,   setState]   = useState<ProductState>({ name: '', price: '', format: '', duration: '', description: '', generated: false });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  function buildProfile(): string {
    if (!profileData || Object.keys(profileData).length === 0) return '';
    return Object.entries(profileData).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
  }

  async function handleCreate() {
    if (loading) return;
    setLoading(true);
    try {
      const settings = getSettings('product-main');
      const profile  = buildProfile();
      const prompt   = `Ты маркетолог психологов. Создай описание ОСНОВНОГО (флагманского) продукта психолога.
${profile ? `\nПрофиль психолога:\n${profile}` : ''}

Верни JSON (без markdown-блоков):
{
  "name": "название программы",
  "price": "цена в рублях (например: 25 000 ₽)",
  "format": "формат работы (например: Индивидуальная работа онлайн)",
  "duration": "длительность (например: 3 месяца)",
  "description": "описание 2–3 предложения"
}`;

      const resp   = await aiApi.chat({
        model:               settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel:         settings.claudeModel,
        section:             'product-main',
        message:             prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile:    profileData as Record<string, string>,
      });

      const json = JSON.parse(resp.content.replace(/```json|```/g, '').trim()) as typeof MOCK_DATA;
      setState({ ...json, generated: true });
    } catch (err) {
      console.error('[ProductMain] AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
    } finally {
      setLoading(false);
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

  const labelStyle: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', color: '#999', letterSpacing: 1.5, marginBottom: 4 };
  const valueStyle: React.CSSProperties = { fontSize: 14, color: '#1a1a1a', fontWeight: 500 };

  return (
    <div style={{ background: '#fff', minHeight: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', marginBottom: 8, marginTop: 0 }}>
        Основной продукт
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 32, marginTop: 0 }}>
        Флагманская программа — основа вашего продуктового портфеля
      </p>

      {state.generated ? (
        <div style={{ background: '#F5F4F0', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <div style={labelStyle}>{label}</div>
                {editing ? (
                  <input
                    value={state[key]}
                    onChange={(e) => setState((s) => ({ ...s, [key]: e.target.value }))}
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
          <button style={btnOutlined} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Сохранить' : 'Редактировать'}
          </button>
        )}
      </div>

      {state.generated && state.description && (
        <textarea
          value={state.description}
          readOnly={!editing}
          onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
          style={{
            width: '100%', minHeight: 80, padding: 14,
            border: editing ? '1px solid #D4A847' : '1px solid #E5E3DC',
            borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
            color: '#555', background: '#fafafa', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  );
}
