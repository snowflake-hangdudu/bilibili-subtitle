import { formatDisplayTime, formatSrtTime } from '../../shared/time.js';
import { applyTemplate, sanitizeFilename } from '../../shared/text.js';
import { groupCues } from '../subtitle/paragraphs.js';

function timestampOf(cue, options = {}) {
  if (options.includeTimestamp === false) return '';
  if (options.format === 'srt') return formatSrtTime(cue.startMs);
  return formatDisplayTime(cue.startMs, options.timestampFormat);
}

function linesFromCues(cues, options = {}) {
  return (cues || []).map((cue) => {
    const time = timestampOf(cue, options);
    return time ? `[${time}] ${cue.text}` : cue.text;
  });
}

export function cuesToTxt(cues, options = {}) {
  if (options.paragraphGap === 'compact') return linesFromCues(cues, options).join('\n');
  return groupCues(cues).map((group) => linesFromCues(group, options).join('\n')).join('\n\n');
}

export function cuesToSrt(cues) {
  return (cues || []).map((cue, index) => {
    return [
      String(index + 1),
      `${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}`,
      cue.text,
      ''
    ].join('\n');
  }).join('\n').trim() + '\n';
}

export function cuesToMarkdown(video, track, cues, options = {}) {
  const includeTimestamp = options.includeTimestamp !== false;
  const title = video?.title || 'B站字幕';
  const lines = [
    `# ${title}`,
    '',
    `- 链接：${video?.url || ''}`,
    `- BV/AV：${video?.bvid || (video?.aid ? `av${video.aid}` : '')}`,
    `- 分P：${video?.part || 'P1'}`,
    `- UP：${video?.owner || '未知'}`,
    `- 字幕：${track?.label || track?.lang || '未知'}`,
    '',
    '## 字幕正文',
    ''
  ];

  const groups = options.paragraphGap === 'compact' ? [cues || []] : groupCues(cues);
  for (const group of groups) {
    for (const cue of group) {
      if (includeTimestamp) {
        lines.push(`- **${formatDisplayTime(cue.startMs, options.timestampFormat)}** ${cue.text}`);
      } else {
        lines.push(cue.text);
      }
    }
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

export function buildExportContent(format, video, track, cues, options = {}) {
  if (format === 'srt') return cuesToSrt(cues);
  if (format === 'txt') return cuesToTxt(cues, options);
  return cuesToMarkdown(video, track, cues, options);
}

export function buildFilename(video, track, format, template) {
  const ext = format === 'srt' ? 'srt' : format === 'txt' ? 'txt' : 'md';
  const name = applyTemplate(template || '{title}_{part}_{lang}', {
    title: video?.title || video?.bvid || 'bilibili',
    part: video?.part || 'P1',
    lang: track?.lang || track?.label || 'subtitle',
    bvid: video?.bvid || '',
    owner: video?.owner || ''
  });
  return `${sanitizeFilename(name || 'bilibili-subtitle')}.${ext}`;
}

export function mimeForFormat(format) {
  if (format === 'srt') return 'application/x-subrip';
  if (format === 'txt') return 'text/plain';
  return 'text/markdown';
}
