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
