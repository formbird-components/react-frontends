// All Items (Formbird's "All Items" template and its rules, All Items - onFieldState): every item on
// your projects, filtered, searched and sorted, a page of 25 at a time. A project narrows the list
// and decides the values the filters offer; SDMS admins may show every project. Filters can be saved
// (shared with Formbird's form), and the view lives in the URL so it can be shared and reloaded.
// Selected items can be changed in bulk (the bulk updater), or noted (one item); the results export
// as CSV.

import { Download, FolderInput, Copy as CopyIcon, MessageSquarePlus, PencilLine, Plus, Search, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Page, PageHeader } from '@react-frontends/shared/components';
import { formatNumber } from '@react-frontends/shared/format';
import { Button, Card, Input, Switch } from '@react-frontends/shared/ui';
import { COLUMNS, ItemsTable, sortClause, type SortState } from '@/components/items-table';
import { ProjectPicker } from '@/components/pickers';
import { rememberedProject, rememberProject, useAccount, useAllStatuses, useIsAdmin, useProject } from '@/data/sdms';
import { LAST_SAVED_FILTER_KEY } from '@/domain/model';
import { allItemsQuery, hiddenStatusNames, projectScope } from '@/domain/queries';
import type { BulkAction } from '@/domain/rules';
import type { Item, Ref, SavedFilter } from '@/domain/types';
import { AddNoteDialog } from './add-note-dialog';
import { MAX_BULK } from './bulk';
import { BulkDialog } from './bulk-dialog';
import { ColumnChooser, useColumns } from './column-chooser';
import { narrowScreenClasses } from './columns';
import { csvFileName, itemsCsv } from './csv';
import { download, EXPORT_LIMIT, fetchAll } from './export';
import { FiltersPanel } from './filters-panel';
import {
  DEFAULT_SORT,
  describesView,
  filtersOfSaved,
  hasFilters,
  isSavedFilter,
  parseView,
  readStored,
  sameFilters,
  viewToParams,
  withPresetDates,
  writeStored,
  type AllItemsView,
} from './filters';
import { SavedFiltersMenu, useSavedFilters } from './saved-filters';

