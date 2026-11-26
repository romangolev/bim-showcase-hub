import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../shared/types.js';
import { loadConfig } from './config.js';
import { decodeId } from './ids.js';
import { createApp } from './index.js';
import { createMockDataService, MOCK_APP_CLIENT_ID } from './mock/index.js';

const app = createApp(loadConfig({ MOCK_APS: '1' }));

async function getNodes(url: string): Promise<TreeNode[]> {
  const res = await request(app).get(url);
  expect(res.status, url).toBe(200);
  return res.body as TreeNode[];
}

interface Walk {
  hubs: TreeNode[];
  projects: TreeNode[];
  folders: TreeNode[];
  items: TreeNode[];
  versions: TreeNode[];
  maxDepth: number;
  projectOf: Record<string, string>;
}

async function walk(): Promise<Walk> {
  const out: Walk = {
    hubs: [],
    projects: [],
    folders: [],
    items: [],
    versions: [],
    maxDepth: 0,
    projectOf: {},
  };
  async function visitFolder(
    projectId: string,
    folder: TreeNode,
    depth: number,
  ): Promise<void> {
    out.folders.push(folder);
    out.maxDepth = Math.max(out.maxDepth, depth);
    const contents = await getNodes(
      `/api/projects/${projectId}/folders/${folder.id}/contents`,
    );
    for (const node of contents) {
      expect(node.parentId).toBe(folder.id);
      if (node.kind === 'folder') {
        await visitFolder(projectId, node, depth + 1);
      } else {
        expect(node.kind).toBe('item');
        out.items.push(node);
        out.projectOf[node.id] = projectId;
        const versions = await getNodes(
          `/api/projects/${projectId}/items/${node.id}/versions`,
        );
        for (const version of versions) {
          expect(version.parentId).toBe(node.id);
        }
        out.versions.push(...versions);
      }
    }
  }
  out.hubs = await getNodes('/api/hubs');
  for (const hub of out.hubs) {
    const projects = await getNodes(`/api/hubs/${hub.id}/projects`);
    for (const project of projects) {
      expect(project.parentId).toBe(hub.id);
      out.projects.push(project);
      const tops = await getNodes(
        `/api/hubs/${hub.id}/projects/${project.id}/folders`,
      );
      for (const top of tops) {
        expect(top.parentId).toBe(project.id);
        await visitFolder(project.id, top, 1);
      }
    }
  }
  return out;
}

