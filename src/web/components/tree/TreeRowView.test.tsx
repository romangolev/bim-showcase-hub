import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VIEW_STATES } from '../../../shared/viewState.js';
import { TreeRowView } from './TreeRowView.js';

const NAME = 'v3: 2026-01-01 10:00 by Sam';

describe('TreeRowView', () => {
  it('derives openability from the view state alone', () => {
    for (const state of VIEW_STATES) {
      const { container, unmount } = render(
        <TreeRowView level={3} kind="version" name={NAME} viewState={state} />,
      );
      const row = container.querySelector('.tree-row');
      const openable = state === 'ready' || state === 'unknown';
      expect(row).toHaveAttribute('data-view-state', state);
      expect(row).toHaveAttribute('data-viewable', String(openable));
      expect(row).toHaveAttribute('data-disabled', String(!openable));
      unmount();
    }
  });

  it('treats a version without a state as not translated', () => {
    const { container } = render(
      <TreeRowView level={3} kind="version" name={NAME} />,
    );
    expect(container.querySelector('.tree-row')).toHaveAttribute(
      'data-view-state',
      'not-translated',
    );
    expect(screen.getByText('Not translated')).toBeInTheDocument();
  });

  it('labels an unverified version Unchecked, not Viewable', () => {
    render(
      <TreeRowView level={3} kind="version" name={NAME} viewState="unknown" />,
    );
    const badge = screen.getByText('Unchecked');
    expect(badge.closest('.tree-row__state')).toHaveAttribute(
      'data-state',
      'unchecked',
    );
    expect(badge.closest('.tree-row__state')).toHaveAttribute(
      'title',
      expect.stringContaining(
        'Could not verify that this version has viewable geometry',
      ),
    );
    expect(screen.queryByText('Viewable')).toBeNull();
  });

  it('shows no badge on folders', () => {
    const { container } = render(
      <TreeRowView level={1} kind="folder" name="Files" />,
    );
    expect(container.querySelector('.tree-row__state')).toBeNull();
    expect(container.querySelector('.tree-row')).not.toHaveAttribute(
      'data-view-state',
    );
  });
});
