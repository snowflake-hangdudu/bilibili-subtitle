import { loadSettings, saveSettings } from '../storage/settings.js';
import { bindPromo } from '../features/remote/ui.js';
import { bindDebug } from '../shared/debug.js';
import { bindSettingsForm } from '../features/settings/form.js';
import { buildFilename, cuesToTxt } from '../features/export/exporter.js';

const debug = bindDebug(document);
const promo = bindPromo(document);
const settingsForm = bindSettingsForm(document, {
  save: 'save-settings',
  clear: 'clear-data',
  status: 'settings-status'
});

const $ = (id) => document.getElementById(id);
const ui = {
  flow: $('flow'),
  stateCard: $('state-card'),
  stateTitle: $('state-title'),
  stateDesc: $('state-desc'),
  stateDot: $('state-dot'),
  videoCard: $('video-card'),
  videoTitle: $('video-title'),
  videoSub: $('video-sub'),
  trackSelect: $('track-select'),
  trackSingle: $('track-single'),
  trackEmpty: $('track-empty'),
  btnSettings: $('btn-settings'),
  btnExtract: $('btn-extract'),
  btnReextract: $('btn-reextract'),
  btnRetry: $('btn-retry'),
  btnWorkspace: $('btn-workspace'),
  exportCard: $('export-card'),
  exportMeta: $('export-meta'),
  exportIncludeTs: $('export-include-ts'),
  exportTsLabel: $('export-ts-label'),
  btnCopyText: $('btn-copy-text'),
  btnCopyTs: $('btn-copy-ts'),
  btnExportFile: $('btn-export-file'),
  status: $('status'),
  settingsPage: $('settings-page'),
  settingsBack: $('settings-back'),
  version: $('popup-version'),
  filenamePreview: $('filename-preview'),
  home: $('home')
};

let lastSession = null;
let currentSettings = null;
let pageFingerprint = '';
let activeTabId = 0;
let refreshToken = 0;
let extractToken = 0;
let extracting = false;
let preferredIncludeTs = true;

if (ui.version) {
  ui.version.textContent = `v${chrome.runtime.getManifest().version}`;
}

function setFlow(stage = 'detect') {
  if (!ui.flow) return;
  ui.flow.classList.toggle('is-extracted', stage === 'extract' || stage === 'export');
  ui.flow.classList.toggle('is-exported', stage === 'export');
  ui.flow.querySelectorAll('.flow-step').forEach((el, index) => {
    el.classList.toggle('is-active', index === 0 && stage === 'detect');
  });
}

function setState(tone, title, desc) {
  ui.stateTitle.textContent = title;
  ui.stateDesc.textContent = desc || '';
  ui.stateDot.className = `dot ${tone === 'loading' ? 'pulse' : tone}`;
  ui.stateCard?.classList.remove('hidden');
  if (ui.stateDesc) ui.stateDesc.style.display = desc ? '' : 'none';
}

function setStatus(message, tone = 'info') {
  ui.status.textContent = message || '';
  ui.status.dataset.tone = tone;
}

function showRetry(show) {
  ui.btnRetry.classList.toggle('hidden', !show);
}

function showExportCard(show) {
  ui.exportCard?.classList.toggle('hidden', !show);
}

function sourceLabel(track) {
  if (track.sourceType === 'ai') return '自动';
  if (track.sourceType === 'official') return '人工';
  return '字幕';
}

function selectedExportFormat() {
  return document.querySelector('input[name="export-format"]:checked')?.value || 'txt';
}

function exportOptions(settings) {
  const format = selectedExportFormat();
  return {
    includeTimestamp: format === 'srt' ? true : ui.exportIncludeTs?.checked !== false,
    mergeShortLines: settings.mergeShortLines !== false,
    timestampFormat: settings.timestampFormat,
    paragraphGap: settings.paragraphGap,
    filenameTemplate: settings.filenameTemplate,
    noteRating: true
  };
}

