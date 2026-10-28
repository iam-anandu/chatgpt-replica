import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store/app';

export interface Recording {
  blob: Blob;
  seconds: number;
}

/** Microphone recorder exposing a live input level (0..1) and optional end-of-speech detection. */
export function useRecorder(opts: { onSilence?: () => void; silenceMs?: number } = {}) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const cleanupRef = useRef<() => void>(() => {});
  const resolveRef = useRef<((r: Recording | null) => void) | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const seconds = (Date.now() - startedRef.current) / 1000;
      resolveRef.current?.({ blob: new Blob(chunksRef.current, { type: recorder.mimeType }), seconds });
      resolveRef.current = null;
    };

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let heardSpeech = false;
    let quietSince = Date.now();
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      setLevel(Math.min(1, rms * 6));
      const speaking = rms > 0.03;
      if (speaking) {
        heardSpeech = true;
        quietSince = Date.now();
      } else if (heardSpeech && optsRef.current.onSilence && Date.now() - quietSince > (optsRef.current.silenceMs ?? 1400)) {
        heardSpeech = false;
        optsRef.current.onSilence();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    cleanupRef.current = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
      setLevel(0);
    };
    recorderRef.current = recorder;
    startedRef.current = Date.now();
    recorder.start();
    setRecording(true);
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

  return { recording, level, start, stop };
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
