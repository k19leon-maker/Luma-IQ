import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useGeneratedStore, type AiResultVersion } from '../../store/generated.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { aiApi } from '../../api/ai';
import { buildUtpMaterial } from '../../utils/projectMaterials';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import FormattedText from '../../components/FormattedText/FormattedText';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import { VoiceComposer } from '../../components/VoiceComposer/VoiceComposer';
import s from './UTPVoice.module.css';


export default function UTP() {
  const { activeProjectId } = useProjectMarketingContext();
  const savedData    = useGeneratedStore((s) => s.getProject(activeProjectId));
  const saveUtp      = useGeneratedStore((s) => s.setUtp);
  const upsertMaterial = useMaterialsStore((s) => s.upsertMaterial);
  const completeUtp  = useProgressStore((s) => s.completeUtp);

  const [utpText,   setUtpText]   = useState('');
  const [inputText, setInputText] = useState('');
  const [copied,    setCopied]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [materialStatus, setMaterialStatus] = useState('');
  const loadedUtpKeyRef = useRef('');

  useEffect(() => {
    const nextKey = `${activeProjectId ?? 'none'}:${savedData.utp ?? ''}`;
    if (loadedUtpKeyRef.current === nextKey) return;
    loadedUtpKeyRef.current = nextKey;
    const savedUtp = savedData.utp ?? '';
    setUtpText(savedUtp);
  }, [activeProjectId, savedData.utp]);

  function buildVersion(value: string, title: string, source: AiResultVersion<string>['source'], meta?: Partial<AiResultVersion<string>>): AiResultVersion<string> {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      createdAt: new Date().toISOString(),
      source,
      workflowRunId: meta?.workflowRunId,
      workflowStepId: meta?.workflowStepId,
      artifactId: meta?.artifactId,
      generationId: meta?.generationId,
      value,
    };
  }

  function persistUtp(value: string, version?: AiResultVersion<string>) {
    setUtpText(value);
    if (activeProjectId) {
      const history = version ? [version, ...(savedData.utpHistory ?? [])].slice(0, 20) : savedData.utpHistory;
      saveUtp(activeProjectId, value, history);
    }
    if (activeProjectId) upsertMaterial(activeProjectId, buildUtpMaterial(value));
    completeUtp();
    setMaterialStatus('Материал обновлен в knowledge base');
    setTimeout(() => setMaterialStatus(''), 2500);
  }

  function restoreVersion(version: AiResultVersion<string>) {
    persistUtp(version.value, buildVersion(version.value, `Восстановлено: ${version.title}`, 'restore'));
    toast.success('Версия УТП восстановлена');
  }

  async function handleGenerate() {
    if (loading || voiceBusy) return;
    if (!activeProjectId) {
      toast.error('Сначала выберите проект');
      return;
    }
    setLoading(true);
    try {
      const workflow = 'strategy.utp.generate';
      const inputs = {
        mode: 'generate',
        inputText,
      };
      const resp = await aiApi.startWorkflow('strategy.utp.generate', {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      const value = resp.content.trim();
      persistUtp(value, buildVersion(value, 'AI-генерация УТП', 'ai', resp));
      toast.success(`УТП готово. Списано ${resp.aiPointsCharged ?? 20} AI-баллов.`);
    } catch (err) {
      console.error('[UTP] AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImprove() {
    if (!utpText || loading || voiceBusy) return;
    if (!activeProjectId) {
      toast.error('Сначала выберите проект');
      return;
    }
    setLoading(true);
    try {
      const workflow = 'strategy.utp.generate';
      const inputs = {
        mode: 'improve',
        currentUtp: utpText,
        inputText,
      };
      const resp = await aiApi.startWorkflow('strategy.utp.generate', {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      const value = resp.content.trim();
      persistUtp(value, buildVersion(value, 'AI-улучшение УТП', 'ai', resp));
      toast.success(`УТП улучшено. Списано ${resp.aiPointsCharged ?? 20} AI-баллов.`);
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
          <FormattedText>{utpText}</FormattedText>
        </div>
      )}

      <VoiceComposer
        value={inputText}
        onChange={setInputText}
        onBusyChange={setVoiceBusy}
        disabled={loading}
        placeholder="Опишите вашу уникальность или вставьте текст для улучшения"
        textareaClassName={s.instruction}
        className={s.voiceComposer}
        rows={5}
        maxLength={4000}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button style={btnGold} onClick={() => void handleGenerate()} disabled={loading || voiceBusy}>
          {loading ? 'Генерирую...' : 'Сгенерировать УТП'}
          {!loading && <AiWorkflowCost workflow="strategy.utp.generate" projectId={activeProjectId} />}
        </button>
        <button style={btnOutlined} onClick={() => void handleImprove()} disabled={loading || voiceBusy || !utpText}>
          Улучшить с AI
          {!loading && <AiWorkflowCost workflow="strategy.utp.generate" projectId={activeProjectId} />}
        </button>
        <button style={btnOutlined} onClick={handleCopy} disabled={!utpText}>
          {copied ? '✅ Скопировано' : 'Скопировать'}
        </button>
      </div>
      {materialStatus && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#3B6D11' }}>{materialStatus}</div>
      )}

      {Boolean(savedData.utpHistory?.length) && (
        <div style={{ marginTop: 24, borderTop: '1px solid #E5E3DC', paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            История версий
          </div>
          <div style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
            {savedData.utpHistory?.slice(0, 6).map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => restoreVersion(version)}
                style={{
                  textAlign: 'left',
                  background: '#F5F4F0',
                  border: '1px solid #E5E3DC',
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: '#1a1a1a',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{version.title}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  {new Date(version.createdAt).toLocaleString('ru-RU')}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
