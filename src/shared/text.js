const WINDOWS_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;

export function collapseWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function normalizeCueText(text) {
  return collapseWhitespace(String(text || '').replace(/[\u200b\u200c\u200d\ufeff]/g, ''));
}

export function sanitizeFilename(name, fallback = 'bilibili-subtitle') {
  const cleaned = collapseWhitespace(String(name || ''))
    .replace(WINDOWS_FORBIDDEN, ' ')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .replace(/ _/g, '_')
    .replace(/_ /g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  const base = cleaned || fallback;
  return base.slice(0, 120);
}

export function applyTemplate(template, values) {
  const raw = String(template || '{title}_{part}_{lang}');
  return raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = values[key];
    return value == null || value === '' ? '' : String(value);
  }).replace(/[_\-\s]{2,}/g, '_').replace(/^[_\-\s]+|[_\-\s]+$/g, '');
}

export function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
