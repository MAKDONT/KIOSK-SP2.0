# Comprehensive Code Analysis Report
## React + TypeScript + Express.js Project

**Generated:** March 13, 2026  
**Analysis Scope:** Full codebase audit including backend, React components, hooks, and configuration

---

## CRITICAL SEVERITY ISSUES

### 1. **JSON.parse() Without Try-Catch in WebSocket Handlers**
**Files:** 
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L185-L191)
- [KioskView.tsx](src/components/KioskView.tsx#L52)
- [FacultyDashboard.tsx](src/components/FacultyDashboard.tsx#L121)

**Issue:** WebSocket `onmessage` handlers call `JSON.parse()` without try-catch. Malformed WebSocket messages will crash the component.

```typescript
// VULNERABLE CODE at AdminDashboard.tsx:185
ws.onmessage = (event) => {
  const data = JSON.parse(event.data); // ❌ NO TRY-CATCH
  if (data.type === "queue_updated") {
    fetchLiveQueue(1, true);
  }
};
```

**Risk:** Server crash, application becomes unresponsive  
**Fix:** Wrap in try-catch block and handle parse errors gracefully

---

### 2. **Race Condition: Unguarded WebSocket Creation in useEffect**
**Files:**
- [Login.tsx](src/components/Login.tsx#L60-L82)
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L179-L205)
- [FacultyDashboard.tsx](src/components/FacultyDashboard.tsx#L108-L134)

**Issue:** WebSocket created in useEffect without dependency array guard. Multiple WebSocket connections can be created on rapid component re-renders, creating memory leaks and connection exhaustion.

```typescript
// VULNERABLE CODE at Login.tsx:60
useEffect(() => {
  // ... other code ...
  const ws = new WebSocket(`${protocol}//${window.location.host}`);
  // WebSocket created without cleanup guarantee if deps change
  return () => {
    clearInterval(interval);
    ws.close();
  };
}, []); // Empty array is OK, but no safety checks for connection state
```

**Risk:** Memory leaks, server connection exhaustion, multiple stale connections  
**Fix:** Check WebSocket state before creating new connection; add proper connection lifecycle management

---

### 3. **Unhandled Promise Rejection in Async API Calls**
**Files:**
- [Login.tsx](src/components/Login.tsx#L97-L110)
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L340-L365)
- [FacultyDashboard.tsx](src/components/FacultyDashboard.tsx#L186-L215)

**Issue:** Async functions called without `.catch()` handler in useEffect causing potential unhandled promise rejections.

```typescript
// VULNERABLE CODE at AdminDashboard.tsx:340
fetchLiveQueue(1, true); // Called without await or catch
fetchAdminEmail();        // Called without await or catch
```

**Risk:** Unhandled promise rejection warnings, silent failures  
**Fix:** Add `.catch()` handlers or use try-catch in async functions

---

### 4. **Type Safety Issues: Implicit `any` Types Throughout**
**Files:**
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L35-45) - `useState<any[]>()`
- [useColleges.ts](src/hooks/useColleges.ts#L5) - `const [colleges, setColleges] = useState<any[]>([])`
- [server.ts](server.ts#L217) - `function requireAdminAuth(req: any, res: any, next: any)`

**Issue:** Extensive use of `any` type disables TypeScript's type checking, allowing runtime errors.

**Risk:** Type mismatches, silent runtime errors, refactoring hazards  
**Fix:** Define proper interfaces for data structures. Example:

```typescript
interface College {
  id: string;
  name: string;
  code: string;
}
const [colleges, setColleges] = useState<College[]>([]);
```

---

### 5. **Missing Error Boundary in Top-Level Components**
**Files:**
- [App.tsx](src/App.tsx)
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx)
- [FacultyDashboard.tsx](src/components/FacultyDashboard.tsx)

**Issue:** No React Error Boundary wrapping components. An error in any sub-component will crash the entire application.

**Risk:** Application crash on any component error  
**Fix:** Implement Error Boundary component to catch and handle React errors gracefully

---

### 6. **SQL Injection Risk: User Input in Query Parameters**
**Files:**
- [Login.tsx](src/components/Login.tsx#L97) - `identifier` field sent to `/api/queue/join`
- [server.ts](server.ts#L2301-2350) - `/api/queue/join` endpoint

**Issue:** Student identifiers/emails are validated only on frontend but directly used in database queries without parameterized queries verification.

```typescript
// Potential issue if validators not applied at backend
const { data, error } = await getSupabase()
  .from("queue")
  .insert({ ... student_id: validators.studentId(studentId) ... });
```

**Risk:** SQL injection if validators are bypassed  
**Fix:** Ensure all user inputs are validated server-side before use in queries

---

### 7. **LocalStorage Direct Access Without Error Handling**
**Files:**
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L153)
- [FacultyDashboard.tsx](src/components/FacultyDashboard.tsx#L91)
- [Login.tsx](src/components/Login.tsx)

**Issue:** Direct `localStorage.getItem()` calls can fail in private browsing mode or when access is denied.

```typescript
// VULNERABLE CODE at AdminDashboard.tsx:153
if (localStorage.getItem("user_role") !== "admin") {
  navigate("/admin/login");
}
```

**Risk:** Application crash on private browsing, security bypass  
**Fix:** Wrap in try-catch and handle QuotaExceededError

---

### 8. **No CSRF Protection on State-Modifying Endpoints**
**Files:**
- [server.ts](server.ts#L1530-1593) - `/api/colleges` POST
- [server.ts](server.ts#L1660-1712) - `/api/departments` POST
- [server.ts](server.ts#L1990-2113) - `/api/faculty` POST

**Issue:** Admin endpoints modify state but lack CSRF token validation. Any malicious site can trigger requests from authenticated users.

**Risk:** Unauthorized data modification, account hijacking  
**Fix:** Implement CSRF token validation on all state-modifying endpoints

---

## HIGH SEVERITY ISSUES

### 9. **Unsafe useEffect Dependency Arrays**
**Files:**
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L153-165)

**Issue:** Dependency array only includes `[navigate]` but function uses many other dependencies that could change.

```typescript
// VULNERABLE CODE at AdminDashboard.tsx:153
useEffect(() => {
  // ... uses fetchDepartments, fetchColleges, fetchFaculties, etc ...
  fetchDepartments();
  fetchColleges();
  fetchFaculties();
}, [navigate]); // ❌ Missing dependencies
```

**Risk:** Stale closures, infinite loops, inconsistent state  
**Fix:** Add all used functions to dependency array or use useCallback

---

### 10. **Missing Error Handling in API Calls**
**Files:**
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L225-235) - `checkDriveStatus()`

**Issue:** API calls don't check `res.ok` before calling `.json()`:

```typescript
// VULNERABLE CODE at AdminDashboard.tsx:225
const res = await fetch(`/api/drive/status`);
const data = await res.json(); // May throw if 4xx/5xx response
```

**Risk:** Runtime errors, silent failures, misleading state  
**Fix:** Check `res.ok` or use error handling wrapper

---

### 11. **WebSocket Message Error Handling Missing in Login Component**
**Files:**
- [Login.tsx](src/components/Login.tsx#L60-82)

**Issue:** WebSocket has no `onerror` or `onclose` handlers for connection failures.

**Risk:** Silent connection failures, stale data display  
**Fix:** Add `ws.onerror` and `ws.onclose` handlers with reconnection logic

---

### 12. **No Validation on File Upload MIME Types**
**Files:**
- [server.ts](server.ts#L37-45)

**Issue:** While multer validates MIME types, the validation only checks ALLOWED_UPLOAD_MIMETYPES. If a file bypasses this, no additional validation occurs.

```typescript
// VULNERABLE: No re-validation in handler
app.post("/api/recordings/upload", upload.single("file"), async (req, res) => {
  // No file type re-validation in handler
  const file = req.file;
  // File directly used without verification
});
```

**Risk:** malicious file upload  
**Fix:** Re-validate file type in request handler

---

### 13. **Missing Expiration Check on OAuth Tokens**
**Files:**
- [server.ts](server.ts#L1015-1025)

**Issue:** OAuth tokens are checked for expiration but no auto-refresh mechanism when nearly expired before use.

```typescript
// Token expiration calculated but not refreshed proactively
const expiresAtMs = data.timestamp + TOKEN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const expired = Date.now() > expiresAtMs;
```

**Risk:** Sudden token expiration during request, failed operations  
**Fix:** Refresh token before expiration

---

### 14. **Unhandled Network Errors in Fetch Calls**
**Files:**
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L298-320)
- [FacultyDashboard.tsx](src/components/FacultyDashboard.tsx#L186-215)

**Issue:** Many fetch calls don't handle network errors separately from HTTP errors.

**Risk:** Network timeouts appear as silent failures  
**Fix:** Add network error handling

---

### 15. **useCallback Missing Dependencies**
**Files:**
- [useDriveIntegration.ts](src/hooks/useDriveIntegration.ts#L36-51)
- [useColleges.ts](src/hooks/useColleges.ts#L17-33)

**Issue:** useCallback hooks have incomplete dependency arrays, causing stale function references.

```typescript
// VULNERABLE at useColleges.ts:17
const fetchColleges = useCallback(async (retries = 3) => {
  // ...
}, []); // Empty deps but function references state/props
```

**Risk:** Stale closures, missed updates  
**Fix:** Add all external dependencies to dependency array

---

## MEDIUM SEVERITY ISSUES

### 16. **Insufficient Input Validation for Edge Cases**
**Files:**
- [server.ts](server.ts#L550-630)

**Issue:** Name validators allow only 1+ character but no min length check on some fields.

```typescript
name: (value: any): string => {
  const name = String(value || "").trim();
  if (!name || name.length > 255) throw new Error("Invalid name");
  return name;
  // ❌ Single-char names like "A" are accepted
},
```

**Risk:** Display issues, data quality problems  
**Fix:** Add minimum length requirements

---

### 17. **Missing Null/Undefined Checks Before Operations**
**Files:**
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L1198-1220)

**Issue:** Array operations without null checks:

```typescript
const departmentById = new Map<string, any>(
  (departments || []).map((d: any) => [String(d.id), d])
); // Good fallback, but d.id not null-checked within map
```

**Risk:** Runtime errors if nested properties undefined  
**Fix:** Add nested null checks

---

### 18. **Inefficient Re-renders: Map Recreation on Every Render**
**Files:**
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L1178-1220)

**Issue:** Maps and filtered arrays created during render without memoization.

```typescript
// PERFORMANCE ISSUE: Created on every render
const departmentById = new Map<string, any>(
  (departments || []).map((d: any) => [String(d.id), d])
);
```

**Risk:** O(n) re-computation on every render, unnecessary renders  
**Fix:** Use useMemo to memoize computations

---

### 19. **Missing Timeout on Long-Running Operations**
**Files:**
- [server.ts](server.ts#L3837-4000) - Recording upload endpoint

**Issue:** File uploads have no timeout specified, allowing indefinite requests.

**Risk:** Resource exhaustion, slow client attack  
**Fix:** Add request timeout middleware

---

### 20. **Weak Password Requirements**
**Files:**
- [server.ts](server.ts#L608-612)

**Issue:** Password validation only checks length (8+ chars), no complexity requirements.

```typescript
password: (value: any): string => {
  const password = String(value || "");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  // ❌ No complexity: allows "aaaaaaaa"
  return password;
},
```

**Risk:** Weak password attacks  
**Fix:** Require uppercase, lowercase, numbers, symbols

---

### 21. **Console.error Exposing Sensitive Information**
**Files:**
- [server.ts](server.ts#L650)
- Throughout React components

**Issue:** Error messages sent to console and potentially to monitoring services without sanitization.

```typescript
function sendError(res: any, statusCode: number, message: string, details?: any): void {
  if (details) console.error(`Error[${statusCode}]:`, message, details); // Could expose secrets
  res.status(statusCode).json({
    error: process.env.NODE_ENV === "production" ? "An error occurred" : message
  });
}
```

**Risk:** Information disclosure in logs  
**Fix:** Sanitize error details, never log sensitive data

---

### 22. **No Rate Limiting on Public Endpoints**
**Files:**
- [server.ts](server.ts#L2114-2175) - Faculty login
- [server.ts](server.ts#L1383-1438) - Admin login

**Issue:** Login endpoints have no rate limiting, allowing brute force attacks.

**Risk:** Credential brute force, denial of service  
**Fix:** Implement rate limiting middleware

---

### 23. **Clear Text Storage of OAuth Tokens**
**Files:**
- [server.ts](server.ts#L1055-1060)

**Issue:** OAuth tokens stored as plain JSON in filesystem without encryption.

```typescript
function saveAdminTokens(tokens: any, redirectUri: string) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ // ❌ Unencrypted
    tokens,
    timestamp: Date.now(),
    redirectUri
  }));
}
```

**Risk:** Token theft if server compromised  
**Fix:** Encrypt tokens before storage

---

### 24. **Missing Origin Validation for Sensitive Operations**
**Files:**
- [server.ts](server.ts#L950-1000)

**Issue:** CORS allows broad origins but doesn't validate origin on all sensitive endpoints.

```typescript
const isProductionSelf = process.env.NODE_ENV === "production" && 
                        origin && 
                        origin.includes("onrender.com") && // ❌ Partial match!
                        origin.includes("kiosk-sp2");
