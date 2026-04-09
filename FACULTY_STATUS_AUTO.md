# Automatic Faculty Status Feature

## Overview
Faculty status is now **automatically calculated** based on their available time slots. This eliminates the need for manual status toggling and ensures the system always reflects accurate availability.

## How It Works

### Status Logic
- **`available`**: Faculty has at least one open time slot in the next 1 week (Monday-Friday)
- **`offline`**: Faculty has no available time slots for the next 1 week

### Calculation
The system checks faculty schedules every time they are displayed:
1. Fetches faculty availability schedule
2. Checks next Monday-Friday (5 business days)
3. Looks for any time slot that extends into the future (after current time)
4. Sets status to "available" if at least one future slot exists
5. Sets status to "offline" if no future slots exist

### Real-Time Updates
Status is calculated on-the-fly whenever:
- Student views faculty list on kiosk
- Student loads scheduling page
- Faculty logs in
- Student checks available appointments

No status stays stale since it's always calculated from current schedule.

## Implementation

### Backend Functions

**File**: `server.ts`

#### Helper Function: `hasAvailableSlots()`
```typescript
const hasAvailableSlots = (availabilitySlots: any[]): boolean => {
  // Checks if faculty has any future time slots
  // Returns: true if slots exist, false otherwise
}
```

**Usage in Endpoints**:
- `GET /api/faculty` - Returns all faculty with automatic status
- `POST /api/faculty/login` - Returns logged-in faculty with automatic status

#### Logic
1. Calculates next Monday (start of scheduling week)
2. Iterates through next 5 days (Mon-Fri only)
3. For each day with scheduled slots, checks if slot end-time is in the future
4. Returns `true` if any future slot found, `false` otherwise

### Example Calculation

**Scenario**: Thursday, 2:00 PM
- Faculty has availability: Monday 9-12, Tuesday 10-11, Thursday 2-4, Friday 1-3

**Next Scheduling Period**: Next Monday-Friday
- Days checked: Mon, Tue, Wed, Thu, Fri
- Monday 9 AM-12 PM: Future ✅ → Status = **available**
- (All subsequent checks skipped once one future slot found)

**Result**: Status shows as `"available"`

### If Faculty Has No Schedule
- No availability slots defined → Status = `"offline"`
- Faculty must set availability to show as "available"

## User Experience

### For Students (Kiosk)
✅ Faculty shown with `"available"` status only if they have open slots
✅ No manual status toggling to confuse students
✅ Real-time, always accurate availability

### For Faculty (Dashboard)
✅ Status automatically reflects their schedule
❌ Can no longer manually toggle offline/available (removed button)
✅ Status updates automatically when availability schedule changes

## Database Storage
The faculty `status` field is still stored in the database but is **overridden** by automatic calculation in API responses. The stored value remains for:
- Historical auditing
- Future manual override capability (if needed)
- Backward compatibility

## Frontend Display

### Components Affected
- **KioskView.tsx** - Shows faculty with automatic status
- **Login.tsx** - Displays available faculty based on automatic status
- **FacultyDashboard.tsx** - Shows faculty's own status (automatic)

### Status Display
Faculty cards show status badge:
- Green: `"available"`
- Red: `"offline"`

## Testing

### Manual Test
```bash
# Get faculty list - check status field
curl http://localhost:3000/api/faculty

# Expected output (example):
# [
#   {
#     "id": "faculty-1",
#     "name": "Dr. Smith",
#     "status": "available",    # ← Automatic based on schedule
#     "full_name": [
#       { "day": "Monday", "start": "09:00", "end": "12:00" },
#       { "day": "Tuesday", "start": "10:00", "end": "11:00" }
#     ]
#   }
# ]
```

### Test Cases
1. **Faculty with next-week slots** → Status = `"available"` ✅
2. **Faculty with no slots defined** → Status = `"offline"` ✅
3. **Faculty with only past slots** → Status = `"offline"` ✅
4. **Faculty with mixed past/future slots** → Status = `"available"` ✅
5. **After Friday ends** → Status updates based on Monday's availability ✅

## Benefits

### Reliability
✅ No manual status changes missed
✅ No outdated status displayed
✅ Consistent across all views

### User Experience
✅ Students see accurate, current faculty availability
✅ Faculty don't need to remember to toggle status
✅ System is self-correcting

### Admin Oversight
✅ Reduced student complaints about availability mismatches
✅ Simpler faculty dashboard (no status toggle button)
✅ Seamless availability management

## Related Features

**Removed**:
- Manual "Go Offline" / "Go Available" button from FacultyDashboard
- Manual status update endpoint (still technically functions but overridden by automatic calculation)

**Still Active**:
- Faculty can set their availability schedule (Mon-Fri hours)
- Availability setting page in faculty dashboard
- Weekly schedule display for students

## Future Enhancements

### Possible Additions
- Per-day status (available on Mon, offline on Wed)
- Status reason display ("Available Mon-Fri 9-12", "Offline - No schedule")
- Real-time status updates via WebSocket
- Faculty override (manual "offline" even if slots available)

## Troubleshooting

### Faculty showing "offline" when they have slots
**Cause**: Slots may be in the past or not for next Mon-Fri
**Solution**: Check that slots are defined and extend into next week

### Faculty showing "available" when shouldn't
**Cause**: System calculated a future slot exists
**Solution**: Expected behavior - faculty status reflects actual availability

### Status not updating after schedule change
**Cause**: Need to refresh page or re-login
**Solution**: Automatic status calculated on each API call, refresh to see update

## Code References
- **Helper function**: [server.ts line 189-233](server.ts#L189-L233)
- **Faculty list endpoint**: [server.ts line 2623-2656](server.ts#L2623-L2656)
- **Faculty login endpoint**: [server.ts line 2619-2624](server.ts#L2619-L2624)
