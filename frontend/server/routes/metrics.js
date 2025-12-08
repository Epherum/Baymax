const express = require('express');
const { getDb } = require('../db');

const router = express.Router();
const ALLOWED_KEYS = /^[a-zA-Z0-9_]+$/;
const BUCKETS = new Set(['day', 'week', 'month', 'month_2', 'month_3', 'all']);
const AGG = new Set(['sum', 'avg', 'count']);

router.get('/keys', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT json_each.key AS key
       FROM event_metadata, json_each(event_metadata.metrics)
       WHERE event_metadata.metrics IS NOT NULL`
    )
    .all();
  res.json({ keys: rows.map((r) => r.key).filter(Boolean) });
});

router.get('/people', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT json_each.value AS person
       FROM event_metadata, json_each(event_metadata.people)
       WHERE event_metadata.people IS NOT NULL`
    )
    .all();
  res.json({ people: rows.map((r) => r.person).filter(Boolean) });
});

function mergeMonthBuckets(rows = [], windowSize = 1, agg = 'sum') {
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
      value: agg === 'avg' ? (v.count ? v.acc / v.count : 0) : v.acc
    }));
}

function mergeAnnotationBuckets(rows = [], windowSize = 1) {
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
    const key = `${idx}:${row.source_type}`;
    if (!grouped.has(key)) {
      const bucketStart = new Date(start);
      bucketStart.setMonth(start.getMonth() + idx * windowSize);
      const label = `${bucketStart.toISOString().slice(0, 7)} (+${windowSize - 1}m)`;
      grouped.set(key, { bucket: label, source_type: row.source_type, count: 0 });
    }
    const bucket = grouped.get(key);
    bucket.count += Number(row.count) || 0;
  }
  return Array.from(grouped.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

router.get('/', (req, res) => {
  const { type = 'metric', key, person, bucket = 'day', agg = 'sum' } = req.query;
  const db = getDb();
  if (!BUCKETS.has(bucket)) {
    res.status(400).json({ message: 'bucket must be day|week|month|month_2|month_3|all' });
    return;
  }
  if (!AGG.has(agg)) {
    res.status(400).json({ message: 'agg must be sum|avg|count' });
    return;
  }

  const bucketExpr =
    bucket === 'day'
      ? "strftime('%Y-%m-%d', e.occurred_at)"
      : bucket === 'week'
        ? "strftime('%Y-W%W', e.occurred_at)"
        : "strftime('%Y-%m', e.occurred_at)";
  const relBucketExpr =
    bucket === 'day'
      ? "strftime('%Y-%m-%d', occurred_at)"
      : bucket === 'week'
        ? "strftime('%Y-W%W', occurred_at)"
        : "strftime('%Y-%m', occurred_at)";
  const windowSize = bucket === 'month_2' ? 2 : bucket === 'month_3' ? 3 : 1;
  const includeAnnotations = req.query.include_annotations === '1' || req.query.annotations === '1';
  const offset = Number.parseInt(req.query.offset, 10) || 0;
  const limit = Number.parseInt(req.query.limit, 10) || 500;

  if (type === 'metric') {
    if (!key || typeof key !== 'string' || !ALLOWED_KEYS.test(key)) {
      res.status(400).json({ message: 'key is required (alphanumeric/underscore)' });
      return;
    }
    const valueExpr = `CAST(json_extract(em.metrics, '$.${key}') AS REAL)`;
    const sql = `
      SELECT ${bucket === 'all' ? "'All time'" : bucketExpr} AS bucket,
             ${agg === 'count' ? 'COUNT(1)' : `${agg.toUpperCase()}(${valueExpr})`} AS value
      FROM events e
      JOIN event_metadata em ON em.event_id = e.id
      WHERE em.metrics IS NOT NULL AND json_extract(em.metrics, '$.${key}') IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket ASC
      LIMIT @limit OFFSET @offset
    `;
    let rows = db.prepare(sql).all({ limit, offset });
    if (bucket === 'month_2' || bucket === 'month_3') {
      rows = mergeMonthBuckets(rows, windowSize, agg);
    }
    let annotations = [];
    if (includeAnnotations) {
      const annRows = db
        .prepare(
          `SELECT ${bucket === 'all' ? "'All time'" : relBucketExpr} AS bucket,
                  source_type,
                  COUNT(1) AS count
           FROM entity_relationships
           WHERE target_type = 'metric'
             AND target_id = @key
             AND edge_type = 'annotates_metric'
             AND occurred_at IS NOT NULL
           GROUP BY bucket, source_type
           ORDER BY bucket ASC`
        )
        .all({ key });
      annotations = bucket === 'month_2' || bucket === 'month_3' ? mergeAnnotationBuckets(annRows, windowSize) : annRows;
    }
    res.json({ points: rows, bucket, type: 'metric', key, agg, annotations });
    return;
  }

  if (type === 'person') {
    if (!person || typeof person !== 'string') {
      res.status(400).json({ message: 'person is required' });
      return;
    }
    const sql = `
      SELECT ${bucket === 'all' ? "'All time'" : bucketExpr} AS bucket, COUNT(1) AS value
      FROM events e
      JOIN event_metadata em ON em.event_id = e.id
      WHERE em.people IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM json_each(em.people)
          WHERE json_each.value = @person
        )
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    let rows = db.prepare(sql).all({ person });
    if (bucket === 'month_2' || bucket === 'month_3') {
      rows = mergeMonthBuckets(rows, windowSize, 'count');
    }
    res.json({ points: rows, bucket, type: 'person', person, agg: 'count' });
    return;
  }

  res.status(400).json({ message: 'Unsupported type' });
});

module.exports = router;
