import type { HubType } from '../../shared/types.js';
import type { ViewState } from '../../shared/viewState.js';

export interface MockVersion {
  id: string;
  number: number;
  modifiedAt: string;
  user: string;
  viewState: ViewState;
  hasUrn: boolean;
}

export interface MockItem {
  id: string;
  folderId: string;
  projectId: string;
  name: string;
  versions: MockVersion[];
}

export interface MockFolder {
  id: string;
  projectId: string;
  parentId: string;
  name: string;
  folderIds: string[];
  itemIds: string[];
}

export interface MockProject {
  id: string;
  hubId: string;
  name: string;
  topFolderIds: string[];
}

export interface MockHub {
  id: string;
  name: string;
  hubType: HubType;
  projectIds: string[];
}

export interface MockData {
  hubs: Map<string, MockHub>;
  projects: Map<string, MockProject>;
  folders: Map<string, MockFolder>;
  items: Map<string, MockItem>;
}

const HUBS = [
  {
    id: 'hub-northwind',
    name: 'Northwind Architects',
    hubType: 'account' as HubType,
    projects: ['Riverside Tower', 'Civic Library Retrofit', 'Metro Depot'],
  },
  {
    id: 'hub-harborline',
    name: 'Harborline Construction',
    hubType: 'team' as HubType,
    projects: ['St. Mary Hospital Wing', 'Airport Terminal B'],
  },
];

const DISCIPLINES: {
  name: string;
  prefix: string;
  extensions: string[];
  descriptors: string[];
}[] = [
  {
    name: 'Architecture',
    prefix: 'ARC',
    extensions: ['rvt', 'dwg', 'pdf'],
    descriptors: [
      'Floor Plan',
      'Facade',
      'Core and Shell',
      'Interior Layout',
      'Roof Plan',
      'Sections',
    ],
  },
  {
    name: 'Structure',
    prefix: 'STR',
    extensions: ['rvt', 'ifc', 'dwg'],
    descriptors: [
      'Foundation',
      'Steel Frame',
      'Slab Reinforcement',
      'Column Grid',
      'Shear Walls',
      'Transfer Beams',
    ],
  },
  {
    name: 'MEP',
    prefix: 'MEP',
    extensions: ['rvt', 'nwd', 'pdf'],
    descriptors: [
      'HVAC Ducts',
      'Plumbing Risers',
      'Electrical Trays',
      'Fire Protection',
      'Chilled Water',
      'Lighting',
    ],
  },
];

const PHASES = ['Concept', 'Design Development', 'Construction Documents'];

const SHARED_FOLDERS = [
  { name: 'Coordination', extensions: ['nwd', 'ifc'], count: 9 },
  { name: 'Submittals', extensions: ['pdf', 'dwg'], count: 7 },
];

const USERS = [
  'Alex Rivera',
  'Priya Nair',
  'Tomas Ehrlich',
  'Mei Tanaka',
  'Sofia Duarte',
];

const VIEWABLE_EXTENSIONS = new Set(['rvt', 'nwd', 'ifc', 'dwg']);
const BASE_DATE = Date.UTC(2025, 0, 6, 9, 30);
const DAY_MS = 86_400_000;
const EXPORT_FOLDER_ITEMS = 150;

