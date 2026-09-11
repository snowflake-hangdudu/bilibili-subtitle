import { debugEnabled } from './debug-flag.js';

function shortUrl(value) {
  try {
    const url = new URL(String(value || ''), 'https://www.bilibili.com');
    const tail = url.pathname.split('/').filter(Boolean).pop() || '';
    return `${url.hostname}/${tail}`.slice(0, 80);
  } catch {
    return String(value || '').slice(0, 80);
  }
}

function copyViaTextarea(doc, text) {
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:8px;top:8px;width:12px;height:12px;opacity:0.02;z-index:2147483647';
  doc.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, text.length);
  const ok = doc.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('execCommand copy failed');
}

export function bindDebug(root = document) {
  const box = root.querySelector('#debug-box');
  if (!debugEnabled()) {
    box?.remove();
    return {
      enabled: false,
      log() {},
      lines() { return []; },
      dump() {},
      shortUrl
    };
  }
  if (!box) {
    return { enabled: false, log() {}, lines() { return []; }, dump() {}, shortUrl };
  }

  box.classList.remove('hidden');
  const logEl = box.querySelector('#debug-log');
  const countEl = box.querySelector('#debug-count');
  const copyEl = box.querySelector('#debug-copy');
  const toggleEl = box.querySelector('#debug-toggle');
  const lines = [];

  function setCollapsed(collapsed) {
    box.classList.toggle('is-collapsed', collapsed);
    toggleEl?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  function render() {
    if (logEl) logEl.textContent = lines.join('\n') || '暂无日志';
    if (countEl) countEl.textContent = String(lines.length);
  }

  function log(...args) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const text = args.map((item) => {
      if (item && typeof item === 'object') {
        try { return JSON.stringify(item); } catch { return String(item); }
      }
      return String(item);
    }).join(' ');
    lines.push(`[${time}] ${text}`);
    if (lines.length > 80) lines.shift();
    console.log('[BSH]', ...args);
    render();
  }

  async function copy() {
    const text = lines.join('\n') || '暂无日志';
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else copyViaTextarea(document, text);
    } catch {
      copyViaTextarea(document, text);
    }
    if (copyEl) {
      copyEl.textContent = '已复制';
      setTimeout(() => { copyEl.textContent = '复制'; }, 1200);
    }
    log('调试日志已复制');
  }

  function bindButton(el, handler) {
    if (!el || el.dataset.debugBound) return;
    el.dataset.debugBound = '1';
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler();
    });
  }

  bindButton(box.querySelector('#debug-clear'), () => {
    lines.length = 0;
    render();
  });
  bindButton(copyEl, () => {
    copy().catch((error) => log('复制失败', error.message || error));
  });
  bindButton(toggleEl, () => {
    setCollapsed(!box.classList.contains('is-collapsed'));
  });
  setCollapsed(true);
  render();

  return {
    enabled: true,
    log,
    lines: () => lines.slice(),
    dump(items) {
      for (const item of items || []) log(item);
    },
    shortUrl
  };
}
