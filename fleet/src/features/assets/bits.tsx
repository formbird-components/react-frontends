// Small pieces the asset pages share: service warning badges, due dates that colour as they near,
// and a registration plate.

import { CircleCheck, Clock, TriangleAlert } from 'lucide-react';
import { Badge } from '@react-frontends/shared/ui';
import { daysUntil, dueText, formatDate } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import type { Warning } from './logic';

/** The service warning as a badge (icon and words: never colour alone). */
export function ServiceBadge({ warning, className }: { warning: Warning | string | undefined; className?: string }) {
  if (warning === 'Overdue')
    return (
      <Badge tone="danger" className={className}>
        <TriangleAlert />
        Overdue
      </Badge>
    );
  if (warning === 'Due Soon')
    return (
      <Badge tone="warning" className={className}>
        <Clock />
        Due soon
      </Badge>
    );
  if (warning === 'Not Due')
    return (
      <Badge tone="neutral" className={className}>
        <CircleCheck />
        Not due
      </Badge>
    );
  return null;
}

/** How near a due date is: expired (danger), within `warnDays` (warning), or fine. */
export function dueTone(value: unknown, warnDays = 30): 'danger' | 'warning' | 'ok' | 'none' {
  const days = daysUntil(value);
  if (days === undefined) return 'none';
  if (days < 0) return 'danger';
  if (days <= warnDays) return 'warning';
  return 'ok';
}

export const toneText = {
  danger: 'text-danger',
  warning: 'text-[color-mix(in_oklab,var(--warning)_72%,var(--foreground))]',
  ok: 'text-muted-foreground',
  none: 'text-muted-foreground',
} as const;

/** A due date, with "Due in 5 days" / "Overdue by 2 days" under it once it is near. */
export function DueDate({ value, warnDays = 30, empty = '–', className }: { value: unknown; warnDays?: number; empty?: string; className?: string }) {
  const tone = dueTone(value, warnDays);
  if (tone === 'none') return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className={cn('inline-flex flex-col leading-tight', className)}>
      <span className="tabular">{formatDate(value)}</span>
      {tone !== 'ok' && <span className={cn('text-xs font-medium', toneText[tone])}>{dueText(value)}</span>}
    </span>
  );
}

/** A registration, styled like a number plate. */
export function Plate({ rego, className }: { rego?: string | null; className?: string }) {
  if (!rego) return null;
  return (
    <span className={cn('inline-flex h-6 items-center rounded-[5px] border border-foreground/25 bg-card px-1.5 font-mono text-xs font-semibold tracking-wider text-foreground shadow-xs', className)}>
      {rego}
    </span>
  );
}
