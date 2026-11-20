// A booking: its state and progress, when, what for, the hire (meters, distance, duration, cost),
// the asset, who booked it, its activity, and the actions the person may take. Shown on its own
// page (/bookings/:id) and in the side sheet on the bookings page.

import { ArrowLeft, ArrowRight, CalendarPlus, ChevronRight, Clock, ExternalLink, Flag, Info, KeyRound, Mail, MessageSquare, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { Alert, EmptyState, Page, StatusBadge } from '@react-frontends/shared/components';
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, PersonAvatar, SheetContent, Skeleton, Tip } from '@react-frontends/shared/ui';
import { useRecord } from '@/data/records';
import { useSession } from '@/data/session';
import { first, nameOf, type Asset, type Booking, type Ref } from '@/domain/types';
import { ApiError } from '@react-frontends/shared/api';
import { formatDateTime, hours, relative } from '@react-frontends/shared/format';
import { formatMeter, formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { ACTION_ICONS, ACTION_LABELS, ActionDialog } from './booking-actions';
import { useNow } from './hooks';
import { isOverdue } from './model';
import { BookingStateBadge, Fact, StatusStepper } from './parts';
import { estimateCost, lengthText, ratesText } from './times';
import { actionsFor, type BookingAction } from './workflow';

const dateParts = (value: unknown) => {
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? { day: '–', time: '' } : { day: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) };
};

/** The actions a person may take, as buttons (the main one filled). */
export function BookingActionsBar({ booking, size = 'md', className }: { booking: Booking; size?: 'sm' | 'md'; className?: string }) {
  const { who } = useSession();
  const [action, setAction] = useState<BookingAction | null>(null);
  const { actions } = actionsFor(booking, who);
  if (!actions.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {[...actions].reverse().map((a) => {
        const Icon = ACTION_ICONS[a];
        const main = a === 'start' || a === 'return';
        return (
          <Button key={a} size={size} variant={main ? 'default' : 'outline'} className={cn(a === 'cancel' && 'text-danger hover:text-danger', main && 'order-last')} onClick={() => setAction(a)}>
            <Icon />
            {ACTION_LABELS[a]}
          </Button>
        );
      })}
      <ActionDialog action={action} booking={booking} onClose={() => setAction(null)} />
    </div>
  );
}

/** What needs saying above the details: overdue, a reservation never started, a moved start, no access. */
function Notices({ booking, now }: { booking: Booking; now: number }) {
  const { who } = useSession();
  const status = nameOf(booking.bookingStatusRel);
  const person = first(booking.requestedByRel);
  const mine = person?.documentId === who.userId;
  const assetId = first(booking.assetRel)?.assetId ?? 'The asset';
  const { note, canAct } = actionsFor(booking, who);
  const out: ReactNode[] = [];
  if (isOverdue(booking, now))
    out.push(
      <Alert key="overdue">
        <span className="font-semibold">Hire Overdue.</span> {assetId} was due back {formatDateTime(booking.endDate)} ({relative(booking.endDate, now)}).{' '}
        {mine ? 'Return it as soon as you can: it blocks the next bookings until it is back.' : `It blocks new bookings until ${person?.name ?? 'the driver'} returns it.`}
      </Alert>,
    );
  if (status === 'Asset Reserved' && new Date(booking.endDate ?? '').getTime() < now)
    out.push(
      <Alert key="stale" tone="warning">
        The booked time has passed and the hire never started. {canAct ? 'Start it now if the asset went out, or cancel the booking.' : ''}
      </Alert>,
    );
  if (booking.startAdjustedBool)
    out.push(
      <Alert key="adjusted" tone="info">
        The start was in the past when this was booked, so it starts when it was saved.
      </Alert>,
    );
  if (note && !canAct)
    out.push(
      <div key="note" className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        {note}
      </div>,
    );
  return out.length ? <div className="grid gap-2">{out}</div> : null;
}

