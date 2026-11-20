// One Daily Driver: who checked what and when, the meter, every check's answer, the defect, and the
// workshop requests it raised. Submitted checks don't change.

import { AlertTriangle, ClipboardCheck, ExternalLink, Wrench } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { Alert, Page, StatusBadge } from '@react-frontends/shared/components';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PersonAvatar, Skeleton } from '@react-frontends/shared/ui';
import { useRecord } from '@/data/records';
import { checklistOutcome } from '@/domain/logic/checklist';
import { first, nameOf, type DailyDriver } from '@/domain/types';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { formatMeter } from '@/lib/format';
import { RecordError } from '@/features/workshop/record-error';
import { BackLink } from '@/features/workshop/back-link';
import { URGENT } from '@/features/workshop/board';
import { UrgentBadge } from '@/features/workshop/request-card';
import { ChecklistView } from './checklist-view';
import { failures } from './checklist';
import { ResultBadge } from './checks-page';
import { useRaisedRequests } from './data';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{children}</div>
    </div>
  );
}

export function CheckPage() {
  const { id } = useParams();
  const record = useRecord<DailyDriver>(id);
  const raised = useRaisedRequests(id);
  const check = record.data;

  if (record.isPending)
    return (
      <Page className="max-w-5xl">
        <Skeleton className="mb-4 h-4 w-24" />
        <Skeleton className="mb-6 h-9 w-80" />
        <Skeleton className="mb-6 h-16 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </Page>
    );
  if (record.isError || !check)
    return <RecordError icon={ClipboardCheck} noun="Check" error={record.error} onRetry={() => void record.refetch()} backTo="/checks" backLabel="Daily Driver" />;

  const asset = first(check.assetRel);
  const items = check.checksArr ?? [];
  const outcome = checklistOutcome(items);
  const failed = failures(items);
  const requests = raised.data?.documents ?? [];

  return (
    <Page className="max-w-5xl">
      <BackLink to="/checks" history>
        Daily Driver
      </BackLink>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <AssetIcon kind={asset?.iconKind} size={48} className="rounded-xl" color={failed.length ? 'var(--danger)' : 'var(--success)'} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {check.ddRef} <span className="text-muted-foreground">·</span> {asset?.assetId} <span className="font-normal text-muted-foreground">{asset?.name?.split(' · ')[1]}</span>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <ResultBadge check={check} />
            <span>
              by {nameOf(check.driverRel)} · {relative(check.checkDate)}
            </span>
          </div>
        </div>
        {asset && (
          <Button asChild variant="outline">
            <Link to={`/checks/new?asset=${asset.documentId}`}>
              <ClipboardCheck />
              Check it again
            </Link>
          </Button>
        )}
      </div>

      <Card className="mb-6 grid grid-cols-2 divide-border max-sm:[&>*:nth-child(n+3)]:border-t sm:grid-cols-4 sm:divide-x">
        <Stat label="Asset">
          {asset ? (
            <Link to={`/assets/${asset.documentId}`} className="inline-flex items-center gap-1.5 hover:underline">
              {asset.assetId}
              <ExternalLink className="size-3 text-muted-foreground" />
            </Link>
          ) : (
            '–'
          )}
        </Stat>
        <Stat label="Driver">
          <span className="inline-flex items-center gap-2">
            <PersonAvatar name={nameOf(check.driverRel)} size={20} />
            {nameOf(check.driverRel)}
          </span>
        </Stat>
        <Stat label="Checked">{formatDateTime(check.checkDate)}</Stat>
        <Stat label="Meter">{formatMeter(check.meterReadingNum, asset?.primaryMeterUnit) || '–'}</Stat>
      </Card>

      {check.meterExcludedBool && (
        <Alert tone="warning" className="mb-6">
          {check.meterExcludedReason || 'The meter reading was flagged'}. The reading is kept but didn’t update the asset.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Checks</CardTitle>
                <CardDescription>
                  {outcome.passed} passed{outcome.failed ? `, ${outcome.failed} failed` : ''}
                  {outcome.na ? `, ${outcome.na} not applicable` : ''} of {outcome.total}
                  {nameOf(asset?.checkSheetRel) && ` · ${nameOf(asset?.checkSheetRel)}`}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>{items.length ? <ChecklistView items={items} readOnly /> : <p className="text-sm text-muted-foreground">No checks were recorded.</p>}</CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-6">
          {failed.length > 0 && (
            <Card className="border-danger/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-danger" />
                  Defect
                </CardTitle>
                {nameOf(check.defectPriorityRel) === URGENT ? <UrgentBadge /> : nameOf(check.defectPriorityRel) && <Badge>Non-urgent</Badge>}
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p className="whitespace-pre-wrap">{check.defectDescription || <span className="text-muted-foreground">No description.</span>}</p>
                <dl className="grid gap-1.5 border-t border-border pt-3">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Service requested</dt>
                    <dd>{check.serviceRequested || '–'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Inspection complete</dt>
                    <dd>{check.inspectionCompleteBool ? 'Yes' : 'No'}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}
          {(failed.length > 0 || requests.length > 0) && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Workshop requests</CardTitle>
                  <CardDescription>Raised from this check.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2">
                {raised.isPending ? (
                  <Skeleton className="h-14" />
                ) : requests.length ? (
                  requests.map((r) => (
                    <Link key={r.documentId} to={`/workshop/requests/${r.documentId}`} className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Wrench className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium whitespace-nowrap">{r.requestRef}</span>
                          <span className="ml-auto">
                            <StatusBadge value={r.requestStatusRel} />
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{nameOf(r.requestTypeRel)}</span>
                          {nameOf(r.priorityRel) === URGENT && <UrgentBadge />}
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">None found yet. The server raises one when a check fails.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
