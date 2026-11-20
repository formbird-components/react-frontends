// Dialogs, side sheets, popovers and menus (Radix primitives in the app's style).

import { Dialog as DialogPrimitive, DropdownMenu as Menu, Popover as PopoverPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const Overlay = () => <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade_150ms_ease-out]" />;

export function DialogContent({ className, children, title, description, wide, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { title: ReactNode; description?: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border bg-popover p-6 shadow-pop animate-in',
          wide ? 'max-w-2xl' : 'max-w-md',
          className,
        )}
        {...props}
      >
        <div className="grid gap-1 pr-6">
          <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
          {description ? <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>}
        </div>
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-wrap justify-end gap-2 pt-2', className)} {...props} />;

/** A panel from the right edge: details and forms that keep the page behind them. */
export function SheetContent({ className, children, title, description, actions, width = 'max-w-xl', ...props }: ComponentProps<typeof DialogPrimitive.Content> & { title: ReactNode; description?: ReactNode; actions?: ReactNode; width?: string }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn('fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-background shadow-pop data-[state=open]:animate-[slide-in_200ms_cubic-bezier(.2,.8,.2,1)]', width, className)}
        {...props}
      >
        <header className="flex items-start gap-3 border-b border-border bg-card px-6 py-4">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="truncate text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>}
          </div>
          {actions}
          <DialogPrimitive.Close className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset} className={cn('z-50 rounded-lg border border-border bg-popover p-1 shadow-pop outline-none animate-in', className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export function DropdownMenuContent({ className, align = 'end', sideOffset = 6, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content align={align} sideOffset={sideOffset} className={cn('z-50 min-w-48 rounded-lg border border-border bg-popover p-1 shadow-pop animate-in', className)} {...props} />
    </Menu.Portal>
  );
}
export const DropdownMenuItem = ({ className, ...props }: ComponentProps<typeof Menu.Item>) => (
  <Menu.Item
    className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground', className)}
    {...props}
  />
);
export const DropdownMenuLabel = ({ className, ...props }: ComponentProps<typeof Menu.Label>) => <Menu.Label className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />;
export const DropdownMenuSeparator = () => <Menu.Separator className="my-1 h-px bg-border" />;
