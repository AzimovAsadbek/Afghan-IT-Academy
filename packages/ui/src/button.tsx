import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Renders a busy state and blocks further clicks. */
  readonly isLoading?: boolean;
  readonly children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200',
  ghost: 'bg-transparent text-ink-800 hover:bg-brand-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  // Minimum 44px tall at md and above: the touch-target floor for users on
  // small, low-end phones.
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-base',
  lg: 'h-13 px-7 text-lg',
};

/**
 * Base button.
 *
 * Spacing uses logical utilities (`ps-`, `pe-`, `gap-`) rather than physical
 * ones, so the icon/label order mirrors correctly in Dari and Pashto without a
 * second stylesheet.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // Explicit default: an unset `type` inside a form submits it, which is
      // almost never what a component author intends.
      type={type}
      // A loading button must be inert, or a double-tap on a slow connection
      // fires the action twice.
      disabled={disabled === true || isLoading}
      aria-busy={isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-colors duration-150',
        'focus-visible:outline-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
