import { loadSettings, saveSettings } from '../storage/settings.js';
import { bindPromo } from '../features/remote/ui.js';
import { bindDebug } from '../shared/debug.js';

const debug = bindDebug(document);

const promo = bindPromo(document);

const $ = (id) => document.getElementById(id);

const ui = {
  stateTitle: $('state-title'),
  stateDesc: $('state-desc'),
  stateDot: $('state-dot'),
  videoCard: $('video-card'),
  videoTitle: $('video-title'),
  videoSub: $('video-sub'),
  trackSelect: $('track-select'),
  trackEmpty: $('track-empty'),
  mergeShort: $('merge-short'),
  btnExtract: $('btn-extract'),
  btnRetry: $('btn-retry'),
  btnWorkspace: $('btn-workspace'),
  btnOptions: $('btn-options'),
  status: $('status')
};

function setState(tone, title, desc) {
  ui.stateDot.className = `dot ${tone === 'loading' ? 'pulse' : tone}`;
  ui.stateTitle.textContent = title;
  ui.stateDesc.textContent = desc;
}

function setStatus(message, tone = 'info') {
  ui.status.textContent = message || '';
  ui.status.dataset.tone = tone;
}

function showRetry(show) {
  ui.btnRetry.classList.toggle('hidden', !show);
}

function sourceLabel(track) {
  if (track.sourceType === 'ai') return '自动';
  if (track.sourceType === 'official') return '人工';
  return '字幕';
}

async function refresh() {
  setState('loading', '正在识别当前页面…', '打开 B站视频页后，我会检测可用字幕轨道。');
  ui.videoCard.classList.add('hidden');
  ui.btnExtract.disabled = true;
  showRetry(false);
  setStatus('');

  const settings = await loadSettings();
  ui.mergeShort.checked = settings.mergeShortLines !== false;

  const res = await chrome.runtime.sendMessage({ type: 'STATUS_CURRENT' });
  if (!res?.ok) {
    const code = res?.error?.code;
    const session = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    ui.btnWorkspace.classList.toggle('hidden', !session?.session?.cues?.length);
    if (code === 'NOT_VIDEO_PAGE' || code === 'TAB_GONE') {
      setState('warn', '还不是 B站视频页', '请先打开一个视频，再点扩展图标。');
    } else if (code === 'CONTENT_NOT_READY') {
      setState('warn', '请先刷新当前视频页', res.error.message);
      showRetry(true);
    } else if (code === 'NO_SUBTITLE') {
      setState('warn', '该视频未提供字幕', '这不是故障。当前页面没有可提取的字幕轨道。');
      showRetry(true);
    } else if (code === 'LOGIN_REQUIRED') {
      setState('warn', '需要先登录 B站', res.error.message);
      showRetry(true);
    } else {
      setState('danger', '识别失败', res?.error?.message || '请刷新视频页后重试。');
      showRetry(true);
    }
    return;
  }

  debug.dump(res.debug);
  const { context, tracks } = res;
  ui.videoCard.classList.remove('hidden');
  ui.videoTitle.textContent = context.title || context.bvid || '未命名视频';
  ui.videoSub.textContent = [
    context.owner && `UP ${context.owner}`,
    context.bvid,
    Number(context.pageCount) > 1 ? context.part : ''
  ].filter(Boolean).join(' · ');

  ui.trackSelect.replaceChildren();
  ui.trackSelect.classList.toggle('is-empty', !tracks.length);
  ui.trackSelect.disabled = !tracks.length;
  ui.trackEmpty?.classList.toggle('hidden', Boolean(tracks.length));
  if (!tracks.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '暂无字幕轨道';
    ui.trackSelect.appendChild(option);
    setState('warn', '该视频未提供字幕', '没有可提取的字幕轨道，不会生成字幕或调用识别服务。');
    ui.btnExtract.disabled = true;
    showRetry(true);
    return;
  }
  for (const track of tracks) {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = `${track.label} · ${sourceLabel(track)}`;
    ui.trackSelect.appendChild(option);
  }
  if (settings.lastTrackId && tracks.some((track) => track.id === settings.lastTrackId)) {
    ui.trackSelect.value = settings.lastTrackId;
  }

  setState('ok', `检测到 ${tracks.length} 条字幕轨道`, '选一条轨道，提取后会在工作台里搜索和导出。');
  ui.btnExtract.disabled = false;

  const session = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
  const hasSession = Boolean(session?.session?.cues?.length);
  ui.btnWorkspace.classList.toggle('hidden', !hasSession);
  if (session?.session?.stale) {
    setStatus('页面已切换，工作台里仍是上一份字幕。请重新提取，避免导错。', 'warn');
  }
}

ui.mergeShort.addEventListener('change', () => {
  saveSettings({ mergeShortLines: ui.mergeShort.checked });
});

ui.btnOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

ui.btnWorkspace.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_WORKSPACE' });
});

ui.btnRetry.addEventListener('click', () => {
  refresh().catch((error) => {
    setState('danger', '识别失败', error.message || '请刷新后重试。');
    showRetry(true);
  });
});

ui.btnExtract.addEventListener('click', async () => {
  ui.btnExtract.disabled = true;
  showRetry(false);
  setStatus('正在提取并自动核对…', 'info');
  debug.log('开始提取', ui.trackSelect.value);
  const res = await chrome.runtime.sendMessage({
    type: 'EXTRACT_CURRENT',
    trackId: ui.trackSelect.value,
    mergeShortLines: ui.mergeShort.checked,
    commit: true
  });
  debug.dump(res?.session?.debug || (res?.error?.detail ? String(res.error.detail).split('\n') : []));
  if (!res?.ok) {
    setStatus(res?.error?.message || '提取失败，请重试。', 'danger');
    debug.log('提取失败', res?.error?.code, res?.error?.message);
    ui.btnExtract.disabled = false;
    showRetry(true);
    return;
  }
  await saveSettings({
    lastTrackId: ui.trackSelect.value,
    mergeShortLines: ui.mergeShort.checked
  });
  setStatus(`已核对 ${res.session.cues.length} 条字幕，正在打开工作台。`, 'ok');
  ui.btnWorkspace.classList.remove('hidden');
  await promo.rating.noteSuccess();
  await chrome.runtime.sendMessage({ type: 'OPEN_WORKSPACE' });
  ui.btnExtract.disabled = false;
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'BSH_VIDEO_CHANGED') {
    refresh().catch(() => {});
  }
});

refresh().catch((error) => {
  setState('danger', '识别失败', error.message || '请刷新后重试。');
  showRetry(true);
});
