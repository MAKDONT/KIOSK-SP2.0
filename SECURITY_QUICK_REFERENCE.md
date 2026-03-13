# Security Vulnerabilities - Quick Reference

**Use this as a checklist while reviewing code**

---

## Critical Issues Tracker

### ✋ STOP: Is your endpoint missing authentication?

**Check this before deploying ANY endpoint:**

| Endpoint | Needs Auth? | Type | Fixed? |
|----------|-----------|------|--------|
| `POST /api/admin/login` | NO* | Public | ☐ |
| `POST /api/admin/logout` | YES | Admin | ☐ |
| `POST /api/admin/password` | YES | Admin | ☐ |
| `GET /api/admin/password-configured` | NO* | Public | ☐ |
| `GET /api/admin/google/login-url` | NO* | Public | ☐ |
| `GET /api/admin/queue-monitor` | **YES** | Admin | ☐ |
| `POST /api/faculty/:id/status` | **YES** | Faculty | ☐ |
| `PATCH /api/faculty/:id` | **YES** | Admin | ☐ |
| `GET /api/faculty` | NO | Public | ☐ |
| `POST /api/queue/join` | NO | Public | ☐ |
| `GET /api/queue/booked-slots` | NO | Public | ☐ |
| `GET /api/faculty/:faculty_id/queue` | **YES** | Faculty | ☐ |
| `POST /api/queue/:id/status` | **YES** | Faculty | ☐ |

*No auth needed but should have other controls (rate limiting, input validation)

---

## 🔴 Critical Checklist

Before commit, ask yourself:

```
[ ] Does ANY admin-facing endpoint lack requireAdminAuth middleware?
    If YES → Add it NOW before committing

[ ] Are default credentials like "EARIST" in the code?
    If YES → Remove them IMMEDIATELY

[ ] Can users set/reset admin password without authentication?
    If YES → Add auth check before ANY password operations

[ ] Are admin sessions returned and validated?
    If YES → Good ✓
    If NO  → Add session middleware

[ ] Are queue endpoint parameters validated?
    If NO → Add input validation

[ ] Can database errors be seen by users?
    If YES → Wrap errors in sendError() helper

[ ] Is every POST/PATCH/DELETE endpoint protected from CSRF?
    If NO → Add CSRF tokens or same-site cookies

[ ] Are rate limits on login/password reset in place?
    If NO → Add rate limiting immediately
```

---

## Code Patterns to AVOID ❌

### ❌ Pattern 1: No Authentication on Admin Endpoint

```typescript
// VULNERABLE - NEVER DO THIS
app.post("/api/admin/password", async (req, res) => {
  // No auth middleware!
  const password = req.body.password;
  // ...
});
```

**Fix:**
```typescript
// SECURE - Always add auth
app.post("/api/admin/password", requireAdminAuth, async (req, res) => {
  const password = req.body.password;
  // ...
});
```

---

### ❌ Pattern 2: Hardcoded Credentials

```typescript
// VULNERABLE - NEVER DO THIS
const DEFAULT_PASSWORD = "EARIST";
const storedPassword = error ? DEFAULT_PASSWORD : data.value;
```

**Fix:**
```typescript
// SECURE - No defaults
const storedPassword = (error || !data) ? null : data.value;
if (!storedPassword) {
  return res.status(403).json({ error: "Admin account not configured" });
}
```

---

### ❌ Pattern 3: Direct Parameter Usage

```typescript
// VULNERABLE - NEVER DO THIS
app.get("/api/students/:id", async (req, res) => {
  const student = await getSupabase()
    .from("students")
    .eq("student_number", req.params.id); // No validation!
});
```

**Fix:**
```typescript
// SECURE - Always validate
app.get("/api/students/:id", async (req, res) => {
  try {
    const id = validators.studentId(req.params.id); // Validates format
    const student = await getSupabase()
      .from("students")
      .eq("student_number", id);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});
```

---

### ❌ Pattern 4: Exposing Database Errors

```typescript
// VULNERABLE - NEVER DO THIS
} catch (err: any) {
  res.status(500).json({ error: err.message }); // Full error exposed!
}
```

**Fix:**
```typescript
// SECURE - Sanitize errors
} catch (err: any) {
  sendError(res, 500, err.message);
}
```

---

### ❌ Pattern 5: No Rate Limiting on Auth Endpoints

