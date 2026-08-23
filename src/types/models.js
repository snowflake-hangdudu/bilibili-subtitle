/**
 * @typedef {Object} VideoContext
 * @property {string} title
 * @property {string} [bvid]
 * @property {number} [aid]
 * @property {number} [cid]
 * @property {string} [part]
 * @property {number} [partNo]
 * @property {number} [pageCount]
 * @property {string} [owner]
 * @property {string} url
 * @property {string} [fingerprint]
 * @property {Array<{cid:number,page:number,part:string}>} [pages]
 */

/**
 * @typedef {Object} SubtitleTrack
 * @property {string} id
 * @property {string} lang
 * @property {string} label
 * @property {'official'|'ai'|'unknown'} sourceType
 * @property {string} [url]
 */

/**
 * @typedef {Object} SubtitleCue
 * @property {number} startMs
 * @property {number} endMs
 * @property {string} text
 * @property {string} [rawText]
 * @property {number} [index]
 */

/**
 * @typedef {Object} ExportOptions
 * @property {'markdown'|'txt'|'srt'} format
 * @property {boolean} includeTimestamp
 * @property {boolean} mergeShortLines
 * @property {'clock'|'full'} [timestampFormat]
 * @property {'comfortable'|'compact'} [paragraphGap] 按停顿/句号收段，或逐条列出
 * @property {string} filenameTemplate
 */

export {};
