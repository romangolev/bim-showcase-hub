import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  type PaneTitle,
  PaneTitleContext,
  type SetPaneTitle,
} from '../layout/layoutContext.js';
import { render } from '../test/render.js';
import { ModelPage, viewerTabTitle } from './ModelPage.js';

const LONG_URN =
  'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLmFCY0RlRmdIaUprTG1ObzE_dmVyc2lvbj0y';

function renderWithTitles(ui: ReactElement) {
  const calls: [string, PaneTitle | null][] = [];
  const setter: SetPaneTitle = (id, title) => {
    calls.push([id, title]);
  };
  const view = render(
    <PaneTitleContext.Provider value={setter}>{ui}</PaneTitleContext.Provider>,
  );
  return { calls, ...view, setter };
}

describe('viewerTabTitle', () => {
  it('joins the file name and version', () => {
    expect(viewerTabTitle(LONG_URN, 'Tower.rvt', 'v1').label).toBe(
      'Tower.rvt · v1',
    );
  });

  it('uses the file name alone without a version', () => {
    expect(viewerTabTitle('abc123', 'Tower.rvt').label).toBe('Tower.rvt');
  });

  it('falls back to a generic name with the version read from the urn', () => {
    expect(viewerTabTitle(LONG_URN).label).toBe('Untitled model · v2');
  });

  it('puts the full path and the urn in the tooltip', () => {
    expect(
      viewerTabTitle(LONG_URN, 'Tower.rvt', 'v2', [
        'Studio hub',
        'Riverside Tower',
        'Project Files',
      ]).tooltip,
    ).toBe(
      `Studio hub / Riverside Tower / Project Files / Tower.rvt · v2\n${LONG_URN}`,
    );
  });

  it('shows the urn alone below the name when there are no crumbs', () => {
    expect(viewerTabTitle(LONG_URN, 'Tower.rvt').tooltip).toBe(
      `Tower.rvt\n${LONG_URN}`,
    );
  });
});

describe('ModelPage', () => {
  it('renders nothing in the viewer pane', () => {
    const { container } = renderWithTitles(
      <ModelPage urn={LONG_URN} file="Tower.rvt" version="v2" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('publishes the viewer title and clears it on unmount', () => {
    const { calls, unmount } = renderWithTitles(
      <ModelPage
        urn={LONG_URN}
        file="Tower.rvt"
        version="v2"
        crumbs={['Hub', 'Docs']}
      />,
    );
    expect(calls).toEqual([
      [
        'viewer',
        {
          label: 'Tower.rvt · v2',
          tooltip: `Hub / Docs / Tower.rvt · v2\n${LONG_URN}`,
        },
      ],
    ]);
    unmount();
    expect(calls.at(-1)).toEqual(['viewer', null]);
  });

  it('updates the title when the model changes', () => {
    const { calls, rerender, setter } = renderWithTitles(
      <ModelPage urn={LONG_URN} file="Tower.rvt" version="v2" />,
    );
    rerender(
      <PaneTitleContext.Provider value={setter}>
        <ModelPage urn="other" file="Core.rvt" version="v1" />
      </PaneTitleContext.Provider>,
    );
    const published = calls.filter(([, title]) => title !== null);
    expect(published.map(([, title]) => title?.label)).toEqual([
      'Tower.rvt · v2',
      'Core.rvt · v1',
    ]);
  });

  it('renders without a layout provider', () => {
    expect(() =>
      render(<ModelPage urn={LONG_URN} file="Tower.rvt" />),
    ).not.toThrow();
  });

  it('sets the document title per model and restores it on unmount', () => {
    document.title = 'BIM Showcase Hub';
    const { unmount, rerender } = render(
      <ModelPage urn={LONG_URN} file="Tower.rvt" version="v2" />,
    );
    expect(document.title).toBe('Tower.rvt v2 · BIM Showcase Hub');
    rerender(<ModelPage urn={LONG_URN} file="Core.rvt" />);
    expect(document.title).toBe('Core.rvt · BIM Showcase Hub');
    unmount();
    expect(document.title).toBe('BIM Showcase Hub');
  });

  it('falls back to a generic document title', () => {
    document.title = 'BIM Showcase Hub';
    const { unmount } = render(<ModelPage urn="abc123" />);
    expect(document.title).toBe('Model · BIM Showcase Hub');
    unmount();
    expect(document.title).toBe('BIM Showcase Hub');
  });
});
