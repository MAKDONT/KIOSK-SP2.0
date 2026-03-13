# Security Implementation Roadmap

**Start Date:** [DATE]  
**Target Completion:** [DATE + 2 weeks]  
**Status:** Not Started → In Progress → Complete

---

## Phase 1: Critical Authentication (Days 1-3)

### Task 1.1: Implement Admin Session Management
- [ ] Add session storage Map to `server.ts`
- [ ] Add `generateAdminSessionToken()` function
- [ ] Add `createAdminSession()` function
- [ ] Add `isValidAdminSession()` function
- [ ] Add session cleanup interval
- [ ] Test: Sessions expire after 24 hours
- [ ] Test: Session invalidated on logout
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 1.2: Remove Default Credentials
- [ ] Find all occurrences of "EARIST" in codebase
- [ ] Remove default password from admin login
- [ ] Require explicit password configuration
- [ ] Test: Cannot login without password set
- [ ] Test: Admin account setup flow works
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 1.3: Update Admin Login Endpoint
- [ ] Implement new `/api/admin/login` with sessions
- [ ] Add IP validation to session
- [ ] Add User-Agent to session tracking
- [ ] Test with Postman: successful login saves session
- [ ] Test: session expires correctly
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 1.4: Add Admin Authentication Middleware
- [ ] Create `requireAdminAuth` middleware
- [ ] Test: Rejects requests without token
- [ ] Test: Rejects expired tokens
- [ ] Test: Validates IP address
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

---

## Phase 2: Secure Admin Endpoints (Days 4-6)

### Task 2.1: Apply Auth to Admin Routes
- [ ] Apply `requireAdminAuth` to `/api/admin/queue-monitor`
- [ ] Apply `requireAdminAuth` to `/api/admin/password`
- [ ] Apply `requireAdminAuth` to `/api/admin/google/password-reset` (rate limit only)
- [ ] Test each endpoint without auth (should fail)
- [ ] Test each endpoint with valid auth (should work)
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 2.2: Add Logout Endpoint
- [ ] Create `/api/admin/logout` endpoint
- [ ] Clear session from memory
- [ ] Clear session cookie
- [ ] Test: Session cleared after logout
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 2.3: Implement Audit Logging
- [ ] Add `logAudit()` function
- [ ] Create `audit_logs` table in Supabase
- [ ] Log all admin login attempts (success/failure)
- [ ] Log all password changes
- [ ] Log all queue monitor access
- [ ] Test: Audit logs created in database
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

---

## Phase 3: Input Validation (Days 7-9)

### Task 3.1: Create Validators Utility
- [ ] Add `validators` object with sanitization functions
- [ ] Implement: `studentId()`, `facultyId()`, `email()`, `password()`, `name()`, `url()`
- [ ] Add unit tests for validators
- [ ] Test: Invalid inputs rejected with clear errors
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 3.2: Apply Validators to Parameters
- [ ] Update `/api/students/:id` with student ID validation
- [ ] Update `/api/faculty/:id` endpoints with faculty ID validation
- [ ] Update `/api/admin/` endpoints with email validation
- [ ] Test: All parameter types validated
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 3.3: Add Error Message Sanitization
- [ ] Create `sendError()` helper function
- [ ] Replace all `err.message` responses with sanitized errors
- [ ] Production: returns generic "An error occurred"
- [ ] Development: returns detailed error (for debugging)
- [ ] Test: No database errors exposed in production
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

---

## Phase 4: Access Control (Days 10-12)

### Task 4.1: Faculty Authentication Middleware
- [ ] Create faculty credentials system (JWT or sessions)
- [ ] Create `requireFacultyAuth` middleware
- [ ] Add faculty login endpoint
- [ ] Test: Faculty can only access their own data
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 4.2: Secure Faculty Routes
- [ ] Add auth check to `/api/faculty/:id/status`
- [ ] Add auth check to `/api/faculty/:id` (PATCH)
- [ ] Add access control: faculty can only update themselves
- [ ] Test: Faculty cannot modify another faculty's profile
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 4.3: Secure Queue Routes
- [ ] Add authentication to `/api/queue/join`
- [ ] Validate student identity from auth token
- [ ] Add authentication to `/api/queue/:id/status`
- [ ] Test: Only faculty can update queue status
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

---

## Phase 5: Infrastructure Security (Days 13-14)

### Task 5.1: Configure CORS
- [ ] Update `.env.local` with `ALLOWED_ORIGINS`
- [ ] Import and install `cors` package
- [ ] Add CORS middleware to Express
- [ ] Test: Requests from unauthorized origins rejected
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 5.2: Add Security Headers
- [ ] Add `Strict-Transport-Security` header
- [ ] Add `Expect-CT` header
- [ ] Verify existing CSP header is correct
- [ ] Test: Headers present in HTTP response
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 5.3: Rate Limiting on Password Reset
- [ ] Apply rate limiting to `/api/admin/google/password-reset`
- [ ] Apply rate limiting to `/api/admin/login`
- [ ] Test: 10+ attempts blocked with 429 status
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

