const SUMMARY_SYSTEM_INSTRUCTION =
  'Summarize the journal text in 2-4 neutral sentences. Avoid advice or moral judgments. Focus on key events, feelings, and context. Output plain text only and never refer to “the user” or switch out of the journal voice.';

const CAPTURE_METADATA_SYSTEM_INSTRUCTION = `
You are converting raw journaling text into structured capture metadata.
- Stay neutral and non-judgmental. Do not give advice.
- If a value is unclear, use null.
- Boundaries:
  mood_score: integer between -5 and 5 (negative is worse mood).
  energy_level: integer between 0 and 10.
  importance: integer between 1 and 5 (1=trivial, 5=life-changing).
  location: string (e.g. "Home", "Gym", "Office").
  tags: array of 1-3 short lowercase tags (no spaces; use hyphens if needed).
  people: array of names mentioned (e.g. ["Alex", "Mom"]).
  activities: array of activities (e.g. ["running", "coding"]).
  emotions: array of emotions (e.g. ["happy", "anxious"]).
  metrics: object of numeric key/value pairs when explicit (e.g., "hours_worked": 3.5). Use {} if none.
- Summary: concise, 1-3 sentences, neutral tone.
- Output JSON ONLY with keys: summary, mood_score, energy_level, importance, location, tags, people, activities, emotions, metrics.
Example output:
{"summary":"...","mood_score":1,"energy_level":6,"importance":3,"location":"Home","tags":["sleep","stress"],"people":["Alex"],"activities":["coding"],"emotions":["focused"],"metrics":{"hours_worked":3}}
`;

const ENTITY_CHAT_SYSTEM_INSTRUCTION = 'Be concise, neutral, cite patterns where possible.';
const PILLAR_CHAT_SYSTEM_INSTRUCTION = 'Be concise, grounded in provided events, and focus on alignment vs drift.';
const ACHIEVEMENTS_CHAT_SYSTEM_INSTRUCTION = 'Stay concise, factual, and only use supplied achievements—do not invent details.';

function buildSummaryPrompt(text) {
  return `Text:\n${text.slice(0, 6000)}\n\nReturn a concise neutral summary.`;
}

function buildCaptureMetadataPrompt(text) {
  return `Text:\n${text.slice(0, 6000)}\n\nExtract summary, mood_score, energy_level, importance, location, tags, people, activities, emotions, metrics. Return JSON only.`;
}

function buildEntityChatPrompt({ entityType, entityId, question, contextLines = [] }) {
  return [
    `You are analysing notes about ${entityType} "${entityId}".`,
    `Question: ${question}`,
    `Context (${contextLines.length} captures):`,
    contextLines.join('\n'),
    `Provide a concise, neutral answer. If context is thin, say so.`
  ].join('\n\n');
}

