import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCues, highlightText } from '../src/features/search/search.js';

const cues = [
  { startMs: 0, endMs: 1000, text: '先看线性代数的结论' },
  { startMs: 1000, endMs: 2000, text: '然后回到例题' }
];

test('filter by keyword', () => {
  const hits = filterCues(cues, '结论');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].index, 0);
});

test('highlight keeps other text', () => {
  const html = highlightText('先看线性代数的结论', '结论');
  assert.equal(html, '先看线性代数的<mark>结论</mark>');
});