---

## Phase 6: Testing & Verification (Days 15)

### Task 6.1: Security Testing
- [ ] Run all curl tests from SECURITY_FIXES_IMPLEMENTATION.md
- [ ] Test admin endpoints without auth (should fail)
- [ ] Test faculty endpoints with wrong faculty ID (should fail)
- [ ] Test invalid inputs are rejected
- [ ] Test CORS blocking unauthorized origins
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 6.2: Penetration Testing
- [ ] Test SQL injection attempts (should fail)
- [ ] Test XSS payloads in inputs (should sanitize)
- [ ] Test session hijacking (IP mismatch prevents)
- [ ] Test expired session access (should fail)
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

### Task 6.3: Code Review
- [ ] Security review of all modified endpoints
- [ ] Check for hardcoded secrets
- [ ] Check for missing input validation
- [ ] Check for information disclosure
- **Owner:** ___________  
- **Status:** ☐ Not Started ☐ In Progress ☐ Complete

---

## Risk Assessment

| Risk | Current | Mitigation | Target |
|------|---------|-----------|--------|
| Unauthorized admin access | **CRITICAL** | Admin auth middleware | ✅ Closed |
| Default credentials | **CRITICAL** | Remove "EARIST" | ✅ Closed |
| Missing sessions | **CRITICAL** | Session management | ✅ Closed |
| Data exposure | **HIGH** | Auth on queue-monitor | ✅ Closed |
| Invalid input handling | **HIGH** | Validators utility | ✅ Closed |
| Missing audit logs | **MEDIUM** | Audit logging system | ✅ Closed |
| CORS misconfigured | **MEDIUM** | CORS configuration | ✅ Closed |
| Timing attacks | **MEDIUM** | timingSafeEqual fixes | ✅ Closed |

---

## Team Assignments

| Phase | Tasks | Owner | Start | End | Status |
|-------|-------|-------|-------|-----|--------|
| 1 | 1.1-1.4 | _________ | Day 1 | Day 3 | ☐ |
| 2 | 2.1-2.3 | _________ | Day 4 | Day 6 | ☐ |
| 3 | 3.1-3.3 | _________ | Day 7 | Day 9 | ☐ |
| 4 | 4.1-4.3 | _________ | Day 10 | Day 12 | ☐ |
| 5 | 5.1-5.3 | _________ | Day 13 | Day 14 | ☐ |
| 6 | 6.1-6.3 | _________ | Day 15 | Day 15 | ☐ |

---

## Environment Variables to Add

Create in your `.env.local`:

```bash
# ===== SECURITY =====
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
JWT_SECRET=your-secret-key-min-32-chars-change-in-prod

# ===== RATE LIMITING =====
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_ATTEMPTS=10
ADMIN_SESSION_MAX_AGE_MS=86400000

# ===== EXISTING VARIABLES (Keep These) =====
# ... existing variables ...
```

---

## Database Tables to Create

Run in Supabase SQL editor:

```sql
-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  ip VARCHAR(45),
  user_agent VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
```

---

## Pre-Production Checklist

Before deploying to production:

- [ ] All `.env` files use `.env.local` (not committed)
- [ ] `NODE_ENV=production` in production environment
- [ ] `ALLOWED_ORIGINS` set to actual domain
- [ ] HTTPS enforced on all endpoints
- [ ] Database backups configured and tested
- [ ] Audit logs retention policy configured
- [ ] Security headers verified in browser
- [ ] All endpoints tested with auth requirements
- [ ] Rate limiting tested and tuned
- [ ] SSL certificate installed and valid (A+ rating from Qualys)
- [ ] Admin confirmed can access system after changes
- [ ] Rollback plan documented

---

## Rollback Plan

If critical issues discovered:

1. Revert HEAD to commit before security changes
2. Keep database changes (they're backward compatible)
3. Deploy previous version
4. Investigate failures
5. Re-test failures locally before re-deploying

```bash
# Rollback commands
git revert HEAD~3
npm install
npm run build
# Deploy
```

---

## Post-Implementation Monitoring

After implementing all security fixes:

**Weekly:**
- [ ] Review audit logs for suspicious activity
- [ ] Check rate limiting is working
- [ ] Verify all auth endpoints are functioning

**Monthly:**
- [ ] Run security audit again
- [ ] Update dependencies
- [ ] Review access patterns

**Quarterly:**
- [ ] Full penetration testing
- [ ] Security training for team
- [ ] Backup restoration test

---

## Sign-Off

- [ ] Project Manager: ___________  Date: _______
- [ ] Security Reviewer: ___________  Date: _______
- [ ] DevOps/Deployment: ___________  Date: _______
- [ ] Project Lead: ___________  Date: _______

