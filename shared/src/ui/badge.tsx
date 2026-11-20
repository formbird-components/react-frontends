import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../utils';

export const badgeVariants = cva('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      primary: 'bg-primary-soft text-primary',
      success: 'bg-success/12 text-success',
      warning: 'bg-warning/15 text-[color-mix(in_oklab,var(--warning)_75%,var(--foreground))]',
      danger: 'bg-danger/12 text-danger',
      info: 'bg-info/12 text-info',
      outline: 'border border-border text-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, tone, ...props }: BadgeProps) => <span className={cn(badgeVariants({ tone }), className)} {...props} />;

/** A status in its own colour (statuses store one): tinted background, coloured dot. */
export function ColorBadge({ color, children, className, title }: { color?: string; children: React.ReactNode; className?: string; title?: string }) {
  const c = color || 'var(--muted-foreground)';
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', className)}
      style={{ backgroundColor: `color-mix(in oklab, ${c} 13%, transparent)`, color: `color-mix(in oklab, ${c} 82%, var(--foreground))` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
      {children}
    </span>
  );
}
