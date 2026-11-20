import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

/** "← Workshop": back where the person came from when they came from this app, else to `to`. */
export function BackLink({ to, children, history = false }: { to: string; children: ReactNode; history?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const canGoBack = history && location.key !== 'default';
  return (
    <Link
      to={to}
      onClick={(e) => {
        if (!canGoBack) return;
        e.preventDefault();
        navigate(-1);
      }}
      className="mb-3 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  );
}
