const SENTENCE_END = /[。！？!?；;]$/;

export function isParagraphBreak(prev, next, options = {}) {
  if (!prev || !next) return false;
  const pauseMs = options.pauseMs ?? 1800;
  const afterSentenceMs = options.afterSentenceMs ?? 450;
  const gap = Number(next.startMs) - Number(prev.endMs || prev.startMs);
  if (gap >= pauseMs) return true;
  if (SENTENCE_END.test(String(prev.text || '').trim()) && gap >= afterSentenceMs) return true;
  return false;
}

export function groupCues(cues, options = {}) {
  const source = Array.isArray(cues) ? cues : [];
  const groups = [];
  let current = [];
  for (const cue of source) {
    const prev = current[current.length - 1];
    if (prev && isParagraphBreak(prev, cue, options)) {
      groups.push(current);
      current = [];
    }
    current.push(cue);
  }
  if (current.length) groups.push(current);
  return groups;
}
