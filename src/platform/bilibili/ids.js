const BV_RE = /BV[1-9A-HJ-NP-Za-km-z]{10}/i;
const AV_RE = /(?:^|[^\w])av(\d+)/i;

export function parseVideoId(href) {
  let url;
  try {
    url = new URL(href, 'https://www.bilibili.com');
  } catch {
    return null;
  }

  const path = url.pathname || '';
  let match = path.match(/\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10})/i);
  if (match) return { kind: 'bvid', value: match[1] };

  match = path.match(/\/video\/av(\d+)/i);
  if (match) return { kind: 'aid', value: match[1] };

  match = href.match(BV_RE);
  if (match) return { kind: 'bvid', value: match[0] };

  match = href.match(AV_RE);
  if (match) return { kind: 'aid', value: match[1] };

  return null;
}

export function isBilibiliVideoPage(href) {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, '');
    if (host !== 'bilibili.com' && host !== 'm.bilibili.com') return false;
    return /\/video\/(BV|av)/i.test(url.pathname) || /\/list\//i.test(url.pathname);
  } catch {
    return false;
  }
}

export function partFromUrl(href) {
  try {
    const value = new URL(href).searchParams.get('p');
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

export function absoluteUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url.replace(/^\/+/, '')}`;
}

export function trackSourceType(item = {}) {
  const lan = String(item.lan || item.lang || '');
  const label = String(item.lan_doc || item.label || '');
  const type = Number(item.type);
  if (type === 1 || /ai-|自动|AI/i.test(`${lan} ${label}`)) return 'ai';
  if (type === 0 || /官方|人工|cc/i.test(label)) return 'official';
  return 'unknown';
}
