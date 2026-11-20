// What a recent document is, in plain words (an item, an email message, an uploaded file…), and its
// name as people read it (fieldtec-web stores names with HTML entities: "O&#x27;Neill").

import type { Doc } from '@/domain/types';

/** System types that aren't documents, by name. */
const SYSTEM_TYPES: Record<string, string> = {
  account: 'Account',
  template: 'Template',
  fileReference: 'Uploaded file',
  ruleset: 'Ruleset',
  rulesetInclude: 'Ruleset include',
  component: 'Component',
  documentation: 'Documentation',
  systemaction: 'System action',
  errorDocument: 'Error report',
  directScript: 'Script',
  schedule: 'Schedule',
  urlRoute: 'Address',
  configuration: 'Configuration',
  accountControl: 'Account control',
};

/** App tags that say which app a document belongs to, not what it is. */
const GENERIC_TAGS = new Set(['system', 'sdms', 'sdmsConfig', 'crm', 'listing', 'docs', 'kubectrl', 'compliance']);

/** "emailMessage" → "Email message", "crmAction" → "Action", "SDMSThing" → "SDMS thing". */
export function words(tag: string): string {
  const spaced = tag
    .replace(/^(crm|sdms|fb)(?=[A-Z])/, '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!spaced) return '';
  const parts = spaced.split(/\s+/).map((w, i) => (/^[A-Z\d]{2,}$/.test(w) ? w : i === 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()));
  return parts.join(' ');
}

/** An SDMS item (bugs, features, releases…): it has a page here. */
export const isItem = (doc: Pick<Doc, 'appTags'>) => !!doc.appTags?.includes('item') && !!doc.appTags?.includes('sdms');

/** The kind of a document in plain words. */
export function kindOf(doc: Pick<Doc, 'appTags' | 'systemHeader'>): string {
  const type = doc.systemHeader?.systemType ?? 'document';
  if (type !== 'document') return SYSTEM_TYPES[type] ?? words(type);
  if (isItem(doc)) return doc.appTags?.includes('releaseItem') ? 'Release' : 'Item';
  const tags = (doc.appTags ?? []).filter((t) => !GENERIC_TAGS.has(t));
  const tag = tags[tags.length - 1];
  return tag ? words(tag) : 'Document';
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Text with HTML entities turned back into characters (text only: nothing is parsed as HTML). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}
