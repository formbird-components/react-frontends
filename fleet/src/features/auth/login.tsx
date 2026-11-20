// The shared sign-in page with the fleet's panel, and the fleet demo's people for a quick sign-in.

import { CalendarRange, ClipboardCheck, Map, Wrench } from 'lucide-react';
import { SignInPage } from '@react-frontends/shared/shell';
import { PersonAvatar } from '@react-frontends/shared/ui';
import { homeFor } from '@/app/nav';
import { BRAND } from '@/app/brand';
import type { Account } from '@/domain/types';

/** The fleet demo's people (solidjs-components-fleet), for quick sign-in on a demo server. */
const DEMO = [
  { email: 'olivia.bennett@example.com', name: 'Olivia Bennett', role: 'Administrator' },
  { email: 'marcus.reid@example.com', name: 'Marcus Reid', role: 'Asset Manager' },
  { email: 'priya.shah@example.com', name: 'Priya Shah', role: 'Workshop Supervisor' },
  { email: 'tom.nguyen@example.com', name: 'Tom Nguyen', role: 'Mechanic' },
  { email: 'grace.kim@example.com', name: 'Grace Kim', role: 'Plant Operator' },
  { email: 'sofia.russo@example.com', name: 'Sofia Russo', role: 'Driver' },
];
const DEMO_PASSWORD = 'Fleet1234!';

export function LoginPage() {
  return (
    <SignInPage<Account>
      brand={BRAND}
      tagline="Vehicles, plant and the workshop, in one place"
      heading="Book it, check it, fix it. Without the paperwork."
      points={[
        { icon: CalendarRange, text: 'See every asset’s availability and book in seconds' },
        { icon: ClipboardCheck, text: 'Daily Driver checks that raise defects automatically' },
        { icon: Wrench, text: 'Workshop requests and work orders on one board' },
        { icon: Map, text: 'Where everything is, live on the map' },
      ]}
      subtitle="With your fleet account."
      home={(account) => homeFor(account.accountType)}
      extra={(fill) => (
        <div className="mt-10">
          <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Demo accounts · password {DEMO_PASSWORD}</div>
          <div className="grid gap-1.5">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => fill(d.email, DEMO_PASSWORD)}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-card"
              >
                <PersonAvatar name={d.name} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.role}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    />
  );
}
