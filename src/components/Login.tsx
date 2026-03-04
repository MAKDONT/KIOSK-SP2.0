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

type ScannerControls = {
  stop: () => void;
};

type KeyboardField = "identifier" | "studentName" | "studentEmail";

const KEYBOARD_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m", "-", "_"],
  ["@", ".", "/"],
];

export default function Login() {
  const [inputMode, setInputMode] = useState<"scan" | "manual">("scan");
  
  // Student Fields
  const [identifier, setIdentifier] = useState(""); // Student ID or Email
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [course, setCourse] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [activeField, setActiveField] = useState<KeyboardField>("identifier");
  const [capsLock, setCapsLock] = useState(true);
  const [scannerReady, setScannerReady] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("Tap Start Camera to scan student barcode.");
  const [scannerError, setScannerError] = useState("");
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const zxingReaderRef = useRef<any | null>(null);
  const zxingControlsRef = useRef<ScannerControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const autoLoginInProgressRef = useRef(false);

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

  const getAvailabilityRange = (f: Faculty) => {
    try {
      const parsed = JSON.parse(f.full_name || "[]");
      if (Array.isArray(parsed)) {
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const todayDay = daysOfWeek[new Date().getDay()];
        
        const todaySlots = parsed.filter((slot: any) => slot.day === todayDay && slot.start && slot.end);
        
        if (todaySlots.length > 0) {
          const formatTime = (timeStr: string) => {
            const [h, m] = timeStr.split(':').map(Number);
            const d = new Date();
            d.setHours(h, m, 0, 0);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
          };
          
          return todaySlots.map((s: any) => `${formatTime(s.start)} - ${formatTime(s.end)}`).join(', ');
        }
      }
    } catch (e) {
      // ignore
    }
    return "No availability set for today";
  };

  const setFieldValue = (field: KeyboardField, value: string) => {
    if (field === "identifier") {
      setIdentifier(value);
      return;
    }
    if (field === "studentName") {
      setStudentName(value);
      return;
    }
    setStudentEmail(value);
  };

  const getFieldValue = (field: KeyboardField) => {
    if (field === "identifier") return identifier;
    if (field === "studentName") return studentName;
    return studentEmail;
  };

  const openKeyboardForField = (field: KeyboardField) => {
    setActiveField(field);
    setKeyboardOpen(true);
  };

  const handleKeyboardKey = (key: string) => {
    const current = getFieldValue(activeField);
    const value = capsLock ? key.toUpperCase() : key;
    setFieldValue(activeField, `${current}${value}`);
  };

  const handleKeyboardBackspace = () => {
    const current = getFieldValue(activeField);
    setFieldValue(activeField, current.slice(0, -1));
  };

  const handleKeyboardSpace = () => {
    const current = getFieldValue(activeField);
    setFieldValue(activeField, `${current} `);
  };

  const handleKeyboardClear = () => {
    setFieldValue(activeField, "");
  };

  const proceedStudentLogin = useCallback(async (normalizedIdentifier: string, mode: "scan" | "manual") => {
    if (!normalizedIdentifier) {
      throw new Error("Student ID is required.");
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
      const normalizedName = studentName.trim();
      const normalizedEmail = studentEmail.trim();
      const normalizedCourse = course.trim();

      if (!normalizedName || !normalizedEmail || !normalizedCourse) {
        throw new Error("Please fill in all fields.");
      }

      localStorage.setItem("student_id", normalizedIdentifier);
      localStorage.setItem("student_name", normalizedName);
      localStorage.setItem("student_email", normalizedEmail);
      localStorage.setItem("student_course", normalizedCourse);
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
  }, [course, navigate, studentEmail, studentName]);

  const stopScanner = useCallback((resetStatus = false) => {
    scanningRef.current = false;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {
        // ignore scanner stop errors
      }
      zxingControlsRef.current = null;
    }

    zxingReaderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setScannerReady(false);

    if (resetStatus) {
      setScannerStatus("Tap Start Camera to scan student barcode.");
    }
  }, []);

  const handleScannedIdentifier = useCallback(async (rawValue: string) => {
    const normalizedIdentifier = rawValue.trim();
    if (!normalizedIdentifier || autoLoginInProgressRef.current) return;

    autoLoginInProgressRef.current = true;
    setLoading(true);
    setError("");
    setScannerError("");
    setKeyboardOpen(false);
    setIdentifier(normalizedIdentifier);
    setScannerStatus(`Scanned: ${normalizedIdentifier}. Verifying...`);
    stopScanner(false);

    try {
      await proceedStudentLogin(normalizedIdentifier, "scan");
    } catch (err: any) {
      const message = err?.message || "Student not found in database. Please use Manual Input.";
      setError(message);
      setScannerStatus(`Scanned: ${normalizedIdentifier}. ${message}`);
    } finally {
      autoLoginInProgressRef.current = false;
      setLoading(false);
    }
  }, [proceedStudentLogin, stopScanner]);

  const startScanner = useCallback(async () => {
    stopScanner();
    setScannerError("");
    setScannerStatus("Starting camera...");

    const BarcodeDetectorCtor = (window as any).BarcodeDetector;

    const videoElement = videoRef.current;
    if (!videoElement) {
      setScannerError("Scanner preview unavailable.");
      setScannerStatus("Camera unavailable.");
      return;
    }

    if (BarcodeDetectorCtor) {
      try {
        detectorRef.current = new BarcodeDetectorCtor({
          formats: [
            "code_128",
            "code_39",
            "ean_13",
            "ean_8",
            "qr_code",
            "upc_a",
            "upc_e",
            "pdf417",
          ],
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;

        videoElement.srcObject = stream;
        await videoElement.play();

        scanningRef.current = true;
        setScannerReady(true);
        setScannerStatus("Point barcode to camera.");

        const detectFrame = async () => {
          if (!scanningRef.current) return;

          try {
            if (videoElement.readyState >= 2 && detectorRef.current) {
              const detected = await detectorRef.current.detect(videoElement);
              if (Array.isArray(detected) && detected.length > 0) {
                const rawValue = String(detected[0]?.rawValue || "").trim();
                if (rawValue) {
                  void handleScannedIdentifier(rawValue);
                  return;
                }
              }
            }
          } catch {
            // Ignore single-frame detection issues and continue scanning.
          }

          animationFrameRef.current = requestAnimationFrame(() => {
            void detectFrame();
          });
        };

        animationFrameRef.current = requestAnimationFrame(() => {
          void detectFrame();
        });
        return;
      } catch (err: any) {
        console.error("Native scanner failed, falling back to ZXing", err);
      }
    }

    // Fallback scanner for browsers without BarcodeDetector support.
    try {
      const zxingModuleUrl = "https://esm.sh/@zxing/browser@0.1.5";
      const zxingModule: any = await import(/* @vite-ignore */ zxingModuleUrl);
      const ReaderCtor = zxingModule?.BrowserMultiFormatReader;
      if (!ReaderCtor) {
        throw new Error("Compatibility scanner module failed to load.");
      }

      const reader = new ReaderCtor();
      zxingReaderRef.current = reader;

      scanningRef.current = true;
      setScannerReady(true);
      setScannerStatus("Compatibility scanner active. Point barcode to camera.");

      const controls = await reader.decodeFromVideoDevice(undefined, videoElement, (result) => {
        if (!scanningRef.current || !result) return;

        const rawValue = String(result.getText() || "").trim();
        if (!rawValue) return;

        void handleScannedIdentifier(rawValue);
      });

      zxingControlsRef.current = controls;
    } catch (err: any) {
      console.error("Failed to start scanner", err);
      setScannerError(err?.message || "Failed to access camera. Try Manual Input.");
      setScannerStatus("Camera unavailable.");
      stopScanner(false);
    }
  }, [handleScannedIdentifier, stopScanner]);

  useEffect(() => {
    if (inputMode === "scan") {
      void startScanner();
    } else {
      stopScanner(true);
      setScannerError("");
    }

    return () => {
      stopScanner(false);
    };
  }, [inputMode, startScanner, stopScanner]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setKeyboardOpen(false);
    stopScanner(false);

    try {
      const normalizedIdentifier = identifier.trim();
      await proceedStudentLogin(normalizedIdentifier, inputMode);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const availableFaculty = faculty.filter(f => f.status === "available");
  const servingStudents = liveQueue.filter((item) => item.status === "serving");
  const nextStudents = liveQueue.filter((item) => item.status === "next");
  const waitingStudents = liveQueue.filter((item) => item.status === "waiting");
  const activeStudents = [...servingStudents, ...nextStudents, ...waitingStudents];

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col lg:flex-row">
      {/* Live Monitor Sidebar */}
      <div className="w-full lg:w-[560px] bg-white border-r border-neutral-200 p-6 flex flex-col overflow-hidden shadow-lg z-10">
        <h2 className="text-2xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          Live Monitor
        </h2>
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-neutral-600 uppercase tracking-wider">Available Faculty</h3>
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                {availableFaculty.length}
              </span>
            </div>
            {availableFaculty.length === 0 ? (
              <div className="text-center py-6 text-neutral-500 bg-neutral-50 rounded-2xl border border-neutral-200">
                <Users className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
                <p className="text-sm">No faculty members are currently available.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableFaculty.map(f => (
                  <div key={f.id} className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                    <h3 className="font-bold text-emerald-900">{f.name}</h3>
                    <p className="text-sm text-emerald-700">{f.department}</p>
                    <div className="mt-2 text-sm font-medium text-emerald-800 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {getAvailabilityRange(f)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>

            <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-neutral-600 uppercase tracking-wider">Students Queue</h3>
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
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
              Welcome Back
            </h1>
            <p className="text-neutral-500">Student booking portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex p-1 bg-neutral-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setInputMode("scan"); setError(""); setActiveField("identifier"); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                    inputMode === "scan" ? "bg-white text-emerald-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <ScanLine className="w-4 h-4" /> Scan ID
                </button>
                <button
                  type="button"
                  onClick={() => { setInputMode("manual"); setError(""); setActiveField("identifier"); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                    inputMode === "manual" ? "bg-white text-emerald-700 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <Keyboard className="w-4 h-4" /> Manual Input
                </button>
              </div>

              <button
                type="button"
                onClick={() => openKeyboardForField(activeField)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl font-semibold transition-colors"
              >
                <Keyboard className="w-4 h-4" /> On-Screen Keyboard
              </button>

              {inputMode === "scan" ? (
                <div className="space-y-4">
                  <div className="w-full h-44 border-2 border-dashed border-emerald-300 rounded-2xl bg-emerald-50 relative overflow-hidden">
                    <video
                      ref={videoRef}
                      className={`w-full h-full object-cover transition-opacity ${scannerReady ? "opacity-100" : "opacity-0"}`}
                      autoPlay
                      muted
                      playsInline
                    />
                    {!scannerReady && (
                      <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-emerald-600">
                        <ScanLine className="w-10 h-10 mb-2" />
                        <span className="text-sm font-bold">Camera Scanner</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { void startScanner(); }}
                      className="py-2.5 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold text-sm"
                    >
                      {scannerReady ? "Restart Camera" : "Start Camera"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIdentifier("");
                        setError("");
                        setScannerStatus("Ready to rescan.");
                        void startScanner();
                      }}
                      className="py-2.5 px-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-sm"
                    >
                      Clear & Rescan
                    </button>
                  </div>

                  <p className="text-xs text-neutral-500">
                    {scannerStatus}
                  </p>
                  {scannerError && <p className="text-xs text-red-600">{scannerError}</p>}

                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onFocus={() => setActiveField("identifier")}
                    onClick={() => setActiveField("identifier")}
                    placeholder="Or type Student ID and press Enter"
                    className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors text-lg"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onFocus={() => openKeyboardForField("identifier")}
                    onClick={() => openKeyboardForField("identifier")}
                    inputMode="none"
                    placeholder="Student ID (e.g. 2021-0001)"
                    className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                    required
                  />
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    onFocus={() => openKeyboardForField("studentName")}
                    onClick={() => openKeyboardForField("studentName")}
                    inputMode="none"
                    placeholder="Full Name"
                    className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                    required
                  />
                  <input
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    onFocus={() => openKeyboardForField("studentEmail")}
                    onClick={() => openKeyboardForField("studentEmail")}
                    inputMode="none"
                    placeholder="Email Address"
                    className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                    required
                  />
                  <select
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors appearance-none"
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
            disabled={loading || !identifier}
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

      {keyboardOpen && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-end justify-center p-2 sm:p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl border border-neutral-200 shadow-2xl p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm sm:text-base font-semibold text-neutral-700">
                On-Screen Keyboard for{" "}
                {activeField === "identifier"
                  ? "Student ID"
                  : activeField === "studentName"
                    ? "Full Name"
                    : "Email Address"}
              </p>
              <button
                type="button"
                onClick={() => setKeyboardOpen(false)}
                className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium"
              >
                Close
              </button>
            </div>

            <div className="space-y-2">
              {KEYBOARD_ROWS.map((row) => (
                <div key={row.join("")} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                  {row.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleKeyboardKey(key)}
                      className="h-11 sm:h-12 rounded-xl bg-neutral-100 hover:bg-neutral-200 active:scale-[0.98] transition-all text-base sm:text-lg font-bold text-neutral-800"
                    >
                      {capsLock ? key.toUpperCase() : key}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => setCapsLock((prev) => !prev)}
                className={`h-11 rounded-xl font-semibold ${capsLock ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-700"}`}
              >
                {capsLock ? "Caps On" : "Caps Off"}
              </button>
              <button
                type="button"
                onClick={handleKeyboardSpace}
                className="h-11 rounded-xl bg-blue-100 text-blue-800 font-semibold"
              >
                Space
              </button>
              <button
                type="button"
                onClick={handleKeyboardBackspace}
                className="h-11 rounded-xl bg-amber-100 text-amber-800 font-semibold"
              >
                Backspace
              </button>
              <button
                type="button"
                onClick={handleKeyboardClear}
                className="h-11 rounded-xl bg-red-100 text-red-800 font-semibold"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setKeyboardOpen(false)}
                className="h-11 rounded-xl bg-neutral-800 text-white font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
