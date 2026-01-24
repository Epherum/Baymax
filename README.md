# Baymax Desktop

Local‑first personal AI journal, metrics, and graph explorer. Capture events, import life dumps, track goals/reflections, explore metrics and relationships, and chat about entities or pillars — all on your machine.

## Stack
- Next.js + Express single server (`frontend/server.js`)
- SQLite (WAL) via `better-sqlite3` (auto-creates `db/baymax.sqlite`)
- Embeddings: MiniLM (`@xenova/transformers`) in a worker
- Styling: minimal CSS + Recharts + Framer Motion

## Prerequisites
- Node.js 20+ (for Next 16 and native modules)
- Build tools for `better-sqlite3` (Python + C/C++ toolchain on your OS)
- Optional: SQLCipher build if you want encrypted DB (set `BAYMAX_DB_KEY`)
- Optional: Gemini API key for AI features (`Gemini_API` or `GEMINI_API`)

Notes:
- No Python backend is required for embeddings; we use `@xenova/transformers` (JavaScript/CPU) inside a Node worker. The model downloads automatically on first use.

## Setup
```bash
cd frontend
npm install
```

## Environment
Create `frontend/.env` (or export variables in your shell). Start with `frontend/.env.example`.

Required (for AI features only):
- `GEMINI_API` (or `Gemini_API` / `GEMINI_API_KEY`) — Gemini API key.

Optional:
- `PORT` — server port (default `3000`).
- `BAYMAX_DB_PATH` — override DB location (default `db/baymax.sqlite`).
- `BAYMAX_DB_KEY` — SQLCipher key if you built `better-sqlite3` with SQLCipher.

## Run (dev)
```bash
cd frontend
npm run dev
# open http://localhost:3000
```

## Production
```bash
cd frontend
npm run build
npm start   # uses server.js on port 3000 by default
```

## Lint/Format
```bash
cd frontend
npm run lint     # biome check (may emit many style warnings)
npm run format   # biome format --write
```

## Data & Storage
- DB lives in `db/baymax.sqlite` (WAL enabled). You can delete it to reset.
- Life dumps, captures, goals, reflections, metrics, graph edges, pillars all persist there.
- Env `BAYMAX_DB_PATH` can point to a different location.

## AI Features
- Capture auto-metadata, summarization, entity chat, and pillar chat require Gemini.
- Set `Gemini_API`/`GEMINI_API` in env before starting the server.

## Notable Routes
- Capture: `/capture` (recent list all: `/capture/recent`)
- Life dump: `/dump`
- Metrics: `/metrics` (Quick, Health, Productivity, Relationships)
- Graph: `/graph`
- People: `/people`
- Goals: `/goals`
- Reflections: `/reflections`
- Pillars: `/pillars`

## Notes
- Metrics/graph rely on structured metadata from captures/life dumps; finalize imports to materialize events.
- Embedding worker loads the model on demand; first call may take a moment.
- If SQLCipher is required, ensure your `better-sqlite3` build links against SQLCipher and set `BAYMAX_DB_KEY`.

## Backup & Restore (resetting your PC)
Back up these items before wiping your machine:
- `frontend/.env` (or record the env vars you export).
- `db/baymax.sqlite` plus its WAL files (`db/baymax.sqlite-wal`, `db/baymax.sqlite-shm`).
- Optional: any custom DB path you used via `BAYMAX_DB_PATH`.

Restore steps after a reset:
1. Recreate `frontend/.env` from `frontend/.env.example` and add your keys.
2. Put the DB files back into `db/` (or your custom path).
3. `cd frontend && npm install && npm run dev` (or build/start for prod).

Note: There is no Prisma layer here. The app auto-creates and migrates the SQLite DB from `db/schema.sql` if it does not exist, but it does not seed sample data. Restore the DB files if you want your previous content.
