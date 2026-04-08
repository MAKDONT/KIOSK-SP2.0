import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, LogIn, ScanLine, Keyboard, Clock } from "lucide-react";

interface Faculty {
  id: string;
  name: string;
  full_name?: string;
  department: string;
  status: "available" | "busy" | "offline";
}

interface AvailabilitySlot {
  day: string;
  start: string;
  end: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

interface LiveQueueItem {
  id: number;
  status: "waiting" | "serving";
  created_at: string;
  faculty_id: string;
  faculty_name: string;
  student_name: string;
  student_number: string;
  time_period?: string | null;
}

export default function Login() {
  const [inputMode, setInputMode] = useState<"scan" | "manual">("scan");
  
  // Student Fields
  const [identifier, setIdentifier] = useState(""); // Student ID or Email
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [course, setCourse] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const autoScanSubmittingRef = useRef(false);
  const scannerBufferRef = useRef("");
  const scannerBufferTimerRef = useRef<number | null>(null);
  const lastScanValueRef = useRef("");
  const lastScanAtRef = useRef(0);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [liveQueue, setLiveQueue] = useState<LiveQueueItem[]>([]);
  const [liveQueueLoading, setLiveQueueLoading] = useState(false);

  useEffect(() => {
    fetchFaculty();
    fetchDepartments();
    fetchLiveQueue();
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "faculty_updated" || data.type === "queue_updated") {
          fetchFaculty();
          fetchLiveQueue(1, true);
        }
      } catch (err) {
        console.error("Login WS message parse error", err);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.warn("WebSocket connection closed");
    };

    const interval = setInterval(() => {
      fetchLiveQueue(1, true);
    }, 15000);

    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, []);

