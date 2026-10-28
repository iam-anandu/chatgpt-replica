# ChatGPT Replica — Build Plan

A local, single-user ChatGPT web clone that looks and behaves like chatgpt.com, powered by your own OpenAI API key.

## 1. Decisions (from clarifications)

| Area | Choice |
|---|---|
| AI provider | OpenAI (API key stored server-side in `.env`, never sent to the browser) |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Storage | SQLite (`better-sqlite3`) + local `uploads/` folder for files/images |
| Auth | None — single user ("iam-anandu" shown in sidebar footer) |
| Run mode | `localhost` now, deployable later (keep config env-driven) |

### Cost note
The app itself is free to build and run. **OpenAI API usage is paid per token/image/minute of audio** — there is no free tier for the API. To keep it cheap, the plan includes a default cheap model, configurable per-feature models, and usage limits (section 6). Models are set via `.env` so you can swap them any time.

## 2. Architecture

```
chatgpt-replica/
├─ client/                 # React + Vite
│  ├─ src/components/      # Sidebar, Composer, MessageList, Message, ModelPicker, Modals...
│  ├─ src/pages/           # Home (new chat), Chat/:id, Project/:id, Library, Settings
│  ├─ src/hooks/           # useChatStream, useConversations, useVoice...
│  ├─ src/store/           # Zustand (UI state) + TanStack Query (server state)
│  └─ src/styles/          # Tailwind theme matching ChatGPT colors/typography
├─ server/                 # Express
│  ├─ routes/              # /chat, /conversations, /projects, /memory, /files, /images, /audio, /share
│  ├─ services/openai.ts   # Single wrapper around the OpenAI SDK (Responses API)
│  ├─ services/memory.ts   # Memory extraction + retrieval
│  ├─ db/schema.sql        # SQLite schema + migrations
│  └─ uploads/
└─ .env                    # OPENAI_API_KEY, model names, limits
```

- **Streaming:** Server calls OpenAI with streaming and forwards tokens to the browser via Server-Sent Events (SSE), so text appears word-by-word like the real app.
- **OpenAI APIs used:** Responses/Chat API (text, vision, built-in web search tool), Images API (image generation/editing), Audio API (speech-to-text for mic, text-to-speech for read-aloud/voice mode), Embeddings API (memory + file search).

### Database tables (SQLite)
- `conversations` (id, title, project_id, pinned, archived, created_at, updated_at)
- `messages` (id, conversation_id, parent_id, role, content, attachments, model, created_at) — `parent_id` enables edit/regenerate branches (`< 2/2 >` navigation)
- `projects` (id, name, icon, color, instructions)
- `project_files` / `files` (id, name, mime, path, extracted_text)
- `memories` (id, content, embedding, source_conversation_id, created_at)
- `settings` (custom instructions, theme, default model, memory on/off)
- `shares` (id, conversation_id snapshot, created_at)
- `usage` (date, input_tokens, output_tokens, images, audio_seconds, cost_estimate)

## 3. UI spec (matched to your screenshot)

- **Theme:** Dark by default (main bg near-black `#212121`/`#0d0d0d` style, sidebar slightly lighter `#171717`), light theme toggle later. Font stack similar to ChatGPT (`ui-sans-serif`, Söhne-like fallback).
- **Sidebar (left, collapsible):**
  - Header: "ChatGPT" label, search icon, collapse-sidebar icon
  - Nav: New chat, Scheduled*, Library, Plugins*, Codex*, Explore*
  - **Pinned** section
  - **Projects** section (folder icons, e.g. "Medilitics")
  - **Recents** (conversation list, hover shows `...` menu: Share, Rename, Pin, Move to project, Archive, Delete)
  - Footer: avatar + name + plan label ("Go"), opens profile menu (Settings, Personalization/Memory, Usage, Log out*)
  - *Items marked \* are visual placeholders ("Coming soon") unless chosen to implement.*
- **Main area:**
  - Top bar: model picker (left), temporary-chat toggle icon (top-right, as in screenshot)
  - Empty state: centered heading "What's on your mind today?"
  - Composer pill: `+` (attach / tools menu), "Ask ChatGPT" placeholder, **Think** toggle (reasoning model), mic (dictation), blue voice-mode button (switches to send arrow when text is typed)
  - Suggestion chips below: "Create an image or sticker", "Write or edit", "Search the web"
  - After first message: composer moves to bottom, messages render above with assistant actions (Copy, Read aloud, Thumbs up/down, Regenerate, Share) and user actions (Copy, Edit)
- **Responsive:** sidebar becomes an overlay drawer on mobile widths.

## 4. Memory design

Two layers, same as ChatGPT:

1. **Saved memories** — after each assistant reply, a cheap background call asks the model: "Did the user share any durable fact/preference worth remembering?" If yes, it's stored in `memories` with an embedding. A small "Memory updated" badge appears under the message (like ChatGPT). Users can also say "remember that…" explicitly.
2. **Chat history reference** — when a new message arrives, the top-K relevant memories (embedding similarity) plus short summaries of recent conversations are injected into the system prompt.

