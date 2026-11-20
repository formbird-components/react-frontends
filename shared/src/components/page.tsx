import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '../utils';

/** A page's heading: title, a line under it, and its actions on the right. */
export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 pb-6', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The page body: a centred column with room around it. */
export const Page = ({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) => (
  <div className={cn('mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8', wide ? 'max-w-[1600px]' : 'max-w-7xl', className)}>{children}</div>
);

export function EmptyState({ icon: Icon = Inbox, title, children, action, className }: { icon?: typeof Inbox; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A problem the person needs to see (a refused save, a failed load). */
export function Alert({ children, tone = 'danger', className }: { children: ReactNode; tone?: 'danger' | 'warning' | 'info'; className?: string }) {
  const styles = { danger: 'border-danger/30 bg-danger/8 text-danger', warning: 'border-warning/40 bg-warning/10 text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))]', info: 'border-info/30 bg-info/8 text-info' }[tone];
  return (
    <div role="alert" className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm', styles, className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
