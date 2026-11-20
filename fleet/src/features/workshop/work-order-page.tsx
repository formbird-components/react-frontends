// A work order: the job, who does it, its service checks (PM Service), the parts and labour, and how
// it finished. Changes are kept as a draft and saved together (with a status move, or on their own).

import { CheckCircle2, ChevronDown, ExternalLink, Loader2, PauseCircle, PlayCircle, RotateCcw, Save, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { toast } from 'sonner';
import { AssetIcon } from '@/components/asset-icon';
import { DateInput, NumberInput, Alert, Page, StatusBadge } from '@react-frontends/shared/components';
import { MeterField } from '@/components/meter-field';
import { LookupSelect, PersonPicker } from '@/components/pickers';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Field, PersonAvatar, Skeleton, Textarea } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { useRecord, useUpdate } from '@/data/records';
import { useSession } from '@/data/session';
import { lineTotals } from '@/domain/logic/money';
import { GST } from '@/domain/model';
import { first, nameOf, type Asset, type CheckItem, type WorkOrder, type WorkshopRequest } from '@/domain/types';
import { validateWorkOrder } from '@/domain/validate';
import { allowedMove } from '@/domain/workflow';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { ChecklistProgress, ChecklistView } from '@/features/checks/checklist-view';
import { passRemaining } from '@/features/checks/checklist';
import { RecordError } from './record-error';
import { BackLink } from './back-link';
import { createdAt } from './board';
import { changedFields, hasChanges } from './edits';
import { LineItemsEditor } from './line-items';
import { cleanLines, lineProblems, type Line } from './lines';
import { serviceChecksFor } from './new-work-order-dialog';
import { statusValue } from './request';

const EDIT_KEYS: (keyof WorkOrder)[] = ['workOrderTypeRel', 'assignedToRel', 'estimatedLabourHours', 'serviceChecksArr', 'lineItemsArr', 'meterAtServiceNum', 'dateAtService', 'workCompleted', 'technicianReport', 'onHoldReason'];

const statusOfWo = (w: Pick<WorkOrder, 'workOrderStatusRel'>) => nameOf(w.workOrderStatusRel);

/** A move as an action. */
const WO_MOVES: Record<string, { to: string; label: string; icon: typeof PlayCircle }[]> = {
  New: [{ to: 'In Progress', label: 'Start work', icon: PlayCircle }],
  'In Progress': [
    { to: 'Complete', label: 'Complete', icon: CheckCircle2 },
    { to: 'On Hold', label: 'Put on hold', icon: PauseCircle },
  ],
  'On Hold': [{ to: 'In Progress', label: 'Resume work', icon: PlayCircle }],
  Complete: [{ to: 'In Progress', label: 'Reopen', icon: RotateCcw }],
};

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{children}</div>
    </div>
  );
}

function WorkOrderSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-4 h-4 w-24" />
      <Skeleton className="mb-2 h-8 w-80" />
      <Skeleton className="mb-6 h-4 w-48" />
      <Skeleton className="mb-6 h-16 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </Page>
  );
}

