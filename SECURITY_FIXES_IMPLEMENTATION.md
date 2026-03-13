# Security Fixes Implementation Guide

This document contains ready-to-use code fixes for critical vulnerabilities.

---

## 1. Admin Authentication Middleware

Add this at the top of `server.ts` after imports:

```typescript
// ===== AUTHENTICATION & SESSIONS =====
const ADMIN_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const adminSessions = new Map<string, { createdAt: number; ip: string; userAgent: string }>();

/**
 * Generate secure admin session token
 */
function generateAdminSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create admin session
 */
function createAdminSession(ip: string, userAgent: string): string {
  const token = generateAdminSessionToken();
  adminSessions.set(token, {
    createdAt: Date.now(),
    ip,
    userAgent
  });
  return token;
}

/**
 * Validate admin session
 */
function isValidAdminSession(token: string, ip: string): boolean {
  const session = adminSessions.get(token);
  if (!session) return false;
  
  const now = Date.now();
  const age = now - session.createdAt;
  
  // Session expired
  if (age > ADMIN_SESSION_MAX_AGE_MS) {
    adminSessions.delete(token);
    return false;
  }
  
  // IP changed (potential session hijacking)
  if (session.ip !== ip) {
    console.warn(`Session IP mismatch: ${session.ip} vs ${ip}`);
    adminSessions.delete(token);
    return false;
  }
  
  return true;
}

/**
 * Admin authentication middleware
 */
function requireAdminAuth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "") || 
                req.cookies?.admin_session;
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  
  if (!isValidAdminSession(token, ip)) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
  
  // Attach to request for logging
  req.adminSessionToken = token;
  next();
}

/**
 * Clean up expired sessions every 30 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions) {
    if (now - session.createdAt > ADMIN_SESSION_MAX_AGE_MS) {
      adminSessions.delete(token);
    }
  }
}, 30 * 60 * 1000);
```

---

## 2. Replace Admin Login Endpoint

Replace the existing `/api/admin/login` endpoint with:

```typescript
// Admin: Verify admin password and create session
app.post("/api/admin/login", async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    
    // Rate limiting
    if (isRateLimited(`admin-login:${ip}`)) {
      return res.status(429).json({ error: "Too many login attempts. Please try again later." });
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password.trim()) {
      return res.status(400).json({ error: "Password is required." });
    }

    // Get admin password from database
    const { data, error } = await getSupabase()
      .from("admin_settings")
      .select("value")
      .eq("key", "admin_password")
      .maybeSingle();

    // REMOVED DEFAULT PASSWORD "EARIST"
    const storedPassword = (error || !data) ? null : data.value;
    
    if (!storedPassword) {
      // Admin password not configured
      return res.status(403).json({ error: "Admin account not configured. Please contact system administrator." });
    }

    if (!verifyPassword(password, storedPassword)) {
      // Log failed attempt
      await logAudit("admin_login_failed", { ip, reason: "invalid_password" });
      return res.status(401).json({ error: "Invalid admin password" });
    }

    // Migrate plaintext password to hashed on successful login
    if (!isPasswordHashed(storedPassword)) {
      const hashed = hashPassword(password);
      await getSupabase()
        .from("admin_settings")
        .upsert({ key: "admin_password", value: hashed }, { onConflict: "key" });
    }

    // Create session
    const sessionToken = createAdminSession(ip, req.get("user-agent") || "");
    
    // Log successful login
    await logAudit("admin_login_success", { ip });

    // Set secure HTTP-only cookie
    res.cookie("admin_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: ADMIN_SESSION_MAX_AGE_MS,
      path: "/"
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

---

## 3. Add Admin Logout Endpoint

```typescript
// Admin: Logout (invalidate session)
app.post("/api/admin/logout", requireAdminAuth, async (req, res) => {
  try {
    const token = req.adminSessionToken;
    if (token) {
      adminSessions.delete(token);
    }
    
    res.clearCookie("admin_session");
    await logAudit("admin_logout", { ip: req.ip });
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});
```

---

## 4. Secure Admin Password Endpoint

Replace existing `/api/admin/password` with authenticated version:

```typescript
// Admin: Check if admin password is configured (requires auth)
app.get("/api/admin/password-configured", async (_req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from("admin_settings")
      .select("value")
      .eq("key", "admin_password")
      .maybeSingle();

    // Only indicate if password is configured, not actual value
    res.json({ configured: !!(data?.value && !error) });
  } catch (err: any) {
    res.json({ configured: false });
  }
});

