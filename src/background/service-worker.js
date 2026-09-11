import { createAppError, ErrorCode, toErrorPayload } from '../shared/errors.js';
import { buildExportContent, buildFilename, mimeForFormat } from '../features/export/exporter.js';
import { extractByHref, identifyByHref } from '../features/video-context/remote.js';
import { contextMatchesHref, cuesMatchVideo } from '../features/video-context/detect.js';
import { applyVideoChange, videoUrlWithPart } from '../features/video-context/sync.js';
import { isBilibiliVideoPage } from '../platform/bilibili/ids.js';
import { loadSettings, saveSettings } from '../storage/settings.js';
import { clearSession, loadSession, removeTabSession, saveDiagnostic, saveSession } from '../storage/session.js';
import { bindDownloadListeners, getDownloadStatus, trackDownload } from '../storage/downloads.js';
import { loadTrackIndex, rememberTrustedTracks } from '../storage/track-index.js';
import { aiSubtitleUrlMatches, isCarryOverExtract, trackConflictsWithIndex } from '../features/video-context/track-bind.js';
import { CONFIG_MESSAGE, CONFIG_URL } from '../features/remote/config.js';

const WORKSPACE_PATH = 'src/workspace/workspace.html';
const WORKSPACE_TAB_KEY = 'bsh.workspaceTabId';

let workspaceTabId = 0;
let openingWorkspace = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) throw createAppError(ErrorCode.TAB_GONE, { detail: String(error.message || error) });
    if (!isBilibiliVideoPage(tab.url || '')) throw createAppError(ErrorCode.NOT_VIDEO_PAGE);
    throw createAppError(ErrorCode.CONTENT_NOT_READY, {
      detail: `send-failed:${tab.url} ${error.message || error}`
    });
  }
}

async function fetchUrl(url) {
  const abs = url.startsWith('//') ? `https:${url}` : url;
  const response = await fetch(abs, { credentials: 'include', cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) {
    throw createAppError(ErrorCode.FETCH_FAILED, { httpStatus: response.status, detail: abs });
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text;
  }
}

function textToDataUrl(content, mime) {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `data:${mime};base64,${btoa(binary)}`;
}

async function downloadText({ format, video, track, cues, options }) {
  const content = buildExportContent(format, video, track, cues, options);
  const filename = buildFilename(video, track, format, options?.filenameTemplate);
  const mime = mimeForFormat(format);
  try {
    const url = textToDataUrl(content, mime);
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: Boolean(options?.saveAs),
      conflictAction: 'uniquify'
    });
    await saveSettings({
      format,
      includeTimestamp: options?.includeTimestamp !== false,
      mergeShortLines: options?.mergeShortLines !== false,
      filenameTemplate: options?.filenameTemplate
    });
    await trackDownload(downloadId, {
      filename,
      format,
      cueCount: Array.isArray(cues) ? cues.length : 0,
      noteRating: options?.noteRating !== false
    });
    return { downloadId, filename, status: 'started' };
  } catch (error) {
    throw createAppError(ErrorCode.DOWNLOAD_FAILED, { detail: String(error.message || error) });
  }
}

async function navigateAndWait(tabId, url) {
  const done = new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, 15000);
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  await chrome.tabs.update(tabId, { url });
  await done;
}

function senderVideoTabId(sender) {
  if (sender?.tab?.id && isBilibiliVideoPage(sender.tab.url || '')) return sender.tab.id;
  return 0;
}

async function resolveTab(tabId) {
  if (tabId) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) throw createAppError(ErrorCode.TAB_GONE);
    return tab;
  }
  const tab = await activeTab();
  if (tab?.id && isBilibiliVideoPage(tab.url || '')) return tab;
  throw createAppError(ErrorCode.NOT_VIDEO_PAGE);
}

