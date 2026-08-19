import { Inter, Noto_Sans_Arabic } from 'next/font/google';

/**
 * Fonts are self-hosted at build time by `next/font`.
 *
 * Two consequences that matter for this product:
 *   - no runtime request to a Google CDN, so the first paint does not depend on
 *     a third-party host being reachable from Afghanistan;
 *   - no third-party sees the visitor's IP.
 *
 * `display: 'swap'` shows fallback text immediately rather than blocking on the
 * font file — the right trade on a slow connection.
 */
export const latinFont = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-latin',
  // Only the weights the design actually uses; each extra weight is another file.
  weight: ['400', '500', '600', '700'],
});

export const arabicFont = Noto_Sans_Arabic({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-arabic',
  weight: ['400', '500', '600', '700'],
});
