# Telegram Integration Guide

This document explains how to set up and use the Telegram bot integration for faculty queue notifications in the KIOSK system.

## Overview

The Telegram integration allows faculty members to receive **scheduled consultation reminders** via Telegram. Notifications are sent at key times to alert faculty when they need to log in to the system:
- ⏳ **5 Minutes Before** - "Consultation in 5 minutes, please prepare to log in"
- 🔴 **Consultation Start Time** - "Consultation starting now! Please log in immediately"

**Note:** Notifications are only sent when a faculty member has scheduled consultations with students.

## Setup Instructions

### 1. Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/start` to begin
3. Send `/newbot` to create a new bot
4. Follow the prompts to:
   - Name your bot (e.g., "KIOSK Queue Bot")
   - Create a username (e.g., "kiosk_queue_bot")
5. **Copy the API token** provided by BotFather

Example token: `123456789:ABCdefGHIjklmnoPQRstuvWXYZ123456789`

### 2. Environment Configuration

Add the following to your `.env.local` file:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

Replace `your_telegram_bot_token_here` with the actual token from BotFather.

### 3. Database Setup

Run the SQL migration to create the required tables:

```sql
-- From: setup-telegram-integration.sql
-- Run this in Supabase SQL Editor
```

This creates:
- `telegram_chats` - Stores faculty Telegram chat registrations
- `telegram_notification_logs` - Logs all Telegram notifications sent

### 4. Installation

The Telegram bot package is already added to dependencies:

```bash
npm install
# or
yarn install
```

The `node-telegram-bot-api` package will be installed with the dependencies.

## Usage

### For Faculty Members

#### Register with Telegram Bot

1. **Find the bot** - Search for your bot username in Telegram (e.g., @kiosk_queue_bot)
2. **Get your Chat ID** - Send `/start` to the bot to get your Telegram chat ID
3. **Register in the KIOSK app** - In the Faculty Dashboard:
   - Go to Settings/Preferences
   - Find "Telegram Notifications"
   - Enter your Chat ID
   - Click "Register"
4. **Confirm** - You should receive a welcome message from the bot

#### Manage Notifications

In the Faculty Dashboard:
- **Enable/Disable**: Toggle Telegram notifications on/off
- **Disconnect**: Unregister from Telegram notifications anytime
- **Check Status**: View your registration status and registration date

**When you'll receive notifications:**
- 5-7 minutes before each consultation is scheduled to start
- At the exact consultation start time
- Notifications help you remember to log in to the system

### For Administrators

#### Monitor Telegram Integration

Access the Telegram notification logs:
- Table: `telegram_notification_logs` in Supabase
- Filter by `faculty_id`, `status`, or `sent_at`
- Check `error_message` for any failed notifications

#### Check Faculty Registrations

View active Telegram registrations:
- Table: `telegram_chats` in Supabase
- See which faculty have Telegram enabled (`is_active = true`)
- View registration timestamps

## API Endpoints

### Register Telegram Chat
```
POST /api/faculty/:id/telegram/register
Content-Type: application/json

{
  "telegram_chat_id": 123456789,
  "telegram_username": "student_username"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Telegram chat registered successfully."
}
```

### Disconnect Telegram
```
POST /api/faculty/:id/telegram/disconnect
```

**Response:**
```json
{
  "success": true,
  "message": "Telegram notifications disabled."
}
```

### Check Telegram Status
```
GET /api/faculty/:id/telegram/status
```

**Response:**
```json
{
  "registered": true,
  "is_active": true,
  "telegram_username": "student_username",
  "registered_at": "2024-04-28T10:30:00Z"
}
```

## Notification Types

### Scheduled Consultation Reminders

When a consultation is coming up, faculty receive two notifications:

**1. Five-Minute Advance Reminder**
```
⏳ CONSULTATION IN 5 MINUTES

Student: John Doe
Scheduled Time: 2:30 PM - 2:45 PM

Please prepare to log in soon.
```

