import { clearLocalData, loadSettings, saveSettings } from '../storage/settings.js';

const $ = (id) => document.getElementById(id);

async function hydrate() {
  const settings = await loadSettings();
  $('format').value = settings.format;
  $('include-ts').checked = settings.includeTimestamp !== false;
  $('ts-format').value = settings.timestampFormat === 'full' ? 'full' : 'clock';
  $('merge-short').checked = settings.mergeShortLines !== false;
  $('filename').value = settings.filenameTemplate;
}

$('save').addEventListener('click', async () => {
  await saveSettings({
    format: $('format').value,
    includeTimestamp: $('include-ts').checked,
    timestampFormat: $('ts-format').value,
    mergeShortLines: $('merge-short').checked,
    filenameTemplate: $('filename').value.trim() || '{title}_{part}_{lang}'
  });
  $('status').textContent = '已保存到本机。';
});

$('clear').addEventListener('click', async () => {
  if (!confirm('确定清理本扩展保存在本机的设置和最近一次字幕结果吗？')) return;
  await clearLocalData();
  await hydrate();
  $('status').textContent = '本地数据已清理。';
});

hydrate();
