// Saved filters (All Items - onFieldState: ruleSetFilterDropdown, ruleLoadFilter, ruleSaveFilter,
// ruleRenameFilter, ruleDeleteFilter). The list lives on the person's SDMS user configuration, or on
// their account when they have none, and is shared with Formbird's All Items form.

import { useQueryClient } from '@tanstack/react-query';
import { Bookmark, Check, ChevronDown, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api } from '@react-frontends/shared/api';
import { SESSION_KEY } from '@react-frontends/shared/data';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  Tip,
} from '@react-frontends/shared/ui';
import { useAccount, useUserConfiguration } from '@/data/sdms';
import { FILTER_FIELDS, type ItemFilters } from '@/domain/queries';
import { putSavedFilter, removeSavedFilter, renameSavedFilter, toSavedFilter } from '@/domain/rules';
import type { LookupDoc, SavedFilter } from '@/domain/types';
import { filterNameProblem, filtersForSaving, sortedFilters } from './filters';

/** The person's saved filters and how to store a new list. */
export function useSavedFilters() {
  const account = useAccount();
  const client = useQueryClient();
  const config = useUserConfiguration();
  // As the rules read it: the configuration's list, else the account's (older filters), else none.
  const list: SavedFilter[] = config.data?.sdmsSavedFilters ?? account.sdmsSavedFilters ?? [];

  async function persist(next: SavedFilter[]) {
    const doc = config.data;
    // The configuration document when there is one, else the account (as the rules save them).
    await api.update(doc?.documentId ?? account.documentId, { sdmsSavedFilters: next });
    if (doc) {
      client.setQueryData(['user-configuration', account.documentId], { ...doc, sdmsSavedFilters: next });
      // Search sees the save a moment later.
      setTimeout(() => void client.invalidateQueries({ queryKey: ['user-configuration', account.documentId] }), 1500);
    } else {
      client.setQueryData(SESSION_KEY, { ...account, sdmsSavedFilters: next });
    }
  }

  return { list, loading: config.isPending, persist };
}

interface Props {
  /** The filters on screen. */
  filters: ItemFilters;
  /** Whether any filter is set (a saved filter needs one). */
  canSave: boolean;
  statuses: LookupDoc[];
  /** The saved filter loaded last, and whether the filters changed since. */
  loaded: SavedFilter | null;
  modified: boolean;
  /** Load a saved filter's filters. */
  onLoad: (filter: SavedFilter) => void;
  /** The saved filter now loaded (after a save or rename), or none (after a delete). */
  onLoaded: (filter: SavedFilter | null) => void;
}

type Asking = { kind: 'new' } | { kind: 'rename' } | { kind: 'delete' } | null;

