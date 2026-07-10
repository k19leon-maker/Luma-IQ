import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useModelStore } from '../../store/model.store';
import { useGeneratedStore, type SocialDraft } from '../../store/generated.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { aiApi } from '../../api/ai';
import { buildSocialMaterial } from '../../utils/projectMaterials';
import FormattedText from '../../components/FormattedText/FormattedText';

interface PlatformState {
  generated: boolean;
  text: string;
  loading: boolean;
}


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
  const { activeProjectId } = useProjectMarketingContext();
  const getSettings = useModelStore((s) => s.getSettings);
  const savedData = useGeneratedStore((s) => s.getProject(activeProjectId));
  const saveSocial = useGeneratedStore((s) => s.setSocial);
  const upsertMaterial = useMaterialsStore((s) => s.upsertMaterial);
  const completeSocial = useProgressStore((s) => s.completeSocial);

  const [states, setStates] = useState<Record<string, PlatformState>>(INIT_STATE);
  const [copied, setCopied] = useState('');
  const [materialStatus, setMaterialStatus] = useState('');
  const loadedSocialKeyRef = useRef('');

  useEffect(() => {
    const social = savedData.social ?? {};
    const nextKey = `${activeProjectId ?? 'none'}:${JSON.stringify(social)}`;
    if (loadedSocialKeyRef.current === nextKey) return;
    loadedSocialKeyRef.current = nextKey;
    setStates({
      instagram: { generated: Boolean(social.instagram), text: social.instagram ?? '', loading: false },
      telegram:  { generated: Boolean(social.telegram),  text: social.telegram  ?? '', loading: false },
      vk:        { generated: Boolean(social.vk),        text: social.vk        ?? '', loading: false },
    });
  }, [activeProjectId, savedData.social]);

  async function handleGenerate(key: string) {
    const state = states[key];
    if (!state || state.loading) return;
    if (!activeProjectId) {
      toast.error('Сначала выберите проект');
      return;
    }

    setStates((prev) => ({ ...prev, [key]: { ...prev[key]!, loading: true } }));

    try {
      const settings  = getSettings('social');
      const resp = await aiApi.startWorkflow('strategy.social.generate', {
        projectId: activeProjectId,
        provider: settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel: settings.claudeModel,
        inputs: {
          platform: PLATFORMS.find((p) => p.key === key)?.name ?? key,
        },
      });

      const text = resp.content.trim();
      setStates((prev) => ({
        ...prev,
        [key]: { generated: true, text, loading: false },
      }));
      if (activeProjectId) saveSocial(activeProjectId, key as keyof SocialDraft, text);
      if (activeProjectId) {
        upsertMaterial(activeProjectId, buildSocialMaterial({ ...savedData.social, [key]: text }));
      }
      completeSocial();
      setMaterialStatus('Материал social.md обновлен в knowledge base');
      toast.success(`Оформление соцсетей готово. Списано ${resp.aiPointsCharged ?? 15} AI-баллов.`);
      setTimeout(() => setMaterialStatus(''), 2500);
    } catch (err) {
      console.error('[Social] AI error for', key, err);
      setStates((prev) => ({ ...prev, [key]: { ...prev[key]!, loading: false } }));
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
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
                  <div style={{ marginTop: 12, color: '#555' }}>
                    <FormattedText compact>{state.text}</FormattedText>
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
      {materialStatus && (
        <div style={{ marginTop: 18, fontSize: 13, color: '#3B6D11' }}>{materialStatus}</div>
      )}
    </div>
  );
}
