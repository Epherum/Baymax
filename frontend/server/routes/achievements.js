const express = require('express');
const { getDb } = require('../db');
const { callGemini } = require('../ai/gemini');
const { buildAchievementsChatPrompt, ACHIEVEMENTS_CHAT_SYSTEM_INSTRUCTION } = require('../prompts');

const router = express.Router();

const MAX_TITLE_LENGTH = 200;
const MAX_DESC_LENGTH = 4000;
const MAX_QUESTION_LENGTH = 4000;

function normalizeTags(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  const trimmed = list
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map((t) => t.slice(0, 40).toLowerCase());
  const unique = Array.from(new Set(trimmed));
  return unique.slice(0, 12);
}

function parseDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return `${value.trim()}T12:00:00.000Z`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function rowToAchievement(row) {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, description, tags, occurred_at, created_at, updated_at
       FROM achievements
       ORDER BY COALESCE(occurred_at, created_at) DESC, created_at DESC`
    )
    .all();
  res.json({ achievements: rows.map(rowToAchievement) });
});

router.post('/', (req, res) => {
  const { title, description, tags, occurred_at } = req.body ?? {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ message: 'title is required' });
    return;
  }
  if (title.length > MAX_TITLE_LENGTH) {
    res.status(400).json({ message: `title must be <= ${MAX_TITLE_LENGTH} characters` });
    return;
  }
  if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > MAX_DESC_LENGTH)) {
    res.status(400).json({ message: `description must be a string <= ${MAX_DESC_LENGTH} characters` });
    return;
  }
  const normalizedTags = normalizeTags(tags);
  const dateValue = parseDate(occurred_at);
  if (occurred_at && !dateValue) {
    res.status(400).json({ message: 'occurred_at must be a valid date string (e.g., 2024-06-15)' });
    return;
  }

  const db = getDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO achievements (title, description, tags, occurred_at)
         VALUES (@title, @description, @tags, @occurred_at)`
      )
      .run({
        title: title.trim(),
        description: description?.trim() || null,
        tags: normalizedTags.length ? JSON.stringify(normalizedTags) : null,
        occurred_at: dateValue
      });
    const created = db
      .prepare(
        `SELECT id, title, description, tags, occurred_at, created_at, updated_at
         FROM achievements
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);
    res.status(201).json({ achievement: rowToAchievement(created) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create achievement', error: err.message });
  }
});

router.patch('/:id', (req, res) => {
  const { title, description, tags, occurred_at } = req.body ?? {};
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE_LENGTH)) {
    res.status(400).json({ message: `title must be a non-empty string <= ${MAX_TITLE_LENGTH} characters` });
    return;
  }
  if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > MAX_DESC_LENGTH)) {
    res.status(400).json({ message: `description must be a string <= ${MAX_DESC_LENGTH} characters` });
    return;
  }
  const normalizedTags = tags === undefined ? undefined : normalizeTags(tags);
  const dateValue = parseDate(occurred_at);
  if (occurred_at !== undefined && occurred_at !== null && !dateValue) {
    res.status(400).json({ message: 'occurred_at must be a valid date string (e.g., 2024-06-15)' });
    return;
  }

  const db = getDb();
  const result = db
    .prepare(
      `UPDATE achievements
       SET title = COALESCE(@title, title),
           description = CASE WHEN @description = '__NULL__' THEN NULL ELSE COALESCE(@description, description) END,
           tags = CASE WHEN @tags = '__NULL__' THEN NULL ELSE COALESCE(@tags, tags) END,
           occurred_at = CASE WHEN @occurred_at = '__NULL__' THEN NULL ELSE COALESCE(@occurred_at, occurred_at) END,
           updated_at = (CURRENT_TIMESTAMP)
       WHERE id = @id`
    )
    .run({
      id: req.params.id,
      title: title?.trim() ?? null,
      description: description === null ? '__NULL__' : description?.trim() ?? null,
      tags: normalizedTags === undefined ? null : normalizedTags.length ? JSON.stringify(normalizedTags) : '__NULL__',
      occurred_at: occurred_at === null ? '__NULL__' : dateValue ?? null
    });

  if (result.changes === 0) {
    res.status(404).json({ message: 'Achievement not found' });
    return;
  }

  const updated = db
    .prepare(
      `SELECT id, title, description, tags, occurred_at, created_at, updated_at
       FROM achievements
       WHERE id = ?`
    )
    .get(req.params.id);
  res.json({ achievement: rowToAchievement(updated) });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM achievements WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ message: 'Achievement not found' });
    return;
  }
  res.status(204).send();
});

router.post('/chat', async (req, res) => {
  const { question, limit = 30 } = req.body ?? {};
  if (!question || typeof question !== 'string') {
    res.status(400).json({ message: 'question is required' });
    return;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ message: `question must be <= ${MAX_QUESTION_LENGTH} characters` });
    return;
  }
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 60);

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, description, tags, occurred_at, created_at, updated_at
       FROM achievements
       ORDER BY COALESCE(occurred_at, created_at) DESC, created_at DESC
       LIMIT @limit`
    )
    .all({ limit: safeLimit });
  const achievements = rows.map(rowToAchievement);

  if (!achievements.length) {
    res.status(400).json({ message: 'Add at least one achievement before chatting.' });
    return;
  }

  const prompt = buildAchievementsChatPrompt({
    question,
    achievements: achievements.map((a) => ({
      title: a.title,
      description: a.description,
      tags: a.tags,
      occurred_at: a.occurred_at
    }))
  });

  try {
    const answer = await callGemini({
      prompt,
      systemInstruction: ACHIEVEMENTS_CHAT_SYSTEM_INSTRUCTION
    });
    res.json({ answer, used_achievements: achievements.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed to chat about achievements', error: err.message });
  }
});

module.exports = router;
