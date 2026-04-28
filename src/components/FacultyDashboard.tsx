import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Users, CheckCircle, Video, XCircle, ChevronRight, Clock, ArrowLeft, LogOut, KeyRound, AlertTriangle, Eye, EyeOff, MessageCircle } from "lucide-react";
import { clearStaffSession, getStaffSessionUserId } from "../staffSession";
import { formatTime12HourPHTFns, formatInTimezonePHT, getDayNamePHT } from "../utils/timezoneUtils";

interface Consultation {
  id: number;
  student_id: string;
  student_name: string;
  student_number?: string;
  status: "waiting" | "serving";
  created_at: string;
  queue_date?: string; // YYYY-MM-DD format
  source: string;
  meet_link?: string;
  purpose?: string;
  time_period?: string | null;
}

interface Faculty {
  id: string;
  name: string;
  full_name?: string;
  department: string;
  status: string;
}

interface RecordingContext {
  consultationId: number;
  studentId: string;
  studentName: string;
  studentNumber: string;
}

const WEEKDAY_OPTIONS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const readJsonResponse = async (response: Response, fallbackMessage: string) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Backend API returned HTML instead of JSON. Restart the backend server or redeploy the app, then try again.");
  }

  const payload = await response.json().catch(() => null);
  if (payload === null) {
    throw new Error(fallbackMessage);
  }

  return payload as Record<string, unknown>;
};

const getConsultationTimeLabel = (consultation: Consultation) => {
  const scheduledSlot = consultation.time_period?.trim();
  
  if (scheduledSlot) {
    // If time_period exists, prepend the day name from queue_date
    if (consultation.queue_date) {
      // Parse queue_date (YYYY-MM-DD format) to get day of week
      const consultationDate = new Date(consultation.queue_date + 'T00:00:00');
      const dayName = getDayNamePHT(consultationDate);
      return `${dayName} ${scheduledSlot}`;
    }
    return scheduledSlot;
  }

  const createdAt = new Date(consultation.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return "Walk-in consultation";
  }

  // For walk-in consultations, show day and time using timezone-aware formatting
  const dayName = getDayNamePHT(createdAt);
  const timeFormatted = formatTime12HourPHTFns(createdAt);
  return `${dayName} ${timeFormatted} (Walk-in)`;
};

