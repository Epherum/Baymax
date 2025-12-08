const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH =
  process.env.BAYMAX_DB_PATH ||
  path.resolve(__dirname, '..', '..', 'db', 'baymax.sqlite');
const DEFAULT_SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'db', 'schema.sql');

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function applyEncryptionKey(db, key) {
  if (!key) return;
  try {
    const escaped = key.replace(/'/g, "''");
    db.pragma(`key='${escaped}'`);
    const cipherVersion = db.pragma('cipher_version', { simple: true });
    if (!cipherVersion) {
      throw new Error('cipher_version not reported');
    }
  } catch (err) {
    throw new Error(
      `SQLCipher is required when BAYMAX_DB_KEY is set. Failed to apply encryption key: ${err.message}`
    );
  }
}

function ensureSchema(db) {
  const hasEvents = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
    .get();
  if (hasEvents) return;
  const schema = fs.readFileSync(DEFAULT_SCHEMA_PATH, 'utf8');
  db.exec(schema);
}

function applyMigrations(db) {
  const columns = db.prepare("PRAGMA table_info(event_metadata)").all();
  const colNames = new Set(columns.map((c) => c.name));
  if (!colNames.has('metrics')) {
    db.exec("ALTER TABLE event_metadata ADD COLUMN metrics TEXT");
  }

  const chunkColumns = db.prepare("PRAGMA table_info(life_dump_chunks)").all();
  const chunkColNames = new Set(chunkColumns.map((c) => c.name));
  if (!chunkColNames.has('start_date')) {
    db.exec("ALTER TABLE life_dump_chunks ADD COLUMN start_date DATETIME");
  }
  if (!chunkColNames.has('end_date')) {
    db.exec("ALTER TABLE life_dump_chunks ADD COLUMN end_date DATETIME");
  }
  if (chunkColNames.has('approved')) {
    // Test data only; drop approval fields to simplify flow.
    db.exec("CREATE TABLE _tmp_chunks AS SELECT id, import_id, position, raw_text, summary, start_date, end_date, summary_generated_at, created_at FROM life_dump_chunks");
    db.exec("DROP TABLE life_dump_chunks");
    db.exec(`CREATE TABLE life_dump_chunks (
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
    )`);
    db.exec("CREATE INDEX idx_life_dump_chunks_import_position ON life_dump_chunks(import_id, position)");
    db.exec("INSERT INTO life_dump_chunks (id, import_id, position, raw_text, summary, start_date, end_date, summary_generated_at, created_at) SELECT id, import_id, position, raw_text, summary, start_date, end_date, summary_generated_at, created_at FROM _tmp_chunks");
    db.exec("DROP TABLE _tmp_chunks");
  }

  const hasInsightMessages = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reflection_insight_messages'")
    .get();
  if (!hasInsightMessages) {
    db.exec(`
      CREATE TABLE reflection_insight_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reflection_id INTEGER NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
        insight_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        message TEXT NOT NULL CHECK (length(message) < 8000),
        created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      );
    `);
    db.exec(`
      CREATE INDEX idx_reflection_insight_messages_ref_insight
      ON reflection_insight_messages(reflection_id, insight_id, created_at);
    `);
  }

  const hasReflectionChat = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reflection_chat_messages'")
    .get();
  if (!hasReflectionChat) {
    db.exec(`
      CREATE TABLE reflection_chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reflection_id INTEGER NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        message TEXT NOT NULL CHECK (length(message) < 8000),
        created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      );
    `);
    db.exec(`
      CREATE INDEX idx_reflection_chat_messages_ref
      ON reflection_chat_messages(reflection_id, created_at);
    `);
  }

  const hasEntityRelationships = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entity_relationships'")
    .get();
  if (!hasEntityRelationships) {
    db.exec(`
      CREATE TABLE entity_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        weight REAL,
        occurred_at DATETIME,
        metadata TEXT,
        created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        UNIQUE (source_type, source_id, target_type, target_id, edge_type, occurred_at)
      );
    `);
    db.exec("CREATE INDEX idx_entity_relationships_target ON entity_relationships(target_type, target_id, occurred_at)");
    db.exec("CREATE INDEX idx_entity_relationships_source ON entity_relationships(source_type, source_id, occurred_at)");
  }

  const hasPillars = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pillars'")
    .get();
  if (!hasPillars) {
    db.exec(`
      CREATE TABLE pillars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        values_text TEXT,
        created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      );
    `);
    db.exec("CREATE INDEX idx_pillars_title ON pillars(title)");
  }
}

function openDatabase(options = {}) {
  const { dbPath = DEFAULT_DB_PATH, key } = options;
  ensureDirExists(dbPath);

  const db = new Database(dbPath);
  applyEncryptionKey(db, key);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureSchema(db);
  applyMigrations(db);
  return db;
}

let cachedDb;
function getDb(options = {}) {
  if (!cachedDb) {
    cachedDb = openDatabase(options);
  }
  return cachedDb;
}

module.exports = {
  getDb,
  openDatabase
};
