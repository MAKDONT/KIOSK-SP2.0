import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Clock, Video, CheckCircle, AlertCircle, RefreshCw, XCircle } from "lucide-react";

interface Consultation {
  id: number;
  status: "waiting" | "serving" | "completed" | "cancelled";
  created_at: string;
  faculty_id: string;
  faculty_name: string;
  meet_link?: string;
}

export default function StudentTracking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [id]);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/queue/${id}`);
      if (!res.ok) {
        throw new Error("Consultation not found");
      }
      const data = await res.json();
      setConsultation(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancel = async () => {
    if (!id || !consultation) return;
    
    const confirmed = window.confirm("Are you sure you want to cancel your consultation? This action cannot be undone.");
    if (!confirmed) return;

    setCancelling(true);
    setCancelError("");
    
    try {
      const res = await fetch(`/api/queue/${id}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel consultation");
      }

      setConsultation({ ...consultation, status: "cancelled" });
    } catch (err: any) {
      setCancelError(err.message || "Failed to cancel consultation");
    } finally {
      setCancelling(false);
    }
  };

  const normalizeMeetingLink = (value?: string | null) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-neutral-100 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-neutral-900">Error</h1>
          <p className="text-neutral-500">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="w-full py-3 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-medium rounded-xl transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="min-h-[100dvh] bg-neutral-100 flex items-center justify-center p-4">
        <div className="animate-spin text-emerald-600">
          <RefreshCw className="w-12 h-12" />
        </div>
      </div>
    );
  }

  const activeMeetLink = normalizeMeetingLink(consultation.meet_link);
  const isEmbeddedRoom = activeMeetLink.includes("meet.jit.si");

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-indigo-50 via-white to-emerald-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="bg-white/80 backdrop-blur-xl border border-white/50 rounded-[2rem] shadow-2xl p-6 sm:p-10 max-w-lg w-full space-y-6 sm:space-y-8 text-center relative overflow-hidden">
        {/* Decorative background blur */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none" />

        <div className="space-y-2 relative z-10">
          <h1 className="text-3xl sm:text-4xl font-black text-neutral-900 tracking-tight">
            Queue Status
          </h1>
          <p className="text-neutral-500 font-medium text-lg">
            with <span className="text-indigo-600 font-semibold">{consultation.faculty_name}</span>
          </p>
        </div>

        {/* Status Indicator */}
        <div className="py-8 flex flex-col items-center justify-center space-y-6 relative z-10">
          {consultation.status === "waiting" && (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-neutral-200 rounded-full blur-xl opacity-50 animate-pulse" />
                <div className="bg-neutral-100 p-6 rounded-full relative">
                  <Clock className="w-16 h-16 text-neutral-500" />
                </div>
              </div>
              <h2 className="text-3xl font-black text-neutral-800 mb-2">Waiting</h2>
              <p className="text-neutral-500 text-center max-w-[250px]">
                You are currently in the queue. Please wait for your turn.
              </p>
              {cancelError && (
                <div className="mt-4 text-red-600 text-sm font-medium bg-red-50 px-4 py-2 rounded-lg">
                  {cancelError}
                </div>
              )}
            </div>
          )}

          {consultation.status === "serving" && (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700 w-full">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-emerald-400 rounded-full blur-xl opacity-40 animate-pulse" />
                <div className="bg-emerald-100 p-6 rounded-full relative">
                  <Video className="w-16 h-16 text-emerald-600" />
                </div>
              </div>
              <h2 className="text-3xl font-black text-emerald-600 mb-2">Session Ready</h2>
              <p className="text-emerald-700/80 text-center mb-8 max-w-[250px]">
                Your consultation is starting.
              </p>
              {activeMeetLink ? (
                isEmbeddedRoom ? (
                  <div className="w-full min-h-[280px] sm:min-h-[360px] lg:min-h-[420px] rounded-2xl overflow-hidden shadow-lg border border-emerald-200">
                    <iframe 
                      src={`${activeMeetLink}#config.prejoinPageEnabled=false`} 
                      allow="camera; microphone; display-capture; fullscreen; autoplay"
                      className="w-full h-full border-0 bg-neutral-900"
                    />
                  </div>
                ) : (
                  <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6 text-left space-y-4">
                    <p className="text-sm sm:text-base text-emerald-900">
                      Your faculty is using an external meeting room for this consultation.
                    </p>
                    <a
                      href={activeMeetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-2xl shadow-[0_8px_30px_rgb(5,150,105,0.25)] transition-colors"
                    >
                      <Video className="w-6 h-6" /> Open Google Meet
                    </a>
                    <p className="break-all text-sm text-emerald-700">{activeMeetLink}</p>
                  </div>
                )
              ) : (
                <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-800">
                  Your meeting link has not been added yet. Please wait for the faculty to start the consultation.
                </div>
              )}
            </div>
          )}

          {consultation.status === "completed" && (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-indigo-400 rounded-full blur-xl opacity-30" />
                <div className="bg-indigo-50 p-6 rounded-full relative">
                  <CheckCircle className="w-16 h-16 text-indigo-600" />
                </div>
              </div>
              <h2 className="text-3xl font-black text-indigo-900 mb-2">Completed</h2>
              <p className="text-indigo-700/70 text-center max-w-[250px]">
                Your consultation has finished. Thank you!
              </p>
            </div>
          )}

          {consultation.status === "cancelled" && (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-red-400 rounded-full blur-xl opacity-30" />
                <div className="bg-red-50 p-6 rounded-full relative">
                  <XCircle className="w-16 h-16 text-red-600" />
                </div>
              </div>
              <h2 className="text-3xl font-black text-red-900 mb-2">Cancelled</h2>
              <p className="text-red-700/70 text-center max-w-[250px]">
                You've cancelled your consultation successfully. 
              </p>
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-neutral-200/50 relative z-10 space-y-3">
          {consultation.status === "waiting" && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-400 text-white font-bold rounded-2xl transition-colors"
            >
              {cancelling ? "Cancelling..." : "Cancel Consultation"}
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            className="w-full py-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-2xl transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
}
