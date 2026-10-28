import { MessageCircleDashed, PanelLeft, SquarePen } from 'lucide-react';
import { Link } from 'react-router-dom';

interface TopBarProps {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
}

export function TopBar({ sidebarOpen, onOpenSidebar }: TopBarProps) {
  return (
    <header className="flex h-13 shrink-0 items-center justify-between px-3">
      <div className="flex items-center gap-1 text-text-secondary">
        {!sidebarOpen && (
          <>
            <button type="button" title="Open sidebar" onClick={onOpenSidebar} className="rounded-lg p-2 hover:bg-surface-hover">
              <PanelLeft size={18} strokeWidth={1.75} />
            </button>
            <Link to="/" title="New chat" className="rounded-lg p-2 hover:bg-surface-hover">
              <SquarePen size={18} strokeWidth={1.75} />
            </Link>
          </>
        )}
      </div>
      <button
        type="button"
        title="Temporary chat (coming soon)"
        className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover"
      >
        <MessageCircleDashed size={18} strokeWidth={1.75} />
      </button>
    </header>
  );
}
