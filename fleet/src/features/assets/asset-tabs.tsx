// The asset page's tabs of related records: its bookings, workshop requests and work orders, Daily
// Driver checks and fuel receipts, newest first, a page at a time.

import { CalendarPlus, ClipboardCheck, Droplet, Fuel, Gauge, Receipt, Wrench, type LucideIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, EmptyState, StatusBadge } from '@react-frontends/shared/components';
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, PersonAvatar, Skeleton, Table, TBody, TD, TH, THead, TR } from '@react-frontends/shared/ui';
import { rangeLabel } from '@/domain/logic/time';
import type { RecordKind } from '@/domain/model';
import { first, nameOf, type Asset, type Booking, type DailyDriver, type Doc, type FuelReceipt, type WorkOrder, type WorkshopRequest } from '@/domain/types';
import { fleetQuery } from '@/lib/es';
import { term } from '@react-frontends/shared/es';
import { formatDate, formatDateTime, formatNumber } from '@react-frontends/shared/format';
import { formatMeter, formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { ConsumptionChart } from './fuel-chart';
import { consumptionSeries, fuelSummary } from './logic';
import { usePagedSearch } from './paged';

/** Records of a kind about an asset, sorted. */
export const relatedRequest = (kind: RecordKind, assetId: string, sort: Record<string, unknown>[]) => fleetQuery(kind, { filter: [term('assetRel.documentId', assetId)], sort });

export const RELATED_SORT: Record<'booking' | 'request' | 'workOrder' | 'dailyDriver' | 'fuelReceipt', Record<string, unknown>[]> = {
  booking: [{ startDate: 'desc' }],
  request: [{ 'systemHeader.createdDate': 'desc' }],
  workOrder: [{ 'systemHeader.createdDate': 'desc' }],
  dailyDriver: [{ checkDate: 'desc' }],
  fuelReceipt: [{ fuelDate: 'desc' }],
};

function Person({ value }: { value: { name?: string }[] | undefined }) {
  const name = nameOf(value);
  if (!name) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <PersonAvatar name={name} size={22} />
      {name}
    </span>
  );
}

