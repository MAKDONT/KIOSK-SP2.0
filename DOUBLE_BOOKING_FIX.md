# Double-Booking Prevention - Root Cause & Fix

## Problem Summary
Professors were able to accept multiple consultations at the same time slot. Example: Two students (Delima & Test Student) were both successfully booked with Minerva Zoleta at "Tuesday 05:20 AM - 05:35 AM".

## Root Cause
The queue table in Supabase was **missing two critical columns**:
- `queue_date` - Date of the consultation (YYYY-MM-DD format)
- `time_period` - Time slot text (e.g., "Tuesday 05:20 AM - 05:35 AM")

When the backend code tried to insert records with these fields, the inserts failed silently and fell back to incomplete data, making the double-booking check ineffective.

## Solution Implemented

### 1. Updated Database Schema
**File:** `supabase-schema.sql`
- Added `queue_date DATE DEFAULT CURRENT_DATE` column
- Added `time_period TEXT` column
- Added composite index on `(faculty_id, queue_date, time_period)` for performance

### 2. Database Migration Required
**File:** `add-queue-columns.sql` 
Must be executed in Supabase SQL Editor to add columns to existing queue table.

### 3. Updated Backend Logic
**File:** `server.ts` (line ~2509)
- Explicitly set `queue_date` to today's app date in `queueInsertBase`
- This ensures consistency between insertion and querying using the app's timezone

## How Double-Booking Prevention Now Works

1. **Faculty Book Request** (POST /api/queue/join)
   - Frontend sends: `{ time_period: "Tuesday 05:20 AM - 05:35 AM", faculty_id: "...", ... }`

2. **Backend Double-Booking Check** (line ~2424)
   ```
   Query existing consultations for this faculty on this queue_date
   with status in ["waiting", "serving", "ongoing"]
   ```

3. **Time Slot Comparison** (line ~2443)
   - Direct Match: Check time_period column for exact match
   - Fallback Parse: If direct match fails, parse time from `meet_link` string
   - Both methods include logging for debugging

4. **Block Duplicate** (line ~2447, 2453)
   - If time slot already exists: Return 400 error
   - Student sees: "This faculty member already has a consultation scheduled at [time]. Please select a different time slot or faculty member."

## Execution Steps

### Step 1: Apply Database Changes
1. Go to Supabase Dashboard → SQL Editor
2. Create new query and paste contents of `add-queue-columns.sql`
3. Run the query
4. Verify output shows both new columns added and index created

### Step 2: Restart Server
- Restart your backend server to load updated code that sets `queue_date` and `time_period`
- On Railway/Render: Deploy the changes (git push)
- Local testing: Restart Node.js process

### Step 3: Test Double-Booking Prevention
1. Open kiosk at two devices/tabs
2. Book same faculty (e.g., Delima takes Minerva Zoleta at 5:20-5:35)
3. Try to book same faculty at exact same time on second device
4. **Expected Result:** Second booking shows error "This faculty member already has a consultation scheduled..."
5. Second student can book different time or different faculty

## Frontend Impact
**File:** `src/components/KioskView.tsx`
- Already updated to gray out booked time slots
- `/api/queue/booked-slots` endpoint returns booked slots with format: `{ faculty_id, time_period }`
- Time slot filtering at line ~392 matches against booked slots

## Database Format Reference
### Queue Table Columns (Relevant to Double-Booking)
| Column | Type | Example Value | Purpose |
|--------|------|---|---|
| `queue_date` | DATE | 2024-01-16 | Date of consultation (app timezone) |
| `time_period` | TEXT | "Tuesday 05:20 AM - 05:35 AM" | Human-readable time slot |
| `meet_link` | TEXT | "Tuesday 05:20 AM - 05:35 AM\|https://meet.google.com/..." | Combination of time + Google Meet link |
| `faculty_id` | TEXT | "fac-123" | Which faculty member |
| `status` | TEXT | "waiting" | Consultation status |

## Logging for Debugging
The double-booking check includes console logs:
```
🔍 Checking double-booking: Faculty [id], Date: [date], Time: [time]
📊 Found [N] existing consultations for this faculty
✅ Direct time_period match! → BLOCKED
✅ Parsed time match from meet_link! → BLOCKED
```

Monitor server logs when testing to verify the check is working.

## What Changed in Code

### server.ts Changes
1. **Line ~2509:** Added `queue_date: today` to queueInsertBase
2. **Line ~2426:** Explicit double-booking check for this faculty+date+time combination
3. All logging and error messages already in place

### supabase-schema.sql Changes
1. Added `queue_date DATE DEFAULT CURRENT_DATE`
2. Added `time_period TEXT`

No frontend changes needed - already compatible with this structure.
