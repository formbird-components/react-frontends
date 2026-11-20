// One asset: what it is and its state (hire and lifecycle), quick actions (book, Daily Driver,
// report a fault, fuel), where it stands on meter, service, rego, insurance and replacement, and
// tabs of its details and related records. Managers edit a few fields in a side sheet.

import {
  ArrowLeft,
  CalendarPlus,
  ClipboardCheck,
  ExternalLink,
  Fuel,
  Gauge,
  MapPinned,
  Pencil,
  Recycle,
  ShieldCheck,
  FileBadge,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { pointOf } from '@/components/map-geo';
import { MapView } from '@/components/map-view';
import { Alert, EmptyState, Page, StatusBadge } from '@react-frontends/shared/components';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, PersonAvatar, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, Tip } from '@react-frontends/shared/ui';
import { useSearch, useRecord } from '@/data/records';
import { useSession } from '@/data/session';
import { first, nameOf, type Asset, type LookupValue } from '@/domain/types';
import { ApiError } from '@react-frontends/shared/api';
import { daysUntil, formatDate, formatDateTime, formatNumber, relative } from '@react-frontends/shared/format';
import { formatMeter, formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { assetMarker, positionLabel, positionSpeed, siteAreas, useSites } from '../map/layers';
import { canBook } from '../map/asset-popup';
import { AssetEditSheet } from './asset-edit';
import { BookingsTab, ChecksTab, FuelTab, RELATED_SORT, relatedRequest, WorkshopTab } from './asset-tabs';
import { dueTone, Plate, ServiceBadge, toneText } from './bits';
import { isPlant, remainingText, serviceProgress } from './logic';

type TabKey = 'overview' | 'bookings' | 'workshop' | 'checks' | 'fuel';
const TABS: TabKey[] = ['overview', 'bookings', 'workshop', 'checks', 'fuel'];

export function AssetPage() {
  const { id } = useParams();
  const record = useRecord<Asset & { disposedByRel?: LookupValue[]; lastStatus?: string }>(id);
  const { who } = useSession();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as TabKey | null;
  const tab: TabKey = tabParam && TABS.includes(tabParam) ? tabParam : 'overview';
  const [editing, setEditing] = useState(false);

  if (record.isPending) return <AssetSkeleton />;
  if (record.error || !record.data?.documentId) {
    const missing = (record.error instanceof ApiError && [400, 404].includes(record.error.status)) || (!record.error && !record.data?.documentId);
    return (
      <Page>
        <BackLink />
        {missing ? (
          <EmptyState
            icon={MapPinned}
            title="Asset not found"
            action={
              <Button variant="outline" asChild>
                <Link to="/assets">Back to the register</Link>
              </Button>
            }
          >
            It may have been removed, or the link is wrong.
          </EmptyState>
        ) : (
          <Alert className="mt-4">
            {record.error instanceof Error ? record.error.message : "Couldn't load this asset."}{' '}
            <button type="button" className="cursor-pointer font-medium underline" onClick={() => void record.refetch()}>
              Try again
            </button>
          </Alert>
        )}
      </Page>
    );
  }

  const asset = record.data;
  const setTab = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'overview') next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      { replace: true },
    );

  return (
    <Page wide>
      <title>{`${asset.assetId} · Harbourline Fleet`}</title>
      <BackLink />
      <AssetHeader asset={asset} canEdit={who.isManager} onEdit={() => setEditing(true)} />
      <KpiStrip asset={asset} />
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabCounts asset={asset} />
        <TabsContent value="overview">
          <OverviewTab asset={asset} />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsTab asset={asset} />
        </TabsContent>
        <TabsContent value="workshop">
          <WorkshopTab asset={asset} />
        </TabsContent>
        <TabsContent value="checks">
          <ChecksTab asset={asset} />
        </TabsContent>
        <TabsContent value="fuel">
          <FuelTab asset={asset} />
        </TabsContent>
      </Tabs>
      {who.isManager && <AssetEditSheet asset={asset} who={who} open={editing} onOpenChange={setEditing} />}
    </Page>
  );
}

const BackLink = () => (
  <Link to="/assets" className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-foreground">
    <ArrowLeft className="size-4" />
    Assets
  </Link>
);

function AssetSkeleton() {
  return (
    <Page wide>
      <div aria-busy="true" aria-label="Loading the asset">
        <Skeleton className="mb-5 h-4 w-16" />
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 rounded-xl" />
          <div className="grid gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-5 w-44 rounded-full" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-10 w-full max-w-lg" />
        <Skeleton className="mt-5 h-72 rounded-xl" />
      </div>
    </Page>
  );
}

