// Builds the SDMS demo database: documents shaped like internal-5's, under the ids the app knows
// (src/domain/model.ts), from catalog.mjs.
//
// - The Item template numbers new items with a "Reference No" field (itemRef: the counter's next
//   number), and its PreSaveServer rule pads it into itemId ("0001236"), defaults the status to New
//   and stamps who/when, as SDMS Item - PreSaveServer does. (It sends no emails: the notifications
//   on My View are seeded.)
// - Lookups, projects, people (with the SDMS application and their projects), an SDMS Admin access,
//   user configurations with saved filters, items with notes and relationships, and the emails
//   SDMS would have queued about them.
// Platform documents (system templates, rulesets, the configuration) come from
// solidjs-components-shared's platform package, passed in as `platform`.

import {
  EMAIL_MESSAGE_VTN, ITEM_TEMPLATE_ID, SDMS_ADMIN_ACCOUNT_TYPE_ID, SDMS_APP_ID, USER_CONFIGURATION_TEMPLATE_ID, USER_CONFIGURATION_VTN,
} from '../src/domain/model.ts';
import { ITEMS, LOOKUPS, PASSWORD, PEOPLE, PROJECTS, STATUSES, emailOf } from './catalog.mjs';

const DAY = 24 * 60 * 60 * 1000;
const pad = (ref) => String(ref).padStart(7, '0');

/**
 * @param {{ platform: Record<string, any>, now?: Date, urlRoot?: string }} o
 * @returns {{ documents: Record<string, any>[], people: { name: string, email: string, role: string }[], password: string, urls: Record<string, string> }}
 */
