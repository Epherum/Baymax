const express = require('express');
const { getDb } = require('../db');
const { embedLifeDumpChunkSummary, removeEmbedding } = require('../embedding');
const { generateCaptureMetadata, extractJson } = require('../ai/gemini');
const { upsertEventRelationships, upsertChunkImportRelationships } = require('../relationships');

const router = express.Router();

const STATUS_VALUES = new Set(['in_progress', 'completed', 'archived']);
const MAX_TEXT_LENGTH = 500000;
const MAX_TITLE_LENGTH = 255;

function normalizeMetricKey(key = '') {
  return String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function findClosestMetric(key, existing = []) {
  if (!existing.length) return null;
  const normalized = normalizeMetricKey(key);
  let best = null;
  for (const ex of existing) {
    const dist = levenshtein(normalized, normalizeMetricKey(ex));
    if (!best || dist < best.d) {
      best = { key: ex, d: dist };
    }
  }
  return best;
}

function isValidDateString(value) {
  if (!value || typeof value !== 'string') return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts);
}

router.get('/', (_req, res) => {
  const db = getDb();
  const imports = db
    .prepare(
      `SELECT id, title, status, created_at, finalized_at
       FROM life_dump_imports
       ORDER BY created_at DESC`
    )
    .all();
  res.json({ imports });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const importRow = db
    .prepare(
      `SELECT id, title, status, created_at, finalized_at
       FROM life_dump_imports
       WHERE id = ?`
    )
    .get(req.params.id);
  if (!importRow) {
    res.status(404).json({ message: 'Import not found' });
    return;
  }
  const chunks = db
    .prepare(
      `SELECT c.id, c.position, c.raw_text, c.summary, c.start_date, c.end_date, c.summary_generated_at, c.created_at,
              EXISTS (
                SELECT 1 FROM embeddings emb
                WHERE emb.life_dump_chunk_id = c.id AND emb.source = 'life_dump_summary'
              ) AS has_embedding
       FROM life_dump_chunks c
       WHERE c.import_id = ?
       ORDER BY c.position ASC`
    )
    .all(importRow.id);
  res.json({ import: importRow, chunks });
});

