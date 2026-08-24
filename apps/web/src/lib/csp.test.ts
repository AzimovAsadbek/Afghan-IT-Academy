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

  it('restricts network calls to the same origin when no API origin is configured', () => {
    expect(directive(production, 'connect-src')).toBe("connect-src 'self'");
  });

  /**
   * The API is on its own origin in every environment. Without it in
   * connect-src the browser blocks every call, and the user sees "we could not
   * reach the server" while the real reason sits in the console.
   */
  it('permits the configured API origin', () => {
    const policy = buildContentSecurityPolicy(false, 'https://api.example.com/api');
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' https://api.example.com");
  });

  it('reduces the API URL to an origin, since a path in connect-src is ignored', () => {
    const policy = buildContentSecurityPolicy(false, 'https://api.example.com/api/v1');
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self' https://api.example.com");
  });

  it('ignores a same-origin (relative) API URL, which self already covers', () => {
    const policy = buildContentSecurityPolicy(false, '/api');
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'");
  });

  it('does not permit a websocket origin in production', () => {
    const policy = buildContentSecurityPolicy(false, 'https://api.example.com');
    expect(directive(policy, 'connect-src')).not.toContain('ws:');
  });

  it('upgrades insecure requests in production', () => {
    expect(production).toContain('upgrade-insecure-requests');
  });

  /**
   * In development the API is plain http on localhost. Upgrading it would
   * rewrite the request to https and fail the TLS handshake, and there is no
   * mixed-content risk on a loopback address.
   */
  it('does not upgrade insecure requests in development', () => {
    expect(development).not.toContain('upgrade-insecure-requests');
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
