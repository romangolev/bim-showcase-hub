import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { setPaneColor, usePaneAppearances } from './paneAppearance.js';

function Probe() {
  const appearances = usePaneAppearances();
  return <span>{JSON.stringify(appearances)}</span>;
}

beforeEach(() => installMemoryStorage());

it('reacts to a color write', async () => {
  render(<Probe />);
  expect(screen.getByText('{}')).toBeInTheDocument();
  act(() => {
    setPaneColor('summary', 'blue');
  });
  await waitFor(() =>
    expect(
      screen.getByText('{"summary":{"color":"blue"}}'),
    ).toBeInTheDocument(),
  );
});
