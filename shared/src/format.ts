// Dates, times and numbers as people in the company read them (en-AU), in the viewer's time zone;
// and the values date and time inputs take.

const LOCALE = 'en-AU';

/** A Date from what records store (ISO text, epoch ms or a Date), or undefined. */
export function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'number' || (typeof value === 'string' && value.trim())) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The value a `<input type="date">` shows for a stored date ("2026-11-04"), local time; or "". */
export function toDateInput(value: unknown): string {
  const date = toDate(value);
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';
}

/** The value a `<input type="time">` shows ("09:30"), local time; or "". */
export function toTimeInput(value: unknown): string {
  const date = toDate(value);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
}

/** A date input and a time input ("2026-11-04", "09:30") as an ISO instant (local time); undefined when the date isn't valid. */
export function fromInputs(dateText: string, timeText = '00:00'): string | undefined {
  const [y, m, d] = dateText.split('-').map(Number);
  const [hh, mm] = (timeText || '00:00').split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return undefined;
  const date = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export const formatNumber = (value: unknown, digits = 0) =>
  value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? '' : Number(value).toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** "5 Nov" this year, "5 Nov 2025" otherwise. */
export const formatDate = (value: unknown) => {
  const date = toDate(value);
  if (!date) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
};

export const formatTime = (value: unknown) => {
  const date = toDate(value);
  return date ? date.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' }) : '';
};

export const formatDateTime = (value: unknown) => {
  const date = toDate(value);
  return date ? `${formatDate(date)}, ${formatTime(date)}` : '';
};

/** "in 3 days", "2 hours ago", "yesterday". */
export function relative(value: unknown, now = Date.now()): string {
  const date = toDate(value);
  if (!date) return '';
  const diff = date.getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  if (abs < 365 * 86_400_000) return rtf.format(Math.round(diff / (30 * 86_400_000)), 'month');
  return rtf.format(Math.round(diff / (365 * 86_400_000)), 'year');
}

/** Whole days from today to a date (negative: past). */
export function daysUntil(value: unknown, now = Date.now()): number | undefined {
  const date = toDate(value);
  if (!date) return undefined;
  const start = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  return Math.round((start(date.getTime()) - start(now)) / 86_400_000);
}

/** "Due in 5 days" / "Overdue by 2 days" / "Due today". */
export function dueText(value: unknown): string {
  const days = daysUntil(value);
  if (days === undefined) return '';
  if (days === 0) return 'Due today';
  if (days > 0) return `Due in ${days} ${days === 1 ? 'day' : 'days'}`;
  return `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}`;
}

/** A duration in hours: "5 h", "2.5 h", "3 d 4 h". */
export const hours = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (n < 24) return `${formatNumber(n, n % 1 ? 1 : 0)} h`;
  const days = Math.floor(n / 24);
  const rest = Math.round(n - days * 24);
  return rest ? `${days} d ${rest} h` : `${days} d`;
};
