import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useModelStore } from '../../store/model.store';
import { useGeneratedStore } from '../../store/generated.store';
import { useProgressStore } from '../../store/progress.store';
import { aiApi } from '../../api/ai';


export default function UTP() {
  const { activeProjectId, projectName, context, mergedProfile } = useProjectMarketingContext();
  const getSettings  = useModelStore((s) => s.getSettings);
  const savedData    = useGeneratedStore((s) => s.getProject(activeProjectId));
  const saveUtp      = useGeneratedStore((s) => s.setUtp);
  const completeUtp  = useProgressStore((s) => s.completeUtp);

  const [utpText,   setUtpText]   = useState('');
  const [inputText, setInputText] = useState('');
  const [focused,   setFocused]   = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    setUtpText(savedData.utp ?? '');
  }, [activeProjectId, savedData.utp]);

  function persistUtp(value: string) {
    setUtpText(value);
    if (activeProjectId) saveUtp(activeProjectId, value);
    completeUtp();
  }

  async function handleGenerate() {
    if (loading) return;
    setLoading(true);
    try {
      const settings = getSettings('utp');
      const prompt   = `Ты маркетолог-стратег. Создай УТП (уникальное торговое предложение) для проекта в 2–3 предложениях.
Работай строго по контексту проекта. Не подставляй психологию, если ее нет в контексте.

Контекст проекта:
${context || 'Контекст пока не заполнен.'}
${inputText ? `\nДополнительно: ${inputText}` : ''}

Структура: Кому помогаю + Какую проблему решаю + Какой результат получает клиент + За счёт чего (метод).
Напиши только текст УТП, без заголовков и пояснений.`;

      const resp = await aiApi.chat({
        model:               settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel:         settings.claudeModel,
        section:             'utp',
        message:             prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile:    mergedProfile as Record<string, string>,
      });
      persistUtp(resp.content.trim());
    } catch (err) {
      console.error('[UTP] AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImprove() {
    if (!utpText || loading) return;
    setLoading(true);
    try {
      const settings = getSettings('utp');
      const prompt   = `Улучши это УТП проекта — сделай его более конкретным, убедительным и привязанным к контексту.
Не меняй нишу и не подставляй психологию, если ее нет в контексте.

Контекст проекта:
${context || 'Контекст пока не заполнен.'}

${utpText}
${inputText ? `\nПожелания: ${inputText}` : ''}

Напиши только улучшенный текст УТП, без пояснений.`;

      const resp = await aiApi.chat({
        model:               settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel:         settings.claudeModel,
        section:             'utp',
        message:             prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile:    mergedProfile as Record<string, string>,
      });
      persistUtp(resp.content.trim());
      toast.success('УТП улучшено');
    } catch (err) {
      console.warn('[UTP] improve error:', err);
      toast.error('Не удалось улучшить');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!utpText) return;
    navigator.clipboard.writeText(utpText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    cursor: loading ? 'not-allowed' : 'pointer',
    fontWeight: 500,
    opacity: loading ? 0.6 : 1,
  };

  return (
    <div style={{ background: '#fff', minHeight: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', marginBottom: 8, marginTop: 0 }}>
        Создание УТП
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 32, marginTop: 0 }}>
        Уникальное торговое предложение — основа всего маркетинга
      </p>

      {utpText && (
        <div style={{ background: '#F5F4F0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#999', letterSpacing: 1.5, marginBottom: 8 }}>
            Ваше УТП
          </div>
          <div style={{ fontSize: 15, color: '#1a1a1a', lineHeight: 1.7 }}>
            {utpText}
          </div>
        </div>
      )}

      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Опишите вашу уникальность или вставьте текст для улучшения"
        style={{
          width: '100%',
          minHeight: 120,
          padding: 14,
          border: `1px solid ${focused ? '#D4A847' : '#E5E3DC'}`,
          borderRadius: 8,
          fontSize: 14,
          resize: 'vertical',
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          marginBottom: 16,
          color: '#1a1a1a',
        }}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button style={btnGold} onClick={() => void handleGenerate()} disabled={loading}>
          {loading ? 'Генерирую...' : 'Сгенерировать УТП'}
        </button>
        <button style={btnOutlined} onClick={() => void handleImprove()} disabled={loading || !utpText}>
          Улучшить с AI
        </button>
        <button style={btnOutlined} onClick={handleCopy} disabled={!utpText}>
          {copied ? '✅ Скопировано' : 'Скопировать'}
        </button>
      </div>
    </div>
  );
}
