// Pickers for an item's links: lookup values (filtered by the project's settings), people (SDMS
// accounts on the project) and projects (yours, or all for an admin). Values come back as links
// (Ref[]) shaped the way Formbird's form stores them.

import { Combobox, type ComboOption } from '@react-frontends/shared/components';
import { PersonAvatar } from '@react-frontends/shared/ui';
import { searchPeople, useLookup, useProjectOptions, useStatusColor } from '@/data/sdms';
import { toRef } from '@/domain/rules';
import type { Account, Doc, LookupDoc, LookupKind, Project, Ref } from '@/domain/types';

const nameOf = (d: Doc) => d.systemHeader?.summaryName ?? String(d.name ?? '');

interface Common {
  /** The item field the value is for (decides the link's related fields). */
  field: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
}

type Multi = { multiple: true; value: Ref[] | undefined; onChange: (v: Ref[]) => void };
type Single = { multiple?: false; value: Ref[] | undefined; onChange: (v: Ref[]) => void };

const refOption = (r: Ref): ComboOption => ({ value: r.documentId, label: r.name, data: r });

/** A lookup value (type, status, tags…) from those the project uses. */
export function LookupPicker(
  props: Common & (Multi | Single) & { kind: LookupKind; project: Project | null | undefined; noProject?: 'all' | 'global'; /** values to leave out */ hide?: (d: LookupDoc) => boolean },
) {
  const { kind, project, field, noProject = 'all' } = props;
  const lookup = useLookup(kind, project, noProject);
  const colorOf = useStatusColor();
  const docs = (lookup.data ?? []).filter((d) => !props.hide?.(d));
  const toOption = (d: LookupDoc): ComboOption => ({
    value: d.documentId,
    label: nameOf(d),
    data: toRef(field, d),
    icon: kind === 'status' ? <span className="size-3 rounded-[3px] border border-black/10" style={{ backgroundColor: d.color || 'var(--muted)' }} /> : undefined,
  });
  const options = docs.map(toOption);
  const current = (props.value ?? []).map((r) => options.find((o) => o.value === r.documentId) ?? { ...refOption(r), icon: kind === 'status' ? <span className="size-3 rounded-[3px] border border-black/10" style={{ backgroundColor: colorOf(r) ?? 'var(--muted)' }} /> : undefined });
  const placeholder = lookup.isError ? (lookup.error as Error).message : (props.placeholder ?? 'Choose…');
  const base = { options, placeholder, disabled: props.disabled || lookup.isError, invalid: props.invalid || lookup.isError, id: props.id, className: props.className, searchPlaceholder: 'Search' };
  return props.multiple ? (
    <Combobox {...base} multiple value={current} onChange={(v) => props.onChange(v.map((o) => o.data as Ref))} />
  ) : (
    <Combobox {...base} clearable value={current[0]} onChange={(v) => props.onChange(v ? [v.data as Ref] : [])} />
  );
}

const personOption = (field: string, a: Account): ComboOption => ({
  value: a.documentId,
  label: nameOf(a),
  description: a.email,
  icon: <PersonAvatar name={nameOf(a)} size={22} />,
  data: toRef(field, a),
});

/** People: active SDMS accounts on the projects (all SDMS people when none are given). */
export function PeoplePicker(props: Common & (Multi | Single) & { projectIds: string[] }) {
  const { field, projectIds } = props;
  const load = async (text: string) => (await searchPeople(projectIds, text)).map((a) => personOption(field, a));
  const current = (props.value ?? []).map((r) => ({ ...refOption(r), description: r.email, icon: <PersonAvatar name={r.name} size={22} /> }));
  const base = {
    options: load,
    queryKey: ['people', field, ...projectIds],
    placeholder: props.placeholder ?? (props.multiple ? 'Add people…' : 'Choose a person…'),
    searchPlaceholder: 'Search by name or email',
    disabled: props.disabled,
    invalid: props.invalid,
    id: props.id,
    className: props.className,
  };
  return props.multiple ? (
    <Combobox {...base} multiple value={current} onChange={(v) => props.onChange(v.map((o) => o.data as Ref))} />
  ) : (
    <Combobox {...base} clearable value={current[0]} onChange={(v) => props.onChange(v ? [v.data as Ref] : [])} />
  );
}

/** Projects you may pick; `showAll` (admins) offers every active project. */
export function ProjectPicker(props: Common & (Multi | Single) & { showAll?: boolean }) {
  const projects = useProjectOptions(props.showAll);
  const options = (projects.data ?? []).map((p) => ({ value: p.documentId, label: nameOf(p), data: { documentId: p.documentId, name: nameOf(p) } as Ref }));
  const current = (props.value ?? []).map((r) => options.find((o) => o.value === r.documentId) ?? refOption(r));
  const base = { options, placeholder: props.placeholder ?? (props.multiple ? 'All your projects' : 'Choose a project…'), searchPlaceholder: 'Search projects', disabled: props.disabled, invalid: props.invalid, id: props.id, className: props.className };
  return props.multiple ? (
    <Combobox {...base} multiple value={current} onChange={(v) => props.onChange(v.map((o) => o.data as Ref))} />
  ) : (
    <Combobox {...base} clearable value={current[0]} onChange={(v) => props.onChange(v ? [v.data as Ref] : [])} />
  );
}
