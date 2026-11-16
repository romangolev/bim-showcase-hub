import { describe, expect, it } from 'vitest';
import { ApiError } from './client.js';
import { friendlyError } from './friendlyError.js';

describe('friendlyError', () => {
  it('maps http statuses to plain language and keeps the raw string as detail', () => {
    const result = friendlyError(new ApiError(502, 'Upstream unavailable'));
    expect(result.message).toBe(
      'The service had a problem. Try again in a moment.',
    );
    expect(result.detail).toBe('Upstream unavailable');
    expect(friendlyError(new ApiError(401, 'x')).message).toMatch(/session/);
    expect(friendlyError(new ApiError(403, 'x')).message).toMatch(/access/);
    expect(friendlyError(new ApiError(404, 'x')).message).toMatch(/find/);
    expect(friendlyError(new ApiError(429, 'x')).message).toMatch(/Too many/);
  });

  it('maps network failures and unknown values', () => {
    expect(friendlyError(new TypeError('Failed to fetch')).message).toMatch(
      /reach the server/,
    );
    expect(friendlyError('boom', 'Custom fallback').message).toBe(
      'Custom fallback',
    );
  });
});
