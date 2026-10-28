import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { useApp } from '../store/app';

/** Dropdown anchored to a trigger; closes on outside click or Escape. */
export function Menu({
  trigger,
  children,
  align = 'left',
  placement = 'bottom',
  className = '',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  placement?: 'bottom' | 'top';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    const width = menu?.width ?? 220;
    const height = menu?.height ?? 0;
    let left = align === 'right' ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = placement === 'top' ? r.top - height - 6 : r.bottom + 6;
    if (top + height > window.innerHeight - 8) top = Math.max(8, r.top - height - 6);
    setPos({ top, left });
  }, [open, align, placement]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className={`fixed z-50 min-w-[200px] rounded-2xl border border-border-subtle bg-popover p-1.5 shadow-2xl ${className}`}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
  right,
  active,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  right?: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-hover ${
        danger ? 'text-red-500' : ''
      } ${active ? 'bg-surface-hover' : ''}`}
    >
      {Icon && <Icon size={17} strokeWidth={1.75} className="shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {right}
    </button>
  );
}

export const MenuDivider = () => <div className="my-1 h-px bg-border-subtle" />;

export function Modal({
  title,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className={`flex max-h-[85vh] w-full ${width} flex-col overflow-hidden rounded-2xl border border-border-subtle bg-main shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <h2 className="text-lg font-medium">{title}</h2>
            <IconButton icon={X} label="Close" onClick={onClose} />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  size = 18,
  className = '',
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  size?: number;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 ${
        active ? 'text-text-primary' : ''
      } ${className}`}
    >
      <Icon size={size} strokeWidth={1.75} />
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface'}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const styles = {
    primary: 'bg-inverse text-on-inverse hover:opacity-85',
    secondary: 'border border-border-subtle hover:bg-surface-hover',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 text-sm font-medium disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return createPortal(
    <div className="pointer-events-none fixed top-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl px-4 py-2.5 text-sm shadow-lg ${t.tone === 'error' ? 'bg-red-600 text-white' : 'bg-inverse text-on-inverse'}`}
        >
          {t.text}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  useApp.getState().toast('Copied to clipboard');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const modelLabel = (model: string) =>
  model
    .replace(/^gpt-/i, 'GPT-')
    .replace(/-(mini|nano|pro|turbo)/gi, (_, s: string) => ` ${s.toLowerCase()}`)
    .replace(/-/g, ' ');
