# ChatGPT Replica

A local, single-user clone of the ChatGPT web app, powered by your own OpenAI API key.

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + Zustand
- **Backend:** Node.js + Express + TypeScript
- **Storage:** SQLite (built-in `node:sqlite`) + local `server/data/uploads/`

See [PLAN.md](PLAN.md) for the full feature plan and build priorities.

## Getting started

Requirements: Node.js 22.13+.

```bash
npm install
cp server/.env.example server/.env   # then set OPENAI_API_KEY (starts with sk-)
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

All models, daily limits and cost-estimate prices are configured in `server/.env` (see `server/.env.example`).

## Features

| Area | What works |
|---|---|
| Chat | Streaming replies, stop, Markdown with syntax-highlighted code (copy button), tables, LaTeX math |
| Conversations | Auto titles, rename, pin, archive, delete, move to project, search (Ctrl+K) |
| Messages | Copy, edit with branches (`< 1/2 >`), regenerate, retry on error, thumbs up/down, read aloud |
| Models | Model picker (from `OPENAI_MODELS`), **Think** toggle = higher reasoning effort |
| Memory | Automatic memory extraction ("Memory updated"), manual add, manage/delete, chat-history reference, custom instructions |
| Temporary chat | Not saved to history, no memory read/write |
| Files | Upload/drag-drop/paste images (vision), PDFs and text/code files |
| Tools | Web search with sources, image generation and editing, Canvas (documents + code, version history, HTML/JS preview) |
| Voice | Dictation (mic), read aloud, hands-free voice mode |
| Projects | Project instructions, project files with semantic search (RAG), project chats |
| Sharing | Read-only share links, export chat to Markdown / PDF, export all data as JSON |
| Other | Library (all images), Settings (theme, default model, voice, data controls, usage & cost), keyboard shortcuts (Ctrl+/), light/dark/system theme, mobile drawer, placeholder pages for Scheduled/Plugins/Codex/Explore |

## Note on cost

The app is free to run, but OpenAI API usage is billed to your key. The Usage tab in Settings shows an estimate; set
`DAILY_TOKEN_LIMIT`, `DAILY_IMAGE_LIMIT` and `DAILY_VOICE_MINUTES` to cap spending.
