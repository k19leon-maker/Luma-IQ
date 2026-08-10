import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi } from '../api/ai';

export type RecorderState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'transcribing'
  | 'ready'
  | 'error';

export interface VoiceRecorderError {
  code: string;
  message: string;
  status?: number;
}

export interface AudioRecorderOptions {
  maxDurationSeconds?: number;
  maxFileSizeBytes?: number;
}

const DEFAULT_MAX_DURATION_SECONDS = 5 * 60;
const DEFAULT_MAX_FILE_SIZE_BYTES = 14 * 1024 * 1024;

function chooseMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const options = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/wav',
  ];
  return options.find((type) => MediaRecorder.isTypeSupported(type));
}

function normalizeRecorderError(error: unknown, fallbackCode = 'VOICE_RECORDING_FAILED'): VoiceRecorderError {
  const response = error && typeof error === 'object' && 'response' in error
    ? (error as {
      response?: { status?: number; data?: { code?: unknown; error?: unknown; message?: unknown } };
    }).response
    : undefined;
  const responseMessage = response?.data?.error ?? response?.data?.message;
  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    const responseCode = response?.data?.code;
    return {
      code: typeof responseCode === 'string' ? responseCode : fallbackCode,
      message: responseMessage,
      status: response?.status,
    };
  }

  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return { code: 'MICROPHONE_PERMISSION_DENIED', message: 'Разрешите доступ к микрофону в браузере' };
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return { code: 'MICROPHONE_NOT_FOUND', message: 'Микрофон не найден' };
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return { code: 'MICROPHONE_BUSY', message: 'Микрофон занят другим приложением' };
    }
  }

  return { code: fallbackCode, message: 'Не удалось записать голосовое сообщение' };
}

export function isAudioRecordingSupported(): boolean {
  return Boolean(
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined',
  );
}

