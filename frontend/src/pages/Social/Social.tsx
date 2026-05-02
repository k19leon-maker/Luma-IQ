import { useState } from 'react';
import toast from 'react-hot-toast';
import { useProjectsStore } from '../../store/projects.store';
import { useModelStore } from '../../store/model.store';
import { useUnpackingStore } from '../../store/unpacking.store';
import { aiApi } from '../../api/ai';

interface PlatformState {
  generated: boolean;
  text: string;
  loading: boolean;
}

const MOCK_TEXTS: Record<string, string> = {
  instagram:
    'Психолог КПТ · Помогаю разобраться в отношениях и найти себя · 10+ лет практики · Онлайн по всему миру\n📩 Запись в личку или на сайте',
  telegram:
    'Психолог-практик. Работаю с тревогой, отношениями и самооценкой методами КПТ. Каналы связи: личные сообщения. Консультации онлайн.',
  vk: 'Когнитивно-поведенческий психолог. Специализируюсь на работе с тревожными расстройствами и сложными жизненными ситуациями. Записаться: личные сообщения.',
};

const PLATFORM_PROMPTS: Record<string, string> = {
  instagram: `Ты маркетолог психологов. Напиши описание профиля в Instagram (bio) для психолога.
Требования: максимум 150 символов, эмодзи уместны, специализация + аудитория + призыв к действию.
Напиши только текст bio, без пояснений.`,
  telegram: `Ты маркетолог психологов. Напиши описание Telegram-канала или профиля для психолога.
Требования: 2–3 предложения, профессиональный тон, специализация + что получит подписчик + призыв.
Напиши только текст описания.`,
  vk: `Ты маркетолог психологов. Напиши описание страницы ВКонтакте для психолога.
Требования: 2–3 предложения, профессиональный тон, специализация и метод работы, призыв к записи.
Напиши только текст описания.`,
};

const PLATFORMS = [
  { key: 'instagram', name: 'Instagram', icon: '📸' },
  { key: 'telegram',  name: 'Telegram',  icon: '✈️' },
  { key: 'vk',        name: 'ВКонтакте', icon: '💙' },
];

const TAGS = ['Экспертность', 'Доверие', 'Результат'];

const INIT_STATE = {
  instagram: { generated: false, text: '', loading: false },
  telegram:  { generated: false, text: '', loading: false },
  vk:        { generated: false, text: '', loading: false },
};

export default function Social() {
  const projectName = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name ?? '');
  const getSettings = useModelStore((s) => s.getSettings);
  const profileData = useUnpackingStore((s) => s.profileData);

  const [states, setStates] = useState<Record<string, PlatformState>>(INIT_STATE);
  const [copied, setCopied] = useState('');

  function buildProfile(): string {
    if (!profileData || Object.keys(profileData).length === 0) return '';
    return Object.entries(profileData)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  async function handleGenerate(key: string) {
    const state = states[key];
    if (!state || state.loading) return;

    setStates((prev) => ({ ...prev, [key]: { ...prev[key]!, loading: true } }));

    try {
      const settings  = getSettings('social');
      const profile   = buildProfile();
      const basePrompt = PLATFORM_PROMPTS[key] ?? '';
      const prompt    = `${basePrompt}${profile ? `\n\nПрофиль психолога:\n${profile}` : ''}`;

      const resp = await aiApi.chat({
        model:               settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel:         settings.claudeModel,
        section:             'social',
        message:             prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile:    profileData as Record<string, string>,
      });

      setStates((prev) => ({
        ...prev,
        [key]: { generated: true, text: resp.content.trim(), loading: false },
      }));
    } catch (err) {
      console.warn('[Social] AI error for', key, err);
      setStates((prev) => ({
        ...prev,
        [key]: { generated: true, text: MOCK_TEXTS[key] ?? '', loading: false },
      }));
      toast('AI временно недоступен', { icon: '⚠️', duration: 2500 });
    }
  }

  async function handleRegenerate(key: string) {
    setStates((prev) => ({ ...prev, [key]: { ...prev[key]!, generated: false, loading: false } }));
    await handleGenerate(key);
  }

  function handleCopy(key: string, text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  const btnGold: React.CSSProperties = {
    background: '#D4A847',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 500,
  };

  const btnOutlined: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #E5E3DC',
    color: '#555',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 500,
  };

  return (
    <div style={{ background: '#fff', minHeight: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', marginBottom: 8, marginTop: 0 }}>
        Оформление соц сетей
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 32, marginTop: 0 }}>
        AI создаст профессиональные описания для каждой платформы
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 32 }}>
        {PLATFORMS.map(({ key, name, icon }) => {
          const state = states[key]!;
          return (
            <div key={key} style={{ background: '#F5F4F0', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>{icon}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{name}</span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '3px 8px',
                  borderRadius: 20,
                  background: state.generated ? '#EAF3DE' : '#F5F4F0',
                  color: state.generated ? '#3B6D11' : '#888',
                  border: state.generated ? 'none' : '1px solid #E5E3DC',
                }}>
                  {state.loading ? '...' : state.generated ? 'Готово' : 'Не заполнено'}
                </span>
              </div>

              {state.generated && (
                <>
                  <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginTop: 12, whiteSpace: 'pre-line' }}>
                    {state.text}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button style={btnOutlined} onClick={() => void handleRegenerate(key)}>
                      Переписать
                    </button>
                    <button style={btnOutlined} onClick={() => handleCopy(key, state.text)}>
                      {copied === key ? '✅' : 'Копировать'}
                    </button>
                  </div>
                </>
              )}

              {!state.generated && (
                <div style={{ marginTop: 16 }}>
                  <button
                    style={{ ...btnGold, opacity: state.loading ? 0.7 : 1, cursor: state.loading ? 'not-allowed' : 'pointer' }}
                    onClick={() => void handleGenerate(key)}
                    disabled={state.loading}
                  >
                    {state.loading ? 'Генерирую...' : 'Оформить'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 16 }}>
          Ключевые тезисы
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TAGS.map((tag) => (
            <span key={tag} style={{
              background: '#fff',
              border: '1px solid #E5E3DC',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 13,
              color: '#555',
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
