import { cleanCues } from '../subtitle/cleaner.js';
import { parseSubtitleTree } from '../subtitle/parser.js';
import { createAppError, ErrorCode } from '../../shared/errors.js';
import {
  classifyPlayerError,
  contextFromViewPayload,
  durationFromPlayerData,
  playerApiUrl,
  playerPayloadMatches,
  tracksFromPlayerPayload,
  viewApiUrl
} from '../../platform/bilibili/adapter.js';
import { isBilibiliVideoPage, parseVideoId } from '../../platform/bilibili/ids.js';
import { contextMatchesHref, cueSpanSec, cuesMatchVideo, reconcileContext } from './detect.js';
import { aiSubtitleUrlMatches, isCarryOverExtract, trackConflictsWithIndex } from './track-bind.js';

function shortUrl(value) {
  try {
    const url = new URL(String(value || ''), 'https://www.bilibili.com');
    return `${url.hostname}${url.pathname}`.slice(0, 96);
  } catch {
    return String(value || '').slice(0, 96);
  }
}

export function playerApiCandidates(context) {
  const v2 = playerApiUrl(context);
  return [v2, v2.replace('/x/player/v2?', '/x/player/wbi/v2?')];
}

export async function identifyByHref(href, fetchJson, { log } = {}) {
  const note = typeof log === 'function' ? log : () => {};
  if (!isBilibiliVideoPage(href)) throw createAppError(ErrorCode.NOT_VIDEO_PAGE, { detail: href });
  const id = parseVideoId(href);
  if (!id) throw createAppError(ErrorCode.NO_CONTEXT, { detail: `no-id:${href}` });
  note(`page ${href}`);
  note(`id ${id.kind}=${id.value}`);

  const view = await fetchJson(viewApiUrl(id));
  if (view && typeof view === 'object' && Number(view.code) && Number(view.code) !== 0) {
    throw createAppError(ErrorCode.FETCH_FAILED, { detail: `view:${view.code}:${view.message || ''}` });
  }

  const context = reconcileContext(href, contextFromViewPayload(view, href));
  note(`view ${context.bvid || context.aid} cid=${context.cid} duration=${context.durationSec || 0}s title=${context.title || ''}`);
  if (!context.bvid && !context.aid) {
    throw createAppError(ErrorCode.NO_CONTEXT, { detail: `view-empty:${id.kind}=${id.value}` });
  }
  if (!context.cid) {
    throw createAppError(ErrorCode.NO_CONTEXT, { detail: `no-cid:${context.bvid || context.aid}` });
  }

  let tracks = [];
  let loginHint = false;
  let playerCode = 0;
  for (const url of playerApiCandidates(context)) {
    const payload = await fetchJson(url);
    playerCode = Number(payload?.code) || 0;
    const data = payload?.data || {};
    const found = tracksFromPlayerPayload(payload);
    const matched = found.length && playerPayloadMatches(context, payload);
    note(`player ${shortUrl(url)} code=${playerCode} cid=${data.cid || 0} bvid=${data.bvid || ''} tracks=${found.length} match=${Boolean(matched)}`);
    const classified = classifyPlayerError(payload);
    if (classified?.code === ErrorCode.LOGIN_REQUIRED) loginHint = true;
    if (matched) {
      tracks = found;
      const playerDuration = durationFromPlayerData(data);
      if (playerDuration) context.durationSec = playerDuration;
      break;
    }
  }

  if (loginHint && !tracks.length) throw createAppError(ErrorCode.LOGIN_REQUIRED, { detail: `player:${playerCode}` });
  const trusted = tracks.filter((track) => {
    const ok = aiSubtitleUrlMatches(track.url, context);
    if (!ok) note(`drop foreign ${shortUrl(track.url)}`);
    return ok;
  });
  tracks = trusted;
  note(`tracks ${tracks.map((item) => `${item.label}:${shortUrl(item.url)}`).join(' | ') || 'none'}`);

  return {
    context,
    tracks,
    trackCount: tracks.length,
    loginHint,
    source: 'api'
  };
}

async function loadCues(track, fetchJson, mergeShortLines) {
  const payload = await fetchJson(track.url);
  const parsed = await parseSubtitleTree(payload, fetchJson);
  const cues = cleanCues(parsed, { mergeShortLines });
  return { parsed, cues };
}

export async function extractByHref(href, fetchJson, { trackId, mergeShortLines, log, previous, trackIndex } = {}) {
  const note = typeof log === 'function' ? log : () => {};
  const status = await identifyByHref(href, fetchJson, { log: note });
  if (!contextMatchesHref(status.context, href)) {
    throw createAppError(ErrorCode.NO_CONTEXT, { detail: `href-mismatch:${status.context.bvid}` });
  }
  const ordered = [...status.tracks];
  const preferred = ordered.find((item) => item.id === String(trackId));
  if (preferred) {
    ordered.splice(ordered.indexOf(preferred), 1);
    ordered.unshift(preferred);
  }

  let lastEmpty = false;
  for (const track of ordered) {
    if (!track.url) continue;
    if (!aiSubtitleUrlMatches(track.url, status.context) || trackConflictsWithIndex(track, status.context, trackIndex)) {
      note(`skip leftover ${shortUrl(track.url)}`);
      continue;
    }
    note(`fetch ${track.label} ${shortUrl(track.url)}`);
    const { parsed, cues } = await loadCues(track, fetchJson, mergeShortLines);
    const span = cueSpanSec(cues);
    const ok = cuesMatchVideo(cues, status.context.durationSec);
    note(`cues ${cues.length}/${parsed.length} span=${Math.round(span)}s video=${status.context.durationSec || 0}s match=${ok}`);
    if (!cues.length) {
      lastEmpty = true;
      continue;
    }
    if (!ok) continue;
    const extracted = {
      video: status.context,
      track,
      tracks: status.tracks,
      cues,
      rawCueCount: parsed.length,
      extractedAt: Date.now(),
      source: 'api',
      mismatch: false
    };
    if (isCarryOverExtract(extracted, previous)) {
      note(`skip carry-over ${shortUrl(track.url)}`);
      continue;
    }
    return extracted;
  }

  if (lastEmpty && !status.tracks.length) throw createAppError(ErrorCode.EMPTY_AFTER_CLEAN);
  if (!status.tracks.length) throw createAppError(status.loginHint ? ErrorCode.LOGIN_REQUIRED : ErrorCode.NO_SUBTITLE);
  throw createAppError(ErrorCode.NO_SUBTITLE, {
    message: '字幕和当前视频对不上，已丢弃。请换一条轨道或刷新后重试。'
  });
}
