import test from 'node:test';
import assert from 'node:assert/strict';
import { isBilibiliVideoPage, parseVideoId, partFromUrl } from '../src/platform/bilibili/ids.js';
import { contextFromViewData, tracksFromPlayerPayload } from '../src/platform/bilibili/adapter.js';
import {
  contextMatchesHref,
  cuesFitDuration,
  cuesMatchVideo,
  detectVideoContext,
  pageResultTrustworthy,
  reconcileContext
} from '../src/features/video-context/detect.js';

test('parse bv and av urls', () => {
  assert.deepEqual(parseVideoId('https://www.bilibili.com/video/BV1xx411c7mD?p=2'), { kind: 'bvid', value: 'BV1xx411c7mD' });
  assert.equal(parseVideoId('https://www.bilibili.com/video/BV1TCMk6WEtF/?spm_id_from=333.1007').value, 'BV1TCMk6WEtF');
  assert.equal(parseVideoId('https://www.bilibili.com/video/av170001').value, '170001');
  assert.equal(partFromUrl('https://www.bilibili.com/video/BV1xx411c7mD?p=3'), 3);
});

test('reject non video pages', () => {
  assert.equal(isBilibiliVideoPage('https://www.bilibili.com/'), false);
  assert.equal(isBilibiliVideoPage('https://www.bilibili.com/video/BV1xx411c7mD'), true);
  assert.equal(detectVideoContext('https://example.com/video/BV1xx411c7mD'), null);
});

test('prefer url id when initial state is stale', () => {
  const next = reconcileContext(
    'https://www.bilibili.com/video/BV1yy411c7mE?p=2',
    { bvid: 'BV1xx411c7mD', cid: 111, title: '旧视频', partNo: 1, part: 'P1' }
  );
  assert.equal(next.staleState, true);
  assert.equal(next.bvid, 'BV1yy411c7mE');
  assert.equal(next.cid, undefined);
  assert.equal(next.partNo, 2);
  assert.match(next.fingerprint, /BV1yy411c7mE/);
});

test('reject leftover cues that outlast the current video', () => {
  const href = 'https://www.bilibili.com/video/BV1hk3d63EXo';
  assert.equal(contextMatchesHref({ bvid: 'BV1hk3d63EXo' }, href), true);
  assert.equal(contextMatchesHref({ bvid: 'BV1xx411c7mD' }, href), false);
  assert.equal(cuesFitDuration([{ startMs: 0, endMs: 463000 }], 463), true);
  assert.equal(cuesFitDuration([{ startMs: 0, endMs: 3660000 }], 463), false);
  assert.equal(cuesMatchVideo([{ startMs: 0, endMs: 1716000 }], 57), false);
  assert.equal(cuesMatchVideo([{ startMs: 0, endMs: 180000 }], 600), true);
  assert.equal(cuesMatchVideo([{ startMs: 0, endMs: 50000 }], 463), true);
  assert.equal(cuesMatchVideo([{ startMs: 0, endMs: 50000 }], 463, { requireCoverage: true }), false);
  assert.equal(pageResultTrustworthy({
    video: { bvid: 'BV1hk3d63EXo', durationSec: 463, staleState: false },
    cues: [{ startMs: 0, endMs: 3660000 }]
  }, href), false);
  assert.equal(pageResultTrustworthy({
    video: { bvid: 'BV1hk3d63EXo', durationSec: 463, staleState: true },
    cues: [{ startMs: 0, endMs: 400000 }]
  }, href), false);
});

test('view payload restores cid for stale page context', () => {
  const href = 'https://www.bilibili.com/video/BV1yy411c7mE?p=1';
  const next = contextFromViewData(
    { bvid: 'BV1yy411c7mE', staleState: true, url: href },
    {
      title: '新视频',
      bvid: 'BV1yy411c7mE',
      aid: 123456,
      pages: [{ cid: 987654, page: 1, part: '正片' }]
    },
    href
  );
  assert.equal(next.staleState, false);
  assert.equal(next.cid, 987654);
  assert.equal(next.aid, 123456);
  assert.equal(next.title, '新视频');
});

test('normalize subtitle tracks', () => {
  const tracks = tracksFromPlayerPayload({
    data: {
      subtitle: {
        subtitles: [
          { id: 1, lan: 'zh-CN', lan_doc: '中文', subtitle_url: '//i0.hdslb.com/a.json', type: 0 },
          { id: 2, lan: 'ai-zh', lan_doc: '中文（自动生成）', subtitle_url: 'https://aisubtitle.hdslb.com/b.json', type: 1 }
        ]
      }
    }
  });
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].sourceType, 'official');
  assert.equal(tracks[1].sourceType, 'ai');
  assert.equal(tracks[0].url, 'https://i0.hdslb.com/a.json');
});