const STATE_FIXTURES: { name: string; viewState: ViewState }[] = [
  { name: 'STATE-ready.rvt', viewState: 'ready' },
  { name: 'STATE-no-geometry.rvt', viewState: 'no-geometry' },
  { name: 'STATE-processing.rvt', viewState: 'processing' },
  { name: 'STATE-not-translated.rvt', viewState: 'not-translated' },
  { name: 'STATE-failed.rvt', viewState: 'failed' },
];

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function buildMockData(): MockData {
  const data: MockData = {
    hubs: new Map(),
    projects: new Map(),
    folders: new Map(),
    items: new Map(),
  };
  let itemCounter = 0;

  function addVersions(item: MockItem, extension: string): void {
    const versionCount = 1 + (itemCounter % 4);
    for (let n = 1; n <= versionCount; n += 1) {
      const isLatest = n === versionCount;
      const unviewable =
        !VIEWABLE_EXTENSIONS.has(extension) ||
        (isLatest && itemCounter % 7 === 0) ||
        (n === 1 && itemCounter % 5 === 0 && versionCount > 1);
      item.versions.push({
        id: `${item.id}~v${n}`,
        number: n,
        modifiedAt: new Date(
          BASE_DATE + (itemCounter * 3 + n * 11) * DAY_MS,
        ).toISOString(),
        user: USERS[(itemCounter + n) % USERS.length] as string,
        viewState: unviewable ? 'not-translated' : 'ready',
        hasUrn: !unviewable,
      });
    }
  }

  function addItem(
    folder: MockFolder,
    prefix: string,
    descriptor: string,
    extension: string,
    index: number,
  ): void {
    itemCounter += 1;
    const item: MockItem = {
      id: `item-${pad(itemCounter, 5)}`,
      folderId: folder.id,
      projectId: folder.projectId,
      name: `${prefix}-${pad(index, 3)}_${descriptor.replace(/ /g, '-')}.${extension}`,
      versions: [],
    };
    addVersions(item, extension);
    data.items.set(item.id, item);
    folder.itemIds.push(item.id);
  }

  function addFolder(
    projectId: string,
    parentId: string,
    id: string,
    name: string,
  ): MockFolder {
    const folder: MockFolder = {
      id,
      projectId,
      parentId,
      name,
      folderIds: [],
      itemIds: [],
    };
    data.folders.set(id, folder);
    return folder;
  }

  HUBS.forEach((hubSource, hubIndex) => {
    const hub: MockHub = {
      id: hubSource.id,
      name: hubSource.name,
      hubType: hubSource.hubType,
      projectIds: [],
    };
    data.hubs.set(hub.id, hub);
    hubSource.projects.forEach((projectName, projectIndex) => {
      const projectId = `proj-${hubIndex + 1}-${projectIndex + 1}`;
      const project: MockProject = {
        id: projectId,
        hubId: hub.id,
        name: projectName,
        topFolderIds: [],
      };
      data.projects.set(projectId, project);
      hub.projectIds.push(projectId);

      const filesFolder = addFolder(
        projectId,
        projectId,
        `${projectId}-files`,
        'Project Files',
      );
      const sharedFolder = addFolder(
        projectId,
        projectId,
        `${projectId}-shared`,
        'Shared',
      );
      project.topFolderIds.push(filesFolder.id, sharedFolder.id);

      DISCIPLINES.forEach((discipline, disciplineIndex) => {
        const disciplineFolder = addFolder(
          projectId,
          filesFolder.id,
          `${filesFolder.id}-d${disciplineIndex}`,
          discipline.name,
        );
        filesFolder.folderIds.push(disciplineFolder.id);
        for (let i = 1; i <= 4; i += 1) {
          addItem(
            disciplineFolder,
            discipline.prefix,
            discipline.descriptors[(i + projectIndex) % 6] as string,
            discipline.extensions[i % discipline.extensions.length] as string,
            i,
          );
        }
        PHASES.forEach((phase, phaseIndex) => {
          const phaseFolder = addFolder(
            projectId,
            disciplineFolder.id,
            `${disciplineFolder.id}-p${phaseIndex}`,
            phase,
          );
          disciplineFolder.folderIds.push(phaseFolder.id);
          const count = 6 + ((projectIndex + disciplineIndex + phaseIndex) % 5);
          for (let i = 1; i <= count; i += 1) {
            addItem(
              phaseFolder,
              `${discipline.prefix}${phaseIndex + 1}`,
              discipline.descriptors[(i + phaseIndex) % 6] as string,
              discipline.extensions[
                (i + disciplineIndex) % discipline.extensions.length
              ] as string,
              i,
            );
          }
        });
      });

      SHARED_FOLDERS.forEach((spec, specIndex) => {
        const folder = addFolder(
          projectId,
          sharedFolder.id,
          `${sharedFolder.id}-s${specIndex}`,
          spec.name,
        );
        sharedFolder.folderIds.push(folder.id);
        for (let i = 1; i <= spec.count; i += 1) {
          addItem(
            folder,
            spec.name === 'Coordination' ? 'COORD' : 'SUB',
            DISCIPLINES[i % 3]?.descriptors[i % 6] as string,
            spec.extensions[i % spec.extensions.length] as string,
            i,
          );
        }
      });

      if (hubIndex === 0 && projectIndex === 0) {
        const statesFolder = addFolder(
          projectId,
          filesFolder.id,
          `${filesFolder.id}-states`,
          'View States',
        );
        filesFolder.folderIds.push(statesFolder.id);
        STATE_FIXTURES.forEach((fixture, index) => {
          const item: MockItem = {
            id: `state-${pad(index + 1, 3)}`,
            folderId: statesFolder.id,
            projectId,
            name: fixture.name,
            versions: [
              {
                id: `state-${pad(index + 1, 3)}~v1`,
                number: 1,
                modifiedAt: new Date(BASE_DATE).toISOString(),
                user: USERS[0] as string,
                viewState: fixture.viewState,
                hasUrn: true,
              },
            ],
          };
          data.items.set(item.id, item);
          statesFolder.itemIds.push(item.id);
        });

        const exportsFolder = addFolder(
          projectId,
          sharedFolder.id,
          `${sharedFolder.id}-exports`,
          'Model Exports',
        );
        sharedFolder.folderIds.push(exportsFolder.id);
        for (let i = 1; i <= EXPORT_FOLDER_ITEMS; i += 1) {
          addItem(
            exportsFolder,
            'EXP',
            `Level ${pad(i, 2)} Export`,
            i % 3 === 0 ? 'ifc' : 'nwd',
            i,
          );
        }
      }
    });
  });

  return data;
}
