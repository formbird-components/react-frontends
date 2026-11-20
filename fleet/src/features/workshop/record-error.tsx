// A record page that couldn't load its record: gone (404), or a failure worth retrying.

import { RotateCw, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, Page } from '@react-frontends/shared/components';
import { Button } from '@react-frontends/shared/ui';
import { ApiError } from '@react-frontends/shared/api';
import { BackLink } from './back-link';

export function RecordError({ icon, noun, error, onRetry, backTo, backLabel }: { icon: LucideIcon; noun: string; error: unknown; onRetry: () => void; backTo: string; backLabel: string }) {
  const gone = error instanceof ApiError && (error.status === 404 || /not found/i.test(error.message));
  return (
    <Page>
      <BackLink to={backTo} history>
        {backLabel}
      </BackLink>
      <EmptyState
        icon={icon}
        title={gone ? `${noun} not found` : `Couldn’t load the ${noun.toLowerCase()}`}
        action={
          gone ? (
            <Button asChild variant="outline">
              <Link to={backTo}>Back to {backLabel}</Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={onRetry}>
              <RotateCw />
              Try again
            </Button>
          )
        }
      >
        {gone ? 'It may have been removed, or the link is wrong.' : (error as Error | null)?.message}
      </EmptyState>
    </Page>
  );
}
