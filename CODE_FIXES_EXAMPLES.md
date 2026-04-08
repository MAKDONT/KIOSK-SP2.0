# Code Fixes & Implementation Examples

## 1. FIX: JSON.parse() Try-Catch Pattern

### Current Vulnerable Code
```typescript
// AdminDashboard.tsx:185
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "queue_updated") {
    fetchLiveQueue(1, true);
  }
};
```

### Fixed Code
```typescript
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === "queue_updated") {
      fetchLiveQueue(1, true);
    } else if (data.type === "faculty_updated") {
      fetchFaculties();
      fetchLiveQueue(1, true);
    }
  } catch (err) {
    console.error("Failed to parse WebSocket message:", err);
    // Optionally attempt reconnect or show user warning
  }
};
```

---

## 2. FIX: Proper Error Handling for Fetch Calls

### Current Vulnerable Code
```typescript
// AdminDashboard.tsx:225
const checkDriveStatus = async () => {
  try {
    const res = await fetch(`/api/drive/status`);
    const data = await res.json();
    setDriveConnected(data.driveConnected ?? data.connected);
  } catch (err) {
    console.error("Failed to check drive status", err);
  }
};
```

### Fixed Code
```typescript
const checkDriveStatus = async () => {
  try {
    const res = await fetch(`/api/drive/status`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to fetch drive status`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Server returned non-JSON response");
    }
    const data = await res.json();
    
    // Validate response structure
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid response structure from server");
    }
    
    setDriveConnected(data.driveConnected ?? data.connected);
    setDriveMode(data.driveMode || data.mode || "none");
    // ... set other state
  } catch (err) {
    console.error("Failed to check drive status:", err);
    // Show user-friendly error message
    setError(err instanceof Error ? err.message : "Failed to load drive status");
  }
};
```

---

## 3. FIX: WebSocket Lifecycle Management

### Current Problematic Code
```typescript
// Login.tsx:60
useEffect(() => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}`);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "faculty_updated" || data.type === "queue_updated") {
      fetchFaculty();
      fetchLiveQueue(1, true);
    }
  };

  return () => {
    clearInterval(interval);
    ws.close();
  };
}, []);
```

### Fixed Code
```typescript
const wsRef = useRef<WebSocket | null>(null);
const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const [reconnectAttempts, setReconnectAttempts] = useState(0);

useEffect(() => {
  let isComponentMounted = true;
  
  const connectWebSocket = () => {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onopen = () => {
        if (!isComponentMounted) return;
        console.log("WebSocket connected");
        setReconnectAttempts(0);
      };
      
      ws.onmessage = (event) => {
        if (!isComponentMounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "faculty_updated" || data.type === "queue_updated") {
            fetchFaculty();
            fetchLiveQueue(1, true);
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };
      
      ws.onerror = (event) => {
        console.error("WebSocket error:", event);
      };
      
      ws.onclose = () => {
        if (!isComponentMounted) return;
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          setReconnectAttempts(prev => prev + 1);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isComponentMounted) {
              connectWebSocket();
            }
          }, RECONNECT_DELAY_MS);
        }
      };
      
      wsRef.current = ws;
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
    }
  };
  
  connectWebSocket();
  
  const interval = setInterval(() => {
    if (isComponentMounted && wsRef.current?.readyState === WebSocket.OPEN) {
      fetchLiveQueue(1, true);
    }
  }, 15000);
  
  return () => {
    isComponentMounted = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    
    clearInterval(interval);
  };
}, []);
```

---

## 4. FIX: Type Safety with Interfaces

