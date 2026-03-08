import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Users, CheckCircle, Video, XCircle, ChevronRight, Clock, ArrowLeft, LogOut } from "lucide-react";
import { clearStaffSession, getStaffSessionUserId } from "../staffSession";

interface Consultation {
  id: number;
  student_id: string;
  student_name: string;
  student_number?: string;
  status: "waiting" | "next" | "serving";
  created_at: string;
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
    return scheduledSlot;
  }

  const createdAt = new Date(consultation.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return "Walk-in queue";
  }

  return `Queued ${createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
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
  const sessionWindowRef = useRef<Window | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mixedAudioContextRef = useRef<AudioContext | null>(null);
  const discardRecordingOnStopRef = useRef(false);
  const recordingContextRef = useRef<RecordingContext | null>(null);

  const logoutStaff = () => {
    clearStaffSession();
    navigate("/staff/login");
  };

  useEffect(() => {
    const staffUserId = getStaffSessionUserId();
    if (!staffUserId) {
      navigate("/staff/login");
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
        const data = JSON.parse(event.data);
        if (data.type === "queue_updated") {
          fetchQueue();
        }
        if (data.type === "faculty_updated") {
          fetchFaculty();
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
      } else {
        console.error("Failed to fetch faculty: Not an array", data);
      }
    } catch (err) {
      console.error("Failed to fetch faculty", err);
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
      } else {
        console.error("Failed to fetch queue: Not an array", data);
      }
    } catch (err) {
      console.error("Failed to fetch queue", err);
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
      console.error("Failed to fetch faculty Google Meet status", err);
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
      console.error("Failed to check recording storage status", err);
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
      console.error("Faculty Google connect error", err);
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
      console.error("Faculty Google disconnect error", err);
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
      console.warn("Failed to render Meet placeholder tab", err);
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
      console.error("Failed to upload recording", err);
      const message = err instanceof Error ? err.message : "Failed to save to Supabase Storage.";
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  const startAudioRecording = async (recordingContext: RecordingContext | null) => {
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

      displayStream?.getTracks().forEach((track) => {
        track.onended = stopRecorderIfActive;
      });
    } catch (err) {
      recordingContextRef.current = null;
      cleanupRecordingResources();
      console.error("Error starting audio recording:", err);
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

  const updateStatus = async (id: number, status: string, link?: string, autoCallNext: boolean = false) => {
    try {
      const res = await fetch(`/api/queue/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, meet_link: link }),
      });

      const payload = await res.json();
      
      if (!res.ok) {
        console.error("Failed to update status:", payload);
        throw new Error(payload.error || "Failed to update consultation status.");
      }
      
      if (status === "completed" || status === "cancelled") {
        stopAudioRecording();
        closeSessionWindow();
      }
      
      if (autoCallNext && (status === "completed" || status === "cancelled")) {
        const alreadyNext = queue.find(s => s.status === "next" && s.id !== id);
        if (!alreadyNext) {
          const nextStudent = queue.find(s => s.status === "waiting" && s.id !== id);
          if (nextStudent) {
            await fetch(`/api/queue/${nextStudent.id}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "next" }),
            });
          }
        }
      }
      
      fetchQueue();
      return payload as { success: boolean; meet_link?: string | null };
    } catch (err) {
      console.error("Failed to update status", err);
      throw err instanceof Error ? err : new Error("Failed to update consultation status.");
    }
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
      alert("Connect your Google account in Integrations or paste a manual Google Meet link before starting the consultation.");
      return;
    }

    setStartingSessionId(id);
    prepareSessionWindow();

    try {
      await startAudioRecording(recordingContext);

      const data = await updateStatus(id, "serving", draftLink ? finalLink : undefined);
      const resolvedLink = data?.meet_link ? normalizeMeetLink(data.meet_link) : finalLink;

      if (!resolvedLink) {
        closeSessionWindow();
        throw new Error("Google Meet link was not generated. Add a manual Google Meet link and try again.");
      }

      setMeetLinksByConsultation((current) => ({
        ...current,
        [id]: resolvedLink,
      }));

      openPreparedSessionWindow(resolvedLink);
      fetchQueue();
    } catch (err) {
      discardRecordingOnStopRef.current = true;
      stopAudioRecording();
      closeSessionWindow();
      setManualMeetFallbackOpen((current) => ({
        ...current,
        [id]: true,
      }));

      const baseMessage = err instanceof Error ? err.message : "Failed to start consultation.";
      const message = draftLink
        ? baseMessage
        : `${baseMessage}\nConnect your Google account in Integrations or paste a manual Google Meet link and try again.`;
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
      console.error("Failed to update status", err);
    }
  };

  const openAvailabilityModal = () => {
    if (!selectedFacultyData) return;
    try {
      const parsed = JSON.parse(selectedFacultyData.full_name || "[]");
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
    try {
      await fetch(`/api/faculty/${selectedFaculty}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability: availabilitySlots }),
      });
      setShowAvailabilityModal(false);
      fetchFaculty();
    } catch (err) {
      console.error("Failed to save availability", err);
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

  return (
    <div className="min-h-[100dvh] bg-neutral-100 flex flex-col">
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
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-xl transition-colors flex-1 sm:flex-none justify-center"
          >
            <Clock className="w-4 h-4" /> Availability
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
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Live Queue (FIFO)</h2>
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
                      : student.status === "next"
                      ? "border-amber-500 ring-2 ring-amber-500/20"
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
                    {(student.status === "waiting" || student.status === "next") && (
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
                              ? "Connect your Google account in Integrations or paste a manual Google Meet link before starting."
                              : "Google Meet link will be generated automatically when you start the consultation."}
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
                <div className="p-4 bg-neutral-50 rounded-xl">
                  <p className="text-sm text-neutral-500 mb-1">Current Status</p>
                  <p className={`text-lg font-medium flex items-center gap-2 ${
                    selectedFacultyData.status === 'available' ? 'text-emerald-600' : 
                    selectedFacultyData.status === 'busy' ? 'text-amber-600' : 'text-neutral-600'
                  }`}>
                    <span className={`w-3 h-3 rounded-full ${
                      selectedFacultyData.status === 'available' ? 'bg-emerald-500 animate-pulse' : 
                      selectedFacultyData.status === 'busy' ? 'bg-amber-500' : 'bg-neutral-500'
                    }`} />
                    {selectedFacultyData.status === 'available' ? 'Accepting Consultations' : 
                     selectedFacultyData.status === 'busy' ? 'Busy' : 'Offline'}
                  </p>
                </div>
                <button 
                  onClick={toggleFacultyStatus}
                  className="w-full py-3 px-4 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-medium rounded-xl transition-colors"
                >
                  {selectedFacultyData.status === 'available' ? 'Go Offline' : 'Go Available'}
                </button>

                <div className="pt-4 border-t border-neutral-200">
                  <p className="text-sm font-bold text-neutral-900 mb-3">Integrations</p>
                  <div className="space-y-3 mb-4">
                    <div
                      className={`p-3 rounded-xl border flex items-center gap-3 ${
                        googleMeetConnected
                          ? googleMeetMode === "oauth"
                            ? "bg-blue-50 border-blue-100"
                            : "bg-emerald-50 border-emerald-100"
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
                          googleMeetConnected
                            ? googleMeetMode === "oauth"
                              ? "text-blue-800"
                              : "text-emerald-800"
                            : "text-neutral-700"
                        }`}>
                          {googleMeetMode === "oauth"
                            ? "Google Meet Auto-Link Ready"
                            : googleMeetMode === "service_account"
                              ? "Google Meet Auto-Link Managed by Server"
                              : "Faculty Google Not Connected"}
                        </p>
                        <p className={`text-xs truncate ${
                          googleMeetConnected
                            ? googleMeetMode === "oauth"
                              ? "text-blue-600"
                              : "text-emerald-600"
                            : "text-neutral-500"
                        }`}>
                          {googleMeetMode === "oauth"
                            ? googleMeetEmail
                              ? `Connected as ${googleMeetEmail}`
                              : "Meet links will be created from your Google account."
                            : googleMeetMode === "service_account"
                              ? googleMeetEmail
                                ? `Server-managed Meet creation is active via ${googleMeetEmail}.`
                                : "Server-managed Meet creation is active."
                              : "Connect your Google account so Meet links are created under your own Google profile."}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleConnectGoogleMeet}
                        disabled={googleMeetLoading}
                        className="px-4 py-2 bg-white hover:bg-neutral-50 disabled:bg-neutral-100 disabled:text-neutral-400 text-neutral-700 text-sm font-medium rounded-xl border border-neutral-200 transition-colors"
                      >
                        {googleMeetLoading
                          ? "Opening Google..."
                          : googleMeetMode === "oauth"
                            ? "Reconnect Google"
                            : "Connect Google"}
                      </button>
                      {googleMeetMode === "oauth" && (
                        <button
                          type="button"
                          onClick={handleDisconnectGoogleMeet}
                          disabled={googleMeetLoading}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 disabled:bg-red-50/60 disabled:text-red-300 text-red-700 text-sm font-medium rounded-xl border border-red-100 transition-colors"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>

                    {googleMeetMode === "oauth" && googleMeetConnectedAt ? (
                      <p className="text-xs text-neutral-500">
                        Connected on {new Date(googleMeetConnectedAt).toLocaleString()}
                      </p>
                    ) : null}
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
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Consultation Hours</h2>
              <button onClick={() => setShowAvailabilityModal(false)} className="text-neutral-400 hover:text-neutral-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 sm:pr-2">
              {availabilitySlots.length === 0 ? (
                <p className="text-neutral-500 text-center py-8">No time slots set. Add your available hours below.</p>
              ) : (
                availabilitySlots.map((slot, index) => (
                  <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-neutral-50 p-4 rounded-xl">
                    <select
                      value={slot.day}
                      onChange={(e) => updateSlot(index, "day", e.target.value)}
                      className="flex-1 px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                    <select
                      value={slot.start}
                      onChange={(e) => updateSlot(index, "start", e.target.value)}
                      className="px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {timeOptions.map((time) => (
                        <option key={time.value} value={time.value}>{time.label}</option>
                      ))}
                    </select>
                    <span className="text-neutral-400 font-medium">to</span>
                    <select
                      value={slot.end}
                      onChange={(e) => updateSlot(index, "end", e.target.value)}
                      className="px-4 py-2 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {timeOptions.map((time) => (
                        <option key={time.value} value={time.value}>{time.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeSlot(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center pt-6 border-t border-neutral-100">
              <button
                onClick={addSlot}
                className="px-6 py-3 bg-indigo-50 text-indigo-700 font-medium rounded-xl hover:bg-indigo-100 transition-colors"
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
    </div>
  );
}
