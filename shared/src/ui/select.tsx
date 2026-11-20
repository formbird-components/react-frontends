import { Select as S } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

export interface Option {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
}

/** A single choice from a short list. */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Choose…',
  className,
  id,
  invalid,
  disabled,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <S.Root value={value ?? ''} onValueChange={onChange} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger data-[placeholder]:text-muted-foreground/80',
          className,
        )}
      >
        <span className="truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon>
          <ChevronDown className="size-4 opacity-60" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="z-50 max-h-80 min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-border bg-popover shadow-pop animate-in">
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className="relative flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[highlighted]:bg-accent">
                <div className="min-w-0">
                  <S.ItemText>{o.label}</S.ItemText>
                  {o.hint && <div className="text-xs text-muted-foreground">{o.hint}</div>}
                </div>
                <S.ItemIndicator className="absolute right-2">
                  <Check className="size-4 text-primary" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
