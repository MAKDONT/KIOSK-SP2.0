# Render Deployment Guide

## 1. Push your repository
Make sure the latest code is pushed to GitHub.

## 2. Create the Render service
1. Open Render dashboard.
2. Click `New` -> `Blueprint`.
3. Select this repository.
4. Render will detect `render.yaml` and create:
   - one web service (`eq-app`)
   - one persistent disk mounted at `/var/data`

## 3. Set environment variables
In Render service settings, set these required values:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`

For Google Drive, choose one mode:

### A. Service Account mode (recommended for server-only uploads)
- `GOOGLE_SERVICE_ACCOUNT_JSON` (single-line JSON or base64 JSON)
- `GOOGLE_DRIVE_FOLDER_ID` (folder shared with service account)

### B. OAuth mode (admin connect flow)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=https://<your-render-domain>/api/auth/google/callback`
- `APP_BASE_URL=https://<your-render-domain>`

## 4. OAuth callback (only if using OAuth mode)
In Google Cloud Console -> OAuth Client -> Authorized redirect URIs, add:
`https://<your-render-domain>/api/auth/google/callback`

## 5. Deploy and verify
After deploy finishes:
1. Open `https://<your-render-domain>/api/health` -> should return `{ "ok": true, ... }`
2. Open app homepage and confirm UI loads on refresh (SPA fallback enabled).
3. Test Drive status via `https://<your-render-domain>/api/drive/status`.

## Notes
- `APP_DATA_DIR=/var/data` is used for persistent `uploads/` and `drive-tokens.json`.
- On each deploy, Render keeps `/var/data` but rebuilds the app filesystem.
