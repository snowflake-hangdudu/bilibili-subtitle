import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReview } from '../src/features/video-context/review.js';

test('review flags another video and short leftover cues', () => {
  const review = buildReview({
    video: {
      title: '情没有对错',
      bvid: 'BV1hk3d63EXo',
      url: 'https://www.bilibili.com/video/BV1hk3d63EXo',
      durationSec: 463
    },
    track: { label: '中文' },
    cues: [
      { startMs: 0, endMs: 4000, text: '杨幂回旋镖' },
      { startMs: 50000, endMs: 53000, text: '脱口秀现场' }
    ],
    rawCueCount: 9
  }, 'https://www.bilibili.com/video/BV1hk3d63EXo');

  assert.equal(review.videoOk, true);
  assert.equal(review.timeOk, true);
  assert.equal(review.cueCount, 2);
  assert.match(review.warnings.join(''), /短于视频/);
  assert.equal(review.samples[0].text, '杨幂回旋镖');
});

test('review rejects mismatched page video', () => {
  const review = buildReview({
    video: { bvid: 'BV1xx411c7mD', url: 'https://www.bilibili.com/video/BV1xx411c7mD', durationSec: 120 },
    cues: [{ startMs: 0, endMs: 110000, text: '正片' }]
  }, 'https://www.bilibili.com/video/BV1yy411c7mE');
  assert.equal(review.videoOk, false);
  assert.match(review.warnings.join(''), /不是同一个|不一致/);
});
