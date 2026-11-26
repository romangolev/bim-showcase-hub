import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockTheme = readFileSync('src/web/layout/dockTheme.css', 'utf8');

describe('dock tab titles', () => {
  it('shrinks inactive tabs before the active tab keeps its full width', () => {
    expect(dockTheme).toMatch(/\.bsh-dock \.dv-tab \{[^}]*flex-shrink: 1;/s);
    expect(dockTheme).toMatch(
      /\.bsh-dock \.dv-tab\.dv-inactive-tab \{\s*flex-shrink: 100000;/,
    );
    expect(dockTheme).toMatch(
      /\.bsh-dock \.dv-tab\.dv-active-tab \{\s*flex-shrink: 1;/,
    );
  });

  it('ellipsizes a title inside its own tab when the tab is too narrow', () => {
    expect(dockTheme).toMatch(
      /\.bsh-dock \.dv-default-tab-content \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/s,
    );
  });

  it('keeps the close button of a collapsed rail tab at its own size', () => {
    const rule = dockTheme.match(
      /\.bsh-dock \.dv-groupview\[data-collapsed="width"\] \.dv-default-tab-action \{[^}]*\}/,
    )?.[0];
    expect(rule).toBeDefined();
    expect(rule).not.toMatch(/width: \d+%|aspect-ratio/);
  });
});
