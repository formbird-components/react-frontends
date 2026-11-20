#!/usr/bin/env node
// A stand-in for fieldtec-web, for UI tests that must not change internal-5.
//
// It answers the routes the app uses, from the local Elasticsearch index (internal-5) — the same
// documents the real server searches — and keeps every save in memory only. Nothing is written to
// Mongo or Elasticsearch, and no rules run, so nobody is emailed.
//
// What it does NOT do (the real server does): check passwords (any password signs an SDMS account
// in), apply keys (everyone sees everything), run the Item's server rules (beyond numbering new
// items and naming them "<itemRef>: <summary>"). Use it to test the UI; test rules on fieldtec-web.
//
//   node e2e/sim-backend.mjs            # :3903 (SIM_PORT), Elasticsearch :9200 (SIM_ES), index internal-5 (SIM_INDEX)
//   FIELDTEC_URL=http://localhost:3903 pnpm dev:app

import { randomUUID } from 'node:crypto';
import http from 'node:http';

const ES = process.env.SIM_ES ?? 'http://127.0.0.1:9200';
const INDEX = process.env.SIM_INDEX ?? 'internal-5';
const PORT = Number(process.env.SIM_PORT ?? 3903);
const ITEM_TEMPLATE_ID = '376eb771-043c-4139-b651-1712d7e36cab';
const SDMS_APP_ID = 'db625088-19bf-4eb6-9783-5f0f11c5aede';
/** Account fields never sent to the browser (fieldtec-web strips its own; this strips anything like them). */
const SECRET_FIELDS = ['pass', 'local', 'password', 'passwordHash', 'hash', 'salt', 'resetPasswordToken', 'resetPasswordExpires', 'apiKey', 'apiKeys', 'mfa', 'totp', 'otp', 'keycloakId', 'samlId'];

const saved = new Map(); // documentId → document saved during this run
const sessions = new Map(); // session token → account documentId
let nextRef = 990000; // obviously not a real item number

