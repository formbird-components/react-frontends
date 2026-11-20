// Pieces the bookings pages share: a booking's state badge, the status stepper, the start/end fields
// with quick durations, the availability strip and the colours of bars.

import { AlertTriangle, Ban, Check, CheckCircle2, Clock, Wrench, XCircle } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { DateTimeInput } from '@react-frontends/shared/components';
import { ColorBadge, Field, Skeleton } from '@react-frontends/shared/ui';
import { bookingTimeProblems } from '@/domain/logic/booking';
import { addDays, DAY, HOUR, MINUTE, startOfDay } from '@/domain/logic/time';
import { MAX_BOOKING_HOURS } from '@/domain/model';
import { first, nameOf, type Booking } from '@/domain/types';
import { formatDate, formatDateTime, formatTime } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import type { Item } from './model';
import { endAfter, lengthText, moveStart, QUICK_HOURS, untilFivePm } from './times';
import { stateOf, stepOf, STEPS } from './workflow';

// ------------------------------------------------------------------------------------------------
// State
// ------------------------------------------------------------------------------------------------

/** A booking's status as a badge, or "Hire Overdue" in red. */
export function BookingStateBadge({ booking, now, className }: { booking: Booking; now: number; className?: string }) {
  const state = stateOf(booking, now);
  if (!state.label) return <span className="text-muted-foreground">–</span>;
  if (state.overdue)
    return (
      <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-danger/12 px-2 py-0.5 text-xs font-semibold text-danger', className)}>
        <AlertTriangle className="size-3" />
        Hire Overdue
      </span>
    );
  return (
    <ColorBadge color={state.color} className={className}>
      {state.label}
    </ColorBadge>
  );
}

const STEP_LABELS: Record<(typeof STEPS)[number], string> = { 'Asset Reserved': 'Reserved', 'Hire Commenced': 'On hire', Closed: 'Returned' };

