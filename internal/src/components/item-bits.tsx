// Small pieces every SDMS page shows: an item's status, its type, its number as a link, people.

import { Bug, CircleHelp, Construction, FileText, Lightbulb, MessageSquareText, Package, Shield, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@react-frontends/shared/utils';
import { Tip } from '@react-frontends/shared/ui';
import { useStatusColor } from '@/data/sdms';
import { TYPE_STYLE } from '@/domain/model';
import type { Item, Ref } from '@/domain/types';

/**
 * A status: its colour as a swatch (SDMS colours are pale backgrounds, so the name stays in the
 * text colour), the way Formbird's lists show it.
 */
export function ItemStatus({ value, className, fallback = '–' }: { value: Ref[] | Ref | undefined | null; className?: string; fallback?: string }) {
  const colorOf = useStatusColor();
  const status = Array.isArray(value) ? value[0] : (value ?? undefined);
  if (!status?.name) return <span className="text-muted-foreground">{fallback}</span>;
  const color = colorOf(status);
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap text-sm', className)}>
      <span className="size-3.5 shrink-0 rounded-[4px] border border-black/10 dark:border-white/15" style={{ backgroundColor: color ?? 'var(--muted)' }} />
      {status.name}
    </span>
  );
}

const TYPE_ICONS: Record<string, LucideIcon> = { bug: Bug, lightbulb: Lightbulb, construction: Construction, package: Package, 'file-text': FileText, shield: Shield, message: MessageSquareText };

/**
 * An item type's icon in its colour (as on My View's board); the name in a tooltip unless shown.
 * `tip={false}` names it with the browser's own title instead (lighter, for hundreds of cards).
 */
export function TypeIcon({ name, withName, className, tip = true }: { name: string | undefined; withName?: boolean; className?: string; tip?: boolean }) {
  const style = name ? TYPE_STYLE[name] : undefined;
  const Icon = style ? (TYPE_ICONS[style.icon] ?? CircleHelp) : CircleHelp;
  const icon = <Icon className={cn('size-4 shrink-0', className)} style={{ color: style?.color ?? 'var(--muted-foreground)' }} aria-label={name ?? 'No type'} />;
  if (withName) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
        {icon}
        {name ?? '–'}
      </span>
    );
  }
  if (!tip) {
    return (
      <span title={name ?? 'No type'} className="inline-flex">
        {icon}
      </span>
    );
  }
  return <Tip content={name ?? 'No type'}>{icon}</Tip>;
}

/** The path of an item's page: by its number when it has one (short, shareable). */
export const itemPath = (item: Pick<Item, 'itemRef' | 'documentId'>) => `/items/${item.itemRef || item.documentId}`;

/** An item's number as a link to it ("0031492"). */
export function ItemLink({ item, className }: { item: Pick<Item, 'itemRef' | 'itemId' | 'documentId'>; className?: string }) {
  return (
    <Link to={itemPath(item)} className={cn('font-mono text-[0.8rem] tabular-nums text-primary hover:underline', className)}>
      {item.itemId || item.itemRef || '—'}
    </Link>
  );
}

/** Names of linked documents ("Ann, Bo"), or a dash. */
export const names = (refs: Ref[] | undefined | null) => (refs?.length ? refs.map((r) => r.name).join(', ') : '–');

/** A priority or severity as a quiet chip. */
export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground', className)}>{children}</span>;
}
