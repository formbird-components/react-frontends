// The signed-in person: fieldtec-web's session (a cookie), read from /api/loggedUser. Apps add
// what they derive from the account (roles, permissions) in their own hook on top of useSession.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api, whenSignedOut, type BaseAccount, type Identified } from '../api';

export interface Session<A extends Identified = BaseAccount> {
  account: A | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

/** The query key the session is cached under. */
export const SESSION_KEY = ['session'] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: SESSION_KEY, queryFn: () => api.me(), staleTime: 5 * 60_000 });

  useEffect(() => {
    whenSignedOut(() => {
      client.setQueryData(SESSION_KEY, null);
    });
  }, [client]);

  // Everything cached belongs to the previous person: drop it, but update the session query in
  // place. (Clearing the whole cache would leave this provider watching a removed query.)
  const forgetOthers = useCallback(() => client.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] }), [client]);
  const signIn = useCallback(
    async (email: string, password: string) => {
      await api.signIn(email, password);
      forgetOthers();
      client.setQueryData(SESSION_KEY, await api.me());
    },
    [client, forgetOthers],
  );
  const signOut = useCallback(async () => {
    await api.signOut();
    forgetOthers();
    client.setQueryData(SESSION_KEY, null);
  }, [client, forgetOthers]);

  const value = useMemo<Session>(() => ({ account: data ?? null, loading: isPending, signIn, signOut }), [data, isPending, signIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The session; `A` is the app's account type (what /api/loggedUser returns for its accounts). */
export function useSession<A extends Identified = BaseAccount>(): Session<A> {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session as unknown as Session<A>;
}
