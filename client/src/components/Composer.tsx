import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, Lightbulb, Mic, Plus, Square } from 'lucide-react';

export interface ComposerHandle {
  setText: (text: string) => void;
}

interface ComposerProps {
  isStreaming: boolean;
  onSend: (text: string, think: boolean) => void;
  onStop: () => void;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { isStreaming, onSend, onStop },
  ref,
) {
  const [text, setText] = useState('');
  const [think, setThink] = useState(false);
  const [multiline, setMultiline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    setText: (value) => {
      setText(value);
      textareaRef.current?.focus();
    },
  }));

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    // Sticky until cleared: the wider multi-line layout would otherwise flip back and forth.
    if (!text) setMultiline(false);
    else if (text.includes('\n') || el.scrollHeight > 44) setMultiline(true);
  }, [text]);

  const canSend = text.trim().length > 0 && !isStreaming;

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim(), think);
    setText('');
  };

  const iconButton = 'flex size-9 shrink-0 items-center justify-center rounded-full text-text-primary hover:bg-surface';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={`flex w-full gap-1 bg-composer px-2.5 py-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${
        multiline ? 'flex-col rounded-[28px]' : 'items-center rounded-full'
      }`}
    >
      {!multiline && (
        <button type="button" title="Add photos & files (coming soon)" className={iconButton}>
          <Plus size={20} strokeWidth={1.75} />
        </button>
      )}
      <textarea
        ref={textareaRef}
        autoFocus
        rows={1}
        value={text}
        placeholder="Ask ChatGPT"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className={`scrollbar-thin min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:text-text-tertiary ${
          multiline ? 'px-2' : 'px-1'
        }`}
      />
      <div className={`flex items-center gap-1 ${multiline ? 'justify-between' : ''}`}>
        {multiline && (
          <button type="button" title="Add photos & files (coming soon)" className={iconButton}>
            <Plus size={20} strokeWidth={1.75} />
          </button>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setThink((v) => !v)}
            aria-pressed={think}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm ${
              think ? 'bg-accent/20 text-[#7ab7ff]' : 'text-text-secondary hover:bg-surface'
            }`}
          >
            <Lightbulb size={17} strokeWidth={1.75} />
            Think
          </button>
          <button type="button" title="Dictate (coming soon)" className={iconButton}>
            <Mic size={18} strokeWidth={1.75} />
          </button>
          {isStreaming ? (
            <button
              type="button"
              title="Stop generating"
              onClick={onStop}
              className="flex size-9 items-center justify-center rounded-full bg-white text-black"
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : canSend ? (
            <button
              type="submit"
              title="Send"
              className="flex size-9 items-center justify-center rounded-full bg-white text-black hover:opacity-80"
            >
              <ArrowUp size={20} strokeWidth={2.25} />
            </button>
          ) : (
            <button
              type="button"
              title="Voice mode (coming soon)"
              className="flex size-9 items-center justify-center rounded-full bg-accent text-white"
            >
              <AudioLines size={18} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
});
