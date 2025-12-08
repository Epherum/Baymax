const express = require('express');
const { getDb } = require('../db');
const { upsertGoalRelationships, upsertMetricAnnotations } = require('../relationships');

const router = express.Router();

const STATUS_VALUES = new Set(['suggested', 'active', 'completed', 'archived']);
const BOOLEANISH = new Set([0, 1, '0', '1', true, false]);
const MAX_TITLE_LENGTH = 255;
const MAX_DESC_LENGTH = 2000;

router.get('/', (_req, res) => {
  const db = getDb();
  const goals = db
    .prepare(
      `SELECT id, title, description, is_explicit, status, suggested_by_event_id,
              approved_at, rejected_at, created_at, updated_at
       FROM goals
       ORDER BY created_at DESC`
    )
    .all();
  res.json({ goals });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const goal = db
    .prepare(
      `SELECT id, title, description, is_explicit, status, suggested_by_event_id,
              approved_at, rejected_at, created_at, updated_at
       FROM goals
       WHERE id = ?`
    )
    .get(req.params.id);
  if (!goal) {
    res.status(404).json({ message: 'Goal not found' });
    return;
  }
  const goalEvents = db
    .prepare(
      `SELECT ge.id, ge.goal_id, ge.event_id, ge.value, ge.note, ge.created_at,
              e.occurred_at, e.source
       FROM goal_events ge
       JOIN events e ON ge.event_id = e.id
       WHERE ge.goal_id = ?
       ORDER BY ge.created_at DESC`
    )
    .all(goal.id);
  res.json({ goal, events: goalEvents });
});

router.post('/', (req, res) => {
  const { title, description, is_explicit = 1, status = 'suggested', suggested_by_event_id } = req.body ?? {};
  if (!title) {
    res.status(400).json({ message: 'title is required' });
    return;
  }
  if (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH) {
    res.status(400).json({ message: `title must be a string <= ${MAX_TITLE_LENGTH} chars` });
    return;
  }
  if (description !== undefined && (typeof description !== 'string' || description.length > MAX_DESC_LENGTH)) {
    res.status(400).json({ message: `description must be a string <= ${MAX_DESC_LENGTH} chars` });
    return;
  }
  if (!STATUS_VALUES.has(status)) {
    res.status(400).json({ message: `status must be one of: ${Array.from(STATUS_VALUES).join(', ')}` });
    return;
  }
  if (!BOOLEANISH.has(is_explicit)) {
    res.status(400).json({ message: 'is_explicit must be boolean-ish (0/1/true/false)' });
    return;
  }
  const isExplicitValue = is_explicit === false || is_explicit === 0 || is_explicit === '0' ? 0 : 1;

  const db = getDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO goals (title, description, is_explicit, status, suggested_by_event_id)
         VALUES (@title, @description, @is_explicit, @status, @suggested_by_event_id)`
      )
      .run({
        title,
        description: description ?? null,
        is_explicit: isExplicitValue,
        status,
        suggested_by_event_id: suggested_by_event_id ?? null
      });
    const created = db
      .prepare(
        `SELECT id, title, description, is_explicit, status, suggested_by_event_id,
                approved_at, rejected_at, created_at, updated_at
         FROM goals
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);
    if (suggested_by_event_id) {
      try {
        upsertGoalRelationships({ goalId: created.id, eventId: suggested_by_event_id, edgeType: 'suggested_by' });
        upsertMetricAnnotations({ sourceType: 'goal', sourceId: created.id, events: [{ event_id: suggested_by_event_id }] });
      } catch (err) {
        console.error('Failed to link goal suggestion relationship', err);
      }
    }
    res.status(201).json({ goal: created });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create goal', error: err.message });
  }
});

router.post('/:id/events', (req, res) => {
  const { event_id, value, note } = req.body ?? {};
  if (!event_id) {
    res.status(400).json({ message: 'event_id is required' });
    return;
  }
  const db = getDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO goal_events (goal_id, event_id, value, note)
         VALUES (@goal_id, @event_id, @value, @note)`
      )
      .run({
        goal_id: req.params.id,
        event_id,
        value: value ?? null,
        note: note ?? null
      });
    const created = db
      .prepare(
        `SELECT id, goal_id, event_id, value, note, created_at
         FROM goal_events
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);
    try {
      upsertGoalRelationships({ goalId: req.params.id, eventId: event_id, edgeType: 'tracks' });
      upsertMetricAnnotations({ sourceType: 'goal', sourceId: req.params.id, events: [{ event_id }] });
    } catch (err) {
      console.error('Failed to link goal event relationship', err);
    }
    res.status(201).json({ goal_event: created });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add goal event', error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  const { title, description, is_explicit, status, approved_at, rejected_at } = req.body ?? {};
  if (status && !STATUS_VALUES.has(status)) {
    res.status(400).json({ message: `status must be one of: ${Array.from(STATUS_VALUES).join(', ')}` });
    return;
  }
  if (title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH)) {
    res.status(400).json({ message: `title must be a string <= ${MAX_TITLE_LENGTH} chars` });
    return;
  }
  if (description !== undefined && (typeof description !== 'string' || description.length > MAX_DESC_LENGTH)) {
    res.status(400).json({ message: `description must be a string <= ${MAX_DESC_LENGTH} chars` });
    return;
  }
  if (is_explicit !== undefined && !BOOLEANISH.has(is_explicit)) {
    res.status(400).json({ message: 'is_explicit must be boolean-ish (0/1/true/false)' });
    return;
  }
  const isExplicitValue =
    is_explicit === undefined
      ? undefined
      : is_explicit === false || is_explicit === 0 || is_explicit === '0'
        ? 0
        : 1;

  const db = getDb();
  const result = db
    .prepare(
      `UPDATE goals
       SET title = COALESCE(@title, title),
           description = COALESCE(@description, description),
           is_explicit = COALESCE(@is_explicit, is_explicit),
           status = COALESCE(@status, status),
           approved_at = COALESCE(@approved_at, approved_at),
           rejected_at = COALESCE(@rejected_at, rejected_at),
           updated_at = (CURRENT_TIMESTAMP)
       WHERE id = @id`
    )
    .run({
      id: req.params.id,
      title: title ?? null,
      description: description ?? null,
      is_explicit: isExplicitValue,
      status: status ?? null,
      approved_at: approved_at ?? null,
      rejected_at: rejected_at ?? null
    });

  if (result.changes === 0) {
    res.status(404).json({ message: 'Goal not found' });
    return;
  }

  const updated = db
    .prepare(
      `SELECT id, title, description, is_explicit, status, suggested_by_event_id,
              approved_at, rejected_at, created_at, updated_at
       FROM goals
       WHERE id = ?`
    )
    .get(req.params.id);
  res.json({ goal: updated });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ message: 'Goal not found' });
    return;
  }
  res.status(204).send();
});

module.exports = router;
