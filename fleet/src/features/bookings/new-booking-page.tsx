// /bookings/new (?asset=<documentId>&start=<iso>&end=<iso>): book an asset. The picker offers the
// person's bookable assets and says which are free for the chosen times; the booking time rules,
// pools, licence and clashes are checked as the server will, and a summary shows the length and the
// estimated hire cost. Saved as Asset Reserved.

import { ArrowLeft, CalendarCheck2, CheckCircle2, Clock, Loader2, MapPin, NotebookPen, Sparkles, Truck, UserRound, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AssetIcon } from '@/components/asset-icon';
import { Alert, Page, PageHeader } from '@react-frontends/shared/components';
import { AssetPicker, LookupSelect, PersonPicker } from '@/components/pickers';
import { Button, Card, CardContent, Field, Input, PersonAvatar, Separator, Textarea } from '@react-frontends/shared/ui';
import { useTemplates } from '@/data/catalog';
import { useCreate, useRecord } from '@/data/records';
import { useSession } from '@/data/session';
import { assetValue } from '@/data/values';
import { addDays, rangeLabel, startOfDay } from '@/domain/logic/time';
import { first, nameOf, type Asset, type AssetValue, type Booking, type LookupValue, type PersonValue } from '@/domain/types';
import { validateBooking } from '@/domain/validate';
import { terms } from '@react-frontends/shared/es';
import { formatDateTime } from '@react-frontends/shared/format';
import { formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { assetProblem, bookerProblem, checkPeriod, clashNote, licenceCovers, pickerBlock } from './availability';
import { useStatus } from './booking-actions';
import { BOOKABLE_FILTER, useBookableRows, useItems } from './data';
import { useBooker, useNow } from './hooks';
import { itemsByAsset } from './model';
import { AvailabilityStrip, rangeProblems, TimeRangeFields, type TimeRange } from './parts';
import { defaultRange, estimateCost, lengthText, ratesText } from './times';

const validIso = (value: string | null) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined);

