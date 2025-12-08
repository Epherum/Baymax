const express = require('express');
const { getDb } = require('../db');

const router = express.Router();
const VALID_TYPES = new Set(['person']);
const BUCKETS = new Set(['day', 'week', 'month', 'month_2', 'month_3', 'all']);

function parseLimit(raw, fallback = 20, max = 100) {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, 1), max);
}

router.get('/search', async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : '';
  const db = getDb();
  const like = q ? `%${q.toLowerCase()}%` : '%';
  const limit = parseLimit(req.query.limit, 30, 50);
  const type = req.query.type ? String(req.query.type) : null;
  const smart = req.query.smart === '1' || req.query.mode === 'smart' || req.query.embedding === '1';

  const basePayload = buildBaseEntityPayload(db, { like, limit });
  let payload = basePayload;

  if (smart && q) {
    try {
      const smartPayload = await embeddingEntitySearch({ query: q, limit });
      if (smartPayload) {
        payload = mergePayloads(basePayload, smartPayload, limit);
      }
    } catch (err) {
      console.warn('Smart entity search failed, falling back to LIKE', err?.message);
    }
  }

  if (type === 'people' || type === 'person') {
    res.json({ people: payload.people });
    return;
  }
  if (type === 'activities' || type === 'activity') {
    res.json({ activities: payload.activities });
    return;
  }
  if (type === 'tags' || type === 'tag') {
    res.json({ tags: payload.tags });
    return;
  }

  res.json(payload);
});

function buildBaseEntityPayload(db, { like, limit }) {
  const fetchDistinct = (tableExpr, column, whereClause = '') =>
    db
      .prepare(
        `SELECT DISTINCT ${column} AS value
         FROM ${tableExpr}
         WHERE lower(${column}) LIKE @like
         ${whereClause}
         LIMIT @limit`
      )
      .all({ like, limit })
      .map((r) => r.value)
      .filter(Boolean);

  const assemble = (tableExpr, column, relType) => {
    const base = fetchDistinct(tableExpr, column);
    const rel = relType ? fetchDistinct("entity_relationships", "target_id", `AND target_type = '${relType}'`) : [];
    return [...base, ...rel]
      .map((v) => String(v))
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
      .slice(0, limit);
  };

  return {
    people: assemble("event_metadata, json_each(event_metadata.people)", "json_each.value", "person"),
    activities: assemble("event_metadata, json_each(event_metadata.activities)", "json_each.value", "activity"),
    tags: fetchDistinct("event_metadata, json_each(event_metadata.tags)", "json_each.value").slice(0, limit)
  };
}

async function embeddingEntitySearch({ query, limit }) {
  const { embedText } = require('../embedding');
  const db = getDb();
  const normalizedLimit = limit || 30;
  const embedded = await embedText({ text: query });
  if (!embedded?.vector || !embedded.dimensions) return null;

  const rows = db
    .prepare(
      `SELECT e.id, em.people, em.activities, em.tags, emb.vector, emb.dimensions
       FROM embeddings emb
       JOIN events e ON e.id = emb.event_id
       LEFT JOIN event_metadata em ON em.event_id = e.id
       WHERE emb.source = 'summary'`
    )
    .all();
  if (!rows.length) return null;

  const queryVec = bufferToVector(embedded.vector, embedded.dimensions);
  if (!queryVec) return null;

  const scored = [];
  rows.forEach((row) => {
    const vec = bufferToVector(row.vector, row.dimensions);
    if (!vec || vec.length !== queryVec.length) return;
    const score = cosineSimilarity(queryVec, vec);
    if (Number.isFinite(score)) {
      scored.push({ row, score });
    }
  });
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, normalizedLimit * 3); // take a wider pool, then rank entities
  const people = aggregateEntities(top, 'people');
  const activities = aggregateEntities(top, 'activities');
  const tags = aggregateEntities(top, 'tags');

  return {
    people: people.slice(0, normalizedLimit),
    activities: activities.slice(0, normalizedLimit),
    tags: tags.slice(0, normalizedLimit)
  };
}

