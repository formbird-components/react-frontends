// A headline figure: label, value, a line under it, and an icon in the tone the figure means. As a
// button it filters what is below it.

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils';
import { Skeleton } from '../ui';

export type KpiTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<KpiTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-[color-mix(in_oklab,var(--warning)_75%,var(--foreground))]',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/12 text-info',
};

export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  loading,
  active,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: KpiTone;
  loading?: boolean;
  /** Pressed, when the tile is a filter. */
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', tones[tone])}>
            <Icon className="size-4" strokeWidth={2} />
          </span>
        )}
      </div>
      {loading ? <Skeleton className="mt-1 h-8 w-16" /> : <div className="mt-0.5 text-[26px] leading-tight font-semibold tracking-tight">{value}</div>}
      {hint && <div className="mt-auto truncate pt-1 text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  const base = 'flex min-w-0 flex-col rounded-xl border border-border bg-card px-4 py-3.5 text-left shadow-card';
  if (!onClick) return <div className={cn(base, className)}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(base, 'cursor-pointer transition-[border-color,box-shadow] hover:border-input hover:shadow-sm', active && 'border-primary/60 ring-3 ring-primary/15', className)}
    >
      {body}
    </button>
  );
}
