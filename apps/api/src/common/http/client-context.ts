import type { Request } from 'express';

import type { RequestWithId } from './request-with-id.js';

/**
 * The subset of a request that is safe to retain in a security record.
 *
 * Deliberately not the request object itself: passing an Express request into a
 * domain service couples that service to HTTP and hands it the headers, body and
 * cookies alongside the two fields it actually needs.
 */
export interface ClientContext {
  /** Network prefix, never the full address. See truncateIpAddress. */
  readonly ipPrefix: string | null;
  readonly userAgent: string | null;
  readonly requestId: string | null;
}

/** Longest User-Agent worth keeping; the rest is padding and log volume. */
const MAX_USER_AGENT_LENGTH = 256;

/**
 * Truncates an address to its network prefix — /24 for IPv4, /48 for IPv6.
 *
 * Enough to recognise "these fifty failed logins came from one network" or to
 * tell a user their account was accessed from somewhere unfamiliar. Not enough
 * to place an individual learner at an address, which in Afghanistan is a
 * safety question and not merely a privacy preference.
 */
export function truncateIpAddress(address: string | undefined): string | null {
  if (!address) return null;

  // Express reports IPv4-mapped IPv6 for IPv4 clients behind some proxies.
  const normalised = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;

  if (normalised.includes('.')) {
    const [a, b, c, d] = normalised.split('.');
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
    return `${a}.${b}.${c}.0/24`;
  }

  if (normalised.includes(':')) {
    const prefix = ipv6PrefixGroups(normalised);
    if (!prefix) return null;
    const [a, b, c] = prefix;
    return `${a}:${b}:${c}::/48`;
  }

  return null;
}

/**
 * Returns the first three groups of an IPv6 address, resolving compression.
 *
 * Splitting on ':' and taking the first three is wrong for any address using
 * `::`: the loopback `::1` splits into three parts and yields the nonsense
 * `::1::/48`. Compression has to be resolved before a prefix means anything.
 */
function ipv6PrefixGroups(address: string): [string, string, string] | null {
  const halves = address.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  const groups =
    halves.length === 1
      ? head
      : [...head, ...Array<string>(8 - head.length - tail.length).fill('0'), ...tail];

  if (groups.length !== 8) return null;
  if (!groups.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group))) return null;

  const [a, b, c] = groups;
  if (a === undefined || b === undefined || c === undefined) return null;

  return [a, b, c];
}

/** Extracts the retainable context from a request. */
export function clientContextOf(request: Request): ClientContext {
  const userAgent = request.headers['user-agent'];
  const { requestId } = request as Partial<RequestWithId>;

  return {
    ipPrefix: truncateIpAddress(request.ip),
    userAgent:
      typeof userAgent === 'string' && userAgent.length > 0
        ? userAgent.slice(0, MAX_USER_AGENT_LENGTH)
        : null,
    requestId: requestId ?? null,
  };
}