async function pingTab(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

function filterTrustedTracks(tracks, context, index, log) {
  return (tracks || []).filter((track) => {
    const trusted = aiSubtitleUrlMatches(track.url, context) && !trackConflictsWithIndex(track, context, index);
    if (!trusted) log(`hide leftover ${track.label || track.id}`);
    return trusted;
  });
}

async function statusFromTab(tab) {
  const href = tab.url || '';
  const debug = [];
  const log = (line) => debug.push(String(line));
  log(`status tab=${tab.id}`);
  log(`url ${href}`);
  const pageReady = await pingTab(tab.id);
  log(`pageReady=${pageReady}`);

  if (pageReady) {
    try {
      log('try page GET_STATUS');
      const page = await sendToTab(tab.id, { type: 'GET_STATUS' });
      if (!page?.ok) {
        log(`page fail ${page?.error?.code || 'unknown'} ${page?.error?.message || ''}`);
        if (page?.error?.code === ErrorCode.LOGIN_REQUIRED) {
          return { ok: false, error: page.error, debug, tabId: tab.id, pageReady, source: 'page' };
        }
      } else {
        const context = page.context || {};
        log(`page context bvid=${context.bvid || ''} cid=${context.cid || ''} aid=${context.aid || ''}`);
        log(`page rawTracks=${Array.isArray(page.tracks) ? page.tracks.length : 0} loginHint=${Boolean(page.loginHint)}`);
        for (const track of page.tracks || []) {
          log(`page track ${track.label || track.lang || track.id} ${track.url ? 'has-url' : 'no-url'}`);
        }
        for (const step of page.steps || []) log(`page step ${step}`);
        if (page.loginHint && !(page.tracks || []).length) {
          log('page login required, no tracks');
          return {
            ok: false,
            error: toErrorPayload(createAppError(ErrorCode.LOGIN_REQUIRED)),
            debug,
            tabId: tab.id,
            pageReady,
            source: 'page'
          };
        }
        const index = await loadTrackIndex();
        const tracks = filterTrustedTracks(page.tracks, context, index, log);
        await rememberTrustedTracks(context, tracks);
        log(`page accepted tracks=${tracks.length}`);
        if (tracks.length) {
          return {
            ok: true,
            context,
            tracks,
            trackCount: tracks.length,
            loginHint: Boolean(page.loginHint),
            tabId: tab.id,
            debug,
            pageReady,
            source: 'page'
          };
        }
        log('page returned 0 trusted tracks, fallback api');
      }
    } catch (error) {
      log(`page err ${error.code || error.message || error}`);
    }
  } else {
    log('page script not ready, fallback api');
  }

  log('fallback identifyByHref');
  try {
    const fallback = await identifyByHref(href, fetchUrl, { log });
    const index = await loadTrackIndex();
    const tracks = filterTrustedTracks(fallback.tracks, fallback.context, index, log);
    await rememberTrustedTracks(fallback.context, tracks);
    log(`api accepted tracks=${tracks.length}`);
    if (fallback.loginHint && !tracks.length) {
      return {
        ok: false,
        error: toErrorPayload(createAppError(ErrorCode.LOGIN_REQUIRED, { detail: 'api-login' })),
        debug,
        tabId: tab.id,
        pageReady,
        source: 'api'
      };
    }
    return {
      ok: true,
      ...fallback,
      tracks,
      trackCount: tracks.length,
      tabId: tab.id,
      debug,
      pageReady,
      source: 'api'
    };
  } catch (error) {
    log(`api err ${error.code || error.message || error}`);
    return {
      ok: false,
      error: toErrorPayload(error),
      debug,
      tabId: tab.id,
      pageReady,
      source: 'api'
    };
  }
}

async function acceptExtract(extracted, href, source, debug, { previous, trackIndex } = {}) {
  if (!extracted?.cues?.length) return null;
  if (!contextMatchesHref(extracted.video, href)) return null;
  if (!aiSubtitleUrlMatches(extracted.track?.url, extracted.video)) {
    debug.push(`reject foreign url source=${source}`);
    return null;
  }
  if (trackConflictsWithIndex(extracted.track, extracted.video, trackIndex)) {
    debug.push(`reject reused url source=${source}`);
    return null;
  }
  if (isCarryOverExtract(extracted, previous)) {
    debug.push(`reject carry-over source=${source}`);
    return null;
  }
  if (!cuesMatchVideo(extracted.cues, extracted.video?.durationSec, {
    requireCoverage: String(source).startsWith('page')
  })) return null;
  debug.push(`accepted source=${source} cues=${extracted.cues.length} duration=${extracted.video?.durationSec || 0}`);
  return { ...extracted, tabId: undefined, pageUrl: href, source, debug };
}

async function extractFromTab(tab, options = {}) {
  const href = tab.url || '';
  const debug = [];
  const log = (line) => debug.push(String(line));
  log(`tab ${tab.id} ${href}`);
  const previous = await loadSession(tab.id);
  const trackIndex = await loadTrackIndex();

  const attempts = [
    { label: 'api', trackId: options.trackId },
    { label: 'api-all', trackId: '' },
    { label: 'page', trackId: options.trackId, page: true },
    { label: 'page-all', trackId: '', page: true }
  ];

  let lastError = null;
  for (const attempt of attempts) {
    log(`try ${attempt.label}`);
    try {
      if (attempt.page) {
        if (!(await pingTab(tab.id))) {
          log('page script not ready');
          continue;
        }
        const page = await sendToTab(tab.id, {
          type: 'EXTRACT',
          trackId: attempt.trackId,
          mergeShortLines: options.mergeShortLines
        });
        const extracted = page?.result;
        const accepted = await acceptExtract(extracted, href, attempt.label, debug, { previous, trackIndex });
        if (accepted) return { ...accepted, tabId: tab.id };
        log(`reject ${attempt.label} cues=${extracted?.cues?.length || 0} duration=${extracted?.video?.durationSec || 0}`);
        continue;
      }
      const result = await extractByHref(href, fetchUrl, {
        trackId: attempt.trackId,
        mergeShortLines: options.mergeShortLines,
        log,
        previous,
        trackIndex
      });
      const accepted = await acceptExtract(result, href, attempt.label, debug, { previous, trackIndex });
      if (accepted) return { ...accepted, tabId: tab.id };
      log(`reject ${attempt.label}`);
    } catch (error) {
      lastError = error;
      log(`${attempt.label} ${error.code || 'ERR'} ${error.message || error}`);
    }
  }

  const error = lastError || createAppError(ErrorCode.NO_SUBTITLE, {
    message: '已自动换源，仍对不上当前视频。'
  });
  error.detail = [error.detail, ...debug].filter(Boolean).join('\n');
  throw error;
}

async function extractOnTab(tabId, options = {}) {
  const tab = await resolveTab(tabId);
  const result = await extractFromTab(tab, options);
  const session = {
    ...result,
    tabId: tab.id,
    pageUrl: tab.url || result.video?.url || '',
    stale: false,
    changedTo: undefined
  };
  if (options.commit) {
    await saveSession(session);
    await rememberTrustedTracks(session.video, session.track ? [session.track] : session.tracks);
  }
  return session;
}

async function switchAndExtract({ tabId, partNo, trackId, mergeShortLines, commit } = {}) {
  const tab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : await activeTab();
  if (!tab?.id) throw createAppError(ErrorCode.TAB_GONE);
  if (!isBilibiliVideoPage(tab.url || '')) throw createAppError(ErrorCode.NOT_VIDEO_PAGE);

  const settings = await loadSettings();
  const nextUrl = partNo ? videoUrlWithPart(tab.url, partNo) : tab.url;
  if (nextUrl && nextUrl !== tab.url) {
    await navigateAndWait(tab.id, nextUrl);
    await sleep(600);
  }

  return extractOnTab(tab.id, {
    trackId: trackId || settings.lastTrackId,
    mergeShortLines: mergeShortLines ?? settings.mergeShortLines,
    commit: commit !== false
  });
}

function workspaceUrl() {
  return chrome.runtime.getURL(WORKSPACE_PATH);
}

async function rememberWorkspaceTab(tabId) {
  workspaceTabId = tabId || 0;
  try {
    if (tabId) await chrome.storage.session.set({ [WORKSPACE_TAB_KEY]: tabId });
    else await chrome.storage.session.remove(WORKSPACE_TAB_KEY);
  } catch {
    // 旧内核没有 session storage 时只记内存
  }
}

async function listWorkspaceTabIds() {
  const ids = new Set();
  if (chrome.runtime.getContexts) {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['TAB'],
        documentUrls: [workspaceUrl()]
      });
      for (const ctx of contexts) {
        if (ctx.tabId) ids.add(ctx.tabId);
      }
    } catch {
      // 走下面的兜底
    }
  }
  const cached = workspaceTabId || (await chrome.storage.session.get(WORKSPACE_TAB_KEY).catch(() => ({})))[WORKSPACE_TAB_KEY];
  if (cached) {
    try {
      const tab = await chrome.tabs.get(cached);
      if (tab?.id) ids.add(tab.id);
    } catch {
      if (cached === workspaceTabId) await rememberWorkspaceTab(0);
    }
  }
  return [...ids];
}

