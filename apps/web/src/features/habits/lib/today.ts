// A JS Date's local calendar date as YYYY-MM-DD. Built from local getters,
// never toISOString() (which is UTC) — so a cell near local midnight maps to the
// user's calendar day, matching the string the server keys marks by.
export function localKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// The browser's local calendar date as YYYY-MM-DD. The server keys marks by
// exactly this string, and the list/calendar endpoints take it as `today`.
export function todayLocalISO(): string {
  return localKey(new Date());
}

// A YYYY-MM-DD string parsed to a local-midnight Date. The inverse of localKey:
// pass these to react-day-picker so cells land on the user's calendar day, never
// one off (which new Date(iso) would cause by parsing as UTC midnight).
export function localDateFromISO(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Today as a local-midnight Date (for react-day-picker's `today`/`disabled`).
export function todayLocalDate(): Date {
  return localDateFromISO(todayLocalISO());
}
