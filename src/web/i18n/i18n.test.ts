import { describe, expect, it } from 'vitest';
import { translate } from './i18n.js';

describe('translate', () => {
  it('uses the Russian message when present', () => {
    expect(translate('ru', 'topbar.settings')).toBe('Настройки');
  });

  it('falls back to English per message', () => {
    expect(translate('ru', 'help.docs')).toBe(translate('en', 'help.docs'));
  });

  it('fills placeholders and leaves unknown ones', () => {
    expect(translate('en', 'tree.noMatches', { query: 'Tower' })).toContain(
      'Tower',
    );
    expect(translate('en', 'tree.noMatches')).toContain('{query}');
  });
});
