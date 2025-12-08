const { enqueue } = require('./queue');
const { getDb } = require('../db');

function bufferFromVector(vector) {
  if (!vector) return null;
  if (Array.isArray(vector)) {
    return Buffer.from(new Float32Array(vector).buffer);
  }
  if (ArrayBuffer.isView(vector) && vector.BYTES_PER_ELEMENT) {
    const view = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
    return Buffer.from(view);
  }
  return null;
}

function upsertEmbedding({ eventId = null, chunkId = null, source, model, dimensions, vector }) {
  const db = getDb();
  const blob = bufferFromVector(vector);
  if (!blob) return;

  if (eventId) {
    const updated = db
      .prepare(
        `UPDATE embeddings
         SET model=@model, dimensions=@dimensions, vector=@vector, created_at=(CURRENT_TIMESTAMP)
         WHERE event_id=@event_id AND source=@source`
      )
      .run({ event_id: eventId, source, model, dimensions, vector: blob }).changes;
    if (updated === 0) {
      db.prepare(
        `INSERT INTO embeddings (event_id, life_dump_chunk_id, source, model, dimensions, vector)
         VALUES (@event_id, NULL, @source, @model, @dimensions, @vector)`
      ).run({ event_id: eventId, source, model, dimensions, vector: blob });
    }
    return;
  }

  if (chunkId) {
    const updated = db
      .prepare(
        `UPDATE embeddings
         SET model=@model, dimensions=@dimensions, vector=@vector, created_at=(CURRENT_TIMESTAMP)
         WHERE life_dump_chunk_id=@chunk_id AND source=@source`
      )
      .run({ chunk_id: chunkId, source, model, dimensions, vector: blob }).changes;
    if (updated === 0) {
      db.prepare(
        `INSERT INTO embeddings (event_id, life_dump_chunk_id, source, model, dimensions, vector)
         VALUES (NULL, @chunk_id, @source, @model, @dimensions, @vector)`
      ).run({ chunk_id: chunkId, source, model, dimensions, vector: blob });
    }
  }
}

function removeEmbedding({ eventId = null, chunkId = null, source }) {
  if (!source) return;
  const db = getDb();
  if (eventId) {
    db.prepare(
      `DELETE FROM embeddings WHERE event_id=@event_id AND source=@source`
    ).run({ event_id: eventId, source });
  } else if (chunkId) {
    db.prepare(
      `DELETE FROM embeddings WHERE life_dump_chunk_id=@chunk_id AND source=@source`
    ).run({ chunk_id: chunkId, source });
  }
}

async function embedSummary({ eventId, text }) {
  if (!text) return null;
  try {
    const result = await enqueue({ type: 'summary', text });
    if (result?.vector && result?.dimensions) {
      upsertEmbedding({
        eventId,
        source: 'summary',
        model: result.model ?? 'all-MiniLM-L6-v2',
        dimensions: result.dimensions,
        vector: result.vector
      });
    }
    return { eventId, vector: result?.vector ?? null };
  } catch (err) {
    // Best-effort: log and continue without blocking API responses.
    console.warn('[embeddings] failed to generate summary embedding', err.message);
    return null;
  }
}

async function embedLifeDumpChunkSummary({ chunkId, text }) {
  if (!text) return null;
  try {
    const result = await enqueue({ type: 'life_dump_summary', text });
    if (result?.vector && result?.dimensions) {
      upsertEmbedding({
        chunkId,
        source: 'life_dump_summary',
        model: result.model ?? 'all-MiniLM-L6-v2',
        dimensions: result.dimensions,
        vector: result.vector
      });
    }
    return { chunkId, vector: result?.vector ?? null };
  } catch (err) {
    console.warn('[embeddings] failed to generate life dump embedding', err.message);
    return null;
  }
}

async function embedText({ text }) {
  if (!text) return null;
  try {
    const result = await enqueue({ type: 'search_query', text });
    if (result?.vector && result?.dimensions) {
      return {
        vector: result.vector,
        dimensions: result.dimensions,
        model: result.model ?? 'all-MiniLM-L6-v2'
      };
    }
    return null;
  } catch (err) {
    console.warn('[embeddings] failed to embed ad-hoc text', err.message);
    return null;
  }
}

module.exports = {
  embedSummary,
  embedLifeDumpChunkSummary,
  removeEmbedding,
  embedText,
};
