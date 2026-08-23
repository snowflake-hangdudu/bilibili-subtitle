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
