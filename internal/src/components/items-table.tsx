// A page of items as a table (cards on a phone): sorted and paged by the search, with the columns a
// page asks for, and optionally rows to select. My View's lists and All Items use it.

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '@react-frontends/shared/components';
import { useSearch } from '@react-frontends/shared/data';
import { formatDate, formatDateTime, formatNumber, relative } from '@react-frontends/shared/format';
import { Button, Checkbox, Skeleton, Table, TBody, TD, TH, THead, Tip, TR } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { ITEMS } from '@/data/sdms';
import type { EsRequest } from '@/domain/queries';
import type { Item } from '@/domain/types';
import { Chip, ItemLink, ItemStatus, itemPath, names, TypeIcon } from './item-bits';

export type ColumnKey =
  | 'id' | 'project' | 'summary' | 'type' | 'status' | 'assignee' | 'priority' | 'severity' | 'category'
  | 'createdBy' | 'reporter' | 'created' | 'updated' | 'tags' | 'reproducibility' | 'resolution' | 'progressNote';

interface Column {
  label: string;
  /** The field to sort by (Elasticsearch); none = not sortable. */
  sort?: string;
  /** Fields the column needs from each item. */
  fields: string[];
  cell: (item: Item) => ReactNode;
  className?: string;
}

export const COLUMNS: Record<ColumnKey, Column> = {
  id: { label: 'ID', sort: 'itemId', fields: ['itemId', 'itemRef'], cell: (i) => <ItemLink item={i} />, className: 'w-24' },
  project: { label: 'Project', sort: 'projectRel.name', fields: ['projectRel'], cell: (i) => <Clipped text={names(i.projectRel)} className="max-w-44 text-muted-foreground" /> },
  summary: {
    label: 'Summary',
    sort: 'summary',
    fields: ['summary'],
    cell: (i) => (
      <Link to={itemPath(i)} className="line-clamp-2 font-medium hover:text-primary">
        {i.summary || '(no summary)'}
      </Link>
    ),
    className: 'min-w-64',
  },
  type: { label: 'Type', sort: 'typeRel.name', fields: ['typeRel'], cell: (i) => <TypeIcon name={i.typeRel?.[0]?.name} withName />, className: 'whitespace-nowrap' },
  status: { label: 'Status', sort: 'statusRel.name', fields: ['statusRel'], cell: (i) => <ItemStatus value={i.statusRel} /> },
  assignee: { label: 'Assignee', sort: 'assigneeRel.name', fields: ['assigneeRel'], cell: (i) => (i.assigneeRel?.length ? names(i.assigneeRel) : <span className="text-muted-foreground">Unassigned</span>), className: 'whitespace-nowrap' },
  priority: { label: 'Priority', sort: 'priorityRel.indexNum', fields: ['priorityRel'], cell: (i) => (i.priorityRel?.[0] ? <Chip>{i.priorityRel[0].name}</Chip> : '–') },
  severity: { label: 'Severity', sort: 'severityRel.indexNum', fields: ['severityRel'], cell: (i) => (i.severityRel?.[0] ? <Chip>{i.severityRel[0].name}</Chip> : '–') },
  category: { label: 'Category', sort: 'categoryRel.name', fields: ['categoryRel'], cell: (i) => names(i.categoryRel), className: 'whitespace-nowrap' },
  createdBy: { label: 'Created by', sort: 'createdByRel.name', fields: ['createdByRel'], cell: (i) => names(i.createdByRel), className: 'whitespace-nowrap' },
  reporter: { label: 'Reporter', sort: 'reporterRel.name', fields: ['reporterRel'], cell: (i) => names(i.reporterRel), className: 'whitespace-nowrap' },
  created: { label: 'Created', sort: 'createdDate', fields: ['createdDate', 'systemHeader.documentCreatedDate'], cell: (i) => <When value={i.createdDate ?? i.systemHeader?.documentCreatedDate} /> },
  updated: { label: 'Updated', sort: 'updatedDate', fields: ['updatedDate'], cell: (i) => <When value={i.updatedDate} /> },
  tags: { label: 'Tags', fields: ['tagsRel'], cell: (i) => <Clipped text={names(i.tagsRel)} className="max-w-48 text-muted-foreground" /> },
  reproducibility: { label: 'Reproducibility', sort: 'reproducibilityRel.name', fields: ['reproducibilityRel'], cell: (i) => names(i.reproducibilityRel) },
  resolution: { label: 'Resolution', sort: 'resolutionRel.name', fields: ['resolutionRel'], cell: (i) => names(i.resolutionRel) },
  progressNote: { label: 'Progress note', fields: ['progressNote'], cell: (i) => <span className="line-clamp-2 text-muted-foreground">{i.progressNote || '–'}</span>, className: 'min-w-56' },
};

