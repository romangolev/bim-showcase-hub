import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';
import { createAppRouter } from './routes/router.js';

describe('App', () => {
  it('renders the root route', async () => {
    const appRouter = createAppRouter(
      createMemoryHistory({ initialEntries: ['/'] }),
    );
    render(<App appRouter={appRouter} />);
    expect(await screen.findByText('BIM Showcase Hub')).toBeInTheDocument();
  });
});
