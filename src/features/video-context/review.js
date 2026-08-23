import { contextMatchesHref, cuesMatchVideo, normalizeDurationSec } from './detect.js';
import { formatDisplayTime, formatTimeRange } from '../../shared/time.js';

function sampleCues(cues) {
  if (!cues?.length) return [];
  const picks = [cues[0]];
  if (cues.length > 2) picks.push(cues[Math.floor(cues.length / 2)]);
  if (cues.length > 1) picks.push(cues[cues.length - 1]);
  return picks.filter((cue, index, list) => list.findIndex((item) => item === cue) === index);
}

export function buildReview(session, pageHref) {
  const video = session?.video || {};
  const cues = Array.isArray(session?.cues) ? session.cues : [];
  const first = cues[0];
  const last = cues[cues.length - 1];
  const durationSec = normalizeDurationSec(video.durationSec);
  const spanSec = last ? Math.max(0, Number(last.endMs || last.startMs) || 0) / 1000 : 0;
  const videoOk = contextMatchesHref(video, pageHref || video.url);
  const timeOk = cuesMatchVideo(cues, durationSec);
  const overlong = durationSec && spanSec > durationSec + 15;
  const tooShort = Boolean(durationSec && spanSec > 0 && durationSec > 90 && spanSec < durationSec * 0.35);
  const warnings = [];
  if (!videoOk) warnings.push('视频编号和当前页面不一致');
  if (overlong) warnings.push('字幕时间超过视频时长');
  if (tooShort) warnings.push('字幕时长明显短于视频，可能不是这一部');
  if (!cues.length) warnings.push('没有可用字幕');

  return {
    videoOk,
    timeOk,
    title: video.title || '',
    bvid: video.bvid || '',
    owner: video.owner || '',
    trackLabel: session?.track?.label || '',
    videoClock: durationSec ? formatDisplayTime(durationSec * 1000, 'clock') : '',
    cueClock: first && last
      ? formatTimeRange(first.startMs, last.endMs || last.startMs, 'clock')
      : '',
    cueCount: cues.length,
    rawCueCount: Number(session?.rawCueCount) || cues.length,
    samples: sampleCues(cues),
    warnings
  };
}

export function fillReview(root, review) {
  if (!root || !review) return;
  const set = (sel, text) => {
    const el = root.querySelector(sel);
    if (el) el.textContent = text || '';
  };
  set('[data-review-video]', review.title || review.bvid || '未命名视频');
  set('[data-review-video-sub]', [review.owner && `UP ${review.owner}`, review.bvid, review.trackLabel].filter(Boolean).join(' · '));
  set('[data-review-video-flag]', review.videoOk ? '与当前页面一致' : '和当前页面不是同一个视频');
  set('[data-review-time]', [
    review.videoClock && `视频 ${review.videoClock}`,
    review.cueClock && `字幕 ${review.cueClock}`
  ].filter(Boolean).join(' · ') || '未取得时长');
  set('[data-review-time-flag]', review.timeOk
    ? '时长可以对上'
    : (review.warnings.find((item) => item.includes('时长') || item.includes('时间')) || '请核时长'));
  set('[data-review-count]', `${review.cueCount} 条${review.rawCueCount > review.cueCount ? ` · 原始 ${review.rawCueCount} 条` : ''}`);

  const samples = root.querySelector('[data-review-samples]');
  if (samples) {
    samples.replaceChildren();
    for (const cue of review.samples) {
      const li = document.createElement('li');
      li.textContent = `${formatTimeRange(cue.startMs, cue.endMs)}  ${cue.text}`;
      samples.appendChild(li);
    }
  }

  const warn = root.querySelector('[data-review-warn]');
  if (warn) {
    warn.textContent = review.warnings.join('；');
    warn.classList.toggle('hidden', !review.warnings.length);
  }

  root.querySelector('[data-review-video-flag]')?.classList.toggle('is-bad', !review.videoOk);
  root.querySelector('[data-review-time-flag]')?.classList.toggle('is-bad', !review.timeOk);
}
