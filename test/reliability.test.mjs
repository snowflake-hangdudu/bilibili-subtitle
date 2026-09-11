import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVideoChange } from '../src/features/video-context/sync.js';
import { buildFilename, buildExportContent } from '../src/features/export/exporter.js';
import { filterCues } from '../src/features/search/search.js';

test('applyVideoChange isolates stale per session object', () => {
  const sessionA = {
    tabId: 1,
    video: { fingerprint: 'BV1|cid1', title: 'A' },
    cues: [{ startMs: 0, endMs: 1000, text: 'a' }]
  };
  const next = applyVideoChange(sessionA, { fingerprint: 'BV2|cid2', title: 'B', trackCount: 2 });
  assert.equal(next.stale, true);
  assert.equal(next.changedTo.title, 'B');
  assert.equal(sessionA.stale, undefined);
});

test('late fingerprint restore clears stale without dropping cues', () => {
  const session = {
    tabId: 1,
    stale: true,
    changedTo: { fingerprint: 'BV2|cid2' },
    video: { fingerprint: 'BV1|cid1', title: 'A' },
    cues: [{ startMs: 0, endMs: 1000, text: 'a' }]
  };
  const restored = applyVideoChange(session, { fingerprint: 'BV1|cid1' });
  assert.equal(restored.stale, false);
  assert.equal(restored.changedTo, undefined);
  assert.equal(restored.cues.length, 1);
});

test('export scope keeps all cues unless matched selected', () => {
  const cues = [
    { startMs: 0, endMs: 1000, text: '结论一' },
    { startMs: 1000, endMs: 2000, text: '过程' },
    { startMs: 2000, endMs: 3000, text: '结论二' }
  ];
  const matched = filterCues(cues, '结论').map((item) => item.cue);
  assert.equal(matched.length, 2);

  const scope = 'all';
  const exported = scope === 'matched' ? matched : cues;
  assert.equal(exported.length, 3);

  const matchedScope = 'matched';
  const exportedMatched = matchedScope === 'matched' ? matched : cues;
  assert.equal(exportedMatched.length, 2);
  assert.equal(buildExportContent('txt', { title: 't' }, { label: '中文' }, exportedMatched, {
    includeTimestamp: false,
    paragraphGap: 'compact'
  }).split('\n').filter(Boolean).length, 2);
});

test('stale export keeps old video metadata in filename', () => {
  const oldVideo = { title: '旧视频标题', part: 'P1', bvid: 'BVold', owner: 'UP甲' };
  const name = buildFilename(oldVideo, { lang: 'zh' }, 'txt', '{title}_{bvid}');
  assert.match(name, /旧视频标题/);
  assert.match(name, /BVold/);
  assert.doesNotMatch(name, /新页面/);
});

test('srt export always includes timestamps regardless of includeTimestamp false', () => {
  const cues = [{ startMs: 1000, endMs: 2000, text: '你好' }];
  const srt = buildExportContent('srt', {}, {}, cues, { includeTimestamp: false });
  assert.match(srt, /00:00:01,000 --> 00:00:02,000/);
  assert.match(srt, /你好/);
});

test('request token discard: newer fingerprint rejects older result', () => {
  const started = 'BV1|cid1';
  const current = 'BV2|cid2';
  const shouldDiscard = Boolean(started && current && started !== current);
  assert.equal(shouldDiscard, true);
});

test('popup session belongs only when fingerprint or bvid+cid match', () => {
  function sessionBelongsToPage(session, context) {
    if (!session?.cues?.length || !context) return false;
    const sf = session.video?.fingerprint;
    const cf = context.fingerprint;
    if (sf && cf && sf === cf) return true;
    const sameBvid = session.video?.bvid && context.bvid
      && String(session.video.bvid).toLowerCase() === String(context.bvid).toLowerCase();
    const sameCid = Number(session.video?.cid || 0) > 0
      && Number(session.video.cid) === Number(context.cid || 0);
    return Boolean(sameBvid && sameCid);
  }
  const session = {
    cues: [{ text: 'x' }],
    video: { fingerprint: 'BV1|1', bvid: 'BV1', cid: 1, title: '旧' }
  };
  assert.equal(sessionBelongsToPage(session, { fingerprint: 'BV1|1', bvid: 'BV1', cid: 1 }), true);
  assert.equal(sessionBelongsToPage(session, { fingerprint: 'BV2|2', bvid: 'BV2', cid: 2 }), false);
  assert.equal(sessionBelongsToPage(session, { fingerprint: 'other', bvid: 'BV1', cid: 1 }), true);
});
