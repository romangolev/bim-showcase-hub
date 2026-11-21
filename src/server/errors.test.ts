import { describe, expect, it } from 'vitest';
import { RateLimited, toHttpError } from './errors.js';

function upstream(status: number, headers?: Record<string, string>) {
  return Object.assign(new Error('x'), {
    httpStatusCode: () => status,
    ...(headers ? { axiosError: { response: { headers } } } : {}),
  });
}

describe('toHttpError', () => {
  it('passes an upstream 429 through with Retry-After', () => {
    const err = toHttpError(upstream(429, { 'retry-after': '12' }));
    expect(err).toBeInstanceOf(RateLimited);
    expect(err.status).toBe(429);
    expect(err.message).toBe('Rate limited');
    expect((err as RateLimited).retryAfterSeconds).toBe(12);
  });

  it('defaults Retry-After to 5 seconds when upstream gives none', () => {
    const err = toHttpError(upstream(429));
    expect((err as RateLimited).retryAfterSeconds).toBe(5);
  });

  it('caps a long Retry-After and ignores an unusable one', () => {
    expect(
      (toHttpError(upstream(429, { 'retry-after': '999' })) as RateLimited)
        .retryAfterSeconds,
    ).toBe(120);
    expect(
      (toHttpError(upstream(429, { 'retry-after': 'soon' })) as RateLimited)
        .retryAfterSeconds,
    ).toBe(5);
  });
});
