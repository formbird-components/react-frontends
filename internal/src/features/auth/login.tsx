// Signing in to SDMS: email and password (fieldtec-web's accounts on internal-5).

import { History, LayoutDashboard, ListTodo } from 'lucide-react';
import { SignInPage } from '@react-frontends/shared/shell';
import { BRAND } from '@/app/brand';
import { HOME } from '@/app/nav';

export function LoginPage() {
  return (
    <SignInPage
      brand={BRAND}
      tagline="Formbird's service desk"
      heading="Every item, from report to release."
      points={[
        { icon: LayoutDashboard, text: 'What is assigned to you, waiting on you, or reported by you' },
        { icon: ListTodo, text: 'Every item, searched and filtered across projects' },
        { icon: History, text: 'Back to what you worked on last' },
      ]}
      subtitle="With your Formbird account."
      home={() => HOME}
    />
  );
}
