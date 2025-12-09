const express = require('express');
const { getDb } = require('../db');
const { embedSummary, removeEmbedding } = require('../embedding');
const { upsertEventRelationships } = require('../relationships');

const router = express.Router();

const SOURCE_VALUES = new Set(['manual', 'sync', 'life_dump']);
const MAX_TEXT_LENGTH = 500000;

function sanitizeLimitOffset(limitRaw, offsetRaw) {
  const limit = Number.isNaN(Number.parseInt(limitRaw, 10))
    ? 50
    : Math.min(Math.max(Number.parseInt(limitRaw, 10), 1), 200);
  const offset = Number.isNaN(Number.parseInt(offsetRaw, 10))
    ? 0
    : Math.max(Number.parseInt(offsetRaw, 10), 0);
  return { limit, offset };
}

function parseJsonField(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hydrateEventRow(row) {
  if (!row) return row;
  return {
    ...row,
    has_embedding: Boolean(row.has_embedding),
    metrics: parseJsonField(row.metrics),
    emotions: parseJsonField(row.emotions),
    people: parseJsonField(row.people),
    activities: parseJsonField(row.activities),
    themes: parseJsonField(row.themes),
    tags: parseJsonField(row.tags)
  };
}

function isValidDateString(value) {
  if (!value || typeof value !== 'string') return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts);
}

router.get('/', (req, res) => {
  const db = getDb();
  const { limit, offset } = sanitizeLimitOffset(req.query.limit, req.query.offset);
  const where = [];
  const params = {};
  if (req.query.source && SOURCE_VALUES.has(req.query.source)) {
    where.push('e.source = @source');
    params.source = req.query.source;
  }
  if (req.query.q && typeof req.query.q === 'string') {
    where.push('(e.raw_text LIKE @q OR em.summary LIKE @q)');
    params.q = `%${req.query.q}%`;
  }
  if (req.query.person && typeof req.query.person === 'string') {
    where.push(`em.people IS NOT NULL AND EXISTS (
      SELECT 1 FROM json_each(em.people)
      WHERE json_each.value = @person
    )`);
    params.person = req.query.person;
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT e.id, e.source, e.raw_text, e.occurred_at, e.created_at,
              e.import_id, e.chunk_id,
              em.summary, em.mood_score, em.energy_level, em.location, em.importance, em.emotions, em.people,
              em.activities, em.themes, em.tags, em.confidence, em.version, em.last_edited_at, em.metrics,
              EXISTS (
                SELECT 1 FROM embeddings emb
                WHERE emb.event_id = e.id AND emb.source = 'summary'
              ) AS has_embedding
       FROM events e
       LEFT JOIN event_metadata em ON e.id = em.event_id
       ${whereClause}
       ORDER BY e.occurred_at DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset })
    .map(hydrateEventRow);
  res.json({ events: rows, limit, offset });
});

