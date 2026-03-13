# Security Audit Report - Consultation System

**Date:** 2024  
**Severity:** CRITICAL - Production deployment not recommended until issues are resolved  
**Status:** Multiple critical vulnerabilities identified

---

## Executive Summary

The consultation system has **12+ critical security vulnerabilities** that could allow unauthorized access to sensitive data, account takeover, and data manipulation. This audit identifies each issue with severity, impact, and recommended fixes.

---

## 🔴 CRITICAL Issues (Fix Immediately)

### 1. **Missing Authentication on Admin Endpoints - CRITICAL**

**Location:** [server.ts](server.ts#L1092-L1120)  
**Issue:** Admin password endpoints lack authentication checks before allowing password modifications.

```typescript
// VULNERABLE - No auth check before password change
app.post("/api/admin/password", async (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";
  // ... updates admin password directly without any auth
});
```

**Impact:** Any user can SET/RESET admin password without credentials.

**Fix:** Implement admin authentication middleware:

```typescript
// Add authentication middleware
const isAdminAuthenticated = (req: any, res: any, next: any) => {
  const adminToken = req.headers.authorization?.replace("Bearer ", "");
  if (!adminToken || !isValidAdminSession(adminToken)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Use middleware on protected routes
app.post("/api/admin/password", isAdminAuthenticated, async (req, res) => {
  // ... password change logic
});
```

---

### 2. **No Authentication on /api/admin/queue-monitor - CRITICAL**

**Location:** [server.ts](server.ts#L1546-L1600)  
**Issue:** Queue monitoring endpoint returns allstudent names and consultation details without authentication.

```typescript
// VULNERABLE - No auth, exposes all student consultation data
app.get("/api/admin/queue-monitor", async (req, res) => {
  // Returns full queue with student names, emails, meeting links
```

**Impact:** **FERPA/Privacy violation** - Anyone can access all student consultation details.

**Fix:**

```typescript
app.get("/api/admin/queue-monitor", isAdminAuthenticated, async (req, res) => {
  // ... existing logic
});
```

---

### 3. **Unauthenticated Faculty Route Updates - CRITICAL**

**Location:** [server.ts](server.ts#L1520-L1545)  
**Issue:** Faculty status and profile endpoints have no auth checks:

```typescript
// VULNERABLE - No auth check
app.post("/api/faculty/:id/status", async (req, res) => {
  const { status } = req.body;
  // Any user can mark any faculty as busy/available
});

// VULNERABLE - No auth check
app.patch("/api/faculty/:id", async (req, res) => {
  // Any user can modify any faculty profile
});
```

**Impact:** Service disruption, account impersonation, data tampering.

**Fix:** Require authentication:

```typescript
app.post("/api/faculty/:id/status", requireAuth, async (req, res) => {
  // Verify requesting faculty matches :id parameter
  if (req.faculty.id !== req.params.id) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  // ...
});
```

---

### 4. **Default Admin Credentials Present - CRITICAL**

**Location:** [server.ts](server.ts#L1069)  
**Issue:** Code contains default password "EARIST":

```typescript
const storedPassword = (error || !data) ? "EARIST" : data.value;
if (!verifyPassword(password, storedPassword)) {
```

**Impact:** Default credentials allow unauthorized admin access if database is empty.

**Fix:** Remove default, require explicit setup:

```typescript
const storedPassword = (error || !data) ? null : data.value;
if (!storedPassword) {
  return res.status(403).json({ error: "Admin account not configured" });
}
```

---

### 5. **No Admin Session/Token Management - CRITICAL**

**Location:** [server.ts](server.ts#L1058-L1085)  
**Issue:** Admin login returns only `{ success: true }` with NO token/session:

```typescript
// VULNERABLE - No session/token returned
app.post("/api/admin/login", async (req, res) => {
  // ... validates password
  res.json({ success: true });
});
```

**Impact:** Frontend can't validate admin status; anyone can fabricate admin requests.

**Fix:** Implement session tokens:

```typescript
app.post("/api/admin/login", async (req, res) => {
  // ... password validation
  const sessionToken = crypto.randomBytes(32).toString("hex");
  adminSessions.set(sessionToken, {
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  });
  
  res.cookie("admin_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    maxAge: 24 * 60 * 60 * 1000
  });
  
  res.json({ success: true });
});
```

---

### 6. **Information Disclosure: Admin Password Check - CRITICAL**

**Location:** [server.ts](server.ts#L1076-L1090)  
**Issue:** Endpoint reveals if admin password is set (status 200 either way):

```typescript
app.get("/api/admin/password", async (_req, res) => {
  const { data } = await getSupabase().from("admin_settings")...;
  res.json({ hasPassword: !!(data?.value && !error) }); // Reveals config state
});
```

**Impact:** Attackers can probe system configuration.

**Fix:** Make endpoint require auth OR randomize response:

```typescript
app.get("/api/admin/password", isAdminAuthenticated, async (_req, res) => {
  // Return whether current admin session is valid
  res.json({ authenticated: true });
});
```

---

### 7. **No Rate Limiting on Admin Reset/Password - CRITICAL**

**Location:** [server.ts](server.ts#L1039-L1055) and [server.ts](server.ts#L1000-L1020)  
**Issue:** OAuth password reset endpoint has no rate limiting:

```typescript
app.get("/api/admin/google/password-reset", (req, res) => {
  // No rate limiting - can spam reset emails
  const url = oauth2Client.generateAuthUrl({...});
  res.json({ url });
});
```

**Impact:** Account takeover via email spam/timing attack.

**Fix:** Add rate limiting:

```typescript
const adminResetAttempts = new Map();

function isAdminResetRateLimited(ip: string): boolean {
  const key = `admin-reset:${ip}`;
  return isRateLimited(key); // Reuse existing rate limit logic
}

app.get("/api/admin/google/password-reset", (req, res) => {
  const ip = req.ip;
  if (isAdminResetRateLimited(ip)) {
    return res.status(429).json({ error: "Too many reset attempts. Try again later." });
  }
  // ... generate reset URL
});
```

---

### 8. **API Queue Operations Unauthenticated - HIGH**

**Location:** [server.ts](server.ts#L1400-L1500)  
**Issue:** Queue join/update endpoints have minimal validation:

```typescript
app.post("/api/queue/join", async (req, res) => {
  // No auth - any user can join any student to queue
  const { student_id, faculty_id } = req.body;
  // Directly inserts without validation of who's requesting
});
```

**Impact:** Students can manipulate other students' queue positions.

**Fix:**

```typescript
app.post("/api/queue/join", requireStudentAuth, async (req, res) => {
  const student_id = req.student.id; // From auth token, not request body
  const { faculty_id } = req.body;
  // ...
});
```

---

### 9. **Sensitive Data in Error Messages - HIGH**

**Location:** Multiple endpoints  
**Issue:** Database errors exposed in responses:

```typescript
} catch (err: any) {
  res.status(500).json({ error: err.message }); // Full DB error exposed
}
```

**Impact:** Attackers learn database structure, column names, and schema details.

**Fix:** Sanitize errors in production:

```typescript
} catch (err: any) {
  console.error("Database error:", err);
  res.status(500).json({ 
    error: process.env.NODE_ENV === "production" 
      ? "Internal server error" 
      : err.message 
  });
}
```

---

## 🟠 HIGH Severity Issues

### 10. **No Input Validation/Sanitization - HIGH**

**Location:** Multiple endpoints  
**Issue:** Direct parameter usage without validation:

```typescript
// VULNERABLE - No validation on req.params.id
app.get("/api/students/:id", async (req, res) => {
  const { data } = await getSupabase()
    .from("students")
    .select("*")
    .eq("student_number", req.params.id);
});
```

**Impact:** SQL injection (though Supabase ORM mitigates), but also invalid data states.

**Fix:**

```typescript
app.get("/api/students/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  
  // Validate format
  if (!id || !/^[A-Za-z0-9\-_]{1,50}$/.test(id)) {
    return res.status(400).json({ error: "Invalid student ID format" });
  }
  
  const { data } = await getSupabase()
    .from("students")
    .select("*")
    .eq("student_number", id);
});
```

---

### 11. **No CORS Configuration - HIGH**

**Location:** [server.ts](server.ts#L395-410)  
**Issue:** No explicit CORS policy; uses default or wide-open:

```typescript
// Missing explicit CORS config
app.use(express.json({ limit: "1mb" }));
```

**Impact:** Cross-site request forgery, unauthorized API calls from other domains.

**Fix:**

```typescript
import cors from "cors";

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 3600
}));
```

---

### 12. **Timing Attack Vulnerability in Password Comparison - HIGH**

**Location:** [server.ts](server.ts#L163-174)  
**Issue:** Password comparison uses `crypto.timingSafeEqual` for hashed passwords BUT plaintext comparison for legacy passwords:

```typescript
function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith(HASH_PREFIX)) {
    // Uses timingSafeEqual - GOOD
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), derived);
  }
  // Legacy plaintext - TIMING ATTACK VULNERABLE
  return password === stored;  // Direct string comparison
}
```

**Impact:** Timing attack can leak password character-by-character.

**Fix:**

```typescript
function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith(HASH_PREFIX)) {
    const parts = stored.slice(HASH_PREFIX.length).split("$");
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION,
    });
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), derived);
  }
  
  // Always use timing-safe comparison, even for legacy
  const timing = crypto.timingSafeEqual(
    Buffer.from(password),
    Buffer.from(stored)
  );
  return timing;
}
```

---

## 🟡 MEDIUM Severity Issues

### 13. **No CSRF Token Protection - MEDIUM**

**Location:** State encoding present but token not validated  
**Issue:** POST requests have no CSRF token validation:

```typescript
app.post("/api/admin/password", async (req, res) => {
  // No CSRF token check
});
```

**Fix:** Add CSRF middleware:

```typescript
const csrf = require("csurf");
const cookieParser = require("cookie-parser");

app.use(cookieParser());
app.use(csrf({ cookie: true }));

// On admin page, include token in forms
app.get("/admin", (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Validate on POST
app.post("/api/admin/password", csrfProtection, async (req, res) => {
  // ...
});
```

---

### 14. **Hardcoded Upload Limits Without User Feedback - MEDIUM**

**Location:** [server.ts](server.ts#L35)  
**Issue:** 100MB upload limit with generic error:

```typescript
upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed."));
    }
  }
});
```

**Impact:** Potential DoS attacks, no user-friendly error messages.

**Fix:**

```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = ALLOWED_UPLOAD_MIMETYPES;

upload = multer({
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      const error = new Error(
        `File type not allowed. Allowed types: ${ALLOWED_TYPES.join(", ")}`
      );
      cb(error);
    } else {
      cb(null, true);
    }
  }
});

// Add error handler
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      });
    }
  }
  next(err);
});
```

---

### 15. **No Audit Logging - MEDIUM**

**Location:** All endpoints  
**Issue:** Admin actions not logged (password changes, user modifications, etc.)

**Impact:** Compliance violations, unable to detect unauthorized changes.

**Fix:**

```typescript
// Add audit logging utility
async function logAudit(action: string, details: any, adminId?: string) {
  try {
    await getSupabase().from("audit_logs").insert({
      action,
      details: JSON.stringify(details),
      admin_id: adminId,
      timestamp: new Date().toISOString(),
      ip: details.ip || "unknown"
    });
  } catch (err) {
    console.error("Audit logging failed:", err);
  }
}

// Use in password change:
app.post("/api/admin/password", isAdminAuthenticated, async (req, res) => {
  // ... change password
  await logAudit("admin_password_change", { email }, adminId);
});
```

---

## 🔵 LOW Severity Issues

### 16. **Missing Security Headers - LOW**

**Location:** [server.ts](server.ts#L395-410)  
**Issue:** Some security headers present but incomplete:

```typescript
// Missing:
// - Strict-Transport-Security
// - Expect-CT
// - X-Content-Security-Policy (older browsers)
```

**Fix:**

```typescript
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY"); // or "SAMEORIGIN"
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Content-Security-Policy", 
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: ws: https:; frame-src https://meet.google.com; font-src 'self' data:;"
  );
  next();
});
```

---

## 📋 Remediation Priority

| Priority | Issue | Estimated Fix Time |
|----------|-------|-------------------|
| **P0 - Fix Now** | Missing auth on admin endpoints | 4 hours |
| **P0 - Fix Now** | Default credentials "EARIST" | 1 hour |
| **P0 - Fix Now** | No session/token management | 4 hours |
| **P1 - High** | Queue endpoint authentication | 3 hours |
| **P1 - High** | Input validation | 6 hours |
| **P1 - High** | CORS configuration | 2 hours |
| **P2 - Medium** | Audit logging | 4 hours |
| **P2 - Medium** | CSRF protection | 3 hours |
| **P3 - Low** | Security headers refinement | 1 hour |

---

## ✅ Verification Checklist

After applying fixes, verify:

- [ ] Admin endpoints require valid authentication
- [ ] No default credentials hardcoded
- [ ] All POST/PATCH/DELETE endpoints validate user identity
- [ ] Database errors never exposed to clients
- [ ] Rate limiting active on login/reset endpoints
- [ ] CORS headers restrict to allowed origins
- [ ] CSRF tokens required on state-changing operations
- [ ] Input validation on all user-supplied parameters
- [ ] Audit logs record all sensitive actions
- [ ] Password comparison uses timing-safe functions
- [ ] Security headers properly configured
- [ ] HTTPS enforced in production
- [ ] Session cookies have `HttpOnly`, `Secure`, `SameSite` flags
- [ ] No secrets in source code

---

## 🔐 Recommended Next Steps

1. **Immediate (Today):** Fix authentication middleware on all admin endpoints
2. **Short-term (This week):** Implement session management and remove default credentials
3. **Medium-term (This sprint):** Add comprehensive input validation and audit logging
4. **Long-term:** Implement OAuth2 for production, consider API key management

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/security/)
- [Supabase Security](https://supabase.com/docs/guides/auth)

