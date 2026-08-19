import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Locale-aware replacements for Next's navigation primitives.
 *
 * Always import Link/redirect/useRouter from here rather than from `next/link`
 * or `next/navigation`: the plain versions drop the locale prefix and silently
 * bounce the user back to the default language.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