function syncTimestampToggle(format) {
  const isSrt = format === 'srt';
  if (!ui.exportIncludeTs) return;
  if (isSrt) {
    preferredIncludeTs = ui.exportIncludeTs.checked;
    ui.exportIncludeTs.checked = true;
    ui.exportIncludeTs.disabled = true;
    if (ui.exportTsLabel) ui.exportTsLabel.textContent = 'SRT 始终包含时间轴';
  } else {
    ui.exportIncludeTs.disabled = false;
    ui.exportIncludeTs.checked = preferredIncludeTs;
    if (ui.exportTsLabel) ui.exportTsLabel.textContent = '导出时带时间轴';
  }
}

function syncExportControls(settings) {
  const format = settings.format || 'txt';
  const input = document.querySelector(`input[name="export-format"][value="${format}"]`);
  if (input) input.checked = true;
  preferredIncludeTs = settings.includeTimestamp !== false;
  if (ui.exportIncludeTs) ui.exportIncludeTs.checked = preferredIncludeTs;
  syncTimestampToggle(format);
}

function updateWorkspaceButton(hasSession) {
  if (!ui.btnWorkspace) return;
  ui.btnWorkspace.disabled = !hasSession;
  ui.btnWorkspace.classList.toggle('is-ready', hasSession);
  ui.btnWorkspace.title = hasSession ? '在当前视频页右侧打开工作台' : '提取字幕后可打开';
}

function updateExtractActions({ canExtract = false, hasCurrentResult = false } = {}) {
  ui.btnExtract.disabled = extracting || !canExtract;
  ui.btnExtract.textContent = hasCurrentResult ? '重新提取' : '提取字幕';
  // 有结果时主区仍显示「提取字幕」行；导出区内另有重新提取
  if (ui.btnReextract) ui.btnReextract.disabled = extracting || !canExtract;
}

function sessionBelongsToPage(session, context) {
  if (!session?.cues?.length || !context) return false;
  const sf = session.video?.fingerprint;
  const cf = context.fingerprint;
  if (sf && cf && sf === cf) return true;
  const sameBvid = session.video?.bvid && context.bvid
    && String(session.video.bvid).toLowerCase() === String(context.bvid).toLowerCase();
  const sameCid = Number(session.video?.cid || 0) > 0
    && Number(session.video.cid) === Number(context.cid || 0);
  return Boolean(sameBvid && sameCid);
}

function showExportPanel(session, { stale = false } = {}) {
  if (!session?.cues?.length) {
    showExportCard(false);
    setFlow('detect');
    return;
  }
  if (stale) {
    const title = session.video?.title || session.video?.bvid || '上一视频';
    ui.exportMeta.textContent = `上一份字幕 ${session.cues.length} 条 · ${session.track?.label || '字幕'}（${title}）`;
  } else {
    ui.exportMeta.textContent = `已提取 ${session.cues.length} 条 · ${session.track?.label || '字幕'}`;
  }
  showExportCard(true);
  setFlow('export');
}

function openSettings() {
  ui.settingsPage?.classList.remove('hidden');
  settingsForm.hydrate().then(updateFilenamePreview);
}

function closeSettings() {
  ui.settingsPage?.classList.add('hidden');
  loadSettings().then((settings) => {
    currentSettings = settings;
  });
}

function updateFilenamePreview() {
  if (!ui.filenamePreview) return;
  const template = $('filename')?.value?.trim() || '{title}_{part}_{lang}';
  const format = $('format')?.value || 'txt';
  const sample = buildFilename(
    { title: '示例标题', part: 'P1', bvid: 'BVxxxxxx', owner: 'UP主' },
    { lang: 'zh', label: '中文' },
    format,
    template
  );
  ui.filenamePreview.textContent = `预览：${sample}`;
}

async function copyExportText(withTime) {
  if (!lastSession?.cues?.length) {
    setStatus('请先提取字幕。', 'warn');
    return;
  }
  const text = cuesToTxt(lastSession.cues, {
    includeTimestamp: withTime,
    timestampFormat: currentSettings?.timestampFormat,
    paragraphGap: 'compact'
  });
  try {
    await navigator.clipboard.writeText(text);
    setStatus(withTime ? '已复制带时间轴文本' : '已复制纯文本', 'ok');
  } catch {
    setStatus('复制失败，请检查剪贴板权限。', 'danger');
  }
}

