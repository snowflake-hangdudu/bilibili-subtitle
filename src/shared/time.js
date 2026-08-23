export function secondsToMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1000);
}

export function msToSeconds(ms) {
  return Math.max(0, Number(ms) || 0) / 1000;
}

export function pad2(n) {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export function pad3(n) {
  return String(Math.max(0, Math.floor(n))).padStart(3, '0');
}

/** @param {number} ms */
export function formatClock(ms, withHours = 'auto') {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const showHours = withHours === true || (withHours === 'auto' && hours > 0);
  if (showHours) return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

/** @param {number} ms @param {'clock'|'full'} style */
export function formatDisplayTime(ms, style = 'clock') {
  return formatClock(ms, style === 'full' ? true : 'auto');
}

/** @param {number} startMs @param {number} endMs @param {'clock'|'full'} style */
export function formatTimeRange(startMs, endMs, style = 'clock') {
  const start = formatDisplayTime(startMs, style);
  const end = formatDisplayTime(endMs, style);
  if (!Number.isFinite(Number(endMs)) || Number(endMs) <= Number(startMs || 0)) return start;
  return `${start}–${end}`;
}

/** @param {number} ms */
export function formatSrtTime(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(millis)}`;
}