/** Reserved → On hire → Returned, with when each happened; a cancelled booking ends in a cross. */
export function StatusStepper({ booking, now, className }: { booking: Booking; now: number; className?: string }) {
  const { index, cancelled } = stepOf(booking);
  const overdue = stateOf(booking, now).overdue;
  const dates = [booking.createdDate ?? booking.systemHeader?.createdDate, booking.commencedDate, booking.closedDate];
  const steps = cancelled
    ? [
        { label: 'Reserved', date: dates[0], state: 'done' as const },
        { label: 'Cancelled', date: booking.updatedDate as string | undefined, state: 'cancelled' as const, note: nameOf(booking.cancelReasonRel) },
      ]
    : STEPS.map((status, i) => ({
        label: STEP_LABELS[status],
        date: i <= index ? (dates[i] as string | undefined) : undefined,
        state: i < index || (i === index && status === 'Closed') ? ('done' as const) : i === index ? ('current' as const) : ('todo' as const),
        note: i === 1 && overdue ? 'Overdue' : i === 2 && index < 2 ? `Due ${formatDateTime(booking.endDate)}` : undefined,
      }));
  return (
    <ol className={cn('flex items-start', className)} aria-label="Progress">
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={step.state === 'current' ? 'step' : undefined}>
          {i > 0 && <span aria-hidden className={cn('absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2', step.state === 'todo' ? 'bg-border' : step.state === 'cancelled' ? 'bg-danger/40' : 'bg-primary')} />}
          <span
            className={cn(
              'relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
              step.state === 'done' && 'border-primary bg-primary text-primary-foreground',
              step.state === 'current' && (overdue ? 'border-danger bg-danger/10 text-danger' : 'border-primary bg-card text-primary ring-4 ring-primary/15'),
              step.state === 'todo' && 'border-border bg-card text-muted-foreground',
              step.state === 'cancelled' && 'border-danger bg-danger text-white',
            )}
          >
            {step.state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : step.state === 'cancelled' ? <XCircle className="size-4" /> : step.state === 'current' && overdue ? <AlertTriangle className="size-3.5" /> : i + 1}
          </span>
          <span className={cn('mt-2 text-[13px] font-medium', step.state === 'todo' && 'text-muted-foreground', step.state === 'cancelled' && 'text-danger')}>{step.label}</span>
          <span className={cn('mt-0.5 px-1 text-xs text-muted-foreground tabular', step.note === 'Overdue' && 'font-medium text-danger')}>
            {step.note === 'Overdue' ? 'Overdue' : step.date ? formatDateTime(step.date) : step.note ?? ' '}
          </span>
          {step.state === 'cancelled' && step.note && <span className="text-xs text-muted-foreground">{step.note}</span>}
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------------------------------------
// When: start and end, quick durations, the booking time rules
// ------------------------------------------------------------------------------------------------

export interface TimeRange {
  start?: string;
  end?: string;
}

/** Problems with a range for the booking time rules: blocking ones, and ones only shown (managers). */
export function rangeProblems(range: TimeRange, maxHours: number | null | undefined, exempt: boolean): { errors: string[]; warnings: string[] } {
  const problems = bookingTimeProblems({ start: range.start, end: range.end, maxHours, defaultMaxHours: MAX_BOOKING_HOURS });
  const overLimit = problems.filter((p) => p.includes('at most'));
  return exempt ? { errors: problems.filter((p) => !p.includes('at most')), warnings: overLimit.map((p) => `${p} You can book longer as a fleet manager.`) } : { errors: problems, warnings: [] };
}

/**
 * Start and end of a booking: moving the start keeps the length; quick durations set the end.
 * @param showMissing - Say "Choose when…" when a time is missing (after a save attempt)
 * @param pastWarning - Warn when the start has passed (a new booking: the server starts it now)
 */
export function TimeRangeFields({
  value,
  onChange,
  maxHours,
  exempt,
  showMissing,
  pastWarning,
  now,
  idPrefix = 'when',
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  maxHours?: number | null;
  exempt: boolean;
  showMissing?: boolean;
  pastWarning?: string;
  now: number;
  idPrefix?: string;
}) {
  const { errors, warnings } = rangeProblems(value, maxHours, exempt);
  const shownErrors = errors.filter((e) => showMissing || !e.startsWith('Choose when'));
  const length = value.start && value.end ? new Date(value.end).getTime() - new Date(value.start).getTime() : NaN;
  const startsInPast = !!pastWarning && !!value.start && new Date(value.start).getTime() < now - 5 * MINUTE;
  const limit = Number(maxHours) || MAX_BOOKING_HOURS;
  const chip = (active: boolean) =>
    cn(
      'h-7 cursor-pointer rounded-full border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
      active ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card text-muted-foreground hover:border-input hover:text-foreground',
    );
  const startOrNext = () => value.start ?? new Date(Math.ceil(now / (30 * MINUTE)) * 30 * MINUTE).toISOString();
  return (
    <div className="grid gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" htmlFor={`${idPrefix}-start`} required>
          <DateTimeInput id={`${idPrefix}-start`} value={value.start} onChange={(start) => onChange(moveStart(value.start, value.end, start))} invalid={!!shownErrors.length && !value.start} />
        </Field>
        <Field label="Ends" htmlFor={`${idPrefix}-end`} required>
          <DateTimeInput id={`${idPrefix}-end`} value={value.end} onChange={(end) => onChange({ start: value.start, end })} invalid={!!shownErrors.length} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick durations">
        {QUICK_HOURS.map((h) => (
          <button key={h} type="button" className={chip(length === h * HOUR)} disabled={!exempt && h > limit} onClick={() => onChange({ start: startOrNext(), end: endAfter(startOrNext(), h) })}>
            {h} h
          </button>
        ))}
        <button type="button" className={chip(false)} onClick={() => onChange({ start: startOrNext(), end: untilFivePm(startOrNext()) })}>
          Until 5 pm
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Clock className="size-3.5" />
          {Number.isFinite(length) && length > 0 ? (
            <>
              <span className="font-medium text-foreground tabular">{lengthText(length)}</span>
              <span>of {limit} h max</span>
            </>
          ) : (
            'Choose a start and end'
          )}
        </span>
      </div>
      {(shownErrors.length > 0 || warnings.length > 0 || startsInPast) && (
        <ul className="grid gap-1 text-[13px]">
          {shownErrors.map((p) => (
            <li key={p} className="flex items-start gap-1.5 font-medium text-danger">
              <XCircle className="mt-0.5 size-3.5 shrink-0" />
              {p}
            </li>
          ))}
          {warnings.map((p) => (
            <li key={p} className="flex items-start gap-1.5 text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {p}
            </li>
          ))}
          {startsInPast && (
            <li className="flex items-start gap-1.5 text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {pastWarning}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Bars: colours shared by the timeline, the mobile day and the availability strip
// ------------------------------------------------------------------------------------------------

/** Diagonal red stripes: the part of a hire past its end. */
export const OVERDUE_STRIPES = 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--danger) 30%, var(--card)) 0 6px, color-mix(in oklab, var(--danger) 14%, var(--card)) 6px 12px)';

/** Amber hatching: an asset in the workshop. */
export const BLOCK_STRIPES = 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--warning) 24%, var(--card)) 0 6px, color-mix(in oklab, var(--warning) 10%, var(--card)) 6px 12px)';

/** The colour a bar is drawn in: its status colour, amber for the workshop, grey when done. */
export const itemColor = (item: Item) => (item.kind === 'block' ? 'var(--warning)' : item.active ? item.color || 'var(--primary)' : 'var(--muted-foreground)');

/** A bar's fill and text: a tint of its colour with a strong left edge; hatching for block-outs. */
export function itemTone(item: Item): CSSProperties {
  const c = itemColor(item);
  if (item.kind === 'block')
    return { background: BLOCK_STRIPES, color: 'color-mix(in oklab, var(--warning) 45%, var(--foreground))', boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--warning) 50%, transparent)' };
  return { background: `color-mix(in oklab, ${c} ${item.active ? 17 : 11}%, var(--card))`, color: `color-mix(in oklab, ${c} 72%, var(--foreground))`, boxShadow: `inset 3px 0 0 ${c}` };
}

/** The base classes of a bar. */
// overflow: clip (not hidden) keeps the bar from being a scroll container, so its label can stick.
export const barClass = (item: Item) => cn('overflow-clip rounded-md text-left', !item.active && item.kind === 'booking' && 'opacity-80');

/** What a bar's tooltip says. */
export function ItemTip({ item, mine }: { item: Item; mine?: boolean }) {
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center gap-1.5 font-semibold">
        {item.kind === 'block' && <Wrench className="size-3" />}
        {item.ref}
        <span className="font-normal opacity-80">· {item.overdue ? 'Hire Overdue' : item.status}</span>
      </div>
      {item.kind === 'booking' && <div>{mine ? 'Your booking' : item.person}</div>}
      <div className="opacity-80">
        {formatDateTime(item.start)} – {item.openEnded ? 'until further notice' : formatDateTime(item.end)}
      </div>
      {item.overdue && <div className="font-medium">Not returned: blocks the asset until it is back</div>}
      {(item.reason || item.destination) && <div className="opacity-80">{[item.reason, item.destination].filter(Boolean).join(' · ')}</div>}
    </div>
  );
}

