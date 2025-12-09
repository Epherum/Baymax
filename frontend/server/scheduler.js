const { getDb } = require('./db');
const { computeDue } = require('./reflectionSchedule');

function startScheduler() {
  const periods = ['daily', 'weekly', 'monthly'];
  const runAll = () => {
    const db = getDb();
    periods.forEach((p) => {
      try {
        computeDue(db, p);
      } catch (err) {
        console.error(`[scheduler] failed computing due for ${p}`, err);
      }
    });
  };
  // Kick once on boot, then hourly to refresh "due" flags. No automatic reflections are created.
  runAll();
  setInterval(runAll, 60 * 60 * 1000);
}

module.exports = {
  startScheduler
};
