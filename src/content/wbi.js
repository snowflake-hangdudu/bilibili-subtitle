(function () {
  'use strict';
  if (window.__BSH_WBI__) return;

  const WBI_MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19,
    29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
  ];

  function md5(input) {
    function cmn(q, a, b, x, s, t) {
      a = add32(add32(a, q), add32(x, t));
      return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
    function add32(a, b) { return (a + b) >>> 0; }
    function md5blk(s) {
      const md5blks = [];
      for (let i = 0; i < 64; i += 4) {
        md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8)
          + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
      }
      return md5blks;
    }
    function md51(s) {
      let n = s.length;
      let state = [1732584193, -271733879, -1732584194, 271733878];
      let i;
      for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
      s = s.substring(i - 64);
      const tail = new Array(16).fill(0);
      for (i = 0; i < s.length; i += 1) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
      tail[i >> 2] |= 0x80 << ((i % 4) << 3);
      if (i > 55) { md5cycle(state, tail); tail.fill(0); }
      tail[14] = n * 8;
      md5cycle(state, tail);
      return state;
    }
    function md5cycle(x, k) {
      let a = x[0]; let b = x[1]; let c = x[2]; let d = x[3];
      a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
      c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
      a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
      c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
      a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
      c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
      a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
      c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
      a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
      c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
      a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
      c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
      a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
      c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
      a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
      c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
      a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
      c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
      a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
      c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
      a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
      c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
      a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
      c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
      a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
      c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
      a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
      c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
      a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
      c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
      a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
      c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
      x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
    }
    function rhex(n) {
      let s = '';
      for (let j = 0; j < 4; j += 1) {
        s += ((n >> (j * 8 + 4)) & 0x0f).toString(16) + ((n >> (j * 8)) & 0x0f).toString(16);
      }
      return s;
    }
    return md51(unescape(encodeURIComponent(String(input || '')))).map(rhex).join('');
  }

  function extractWbiKeyFromUrl(url) {
    return String(url || '').match(/\/wbi\/([^/.?#]+)/i)?.[1] || '';
  }

  function genWbiMixinKey(imgKey, subKey) {
    const raw = String(imgKey || '') + String(subKey || '');
    let out = '';
    for (const index of WBI_MIXIN_KEY_ENC_TAB) out += raw[index] || '';
    return out.slice(0, 32);
  }

  function signWbiParams(params, mixinKey) {
    const wts = Math.floor(Date.now() / 1000);
    const withWts = { ...params, wts };
    const query = Object.keys(withWts)
      .sort()
      .map((key) => `${encodeURIComponent(String(key))}=${encodeURIComponent(String(withWts[key]))}`)
      .join('&');
    return { ...params, wts, w_rid: md5(query + mixinKey) };
  }

  let wbiKeyCache = null;

  async function getWbiKeys(fetchJson) {
    if (wbiKeyCache && Date.now() - wbiKeyCache.at < 10 * 3600 * 1000) return wbiKeyCache;
    const state = window.__INITIAL_STATE__ || {};
    const imgFromState = extractWbiKeyFromUrl(state.wbi?.img_url)
      || extractWbiKeyFromUrl(state.wbiImg?.img_url)
      || String(state.wbiImgKey || '');
    const subFromState = extractWbiKeyFromUrl(state.wbi?.sub_url)
      || extractWbiKeyFromUrl(state.wbiImg?.sub_url)
      || String(state.wbiSubKey || '');
    if (imgFromState && subFromState) {
      wbiKeyCache = { img: imgFromState, sub: subFromState, at: Date.now() };
      return wbiKeyCache;
    }
    const nav = await fetchJson('https://api.bilibili.com/x/web-interface/nav');
    const img = extractWbiKeyFromUrl(nav.json?.data?.wbi_img?.img_url);
    const sub = extractWbiKeyFromUrl(nav.json?.data?.wbi_img?.sub_url);
    if (img && sub) {
      wbiKeyCache = { img, sub, at: Date.now() };
      return wbiKeyCache;
    }
    return null;
  }

  async function buildSignedPlayerV2Url(params, fetchJson) {
    const keys = await getWbiKeys(fetchJson);
    if (!keys) return '';
    const signed = signWbiParams(params, genWbiMixinKey(keys.img, keys.sub));
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(signed)) query.set(key, String(value));
    return `https://api.bilibili.com/x/player/wbi/v2?${query.toString()}`;
  }

  window.__BSH_WBI__ = { buildSignedPlayerV2Url, signWbiParams, genWbiMixinKey };
})();
