const { getDb } = require('../db');
const { callGemini, extractJson } = require('../ai/gemini');

function safeParse(val) {
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function fetchEventsInRange(rangeStart, rangeEnd) {
  const db = getDb();
  return db
    .prepare(
      `SELECT e.id, e.raw_text, e.occurred_at,
              em.summary, em.mood_score, em.energy_level,
              em.tags, em.people, em.activities, em.metrics
       FROM events e
       LEFT JOIN event_metadata em ON em.event_id = e.id
       WHERE e.occurred_at BETWEEN @start AND @end
       ORDER BY e.occurred_at ASC`
    )
    .all({ start: rangeStart, end: rangeEnd })
    .map((row) => ({
      ...row,
      tags: row.tags ? safeParse(row.tags) : null,
      people: row.people ? safeParse(row.people) : null,
      activities: row.activities ? safeParse(row.activities) : null,
      metrics: row.metrics ? safeParse(row.metrics) : null
    }));
}

function fetchEmbeddings(rangeStart, rangeEnd, limit = 200) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT e.id, em.summary, e.occurred_at, emb.vector, emb.dimensions
       FROM embeddings emb
       JOIN events e ON e.id = emb.event_id
       LEFT JOIN event_metadata em ON em.event_id = e.id
       WHERE emb.source = 'summary'
         AND e.occurred_at BETWEEN @start AND @end
       ORDER BY e.occurred_at DESC
       LIMIT @limit`
    )
    .all({ start: rangeStart, end: rangeEnd, limit })
    .filter((r) => r.vector && r.dimensions);
  return rows.map((r) => ({
    id: r.id,
    summary: r.summary,
    occurred_at: r.occurred_at,
    vector: bufferToVector(r.vector, r.dimensions)
  }));
}

function bufferToVector(buf, dims) {
  try {
    // better-sqlite3 returns Buffer; convert to Float32Array and trim to dims
    const view = new Float32Array(buf.buffer, buf.byteOffset || 0, Math.min(buf.length / 4, dims));
    return Array.from(view);
  } catch {
    return null;
  }
}

function buildStats(events) {
  if (!events.length) return { mood: null, energy: null };
  const moodValues = events.map((e) => Number(e.mood_score)).filter((n) => Number.isFinite(n));
  const energyValues = events.map((e) => Number(e.energy_level)).filter((n) => Number.isFinite(n));
  const avgMood = moodValues.length ? Number((moodValues.reduce((a, b) => a + b, 0) / moodValues.length).toFixed(2)) : null;
  const avgEnergy = energyValues.length
    ? Number((energyValues.reduce((a, b) => a + b, 0) / energyValues.length).toFixed(2))
    : null;
  return { mood: avgMood, energy: avgEnergy };
}

function tallyTop(values = [], limit = 5) {
  const counts = new Map();
  for (const list of values) {
    if (!Array.isArray(list)) continue;
    for (const v of list) {
      const key = String(v).trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function averageMetrics(events) {
  const totals = {};
  const counts = {};
  for (const e of events) {
    if (!e.metrics || typeof e.metrics !== 'object') continue;
    for (const [k, v] of Object.entries(e.metrics)) {
      const num = Number(v);
      if (!Number.isFinite(num)) continue;
      totals[k] = (totals[k] || 0) + num;
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  const result = [];
  for (const key of Object.keys(totals)) {
    const avg = totals[key] / counts[key];
    result.push({ key, avg: Number(avg.toFixed(2)), samples: counts[key] });
  }
  return result.sort((a, b) => b.samples - a.samples);
}

function coOccurrenceStats(events) {
  const overall = buildStats(events);
  const buildAverages = (key) => {
    const map = new Map();
    for (const e of events) {
      const list = e[key];
      if (!Array.isArray(list) || !list.length) continue;
      for (const val of list) {
        const k = String(val).trim();
        if (!k) continue;
        if (!map.has(k)) map.set(k, { mood: [], energy: [], count: 0 });
        const entry = map.get(k);
        if (Number.isFinite(e.mood_score)) entry.mood.push(Number(e.mood_score));
        if (Number.isFinite(e.energy_level)) entry.energy.push(Number(e.energy_level));
        entry.count += 1;
      }
    }
    return Array.from(map.entries()).map(([value, vals]) => ({
      value,
      count: vals.count,
      mood_avg: vals.mood.length ? Number((vals.mood.reduce((a, b) => a + b, 0) / vals.mood.length).toFixed(2)) : null,
      energy_avg: vals.energy.length ? Number((vals.energy.reduce((a, b) => a + b, 0) / vals.energy.length).toFixed(2)) : null,
      mood_delta: vals.mood.length && Number.isFinite(overall.mood) ? Number(((vals.mood.reduce((a, b) => a + b, 0) / vals.mood.length) - overall.mood).toFixed(2)) : null,
      energy_delta: vals.energy.length && Number.isFinite(overall.energy) ? Number(((vals.energy.reduce((a, b) => a + b, 0) / vals.energy.length) - overall.energy).toFixed(2)) : null
    })).sort((a, b) => b.count - a.count);
  };

  return {
    people: buildAverages('people').slice(0, 5),
    activities: buildAverages('activities').slice(0, 5),
    tags: buildAverages('tags').slice(0, 5)
  };
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function clusterSimilarEmbeddings(items, threshold = 0.7, maxGroups = 5) {
  const remaining = items.filter((it) => Array.isArray(it.vector));
  const groups = [];
  while (remaining.length && groups.length < maxGroups) {
    const seed = remaining.shift();
    const group = [seed];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const sim = cosine(seed.vector, remaining[i].vector);
      if (sim >= threshold) {
        group.push(remaining[i]);
        remaining.splice(i, 1);
      }
    }
    groups.push(group);
  }
  return groups.map((g) => ({
    event_ids: g.map((x) => x.id),
    sample_summaries: g.slice(0, 3).map((x) => x.summary || ''),
    size: g.length
  }));
}

function computeDailyCurves(events) {
  const byDay = new Map();
  for (const e of events) {
    const day = new Date(e.occurred_at).toISOString().slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, { mood: [], energy: [] });
    }
    const entry = byDay.get(day);
    if (Number.isFinite(e.mood_score)) entry.mood.push(Number(e.mood_score));
    if (Number.isFinite(e.energy_level)) entry.energy.push(Number(e.energy_level));
  }
  const moodPoints = [];
  const energyPoints = [];
  for (const [day, vals] of byDay.entries()) {
    if (vals.mood.length) {
      const avg = vals.mood.reduce((a, b) => a + b, 0) / vals.mood.length;
      moodPoints.push({ date: day, value: Number(avg.toFixed(2)) });
    }
    if (vals.energy.length) {
      const avg = vals.energy.reduce((a, b) => a + b, 0) / vals.energy.length;
      energyPoints.push({ date: day, value: Number(avg.toFixed(2)) });
    }
  }
  moodPoints.sort((a, b) => a.date.localeCompare(b.date));
  energyPoints.sort((a, b) => a.date.localeCompare(b.date));
  const stats = buildStats(events);
  return {
    mood_curve: { average: stats.mood, points: moodPoints },
    energy_curve: { average: stats.energy, points: energyPoints }
  };
}

function computeTimeHeatmap(events) {
  const buckets = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts = new Array(7).fill(0);
  for (const e of events) {
    if (!e.occurred_at) continue;
    const d = new Date(e.occurred_at);
    if (Number.isNaN(d.getTime())) continue;
    counts[d.getDay()] += 1;
  }
  return counts
    .map((count, idx) => ({ bucket: buckets[idx], count }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
}

function buildSocialGraph(events) {
  const map = new Map();
  for (const e of events) {
    if (!Array.isArray(e.people)) continue;
    for (const person of e.people) {
      const key = String(person).trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, { person: key, mentions: 0 });
      map.get(key).mentions += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.mentions - a.mentions);
}

function buildLongArcStatement(curves, rangeStart, rangeEnd) {
  const mood = curves?.mood_curve?.average;
  const energy = curves?.energy_curve?.average;
  if (!Number.isFinite(mood) && !Number.isFinite(energy)) return null;
  const parts = [];
  if (Number.isFinite(mood)) parts.push(`avg mood ${mood}`);
  if (Number.isFinite(energy)) parts.push(`avg energy ${energy}`);
  return `Window ${rangeStart} → ${rangeEnd}: ${parts.join(', ')}`;
}

function buildPrompt({ events, rangeStart, rangeEnd, depth, similarityGroups, coOccur }) {
  const stats = buildStats(events);
  const topPeople = tallyTop(events.map((e) => e.people));
  const topActivities = tallyTop(events.map((e) => e.activities));
  const topTags = tallyTop(events.map((e) => e.tags));
  const metricAvgs = averageMetrics(events);
  const context = {
    window: { start: rangeStart, end: rangeEnd, depth, count: events.length, avg_mood: stats.mood, avg_energy: stats.energy },
    top_people: topPeople,
    top_activities: topActivities,
    top_tags: topTags,
    metrics: metricAvgs,
    co_occurrence: coOccur,
    similarity_groups: similarityGroups,
    events: events.map((e) => ({
      id: e.id,
      date: e.occurred_at,
      summary: e.summary || e.raw_text?.slice(0, 200) || '',
      mood: Number.isFinite(e.mood_score) ? e.mood_score : null,
      energy: Number.isFinite(e.energy_level) ? e.energy_level : null,
      people: e.people || [],
      activities: e.activities || [],
      tags: e.tags || [],
      metrics: e.metrics || {}
    }))
  };

  return [
    `You are Baymax, a neutral pattern mirror. Never advise or moralize. Report observations only.`,
    `Analyze structured JSON for ${rangeStart} to ${rangeEnd}. Depth: ${depth}.`,
    `Output JSON ONLY with keys:`,
    `summary (string),`,
    `patterns (array of { statement: string, confidence: number 0-1, type: "correlation"|"trend"|"repetition"|"anomaly"|string, evidence_event_ids: number[], insight?: string, data?: any }),`,
    `insights (short neutral paragraph),`,
    `social_graph (array of { person: string, mentions: number }),`,
    `time_spent_heatmap (array of { bucket: string, count: number }),`,
    `long_term_arcs (array of strings capturing multi-week/month arcs),`,
    `goal_progress (array of { metric: string, summary: string }),`,
    `identity_patterns (array of strings representing recurring self themes).`,
    `Constraints: neutral tone, no advice, include confidence for each pattern, use only event ids from input as evidence_event_ids.`,
    `Similarity groups derive from embeddings; use them to surface recurring themes.`,
    `If unsure, return an empty patterns array.`,
    `Input JSON:`,
    JSON.stringify(context, null, 2)
  ].join('\n');
}

async function generatePatterns({ rangeStart, rangeEnd, depth = 'standard' }) {
  const events = fetchEventsInRange(rangeStart, rangeEnd);
  const curves = computeDailyCurves(events);
  const embeddings = fetchEmbeddings(rangeStart, rangeEnd);
  const similarityGroups = embeddings.length ? clusterSimilarEmbeddings(embeddings) : [];
  const coOccur = coOccurrenceStats(events);
  const metricAvgs = averageMetrics(events);
  const timeHeatmap = computeTimeHeatmap(events);
  const socialGraph = buildSocialGraph(events);
  const prompt = buildPrompt({ events, rangeStart, rangeEnd, depth, similarityGroups, coOccur });
  const raw = await callGemini({ prompt });
  const extracted = extractJson(raw);
  let parsed = extracted;
  if (!parsed) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    parsed = {
      summary: raw,
      patterns: [],
      insights: raw,
      social_graph: [],
      time_spent_heatmap: [],
      long_term_arcs: [],
      goal_progress: [],
      identity_patterns: []
    };
  }

  const patterns = Array.isArray(parsed.patterns)
    ? parsed.patterns.map((p) => ({
        statement: typeof p.statement === 'string' && p.statement.trim() ? p.statement.trim() : p.title || '',
        confidence: Number.isFinite(p.confidence) ? Math.max(0, Math.min(1, Number(p.confidence))) : null,
        type: p.type || 'observation',
        evidence_event_ids: Array.isArray(p.evidence_event_ids)
          ? p.evidence_event_ids.map((id) => Number(id)).filter((n) => Number.isInteger(n))
          : [],
        insight: typeof p.insight === 'string' ? p.insight : null,
        data: p.data
      }))
    : [];

  const socialGraphParsed = Array.isArray(parsed.social_graph) ? parsed.social_graph : [];
  const timeHeatmapParsed = Array.isArray(parsed.time_spent_heatmap) ? parsed.time_spent_heatmap : [];
  const longArcs = Array.isArray(parsed.long_term_arcs) ? parsed.long_term_arcs : [];
  const goalProgress = Array.isArray(parsed.goal_progress) ? parsed.goal_progress : [];
  const identityPatterns = Array.isArray(parsed.identity_patterns) ? parsed.identity_patterns : [];

  if (socialGraph.length && !socialGraphParsed.length) {
    socialGraphParsed.push(...socialGraph);
  }
  if (timeHeatmap.length && !timeHeatmapParsed.length) {
    timeHeatmapParsed.push(...timeHeatmap);
  }
  if (!goalProgress.length && metricAvgs.length) {
    goalProgress.push(
      ...metricAvgs.slice(0, 3).map((m) => ({
        metric: m.key,
        summary: `avg ${m.avg} over ${m.samples} samples`
      }))
    );
  }

  if (socialGraphParsed.length) {
    patterns.push({
      statement: `Social interactions center around ${socialGraphParsed.slice(0, 3).map((n) => n.person).join(', ')}`,
      confidence: 0.6,
      type: 'social_graph',
      evidence_event_ids: [],
      data: { nodes: socialGraphParsed }
    });
  }

  if (timeHeatmapParsed.length) {
    patterns.push({
      statement: `Time-spent heatmap peaks on ${timeHeatmapParsed.slice(0, 2).map((b) => b.bucket).join(', ')}`,
      confidence: 0.6,
      type: 'time_heatmap',
      evidence_event_ids: [],
      data: { buckets: timeHeatmapParsed }
    });
  }

  const longArcStatement = buildLongArcStatement(curves, rangeStart, rangeEnd) || (longArcs[0] || null);
  if (longArcStatement) {
    patterns.push({
      statement: longArcStatement,
      confidence: 0.55,
      type: 'long_arc',
      evidence_event_ids: []
    });
  }

  if (goalProgress.length) {
    patterns.push({
      statement: `Goal/metric signals: ${goalProgress.slice(0, 2).map((g) => `${g.metric || 'metric'} (${g.summary || 'trend'})`).join('; ')}`,
      confidence: 0.55,
      type: 'goal_progress',
      evidence_event_ids: [],
      data: { goal_progress: goalProgress }
    });
  }

  if (identityPatterns.length) {
    patterns.push({
      statement: identityPatterns[0],
      confidence: 0.55,
      type: 'identity_pattern',
      evidence_event_ids: []
    });
  }

  const evidenceIds = Array.from(
    new Set(
      patterns.flatMap((p) => p.evidence_event_ids || [])
    )
  );
  if (!evidenceIds.length) {
    // Fallback: take up to 3 most recent events as evidence to anchor reflections.
    const recent = events.slice(-3).map((e) => e.id).filter((id) => id !== undefined && id !== null);
    evidenceIds.push(...recent);
  }

  return {
    summary: parsed.summary || raw,
    mood_curve: curves.mood_curve,
    energy_curve: curves.energy_curve,
    patterns,
    insights: parsed.insights || parsed.summary || raw,
    social_graph: socialGraphParsed,
    time_spent_heatmap: timeHeatmapParsed,
    long_term_arcs: longArcs,
    goal_progress: goalProgress,
    identity_patterns: identityPatterns,
    events,
    evidence_event_ids: evidenceIds
  };
}

module.exports = {
  generatePatterns
};
