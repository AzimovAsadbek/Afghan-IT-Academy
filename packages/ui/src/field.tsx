import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

import { cn } from './cn.js';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Visible label. Required — a placeholder is not a label. */
  readonly label: string;
  /**
   * Error text, already translated by the caller. Presence switches the field
   * into its invalid state, so callers never set `aria-invalid` themselves.
   */
  readonly error?: string | undefined;
  /** Persistent guidance, e.g. a password rule. Always visible, not a tooltip. */
  readonly hint?: string | undefined;
}

/**
 * A labelled text input with its hint and error wired to it.
 *
 * The wiring is the reason this exists as a component rather than as a pattern
 * to repeat. `aria-describedby` and `aria-invalid` are the difference between a
 * screen-reader user hearing why their registration failed and hearing nothing
 * at all, and they are exactly the attributes that get dropped when a form is
 * assembled by hand for the fifth time.
 *
 * Ids come from `useId`, so the same field can appear twice on a page (a
 * password and its confirmation) without colliding.
 */
export function Field({ label, error, hint, className, required, ...rest }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-800 text-sm font-medium">
        {label}
        {required === true && (
          // Marked for sighted users and hidden from assistive tech, which
          // already announces the input's own `required`.
          <span aria-hidden="true" className="text-danger ms-1">
            *
          </span>
        )}
      </label>

      {hint !== undefined && (
        <p id={hintId} className="text-ink-700 text-sm">
          {hint}
        </p>
      )}

      <input
        id={id}
        required={required}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
        className={cn(
          // 44px tall: the touch-target floor for low-end phones.
          'h-11 w-full rounded-lg border px-3 text-base',
          'bg-white transition-colors duration-150',
          'focus-visible:outline-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error !== undefined ? 'border-danger' : 'border-brand-200',
          className,
        )}
        {...rest}
      />

      {error !== undefined && (
        // `role="alert"` so the message is announced when it appears after a
        // failed submit, rather than only on the next focus move.
        <p id={errorId} role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export type AlertTone = 'error' | 'success' | 'info';

export interface AlertProps {
  readonly tone: AlertTone;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

const TONE_CLASSES: Record<AlertTone, string> = {
  error: 'border-danger/40 bg-danger/5 text-danger',
  success: 'border-success/40 bg-success/5 text-ink-900',
  info: 'border-brand-200 bg-brand-50 text-ink-900',
};

/**
 * Form-level message: a failed login, a sent verification email.
 *
 * An error is announced assertively because the user has just acted and is
 * waiting; anything else is polite, so a background update does not interrupt
 * what is being read.
 */
export function Alert({ tone, children, className }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn('rounded-lg border px-4 py-3 text-sm', TONE_CLASSES[tone], className)}
    >
      {children}
    </div>
  );
}
