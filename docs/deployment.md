# Deployment

The app deploys to Vercel as a static client plus one serverless function that runs the Express app.

## Vercel project

- Node: `package.json` pins `engines.node` to `24.x`.
- Build: `vercel.json` runs `npm run build` and serves `dist/web`.
- Function: `api/index.ts` exports the app and serves `/api`.
- Rewrites: `/api/(.*)` goes to the function, everything else to `/index.html` so client routes load.
- `createApp` sets `trust proxy` in production so the secure cookie works behind Vercel.
- Every `/api` call is one function invocation. A deep search is a crawl of one project and costs one invocation per folder, bounded at 400 folders (also 10,000 nodes and 90 seconds).

## Environment variables

Set these for Production and for Preview.

| Variable | Value |
|---|---|
| `SESSION_SECRET` | A long random string, different per environment. Not `change-me`. Changing it signs every user out |
| `APS_CLIENT_ID` | Client ID of the APS app |
| `APS_CLIENT_SECRET` | Client secret of the APS app |
| `APS_CALLBACK_URL` | `https://<host>/api/auth/callback` for that environment |

Vercel ignores `MOCK_APS`, `VITE_MOCK_APS`, `PORT` and `STATIC_DIR`. Never put secrets in the repository, the docs or `vercel.json`.

A preview URL changes per deployment. Set the Preview `APS_CALLBACK_URL` to the stable branch alias URL, register that URL in the APS app, and open previews through the alias.

Sessions are sealed cookies, so the function needs no database. See [architecture.md](architecture.md#sessions).

## Installable metadata

`public/manifest.webmanifest` and the icons next to it (`icon-192.png`, `icon-512.png`, `icon-maskable.svg`) are static files that `vite build` copies to `dist/web`. `index.html` links the manifest and sets a `theme-color` meta that the pre-paint script and `applyTheme` keep in step with the chosen theme. There is deliberately no service worker: the app is not offline-capable and nothing is cached for offline use.

## APS app setup

1. Sign in at https://aps.autodesk.com and create an application.
2. Choose **Traditional Web App**. The app uses the three-legged flow with a client secret.
3. Enable Data Management and Model Derivative. The server needs `data:read` and the viewer needs `viewables:read`.
4. Add one callback URL per environment. Each must match that environment's `APS_CALLBACK_URL` exactly, with no trailing slash:
   - `https://<production-host>/api/auth/callback`
   - `https://<preview-alias>/api/auth/callback`
   - `http://localhost:3000/api/auth/callback`
5. Copy the client ID and secret into the Vercel environment variables.

### ACC and BIM 360 Docs

An account administrator must add the app's Client ID as a custom integration in the account administration of Autodesk Docs or ACC. Without it, sign-in works but the account shows no hubs: the hubs route answers 403 with the code `app_not_provisioned`, and the no-hubs checklist shows the Client ID and the callback URL (`session.appCallbackUrl`) to copy into the integration. Personal hubs need no setup.

## CSP reports

The Content-Security-Policy is report-only with `report-uri /api/csp-report`. The route (`src/server/routes/csp.ts`) needs no sign-in, accepts bodies up to 8 KB and always answers 204.

Each valid report becomes one log line: `csp-report directive=<directive> blocked=<origin or keyword> path=</first-segment>`. Full URLs and cookies are never logged. Each instance logs at most 30 lines per minute. Search the function log for `csp-report` before enforcing the policy.

Thumbnails need no CSP change: they are same-origin `img` requests under `/api/thumbnails`, which `img-src 'self'` already allows, and `script-src` and `connect-src` are unchanged.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Autodesk shows "Request error" on sign-in | Wrong `APS_CLIENT_ID`, or the callback URL is not registered | Compare `APS_CALLBACK_URL` with the registered callback character by character |
| `/api/...` returns 500 and the log says `SESSION_SECRET is required in production` or `APS_CLIENT_ID and APS_CLIENT_SECRET are required` | Missing variables | Add them for that environment and redeploy |
| Back on the landing page after sign-in | Cookie not stored, or `SESSION_SECRET` changed | Use HTTPS and keep `SESSION_SECRET` stable |
| `/?auth_error=access_denied` | The user declined access | Sign in again |
| `/?auth_error=invalid_state` | The sign-in cookie was lost, for example sign-in started on another host | Start again from the host that receives the callback |
| `/?auth_error=upstream_error` | Code exchange or user lookup failed, or the session did not fit in the cookie | Try again. The log has a `sign-in failed` line |
| The app says the session has ended | The 12 hour window ran out or the 7 day cap was reached | Use Sign in again in the banner |
| Signed in but no hubs | The account has not added the app as a custom integration (the hubs route answers 403 `app_not_provisioned`) | See ACC and BIM 360 Docs above, and copy the Client ID and callback URL from the checklist |
| A model says it could not be loaded | The version is still translating, or the account has no access | Open another version, or retry later |
