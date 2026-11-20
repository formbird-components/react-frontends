// A new work order on a request: its type, who does it and the estimate. A PM Service starts with
// the asset's service plan tasks as its service checks (as fleet's seed and checklist build them).

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { NumberInput, Alert } from '@react-frontends/shared/components';
import { LookupSelect, PersonPicker } from '@/components/pickers';
import { Button, Dialog, DialogContent, DialogFooter, Field, Switch } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { useCreate } from '@/data/records';
import { useSession } from '@/data/session';
import { assetValue } from '@/data/values';
import { first, type Asset, type CheckItem, type Doc, type LookupValue, type PersonValue, type WorkOrder, type WorkshopRequest } from '@/domain/types';
import { validateWorkOrder } from '@/domain/validate';
import { api } from '@react-frontends/shared/api';
import { itemsFromSheet } from '@/features/checks/checklist';
import { WORKSHOP_TYPES } from './data';
import { statusValue } from './request';

/** The service checks for a PM Service on an asset: its plan's tasks, unanswered. */
export async function serviceChecksFor(asset: { servicePlanRel?: { documentId: string }[] } | undefined): Promise<CheckItem[]> {
  const planId = first(asset?.servicePlanRel)?.documentId;
  if (!planId) return [];
  const plan = await api.get<Doc & { tasks?: CheckItem[] }>(planId);
  return itemsFromSheet(plan.tasks);
}

export function NewWorkOrderDialog({ request, open, onOpenChange }: { request: WorkshopRequest; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { who, me } = useSession();
  const navigate = useNavigate();
  const statuses = useLookup('workOrderStatus');
  const create = useCreate<WorkOrder>('workOrder');
  const [type, setType] = useState<LookupValue>();
  const [assignee, setAssignee] = useState<PersonValue>();
  const [estimate, setEstimate] = useState<number | null>(null);
  const [startNow, setStartNow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(undefined);
    setAssignee(first(request.assignedToRel) ?? (who.isWorkshop && me ? me : undefined));
    setEstimate(null);
    setStartNow(false);
    setError('');
  }, [open, request, who.isWorkshop, me]);

  const submit = async () => {
    setError('');
    if (!type) return setError('Choose the work order type.');
    const status = statuses.data?.find((s) => s.name === (startNow ? 'In Progress' : 'New'));
    if (!status) return setError('The work order statuses are still loading. Try again in a moment.');
    setBusy(true);
    try {
      // The work order keeps the asset with its service plan (fleet's work order asset picker).
      const assetRef = first(request.assetRel);
      let assetRel = request.assetRel ?? [];
      let checks: CheckItem[] = [];
      if (assetRef) {
        const asset = await api.get<Asset>(assetRef.documentId).catch(() => undefined);
        if (asset) assetRel = [assetValue(asset, ['servicePlanRel'])];
        if (type.name === 'PM Service') checks = await serviceChecksFor(asset ?? assetRef);
      }
      const fields: Partial<WorkOrder> = {
        requestRel: [{ documentId: request.documentId, name: request.systemHeader?.summaryName ?? request.requestRef ?? '', requestRef: request.requestRef, assetRel: request.assetRel }],
        assetRel,
        workOrderTypeRel: [type],
        workOrderStatusRel: [statusValue(status)],
        assignedToRel: assignee ? [assignee] : [],
        ...(estimate !== null ? { estimatedLabourHours: estimate } : {}),
        serviceChecksArr: checks,
        lineItemsArr: [],
      };
      const message = validateWorkOrder(fields, who);
      if (message) {
        setError(message);
        return;
      }
      const saved = await create.mutateAsync(fields);
      toast.success(`${saved.workOrderRef ?? 'Work order'} created`, { description: `${type.name} on ${request.requestRef ?? 'the request'}${startNow ? ', in progress' : ''}` });
      onOpenChange(false);
      navigate(`/workshop/work-orders/${saved.documentId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New work order" description={`A job on ${request.requestRef ?? 'this request'}: parts, labour and the work done are recorded on it.`}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Type" htmlFor="wo-type" required hint={type?.name === 'PM Service' ? 'Starts with the asset’s service plan tasks as service checks.' : undefined}>
            <LookupSelect id="wo-type" kind="workOrderType" value={type} onChange={setType} placeholder="Choose a type" invalid={!!error && !type} />
          </Field>
          <Field label="Assigned to" htmlFor="wo-assignee">
            <PersonPicker id="wo-assignee" types={WORKSHOP_TYPES} value={assignee} onChange={setAssignee} placeholder="Unassigned" clearable />
          </Field>
          <Field label="Estimated labour" htmlFor="wo-estimate">
            <NumberInput id="wo-estimate" value={estimate} onValueChange={setEstimate} suffix="h" placeholder="e.g. 2" digits={2} />
          </Field>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium">Start work now</span>
              <span className="block text-xs text-muted-foreground">Creates it In Progress (and the request with it).</span>
            </span>
            <Switch checked={startNow} onCheckedChange={setStartNow} />
          </label>
          {error && <Alert>{error}</Alert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Create work order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