/** Text cut to its column's width with an ellipsis (a table cell can't truncate itself), whole on hover. */
function Clipped({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('block truncate', className)} title={text}>
      {text}
    </span>
  );
}

function When({ value }: { value: unknown }) {
  if (!value) return <span className="text-muted-foreground">–</span>;
  return (
    <Tip content={formatDateTime(value)}>
      <span className="whitespace-nowrap text-muted-foreground tabular-nums">{relative(value)}</span>
    </Tip>
  );
}

export interface SortState {
  field: string;
  dir: 'asc' | 'desc';
}

/** The sort as Elasticsearch takes it: missing values last, unmapped fields don't fail. */
export const sortClause = (s: SortState) => [{ [s.field]: { order: s.dir, missing: '_last', unmapped_type: 'keyword' } }];

export interface ItemsTableProps {
  /** The search (its sort is replaced by the table's); null waits. */
  request: EsRequest | null;
  columns: ColumnKey[];
  defaultSort?: SortState;
  pageSize?: number;
  /** Rows can be ticked; the ticked items (with the columns' fields) come back. */
  selection?: { selected: Item[]; onChange: (items: Item[]) => void };
  /** Shown when nothing matches. */
  empty?: ReactNode;
  /** Told the number of matches. */
  onTotal?: (total: number) => void;
  /** The sort, when the page keeps it (e.g. in its URL); without it the table keeps its own. */
  sort?: SortState;
  /** Told when a column header changes the sort. */
  onSortChange?: (sort: SortState) => void;
  /** Extra classes for a column's header and cells (e.g. 'hidden xl:table-cell' on narrower screens). */
  columnClasses?: Partial<Record<ColumnKey, string>>;
  className?: string;
}

