# ChatGPT Replica

A local, single-user clone of the ChatGPT web app, powered by your own OpenAI API key.

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Storage:** SQLite

See [PLAN.md](PLAN.md) for the full feature plan and build priorities.

## Getting started

Requirements: Node.js 22.13+ (uses the built-in `node:sqlite` module).

```bash
npm install
cp server/.env.example server/.env   # then set OPENAI_API_KEY
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Status

| Version | Features |
|---|---|
| 1.0 (in progress) | Project scaffold, SQLite schema, ChatGPT-style layout (sidebar, empty state, composer), streamed chat responses with stop, saved conversations in Recents |

## Note on cost

The app is free to run, but OpenAI API usage is billed to your key.
