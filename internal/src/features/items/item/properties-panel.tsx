// The item's properties beside the text: project, the lookups, status (with the quick status note),
// people, tags; who reported, created and last changed it; and its short link.
// Locks come from formState (New Item - onFieldState): no project yet → lookups and people wait
// (ruleDisableConfig); a saved closing status, an inactive project or an old version lock the rest.

import { Check, ChevronDown, Link2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { Button, PersonAvatar, Textarea, Tip } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { ItemStatus } from '@/components/item-bits';
import { LookupPicker, PeoplePicker, ProjectPicker } from '@/components/pickers';
import { rememberProject } from '@/data/sdms';
import { LOCK_REASONS, type EditableField } from '@/domain/rules';
import type { LookupKind, Ref } from '@/domain/types';
import type { ItemForm } from './use-item-form';

function Row({ label, htmlFor, children, error, hint, top }: { label: string; htmlFor?: string; children: ReactNode; error?: string; hint?: ReactNode; top?: boolean }) {
  return (
    <div id={htmlFor ? `field-${htmlFor}` : undefined} className="grid scroll-mt-24 grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
      <label htmlFor={htmlFor} className={cn('text-[13px] text-muted-foreground', top ? 'pt-2' : 'self-center')}>
        {label}
      </label>
      <div className="min-w-0">{children}</div>
      {(error || hint) && (
        <p className={cn('col-start-2 text-xs', error ? 'font-medium text-danger' : 'text-muted-foreground')}>{error || hint}</p>
      )}
    </div>
  );
}

function Person({ value }: { value: Ref | undefined }) {
  if (!value) return <span className="text-sm text-muted-foreground">–</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm">
      <PersonAvatar name={value.name} size={22} />
      <span className="truncate">{value.name}</span>
    </span>
  );
}

function When({ value, by }: { value: unknown; by?: string }) {
  if (!value) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="min-w-0">
      <Tip content={formatDateTime(value)}>
        <time dateTime={String(value)} className="tabular-nums">
          {relative(value)}
        </time>
      </Tip>
      {by && <span className="text-muted-foreground"> by {by}</span>}
    </span>
  );
}

const LOOKUPS: { field: EditableField & string; kind: LookupKind; label: string; required?: boolean }[] = [
  { field: 'typeRel', kind: 'type', label: 'Type', required: true },
  { field: 'severityRel', kind: 'severity', label: 'Severity' },
  { field: 'priorityRel', kind: 'priority', label: 'Priority' },
  { field: 'reproducibilityRel', kind: 'reproducibility', label: 'Reproducibility' },
  { field: 'categoryRel', kind: 'category', label: 'Category' },
];

