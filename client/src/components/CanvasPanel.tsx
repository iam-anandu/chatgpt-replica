import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { Code2, Copy, Download, Eye, History, Pencil, Play, X } from 'lucide-react';
import { api, type Canvas } from '../api';
import { useApp } from '../store/app';
import { useChat } from '../store/chat';
import { Markdown } from './Markdown';
import { IconButton, Menu, MenuItem, copyText, downloadBlob } from './ui';

const languageExtension = (lang: string | null) => {
  switch ((lang ?? '').toLowerCase()) {
    case 'javascript':
    case 'js':
    case 'jsx':
      return [javascript({ jsx: true })];
    case 'typescript':
    case 'ts':
    case 'tsx':
      return [javascript({ jsx: true, typescript: true })];
    case 'python':
    case 'py':
      return [python()];
    case 'html':
      return [html()];
    case 'css':
      return [css()];
    case 'markdown':
    case 'md':
      return [markdown()];
    default:
      return [];
  }
};

const extensions: Record<string, string> = {
  javascript: 'js', typescript: 'ts', python: 'py', html: 'html', css: 'css', markdown: 'md', java: 'java',
  csharp: 'cs', go: 'go', rust: 'rs', sql: 'sql', json: 'json', bash: 'sh',
};

const runnable = (lang: string | null) => ['html', 'javascript', 'js', 'jsx', 'css'].includes((lang ?? '').toLowerCase());

function previewDocument(canvas: Canvas, content: string): string {
  const lang = (canvas.language ?? '').toLowerCase();
  if (lang === 'html') return content;
  if (lang === 'css') return `<style>${content}</style><h1>Heading</h1><p>Paragraph with <a href="#">a link</a>.</p><button>Button</button>`;
  const consoleShim = `<style>body{font:13px ui-monospace,monospace;margin:12px;color:#ddd;background:#111}.e{color:#f87171}</style>
<script>
const out=(cls,args)=>{const d=document.createElement('div');d.className=cls;d.textContent=args.map(a=>typeof a==='object'?JSON.stringify(a,null,2):String(a)).join(' ');document.body.appendChild(d)};
console.log=(...a)=>out('',a);console.info=console.log;console.warn=(...a)=>out('e',a);console.error=(...a)=>out('e',a);
window.onerror=(m)=>out('e',[m]);
<\/script>`;
  return `${consoleShim}<script type="module">${content.replace(/<\/script>/g, '<\\/script>')}<\/script>`;
}

export default function CanvasPanel({ canvasId }: { canvasId: string }) {
  const canvas = useChat((s) => s.canvases[canvasId]);
  const upsertCanvas = useChat((s) => s.upsertCanvas);
  const openCanvas = useChat((s) => s.openCanvas);
  const isStreaming = useChat((s) => s.isStreaming);
  const theme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  const [draft, setDraft] = useState(canvas?.content ?? '');
  const [editingDoc, setEditingDoc] = useState(false);
  const [preview, setPreview] = useState(false);
  const [versions, setVersions] = useState<Canvas['versions']>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  useEffect(() => {
    api.getCanvas(canvasId).then((c) => {
      upsertCanvas(c);
      setVersions(c.versions);
    });
  }, [canvasId, upsertCanvas]);

  // Adopt assistant updates unless the user has unsaved edits.
  useEffect(() => {
    if (canvas && !dirty.current) setDraft(canvas.content);
  }, [canvas?.content, canvas?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (content: string) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const saved = await api.saveCanvas(canvasId, content);
      dirty.current = false;
      upsertCanvas(saved);
      setVersions(saved.versions);
    }, 1200);
  };

  const onChange = (value: string) => {
    dirty.current = true;
    setDraft(value);
    save(value);
  };

  const cmExtensions = useMemo(
    () => [...languageExtension(canvas?.type === 'document' ? 'markdown' : canvas?.language ?? null), EditorView.lineWrapping],
    [canvas?.type, canvas?.language],
  );

  if (!canvas) return <div className="flex-1" />;

  const filename = `${canvas.title.replace(/[^\w-]+/g, '_')}.${
    canvas.type === 'document' ? 'md' : extensions[(canvas.language ?? '').toLowerCase()] ?? 'txt'
  }`;

  return (
    <section className="flex min-w-0 flex-1 flex-col border-l border-border-subtle bg-main">
      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <IconButton icon={X} label="Close canvas" onClick={() => openCanvas(null)} />
        <h2 className="min-w-0 flex-1 truncate font-medium">{canvas.title}</h2>
        {isStreaming && <span className="shimmer text-sm">Updating…</span>}
        <Menu
          align="right"
          trigger={({ toggle }) => <IconButton icon={History} label="Version history" onClick={toggle} />}
          className="max-h-80 overflow-y-auto"
        >
          {(close) =>
            versions?.length ? (
              versions.map((v, i) => (
                <MenuItem
                  key={v.id}
                  onClick={async () => {
                    close();
                    const restored = await api.restoreCanvas(canvasId, v.id);
                    dirty.current = false;
                    upsertCanvas(restored);
                    setVersions(restored.versions);
                    useApp.getState().toast('Version restored');
                  }}
                  right={i === 0 ? <span className="text-xs text-text-tertiary">Current</span> : null}
                >
                  {new Date(v.created_at).toLocaleString()} · {v.source === 'assistant' ? 'ChatGPT' : 'You'}
                </MenuItem>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-text-tertiary">No versions yet</p>
            )
          }
        </Menu>
        {canvas.type === 'document' ? (
          <IconButton
            icon={editingDoc ? Eye : Pencil}
            label={editingDoc ? 'Preview' : 'Edit'}
            onClick={() => setEditingDoc((v) => !v)}
          />
        ) : (
          runnable(canvas.language) && (
            <IconButton icon={preview ? Code2 : Play} label={preview ? 'Show code' : 'Run'} onClick={() => setPreview((v) => !v)} />
          )
        )}
        <IconButton icon={Copy} label="Copy" onClick={() => copyText(draft)} />
        <IconButton icon={Download} label="Download" onClick={() => downloadBlob(new Blob([draft]), filename)} />
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {canvas.type === 'document' && !editingDoc ? (
          <div className="mx-auto max-w-3xl px-8 py-10" onDoubleClick={() => setEditingDoc(true)}>
            <Markdown>{draft}</Markdown>
          </div>
        ) : preview ? (
          <iframe
            title="Preview"
            sandbox="allow-scripts allow-modals"
            srcDoc={previewDocument(canvas, draft)}
            className="h-full w-full bg-white"
          />
        ) : (
          <CodeMirror
            value={draft}
            onChange={onChange}
            theme={theme === 'dark' ? oneDark : 'light'}
            extensions={cmExtensions}
            height="100%"
            className="h-full text-sm [&_.cm-editor]:h-full [&_.cm-editor]:bg-transparent"
            basicSetup={{ foldGutter: false }}
          />
        )}
      </div>
      {canvas.type === 'code' && (canvas.language ?? '').toLowerCase() === 'python' && (
        <p className="border-t border-border-subtle px-4 py-2 text-xs text-text-tertiary">
          Python can't run in the browser here — copy or download it to run locally.
        </p>
      )}
    </section>
  );
}
