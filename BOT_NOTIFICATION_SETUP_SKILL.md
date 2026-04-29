# Skill: Bot Notification Setup

**Purpose**: Establish a reusable workflow for integrating any messaging bot platform (Telegram, Viber, WhatsApp, etc.) into the KIOSK faculty notification system.

**Scope**: Workspace-scoped skill for KIOSK-SP2.0 project

---

## Problem Statement

Faculty members need to receive timely consultation reminders via third-party messaging platforms. Each platform (Telegram, Viber, etc.) has different APIs and requirements, requiring a systematic approach to:
- Set up bot credentials
- Store user preferences securely
- Log notifications for auditing
- Provide user-friendly registration UI
- Test integration end-to-end

---

## Workflow Overview

```
1. PLATFORM SETUP
   ├─ Create/register bot on platform
   ├─ Obtain API credentials
   └─ Document auth requirements

2. DEVELOPMENT ENVIRONMENT
   ├─ Add environment variables (.env.local)
   ├─ Install SDK/package
   └─ Create test file

3. DATABASE SCHEMA
   ├─ Create platform_chats table (registration storage)
   ├─ Create platform_notification_logs table (audit trail)
   └─ Run migrations

4. BACKEND INTEGRATION
   ├─ Initialize bot client
   ├─ Implement message handlers
   ├─ Create API endpoints for registration/status/disconnect
   └─ Add error handling & logging

5. FRONTEND INTEGRATION
   ├─ Create UI component for registration
   ├─ Implement API service functions
   ├─ Add status display & management
   └─ Integrate into Faculty Dashboard

6. DOCUMENTATION & TESTING
   ├─ Write setup guide
   ├─ Create test script
   ├─ Document user instructions
   └─ Verify end-to-end flow
```

---

## Step-by-Step Implementation

### Phase 1: Platform Setup ⚙️

**Goal**: Obtain bot credentials and understand platform limitations

**Decision Points**:
- [ ] Does the platform require a registered business/developer account?
- [ ] Is there a rate limit on messages?
- [ ] What are the authentication mechanisms (token, webhook, etc.)?
- [ ] Does the platform support scheduled messages or only on-demand?

**Deliverables**:
- API token/credentials
- Platform API documentation link
- Understanding of chat ID system (numeric ID vs username)
- Message payload format

**Example for Telegram** (BotFather flow):
```
1. Search @BotFather in Telegram
2. Send /newbot
3. Provide bot name & username
4. Receive token: 123456789:ABCdefGHIjklmnoPQRstuvWXYZ
```

---

### Phase 2: Development Environment Setup 🛠️

**Goal**: Prepare local environment for development and testing

**Actions**:
1. **Install SDK package**
   ```bash
   npm install node-[platform]-bot-api  # e.g., node-telegram-bot-api
   ```

2. **Add to .env.local**
   ```env
   [PLATFORM]_BOT_TOKEN=your_credentials_here
   # Optional:
   [PLATFORM]_WEBHOOK_URL=https://yourdomain.com/webhook
   [PLATFORM]_RATE_LIMIT_PER_MINUTE=30
   ```

3. **Create test file**: `test-[platform]-bot.ts`
   ```typescript
   // Tests connectivity, bot info, and message sending
   // Run: npx tsx test-[platform]-bot.ts <CHAT_ID>
   ```

**Validation**:
- [ ] SDK installed successfully (`npm list`)
- [ ] .env.local contains all required variables
- [ ] Test file runs without errors
- [ ] Can send test message to yourself

---

### Phase 3: Database Schema 📊

**Goal**: Store registration data and maintain audit trail

**Create Migration**: `setup-[platform]-integration.sql`

```sql
-- User registrations
CREATE TABLE [platform]_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  [platform]_chat_id BIGINT NOT NULL,
  [platform]_username TEXT,
  is_active BOOLEAN DEFAULT true,
  registered_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Notification audit log
CREATE TABLE [platform]_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  notification_type VARCHAR(50),
  status VARCHAR(20), -- 'sent', 'failed', 'skipped'
  error_message TEXT,
  sent_at TIMESTAMP DEFAULT now()
);

-- Indices for performance
CREATE UNIQUE INDEX ON [platform]_chats(faculty_id);
CREATE INDEX ON [platform]_notification_logs(faculty_id, sent_at DESC);
```