export default function FacultyDashboard() {
  const { id: selectedFaculty } = useParams();
  const navigate = useNavigate();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [queue, setQueue] = useState<Consultation[]>([]);
  const [meetLinksByConsultation, setMeetLinksByConsultation] = useState<Record<number, string>>({});
  const [manualMeetFallbackOpen, setManualMeetFallbackOpen] = useState<Record<number, boolean>>({});
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState<{day: string, start: string, end: string}[]>([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [telegramStatus, setTelegramStatus] = useState<{ registered: boolean; is_active: boolean; telegram_username?: string; registered_at?: string } | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState("");
  const [telegramSuccess, setTelegramSuccess] = useState("");
  const [consultationAlert, setConsultationAlert] = useState<{
    consultation_id: number;
    student_name: string;
    time_slot: string;
    meet_link: string;
    minutes_until_start: number;
  } | null>(null);
  const sessionWindowRef = useRef<Window | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mixedAudioContextRef = useRef<AudioContext | null>(null);
  const discardRecordingOnStopRef = useRef(false);
  const recordingContextRef = useRef<RecordingContext | null>(null);

  const logoutStaff = () => {
    clearStaffSession();
    navigate("/faculty/login");
  };

  const playNotificationSound = (data: any) => {
    // Create audio context for notification sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const bufferLength = audioContext.sampleRate * 2.5; // 2.5 seconds
    const buffer = audioContext.createBuffer(1, bufferLength, audioContext.sampleRate);
    const data_array = buffer.getChannelData(0);

    // Generate alarm pattern: ascending chirps with longer beeps
    const beepDuration = audioContext.sampleRate * 0.15; // 150ms per beep
    const silence = audioContext.sampleRate * 0.05; // 50ms silence

    let pos = 0;
    const frequencies = [800, 1000, 1200, 1000]; // Ascending tones

    // Generate 4 chirps with increasing frequency then back down
    for (let i = 0; i < frequencies.length; i++) {
      const freq = frequencies[i];
      // Beep sound
      for (let j = 0; j < beepDuration; j++) {
        data_array[pos++] = Math.sin((2 * Math.PI * freq * j) / audioContext.sampleRate) * 0.4;
      }
      // Silence
      for (let j = 0; j < silence; j++) {
        data_array[pos++] = 0;
      }
    }

    // Play the buffer
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);

    // Show browser notification if permission granted
    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification("ðŸ”” Consultation Starting Soon!", {
        body: `${data.student_name} - ${data.time_slot}\nJoining in ${data.minutes_until_start} minutes`,
        tag: `consultation-${data.consultation_id}`,
        requireInteraction: true,
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%234F46E5'/><text x='50' y='65' font-size='60' fill='white' text-anchor='middle'>ðŸ””</text></svg>"
      });
      
      // Auto-close after 10 seconds
      setTimeout(() => notification.close(), 10000);
    }
  };

  useEffect(() => {
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const staffUserId = getStaffSessionUserId();
    if (!staffUserId) {
      navigate("/faculty/login");
      return;
    }

    if (selectedFaculty && staffUserId !== selectedFaculty) {
      navigate(`/faculty/${staffUserId}`, { replace: true });
      return;
    }

    fetchFaculty();
  }, [navigate, selectedFaculty]);

  useEffect(() => {
    if (selectedFaculty) {
      fetchQueue();
      void fetchGoogleMeetStatus();
      // Setup WebSocket for real-time updates
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      let shouldCloseAfterConnect = false;

      ws.onopen = () => {
        if (shouldCloseAfterConnect) {
          ws.close();
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "queue_updated") {
            fetchQueue();
          }
          if (data.type === "faculty_updated") {
            fetchFaculty();
          }
          if (data.type === "consultation_starting_soon" && data.payload.faculty_id === selectedFaculty) {

            // Show modal alert
            setConsultationAlert({
              consultation_id: data.payload.consultation_id,
              student_name: data.payload.student_name,
              time_slot: data.payload.time_slot,
              meet_link: data.payload.meet_link,
              minutes_until_start: data.payload.minutes_until_start
            });
            // Play notification sound
            playNotificationSound(data.payload);
          }
        } catch (err) {
          // Error parsing WS message
        }
      };

      return () => {
        shouldCloseAfterConnect = true;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };
    }
  }, [selectedFaculty]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.facultyId && String(event.data.facultyId) !== String(selectedFaculty)) {
        return;
      }

      if (event.data?.type === "FACULTY_GOOGLE_AUTH_SUCCESS") {
        void fetchGoogleMeetStatus();
      } else if (event.data?.type === "FACULTY_GOOGLE_AUTH_ERROR") {
        alert(`Google connection failed: ${event.data?.error || "Unknown error"}`);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [selectedFaculty]);

  useEffect(() => {
    setMeetLinksByConsultation((current) => {
      const next: Record<number, string> = {};

      for (const consultation of queue) {
        if (consultation.meet_link) {
          next[consultation.id] = consultation.meet_link;
        } else if (current[consultation.id]) {
          next[consultation.id] = current[consultation.id];
        }
      }

      return next;
    });
  }, [queue]);

  useEffect(() => {
    setManualMeetFallbackOpen((current) => {
      const next: Record<number, boolean> = {};

      for (const consultation of queue) {
        if (current[consultation.id]) {
          next[consultation.id] = true;
        }
      }

      return next;
    });
  }, [queue]);

  const fetchFaculty = async (retries = 3) => {
    try {
      const res = await fetch("/api/faculty");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaculty(data);
      }
    } catch (err) {
      // Error fetching faculty
      if (retries > 0) {
        setTimeout(() => fetchFaculty(retries - 1), 2000);
      }
    }
  };

  const fetchQueue = async (retries = 3) => {
    try {
      const res = await fetch(`/api/faculty/${selectedFaculty}/queue`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setQueue(data);
      }
    } catch (err) {
      // Error fetching queue
      if (retries > 0) {
        setTimeout(() => fetchQueue(retries - 1), 2000);
      }
    }
  };

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingStorageReady, setRecordingStorageReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [startingSessionId, setStartingSessionId] = useState<number | null>(null);
  const [googleMeetConnected, setGoogleMeetConnected] = useState(false);
  const [googleMeetMode, setGoogleMeetMode] = useState<"oauth" | "service_account" | "none">("none");
  const [googleMeetEmail, setGoogleMeetEmail] = useState<string | null>(null);
  const [googleMeetConnectedAt, setGoogleMeetConnectedAt] = useState<string | null>(null);
  const [googleMeetLoading, setGoogleMeetLoading] = useState(false);
  const [showAudioPermissionModal, setShowAudioPermissionModal] = useState(false);
  const [audioPermissionCallback, setAudioPermissionCallback] = useState<((granted: boolean) => void) | null>(null);
  const [audioPermissionError, setAudioPermissionError] = useState("");

  const fetchGoogleMeetStatus = async () => {
    if (!selectedFaculty) return;

    try {
      const res = await fetch(`/api/faculty/${selectedFaculty}/google/status`);
      const data = await readJsonResponse(res, "Failed to load Google Meet connection status.");
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to load Google Meet connection status.");
      }

      setGoogleMeetConnected(Boolean(data.connected));
      setGoogleMeetMode(typeof data.mode === "string" ? (data.mode as "oauth" | "service_account" | "none") : "none");
      setGoogleMeetEmail(typeof data.email === "string" ? data.email : null);
      setGoogleMeetConnectedAt(typeof data.connectedAt === "string" ? data.connectedAt : null);
    } catch (err) {
      // Error fetching Google Meet status
      setGoogleMeetConnected(false);
      setGoogleMeetMode("none");
      setGoogleMeetEmail(null);
      setGoogleMeetConnectedAt(null);
    }
  };

  const checkRecordingStorageStatus = async () => {
    try {
      const res = await fetch(`/api/recordings/status`);
      const data = await readJsonResponse(res, "Failed to load recording storage status.");
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : `HTTP error! status: ${res.status}`);
      }
      const ready = Boolean(data.ready);
      setRecordingStorageReady(ready);
      return ready;
    } catch (err) {
      // Error checking recording storage
      setRecordingStorageReady(false);
      return false;
    }
  };

  const handleConnectGoogleMeet = async () => {
    if (!selectedFaculty) return;

    setGoogleMeetLoading(true);
    try {
      const response = await fetch(`/api/faculty/${selectedFaculty}/google/url`);
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : null;
      if (!response.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed to start Google connection.");
      }

      if (!data || typeof (data as { url?: string }).url !== "string" || !(data as { url: string }).url) {
        throw new Error("Google OAuth endpoint returned an unexpected response. Restart the backend server or redeploy the app, then try again.");
      }

      const authWindow = window.open((data as { url: string }).url, "faculty_google_oauth", "width=600,height=700");
      if (!authWindow) {
        alert("Please allow popups for this site to connect your Google account.");
      }
    } catch (err) {
      // Error connecting to Google
      alert(err instanceof Error ? err.message : "Failed to connect Google Meet.");
    } finally {
      setGoogleMeetLoading(false);
    }
  };

  const handleDisconnectGoogleMeet = async () => {
    if (!selectedFaculty) return;
    if (!googleMeetConnected || googleMeetMode !== "oauth") return;
    if (!confirm("Disconnect your Google account? Meet links will stop auto-generating until you reconnect.")) {
      return;
    }

    setGoogleMeetLoading(true);
    try {
      const res = await fetch(`/api/faculty/${selectedFaculty}/google/disconnect`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to disconnect Google.");
      }

      await fetchGoogleMeetStatus();
    } catch (err) {
      // Error disconnecting from Google
      alert(err instanceof Error ? err.message : "Failed to disconnect Google.");
    } finally {
      setGoogleMeetLoading(false);
    }
  };

  useEffect(() => {
    void checkRecordingStorageStatus();

    const refreshRecordingStorageStatus = () => {
      void checkRecordingStorageStatus();
      void fetchGoogleMeetStatus();
    };

    window.addEventListener("focus", refreshRecordingStorageStatus);
    const intervalId = window.setInterval(refreshRecordingStorageStatus, 30000);

    return () => {
      window.removeEventListener("focus", refreshRecordingStorageStatus);
      window.clearInterval(intervalId);
    };
  }, []);

  // Warn user before accidental page reload while recording is active
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [mediaRecorder]);

  useEffect(() => {
    return () => {
      if (sessionWindowRef.current && !sessionWindowRef.current.closed) {
        sessionWindowRef.current.close();
      }
      sessionWindowRef.current = null;
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
      displayStreamRef.current?.getTracks().forEach((track) => track.stop());
      void mixedAudioContextRef.current?.close();
      microphoneStreamRef.current = null;
      displayStreamRef.current = null;
      mixedAudioContextRef.current = null;
    };
  }, []);

  const closeSessionWindow = () => {
    if (sessionWindowRef.current && !sessionWindowRef.current.closed) {
      sessionWindowRef.current.close();
    }
    sessionWindowRef.current = null;
  };

  const prepareSessionWindow = () => {
    closeSessionWindow();

    const sessionWindow = window.open("", "_blank");
    sessionWindowRef.current = sessionWindow;
    if (!sessionWindow) {
      return null;
    }

    try {
      sessionWindow.document.title = "Preparing Google Meet";
      sessionWindow.document.body.innerHTML = `
        <main style="font-family: Arial, sans-serif; padding: 32px; color: #171717; background: #f5f5f5;">
          <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e5e5; border-radius: 16px; padding: 24px;">
            <h1 style="margin: 0 0 12px; font-size: 20px;">Preparing Google Meet</h1>
            <p style="margin: 0; line-height: 1.5;">
              Return to the faculty dashboard and finish the recording permission prompt. This tab will load Google Meet once the consultation starts.
            </p>
          </div>
        </main>
      `;
    } catch (err) {
      // Error rendering Meet placeholder
    }

    sessionWindow.blur();
    window.focus();
    return sessionWindow;
  };

  const openPreparedSessionWindow = (meetLink: string) => {
    if (!meetLink) {
      return;
    }

    const sessionWindow = sessionWindowRef.current;
    if (sessionWindow && !sessionWindow.closed) {
      sessionWindow.location.href = meetLink;
      sessionWindow.focus();
      return;
    }

    sessionWindowRef.current = window.open(meetLink, "_blank");
  };

  const focusSessionWindow = (meetLink: string) => {
    if (!meetLink) {
      return;
    }

    const sessionWindow = sessionWindowRef.current;
    if (sessionWindow && !sessionWindow.closed) {
      sessionWindow.focus();
      return;
    }

    sessionWindowRef.current = window.open(meetLink, "_blank");
  };

  const cleanupRecordingResources = () => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    displayStreamRef.current?.getTracks().forEach((track) => track.stop());
    void mixedAudioContextRef.current?.close();
    microphoneStreamRef.current = null;
    displayStreamRef.current = null;
    mixedAudioContextRef.current = null;
  };

  const uploadRecording = async (blob: Blob, recordingContext: RecordingContext | null) => {
    const storageReady = await checkRecordingStorageStatus();
    if (!storageReady) {
      alert("Supabase recording storage is not available. Recording was not uploaded.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', blob, `consultation-audio-${new Date().toISOString().replace(/:/g, '-')}.webm`);
    formData.append('faculty_id', selectedFaculty!.toString());
    if (recordingContext) {
      formData.append('consultation_id', String(recordingContext.consultationId));
      formData.append('student_id', recordingContext.studentId);
      formData.append('student_name', recordingContext.studentName);
      formData.append('student_number', recordingContext.studentNumber);
    }

    try {
      const res = await fetch('/api/recordings/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setRecordingStorageReady(false);
        throw new Error(data.error || "Upload failed");
      }
      setRecordingStorageReady(true);
    } catch (err) {
      // Error uploading recording
      const message = err instanceof Error ? err.message : "Failed to save to Supabase Storage.";
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  const startAudioRecording = async (recordingContext: RecordingContext | null, onDisplayStreamSelected?: () => void) => {
    cleanupRecordingResources();
    discardRecordingOnStopRef.current = false;
    recordingContextRef.current = recordingContext;

    try {
      const microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      microphoneStreamRef.current = microphoneStream;

      if (!navigator.mediaDevices.getDisplayMedia) {
        throw new Error("This browser does not support Google Meet audio capture.");
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });
      displayStreamRef.current = displayStream;

      // RIGHT AFTER user clicks Share/selects display, open the Google Meet tab
      if (onDisplayStreamSelected) {
        onDisplayStreamSelected();
      }

      const audioContext = new AudioContext();
      mixedAudioContextRef.current = audioContext;
      const destination = audioContext.createMediaStreamDestination();

      const connectAudioStream = (stream: MediaStream | null) => {
        if (!stream || stream.getAudioTracks().length === 0) {
          return false;
        }

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(destination);
        return true;
      };

      const hasMicrophoneAudio = connectAudioStream(microphoneStream);
      const hasDisplayAudio = connectAudioStream(displayStream);

      if (!hasMicrophoneAudio) {
        throw new Error("Microphone permission is required to start the consultation.");
      }

      if (!hasDisplayAudio) {
        throw new Error("Google Meet tab or window audio must be shared before the consultation can start.");
      }

      if (!MediaRecorder.isTypeSupported("audio/webm;codecs=opus") && !MediaRecorder.isTypeSupported("audio/webm")) {
        throw new Error("This browser does not support WebM audio recording.");
      }

      const recorder = new MediaRecorder(destination.stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        setMediaRecorder(null);
        const shouldDiscard = discardRecordingOnStopRef.current;
        discardRecordingOnStopRef.current = false;
        cleanupRecordingResources();

        if (shouldDiscard) {
          recordingContextRef.current = null;
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const currentRecordingContext = recordingContextRef.current;
        recordingContextRef.current = null;
        await uploadRecording(blob, currentRecordingContext);
      };
      
      recorder.start();
      setMediaRecorder(recorder);

      const stopRecorderIfActive = () => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      };

      microphoneStream?.getAudioTracks().forEach((track) => {
        track.onended = stopRecorderIfActive;
      });

      // Only listen on audio tracks â€” video tracks from getDisplayMedia can end when
      // the faculty tab goes to background (user switches to Google Meet tab) and
      // should NOT stop the audio recording.
      displayStream?.getAudioTracks().forEach((track) => {
        track.onended = stopRecorderIfActive;
      });
    } catch (err) {
      recordingContextRef.current = null;
      cleanupRecordingResources();
      const message = err instanceof Error
        ? err.message
        : "Could not start audio recording.";
      throw new Error(`${message} Microphone permission and Google Meet/tab audio sharing are required before the consultation can begin.`);
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  };

  const normalizeMeetLink = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  };

  const isMeetLinkAlreadyAssigned = (consultationId: number, candidateLink: string) => {
    const normalizedCandidate = normalizeMeetLink(candidateLink).toLowerCase();
    if (!normalizedCandidate) return false;

    return queue.some((consultation) => {
      if (consultation.id === consultationId) {
        return false;
      }

      const assignedLink = consultation.meet_link || meetLinksByConsultation[consultation.id] || "";
      if (!assignedLink) {
        return false;
      }

      return normalizeMeetLink(assignedLink).toLowerCase() === normalizedCandidate;
    });
  };

  const updateStatus = async (id: number, status: string, link?: string, autoCallNext: boolean = false, recordingEnabled: boolean = false) => {
    try {
      const res = await fetch(`/api/queue/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, meet_link: link, recording_enabled: recordingEnabled }),
      });

      const payload = await res.json();
      
      if (!res.ok) {
        const error = new Error(payload.error || "Failed to update consultation status.") as Error & {
          meetRequired?: boolean;
          recordingRequired?: boolean;
        };
        error.meetRequired = payload.meet_required === true;
        error.recordingRequired = payload.recording_required === true;
        throw error;
      }
      
      if (status === "completed" || status === "cancelled") {
        stopAudioRecording();
        closeSessionWindow();
      }
      
      if (autoCallNext && (status === "completed" || status === "cancelled")) {
        // Auto-next functionality removed with next status elimination
      }
      
      fetchQueue();
      return payload as { success: boolean; meet_link?: string | null };
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to update consultation status.");
    }
  };

  const requestAudioPermission = (): Promise<boolean> => {
    return new Promise((resolve) => {
      setAudioPermissionError("");
      setAudioPermissionCallback(() => resolve);
      setShowAudioPermissionModal(true);
    });
  };

  const createMeetLink = async (consultationId: number) => {
    const res = await fetch(`/api/queue/${consultationId}/meet-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const payload = await readJsonResponse(res, "Failed to prepare Google Meet link.");
    if (!res.ok) {
      const error = new Error(
        typeof payload.error === "string" ? payload.error : "Failed to prepare Google Meet link."
      ) as Error & { meetRequired?: boolean };
      error.meetRequired = payload.meet_required === true;
      throw error;
    }

    const meetLink = typeof payload.meet_link === "string" ? normalizeMeetLink(payload.meet_link) : "";
    if (!meetLink) {
      throw new Error("Google Meet link was not generated. Add a manual Google Meet link and try again.");
    }

    return meetLink;
  };

  const handleAudioPermissionAllow = async () => {
    try {
      setAudioPermissionError("");
      const microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      // Stop the stream immediately since we just wanted to check permission
      microphoneStream.getTracks().forEach((track) => track.stop());
      
      setShowAudioPermissionModal(false);
      audioPermissionCallback?.(true);
    } catch (err) {
      // Microphone permission error
      setAudioPermissionError("Audio recording is mandatory. Please allow microphone access to continue.");
    }
  };

  const handleAudioPermissionDeny = () => {
    setAudioPermissionError("Audio recording is mandatory. Please allow microphone access to continue.");
  };

  const handleStartSession = async (id: number, existingLink?: string) => {
    if (startingSessionId !== null) return;

    const draftLink = meetLinksByConsultation[id]?.trim() || "";
    let finalLink = draftLink || existingLink || "";
    const currentConsultation = queue.find((consultation) => consultation.id === id);
    const recordingContext = currentConsultation
      ? {
          consultationId: currentConsultation.id,
          studentId: currentConsultation.student_id,
          studentName: currentConsultation.student_name || "",
          studentNumber: currentConsultation.student_number || "",
        }
      : null;

    if (draftLink) {
      finalLink = normalizeMeetLink(draftLink);

      if (isMeetLinkAlreadyAssigned(id, finalLink)) {
        alert("This Google Meet link is already assigned to another student. Please use a different link.");
        return;
      }
    } else if (existingLink) {
      finalLink = normalizeMeetLink(existingLink);
    }

    if (!draftLink && !finalLink && googleMeetMode === "none") {
      setManualMeetFallbackOpen((current) => ({
        ...current,
        [id]: true,
      }));
      alert("Paste a manual Google Meet link before starting the consultation, or configure automatic Meet link generation in Integrations.");
      return;
    }

    setStartingSessionId(id);

    try {
      // Step 0: Request audio recording permission before starting consultation
      await requestAudioPermission();

      // Step 1: Create Google Meet link
      if (!finalLink) {
        finalLink = await createMeetLink(id);
      }

      // Step 2: Open a blank tab but DON'T switch focus to it
      const blankTab = window.open("about:blank", "_blank");
      if (!blankTab) {
        throw new Error("Popup was blocked. Please allow popups to continue.");
      }
      sessionWindowRef.current = blankTab;
      
      // Keep focus on this dashboard window (don't switch to the blank tab)
      window.focus();

      // Step 3: Start audio recording (screen share dialog appears while you're still on dashboard)
      // User will select the blank tab from the dialog and click Share
      await startAudioRecording(recordingContext, () => {
        // After user clicks Share, convert the blank tab to Google Meet
        if (sessionWindowRef.current && !sessionWindowRef.current.closed) {
          sessionWindowRef.current.location.href = finalLink;
          sessionWindowRef.current.focus();
        }
      });

      // Step 3: Mark the consultation as started only after audio capture succeeds.
      const data = await updateStatus(id, "serving", finalLink || undefined, false, true);
      const resolvedLink = data?.meet_link ? normalizeMeetLink(data.meet_link) : finalLink;

      if (!resolvedLink) {
        throw new Error("Google Meet link was not generated. Add a manual Google Meet link and try again.");
      }

      setMeetLinksByConsultation((current) => ({
        ...current,
        [id]: resolvedLink,
      }));

      fetchQueue();
    } catch (err) {
      discardRecordingOnStopRef.current = true;
      stopAudioRecording();
      closeSessionWindow();
      const startError = err as Error & { meetRequired?: boolean; recordingRequired?: boolean };
      if (startError.meetRequired) {
        setManualMeetFallbackOpen((current) => ({
          ...current,
          [id]: true,
        }));
      }

      const baseMessage = err instanceof Error ? err.message : "Failed to start consultation.";
      const message = startError.meetRequired
        ? `${baseMessage}\nPaste a manual Google Meet link and try again.`
        : baseMessage;
      alert(message);
    } finally {
      setStartingSessionId(null);
    }
  };

  const selectedFacultyData = faculty.find(f => f.id === selectedFaculty);

  const toggleFacultyStatus = async () => {
    if (!selectedFacultyData) return;
    const newStatus = selectedFacultyData.status === 'available' ? 'offline' : 'available';
    try {
      await fetch(`/api/faculty/${selectedFaculty}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchFaculty();
    } catch (err) {
    }
  };

  const openAvailabilityModal = () => {
    if (!selectedFacultyData) return;
    try {
      // full_name can be either already-parsed array or JSON string
      const parsed = Array.isArray(selectedFacultyData.full_name)
        ? selectedFacultyData.full_name
        : JSON.parse(selectedFacultyData.full_name || "[]");
      if (Array.isArray(parsed)) {
        setAvailabilitySlots(parsed);
      } else {
        setAvailabilitySlots([]);
      }
    } catch (e) {
      setAvailabilitySlots([]);
    }
    setShowAvailabilityModal(true);
  };

  const saveAvailability = async () => {
    // Validate that all slots have required fields
    for (let i = 0; i < availabilitySlots.length; i++) {
      const slot = availabilitySlots[i];
      if (!slot.day || !slot.start || !slot.end) {
        alert(`Time Slot ${i + 1} is incomplete. Please fill in all fields (Day, Start Time, End Time).`);
        return;
      }
      if (!WEEKDAY_OPTIONS.includes(slot.day)) {
        alert(`Time Slot ${i + 1} has an invalid day. Only Monday to Friday are allowed.`);
        return;
      }
    }

    try {
      const res = await fetch(`/api/faculty/${selectedFaculty}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability: availabilitySlots }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save availability (${res.status})`);
      }

      alert("Availability saved successfully!");
      setShowAvailabilityModal(false);
      fetchFaculty();
    } catch (err: any) {
      alert(`Error saving availability: ${err.message}`);
    }
  };

  const addSlot = () => {
    setAvailabilitySlots([...availabilitySlots, { day: "Monday", start: "09:00", end: "10:00" }]);
  };

  const removeSlot = (index: number) => {
    setAvailabilitySlots(availabilitySlots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: string, value: string) => {
    const newSlots = [...availabilitySlots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setAvailabilitySlots(newSlots);
  };

  const openPasswordModal = () => {
    setPasswordInput("");
    setPasswordConfirm("");
    setPasswordError("");
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordInput("");
    setPasswordConfirm("");
    setPasswordError("");
  };

  const handleSavePassword = async () => {
    if (!selectedFaculty) return;

    setPasswordError("");

    if (!passwordInput) {
      setPasswordError("New password is required");
      return;
    }

    if (!passwordConfirm) {
      setPasswordError("Please confirm your password");
      return;
    }

    if (passwordInput.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    if (passwordInput.length > 128) {
      setPasswordError("Password is too long");
      return;
    }

    if (passwordInput !== passwordConfirm) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch(`/api/faculty/${selectedFaculty}/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });

      if (!response.ok) {
        const error = await response.json();
        setPasswordError(error.error || "Failed to update password");
        return;
      }

      closePasswordModal();
      alert("Password updated successfully!");
    } catch (err: any) {
      setPasswordError("Network error. Please try again.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 60; j += 15) {
        const hour = i.toString().padStart(2, '0');
        const minute = j.toString().padStart(2, '0');
        const time = `${hour}:${minute}`;
        const ampm = i >= 12 ? 'PM' : 'AM';
        const displayHour = i === 0 ? 12 : i > 12 ? i - 12 : i;
        const displayTime = `${displayHour}:${minute} ${ampm}`;
        options.push({ value: time, label: displayTime });
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  const openTelegramModal = async () => {
    if (!selectedFaculty) return;
    setTelegramChatId("");
    setTelegramUsername("");
    setTelegramError("");
    setTelegramSuccess("");
    setTelegramLoading(true);

    try {
      const response = await fetch(`/api/faculty/${selectedFaculty}/telegram/status`);
      const data = await response.json();
      setTelegramStatus(data);
    } catch (err: any) {
      setTelegramError("Failed to fetch Telegram status");
    } finally {
      setTelegramLoading(false);
    }

    setShowTelegramModal(true);
  };

  const handleTelegramRegister = async () => {
    if (!selectedFaculty) return;
    if (!telegramChatId.trim()) {
      setTelegramError("Please enter your Telegram Chat ID");
      return;
    }

    const chatId = parseInt(telegramChatId, 10);
    if (isNaN(chatId)) {
      setTelegramError("Chat ID must be a valid number");
      return;
    }

    setTelegramLoading(true);
    setTelegramError("");
    setTelegramSuccess("");

    try {
      const response = await fetch(`/api/faculty/${selectedFaculty}/telegram/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: chatId,
          telegram_username: telegramUsername || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setTelegramError(error.message || "Failed to register Telegram");
        return;
      }

      setTelegramSuccess("✅ Telegram registered successfully! You'll receive consultation reminders.");
      setTelegramChatId("");
      setTelegramUsername("");
      
      // Refresh status
      const statusResponse = await fetch(`/api/faculty/${selectedFaculty}/telegram/status`);
      const statusData = await statusResponse.json();
      setTelegramStatus(statusData);
    } catch (err: any) {
      setTelegramError("Network error. Please try again.");
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleTelegramDisconnect = async () => {
    if (!selectedFaculty || !window.confirm("Are you sure you want to disable Telegram notifications?")) return;

    setTelegramLoading(true);
    setTelegramError("");
    setTelegramSuccess("");

    try {
      const response = await fetch(`/api/faculty/${selectedFaculty}/telegram/disconnect`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        setTelegramError(error.message || "Failed to disconnect");
        return;
      }

      setTelegramSuccess("Telegram notifications disabled");
      
      // Refresh status
      const statusResponse = await fetch(`/api/faculty/${selectedFaculty}/telegram/status`);
      const statusData = await statusResponse.json();
      setTelegramStatus(statusData);
    } catch (err: any) {
      setTelegramError("Network error. Please try again.");
    } finally {
      setTelegramLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-neutral-100 flex flex-col">
      {/* Consultation Alert Modal */}
      {consultationAlert && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full space-y-6 animate-in scale-95">
            {/* Alert Header */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 bg-red-100 rounded-full flex items-center justify-center animate-pulse">
                <span className="text-2xl">ðŸ””</span>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-neutral-900">Consultation Starting!</h2>
                <p className="text-sm text-neutral-600 mt-1">Student arriving in {consultationAlert.minutes_until_start} minutes</p>
              </div>
            </div>

            {/* Alert Content */}
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl p-5 space-y-4">
              <div>
                <p className="text-sm font-medium text-indigo-900">Student Name</p>
                <p className="text-lg font-bold text-indigo-900 mt-1">{consultationAlert.student_name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-indigo-900">Time Slot</p>
                <p className="text-lg font-bold text-indigo-900 mt-1">{consultationAlert.time_slot}</p>
              </div>
            </div>

            {/* Dismiss Button */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setConsultationAlert(null);
                }}
                className="w-full px-4 py-3 bg-neutral-200 hover:bg-neutral-300 text-neutral-900 font-bold rounded-xl transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="shrink-0 bg-white shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" />
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
              Faculty Dashboard
            </h1>
          </div>
          {/* Mobile Sign Out */}
          <button
            onClick={logoutStaff}
            className="sm:hidden p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <button
            onClick={openAvailabilityModal}
            className="flex items-center gap-2 px-4 py-2 text-white font-medium rounded-xl transition-colors flex-1 sm:flex-none justify-center" style={{ background: 'var(--clay-accent-lavender)' }}
          >
            <Clock className="w-4 h-4" /> Availability
          </button>
          <button
            onClick={openTelegramModal}
            className="flex items-center gap-2 px-4 py-2 text-white font-medium rounded-xl transition-colors flex-1 sm:flex-none justify-center" style={{ background: '#0088cc' }}
          >
            <MessageCircle className="w-4 h-4" /> Telegram
          </button>
          <span className="text-neutral-600 font-medium hidden sm:block">
            {selectedFacultyData ? selectedFacultyData.name : "Loading..."}
          </span>
          <button
            onClick={logoutStaff}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-4 sm:p-6 xl:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Active Session Virtual Room */}
        {queue.find(q => q.status === "serving") && (() => {
          const activeSession = queue.find(q => q.status === "serving")!;
          return (
            <div className="lg:col-span-3 mb-2 bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-neutral-200 flex flex-col min-h-[360px] sm:min-h-[440px] xl:min-h-[520px]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-neutral-900 flex items-center gap-2">
                  <Video className="w-6 h-6 text-indigo-600" />
                  Active Consultation: {activeSession.student_name}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(activeSession.id, "completed", undefined, true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-medium rounded-xl transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" /> Complete
                  </button>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col items-center justify-center bg-neutral-50 rounded-xl border-2 border-dashed border-neutral-200 p-6 sm:p-8 text-center">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                  <Video className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-2">Consultation in Progress</h3>
                <p className="text-neutral-500 max-w-md mb-6">
                  Recording is active. Open Google Meet from here when you are ready, and use this link again anytime you need to return to the room.
                </p>
                <button
                  type="button"
                  onClick={() => focusSessionWindow(activeSession.meet_link || "")}
                  className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm inline-flex items-center justify-center gap-2"
                >
                  <Video className="w-5 h-5" /> Go To Google Meet
                </button>
              </div>
            </div>
          );
        })()}

        {/* Queue List */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6 min-h-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Live Queue</h2>
            <span className="w-fit px-4 py-2 bg-indigo-100 text-indigo-800 rounded-full font-medium">
              {queue.length} Students Waiting
            </span>
          </div>

          <div className="space-y-4">
            {queue.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center text-neutral-500 shadow-sm border border-neutral-200">
                <Clock className="w-16 h-16 mx-auto mb-4 text-neutral-300" />
                <p className="text-xl">No students in queue.</p>
              </div>
            ) : (
              queue.map((student, index) => (
                <div
                  key={student.id}
                  className={`bg-white rounded-2xl p-4 sm:p-6 shadow-sm border-l-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                    student.status === "serving"
                      ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/50"
                      : "border-neutral-300"
                  }`}
                >
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="text-3xl sm:text-4xl font-black text-neutral-200 w-10 sm:w-12 text-center shrink-0">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg sm:text-xl font-bold text-neutral-900 truncate">
                        {student.student_name}
                      </h3>
                      <p className="mt-1 text-sm sm:text-base text-neutral-600">
                        <span className="font-semibold">Concern:</span> {student.purpose || "No concern provided."}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs sm:text-sm text-neutral-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                          {getConsultationTimeLabel(student)}
                        </span>
                        <span className="px-2 py-0.5 bg-neutral-100 rounded text-[10px] sm:text-xs uppercase tracking-wider">
                          {student.source}
                        </span>
                        {student.status === "serving" && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Currently Serving
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                    {(student.status === "waiting") && (
                      <div className="flex flex-col gap-2 items-stretch sm:items-end w-full sm:w-auto">
                        {student.meet_link ? (
                          <div className="flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-xl text-sm w-full sm:w-72 border border-indigo-100">
                            <Video className="w-4 h-4 text-indigo-500 shrink-0" />
                            <a 
                              href={student.meet_link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-indigo-700 hover:underline truncate flex-1 font-medium"
                            >
                              Virtual Room Ready
                            </a>
                          </div>
                        ) : (
                          <div className={`px-3 py-2 rounded-xl text-sm w-full sm:w-72 border ${
                            googleMeetMode === "none"
                              ? "border-amber-100 bg-amber-50 text-amber-800"
                              : "border-blue-100 bg-blue-50 text-blue-800"
                          }`}>
                            {googleMeetMode === "none"
                              ? "Paste a manual Google Meet link before starting, or configure automatic Meet link generation in Integrations."
                              : "Google Meet will be prepared after you grant recording permissions, then the consultation will start once Meet audio sharing succeeds."}
                          </div>
                        )}
                        <div className="w-full sm:w-72 space-y-2">
                          <button
                            type="button"
                            onClick={() =>
                              setManualMeetFallbackOpen((current) => ({
                                ...current,
                                [student.id]: !current[student.id],
                              }))
                            }
                            className="w-full px-4 py-2 border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-sm font-medium rounded-xl transition-colors"
                          >
                            {manualMeetFallbackOpen[student.id] ? "Hide Manual Meet Fallback" : "Use Manual Meet Link Instead"}
                          </button>
                          {manualMeetFallbackOpen[student.id] && (
                            <>
                              <input
                                type="text"
                                placeholder="Paste manual Google Meet link"
                                value={meetLinksByConsultation[student.id] ?? ""}
                                onChange={(e) =>
                                  setMeetLinksByConsultation((current) => ({
                                    ...current,
                                    [student.id]: e.target.value,
                                  }))
                                }
                                className="w-full px-4 py-3 sm:py-2 border border-neutral-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                              <p className="text-xs text-neutral-500 sm:text-right">
                                Emergency fallback if Google Meet auto-linking is unavailable.
                              </p>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 w-full">
                          <button
                            onClick={() => handleStartSession(student.id, student.meet_link)}
                            disabled={startingSessionId !== null}
                            className={`flex items-center gap-2 px-4 py-3 sm:py-2 text-white font-medium rounded-xl transition-colors w-full justify-center ${
                              startingSessionId !== null
                                ? "bg-emerald-400 cursor-not-allowed"
                                : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                          >
                            <Video className="w-4 h-4" /> {startingSessionId === student.id ? "Granting Permissions..." : "Start Consultation"}
                          </button>
                          <button
                            onClick={() => updateStatus(student.id, "completed", undefined, true)}
                            className="flex items-center justify-center p-3 sm:p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl transition-colors shrink-0"
                            title="Mark as Complete"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {student.status === "serving" && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => updateStatus(student.id, "completed", undefined, true)}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors shadow-sm"
                        >
                          <CheckCircle className="w-4 h-4" /> Complete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar / Stats */}
        <div className="space-y-6 xl:sticky xl:top-6 self-start">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-4">Session Controls</h3>
            {selectedFacultyData ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl" style={{ background: 'var(--clay-bg-secondary)' }}>
                  <p className="text-sm mb-1" style={{ color: 'var(--clay-text-secondary)' }}>Current Status</p>
                  <p className="text-lg font-medium flex items-center gap-2" style={{ color: selectedFacultyData.status === 'available' ? 'var(--clay-accent-sage)' : selectedFacultyData.status === 'busy' ? 'var(--clay-accent-warm)' : 'var(--clay-text-secondary)' }}>
                    <span className="w-3 h-3 rounded-full" style={{ 
                      background: selectedFacultyData.status === 'available' ? 'var(--clay-accent-sage)' : selectedFacultyData.status === 'busy' ? 'var(--clay-accent-warm)' : 'var(--clay-text-light)',
                      animation: selectedFacultyData.status === 'available' ? 'pulse 2s infinite' : 'none'
                    }} />
                    {selectedFacultyData.status === 'available' ? 'Accepting Consultations' : 
                     selectedFacultyData.status === 'busy' ? 'Busy' : 'Offline'}
                  </p>
                </div>

                <button
                  onClick={openPasswordModal}
                  className="w-full py-3 px-4 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2" style={{ background: 'var(--clay-accent-warm)' }}
                >
                  <KeyRound className="w-4 h-4" /> Change Password
                </button>

                <div className="pt-4 border-t border-neutral-200">
                  <p className="text-sm font-bold text-neutral-900 mb-3">Integrations</p>
                  <div className="space-y-3 mb-4">
                    <div
                      className={`p-3 rounded-xl border flex items-center gap-3 ${
                        googleMeetConnected
                          ? "bg-emerald-50 border-emerald-100"
                          : "bg-neutral-50 border-neutral-200"
                      }`}
                    >
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm shrink-0">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="#0066DA"/>
                          <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="#00AC47"/>
                          <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="#EA4335"/>
                          <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="#FFBA00"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          googleMeetConnected ? "text-emerald-800" : "text-neutral-700"
                        }`}>
                          {googleMeetConnected
                            ? "Google Meet Auto-Links Active"
                            : "Google Meet Not Connected"}
                        </p>
                        <p className={`text-xs truncate ${
                          googleMeetConnected ? "text-emerald-600" : "text-neutral-500"
                        }`}>
                          {googleMeetConnected
                            ? "Meet links are auto-generated by the admin Google account."
                            : "Ask the admin to connect their Google account from the Admin Dashboard."}
                        </p>
                      </div>
                    </div>
                  </div>
                  {recordingStorageReady ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm shrink-0 text-emerald-700 font-bold text-xs">
                        SB
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-emerald-800 truncate">Supabase Storage Ready</p>
                        <p className="text-xs text-emerald-600 truncate">Audio uploads automatically after each session</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm shrink-0 opacity-50 text-neutral-500 font-bold text-xs">
                        SB
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-600 truncate">Supabase Storage Unavailable</p>
                        <p className="text-xs text-neutral-500 truncate">Recording uploads will retry when storage is reachable</p>
                      </div>
                    </div>
                  )}
                  {uploading && (
                    <p className="text-xs text-indigo-600 mt-2 text-center animate-pulse">Uploading audio to Supabase Storage...</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-neutral-500">Select a faculty member.</p>
            )}
          </div>
        </div>
      </main>

      {showAvailabilityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white rounded-t-[2rem] sm:rounded-3xl p-5 sm:p-8 max-w-2xl w-full max-h-[90dvh] shadow-2xl flex flex-col">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full shrink-0">
                <Clock className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Consultation Hours</h2>
                <p className="text-sm text-neutral-500 mt-1">Set your available time slots for students</p>
              </div>
              <button onClick={() => setShowAvailabilityModal(false)} className="text-neutral-400 hover:text-neutral-600 p-1">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 sm:pr-2 mb-6">
              {availabilitySlots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 bg-neutral-50 rounded-2xl border-2 border-dashed border-neutral-200">
                  <Clock className="w-12 h-12 text-neutral-300 mb-3" />
                  <p className="text-neutral-500 font-medium">No time slots set yet</p>
                  <p className="text-sm text-neutral-400 mt-1">Add your first available hours below</p>
                </div>
              ) : (
                availabilitySlots.map((slot, index) => (
                  <div key={index} className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 hover:shadow-md transition-shadow">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-600 mb-2">Day</label>
                        <select
                          value={slot.day}
                          onChange={(e) => updateSlot(index, "day", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                        >
                          {WEEKDAY_OPTIONS.map(day => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-neutral-600 mb-2">Start Time</label>
                        <select
                          value={slot.start}
                          onChange={(e) => updateSlot(index, "start", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                        >
                          {timeOptions.map((time) => (
                            <option key={time.value} value={time.value}>{time.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-neutral-600 mb-2">End Time</label>
                        <select
                          value={slot.end}
                          onChange={(e) => updateSlot(index, "end", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                        >
                          {timeOptions.map((time) => (
                            <option key={time.value} value={time.value}>{time.label}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => removeSlot(index)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors font-medium text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pt-6 border-t border-neutral-100">
              <button
                onClick={addSlot}
                className="px-6 py-3 bg-indigo-50 text-indigo-700 font-medium rounded-xl hover:bg-indigo-100 transition-colors w-full sm:w-auto"
              >
                + Add Time Slot
              </button>
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={() => setShowAvailabilityModal(false)}
                  className="px-6 py-3 text-neutral-600 font-medium hover:bg-neutral-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAvailability}
                  className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Change Password</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError("");
                    }}
                    placeholder="At least 8 characters"
                    className="w-full px-4 py-3 pr-10 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showPasswordConfirm ? "text" : "password"}
                    value={passwordConfirm}
                    onChange={(e) => {
                      setPasswordConfirm(e.target.value);
                      setPasswordError("");
                    }}
                    placeholder="Re-enter your new password"
                    className="w-full px-4 py-3 pr-10 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {passwordError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 font-medium">{passwordError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={closePasswordModal}
                className="flex-1 px-6 py-3 text-neutral-600 font-medium hover:bg-neutral-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePassword}
                disabled={passwordSaving}
                className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-200"
              >
                {passwordSaving ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTelegramModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4 text-blue-600">
                <div className="p-3 bg-blue-100 rounded-full">
                  <MessageCircle className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-neutral-900">Telegram Notifications</h2>
              </div>
            </div>

            {/* Active Status View */}
            {telegramStatus?.registered && telegramStatus?.is_active ? (
              <div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                  <p className="text-blue-800 text-sm font-medium">
                    ✅ <strong>Telegram is Active</strong>
                    <br />
                    {telegramStatus.telegram_username && (
                      <>Username: @{telegramStatus.telegram_username}<br /></>
                    )}
                    Registered: {new Date(telegramStatus.registered_at || "").toLocaleDateString()}
                  </p>
                </div>
                {telegramSuccess && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-green-700 text-sm font-medium">
                    {telegramSuccess}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowTelegramModal(false)}
                    className="flex-1 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-xl transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleTelegramDisconnect}
                    disabled={telegramLoading}
                    className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
                  >
                    {telegramLoading ? "Processing..." : "Disable"}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Instructions */}
                <div className="mb-5 text-sm text-neutral-600 bg-neutral-50 rounded-xl p-4">
                  <p className="font-semibold mb-3 text-neutral-900">📱 How to get your Telegram Chat ID:</p>
                  <ol className="list-decimal ml-4 space-y-2 text-neutral-700">
                    <li>Search for <strong>@kiosk_queue_bot</strong> on Telegram</li>
                    <li>Click "Start" or send <strong>/start</strong></li>
                    <li>Copy your <strong>Chat ID</strong> from the bot message</li>
                    <li>Paste it below and click Register</li>
                  </ol>
                </div>

                {/* Error Message */}
                {telegramError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-red-700 text-sm flex gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{telegramError}</span>
                  </div>
                )}

                {/* Success Message */}
                {telegramSuccess && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-green-700 text-sm font-medium">
                    {telegramSuccess}
                  </div>
                )}

                {/* Input Fields */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Telegram Chat ID *</label>
                    <input
                      type="text"
                      placeholder="Enter your Chat ID (e.g., 123456789)"
                      value={telegramChatId}
                      onChange={(e) => {
                        setTelegramChatId(e.target.value);
                        setTelegramError("");
                      }}
                      disabled={telegramLoading}
                      className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Username (Optional)</label>
                    <input
                      type="text"
                      placeholder="Your Telegram username (without @)"
                      value={telegramUsername}
                      onChange={(e) => setTelegramUsername(e.target.value)}
                      disabled={telegramLoading}
                      className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowTelegramModal(false);
                      setTelegramError("");
                      setTelegramSuccess("");
                      setTelegramChatId("");
                      setTelegramUsername("");
                    }}
                    disabled={telegramLoading}
                    className="flex-1 px-6 py-3 text-neutral-700 font-medium hover:bg-neutral-100 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Exit
                  </button>
                  <button
                    onClick={handleTelegramRegister}
                    disabled={telegramLoading || !telegramChatId.trim()}
                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-200"
                  >
                    {telegramLoading ? "Registering..." : "Register"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showAudioPermissionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-neutral-900">Enable Audio Recording</h2>
            </div>
            
            <p className="text-neutral-600 leading-relaxed">
              Audio recording is mandatory for all consultations. Please enable microphone access to proceed with this consultation.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">
                <strong>Your browser will ask for microphone permission.</strong> Click "Allow" when prompted to continue with the consultation.
              </p>
            </div>

            {audioPermissionError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-700 font-medium">{audioPermissionError}</p>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={handleAudioPermissionDeny}
                className="px-6 py-3 text-neutral-600 font-medium hover:bg-neutral-100 rounded-xl transition-colors order-2 sm:order-1"
              >
                Ask Again
              </button>
              <button
                onClick={handleAudioPermissionAllow}
                className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 order-1 sm:order-2 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8 16.5a1 1 0 11-2 0 1 1 0 012 0zM15 7a2 2 0 11-4 0 2 2 0 014 0z" />
                  <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Allow Microphone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

