// The actions on a booking: start the hire (meter at start), return it (meter at end, distance,
// end-of-hire checks), cancel it (reason), or move its times while reserved (clash checks). Each
// checks validateBooking first (the server answers a refused update with a generic error), then
// saves only the change and the new status.

import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Flag, Gauge, KeyRound, Loader2, Undo2, Wrench, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@react-frontends/shared/components';
import { LookupSelect } from '@/components/pickers';
import { Button, Dialog, DialogContent, DialogFooter, Field, Input } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { useRecord, useUpdate } from '@/data/records';
import { useSession } from '@/data/session';
import { meterProblems } from '@/domain/logic/meter';
import { addDays, startOfDay } from '@/domain/logic/time';
import { first, type Asset, type Booking, type LookupValue } from '@/domain/types';
import { validateBooking } from '@/domain/validate';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { formatMeter, formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { checkPeriod } from './availability';
import { useItems } from './data';
import { useNow } from './hooks';
import { AvailabilityStrip, rangeProblems, TimeRangeFields, type TimeRange } from './parts';
import { estimateCost, lengthText } from './times';
import { cancelChange, returnChange, startChange, statusValue, timesChange, withChange, type BookingAction, type Change } from './workflow';

/** Largest believable meter increase at the start and end of a hire (the form's meter fields). */
const START_MAX_INCREASE = 2000;
const END_MAX_INCREASE = 3000;

export const ACTION_LABELS: Record<BookingAction, string> = { start: 'Start hire', return: 'Return', cancel: 'Cancel booking', editTimes: 'Change times' };
export const ACTION_ICONS: Record<BookingAction, typeof KeyRound> = { start: KeyRound, return: Undo2, cancel: XCircle, editTimes: CalendarClock };

/** Saves a change to a booking after checking it as the server will; toasts and closes on success. */
function useSaveChange(booking: Booking, onDone: () => void) {
  const { who } = useSession();
  const update = useUpdate<Booking>('booking');
  const [error, setError] = useState('');
  const save = (change: Change, success: string, description?: string) => {
    const message = validateBooking(withChange(booking, change), who);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    update.mutate(
      { documentId: booking.documentId, fields: change },
      {
        onSuccess: () => {
          toast.success(success, { description });
          onDone();
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  };
  return { save, error, setError, saving: update.isPending };
}

/** The status value of a name, from the bookingStatus lookup. */
export function useStatus(name: string) {
  const { data } = useLookup('bookingStatus');
  return useMemo(() => {
    const found = data?.find((s) => s.name === name);
    return found ? statusValue(found) : undefined;
  }, [data, name]);
}

const numberOf = (text: string) => (text.trim() === '' ? undefined : Number(text.replace(/,/g, '')));

/** A list of checks: passed (green), warnings (amber), problems (red). */
function Checks({ items }: { items: { tone: 'ok' | 'warn' | 'bad'; text: ReactNode }[] }) {
  if (!items.length) return null;
  return (
    <ul className="grid gap-1.5 rounded-lg border border-border bg-muted/40 p-3 text-[13px]">
      {items.map((item, i) => (
        <li key={i} className={cn('flex items-start gap-2', item.tone === 'ok' && 'text-foreground', item.tone === 'warn' && 'text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]', item.tone === 'bad' && 'font-medium text-danger')}>
          {item.tone === 'ok' ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> : item.tone === 'warn' ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> : <XCircle className="mt-0.5 size-3.5 shrink-0" />}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** The meter input with its unit. */
function MeterInput({ id, value, onChange, unit, invalid, placeholder }: { id: string; value: string; onChange: (v: string) => void; unit: string; invalid?: boolean; placeholder?: string }) {
  return (
    <div className="relative">
      <Gauge className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} placeholder={placeholder} className="pr-14 pl-9 text-base tabular sm:text-sm" />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground">{unit === 'hours' ? 'hours' : 'km'}</span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

export function StartHireDialog({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (o: boolean) => void }) {
  const now = useNow();
  const assetRef = first(booking.assetRel);
  const asset = useRecord<Asset>(open ? assetRef?.documentId : undefined);
  const status = useStatus('Hire Commenced');
  const [meter, setMeter] = useState('');
  const { save, error, setError, saving } = useSaveChange(booking, () => onOpenChange(false));
  const unit = assetRef?.primaryMeterUnit ?? asset.data?.primaryMeterUnit ?? 'km';

  useEffect(() => {
    if (!open) return;
    setError('');
    setMeter(asset.data?.meterReadingNum !== undefined ? String(asset.data.meterReadingNum) : '');
  }, [open, asset.data?.meterReadingNum, setError]);

  const reading = numberOf(meter);
  const assetMeter = asset.data?.meterReadingNum;
  const problems = reading === undefined ? [] : meterProblems({ reading, assetMeter, maxIncrease: START_MAX_INCREASE, unit });
  const start = new Date(booking.startDate ?? '').getTime();
  const end = new Date(booking.endDate ?? '').getTime();
  const hire = asset.data ? first(asset.data.hireStatusRel)?.name : undefined;
  const checks: { tone: 'ok' | 'warn' | 'bad'; text: ReactNode }[] = [];
  if (reading !== undefined && Number.isNaN(reading)) checks.push({ tone: 'bad', text: 'Enter the meter as a number.' });
  for (const p of problems) checks.push({ tone: p.includes('negative') ? 'bad' : 'warn', text: p });
  if (reading !== undefined && !Number.isNaN(reading) && !problems.length && assetMeter !== undefined) checks.push({ tone: 'ok', text: `Matches the asset's meter (${formatMeter(assetMeter, unit)})` });
  if (start - now > 30 * 60_000) checks.push({ tone: 'warn', text: `Starting early: the booking starts ${relative(start, now)}.` });
  if (end < now) checks.push({ tone: 'warn', text: `The booked time ended ${relative(end, now)}: the hire will be overdue straight away.` });
  if (hire && hire !== 'Available For Hire') checks.push({ tone: 'warn', text: `${assetRef?.assetId} is ${hire}${hire === 'On Hire' ? ': an earlier hire may not be back yet' : ''}.` });
  const blocked = checks.some((c) => c.tone === 'bad');

  const submit = () => {
    if (!status) return;
    if (reading === undefined) return setError('Enter the meter reading at the start of the hire.');
    if (Number.isNaN(reading) || blocked) return;
    save(startChange(status, reading), `${booking.bookingRef ?? 'Booking'}: hire started`, `${assetRef?.assetId} is on hire until ${formatDateTime(booking.endDate)}.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Start hire of ${assetRef?.assetId ?? 'the asset'}`} description="Read the meter before you drive off. It is recorded on the booking.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label={unit === 'hours' ? 'Engine hours at start' : 'Odometer at start'} htmlFor="start-meter" required hint={assetMeter !== undefined ? `Last reading ${formatMeter(assetMeter, unit)}${asset.data?.meterReadingDate ? `, ${relative(asset.data.meterReadingDate, now)}` : ''}` : asset.isLoading ? 'Loading the asset’s meter…' : undefined}>
            <MeterInput id="start-meter" value={meter} onChange={setMeter} unit={unit} invalid={!!error || blocked} />
          </Field>
          <Checks items={checks} />
          {error && <Alert>{error}</Alert>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Not yet
            </Button>
            <Button type="submit" disabled={saving || !status || blocked}>
              {saving ? <Loader2 className="animate-spin" /> : <KeyRound />}
              Start hire
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------

export function ReturnDialog({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (o: boolean) => void }) {
  const now = useNow(30_000);
  const assetRef = first(booking.assetRel);
  const asset = useRecord<Asset>(open ? assetRef?.documentId : undefined);
  const status = useStatus('Closed');
  const [meter, setMeter] = useState('');
  const { save, error, setError, saving } = useSaveChange(booking, () => onOpenChange(false));
  const unit = assetRef?.primaryMeterUnit ?? asset.data?.primaryMeterUnit ?? 'km';

  useEffect(() => {
    if (!open) return;
    setError('');
    setMeter('');
  }, [open, setError]);

  const reading = numberOf(meter);
  const startMeter = booking.startMeterNum;
  const valid = reading !== undefined && !Number.isNaN(reading);
  const distance = valid && startMeter !== undefined && startMeter !== null ? Math.round((reading - Number(startMeter)) * 10) / 10 : undefined;
  const problems = valid ? meterProblems({ reading, minimum: startMeter, assetMeter: asset.data?.meterReadingNum, maxIncrease: END_MAX_INCREASE, unit }) : [];
  const end = new Date(booking.endDate ?? '').getTime();
  const late = now - end;
  const cost = estimateCost(assetRef ?? undefined, booking.startDate, booking.endDate, new Date(now).toISOString());

  const checks: { tone: 'ok' | 'warn' | 'bad'; text: ReactNode }[] = [];
  if (reading !== undefined && !valid) checks.push({ tone: 'bad', text: 'Enter the meter as a number.' });
  for (const p of problems) checks.push({ tone: p.startsWith('Lower than the start') || p.includes('negative') ? 'bad' : 'warn', text: p });
  if (valid && !problems.length) checks.push({ tone: 'ok', text: `Not below the start reading (${formatMeter(startMeter, unit)})` });
  checks.push(late > 5 * 60_000 ? { tone: 'warn', text: `Returned ${lengthText(late)} late: the hire is charged until now.` } : { tone: 'ok', text: 'Returned on time' });
  const blocked = checks.some((c) => c.tone === 'bad');

  const submit = () => {
    if (!status) return;
    if (reading === undefined) return setError('Enter the meter reading at the end of the hire.');
    if (!valid || blocked) return;
    save(returnChange(status, reading), `${booking.bookingRef ?? 'Booking'}: returned`, distance !== undefined ? `${formatMeter(distance, unit)} ${unit === 'hours' ? 'of use' : 'driven'}. ${assetRef?.assetId} is available again.` : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Return ${assetRef?.assetId ?? 'the asset'}`} description="Read the meter as you hand it back. Closing the hire makes the asset available again.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label={unit === 'hours' ? 'Engine hours at end' : 'Odometer at end'} htmlFor="end-meter" required hint={`Started at ${formatMeter(startMeter, unit) || '–'}`}>
            <MeterInput id="end-meter" value={meter} onChange={setMeter} unit={unit} invalid={!!error || blocked} placeholder={startMeter !== undefined && startMeter !== null ? String(startMeter) : undefined} />
          </Field>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={unit === 'hours' ? 'Used' : 'Distance'} value={distance !== undefined && distance >= 0 ? formatMeter(distance, unit) : '–'} />
            <Stat label="Hire time" value={lengthText(Math.max(end, now) - new Date(booking.startDate ?? '').getTime()) || '–'} />
            <Stat label="Est. cost" value={cost !== undefined ? formatMoney(cost) : '–'} />
          </div>
          <Checks items={checks} />
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <Wrench className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Damage or a fault?{' '}
              <Link to={`/workshop/requests/new?asset=${assetRef?.documentId ?? ''}`} className="font-medium text-primary hover:underline">
                Report it to the workshop
              </Link>{' '}
              after returning.
            </span>
          </p>
          {error && <Alert>{error}</Alert>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Not yet
            </Button>
            <Button type="submit" disabled={saving || !status || blocked}>
              {saving ? <Loader2 className="animate-spin" /> : <Flag />}
              Return and close
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-2 py-2">
      <div className="text-[11px] font-medium text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular">{value}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------

export function CancelDialog({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (o: boolean) => void }) {
  const status = useStatus('Cancelled');
  const [reason, setReason] = useState<LookupValue>();
  const { save, error, setError, saving } = useSaveChange(booking, () => onOpenChange(false));
  useEffect(() => {
    if (!open) return;
    setReason(undefined);
    setError('');
  }, [open, setError]);
  const submit = () => {
    if (!status) return;
    if (!reason) return setError('Choose a Reason For Cancellation.');
    save(cancelChange(status, reason), `${booking.bookingRef ?? 'Booking'} cancelled`, `${first(booking.assetRel)?.assetId} is free again for those times.`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Cancel ${booking.bookingRef ?? 'this booking'}?`} description={`${first(booking.assetRel)?.assetId}, ${formatDateTime(booking.startDate)} – ${formatDateTime(booking.endDate)}. The asset becomes free for others to book.`}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Reason for cancellation" htmlFor="cancel-reason" required>
            <LookupSelect id="cancel-reason" kind="cancelReason" value={reason} onChange={setReason} placeholder="Choose a reason" invalid={!!error && !reason} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Keep booking
            </Button>
            <Button type="submit" variant="destructive" disabled={saving || !status}>
              {saving && <Loader2 className="animate-spin" />}
              Cancel booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------

export function EditTimesDialog({ booking, open, onOpenChange }: { booking: Booking; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { who } = useSession();
  const now = useNow();
  const assetRef = first(booking.assetRel);
  const status = first(booking.bookingStatusRel);
  const [range, setRange] = useState<TimeRange>({ start: booking.startDate, end: booking.endDate });
  const { save, error, setError, saving } = useSaveChange(booking, () => onOpenChange(false));
  useEffect(() => {
    if (!open) return;
    setRange({ start: booking.startDate, end: booking.endDate });
    setError('');
  }, [open, booking.startDate, booking.endDate, setError]);

  const s = range.start ? new Date(range.start).getTime() : NaN;
  const e = range.end ? new Date(range.end).getTime() : NaN;
  const period = Number.isFinite(s) && Number.isFinite(e) && e > s ? { start: startOfDay(s), end: Math.min(addDays(startOfDay(e - 1), 1), addDays(startOfDay(s), 7)) } : null;
  const assetIds = useMemo(() => (assetRef ? [assetRef.documentId] : []), [assetRef]);
  const items = useItems(open ? period : null, now, { activeOnly: true, assetIds });
  const check = period ? checkPeriod(items.items, s, e, { assetId: assetRef?.assetId ?? '', ignoreId: booking.documentId, reason: first(booking.bookingReasonRel)?.name }) : { clashes: [], message: '' };
  const times = rangeProblems(range, assetRef?.maxBookingHours, who.isManager);
  const changed = range.start !== booking.startDate || range.end !== booking.endDate;
  const before = estimateCost(assetRef, booking.startDate, booking.endDate);
  const after = estimateCost(assetRef, range.start, range.end);

  const submit = () => {
    if (!status || !range.start || !range.end) return setError('Choose when the booking starts and ends.');
    if (times.errors.length) return setError(times.errors.join(' '));
    if (check.message) return setError(check.message);
    save(timesChange(statusValue(status), range.start, range.end), `${booking.bookingRef ?? 'Booking'} moved`, `${assetRef?.assetId}, ${formatDateTime(range.start)} – ${formatDateTime(range.end)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="Change the booking times" description={`${assetRef?.name ?? ''}. The asset must be free for the new times.`}>
        <form
          className="grid gap-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            submit();
          }}
        >
          <TimeRangeFields value={range} onChange={setRange} maxHours={assetRef?.maxBookingHours} exempt={who.isManager} now={now} idPrefix="edit" showMissing pastWarning="The new start has already passed." />
          <AvailabilityStrip items={items.items} start={range.start} end={range.end} clash={check.clashes.length > 0} loading={items.isLoading || items.isPlaceholder} ignoreId={booking.documentId} />
          {check.message && <Alert>{check.message}</Alert>}
          {changed && before !== undefined && after !== undefined && before !== after && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              Estimated hire cost <span className="tabular line-through">{formatMoney(before)}</span>
              <ArrowRight className="size-3.5" />
              <span className="font-semibold text-foreground tabular">{formatMoney(after)}</span>
            </p>
          )}
          {error && error !== check.message && <Alert>{error}</Alert>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Keep times
            </Button>
            <Button type="submit" disabled={saving || !changed || !!check.message || times.errors.length > 0}>
              {saving && <Loader2 className="animate-spin" />}
              Save times
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The dialog for an action. */
export function ActionDialog({ action, booking, onClose }: { action: BookingAction | null; booking: Booking; onClose: () => void }) {
  const props = { booking, onOpenChange: (o: boolean) => !o && onClose() };
  return (
    <>
      <StartHireDialog {...props} open={action === 'start'} />
      <ReturnDialog {...props} open={action === 'return'} />
      <CancelDialog {...props} open={action === 'cancel'} />
      <EditTimesDialog {...props} open={action === 'editTimes'} />
    </>
  );
}
