import test from 'node:test';
import assert from 'node:assert/strict';
import { isBilibiliVideoPage, parseVideoId, partFromUrl } from '../src/platform/bilibili/ids.js';
import { tracksFromPlayerPayload } from '../src/platform/bilibili/adapter.js';
import { detectVideoContext, reconcileContext } from '../src/features/video-context/detect.js';

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
