'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { MAX_RECORDING_SECONDS } from '@/core/transcription/limits';

const MAX_RECORDING_MS = MAX_RECORDING_SECONDS * 1000;

const subscribeNoop = (): (() => void) => () => {};
const getMountedSnapshot = (): boolean => true;
const getMountedServerSnapshot = (): boolean => false;

export type VoiceInputStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'transcribing'
  | 'error';

type Options = {
  onText: (text: string) => void;
  onError?: (message: string) => void;
};

function pickPreferredMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export type VoiceInput = {
  status: VoiceInputStatus;
  isSupported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
};

export function useVoiceInput(opts: Options): VoiceInput {
  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const mounted = useSyncExternalStore(
    subscribeNoop,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return (): void => cleanupStream();
  }, [cleanupStream]);

  const reportError = useCallback(
    (message: string) => {
      setStatus('error');
      opts.onError?.(message);
      window.setTimeout(() => setStatus('idle'), 1500);
    },
    [opts],
  );

  const upload = useCallback(
    async (blob: Blob, mimeType: string) => {
      setStatus('transcribing');
      try {
        const form = new FormData();
        const ext = mimeType.includes('mp4')
          ? 'mp4'
          : mimeType.includes('webm')
            ? 'webm'
            : 'audio';
        form.append('audio', blob, `voice.${ext}`);
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          body: form,
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            errBody?.error?.message ??
              `Transcription failed (HTTP ${res.status})`,
          );
        }
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? '').trim();
        if (text.length > 0) opts.onText(text);
        setStatus('idle');
      } catch (e) {
        reportError(e instanceof Error ? e.message : String(e));
      }
    },
    [opts, reportError],
  );

  const start = useCallback(async (): Promise<void> => {
    if (status !== 'idle' && status !== 'error') return;
    cancelledRef.current = false;
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickPreferredMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const effectiveMime = recorder.mimeType || mimeType || 'audio/webm';
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev: BlobEvent): void => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = (): void => {
        const blob = new Blob(chunksRef.current, { type: effectiveMime });
        cleanupStream();
        if (cancelledRef.current) {
          setStatus('idle');
          return;
        }
        if (blob.size === 0) {
          reportError('Empty recording');
          return;
        }
        void upload(blob, effectiveMime);
      };
      recorder.onerror = (): void => {
        cleanupStream();
        reportError('Recorder error');
      };
      recorder.start();
      setStatus('recording');
      autoStopTimerRef.current = window.setTimeout((): void => {
        if (recorder.state === 'recording') recorder.stop();
      }, MAX_RECORDING_MS);
    } catch (e) {
      cleanupStream();
      const message =
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Microphone permission denied'
          : e instanceof Error
            ? e.message
            : 'Could not access microphone';
      reportError(message);
    }
  }, [status, cleanupStream, reportError, upload]);

  const stop = useCallback((): void => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
  }, []);

  const cancel = useCallback((): void => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    } else {
      cleanupStream();
      setStatus('idle');
    }
  }, [cleanupStream]);

  const isSupported =
    mounted &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined';

  return { status, isSupported, start, stop, cancel };
}
