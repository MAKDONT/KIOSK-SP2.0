import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
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

const upload = multer({ dest: UPLOADS_DIR });

const TOKEN_PATH = path.join(APP_DATA_DIR, "drive-tokens.json");
const TOKEN_MAX_AGE_DAYS = 30;
const OAUTH_CALLBACK_PATH = '/api/auth/google/callback';
const LEGACY_OAUTH_CALLBACK_PATH = '/auth/callback';
const GOOGLE_DRIVE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_MEET_CREATE_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
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

const normalizeEmail = (value: unknown) => (
  typeof value === "string" ? value.trim().toLowerCase() : ""
);

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

  app.use(express.json());
  app.set("trust proxy", true);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, uptime: Math.floor(process.uptime()) });
  });

  const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
  const getQueryString = (value: unknown): string | null => {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
    return null;
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

  type OAuthAuthContext = { mode: "oauth"; auth: any; tokens: any; redirectUri: string };
  type DriveAuthContext =
    | { mode: "service_account"; auth: any }
    | OAuthAuthContext;
  type MeetAuthContext =
    | { mode: "service_account"; auth: any }
    | OAuthAuthContext;

  const hasServiceAccountAuth = () => !!getServiceAccountCredentialsFromEnv();
  const hasMeetServiceAccountAuth = () => !!(getServiceAccountCredentialsFromEnv() && getMeetDelegatedUserFromEnv());
  const getStoredOAuthScopes = () => {
    const rawScopes = getAdminTokens()?.scope;
    return typeof rawScopes === "string" ? rawScopes.split(/\s+/).filter(Boolean) : [];
  };
  const hasOAuthScope = (scope: string) => getStoredOAuthScopes().includes(scope);

  const getDriveConnectionMode = (): "service_account" | "oauth" | "none" => {
    if (hasServiceAccountAuth()) return "service_account";
    if (getAdminTokens()) return "oauth";
    return "none";
  };

  const getMeetConnectionMode = (): "service_account" | "oauth" | "none" => {
    if (hasMeetServiceAccountAuth()) return "service_account";
    if (hasOAuthScope(GOOGLE_MEET_CREATE_SCOPE)) return "oauth";
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

  const getMeetAuthContext = (req?: express.Request): MeetAuthContext => {
    const serviceAccountCredentials = getServiceAccountCredentialsFromEnv();
    const delegatedUser = getMeetDelegatedUserFromEnv();

    if (serviceAccountCredentials && delegatedUser) {
      const auth = new google.auth.JWT({
        email: serviceAccountCredentials.client_email,
        key: serviceAccountCredentials.private_key,
        scopes: [GOOGLE_MEET_CREATE_SCOPE],
        subject: delegatedUser,
      });
      return { mode: "service_account", auth };
    }

    const tokens = getAdminTokens();
    if (!tokens) {
      throw new Error(
        "Google Meet is not connected. Reconnect Google in the Admin Dashboard, or configure GOOGLE_MEET_DELEGATED_USER for service-account impersonation."
      );
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

  const persistOAuthTokens = (context: DriveAuthContext | MeetAuthContext) => {
    if (context.mode !== "oauth") return;

    const mergedTokens = { ...context.tokens, ...context.auth.credentials };
    if (mergedTokens.refresh_token || context.tokens.refresh_token) {
      saveAdminTokens(mergedTokens, context.redirectUri);
    }
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

  const createGoogleMeetLink = async (req?: express.Request) => {
    let authContext: MeetAuthContext | null = null;

    try {
      authContext = getMeetAuthContext(req);
      const accessToken = await getGoogleAccessToken(authContext.auth);
      const response = await fetch("https://meet.googleapis.com/v2/spaces", {
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
        if (response.status === 401 || response.status === 403 || lowered.includes("insufficient") || lowered.includes("scope")) {
          throw new Error("Google Meet access is not authorized. Reconnect Google in the Admin Dashboard to grant Meet permissions.");
        }

        throw new Error(errorMessage);
      }

      const payload = await response.json();
      if (typeof payload?.meetingUri !== "string" || !payload.meetingUri.trim()) {
        throw new Error("Google Meet API did not return a meeting link.");
      }

      persistOAuthTokens(authContext);
      return payload.meetingUri.trim();
    } catch (err) {
      if (authContext) {
        persistOAuthTokens(authContext);
      }
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
      const { data, error } = await getSupabase().from("colleges").select("*").neq("code", "ADMIN_PASS");
      if (error) {
        return res.json([]); // Return empty if table doesn't exist
      }
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get admin password
  app.get("/api/admin/password", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("colleges")
        .select("name")
        .eq("code", "ADMIN_PASS")
        .maybeSingle();
      
      if (error || !data) {
        res.json({ password: "EARIST" });
      } else {
        res.json({ password: data.name });
      }
    } catch (err: any) {
      res.json({ password: "EARIST" });
    }
  });

  // Admin: Set admin password
  app.post("/api/admin/password", async (req, res) => {
    try {
      const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
      }
      const { data: existing } = await getSupabase()
        .from("colleges")
        .select("id")
        .eq("code", "ADMIN_PASS")
        .maybeSingle();

      if (existing) {
        await getSupabase()
          .from("colleges")
          .update({ name: password })
          .eq("code", "ADMIN_PASS");
      } else {
        await getSupabase()
          .from("colleges")
          .insert({ name: password, code: "ADMIN_PASS" });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add College
  app.post("/api/colleges", async (req, res) => {
    try {
      const { name, code } = req.body;
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
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update college name
  app.patch("/api/colleges/:id", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

      if (!name) {
        return res.status(400).json({ error: "College name is required." });
      }
      if (!code) {
        return res.status(400).json({ error: "College code is required." });
      }
      if (code === "ADMIN_PASS") {
        return res.status(400).json({ error: "College code cannot be ADMIN_PASS." });
      }

      const { data, error } = await getSupabase()
        .from("colleges")
        .update({ name, code })
        .eq("id", req.params.id)
        .neq("code", "ADMIN_PASS")
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get all departments
  app.get("/api/departments", async (req, res) => {
    try {
      const { data, error } = await getSupabase().from("departments").select("*");
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Add department
  app.post("/api/departments", async (req, res) => {
    try {
      const { name, code, college_id } = req.body;
      const { data, error } = await getSupabase()
        .from("departments")
        .insert({ name, code, college_id })
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update department name
  app.patch("/api/departments/:id", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const college_id = typeof req.body?.college_id === "string" ? req.body.college_id.trim() : String(req.body?.college_id || "").trim();
      if (!name) {
        return res.status(400).json({ error: "Department name is required." });
      }
      if (!college_id) {
        return res.status(400).json({ error: "College selection is required." });
      }

      const { data, error } = await getSupabase()
        .from("departments")
        .update({ name, college_id })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Delete department
  app.delete("/api/departments/:id", async (req, res) => {
    try {
      const { error } = await getSupabase()
        .from("departments")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Temporary endpoint to get queue columns
  app.get("/api/test/queue-columns", async (req, res) => {
    try {
      // Fetch from a non-existent table to get the error message which might contain hints,
      // or just fetch from a known table.
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      const data = await response.json();
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Delete college
  app.delete("/api/colleges/:id", async (req, res) => {
    try {
      const { error } = await getSupabase()
        .from("colleges")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Delete faculty
  app.delete("/api/faculty/:id", async (req, res) => {
    try {
      const { error } = await getSupabase()
        .from("faculty")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const updateFacultyPassword = async (req: express.Request, res: express.Response) => {
    try {
      const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
      }

      const { error } = await getSupabase()
        .from("faculty")
        .update({ password })
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  // Admin: Update faculty password
  app.post("/api/faculty/:id/password", updateFacultyPassword);

  // Backward compatibility for older clients still using the reset route.
  app.post("/api/faculty/:id/reset-password", updateFacultyPassword);

  // Admin: Add faculty
  app.post("/api/faculty", async (req, res) => {
    try {
      const { id, name, department_id, email, password } = req.body;
      const normalizedEmail = normalizeEmail(email);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!normalizedEmail) {
        return res.status(400).json({ error: "Email is required." });
      }
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({ error: "Invalid email format." });
      }
      
      // Auto-generate a unique faculty code (e.g., FAC-A1B2C3)
      const faculty_code = "FAC-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const { data, error } = await getSupabase()
        .from("faculty")
        .insert({ id, name, full_name: name, faculty_code, department_id, email: normalizedEmail, password, status: "available" })
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Student Active Queue
  app.get("/api/student/:id/active-queue", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from("queue")
        .select("id")
        .eq("student_id", req.params.id)
        .in("status", ["waiting", "next", "serving", "ongoing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "No active queue found" });
      
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Faculty Login
  app.post("/api/faculty/login", async (req, res) => {
    try {
      const normalizedEmail = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === "string" ? req.body.password : "";

      if (!normalizedEmail) {
        return res.status(400).json({ error: "Email is required." });
      }
      if (!password.trim()) {
        return res.status(400).json({ error: "Password is required." });
      }

      const { data, error } = await getSupabase()
        .from("faculty")
        .select("*")
        .eq("password", password)
        .limit(50);

      if (error) throw error;

      const facultyMatch = (data || []).find((faculty: any) => normalizeEmail(faculty.email) === normalizedEmail);

      if (!facultyMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      res.json(facultyMatch);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update faculty availability
  app.post("/api/faculty/:id/availability", async (req, res) => {
    try {
      const { availability } = req.body;
      const { data, error } = await getSupabase()
        .from("faculty")
        .update({ full_name: JSON.stringify(availability) })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
        return {
          ...f,
          department: dept ? dept.name : "Unknown Department"
        };
      });
      
      res.json(formattedData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update Faculty Status
  app.post("/api/faculty/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const { error } = await getSupabase()
        .from("faculty")
        .update({ status })
        .eq("id", req.params.id);

      if (error) throw error;

      broadcast("faculty_updated", { faculty_id: req.params.id });
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
      const { student_id, faculty_id, source, student_name, student_email, course, purpose, time_period } = req.body;

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
        .in("status", ["waiting", "next", "serving", "ongoing"])
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ error: "Student already in queue" });
      }

      const targetEmail = student_email || student?.email;
      let autoGeneratedMeetLink: string | null = null;

      try {
        autoGeneratedMeetLink = await createGoogleMeetLink(req);
      } catch (err) {
        console.warn("[Queue Join] Failed to auto-create Google Meet link:", err);
      }

      const meetLinkToSave = time_period
        ? `${time_period}|${autoGeneratedMeetLink || ""}`
        : autoGeneratedMeetLink;

      const queueInsertBase = {
        student_id: student.id,
        faculty_id,
        status: "waiting",
        student_email: targetEmail || null,
        meet_link: meetLinkToSave,
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

        if (missingPurposeColumn) {
          console.warn("Queue insert fallback: 'purpose' column not found. Retrying without purpose.");
          const retry = await getSupabase()
            .from("queue")
            .insert(queueInsertBase)
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
          <p><strong>Virtual Consultation Room:</strong> ${
            autoGeneratedMeetLink
              ? "A Google Meet link has been reserved for your consultation and will appear when it is your turn."
              : "The faculty will provide the Google Meet link when it is your turn."
          }</p>
          <p>Please keep this email. You can track your status on the kiosk or wait for further notifications.</p>
          <br/>
          <p>Thank you!</p>
          `
        );
      }

      broadcast("queue_updated", { faculty_id });
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Booked Slots for Today
  app.get("/api/queue/booked-slots", async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await getSupabase()
        .from("queue")
        .select("faculty_id, meet_link")
        .eq("queue_date", today)
        .in("status", ["waiting", "next", "serving", "ongoing"]);

      if (error) throw error;

      const bookedSlots = data.map((q: any) => {
        const parts = q.meet_link ? q.meet_link.split('|') : [];
        return {
          faculty_id: q.faculty_id,
          time_period: parts.length > 0 ? parts[0] : null
        };
      }).filter((q: any) => q.time_period);

      res.json(bookedSlots);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update faculty profile
  app.patch("/api/faculty/:id", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const email = normalizeEmail(req.body?.email);

      if (!name) {
        return res.status(400).json({ error: "Faculty name is required." });
      }
      if (!email) {
        return res.status(400).json({ error: "Email is required." });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format." });
      }

      const { data, error } = await getSupabase()
        .from("faculty")
        .update({ name, full_name: name, email })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Live queue monitoring (waiting, next, ongoing)
  app.get("/api/admin/queue-monitor", async (req, res) => {
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

      // Prioritize current activity first: serving -> next -> waiting
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
        .in("status", ["waiting", "next", "serving", "ongoing"])
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
            .in("status", ["waiting", "next", "serving", "ongoing"])
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

  // Temporary route to check constraint
  app.get("/api/check-constraint", async (req, res) => {
    try {
      const { data, error } = await getSupabase()
        .from('queue')
        .select('status')
        .limit(1);
      
      const { data: d2, error: e2 } = await getSupabase()
        .rpc('get_constraint_def', { constraint_name: 'queue_status_check' });
        
      res.json({ data, error, d2, e2 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Faculty Action: Update Consultation Status
  app.post("/api/queue/:id/status", async (req, res) => {
    try {
      const { status, meet_link } = req.body;
      const consultationId = req.params.id;

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
        const existingMeetLink = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);

        if (!finalMeetLink && existingMeetLink) {
          finalMeetLink = existingMeetLink;
        }

        if (!finalMeetLink) {
          finalMeetLink = await createGoogleMeetLink(req);
        }

        updates.meet_link = time_period ? `${time_period}|${finalMeetLink}` : finalMeetLink;
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

      const { error: updateError } = await getSupabase()
        .from("queue")
        .update(updates)
        .eq("id", consultationId);

      if (updateError) throw updateError;

      // Notification Logic
      const { data: studentData } = await getSupabase()
        .from("students")
        .select("email, full_name")
        .eq("id", consultation.student_id)
        .maybeSingle();
      
      const targetEmail = consultation.student_email || studentData?.email;
      const studentName = studentData?.full_name || "Student";
      
      const parts = consultation.meet_link ? consultation.meet_link.split('|') : [];
      const actual_link = parts.length > 1 ? parts[1] : (parts.length === 1 && parts[0].startsWith('http') ? parts[0] : null);
      const final_email_link = finalMeetLink || actual_link;

      if (targetEmail) {
        if (status === "serving") {
          sendEmailNotification(
            targetEmail,
            "It's your turn!",
            `
            <h2>Consultation Started</h2>
            <p>Hi ${studentName},</p>
            <p>It's your turn for the consultation!</p>
            ${final_email_link ? `<p>Join the meeting here: <a href="${final_email_link}">${final_email_link}</a></p>` : ''}
            `
          );
        } else if (status === "completed") {
          sendEmailNotification(
            targetEmail,
            "Consultation Completed",
            `
            <h2>Consultation Completed</h2>
            <p>Hi ${studentName},</p>
            <p>Your consultation has been marked as completed. Thank you!</p>
            `
          );
        } else if (status === "cancelled") {
          sendEmailNotification(
            targetEmail,
            "Consultation Cancelled",
            `
            <h2>Consultation Cancelled</h2>
            <p>Hi ${studentName},</p>
            <p>Your consultation has been cancelled.</p>
            `
          );
        }
      }

      broadcast("queue_updated", { faculty_id: consultation.faculty_id });
      res.json({ success: true, meet_link: final_email_link || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
          meet_link: (mappedStatus === "serving" || mappedStatus === "next") ? actual_link : null,
          time_period: time_period
        });
      }
    } catch (err: any) {
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

  // Cleanup old recordings after 48 hours
  setInterval(async () => {
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
      persistOAuthTokens(authContext);
    } catch (err: any) {
      console.error("[Drive Cleanup] Error:", err);
      if (activeMode === "oauth" && (err?.message || "").includes("invalid_grant") && fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH);
      }
    }
  }, 60 * 60 * 1000); // Run every hour

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
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const code = getQueryString(req.query.code);
    const state = getQueryString(req.query.state);
    try {
      if (hasServiceAccountAuth() && hasMeetServiceAccountAuth()) {
        return res
          .status(400)
          .send("Service account mode is enabled for Google Drive and Google Meet. OAuth callback is not used.");
      }

      if (!code) throw new Error("Missing code parameter");
      
      let stateObj: { redirectUri?: string } = {};
      if (state) {
        try {
          stateObj = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
        } catch (err) {
          try {
            stateObj = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
          } catch (fallbackErr) {
            // Fallback for older non-base64 encoded states if any
            stateObj = JSON.parse(state);
          }
        }
      }
      
      const redirectUri = stateObj.redirectUri || resolveOAuthRedirectUri(req);

      const oauth2Client = getOAuth2Client(redirectUri);
      
      const { tokens } = await oauth2Client.getToken(code);
      const mergedTokens = { ...(getAdminTokens() || {}), ...tokens };
      
      saveAdminTokens(mergedTokens, redirectUri);

      const targetOrigin = (() => {
        try {
          return new URL(redirectUri).origin;
        } catch {
          return "*";
        }
      })();
      
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '${targetOrigin}');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("OAuth Callback Error:", err);
      res.status(500).send(`Authentication failed: ${err.message || 'Unknown error'}`);
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
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/drive/upload", upload.single('file'), async (req, res) => {
    let activeMode: "service_account" | "oauth" | "none" = "none";
    try {
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: "Missing file" });
      }

      const authContext = getDriveAuthContext(req);
      activeMode = authContext.mode;
      const drive = google.drive({ version: 'v3', auth: authContext.auth });
      const serviceAccountEmail =
        activeMode === "service_account"
          ? getServiceAccountCredentialsFromEnv()?.client_email || null
          : null;
      
      const fileMetadata: {
        name: string;
        appProperties: { source: string };
        parents?: string[];
      } = {
        name: file.originalname,
        appProperties: {
          source: 'consultation-system'
        }
      };
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
            name: file.originalname,
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

      persistOAuthTokens(authContext);
      
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
      if (activeMode === "oauth" && (err?.message || "").includes("invalid_grant") && fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH);
      }
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
