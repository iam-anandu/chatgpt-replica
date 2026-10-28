import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store/app';

export interface Recording {
  blob: Blob;
  seconds: number;
}

const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export function audioFilename(mime: string): string {
  if (mime.includes('ogg')) return 'audio.ogg';
  if (mime.includes('mp4') || mime.includes('aac')) return 'audio.mp4';
  if (mime.includes('wav')) return 'audio.wav';
  if (mime.includes('mpeg')) return 'audio.mp3';
  return 'audio.webm';
}

export function microphoneError(err: unknown): string {
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it from the icon in the address bar, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found.';
  if (name === 'NotReadableError') return 'Your microphone is being used by another app.';
  return `Couldn't start the microphone: ${(err as Error)?.message ?? err}`;
}

const HISTORY_SIZE = 72;
const SAMPLE_MS = 60;

/**
 * Microphone recorder exposing a live input level (0..1), a rolling level history for waveforms,
 * elapsed time, and optional end-of-speech detection.
 */
export function useRecorder(opts: { onSilence?: () => void; silenceMs?: number } = {}) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const cleanupRef = useRef<() => void>(() => {});
  const resolveRef = useRef<((r: Recording | null) => void) | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback(async () => {
    // Created before awaiting permission so it still counts as started by the user's click.
    const audioCtx = new AudioContext();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      audioCtx.close();
      throw err;
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});

    const mimeType = preferredMimeTypes.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const seconds = (Date.now() - startedRef.current) / 1000;
      const type = recorder.mimeType || mimeType || 'audio/webm';
      resolveRef.current?.({ blob: new Blob(chunksRef.current, { type }), seconds });
      resolveRef.current = null;
    };

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    // Held by the cleanup closure: Chrome may garbage-collect an unreferenced source node and the meter goes silent.
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let heardSpeech = false;
    let quietSince = Date.now();
    let lastSample = 0;
    let peak = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      const normalized = Math.min(1, rms * 7);
      peak = Math.max(peak, normalized);

      const now = Date.now();
      if (now - lastSample >= SAMPLE_MS) {
        lastSample = now;
        const sample = peak;
        setLevel(sample);
        setHistory((h) => [...h.slice(-(HISTORY_SIZE - 1)), sample]);
        setElapsed((now - startedRef.current) / 1000);
        peak = 0;
      }

      if (rms > 0.02) {
        heardSpeech = true;
        quietSince = now;
      } else if (heardSpeech && optsRef.current.onSilence && now - quietSince > (optsRef.current.silenceMs ?? 1400)) {
        heardSpeech = false;
        optsRef.current.onSilence();
      }
      raf = requestAnimationFrame(tick);
    };

    cleanupRef.current = () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
      setLevel(0);
    };
    recorderRef.current = recorder;
    startedRef.current = Date.now();
    setHistory([]);
    setElapsed(0);
    recorder.start(250);
    setRecording(true);
    tick();
  }, []);

  /** Stops recording; resolves with the audio, or null when `discard` is set. */
  const stop = useCallback((discard = false): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      resolveRef.current = discard ? () => resolve(null) : resolve;
      recorder.stop();
      cleanupRef.current();
      recorderRef.current = null;
      setRecording(false);
    });
  }, []);

  useEffect(() => () => void stop(true), [stop]);

  return { recording, level, history, elapsed, start, stop };
}

let current: { audio: HTMLAudioElement; id: string; abort: AbortController } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function stopSpeaking() {
  if (!current) return;
  current.abort.abort();
  current.audio.pause();
  current = null;
  notify();
}

/** Plays `text` with TTS. Resolves when playback ends or is stopped. */
export async function speak(text: string, id: string): Promise<void> {
  stopSpeaking();
  const abort = new AbortController();
  const audio = new Audio();
  current = { audio, id, abort };
  notify();
  try {
    const blob = await api.speech(stripMarkdown(text), abort.signal);
    if (current?.audio !== audio) return;
    audio.src = URL.createObjectURL(blob);
    await audio.play();
    await new Promise<void>((resolve) => {
      audio.onended = audio.onpause = () => resolve();
    });
  } catch (err) {
    if (!abort.signal.aborted) useApp.getState().toast((err as Error).message, 'error');
  } finally {
    if (current?.audio === audio) {
      current = null;
      notify();
    }
  }
}

export function useSpeakingId(): string | null {
  const [id, setId] = useState(current?.id ?? null);
  useEffect(() => {
    const l = () => setId(current?.id ?? null);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return id;
}

export const stripMarkdown = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|]/g, '')
    .replace(/\$\$?[^$]*\$\$?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
