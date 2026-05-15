import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Users, CheckCircle, AlertCircle, Clock, ArrowLeft, Calendar, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { safeGetItem } from "../utils/storageUtils";
import { formatTime12HourPHTFns, getDayNamePHT } from "../utils/timezoneUtils";
import { WeeklySchedule } from "./WeeklySchedule";

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

export default function KioskView() {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  
  // Form State from localStorage
  const studentId = safeGetItem("student_id", "");
  const studentName = safeGetItem("student_name", "");
  const studentEmail = safeGetItem("student_email", "");
  const course = safeGetItem("student_course", "");
  
  const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
  const [expandedDepartment, setExpandedDepartment] = useState<string | null>(null);
  const [expandedFaculty, setExpandedFaculty] = useState<string | null>(null);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [consultationConcern, setConsultationConcern] = useState("");
  const [bookedSlots, setBookedSlots] = useState<{faculty_id: string, time_period: string, queue_date?: string | null}[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState("");
  const [showSetPinMode, setShowSetPinMode] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  
  // Forgot Password State
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  
  const navigate = useNavigate();

  useEffect(() => {
    if (!studentId) {
      navigate("/");
      return;
    }
    
    // Comprehensive zoom prevention
    let lastTouchTime = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;
    
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }
      
      // Prevent double-tap zoom
      const now = new Date().getTime();
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const diffTime = now - lastTouchTime;
        const diffX = Math.abs(touch.clientX - lastTouchX);
        const diffY = Math.abs(touch.clientY - lastTouchY);
        
        if (diffTime < 300 && diffX < 50 && diffY < 50) {
          e.preventDefault();
        }
        
        lastTouchTime = now;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
      }
    };
    
    const preventTouchEnd = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    
    // Prevent wheel zoom (Ctrl + scroll)
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    
    // Prevent keyboard zoom
    const preventKeyZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault();
      }
    };
    
    // Prevent gesturestart for iOS
    const preventGesture = (e: any) => {
      e.preventDefault();
    };
    
    document.addEventListener("touchstart", preventZoom, { passive: false });
    document.addEventListener("touchmove", preventZoom, { passive: false });
    document.addEventListener("touchend", preventTouchEnd, { passive: false });
    document.addEventListener("wheel", preventWheelZoom, { passive: false });
    document.addEventListener("keydown", preventKeyZoom, { passive: false });
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    
    fetchFaculty();
    fetchBookedSlots();
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "faculty_updated" || data.type === "queue_updated") {
          fetchFaculty();
          fetchBookedSlots();
        }
      } catch (err) {
      }
    };

    ws.onerror = () => {
      // Keep kiosk UI running even if live socket connection is temporarily unavailable.
    };

    return () => {
      // Avoid forcing close while still connecting to prevent noisy browser warnings.
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      // Clean up event listeners
      document.removeEventListener("touchstart", preventZoom);
      document.removeEventListener("touchmove", preventZoom);
      document.removeEventListener("touchend", preventTouchEnd);
      document.removeEventListener("wheel", preventWheelZoom);
      document.removeEventListener("keydown", preventKeyZoom);
      document.removeEventListener("gesturestart", preventGesture);
    };
  }, []);

  const fetchBookedSlots = async (retries = 3) => {
    try {
      const res = await fetch("/api/queue/booked-slots");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBookedSlots(data);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchBookedSlots(retries - 1), 2000);
      }
    }
  };

  const fetchFaculty = async (retries = 3) => {
    setFetching(true);
    try {
      const res = await fetch("/api/faculty");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaculty(data);
      } else {

      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchFaculty(retries - 1), 2000);
      }
    } finally {
      setFetching(false);
    }
  };

  const getAvailabilityRange = (f: Faculty) => {
    const todaySlots = getTodayAvailabilitySlots(f);
    if (todaySlots.length === 0) {
      return null;
    }

    const formatTime = (timeStr: string) => {
      const [h, m] = timeStr.split(":").map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return formatTime12HourPHTFns(d);
    };

    return todaySlots.map((slot) => {
      const start = slot.start || (slot as any).start_time || '';
      const end = slot.end || (slot as any).end_time || '';
      return `${formatTime(start)} - ${formatTime(end)}`;
    }).join(", ");
  };

  const getTodayAvailabilitySlots = (f: Faculty): AvailabilitySlot[] => {
    try {
      let parsed = Array.isArray(f.full_name) 
        ? f.full_name 
        : JSON.parse(f.full_name || "[]");
      
      if (Array.isArray(parsed)) {
        const todayDay = getDayNamePHT();

        return parsed.filter((slot: unknown): slot is AvailabilitySlot => {
          if (!slot || typeof slot !== "object") return false;
          const candidate = slot as any;
          const day = candidate.day || candidate.day_name;
          const start = candidate.start || candidate.start_time;
          const end = candidate.end || candidate.end_time;
          return (
            day === todayDay &&
            typeof start === "string" &&
            typeof end === "string" &&
            start.length > 0 &&
            end.length > 0
          );
        });
      }
    } catch (e) {
      // ignore
    }
    return [];
  };

  const getAvailabilitySlots = (f: Faculty) => {
    const todaySlots = getTodayAvailabilitySlots(f);
    const generatedSlots: { timeString: string, isPast: boolean }[] = [];

    todaySlots.forEach((slot) => {
      const [startHour, startMin] = slot.start.split(":").map(Number);
      const [endHour, endMin] = slot.end.split(":").map(Number);

      let current = new Date();
      current.setHours(startHour, startMin, 0, 0);

      const end = new Date();
      end.setHours(endHour, endMin, 0, 0);

      const now = new Date();

      while (current < end) {
        const slotStart = new Date(current);
        const slotEnd = new Date(current.getTime() + 15 * 60000);

        if (slotEnd > end) break;

        const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

        generatedSlots.push({
          timeString: `${slot.day} ${formatTime(slotStart)} - ${formatTime(slotEnd)}`,
          isPast: slotStart < now
        });

        current = new Date(slotEnd.getTime() + 5 * 60000);
      }
    });

    return generatedSlots;
  };

  const handleJoinQueue = async () => {
    if (!studentId || !selectedFaculty || !selectedTimePeriod || !selectedDate) {
      setError("Please select a faculty member and choose a time slot.");
      return;
    }
    if (!consultationConcern.trim()) {
      setError("Please provide your consultation concern before confirming.");
      return;
    }

    // Show PIN confirmation modal
    setShowPinModal(true);
    setPinAttempt("");
    setPinError("");
  };

  const handlePinConfirm = async () => {
    const storedPin = safeGetItem("student_pin", "").trim();
    
    if (!pinAttempt) {
      setPinError("Please enter your PIN.");
      return;
    }

    console.log(`🔐 PIN verification: Stored="${storedPin}" (len:${storedPin.length}) vs Entered="${pinAttempt.trim()}" (len:${pinAttempt.trim().length})`);
    
    // Check if student has no PIN set
    if (!storedPin) {
      console.log(`⚠️ No PIN found in database for this student`);
      setPinError("No PIN is set for your account. Please contact the faculty office to set your PIN.");
      return;
    }

    if (pinAttempt.trim() !== storedPin) {
      console.log(`❌ PIN mismatch! Expected: "${storedPin}"`);
      setPinError("Incorrect PIN. Please try again.");
      setPinAttempt("");
      return;
    }

    console.log(`✅ PIN match!`);
    // PIN is correct, proceed with queue join
    setShowPinModal(false);
    setPinAttempt("");
    setPinError("");
    await submitQueueJoin();
  };

  const handleSetPin = async () => {
    if (!newPin.trim()) {
      setPinError("Please enter a PIN.");
      return;
    }

    if (newPin !== confirmPin) {
      setPinError("PINs do not match.");
      return;
    }

    if (!/^\d{4,6}$/.test(newPin)) {
      setPinError("PIN must be 4-6 digits.");
      return;
    }

    try {
      const res = await fetch(`/api/students/${studentId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set PIN");
      }

      // Store PIN to localStorage and proceed
      const trimmedPin = newPin.trim();
      localStorage.setItem("student_pin", trimmedPin);
      console.log(`✅ PIN set successfully`);
      
      setShowSetPinMode(false);
      setShowPinModal(false);
      setNewPin("");
      setConfirmPin("");
      setPinError("");
      setPinAttempt("");
      await submitQueueJoin();
    } catch (err: any) {
      console.error("Set PIN error:", err);
      setPinError(err.message);
    }
  };

  const handleForgotPassword = async () => {
    // Automatically use the stored student email - no user input needed
    const emailToUse = studentEmail.trim();
    
    if (!emailToUse) {
      setForgotPasswordError("Email address not found in your account. Please contact the faculty office.");
      return;
    }

    setForgotPasswordLoading(true);
    setForgotPasswordError("");
    setForgotPasswordMessage("");

    try {
      const response = await fetch("/api/students/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToUse })
      });

      const data = await response.json();

      if (!response.ok) {
        setForgotPasswordError(data.error || "Failed to send password reset email");
        return;
      }

      setForgotPasswordMessage(`Password reset instructions have been sent to ${emailToUse}. Please check your email and follow the link to reset your password.`);
      
      // Auto-close modal after 5 seconds
      setTimeout(() => {
        setShowForgotPasswordModal(false);
        setForgotPasswordMessage("");
        setForgotPasswordError("");
      }, 5000);
    } catch (err: any) {
      setForgotPasswordError(err.message || "Failed to send password reset email");
    } finally {
      setForgotPasswordLoading(false);
    }
  };
  const submitQueueJoin = async () => {
    setLoading(true);
    setError("");

    try {
      const studentPin = safeGetItem("student_pin", "");
      const payload = {
        student_id: studentId,
        faculty_id: selectedFaculty,
        source: "web",
        student_name: studentName,
        student_email: studentEmail,
        course: course,
        purpose: consultationConcern.trim(),
        time_period: selectedDay ? `${selectedDay} ${selectedTimePeriod}` : selectedTimePeriod,
        queue_date: selectedDate,
        student_pin: studentPin,
      };
      
      console.log(`📤 Sending queue join request:`, payload);
      
      const res = await fetch("/api/queue/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error(`❌ Queue join failed:`, data);
        throw new Error(data.error || "Failed to join queue");
      }
      setSuccess(data);
      setTimeout(() => {
        navigate(`/student/${data.id}`);
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 sm:p-6" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #faf8f5 50%, #f0ebe5 100%)' }}>
        <div className="rounded-3xl p-6 sm:p-10 lg:p-12 max-w-2xl w-full text-center space-y-6 sm:space-y-8 card">
          <CheckCircle className="w-32 h-32 mx-auto" style={{ color: 'var(--clay-accent-sage)' }} />
          <h1 className="text-4xl sm:text-5xl font-bold" style={{ color: 'var(--clay-text-primary)' }}>Success!</h1>
          <p className="text-lg sm:text-2xl" style={{ color: 'var(--clay-text-secondary)' }}>
            You have been added to the queue for {success.faculty_name || "the selected faculty"}.
          </p>
          <p className="text-base sm:text-xl" style={{ color: 'var(--clay-text-light)' }}>Redirecting to tracking page...</p>
        </div>
      </div>
    );
  }

  const getUpcomingDayNames = () => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const upcomingDays: string[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      upcomingDays.push(days[date.getDay()]);
    }
    
    return upcomingDays;
  };

  const availableFaculty = faculty.filter((f) => {
    try {
      // full_name can be either already-parsed array or JSON string
      const parsed = Array.isArray(f.full_name) 
        ? f.full_name 
        : JSON.parse(f.full_name || "[]");
      
      if (Array.isArray(parsed)) {
        const upcomingDays = getUpcomingDayNames();
        const hasUpcomingSlots = parsed.some((slot: any) => {
          const day = slot.day || slot.day_name;
          return upcomingDays.includes(day);
        });
        return hasUpcomingSlots;
      }
      return false;
    } catch (err) {
      return false;
    }
  });

  const departmentGroups = Object.entries(
    availableFaculty.reduce<Record<string, Faculty[]>>((acc, item) => {
      const departmentName = item.department || "Unassigned Department";
      if (!acc[departmentName]) {
        acc[departmentName] = [];
      }
      acc[departmentName].push(item);
      return acc;
    }, {})
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([department, facultyList]) => ({ department, facultyList }));

  const activeDepartment =
    expandedDepartment && departmentGroups.some((group) => group.department === expandedDepartment)
      ? expandedDepartment
      : null;

  return (
    <div className="min-h-[100dvh] flex flex-col font-sans" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #faf8f5 50%, #f0ebe5 100%)' }}>
      {/* Header */}
      <header className="shrink-0 shadow-sm p-4 sm:p-5 lg:p-6 flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between z-10 card">
        <div className="flex items-center gap-2 sm:gap-4 w-full lg:w-auto min-w-0">
          <button onClick={() => navigate("/")} className="p-2 sm:p-4 hover:opacity-70 rounded-full transition-all shrink-0">
            <ArrowLeft className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: 'var(--clay-text-primary)' }} />
          </button>
          <Calendar className="w-8 h-8 sm:w-12 sm:h-12 shrink-0" style={{ color: 'var(--clay-accent-warm)' }} />
          <h1 className="text-lg sm:text-3xl lg:text-4xl font-bold tracking-tight truncate" style={{ color: 'var(--clay-text-primary)' }}>
            Book Your Consultation
          </h1>
          <div className="ml-2 sm:ml-4 flex items-center gap-2 px-2 sm:px-3 py-1 rounded-full border shrink-0 badge badge-success">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'white' }}></span>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: 'white' }}></span>
            </span>
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider hidden sm:inline-block">Live Updates</span>
          </div>
        </div>
        <div className="text-base sm:text-lg lg:text-2xl font-medium flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-end" style={{ color: 'var(--clay-text-secondary)' }}>
          <Clock className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          {formatTime12HourPHTFns()}
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col overflow-x-hidden">
        <div className="flex-1 min-h-0 p-4 sm:p-6 lg:p-8 flex flex-col overflow-hidden max-w-5xl w-full mx-auto">
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold" style={{ color: 'var(--clay-text-primary)' }}>
              Select Faculty & Book Appointment
            </h2>
            <p className="text-sm sm:text-base mt-2" style={{ color: 'var(--clay-text-secondary)' }}>
              
            </p>
          </div>
          
          {error && (
            <div className="mb-6 sm:mb-8 flex items-start gap-3 p-4 sm:p-6 rounded-2xl text-base sm:text-lg lg:text-xl font-medium card" style={{
              background: 'linear-gradient(135deg, rgba(232, 180, 168, 0.15) 0%, rgba(232, 180, 168, 0.05) 100%)',
              borderColor: 'rgba(232, 180, 168, 0.3)',
              color: 'var(--clay-accent-soft-coral)'
            }}>
              <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-0 sm:pr-2 lg:pr-4 space-y-4 sm:space-y-6 scrollable-list">
            <AnimatePresence mode="popLayout">
              {fetching ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                  style={{ color: 'var(--clay-text-secondary)' }}
                >
                  <p className="text-2xl">Loading faculty data...</p>
                </motion.div>
              ) : availableFaculty.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12 rounded-3xl card"
                  style={{
                    background: 'linear-gradient(135deg, var(--clay-bg-secondary) 0%, var(--clay-bg-tertiary) 100%)',
                    borderColor: 'var(--clay-border-accent)'
                  }}
                >
                  <Users className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--clay-text-light)' }} />
                  <p className="text-2xl font-medium" style={{ color: 'var(--clay-text-primary)' }}>No faculty available for advance booking.</p>
                  <p className="text-lg mt-2" style={{ color: 'var(--clay-text-secondary)' }}>Faculty schedules will appear once they set their availability for the week.</p>
                  <button 
                    onClick={() => fetchFaculty()}
                    className="mt-6 px-6 py-3 font-bold rounded-xl transition-all btn btn-secondary"
                  >
                    Retry Fetch
                  </button>
                </motion.div>
              ) : (
                departmentGroups.map((group) => {
                  const isDepartmentExpanded = activeDepartment === group.department;

                  return (
                    <motion.div
                      key={group.department}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                      className="rounded-2xl card"
                      style={{
                        background: 'linear-gradient(135deg, var(--clay-bg-secondary) 0%, var(--clay-bg-tertiary) 100%)',
                        borderColor: 'var(--clay-border-accent)'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedDepartment(isDepartmentExpanded ? null : group.department)}
                        className="w-full p-4 flex items-center justify-between gap-3 text-left"
                      >
                        <div>
                          <p className="text-lg sm:text-xl font-bold uppercase" style={{ color: 'var(--clay-text-primary)' }}>
                            {group.department}
                          </p>
                          <p className="text-sm" style={{ color: 'var(--clay-text-secondary)' }}>
                            {group.facultyList.length} faculty member{group.facultyList.length > 1 ? 's' : ''}
                          </p>
                        </div>
                        {isDepartmentExpanded ? (
                          <ChevronUp className="w-6 h-6" style={{ color: 'var(--clay-text-secondary)' }} />
                        ) : (
                          <ChevronDown className="w-6 h-6" style={{ color: 'var(--clay-text-secondary)' }} />
                        )}
                      </button>

                      {isDepartmentExpanded && (
                        <div className="px-4 pb-4 space-y-4">
                          {group.facultyList.map((f) => (
                            <div
                              key={f.id}
                              className="rounded-2xl card transition-all duration-300 cursor-pointer"
                              onClick={() => setExpandedFaculty(expandedFaculty === f.id ? null : f.id)}
                              style={{
                                background: f.status === "busy"
                                  ? 'linear-gradient(135deg, rgba(232, 180, 168, 0.15) 0%, rgba(232, 180, 168, 0.05) 100%)'
                                  : 'linear-gradient(135deg, rgba(168, 213, 186, 0.25) 0%, rgba(168, 213, 186, 0.1) 100%)',
                                borderColor: expandedFaculty === f.id ? 'var(--clay-accent-warm)' : (f.status === 'busy' ? 'rgba(232, 180, 168, 0.4)' : 'rgba(168, 213, 186, 0.5)'),
                                borderWidth: expandedFaculty === f.id ? '3px' : '2px',
                                boxShadow: expandedFaculty === f.id
                                  ? '0 12px 35px var(--clay-shadow-medium), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                                  : '0 4px 20px var(--clay-shadow-soft), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                                transition: 'borderColor 0.3s, borderWidth 0.3s, boxShadow 0.3s'
                              }}
                            >
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-lg font-bold" style={{ color: 'var(--clay-text-primary)' }}>{f.name}</p>
                                    <p className="text-sm" style={{ color: 'var(--clay-text-secondary)' }}>{f.department}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold badge whitespace-nowrap ${
                                      f.status === 'busy' ? 'badge-warning' : 'badge-success'
                                    }`} style={{ color: 'white' }}>
                                      {f.status.toUpperCase()}
                                    </span>
                                    {expandedFaculty === f.id ? (
                                      <ChevronUp className="w-5 h-5" style={{ color: 'var(--clay-text-secondary)' }} />
                                    ) : (
                                      <ChevronDown className="w-5 h-5" style={{ color: 'var(--clay-text-secondary)' }} />
                                    )}
                                  </div>
                                </div>

                                {expandedFaculty === f.id && (
                                  <div
                                    className="mt-4 pt-4 border-t overflow-hidden transition-opacity duration-150"
                                    style={{ borderColor: 'rgba(0,0,0,0.1)' }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <WeeklySchedule
                                      facultyId={f.id}
                                      facultyName={f.name}
                                      bookedSlots={bookedSlots}
                                      selectedSlot={selectedFaculty === f.id && selectedTimePeriod && selectedDate ? { date: selectedDate, timeString: selectedTimePeriod } : null}
                                      onSlotSelect={(slot, date, day) => {
                                        setSelectedFaculty(f.id);
                                        setSelectedTimePeriod(slot.timeString);
                                        setSelectedDate(date);
                                        setSelectedDay(day);
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>

          <div className="pt-8 mt-auto border-t-2" style={{ borderColor: 'var(--clay-border)' }}>
            <div className="mb-8">
              <label className="block text-2xl font-bold mb-4" style={{ color: 'var(--clay-text-primary)' }}>
                Why are you visiting? <span style={{ color: 'var(--clay-accent-coral)' }}>*</span>
              </label>
              <select
                value={consultationConcern}
                onChange={(e) => setConsultationConcern(e.target.value)}
                className="w-full p-4 border-3 rounded-2xl outline-none transition-colors text-xl font-semibold appearance-none"
                style={{
                  borderColor: 'var(--clay-border)',
                  background: 'var(--clay-bg-secondary)',
                  color: 'var(--clay-text-primary)'
                }}
                required
              >
                <option value="">Select your concern...</option>
                <option value="Academic Advising">Academic Advising / Course Enrollment</option>
                <option value="Grade Consultation">Attendance / Grade Consultation</option>
                <option value="Thesis / Capstone Advising">Thesis / Capstone Advising</option>
                <option value="Internship / OJT Concern">Internship / OJT Concern</option>
                <option value="Other">Other Personal Concerns</option>
              </select>
            </div>
            <button
              onClick={handleJoinQueue}
              disabled={loading || !studentId || !selectedFaculty || !selectedTimePeriod || !selectedDate || !consultationConcern.trim()}
              className="w-full py-8 disabled:opacity-50 disabled:cursor-not-allowed text-white text-3xl font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-4 min-h-[100px] btn btn-primary"
            >
              {loading ? "Processing..." : <>
                <CheckCircle className="w-10 h-10" />
                CONFIRM CONSULTATION
              </>}
            </button>
          </div>
        </div>
      </main>

      {/* Password Confirmation Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 sm:p-12 max-w-md w-full space-y-6 card shadow-2xl animate-in fade-in scale-in">
            {!showSetPinMode ? (
              <>
                <h2 className="text-3xl font-bold text-center" style={{ color: 'var(--clay-text-primary)' }}>
                  Confirm PIN
                </h2>
                <p className="text-lg text-center" style={{ color: 'var(--clay-text-secondary)' }}>
                  Please enter your PIN to confirm your consultation booking.
                </p>
                
                <div className="space-y-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pinAttempt}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setPinAttempt(value);
                      setPinError("");
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handlePinConfirm();
                      }
                    }}
                    placeholder="Enter your PIN (4-6 digits)"
                    maxLength={6}
                    className="w-full p-4 border-3 rounded-2xl outline-none text-xl font-semibold transition-colors"
                    style={{
                      borderColor: pinError ? 'var(--clay-accent-soft-coral)' : 'var(--clay-border)',
                      background: 'var(--clay-bg-secondary)',
                      color: 'var(--clay-text-primary)'
                    }}
                    autoFocus
                  />
                  {pinError && (
                    <div className="space-y-4">
                      <p className="text-lg font-semibold" style={{ color: 'var(--clay-accent-soft-coral)' }}>
                        {pinError}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPasswordModal(true);
                          // Automatically send the reset email
                          setTimeout(() => handleForgotPassword(), 100);
                        }}
                        className="w-full py-2 px-4 text-lg font-semibold transition-colors hover:opacity-80"
                        style={{ color: 'var(--clay-accent-warm)', cursor: 'pointer', background: 'transparent' }}
                      >
                        Forgot PIN?
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => {
                      setShowPinModal(false);
                      setPinAttempt("");
                      setPinError("");
                      setShowSetPinMode(false);
                    }}
                    className="flex-1 py-4 px-6 text-lg font-bold rounded-2xl transition-all"
                    style={{
                      background: 'var(--clay-bg-tertiary)',
                      color: 'var(--clay-text-primary)'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePinConfirm}
                    disabled={!pinAttempt}
                    className="flex-1 py-4 px-6 text-lg font-bold rounded-2xl transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed btn btn-primary"
                  >
                    Confirm
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-bold text-center" style={{ color: 'var(--clay-text-primary)' }}>
                  Set PIN
                </h2>
                <p className="text-lg text-center" style={{ color: 'var(--clay-text-secondary)' }}>
                  Create a PIN (4-6 digits) for your account.
                </p>
                
                <div className="space-y-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newPin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setNewPin(value);
                      setPinError("");
                    }}
                    placeholder="Create PIN (4-6 digits)"
                    maxLength={6}
                    className="w-full p-4 border-3 rounded-2xl outline-none text-xl font-semibold transition-colors"
                    style={{
                      borderColor: pinError ? 'var(--clay-accent-soft-coral)' : 'var(--clay-border)',
                      background: 'var(--clay-bg-secondary)',
                      color: 'var(--clay-text-primary)'
                    }}
                    autoFocus
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={confirmPin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setConfirmPin(value);
                      setPinError("");
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSetPin();
                      }
                    }}
                    placeholder="Confirm PIN"
                    maxLength={6}
                    className="w-full p-4 border-3 rounded-2xl outline-none text-xl font-semibold transition-colors"
                    style={{
                      borderColor: pinError ? 'var(--clay-accent-soft-coral)' : 'var(--clay-border)',
                      background: 'var(--clay-bg-secondary)',
                      color: 'var(--clay-text-primary)'
                    }}
                  />
                  {pinError && (
                    <p className="text-lg font-semibold" style={{ color: 'var(--clay-accent-soft-coral)' }}>
                      {pinError}
                    </p>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => {
                      setShowPinModal(false);
                      setNewPin("");
                      setConfirmPin("");
                      setPinError("");
                      setShowSetPinMode(false);
                    }}
                    className="flex-1 py-4 px-6 text-lg font-bold rounded-2xl transition-all"
                    style={{
                      background: 'var(--clay-bg-tertiary)',
                      color: 'var(--clay-text-primary)'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSetPin}
                    disabled={!newPin || !confirmPin}
                    className="flex-1 py-4 px-6 text-lg font-bold rounded-2xl transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed btn btn-primary"
                  >
                    Set PIN
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 sm:p-12 w-full max-w-md shadow-2xl" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #faf8f5 50%, #f0ebe5 100%)' }}>
            <div className="text-center space-y-6">
              <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: 'var(--clay-text-primary)' }}>
                Password Reset
              </h2>
              <p className="text-lg" style={{ color: 'var(--clay-text-secondary)' }}>
                {forgotPasswordLoading ? "Sending reset link..." : "Check your email for password reset instructions."}
              </p>
            </div>

            <div className="space-y-6 mt-8">
              {!forgotPasswordMessage && !forgotPasswordError && forgotPasswordLoading && (
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-t-2" style={{ borderColor: 'var(--clay-accent-warm)' }}></div>
                </div>
              )}

              {forgotPasswordError && (
                <p className="text-lg text-center font-semibold p-4 rounded-2xl" style={{
                  color: 'white',
                  background: 'linear-gradient(135deg, #e8b4a8 0%, #d99f88 100%)'
                }}>
                  {forgotPasswordError}
                </p>
              )}

              {forgotPasswordMessage && (
                <div className="space-y-4">
                  <p className="text-lg text-center font-semibold p-4 rounded-2xl" style={{
                    color: 'white',
                    background: 'linear-gradient(135deg, #a8d5ba 0%, #88c4a0 100%)'
                  }}>
                    ✓ {forgotPasswordMessage}
                  </p>
                  <p className="text-sm text-center" style={{ color: 'var(--clay-text-secondary)' }}>
                    (Modal will close automatically)
                  </p>
                </div>
              )}

              {forgotPasswordError && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPasswordModal(false);
                    setForgotPasswordError("");
                    setForgotPasswordMessage("");
                  }}
                  className="w-full py-4 px-6 text-xl font-bold rounded-2xl transition-all"
                  style={{
                    background: 'transparent',
                    color: 'var(--clay-text-secondary)',
                    border: '2px solid var(--clay-border)',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

