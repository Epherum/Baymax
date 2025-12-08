# Baymax Desktop Status (WIP)

## Finished (prototype)
- **Server architecture**: Single-port Next.js + Express with `/api/*` routers.
- **DB helper**: SQLite with WAL/FK, schema auto-apply, optional SQLCipher key (requires SQLCipher-capable build).
- **API CRUD**: events, imports + chunks, goals, reflections (basic validation).
- **Embeddings**: Worker-thread MiniLM (Xenova/all-MiniLM-L6-v2) with queue, stores vectors for events and life-dump chunks; only summaries are embedded, embeddings cleared when summaries are removed.
- **AI summarization**: Gemini 2.5 Flash endpoint (`/api/ai/summarize`) wired into capture + life-dump UIs (requires `Gemini_API`/`GEMINI_API` env).
- **Life dump UI (desktop)**: Create import, add/edit/delete entries, set date ranges, finalize import to materialize events with AI metadata; embeddings on summaries; life-map scatter visualization.
- **Events UI**: Capture form with occurred-at/source, mood/energy/tags, search/filter/pagination, inline metadata edits, Gemini-assisted summarization.
- **Goals UI**: API-wired explicit goals CRUD + status transitions; implicit suggestions can be approved or dismissed.
- **Reflections UI**: List/create reflections; neutral summaries/insights; auto-generate reflections via Gemini-powered pattern engine; pattern cards displayed when available; auto scheduler (daily/weekly/monthly) runs while the app is up.
- **Styling**: Monochrome theme, animated gradient background, Lenis smooth scroll (tuned).
- **Metrics explorer**: Ad-hoc charts for numeric metrics and person mentions via `/api/metrics`; capture form accepts metrics and offers AI metric suggestion review/merge.
- **Life map**: Recharts scatter for entries (length vs. order) with embedding-aware coloring.
- **Reflections & pattern engine**: Mood/energy curves, embedding + stats-based pattern surfacing, daily/weekly/monthly scheduling, evidence/confidence outputs; still need richer timelines/visualizations.

## Pending (major)
- **Goals depth**: Event-to-goal tracking/progress curves; implicit goal suggestion pipeline from patterns (currently manual list).
- **Life map & visualizations**: Post-approval life-map rendering and embedding status UI; richer chunk wizard flows.
- **Capture/indexer depth**: Normal-mode journaling search/filters exist, but need tagging UX polish, pagination controls, and timeline views.
- **Sync/backup**: Supabase buffer fetch/write/delete cron and local backup/restore UI.
- **Encryption assurance**: Ship/verify SQLCipher-enabled `better-sqlite3` or alternative (e.g., multiple-ciphers).
- **Validation/robustness**: Stricter date/length checks, retry/backoff for embeddings, better error surfaces in UI.
- **Tests**: Smoke tests for `/api/*`, embedding worker, and AI summarize path.

## Notes
- Model is cached locally; embeddings are non-blocking best-effort.
- Gemini summarization requires `GEMINI_API` set in env; prompts are neutral/non-advisory.***
