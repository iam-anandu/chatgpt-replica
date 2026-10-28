import { memo, useState, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return '';
}

function CodeBlock({ children }: ComponentProps<'pre'>) {
  const [copied, setCopied] = useState(false);
  const code = children as { props?: { className?: string; children?: ReactNode } };
  const language = /language-([\w+-]+)/.exec(code?.props?.className ?? '')?.[1] ?? '';
  const text = textOf(code?.props?.children).replace(/\n$/, '');

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-[var(--bg-code)]">
      <div className="flex items-center justify-between px-4 py-2 text-xs text-text-secondary">
        <span>{language || 'text'}</span>
        <button
          type="button"
          className="flex items-center gap-1 hover:text-text-primary"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre className="scrollbar-thin overflow-x-auto px-4 pb-4">{children}</pre>
    </div>
  );
}

/** Lets the model's \( \) and \[ \] math delimiters render like $ and $$. */
const normalizeMath = (text: string) =>
  text.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`).replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: CodeBlock,
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
});
