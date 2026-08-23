import {
  RATING_KEY,
  detectStore,
  pickRatingUrl,
  ratingEnabled,
  ratingMinSuccess
} from './config.js';

const STORE_LABELS = { edge: 'Edge', chrome: 'Chrome', firefox: 'Firefox' };

function version() {
  return chrome.runtime.getManifest().version;
}

export function applyRatingCopy(root, rating) {
  const store = detectStore();
  const label = STORE_LABELS[store] || '商店';
  const text = root.querySelector('[data-rating-text]');
  const btn = root.querySelector('[data-action="rate"]');
  if (text) text.textContent = `用着顺手的话，去 ${label} 商店点个分，对我们很有帮助。当然不评也完全没问题。`;
  if (btn) btn.textContent = `去 ${label} 商店评分 ⭐`;
  return pickRatingUrl(rating, store);
}

export function applyStats(el, stats) {
  if (!el) return;
  const count = Number(stats?.count);
  const show = stats?.enabled === true && Number.isFinite(count) && count > 0;
  el.classList.toggle('hidden', !show);
  if (show) el.textContent = `${stats.label || '已提取'} ${count.toLocaleString('zh-CN')} 次`;
}

export function applyRemoteButtons(root, content) {
  root.querySelectorAll('[data-sheet]').forEach((btn) => {
    const item = content[btn.dataset.sheet];
    btn.classList.toggle('hidden', item?.enabled === false);
  });
}

async function loadState() {
  const data = await chrome.storage.local.get(RATING_KEY);
  const value = data[RATING_KEY];
  const ver = version();
  if (!value || typeof value !== 'object' || value.forVersion !== ver) {
    const next = { forVersion: ver, successCount: 0 };
    await chrome.storage.local.set({ [RATING_KEY]: next });
    return next;
  }
  return value;
}

async function saveState(patch) {
  const prev = await loadState();
  await chrome.storage.local.set({ [RATING_KEY]: { ...prev, forVersion: version(), ...patch } });
}

export function bindRating(root, getRating) {
  const card = root.querySelector('#store-rating');

  function hide() {
    card?.classList.add('hidden');
  }

  function show() {
    const rating = getRating();
    if (!card || !ratingEnabled(rating, version())) return;
    applyRatingCopy(card, rating);
    card.classList.remove('hidden');
  }

  async function noteSuccess() {
    const rating = getRating();
    if (!ratingEnabled(rating, version()) || !card) return false;
    const state = await loadState();
    if (state.neverAsk) return false;
    const successCount = (Number(state.successCount) || 0) + 1;
    await saveState({ successCount, dismissedUntilNextSuccess: false });
    if (successCount < ratingMinSuccess(rating)) return false;
    show();
    return true;
  }

  async function restoreIfNeeded() {
    const rating = getRating();
    if (!ratingEnabled(rating, version()) || !card) {
      hide();
      return;
    }
    const state = await loadState();
    if (state.neverAsk || state.dismissedUntilNextSuccess) {
      hide();
      return;
    }
    if ((Number(state.successCount) || 0) >= ratingMinSuccess(rating)) show();
    else hide();
  }

  card?.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      if (action === 'rate') {
        hide();
        const href = pickRatingUrl(getRating());
        if (href) window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      if (action === 'never') await saveState({ neverAsk: true });
      else await saveState({ dismissedUntilNextSuccess: true });
      hide();
    });
  });

  return { noteSuccess, restoreIfNeeded, hide, show };
}
