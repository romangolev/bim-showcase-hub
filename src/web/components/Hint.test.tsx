import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { isHintDismissed } from '../onboarding/hints.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { render } from '../test/render.js';
import { Hint } from './Hint.js';

describe('Hint', () => {
  beforeEach(() => installMemoryStorage());

  it('shows the text with a dismiss button and stays gone once dismissed', () => {
    render(<Hint id="move-panes">Drag a tab to move a pane.</Hint>);
    expect(screen.getByRole('note').textContent).toContain(
      'Drag a tab to move a pane.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss hint' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(isHintDismissed('move-panes')).toBe(true);
  });
});
