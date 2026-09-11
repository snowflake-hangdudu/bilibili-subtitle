const LEGACY_KEY = 'bsh.session.v1';
const MAP_KEY = 'bsh.sessions.v2';
const DIAG_KEY = 'bsh.diagnostics.v1';
const MAX_SESSIONS = 12;

async function store() {
  return chrome.storage.session || chrome.storage.local;
}

function tabKey(tabId) {
  const id = Number(tabId);
  return Number.isFinite(id) && id > 0 ? String(id) : '';
}

async function readMap(bucket) {
  const data = await bucket.get([MAP_KEY, LEGACY_KEY]);
  const raw = data[MAP_KEY];
  const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};

  // 迁移旧的单一会话：仅在有可核对 tabId 时写入分表
  const legacy = data[LEGACY_KEY];
  if (legacy && typeof legacy === 'object') {
    const key = tabKey(legacy.tabId);
    if (key && !map[key]) map[key] = legacy;
    await bucket.remove(LEGACY_KEY).catch(() => {});
    if (key) await bucket.set({ [MAP_KEY]: map }).catch(() => {});
  }
  return map;
}

async function writeMap(bucket, map) {
  const entries = Object.entries(map)
    .filter(([, session]) => session && typeof session === 'object')
    .sort((a, b) => Number(b[1].extractedAt || 0) - Number(a[1].extractedAt || 0))
    .slice(0, MAX_SESSIONS);
  const next = Object.fromEntries(entries);
  await bucket.set({ [MAP_KEY]: next });
  return next;
}

export async function saveSession(session) {
  const key = tabKey(session?.tabId);
  if (!key) {
    throw new Error('saveSession requires session.tabId');
  }
  const bucket = await store();
  const map = await readMap(bucket);
  map[key] = { ...session, tabId: Number(key) };
  await writeMap(bucket, map);
  return map[key];
}

export async function loadSession(tabId) {
  const bucket = await store();
  const map = await readMap(bucket);
  const key = tabKey(tabId);
  if (key) return map[key] || null;

  // 无 tabId：取最近一份（独立工作台兜底），调用方应尽量传 tabId
  const entries = Object.values(map);
  if (!entries.length) return null;
  return entries.sort((a, b) => Number(b.extractedAt || 0) - Number(a.extractedAt || 0))[0];
}

export async function clearSession(tabId) {
  const bucket = await store();
  if (tabId == null) {
    await bucket.remove([MAP_KEY, LEGACY_KEY]);
    return;
  }
  const key = tabKey(tabId);
  if (!key) return;
  const map = await readMap(bucket);
  if (!(key in map)) return;
  delete map[key];
  await writeMap(bucket, map);
}

export async function removeTabSession(tabId) {
  return clearSession(tabId);
}

export async function listSessionTabIds() {
  const bucket = await store();
  const map = await readMap(bucket);
  return Object.keys(map).map(Number).filter((id) => id > 0);
}

export async function saveDiagnostic(entry) {
  const prev = await chrome.storage.local.get(DIAG_KEY);
  const list = Array.isArray(prev[DIAG_KEY]) ? prev[DIAG_KEY] : [];
  list.unshift({
    at: Date.now(),
    ...entry
  });
  await chrome.storage.local.set({ [DIAG_KEY]: list.slice(0, 20) });
}

export async function loadDiagnostics() {
  const data = await chrome.storage.local.get(DIAG_KEY);
  return Array.isArray(data[DIAG_KEY]) ? data[DIAG_KEY] : [];
}

export const SESSION_MAP_KEY = MAP_KEY;
export const SESSION_LEGACY_KEY = LEGACY_KEY;