router.post('/', (req, res) => {
  const { title, status = 'in_progress' } = req.body ?? {};
  if (!STATUS_VALUES.has(status)) {
    res.status(400).json({ message: 'status must be one of: in_progress, completed, archived' });
    return;
  }
  if (title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH)) {
    res.status(400).json({ message: `title must be a string <= ${MAX_TITLE_LENGTH} chars` });
    return;
  }
  const db = getDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO life_dump_imports (title, status)
         VALUES (@title, @status)`
      )
      .run({ title: title ?? null, status });
    const created = db
      .prepare(
        `SELECT id, title, status, created_at, finalized_at
         FROM life_dump_imports
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);
    res.status(201).json({ import: created });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create import', error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  const { title, status } = req.body ?? {};
  if (status && !STATUS_VALUES.has(status)) {
    res.status(400).json({ message: 'status must be one of: in_progress, completed, archived' });
    return;
  }
  if (title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH)) {
    res.status(400).json({ message: `title must be a string <= ${MAX_TITLE_LENGTH} chars` });
    return;
  }
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, title, status, created_at, finalized_at
       FROM life_dump_imports
       WHERE id = ?`
    )
    .get(req.params.id);
  if (!existing) {
    res.status(404).json({ message: 'Import not found' });
    return;
  }
  const result = db
    .prepare(
      `UPDATE life_dump_imports
       SET title = COALESCE(@title, title),
           status = COALESCE(@status, status),
           finalized_at = CASE WHEN @status = 'completed' THEN (CURRENT_TIMESTAMP) ELSE finalized_at END
       WHERE id = @id`
    )
    .run({ id: req.params.id, title: title ?? null, status: status ?? null });
  if (result.changes === 0) {
    res.status(404).json({ message: 'Import not found' });
    return;
  }
  const updated = db
    .prepare(
      `SELECT id, title, status, created_at, finalized_at
       FROM life_dump_imports
       WHERE id = ?`
    )
    .get(req.params.id);
  res.json({ import: updated });

  // When moving to completed, materialize chunks into events + metadata.
  if (existing.status !== 'completed' && updated.status === 'completed') {
    materializeImport(db, updated).catch((err) => {
      console.error('Failed to materialize life dump import', err);
    });
  }
});

router.post('/:id/chunks', (req, res) => {
  const { position, raw_text, summary, start_date, end_date } = req.body ?? {};
  if (position === undefined || position === null || raw_text === undefined) {
    res.status(400).json({ message: 'position and raw_text are required' });
    return;
  }
  if (typeof raw_text !== 'string' || raw_text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ message: `raw_text must be a string <= ${MAX_TEXT_LENGTH} chars` });
    return;
  }
  if (summary !== undefined && (typeof summary !== 'string' || summary.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ message: `summary must be a string <= ${MAX_TEXT_LENGTH} chars` });
    return;
  }
  if (start_date !== undefined && start_date !== null && !isValidDateString(start_date)) {
    res.status(400).json({ message: 'start_date must be a valid date string (YYYY-MM-DD preferred)' });
    return;
  }
  if (end_date !== undefined && end_date !== null && !isValidDateString(end_date)) {
    res.status(400).json({ message: 'end_date must be a valid date string (YYYY-MM-DD preferred)' });
    return;
  }

  const db = getDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO life_dump_chunks (import_id, position, raw_text, summary, start_date, end_date, summary_generated_at)
         VALUES (@import_id, @position, @raw_text, @summary, @start_date, @end_date, @summary_generated_at)`
      )
      .run({
        import_id: req.params.id,
        position,
        raw_text,
        summary: summary ?? null,
        start_date: start_date ?? null,
        end_date: end_date ?? null,
        summary_generated_at: summary ? new Date().toISOString() : null
      });
    const created = db
      .prepare(
        `SELECT id, position, raw_text, summary, start_date, end_date, summary_generated_at, created_at
         FROM life_dump_chunks
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);
    try {
      upsertChunkImportRelationships({ chunkId: created.id, importId: Number(req.params.id) });
    } catch (err) {
      console.error('Failed to link chunk/import relationships', err);
    }
    res.status(201).json({ chunk: created });

    // Best-effort embedding generation when a summary exists.
    const summaryText = typeof summary === 'string' && summary.trim() ? summary : null;
    if (summaryText) {
      embedLifeDumpChunkSummary({ chunkId: created.id, text: summaryText });
    }
  } catch (err) {
    res.status(500).json({ message: 'Failed to add chunk', error: err.message });
  }
});

router.patch('/:id/chunks/:chunkId', (req, res) => {
  const { summary, start_date, end_date } = req.body ?? {};
  if (summary !== undefined && (typeof summary !== 'string' || summary.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ message: `summary must be a string <= ${MAX_TEXT_LENGTH} chars` });
    return;
  }
  if (start_date !== undefined && start_date !== null && !isValidDateString(start_date)) {
    res.status(400).json({ message: 'start_date must be a valid date string (YYYY-MM-DD preferred)' });
    return;
  }
  if (end_date !== undefined && end_date !== null && !isValidDateString(end_date)) {
    res.status(400).json({ message: 'end_date must be a valid date string (YYYY-MM-DD preferred)' });
    return;
  }
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE life_dump_chunks
       SET summary = COALESCE(@summary, summary),
           start_date = COALESCE(@start_date, start_date),
           end_date = COALESCE(@end_date, end_date),
           summary_generated_at = CASE WHEN @summary IS NOT NULL THEN (CURRENT_TIMESTAMP) ELSE summary_generated_at END
       WHERE id = @chunkId AND import_id = @importId`
    )
    .run({
      summary: summary ?? null,
      start_date: start_date ?? null,
      end_date: end_date ?? null,
      chunkId: req.params.chunkId,
      importId: req.params.id
    });
  if (result.changes === 0) {
    res.status(404).json({ message: 'Chunk not found' });
    return;
  }
  const updated = db
    .prepare(
      `SELECT id, position, raw_text, summary, start_date, end_date, summary_generated_at, created_at
       FROM life_dump_chunks
       WHERE id = ?`
    )
    .get(req.params.chunkId);
  res.json({ chunk: updated });

  // Refresh embeddings when summary changes.
  if (summary !== undefined) {
    const hasSummary = typeof updated.summary === 'string' && updated.summary.trim();
    if (hasSummary) {
      embedLifeDumpChunkSummary({ chunkId: updated.id, text: updated.summary });
    } else {
      removeEmbedding({ chunkId: updated.id, source: 'life_dump_summary' });
    }
  }
});

router.delete('/:id/chunks/:chunkId', (req, res) => {
  const db = getDb();
  const result = db
    .prepare(
      `DELETE FROM life_dump_chunks WHERE id = @chunkId AND import_id = @importId`
    )
    .run({ chunkId: req.params.chunkId, importId: req.params.id });
  if (result.changes === 0) {
    res.status(404).json({ message: 'Chunk not found' });
    return;
  }
  removeEmbedding({ chunkId: Number(req.params.chunkId), source: 'life_dump_summary' });
  res.status(204).send();
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM life_dump_imports WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ message: 'Import not found' });
    return;
  }
  res.status(204).send();
});

