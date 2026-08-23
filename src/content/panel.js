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
  icon.src = chrome.runtime.getURL('public/icons/icon128.png');
  icon.alt = '';
  toggle.appendChild(icon);

  const menu = document.createElement('div');
  menu.id = 'bsh-menu';
  menu.className = 'hidden';
  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('src/popup/popup.html?panel=1');
  frame.title = '字幕提取助手';
  menu.appendChild(frame);

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
