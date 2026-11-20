// My View's eight lists (the template's datatables: Assigned to me … Deferred). One row of tiles
// counts them all; the tile picked shows its list below, 10 a page, latest change first.

import { keepPreviousData, useQueries } from '@tanstack/react-query';
import { CircleCheck, CirclePause, Eye, Flag, History, MessageCircleQuestion, UserCheck, UserX, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { api } from '@react-frontends/shared/api';
import { KpiTile, type KpiTone } from '@react-frontends/shared/components';
import type { Clause } from '@react-frontends/shared/es';
import { formatNumber } from '@react-frontends/shared/format';
import { ItemsTable, type ColumnKey } from '@/components/items-table';
import { ITEMS } from '@/data/sdms';
import { MY_VIEW_PANELS, MY_VIEW_TITLES, myViewQuery, type MyViewPanel } from '@/domain/queries';

/** The template's columns (ID, Project, Summary, Type, Status, Severity, Priority, Created By, Updated). */
const COLUMNS: ColumnKey[] = ['id', 'project', 'summary', 'type', 'status', 'severity', 'priority', 'createdBy', 'updated'];

const PANELS: Record<MyViewPanel, { icon: LucideIcon; tone: KpiTone; hint: string; empty: string }> = {
  assigned: { icon: UserCheck, tone: 'primary', hint: 'Not resolved or closed', empty: 'Nothing open is assigned to you.' },
  feedback: { icon: MessageCircleQuestion, tone: 'warning', hint: 'Waiting on your answer', empty: 'No one is waiting on your feedback.' },
  unassigned: { icon: UserX, tone: 'danger', hint: 'Open, with no assignee', empty: 'Every open item has an assignee.' },
  reported: { icon: Flag, tone: 'info', hint: 'Not resolved or closed', empty: 'Nothing you reported is open.' },
  resolved: { icon: CircleCheck, tone: 'success', hint: 'Waiting to be closed', empty: 'No resolved items.' },
  recent: { icon: History, tone: 'neutral', hint: 'Changed in the last 30 days', empty: 'Nothing changed in the last 30 days.' },
  monitored: { icon: Eye, tone: 'neutral', hint: 'Items you follow', empty: 'You aren’t monitoring any items.' },
  deferred: { icon: CirclePause, tone: 'neutral', hint: 'Put off for later', empty: 'No deferred items.' },
};

export const isPanel = (value: string | null): value is MyViewPanel => !!value && (MY_VIEW_PANELS as readonly string[]).includes(value);

/** Each list's number of items: a search for the count only, refreshed by saves like the lists. */
function useCounts(requests: Record<MyViewPanel, ReturnType<typeof myViewQuery>>) {
  const options = { size: 0, trackTotal: true };
  const results = useQueries({
    queries: MY_VIEW_PANELS.map((panel) => ({
      queryKey: ['search', ITEMS, requests[panel], options],
      queryFn: () => api.search(requests[panel], options),
      placeholderData: keepPreviousData,
    })),
  });
  return Object.fromEntries(MY_VIEW_PANELS.map((panel, i) => [panel, { total: results[i].data?.total, loading: results[i].isPending, error: results[i].isError }])) as Record<
    MyViewPanel,
    { total?: number; loading: boolean; error: boolean }
  >;
}

export function MyLists({ me, scope, panel, onPanel }: { me: string; scope: Clause | undefined; panel: MyViewPanel; onPanel: (panel: MyViewPanel) => void }) {
  const requests = useMemo(() => Object.fromEntries(MY_VIEW_PANELS.map((p) => [p, myViewQuery(p, me, scope)])) as Record<MyViewPanel, ReturnType<typeof myViewQuery>>, [me, scope]);
  const counts = useCounts(requests);
  const style = PANELS[panel];

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Lists"
        className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 md:grid-cols-4 [&>*]:w-44 [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto"
      >
        {MY_VIEW_PANELS.map((p) => {
          const s = PANELS[p];
          const count = counts[p];
          return (
            <KpiTile
              key={p}
              label={MY_VIEW_TITLES[p]}
              value={count.error ? '–' : formatNumber(count.total ?? 0)}
              hint={s.hint}
              icon={s.icon}
              tone={count.total ? s.tone : 'neutral'}
              loading={count.loading}
              active={p === panel}
              onClick={() => onPanel(p)}
            />
          );
        })}
      </div>

      {/* A card on wider screens; on a phone the items are cards themselves. */}
      <section aria-label={MY_VIEW_TITLES[panel]} className="sm:overflow-hidden sm:rounded-xl sm:border sm:border-border sm:bg-card sm:shadow-card">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-3 sm:px-5 sm:pt-4">
          <h2 className="text-[15px] font-semibold tracking-tight">{MY_VIEW_TITLES[panel]}</h2>
          <span className="text-[13px] text-muted-foreground">{style.hint}</span>
        </div>
        <ItemsTable
          key={panel}
          request={requests[panel]}
          columns={COLUMNS}
          pageSize={10}
          defaultSort={{ field: 'updatedDate', dir: 'desc' }}
          empty={style.empty}
          className="sm:pb-2 sm:[&>div:last-child]:px-4 [&_td]:px-2.5 [&_th]:px-2.5"
        />
      </section>
    </div>
  );
}
