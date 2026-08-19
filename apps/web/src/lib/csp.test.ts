import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './csp';

const production = buildContentSecurityPolicy(false);
const development = buildContentSecurityPolicy(true);

function directive(policy: string, name: string): string | undefined {
  return policy.split('; ').find((part) => part.startsWith(`${name} `));
}

describe('buildContentSecurityPolicy', () => {
  it('never allows unsafe-eval in production', () => {
    expect(production).not.toContain("'unsafe-eval'");
  });

  it('allows unsafe-eval only for the development refresh runtime', () => {
    expect(development).toContain("'unsafe-eval'");
  });

  it('blocks plugin content, base-tag hijacking and framing', () => {
    expect(production).toContain("object-src 'none'");
    expect(production).toContain("base-uri 'none'");
    expect(production).toContain("frame-ancestors 'none'");
  });

  it('restricts form submission to the same origin', () => {
    expect(production).toContain("form-action 'self'");
  });

  it('restricts fonts to self, since next/font self-hosts them', () => {
    const fontSrc = directive(production, 'font-src');
    expect(fontSrc).toBe("font-src 'self' data:");
  });

  it('restricts network calls to the same origin', () => {
    expect(directive(production, 'connect-src')).toBe("connect-src 'self'");
  });

  it('upgrades insecure requests', () => {
    expect(production).toContain('upgrade-insecure-requests');
  });

  /**
   * Guards the incompatibility documented in csp.ts: with statically
   * pre-rendered pages there is no per-request nonce, and `'strict-dynamic'`
   * causes `'self'` to be ignored — which would block every Next chunk and
   * leave the page rendered but never hydrated.
   */
  it('does not use a nonce or strict-dynamic while pages are statically rendered', () => {
    expect(production).not.toContain('nonce-');
    expect(production).not.toContain("'strict-dynamic'");
  });

  it('permits the inline bootstrap scripts that prerendered documents contain', () => {
    const scriptSrc = directive(production, 'script-src');
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'unsafe-inline'");
  });
});
