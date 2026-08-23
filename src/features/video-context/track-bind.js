export function normalizeTrackUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const abs = raw.startsWith('//') ? `https:${raw}` : raw;
    const parsed = new URL(abs);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return raw.split('?')[0];
  }
}

export function cueSignature(cues) {
  if (!Array.isArray(cues) || !cues.length) return '';
  const texts = cues.map((cue) => String(cue.text || '').trim()).filter(Boolean);
  const lastMs = cues.reduce((max, cue) => Math.max(max, Number(cue.endMs || cue.startMs) || 0), 0);
  return [
    cues.length,
    lastMs,
    texts[0] || '',
    texts[Math.floor(texts.length / 2)] || '',
    texts[texts.length - 1] || ''
  ].join('|');
}

export function aiSubtitleUrlMatches(url, context = {}) {
  const abs = normalizeTrackUrl(url);
  const digits = abs.match(/\/ai_subtitle\/prod\/(\d+)/i)?.[1] || '';
  if (!digits) return true;
  const aid = String(context.aid || '');
  const cid = String(context.cid || '');
  if (!aid || !cid) return true;
  return digits.startsWith(`${aid}${cid}`);
}

export function trackConflictsWithIndex(track, context, index = {}) {
  const url = normalizeTrackUrl(track?.url);
  if (!url) return false;
  const known = index[url];
  if (!known?.bvid || !context?.bvid) return false;
  return String(known.bvid).toLowerCase() !== String(context.bvid).toLowerCase();
}

export function isCarryOverExtract(extracted, previous) {
  if (!extracted?.cues?.length || !previous?.cues?.length) return false;
  const prevBvid = String(previous.video?.bvid || '').toLowerCase();
  const nextBvid = String(extracted.video?.bvid || '').toLowerCase();
  if (!prevBvid || !nextBvid) return false;
  const sameVideo = prevBvid === nextBvid
    && Number(previous.video?.cid || 0) === Number(extracted.video?.cid || 0);
  if (sameVideo) return false;
  const prevUrl = normalizeTrackUrl(previous.track?.url);
  const nextUrl = normalizeTrackUrl(extracted.track?.url);
  if (prevUrl && nextUrl && prevUrl === nextUrl) return true;
  return cueSignature(previous.cues) === cueSignature(extracted.cues);
}

export function rememberTracksInIndex(index, context, tracks) {
  const next = { ...index };
  const bvid = String(context?.bvid || '');
  if (!bvid) return next;
  const now = Date.now();
  for (const track of tracks || []) {
    const url = normalizeTrackUrl(track?.url);
    if (!url) continue;
    if (!aiSubtitleUrlMatches(url, context)) continue;
    const existing = next[url];
    if (existing?.bvid && String(existing.bvid).toLowerCase() !== bvid.toLowerCase()) continue;
    next[url] = { bvid, cid: Number(context.cid) || 0, at: now };
  }
  const entries = Object.entries(next);
  if (entries.length > 80) {
    entries.sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    for (const [url] of entries.slice(0, entries.length - 80)) delete next[url];
  }
  return next;
}
