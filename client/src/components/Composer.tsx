import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  Check,
  Globe,
  ImagePlus,
  Lightbulb,
  Loader2,
  Mic,
  Paperclip,
  PanelRight,
  Plus,
  Square,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, type Attachment, type ToolHint } from '../api';
import { useApp } from '../store/app';
import { audioFilename, microphoneError, useRecorder } from '../hooks/audio';
import { AttachmentPreview } from './Message';
import { Menu, MenuDivider, MenuItem } from './ui';

export interface ComposerHandle {
  setText: (text: string) => void;
  setTool: (tool: ToolHint) => void;
  addFiles: (files: File[]) => void;
}

export interface ComposerSubmit {
  text: string;
  attachments: Attachment[];
  tool: ToolHint;
  think: boolean;
}

interface ComposerProps {
  isStreaming: boolean;
  onSubmit: (input: ComposerSubmit) => void;
  onStop: () => void;
  placeholder?: string;
}

const WAVEFORM_BARS = 72;

function Dictation({
  history,
  elapsed,
  transcribing,
  onCancel,
  onDone,
}: {
  history: number[];
  elapsed: number;
  transcribing: boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (transcribing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onDone();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [transcribing, onCancel, onDone]);

  const bars = [...Array(Math.max(0, WAVEFORM_BARS - history.length)).fill(null), ...history.slice(-WAVEFORM_BARS)];
  const time = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <button
        type="button"
        title="Cancel (Esc)"
        onClick={onCancel}
        disabled={transcribing}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface hover:text-text-primary disabled:opacity-30"
      >
        <X size={18} />
      </button>

      <div className="relative flex h-9 min-w-0 flex-1 items-center justify-end gap-[3px] overflow-hidden px-1">
        {bars.map((v, i) =>
          v === null ? (
            <span key={i} className="size-[3px] shrink-0 rounded-full bg-text-tertiary/40" />
          ) : (
            <span
              key={i}
              className={`w-[3px] shrink-0 rounded-full transition-[height] duration-75 ${transcribing ? 'bg-text-tertiary' : 'bg-text-primary'}`}
              style={{ height: `${Math.max(3, Math.round(v * 30))}px` }}
            />
          ),
        )}
        {transcribing && (
          <span className="absolute inset-0 flex items-center justify-center bg-composer/70">
            <span className="shimmer text-sm font-medium">Transcribing…</span>
          </span>
        )}
      </div>

      <span className="flex w-14 shrink-0 items-center gap-1.5 text-sm text-text-secondary tabular-nums">
        {!transcribing && <span className="size-2 animate-pulse rounded-full bg-red-500" />}
        {time}
      </span>

      <button
        type="button"
        title="Done (Enter)"
        onClick={onDone}
        disabled={transcribing}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-inverse text-on-inverse hover:opacity-80"
      >
        {transcribing ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.5} />}
      </button>
    </div>
  );
}