```typescript
// VULNERABLE - NEVER DO THIS
app.post("/api/admin/login", async (req, res) => {
  // Infinite login attempts allowed!
  const password = req.body.password;
  // ...
});
```

**Fix:**
```typescript
// SECURE - Always rate limit auth
app.post("/api/admin/login", async (req, res) => {
  const ip = req.ip;
  if (isRateLimited(`admin-login:${ip}`)) {
    return res.status(429).json({ error: "Too many attempts" });
  }
  // ...
});
```

---

### ❌ Pattern 6: No Access Control

```typescript
// VULNERABLE - NEVER DO THIS
app.post("/api/faculty/:id/status", async (req, res) => {
  // Anyone can update any faculty's status!
  const { status } = req.body;
  await getSupabase()
    .from("faculty")
    .update({ status })
    .eq("id", req.params.id);
});
```

**Fix:**
```typescript
// SECURE - Verify ownership
app.post("/api/faculty/:id/status", requireFacultyAuth, async (req, res) => {
  const targetId = validators.facultyId(req.params.id);
  
  // Faculty can only update themselves
  if (req.faculty.id !== targetId) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  
  const { status } = req.body;
  await getSupabase()
    .from("faculty")
    .update({ status })
    .eq("id", targetId);
});
```

---

## ✅ Secure Code Patterns

### ✅ Pattern: Secure Admin Endpoint

```typescript
// SECURE - Use this template
app.post("/api/admin/sensitive-action", requireAdminAuth, async (req, res) => {
  try {
    // 1. Validate inputs
    const email = validators.email(req.body?.email);
    
    // 2. Log the action
    await logAudit("admin_sensitive_action", { email }, req);
    
    // 3. Perform operation
    const { error, data } = await getSupabase()
      .from("admin_settings")
      .update({ ... })
      .eq("id", email);
    
    if (error) throw error;
    
    // 4. Return safe response
    res.json({ success: true });
  } catch (err: any) {
    // 5. Use sendError to sanitize
    sendError(res, 500, err.message);
  }
});
```

---

### ✅ Pattern: Secure Faculty Endpoint

```typescript
// SECURE - Use this template
app.post("/api/faculty/:id/action", requireFacultyAuth, async (req, res) => {
  try {
    // 1. Validate and extract parameters
    const targetId = validators.facultyId(req.params.id);
    
    // 2. Check access control
    if (req.faculty.id !== targetId) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    // 3. Validate request body
    const value = validators.name(req.body?.value);
    
    // 4. Log the action
    await logAudit("faculty_action", { faculty_id: targetId, value }, req);
    
    // 5. Perform operation
    const { error } = await getSupabase()
      .from("faculty")
      .update({ field: value })
      .eq("id", targetId);
    
    if (error) throw error;
    
    // 6. Return safe response
    res.json({ success: true });
  } catch (err: any) {
    sendError(res, 500, err.message);
  }
});
```

---

## Common Vulnerabilities in This Codebase

### 🔴 V1: Missing Admin Auth Middleware

**Found in:**
- `/api/admin/queue-monitor` → 1757
- `/api/admin/password` → 1092-1120
- `/api/queue/:id/status` → 1667-1770

**Fix:** Add `requireAdminAuth` middleware

---

### 🔴 V2: Default Credentials

**Found in:**
- `server.ts` line 1069: `const storedPassword = (error || !data) ? "EARIST" : data.value;`

**Fix:** Remove "EARIST", require explicit setup

---

### 🔴 V3: No Session Management

**Found in:**
- `/api/admin/login` endpoint returns `{ success: true }` only

**Fix:** Implement session creation and return token

---

### 🔴 V4: Unauthenticated Faculty Routes

**Found in:**
- `/api/faculty/:id/status` → 1420-1436
- `/api/faculty/:id` (PATCH) → 1516-1542

**Fix:** Add `requireFacultyAuth` + access control

---

### 🟠 V5: Error Message Disclosure

**Found in:**
- Nearly ALL endpoints: `} catch (err: any) { res.status(500).json({ error: err.message }); }`

**Fix:** Use `sendError()` helper to sanitize

---

### 🟠 V6: No Input Validation

**Found in:**
- `/api/faculty/:id` uses `req.params.id` directly
- `/api/students/:id` uses `req.params.id` directly
- `/api/queue/join` uses `req.body` values directly

**Fix:** Use validators utility

---

## Finding Issues in Code

