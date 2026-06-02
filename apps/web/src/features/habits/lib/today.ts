// The browser's local calendar date as YYYY-MM-DD. Built from local getters,
// never toISOString() (which is UTC) — so "today" stays correct right up to
// local midnight. The server keys marks by exactly this string.
export function todayLocalISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
