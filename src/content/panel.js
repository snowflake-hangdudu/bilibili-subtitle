const PANEL_KEY = 'bsh.panelOpen';

function isOpen(menu) {
  return menu && !menu.classList.contains('hidden');
}

export function mountPanel() {
  if (document.getElementById('bsh-dock')) return;

  const dock = document.createElement('div');
  dock.id = 'bsh-dock';

  const toggle = document.createElement('button');
  toggle.id = 'bsh-toggle';
  toggle.type = 'button';
  toggle.title = '字幕提取助手';
  const icon = document.createElement('img');
  icon.src = chrome.runtime.getURL('icons/icon128.png');
  icon.alt = '';
  toggle.appendChild(icon);

  const menu = document.createElement('div');
  menu.id = 'bsh-menu';
  menu.className = 'hidden';
  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('src/popup/popup.html?panel=1');
  frame.title = '字幕提取助手';
  menu.appendChild(frame);

  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type !== 'BSH_PANEL_RESIZE') return;
    const max = Math.min(640, window.innerHeight - 180);
    const next = Math.max(360, Math.min(Number(event.data.height) || 0, max));
    if (next > 0) {
      frame.style.height = `${next}px`;
      menu.style.maxHeight = `${max}px`;
    }
  });

  dock.append(toggle, menu);
  document.documentElement.appendChild(dock);

  async function setOpen(open) {
    menu.classList.toggle('hidden', !open);
    try {
      await chrome.storage.session.set({ [PANEL_KEY]: open });
    } catch {
      // 旧浏览器没有 session storage 时忽略
    }
  }

  toggle.addEventListener('click', () => {
    setOpen(!isOpen(menu));
  });

  chrome.storage.session.get(PANEL_KEY).then((data) => {
    if (data[PANEL_KEY]) setOpen(true);
  }).catch(() => {});

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'TOGGLE_PANEL') return undefined;
    const next = message.open == null ? !isOpen(menu) : Boolean(message.open);
    setOpen(next);
    sendResponse({ ok: true, open: next });
    return true;
  });
}
