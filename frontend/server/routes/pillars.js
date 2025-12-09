const express = require('express');
const { getDb } = require('../db');
const { callGemini } = require('../ai/gemini');
const { buildPillarChatPrompt, PILLAR_CHAT_SYSTEM_INSTRUCTION } = require('../prompts');

const router = express.Router();
const MAX_TEXT = 8000;

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, values_text, created_at
       FROM pillars
       ORDER BY created_at DESC`
    )
    .all();
  res.json({ pillars: rows });
});

router.post('/', (req, res) => {
  const { title, values_text } = req.body ?? {};
  if (!title || typeof title !== 'string') {
    res.status(400).json({ message: 'title is required' });
    return;
  }
  if (title.length > 255) {
    res.status(400).json({ message: 'title must be <= 255 chars' });
    return;
  }
  if (values_text !== undefined && typeof values_text !== 'string') {
    res.status(400).json({ message: 'values_text must be a string' });
    return;
  }
  const db = getDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO pillars (title, values_text)
         VALUES (@title, @values_text)`
      )
      .run({ title: title.trim(), values_text: values_text ?? null });
    const created = db
      .prepare(
        `SELECT id, title, values_text, created_at
         FROM pillars
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);
    res.status(201).json({ pillar: created });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create pillar', error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  const { title, values_text } = req.body ?? {};
  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    res.status(400).json({ message: 'title must be a non-empty string' });
    return;
  }
  if (values_text !== undefined && typeof values_text !== 'string') {
    res.status(400).json({ message: 'values_text must be a string' });
    return;
  }
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE pillars
       SET title = COALESCE(@title, title),
           values_text = COALESCE(@values_text, values_text)
       WHERE id = @id`
    )
    .run({ id: req.params.id, title: title?.trim(), values_text: values_text ?? null });
  if (result.changes === 0) {
    res.status(404).json({ message: 'Pillar not found' });
    return;
  }
  const updated = db
    .prepare(
      `SELECT id, title, values_text, created_at
       FROM pillars
       WHERE id = ?`
    )
    .get(req.params.id);
  res.json({ pillar: updated });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM pillars WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ message: 'Pillar not found' });
    return;
  }
  res.status(204).send();
});

router.post('/:id/chat', async (req, res) => {
  const { question, limit = 20 } = req.body ?? {};
  if (!question || typeof question !== 'string') {
    res.status(400).json({ message: 'question is required' });
    return;
  }
  if (question.length > MAX_TEXT) {
    res.status(400).json({ message: `question must be <= ${MAX_TEXT} characters` });
    return;
  }
  const db = getDb();
  const pillar = db
    .prepare(
      `SELECT id, title, values_text, created_at
       FROM pillars
       WHERE id = ?`
    )
    .get(req.params.id);
  if (!pillar) {
    res.status(404).json({ message: 'Pillar not found' });
    return;
  }

  const terms = extractKeywords(pillar).map((t) => t.toLowerCase());
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 60);

  let events = [];
  if (terms.length) {
    const whereClauses = terms.map((_, idx) => `(lower(e.raw_text) LIKE @k${idx} OR lower(em.summary) LIKE @k${idx})`);
    const params = {};
    terms.forEach((t, idx) => {
      params[`k${idx}`] = `%${t}%`;
    });
    params.limit = safeLimit;
    events = db
      .prepare(
        `SELECT e.id, e.occurred_at, e.raw_text, em.summary
         FROM events e
         LEFT JOIN event_metadata em ON em.event_id = e.id
         WHERE ${whereClauses.join(' OR ')}
         ORDER BY e.occurred_at DESC
         LIMIT @limit`
      )
      .all(params);
  } else {
    events = db
      .prepare(
        `SELECT e.id, e.occurred_at, e.raw_text, em.summary
         FROM events e
         LEFT JOIN event_metadata em ON em.event_id = e.id
         ORDER BY e.occurred_at DESC
         LIMIT @limit`
      )
      .all({ limit: safeLimit });
  }

  const contextLines = events.map((ev) => {
    const date = ev.occurred_at ? new Date(ev.occurred_at).toISOString().slice(0, 10) : '';
    const text = ev.summary || ev.raw_text || '';
    return `${date} — ${text}`.slice(0, 260);
  });

  const prompt = buildPillarChatPrompt({
    pillarTitle: pillar.title,
    pillarDetails: pillar.values_text,
    question,
    contextLines
  });
  try {
    const answer = await callGemini({
      prompt,
      systemInstruction: PILLAR_CHAT_SYSTEM_INSTRUCTION
    });
    res.json({ answer, used_events: events.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed to chat about pillar', error: err.message });
  }
});

function extractKeywords(pillar) {
  const base = `${pillar?.title || ''}\n${pillar?.values_text || ''}`;
  return base
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

module.exports = router;
