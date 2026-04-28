# Telegram Integration - Deployment Checklist

## Pre-Deployment Verification

- [ ] **Verify Files Modified**
  - [x] `package.json` - Contains `node-telegram-bot-api` dependency
  - [x] `server.ts` - Contains bot initialization and endpoints

- [ ] **Verify Files Created**
  - [x] `setup-telegram-integration.sql` - Database migration
  - [x] `TELEGRAM_SETUP.md` - Setup guide
  - [x] `TELEGRAM_INTEGRATION_EXAMPLE.ts` - Frontend examples
  - [x] `TELEGRAM_IMPLEMENTATION_SUMMARY.md` - Implementation overview

## Deployment Steps

### Step 1: Create Telegram Bot (One-time)
```
1. Open Telegram
2. Search for @BotFather
3. Send /newbot
4. Follow prompts
5. Copy API token
```

### Step 2: Configure Environment
```
Edit .env.local:
TELEGRAM_BOT_TOKEN=your_token_here

Example:
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklmnoPQRstuvWXYZ123456789
```

### Step 3: Database Migration
```sql
-- In Supabase SQL Editor:
-- Copy the entire contents of setup-telegram-integration.sql
-- Execute the query
-- Verify tables created:
--   - telegram_chats
--   - telegram_notification_logs
```

### Step 4: Install Dependencies
```bash
npm install
# or
yarn install
# or
pnpm install
```

### Step 5: Restart Server
```bash
# Stop the current server (Ctrl+C)
npm run dev
# or
npm start
```

### Step 6: Verify Initialization
Check server console output:
```
✅ Telegram Bot Service Initialized Successfully
```

If you see this message, the bot is ready!

## Testing Checklist

- [ ] **Test 1: Register Telegram**
  ```bash
  curl -X POST http://localhost:3000/api/faculty/test-faculty-1/telegram/register \
    -H "Content-Type: application/json" \
    -d '{"telegram_chat_id": 123456789}'
  ```
  Expected: `{"success": true, "message": "..."}`

- [ ] **Test 2: Check Status**
  ```bash
  curl http://localhost:3000/api/faculty/test-faculty-1/telegram/status
  ```
  Expected: `{"registered": true, "is_active": true, ...}`

- [ ] **Test 3: Disconnect**
  ```bash
  curl -X POST http://localhost:3000/api/faculty/test-faculty-1/telegram/disconnect
  ```
  Expected: `{"success": true, "message": "..."}`

- [ ] **Test 4: Queue Notification**
  1. Create a queue entry
  2. Update queue status to "serving"
  3. Check if faculty receives Telegram message
  4. Check `telegram_notification_logs` table

## Production Deployment

### For Render
1. Add `TELEGRAM_BOT_TOKEN` to environment variables
2. Restart service
3. Monitor logs for "Telegram Bot Service Initialized"

### For Railway
1. Add `TELEGRAM_BOT_TOKEN` to variables
2. Redeploy
3. Check deployment logs

### For Docker/Custom
1. Set `TELEGRAM_BOT_TOKEN` environment variable
2. Ensure `setup-telegram-integration.sql` has been run
3. Restart container
4. Verify initialization logs

## Troubleshooting

### Issue: "Telegram Bot Service not initialized"
- [ ] Check `TELEGRAM_BOT_TOKEN` is set correctly
- [ ] Verify token is valid (from @BotFather)
- [ ] Check for typos in environment variable name
- [ ] Restart server after fixing

### Issue: Notifications not sent
- [ ] Check `telegram_chats` table for faculty registration
- [ ] Verify `is_active` is true
- [ ] Check `telegram_notification_logs` for errors
- [ ] Ensure database migration was run

### Issue: Database errors
- [ ] Verify `setup-telegram-integration.sql` was executed
- [ ] Check tables exist: `telegram_chats`, `telegram_notification_logs`
- [ ] Confirm foreign keys are correct
- [ ] Check RLS policies (should be disabled)

## Rollback Plan

If issues occur after deployment:

1. **Disable notifications temporarily**
   - Set dummy token: `TELEGRAM_BOT_TOKEN=dummy`
   - Restart server
   - Notifications will fail gracefully without crashing

2. **Remove database schema** (if needed)
   ```sql
   DROP TABLE IF EXISTS telegram_notification_logs;
   DROP TABLE IF EXISTS telegram_chats;
   ```

3. **Revert code changes**
   - git checkout HEAD -- server.ts package.json
   - npm install
   - Restart server

## Success Criteria

✅ Deployment is successful when:
- Server starts without errors
- "Telegram Bot Service Initialized" message appears in logs
- Database tables exist and are accessible
- API endpoints respond to requests
- Faculty can register Telegram chat ID
- Queue status updates send Telegram messages
- Notifications appear in faculty's Telegram

## Monitoring Post-Deployment

### Check these daily:
```sql
-- Last 10 notifications
SELECT * FROM telegram_notification_logs 
ORDER BY sent_at DESC LIMIT 10;

-- Any failed notifications
SELECT * FROM telegram_notification_logs 
WHERE status = 'failed' 
ORDER BY sent_at DESC;

-- Active faculty with Telegram
SELECT COUNT(*) FROM telegram_chats 
WHERE is_active = TRUE;
```

### Set alerts for:
- Multiple consecutive notification failures
- Faculty registrations without corresponding database entries
- Telegram API errors in logs

## Support Resources

- **BotFather Documentation**: Message @BotFather with `/help`
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **Node Telegram Bot API**: https://github.com/yagop/node-telegram-bot-api
- **Setup Guide**: See TELEGRAM_SETUP.md
- **Implementation Details**: See TELEGRAM_IMPLEMENTATION_SUMMARY.md

## Post-Deployment Tasks

- [ ] Document the bot username used
- [ ] Share bot link with faculty for easy access
- [ ] Send notification to faculty about new feature
- [ ] Monitor first week of deployments
- [ ] Collect feedback from faculty
- [ ] Plan future enhancements (buttons, commands, etc.)

## Sign-off

- **Deployment Date**: ___________
- **Deployed By**: ___________
- **Verified By**: ___________
- **Notes**: ___________
