# Timezone Configuration Guide

## Overview
This application uses **PHT (Asia/Manila, UTC+8)** as the official timezone, regardless of where the application is deployed (local, Render, or other cloud platforms).

## Why This Matters
- **Consistency**: All timestamps stored in the database are in PHT
- **Cross-deployment**: Works correctly whether deployed locally or on Render
- **Student/Faculty Experience**: Times always display in Philippine timezone

## Configuration

### Backend Setup
**File**: `server.ts` (line 111)
```typescript
const APP_TIMEZONE = unwrapEnvValue(process.env.APP_TIMEZONE) || "Asia/Manila";
```

**Environment Variable** (`.env.local`):
```
APP_TIMEZONE="Asia/Manila"
```

The backend uses `Intl.DateTimeFormat` with the PHT timezone for all date operations:
- Scheduling appointments
- Logging timestamps
- Database date storage
- Queue management

### Frontend Setup
**File**: `src/utils/timezoneUtils.ts`

Available functions for frontend date formatting:
- `formatInPHT()` - Custom format in PHT
- `formatTime12HourPHT()` - Time like "2:30 PM"
- `formatTime24HourPHT()` - Time like "14:30"
- `formatDateShortPHT()` - Date like "12/25/2026"
- `formatDateLongPHT()` - Date like "December 25, 2026"
- `getDayNamePHT()` - Day name like "Monday"
- `getTodayStringPHT()` - Today in "YYYY-MM-DD"
- `isSameDayPHT()` - Check if two dates are same day

### Usage Examples

#### Backend (TypeScript):
```typescript
// Get formatted time in PHT
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const timeInPHT = formatter.format(new Date());
```

#### Frontend (React/TypeScript):
```typescript
import {
  formatTime12HourPHT,
  getTodayStringPHT,
  getDayNamePHT,
} from "@/utils/timezoneUtils";

// In component
const currentTime = formatTime12HourPHT();
const todayDate = getTodayStringPHT();
const dayName = getDayNamePHT();
```

## Render Deployment

### Environment Variables
When deploying to Render, ensure the following environment variable is set:

**Settings → Environment**:
```
APP_TIMEZONE=Asia/Manila
```

### Render's Default Behavior
Render's servers may be in a different timezone. This configuration **overrides** the server's default timezone and forces all operations to use PHT.

## Key Implementation Points

### 1. **Weekly Schedule Generation** (`server.ts` line 3115)
- Uses local-time date calculation instead of UTC
- Ensures appointment slots are generated correctly in PHT

### 2. **Availability Time Comparison** (`server.ts` line 5601)
- All time comparisons use APP_TIMEZONE
- Past/current/future determinations are PHT-based

### 3. **Database Timestamps**
- Stored as ISO strings (UTC internally)
- Always interpreted/displayed as PHT on read

## Testing Timezone Configuration

### Backend Test
```bash
curl http://localhost:3000/api/faculty/[id]/weekly-schedule
# Verify dates in response are correct for PHT
```

### Frontend Test
```typescript
import { getTodayStringPHT, formatTime12HourPHT } from "@/utils/timezoneUtils";

console.log(getTodayStringPHT()); // Should show today in PHT
console.log(formatTime12HourPHT()); // Should show current time in PHT
```

## Troubleshooting

### Issue: Times showing in wrong timezone
**Solution**: Ensure `APP_TIMEZONE="Asia/Manila"` is in `.env.local`

### Issue: Weekly schedule shows past dates
**Solution**: Check that backend is using local-time date calculations (not UTC)

### Issue: After Render deployment, times are wrong
**Solution**: 
1. Add `APP_TIMEZONE=Asia/Manila` to Render environment variables
2. Restart the service
3. Clear browser cache

## Related Files
- **Backend**: `server.ts` (APP_TIMEZONE constant, Intl.DateTimeFormat usage)
- **Frontend**: `src/utils/timezoneUtils.ts` (date formatting utilities)
- **Configuration**: `.env.local` (APP_TIMEZONE environment variable)
- **Components Using Timezone**:
  - `WeeklySchedule.tsx` - Displays appointment times
  - `KioskView.tsx` - Shows schedule slots
  - `FacultyDashboard.tsx` - Shows availability times
  - `StudentTracking.tsx` - Shows appointment times

## References
- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [Asia/Manila Timezone Info](https://www.timeanddate.com/time/zone/asia/manila)
- [Intl.DateTimeFormat API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
