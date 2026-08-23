import { escapeHtml, escapeRegExp, normalizeCueText } from '../../shared/text.js';

export function filterCues(cues, keyword) {
  const query = normalizeCueText(keyword).toLowerCase();
  if (!query) {
    return (cues || []).map((cue, index) => ({ cue, index, matchIndex: -1 }));
  }
  return (cues || [])
    .map((cue, index) => {
      const hay = String(cue.text || '').toLowerCase();
      return { cue, index, matchIndex: hay.indexOf(query) };
    })
    .filter((item) => item.matchIndex >= 0);
}

export function highlightText(text, keyword) {
  const source = String(text || '');
  const query = normalizeCueText(keyword);
  if (!query) return escapeHtml(source);
  const re = new RegExp(escapeRegExp(query), 'ig');
  let last = 0;
  let html = '';
  const hay = source;
  let match = re.exec(hay);
  if (!match) return escapeHtml(source);
  while (match) {
    html += escapeHtml(hay.slice(last, match.index));
    html += `<mark>${escapeHtml(match[0])}</mark>`;
    last = match.index + match[0].length;
    match = re.exec(hay);
  }
  html += escapeHtml(hay.slice(last));
  return html;
}
