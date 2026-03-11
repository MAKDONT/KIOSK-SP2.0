import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Users, CheckCircle, AlertCircle, Clock, ArrowLeft, Calendar, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
  const studentId = localStorage.getItem("student_id") || "";
  const studentName = localStorage.getItem("student_name") || "";
  const studentEmail = localStorage.getItem("student_email") || "";
  const course = localStorage.getItem("student_course") || "";
  
  const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
  const [expandedFaculty, setExpandedFaculty] = useState<string | null>(null);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<string | null>(null);
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
      const data = JSON.parse(event.data);
      if (data.type === "faculty_updated" || data.type === "queue_updated") {
        fetchFaculty();
        fetchBookedSlots();
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
    const todaySlots = getTodayAvailabilitySlots(f);
    if (todaySlots.length === 0) {
      return "No availability set for today";
    }

    const formatTime = (timeStr: string) => {
      const [h, m] = timeStr.split(":").map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    };

    return todaySlots.map((slot) => `${formatTime(slot.start)} - ${formatTime(slot.end)}`).join(", ");
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
      <div className="min-h-[100dvh] bg-emerald-50 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-10 lg:p-12 max-w-2xl w-full text-center space-y-6 sm:space-y-8">
          <CheckCircle className="w-32 h-32 text-emerald-500 mx-auto" />
          <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900">Success!</h1>
          <p className="text-lg sm:text-2xl text-neutral-600">
            You have been added to the queue for {success.faculty_name || "the selected faculty"}.
          </p>
          <p className="text-base sm:text-xl text-neutral-500">Redirecting to tracking page...</p>
        </div>
      </div>
    );
  }

  const availableFaculty = faculty.filter((f) => getTodayAvailabilitySlots(f).length > 0);

  return (
    <div className="min-h-[100dvh] bg-neutral-100 flex flex-col font-sans">
      {/* Header */}
      <header className="shrink-0 bg-white shadow-sm p-4 sm:p-5 lg:p-6 flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between z-10">
        <div className="flex items-center gap-2 sm:gap-4 w-full lg:w-auto min-w-0">
          <button onClick={() => navigate("/")} className="p-2 sm:p-4 hover:bg-neutral-100 rounded-full transition-colors shrink-0">
            <ArrowLeft className="w-6 h-6 sm:w-8 sm:h-8 text-neutral-600" />
          </button>
          <Users className="w-8 h-8 sm:w-12 sm:h-12 text-indigo-600 shrink-0" />
          <h1 className="text-lg sm:text-3xl lg:text-4xl font-bold text-neutral-900 tracking-tight truncate">
            Student Booking Dashboard
          </h1>
          <div className="ml-2 sm:ml-4 flex items-center gap-2 px-2 sm:px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider hidden sm:inline-block">Live Updates</span>
          </div>
        </div>
        <div className="text-base sm:text-lg lg:text-2xl font-medium text-neutral-500 flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
          <Clock className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-x-hidden">
        <div className="flex-1 min-h-0 p-4 sm:p-6 lg:p-8 bg-neutral-50 flex flex-col overflow-hidden max-w-5xl w-full mx-auto lg:mx-0">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 mb-6 sm:mb-8">Select Faculty & Time</h2>
          
          {error && (
            <div className="mb-6 sm:mb-8 flex items-start gap-3 text-red-600 bg-red-50 p-4 sm:p-6 rounded-2xl text-base sm:text-lg lg:text-xl font-medium border border-red-100">
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
                  className="text-center text-neutral-500 py-12"
                >
                  <p className="text-2xl">Loading faculty data...</p>
                </motion.div>
              ) : availableFaculty.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12 bg-white rounded-3xl border-2 border-dashed border-neutral-200"
                >
                  <Users className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
                  <p className="text-2xl font-medium text-neutral-500">No faculty with availability today.</p>
                  <p className="text-lg text-neutral-400 mt-2">Only faculty who configured time slots for today are shown here.</p>
                  <button 
                    onClick={fetchFaculty}
                    className="mt-6 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
                  >
                    Retry Fetch
                  </button>
                </motion.div>
              ) : (
                availableFaculty.map((f) => (
                  <motion.div
                    key={f.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-white rounded-3xl p-4 sm:p-6 border-4 transition-all duration-500 ${
                      selectedFaculty === f.id
                        ? "border-indigo-500 shadow-lg"
                        : "border-transparent shadow-sm hover:shadow-md"
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6">
                      <div className="min-w-0">
                        <h3 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-2 break-words">{f.name}</h3>
                        <p className="text-base sm:text-xl text-neutral-500">{f.department}</p>
                      </div>
                      <motion.div 
                        key={f.status}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`self-start px-3 sm:px-4 py-2 rounded-full flex items-center gap-2 border ${
                        f.status === 'available' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                        f.status === 'busy' ? 'bg-red-50 border-red-200 text-red-700' : 
                        'bg-neutral-100 border-neutral-200 text-neutral-600'
                      }`}>
                        <span className={`w-3 h-3 rounded-full ${
                          f.status === 'available' ? 'bg-emerald-500' :
                          f.status === 'busy' ? 'bg-red-500' : 'bg-neutral-400'
                        }`} />
                        <span className="text-sm sm:text-base lg:text-lg font-bold uppercase tracking-wider">{f.status}</span>
                      </motion.div>
                    </div>

                    {/* Quick Book / Time Slots */}
                    <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
                      <button 
                        onClick={() => setExpandedFaculty(expandedFaculty === f.id ? null : f.id)}
                        className="w-full flex items-center justify-between text-neutral-600 hover:text-neutral-900 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5" />
                          <span className="text-sm sm:text-lg font-medium">Available Slots Today</span>
                        </div>
                        {expandedFaculty === f.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                      
                      <AnimatePresence>
                        {expandedFaculty === f.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                            animate={{ height: "auto", opacity: 1, marginTop: 16 }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
                              {(() => {
                                const slots = getAvailabilitySlots(f);
                                return (
                                  <>
                                    {slots.map((slotObj, idx) => {
                                      const { timeString, isPast } = slotObj;
                                      const isBooked = bookedSlots.some(b => b.faculty_id === f.id && b.time_period === timeString);
                                      const isDisabled = isBooked || isPast;
                                      
                                      return (
                                        <button
                                          key={idx}
                                          disabled={isDisabled}
                                          onClick={() => {
                                            if (!isDisabled) {
                                              setSelectedFaculty(f.id);
                                              setSelectedTimePeriod(timeString);
                                            }
                                          }}
                                          className={`w-full sm:flex-1 sm:min-w-[220px] py-3 sm:py-4 px-4 sm:px-6 rounded-xl text-sm sm:text-base lg:text-lg font-medium transition-all flex items-center justify-center gap-2 ${
                                            isDisabled
                                              ? "bg-neutral-100 text-neutral-400 cursor-not-allowed border border-neutral-200"
                                              : selectedFaculty === f.id && selectedTimePeriod === timeString
                                                ? "bg-emerald-600 text-white shadow-md"
                                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                          }`}
                                        >
                                          <Clock className="w-5 h-5" /> {timeString}
                                          {isBooked && <span className="text-xs sm:text-sm ml-2">(Booked)</span>}
                                          {isPast && !isBooked && <span className="text-xs sm:text-sm ml-2">(Passed)</span>}
                                        </button>
                                      );
                                    })}
                                    
                                    {f.status === 'busy' && slots.length === 0 && (
                                      <div className="w-full py-4 text-center text-sm sm:text-lg text-red-600 bg-red-50 rounded-xl font-medium">
                                        Currently in a consultation. Please wait or select another faculty.
                                      </div>
                                    )}
                                    
                                    {f.status === 'offline' && slots.length === 0 && (
                                      <div className="w-full py-4 text-center text-sm sm:text-lg text-neutral-500 bg-neutral-100 rounded-xl font-medium">
                                        Not available for booking at this time.
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          <div className="pt-6 sm:pt-8 mt-auto border-t border-neutral-200">
            <div className="mb-5">
              <label className="block text-base sm:text-lg font-semibold text-neutral-800 mb-2">
                Consultation Concern <span className="text-red-500">*</span>
              </label>
              <select
                value={consultationConcern}
                onChange={(e) => setConsultationConcern(e.target.value)}
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-white focus:border-indigo-500 focus:ring-0 outline-none transition-colors text-base appearance-none"
                required
              >
                <option value="">Select your concern...</option>
                <option value="Academic Advising">Academic Advising</option>
                <option value="Grade Consultation">Grade Consultation</option>
                <option value="Thesis / Capstone Advising">Thesis / Capstone Advising</option>
                <option value="Course Enrollment / Schedule">Course Enrollment / Schedule</option>
                <option value="Internship / OJT Concern">Internship / OJT Concern</option>
                <option value="Project Guidance">Project Guidance</option>
                <option value="Attendance / Absence Concern">Attendance / Absence Concern</option>
                <option value="Personal / Counseling">Personal / Counseling</option>
                <option value="Scholarship / Financial Aid">Scholarship / Financial Aid</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <button
              onClick={handleJoinQueue}
              disabled={loading || !studentId || !selectedFaculty || !selectedTimePeriod || !consultationConcern.trim()}
              className="w-full py-4 sm:py-5 lg:py-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed text-white text-xl sm:text-2xl lg:text-3xl font-bold rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 sm:gap-4"
            >
              {loading ? "Processing..." : "Confirm Booking"}
              {!loading && <CheckCircle className="w-8 h-8" />}
            </button>
          </div>
        </div>

        {/* Live Monitor Sidebar */}
        <div className="w-full lg:w-96 bg-white border-t lg:border-t-0 lg:border-l border-neutral-200 p-4 sm:p-6 flex flex-col overflow-hidden max-h-[40dvh] lg:max-h-none">
          <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4 sm:mb-6 flex items-center gap-2 shrink-0">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            Live Monitor
          </h2>
          <div className="flex-1 overflow-y-auto space-y-4 pr-0 sm:pr-2">
            {availableFaculty.filter(f => f.status === 'available').length === 0 ? (
              <div className="text-center py-8 text-neutral-500">
                <Users className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                <p>No faculty members are currently available.</p>
              </div>
            ) : (
              availableFaculty.filter(f => f.status === 'available').map(f => (
                <div key={f.id} className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                  <h3 className="font-bold text-emerald-900">{f.name}</h3>
                  <p className="text-sm text-emerald-700">{f.department}</p>
                  <div className="mt-2 text-sm font-medium text-emerald-800 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {getAvailabilityRange(f)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
