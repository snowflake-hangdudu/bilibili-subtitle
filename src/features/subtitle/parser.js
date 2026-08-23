import { secondsToMs } from '../../shared/time.js';
import { normalizeCueText } from '../../shared/text.js';
import { createAppError, ErrorCode } from '../../shared/errors.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readNumber(...values) {
  for (const value of values) {
    if (typeof value === 'string' && /:/.test(value)) continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseClockToMs(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const ms = Number(String(match[4] || '0').padEnd(3, '0'));
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
}

function coerceToMs(value, fieldHint = '') {
  const clock = parseClockToMs(value);
  if (clock != null) return clock;
  const n = readNumber(value);
  if (n == null) return null;
  if (/ms|_ms|start_time|end_time/i.test(fieldHint) && n >= 1000) return Math.round(n);
  if (Number.isInteger(n) && Math.abs(n) >= 10000) return Math.round(n);
  return secondsToMs(n);
}

function textFromItem(item) {
  const direct = item.content ?? item.text ?? item.line ?? item.subtitle ?? '';
  if (typeof direct === 'string' && normalizeCueText(direct)) return String(direct);
  if (typeof item.body === 'string' && normalizeCueText(item.body)) return item.body;
  const words = item.words || item.chars || item.tokens;
  if (Array.isArray(words) && words.length) {
    return words.map((word) => {
      if (typeof word === 'string') return word;
      return word?.content ?? word?.text ?? word?.w ?? '';
    }).join('');
  }
  return typeof direct === 'string' ? direct : '';
}

function cueFromUnknown(item, index) {
  if (!item || typeof item !== 'object') return null;

  const start = coerceToMs(item.startMs ?? item.start_ms, 'start_ms')
    ?? coerceToMs(item.from, 'from')
    ?? coerceToMs(item.start, 'start')
    ?? coerceToMs(item.start_time, 'start_time')
    ?? coerceToMs(item.startTime, 'startTime')
    ?? coerceToMs(item.begin, 'begin')
    ?? coerceToMs(item.s, 's');
  let end = coerceToMs(item.endMs ?? item.end_ms, 'end_ms')
    ?? coerceToMs(item.to, 'to')
    ?? coerceToMs(item.end, 'end')
    ?? coerceToMs(item.end_time, 'end_time')
    ?? coerceToMs(item.endTime, 'endTime')
    ?? coerceToMs(item.e, 'e');

  const rawText = textFromItem(item);
  if (start == null && end == null && !normalizeCueText(rawText)) return null;

  const startMs = start != null ? Math.max(0, Math.round(start)) : 0;
  let endMs = end != null ? Math.max(0, Math.round(end)) : startMs;
  if (endMs < startMs) endMs = startMs;

  return {
    startMs,
    endMs,
    text: normalizeCueText(rawText),
    rawText: String(rawText || ''),
    index
  };
}

function looksLikeCue(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  return textFromItem(item) !== ''
    || item.from != null
    || item.to != null
    || item.start != null
    || item.start_time != null
    || item.startTime != null
    || item.startMs != null
    || Array.isArray(item.words);
}

function collectCueItems(node, out = [], depth = 0) {
  if (node == null || depth > 7) return out;
  if (Array.isArray(node)) {
    if (node.length && looksLikeCue(node[0])) {
      out.push(...node);
      return out;
    }
    for (const item of node) collectCueItems(item, out, depth + 1);
    return out;
  }
  if (typeof node !== 'object') return out;
  for (const key of ['body', 'data', 'list', 'cues', 'subtitles', 'lines', 'events', 'paragraphs', 'words']) {
    if (node[key] != null) collectCueItems(node[key], out, depth + 1);
  }
  return out;
}

function parseJsonPayload(payload) {
  return collectCueItems(payload).map(cueFromUnknown);
}

function parseSrtPayload(text) {
  const blocks = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n\r?\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length < 2) continue;
    const timeLine = lines.find((line) => line.includes('-->')) || '';
    const match = timeLine.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!match) continue;
    const toMs = (h, m, s, ms) => (((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000) + Number(String(ms).padEnd(3, '0'));
    const body = lines.slice(lines.indexOf(timeLine) + 1).join('\n');
    cues.push({
      startMs: toMs(match[1], match[2], match[3], match[4]),
      endMs: toMs(match[5], match[6], match[7], match[8]),
      text: normalizeCueText(body),
      rawText: body
    });
  }
  return cues;
}

export function listSubtitlePartUrls(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const groups = [payload.segs, payload.fragments, payload.parts, payload.data?.segs, payload.data?.fragments];
  const urls = [];
  for (const group of groups) {
    for (const item of asArray(group)) {
      const url = item?.url || item?.subtitle_url || item?.subtitleUrl;
      if (url) urls.push(url);
    }
  }
  return urls;
}

export async function parseSubtitleTree(payload, fetchJson) {
  const parts = listSubtitlePartUrls(payload);
  if (!parts.length) return parseSubtitlePayload(payload);

  const cues = [];
  for (const url of parts) {
    const abs = String(url).startsWith('//') ? `https:${url}` : url;
    const next = await fetchJson(abs);
    cues.push(...parseSubtitlePayload(next));
  }
  if (!cues.length) {
    throw createAppError(ErrorCode.PARSE_FAILED, { detail: 'empty-segs' });
  }
  return cues;
}

export function parseSubtitlePayload(raw) {
  if (raw == null || raw === '') {
    throw createAppError(ErrorCode.PARSE_FAILED, { detail: 'empty-payload' });
  }

  let cues = [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) throw createAppError(ErrorCode.PARSE_FAILED, { detail: 'blank-string' });
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        cues = parseJsonPayload(JSON.parse(trimmed));
      } catch (error) {
        throw createAppError(ErrorCode.PARSE_FAILED, { detail: String(error.message || error) });
      }
    } else {
      cues = parseSrtPayload(trimmed);
    }
  } else {
    cues = parseJsonPayload(raw);
  }

  const normalized = asArray(cues)
    .filter(Boolean)
    .map((cue, index) => ({
      startMs: Math.max(0, Number(cue.startMs) || 0),
      endMs: Math.max(Number(cue.startMs) || 0, Number(cue.endMs) || 0),
      text: normalizeCueText(cue.text),
      rawText: String(cue.rawText ?? cue.text ?? ''),
      index
    }));

  if (!normalized.length) {
    throw createAppError(ErrorCode.PARSE_FAILED, { detail: 'no-cues' });
  }
  return normalized;
}
