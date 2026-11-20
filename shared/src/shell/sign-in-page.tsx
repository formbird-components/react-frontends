// Signing in with an email and password (fieldtec-web's local sign-in). On wide screens a panel
// beside the form shows the app's name, a heading and what the app does.

import { ArrowRight, Loader2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import type { BaseAccount } from '../api';
import { Alert } from '../components/page';
import { useSession } from '../data/session';
import { Button, Field, Input } from '../ui';
import type { Brand, IconType } from './types';

export interface SignInPageProps<A extends BaseAccount = BaseAccount> {
  brand: Brand;
  /** Under the name in the panel: "Vehicles, plant and the workshop, in one place". */
  tagline?: string;
  /** The panel's heading. */
  heading?: string;
  /** What the app does, in the panel. */
  points?: { icon: IconType; text: string }[];
  /** Under "Sign in" (default "With your account."). */
  subtitle?: string;
  /** Where someone already signed in goes when they didn't come from a page (default /). */
  home?: (account: A) => string;
  /** Below the form; `fill` puts an email and password in it (e.g. demo accounts on a demo server). */
  extra?: (fill: (email: string, password: string) => void) => ReactNode;
}

export function SignInPage<A extends BaseAccount = BaseAccount>({ brand, tagline, heading, points = [], subtitle = 'With your account.', home = () => '/', extra }: SignInPageProps<A>) {
  const { account, signIn } = useSession<A>();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from;
  if (account) return <Navigate to={from ?? home(account)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      setError((err as Error).message.replace(/^Login failed\.\s*/, '') || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const fill = (e: string, p: string) => {
    setEmail(e);
    setPassword(p);
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-(--hero) p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-[radial-gradient(circle,var(--hero-glow),transparent_65%)]" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[520px] rounded-full bg-[radial-gradient(circle,var(--hero-glow-2),transparent_65%)]" />
        <div className="relative flex items-center gap-3">
          <img src={brand.logo} alt="" className="size-10 rounded-xl" />
          <div>
            <div className="text-lg font-semibold">{[brand.name, brand.product].filter(Boolean).join(' ')}</div>
            {tagline && <div className="text-sm text-white/60">{tagline}</div>}
          </div>
        </div>
        <div className="relative mt-auto grid gap-6">
          {heading && <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight">{heading}</h2>}
          {points.length > 0 && (
            <ul className="grid max-w-md gap-3 text-[15px] text-white/80">
              {points.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                    <Icon className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src={brand.logo} alt="" className="size-10 rounded-xl" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <form onSubmit={submit} className="mt-8 grid gap-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" size="lg" disabled={busy} className="mt-2">
              {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              Sign in
            </Button>
          </form>
          {extra?.(fill)}
        </div>
      </section>
    </div>
  );
}
