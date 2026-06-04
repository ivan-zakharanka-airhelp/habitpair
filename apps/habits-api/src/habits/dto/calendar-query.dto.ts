import { Matches } from 'class-validator';

// `from`/`to` bound the rendered month window; `today` is the client's local
// calendar day (no server-clock fallback) so "past day" / "closed period"
// math keys off the user's day. The global ValidationPipe rejects malformed
// queries here; monthSpan/parseDateOnly re-check semantics (real month, etc.).
export class CalendarQueryDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'from must be YYYY-MM' })
  from!: string;

  @Matches(/^\d{4}-\d{2}$/, { message: 'to must be YYYY-MM' })
  to!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'today must be YYYY-MM-DD' })
  today!: string;
}
