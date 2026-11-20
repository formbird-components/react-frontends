import type { HTMLAttributes } from 'react';
import { cn } from '../utils';

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-card', className)} {...props} />
);
export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)} {...props} />
);
export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-[15px] font-semibold tracking-tight', className)} {...props} />
);
export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-[13px] text-muted-foreground', className)} {...props} />
);
export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('px-5 pb-5', className)} {...props} />;
export const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center gap-2 border-t border-border px-5 py-3', className)} {...props} />
);