export function SavedFiltersMenu({ filters, canSave, statuses, loaded, modified, onLoad, onLoaded }: Props) {
  const { list, loading, persist } = useSavedFilters();
  const [asking, setAsking] = useState<Asking>(null);
  const [busy, setBusy] = useState(false);
  const sorted = sortedFilters(list);

  /** Saves a new list; returns whether it was stored. */
  async function store(next: SavedFilter[], done: string): Promise<boolean> {
    setBusy(true);
    try {
      await persist(next);
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The filters couldn’t be saved.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const snapshot = (name: string) => toSavedFilter(name, filtersForSaving(filters, statuses), FILTER_FIELDS);

  async function saveNew(name: string): Promise<string | null> {
    const filter = snapshot(name.trim());
    if (typeof filter === 'string') return filter;
    const next = putSavedFilter(list, filter);
    if (typeof next === 'string') return 'A saved filter already has this name.';
    if (await store(next, `Saved “${filter.name}”.`)) onLoaded(next.find((f) => f.name === filter.name) ?? filter);
    return null;
  }

  async function overwrite() {
    if (!loaded) return;
    const filter = snapshot(loaded.name);
    if (typeof filter === 'string') return void toast.error('Set at least one filter to save.');
    const next = putSavedFilter(list, filter, true);
    if (typeof next === 'string') return void toast.error(next);
    if (await store(next, `Saved the changes to “${loaded.name}”.`)) onLoaded(filter);
  }

  async function rename(name: string): Promise<string | null> {
    if (!loaded) return null;
    const next = renameSavedFilter(list, loaded.name, name);
    if (typeof next === 'string') return 'A saved filter already has this name.';
    if (next === list) return null;
    const to = name.trim();
    if (await store(next, `Renamed to “${to}”.`)) onLoaded(next.find((f) => f.name === to) ?? null);
    return null;
  }

  async function remove() {
    if (!loaded) return;
    if (await store(removeSavedFilter(list, loaded.name), `Deleted “${loaded.name}”.`)) onLoaded(null);
    setAsking(null);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-56" disabled={busy}>
            <Bookmark />
            <span className="truncate">{loaded?.name ?? 'Saved filters'}</span>
            {loaded && modified && (
              <Tip content="Changed since it was saved">
                <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Changed since it was saved" />
              </Tip>
            )}
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
          <div className="max-h-64 overflow-y-auto">
            {sorted.map((f) => (
              <DropdownMenuItem key={f.name} onSelect={() => onLoad(f)}>
                <Check className={loaded?.name === f.name ? 'text-primary!' : 'invisible'} />
                <span className="truncate">{f.name}</span>
              </DropdownMenuItem>
            ))}
            {!sorted.length && <div className="px-2 py-1.5 text-sm text-muted-foreground">{loading ? 'Loading…' : 'None yet. Set some filters, then save them here.'}</div>}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canSave} onSelect={() => setAsking({ kind: 'new' })}>
            <Plus />
            Save as a new filter…
          </DropdownMenuItem>
          {loaded && (
            <>
              <DropdownMenuItem disabled={!canSave || !modified} onSelect={() => void overwrite()}>
                <Save />
                <span className="truncate">Save changes to “{loaded.name}”</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAsking({ kind: 'rename' })}>
                <Pencil />
                <span className="truncate">Rename “{loaded.name}”…</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAsking({ kind: 'delete' })} className="text-danger [&_svg]:text-danger!">
                <Trash2 />
                <span className="truncate">Delete “{loaded.name}”…</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <NameDialog
        open={asking?.kind === 'new' || asking?.kind === 'rename'}
        title={asking?.kind === 'rename' ? 'Rename the saved filter' : 'Save these filters'}
        description={asking?.kind === 'rename' ? undefined : 'Saved filters are shared with Formbird’s All Items page.'}
        action={asking?.kind === 'rename' ? 'Rename' : 'Save'}
        initial={asking?.kind === 'rename' ? (loaded?.name ?? '') : ''}
        busy={busy}
        onSubmit={asking?.kind === 'rename' ? rename : saveNew}
        onClose={() => setAsking(null)}
      />

      <Dialog open={asking?.kind === 'delete'} onOpenChange={(o) => !o && setAsking(null)}>
        <DialogContent title={`Delete “${loaded?.name ?? ''}”?`} description="The saved filter goes for good. The filters on screen stay as they are.">
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NameDialog({
  open,
  title,
  description,
  action,
  initial,
  busy,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  action: string;
  initial: string;
  busy: boolean;
  /** Returns the problem to show, or null when done. */
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    // Opening starts from the given name.
    setLastOpen(open);
    if (open) {
      setName(initial);
      setError(null);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = filterNameProblem(name);
    if (problem) return setError(problem);
    const refused = await onSubmit(name.trim());
    if (refused) setError(refused);
    else onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={description}>
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <Field label="Name" htmlFor="saved-filter-name" error={error}>
            <Input
              id="saved-filter-name"
              value={name}
              autoFocus
              maxLength={80}
              aria-invalid={!!error || undefined}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