const tools: Record<Exclude<ToolHint, null>, { label: string; icon: LucideIcon }> = {
  image: { label: 'Image', icon: ImagePlus },
  search: { label: 'Search', icon: Globe },
  canvas: { label: 'Canvas', icon: PanelRight },
};

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { isStreaming, onSubmit, onStop, placeholder = 'Ask ChatGPT' },
  ref,
) {
  const [text, setText] = useState('');
  const [think, setThink] = useState(false);
  const [tool, setTool] = useState<ToolHint>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [multiline, setMultiline] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useRecorder();
  const toast = useApp((s) => s.toast);

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const attachment = await api.uploadFile(file);
        setAttachments((prev) => [...prev, attachment]);
      } catch (err) {
        toast(`${file.name}: ${(err as Error).message}`, 'error');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    setText: (value) => {
      setText(value);
      textareaRef.current?.focus();
    },
    setTool,
    addFiles,
  }));

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    // Sticky until cleared: the wider multi-line layout would otherwise flip back and forth.
    if (!text) setMultiline(false);
    else if (text.includes('\n') || el.scrollHeight > 44) setMultiline(true);
  }, [text]);

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isStreaming && uploading === 0;

  const submit = () => {
    if (!canSend) return;
    onSubmit({ text: text.trim(), attachments, tool, think });
    setText('');
    setAttachments([]);
    setTool(null);
  };

  const cursorRef = useRef<number | null>(null);

  const finishDictation = async () => {
    if (transcribing) return;
    setTranscribing(true);
    try {
      const rec = await recorder.stop();
      if (!rec) return;
      const { text: spoken } = await api.transcribe(rec.blob, rec.seconds, audioFilename(rec.blob.type));
      const words = spoken.trim();
      if (!words) {
        toast("Didn't catch that. Try speaking a little closer to the mic.", 'error');
        return;
      }
      const at = cursorRef.current ?? text.length;
      setText((t) => {
        const before = t.slice(0, at);
        const after = t.slice(at);
        const pad = (s: string, side: 'start' | 'end') =>
          s && !(side === 'end' ? /\s$/.test(s) : /^\s/.test(s)) ? ' ' : '';
        return `${before}${pad(before, 'end')}${words}${pad(after, 'start')}${after}`;
      });
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setTranscribing(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const startDictation = () => {
    cursorRef.current = textareaRef.current?.selectionStart ?? null;
    recorder.start().catch((err) => toast(microphoneError(err), 'error'));
  };

  const cancelDictation = () => {
    recorder.stop(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const stacked = multiline || attachments.length > 0 || uploading > 0 || tool !== null;
  const circle = 'flex size-9 shrink-0 items-center justify-center rounded-full';
  const iconButton = `${circle} text-text-primary hover:bg-surface`;

  const plusMenu = (
    <Menu
      placement="top"
      trigger={({ toggle }) => (
        <button type="button" title="Add files and more" onClick={toggle} className={iconButton}>
          <Plus size={20} strokeWidth={1.75} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={Paperclip} onClick={() => (close(), fileInputRef.current?.click())}>
            Add photos & files
          </MenuItem>
          <MenuDivider />
          <MenuItem icon={ImagePlus} onClick={() => (close(), setTool('image'))}>
            Create image
          </MenuItem>
          <MenuItem icon={Lightbulb} onClick={() => (close(), setThink(true))}>
            Think longer
          </MenuItem>
          <MenuItem icon={Globe} onClick={() => (close(), setTool('search'))}>
            Web search
          </MenuItem>
          <MenuItem icon={PanelRight} onClick={() => (close(), setTool('canvas'))}>
            Canvas
          </MenuItem>
        </>
      )}
    </Menu>
  );

  const toolChip = tool && (
    <button
      type="button"
      onClick={() => setTool(null)}
      className="group flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-[#7ab7ff] hover:bg-accent/15"
    >
      {(() => {
        const Icon = tools[tool].icon;
        return <Icon size={17} strokeWidth={1.75} className="group-hover:hidden" />;
      })()}
      <X size={17} className="hidden group-hover:block" />
      {tools[tool].label}
    </button>
  );

  const rightControls = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setThink((v) => !v)}
        aria-pressed={think}
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm ${
          think ? 'bg-accent/15 text-[#7ab7ff]' : 'text-text-secondary hover:bg-surface'
        }`}
      >
        <Lightbulb size={17} strokeWidth={1.75} />
        Think
      </button>
      <button type="button" title="Dictate" aria-label="Dictate" onClick={startDictation} className={iconButton}>
        <Mic size={18} strokeWidth={1.75} />
      </button>
      {isStreaming ? (
        <button type="button" title="Stop generating" onClick={onStop} className={`${circle} bg-inverse text-on-inverse`}>
          <Square size={13} fill="currentColor" />
        </button>
      ) : text.trim() || attachments.length ? (
        <button
          type="submit"
          title="Send"
          disabled={!canSend}
          className={`${circle} bg-inverse text-on-inverse hover:opacity-80 disabled:opacity-30`}
        >
          <ArrowUp size={20} strokeWidth={2.25} />
        </button>
      ) : (
        <button
          type="button"
          title="Use voice mode"
          onClick={() => useApp.getState().set({ voiceModeOpen: true })}
          className={`${circle} bg-accent text-white hover:opacity-90`}
        >
          <AudioLines size={18} strokeWidth={2} />
        </button>
      )}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={`composer-shadow flex w-full flex-col bg-composer px-2.5 py-2.5 ${stacked ? 'gap-1 rounded-[28px]' : 'rounded-full'}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />

      {(attachments.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2 px-2 pt-1 pb-2">
          {attachments.map((a) => (
            <AttachmentPreview
              key={a.id}
              attachment={a}
              onRemove={() => {
                setAttachments((prev) => prev.filter((x) => x.id !== a.id));
                api.deleteFile(a.id).catch(() => {});
              }}
            />
          ))}
          {uploading > 0 && (
            <div className="flex size-16 items-center justify-center rounded-xl border border-border-subtle">
              <Loader2 size={20} className="animate-spin text-text-secondary" />
            </div>
          )}
        </div>
      )}

      {recorder.recording || transcribing ? (
        <Dictation
          history={recorder.history}
          elapsed={recorder.elapsed}
          transcribing={transcribing}
          onCancel={cancelDictation}
          onDone={finishDictation}
        />
      ) : (
        <div className={`flex ${stacked ? 'flex-col' : 'items-center'} gap-1`}>
          {!stacked && plusMenu}
          <textarea
            ref={textareaRef}
            autoFocus
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length) {
                e.preventDefault();
                addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            className={`scrollbar-thin min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:text-text-tertiary ${
              stacked ? 'px-2' : 'px-1'
            }`}
          />
          {stacked ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {plusMenu}
                {toolChip}
              </div>
              {rightControls}
            </div>
          ) : (
            rightControls
          )}
        </div>
      )}
    </form>
  );
});
