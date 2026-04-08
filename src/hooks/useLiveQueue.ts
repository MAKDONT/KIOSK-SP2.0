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
    [sortLiveQueue, fetchLegacyLiveQueue]
  );

  return {
    liveQueue,
    setLiveQueue,
    liveQueueLoading,
    setLiveQueueLoading,
    fetchLiveQueue,
  };
}
