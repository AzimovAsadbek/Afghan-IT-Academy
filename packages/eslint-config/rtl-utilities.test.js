import { describe, expect, it } from 'vitest';

import { nextConfig } from './next.js';

/**
 * Guards the RTL logical-property rule against escaping rot.
 *
 * The selector embeds a regex inside a JavaScript string, which means a single
 * backslash silently degrades `\s` into a literal `s`. That happened: the rule
 * shipped in M001 matched physical utilities only at the very start of a
 * className, so `"flex items-center ml-4"` — the shape almost all real code
 * takes — passed clean for an entire milestone.
 *
 * This asserts on the regex as JavaScript actually parses it, not as it reads
 * in the source, because those two differed and that was the whole bug.
 */

function physicalUtilityRegex() {
  for (const block of nextConfig) {
    const entries = block.rules?.['no-restricted-syntax'];
    if (!Array.isArray(entries)) continue;

    for (const entry of entries.slice(1)) {
      const selector = entry?.selector;
      if (typeof selector !== 'string' || !selector.includes('className')) continue;

      const inner = /value=\/(.*)\/\]/.exec(selector);
      if (inner) return new RegExp(inner[1]);
    }
  }
  throw new Error('The className physical-utility selector is missing from the Next config.');
}

describe('RTL physical-utility guard', () => {
  const regex = physicalUtilityRegex();

  it.each([
    ['ml-4', 'utility alone'],
    ['flex items-center ml-4 gap-2', 'utility in the middle — the shape that regressed'],
    ['rounded-lg px-7 text-left', 'text-left, which takes no trailing value'],
    ['flex border-r-2 p-2', 'border side'],
    ['mt-2 text-sm ml-auto', 'utility at the end'],
    ['absolute left-0 top-0', 'positional inset'],
    ['pr-2', 'padding side'],
  ])('flags %s (%s)', (className) => {
    expect(regex.test(className)).toBe(true);
  });

  it.each([
    ['ms-4 pe-2 text-start border-e-2', 'the logical equivalents'],
    ['flex items-center gap-2 rounded-lg', 'no direction at all'],
    ['grid grid-cols-2 p-4', 'unrelated utilities'],
    // Guards against over-matching: these merely contain the letters.
    ['normal-case', 'substring "mal" must not trigger'],
    ['scroll-mt-4', 'suffix "mt" must not trigger'],
  ])('allows %s (%s)', (className) => {
    expect(regex.test(className)).toBe(false);
  });

  it('requires a word boundary rather than matching mid-token', () => {
    // `html-left` is not a Tailwind utility; matching it would be a false positive.
    expect(regex.test('some-ml-4')).toBe(false);
  });
});
