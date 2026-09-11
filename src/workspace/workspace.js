import { loadSettings, saveSettings } from '../storage/settings.js';
import { filterCues, highlightText } from '../features/search/search.js';
import { cuesToTxt } from '../features/export/exporter.js';
import { partLabel } from '../features/video-context/sync.js';
import { cuesMatchVideo } from '../features/video-context/detect.js';
import { bindDebug } from '../shared/debug.js';
import { formatTimeRange } from '../shared/time.js';
import { bindPromo } from '../features/remote/ui.js';
import { SESSION_MAP_KEY, SESSION_LEGACY_KEY } from '../storage/session.js';

if (new URLSearchParams(location.search).get('embed') === '1') {
  document.body.dataset.embed = '1';
}

const debug = bindDebug(document);
const promo = bindPromo(document);
const $ = (id) => document.getElementById(id);

const ui = {
  title: $('video-title'),
  sub: $('video-sub'),
  stale: $('stale-banner'),
  staleText: $('stale-text'),
  btnExtractCurrent: $('btn-extract-current'),
  partField: $('part-field'),
  partSelect: $('part-select'),
  search: $('search'),
  btnClearSearch: $('btn-clear-search'),
  count: $('count'),
  empty: $('empty'),
  emptyClear: $('empty-clear'),
  listWrap: $('list-wrap'),
  listSpacer: $('list-spacer'),
  list: $('list'),
  includeTs: $('include-ts'),
  tsLabel: $('ts-label'),
  btnCopy: $('btn-copy'),
  btnCopyTs: $('btn-copy-ts'),
  btnExport: $('btn-export'),
  exportCount: $('export-count'),
  scopeAllLabel: $('scope-all-label'),
  scopeMatchedLabel: $('scope-matched-label'),
  scopeMatchedWrap: $('scope-matched-wrap'),
  toast: $('toast')
};

const ROW_ESTIMATE = 52;
const OVERSCAN = 12;

let session = null;
let settings = null;
let visible = [];
let toastTimer = 0;
let hydrating = false;
let busy = false;
let preferredIncludeTs = true;
let searchTimer = 0;
let boundTabId = 0;
let scrollRaf = 0;

function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
}

function selectedFormat() {
  return document.querySelector('input[name="format"]:checked')?.value || 'txt';
}

function selectedScope() {
  return document.querySelector('input[name="export-scope"]:checked')?.value || 'all';
}

function allCues() {
  return session?.cues || [];
}

function matchedCues() {
  return visible.map((item) => item.cue);
}

function exportCues() {
  const scope = selectedScope();
  if (scope === 'matched' && ui.search.value.trim()) return matchedCues();
  return allCues();
}

function syncScopeLabels() {
  const total = allCues().length;
  const matched = matchedCues().length;
  const hasQuery = Boolean(ui.search.value.trim());
  ui.scopeAllLabel.textContent = `全部字幕（${total} 条）`;
  ui.scopeMatchedLabel.textContent = `搜索结果（${matched} 条）`;
  ui.scopeMatchedWrap.classList.toggle('hidden', !hasQuery);
  if (!hasQuery) {
    const all = document.querySelector('input[name="export-scope"][value="all"]');
    if (all) all.checked = true;
  }
  const cues = exportCues();
  ui.exportCount.textContent = `本次 ${cues.length} 条`;
  const emptyResult = hasQuery && matched === 0;
  ui.btnCopy.disabled = !cues.length || emptyResult;
  ui.btnCopyTs.disabled = !cues.length || emptyResult;
  ui.btnExport.disabled = !cues.length || emptyResult;
}

function syncTimestampToggle(format) {
  const isSrt = format === 'srt';
  if (isSrt) {
    preferredIncludeTs = ui.includeTs.checked;
    ui.includeTs.checked = true;
    ui.includeTs.disabled = true;
    if (ui.tsLabel) ui.tsLabel.textContent = 'SRT 始终包含时间轴';
  } else {
    ui.includeTs.disabled = false;
    ui.includeTs.checked = preferredIncludeTs;
    if (ui.tsLabel) ui.tsLabel.textContent = '导出时带时间轴';
  }
}

