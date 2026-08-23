import { createAppError, ErrorCode, toErrorPayload } from '../shared/errors.js';
import { buildExportContent, buildFilename, mimeForFormat } from '../features/export/exporter.js';
import { extractByHref, identifyByHref } from '../features/video-context/remote.js';
import { applyVideoChange, videoUrlWithPart } from '../features/video-context/sync.js';
import { isBilibiliVideoPage } from '../platform/bilibili/ids.js';
import { loadSettings, saveSettings } from '../storage/settings.js';
import { clearSession, loadSession, saveDiagnostic, saveSession } from '../storage/session.js';
import { CONFIG_MESSAGE, CONFIG_URL } from '../features/remote/config.js';

const WORKSPACE_PATH = 'src/workspace/workspace.html';

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
    return { downloadId, filename };
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

async function resolveTab(tabId) {
  if (tabId) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) throw createAppError(ErrorCode.TAB_GONE);
    return tab;
  }
  const tab = await activeTab();
  if (!tab?.id) throw createAppError(ErrorCode.NOT_VIDEO_PAGE);
  return tab;
}

async function pingTab(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

async function statusFromTab(tab) {
  const pageReady = await pingTab(tab.id);
  const debug = { url: tab.url || '', pageReady, source: 'page' };
  if (pageReady) {
    const result = await sendToTab(tab.id, { type: 'GET_STATUS' });
    if (!result?.ok) throw Object.assign(new Error(result?.error?.message || '识别失败'), result?.error || {});
    return { ...result, tabId: tab.id, debug };
  }
  const fallback = await identifyByHref(tab.url || '', fetchUrl);
  debug.source = 'api-fallback';
  debug.trackCount = fallback.trackCount;
  await saveDiagnostic({
    code: 'API_FALLBACK',
    message: '页面脚本未就绪，已改用接口识别',
    detail: tab.url || '',
    tab: tab.url || ''
  });
  return { ok: true, ...fallback, tabId: tab.id, debug };
}

async function extractFromTab(tab, options = {}) {
  const pageReady = await pingTab(tab.id);
  if (pageReady) {
    const result = await sendToTab(tab.id, {
      type: 'EXTRACT',
      trackId: options.trackId,
      mergeShortLines: options.mergeShortLines
    });
    if (!result?.ok) throw Object.assign(new Error(result?.error?.message || '提取失败'), result?.error || {});
    return { ...result.result, tabId: tab.id, source: 'page' };
  }
  const result = await extractByHref(tab.url || '', fetchUrl, options);
  await saveDiagnostic({
    code: 'API_FALLBACK',
    message: '页面脚本未就绪，已改用接口提取',
    detail: tab.url || '',
    tab: tab.url || ''
  });
  return { ...result, tabId: tab.id };
}

async function extractOnTab(tabId, options = {}) {
  const tab = await resolveTab(tabId);
  const result = await extractFromTab(tab, options);
  const session = {
    ...result,
    tabId: tab.id,
    stale: false,
    changedTo: undefined
  };
  await saveSession(session);
  return session;
}

async function switchAndExtract({ tabId, partNo, trackId, mergeShortLines } = {}) {
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
    mergeShortLines: mergeShortLines ?? settings.mergeShortLines
  });
}

async function openWorkspace() {
  const url = chrome.runtime.getURL(WORKSPACE_PATH);
  const tabs = await chrome.tabs.query({ url });
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
    return { tabId: tabs[0].id };
  }
  const tab = await chrome.tabs.create({ url });
  return { tabId: tab.id };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    if (message?.type === 'GET_SETTINGS') return { ok: true, settings: await loadSettings() };
    if (message?.type === 'SAVE_SETTINGS') return { ok: true, settings: await saveSettings(message.patch || {}) };
    if (message?.type === 'GET_SESSION') return { ok: true, session: await loadSession() };
    if (message?.type === 'CLEAR_SESSION') {
      await clearSession();
      return { ok: true };
    }
    if (message?.type === 'OPEN_WORKSPACE') return { ok: true, ...(await openWorkspace()) };
    if (message?.type === 'FETCH_URL') {
      const payload = await fetchUrl(message.url);
      return { ok: true, payload };
    }
    if (message?.type === 'DOWNLOAD_EXPORT') return { ok: true, ...(await downloadText(message)) };
    if (message?.type === 'VIDEO_CHANGED') {
      let context = message.context || {};
      const tabId = sender.tab?.id;
      if (tabId) {
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
      }
      const session = await loadSession();
      const next = applyVideoChange(session, context);
      if (next && next !== session) await saveSession(next);
      return { ok: true };
    }
    if (message?.type === 'EXTRACT_CURRENT') {
      const tab = await resolveTab(message.tabId);
      const session = await extractOnTab(tab.id, {
        trackId: message.trackId,
        mergeShortLines: message.mergeShortLines
      });
      return { ok: true, session };
    }
    if (message?.type === 'SWITCH_AND_EXTRACT') {
      const session = await switchAndExtract(message);
      return { ok: true, session };
    }
    if (message?.type === 'STATUS_CURRENT') {
      const tab = await resolveTab(message.tabId);
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
