import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArchiveRestore, BarChart3, Database, Settings as SettingsIcon, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { api, type Conversation, type Memory, type UsageReport } from '../api';
import { useApp, type SettingsTab } from '../store/app';
import { SILENT_PEAK, getMicDeviceId, microphoneError, setMicDeviceId, useRecorder } from '../hooks/audio';
import { Button, IconButton, Modal, Toggle, modelLabel } from './ui';

const voices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

const tabs: { id: SettingsTab; label: string; icon: typeof SettingsIcon }[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'personalization', label: 'Personalization', icon: SlidersHorizontal },
  { id: 'data', label: 'Data controls', icon: Database },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
];

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border-subtle py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {description && <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Select({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border-subtle bg-main px-2.5 py-1.5 text-sm outline-none"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

function MicrophoneSetting() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState(getMicDeviceId());
  const recorder = useRecorder();

  const loadDevices = async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications'));
  };

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
  }, []);

  const test = async () => {
    if (recorder.recording) return void recorder.stop(true);
    try {
      await recorder.start();
      loadDevices(); // labels become available after permission is granted
    } catch (err) {
      useApp.getState().toast(microphoneError(err), 'error');
    }
  };

  return (
    <div className="border-b border-border-subtle py-3.5">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm">Microphone</p>
          <p className="mt-0.5 text-xs text-text-tertiary">Used for dictation and voice mode. Press Test and speak.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selected}
            options={[
              ['', 'System default'],
              ...devices
                .filter((d) => d.deviceId !== 'default')
                .map((d, i): [string, string] => [d.deviceId, d.label || `Microphone ${i + 1}`]),
            ]}
            onChange={(id) => {
              setSelected(id);
              setMicDeviceId(id);
              if (recorder.recording) recorder.stop(true);
            }}
          />
          <Button onClick={test}>{recorder.recording ? 'Stop' : 'Test'}</Button>
        </div>
      </div>
      {recorder.recording && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full bg-green-500 transition-[width] duration-75" style={{ width: `${recorder.level * 100}%` }} />
          </div>
          <span className="w-36 text-xs text-text-tertiary">
            {recorder.level < SILENT_PEAK ? 'No sound detected…' : 'Picking up sound ✓'}
          </span>
        </div>
      )}
    </div>
  );
}

function General() {
  const settings = useApp((s) => s.settings)!;
  const config = useApp((s) => s.config)!;
  const update = useApp((s) => s.updateSettings);
  return (
    <div>
      <Row label="Theme">
        <Select
          value={settings.theme}
          options={[
            ['system', 'System'],
            ['dark', 'Dark'],
            ['light', 'Light'],
          ]}
          onChange={(v) => update({ theme: v as typeof settings.theme })}
        />
      </Row>
      <Row label="Default model" description="Used for new chats and background tasks.">
        <Select
          value={settings.defaultModel}
          options={config.models.map((m) => [m, modelLabel(m)])}
          onChange={(v) => {
            update({ defaultModel: v });
            useApp.getState().setModel(v);
          }}
        />
      </Row>
      <Row label="Voice" description="Used for Read aloud and voice mode.">
        <Select value={settings.voice} options={voices.map((v) => [v, v[0].toUpperCase() + v.slice(1)])} onChange={(v) => update({ voice: v })} />
      </Row>
      <MicrophoneSetting />
      <Row label="Web search" description="Let ChatGPT search the web automatically when it helps.">
        <Toggle checked={settings.webSearchAuto} onChange={(v) => update({ webSearchAuto: v })} />
      </Row>
      <Row label="OpenAI API key" description="Set OPENAI_API_KEY in server/.env and restart the server.">
        <span className={`text-sm ${config.apiKeyConfigured ? 'text-green-500' : 'text-red-500'}`}>
          {config.apiKeyConfigured ? 'Configured' : 'Missing'}
        </span>
      </Row>
    </div>
  );
}

