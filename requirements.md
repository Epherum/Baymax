BAYMAX – REQUIREMENT DOCUMENT v3.1 (Final Engineering Specification)

(Includes all previous decisions + the AI reviewer’s final technical refinements.)

1. FORM FACTOR

v1: Local Next.js + Node (single-port custom server).

v2+ (optional): Wrap in Electron once stable.

Local, private, offline-first.

Mobile: dumb input device only — sends text/voice → Supabase → Desktop sync.

2. MEMORY MODEL

Event-based memory, one entry = one event.

Raw text is immutable.

Structured metadata is editable (via direct edit mode).

Embeddings generated per event using MiniLM (Transformers.js, CPU).

Embeddings stored as SQLite BLOBs.

3. DATABASE DESIGN
SQLite (SQLCipher) encrypted on disk.

Additions from reviewer:

PRAGMA journal_mode = WAL (Write-Ahead Logging).
This eliminates SQLite lock contention when:

pattern engine writes

user logs entries

reflections run

UI reads entries

This is mandatory.

4. SERVER ARCHITECTURE
Use a custom Next.js server:

Instead of two servers:

❌ Next.js on 3000
❌ Express on 4000

We use:

✔ One process
✔ One port (e.g., 3000)
✔ Express mounted inside Next.js server

This means:

No CORS issues

No dual start scripts

No weird networking

Cleaner dev + deployment

Exactly like:

server.js
  ├─ createNextApp()
  ├─ mount Express router under /api
  ├─ start on port 3000


This is perfect for a local tool.

5. MODULES & WORKER THREADS

Add reviewer’s correction:

MiniLM embeddings MUST run inside Node (backend), not frontend.

Even better: run embeddings in a Node Worker Thread so embedding computation cannot freeze the main server.

This is especially important when:

user logs a big life dump chunk

weekly reflection triggers many embeddings

multiple entries sync from Supabase at once

So we add:

Embedding Worker Module

dedicated worker

input: raw text or summary

output: vector (Float32Array)

stored in SQLite BLOB

6. SYSTEM PROMPT SAFETY

Since we eliminated the Stop Word / Topic Ban:

Baymax must rely entirely on prompt neutrality

Prompts must explicitly avoid:

moral judgments

emotional advice

assumptions

prescriptive statements

Patterns always include:

confidence score

evidence list

“optional interpretations” phrasing

This becomes a critical part of the spec.

7. REFLECTION ENGINE SCHEDULE (LOCKED)

As agreed:

Daily

Summaries

Mood curve

Energy curve

Shallow pattern notes

Weekly

Deeper patterns

Emotional cycles

Social interaction graph

Time spent heatmap

Monthly

Long-term arcs

Relationship timeline

Behaviour loops

Goal progress

Emerging identity patterns

Manual mode

User selects:

time range

depth

categories

Neutral mirror tone only.

8. LIFE DUMP IMPORT (LOCKED)

Step-by-step wizard

Break text into chunks (500–1000 words)

User confirms each summary

Summaries get embeddings (raw text does not)

Life Map constructed after confirmation

Only then can deep analysis run

9. EXPLICIT + IMPLICIT GOALS (LOCKED)

Explicit:

Created by user

Trackable over time

Implicit:

Suggested by Baymax (never auto-activated)

User approves to add

Goals produce:

time tracking

emotional correlation

progress curve

reflectively phrased insights

10. MODULARITY (LOCKED)

System is divided into:

capture module

indexer module

embedding worker

pattern engine

reflection engine

visualisation module

sync module

backup module

No plugins, no agents, but extendable.

11. SYNC STRATEGY (LOCKED)

Mobile → Supabase buffer → Desktop sync.

Desktop cron job:

fetch unsynced rows

write to local DB

run indexing + embeddings

delete rows from Supabase

Supabase is only a temporary buffer, not long-term storage.

12. STORAGE ESTIMATE (LOCKED)

150–300 MB per year

10 years = ~2 GB

Perfect for SQLite

13. NON-NEGOTIABLES

Local-first

Encrypted at rest

Neutral mirror tone

No therapy, no advice

User is the final interpreter

Raw logs never modified

Structured metadata is editable

Insight boundaries exist

Everything stays offline except temp Supabase buffer