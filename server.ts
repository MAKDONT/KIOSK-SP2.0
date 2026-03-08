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
const FACULTY_GOOGLE_TOKENS_PATH = path.join(APP_DATA_DIR, "faculty-google-tokens.json");
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
  const getBodyString = (value: unknown): string => {
    const stringValue = getQueryString(value);
    return stringValue ? stringValue.trim() : "";
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
    role?: "admin" | "faculty";
    facultyId?: string;
  };
  type OAuthAuthContext = { mode: "oauth"; auth: any; tokens: any; redirectUri: string };
  type DriveAuthContext =
    | { mode: "service_account"; auth: any }
    | OAuthAuthContext;
  type MeetAuthContext =
    | { mode: "service_account"; auth: any; facultyId?: string }
    | { mode: "faculty_oauth"; auth: any; tokens: any; redirectUri: string; facultyId: string; email?: string | null };

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
    const facultyAuthData = getFacultyGoogleAuthData(facultyId);
    if (facultyAuthData?.tokens && hasFacultyOAuthScope(facultyId, GOOGLE_MEET_CREATE_SCOPE)) {
      const redirectUri = facultyAuthData.redirectUri || resolveOAuthRedirectUri(req);
      const oauth2Client = getOAuth2Client(redirectUri);
      oauth2Client.setCredentials(facultyAuthData.tokens);

      return {
        mode: "faculty_oauth",
        auth: oauth2Client,
        tokens: facultyAuthData.tokens,
        redirectUri,
        facultyId,
        email: facultyAuthData.email || null,
      };
    }

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
      "Google Meet is not connected for this faculty. Connect your Google account in the Faculty Dashboard or paste a manual Google Meet link."
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
      if (authContext.mode === "faculty_oauth" && !authContext.email) {
        try {
          authContext.email = await getGoogleAccountEmail(authContext.auth);
        } catch {
          authContext.email = null;
        }
      }

      const connectedEmail =
        authContext.mode === "faculty_oauth" ? normalizeEmail(authContext.email) : null;

      if (
        connectedEmail &&
        (connectedEmail.endsWith("@gmail.com") || connectedEmail.endsWith("@googlemail.com"))
      ) {
        throw new Error(
          "Personal Gmail accounts cannot create locked Google Meet rooms that require host approval. Connect a Google Workspace faculty account or paste a manual Google Meet link created from an account that supports host approval."
        );
      }

      const accessToken = await getGoogleAccessToken(authContext.auth);
      const response = await fetch("https://meet.googleapis.com/v2/spaces", {
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
          throw new Error("Google Meet access is not authorized for this faculty. Reconnect your Google account in the Faculty Dashboard.");
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

      if (actualAccessType && actualAccessType !== "RESTRICTED") {
        throw new Error(
          `Google created this meeting with access type "${actualAccessType}" instead of "RESTRICTED". Use a Google Workspace faculty account, a manual Meet link from an account that supports host approval, or adjust the account's Meet policy before auto-generating links.`
        );
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
      const meetLinkToSave = time_period || null;

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
          <p><strong>Virtual Consultation Room:</strong> The faculty will provide the Google Meet link when it is your turn.</p>
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

        if (!finalMeetLink) {
          finalMeetLink = await createGoogleMeetLink(consultation.faculty_id, req);
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

  app.get("/api/faculty/:id/google/status", async (req, res) => {
    try {
      const facultyId = getBodyString(req.params.id);
      if (!facultyId) {
        return res.status(400).json({ error: "Faculty ID is required." });
      }

      const stored = getFacultyGoogleAuthData(facultyId);
      if (stored?.tokens && hasFacultyOAuthScope(facultyId, GOOGLE_MEET_CREATE_SCOPE)) {
        return res.json({
          connected: true,
          mode: "oauth",
          email: stored.email || null,
          connectedAt: stored.timestamp ? new Date(stored.timestamp).toISOString() : null,
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
        scope: [GOOGLE_MEET_CREATE_SCOPE],
        state: encodeOAuthState({ redirectUri, role: "faculty", facultyId }),
        prompt: "consent",
        login_hint: normalizeEmail(facultyRecord.email),
      });

      res.json({ url, redirectUri, mode: "oauth" });
    } catch (err: any) {
      console.error("Faculty Google OAuth URL Error:", err);
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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

    const sendOAuthResponse = (payload: Record<string, unknown>) => {
      const serializedPayload = JSON.stringify(payload);
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
            <p>${typeof payload.message === "string" ? payload.message : "Authentication complete."}</p>
          </body>
        </html>
      `);
    };

    try {
      if (!code) throw new Error("Missing code parameter");

      const redirectUri = stateObj.redirectUri || resolveOAuthRedirectUri(req);
      const oauth2Client = getOAuth2Client(redirectUri);
      const { tokens } = await oauth2Client.getToken(code);

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
      res.status(500);
      sendOAuthResponse({
        type: stateObj.role === "faculty" ? "FACULTY_GOOGLE_AUTH_ERROR" : "OAUTH_AUTH_ERROR",
        error: err.message || "Authentication failed.",
        message: `Authentication failed: ${err.message || "Unknown error"}`,
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
        error: err?.message || "Supabase recording storage is unavailable.",
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
        error: err?.message || "Failed to list Supabase recordings.",
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
        error: err?.message || "Failed to upload recording to Supabase Storage.",
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
