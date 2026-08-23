import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCues } from '../src/features/subtitle/cleaner.js';

test('drop empty and collapse spaces', () => {
  const cues = cleanCues([
    { startMs: 0, endMs: 1000, text: '   ' },
    { startMs: 1000, endMs: 2000, text: '你好   世界' }
  ]);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, '你好 世界');
});

test('dedupe overlapping identical lines', () => {
  const cues = cleanCues([
    { startMs: 0, endMs: 1200, text: '同一句' },
    { startMs: 1000, endMs: 2200, text: '同一句' }
  ]);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].endMs, 2200);
});

test('merge short adjacent lines', () => {
  const cues = cleanCues([
    { startMs: 0, endMs: 400, text: '所以' },
    { startMs: 500, endMs: 1400, text: '我们继续' }
  ], { mergeShortLines: true });
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, '所以 我们继续');
});

test('do not merge overlapping karaoke lines', () => {
  const cues = cleanCues([
    { startMs: 0, endMs: 4000, text: '第一句' },
    { startMs: 2000, endMs: 6000, text: '第二句' }
  ], { mergeShortLines: true });
  assert.equal(cues.length, 2);
});

test('keep sentence boundary', () => {
  const cues = cleanCues([
    { startMs: 0, endMs: 800, text: '先看结论。' },
    { startMs: 900, endMs: 1600, text: '下一题' }
  ]);
  assert.equal(cues.length, 2);
});