router.get('/stats', (_req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS c FROM events').get().c ?? 0;
  const last30 = db
    .prepare("SELECT COUNT(*) AS c FROM events WHERE occurred_at >= datetime('now', '-30 days')")
    .get().c ?? 0;
  const metricRows = db.prepare('SELECT metrics FROM event_metadata WHERE metrics IS NOT NULL').all();
  const uniqueMetrics = new Set();
  for (const row of metricRows) {
    if (!row?.metrics) continue;
    try {
      const parsed = typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.keys(parsed).forEach((k) => {
          if (k) uniqueMetrics.add(String(k));
        });
      }
    } catch {
      // ignore malformed json
    }
  }
  res.json({ total, last_30_days: last30, unique_metrics: uniqueMetrics.size });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT e.id, e.source, e.raw_text, e.occurred_at, e.created_at,
              e.import_id, e.chunk_id,
              em.summary, em.mood_score, em.energy_level, em.location, em.importance, em.emotions, em.people,
              em.activities, em.themes, em.tags, em.confidence, em.version, em.last_edited_at, em.metrics,
              EXISTS (
                SELECT 1 FROM embeddings emb
                WHERE emb.event_id = e.id AND emb.source = 'summary'
              ) AS has_embedding
       FROM events e
       LEFT JOIN event_metadata em ON e.id = em.event_id
       WHERE e.id = ?`
    )
    .get(req.params.id);
  if (!row) {
    res.status(404).json({ message: 'Event not found' });
    return;
  }
  res.json({ event: hydrateEventRow(row) });
});

router.post('/', (req, res) => {
  const { raw_text, occurred_at, source = 'manual', import_id, chunk_id, metadata } = req.body;
  if (!raw_text || !occurred_at) {
    res.status(400).json({ message: 'raw_text and occurred_at are required' });
    return;
  }
  if (typeof raw_text !== 'string' || raw_text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ message: `raw_text must be a string <= ${MAX_TEXT_LENGTH} chars` });
    return;
  }
  if (!isValidDateString(occurred_at)) {
    res.status(400).json({ message: 'occurred_at must be a valid date string' });
    return;
  }
  if (!SOURCE_VALUES.has(source)) {
    res.status(400).json({ message: `source must be one of: ${Array.from(SOURCE_VALUES).join(', ')}` });
    return;
  }

  const db = getDb();
  const insertEvent = db.prepare(
    `INSERT INTO events (source, raw_text, occurred_at, import_id, chunk_id)
     VALUES (@source, @raw_text, @occurred_at, @import_id, @chunk_id)`
  );
  const insertMetadata = db.prepare(
    `INSERT INTO event_metadata
     (event_id, summary, mood_score, energy_level, location, importance, emotions, people, activities, themes, tags, confidence, metrics)
     VALUES (@event_id, @summary, @mood_score, @energy_level, @location, @importance, @emotions, @people, @activities, @themes, @tags, @confidence, @metrics)`
  );

  const tx = db.transaction(() => {
    const result = insertEvent.run({
      source,
      raw_text,
      occurred_at,
      import_id: import_id ?? null,
      chunk_id: chunk_id ?? null
    });
    const eventId = result.lastInsertRowid;
    if (metadata && typeof metadata === 'object') {
      insertMetadata.run({
        event_id: eventId,
        summary: metadata.summary ?? null,
        mood_score: metadata.mood_score ?? null,
        energy_level: metadata.energy_level ?? null,
        location: metadata.location ?? null,
        importance: metadata.importance ?? null,
        emotions: metadata.emotions ? JSON.stringify(metadata.emotions) : null,
        people: metadata.people ? JSON.stringify(metadata.people) : null,
        activities: metadata.activities ? JSON.stringify(metadata.activities) : null,
        themes: metadata.themes ? JSON.stringify(metadata.themes) : null,
        tags: metadata.tags ? JSON.stringify(metadata.tags) : null,
        confidence: metadata.confidence ?? null,
        metrics: metadata.metrics ? JSON.stringify(metadata.metrics) : null
      });
    }
    return eventId;
  });

  try {
    const eventId = tx();
    try {
      upsertEventRelationships({
        eventId,
        metadata,
        occurredAt: occurred_at,
        importId: import_id,
        chunkId: chunk_id
      });
    } catch (err) {
      console.error('Failed to upsert event relationships', err);
    }
    const created = db
      .prepare(
        `SELECT e.id, e.source, e.raw_text, e.occurred_at, e.created_at,
                e.import_id, e.chunk_id,
                em.summary, em.mood_score, em.energy_level, em.location, em.importance, em.emotions, em.people,
                em.activities, em.themes, em.tags, em.confidence, em.version, em.last_edited_at,
                EXISTS (
                  SELECT 1 FROM embeddings emb
                  WHERE emb.event_id = e.id AND emb.source = 'summary'
                ) AS has_embedding
         FROM events e
         LEFT JOIN event_metadata em ON e.id = em.event_id
         WHERE e.id = ?`
      )
      .get(eventId);
    res.status(201).json({ event: hydrateEventRow(created) });

    // Best-effort embedding generation; summaries only.
    const summaryText = typeof metadata?.summary === 'string' && metadata.summary.trim() ? metadata.summary : null;
    if (summaryText) {
      embedSummary({ eventId, text: summaryText });
    }
  } catch (err) {
    res.status(500).json({ message: 'Failed to create event', error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  const db = getDb();
  const {
    raw_text,
    occurred_at,
    source,
    metadata
  } = req.body ?? {};
  if (raw_text !== undefined) {
    if (typeof raw_text !== 'string' || raw_text.length > MAX_TEXT_LENGTH) {
      res.status(400).json({ message: `raw_text must be a string <= ${MAX_TEXT_LENGTH} chars` });
      return;
    }
  }
  if (occurred_at !== undefined && !isValidDateString(occurred_at)) {
    res.status(400).json({ message: 'occurred_at must be a valid date string' });
    return;
  }
  if (source && !SOURCE_VALUES.has(source)) {
    res.status(400).json({ message: `source must be one of: ${Array.from(SOURCE_VALUES).join(', ')}` });
    return;
  }

  const updateEvent = db.prepare(
    `UPDATE events
     SET raw_text = COALESCE(@raw_text, raw_text),
         occurred_at = COALESCE(@occurred_at, occurred_at),
         source = COALESCE(@source, source)
     WHERE id = @id`
  );
  const upsertMetadata = db.prepare(
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
  );

  const tx = db.transaction(() => {
    const eventResult = updateEvent.run({
      id: req.params.id,
      raw_text: raw_text ?? null,
      occurred_at: occurred_at ?? null,
      source: source ?? null
    });
    if (eventResult.changes === 0) {
      return { notFound: true };
    }
    if (metadata && typeof metadata === 'object') {
      upsertMetadata.run({
        event_id: req.params.id,
        summary: metadata.summary ?? null,
        mood_score: metadata.mood_score ?? null,
        energy_level: metadata.energy_level ?? null,
        location: metadata.location ?? null,
        importance: metadata.importance ?? null,
        emotions: metadata.emotions ? JSON.stringify(metadata.emotions) : null,
        people: metadata.people ? JSON.stringify(metadata.people) : null,
        activities: metadata.activities ? JSON.stringify(metadata.activities) : null,
        themes: metadata.themes ? JSON.stringify(metadata.themes) : null,
        tags: metadata.tags ? JSON.stringify(metadata.tags) : null,
        confidence: metadata.confidence ?? null,
        metrics: metadata.metrics ? JSON.stringify(metadata.metrics) : null
      });
    }
    return { notFound: false };
  });

  const result = tx();
  if (result.notFound) {
    res.status(404).json({ message: 'Event not found' });
    return;
  }

  const updated = db
    .prepare(
      `SELECT e.id, e.source, e.raw_text, e.occurred_at, e.created_at,
              e.import_id, e.chunk_id,
              em.summary, em.mood_score, em.energy_level, em.location, em.importance, em.emotions, em.people,
              em.activities, em.themes, em.tags, em.confidence, em.version, em.last_edited_at, em.metrics,
              EXISTS (
                SELECT 1 FROM embeddings emb
                WHERE emb.event_id = e.id AND emb.source = 'summary'
              ) AS has_embedding
       FROM events e
       LEFT JOIN event_metadata em ON e.id = em.event_id
       WHERE e.id = ?`
    )
    .get(req.params.id);
  res.json({ event: hydrateEventRow(updated) });

  if (metadata && typeof metadata === 'object' && Object.prototype.hasOwnProperty.call(metadata, 'summary')) {
    const summaryText = typeof metadata.summary === 'string' && metadata.summary.trim() ? metadata.summary : null;
    if (summaryText) {
      embedSummary({ eventId: Number(req.params.id), text: summaryText });
    } else {
      removeEmbedding({ eventId: Number(req.params.id), source: 'summary' });
    }
  }

  try {
    upsertEventRelationships({
      eventId: Number(req.params.id),
      metadata: metadata ?? updated,
      occurredAt: metadata?.occurred_at ?? updated?.occurred_at,
      importId: updated?.import_id,
      chunkId: updated?.chunk_id
    });
  } catch (err) {
    console.error('Failed to upsert event relationships', err);
  }
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ message: 'Event not found' });
    return;
  }
  res.status(204).send();
});

module.exports = router;
