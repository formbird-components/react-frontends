// Date and time inputs on ISO values, in the viewer's time zone.

import { fromInputs, toDateInput, toTimeInput } from '../format';
import { cn } from '../utils';
import { Input } from '../ui';

export function DateTimeInput({ value, onChange, id, invalid, disabled, step = 900, className }: { value: string | undefined; onChange: (iso: string | undefined) => void; id?: string; invalid?: boolean; disabled?: boolean; step?: number; className?: string }) {
  const date = toDateInput(value);
  const time = toTimeInput(value);
  return (
    <div className={cn('flex gap-2', className)}>
      <Input id={id} type="date" value={date} disabled={disabled} aria-invalid={invalid || undefined} onChange={(e) => onChange(fromInputs(e.target.value, time || '09:00'))} className="min-w-0 flex-[3]" />
      <Input type="time" value={time} step={step} disabled={disabled || !date} aria-invalid={invalid || undefined} onChange={(e) => onChange(fromInputs(date, e.target.value))} className="min-w-0 flex-[2]" aria-label="Time" />
    </div>
  );
}

export function DateInput({ value, onChange, id, invalid, disabled }: { value: string | undefined; onChange: (iso: string | undefined) => void; id?: string; invalid?: boolean; disabled?: boolean }) {
  return <Input id={id} type="date" value={toDateInput(value)} disabled={disabled} aria-invalid={invalid || undefined} onChange={(e) => onChange(fromInputs(e.target.value, '00:00'))} />;
}
