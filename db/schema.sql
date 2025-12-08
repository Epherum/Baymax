-- Baymax SQLite (SQLCipher) schema v1
-- Run PRAGMA journal_mode = WAL; after opening the DB.
PRAGMA foreign_keys = ON;

CREATE TABLE life_dump_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'archived')),
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  finalized_at DATETIME
);

CREATE TABLE life_dump_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES life_dump_imports(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  raw_text TEXT NOT NULL CHECK (length(raw_text) < 500000),
  summary TEXT CHECK (length(summary) < 500000),
  start_date DATETIME,
  end_date DATETIME,
  summary_generated_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (import_id, position)
);

CREATE INDEX idx_life_dump_chunks_import_position ON life_dump_chunks(import_id, position);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'sync', 'life_dump')),
  raw_text TEXT NOT NULL CHECK (length(raw_text) < 500000),
  occurred_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  import_id INTEGER REFERENCES life_dump_imports(id) ON DELETE SET NULL,
  chunk_id INTEGER REFERENCES life_dump_chunks(id) ON DELETE SET NULL
);

CREATE INDEX idx_events_occurred_at ON events(occurred_at DESC);

CREATE TABLE event_metadata (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  summary TEXT,
  mood_score REAL,
  energy_level REAL,
  location TEXT,           -- Location name
  importance INTEGER,      -- 1-5 scale
  emotions TEXT,           -- JSON array of emotion labels + scores
  people TEXT,             -- JSON array of detected people
  activities TEXT,         -- JSON array of detected activities
  themes TEXT,             -- JSON array of themes/conflicts
  tags TEXT,               -- JSON array of user tags
  confidence REAL,
  metrics TEXT,            -- JSON object of extracted metrics
  version INTEGER NOT NULL DEFAULT 1,
  last_edited_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_event_metadata_event ON event_metadata(event_id);

CREATE TABLE embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  life_dump_chunk_id INTEGER REFERENCES life_dump_chunks(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('summary', 'life_dump_summary')),
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector BLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CHECK (
    (event_id IS NOT NULL AND life_dump_chunk_id IS NULL) OR
    (event_id IS NULL AND life_dump_chunk_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_embeddings_event_source ON embeddings(event_id, source) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_embeddings_chunk_source ON embeddings(life_dump_chunk_id, source) WHERE life_dump_chunk_id IS NOT NULL;
CREATE INDEX idx_embeddings_model_dims ON embeddings(model, dimensions);
CREATE INDEX idx_embeddings_event ON embeddings(event_id);
CREATE INDEX idx_embeddings_chunk ON embeddings(life_dump_chunk_id);

CREATE TABLE reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'manual')),
  range_start DATETIME NOT NULL,
  range_end DATETIME NOT NULL,
  depth TEXT NOT NULL DEFAULT 'standard',
  summary TEXT,
  mood_curve TEXT,       -- JSON payload
  energy_curve TEXT,     -- JSON payload
  patterns TEXT,         -- JSON payload with confidence + evidence
  insights TEXT,         -- Neutral reflective phrasing
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_reflections_period_range ON reflections(period, range_start, range_end);

CREATE TABLE reflection_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reflection_id INTEGER NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('evidence', 'context')),
  UNIQUE (reflection_id, event_id)
);

CREATE TABLE reflection_insight_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reflection_id INTEGER NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  insight_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message TEXT NOT NULL CHECK (length(message) < 8000),
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_reflection_insight_messages_ref_insight ON reflection_insight_messages(reflection_id, insight_id, created_at);

CREATE TABLE reflection_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reflection_id INTEGER NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message TEXT NOT NULL CHECK (length(message) < 8000),
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_reflection_chat_messages_ref ON reflection_chat_messages(reflection_id, created_at);

CREATE TABLE goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  is_explicit INTEGER NOT NULL DEFAULT 1 CHECK (is_explicit IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'active', 'completed', 'archived')),
  suggested_by_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  approved_at DATETIME,
  rejected_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE goal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  value REAL,
  note TEXT,
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (goal_id, event_id)
);

CREATE INDEX idx_goal_events_goal ON goal_events(goal_id);
CREATE INDEX idx_goal_events_event ON goal_events(event_id);

CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remote_id TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL, -- JSON from Supabase buffer
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'imported', 'failed')),
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  processed_at DATETIME,
  error TEXT
);

CREATE TABLE system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Relationships between entities (events, people, tags, activities, etc.).
CREATE TABLE entity_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL, -- e.g., event, reflection, goal
  source_id INTEGER NOT NULL,
  target_type TEXT NOT NULL, -- e.g., person, tag, activity, metric
  target_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,   -- e.g., mentions, tagged_with
  weight REAL,
  occurred_at DATETIME,
  metadata TEXT,
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (source_type, source_id, target_type, target_id, edge_type, occurred_at)
);

CREATE INDEX idx_entity_relationships_target ON entity_relationships(target_type, target_id, occurred_at);
CREATE INDEX idx_entity_relationships_source ON entity_relationships(source_type, source_id, occurred_at);