function buildInsightChatPrompt({ reflection, insight, history, userMessage, evidence }) {
  const historyText = history
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.message}`)
    .join('\n');
  const evidenceText = evidence && evidence.length
    ? evidence
      .map((e) => {
        const dateValue = e.occurred_at ? new Date(e.occurred_at) : null;
        const date = dateValue && !Number.isNaN(dateValue.getTime()) ? dateValue.toISOString().slice(0, 10) : 'Unknown date';
        const snippet = e.raw_text ? e.raw_text.slice(0, 240) : '';
        return `- ${date}: ${snippet}`;
      })
      .join('\n')
    : 'No explicit evidence events were provided.';

  return [
    'You are Baymax, a neutral pattern mirror. Do not advise, moralize, or speculate. Stay concise and grounded in provided evidence.',
    `Reflection window: ${reflection.range_start} to ${reflection.range_end} (${reflection.period}).`,
    reflection.summary ? `Reflection summary: ${reflection.summary}` : null,
    `Insight: ${insight.statement}${insight.type ? ` [${insight.type}]` : ''}${Number.isFinite(insight.confidence) ? ` (confidence ${insight.confidence})` : ''}.`,
    insight.insight ? `Context: ${insight.insight}` : null,
    `Evidence snippets:\n${evidenceText}`,
    'Conversation so far:\n' + (historyText || 'No prior messages.'),
    `User: ${userMessage}`,
    'Assistant:'
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildReflectionChatPrompt({ reflection, history, userMessage, events }) {
  const historyText = history
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.message}`)
    .join('\n');
  const evidenceText = Array.isArray(events) && events.length
    ? events
      .map((e) => {
        const dateValue = e.occurred_at ? new Date(e.occurred_at) : null;
        const date = dateValue && !Number.isNaN(dateValue.getTime()) ? dateValue.toISOString().slice(0, 10) : 'Unknown date';
        const snippet = e.raw_text ? e.raw_text.slice(0, 240) : '';
        return `- ${date}: ${snippet}`;
      })
      .join('\n')
    : 'No linked events found for this reflection.';

  const insightLines = Array.isArray(reflection.patterns)
    ? reflection.patterns.map((p, idx) => `• ${p.statement || `Insight ${idx + 1}`}${p.type ? ` [${p.type}]` : ''}${Number.isFinite(p.confidence) ? ` (confidence ${p.confidence})` : ''}`)
    : [];

  return [
    'You are Baymax, a neutral reflection companion. Do not advise, moralize, or speculate. Stay concise and stick to evidence.',
    `Reflection window: ${reflection.range_start} → ${reflection.range_end} (${reflection.period}, depth ${reflection.depth}).`,
    reflection.summary ? `Summary: ${reflection.summary}` : null,
    reflection.insights ? `Overall insight: ${reflection.insights}` : null,
    insightLines.length ? `Insights:\n${insightLines.join('\n')}` : null,
    `Evidence events:\n${evidenceText}`,
    'Conversation so far:\n' + (historyText || 'No prior messages.'),
    `User: ${userMessage}`,
    'Assistant:'
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildPatternPrompt({ rangeStart, rangeEnd, depth, context }) {
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

function buildAchievementsChatPrompt({ question, achievements }) {
  const lines = achievements.map((a) => {
    const date = a.occurred_at ? new Date(a.occurred_at).toISOString().slice(0, 10) : 'Undated';
    const tagText = a.tags && a.tags.length ? ` [${a.tags.join(', ')}]` : '';
    const desc = a.description ? a.description.replace(/\s+/g, ' ').slice(0, 200) : '';
    return `${date} — ${a.title}${tagText}${desc ? ` — ${desc}` : ''}`;
  });

  return [
    'You are helping the user recall their logged achievements (big and small wins).',
    'Use only the provided achievements; do not invent details or dates. If information is missing, say so.',
    `User question: ${question}`,
    lines.length ? `Achievements (${lines.length}):\n${lines.join('\n')}` : 'No achievements logged yet.',
    'Answer concisely and keep to the facts the user logged.'
  ].join('\n\n');
}

function buildPillarChatPrompt({ pillarTitle, pillarDetails, question, contextLines }) {
  return [
    `You are reviewing how the user aligns or strays from the pillar "${pillarTitle}".`,
    `Pillar details: ${pillarDetails || '(no details provided)'}.`,
    `User question: ${question}`,
    contextLines.length
      ? `Recent captures (${contextLines.length}):\n${contextLines.join('\n')}`
      : 'No captures matched this pillar. Be transparent about limited context.',
    `Answer concisely. Highlight alignment vs drift, cite dates/snippets where relevant, stay neutral but actionable. If data is thin, say so.`
  ].join('\n\n');
}

module.exports = {
  SUMMARY_SYSTEM_INSTRUCTION,
  CAPTURE_METADATA_SYSTEM_INSTRUCTION,
  ENTITY_CHAT_SYSTEM_INSTRUCTION,
  PILLAR_CHAT_SYSTEM_INSTRUCTION,
  ACHIEVEMENTS_CHAT_SYSTEM_INSTRUCTION,
  buildSummaryPrompt,
  buildCaptureMetadataPrompt,
  buildEntityChatPrompt,
  buildInsightChatPrompt,
  buildReflectionChatPrompt,
  buildPatternPrompt,
  buildPillarChatPrompt,
  buildAchievementsChatPrompt
};
