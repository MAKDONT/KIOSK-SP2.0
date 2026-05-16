import { useState, useCallback } from "react";

interface LiveQueueItem {
  id: number;
  status: "waiting" | "serving";
  created_at: string;
  faculty_id: string;
  faculty_name: string;
  student_name: string;
  student_number: string;
  time_period?: string | null;
  meet_link?: string | null;
  queue_date?: string | null;
  consultation_date_display?: string | null;
}

export function useLiveQueue() {
  const [liveQueue, setLiveQueue] = useState<LiveQueueItem[]>([]);
  const [liveQueueLoading, setLiveQueueLoading] = useState(false);

  const sortLiveQueue = useCallback((items: LiveQueueItem[]) => {
    const rank = (status: LiveQueueItem["status"]) => {
      if (status === "serving") return 0;
      return 1;
    };

    return [...items].sort((a, b) => {
      const statusDiff = rank(a.status) - rank(b.status);
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, []);

  /**
   * Groups queue items by consultation date (queue_date)
   * Returns an array of { date, displayDate, items } objects sorted by date
   * Within each date, items are sorted by status (serving first) then by creation time (FIFO)
   */
  const groupQueueByDate = useCallback((items: LiveQueueItem[]) => {
    const dateGroups: Record<string, { serving: LiveQueueItem[], waiting: LiveQueueItem[] }> = {};

    // Group items by queue_date
    items.forEach(item => {
      const dateKey = item.queue_date || item.consultation_date_display || "No Date";
      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = { serving: [], waiting: [] };
      }
      if (item.status === "serving") {
        dateGroups[dateKey].serving.push(item);
      } else {
        dateGroups[dateKey].waiting.push(item);
      }
    });

    // Convert to array and sort dates chronologically
    const sortedDates = Object.entries(dateGroups).sort(([dateA], [dateB]) => {
      try {
        const a = new Date(dateA).getTime();
        const b = new Date(dateB).getTime();
        return a - b;
      } catch {
        return 0;
      }
    });

    // Return structured groups with FIFO ordering within each date
    return sortedDates.map(([dateKey, groups]) => {
      // Sort serving by created_at (FIFO within serving)
      const sortedServing = [...groups.serving].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Sort waiting by created_at (FIFO within waiting)
      const sortedWaiting = [...groups.waiting].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      return {
        date: dateKey,
        displayDate: dateKey === "No Date" ? "No Date" : dateKey,
        items: [...sortedServing, ...sortedWaiting],
        servingCount: sortedServing.length,
        waitingCount: sortedWaiting.length,
      };
    });
  }, []);

  const fetchLegacyLiveQueue = useCallback(async (): Promise<LiveQueueItem[]> => {
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
            .map((item: any) => {
              // Format consultation date for display
              let consultation_date_display = undefined;
              if (item.queue_date) {
                try {
                  const dateObj = new Date(item.queue_date);
                  const formatter = new Intl.DateTimeFormat("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric"
                  });
                  consultation_date_display = formatter.format(dateObj);
                } catch (e) {
                  consultation_date_display = item.queue_date;
                }
              }

              return {
                id: Number(item.id),
                status: item.status as LiveQueueItem["status"],
                created_at: item.created_at,
                faculty_id: f.id,
                faculty_name: f.name || "Unknown Faculty",
                student_name: item.student_name || "Unknown Student",
                student_number: item.student_number || "",
                time_period: item.time_period || null,
                meet_link: item.meet_link || null,
                queue_date: item.queue_date || null,
                consultation_date_display,
              };
            });
        } catch {
          return [];
        }
      })
    );

    return sortLiveQueue(queueLists.flat());
  }, [sortLiveQueue]);

  const fetchLiveQueue = useCallback(
    async (retries = 2, silent = false) => {
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
    },
    [sortLiveQueue, fetchLegacyLiveQueue, groupQueueByDate]
  );

  return {
    liveQueue,
    setLiveQueue,
    liveQueueLoading,
    setLiveQueueLoading,
    fetchLiveQueue,
    groupQueueByDate,
  };
}