function aggregateEntities(scoredRows, field) {
  const counts = new Map();
  scoredRows.forEach(({ row, score }) => {
    const list = normalizeArray(row?.[field]);
    list.forEach((item) => {
      const key = String(item).trim();
      if (!key) return;
      const current = counts.get(key) || 0;
      counts.set(key, current + score);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
}

function normalizeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function bufferToVector(buffer, dimensions) {
  if (!buffer || !dimensions) return null;
  try {
    const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    if (!floatArray.length) return null;
    return floatArray.slice(0, dimensions);
  } catch {
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return null;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function mergePayloads(base, extra, limit) {
  const mergeList = (primary, secondary) => {
    const seen = new Set(primary);
    const merged = [...primary];
    secondary.forEach((item) => {
      if (!seen.has(item)) {
        merged.push(item);
        seen.add(item);
      }
    });
    return merged.slice(0, limit);
  };
  return {
    people: mergeList(base.people, extra.people),
    activities: mergeList(base.activities, extra.activities),
    tags: mergeList(base.tags, extra.tags)
  };
}

router.get('/:type/:id', (req, res) => {
  const { type, id } = req.params;
  if (!VALID_TYPES.has(type)) {
    res.status(400).json({ message: 'Unsupported entity type' });
    return;
  }
  const bucket = BUCKETS.has(req.query.bucket) ? req.query.bucket : 'week';
  const limit = parseLimit(req.query.limit);
  const db = getDb();

  const bucketExpr =
    bucket === 'day'
      ? "strftime('%Y-%m-%d', e.occurred_at)"
      : bucket === 'week'
        ? "strftime('%Y-W%W', e.occurred_at)"
        : "strftime('%Y-%m', e.occurred_at)";
  const windowSize = bucket === 'month_2' ? 2 : bucket === 'month_3' ? 3 : 1;

  const eventRows = db
    .prepare(
      `SELECT e.id, e.occurred_at, e.raw_text, em.summary
       FROM events e
       LEFT JOIN event_metadata em ON em.event_id = e.id
       WHERE em.people IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM json_each(em.people)
           WHERE json_each.value = @id
         )
       ORDER BY e.occurred_at DESC
       LIMIT @limit`
    )
    .all({ id, limit });

  const seriesRows = db
    .prepare(
      `SELECT ${bucket === 'all' ? "'All time'" : bucketExpr} AS bucket, COUNT(1) AS value
       FROM events e
       LEFT JOIN event_metadata em ON em.event_id = e.id
       WHERE em.people IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM json_each(em.people)
           WHERE json_each.value = @id
         )
       GROUP BY bucket
       ORDER BY bucket ASC`
    )
    .all({ id });

  const mergedSeries = mergeMonthBuckets(seriesRows, windowSize).map((row) => ({
    ...row,
    label: row.bucket
  }));

  res.json({
    entity: { type, id },
    series: { bucket, points: mergedSeries },
    events: eventRows
  });
});

function mergeMonthBuckets(rows = [], windowSize = 1) {
  if (!rows.length || windowSize <= 1) return rows;
  const parseMonth = (b) => {
    const d = new Date(`${b}-01T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const start = parseMonth(rows[0].bucket);
  if (!start) return rows;
  const monthsDiff = (from, to) => (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const grouped = new Map();
  for (const row of rows) {
    const d = parseMonth(row.bucket);
    if (!d) continue;
    const idx = Math.floor(monthsDiff(start, d) / windowSize);
    if (!grouped.has(idx)) {
      const bucketStart = new Date(start);
      bucketStart.setMonth(start.getMonth() + idx * windowSize);
      const label = `${bucketStart.toISOString().slice(0, 7)} (+${windowSize - 1}m)`;
      grouped.set(idx, { bucket: label, acc: 0, count: 0 });
    }
    const bucket = grouped.get(idx);
    bucket.acc += Number(row.value) || 0;
    bucket.count += 1;
  }
  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({
      bucket: v.bucket,
      value: v.acc
    }));
}

module.exports = router;
