import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store/app';
import { useChat } from '../store/chat';
import { speak, stopSpeaking, useRecorder } from '../hooks/audio';

type Phase = 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'muted';

const labels: Record<Phase, string> = {
  listening: 'Listening',
  transcribing: 'Got it…',
  thinking: 'Thinking…',
  speaking: 'Speaking — tap the orb to interrupt',
  muted: 'Microphone off',
};

export function VoiceMode() {
  const setApp = useApp((s) => s.set);
  const [phase, setPhase] = useState<Phase>('listening');
  const [caption, setCaption] = useState('');
  const activeRef = useRef(true);
  const busyRef = useRef(false);

  const recorder = useRecorder({ onSilence: () => void handleTurn() });

  const listen = useCallback(async () => {
    if (!activeRef.current) return;
    setPhase('listening');
    try {
      await recorder.start();
    } catch {
      useApp.getState().toast('Microphone access was denied.', 'error');
      setApp({ voiceModeOpen: false });
    }
  }, [recorder, setApp]);

  async function handleTurn() {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const rec = await recorder.stop();
      if (!rec || rec.seconds < 0.6) return void listen();
      setPhase('transcribing');
      const { text } = await api.transcribe(rec.blob, rec.seconds);
      if (!activeRef.current) return;
      if (!text.trim()) return void listen();
      setCaption(text);
      setPhase('thinking');
      const reply = await useChat.getState().send({ text, attachments: [], tool: null, think: false });
      if (!activeRef.current) return;
      if (reply.trim()) {
        setPhase('speaking');
        setCaption(reply);
        await speak(reply, 'voice-mode');
      }
      listen();
    } catch (err) {
      useApp.getState().toast((err as Error).message, 'error');
      listen();
    } finally {
      busyRef.current = false;
    }
  }

  useEffect(() => {
    listen();
    return () => {
      activeRef.current = false;
      stopSpeaking();
      useChat.getState().isStreaming && useChat.getState().stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = async () => {
    if (phase === 'muted') return listen();
    if (phase === 'listening') {
      await recorder.stop(true);
      setPhase('muted');
    }
  };

  const scale = 1 + (phase === 'listening' ? recorder.level * 0.35 : 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-main py-16">
      <p className="text-sm text-text-secondary">Voice mode</p>
      <button
        type="button"
        aria-label="Interrupt"
        onClick={() => phase === 'speaking' && stopSpeaking()}
        className="size-56 rounded-full"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #bfe3ff 0%, #5aa9ff 35%, #2f6fe0 70%, #1d3f99 100%)',
          transform: `scale(${scale})`,
          transition: 'transform 80ms linear',
          animation: phase === 'speaking' || phase === 'thinking' ? 'orb 1.4s ease-in-out infinite' : undefined,
          opacity: phase === 'muted' ? 0.4 : 1,
        }}
      />
      <div className="flex w-full max-w-xl flex-col items-center gap-6 px-6">
        <p className="line-clamp-3 min-h-[3em] text-center text-text-secondary">{caption}</p>
        <p className="text-sm text-text-tertiary">{labels[phase]}</p>
        <div className="flex gap-6">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={phase === 'muted' ? 'Unmute' : 'Mute'}
            className="flex size-14 items-center justify-center rounded-full bg-surface hover:opacity-80"
          >
            {phase === 'muted' ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          <button
            type="button"
            onClick={() => setApp({ voiceModeOpen: false })}
            aria-label="End voice mode"
            className="flex size-14 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
          >
            <X size={22} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
