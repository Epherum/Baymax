const { getDb } = require('./db');

const METRIC_KEY_REGEX = /^[a-zA-Z0-9_]+$/;

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

/**
 * Create relationship edges for an event based on its metadata.
 * Supports people, activities, themes/tags as mentions/tags edges.
 */
function upsertEventRelationships({ eventId, metadata = {}, occurredAt, importId, chunkId }) {
  const db = getDb();
  const people = normalizeArray(metadata.people);
  const activities = normalizeArray(metadata.activities);
  const tags = normalizeArray(metadata.tags);
  const metrics = normalizeMetrics(metadata.metrics);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO entity_relationships
    (source_type, source_id, target_type, target_id, edge_type, weight, occurred_at, metadata)
    VALUES (@source_type, @source_id, @target_type, @target_id, @edge_type, @weight, @occurred_at, @metadata)
  `);

  const tx = db.transaction(() => {
    const attachMentions = (sourceType, sourceId) => {
      people.forEach((person) => {
        insert.run({
          source_type: sourceType,
          source_id: sourceId,
          target_type: 'person',
          target_id: String(person),
          edge_type: 'mentions',
          weight: 1,
          occurred_at: occurredAt ?? null,
          metadata: null
        });
      });
      activities.forEach((activity) => {
        insert.run({
          source_type: sourceType,
          source_id: sourceId,
          target_type: 'activity',
          target_id: String(activity),
          edge_type: 'tagged_with',
          weight: 1,
          occurred_at: occurredAt ?? null,
          metadata: null
        });
      });
      tags.forEach((tag) => {
        insert.run({
          source_type: sourceType,
          source_id: sourceId,
          target_type: 'tag',
          target_id: String(tag),
          edge_type: 'tagged_with',
          weight: 1,
          occurred_at: occurredAt ?? null,
          metadata: null
        });
      });
    };

    if (importId) {
      insert.run({
        source_type: 'event',
        source_id: eventId,
        target_type: 'life_dump_import',
        target_id: String(importId),
        edge_type: 'source_import',
        weight: 1,
        occurred_at: occurredAt ?? null,
        metadata: null
      });
    }
    if (chunkId) {
      insert.run({
        source_type: 'event',
        source_id: eventId,
        target_type: 'life_dump_chunk',
        target_id: String(chunkId),
        edge_type: 'source_chunk',
        weight: 1,
        occurred_at: occurredAt ?? null,
        metadata: null
      });
    }
    attachMentions('event', eventId);
    if (chunkId) attachMentions('life_dump_chunk', chunkId);
    if (importId) attachMentions('life_dump_import', importId);

    metrics.forEach(({ key, value }) => {
      insert.run({
        source_type: 'event',
        source_id: eventId,
        target_type: 'metric',
        target_id: key,
        edge_type: 'metric_value',
        weight: Number.isFinite(value) ? value : 1,
        occurred_at: occurredAt ?? null,
        metadata: Number.isFinite(value) ? JSON.stringify({ value }) : null
      });
    });
  });

  tx();
}

function upsertReflectionRelationships({ reflectionId, events = [] }) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO entity_relationships
    (source_type, source_id, target_type, target_id, edge_type, occurred_at, weight, metadata)
    VALUES (@source_type, @source_id, @target_type, @target_id, @edge_type, @occurred_at, @weight, @metadata)
  `);
  const tx = db.transaction(() => {
    events.forEach((evt) => {
      insert.run({
        source_type: 'reflection',
        source_id: reflectionId,
        target_type: 'event',
        target_id: evt.event_id,
        edge_type: evt.role === 'context' ? 'context_for' : 'evidence_for',
        occurred_at: evt.occurred_at ?? null,
        weight: 1,
        metadata: null
      });
    });
  });
  tx();
}

function upsertMetricAnnotations({ sourceType, sourceId, events = [] }) {
  if (!sourceType || sourceId === undefined || sourceId === null) return;
  if (!Array.isArray(events) || events.length === 0) return;
  const db = getDb();
  const eventIds = events
    .map((ev) => Number(ev?.event_id ?? ev?.id ?? ev))
    .filter((id) => Number.isFinite(id));
  if (!eventIds.length) return;
  const placeholders = eventIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT e.id AS event_id, e.occurred_at, em.metrics
       FROM events e
       LEFT JOIN event_metadata em ON em.event_id = e.id
       WHERE e.id IN (${placeholders})`
    )
    .all(...eventIds);
  if (!rows.length) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO entity_relationships
    (source_type, source_id, target_type, target_id, edge_type, weight, occurred_at, metadata)
    VALUES (@source_type, @source_id, @target_type, @target_id, @edge_type, @weight, @occurred_at, @metadata)
  `);
  const tx = db.transaction(() => {
    rows.forEach((row) => {
      const metrics = normalizeMetrics(row.metrics);
      metrics.forEach(({ key, value }) => {
        insert.run({
          source_type: sourceType,
          source_id: sourceId,
          target_type: 'metric',
          target_id: key,
          edge_type: 'annotates_metric',
          weight: Number.isFinite(value) ? value : 1,
          occurred_at: row.occurred_at ?? null,
          metadata: JSON.stringify({ event_id: row.event_id, value: Number.isFinite(value) ? value : null })
        });
      });
    });
  });
  tx();
}

function normalizeMetrics(raw) {
  if (!raw) return [];
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj)
    .map(([key, value]) => ({ key: String(key), value: Number(value) }))
    .filter(({ key, value }) => METRIC_KEY_REGEX.test(key) && Number.isFinite(value));
}

function upsertGoalRelationships({ goalId, eventId, edgeType = 'related_to', occurredAt }) {
  const db = getDb();
  db
    .prepare(
      `INSERT OR IGNORE INTO entity_relationships
       (source_type, source_id, target_type, target_id, edge_type, occurred_at, weight, metadata)
       VALUES ('goal', @goalId, 'event', @eventId, @edgeType, @occurred_at, 1, NULL)`
    )
    .run({ goalId, eventId, edgeType, occurred_at: occurredAt ?? null });
}

function upsertChunkImportRelationships({ chunkId, importId }) {
  if (!chunkId || !importId) return;
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO entity_relationships
    (source_type, source_id, target_type, target_id, edge_type, weight, occurred_at, metadata)
    VALUES (@source_type, @source_id, @target_type, @target_id, @edge_type, @weight, NULL, NULL)
  `);
  const tx = db.transaction(() => {
    insert.run({
      source_type: 'life_dump_chunk',
      source_id: chunkId,
      target_type: 'life_dump_import',
      target_id: importId,
      edge_type: 'part_of',
      weight: 1
    });
    insert.run({
      source_type: 'life_dump_import',
      source_id: importId,
      target_type: 'life_dump_chunk',
      target_id: chunkId,
      edge_type: 'includes',
      weight: 1
    });
  });
  tx();
}

module.exports = {
  upsertEventRelationships,
  upsertReflectionRelationships,
  upsertGoalRelationships,
  upsertChunkImportRelationships,
  upsertMetricAnnotations
};
