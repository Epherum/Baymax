const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { markRun, computeDue, setNextDue, getToken } = require('../reflectionSchedule');
const { callGemini, extractJson } = require('../ai/gemini');
const { buildInsightChatPrompt, buildReflectionChatPrompt } = require('../prompts');
const { upsertReflectionRelationships, upsertMetricAnnotations } = require('../relationships');
const { generatePatterns } = require('../patterns/generator');

const router = express.Router();

const PERIOD_VALUES = new Set(['daily', 'weekly', 'monthly', 'manual']);
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

function cleanTextField(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : value;
  return body.trim();
}

function extractReflectionData(text) {
  if (!text || typeof text !== 'string') return null;
  const json = extractJson(text) || parseJsonField(text);
  if (!json || typeof json !== 'object') return null;
  return {
    summary: typeof json.summary === 'string' ? json.summary : null,
    insights: typeof json.insights === 'string' ? json.insights : null,
    patterns: Array.isArray(json.patterns) ? json.patterns : null
  };
}

function stableInsightId(statement, type = '', idx = 0) {
  const seed = `${statement || ''}|${type || ''}|${idx}`;
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

function normalizePatterns(patterns) {
  if (!Array.isArray(patterns)) return [];
  return patterns.map((p, idx) => {
    const base = p && typeof p === 'object' ? p : {};
    const statement = typeof base.statement === 'string' && base.statement.trim()
      ? base.statement.trim()
      : (typeof base.title === 'string' ? base.title : '') || `Insight ${idx + 1}`;
    const id = base.id || base.uuid || base.key || stableInsightId(statement, base.type, idx);
    return {
      ...base,
      id,
      statement
    };
  });
}

function hydrateReflection(row) {
  if (!row) return row;
  const inferred = extractReflectionData(row.summary) || extractReflectionData(row.insights);
  const normalizedPatterns = normalizePatterns(
    inferred?.patterns ??
    parseJsonField(row.patterns)
  );
  return {
    ...row,
    summary: cleanTextField(inferred?.summary ?? row.summary),
    insights: cleanTextField(inferred?.insights ?? row.insights),
    mood_curve: parseJsonField(row.mood_curve),
    energy_curve: parseJsonField(row.energy_curve),
    patterns: normalizedPatterns
  };
}

function isValidDateString(value) {
  if (!value || typeof value !== 'string') return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts);
}

function getReflection(db, id) {
  const reflection = db
    .prepare(
      `SELECT id, period, range_start, range_end, depth, summary, mood_curve,
              energy_curve, patterns, insights, created_at
       FROM reflections
       WHERE id = ?`
    )
    .get(id);
  return hydrateReflection(reflection);
}

function findInsightById(reflection, insightId) {
  if (!reflection || !Array.isArray(reflection.patterns)) return null;
  return reflection.patterns.find((p, idx) => p.id === insightId || stableInsightId(p.statement, p.type, idx) === insightId) || null;
}

function fetchInsightMessages(db, reflectionId, insightId, limit = 100) {
  return db
    .prepare(
      `SELECT id, reflection_id, insight_id, role, message, created_at
       FROM reflection_insight_messages
       WHERE reflection_id = ? AND insight_id = ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(reflectionId, insightId, limit);
}

function fetchEvidenceEvents(db, eventIds = []) {
  if (!Array.isArray(eventIds) || !eventIds.length) return [];
  const placeholders = eventIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT id, raw_text, occurred_at, source
       FROM events
       WHERE id IN (${placeholders})`
    )
    .all(...eventIds);
}

