import { Tabs as T } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../utils';

export const Tabs = T.Root;
export const TabsList = ({ className, ...props }: ComponentProps<typeof T.List>) => (
  <T.List className={cn('flex items-center gap-1 overflow-x-auto border-b border-border', className)} {...props} />
);
export const TabsTrigger = ({ className, ...props }: ComponentProps<typeof T.Trigger>) => (
  <T.Trigger
    className={cn(
      '-mb-px inline-flex cursor-pointer items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground [&_svg]:size-4',
      className,
    )}
    {...props}
  />
);
export const TabsContent = ({ className, ...props }: ComponentProps<typeof T.Content>) => <T.Content className={cn('pt-5 outline-none', className)} {...props} />;
