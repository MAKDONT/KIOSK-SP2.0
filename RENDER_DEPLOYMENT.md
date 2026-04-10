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
- `APP_TIMEZONE=Asia/Manila` ⚠️ **IMPORTANT** - Required for correct time display (Philippine Time UTC+8)

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

## Timezone Configuration (Asia/Manila, UTC+8)

### Why This is Important
Render servers run in UTC timezone. This app needs to display Philippine Time (UTC+8) consistently:
- Faculty availability schedules
- Appointment booking times
- Queue consultation times
- Web app clock display

### Configuration
1. **In Render Dashboard**, add environment variable:
   ```
   APP_TIMEZONE=Asia/Manila
   ```

2. **Verify it's working**:
   - Visit the app and check the clock in the top-right (should show PHT time)
   - Book a consultation and verify the time slot matches PHT
   - Check faculty schedule dates are correct (should show current week Mon-Fri in PHT)

### How It Works
- **Backend** (`server.ts`): Uses `Intl.DateTimeFormat` with `timeZone: "Asia/Manila"` for all date operations
- **Frontend** (`src/utils/timezoneUtils.ts`): Provides timezone-aware formatting functions:
  - `formatTime12HourPHT()` - Time display (e.g., "2:30 PM")
  - `getTodayStringPHT()` - Current date
  - `getDayNamePHT()` - Day of week
  - `formatDateLongPHT()` - Long date format

### Troubleshooting

**Issue**: Clock shows wrong time (not PHT)
- ✅ Verify `APP_TIMEZONE=Asia/Manila` is set in Render
- ✅ Restart the service (Deploy trigger in Render)
- ✅ Clear browser cache (Ctrl+Shift+Del)

**Issue**: Faculty schedule shows past dates or wrong day
- ✅ Check backend logs for "timezone" mentions
- ✅ Ensure `APP_TIMEZONE` is set before deployment
- ✅ Test API endpoint: `GET /api/faculty/[id]/weekly-schedule`

**Issue**: Appointment times don't match availability
- ✅ Confirm both backend and frontend use PHT (frontend now uses `formatTime12HourPHT()`)
- ✅ This should now be automatically correct after this fix

### Testing
After deployment, verify these endpoints return correct PHT times:
```bash
# Check if health endpoint works
curl https://your-app.onrender.com/api/health

# Check weekly schedule (substitute faculty ID)
curl https://your-app.onrender.com/api/faculty/123/weekly-schedule

# Verify times are in Philippine timezone
```

### Reference
See [TIMEZONE_GUIDE.md](./TIMEZONE_GUIDE.md) for complete timezone documentation.