function fetchReflectionChatMessages(db, reflectionId, limit = 200) {
  return db
    .prepare(
      `SELECT id, reflection_id, role, message, created_at
       FROM reflection_chat_messages
       WHERE reflection_id = ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(reflectionId, limit);
}

router.get('/', (req, res) => {
  const db = getDb();
  const { limit, offset } = sanitizeLimitOffset(req.query.limit, req.query.offset);
  const reflections = db
    .prepare(
      `SELECT id, period, range_start, range_end, depth, summary, mood_curve,
              energy_curve, patterns, insights, created_at
       FROM reflections
       ORDER BY created_at DESC
      LIMIT ? OFFSET ?`
    )
    .all(limit, offset)
    .map(hydrateReflection);
  const reflectionIds = reflections.map((r) => r.id);
  let events = [];
  if (reflectionIds.length) {
    events = db
      .prepare(
        `SELECT re.id, re.reflection_id, re.event_id, re.role,
                e.raw_text, e.occurred_at, e.source
         FROM reflection_events re
         JOIN events e ON e.id = re.event_id
         WHERE re.reflection_id IN (${reflectionIds.map(() => '?').join(',')})`
      )
      .all(...reflectionIds);
  }
  res.json({ reflections, events, limit, offset });
});

router.get('/due', (_req, res) => {
  try {
    const db = getDb();
    const periods = ['daily', 'weekly', 'monthly'];
    const statuses = periods.map((p) => computeDue(db, p));
    res.json({ periods: statuses });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load due statuses', error: err.message });
  }
});

router.post('/due', (req, res) => {
  const { period, next_due_at } = req.body ?? {};
  if (!period || !['daily', 'weekly', 'monthly'].includes(period)) {
    res.status(400).json({ message: 'period must be daily, weekly, or monthly' });
    return;
  }
  if (next_due_at) {
    const parsed = new Date(next_due_at);
    if (!Number.isFinite(parsed.getTime())) {
      res.status(400).json({ message: 'next_due_at must be a valid date' });
      return;
    }
  }
  try {
    const db = getDb();
    setNextDue(db, period, next_due_at || null);
    const status = computeDue(db, period);
    res.json({ period: status });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update due date', error: err.message });
  }
});

router.get('/:id/insights/:insightId/chat', (req, res) => {
  const db = getDb();
  const reflection = getReflection(db, req.params.id);
  if (!reflection) {
    res.status(404).json({ message: 'Reflection not found' });
    return;
  }
  const insight = findInsightById(reflection, req.params.insightId);
  if (!insight) {
    res.status(404).json({ message: 'Insight not found on this reflection' });
    return;
  }
  const messages = fetchInsightMessages(db, reflection.id, insight.id, 200);
  res.json({ reflection, insight, messages });
});

router.post('/:id/insights/:insightId/chat', async (req, res) => {
  const db = getDb();
  const reflection = getReflection(db, req.params.id);
  if (!reflection) {
    res.status(404).json({ message: 'Reflection not found' });
    return;
  }
  const insight = findInsightById(reflection, req.params.insightId);
  if (!insight) {
    res.status(404).json({ message: 'Insight not found on this reflection' });
    return;
  }
  const userMessage = (req.body?.message || '').trim();
  if (!userMessage) {
    res.status(400).json({ message: 'message is required' });
    return;
  }
  if (userMessage.length > 4000) {
    res.status(400).json({ message: 'message must be <= 4000 characters' });
    return;
  }

  const history = fetchInsightMessages(db, reflection.id, insight.id, 50);
  const evidence = fetchEvidenceEvents(db, Array.isArray(insight.evidence_event_ids) ? insight.evidence_event_ids : []);
  const insertMessage = db.prepare(
    `INSERT INTO reflection_insight_messages (reflection_id, insight_id, role, message)
     VALUES (@reflection_id, @insight_id, @role, @message)`
  );

  insertMessage.run({
    reflection_id: reflection.id,
    insight_id: insight.id,
    role: 'user',
    message: userMessage
  });

  try {
    const prompt = buildInsightChatPrompt({
      reflection,
      insight,
      history: [...history, { role: 'user', message: userMessage }],
      userMessage,
      evidence
    });
    const reply = cleanTextField(await callGemini({ prompt }));
    insertMessage.run({
      reflection_id: reflection.id,
      insight_id: insight.id,
      role: 'assistant',
      message: reply
    });
    const messages = fetchInsightMessages(db, reflection.id, insight.id, 200);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get Gemini response', error: err.message });
  }
});

router.delete('/:id/insights/:insightId', (req, res) => {
  const db = getDb();
  const reflection = getReflection(db, req.params.id);
  if (!reflection) {
    res.status(404).json({ message: 'Reflection not found' });
    return;
  }
  const remaining = (reflection.patterns || []).filter((p, idx) => {
    const normalizedId = p.id || stableInsightId(p.statement, p.type, idx);
    return normalizedId !== req.params.insightId;
  });
  if (remaining.length === (reflection.patterns || []).length) {
    res.status(404).json({ message: 'Insight not found on this reflection' });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE reflections
       SET patterns = @patterns
       WHERE id = @id`
    ).run({
      id: reflection.id,
      patterns: JSON.stringify(remaining)
    });
    db
      .prepare(
        `DELETE FROM reflection_insight_messages
         WHERE reflection_id = ? AND insight_id = ?`
      )
      .run(reflection.id, req.params.insightId);
  });
  tx();

  const updated = getReflection(db, reflection.id);
  res.json({ reflection: updated, removed: req.params.insightId });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const reflection = getReflection(db, req.params.id);
  if (!reflection) {
    res.status(404).json({ message: 'Reflection not found' });
    return;
  }
  const events = db
    .prepare(
      `SELECT re.id, re.reflection_id, re.event_id, re.role,
              e.raw_text, e.occurred_at, e.source
       FROM reflection_events re
       JOIN events e ON e.id = re.event_id
       WHERE re.reflection_id = ?
       ORDER BY re.id ASC`
    )
    .all(reflection.id);
  res.json({ reflection: hydrateReflection(reflection), events });
});

