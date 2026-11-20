// Recent (Formbird's "My Recent Documents"): the documents whose latest version you saved, newest
// first, 25 at a time. Items open their page here; other documents are listed but not opened (this
// app has no page for them). SDMS admins can show another person's (the original's "Impersonate").

import { ChevronLeft, ChevronRight, History, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert, EmptyState, Page, PageHeader } from '@react-frontends/shared/components';
import { useSearch } from '@react-frontends/shared/data';
import { formatDateTime, formatNumber, relative } from '@react-frontends/shared/format';
import { Badge, Button, Card, Skeleton, Table, TBody, TD, TH, THead, Tip, TR } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { itemPath } from '@/components/item-bits';
import { PeoplePicker } from '@/components/pickers';
import { useAccount, useIsAdmin } from '@/data/sdms';
import { recentDocumentsQuery } from '@/domain/queries';
import type { Item, Ref } from '@/domain/types';
import { decodeEntities, isItem, kindOf } from './kind';

const PAGE_SIZE = 25;
const FIELDS = ['documentId', 'appTags', 'itemRef', 'itemId', 'systemHeader.summaryName', 'systemHeader.systemType', 'systemHeader.serverUpdatedDate', 'systemHeader.createdDate'];

/** The person in the address: "?person=<documentId>.<name>". */
function parsePerson(value: string | null): Ref | undefined {
  const i = value?.indexOf('.') ?? -1;
  if (!value || i <= 0) return undefined;
  const documentId = value.slice(0, i);
  return /^[\w-]+$/.test(documentId) ? { documentId, name: value.slice(i + 1) } : undefined;
}

export function RecentPage() {
  const account = useAccount();
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const other = isAdmin ? parsePerson(params.get('person')) : undefined;
  const personId = other?.documentId ?? account.documentId;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [personId]);

  const request = useMemo(() => recentDocumentsQuery(personId), [personId]);
  const search = useSearch<Item>('recent', request, { size: PAGE_SIZE, page, include: FIELDS, trackTotal: true });
  const docs = search.data?.documents ?? [];
  const total = search.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const whose = other ? other.name : 'you';

  return (
    <Page>
      <PageHeader
        title="Recent"
        description={other ? `What ${other.name} saved last, newest first.` : 'What you saved last, newest first.'}
        actions={
          isAdmin && (
            <div className="grid w-72 max-w-full gap-1">
              <label htmlFor="recent-person" className="text-xs font-medium text-muted-foreground">
                Show for another person
              </label>
              <PeoplePicker
                id="recent-person"
                field="accountRel"
                projectIds={[]}
                value={other ? [other] : []}
                placeholder="You"
                onChange={(v) => setParams(v[0] ? { person: `${v[0].documentId}.${v[0].name}` } : {}, { replace: true })}
              />
            </div>
          )
        }
      />

      {search.isError ? (
        <Alert>
          {(search.error as Error).message}{' '}
          <button type="button" className="cursor-pointer font-medium underline" onClick={() => void search.refetch()}>
            Try again
          </button>
        </Alert>
      ) : !search.isPending && !docs.length ? (
        <Card>
          <EmptyState icon={History} title="Nothing saved yet">
            {other ? `${other.name} hasn’t saved anything yet.` : 'Documents you save show here, newest first.'}
          </EmptyState>
        </Card>
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', search.isPlaceholderData && 'opacity-60')} aria-busy={search.isFetching}>
          {/* Table: tablet and up */}
          <div className="hidden sm:block">
            <Table>
              <THead className="bg-muted/40">
                <tr>
                  <TH>Name</TH>
                  <TH className="w-44">Kind</TH>
                  <TH className="w-48">Saved</TH>
                </tr>
              </THead>
              <TBody>
                {search.isPending
                  ? Array.from({ length: 8 }, (_, i) => (
                      <TR key={i}>
                        <TD>
                          <Skeleton className="h-4 w-80 max-w-full" />
                        </TD>
                        <TD>
                          <Skeleton className="h-4 w-20" />
                        </TD>
                        <TD>
                          <Skeleton className="h-4 w-28" />
                        </TD>
                      </TR>
                    ))
                  : docs.map((doc) => (
                      <TR key={doc.documentId}>
                        <TD className="max-w-0 w-full">
                          <Name doc={doc} />
                        </TD>
                        <TD>
                          <Kind doc={doc} />
                        </TD>
                        <TD>
                          <Saved doc={doc} />
                        </TD>
                      </TR>
                    ))}
              </TBody>
            </Table>
          </div>

          {/* List: phone */}
          <ul className="divide-y divide-border sm:hidden">
            {search.isPending
              ? Array.from({ length: 6 }, (_, i) => (
                  <li key={i} className="grid gap-2 px-4 py-3">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-1/3" />
                  </li>
                ))
              : docs.map((doc) => (
                  <li key={doc.documentId} className="grid gap-1.5 px-4 py-3">
                    <Name doc={doc} wrap />
                    <div className="flex items-center gap-2">
                      <Kind doc={doc} />
                      <Saved doc={doc} />
                    </div>
                  </li>
                ))}
          </ul>

          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span aria-live="polite">{total > 0 ? `${formatNumber(page * PAGE_SIZE + 1)}–${formatNumber(Math.min(total, (page + 1) * PAGE_SIZE))} of ${formatNumber(total)} saved by ${whose}` : 'Loading…'}</span>
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => void search.refetch()} aria-label="Reload" disabled={search.isFetching}>
                <RefreshCw className={cn(search.isFetching && 'animate-spin')} />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <span className="tabular-nums">
                {page + 1} / {formatNumber(pages)}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages || (page + 1) * PAGE_SIZE >= 10000} aria-label="Next page">
                <ChevronRight />
              </Button>
            </span>
          </div>
        </Card>
      )}
    </Page>
  );
}

const nameOf = (doc: Item) => decodeEntities(doc.systemHeader?.summaryName ?? '') || '(no name)';

function Name({ doc, wrap }: { doc: Item; wrap?: boolean }) {
  const fit = wrap ? 'line-clamp-2' : 'truncate';
  if (isItem(doc)) {
    return (
      <Link to={itemPath(doc)} className={cn('block font-medium hover:text-primary hover:underline', fit)}>
        {nameOf(doc)}
      </Link>
    );
  }
  return (
    <Tip content="Only items open here.">
      <span className={cn('block text-foreground/90', fit)}>{nameOf(doc)}</span>
    </Tip>
  );
}

function Kind({ doc }: { doc: Item }) {
  return <Badge tone={isItem(doc) ? 'primary' : 'neutral'}>{kindOf(doc)}</Badge>;
}

function Saved({ doc }: { doc: Item }) {
  const when = doc.systemHeader?.serverUpdatedDate ?? doc.systemHeader?.createdDate;
  if (!when) return <span className="text-muted-foreground">–</span>;
  return (
    <Tip content={relative(when)}>
      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:text-sm">{formatDateTime(when)}</span>
    </Tip>
  );
}
