import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportContent, buildFilename, cuesToSrt } from '../src/features/export/exporter.js';

const video = {
  title: '线性代数第1讲',
  bvid: 'BV1xx411c7mD',
  part: 'P1 导论',
  owner: '测试UP',
  url: 'https://www.bilibili.com/video/BV1xx411c7mD'
};
const track = { lang: 'zh-CN', label: '中文（自动生成）' };
const cues = [
  { startMs: 160, endMs: 2430, text: '大家好' },
  { startMs: 2430, endMs: 5100, text: '欢迎来到这一讲' }
];

test('srt format', () => {
  const srt = cuesToSrt(cues);
  assert.match(srt, /00:00:00,160 --> 00:00:02,430/);
  assert.match(srt, /大家好/);
});

test('markdown includes meta', () => {
  const md = buildExportContent('markdown', video, track, cues, { includeTimestamp: true });
  assert.match(md, /# 线性代数第1讲/);
  assert.match(md, /BV1xx411c7mD/);
  assert.match(md, /\*\*00:00\*\* 大家好/);
});

test('markdown compact skips extra blank lines', () => {
  const compact = buildExportContent('markdown', video, track, cues, {
    includeTimestamp: false,
    paragraphGap: 'compact'
  });
  assert.match(compact, /大家好\n欢迎来到这一讲/);
});

test('markdown inserts blank line between spoken paragraphs', () => {
  const paused = [
    { startMs: 0, endMs: 1000, text: '大家好。' },
    { startMs: 3200, endMs: 5000, text: '欢迎来到这一讲' }
  ];
  const md = buildExportContent('markdown', video, track, paused, {
    includeTimestamp: false,
    paragraphGap: 'comfortable'
  });
  assert.match(md, /大家好。\n\n欢迎来到这一讲/);
});

test('markdown full timestamp', () => {
  const md = buildExportContent('markdown', video, track, cues, {
    includeTimestamp: true,
    timestampFormat: 'full'
  });
  assert.match(md, /\*\*00:00:00\*\* 大家好/);
});

test('txt without timestamp', () => {
  const txt = buildExportContent('txt', video, track, cues, { includeTimestamp: false });
  assert.equal(txt, '大家好\n欢迎来到这一讲');
});

test('filename sanitizes windows chars', () => {
  const name = buildFilename({ title: 'A:B/C?' }, track, 'md', '{title}_{lang}');
  assert.equal(name, 'A B C_zh-CN.md');
  assert.doesNotMatch(name, /[<>:"/\\|?*]/);
});
