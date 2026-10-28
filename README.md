# ChatGPT Replica

A local, single-user clone of the ChatGPT web app, powered by your own OpenAI API key.

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Storage:** SQLite

See [PLAN.md](PLAN.md) for the full feature plan and build priorities.

## Getting started

Requirements: Node.js 20+.

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
| 1.0 (in progress) | Project scaffold, ChatGPT-style layout, streamed chat responses |

## Note on cost

The app is free to run, but OpenAI API usage is billed to your key.
