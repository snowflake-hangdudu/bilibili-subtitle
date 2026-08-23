import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aiSubtitleUrlMatches,
  cueSignature,
  isCarryOverExtract,
  normalizeTrackUrl,
  rememberTracksInIndex,
  trackConflictsWithIndex
} from '../src/features/video-context/track-bind.js';

test('ai subtitle url must embed current aid and cid', () => {
  const context = { aid: 113470703931990, cid: 26731938624 };
  assert.equal(aiSubtitleUrlMatches(
    '//aisubtitle.hdslb.com/bfs/ai_subtitle/prod/11347070393199026731938624d2e6f10?auth_key=1',
    context
  ), true);
  assert.equal(aiSubtitleUrlMatches(
    'https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/99988877726731938624abcd',
    context
  ), false);
  assert.equal(aiSubtitleUrlMatches('https://i0.hdslb.com/bfs/subtitle/a.json', context), true);
});

test('detect carry-over by url or cue signature', () => {
  const previous = {
    video: { bvid: 'BV1oldxxxx01', cid: 1 },
    track: { url: 'https://i0.hdslb.com/bfs/subtitle/su7.json?x=1' },
    cues: [{ startMs: 0, endMs: 5000, text: '造车技术我是不懂' }]
  };
  assert.equal(isCarryOverExtract({
    video: { bvid: 'BV1newxxxx02', cid: 2 },
    track: { url: 'https://i0.hdslb.com/bfs/subtitle/su7.json' },
    cues: [{ startMs: 0, endMs: 5000, text: '造车技术我是不懂' }]
  }, previous), true);
  assert.equal(isCarryOverExtract({
    video: { bvid: 'BV1oldxxxx01', cid: 1 },
    track: { url: 'https://i0.hdslb.com/bfs/subtitle/su7.json' },
    cues: [{ startMs: 0, endMs: 5000, text: '造车技术我是不懂' }]
  }, previous), false);
});

test('track index first win keeps the original video', () => {
  let index = rememberTracksInIndex({}, { bvid: 'BV1oldxxxx01', cid: 1, aid: 10 }, [
    { url: 'https://i0.hdslb.com/a.json' }
  ]);
  index = rememberTracksInIndex(index, { bvid: 'BV1newxxxx02', cid: 2, aid: 20 }, [
    { url: 'https://i0.hdslb.com/a.json' }
  ]);
  assert.equal(index[normalizeTrackUrl('https://i0.hdslb.com/a.json')].bvid, 'BV1oldxxxx01');
  assert.equal(trackConflictsWithIndex(
    { url: 'https://i0.hdslb.com/a.json' },
    { bvid: 'BV1newxxxx02' },
    index
  ), true);
  assert.equal(cueSignature([{ text: 'a', endMs: 1000 }]), '1|1000|a|a|a');
});
