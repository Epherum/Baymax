const {
  SUMMARY_SYSTEM_INSTRUCTION,
  CAPTURE_METADATA_SYSTEM_INSTRUCTION,
  buildSummaryPrompt,
  buildCaptureMetadataPrompt
} = require('../prompts');

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
  const prompt = buildSummaryPrompt(text);
  return callGemini({ prompt, systemInstruction: SUMMARY_SYSTEM_INSTRUCTION });
}

async function generateCaptureMetadata(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text is required for capture metadata');
  }
  const prompt = buildCaptureMetadataPrompt(text);
  return callGemini({ prompt, systemInstruction: CAPTURE_METADATA_SYSTEM_INSTRUCTION });
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
