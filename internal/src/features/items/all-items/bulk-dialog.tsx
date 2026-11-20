// The bulk updater (the SDMS Bulk Item Updater page All Items opened, as a dialog): Update some
// fields of the selected items, Move them to a project, or Copy them to a project. It runs one item
// at a time with a progress bar and each item's result; items that failed stay selected.

import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, CircleDashed, Copy, FolderInput, Loader2, PencilLine } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '@react-frontends/shared/api';
import { Alert } from '@react-frontends/shared/components';
import { useRefresh } from '@react-frontends/shared/data';
import { formatNumber } from '@react-frontends/shared/format';
import { Button, Dialog, DialogContent, DialogFooter, Field, Segmented, Textarea } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { itemPath } from '@/components/item-bits';
import { LookupPicker, PeoplePicker, ProjectPicker } from '@/components/pickers';
import { linkText } from '@/data/save-item';
import { ITEMS, useAccount, useMentionEmails } from '@/data/sdms';
import { bulkUpdateSetsSomething, type BulkAction, type BulkUpdate } from '@/domain/rules';
import type { Item, Project, Ref } from '@/domain/types';
import { actionText, labelOf, runBulk, summary, tooMany, type BulkPlan, type BulkResult } from './bulk';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The action the dialog opens on. */
  action: BulkAction;
  items: Item[];
  /** The project picked on All Items: its settings decide the values offered (none: global ones). */
  project: Project | null;
  /** The projects whose people Assignee offers. */
  peopleProjectIds: string[];
  /** An admin showing all projects may move and copy to any. */
  showAllProjects: boolean;
  /** After a run: the items that weren't changed (they stay selected). */
  onFinished: (remaining: Item[]) => void;
}

const ICONS = { Update: PencilLine, Move: FolderInput, Copy };

export function BulkDialog(props: Props) {
  const { open, onOpenChange } = props;
  // A new dialog each time it opens: its fields start empty.
  const [session, setSession] = useState(0);
  const [running, setRunning] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (running) return;
        onOpenChange(o);
        if (!o) setSession((s) => s + 1);
      }}
    >
      <DialogContent
        wide
        title={`Change ${props.items.length} ${props.items.length === 1 ? 'item' : 'items'}`}
        description={describe(props.items)}
        onEscapeKeyDown={(e) => running && e.preventDefault()}
        onInteractOutside={(e) => running && e.preventDefault()}
      >
        <BulkBody key={session} {...props} onRunning={setRunning} />
      </DialogContent>
    </Dialog>
  );
}

const describe = (items: Item[]) => {
  const ids = items.slice(0, 4).map(labelOf).join(', ');
  return items.length > 4 ? `${ids} and ${items.length - 4} more` : ids;
};

