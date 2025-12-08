const { generatePatterns } = require('./patterns/generator');
const { getDb } = require('./db');

function todayToken() {
  return new Date().toISOString().slice(0, 10);
}

function weekToken() {
  const now = new Date();
  const onejan = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthToken() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getToken(period) {
  if (period === 'daily') return todayToken();
  if (period === 'weekly') return weekToken();
  if (period === 'monthly') return monthToken();
  return todayToken();
}

function lastRun(db, period) {
  const row = db.prepare('SELECT value FROM system_state WHERE key = ?').get(`reflection_last_${period}`);
  return row ? row.value : null;
}

function markRun(db, period, token) {
  db.prepare(
    `INSERT INTO system_state (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=(CURRENT_TIMESTAMP)`
  ).run({ key: `reflection_last_${period}`, value: token });
}

function periodRange(period) {
  const end = new Date();
  const start = new Date();
  if (period === 'daily') {
    start.setDate(end.getDate() - 1);
  } else if (period === 'weekly') {
    start.setDate(end.getDate() - 7);
  } else if (period === 'monthly') {
    start.setMonth(end.getMonth() - 1);
  }
  return {
    range_start: start.toISOString().slice(0, 10),
    range_end: end.toISOString().slice(0, 10)
  };
}

function insertReflection(db, reflection, evidenceIds = []) {
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
      patterns: reflection.patterns ? JSON.stringify(reflection.patterns) : null
    });
    const reflectionId = result.lastInsertRowid;
    for (const evId of evidenceIds) {
      insertReflectionEvent.run({ reflection_id: reflectionId, event_id: evId, role: 'evidence' });
    }
    return reflectionId;
  });
  return tx();
}

async function runScheduledReflection(period) {
  const db = getDb();
  const token = getToken(period);
  if (lastRun(db, period) === token) return;

  const { range_start, range_end } = periodRange(period);
  const generated = await generatePatterns({ rangeStart: range_start, rangeEnd: range_end, depth: 'standard' });
  const reflection = {
    period,
    range_start,
    range_end,
    depth: 'standard',
    summary: generated.summary,
    mood_curve: generated.mood_curve,
    energy_curve: generated.energy_curve,
    patterns: generated.patterns,
    insights: generated.insights
  };
  insertReflection(db, reflection, generated.evidence_event_ids || []);
  markRun(db, period, token);
}

function startScheduler() {
  // Runs while the server process is active (e.g., during npm run dev/start).
  const periods = ['daily', 'weekly', 'monthly'];
  const runAll = () => {
    periods.forEach((p) => {
      runScheduledReflection(p).catch((err) => {
        console.error(`[scheduler] failed ${p} reflection`, err);
      });
    });
  };
  // Kick once on boot, then hourly.
  runAll();
  setInterval(runAll, 60 * 60 * 1000);
}

module.exports = {
  startScheduler
};