### Command: Search for missing authentication

```bash
# Find POST/PATCH/DELETE without middleware
grep -n "app\.\(post\|patch\|delete\)" server.ts | grep -v "requireAdminAuth\|requireFacultyAuth"
```

### Command: Find hardcoded secrets

```bash
# Find suspicious strings
grep -n "EARIST\|password\|secret\|key" server.ts | grep -i "const\|="
```

### Command: Find direct parameter usage

```bash
# Find req.params without validation
grep -n "req\.params\." server.ts
```

### Command: Find exposed errors

```bash
# Find err.message directly in responses
grep -n "err\.message" server.ts | grep "json({.*error"
```

---

## Testing Security Fixes

### Test 1: Admin Endpoint Without Auth

```bash
curl -X GET http://localhost:3000/api/admin/queue-monitor

# Expected: 401 Unauthorized
# Actual: ___________
# Status: ☐ Pass ☐ Fail
```

### Test 2: Faculty Status Update Without Auth

```bash
curl -X POST http://localhost:3000/api/faculty/fac-123/status \
  -H "Content-Type: application/json" \
  -d '{"status": "busy"}'

# Expected: 401 Unauthorized
# Actual: ___________
# Status: ☐ Pass ☐ Fail
```

### Test 3: Invalid Input Rejection

```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": ""}'

# Expected: 400 Bad Request
# Actual: ___________
# Status: ☐ Pass ☐ Fail
```

### Test 4: Rate Limiting

```bash
# Run 10+ login attempts rapidly
for i in {1..15}; do
  curl -X POST http://localhost:3000/api/admin/login \
    -H "Content-Type: application/json" \
    -d '{"password": "invalid"}'
  echo "Attempt $i"
done

# Attempts 11+ should return 429
# Status: ☐ Pass ☐ Fail
```

### Test 5: Database Error Sanitization

```bash
# In production, errors should be generic
curl -X POST http://localhost:3000/api/admin/password \
  -H "Content-Type: application/json" \
  -d '{}' 

# Should NOT contain SQL/database/schema info
# Status: ☐ Pass ☐ Fail
```

---

## Checklist for Code Review

When reviewing PRs, check:

```
Security Review Checklist:

[ ] Authentication
    [ ] Admin endpoints have requireAdminAuth
    [ ] Faculty endpoints have requireFacultyAuth
    [ ] Public endpoints have appropriate controls (rate limit, validation)

[ ] Authorization
    [ ] Users can only access their own data
    [ ] Faculty cannot access another faculty's data
    [ ] Email verification enforced where needed

[ ] Input Validation
    [ ] All parameters validated with validators utility
    [ ] Email format checked
    [ ] IDs validated for format/length
    [ ] No direct use of req.params or req.body without validation

[ ] Error Handling
    [ ] All catch blocks use sendError()
    [ ] No database errors exposed
    [ ] No sensitive data in error messages

[ ] Logging
    [ ] Admin actions logged to audit_logs
    [ ] Failed login attempts logged
    [ ] IP addresses recorded

[ ] Rate Limiting
    [ ] Login endpoints rate limited
    [ ] Password reset endpoints rate limited
    [ ] Appropriate thresholds (10 attempts / 15 min)

[ ] Secrets Management
    [ ] No hardcoded secrets (API keys, passwords)
    [ ] All secrets in .env.local
    [ ] Default credentials removed

[ ] Session Management
    [ ] Valid session token returned on login
    [ ] Sessions include IP and User-Agent
    [ ] Sessions expire after 24 hours
    [ ] Logout invalidates session

[ ] Headers & Middleware
    [ ] Security headers present
    [ ] CORS configured correctly
    [ ] CSRF protection in place

Status: ☐ Approved ☐ Needs Changes ☐ Blocked
Reviewer: _________________ Date: __________
```

---

## Emergency Contacts

If security breach suspected:

1. **Immediate:** Kill the affected server instance
2. **Within 5 min:** Notify project lead: ___________
3. **Within 15 min:** Review audit logs for scope
4. **Within 30 min:** Notify affected users
5. **Within 2 hours:** Create incident report

---

## Additional Resources

- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [OWASP Cheat Sheet](https://cheatsheetseries.owasp.org/)
- [Node.js Security](https://nodejs.org/en/docs/guides/security/)
- [Supabase Security](https://supabase.com/docs/guides/auth)

