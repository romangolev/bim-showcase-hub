import { describe, expect, it } from 'vitest';
import {
  modelDocumentTitle,
  modelTabTitle,
  viewerTabTitle,
} from './ModelPage.js';

const LONG_URN =
  'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLmFCY0RlRmdIaUprTG1ObzE_dmVyc2lvbj0y';

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

describe('model titles', () => {
  it('builds the tab title from a stored context', () => {
    expect(
      modelTabTitle(LONG_URN, { file: 'Tower.rvt', v: 'v2', crumbs: ['Hub'] }),
    ).toEqual({
      label: 'Tower.rvt · v2',
      tooltip: `Hub / Tower.rvt · v2\n${LONG_URN}`,
    });
  });

  it('names the document after the model', () => {
    expect(modelDocumentTitle(LONG_URN, 'Tower.rvt', 'v2')).toBe(
      'Tower.rvt v2 · BIM Showcase Hub',
    );
    expect(modelDocumentTitle(LONG_URN, 'Core.rvt')).toBe(
      'Core.rvt · BIM Showcase Hub',
    );
  });

  it('falls back to a generic document title', () => {
    expect(modelDocumentTitle('abc123')).toBe('Model · BIM Showcase Hub');
  });
});
