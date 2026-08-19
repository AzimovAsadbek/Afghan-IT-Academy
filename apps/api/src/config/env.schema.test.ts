import { describe, expect, it } from 'vitest';

import { parseEnv } from './env.schema.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/afghan_it_academy',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: 'http://localhost:3000',
};

describe('parseEnv', () => {
  it('applies safe defaults for optional variables', () => {
    const env = parseEnv({ ...validEnv });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.API_PREFIX).toBe('/api');
    expect(env.TRUSTED_PROXY_HOPS).toBe(0);
  });

  it('coerces numeric variables from strings', () => {
    const env = parseEnv({ ...validEnv, PORT: '8080' });
    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe('number');
  });

  it('splits and validates the CORS origin list', () => {
    const env = parseEnv({
      ...validEnv,
      CORS_ORIGINS: 'https://a.example , https://b.example',
    });

    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _omitted, ...rest } = validEnv;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres database URL', () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects an out-of-range port', () => {
    expect(() => parseEnv({ ...validEnv, PORT: '70000' })).toThrow(/PORT/);
  });

  it('reports every problem at once', () => {
    expect(() => parseEnv({ CORS_ORIGINS: 'http://localhost:3000' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL/,
    );
  });

  it('forbids plain-HTTP CORS origins in production', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'http://insecure.example',
      }),
    ).toThrow(/Plain-HTTP origins/);
  });

  it('forbids debug logging in production', () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://secure.example',
        LOG_LEVEL: 'debug',
      }),
    ).toThrow(/debug\/trace logging/);
  });

  it('accepts a well-formed production environment', () => {
    const env = parseEnv({
      ...validEnv,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://afghanitacademy.af',
      LOG_LEVEL: 'info',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.CORS_ORIGINS).toEqual(['https://afghanitacademy.af']);
  });

  it('returns a frozen object', () => {
    const env = parseEnv({ ...validEnv });
    expect(Object.isFrozen(env)).toBe(true);
  });
});
