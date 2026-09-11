import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * 轻量模拟分 tab 会话表逻辑（与 storage/session.js 行为对齐）
 */
function createSessionMap(max = 12) {
  const map = new Map();
  return {
    save(session) {
      const key = String(session.tabId);
      map.set(key, session);
      const ordered = [...map.entries()].sort((a, b) => Number(b[1].extractedAt || 0) - Number(a[1].extractedAt || 0));
      while (ordered.length > max) {
        const [drop] = ordered.pop();
        map.delete(drop);
      }
      return session;
    },
    load(tabId) {
      return map.get(String(tabId)) || null;
    },
    remove(tabId) {
      map.delete(String(tabId));
    },
    size() {
      return map.size;
    }
  };
}

test('tab A session is not overwritten by tab B extract', () => {
  const store = createSessionMap();
  store.save({ tabId: 11, extractedAt: 1, video: { title: 'A' }, cues: [{ text: 'a' }] });
  store.save({ tabId: 22, extractedAt: 2, video: { title: 'B' }, cues: [{ text: 'b' }] });
  assert.equal(store.load(11).video.title, 'A');
  assert.equal(store.load(22).video.title, 'B');
});

test('closing tab removes only that session', () => {
  const store = createSessionMap();
  store.save({ tabId: 11, extractedAt: 1, cues: [1] });
  store.save({ tabId: 22, extractedAt: 2, cues: [2] });
  store.remove(11);
  assert.equal(store.load(11), null);
  assert.equal(store.load(22).cues[0], 2);
});

test('session cache respects max size', () => {
  const store = createSessionMap(3);
  for (let i = 1; i <= 5; i += 1) {
    store.save({ tabId: i, extractedAt: i, cues: [i] });
  }
  assert.equal(store.size(), 3);
  assert.equal(store.load(1), null);
  assert.equal(store.load(5).cues[0], 5);
});

test('busy flag recovers via finally semantics', async () => {
  let busy = false;
  async function extract(fail) {
    if (busy) return 'skipped';
    busy = true;
    try {
      if (fail) throw new Error('boom');
      return 'ok';
    } finally {
      busy = false;
    }
  }
  await assert.rejects(() => extract(true));
  assert.equal(busy, false);
  assert.equal(await extract(false), 'ok');
  assert.equal(busy, false);
});
