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
      staleState
    };
  }

  function tracksFromState(allowState) {
    if (allowState === false) return [];
    const videoData = readVideoData() || {};
    const fromPlayer = window.player?.getState?.()?.subtitle?.subtitles
      || window.player?.getState?.()?.subtitle?.list;
    const list = videoData.subtitle?.list
      || videoData.subtitle?.subtitles
      || window.__INITIAL_STATE__?.subtitle?.subtitles
      || fromPlayer
      || [];
    return Array.isArray(list) ? list : [];
  }

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { ok: response.ok, status: response.status, json, text };
  }

  function pickTracks(payload) {
    return payload?.data?.subtitle?.subtitles
      || payload?.data?.subtitle?.list
      || payload?.subtitle?.subtitles
      || [];
  }

  async function listTracks(context) {
    const fromState = tracksFromState(!context.staleState);
    const params = new URLSearchParams();
    if (context.bvid) params.set('bvid', context.bvid);
    if (context.aid) params.set('aid', String(context.aid));
    if (context.cid) params.set('cid', String(context.cid));
    const query = params.toString();
    const urls = [
      `https://api.bilibili.com/x/player/v2?${query}`,
      `https://api.bilibili.com/x/player/wbi/v2?${query}`
    ];

    let last = null;
    for (const url of urls) {
      const result = await fetchJson(url);
      last = result;
      const apiTracks = pickTracks(result.json);
      if (result.ok && Array.isArray(apiTracks) && apiTracks.length) {
        return {
          tracks: apiTracks,
          apiCode: result.json?.code,
          httpStatus: result.status,
          loginHint: result.json?.code === -101
        };
      }
    }

    return {
      tracks: fromState,
      apiCode: last?.json?.code,
      httpStatus: last?.status,
      loginHint: last?.status === 401 || last?.json?.code === -101
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
