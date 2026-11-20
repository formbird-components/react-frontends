// Item text (descriptions, notes) is Markdown, GitHub style: headings, lists, tables, code. No HTML
// from a record reaches the page (react-markdown leaves raw HTML out). Formbird's links to items
// ("/form/<id>") open the item here; @mentions ("[@JoBloggs](mailto:…)") show as mentions.

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router';
import { cn } from '@react-frontends/shared/utils';
import { appLinkFor } from '@/domain/rules';

const components: Components = {
  a({ href = '', children }) {
    const inApp = appLinkFor(href);
    if (inApp) return <Link to={inApp} className="font-medium text-primary hover:underline">{children}</Link>;
    if (href.startsWith('mailto:') && String(children).startsWith('@')) {
      return <span className="rounded bg-primary/10 px-1 font-medium text-primary" title={href.slice(7)}>{children}</span>;
    }
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-2 hover:underline">
        {children}
      </a>
    );
  },
  img({ src = '', alt }) {
    // Uploaded files are served by fieldtec-web at /api/getFile/<fileNo> (relative in older items).
    const url = typeof src === 'string' && /^api\//.test(src) ? `/${src}` : src;
    return <img src={url as string} alt={alt ?? ''} loading="lazy" className="my-2 max-h-96 max-w-full rounded-md border border-border" />;
  },
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border bg-muted/50 px-3 py-1.5 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-3 py-1.5 align-top">{children}</td>,
  code({ className, children }) {
    const block = /language-/.test(className ?? '') || String(children).includes('\n');
    return block ? <code className={cn('block', className)}>{children}</code> : <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{children}</code>;
  },
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-md border border-border bg-muted/60 p-3 text-[0.8rem] leading-relaxed">{children}</pre>,
  h1: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h4>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  hr: () => <hr className="my-4 border-border" />,
};

/** Item Markdown as React elements. */
export function SdmsMarkdown({ text, className, empty = 'Nothing yet.' }: { text: string | null | undefined; className?: string; empty?: string }) {
  if (!text?.trim()) return <p className={cn('text-sm text-muted-foreground', className)}>{empty}</p>;
  return (
    <div className={cn('text-sm leading-relaxed break-words [overflow-wrap:anywhere]', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
