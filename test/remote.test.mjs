import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyByHref, playerApiCandidates } from '../src/features/video-context/remote.js';

test('identify by href uses view and player payloads', async () => {
  const href = 'https://www.bilibili.com/video/BV1TCMk6WEtF';
  async function fetchJson(url) {
    if (url.includes('/x/web-interface/view')) {
      return {
        code: 0,
        data: {
          title: '安雅·泰勒-乔伊',
          bvid: 'BV1TCMk6WEtF',
          aid: 1,
          cid: 99,
          owner: { name: 'ELLE' },
          pages: [{ cid: 99, page: 1, part: '正片' }]
        }
      };
    }
    return {
      code: 0,
      data: {
        subtitle: {
          subtitles: [
            { id: 8, lan: 'zh-CN', lan_doc: '中文', subtitle_url: '//i0.hdslb.com/a.json', type: 0 }
          ]
        }
      }
    };
  }

  const result = await identifyByHref(href, fetchJson);
  assert.equal(result.context.bvid, 'BV1TCMk6WEtF');
  assert.equal(result.tracks.length, 1);
  assert.equal(result.source, 'api');
  assert.ok(playerApiCandidates(result.context)[0].includes('player/v2'));
});
