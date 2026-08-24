import type { ReactNode } from 'react';

/**
 * The frame every authentication screen sits in.
 *
 * A Server Component with no interactivity of its own: the heading, spacing and
 * card chrome ship as HTML, and only the form inside each page is a client
 * component. On a metered connection the difference is the whole point.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-ink-900 text-balance text-2xl font-bold">{title}</h1>
        {subtitle !== undefined && <p className="text-ink-700 text-pretty">{subtitle}</p>}
      </header>

      <div className="border-brand-100 rounded-[--radius-card] border bg-white p-5 shadow-sm">
        {children}
      </div>

      {footer !== undefined && <footer className="text-ink-700 text-sm">{footer}</footer>}
    </main>
  );
}
