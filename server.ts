import express from "express";
import cookieParser from "cookie-parser";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import crypto from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import sgMail from "@sendgrid/mail";
import { google } from "googleapis";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import { Readable } from "stream";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const rawAppDataDir = process.env.APP_DATA_DIR?.trim() || "";
const appDataDirFromEnv =
  (rawAppDataDir.startsWith('"') && rawAppDataDir.endsWith('"')) ||
  (rawAppDataDir.startsWith("'") && rawAppDataDir.endsWith("'"))
    ? rawAppDataDir.slice(1, -1)
    : rawAppDataDir;
const APP_DATA_DIR = appDataDirFromEnv ? path.resolve(appDataDirFromEnv) : process.cwd();
const UPLOADS_DIR = path.join(APP_DATA_DIR, "uploads");

if (!fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_UPLOAD_MIMETYPES = [
  "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav",
  "audio/x-wav", "audio/aac", "video/webm", "application/octet-stream",
];
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed."));
    }
  },
});

const TOKEN_PATH = path.join(APP_DATA_DIR, "drive-tokens.json");
const FACULTY_GOOGLE_TOKENS_PATH = path.join(APP_DATA_DIR, "faculty-google-tokens.json");
const TOKEN_MAX_AGE_DAYS = 30;
const OAUTH_CALLBACK_PATH = '/api/auth/google/callback';
const LEGACY_OAUTH_CALLBACK_PATH = '/auth/callback';
const GOOGLE_DRIVE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_MEET_CREATE_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
const GOOGLE_USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
const GOOGLE_OAUTH_SCOPES = [GOOGLE_DRIVE_UPLOAD_SCOPE, GOOGLE_MEET_CREATE_SCOPE];

type AdminDriveAuthData = {
  tokens: any;
  timestamp: number;
  redirectUri?: string;
};

type AdminOAuthStatus = {
  data: AdminDriveAuthData | null;
  expired: boolean;
  expiresAt: string | null;
};

type FacultyGoogleAuthData = {
  tokens: any;
  redirectUri?: string;
  email?: string | null;
  timestamp: number;
};

type FacultyGoogleAuthStore = Record<string, FacultyGoogleAuthData>;

type GoogleServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

const unwrapEnvValue = (value?: string) => {
  if (!value) return "";
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )
    ? trimmed.slice(1, -1)
    : trimmed;
};

const SUPABASE_RECORDINGS_BUCKET =
  unwrapEnvValue(process.env.SUPABASE_RECORDINGS_BUCKET) || "consultation-recordings";
const SUPABASE_RECORDINGS_PREFIX =
  (unwrapEnvValue(process.env.SUPABASE_RECORDINGS_PREFIX) || "recordings").replace(/^\/+|\/+$/g, "");
const parsedRecordingRetentionHours = Number.parseInt(
  unwrapEnvValue(process.env.SUPABASE_RECORDINGS_RETENTION_HOURS),
  10
);
const SUPABASE_RECORDINGS_RETENTION_HOURS =
  Number.isFinite(parsedRecordingRetentionHours) && parsedRecordingRetentionHours > 0
    ? parsedRecordingRetentionHours
    : 48;
const APP_TIMEZONE = unwrapEnvValue(process.env.APP_TIMEZONE) || "Asia/Manila";

const normalizeEmail = (value: unknown) => (
  typeof value === "string" ? value.trim().toLowerCase() : ""
);

// --- Password Hashing Utilities ---
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const HASH_PREFIX = "$scrypt$";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION,
  });
  return `${HASH_PREFIX}${salt}$${derived.toString("hex")}`;
}

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
  // Legacy plaintext comparison (will be migrated on next login)
  return password === stored;
}

function isPasswordHashed(stored: string): boolean {
  return stored.startsWith(HASH_PREFIX);
}

// --- Rate Limiting ---
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 10;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

// Clean up stale rate limit entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(key);
  }
}, 30 * 60 * 1000);

// ===== ADMIN SESSION MANAGEMENT =====
const ADMIN_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const adminSessions = new Map<string, { createdAt: number; ip: string; userAgent: string }>();

function generateAdminSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function createAdminSession(ip: string, userAgent: string): string {
  const token = generateAdminSessionToken();
  adminSessions.set(token, { createdAt: Date.now(), ip, userAgent });
  return token;
}

function isValidAdminSession(token: string, ip: string): boolean {
  const session = adminSessions.get(token);
  if (!session) return false;
  
  const now = Date.now();
  const age = now - session.createdAt;
  
  if (age > ADMIN_SESSION_MAX_AGE_MS) {
    adminSessions.delete(token);
    return false;
  }
  
  // For localhost/development, skip strict IP validation to allow requests from different interfaces
  const isLocalhost = ip === "127.0.0.1" || ip === "::1" || ip === "localhost" ||
                      session.ip === "127.0.0.1" || session.ip === "::1" || session.ip === "localhost";
  
  // For production on Render/other cloud providers with proxy/load balancers, 
  // IPs will differ. Only validate in strict development environments.
  const isProduction = process.env.NODE_ENV === "production";
  
  if (!isLocalhost && !isProduction && session.ip !== ip) {
    console.warn(`Session IP mismatch: ${session.ip} vs ${ip}`);
    adminSessions.delete(token);
    return false;
  }
  
  return true;
}

function requireAdminAuth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.admin_session;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!isValidAdminSession(token, ip)) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
  
  req.adminSessionToken = token; // Add custom property to request
  next();
}

// Clean up expired sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions) {
    if (now - session.createdAt > ADMIN_SESSION_MAX_AGE_MS) {
      adminSessions.delete(token);
    }
  }
}, 30 * 60 * 1000);

// ===== AUDIT LOGGING =====
async function logAudit(action: string, details: any, req?: any): Promise<void> {
  try {
    const ip = req?.ip || req?.socket?.remoteAddress || "unknown";
    const userAgent = req?.get?.("user-agent") || "unknown";
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      action,
      details,  // Pass as object, Supabase will convert to JSONB
      ip,
      user_agent: userAgent.substring(0, 255),
      timestamp
    };
    
    try {
      await getSupabase()
        .from("audit_logs")
        .insert(logEntry);
    } catch (insertErr: any) {
      console.warn("Failed to insert audit log:", insertErr?.message || String(insertErr));
      // Table might not exist yet, fail silently
    }
    
    console.log(`[AUDIT] ${action}:`, details);
  } catch (err: any) {
    console.error("Failed to log audit:", err.message);
  }
}

function getServiceAccountCredentialsFromEnv(): GoogleServiceAccountCredentials | null {
  const credentialsFilePath = unwrapEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
  if (credentialsFilePath) {
    try {
      const fromFile = JSON.parse(fs.readFileSync(credentialsFilePath, "utf-8"));
      if (typeof fromFile.client_email === "string" && typeof fromFile.private_key === "string") {
        return {
          client_email: fromFile.client_email,
          private_key: fromFile.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch (err) {
      console.error("Failed to load GOOGLE_SERVICE_ACCOUNT_FILE:", err);
    }
  }

  const rawJson = unwrapEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  if (rawJson) {
    const candidates = [rawJson];
    if (!rawJson.startsWith("{")) {
      try {
        candidates.push(Buffer.from(rawJson, "base64").toString("utf-8"));
      } catch {
        // Ignore invalid base64 candidate and continue.
      }
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed.client_email === "string" && typeof parsed.private_key === "string") {
          return {
            client_email: parsed.client_email,
            private_key: parsed.private_key.replace(/\\n/g, "\n"),
          };
        }
      } catch {
        // Ignore malformed JSON and continue.
      }
    }
  }

  const clientEmail = unwrapEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = unwrapEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: privateKey,
    };
  }

  return null;
}

function getMeetDelegatedUserFromEnv() {
  return unwrapEnvValue(
    process.env.GOOGLE_MEET_DELEGATED_USER ||
    process.env.GOOGLE_WORKSPACE_DELEGATED_USER ||
    process.env.GOOGLE_DELEGATED_USER_EMAIL
  );
}

function readStoredAdminDriveAuthData(): AdminDriveAuthData | null {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')) as AdminDriveAuthData;
  } catch (e) {
    return null;
  }
}

function getAdminOAuthStatus(): AdminOAuthStatus {
  const data = readStoredAdminDriveAuthData();
  if (!data) {
    return { data: null, expired: false, expiresAt: null };
  }

  const expiresAtMs = data.timestamp + TOKEN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const expired = Date.now() > expiresAtMs;

  return {
    data: expired ? null : data,
    expired,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

function getAdminTokens() {
  return getAdminOAuthStatus().data?.tokens || null;
}

function getAdminRedirectUri() {
  return getAdminOAuthStatus().data?.redirectUri || null;
}

function saveAdminTokens(tokens: any, redirectUri: string) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({
    tokens,
    timestamp: Date.now(),
    redirectUri
  }));
}

function readStoredFacultyGoogleAuthData(): FacultyGoogleAuthStore {
  if (!fs.existsSync(FACULTY_GOOGLE_TOKENS_PATH)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(FACULTY_GOOGLE_TOKENS_PATH, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as FacultyGoogleAuthStore;
    }
  } catch (err) {
    console.error("Failed to read faculty Google auth data:", err);
  }

  return {};
}

function writeFacultyGoogleAuthData(store: FacultyGoogleAuthStore) {
  fs.writeFileSync(FACULTY_GOOGLE_TOKENS_PATH, JSON.stringify(store, null, 2));
}

function getFacultyGoogleAuthData(facultyId: string) {
  if (!facultyId) return null;
  const store = readStoredFacultyGoogleAuthData();
  return store[facultyId] || null;
}

function saveFacultyGoogleAuthData(facultyId: string, data: FacultyGoogleAuthData) {
  if (!facultyId) {
    throw new Error("Faculty ID is required to save Google auth data.");
  }

  const store = readStoredFacultyGoogleAuthData();
  store[facultyId] = data;
  writeFacultyGoogleAuthData(store);
}

function deleteFacultyGoogleAuthData(facultyId: string) {
  if (!facultyId) return;

  const store = readStoredFacultyGoogleAuthData();
  if (!(facultyId in store)) {
    return;
  }

  delete store[facultyId];
  if (Object.keys(store).length === 0) {
    if (fs.existsSync(FACULTY_GOOGLE_TOKENS_PATH)) {
      fs.unlinkSync(FACULTY_GOOGLE_TOKENS_PATH);
    }
    return;
  }

  writeFacultyGoogleAuthData(store);
}

let supabaseClient: SupabaseClient | null = null;

// Setup SendGrid
async function setupSendGrid() {
  if (process.env.SENDGRID_API_KEY) {
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      console.log("SendGrid Email Service Initialized Successfully");
    } catch (error: any) {
      console.error("Failed to initialize SendGrid:", error.message);
    }
  } else {
    console.warn("SENDGRID_API_KEY not set. Email notifications will be disabled.");
  }
}
setupSendGrid();

