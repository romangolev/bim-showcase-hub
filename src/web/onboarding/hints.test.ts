import { beforeEach, describe, expect, it } from 'vitest';
import { BSH_KEYS, isPersonalKey } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { dismissHint, HINTS, isHintDismissed, resetHints } from './hints.js';

describe('onboarding hints', () => {
  beforeEach(() => installMemoryStorage());

  it('remembers a dismissed hint and resets', () => {
    expect(isHintDismissed('move-panes')).toBe(false);
    dismissHint('move-panes');
    expect(isHintDismissed('move-panes')).toBe(true);
    resetHints();
    expect(isHintDismissed('move-panes')).toBe(false);
  });

  it('drops unknown ids from storage', () => {
    window.localStorage.setItem(
      HINTS.key,
      JSON.stringify({ dismissed: ['move-panes', 'nope'] }),
    );
    expect(HINTS.read().dismissed).toEqual(['move-panes']);
  });

  it('is personal so sign-out clears it', () => {
    expect(isPersonalKey(BSH_KEYS.personal.onboardingHints)).toBe(true);
  });
});
