export function applyVideoChange(session, nextContext) {
  if (!session || !nextContext?.fingerprint) return session;
  const prev = session.video?.fingerprint;
  if (!prev) return session;
  if (prev === nextContext.fingerprint) {
    if (!session.stale && !session.changedTo) return session;
    return { ...session, stale: false, changedTo: undefined };
  }
  if (session.stale && session.changedTo?.fingerprint === nextContext.fingerprint) {
    return session;
  }
  return {
    ...session,
    stale: true,
    changedTo: nextContext
  };
}

export function videoUrlWithPart(url, partNo) {
  const next = new URL(url, 'https://www.bilibili.com');
  const n = Number(partNo);
  if (Number.isFinite(n) && n > 1) next.searchParams.set('p', String(n));
  else next.searchParams.delete('p');
  return next.toString();
}

export function partLabel(page, fallbackNo = 1) {
  const no = Number(page?.page || fallbackNo) || fallbackNo;
  const name = String(page?.part || '').trim();
  return name ? `P${no} ${name}` : `P${no}`;
}
