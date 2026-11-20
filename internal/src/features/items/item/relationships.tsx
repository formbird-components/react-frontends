// Relationships (New Item - onFieldState): the items this one is linked to (ruleDisplayRelationships),
// linking more (ruleAddRelationships: up to 10, Related / Parent / Child, written on both items) and
// unlinking the rows ticked (ruleRemoveRelationships). Each item is saved in turn, with a toast each;
// these saves don't wait for the page's Save.

import { Link2, Link2Off, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { api } from '@react-frontends/shared/api';
import { Alert, Combobox, type ComboOption } from '@react-frontends/shared/components';
import { useRefresh } from '@react-frontends/shared/data';
import { Badge, Button, Checkbox, Dialog, DialogContent, DialogFooter, Field, Segmented, Skeleton, Table, TBody, TD, TH, THead, TR } from '@react-frontends/shared/ui';
import { ItemLink, ItemStatus, itemPath, names, TypeIcon } from '@/components/item-bits';
import { ITEMS } from '@/data/sdms';
import { MAX_RELATIONSHIP_BATCH } from '@/domain/model';
import { itemsByIdQuery } from '@/domain/queries';
import { LOCK_REASONS, planLink, planUnlink, RELATIONSHIP_TYPES, type PlannedUpdate } from '@/domain/rules';
import type { Item, RelationshipType } from '@/domain/types';
import { suggestItems, useRelatedItems } from './data';
import { relatedIds, relationshipRows, type RelationRow } from './item-logic';
import { Section } from './sections';
import type { ItemForm } from './use-item-form';

const TYPE_HINT: Record<RelationshipType, string> = {
  Related: 'The items are related to this one.',
  Parent: 'The items you pick are this item’s parents.',
  Child: 'The items you pick are this item’s children.',
};

/** Reads whole items (the plan rewrites their relationships, so it needs them as stored). */
async function readItems(ids: string[]): Promise<Item[]> {
  return (await api.search<Item>(itemsByIdQuery(ids), { size: ids.length })).documents;
}

/** Saves the planned updates one after another, a toast each; returns how many failed. */
async function runPlan(updates: PlannedUpdate[], selfId: string, done: (u: PlannedUpdate) => void, verb: string): Promise<number> {
  let failed = 0;
  for (const u of updates) {
    const label = u.itemId ?? 'the item';
    try {
      await api.update(u.documentId, u.change as Record<string, unknown>);
      done(u);
      toast.success(u.documentId === selfId ? `${label} saved` : `${verb} ${label}`);
    } catch (e) {
      failed++;
      toast.error(`${label} wasn’t saved`, { description: (e as Error).message });
    }
  }
  return failed;
}

function LinkDialog({ form, open, onOpenChange }: { form: ItemForm; open: boolean; onOpenChange: (o: boolean) => void }) {
  const self = form.saved!;
  const refresh = useRefresh();
  const [picked, setPicked] = useState<ComboOption[]>([]);
  const [type, setType] = useState<RelationshipType>('Related');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setPicked([]);
    setType('Related');
    setError('');
    onOpenChange(false);
  };

  const link = async () => {
    setError('');
    setBusy(true);
    try {
      const [others, latest] = await Promise.all([readItems(picked.map((p) => p.value)), api.get<Item>(self.documentId)]);
      if (!others.length) throw new Error('The items weren’t found. They may have been removed.');
      const plan = planLink(latest, others, type, form.account);
      if (typeof plan === 'string') throw new Error(plan);
      const failed = await runPlan(plan, self.documentId, (u) => refresh(ITEMS, u.documentId), 'Linked');
      if (!plan.length) toast.info('Those items were already linked that way');
      if (!failed) close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent title="Link items" description={`Up to ${MAX_RELATIONSHIP_BATCH} at a time. Both items record the link.`} wide>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Items" htmlFor="link-items" hint={picked.length >= MAX_RELATIONSHIP_BATCH ? `That’s the most at once (${MAX_RELATIONSHIP_BATCH}).` : 'Search by number or summary.'}>
            <Combobox
              id="link-items"
              multiple
              value={picked}
              onChange={(v) => setPicked(v.slice(0, MAX_RELATIONSHIP_BATCH))}
              queryKey={['link-items', self.documentId]}
              options={async (text) =>
                (await suggestItems(text, self.documentId, form.account, 30)).map((i) => ({
                  value: i.documentId,
                  label: `${i.itemId ?? ''} ${i.summary ?? ''}`.trim(),
                  description: <ItemStatus value={i.statusRel} className="text-xs" />,
                  icon: <TypeIcon name={i.typeRel?.[0]?.name} />,
                }))
              }
              placeholder="Choose items…"
              searchPlaceholder="Search by number or summary"
            />
          </Field>
          <Field label="Relationship" hint={TYPE_HINT[type]}>
            <Segmented value={type} onChange={setType} options={RELATIONSHIP_TYPES.map((t) => ({ value: t, label: t }))} className="w-fit" />
          </Field>
          {error && <Alert>{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => void link()} disabled={!picked.length || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
            Link {picked.length > 1 ? `${picked.length} items` : picked.length ? 'item' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TypeBadge({ type }: { type?: RelationshipType }) {
  return <Badge tone={type === 'Parent' ? 'info' : type === 'Child' ? 'primary' : 'neutral'}>{type ?? 'Related'}</Badge>;
}

export function RelationshipsSection({ form }: { form: ItemForm }) {
  const self = form.saved!;
  const refresh = useRefresh();
  const ids = relatedIds(self.relationshipsRel);
  const related = useRelatedItems(ids);
  const rows = relationshipRows(self.relationshipsRel, related.data?.documents ?? []);
  const lock = form.lockOf('relationships');
  const [ticked, setTicked] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const tickable = (r: RelationRow) => !!r.item;
  const isTicked = (r: RelationRow) => !!r.item && ticked.includes(r.item.documentId);
  const toggle = (r: RelationRow) => r.item && setTicked((t) => (t.includes(r.item!.documentId) ? t.filter((x) => x !== r.item!.documentId) : [...t, r.item!.documentId]));
  const live = ticked.filter((id) => rows.some((r) => r.item?.documentId === id));

  const unlink = async () => {
    setBusy(true);
    try {
      const [others, latest] = await Promise.all([readItems(live), api.get<Item>(self.documentId)]);
      const plan = planUnlink(latest, others, form.account);
      if (typeof plan === 'string') throw new Error(plan);
      const failed = await runPlan(plan, self.documentId, (u) => refresh(ITEMS, u.documentId), 'Unlinked');
      if (!failed) setTicked([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      id="relationships"
      title={
        <span className="inline-flex items-center gap-2">
          Relationships {rows.length > 0 && <Badge>{rows.length}</Badge>}
        </span>
      }
      description={lock && lock !== 'read-only' ? LOCK_REASONS[lock] : undefined}
      actions={
        !lock && (
          <>
            {live.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => void unlink()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Link2Off />}
                Unlink {live.length}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setLinking(true)}>
              <Plus />
              Link items
            </Button>
          </>
        )
      }
    >
      {related.isError ? (
        <Alert>{(related.error as Error).message}</Alert>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">Not linked to other items.</p>
      ) : related.isPending && ids.length ? (
        <div className="grid grid-cols-1 gap-2">
          {rows.map((r) => (
            <Skeleton key={r.key} className="h-9" />
          ))}
        </div>
      ) : (
        <>
          <div className="-mx-5 hidden sm:-mx-6 md:block">
            <Table>
              <THead>
                <TR>
                  {!lock && <TH className="w-8 sm:pl-6"><span className="sr-only">Select</span></TH>}
                  <TH className="sm:pl-6">Item</TH>
                  <TH>Relationship</TH>
                  <TH>Status</TH>
                  <TH>Summary</TH>
                  <TH>Assignee</TH>
                  <TH className="sm:pr-6">Reporter</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.key} data-selected={isTicked(r) || undefined} className="data-[selected]:bg-primary/5">
                    {!lock && (
                      <TD className="sm:pl-6">
                        {tickable(r) && <Checkbox checked={isTicked(r)} onCheckedChange={() => toggle(r)} aria-label={`Select ${r.item?.itemId ?? 'item'}`} />}
                      </TD>
                    )}
                    <TD className="whitespace-nowrap sm:pl-6">{r.item ? <ItemLink item={r.item} /> : <span className="font-mono text-[0.8rem] text-muted-foreground">{r.unmatched ?? r.relationship.itemId ?? '–'}</span>}</TD>
                    <TD>
                      <TypeBadge type={r.type} />
                    </TD>
                    <TD>{r.item ? <ItemStatus value={r.item.statusRel} /> : r.unmatched ? <Badge tone="warning">Unmatched</Badge> : <Badge>Not found</Badge>}</TD>
                    <TD className="min-w-48">
                      {r.item ? (
                        <Link to={itemPath(r.item)} className="line-clamp-2 hover:text-primary">
                          {r.item.summary ?? r.item.systemHeader?.summaryName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{r.unmatched ? 'Migrated from Mantis, not matched to an item yet.' : r.relationship.name && r.relationship.name !== 'xx' ? r.relationship.name : 'This item was removed, or isn’t yours to see.'}</span>
                      )}
                    </TD>
                    <TD className="min-w-24 text-muted-foreground">{r.item ? names(r.item.assigneeRel) : ''}</TD>
                    <TD className="min-w-24 text-muted-foreground sm:pr-6">{r.item ? names(r.item.reporterRel) : ''}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <ul className="grid grid-cols-1 gap-2 md:hidden">
            {rows.map((r) => (
              <li key={r.key} className="flex gap-3 rounded-lg border border-border p-3" data-selected={isTicked(r) || undefined}>
                {!lock && tickable(r) && <Checkbox className="mt-0.5" checked={isTicked(r)} onCheckedChange={() => toggle(r)} aria-label={`Select ${r.item?.itemId ?? 'item'}`} />}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.item ? <ItemLink item={r.item} /> : <span className="font-mono text-[0.8rem] text-muted-foreground">{r.unmatched ?? '–'}</span>}
                    <TypeBadge type={r.type} />
                    <span className="ml-auto">{r.item ? <ItemStatus value={r.item.statusRel} className="text-xs" /> : <Badge tone={r.unmatched ? 'warning' : 'neutral'}>{r.unmatched ? 'Unmatched' : 'Not found'}</Badge>}</span>
                  </div>
                  {r.item ? (
                    <Link to={itemPath(r.item)} className="line-clamp-2 text-sm font-medium">
                      {r.item.summary}
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground">{r.unmatched ? 'Migrated from Mantis, not matched to an item yet.' : 'This item was removed, or isn’t yours to see.'}</p>
                  )}
                  {r.item && (
                    <p className="text-xs text-muted-foreground">
                      {r.item.assigneeRel?.length ? names(r.item.assigneeRel) : 'Unassigned'} · reported by {names(r.item.reporterRel)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {linking && <LinkDialog form={form} open={linking} onOpenChange={setLinking} />}
    </Section>
  );
}
