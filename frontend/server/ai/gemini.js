const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const DEFAULT_SUMMARY_INSTRUCTIONS =
  'Summarize the user-provided journal text in 2-4 neutral sentences. Avoid advice or moral judgments. Focus on key events, feelings, and context. Output plain text only.';
const CAPTURE_METADATA_INSTRUCTIONS = `
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

function getApiKey() {
  return process.env.Gemini_API || process.env.GEMINI_API || process.env.GEMINI_API_KEY || '';
}

async function callGemini({ prompt, systemInstruction }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured (expected GEMINI_API or Gemini_API).');
  }

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      ...(systemInstruction
        ? {
          systemInstruction: {
            role: 'system',
            parts: [{ text: systemInstruction }]
          }
        }
        : {}),
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const candidates = data?.candidates ?? [];
  const output = candidates[0]?.content?.parts?.[0]?.text;
  if (!output) {
    throw new Error('Gemini returned no content');
  }
  return output.trim();
}

async function generateSummary(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text is required for summary generation');
  }
  const prompt = `Text:\n${text.slice(0, 6000)}\n\nReturn a concise neutral summary.`;
  return callGemini({ prompt, systemInstruction: DEFAULT_SUMMARY_INSTRUCTIONS });
}

async function generateCaptureMetadata(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text is required for capture metadata');
  }
  const prompt = `Text:\n${text.slice(0, 6000)}\n\nExtract summary, mood_score, energy_level, importance, location, tags, people, activities, emotions, metrics. Return JSON only.`;
  return callGemini({ prompt, systemInstruction: CAPTURE_METADATA_INSTRUCTIONS });
}

function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const fenced = text.match(/```(?:json)?\\s*([\\s\\S]*?)\\s*```/i);
  const candidate = fenced ? fenced[1] : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const slice = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

module.exports = {
  generateSummary,
  generateCaptureMetadata,
  callGemini,
  extractJson
};
