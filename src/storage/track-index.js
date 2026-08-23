import { rememberTracksInIndex } from '../features/video-context/track-bind.js';

const KEY = 'bsh.trackIndex.v1';

export async function loadTrackIndex() {
  const data = await chrome.storage.local.get(KEY);
  return data[KEY] && typeof data[KEY] === 'object' ? data[KEY] : {};
}

export async function saveTrackIndex(index) {
  await chrome.storage.local.set({ [KEY]: index });
  return index;
}

export async function rememberTrustedTracks(context, tracks) {
  const current = await loadTrackIndex();
  const next = rememberTracksInIndex(current, context, tracks);
  if (next === current) return current;
  return saveTrackIndex(next);
}