function BulkBody({ action: initial, items, project, peopleProjectIds, showAllProjects, onOpenChange, onFinished, onRunning }: Props & { onRunning: (r: boolean) => void }) {
  const account = useAccount();
  const emails = useMentionEmails();
  const refresh = useRefresh();
  const client = useQueryClient();
  const [action, setAction] = useState<BulkAction>(initial);
  const [update, setUpdate] = useState<BulkUpdate>({});
  const [target, setTarget] = useState<Ref[]>([]);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [phase, setPhase] = useState<'form' | 'running' | 'done'>('form');
  const [ran, setRan] = useState<BulkAction>(initial);
  const stop = useRef(false);

  const tooBig = tooMany(items.length);
  const ready = !tooBig && (action === 'Update' ? bulkUpdateSetsSomething(update) : target.length > 0);
  const set = <K extends keyof BulkUpdate>(field: K, value: BulkUpdate[K]) => setUpdate((u) => ({ ...u, [field]: value }));

  async function run() {
    stop.current = false;
    setRan(action);
    setResults([]);
    setPhase('running');
    onRunning(true);
    let plan: BulkPlan;
    if (action === 'Update') {
      // @mentions and #item numbers in the note become links, as on the item's own form.
      const note = update.note?.trim() ? await linkText(update.note.trim(), emails.data ?? []) : undefined;
      plan = { action, update: { ...update, note } };
    } else {
      plan = { action, project: target[0] };
    }
    const all = await runBulk(items, plan, account, { get: (id) => api.get<Item>(id), update: (id, f) => api.update<Item>(id, f), create: (t, f) => api.create<Item>(t, f) }, {
      onResult: (r) => {
        setResults((prev) => [...(prev ?? []), r]);
        if (r.saved && plan.action !== 'Copy') client.setQueryData(['record', r.documentId], r.saved);
      },
      stopped: () => stop.current,
    });
    onRunning(false);
    setPhase('done');
    refresh(ITEMS);
    const done = new Set(all.filter((r) => r.ok).map((r) => r.documentId));
    onFinished(items.filter((i) => !done.has(i.documentId)));
  }

  if (phase !== 'form') {
    const list = results ?? [];
    const okCount = list.filter((r) => r.ok).length;
    const failed = list.length - okCount;
    const pct = Math.round((list.length / items.length) * 100);
    return (
      <div className="grid gap-4">
        <div className="grid gap-2" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              {phase === 'running' ? `${ran === 'Update' ? 'Updating' : ran === 'Move' ? 'Moving' : 'Copying'} ${formatNumber(Math.min(list.length + 1, items.length))} of ${formatNumber(items.length)}…` : summary(ran, list, items.length)}
            </span>
            <span className="text-muted-foreground tabular-nums">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={list.length} aria-label="Progress">
            <div className={cn('h-full rounded-full transition-[width] duration-300', failed ? 'bg-warning' : 'bg-primary')} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
          {items.map((item, i) => {
            const r = list[i];
            const Icon = !r ? (i === list.length && phase === 'running' ? Loader2 : CircleDashed) : r.ok ? CircleCheck : CircleAlert;
            return (
              <li key={item.documentId} className="flex items-start gap-2.5 px-3 py-2">
                <Icon className={cn('mt-0.5 size-4 shrink-0', !r ? 'text-muted-foreground' : r.ok ? 'text-success' : 'text-danger', Icon === Loader2 && 'animate-spin')} />
                <span className="w-16 shrink-0 font-mono text-[0.8rem] tabular-nums">{labelOf(item)}</span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1">{item.summary || '(no summary)'}</span>
                  {r && (
                    <span className={cn('text-xs', r.ok ? 'text-muted-foreground' : 'text-danger')}>
                      {ran === 'Copy' && r.ok && r.saved ? (
                        <Link to={itemPath(r.saved)} className="text-primary hover:underline" onClick={() => onOpenChange(false)}>
                          {r.message}
                        </Link>
                      ) : (
                        r.message
                      )}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {phase === 'done' && failed > 0 && <Alert tone="warning">The items that failed stay selected, so you can try them again.</Alert>}
        <DialogFooter>
          {phase === 'running' ? (
            <Button variant="outline" onClick={() => (stop.current = true)}>
              Stop
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </div>
    );
  }

  const lookup = (field: 'statusRel' | 'typeRel' | 'severityRel' | 'priorityRel' | 'categoryRel', kind: 'status' | 'type' | 'severity' | 'priority' | 'category', label: string) => (
    <Field label={label} htmlFor={`bulk-${field}`}>
      <LookupPicker id={`bulk-${field}`} kind={kind} field={field} project={project} noProject="global" value={update[field]} onChange={(v) => set(field, v)} placeholder="Leave as is" />
    </Field>
  );

  return (
    <div className="grid gap-4">
      <Segmented
        value={action}
        onChange={setAction}
        options={(['Update', 'Move', 'Copy'] as const).map((a) => {
          const Icon = ICONS[a];
          return { value: a, label: <><Icon />{a}</> };
        })}
        className="justify-self-start"
      />
      {tooBig && <Alert tone="warning">{tooBig}</Alert>}

      {action === 'Update' ? (
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <p className="text-sm text-muted-foreground sm:col-span-2">Only the fields you set change. Tags and the note are added to what each item has.</p>
          {lookup('statusRel', 'status', 'Status')}
          {lookup('typeRel', 'type', 'Type')}
          {lookup('severityRel', 'severity', 'Severity')}
          {lookup('priorityRel', 'priority', 'Priority')}
          {lookup('categoryRel', 'category', 'Category')}
          <Field label="Assignee" htmlFor="bulk-assignee">
            <PeoplePicker id="bulk-assignee" field="assigneeRel" projectIds={peopleProjectIds} value={update.assigneeRel} onChange={(v) => set('assigneeRel', v)} placeholder="Leave as is" />
          </Field>
          <Field label="Add tags" htmlFor="bulk-tags" className="sm:col-span-2">
            <LookupPicker id="bulk-tags" multiple kind="tag" field="tagsRel" project={project} noProject="global" value={update.tagsRel} onChange={(v) => set('tagsRel', v)} placeholder="None" />
          </Field>
          <Field label="Progress note" htmlFor="bulk-progress" hint="Replaces each item’s progress note." className="sm:col-span-2">
            <Textarea id="bulk-progress" value={update.progressNote ?? ''} onChange={(e) => set('progressNote', e.target.value)} rows={2} placeholder="Leave as is" />
          </Field>
          <Field label="Add a note" htmlFor="bulk-note" hint="Markdown. Added as the last note on each item." className="sm:col-span-2">
            <Textarea id="bulk-note" value={update.note ?? ''} onChange={(e) => set('note', e.target.value)} rows={3} placeholder="None" />
          </Field>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {action === 'Move'
              ? 'Moves the items to this project. Their other fields stay as they are.'
              : 'Makes a copy of each item in this project, called “COPY OF #<number> - <summary>”. The originals stay as they are.'}
          </p>
          <Field label="Project" htmlFor="bulk-project">
            <ProjectPicker id="bulk-project" field="projectRel" showAll={showAllProjects} value={target} onChange={setTarget} />
          </Field>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={() => void run()} disabled={!ready}>
          {actionText(action, items.length)}
        </Button>
      </DialogFooter>
    </div>
  );
}
