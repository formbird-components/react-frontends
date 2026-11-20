// All Items' filters panel (the original's collapsible "Filters" panel): periods, people, lookup
// values and "hide status (and above)". Collapsed, it shows the filters that are set as chips that
// can be removed. The saved filters menu sits in its header.

import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Combobox, DateInput, type ComboOption } from '@react-frontends/shared/components';
import { Badge, Button, Card, Field, Select } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { LookupPicker, PeoplePicker } from '@/components/pickers';
import { hiddenStatusNames, presetRange, type DatePreset, type ItemFilters } from '@/domain/queries';
import type { LookupDoc, LookupKind, Project, Ref } from '@/domain/types';
import { activeFilters, FILTER_LABELS, PRESET_LABELS, withoutFilter, type DateKind, type RefFilter } from './filters';

const PRESET_ORDER: DatePreset[] = ['Today', 'This Week', 'Last Week', 'Last 30 days', 'Custom'];

/** A change to the filters, made on the latest ones (two quick changes both count). */
export type FiltersUpdate = (update: (filters: ItemFilters) => ItemFilters) => void;

interface PanelProps {
  filters: ItemFilters;
  onChange: FiltersUpdate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The project picked (its settings decide the lookup values), null for none. */
  project: Project | null;
  projectLoading: boolean;
  /** The projects whose people Reporter and Assignee offer (none: every SDMS person). */
  peopleProjectIds: string[];
  /** Every status, for "hide status (and above)". */
  statuses: LookupDoc[];
  onClear: () => void;
  /** The saved filters menu. */
  saved: ReactNode;
}

export function FiltersPanel({ filters, onChange, open, onOpenChange, project, projectLoading, peopleProjectIds, statuses, onClear, saved }: PanelProps) {
  const active = activeFilters(filters);
  const set = (field: RefFilter, value: Ref[]) => onChange((f) => (value.length ? { ...f, [field]: value } : withoutFilter(f, field)));
  const lookup = (field: RefFilter, kind: LookupKind, itemField: string, multiple = true) => (
    <Field label={FILTER_LABELS[field]} htmlFor={`f-${field}`}>
      {multiple ? (
        <LookupPicker id={`f-${field}`} multiple kind={kind} field={itemField} project={project} noProject="global" disabled={projectLoading} value={filters[field]} onChange={(v) => set(field, v)} placeholder="Any" />
      ) : (
        <LookupPicker id={`f-${field}`} kind={kind} field={itemField} project={project} noProject="global" disabled={projectLoading} value={filters[field]} onChange={(v) => set(field, v)} placeholder="Any" />
      )}
    </Field>
  );

  return (
    <Card className="overflow-visible">
      <div className={cn('flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4', open && 'border-b border-border')}>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls="all-items-filters"
          className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 text-sm font-medium outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          Filters
          {active.length > 0 && <Badge tone="primary">{active.length}</Badge>}
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        {!open &&
          active.map((f) => (
            <RemovableChip key={f.key} label={f.label} value={f.value} onOpen={() => onOpenChange(true)} onRemove={() => onChange((current) => withoutFilter(current, f.key))} />
          ))}
        <div className="ml-auto flex items-center gap-1.5">
          {active.length > 0 && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClear}>
              Clear filters
            </Button>
          )}
          {saved}
        </div>
      </div>
      {open && (
        <div id="all-items-filters" className="grid items-start gap-x-4 gap-y-3.5 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
          <PeriodFilter kind="Created" filters={filters} onChange={onChange} />
          <PeriodFilter kind="Updated" filters={filters} onChange={onChange} />
          <Field label="Reporter" htmlFor="f-reporter">
            <PeoplePicker id="f-reporter" multiple field="reporterRel" projectIds={peopleProjectIds} value={filters.filterReporterRel} onChange={(v) => set('filterReporterRel', v)} placeholder="Anyone" />
          </Field>
          <Field label="Assignee" htmlFor="f-assignee">
            <PeoplePicker id="f-assignee" multiple field="assigneeRel" projectIds={peopleProjectIds} value={filters.filterAssigneeRel} onChange={(v) => set('filterAssigneeRel', v)} placeholder="Anyone" />
          </Field>
          {lookup('filterTypeRel', 'type', 'typeRel')}
          {lookup('filterSeverityRel', 'severity', 'severityRel')}
          {lookup('filterPriorityRel', 'priority', 'priorityRel')}
          {lookup('filterReproducibilityRel', 'reproducibility', 'reproducibilityRel')}
          {lookup('filterCategoryRel', 'category', 'categoryRel', false)}
          {lookup('filterStatusRel', 'status', 'statusRel')}
          {lookup('filterResolutionRel', 'resolution', 'resolutionRel', false)}
          {lookup('filterTagsRel', 'tag', 'tagsRel')}
          <HiddenStatusFilter value={filters.filterHiddenStatusRel} statuses={statuses} onChange={(v) => set('filterHiddenStatusRel', v)} />
        </div>
      )}
    </Card>
  );
}

