// SDMS data the pages share: who you are and what you may see, projects, lookup values, people,
// items by number. Built on shared's search/record hooks; the requests come from domain/queries.

import { useQuery } from '@tanstack/react-query';
import { api } from '@react-frontends/shared/api';
import { useSearch, useSession } from '@react-frontends/shared/data';
import { term } from '@react-frontends/shared/es';
import { LAST_PROJECT_KEY } from '@/domain/model';
import {
  adminAccessQuery,
  bool,
  itemByRefQuery,
  lookupQuery,
  mentionAccountsQuery,
  peopleQuery,
  projectOptionsQuery,
  projectQuery,
  sdms,
  textSearch,
  userConfigurationQuery,
} from '@/domain/queries';
import { remembersProject } from '@/domain/rules';
import type { Account, Item, LookupDoc, LookupKind, Project, Ref, UserConfiguration } from '@/domain/types';

/** Search groups: a save of an item refreshes 'items' searches; lookups rarely change. */
export const ITEMS = 'items';
const LOOKUPS = 'lookups';
const LONG = 10 * 60_000;

/** The signed-in account (an SDMS account: its projects are in sdmsProjectRel). */
export function useAccount(): Account {
  const { account } = useSession<Account>();
  if (!account) throw new Error('useAccount needs a signed-in session');
  return account;
}

/** Whether you are an SDMS administrator (you may show every project, not only yours). */
export function useIsAdmin(): boolean {
  const account = useAccount();
  const q = useSearch(LOOKUPS, adminAccessQuery(account.documentId), { size: 1, include: ['documentId'] });
  return (q.data?.total ?? 0) > 0;
}

/** A project document (its lookup settings, whether it's inactive). */
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => (await api.search<Project>(projectQuery(projectId!), { size: 1 })).documents[0] ?? null,
    enabled: !!projectId,
    staleTime: LONG,
  });
}

/** The projects you may pick (yours, or all for an admin who asked). */
export function useProjectOptions(showAll = false) {
  const account = useAccount();
  return useQuery({
    queryKey: ['projects', account.documentId, showAll],
    queryFn: async () => (await api.search<Project>(projectOptionsQuery(account, showAll), { size: 200 })).documents,
    staleTime: LONG,
  });
}

/**
 * The active values of a lookup for a project (its settings decide which). An unknown project
 * setting comes back as the query's error.
 */
export function useLookup(kind: LookupKind, project: Project | null | undefined, noProject: 'all' | 'global' = 'all') {
  return useQuery({
    queryKey: ['lookup', kind, project?.documentId ?? null, project ? (project as Record<string, unknown>)[`config${kind === 'tag' ? 'Tag' : kind[0].toUpperCase() + kind.slice(1)}`] : null, noProject],
    queryFn: async () => (await api.search<LookupDoc>(lookupQuery(kind, project, { noProject }), { size: 500 })).documents,
    staleTime: LONG,
  });
}

/**
 * Every status, active or retired (items still carry retired ones): for colours, order and
 * "hide status and above".
 */
export function useAllStatuses() {
  return useQuery({
    queryKey: ['statuses', 'all'],
    queryFn: async () => (await api.search<LookupDoc>({ query: bool({ filter: sdms('status') }), sort: [{ indexNum: 'asc' }] }, { size: 200 })).documents,
    staleTime: LONG,
  });
}

/** A status's colour by id or name (from all statuses). */
export function useStatusColor() {
  const statuses = useAllStatuses().data ?? [];
  return (ref: Ref | undefined): string | undefined => {
    if (!ref) return undefined;
    const doc = statuses.find((s) => s.documentId === ref.documentId) ?? statuses.find((s) => s.systemHeader?.summaryName === ref.name);
    return doc?.color || undefined;
  };
}

/** People on some projects (or all SDMS people) whose name or email contains the text. */
export async function searchPeople(projectIds: string[], text: string, size = 30): Promise<Account[]> {
  const base = peopleQuery(projectIds);
  const words = text.trim();
  const query = words
    ? { ...base, query: bool({ filter: [base.query], must: [textSearch(words, [['systemHeader.summaryName.lcase', 2], ['email', 1]])] }) }
    : base;
  return (await api.search<Account>(query, { size, include: ['documentId', 'systemHeader.summaryName', 'email', 'sdmsProjectRel', 'inactiveBool'] })).documents;
}

/** Every account's email, for turning @mentions into links. */
export function useMentionEmails() {
  return useQuery({
    queryKey: ['mention-emails'],
    queryFn: async () => (await api.search<Account>(mentionAccountsQuery(), { size: 10000, include: ['email'] })).documents.map((a) => a.email).filter((e): e is string => !!e),
    staleTime: LONG,
  });
}

/** Your SDMS settings document (saved filters, email preferences), or null if you have none. */
export function useUserConfiguration() {
  const account = useAccount();
  return useQuery({
    queryKey: ['user-configuration', account.documentId],
    queryFn: async () => (await api.search<UserConfiguration>(userConfigurationQuery(account.documentId), { size: 1 })).documents[0] ?? null,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id of an item named by its number (31492 / 0031492), alias or id. */
export async function findItemId(ref: string): Promise<string | null> {
  if (UUID.test(ref)) return ref;
  const found = await api.search<Item>(itemByRefQuery(ref), { size: 1, include: ['documentId'] });
  return found.documents[0]?.documentId ?? null;
}

/** An item by its number (for "#12345" links): its id and padded number, or null. */
export async function findItemByNumber(ref: string): Promise<{ documentId: string; itemId?: string } | null> {
  const found = await api.search<Item>({ query: bool({ filter: [term('systemHeader.systemType', 'document'), term('appTags', 'item'), term('itemRef', ref)] }) }, { size: 1, include: ['documentId', 'itemId'] });
  return found.documents[0] ?? null;
}

/** The item a URL names (/items/31492, /items/<id>): resolved to its id, then read from the database. */
export function useItem(ref: string | undefined) {
  const id = useQuery({ queryKey: ['item-id', ref], queryFn: () => findItemId(ref!), enabled: !!ref, staleTime: LONG });
  const item = useQuery({ queryKey: ['record', id.data], queryFn: () => api.get<Item>(id.data!), enabled: !!id.data });
  return { id, item, notFound: id.isSuccess && !id.data };
}

// ---------------------------------------------------------------------------------------------
// The last project picked (shared with Formbird's SDMS forms through localStorage)
// ---------------------------------------------------------------------------------------------

export function rememberedProject(): Ref[] | null {
  try {
    const raw = localStorage.getItem(LAST_PROJECT_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return Array.isArray(value) && value[0]?.documentId ? value : null;
  } catch {
    return null;
  }
}

/** Remembers the project picked (not for people with one project: theirs is always picked). */
export function rememberProject(account: Account, project: Ref[] | undefined) {
  if (!remembersProject(account)) return;
  try {
    if (project?.length) localStorage.setItem(LAST_PROJECT_KEY, JSON.stringify([{ documentId: project[0].documentId, name: project[0].name }]));
    else localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    // storage unavailable: nothing to remember
  }
}
