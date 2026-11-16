import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../errors.js';
import { createApsDataService } from './apsDataService.js';

function fakeClient() {
  return {
    getHubs: vi.fn().mockResolvedValue({
      data: [{ id: 'b.1', attributes: { name: 'Hub' } }],
    }),
    getHubProjects: vi.fn().mockResolvedValue({
      data: [{ id: 'b.p', attributes: { name: 'Proj' } }],
    }),
    getProjectTopFolders: vi.fn().mockResolvedValue({
      data: [{ id: 'f1', attributes: { displayName: 'Files' } }],
    }),
    getFolderContents: vi.fn().mockResolvedValue({
      data: [{ type: 'items', id: 'i1', attributes: { name: 'a.rvt' } }],
    }),
    getItemVersions: vi.fn().mockResolvedValue({
      data: [{ id: 'v?version=1', attributes: { versionNumber: 1 } }],
    }),
    getVersion: vi.fn().mockResolvedValue({ data: undefined }),
  };
}

describe('createApsDataService', () => {
  it('passes the access token and raw ids to the SDK', async () => {
    const client = fakeClient();
    const service = createApsDataService(client as never);
    await service.listHubs('tok');
    await service.listProjects('tok', 'b.1');
    await service.listTopFolders('tok', 'b.1', 'b.p');
    await service.listFolderContents('tok', 'b.p', 'f1');
    const versions = await service.listItemVersions('tok', 'b.p', 'i1');
    expect(client.getHubs).toHaveBeenCalledWith({ accessToken: 'tok' });
    expect(client.getHubProjects).toHaveBeenCalledWith('b.1', {
      accessToken: 'tok',
    });
    expect(client.getProjectTopFolders).toHaveBeenCalledWith('b.1', 'b.p', {
      accessToken: 'tok',
    });
    expect(client.getFolderContents).toHaveBeenCalledWith('b.p', 'f1', {
      accessToken: 'tok',
    });
    expect(client.getItemVersions).toHaveBeenCalledWith('b.p', 'i1', {
      accessToken: 'tok',
    });
    expect(versions[0]?.kind).toBe('version');
  });

  it('checks one version on demand without listing the item', async () => {
    const client = fakeClient();
    const versions: Record<string, unknown> = {
      'v?version=2': {
        id: 'v?version=2',
        relationships: {
          derivatives: { data: { id: 'urnA' } },
          item: { data: { id: 'i1' } },
        },
      },
      'v?version=1': { id: 'v?version=1' },
    };
    client.getVersion.mockImplementation(async (_p: string, id: string) => ({
      data: versions[id],
    }));
    const check = vi.fn().mockResolvedValue('no-geometry');
    const service = createApsDataService(client as never, {
      check,
      clear: () => undefined,
    });
    await expect(
      service.versionViewState('tok', 'b.p', 'i1', 'v?version=2'),
    ).resolves.toEqual({ viewState: 'no-geometry', viewable: false });
    expect(client.getVersion).toHaveBeenCalledWith('b.p', 'v?version=2', {
      accessToken: 'tok',
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith('tok', 'urnA');
    await expect(
      service.versionViewState('tok', 'b.p', 'i1', 'v?version=1'),
    ).resolves.toEqual({ viewState: 'not-translated', viewable: false });
    await expect(
      service.versionViewState('tok', 'b.p', 'i1', 'v?version=9'),
    ).rejects.toMatchObject({ status: 404 });
    expect(client.getItemVersions).not.toHaveBeenCalled();
    expect(client.getVersion).toHaveBeenCalledTimes(3);
  });

  it('answers 404 for a version that belongs to another item', async () => {
    const client = fakeClient();
    client.getVersion.mockResolvedValue({
      data: {
        id: 'v?version=3',
        relationships: {
          derivatives: { data: { id: 'urnB' } },
          item: { data: { id: 'other-item' } },
        },
      },
    });
    const check = vi.fn().mockResolvedValue('ready');
    const service = createApsDataService(client as never, {
      check,
      clear: () => undefined,
    });
    await expect(
      service.versionViewState('tok', 'b.p', 'i1', 'v?version=3'),
    ).rejects.toMatchObject({ status: 404 });
    expect(check).not.toHaveBeenCalled();
  });

  it('attaches the checked view state to each version with a derivative', async () => {
    const client = fakeClient();
    client.getItemVersions.mockResolvedValue({
      data: [
        {
          id: 'v?version=2',
          relationships: { derivatives: { data: { id: 'urnA' } } },
        },
        { id: 'v?version=1' },
      ],
    });
    const check = vi.fn().mockResolvedValue('no-geometry');
    const service = createApsDataService(client as never, {
      check,
      clear: () => undefined,
    });
    const versions = await service.listItemVersions('tok', 'b.p', 'i1');
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith('tok', 'urnA');
    expect(versions.map((v) => [v.viewState, v.viewable])).toEqual([
      ['no-geometry', false],
      ['not-translated', false],
    ]);
  });

  it('does not check manifests when listing folders or hubs', async () => {
    const client = fakeClient();
    const check = vi.fn();
    const service = createApsDataService(client as never, {
      check,
      clear: () => undefined,
    });
    await service.listHubs('tok');
    await service.listFolderContents('tok', 'b.p', 'f1');
    expect(check).not.toHaveBeenCalled();
  });

  it('tolerates responses without data', async () => {
    const client = fakeClient();
    client.getHubs.mockResolvedValue({});
    const service = createApsDataService(client as never);
    await expect(service.listHubs('tok')).resolves.toEqual([]);
  });

  it('maps upstream failures to safe http errors', async () => {
    const client = fakeClient();
    const upstream = (status: number) =>
      Object.assign(new Error('secret-token-detail'), {
        httpStatusCode: () => status,
      });
    const service = createApsDataService(client as never);

    client.getHubs.mockRejectedValueOnce(upstream(404));
    await expect(service.listHubs('t')).rejects.toMatchObject({ status: 404 });

    client.getHubs.mockRejectedValueOnce(upstream(403));
    await expect(service.listHubs('t')).rejects.toMatchObject({ status: 401 });

    client.getHubs.mockRejectedValueOnce(upstream(500));
    const err = await service.listHubs('t').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(502);
    expect((err as HttpError).message).not.toContain('secret');
  });
});