router.get('/:id/chat', (req, res) => {
  try {
    const db = getDb();
    const reflection = getReflection(db, req.params.id);
    if (!reflection) {
      res.status(404).json({ message: 'Reflection not found' });
      return;
    }
    const events = db
      .prepare(
        `SELECT re.event_id, e.raw_text, e.occurred_at, e.source
         FROM reflection_events re
         JOIN events e ON e.id = re.event_id
         WHERE re.reflection_id = ?
         ORDER BY re.id ASC`
      )
      .all(reflection.id);
    const messages = fetchReflectionChatMessages(db, reflection.id, 200);
    res.json({ reflection, events, messages });
  } catch (err) {
    console.error('Failed to load reflection chat', err);
    res.status(500).json({ message: 'Failed to load reflection chat', error: err.message });
  }
});

router.post('/:id/chat', async (req, res) => {
  try {
    const db = getDb();
    const reflection = getReflection(db, req.params.id);
    if (!reflection) {
      res.status(404).json({ message: 'Reflection not found' });
      return;
    }
    const userMessage = (req.body?.message || '').trim();
    if (!userMessage) {
      res.status(400).json({ message: 'message is required' });
      return;
    }
    if (userMessage.length > 4000) {
      res.status(400).json({ message: 'message must be <= 4000 characters' });
      return;
    }

    const events = db
      .prepare(
        `SELECT re.event_id, e.raw_text, e.occurred_at, e.source
         FROM reflection_events re
         JOIN events e ON e.id = re.event_id
         WHERE re.reflection_id = ?
         ORDER BY re.id ASC`
      )
      .all(reflection.id);

    const insertMessage = db.prepare(
      `INSERT INTO reflection_chat_messages (reflection_id, role, message)
       VALUES (@reflection_id, @role, @message)`
    );
    insertMessage.run({ reflection_id: reflection.id, role: 'user', message: userMessage });

    const history = fetchReflectionChatMessages(db, reflection.id, 50);

    const prompt = buildReflectionChatPrompt({
      reflection,
      history: [...history, { role: 'user', message: userMessage }],
      userMessage,
      events
    });
    const reply = cleanTextField(await callGemini({ prompt }));
    insertMessage.run({ reflection_id: reflection.id, role: 'assistant', message: reply });
    const messages = fetchReflectionChatMessages(db, reflection.id, 200);
    res.json({ messages });
  } catch (err) {
    console.error('Failed to send reflection chat', err);
    res.status(500).json({ message: 'Failed to get Gemini response', error: err.message });
  }
});

