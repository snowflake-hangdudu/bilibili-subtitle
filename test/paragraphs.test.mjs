import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCues, isParagraphBreak } from '../src/features/subtitle/paragraphs.js';

test('break after long pause', () => {
  assert.equal(
    isParagraphBreak(
      { startMs: 0, endMs: 1000, text: '上一句' },
      { startMs: 3200, endMs: 4000, text: '下一句' }
    ),
    true
  );
});

test('break after sentence punctuation', () => {
  assert.equal(
    isParagraphBreak(
      { startMs: 0, endMs: 1000, text: '先看结论。' },
      { startMs: 1600, endMs: 2200, text: '下一题' }
    ),
    true
  );
});

test('keep tight speech in one paragraph', () => {
  const groups = groupCues([
    { startMs: 0, endMs: 800, text: '所以' },
    { startMs: 900, endMs: 1600, text: '我们继续' },
    { startMs: 1700, endMs: 2400, text: '往下看' }
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 3);
});
