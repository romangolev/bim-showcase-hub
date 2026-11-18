# Command registry and command palette

Issue #9.

## Intent

One keyboard entry point (Ctrl/Cmd+K) for everything the app can do: open and close panes, toggle the theme, open any settings window, run an export, select, isolate, hide or show elements, present, sign out. The set of commands must grow without editing the palette.

## Goals

- A `CommandRegistry` that any part of the app contributes to: the shell, the layout, each `ViewerTool`, each viewer.
- A palette dialog with fuzzy filter, keyboard navigation, dialog semantics, `aria-activedescendant`, Escape to close, focus return, disabled entries that say why, and recent commands.
- Tools contribute commands by overriding one method on `ViewerTool`; nothing in the palette or in app settings changes when a tool is added.
- Recents are the only persisted state, through `readJson` and `writeJson`, under a personal key that sign-out clears.

## Non-goals

- Pinned commands, user-rebindable shortcuts, workspaces, jump to a recent model.
- Moving the Panes menu, context menus and shortcuts onto the registry. They keep their own entry lists for now; they can read the registry later.
- Per-pane-kind `commands()` on `paneRegistry` (pane families are being reworked elsewhere). Pane commands are derived from `PANES` fields that already exist.

## Approaches considered

1. Static command table in the palette. Simple, but every tool or pane edits the palette. Rejected.
2. Registry fed by React context providers per feature. Needs a provider tree and re-renders on every state change. Rejected.
3. A module-level registry of lazy providers. A source registers `() => Command[]` under a name and an optional priority; the palette evaluates all providers when it opens, so titles, checked state and disabled reasons are always current without subscriptions. Chosen. Tools already live in a module-level `TOOLS` registry, so this matches the codebase.

Source priority resolves id clashes: the shell registers disabled placeholders ("Open a model first") for viewer-bound commands, and the active viewer registers the live ones with a higher priority under the same ids.

## API sketch

```ts
interface Command {
  id: string;
  title: string;
  group: string;
  keywords?: string;
  icon?: IconName;
  disabled?: string;
  run: (host: CommandHost) => void | Promise<void>;
}
interface CommandHost { openModal: (id: string) => void }

COMMANDS.register(source, () => Command[], priority = 0): () => void
COMMANDS.list(): Command[]

ViewerTool.commands(ctx: ToolContext | null, settings: S): Command[]
```

- `ViewerTool.commands` defaults to the tool's settings window plus one command per toolbar export (a disabled placeholder when `ctx` is null or the tool is off). `ToolRegistry.commands(ctx, snapshot)` concatenates them.
- `useViewerTools` registers the active viewer's tool and adapter commands (select all, isolate, hide, show all, clear selection, fit) while its adapter is the active one.
- `AppCommands` (inside the providers) registers theme, settings windows and sign-out. `LayoutCommands` (inside `LayoutProvider`) registers pane, lock, reset and present commands from `useLayout()` and `PANES`.
- `CommandPalette` mounts once in `App`, owns the hotkey, and runs a command with `host.openModal`. Running a command records it in recents (`bsh.commands.recent.v1`, last 5).
