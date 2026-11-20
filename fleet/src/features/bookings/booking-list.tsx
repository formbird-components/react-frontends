// The bookings list: tabs (Upcoming, On hire, Overdue, Past, Cancelled) with counts, "My bookings",
// a search, and bookings under day headings. Rows open the booking in the side sheet.

import { AlertTriangle, CalendarCheck, CalendarPlus, CalendarX2, CheckCircle2, History, KeyRound, Search, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { Alert, EmptyState } from '@react-frontends/shared/components';
import { Button, Card, Input, PersonAvatar, Skeleton, Switch, Tabs, TabsList, TabsTrigger } from '@react-frontends/shared/ui';
import { dayLabel } from '@/domain/logic/time';
import { first, nameOf, type Booking } from '@/domain/types';
import { formatDate, formatTime, relative } from '@react-frontends/shared/format';
import { formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { useBookingList, useTabCount } from './data';
import { groupByDay, groupDateOf, LIST_TABS, type ListScope, type ListTab } from './lists';
import { isOverdue } from './model';
import { BookingStateBadge, requesterName } from './parts';
import { lengthText } from './times';

const PAGE = 40;

const EMPTY: Record<ListTab, { icon: typeof CalendarCheck; title: string; mine: string; text: string }> = {
  upcoming: { icon: CalendarCheck, title: 'No upcoming bookings', mine: 'You have no upcoming bookings', text: 'Book a vehicle or plant from the calendar, or start a new booking.' },
  onHire: { icon: KeyRound, title: 'Nothing is on hire', mine: 'You have nothing on hire', text: 'Hires show here from when they start until they are returned.' },
  overdue: { icon: CheckCircle2, title: 'Every hire is back on time', mine: 'None of your hires is overdue', text: 'Hires still out past their end show here.' },
  past: { icon: History, title: 'No past bookings', mine: 'You have no past bookings', text: 'Returned hires, and reservations that never started, show here.' },
  cancelled: { icon: CalendarX2, title: 'No cancelled bookings', mine: 'You have no cancelled bookings', text: '' },
};

function TabCount({ tab, scope, active }: { tab: ListTab; scope: ListScope; active: boolean }) {
  const count = useTabCount(tab, scope);
  if (count === undefined) return <span className="h-4 w-5 animate-pulse rounded-full bg-muted" />;
  return (
    <span
      className={cn(
        'min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular',
        tab === 'overdue' && count > 0 ? 'bg-danger text-white' : active ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {count}
    </span>
  );
}

export function BookingList({
  tab,
  onTab,
  mine,
  onMine,
  scope,
  now,
  openId,
  onOpen,
  filtered,
}: {
  tab: ListTab;
  onTab: (tab: ListTab) => void;
  mine: boolean;
  onMine: (mine: boolean) => void;
  /** Person and assets (from the calendar's filters); the text is the list's own. */
  scope: ListScope;
  now: number;
  openId?: string;
  onOpen: (id: string) => void;
  /** The calendar's asset filters narrow the list. */
  filtered: boolean;
}) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [size, setSize] = useState(PAGE);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => setSize(PAGE), [tab, query, mine]);
  const fullScope = useMemo(() => ({ ...scope, text: query }), [scope, query]);
  const list = useBookingList(tab, fullScope, size);
  const bookings = list.data?.documents ?? [];
  const groups = groupByDay(bookings, groupDateOf(tab));
  const empty = EMPTY[tab];

  return (
    <Card className="overflow-hidden">
      <Tabs value={tab} onValueChange={(v) => onTab(v as ListTab)}>
        <div className="flex flex-col gap-3 border-b border-border px-4 pt-3 sm:px-5 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
          <TabsList className="-mb-px border-b-0">
            {LIST_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-2.5">
                {t.value === 'overdue' && <AlertTriangle className={cn('size-3.5!', tab === 'overdue' ? 'text-danger' : '')} />}
                {t.label}
                <TabCount tab={t.value} scope={fullScope} active={tab === t.value} />
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-3 pb-3">
            <label className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <span className="sr-only">Search bookings</span>
              <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Booking, asset, person, job…" className="h-8 pl-8 text-[13px]" />
            </label>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] font-medium whitespace-nowrap">
              <Switch checked={mine} onCheckedChange={onMine} aria-label="Only my bookings" />
              My bookings
            </label>
          </div>
        </div>
      </Tabs>

      {list.error ? (
        <div className="p-5">
          <Alert>
            {(list.error as Error).message}{' '}
            <button type="button" className="cursor-pointer font-medium underline" onClick={() => void list.refetch()}>
              Try again
            </button>
          </Alert>
        </div>
      ) : list.isLoading ? (
        <ListSkeleton />
      ) : !bookings.length ? (
        query || filtered ? (
          <EmptyState icon={SearchX} title="No bookings match">
            {query ? `Nothing in ${LIST_TABS.find((t) => t.value === tab)?.label} matches “${query}”.` : 'No bookings of the assets the filters show.'}
          </EmptyState>
        ) : (
          <EmptyState
            icon={empty.icon}
            title={mine ? empty.mine : empty.title}
            action={
              tab === 'upcoming' ? (
                <Button asChild size="sm">
                  <Link to="/bookings/new">
                    <CalendarPlus />
                    New booking
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {empty.text}
          </EmptyState>
        )
      ) : (
        <div className={cn('transition-opacity', list.isPlaceholderData && 'opacity-60')} aria-busy={list.isFetching}>
          <div className="hidden grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_8.5rem_5.5rem] gap-4 border-b border-border bg-muted/40 px-5 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Booking</span>
            <span>Asset</span>
            <span>{tab === 'onHire' || tab === 'overdue' ? 'Due back' : 'When'}</span>
            <span>Requested by</span>
            <span>Status</span>
            <span className="text-right">Cost</span>
          </div>
          {groups.map((group) => (
            <section key={group.key} aria-label={dayLabel(group.key, now)}>
              <h3 className="sticky top-14 z-10 border-b border-border bg-card/95 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-sm sm:px-5">
                {dayLabel(group.key, now)}
                {['Today', 'Tomorrow', 'Yesterday'].includes(dayLabel(group.key, now)) && <span className="ml-2 font-normal">{formatDate(group.key)}</span>}
              </h3>
              <ul>
                {group.items.map((booking) => (
                  <ListRow key={booking.documentId} booking={booking} tab={tab} now={now} open={booking.documentId === openId} onOpen={onOpen} myId={scope.personId ?? ''} />
                ))}
              </ul>
            </section>
          ))}
          {list.data && list.data.total > bookings.length && (
            <div className="flex items-center justify-center gap-3 border-t border-border p-4 text-sm text-muted-foreground">
              Showing {bookings.length} of {list.data.total}
              <Button variant="outline" size="sm" onClick={() => setSize((s) => s + PAGE)} disabled={list.isFetching}>
                Show more
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ListRow({ booking, tab, now, open, onOpen, myId }: { booking: Booking; tab: ListTab; now: number; open: boolean; onOpen: (id: string) => void; myId: string }) {
  const asset = first(booking.assetRel);
  const person = first(booking.requestedByRel);
  const start = new Date(booking.startDate ?? '').getTime();
  const end = new Date(booking.endDate ?? '').getTime();
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  const overdue = isOverdue(booking, now);
  const model = asset?.name.split(' · ')[1] ?? '';
  const when =
    tab === 'onHire' || tab === 'overdue' ? (
      <>
        <span className={cn('font-medium tabular', overdue && 'text-danger')}>{formatTime(end)}</span>
        <span className={cn('text-muted-foreground', overdue && 'font-medium text-danger')}> · {overdue ? `${relative(end, now).replace(' ago', '')} late` : relative(end, now)}</span>
      </>
    ) : (
      <>
        <span className="font-medium tabular">
          {formatTime(start)} – {sameDay ? formatTime(end) : `${dayLabel(end, now)} ${formatTime(end)}`}
        </span>
        <span className="text-muted-foreground"> · {lengthText(end - start)}</span>
      </>
    );
  const cost = nameOf(booking.bookingStatusRel) === 'Cancelled' ? undefined : booking.hireCost;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(booking.documentId)}
        className={cn(
          'grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-border/70 px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:outline-none sm:px-5',
          'md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_8.5rem_5.5rem] md:gap-4 md:py-2.5',
          open && 'bg-primary-soft/50 hover:bg-primary-soft/60',
          overdue && 'shadow-[inset_3px_0_0_var(--danger)]',
        )}
      >
        {/* Mobile: icon · text · badge */}
        <span className="row-span-3 self-start md:hidden">
          <AssetIcon kind={asset?.iconKind} color={first(booking.bookingStatusRel)?.color} size={36} />
        </span>
        <span className="min-w-0 md:block">
          <span className="font-semibold">{booking.bookingRef}</span>
          <span className="text-muted-foreground md:hidden"> · {asset?.assetId}</span>
          <span className="hidden truncate text-xs text-muted-foreground md:block">{nameOf(booking.bookingReasonRel) || '–'}</span>
        </span>
        <span className="justify-self-end md:hidden">
          <BookingStateBadge booking={booking} now={now} />
        </span>
        <span className="col-span-2 min-w-0 truncate text-[13px] md:hidden">{when}</span>
        <span className="col-span-2 truncate text-xs text-muted-foreground md:hidden">
          {requesterName(booking, myId)}
          {nameOf(booking.bookingReasonRel) && ` · ${nameOf(booking.bookingReasonRel)}`}
        </span>
        {/* Wide: columns */}
        <span className="hidden min-w-0 items-center gap-2.5 md:flex">
          <AssetIcon kind={asset?.iconKind} size={28} />
          <span className="min-w-0">
            <span className="block font-medium">{asset?.assetId}</span>
            <span className="block truncate text-xs text-muted-foreground">{model}</span>
          </span>
        </span>
        <span className="hidden min-w-0 truncate md:block">{when}</span>
        <span className="hidden min-w-0 items-center gap-2 md:flex">
          {person && <PersonAvatar name={person.name} size={22} />}
          <span className="truncate">{requesterName(booking, myId)}</span>
        </span>
        <span className="hidden md:block">
          <BookingStateBadge booking={booking} now={now} />
        </span>
        <span className="hidden text-right tabular md:block">{cost !== undefined && cost !== null ? formatMoney(cost) : <span className="text-muted-foreground">–</span>}</span>
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="grid">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border/70 px-5 py-3.5">
          <Skeleton className="size-8 rounded-lg" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-5 w-24 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}
