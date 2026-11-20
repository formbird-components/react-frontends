// A request on the board: the asset, what's wrong, who has it, how long it has waited and when it is
// due, with a menu to move it (for keyboards and touch screens, where dragging doesn't work).

import { CalendarClock, ClipboardCheck, Clock, Flame, MoreHorizontal, PauseCircle, UserRound, Wrench } from 'lucide-react';
import type { DragEvent } from 'react';
import { Link } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { Badge, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, PersonAvatar, Tip } from '@react-frontends/shared/ui';
import { first, nameOf, type WorkshopRequest } from '@/domain/types';
import { daysUntil, formatDate, formatDateTime } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { ageInDays, createdAt, isDone, isUrgent, moveLabel, statusOf, type MoveCheck } from './board';

/** When a request is expected: its start while it waits, else its completion ("Due in 2 d", "3 d late"). */
export function dueLabel(request: WorkshopRequest): { text: string; tip: string; tone: 'late' | 'today' | 'normal' } | undefined {
  const status = statusOf(request);
  if (isDone(request)) return undefined;
  const waiting = (status === 'Pending' || status === 'Open') && !!request.expectedStartDate;
  const date = waiting ? request.expectedStartDate : request.expectedCompletionDate;
  if (!date) return undefined;
  const days = daysUntil(date) ?? 0;
  const released = ['Work Complete', 'Pick Up'].includes(status);
  const tone = days < 0 && !released ? 'late' : days === 0 && !released ? 'today' : 'normal';
  const tip = `${waiting ? 'Expected start' : 'Expected completion'}: ${formatDateTime(date)}`;
  if (waiting) return { text: days < 0 ? 'Start overdue' : days === 0 ? 'Starts today' : `Starts ${formatDate(date)}`, tip, tone };
  if (released) return { text: `Due ${formatDate(date)}`, tip, tone };
  return { text: days < 0 ? `${-days} d late` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due ${formatDate(date)}`, tip, tone };
}

export function DueChip({ request }: { request: WorkshopRequest }) {
  const due = dueLabel(request);
  if (!due) return null;
  return (
    <Tip content={due.tip}>
      <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', due.tone === 'late' ? 'font-medium text-danger' : due.tone === 'today' ? 'font-medium text-[color-mix(in_oklab,var(--warning)_75%,var(--foreground))]' : '')}>
        <CalendarClock className="size-3.5" />
        {due.text}
      </span>
    </Tip>
  );
}

export function UrgentBadge() {
  return (
    <Badge tone="danger">
      <Flame />
      Urgent
    </Badge>
  );
}

export function RequestCard({
  request,
  workOrders,
  moves,
  onMove,
  dragging,
  onDragStart,
  onDragEnd,
  draggable,
}: {
  request: WorkshopRequest;
  workOrders?: { total: number; done: number };
  moves: ({ to: string } & MoveCheck)[];
  onMove: (to: string) => void;
  dragging?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  draggable?: boolean;
}) {
  const asset = first(request.assetRel);
  const assignee = first(request.assignedToRel);
  const urgent = isUrgent(request);
  const age = ageInDays(request);
  const from = statusOf(request);
  const allowed = moves.filter((m) => m.ok);
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={`${request.requestRef ?? 'Request'}: ${asset?.assetId ?? ''} ${nameOf(request.requestTypeRel)}`}
      className={cn(
        'group relative rounded-lg border border-border bg-card p-3 shadow-card transition-[box-shadow,border-color,opacity,transform] hover:border-input hover:shadow-md',
        draggable && 'cursor-grab active:cursor-grabbing',
        urgent && 'border-l-[3px] border-l-danger',
        dragging && 'scale-[0.98] opacity-40',
      )}
    >
      <div className="flex items-start gap-2.5">
        <AssetIcon kind={asset?.iconKind} size={32} color={urgent ? 'var(--danger)' : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Link
              to={`/workshop/requests/${request.documentId}`}
              draggable={false}
              className="truncate text-sm font-semibold tracking-tight outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {asset?.assetId ?? 'No asset'}
            </Link>
            <span className="shrink-0 text-xs text-muted-foreground tabular">{request.requestRef}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">{asset?.name?.split(' · ')[1] ?? asset?.name}</div>
        </div>
        {allowed.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative z-10 -mt-1 -mr-1 cursor-pointer rounded-md p-1 text-muted-foreground opacity-100 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={`Move ${request.requestRef ?? 'request'}`}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {allowed.map((m) => (
                <DropdownMenuItem key={m.to} onSelect={() => onMove(m.to)}>
                  {moveLabel(from, m.to)}
                  <span className="ml-auto text-xs text-muted-foreground">{m.to}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug">
        <span className="font-medium">{nameOf(request.requestTypeRel)}</span>
        {request.reqDescription && <span className="text-muted-foreground"> · {request.reqDescription.split('\n')[0]}</span>}
      </p>

      {(urgent || !!request.deferredBool || !!request.dailyDriverRel?.length) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {urgent && <UrgentBadge />}
          {request.deferredBool && (
            <Tip content={request.deferredReason}>
              <Badge tone="warning" className="relative z-10">
                <PauseCircle />
                Deferred
              </Badge>
            </Tip>
          )}
          {!!request.dailyDriverRel?.length && (
            <Badge tone="info">
              <ClipboardCheck />
              Daily Driver
            </Badge>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2.5 text-xs text-muted-foreground">
        <Tip content={`Raised ${formatDateTime(createdAt(request))}`}>
          <span className="relative z-10 inline-flex items-center gap-1 whitespace-nowrap tabular">
            <Clock className="size-3.5" />
            {age === 0 ? 'Today' : `${age} d`}
          </span>
        </Tip>
        <span className="relative z-10">
          <DueChip request={request} />
        </span>
        {workOrders && workOrders.total > 0 && (
          <Tip content={`${workOrders.done} of ${workOrders.total} work orders complete`}>
            <span className={cn('relative z-10 inline-flex items-center gap-1 whitespace-nowrap tabular', workOrders.done === workOrders.total && 'text-success')}>
              <Wrench className="size-3.5" />
              {workOrders.done}/{workOrders.total}
            </span>
          </Tip>
        )}
        <span className="relative z-10 ml-auto">
          {assignee ? (
            <Tip content={`Assigned to ${assignee.name}`}>
              <span>
                <PersonAvatar name={assignee.name} size={24} />
              </span>
            </Tip>
          ) : (
            <Tip content="Not assigned">
              <span className="flex size-6 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground">
                <UserRound className="size-3.5" />
              </span>
            </Tip>
          )}
        </span>
      </div>
    </article>
  );
}
