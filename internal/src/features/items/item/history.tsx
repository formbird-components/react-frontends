// History: the item's versions with what changed in each (ruleLoadVersions, here versionHistory and
// describeChanges), newest first, and the history migrated from Mantis (ruleDisplayHistoryOldData).
// Versions aren't links: the app has no viewer for an old version.

import { useState } from 'react';
import { Alert } from '@react-frontends/shared/components';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { Badge, Button, Skeleton, Table, TBody, TD, TH, THead, Tip, TR } from '@react-frontends/shared/ui';
import { describeChanges, versionHistory, type HistoryChange, type VersionEntry } from '@/domain/rules';
import type { Item } from '@/domain/types';
import { useItemVersions } from './data';
import { oldHistoryRows } from './item-logic';
import { Section } from './sections';

const OLD_ROWS = 10;

function Change({ change }: { change: HistoryChange }) {
  const verb = change.kind === 'note' ? '' : change.kind === 'removed' ? 'Removed' : change.kind === 'added' ? 'Added' : 'Changed';
  return (
    <li className="text-sm">
      {change.kind === 'note' ? (
        <span>{change.value}</span>
      ) : (
        <>
          <span className="text-muted-foreground">{verb} </span>
          <span className="font-medium">{change.label}</span>
          {change.value && (
            <>
              <span className="text-muted-foreground"> to </span>
              <span className="break-words [overflow-wrap:anywhere]">{change.value}</span>
            </>
          )}
        </>
      )}
    </li>
  );
}

function Version({ entry }: { entry: VersionEntry }) {
  return (
    <li className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-3">
      <span className="relative z-10 mt-1.5 size-2.5 justify-self-center rounded-full bg-border ring-4 ring-card data-[current=true]:bg-primary" data-current={entry.current} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{entry.by ?? 'Someone'}</span>
          {entry.date && (
            <Tip content={formatDateTime(entry.date)}>
              <time dateTime={entry.date} className="text-xs text-muted-foreground">
                {relative(entry.date)}
              </time>
            </Tip>
          )}
          {entry.current && <Badge tone="primary">Current</Badge>}
        </div>
        {entry.changes.length && !entry.initial ? (
          <ul className="mt-1 grid gap-0.5">
            {entry.changes.map((c) => (
              <Change key={c.field} change={c} />
            ))}
          </ul>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">{describeChanges(entry)}</p>
        )}
      </div>
    </li>
  );
}

export function HistorySection({ item }: { item: Item }) {
  const versions = useItemVersions(item.documentId, item.systemHeader?.versionId);
  const entries = versionHistory(versions.data ?? []).reverse();
  const old = oldHistoryRows(item.historyOldRel);
  const [allOld, setAllOld] = useState(false);
  const oldShown = allOld ? old : old.slice(0, OLD_ROWS);
  return (
    <Section id="history" title="History" description={entries.length === 1 ? 'Only the current version is kept here.' : undefined}>
      <div className="grid grid-cols-1 gap-6">
        {versions.isError ? (
          <Alert>{(versions.error as Error).message}</Alert>
        ) : versions.isPending ? (
          <div className="grid grid-cols-1 gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : !entries.length ? (
          <p className="text-sm text-muted-foreground">No versions found.</p>
        ) : (
          <ol className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[7.5px] before:w-px before:bg-border" aria-label="Versions">
            {entries.map((e, i) => (
              <Version key={e.versionId ?? i} entry={e} />
            ))}
          </ol>
        )}

        {old.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            <h3 className="text-sm font-semibold">
              Migrated from Mantis <span className="font-normal text-muted-foreground">({old.length})</span>
            </h3>
            <div className="-mx-5 hidden sm:-mx-6 md:block">
              <Table className="text-[13px]">
                <THead>
                  <TR>
                    <TH className="sm:pl-6">Date</TH>
                    <TH>User</TH>
                    <TH>Message</TH>
                    <TH className="sm:pr-6">Change</TH>
                  </TR>
                </THead>
                <TBody>
                  {oldShown.map((r) => (
                    <TR key={r.key}>
                      <TD className="py-2 whitespace-nowrap text-muted-foreground tabular-nums sm:pl-6">{formatDateTime(r.date)}</TD>
                      <TD className="py-2 whitespace-nowrap">{r.user}</TD>
                      <TD className="py-2">{r.message}</TD>
                      <TD className="py-2 break-words text-muted-foreground [overflow-wrap:anywhere] sm:pr-6">{r.change}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <ul className="grid grid-cols-1 gap-2 md:hidden">
              {oldShown.map((r) => (
                <li key={r.key} className="rounded-lg border border-border px-3 py-2 text-[13px]">
                  <div className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
                    <span>{r.user}</span>
                    <span className="tabular-nums">{formatDateTime(r.date)}</span>
                  </div>
                  <div className="mt-0.5">
                    {r.message}
                    {r.change && <span className="text-muted-foreground"> · {r.change}</span>}
                  </div>
                </li>
              ))}
            </ul>
            {old.length > OLD_ROWS && (
              <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setAllOld((a) => !a)}>
                {allOld ? 'Show fewer' : `Show all ${old.length}`}
              </Button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
