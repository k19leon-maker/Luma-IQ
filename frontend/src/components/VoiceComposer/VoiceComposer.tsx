import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import styles from './VoiceComposer.module.css';

type VoiceComposerVariant = 'compact' | 'field';

interface VoiceComposerProps {
  value: string;
  onChange: (value: string) => void;
  variant?: VoiceComposerVariant;
  disabled?: boolean;
  placeholder?: string;
  textareaClassName?: string;
  className?: string;
  rows?: number;
  maxLength?: number;
  onBusyChange?: (isBusy: boolean) => void;
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v4M8 22h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m8 5 11 7-11 7V5Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function VoiceComposer({
  value,
  onChange,
  variant = 'field',
  disabled = false,
  placeholder = 'Наговорите мысли или введите текст...',
  textareaClassName,
  className,
  rows = 5,
  maxLength,
  onBusyChange,
}: VoiceComposerProps) {
  const valueRef = useRef(value);
  const previousValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onBusyChangeRef = useRef(onBusyChange);
  const maxLengthRef = useRef(maxLength);
  valueRef.current = value;
  onChangeRef.current = onChange;
  onBusyChangeRef.current = onBusyChange;
  maxLengthRef.current = maxLength;

  const voice = useAudioRecorder(
    (text) => {
      const currentValue = valueRef.current.trim();
      const appendedValue = currentValue ? `${currentValue} ${text}` : text;
      const nextValue = maxLengthRef.current
        ? appendedValue.slice(0, maxLengthRef.current)
        : appendedValue;
      valueRef.current = nextValue;
      onChangeRef.current(nextValue);
    },
    (message) => toast.error(message),
  );
  const voiceReady = voice.isReady;
  const resetVoice = voice.reset;

  useEffect(() => {
    onBusyChangeRef.current?.(voice.isBusy);
  }, [voice.isBusy]);

  useEffect(() => {
    if (voiceReady && previousValueRef.current.trim() && !value.trim()) resetVoice();
    previousValueRef.current = value;
  }, [resetVoice, value, voiceReady]);

  useEffect(() => () => onBusyChangeRef.current?.(false), []);

  if (variant === 'compact' && !voice.isSupported) return null;

  function startRecording() {
    onBusyChangeRef.current?.(true);
    void voice.start();
  }

  function cancelRecording() {
    voice.cancel();
    onBusyChangeRef.current?.(false);
  }

  const status = voice.isRequestingPermission
    ? 'Запрашиваем доступ к микрофону...'
    : voice.isRecording
      ? `Идёт запись · ${formatTime(voice.elapsedSeconds)} / ${formatTime(voice.maxDurationSeconds)}`
      : voice.isPaused
        ? `Запись на паузе · ${formatTime(voice.elapsedSeconds)}`
        : voice.isStopping
          ? 'Завершаем запись...'
          : voice.isTranscribing
            ? 'Распознаём голос...'
            : voice.isReady
              ? 'Текст распознан — проверьте и отредактируйте его'
              : voice.error?.message ?? '';

  const controls = (
    <div className={`${styles.controls} ${styles[variant]}`}>
      {!voice.isBusy && (
        <button
          type="button"
          className={styles.recordButton}
          onClick={startRecording}
          disabled={disabled || !voice.isSupported}
          title={voice.isSupported ? 'Записать голосом' : 'Браузер не поддерживает запись аудио'}
          aria-label="Записать голосом"
        >
          <MicrophoneIcon />
          {variant === 'field' && <span>Записать голосом</span>}
        </button>
      )}

      {voice.isRecording && (
        <>
          <button type="button" className={styles.controlButton} onClick={voice.pause} title="Поставить на паузу" aria-label="Поставить запись на паузу">
            <PauseIcon />
            {variant === 'field' && <span>Пауза</span>}
          </button>
          <button type="button" className={styles.finishButton} onClick={voice.finish} title="Завершить и распознать" aria-label="Завершить и распознать запись">
            <StopIcon />
            {variant === 'field' && <span>Готово</span>}
          </button>
        </>
      )}

      {voice.isPaused && (
        <>
          <button type="button" className={styles.controlButton} onClick={voice.resume} title="Продолжить запись" aria-label="Продолжить запись">
            <PlayIcon />
            {variant === 'field' && <span>Продолжить</span>}
          </button>
          <button type="button" className={styles.finishButton} onClick={voice.finish} title="Завершить и распознать" aria-label="Завершить и распознать запись">
            <StopIcon />
            {variant === 'field' && <span>Готово</span>}
          </button>
        </>
      )}

      {(voice.isRequestingPermission || voice.isStopping || voice.isTranscribing) && <Spinner />}

      {voice.isBusy && (
        <button type="button" className={styles.cancelButton} onClick={cancelRecording} title="Отменить" aria-label="Отменить голосовую запись">
          <CancelIcon />
          {variant === 'field' && <span>Отменить</span>}
        </button>
      )}

      {status && (
        <span className={`${styles.status} ${voice.error ? styles.statusError : ''}`} role="status" aria-live="polite">
          {voice.isRecording && (
            <span
              className={styles.audioLevel}
              style={{ '--voice-level': voice.audioLevel } as React.CSSProperties}
              aria-hidden="true"
            />
          )}
          {status}
        </span>
      )}
    </div>
  );

  if (variant === 'compact') return controls;

  return (
    <div className={`${styles.composer}${className ? ` ${className}` : ''}`}>
      <textarea
        className={textareaClassName}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Текст для AI"
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
      />
      {controls}
      {!voice.isSupported && (
        <p className={styles.unsupported} role="status">Браузер не поддерживает запись аудио. Вы можете ввести текст вручную.
        </p>
      )}
    </div>
  );
}