async function downloadExportFile() {
  if (!lastSession?.cues?.length) {
    setStatus('请先提取字幕。', 'warn');
    return;
  }
  const format = selectedExportFormat();
  ui.btnExportFile.disabled = true;
  setStatus('正在发起下载…', 'info');
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'DOWNLOAD_EXPORT',
      format,
      video: lastSession.video,
      track: lastSession.track,
      cues: lastSession.cues,
      options: exportOptions(currentSettings || {})
    });
    if (!res?.ok) {
      setStatus(res?.error?.message || '导出失败，请重试。', 'danger');
      return;
    }
    await saveSettings({
      format,
      includeTimestamp: format === 'srt' ? preferredIncludeTs : ui.exportIncludeTs?.checked !== false
    });
    currentSettings = await loadSettings();
    setStatus(`已发起下载 ${res.filename}`, 'ok');
    setFlow('export');
  } catch (error) {
    setStatus(error?.message || '导出失败，请重试。', 'danger');
  } finally {
    ui.btnExportFile.disabled = false;
  }
}

function renderTracks(tracks) {
  ui.trackSelect.replaceChildren();
  ui.trackSelect.classList.add('hidden');
  ui.trackSingle?.classList.add('hidden');
  ui.trackEmpty?.classList.add('hidden');

  if (!tracks.length) {
    ui.trackEmpty?.classList.remove('hidden');
    return;
  }

  if (tracks.length === 1) {
    const track = tracks[0];
    const label = `${track.label} · ${sourceLabel(track)}`;
    ui.trackSingle.textContent = label;
    ui.trackSingle.classList.remove('hidden');
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = label;
    ui.trackSelect.appendChild(option);
    ui.trackSelect.value = track.id;
    // 单轨道也用下拉展示，贴近参考样式
    ui.trackSingle.classList.add('hidden');
    ui.trackSelect.classList.remove('hidden');
    return;
  }

  for (const track of tracks) {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = `${track.label} · ${sourceLabel(track)}`;
    ui.trackSelect.appendChild(option);
  }
  ui.trackSelect.classList.remove('hidden');
  if (currentSettings?.lastTrackId && tracks.some((t) => t.id === currentSettings.lastTrackId)) {
    ui.trackSelect.value = currentSettings.lastTrackId;
  }
}

