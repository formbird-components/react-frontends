// My View's Notifications: the SDMS emails sent to you, as the server queued them (HTML). The page
// shows them as plain text and a link to the item; the HTML itself never reaches the page.

import { appLinkFor } from '@/domain/rules';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

/** Decodes HTML entities (named ones emails use, and numeric ones). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Lines of the email's own layout, not its message ("FORMBIRD SDMS", "Powered by"). */
const CHROME_LINES = /^(formbird sdms|powered by)$/i;

/**
 * An HTML email as plain text: the head, styles and scripts go; block ends (paragraphs, divisions,
 * rows, rules, line breaks) become line breaks; spaces are tidied and blank runs collapsed. The
 * result is text to show as text, never markup.
 */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return '';
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/gi, '')
    // Line breaks in HTML source are spaces; only the markup breaks lines.
    .replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>|<hr\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote|pre)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  const lines = decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter((line) => !CHROME_LINES.test(line));
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface NotificationLink {
  /** The link as the email has it. */
  href: string;
  /** The link's text ("0031313 - EXIF changes for components"). */
  text: string;
  /** The item page here (/items/<documentId>). */
  to: string | null;
}

/**
 * The item an email is about: its first link to a Formbird form (the original's Link column took
 * the email's first link), with the link's text.
 */
export function notificationLink(html: string | undefined | null): NotificationLink | null {
  if (!html) return null;
  const anchors = Array.from(html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi), (m) => ({
    href: decodeEntities(m[2].trim()),
    text: htmlToText(m[3]).replace(/\s+/g, ' ').trim(),
  }));
  const found = anchors.find((a) => appLinkFor(a.href));
  return found ? { ...found, to: appLinkFor(found.href) } : null;
}

export interface NotificationSubject {
  /** What happened ("Note added to Item", "Item has been reassigned (Jo Bloggs)"). */
  event: string;
  project?: string;
  /** The item's number as the subject has it ("0031313"). */
  itemId?: string;
}

/** An SDMS subject, "SDMS [<project> <number>]- <what happened>", in parts (the whole subject as the event otherwise). */
export function parseSubject(subject: string | undefined | null): NotificationSubject {
  const s = (subject ?? '').trim();
  const m = /^SDMS\s*\[(.*?)\s+(\d+)\]\s*-?\s*(.*)$/i.exec(s);
  if (!m) return { event: s.replace(/^SDMS\s*/i, '') || '(no subject)' };
  return { event: m[3].trim().replace(/\.$/, '') || '(no subject)', project: m[1].trim() || undefined, itemId: m[2] };
}

/** A message shortened to one paragraph of about `length` characters. */
export function messageExcerpt(text: string, length = 280): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat;
}