function WhenCard({ booking, now }: { booking: Booking; now: number }) {
  const start = dateParts(booking.startDate);
  const end = dateParts(booking.endDate);
  const length = lengthText(new Date(booking.endDate ?? '').getTime() - new Date(booking.startDate ?? '').getTime());
  const s = new Date(booking.startDate ?? '').getTime();
  const status = nameOf(booking.bookingStatusRel);
  const lead = status === 'Asset Reserved' && s > now ? `Starts ${relative(s, now)}` : status === 'Hire Commenced' && !isOverdue(booking, now) ? `Due back ${relative(booking.endDate, now)}` : '';
  return (
    <Card>
      <CardHeader>
        <CardTitle>When</CardTitle>
        {lead && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock className="size-3.5" />
            {lead}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-stretch gap-3">
          <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3.5 py-3">
            <div className="text-xs font-medium text-muted-foreground">Starts</div>
            <div className="mt-1 font-semibold">{start.day}</div>
            <div className="text-lg font-semibold tracking-tight tabular">{start.time}</div>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
            <ArrowRight className="size-4" />
            <span className="whitespace-nowrap tabular">{length}</span>
          </div>
          <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3.5 py-3">
            <div className="text-xs font-medium text-muted-foreground">Ends</div>
            <div className="mt-1 font-semibold">{end.day}</div>
            <div className={cn('text-lg font-semibold tracking-tight tabular', isOverdue(booking, now) && 'text-danger')}>{end.time}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailsCard({ booking }: { booking: Booking }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Reason">{nameOf(booking.bookingReasonRel)}</Fact>
          <Fact label="Job / account code">{booking.jobCode}</Fact>
          <Fact label="Destination" className="sm:col-span-2">
            {booking.destination}
          </Fact>
          <Fact label="Notes" className="sm:col-span-2">
            {booking.bookingNotes && <span className="whitespace-pre-wrap">{booking.bookingNotes}</span>}
          </Fact>
          {nameOf(booking.bookingStatusRel) === 'Cancelled' && <Fact label="Reason for cancellation">{nameOf(booking.cancelReasonRel)}</Fact>}
        </dl>
      </CardContent>
    </Card>
  );
}

function HireCard({ booking, now }: { booking: Booking; now: number }) {
  const asset = first(booking.assetRel);
  const unit = asset?.primaryMeterUnit ?? 'km';
  const status = nameOf(booking.bookingStatusRel);
  const overdue = isOverdue(booking, now);
  const soFar = overdue ? estimateCost(asset, booking.startDate, booking.endDate, new Date(now).toISOString()) : undefined;
  const saved = booking.hireCost !== undefined && booking.hireCost !== null;
  const cost = saved ? Number(booking.hireCost) : estimateCost(asset, booking.startDate, booking.endDate);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hire</CardTitle>
        {ratesText(asset ?? undefined) && <span className="text-xs text-muted-foreground">{ratesText(asset ?? undefined)}, weekends free</span>}
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Metric label="Hire cost" value={cost !== undefined ? formatMoney(status === 'Cancelled' ? 0 : cost) : '–'} note={status === 'Cancelled' ? 'No charge' : saved ? (status === 'Closed' ? 'Final' : 'As booked') : 'Estimated'} />
          <Metric label="Duration" value={booking.hireDurationHours !== undefined && booking.hireDurationHours !== null ? hours(booking.hireDurationHours) : lengthText(new Date(booking.endDate ?? '').getTime() - new Date(booking.startDate ?? '').getTime()) || '–'} />
          <Metric label={unit === 'hours' ? 'Used' : 'Distance'} value={booking.distanceNum !== undefined && booking.distanceNum !== null ? formatMeter(booking.distanceNum, unit) : '–'} />
        </div>
        {overdue && soFar !== undefined && (
          <p className="text-[13px] text-danger">
            Still out: about <span className="font-semibold tabular">{formatMoney(soFar)}</span> if returned now.
          </p>
        )}
        {(status === 'Hire Commenced' || status === 'Closed') && (
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Meter at start">{formatMeter(booking.startMeterNum, unit)}</Fact>
            <Fact label="Meter at end">{formatMeter(booking.endMeterNum, unit)}</Fact>
            <Fact label="Hire started">{formatDateTime(booking.commencedDate)}</Fact>
            <Fact label="Returned">{formatDateTime(booking.closedDate)}</Fact>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight tabular">{value}</div>
      {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

function AssetCard({ booking }: { booking: Booking }) {
  const value = first(booking.assetRel);
  const asset = useRecord<Asset>(value?.documentId);
  if (!value) return null;
  const model = value.name.split(' · ').slice(1, 2).join('') || asset.data?.makeModel;
  const live = asset.data;
  return (
    <Card className="overflow-hidden">
      <Link to={`/assets/${value.documentId}`} className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-accent/50">
        <AssetIcon kind={value.iconKind} color={first(live?.hireStatusRel)?.color} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold">
            {value.assetId}
            {value.registration && <span className="rounded border border-border px-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{value.registration}</span>}
          </div>
          <div className="truncate text-sm text-muted-foreground">{model}</div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
      <dl className="grid grid-cols-2 gap-3 border-t border-border px-5 py-4">
        <Fact label="Hire status">{live ? <StatusBadge value={live.hireStatusRel} /> : <Skeleton className="h-5 w-24" />}</Fact>
        <Fact label="Location">{live ? nameOf(live.locationRel) : <Skeleton className="h-5 w-28" />}</Fact>
        <Fact label="Meter">{live ? formatMeter(live.meterReadingNum, live.primaryMeterUnit) : <Skeleton className="h-5 w-20" />}</Fact>
        <Fact label="Longest booking">{value.maxBookingHours ? `${value.maxBookingHours} h` : '72 h'}</Fact>
      </dl>
    </Card>
  );
}

function PeopleCard({ booking }: { booking: Booking }) {
  const person = first(booking.requestedByRel);
  const createdBy = first(booking.createdByRel as Ref[] | undefined);
  const created = (booking.createdDate as string | undefined) ?? booking.systemHeader?.createdDate;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Requested by</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {person ? (
          <div className="flex items-center gap-3">
            <PersonAvatar name={person.name} size={36} />
            <div className="min-w-0">
              <div className="font-medium">{person.name}</div>
              {person.email && (
                <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                  <Mail className="size-3" />
                  {person.email}
                </a>
              )}
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">–</span>
        )}
        {created && (
          <p className="text-xs text-muted-foreground">
            Booked {createdBy && createdBy.documentId !== person?.documentId ? `by ${createdBy.name} ` : ''}
            {relative(created)} · {formatDateTime(created)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface Note {
  dataId?: string;
  detail?: string;
  createdBy?: Ref;
  createdDate?: string;
}

function ActivityCard({ booking }: { booking: Booking }) {
  const asset = first(booking.assetRel);
  const unit = asset?.primaryMeterUnit ?? 'km';
  const created = (booking.createdDate as string | undefined) ?? booking.systemHeader?.createdDate;
  const status = nameOf(booking.bookingStatusRel);
  const updatedBy = first(booking.updatedByRel as Ref[] | undefined);
  const events: { at?: string; icon: typeof Clock; tone?: string; title: ReactNode; by?: string; body?: string }[] = [
    { at: created, icon: CalendarPlus, title: 'Booked', by: first(booking.createdByRel as Ref[] | undefined)?.name ?? first(booking.requestedByRel)?.name },
  ];
  if (booking.commencedDate) events.push({ at: booking.commencedDate, icon: KeyRound, title: `Hire started at ${formatMeter(booking.startMeterNum, unit) || 'the start meter'}` });
  if (booking.closedDate) events.push({ at: booking.closedDate, icon: Flag, title: `Returned at ${formatMeter(booking.endMeterNum, unit)}${booking.distanceNum !== undefined && booking.distanceNum !== null ? ` · ${formatMeter(booking.distanceNum, unit)} ${unit === 'hours' ? 'of use' : 'driven'}` : ''}` });
  if (status === 'Cancelled') events.push({ at: booking.updatedDate as string | undefined, icon: XCircle, tone: 'text-danger', title: `Cancelled${nameOf(booking.cancelReasonRel) ? `: ${nameOf(booking.cancelReasonRel)}` : ''}`, by: updatedBy?.name });
  for (const note of (booking.notesCommentsArr as Note[] | undefined) ?? []) events.push({ at: note.createdDate, icon: MessageSquare, title: 'Note', by: note.createdBy?.name, body: note.detail });
  events.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
          {events.map((event, i) => (
            <li key={i} className="relative flex gap-3">
              <span className={cn('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground', event.tone)}>
                <event.icon className="size-3.5" />
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="text-sm font-medium">{event.title}</div>
                <div className="text-xs text-muted-foreground">
                  {[event.by, event.at ? formatDateTime(event.at) : ''].filter(Boolean).join(' · ')}
                </div>
                {event.body && <p className="mt-1.5 rounded-lg bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap">{event.body.replace(/\*\*(.+?)\*\*/g, '$1')}</p>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** The body of a booking, laid out for its page (two columns) or a side sheet (one). */
export function BookingDetail({ booking, layout }: { booking: Booking; layout: 'page' | 'sheet' }) {
  const now = useNow();
  if (layout === 'sheet')
    return (
      <div className="grid gap-4 p-5 sm:p-6">
        <BookingActionsBar booking={booking} size="sm" className="justify-end" />
        <Notices booking={booking} now={now} />
        <Card className="px-4 py-5">
          <StatusStepper booking={booking} now={now} />
        </Card>
        <WhenCard booking={booking} now={now} />
        <AssetCard booking={booking} />
        <HireCard booking={booking} now={now} />
        <DetailsCard booking={booking} />
        <PeopleCard booking={booking} />
        <ActivityCard booking={booking} />
      </div>
    );
  return (
    <div className="grid gap-5">
      <Notices booking={booking} now={now} />
      <Card className="px-4 py-5 sm:px-8">
        <StatusStepper booking={booking} now={now} className="mx-auto max-w-2xl" />
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-5">
          <WhenCard booking={booking} now={now} />
          <HireCard booking={booking} now={now} />
          <DetailsCard booking={booking} />
        </div>
        <div className="grid gap-5">
          <AssetCard booking={booking} />
          <PeopleCard booking={booking} />
          <ActivityCard booking={booking} />
        </div>
      </div>
    </div>
  );
}

const notFound = (error: unknown) => error instanceof ApiError && [400, 404].includes(error.status);

function DetailSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

/** /bookings/:id */
export function BookingPage() {
  const { id } = useParams();
  const record = useRecord<Booking>(id);
  const now = useNow();
  const booking = record.data;
  const asset = first(booking?.assetRel);
  return (
    <Page>
      <Link to="/bookings" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Bookings
      </Link>
      {record.isLoading ? (
        <>
          <div className="flex items-center gap-4 pb-6">
            <Skeleton className="size-12 rounded-xl" />
            <div className="grid gap-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <DetailSkeleton />
        </>
      ) : record.error || !booking ? (
        notFound(record.error) ? (
          <EmptyState title="Booking not found" action={<Button asChild variant="outline"><Link to="/bookings">All bookings</Link></Button>}>
            It may have been removed, or the link is wrong.
          </EmptyState>
        ) : (
          <Alert>
            {(record.error as Error)?.message ?? 'The booking could not be loaded.'}{' '}
            <button type="button" className="cursor-pointer font-medium underline" onClick={() => void record.refetch()}>
              Try again
            </button>
          </Alert>
        )
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
            <div className="flex min-w-0 items-center gap-4">
              <AssetIcon kind={asset?.iconKind} color={first(booking.bookingStatusRel)?.color} size={52} className="rounded-xl" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-semibold tracking-tight">{booking.bookingRef ?? 'Booking'}</h1>
                  <BookingStateBadge booking={booking} now={now} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {asset?.name ?? 'No asset'}
                  {first(booking.requestedByRel) && <> · for {first(booking.requestedByRel)?.name}</>}
                </p>
              </div>
            </div>
            <BookingActionsBar booking={booking} />
          </header>
          <BookingDetail booking={booking} layout="page" />
        </>
      )}
    </Page>
  );
}

/** The side sheet on the bookings page (?booking=<id>). */
export function BookingSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const record = useRecord<Booking>(id ?? undefined);
  const now = useNow();
  const booking = record.data;
  const asset = first(booking?.assetRel);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={booking?.bookingRef ?? (record.isLoading ? 'Loading…' : 'Booking')}
        description={booking ? `${asset?.name ?? ''}${first(booking.requestedByRel) ? ` · for ${first(booking.requestedByRel)?.name}` : ''}` : undefined}
        actions={
          id ? (
            <div className="flex items-center gap-1.5">
              {booking && <BookingStateBadge booking={booking} now={now} className="mt-1" />}
              <Tip content="Open the booking page">
                <Button asChild variant="ghost" size="icon-sm" aria-label="Open the booking page">
                  <Link to={`/bookings/${id}`}>
                    <ExternalLink />
                  </Link>
                </Button>
              </Tip>
            </div>
          ) : undefined
        }
      >
        {record.isLoading ? (
          <div className="grid gap-4 p-6">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : record.error || !booking ? (
          <div className="p-6">
            <Alert>
              {notFound(record.error) ? 'This booking no longer exists.' : ((record.error as Error)?.message ?? 'The booking could not be loaded.')}
            </Alert>
          </div>
        ) : (
          <BookingDetail booking={booking} layout="sheet" />
        )}
      </SheetContent>
    </Dialog>
  );
}

