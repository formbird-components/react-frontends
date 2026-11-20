// fieldtec-web's HTTP API, as the apps use it. Everything goes through the app's dev server or
// reverse proxy (same origin), so fieldtec-web's session cookie authenticates every call.
//
// - Sign in: POST /auth/login/local { email, pass } (sets the session); out: POST /auth/logout.
// - Who: GET /api/loggedUser → { user } (401 when signed out).
// - Search: POST /api/documentSearch { filter: { query, sort }, size, page, sourceFilter,
//   includeAllVersions } → Elasticsearch hits.
// - Read: GET /api/document/:id. Create: POST /api/document. Change: PUT /api/document/:id (the fields
//   to change; the server merges them and returns the document).
//
// The server's rulesets still run on every save (PreSaveServer, PostSave). A refused create comes back
// with the rule's message; a refused update only with "Error updating document", so apps check the
// same rules first and show their own message.

export interface SystemHeader {
  systemType: string;
  templateId: string;
  summaryName?: string;
  createdDate?: string;
  createdBy?: string;
  currentVersion?: boolean;
  versionId?: string;
}

/** A fieldtec-web document: any record, template or account. */
export interface Doc {
  documentId: string;
  systemHeader: SystemHeader;
  appTags?: string[];
  [field: string]: unknown;
}

/** Anything with a document id: the least a search result or record type needs. */
export interface Identified {
  documentId: string;
}

/** What every fieldtec-web account has (apps extend it with their own fields). */
export interface BaseAccount extends Doc {
  email?: string;
  usersName?: { firstName?: string; surname?: string };
  jobTitle?: string;
  accountType?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const settings = {
  /** Named in "Can't reach the … server": e.g. "fleet". */
  serverName: '',
};

/**
 * Settings for this app's API client.
 * @param o.serverName - What the server is called in the "can't reach" message (e.g. "fleet": "Can't reach the fleet server.")
 */
export function configureApi(o: { serverName?: string }) {
  if (o.serverName !== undefined) settings.serverName = o.serverName;
}

/** Called when a request finds the session gone (401), so the app can show the sign-in page. */
let onSignedOut: (() => void) | undefined;
export const whenSignedOut = (fn: () => void) => {
  onSignedOut = fn;
};

/**
 * The path the app is served under, from Vite's `base` (APP_BASE at build time): '' at the root,
 * '/react-fleet' behind the demo portal's nginx. fieldtec-web's routes are under it too.
 */
export const BASE_PATH = ((import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/').replace(/\/+$/, '');

/** A root-relative path ("/api/…") under the app's base path. */
export const withBase = (path: string) => (path.startsWith('/') ? `${BASE_PATH}${path}` : path);

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(withBase(url), {
      method,
      credentials: 'same-origin',
      headers: body === undefined || body instanceof FormData ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    const server = settings.serverName ? `the ${settings.serverName} server` : 'the server';
    throw new ApiError(`Can't reach ${server}. Check your connection and try again.`, 0);
  }
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith('/auth/')) onSignedOut?.();
    throw new ApiError(messageOf(text, response.status), response.status);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/** The message in an error response: fieldtec-web sends plain text, or JSON with `message`. */
function messageOf(text: string, status: number): string {
  let message = text.trim();
  try {
    const json = JSON.parse(text);
    message = typeof json === 'string' ? json : json?.message ?? json?.error ?? message;
  } catch {
    // plain text
  }
  // "Saving new document failed with: <rule message>": the rule's own words are what matter.
  message = String(message).replace(/^Saving new document failed with:\s*/i, '');
  if (!message) message = status === 401 ? 'Your session has ended. Sign in again.' : `The server answered ${status}.`;
  return message;
}

export interface SearchOptions {
  /** Page size (default 50). */
  size?: number;
  /** Zero-based page. */
  page?: number;
  /** Fields to return (Elasticsearch _source includes). Leave out for whole documents. */
  include?: string[];
  /** An exact total beyond 10,000 hits. */
  trackTotal?: boolean;
  /**
   * Every version of each document, not only the current one (a record's history). fieldtec-web
   * reads it from the top level of the request, beside `filter`.
   */
  includeAllVersions?: boolean;
}

export interface SearchResult<T> {
  documents: T[];
  total: number;
}

interface SearchResponse {
  data?: { hits?: { total?: number | { value: number }; hits?: { _source: unknown }[] } };
}

/** The body of POST /api/documentSearch for a request ({ query, sort }) and options. */
export function searchBody(request: Record<string, unknown>, options: SearchOptions = {}): Record<string, unknown> {
  const body: Record<string, unknown> = { filter: request, size: options.size ?? 50, page: options.page ?? 0 };
  if (options.include) body.sourceFilter = { include: options.include };
  if (options.trackTotal) body.trackTotalHits = true;
  if (options.includeAllVersions) body.includeAllVersions = true;
  return body;
}

export const newId = () => crypto.randomUUID();

export const api = {
  async signIn<A extends Doc = BaseAccount>(email: string, password: string): Promise<A> {
    return call<A>('POST', '/auth/login/local', { email, pass: password });
  },

  async signOut(): Promise<void> {
    await call('POST', '/auth/logout').catch(() => undefined);
  },

  /** The signed-in account, or null. */
  async me<A extends Doc = BaseAccount>(): Promise<A | null> {
    try {
      const result = await call<{ user?: A }>('GET', '/api/loggedUser');
      return result?.user ?? null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  /**
   * Documents matching an Elasticsearch request ({ query, sort }). The sort goes inside the
   * request: fieldtec-web's search takes it there.
   */
  async search<T = Doc>(request: Record<string, unknown>, options: SearchOptions = {}): Promise<SearchResult<T>> {
    const result = await call<SearchResponse>('POST', '/api/documentSearch', searchBody(request, options));
    const hits = result?.data?.hits;
    const total = typeof hits?.total === 'number' ? hits.total : hits?.total?.value ?? 0;
    return { documents: (hits?.hits ?? []).map((hit) => hit._source as T), total };
  },

  async get<T = Doc>(documentId: string): Promise<T> {
    return call<T>('GET', `/api/document/${encodeURIComponent(documentId)}`);
  },

  /** Creates a document of a template; the server assigns references and runs its rules. */
  async create<T = Doc>(templateId: string, fields: Record<string, unknown>): Promise<T> {
    return call<T>('POST', '/api/document', { ...fields, documentId: newId(), systemHeader: { templateId, systemType: 'document' } });
  },

  /** Changes some fields of a document; returns the saved document. */
  async update<T = Doc>(documentId: string, fields: Record<string, unknown>): Promise<T> {
    try {
      return await call<T>('PUT', `/api/document/${encodeURIComponent(documentId)}`, fields);
    } catch (error) {
      if (error instanceof ApiError && /error updating document/i.test(error.message)) {
        throw new ApiError("The server didn't accept the change (one of its rules refused it). Reload the record and try again.", error.status);
      }
      throw error;
    }
  },
};
