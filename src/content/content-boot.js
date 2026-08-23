import(chrome.runtime.getURL('src/content/content.js')).catch((error) => {
  console.error('[BSH] content failed', error);
});