export function ItemsTable({ request, columns, defaultSort = { field: 'updatedDate', dir: 'desc' }, pageSize = 25, selection, empty, onTotal, sort: sortProp, onSortChange, columnClasses, className }: ItemsTableProps) {
  const [ownSort, setOwnSort] = useState<SortState>(defaultSort);
  const sort = sortProp ?? ownSort;
  const setSort = (next: SortState) => {
    setOwnSort(next);
    onSortChange?.(next);
  };
  const [page, setPage] = useState(0);
  const requestKey = JSON.stringify(request);
  useEffect(() => setPage(0), [requestKey, sort.field, sort.dir]);

  const include = useMemo(
    () => [...new Set(['documentId', 'itemId', 'itemRef', 'summary', 'statusRel', 'systemHeader.summaryName', 'appTags', ...columns.flatMap((c) => COLUMNS[c].fields)])],
    [columns],
  );
  const search = useSearch<Item>(ITEMS, request ? { ...request, sort: sortClause(sort) } : null, { size: pageSize, page, include, trackTotal: true });
  const total = search.data?.total ?? 0;
  useEffect(() => {
    if (search.data) onTotal?.(search.data.total);
  }, [search.data, onTotal]);

  const rows = search.data?.documents ?? [];
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const isSelected = (i: Item) => !!selection?.selected.some((s) => s.documentId === i.documentId);
  const toggle = (i: Item) => selection?.onChange(isSelected(i) ? selection.selected.filter((s) => s.documentId !== i.documentId) : [...selection.selected, i]);
  const allOnPage = rows.length > 0 && rows.every(isSelected);
  const togglePage = () =>
    selection?.onChange(allOnPage ? selection.selected.filter((s) => !rows.some((r) => r.documentId === s.documentId)) : [...selection.selected, ...rows.filter((r) => !isSelected(r))]);

  const header = (key: ColumnKey) => {
    const col = COLUMNS[key];
    if (!col.sort) return col.label;
    const active = sort.field === col.sort;
    return (
      <button
        type="button"
        className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}
        onClick={() => setSort(active ? { field: col.sort!, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { field: col.sort!, dir: key === 'updated' || key === 'created' || key === 'priority' || key === 'severity' ? 'desc' : 'asc' })}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        {col.label}
        {active && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    );
  };

  if (search.isError) return <Alert className={className}>{(search.error as Error).message}</Alert>;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Table: tablet and up */}
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <THead>
            <TR>
              {selection && (
                <TH className="w-8">
                  <Checkbox checked={allOnPage} onCheckedChange={togglePage} aria-label="Select the items on this page" />
                </TH>
              )}
              {columns.map((c) => (
                <TH key={c} className={cn(COLUMNS[c].className?.includes('w-') ? COLUMNS[c].className : undefined, columnClasses?.[c])}>
                  {header(c)}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {search.isPending
              ? Array.from({ length: Math.min(pageSize, 6) }, (_, i) => (
                  <TR key={i}>
                    {selection && <TD />}
                    {columns.map((c) => (
                      <TD key={c} className={columnClasses?.[c]}>
                        <Skeleton className="h-4 w-full max-w-40" />
                      </TD>
                    ))}
                  </TR>
                ))
              : rows.map((item) => (
                  <TR key={item.documentId} data-selected={isSelected(item) || undefined} className="data-[selected]:bg-primary/5">
                    {selection && (
                      <TD>
                        <Checkbox checked={isSelected(item)} onCheckedChange={() => toggle(item)} aria-label={`Select ${item.itemId}`} />
                      </TD>
                    )}
                    {columns.map((c) => (
                      <TD key={c} className={cn(COLUMNS[c].className, columnClasses?.[c])}>
                        {COLUMNS[c].cell(item)}
                      </TD>
                    ))}
                  </TR>
                ))}
          </TBody>
        </Table>
      </div>

      {/* Cards: phone */}
      <ul className="space-y-2 sm:hidden">
        {search.isPending
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 w-full" />)
          : rows.map((item) => (
              <li key={item.documentId} className="flex gap-3 rounded-lg border border-border bg-card p-3">
                {selection && <Checkbox checked={isSelected(item)} onCheckedChange={() => toggle(item)} aria-label={`Select ${item.itemId}`} className="mt-0.5" />}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <TypeIcon name={item.typeRel?.[0]?.name} />
                    <ItemLink item={item} />
                    <span className="ml-auto">
                      <ItemStatus value={item.statusRel} className="text-xs" />
                    </span>
                  </div>
                  <Link to={itemPath(item)} className="line-clamp-2 text-sm font-medium">
                    {item.summary || '(no summary)'}
                  </Link>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {item.assigneeRel?.[0] && <span>{item.assigneeRel[0].name}</span>}
                    {item.projectRel?.[0] && <span>{item.projectRel[0].name}</span>}
                    {item.updatedDate && <span>{formatDate(item.updatedDate)}</span>}
                  </div>
                </div>
              </li>
            ))}
      </ul>

      {!search.isPending && rows.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">{empty ?? 'No items.'}</div>}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {total > 0 ? `${formatNumber(page * pageSize + 1)}–${formatNumber(Math.min(total, (page + 1) * pageSize))} of ${formatNumber(total)}` : search.isPending ? 'Loading…' : ''}
          {selection && selection.selected.length > 0 && <span className="ml-2 font-medium text-foreground">· {selection.selected.length} selected</span>}
        </span>
        <span className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => void search.refetch()} aria-label="Reload" disabled={search.isFetching}>
            <RefreshCw className={cn('size-4', search.isFetching && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="tabular-nums">
            {page + 1} / {formatNumber(pages)}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages || (page + 1) * pageSize >= 10000} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Button>
        </span>
      </div>
    </div>
  );
}
