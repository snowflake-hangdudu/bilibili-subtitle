(function () {
  'use strict';
  if (window.__BSH_AGENT__) return;
  window.__BSH_AGENT__ = true;
  console.info('[BSH] page-agent ready', location.href);

  const AGENT = 'bsh-agent';
  const CONTENT = 'bsh-content';

  function reply(id, payload) {
    window.postMessage({ source: AGENT, id, ...payload }, '*');
  }

  function parseVideoId(href) {
    let path = '';
    try { path = new URL(href).pathname; } catch { path = href; }
    let match = path.match(/\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10})/i);
    if (match) return { kind: 'bvid', value: match[1] };
    match = path.match(/\/video\/av(\d+)/i);
    if (match) return { kind: 'aid', value: match[1] };
    match = String(href).match(/(BV[1-9A-HJ-NP-Za-km-z]{10})/i);
    if (match) return { kind: 'bvid', value: match[1] };
    return null;
  }

  function partFromHref(href) {
    try {
      const n = Number(new URL(href).searchParams.get('p'));
      return Number.isFinite(n) && n > 0 ? n : 1;
    } catch {
      return 1;
    }
  }

  function readInitialState() {
    return window.__INITIAL_STATE__ || window.__NEXT_DATA__?.props?.pageProps?.dehydratedState || null;
  }

  function readVideoData() {
    const state = readInitialState() || {};
    return state.videoData || state.videoInfo || state.video || state.aid && state || {};
  }

  function asDurationSec(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n > 36000 ? n / 1000 : n;
  }

  function currentCid(videoData, href) {
    const pages = Array.isArray(videoData.pages) ? videoData.pages : [];
    const partNo = partFromHref(href);
    const fromPlayer = Number(window.player?.getState?.()?.cid || window.player?.cid);
    if (fromPlayer) return fromPlayer;
    const fromPage = pages[partNo - 1];
    if (fromPage?.cid) return Number(fromPage.cid);
    if (videoData.cid) return Number(videoData.cid);
    return undefined;
  }

  function buildContext() {
    const href = location.href;
    const id = parseVideoId(href);
    const videoData = readVideoData() || {};
    const urlBvid = id?.kind === 'bvid' ? id.value : '';
    const urlAid = id?.kind === 'aid' ? id.value : '';
    const stateBvid = String(videoData.bvid || '');
    const staleState = Boolean(urlBvid && stateBvid && urlBvid.toLowerCase() !== stateBvid.toLowerCase());
    const pages = staleState ? [] : (Array.isArray(videoData.pages) ? videoData.pages : []);
    const partNo = partFromHref(href);
    const cid = staleState ? Number(window.player?.getState?.()?.cid || 0) || undefined : currentCid(videoData, href);
    const current = pages.find((page) => Number(page.cid) === Number(cid)) || pages[partNo - 1] || {};
    const title = document.querySelector('h1, .video-title, [class*="video-title"]')?.textContent
      || (staleState ? '' : videoData.title)
      || document.title.replace(/_哔哩哔哩.*$/, '').trim();
    const owner = staleState
      ? (document.querySelector('.up-name, .up-info-name, [class*="up-name"]')?.textContent || '')
      : (videoData.owner?.name
        || document.querySelector('.up-name, .up-info-name, [class*="up-name"]')?.textContent
        || '');
    const bvid = String(urlBvid || videoData.bvid || '');
    const aid = urlAid ? Number(urlAid) : (staleState ? undefined : (videoData.aid != null ? Number(videoData.aid) : undefined));
    const playerDuration = asDurationSec(window.player?.getDuration?.());
    const pageDuration = asDurationSec(current.duration);
    const stateDuration = staleState ? undefined : asDurationSec(videoData.duration);
    const durationSec = playerDuration || pageDuration || (pages.length > 1 ? undefined : stateDuration);

    return {
      title: String(title || '').trim(),
      bvid,
      aid,
      cid,
      part: pages.length > 1
        ? `P${current.page || partNo} ${current.part || ''}`.trim()
        : (current.part || `P${partNo}`),
      partNo,
      pageCount: pages.length || 1,
      owner: String(owner || '').trim(),
      url: href,
      pages: pages.map((page) => ({
        cid: Number(page.cid),
        page: Number(page.page || 0),
        part: String(page.part || '')
      })),
      fingerprint: `${bvid || aid || href}|${cid || partNo}`,
      durationSec,
      staleState
    };
  }

  function bilibiliHeaders() {
    return {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.bilibili.com',
      Referer: location.href || 'https://www.bilibili.com/'
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: bilibiliHeaders()
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { ok: response.ok, status: response.status, json, text };
  }

  function trackUrlFromItem(item) {
    const raw = item?.subtitle_url || item?.subtitle_url_v2 || item?.subtitleUrl || item?.url || '';
    if (!raw) return '';
    return raw.startsWith('//') ? `https:${raw}` : String(raw);
  }

  function normalizeRawTracks(list) {
    if (!Array.isArray(list)) return [];
    return list.map((item, index) => {
      const url = trackUrlFromItem(item);
      if (!url) return item;
      return { ...item, subtitle_url: item.subtitle_url || url };
    }).filter((item) => trackUrlFromItem(item));
  }

  function pickTracks(payload) {
    const data = payload?.json?.data || payload?.data || payload || {};
    const groups = [
      data.subtitle?.subtitles,
      data.subtitle?.list,
      data.subtitles,
      payload?.subtitle?.subtitles
    ];
    const list = groups.find((item) => Array.isArray(item) && item.length) || [];
    return normalizeRawTracks(list);
  }

  function pickInlineTracks() {
    const playerState = window.player?.getState?.() || {};
    const buckets = [
      playerState.subtitle?.subtitles,
      playerState.subtitle?.list,
      playerState.videoData?.subtitle?.subtitles,
      window.player?.subtitle?.subtitles,
      readVideoData()?.subtitle?.subtitles,
      readVideoData()?.subtitle?.list,
      window.__playinfo__?.data?.subtitle?.subtitles
    ];
    for (const list of buckets) {
      const normalized = normalizeRawTracks(list);
      if (normalized.length) return normalized;
    }
    return [];
  }

  function enrichContextFromTracks(context, tracks) {
    const cid = String(context.cid || '');
    if (!cid) return context;
    for (const track of tracks || []) {
      const url = trackUrlFromItem(track);
      const digits = url.match(/\/ai_subtitle\/prod\/(\d+)/i)?.[1] || '';
      if (!digits || !digits.endsWith(cid)) continue;
      const aidStr = digits.slice(0, digits.length - cid.length);
      if (!aidStr) continue;
      return {
        ...context,
        aid: Number(aidStr),
        cid: Number(cid),
        staleState: false,
        fingerprint: `${context.bvid || aidStr}|${cid}`
      };
    }
    return context;
  }

  function mergeContextFromPayload(context, payload) {
    const data = payload?.json?.data || payload?.data || payload || {};
    const next = { ...context };
    const payloadCid = Number(data.cid);
    const payloadAid = Number(data.aid);
    const payloadBvid = String(data.bvid || '');
    if (payloadBvid) next.bvid = payloadBvid;
    if (Number.isFinite(payloadAid) && payloadAid > 0) next.aid = payloadAid;
    if (Number.isFinite(payloadCid) && payloadCid > 0) next.cid = payloadCid;
    if (next.bvid && next.cid) next.staleState = false;
    next.fingerprint = `${next.bvid || next.aid || next.url}|${next.cid || next.partNo || 1}`;
    return next;
  }

  function contextFromViewData(context, data, href) {
    if (!data || typeof data !== 'object') return context;
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const partNo = partFromHref(href || context.url || location.href);
    const current = pages[partNo - 1]
      || pages.find((page) => Number(page.cid) === Number(context.cid))
      || pages[0]
      || {};
    const id = parseVideoId(href || context.url || location.href);
    const next = {
      ...context,
      title: String(context.title || data.title || current.part || ''),
      bvid: String(data.bvid || context.bvid || (id?.kind === 'bvid' ? id.value : '') || ''),
      aid: data.aid != null ? Number(data.aid) : context.aid,
      cid: Number(current.cid || data.cid || context.cid || 0) || undefined,
      owner: String(context.owner || data.owner?.name || ''),
      part: pages.length > 1
        ? `P${current.page || partNo} ${current.part || ''}`.trim()
        : (context.part || `P${partNo}`),
      partNo,
      pageCount: pages.length || context.pageCount || 1,
      pages: pages.map((page) => ({
        cid: Number(page.cid),
        page: Number(page.page || 0),
        part: String(page.part || '')
      })),
      staleState: false
    };
    next.fingerprint = `${next.bvid || next.aid || next.url}|${next.cid || next.partNo || 1}`;
    return next;
  }

  async function resolveViewContext(context) {
    if (!context.bvid && !context.aid) return context;
    const href = context.url || location.href;
    const url = context.bvid
      ? `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(context.bvid)}`
      : `https://api.bilibili.com/x/web-interface/view?aid=${encodeURIComponent(context.aid)}`;
    const result = await fetchJson(url);
    if (!result.ok || Number(result.json?.code) !== 0) return context;
    return contextFromViewData(context, result.json.data, href);
  }

  function payloadMatches(context, payload) {
    const data = payload?.json?.data || payload?.data || {};
    const payloadCid = Number(data.cid);
    const payloadBvid = String(data.bvid || '');
    if (context.cid && payloadCid > 0 && Number(context.cid) !== payloadCid) return false;
    if (context.bvid && payloadBvid && payloadBvid.toLowerCase() !== String(context.bvid).toLowerCase()) return false;
    return true;
  }

  async function listTracks(initialContext) {
    const steps = [];
    const trace = (msg) => {
      steps.push(msg);
      console.info('[BSH:listTracks]', msg);
    };
    let context = { ...(initialContext || buildContext()) };
    trace(`context bvid=${context.bvid || ''} cid=${context.cid || ''} aid=${context.aid || ''} stale=${Boolean(context.staleState)}`);
    if (!context.cid || context.staleState || !context.aid) {
      trace('resolve view api for cid/aid');
      context = await resolveViewContext(context);
      trace(`after view bvid=${context.bvid || ''} cid=${context.cid || ''} aid=${context.aid || ''}`);
    }

    const params = new URLSearchParams();
    if (context.bvid) params.set('bvid', context.bvid);
    if (context.aid) params.set('aid', String(context.aid));
    if (context.cid) params.set('cid', String(context.cid));
    params.set('fnver', '0');
    params.set('fnval', '16');
    params.set('platform', 'pc');
    const query = params.toString();
    const baseParams = Object.fromEntries(params.entries());
    const urls = [];
    const wbi = window.__BSH_WBI__;
    if (wbi?.buildSignedPlayerV2Url) {
      const signedUrl = await wbi.buildSignedPlayerV2Url(baseParams, fetchJson);
      if (signedUrl) {
        urls.push(signedUrl);
        trace('player api wbi signed');
      }
    }
    urls.push(`https://api.bilibili.com/x/player/v2?${query}`);
    trace(`player api urls=${urls.length}`);

    let last = null;
    let tracks = [];
    let loginHint = false;
    for (const url of urls) {
      const result = await fetchJson(url);
      last = result;
      const data = result.json?.data || {};
      const apiTracks = pickTracks(result);
      trace(`${url.includes('wbi') ? 'wbi' : 'v2'} code=${result.json?.code ?? '?'} tracks=${apiTracks.length} loginMid=${data.login_mid || 0} needLogin=${Boolean(data.need_login_subtitle)}`);
      if (data.need_login_subtitle && !Number(data.login_mid)) loginHint = true;
      if (result.ok && Array.isArray(apiTracks) && apiTracks.length && payloadMatches(context, result)) {
        tracks = apiTracks;
        context = mergeContextFromPayload(context, result);
        trace(`accepted matched payload tracks=${tracks.length}`);
        break;
      }
      if (result.ok && Array.isArray(apiTracks) && apiTracks.length) {
        const merged = mergeContextFromPayload(context, result);
        if (merged.cid && merged.bvid) {
          tracks = apiTracks;
          context = merged;
          trace(`accepted merged payload tracks=${tracks.length}`);
          break;
        }
      }
    }

    if (!tracks.length) {
      trace('api empty, try inline player state');
      const inline = pickInlineTracks();
      if (inline.length) {
        tracks = inline;
        context = await resolveViewContext(context);
        trace(`inline tracks=${tracks.length}`);
      }
    }

    if (tracks.length) {
      context = enrichContextFromTracks(context, tracks);
      trace(`final tracks=${tracks.length} bvid=${context.bvid || ''} cid=${context.cid || ''} aid=${context.aid || ''}`);
    } else {
      trace(`final tracks=0 loginHint=${loginHint}`);
    }

    return {
      tracks,
      context,
      steps,
      apiCode: last?.json?.code,
      httpStatus: last?.status,
      loginHint: loginHint || last?.status === 401 || last?.json?.code === -101
    };
  }

  async function fetchSubtitle(url) {
    const abs = url.startsWith('//') ? `https:${url}` : url;
    const result = await fetchJson(abs);
    if (!result.ok) {
      throw new Error(`subtitle-http-${result.status}`);
    }
    return result.json?.body ? result.json : result.json;
  }

  function seekVideo(startMs) {
    const sec = Math.max(0, Number(startMs) / 1000 || 0);
    const video = document.querySelector('video');
    const player = window.player;
    const wasPaused = video ? video.paused : true;
    let sought = false;
    try {
      if (typeof player?.seek === 'function') {
        player.seek(sec);
        sought = true;
      } else if (typeof player?.currentTime === 'number') {
        player.currentTime = sec;
        sought = true;
      }
    } catch {
      // fall through to media element
    }
    if (!sought && video) {
      video.currentTime = sec;
      sought = true;
    }
    if (!sought) throw new Error('no-player');
    if (video) {
      if (wasPaused && !video.paused) video.pause();
    }
    return {
      ok: true,
      currentTime: sec,
      paused: wasPaused,
      fingerprint: buildContext().fingerprint
    };
  }

  async function handle(type, args = {}) {
    if (type === 'GET_CONTEXT') return { context: buildContext() };
    if (type === 'LIST_TRACKS') {
      const context = args.context || buildContext();
      return { context, ...(await listTracks(context)) };
    }
    if (type === 'FETCH_SUBTITLE') {
      const payload = await fetchSubtitle(args.url);
      return { payload };
    }
    if (type === 'SEEK_VIDEO') return seekVideo(args.startMs);
    throw new Error(`unknown-type:${type}`);
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.source !== CONTENT || event.source !== window) return;
    handle(data.type, data.args || {})
      .then((result) => reply(data.id, { ok: true, result }))
      .catch((error) => reply(data.id, { ok: false, error: String(error.message || error) }));
  });

  let lastFingerprint = '';
  let changeTimer = 0;
  function notifyChange() {
    const context = buildContext();
    if (!context.fingerprint || context.fingerprint === lastFingerprint) return;
    lastFingerprint = context.fingerprint;
    window.postMessage({ source: AGENT, type: 'VIDEO_CHANGED', context }, '*');
  }
  function scheduleNotify(delay) {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(notifyChange, delay);
  }

  const pushState = history.pushState;
  const replaceState = history.replaceState;
  history.pushState = function () {
    const ret = pushState.apply(this, arguments);
    scheduleNotify(400);
    return ret;
  };
  history.replaceState = function () {
    const ret = replaceState.apply(this, arguments);
    scheduleNotify(400);
    return ret;
  };
  window.addEventListener('popstate', () => scheduleNotify(400));
  setInterval(notifyChange, 1200);
  setTimeout(notifyChange, 300);
})();
