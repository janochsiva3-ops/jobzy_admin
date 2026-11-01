export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Computes the exact 5-day grace period deadline (renewal due timestamp + 5 full days).
 */
export function computeFiveDayGraceDeadline(dueDateIso) {
  if (!dueDateIso) return null;
  const dueMs = new Date(dueDateIso).getTime();
  if (isNaN(dueMs)) return null;
  return new Date(dueMs + FIVE_DAYS_MS).toISOString();
}

/**
 * Formats an ISO timestamp into Sri Lanka Standard Time (Asia/Colombo, UTC+5:30).
 */
export function formatSriLankaDateTime(isoStr, includeTime = true) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const formatted = d.toLocaleString('en-LK', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {})
  });
  return includeTime ? `${formatted} (SLST)` : formatted;
}

