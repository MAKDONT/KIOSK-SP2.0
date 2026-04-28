# Telegram Integration - Consultation Reminders Update

## What Changed ✅

The Telegram notification system has been updated to send **scheduled consultation reminders** instead of real-time queue status updates.

### Before
- Telegram notifications sent on every queue status change (waiting, next, serving, completed, cancelled)
- Could overwhelm faculty with too many messages

### After  
- Telegram notifications sent at **specific times** based on scheduled consultations
- Only notifies faculty when they have consultations coming up
- Two notifications per consultation:
  1. **5 minutes before** - "Prepare to log in"
  2. **At consultation start** - "Log in now to start"

## How It Works

### Automatic Consultation Scheduler

The server runs a **background scheduler every 30 seconds** that:

1. **Checks all pending consultations** - Finds consultations with status "waiting" or "ongoing"
2. **Calculates time until start** - Compares current time with consultation start time
3. **Sends notifications at key times**:
   - ⏳ **5-7 minutes before** → Send reminder (prepare to log in)
   - 🔴 **±1 minute of start time** → Send alert (log in now)

### Example Timeline

For a consultation scheduled for 2:30 PM:

```
1:50 PM    → Consultation shows in faculty's queue
2:23 PM    → Scheduler detects consultation in 7 minutes
2:24 PM    → ⏳ TELEGRAM SENT: "Consultation in 5 minutes, please prepare"
2:25 PM    → Faculty logs in to system
2:29 PM    → Scheduler detects consultation starting in 1 minute
2:30 PM    → 🔴 TELEGRAM SENT: "Consultation starting now! Log in now"
2:30 PM    → Faculty starts consultation with student
```

## Configuration

### Environment Variables

```env
# Required
TELEGRAM_BOT_TOKEN=your_bot_token

# Already set (no changes needed)
APP_TIMEZONE=Asia/Manila  # For correct consultation time calculation
```

### Database Requirements

Run this once:
```sql
-- From setup-telegram-integration.sql
-- Creates: telegram_chats and telegram_notification_logs tables
```

### Scheduler Timing

The scheduler checks every **30 seconds**:
- Minimizes missed notifications
- Low server impact (brief database query)
- Accurate to within 1 minute windows

## API Endpoints

All endpoints remain the same:

```
POST /api/faculty/:id/telegram/register     - Register for notifications
POST /api/faculty/:id/telegram/disconnect   - Stop notifications  
GET  /api/faculty/:id/telegram/status       - Check registration
```

## Notification Examples

### 5-Minute Advance Reminder
```
⏳ CONSULTATION IN 5 MINUTES

Student: Maria Santos
Scheduled Time: 2:30 PM - 2:45 PM

Please prepare to log in soon.
```

### Consultation Start Alert
```
🔴 CONSULTATION STARTING NOW!

Student: Maria Santos
Time: 2:30 PM - 2:45 PM
Status: Ready to start

Please log in to the system now to begin the consultation.
```

## Benefits

✅ **Timely Reminders** - Faculty don't forget to log in  
✅ **Fewer Messages** - Only 2 per consultation (not continuous)  
✅ **Scheduled Focus** - Reminders tied to actual consultation times  
✅ **Less Spam** - No noise from queue status updates  
✅ **Better UX** - Faculty know exactly when to expect notifications  

## Migration Notes

If you previously registered for Telegram notifications:

- ✅ Your registration is **still active**
- ✅ No re-registration needed
- ✅ You'll automatically start receiving the new scheduled reminders
- ❌ You'll **no longer** receive real-time queue status updates

## Server Logs

Watch for these messages to verify scheduler is working:

```
📬 Consultation notification scheduler started (checks every 30 seconds)
   📧 Sends ADVANCE email to STUDENTS at 5-7 minutes before
   🔔 Sends ON-TIME alert to FACULTY at consultation start time (±1 minute window)

[SCHEDULER] Current time: 14:24 (864 minutes)
📋 [SCHEDULER] Found 3 active consultations

📌 Checking consultation 12345:
   Student: John Doe (john@example.com)
   Time slot: 14:30-14:45
   Minutes until start: 6
   ✅ SENDING 5-MINUTE ADVANCE EMAIL TO STUDENT
   📱 Sending Telegram notification to faculty: consultation in 5 minutes
   ✅ Telegram notification sent to faculty
```

