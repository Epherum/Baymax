## Getting Started

- Install deps: `npm install`
- Dev: `npm run dev` (custom Express + Next server on one port)
- Build: `npm run build`
- Start (after build): `npm run start`

Environment:
- `PORT` (default 3000)
- `BAYMAX_DB_PATH` (optional; defaults to `../db/baymax.sqlite`)
- `BAYMAX_DB_KEY` (optional SQLCipher key; requires SQLCipher-enabled build of better-sqlite3)

App entry: `server.js` (mounts Express + Next). UI code lives in `app/`.
