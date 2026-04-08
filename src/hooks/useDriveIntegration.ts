import { useState, useCallback } from "react";

interface DriveRecording {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  createdTime: string | null;
  modifiedTime: string | null;
  size: number | null;
  consultationId: string | null;
  facultyId: string | null;
  facultyName: string | null;
  studentId: string | null;
  studentName: string | null;
  studentNumber: string | null;
}

export function useDriveIntegration() {
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveMode, setDriveMode] = useState<"service_account" | "oauth" | "none">("none");
  const [meetConnected, setMeetConnected] = useState(false);
  const [meetMode, setMeetMode] = useState<"service_account" | "oauth" | "none">("none");
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthExpired, setOauthExpired] = useState(false);
  const [oauthExpiresAt, setOauthExpiresAt] = useState<string | null>(null);
  const [tokenMaxAgeDays, setTokenMaxAgeDays] = useState(30);
  const [driveRecordings, setDriveRecordings] = useState<DriveRecording[]>([]);
  const [driveRecordingsLoading, setDriveRecordingsLoading] = useState(false);
  const [driveRecordingsError, setDriveRecordingsError] = useState("");
  const [driveRecordingsNextPageToken, setDriveRecordingsNextPageToken] = useState<string | null>(null);
  const [driveRecordingsSearch, setDriveRecordingsSearch] = useState("");
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [recordingStorageReady, setRecordingStorageReady] = useState(false);

  const checkDriveStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/drive/status`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      setDriveConnected(data.driveConnected ?? data.connected);
      setDriveMode(data.driveMode || data.mode || "none");
      setMeetConnected(Boolean(data.meetConnected));
      setMeetMode(data.meetMode || "none");
      setOauthConnected(Boolean(data.oauthConnected));
      setOauthExpired(Boolean(data.oauthExpired));
      setOauthExpiresAt(typeof data.oauthExpiresAt === "string" ? data.oauthExpiresAt : null);
      setTokenMaxAgeDays(typeof data.tokenMaxAgeDays === "number" ? data.tokenMaxAgeDays : 30);
    } catch (err) {
      console.error("Failed to check drive status", err instanceof Error ? err.message : String(err));
    }
  }, [])

  const checkRecordingStorageStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/recordings/status");
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP error! status: ${res.status}` }));
        throw new Error(data.error || "Supabase recording storage is unavailable.");
      }
      const data = await res.json();

      const ready = Boolean(data.ready);
      setRecordingStorageReady(ready);
      if (ready) {
        setDriveRecordingsError("");
      }
      return ready;
    } catch (err) {
      console.error("Failed to check recording storage status", err instanceof Error ? err.message : String(err));
      setRecordingStorageReady(false);
      setDriveRecordingsError(err instanceof Error ? err.message : "Supabase recording storage is unavailable.");
      return false;
    }
  }, []);

  const fetchDriveRecordings = useCallback(async (loadMore = false) => {
    const pageToken = loadMore ? driveRecordingsNextPageToken : null;
    if (loadMore && !pageToken) return;

    setDriveRecordingsLoading(true);
    setDriveRecordingsError("");
    try {
      const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
      const res = await fetch(`/api/recordings${query}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP error! status: ${res.status}` }));
        throw new Error(data.error || "Failed to load consultation recordings.");
      }
      const data = await res.json();

      const files = Array.isArray(data.files) ? (data.files as DriveRecording[]) : [];
      setDriveRecordings((current) => (loadMore ? [...current, ...files] : files));
      setDriveRecordingsNextPageToken(typeof data.nextPageToken === "string" ? data.nextPageToken : null);
      setSelectedRecordingId((current) => {
        const mergedFiles = loadMore ? [...driveRecordings, ...files] : files;
        if (current && mergedFiles.some((item) => item.id === current)) {
          return current;
        }
        return mergedFiles[0]?.id || null;
      });
    } catch (err) {
      console.error("Failed to fetch consultation recordings", err instanceof Error ? err.message : String(err));
      setDriveRecordingsError(err instanceof Error ? err.message : "Failed to load consultation recordings.");
    } finally {
      setDriveRecordingsLoading(false);
    }
  }, [driveRecordingsNextPageToken, driveRecordings]);

  const handleConnectDrive = useCallback(async () => {
    try {
      const response = await fetch(`/api/auth/google/url`);
      if (!response.ok) throw new Error("Failed to get auth URL");
      const data = await response.json();
      const { url, mode, message } = data;

      if (!url) {
        if (mode === "service_account") {
          await checkDriveStatus();
          alert(message || "Server-side Google integration is already active.");
          return;
        }
        throw new Error(message || "No OAuth URL returned.");
      }

      const authWindow = window.open(url, "oauth_popup", "width=600,height=700");
      if (!authWindow) {
        alert("Please allow popups for this site to connect your account.");
      }
    } catch (error) {
      console.error("OAuth error:", error);
      alert("Failed to initiate Google connection.");
    }
  }, [checkDriveStatus]);

  const handleDisconnectDrive = useCallback(async () => {
    if (!oauthConnected) {
      if (oauthExpired) {
        alert("Your Google OAuth session has expired. Reconnect Google to restore Meet auto-links.");
      } else if (driveMode === "service_account") {
        alert("Server-side Google integration is managed by environment variables. There is no admin OAuth connection to disconnect.");
      } else {
        alert("No admin Google OAuth connection is currently stored.");
      }
      return;
    }
    if (!confirm("Are you sure you want to disconnect Google? Meet links will not auto-generate until you reconnect. Recordings will continue saving to Supabase Storage."))
      return;

    try {
      const res = await fetch("/api/drive/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
      await checkDriveStatus();
      alert("Google OAuth disconnected successfully.");
    } catch (err) {
      console.error("Failed to disconnect drive", err);
      alert("Failed to disconnect Google.");
    }
  }, [oauthConnected, oauthExpired, driveMode, checkDriveStatus]);

  return {
    driveConnected,
    setDriveConnected,
    driveMode,
    setDriveMode,
    meetConnected,
    setMeetConnected,
    meetMode,
    setMeetMode,
    oauthConnected,
    setOauthConnected,
    oauthExpired,
    setOauthExpired,
    oauthExpiresAt,
    setOauthExpiresAt,
    tokenMaxAgeDays,
    setTokenMaxAgeDays,
    driveRecordings,
    setDriveRecordings,
    driveRecordingsLoading,
    setDriveRecordingsLoading,
    driveRecordingsError,
    setDriveRecordingsError,
    driveRecordingsNextPageToken,
    setDriveRecordingsNextPageToken,
    driveRecordingsSearch,
    setDriveRecordingsSearch,
    selectedRecordingId,
    setSelectedRecordingId,
    recordingStorageReady,
    setRecordingStorageReady,
    checkDriveStatus,
    checkRecordingStorageStatus,
    fetchDriveRecordings,
    handleConnectDrive,
    handleDisconnectDrive,
  };
}
