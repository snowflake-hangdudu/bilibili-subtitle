const STORAGE_KEY = 'bsh.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  format: 'markdown',
  includeTimestamp: true,
  mergeShortLines: true,
  timestampFormat: 'clock',
  paragraphGap: 'comfortable',
  filenameTemplate: '{title}_{part}_{lang}',
  lastTrackId: ''
});

export async function loadSettings() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEY] || {}) };
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export async function clearLocalData() {
  await chrome.storage.local.clear();
  if (chrome.storage.session) await chrome.storage.session.clear();
}
