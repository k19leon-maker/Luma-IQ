import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi } from '../api/ai';

type RecorderState = 'idle' | 'recording' | 'transcribing';

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

export function isAudioRecordingSupported(): boolean {
  return Boolean(
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined',
  );
}

export function useAudioRecorder(onText: (text: string) => void, onError?: (message: string) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    if (!isAudioRecordingSupported()) {
      onError?.('Браузер не поддерживает запись аудио');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = chooseMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setState('idle');
        stopStream();
        onError?.('Не удалось записать голосовое сообщение');
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const type = recorder.mimeType || mimeType || 'audio/webm';
        stopStream();

        if (!chunks.length) {
          setState('idle');
          onError?.('Голосовое сообщение пустое');
          return;
        }

        const blob = new Blob(chunks, { type });
        setState('transcribing');
        aiApi.transcribeAudio(blob)
          .then((text) => {
            const clean = text.trim();
            if (!clean) {
              onError?.('Не удалось распознать голосовое сообщение');
              return;
            }
            onText(clean);
          })
          .catch(() => onError?.('Не удалось распознать голосовое сообщение'))
          .finally(() => setState('idle'));
      };

      recorder.start();
      setState('recording');
    } catch {
      setState('idle');
      stopStream();
      onError?.('Разрешите доступ к микрофону в браузере');
    }
  }, [onError, onText, stopStream]);

  const toggle = useCallback(() => {
    if (state === 'recording') {
      stop();
      return;
    }
    if (state === 'idle') {
      void start();
    }
  }, [start, state, stop]);

  useEffect(() => {
    return () => {
      stop();
      stopStream();
    };
  }, [stop, stopStream]);

  return {
    isSupported: isAudioRecordingSupported(),
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
    state,
    start,
    stop,
    toggle,
  };
}
