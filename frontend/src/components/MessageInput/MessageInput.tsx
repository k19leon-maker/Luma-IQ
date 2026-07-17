import { useRef, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CLAUDE_MODELS,
  OPENAI_MODELS,
  ClaudeModelId,
  OpenAIModelId,
  useModelStore,
} from '../../store/model.store';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import styles from './MessageInput.module.css';

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21.4 11.6 12 21a6 6 0 0 1-8.5-8.5l9.8-9.8a4 4 0 1 1 5.7 5.7l-9.8 9.8a2 2 0 0 1-2.8-2.8l8.8-8.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v4M8 22h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m8 3-6 10 4 7h12l4-7-6-10H8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m8 3 6 10M16 3l-6 17M2 13h20" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MessageActions({ content, compact = false }: { content: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error('Не удалось скопировать текст');
    }
  }

  return (
    <div className={`${styles.messageActions}${compact ? ' ' + styles.messageActionsCompact : ''}`}>
      <button className={styles.messageActionBtn} onClick={() => void copy()} title="Копировать ответ AI" aria-label="Копировать ответ AI">
        <CopyIcon />
        <span>{copied ? 'Скопировано' : 'Копировать'}</span>
      </button>
    </div>
  );
}

// ── ModelBar — standalone model selector row ──────────────────────────────────

interface ModelBarProps {
  section: string;
}

export function ModelBar({ section }: ModelBarProps) {
  const { getSettings, setClaudeModel, setOpenAIModel, setProvider } = useModelStore();
  const settings = getSettings(section);
  const models      = settings.provider === 'claude' ? CLAUDE_MODELS : OPENAI_MODELS;
  const currentId   = settings.provider === 'claude' ? settings.claudeModel : settings.openaiModel;

  return (
    <div className={styles.modelBar}>
      <button
        className={styles.providerBtn}
        onClick={() => setProvider(section, settings.provider === 'claude' ? 'chatgpt' : 'claude')}
        title="Сменить провайдера"
      >
        <span style={{ color: settings.provider === 'claude' ? '#FF6B35' : '#10a37f' }}>●</span>
        {settings.provider === 'claude' ? 'Claude' : 'OpenAI'}
      </button>
      <select
        className={styles.modelSelect}
        value={currentId}
        onChange={(e) => {
          if (settings.provider === 'claude') {
            setClaudeModel(section, e.target.value as ClaudeModelId);
          } else {
            setOpenAIModel(section, e.target.value as OpenAIModelId);
          }
        }}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} — {m.badge}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── MessageInput — textarea + model selector + send button ────────────────────

export interface MessageInputProps {
  value:        string;
  onChange:     (v: string) => void;
  onSend:       () => void;
  isLoading:    boolean;
  placeholder?: string;
  section:      string;
  multiline?:   boolean;
  disabled?:    boolean;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  isLoading,
  placeholder,
  section,
  multiline = false,
  disabled = false,
}: MessageInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const voice = useAudioRecorder(
    (text) => onChange(value.trim() ? `${value.trim()} ${text}` : text),
    (message) => toast.error(message),
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (multiline) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) onSend();
    }
  }

  const { getSettings, setClaudeModel, setOpenAIModel, setProvider } = useModelStore();
  const settings    = getSettings(section);
  const models      = settings.provider === 'claude' ? CLAUDE_MODELS : OPENAI_MODELS;
  const currentId   = settings.provider === 'claude' ? settings.claudeModel : settings.openaiModel;

  return (
    <div className={styles.inputWrapper}>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Напишите сообщение...'}
        className={styles.textarea}
        rows={1}
        disabled={isLoading || disabled}
      />
      <div className={styles.inputFooter}>
        <div className={styles.leftTools}>
          <div className={styles.attachWrap}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setAttachOpen((v) => !v)}
              title="Прикрепить"
              aria-label="Прикрепить"
            >
              <PaperclipIcon />
              <ChevronIcon />
            </button>
            {attachOpen && (
              <div className={styles.attachMenu}>
                <button type="button" onClick={() => { setAttachOpen(false); toast('Загрузка файлов будет подключена следующим шагом'); }}>Файл</button>
                <button type="button" onClick={() => { setAttachOpen(false); toast('Прикрепление материала проекта будет подключено следующим шагом'); }}>Материал проекта</button>
                <button type="button" onClick={() => { setAttachOpen(false); toast('Ссылка будет подключена следующим шагом'); }}>Ссылка</button>
              </div>
            )}
          </div>
          <button
            type="button"
            className={`${styles.iconBtn}${voice.isRecording ? ' ' + styles.iconBtnActive : ''}`}
            onClick={voice.toggle}
            title={voice.isRecording ? 'Остановить запись' : voice.isTranscribing ? 'Распознаём...' : 'Записать голосом'}
            aria-label={voice.isRecording ? 'Остановить запись' : 'Записать голосом'}
            disabled={isLoading || disabled || voice.isTranscribing || !voice.isSupported}
          >
            <MicIcon />
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => toast('Google Drive будет подключен после интеграции')} title="Google Drive" aria-label="Google Drive">
            <DriveIcon />
          </button>
        </div>

        <div className={styles.providerGroup}>
          <button
            className={styles.providerBtn}
            onClick={() => setProvider(section, settings.provider === 'claude' ? 'chatgpt' : 'claude')}
            title="Сменить провайдера"
          >
            <span style={{ color: settings.provider === 'claude' ? '#FF6B35' : '#10a37f' }}>●</span>
            {settings.provider === 'claude' ? 'Claude' : 'OpenAI'}
          </button>
          <select
            className={styles.modelSelect}
            value={currentId}
            onChange={(e) => {
              if (settings.provider === 'claude') {
                setClaudeModel(section, e.target.value as ClaudeModelId);
              } else {
                setOpenAIModel(section, e.target.value as OpenAIModelId);
              }
            }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.badge}
              </option>
            ))}
          </select>
        </div>
        <button
          className={styles.sendBtn}
          onClick={onSend}
          disabled={isLoading || disabled || !value.trim()}
          title="Отправить"
        >
          {isLoading ? <span className={styles.spinner} /> : '↑'}
        </button>
      </div>
    </div>
  );
}
