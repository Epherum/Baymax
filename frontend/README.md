## Getting Started

- Install deps: `npm install`
- Dev: `npm run dev` (custom Express + Next server on one port)
- Build: `npm run build`
- Start (after build): `npm run start`

Environment:
- `GEMINI_API` (or `Gemini_API` / `GEMINI_API_KEY`) for AI features. Optional if you do not need AI.
- `PORT` (default 3000)
- `BAYMAX_DB_PATH` (optional; defaults to `../db/baymax.sqlite`)
- `BAYMAX_DB_KEY` (optional SQLCipher key; requires SQLCipher-enabled build of better-sqlite3)

Create `frontend/.env` from `frontend/.env.example` or export the variables in your shell.

App entry: `server.js` (mounts Express + Next). UI code lives in `app/`.

## Backup & Restore
Back up before resetting your machine:
- `frontend/.env` (or your exported env vars).
- `db/baymax.sqlite` plus `db/baymax.sqlite-wal` and `db/baymax.sqlite-shm`.

Restore:
1. Recreate `frontend/.env` from `frontend/.env.example`.
2. Put DB files back into `db/` (or your `BAYMAX_DB_PATH`).
3. `npm install` then `npm run dev` (or build/start).
