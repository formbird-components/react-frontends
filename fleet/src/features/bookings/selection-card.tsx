// What a period chosen on the calendar would book: the asset, the times, the estimated cost, and
// anything that stops it (a clash, the person's pools or licence, the booking time rules).

import { AlertTriangle, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { AssetIcon } from '@/components/asset-icon';
import { Button } from '@react-frontends/shared/ui';
import { rangeLabel } from '@/domain/logic/time';
import { useSession } from '@/data/session';
import { formatMoney } from '@/lib/format';
import { assetProblem, bookerProblem, checkPeriod } from './availability';
import { useBooker } from './hooks';
import type { Item, Row } from './model';
import { rangeProblems } from './parts';
import { estimateCost, lengthText, ratesText } from './times';

const iso = (t: number) => new Date(t).toISOString();

export function SelectionCard({ row, start, end, items, onBook, onClose }: { row: Row; start: number; end: number; items: Item[] | undefined; onBook: () => void; onClose: () => void }) {
  const { who } = useSession();
  const { booker } = useBooker();
  const check = checkPeriod(items, start, end, { assetId: row.assetId });
  const unavailable = assetProblem(row.asset);
  const person = !who.isManager && booker ? bookerProblem(booker, row.asset, end) : '';
  const times = rangeProblems({ start: iso(start), end: iso(end) }, row.asset.maxBookingHours, who.isManager);
  const cost = estimateCost(row.asset, start, end);
  const errors = [person, check.message, ...times.errors].filter(Boolean);
  const warnings = [unavailable && `${unavailable} Only a Maintenance booking can use it.`, ...times.warnings].filter(Boolean);
  return (
    <div className="grid w-[min(20rem,calc(100vw-2rem))] gap-3 p-3">
      <div className="flex items-center gap-3">
        <AssetIcon kind={row.iconKind} color={row.hireStatus?.color} size={36} />
        <div className="min-w-0">
          <div className="font-semibold">{row.assetId}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.model}
            {row.registration ? ` · ${row.registration}` : ''}
          </div>
        </div>
      </div>
      <div className="rounded-lg bg-muted/70 px-3 py-2">
        <div className="text-sm font-medium">{rangeLabel(start, end)}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular">
          <span>{lengthText(end - start)}</span>
          {cost !== undefined && (
            <span>
              · est. <span className="font-medium text-foreground">{formatMoney(cost)}</span>
            </span>
          )}
          {ratesText(row.asset) && <span>· {ratesText(row.asset)}</span>}
        </div>
      </div>
      <ul className="grid gap-1.5 text-[13px]" aria-live="polite">
        {errors.map((message) => (
          <li key={message} className="flex items-start gap-1.5 text-danger">
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
            {message}
          </li>
        ))}
        {warnings.map((message) => (
          <li key={message} className="flex items-start gap-1.5 text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {message}
          </li>
        ))}
        {!errors.length && (
          <li className="flex items-center gap-1.5 font-medium text-success">
            <CheckCircle2 className="size-3.5" />
            {row.assetId} is free then
          </li>
        )}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onBook} disabled={errors.length > 0} autoFocus>
          Book
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