async function focusWorkspaceTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  await rememberWorkspaceTab(tab.id);
  return { tabId: tab.id };
}

async function closeExtraWorkspaceTabs(keepId) {
  const ids = await listWorkspaceTabIds();
  await Promise.all(ids.filter((id) => id !== keepId).map((id) => chrome.tabs.remove(id).catch(() => {})));
}

async function resolveWorkspaceTab(sender, preferredTabId) {
  if (preferredTabId) {
    const tab = await chrome.tabs.get(preferredTabId).catch(() => null);
    if (tab?.id && isBilibiliVideoPage(tab.url || '')) return tab;
  }
  const fromSender = senderVideoTabId(sender);
  if (fromSender) {
    const tab = await chrome.tabs.get(fromSender).catch(() => null);
    if (tab?.id) return tab;
  }
  const session = await loadSession();
  if (session?.tabId) {
    const tab = await chrome.tabs.get(session.tabId).catch(() => null);
    if (tab?.id && isBilibiliVideoPage(tab.url || '')) return tab;
  }
  const tab = await activeTab();
  if (tab?.id && isBilibiliVideoPage(tab.url || '')) return tab;
  return null;
}

async function openWorkspaceDock(sender, preferredTabId) {
  const tab = await resolveWorkspaceTab(sender, preferredTabId);
  if (!tab?.id) throw createAppError(ErrorCode.NOT_VIDEO_PAGE, { message: '请先打开 B 站视频页，再打开工作台。' });

  await closeExtraWorkspaceTabs(0);
  await rememberWorkspaceTab(0);

  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      if (!(await pingTab(tab.id))) {
        lastError = createAppError(ErrorCode.CONTENT_NOT_READY, { message: '页面脚本未就绪' });
        await sleep(350);
        continue;
      }
      const res = await sendToTab(tab.id, { type: 'OPEN_WORKSPACE_DOCK' });
      if (res?.ok) {
        await chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
        return { tabId: tab.id, dock: true };
      }
      lastError = createAppError(ErrorCode.CONTENT_NOT_READY, { message: res?.error?.message || '无法打开侧栏工作台' });
    } catch (error) {
      lastError = error?.code ? error : createAppError(ErrorCode.CONTENT_NOT_READY, {
        message: error?.message || '无法打开侧栏工作台'
      });
    }
    await sleep(350);
  }

  throw createAppError(ErrorCode.CONTENT_NOT_READY, {
    message: '页面脚本未就绪，请刷新当前视频页后再打开工作台。',
    detail: lastError?.detail || lastError?.message || ''
  });
}

