// The fleet in the shared app shell: its brand, the pages the person's role sees, the New menu, and
// what ⌘K finds (assets, bookings, workshop requests).

import { CalendarPlus, ClipboardCheck, Fuel, Wrench } from 'lucide-react';
import { api } from '@react-frontends/shared/api';
import { StatusBadge } from '@react-frontends/shared/components';
import { contains } from '@react-frontends/shared/es';
import { AppShell, type NewItem, type PaletteGroup, type PaletteSearch } from '@react-frontends/shared/shell';
import { AssetIcon } from '@/components/asset-icon';
import { useSession } from '@/data/session';
import type { Asset, Booking, WorkshopRequest } from '@/domain/types';
import { fleetQuery } from '@/lib/es';
import { BRAND } from './brand';
import { navFor } from './nav';

const NEW_ITEMS: NewItem[] = [
  { label: 'Booking', icon: CalendarPlus, to: '/bookings/new' },
  { label: 'Daily Driver check', icon: ClipboardCheck, to: '/checks/new' },
  { label: 'Report a fault', icon: Wrench, to: '/workshop/requests/new' },
  { label: 'Fuel receipt', icon: Fuel, to: '/fuel/new' },
];

/** ⌘K: assets, bookings and workshop requests matching the text (a search that fails shows nothing). */
const search: PaletteSearch = async (text) => {
  const [assets, bookings, requests] = await Promise.all([
    api.search<Asset>(fleetQuery('asset', { filter: [contains(['assetId', 'makeModel', 'registration'], text)], sort: [{ 'assetId.lcase': 'asc' }] }), {
      size: 6,
      include: ['documentId', 'assetId', 'makeModel', 'registration', 'iconKind', 'hireStatusRel'],
    }).catch(() => undefined),
    api.search<Booking>(fleetQuery('booking', { filter: [contains(['bookingRef', 'systemHeader.summaryName'], text)], sort: [{ startDate: 'desc' }] }), {
      size: 5,
      include: ['documentId', 'bookingRef', 'systemHeader.summaryName', 'bookingStatusRel'],
    }).catch(() => undefined),
    api.search<WorkshopRequest>(fleetQuery('request', { filter: [contains(['requestRef', 'systemHeader.summaryName'], text)], sort: [{ 'systemHeader.documentCreatedDate': 'desc' }] }), {
      size: 5,
      include: ['documentId', 'requestRef', 'systemHeader.summaryName', 'requestStatusRel'],
    }).catch(() => undefined),
  ]);
  const groups: PaletteGroup[] = [
    {
      heading: 'Assets',
      items: (assets?.documents ?? []).map((a) => ({
        id: `asset-${a.documentId}`,
        to: `/assets/${a.documentId}`,
        icon: <AssetIcon kind={a.iconKind} size={24} />,
        label: <span className="font-medium">{a.assetId}</span>,
        detail: a.makeModel,
        trailing: <StatusBadge value={a.hireStatusRel} />,
      })),
    },
    {
      heading: 'Bookings',
      items: (bookings?.documents ?? []).map((b) => ({
        id: `booking-${b.documentId}`,
        to: `/bookings/${b.documentId}`,
        icon: <CalendarPlus className="size-4 text-muted-foreground" />,
        label: <span className="truncate">{b.systemHeader.summaryName}</span>,
        trailing: <StatusBadge value={b.bookingStatusRel} />,
      })),
    },
    {
      heading: 'Workshop requests',
      items: (requests?.documents ?? []).map((r) => ({
        id: `request-${r.documentId}`,
        to: `/workshop/requests/${r.documentId}`,
        icon: <Wrench className="size-4 text-muted-foreground" />,
        label: <span className="truncate">{r.systemHeader.summaryName}</span>,
        trailing: <StatusBadge value={r.requestStatusRel} />,
      })),
    },
  ];
  return groups;
};

export function FleetShell() {
  const { account } = useSession();
  return (
    <AppShell
      brand={BRAND}
      nav={[{ items: navFor(account?.accountType) }]}
      newItems={NEW_ITEMS}
      search={search}
      searchPlaceholder="Search assets, bookings, requests…"
      searchHint=" assets, bookings…"
      searchDescription="Go to a page, an asset, a booking or a request"
      sidebarFooter={
        <>
          Data from <span className="font-medium text-foreground">fieldtec-web</span>. Saves run its rules.
        </>
      }
    />
  );
}
