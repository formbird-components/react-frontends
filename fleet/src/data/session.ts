// The signed-in person (the shared session) with what the fleet derives from them: their role's
// permissions (`who`) and the account as records store a person (`me`).

import { useMemo } from 'react';
import { useSession as useSharedSession, type Session } from '@react-frontends/shared/data';
import type { Account, PersonValue } from '@/domain/types';
import { whoFor, type Who } from '@/domain/workflow';
import { personValue } from './values';

export interface FleetSession extends Session<Account> {
  who: Who;
  /** The account as records store a person ({ documentId, name, email, accountType }). */
  me: PersonValue | null;
}

export function useSession(): FleetSession {
  const session = useSharedSession<Account>();
  const { account } = session;
  const who = useMemo(() => whoFor(account), [account]);
  const me = useMemo(() => (account ? personValue(account) : null), [account]);
  return useMemo(() => ({ ...session, who, me }), [session, who, me]);
}
