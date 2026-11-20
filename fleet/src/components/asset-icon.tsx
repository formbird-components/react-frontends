import { ArrowUpFromLine, Bus, Car, CarFront, Caravan, Forklift, PlugZap, Tractor, Truck, Van, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '@react-frontends/shared/utils';

const ICONS: Record<string, LucideIcon> = {
  car: Car,
  van: Van,
  ute: CarFront,
  truck: Truck,
  bus: Bus,
  trailer: Caravan,
  forklift: Forklift,
  excavator: Tractor,
  generator: PlugZap,
  lift: ArrowUpFromLine,
  equipment: Wrench,
};

export const assetIcon = (kind?: string | null): LucideIcon => ICONS[kind ?? ''] ?? Wrench;

/** An asset's type as a tile, tinted by a status colour (its hire status) when given. */
export function AssetIcon({ kind, color, size = 36, className }: { kind?: string | null; color?: string; size?: number; className?: string }) {
  const Icon = assetIcon(kind);
  const c = color ?? 'var(--primary)';
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-lg', className)}
      style={{ width: size, height: size, background: `color-mix(in oklab, ${c} 14%, transparent)`, color: `color-mix(in oklab, ${c} 85%, var(--foreground))` }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} />
    </span>
  );
}