### Create interfaces file (`src/types/index.ts`)
```typescript
export interface Faculty {
  id: string;
  name: string;
  full_name?: string;
  email: string;
  department: string;
  department_id: string;
  college_id?: string;
  status: "available" | "busy" | "offline";
  availability_slots?: AvailabilitySlot[];
}

export interface College {
  id: string;
  name: string;
  code: string;
  created_at?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  college_id: string;
  college?: College;
  created_at?: string;
}

export interface LiveQueueItem {
  id: number;
  status: "waiting" | "serving";
  created_at: string;
  faculty_id: string;
  faculty_name: string;
  student_name: string;
  student_number: string;
  time_period?: string | null;
  meet_link?: string | null;
}

export interface Consultation {
  id: number;
  student_id: string;
  student_name: string;
  student_number?: string;
  status: "waiting" | "serving" | "completed" | "cancelled";
  created_at: string;
  source: string;
  meet_link?: string;
  purpose?: string;
  time_period?: string | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

### Update components
```typescript
// Before
const [faculty, setFaculty] = useState<any[]>([]);

// After
import { Faculty } from '../types';
const [faculty, setFaculty] = useState<Faculty[]>([]);
```

---

## 5. FIX: Dependency Array Issues

### Current Problem Code
```typescript
// AdminDashboard.tsx:153
useEffect(() => {
  if (localStorage.getItem("user_role") !== "admin") {
    navigate("/admin/login");
    return;
  }
  fetchDepartments();
  fetchColleges();
  fetchFaculties();
  checkDriveStatus();
  checkRecordingStorageStatus();
  fetchLiveQueue();
  fetchAdminEmail();
}, [navigate]); // ❌ Missing many dependencies
```

### Fixed Code
```typescript
// Create memoized callback functions that don't change
const memoizedFetchDepartments = useCallback(async () => {
  try {
    const res = await fetch("/api/departments", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data: Department[] = await res.json();
    setDepartments(data);
  } catch (err) {
    console.error("Failed to fetch departments", err);
  }
}, []);

const memoizedFetchColleges = useCallback(async () => {
  try {
    const res = await fetch("/api/colleges", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data: College[] = await res.json();
    setColleges(data);
  } catch (err) {
    console.error("Failed to fetch colleges", err);
  }
}, []);

// Now use in useEffect with proper dependencies
useEffect(() => {
  const checkAuth = () => {
    try {
      if (localStorage.getItem("user_role") !== "admin") {
        navigate("/admin/login");
        return;
      }
    } catch (err) {
      console.error("LocalStorage access failed:", err);
      navigate("/admin/login");
      return;
    }
    
    void memoizedFetchDepartments();
    void memoizedFetchColleges();
    void memoizedFetchFaculties();
    void checkDriveStatus();
    void checkRecordingStorageStatus();
    void fetchLiveQueue();
    void fetchAdminEmail();
  };
  
  checkAuth();
}, [
  navigate,
  memoizedFetchDepartments,
  memoizedFetchColleges,
  memoizedFetchFaculties,
  checkDriveStatus,
  checkRecordingStorageStatus,
  fetchLiveQueue,
  fetchAdminEmail,
]);
```

---

## 6. FIX: Safe LocalStorage Access

### Utility function (`src/utils/storage.ts`)
```typescript
export const safeGetFromStorage = (key: string, defaultValue: string = ""): string => {
  try {
    // Check if localStorage is available
    if (typeof window === "undefined" || !window.localStorage) {
      return defaultValue;
    }
    
    return window.localStorage.getItem(key) ?? defaultValue;
  } catch (err) {
    console.warn(`Failed to access localStorage key "${key}":`, err);
    // Private browsing mode or quota exceeded
    return defaultValue;
  }
};

export const safeSetInStorage = (key: string, value: string): boolean => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    
    window.localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error(`Failed to set localStorage key "${key}":`, err);
    return false;
  }
};

export const safeClearFromStorage = (key: string): boolean => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    
    window.localStorage.removeItem(key);
    return true;
  } catch (err) {
    console.error(`Failed to clear localStorage key "${key}":`, err);
    return false;
  }
};

