const express = require('express');
const { generateSummary, generateCaptureMetadata, extractJson, callGemini } = require('../ai/gemini');
const { getDb } = require('../db');
const { buildEntityChatPrompt, ENTITY_CHAT_SYSTEM_INSTRUCTION } = require('../prompts');

const router = express.Router();

const MAX_TEXT_LENGTH = 8000;

router.post('/summarize', async (req, res) => {
  const { text } = req.body ?? {};
  if (!text || typeof text !== 'string') {
    res.status(400).json({ message: 'text is required' });
    return;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ message: `text must be <= ${MAX_TEXT_LENGTH} characters` });
    return;
  }
  try {
    const summary = await generateSummary(text);
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate summary', error: err.message });
  }
});

router.post('/capture-metadata', async (req, res) => {
  const { text } = req.body ?? {};
  if (!text || typeof text !== 'string') {
    res.status(400).json({ message: 'text is required' });
    return;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ message: `text must be <= ${MAX_TEXT_LENGTH} characters` });
    return;
  }
  try {
    const raw = await generateCaptureMetadata(text);
    console.log('Raw Gemini response:', raw);
    const parsed = extractJson(raw);
    if (!parsed) {
      throw new Error('Gemini did not return valid JSON');
    }
    const response = {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      mood_score: Number.isFinite(parsed.mood_score) ? Math.max(-5, Math.min(5, Math.round(parsed.mood_score))) : null,
      energy_level: Number.isFinite(parsed.energy_level) ? Math.max(0, Math.min(10, Math.round(parsed.energy_level))) : null,
      importance: Number.isFinite(parsed.importance) ? Math.max(1, Math.min(5, Math.round(parsed.importance))) : null,
      location: typeof parsed.location === 'string' ? parsed.location.trim() : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).trim()).filter(Boolean) : [],
      people: Array.isArray(parsed.people) ? parsed.people.map((p) => String(p).trim()).filter(Boolean) : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities.map((a) => String(a).trim()).filter(Boolean) : [],
      emotions: Array.isArray(parsed.emotions) ? parsed.emotions.map((e) => String(e).trim()).filter(Boolean) : [],
      metrics: parsed.metrics && typeof parsed.metrics === 'object' && !Array.isArray(parsed.metrics) ? parsed.metrics : {},
    };
    res.json(response);
  } catch (err) {
    console.error('Capture metadata error:', err);
    res.status(500).json({ message: 'Failed to generate capture metadata', error: err.message });
  }
});

router.post('/entity-chat', async (req, res) => {
  const { entity_type: entityType = 'person', entity_id: entityId, question, limit = 15 } = req.body ?? {};
  if (!entityId) {
    res.status(400).json({ message: 'entity_id is required' });
    return;
  }
  if (!question || typeof question !== 'string') {
    res.status(400).json({ message: 'question is required' });
    return;
  }
  const db = getDb();
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 40);
  try {
    const events = db
      .prepare(
        `SELECT e.id, e.occurred_at, e.raw_text, em.summary
         FROM events e
         LEFT JOIN event_metadata em ON em.event_id = e.id
         WHERE em.people IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM json_each(em.people)
             WHERE json_each.value = @entityId
           )
         ORDER BY e.occurred_at DESC
         LIMIT @limit`
      )
      .all({ entityId, limit: safeLimit });

    const contextLines = events
      .map((ev) => {
        const title = ev.summary || ev.raw_text || '';
        const date = ev.occurred_at ? new Date(ev.occurred_at).toISOString().slice(0, 10) : '';
        return `${date} — ${title}`.slice(0, 260);
      })
      .filter(Boolean);

    const prompt = buildEntityChatPrompt({ entityType, entityId, question, contextLines });
    const answer = await callGemini({ prompt, systemInstruction: ENTITY_CHAT_SYSTEM_INSTRUCTION });
    res.json({ answer, used_events: events.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed to chat about entity', error: err.message });
  }
});

module.exports = router;