async function openWorkspace(sender, preferredTabId) {
  if (openingWorkspace) return openingWorkspace;
  openingWorkspace = openWorkspaceDock(sender, preferredTabId);
  try {
    return await openingWorkspace;
  } finally {
    openingWorkspace = null;
  }
}

async function resolveSessionTabId(message, sender) {
  if (message?.tabId) return Number(message.tabId);
  const fromSender = senderVideoTabId(sender);
  if (fromSender) return fromSender;
  if (sender?.tab?.id && isBilibiliVideoPage(sender.tab.url || '')) return sender.tab.id;
  const tab = await activeTab();
  if (tab?.id && isBilibiliVideoPage(tab.url || '')) return tab.id;
  return 0;
}

async function seekOnTab(tabId, { startMs, fingerprint } = {}) {
  const tab = await resolveTab(tabId);
  const session = await loadSession(tab.id);
  const expected = fingerprint || session?.video?.fingerprint;
  if (expected && session?.video?.fingerprint && session.video.fingerprint !== expected && !session.stale) {
    // still allow seek when session matches; stale handled below
  }
  if (session?.stale) {
    throw createAppError(ErrorCode.NO_CONTEXT, {
      message: `当前仍是旧字幕「${session.video?.title || session.video?.bvid || ''}」，请先提取当前视频后再跳转。`
    });
  }
  const res = await sendToTab(tab.id, {
    type: 'SEEK_VIDEO',
    startMs,
    fingerprint: expected
  });
  if (!res?.ok) throw createAppError(ErrorCode.FETCH_FAILED, { message: res?.error?.message || '无法定位播放进度' });
  return res.result || { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    if (message?.type === 'GET_SETTINGS') return { ok: true, settings: await loadSettings() };
    if (message?.type === 'SAVE_SETTINGS') return { ok: true, settings: await saveSettings(message.patch || {}) };
    if (message?.type === 'GET_SESSION') {
      const tabId = await resolveSessionTabId(message, sender);
      const session = tabId ? await loadSession(tabId) : await loadSession();
      return { ok: true, session, tabId: tabId || session?.tabId || 0 };
    }
    if (message?.type === 'CLEAR_SESSION') {
      await clearSession(message.tabId);
      return { ok: true };
    }
    if (message?.type === 'OPEN_WORKSPACE') return { ok: true, ...(await openWorkspace(sender, message.tabId)) };
    if (message?.type === 'WORKSPACE_HELLO') {
      const tabId = senderVideoTabId(sender) || sender?.tab?.id || 0;
      return { ok: true, tabId };
    }
    if (message?.type === 'FETCH_URL') {
      const payload = await fetchUrl(message.url);
      return { ok: true, payload };
    }
    if (message?.type === 'DOWNLOAD_EXPORT') return { ok: true, ...(await downloadText(message)) };
    if (message?.type === 'DOWNLOAD_STATUS') return { ok: true, ...(await getDownloadStatus(message.downloadId)) };
    if (message?.type === 'SEEK_VIDEO') {
      const tab = await resolveTab(message.tabId || senderVideoTabId(sender));
      return { ok: true, result: await seekOnTab(tab.id, message) };
    }
    if (message?.type === 'VIDEO_CHANGED') {
      const tabId = sender.tab?.id;
      if (!tabId) return { ok: true };
      const session = await loadSession(tabId);
      if (!session?.video) return { ok: true };
      if (session.extractedAt && Date.now() - session.extractedAt < 2500) return { ok: true };
      let context = message.context || {};
      try {
        const status = await sendToTab(tabId, { type: 'GET_STATUS' });
        if (status?.ok) {
          context = {
            ...context,
            ...status.context,
            trackCount: Array.isArray(status.tracks) ? status.tracks.length : status.trackCount
          };
        }
      } catch {
        // 页面刚切过去时可能还没准备好，先用已有 context
      }
      const next = applyVideoChange(session, context);
      if (next && next !== session) await saveSession(next);
      return { ok: true };
    }
    if (message?.type === 'EXTRACT_CURRENT') {
      const tab = await resolveTab(message.tabId || senderVideoTabId(sender));
      const session = await extractOnTab(tab.id, {
        trackId: message.trackId,
        mergeShortLines: message.mergeShortLines,
        commit: message.commit !== false,
        requestId: message.requestId
      });
      return { ok: true, session };
    }
    if (message?.type === 'SWITCH_AND_EXTRACT') {
      const session = await switchAndExtract({ ...message, commit: message.commit !== false });
      return { ok: true, session };
    }
    if (message?.type === 'COMMIT_SESSION') {
      const session = message.session;
      if (!session?.cues?.length || !session.video || !session.tabId) {
        throw createAppError(ErrorCode.EMPTY_AFTER_CLEAN, { message: '没有可写入工作台的字幕' });
      }
      const next = { ...session, stale: false, changedTo: undefined };
      await saveSession(next);
      return { ok: true, session: next };
    }
    if (message?.type === 'STATUS_CURRENT') {
      const tab = await resolveTab(message.tabId || senderVideoTabId(sender));
      return statusFromTab(tab);
    }
    if (message?.type === 'LOG_ERROR') {
      await saveDiagnostic(message.entry || {});
      return { ok: true };
    }
    if (message?.type === CONFIG_MESSAGE) {
      if (String(message.url || '') !== CONFIG_URL) {
        throw createAppError(ErrorCode.FETCH_FAILED, { message: '不允许的地址' });
      }
      const response = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (!response.ok) throw createAppError(ErrorCode.FETCH_FAILED, { httpStatus: response.status });
      return { ok: true, data: await response.json() };
    }
    return { ok: false, error: toErrorPayload(createAppError(ErrorCode.FETCH_FAILED, { message: '未知后台请求' })) };
  };

  run()
    .then(sendResponse)
    .catch(async (error) => {
      const payload = toErrorPayload(error);
      await saveDiagnostic({
        code: payload.code,
        message: payload.message,
        detail: payload.detail,
        tab: sender?.tab?.url || ''
      });
      sendResponse({ ok: false, error: payload });
    });
  return true;
});

bindDownloadListeners({
  onComplete: async (meta) => {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_DONE',
      downloadId: meta.downloadId,
      filename: meta.filename,
      status: 'complete',
      noteRating: meta.noteRating
    }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === workspaceTabId) rememberWorkspaceTab(0);
  removeTabSession(tabId).catch(() => {});
});
