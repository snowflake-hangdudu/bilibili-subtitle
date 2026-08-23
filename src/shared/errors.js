export const ErrorCode = Object.freeze({
  NOT_VIDEO_PAGE: 'NOT_VIDEO_PAGE',
  NO_CONTEXT: 'NO_CONTEXT',
  NO_SUBTITLE: 'NO_SUBTITLE',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  FETCH_FAILED: 'FETCH_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  EMPTY_AFTER_CLEAN: 'EMPTY_AFTER_CLEAN',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  TAB_GONE: 'TAB_GONE',
  CONTENT_NOT_READY: 'CONTENT_NOT_READY'
});

const MESSAGES = {
  [ErrorCode.NOT_VIDEO_PAGE]: '请先打开一个 B站视频页，再提取字幕。',
  [ErrorCode.NO_CONTEXT]: '没有识别到当前视频信息，请刷新视频页后重试。',
  [ErrorCode.CONTENT_NOT_READY]: '页面脚本还没挂上。请刷新当前视频页，再点扩展图标。',
  [ErrorCode.NO_SUBTITLE]: '该视频未提供字幕。',
  [ErrorCode.LOGIN_REQUIRED]: '当前字幕需要登录后才能读取。请先在 B站登录，再点重试。',
  [ErrorCode.FETCH_FAILED]: '字幕接口暂时失败，请稍后重试。',
  [ErrorCode.PARSE_FAILED]: '字幕内容无法解析，请换一条字幕轨道或稍后重试。',
  [ErrorCode.EMPTY_AFTER_CLEAN]: '字幕读取成功，但清洗后没有可用文本。',
  [ErrorCode.DOWNLOAD_FAILED]: '文件未能保存。请检查浏览器是否允许下载，以及下载目录是否可写。',
  [ErrorCode.TAB_GONE]: '原来的视频标签页已关闭，请回到视频页后重试。'
};

export function createAppError(code, extra = {}) {
  const error = new Error(extra.message || MESSAGES[code] || '出现未知问题，请重试。');
  error.code = code;
  error.retryable = extra.retryable ?? ['FETCH_FAILED', 'PARSE_FAILED', 'LOGIN_REQUIRED', 'NO_CONTEXT', 'CONTENT_NOT_READY'].includes(code);
  error.detail = extra.detail || '';
  error.httpStatus = extra.httpStatus ?? null;
  return error;
}

export function toErrorPayload(error) {
  if (!error) return { code: 'UNKNOWN', message: '出现未知问题，请重试。', retryable: true };
  if (error.code && error.message) {
    return {
      code: error.code,
      message: error.message,
      retryable: Boolean(error.retryable),
      detail: error.detail || '',
      httpStatus: error.httpStatus ?? null
    };
  }
  return {
    code: 'UNKNOWN',
    message: String(error.message || error),
    retryable: true
  };
}
