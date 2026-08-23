import { loadSettings, saveSettings } from '../storage/settings.js';
import { filterCues, highlightText } from '../features/search/search.js';
import { cuesToTxt } from '../features/export/exporter.js';
import { partLabel } from '../features/video-context/sync.js';
import { formatTimeRange } from '../shared/time.js';
import { bindPromo } from '../features/remote/ui.js';

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
  count: $('count'),
  empty: $('empty'),
  listWrap: $('list-wrap'),
  list: $('list'),
  includeTs: $('include-ts'),
  btnCopy: $('btn-copy'),
  btnCopyTs: $('btn-copy-ts'),
  btnExport: $('btn-export'),
  toast: $('toast')
};

let session = null;
let settings = null;
let visible = [];
let toastTimer = 0;
let hydrating = false;
let busy = false;

function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
}

function selectedFormat() {
  return document.querySelector('input[name="format"]:checked')?.value || 'markdown';
}

function visibleCues() {
  return visible.map((item) => item.cue);
}

function showEmpty(title, desc) {
  ui.empty.classList.remove('hidden');
  ui.listWrap.classList.add('hidden');
  ui.empty.querySelector('strong').textContent = title;
  ui.empty.querySelector('p').textContent = desc;
}

function applyFilter() {
  visible = filterCues(session?.cues || [], ui.search.value);
  const last = session?.cues?.[session.cues.length - 1];
  const span = last
    ? formatTimeRange(session.cues[0].startMs, last.endMs || last.startMs, settings?.timestampFormat)
    : '';
  const raw = Number(session?.rawCueCount) > visible.length && !ui.search.value.trim()
    ? ` · 原始 ${session.rawCueCount} 条`
    : '';
  ui.count.textContent = [
    `${visible.length} 条${ui.search.value.trim() ? '匹配' : ''}`,
    span,
    raw.replace(/^ · /, '')
  ].filter(Boolean).join(' · ');
  renderWindow();
}

function createCueRow(cue, keyword, timeStyle) {
  const row = document.createElement('div');
  row.className = 'cue';

  const time = document.createElement('div');
  time.className = 'cue-time';
  time.textContent = formatTimeRange(cue.startMs, cue.endMs, timeStyle);

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
  ui.empty.classList.add('hidden');
  ui.listWrap.classList.remove('hidden');
  const keyword = ui.search.value.trim();
  const timeStyle = settings?.timestampFormat || 'clock';
  const frag = document.createDocumentFragment();
  for (const cue of visibleCues()) {
    frag.appendChild(createCueRow(cue, keyword, timeStyle));
  }
  ui.list.replaceChildren(frag);
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
  ui.stale.classList.toggle('hidden', !stale);
  if (!stale) return;
  const to = session.changedTo;
  const tracks = Number(to?.trackCount);
  const trackHint = Number.isFinite(tracks)
    ? (tracks > 0 ? `检测到 ${tracks} 条字幕轨道。` : '当前视频未提供字幕。')
    : '';
  ui.staleText.textContent = to
    ? `页面已切换到「${to.title || to.part || to.bvid || '另一个视频'}」。${trackHint}下面仍是上一份字幕，导出前请先提取当前视频。`
    : '视频或分P已切换。下面仍是上一份字幕，导出前请先提取当前视频。';
}

async function copyText(withTime) {
  const text = cuesToTxt(visibleCues(), {
    includeTimestamp: withTime,
    timestampFormat: settings?.timestampFormat,
    paragraphGap: 'compact'
  });
  try {
    await navigator.clipboard.writeText(text);
    toast(withTime ? '已复制带时间轴文本' : '已复制纯文本');
  } catch {
    toast('复制失败。请检查浏览器是否允许读取剪贴板。');
  }
}

async function exportFile() {
  if (!session) return;
  if (session.stale) {
    const ok = window.confirm('当前仍是切换前的字幕。确定要导出这一份，而不是先提取当前视频吗？');
    if (!ok) return;
  }
  const format = selectedFormat();
  const current = await loadSettings();
  const options = {
    includeTimestamp: ui.includeTs.checked,
    filenameTemplate: current.filenameTemplate,
    mergeShortLines: current.mergeShortLines,
    timestampFormat: current.timestampFormat,
    paragraphGap: 'compact'
  };
  const res = await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_EXPORT',
    format,
    video: session.video,
    track: session.track,
    cues: visibleCues(),
    options
  });
  if (!res?.ok) {
    toast(res?.error?.message || '导出失败');
    return;
  }
  await saveSettings({ format, includeTimestamp: ui.includeTs.checked });
  toast(`已开始下载 ${res.filename}`);
  await promo.rating.noteSuccess();
}

async function extractNow({ partNo } = {}) {
  if (busy) return;
  busy = true;
  toast(partNo ? '正在切换分P并提取字幕…' : '正在提取当前视频字幕…');
  const current = await loadSettings();
  const type = partNo ? 'SWITCH_AND_EXTRACT' : 'EXTRACT_CURRENT';
  const res = await chrome.runtime.sendMessage({
    type,
    tabId: session?.tabId,
    partNo,
    trackId: current.lastTrackId,
    mergeShortLines: current.mergeShortLines
  });
  busy = false;
  if (!res?.ok) {
    toast(res?.error?.message || '提取失败，请回到视频页重试。');
    return;
  }
  toast(`已整理 ${res.session.cues.length} 条字幕`);
  await promo.rating.noteSuccess();
}

async function hydrate() {
  hydrating = true;
  settings = await loadSettings();
  ui.includeTs.checked = settings.includeTimestamp !== false;
  const formatInput = document.querySelector(`input[name="format"][value="${settings.format}"]`);
  if (formatInput) formatInput.checked = true;

  const res = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
  session = res?.session || null;
  if (!session?.cues?.length) {
    ui.stale.classList.add('hidden');
    ui.partField.classList.add('hidden');
    showEmpty('还没有字幕', '打开 B站视频页，点击扩展图标，选择字幕轨道后提取。');
    hydrating = false;
    return;
  }

  ui.title.textContent = session.video?.title || session.video?.bvid || '已提取字幕';
  ui.sub.textContent = [
    session.video?.owner && `UP ${session.video.owner}`,
    session.video?.bvid,
    session.video?.part,
    session.track?.label
  ].filter(Boolean).join(' · ');
  fillParts();
  renderStale();
  applyFilter();
  hydrating = false;
}

ui.search.addEventListener('input', applyFilter);
ui.btnCopy.addEventListener('click', () => copyText(false));
ui.btnCopyTs.addEventListener('click', () => copyText(true));
ui.btnExport.addEventListener('click', exportFile);
ui.btnExtractCurrent.addEventListener('click', () => extractNow());
ui.partSelect.addEventListener('change', () => {
  if (hydrating) return;
  extractNow({ partNo: Number(ui.partSelect.value) });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' && area !== 'local') return;
  if (changes['bsh.session.v1'] || changes['bsh.settings.v1']) hydrate();
});

hydrate();