/** A filter that's set, collapsed: "Status · Open, Feedback" with a button that removes it. */
function RemovableChip({ label, value, onOpen, onRemove }: { label: string; value: string; onOpen: () => void; onRemove: () => void }) {
  return (
    <span className="inline-flex h-8 max-w-full items-center rounded-full border border-primary/40 bg-primary-soft text-[13px] shadow-xs">
      <button type="button" onClick={onOpen} className="inline-flex h-full min-w-0 cursor-pointer items-center gap-1.5 rounded-full pr-1 pl-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/30" aria-label={`${label}: ${value}. Change`}>
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/60">·</span>
        <span className="max-w-48 truncate font-medium">{value}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="mr-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
        aria-label={`Remove the ${label.toLowerCase()} filter`}
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

/** A period (ruleSetCreatedDateFilter): a preset, or Custom with dates after and before. */
function PeriodFilter({ kind, filters, onChange }: { kind: DateKind; filters: ItemFilters; onChange: FiltersUpdate }) {
  const presetField = `presetPeriod${kind}` as const;
  const fromField = `filterFrom${kind}Date` as const;
  const toField = `filterTo${kind}Date` as const;
  const preset = filters[presetField];
  const id = `f-${kind.toLowerCase()}`;
  const choose = (value: string) =>
    onChange((f) => {
      const rest = withoutFilter(f, kind);
      if (value === 'any') return rest;
      const next = value as DatePreset;
      if (next !== 'Custom') return { ...rest, [presetField]: next };
      // Custom starts from the dates the period stood for (as the original's date fields kept them).
      const range = presetRange(f[presetField]);
      const from = range?.from.toISOString() ?? f[fromField];
      const to = range?.to.toISOString() ?? f[toField];
      return { ...rest, [presetField]: 'Custom', ...(from ? { [fromField]: from } : {}), ...(to ? { [toField]: to } : {}) };
    });
  const setDate = (field: typeof fromField | typeof toField, iso: string | undefined) =>
    onChange((f) => {
      const next: ItemFilters = { ...f, [presetField]: 'Custom' };
      if (iso) next[field] = iso;
      else delete next[field];
      return next;
    });
  return (
    <Field label={kind} htmlFor={id}>
      <Select id={id} value={preset ?? 'any'} onChange={choose} options={[{ value: 'any', label: 'Any time' }, ...PRESET_ORDER.map((p) => ({ value: p, label: PRESET_LABELS[p] }))]} />
      {preset === 'Custom' && (
        <div className="grid gap-1.5">
          <label className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center text-xs text-muted-foreground">
            After
            <DateInput value={filters[fromField]} onChange={(v) => setDate(fromField, v)} />
          </label>
          <label className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center text-xs text-muted-foreground">
            Before
            <DateInput value={filters[toField]} onChange={(v) => setDate(toField, v)} />
          </label>
        </div>
      )}
    </Field>
  );
}

const swatch = (color: string | undefined) => <span className="size-3 shrink-0 rounded-[3px] border border-black/10 dark:border-white/15" style={{ backgroundColor: color || 'var(--muted)' }} />;

/** "Hide status (and above)": hides the lowest status picked and every status after it. */
function HiddenStatusFilter({ value, statuses, onChange }: { value: Ref[] | undefined; statuses: LookupDoc[]; onChange: (v: Ref[]) => void }) {
  const options: ComboOption[] = statuses
    .filter((s) => !s.inactiveBool)
    .map((s) => {
      const name = s.systemHeader?.summaryName ?? String(s.name ?? '');
      return { value: s.documentId, label: name, icon: swatch(s.color), data: { documentId: s.documentId, name, ...(s.indexNum !== undefined ? { indexNum: s.indexNum } : {}) } satisfies Ref };
    });
  const current = (value ?? []).map(
    (r) => options.find((o) => o.value === r.documentId) ?? { value: r.documentId, label: r.name, icon: swatch(statuses.find((s) => s.documentId === r.documentId)?.color), data: r },
  );
  const hidden = hiddenStatusNames(value, statuses);
  const hint = hidden.length ? `Hides ${hidden.slice(0, 4).join(', ')}${hidden.length > 4 ? ` and ${hidden.length - 4} more` : ''}.` : 'Hides a status and every status after it.';
  return (
    <Field label={FILTER_LABELS.filterHiddenStatusRel} htmlFor="f-hide" hint={hint} className="sm:col-span-2">
      <Combobox id="f-hide" multiple options={options} value={current} onChange={(v) => onChange(v.map((o) => o.data as Ref))} placeholder="None" searchPlaceholder="Search statuses" />
    </Field>
  );
}
