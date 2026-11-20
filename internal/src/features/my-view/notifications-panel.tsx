// My View's Notifications (the template's emailNotificationsDt): the SDMS emails sent to you, latest
// first, 10 a page. Each shows what happened, a link to the item and the message as plain text
// (taken out of the email's HTML: no HTML from an email reaches the page).

import { ArrowRightLeft, BellOff, ChevronLeft, ChevronRight, CircleCheck, CirclePlus, Mail, MessageSquareText, RefreshCw, RotateCcw, UserRoundCog, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Alert, EmptyState } from '@react-frontends/shared/components';
import { useSearch } from '@react-frontends/shared/data';
import { formatDateTime, formatNumber, relative } from '@react-frontends/shared/format';
import { Button, Card, Skeleton } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { notificationsQuery } from '@/domain/queries';
import type { EmailMessage } from '@/domain/types';
import { htmlToText, notificationLink, parseSubject } from './notifications';

const PAGE = 10;
const FIELDS = ['documentId', 'subject', 'message', 'firstCreatedDate', 'systemHeader.createdDate'];

function iconFor(event: string): LucideIcon {
  const e = event.toLowerCase();
  if (e.includes('note')) return MessageSquareText;
  if (e.includes('reopened')) return RotateCcw;
  if (e.includes('closed') || e.includes('resolved')) return CircleCheck;
  if (e.includes('status')) return ArrowRightLeft;
  if (e.includes('assign')) return UserRoundCog;
  if (e.includes('new')) return CirclePlus;
  return Mail;
}

function Notification({ email }: { email: EmailMessage }) {
  const [open, setOpen] = useState(false);
  const { subject, link, text } = useMemo(
    () => ({ subject: parseSubject(email.subject), link: notificationLink(email.message), text: htmlToText(email.message) }),
    [email.subject, email.message],
  );
  const Icon = iconFor(subject.event);
  const when = email.firstCreatedDate ?? email.systemHeader?.createdDate;
  return (
    <li className="flex gap-3 px-4 py-3.5 sm:px-5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="min-w-0 font-medium">{subject.event}</span>
          <time dateTime={String(when ?? '')} title={formatDateTime(when)} className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {relative(when)}
          </time>
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
          {link?.to ? (
            <Link to={link.to} className="min-w-0 truncate font-medium text-primary hover:underline">
              {link.text || subject.itemId || 'Open the item'}
            </Link>
          ) : (
            subject.itemId && <span className="font-mono text-xs">{subject.itemId}</span>
          )}
          {subject.project && <span className="truncate">· {subject.project}</span>}
        </div>
        {text && (
          <>
            <p id={`message-${email.documentId}`} className={cn('mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground', !open && 'line-clamp-2')}>
              {text}
            </p>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={`message-${email.documentId}`}
              className="mt-1 cursor-pointer text-xs font-medium text-primary hover:underline"
            >
              {open ? 'Show less' : 'Show the whole message'}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function NotificationsPanel({ email }: { email: string | undefined }) {
  const [page, setPage] = useState(0);
  const top = useRef<HTMLDivElement>(null);
  // A new page starts at its top (the pager is at the bottom).
  const turn = (to: number) => {
    setPage(to);
    if (top.current && top.current.getBoundingClientRect().top < 0) top.current.scrollIntoView({ block: 'start' });
  };
  const request = useMemo(() => (email ? notificationsQuery(email) : null), [email]);
  useEffect(() => setPage(0), [email]);
  const search = useSearch<EmailMessage>('notifications', request, { size: PAGE, page, include: FIELDS, trackTotal: true });
  const total = search.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const rows = search.data?.documents ?? [];

  if (!email)
    return (
      <Card>
        <EmptyState icon={BellOff} title="No email address">
          Your account has no email address, so SDMS can’t email you.
        </EmptyState>
      </Card>
    );
  if (search.isError) return <Alert>Couldn’t load your notifications. {(search.error as Error).message}</Alert>;

  return (
    <Card className="overflow-hidden">
      <div ref={top} className="flex scroll-mt-20 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Notifications</h2>
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">SDMS emails sent to {email}</span>
      </div>
      {search.isPending ? (
        <ul aria-busy="true" aria-label="Loading notifications" className="divide-y divide-border">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex gap-3 px-5 py-4">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <EmptyState icon={BellOff} title="No notifications">
          Emails SDMS sends you about your items show up here.
        </EmptyState>
      ) : (
        <ul className={cn('divide-y divide-border transition-opacity', search.isPlaceholderData && 'opacity-60')}>
          {rows.map((e) => (
            <Notification key={e.documentId} email={e} />
          ))}
        </ul>
      )}
      {total > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-1.5 text-xs text-muted-foreground">
          <span>
            {formatNumber(page * PAGE + 1)}–{formatNumber(Math.min(total, (page + 1) * PAGE))} of {formatNumber(total)}
          </span>
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => void search.refetch()} aria-label="Reload" disabled={search.isFetching}>
              <RefreshCw className={cn('size-4', search.isFetching && 'animate-spin')} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => turn(page - 1)} disabled={page === 0} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="tabular-nums">
              {page + 1} / {formatNumber(pages)}
            </span>
            <Button variant="ghost" size="icon" onClick={() => turn(page + 1)} disabled={page + 1 >= pages || (page + 1) * PAGE >= 10000} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </span>
        </div>
      )}
    </Card>
  );
}
