// The request priorities as two big choices, saying what each means for the asset.

import { CheckCircle2, Flame } from 'lucide-react';
import { lookupValue } from '@/data/values';
import type { LookupValue } from '@/domain/types';
import { cn } from '@react-frontends/shared/utils';
import { NON_URGENT, URGENT } from './board';

/** The two priorities as big choices: what each means for the asset. */
export function PriorityChoice({ value, onChange, options, invalid, size = 'md' }: { value: LookupValue | undefined; onChange: (v: LookupValue) => void; options: LookupValue[]; invalid?: boolean; size?: 'md' | 'lg' }) {
  const meaning: Record<string, { icon: typeof Flame; title: string; text: string; tone: string }> = {
    [URGENT]: { icon: Flame, title: 'Urgent', text: 'Out of service: it can’t be used safely.', tone: 'danger' },
    [NON_URGENT]: { icon: CheckCircle2, title: 'Non-urgent', text: 'Still usable until the workshop can fit it in.', tone: 'success' },
  };
  return (
    <div role="radiogroup" aria-label="Priority" aria-invalid={invalid || undefined} className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const m = meaning[o.name] ?? { icon: CheckCircle2, title: o.name, text: '', tone: 'primary' };
        const selected = value?.documentId === o.documentId;
        return (
          <button
            key={o.documentId}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(lookupValue(o))}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border bg-card text-left transition-[border-color,box-shadow,background-color]',
              size === 'lg' ? 'p-4' : 'p-3.5',
              invalid && !value && 'border-danger/60',
              selected ? (m.tone === 'danger' ? 'border-danger bg-danger/6 ring-3 ring-danger/15' : 'border-primary bg-primary-soft/40 ring-3 ring-primary/15') : 'border-border hover:border-input hover:bg-accent/50',
            )}
          >
            <m.icon className={cn('mt-0.5 size-5 shrink-0', m.tone === 'danger' ? 'text-danger' : 'text-success')} />
            <span>
              <span className="block text-sm font-semibold">{m.title}</span>
              <span className="block text-[13px] text-muted-foreground">{m.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