/** A card holding a list of related records: title and count, the table, loading/empty/error states, and "show more". */
function ListCard<T extends Doc>({
  title,
  description,
  query,
  columns,
  row,
  empty,
  action,
  emptyIcon,
}: {
  title: string;
  description?: ReactNode;
  query: ReturnType<typeof usePagedSearch<T>>;
  columns: { label: string; className?: string }[];
  /** A row's cells, and where clicking it goes (none: not clickable). */
  row: (item: T) => { to?: string; cells: ReactNode[] };
  empty: ReactNode;
  action?: ReactNode;
  emptyIcon?: LucideIcon;
}) {
  const navigate = useNavigate();
  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-center">
        <div>
          <CardTitle>
            {title}
            {!query.isPending && query.total > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground tabular">{query.total}</span>}
          </CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      {query.error ? (
        <div className="px-5 pb-5">
          <Alert>
            {query.error instanceof Error ? query.error.message : "Couldn't load these records."}{' '}
            <button type="button" className="cursor-pointer font-medium underline" onClick={() => void query.refetch()}>
              Try again
            </button>
          </Alert>
        </div>
      ) : !query.isPending && !query.items.length ? (
        <EmptyState icon={emptyIcon} title={empty} className="border-t border-border py-10" />
      ) : (
        <>
          <Table>
            <THead className="bg-muted/40">
              <tr>
                {columns.map((c) => (
                  <TH key={c.label} className={c.className}>
                    {c.label}
                  </TH>
                ))}
              </tr>
            </THead>
            <TBody>
              {query.isPending
                ? Array.from({ length: 4 }, (_, i) => (
                    <TR key={i}>
                      {columns.map((c) => (
                        <TD key={c.label} className={c.className}>
                          <Skeleton className="h-4 w-20" />
                        </TD>
                      ))}
                    </TR>
                  ))
                : query.items.map((item) => {
                    const r = row(item);
                    return (
                      <TR
                        key={item.documentId}
                        data-clickable={!!r.to}
                        onClick={(e) => {
                          if (!r.to || (e.target as Element).closest('a, button')) return;
                          navigate(r.to);
                        }}
                      >
                        {r.cells.map((cell, i) => (
                          <TD key={i} className={columns[i]?.className}>
                            {cell}
                          </TD>
                        ))}
                      </TR>
                    );
                  })}
            </TBody>
          </Table>
          {query.hasNextPage && (
            <div className="flex justify-center border-t border-border p-3">
              <Button variant="ghost" size="sm" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                {query.isFetchingNextPage ? 'Loading…' : `Show more (${query.total - query.items.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const refLink = (to: string, text: string | undefined) => (
  <Link to={to} className="font-medium whitespace-nowrap hover:underline">
    {text || 'Open'}
  </Link>
);

// ------------------------------------------------------------------------------------ bookings

export function BookingsTab({ asset }: { asset: Asset }) {
  const query = usePagedSearch<Booking>('booking', relatedRequest('booking', asset.documentId, RELATED_SORT.booking), {
    pageSize: 15,
    include: ['documentId', 'bookingRef', 'bookingStatusRel', 'startDate', 'endDate', 'requestedByRel', 'bookingReasonRel', 'distanceNum', 'hireCost', 'destination'],
  });
  return (
    <ListCard
      title="Bookings"
      query={query}
      emptyIcon={CalendarPlus}
      empty="No bookings for this asset yet."
      action={
        <Button size="sm" variant="outline" asChild>
          <Link to={`/bookings/new?asset=${encodeURIComponent(asset.documentId)}`}>
            <CalendarPlus />
            Book
          </Link>
        </Button>
      }
      columns={[
        { label: 'Booking' },
        { label: 'Status' },
        { label: 'When' },
        { label: 'Requested by', className: 'hidden md:table-cell' },
        { label: 'Reason', className: 'hidden xl:table-cell' },
        { label: 'Distance', className: 'hidden lg:table-cell text-right' },
        { label: 'Cost', className: 'hidden lg:table-cell text-right' },
      ]}
      row={(b) => ({
        to: `/bookings/${b.documentId}`,
        cells: [
          refLink(`/bookings/${b.documentId}`, b.bookingRef),
          <StatusBadge value={b.bookingStatusRel} />,
          <span className="whitespace-nowrap tabular">{rangeLabel(b.startDate, b.endDate)}</span>,
          <Person value={b.requestedByRel} />,
          <span className="text-muted-foreground">{nameOf(b.bookingReasonRel) || '–'}</span>,
          <span className="tabular">{b.distanceNum ? formatMeter(b.distanceNum, asset.primaryMeterUnit) : '–'}</span>,
          <span className="tabular">{b.hireCost ? formatMoney(b.hireCost) : '–'}</span>,
        ],
      })}
    />
  );
}

// ------------------------------------------------------------------------------------ workshop

const URGENT = 'Urgent – Asset Out of Service';

export function WorkshopTab({ asset }: { asset: Asset }) {
  const requests = usePagedSearch<WorkshopRequest>('request', relatedRequest('request', asset.documentId, RELATED_SORT.request), {
    pageSize: 10,
    include: ['documentId', 'requestRef', 'requestTypeRel', 'requestStatusRel', 'priorityRel', 'createdDate', 'systemHeader.createdDate', 'expectedStartDate', 'expectedCompletionDate', 'assignedToRel', 'reqDescription'],
  });
  const orders = usePagedSearch<WorkOrder>('workOrder', relatedRequest('workOrder', asset.documentId, RELATED_SORT.workOrder), {
    pageSize: 10,
    include: ['documentId', 'workOrderRef', 'workOrderTypeRel', 'workOrderStatusRel', 'assignedToRel', 'completedDate', 'totalCost', 'requestRel.requestRef'],
  });
  return (
    <div className="grid gap-4">
      <ListCard
        title="Workshop requests"
        query={requests}
        emptyIcon={Wrench}
        empty="No workshop requests for this asset."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to={`/workshop/requests/new?asset=${encodeURIComponent(asset.documentId)}`}>
              <Wrench />
              Report a fault
            </Link>
          </Button>
        }
        columns={[
          { label: 'Request' },
          { label: 'Type', className: 'hidden lg:table-cell' },
          { label: 'Status' },
          { label: 'Priority', className: 'hidden md:table-cell' },
          { label: 'Raised', className: 'hidden md:table-cell' },
          { label: 'Expected', className: 'hidden xl:table-cell' },
          { label: 'Assigned to', className: 'hidden lg:table-cell' },
        ]}
        row={(r) => ({
          to: `/workshop/requests/${r.documentId}`,
          cells: [
            <div className="min-w-0">
              {refLink(`/workshop/requests/${r.documentId}`, r.requestRef)}
              {r.reqDescription && <div className="max-w-64 truncate text-xs text-muted-foreground">{r.reqDescription}</div>}
            </div>,
            <span className="text-muted-foreground">{nameOf(r.requestTypeRel) || '–'}</span>,
            <StatusBadge value={r.requestStatusRel} />,
            nameOf(r.priorityRel) === URGENT ? <Badge tone="danger">Urgent</Badge> : <Badge>Non-urgent</Badge>,
            <span className="whitespace-nowrap tabular">{formatDate(r.createdDate ?? r.systemHeader?.createdDate)}</span>,
            <span className="whitespace-nowrap tabular">{rangeLabel(r.expectedStartDate, r.expectedCompletionDate) || '–'}</span>,
            <Person value={r.assignedToRel} />,
          ],
        })}
      />
      <ListCard
        title="Work orders"
        query={orders}
        emptyIcon={Receipt}
        empty="No work orders for this asset."
        columns={[
          { label: 'Work order' },
          { label: 'Type' },
          { label: 'Status' },
          { label: 'Request', className: 'hidden lg:table-cell' },
          { label: 'Assigned to', className: 'hidden md:table-cell' },
          { label: 'Completed', className: 'hidden md:table-cell' },
          { label: 'Total', className: 'text-right' },
        ]}
        row={(w) => ({
          to: `/workshop/work-orders/${w.documentId}`,
          cells: [
            refLink(`/workshop/work-orders/${w.documentId}`, w.workOrderRef),
            <span className="text-muted-foreground">{nameOf(w.workOrderTypeRel) || '–'}</span>,
            <StatusBadge value={w.workOrderStatusRel} />,
            <span className="text-muted-foreground">{first(w.requestRel)?.requestRef ?? '–'}</span>,
            <Person value={w.assignedToRel} />,
            <span className="whitespace-nowrap tabular">{formatDate(w.completedDate) || '–'}</span>,
            <span className="tabular">{w.totalCost ? formatMoney(w.totalCost) : '–'}</span>,
          ],
        })}
      />
    </div>
  );
}

// ------------------------------------------------------------------------------------ Daily Drivers

export function ChecksTab({ asset }: { asset: Asset }) {
  const query = usePagedSearch<DailyDriver>('dailyDriver', relatedRequest('dailyDriver', asset.documentId, RELATED_SORT.dailyDriver), {
    pageSize: 15,
    include: ['documentId', 'ddRef', 'checkDate', 'driverRel', 'ddResult', 'defectCount', 'meterReadingNum', 'defectDescription'],
  });
  return (
    <ListCard
      title="Daily Driver checks"
      query={query}
      emptyIcon={ClipboardCheck}
      empty="No checks recorded for this asset."
      action={
        <Button size="sm" variant="outline" asChild>
          <Link to={`/checks/new?asset=${encodeURIComponent(asset.documentId)}`}>
            <ClipboardCheck />
            New check
          </Link>
        </Button>
      }
      columns={[{ label: 'Check' }, { label: 'Checked' }, { label: 'Driver', className: 'hidden md:table-cell' }, { label: 'Result' }, { label: 'Meter', className: 'hidden lg:table-cell text-right' }]}
      row={(c) => {
        const failed = Number(c.defectCount) > 0 || /defect/i.test(c.ddResult ?? '');
        return {
          to: `/checks/${c.documentId}`,
          cells: [
            <div className="min-w-0">
              {refLink(`/checks/${c.documentId}`, c.ddRef)}
              {failed && c.defectDescription && <div className="max-w-64 truncate text-xs text-muted-foreground">{c.defectDescription}</div>}
            </div>,
            <span className="whitespace-nowrap tabular">{formatDateTime(c.checkDate)}</span>,
            <Person value={c.driverRel} />,
            failed ? <Badge tone="danger">{c.defectCount ? `${c.defectCount} ${Number(c.defectCount) === 1 ? 'defect' : 'defects'}` : c.ddResult}</Badge> : <Badge tone="success">{c.ddResult || 'Pass'}</Badge>,
            <span className="tabular">{formatMeter(c.meterReadingNum, asset.primaryMeterUnit) || '–'}</span>,
          ],
        };
      }}
    />
  );
}

// ------------------------------------------------------------------------------------ fuel

const FUEL_FIELDS = ['documentId', 'fuelRef', 'fuelDate', 'litresNum', 'costNum', 'meterReadingNum', 'distanceNum', 'consumptionNum', 'fuelFlags', 'supplier', 'driverRel'];

export function FuelTab({ asset }: { asset: Asset }) {
  // The chart and the totals use every receipt (a fleet has a few a month per asset).
  const all = usePagedSearch<FuelReceipt>('fuelReceipt', relatedRequest('fuelReceipt', asset.documentId, RELATED_SORT.fuelReceipt), { pageSize: 500, include: FUEL_FIELDS });
  const receipts = all.items;
  const summary = useMemo(() => fuelSummary(receipts), [receipts]);
  const points = useMemo(() => consumptionSeries(receipts), [receipts]);
  const table = usePagedSearch<FuelReceipt>('fuelReceipt', relatedRequest('fuelReceipt', asset.documentId, RELATED_SORT.fuelReceipt), { pageSize: 15, include: FUEL_FIELDS });
  const stat = (icon: LucideIcon, label: string, value: ReactNode, hint?: ReactNode) => {
    const Icon = icon;
    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{all.isPending ? <Skeleton className="h-7 w-20" /> : value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    );
  };
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(Receipt, 'Receipts', formatNumber(summary.count))}
        {stat(Droplet, 'Litres', formatNumber(summary.litres, summary.litres % 1 ? 1 : 0), summary.perLitre ? `${formatMoney(summary.perLitre, 3)} a litre on average` : undefined)}
        {stat(Fuel, 'Spend', formatMoney(summary.cost))}
        {stat(Gauge, 'Average consumption', summary.consumption ? `${formatNumber(summary.consumption, 1)} L/100 km` : '–', summary.consumption ? 'Over measured fills' : 'Needs two fills with meters')}
      </div>
      <ConsumptionChart points={points} average={summary.consumption} loading={all.isPending} />
      <ListCard
        title="Fuel receipts"
        query={table}
        emptyIcon={Fuel}
        empty="No fuel receipts for this asset."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to={`/fuel/new?asset=${encodeURIComponent(asset.documentId)}`}>
              <Fuel />
              Add receipt
            </Link>
          </Button>
        }
        columns={[
          { label: 'Receipt' },
          { label: 'Date' },
          { label: 'Litres', className: 'text-right' },
          { label: 'Cost', className: 'text-right' },
          { label: 'Meter', className: 'hidden lg:table-cell text-right' },
          { label: 'L/100 km', className: 'hidden md:table-cell text-right' },
          { label: 'Flags', className: 'hidden md:table-cell' },
        ]}
        row={(r) => ({
          to: `/fuel?highlight=${encodeURIComponent(r.documentId)}&days=365`,
          cells: [
            <div>
              {refLink(`/fuel?highlight=${encodeURIComponent(r.documentId)}&days=365`, r.fuelRef)}
              {r.supplier && <div className="max-w-48 truncate text-xs text-muted-foreground">{r.supplier}</div>}
            </div>,
            <span className="whitespace-nowrap tabular">{formatDateTime(r.fuelDate)}</span>,
            <span className="tabular">{formatNumber(r.litresNum, 1)}</span>,
            <span className="tabular">{formatMoney(r.costNum)}</span>,
            <span className="tabular">{formatMeter(r.meterReadingNum, asset.primaryMeterUnit) || '–'}</span>,
            <span className="tabular">{r.consumptionNum ? formatNumber(r.consumptionNum, 1) : '–'}</span>,
            r.fuelFlags?.length ? (
              <span className="flex flex-wrap gap-1">
                {r.fuelFlags.map((f) => (
                  <Badge key={f} tone="warning">
                    {f}
                  </Badge>
                ))}
              </span>
            ) : (
              <span className={cn('text-muted-foreground')}>–</span>
            ),
          ],
        })}
      />
    </div>
  );
}