export function useAudioRecorder(
  onText: (text: string) => void,
  onError?: (message: string, error?: VoiceRecorderError) => void,
  options: AudioRecorderOptions = {},
) {
  const maxDurationSeconds = options.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<VoiceRecorderError | null>(null);

  const mountedRef = useRef(true);
  const stateRef = useRef<RecorderState>('idle');
  const onTextRef = useRef(onText);
  const onErrorRef = useRef(onError);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef(0);
  const startPendingRef = useRef(false);
  const cancelledRef = useRef(false);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeStartedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastLevelPublishedAtRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const finishRef = useRef<() => void>(() => undefined);

  onTextRef.current = onText;
  onErrorRef.current = onError;

  const updateState = useCallback((next: RecorderState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const emitError = useCallback((nextError: VoiceRecorderError) => {
    if (mountedRef.current) setError(nextError);
    updateState('error');
    onErrorRef.current?.(nextError.message, nextError);
  }, [updateState]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const currentElapsedMs = useCallback(() => {
    const activeMs = activeStartedAtRef.current === null
      ? 0
      : performance.now() - activeStartedAtRef.current;
    return accumulatedMsRef.current + activeMs;
  }, []);

  const publishElapsed = useCallback(() => {
    const next = Math.floor(currentElapsedMs() / 1000);
    if (mountedRef.current) setElapsedSeconds(next);
    if (next >= maxDurationSeconds && stateRef.current === 'recording') {
      finishRef.current();
    }
  }, [currentElapsedMs, maxDurationSeconds]);

  const startTimer = useCallback(() => {
    activeStartedAtRef.current = performance.now();
    clearTimer();
    timerRef.current = window.setInterval(publishElapsed, 250);
  }, [clearTimer, publishElapsed]);

  const pauseTimer = useCallback(() => {
    if (activeStartedAtRef.current !== null) {
      accumulatedMsRef.current += performance.now() - activeStartedAtRef.current;
      activeStartedAtRef.current = null;
    }
    clearTimer();
    publishElapsed();
  }, [clearTimer, publishElapsed]);

  const resetTimer = useCallback(() => {
    clearTimer();
    activeStartedAtRef.current = null;
    accumulatedMsRef.current = 0;
    if (mountedRef.current) setElapsedSeconds(0);
  }, [clearTimer]);

  const stopAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    sourceNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceNodeRef.current = null;
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    if (mountedRef.current) setAudioLevel(0);
  }, []);

  const runAudioLevelLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || animationFrameRef.current !== null) return;
    const samples = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (!analyserRef.current || stateRef.current !== 'recording') {
        animationFrameRef.current = null;
        return;
      }
      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (const sample of samples) total += Math.abs(sample - 128);
      const nextLevel = Math.min(1, total / samples.length / 32);
      const now = performance.now();
      if (mountedRef.current && now - lastLevelPublishedAtRef.current >= 80) {
        lastLevelPublishedAtRef.current = now;
        setAudioLevel(nextLevel);
      }
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  const startAudioMonitoring = useCallback((stream: MediaStream) => {
    if (typeof window === 'undefined') return;
    const WindowWithWebkitAudio = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextConstructor = window.AudioContext ?? WindowWithWebkitAudio.webkitAudioContext;
    if (!AudioContextConstructor) return;

    try {
      const context = new AudioContextConstructor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
      runAudioLevelLoop();
    } catch {
      // Audio activity is progressive enhancement; recording remains available.
    }
  }, [runAudioLevelLoop]);

  const pauseAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mountedRef.current) setAudioLevel(0);
    const context = audioContextRef.current;
    if (context?.state === 'running') void context.suspend().catch(() => undefined);
  }, []);

  const resumeAudioMonitoring = useCallback(() => {
    const context = audioContextRef.current;
    if (context?.state === 'suspended') {
      void context.resume().then(runAudioLevelLoop).catch(() => undefined);
      return;
    }
    runAudioLevelLoop();
  }, [runAudioLevelLoop]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
  }, []);

  const cleanupCapture = useCallback(() => {
    pauseTimer();
    stopAudioMonitoring();
    stopStream();
  }, [pauseTimer, stopAudioMonitoring, stopStream]);

  const failCapture = useCallback((nextError: VoiceRecorderError) => {
    sessionRef.current += 1;
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Capture resources are released below regardless of recorder state.
        }
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    cleanupCapture();
    resetTimer();
    emitError(nextError);
  }, [cleanupCapture, emitError, resetTimer]);

  const handleRecorderStop = useCallback(async (
    recorder: MediaRecorder,
    mimeType: string | undefined,
    sessionId: number,
  ) => {
    cleanupCapture();
    recorderRef.current = null;

    if (cancelledRef.current || sessionRef.current !== sessionId || !mountedRef.current) {
      chunksRef.current = [];
      return;
    }

    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (!chunks.length) {
      emitError({ code: 'VOICE_RECORDING_EMPTY', message: 'Голосовое сообщение пустое' });
      return;
    }

    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
    if (blob.size > maxFileSizeBytes) {
      emitError({
        code: 'VOICE_RECORDING_TOO_LARGE',
        message: 'Запись получилась слишком большой. Сократите сообщение и попробуйте снова.',
      });
      return;
    }

    updateState('transcribing');
    const abortController = new AbortController();
    transcriptionAbortRef.current = abortController;
    try {
      const text = await aiApi.transcribeAudio(blob, { signal: abortController.signal });
      if (sessionRef.current !== sessionId || cancelledRef.current || !mountedRef.current) return;
      const clean = text.trim();
      if (!clean) {
        emitError({ code: 'VOICE_TRANSCRIPTION_EMPTY', message: 'Не удалось распознать голосовое сообщение' });
        return;
      }
      onTextRef.current(clean);
      if (mountedRef.current) setError(null);
      updateState('ready');
    } catch (transcriptionError) {
      if (sessionRef.current !== sessionId || cancelledRef.current || abortController.signal.aborted) return;
      emitError(normalizeRecorderError(transcriptionError, 'VOICE_TRANSCRIPTION_FAILED'));
    } finally {
      if (transcriptionAbortRef.current === abortController) transcriptionAbortRef.current = null;
    }
  }, [cleanupCapture, emitError, maxFileSizeBytes, updateState]);

  const finish = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || (recorder.state !== 'recording' && recorder.state !== 'paused')) return;
    updateState('stopping');
    pauseTimer();
    pauseAudioMonitoring();
    try {
      recorder.stop();
    } catch (finishError) {
      failCapture(normalizeRecorderError(finishError));
    }
  }, [failCapture, pauseAudioMonitoring, pauseTimer, updateState]);

  finishRef.current = finish;

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    try {
      recorder.pause();
      pauseTimer();
      pauseAudioMonitoring();
      updateState('paused');
    } catch (pauseError) {
      failCapture(normalizeRecorderError(pauseError));
    }
  }, [failCapture, pauseAudioMonitoring, pauseTimer, updateState]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    try {
      recorder.resume();
      updateState('recording');
      startTimer();
      resumeAudioMonitoring();
    } catch (resumeError) {
      failCapture(normalizeRecorderError(resumeError));
    }
  }, [failCapture, resumeAudioMonitoring, startTimer, updateState]);

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    cancelledRef.current = true;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Capture resources are released below even if MediaRecorder already stopped.
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    cleanupCapture();
    resetTimer();
    if (mountedRef.current) setError(null);
    updateState('idle');
  }, [cleanupCapture, resetTimer, updateState]);

  const start = useCallback(async () => {
    if (!isAudioRecordingSupported()) {
      emitError({ code: 'VOICE_RECORDING_UNSUPPORTED', message: 'Браузер не поддерживает запись аудио' });
      return;
    }
    if (startPendingRef.current || !['idle', 'ready', 'error'].includes(stateRef.current)) return;

    startPendingRef.current = true;
    cancelledRef.current = false;
    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;
    resetTimer();
    if (mountedRef.current) setError(null);
    updateState('requesting_permission');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current || sessionRef.current !== sessionId || cancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const mimeType = chooseMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && sessionRef.current === sessionId) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        failCapture({ code: 'VOICE_RECORDING_FAILED', message: 'Не удалось записать голосовое сообщение' });
      };
      recorder.onstop = () => {
        void handleRecorderStop(recorder, mimeType, sessionId);
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (sessionRef.current === sessionId && ['recording', 'paused'].includes(stateRef.current)) {
            finishRef.current();
          }
        };
      });

      recorder.start(1000);
      updateState('recording');
      startTimer();
      startAudioMonitoring(stream);
    } catch (startError) {
      cleanupCapture();
      if (sessionRef.current === sessionId && !cancelledRef.current) {
        emitError(normalizeRecorderError(startError));
      }
    } finally {
      startPendingRef.current = false;
    }
  }, [cleanupCapture, emitError, failCapture, handleRecorderStop, resetTimer, startAudioMonitoring, startTimer, updateState]);

  const reset = useCallback(() => {
    if (['requesting_permission', 'recording', 'paused', 'stopping', 'transcribing'].includes(stateRef.current)) return;
    if (mountedRef.current) setError(null);
    resetTimer();
    updateState('idle');
  }, [resetTimer, updateState]);

  const toggle = useCallback(() => {
    if (stateRef.current === 'recording' || stateRef.current === 'paused') {
      finish();
      return;
    }
    if (['idle', 'ready', 'error'].includes(stateRef.current)) void start();
  }, [finish, start]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      cancelledRef.current = true;
      transcriptionAbortRef.current?.abort();
      transcriptionAbortRef.current = null;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch {
            // Tracks are stopped below regardless of MediaRecorder state.
          }
        }
      }
      recorderRef.current = null;
      chunksRef.current = [];
      clearTimer();
      stopAudioMonitoring();
      stopStream();
    };
  }, [clearTimer, stopAudioMonitoring, stopStream]);

  const isCapturing = state === 'recording' || state === 'paused' || state === 'stopping';
  const isBusy = state === 'requesting_permission' || isCapturing || state === 'transcribing';

  return {
    state,
    error,
    elapsedSeconds,
    audioLevel,
    maxDurationSeconds,
    remainingSeconds: Math.max(0, maxDurationSeconds - elapsedSeconds),
    isSupported: isAudioRecordingSupported(),
    isRequestingPermission: state === 'requesting_permission',
    isRecording: state === 'recording',
    isPaused: state === 'paused',
    isStopping: state === 'stopping',
    isTranscribing: state === 'transcribing',
    isReady: state === 'ready',
    isCapturing,
    isBusy,
    canSubmit: !isBusy,
    start,
    pause,
    resume,
    finish,
    stop: finish,
    cancel,
    reset,
    toggle,
  };
}