**Validation**:
- [ ] Tables created in Supabase
- [ ] Indices created
- [ ] Permissions set correctly

---

### Phase 4: Backend Integration 🔧

**Location**: `server.ts`

**Components**:

#### 4.1 Bot Initialization
```typescript
import [PlatformBot] from 'node-[platform]-bot-api';

let platformBot: [PlatformBot] | null = null;

async function setup[Platform]Bot() {
  const token = process.env.[PLATFORM]_BOT_TOKEN;
  if (!token) {
    console.warn(`⚠️ ${PLATFORM}_BOT_TOKEN not set.`);
    return;
  }
  
  try {
    platformBot = new [PlatformBot](token, { polling: true });
    console.log(`✅ ${PLATFORM} Bot initialized`);
    
    // Message handlers (command responses, etc.)
    
  } catch (error) {
    console.error(`❌ Failed to initialize ${PLATFORM} Bot:`, error);
  }
}

setup[Platform]Bot();
```

#### 4.2 API Endpoints
```typescript
// Register user with bot
POST /api/faculty/:id/[platform]/register
Body: { [platform]_chat_id, [platform]_username? }
Returns: { success, message }

// Get registration status
GET /api/faculty/:id/[platform]/status
Returns: { registered, is_active, [platform]_username, registered_at }

// Disconnect/deregister
POST /api/faculty/:id/[platform]/disconnect
Returns: { success, message }
```

#### 4.3 Send Notification Function
```typescript
export async function send[Platform]Notification(
  facultyId: string,
  message: string,
  notificationType: string
) {
  try {
    // Fetch chat ID from DB
    const { data: chat } = await supabase
      .from('[platform]_chats')
      .select('[platform]_chat_id')
      .eq('faculty_id', facultyId)
      .single();
    
    if (!chat) {
      console.warn(`No [platform] registration for faculty ${facultyId}`);
      return;
    }
    
    // Send message via bot
    await platformBot?.sendMessage(chat.[platform]_chat_id, message);
    
    // Log success
    await logNotification(facultyId, notificationType, 'sent');
  } catch (error) {
    console.error(`Failed to send [platform] notification:`, error);
    await logNotification(facultyId, notificationType, 'failed', error.message);
  }
}
```

**Validation**:
- [ ] Bot initializes on server startup
- [ ] API endpoints respond correctly
- [ ] Notifications are logged in DB
- [ ] Error handling works

---

### Phase 5: Frontend Integration 🎨

**Location**: Faculty Dashboard

#### 5.1 Service Functions (API calls)
```typescript
// utils/[platform]Service.ts
export async function register[Platform](
  facultyId: string,
  chatId: number,
  username?: string
) {
  const res = await fetch(`/api/faculty/${facultyId}/[platform]/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      [platform]_chat_id: chatId,
      [platform]_username: username
    })
  });
  
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

