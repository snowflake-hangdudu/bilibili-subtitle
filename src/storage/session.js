const SESSION_KEY = 'bsh.session.v1';
const DIAG_KEY = 'bsh.diagnostics.v1';

async function store() {
  return chrome.storage.session || chrome.storage.local;
}

export async function saveSession(session) {
  const bucket = await store();
  await bucket.set({ [SESSION_KEY]: session });
  return session;
}

export async function loadSession() {
  const bucket = await store();
  const data = await bucket.get(SESSION_KEY);
  return data[SESSION_KEY] || null;
}

export async function clearSession() {
  const bucket = await store();
  await bucket.remove(SESSION_KEY);
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
