const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

function parseLimit(raw, fallback = 200, max = 500) {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, 1), max);
}

function parseOffset(raw) {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(n, 0);
}

router.get('/', (req, res) => {
  const db = getDb();
  const { entity_type: entityType, entity_id: entityId, edge_type: edgeType, since, until } = req.query;
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const where = [];
  const params = {};

  if (entityType && entityId) {
    where.push('( (source_type = @entityType AND source_id = @entityId) OR (target_type = @entityType AND target_id = @entityId) )');
    params.entityType = entityType;
    params.entityId = entityId;
  }
  if (edgeType) {
    where.push('edge_type = @edgeType');
    params.edgeType = edgeType;
  }
  if (since) {
    where.push('(occurred_at IS NULL OR occurred_at >= @since)');
    params.since = since;
  }
  if (until) {
    where.push('(occurred_at IS NULL OR occurred_at <= @until)');
    params.until = until;
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT id, source_type, source_id, target_type, target_id, edge_type, weight, occurred_at, metadata
       FROM entity_relationships
       ${whereClause}
       ORDER BY (occurred_at IS NULL), occurred_at DESC, id DESC
       LIMIT @limitPlus OFFSET @offset`
    )
    .all({ ...params, limitPlus: limit + 1, offset });

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  const nodes = new Map();
  for (const r of sliced) {
    const sourceKey = `${r.source_type}:${r.source_id}`;
    const targetKey = `${r.target_type}:${r.target_id}`;
    if (!nodes.has(sourceKey)) {
      nodes.set(sourceKey, { id: String(r.source_id), type: r.source_type, label: labelForNode(r.source_type, r.source_id), degree: 0 });
    }
    if (!nodes.has(targetKey)) {
      nodes.set(targetKey, { id: String(r.target_id), type: r.target_type, label: labelForNode(r.target_type, r.target_id), degree: 0 });
    }
    nodes.get(sourceKey).degree += 1;
    nodes.get(targetKey).degree += 1;
  }

  res.json({
    nodes: Array.from(nodes.values()),
    edges: sliced.map((r) => ({
      id: r.id,
      source: { type: r.source_type, id: String(r.source_id) },
      target: { type: r.target_type, id: String(r.target_id) },
      edge_type: r.edge_type,
      weight: r.weight,
      occurred_at: r.occurred_at,
      metadata: r.metadata ? JSON.parse(r.metadata) : null
    })),
    has_more: hasMore
  });
});

function labelForNode(type, id) {
  if (type === 'person') return String(id);
  if (type === 'activity') return String(id);
  if (type === 'tag') return String(id);
  if (type === 'event') return `Event #${id}`;
  if (type === 'metric') return String(id);
  return `${type}:${id}`;
}

module.exports = router;
