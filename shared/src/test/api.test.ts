import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, configureApi, searchBody } from '../api';

afterEach(() => {
  vi.unstubAllGlobals();
  configureApi({ serverName: '' });
});

describe('searchBody', () => {
  it('puts the request under filter, with paging', () => {
    expect(searchBody({ query: { match_all: {} } })).toEqual({ filter: { query: { match_all: {} } }, size: 50, page: 0 });
  });

  it('puts includeAllVersions at the top level, where fieldtec-web reads it', () => {
    const body = searchBody({ query: {} }, { size: 5, page: 2, include: ['documentId'], trackTotal: true, includeAllVersions: true });
    expect(body).toEqual({ filter: { query: {} }, size: 5, page: 2, sourceFilter: { include: ['documentId'] }, trackTotalHits: true, includeAllVersions: true });
  });

  it('leaves includeAllVersions out unless asked', () => {
    expect(searchBody({ query: {} }, { includeAllVersions: false })).not.toHaveProperty('includeAllVersions');
  });
});

describe('api', () => {
  it('sends the search and reads hits and the total', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { hits: { total: { value: 7 }, hits: [{ _source: { documentId: 'a' } }] } } })));
    vi.stubGlobal('fetch', fetch);
    const result = await api.search({ query: {} }, { includeAllVersions: true });
    expect(result).toEqual({ documents: [{ documentId: 'a' }], total: 7 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/documentSearch');
    expect(JSON.parse(String(init.body)).includeAllVersions).toBe(true);
  });

  it("names the server it can't reach, when configured", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(api.get('x')).rejects.toThrow("Can't reach the server.");
    configureApi({ serverName: 'fleet' });
    await expect(api.get('x')).rejects.toThrow("Can't reach the fleet server.");
  });

  it('keeps a refused create’s rule message, and explains a refused update', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Saving new document failed with: Odometer is required', { status: 500 })));
    await expect(api.create('t', {})).rejects.toThrow(/^Odometer is required$/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Error updating document', { status: 500 })));
    const error = await api.update('d', {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toMatch(/didn't accept the change/);
  });

  it('answers null for who is signed in when signed out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    expect(await api.me()).toBeNull();
  });
});
