import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
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
import { useRecorder } from '../hooks/audio';
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

  const finishDictation = async () => {
    const rec = await recorder.stop();
    if (!rec) return;
    setTranscribing(true);
    try {
      const { text: spoken } = await api.transcribe(rec.blob, rec.seconds);
      setText((t) => (t ? `${t} ${spoken}` : spoken));
      textareaRef.current?.focus();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setTranscribing(false);
    }
  };

  const startDictation = () =>
    recorder.start().catch(() => toast('Microphone access was denied.', 'error'));

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
      <button type="button" title="Dictate" onClick={startDictation} className={iconButton} disabled={transcribing}>
        {transcribing ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} strokeWidth={1.75} />}
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

      {recorder.recording ? (
        <div className="flex items-center gap-2">
          <button type="button" title="Cancel" onClick={() => recorder.stop(true)} className={iconButton}>
            <X size={18} />
          </button>
          <div className="flex h-9 flex-1 items-center gap-[3px] overflow-hidden px-2">
            {Array.from({ length: 48 }, (_, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-text-secondary transition-[height]"
                style={{ height: `${4 + recorder.level * 28 * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + Date.now() / 300)))}px` }}
              />
            ))}
          </div>
          <button type="button" title="Done" onClick={finishDictation} className={`${circle} bg-inverse text-on-inverse`}>
            <Check size={18} />
          </button>
        </div>
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
