// Shared time-range handling for every dashboard page.
// A range is either { days } (relative lookback) or { from, to } (YYYY-MM-DD,
// inclusive — from===to means a single day). Default is Today.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Calendar day in the market timezone (UAE), matching the ingest's hourly
// buckets. en-CA formats as YYYY-MM-DD.
export function todayStr() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}

export function parseRange(sp) {
  const from = sp?.from, to = sp?.to;
  if (DATE.test(from || '') && DATE.test(to || '')) return { from, to };
  if (DATE.test(from || '')) return { from, to: from };
  if (sp?.days) return { days: Number(sp.days) || 30 };
  const t = todayStr();           // default: Today
  return { from: t, to: t };
}

export function rangeQS(range) {
  if (range?.from && range?.to) return `from=${range.from}&to=${range.to}`;
  return `days=${range?.days || 30}`;
}

export function rangeLabel(range) {
  if (range?.from && range?.to) {
    return range.from === range.to ? range.from : `${range.from} → ${range.to}`;
  }
  return `last ${range?.days || 30} days`;
}