function Section({ icon: Icon, title, children, aside }: { icon: typeof Truck; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid gap-4 px-5 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-4" />
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function NewBookingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { who, me } = useSession();
  const { booker, poolIds } = useBooker();
  const now = useNow();
  const templates = useTemplates();
  const reserved = useStatus('Asset Reserved');
  const create = useCreate<Booking>('booking');

  const [range, setRange] = useState<TimeRange>(() => {
    const start = validIso(params.get('start'));
    const end = validIso(params.get('end'));
    return start && end ? { start, end } : defaultRange(Date.now());
  });
  const [asset, setAsset] = useState<AssetValue>();
  const [assetDoc, setAssetDoc] = useState<Asset>();
  const [reason, setReason] = useState<LookupValue>();
  const [jobCode, setJobCode] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [requester, setRequester] = useState<PersonValue | undefined>(me ?? undefined);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');

  // ?asset=…: the asset chosen on the calendar.
  const prefillId = params.get('asset') ?? undefined;
  const prefill = useRecord<Asset>(prefillId);
  useEffect(() => {
    if (prefill.data && !asset) {
      setAsset(assetValue(prefill.data));
      setAssetDoc(prefill.data);
    }
  }, [prefill.data, asset]);
  useEffect(() => {
    if (!requester && me) setRequester(me);
  }, [me, requester]);
  // A refusal is about what was sent: it goes once the asset or times change.
  useEffect(() => setServerError(''), [asset?.documentId, range.start, range.end]);

  // Availability: active bookings and block-outs over the days the times cover.
  const s = range.start ? Date.parse(range.start) : NaN;
  const e = range.end ? Date.parse(range.end) : NaN;
  const validTimes = Number.isFinite(s) && Number.isFinite(e) && e > s;
  const period = useMemo(() => (validTimes ? { start: startOfDay(s), end: Math.min(addDays(startOfDay(e - 1), 1), addDays(startOfDay(s), 7)) } : null), [validTimes, s, e]);
  const items = useItems(period, now, { activeOnly: true });
  const checking = items.isLoading || items.isPlaceholder;
  const byAsset = useMemo(() => itemsByAsset(items.items), [items.items]);
  const checkFor = (documentId: string, assetId: string) => (validTimes ? checkPeriod(byAsset.get(documentId), s, e, { assetId, reason: reason?.name }) : { clashes: [], message: '' });

  const forSelf = !requester || requester.documentId === me?.documentId;
  const pickerFilter = useMemo(() => (who.isManager ? BOOKABLE_FILTER : [...BOOKABLE_FILTER, terms('poolsRel.documentId', poolIds.length ? poolIds : ['none'])]), [who.isManager, poolIds]);
  const rows = useBookableRows();

  // What stops the booking, field by field (the server's checks, in its words).
  const check = asset ? checkFor(asset.documentId, asset.assetId) : { clashes: [], message: '' };
  const unavailable = assetDoc ? assetProblem(assetDoc, reason?.name) : '';
  const personIssue = asset && assetDoc && !who.isManager && forSelf && booker ? bookerProblem(booker, assetDoc, range.end) : '';
  const times = rangeProblems(range, asset?.maxBookingHours, who.isManager);
  const errors = {
    asset: !asset ? 'Choose the asset to book.' : personIssue || unavailable || check.message,
    when: times.errors.join(' '),
    reason: reason ? '' : 'Choose a reason for booking.',
    requester: requester ? '' : 'Choose who the booking is for.',
  };
  const blocking = Object.values(errors).filter(Boolean);
  const cost = asset ? estimateCost(asset, range.start, range.end) : undefined;

  // Free assets of the same kind, when the chosen one can't be had then.
  const alternatives = useMemo(() => {
    if (!asset || !validTimes || (!check.clashes.length && !unavailable)) return [];
    const typeId = first(assetDoc?.assetTypeRel)?.documentId;
    return rows.rows
      .filter((r) => r.documentId !== asset.documentId && !r.unavailable && !checkPeriod(byAsset.get(r.documentId), s, e, { assetId: r.assetId }).clashes.length)
      .filter((r) => who.isManager || !booker || licenceCovers((booker.licencesRel ?? []).map((l) => l.name), r.asset.requiredLicence))
      .sort((a, b) => Number(b.typeId === typeId) - Number(a.typeId === typeId) || a.assetId.localeCompare(b.assetId, undefined, { numeric: true }))
      .slice(0, 6);
  }, [asset, assetDoc, validTimes, check.clashes.length, unavailable, rows.rows, byAsset, s, e, who.isManager, booker]);

  const submit = () => {
    setSubmitted(true);
    setServerError('');
    if (!reserved || !asset || !requester || !range.start || !range.end || blocking.length) return;
    const fields: Partial<Booking> = {
      bookingStatusRel: [reserved],
      assetRel: [asset],
      requestedByRel: [requester],
      startDate: range.start,
      endDate: range.end,
      bookingReasonRel: reason ? [reason] : [],
      jobCode: jobCode.trim(),
      destination: destination.trim(),
      bookingNotes: notes.trim(),
    };
    const message = validateBooking(fields, who);
    if (message) return setServerError(message);
    create.mutate(fields, {
      onSuccess: (saved) => {
        const ref = saved?.bookingRef ?? 'Booking';
        toast.success(`${ref} booked`, {
          description: saved?.startAdjustedBool ? `${asset.assetId} from now (the start had passed) until ${formatDateTime(saved.endDate)}.` : `${asset.assetId}, ${rangeLabel(saved?.startDate ?? range.start, saved?.endDate ?? range.end)}.`,
        });
        navigate(saved?.documentId ? `/bookings/${saved.documentId}` : '/bookings', { replace: true });
      },
      onError: (err) => {
        setServerError((err as Error).message);
        // A clash the server found means our picture of the asset is out of date.
        void items.refetch();
      },
    });
  };

  const show = (message: string) => (submitted ? message : '');
  const formBusy = create.isPending;
  const ready = !!reserved && !!templates.data;

  const summary = (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-muted/40 px-5 py-4">
        {asset ? (
          <div className="flex items-center gap-3">
            <AssetIcon kind={asset.iconKind} color={first(assetDoc?.hireStatusRel)?.color} size={44} />
            <div className="min-w-0">
              <div className="font-semibold">{asset.assetId}</div>
              <div className="truncate text-sm text-muted-foreground">{asset.name.split(' · ')[1] ?? asset.name}</div>
              {ratesText(asset) && <div className="text-xs text-muted-foreground">{ratesText(asset)}</div>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex size-11 items-center justify-center rounded-lg border border-dashed border-input">
              <Truck className="size-5" />
            </span>
            No asset chosen yet
          </div>
        )}
      </div>
      <CardContent className="grid gap-4 pt-4">
        <div className="grid gap-1">
          <div className="text-xs font-medium text-muted-foreground">When</div>
          <div className="text-sm font-medium">{validTimes ? rangeLabel(range.start, range.end) : '–'}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {validTimes ? lengthText(e - s) : 'Choose a start and end'}
            {asset?.maxBookingHours ? ` · up to ${asset.maxBookingHours} h` : ''}
          </div>
        </div>
        <Separator />
        <div>
          <div className="text-xs font-medium text-muted-foreground">Estimated hire cost</div>
          <div className="mt-0.5 text-3xl font-semibold tracking-tight tabular">{cost !== undefined ? formatMoney(cost) : '–'}</div>
          <p className="mt-1 text-xs text-muted-foreground">Charged by the hour, capped at the daily rate each day; weekends are free. The final cost counts until it is returned.</p>
        </div>
        <Availability asset={asset} loading={checking && !!asset} problem={errors.asset && asset ? errors.asset : ''} />
        {serverError && <Alert>{serverError}</Alert>}
        <Button size="lg" className="w-full" onClick={submit} disabled={formBusy || !ready}>
          {formBusy ? <Loader2 className="animate-spin" /> : <CalendarCheck2 />}
          Book {asset?.assetId ?? 'asset'}
        </Button>
        {submitted && blocking.length > 0 && <p className="text-center text-xs text-danger">{blocking.length === 1 ? blocking[0] : `${blocking.length} things to fix before booking.`}</p>}
      </CardContent>
    </Card>
  );

  return (
    <Page>
      <Link to="/bookings" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Bookings
      </Link>
      <PageHeader title="New booking" description="Reserve a vehicle or plant. Start the hire when you collect it, and return it when you're done." className="pb-5" />
      <form
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]"
      >
        <Card className="divide-y divide-border">
          <Section icon={Truck} title="Asset" aside={!who.isManager && <span className="text-xs text-muted-foreground">From your vehicle hire pools</span>}>
            <Field label="Asset" htmlFor="asset" required error={asset ? errors.asset : show(errors.asset)} hint={asset ? [asset.registration, assetDoc ? nameOf(assetDoc.locationRel) : '', asset.requiredLicence ? `${asset.requiredLicence} licence` : ''].filter(Boolean).join(' · ') : 'Each option says whether it is free for your times.'}>
              <AssetPicker
                id="asset"
                value={asset}
                onChange={(value, doc) => {
                  setAsset(value);
                  setAssetDoc(doc);
                }}
                filter={pickerFilter}
                invalid={!!(asset ? errors.asset : show(errors.asset))}
                placeholder={prefill.isLoading ? 'Loading…' : 'Choose an asset'}
                disabledReason={(a) => (!who.isManager && forSelf && booker ? pickerBlock(booker, a) : undefined)}
                describe={(a) => {
                  if (!validTimes) return undefined;
                  const unav = assetProblem(a, reason?.name);
                  const c = checkFor(a.documentId, a.assetId);
                  const where = [a.registration, nameOf(a.locationRel)].filter(Boolean).join(' · ');
                  if (unav) return <span className="text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]">Unavailable For Hire{where ? ` · ${where}` : ''}</span>;
                  if (c.clashes.length) return <span className="text-danger">{clashNote(c.clashes[0])}</span>;
                  return (
                    <span>
                      <span className="font-medium text-success">Free then</span>
                      {where ? ` · ${where}` : ''}
                    </span>
                  );
                }}
              />
            </Field>
            {alternatives.length > 0 && (
              <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Sparkles className="size-3.5 text-primary" />
                  Free for your times
                </div>
                <div className="flex flex-wrap gap-2">
                  {alternatives.map((r) => (
                    <button
                      key={r.documentId}
                      type="button"
                      onClick={() => {
                        setAsset(assetValue(r.asset));
                        setAssetDoc(r.asset);
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card py-1.5 pr-3 pl-1.5 text-left text-[13px] shadow-xs transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
                    >
                      <AssetIcon kind={r.iconKind} color={r.hireStatus?.color} size={26} />
                      <span>
                        <span className="block font-medium">{r.assetId}</span>
                        <span className="block text-xs text-muted-foreground">{r.model}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section icon={Clock} title="When">
            <TimeRangeFields value={range} onChange={setRange} maxHours={asset?.maxBookingHours} exempt={who.isManager} showMissing={submitted} pastWarning="The start has passed: the booking will start when you save it." now={now} />
            {asset && <AvailabilityStrip items={byAsset.get(asset.documentId) ?? []} start={range.start} end={range.end} clash={check.clashes.length > 0} loading={checking} />}
          </Section>

          <Section icon={MapPin} title="Trip">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reason for booking" htmlFor="reason" required error={show(errors.reason)}>
                <LookupSelect id="reason" kind="bookingReason" value={reason} onChange={setReason} placeholder="Choose a reason" invalid={!!show(errors.reason)} />
              </Field>
              <Field label="Job / account code" htmlFor="job" hint="Up to 20 characters">
                <Input id="job" value={jobCode} maxLength={20} onChange={(ev) => setJobCode(ev.target.value)} placeholder="e.g. JOB-24883" autoComplete="off" />
              </Field>
              <Field label="Destination" htmlFor="destination" className="sm:col-span-2">
                <Input id="destination" value={destination} onChange={(ev) => setDestination(ev.target.value)} placeholder="Where are you taking it?" />
              </Field>
              <Field label="Booking notes" htmlFor="notes" className="sm:col-span-2">
                <Textarea id="notes" value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Anything the fleet team should know" rows={3} />
              </Field>
            </div>
            {reason?.name === 'Maintenance' && (
              <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <NotebookPen className="size-3.5" />A Maintenance booking may use an asset that is in the workshop.
              </p>
            )}
          </Section>

          <Section icon={UserRound} title="Booked for">
            {who.isManager ? (
              <Field label="Requested by" htmlFor="requester" required error={show(errors.requester)} hint="As a fleet manager you can book for someone else.">
                <PersonPicker id="requester" value={requester} onChange={setRequester} invalid={!!show(errors.requester)} />
              </Field>
            ) : (
              <div className="flex items-center gap-3">
                <PersonAvatar name={me?.name ?? ''} size={36} />
                <div>
                  <div className="font-medium">{me?.name}</div>
                  <div className="text-xs text-muted-foreground">You · {(booker?.poolsRel ?? []).map((p) => p.name).join(', ') || 'no pools'}</div>
                </div>
              </div>
            )}
          </Section>

        </Card>
        <div className="grid gap-3 lg:sticky lg:top-20">
          {summary}
          <Button variant="ghost" asChild>
            <Link to="/bookings">Cancel</Link>
          </Button>
        </div>
      </form>
    </Page>
  );
}

function Availability({ asset, loading, problem }: { asset?: AssetValue; loading: boolean; problem: string }) {
  if (!asset) return null;
  if (loading)
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Checking availability…
      </div>
    );
  return (
    <div className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]', problem ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success')} aria-live="polite">
      {problem ? <XCircle className="mt-0.5 size-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />}
      <span className="font-medium">{problem || `${asset.assetId} is free for your times`}</span>
    </div>
  );
}