Plus:
- **Custom instructions** ("What should ChatGPT know about you?" / "How should it respond?") always injected.
- **Manage memories** screen: list, search, delete individual memories, clear all, toggle memory on/off.
- **Temporary chat** mode: no history saved, no memory read/write.
- **Project memory:** project chats use project instructions + project files, and can be scoped to only that project's chats.

## 5. Priority-wise feature list

Pick the IDs you want implemented. Each phase builds on the previous one.

### P0 — Foundation (must have, makes it "work like ChatGPT")
| ID | Feature |
|---|---|
| P0.1 | Project scaffold (Vite client + Express server + SQLite + `.env` config) |
| P0.2 | Pixel-close layout: sidebar, empty state, composer, suggestion chips (from screenshot) |
| P0.3 | Send message → streamed response (SSE) with stop-generation button |
| P0.4 | Markdown rendering: code blocks with syntax highlighting + copy button, tables, lists, LaTeX math |
| P0.5 | Conversations persisted in SQLite; Recents list; open/switch chats via URL `/c/:id` |
| P0.6 | Auto-generated chat titles |
| P0.7 | Model picker (configured models) + "Think" toggle mapped to a reasoning model |
| P0.8 | Error handling: invalid key, rate limit, network failure — shown as ChatGPT-style inline errors with retry |

### P1 — Core ChatGPT behaviour
| ID | Feature |
|---|---|
| P1.1 | Message actions: copy, regenerate, edit user message (with branch navigation `< 1/2 >`), thumbs up/down |
| P1.2 | Conversation menu: rename, delete, pin (Pinned section), archive |
| P1.3 | **Memory**: saved memories, auto-extraction, "Memory updated" badge, manage-memories screen |
| P1.4 | Custom instructions / Personalization settings |
| P1.5 | Temporary chat toggle |
| P1.6 | Search chats (search icon → modal like ChatGPT) |
| P1.7 | Collapsible sidebar + mobile drawer + keyboard shortcuts (Ctrl+Shift+O new chat, etc.) |
| P1.8 | Settings modal (General, Personalization, Data controls, Usage) |

### P2 — Multimodal & tools
| ID | Feature |
|---|---|
| P2.1 | File/image uploads via `+` and drag-drop/paste: images to vision model, PDFs/text extracted and sent as context |
| P2.2 | **Web search**: "Search the web" tool with cited sources shown as link chips |
| P2.3 | **Image generation**: "Create an image" — inline image result, download, edit-with-prompt |
| P2.4 | **Voice dictation** (mic button): record → speech-to-text into the composer |
| P2.5 | **Read aloud** on assistant messages (text-to-speech) |
| P2.6 | **Library** page: grid of all generated/uploaded images |

### P3 — Organisation & sharing
| ID | Feature |
|---|---|
| P3.1 | **Projects**: create project, custom instructions, project files, chats inside project, move chat to project |
| P3.2 | Project-file search (embeddings over uploaded files, RAG) |
| P3.3 | **Share chat**: read-only public link `/share/:id` (works on LAN; public once deployed) |
| P3.4 | Export: single chat to Markdown/PDF, all data to JSON (Data controls) |

### P4 — Advanced
| ID | Feature |
|---|---|
| P4.1 | **Canvas**: side-by-side editor for documents/code; model edits the canvas, user can edit directly, version history |
| P4.2 | Canvas code run (sandboxed JS/HTML preview in iframe) |
| P4.3 | **Voice mode** (blue button): full hands-free conversation (record → transcribe → reply → speak), animated orb UI |
| P4.4 | Light theme + theme toggle |
| P4.5 | Placeholder pages for Scheduled, Plugins, Codex, Explore (look-alike, "coming soon") |
| P4.6 | Deployment prep (Docker / Render / Railway; Vercel suits only the client — server needs SQLite-friendly host) |

## 6. Limits & safeguards (configurable in `.env`)

- `DAILY_TOKEN_LIMIT`, `DAILY_IMAGE_LIMIT`, `DAILY_VOICE_MINUTES` — when hit, show ChatGPT-style "You've reached your limit" banner.
- Max upload size (e.g. 20 MB) and allowed file types.
- Context window trimming: keep recent messages + summary of older ones to cap cost.
- Usage page showing tokens/images/audio used and estimated cost.
- Max memories (e.g. 200) with "Memory full" warning, like ChatGPT.

## 7. Not feasible / out of scope

- Exact ChatGPT backend features: Sora video, Agent mode/Operator, Deep Research at full quality, Connectors, Codex cloud, scheduled tasks running server-side (could be approximated later).
- Real-time low-latency voice (OpenAI Realtime API is possible but expensive; P4.3 uses the cheaper record-then-reply approach).
- ChatGPT's proprietary fonts/icons — we use close open-source equivalents (Lucide icons).

## 8. Suggested first milestone

**P0 (all) + P1.1–P1.5** → a usable daily-driver ChatGPT clone with streaming, history, editing/regenerating, and memory. Then add P2 tools one by one.
