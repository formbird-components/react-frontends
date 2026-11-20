// An odometer (km) or hour-meter reading next to the asset's current meter: how much it adds, a
// button to copy the asset's meter, and readings that look wrong flagged (fleet's meterProblems; the
// warning doesn't block, as on the server).

import { AlertTriangle, Gauge } from 'lucide-react';
import { meterProblems } from '@/domain/logic/meter';
import { formatNumber, relative } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { NumberInput } from '@react-frontends/shared/components';
import { Button } from '@react-frontends/shared/ui';

export function MeterField({
  value,
  onChange,
  unit,
  assetMeter,
  assetMeterDate,
  minimum,
  maxIncrease,
  id,
  invalid,
  disabled,
  size = 'md',
  autoFocus,
  describedBy,
  emptyText = 'No reading on the asset yet.',
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  unit?: 'km' | 'hours' | null;
  /** The asset's current reading. */
  assetMeter?: number | null;
  assetMeterDate?: string | null;
  /** A reading this one must not be below (a start reading). */
  minimum?: number | null;
  /** Largest believable increase over the asset's meter. */
  maxIncrease?: number;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  describedBy?: string;
  /** Shown when the asset's meter isn't known (e.g. "Choose the asset first."). */
  emptyText?: string;
}) {
  const u = unit === 'hours' ? 'h' : 'km';
  const known = assetMeter !== null && assetMeter !== undefined;
  const problems = meterProblems({ reading: value, assetMeter, minimum, maxIncrease, unit: unit ?? undefined });
  const added = known && value !== null && value !== undefined ? value - Number(assetMeter) : undefined;
  const hintId = id ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-2">
      <NumberInput
        id={id}
        value={value}
        onValueChange={onChange}
        digits={1}
        suffix={u}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        aria-describedby={[hintId, describedBy].filter(Boolean).join(' ') || undefined}
        placeholder={known ? formatNumber(assetMeter) : '0'}
        inputClassName={cn(size === 'lg' && 'h-14 text-2xl font-semibold tracking-tight', !invalid && problems.length > 0 && 'border-warning focus-visible:border-warning focus-visible:ring-warning/25')}
      />
      <div id={hintId} className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {known ? (
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="size-3.5" />
            Asset meter <span className="font-medium text-foreground tabular">{formatNumber(assetMeter)} {u}</span>
            {assetMeterDate && <span>· {relative(assetMeterDate)}</span>}
          </span>
        ) : (
          <span>{emptyText}</span>
        )}
        {added !== undefined && added > 0 && !problems.length && (
          <span className="font-medium text-success tabular">
            +{formatNumber(added, added % 1 ? 1 : 0)} {u}
          </span>
        )}
        {known && !disabled && (value === null || value === undefined) && (
          <Button type="button" variant="soft" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onChange(Number(assetMeter))}>
            Use {formatNumber(assetMeter)}
          </Button>
        )}
      </div>
      {problems.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))]">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <div>
            {problems.map((p) => (
              <div key={p}>{p}</div>
            ))}
            <div className="mt-0.5 opacity-80">The reading is kept, but won’t update the asset’s meter.</div>
          </div>
        </div>
      )}
    </div>
  );
}