export const safeCheckAuth = (): boolean => {
  const userRole = safeGetFromStorage("user_role");
  return userRole === "admin" || userRole === "faculty" || userRole === "student";
};
```

### Usage in components
```typescript
import { safeGetFromStorage, safeCheckAuth } from '../utils/storage';

// In AdminDashboard
useEffect(() => {
  if (!safeCheckAuth() || safeGetFromStorage("user_role") !== "admin") {
    navigate("/admin/login");
    return;
  }
  // ... rest of effect
}, [navigate]);
```

---

## 7. FIX: CSRF Protection on Admin Endpoints

### Middleware (`server.ts`)
```typescript
import crypto from "crypto";

interface CSRFTokenStore {
  [token: string]: {
    createdAt: number;
    used: boolean;
  };
}

const csrfTokenStore: CSRFTokenStore = {};
const CSRF_TOKEN_EXPIRY_MS = 1 * 60 * 60 * 1000; // 1 hour

// Cleanup expired CSRF tokens every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of Object.entries(csrfTokenStore)) {
    if (now - data.createdAt > CSRF_TOKEN_EXPIRY_MS) {
      delete csrfTokenStore[token];
    }
  }
  console.log(`[CSRF] Cleaned up expired tokens. Remaining: ${Object.keys(csrfTokenStore).length}`);
}, 30 * 60 * 1000);

function generateCSRFToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  csrfTokenStore[token] = {
    createdAt: Date.now(),
    used: false,
  };
  return token;
}

function validateCSRFToken(token: string): boolean {
  const entry = csrfTokenStore[token];
  if (!entry) {
    console.warn(`[CSRF] Invalid or expired token attempted`);
    return false;
  }
  
  if (entry.used) {
    console.warn(`[CSRF] Token reuse attempted`);
    delete csrfTokenStore[token];
    return false;
  }
  
  const isExpired = Date.now() - entry.createdAt > CSRF_TOKEN_EXPIRY_MS;
  if (isExpired) {
    delete csrfTokenStore[token];
    console.warn(`[CSRF] Expired token attempted`);
    return false;
  }
  
  entry.used = true;
  return true;
}

// Middleware to validate CSRF on state-modifying requests
function requireCSRFToken(req: any, res: any, next: any) {
  if (["POST", "PATCH", "DELETE"].includes(req.method)) {
    const token = req.headers["x-csrf-token"] || req.body?.csrfToken;
    
    if (!token || !validateCSRFToken(token)) {
      console.error(`[CSRF] Failed validation for ${req.method} ${req.path}`);
      return res.status(403).json({ error: "CSRF token validation failed" });
    }
  }
  next();
}

// Add middleware after other middleware
app.use(requireCSRFToken);

// Endpoint to issue CSRF tokens
app.get("/api/csrf-token", (req, res) => {
  const token = generateCSRFToken();
  res.json({ csrfToken: token });
});
```

### Frontend usage
```typescript
// Get CSRF token before submitting admin form
const [csrfToken, setCSRFToken] = useState("");

useEffect(() => {
  const fetchCSRFToken = async () => {
    try {
      const res = await fetch("/api/csrf-token");
      const data = await res.json();
      setCSRFToken(data.csrfToken);
    } catch (err) {
      console.error("Failed to fetch CSRF token:", err);
    }
  };
  
  fetchCSRFToken();
}, []);

// When submitting
const handleAddCollege = async () => {
  if (!csrfToken) {
    alert("Security token not ready. Please try again.");
    return;
  }
  
  try {
    const res = await fetch("/api/colleges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      credentials: "include",
      body: JSON.stringify({
        name: collegeName,
        code: collegeCode,
        password: collegePwd,
      }),
    });
    // ... handle response
  } catch (err) {
    setError("Failed to add college: " + err.message);
  }
};
```

---

## 8. FIX: Memoization for Performance

### Current Problematic Code
```typescript
// AdminDashboard.tsx:1178
const departmentById = new Map<string, any>(
  (departments || []).map((d: any) => [String(d.id), d])
); // Recreated on every render!
```

### Fixed Code
```typescript
const departmentById = useMemo(() => {
  return new Map<string, Department>(
    (departments || []).map((d: Department) => [String(d.id), d])
  );
}, [departments]);