function showEmpty(title, desc, { clearable = false } = {}) {
  ui.empty.classList.remove('hidden');
  ui.listWrap.classList.add('hidden');
  ui.empty.querySelector('strong').textContent = title;
  ui.empty.querySelector('p').textContent = desc;
  ui.emptyClear?.classList.toggle('hidden', !clearable);
}

function applyFilter() {
  visible = filterCues(session?.cues || [], ui.search.value);
  const hasQuery = Boolean(ui.search.value.trim());
  ui.btnClearSearch?.classList.toggle('hidden', !hasQuery);
  const last = session?.cues?.[session.cues.length - 1];
  const span = last && !hasQuery
    ? formatTimeRange(session.cues[0].startMs, last.endMs || last.startMs, settings?.timestampFormat)
    : '';
  ui.count.textContent = [
    hasQuery ? `${visible.length} 条匹配 / 共 ${allCues().length} 条` : `${visible.length} 条`,
    span
  ].filter(Boolean).join(' · ');
  syncScopeLabels();
  renderWindow();
}

function scheduleFilter() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilter, 150);
}

function createCueRow(cue, keyword, timeStyle) {
  const row = document.createElement('div');
  row.className = 'cue';
  row.dataset.start = String(cue.startMs);

  const time = document.createElement('button');
  time.type = 'button';
  time.className = 'cue-time';
  time.textContent = formatTimeRange(cue.startMs, cue.endMs, timeStyle);
  time.title = '跳转到该时间';
  time.addEventListener('click', () => seekTo(cue.startMs));

  const text = document.createElement('div');
  text.className = 'cue-text';
  text.innerHTML = highlightText(cue.text, keyword);

  row.append(time, text);
  return row;
}

function renderWindow() {
  if (!session?.cues?.length) {
    showEmpty('还没有字幕', '打开 B站视频页，点击扩展图标，选择字幕轨道后提取。');
    return;
  }
  if (!visible.length) {
    showEmpty('没有匹配结果', '换个关键词，或清空搜索查看全部字幕。', { clearable: true });
    return;
  }

  ui.empty.classList.add('hidden');
  ui.listWrap.classList.remove('hidden');

  const keyword = ui.search.value.trim();
  const timeStyle = settings?.timestampFormat || 'clock';
  const total = visible.length;
  const scrollTop = ui.listWrap.scrollTop;
  const viewport = ui.listWrap.clientHeight || 600;
  const start = Math.max(0, Math.floor(scrollTop / ROW_ESTIMATE) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + viewport) / ROW_ESTIMATE) + OVERSCAN);

  ui.listSpacer.style.height = `${total * ROW_ESTIMATE}px`;
  ui.list.style.transform = `translateY(${start * ROW_ESTIMATE}px)`;

  const frag = document.createDocumentFragment();
  for (let i = start; i < end; i += 1) {
    frag.appendChild(createCueRow(visible[i].cue, keyword, timeStyle));
  }
  ui.list.replaceChildren(frag);
}

function onListScroll() {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    renderWindow();
  });
}

function fillParts() {
  const pages = session?.video?.pages || [];
  if (session?.stale || pages.length <= 1) {
    ui.partField.classList.add('hidden');
    return;
  }
  ui.partField.classList.remove('hidden');
  ui.partSelect.replaceChildren();
  for (const page of pages) {
    const option = document.createElement('option');
    option.value = String(page.page || '');
    option.textContent = partLabel(page);
    ui.partSelect.appendChild(option);
  }
  ui.partSelect.value = String(session.video.partNo || pages[0].page || 1);
}