## Testing the New Behavior

### Manual Test Steps:

1. **Create a consultation** scheduled for 5 minutes from now
   - Add to queue with valid `meet_link`
   - Set status to "waiting"

2. **Verify in logs** - Watch server console for:
   ```
   📱 Sending Telegram notification to faculty
   ✅ Telegram notification sent to faculty
   ```

3. **Check database**
   ```sql
   SELECT * FROM telegram_notification_logs 
   WHERE faculty_id = 'your_faculty_id'
   ORDER BY sent_at DESC LIMIT 5;
   ```

4. **Verify message received** - Check faculty's Telegram

### Optional: Trigger scheduler immediately

The scheduler runs automatically every 30 seconds. To force it to check consultations sooner, restart the server:
```bash
npm run dev
# or
npm start
```

## Troubleshooting

### Scheduler not running?
- Check: "Consultation notification scheduler started" in logs
- If missing: Check for errors in server startup
- Try: Restart server

### Consultations not found?
- Check: Queue table has entries with `status = 'waiting'`
- Check: `meet_link` field is populated and in correct format
- Check: Consultation date/time is today or in the future

### No Telegram sent?
- Check: Faculty has registered Telegram chat ID
- Check: `is_active = true` in telegram_chats table
- Check: Faculty has active consultations
- Check: `telegram_notification_logs` table for errors

## Integration Architecture

```
┌─────────────────────────────────────────┐
│  Consultation Reminder Scheduler        │
│  (Runs every 30 seconds)                │
└──────────────┬──────────────────────────┘
               │
               ├─→ Query pending consultations
               │   (status = waiting/ongoing)
               │
               ├─→ Calculate time until start
               │   (using APP_TIMEZONE)
               │
               ├─→ Check notification windows:
               │   • 5-7 minutes before?
               │   • ±1 minute at start?
               │
               ├─→ Send Email (SendGrid)
               │   to Student
               │
               └─→ Send Telegram (Bot API)
                   to Faculty
                   + WebSocket broadcast
                   + Audit log
```

## Performance Impact

- **Database Queries**: 1 query per 30 seconds (minimal)
- **API Calls**: Only when notifications needed (2 per consultation)
- **Server Load**: Negligible (async operations)
- **No impact** on faculty dashboard or other features

## What's NOT Changed

- ✅ Email notifications to students still work
- ✅ All queue operations unchanged
- ✅ Faculty dashboard functionality unchanged
- ✅ WebSocket broadcasting still enabled
- ✅ Audit logging still records all events

## Future Enhancements

Possible improvements for next version:
- [ ] Faculty can snooze reminders
- [ ] Customizable reminder times (10 min, 5 min, etc.)
- [ ] Faculty can set preferred notification channels
- [ ] Digest summary of daily consultations
- [ ] Telegram commands (/schedule, /today, /help)

## FAQ

**Q: Will I receive messages during my off-hours?**  
A: Yes. The scheduler runs continuously. Consider using Do Not Disturb on your phone or set Telegram notification hours.

**Q: Can I customize when I get notifications?**  
A: Currently, no. It's hardcoded to 5-7 minutes before and at start time. Future enhancement possible.

**Q: What if I close Telegram?**  
A: You won't receive notifications if Telegram is not running. Telegram will show unread messages when you open it.

**Q: Do I get notified if there are no consultations?**  
A: No. The scheduler only sends notifications for pending consultations.

**Q: Can multiple faculty share one Telegram account?**  
A: Not recommended. Each faculty should register their own Chat ID for accurate tracking.

**Q: What if a consultation is cancelled?**  
A: The scheduler checks status = 'waiting' or 'ongoing'. Cancelled consultations won't trigger notifications.

---

**Last Updated:** April 28, 2026  
**Version:** 2.0 - Scheduled Consultation Reminders
