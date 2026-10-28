import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ellipsis, FileText, Folder, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type Attachment, type Conversation, type Project } from '../api';
import { useApp } from '../store/app';
import { useChat } from '../store/chat';
import { ChatView } from '../components/ChatView';
import { TopBar } from '../components/TopBar';
import { Button, IconButton, Menu, MenuItem, Modal } from '../components/ui';

type ProjectDetail = Project & { conversations: Conversation[]; files: Attachment[] };

function InstructionsDialog({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(project.instructions ?? '');
  return (
    <Modal title="Instructions" onClose={onClose}>
      <div className="space-y-3 p-5">
        <p className="text-sm text-text-secondary">
          How can ChatGPT best help you with this project? You can ask it to focus on certain topics, or use a specific tone
          or format.
        </p>
        <textarea
          autoFocus
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border border-border-subtle bg-main p-3 text-sm outline-none"
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={async () => {
              await api.updateProject(project.id, { instructions: text });
              onSaved();
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const toast = useApp((s) => s.toast);

  const load = useCallback(() => {
    if (id) api.getProject(id).then(setProject).catch(() => navigate('/'));
  }, [id, navigate]);

  useEffect(() => {
    useChat.getState().reset();
    load();
  }, [load]);

  if (!project) return null;

  const rename = async () => {
    const name = prompt('Project name', project.name);
    if (!name?.trim()) return;
    await api.updateProject(project.id, { name });
    load();
    useApp.getState().refreshProjects();
  };

  const remove = async () => {
    if (!confirm(`Delete project "${project.name}" and all its chats and files?`)) return;
    await api.deleteProject(project.id);
    await useApp.getState().refreshProjects();
    useApp.getState().refreshConversations();
    navigate('/');
  };

  const upload = async (files: File[]) => {
    setUploading(true);
    for (const file of files) {
      try {
        const res = await api.uploadFile(file, project.id);
        if (res.warning) toast(res.warning, 'error');
      } catch (err) {
        toast(`${file.name}: ${(err as Error).message}`, 'error');
      }
    }
    setUploading(false);
    load();
  };

  const header = (
    <div className="mb-6 flex w-full max-w-3xl items-center gap-3">
      <Folder size={28} style={{ color: project.color ?? undefined }} />
      <h1 className="flex-1 truncate text-[28px] font-normal tracking-tight">{project.name}</h1>
      <Menu align="right" trigger={({ toggle }) => <IconButton icon={Ellipsis} label="Project options" onClick={toggle} />}>
        {(close) => (
          <>
            <MenuItem icon={Pencil} onClick={() => (close(), rename())}>
              Rename project
            </MenuItem>
            <MenuItem icon={Trash2} danger onClick={() => (close(), remove())}>
              Delete project
            </MenuItem>
          </>
        )}
      </Menu>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar />
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex min-h-[340px] flex-col">
          <ChatView projectId={project.id} emptyState={header} />
        </div>
        <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 pb-10 md:grid-cols-2">
          <section className="rounded-2xl border border-border-subtle p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Files</h2>
              <IconButton icon={uploading ? Loader2 : Plus} label="Add files" onClick={() => fileInput.current?.click()} className={uploading ? '[&_svg]:animate-spin' : ''} />
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  upload([...(e.target.files ?? [])]);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="mb-2 text-xs text-text-tertiary">Chats in this project can search these files (text, code, PDF).</p>
            <ul className="space-y-1">
              {project.files.map((f) => (
                <li key={f.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover">
                  <FileText size={16} className="shrink-0 text-text-secondary" />
                  <a href={`${f.url}?download=1`} className="min-w-0 flex-1 truncate">
                    {f.name}
                  </a>
                  <button
                    type="button"
                    title="Remove"
                    onClick={async () => {
                      await api.deleteFile(f.id);
                      load();
                    }}
                    className="hidden text-text-secondary group-hover:block hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
              {project.files.length === 0 && <li className="text-sm text-text-tertiary">No files yet</li>}
            </ul>
          </section>
          <section className="rounded-2xl border border-border-subtle p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Instructions</h2>
              <IconButton icon={Pencil} label="Edit instructions" onClick={() => setEditingInstructions(true)} />
            </div>
            <p className="line-clamp-6 text-sm whitespace-pre-wrap text-text-secondary">
              {project.instructions?.trim() || 'Tailor the way ChatGPT responds in this project.'}
            </p>
          </section>
          <section className="md:col-span-2">
            <h2 className="mb-2 px-1 text-sm text-text-tertiary">Chats in this project</h2>
            <ul className="divide-y divide-border-subtle">
              {project.conversations.map((c) => (
                <li key={c.id}>
                  <Link to={`/c/${c.id}`} className="flex items-center justify-between rounded-lg px-2 py-3 hover:bg-surface-hover">
                    <span className="truncate">{c.title}</span>
                    <span className="shrink-0 text-xs text-text-tertiary">{new Date(c.updated_at).toLocaleDateString()}</span>
                  </Link>
                </li>
              ))}
              {project.conversations.length === 0 && <li className="px-2 py-3 text-sm text-text-tertiary">No chats yet</li>}
            </ul>
          </section>
        </div>
      </div>
      {editingInstructions && (
        <InstructionsDialog project={project} onClose={() => setEditingInstructions(false)} onSaved={load} />
      )}
    </div>
  );
}