router.post('/', (req, res) => {
  const {
    period,
    range_start,
    range_end,
    depth = 'standard',
    summary,
    mood_curve,
    energy_curve,
    patterns,
    insights,
    events
  } = req.body ?? {};

  if (!period || !PERIOD_VALUES.has(period)) {
    res.status(400).json({ message: 'period is required and must be one of daily, weekly, monthly, manual' });
    return;
  }
  if (!range_start || !range_end) {
    res.status(400).json({ message: 'range_start and range_end are required' });
    return;
  }
  if (!isValidDateString(range_start) || !isValidDateString(range_end)) {
    res.status(400).json({ message: 'range_start and range_end must be valid date strings' });
    return;
  }
  if (summary !== undefined && (typeof summary !== 'string' || summary.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ message: `summary must be a string <= ${MAX_TEXT_LENGTH} chars` });
    return;
  }
  if (insights !== undefined && (typeof insights !== 'string' || insights.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ message: `insights must be a string <= ${MAX_TEXT_LENGTH} chars` });
    return;
  }

  const db = getDb();
  const normalizedPatterns = normalizePatterns(patterns);
  const insertReflection = db.prepare(
    `INSERT INTO reflections (period, range_start, range_end, depth, summary, mood_curve, energy_curve, patterns, insights)
     VALUES (@period, @range_start, @range_end, @depth, @summary, @mood_curve, @energy_curve, @patterns, @insights)`
  );
  const insertReflectionEvent = db.prepare(
    `INSERT INTO reflection_events (reflection_id, event_id, role)
     VALUES (@reflection_id, @event_id, @role)`
  );

  const tx = db.transaction(() => {
    const result = insertReflection.run({
      period,
      range_start,
      range_end,
      depth,
      summary: summary ?? null,
      mood_curve: mood_curve ? JSON.stringify(mood_curve) : null,
      energy_curve: energy_curve ? JSON.stringify(energy_curve) : null,
      patterns: normalizedPatterns.length ? JSON.stringify(normalizedPatterns) : null,
      insights: insights ?? null
    });
    const reflectionId = result.lastInsertRowid;
    if (Array.isArray(events)) {
      for (const evt of events) {
        if (!evt || !evt.event_id) continue;
        insertReflectionEvent.run({
          reflection_id: reflectionId,
          event_id: evt.event_id,
          role: evt.role ?? null
        });
      }
    }
    return reflectionId;
  });

  try {
    const reflectionId = tx();
    try {
      const eventRows = db
        .prepare(
          `SELECT re.event_id, re.role, e.occurred_at
           FROM reflection_events re
           JOIN events e ON e.id = re.event_id
           WHERE re.reflection_id = ?`
        )
        .all(reflectionId);
      upsertReflectionRelationships({ reflectionId, events: eventRows });
      upsertMetricAnnotations({ sourceType: 'reflection', sourceId: reflectionId, events: eventRows });
    } catch (err) {
      console.error('Failed to upsert reflection relationships', err);
    }
    if (period === 'daily' || period === 'weekly' || period === 'monthly') {
      try {
        markRun(db, period, getToken(period));
      } catch (err) {
        console.warn('Failed to mark reflection run', err.message);
      }
    }
    const created = db
      .prepare(
        `SELECT id, period, range_start, range_end, depth, summary, mood_curve,
                energy_curve, patterns, insights, created_at
         FROM reflections
         WHERE id = ?`
      )
      .get(reflectionId);
    const linkedEvents = db
      .prepare(
        `SELECT re.id, re.reflection_id, re.event_id, re.role
         FROM reflection_events re
         WHERE re.reflection_id = ?
         ORDER BY re.id ASC`
      )
      .all(reflectionId);
    res.status(201).json({ reflection: hydrateReflection(created), events: linkedEvents });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create reflection', error: err.message });
  }
});

