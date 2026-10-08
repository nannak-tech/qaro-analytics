// Mask a mobile number for display: keep the last 3 digits, hide the rest.
// Rendered server-side so the browser never receives the full number.
// e.g. "501234567" -> "••••••567"
export function maskMobile(m) {
  if (!m) return m;
  const s = String(m).replace(/\s+/g, '');
  if (s.length <= 3) return '•'.repeat(s.length || 0);
  const dots = '•'.repeat(Math.min(s.length - 3, 6));
  return dots + s.slice(-3);
}
