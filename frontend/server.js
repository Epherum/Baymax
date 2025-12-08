const express = require('express');
const next = require('next');
const apiRouter = require('./server/routes');
const { startScheduler } = require('./server/scheduler');

const dev = process.env.NODE_ENV !== 'production';
const port = process.env.PORT || 3000;

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

async function start() {
  try {
    await app.prepare();
    const server = express();

    // Accept JSON bodies for upcoming API routes (events, imports, goals, reflections).
    server.use(express.json({ limit: '1mb' }));

    server.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Mount all API routers (events, imports, goals, reflections, etc.).
    server.use('/api', apiRouter);

    server.all('*', (req, res) => handle(req, res));

    server.listen(port, () => {
      console.log(`Baymax server running on http://localhost:${port}`);
      startScheduler();
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