export async function get[Platform]Status(facultyId: string) {
  const res = await fetch(`/api/faculty/${facultyId}/[platform]/status`);
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

export async function disconnect[Platform](facultyId: string) {
  const res = await fetch(`/api/faculty/${facultyId}/[platform]/disconnect`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}
```

#### 5.2 UI Component
```typescript
// components/[Platform]NotificationsPanel.tsx
export function [Platform]NotificationsPanel({ facultyId }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [chatIdInput, setChatIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, [facultyId]);

  const handleRegister = async () => {
    setLoading(true);
    try {
      await register[Platform](facultyId, parseInt(chatIdInput));
      setSuccess('Successfully registered!');
      await fetchStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="[platform]-panel">
      {status?.registered ? (
        <div>✅ Active - Ready to receive notifications</div>
      ) : (
        <input 
          placeholder="Enter Chat ID" 
          onChange={(e) => setChatIdInput(e.target.value)}
        />
      )}
    </div>
  );
}
```

**Validation**:
- [ ] UI renders in Faculty Dashboard
- [ ] Registration flow works end-to-end
- [ ] Status displays correctly
- [ ] Disconnect button works

---

### Phase 6: Documentation & Testing 📝

#### 6.1 Setup Guide
Create `[PLATFORM]_SETUP.md`:
- Platform requirements
- Step-by-step registration
- API endpoints documentation
- Troubleshooting section

#### 6.2 Test Script: `test-[platform]-bot.ts`
```bash
npx tsx test-[platform]-bot.ts <CHAT_ID>
# Should:
# 1. Verify bot credentials
# 2. Get bot info
# 3. Send test message
# 4. Confirm receipt
```

#### 6.3 End-to-End Verification Checklist
- [ ] Create test faculty account
- [ ] Register with bot (manually via UI)
- [ ] Trigger a consultation notification
- [ ] Verify message received
- [ ] Check database logs
- [ ] Test disconnect functionality
- [ ] Verify error handling (bad chat ID, etc.)

---

## Decision Tree: When to Use This Skill

**Use this skill when:**
- Adding a new messaging platform (Viber, WhatsApp, Signal, etc.)
- Need to replicate Telegram setup for consistency
- Setting up bot notifications for a new feature/module

**Key Decision Points:**
1. Does the platform support polling or webhooks?
   - If polling: Similar to Telegram implementation
   - If webhooks: Requires different server setup

2. Is chat ID numeric or alphanumeric?
   - Numeric: Store as BIGINT
   - Alphanumeric: Store as TEXT

3. Does platform support scheduled messages?
   - If yes: Can send pre-scheduled reminders
   - If no: Must use external scheduler (cron jobs)

---

## Quality Checklist

Before considering integration complete:

- [ ] **Code Quality**
  - [ ] Error handling for all API calls
  - [ ] Proper logging of failures
  - [ ] Environment variables validated on startup
  - [ ] No hardcoded credentials

- [ ] **Security**
  - [ ] Chat IDs stored securely
  - [ ] API tokens in .env.local (not committed)
  - [ ] SQL injection prevention (use parameterized queries)
  - [ ] Rate limiting implemented

- [ ] **Testing**
  - [ ] Test script works end-to-end
  - [ ] API endpoints tested with valid/invalid data
  - [ ] Database migrations run without errors
  - [ ] UI components render correctly

- [ ] **Documentation**
  - [ ] Setup guide for new developers
  - [ ] User-facing instructions in Faculty Dashboard
  - [ ] Admin instructions for troubleshooting
  - [ ] API documentation

- [ ] **Functionality**
  - [ ] Notifications sent at correct times
  - [ ] Disconnection prevents further messages
  - [ ] Failure scenarios handled gracefully
  - [ ] Audit logs capture all activity

---

## Common Patterns & Antipatterns

✅ **DO:**
- Use environment variables for all credentials
- Log all notification attempts (success & failure)
- Validate chat IDs format before storing
- Implement graceful degradation if bot token missing

❌ **DON'T:**
- Hardcode bot tokens in code
- Skip error handling for failed sends
- Store unencrypted credentials in database
- Mix platform-specific logic with generic code

---

## Example: Applying This Skill to Viber

**Estimated time**: 3-4 hours following this workflow

1. **Platform Setup** (30 min)
   - Register Viber bot with Viber Business
   - Get API token
   - Understand Viber chat ID format

2. **Environment & Testing** (30 min)
   - Install Viber SDK
   - Add VIBER_BOT_TOKEN to .env.local
   - Create test-viber-bot.ts

3. **Database** (30 min)
   - Create viber_chats table
   - Create viber_notification_logs table
   - Add indices

4. **Backend** (1 hour)
   - Initialize Viber bot in server.ts
   - Create API endpoints
   - Implement send function

5. **Frontend** (1 hour)
   - Create viberService.ts
   - Create ViberNotificationsPanel component
   - Integrate into Faculty Dashboard

6. **Testing & Docs** (30 min)
   - End-to-end testing
   - Write VIBER_SETUP.md
   - Test error scenarios

---

## Related Skills to Create Next

1. **Webhook Integration Pattern** - For platforms using webhooks instead of polling
2. **Notification Scheduler** - Cron job management for timed messages
3. **Multi-Platform Notification Dispatch** - Sending to multiple platforms simultaneously
4. **Bot Message Templates** - Creating reusable message formatting
5. **Notification Analytics** - Dashboard for tracking notification delivery rates

---

## Example Prompts to Use This Skill

- "Add Viber bot notifications following the bot notification setup workflow"
- "Set up WhatsApp notifications using the same pattern as Telegram"
- "Integrate Signal for faculty consultations using this skill"
- "Create a Slack bot for queue notifications"
