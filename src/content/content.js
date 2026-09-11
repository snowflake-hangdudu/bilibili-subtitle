import { parseSubtitleTree } from '../features/subtitle/parser.js';
import { cleanCues } from '../features/subtitle/cleaner.js';
import { createAppError, ErrorCode, toErrorPayload } from '../shared/errors.js';
import { isBilibiliVideoPage } from '../platform/bilibili/ids.js';
import { tracksFromPlayerPayload } from '../platform/bilibili/adapter.js';
import { cuesMatchVideo, reconcileContext } from '../features/video-context/detect.js';
import { aiSubtitleUrlMatches } from '../features/video-context/track-bind.js';
const AGENT = 'bsh-agent';
const CONTENT = 'bsh-content';
const pending = new Map();

function callAgent(type, args = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const id = `bsh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(createAppError(ErrorCode.FETCH_FAILED, { detail: `agent-timeout:${type}` }));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    window.postMessage({ source: CONTENT, id, type, args }, '*');
  });
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.source !== AGENT || event.source !== window) return;
  if (data.type === 'VIDEO_CHANGED') {
    chrome.runtime.sendMessage({ type: 'VIDEO_CHANGED', context: data.context }).catch(() => {});
    return;
  }
  if (!data.id || !pending.has(data.id)) return;
  const item = pending.get(data.id);
  pending.delete(data.id);
  clearTimeout(item.timer);
  if (data.ok) item.resolve(data.result);
  else item.reject(createAppError(ErrorCode.FETCH_FAILED, { detail: data.error }));
});

function normalizeTracks(rawTracks) {
  if (Array.isArray(rawTracks) && rawTracks[0] && rawTracks[0].label) return rawTracks;
  return tracksFromPlayerPayload({ data: { subtitle: { subtitles: rawTracks || [] } } });
}

async function getStatus() {
  if (!isBilibiliVideoPage(location.href)) {
    throw createAppError(ErrorCode.NOT_VIDEO_PAGE);
  }
  let result = await callAgent('LIST_TRACKS');
  let context = reconcileContext(location.href, result.context || {});
  if (context.staleState) {
    result = await callAgent('LIST_TRACKS', { context });
    context = reconcileContext(location.href, result.context || context);
  }
  if (!context?.bvid && !context?.aid) throw createAppError(ErrorCode.NO_CONTEXT);
  const tracks = normalizeTracks(result.tracks)
    .filter((track) => track.url)
    .filter((track) => aiSubtitleUrlMatches(track.url, context));
  if ((result.loginHint || result.needLoginSubtitle) && !tracks.length) {
    throw createAppError(ErrorCode.LOGIN_REQUIRED, {
      message: '该视频的字幕需要登录 B 站后才能读取，请先登录并刷新页面。'
    });
  }
  return {
    context,
    tracks,
    trackCount: tracks.length,
    loginHint: Boolean(result.loginHint),
    steps: Array.isArray(result.steps) ? result.steps : []
  };
}

async function fetchTrackCues(track, mergeShortLines) {
  let payload;
  try {
    const result = await callAgent('FETCH_SUBTITLE', { url: track.url }, 20000);
    payload = result.payload;
  } catch (error) {
    const fallback = await chrome.runtime.sendMessage({ type: 'FETCH_URL', url: track.url });
    if (!fallback?.ok) {
      throw createAppError(ErrorCode.FETCH_FAILED, { detail: fallback?.error || error.message });
    }
    payload = fallback.payload;
  }
  const parsed = await parseSubtitleTree(payload, async (url) => {
    const result = await callAgent('FETCH_SUBTITLE', { url }, 20000);
    return result.payload;
  });
  return {
    parsed,
    cues: cleanCues(parsed, { mergeShortLines })
  };
}

async function extractSubtitle({ trackId, mergeShortLines }) {
  const status = await getStatus();
  const ordered = [...status.tracks];
  const preferred = ordered.find((item) => item.id === String(trackId));
  if (preferred) {
    ordered.splice(ordered.indexOf(preferred), 1);
    ordered.unshift(preferred);
  }
  if (!ordered.length) throw createAppError(ErrorCode.NO_SUBTITLE);

  for (const track of ordered) {
    if (!track.url) continue;
    try {
      const { parsed, cues } = await fetchTrackCues(track, mergeShortLines);
      if (!cues.length) continue;
      if (!cuesMatchVideo(cues, status.context?.durationSec, { requireCoverage: true })) continue;
      return {
        video: status.context,
        track,
        tracks: status.tracks,
        cues,
        rawCueCount: parsed.length,
        extractedAt: Date.now()
      };
    } catch {
      // 换下一条轨道
    }
  }

  throw createAppError(ErrorCode.NO_SUBTITLE, {
    message: '页面轨道与当前视频对不上，已换源。'
  });
}

console.info('[BSH] content ready', location.href);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    if (message?.type === 'PING') return { ok: true, href: location.href };
    if (message?.type === 'GET_STATUS') return { ok: true, ...(await getStatus()) };
    if (message?.type === 'EXTRACT') return { ok: true, result: await extractSubtitle(message) };
    if (message?.type === 'SEEK_VIDEO') {
      const result = await callAgent('SEEK_VIDEO', { startMs: message.startMs }, 5000);
      const status = await getStatus().catch(() => null);
      const expected = message.fingerprint;
      if (expected && status?.context?.fingerprint && status.context.fingerprint !== expected) {
        throw createAppError(ErrorCode.NO_CONTEXT, { message: '视频已切换，无法跳转到原字幕时间。' });
      }
      return { ok: true, result };
    }
    return { ok: false, error: toErrorPayload(createAppError(ErrorCode.FETCH_FAILED, { message: '未知请求' })) };
  };
  run().then(sendResponse).catch((error) => sendResponse({ ok: false, error: toErrorPayload(error) }));
  return true;
});