// ------------------------------------------------------------------------------------ header

function AssetHeader({ asset, canEdit, onEdit }: { asset: Asset; canEdit: boolean; onEdit: () => void }) {
  const q = `?asset=${encodeURIComponent(asset.documentId)}`;
  const bookable = canBook(asset);
  const facts = [asset.makeModel, asset.yearNum, asset.colour, first(asset.assetTypeRel)?.name].filter(Boolean).join(' · ');
  const action = (to: string, icon: LucideIcon, label: string, primary = false) => {
    const Icon = icon;
    return (
      <Button variant={primary ? 'default' : 'outline'} asChild>
        <Link to={to}>
          <Icon />
          {label}
        </Link>
      </Button>
    );
  };
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <AssetIcon kind={asset.iconKind} color={first(asset.hireStatusRel)?.color} size={56} className="rounded-xl" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{asset.assetId}</h1>
            <Plate rego={asset.registration} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{facts}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge value={asset.hireStatusRel} />
            <StatusBadge value={asset.assetStatusRel} />
            {asset.serviceWarning === 'Overdue' && <ServiceBadge warning="Overdue" />}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:justify-end">
        {bookable ? (
          action(`/bookings/new${q}`, CalendarPlus, 'Book', true)
        ) : (
          <Tip content={`${nameOf(asset.assetStatusRel) || 'This asset'}: not bookable`}>
            <span tabIndex={0} className="inline-flex">
              <Button disabled className="w-full">
                <CalendarPlus />
                Book
              </Button>
            </span>
          </Tip>
        )}
        {action(`/checks/new${q}`, ClipboardCheck, 'Daily Driver')}
        {action(`/workshop/requests/new${q}`, Wrench, 'Report a fault')}
        {action(`/fuel/new${q}`, Fuel, 'Fuel')}
        {canEdit && (
          <Button variant="secondary" onClick={onEdit} className="col-span-2 sm:col-span-1">
            <Pencil />
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------ KPI strip

function Kpi({ icon: Icon, label, children, className }: { icon: LucideIcon; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-card', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1.5 flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

const Big = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('truncate text-lg font-semibold tracking-tight', className)}>{children}</div>;
const Sub = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('mt-0.5 text-xs text-muted-foreground', className)}>{children}</div>;

function DueKpi({ icon, label, value, missing }: { icon: LucideIcon; label: string; value: unknown; missing: string }) {
  const tone = dueTone(value, 30);
  const days = daysUntil(value);
  return (
    <Kpi icon={icon} label={label}>
      {tone === 'none' ? (
        <>
          <Big className="text-muted-foreground">–</Big>
          <Sub>{missing}</Sub>
        </>
      ) : (
        <>
          <Big>{formatDate(value)}</Big>
          <Sub className={cn(tone !== 'ok' && `font-medium ${toneText[tone]}`)}>
            {days === 0 ? 'Due today' : days! < 0 ? `Expired ${relative(value)}` : `Due ${relative(value)}`}
          </Sub>
        </>
      )}
    </Kpi>
  );
}

function KpiStrip({ asset }: { asset: Asset }) {
  const progress = serviceProgress(asset);
  const plant = isPlant(asset);
  const bar = progress?.warning === 'Overdue' ? 'bg-danger' : progress?.warning === 'Due Soon' ? 'bg-warning' : 'bg-success';
  const replacementYears = daysUntil(asset.replacementDueDate);
  return (
    <div className="mt-6 grid grid-flow-row-dense grid-cols-2 gap-3 lg:grid-cols-6">
      <Kpi icon={Gauge} label="Meter">
        <Big>{formatMeter(asset.meterReadingNum, asset.primaryMeterUnit) || '–'}</Big>
        <Sub>
          {asset.meterReadingDate ? (
            <span title={formatDateTime(asset.meterReadingDate)}>Read {relative(asset.meterReadingDate)}</span>
          ) : (
            'No reading yet'
          )}
        </Sub>
      </Kpi>

      <Kpi icon={Wrench} label="Next service" className="col-span-2">
        {progress ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <Big>{[formatDate(asset.serviceDueDate), formatMeter(asset.serviceDueMeterNum, asset.primaryMeterUnit)].filter(Boolean).join(' · ')}</Big>
              <ServiceBadge warning={progress.warning} className="shrink-0" />
            </div>
            <div
              className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Through the service interval"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, progress.fraction) * 100)}
            >
              <div className={cn('h-full rounded-full transition-[width]', bar)} style={{ width: `${Math.max(3, Math.min(1, progress.fraction) * 100)}%` }} />
            </div>
            <Sub className="mt-1.5 flex justify-between gap-2">
              <span className={cn(progress.warning === 'Overdue' && `font-medium ${toneText.danger}`)}>{remainingText(progress, asset.primaryMeterUnit)}</span>
              <span className="shrink-0">{nameOf(asset.servicePlanRel)}</span>
            </Sub>
          </>
        ) : (
          <>
            <Big className="text-muted-foreground">–</Big>
            <Sub>No service plan</Sub>
          </>
        )}
      </Kpi>

      <DueKpi icon={FileBadge} label="Registration" value={plant ? undefined : asset.regDueDate} missing={plant ? 'Not registered (plant)' : 'No date recorded'} />
      <DueKpi icon={ShieldCheck} label="Insurance" value={plant ? undefined : asset.insuranceDueDate} missing={plant ? 'Covered by the plant policy' : 'No date recorded'} />

      <Kpi icon={Recycle} label="Replacement">
        {asset.replacementDueDate ? (
          <>
            <Big>{new Date(asset.replacementDueDate).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</Big>
            <Sub className={cn(replacementYears !== undefined && replacementYears < 180 && `font-medium ${toneText[replacementYears < 0 ? 'danger' : 'warning']}`)}>
              {replacementYears !== undefined && replacementYears < 0 ? `Due ${relative(asset.replacementDueDate)}` : `In ${relative(asset.replacementDueDate).replace(/^in /, '')}`}
              {asset.replacementCycleMonths ? ` · ${asset.replacementCycleMonths}-month cycle` : ''}
            </Sub>
          </>
        ) : (
          <>
            <Big className="text-muted-foreground">–</Big>
            <Sub>No replacement cycle</Sub>
          </>
        )}
      </Kpi>
    </div>
  );
}

// ------------------------------------------------------------------------------------ tabs

function useRelatedCount(kind: keyof typeof RELATED_SORT, assetId: string): number | undefined {
  return useSearch(kind, relatedRequest(kind, assetId, RELATED_SORT[kind]), { size: 0 }).data?.total;
}

function TabCounts({ asset }: { asset: Asset }) {
  const bookings = useRelatedCount('booking', asset.documentId);
  const requests = useRelatedCount('request', asset.documentId);
  const orders = useRelatedCount('workOrder', asset.documentId);
  const checks = useRelatedCount('dailyDriver', asset.documentId);
  const fuel = useRelatedCount('fuelReceipt', asset.documentId);
  const counts = { bookings, workshop: requests === undefined && orders === undefined ? undefined : (requests ?? 0) + (orders ?? 0), checks, fuel };
  const badge = (n: number | undefined) => (n ? <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular">{formatNumber(n)}</span> : null);
  return (
    <TabsList>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="bookings">Bookings {badge(counts.bookings)}</TabsTrigger>
      <TabsTrigger value="workshop">Workshop {badge(counts.workshop)}</TabsTrigger>
      <TabsTrigger value="checks">Daily Drivers {badge(counts.checks)}</TabsTrigger>
      <TabsTrigger value="fuel">Fuel {badge(counts.fuel)}</TabsTrigger>
    </TabsList>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === undefined || children === null || children === '' || children === false;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-sm break-words', empty && 'text-muted-foreground')}>{empty ? '–' : children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">{children}</dl>
      </CardContent>
    </Card>
  );
}

const yesNo = (value: unknown) => (value === true ? 'Yes' : value === false ? 'No' : '');
const names = (list: { name?: string }[] | undefined) => (list ?? []).map((v) => v.name).filter(Boolean).join(', ');

function OverviewTab({ asset }: { asset: Asset & Record<string, unknown> }) {
  const type = first(asset.assetTypeRel);
  const plan = first(asset.servicePlanRel);
  const person = nameOf(asset.responsiblePersonRel);
  const plant = isPlant(asset);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="Details">
          <Detail label="Type">{type?.name}</Detail>
          <Detail label="Class">{asset.assetClass}</Detail>
          <Detail label="Make and model">{asset.makeModel}</Detail>
          <Detail label="Year">{asset.yearNum}</Detail>
          <Detail label="Colour">{asset.colour}</Detail>
          {!plant && <Detail label="Registration">{asset.registration}</Detail>}
          <Detail label="VIN / chassis">{asset.vin && <span className="font-mono text-[13px]">{asset.vin}</span>}</Detail>
          <Detail label="Fuel">{nameOf(asset.fuelTypeRel)}</Detail>
          <Detail label="Tank">{asset.tankCapacityL ? `${formatNumber(asset.tankCapacityL)} L` : ''}</Detail>
          <Detail label="Licence needed">{asset.requiredLicence}</Detail>
          <Detail label="Tracker">{asset.trackerSerial}</Detail>
        </Section>
        <Section title="Assignment">
          <Detail label="Allocation">{asset.allocationStatus as string}</Detail>
          <Detail label="Responsible person">
            {person && (
              <span className="inline-flex items-center gap-2">
                <PersonAvatar name={person} size={22} />
                {person}
              </span>
            )}
          </Detail>
          <Detail label="Location">{nameOf(asset.locationRel)}</Detail>
          <Detail label="Responsible workshop">{nameOf(asset.responsibleWorkshopRel)}</Detail>
          <Detail label="Department">{nameOf(asset.departmentRel)}</Detail>
          <Detail label="Hire pools">{names(asset.poolsRel)}</Detail>
        </Section>
        <Section title="Service">
          <Detail label="Service plan">{plan?.name}</Detail>
          <Detail label="Interval">{[plan?.weeks ? `${plan.weeks} weeks` : '', plan?.meter ? formatMeter(plan.meter, asset.primaryMeterUnit) : ''].filter(Boolean).join(' or ')}</Detail>
          <Detail label="Last service">{[formatDate(asset.lastServiceDate), formatMeter(asset.lastServiceMeterNum, asset.primaryMeterUnit)].filter(Boolean).join(' · ')}</Detail>
          <Detail label="Due">{[formatDate(asset.serviceDueDate), formatMeter(asset.serviceDueMeterNum, asset.primaryMeterUnit)].filter(Boolean).join(' · ')}</Detail>
          <Detail label="Daily Driver check">{asset.dailyDriverRequiredBool === false ? 'Not required' : nameOf(asset.checkSheetRel as LookupValue[]) || yesNo(asset.dailyDriverRequiredBool)}</Detail>
        </Section>
        <Section title="Hire and finance">
          <Detail label="Bookable">{asset.bookableBool === false ? <Badge>Not bookable</Badge> : asset.bookableBool ? 'Yes' : ''}</Detail>
          <Detail label="Longest booking">{asset.maxBookingHours ? `${asset.maxBookingHours} hours` : ''}</Detail>
          <Detail label="Hire rates">{[asset.hireRateHourly ? `${formatMoney(asset.hireRateHourly, 0)}/h` : '', asset.hireRateDaily ? `${formatMoney(asset.hireRateDaily, 0)}/day` : ''].filter(Boolean).join(' · ')}</Detail>
          <Detail label="Purchased">{[formatDate(asset.purchaseDate), asset.purchasePrice ? formatMoney(asset.purchasePrice, 0) : ''].filter(Boolean).join(' · ')}</Detail>
          <Detail label="Current value">{asset.currentValue ? formatMoney(asset.currentValue, 0) : ''}</Detail>
          <Detail label="Financial class">{asset.financialClass}</Detail>
        </Section>
      </div>
      <LocationCard asset={asset} />
    </div>
  );
}

function LocationCard({ asset }: { asset: Asset }) {
  const sites = useSites();
  const marker = useMemo(() => assetMarker(asset), [asset]);
  const home = first(asset.locationRel);
  const areas = useMemo(() => siteAreas(sites.data?.filter((s) => s.documentId === home?.documentId)), [sites.data, home?.documentId]);
  const markers = useMemo(() => (marker ? [marker] : []), [marker]);
  const where = positionLabel(asset);
  const speed = positionSpeed(asset);
  const placed = !!pointOf(asset.locationGeo);
  return (
    <Card className="flex flex-col self-start overflow-hidden">
      <CardHeader className="pb-3">
        <div>
          <CardTitle>Location</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{placed ? 'Last known position and its home site' : 'No position recorded yet'}</p>
        </div>
        {placed && (
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/map?asset=${encodeURIComponent(asset.documentId)}`}>
              Fleet map
              <ExternalLink />
            </Link>
          </Button>
        )}
      </CardHeader>
      <MapView className="h-64 border-y border-border" markers={markers} areas={areas} fit="all" fitMaxZoom={15} cooperative labels="always" cluster={false} aria-label={`Where ${asset.assetId} is`} />
      <dl className="grid gap-3 p-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Last position</dt>
          <dd className="text-right">{placed ? where || 'Recorded' : '–'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Seen</dt>
          <dd className="text-right" title={formatDateTime(asset.lastPositionDate)}>
            {asset.lastPositionDate ? relative(asset.lastPositionDate) : '–'}
            {speed ? <span className="text-muted-foreground"> · {speed} km/h</span> : null}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Home site</dt>
          <dd className="text-right">{home?.name ?? '–'}</dd>
        </div>
      </dl>
    </Card>
  );
}
