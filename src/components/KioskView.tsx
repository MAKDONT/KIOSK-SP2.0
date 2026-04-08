import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Users, CheckCircle, AlertCircle, Clock, ArrowLeft, Calendar, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { safeGetItem } from "../utils/storageUtils";

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
  const [expandedFaculty, setExpandedFaculty] = useState<string | null>(null);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [consultationConcern, setConsultationConcern] = useState("");
  const [bookedSlots, setBookedSlots] = useState<{faculty_id: string, time_period: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!studentId) {
      navigate("/");
      return;
    }
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
        console.error("Kiosk WS message parse error", err);
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
      console.error("Failed to fetch booked slots", err);
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
        console.error("Failed to fetch faculty: Not an array", data);
      }
    } catch (err) {
      console.error("Failed to fetch faculty", err);
      if (retries > 0) {
        setTimeout(() => fetchFaculty(retries - 1), 2000);
      }
    } finally {
      setFetching(false);
    }
  };

  const getAvailabilityRange = (f: Faculty) => {
    const allSlots = getAllFutureAvailabilitySlots(f);
    if (allSlots.length === 0) {
      return null;
    }

    const formatTime = (timeStr: string) => {
      const [h, m] = timeStr.split(":").map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    };

    // Show first day with availability
    const firstSlot = allSlots[0];
    return `${firstSlot.day} ${formatTime(firstSlot.start)} - ${formatTime(firstSlot.end)}`;
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

  const getAllFutureAvailabilitySlots = (f: Faculty): AvailabilitySlot[] => {
    try {
      const parsed = JSON.parse(f.full_name || "[]");
      if (Array.isArray(parsed)) {
        // Just return the base availability patterns (one per day of week)
        // Don't loop through 30 days to avoid duplicates
        return parsed.filter((slot: unknown): slot is AvailabilitySlot => {
          if (!slot || typeof slot !== "object") return false;
          const candidate = slot as Partial<AvailabilitySlot>;
          return (
            typeof candidate.day === "string" &&
            typeof candidate.start === "string" &&
            typeof candidate.end === "string" &&
            candidate.day.length > 0 &&
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

  const getAvailabilitySlots = (f: Faculty) => {
    const allSlots = getAllFutureAvailabilitySlots(f);
    const slotsByDate: Record<string, { timeString: string, isPast: boolean, timeOnly: string }[]> = {};
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    
    const now = new Date();
    const addedTimeStrings = new Set<string>(); // Track added slots to prevent duplicates

    // Get Monday of current week
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days to go back to get to Monday
    const monday = new Date(today);
    monday.setDate(monday.getDate() - daysToMonday);

    // Loop from Monday to Sunday (7 days)
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const currentDate = new Date(monday);
      currentDate.setDate(currentDate.getDate() + dayOffset);
      const dayName = daysOfWeek[currentDate.getDay()];
      const dateStr = currentDate.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
      const dateKey = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD for grouping

      // Find slots for this day
      const slotsForDay = allSlots.filter(slot => slot.day === dayName);

      slotsForDay.forEach((slot) => {
        const [startHour, startMin] = slot.start.split(":").map(Number);
        const [endHour, endMin] = slot.end.split(":").map(Number);

        let current = new Date(currentDate);
        current.setHours(startHour, startMin, 0, 0);

        const end = new Date(currentDate);
        end.setHours(endHour, endMin, 0, 0);

        while (current < end) {
          const slotStart = new Date(current);
          const slotEnd = new Date(current.getTime() + 15 * 60000);

          if (slotEnd > end) break;

          const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
          const timeOnly = formatTime(slotStart);
          const timeString = `${dayName} ${dateStr} ${timeOnly}`;

          // Skip if already added (deduplication)
          if (addedTimeStrings.has(timeString)) {
            current = new Date(slotEnd.getTime() + 5 * 60000);
            continue;
          }

          if (!slotsByDate[dateKey]) {
            slotsByDate[dateKey] = [];
          }

          slotsByDate[dateKey].push({
            timeString: timeString,
            isPast: slotStart < now,
            timeOnly: timeOnly
          });

          addedTimeStrings.add(timeString);

          current = new Date(slotEnd.getTime() + 5 * 60000);
        }
      });
    }

    return slotsByDate;
  };

  const handleJoinQueue = async () => {
    if (!studentId || !selectedFaculty || !selectedTimePeriod) {
      setError("Please select a faculty member and choose a time slot.");
      return;
    }
    if (!consultationConcern.trim()) {
      setError("Please provide your consultation concern before confirming.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/queue/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          faculty_id: selectedFaculty,
          source: "web",
          student_name: studentName,
          student_email: studentEmail,
          course: course,
          purpose: consultationConcern.trim(),
          time_period: selectedTimePeriod,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
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

  const availableFaculty = faculty.filter((f) => getAllFutureAvailabilitySlots(f).length > 0);

  return (
    <div className="min-h-[100dvh] flex flex-col font-sans" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #faf8f5 50%, #f0ebe5 100%)' }}>
      {/* Header */}
      <header className="shrink-0 shadow-sm p-4 sm:p-5 lg:p-6 flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between z-10 card">
        <div className="flex items-center gap-2 sm:gap-4 w-full lg:w-auto min-w-0">
          <button onClick={() => navigate("/")} className="p-2 sm:p-4 hover:opacity-70 rounded-full transition-all shrink-0">
            <ArrowLeft className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: 'var(--clay-text-primary)' }} />
          </button>
          <Users className="w-8 h-8 sm:w-12 sm:h-12 shrink-0" style={{ color: 'var(--clay-accent-warm)' }} />
          <h1 className="text-lg sm:text-3xl lg:text-4xl font-bold tracking-tight truncate" style={{ color: 'var(--clay-text-primary)' }}>
            Student Dashboard
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
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-x-hidden">
        <div className="flex-1 min-h-0 p-4 sm:p-6 lg:p-8 flex flex-col overflow-hidden max-w-5xl w-full mx-auto lg:mx-0">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-6 sm:mb-8" style={{ color: 'var(--clay-text-primary)' }}>Select Faculty & Time</h2>
          
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

          <div className="flex-1 overflow-y-auto pr-0 sm:pr-2 lg:pr-4 space-y-4 sm:space-y-6">
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
                  <p className="text-2xl font-medium" style={{ color: 'var(--clay-text-primary)' }}>No faculty with availability today.</p>
                  <p className="text-lg mt-2" style={{ color: 'var(--clay-text-secondary)' }}>Only faculty who configured time slots for today are shown here.</p>
                  <button 
                    onClick={fetchFaculty}
                    className="mt-6 px-6 py-3 font-bold rounded-xl transition-all btn btn-secondary"
                  >
                    Retry Fetch
                  </button>
                </motion.div>
              ) : (
                availableFaculty.map((f) => {
                  const timeRange = getAvailabilityRange(f);
                  return (
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
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
                      
                      {timeRange && (
                        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--clay-text-secondary)' }}>
                          <Clock className="w-4 h-4" />
                          {timeRange}
                        </div>
                      )}

                      {/* Expanded Time Slots */}
                      {expandedFaculty === f.id && (
                        <div
                          className="mt-4 pt-4 border-t overflow-hidden transition-opacity duration-150"
                          style={{ borderColor: 'rgba(0,0,0,0.1)' }}
                        >
                            <h4 className="text-base font-bold mb-4" style={{ color: 'var(--clay-text-primary)' }}>
                              Select a Time Slot
                            </h4>
                            {(() => {
                              const slotsByDate = getAvailabilitySlots(f);
                              const dateKeys = Object.keys(slotsByDate).sort();
                              
                              if (dateKeys.length === 0) {
                                return (
                                  <div className="py-3 text-center text-sm font-bold rounded-lg text-white" style={{ background: 'var(--clay-accent-soft-coral)' }}>
                                    {f.status === 'busy' ? 'Currently in consultation' : 'Not available for consultation'}
                                  </div>
                                );
                              }

                              return (
                                <div className="space-y-5">
                                  {dateKeys.map((dateKey) => {
                                    const slots = slotsByDate[dateKey];
                                    const dateObj = new Date(dateKey);
                                    const dateStr = dateObj.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
                                    const isToday = dateKey === new Date().toISOString().split('T')[0];
                                    
                                    return (
                                      <div key={dateKey}>
                                        <div className="flex items-center gap-3 mb-3 px-1">
                                          <h5 className="font-bold text-sm" style={{ color: 'var(--clay-text-primary)' }}>
                                            {dateStr}
                                          </h5>
                                          {isToday && (
                                            <span className="px-2 py-0.5 bg-blue-200 text-blue-800 text-xs font-bold rounded-full">Today</span>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                          {slots.map((slotObj, idx) => {
                                            const { timeString, isPast, timeOnly } = slotObj;
                                            const isBooked = bookedSlots.some(b => b.faculty_id === f.id && b.time_period === timeString);
                                            const isSelected = selectedTimePeriod === timeString;
                                            const isDisabled = isBooked || isPast;
                                            
                                            return (
                                              <button
                                                key={idx}
                                                disabled={isDisabled}
                                                onMouseEnter={() => !isDisabled && setHoveredSlot(timeString)}
                                                onMouseLeave={() => setHoveredSlot(null)}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (!isDisabled) {
                                                    setSelectedFaculty(f.id);
                                                    setSelectedTimePeriod(timeString);
                                                  }
                                                }}
                                                className={`w-full py-2 px-1 rounded-lg text-xs font-bold transition-all text-white ${
                                                  isDisabled
                                                    ? "opacity-40 cursor-not-allowed"
                                                    : "cursor-pointer hover:scale-105"
                                                }`}
                                                style={{
                                                  background: isSelected
                                                    ? 'var(--clay-accent-warm)'
                                                    : isDisabled 
                                                      ? '#999999' 
                                                      : hoveredSlot === timeString 
                                                        ? 'var(--clay-accent-warm)' 
                                                        : 'var(--clay-accent-sky)',
                                                  transform: isSelected ? 'scale(1.05)' : 'scale(1)'
                                                }}
                                              >
                                                {timeOnly}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                    </div>
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
                <option value="Academic Advising">Academic advising - course enrollment</option>
                <option value="Thesis / Capstone Advising">Thesis / Capstone Advising</option>
                <option value="Internship / OJT Concern">Internship / OJT Concern</option>
                <option value="Attendance / Absence Concern">Grade Consultation / Attendance </option>
                <option value="Other">Other Personal Concerns</option>
              </select>
            </div>
            <button
              onClick={handleJoinQueue}
              disabled={loading || !studentId || !selectedFaculty || !selectedTimePeriod || !consultationConcern.trim()}
              className="w-full py-8 disabled:opacity-50 disabled:cursor-not-allowed text-white text-3xl font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-4 min-h-[100px] btn btn-primary"
            >
              {loading ? "Processing..." : <>
                <CheckCircle className="w-10 h-10" />
                CONFIRM APPOINTMENT
              </>}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
