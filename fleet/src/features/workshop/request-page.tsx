// One workshop request: where it stands, what the person may do next, the details (editable by the
// workshop), its work orders, where it came from and what has happened to it.

import {
  Check,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  MessageSquare,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  UserRoundCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { AssetIcon } from '@/components/asset-icon';
import { DateTimeInput, Markdown, Alert, Page, StatusBadge } from '@react-frontends/shared/components';
import { LookupSelect, PersonPicker } from '@/components/pickers';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Field, PersonAvatar, Segmented, Select, SheetContent, Skeleton, Switch, Textarea, Tip } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { useRecord, useUpdate } from '@/data/records';
import { useSession } from '@/data/session';
import { first, nameOf, type Asset, type LookupValue, type PersonValue, type WorkshopRequest } from '@/domain/types';
import { validateRequest } from '@/domain/validate';
import { STATUS_ORDER } from '@/domain/workflow';
import { newId } from '@react-frontends/shared/api';
import { formatDateTime, hours, relative } from '@react-frontends/shared/format';
import { formatMeter, formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { RecordError } from './record-error';
import { BackLink } from './back-link';
import { createdAt, isDone, isUrgent, moveLabel, movesFor, primaryMove, statusOf } from './board';
import { useMoveRequest, useWorkOrdersOf, useWorkshops, WORKSHOP_TYPES } from './data';
import { changedFields, hasChanges } from './edits';
import { MoveDialog } from './move-dialog';
import { NewWorkOrderDialog } from './new-work-order-dialog';
import { UrgentBadge } from './request-card';
import { DISABLE_BOOKING, notesOf, requestTimeline } from './request';

/** Saves some fields of a request (with its status, unchanged), checked first the way the server will. */
function useSaveRequest(request: WorkshopRequest | undefined) {
  const { who } = useSession();
  const update = useUpdate<WorkshopRequest>('request');
  const save = async (changes: Partial<WorkshopRequest>, success: string) => {
    if (!request) return false;
    const message = validateRequest({ ...request, ...changes, lastStatus: statusOf(request) }, who);
    if (message) {
      toast.error(message);
      return false;
    }
    try {
      await update.mutateAsync({ documentId: request.documentId, fields: { ...changes, requestStatusRel: request.requestStatusRel } });
      toast.success(success);
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
  };
  return { save, pending: update.isPending };
}

/** Pending → … → Closed, with where the request is. */
function StatusTrack({ request }: { request: WorkshopRequest }) {
  const statuses = useLookup('requestStatus').data ?? [];
  const current = statusOf(request);
  const steps = STATUS_ORDER.requestStatus.filter((s) => s !== 'Cancelled');
  const at = steps.indexOf(current);
  if (current === 'Cancelled') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-sm">
        <XCircle className="size-4 text-muted-foreground" />
        <span>
          Cancelled {request.closedDate && <span className="text-muted-foreground">{relative(request.closedDate)}</span>}
          {nameOf(request.closeReasonRel) && <span className="text-muted-foreground"> · {nameOf(request.closeReasonRel)}</span>}
        </span>
      </div>
    );
  }
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Progress">
      {steps.map((step, i) => {
        const color = statuses.find((s) => s.name === step)?.color ?? 'var(--primary)';
        // Drop Off is optional (Open goes straight to In Progress): skipped unless the request has a drop-off date.
        const skipped = i < at && step === 'Drop Off' && !request.dropOffDate;
        const done = i < at && !skipped;
        const here = i === at;
        return (
          <li key={step} className="flex min-w-0 shrink-0 items-center gap-1" aria-current={here ? 'step' : undefined}>
            {i > 0 && <span className={cn('h-px w-3 sm:w-6', i <= at ? 'bg-foreground/30' : 'bg-border')} />}
            <span
              className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap', here ? 'text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/60', skipped && 'line-through decoration-muted-foreground/40')}
              title={skipped ? 'Skipped' : undefined}
              style={here ? { backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color: `color-mix(in oklab, ${color} 80%, var(--foreground))` } : undefined}
            >
              {done ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full" style={{ backgroundColor: here ? color : 'currentColor' }} />}
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children || <span className="text-muted-foreground">–</span>}</dd>
    </div>
  );
}

function Person({ value }: { value?: PersonValue }) {
  if (!value) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <PersonAvatar name={value.name} size={22} />
      <span className="truncate">{value.name}</span>
    </span>
  );
}

const LOCKED = (r: WorkshopRequest) => isDone(r);

/** The details, as the workshop (or the person who asked) changes them. */
function EditSheet({ request, open, onOpenChange }: { request: WorkshopRequest; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { who } = useSession();
  const { workshops } = useWorkshops();
  const { save, pending } = useSaveRequest(request);
  const [draft, setDraft] = useState<Partial<WorkshopRequest>>({});
  const [error, setError] = useState('');
  const value = { ...request, ...draft };
  const set = (patch: Partial<WorkshopRequest>) => setDraft((d) => ({ ...d, ...patch }));
  const keys: (keyof WorkshopRequest)[] = ['requestTypeRel', 'priorityRel', 'requestReasonRel', 'reqDescription', ...(who.isWorkshop ? (['workshopRel', 'assignedToRel', 'expectedStartDate', 'expectedCompletionDate', 'disableBooking', 'deferredBool', 'deferredReason'] as const) : [])];
  const changes = changedFields(request, value, keys);

  const submit = async () => {
    setError('');
    if (!String(value.reqDescription ?? '').trim()) return setError('Describe the fault.');
    if (value.expectedStartDate && value.expectedCompletionDate && new Date(value.expectedCompletionDate) <= new Date(value.expectedStartDate)) return setError('The expected completion must be after the start.');
    if (value.deferredBool && !String(value.deferredReason ?? '').trim()) return setError('Give the Reason Deferred.');
    if (!hasChanges(changes)) return onOpenChange(false);
    if (await save(changes, `${request.requestRef ?? 'Request'} saved`)) {
      setDraft({});
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setDraft({});
        setError('');
        onOpenChange(o);
      }}
    >
      <SheetContent title={`Edit ${request.requestRef ?? 'request'}`} description="Only what you change is saved.">
        <form
          className="grid gap-5 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Request type" htmlFor="edit-type">
              <LookupSelect id="edit-type" kind="requestType" value={first(value.requestTypeRel)} onChange={(v) => set({ requestTypeRel: [v] })} />
            </Field>
            <Field label="Priority" htmlFor="edit-priority">
              <LookupSelect id="edit-priority" kind="requestPriority" value={first(value.priorityRel)} onChange={(v) => set({ priorityRel: [v] })} />
            </Field>
            <Field label="Reason" htmlFor="edit-reason" className="sm:col-span-2">
              <LookupSelect id="edit-reason" kind="requestReason" value={first(value.requestReasonRel)} onChange={(v: LookupValue) => set({ requestReasonRel: [v] })} placeholder="Choose a reason" />
            </Field>
          </div>
          <Field label="Description" htmlFor="edit-description" required>
            <Textarea id="edit-description" rows={6} value={value.reqDescription ?? ''} onChange={(e) => set({ reqDescription: e.target.value })} />
          </Field>
          {who.isWorkshop && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Workshop" htmlFor="edit-workshop">
                  <Select
                    id="edit-workshop"
                    value={first(value.workshopRel)?.documentId}
                    onChange={(id) => {
                      const w = workshops.find((x) => x.documentId === id);
                      if (w) set({ workshopRel: [w] });
                    }}
                    options={workshops.map((w) => ({ value: w.documentId, label: w.name }))}
                    placeholder="Choose a workshop"
                  />
                </Field>
                <Field label="Assigned to" htmlFor="edit-assignee">
                  <PersonPicker id="edit-assignee" types={WORKSHOP_TYPES} value={first(value.assignedToRel)} onChange={(p) => set({ assignedToRel: p ? [p] : [] })} placeholder="Unassigned" clearable />
                </Field>
                <Field label="Expected start" htmlFor="edit-start">
                  <DateTimeInput id="edit-start" value={value.expectedStartDate ?? undefined} onChange={(v) => set({ expectedStartDate: v })} />
                </Field>
                <Field label="Expected completion" htmlFor="edit-end">
                  <DateTimeInput id="edit-end" value={value.expectedCompletionDate ?? undefined} onChange={(v) => set({ expectedCompletionDate: v })} />
                </Field>
              </div>
              <Field label="Booking while it’s open" hint={DISABLE_BOOKING.find((d) => d.value === (value.disableBooking || 'Auto Disable'))?.hint}>
                <Segmented value={value.disableBooking || 'Auto Disable'} onChange={(v) => set({ disableBooking: v })} options={DISABLE_BOOKING.map((d) => ({ value: d.value, label: d.label }))} className="w-fit" />
              </Field>
              <div className="grid gap-3 rounded-lg border border-border p-3.5">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-medium">Deferred</span>
                    <span className="block text-xs text-muted-foreground">Parked for now (waiting on parts, the driver, approval…).</span>
                  </span>
                  <Switch checked={!!value.deferredBool} onCheckedChange={(c) => set({ deferredBool: c })} />
                </label>
                {value.deferredBool && (
                  <Field label="Reason deferred" htmlFor="edit-deferred" required>
                    <Textarea id="edit-deferred" rows={2} value={value.deferredReason ?? ''} onChange={(e) => set({ deferredReason: e.target.value })} />
                  </Field>
                )}
              </div>
            </>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}

function DeferDialog({ request, open, onOpenChange }: { request: WorkshopRequest; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { save, pending } = useSaveRequest(request);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setReason(request.deferredReason ?? '');
    setError('');
  }, [open, request.deferredReason]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Defer ${request.requestRef ?? 'the request'}`} description="Park it and say why. It stays in its column, at the bottom.">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reason.trim()) return setError('Give the Reason Deferred.');
            if (await save({ deferredBool: true, deferredReason: reason.trim() }, `${request.requestRef ?? 'Request'} deferred`)) onOpenChange(false);
          }}
        >
          <Field label="Reason deferred" htmlFor="defer-reason" required error={error}>
            <Textarea id="defer-reason" autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Waiting for a fuel filter (ordered)" aria-invalid={!!error || undefined} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Defer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Activity({ request }: { request: WorkshopRequest }) {
  const { me } = useSession();
  const { save, pending } = useSaveRequest(request);
  const [text, setText] = useState('');
  const entries = requestTimeline(request).reverse();
  const post = async () => {
    const detail = text.trim();
    if (!detail || !me) return;
    const note = { dataId: newId(), detail, createdBy: { documentId: me.documentId, name: me.name }, createdDate: new Date().toISOString() };
    if (await save({ notesCommentsArr: [...notesOf(request), note] } as Partial<WorkshopRequest>, 'Comment added')) setText('');
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void post();
            }}
            rows={2}
            placeholder="Add a comment for the workshop and the requester…"
            aria-label="Comment"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter to post</span>
            <Button type="submit" size="sm" disabled={!text.trim() || pending}>
              {pending ? <Loader2 className="animate-spin" /> : <MessageSquare />}
              Comment
            </Button>
          </div>
        </form>
        <ol className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-border">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative grid grid-cols-[24px_1fr] gap-3">
              <span className="relative z-10 flex size-6 items-center justify-center rounded-full bg-card ring-4 ring-card">
                {e.kind === 'note' ? (
                  <PersonAvatar name={e.by ?? '?'} size={24} />
                ) : (
                  <span className={cn('flex size-6 items-center justify-center rounded-full', e.kind === 'raised' ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground')}>
                    {e.kind === 'raised' ? <Plus className="size-3.5" /> : <Check className="size-3.5" />}
                  </span>
                )}
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{e.kind === 'note' ? e.by : e.title}</span>
                  {e.kind === 'raised' && e.by && <span className="text-muted-foreground">by {e.by}</span>}
                  <Tip content={formatDateTime(e.at)}>
                    <time dateTime={e.at} className="text-xs text-muted-foreground">
                      {relative(e.at)}
                    </time>
                  </Tip>
                </div>
                {e.detail && <p className="mt-1.5 rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{e.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function RequestSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-4 h-4 w-24" />
      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="size-12 rounded-xl" />
        <div className="grid gap-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </Page>
  );
}

export function RequestPage() {
  const { id } = useParams();
  const { who, me } = useSession();
  const record = useRecord<WorkshopRequest>(id);
  const request = record.data;
  const assetRef = first(request?.assetRel);
  const asset = useRecord<Asset>(assetRef?.documentId);
  const workOrders = useWorkOrdersOf(useMemo(() => (id ? [id] : []), [id]));
  const { move, pending: moving } = useMoveRequest();
  const { save, pending: saving } = useSaveRequest(request);
  const [prompt, setPrompt] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [deferring, setDeferring] = useState(false);
  const [newWorkOrder, setNewWorkOrder] = useState(false);

  if (record.isPending) return <RequestSkeleton />;
  if (record.isError || !request)
    return <RecordError icon={Wrench} noun="Request" error={record.error} onRetry={() => void record.refetch()} backTo="/workshop" backLabel="Workshop" />;

  const status = statusOf(request);
  const wos = workOrders.data?.documents ?? [];
  const openWos = wos.filter((w) => nameOf(w.workOrderStatusRel) !== 'Complete').map((w) => w.workOrderRef ?? 'a work order');
  const moves = who.isWorkshop ? movesFor(request, who, openWos) : [];
  const primary = who.isWorkshop ? primaryMove(request, who, openWos) : undefined;
  const others = moves.filter((m) => m.to !== primary);
  const locked = LOCKED(request);
  const canEdit = !locked && (who.isWorkshop || first(request.requestedByRel)?.documentId === me?.documentId);
  const assignee = first(request.assignedToRel);
  const dd = first(request.dailyDriverRel);
  const created = createdAt(request);

  const doMove = async (to: string) => {
    const check = moves.find((m) => m.to === to);
    if (!check?.ok) return;
    if (check.need !== 'none') return setPrompt(to);
    await move(request, to, {}, openWos);
  };

  return (
    <Page>
      <BackLink to="/workshop" history>
        Workshop
      </BackLink>

      <div className="mb-5 flex flex-wrap items-start gap-4">
        <AssetIcon kind={assetRef?.iconKind} size={48} color={isUrgent(request) ? 'var(--danger)' : undefined} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {request.requestRef} <span className="text-muted-foreground">·</span> {assetRef?.assetId} <span className="font-normal text-muted-foreground">{assetRef?.name?.split(' · ')[1]}</span>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge value={request.requestStatusRel} />
            {isUrgent(request) && <UrgentBadge />}
            {request.deferredBool && (
              <Badge tone="warning">
                <PauseCircle />
                Deferred
              </Badge>
            )}
            <span>
              {nameOf(request.requestTypeRel)} · raised by {nameOf(request.requestedByRel) || 'someone'} {created && relative(created)}
            </span>
          </div>
        </div>
        {(primary || others.length > 0 || canEdit) && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {primary && (
              <Button onClick={() => void doMove(primary)} disabled={moving} className="flex-1 sm:flex-none">
                {moving ? <Loader2 className="animate-spin" /> : <PlayCircle />}
                {moveLabel(status, primary)}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={cn(!primary && 'flex-1 sm:flex-none')}>
                  {primary ? 'More' : 'Actions'}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64">
                {others.length > 0 && <DropdownMenuLabel>Move</DropdownMenuLabel>}
                {others.map((m) => (
                  <DropdownMenuItem key={m.to} disabled={!m.ok} onSelect={() => void doMove(m.to)} className={cn('items-start', m.to === 'Cancelled' && m.ok && 'text-danger')}>
                    <div className="min-w-0">
                      <div>{moveLabel(status, m.to)}</div>
                      {!m.ok && <div className="text-xs text-muted-foreground">{m.reason}</div>}
                    </div>
                  </DropdownMenuItem>
                ))}
                {others.length > 0 && canEdit && <DropdownMenuSeparator />}
                {canEdit && (
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil />
                    Edit details
                  </DropdownMenuItem>
                )}
                {who.isWorkshop && !locked && assignee?.documentId !== me?.documentId && me && (
                  <DropdownMenuItem onSelect={() => void save({ assignedToRel: [me] }, `${request.requestRef ?? 'Request'} assigned to you`)}>
                    <UserRoundCheck />
                    Assign to me
                  </DropdownMenuItem>
                )}
                {who.isWorkshop && !locked && (
                  <DropdownMenuItem onSelect={() => (request.deferredBool ? void save({ deferredBool: false, deferredReason: '' }, `${request.requestRef ?? 'Request'} resumed`) : setDeferring(true))}>
                    <PauseCircle />
                    {request.deferredBool ? 'Resume (no longer deferred)' : 'Defer…'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="mb-6">
        <StatusTrack request={request} />
      </div>

      {request.deferredBool && (
        <Alert tone="warning" className="mb-6">
          <span className="font-medium">Deferred:</span> {request.deferredReason}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>What’s wrong</CardTitle>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <Pencil />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-4">
              {request.reqDescription ? <Markdown text={request.reqDescription} /> : <p className="text-sm text-muted-foreground">No description.</p>}
              {dd && (
                <Link to={`/checks/${dd.documentId}`} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm transition-colors hover:bg-accent">
                  <ClipboardCheck className="size-4 text-info" />
                  <span className="min-w-0 flex-1">
                    Raised by a Daily Driver check: <span className="font-medium">{dd.name}</span>
                  </span>
                  <ExternalLink className="size-4 text-muted-foreground" />
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Work orders</CardTitle>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {wos.length ? `${wos.length - openWos.length} of ${wos.length} complete` : 'The jobs on this request, with parts and labour.'}
                </p>
              </div>
              {who.isWorkshop && !locked && (
                <Button size="sm" variant="outline" onClick={() => setNewWorkOrder(true)}>
                  <Plus />
                  New work order
                </Button>
              )}
            </CardHeader>
            <CardContent className={cn(wos.length && 'px-0 pb-2')}>
              {workOrders.isPending ? (
                <div className="grid gap-2 px-5">
                  <Skeleton className="h-12" />
                </div>
              ) : !wos.length ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No work orders yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {wos.map((w) => (
                    <li key={w.documentId}>
                      <Link to={`/workshop/work-orders/${w.documentId}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/60">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Wrench className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium">{w.workOrderRef}</span>
                            <span className="text-sm text-muted-foreground">{nameOf(w.workOrderTypeRel)}</span>
                            <StatusBadge value={w.workOrderStatusRel} />
                          </div>
                          {nameOf(w.workOrderStatusRel) === 'On Hold' && w.onHoldReason && <div className="mt-0.5 truncate text-xs text-muted-foreground">On hold: {w.onHoldReason}</div>}
                        </div>
                        {first(w.assignedToRel) && (
                          <Tip content={nameOf(w.assignedToRel)}>
                            <span>
                              <PersonAvatar name={nameOf(w.assignedToRel)} size={24} />
                            </span>
                          </Tip>
                        )}
                        <span className="hidden w-24 text-right text-sm tabular sm:block">{w.totalCost ? formatMoney(w.totalCost) : <span className="text-muted-foreground">–</span>}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Activity request={request} />
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Asset</CardTitle>
              {assetRef && (
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/assets/${assetRef.documentId}`}>
                    Open
                    <ExternalLink />
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <AssetIcon kind={assetRef?.iconKind} color={first(asset.data?.hireStatusRel)?.color} size={40} />
                <div className="min-w-0">
                  <div className="font-semibold">{assetRef?.assetId}</div>
                  <div className="truncate text-sm text-muted-foreground">{asset.data?.makeModel ?? assetRef?.name?.split(' · ')[1]}</div>
                </div>
              </div>
              <dl className="mt-3 divide-y divide-border">
                <Detail label="Hire status">{asset.data ? <StatusBadge value={asset.data.hireStatusRel} /> : <Skeleton className="h-5 w-28" />}</Detail>
                {assetRef?.registration && <Detail label="Registration">{assetRef.registration}</Detail>}
                {asset.data?.meterReadingNum !== undefined && <Detail label="Meter">{formatMeter(asset.data.meterReadingNum, asset.data.primaryMeterUnit)}</Detail>}
                {nameOf(asset.data?.locationRel) && <Detail label="Location">{nameOf(asset.data?.locationRel)}</Detail>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <Pencil />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                <Detail label="Type">{nameOf(request.requestTypeRel)}</Detail>
                <Detail label="Priority">{isUrgent(request) ? <UrgentBadge /> : nameOf(request.priorityRel)}</Detail>
                <Detail label="Reason">{nameOf(request.requestReasonRel)}</Detail>
                <Detail label="Workshop">{nameOf(request.workshopRel)}</Detail>
                <Detail label="Assigned to">
                  {assignee ? (
                    <Person value={assignee} />
                  ) : who.isWorkshop && !locked && me ? (
                    <button type="button" className="cursor-pointer text-primary hover:underline disabled:opacity-50" disabled={saving} onClick={() => void save({ assignedToRel: [me] }, `${request.requestRef ?? 'Request'} assigned to you`)}>
                      Assign to me
                    </button>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </Detail>
                <Detail label="Requested by">
                  <Person value={first(request.requestedByRel)} />
                </Detail>
                <Detail label="Expected start">{formatDateTime(request.expectedStartDate)}</Detail>
                <Detail label="Expected done">{formatDateTime(request.expectedCompletionDate)}</Detail>
                <Detail label="Booking">{DISABLE_BOOKING.find((d) => d.value === request.disableBooking)?.hint ?? request.disableBooking}</Detail>
                {request.bookingConflicts && request.bookingConflicts !== 'None' && (
                  <Detail label="Clashes">
                    <span className="text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))]">{request.bookingConflicts}</span>
                  </Detail>
                )}
              </dl>
            </CardContent>
          </Card>

          {(request.dropOffDate || request.startedDate || request.workCompleteDate || request.closedDate) && (
            <Card>
              <CardHeader>
                <CardTitle>Time in the workshop</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-border">
                  {request.dropOffDate && <Detail label="Dropped off">{formatDateTime(request.dropOffDate)}</Detail>}
                  {request.startedDate && <Detail label="Work started">{formatDateTime(request.startedDate)}</Detail>}
                  {request.workCompleteDate && <Detail label="Work complete">{formatDateTime(request.workCompleteDate)}</Detail>}
                  {request.closedDate && <Detail label={status === 'Cancelled' ? 'Cancelled' : 'Closed'}>{formatDateTime(request.closedDate)}</Detail>}
                  {typeof request.downTimeHours === 'number' && <Detail label="Downtime">{hours(request.downTimeHours)}</Detail>}
                  {nameOf(request.closeReasonRel) && <Detail label="Close reason">{nameOf(request.closeReasonRel)}</Detail>}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <MoveDialog request={request} to={prompt} onOpenChange={(o) => !o && setPrompt(undefined)} openWorkOrders={openWos} />
      {canEdit && <EditSheet request={request} open={editing} onOpenChange={setEditing} />}
      <DeferDialog request={request} open={deferring} onOpenChange={setDeferring} />
      {who.isWorkshop && <NewWorkOrderDialog request={request} open={newWorkOrder} onOpenChange={setNewWorkOrder} />}
    </Page>
  );
}
