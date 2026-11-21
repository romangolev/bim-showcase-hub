import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('paneLifecycle imports', () => {
  it('pulls in no component file and no React or dockview value', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/web/layout/paneLifecycle.ts'),
      'utf8',
    );
    const imports = [
      ...source.matchAll(/^import (type )?[^;]*? from '([^']+)';/gms),
    ];
    expect(imports.length).toBeGreaterThan(0);
    for (const [, typeOnly, found] of imports) {
      const specifier = found as string;
      expect(specifier).not.toMatch(/\.tsx$|\.tsx?x?\.js$/);
      expect(specifier).not.toMatch(/\/panes\.js$/);
      if (/^(react|dockview)/.test(specifier)) expect(typeOnly).toBeTruthy();
    }
  });
});
