import test from 'node:test';
import assert from 'node:assert/strict';
import { extractByHref, identifyByHref, playerApiCandidates } from '../src/features/video-context/remote.js';
import { playerPayloadMatches } from '../src/platform/bilibili/adapter.js';

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
        cid: 99,
        bvid: 'BV1TCMk6WEtF',
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

test('ignore player subtitle list from another cid', async () => {
  const href = 'https://www.bilibili.com/video/BV1hk3d63EXo';
  async function fetchJson(url) {
    if (url.includes('/x/web-interface/view')) {
      return {
        code: 0,
        data: {
          title: '情没有对错',
          bvid: 'BV1hk3d63EXo',
          aid: 2,
          cid: 555,
          owner: { name: '混剪皮一下' },
          pages: [{ cid: 555, page: 1, part: '正片', duration: 463 }]
        }
      };
    }
    return {
      code: 0,
      data: {
        cid: 777,
        bvid: 'BV1otherxxxx1',
        subtitle: {
          subtitles: [
            { id: 1, lan: 'zh-CN', lan_doc: '中文', subtitle_url: '//i0.hdslb.com/wrong.json', type: 1 }
          ]
        }
      }
    };
  }

  const result = await identifyByHref(href, fetchJson);
  assert.equal(result.context.cid, 555);
  assert.equal(result.tracks.length, 0);
  assert.equal(playerPayloadMatches({ bvid: 'BV1hk3d63EXo', cid: 555 }, {
    data: { cid: 777, bvid: 'BV1otherxxxx1' }
  }), false);
  assert.equal(playerPayloadMatches({ bvid: 'BV1hk3d63EXo', cid: 555 }, {
    data: { subtitle: { subtitles: [{ id: 1 }] } }
  }), false);
});

test('extract drops subtitle file that outlasts the video', async () => {
  const href = 'https://www.bilibili.com/video/BV1hk3d63EXo';
  async function fetchJson(url) {
    if (url.includes('/x/web-interface/view')) {
      return {
        code: 0,
        data: {
          title: '不要摆官僚主义',
          bvid: 'BV1hk3d63EXo',
          aid: 3,
          cid: 11,
          duration: 57,
          pages: [{ cid: 11, page: 1, part: '正片', duration: 57 }]
        }
      };
    }
    if (url.includes('/x/player/')) {
      return {
        code: 0,
        data: {
          cid: 11,
          bvid: 'BV1hk3d63EXo',
          subtitle: {
            subtitles: [
              { id: 1, lan: 'zh-CN', lan_doc: '中文', subtitle_url: 'https://i0.hdslb.com/long.json', type: 1 }
            ]
          }
        }
      };
    }
    return { body: [{ from: 0, to: 1716, content: '从成都到新疆出发' }] };
  }

  await assert.rejects(
    () => extractByHref(href, fetchJson),
    /对不上|未提供字幕/
  );
});

test('extract keeps cid-matched track even if captions cover part of the video', async () => {
  const href = 'https://www.bilibili.com/video/BV1hw4T6MEyE';
  async function fetchJson(url) {
    if (url.includes('/x/web-interface/view')) {
      return {
        code: 0,
        data: {
          title: '星游记',
          bvid: 'BV1hw4T6MEyE',
          aid: 4,
          cid: 88,
          duration: 600,
          pages: [{ cid: 88, page: 1, part: '正片', duration: 600 }]
        }
      };
    }
    if (url.includes('/x/player/')) {
      return {
        code: 0,
        data: {
          cid: 88,
          bvid: 'BV1hw4T6MEyE',
          timelength: 600000,
          subtitle: {
            subtitles: [
              { id: 1, lan: 'ai-zh', lan_doc: '中文 - 自动', subtitle_url: 'https://aisubtitle.hdslb.com/part.json', type: 1 }
            ]
          }
        }
      };
    }
    return { body: [{ from: 12, to: 180, content: '相信奇迹' }] };
  }

  const result = await extractByHref(href, fetchJson);
  assert.equal(result.cues.length, 1);
  assert.equal(result.video.durationSec, 600);
  assert.equal(result.mismatch, false);
});
