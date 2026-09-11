const DOCK_KEY = 'bsh.workspaceOpen';

function clampWidth(viewport) {
  const vw = Number(viewport) || window.innerWidth || 1200;
  if (vw <= 720) return Math.max(420, vw - 16);
  if (vw <= 1100) return Math.min(760, Math.max(640, Math.round(vw * 0.58)));
  return Math.min(880, Math.max(720, Math.round(vw * 0.5)));
}

function isOpen(root) {
  return root && !root.classList.contains('hidden');
}

export function mountWorkspaceDock() {
  if (document.getElementById('bsh-workspace')) return;

  const root = document.createElement('aside');
  root.id = 'bsh-workspace';
  root.className = 'bsh-workspace hidden';
  root.setAttribute('aria-label', '字幕工作台');
  root.tabIndex = -1;

  const bar = document.createElement('div');
  bar.className = 'bsh-workspace-bar';

  const title = document.createElement('span');
  title.className = 'bsh-workspace-title';
  title.textContent = '字幕工作台';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'bsh-workspace-close';
  close.title = '收起工作台';
  close.setAttribute('aria-label', '收起工作台');
  close.textContent = '×';

  bar.append(title, close);

  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('src/workspace/workspace.html?embed=1');
  frame.title = '字幕工作台';

  root.append(bar, frame);
  document.documentElement.appendChild(root);

  let lastFocus = null;

  function applyWidth() {
    const width = clampWidth(window.innerWidth);
    root.style.width = `${width}px`;
    document.documentElement.style.setProperty('--bsh-workspace-width', `${width}px`);
  }

  async function setOpen(open) {
    if (open) {
      lastFocus = document.activeElement;
      applyWidth();
    }
    root.classList.toggle('hidden', !open);
    document.documentElement.classList.toggle('bsh-workspace-open', open);
    if (open) {
      queueMicrotask(() => root.focus({ preventScroll: true }));
    } else if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
    try {
      await chrome.storage.session.set({ [DOCK_KEY]: open });
    } catch {
      // ignore
    }
  }

  close.addEventListener('click', () => setOpen(false));

  window.addEventListener('resize', () => {
    if (isOpen(root)) applyWidth();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen(root)) return;
    if (!root.contains(document.activeElement) && document.activeElement !== root) return;
    // 内部若有弹层（confirm）则不抢占
    if (event.defaultPrevented) return;
    event.preventDefault();
    setOpen(false);
  }, true);

  chrome.storage.session.get(DOCK_KEY).then((data) => {
    if (data[DOCK_KEY]) setOpen(true);
  }).catch(() => {});

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'OPEN_WORKSPACE_DOCK') {
      setOpen(true);
      sendResponse({ ok: true, open: true });
      return true;
    }
    if (message?.type === 'TOGGLE_WORKSPACE_DOCK') {
      const next = message.open == null ? !isOpen(root) : Boolean(message.open);
      setOpen(next);
      sendResponse({ ok: true, open: next });
      return true;
    }
    return undefined;
  });
}
