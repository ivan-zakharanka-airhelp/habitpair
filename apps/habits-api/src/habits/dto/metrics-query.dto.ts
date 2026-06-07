import { Matches } from 'class-validator';

// `today` is the client's local calendar day (no server-clock fallback) so
// as-of-today and all-history metrics key off the user's day, not the server's.
// The global ValidationPipe rejects malformed input here; parseDateOnly
// re-checks it is a real calendar date.
export class MetricsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'today must be YYYY-MM-DD' })
  today!: string;
}