router.get('/:id/metric-check', async (req, res) => {
  const db = getDb();
  const importRow = db
    .prepare(
      `SELECT id, title
       FROM life_dump_imports
       WHERE id = ?`
    )
    .get(req.params.id);
  if (!importRow) {
    res.status(404).json({ message: 'Import not found' });
    return;
  }

  const chunks = db
    .prepare(
      `SELECT id, position, raw_text
       FROM life_dump_chunks
       WHERE import_id = ?
       ORDER BY position ASC`
    )
    .all(importRow.id);

  const existingKeys = db
    .prepare(
      `SELECT DISTINCT json_each.key AS key
       FROM event_metadata, json_each(event_metadata.metrics)
       WHERE event_metadata.metrics IS NOT NULL`
    )
    .all()
    .map((r) => r.key)
    .filter(Boolean);

  const newMetrics = [];
  const nearDuplicates = [];
  const seenNewNormalized = new Set();

  for (const chunk of chunks) {
    let parsed = null;
    try {
      const raw = await generateCaptureMetadata((chunk.raw_text || '').slice(0, 8000));
      parsed = extractJson(raw);
    } catch (err) {
      console.error(`Metric check: capture metadata failed for chunk ${chunk.id}`, err);
    }
    const metricsObj =
      parsed && parsed.metrics && typeof parsed.metrics === 'object' && !Array.isArray(parsed.metrics)
        ? parsed.metrics
        : null;
    if (!metricsObj) continue;
    for (const key of Object.keys(metricsObj)) {
      const normalized = normalizeMetricKey(key);
      const existingMatch = existingKeys.find((k) => normalizeMetricKey(k) === normalized);
      if (existingMatch) {
        continue;
      }
      if (seenNewNormalized.has(normalized)) {
        continue;
      }
      seenNewNormalized.add(normalized);
      const closest = findClosestMetric(key, [...existingKeys, ...Array.from(seenNewNormalized)]);
      if (closest && closest.d <= 2) {
        nearDuplicates.push({
          key,
          normalized,
          closest: closest.key,
          distance: closest.d,
          chunk_id: chunk.id,
          position: chunk.position
        });
      } else {
        newMetrics.push({
          key,
          normalized,
          chunk_id: chunk.id,
          position: chunk.position
        });
      }
    }
  }

  res.json({
    metrics: {
      new_keys: newMetrics,
      near_duplicates: nearDuplicates
    }
  });
});

async function materializeImport(db, importRow) {
  const chunks = db
    .prepare(
      `SELECT id, position, raw_text, summary, start_date, end_date, created_at
       FROM life_dump_chunks
       WHERE import_id = ?
       ORDER BY position ASC`
    )
    .all(importRow.id);
  for (const chunk of chunks) {
    try {
      await upsertChunkAsEvent(db, importRow, chunk);
    } catch (err) {
      console.error(`Failed to sync chunk ${chunk.id} into events`, err);
    }
  }
}