**2. Consultation Start Time Alert**
```
🔴 CONSULTATION STARTING NOW!

Student: John Doe
Time: 2:30 PM - 2:45 PM
Status: Ready to start

Please log in to the system now to begin the consultation.
```

These notifications are sent automatically by the scheduler every 30 seconds when there are active consultations.

## Troubleshooting

### Issue: Faculty not receiving notifications

1. **Check bot token**: Ensure `TELEGRAM_BOT_TOKEN` is correctly set in `.env.local`
2. **Verify registration**: Check `telegram_chats` table for the faculty entry with `is_active = true`
3. **Verify consultations exist**: Faculty must have scheduled consultations with:
   - Valid `meet_link` in the format: `HH:MM-HH:MM|https://meet.google.com/xxx`
   - Status of "waiting" or "ongoing"
4. **Check scheduler logs**: Verify scheduler is running every 30 seconds (check server logs for "Consultation notification scheduler started")
5. **Check notification logs**: Review `telegram_notification_logs` table for error messages
6. **Is bot active**: Ensure the Telegram bot service is running (look for "Telegram Bot Service Initialized" in server logs)

### Issue: "Chat not found" error

- Faculty may need to message the bot first to activate the chat
- Verify the chat ID is correct (should be a long number)

### Issue: Bot not responding to `/start` command

- Ensure the bot token is valid and hasn't been revoked
- Try recreating the bot with BotFather
- Restart the server after updating the token

## Architecture

### Server-Side Components

1. **Telegram Bot Instance** - Initialized on server startup
2. **Notification Functions**:
   - `sendTelegramNotification()` - Send generic messages
   - `sendQueueStatusNotification()` - Send queue-specific updates
   - `logTelegramNotification()` - Log notifications for audit

3. **Endpoints**:
   - Register faculty Telegram chat
   - Disconnect/disable notifications
   - Check registration status

### Database Schema

**telegram_chats**
```sql
- id: BIGINT (Primary Key)
- faculty_id: TEXT (Foreign Key → faculty)
- telegram_chat_id: BIGINT
- telegram_username: TEXT (optional)
- registered_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
- is_active: BOOLEAN
```

**telegram_notification_logs**
```sql
- id: BIGINT (Primary Key)
- faculty_id: TEXT (Foreign Key → faculty)
- queue_id: BIGINT (Foreign Key → queue, optional)
- message_type: TEXT
- message_text: TEXT
- sent_at: TIMESTAMPTZ
- telegram_message_id: BIGINT (optional)
- status: TEXT ('sent', 'failed', 'pending')
- error_message: TEXT (optional)
```

## Configuration Reference

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | API token from BotFather |
| `APP_TIMEZONE` | No | Timezone for notifications (default: Asia/Manila) |

### Feature Toggles

The Telegram integration is:
- ✅ **Optional** - Works without affecting existing email notifications
- ✅ **Graceful** - Doesn't crash if bot token is missing
- ✅ **Concurrent** - Sends both email and Telegram notifications simultaneously
- ✅ **Logged** - All notifications logged for audit trail

## Security Considerations

1. **Chat ID Privacy**: Only store with faculty (one-to-one relationship)
2. **Rate Limiting**: Consider Telegram API rate limits (30 msgs/sec)
3. **Error Handling**: All Telegram errors logged, won't crash the server
4. **Token Management**: Store bot token in `.env.local` (never commit to repo)

## Future Enhancements

Possible improvements:
- [ ] Interactive Telegram buttons (Confirm, Reschedule, etc.)
- [ ] Inline keyboards for quick actions
- [ ] Bot commands for status, schedule, etc.
- [ ] Group notifications for entire departments
- [ ] Scheduled digest notifications
- [ ] Telegram command callbacks

## Support

For issues or questions:
1. Check the logs in `telegram_notification_logs` table
2. Review error messages in server console
3. Verify bot token and database configuration
4. Restart the server after configuration changes
