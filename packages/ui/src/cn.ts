/**
 * Joins class names, dropping falsy entries.
 *
 * Deliberately not `clsx` + `tailwind-merge`: this repository's Tailwind classes
 * are written directly rather than composed from conflicting variant sources, so
 * a merge step would add ~8 kB to every bundle to solve a problem we do not
 * have. Revisit if variant composition ever produces real conflicts.
 */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}
