// The workshop board: every open request by status. Drag a card to move it (only the moves the
// person may make light up), filter by workshop, assignee, priority or text, or switch to a list.

import { AlertTriangle, ClipboardList, Columns3, Flame, Inbox, List, Plus, RotateCw, Search, SlidersHorizontal, Timer, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { KpiTile, Alert, EmptyState, Page, PageHeader, StatusBadge } from '@react-frontends/shared/components';
import { Badge, Button, Card, Input, PersonAvatar, Popover, PopoverContent, PopoverTrigger, Segmented, Select, Skeleton, Switch, Table, TBody, TD, TH, THead, TR } from '@react-frontends/shared/ui';
import { useSession } from '@/data/session';
import { first, nameOf, type StatusValue, type WorkshopRequest } from '@/domain/types';
import { STATUS_ORDER } from '@/domain/workflow';
import { formatDate, hours } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { ageInDays, applyMoves, boardColumns, checkMove, compareForBoard, filterRequests, groupByStatus, isUrgent, movesFor, statusOf, workOrderCounts, workshopFigures, type BoardFilters } from './board';
import { useDoneRequests, useMoveRequest, useOpenRequests, useRequestStatuses, useWorkOrdersOf, useWorkshops, useWorkshopStaff } from './data';
import { MoveDialog } from './move-dialog';
import { DueChip, RequestCard, UrgentBadge } from './request-card';

const COLUMN_HINTS: Record<string, string> = {
  Pending: 'Waiting for triage',
  Open: 'Scheduled',
  'Drop Off': 'At the workshop',
  'In Progress': 'Being worked on',
  'Work Complete': 'Ready to release',
  'Pick Up': 'Waiting for collection',
  Closed: 'Last 30 days',
  Cancelled: 'Last 30 days',
};

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters: BoardFilters & { done: boolean; view: 'board' | 'list' } = {
    text: params.get('q') ?? '',
    workshop: params.get('workshop') ?? '',
    assignee: params.get('assignee') ?? '',
    priority: (params.get('priority') as BoardFilters['priority']) ?? '',
    mine: params.get('mine') === '1',
    done: params.get('done') === '1',
    view: params.get('view') === 'list' ? 'list' : 'board',
  };
  const set = (patch: Partial<Record<'q' | 'workshop' | 'assignee' | 'priority' | 'mine' | 'done' | 'view', string>>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  const active = !!(filters.text || filters.workshop || filters.assignee || filters.priority || filters.mine);
  const activeCount = [filters.workshop, filters.assignee, filters.priority, filters.mine, filters.done].filter(Boolean).length;
  const clear = () => set({ q: '', workshop: '', assignee: '', priority: '', mine: '' });
  return { filters, set, active, activeCount, clear };
}

export function WorkshopPage() {
  const { who, me } = useSession();
  const navigate = useNavigate();
  const { filters, set, active, activeCount, clear } = useFilters();
  const open = useOpenRequests();
  const done = useDoneRequests(30);
  const statuses = useRequestStatuses();
  const { workshops } = useWorkshops();
  const { staff } = useWorkshopStaff();
  const { move } = useMoveRequest();

  // Moves made here that search hasn't caught up with yet.
  const [moved, setMoved] = useState<Record<string, StatusValue>>({});
  const all = useMemo(() => [...(open.data?.documents ?? []), ...(filters.done ? done.data?.documents ?? [] : [])], [open.data, done.data, filters.done]);
  const { list: current, settled } = useMemo(() => applyMoves(all, moved), [all, moved]);
  useEffect(() => {
    if (settled.length)
      setMoved((m) => {
        const next = { ...m };
        for (const id of settled) delete next[id];
        return next;
      });
  }, [settled]);

  const workOrders = useWorkOrdersOf(useMemo(() => current.map((r) => r.documentId), [current]));
  const woCounts = useMemo(() => workOrderCounts(workOrders.data?.documents ?? []), [workOrders.data]);
  const openWorkOrdersOf = (r: WorkshopRequest) => woCounts.get(r.documentId)?.open ?? [];

  const visible = useMemo(() => filterRequests(current, filters, me?.documentId), [current, filters, me?.documentId]);
  const columns = boardColumns(filters.done);
  const groups = useMemo(() => groupByStatus(visible, columns), [visible, columns]);
  const figures = useMemo(() => workshopFigures(filterRequests(open.data?.documents ?? [], { workshop: filters.workshop }), filterRequests(done.data?.documents ?? [], { workshop: filters.workshop })), [open.data, done.data, filters.workshop]);

  const [dragging, setDragging] = useState<WorkshopRequest>();
  const [over, setOver] = useState<string>();
  const [prompt, setPrompt] = useState<{ request: WorkshopRequest; to: string }>();

  const startMove = async (r: WorkshopRequest, to: string) => {
    const check = checkMove(r, to, who, openWorkOrdersOf(r));
    if (!check.ok) return;
    if (check.need !== 'none') {
      setPrompt({ request: r, to });
      return;
    }
    const status = statuses.get(to);
    if (status) setMoved((m) => ({ ...m, [r.documentId]: status }));
    const saved = await move(r, to, {}, openWorkOrdersOf(r));
    if (!saved)
      setMoved((m) => {
        const next = { ...m };
        delete next[r.documentId];
        return next;
      });
  };

  const loading = open.isPending;
  const staffOptions = [{ value: 'all', label: 'Anyone' }, { value: 'none', label: 'Unassigned' }, ...staff.map((p) => ({ value: p.documentId, label: p.systemHeader?.summaryName ?? '' }))];

  return (
    <Page wide>
      <PageHeader
        title="Workshop"
        description={who.isWorkshop ? 'Requests from report to pick-up. Drag a card to move it along.' : 'Requests from report to pick-up.'}
        actions={
          <Button asChild>
            <Link to="/workshop/requests/new">
              <Plus />
              Report a fault
            </Link>
          </Button>
        }
      />

      <div className="-mx-4 mb-6 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5 [&>*]:w-44 [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
        <KpiTile label="Open requests" value={figures.open} icon={ClipboardList} tone="primary" loading={loading} hint={figures.late ? `${figures.late} past expected completion` : 'None running late'} />
        <KpiTile
          label="Urgent"
          value={figures.urgent}
          icon={Flame}
          tone={figures.urgent ? 'danger' : 'success'}
          loading={loading}
          hint={filters.priority === 'urgent' ? 'Showing urgent only' : 'Assets out of service'}
          active={filters.priority === 'urgent'}
          onClick={() => set({ priority: filters.priority === 'urgent' ? '' : 'urgent' })}
        />
        <KpiTile label="Awaiting triage" value={figures.triage} icon={Inbox} tone={figures.triage ? 'warning' : 'success'} loading={loading} hint="Pending a supervisor" />
        <KpiTile label="In the workshop" value={figures.inWorkshop} icon={Wrench} tone="info" loading={loading} hint="Off hire right now" />
        <KpiTile
          label="Average downtime"
          value={figures.averageDowntime === undefined ? '–' : hours(figures.averageDowntime)}
          icon={Timer}
          loading={loading || done.isPending}
          hint="Closed in the last 30 days"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={filters.text} onChange={(e) => set({ q: e.target.value })} placeholder="Search asset, ref, fault…" aria-label="Search requests" className="pl-9" />
        </div>
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <FilterControls filters={filters} set={set} workshops={workshops} staffOptions={staffOptions} meName={who.isWorkshop ? me?.name : undefined} />
          {active && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X />
              Clear
            </Button>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="sm:hidden" aria-label="Filters">
              <SlidersHorizontal />
              Filters
              {activeCount > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{activeCount}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="grid w-[calc(100vw-2rem)] max-w-80 gap-3 p-3">
            <FilterControls filters={filters} set={set} workshops={workshops} staffOptions={staffOptions} meName={who.isWorkshop ? me?.name : undefined} stacked />
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <Switch checked={filters.done} onCheckedChange={(c) => set({ done: c ? '1' : '' })} />
              Show closed and cancelled
            </label>
            {active && (
              <Button variant="ghost" size="sm" onClick={clear} className="justify-self-start">
                <X />
                Clear filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-3 sm:ml-auto">
          <label className="hidden cursor-pointer items-center gap-2 text-[13px] font-medium whitespace-nowrap text-muted-foreground sm:flex">
            <Switch checked={filters.done} onCheckedChange={(c) => set({ done: c ? '1' : '' })} aria-label="Show closed and cancelled requests" />
            Show closed
          </label>
          <Segmented
            size="sm"
            value={filters.view}
            onChange={(v) => set({ view: v === 'list' ? 'list' : '' })}
            options={[
              { value: 'board', label: <><Columns3 /><span className="hidden sm:inline">Board</span></> },
              { value: 'list', label: <><List /><span className="hidden sm:inline">List</span></> },
            ]}
          />
        </div>
      </div>

      {open.isError ? (
        <Alert>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Couldn’t load the workshop’s requests. {(open.error as Error).message}</span>
            <Button size="sm" variant="outline" onClick={() => void open.refetch()}>
              <RotateCw />
              Try again
            </Button>
          </div>
        </Alert>
      ) : loading ? (
        <BoardSkeleton />
      ) : !current.length ? (
        <Card>
          <EmptyState
            icon={Wrench}
            title="The workshop is clear"
            action={
              <Button asChild variant="outline">
                <Link to="/workshop/requests/new">Report a fault</Link>
              </Button>
            }
          >
            No open requests. Faults reported from a Daily Driver or here show up on this board.
          </EmptyState>
        </Card>
      ) : filters.view === 'list' ? (
        <RequestList requests={visible} counts={woCounts} onOpen={(r) => navigate(`/workshop/requests/${r.documentId}`)} onClear={active ? clear : undefined} />
      ) : (
        <>
          {active && !visible.length && (
            <Alert tone="info" className="mb-3">
              No requests match these filters.{' '}
              <button type="button" className="cursor-pointer font-medium underline underline-offset-2" onClick={clear}>
                Clear filters
              </button>
            </Alert>
          )}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:snap-none lg:px-0" role="list" aria-label="Board columns">
            {columns.map((column) => {
              const items = groups[column] ?? [];
              const status = statuses.list.find((s) => s.name === column);
              const check = dragging ? checkMove(dragging, column, who, openWorkOrdersOf(dragging)) : undefined;
              const isSource = dragging && statusOf(dragging) === column;
              const target = !!check?.ok;
              return (
                <section
                  key={column}
                  role="listitem"
                  aria-label={`${column}: ${items.length}`}
                  onDragOver={(e: DragEvent) => {
                    if (!dragging || isSource) return;
                    setOver(column);
                    if (target) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === column ? undefined : o));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(undefined);
                    const r = dragging;
                    setDragging(undefined);
                    if (r && target) void startMove(r, column);
                  }}
                  className={cn(
                    'flex w-[82vw] max-w-80 shrink-0 snap-start flex-col rounded-xl border border-transparent bg-muted/60 transition-[background-color,border-color,opacity] sm:w-68 lg:w-auto lg:max-w-none lg:min-w-64 lg:flex-1 dark:bg-muted/40',
                    dragging && !isSource && target && 'border-dashed border-primary/50 bg-primary-soft/40',
                    dragging && !isSource && target && over === column && 'border-solid border-primary bg-primary-soft/70',
                  )}
                >
                  <header className={cn('flex items-center gap-2 px-3 pt-3 pb-2 transition-opacity', dragging && !isSource && !target && 'opacity-45')}>
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: status?.color ?? 'var(--muted-foreground)' }} />
                    <h2 className="text-sm font-semibold">{column}</h2>
                    <span className="rounded-full bg-card px-1.5 py-px text-xs font-medium text-muted-foreground tabular shadow-xs">{items.length}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{COLUMN_HINTS[column]}</span>
                  </header>
                  {dragging && !isSource && over === column && !target && check?.reason && (
                    <div className="mx-2 mb-2 flex items-start gap-1.5 rounded-md bg-card px-2.5 py-2 text-xs text-muted-foreground shadow-xs">
                      <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
                      {check.reason}
                    </div>
                  )}
                  <div className={cn('grid content-start gap-2 px-2 pb-2 transition-opacity', dragging && !isSource && !target && 'opacity-45')} style={{ minHeight: 120 }}>
                    {items.map((r) => (
                      <RequestCard
                        key={r.documentId}
                        request={r}
                        workOrders={woCounts.get(r.documentId)}
                        moves={movesFor(r, who, openWorkOrdersOf(r))}
                        onMove={(to) => void startMove(r, to)}
                        draggable={who.isWorkshop}
                        dragging={dragging?.documentId === r.documentId}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', r.requestRef ?? r.documentId);
                          setDragging(r);
                        }}
                        onDragEnd={() => {
                          setDragging(undefined);
                          setOver(undefined);
                        }}
                      />
                    ))}
                    {!items.length && <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">{dragging && target ? 'Drop here' : 'Nothing here'}</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      <MoveDialog request={prompt?.request} to={prompt?.to} onOpenChange={(o) => !o && setPrompt(undefined)} openWorkOrders={prompt ? openWorkOrdersOf(prompt.request) : []} />
    </Page>
  );
}

type Filters = ReturnType<typeof useFilters>;

/** Workshop, assignee, priority and "mine": in a row on wide screens, stacked in the Filters popover on phones. */
function FilterControls({ filters, set, workshops, staffOptions, meName, stacked }: { filters: Filters['filters']; set: Filters['set']; workshops: { documentId: string; name: string }[]; staffOptions: { value: string; label: string }[]; meName?: string; stacked?: boolean }) {
  return (
    <>
      <Select
        value={filters.workshop || 'all'}
        onChange={(v) => set({ workshop: v === 'all' ? '' : v })}
        options={[{ value: 'all', label: 'All workshops' }, ...workshops.map((w) => ({ value: w.documentId, label: w.name }))]}
        className={stacked ? '' : 'w-48'}
      />
      <Select value={filters.assignee || 'all'} onChange={(v) => set({ assignee: v === 'all' ? '' : v })} options={staffOptions} className={stacked ? '' : 'w-40'} />
      <Segmented
        size="sm"
        className={stacked ? 'grid grid-cols-3' : ''}
        value={filters.priority || 'all'}
        onChange={(v) => set({ priority: v === 'all' ? '' : v })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'urgent', label: 'Urgent' },
          { value: 'routine', label: 'Non-urgent' },
        ]}
      />
      {meName && (
        <Button variant={filters.mine ? 'soft' : 'outline'} size="sm" aria-pressed={filters.mine} onClick={() => set({ mine: filters.mine ? '' : '1' })} className={stacked ? 'justify-start' : ''}>
          <PersonAvatar name={meName} size={18} />
          Assigned to me
        </Button>
      )}
    </>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Loading requests">
      {[3, 2, 4, 2, 1, 1].map((n, i) => (
        <div key={i} className="grid w-72 shrink-0 content-start gap-2 rounded-xl bg-muted/60 p-2">
          <Skeleton className="m-1 h-4 w-24" />
          {Array.from({ length: n }, (_, j) => (
            <Skeleton key={j} className="h-32 rounded-lg bg-card" />
          ))}
        </div>
      ))}
    </div>
  );
}

function RequestList({ requests, counts, onOpen, onClear }: { requests: WorkshopRequest[]; counts: ReturnType<typeof workOrderCounts>; onOpen: (r: WorkshopRequest) => void; onClear?: () => void }) {
  const order = STATUS_ORDER.requestStatus;
  const sorted = [...requests].sort((a, b) => order.indexOf(statusOf(a)) - order.indexOf(statusOf(b)) || compareForBoard(a, b));
  if (!sorted.length)
    return (
      <Card>
        <EmptyState
          icon={Search}
          title="No requests match"
          action={
            onClear && (
              <Button variant="outline" onClick={onClear}>
                Clear filters
              </Button>
            )
          }
        />
      </Card>
    );
  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <Table>
          <THead>
            <TR>
              <TH>Asset</TH>
              <TH>Request</TH>
              <TH>Status</TH>
              <TH>Priority</TH>
              <TH>Assigned</TH>
              <TH>Due</TH>
              <TH className="text-right">Age</TH>
              <TH className="text-right">Work orders</TH>
            </TR>
          </THead>
          <TBody>
            {sorted.map((r) => {
              const asset = first(r.assetRel);
              const c = counts.get(r.documentId);
              return (
                <TR key={r.documentId} data-clickable onClick={() => onOpen(r)}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <AssetIcon kind={asset?.iconKind} size={30} />
                      <div className="min-w-0">
                        <Link to={`/workshop/requests/${r.documentId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {asset?.assetId}
                        </Link>
                        <div className="max-w-44 truncate text-xs text-muted-foreground">{asset?.name?.split(' · ')[1]}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div className="font-medium tabular">{r.requestRef}</div>
                    <div className="max-w-64 truncate text-xs text-muted-foreground">{nameOf(r.requestTypeRel)}</div>
                  </TD>
                  <TD>
                    <StatusBadge value={r.requestStatusRel} />
                  </TD>
                  <TD>{isUrgent(r) ? <UrgentBadge /> : <span className="text-xs text-muted-foreground">Non-urgent</span>}</TD>
                  <TD>
                    {first(r.assignedToRel) ? (
                      <span className="flex items-center gap-2">
                        <PersonAvatar name={nameOf(r.assignedToRel)} size={22} />
                        <span className="truncate">{nameOf(r.assignedToRel)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    <DueChip request={r} />
                    {!r.expectedCompletionDate && !r.expectedStartDate && (r.closedDate ? formatDate(r.closedDate) : '–')}
                  </TD>
                  <TD className="text-right text-muted-foreground tabular">{ageInDays(r) ? `${ageInDays(r)} d` : 'Today'}</TD>
                  <TD className="text-right tabular">{c ? `${c.done}/${c.total}` : <span className="text-muted-foreground">–</span>}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <ul className="grid gap-2 md:hidden">
        {sorted.map((r) => {
          const asset = first(r.assetRel);
          return (
            <li key={r.documentId}>
              <Link to={`/workshop/requests/${r.documentId}`} className={cn('flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card', isUrgent(r) && 'border-l-[3px] border-l-danger')}>
                <AssetIcon kind={asset?.iconKind} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{asset?.assetId}</span>
                    <span className="text-xs text-muted-foreground">{r.requestRef}</span>
                    <span className="ml-auto">
                      <StatusBadge value={r.requestStatusRel} />
                    </span>
                  </div>
                  <div className="truncate text-[13px] text-muted-foreground">{nameOf(r.requestTypeRel)}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {isUrgent(r) && <Badge tone="danger">Urgent</Badge>}
                    <DueChip request={r} />
                    {first(r.assignedToRel) && <span className="ml-auto truncate">{nameOf(r.assignedToRel)}</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
