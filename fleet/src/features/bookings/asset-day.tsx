// The calendar on a phone: one asset's day, hours down the screen. Tap free time to book it, tap a
// booking to open it. The asset is chosen from the rows the filters leave.

import { AlertTriangle, CalendarOff, Wrench } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AssetIcon } from '@/components/asset-icon';
import { EmptyState } from '@react-frontends/shared/components';
import { Dialog, DialogContent, Select, Skeleton } from '@react-frontends/shared/ui';
import { assignLanes, type TimeWindow } from '@/domain/logic/calendar';
import { HOUR } from '@/domain/logic/time';
import { formatTime } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { inWindow, type Item, type Row } from './model';
import { barClass, itemTone, OVERDUE_STRIPES, timesText } from './parts';
import { SelectionCard } from './selection-card';
import { clickRange, dayScrollTarget } from './times';

const HOUR_PX = 52;
const GUTTER = 52;

export function AssetDay({
  rows,
  itemsByAsset,
  window,
  now,
  assetId,
  onAsset,
  onOpen,
  onBook,
  myId,
  loading,
}: {
  rows: Row[];
  itemsByAsset: Map<string, Item[]>;
  window: TimeWindow;
  now: number;
  assetId: string | null;
  onAsset: (id: string) => void;
  onOpen: (item: Item) => void;
  onBook: (row: Row, start: number, end: number) => void;
  myId: string;
  loading: boolean;
}) {
  const row = rows.find((r) => r.documentId === assetId) ?? rows[0];
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const items = useMemo(() => (row ? (itemsByAsset.get(row.documentId) ?? []).filter((i) => inWindow(i, window)) : []), [row, itemsByAsset, window]);
  const { lanes, count } = useMemo(() => assignLanes(items.map((i) => ({ id: i.id, start: i.start, end: i.drawEnd }))), [items]);
  const y = (t: number) => ((Math.min(Math.max(t, window.start), window.end) - window.start) / HOUR) * HOUR_PX;

  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = y(dayScrollTarget(window.start, now)) - 12;
    // Only when the day or the asset changes.
  }, [window.start, row?.documentId]);

  if (loading)
    return (
      <div className="grid gap-3 p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-[50vh] w-full rounded-xl" />
      </div>
    );
  if (!row) return <EmptyState icon={CalendarOff} title="No assets match" className="py-16" />;

  const timeAt = (clientY: number) => {
    const rect = (scroller.current!.firstElementChild as HTMLElement).getBoundingClientRect();
    return window.start + ((clientY - rect.top) / HOUR_PX) * HOUR;
  };
  const nextStart = (at: number) => items.filter((i) => i.active && i.start > at).sort((a, b) => a.start - b.start)[0]?.start;
  // A tap (or click) on free time picks a period; browsers don't send one after a scroll.
  const pick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-bar]')) return;
    const at = timeAt(e.clientY);
    setSelection(clickRange(at, window, nextStart(at)));
  };
  const nowInView = now >= window.start && now < window.end;

  return (
    <div className="grid gap-3 p-3">
      <div className="flex items-center gap-3">
        <AssetIcon kind={row.iconKind} color={row.hireStatus?.color} size={36} />
        <Select
          value={row.documentId}
          onChange={onAsset}
          options={rows.map((r) => ({ value: r.documentId, label: `${r.assetId} · ${r.model}`, hint: [r.location, r.hireStatus?.name].filter(Boolean).join(' · ') }))}
          className="flex-1"
        />
      </div>
      {row.unavailable && (
        <p className="flex items-center gap-1.5 rounded-lg bg-danger/8 px-3 py-2 text-[13px] text-danger">
          <AlertTriangle className="size-3.5" /> {row.assetId} is Unavailable For Hire.
        </p>
      )}
      <div ref={scroller} className="relative h-[62dvh] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card" onClick={pick} role="region" aria-label={`${row.assetId}, the day`}>
        <div className="relative" style={{ height: 24 * HOUR_PX }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className={cn('absolute inset-x-0 border-t border-border/70', (h < 7 || h >= 19) && 'bg-muted/40')} style={{ top: h * HOUR_PX, height: HOUR_PX }}>
              <span className="absolute -top-2 left-2 bg-card px-0.5 text-[10px] text-muted-foreground tabular">{h ? formatTime(window.start + h * HOUR).replace(':00', '') : ''}</span>
            </div>
          ))}
          {now > window.start && <div aria-hidden className="absolute inset-x-0 top-0 bg-[repeating-linear-gradient(135deg,transparent_0_7px,color-mix(in_oklab,var(--muted-foreground)_7%,transparent)_7px_8px)]" style={{ height: y(now), left: GUTTER }} />}
          {items.map((item) => {
            const lane = lanes.get(item.id) ?? 0;
            const top = y(item.start);
            const height = Math.max(22, y(item.drawEnd) - top);
            const mine = item.personId === myId;
            return (
              <button
                key={item.id}
                type="button"
                data-bar
                onClick={() => onOpen(item)}
                className={cn('absolute flex cursor-pointer flex-col items-start gap-0.5 px-2.5 py-1.5 text-xs', barClass(item), item.overdue && 'ring-1 ring-danger/60')}
                style={{ top: top + 1, height: height - 2, left: `calc(${GUTTER}px + (100% - ${GUTTER + 8}px) * ${lane / count})`, width: `calc((100% - ${GUTTER + 8}px) / ${count} - 4px)`, ...itemTone(item) }}
              >
                {item.overdue && <span aria-hidden className="absolute inset-x-0 bottom-0" style={{ top: y(item.end) - top, background: OVERDUE_STRIPES }} />}
                <span className="sticky top-1.5 flex flex-col items-start gap-0.5">
                <span className="relative flex items-center gap-1.5 font-semibold">
                  {item.kind === 'block' && <Wrench className="size-3" />}
                  {item.overdue && <AlertTriangle className="size-3 text-danger" />}
                  {item.ref}
                  <span className="font-normal opacity-80">{item.kind === 'block' ? item.status : item.overdue ? 'Hire Overdue' : mine ? 'You' : item.person}</span>
                </span>
                {height > 40 && (
                  <span className="relative opacity-75 tabular">
                    {timesText(item, window.start)}
                  </span>
                )}
                </span>
              </button>
            );
          })}
          {selection && <div aria-hidden className="absolute right-2 rounded-md border-2 border-dashed border-primary bg-primary/12" style={{ left: GUTTER, top: y(selection.start), height: y(selection.end) - y(selection.start) }} />}
          {nowInView && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: y(now) }}>
              <span className="ml-1 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground tabular">{formatTime(now)}</span>
              <span className="h-0.5 flex-1 bg-primary/80" />
            </div>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Tap free time to book {row.assetId}.</p>
      <Dialog open={!!selection} onOpenChange={(o) => !o && setSelection(null)}>
        <DialogContent title={`Book ${row.assetId}`} className="p-3 pt-5" description="Check the times, then continue to the booking.">
          {selection && <SelectionCard row={row} start={selection.start} end={selection.end} items={itemsByAsset.get(row.documentId)} onClose={() => setSelection(null)} onBook={() => onBook(row, selection.start, selection.end)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