async function refresh() {
  const token = ++refreshToken;
  setFlow('detect');
  setState('loading', '正在识别当前页面…', '打开 B站视频页后，我会检测可用字幕轨道。');
  ui.videoCard.classList.add('hidden');
  showExportCard(false);
  updateExtractActions({ canExtract: false, hasCurrentResult: false });
  showRetry(false);
  setStatus('');
  debug.log('—— 识别开始 ——');

  try {
    currentSettings = await loadSettings();
    syncExportControls(currentSettings);

    const sessionRes = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    if (token !== refreshToken) return;
    activeTabId = sessionRes?.tabId || 0;
    const tabSession = sessionRes?.session?.cues?.length ? sessionRes.session : null;

    const res = await chrome.runtime.sendMessage({ type: 'STATUS_CURRENT' });
    if (token !== refreshToken) return;
    debug.log('识别来源', res?.source || 'unknown', 'pageReady', res?.pageReady);
    debug.dump(res?.debug);

    if (!res?.ok) {
      lastSession = null;
      updateWorkspaceButton(false);
      showExportCard(false);
      updateExtractActions({ canExtract: false, hasCurrentResult: false });
      const code = res?.error?.code;
      if (code === 'NOT_VIDEO_PAGE' || code === 'TAB_GONE') {
        setState('warn', '还不是 B站视频页', '请先打开一个视频，再点扩展图标。');
      } else if (code === 'CONTENT_NOT_READY') {
        setState('warn', '请先刷新当前视频页', res.error.message);
        showRetry(true);
      } else if (code === 'NO_SUBTITLE') {
        setState('warn', '该视频未提供字幕', '当前页面没有可提取的字幕轨道。');
        showRetry(true);
      } else if (code === 'LOGIN_REQUIRED') {
        setState('warn', '需要先登录 B站', res.error.message);
        showRetry(true);
      } else {
        setState('danger', '识别失败', res?.error?.message || '请刷新视频页后重试。');
        showRetry(true);
      }
      debug.log('结果', code || res?.error?.message);
      return;
    }

    const { context, tracks } = res;
    pageFingerprint = context?.fingerprint || '';
    activeTabId = res.tabId || activeTabId;
    debug.log('识别成功', `轨道数=${tracks.length}`, `bvid=${context.bvid}`, `cid=${context.cid}`, `pageReady=${res.pageReady}`);

    const belongs = sessionBelongsToPage(tabSession, context);
    lastSession = belongs ? tabSession : null;
    updateWorkspaceButton(Boolean(lastSession));

    ui.videoCard.classList.remove('hidden');
    const title = context.title || context.bvid || '未命名视频';
    ui.videoTitle.textContent = title;
    ui.videoTitle.title = title;
    ui.videoSub.textContent = [
      context.owner && `UP ${context.owner}`,
      context.bvid,
      Number(context.pageCount) > 1 ? context.part : ''
    ].filter(Boolean).join(' · ');

    renderTracks(tracks);

    if (!tracks.length) {
      const droppedHint = (res.debug || []).some((line) => /all dropped as foreign|drop foreign/i.test(String(line)));
      if (!res.pageReady && droppedHint) {
        setState('warn', '字幕轨道异常，请刷新页面', '页面脚本未就绪，且接口返回的字幕像是其它视频残留。刷新后再识别。');
      } else if (!res.pageReady) {
        setState('warn', '未识别到字幕轨道', '页面脚本未就绪，请刷新视频页后再试。');
      } else {
        setState('warn', '该视频未提供字幕', '没有可提取的字幕轨道。');
      }
      showExportCard(false);
      updateExtractActions({ canExtract: false, hasCurrentResult: false });
      showRetry(true);
      if (tabSession && !belongs) {
        setStatus(`本标签页另有「${tabSession.video?.title || '其它视频'}」的旧字幕，与当前页无关，已隐藏导出。`, 'warn');
      }
      return;
    }

    setState('ok', `检测到 ${tracks.length} 条字幕轨道`, '选一条轨道，提取后会在工作台里搜索和导出。');

    if (belongs) {
      showExportPanel(lastSession, { stale: Boolean(tabSession?.stale) });
      updateExtractActions({ canExtract: true, hasCurrentResult: true });
      if (tabSession?.stale) {
        setStatus('字幕可能已过期（页面曾切换），建议重新提取。', 'warn');
      }
    } else {
      showExportCard(false);
      setFlow('detect');
      updateExtractActions({ canExtract: true, hasCurrentResult: false });
      if (tabSession && !belongs) {
        setStatus('检测到其它视频的旧字幕，已隐藏；请先提取当前视频。', 'warn');
      }
    }
  } catch (error) {
    if (token !== refreshToken) return;
    setState('danger', '识别失败', error.message || '请刷新后重试。');
    showExportCard(false);
    updateExtractActions({ canExtract: false, hasCurrentResult: false });
    showRetry(true);
  }
}

