// What a move needs before it is saved: a reason to cancel, how a request closed, or (triage) who
// takes it and when.

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DateTimeInput, Alert } from '@react-frontends/shared/components';
import { LookupSelect, PersonPicker } from '@/components/pickers';
import { Button, DialogContent, DialogFooter, Dialog, Field } from '@react-frontends/shared/ui';
import { first, type LookupValue, type PersonValue, type WorkshopRequest } from '@/domain/types';
import { checkMove, moveLabel, statusOf } from './board';
import { useMoveRequest, WORKSHOP_TYPES } from './data';
import { changedFields } from './edits';
import { useSession } from '@/data/session';

export function MoveDialog({
  request,
  to,
  onOpenChange,
  onMoved,
  openWorkOrders = [],
}: {
  request: WorkshopRequest | undefined;
  /** The status to move to; the dialog is open while it is set. */
  to: string | undefined;
  onOpenChange: (open: boolean) => void;
  onMoved?: (saved: WorkshopRequest) => void;
  openWorkOrders?: string[];
}) {
  const { who } = useSession();
  const { move, pending } = useMoveRequest();
  const [reason, setReason] = useState<LookupValue>();
  const [assignee, setAssignee] = useState<PersonValue>();
  const [priority, setPriority] = useState<LookupValue>();
  const [start, setStart] = useState<string>();
  const [end, setEnd] = useState<string>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!request || !to) return;
    setReason(first(request.closeReasonRel));
    setAssignee(first(request.assignedToRel));
    setPriority(first(request.priorityRel));
    setStart(request.expectedStartDate);
    setEnd(request.expectedCompletionDate);
    setError('');
  }, [request, to]);

  if (!request) return null;
  const from = statusOf(request);
  const check = to ? checkMove(request, to, who, openWorkOrders) : undefined;
  const need = check?.need ?? 'none';

  const submit = async () => {
    if (!to) return;
    let extra: Partial<WorkshopRequest> = {};
    if (need === 'cancelReason') {
      if (!reason) return setError('Choose a Reason For Closing.');
      extra = { closeReasonRel: [reason] };
    } else if (need === 'closeDetails') {
      extra = reason ? { closeReasonRel: [reason] } : {};
    } else if (need === 'triage') {
      if (start && end && new Date(end) <= new Date(start)) return setError('The expected completion must be after the start.');
      extra = changedFields(request, { assignedToRel: assignee ? [assignee] : [], priorityRel: priority ? [priority] : request.priorityRel, expectedStartDate: start, expectedCompletionDate: end });
    }
    const saved = await move(request, to, extra, openWorkOrders);
    if (saved) {
      onOpenChange(false);
      onMoved?.(saved);
    }
  };

  const titles: Record<string, string> = {
    cancelReason: `Cancel ${request.requestRef ?? 'the request'}?`,
    closeDetails: `Close ${request.requestRef ?? 'the request'}`,
    triage: `Triage ${request.requestRef ?? 'the request'}`,
    none: to ? moveLabel(from, to) : '',
  };
  const descriptions: Record<string, string> = {
    cancelReason: 'The request stays on record. A supervisor can reopen it for triage later.',
    closeDetails: 'Closing records the downtime. The asset is released for hire once nothing else holds it in the workshop.',
    triage: 'Open it for the workshop: who takes it and when. Expected dates block the asset’s booking calendar.',
    none: '',
  };

  return (
    <Dialog open={!!to} onOpenChange={onOpenChange}>
      <DialogContent title={titles[need]} description={descriptions[need]} wide={need === 'triage'}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {check && !check.ok && <Alert>{check.reason}</Alert>}
          {(need === 'cancelReason' || need === 'closeDetails') && (
            <Field label="Reason for closing" htmlFor="move-reason" required={need === 'cancelReason'} hint={need === 'closeDetails' ? 'Optional when the work is done.' : undefined}>
              <LookupSelect id="move-reason" kind="closeReason" value={reason} onChange={setReason} placeholder="Choose a reason" invalid={!!error && !reason} />
            </Field>
          )}
          {need === 'triage' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assign to" htmlFor="move-assignee">
                <PersonPicker id="move-assignee" types={WORKSHOP_TYPES} value={assignee} onChange={setAssignee} placeholder="Unassigned" clearable />
              </Field>
              <Field label="Priority" htmlFor="move-priority">
                <LookupSelect id="move-priority" kind="requestPriority" value={priority} onChange={setPriority} />
              </Field>
              <Field label="Expected start" htmlFor="move-start">
                <DateTimeInput id="move-start" value={start} onChange={setStart} />
              </Field>
              <Field label="Expected completion" htmlFor="move-end">
                <DateTimeInput id="move-end" value={end} onChange={setEnd} />
              </Field>
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {need === 'cancelReason' ? 'Keep it' : 'Cancel'}
            </Button>
            <Button type="submit" variant={need === 'cancelReason' ? 'destructive' : 'default'} disabled={pending || !check?.ok}>
              {pending && <Loader2 className="animate-spin" />}
              {to ? moveLabel(from, to) : 'Move'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
