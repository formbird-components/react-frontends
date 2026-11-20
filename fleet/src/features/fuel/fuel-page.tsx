// Fuel receipts: what the fleet spends and uses over a period, how far each fill went (L/100 km),
// and receipts that don't add up (flagged by the server as FLEET's fuel import does).

import { AlertTriangle, DollarSign, Droplets, Flag, Fuel, Gauge, Plus, RotateCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { KpiTile, Alert, EmptyState, Page, PageHeader } from '@react-frontends/shared/components';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, PersonAvatar, Segmented, Skeleton, Table, TBody, TD, TH, THead, TR, Tip } from '@react-frontends/shared/ui';
import { first, nameOf, type FuelReceipt } from '@/domain/types';
import { formatDate, formatDateTime, formatNumber } from '@react-frontends/shared/format';
import { formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { useReceipts } from './data';
import { BUCKET_NAMES, bucketFor, filterReceipts, FLAG_HELP, flagsOf, fuelSeries, fuelSummary, pricePerLitre } from './fuel';
import { FuelChart, METRICS, type Metric } from './fuel-chart';

const PERIODS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '12 months' },
];

function Flags({ receipt }: { receipt: FuelReceipt }) {
  const flags = flagsOf(receipt);
  if (!flags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <Tip key={f} content={FLAG_HELP[f] ?? f}>
          <span>
            <Badge tone="warning">
              <Flag />
              {f}
            </Badge>
          </span>
        </Tip>
      ))}
    </span>
  );
}

