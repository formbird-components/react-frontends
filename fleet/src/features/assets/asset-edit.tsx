// Managers change a few things on an asset here: its lifecycle (the moves fleet allows), who is
// responsible, where it lives, its hire pools, and its registration and insurance dates. The
// server's rule (validateAsset) is checked first and its message shown; a refusal is shown too.

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DateInput, Alert } from '@react-frontends/shared/components';
import { LookupSelect, PersonPicker } from '@/components/pickers';
import { Button, Checkbox, ColorBadge, Dialog, Field, Select, SheetContent } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { useUpdate } from '@/data/records';
import { lookupValue } from '@/data/values';
import { validateAsset } from '@/domain/validate';
import { first, nameOf, type Asset, type LookupValue } from '@/domain/types';
import { nextStatuses, type Who } from '@/domain/workflow';
import { ALLOCATIONS, changedFields, editableOf, isPlant, type AssetEdit } from './logic';

/** What a lifecycle move does, for the person making it. */
const MOVE_NOTES: Record<string, string> = {
  Active: 'Back in service.',
  Decommission: 'Taken out of service: no new bookings.',
  'Awaiting Disposal': 'Waiting to be sold, traded or written off.',
  Disposed: 'Leaves the booking calendar and the map, and goes off hire for good.',
};

