import { useRef, useEffect } from 'react';
import {
  CLAUDE_MODELS,
  OPENAI_MODELS,
  ClaudeModelId,
  OpenAIModelId,
  useModelStore,
} from '../../store/model.store';
import styles from './MessageInput.module.css';

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
}

export function MessageInput({
  value,
  onChange,
  onSend,
  isLoading,
  placeholder,
  section,
  multiline = false,
}: MessageInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
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
        disabled={isLoading}
      />
      <div className={styles.inputFooter}>
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
          disabled={isLoading || !value.trim()}
          title="Отправить"
        >
          {isLoading ? <span className={styles.spinner} /> : '↑'}
        </button>
      </div>
    </div>
  );
}