export function buildDemo({ platform, now = new Date(), urlRoot = 'http://localhost:3003' }) {
  const { DocumentSet, header, idFactory } = platform;
  const id = idFactory('sdms-demo');
  const daysAgo = (days, hour = 10) => {
    const d = new Date(now.getTime() - days * DAY);
    d.setUTCHours(hour - 10, (days * 13) % 60, 0, 0); // business hours in Australia (UTC+10)
    return d > now ? new Date(now.getTime() - 5 * 60_000) : d;
  };
  const seededAt = daysAgo(430, 8);
  const adminKey = id('key', 'admin');
  const set = new DocumentSet({ at: seededAt, by: id('account', 'hannah') });
  const add = (doc) => set.add(doc);
  const doc = (templateId, summaryName, fields, o = {}) =>
    add({ documentId: o.documentId ?? id(templateId, summaryName), systemHeader: header({ systemType: 'document', templateId, summaryName, at: o.at ?? seededAt, by: o.by ?? set.defaults.by }), ...fields });

  // ------------------------------------------------------------------ templates
  const T = {
    project: id('template', 'Project'),
    counter: id('template', 'Item counter'),
    application: id('template', 'Application'),
    accountType: id('template', 'Account type'),
    accountAccess: id('template', 'Account access'),
    email: id('template', 'Email message'),
    ...Object.fromEntries(['status', ...Object.keys(LOOKUPS)].map((k) => [k, id('template', `lookup:${k}`)])),
  };
  const COUNTER = { id: id('counter', 'items'), field: 'itemCounter' };
  const SERVER_RULES = id('ruleset', 'SDMS Item - PreSaveServer');
  const ruleRef = (rid, name) => [{ documentId: rid, name }];

  set.template({
    id: ITEM_TEMPLATE_ID,
    name: 'New Item',
    appTags: ['sdms', 'item'],
    summaryNameRule: '{{{itemRef}}}: {{{summary}}}',
    preSaveServerRuleRel: ruleRef(SERVER_RULES, 'SDMS Item - PreSaveServer'),
    // Only what the server acts on: the React app draws the form itself.
    components: [
      { componentName: 'sc-text-box', name: 'itemRef', label: 'Item No.', type: 'Reference No', enabled: false, counterDocumentId: COUNTER.id, counterFieldName: COUNTER.field, format: '#' },
      { componentName: 'sc-text-box', name: 'summary', label: 'Summary' },
    ],
  });
  set.template({ id: T.project, name: 'Project', appTags: ['sdms', 'project'], summaryNameRule: '{{{name}}}', components: [] });
  set.template({ id: T.counter, name: 'Item counter', summaryNameRule: 'Item counter', components: [] });
  set.template({ id: T.application, name: 'Application', summaryNameRule: '{{{name}}}', components: [] });
  set.template({ id: T.accountType, name: 'Account type', summaryNameRule: '{{{name}}}', components: [] });
  set.template({ id: T.accountAccess, name: 'Account access', appTags: ['accountAccess'], components: [] });
  set.template({ id: T.email, name: 'Email message', components: [] });
  set.template({ id: USER_CONFIGURATION_TEMPLATE_ID, name: 'SDMS User Configuration', components: [] });
  for (const kind of ['status', ...Object.keys(LOOKUPS)]) {
    set.template({ id: T[kind], name: kind[0].toUpperCase() + kind.slice(1), appTags: ['sdms', kind], summaryNameRule: '{{{nameId}}}', components: [] });
  }

  // ------------------------------------------------------------------ projects and lookups
  const projects = Object.fromEntries(
    PROJECTS.map((p) => [
      p.key,
      doc(T.project, p.name, {
        appTags: ['sdms', 'project'],
        name: p.name,
        indexNum: p.index,
        inactiveBool: !!p.inactive,
        ...Object.fromEntries(['Type', 'Severity', 'Priority', 'Reproducibility', 'Category', 'Status', 'Resolution', 'Tag'].map((k) => [`config${k}`, 'Global Default'])),
        ...p.config,
      }, { documentId: id('project', p.key) }),
    ]),
  );
  const projectRef = (key) => ({ documentId: projects[key].documentId, name: projects[key].name });

  /** kind → name → lookup document */
  const lookups = {};
  const lookup = (kind, value, index, extra = {}) => {
    const { name, project } = typeof value === 'string' ? { name: value } : value;
    const d = doc(T[kind], name, {
      appTags: ['sdms', kind],
      nameId: name,
      indexNum: index,
      isGlobalDefaultBool: !project,
      inactiveBool: false,
      projectRel: project ? [projectRef(project)] : [],
      ...extra,
    }, { documentId: id(kind, name) });
    (lookups[kind] ??= {})[name] = d;
  };
  for (const s of STATUSES) lookup('status', s.name, s.index, { color: s.color, disableItemBool: !!s.locks });
  for (const [kind, values] of Object.entries(LOOKUPS)) values.forEach((v, i) => lookup(kind, v, (i + 1) * 10));

  // A link to a lookup, with the related fields the Item template copies (REF_FIELDS in model.ts).
  const COPIED = { severity: ['indexNum'], priority: ['indexNum'], status: ['disableItemBool', 'indexNum'] };
  const lookupRef = (kind, name) => {
    const d = lookups[kind][name];
    if (!d) throw new Error(`No ${kind} "${name}" in catalog.mjs`);
    const ref = { documentId: d.documentId, name, projectRel: d.projectRel, isGlobalDefaultBool: d.isGlobalDefaultBool };
    for (const f of COPIED[kind] ?? []) ref[f] = d[f];
    return ref;
  };

  // ------------------------------------------------------------------ the application, admin type, people
  const sdmsApp = doc(T.application, 'SDMS', { name: 'SDMS', appTags: ['application'] }, { documentId: SDMS_APP_ID });
  doc(T.accountType, 'SDMS Admin', { name: 'SDMS Admin', appTags: ['accountType'], appRel: [{ documentId: sdmsApp.documentId, name: 'SDMS' }] }, { documentId: SDMS_ADMIN_ACCOUNT_TYPE_ID });

  const people = {};
  for (const p of PEOPLE) {
    const email = emailOf(p);
    const account = set.account({
      id: id('account', p.key),
      securityId: id('accountSecurity', p.key),
      controlId: id('accountControl', p.key),
      first: p.first,
      last: p.last,
      email,
      title: p.title,
      password: PASSWORD,
      adminKey,
      accessKeys: p.admin ? [adminKey] : [],
      fields: {
        appRel: [{ documentId: sdmsApp.documentId, name: 'SDMS' }],
        sdmsProjectRel: Object.entries(p.projects).map(([key, type]) => ({ ...projectRef(key), type })),
      },
    });
    people[p.key] = { ...p, email, name: `${p.first} ${p.last}`, documentId: account.documentId };
  }
  const personRef = (key) => ({ documentId: people[key].documentId, name: people[key].name, email: people[key].email });
  const authorRef = (key) => ({ documentId: people[key].documentId, name: people[key].name });

  for (const p of PEOPLE.filter((x) => x.admin)) {
    doc(T.accountAccess, `${people[p.key].name} - SDMS Admin`, {
      appTags: ['accountAccess'],
      accountRel: [authorRef(p.key)],
      accountTypeRel: [{ documentId: SDMS_ADMIN_ACCOUNT_TYPE_ID, name: 'SDMS Admin' }],
      status: 'Active',
    });
  }

  // Each person's SDMS settings; Hannah has saved filters on All Items.
  const savedFilters = {
    hannah: [
      { name: 'Open bugs', filterTypeRel: [lookupRef('type', 'Bug')], filterHiddenStatusRel: [lookupRef('status', 'Resolved')] },
      { name: 'Customer reported', filterTagsRel: [lookupRef('tag', 'customer-reported')], filterHiddenStatusRel: [lookupRef('status', 'Resolved')] },
      { name: 'Created this week', presetPeriodCreated: 'This Week' },
    ],
    ravi: [{ name: 'Waiting for test', filterStatusRel: [lookupRef('status', 'Released awaiting test')] }],
  };
  for (const p of PEOPLE) {
    doc(USER_CONFIGURATION_TEMPLATE_ID, `${people[p.key].name} - SDMS settings`, {
      vtn: USER_CONFIGURATION_VTN,
      appTags: ['sdms', 'userConfiguration'],
      accountRel: [authorRef(p.key)],
      allowEmailBool: true,
      sdmsSavedFilters: savedFilters[p.key] ?? [],
    }, { by: people[p.key].documentId });
  }

  // ------------------------------------------------------------------ items
  const itemIdOf = (ref) => id('item', String(ref));
  const byRef = Object.fromEntries(ITEMS.map((s) => [s.ref, s]));
  const mention = (key) => `[@${people[key].first}${people[key].last}](mailto:${people[key].email})`;
  const linkText = (text) =>
    text
      ?.replace(/@\{(\w+)\}/g, (_, key) => mention(key))
      .replace(/#\{(\d+)\}/g, (_, ref) => `[${pad(ref)}](/form/${itemIdOf(ref)})`);

  const emails = [];
  const queueEmail = (spec, to, event, at) => {
    if (at < now.getTime() - 60 * DAY) return;
    const project = projects[spec.project].name;
    const href = `${urlRoot}/form/${itemIdOf(spec.ref)}`;
    emails.push({
      to: people[to].email,
      at,
      subject: `SDMS [${project} ${pad(spec.ref)}]- ${event}`,
      message:
        `<html><body><p>FORMBIRD SDMS</p><p>${event}.</p>` +
        `<p><a href="${href}">${pad(spec.ref)} - ${spec.summary.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a></p>` +
        `<p>Project: ${project}<br>Status: ${spec.status}<br>Priority: ${spec.priority}</p><p>Powered by</p><p>Formbird</p></body></html>`,
    });
  };

  for (const spec of ITEMS) {
    const created = daysAgo(spec.created, 9 + (spec.ref % 7));
    const updated = spec.updated === spec.created ? created : daysAgo(spec.updated, 10 + (spec.ref % 6));
    const notes = (spec.notes ?? []).map(([by, days, text], i) => ({
      dataId: id('note', `${spec.ref}:${i}`),
      detail: linkText(text),
      createdDate: daysAgo(days, 11 + i).toISOString(),
      createdBy: authorRef(by),
    }));
    const lastBy = spec.notes?.find(([, days]) => days === spec.updated)?.[0] ?? spec.assignee ?? spec.reporter;
    const links = (spec.links ?? []).map(([ref, relationshipType]) => ({
      documentId: itemIdOf(ref),
      name: `${ref}: ${byRef[ref].summary}`,
      itemId: pad(ref),
      relationshipType,
    }));
    const item = {
      documentId: itemIdOf(spec.ref),
      systemHeader: {
        ...header({ systemType: 'document', templateId: ITEM_TEMPLATE_ID, summaryName: `${spec.ref}: ${spec.summary}`, at: updated, by: people[lastBy].documentId }),
        documentCreatedDate: created,
        documentCreatedBy: people[spec.reporter].documentId,
        serverCreatedDate: created,
      },
      appTags: ['sdms', 'item'],
      itemRef: String(spec.ref),
      itemId: pad(spec.ref),
      summary: spec.summary,
      projectRel: [projectRef(spec.project)],
      typeRel: [lookupRef('type', spec.type)],
      severityRel: [lookupRef('severity', spec.severity)],
      priorityRel: [lookupRef('priority', spec.priority)],
      statusRel: [lookupRef('status', spec.status)],
      resolutionRel: [lookupRef('resolution', spec.resolution ?? 'Open')],
      ...(spec.repro ? { reproducibilityRel: [lookupRef('reproducibility', spec.repro)] } : {}),
      ...(spec.category ? { categoryRel: [lookupRef('category', spec.category)] } : {}),
      tagsRel: (spec.tags ?? []).map((t) => lookupRef('tag', t)),
      reporterRel: [personRef(spec.reporter)],
      ...(spec.assignee ? { assigneeRel: [personRef(spec.assignee)] } : {}),
      feedbackRel: (spec.feedback ?? []).map(personRef),
      monitoringRel: (spec.monitors ?? []).map(personRef),
      description: linkText(spec.description),
      ...(spec.reproduction ? { reproduction: spec.reproduction } : {}),
      ...(spec.info ? { additionalInformation: linkText(spec.info) } : {}),
      ...(spec.env ? { environmentText: spec.env } : {}),
      ...(spec.browserVersion ? { browserVersion: spec.browserVersion } : {}),
      ...(spec.coreVersion ? { coreVersion: spec.coreVersion } : {}),
      ...(spec.progress ? { progressNote: spec.progress, userProgressNoteBool: true } : {}),
      ...(spec.docs ? { documentationMD: spec.docs } : {}),
      notesCommentsArr: notes,
      relationshipsRel: links,
      createdByRel: [{ ...authorRef(spec.reporter), date: created.toISOString() }],
      createdDate: created.toISOString(),
      updatedByRel: [{ ...authorRef(lastBy), date: updated.toISOString() }],
      updatedDate: updated.toISOString(),
    };
    if (spec.mantis) {
      // Items migrated from Mantis carry its history.
      item.historyOldRel = [
        { createdDate: created.toISOString(), user: authorRef(spec.reporter), type: { id: 1, name: 'New Issue' }, message: '', change: '' },
        { createdDate: daysAgo(spec.created - 2).toISOString(), user: authorRef(spec.assignee), type: { id: 0, name: 'Field changed' }, message: 'Status', change: 'new => assigned' },
        { createdDate: updated.toISOString(), user: authorRef(spec.assignee), type: { id: 0, name: 'Field changed' }, message: 'Status', change: 'assigned => closed' },
      ];
    }
    add(item);

    // The emails SDMS would have queued: the assignee on assignment, the people on the item on each note.
    if (spec.assignee && spec.assignee !== spec.reporter) queueEmail(spec, spec.assignee, `Item has been reassigned (${people[spec.assignee].name})`, created.getTime() + 3_600_000);
    (spec.notes ?? []).forEach(([by, days], i) => {
      const to = new Set([spec.reporter, spec.assignee, ...(spec.monitors ?? []), ...(spec.feedback ?? [])].filter((k) => k && k !== by));
      for (const k of to) queueEmail(spec, k, 'Note added to Item', daysAgo(days, 11 + i).getTime());
    });
    for (const k of spec.feedback ?? []) queueEmail(spec, k, 'Feedback requested', updated.getTime());
    if (['Resolved', 'Closed', 'Released awaiting test'].includes(spec.status) && spec.reporter !== lastBy) {
      queueEmail(spec, spec.reporter, `Item status changed (${spec.status})`, updated.getTime());
    }
  }

  // Relationships are stored on both items.
  for (const spec of ITEMS) {
    for (const [ref, type] of spec.links ?? []) {
      const reverse = { Parent: 'Child', Child: 'Parent', Related: 'Related' }[type];
      const other = set.documents.find((d) => d.documentId === itemIdOf(ref));
      if (!other.relationshipsRel.some((r) => r.documentId === itemIdOf(spec.ref))) {
        other.relationshipsRel.push({ documentId: itemIdOf(spec.ref), name: `${spec.ref}: ${spec.summary}`, itemId: pad(spec.ref), relationshipType: reverse });
      }
    }
  }

  doc(T.counter, 'Item counter', { [COUNTER.field]: Math.max(...ITEMS.map((s) => s.ref)) }, { documentId: COUNTER.id });

  emails.sort((a, b) => a.at - b.at).forEach((e, i) => {
    const at = new Date(e.at);
    doc(T.email, e.subject, { vtn: EMAIL_MESSAGE_VTN, to: [e.to], subject: e.subject, message: e.message, status: 'Sent', firstCreatedDate: at.toISOString() }, {
      documentId: id('email', String(i)),
      at,
      by: id('account', 'hannah'),
    });
  });

  // ------------------------------------------------------------------ server rules and platform documents
  set.ruleset({
    id: SERVER_RULES,
    name: 'SDMS Item - PreSaveServer',
    group: 'sdms',
    dsl: serverRules(lookupRef('status', 'New')),
    linked: [{ documentId: ITEM_TEMPLATE_ID, name: 'New Item', eventNames: 'preSaveServer' }],
  });
  set.platformDocuments([]);
  set.configuration({ defaultTemplate: ITEM_TEMPLATE_ID, urlRoot });

  return {
    documents: set.finish(),
    password: PASSWORD,
    people: PEOPLE.map((p) => ({ name: people[p.key].name, email: people[p.key].email, role: p.admin ? `${p.title}, SDMS admin` : p.title })),
    urls: { myView: '/my-view', allItems: '/items', newItem: '/items/new', firstItem: `/items/${ITEMS[0].ref}` },
  };
}

/**
 * The Item's server rules: what the app relies on SDMS Item - PreSaveServer for. The itemRef is
 * already set by then (the template's Reference No field runs before the rules).
 * @param {object} newStatus - The New status, as a link
 */
function serverRules(newStatus) {
  return `{
#include "JayRule Ruleset Overlay JS",
ruleset : {
  name : "SDMS Item - PreSaveServer",

  // The 7-digit item number people quote ("0001236").
  ruleItemId : {
    ruleCondition : function (ntf) { return !!ntf.document.itemRef && !ntf.document.itemId; },
    ruleAction : function (ntf) {
      ntf.document.itemId = ('0000000' + ntf.document.itemRef).slice(-7);
    }
  },

  // A new item without a status starts as New.
  ruleDefaultStatus : {
    ruleCondition : function (ntf) { return !(ntf.document.statusRel && ntf.document.statusRel.length); },
    ruleAction : function (ntf) {
      ntf.document.statusRel = [${JSON.stringify(newStatus)}];
    }
  },

  // Who and when, for saves that don't stamp it themselves.
  ruleAuthorship : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var now = new Date().toISOString();
      var user = ntf.context.user || {};
      var me = { documentId: ntf.userId, name: user.systemHeader ? user.systemHeader.summaryName : '', date: now };
      if (!ntf.document.createdDate) ntf.document.createdDate = now;
      if (!(ntf.document.createdByRel && ntf.document.createdByRel.length)) ntf.document.createdByRel = [me];
      if (!ntf.document.updatedDate) ntf.document.updatedDate = now;
    }
  }
}
}`;
}
