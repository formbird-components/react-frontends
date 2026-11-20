// The booking calendar's timeline (wide screens): assets as rows grouped by location, time across,
// bookings as bars in their status colour, workshop block-outs hatched, Hire Overdue in red, a now
// line. Drag across free time (or click it) to choose a period; click a bar to open it.

import { AlertTriangle, ChevronDown, MapPin, Plus, Wrench } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { Button, PersonAvatar, Popover, PopoverAnchor, PopoverContent, Skeleton, Tip } from '@react-frontends/shared/ui';
import { assignLanes, axisTicks, xOf, type CalendarView, type TimeWindow } from '@/domain/logic/calendar';
import { addDays, dayLabel, HOUR, roundUp, startOfDay } from '@/domain/logic/time';
import { formatTime } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { checkPeriod } from './availability';
import { inWindow, type Item, type Row, type RowGroup } from './model';
import { barClass, ItemTip, itemTone, OVERDUE_STRIPES, timesText } from './parts';
import { SelectionCard } from './selection-card';
import { clickRange, dayScrollTarget, dragRange, lengthText, SLOT_MINUTES } from './times';

const LABEL_W = 244;
const LANE_H = 30;
const ROW_PAD = 7;
/** Least room per hour: day views scroll, weeks mostly fit. */
const MIN_PX_PER_HOUR: Record<CalendarView, number> = { day: 60, week: 5 };

export interface Selection {
  rowId: string;
  start: number;
  end: number;
}

export interface TimelineProps {
  view: CalendarView;
  window: TimeWindow;
  now: number;
  groups: RowGroup[];
  itemsByAsset: Map<string, Item[]>;
  /** Rows are still loading (skeleton). */
  loading: boolean;
  /** Bars are loading (a thin bar on top). */
  refreshing: boolean;
  /** The booking open in the side sheet. */
  openId?: string;
  myId: string;
  onOpen: (item: Item) => void;
  onBook: (row: Row, start: number, end: number) => void;
  className?: string;
}