export function AssetEditSheet({ asset, who, open, onOpenChange }: { asset: Asset & { disposedByRel?: LookupValue[]; lastStatus?: string }; who: Who; open: boolean; onOpenChange: (open: boolean) => void }) {
  const initial = useMemo(() => editableOf(asset), [asset]);
  const [draft, setDraft] = useState<AssetEdit>(initial);
  const [serverError, setServerError] = useState('');
  const update = useUpdate<Asset>('asset');
  const statuses = useLookup('assetStatus');
  const locations = useLookup('location');
  const pools = useLookup('pool');

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setServerError('');
    }
  }, [open, initial]);

  const set = <K extends keyof AssetEdit>(key: K, value: AssetEdit[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setServerError('');
  };

  const current = nameOf(initial.assetStatusRel);
  const target = nameOf(draft.assetStatusRel);
  const lifecycleOptions = [current, ...nextStatuses('assetStatus', current)].filter(Boolean);
  const changes = changedFields(initial, draft);
  const changed = Object.keys(changes).length > 0;
  // The record as it would be saved, checked by the same rule the server runs.
  const problem = validateAsset({ ...asset, ...draft, regDueDate: draft.regDueDate ?? undefined, insuranceDueDate: draft.insuranceDueDate ?? undefined, lastStatus: asset.lastStatus ?? current }, who);
  const plant = isPlant(asset);

  const save = () => {
    if (!changed || problem) return;
    update.mutate(
      { documentId: asset.documentId, fields: changes as Record<string, unknown> },
      {
        onSuccess: () => {
          toast.success(`${asset.assetId} saved`, { description: changes.assetStatusRel ? `Now ${target}.` : undefined });
          onOpenChange(false);
        },
        onError: (error) => setServerError(error instanceof Error ? error.message : 'The save failed.'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !update.isPending && onOpenChange(o)}>
      <SheetContent title={`Edit ${asset.assetId}`} description={asset.makeModel} width="max-w-lg">
        <form
          className="flex min-h-full flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid flex-1 content-start gap-5 px-6 py-5">
            <section className="grid gap-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lifecycle</h3>
              <Field
                label="Asset status"
                htmlFor="edit-status"
                hint={target !== current ? MOVE_NOTES[target] : lifecycleOptions.length > 1 ? `From ${current} it can move to ${lifecycleOptions.slice(1).join(' or ')}.` : `${current} is final.`}
              >
                <Select
                  id="edit-status"
                  value={first(draft.assetStatusRel)?.documentId}
                  onChange={(id) => {
                    const status = statuses.data?.find((s) => s.documentId === id);
                    if (status) set('assetStatusRel', [{ documentId: status.documentId, name: status.name, color: status.color, statusCategory: status.statusCategory, indexNum: status.indexNum }]);
                  }}
                  disabled={lifecycleOptions.length < 2}
                  options={(statuses.data ?? [])
                    .filter((s) => lifecycleOptions.includes(s.name))
                    .map((s) => ({ value: s.documentId, label: <ColorBadge color={s.color}>{s.name}</ColorBadge>, hint: s.name === current ? 'Current' : undefined }))}
                />
              </Field>
              {target === 'Disposed' && (
                <Field label="Disposed by" htmlFor="edit-disposed" required>
                  <LookupSelect id="edit-disposed" kind="disposedBy" value={first(draft.disposedByRel)} onChange={(v) => set('disposedByRel', [v])} placeholder="How was it disposed of?" invalid={!draft.disposedByRel.length} />
                </Field>
              )}
            </section>

            <section className="grid gap-4 border-t border-border pt-5">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Assignment</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Allocation" htmlFor="edit-allocation">
                  <Select id="edit-allocation" value={draft.allocationStatus} onChange={(v) => set('allocationStatus', v)} options={ALLOCATIONS.map((a) => ({ value: a, label: a }))} />
                </Field>
                <Field label="Responsible person" htmlFor="edit-person" required={draft.allocationStatus !== 'Unassigned'}>
                  <PersonPicker id="edit-person" value={first(draft.responsiblePersonRel)} onChange={(v) => set('responsiblePersonRel', v ? [v] : [])} clearable placeholder="Nobody" invalid={draft.allocationStatus !== 'Unassigned' && !draft.responsiblePersonRel.length} />
                </Field>
              </div>
              <Field label="Location" htmlFor="edit-location" hint="Where the asset is kept between hires.">
                <Select
                  id="edit-location"
                  value={first(draft.locationRel)?.documentId}
                  onChange={(id) => {
                    const location = locations.data?.find((l) => l.documentId === id);
                    if (location) set('locationRel', [lookupValue(location)]);
                  }}
                  options={(locations.data ?? []).map((l) => ({ value: l.documentId, label: l.name }))}
                  placeholder="Choose a location"
                />
              </Field>
              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-[13px] font-medium">Vehicle hire pools</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(pools.data ?? []).map((pool) => {
                    const checked = draft.poolsRel.some((p) => p.documentId === pool.documentId);
                    return (
                      <label key={pool.documentId} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/60 has-[button[data-state=checked]]:border-primary/40 has-[button[data-state=checked]]:bg-primary-soft/50">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(on) => set('poolsRel', on ? [...draft.poolsRel, lookupValue(pool)] : draft.poolsRel.filter((p) => p.documentId !== pool.documentId))}
                        />
                        {pool.name}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">People book from the pools they belong to.</p>
              </fieldset>
            </section>

            {!plant && (
              <section className="grid gap-4 border-t border-border pt-5">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Registration and insurance</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Registration due" htmlFor="edit-rego">
                    <DateInput id="edit-rego" value={draft.regDueDate ?? undefined} onChange={(v) => set('regDueDate', v ?? null)} />
                  </Field>
                  <Field label="Insurance due" htmlFor="edit-insurance">
                    <DateInput id="edit-insurance" value={draft.insuranceDueDate ?? undefined} onChange={(v) => set('insuranceDueDate', v ?? null)} />
                  </Field>
                </div>
              </section>
            )}
          </div>

          <div className="sticky bottom-0 grid gap-3 border-t border-border bg-card px-6 py-4">
            {changed && problem && <Alert tone="warning">{problem}</Alert>}
            {serverError && <Alert>{serverError}</Alert>}
            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">
                {changed ? `${Object.keys(changes).length} ${Object.keys(changes).length === 1 ? 'change' : 'changes'}` : 'No changes yet'}
              </span>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={!changed || !!problem || update.isPending}>
                {update.isPending && <Loader2 className="animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}