function renderStale() {
  const stale = Boolean(session?.stale);
  const mismatch = Boolean(session && !cuesMatchVideo(session.cues, session.video?.durationSec));
  ui.stale.classList.toggle('hidden', !stale && !mismatch);
  if (!stale && !mismatch) return;
  const to = session.changedTo;
  const oldTitle = session.video?.title || session.video?.bvid || '上一份字幕';
  const oldPart = session.video?.part ? `（${session.video.part}）` : '';
  const tracks = Number(to?.trackCount);
  const trackHint = Number.isFinite(tracks)
    ? (tracks > 0 ? `检测到 ${tracks} 条字幕轨道。` : '当前视频未提供字幕。')
    : '';
  if (stale && to) {
    ui.staleText.textContent = `页面已切换到「${to.title || to.part || to.bvid || '另一个视频'}」。${trackHint}下面仍是「${oldTitle}」${oldPart} 的字幕。`;
    return;
  }
  if (stale) {
    ui.staleText.textContent = `视频或分P已切换。下面仍是「${oldTitle}」${oldPart} 的字幕，导出前请先提取当前视频。`;
    return;
  }
  ui.staleText.textContent = `这份字幕的时长和当前视频对不上，可能还是「${oldTitle}」。请重新提取后再导出。`;
}

function confirmStaleExport() {
  if (!session) return false;
  const stale = session.stale || !cuesMatchVideo(session.cues, session.video?.durationSec);
  if (!stale) return true;
  const oldTitle = session.video?.title || session.video?.bvid || '旧字幕所属视频';
  return window.confirm(
    `当前仍是「${oldTitle}」的字幕，不是当前页面视频。\n确定仍要复制/导出这份旧字幕吗？\n（文件信息会使用旧字幕所属视频，不会混入当前页标题）`
  );
}

async function seekTo(startMs) {
  if (!session?.tabId) {
    toast('找不到来源标签页，请回到视频页重新打开工作台。');
    return;
  }
  if (session.stale) {
    toast('视频已切换，请先提取当前视频后再跳转。');
    return;
  }
  const res = await chrome.runtime.sendMessage({
    type: 'SEEK_VIDEO',
    tabId: session.tabId,
    startMs,
    fingerprint: session.video?.fingerprint
  });
  if (!res?.ok) {
    toast(res?.error?.message || '无法跳转播放进度。');
    return;
  }
  toast('已定位到该时间');
}

async function copyText(withTime) {
  const cues = exportCues();
  if (!cues.length) {
    toast('没有可复制的字幕。');
    return;
  }
  if (!confirmStaleExport()) return;
  const text = cuesToTxt(cues, {
    includeTimestamp: withTime,
    timestampFormat: settings?.timestampFormat,
    paragraphGap: 'compact'
  });
  try {
    await navigator.clipboard.writeText(text);
    toast(withTime ? `已复制带时间轴文本（${cues.length} 条）` : `已复制纯文本（${cues.length} 条）`);
  } catch {
    toast('复制失败。请检查浏览器是否允许读取剪贴板。');
  }
}

async function exportFile() {
  if (!session) return;
  const cues = exportCues();
  if (!cues.length) {
    toast('没有可导出的字幕。');
    return;
  }
  if (!confirmStaleExport()) return;
  const format = selectedFormat();
  const current = await loadSettings();
  const options = {
    includeTimestamp: format === 'srt' ? true : ui.includeTs.checked,
    filenameTemplate: current.filenameTemplate,
    mergeShortLines: current.mergeShortLines,
    timestampFormat: current.timestampFormat,
    paragraphGap: 'compact',
    noteRating: true
  };
  ui.btnExport.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'DOWNLOAD_EXPORT',
      format,
      video: session.video,
      track: session.track,
      cues,
      options
    });
    if (!res?.ok) {
      toast(res?.error?.message || '导出失败');
      return;
    }
    await saveSettings({
      format,
      includeTimestamp: format === 'srt' ? preferredIncludeTs : ui.includeTs.checked
    });
    toast(`已发起下载 ${res.filename}（${cues.length} 条）`);
  } catch (error) {
    toast(error?.message || '导出失败');
  } finally {
    syncScopeLabels();
  }
}