async function sendEmailNotification(to: string, subject: string, html: string) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log("SendGrid not configured. Email skipped.");
    return;
  }
  
  try {
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || "noreply@consultation-system.com";
    const msg = {
      to,
      from: fromEmail,
      subject,
      html,
    };
    
    await sgMail.send(msg);
    console.log(`[Email] Sent to ${to}`);
  } catch (error: any) {
    console.error("Failed to send email:", error.message);
  }
}

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.");
    }
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // WebSocket connection handler
  wss.on("connection", (ws) => {
    console.log("Client connected to WebSocket");
    
    ws.on("close", () => {
      console.log("Client disconnected from WebSocket");
    });

    ws.on("error", (err) => {
      console.error("WebSocket client error:", err);
    });
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.set("trust proxy", 1);

  // --- CORS Configuration ---
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173").split(",").map(o => o.trim()).filter(Boolean);
  
  app.use((req, res, next) => {
    const origin = req.get("origin");
    
    // Check if origin is in allowedOrigins
    const isOriginAllowed = origin && allowedOrigins.some(allowed => {
      // Handle wildcard in environment variable (e.g., "*.onrender.com")
      if (allowed.startsWith("*.")) {
        const domain = allowed.slice(2);
        return origin.endsWith(domain) || origin.includes("." + domain);
      }
      return origin === allowed;
    });
    
    // For production deployment, accept any onrender.com origin for the same app
    const isProductionSelf = process.env.NODE_ENV === "production" && 
                            origin && 
                            origin.includes("onrender.com") && 
                            origin.includes("kiosk-sp2");
    
    if (isOriginAllowed || isProductionSelf || !origin) {
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // --- Security Headers ---
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: ws: https:; frame-src https://meet.google.com; font-src 'self' data:;"
    );
    res.removeHeader("X-Powered-By");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, uptime: Math.floor(process.uptime()) });
  });

  // --- Input Validators ---
  const validators = {
    studentId: (value: any): string => {
      const id = String(value || "").trim();
      if (!id || id.length > 50) throw new Error("Invalid student ID format");
      if (!/^[A-Za-z0-9\-_]+$/.test(id)) throw new Error("Student ID contains invalid characters");
      return id;
    },
    facultyId: (value: any): string => {
      const id = String(value || "").trim();
      if (!id || id.length > 50) throw new Error("Invalid faculty ID");
      if (!/^[A-Za-z0-9\-_]+$/.test(id)) throw new Error("Faculty ID contains invalid characters");
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
    collegeName: (value: any): string => {
      const name = String(value || "").trim();
      if (!name || name.length < 2 || name.length > 255) throw new Error("College name must be 2-255 characters");
      if (!/^[A-Za-z0-9\s\-&(),.']+$/.test(name)) throw new Error("College name contains invalid characters");
      return name;
    },
    collegeCode: (value: any): string => {
      const code = String(value || "").trim().toUpperCase();
      if (!code || code.length < 2 || code.length > 10) throw new Error("College code must be 2-10 characters");
      if (!/^[A-Z0-9\-]+$/.test(code)) throw new Error("College code must be alphanumeric");
      return code;
    },
    deptName: (value: any): string => {
      const name = String(value || "").trim();
      if (!name || name.length < 2 || name.length > 255) throw new Error("Department name must be 2-255 characters");
      if (!/^[A-Za-z0-9\s\-&(),.']+$/.test(name)) throw new Error("Department name contains invalid characters");
      return name;
    },
    deptCode: (value: any): string => {
      const code = String(value || "").trim().toUpperCase();
      if (!code || code.length < 2 || code.length > 10) throw new Error("Department code must be 2-10 characters");
      if (!/^[A-Z0-9\-]+$/.test(code)) throw new Error("Department code must be alphanumeric");
      return code;
    },
    collegeId: (value: any): string => {
      const id = String(value || "").trim();
      if (!id || id.length > 50) throw new Error("Invalid college ID");
      return id;
    },
    departmentId: (value: any): string => {
      const id = String(value || "").trim();
      if (!id || id.length > 50) throw new Error("Invalid department ID");
      return id;
    },
    fileName: (value: any, maxLen: number = 255): string => {
      const name = String(value || "").trim();
      if (!name || name.length > maxLen) throw new Error(`File name too long (max ${maxLen} chars)`);
      if (!/^[A-Za-z0-9\-_\.]+$/.test(name)) throw new Error("File name contains invalid characters");
      return name;
    },
    mimeType: (value: any): string => {
      const mime = String(value || "").trim().toLowerCase();
      if (!mime) throw new Error("MIME type is required");
      // Allow common media types
      if (!/^(audio|video|image)\/[\w\-\.]+$/.test(mime)) {
        throw new Error("Invalid MIME type");
      }
      return mime;
    },
  };

  const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
  
  // Error sanitization helper
  function sendError(res: any, statusCode: number, message: string, details?: any): void {
    if (details) console.error(`Error[${statusCode}]:`, message, details);
    res.status(statusCode).json({
      error: process.env.NODE_ENV === "production" ? "An error occurred" : message
    });
  }
  
  const getQueryString = (value: unknown): string | null => {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
    return null;
  };
  const getBodyString = (value: unknown): string => {
    const stringValue = getQueryString(value);
    return stringValue ? stringValue.trim() : "";
  };
  const getCurrentAppDate = () => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    return formatter.format(new Date());
  };
  const getCurrentAppWeekday = () => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIMEZONE,
      weekday: "long",
    });

    return formatter.format(new Date());
  };
  const fetchLiveQueueSnapshot = async () => {
    const { data, error } = await getSupabase()
      .from("queue")
      .select(`
        id, status, created_at, faculty_id, meet_link,
        students (full_name, student_number),
        faculty (name)
      `)
      .in("status", ["waiting", "serving", "ongoing"])
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
      return 1;
    };

    formatted.sort((a: any, b: any) => {
      const rankDiff = rank(a.status) - rank(b.status);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return formatted;
  };
  const sanitizeDriveFileNamePart = (value: string, fallback: string) => {
    const normalized = value
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return (normalized || fallback).slice(0, 48);
  };
  const buildDriveRecordingFileName = (params: {
    uploadedAt: string;
    facultyName?: string | null;
    studentName?: string | null;
    studentNumber?: string | null;
  }) => {
    const timestampPart = params.uploadedAt.replace(/:/g, "-");
    const facultyPart = sanitizeDriveFileNamePart(params.facultyName || "", "faculty");
    const studentBase = params.studentNumber
      ? `${params.studentNumber}-${params.studentName || ""}`
      : params.studentName || "";
    const studentPart = sanitizeDriveFileNamePart(studentBase, "student");

    return `consultation-audio-${timestampPart}-${facultyPart}-${studentPart}.webm`;
  };
  const sanitizeRecordingTokenPart = (value: string, fallback: string) => {
    const normalized = value
      .trim()
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return (normalized || fallback).slice(0, 96);
  };
  const buildSupabaseRecordingObjectName = (params: {
    uploadedAt: string;
    extension?: string | null;
    consultationId?: string | null;
    facultyId?: string | null;
    studentId?: string | null;
    studentNumber?: string | null;
    facultyName?: string | null;
    studentName?: string | null;
  }) => {
    const safeExtension = sanitizeRecordingTokenPart((params.extension || "webm").replace(/^\.+/, ""), "webm").toLowerCase();
    const timestampPart = params.uploadedAt.replace(/:/g, "-");
    const fileParts = [
      timestampPart,
      `consultation-${sanitizeRecordingTokenPart(params.consultationId || "", "unknown")}`,
      `faculty-${sanitizeRecordingTokenPart(params.facultyId || "", "unknown")}`,
      `student-${sanitizeRecordingTokenPart(params.studentId || "", "unknown")}`,
    ];

    if (params.studentNumber) {
      fileParts.push(`number-${sanitizeRecordingTokenPart(params.studentNumber, "unknown")}`);
    }
    if (params.facultyName) {
      fileParts.push(`facultyname-${sanitizeDriveFileNamePart(params.facultyName, "faculty")}`);
    }
    if (params.studentName) {
      fileParts.push(`studentname-${sanitizeDriveFileNamePart(params.studentName, "student")}`);
    }

    return `${fileParts.join("__")}.${safeExtension}`;
  };
  const buildSupabaseRecordingPath = (objectName: string) =>
    SUPABASE_RECORDINGS_PREFIX ? `${SUPABASE_RECORDINGS_PREFIX}/${objectName}` : objectName;
  const parseSupabaseRecordingObjectName = (objectName: string) => {
    const nameWithoutExtension = objectName.replace(/\.[^.]+$/, "");
    const segments = nameWithoutExtension.split("__");
    const metadata = {
      consultationId: null as string | null,
      facultyId: null as string | null,
      studentId: null as string | null,
      studentNumber: null as string | null,
    };

    for (const segment of segments.slice(1)) {
      if (segment.startsWith("consultation-")) {
        metadata.consultationId = segment.slice("consultation-".length) || null;
      } else if (segment.startsWith("faculty-")) {
        metadata.facultyId = segment.slice("faculty-".length) || null;
      } else if (segment.startsWith("student-")) {
        metadata.studentId = segment.slice("student-".length) || null;
      } else if (segment.startsWith("number-")) {
        metadata.studentNumber = segment.slice("number-".length) || null;
      }
    }

    return metadata;
  };
  const parseSupabaseRecordingTimestamp = (objectName: string) => {
    const timestampSegment = objectName.split("__")[0] || "";
    const normalizedTimestamp = timestampSegment.replace(
      /T(\d{2})-(\d{2})-(\d{2})(\.\d+Z)?$/,
      "T$1:$2:$3$4"
    );
    const parsed = new Date(normalizedTimestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const toAbsoluteSupabaseUrl = (value: string) => {
    if (/^https?:\/\//i.test(value)) return value;
    const baseUrl = trimTrailingSlash(process.env.SUPABASE_URL || "");
    return `${baseUrl}${value.startsWith("/") ? "" : "/"}${value}`;
  };
  const isSupabaseRecordingPath = (value: string) => {
    const normalized = value.replace(/^\/+/, "");
    return SUPABASE_RECORDINGS_PREFIX
      ? normalized.startsWith(`${SUPABASE_RECORDINGS_PREFIX}/`)
      : normalized.length > 0;
  };
  let recordingsBucketReadyPromise: Promise<void> | null = null;
  const ensureSupabaseRecordingsBucket = async () => {
    if (!recordingsBucketReadyPromise) {
      recordingsBucketReadyPromise = (async () => {
        const supabase = getSupabase();
        const { data: bucket, error: getBucketError } = await supabase.storage.getBucket(SUPABASE_RECORDINGS_BUCKET);
        const bucketMissing =
          !bucket &&
          (!getBucketError || /not found|not exist|does not exist/i.test(getBucketError.message || ""));

        if (getBucketError && !bucketMissing) {
          throw getBucketError;
        }

        if (bucketMissing) {
          const { error: createBucketError } = await supabase.storage.createBucket(SUPABASE_RECORDINGS_BUCKET, {
            public: false,
          });
          if (createBucketError && !/already exists/i.test(createBucketError.message || "")) {
            throw createBucketError;
          }
        }
      })().catch((err) => {
        recordingsBucketReadyPromise = null;
        throw err;
      });
    }

    return recordingsBucketReadyPromise;
  };
  const normalizeOAuthRedirectUri = (value: string) => {
    const trimmed = value.trim();
    const cleaned =
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
        ? trimmed.slice(1, -1)
        : trimmed;
    try {
      const parsed = new URL(cleaned);
      const normalizedPath = parsed.pathname.replace(/\/+$/, "");

      if (normalizedPath === "" || normalizedPath === "/") {
        parsed.pathname = OAUTH_CALLBACK_PATH;
      } else if (normalizedPath === LEGACY_OAUTH_CALLBACK_PATH) {
        parsed.pathname = OAUTH_CALLBACK_PATH;
      } else {
        parsed.pathname = normalizedPath;
      }

      return parsed.toString();
    } catch {
      return cleaned;
    }
  };
  const resolveOAuthRedirectUri = (req?: express.Request) => {
    const explicitRedirect =
      process.env.GOOGLE_REDIRECT_URI ||
      process.env.GOOGLE_REDIRECT_URL;
    if (explicitRedirect) {
      return normalizeOAuthRedirectUri(explicitRedirect);
    }

    if (req) {
      const forwardedProtoHeader = req.headers["x-forwarded-proto"];
      const forwardedProto = Array.isArray(forwardedProtoHeader)
        ? forwardedProtoHeader[0]
        : typeof forwardedProtoHeader === "string"
          ? forwardedProtoHeader.split(",")[0]
          : "";
      const host = req.get("host");
      if (host) {
        const hostLower = host.toLowerCase();
        const isLocalHost =
          hostLower.startsWith("localhost") ||
          hostLower.startsWith("127.0.0.1") ||
          hostLower.startsWith("[::1]");
        let protocol = (forwardedProto || req.protocol || "").trim();
        if (!protocol) {
          protocol = isLocalHost ? "http" : "https";
        } else if (!isLocalHost && protocol === "http") {
          protocol = "https";
        }
        return normalizeOAuthRedirectUri(`${protocol}://${host}${OAUTH_CALLBACK_PATH}`);
      }
    }

    const explicitBase = process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL;
    if (explicitBase) {
      return normalizeOAuthRedirectUri(`${trimTrailingSlash(explicitBase)}${OAUTH_CALLBACK_PATH}`);
    }

    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      return normalizeOAuthRedirectUri(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}${OAUTH_CALLBACK_PATH}`);
    }

    return normalizeOAuthRedirectUri(`http://localhost:${PORT}${OAUTH_CALLBACK_PATH}`);
  };

  type OAuthState = {
    redirectUri?: string;
    role?: "admin" | "faculty" | "admin_login" | "admin_reset";
    facultyId?: string;
  };
  type OAuthAuthContext = { mode: "oauth"; auth: any; tokens: any; redirectUri: string };
  type DriveAuthContext =
    | { mode: "service_account"; auth: any }
    | OAuthAuthContext;
  type MeetAuthContext =
    | { mode: "service_account"; auth: any; facultyId?: string }
    | { mode: "faculty_oauth"; auth: any; tokens: any; redirectUri: string; facultyId: string; email?: string | null }
    | { mode: "admin_oauth"; auth: any; tokens: any; redirectUri: string; facultyId: string; email?: string | null };

  const hasServiceAccountAuth = () => !!getServiceAccountCredentialsFromEnv();
  const hasMeetServiceAccountAuth = () => !!(getServiceAccountCredentialsFromEnv() && getMeetDelegatedUserFromEnv());
  const getStoredOAuthScopes = () => {
    const rawScopes = getAdminTokens()?.scope;
    return typeof rawScopes === "string" ? rawScopes.split(/\s+/).filter(Boolean) : [];
  };
  const hasOAuthScope = (scope: string) => getStoredOAuthScopes().includes(scope);
  const getFacultyStoredOAuthScopes = (facultyId: string) => {
    const rawScopes = getFacultyGoogleAuthData(facultyId)?.tokens?.scope;
    return typeof rawScopes === "string" ? rawScopes.split(/\s+/).filter(Boolean) : [];
  };
  const hasFacultyOAuthScope = (facultyId: string, scope: string) =>
    getFacultyStoredOAuthScopes(facultyId).includes(scope);
  const encodeOAuthState = (state: OAuthState) =>
    Buffer.from(JSON.stringify(state), "utf-8").toString("base64url");
  const parseOAuthState = (state: string | null): OAuthState => {
    if (!state) return {};

    try {
      return JSON.parse(Buffer.from(state, "base64url").toString("utf-8")) as OAuthState;
    } catch {
      try {
        return JSON.parse(Buffer.from(state, "base64").toString("utf-8")) as OAuthState;
      } catch {
        return JSON.parse(state) as OAuthState;
      }
    }
  };

  const getDriveConnectionMode = (): "service_account" | "oauth" | "none" => {
    if (hasServiceAccountAuth()) return "service_account";
    if (getAdminTokens()) return "oauth";
    return "none";
  };

  const getMeetConnectionMode = (): "service_account" | "oauth" | "none" => {
    if (hasMeetServiceAccountAuth()) return "service_account";
    return "none";
  };

  const getDriveAuthContext = (req?: express.Request): DriveAuthContext => {
    const serviceAccountCredentials = getServiceAccountCredentialsFromEnv();
    if (serviceAccountCredentials) {
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccountCredentials,
        scopes: [GOOGLE_DRIVE_UPLOAD_SCOPE],
      });
      return { mode: "service_account", auth };
    }

    const tokens = getAdminTokens();
    if (!tokens) {
      throw new Error("Google Drive is not connected. Configure a service account or connect an admin Google account.");
    }

    const redirectUri = getAdminRedirectUri() || resolveOAuthRedirectUri(req);
    const oauth2Client = getOAuth2Client(redirectUri);
    oauth2Client.setCredentials(tokens);

    return {
      mode: "oauth",
      auth: oauth2Client,
      tokens,
      redirectUri,
    };
  };

  const getMeetAuthContext = (facultyId: string, req?: express.Request): MeetAuthContext => {
    // Priority 1: Admin OAuth tokens with Meet scope
    const adminTokens = getAdminTokens();
    if (adminTokens && hasOAuthScope(GOOGLE_MEET_CREATE_SCOPE)) {
      const redirectUri = getAdminRedirectUri() || resolveOAuthRedirectUri(req);
      const oauth2Client = getOAuth2Client(redirectUri);
      oauth2Client.setCredentials(adminTokens);
      return {
        mode: "admin_oauth",
        auth: oauth2Client,
        tokens: adminTokens,
        redirectUri,
        facultyId,
        email: null,
      };
    }

    // Priority 2: Service account with delegated user
    const serviceAccountCredentials = getServiceAccountCredentialsFromEnv();
    const delegatedUser = getMeetDelegatedUserFromEnv();

    if (serviceAccountCredentials && delegatedUser) {
      const auth = new google.auth.JWT({
        email: serviceAccountCredentials.client_email,
        key: serviceAccountCredentials.private_key,
        scopes: [GOOGLE_MEET_CREATE_SCOPE],
        subject: delegatedUser,
      });
      return { mode: "service_account", auth, facultyId };
    }

    throw new Error(
      "Google Meet is not connected. Ask the admin to connect their Google account from the Admin Dashboard."
    );
  };

  const persistDriveOAuthTokens = (context: DriveAuthContext) => {
    if (context.mode !== "oauth") return;

    const mergedTokens = { ...context.tokens, ...context.auth.credentials };
    if (mergedTokens.refresh_token || context.tokens.refresh_token) {
      saveAdminTokens(mergedTokens, context.redirectUri);
    }
  };

  const persistMeetOAuthTokens = (context: MeetAuthContext) => {
    if (context.mode === "admin_oauth") {
      const mergedTokens = { ...context.tokens, ...context.auth.credentials };
      if (mergedTokens.refresh_token || context.tokens.refresh_token) {
        saveAdminTokens(mergedTokens, context.redirectUri);
      }
      return;
    }
    if (context.mode !== "faculty_oauth") return;

    const mergedTokens = { ...context.tokens, ...context.auth.credentials };
    if (mergedTokens.refresh_token || context.tokens.refresh_token) {
      saveFacultyGoogleAuthData(context.facultyId, {
        tokens: mergedTokens,
        redirectUri: context.redirectUri,
        email: context.email || getFacultyGoogleAuthData(context.facultyId)?.email || null,
        timestamp: Date.now(),
      });
    }
  };

  const clearExpiredOAuthTokens = (
    mode: "service_account" | "oauth" | "none",
    err: any
  ) => {
    if (mode === "oauth" && (err?.message || "").includes("invalid_grant") && fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
      return true;
    }
    return false;
  };

  const clearExpiredFacultyMeetTokens = (context: MeetAuthContext | null, err: any) => {
    if (context?.mode === "faculty_oauth" && (err?.message || "").includes("invalid_grant")) {
      deleteFacultyGoogleAuthData(context.facultyId);
      return true;
    }
    if (context?.mode === "admin_oauth" && (err?.message || "").includes("invalid_grant")) {
      clearExpiredOAuthTokens("oauth", err);
      return true;
    }
    return false;
  };

  const getGoogleAccessToken = async (authClient: any) => {
    const accessToken = await authClient.getAccessToken();
    const tokenValue =
      typeof accessToken === "string"
        ? accessToken
        : typeof accessToken?.token === "string"
          ? accessToken.token
          : "";

    if (!tokenValue) {
      throw new Error("Failed to retrieve a Google access token.");
    }

    return tokenValue;
  };

  const getGoogleAccountEmail = async (authClient: any) => {
    const oauth2 = google.oauth2({ version: "v2", auth: authClient });
    const response = await oauth2.userinfo.get();
    return normalizeEmail(response.data.email);
  };

  const createGoogleMeetLink = async (facultyId: string, req?: express.Request) => {
    let authContext: MeetAuthContext | null = null;

    try {
      authContext = getMeetAuthContext(facultyId, req);
      if ((authContext.mode === "faculty_oauth" || authContext.mode === "admin_oauth") && !authContext.email) {
        try {
          authContext.email = await getGoogleAccountEmail(authContext.auth);
        } catch {
          authContext.email = null;
        }
      }

      const accessToken = await getGoogleAccessToken(authContext.auth);

      // Try RESTRICTED first (requires host approval), fall back to OPEN for personal accounts
      let response = await fetch("https://meet.googleapis.com/v2/spaces", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: {
            accessType: "RESTRICTED",
          },
        }),
      });

      // If RESTRICTED failed, retry with OPEN access type
      if (!response.ok) {
        const retryResponse = await fetch("https://meet.googleapis.com/v2/spaces", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            config: {
              accessType: "OPEN",
            },
          }),
        });
        if (retryResponse.ok) {
          response = retryResponse;
        }
      }

      if (!response.ok) {
        let errorMessage = `Google Meet API returned ${response.status}.`;
        try {
          const payload = await response.json();
          errorMessage = payload?.error?.message || payload?.message || errorMessage;
        } catch {
          const fallbackText = await response.text();
          if (fallbackText) errorMessage = fallbackText;
        }

        const lowered = errorMessage.toLowerCase();
        if (response.status === 401 || response.status === 403 || lowered.includes("insufficient") || lowered.includes("scope") || lowered.includes("not been used") || lowered.includes("disabled") || lowered.includes("enabled")) {
          throw new Error(
            "Google Meet access is not authorized. Make sure the Google Meet REST API is enabled in Google Cloud Console (APIs & Services > Enable APIs > search 'Google Meet REST API'). Then have the faculty reconnect their Google account in the Faculty Dashboard."
          );
        }

        throw new Error(errorMessage);
      }

      const payload = await response.json();
      const actualAccessType =
        typeof payload?.config?.accessType === "string"
          ? payload.config.accessType.toUpperCase()
          : null;

      if (typeof payload?.meetingUri !== "string" || !payload.meetingUri.trim()) {
        throw new Error("Google Meet API did not return a meeting link.");
      }

      persistMeetOAuthTokens(authContext);
      return payload.meetingUri.trim();
    } catch (err) {
      if (authContext) {
        persistMeetOAuthTokens(authContext);
      }
      clearExpiredFacultyMeetTokens(authContext, err);
      throw err;
    }
  };

  // WebSocket Broadcast Helper
  function broadcast(type: string, payload: any) {
    try {
      const message = JSON.stringify({ type, payload });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(message);
          } catch (e) {
            console.error("WebSocket send error:", e);
          }
        }
      });
    } catch (err) {
      console.error("Broadcast error:", err);
    }
  }

  // --- API Routes ---

  // Admin: Get all colleges (if exists)
  app.get("/api/colleges", async (req, res) => {
    try {
      const { data, error } = await getSupabase().from("colleges").select("*");
      if (error) {
        return res.json([]); // Return empty if table doesn't exist
      }
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get admin email (for Google OAuth login)
  app.get("/api/admin/email", async (_req, res) => {
    try {
      const { data } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_email")
        .maybeSingle();
      res.json({ email: data?.value || null });
    } catch (err: any) {
      res.json({ email: null });
    }
  });

  // Admin: Set admin email (for Google OAuth login)
  app.post("/api/admin/email", async (req, res) => {
    try {
      const emailInput = typeof req.body?.email === "string" ? req.body.email.trim() : "";
      
      if (!emailInput) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Validate email using validators utility
      try {
        validators.email(emailInput);
      } catch (validationErr: any) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      const email = normalizeEmail(emailInput);
      
      await getSupabase()
        .from("admin_settings")
        .upsert({ key: "admin_email", value: email }, { onConflict: "key" });
      
      await logAudit("admin_email_updated", { email }, req);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Admin email update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Google OAuth login URL (also connects Drive + Meet)
  app.get("/api/admin/google/login-url", (req, res) => {
    try {
      const redirectUri = resolveOAuthRedirectUri(req);
      const oauth2Client = getOAuth2Client(redirectUri);
      const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [GOOGLE_USERINFO_EMAIL_SCOPE, ...GOOGLE_OAUTH_SCOPES],
        state: encodeOAuthState({ redirectUri, role: "admin_login" }),
        prompt: "consent",
      });
      res.json({ url });
    } catch (err: any) {
      console.error("OAuth URL generation error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Google OAuth password reset URL
  app.get("/api/admin/google/reset-url", (req, res) => {
    try {
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
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Reset password (after Google OAuth verification)
  app.post("/api/admin/reset-password", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      // Rate limit password reset attempts
      if (isRateLimited(`admin-reset:${ip}`)) {
        return res.status(429).json({ error: "Too many reset attempts. Please try again later." });
      }
      
      const { email, new_password } = req.body;
      if (!email || !new_password) {
        return res.status(400).json({ error: "Email and new password are required" });
      }
      
      try {
        const validatedPassword = validators.password(new_password);
        const validatedEmail = validators.email(email);
        
        // Verify the email matches stored admin email
        const { data: adminEmailRow } = await getSupabase()
          .from("admin_settings")
          .select("value")
          .eq("key", "admin_email")
          .maybeSingle();
        
        if (!adminEmailRow || normalizeEmail(adminEmailRow.value) !== normalizeEmail(validatedEmail)) {
          await logAudit("admin_reset_password_failed", { email: validatedEmail, ip, reason: "email_mismatch" }, req);
          return res.status(403).json({ error: "Email does not match admin account" });
        }
        
        const hashed = hashPassword(validatedPassword);
        await getSupabase()
          .from("admin_settings")
          .upsert({ key: "admin_password", value: hashed }, { onConflict: "key" });
        
        await logAudit("admin_password_reset", { email: validatedEmail, ip }, req);
        res.json({ success: true });
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }
    } catch (err: any) {
      console.error("Password reset error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Verify admin password (server-side comparison, never return the password)
  app.post("/api/admin/login", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (isRateLimited(`admin-login:${ip}`)) {
        return res.status(429).json({ error: "Too many login attempts. Please try again later." });
      }

      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!password.trim()) {
        return res.status(400).json({ error: "Password is required." });
      }

      const { data, error } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      const storedPassword = (error || !data) ? null : data.value;
      
      if (!storedPassword) {
        await logAudit("admin_login_failed", { ip, reason: "no_password_configured" }, req);
        return res.status(403).json({ error: "Admin account not configured" });
      }

      if (!verifyPassword(password, storedPassword)) {
        await logAudit("admin_login_failed", { ip, reason: "invalid_password" }, req);
        return res.status(401).json({ error: "Invalid admin password" });
      }

      // Migrate plaintext password to hashed on successful login
      if (!isPasswordHashed(storedPassword)) {
        const hashed = hashPassword(password);
        await getSupabase()
          .from("admin_settings")
          .upsert({ key: "admin_password", value: hashed }, { onConflict: "key" });
      }

      const sessionToken = createAdminSession(ip, req.get("user-agent") || "");
      await logAudit("admin_login_success", { ip }, req);

      res.cookie("admin_session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: ADMIN_SESSION_MAX_AGE_MS,
        path: "/"
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Logout (invalidate session)
  app.post("/api/admin/logout", requireAdminAuth, async (req, res) => {
    try {
      const token = (req as any).adminSessionToken;
      if (token) {
        adminSessions.delete(token);
      }
      res.clearCookie("admin_session");
      await logAudit("admin_logout", { ip: req.ip }, req);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Verify session (check if admin is still logged in)
  app.get("/api/admin/verify-session", requireAdminAuth, async (req, res) => {
    try {
      res.json({ valid: true });
    } catch (err: any) {
      res.status(401).json({ valid: false });
    }
  });

  // Admin: Get audit logs with optional filtering
  app.get("/api/admin/audit-logs", requireAdminAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const offset = parseInt(req.query.offset as string) || 0;
      const action = req.query.action as string;

      let query = getSupabase()
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (action) {
        query = query.eq("action", action);
      }

      const { data, count, error } = await query;

      if (error) throw error;

      res.json({
        logs: data || [],
        total: count || 0,
        limit,
        offset,
      });
    } catch (err: any) {
      console.error("Error fetching audit logs:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Activity Logs Endpoint
  app.get("/api/admin/activity-logs", requireAdminAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const offset = parseInt(req.query.offset as string) || 0;

      const { data, count, error } = await getSupabase()
        .from("activity_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      res.json({
        logs: data || [],
        total: count || 0,
        limit,
        offset,
      });
    } catch (err: any) {
      console.error("Error fetching activity logs:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Check if admin password is configured (public endpoint)
  app.get("/api/admin/password-configured", async (_req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      res.json({ configured: !!(data?.value && !error) });
    } catch (err: any) {
      res.json({ configured: false });
    }
  });

  // Admin: Set admin password (requires authentication + current password verification)
  app.post("/api/admin/password", requireAdminAuth, async (req, res) => {
    try {
      const newPasswordInput = typeof req.body?.password === "string" ? req.body.password.trim() : "";
      const currentPasswordInput = typeof req.body?.current_password === "string" ? req.body.current_password : "";
      
      if (!newPasswordInput) {
        return res.status(400).json({ error: "New password is required" });
      }
      
      if (!currentPasswordInput) {
        return res.status(400).json({ error: "Current password is required for verification" });
      }
      
      try {
        // Validate new password format
        const newPassword = validators.password(newPasswordInput);
        
        // Verify current password matches stored password
        const { data: storedData, error: fetchError } = await getSupabase()
          .from("admin_settings")
          .select("value")
          .eq("key", "admin_password")
          .maybeSingle();
        
        if (fetchError) throw fetchError;
        
        const storedPassword = storedData?.value;
        if (!storedPassword) {
          await logAudit("admin_password_change_failed", { reason: "no_current_password", ip: req.ip }, req);
          return res.status(400).json({ error: "No admin password configured yet. Use password reset flow." });
        }
        
        // Verify current password
        if (!verifyPassword(currentPasswordInput, storedPassword)) {
          await logAudit("admin_password_change_failed", { reason: "wrong_current_password", ip: req.ip }, req);
          return res.status(401).json({ error: "Current password is incorrect" });
        }
        
        // Prevent setting same password
        if (verifyPassword(newPasswordInput, storedPassword)) {
          await logAudit("admin_password_change_failed", { reason: "same_password", ip: req.ip }, req);
          return res.status(400).json({ error: "New password must be different from current password" });
        }
        
        const hashed = hashPassword(newPassword);
        await getSupabase()
          .from("admin_settings")
          .upsert({ key: "admin_password", value: hashed }, { onConflict: "key" });
        
        await logAudit("admin_password_changed", { ip: req.ip, via: "authenticated_change" }, req);
        res.json({ success: true, message: "Password changed successfully" });
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }
    } catch (err: any) {
      console.error("Password change error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add College (requires admin authentication)
  app.post("/api/colleges", requireAdminAuth, async (req, res) => {
    try {
      // Require password for college creation
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required to confirm college creation" });
      }

      // Fetch stored admin password
      const { data: storedData, error: fetchError } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (fetchError) throw fetchError;

      const storedPassword = storedData?.value;
      if (!storedPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      // Verify password
      if (!verifyPassword(passwordInput, storedPassword)) {
        await logAudit("college_creation_failed", { reason: "invalid_password", ip: req.ip }, req);
        return res.status(401).json({ error: "Invalid password" });
      }

      // Input validation
      try {
        const name = validators.collegeName(req.body?.name);
        const code = validators.collegeCode(req.body?.code);
        
        let { data, error } = await getSupabase()
          .from("colleges")
          .insert({ name, code })
          .select()
          .single();
          
        if (error && error.message.includes("null value in column \"id\"")) {
          // Fallback if DB requires explicit UUID
          const { data: d2, error: e2 } = await getSupabase()
            .from("colleges")
            .insert({ id: crypto.randomUUID(), name, code })
            .select()
            .single();
          data = d2;
          error = e2;
        }
        
        if (error) throw error;
        await logAudit("college_created", { name, code }, req);
        res.json(data);
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }
    } catch (err: any) {
      console.error("College creation error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Update college name (requires admin authentication)
  app.patch("/api/colleges/:id", requireAdminAuth, async (req, res) => {
    try {
      // Require password for college update
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required to confirm college update" });
      }

      // Fetch stored admin password
      const { data: storedData, error: fetchError } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (fetchError) throw fetchError;

      const storedPassword = storedData?.value;
      if (!storedPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      // Verify password
      if (!verifyPassword(passwordInput, storedPassword)) {
        await logAudit("college_update_failed", { college_id: req.params.id, reason: "invalid_password", ip: req.ip }, req);
        return res.status(401).json({ error: "Invalid password" });
      }

      // Input validation
      try {
        const name = validators.collegeName(req.body?.name);
        const code = validators.collegeCode(req.body?.code);
        
        const { data, error } = await getSupabase()
          .from("colleges")
          .update({ name, code })
          .eq("id", req.params.id)
          .select()
          .single();

        if (error) throw error;
        await logAudit("college_updated", { college_id: req.params.id, name, code }, req);
        res.json(data);
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }
    } catch (err: any) {
      console.error("College update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Get all departments
  app.get("/api/departments", async (req, res) => {
    try {
      const { data, error } = await getSupabase().from("departments").select("*");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      console.error("Departments fetch error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Add department (requires admin authentication)
  app.post("/api/departments", requireAdminAuth, async (req, res) => {
    try {
      // Require password for department creation
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required to confirm department creation" });
      }

      // Fetch stored admin password
      const { data: storedData, error: fetchError } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (fetchError) throw fetchError;

      const storedPassword = storedData?.value;
      if (!storedPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      // Verify password
      if (!verifyPassword(passwordInput, storedPassword)) {
        await logAudit("department_creation_failed", { reason: "invalid_password", ip: req.ip }, req);
        return res.status(401).json({ error: "Invalid password" });
      }

      // Input validation
      try {
        const name = validators.deptName(req.body?.name);
        const college_id = validators.collegeId(req.body?.college_id);
        const code = validators.deptCode(req.body?.code);
        
        const { data, error } = await getSupabase()
          .from("departments")
          .insert({ name, college_id, code })
          .select()
          .single();
        if (error) throw error;
        await logAudit("department_created", { name, college_id, code }, req);
        res.json(data);
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }
    } catch (err: any) {
      console.error("Department creation error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Update department name (requires admin authentication)
  app.patch("/api/departments/:id", requireAdminAuth, async (req, res) => {
    try {
      // Require password for department update
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required to confirm department update" });
      }

      // Fetch stored admin password
      const { data: storedData, error: fetchError } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (fetchError) throw fetchError;

      const storedPassword = storedData?.value;
      if (!storedPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      // Verify password
      if (!verifyPassword(passwordInput, storedPassword)) {
        await logAudit("department_update_failed", { department_id: req.params.id, reason: "invalid_password", ip: req.ip }, req);
        return res.status(401).json({ error: "Invalid password" });
      }

      // Fetch current department to preserve code if not provided
      const { data: currentDept, error: fetchError2 } = await getSupabase()
        .from("departments")
        .select("code")
        .eq("id", req.params.id)
        .maybeSingle();

      if (fetchError2) throw fetchError2;
      if (!currentDept) {
        return res.status(404).json({ error: "Department not found" });
      }

      // Input validation
      try {
        const name = validators.deptName(req.body?.name);
        const college_id = validators.collegeId(req.body?.college_id);
        const code = req.body?.code || currentDept.code; // Preserve existing code if not provided
        
        const { data, error } = await getSupabase()
          .from("departments")
          .update({ name, college_id, code })
          .eq("id", req.params.id)
          .select()
          .single();

        if (error) throw error;
        await logAudit("department_updated", { department_id: req.params.id, name, college_id }, req);
        res.json(data);
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }
    } catch (err: any) {
      console.error("Department update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Delete department (requires admin authentication + password confirmation)
  app.delete("/api/departments/:id", requireAdminAuth, async (req, res) => {
    try {
      // Require password for department deletion
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required to confirm department deletion" });
      }

      // Fetch stored admin password
      const { data: storedData, error: fetchError } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (fetchError) throw fetchError;

      const storedPassword = storedData?.value;
      if (!storedPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      // Verify password
      if (!verifyPassword(passwordInput, storedPassword)) {
        await logAudit("department_deletion_failed", { department_id: req.params.id, reason: "invalid_password", ip: req.ip }, req);
        return res.status(401).json({ error: "Invalid password" });
      }

      // Proceed with deletion
      const { error } = await getSupabase()
        .from("departments")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      await logAudit("department_deleted", { department_id: req.params.id }, req);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Department deletion error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Delete college (requires admin authentication + password confirmation)
  app.delete("/api/colleges/:id", requireAdminAuth, async (req, res) => {
    try {
      // Require password for college deletion
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required to confirm college deletion" });
      }

      // Fetch stored admin password
      const { data: storedData, error: fetchError } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (fetchError) throw fetchError;

      const storedPassword = storedData?.value;
      if (!storedPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      // Verify password
      if (!verifyPassword(passwordInput, storedPassword)) {
        await logAudit("college_deletion_failed", { college_id: req.params.id, reason: "invalid_password", ip: req.ip }, req);
        return res.status(401).json({ error: "Invalid password" });
      }

      // Proceed with deletion
      const { error } = await getSupabase()
        .from("colleges")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      await logAudit("college_deleted", { college_id: req.params.id }, req);
      res.json({ success: true });
    } catch (err: any) {
      console.error("College deletion error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Delete faculty (requires admin authentication + password confirmation)
  app.delete("/api/faculty/:id", requireAdminAuth, async (req, res) => {
    try {
      // Require password for faculty deletion
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required to confirm faculty deletion" });
      }

      // Fetch stored admin password
      const { data: storedData, error: fetchError } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (fetchError) throw fetchError;

      const storedPassword = storedData?.value;
      if (!storedPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      // Verify password
      if (!verifyPassword(passwordInput, storedPassword)) {
        await logAudit("faculty_deletion_failed", { faculty_id: req.params.id, reason: "invalid_password", ip: req.ip }, req);
        return res.status(401).json({ error: "Invalid password" });
      }

      // Proceed with deletion
      const { error } = await getSupabase()
        .from("faculty")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      await logAudit("faculty_deleted", { faculty_id: req.params.id }, req);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Faculty deletion error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const updateFacultyPassword = async (req: express.Request, res: express.Response) => {
    try {
      // Input validation
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      const facultyId = req.params.id;
      
      if (!facultyId || facultyId.length > 50) {
        return res.status(400).json({ error: "Invalid faculty ID format" });
      }
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required" });
      }
      
      // Validate password using validators utility (8-128 chars)
      try {
        validators.password(passwordInput);
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }

      const hashed = hashPassword(passwordInput);
      const { error } = await getSupabase()
        .from("faculty")
        .update({ password: hashed })
        .eq("id", facultyId);
      if (error) throw error;
      
      await logAudit("faculty_password_changed", { faculty_id: facultyId }, req);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Faculty password update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  // Faculty: Self-service password change (no admin auth required)
  app.post("/api/faculty/:id/change-password", async (req, res) => {
    try {
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      const facultyId = req.params.id;
      
      if (!facultyId || facultyId.length > 50) {
        return res.status(400).json({ error: "Invalid faculty ID format" });
      }
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required" });
      }
      
      // Validate password using validators utility (8-128 chars)
      try {
        validators.password(passwordInput);
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }

      const hashed = hashPassword(passwordInput);
      const { error } = await getSupabase()
        .from("faculty")
        .update({ password: hashed })
        .eq("id", facultyId);
      if (error) throw error;
      
      await logAudit("faculty_self_password_changed", { faculty_id: facultyId }, req);
      res.json({ success: true, message: "Password updated successfully" });
    } catch (err: any) {
      console.error("Faculty password update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Update faculty password (requires admin authentication)
  app.post("/api/faculty/:id/password", requireAdminAuth, updateFacultyPassword);

  // Backward compatibility for older clients still using the reset route.
  app.post("/api/faculty/:id/reset-password", requireAdminAuth, updateFacultyPassword);

  // Admin: Add faculty (requires admin authentication)
  app.post("/api/faculty", requireAdminAuth, async (req, res) => {
    try {
      // Require password for faculty creation
      const passwordInput = typeof req.body?.password_confirm === "string" ? req.body.password_confirm : "";
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required to confirm faculty creation" });
      }

      // Fetch stored admin password
      const { data: storedData, error: fetchError } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (fetchError) throw fetchError;

      const storedPassword = storedData?.value;
      if (!storedPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      // Verify password
      if (!verifyPassword(passwordInput, storedPassword)) {
        await logAudit("faculty_creation_failed", { reason: "invalid_password", ip: req.ip }, req);
        return res.status(401).json({ error: "Invalid password" });
      }

      const { id, name, department_id, email, password } = req.body;

      // Input validation
      try {
        if (!name) throw new Error("Faculty name is required");
        validators.name(name);
        
        if (!email) throw new Error("Email is required");
        validators.email(email);
        
        if (!password) throw new Error("Password is required");
        validators.password(password);
        
        if (!id) throw new Error("Faculty ID is required");
        validators.facultyId(id);
        
        if (department_id && typeof department_id !== "string") {
          throw new Error("Invalid department ID format");
        }
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }

      const normalizedEmail = normalizeEmail(email);
      
      // Auto-generate a unique faculty code (e.g., FAC-A1B2C3)
      const faculty_code = "FAC-" + crypto.randomBytes(3).toString("hex").toUpperCase();
      const hashedPassword = hashPassword(password);
      
      const { data, error } = await getSupabase()
        .from("faculty")
        .insert({ id, name, full_name: name, faculty_code, department_id, email: normalizedEmail, password: hashedPassword, status: "available" })
        .select()
        .single();
      if (error) throw error;
      
      const { password: _pw, ...safeData } = data;
      await logAudit("faculty_created", { faculty_id: id, name }, req);
      res.json(safeData);
    } catch (err: any) {
      console.error("Faculty creation error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Student Active Queue
  app.get("/api/student/:id/active-queue", async (req, res) => {
    try {
      if (!req.params.id || req.params.id.length > 50) {
        return res.status(400).json({ error: "Invalid student ID format" });
      }

      // First, look up the student by their number to get the actual UUID
      const { data: student, error: studentError } = await getSupabase()
        .from("students")
        .select("id")
        .eq("student_number", req.params.id)
        .maybeSingle();

      if (studentError) {
        console.error("Student lookup error:", studentError);
        return res.status(500).json({ error: "Failed to lookup student" });
      }

      if (!student) {
        return res.json({ id: null, active: false });
      }

      // Now query the queue using the actual student UUID
      const { data, error } = await getSupabase()
        .from("queue")
        .select("id")
        .eq("student_id", student.id)
        .in("status", ["waiting", "serving", "ongoing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Queue lookup error:", error);
        return res.status(500).json({ error: "Failed to lookup queue" });
      }

      if (!data) {
        return res.json({ id: null, active: false });
      }
      
      res.json({ ...data, active: true });
    } catch (err: any) {
      console.error("Active queue fetch error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Faculty Login
  app.post("/api/faculty/login", async (req, res) => {
    try {
      // Input validation
      const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";

      if (!email) {
        return res.status(400).json({ error: "Email is required." });
      }
      if (!password) {
        return res.status(400).json({ error: "Password is required." });
      }

      // Validate email format
      try {
        validators.email(email);
      } catch (validationErr: any) {
        return res.status(400).json({ error: "Invalid email format." });
      }

      const normalizedEmail = normalizeEmail(email);
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      
      if (isRateLimited(`faculty-login:${ip}`)) {
        return res.status(429).json({ error: "Too many login attempts. Please try again later." });
      }

      const { data, error } = await getSupabase()
        .from("faculty")
        .select("*")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (error) throw error;

      if (!data || !verifyPassword(password, data.password)) {
        await logAudit("faculty_login_failed", { email: normalizedEmail, ip }, req);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Migrate plaintext password to hashed on successful login
      if (!isPasswordHashed(data.password)) {
        const hashed = hashPassword(password);
        await getSupabase()
          .from("faculty")
          .update({ password: hashed })
          .eq("id", data.id);
      }

      // Log successful login
      await logAudit("faculty_login_success", { email: normalizedEmail, ip }, req);

      // Return faculty data without the password
      const { password: _pw, ...safeData } = data;
      res.json(safeData);
    } catch (err: any) {
      console.error("Faculty login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update faculty availability
  app.post("/api/faculty/:id/availability", async (req, res) => {
    try {
      const targetId = req.params.id;
      if (!targetId || targetId.length > 50) {
        return res.status(400).json({ error: "Invalid faculty ID format" });
      }
      
      const { availability } = req.body;
      if (!availability) {
        return res.status(400).json({ error: "Availability data is required" });
      }

      // Validate availability format (should be array of objects with day, start_time, end_time)
      if (!Array.isArray(availability)) {
        return res.status(400).json({ error: "Availability must be an array" });
      }
      
      try {
        JSON.stringify(availability); // Ensure serializable
      } catch (parseErr: any) {
        return res.status(400).json({ error: "Invalid availability format" });
      }

      const { data, error } = await getSupabase()
        .from("faculty")
        .update({ full_name: JSON.stringify(availability) })
        .eq("id", targetId)
        .select()
        .single();
      if (error) throw error;
      
      await logAudit("faculty_availability_updated", { faculty_id: targetId }, req);
      res.json(data);
    } catch (err: any) {
      console.error("Faculty availability update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all faculty
  app.get("/api/faculty", async (req, res) => {
    try {
      const { data: facultyData, error: facultyError } = await getSupabase()
        .from("faculty")
        .select("*");
      if (facultyError) throw facultyError;

      const { data: deptData, error: deptError } = await getSupabase()
        .from("departments")
        .select("*");
      if (deptError) throw deptError;

      const formattedData = (facultyData || []).map((f: any) => {
        const dept = (deptData || []).find((d: any) => d.id === f.department_id);
        const { password: _pw, ...safeFields } = f;
        return {
          ...safeFields,
          department: dept ? dept.name : "Unknown Department"
        };
      });
      
      res.json(formattedData);
    } catch (err: any) {
      console.error("Faculty fetch error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update Faculty Status - REQUIRES AUTHENTICATION
  app.post("/api/faculty/:id/status", async (req, res) => {
    try {
      const targetId = req.params.id;
      if (!targetId || targetId.length > 50) {
        return res.status(400).json({ error: "Invalid faculty ID format" });
      }
      
      const { status } = req.body;
      const validStatuses = ["available", "busy", "offline"];
      
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      }
      
      const { error } = await getSupabase()
        .from("faculty")
        .update({ status })
        .eq("id", targetId);

      if (error) {
        // Log error but don't expose database message
        console.error("Faculty status update error:", error);
        return res.status(500).json({ error: "Internal server error" });
      }

      await logAudit("faculty_status_updated", { faculty_id: targetId, new_status: status }, req);
      broadcast("faculty_updated", { faculty_id: targetId });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get student by ID (for Kiosk scan)
  app.get("/api/students/:id", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("students")
        .select("*")
        .eq("student_number", req.params.id)
        .single();
      if (error || !data) {
        res.status(404).json({ error: "Student not found" });
      } else {
        res.json({
          id: data.student_number,
          name: data.full_name,
          email: data.email
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Join Queue
  app.post("/api/queue/join", async (req, res) => {
    try {
      // Input validation
      try {
        validators.studentId(req.body?.student_id); // Validate required field
        if (req.body?.faculty_id) validators.facultyId(req.body.faculty_id);
        if (req.body?.student_name) validators.name(req.body.student_name);
        if (req.body?.student_email) validators.email(req.body.student_email);
        
        // Validate optional string fields
        const validateOptionalString = (val: any, fieldName: string, maxLen: number = 255) => {
          if (val && typeof val !== "string") throw new Error(`${fieldName} must be a string`);
          if (val && String(val).length > maxLen) throw new Error(`${fieldName} too long (max ${maxLen} chars)`);
        };
        validateOptionalString(req.body?.course, "course");
        validateOptionalString(req.body?.purpose, "purpose");
        validateOptionalString(req.body?.source, "source");
        validateOptionalString(req.body?.time_period, "time_period");
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }

      const { student_id, faculty_id, source, student_name, student_email, course, purpose, time_period } = req.body;

      // Get ALL faculty (regardless of status) to check availability slots
      // Faculty availability should be visible even if they're currently in a consultation/busy
      const { data: allFaculty, error: facultyError } = await getSupabase()
        .from("faculty")
        .select("*");

      if (facultyError) throw facultyError;

      if (!allFaculty || allFaculty.length === 0) {
        return res.status(503).json({ 
          error: "No faculty members registered in the system. Please try again later." 
        });
      }

      // Check if any faculty has today's availability slots configured
      // Faculty with availability slots are shown on kiosk regardless of their current status
      // This allows students to see and queue for faculty even during consultations
      const todayDay = getCurrentAppWeekday();
      
      let hasFacultyWithAvailabilitySlots = false;
      
      for (const faculty of allFaculty) {
        try {
          // Try to parse full_name as availability JSON (if it's been set via /api/faculty/:id/availability)
          const parsed = JSON.parse(faculty.full_name || "[]");
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Check if this faculty has a slot for today
            const todaySlot = parsed.find((slot: any) => slot?.day === todayDay);
            if (todaySlot) {
              hasFacultyWithAvailabilitySlots = true;
              break;
            }
          }
        } catch (e) {
          // full_name is not JSON (contains faculty name instead) - availability not configured
          // This is normal for faculty who haven't set their availability yet
        }
      }

      // If no faculty have any availability slots configured, prevent queueing
      if (!hasFacultyWithAvailabilitySlots) {
        return res.status(503).json({ 
          error: "No faculty members have availability slots configured for today. Please try again later." 
        });
      }

      // If student didn't select a specific faculty, that's okay - they'll be routed to any available faculty
      // If faculty_id is provided, we could add additional validation here if needed

      // Check if student exists
      let { data: student } = await getSupabase()
        .from("students")
        .select("*")
        .eq("student_number", student_id)
        .single();

      if (!student) {
        if (student_name) {
          // Create student
          const { data: newStudent, error: createError } = await getSupabase()
            .from("students")
            .insert({ 
              student_number: student_id, 
              full_name: student_name, 
              email: student_email || null
            })
            .select()
            .single();
          
          if (createError) {
            console.error("Create student error:", createError);
            return res.status(500).json({ error: createError.message || "Failed to create student record" });
          }
          student = newStudent;
        } else {
          return res.status(404).json({ error: "Student not found. Please use Manual Input to register." });
        }
      } else if (student_email && student.email !== student_email) {
        // Update existing student's email/course if provided and different
        await getSupabase()
          .from("students")
          .update({ 
            email: student_email || student.email
          })
          .eq("id", student.id);
      }

      // Check if already in queue
      const { data: existing } = await getSupabase()
        .from("queue")
        .select("*")
        .eq("student_id", student.id)
        .in("status", ["waiting", "serving", "ongoing"])
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ error: "Student already in queue" });
      }

      // Check if faculty already has a consultation at the same time slot
      if (faculty_id && time_period) {
        const today = getCurrentAppDate();
        console.log(`🔍 Checking double-booking: Faculty ${faculty_id}, Date: ${today}, Time: ${time_period}`);
        
        // Fetch all active consultations for this faculty today
        const { data: allConsultations, error: consultationError } = await getSupabase()
          .from("queue")
          .select("*")
          .eq("faculty_id", faculty_id)
          .eq("queue_date", today)
          .in("status", ["waiting", "serving", "ongoing"]);

        if (consultationError) {
          console.error("❌ Double-booking query error:", consultationError);
          throw consultationError;
        }

        console.log(`📊 Found ${allConsultations?.length || 0} existing consultations for this faculty`);

        // Check if any existing consultation has the same time slot
        if (allConsultations && allConsultations.length > 0) {
          // First try direct column match
          const hasDirectMatch = allConsultations.some((consultation: any) => {
            return consultation.time_period === time_period;
          });

          if (hasDirectMatch) {
            console.warn(`⚠️ BLOCKED: Direct time_period match!`);
            return res.status(400).json({ 
              error: `This faculty member already has a consultation scheduled at ${time_period}. Please select a different time slot or faculty member.` 
            });
          }

          // Fallback: parse from meet_link
          const hasTimeSlotConflict = allConsultations.some((consultation: any) => {
            const parts = consultation.meet_link ? String(consultation.meet_link).split('|') : [];
            const existingTimeSlot = parts.length > 0 ? parts[0] : null;
            console.log(`  - Parsed time from meet_link: ${existingTimeSlot}`);
            return existingTimeSlot === time_period;
          });

          if (hasTimeSlotConflict) {
            console.warn(`⚠️ BLOCKED: Parsed time match!`);
            return res.status(400).json({ 
              error: `This faculty member already has a consultation scheduled at ${time_period}. Please select a different time slot or faculty member.` 
            });
          }
        }
      }

      const targetEmail = student_email || student?.email;
      let meetLinkToSave = time_period || null;
      let generatedMeetLink = null;

      // Generate Google Meet link when student joins the queue
      try {
        if (faculty_id) {
          console.log(`🔄 Attempting to generate Google Meet link for faculty ${faculty_id}...`);
          const googleMeetLink = await createGoogleMeetLink(faculty_id, req);
          
          if (googleMeetLink) {
            console.log(`✅ Generated Google Meet link: ${googleMeetLink}`);
            generatedMeetLink = googleMeetLink;
            
            // Combine time_period and meet link if both exist
            if (time_period && googleMeetLink) {
              meetLinkToSave = `${time_period}|${googleMeetLink}`;
              console.log(`✅ Stored as: ${meetLinkToSave}`);
            } else if (googleMeetLink) {
              meetLinkToSave = googleMeetLink;
              console.log(`✅ Stored as: ${meetLinkToSave}`);
            }
          } else {
            console.error(`❌ Google Meet API returned empty link`);
          }
        }
      } catch (meetErr: any) {
        console.error(`❌ Google Meet link generation failed: ${meetErr?.message || String(meetErr)}`);
        console.error(`   Stack: ${meetErr?.stack || 'N/A'}`);
        console.log(`⚠ Proceeding without meet link - will retry when reminder is sent`);
        // Still proceed - we'll generate it again in the scheduler if needed
      }

      const today = getCurrentAppDate();
      const queueInsertBase = {
        student_id: student.id,
        faculty_id,
        status: "waiting",
        student_email: targetEmail || null,
        meet_link: meetLinkToSave,
        time_period: time_period || null,
        queue_date: today,
      };

      let { data: info, error } = await getSupabase()
        .from("queue")
        .insert({
          ...queueInsertBase,
          purpose: purpose || null,
        })
        .select()
        .single();

      if (error) {
        const message = String(error.message || "").toLowerCase();
        const missingPurposeColumn =
          message.includes("purpose") &&
          (message.includes("schema cache") || message.includes("column"));

        const missingTimePeriodColumn =
          message.includes("time_period") &&
          (message.includes("schema cache") || message.includes("column"));

        if (missingPurposeColumn) {
          console.warn("Queue insert fallback: 'purpose' column not found. Retrying without purpose.");
          const retry = await getSupabase()
            .from("queue")
            .insert(queueInsertBase)
            .select()
            .single();
          info = retry.data;
          error = retry.error;
        } else if (missingTimePeriodColumn) {
          console.warn("Queue insert fallback: 'time_period' column not found. Retrying with meet_link only.");
          const { student_id, faculty_id, status, student_email, meet_link } = queueInsertBase;
          const retryBase = {
            student_id,
            faculty_id,
            status,
            student_email,
            meet_link,
          };
          const retry = await getSupabase()
            .from("queue")
            .insert({
              ...retryBase,
              purpose: purpose || null,
            })
            .select()
            .single();
          info = retry.data;
          error = retry.error;
        }
      }

      if (error) throw error;

      const { data: newConsultation } = await getSupabase()
        .from("queue")
        .select(`
          *,
          students (full_name),
          faculty (name)
        `)
        .eq("id", info.id)
        .single();

      const formatted = {
        ...newConsultation,
        student_name: (newConsultation as any)?.students?.full_name,
        faculty_name: (newConsultation as any)?.faculty?.name,
      };

      if (targetEmail) {
        sendEmailNotification(
          targetEmail,
          "Consultation Booking Receipt",
          `
          <h2>Booking Confirmed</h2>
          <p>Hi ${formatted.student_name || 'Student'},</p>
          <p>You have successfully joined the queue for a consultation with <strong>${formatted.faculty_name || 'your selected faculty'}</strong>.</p>
          ${time_period ? `<p><strong>Time Slot:</strong> ${time_period}</p>` : ''}
          <p><strong>Virtual Consultation Room:</strong> You will receive the Google Meet link via email 5 minutes before your consultation starts.</p>
          <p>Please keep this email. You can track your status on the kiosk or wait for further notifications.</p>
          <br/>
          <p>Thank you!</p>
          `
        );
      }

      broadcast("queue_updated", { faculty_id });
      res.json(formatted);
    } catch (err: any) {
      console.error("Queue join error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get Booked Slots for Today
  app.get("/api/queue/booked-slots", async (req, res) => {
    try {
      const today = getCurrentAppDate();
      
      // Fetch all active queue entries for today with their meet_link
      const { data, error } = await getSupabase()
        .from("queue")
        .select("faculty_id, meet_link")
        .eq("queue_date", today)
        .in("status", ["waiting", "serving", "ongoing"]);

      if (error) {
        console.error("Error fetching queue data:", error);
        throw error;
      }

      // Parse time_period from meet_link (format: "time_period|googleMeetLink")
      const bookedSlots = (data || [])
        .map((q: any) => {
          const parts = q.meet_link ? String(q.meet_link).split('|') : [];
          const timeSlot = parts.length > 0 ? parts[0] : null;
          return {
            faculty_id: q.faculty_id,
            time_period: timeSlot
          };
        })
        .filter((q: any) => q.time_period && q.faculty_id);

      console.log("📋 Booked slots:", bookedSlots);
      res.json(bookedSlots);
    } catch (err: any) {
      console.error("❌ Booked slots endpoint error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update faculty profile - REQUIRES AUTHENTICATION
  app.patch("/api/faculty/:id", requireAdminAuth, async (req, res) => {
    try {
      // Require password for faculty profile update
      const passwordInput = typeof req.body?.password === "string" ? req.body.password : "";
      
      if (!passwordInput) {
        return res.status(400).json({ error: "Password is required to confirm faculty update" });
      }

      // Fetch stored admin password
      const { data: storedData, error: fetchError } = await getSupabase()
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_password")
        .maybeSingle();

      if (fetchError) throw fetchError;

      const storedPassword = storedData?.value;
      if (!storedPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }

      // Verify password
      if (!verifyPassword(passwordInput, storedPassword)) {
        await logAudit("faculty_update_failed", { faculty_id: req.params.id, reason: "invalid_password", ip: req.ip }, req);
        return res.status(401).json({ error: "Invalid password" });
      }

      // Input validation with validators
      try {
        const name = validators.name(req.body?.name);
        const email = validators.email(req.body?.email);
        const department_id = typeof req.body?.department_id === "string" ? req.body.department_id.trim() : null;
        const college_id = typeof req.body?.college_id === "string" ? req.body.college_id.trim() : null;

        // Validate IDs if provided
        if (department_id) {
          validators.departmentId(department_id);
        }
        if (college_id) {
          validators.collegeId(college_id);
        }

        // If both college_id and department_id are provided, verify relationship
        if (college_id && department_id) {
          const { data: dept, error: deptError } = await getSupabase()
            .from("departments")
            .select("college_id")
            .eq("id", department_id)
            .maybeSingle();

          if (deptError) throw deptError;
          if (!dept) {
            return res.status(400).json({ error: "Department not found" });
          }
          if (dept.college_id !== college_id) {
            return res.status(400).json({ error: "Department does not belong to the selected college" });
          }
        }

        // If only department_id is provided, verify it exists
        if (department_id && !college_id) {
          const { data: dept, error: deptError } = await getSupabase()
            .from("departments")
            .select("id")
            .eq("id", department_id)
            .maybeSingle();

          if (deptError) throw deptError;
          if (!dept) {
            return res.status(400).json({ error: "Department not found" });
          }
        }

        // If only college_id is provided, verify it exists
        if (college_id && !department_id) {
          const { data: college, error: collegeError } = await getSupabase()
            .from("colleges")
            .select("id")
            .eq("id", college_id)
            .maybeSingle();

          if (collegeError) throw collegeError;
          if (!college) {
            return res.status(400).json({ error: "College not found" });
          }
        }

        // Fetch current faculty data to preserve availability
        const { data: currentFaculty, error: fetchError } = await getSupabase()
          .from("faculty")
          .select("full_name")
          .eq("id", req.params.id)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!currentFaculty) {
          return res.status(404).json({ error: "Faculty not found" });
        }

        // Check if full_name contains JSON availability data
        let fullNameToSave = name;
        if (currentFaculty.full_name) {
          try {
            const parsed = JSON.parse(currentFaculty.full_name);
            // If it's an array (availability data), preserve it
            if (Array.isArray(parsed)) {
              fullNameToSave = JSON.stringify(parsed);
            }
          } catch (e) {
            // If it's not valid JSON, it's just the faculty name
            fullNameToSave = name;
          }
        }

        // Build update data
        const updateData: any = { name, full_name: fullNameToSave, email };
        if (department_id) {
          updateData.department_id = department_id;
        }
        if (college_id) {
          updateData.college_id = college_id;
        }

        const { data, error } = await getSupabase()
          .from("faculty")
          .update(updateData)
          .eq("id", req.params.id)
          .select()
          .single();

        if (error) throw error;
        await logAudit("faculty_updated", { faculty_id: req.params.id, name, email, department_id, college_id }, req);
        res.json(data);
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }
    } catch (err: any) {
      console.error("Faculty update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/queue/monitor", async (_req, res) => {
    try {
      const formatted = await fetchLiveQueueSnapshot();
      res.json(formatted);
    } catch (err: any) {
      console.error("Public queue monitor error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Live queue monitoring (waiting, next, ongoing) - REQUIRES AUTHENTICATION
  app.get("/api/admin/queue-monitor", requireAdminAuth, async (req, res) => {
    try {
      const formatted = await fetchLiveQueueSnapshot();
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Queue for Faculty
  app.get("/api/faculty/:faculty_id/queue", async (req, res) => {
    try {
      let { data, error } = await getSupabase()
        .from("queue")
        .select(`
          id, student_id, status, created_at, meet_link, purpose,
          students (full_name, student_number)
        `)
        .eq("faculty_id", req.params.faculty_id)
        .in("status", ["waiting", "serving", "ongoing"])
        .order("created_at", { ascending: true });

      if (error) {
        const message = String(error.message || "").toLowerCase();
        const missingPurposeColumn =
          message.includes("purpose") &&
          (message.includes("schema cache") || message.includes("column"));

        if (missingPurposeColumn) {
          const fallback = await getSupabase()
            .from("queue")
            .select(`
              id, student_id, status, created_at, meet_link,
              students (full_name, student_number)
            `)
            .eq("faculty_id", req.params.faculty_id)
            .in("status", ["waiting", "serving", "ongoing"])
            .order("created_at", { ascending: true });

          data = fallback.data as any;
          error = fallback.error;
        }
      }

      if (error) throw error;

      const formatted = (data || []).map((c: any) => {
        const parts = c.meet_link ? c.meet_link.split('|') : [];
        const time_period = parts.length > 1 ? parts[0] : (parts.length === 1 && !parts[0].startsWith('http') ? parts[0] : null);
        const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
        const isCancelled = parts.length > 2 && parts[2] === 'cancelled';
        
        let mappedStatus = c.status;
        if (c.status === 'ongoing') mappedStatus = 'serving';
        if (c.status === 'done') {
          mappedStatus = isCancelled ? 'cancelled' : 'completed';
        }

        return {
          ...c,
          status: mappedStatus,
          student_name: c.students?.full_name,
          student_number: c.students?.student_number || "",
          purpose: c.purpose || "",
          meet_link: actual_link,
          time_period: time_period
        };
      });

      // Sort by time_period to ensure correct queue order
      formatted.sort((a: any, b: any) => {
        if (!a.time_period && !b.time_period) return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (!a.time_period) return 1;
        if (!b.time_period) return -1;
        
        const parseTime = (tp: string) => {
          const match = tp.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (!match) return 0;
          let hours = parseInt(match[1], 10);
          const mins = parseInt(match[2], 10);
          const ampm = match[3].toUpperCase();
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          return hours * 60 + mins;
        };
        
        return parseTime(a.time_period) - parseTime(b.time_period);
      });

      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Faculty Action: Update Consultation Status
  app.post("/api/queue/:id/meet-link", async (req, res) => {
    try {
      const consultationId = req.params.id;

      const { data: consultation, error: fetchError } = await getSupabase()
        .from("queue")
        .select("id, faculty_id, meet_link")
        .eq("id", consultationId)
        .single();

      if (fetchError || !consultation) {
        return res.status(404).json({ error: "Consultation not found" });
      }

      const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
      const existingLink =
        parts.length > 1
          ? parts[1]
          : parts.length === 1 && parts[0].startsWith('http')
            ? parts[0]
            : "";

      if (existingLink) {
        return res.json({ meet_link: existingLink });
      }

      const meetLink = await createGoogleMeetLink(consultation.faculty_id, req);
      res.json({ meet_link: meetLink });
    } catch (err: any) {
      console.error("Meet link preflight error:", err);
      res.status(400).json({
        error: err?.message || "Failed to generate Google Meet link.",
        meet_required: true,
      });
    }
  });

  app.post("/api/queue/:id/status", async (req, res) => {
    try {
      // Input validation
      const { status, meet_link, recording_enabled } = req.body;
      const consultationId = req.params.id;
      
      console.log(`\n====================================`);
      console.log(`🔵 [QUEUE STATUS] ENDPOINT CALLED`);
      console.log(`   Consultation ID: ${consultationId}`);
      console.log(`   Status: ${status}`);
      console.log(`   Recording Enabled: ${recording_enabled}`);
      console.log(`====================================\n`);
      
      if (!status || typeof status !== "string") {
        return res.status(400).json({ error: "Status is required and must be a string" });
      }
      
      const validStatuses = ["waiting", "serving", "completed", "cancelled"];
      if (!validStatuses.includes(status.toLowerCase())) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      // ===== AUDIO RECORDING REQUIREMENT =====
      // When starting a consultation (status === "serving"), audio recording must be enabled
      if (status === "serving" && recording_enabled !== true) {
        return res.status(400).json({ 
          error: "Audio recording is mandatory to start a consultation. Please enable recording and try again.",
          recording_required: true
        });
      }

      const { data: consultation, error: fetchError } = await getSupabase()
        .from("queue")
        .select("*")
        .eq("id", consultationId)
        .single();

      if (fetchError || !consultation) {
        return res.status(404).json({ error: "Consultation not found" });
      }

      // Map frontend statuses to DB allowed statuses (waiting, ongoing, done)
      let dbStatus = status;
      if (status === "serving") dbStatus = "ongoing";
      if (status === "completed" || status === "cancelled") dbStatus = "done";

      const updates: any = { status: dbStatus };
      let finalMeetLink = typeof meet_link === "string" ? meet_link.trim() : "";

      if (status === "serving") {
        const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
        const time_period = parts.length > 1 ? parts[0] : (parts.length === 1 && !parts[0].startsWith('http') ? parts[0] : null);

        if (!finalMeetLink) {
          return res.status(400).json({
            error: "A Google Meet link is required before starting the consultation.",
            meet_required: true,
          });
        }

        updates.meet_link = time_period ? `${time_period}|${finalMeetLink}` : finalMeetLink;
        // Store that recording is enabled for this consultation
        updates.recording_enabled = true;
        
        // Automatically set faculty to busy
        await getSupabase()
          .from("faculty")
          .update({ status: "busy" })
          .eq("id", consultation.faculty_id);
        broadcast("faculty_updated", { faculty_id: consultation.faculty_id });
      } else if (status === "completed" || status === "cancelled") {
        if (status === "cancelled") {
           const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
           const time_period = parts.length > 1 ? parts[0] : (parts.length === 1 && !parts[0].startsWith('http') ? parts[0] : null);
           const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
           updates.meet_link = `${time_period || ''}|${actual_link || ''}|cancelled`;
        }

        // Set faculty back to available if they were busy
        const { data: fac } = await getSupabase()
          .from("faculty")
          .select("status")
          .eq("id", consultation.faculty_id)
          .maybeSingle();
        
        if (fac?.status === "busy") {
          await getSupabase()
            .from("faculty")
            .update({ status: "available" })
            .eq("id", consultation.faculty_id);
          broadcast("faculty_updated", { faculty_id: consultation.faculty_id });
        }
      }

      let { error: updateError } = await getSupabase()
        .from("queue")
        .update(updates)
        .eq("id", consultationId);

      if (updateError) {
        const updateMessage = String(updateError.message || "").toLowerCase();
        const missingRecordingEnabledColumn =
          updateMessage.includes("recording_enabled") &&
          (updateMessage.includes("schema cache") || updateMessage.includes("column"));

        if (missingRecordingEnabledColumn) {
          console.warn("Queue status update fallback: 'recording_enabled' column not found. Retrying without recording flag persistence.");
          delete updates.recording_enabled;

          const retry = await getSupabase()
            .from("queue")
            .update(updates)
            .eq("id", consultationId);

          updateError = retry.error;
        }
      }

      if (updateError) throw updateError;

      // Extract meet link info for response
      const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
      const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0]?.startsWith('http') ? parts[0] : null);
      const final_email_link = status === "serving" ? (finalMeetLink || actual_link) : actual_link;

      console.log(`✅ Queue Status Updated - ID: ${consultationId}, Status: ${status}`);

      // Note: Email reminders are now sent by the background scheduler 5 minutes before consultation time
      // This endpoint is only responsible for status updates

      await logAudit("consultation_status_updated", { 
        consultation_id: consultationId, 
        new_status: status,
        recording_enabled: recording_enabled === true
      }, req);

      broadcast("queue_updated", { faculty_id: consultation.faculty_id });
      res.json({ success: true, meet_link: final_email_link || null });
    } catch (err: any) {
      console.error("❌ Queue status update error:", err?.message || err);
      console.error("Stack trace:", err?.stack || "N/A");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get specific consultation status (for student tracking)
  app.get("/api/queue/:id", async (req, res) => {
    try {
      const { data: consultation, error } = await getSupabase()
        .from("queue")
        .select(`
          id, status, created_at, faculty_id, meet_link,
          faculty (name)
        `)
        .eq("id", req.params.id)
        .single();

      if (error || !consultation) {
        res.status(404).json({ error: "Consultation not found" });
      } else {
        const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
        const time_period = parts.length > 1 ? parts[0] : (parts.length === 1 && !parts[0].startsWith('http') ? parts[0] : null);
        const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
        const isCancelled = parts.length > 2 && parts[2] === 'cancelled';

        let mappedStatus = consultation.status;
        if (consultation.status === 'ongoing') mappedStatus = 'serving';
        if (consultation.status === 'done') {
          mappedStatus = isCancelled ? 'cancelled' : 'completed';
        }

        res.json({
          ...consultation,
          status: mappedStatus,
          faculty_name: (consultation as any).faculty?.name,
          meet_link: (mappedStatus === "serving") ? actual_link : null,
          time_period: time_period
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cancel a consultation
  app.put("/api/queue/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;

      // Get the consultation to verify it exists
      const { data: consultation, error: fetchError } = await getSupabase()
        .from("queue")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !consultation) {
        return res.status(404).json({ error: "Consultation not found" });
      }

      if (consultation.status === "cancelled") {
        return res.status(400).json({ error: "Consultation is already cancelled" });
      }

      if (consultation.status !== "waiting") {
        return res.status(400).json({ error: "Can only cancel consultations that are waiting" });
      }

      // Update status to cancelled
      const { data: updated, error: updateError } = await getSupabase()
        .from("queue")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      // Broadcast the update
      broadcast("queue_updated", { faculty_id: consultation.faculty_id });

      // Send notification email if email exists
      const { data: student } = await getSupabase()
        .from("students")
        .select("*")
        .eq("id", consultation.student_id)
        .single();

      if (student?.email) {
        const { data: faculty } = await getSupabase()
          .from("faculty")
          .select("name")
          .eq("id", consultation.faculty_id)
          .single();

        sendEmailNotification(
          student.email,
          "Consultation Cancelled",
          `
          <h2>Cancellation Confirmation</h2>
          <p>Hi ${student.name},</p>
          <p>Your consultation with <strong>${faculty?.name || "faculty member"}</strong> has been cancelled.</p>
          <p>If you wish to schedule another consultation, please visit the kiosk or web application.</p>
          <br/>
          <p>Thank you!</p>
          `
        );
      }

      res.json({ message: "Consultation cancelled successfully", data: updated });
    } catch (err: any) {
      console.error("Error cancelling consultation:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Data Purging: Delete records older than 48 hours
  setInterval(async () => {
    console.log("[Data Purge] Running 48-hour cleanup...");
    try {
      const fortyEightHoursAgo = new Date(
        Date.now() - 48 * 60 * 60 * 1000
      ).toISOString();
      const { error } = await getSupabase()
        .from("queue")
        .delete()
        .lte("created_at", fortyEightHoursAgo);

      if (error) {
        console.error("[Data Purge] Error:", error.message);
      } else {
        console.log(`[Data Purge] Deleted old records.`);
      }
    } catch (err) {
      console.error("[Data Purge] Error:", err);
    }
  }, 60 * 60 * 1000); // Run every hour

  // Auto-expire waiting consultations that have passed their time period
  setInterval(async () => {
    try {
      const { data: waitingQueue } = await getSupabase()
        .from("queue")
        .select("id, meet_link, faculty_id, created_at")
        .eq("status", "waiting");

      if (!waitingQueue) return;

      const now = new Date();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      for (const item of waitingQueue) {
        if (!item.meet_link) continue;
        const parts = item.meet_link.split('|');
        if (parts.length < 2) continue;
        
        const time_period = parts[0]; // e.g. "Sunday 05:40 PM - 05:55 PM"
        const dayMatch = time_period.match(/^([a-zA-Z]+)/);
        
        let isExpired = false;
        
        if (dayMatch) {
          const dayName = dayMatch[1];
          const todayName = days[now.getDay()];
          
          if (dayName.toLowerCase() === todayName.toLowerCase()) {
            const timeMatch = time_period.match(/-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (timeMatch) {
              let hours = parseInt(timeMatch[1], 10);
              const mins = parseInt(timeMatch[2], 10);
              const ampm = timeMatch[3].toUpperCase();
              if (ampm === 'PM' && hours < 12) hours += 12;
              if (ampm === 'AM' && hours === 12) hours = 0;
              
              const endTime = new Date();
              endTime.setHours(hours, mins, 0, 0);
              
              if (now > endTime) {
                isExpired = true;
              }
            }
          } else {
            // Different day. If created_at is older than 24 hours, expire it.
            const createdAt = new Date(item.created_at);
            if (now.getTime() - createdAt.getTime() > 24 * 60 * 60 * 1000) {
              isExpired = true;
            }
          }
        }
        
        if (isExpired) {
          const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
          const new_meet_link = `${time_period || ''}|${actual_link || ''}|cancelled`;
          await getSupabase()
            .from("queue")
            .update({ status: "done", meet_link: new_meet_link })
            .eq("id", item.id);
          broadcast("queue_updated", { faculty_id: item.faculty_id });
        }
      }
    } catch (err) {
      console.error("[Auto-Expire] Error:", err);
    }
  }, 60 * 1000); // Run every minute

  // Google Drive OAuth and Upload
  const getOAuth2Client = (redirectUri?: string) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error("Google Client ID or Secret is not configured in environment variables.");
    }
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri || resolveOAuthRedirectUri()
    );
  };

  const runDriveCleanup = async () => {
    if (getDriveConnectionMode() === "none") return;
    
    let activeMode: "service_account" | "oauth" | "none" = "none";
    try {
      const authContext = getDriveAuthContext();
      activeMode = authContext.mode;
      const drive = google.drive({ version: 'v3', auth: authContext.auth });
      
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const response = await drive.files.list({
        q: `appProperties has { key='source' and value='consultation-system' } and createdTime < '${fortyEightHoursAgo}'`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
      });
      
      const files = response.data.files || [];
      for (const file of files) {
        if (file.id) {
          await drive.files.delete({ fileId: file.id, supportsAllDrives: true });
          console.log(`[Drive Cleanup] Deleted old recording: ${file.name}`);
        }
      }
      persistDriveOAuthTokens(authContext);
    } catch (err: any) {
      console.error("[Drive Cleanup] Error:", err);
      clearExpiredOAuthTokens(activeMode, err);
    }
  };

  const runSupabaseRecordingsCleanup = async () => {
    try {
      await ensureSupabaseRecordingsBucket();
      const storage = getSupabase().storage.from(SUPABASE_RECORDINGS_BUCKET);
      const cutoffMs = Date.now() - SUPABASE_RECORDINGS_RETENTION_HOURS * 60 * 60 * 1000;
      const limit = 100;
      let offset = 0;

      while (true) {
        const { data, error } = await storage.list(SUPABASE_RECORDINGS_PREFIX, {
          limit,
          offset,
          sortBy: { column: "name", order: "asc" },
        });

        if (error) {
          throw error;
        }

        const items = (data || []).filter((item: any) => typeof item.name === "string" && item.name.length > 0);
        if (items.length === 0) {
          break;
        }

        const stalePaths = items
          .filter((item: any) => {
            const createdAtValue =
              typeof item.created_at === "string"
                ? new Date(item.created_at)
                : parseSupabaseRecordingTimestamp(item.name);

            return !!createdAtValue && !Number.isNaN(createdAtValue.getTime()) && createdAtValue.getTime() < cutoffMs;
          })
          .map((item: any) => buildSupabaseRecordingPath(item.name));

        if (stalePaths.length > 0) {
          const { error: removeError } = await storage.remove(stalePaths);
          if (removeError) {
            throw removeError;
          }

          for (const stalePath of stalePaths) {
            console.log(`[Supabase Cleanup] Deleted old recording: ${stalePath}`);
          }
        }

        if (items.length < limit) {
          break;
        }

        offset += items.length;
      }
    } catch (err) {
      console.error("[Supabase Cleanup] Error:", err);
    }
  };

  const getMsUntilNextDriveCleanup = () => {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(23, 59, 0, 0);

    if (nextRun.getTime() <= now.getTime()) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun.getTime() - now.getTime();
  };

  const scheduleDriveCleanup = () => {
    const delay = getMsUntilNextDriveCleanup();
    console.log(`[Drive Cleanup] Next run scheduled in ${Math.round(delay / 60000)} minutes.`);

    setTimeout(async () => {
      await runDriveCleanup();
      await runSupabaseRecordingsCleanup();
      scheduleDriveCleanup();
    }, delay);
  };

  scheduleDriveCleanup();

  // Run Supabase recordings cleanup on startup and every hour
  (async () => {
    try {
      console.log("[Supabase Cleanup] Running initial cleanup on startup...");
      await runSupabaseRecordingsCleanup();
    } catch (err) {
      console.error("[Supabase Cleanup] Startup cleanup failed:", err);
    }
  })();

  setInterval(async () => {
    try {
      await runSupabaseRecordingsCleanup();
    } catch (err) {
      console.error("[Supabase Cleanup] Periodic cleanup failed:", err);
    }
  }, 60 * 60 * 1000); // Run every hour

  app.get("/api/faculty/:id/google/status", async (req, res) => {
    try {
      const facultyId = getBodyString(req.params.id);
      if (!facultyId) {
        return res.status(400).json({ error: "Faculty ID is required." });
      }

      const stored = getFacultyGoogleAuthData(facultyId);

      // Check admin OAuth first
      const adminTokens = getAdminTokens();
      if (adminTokens && hasOAuthScope(GOOGLE_MEET_CREATE_SCOPE)) {
        return res.json({
          connected: true,
          mode: "admin_oauth",
          email: null,
          connectedAt: null,
        });
      }

      if (hasMeetServiceAccountAuth()) {
        return res.json({
          connected: true,
          mode: "service_account",
          email: getMeetDelegatedUserFromEnv() || null,
          connectedAt: null,
        });
      }

      res.json({
        connected: false,
        mode: "none",
        email: stored?.email || null,
        connectedAt: stored?.timestamp ? new Date(stored.timestamp).toISOString() : null,
      });
    } catch (err: any) {
      console.error("Faculty Google Status Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/faculty/:id/google/url", async (req, res) => {
    try {
      const facultyId = getBodyString(req.params.id);
      if (!facultyId) {
        return res.status(400).json({ error: "Faculty ID is required." });
      }

      const { data: facultyRecord, error: facultyError } = await getSupabase()
        .from("faculty")
        .select("id, email")
        .eq("id", facultyId)
        .maybeSingle();

      if (facultyError) throw facultyError;
      if (!facultyRecord) {
        return res.status(404).json({ error: "Faculty not found." });
      }

      const redirectUri = resolveOAuthRedirectUri(req);
      const oauth2Client = getOAuth2Client(redirectUri);
      const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [GOOGLE_MEET_CREATE_SCOPE, GOOGLE_USERINFO_EMAIL_SCOPE],
        state: encodeOAuthState({ redirectUri, role: "faculty", facultyId }),
        prompt: "consent",
        login_hint: normalizeEmail(facultyRecord.email),
      });

      res.json({ url, redirectUri, mode: "oauth" });
    } catch (err: any) {
      console.error("Faculty Google OAuth URL Error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/faculty/:id/google/disconnect", (req, res) => {
    try {
      const facultyId = getBodyString(req.params.id);
      if (!facultyId) {
        return res.status(400).json({ error: "Faculty ID is required." });
      }

      deleteFacultyGoogleAuthData(facultyId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Faculty Google Disconnect Error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/auth/google/url", (req, res) => {
    try {
      if (hasServiceAccountAuth() && hasMeetServiceAccountAuth()) {
        return res.json({
          url: null,
          redirectUri: null,
          mode: "service_account",
          message: "Service account mode is enabled for Google Drive and Google Meet. Admin OAuth is not required."
        });
      }

      const redirectUri = resolveOAuthRedirectUri(req);
      const oauth2Client = getOAuth2Client(redirectUri);
      
      const stateString = Buffer
        .from(JSON.stringify({ redirectUri }), "utf-8")
        .toString('base64url');
      
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: GOOGLE_OAUTH_SCOPES,
        state: stateString,
        prompt: 'consent'
      });
      res.json({ url, redirectUri, mode: "oauth" });
    } catch (err: any) {
      console.error("OAuth URL Error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const code = getQueryString(req.query.code);
    const state = getQueryString(req.query.state);
    let stateObj: OAuthState = {};
    let targetOrigin = "*";

    try {
      stateObj = parseOAuthState(state);
      const resolvedRedirectUri = stateObj.redirectUri || resolveOAuthRedirectUri(req);
      targetOrigin = (() => {
        try {
          return new URL(resolvedRedirectUri).origin;
        } catch {
          return "*";
        }
      })();
    } catch {
      targetOrigin = "*";
    }

    const escapeHtml = (str: string) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    const sendOAuthResponse = (payload: Record<string, unknown>) => {
      const serializedPayload = JSON.stringify(payload);
      const safeMessage = escapeHtml(
        typeof payload.message === "string" ? payload.message : "Authentication complete."
      );
      res.send(`
        <html>
          <body>
            <script>
              const payload = ${serializedPayload};
              if (window.opener) {
                window.opener.postMessage(payload, ${JSON.stringify(targetOrigin)});
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>${safeMessage}</p>
          </body>
        </html>
      `);
    };

    try {
      if (!code) throw new Error("Missing code parameter");

      const redirectUri = stateObj.redirectUri || resolveOAuthRedirectUri(req);
      const oauth2Client = getOAuth2Client(redirectUri);
      const { tokens } = await oauth2Client.getToken(code);

      // Handle admin login via Google OAuth
      if (stateObj.role === "admin_login" || stateObj.role === "admin_reset") {
        oauth2Client.setCredentials(tokens);
        let accountEmail: string | null = null;
        try {
          accountEmail = await getGoogleAccountEmail(oauth2Client);
        } catch (emailErr) {
          console.warn("Admin Google email lookup failed:", emailErr);
        }

        if (!accountEmail) {
          return sendOAuthResponse({
            type: stateObj.role === "admin_reset" ? "ADMIN_RESET_ERROR" : "ADMIN_LOGIN_ERROR",
            error: "Could not retrieve Google account email.",
            message: "Could not retrieve Google account email.",
          });
        }

        // Check if admin email is configured
        const { data: adminEmailRow } = await getSupabase()
          .from("admin_settings")
          .select("value")
          .eq("key", "admin_email")
          .maybeSingle();

        const storedAdminEmail = adminEmailRow ? normalizeEmail(adminEmailRow.value) : null;

        if (stateObj.role === "admin_login") {
          if (!storedAdminEmail) {
            return sendOAuthResponse({
              type: "ADMIN_LOGIN_ERROR",
              error: "No admin email configured. Please set an admin email first from the Admin Dashboard.",
              message: "No admin email configured.",
            });
          }
          if (storedAdminEmail !== normalizeEmail(accountEmail)) {
            return sendOAuthResponse({
              type: "ADMIN_LOGIN_ERROR",
              error: "This Google account is not authorized as admin.",
              message: "This Google account is not authorized as admin.",
            });
          }
          // Save tokens so admin Google account is connected for Drive + Meet
          const mergedTokens = { ...(getAdminTokens() || {}), ...tokens };
          saveAdminTokens(mergedTokens, redirectUri);

          return sendOAuthResponse({
            type: "ADMIN_LOGIN_SUCCESS",
            email: accountEmail,
            message: "Admin login successful. This window should close automatically.",
          });
        }

        // admin_reset flow
        if (!storedAdminEmail) {
          return sendOAuthResponse({
            type: "ADMIN_RESET_ERROR",
            error: "No admin email configured. Please set an admin email first from the Admin Dashboard.",
            message: "No admin email configured.",
          });
        }
        if (storedAdminEmail !== normalizeEmail(accountEmail)) {
          return sendOAuthResponse({
            type: "ADMIN_RESET_ERROR",
            error: "This Google account is not authorized as admin.",
            message: "Unauthorized Google account.",
          });
        }
        return sendOAuthResponse({
          type: "ADMIN_RESET_SUCCESS",
          email: accountEmail,
          message: "Identity verified. You can now reset your password.",
        });
      }

      if (stateObj.role === "faculty" && stateObj.facultyId) {
        const facultyId = stateObj.facultyId;
        const existingFacultyTokens = getFacultyGoogleAuthData(facultyId)?.tokens || {};
        const mergedTokens = { ...existingFacultyTokens, ...tokens };
        oauth2Client.setCredentials(mergedTokens);

        let accountEmail: string | null = null;
        try {
          accountEmail = await getGoogleAccountEmail(oauth2Client);
        } catch (emailErr) {
          console.warn("Faculty Google email lookup failed:", emailErr);
        }

        saveFacultyGoogleAuthData(facultyId, {
          tokens: mergedTokens,
          redirectUri,
          email: accountEmail,
          timestamp: Date.now(),
        });

        return sendOAuthResponse({
          type: "FACULTY_GOOGLE_AUTH_SUCCESS",
          facultyId,
          email: accountEmail,
          message: "Faculty Google connection successful. This window should close automatically.",
        });
      }

      const mergedTokens = { ...(getAdminTokens() || {}), ...tokens };
      saveAdminTokens(mergedTokens, redirectUri);

      sendOAuthResponse({
        type: "OAUTH_AUTH_SUCCESS",
        message: "Authentication successful. This window should close automatically.",
      });
    } catch (err: any) {
      console.error("OAuth Callback Error:", err);
      const role = stateObj.role || "";
      const errorTypeMap: Record<string, string> = {
        faculty: "FACULTY_GOOGLE_AUTH_ERROR",
        admin_login: "ADMIN_LOGIN_ERROR",
        admin_reset: "ADMIN_RESET_ERROR",
      };
      
      // Log failed auth attempts for audit
      await logAudit("oauth_callback_error", { role, error: err.message }, undefined);
      
      res.status(500);
      sendOAuthResponse({
        type: errorTypeMap[role] || "OAUTH_AUTH_ERROR",
        error: "Authentication failed. Please try again.",
        message: "Authentication failed. Please try again.",
      });
    }
  });

  app.get("/api/drive/status", (_req, res) => {
    const oauthStatus = getAdminOAuthStatus();
    const driveMode = getDriveConnectionMode();
    const meetMode = getMeetConnectionMode();
    const oauthConnected = !!oauthStatus.data;

    res.json({
      connected: driveMode !== "none",
      mode: driveMode,
      driveConnected: driveMode !== "none",
      driveMode,
      meetConnected: meetMode !== "none",
      meetMode,
      oauthConnected,
      oauthExpired: oauthStatus.expired,
      oauthExpiresAt: oauthStatus.expiresAt,
      reconnectRequired: oauthStatus.expired && driveMode !== "service_account",
      tokenMaxAgeDays: TOKEN_MAX_AGE_DAYS,
    });
  });

  app.get("/api/recordings/status", async (_req, res) => {
    try {
      await ensureSupabaseRecordingsBucket();
      res.json({
        ready: true,
        provider: "supabase_storage",
        bucket: SUPABASE_RECORDINGS_BUCKET,
        prefix: SUPABASE_RECORDINGS_PREFIX || null,
      });
    } catch (err: any) {
      console.error("Supabase Recordings Status Error:", err);
      res.status(500).json({
        ready: false,
        error: "Recording storage is unavailable.",
      });
    }
  });

  app.get("/api/recordings", async (req, res) => {
    try {
      await ensureSupabaseRecordingsBucket();
      const supabase = getSupabase();
      const pageOffsetRaw = Number.parseInt(getQueryString(req.query.pageToken) || "0", 10);
      const pageOffset = Number.isFinite(pageOffsetRaw) && pageOffsetRaw > 0 ? pageOffsetRaw : 0;
      const limit = 100;

      const { data, error } = await supabase.storage.from(SUPABASE_RECORDINGS_BUCKET).list(SUPABASE_RECORDINGS_PREFIX, {
        limit,
        offset: pageOffset,
        sortBy: { column: "name", order: "desc" },
      });

      if (error) {
        throw error;
      }

      const files = (data || []).filter((file: any) => typeof file.name === "string" && file.name.length > 0);
      const parsedFiles = files.map((file: any) => {
        const parsed = parseSupabaseRecordingObjectName(file.name);
        const metadata = file.metadata || {};
        const sizeValue =
          typeof metadata.size === "number"
            ? metadata.size
            : Number.isFinite(Number(metadata.size))
              ? Number(metadata.size)
              : null;

        return {
          id: buildSupabaseRecordingPath(file.name),
          path: buildSupabaseRecordingPath(file.name),
          name: file.name,
          mimeType: typeof metadata.mimetype === "string" ? metadata.mimetype : "audio/webm",
          createdTime:
            typeof file.created_at === "string"
              ? file.created_at
              : parseSupabaseRecordingTimestamp(file.name)?.toISOString() || null,
          modifiedTime: typeof file.updated_at === "string" ? file.updated_at : null,
          size: sizeValue,
          consultationId: parsed.consultationId,
          facultyId: parsed.facultyId,
          studentId: parsed.studentId,
          studentNumber: parsed.studentNumber,
        };
      });

      const consultationIds = Array.from(
        new Set(parsedFiles.map((file) => file.consultationId || "").filter(Boolean))
      );
      const consultationResult = consultationIds.length
        ? await supabase
            .from("queue")
            .select("id, faculty_id, student_id")
            .in("id", consultationIds)
        : { data: [], error: null as any };

      if (consultationResult.error) {
        throw consultationResult.error;
      }

      const consultationById = new Map<string, { faculty_id: string | null; student_id: string | null }>(
        (consultationResult.data || []).map((item: any) => [
          String(item.id),
          {
            faculty_id: item.faculty_id || null,
            student_id: item.student_id || null,
          },
        ])
      );

      const facultyIds = Array.from(
        new Set(
          parsedFiles
            .map((file) => file.facultyId || consultationById.get(file.consultationId || "")?.faculty_id || "")
            .filter(Boolean)
        )
      );
      const studentIds = Array.from(
        new Set(
          parsedFiles
            .map((file) => file.studentId || consultationById.get(file.consultationId || "")?.student_id || "")
            .filter(Boolean)
        )
      );

      const [facultyResult, studentResult] = await Promise.all([
        facultyIds.length
          ? supabase.from("faculty").select("id, name").in("id", facultyIds)
          : Promise.resolve({ data: [], error: null as any }),
        studentIds.length
          ? supabase.from("students").select("id, full_name, student_number").in("id", studentIds)
          : Promise.resolve({ data: [], error: null as any }),
      ]);

      if (facultyResult.error) {
        throw facultyResult.error;
      }
      if (studentResult.error) {
        throw studentResult.error;
      }

      const facultyNameById = new Map<string, string>(
        (facultyResult.data || []).map((item: any) => [String(item.id), item.name || ""])
      );
      const studentById = new Map<string, { name: string | null; studentNumber: string | null }>(
        (studentResult.data || []).map((item: any) => [
          String(item.id),
          {
            name: item.full_name || null,
            studentNumber: item.student_number || null,
          },
        ])
      );

      res.json({
        files: parsedFiles.map((file) => {
          const resolvedFacultyId = file.facultyId || consultationById.get(file.consultationId || "")?.faculty_id || null;
          const resolvedStudentId = file.studentId || consultationById.get(file.consultationId || "")?.student_id || null;
          const studentRecord = resolvedStudentId ? studentById.get(String(resolvedStudentId)) : null;

          return {
            ...file,
            facultyId: resolvedFacultyId,
            facultyName: resolvedFacultyId ? facultyNameById.get(String(resolvedFacultyId)) || null : null,
            studentId: resolvedStudentId,
            studentName: studentRecord?.name || null,
            studentNumber: studentRecord?.studentNumber || file.studentNumber || null,
          };
        }),
        nextPageToken: files.length === limit ? String(pageOffset + files.length) : null,
        mode: "supabase_storage",
      });
    } catch (err: any) {
      console.error("Supabase Recordings List Error:", err);
      res.status(500).json({
        error: "Failed to list recordings.",
      });
    }
  });

  app.get("/api/recordings/content", async (req, res) => {
    try {
      const recordingPath = getQueryString(req.query.path)?.trim() || "";
      if (!recordingPath) {
        return res.status(400).json({ error: "Missing recording path." });
      }
      if (!isSupabaseRecordingPath(recordingPath)) {
        return res.status(400).json({ error: "Invalid recording path." });
      }

      await ensureSupabaseRecordingsBucket();
      const supabase = getSupabase();
      const { data: signedUrlData, error: signedUrlError } = await supabase
        .storage
        .from(SUPABASE_RECORDINGS_BUCKET)
        .createSignedUrl(recordingPath, 60);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        throw signedUrlError || new Error("Failed to create a signed URL for the recording.");
      }

      const isDownload = getQueryString(req.query.download) === "1";
      const upstream = await fetch(toAbsoluteSupabaseUrl(signedUrlData.signedUrl), {
        headers: {
          ...(typeof req.headers.range === "string" ? { Range: req.headers.range } : {}),
        },
      });

      if (!upstream.ok) {
        let errorMessage = `Supabase Storage returned ${upstream.status}.`;
        const contentType = upstream.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await upstream.json().catch(() => null);
          errorMessage = payload?.error?.message || payload?.message || errorMessage;
        } else {
          const text = await upstream.text();
          if (text) errorMessage = text;
        }

        if (upstream.status === 404) {
          return res.status(404).json({ error: "Recording not found." });
        }

        throw new Error(errorMessage);
      }

      const fileName = path.basename(recordingPath) || "recording.webm";
      const headerNames = ["accept-ranges", "content-length", "content-range", "content-type", "etag", "last-modified"];
      for (const headerName of headerNames) {
        const headerValue = upstream.headers.get(headerName);
        if (headerValue) {
          res.setHeader(headerName, headerValue);
        }
      }

      res.setHeader(
        "Content-Disposition",
        `${isDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );

      if (!upstream.body) {
        throw new Error("Supabase Storage did not return recording content.");
      }

      res.status(upstream.status);
      const stream = Readable.fromWeb(upstream.body as any);
      stream.on("error", (streamErr) => {
        console.error("Supabase Recording Stream Error:", streamErr);
        res.destroy(streamErr instanceof Error ? streamErr : undefined);
      });
      stream.pipe(res);
    } catch (err: any) {
      console.error("Supabase Recording Content Error:", err);
      if (res.headersSent) {
        res.end();
        return;
      }

      res.status(500).json({
        error: err?.message || "Failed to load Supabase recording.",
      });
    }
  });

  app.post("/api/recordings/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "Missing file" });
      }

      // Input validation
      try {
        // Validate file name
        validators.fileName(file.originalname);
        // Re-validate MIME type against whitelist (defense in depth)
        if (!ALLOWED_UPLOAD_MIMETYPES.includes(file.mimetype)) {
          throw new Error(`File type not allowed. Accepted types: ${ALLOWED_UPLOAD_MIMETYPES.join(", ")}`);
        }
        // Validate IDs if provided
        if (req.body?.faculty_id) validators.facultyId(req.body.faculty_id);
        if (req.body?.student_id) validators.studentId(req.body.student_id);
        if (req.body?.student_name) validators.name(req.body.student_name);
      } catch (validationErr: any) {
        if (file && file.path && require("fs").existsSync(file.path)) {
          require("fs").unlinkSync(file.path);
        }
        return res.status(400).json({ error: validationErr.message });
      }

      await ensureSupabaseRecordingsBucket();
      const supabase = getSupabase();
      const facultyId = getBodyString(req.body?.faculty_id);
      const consultationId = getBodyString(req.body?.consultation_id);
      let resolvedFacultyId = facultyId;
      let resolvedStudentId = getBodyString(req.body?.student_id);
      let resolvedStudentName = getBodyString(req.body?.student_name);
      let resolvedStudentNumber = getBodyString(req.body?.student_number);
      let resolvedFacultyName = "";

      if (consultationId) {
        const { data: consultationData, error: consultationError } = await supabase
          .from("queue")
          .select("id, faculty_id, student_id")
          .eq("id", consultationId)
          .maybeSingle();

        if (consultationError) {
          throw consultationError;
        }

        if (consultationData) {
          resolvedFacultyId = resolvedFacultyId || consultationData.faculty_id || "";
          resolvedStudentId = resolvedStudentId || consultationData.student_id || "";
        }
      }

      if (resolvedFacultyId) {
        const { data: facultyData, error: facultyError } = await supabase
          .from("faculty")
          .select("id, name")
          .eq("id", resolvedFacultyId)
          .maybeSingle();

        if (facultyError) {
          throw facultyError;
        }

        resolvedFacultyName = facultyData?.name || "";
      }

      if (resolvedStudentId) {
        const { data: studentData, error: studentError } = await supabase
          .from("students")
          .select("id, full_name, student_number")
          .eq("id", resolvedStudentId)
          .maybeSingle();

        if (studentError) {
          throw studentError;
        }

        if (studentData) {
          resolvedStudentName = resolvedStudentName || studentData.full_name || "";
          resolvedStudentNumber = resolvedStudentNumber || studentData.student_number || "";
        }
      }

      const uploadTimestamp = new Date().toISOString();
      const extensionFromName = path.extname(file.originalname || "").replace(/^\./, "");
      const extensionFromMime = (file.mimetype || "").split("/").pop() || "";
      const objectName = buildSupabaseRecordingObjectName({
        uploadedAt: uploadTimestamp,
        extension: extensionFromName || extensionFromMime || "webm",
        consultationId: consultationId || null,
        facultyId: resolvedFacultyId || null,
        studentId: resolvedStudentId || null,
        studentNumber: resolvedStudentNumber || null,
        facultyName: resolvedFacultyName || resolvedFacultyId || null,
        studentName: resolvedStudentName || null,
      });
      const objectPath = buildSupabaseRecordingPath(objectName);
      const uploadFileBuffer = fs.readFileSync(file.path);

      const { error: uploadError } = await supabase.storage.from(SUPABASE_RECORDINGS_BUCKET).upload(
        objectPath,
        uploadFileBuffer,
        {
          contentType: file.mimetype || "audio/webm",
          upsert: false,
        }
      );

      if (uploadError) {
        throw uploadError;
      }

      fs.unlinkSync(file.path);

      res.json({
        success: true,
        path: objectPath,
        provider: "supabase_storage",
        bucket: SUPABASE_RECORDINGS_BUCKET,
      });
    } catch (err: any) {
      console.error("Supabase Recording Upload Error:", err);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        error: "Failed to upload recording.",
      });
    }
  });

  app.get("/api/drive/recordings", async (req, res) => {
    let activeMode: "service_account" | "oauth" | "none" = "none";
    try {
      const authContext = getDriveAuthContext(req);
      activeMode = authContext.mode;
      const drive = google.drive({ version: "v3", auth: authContext.auth });
      const pageToken = getQueryString(req.query.pageToken) || undefined;

      const response = await drive.files.list({
        q: "trashed = false and appProperties has { key='source' and value='consultation-system' }",
        fields: "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size, webViewLink, appProperties)",
        orderBy: "createdTime desc",
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const files = response.data.files || [];
      const consultationIds = Array.from(
        new Set(
          files
            .map((file) => file.appProperties?.consultationId || "")
            .filter(Boolean)
        )
      );

      const consultationResult = consultationIds.length
        ? await getSupabase()
            .from("queue")
            .select("id, faculty_id, student_id")
            .in("id", consultationIds)
        : { data: [], error: null as any };

      if (consultationResult.error) {
        throw consultationResult.error;
      }

      const consultationById = new Map<string, { faculty_id: string | null; student_id: string | null }>(
        (consultationResult.data || []).map((item: any) => [
          String(item.id),
          {
            faculty_id: item.faculty_id || null,
            student_id: item.student_id || null,
          },
        ])
      );

      const facultyIds = Array.from(
        new Set(
          files
            .map((file) => file.appProperties?.facultyId || consultationById.get(file.appProperties?.consultationId || "")?.faculty_id || "")
            .filter(Boolean)
        )
      );
      const studentIds = Array.from(
        new Set(
          files
            .map((file) => file.appProperties?.studentId || consultationById.get(file.appProperties?.consultationId || "")?.student_id || "")
            .filter(Boolean)
        )
      );

      const [facultyResult, studentResult] = await Promise.all([
        facultyIds.length
          ? getSupabase().from("faculty").select("id, name").in("id", facultyIds)
          : Promise.resolve({ data: [], error: null as any }),
        studentIds.length
          ? getSupabase().from("students").select("id, full_name, student_number").in("id", studentIds)
          : Promise.resolve({ data: [], error: null as any }),
      ]);

      if (facultyResult.error) {
        throw facultyResult.error;
      }
      if (studentResult.error) {
        throw studentResult.error;
      }

      const facultyNameById = new Map<string, string>(
        (facultyResult.data || []).map((item: any) => [String(item.id), item.name || ""])
      );
      const studentById = new Map<string, { name: string | null; studentNumber: string | null }>(
        (studentResult.data || []).map((item: any) => [
          String(item.id),
          {
            name: item.full_name || null,
            studentNumber: item.student_number || null,
          },
        ])
      );

      persistDriveOAuthTokens(authContext);

      res.json({
        files: files.map((file) => {
          const consultationId = file.appProperties?.consultationId || null;
          const resolvedFacultyId =
            file.appProperties?.facultyId ||
            consultationById.get(consultationId || "")?.faculty_id ||
            null;
          const resolvedStudentId =
            file.appProperties?.studentId ||
            consultationById.get(consultationId || "")?.student_id ||
            null;
          const studentRecord = resolvedStudentId ? studentById.get(String(resolvedStudentId)) : null;

          return {
            id: file.id || "",
            name: file.name || "Untitled recording",
            mimeType: file.mimeType || "application/octet-stream",
            createdTime: file.createdTime || null,
            modifiedTime: file.modifiedTime || null,
            size: typeof file.size === "string" ? Number(file.size) : null,
            webViewLink: file.webViewLink || null,
            consultationId,
            facultyId: resolvedFacultyId,
            facultyName: resolvedFacultyId ? facultyNameById.get(String(resolvedFacultyId)) || null : null,
            studentId: resolvedStudentId,
            studentName: studentRecord?.name || null,
            studentNumber: studentRecord?.studentNumber || file.appProperties?.studentNumber || null,
          };
        }),
        nextPageToken: response.data.nextPageToken || null,
        mode: activeMode,
      });
    } catch (err: any) {
      console.error("Drive Recordings List Error:", err);
      const reconnectRequired = clearExpiredOAuthTokens(activeMode, err);
      const notConnected = (err?.message || "").includes("Google Drive is not connected");
      res.status(notConnected ? 401 : 500).json({
        error: err?.message || "Failed to list Drive recordings.",
        reconnectRequired,
      });
    }
  });

  app.get("/api/drive/recordings/:fileId/content", async (req, res) => {
    let activeMode: "service_account" | "oauth" | "none" = "none";
    try {
      const fileId = req.params.fileId?.trim();
      if (!fileId) {
        return res.status(400).json({ error: "Missing file ID." });
      }

      const authContext = getDriveAuthContext(req);
      activeMode = authContext.mode;
      const drive = google.drive({ version: "v3", auth: authContext.auth });
      const accessToken = await getGoogleAccessToken(authContext.auth);
      const metadata = await drive.files.get({
        fileId,
        fields: "id, name, mimeType, appProperties",
        supportsAllDrives: true,
      });

      if (metadata.data.appProperties?.source !== "consultation-system") {
        return res.status(404).json({ error: "Recording not found." });
      }

      const isDownload = getQueryString(req.query.download) === "1";
      const upstream = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(typeof req.headers.range === "string" ? { Range: req.headers.range } : {}),
          },
        }
      );

      if (!upstream.ok) {
        let errorMessage = `Google Drive API returned ${upstream.status}.`;
        const contentType = upstream.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await upstream.json().catch(() => null);
          errorMessage = payload?.error?.message || payload?.message || errorMessage;
        } else {
          const text = await upstream.text();
          if (text) errorMessage = text;
        }

        if (upstream.status === 404) {
          return res.status(404).json({ error: "Recording not found." });
        }

        throw new Error(errorMessage);
      }

      const fileName = metadata.data.name || "recording.webm";
      const headerNames = ["accept-ranges", "content-length", "content-range", "content-type", "etag", "last-modified"];
      for (const headerName of headerNames) {
        const headerValue = upstream.headers.get(headerName);
        if (headerValue) {
          res.setHeader(headerName, headerValue);
        }
      }

      res.setHeader(
        "Content-Disposition",
        `${isDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );

      persistDriveOAuthTokens(authContext);

      if (!upstream.body) {
        throw new Error("Google Drive did not return recording content.");
      }

      res.status(upstream.status);
      const stream = Readable.fromWeb(upstream.body as any);
      stream.on("error", (streamErr) => {
        console.error("Drive Recording Stream Error:", streamErr);
        res.destroy(streamErr instanceof Error ? streamErr : undefined);
      });
      stream.pipe(res);
    } catch (err: any) {
      console.error("Drive Recording Content Error:", err);
      const reconnectRequired = clearExpiredOAuthTokens(activeMode, err);
      const notConnected = (err?.message || "").includes("Google Drive is not connected");

      if (res.headersSent) {
        res.end();
        return;
      }

      res.status(notConnected ? 401 : 500).json({
        error: err?.message || "Failed to load Drive recording.",
        reconnectRequired,
      });
    }
  });

  app.post("/api/drive/disconnect", (_req, res) => {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH);
      }

      if (hasServiceAccountAuth()) {
        return res.json({
          success: true,
          mode: "service_account",
          message: "Stored OAuth tokens were removed. Service account mode remains controlled by environment variables."
        });
      }

      res.json({ success: true, mode: "oauth" });
    } catch (err: any) {
      console.error("Drive Disconnect Error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/drive/upload", upload.single('file'), async (req, res) => {
    let activeMode: "service_account" | "oauth" | "none" = "none";
    try {
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: "Missing file" });
      }

      // Input validation
      try {
        // Validate file name
        validators.fileName(file.originalname);
        // Validate IDs if provided
        if (req.body?.faculty_id) validators.facultyId(req.body.faculty_id);
        if (req.body?.student_id) validators.studentId(req.body.student_id);
        if (req.body?.student_name) validators.name(req.body.student_name);
      } catch (validationErr: any) {
        if (file && file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        return res.status(400).json({ error: validationErr.message });
      }

      const authContext = getDriveAuthContext(req);
      activeMode = authContext.mode;
      const drive = google.drive({ version: 'v3', auth: authContext.auth });
      const serviceAccountEmail =
        activeMode === "service_account"
          ? getServiceAccountCredentialsFromEnv()?.client_email || null
          : null;
      
      const facultyId = getBodyString(req.body?.faculty_id);
      const consultationId = getBodyString(req.body?.consultation_id);
      let resolvedFacultyId = facultyId;
      let resolvedStudentId = getBodyString(req.body?.student_id);
      let resolvedStudentName = getBodyString(req.body?.student_name);
      let resolvedStudentNumber = getBodyString(req.body?.student_number);
      let resolvedFacultyName = "";

      if (consultationId) {
        const { data: consultationData, error: consultationError } = await getSupabase()
          .from("queue")
          .select("id, faculty_id, student_id")
          .eq("id", consultationId)
          .maybeSingle();

        if (consultationError) {
          throw consultationError;
        }

        if (consultationData) {
          resolvedFacultyId = resolvedFacultyId || consultationData.faculty_id || "";
          resolvedStudentId = resolvedStudentId || consultationData.student_id || "";
        }
      }

      if (resolvedFacultyId) {
        const { data: facultyData, error: facultyError } = await getSupabase()
          .from("faculty")
          .select("id, name")
          .eq("id", resolvedFacultyId)
          .maybeSingle();

        if (facultyError) {
          throw facultyError;
        }

        resolvedFacultyName = facultyData?.name || "";
      }

      if (resolvedStudentId) {
        const { data: studentData, error: studentError } = await getSupabase()
          .from("students")
          .select("id, full_name, student_number")
          .eq("id", resolvedStudentId)
          .maybeSingle();

        if (studentError) {
          throw studentError;
        }

        if (studentData) {
          resolvedStudentName = resolvedStudentName || studentData.full_name || "";
          resolvedStudentNumber = resolvedStudentNumber || studentData.student_number || "";
        }
      }

      const uploadTimestamp = new Date().toISOString();
      const driveFileName = buildDriveRecordingFileName({
        uploadedAt: uploadTimestamp,
        facultyName: resolvedFacultyName || resolvedFacultyId || null,
        studentName: resolvedStudentName || null,
        studentNumber: resolvedStudentNumber || null,
      });
      const descriptionParts = [
        resolvedFacultyName ? `Faculty: ${resolvedFacultyName}` : "",
        resolvedStudentName ? `Student: ${resolvedStudentName}` : "",
        resolvedStudentNumber ? `Student Number: ${resolvedStudentNumber}` : "",
        consultationId ? `Consultation ID: ${consultationId}` : "",
      ].filter(Boolean);

      const fileMetadata: {
        name: string;
        description?: string;
        appProperties: Record<string, string>;
        parents?: string[];
      } = {
        name: driveFileName || file.originalname,
        appProperties: {
          source: 'consultation-system'
        }
      };
      if (descriptionParts.length > 0) {
        fileMetadata.description = descriptionParts.join(" | ");
      }
      if (resolvedFacultyId) {
        fileMetadata.appProperties.facultyId = resolvedFacultyId;
      }
      if (consultationId) {
        fileMetadata.appProperties.consultationId = consultationId;
      }
      if (resolvedStudentId) {
        fileMetadata.appProperties.studentId = resolvedStudentId;
      }
      if (resolvedStudentNumber) {
        fileMetadata.appProperties.studentNumber = resolvedStudentNumber;
      }
      const driveFolderId = unwrapEnvValue(process.env.GOOGLE_DRIVE_FOLDER_ID);
      if (driveFolderId) {
        fileMetadata.parents = [driveFolderId];
      }
      const uploadFileBuffer = fs.readFileSync(file.path);
      const createUploadMedia = () => ({
        mimeType: file.mimetype || "application/octet-stream",
        body: Readable.from(uploadFileBuffer),
      });
      
      let response;
      let warning: string | null = null;
      try {
        response = await drive.files.create({
          requestBody: fileMetadata,
          media: createUploadMedia(),
          fields: 'id, webViewLink',
          supportsAllDrives: true,
        });
      } catch (createErr: any) {
        const createMessage = createErr?.message || "";
        const hasFolderFallback = !!fileMetadata.parents?.length;
        if (hasFolderFallback && createMessage.includes("File not found:")) {
          if (activeMode === "service_account") {
            throw new Error(
              `Configured GOOGLE_DRIVE_FOLDER_ID is not accessible to the service account.${serviceAccountEmail ? ` Share the folder with ${serviceAccountEmail}.` : ""}`
            );
          }

          // Fallback to account root if configured folder ID is not accessible.
          const fallbackMetadata = {
            name: fileMetadata.name,
            ...(fileMetadata.description ? { description: fileMetadata.description } : {}),
            appProperties: fileMetadata.appProperties,
          };
          response = await drive.files.create({
            requestBody: fallbackMetadata,
            media: createUploadMedia(),
            fields: 'id, webViewLink',
            supportsAllDrives: true,
          });
          warning = "Configured GOOGLE_DRIVE_FOLDER_ID is not accessible. File was uploaded to Drive root instead.";
        } else {
          throw createErr;
        }
      }
      
      // Clean up local file
      fs.unlinkSync(file.path);

      persistDriveOAuthTokens(authContext);
      
      res.json({
        success: true,
        link: response?.data.webViewLink,
        mode: activeMode,
        warning
      });
    } catch (err: any) {
      console.error("Drive Upload Error:", err);
      const errorMessage = err?.message || "Unknown error";
      const notConnected = errorMessage.includes("Google Drive is not connected");
      const folderNotFound =
        errorMessage.includes("File not found:") ||
        errorMessage.includes("GOOGLE_DRIVE_FOLDER_ID is not accessible");
      const folderHint = folderNotFound
        ? "Configured GOOGLE_DRIVE_FOLDER_ID is not accessible. Verify folder ID, share the folder with the service account email, or remove GOOGLE_DRIVE_FOLDER_ID."
        : null;
      const noQuotaForServiceAccount = errorMessage.includes("Service Accounts do not have storage quota");
      const quotaHint = noQuotaForServiceAccount
        ? "Service account is uploading outside an accessible shared folder/drive. Ensure GOOGLE_DRIVE_FOLDER_ID points to a folder shared with the service account, or switch to OAuth mode."
        : null;
      const configurationError = folderNotFound || noQuotaForServiceAccount;
      clearExpiredOAuthTokens(activeMode, err);
      // Clean up local file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(notConnected ? 401 : configurationError ? 400 : 500).json({
        error: errorMessage,
        reconnectRequired: activeMode === "oauth" && (err?.message || "").includes("invalid_grant"),
        hint: folderHint || quotaHint
      });
    }
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: "API route not found. If you recently changed backend routes, restart the server or redeploy the app.",
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // TEST ENDPOINT: Bypass time and directly test email notification
  app.post("/api/test/send-next-student-email", async (req, res) => {
    try {
      const { faculty_id, student_email_to_notify } = req.body;
      
      console.log("\n🧪 TEST ENDPOINT: Testing next student email notification");
      console.log(`📧 Will send email to: ${student_email_to_notify}`);
      
      if (!student_email_to_notify || !student_email_to_notify.includes("@")) {
        return res.status(400).json({ error: "student_email_to_notify is required and must be valid" });
      }

      // Get a random faculty if not specified
      let testFacultyId = faculty_id;
      if (!testFacultyId) {
        const { data: faculties } = await getSupabase()
          .from("faculty")
          .select("id")
          .limit(1);
        
        if (!faculties || faculties.length === 0) {
          return res.status(400).json({ error: "No faculty found in system" });
        }
        testFacultyId = faculties[0].id;
      }

      console.log(`👨‍🏫 Using faculty: ${testFacultyId}`);

      // Create a test meet link
      const testMeetLink = `https://meet.google.com/test-${Date.now()}`;
      
      // Create test current consultation (will be marked as completed)
      const { data: currentConsult, error: currentErr } = await getSupabase()
        .from("queue")
        .insert({
          student_id: `TEST-CURRENT-${Date.now()}`,
          faculty_id: testFacultyId,
          status: "ongoing",
          meet_link: `10:00-10:30|${testMeetLink}`,
          student_email: `current-test-${Date.now()}@test.com`
        })
        .select()
        .single();

      if (currentErr) {
        console.error("❌ Failed to create current consultation:", currentErr);
        return res.status(500).json({ error: "Failed to create test consultation" });
      }

      console.log(`✅ Created current consultation: ${currentConsult.id}`);

      // Create test next student (the one who should get the email)
      const { data: nextConsult, error: nextErr } = await getSupabase()
        .from("queue")
        .insert({
          student_id: `TEST-NEXT-${Date.now()}`,
          faculty_id: testFacultyId,
          status: "waiting",
          meet_link: "10:30-11:00",
          student_email: student_email_to_notify,
          students_full_name: "Test Next Student"
        })
        .select()
        .single();

      if (nextErr) {
        // Try without students_full_name since it might not exist
        const { data: nextConsult2, error: nextErr2 } = await getSupabase()
          .from("queue")
          .insert({
            student_id: `TEST-NEXT-${Date.now()}`,
            faculty_id: testFacultyId,
            status: "waiting",
            meet_link: "10:30-11:00",
            student_email: student_email_to_notify
          })
          .select()
          .single();

        if (nextErr2) {
          console.error("❌ Failed to create next consultation:", nextErr2);
          return res.status(500).json({ error: "Failed to create next student in queue" });
        }
      }

      console.log(`✅ Created next student consultation: ${nextConsult?.id || "created"}`);

      // NOW MANUALLY TRIGGER THE EMAIL SENDING LOGIC
      console.log(`\n📧 Triggering email notification to: ${student_email_to_notify}`);
      
      try {
        sendEmailNotification(
          student_email_to_notify,
          "Your turn is coming up!",
          `
          <h2>Next in Queue</h2>
          <p>Hi Test Student,</p>
          <p>You are next in the queue for your consultation!</p>
          <p><strong>Time Slot:</strong> 10:30-11:00</p>
          <p>Please be ready to join the meeting.</p>
          <p>Join the meeting here: <a href="${testMeetLink}">${testMeetLink}</a></p>
          <p>If you are not ready, please notify the faculty immediately.</p>
          `
        );
        console.log(`✅ EMAIL CALLING FUNCTION EXECUTED for ${student_email_to_notify}`);
      } catch (emailErr) {
        console.error(`❌ ERROR in email function:`, emailErr instanceof Error ? emailErr.message : String(emailErr));
        return res.status(500).json({ 
          error: "Email function failed",
          details: emailErr instanceof Error ? emailErr.message : String(emailErr)
        });
      }

      res.json({
        success: true,
        message: "Test email triggered",
        test_meet_link: testMeetLink,
        recipient: student_email_to_notify,
        current_consultation_id: currentConsult?.id,
        next_consultation_id: nextConsult?.id,
        instructions: "Check the console logs above for email sending details"
      });

    } catch (err: any) {
      console.error("❌ Test endpoint error:", err?.message || err);
      res.status(500).json({ error: err?.message || "Test endpoint error" });
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Schedule queue clear every day at 11:59 PM
  const scheduleQueueClear = () => {
    const calculateNextClearTime = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(23, 59, 0, 0); // 11:59 PM
      
      // If 11:59 PM has already passed today, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      
      return next;
    };

    const clearQueue = async () => {
      try {
        const { error } = await getSupabase()
          .from("queue")
          .delete()
          .eq("status", "waiting");
        
        if (error) {
          console.error("Error clearing queue:", error);
        } else {
          console.log(`Queue cleared at ${new Date().toISOString()}`);
        }
      } catch (err) {
        console.error("Unexpected error clearing queue:", err);
      }
    };

    // Calculate initial delay to next 11:59 PM
    let nextClearTime = calculateNextClearTime();
    let timeUntilClear = nextClearTime.getTime() - Date.now();

    console.log(`Queue will be cleared daily at 11:59 PM. Next clear: ${nextClearTime.toISOString()}`);

    // Set initial timeout
    let timeoutId = setTimeout(() => {
      clearQueue();
      
      // After first clear, set up daily interval (24 hours)
      const intervalId = setInterval(() => {
        clearQueue();
      }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

      // Make sure interval is cleaned up on process exit
      process.on("exit", () => clearInterval(intervalId));
    }, timeUntilClear);

    // Make sure timeout is cleaned up on process exit
    process.on("exit", () => clearTimeout(timeoutId));
  };

  // Start the queue clear scheduler
  scheduleQueueClear();

  // Schedule audit logs deletion every 48 hours
  const scheduleAuditLogsDeletion = () => {
    const deleteOldAuditLogs = async () => {
      try {
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        
        const { error } = await getSupabase()
          .from("audit_logs")
          .delete()
          .lt("timestamp", fortyEightHoursAgo);
        
        if (error) {
          console.error("Error deleting old audit logs:", error);
        } else {
          console.log(`Audit logs older than 48 hours deleted at ${new Date().toISOString()}`);
        }
      } catch (err) {
        console.error("Unexpected error deleting audit logs:", err);
      }
    };

    // Run immediately on server start
    deleteOldAuditLogs();

    // Then run every 48 hours
    const intervalId = setInterval(() => {
      deleteOldAuditLogs();
    }, 48 * 60 * 60 * 1000); // 48 hours in milliseconds

    console.log("Audit logs deletion scheduler started. Will run every 48 hours.");

    // Make sure interval is cleaned up on process exit
    process.on("exit", () => clearInterval(intervalId));
  };

  // Start the audit logs deletion scheduler
  scheduleAuditLogsDeletion();

  // ==========================================
  // DAILY CLEANUP: Clear audit_logs, activity_logs, and old queue entries
  // ==========================================
  const scheduleDailyCleanup = () => {
    const performDailyCleanup = async () => {
      try {
        console.log("🧹 Starting daily cleanup...");
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        // Delete audit logs older than 1 day
        const { error: auditError } = await getSupabase()
          .from("audit_logs")
          .delete()
          .lt("created_at", yesterday);
        
        if (auditError) {
          console.error("❌ Error deleting audit logs:", auditError);
        } else {
          console.log("✅ Audit logs cleaned");
        }
        
        // Delete activity logs older than 1 day
        const { error: activityError } = await getSupabase()
          .from("activity_logs")
          .delete()
          .lt("created_at", yesterday);
        
        if (activityError) {
          console.error("❌ Error deleting activity logs:", activityError);
        } else {
          console.log("✅ Activity logs cleaned");
        }
        
        // Delete old queue entries (all entries from past dates)
        const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        
        const { error: queueError } = await getSupabase()
          .from("queue")
          .delete()
          .lt("queue_date", yesterdayDate);
        
        if (queueError) {
          console.error("❌ Error deleting old queue entries:", queueError);
        } else {
          console.log("✅ Queue entries cleaned");
        }
        
        console.log("✅ Daily cleanup completed at", new Date().toISOString());
      } catch (err) {
        console.error("❌ Unexpected error during daily cleanup:", err);
      }
    };

    // Calculate time until next midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();
    
    console.log(`⏰ Daily cleanup scheduled to run at ${tomorrow.toISOString()}`);
    
    // Run at midnight
    let timeoutId = setTimeout(() => {
      performDailyCleanup();
      
      // Then run every 24 hours
      const intervalId = setInterval(() => {
        performDailyCleanup();
      }, 24 * 60 * 60 * 1000);
      
      console.log("Daily cleanup interval started. Will run every 24 hours.");
      process.on("exit", () => clearInterval(intervalId));
    }, timeUntilMidnight);
    
    process.on("exit", () => clearTimeout(timeoutId));
  };

  scheduleDailyCleanup();

  // Manual cleanup endpoint (for testing or manual trigger)
  app.post("/api/admin/cleanup", requireAdminAuth, async (req, res) => {
    try {
      console.log("🧹 Manual cleanup triggered");
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { error: auditError } = await getSupabase()
        .from("audit_logs")
        .delete()
        .lt("created_at", yesterday);
      
      const { error: activityError } = await getSupabase()
        .from("activity_logs")
        .delete()
        .lt("created_at", yesterday);
      
      const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      
      const { error: queueError } = await getSupabase()
        .from("queue")
        .delete()
        .lt("queue_date", yesterdayDate);
      
      if (auditError || activityError || queueError) {
        return res.status(500).json({ 
          error: "Cleanup completed with errors",
          details: { auditError, activityError, queueError }
        });
      }
      
      res.json({ message: "✅ Daily cleanup completed successfully" });
    } catch (err: any) {
      console.error("Error in cleanup endpoint:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // SCHEDULER: Send email 5 minutes before consultation
  // ==========================================
  const sentReminderEmails = new Set<string>(); // Track which consultations already got reminder emails

  const scheduleConsultationReminders = () => {
    const sendReminderEmails = async () => {
      try {
        // Get all waiting consultations with their faculty info
        const { data: waitingConsultations, error: fetchError } = await getSupabase()
          .from("queue")
          .select("id, student_id, student_email, meet_link, faculty_id, students(full_name, email)")
          .eq("status", "waiting");

        if (fetchError) {
          console.error("❌ Error fetching waiting consultations:", fetchError.message);
          return;
        }

        if (!waitingConsultations || waitingConsultations.length === 0) {
          return; // No consultations to process
        }

        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTotalMinutes = currentHours * 60 + currentMinutes;
        
        console.log(`⏰ [SCHEDULER] Current time: ${currentHours}:${String(currentMinutes).padStart(2, '0')} (${currentTotalMinutes} minutes)`);
        console.log(`📋 [SCHEDULER] Found ${waitingConsultations.length} waiting consultations`);

        for (const consultation of waitingConsultations) {
          // Skip if we already sent a reminder for this consultation
          if (sentReminderEmails.has(consultation.id)) {
            continue;
          }

          const studentEmail = consultation.student_email || (consultation as any)?.students?.email;
          const studentName = (consultation as any)?.students?.full_name || "Student";
          const facultyId = consultation.faculty_id;

          console.log(`\n📌 Checking consultation ${consultation.id}:`);
          console.log(`   Student: ${studentName} (${studentEmail})`);
          console.log(`   Meet Link: ${consultation.meet_link ? "YES" : "NO"}`);

          // Parse meet_link: format is "HH:MM-HH:MM|https://meet.google.com/xxx"
          if (!consultation.meet_link) {
            console.log(`   ⏭️ Skipping - NO meet link`);
            continue;
          }

          const parts = consultation.meet_link.split('|');
          const timePart = parts[0]; // e.g., "18:30-18:45"
          let meetLink = parts.length > 1 ? parts[1] : null; // e.g., "https://meet.google.com/xxx"

          console.log(`   Time slot: ${timePart}`);
          console.log(`   Meet link: ${meetLink ? "YES" : "NO"}`);

          // If no meet link found, try to generate it now
          if (!meetLink) {
            console.log(`   🔄 [RETRY] Attempting to generate meet link...`);
            try {
              const generatedLink = await createGoogleMeetLink(facultyId);
              if (generatedLink) {
                meetLink = generatedLink;
                console.log(`   ✅ [RETRY] Generated: ${meetLink}`);
                
                // Update the consultation with the generated link
                const updatedMeetLink = `${timePart}|${generatedLink}`;
                await getSupabase()
                  .from("queue")
                  .update({ meet_link: updatedMeetLink })
                  .eq("id", consultation.id);
                console.log(`   ✅ [RETRY] Updated queue entry with meet link`);
              } else {
                console.log(`   ❌ [RETRY] Generated link is empty`);
              }
            } catch (retryErr) {
              console.error(`   ❌ [RETRY] Failed:`, retryErr instanceof Error ? retryErr.message : String(retryErr));
            }
          }

          if (!timePart || !meetLink) {
            console.log(`   ⏭️ Skipping - missing time period or meet link`);
            continue;
          }

          // Parse start time from timePart
          // Format: "Saturday 05:00 AM - 05:15 AM" or "18:30-18:45"
          console.log(`   Time parsing: timePart="${timePart}"`);
          
          let startHour = -1;
          let startMin = -1;
          
          // Try format: "Day HH:MM AM/PM - ..."
          if (timePart.includes('AM') || timePart.includes('PM')) {
            // Extract "HH:MM AM/PM" part
            const match = timePart.match(/(\d{1,2}):(\d{2})\s(AM|PM)/i);
            if (match) {
              let hour = parseInt(match[1], 10);
              const min = parseInt(match[2], 10);
              const meridiem = match[3].toUpperCase();
              
              // Convert to 24-hour format
              if (meridiem === 'PM' && hour !== 12) {
                hour += 12;
              } else if (meridiem === 'AM' && hour === 12) {
                hour = 0;
              }
              
              startHour = hour;
              startMin = min;
              console.log(`   Parsed (12-hour): "${match[0]}" → ${startHour}:${String(startMin).padStart(2, '0')} (24-hour)`);
            }
          } else {
            // Try format: "HH:MM-HH:MM"
            const timeMatch = timePart.split('-')[0].trim();
            const [hourStr, minStr] = timeMatch.split(':');
            startHour = parseInt(hourStr, 10);
            startMin = parseInt(minStr, 10);
            console.log(`   Parsed (24-hour): "${timeMatch}" → ${startHour}:${String(startMin).padStart(2, '0')}`);
          }

          if (isNaN(startHour) || isNaN(startMin) || startHour < 0 || startMin < 0) {
            console.log(`   ⏭️ Skipping - could not parse time: "${timePart}"`);
            continue;
          }

          const consultationStartMinutes = startHour * 60 + startMin;
          const minutesUntilStart = consultationStartMinutes - currentTotalMinutes;

          console.log(`   Start time: ${startHour}:${String(startMin).padStart(2, '0')} (${consultationStartMinutes} minutes)`);
          console.log(`   Minutes until start: ${minutesUntilStart}`);

          // Send email if consultation starts within next 5-7 minutes (window to account for scheduler timing)
          if (minutesUntilStart > 0 && minutesUntilStart <= 7) {
            console.log(`   ✅ SENDING EMAIL NOW!`);
            try {
              if (studentEmail) {
                console.log(`   📧 Sending to ${studentEmail}...`);
                sendEmailNotification(
                  studentEmail,
                  `Your consultation is starting in ${minutesUntilStart} minutes!`,
                  `
                  <h2>Consultation Reminder</h2>
                  <p>Hi ${studentName},</p>
                  <p><strong>Your consultation is starting in ${minutesUntilStart} minutes!</strong></p>
                  <p><strong>Time:</strong> ${timePart}</p>
                  <p>Please be ready to join the meeting.</p>
                  <p><strong>Join here:</strong> <a href="${meetLink}">${meetLink}</a></p>
                  <p>If you are not ready or need to reschedule, please contact the faculty immediately.</p>
                  `
                );

                // Mark as sent
                sentReminderEmails.add(consultation.id);
                console.log(`   ✅ Email queued for sending (via SendGrid)`);

                // Broadcast notification to faculty for this consultation
                console.log(`   🔔 Broadcasting to faculty ${facultyId}: student consultation starting`);
                broadcast("consultation_starting_soon", {
                  consultation_id: consultation.id,
                  faculty_id: facultyId,
                  student_name: studentName,
                  student_email: studentEmail,
                  time_slot: timePart,
                  minutes_until_start: minutesUntilStart,
                  meet_link: meetLink
                });

                // Log audit event
                await logAudit("consultation_reminder_email_sent", {
                  consultation_id: consultation.id,
                  student_id: consultation.student_id,
                  student_email: studentEmail,
                  faculty_id: facultyId,
                  minutes_before_start: minutesUntilStart,
                  scheduled_start_time: timePart,
                  meet_link: meetLink
                });
              } else {
                console.log(`   ⏭️ No student email to send to`);
              }
            } catch (emailErr) {
              console.error(`   ❌ Email error:`, emailErr instanceof Error ? emailErr.message : String(emailErr));
            }
          } else if (minutesUntilStart <= 0) {
            console.log(`   ⏭️ Consultation already started (or in past)`);
          } else {
            console.log(`   ⏭️ Not yet in 5-minute window (${minutesUntilStart} minutes away)`);
          }
        }
      } catch (err) {
        console.error("❌ Error in consultation reminder scheduler:", err);
      }
    };

    // Run immediately on server start
    sendReminderEmails();

    // Then run every 30 seconds to catch the 5-minute window
    const intervalId = setInterval(() => {
      sendReminderEmails();
    }, 30 * 1000); // 30 seconds

    console.log("📬 Consultation reminder email scheduler started (checks every 30 seconds)");
    console.log("   ✅ Sends email 5 minutes before ANY waiting consultation");

    // Make sure interval is cleaned up on process exit
    process.on("exit", () => clearInterval(intervalId));
  };

  // Start the consultation reminder scheduler
  scheduleConsultationReminders();

  // ==========================================
  // SCHEDULER: Auto-advance queue - cancel WAITING students if their time slot passed
  // ==========================================
  const scheduleQueueAutoAdvance = () => {
    const autoAdvanceQueue = async () => {
      try {
        // Get all WAITING consultations (queued, not yet being served)
        const { data: ongoingConsultations, error: fetchError } = await getSupabase()
          .from("queue")
          .select("id, student_id, student_email, meet_link, faculty_id, status, students(full_name, email)")
          .eq("status", "waiting");

        if (fetchError) {
          console.error("❌ Auto-advance error fetching consultations:", fetchError.message);
          return;
        }

        if (!ongoingConsultations || ongoingConsultations.length === 0) {
          return;
        }

        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTotalMinutes = currentHours * 60 + currentMinutes;

        for (const consultation of ongoingConsultations) {
          if (!consultation.meet_link) continue;

          const studentName = (consultation as any)?.students?.full_name || "Student";
          const timePart = consultation.meet_link;

          // Parse end time from timePart
          // Format: "Saturday 05:00 AM - 05:15 AM" or "18:30-18:45"
          let endHour = -1;
          let endMin = -1;

          // Try format: "... - HH:MM AM/PM"
          if (timePart.includes('AM') || timePart.includes('PM')) {
            const match = timePart.match(/(\d{1,2}):(\d{2})\s(AM|PM)\s*$/i);
            if (match) {
              let hour = parseInt(match[1], 10);
              const min = parseInt(match[2], 10);
              const meridiem = match[3].toUpperCase();

              if (meridiem === 'PM' && hour !== 12) {
                hour += 12;
              } else if (meridiem === 'AM' && hour === 12) {
                hour = 0;
              }

              endHour = hour;
              endMin = min;
            }
          } else {
            // Try format: "HH:MM-HH:MM" (extract end time)
            const parts = timePart.split('-');
            if (parts.length >= 2) {
              const endTimeStr = parts[1].trim();
              const [hourStr, minStr] = endTimeStr.split(':');
              endHour = parseInt(hourStr, 10);
              endMin = parseInt(minStr, 10);
            }
          }

          if (isNaN(endHour) || isNaN(endMin) || endHour < 0 || endMin < 0) {
            continue;
          }

          const endTotalMinutes = endHour * 60 + endMin;
          const minutesPastEnd = currentTotalMinutes - endTotalMinutes;

          // If time has passed, auto-cancel this waiting consultation
          if (minutesPastEnd > 0) {
            console.log(`\n⏰ [AUTO-ADVANCE] WAITING Consultation ${consultation.id} (${studentName}) scheduled time ended ${minutesPastEnd} minutes ago`);
            console.log(`   Status: ${consultation.status} → cancelling (no-show)`);

            try {
              // Mark as done since student's scheduled time is over and they haven't been served
              const { error: updateError } = await getSupabase()
                .from("queue")
                .update({ status: "done" })
                .eq("id", consultation.id);

              if (updateError) {
                console.error(`   ❌ Failed to update:`, updateError.message);
              } else {
                console.log(`   ✅ Auto-cancelled consultation (no-show - time expired)`);

                // Log audit event
                await logAudit("consultation_auto_ended", {
                  consultation_id: consultation.id,
                  student_id: consultation.student_id,
                  student_name: studentName,
                  reason: "no_show",
                  minutes_past_time: minutesPastEnd,
                  scheduled_time: timePart
                });

                // Broadcast to update UI
                broadcast("queue_updated", { faculty_id: consultation.faculty_id });

                console.log(`   📢 Queue updated - next waiting student can now be served`);
              }
            } catch (err) {
              console.error(`   ❌ Error during auto-advance:`, err);
            }
          }
        }
      } catch (err) {
        console.error("❌ Error in queue auto-advance scheduler:", err);
      }
    };

    // Run every 60 seconds to check if ongoing consultations have expired
    const intervalId = setInterval(() => {
      autoAdvanceQueue();
    }, 60 * 1000); // 60 seconds

    console.log("⏰ Queue auto-advance scheduler started (checks every 60 seconds)");
    console.log("   ✅ Auto-cancels WAITING consultations if their scheduled time has passed");

    process.on("exit", () => clearInterval(intervalId));
  };

  // Start the queue auto-advance scheduler
  scheduleQueueAutoAdvance();
}

startServer();
