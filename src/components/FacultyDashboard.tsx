import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Users, CheckCircle, Video, XCircle, ChevronRight, Clock, ArrowLeft, LogOut } from "lucide-react";

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

export default function FacultyDashboard() {
  const { id: selectedFaculty } = useParams();
  const navigate = useNavigate();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [queue, setQueue] = useState<Consultation[]>([]);
  const [meetLinksByConsultation, setMeetLinksByConsultation] = useState<Record<number, string>>({});
  const [manualMeetFallbackOpen, setManualMeetFallbackOpen] = useState<Record<number, boolean>>({});
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState<{day: string, start: string, end: string}[]>([]);

  useEffect(() => {
    if (localStorage.getItem("user_role") !== "staff") {
      navigate("/staff/login");
      return;
    }
    fetchFaculty();
  }, [navigate]);

  useEffect(() => {
    if (selectedFaculty) {
      fetchQueue();
      // Setup WebSocket for real-time updates
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "queue_updated") {
          fetchQueue();
        }
        if (data.type === "faculty_updated") {
          fetchFaculty();
        }
      };

      return () => ws.close();
    }
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
  const [driveConnected, setDriveConnected] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const checkDriveStatus = async () => {
      try {
        const res = await fetch(`/api/drive/status`);
        const data = await res.json();
        setDriveConnected(data.connected);
      } catch (err) {
        console.error("Failed to check drive status", err);
      }
    };
    checkDriveStatus();
  }, []);

  const uploadToDrive = async (blob: Blob) => {
    if (!driveConnected) {
      alert("Google Drive is not connected. Recording was not uploaded.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', blob, `consultation-audio-${new Date().toISOString().replace(/:/g, '-')}.webm`);
    formData.append('faculty_id', selectedFaculty!.toString());

    try {
      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.hint ? `${data.error}\n${data.hint}` : data.error || "Upload failed");
      }
      if (data.warning) {
        alert(data.warning);
      }
    } catch (err) {
      console.error("Failed to upload to drive", err);
      const message = err instanceof Error ? err.message : "Failed to save to Google Drive.";
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setMediaRecorder(null);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        await uploadToDrive(blob);
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      
      // Handle user stopping microphone via browser UI
      stream.getAudioTracks()[0].onended = () => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      };
    } catch (err) {
      console.error("Error starting audio recording:", err);
      alert("Could not start audio recording. Please ensure you have granted microphone permissions.");
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
    const draftLink = meetLinksByConsultation[id]?.trim() || "";
    let finalLink = draftLink || existingLink || "";

    if (draftLink) {
      finalLink = normalizeMeetLink(draftLink);

      if (isMeetLinkAlreadyAssigned(id, finalLink)) {
        alert("This Google Meet link is already assigned to another student. Please use a different link.");
        return;
      }
    } else if (existingLink) {
      finalLink = normalizeMeetLink(existingLink);
    }

    const sessionWindow = window.open("", "_blank");

    try {
      const data = await updateStatus(id, "serving", draftLink ? finalLink : undefined);
      const resolvedLink = data?.meet_link ? normalizeMeetLink(data.meet_link) : finalLink;

      if (!resolvedLink) {
        sessionWindow?.close();
        throw new Error("Google Meet link was not generated. Add a manual Google Meet link and try again.");
      }

      setMeetLinksByConsultation((current) => ({
        ...current,
        [id]: resolvedLink,
      }));

      if (sessionWindow) {
        sessionWindow.location.href = resolvedLink;
      } else {
        window.open(resolvedLink, "_blank");
      }

      await startAudioRecording();
      fetchQueue();
    } catch (err) {
      sessionWindow?.close();
      setManualMeetFallbackOpen((current) => ({
        ...current,
        [id]: true,
      }));

      const baseMessage = err instanceof Error ? err.message : "Failed to start consultation.";
      const message = draftLink
        ? baseMessage
        : `${baseMessage}\nIf Google is not connected, paste a manual Google Meet link and try again.`;
      alert(message);
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
            onClick={() => {
              localStorage.removeItem("user_role");
              localStorage.removeItem("user_id");
              navigate("/staff/login");
            }}
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
            onClick={() => {
              localStorage.removeItem("user_role");
              localStorage.removeItem("user_id");
              navigate("/staff/login");
            }}
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
                  The consultation is happening in a separate Google Meet window. The audio is currently being recorded.
                </p>
                <a 
                  href={activeSession.meet_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm inline-flex items-center justify-center gap-2"
                >
                  <Video className="w-5 h-5" /> Re-open Google Meet
                </a>
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
                          {new Date(student.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
                          <div className="px-3 py-2 rounded-xl text-sm w-full sm:w-72 border border-blue-100 bg-blue-50 text-blue-800">
                            Google Meet link will be generated automatically when you start the consultation.
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
                            className="flex items-center gap-2 px-4 py-3 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors w-full justify-center"
                          >
                            <Video className="w-4 h-4" /> Start Consultation
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
                  {driveConnected ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="#0066DA"/>
                          <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="#00AC47"/>
                          <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="#EA4335"/>
                          <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="#FFBA00"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-emerald-800 truncate">Admin Drive Connected</p>
                        <p className="text-xs text-emerald-600 truncate">Audio saves automatically</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm shrink-0 opacity-50">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="#0066DA"/>
                          <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="#00AC47"/>
                          <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="#EA4335"/>
                          <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="#FFBA00"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-600 truncate">Drive Not Connected</p>
                        <p className="text-xs text-neutral-500 truncate">Admin needs to connect</p>
                      </div>
                    </div>
                  )}
                  {uploading && (
                    <p className="text-xs text-indigo-600 mt-2 text-center animate-pulse">Uploading audio to Drive...</p>
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