/** Copies the item's short link (ruleSetCopyUrl, here as /items/<itemRef>). */
export function CopyLinkButton({ itemRef, className, variant = 'outline' }: { itemRef: string; className?: string; variant?: 'outline' | 'ghost' }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/items/${itemRef}`;
  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success('Link copied', { description: url });
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error('Couldn’t copy the link', { description: url });
        }
      }}
    >
      {copied ? <Check /> : <Link2 />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

export function PropertiesPanel({ form }: { form: ItemForm }) {
  const { draft, saved, account, isNew } = form;
  // On a phone the panel folds away under a summary line (open for a new item, or with problems).
  const [open, setOpen] = useState(isNew);
  const hasProblems = form.showProblems && form.problems.some((p) => ['projectRel', 'typeRel', 'statusRel', 'reporterRel'].includes(p.field));
  const expanded = open || hasProblems;
  const projectId = draft.projectRel?.[0]?.documentId;
  const projectIds = projectId ? [projectId] : [];

  const lockOf = (field: EditableField) => form.lockOf(field);
  // Lookups and people need the project's settings first.
  const waits = (field: EditableField) => !!lockOf(field) || form.waitingForProject;
  // Without a project the pickers say so once, under Project (ruleDisableConfig).
  const placeholderOf = (field: EditableField, fallback: string) => (lockOf(field) === 'no-project' ? '–' : form.waitingForProject ? 'Loading…' : fallback);
  const noProject = lockOf('typeRel') === 'no-project';

  const projectLock = lockOf('projectRel');
  const status = draft.statusRel?.[0];
  const assignee = draft.assigneeRel?.[0];

  return (
    <section aria-labelledby="properties-title" className="rounded-xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={expanded}
        aria-controls="properties-body"
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left lg:hidden"
      >
        <span id="properties-title" className="text-sm font-semibold">
          Properties
        </span>
        {!expanded && (
          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-xs text-muted-foreground">
            <ItemStatus value={draft.statusRel} className="text-xs" fallback="No status" />
            <span aria-hidden>·</span>
            <span className="truncate">{assignee?.name ?? 'Unassigned'}</span>
          </span>
        )}
        <ChevronDown className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>
      <div className="hidden min-h-12 items-center justify-between gap-2 pt-3 pr-3 pl-5 lg:flex">
        <h2 className="text-sm font-semibold">Properties</h2>
        {!isNew && saved?.itemRef && <CopyLinkButton itemRef={saved.itemRef} variant="ghost" />}
      </div>

      <div id="properties-body" className={cn('gap-3 border-t border-border px-4 pt-4 pb-5 lg:grid lg:border-t-0 lg:px-5 lg:pt-1', expanded ? 'grid' : 'hidden')}>
        <Row label="Project" htmlFor="projectRel" error={form.problemOf('projectRel')} hint={projectLock === 'single-project' ? LOCK_REASONS['single-project'] : noProject ? `${LOCK_REASONS['no-project']} The other properties depend on it.` : undefined}>
          <ProjectPicker
            id="projectRel"
            field="projectRel"
            value={draft.projectRel}
            disabled={!!projectLock}
            invalid={!!form.problemOf('projectRel')}
            onChange={(v) => {
              form.set('projectRel', v);
              rememberProject(account, v);
            }}
          />
        </Row>

        {LOOKUPS.map(({ field, kind, label }) => (
          <Row key={field} label={label} htmlFor={field} error={form.problemOf(field)}>
            <LookupPicker
              id={field}
              field={field}
              kind={kind}
              project={form.project}
              value={draft[field] as Ref[] | undefined}
              disabled={waits(field)}
              invalid={!!form.problemOf(field)}
              placeholder={placeholderOf(field, 'None')}
              onChange={(v) => form.set(field, v)}
            />
          </Row>
        ))}

        <Row label="Status" htmlFor="statusRel" error={form.problemOf('statusRel')}>
          <LookupPicker
            id="statusRel"
            field="statusRel"
            kind="status"
            project={form.project}
            value={draft.statusRel}
            disabled={waits('statusRel')}
            invalid={!!form.problemOf('statusRel')}
            placeholder={placeholderOf('statusRel', 'Choose a status')}
            onChange={(v) => form.set('statusRel', v)}
          />
        </Row>
        {/* #31244: offered while the status is being changed to a closing one, and appended at save. */}
        {form.offersQuickNote && (
          <Row label="Closing note" htmlFor="quickStatusNote" hint="Added as the last note when the item is saved." top>
            <Textarea id="quickStatusNote" rows={3} value={form.quickNote} onChange={(e) => form.setQuickNote(e.target.value)} placeholder={`Why it’s ${status?.name?.toLowerCase() ?? 'closed'}…`} />
          </Row>
        )}

        <Row label="Resolution" htmlFor="resolutionRel">
          <LookupPicker
            id="resolutionRel"
            field="resolutionRel"
            kind="resolution"
            project={form.project}
            value={draft.resolutionRel}
            disabled={waits('resolutionRel')}
            placeholder={placeholderOf('resolutionRel', 'None')}
            onChange={(v) => form.set('resolutionRel', v)}
          />
        </Row>

        <Row label="Assignee" htmlFor="assigneeRel">
          <PeoplePicker
            id="assigneeRel"
            field="assigneeRel"
            projectIds={projectIds}
            value={draft.assigneeRel}
            disabled={waits('assigneeRel')}
            placeholder={placeholderOf('assigneeRel', 'Unassigned')}
            onChange={(v) => form.set('assigneeRel', v)}
          />
        </Row>

        <Row label="Reporter" error={form.problemOf('reporterRel')}>
          <Person value={draft.reporterRel?.[0]} />
        </Row>

        <Row label="Feedback requested" htmlFor="feedbackRel" top>
          <PeoplePicker
            id="feedbackRel"
            field="feedbackRel"
            multiple
            projectIds={projectIds}
            value={draft.feedbackRel}
            disabled={waits('feedbackRel')}
            placeholder={placeholderOf('feedbackRel', 'Nobody')}
            onChange={(v) => form.set('feedbackRel', v)}
          />
        </Row>

        <Row label="Monitored by" htmlFor="monitoringRel" top>
          <PeoplePicker
            id="monitoringRel"
            field="monitoringRel"
            multiple
            projectIds={projectIds}
            value={draft.monitoringRel}
            disabled={waits('monitoringRel')}
            placeholder={placeholderOf('monitoringRel', 'Nobody')}
            onChange={(v) => form.set('monitoringRel', v)}
          />
        </Row>

        <Row label="Tags" htmlFor="tagsRel" top>
          <LookupPicker
            id="tagsRel"
            field="tagsRel"
            kind="tag"
            multiple
            project={form.project}
            value={draft.tagsRel}
            disabled={waits('tagsRel')}
            placeholder={placeholderOf('tagsRel', 'No tags')}
            onChange={(v) => form.set('tagsRel', v)}
          />
        </Row>

        {!isNew && saved && (
          <div className="mt-1 grid gap-2 border-t border-border pt-4 text-[13px]">
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
              <span className="text-muted-foreground">Created</span>
              <When value={saved.createdDate ?? saved.systemHeader?.documentCreatedDate} by={saved.createdByRel?.[0]?.name} />
            </div>
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
              <span className="text-muted-foreground">Updated</span>
              <When value={saved.updatedDate ?? saved.systemHeader?.createdDate} by={saved.updatedByRel?.[0]?.name} />
            </div>
            {saved.itemRef && <CopyLinkButton itemRef={saved.itemRef} className="mt-2 w-full lg:hidden" />}
          </div>
        )}
      </div>
    </section>
  );
}
