import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../components/route-states';
import { useSession } from '../data/session';

/** A layout route: its pages need someone signed in; others go to the sign-in page (and come back after). */
export function RequireSession({ loginPath = '/login' }: { loginPath?: string }) {
  const { account, loading } = useSession();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!account) return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
