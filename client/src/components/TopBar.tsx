import { Archive, Check, ChevronDown, Ellipsis, FileDown, FileText, MessageCircleDashed, PanelLeft, Share, SquarePen, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../store/app';
import { pathTo, useChat } from '../store/chat';
import { IconButton, Menu, MenuDivider, MenuItem, downloadBlob, modelLabel } from './ui';

function exportMarkdown() {
  const { messages, leafId, conversationId } = useChat.getState();
  const title = useApp.getState().conversations.find((c) => c.id === conversationId)?.title ?? 'Chat';
  const body = pathTo(messages, leafId)
    .map((m) => `## ${m.role === 'user' ? 'You' : 'ChatGPT'}\n\n${m.content}${(m.meta.images ?? []).map((i) => `\n\n![${i.prompt}](${location.origin}${i.url})`).join('')}`)
    .join('\n\n---\n\n');
  downloadBlob(new Blob([`# ${title}\n\n${body}\n`], { type: 'text/markdown' }), `${title.replace(/[^\w-]+/g, '_')}.md`);
}

export function ModelPicker() {
  const config = useApp((s) => s.config);
  const model = useApp((s) => s.model);
  const setModel = useApp((s) => s.setModel);
  if (!config) return null;
  return (
    <Menu
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-lg hover:bg-surface-hover">
          ChatGPT <span className="text-text-secondary">{modelLabel(model).replace(/^GPT-/, '')}</span>
          <ChevronDown size={16} className="text-text-secondary" />
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2.5 py-1.5 text-xs text-text-tertiary">Model</p>
          {config.models.map((m) => (
            <MenuItem key={m} onClick={() => (setModel(m), close())} right={m === model ? <Check size={16} /> : null}>
              {modelLabel(m)}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}

export function TopBar({ showModelPicker = true }: { showModelPicker?: boolean }) {
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const setApp = useApp((s) => s.set);
  const conversationId = useChat((s) => s.conversationId);
  const temporary = useChat((s) => s.temporary);
  const hasMessages = useChat((s) => Object.keys(s.messages).length > 0);
  const navigate = useNavigate();

  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-2 px-2">
      <div className="flex min-w-0 items-center gap-1">
        {!sidebarOpen && (
          <>
            <IconButton icon={PanelLeft} label="Open sidebar" onClick={() => setApp({ sidebarOpen: true })} />
            <Link to="/" title="New chat" className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover">
              <SquarePen size={18} strokeWidth={1.75} />
            </Link>
          </>
        )}
        {showModelPicker && <ModelPicker />}
      </div>

      <div className="flex items-center gap-1">
        {conversationId && !temporary ? (
          <>
            <button
              type="button"
              onClick={() => setApp({ shareConversationId: conversationId })}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm hover:bg-surface-hover"
            >
              <Share size={16} /> Share
            </button>
            <Menu align="right" trigger={({ toggle }) => <IconButton icon={Ellipsis} label="More" onClick={toggle} />}>
              {(close) => (
                <>
                  <MenuItem icon={FileText} onClick={() => (close(), exportMarkdown())}>
                    Export as Markdown
                  </MenuItem>
                  <MenuItem icon={FileDown} onClick={() => (close(), window.open(`/print/${conversationId}`, '_blank'))}>
                    Export as PDF
                  </MenuItem>
                  <MenuDivider />
                  <MenuItem
                    icon={Archive}
                    onClick={async () => {
                      close();
                      await api.updateConversation(conversationId, { archived: true });
                      useApp.getState().refreshConversations();
                      navigate('/');
                    }}
                  >
                    Archive
                  </MenuItem>
                  <MenuItem
                    icon={Trash2}
                    danger
                    onClick={async () => {
                      close();
                      if (!confirm('Delete this chat?')) return;
                      await api.deleteConversation(conversationId);
                      useApp.getState().refreshConversations();
                      navigate('/');
                    }}
                  >
                    Delete
                  </MenuItem>
                </>
              )}
            </Menu>
          </>
        ) : (
          !hasMessages && (
            <IconButton
              icon={MessageCircleDashed}
              label={temporary ? 'Turn off temporary chat' : 'Turn on temporary chat'}
              active={temporary}
              className={temporary ? 'bg-surface' : ''}
              onClick={() => useChat.getState().setTemporary(!temporary)}
            />
          )
        )}
      </div>
    </header>
  );
}
