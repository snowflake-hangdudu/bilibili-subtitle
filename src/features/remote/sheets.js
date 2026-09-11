function toLines(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

export function fillPlainBody(el, text) {
  el.replaceChildren();
  const lines = toLines(text);
  if (!lines.length) {
    appendText(el, 'p', '', '暂无内容');
    return;
  }
  for (const line of lines) appendText(el, 'p', '', line);
}

export function fillNoticeBody(el, notice) {
  el.replaceChildren();
  const roadmap = notice?.roadmap && typeof notice.roadmap === 'object' ? notice.roadmap : {};
  const structured = ['pinned', 'recent', 'knownIssues'].some((key) => toLines(notice?.[key]).length)
    || ['feedback', 'upcoming', 'planned'].some((key) => toLines(roadmap[key]).length);
  if (!structured) {
    fillPlainBody(el, notice?.body || '暂无新公告');
    return;
  }

  function section(title, value) {
    const lines = toLines(value);
    if (!lines.length) return;
    const wrap = document.createElement('section');
    wrap.className = 'promo-notice-section';
    appendText(wrap, 'h4', 'promo-notice-section-title', title);
    const list = document.createElement('ul');
    list.className = 'promo-notice-list';
    for (const line of lines) appendText(list, 'li', '', line);
    wrap.appendChild(list);
    el.appendChild(wrap);
  }

  section('置顶说明', notice.pinned);
  section('最近更新', notice.recent);
  section('已知问题', notice.knownIssues);

  const plans = [
    ['征集中', roadmap.feedback],
    ['即将更新', roadmap.upcoming],
    ['计划中', roadmap.planned]
  ];
  if (plans.some(([, value]) => toLines(value).length)) {
    const wrap = document.createElement('section');
    wrap.className = 'promo-notice-section';
    appendText(wrap, 'h4', 'promo-notice-section-title', '开发计划');
    for (const [label, value] of plans) {
      const lines = toLines(value);
      if (!lines.length) continue;
      const group = document.createElement('div');
      group.className = 'promo-notice-plan';
      appendText(group, 'div', 'promo-notice-plan-label', label);
      const list = document.createElement('ul');
      list.className = 'promo-notice-list';
      for (const line of lines) appendText(list, 'li', '', line);
      group.appendChild(list);
      wrap.appendChild(group);
    }
    el.appendChild(wrap);
  }
}

export function renderInfoSheet(els, key, item) {
  const data = item || {};
  els.title.textContent = data.title || (key === 'coop' ? '开发合作' : '公告');
  els.date.textContent = data.updated ? `更新：${data.updated}` : '';
  els.date.classList.toggle('hidden', !data.updated);
  if (key === 'notice') fillNoticeBody(els.body, data);
  else fillPlainBody(els.body, data.body);
}

export function bindPromoSheets({ shell, home, page, back, title, date, body, getContent, loadContent }) {
  const els = { title, date, body };
  const frame = shell || home?.parentElement;

  function showHome() {
    page.classList.add('hidden');
    home?.classList.remove('hidden');
    frame?.classList.remove('is-page');
  }

  async function openSheet(key) {
    renderInfoSheet(els, key, getContent()?.[key]);
    frame?.classList.add('is-page');
    // 不隐藏 home，避免绝对定位页在容器塌缩后变成空白
    page.classList.remove('hidden');
    page.scrollTop = 0;
    const next = await loadContent();
    if (page.classList.contains('hidden')) return;
    renderInfoSheet(els, key, next?.[key]);
  }

  back.addEventListener('click', showHome);
  (home.ownerDocument || document).querySelectorAll('[data-sheet]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      openSheet(btn.dataset.sheet);
    });
  });

  return { showHome, openSheet };
}