async function upsertChunkAsEvent(db, importRow, chunk) {
  const occurredAt =
    chunk.start_date ||
    chunk.end_date ||
    importRow.finalized_at ||
    importRow.created_at ||
    new Date().toISOString();

  let parsed = null;
  try {
    const raw = await generateCaptureMetadata(chunk.raw_text.slice(0, 8000));
    parsed = extractJson(raw);
  } catch (err) {
    console.error(`Capture metadata generation failed for chunk ${chunk.id}`, err);
  }

  const summaryFromAi =
    parsed && typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null;
  const summary = (chunk.summary && chunk.summary.trim()) || summaryFromAi || null;

  const existingEvent = db.prepare('SELECT id FROM events WHERE chunk_id = ?').get(chunk.id);
  let eventId;
  if (existingEvent) {
    db.prepare(
      `UPDATE events
       SET raw_text = @raw_text,
           occurred_at = @occurred_at,
           import_id = @import_id
       WHERE id = @id`
    ).run({
      id: existingEvent.id,
      raw_text: chunk.raw_text,
      occurred_at: occurredAt,
      import_id: importRow.id
    });
    eventId = existingEvent.id;
  } else {
    const result = db
      .prepare(
        `INSERT INTO events (source, raw_text, occurred_at, import_id, chunk_id)
         VALUES ('life_dump', @raw_text, @occurred_at, @import_id, @chunk_id)`
      )
      .run({
        raw_text: chunk.raw_text,
        occurred_at: occurredAt,
        import_id: importRow.id,
        chunk_id: chunk.id
      });
    eventId = result.lastInsertRowid;
  }

  const metadata = buildMetadataPayload(parsed, summary, chunk.raw_text);
  db.prepare(
    `INSERT INTO event_metadata (event_id, summary, mood_score, energy_level, location, importance, emotions, people, activities, themes, tags, confidence, metrics)
     VALUES (@event_id, @summary, @mood_score, @energy_level, @location, @importance, @emotions, @people, @activities, @themes, @tags, @confidence, @metrics)
     ON CONFLICT(event_id) DO UPDATE SET
       summary=excluded.summary,
       mood_score=excluded.mood_score,
       energy_level=excluded.energy_level,
       location=excluded.location,
       importance=excluded.importance,
       emotions=excluded.emotions,
       people=excluded.people,
       activities=excluded.activities,
       themes=excluded.themes,
      tags=excluded.tags,
      confidence=excluded.confidence,
      metrics=excluded.metrics,
      version=event_metadata.version + 1,
      last_edited_at=(CURRENT_TIMESTAMP)`
  ).run({ ...metadata, event_id: eventId });

  try {
    upsertChunkImportRelationships({ chunkId: chunk.id, importId: importRow.id });
    upsertEventRelationships({
      eventId,
      metadata,
      occurredAt: occurredAt,
      importId: importRow.id,
      chunkId: chunk.id
    });
  } catch (err) {
    console.error('Failed to upsert relationships for life dump chunk', err);
  }

  if (!chunk.summary && summary) {
    db.prepare(
      `UPDATE life_dump_chunks
       SET summary = @summary,
           summary_generated_at = (CURRENT_TIMESTAMP)
       WHERE id = @chunk_id`
    ).run({ summary, chunk_id: chunk.id });
  }

  if (summary) {
    embedLifeDumpChunkSummary({ chunkId: chunk.id, text: summary });
  } else {
    removeEmbedding({ chunkId: chunk.id, source: 'life_dump_summary' });
  }
}

function buildMetadataPayload(parsed, summary, rawText) {
  const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return null;
    return Math.max(min, Math.min(max, value));
  };
  const arr = (value) => (Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : null);
  const metricsObj =
    parsed && parsed.metrics && typeof parsed.metrics === 'object' && !Array.isArray(parsed.metrics)
      ? parsed.metrics
      : null;
  const explicitEntities = extractEntitiesFromText(rawText);
  const parsedPeople = arr(parsed?.people) || [];
  const parsedActivities = arr(parsed?.activities) || [];
  const parsedTags = arr(parsed?.tags) || [];

  return {
    summary: summary ?? null,
    mood_score: parsed ? clamp(parsed.mood_score, -5, 5) : null,
    energy_level: parsed ? clamp(parsed.energy_level, 0, 10) : null,
    location: parsed && typeof parsed.location === 'string' ? parsed.location.trim() : null,
    importance: parsed ? clamp(parsed.importance, 1, 5) : null,
    emotions: arr(parsed?.emotions) ? JSON.stringify(arr(parsed.emotions)) : null,
    people: JSON.stringify(uniqueList([...parsedPeople, ...explicitEntities.people])),
    activities: arr(parsed?.activities) ? JSON.stringify(arr(parsed.activities)) : null,
    themes: arr(parsed?.themes) ? JSON.stringify(arr(parsed.themes)) : null,
    tags: JSON.stringify(uniqueList([...parsedTags, ...explicitEntities.tags])),
    confidence: parsed && Number.isFinite(parsed.confidence) ? parsed.confidence : null,
    metrics: metricsObj ? JSON.stringify(metricsObj) : null
  };
}

function extractEntitiesFromText(text) {
  if (!text || typeof text !== 'string') return { people: [], tags: [] };
  const people = new Set();
  const tags = new Set();
  const personMatches = text.match(/@([A-Za-z][A-Za-z0-9_\\-]{1,50})/g) || [];
  personMatches.forEach((m) => {
    const name = m.slice(1);
    if (name) people.add(name);
  });
  const tagMatches = text.match(/#([A-Za-z][\\w\\-]{1,50})/g) || [];
  tagMatches.forEach((m) => {
    const t = m.slice(1);
    if (t) tags.add(t);
  });
  return {
    people: Array.from(people),
    tags: Array.from(tags)
  };
}

function uniqueList(list = []) {
  return Array.from(new Set(list.map((v) => String(v).trim()).filter(Boolean)));
}

module.exports = router;
