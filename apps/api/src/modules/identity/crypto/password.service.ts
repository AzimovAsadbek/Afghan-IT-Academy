import { randomBytes } from 'node:crypto';

import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';

import { ENV, type Env } from '../../../config/index.js';

/**
 * Argon2id, selected because it resists both GPU cracking and the side-channel
 * weakness of Argon2d.
 *
 * The package exports this as a TypeScript `const enum`, which `isolatedModules`
 * forbids importing, so the value is pinned here alongside its meaning rather
 * than importing an ambient enum the compiler refuses to inline.
 */
const ALGORITHM_ARGON2ID = 2;

/** Parses `$argon2id$v=19$m=19456,t=2,p=1$...` into its cost parameters. */
const DIGEST_PARAMETERS = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/;

/**
 * Password hashing.
 *
 * Two properties matter more than the algorithm choice and are easy to lose:
 *
 * 1. **Uniform timing.** Authentication must take the same time whether or not
 *    the account exists. Skipping the hash for an unknown email turns login
 *    into an account-existence oracle measurable over the network, which
 *    defeats every other anti-enumeration measure in the login path. This is
 *    why `verify` takes a nullable hash and handles the null case itself
 *    instead of letting each caller remember to.
 *
 * 2. **No leakage.** A password never appears in a log line, an error message,
 *    or an exception. Nothing here interpolates the plaintext into a string.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  private readonly options: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
    algorithm: number;
  };

  /**
   * A digest of a random value, hashed once at startup with the live
   * parameters. Verifying against it costs the same as verifying a real
   * password, which is the point.
   */
  private dummyDigest = '';

  constructor(@Inject(ENV) private readonly env: Env) {
    this.options = {
      algorithm: ALGORITHM_ARGON2ID,
      memoryCost: env.AUTH_ARGON2_MEMORY_KIB,
      timeCost: env.AUTH_ARGON2_TIME_COST,
      parallelism: env.AUTH_ARGON2_PARALLELISM,
    };
  }

  async onModuleInit(): Promise<void> {
    // Random, so the digest is not a known constant an attacker could target.
    this.dummyDigest = await this.hash(randomBytes(32).toString('base64'));
  }

  async hash(plainPassword: string): Promise<string> {
    return argon2Hash(plainPassword, this.options);
  }

  /**
   * Verifies a password, spending the same effort when there is no hash to
   * verify against.
   *
   * @param storedDigest the account's digest, or null when the account does not
   *   exist or authenticates through a federated provider only.
   * @returns whether the password matched. Always false for a null digest.
   */
  async verify(storedDigest: string | null, plainPassword: string): Promise<boolean> {
    if (storedDigest === null) {
      await this.burnEquivalentTime(plainPassword);
      return false;
    }

    try {
      return await argon2Verify(storedDigest, plainPassword, this.options);
    } catch {
      // A malformed digest is a data problem, not a successful login. Swallowed
      // deliberately: the reason belongs in the caller's audit entry, and
      // rethrowing here would distinguish "corrupt record" from "wrong
      // password" in the response timing.
      return false;
    }
  }

  /**
   * Whether a digest was produced with weaker parameters than currently
   * configured, so it can be transparently upgraded on the next successful
   * login. Without this, raising the cost only ever protects new accounts.
   */
  needsRehash(storedDigest: string): boolean {
    const match = DIGEST_PARAMETERS.exec(storedDigest);
    if (!match) return true;

    const [, memory, time, parallelism] = match;

    return (
      Number(memory) < this.env.AUTH_ARGON2_MEMORY_KIB ||
      Number(time) < this.env.AUTH_ARGON2_TIME_COST ||
      Number(parallelism) < this.env.AUTH_ARGON2_PARALLELISM
    );
  }

  private async burnEquivalentTime(plainPassword: string): Promise<void> {
    // If onModuleInit has not run (unit tests constructing the service
    // directly), hash instead — still equivalent work.
    if (this.dummyDigest === '') {
      await this.hash(plainPassword);
      return;
    }

    await argon2Verify(this.dummyDigest, plainPassword, this.options).catch(() => false);
  }
}