/** "1:00 pm – 3:00 pm", naming the day ("Wed 11") of an end or start not on the day shown. */
export function timesText(item: Item, shownDay: number) {
  const day = (t: number) => (startOfDay(t) === startOfDay(shownDay) ? '' : `${new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} `);
  if (item.openEnded) return `${day(item.start)}${formatTime(item.start)} – further notice`;
  return `${day(item.start)}${formatTime(item.start)} – ${day(item.end)}${formatTime(item.end)}`;
}

// ------------------------------------------------------------------------------------------------
// Availability strip: an asset's day(s) around a period, with the period on top
// ------------------------------------------------------------------------------------------------

/**
 * An asset's bookings and block-outs over the days a period covers (up to a week), with the period
 * highlighted: green when free, red when it clashes.
 */
export function AvailabilityStrip({ items, start, end, clash, loading, ignoreId, className }: { items: Item[]; start?: string; end?: string; clash: boolean; loading?: boolean; ignoreId?: string; className?: string }) {
  const s = start ? new Date(start).getTime() : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  const from = startOfDay(s);
  const days = Math.min(7, Math.max(1, Math.round((startOfDay(e - 1) - from) / DAY) + 1));
  const to = addDays(from, days);
  const pct = (t: number) => `${(Math.min(Math.max(t, from), to) - from) / (to - from) * 100}%`;
  const span = (a: number, b: number) => ({ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` });
  const ticks: { t: number; label: string; major: boolean }[] = [];
  if (days === 1) for (let h = 0; h <= 24; h += 3) ticks.push({ t: from + h * HOUR, label: h % 24 === 0 && h ? '' : formatTime(from + h * HOUR).replace(':00', ''), major: h % 12 === 0 });
  else for (let d = 0; d < days; d++) ticks.push({ t: addDays(from, d), label: new Date(addDays(from, d)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }), major: true });
  const shown = items.filter((i) => i.id !== ignoreId && i.start < to && Math.max(i.drawEnd, i.active ? i.until : 0) > from);
  return (
    <div className={cn('rounded-lg border border-border bg-muted/40 p-3', className)}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">{days === 1 ? formatDate(from) : `${formatDate(from)} – ${formatDate(to - 1)}`}</span>
        {loading ? (
          <span className="text-muted-foreground">Checking…</span>
        ) : clash ? (
          <span className="inline-flex items-center gap-1 font-medium text-danger">
            <Ban className="size-3.5" /> Clashes
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-success">
            <CheckCircle2 className="size-3.5" /> Free for your times
          </span>
        )}
      </div>
      <div className="relative h-9 rounded-md bg-card ring-1 ring-border">
        {ticks.map((tick) => (
          <span key={tick.t} className={cn('absolute top-0 bottom-0 w-px', tick.major ? 'bg-border' : 'bg-border/50')} style={{ left: pct(tick.t) }} />
        ))}
        {loading && <Skeleton className="absolute inset-1.5" />}
        {shown.map((item) => (
          <span key={item.id} className={cn('absolute top-1.5 bottom-1.5', barClass(item))} style={{ ...itemTone(item), ...span(item.start, item.overdue ? item.until : item.drawEnd) }} title={`${item.ref} · ${item.overdue ? 'Hire Overdue' : item.status}${item.person ? ` · ${item.person}` : ''}`}>
            {item.overdue && <span className="absolute inset-0" style={{ background: OVERDUE_STRIPES, left: `${((item.end - item.start) / (item.until - item.start)) * 100}%` }} />}
          </span>
        ))}
        <span
          aria-hidden
          className={cn('absolute -top-1 -bottom-1 rounded-md border-2', clash ? 'border-danger bg-danger/15' : 'border-success bg-success/15')}
          style={span(s, e)}
        />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted-foreground">
        {ticks.map((tick) =>
          tick.label ? (
            <span key={tick.t} className={cn('absolute whitespace-nowrap', days === 1 ? '-translate-x-1/2' : 'pl-1')} style={{ left: pct(tick.t) }}>
              {tick.label}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Small bits
// ------------------------------------------------------------------------------------------------

/** A label and its value, in a definition list. */
export function Fact({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid min-w-0 gap-0.5', className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children || <span className="text-muted-foreground">–</span>}</dd>
    </div>
  );
}

/** The person a booking is for: "You" for the signed-in person. */
export const requesterName = (booking: Booking, myId: string) => {
  const person = first(booking.requestedByRel);
  return person ? (person.documentId === myId ? 'You' : person.name) : '';
};