export function Timeline({ view, window, now, groups, itemsByAsset, loading, refreshing, openId, myId, onOpen, onBook, className }: TimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hours = (window.end - window.start) / HOUR;
  const pxPerHour = Math.max(MIN_PX_PER_HOUR[view], width ? (width - LABEL_W) / hours : 0);
  const trackW = Math.round(pxPerHour * hours);
  const x = useCallback((t: number) => xOf(t, window, pxPerHour), [window, pxPerHour]);

  // Scroll to the working day (day view) or to today (week view) when the period changes.
  const scrolledFor = useRef('');
  useLayoutEffect(() => {
    const el = scroller.current;
    const key = `${view}:${window.start}:${Math.round(pxPerHour)}`;
    if (!el || !width || scrolledFor.current === key) return;
    scrolledFor.current = key;
    const visible = el.clientWidth - LABEL_W;
    if (view === 'day') el.scrollLeft = x(dayScrollTarget(window.start, now)) - 8;
    else el.scrollLeft = now > window.start && now < window.end ? Math.max(0, x(now) - visible / 3) : 0;
  }, [view, window.start, width, pxPerHour, now, x]);

  // A new period clears a chosen one.
  useEffect(() => setSelection(null), [view, window.start]);

  // A chosen period (from the + button, say) scrolls into view beside the asset column.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !selection) return;
    const visible = el.clientWidth - LABEL_W;
    const from = x(selection.start);
    const to = x(selection.end);
    if (from < el.scrollLeft + 8 || to > el.scrollLeft + visible - 8) el.scrollLeft = Math.max(0, from - Math.max(24, (visible - (to - from)) / 3));
  }, [selection, x]);

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const select = useCallback((rowId: string, start: number, end: number) => setSelection({ rowId, start, end }), []);
  const clear = useCallback(() => setSelection(null), []);
  const quickBook = useCallback(
    (row: Row) => {
      const inView = now >= window.start && now < window.end;
      // From the next half hour; in the small hours, or on another day, from 9 am.
      const nine = startOfDay(inView ? now : window.start) + 9 * HOUR;
      const start = inView && now - startOfDay(now) >= 7 * HOUR ? roundUp(now, SLOT_MINUTES) : nine;
      const range = clickRange(start, window, (itemsByAsset.get(row.documentId) ?? []).filter((i) => i.active && i.start > start).sort((a, b) => a.start - b.start)[0]?.start);
      setSelection({ rowId: row.documentId, ...range });
    },
    [now, window, itemsByAsset],
  );

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const nowInView = now >= window.start && now < window.end;

  return (
    <div className={cn('relative', className)}>
      {refreshing && <div className="absolute inset-x-0 top-0 z-40 h-0.5 animate-pulse bg-primary" aria-hidden />}
      <div ref={scroller} className="relative max-h-[max(26rem,calc(100dvh-17.5rem))] overflow-auto overscroll-contain" role="region" aria-label="Booking calendar" tabIndex={-1}>
        <div className="relative min-w-full" style={{ width: LABEL_W + trackW }}>
          {/* Time axis */}
          <div className="sticky top-0 z-30 flex h-10 border-b border-border bg-card/95 backdrop-blur-sm">
            <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card px-4 text-xs font-medium text-muted-foreground" style={{ width: LABEL_W }}>
              {loading ? 'Loading assets…' : `${total} ${total === 1 ? 'asset' : 'assets'}`}
            </div>
            <div className="relative" style={{ width: trackW }}>
              {view === 'day'
                ? axisTicks(window, 1).map((tick, i) => (
                    <span key={tick} className={cn('absolute top-0 flex h-full items-center pl-1.5 text-[11px] whitespace-nowrap text-muted-foreground tabular', i === 0 && 'hidden')} style={{ left: x(tick) }}>
                      {formatTime(tick).replace(':00', '')}
                    </span>
                  ))
                : Array.from({ length: 7 }, (_, d) => addDays(window.start, d)).map((day) => {
                    const today = startOfDay(now) === day;
                    const weekend = [0, 6].includes(new Date(day).getDay());
                    return (
                      <span key={day} className="absolute top-0 flex h-full items-center justify-center text-xs" style={{ left: x(day), width: x(addDays(day, 1)) - x(day) }}>
                        <span className={cn('rounded-full px-2 py-0.5 font-medium', today ? 'bg-primary text-primary-foreground' : weekend ? 'text-muted-foreground/70' : 'text-muted-foreground')}>
                          {new Date(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                        </span>
                      </span>
                    );
                  })}
              {nowInView && (
                <span className="absolute bottom-0 z-10 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground tabular shadow-sm" style={{ left: x(now) }}>
                  {formatTime(now)}
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="relative">
            <Columns view={view} window={window} now={now} x={x} trackW={trackW} pxPerHour={pxPerHour} />
            {loading
              ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} trackW={trackW} seed={i} />)
              : groups.map((group) => {
                  const open = !collapsed.has(group.key);
                  return (
                    <div key={group.key} role="group" aria-label={group.location}>
                      <div className="relative h-8 border-b border-border">
                        <div className="absolute inset-0 bg-muted/85" />
                        <button
                          type="button"
                          onClick={() => toggle(group.key)}
                          aria-expanded={open}
                          className="sticky left-0 z-20 flex h-full cursor-pointer items-center gap-2 px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
                        >
                          <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
                          <MapPin className="size-3.5" />
                          {group.location}
                          <span className="rounded-full bg-card px-1.5 py-px text-[11px] font-medium tracking-normal normal-case ring-1 ring-border">{group.rows.length}</span>
                        </button>
                      </div>
                      {open &&
                        group.rows.map((row) => (
                          <TimelineRow
                            key={row.documentId}
                            row={row}
                            items={itemsByAsset.get(row.documentId)}
                            view={view}
                            window={window}
                            pxPerHour={pxPerHour}
                            trackW={trackW}
                            now={now}
                            selection={selection?.rowId === row.documentId ? selection : undefined}
                            openId={openId}
                            myId={myId}
                            onOpen={onOpen}
                            onSelect={select}
                            onClear={clear}
                            onQuickBook={quickBook}
                            onBook={onBook}
                          />
                        ))}
                    </div>
                  );
                })}
            {nowInView && !loading && <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-[15] w-0.5 -translate-x-1/2 bg-primary/80" style={{ left: LABEL_W + x(now) }} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Behind the rows: hour or day lines, nights and weekends shaded, the past greyed. */
function Columns({ view, window, now, x, trackW, pxPerHour }: { view: CalendarView; window: TimeWindow; now: number; x: (t: number) => number; trackW: number; pxPerHour: number }) {
  const days = view === 'day' ? [window.start] : Array.from({ length: 7 }, (_, d) => addDays(window.start, d));
  const lines =
    view === 'day'
      ? { backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px)', backgroundSize: `${pxPerHour}px 100%` }
      : {
          backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to right, color-mix(in oklab, var(--border) 45%, transparent) 1px, transparent 1px)',
          backgroundSize: `${pxPerHour * 24}px 100%, ${pxPerHour * 6}px 100%`,
        };
  return (
    <div aria-hidden className="pointer-events-none absolute top-0 bottom-0" style={{ left: LABEL_W, width: trackW, ...lines }}>
      {days.map((day) => {
        const weekend = [0, 6].includes(new Date(day).getDay());
        return (
          <div key={day}>
            {/* Night: before 7 am and from 7 pm. */}
            <div className="absolute inset-y-0 bg-muted/40" style={{ left: x(day), width: x(day + 7 * HOUR) - x(day) }} />
            <div className="absolute inset-y-0 bg-muted/40" style={{ left: x(day + 19 * HOUR), width: x(addDays(day, 1)) - x(day + 19 * HOUR) }} />
            {view === 'week' && weekend && <div className="absolute inset-y-0 bg-muted/45" style={{ left: x(day), width: x(addDays(day, 1)) - x(day) }} />}
            {view === 'week' && startOfDay(now) === day && <div className="absolute inset-y-0 bg-primary/[0.04]" style={{ left: x(day), width: x(addDays(day, 1)) - x(day) }} />}
          </div>
        );
      })}
      {now > window.start && <div className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,transparent_0_7px,color-mix(in_oklab,var(--muted-foreground)_7%,transparent)_7px_8px)]" style={{ width: x(now) }} />}
    </div>
  );
}

function SkeletonRow({ trackW, seed }: { trackW: number; seed: number }) {
  return (
    <div className="relative flex h-11 border-b border-border/70">
      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2.5 border-r border-border bg-card px-3" style={{ width: LABEL_W }}>
        <Skeleton className="size-[30px] rounded-lg" />
        <div className="grid flex-1 gap-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <div className="relative" style={{ width: trackW }}>
        <Skeleton className="absolute top-2 h-7 rounded-md" style={{ left: `${(seed * 17) % 60 + 8}%`, width: `${(seed * 7) % 10 + 6}%` }} />
      </div>
    </div>
  );
}

interface RowProps {
  row: Row;
  items: Item[] | undefined;
  view: CalendarView;
  window: TimeWindow;
  pxPerHour: number;
  trackW: number;
  now: number;
  selection: Selection | undefined;
  openId?: string;
  myId: string;
  onOpen: (item: Item) => void;
  onSelect: (rowId: string, start: number, end: number) => void;
  onClear: () => void;
  onQuickBook: (row: Row) => void;
  onBook: (row: Row, start: number, end: number) => void;
}

const TimelineRow = memo(function TimelineRow({ row, items, view, window, pxPerHour, trackW, now, selection, openId, myId, onOpen, onSelect, onClear, onQuickBook, onBook }: RowProps) {
  const track = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; x0: number; start: number; end: number; moved: boolean } | null>(null);

  const visible = useMemo(() => (items ?? []).filter((item) => inWindow(item, window)), [items, window]);
  const { lanes, count } = useMemo(() => assignLanes(visible.map((i) => ({ id: i.id, start: i.start, end: i.overdue ? Math.max(i.drawEnd, i.until) : i.drawEnd }))), [visible]);
  const height = ROW_PAD * 2 + count * LANE_H;
  const x = (t: number) => xOf(t, window, pxPerHour);

  const timeAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return window.start + ((clientX - rect.left) / pxPerHour) * HOUR;
  };
  const nextStart = (at: number) => visible.filter((i) => i.active && i.start > at).sort((a, b) => a.start - b.start)[0]?.start;
  const onBar = (target: EventTarget) => !!(target as HTMLElement).closest('[data-bar]');
  // The selection popover is portaled, but React still bubbles its events here: ignore them.
  const outside = (target: EventTarget) => !track.current?.contains(target as Node);
  const hideGhost = () => {
    if (ghost.current) ghost.current.style.opacity = '0';
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || outside(e.target) || onBar(e.target)) return;
    if (e.pointerType === 'touch') {
      touch.current = { x: e.clientX, y: e.clientY };
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = timeAt(e.clientX);
    hideGhost();
    if (selection) onClear();
    setDrag({ from: at, x0: e.clientX, moved: false, ...dragRange(at, at, window) });
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (outside(e.target)) return;
    if (drag) {
      const range = dragRange(drag.from, timeAt(e.clientX), window);
      const moved = drag.moved || Math.abs(e.clientX - drag.x0) > 4;
      if (range.start !== drag.start || range.end !== drag.end || moved !== drag.moved) setDrag({ ...drag, ...range, moved });
      return;
    }
    if (e.pointerType !== 'mouse' || !ghost.current) return;
    if (onBar(e.target) || selection) return hideGhost();
    const range = clickRange(timeAt(e.clientX), window, nextStart(timeAt(e.clientX)));
    ghost.current.style.left = `${x(range.start)}px`;
    ghost.current.style.width = `${Math.max(2, x(range.end) - x(range.start))}px`;
    ghost.current.style.opacity = '1';
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (outside(e.target) && !drag) return;
    if (e.pointerType === 'touch') {
      const start = touch.current;
      touch.current = null;
      if (!start || onBar(e.target) || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
      const at = timeAt(e.clientX);
      const range = clickRange(at, window, nextStart(at));
      onSelect(row.documentId, range.start, range.end);
      return;
    }
    if (!drag) return;
    setDrag(null);
    const range = drag.moved ? { start: drag.start, end: drag.end } : clickRange(drag.from, window, nextStart(drag.from));
    onSelect(row.documentId, range.start, range.end);
  };

  const shown = drag ?? selection;
  const shownClash = shown ? checkPeriod(items, shown.start, shown.end, { assetId: row.assetId }).clashes.length > 0 : false;

  return (
    <div className={cn('group/row relative flex border-b border-border/70', selection && 'bg-primary/[0.03]')} style={{ height }} role="group" aria-label={`${row.assetId} ${row.model}`} data-asset-row={row.assetId}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2.5 border-r border-border bg-card pr-1.5 pl-3" style={{ width: LABEL_W }}>
        <Tip content={row.hireStatus?.name} side="right">
          <span className="relative">
            <AssetIcon kind={row.iconKind} color={row.hireStatus?.color} size={30} />
            {row.hireStatus && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card" style={{ backgroundColor: row.hireStatus.color }} aria-label={row.hireStatus.name} />}
          </span>
        </Tip>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <Link to={`/assets/${row.documentId}`} className="text-[13px] font-semibold hover:text-primary hover:underline">
              {row.assetId}
            </Link>
            {row.unavailable && <span className="rounded bg-danger/10 px-1 text-[10px] font-semibold text-danger uppercase">Unavailable</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground" title={`${row.model}${row.registration ? ` · ${row.registration}` : ''} · ${row.typeName}`}>
            {row.model}
          </div>
        </div>
        <Tip content={`Book ${row.assetId}`}>
          <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" aria-label={`Book ${row.assetId}`} onClick={() => onQuickBook(row)}>
            <Plus />
          </Button>
        </Tip>
      </div>
      <div
        ref={track}
        className={cn('relative cursor-crosshair touch-pan-x touch-pan-y select-none hover:bg-accent/25', row.unavailable && 'bg-[repeating-linear-gradient(135deg,transparent_0_8px,color-mix(in_oklab,var(--danger)_7%,transparent)_8px_10px)]')}
        style={{ width: trackW }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={hideGhost}
        onPointerCancel={() => {
          setDrag(null);
          touch.current = null;
        }}
      >
        <div ref={ghost} aria-hidden className="pointer-events-none absolute top-1.5 bottom-1.5 flex items-center justify-center rounded-md border border-dashed border-primary/50 bg-primary/[0.06] text-primary opacity-0 transition-opacity">
          <Plus className="size-3.5" />
        </div>
        {visible.map((item) => (
          <Bar key={item.id} item={item} lane={lanes.get(item.id) ?? 0} x={x} view={view} window={window} mine={item.personId === myId} open={item.id === openId} onOpen={onOpen} now={now} />
        ))}
        {shown && (
          <Popover open={!!selection && !drag} onOpenChange={(o) => !o && onClear()}>
            <PopoverAnchor asChild>
              <div
                className={cn('pointer-events-none absolute top-1 bottom-1 z-10 flex items-center justify-center overflow-hidden rounded-md border-2 border-dashed text-[11px] font-semibold whitespace-nowrap', shownClash ? 'border-danger bg-danger/10 text-danger' : 'border-primary bg-primary/12 text-primary')}
                style={{ left: x(shown.start), width: Math.max(4, x(shown.end) - x(shown.start)) }}
              >
                {x(shown.end) - x(shown.start) > 80 && (
                  <span className="px-1">
                    {formatTime(shown.start)} – {formatTime(shown.end)}
                    {x(shown.end) - x(shown.start) > 150 && ` · ${lengthText(shown.end - shown.start)}`}
                  </span>
                )}
              </div>
            </PopoverAnchor>
            {selection && !drag && (
              <PopoverContent side="bottom" align="start" className="p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                <SelectionCard row={row} start={selection.start} end={selection.end} items={items} onClose={onClear} onBook={() => onBook(row, selection.start, selection.end)} />
              </PopoverContent>
            )}
          </Popover>
        )}
      </div>
    </div>
  );
});

const Bar = memo(function Bar({ item, lane, x, view, window, mine, open, onOpen, now }: { item: Item; lane: number; x: (t: number) => number; view: CalendarView; window: TimeWindow; mine: boolean; open: boolean; onOpen: (item: Item) => void; now: number }) {
  const left = x(item.start);
  const right = x(item.drawEnd);
  const width = Math.max(4, right - left);
  const top = ROW_PAD + lane * LANE_H;
  const clippedLeft = item.start < window.start;
  const clippedRight = item.drawEnd > window.end;
  const label = item.kind === 'block' ? item.status || 'Workshop' : item.overdue ? 'Overdue' : mine ? 'You' : item.person;
  const overdueFrom = item.overdue ? Math.max(0, x(item.end) - left) : 0;
  const holdWidth = item.overdue ? x(item.until) - right : 0;
  const ariaLabel = `${item.ref}, ${item.kind === 'block' ? 'workshop' : mine ? 'your booking' : item.person ?? ''}, ${dayLabel(item.start, now)} ${formatTime(item.start)} to ${item.openEnded ? 'further notice' : `${dayLabel(item.end, now)} ${formatTime(item.end)}`}, ${item.overdue ? 'Hire Overdue' : item.status}`;
  return (
    <>
      {holdWidth > 2 && (
        <div aria-hidden className="pointer-events-none absolute flex items-center rounded-r-md border border-l-0 border-dashed border-danger/45 bg-danger/[0.04] text-[11px] font-medium text-danger" style={{ left: right, width: holdWidth, top: top + 3, height: LANE_H - 10 }}>
          {holdWidth > 130 && (
            <span className="sticky truncate px-2" style={{ left: LABEL_W + 6 }}>
              Not back: {item.ref}
            </span>
          )}
        </div>
      )}
      <Tip content={<ItemTip item={item} mine={mine} />}>
        <button
          type="button"
          data-bar
          aria-label={ariaLabel}
          onClick={() => onOpen(item)}
          className={cn(
            'absolute flex cursor-pointer items-center text-xs transition-[box-shadow,filter] hover:brightness-[0.97] hover:drop-shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring dark:hover:brightness-110',
            barClass(item),
            clippedLeft && 'rounded-l-none',
            clippedRight && 'rounded-r-none',
            item.overdue && 'ring-1 ring-danger/60',
            open && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
          )}
          style={{ left, width, top, height: LANE_H - 4, ...itemTone(item) }}
        >
          {item.overdue && <span aria-hidden className="absolute inset-y-0 right-0" style={{ left: overdueFrom, background: OVERDUE_STRIPES }} />}
          {width > 26 && (
            <span className="relative flex min-w-0 flex-1 items-center gap-1.5 pr-1.5 pl-2">
              {/* The label sticks beside the asset column while a long bar scrolls under it. */}
              <span className="sticky flex min-w-0 items-center gap-1.5" style={{ left: LABEL_W + 6 }}>
              {item.kind === 'block' ? <Wrench className="size-3 shrink-0" /> : item.overdue ? <AlertTriangle className="size-3 shrink-0 text-danger" /> : width > 120 && item.person ? <PersonAvatar name={item.person} size={16} /> : null}
              {width > 44 && <span className="shrink-0 font-semibold">{item.ref}</span>}
              {width > 96 && label && <span className={cn('truncate', item.overdue ? 'font-semibold text-danger' : 'opacity-80')}>{label}</span>}
              </span>
              {view === 'day' && width > 230 && !item.overdue && (
                <span className="sticky right-2 ml-auto shrink-0 pl-2 text-[11px] opacity-70 tabular">{timesText(item, window.start)}</span>
              )}
            </span>
          )}
        </button>
      </Tip>
    </>
  );
});