async function es(path, body) {
  const res = await fetch(`${ES}/${INDEX}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.root_cause?.[0]?.reason ?? `Elasticsearch answered ${res.status}`);
  return json;
}

const strip = (doc) => {
  if (!doc || doc.systemHeader?.systemType !== 'account') return doc;
  const copy = { ...doc };
  for (const f of Object.keys(copy)) if (SECRET_FIELDS.includes(f) || /pass|secret|token|hash|salt/i.test(f)) delete copy[f];
  return copy;
};

async function current(documentId) {
  if (saved.has(documentId)) return saved.get(documentId);
  const r = await es('_search', {
    size: 1,
    query: { bool: { filter: [{ term: { documentId } }, { term: { 'systemHeader.currentVersion': true } }] } },
    _source: { excludes: SECRET_FIELDS },
  });
  return r.hits.hits[0]?._source ?? null;
}

/** documentSearch, as fieldtec-web runs it: the app's bool as a filter, current versions, not deleted. */
async function search(body) {
  const f = typeof body.filter === 'string' ? JSON.parse(body.filter.replace(/'/g, '"')) : (body.filter ?? {});
  const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';
  const filter = [];
  if (f.query?.bool) filter.push({ bool: f.query.bool });
  else if (f.query) filter.push(f.query);
  if (!truthy(body.includeAllVersions)) filter.push({ term: { 'systemHeader.currentVersion': true } });
  const mustNot = [{ term: { 'systemHeader.systemType': 'accountSecurity' } }];
  if (!truthy(body.includeDeleted)) mustNot.push({ term: { 'systemHeader.deleted': true } });
  const size = body.size === 0 ? 0 : Number(body.size ?? body.pageSize ?? 50);
  const from = body.from ?? Number(body.page ?? 0) * size;
  const source = { excludes: SECRET_FIELDS, ...(body.sourceFilter?.include ? { includes: body.sourceFilter.include } : {}) };
  const r = await es('_search', {
    from,
    size,
    query: { bool: { filter, must_not: mustNot } },
    ...(f.sort ? { sort: f.sort } : {}),
    ...(body.trackTotalHits ? { track_total_hits: true } : {}),
    _source: source,
  });
  const hits = r.hits.hits.map((h) => (saved.has(h._source.documentId) ? { ...h, _source: strip(saved.get(h._source.documentId)) } : h));
  return { statusCode: 200, data: { ...r, hits: { ...r.hits, total: typeof r.hits.total === 'object' ? r.hits.total.value : r.hits.total, hits } }, filter: true };
}

function stamp(doc, accountId, isNew) {
  const now = new Date().toISOString();
  const sh = doc.systemHeader ?? {};
  doc.systemHeader = {
    ...sh,
    systemType: sh.systemType ?? 'document',
    previousVersionId: isNew ? undefined : sh.versionId,
    versionId: randomUUID(),
    currentVersion: true,
    createdDate: now,
    createdBy: accountId,
    serverUpdatedDate: now,
    ...(isNew ? { documentCreatedDate: now, documentCreatedBy: accountId, serverCreatedDate: now } : {}),
  };
  if (sh.templateId === ITEM_TEMPLATE_ID || doc.appTags?.includes('item')) {
    if (!doc.itemRef) doc.itemRef = String(nextRef++);
    if (!doc.itemId) doc.itemId = doc.itemRef.padStart(7, '0');
    doc.documentIdAlias ??= doc.itemRef;
    doc.systemHeader.summaryName = `${doc.itemRef}: ${doc.summary ?? ''}`;
    doc.systemHeader.summaryDescription = doc.summaryDescription ?? '';
  }
  return doc;
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
  });

const cookieOf = (req) => Object.fromEntries((req.headers.cookie ?? '').split(/;\s*/).filter(Boolean).map((c) => c.split('=')));

const server = http.createServer(async (req, res) => {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const url = new URL(req.url, 'http://sim');
  const token = cookieOf(req)['sim.sid'];
  const accountId = token ? sessions.get(token) : undefined;
  try {
    if (req.method === 'POST' && url.pathname === '/auth/login/local') {
      const { email } = await readBody(req);
      const r = await es('_search', {
        size: 1,
        query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'account' } }, { term: { 'email.lcase': String(email ?? '').toLowerCase() } }, { term: { 'appRel.documentId': SDMS_APP_ID } }, { term: { 'systemHeader.currentVersion': true } }] } },
        _source: { excludes: SECRET_FIELDS },
      });
      const account = r.hits.hits[0]?._source;
      if (!account) return send(401, 'Invalid email or password');
      const t = randomUUID();
      sessions.set(t, account.documentId);
      return send(200, strip(account), { 'set-cookie': `sim.sid=${t}; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (req.method === 'POST' && url.pathname === '/auth/logout') {
      if (token) sessions.delete(token);
      return send(200, {}, { 'set-cookie': 'sim.sid=; Path=/; Max-Age=0' });
    }
    if (!accountId) return send(401, 'Unauthorized');

    if (req.method === 'GET' && url.pathname === '/api/loggedUser') return send(200, { user: strip(await current(accountId)) });
    if (req.method === 'POST' && url.pathname === '/api/documentSearch') return send(200, await search(await readBody(req)));

    const one = /^\/api\/document\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && one) {
      const doc = await current(decodeURIComponent(one[1]));
      return doc ? send(200, strip(doc)) : send(404, 'Document not found');
    }
    if (req.method === 'PUT' && one) {
      const id = decodeURIComponent(one[1]);
      const before = await current(id);
      if (!before) return send(500, 'Error updating document');
      const change = await readBody(req);
      const doc = stamp({ ...structuredClone(before), ...change, documentId: id, systemHeader: { ...before.systemHeader, ...(change.systemHeader ?? {}) } }, accountId, false);
      saved.set(id, doc);
      console.log(`[sim] PUT ${doc.itemId ?? id}: ${Object.keys(change).join(', ')}`);
      return send(200, strip(doc));
    }
    if (req.method === 'POST' && url.pathname === '/api/document') {
      const body = await readBody(req);
      const doc = stamp({ ...body, documentId: body.documentId ?? randomUUID() }, accountId, true);
      saved.set(doc.documentId, doc);
      console.log(`[sim] POST ${doc.itemId ?? doc.documentId}`);
      return send(200, doc);
    }
    if (url.pathname.startsWith('/api/getFile/')) return send(404, 'Files are not available in the test backend');
    return send(404, `The test backend doesn't answer ${req.method} ${url.pathname}`);
  } catch (error) {
    console.error('[sim]', error.message);
    return send(500, error.message);
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`[sim] test backend on http://localhost:${PORT} (index ${INDEX}; saves stay in memory)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
