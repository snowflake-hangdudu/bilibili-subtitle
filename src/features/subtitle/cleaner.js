import { normalizeCueText } from '../../shared/text.js';

const SHORT_TEXT_LIMIT = 18;
const MERGE_GAP_MS = 800;

function sameText(a, b) {
  return normalizeCueText(a) === normalizeCueText(b);
}

export function cleanCues(cues, options = {}) {
  const mergeShortLines = options.mergeShortLines !== false;
  const source = Array.isArray(cues) ? cues : [];
  const prepared = [];

  for (const cue of source) {
    const text = normalizeCueText(cue?.text ?? cue?.rawText ?? '');
    if (!text) continue;
    prepared.push({
      startMs: Math.max(0, Number(cue.startMs) || 0),
      endMs: Math.max(Number(cue.startMs) || 0, Number(cue.endMs) || 0),
      text,
      rawText: String(cue.rawText ?? cue.text ?? '')
    });
  }

  prepared.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged = [];
  for (const cue of prepared) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push({ ...cue });
      continue;
    }

    const gap = cue.startMs - prev.endMs;
    const duplicate = sameText(prev.text, cue.text) && gap <= 1500;
    const shortJoin = mergeShortLines
      && gap >= 0
      && prev.text.length <= SHORT_TEXT_LIMIT
      && !/[。！？!?；;]$/.test(prev.text)
      && gap <= MERGE_GAP_MS
      && cue.text.length <= 40;

    if (duplicate) {
      prev.endMs = Math.max(prev.endMs, cue.endMs);
      if (cue.rawText && cue.rawText !== prev.rawText) {
        prev.rawText = `${prev.rawText}\n${cue.rawText}`;
      }
      continue;
    }

    if (shortJoin) {
      prev.text = normalizeCueText(`${prev.text} ${cue.text}`);
      prev.endMs = Math.max(prev.endMs, cue.endMs);
      prev.rawText = `${prev.rawText}\n${cue.rawText}`;
      continue;
    }

    merged.push({ ...cue });
  }

  return merged.map((cue, index) => ({ ...cue, index }));
}