router.post('/generate', async (req, res) => {
  const { period = 'manual', range_start, range_end, depth = 'standard' } = req.body ?? {};
  if (!range_start || !range_end) {
    res.status(400).json({ message: 'range_start and range_end are required' });
    return;
  }
  if (!PERIOD_VALUES.has(period)) {
    res.status(400).json({ message: 'period must be one of daily, weekly, monthly, manual' });
    return;
  }
  if (!isValidDateString(range_start) || !isValidDateString(range_end)) {
    res.status(400).json({ message: 'range_start and range_end must be valid date strings' });
    return;
  }

  try {
    const generated = await generatePatterns({ rangeStart: range_start, rangeEnd: range_end, depth });
    const reflection = {
      period,
      range_start,
      range_end,
      depth,
      summary: generated.summary,
      mood_curve: generated.mood_curve,
      energy_curve: generated.energy_curve,
      patterns: normalizePatterns(generated.patterns),
      insights: generated.insights
    };

    const db = getDb();
    const insertReflection = db.prepare(
      `INSERT INTO reflections (period, range_start, range_end, depth, summary, mood_curve, energy_curve, patterns, insights)
       VALUES (@period, @range_start, @range_end, @depth, @summary, @mood_curve, @energy_curve, @patterns, @insights)`
    );
    const insertReflectionEvent = db.prepare(
      `INSERT INTO reflection_events (reflection_id, event_id, role)
       VALUES (@reflection_id, @event_id, @role)`
    );
    const tx = db.transaction(() => {
      const result = insertReflection.run({
        ...reflection,
        mood_curve: reflection.mood_curve ? JSON.stringify(reflection.mood_curve) : null,
        energy_curve: reflection.energy_curve ? JSON.stringify(reflection.energy_curve) : null,
        patterns: reflection.patterns && reflection.patterns.length ? JSON.stringify(reflection.patterns) : null
      });
      const reflectionId = result.lastInsertRowid;
      const evidenceEvents = Array.isArray(generated.evidence_event_ids)
        ? generated.evidence_event_ids
        : [];
      for (const evId of evidenceEvents) {
        insertReflectionEvent.run({ reflection_id: reflectionId, event_id: evId, role: 'evidence' });
      }
      return reflectionId;
    });

    const created = db
      .prepare(
        `SELECT id, period, range_start, range_end, depth, summary, mood_curve,
                energy_curve, patterns, insights, created_at
         FROM reflections
         WHERE id = ?`
      )
      .get(tx());
    const evidenceEvents = db
      .prepare(
        `SELECT re.id, re.reflection_id, re.event_id, re.role,
                e.raw_text, e.occurred_at, e.source
         FROM reflection_events re
         JOIN events e ON e.id = re.event_id
         WHERE re.reflection_id = ?
         ORDER BY re.id ASC`
      )
      .all(created.id);

    try {
      upsertReflectionRelationships({
        reflectionId: created.id,
        events: evidenceEvents.map((e) => ({ event_id: e.event_id, role: e.role, occurred_at: e.occurred_at }))
      });
      upsertMetricAnnotations({
        sourceType: 'reflection',
        sourceId: created.id,
        events: evidenceEvents
      });
    } catch (err) {
      console.error('Failed to upsert relationships for generated reflection', err);
    }
    if (period === 'daily' || period === 'weekly' || period === 'monthly') {
      try {
        markRun(db, period, getToken(period));
      } catch (err) {
        console.warn('Failed to mark reflection run', err.message);
      }
    }

    res.status(201).json({ reflection: hydrateReflection(created), generated: true, events: evidenceEvents });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate reflection', error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  const {
    period,
    range_start,
    range_end,
    depth,
    summary,
    mood_curve,
    energy_curve,
    patterns,
    insights,
    events
  } = req.body ?? {};

  if (period && !PERIOD_VALUES.has(period)) {
    res.status(400).json({ message: 'period must be one of daily, weekly, monthly, manual' });
    return;
  }
  if (range_start !== undefined && !isValidDateString(range_start)) {
    res.status(400).json({ message: 'range_start must be a valid date string' });
    return;
  }
  if (range_end !== undefined && !isValidDateString(range_end)) {
    res.status(400).json({ message: 'range_end must be a valid date string' });
    return;
  }
  if (summary !== undefined && (typeof summary !== 'string' || summary.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ message: `summary must be a string <= ${MAX_TEXT_LENGTH} chars` });
    return;
  }
  if (insights !== undefined && (typeof insights !== 'string' || insights.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ message: `insights must be a string <= ${MAX_TEXT_LENGTH} chars` });
    return;
  }

  const normalizedPatterns = patterns === undefined ? undefined : normalizePatterns(patterns);
  const db = getDb();
  const updateReflection = db.prepare(
    `UPDATE reflections
     SET period = COALESCE(@period, period),
         range_start = COALESCE(@range_start, range_start),
         range_end = COALESCE(@range_end, range_end),
         depth = COALESCE(@depth, depth),
         summary = COALESCE(@summary, summary),
         mood_curve = COALESCE(@mood_curve, mood_curve),
         energy_curve = COALESCE(@energy_curve, energy_curve),
         patterns = COALESCE(@patterns, patterns),
         insights = COALESCE(@insights, insights)
     WHERE id = @id`
  );
  const deleteReflectionEvents = db.prepare(
    `DELETE FROM reflection_events WHERE reflection_id = ?`
  );
  const insertReflectionEvent = db.prepare(
    `INSERT INTO reflection_events (reflection_id, event_id, role)
     VALUES (@reflection_id, @event_id, @role)`
  );

  const tx = db.transaction(() => {
    const result = updateReflection.run({
      id: req.params.id,
      period: period ?? null,
      range_start: range_start ?? null,
      range_end: range_end ?? null,
      depth: depth ?? null,
      summary: summary ?? null,
      mood_curve: mood_curve ? JSON.stringify(mood_curve) : null,
      energy_curve: energy_curve ? JSON.stringify(energy_curve) : null,
      patterns: normalizedPatterns === undefined ? null : JSON.stringify(normalizedPatterns),
      insights: insights ?? null
    });
    if (result.changes === 0) {
      return { notFound: true };
    }
    if (Array.isArray(events)) {
      deleteReflectionEvents.run(req.params.id);
      for (const evt of events) {
        if (!evt || !evt.event_id) continue;
        insertReflectionEvent.run({
          reflection_id: req.params.id,
          event_id: evt.event_id,
          role: evt.role ?? null
        });
      }
    }
    return { notFound: false };
  });

  const result = tx();
  if (result.notFound) {
    res.status(404).json({ message: 'Reflection not found' });
    return;
  }

  const updated = db
    .prepare(
      `SELECT id, period, range_start, range_end, depth, summary, mood_curve,
              energy_curve, patterns, insights, created_at
       FROM reflections
       WHERE id = ?`
    )
    .get(req.params.id);
  const linkedEvents = db
    .prepare(
      `SELECT re.id, re.reflection_id, re.event_id, re.role
       FROM reflection_events re
       WHERE re.reflection_id = ?
       ORDER BY re.id ASC`
    )
    .all(req.params.id);

  try {
    const eventRows = db
      .prepare(
        `SELECT re.event_id, re.role, e.occurred_at
         FROM reflection_events re
         JOIN events e ON e.id = re.event_id
         WHERE re.reflection_id = ?`
      )
      .all(req.params.id);
    upsertReflectionRelationships({ reflectionId: Number(req.params.id), events: eventRows });
    upsertMetricAnnotations({ sourceType: 'reflection', sourceId: Number(req.params.id), events: eventRows });
  } catch (err) {
    console.error('Failed to refresh reflection relationships', err);
  }

  res.json({ reflection: hydrateReflection(updated), events: linkedEvents });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM reflections WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ message: 'Reflection not found' });
    return;
  }
  res.status(204).send();
});

module.exports = router;