export function WorkOrderPage() {
  const { id } = useParams();
  const { who } = useSession();
  const record = useRecord<WorkOrder>(id);
  const wo = record.data;
  const requestRef = first(wo?.requestRel);
  const request = useRecord<WorkshopRequest>(requestRef?.documentId);
  const assetRef = first(wo?.assetRel) ?? first(requestRef?.assetRel);
  const asset = useRecord<Asset>(assetRef?.documentId);
  const statuses = useLookup('workOrderStatus');
  const update = useUpdate<WorkOrder>('workOrder');

  const [draft, setDraft] = useState<Partial<WorkOrder>>({});
  const [moveTo, setMoveTo] = useState<string>();
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [error, setError] = useState('');

  const value: WorkOrder | undefined = wo ? { ...wo, ...draft } : undefined;
  const changes = useMemo(() => (wo && value ? changedFields(wo, value, EDIT_KEYS) : {}), [wo, value]);
  const dirty = hasChanges(changes);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  // A PM Service with no checks yet gets its asset's service plan tasks.
  const type = nameOf(value?.workOrderTypeRel);
  const checksEmpty = !(value?.serviceChecksArr ?? []).length;
  const status = value ? statusOfWo(value) : '';
  const editable = who.isWorkshop && status !== 'Complete';
  useEffect(() => {
    if (type !== 'PM Service' || !checksEmpty || !editable || !asset.data) return;
    let cancelled = false;
    setLoadingChecks(true);
    serviceChecksFor(asset.data)
      .then((checks) => {
        if (!cancelled && checks.length) setDraft((d) => ({ ...d, serviceChecksArr: checks }));
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoadingChecks(false));
    return () => {
      cancelled = true;
    };
  }, [type, checksEmpty, editable, asset.data]);

  if (record.isPending) return <WorkOrderSkeleton />;
  if (record.isError || !wo || !value)
    return <RecordError icon={Wrench} noun="Work order" error={record.error} onRetry={() => void record.refetch()} backTo="/workshop" backLabel="Workshop" />;

  const set = (patch: Partial<WorkOrder>) => {
    setError('');
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setLines = (fn: (lines: Line[]) => Line[]) => {
    setError('');
    setDraft((d) => ({ ...d, lineItemsArr: fn((d.lineItemsArr ?? wo.lineItemsArr ?? []) as Line[]) }));
  };
  const setChecks = (fn: (items: CheckItem[]) => CheckItem[]) => {
    setError('');
    setDraft((d) => ({ ...d, serviceChecksArr: fn(d.serviceChecksArr ?? wo.serviceChecksArr ?? []) }));
  };
  const lines = (value.lineItemsArr ?? []) as Line[];
  const checks = value.serviceChecksArr ?? [];
  const pm = type === 'PM Service';
  const totals = lineTotals(lines, GST);
  const unit = assetRef?.primaryMeterUnit ?? asset.data?.primaryMeterUnit;

  /** Saves the draft, optionally with a new status and more fields; checks it first as the server will. */
  const save = async (to?: string, extra: Partial<WorkOrder> = {}, inDialog = false): Promise<boolean> => {
    setError('');
    const target = to ? statuses.data?.find((s) => s.name === to) : undefined;
    if (to && !target) {
      setError('The work order statuses are still loading. Try again in a moment.');
      return false;
    }
    const merged: Partial<WorkOrder> = { ...value, ...extra, lineItemsArr: cleanLines(lines), lastStatus: status, ...(target ? { workOrderStatusRel: [statusValue(target)] } : {}) };
    const problems = lineProblems(lines);
    const message = problems[0] ?? validateWorkOrder(merged, who);
    if (message) {
      setError(message);
      if (!inDialog) toast.error(message);
      return false;
    }
    const fields: Partial<WorkOrder> = { ...changedFields(wo, merged, EDIT_KEYS), workOrderStatusRel: merged.workOrderStatusRel };
    if (fields.lineItemsArr) fields.lineItemsArr = cleanLines(fields.lineItemsArr as Line[]);
    try {
      await update.mutateAsync({ documentId: wo.documentId, fields: fields as Record<string, unknown> });
      setDraft({});
      toast.success(to ? `${wo.workOrderRef ?? 'Work order'} is ${to === 'Complete' ? 'complete' : `now ${to}`}` : `${wo.workOrderRef ?? 'Work order'} saved`, {
        description: to === 'Complete' ? 'Parts used come out of stock.' : to === 'In Progress' && status === 'New' ? 'The request moves to In Progress with it.' : undefined,
      });
      return true;
    } catch (err) {
      setError((err as Error).message);
      if (!inDialog) toast.error((err as Error).message);
      return false;
    }
  };

  const moves = (WO_MOVES[status] ?? []).map((m) => {
    let reason = '';
    if (!who.isWorkshop) reason = 'Only the workshop can move a work order.';
    else if (!allowedMove('workOrderStatus', status, m.to)) reason = `A work order can't go from ${status} to ${m.to}.`;
    else if (status === 'Complete' && !who.isSupervisor) reason = 'Only a workshop supervisor can reopen a completed work order.';
    return { ...m, ok: !reason, reason };
  });
  const primary = moves.find((m) => m.ok);
  const startMove = (to: string) => {
    if (to === 'Complete' || to === 'On Hold') return setMoveTo(to);
    void save(to);
  };

  return (
    <Page>
      <BackLink to={requestRef ? `/workshop/requests/${requestRef.documentId}` : '/workshop'} history>
        {requestRef?.requestRef ?? request.data?.requestRef ?? 'Request'}
      </BackLink>

      <div className="mb-5 flex flex-wrap items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Wrench className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {wo.workOrderRef} <span className="text-muted-foreground">·</span> {type || 'Work order'}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge value={wo.workOrderStatusRel} />
            <span>
              on{' '}
              {requestRef ? (
                <Link to={`/workshop/requests/${requestRef.documentId}`} className="font-medium text-foreground hover:underline">
                  {requestRef.requestRef ?? requestRef.name}
                </Link>
              ) : (
                'a request'
              )}
              {createdAt(wo) && <> · created {relative(createdAt(wo))}</>}
            </span>
          </div>
        </div>
        {who.isWorkshop && (primary || moves.length > 0) && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {primary && (
              <Button onClick={() => startMove(primary.to)} disabled={update.isPending} className="flex-1 sm:flex-none">
                {update.isPending ? <Loader2 className="animate-spin" /> : <primary.icon />}
                {primary.label}
              </Button>
            )}
            {moves.filter((m) => m !== primary).length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    More
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64">
                  {moves
                    .filter((m) => m !== primary)
                    .map((m) => (
                      <DropdownMenuItem key={m.to} disabled={!m.ok} onSelect={() => startMove(m.to)} className="items-start">
                        <m.icon />
                        <div>
                          <div>{m.label}</div>
                          {!m.ok && <div className="text-xs text-muted-foreground">{m.reason}</div>}
                        </div>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      <Card className="mb-6 grid grid-cols-2 divide-border max-sm:[&>*:nth-child(n+3)]:border-t sm:grid-cols-4 sm:divide-x">
        <Stat label="Asset">
          {assetRef ? (
            <Link to={`/assets/${assetRef.documentId}`} className="inline-flex items-center gap-2 hover:underline">
              <AssetIcon kind={assetRef.iconKind} size={20} />
              {assetRef.assetId}
            </Link>
          ) : (
            '–'
          )}
        </Stat>
        <Stat label="Assigned to">
          {first(value.assignedToRel) ? (
            <span className="inline-flex items-center gap-2">
              <PersonAvatar name={nameOf(value.assignedToRel)} size={20} />
              {nameOf(value.assignedToRel)}
            </span>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </Stat>
        <Stat label="Labour">
          <span className={cn('tabular', value.estimatedLabourHours && totals.labourHours > value.estimatedLabourHours && 'text-[color-mix(in_oklab,var(--warning)_75%,var(--foreground))]')}>
            {totals.labourHours.toLocaleString('en-AU', { maximumFractionDigits: 2 })} h
          </span>
          {value.estimatedLabourHours ? <span className="text-muted-foreground"> of {value.estimatedLabourHours.toLocaleString('en-AU', { maximumFractionDigits: 2 })} h est.</span> : null}
        </Stat>
        <Stat label="Total incl. GST">
          <span className="tabular">{formatMoney(totals.total)}</span>
        </Stat>
      </Card>

      {status === 'On Hold' && wo.onHoldReason && (
        <Alert tone="warning" className="mb-6">
          <span className="font-medium">On hold:</span> {wo.onHoldReason}
        </Alert>
      )}
      {status === 'Complete' && (
        <Alert tone="info" className="mb-6">
          Completed {formatDateTime(wo.completedDate)}. {who.isSupervisor ? 'Reopen it to change anything.' : 'A workshop supervisor can reopen it.'}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          {pm && (
            <Card>
              <CardHeader className="flex-col items-stretch">
                <div>
                  <CardTitle>Service checks</CardTitle>
                  <CardDescription>{nameOf(asset.data?.servicePlanRel ?? assetRef?.servicePlanRel) || 'The service plan'}: every task answered to complete.</CardDescription>
                </div>
                {checks.length > 0 && <ChecklistProgress items={checks} onPassRest={editable ? () => setChecks(passRemaining) : undefined} />}
              </CardHeader>
              <CardContent>
                {loadingChecks ? (
                  <div className="grid gap-2">
                    <Skeleton className="h-14" />
                    <Skeleton className="h-14" />
                  </div>
                ) : checks.length ? (
                  <ChecklistView items={checks} onChange={setChecks} readOnly={!editable} />
                ) : (
                  <p className="text-sm text-muted-foreground">This asset has no service plan, so there are no service checks.</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Parts and labour</CardTitle>
                <CardDescription>Parts used come out of stock when the work order is completed.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <LineItemsEditor lines={lines} onChange={setLines} readOnly={!editable} problems={editable ? lineProblems(lines) : []} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Completion</CardTitle>
                <CardDescription>{pm ? 'A PM Service needs the date and meter at service; completing it reschedules the asset’s next service.' : 'What was done, for the record.'}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date at service" htmlFor="wo-date" required={pm} className="content-start">
                  <DateInput id="wo-date" value={value.dateAtService ?? undefined} onChange={(v) => set({ dateAtService: v })} disabled={!editable} />
                </Field>
                <Field label="Meter at service" htmlFor="wo-meter" required={pm} className="content-start">
                  <MeterField id="wo-meter" value={value.meterAtServiceNum} onChange={(v) => set({ meterAtServiceNum: v ?? undefined })} unit={unit} assetMeter={asset.data?.meterReadingNum} assetMeterDate={asset.data?.meterReadingDate} maxIncrease={3000} disabled={!editable} />
                </Field>
              </div>
              <Field label="Work completed" htmlFor="wo-done" required={status === 'Complete'} hint="Needed to complete.">
                <Textarea id="wo-done" rows={3} value={value.workCompleted ?? ''} onChange={(e) => set({ workCompleted: e.target.value })} disabled={!editable} placeholder="e.g. Front pads replaced; discs within tolerance; road tested." />
              </Field>
              <Field label="Technician’s report" htmlFor="wo-report">
                <Textarea id="wo-report" rows={4} value={value.technicianReport ?? ''} onChange={(e) => set({ technicianReport: e.target.value })} disabled={!editable} placeholder="Findings, recommendations, follow-up work…" />
              </Field>
              {(status === 'On Hold' || !!value.onHoldReason) && (
                <Field label="Reason on hold" htmlFor="wo-hold" required={status === 'On Hold'}>
                  <Textarea id="wo-hold" rows={2} value={value.onHoldReason ?? ''} onChange={(e) => set({ onHoldReason: e.target.value })} disabled={!editable} />
                </Field>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Job</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Type" htmlFor="wo-type">
                <LookupSelect id="wo-type" kind="workOrderType" value={first(value.workOrderTypeRel)} onChange={(v) => set({ workOrderTypeRel: [v] })} disabled={!editable} />
              </Field>
              <Field label="Assigned to" htmlFor="wo-assignee">
                <PersonPicker id="wo-assignee" types={['Administrator', 'Supervisor', 'Technician']} value={first(value.assignedToRel)} onChange={(p) => set({ assignedToRel: p ? [p] : [] })} placeholder="Unassigned" clearable disabled={!editable} />
              </Field>
              <Field label="Estimated labour" htmlFor="wo-estimate">
                <NumberInput id="wo-estimate" value={value.estimatedLabourHours} onValueChange={(v) => set({ estimatedLabourHours: v ?? undefined })} suffix="h" disabled={!editable} />
              </Field>
              <dl className="grid gap-2 border-t border-border pt-4 text-sm">
                {[
                  ['Request', requestRef ? <Link key="r" to={`/workshop/requests/${requestRef.documentId}`} className="inline-flex items-center gap-1 text-primary hover:underline">{requestRef.requestRef}<ExternalLink className="size-3" /></Link> : '–'],
                  ['Request status', request.data ? <StatusBadge key="s" value={request.data.requestStatusRel} /> : <Skeleton key="k" className="h-5 w-20" />],
                  ['Started', formatDateTime(wo.startedDate) || '–'],
                  ['Completed', formatDateTime(wo.completedDate) || '–'],
                ].map(([label, content]) => (
                  <div key={label as string} className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right">{content}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {editable && dirty && (
        <div className="sticky bottom-4 z-30 mt-6 flex justify-center px-2">
          <div className="flex w-full max-w-xl items-center gap-3 rounded-xl border border-border bg-popover px-4 py-2.5 shadow-pop animate-in">
            <span className={cn('size-2 shrink-0 rounded-full', error && !moveTo ? 'bg-danger' : 'bg-warning')} />
            <span role={error && !moveTo ? 'alert' : undefined} title={error && !moveTo ? error : undefined} className={cn('min-w-0 flex-1 truncate text-sm', error && !moveTo && 'font-medium text-danger')}>
              {error && !moveTo ? error : 'Unsaved changes'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft({});
                setError('');
              }}
            >
              Discard
            </Button>
            <Button size="sm" onClick={() => void save(undefined, {}, true)} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          </div>
        </div>
      )}

      <MoveDialog
        to={moveTo}
        workOrder={value}
        pm={pm}
        unit={unit}
        asset={asset.data}
        pending={update.isPending}
        error={error}
        onOpenChange={(o) => {
          if (!o) {
            setMoveTo(undefined);
            setError('');
          }
        }}
        onConfirm={async (extra) => {
          if (await save(moveTo, extra, true)) setMoveTo(undefined);
        }}
        onChange={set}
      />

      <Dialog open={blocker.state === 'blocked'} onOpenChange={(o) => !o && blocker.reset?.()}>
        <DialogContent title="Leave without saving?" description={`Your changes to ${wo.workOrderRef ?? 'this work order'} haven’t been saved.`}>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Stay
            </Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

/** Completing (what was done; for a PM Service the date and meter) or holding (why). */
function MoveDialog({
  to,
  workOrder,
  pm,
  unit,
  asset,
  pending,
  error,
  onOpenChange,
  onConfirm,
  onChange,
}: {
  to: string | undefined;
  workOrder: WorkOrder;
  /** Completion details go into the work order's draft as they're typed (kept if the dialog closes). */
  onChange: (patch: Partial<WorkOrder>) => void;
  pm: boolean;
  unit?: 'km' | 'hours' | null;
  asset?: Asset;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (extra: Partial<WorkOrder>) => void;
}) {
  const [reason, setReason] = useState('');
  const completing = to === 'Complete';
  useEffect(() => {
    if (to === 'On Hold') setReason('');
    // A PM Service is usually completed the day it's done.
    if (to === 'Complete' && pm && !workOrder.dateAtService) onChange({ dateAtService: new Date().toISOString() });
  }, [to]); // only when the dialog opens: the draft keeps changing behind it
  const done = workOrder.workCompleted ?? '';
  const date = workOrder.dateAtService ?? undefined;
  const meter = workOrder.meterAtServiceNum ?? null;
  return (
    <Dialog open={!!to} onOpenChange={onOpenChange}>
      <DialogContent
        title={completing ? `Complete ${workOrder.workOrderRef ?? 'the work order'}` : `Put ${workOrder.workOrderRef ?? 'the work order'} on hold`}
        description={completing ? 'Record what was done. Parts on it come out of stock; the request moves to Work Complete when this is its last open work order.' : 'Say what it’s waiting for.'}
        wide={completing && pm}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(completing ? { workCompleted: done.trim() } : { onHoldReason: reason.trim() });
          }}
        >
          {completing ? (
            <>
              <Field label="Work completed" htmlFor="complete-done" required>
                <Textarea id="complete-done" autoFocus rows={3} value={done} onChange={(e) => onChange({ workCompleted: e.target.value })} placeholder="e.g. Front pads replaced; road tested." />
              </Field>
              {pm && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date at service" htmlFor="complete-date" required className="content-start">
                    <DateInput id="complete-date" value={date} onChange={(v) => onChange({ dateAtService: v })} />
                  </Field>
                  <Field label="Meter at service" htmlFor="complete-meter" required className="content-start">
                    <MeterField id="complete-meter" value={meter} onChange={(v) => onChange({ meterAtServiceNum: v ?? undefined })} unit={unit} assetMeter={asset?.meterReadingNum} assetMeterDate={asset?.meterReadingDate} maxIncrease={3000} />
                  </Field>
                </div>
              )}
            </>
          ) : (
            <Field label="Reason on hold" htmlFor="hold-reason" required>
              <Textarea id="hold-reason" autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Waiting for a fuel filter (ordered)" />
            </Field>
          )}
          {error && <Alert>{error}</Alert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {completing ? 'Complete work order' : 'Put on hold'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
