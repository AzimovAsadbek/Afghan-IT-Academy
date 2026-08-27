import type { ReactNode } from 'react';

import { cn } from './cn.js';

export type BadgeTone = 'neutral' | 'brand' | 'muted';

export interface BadgeProps {
  readonly tone?: BadgeTone | undefined;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-brand-50 text-brand-800 border-brand-100',
  brand: 'bg-brand-600 text-white border-brand-600',
  muted: 'bg-white text-ink-700 border-brand-100',
};

/**
 * A small, non-interactive label — a course level, a subject, a translation
 * notice.
 *
 * Deliberately not a button or a link. A badge that looks clickable and is not
 * is a small betrayal repeated on every card; when a badge should filter the
 * catalogue, render a `FilterChip` instead.
 */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
