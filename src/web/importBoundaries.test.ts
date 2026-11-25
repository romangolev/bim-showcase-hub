import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const biome = resolve('node_modules/.bin/biome');
const args = [
  'lint',
  '--only=style/noRestrictedImports',
  '--max-diagnostics=none',
];

const allowed = [
  ['src/web/ui', 'tsx', 'react'],
  ['src/web/ui', 'tsx', '@base-ui/react/switch'],
  ['src/web/ui', 'tsx', 'clsx'],
  ['src/web/ui', 'tsx', 'tailwind-merge'],
  ['src/web/ui', 'tsx', './cn.js'],
  ['src/web/ui', 'test.tsx', 'vitest'],
  ['src/web/ui', 'test.tsx', '@testing-library/react'],
  ['src/web/panels', 'tsx', '../ui/Button.js'],
  ['src/web/panels', 'tsx', '../viewer/ViewerAdapter.js'],
  ['src/web/panels', 'tsx', '../viewer/createViewerAdapter.js'],
  ['src/web/panels', 'test.tsx', '../viewer/MockViewerAdapter.js'],
  ['src/web/viewer', 'ts', './RealViewerAdapter.js'],
  ['src/web/viewer', 'tsx', '../ui/Button.js'],
];

const forbidden = [
  ['src/web/ui', 'tsx', '../i18n/i18n.js'],
  ['src/web/ui', 'tsx', './../i18n/i18n.js'],
  ['src/web/ui', 'tsx', '../components/Menu.js'],
  ['src/web/ui', 'tsx', '../viewer/ViewerAdapter.js'],
  ['src/web/ui', 'tsx', '../settings/settings.js'],
  ['src/web/ui', 'tsx', '../storage.js'],
  ['src/web/ui', 'tsx', 'chart.js'],
  ['src/web/ui', 'tsx', 'vitest'],
  ['src/web/ui', 'test.tsx', '../test/render.js'],
  ['src/web/panels', 'tsx', '@base-ui/react'],
  ['src/web/panels', 'tsx', '@base-ui/react/switch'],
  ['src/web/viewer', 'tsx', '@base-ui/react/menu'],
  ['src/web/panels', 'tsx', '../viewer/RealViewerAdapter.js'],
  ['src/web/tools/paint', 'ts', '../../viewer/autodesk.js'],
  ['src/web/layout', 'ts', '../viewer/autodeskTools.js'],
  ['src/web/layout', 'test.ts', '../viewer/fakeFederatedViewer.js'],
];

function lintProbes(probes: string[][]): { file: string; flagged: boolean }[] {
  const root = mkdtempSync(join(tmpdir(), 'bsh-imports-'));
  copyFileSync('biome.json', join(root, 'biome.json'));
  const files = probes.map(([dir, extension, specifier], index) => {
    const file = `${dir}/Probe${index}.${extension}`;
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(
      join(root, file),
      `import { x } from '${specifier}';\nexport const y = x;\n`,
    );
    return file;
  });
  const result = spawnSync(biome, [...args, '.'], {
    cwd: root,
    encoding: 'utf8',
  });
  const output = `${result.stdout}${result.stderr}`;
  return files.map((file) => ({ file, flagged: output.includes(`${file}:`) }));
}

describe('import boundaries (biome.json)', () => {
  it('hold across src/web', () => {
    const result = spawnSync(biome, [...args, 'src/web'], {
      encoding: 'utf8',
    });
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  }, 30_000);

  it('allow the listed imports', () => {
    const flagged = lintProbes(allowed).filter((probe) => probe.flagged);
    expect(flagged).toEqual([]);
  }, 30_000);

  it('forbid the listed imports', () => {
    const missed = lintProbes(forbidden).filter((probe) => !probe.flagged);
    expect(missed).toEqual([]);
  }, 30_000);
});