  const fetchFaculty = async (retries = 3) => {
    try {
      const res = await fetch("/api/faculty");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaculty(data);
      }
    } catch (err) {
      console.error("Failed to fetch faculty", err);
      if (retries > 0) {
        setTimeout(() => fetchFaculty(retries - 1), 2000);
      }
    }
  };

  const fetchDepartments = async (retries = 3) => {
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDepartments(data);
      }
    } catch (err) {
      console.error("Failed to fetch departments", err);
      if (retries > 0) {
        setTimeout(() => fetchDepartments(retries - 1), 2000);
      }
    }
  };

  const fetchLiveQueue = async (retries = 2, silent = false) => {
    if (!silent) setLiveQueueLoading(true);
    try {
      const res = await fetch("/api/queue/monitor");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Queue monitor endpoint returned non-JSON response");
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setLiveQueue(sortLiveQueue(data as LiveQueueItem[]));
      } else {
        throw new Error("Queue monitor payload is not an array");
      }
    } catch (err) {
      console.error("Failed to fetch live queue", err);
      try {
        const legacy = await fetchLegacyLiveQueue();
        setLiveQueue(legacy);
      } catch (legacyErr) {
        console.error("Fallback live queue fetch failed", legacyErr);
        if (retries > 0) {
          setTimeout(() => fetchLiveQueue(retries - 1, silent), 2000);
        }
      }
    } finally {
      if (!silent) setLiveQueueLoading(false);
    }
  };

  const sortLiveQueue = (items: LiveQueueItem[]) => {
    const rank = (status: LiveQueueItem["status"]) => {
      if (status === "serving") return 0;
      return 1;
    };

    return [...items].sort((a, b) => {
      const statusDiff = rank(a.status) - rank(b.status);
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  };

  const fetchLegacyLiveQueue = async (): Promise<LiveQueueItem[]> => {
    const facultyRes = await fetch("/api/faculty");
    if (!facultyRes.ok) throw new Error(`Faculty endpoint failed: ${facultyRes.status}`);
    const facultyData = await facultyRes.json();
    if (!Array.isArray(facultyData)) throw new Error("Faculty payload is not an array");

    const queueLists = await Promise.all(
      facultyData.map(async (f: any) => {
        try {
          const queueRes = await fetch(`/api/faculty/${f.id}/queue`);
          if (!queueRes.ok) return [];
          const queueData = await queueRes.json();
          if (!Array.isArray(queueData)) return [];

          return queueData
            .filter((item: any) => ["waiting", "serving"].includes(item.status))
            .map((item: any) => ({
              id: Number(item.id),
              status: item.status as LiveQueueItem["status"],
              created_at: item.created_at,
              faculty_id: f.id,
              faculty_name: f.name || "Unknown Faculty",
              student_name: item.student_name || "Unknown Student",
              student_number: item.student_number || "",
              time_period: item.time_period || null,
              meet_link: item.meet_link || null,
            }));
        } catch {
          return [];
        }
      })
    );

    return sortLiveQueue(queueLists.flat());
  };

  const getTodayAvailabilitySlots = (f: Faculty): AvailabilitySlot[] => {
    try {
      const parsed = JSON.parse(f.full_name || "[]");
      if (Array.isArray(parsed)) {
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const todayDay = daysOfWeek[new Date().getDay()];

        return parsed.filter((slot: unknown): slot is AvailabilitySlot => {
          if (!slot || typeof slot !== "object") return false;
          const candidate = slot as Partial<AvailabilitySlot>;
          return (
            candidate.day === todayDay &&
            typeof candidate.start === "string" &&
            typeof candidate.end === "string" &&
            candidate.start.length > 0 &&
            candidate.end.length > 0
          );
        });
      }
    } catch (e) {
      // ignore
    }
    return [];
  };

  const getAvailabilityRange = (f: Faculty) => {
    const todaySlots = getTodayAvailabilitySlots(f);
    const formatTime = (timeStr: string) => {
      const [h, m] = timeStr.split(":").map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    };

    return todaySlots.map((slot) => `${formatTime(slot.start)} - ${formatTime(slot.end)}`).join(", ");
  };

  const completeStudentLogin = useCallback(async (studentIdentifier: string, mode: "scan" | "manual") => {
    const normalizedIdentifier = studentIdentifier.trim();
    if (!normalizedIdentifier) {
      throw new Error("Student ID is required.");
    }

    // Check if any faculty is available before allowing student login
    if (availableFaculty.length === 0) {
      throw new Error("No faculty members are currently available. Please try again later.");
    }

    if (mode === "scan") {
      // Check if student exists
      const res = await fetch(`/api/students/${encodeURIComponent(normalizedIdentifier)}`);
      if (!res.ok) {
        throw new Error("Student not found in database. Please use Manual Input.");
      }
      const studentData = await res.json();
      localStorage.setItem("student_id", studentData.id);
      localStorage.setItem("student_name", studentData.name);
      localStorage.setItem("student_email", studentData.email || "");
      localStorage.setItem("student_course", studentData.course || "");
    } else {
      // Manual input
      if (!normalizedIdentifier || !studentName || !studentEmail || !course) {
        throw new Error("Please fill in all fields.");
      }
      localStorage.setItem("student_id", normalizedIdentifier);
      localStorage.setItem("student_name", studentName);
      localStorage.setItem("student_email", studentEmail);
      localStorage.setItem("student_course", course);
    }

    localStorage.setItem("user_role", "student");

    // Check for active queue
    const queueRes = await fetch(`/api/student/${encodeURIComponent(normalizedIdentifier)}/active-queue`);
    const queueData = await queueRes.json();

    if (queueRes.ok && queueData.id) {
      navigate(`/student/${queueData.id}`);
    } else {
      navigate(`/kiosk`);
    }
  }, [faculty, course, navigate, studentEmail, studentName]);

  const triggerAutoScanLogin = useCallback(async (rawScannedValue: string) => {
    const scannedValue = rawScannedValue.trim();
    if (!scannedValue || autoScanSubmittingRef.current) return;

    const now = Date.now();
    if (lastScanValueRef.current === scannedValue && now - lastScanAtRef.current < 2500) {
      return;
    }

    lastScanValueRef.current = scannedValue;
    lastScanAtRef.current = now;

    autoScanSubmittingRef.current = true;
    setLoading(true);
    setError("");
    setIdentifier(scannedValue);

    try {
      await completeStudentLogin(scannedValue, "scan");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      autoScanSubmittingRef.current = false;
      setLoading(false);
    }
  }, [completeStudentLogin]);

  const clearScannerBuffer = useCallback(() => {
    scannerBufferRef.current = "";
    if (scannerBufferTimerRef.current !== null) {
      clearTimeout(scannerBufferTimerRef.current);
      scannerBufferTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (inputMode !== "scan") {
      clearScannerBuffer();
      return;
    }

    const flushBuffer = () => {
      const value = scannerBufferRef.current.trim();
      scannerBufferRef.current = "";
      if (value) {
        void triggerAutoScanLogin(value);
      }
    };

    const resetBufferTimer = () => {
      if (scannerBufferTimerRef.current !== null) {
        clearTimeout(scannerBufferTimerRef.current);
      }
      scannerBufferTimerRef.current = window.setTimeout(() => {
        flushBuffer();
      }, 120);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (autoScanSubmittingRef.current) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (isEditableTarget) {
        clearScannerBuffer();
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        if (scannerBufferRef.current.length > 0) {
          event.preventDefault();
          flushBuffer();
        }
        return;
      }

      if (event.key === "Backspace") {
        scannerBufferRef.current = scannerBufferRef.current.slice(0, -1);
        setIdentifier(scannerBufferRef.current);
        event.preventDefault();
        resetBufferTimer();
        return;
      }

      if (event.key.length === 1) {
        scannerBufferRef.current += event.key;
        setIdentifier(scannerBufferRef.current);
        event.preventDefault();
        resetBufferTimer();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      clearScannerBuffer();
    };
  }, [clearScannerBuffer, inputMode, triggerAutoScanLogin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    autoScanSubmittingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const normalizedIdentifier = identifier.trim();
      await completeStudentLogin(normalizedIdentifier, inputMode);
    } catch (err: any) {
      setError(err.message);
    } finally {
      autoScanSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const availableFaculty = faculty.filter((f) => getTodayAvailabilitySlots(f).length > 0);
  const servingStudents = liveQueue.filter((item) => item.status === "serving");
  const waitingStudents = liveQueue.filter((item) => item.status === "waiting");
  const activeStudents = [...servingStudents, ...waitingStudents];

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #faf8f5 50%, #f0ebe5 100%)' }}>
      {/* Kiosk Mode: Full-screen centered layout */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl rounded-3xl p-8 sm:p-12 space-y-8 card">
          <div className="text-center space-y-4">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight" style={{ color: 'var(--clay-text-primary)' }}>
              Welcome
            </h1>
            <p className="text-2xl sm:text-3xl" style={{ color: 'var(--clay-text-secondary)' }}>Student Consultation Booking System</p>
            {availableFaculty.length === 0 && (
              <p className="text-lg sm:text-xl font-semibold" style={{ color: 'var(--clay-accent-soft-coral)' }}>
                 No faculty available right now
              </p>
            )}
          </div>

          <form onSubmit={handleLogin} className="space-y-8">
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex gap-3 p-2 rounded-2xl" style={{ backgroundColor: 'var(--clay-bg-tertiary)' }}>
                <button
                  type="button"
                  onClick={() => { setInputMode("scan"); setError(""); }}
                  disabled={availableFaculty.length === 0}
                  className="flex-1 flex items-center justify-center gap-3 py-4 px-6 text-lg sm:text-2xl font-bold rounded-xl transition-all"
                  style={{
                    background: inputMode === "scan" ? 'var(--clay-bg-secondary)' : 'transparent',
                    color: inputMode === "scan" ? 'var(--clay-accent-warm)' : 'var(--clay-text-secondary)',
                    cursor: availableFaculty.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: availableFaculty.length === 0 ? 0.5 : 1
                  }}
                >
                  <ScanLine className="w-7 h-7 sm:w-8 sm:h-8" /> Scan ID
                </button>
                <button
                  type="button"
                  onClick={() => { setInputMode("manual"); setError(""); }}
                  disabled={availableFaculty.length === 0}
                  className="flex-1 flex items-center justify-center gap-3 py-4 px-6 text-lg sm:text-2xl font-bold rounded-xl transition-all"
                  style={{
                    background: inputMode === "manual" ? 'var(--clay-bg-secondary)' : 'transparent',
                    color: inputMode === "manual" ? 'var(--clay-accent-warm)' : 'var(--clay-text-secondary)',
                    cursor: availableFaculty.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: availableFaculty.length === 0 ? 0.5 : 1
                  }}
                >
                  <Keyboard className="w-7 h-7 sm:w-8 sm:h-8" /> Manual Input
                </button>
              </div>

              {inputMode === "scan" ? (
                <div className="space-y-6">
                  <div className="w-full h-40 sm:h-48 border-4 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-all"
                    style={{
                      borderColor: availableFaculty.length === 0 ? 'var(--clay-border)' : 'var(--clay-accent-warm)',
                      background: availableFaculty.length === 0 
                        ? 'transparent'
                        : 'linear-gradient(135deg, rgba(212, 165, 116, 0.1) 0%, rgba(212, 165, 116, 0.05) 100%)',
                      color: availableFaculty.length === 0 ? 'var(--clay-text-light)' : 'var(--clay-accent-warm)'
                    }}
                  >
                    <ScanLine className="w-16 h-16 sm:w-20 sm:h-20 mb-3" />
                    <span className="text-xl sm:text-2xl font-bold">
                      {availableFaculty.length === 0 ? "System Offline" : "Scan Your Student ID"}
                    </span>
                  </div>

                  <input
                    ref={scanInputRef}
                    type="text"
                    value={identifier}
                    onFocus={clearScannerBuffer}
                    onChange={(e) => {
                      clearScannerBuffer();
                      setIdentifier(e.target.value);
                    }}
                    disabled={availableFaculty.length === 0}
                    placeholder="Or type and press Enter"
                    className="w-full p-6 border-3 rounded-2xl outline-none transition-colors text-2xl font-semibold text-center"
                    style={{
                      borderColor: availableFaculty.length === 0 ? 'var(--clay-border)' : 'var(--clay-border)',
                      background: availableFaculty.length === 0 ? 'rgba(0,0,0,0.05)' : 'var(--clay-bg-secondary)',
                      color: availableFaculty.length === 0 ? 'rgba(0,0,0,0.5)' : 'var(--clay-text-primary)',
                      cursor: availableFaculty.length === 0 ? 'not-allowed' : 'auto'
                    }}
                    required
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={availableFaculty.length === 0}
                    placeholder="Student ID"
                    className="w-full p-5 border-3 rounded-2xl outline-none transition-colors text-2xl font-semibold"
                    style={{
                      borderColor: 'var(--clay-border)',
                      background: availableFaculty.length === 0 ? 'rgba(0,0,0,0.05)' : 'var(--clay-bg-secondary)',
                      color: availableFaculty.length === 0 ? 'rgba(0,0,0,0.5)' : 'var(--clay-text-primary)',
                      cursor: availableFaculty.length === 0 ? 'not-allowed' : 'auto'
                    }}
                    required
                  />
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    disabled={availableFaculty.length === 0}
                    placeholder="Full Name"
                    className="w-full p-5 border-3 rounded-2xl outline-none transition-colors text-2xl font-semibold"
                    style={{
                      borderColor: 'var(--clay-border)',
                      background: availableFaculty.length === 0 ? 'rgba(0,0,0,0.05)' : 'var(--clay-bg-secondary)',
                      color: availableFaculty.length === 0 ? 'rgba(0,0,0,0.5)' : 'var(--clay-text-primary)',
                      cursor: availableFaculty.length === 0 ? 'not-allowed' : 'auto'
                    }}
                    required
                  />
                  <input
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    disabled={availableFaculty.length === 0}
                    placeholder="Email Address"
                    className="w-full p-5 border-3 rounded-2xl outline-none transition-colors text-2xl font-semibold"
                    style={{
                      borderColor: 'var(--clay-border)',
                      background: availableFaculty.length === 0 ? 'rgba(0,0,0,0.05)' : 'var(--clay-bg-secondary)',
                      color: availableFaculty.length === 0 ? 'rgba(0,0,0,0.5)' : 'var(--clay-text-primary)',
                      cursor: availableFaculty.length === 0 ? 'not-allowed' : 'auto'
                    }}
                    required
                  />
                  <select
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    disabled={availableFaculty.length === 0}
                    className="w-full p-5 border-3 rounded-2xl outline-none transition-colors text-2xl font-semibold appearance-none"
                    style={{
                      borderColor: 'var(--clay-border)',
                      background: availableFaculty.length === 0 ? 'rgba(0,0,0,0.05)' : 'var(--clay-bg-secondary)',
                      color: availableFaculty.length === 0 ? 'rgba(0,0,0,0.5)' : 'var(--clay-text-primary)',
                      cursor: availableFaculty.length === 0 ? 'not-allowed' : 'auto'
                    }}
                    required
                  >
                    <option value="" disabled>Select Course / Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>
                        {dept.name} ({dept.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

          {error && <p className="text-xl text-center font-semibold" style={{ color: 'var(--clay-accent-soft-coral)' }}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !identifier || availableFaculty.length === 0}
            className="w-full flex items-center justify-center gap-3 py-6 px-6 text-3xl font-bold rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed btn btn-primary min-h-[80px]"
          >
            {loading ? "Please wait..." : (
              <>
                <LogIn className="w-8 h-8" />
                CONTINUE
              </>
            )}
          </button>
        </form>

        {/* Live Monitor Sidebar - Only show if faculty available */}
        {availableFaculty.length > 0 && (
        <div className="mt-8 pt-8 border-t-2" style={{ borderColor: 'var(--clay-border)' }}>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3" style={{ color: 'var(--clay-text-primary)' }}>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'var(--clay-accent-sage)' }}></span>
              <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: 'var(--clay-accent-sage)' }}></span>
            </span>
            Live Monitor
          </h2>
          
          <div className="space-y-4">
            {/* Serving Students (Ongoing Consultations) */}
            {liveQueue.filter(item => item.status === "serving").length > 0 && (
              <div>
                <h3 className="text-xl font-bold mb-3 px-4 py-2 rounded-lg badge badge-success" style={{ color: 'white' }}>
                  NOW SERVING ({liveQueue.filter(item => item.status === "serving").length})
                </h3>
                <div className="space-y-3">
                  {liveQueue.filter(item => item.status === "serving").map((item) => (
                    <div key={item.id} className="p-4 rounded-2xl card" style={{
                      background: 'linear-gradient(135deg, rgba(168, 213, 186, 0.2) 0%, rgba(168, 213, 186, 0.05) 100%)',
                      borderColor: 'rgba(168, 213, 186, 0.3)'
                    }}>
                      <p className="text-lg font-bold" style={{ color: 'var(--clay-text-primary)' }}>{item.student_name}</p>
                      <p className="text-sm" style={{ color: 'var(--clay-text-secondary)' }}>Faculty: <strong>{item.faculty_name}</strong></p>
                      <p className="text-sm" style={{ color: 'var(--clay-text-secondary)' }}>Time: <strong>{item.time_period || 'Walk-in'}</strong></p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Waiting Students (Queue) */}
            {liveQueue.filter(item => item.status === "waiting").length > 0 && (
              <div>
                <h3 className="text-xl font-bold mb-3 px-4 py-2 rounded-lg badge badge-info" style={{ color: 'white' }}>
                  IN QUEUE ({liveQueue.filter(item => item.status === "waiting").length})
                </h3>
                <div className="space-y-3">
                  {liveQueue.filter(item => item.status === "waiting").map((item) => (
                    <div key={item.id} className="p-4 rounded-2xl card" style={{
                      background: 'linear-gradient(135deg, rgba(200, 184, 228, 0.2) 0%, rgba(200, 184, 228, 0.05) 100%)',
                      borderColor: 'rgba(200, 184, 228, 0.3)'
                    }}>
                      <p className="text-lg font-bold" style={{ color: 'var(--clay-text-primary)' }}>{item.student_name}</p>
                      <p className="text-sm" style={{ color: 'var(--clay-text-secondary)' }}>Faculty: <strong>{item.faculty_name}</strong></p>
                      <p className="text-sm" style={{ color: 'var(--clay-text-secondary)' }}>Time: <strong>{item.time_period || 'Walk-in'}</strong></p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Faculty Status - Always show when faculty available */}
            <div>
              <h3 className="text-xl font-bold mb-3 px-4 py-2 rounded-lg badge badge-warning" style={{ color: 'white' }}>
                FACULTY ({availableFaculty.length} Available)
              </h3>
              <div className="space-y-3">
                {availableFaculty.map(f => (
                  <div key={f.id} className="p-4 rounded-2xl card" style={{
                    background: f.status === "busy"
                      ? 'linear-gradient(135deg, rgba(232, 180, 168, 0.15) 0%, rgba(232, 180, 168, 0.05) 100%)'
                      : 'linear-gradient(135deg, rgba(168, 213, 186, 0.15) 0%, rgba(168, 213, 186, 0.05) 100%)',
                    borderColor: f.status === "busy" ? 'rgba(232, 180, 168, 0.3)' : 'rgba(168, 213, 186, 0.3)'
                  }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold" style={{ color: 'var(--clay-text-primary)' }}>{f.name}</p>
                        <p className="text-sm" style={{ color: 'var(--clay-text-secondary)' }}>{f.department}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold badge ${
                        f.status === 'busy' ? 'badge-warning' : 'badge-success'
                      }`} style={{ color: 'white' }}>
                        {f.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      </div>
    </div>
  );
}
