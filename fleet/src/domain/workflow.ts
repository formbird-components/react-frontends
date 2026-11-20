// Who may do what, and the status moves each record type allows (as fleet's rulesets enforce them).

import type { Account } from './types';

export const TRANSITIONS: Record<string, Record<string, string[]>> = {
  assetStatus: {
    Commission: ['Active'],
    Active: ['Decommission'],
    Decommission: ['Active', 'Awaiting Disposal'],
    'Awaiting Disposal': ['Active', 'Disposed'],
  },
  bookingStatus: {
    'Asset Reserved': ['Hire Commenced', 'Cancelled'],
    'Hire Commenced': ['Closed'],
  },
  requestStatus: {
    Pending: ['Open', 'Cancelled'],
    Open: ['Drop Off', 'In Progress', 'Cancelled'],
    'Drop Off': ['In Progress', 'Open'],
    'In Progress': ['Work Complete', 'Open'],
    'Work Complete': ['Pick Up', 'Closed', 'In Progress'],
    'Pick Up': ['Closed'],
    Cancelled: ['Pending'],
  },
  workOrderStatus: {
    New: ['In Progress'],
    'In Progress': ['On Hold', 'Complete'],
    'On Hold': ['In Progress'],
    Complete: ['In Progress'],
  },
};

/** The order statuses appear in (boards, filters). */
export const STATUS_ORDER: Record<string, string[]> = {
  assetStatus: ['Commission', 'Active', 'Decommission', 'Awaiting Disposal', 'Disposed'],
  hireStatus: ['Available For Hire', 'On Hire', 'Unavailable For Hire'],
  bookingStatus: ['Asset Reserved', 'Hire Commenced', 'Closed', 'Cancelled'],
  requestStatus: ['Pending', 'Open', 'Drop Off', 'In Progress', 'Work Complete', 'Pick Up', 'Closed', 'Cancelled'],
  workOrderStatus: ['New', 'In Progress', 'On Hold', 'Complete'],
};

/** The next statuses a record may move to. */
export const nextStatuses = (kind: string, from: string) => TRANSITIONS[kind]?.[from] ?? [];

/** Whether a move is allowed (a new record, no previous status, may start anywhere its validator allows). */
export const allowedMove = (kind: string, from: string, to: string) => !from || from === to || nextStatuses(kind, from).includes(to);

/** What the signed-in person may do, from their account type (fleet's access keys match these). */
export interface Who {
  /** Administrators and Asset Managers: asset lifecycle, booking overrides. */
  isManager: boolean;
  /** Workshop staff (Administrator, Supervisor, Technician): requests and work orders. */
  isWorkshop: boolean;
  /** Workshop supervisors (and administrators): triage, closing, cancelling. */
  isSupervisor: boolean;
  userId: string;
}

export function whoFor(account: Account | null | undefined): Who {
  const type = account?.accountType ?? '';
  return {
    isManager: type === 'Administrator' || type === 'Asset Manager',
    isWorkshop: ['Administrator', 'Supervisor', 'Technician'].includes(type),
    isSupervisor: type === 'Administrator' || type === 'Supervisor',
    userId: account?.documentId ?? '',
  };
}

/** Account types, as fleet's accounts use them. */
export const ACCOUNT_TYPES = ['Administrator', 'Asset Manager', 'Supervisor', 'Technician', 'Operator', 'Driver'] as const;