async function runExtract() {
  if (extracting) return;
  extracting = true;
  const token = ++extractToken;
  const startedFingerprint = pageFingerprint;
  const trackId = ui.trackSelect.value;
  ui.btnExtract.disabled = true;
  if (ui.btnReextract) ui.btnReextract.disabled = true;
  showRetry(false);
  setFlow('extract');
  setStatus('正在提取字幕…', 'info');
  debug.log('—— 提取开始 ——', trackId);

  try {
    const settings = await loadSettings();
    const res = await chrome.runtime.sendMessage({
      type: 'EXTRACT_CURRENT',
      trackId,
      mergeShortLines: settings.mergeShortLines !== false,
      commit: true,
      requestId: token
    });
    if (token !== extractToken) return;

    if (startedFingerprint && pageFingerprint && startedFingerprint !== pageFingerprint) {
      setStatus('页面已切换，已忽略上一视频的提取结果。', 'warn');
      return;
    }

    debug.dump(res?.session?.debug || (res?.error?.detail ? String(res.error.detail).split('\n') : []));
    if (!res?.ok) {
      const code = res?.error?.code;
      setStatus(res?.error?.message || '提取失败，请重试。', 'danger');
      debug.log('提取失败', code, res?.error?.message);
      showRetry(true);
      setFlow('detect');
      return;
    }

    await saveSettings({ lastTrackId: trackId });
    lastSession = res.session;
    activeTabId = res.session?.tabId || activeTabId;
    currentSettings = await loadSettings();
    updateWorkspaceButton(true);
    showExportPanel(res.session, { stale: false });
    updateExtractActions({ canExtract: true, hasCurrentResult: true });
    setState('ok', `提取完成 · ${res.session.cues.length} 条`, '可在下方导出，或打开工作台搜索整理。');
    setStatus('');
    debug.log('提取成功', `cues=${res.session.cues.length}`);
    await promo.rating.noteSuccess();
  } catch (error) {
    if (token !== extractToken) return;
    setStatus(error?.message || '提取失败，请重试。', 'danger');
    showRetry(true);
    setFlow('detect');
  } finally {
    if (token === extractToken) {
      extracting = false;
      updateExtractActions({
        canExtract: Boolean(ui.trackSelect?.value),
        hasCurrentResult: Boolean(lastSession?.cues?.length)
      });
    }
  }
}

ui.btnSettings?.addEventListener('click', openSettings);
ui.settingsBack?.addEventListener('click', closeSettings);

ui.btnWorkspace?.addEventListener('click', () => {
  if (!lastSession?.cues?.length) {
    setStatus('当前视频还没有字幕，请先提取后再打开工作台。', 'warn');
    return;
  }
  const tabId = activeTabId || lastSession?.tabId;
  chrome.runtime.sendMessage({ type: 'OPEN_WORKSPACE', tabId }).then((res) => {
    if (!res?.ok) {
      setStatus(res?.error?.message || '无法打开工作台，请刷新视频页后重试。', 'warn');
      return;
    }
    window.close?.();
  }).catch(() => {
    setStatus('无法打开工作台，请刷新视频页后重试。', 'warn');
  });
});

ui.btnRetry.addEventListener('click', () => refresh());
ui.btnCopyText.addEventListener('click', () => copyExportText(false));
ui.btnCopyTs.addEventListener('click', () => copyExportText(true));
ui.btnExportFile.addEventListener('click', () => downloadExportFile());
ui.btnExtract.addEventListener('click', () => runExtract());
ui.btnReextract?.addEventListener('click', () => runExtract());

document.querySelectorAll('input[name="export-format"]').forEach((input) => {
  input.addEventListener('change', () => syncTimestampToggle(selectedExportFormat()));
});

ui.exportIncludeTs?.addEventListener('change', () => {
  if (!ui.exportIncludeTs.disabled) preferredIncludeTs = ui.exportIncludeTs.checked;
});

$('filename')?.addEventListener('input', updateFilenamePreview);
$('format')?.addEventListener('change', updateFilenamePreview);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'DOWNLOAD_DONE' && message.status === 'complete') {
    setStatus(`已保存 ${message.filename || '文件'}`, 'ok');
    if (message.noteRating !== false) promo.rating.noteSuccess();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' && area !== 'local') return;
  if (changes['bsh.sessions.v2'] || changes['bsh.session.v1']) {
    chrome.runtime.sendMessage({ type: 'GET_SESSION', tabId: activeTabId || undefined }).then((res) => {
      if (!res?.session?.cues?.length) return;
      if (activeTabId && res.session.tabId && Number(res.session.tabId) !== Number(activeTabId)) return;
      if (pageFingerprint && res.session.video?.fingerprint
        && res.session.video.fingerprint !== pageFingerprint) {
        return;
      }
      lastSession = res.session;
      showExportPanel(lastSession, { stale: Boolean(res.session.stale) });
      updateExtractActions({
        canExtract: Boolean(ui.trackSelect?.value),
        hasCurrentResult: true
      });
      updateWorkspaceButton(true);
      if (res.session.stale) {
        setStatus(`字幕仍属「${res.session.video?.title || '上一视频'}」，导出前请确认。`, 'warn');
      }
    }).catch(() => {});
  }
});

settingsForm.hydrate().then(updateFilenamePreview);
refresh();
