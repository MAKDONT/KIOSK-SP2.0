import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Clock, Check } from "lucide-react";
import { motion } from "motion/react";

interface ScheduleSlot {
  start: string;
  end: string;
  timeString: string;
  isPast: boolean;
}

interface DaySchedule {
  date: string;
  day: string;
  slots: ScheduleSlot[];
}

interface WeeklyScheduleProps {
  facultyId: string;
  facultyName: string;
  onSlotSelect: (slot: ScheduleSlot, date: string, day: string) => void;
  selectedSlot?: { date: string; timeString: string } | null;
  bookedSlots?: { faculty_id: string; time_period: string }[];
}

export function WeeklySchedule({
  facultyId,
  facultyName,
  onSlotSelect,
  selectedSlot,
  bookedSlots = []
}: WeeklyScheduleProps) {
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeDay, setActiveDay] = useState(0);

  useEffect(() => {
    fetchWeeklySchedule();
  }, [facultyId]);

  const fetchWeeklySchedule = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/faculty/${facultyId}/weekly-schedule`);
      if (!res.ok) throw new Error("Failed to fetch schedule");
      
      const data = await res.json();
      console.log(`[DEBUG] Weekly schedule fetched for faculty ${facultyId}:`, data);
      
      // Log each day and its slots
      data.forEach((day: DaySchedule, idx: number) => {
        console.log(`[DEBUG] Day ${idx}: ${day.day} ${day.date} - ${day.slots.length} slots`);
        day.slots.forEach((slot: ScheduleSlot, slotIdx: number) => {
          console.log(`  [DEBUG] Slot ${slotIdx}: ${slot.timeString}, isPast=${slot.isPast}`);
        });
      });
      
      setSchedule(data);
      
      // Set active day to first day with available (non-past) slots
      const firstAvailableDay = data.findIndex((d: DaySchedule) => 
        d.slots.length > 0 && d.slots.some((slot: ScheduleSlot) => !slot.isPast)
      );
      console.log(`[DEBUG] First day with available (non-past) slots: ${firstAvailableDay}`);
      
      if (firstAvailableDay >= 0) {
        setActiveDay(firstAvailableDay);
      } else {
        // If all slots are past, show the first day with any slots
        const firstDayWithSlots = data.findIndex((d: DaySchedule) => d.slots.length > 0);
        console.log(`[DEBUG] Fallback - first day with any slots: ${firstDayWithSlots}`);
        if (firstDayWithSlots >= 0) {
          setActiveDay(firstDayWithSlots);
        }
      }
    } catch (err: any) {
      setError(err.message);
      console.error("Weekly schedule fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full p-6 rounded-2xl card space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 rounded-2xl card text-center">
        <p style={{ color: "var(--clay-accent-soft-coral)" }}>{error}</p>
      </div>
    );
  }

  if (schedule.length === 0 || schedule.every((d) => d.slots.length === 0)) {
    return (
      <div className="w-full p-6 rounded-2xl card text-center">
        <p style={{ color: "var(--clay-text-secondary)" }}>
          No available appointment times for {facultyName}
        </p>
      </div>
    );
  }

  const currentDay = schedule[activeDay];
  
  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const isSlotBooked = (slot: ScheduleSlot) => {
    return bookedSlots.some(
      (bs) =>
        bs.faculty_id === facultyId &&
        bs.time_period === slot.timeString
    );
  };

  const isSlotSelected = (slot: ScheduleSlot) => {
    return selectedSlot?.date === currentDay.date && selectedSlot?.timeString === slot.timeString;
  };

  const isDayAllPast = (day: DaySchedule) => {
    if (day.slots.length === 0) return true;
    return day.slots.every((slot) => slot.isPast);
  };

  return (
    <div className="w-full space-y-6">
      {/* Day Navigation */}
      <div className="flex items-center justify-between gap-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveDay(Math.max(0, activeDay - 1));
          }}
          disabled={activeDay === 0}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={{ color: "var(--clay-text-primary)" }}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-2 pb-2">
            {schedule.map((day, idx) => {
              const isAllPast = isDayAllPast(day);
              return (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveDay(idx);
                }}
                disabled={isAllPast}
                className={`px-4 py-3 rounded-xl whitespace-nowrap font-medium transition-all flex-shrink-0 ${
                  activeDay === idx
                    ? "shadow-md"
                    : "opacity-75 hover:opacity-100"
                } ${isAllPast ? "opacity-40 cursor-not-allowed" : ""}`}
                style={{
                  background:
                    activeDay === idx
                      ? "var(--clay-accent-warm)"
                      : isAllPast
                        ? "var(--clay-bg-tertiary)"
                        : "var(--clay-bg-secondary)",
                  color:
                    activeDay === idx
                      ? "white"
                      : isAllPast
                        ? "var(--clay-text-secondary)"
                        : "var(--clay-text-secondary)",
                }}
              >
                <div className="text-xs" style={{ opacity: 0.9 }}>
                  {day.day}
                </div>
                <div className="text-sm font-bold">
                  {formatDate(day.date)}
                </div>
              </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveDay(Math.min(schedule.length - 1, activeDay + 1));
          }}
          disabled={activeDay === schedule.length - 1}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={{ color: "var(--clay-text-primary)" }}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Time Slots */}
      <div className="rounded-2xl p-6 card space-y-3">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" style={{ color: isDayAllPast(currentDay) ? "var(--clay-text-secondary)" : "var(--clay-accent-warm)" }} />
            <h3 className="text-lg font-bold" style={{ color: isDayAllPast(currentDay) ? "var(--clay-text-secondary)" : "var(--clay-text-primary)", opacity: isDayAllPast(currentDay) ? 0.5 : 1 }}>
              {currentDay.day}, {formatDate(currentDay.date)}
            </h3>
          </div>
          {isDayAllPast(currentDay) && (
            <span className="px-2 py-1 rounded text-xs font-semibold" style={{ background: "var(--clay-bg-tertiary)", color: "var(--clay-text-secondary)" }}>
              All Slots Past
            </span>
          )}
        </div>

        {currentDay.slots.length === 0 ? (
          <p style={{ color: "var(--clay-text-secondary)" }} className="text-center py-4">
            No available slots for this day
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {currentDay.slots.map((slot, idx) => {
              const isBooked = isSlotBooked(slot);
              const isSelected = isSlotSelected(slot);
              const isPast = slot.isPast;
              
              if (idx === 0) {
                console.log(`[DEBUG] Rendering first slot for ${currentDay.day}:`);
                console.log(`  slot.timeString: ${slot.timeString}`);
                console.log(`  isBooked: ${isBooked}`);
                console.log(`  isPast: ${isPast}`);
                console.log(`  isSelected: ${isSelected}`);
                console.log(`  disabled will be: ${isBooked || isPast}`);
                console.log(`  canClick: ${!isBooked && !isPast}`);
              }

              return (
                <motion.button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log(`[DEBUG] Clicked slot ${idx}: ${slot.timeString}`);
                    console.log(`  isBooked=${isBooked}, isPast=${isPast}, canClick=${!isBooked && !isPast}`);
                    if (!isBooked && !isPast) {
                      console.log(`[DEBUG] CALLING onSlotSelect for: ${slot.timeString}`);
                      onSlotSelect(slot, currentDay.date, currentDay.day);
                    } else {
                      console.log(`[DEBUG] BLOCKED - isBooked=${isBooked}, isPast=${isPast}`);
                    }
                  }}
                  disabled={isBooked || isPast}
                  whileHover={!isBooked && !isPast ? { scale: 1.05 } : {}}
                  whileTap={!isBooked && !isPast ? { scale: 0.95 } : {}}
                  className={`relative p-3 rounded-xl font-medium transition-all ${
                    isSelected ? "ring-4 shadow-lg" : ""
                  } ${
                    isPast
                      ? "opacity-40 cursor-not-allowed"
                      : isBooked
                        ? "opacity-50 cursor-not-allowed"
                        : isSelected
                          ? ""
                          : "hover:shadow-md"
                  }`}
                  style={{
                    background: isPast
                      ? "var(--clay-bg-tertiary)"
                      : isBooked
                        ? "var(--clay-bg-tertiary)"
                        : isSelected
                          ? "linear-gradient(135deg, var(--clay-accent-warm) 0%, rgba(212, 165, 116, 0.8) 100%)"
                          : "var(--clay-bg-secondary)",
                    color: isSelected ? "white" : "var(--clay-text-primary)",
                    ringColor: "var(--clay-accent-warm)",
                    boxShadow: isSelected 
                      ? "0 0 0 3px var(--clay-accent-warm), 0 8px 16px rgba(212, 165, 116, 0.3)"
                      : "none",
                    fontWeight: isSelected ? "700" : "500",
                    transform: isSelected ? "scale(1.02)" : "scale(1)"
                  }}
                >
                  <span className="text-sm">{slot.timeString.split(" - ")[0]}</span>
                  {isBooked && !isPast && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                      <Check className="w-4 h-4 opacity-60" />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}

        <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--clay-border)" }}>
          <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--clay-text-light)" }}>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ background: "var(--clay-accent-warm)" }}
              ></div>
              <span>Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded opacity-50"
                style={{ background: "var(--clay-bg-tertiary)" }}
              ></div>
              <span>Booked</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded opacity-40"
                style={{ background: "var(--clay-bg-tertiary)" }}
              ></div>
              <span>Passed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WeeklySchedule;
