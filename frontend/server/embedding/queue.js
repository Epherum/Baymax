const path = require('path');
const { Worker } = require('worker_threads');

let worker;
let jobCounter = 0;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(path.resolve(__dirname, '..', 'workers', 'embedding-worker.js'));
  worker.on('message', (msg) => {
    const { id, vector, error, model, dimensions } = msg || {};
    const pendingJob = pending.get(id);
    if (!pendingJob) return;
    pending.delete(id);
    if (error) {
      pendingJob.reject(new Error(error));
    } else {
      pendingJob.resolve({ vector, model, dimensions });
    }
  });
  worker.on('error', (err) => {
    // Fail all pending jobs if worker crashes.
    for (const [, pendingJob] of pending.entries()) {
      pendingJob.reject(err);
    }
    pending.clear();
    worker = null;
  });
  worker.on('exit', (code) => {
    if (code !== 0) {
      for (const [, pendingJob] of pending.entries()) {
        pendingJob.reject(new Error(`Embedding worker exited with code ${code}`));
      }
      pending.clear();
      worker = null;
    }
  });
  return worker;
}

function enqueue(job) {
  const currentWorker = ensureWorker();
  const id = ++jobCounter;
  const payload = { ...job, id };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    currentWorker.postMessage(payload);
  });
}

module.exports = {
  enqueue,
};
