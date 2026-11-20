// The overview's panels: the KPI tiles, today's pickups and returns, what needs attention, the
// workshop queue and a compact fleet map.

import {
  ArrowRight,
  CalendarArrowDown,
  CalendarArrowUp,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  FileBadge,
  Hourglass,
  KeyRound,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { MapView, type MapMarker } from '@/components/map-view';
import { Alert, EmptyState, StatusBadge } from '@react-frontends/shared/components';
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Skeleton, Tip } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { addDays, toDate } from '@/domain/logic/time';
import { first, nameOf, type Booking, type WorkshopRequest } from '@/domain/types';
import { STATUS_ORDER } from '@/domain/workflow';
import { formatTime, relative } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { AssetPopup } from '../map/asset-popup';
import { assetMarker, siteAreas, useMapAssets, useSites } from '../map/layers';
import { KPI_LINKS, URGENT, type CountKey, type KpiKey } from './queries';
import type { AttentionItem, AttentionKind } from './stats';

// ------------------------------------------------------------------------------------ KPI tiles

type Tone = 'good' | 'info' | 'warn' | 'bad' | 'accent' | 'neutral';

const TONES: Record<Tone, string> = {
  good: 'var(--success)',
  info: 'var(--info)',
  warn: 'var(--warning)',
  bad: 'var(--danger)',
  accent: 'var(--primary)',
  neutral: 'var(--muted-foreground)',
};

interface TileSpec {
  key: KpiKey;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  /** The tone when the count is zero (good news: nothing overdue). */
  zeroTone?: Tone;
  sub: (c: Partial<Record<CountKey, number>>) => ReactNode;
}

const pct = (part?: number, whole?: number) => (part !== undefined && whole ? Math.round((part / whole) * 100) : undefined);

const TILES: TileSpec[] = [
  { key: 'available', label: 'Available for hire', icon: Truck, tone: 'good', sub: (c) => (c.activeAssets !== undefined ? `of ${c.activeAssets} active assets` : '') },
  { key: 'onHire', label: 'On hire', icon: KeyRound, tone: 'info', sub: (c) => (pct(c.onHire, c.activeAssets) !== undefined ? `${pct(c.onHire, c.activeAssets)}% of the active fleet` : '') },
  { key: 'hireOverdue', label: 'Hire overdue', icon: Hourglass, tone: 'bad', zeroTone: 'good', sub: (c) => (c.hireOverdue ? 'Not back by their booking end' : 'Every hire is back on time') },
  { key: 'unavailable', label: 'Unavailable for hire', icon: Wrench, tone: 'warn', zeroTone: 'good', sub: (c) => (c.unavailable ? 'In the workshop or off hire' : 'The whole fleet can be hired') },
  {
    key: 'serviceDue',
    label: 'Services due',
    icon: CalendarClock,
    tone: 'warn',
    zeroTone: 'good',
    sub: (c) => (c.serviceOverdue ? <span className="font-medium text-danger">{c.serviceOverdue} overdue</span> : c.serviceDue ? 'Due soon, none overdue' : 'Nothing due soon'),
  },
  {
    key: 'regoDue',
    label: 'Rego due in 30 days',
    icon: FileBadge,
    tone: 'warn',
    zeroTone: 'good',
    sub: (c) => (c.regoExpired ? <span className="font-medium text-danger">{c.regoExpired} expired</span> : c.regoDue ? 'None expired' : 'All registrations current'),
  },
  {
    key: 'openRequests',
    label: 'Open workshop requests',
    icon: Wrench,
    tone: 'accent',
    sub: (c) => (c.urgentRequests ? <span className="font-medium text-danger">{c.urgentRequests} urgent: out of service</span> : 'None urgent'),
  },
  { key: 'bookingsToday', label: 'Bookings today', icon: CalendarDays, tone: 'accent', sub: () => 'Going out, coming back or under way' },
];

