import { useCallback, useEffect, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { api, type Conversation } from './api';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ChatView } from './components/ChatView';

export default function App() {
  const match = useMatch('/c/:id');
  const activeId = match?.params.id;
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  const refreshConversations = useCallback(() => {
    api.listConversations().then(setConversations).catch(console.error);
  }, []);

  useEffect(refreshConversations, [refreshConversations]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this chat?')) return;
    await api.deleteConversation(id);
    if (id === activeId) navigate('/');
    refreshConversations();
  };

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-10 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-20 md:static">
            <Sidebar
              conversations={conversations}
              activeId={activeId}
              onCollapse={() => setSidebarOpen(false)}
              onDelete={handleDelete}
            />
          </div>
        </>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar sidebarOpen={sidebarOpen} onOpenSidebar={() => setSidebarOpen(true)} />
        <ChatView conversationId={activeId} onConversationsChanged={refreshConversations} />
      </main>
    </div>
  );
}
