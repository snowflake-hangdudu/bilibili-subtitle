import { isBilibiliVideoPage, parseVideoId, partFromUrl } from '../../platform/bilibili/ids.js';
import { contextFromViewPayload } from '../../platform/bilibili/adapter.js';

export function detectVideoContext(href, viewPayload) {
  if (!isBilibiliVideoPage(href)) return null;
  const id = parseVideoId(href);
  if (!id) return null;
  if (viewPayload) return reconcileContext(href, contextFromViewPayload(viewPayload, href));
  return reconcileContext(href, {
    title: '',
    bvid: id.kind === 'bvid' ? id.value : '',
    aid: id.kind === 'aid' ? Number(id.value) : undefined,
    partNo: partFromUrl(href),
    url: href
  });
}

export function sameVideoId(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

export function contextMatchesHref(context, href) {
  const id = parseVideoId(href);
  if (!id || !context) return false;
  if (id.kind === 'bvid') return sameVideoId(context.bvid, id.value);
  return Number(context.aid) === Number(id.value);
}

export function normalizeDurationSec(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n > 36_000 ? n / 1000 : n;
}

export function cueSpanSec(cues) {
  if (!Array.isArray(cues) || !cues.length) return 0;
  const last = cues.reduce((max, cue) => Math.max(max, Number(cue.endMs || cue.startMs) || 0), 0);
  return last / 1000;
}

export function durationSlackSec(durationSec) {
  const duration = normalizeDurationSec(durationSec) || 0;
  return Math.max(45, duration * 0.08);
}

export function cuesFitDuration(cues, durationSec, slackSec) {
  const duration = normalizeDurationSec(durationSec);
  if (!duration || !Array.isArray(cues) || !cues.length) return true;
  const slack = slackSec ?? durationSlackSec(duration);
  return cueSpanSec(cues) <= duration + slack;
}

export function cuesLookLeftover(cues, durationSec) {
  const duration = normalizeDurationSec(durationSec);
  if (!duration || duration <= 90 || !Array.isArray(cues) || !cues.length) return false;
  const span = cueSpanSec(cues);
  return span < Math.min(duration * 0.12, 90);
}

export function cuesMatchVideo(cues, durationSec, options = {}) {
  const duration = normalizeDurationSec(durationSec);
  if (!duration || !Array.isArray(cues) || !cues.length) return true;
  if (!cuesFitDuration(cues, duration)) return false;
  if (options.requireCoverage && cuesLookLeftover(cues, duration)) return false;
  return true;
}

export function pageResultTrustworthy(result, href) {
  const context = result?.context || result?.video;
  if (!context || context.staleState) return false;
  if (!contextMatchesHref(context, href)) return false;
  if (result?.cues && !cuesMatchVideo(result.cues, context.durationSec)) return false;
  return true;
}

export function reconcileContext(href, context = {}) {
  const id = parseVideoId(href);
  const partNo = partFromUrl(href);
  const urlBvid = id?.kind === 'bvid' ? id.value : '';
  const urlAid = id?.kind === 'aid' ? Number(id.value) : undefined;
  const stateBvid = String(context.bvid || '');
  const mismatched = Boolean(urlBvid && stateBvid && !sameVideoId(urlBvid, stateBvid));
  const bvid = mismatched ? urlBvid : (urlBvid || stateBvid);
  const aid = mismatched ? urlAid : (context.aid ?? urlAid);
  const cid = mismatched ? undefined : context.cid;
  const resolvedPart = mismatched ? partNo : (context.partNo || partNo);
  return {
    ...context,
    bvid,
    aid,
    cid,
    partNo: resolvedPart,
    part: mismatched ? `P${resolvedPart}` : (context.part || `P${resolvedPart}`),
    url: href || context.url || '',
    fingerprint: `${bvid || aid || href}|${cid || resolvedPart}`,
    staleState: mismatched
  };
}