async function extractNow({ partNo } = {}) {
  if (busy) return;
  busy = true;
  toast(partNo ? '正在切换分P并提取字幕…' : '正在提取当前视频字幕…');
  try {
    const current = await loadSettings();
    const type = partNo ? 'SWITCH_AND_EXTRACT' : 'EXTRACT_CURRENT';
    const res = await chrome.runtime.sendMessage({
      type,
      tabId: session?.tabId || boundTabId,
      partNo,
      trackId: current.lastTrackId,
      mergeShortLines: current.mergeShortLines,
      commit: true
    });
    debug.dump(res?.session?.debug || (res?.error?.detail ? String(res.error.detail).split('\n') : []));
    if (!res?.ok) {
      toast(res?.error?.message || '提取失败，请回到视频页重试。');
      return;
    }
    session = res.session;
    toast(`已核对并更新 ${res.session.cues.length} 条字幕`);
    await promo.rating.noteSuccess();
    await hydrate();
  } catch (error) {
    toast(error?.message || '提取失败，请回到视频页重试。');
  } finally {
    busy = false;
  }
}

async function hydrate() {
  hydrating = true;
  try {
    settings = await loadSettings();
    preferredIncludeTs = settings.includeTimestamp !== false;
    ui.includeTs.checked = preferredIncludeTs;
    const formatInput = document.querySelector(`input[name="format"][value="${settings.format}"]`);
    if (formatInput) formatInput.checked = true;
    syncTimestampToggle(settings.format || 'txt');

    const hello = await chrome.runtime.sendMessage({ type: 'WORKSPACE_HELLO' }).catch(() => null);
    boundTabId = hello?.tabId || boundTabId;

    const res = await chrome.runtime.sendMessage({
      type: 'GET_SESSION',
      tabId: boundTabId || session?.tabId || undefined
    });
    boundTabId = res?.tabId || boundTabId;
    session = res?.session || null;

    if (!session?.cues?.length) {
      ui.stale.classList.add('hidden');
      ui.partField.classList.add('hidden');
      showEmpty('还没有字幕', '打开 B站视频页，点击扩展图标，选择字幕轨道后提取。');
      syncScopeLabels();
      return;
    }

    ui.title.textContent = session.video?.title || session.video?.bvid || '已提取字幕';
    ui.title.title = ui.title.textContent;
    ui.sub.textContent = [
      session.video?.owner && `UP ${session.video.owner}`,
      session.video?.part,
      session.track?.label
    ].filter(Boolean).join(' · ');
    fillParts();
    renderStale();
    applyFilter();
    promo.rating.restoreIfNeeded();
  } finally {
    hydrating = false;
  }
}

function clearSearch() {
  ui.search.value = '';
  applyFilter();
  ui.search.focus();
}

ui.search.addEventListener('input', scheduleFilter);
ui.btnClearSearch?.addEventListener('click', clearSearch);
ui.emptyClear?.addEventListener('click', clearSearch);
ui.btnCopy.addEventListener('click', () => copyText(false));
ui.btnCopyTs.addEventListener('click', () => copyText(true));
ui.btnExport.addEventListener('click', exportFile);
ui.btnExtractCurrent.addEventListener('click', () => extractNow());
ui.partSelect.addEventListener('change', () => {
  if (hydrating) return;
  extractNow({ partNo: Number(ui.partSelect.value) });
});
ui.listWrap.addEventListener('scroll', onListScroll, { passive: true });

document.querySelectorAll('input[name="format"]').forEach((input) => {
  input.addEventListener('change', () => syncTimestampToggle(selectedFormat()));
});
document.querySelectorAll('input[name="export-scope"]').forEach((input) => {
  input.addEventListener('change', syncScopeLabels);
});
ui.includeTs.addEventListener('change', () => {
  if (!ui.includeTs.disabled) preferredIncludeTs = ui.includeTs.checked;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' && area !== 'local') return;
  if (changes[SESSION_MAP_KEY] || changes[SESSION_LEGACY_KEY] || changes['bsh.settings.v1']) hydrate();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'DOWNLOAD_DONE' && message.status === 'complete') {
    toast(`已保存 ${message.filename || '文件'}`);
    if (message.noteRating !== false) promo.rating.noteSuccess();
  }
});

hydrate();
