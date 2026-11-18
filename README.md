# BIM Showcase Hub

A browser workspace for Autodesk Platform Services (APS) models. Sign in with Autodesk, browse your hubs, open models in the Autodesk Viewer and read their properties as tables and charts.

![Model page](docs/images/model.png)

The screenshot uses built-in mock data, not a real account.

## Features

- Autodesk sign-in. Tokens stay on the server.
- Document tree for hubs, projects, folders and versions, with filter, Pinned and Recent.
- Dockable workspace: move, resize, tab, float and collapse panes. The layout is saved per browser.
- Several models at once in viewer tabs, or combined into one scene (up to six).
- Model summary and dashboard charts from element properties.
- Viewer tools: paint, and export to Excel, CSV, JSON, GLB or IFC.
- Command palette (Ctrl or Cmd+K), Task Center, dark and light themes.
- Mock mode: run everything without Autodesk credentials.

## Quick start

Requires Node 24.

```bash
npm install
npm run dev:mock
```

Open http://localhost:5173. Mock mode signs you in as a fake user and serves fixture data.

For real data, create an APS app, copy `.env.example` to `.env`, fill it in and run `npm run dev`. See [development](docs/development.md#environment-variables) and [deployment](docs/deployment.md#aps-app-setup).

## Scripts

| Script                    | What it does                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`             | Express server and Vite (port 5173)                                                  |
| `npm run dev:mock`        | Same, with mock data and a mock viewer                                               |
| `npm run build`           | Type-check, build the web app and the server                                         |
| `npm start`               | Run the compiled server                                                              |
| `npm test`                | Vitest                                                                               |
| `npm run lint` / `format` | Biome check / fix                                                                    |
| `npm run typecheck`       | TypeScript for server and web                                                        |
| `npm run e2e:*`           | Camoufox end-to-end scripts, see [development](docs/development.md#end-to-end-tests) |

## Project layout

```
api/          Vercel function entry
docs/         Guides and screenshots
e2e/          Camoufox end-to-end scripts (Python)
src/server/   Express app: config, auth, data, routes, mock data
src/shared/   Types shared by server and web
src/web/      React app
DESIGN.md     Design tokens and rules
```

## Guides

- [Architecture](docs/architecture.md): server, sessions, client modules, viewer adapter
- [Development](docs/development.md): setup, environment, tests, end-to-end scripts
- [Deployment](docs/deployment.md): Vercel and APS app setup
- [Layout](docs/layout.md): the dock, panes and persistence
- [Extensions](docs/extensions.md): add a tool, pane, command or setting
- [Design system](docs/design-system.md): tokens, themes, viewer styling
- [UX roadmap](docs/ux-roadmap.md): planned work

## License

MIT. See [LICENSE](LICENSE).
