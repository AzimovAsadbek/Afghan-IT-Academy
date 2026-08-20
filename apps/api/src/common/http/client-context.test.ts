import { describe, expect, it } from 'vitest';

import { truncateIpAddress } from './client-context.js';

/**
 * Stored addresses are a privacy decision with real consequences for learners in
 * Afghanistan, so the truncation is tested rather than assumed. A regression
 * here writes full addresses into a table nobody re-reads until it matters.
 */
describe('truncateIpAddress', () => {
  it.each([
    ['203.0.113.42', '203.0.113.0/24'],
    ['8.8.8.8', '8.8.8.0/24'],
    ['10.0.0.255', '10.0.0.0/24'],
  ])('reduces IPv4 %s to its /24', (input, expected) => {
    expect(truncateIpAddress(input)).toBe(expected);
  });

  it('unwraps IPv4-mapped IPv6 that proxies produce', () => {
    expect(truncateIpAddress('::ffff:203.0.113.42')).toBe('203.0.113.0/24');
  });

  it.each([
    ['2001:0db8:85a3:0000:0000:8a2e:0370:7334', '2001:0db8:85a3::/48'],
    ['2400:cb00:2048:1::681c:1e', '2400:cb00:2048::/48'],
  ])('reduces IPv6 %s to its /48', (input, expected) => {
    expect(truncateIpAddress(input)).toBe(expected);
  });

  it('never returns the full address', () => {
    const address = '203.0.113.42';
    expect(truncateIpAddress(address)).not.toContain('.42');
  });

  it.each([
    ['::1', '0:0:0::/48'],
    ['2001:db8::1', '2001:db8:0::/48'],
  ])('resolves IPv6 compression in %s before taking the prefix', (input, expected) => {
    // Splitting on ':' and taking three groups yields '::1::/48' for loopback.
    expect(truncateIpAddress(input)).toBe(expected);
  });

  it.each([[undefined], [''], ['not-an-address'], ['1.2.3'], ['1:2:3::4::5'], ['gggg::1']])(
    'returns null for %s rather than storing something misleading',
    (input) => {
      expect(truncateIpAddress(input)).toBeNull();
    },
  );
});
