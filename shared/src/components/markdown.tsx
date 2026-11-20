// The little Markdown records carry (a request's description: paragraphs, "- " lists, **bold**,
// *italic*), rendered as React elements: no HTML from the record reaches the page.

import { Fragment, type ReactNode } from 'react';
import { cn } from '../utils';

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) parts.push(<strong key={match.index} className="font-semibold">{match[1]}</strong>);
    else if (match[2] !== undefined) parts.push(<em key={match.index}>{match[2]}</em>);
    else parts.push(<code key={match.index} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{match[3]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const withBreaks = (lines: string[]) => lines.map((line, i) => <Fragment key={i}>{i > 0 && <br />}{inline(line)}</Fragment>);

export function Markdown({ text, className }: { text: string | null | undefined; className?: string }) {
  const blocks = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className={cn('grid gap-3 text-sm leading-relaxed', className)}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="grid list-disc gap-1 pl-5 marker:text-muted-foreground">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        if (/^#{1,6}\s/.test(lines[0])) {
          return (
            <div key={i}>
              <div className="font-semibold">{inline(lines[0].replace(/^#{1,6}\s+/, ''))}</div>
              {lines.length > 1 && <p>{withBreaks(lines.slice(1))}</p>}
            </div>
          );
        }
        return <p key={i}>{withBreaks(lines)}</p>;
      })}
    </div>
  );
}
