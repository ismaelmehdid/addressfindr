import type { ReactNode } from 'react';
import { PublicLanguageSwitcher } from './components/public-language-switcher';

export default function PublicLayout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <>
      <PublicLanguageSwitcher />
      {children}
    </>
  );
}
