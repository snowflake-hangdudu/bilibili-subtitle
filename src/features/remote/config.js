export const CONFIG_URL = 'https://download-config-hub.nutmeg-venus-6882.chatgpt.site/api/config/bilibili-subtitle';
export const CONFIG_MESSAGE = 'FETCH_REMOTE_CONFIG';
export const CACHE_KEY = 'bsh.remoteContent.v1';
export const RATING_KEY = 'bsh.storeRating.v1';
export const FEEDBACK_EMAIL = 'hangdudu0@agent.qq.com';

export const FAQ_URL = 'https://snowflake-hangdudu.github.io/bilibili-subtitle/faq.html';
export const PRIVACY_URL = 'https://snowflake-hangdudu.github.io/bilibili-subtitle/';

export const DEFAULT_REMOTE_CONTENT = Object.freeze({
  notice: {
    enabled: true,
    title: '公告',
    updated: '',
    body: '暂未获取到最新公告，请稍后再试。\n\n提取和导出不受影响。'
  },
  coop: {
    enabled: true,
    title: '开发合作',
    updated: '',
    body: '接浏览器插件定制开发。\n\n有合作意向请发邮件。\n邮箱：hangdudu0@agent.qq.com'
  },
  rating: {
    enabled: false,
    url: '',
    edge: '',
    chrome: '',
    firefox: '',
    minSuccess: 3,
    minimumVersion: ''
  },
  stats: {
    enabled: false,
    count: 0,
    label: '已提取'
  }
});

function section(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export function mergeRemoteContent(value, defaults = DEFAULT_REMOTE_CONTENT) {
  const source = section(value);
  const notice = { ...section(defaults.notice), ...section(source.notice) };
  notice.roadmap = { ...section(defaults.notice?.roadmap), ...section(source.notice?.roadmap) };
  if (!source.notice && (source.announcement || source.announcementTitle)) {
    notice.enabled = true;
    notice.title = source.announcementTitle || notice.title;
    notice.body = source.announcement || notice.body;
  }
  return {
    notice,
    coop: { ...section(defaults.coop), ...section(source.coop) },
    rating: { ...section(defaults.rating), ...section(source.rating) },
    stats: { ...section(defaults.stats), ...section(source.stats) },
    faqUrl: httpsUrl(source.faqUrl || source.helpUrl) || FAQ_URL,
    privacyUrl: httpsUrl(source.privacyUrl) || PRIVACY_URL
  };
}

export function compareVersions(left, right) {
  const a = String(left || '').split('.').map((part) => Number(part) || 0);
  const b = String(right || '').split('.').map((part) => Number(part) || 0);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1;
  }
  return 0;
}

export function detectStore() {
  const ua = navigator.userAgent || '';
  if (/\bFirefox\b/i.test(ua)) return 'firefox';
  if (/\bEdg\b/i.test(ua)) return 'edge';
  return 'chrome';
}

export function pickRatingUrl(rating, store = detectStore()) {
  const data = section(rating);
  return httpsUrl(data[store]) || httpsUrl(data.edge) || httpsUrl(data.url);
}

export function ratingEnabled(rating, version, store = detectStore()) {
  const data = section(rating);
  if (data.enabled !== true || !pickRatingUrl(data, store)) return false;
  return !data.minimumVersion || compareVersions(version, data.minimumVersion) >= 0;
}

export function ratingMinSuccess(rating) {
  const n = Number(section(rating).minSuccess);
  return n > 0 ? n : 3;
}

export function localPageUrl(name) {
  return chrome.runtime.getURL(`public/pages/${name}`);
}

export function openPage(url, fallback) {
  const href = httpsUrl(url) || fallback;
  if (href) window.open(href, '_blank', 'noopener,noreferrer');
}

export async function loadRemoteContent() {
  try {
    const response = await chrome.runtime.sendMessage({ type: CONFIG_MESSAGE, url: CONFIG_URL });
    if (response?.ok && response.data && typeof response.data === 'object') {
      const data = mergeRemoteContent(response.data);
      await chrome.storage.local.set({ [CACHE_KEY]: { data, updatedAt: Date.now() } });
      return data;
    }
  } catch {
    // 走缓存或兜底
  }
  try {
    const cached = await chrome.storage.local.get(CACHE_KEY);
    if (cached?.[CACHE_KEY]?.data) return mergeRemoteContent(cached[CACHE_KEY].data);
  } catch {
    // 用内置文案
  }
  return mergeRemoteContent({});
}
