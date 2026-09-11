Promise.allSettled([
  import(chrome.runtime.getURL('src/content/content.js')).catch((error) => {
    console.error('[BSH] content failed', error);
    throw error;
  }),
  import(chrome.runtime.getURL('src/content/workspace-dock.js'))
    .then((mod) => mod.mountWorkspaceDock())
    .catch((error) => {
      console.error('[BSH] workspace dock failed', error);
      throw error;
    })
]).then((results) => {
  const failed = results.filter((item) => item.status === 'rejected');
  if (failed.length) console.warn('[BSH] boot partial failure', failed.length);
});
