import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitlePayload } from '../src/features/subtitle/parser.js';

const sample = {
  body: [
    { from: 0.16, to: 2.43, content: '  大家好  ' },
    { from: 2.43, to: 5.1, content: '欢迎来到这一讲' },
    { from: 5.1, to: 5.1, content: '' }
  ]
};

test('parse bcc json body', () => {
  const cues = parseSubtitlePayload(sample);
  assert.equal(cues.length, 3);
  assert.equal(cues[0].startMs, 160);
  assert.equal(cues[0].endMs, 2430);
  assert.equal(cues[0].text, '大家好');
  assert.equal(cues[0].rawText, '  大家好  ');
});

test('parse json string', () => {
  const cues = parseSubtitlePayload(JSON.stringify(sample));
  assert.equal(cues[1].text, '欢迎来到这一讲');
});

test('parse srt', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:02,500',
    '第一句',
    '',
    '2',
    '00:00:03,000 --> 00:00:04,000',
    '第二句'
  ].join('\n');
  const cues = parseSubtitlePayload(srt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startMs, 1000);
  assert.equal(cues[1].text, '第二句');
});

test('empty payload throws', () => {
  assert.throws(() => parseSubtitlePayload(''), /无法解析/);
});

test('parse clock strings and word-level cues', () => {
  const cues = parseSubtitlePayload({
    data: {
      subtitles: [
        { start: '02:00', end: '02:04', text: '第二分钟' },
        { start_time: 130000, end_time: 134000, content: '' , words: [{ content: '逐' }, { content: '字' }] }
      ]
    }
  });
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startMs, 120000);
  assert.equal(cues[0].text, '第二分钟');
  assert.equal(cues[1].startMs, 130000);
  assert.equal(cues[1].text, '逐字');
});
