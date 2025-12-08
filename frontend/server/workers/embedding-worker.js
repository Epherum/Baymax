const { parentPort } = require('worker_threads');

let embedderPromise;

async function getEmbedder() {
  if (embedderPromise) return embedderPromise;
  embedderPromise = (async () => {
    try {
      const { pipeline } = await import('@xenova/transformers');
      const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      return embedder;
    } catch (err) {
      throw new Error(`Embedding model not available: ${err.message}`);
    }
  })();
  return embedderPromise;
}

async function handleJob(job) {
  const { id, type, text } = job || {};
  if (!type || !text) {
    return { id, error: 'Invalid embedding job payload' };
  }
  if (type !== 'summary' && type !== 'life_dump_summary' && type !== 'search_query') {
    return { id, error: `Unsupported embedding job type: ${type}` };
  }
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  const vector = output?.data;
  const dimensions = Array.isArray(vector) ? vector.length : vector?.length;
  return {
    id,
    vector,
    dimensions,
    model: embedder?.model?.modelId ?? 'all-MiniLM-L6-v2'
  };
}

if (!parentPort) {
  throw new Error('Embedding worker must be run as a worker thread');
}

parentPort.on('message', (job) => {
  handleJob(job)
    .then((result) => {
      parentPort.postMessage(result);
    })
    .catch((err) => {
      parentPort.postMessage({
        id: job?.id ?? null,
        error: err.message
      });
    });
});
