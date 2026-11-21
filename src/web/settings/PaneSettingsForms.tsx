import {
  type FormDefinition,
  SettingsForm,
} from '../components/SettingsForm.js';
import type { TreeView } from '../components/tree/treeView.js';
import { usePersisted } from '../storage.js';
import { PANE_SETTINGS } from './paneSettings.js';

const TREE_SETTINGS_FORM: FormDefinition<TreeView> = {
  title: 'Documents',
  intro: 'How folders and versions are listed in the tree.',
  fields: [
    {
      key: 'sort',
      kind: 'select',
      label: 'Sort by',
      options: [
        { value: 'name', label: 'Name' },
        { value: 'modified', label: 'Last modified' },
      ],
    },
    {
      key: 'modified',
      kind: 'toggle',
      label: 'Show modified date',
    },
    {
      key: 'author',
      kind: 'toggle',
      label: 'Show author',
    },
    {
      key: 'size',
      kind: 'toggle',
      label: 'Show size',
    },
    {
      key: 'openMode',
      kind: 'select',
      label: 'Open models in',
      hint: 'What a single click on a version does. Picking several versions and using Open in viewer always opens separate tabs.',
      options: [
        { value: 'tab', label: 'A new tab' },
        { value: 'replace', label: 'The active tab' },
        { value: 'combined', label: 'The open viewer, combined' },
      ],
    },
    {
      key: 'itemOpen',
      kind: 'select',
      label: 'Clicking a file',
      hint: 'Opening a file uses the open mode above.',
      options: [
        { value: 'expand', label: 'Shows its versions' },
        { value: 'latest', label: 'Opens the latest version' },
        { value: 'last', label: 'Opens the version you opened last' },
      ],
    },
    {
      key: 'thumbnails',
      kind: 'toggle',
      label: 'Show thumbnails',
      hint: 'Loads a small image per file from Autodesk. Off by default.',
    },
    {
      key: 'rows',
      kind: 'select',
      label: 'Rows',
      hint: 'Thumbnail rows show a small image and need Show thumbnails.',
      options: [
        { value: 'list', label: 'List' },
        { value: 'thumbnails', label: 'Thumbnails' },
      ],
    },
  ],
  reset: {
    label: 'Reset Documents settings',
    patch: {
      sort: 'name',
      modified: true,
      author: false,
      size: false,
      openMode: 'tab',
      itemOpen: 'expand',
      thumbnails: false,
      rows: 'list',
    },
  },
};

const TREE_SHORTCUTS: readonly [string, string][] = [
  ['Ctrl or Cmd click, Shift click', 'Select versions'],
  ['Space', 'Select the version'],
  ['Enter', 'Open the focused version'],
  ['Arrow keys', 'Move, expand and collapse'],
  ['/', 'Focus the filter'],
  ['Type a name', 'Jump to the next matching row'],
  ['Shift+F10', 'Open the row menu'],
];

export function TreeSettingsForm() {
  const [view, setView] = usePersisted(PANE_SETTINGS.tree.view);
  return (
    <>
      <SettingsForm
        form={TREE_SETTINGS_FORM}
        value={view}
        onChange={(patch) => setView((current) => ({ ...current, ...patch }))}
      />
      <section className="settings__section" aria-label="Keyboard shortcuts">
        <h3 className="settings__heading">Keyboard shortcuts</h3>
        <ul>
          {TREE_SHORTCUTS.map(([keys, action]) => (
            <li key={keys}>
              <span className="settings__hint">{keys}</span> {action}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