export function FuelPage() {
  const [params, setParams] = useSearchParams();
  const days = Number(PERIODS.find((p) => p.value === params.get('days'))?.value ?? 30);
  const flaggedOnly = params.get('flagged') === '1';
  const highlight = params.get('highlight') ?? undefined;
  const [text, setText] = useState('');
  const [metric, setMetric] = useState<Metric>('spend');
  const receipts = useReceipts(days);
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete('highlight');
        return next;
      },
      { replace: true },
    );

  const list = useMemo(() => filterReceipts(receipts.data?.documents ?? [], { text, flaggedOnly }), [receipts.data, text, flaggedOnly]);
  const summary = useMemo(() => fuelSummary(list), [list]);
  const bucket = bucketFor(days);
  const points = useMemo(() => {
    const to = Date.now();
    return fuelSeries(list, bucket, to - days * 86_400_000, to);
  }, [list, bucket, days]);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? list : list.slice(0, 25);

  useEffect(() => {
    if (!highlight || !list.some((r) => r.documentId === highlight)) return;
    document.getElementById(`receipt-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight, list]);

  const loading = receipts.isPending;

  return (
    <Page>
      <PageHeader
        title="Fuel"
        description="Receipts, spend and consumption. Receipts that don’t add up are flagged."
        actions={
          <Button asChild>
            <Link to="/fuel/new">
              <Plus />
              Add receipt
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={String(days)} onChange={(v) => setParam('days', v === '30' ? '' : v)} options={PERIODS} />
        <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search asset, driver, supplier…" aria-label="Search receipts" className="pl-9" />
        </div>
        <Button variant={flaggedOnly ? 'soft' : 'outline'} aria-pressed={flaggedOnly} onClick={() => setParam('flagged', flaggedOnly ? '' : '1')}>
          <Flag />
          Flagged only
        </Button>
      </div>

      <div className="-mx-4 mb-6 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5 [&>*]:w-44 [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
        <KpiTile label="Spend" value={formatMoney(summary.spend, 0)} icon={DollarSign} tone="primary" loading={loading} hint={`${summary.receipts} receipts`} />
        <KpiTile label="Litres" value={formatNumber(summary.litres)} icon={Droplets} tone="info" loading={loading} hint={`Last ${PERIODS.find((p) => p.value === String(days))?.label}`} />
        <KpiTile label="Average price" value={summary.pricePerLitre ? `$${formatNumber(summary.pricePerLitre, 2)}` : '–'} icon={Fuel} loading={loading} hint="per litre" />
        <KpiTile label="Consumption" value={summary.consumption ? formatNumber(summary.consumption, 1) : '–'} icon={Gauge} loading={loading} hint="L/100 km, fills with a distance" />
        <KpiTile
          label="Flagged"
          value={summary.flagged}
          icon={AlertTriangle}
          tone={summary.flagged ? 'warning' : 'success'}
          loading={loading}
          hint={flaggedOnly ? 'Showing flagged only' : 'Tank, range or meter'}
          active={flaggedOnly}
          onClick={() => setParam('flagged', flaggedOnly ? '' : '1')}
        />
      </div>

      {receipts.isError ? (
        <Alert>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Couldn’t load the receipts. {(receipts.error as Error).message}</span>
            <Button size="sm" variant="outline" onClick={() => void receipts.refetch()}>
              <RotateCw />
              Try again
            </Button>
          </div>
        </Alert>
      ) : (
        <div className={cn('grid gap-6 transition-opacity', receipts.isFetching && receipts.isPlaceholderData && 'opacity-60')}>
          <Card>
            <CardHeader className="flex-wrap">
              <div>
                <CardTitle>{METRICS[metric].title(BUCKET_NAMES[bucket])}</CardTitle>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {flaggedOnly || text ? 'Receipts matching the filters' : 'All receipts'}, last {PERIODS.find((p) => p.value === String(days))?.label}
                </p>
              </div>
              <Segmented
                size="sm"
                value={metric}
                onChange={setMetric}
                options={(Object.keys(METRICS) as Metric[]).map((k) => ({ value: k, label: METRICS[k].label }))}
              />
            </CardHeader>
            <CardContent>{loading ? <Skeleton className="h-64" /> : list.length ? <FuelChart points={points} metric={metric} bucket={BUCKET_NAMES[bucket]} /> : <EmptyState icon={Fuel} title="Nothing to chart" className="h-64 py-0" />}</CardContent>
          </Card>

          {loading ? (
            <Card className="grid gap-px overflow-hidden">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 rounded-none" />
              ))}
            </Card>
          ) : !list.length ? (
            <Card>
              <EmptyState
                icon={Fuel}
                title={text || flaggedOnly ? 'No receipts match' : 'No receipts in this period'}
                action={
                  <Button asChild variant="outline">
                    <Link to="/fuel/new">Add a receipt</Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <Card className="hidden overflow-hidden md:block">
                <Table>
                  <THead>
                    <TR>
                      <TH>Receipt</TH>
                      <TH>Asset</TH>
                      <TH>Driver</TH>
                      <TH className="text-right">Litres</TH>
                      <TH className="text-right">Cost</TH>
                      <TH className="text-right">$/L</TH>
                      <TH className="text-right">Distance</TH>
                      <TH className="text-right">L/100 km</TH>
                      <TH>Flags</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {shown.map((r) => {
                      const asset = first(r.assetRel);
                      return (
                        <TR key={r.documentId} id={`receipt-${r.documentId}`} className={cn(highlight === r.documentId && 'bg-primary-soft/60')}>
                          <TD>
                            <div className="font-medium tabular">{r.fuelRef}</div>
                            <Tip content={formatDateTime(r.fuelDate)}>
                              <div className="text-xs text-muted-foreground">{formatDate(r.fuelDate)}</div>
                            </Tip>
                          </TD>
                          <TD>
                            <Link to={`/assets/${asset?.documentId}`} className="flex items-center gap-2 hover:underline">
                              <AssetIcon kind={asset?.iconKind} size={26} />
                              <span className="font-medium">{asset?.assetId}</span>
                            </Link>
                            {r.supplier && <div className="mt-0.5 max-w-44 truncate pl-[34px] text-xs text-muted-foreground">{r.supplier}</div>}
                          </TD>
                          <TD>
                            {nameOf(r.driverRel) ? (
                              <span className="flex items-center gap-2">
                                <PersonAvatar name={nameOf(r.driverRel)} size={22} />
                                <span className="truncate">{nameOf(r.driverRel)}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">–</span>
                            )}
                          </TD>
                          <TD className="text-right tabular">{formatNumber(r.litresNum, 1)}</TD>
                          <TD className="text-right tabular">{formatMoney(r.costNum)}</TD>
                          <TD className="text-right text-muted-foreground tabular">{pricePerLitre(r.costNum, r.litresNum)?.toFixed(2) ?? '–'}</TD>
                          <TD className="text-right text-muted-foreground tabular">{r.distanceNum ? `${formatNumber(r.distanceNum)} km` : '–'}</TD>
                          <TD className="text-right font-medium tabular">{r.consumptionNum ? formatNumber(r.consumptionNum, 1) : <span className="font-normal text-muted-foreground">–</span>}</TD>
                          <TD>
                            <Flags receipt={r} />
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </Card>
              <ul className="grid gap-2 md:hidden">
                {shown.map((r) => {
                  const asset = first(r.assetRel);
                  return (
                    <li key={r.documentId} id={`receipt-${r.documentId}-m`} className={cn('rounded-xl border border-border bg-card p-3 shadow-card', highlight === r.documentId && 'ring-2 ring-primary/40')}>
                      <div className="flex items-center gap-3">
                        <AssetIcon kind={asset?.iconKind} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{asset?.assetId}</span>
                            <span className="text-xs text-muted-foreground tabular">{r.fuelRef}</span>
                            <span className="ml-auto font-medium tabular">{formatMoney(r.costNum)}</span>
                          </div>
                          <div className="truncate text-[13px] text-muted-foreground">
                            {formatDate(r.fuelDate)} · {formatNumber(r.litresNum, 1)} L{r.consumptionNum ? ` · ${formatNumber(r.consumptionNum, 1)} L/100 km` : ''}
                          </div>
                        </div>
                      </div>
                      {flagsOf(r).length > 0 && (
                        <div className="mt-2">
                          <Flags receipt={r} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {list.length > shown.length && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={() => setShowAll(true)}>
                    Show all {list.length} receipts
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Page>
  );
}
