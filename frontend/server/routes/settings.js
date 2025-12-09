const express = require('express');
const fs = require('fs');
const path = require('path');
const { DEFAULT_DB_PATH, closeDb, getDb } = require('../db');
const Database = require('better-sqlite3');

const router = express.Router();

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

router.get('/backup', async (_req, res) => {
  const db = getDb();
  const backupDir = path.resolve(__dirname, '..', '..', 'db', 'backups');
  ensureDir(backupDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetPath = path.join(backupDir, `baymax-backup-${timestamp}.sqlite`);

  try {
    await db.backup(targetPath);
    const downloadName = path.basename(targetPath);
    res.download(targetPath, downloadName, (err) => {
      if (err) {
        console.error('Backup download failed', err);
      }
      // Keep backup on disk for safety; do not delete.
    });
  } catch (err) {
    console.error('Backup failed', err);
    res.status(500).json({ message: 'Failed to create backup', error: err.message });
  }
});

router.post(
  '/restore',
  express.raw({ type: 'application/octet-stream', limit: '200mb' }),
  async (req, res) => {
    try {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ message: 'No backup file provided.' });
      }

      const backupDir = path.resolve(__dirname, '..', '..', 'db', 'backups');
      ensureDir(backupDir);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const uploadPath = path.join(backupDir, `upload-${timestamp}.sqlite`);
      fs.writeFileSync(uploadPath, buf);

      // Validate backup file by opening it and running integrity_check.
      const tmpDb = new Database(uploadPath, { readonly: true });
      const integrity = tmpDb.prepare('PRAGMA integrity_check').get();
      tmpDb.close();
      if (!integrity || integrity.integrity_check !== 'ok') {
        return res.status(400).json({ message: 'Backup file failed integrity check.' });
      }

      const walPath = `${DEFAULT_DB_PATH}-wal`;
      const shmPath = `${DEFAULT_DB_PATH}-shm`;
      const backupCurrentPath = fs.existsSync(DEFAULT_DB_PATH)
        ? `${DEFAULT_DB_PATH}.bak-${timestamp}`
        : null;

      closeDb();

      if (backupCurrentPath) {
        fs.copyFileSync(DEFAULT_DB_PATH, backupCurrentPath);
      }
      // Clean up WAL/SHM to avoid mismatched state.
      if (fs.existsSync(walPath)) fs.rmSync(walPath);
      if (fs.existsSync(shmPath)) fs.rmSync(shmPath);

      fs.copyFileSync(uploadPath, DEFAULT_DB_PATH);

      // Re-open to ensure future calls use the restored DB.
      getDb({ dbPath: DEFAULT_DB_PATH });

      res.json({
        ok: true,
        restored: true,
        backupCreated: backupCurrentPath ? path.basename(backupCurrentPath) : null,
      });
    } catch (err) {
      console.error('Restore failed', err);
      res.status(500).json({ message: 'Failed to restore backup', error: err.message });
    }
  }
);

module.exports = router;
