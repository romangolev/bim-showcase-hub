import { describe, expect, it } from 'vitest';
import { ApiError } from './client.js';
import { childrenQueryOptions } from './hooks.js';
import { ROOT_SCOPE } from './scope.js';

const retry = childrenQueryOptions(ROOT_SCOPE).retry as (
  count: number,
  error: unknown,
) => boolean;

describe('children query retries', () => {
  it('skips a retry when upstream rate limited the request', () => {
    expect(retry(0, new ApiError(429, 'Rate limited', 3000))).toBe(false);
  });

  it('skips a retry when the account has no access', () => {
    expect(retry(0, new ApiError(403, 'Forbidden'))).toBe(false);
  });

  it('retries another error once', () => {
    expect(retry(0, new ApiError(502, 'Upstream service error'))).toBe(true);
    expect(retry(1, new ApiError(502, 'Upstream service error'))).toBe(false);
  });
});