const collegeById = useMemo(() => {
  return new Map<string, College>(
    (colleges || []).map((c: College) => [String(c.id), c])
  );
}, [colleges]);

const facultiesByCollege = useMemo(() => {
  return (colleges || []).map((college: College) => {
    const collegeDepts = (departments || []).filter(
      (d: Department) => String(d.college_id) === String(college.id)
    );
    const deptGroups = collegeDepts.map((dept: Department) => {
      const deptFaculties = (faculties || []).filter(
        (fac: Faculty) => String(fac.department_id) === String(dept.id)
      );
      return {
        id: String(dept.id),
        name: dept.name,
        items: deptFaculties,
      };
    });
    const totalFaculty = deptGroups.reduce(
      (sum: number, g: any) => sum + g.items.length,
      0
    );
    return {
      id: String(college.id),
      name: college.name,
      departments: deptGroups,
      totalFaculty,
    };
  });
}, [colleges, departments, faculties]);

const filteredFacultiesByCollege = useMemo(() => {
  if (facultySearch.trim() === "") return facultiesByCollege;
  
  return facultiesByCollege
    .map((college: any) => ({
      ...college,
      departments: college.departments
        .map((dept: any) => ({
          ...dept,
          items: dept.items.filter(
            (fac: Faculty) =>
              fac.name.toLowerCase().includes(facultySearch.toLowerCase()) ||
              fac.email.toLowerCase().includes(facultySearch.toLowerCase())
          ),
        }))
        .filter((dept: any) => dept.items.length > 0),
    }))
    .filter((college: any) => college.departments.length > 0);
}, [facultiesByCollege, facultySearch]);
```

---

## 9. FIX: OAuth Token Refresh

### Server-side implementation
```typescript
// In server.ts - update getDriveAuthContext

const getDriveAuthContext = async (req?: express.Request): Promise<DriveAuthContext> => {
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
    throw new Error(
      "Google Drive is not connected. Configure a service account or connect an admin Google account."
    );
  }

  const redirectUri = getAdminRedirectUri() || resolveOAuthRedirectUri(req);
  const oauth2Client = getOAuth2Client(redirectUri);
  oauth2Client.setCredentials(tokens);

  // Check if token needs refresh (if expiry_date exists and is within 5 minutes)
  if (tokens.expiry_date) {
    const expiryTime = tokens.expiry_date;
    const now = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;

    if (expiryTime - now < fiveMinutesMs) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        saveAdminTokens(credentials, redirectUri);
        console.log("[OAuth] Token refreshed proactively");
      } catch (err) {
        console.error("[OAuth] Token refresh failed:", err);
        // Continue with current tokens, will fail if truly expired
      }
    }
  }

  return {
    mode: "oauth",
    auth: oauth2Client,
    tokens: oauth2Client.credentials,
    redirectUri,
  };
};
```

---

## 10. FIX: Rate Limiting Implementation

### Install package
```bash
npm install express-rate-limit
```

### Server setup
```typescript
import rateLimit from "express-rate-limit";

// Strict rate limit for login endpoints (5 attempts per 15 minutes)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: "Too many login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limit for localhost in development
    return process.env.NODE_ENV !== "production" &&
           (req.ip === "127.0.0.1" || req.ip === "::1");
  },
  keyGenerator: (req) => {
    // Rate limit per IP
    return req.ip || "unknown";
  },
});

// General API rate limit (100 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply limiters
app.post("/api/admin/login", loginLimiter, async (req, res) => {
  // ... endpoint code
});

app.post("/api/faculty/login", loginLimiter, async (req, res) => {
  // ... endpoint code
});

app.use("/api/", apiLimiter); // Apply to all API routes
```

---

