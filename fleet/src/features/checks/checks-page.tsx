// Daily Driver checks: start one (with the assets the person checks most), and the recent checks,
// the person's own, and those that found defects.

import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Gauge, Plus, RotateCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { KpiTile, Alert, EmptyState, Page, PageHeader } from '@react-frontends/shared/components';
import { Badge, Button, Card, Input, PersonAvatar, Skeleton, Table, TabsList, TabsTrigger, Tabs, TBody, TD, TH, THead, TR, Tip } from '@react-frontends/shared/ui';
import { useSession } from '@/data/session';
import { first, nameOf, type DailyDriver } from '@/domain/types';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { formatMeter } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { useCheckCounts, useChecks, type ChecksTab } from './data';

export function ResultBadge({ check }: { check: Pick<DailyDriver, 'ddResult' | 'defectCount'> }) {
  if (check.ddResult === 'Pass')
    return (
      <Badge tone="success">
        <CheckCircle2 />
        Pass
      </Badge>
    );
  if ((check.defectCount ?? 0) > 0 || check.ddResult === 'Defects found')
    return (
      <Badge tone="danger">
        <AlertTriangle />
        {check.defectCount ? `${check.defectCount} ${check.defectCount === 1 ? 'defect' : 'defects'}` : 'Defects found'}
      </Badge>
    );
  return <Badge>{check.ddResult || 'Incomplete'}</Badge>;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/** The assets the person checked lately, newest first, once each. */
function recentAssets(checks: DailyDriver[], limit = 4) {
  const seen = new Set<string>();
  const out: NonNullable<DailyDriver['assetRel']>[number][] = [];
  for (const c of checks) {
    const a = first(c.assetRel);
    if (!a || seen.has(a.documentId)) continue;
    seen.add(a.documentId);
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

export function ChecksPage() {
  const { me } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (['mine', 'defects'].includes(params.get('tab') ?? '') ? params.get('tab') : 'recent') as ChecksTab;
  const [text, setText] = useState('');
  const [size, setSize] = useState(50);
  const checks = useChecks(tab, text, me?.documentId, size);
  const mine = useChecks('mine', '', me?.documentId, 20);
  const weekAgo = useMemo(() => new Date(Date.now() - 7 * 86_400_000).toISOString(), []);
  const today = useMemo(startOfToday, []);
  const todayCounts = useCheckCounts(today);
  const weekCounts = useCheckCounts(weekAgo);
  const quick = recentAssets(mine.data?.documents ?? [], 3);
  const list = checks.data?.documents ?? [];
  const total = checks.data?.total ?? 0;

  return (
    <Page>
      <PageHeader
        title="Daily Driver"
        description="Pre-start checks. A failed check raises a workshop request; an urgent one takes the asset off hire."
        actions={
          <Button asChild>
            <Link to="/checks/new">
              <Plus />
              Start a check
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_70%)]" />
          <div className="relative flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <ClipboardCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight">Before you drive or operate</h2>
              <p className="text-[13px] text-muted-foreground">A few minutes: the meter, then each check. Faults go straight to the workshop.</p>
            </div>
          </div>
          <div className="relative -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
            {mine.isPending ? (
              <>
                <Skeleton className="h-10 w-36" />
                <Skeleton className="h-10 w-36" />
              </>
            ) : (
              quick.map((a) => (
                <Link key={a.documentId} to={`/checks/new?asset=${a.documentId}`} className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm whitespace-nowrap shadow-xs transition-colors hover:border-input hover:bg-accent">
                  <AssetIcon kind={a.iconKind} size={26} />
                  <span className="font-medium">{a.assetId}</span>
                  <span className="hidden text-muted-foreground sm:inline">{a.name?.split(' · ')[1]}</span>
                </Link>
              ))
            )}
            <Link to="/checks/new" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-input px-3 py-1.5 text-sm font-medium whitespace-nowrap text-primary transition-colors hover:bg-primary-soft/50">
              {quick.length ? 'Another asset' : 'Choose an asset'}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Card>
        <div className="grid grid-cols-3 gap-3">
          <KpiTile label="Today" value={todayCounts.all.data?.total ?? 0} loading={todayCounts.all.isPending} hint="checks done" />
          <KpiTile label="Defects" value={weekCounts.defects.data?.total ?? 0} tone={weekCounts.defects.data?.total ? 'danger' : 'success'} icon={AlertTriangle} loading={weekCounts.defects.isPending} hint="last 7 days" />
          <KpiTile label="Meter flags" value={weekCounts.flagged.data?.total ?? 0} tone={weekCounts.flagged.data?.total ? 'warning' : 'neutral'} icon={Gauge} loading={weekCounts.flagged.isPending} hint="last 7 days" />
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setSize(50);
          setParams(v === 'recent' ? {} : { tab: v }, { replace: true });
        }}
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <TabsList className="border-0">
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="mine">Mine</TabsTrigger>
            <TabsTrigger value="defects">Defects found</TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search check, asset, driver…" aria-label="Search checks" className="pl-9" />
          </div>
        </div>
      </Tabs>

      {checks.isError ? (
        <Alert>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Couldn’t load the checks. {(checks.error as Error).message}</span>
            <Button size="sm" variant="outline" onClick={() => void checks.refetch()}>
              <RotateCw />
              Try again
            </Button>
          </div>
        </Alert>
      ) : checks.isPending ? (
        <Card className="grid gap-px overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-none" />
          ))}
        </Card>
      ) : !list.length ? (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            title={text ? 'No checks match' : tab === 'mine' ? 'You haven’t done a check yet' : tab === 'defects' ? 'No defects found' : 'No checks yet'}
            action={
              !text && (
                <Button asChild variant="outline">
                  <Link to="/checks/new">Start a check</Link>
                </Button>
              )
            }
          >
            {tab === 'defects' && !text ? 'Checks with a failed item show up here.' : undefined}
          </EmptyState>
        </Card>
      ) : (
        <div className={cn('transition-opacity', checks.isFetching && checks.isPlaceholderData && 'opacity-60')}>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Check</TH>
                  <TH>Asset</TH>
                  <TH>Driver</TH>
                  <TH>Checked</TH>
                  <TH>Result</TH>
                  <TH className="text-right">Meter</TH>
                </TR>
              </THead>
              <TBody>
                {list.map((c) => {
                  const asset = first(c.assetRel);
                  return (
                    <TR key={c.documentId} data-clickable onClick={() => navigate(`/checks/${c.documentId}`)}>
                      <TD>
                        <Link to={`/checks/${c.documentId}`} onClick={(e) => e.stopPropagation()} className="font-medium tabular hover:underline">
                          {c.ddRef ?? 'Check'}
                        </Link>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <AssetIcon kind={asset?.iconKind} size={28} />
                          <div className="min-w-0">
                            <div className="font-medium">{asset?.assetId}</div>
                            <div className="max-w-48 truncate text-xs text-muted-foreground">{asset?.name?.split(' · ')[1]}</div>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <span className="flex items-center gap-2">
                          <PersonAvatar name={nameOf(c.driverRel)} size={22} />
                          <span className="truncate">{nameOf(c.driverRel)}</span>
                        </span>
                      </TD>
                      <TD>
                        <Tip content={formatDateTime(c.checkDate)}>
                          <span className="text-muted-foreground">{relative(c.checkDate)}</span>
                        </Tip>
                      </TD>
                      <TD>
                        <ResultBadge check={c} />
                      </TD>
                      <TD className="text-right tabular">
                        <span className={cn(c.meterExcludedBool && 'text-[color-mix(in_oklab,var(--warning)_75%,var(--foreground))]')}>
                          {c.meterExcludedBool && (
                            <Tip content="Flagged: kept, but didn’t update the asset">
                              <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
                            </Tip>
                          )}
                          {formatMeter(c.meterReadingNum, asset?.primaryMeterUnit)}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
          <ul className="grid gap-2 md:hidden">
            {list.map((c) => {
              const asset = first(c.assetRel);
              return (
                <li key={c.documentId}>
                  <Link to={`/checks/${c.documentId}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card">
                    <AssetIcon kind={asset?.iconKind} size={38} color={(c.defectCount ?? 0) > 0 ? 'var(--danger)' : c.ddResult === 'Pass' ? 'var(--success)' : undefined} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{asset?.assetId}</span>
                        <span className="text-xs text-muted-foreground tabular">{c.ddRef}</span>
                        <span className="ml-auto">
                          <ResultBadge check={c} />
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                        {nameOf(c.driverRel)} · {relative(c.checkDate)}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {total > list.length && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => setSize((s) => s + 50)} disabled={checks.isFetching}>
                Show more ({total - list.length} more)
              </Button>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
