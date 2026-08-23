export const SHOW_DEBUG = false; // @pack:debug

export function debugEnabled() {
  if (SHOW_DEBUG === false) return false;
  try {
    if (chrome.runtime.getManifest()?.update_url) return false;
  } catch {
    // 非扩展环境
  }
  return true;
}
