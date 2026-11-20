// A number field that keeps what is being typed ("1,2" on the way to "1,200") and shows the value
// with separators once the person moves on.

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../utils';
import { parseNumber } from './number';
import { Input } from '../ui';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  /** Most decimals shown when not editing (default 2). */
  digits?: number;
  /** Text inside the field on the left ("$") or right ("km"). */
  prefix?: ReactNode;
  suffix?: ReactNode;
  inputClassName?: string;
};

const display = (value: number | null | undefined, digits: number) =>
  value === null || value === undefined || Number.isNaN(value) ? '' : value.toLocaleString('en-AU', { maximumFractionDigits: digits });

export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput({ value, onValueChange, digits = 2, prefix, suffix, className, inputClassName, onFocus, onBlur, ...props }, ref) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const input = (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      {...props}
      value={editing ? text : display(value, digits)}
      onFocus={(e) => {
        setText(value === null || value === undefined ? '' : String(value));
        setEditing(true);
        onFocus?.(e);
      }}
      onChange={(e) => {
        setText(e.target.value);
        onValueChange(parseNumber(e.target.value));
      }}
      onBlur={(e) => {
        setEditing(false);
        onBlur?.(e);
      }}
      className={cn('tabular', prefix && 'pl-7', suffix && 'pr-10', !prefix && !suffix && className, inputClassName)}
    />
  );
  if (!prefix && !suffix) return input;
  return (
    <div className={cn('relative', className)}>
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{prefix}</span>}
      {input}
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
});
