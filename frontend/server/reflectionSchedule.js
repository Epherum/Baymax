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

function getState(db, key) {
  const row = db.prepare('SELECT value FROM system_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setState(db, key, value) {
  db.prepare(
    `INSERT INTO system_state (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=(CURRENT_TIMESTAMP)`
  ).run({ key, value });
}

function lastRun(db, period) {
  return getState(db, `reflection_last_${period}`);
}

function markRun(db, period, token) {
  setState(db, `reflection_last_${period}`, token);
  setState(db, `reflection_due_${period}`, '0');
}

function getNextDue(db, period) {
  return getState(db, `reflection_next_due_${period}`);
}

function setNextDue(db, period, dateIso) {
  if (!dateIso) {
    setState(db, `reflection_next_due_${period}`, null);
    return;
  }
  setState(db, `reflection_next_due_${period}`, dateIso);
}

function setDueFlag(db, period, due) {
  setState(db, `reflection_due_${period}`, due ? '1' : '0');
}

function computeDue(db, period) {
  const token = getToken(period);
  const last = lastRun(db, period);
  const nextDueAt = getNextDue(db, period);
  const now = new Date();
  const nextDate = nextDueAt ? new Date(nextDueAt) : null;
  const nextGateOk = !nextDate || (Number.isFinite(nextDate.getTime()) && now >= nextDate);
  const due = nextGateOk && last !== token;
  setDueFlag(db, period, due);
  return {
    period,
    due,
    current_token: token,
    last_run_token: last,
    next_due_at: nextDueAt
  };
}

module.exports = {
  getToken,
  computeDue,
  lastRun,
  markRun,
  setNextDue,
  getNextDue
};
