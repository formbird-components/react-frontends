import { ColorBadge } from '../ui';

/** A status as records store one: a related value with a name and (usually) a colour. */
export interface ColoredValue {
  name?: string;
  color?: string;
}

/** A related status value ([{ name, color }], or one) as a coloured badge. */
export function StatusBadge({ value, fallback = '–' }: { value: ColoredValue[] | ColoredValue | null | undefined; fallback?: string }) {
  const status = Array.isArray(value) ? value[0] : value ?? undefined;
  if (!status?.name) return <span className="text-muted-foreground">{fallback}</span>;
  return <ColorBadge color={status.color}>{status.name}</ColorBadge>;
}
