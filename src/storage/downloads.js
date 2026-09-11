const PENDING_KEY = 'bsh.downloads.pending.v1';
const DONE_KEY = 'bsh.downloads.done.v1';

async function loadPending() {
  const data = await chrome.storage.session.get(PENDING_KEY).catch(() => ({}));
  const value = data?.[PENDING_KEY];
  return value && typeof value === 'object' ? value : {};
}

async function savePending(map) {
  try {
    await chrome.storage.session.set({ [PENDING_KEY]: map });
  } catch {
    // ignore
  }
}

async function markDone(downloadId, status) {
  const data = await chrome.storage.local.get(DONE_KEY);
  const list = Array.isArray(data[DONE_KEY]) ? data[DONE_KEY] : [];
  if (list.some((item) => item.id === downloadId)) return false;
  list.unshift({ id: downloadId, status, at: Date.now() });
  await chrome.storage.local.set({ [DONE_KEY]: list.slice(0, 40) });
  return true;
}

export async function trackDownload(downloadId, meta = {}) {
  if (!downloadId) return;
  const map = await loadPending();
  map[String(downloadId)] = {
    ...meta,
    status: 'started',
    startedAt: Date.now()
  };
  await savePending(map);
}

export async function getDownloadStatus(downloadId) {
  if (!downloadId) return { status: 'unknown' };
  const map = await loadPending();
  const pending = map[String(downloadId)];
  if (pending) return { ...pending, downloadId };

  try {
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (!item) return { status: 'unknown', downloadId };
    if (item.state === 'complete') return { status: 'complete', downloadId, filename: item.filename };
    if (item.state === 'interrupted') return { status: 'failed', downloadId, error: item.error };
    if (item.state === 'in_progress') return { status: 'started', downloadId };
  } catch {
    // ignore
  }
  return { status: 'unknown', downloadId };
}

export function bindDownloadListeners({ onComplete } = {}) {
  if (!chrome.downloads?.onChanged) return () => {};

  const handler = async (delta) => {
    if (!delta?.id) return;
    const map = await loadPending();
    const key = String(delta.id);
    const entry = map[key];
    if (!entry) return;

    if (delta.state?.current === 'complete') {
      delete map[key];
      await savePending(map);
      const first = await markDone(delta.id, 'complete');
      if (first && onComplete) await onComplete({ downloadId: delta.id, ...entry });
      return;
    }

    if (delta.state?.current === 'interrupted') {
      const error = delta.error?.current || 'interrupted';
      map[key] = { ...entry, status: 'failed', error };
      await savePending(map);
      await markDone(delta.id, 'failed');
    }
  };

  chrome.downloads.onChanged.addListener(handler);
  return () => chrome.downloads.onChanged.removeListener(handler);
}
