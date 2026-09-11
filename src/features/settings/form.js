import { clearLocalData, loadSettings, saveSettings } from '../../storage/settings.js';

export function bindSettingsForm(root, ids = {}) {
  const pick = (key, fallback) => ids[key] || fallback;
  const $ = (id) => root.getElementById(id);

  const els = {
    format: $(pick('format', 'format')),
    includeTs: $(pick('includeTs', 'include-ts')),
    tsFormat: $(pick('tsFormat', 'ts-format')),
    mergeShort: $(pick('mergeShort', 'merge-short')),
    filename: $(pick('filename', 'filename')),
    save: $(pick('save', 'save')),
    clear: $(pick('clear', 'clear')),
    status: $(pick('status', 'status'))
  };

  async function hydrate() {
    const settings = await loadSettings();
    if (els.format) els.format.value = settings.format;
    if (els.includeTs) els.includeTs.checked = settings.includeTimestamp !== false;
    if (els.tsFormat) els.tsFormat.value = settings.timestampFormat === 'full' ? 'full' : 'clock';
    if (els.mergeShort) els.mergeShort.checked = settings.mergeShortLines !== false;
    if (els.filename) els.filename.value = settings.filenameTemplate;
    syncFormatHint(settings.format);
    return settings;
  }

  function syncFormatHint(format) {
    if (!els.includeTs) return;
    const label = els.includeTs.parentElement;
    if (format === 'srt') {
      els.includeTs.checked = true;
      els.includeTs.disabled = true;
      if (label && label.childNodes.length) {
        // keep checkbox, text is in label
      }
    } else {
      els.includeTs.disabled = false;
    }
  }

  async function save() {
    const format = els.format?.value;
    const patch = {
      format,
      timestampFormat: els.tsFormat?.value,
      mergeShortLines: els.mergeShort?.checked,
      filenameTemplate: els.filename?.value.trim() || '{title}_{part}_{lang}'
    };
    if (format !== 'srt') patch.includeTimestamp = els.includeTs?.checked;
    const next = await saveSettings(patch);
    if (els.status) els.status.textContent = '已保存到本机。';
    return next;
  }

  els.format?.addEventListener('change', () => syncFormatHint(els.format.value));

  els.save?.addEventListener('click', () => {
    save().catch(() => {
      if (els.status) els.status.textContent = '保存失败，请重试。';
    });
  });

  els.clear?.addEventListener('click', async () => {
    if (!confirm('确定清理本扩展保存在本机的设置和最近一次字幕结果吗？')) return;
    await clearLocalData();
    await hydrate();
    if (els.status) els.status.textContent = '本地数据已清理。';
  });

  return { hydrate, save };
}