export function KpiTiles({ counts, loading }: { counts: Partial<Record<CountKey, number>>; loading: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Fleet at a glance">
      {TILES.map((tile) => {
        const value = counts[tile.key];
        const tone = value === 0 && tile.zeroTone ? tile.zeroTone : tile.tone;
        const color = TONES[tone];
        const Icon = value === 0 && tile.zeroTone === 'good' ? CircleCheck : tile.icon;
        return (
          <li key={tile.key}>
            <Link
              to={KPI_LINKS[tile.key]}
              className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-card transition-[box-shadow,border-color,transform] outline-none hover:-translate-y-px hover:border-input hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] leading-tight font-medium text-muted-foreground">{tile.label}</span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color: `color-mix(in oklab, ${color} 88%, var(--foreground))` }}>
                  <Icon className="size-4" strokeWidth={2} />
                </span>
              </div>
              <div className="mt-1 text-3xl font-semibold tracking-tight">{loading || value === undefined ? <Skeleton className="my-1 h-7 w-12" /> : value}</div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                <span className="min-w-0">{loading ? <Skeleton className="h-3 w-24" /> : tile.sub(counts)}</span>
                <ArrowRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------------------------ shared

function PanelHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <CardHeader className="items-center">
      <div className="min-w-0">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
      </div>
      {action}
    </CardHeader>
  );
}

const MoreLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Button variant="ghost" size="sm" asChild className="shrink-0 text-muted-foreground">
    <Link to={to}>
      {children}
      <ChevronRight />
    </Link>
  </Button>
);

const ListSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="grid gap-2 px-2">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 py-1.5">
        <Skeleton className="size-8 rounded-lg" />
        <div className="grid flex-1 gap-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    ))}
  </div>
);

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Couldn't load this.");

// ------------------------------------------------------------------------------------ today

const SHOWN = 5;

function TodayList({ title, icon: Icon, bookings, kind, now, empty }: { title: string; icon: LucideIcon; bookings: Booking[]; kind: 'out' | 'back'; now: number; empty: string }) {
  return (
    <section className="min-w-0">
      <h4 className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {title}
        <span className="font-medium tabular">{bookings.length}</span>
      </h4>
      {!bookings.length ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid grid-cols-1">
          {bookings.slice(0, SHOWN).map((b) => {
            const asset = first(b.assetRel);
            const at = kind === 'out' ? b.startDate : b.endDate;
            const status = nameOf(b.bookingStatusRel);
            const late = kind === 'back' ? status === 'Hire Commenced' && (toDate(b.endDate)?.getTime() ?? Infinity) < now : status === 'Asset Reserved' && (toDate(b.startDate)?.getTime() ?? Infinity) < now - 30 * 60_000;
            return (
              <li key={b.documentId}>
                <Link to={`/bookings/${b.documentId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent focus-visible:bg-accent">
                  <time className="w-[4.5rem] shrink-0 text-sm font-medium tabular" dateTime={String(at ?? '')}>
                    {formatTime(at)}
                  </time>
                  <AssetIcon kind={asset?.iconKind} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      <span className="font-medium">{asset?.assetId ?? 'Asset'}</span>
                      <span className="text-muted-foreground"> · {nameOf(b.requestedByRel) || 'Someone'}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{[b.bookingRef, nameOf(b.bookingReasonRel)].filter(Boolean).join(' · ')}</div>
                  </div>
                  {late ? (
                    <Badge tone="danger" className="shrink-0">
                      {kind === 'back' ? 'Overdue' : 'Not collected'}
                    </Badge>
                  ) : status === 'Hire Commenced' ? (
                    <Badge tone="info" className="shrink-0">
                      {kind === 'out' ? 'Collected' : 'Out'}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
          {bookings.length > SHOWN && (
            <li className="px-2 pt-1 text-xs">
              <Link to={KPI_LINKS.bookingsToday} className="font-medium text-primary hover:underline">
                {bookings.length - SHOWN} more
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export function TodayPanel({ bookings, today, now, loading, error }: { bookings: Booking[]; today: number; now: number; loading: boolean; error: unknown }) {
  const tomorrow = addDays(today, 1);
  const sameDay = (value: unknown) => {
    const t = toDate(value)?.getTime();
    return t !== undefined && t >= today && t < tomorrow;
  };
  const out = bookings.filter((b) => sameDay(b.startDate)).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  const back = bookings.filter((b) => sameDay(b.endDate) && nameOf(b.bookingStatusRel) !== 'Closed').sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
  const returned = bookings.filter((b) => sameDay(b.endDate) && nameOf(b.bookingStatusRel) === 'Closed').length;
  return (
    <Card className="lg:col-span-2">
      <PanelHeader
        title="Today"
        description={loading ? 'Pickups and returns' : `${out.length} going out · ${back.length} due back${returned ? ` · ${returned} returned` : ''}`}
        action={<MoreLink to={KPI_LINKS.bookingsToday}>Bookings</MoreLink>}
      />
      <div className="px-3 pb-4">
        {error ? (
          <Alert className="mx-2">{errorText(error)}</Alert>
        ) : loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ListSkeleton />
            <ListSkeleton />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 md:divide-x md:divide-border">
            <TodayList title="Going out" icon={CalendarArrowUp} bookings={out} kind="out" now={now} empty="Nothing starts today." />
            <div className="md:pl-3">
              <TodayList title="Coming back" icon={CalendarArrowDown} bookings={back} kind="back" now={now} empty={returned ? 'Everything due today is back.' : 'Nothing is due back today.'} />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------ attention

const ATTENTION_ICONS: Record<AttentionKind, LucideIcon> = {
  'hire-overdue': Hourglass,
  'urgent-request': Siren,
  'service-overdue': Wrench,
  rego: FileBadge,
  insurance: ShieldCheck,
};

export function AttentionPanel({ items, loading, error }: { items: AttentionItem[]; loading: boolean; error: unknown }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 6);
  const urgent = items.filter((i) => i.tone === 'danger').length;
  return (
    <Card className="flex flex-col">
      <PanelHeader title="Needs attention" description={loading ? 'Overdue and coming up' : items.length ? `${urgent} overdue or out of service · ${items.length - urgent} coming up` : 'Nothing overdue or due soon'} />
      <div className="flex-1 px-3 pb-4">
        {error ? (
          <Alert className="mx-2">{errorText(error)}</Alert>
        ) : loading ? (
          <ListSkeleton rows={4} />
        ) : !items.length ? (
          <EmptyState icon={CircleCheck} title="All clear" className="py-8">
            No overdue hires, urgent repairs, overdue services, or registrations and insurance due in 30 days.
          </EmptyState>
        ) : (
          <>
            <ul className="grid grid-cols-1">
              {shown.map((item) => {
                const Icon = ATTENTION_ICONS[item.kind];
                const color = item.tone === 'danger' ? 'var(--danger)' : 'var(--warning)';
                return (
                  <li key={item.id}>
                    <Link to={item.to} className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent focus-visible:bg-accent">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color: `color-mix(in oklab, ${color} 85%, var(--foreground))` }}>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{item.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {items.length > 6 && (
              <Button variant="ghost" size="sm" className="mt-1 w-full text-muted-foreground" onClick={() => setAll((a) => !a)} aria-expanded={all}>
                {all ? 'Show fewer' : `Show all ${items.length}`}
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------ workshop queue

const QUEUE = STATUS_ORDER.requestStatus.filter((s) => s !== 'Closed' && s !== 'Cancelled');

export function WorkshopQueue({ requests, total, loading, error, now }: { requests: WorkshopRequest[]; total: number; loading: boolean; error: unknown; now: number }) {
  const statuses = useLookup('requestStatus');
  const colorOf = (name: string) => statuses.data?.find((s) => s.name === name)?.color ?? 'var(--muted-foreground)';
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests) map.set(nameOf(r.requestStatusRel), (map.get(nameOf(r.requestStatusRel)) ?? 0) + 1);
    return map;
  }, [requests]);
  const urgent = requests.filter((r) => nameOf(r.priorityRel) === URGENT).length;
  const next = useMemo(
    () =>
      [...requests]
        .sort((a, b) => {
          const ua = nameOf(a.priorityRel) === URGENT ? 0 : 1;
          const ub = nameOf(b.priorityRel) === URGENT ? 0 : 1;
          const ta = toDate(a.expectedStartDate)?.getTime() ?? Infinity;
          const tb = toDate(b.expectedStartDate)?.getTime() ?? Infinity;
          return ua - ub || ta - tb;
        })
        .slice(0, 4),
    [requests],
  );
  const segments = QUEUE.map((name) => ({ name, count: counts.get(name) ?? 0, color: colorOf(name) }));
  return (
    <Card className="flex flex-col">
      <PanelHeader title="Workshop queue" description={loading ? 'Open requests' : total ? `${total} open · ${urgent} urgent` : 'No open requests'} action={<MoreLink to="/workshop">Workshop</MoreLink>} />
      <div className="flex-1 px-5 pb-5">
        {error ? (
          <Alert>{errorText(error)}</Alert>
        ) : loading ? (
          <>
            <Skeleton className="h-2 w-full rounded-full" />
            <ListSkeleton />
          </>
        ) : !total ? (
          <EmptyState icon={CircleCheck} title="The workshop is clear" className="py-8" />
        ) : (
          <>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segments.filter((s) => s.count).map((s) => `${s.name} ${s.count}`).join(', ')}>
              {segments
                .filter((s) => s.count)
                .map((s) => (
                  <Tip key={s.name} content={`${s.name}: ${s.count}`}>
                    <span className="h-full first:rounded-l-full last:rounded-r-full" style={{ flexGrow: s.count, background: s.color }} />
                  </Tip>
                ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              {segments.map((s) => (
                <li key={s.name} className={cn('flex items-center gap-2', !s.count && 'text-muted-foreground')}>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: s.color, opacity: s.count ? 1 : 0.35 }} aria-hidden />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="font-medium tabular">{s.count}</span>
                </li>
              ))}
            </ul>
            <h4 className="mt-5 mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next up</h4>
            <ul className="-mx-2 grid grid-cols-1">
              {next.map((r) => {
                const asset = first(r.assetRel);
                const start = toDate(r.expectedStartDate)?.getTime();
                return (
                  <li key={r.documentId}>
                    <Link to={`/workshop/requests/${r.documentId}`} className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent focus-visible:bg-accent">
                      <AssetIcon kind={asset?.iconKind} size={30} color={nameOf(r.priorityRel) === URGENT ? 'var(--danger)' : undefined} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate text-sm">
                          <span className="font-medium">{asset?.assetId ?? r.requestRef}</span>
                          <span className="truncate text-muted-foreground">{nameOf(r.requestTypeRel)}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[
                            r.requestRef,
                            nameOf(r.priorityRel) === URGENT ? nameOf(r.requestStatusRel) : '',
                            start !== undefined ? (start < now && nameOf(r.requestStatusRel) === 'Open' ? 'start overdue' : `start ${relative(start, now)}`) : '',
                            nameOf(r.assignedToRel),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      <span className="shrink-0">
                        {nameOf(r.priorityRel) === URGENT ? (
                          <Badge tone="danger">
                            <TriangleAlert />
                            Urgent
                          </Badge>
                        ) : (
                          <StatusBadge value={r.requestStatusRel} />
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------ fleet map

export function FleetMapCard() {
  const assets = useMapAssets();
  const sites = useSites();
  const [selected, setSelected] = useState<string | null>(null);
  const list = useMemo(() => assets.data?.documents ?? [], [assets.data]);
  const markers = useMemo(() => list.map(assetMarker).filter((m): m is MapMarker => !!m), [list]);
  const areas = useMemo(() => siteAreas(sites.data), [sites.data]);
  const byId = useMemo(() => new Map(list.map((a) => [a.documentId, a])), [list]);
  const counts = useMemo(() => {
    const map = new Map<string, { color?: string; count: number }>();
    for (const a of list) {
      const s = first(a.hireStatusRel);
      if (!s) continue;
      map.set(s.name, { color: s.color, count: (map.get(s.name)?.count ?? 0) + 1 });
    }
    return STATUS_ORDER.hireStatus.filter((n) => map.has(n)).map((n) => ({ name: n, ...map.get(n)! }));
  }, [list]);
  return (
    <Card className="flex flex-col overflow-hidden lg:col-span-2">
      <PanelHeader
        title="Fleet map"
        description={
          assets.isPending ? (
            'Last known positions'
          ) : (
            <span className="flex flex-wrap gap-x-3 gap-y-0.5">
              {counts.map((c) => (
                <span key={c.name} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
                  {c.name} <span className="font-medium text-foreground tabular">{c.count}</span>
                </span>
              ))}
            </span>
          )
        }
        action={<MoreLink to="/map">Open map</MoreLink>}
      />
      {assets.error ? (
        <div className="px-5 pb-5">
          <Alert>{errorText(assets.error)}</Alert>
        </div>
      ) : (
        <MapView
          className="min-h-80 flex-1 border-t border-border"
          markers={markers}
          areas={areas}
          selectedId={selected}
          onSelect={setSelected}
          cooperative
          aria-label="Fleet map"
          renderPopup={(m) => {
            const asset = byId.get(m.id);
            return asset ? <AssetPopup asset={asset} onClose={() => setSelected(null)} /> : null;
          }}
        />
      )}
    </Card>
  );
}
