import {
  FAQ_URL,
  PRIVACY_URL,
  FEEDBACK_EMAIL,
  httpsUrl,
  loadRemoteContent,
  localPageUrl
} from './config.js';
import { applyRemoteButtons, applyStats, bindRating } from './rating.js';
import { bindPromoSheets } from './sheets.js';

function pageHref(remoteUrl, localName, fallback) {
  return httpsUrl(remoteUrl) || localPageUrl(localName) || fallback;
}

export function bindPromo(root = document) {
  let content = null;
  const rating = bindRating(root, () => content?.rating || {});
  const sheets = bindPromoSheets({
    shell: root.querySelector('.wrap') || root.querySelector('.side'),
    home: root.getElementById('home'),
    page: root.getElementById('page'),
    back: root.getElementById('page-back'),
    title: root.getElementById('info-title'),
    date: root.getElementById('info-date'),
    body: root.getElementById('info-body'),
    getContent: () => content,
    loadContent
  });

  function applyLinks(data) {
    const faq = root.getElementById('link-faq');
    const privacy = root.getElementById('link-privacy');
    const feedback = root.getElementById('link-feedback');
    if (faq) faq.href = pageHref(data.faqUrl, 'faq.html', FAQ_URL);
    if (privacy) privacy.href = pageHref(data.privacyUrl, 'privacy.html', PRIVACY_URL);
    if (feedback) {
      feedback.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('B站字幕提取助手反馈')}`;
      feedback.textContent = `反馈邮箱：${FEEDBACK_EMAIL}`;
    }
    applyRemoteButtons(root, data);
    applyStats(root.getElementById('promo-stats'), data.stats);
  }

  async function loadContent() {
    content = await loadRemoteContent();
    applyLinks(content);
    await rating.restoreIfNeeded();
    return content;
  }

  applyLinks({
    faqUrl: FAQ_URL,
    privacyUrl: PRIVACY_URL,
    notice: { enabled: true },
    coop: { enabled: true },
    stats: { enabled: false }
  });
  const ready = loadContent();

  return {
    loadContent,
    sheets,
    rating: {
      ...rating,
      async noteSuccess() {
        await ready;
        return rating.noteSuccess();
      },
      async restoreIfNeeded() {
        await ready;
        return rating.restoreIfNeeded();
      }
    }
  };
}