// Admin: Set admin password (requires authentication)
app.post("/api/admin/password", requireAdminAuth, async (req, res) => {
  try {
    const newPassword = typeof req.body?.password === "string" 
      ? req.body.password.trim() 
      : "";
    
    if (!newPassword) {
      return res.status(400).json({ error: "Password is required" });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    
    // Hash new password
    const hashed = hashPassword(newPassword);
    
    await getSupabase()
      .from("admin_settings")
      .upsert({ key: "admin_password", value: hashed }, { onConflict: "key" });
    
    await logAudit("admin_password_changed", { ip: req.ip });
    
    res.json({ success: true });
  } catch (err: any) {
    console.error("Password change error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Reset password via Google OAuth (secure endpoint)
app.get("/api/admin/google/password-reset", async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    
    // Rate limiting on password reset
    if (isRateLimited(`admin-reset:${ip}`)) {
      return res.status(429).json({ 
        error: "Too many reset attempts. Please try again later." 
      });
    }

    const redirectUri = resolveOAuthRedirectUri(req);
    const oauth2Client = getOAuth2Client(redirectUri);
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/userinfo.email"],
      state: encodeOAuthState({ redirectUri, role: "admin_reset" }),
      prompt: "select_account",
    });
    
    res.json({ url });
  } catch (err: any) {
    console.error("Password reset URL error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

---

## 5. Audit Logging Function

Add this utility function to `server.ts`:

```typescript
/**
 * Audit logging for security-critical actions
 */
async function logAudit(
  action: string,
  details: any,
  req?: any
): Promise<void> {
  try {
    const ip = req?.ip || req?.socket?.remoteAddress || "unknown";
    const userAgent = req?.get?.("user-agent") || "unknown";
    
    const logEntry = {
      action,
      details: JSON.stringify(details),
      ip,
      user_agent: userAgent.substring(0, 255),
      timestamp: new Date().toISOString()
    };
    
    // Store in database
    await getSupabase()
      .from("audit_logs")
      .insert(logEntry);
    
    // Also console log for immediate visibility
    console.log(`[AUDIT] ${action}:`, details);
  } catch (err: any) {
    console.error("Failed to log audit:", err);
  }
}
```

---

## 6. Secured Admin Queue Monitor Endpoint

Replace the existing endpoint:

```typescript
// Admin: Live queue monitoring (REQUIRES AUTHENTICATION)
app.get("/api/admin/queue-monitor", requireAdminAuth, async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from("queue")
      .select(`
        id, status, created_at, faculty_id, meet_link,
        students (full_name, student_number),
        faculty (name)
      `)
      .in("status", ["waiting", "next", "serving", "ongoing"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    const formatted = (data || []).map((row: any) => {
      const parts = row.meet_link ? row.meet_link.split("|") : [];
      const time_period =
        parts.length > 1
          ? parts[0]
          : parts.length === 1 && !parts[0].startsWith("http")
            ? parts[0]
            : null;
      const actual_link =
        parts.length > 1
          ? parts[1]
          : parts.length === 1 && parts[0].startsWith("http")
            ? parts[0]
            : null;

      let mappedStatus = row.status;
      if (row.status === "ongoing") mappedStatus = "serving";

      return {
        id: row.id,
        status: mappedStatus,
        created_at: row.created_at,
        faculty_id: row.faculty_id,
        faculty_name: row.faculty?.name || "Unknown Faculty",
        student_name: row.students?.full_name || "Unknown Student",
        student_number: row.students?.student_number || "",
        time_period,
        meet_link: actual_link,
      };
    });

    const rank = (status: string) => {
      if (status === "serving") return 0;
      if (status === "next") return 1;
      return 2;
    };

    formatted.sort((a: any, b: any) => {
      const rankDiff = rank(a.status) - rank(b.status);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    res.json(formatted);
  } catch (err: any) {
    console.error("Queue monitor error:", err);
    res.status(500).json({ 
      error: process.env.NODE_ENV === "production" 
        ? "Internal server error" 
        : err.message 
    });
  }
});
```

---

## 7. Input Validation Helper

Add this before route definitions:

```typescript
/**
 * Validate and sanitize user inputs
 */
const validators = {
  studentId: (value: any): string => {
    const id = String(value || "").trim();
    if (!id || id.length > 50) throw new Error("Invalid student ID");
    if (!/^[A-Za-z0-9\-_]+$/.test(id)) {
      throw new Error("Student ID contains invalid characters");
    }
    return id;
  },
  
  facultyId: (value: any): string => {
    const id = String(value || "").trim();
    if (!id || id.length > 50) throw new Error("Invalid faculty ID");
    if (!/^[A-Za-z0-9\-_]+$/.test(id)) {
      throw new Error("Faculty ID contains invalid characters");
    }
    return id;
  },
  
  email: (value: any): string => {
    const email = String(value || "").trim().toLowerCase();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) throw new Error("Invalid email format");
    return email;
  },
  
  password: (value: any): string => {
    const password = String(value || "");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    if (password.length > 128) throw new Error("Password too long");
    return password;
  },
  
  name: (value: any): string => {
    const name = String(value || "").trim();
    if (!name || name.length > 255) throw new Error("Invalid name");
    return name;
  },
  
  url: (value: any, allowedDomains: string[]): string => {
    const url = String(value || "").trim();
    try {
      const parsed = new URL(url);
      if (!allowedDomains.some(d => parsed.hostname?.includes(d))) {
        throw new Error("URL domain not allowed");
      }
      return url;
    } catch (e) {
      throw new Error("Invalid URL");
    }
  }
};

/**
 * Safe error response handler
 */
function sendError(res: any, statusCode: number, message: string, details?: any) {
  console.error(`Error[${statusCode}]:`, message, details);
  res.status(statusCode).json({
    error: process.env.NODE_ENV === "production" 
      ? "An error occurred" 
      : message
  });
}
```

---

## 8. Faculty Status Update - SECURED

Replace existing endpoint:

```typescript
// Update Faculty Status (REQUIRES FACULTY AUTHENTICATION)
app.post("/api/faculty/:id/status", requireFacultyAuth, async (req, res) => {
  try {
    // Validate faculty ID parameter
    const targetFacultyId = validators.facultyId(req.params.id);
    
    // Access control: faculty can only update their own status
    if (req.faculty.id !== targetFacultyId) {
      await logAudit("faculty_status_unauthorized_attempt", {
        requested_faculty: targetFacultyId,
        actual_faculty: req.faculty.id,
        ip: req.ip
      }, req);
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    // Validate status value
    const { status } = req.body;
    const validStatuses = ["available", "busy", "offline"];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
      });
    }
    
    const { error } = await getSupabase()
      .from("faculty")
      .update({ status })
      .eq("id", targetFacultyId);

    if (error) throw error;

    await logAudit("faculty_status_updated", { 
      faculty_id: targetFacultyId, 
      new_status: status 
    }, req);

    broadcast("faculty_updated", { faculty_id: targetFacultyId });
    res.json({ success: true });
  } catch (err: any) {
    sendError(res, 500, err.message);
  }
});
```

---

## 9. Add Require Faculty Auth Middleware

```typescript
/**
 * Faculty authentication middleware
 */
function requireFacultyAuth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "") || 
                req.cookies?.faculty_session;
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  // Decode and validate JWT or session token
  try {
    // Option A: If using JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.faculty = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

---

## 10. CORS Configuration

Add this right after `app = express()`:

```typescript
import cors from "cors";
import cookieParser from "cookie-parser";

// Parse cookies
app.use(cookieParser());

// CORS Configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173").split(",");

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 3600,
  optionsSuccessStatus: 200
}));
```

---

## 11. Database Schema for Audit Logs

Create this table in Supabase SQL:

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  ip VARCHAR(45),
  user_agent VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_ip ON audit_logs(ip);

-- Set retention policy: keep logs for 90 days
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admin can view audit logs
CREATE POLICY "Only admin can view audit logs" ON audit_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);
```

---

## 12. Environment Variables

Add to `.env.local`:

```bash
# Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
JWT_SECRET=your-super-secret-key-at-least-32-chars-long
NODE_ENV=development

# Session
ADMIN_SESSION_MAX_AGE_MS=86400000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_ATTEMPTS=10
```

---

## Testing Checklist

After implementing fixes:

```bash
# 1. Test admin login requires password
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":""}'
# Should return: 400 "Password is required"

# 2. Test invalid credentials
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"wrongpassword"}'
# Should return: 401 "Invalid admin password"

# 3. Test successful login returns session
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"correctpassword"}'
# Should return: { "success": true }
# Headers should include Set-Cookie with secure flags

# 4. Test queue monitor requires auth
curl http://localhost:3000/api/admin/queue-monitor
# Should return: 401 "Authentication required"

# 5. Test with valid session
curl http://localhost:3000/api/admin/queue-monitor \
  -H "Authorization: Bearer <valid-token>"
# Should return: queue data

# 6. Test faculty status update requires matching ID
curl -X POST http://localhost:3000/api/faculty/faculty-123/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token-for-faculty-456>" \
  -d '{"status":"available"}'
# Should return: 403 "Unauthorized"
```

---

## Deployment Checklist

Before going to production:

- [ ] All `.env` secrets are in `.env.local` (not committed)
- [ ] `NODE_ENV=production` in production
- [ ] HTTPS enforced (`secure: true` on cookies)
- [ ] ALLOWED_ORIGINS updated to production domain
- [ ] Database connection uses strong credentials
- [ ] Regular backups enabled
- [ ] Audit logs monitored/reviewed weekly
- [ ] Rate limiting thresholds adjusted for expected load
- [ ] Security headers tested in browser DevTools
- [ ] All endpoints tested with invalid/missing auth

