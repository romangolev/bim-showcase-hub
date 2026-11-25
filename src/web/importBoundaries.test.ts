import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const biome = createRequire(import.meta.url).resolve(
  '@biomejs/biome/bin/biome',
);
const args = [
  'lint',
  '--only=style/noRestrictedImports',
  '--max-diagnostics=none',
];
const SUMMARY = /Checked \d+ files? in /;
const BASE_UI = '@base-ui/react';

type Form = 'import' | 'type' | 'export' | 'dynamic';
type Probe = [dir: string, extension: string, specifier: string, form?: Form];

const allowed: Probe[] = [
  ['src/web/ui', 'tsx', 'react'],
  ['src/web/ui', 'tsx', '@base-ui/react/switch'],
  ['src/web/ui', 'tsx', 'clsx'],
  ['src/web/ui', 'tsx', 'tailwind-merge'],
  ['src/web/ui', 'tsx', './cn.js'],
  ['src/web/ui', 'tsx', './types.js', 'type'],
  ['src/web/ui', 'test.tsx', 'vitest'],
  ['src/web/ui', 'test.tsx', '@testing-library/react'],
  ['src/web/panels', 'tsx', '../ui/Button.js'],
  ['src/web/panels', 'tsx', '../viewer/ViewerAdapter.js'],
  ['src/web/panels', 'tsx', '../viewer/createViewerAdapter.js'],
  ['src/web/panels', 'test.tsx', '../viewer/MockViewerAdapter.js'],
  ['src/web/viewer', 'ts', './RealViewerAdapter.js'],
  ['src/web/viewer', 'tsx', '../ui/Button.js'],
];

const forbidden: Probe[] = [
  ['src/web/ui', 'tsx', '../i18n/i18n.js'],
  ['src/web/ui', 'tsx', './../i18n/i18n.js'],
  ['src/web/ui', 'tsx', '../i18n/i18n.js', 'type'],
  ['src/web/ui', 'tsx', '../i18n/i18n.js', 'export'],
  ['src/web/ui', 'tsx', '../i18n/i18n.js', 'dynamic'],
  ['src/web/ui', 'tsx', '../components/Menu.js'],
  ['src/web/ui', 'tsx', '../viewer/ViewerAdapter.js'],
  ['src/web/ui', 'tsx', '../settings/settings.js'],
  ['src/web/ui', 'tsx', '../storage.js'],
  ['src/web/ui', 'tsx', 'chart.js'],
  ['src/web/ui', 'tsx', 'vitest'],
  ['src/web/ui', 'test.tsx', '../test/render.js'],
  ['src/web/ui/menu', 'tsx', '../cn.js'],
  ['src/web/panels', 'tsx', '@base-ui/react'],
  ['src/web/panels', 'tsx', '@base-ui/react/switch'],
  ['src/web/panels', 'tsx', '@base-ui/react/switch', 'type'],
  ['src/web/panels', 'tsx', '@base-ui/react/switch', 'export'],
  ['src/web/panels', 'tsx', '@base-ui/react/switch', 'dynamic'],
  ['src/web/viewer', 'tsx', '@base-ui/react/menu'],
  ['src/web/panels', 'tsx', '../viewer/RealViewerAdapter.js'],
  ['src/web/tools/paint', 'ts', '../../viewer/autodesk.js'],
  ['src/web/layout', 'ts', '../viewer/autodeskTools.js'],
  ['src/web/layout', 'test.ts', '../viewer/fakeFederatedViewer.js'],
];

const CANARY: Probe = ['src/web/panels', 'tsx', '@base-ui/react/button'];

function statement(specifier: string, form: Form = 'import'): string {
  if (form === 'type') {
    return `import type { x } from '${specifier}';\nexport type y = x;\n`;
  }
  if (form === 'export') return `export { x } from '${specifier}';\n`;
  if (form === 'dynamic') return `export const y = import('${specifier}');\n`;
  return `import { x } from '${specifier}';\nexport const y = x;\n`;
}

function runBiome(target: string, cwd?: string): string {
  const result = spawnSync(process.execPath, [biome, ...args, target], {
    cwd,
    encoding: 'utf8',
  });
  const output = `${result.stdout}${result.stderr}`;
  expect(result.error, output).toBeUndefined();
  expect(result.signal, output).toBeNull();
  expect(output).toMatch(SUMMARY);
  return output;
}

function lintProbes(probes: Probe[]): { file: string; flagged: boolean }[] {
  const root = mkdtempSync(join(tmpdir(), 'bsh-imports-'));
  copyFileSync('biome.json', join(root, 'biome.json'));
  const files = [...probes, CANARY].map(
    ([dir, extension, specifier, form], index) => {
      const file = `${dir}/Probe${index}.${extension}`;
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), statement(specifier, form));
      return file;
    },
  );
  const output = runBiome('.', root);
  const results = files.map((file) => ({
    file,
    flagged: output.includes(`${file}:`),
  }));
  const canary = results.pop();
  expect(canary?.flagged, 'the canary probe was not flagged').toBe(true);
  return results;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('import boundaries (biome.json)', () => {
  it('hold across src/web', () => {
    const output = runBiome('src/web');
    expect(output).not.toMatch(/Found \d+ error/);
  }, 30_000);

  it('allow the listed imports', () => {
    const flagged = lintProbes(allowed).filter((probe) => probe.flagged);
    expect(flagged).toEqual([]);
  }, 30_000);

  it('forbid the listed imports', () => {
    const missed = lintProbes(forbidden).filter((probe) => !probe.flagged);
    expect(missed).toEqual([]);
  }, 30_000);

  it('never names Base UI outside src/web/ui, in any import form or mock', () => {
    const offenders = sourceFiles('src/web')
      .filter((file) => !file.startsWith(join('src/web', 'ui')))
      .filter((file) => !file.endsWith('importBoundaries.test.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes(BASE_UI));
    expect(offenders).toEqual([]);
  });

  it('uses one Base UI pattern in every override that forbids it', () => {
    const config = JSON.parse(readFileSync('biome.json', 'utf8'));
    const groups = (config.overrides as unknown[])
      .map((override) => JSON.stringify(override))
      .filter((text) => text.includes('Only src/web/ui imports Base UI'))
      .map((text) => text.match(/"group":\["@base-ui[^\]]*\]/)?.[0]);
    expect(groups.length).toBe(2);
    expect(new Set(groups).size).toBe(1);
  });

  it('keeps the primitives flat, because the ui rule forbids parent imports', () => {
    const folders = readdirSync('src/web/ui').filter((name) =>
      statSync(join('src/web/ui', name)).isDirectory(),
    );
    expect(folders).toEqual([]);
  });
});