function ManageMemories({ onBack }: { onBack: () => void }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [max, setMax] = useState(0);
  const [draft, setDraft] = useState('');
  const load = () => api.memories().then((r) => (setMemories(r.memories), setMax(r.max)));
  useEffect(() => void load(), []);

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-text-secondary hover:text-text-primary">
        ← Back
      </button>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Saved memories</h3>
        <span className="text-xs text-text-tertiary">
          {memories.length} / {max} {memories.length >= max && '· Memory full'}
        </span>
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          await api.addMemory(draft.trim());
          setDraft('');
          load();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a memory, e.g. “I prefer metric units”"
          className="flex-1 rounded-lg border border-border-subtle bg-main px-3 py-2 text-sm outline-none"
        />
        <Button type="submit" disabled={!draft.trim()}>
          Add
        </Button>
      </form>
      <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
        {memories.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="flex-1">{m.content}</span>
            <IconButton
              icon={Trash2}
              label="Delete memory"
              size={16}
              onClick={async () => {
                await api.deleteMemory(m.id);
                load();
              }}
            />
          </li>
        ))}
        {memories.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-tertiary">No memories yet.</li>}
      </ul>
      {memories.length > 0 && (
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm('Delete all saved memories?')) return;
            await api.clearMemories();
            load();
          }}
        >
          Clear all memories
        </Button>
      )}
    </div>
  );
}

function Personalization() {
  const settings = useApp((s) => s.settings)!;
  const update = useApp((s) => s.updateSettings);
  const [managing, setManaging] = useState(false);
  const [form, setForm] = useState({
    nickname: settings.nickname,
    occupation: settings.occupation,
    aboutUser: settings.aboutUser,
    responseStyle: settings.responseStyle,
  });
  const dirty = Object.entries(form).some(([k, v]) => settings[k as keyof typeof form] !== v);

  if (managing) return <ManageMemories onBack={() => setManaging(false)} />;

  const field = 'w-full rounded-xl border border-border-subtle bg-main px-3 py-2 text-sm outline-none focus:border-text-tertiary';
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="font-medium">Custom instructions</h3>
        <label className="block space-y-1.5">
          <span className="text-sm text-text-secondary">What should ChatGPT call you?</span>
          <input className={field} value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-text-secondary">What do you do?</span>
          <input className={field} value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-text-secondary">Anything else ChatGPT should know about you?</span>
          <textarea rows={3} className={field} value={form.aboutUser} onChange={(e) => setForm({ ...form, aboutUser: e.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-text-secondary">How would you like ChatGPT to respond?</span>
          <textarea
            rows={3}
            className={field}
            placeholder="e.g. Be concise. Use bullet points. Explain code step by step."
            value={form.responseStyle}
            onChange={(e) => setForm({ ...form, responseStyle: e.target.value })}
          />
        </label>
        <div className="flex justify-end">
          <Button variant="primary" disabled={!dirty} onClick={() => update(form).then(() => useApp.getState().toast('Saved'))}>
            Save
          </Button>
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-medium">Memory</h3>
        <Row label="Reference saved memories" description="Let ChatGPT save and use memories when responding.">
          <Toggle checked={settings.memoryEnabled} onChange={(v) => update({ memoryEnabled: v })} />
        </Row>
        <Row label="Reference chat history" description="Let ChatGPT reference recent conversations when responding.">
          <Toggle
            checked={settings.referenceChatHistory}
            onChange={(v) => update({ referenceChatHistory: v })}
          />
        </Row>
        <Row label="Manage memories">
          <Button onClick={() => setManaging(true)}>Manage</Button>
        </Row>
      </section>
    </div>
  );
}

function DataControls() {
  const [archived, setArchived] = useState<Conversation[] | null>(null);
  const refresh = useApp((s) => s.refreshConversations);
  const navigate = useNavigate();
  const loadArchived = () => api.listConversations(true).then(setArchived);

  return (
    <div>
      <Row label="Archived chats">
        <Button onClick={loadArchived}>Manage</Button>
      </Row>
      {archived && (
        <ul className="mb-3 max-h-56 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle">
          {archived.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={() => {
                  useApp.getState().set({ settingsTab: null });
                  navigate(`/c/${c.id}`);
                }}
              >
                {c.title}
              </button>
              <IconButton
                icon={ArchiveRestore}
                label="Unarchive"
                size={16}
                onClick={async () => {
                  await api.updateConversation(c.id, { archived: false });
                  loadArchived();
                  refresh();
                }}
              />
              <IconButton
                icon={Trash2}
                label="Delete"
                size={16}
                onClick={async () => {
                  await api.deleteConversation(c.id);
                  loadArchived();
                }}
              />
            </li>
          ))}
          {archived.length === 0 && <li className="px-3 py-4 text-center text-sm text-text-tertiary">No archived chats</li>}
        </ul>
      )}
      <Row label="Archive all chats">
        <Button
          onClick={async () => {
            if (!confirm('Archive all chats?')) return;
            await api.archiveAll();
            refresh();
            navigate('/');
          }}
        >
          Archive all
        </Button>
      </Row>
      <Row label="Delete all chats">
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm('Delete ALL chats permanently? This cannot be undone.')) return;
            await api.deleteAllConversations();
            refresh();
            navigate('/');
          }}
        >
          Delete all
        </Button>
      </Row>
      <Row label="Export data" description="Download all chats, memories, projects and settings as JSON.">
        <a href="/api/export" className="rounded-full border border-border-subtle px-4 py-2 text-sm font-medium hover:bg-surface-hover">
          Export
        </a>
      </Row>
    </div>
  );
}