describe('mock mode', () => {
  it('returns no hubs when the empty-hubs switch is on', async () => {
    const empty = createApp(loadConfig({ MOCK_APS: '1' }), {
      auth: {} as never,
      data: createMockDataService(undefined, { emptyHubs: true }),
    });
    const res = await request(empty).get('/api/hubs');
    expect(res.body).toEqual([]);
  });

  it('serves a signed-in fake user without login', async () => {
    const res = await request(app).get('/api/session');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'mock-user',
      name: 'Alex Rivera',
      picture: null,
      appClientId: MOCK_APP_CLIENT_ID,
      appCallbackUrl: expect.any(String),
    });
  });

  it('serves a dummy viewer token', async () => {
    const res = await request(app).get('/api/viewer/token');
    expect(res.status).toBe(200);
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.body.expires_in).toBeGreaterThan(0);
  });

  it('accepts signout and the auth redirect without network', async () => {
    expect((await request(app).post('/api/auth/signout')).status).toBe(204);
    expect(
      (await request(app).get('/api/auth/callback')).headers.location,
    ).toBe('/');
    expect((await request(app).get('/api/auth/url')).body.url).toEqual(
      expect.any(String),
    );
  });

  it('exposes a deterministic tree large enough to need virtualization', async () => {
    const tree = await walk();
    expect(tree.hubs).toHaveLength(2);
    expect(tree.projects.length).toBeGreaterThanOrEqual(4);
    expect(tree.maxDepth).toBeGreaterThanOrEqual(3);
    expect(tree.items.length).toBeGreaterThanOrEqual(300);
    const all = [
      ...tree.hubs,
      ...tree.projects,
      ...tree.folders,
      ...tree.items,
      ...tree.versions,
    ];
    expect(new Set(all.map((n) => n.id)).size).toBe(all.length);
    expect(all.every((n) => /^[A-Za-z0-9_-]+$/.test(n.id))).toBe(true);

    const perItem = new Map<string, number>();
    for (const v of tree.versions) {
      perItem.set(
        v.parentId as string,
        (perItem.get(v.parentId as string) ?? 0) + 1,
      );
    }
    const counts = new Set(perItem.values());
    expect([...counts].every((c) => c >= 1 && c <= 4)).toBe(true);
    expect(counts.size).toBe(4);

    expect(tree.versions.some((v) => v.viewable)).toBe(true);
    expect(tree.versions.some((v) => !v.viewable)).toBe(true);
    expect(
      tree.versions.every((v) => v.viewable === (v.viewState === 'ready')),
    ).toBe(true);
    expect(new Set(tree.versions.map((v) => v.viewState))).toEqual(
      new Set([
        'ready',
        'no-geometry',
        'processing',
        'not-translated',
        'failed',
      ]),
    );
    for (const name of ['no-geometry', 'processing', 'not-translated']) {
      const item = tree.items.find((i) => i.name === `STATE-${name}.rvt`);
      expect(item, name).toBeDefined();
    }
    expect(tree.versions.every((v) => /^v\d: .+ by .+$/.test(v.name))).toBe(
      true,
    );

    const extensions = new Set(tree.items.map((i) => i.name.split('.').pop()));
    for (const ext of ['rvt', 'nwd', 'ifc', 'dwg', 'pdf']) {
      expect(extensions.has(ext)).toBe(true);
    }
  });

  it('marks exactly one latest version per item, the highest number', async () => {
    const tree = await walk();
    const byItem = new Map<string, TreeNode[]>();
    for (const version of tree.versions) {
      const list = byItem.get(version.parentId ?? '') ?? [];
      list.push(version);
      byItem.set(version.parentId ?? '', list);
    }
    for (const versions of byItem.values()) {
      const latest = versions.filter((version) => version.latest);
      expect(latest).toHaveLength(1);
      const top = Math.max(...versions.map((v) => v.versionNumber ?? -1));
      expect(latest[0]?.versionNumber).toBe(top);
    }
  });

  it('carries the tip version on every file row', async () => {
    const tree = await walk();
    for (const item of tree.items) {
      const versions = tree.versions.filter(
        (version) => version.parentId === item.id,
      );
      const latest = versions.reduce<TreeNode | undefined>(
        (top, version) =>
          (version.versionNumber ?? -1) > (top?.versionNumber ?? -1)
            ? version
            : top,
        undefined,
      );
      expect(item.versionNumber).toBe(latest?.versionNumber);
      expect(item.tipUrn).toBe(latest?.urn);
    }
  });

  it('lists the Cyrillic folder with two viewable drawings', async () => {
    const tree = await walk();
    const folder = tree.folders.find((f) => f.name === 'Рабочая документация');
    expect(folder).toBeTruthy();
    const items = tree.items.filter((item) => item.parentId === folder?.id);
    expect(new Set(items.map((item) => item.name))).toEqual(
      new Set([
        'Жилой комплекс — АР.rvt',
        'Многоквартирный дом, корпус 3, секция 2 — КЖ.rvt',
      ]),
    );
    for (const item of items) {
      const versions = tree.versions.filter((v) => v.parentId === item.id);
      expect(versions.length).toBeGreaterThan(0);
      expect(versions.every((v) => v.viewable)).toBe(true);
    }
  });

  it('reports the view state of a single version', async () => {
    const tree = await walk();
    const item = tree.items.find((i) => i.name === 'STATE-no-geometry.rvt');
    const version = tree.versions.find((v) => v.parentId === item?.id);
    expect(item && version).toBeTruthy();
    const projectId = tree.projectOf[item?.id ?? ''];
    const res = await request(app).get(
      `/api/projects/${projectId}/items/${item?.id}/versions/${version?.id}/view-state`,
    );
    expect(projectId).toBeTruthy();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ viewState: 'no-geometry', viewable: false });
    const missing = await request(app).get(
      `/api/projects/${projectId}/items/${item?.id}/versions/${item?.id}/view-state`,
    );
    expect(missing.status).toBe(404);
    const malformed = await request(app).get(
      `/api/projects/${projectId}/items/${item?.id}/versions/!!/view-state`,
    );
    expect(malformed.status).toBe(400);
  });

  it('serves an svg thumbnail for a translated version and 404 for others', async () => {
    const tree = await walk();
    const ready = tree.versions.find((v) => v.urn && v.viewState === 'ready');
    const res = await request(app).get(
      `/api/thumbnails/${ready?.urn}?size=200`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
    const blocked = tree.versions.find(
      (v) => v.urn && v.viewState === 'not-translated',
    );
    expect(
      (await request(app).get(`/api/thumbnails/${blocked?.urn}`)).status,
    ).toBe(404);
  });

  it('rejects a bad thumbnail urn or size with 400', async () => {
    expect((await request(app).get('/api/thumbnails/bad*id')).status).toBe(400);
    const plain = Buffer.from('not-a-urn').toString('base64url');
    expect((await request(app).get(`/api/thumbnails/${plain}`)).status).toBe(
      400,
    );
    const tree = await walk();
    const urn = tree.versions.find((v) => v.urn)?.urn;
    expect(
      (await request(app).get(`/api/thumbnails/${urn}?size=999`)).status,
    ).toBe(400);
  });

  it('is deterministic across app instances', async () => {
    const other = createApp(loadConfig({ MOCK_APS: '1' }));
    const a = await request(app).get('/api/hubs');
    const b = await request(other).get('/api/hubs');
    expect(a.body).toEqual(b.body);
  });

  it('returns 404 for unknown but well-formed ids', async () => {
    const ghost = Buffer.from('ghost').toString('base64url');
    const [hub] = await getNodes('/api/hubs');
    const [project] = await getNodes(`/api/hubs/${hub?.id}/projects`);
    const [folder] = await getNodes(
      `/api/hubs/${hub?.id}/projects/${project?.id}/folders`,
    );
    for (const url of [
      `/api/hubs/${ghost}/projects`,
      `/api/hubs/${hub?.id}/projects/${ghost}/folders`,
      `/api/projects/${project?.id}/folders/${ghost}/contents`,
      `/api/projects/${ghost}/folders/${folder?.id}/contents`,
      `/api/projects/${project?.id}/items/${ghost}/versions`,
    ]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.body.error).toEqual(expect.any(String));
    }
  });

  it('does not let a project read another hub or project', async () => {
    const hubs = await getNodes('/api/hubs');
    const [p1] = await getNodes(`/api/hubs/${hubs[0]?.id}/projects`);
    const res = await request(app).get(
      `/api/hubs/${hubs[1]?.id}/projects/${p1?.id}/folders`,
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed ids', async () => {
    for (const url of [
      '/api/hubs/not%20valid/projects',
      '/api/hubs/a/projects/b/folders',
      '/api/projects/!!/folders/@@/contents',
      '/api/projects/x/items/y%2Fz/versions',
    ]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(400);
    }
    expect(() => decodeId('a')).toThrow();
  });

  it('returns a json 404 for unknown api routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
