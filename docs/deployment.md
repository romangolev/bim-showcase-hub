# Deployment

The app deploys to Vercel as a static client plus one serverless function that runs the Express app.

## Vercel project

- Node version: `package.json` pins `engines.node` to `24.x`. Vercel uses it.
- Build: `vercel.json` sets `framework` to `null`, `buildCommand` to `npm run build` and `outputDirectory` to `dist/web`.
- Function: `api/index.ts` exports `createApp()` as the default export. Vercel serves it at `/api`.
- Rewrites, in order: `/api/(.*)` goes to `/api` (the function), everything else goes to `/index.html` so client routes such as `/model/<urn>` load.

`createApp` sets `trust proxy` in production, so the secure cookie works behind Vercel's proxy. In production the function does not serve the static client. Vercel serves `dist/web` and the function only receives `/api` requests.

## Environment variables

Set these for Production and for Preview.

| Variable | Required | Value |
|---|---|---|
| `SESSION_SECRET` | yes | A long random string, different per environment. Not `change-me` |
| `APS_CLIENT_ID` | yes | Client ID of the APS app |
| `APS_CLIENT_SECRET` | yes | Client secret of the APS app |
| `APS_CALLBACK_URL` | yes | `https://<host>/api/auth/callback` for that environment |

Ignored on Vercel: `MOCK_APS` (production ignores it), `VITE_MOCK_APS` (dev server only), `PORT` (Vercel assigns it) and `STATIC_DIR` (the function does not serve static files). `NODE_ENV` is `production` on Vercel builds and functions.

`APS_CALLBACK_URL` is read as a plain environment variable, so Preview needs its own value. A preview deployment URL changes per deployment unless you use a stable branch alias. Use that alias in `APS_CALLBACK_URL` and in the APS app.

Never put secret values in the repository, in these docs or in `vercel.json`.

## APS app setup

1. Sign in to https://aps.autodesk.com and create an application.
2. Choose the type **Traditional Web App**. The app uses the three-legged flow with a client secret.
3. Enable the APIs the app calls: **Data Management API** and **Model Derivative API** (for the viewer). The server requests the scopes `data:read` and `viewables:read`.
4. Add one callback URL per environment. Each must match `APS_CALLBACK_URL` for that environment exactly, including scheme, host, path and the absence of a trailing slash:
   - `https://<production-host>/api/auth/callback`
   - `https://<preview-alias>/api/auth/callback`
   - `http://localhost:3000/api/auth/callback` for local development
5. Copy the client ID and secret into the Vercel environment variables.

### ACC and BIM 360 Docs

To see hubs from Autodesk Construction Cloud or BIM 360 Docs, an account administrator must add your APS app as a custom integration in that account (Account Admin, Settings, Custom Integrations), using the client ID. Without it, the Data Management API returns no hubs for that account, even though sign-in succeeds. Personal and other hub types appear without this step.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Autodesk shows "Request error" after clicking sign-in | `APS_CLIENT_ID` is wrong, or the callback URL sent does not match one registered in the APS app | Compare `APS_CALLBACK_URL` with the registered callback character by character |
| `/api/...` returns 500 and the function log shows `SESSION_SECRET is required in production` or `APS_CLIENT_ID and APS_CLIENT_SECRET are required` | Missing environment variables for that environment | Add them for Production or Preview and redeploy. Variables apply only to new deployments |
| Sign-in returns to the app but shows the landing page again | Cookie not stored, or `SESSION_SECRET` changed between requests | Check that the site runs on HTTPS and that `SESSION_SECRET` is stable |
| Redirect lands on `/?auth_error=access_denied` | The user declined access at Autodesk | Sign in again |
| 400 "Invalid state" on the callback | The session cookie with the sign-in state was lost, for example by starting sign-in on another host | Start sign-in again from the same host that receives the callback |
| Signed in, but the tree shows no hubs | The ACC or BIM 360 account has not added the app as a custom integration | Follow the ACC and BIM 360 Docs step above |
| Model page says the model could not be loaded | The version is still translating, or the account has no access | Open another version, or retry later |