```

**Risk:** Cross-origin request forgery  
**Fix:** Use exact domain matching, not substring matching

---

### 25. **Component Does Not Unsubscribe from WebSocket While Route Changes**
**Files:**
- [FacultyDashboard.tsx](src/components/FacultyDashboard.tsx#L108-134)

**Issue:** WebSocket connection may not close immediately when navigating away if component unmounts asynchronously.

**Risk:** Memory leaks, ghost WebSocket connections  
**Fix:** Use proper cleanup in useEffect return

---

## LOW SEVERITY ISSUES

### 26. **Unnecessary Type Coercion in Comparisons**
**Files:**
- [FacultyDashboard.tsx](src/components/FacultyDashboard.tsx#L143)

**Issue:** String comparison with unnecessary coercion:

```typescript
if (event.data?.facultyId && String(event.data.facultyId) !== String(selectedFaculty)) {
  // Both are already strings, coercion unnecessary
}
```

**Risk:** Minimal | Readability issue  
**Fix:** Remove redundant String() calls

---

### 27. **Missing Proptypes or Zod Validation for Response Objects**
**Files:**
- Frontend hooks assume backend response structure

**Issue:** No runtime validation that API responses match expected shape.

**Risk:** Type mismatch when backend API changes  
**Fix:** Use Zod or runtime validation

---

### 28. **Hard-coded Magic Numbers**
**Files:**
- [server.ts](server.ts#L40) - `100 * 1024 * 1024` (100MB)
- [Login.tsx](src/components/Login.tsx#L356) - `120` (milliseconds)

**Issue:** Magic numbers without constants or comments.

**Risk:** Maintenance difficulty  
**Fix:** Extract to named constants

---

### 29. **Missing Logging for Security Events**
**Files:**
- [server.ts](server.ts#L243-265) - Audit logging exists but audit_logs table may not exist

**Issue:** Failed login attempts, denied access not comprehensively logged.

**Risk:** Security incident detection difficulty  
**Fix:** Ensure all security events logged reliably

---

### 30. **Deprecated String Comparison in useEffect**
**Files:**
- [AdminDashboard.tsx](src/components/AdminDashboard.tsx#L153)

**Issue:** localStorage key checked multiple times (redundant calls):

```typescript
if (localStorage.getItem("user_role") !== "admin") { // Called in multiple useEffects
  navigate("/admin/login");
}
```

**Risk:** Code smell | Could extract to custom hook  
**Fix:** Create useAuth() hook

---

## SUMMARY TABLE

| Severity | Count | Category |
|----------|-------|----------|
| **CRITICAL** | 8 | JSON parsing, WebSocket leaks, type safety, error boundaries |
| **HIGH** | 7 | Dependency arrays, error handling, validation |
| **MEDIUM** | 8 | Input validation, performance, security headers |
| **LOW** | 7 | Code quality, maintainability |
| **TOTAL** | **30** | |

---

## RECOMMENDED FIXES (Priority Order)

### Phase 1: Critical Issues (Week 1)
1. ✅ Add try-catch to all JSON.parse() calls
2. ✅ Implement proper WebSocket lifecycle management
3. ✅ Add TypeScript interfaces for all data types
4. ✅ Create Error Boundary component
5. ✅ Add CSRF protection to admin endpoints

### Phase 2: High Severity (Week 2)
6. ✅ Fix useEffect dependency arrays
7. ✅ Add comprehensive error handling to fetch calls
8. ✅ Implement token refresh mechanism
9. ✅ Add file upload validation in handlers
10. ✅ Add network error handling

### Phase 3: Medium Severity (Week 3)
11. ✅ Implement rate limiting
12. ✅ Encrypt stored tokens
13. ✅ Add input validation edge cases
14. ✅ Memoize expensive computations
15. ✅ Add request timeouts

### Phase 4: Low Severity (Week 4)
16. ✅ Create useAuth() custom hook
17. ✅ Add Zod validation
18. ✅ Extract magic numbers to constants
19. ✅ Improve logging and monitoring
20. ✅ Code cleanup and refactoring

---

## TESTING RECOMMENDATIONS

1. **Unit Tests**: Add tests for validators, data transformation functions
2. **Integration Tests**: Test API endpoints with auth middleware
3. **E2E Tests**: Test critical user flows (login, queue join, consultation)
4. **Security Tests**: CSRF testing, SQL injection attempts, XSS payload testing
5. **Performance Tests**: WebSocket connection stress testing, large data set rendering

---

