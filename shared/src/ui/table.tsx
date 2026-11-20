import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../utils';

export const Table = ({ className, ...props }: HTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto">
    <table className={cn('w-full border-collapse text-sm', className)} {...props} />
  </div>
);
export const THead = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => <thead className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
export const TBody = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
export const TR = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('border-b border-border transition-colors data-[clickable=true]:cursor-pointer data-[clickable=true]:hover:bg-accent/60', className)} {...props} />
);
export const TH = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5', className)} {...props} />
);
export const TD = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-3 py-2.5 align-middle first:pl-5 last:pr-5', className)} {...props} />;
