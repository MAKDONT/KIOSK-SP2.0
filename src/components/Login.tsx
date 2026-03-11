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
  status: "waiting" | "next" | "serving";
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
      const data = JSON.parse(event.data);
      if (data.type === "faculty_updated" || data.type === "queue_updated") {
        fetchFaculty();
        fetchLiveQueue(1, true);
      }
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
      const res = await fetch("/api/admin/queue-monitor");
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
      if (status === "next") return 1;
      return 2;
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
            .filter((item: any) => ["waiting", "next", "serving"].includes(item.status))
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
  const nextStudents = liveQueue.filter((item) => item.status === "next");
  const waitingStudents = liveQueue.filter((item) => item.status === "waiting");
  const activeStudents = [...servingStudents, ...nextStudents, ...waitingStudents];

  return (
    <div className="min-h-[100dvh] bg-neutral-100 flex flex-col lg:flex-row">
      {/* Faculty Sidebar (Left) */}
      <div className="order-2 lg:order-1 w-full lg:w-[340px] max-h-[32dvh] sm:max-h-[24rem] lg:max-h-none bg-white border-t lg:border-t-0 lg:border-r border-neutral-200 p-4 sm:p-6 flex flex-col overflow-hidden shadow-lg z-10 shrink-0">
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4 sm:mb-6 flex items-center gap-2 shrink-0">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          Available Faculty
        </h2>
        <div className="flex-1 overflow-y-auto pr-0 sm:pr-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-neutral-600 uppercase tracking-wider">Faculty</h3>
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                {availableFaculty.length}
              </span>
            </div>
            {availableFaculty.length === 0 ? (
              <div className="text-center py-6 text-neutral-500 bg-neutral-50 rounded-2xl border border-neutral-200">
                <Users className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
                <p className="text-sm">No faculty members have availability for today.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableFaculty.map(f => (
                  <div
                    key={f.id}
                    className={`p-4 rounded-2xl border ${
                      f.status === "busy"
                        ? "bg-amber-50 border-amber-100"
                        : "bg-emerald-50 border-emerald-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className={`font-bold ${f.status === "busy" ? "text-amber-900" : "text-emerald-900"}`}>{f.name}</h3>
                        <p className={`text-sm ${f.status === "busy" ? "text-amber-700" : "text-emerald-700"}`}>{f.department}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        f.status === "busy"
                          ? "bg-amber-100 text-amber-800"
                          : f.status === "offline"
                            ? "bg-neutral-200 text-neutral-700"
                            : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {f.status}
                      </span>
                    </div>
                    <div className={`mt-2 text-sm font-medium flex items-center gap-1 ${f.status === "busy" ? "text-amber-800" : "text-emerald-800"}`}>
                      <Clock className="w-4 h-4" />
                      {getAvailabilityRange(f)}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* Login Form (Center) */}
      <div className="order-1 lg:order-2 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 min-h-0">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 sm:space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
              Welcome Back
            </h1>
            <p className="text-neutral-500">Student booking portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
              {availableFaculty.length === 0 && (
                <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
                  <p className="text-red-700 font-semibold text-sm text-center">
                     No faculty members have availability at the moment
                  </p>
                  <p className="text-red-600 text-xs text-center mt-1">
                    Please try again later or contact support.
                  </p>
                </div>
              )}
              <div className="flex p-1 bg-neutral-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setInputMode("scan"); setError(""); }}
                  disabled={availableFaculty.length === 0}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                    inputMode === "scan" ? "bg-white text-emerald-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                  } ${availableFaculty.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <ScanLine className="w-4 h-4" /> Scan ID
                </button>
                <button
                  type="button"
                  onClick={() => { setInputMode("manual"); setError(""); }}
                  disabled={availableFaculty.length === 0}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                    inputMode === "manual" ? "bg-white text-emerald-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                  } ${availableFaculty.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <Keyboard className="w-4 h-4" /> Manual Input
                </button>
              </div>

              {inputMode === "scan" ? (
                <div className="space-y-4">
                  <div className={`w-full h-28 sm:h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-all ${
                    availableFaculty.length === 0
                      ? "border-neutral-300 bg-neutral-50 text-neutral-400"
                      : "border-emerald-300 bg-emerald-50 text-emerald-500 animate-pulse"
                  }`}>
                    <ScanLine className="w-10 h-10 mb-2" />
                    <span className="text-sm font-bold">
                      {availableFaculty.length === 0 ? "Login Unavailable" : "Scan ID Here"}
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
                    placeholder="Or type Student ID and press Enter"
                    className={`w-full p-4 border-2 rounded-2xl bg-neutral-50 outline-none transition-colors text-lg ${
                      availableFaculty.length === 0
                        ? "border-neutral-200 text-neutral-400 cursor-not-allowed opacity-60"
                        : "border-neutral-200 focus:border-emerald-500"
                    }`}
                    required
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={availableFaculty.length === 0}
                    placeholder="Student ID (e.g. 2021-0001)"
                    className={`w-full p-3 border-2 rounded-xl bg-neutral-50 outline-none transition-colors ${
                      availableFaculty.length === 0
                        ? "border-neutral-200 text-neutral-400 cursor-not-allowed opacity-60"
                        : "border-neutral-200 focus:border-emerald-500"
                    }`}
                    required
                  />
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    disabled={availableFaculty.length === 0}
                    placeholder="Full Name"
                    className={`w-full p-3 border-2 rounded-xl bg-neutral-50 outline-none transition-colors ${
                      availableFaculty.length === 0
                        ? "border-neutral-200 text-neutral-400 cursor-not-allowed opacity-60"
                        : "border-neutral-200 focus:border-emerald-500"
                    }`}
                    required
                  />
                  <input
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    disabled={availableFaculty.length === 0}
                    placeholder="Email Address"
                    className={`w-full p-3 border-2 rounded-xl bg-neutral-50 outline-none transition-colors ${
                      availableFaculty.length === 0
                        ? "border-neutral-200 text-neutral-400 cursor-not-allowed opacity-60"
                        : "border-neutral-200 focus:border-emerald-500"
                    }`}
                    required
                  />
                  <select
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    disabled={availableFaculty.length === 0}
                    className={`w-full p-3 border-2 rounded-xl bg-neutral-50 outline-none transition-colors appearance-none ${
                      availableFaculty.length === 0
                        ? "border-neutral-200 text-neutral-400 cursor-not-allowed opacity-60"
                        : "border-neutral-200 focus:border-emerald-500"
                    }`}
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

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !identifier || availableFaculty.length === 0}
            className="w-full flex items-center justify-center gap-2 py-4 px-4 text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? "Please wait..." : (
              <>
                <LogIn className="w-5 h-5" />
                Continue
              </>
            )}
          </button>
        </form>
      </div>
      </div>

      {/* Students Queue Sidebar (Right) */}
      <div className="order-3 lg:order-3 w-full lg:w-[340px] max-h-[32dvh] sm:max-h-[24rem] lg:max-h-none bg-white border-t lg:border-t-0 lg:border-l border-neutral-200 p-4 sm:p-6 flex flex-col overflow-hidden shadow-lg z-10 shrink-0">
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4 sm:mb-6 flex items-center gap-2 shrink-0">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
          </span>
          Students Queue
        </h2>
        <div className="flex-1 overflow-y-auto pr-0 sm:pr-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
            <h3 className="text-sm font-bold text-neutral-600 uppercase tracking-wider">Live Queue</h3>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">Now {servingStudents.length}</span>
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">Next {nextStudents.length}</span>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">Wait {waitingStudents.length}</span>
            </div>
          </div>
          {liveQueueLoading && activeStudents.length === 0 ? (
            <div className="text-center py-6 text-neutral-500 bg-neutral-50 rounded-2xl border border-neutral-200">
              <p className="text-sm">Loading students queue...</p>
            </div>
          ) : activeStudents.length === 0 ? (
            <div className="text-center py-6 text-neutral-500 bg-neutral-50 rounded-2xl border border-neutral-200">
              <p className="text-sm">No active students in queue.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeStudents.map((item) => (
                <div key={item.id} className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-indigo-900 truncate">{item.student_name}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      item.status === "serving"
                        ? "bg-emerald-100 text-emerald-700"
                        : item.status === "next"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-indigo-700 mt-1 truncate">Student Number: {item.student_number || "N/A"}</p>
                  <p className="text-xs text-indigo-700 mt-1 truncate">Faculty: {item.faculty_name}</p>
                  <p className="text-[11px] text-indigo-500 mt-1">Slot: {item.time_period || "Walk-in / No slot"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
