import {
  type FormDefinition,
  SettingsForm,
} from '../components/SettingsForm.js';
import type { TreeView } from '../components/tree/treeView.js';
import { usePersisted } from '../storage.js';
import { PANE_SETTINGS } from './paneSettings.js';

export const TREE_SETTINGS_FORM: FormDefinition<TreeView> = {
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
  ],
  reset: {
    label: 'Reset Documents settings',
    patch: { sort: 'name', modified: true, author: false, size: false },
  },
};

export function TreeSettingsForm() {
  const [view, setView] = usePersisted(PANE_SETTINGS.tree.view);
  return (
    <SettingsForm
      form={TREE_SETTINGS_FORM}
      value={view}
      onChange={(patch) => setView((current) => ({ ...current, ...patch }))}
    />
  );
}
