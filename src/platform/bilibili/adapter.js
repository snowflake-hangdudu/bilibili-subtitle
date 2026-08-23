import { createAppError, ErrorCode } from '../../shared/errors.js';
import { absoluteUrl, parseVideoId, partFromUrl, trackSourceType } from './ids.js';

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value != null && value !== '') return value;
  }
  return undefined;
}

function normalizeTrack(item, index = 0) {
  const id = String(pick(item, ['id', 'id_str', 'subtitle_id']) ?? `${item.lan || 'track'}-${index}`);
  const lang = String(pick(item, ['lan', 'lang', 'language']) || 'und');
  const label = String(pick(item, ['lan_doc', 'label', 'name']) || lang);
  const url = absoluteUrl(pick(item, ['subtitle_url', 'subtitleUrl', 'url']) || '');
  return {
    id,
    lang,
    label,
    sourceType: trackSourceType(item),
    url,
    raw: {
      type: item?.type,
      ai_type: item?.ai_type,
      ai_status: item?.ai_status
    }
  };
}

export function tracksFromPlayerPayload(payload) {
  const data = payload?.data || payload || {};
  const groups = [
    data.subtitle?.subtitles,
    data.subtitle?.list,
    data.subtitles,
    payload?.subtitle?.subtitles
  ];
  const list = groups.find((item) => Array.isArray(item) && item.length) || [];
  return list.map((item, index) => normalizeTrack(item, index)).filter((track) => track.id);
}

export function contextFromViewPayload(payload, href = '') {
  const data = payload?.data || payload || {};
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const partNo = partFromUrl(href);
  const current = pages[partNo - 1] || pages.find((page) => Number(page.cid) === Number(data.cid)) || pages[0] || {};
  const owner = data.owner?.name || data.ownerName || '';
  const id = parseVideoId(href) || {};
  return {
    title: String(data.title || current.part || ''),
    bvid: String(data.bvid || (id.kind === 'bvid' ? id.value : '') || ''),
    aid: data.aid != null ? Number(data.aid) : (id.kind === 'aid' ? Number(id.value) : undefined),
    cid: current.cid != null ? Number(current.cid) : (data.cid != null ? Number(data.cid) : undefined),
    part: pages.length > 1
      ? `P${current.page || partNo} ${current.part || ''}`.trim()
      : (current.part || 'P1'),
    partNo,
    pageCount: pages.length || 1,
    owner: String(owner || ''),
    url: href,
    pages: pages.map((page) => ({
      cid: Number(page.cid),
      page: Number(page.page || 0),
      part: String(page.part || '')
    })),
    fingerprint: `${data.bvid || (id.kind === 'bvid' ? id.value : data.aid || '')}|${current.cid || data.cid || partNo}`
  };
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...options
  });
  const text = await response.text();
  if (!response.ok) {
    throw createAppError(ErrorCode.FETCH_FAILED, {
      httpStatus: response.status,
      detail: `${url} -> ${response.status}`
    });
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text;
  }
}

export function viewApiUrl(id) {
  if (id.kind === 'bvid') return `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(id.value)}`;
  return `https://api.bilibili.com/x/web-interface/view?aid=${encodeURIComponent(id.value)}`;
}

export function playerApiUrl(context) {
  const params = new URLSearchParams();
  if (context.bvid) params.set('bvid', context.bvid);
  if (context.aid) params.set('aid', String(context.aid));
  if (context.cid) params.set('cid', String(context.cid));
  return `https://api.bilibili.com/x/player/v2?${params.toString()}`;
}

export function classifyPlayerError(payload) {
  const code = Number(payload?.code);
  if (code === 0) return null;
  if (code === -101 || code === -111 || /登录|login/i.test(String(payload?.message || ''))) {
    return createAppError(ErrorCode.LOGIN_REQUIRED, { detail: `player:${code}` });
  }
  return createAppError(ErrorCode.FETCH_FAILED, { detail: `player:${code}:${payload?.message || ''}` });
}

export { normalizeTrack };
