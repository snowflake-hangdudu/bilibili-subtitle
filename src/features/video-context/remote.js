import { cleanCues } from '../subtitle/cleaner.js';
import { parseSubtitleTree } from '../subtitle/parser.js';
import { createAppError, ErrorCode } from '../../shared/errors.js';
import {
  classifyPlayerError,
  contextFromViewPayload,
  playerApiUrl,
  tracksFromPlayerPayload,
  viewApiUrl
} from '../../platform/bilibili/adapter.js';
import { isBilibiliVideoPage, parseVideoId } from '../../platform/bilibili/ids.js';
import { reconcileContext } from './detect.js';

export function playerApiCandidates(context) {
  const v2 = playerApiUrl(context);
  return [v2, v2.replace('/x/player/v2?', '/x/player/wbi/v2?')];
}

export async function identifyByHref(href, fetchJson) {
  if (!isBilibiliVideoPage(href)) throw createAppError(ErrorCode.NOT_VIDEO_PAGE, { detail: href });
  const id = parseVideoId(href);
  if (!id) throw createAppError(ErrorCode.NO_CONTEXT, { detail: `no-id:${href}` });

  const view = await fetchJson(viewApiUrl(id));
  if (view && typeof view === 'object' && Number(view.code) && Number(view.code) !== 0) {
    throw createAppError(ErrorCode.FETCH_FAILED, { detail: `view:${view.code}:${view.message || ''}` });
  }

  const context = reconcileContext(href, contextFromViewPayload(view, href));
  if (!context.bvid && !context.aid) {
    throw createAppError(ErrorCode.NO_CONTEXT, { detail: `view-empty:${id.kind}=${id.value}` });
  }

  let tracks = [];
  let loginHint = false;
  let playerCode = 0;
  for (const url of playerApiCandidates(context)) {
    const payload = await fetchJson(url);
    playerCode = Number(payload?.code) || 0;
    const classified = classifyPlayerError(payload);
    if (classified?.code === ErrorCode.LOGIN_REQUIRED) loginHint = true;
    const found = tracksFromPlayerPayload(payload);
    if (found.length) {
      tracks = found;
      break;
    }
  }

  if (loginHint && !tracks.length) throw createAppError(ErrorCode.LOGIN_REQUIRED, { detail: `player:${playerCode}` });

  return {
    context,
    tracks,
    trackCount: tracks.length,
    loginHint,
    source: 'api'
  };
}

export async function extractByHref(href, fetchJson, { trackId, mergeShortLines } = {}) {
  const status = await identifyByHref(href, fetchJson);
  const track = status.tracks.find((item) => item.id === String(trackId)) || status.tracks[0];
  if (!track) throw createAppError(ErrorCode.NO_SUBTITLE);
  if (!track.url) {
    throw createAppError(status.loginHint ? ErrorCode.LOGIN_REQUIRED : ErrorCode.NO_SUBTITLE);
  }
  const payload = await fetchJson(track.url);
  const parsed = await parseSubtitleTree(payload, fetchJson);
  const cues = cleanCues(parsed, { mergeShortLines });
  if (!cues.length) throw createAppError(ErrorCode.EMPTY_AFTER_CLEAN);
  return {
    video: status.context,
    track,
    tracks: status.tracks,
    cues,
    rawCueCount: parsed.length,
    extractedAt: Date.now(),
    source: 'api'
  };
}
