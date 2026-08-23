import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRemoteContent,
  ratingEnabled,
  ratingMinSuccess,
  compareVersions,
  pickRatingUrl,
  httpsUrl
} from '../src/features/remote/config.js';

test('merge keeps fallback notice and coop', () => {
  const data = mergeRemoteContent({});
  assert.equal(data.notice.enabled, true);
  assert.match(data.notice.body, /暂未获取到最新公告/);
  assert.match(data.coop.body, /hangdudu0@agent.qq.com/);
  assert.equal(data.rating.enabled, false);
  assert.equal(data.stats.enabled, false);
});

test('merge overlays remote notice and old announcement field', () => {
  const modern = mergeRemoteContent({
    notice: { title: '更新', body: '修好了导出', pinned: ['置顶'] }
  });
  assert.equal(modern.notice.title, '更新');
  assert.deepEqual(modern.notice.pinned, ['置顶']);

  const legacy = mergeRemoteContent({
    announcementTitle: '旧公告',
    announcement: '一段说明'
  });
  assert.equal(legacy.notice.title, '旧公告');
  assert.equal(legacy.notice.body, '一段说明');
});

test('rating stays off without https store url', () => {
  assert.equal(ratingEnabled({ enabled: true, url: 'http://evil.test' }, '1.0.0'), false);
  assert.equal(ratingEnabled({
    enabled: true,
    edge: 'https://microsoftedge.microsoft.com/addons/detail/demo'
  }, '1.0.0', 'edge'), true);
  assert.equal(ratingMinSuccess({ minSuccess: 5 }), 5);
  assert.equal(ratingMinSuccess({}), 3);
});

test('version gate and url helpers', () => {
  assert.equal(compareVersions('1.0.1', '1.0.0'), 1);
  assert.equal(httpsUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(httpsUrl('javascript:alert(1)'), '');
  assert.equal(
    pickRatingUrl({ chrome: 'https://chromewebstore.google.com/detail/x', url: 'https://fallback.test' }, 'chrome'),
    'https://chromewebstore.google.com/detail/x'
  );
});