const PAGE_SIZE = 25;
const PANEL_KEY = 'sdms-all-items-filters-open';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function AllItemsPage() {
  const account = useAccount();
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => parseView(params), [params]);
  // The latest view, changes included: the URL catches up a moment later (a navigation), and a
  // second change before it does builds on the first.
  const viewRef = useRef(view);
  const seenParams = useRef(params);
  if (seenParams.current !== params) {
    seenParams.current = params;
    viewRef.current = view;
  }
  const setView = useCallback(
    (changes: Partial<AllItemsView>) => {
      viewRef.current = { ...viewRef.current, ...changes };
      setParams(viewToParams(viewRef.current), { replace: true });
    },
    [setParams],
  );

  const own = account.sdmsProjectRel ?? [];
  const onlyProject: Ref | undefined = own.length === 1 ? { documentId: own[0].documentId, name: own[0].name } : undefined;
  const showAll = isAdmin && view.showAll;

  // ---- Saved filters: the one loaded last (kept in this browser, shared with Formbird's form) ----
  const saved = useSavedFilters();
  const [loaded, setLoaded] = useState<SavedFilter | null>(null);
  const remember = (filter: SavedFilter | null) => {
    setLoaded(filter);
    writeStored(LAST_SAVED_FILTER_KEY, filter);
  };
  const loadedNow = loaded ? (saved.list.find((f) => f.name === loaded.name) ?? loaded) : null;
  const modified = !!loadedNow && !sameFilters(view.filters, filtersOfSaved(loadedNow));

  // ---- Starting: an address without a view starts from the project and saved filter used last
  // (Project Access, ruleLoadFilter); a view in the address is used as it is. ----
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const last = readStored(LAST_SAVED_FILTER_KEY, isSavedFilter);
    if (!describesView(params)) {
      const project = onlyProject ?? rememberedProject()?.[0];
      const filters = last ? filtersOfSaved(last) : {};
      if (project || hasFilters(filters)) setView({ project, filters });
      setLoaded(last && hasFilters(filters) ? last : null);
    } else {
      if (onlyProject && view.project?.documentId !== onlyProject.documentId) setView({ project: onlyProject });
      setLoaded(last && sameFilters(view.filters, filtersOfSaved(last)) ? last : null);
    }
    setReady(true);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- The search box: typed here, written to the URL once typing settles ----
  const [query, setQuery] = useState(view.q);
  const debounced = useDebounced(query, 300);
  const written = useRef(view.q);
  useEffect(() => {
    if (debounced === viewRef.current.q) return;
    written.current = debounced;
    setView({ q: debounced });
  }, [debounced, setView]);
  useEffect(() => {
    // Follow the URL when something else changed it (back, a cleared search), not our own write:
    // the box may have moved on since.
    if (view.q !== written.current) {
      written.current = view.q;
      setQuery(view.q);
    }
  }, [view.q]);

  // ---- What the search needs: the project's settings, the statuses, the scope ----
  const projectDoc = useProject(view.project?.documentId);
  const project = projectDoc.data ?? null;
  const statuses = useAllStatuses();
  const scope = projectScope(view.project ? [view.project] : undefined, account, showAll);
  const peopleProjectIds = view.project ? [view.project.documentId] : showAll ? [] : own.map((p) => p.documentId);
  const waitForStatuses = !!view.filters.filterHiddenStatusRel?.length && statuses.isPending;
  const request = useMemo(() => {
    if (!ready || waitForStatuses) return null;
    const hiddenStatuses = hiddenStatusNames(view.filters.filterHiddenStatusRel, statuses.data ?? []);
    return allItemsQuery(withPresetDates(view.filters), { search: view.q, scope, hiddenStatuses });
    // scope follows the project and showAll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, waitForStatuses, view.filters, view.q, view.project?.documentId, showAll, statuses.data]);
  const requestKey = JSON.stringify(request);
  const sort: SortState = view.sort ?? DEFAULT_SORT;

  // ---- Selection (kept across pages and sorting; a new search starts afresh) ----
  const [selected, setSelected] = useState<Item[]>([]);
  useEffect(() => setSelected([]), [requestKey]);
  const [total, setTotal] = useState<number | null>(null);
  const [columns, setColumns] = useColumns();
  const [panelOpen, setPanelOpen] = useState(() => readStored(PANEL_KEY, (v): v is boolean => typeof v === 'boolean') ?? window.matchMedia('(min-width: 768px)').matches);
  const [bulk, setBulk] = useState<{ open: boolean; action: BulkAction; items: Item[] }>({ open: false, action: 'Update', items: [] });
  const [noteOpen, setNoteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const active = hasFilters(view.filters);
  const clearFilters = () => {
    setQuery('');
    setView({ filters: {}, q: '' });
    remember(null);
  };
  const openBulk = (action: BulkAction) => setBulk({ open: true, action, items: selected });

  async function exportCsv() {
    if (!request) return;
    setExporting(true);
    const id = toast.loading('Exporting…');
    try {
      const include = [...new Set(['documentId', 'itemId', 'itemRef', ...columns.flatMap((c) => COLUMNS[c].fields)])];
      // A second sort keeps the pages from overlapping when values tie.
      const ordered = { ...request, sort: [...sortClause(sort), { documentId: { order: 'asc', unmapped_type: 'keyword' } }] };
      const { items, total: all } = await fetchAll(ordered, include, { onProgress: (n, t) => toast.loading(`Exporting ${formatNumber(n)} of ${formatNumber(t)}…`, { id }) });
      download(itemsCsv(items, columns.map((key) => ({ key, label: COLUMNS[key].label }))), csvFileName());
      toast.success(all > EXPORT_LIMIT ? `Exported the first ${formatNumber(EXPORT_LIMIT)} of ${formatNumber(all)} items.` : `Exported ${formatNumber(items.length)} ${items.length === 1 ? 'item' : 'items'}.`, { id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The export didn’t finish.', { id });
    } finally {
      setExporting(false);
    }
  }

  const where = view.project ? `in ${view.project.name}` : showAll ? 'on every project' : own.length ? 'on your projects' : '';
  const description = total === null || !request ? 'Loading…' : `${formatNumber(total)} ${total === 1 ? 'item' : 'items'} ${where}`.trim();

  return (
    <Page wide>
      <PageHeader
        title="All Items"
        description={description}
        actions={
          <>
            <span className="hidden sm:contents">
              <ColumnChooser columns={columns} onChange={setColumns} />
            </span>
            <Button variant="outline" size="sm" onClick={() => void exportCsv()} disabled={!total || exporting}>
              <Download />
              Export
            </Button>
            <Button size="sm" asChild>
              <Link to="/items/new">
                <Plus />
                New item
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="items-project" className="sr-only">
          Project
        </label>
        <ProjectPicker
          id="items-project"
          field="projectRel"
          className="w-full sm:w-72"
          value={view.project ? [view.project] : []}
          showAll={showAll}
          disabled={!!onlyProject}
          placeholder={showAll || !own.length ? 'All projects' : 'All your projects'}
          onChange={(v) => {
            setView({ project: v[0] });
            rememberProject(account, v);
          }}
        />
        {isAdmin && !onlyProject && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={view.showAll} onCheckedChange={(on) => setView({ showAll: on })} />
            Show all projects
          </label>
        )}
        <div className="relative w-full sm:ml-auto sm:w-96">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search summaries, descriptions, notes" aria-label="Search items" className="pr-8 pl-9 [&::-webkit-search-cancel-button]:hidden" />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear the search">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <FiltersPanel
        filters={view.filters}
        onChange={(update) => setView({ filters: update(viewRef.current.filters) })}
        open={panelOpen}
        onOpenChange={(o) => {
          setPanelOpen(o);
          writeStored(PANEL_KEY, o);
        }}
        project={project}
        projectLoading={!!view.project && projectDoc.isPending}
        peopleProjectIds={peopleProjectIds}
        statuses={statuses.data ?? []}
        onClear={clearFilters}
        saved={
          <SavedFiltersMenu
            filters={view.filters}
            canSave={active}
            statuses={statuses.data ?? []}
            loaded={loadedNow}
            modified={modified}
            onLoad={(f) => {
              setView({ filters: filtersOfSaved(f) });
              remember(f);
            }}
            onLoaded={remember}
          />
        }
      />

      {selected.length > 0 && (
        <div role="region" aria-label="Selected items" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2">
          <span className="text-sm font-medium tabular-nums">
            {formatNumber(selected.length)} selected
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => setSelected([])}>
            Clear
          </Button>
          {selected.length > MAX_BULK && <span className="text-xs text-muted-foreground">Bulk changes take up to {MAX_BULK} items.</span>}
          <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap">
            {selected.length === 1 && (
              <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
                <MessageSquarePlus />
                Add note
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => openBulk('Update')}>
              <PencilLine />
              Update
            </Button>
            <Button variant="outline" size="sm" onClick={() => openBulk('Move')}>
              <FolderInput />
              Move
            </Button>
            <Button variant="outline" size="sm" onClick={() => openBulk('Copy')}>
              <CopyIcon />
              Copy
            </Button>
          </div>
        </div>
      )}

      {/* On a phone the items are cards of their own: no card around them. */}
      <Card className="mt-3 overflow-hidden pb-1 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none sm:pb-2">
        <ItemsTable
          request={request}
          columns={columns}
          pageSize={PAGE_SIZE}
          sort={sort}
          onSortChange={(s) => setView({ sort: s })}
          columnClasses={narrowScreenClasses(!!view.project)}
          selection={{ selected, onChange: setSelected }}
          onTotal={setTotal}
          className="[&>div:last-child]:px-1 sm:[&>div:last-child]:px-4"
          empty={
            <EmptyState
              icon={SearchX}
              title="No items match"
              className="py-6 text-foreground"
              action={
                active || view.q ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    {active && view.q ? 'Clear filters and search' : active ? 'Clear filters' : 'Clear the search'}
                  </Button>
                ) : undefined
              }
            >
              {active || view.q ? 'Try other filters or another search.' : 'There are no items here yet.'}
            </EmptyState>
          }
        />
      </Card>

      <BulkDialog
        open={bulk.open}
        onOpenChange={(open) => setBulk((b) => ({ ...b, open }))}
        action={bulk.action}
        items={bulk.items}
        project={project}
        peopleProjectIds={peopleProjectIds}
        showAllProjects={showAll}
        onFinished={(remaining) => setSelected(remaining)}
      />
      <AddNoteDialog item={selected.length === 1 ? selected[0] : null} open={noteOpen} onOpenChange={setNoteOpen} />
    </Page>
  );
}