function Usage() {
  const [report, setReport] = useState<UsageReport | null>(null);
  useEffect(() => void api.usage().then(setReport), []);
  if (!report) return null;
  const { today, limits } = report;
  const fmt = (n: number) => n.toLocaleString();
  const bar = (used: number, limit: number) =>
    limit > 0 && (
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Tokens today', today.input_tokens + today.output_tokens, limits.dailyTokens],
          ['Images today', today.images, limits.dailyImages],
          ['Voice minutes today', Math.round(today.audio_seconds / 60), Math.round(limits.dailyVoiceSeconds / 60)],
        ].map(([label, used, limit]) => (
          <div key={label as string} className="rounded-xl border border-border-subtle p-3">
            <p className="text-xs text-text-tertiary">{label}</p>
            <p className="text-lg">
              {fmt(used as number)}
              <span className="text-sm text-text-tertiary"> / {(limit as number) > 0 ? fmt(limit as number) : '∞'}</span>
            </p>
            {bar(used as number, limit as number)}
          </div>
        ))}
        <div className="rounded-xl border border-border-subtle p-3">
          <p className="text-xs text-text-tertiary">Estimated cost today</p>
          <p className="text-lg">${today.cost.toFixed(4)}</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-text-tertiary">
          <tr>
            <th className="py-2 font-normal">Date</th>
            <th className="font-normal">Input</th>
            <th className="font-normal">Output</th>
            <th className="font-normal">Images</th>
            <th className="font-normal">Est. cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {report.days.map((d) => (
            <tr key={d.date}>
              <td className="py-2">{d.date}</td>
              <td>{fmt(d.input_tokens)}</td>
              <td>{fmt(d.output_tokens)}</td>
              <td>{d.images}</td>
              <td>${d.cost.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-text-tertiary">
        Costs are estimates based on the prices in server/.env. Check platform.openai.com for actual billing. Limits are set
        in server/.env.
      </p>
    </div>
  );
}

export function SettingsModal({ tab }: { tab: SettingsTab }) {
  const setApp = useApp((s) => s.set);
  const close = () => setApp({ settingsTab: null });
  return (
    <Modal onClose={close} width="max-w-3xl">
      <div className="flex h-[600px] max-h-[85vh] flex-col sm:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border-subtle p-2 sm:w-52 sm:flex-col sm:border-r sm:border-b-0">
          <div className="hidden px-1 pb-2 sm:block">
            <IconButton icon={X} label="Close" onClick={close} />
          </div>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setApp({ settingsTab: id })}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${tab === id ? 'bg-surface' : 'hover:bg-surface-hover'}`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <h2 className="mb-3 border-b border-border-subtle pb-3 text-lg font-medium">{tabs.find((t) => t.id === tab)?.label}</h2>
          {tab === 'general' && <General />}
          {tab === 'personalization' && <Personalization />}
          {tab === 'data' && <DataControls />}
          {tab === 'usage' && <Usage />}
        </div>
      </div>
    </Modal>
  );
}
