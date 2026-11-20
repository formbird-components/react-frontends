import { Avatar as AvatarPrimitive, Checkbox as CheckboxPrimitive, Separator as SeparatorPrimitive, Switch as SwitchPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { Check } from 'lucide-react';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { cn, hueOf, initials } from '../utils';

export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;

export const Separator = ({ className, orientation = 'horizontal', ...props }: ComponentProps<typeof SeparatorPrimitive.Root>) => (
  <SeparatorPrimitive.Root orientation={orientation} className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)} {...props} />
);

export const Kbd = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <kbd className={cn('inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground', className)} {...props} />
);

/** A person's avatar: initials on a colour of their own. */
export function PersonAvatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const hue = hueOf(name || '?');
  return (
    <AvatarPrimitive.Root className={cn('inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full', className)} style={{ width: size, height: size }}>
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center font-semibold"
        style={{ fontSize: Math.max(10, size * 0.38), background: `oklch(0.9 0.06 ${hue})`, color: `oklch(0.38 0.1 ${hue})` }}
      >
        {initials(name || '?')}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export const Checkbox = ({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) => (
  <CheckboxPrimitive.Root
    className={cn('peer flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-input bg-card shadow-xs transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className)}
    {...props}
  >
    <CheckboxPrimitive.Indicator>
      <Check className="size-3" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);

export const Switch = ({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root className={cn('inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors data-[state=checked]:bg-primary', className)} {...props}>
    <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
  </SwitchPrimitive.Root>
);

export const TooltipProvider = TooltipPrimitive.Provider;

/** A tooltip on any element. */
export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-72 animate-in rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-pop">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** A labelled field: label, the control, a hint, and an error. */
export function Field({ label, htmlFor, required, hint, error, children, className }: { label: ReactNode; htmlFor?: string; required?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A row of buttons acting as one choice. */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-lg bg-muted p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-md font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
            value === o.value && 'bg-card text-foreground shadow-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
