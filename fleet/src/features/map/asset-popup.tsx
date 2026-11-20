// The card over a selected asset on a map: what it is, its status, where and when it was last seen,
// and what to do with it.

import { CalendarPlus, Clock, Gauge, MapPin, X } from 'lucide-react';
import { Link } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { StatusBadge } from '@react-frontends/shared/components';
import { Button, Tip } from '@react-frontends/shared/ui';
import { first, nameOf, type Asset } from '@/domain/types';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { formatMeter } from '@/lib/format';
import { hireColor, positionLabel, positionSpeed } from './layers';

const STALE_MS = 24 * 3_600_000;

/** Whether an asset can be booked now (bookable and active). */
export const canBook = (asset: Asset) => asset.bookableBool !== false && nameOf(asset.assetStatusRel) === 'Active';

export function AssetPopup({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const seen = asset.lastPositionDate;
  const stale = seen ? Date.now() - new Date(seen).getTime() > STALE_MS : false;
  const where = positionLabel(asset);
  const speed = positionSpeed(asset);
  const lifecycle = nameOf(asset.assetStatusRel);
  const bookable = canBook(asset);
  return (
    <div className="w-[min(18rem,calc(100vw-3rem))] p-3.5 text-sm">
      <div className="flex items-start gap-3">
        <AssetIcon kind={asset.iconKind} color={hireColor(asset)} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold tracking-tight">{asset.assetId}</div>
          <div className="truncate text-[13px] text-muted-foreground">{[asset.makeModel, asset.registration].filter(Boolean).join(' · ')}</div>
        </div>
        <button type="button" onClick={onClose} className="-mt-1 -mr-1 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <StatusBadge value={asset.hireStatusRel} />
        {lifecycle && lifecycle !== 'Active' && <StatusBadge value={asset.assetStatusRel} />}
      </div>
      <dl className="mt-3 grid gap-1.5 text-[13px]">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Last seen</dt>
          <Clock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <dd className={stale ? 'text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))]' : undefined} title={formatDateTime(seen)}>
            {seen ? `Seen ${relative(seen)}` : 'No position time'}
            {speed ? <span className="text-muted-foreground"> · {speed} km/h</span> : null}
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="sr-only">Position</dt>
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <dd className="min-w-0">
            {where || 'Unknown'}
            {nameOf(asset.locationRel) && <span className="text-muted-foreground"> · home {nameOf(asset.locationRel)}</span>}
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="sr-only">Meter</dt>
          <Gauge className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <dd>{formatMeter(asset.meterReadingNum, asset.primaryMeterUnit) || 'No meter reading'}</dd>
        </div>
      </dl>
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to={`/assets/${asset.documentId}`}>Open</Link>
        </Button>
        {bookable ? (
          <Button size="sm" asChild>
            <Link to={`/bookings/new?asset=${encodeURIComponent(asset.documentId)}`}>
              <CalendarPlus />
              Book
            </Link>
          </Button>
        ) : (
          <Tip content={`${first(asset.assetStatusRel)?.name ?? 'This asset'}: not bookable`}>
            <span tabIndex={0} className="inline-flex">
              <Button size="sm" disabled className="w-full">
                <CalendarPlus />
                Book
              </Button>
            </span>
          </Tip>
        )}
      </div>
    </div>
  );
}
