import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVideoChange, partLabel, videoUrlWithPart } from '../src/features/video-context/sync.js';
import { formatDisplayTime, formatTimeRange } from '../src/shared/time.js';

test('mark session stale when fingerprint changes', () => {
  const session = {
    video: { fingerprint: 'BV1xx|111', title: '旧视频' },
    cues: [{ text: '旧' }]
  };
  const next = applyVideoChange(session, { fingerprint: 'BV1yy|222', title: '新视频' });
  assert.equal(next.stale, true);
  assert.equal(next.changedTo.title, '新视频');
  assert.equal(next.cues[0].text, '旧');
});

test('clear stale when fingerprint matches again', () => {
  const session = {
    video: { fingerprint: 'BV1xx|111' },
    stale: true,
    changedTo: { fingerprint: 'BV1yy|222' }
  };
  const next = applyVideoChange(session, { fingerprint: 'BV1xx|111' });
  assert.equal(next.stale, false);
  assert.equal(next.changedTo, undefined);
});

test('keep same object when nothing changed', () => {
  const session = { video: { fingerprint: 'A' } };
  assert.equal(applyVideoChange(session, { fingerprint: 'A' }), session);
});

test('video url keeps or drops p query', () => {
  const base = 'https://www.bilibili.com/video/BV1xx411c7mD?spm=1';
  assert.equal(videoUrlWithPart(base, 3), 'https://www.bilibili.com/video/BV1xx411c7mD?spm=1&p=3');
  assert.equal(
    videoUrlWithPart('https://www.bilibili.com/video/BV1xx411c7mD?p=3', 1),
    'https://www.bilibili.com/video/BV1xx411c7mD'
  );
});

test('part label and time format', () => {
  assert.equal(partLabel({ page: 2, part: '习题' }), 'P2 习题');
  assert.equal(formatDisplayTime(160, 'clock'), '00:00');
  assert.equal(formatDisplayTime(160, 'full'), '00:00:00');
  assert.equal(formatDisplayTime(3723000, 'clock'), '01:02:03');
  assert.equal(formatTimeRange(8000, 12000, 'clock'), '00:08–00:12');
  assert.equal(formatTimeRange(8000, 8000, 'clock'), '00:08');
});
