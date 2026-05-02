import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, LogOut, Plus, Building, UserPlus, ArrowLeft, Trash2, KeyRound, AlertTriangle, Users, FolderOpen, RefreshCw, Search, FileAudio, ExternalLink, Download, Mail, Eye, EyeOff, FileText } from "lucide-react";
import { safeGetItem, safeClearStorage } from "../utils/storageUtils";
import { formatDisplayDateTimePHT } from "../utils/timezoneUtils";
import AuditLogs from "./AuditLogs";

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
  consultation_date_display?: string | null;
}

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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<any[]>([]);
  const [colleges, setColleges] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "audit-logs">("dashboard");
  
  // College form
  const [collegeName, setCollegeName] = useState("");
  const [collegeCode, setCollegeCode] = useState("");
  const [addingCollege, setAddingCollege] = useState(false);
  const [collegeError, setCollegeError] = useState("");
  const [createCollegePasswordModal, setCreateCollegePasswordModal] = useState(false);
  const [createCollegePassword, setCreateCollegePassword] = useState("");
  const [createCollegePasswordError, setCreateCollegePasswordError] = useState("");
  
  // Department form
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [deptError, setDeptError] = useState("");
  const [createDeptPasswordModal, setCreateDeptPasswordModal] = useState(false);
  const [createDeptPassword, setCreateDeptPassword] = useState("");
  const [createDeptPasswordError, setCreateDeptPasswordError] = useState("");
  
  // Faculty form
  const [facName, setFacName] = useState("");
  const [facCollege, setFacCollege] = useState("");
  const [facDept, setFacDept] = useState("");
  const [facEmail, setFacEmail] = useState("");
  const [facPassword, setFacPassword] = useState("");
  const [addingFac, setAddingFac] = useState(false);
  const [facError, setFacError] = useState("");
  const [facFormSubmitted, setFacFormSubmitted] = useState(false);
  const [createFacPasswordModal, setCreateFacPasswordModal] = useState(false);
  const [createFacPassword, setCreateFacPassword] = useState("");
  const [createFacPasswordError, setCreateFacPasswordError] = useState("");

  // Confirmation Modals
  const [deleteCollegeModal, setDeleteCollegeModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editCollegeModal, setEditCollegeModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editCollegeNameInput, setEditCollegeNameInput] = useState("");
  const [editCollegeCodeInput, setEditCollegeCodeInput] = useState("");
  const [editCollegeSaving, setEditCollegeSaving] = useState(false);
  const [editCollegeError, setEditCollegeError] = useState("");
  const [deleteCollegePassword, setDeleteCollegePassword] = useState("");
  const [deleteCollegePasswordError, setDeleteCollegePasswordError] = useState("");
  const [deleteDepartmentModal, setDeleteDepartmentModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [deleteDepartmentPassword, setDeleteDepartmentPassword] = useState("");
  const [deleteDepartmentPasswordError, setDeleteDepartmentPasswordError] = useState("");
  const [deleteFacultyModal, setDeleteFacultyModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [deleteFacultyPassword, setDeleteFacultyPassword] = useState("");
  const [deleteFacultyPasswordError, setDeleteFacultyPasswordError] = useState("");
  const [deleteFacultyLoading, setDeleteFacultyLoading] = useState(false);
  const [editDepartmentModal, setEditDepartmentModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editDepartmentNameInput, setEditDepartmentNameInput] = useState("");
  const [editDepartmentCollegeIdInput, setEditDepartmentCollegeIdInput] = useState("");
  const [editDepartmentSaving, setEditDepartmentSaving] = useState(false);
  const [editDepartmentError, setEditDepartmentError] = useState("");
  const [editCollegePasswordModal, setEditCollegePasswordModal] = useState(false);
  const [editCollegePassword, setEditCollegePassword] = useState("");
  const [editDepartmentPasswordModal, setEditDepartmentPasswordModal] = useState(false);
  const [editDepartmentPassword, setEditDepartmentPassword] = useState("");
  const [editFacultyProfileModal, setEditFacultyProfileModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editFacultyNameInput, setEditFacultyNameInput] = useState("");
  const [editFacultyEmailInput, setEditFacultyEmailInput] = useState("");
  const [editFacultyDepartmentInput, setEditFacultyDepartmentInput] = useState("");
  const [editFacultyCollegeInput, setEditFacultyCollegeInput] = useState("");
  const [editFacultyProfileSaving, setEditFacultyProfileSaving] = useState(false);
  const [editFacultyProfileError, setEditFacultyProfileError] = useState("");
  const [editFacultyPasswordModal, setEditFacultyPasswordModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editFacultyPasswordSource, setEditFacultyPasswordSource] = useState<"faculty" | "profile">("faculty");
  const [facultyPasswordInput, setFacultyPasswordInput] = useState("");
  const [facultyPasswordConfirm, setFacultyPasswordConfirm] = useState("");
  const [facultyPasswordSaving, setFacultyPasswordSaving] = useState(false);
  const [facultyPasswordError, setFacultyPasswordError] = useState("");
  const [adminPasswordModalOpen, setAdminPasswordModalOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [adminPasswordSaving, setAdminPasswordSaving] = useState(false);
  const [adminPasswordError, setAdminPasswordError] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [adminEmailSaving, setAdminEmailSaving] = useState(false);
  const [adminEmailError, setAdminEmailError] = useState("");
  const [adminEmailSuccess, setAdminEmailSuccess] = useState(false);

  // Password visibility toggles
  const [showCreateCollegePassword, setShowCreateCollegePassword] = useState(false);
  const [showCreateDeptPassword, setShowCreateDeptPassword] = useState(false);
  const [showCreateFacPassword, setShowCreateFacPassword] = useState(false);
  const [showAddFacPassword, setShowAddFacPassword] = useState(false);
  const [showDeleteCollegePassword, setShowDeleteCollegePassword] = useState(false);
  const [showDeleteDeptPassword, setShowDeleteDeptPassword] = useState(false);
  const [showDeleteFacPassword, setShowDeleteFacPassword] = useState(false);
  const [showEditCollegePassword, setShowEditCollegePassword] = useState(false);
  const [showEditDeptPassword, setShowEditDeptPassword] = useState(false);
  const [showFacultyPassword, setShowFacultyPassword] = useState(false);
  const [showFacultyPasswordConfirm, setShowFacultyPasswordConfirm] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminPasswordConfirm, setShowAdminPasswordConfirm] = useState(false);
  const [showAdminEmailPassword, setShowAdminEmailPassword] = useState(false);

  const [driveConnected, setDriveConnected] = useState(false);
  const [driveMode, setDriveMode] = useState<"service_account" | "oauth" | "none">("none");
  const [meetConnected, setMeetConnected] = useState(false);
  const [meetMode, setMeetMode] = useState<"service_account" | "oauth" | "none">("none");
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthExpired, setOauthExpired] = useState(false);
  const [oauthExpiresAt, setOauthExpiresAt] = useState<string | null>(null);
  const [tokenMaxAgeDays, setTokenMaxAgeDays] = useState(30);
  const [liveQueue, setLiveQueue] = useState<LiveQueueItem[]>([]);
  const [liveQueueLoading, setLiveQueueLoading] = useState(false);
  const [driveRecordings, setDriveRecordings] = useState<DriveRecording[]>([]);
  const [driveRecordingsLoading, setDriveRecordingsLoading] = useState(false);
  const [driveRecordingsError, setDriveRecordingsError] = useState("");
  const [driveRecordingsNextPageToken, setDriveRecordingsNextPageToken] = useState<string | null>(null);
  const [driveRecordingsSearch, setDriveRecordingsSearch] = useState("");
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [recordingStorageReady, setRecordingStorageReady] = useState(false);
  const [facultySearch, setFacultySearch] = useState("");

  useEffect(() => {
    if (safeGetItem("user_role") !== "admin") {
      navigate("/admin/login");
      return;
    }
    fetchDepartments();
    fetchColleges();
    fetchFaculties();
    checkDriveStatus();
    void checkRecordingStorageStatus();
    fetchLiveQueue();
    fetchAdminEmail();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        void checkDriveStatus();
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        alert(`Google OAuth failed: ${event.data?.error}\n${event.data?.description || ''}`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (safeGetItem("user_role") !== "admin") return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "queue_updated") {
          fetchLiveQueue(1, true);
        }
        if (data.type === "faculty_updated") {
          fetchFaculties();
          fetchLiveQueue(1, true);
        }
      } catch (err) {
      }
    };

    ws.onerror = (error) => {
    };

    ws.onclose = () => {
    };

    const interval = setInterval(() => {
      fetchLiveQueue(1, true);
    }, 15000);

    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (safeGetItem("user_role") !== "admin") return;

    if (!recordingStorageReady) {
      setDriveRecordings([]);
      setDriveRecordingsNextPageToken(null);
      setSelectedRecordingId(null);
      return;
    }

    void fetchDriveRecordings();
  }, [recordingStorageReady]);

  const checkDriveStatus = async () => {
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
    }
  };

  const checkRecordingStorageStatus = async () => {
    try {
      const res = await fetch("/api/recordings/status");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Supabase recording storage is unavailable.");
      }

      const ready = Boolean(data.ready);
      setRecordingStorageReady(ready);
      if (ready) {
        setDriveRecordingsError("");
      }
      return ready;
    } catch (err) {
      setRecordingStorageReady(false);
      setDriveRecordingsError(err instanceof Error ? err.message : "Supabase recording storage is unavailable.");
      return false;
    }
  };

  const fetchDriveRecordings = async (loadMore = false) => {
    const pageToken = loadMore ? driveRecordingsNextPageToken : null;
    if (loadMore && !pageToken) return;

    setDriveRecordingsLoading(true);
    setDriveRecordingsError("");

    try {
      const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
      const res = await fetch(`/api/recordings${query}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load consultation recordings.");
      }

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
      setDriveRecordingsError(err instanceof Error ? err.message : "Failed to load consultation recordings.");
    } finally {
      setDriveRecordingsLoading(false);
    }
  };

  const fetchLiveQueue = async (retries = 2, silent = false) => {
    if (!silent) setLiveQueueLoading(true);
    try {
      const res = await fetch("/api/admin/queue-monitor", { credentials: "include" });
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
      try {
        const legacy = await fetchLegacyLiveQueue();
        setLiveQueue(legacy);
      } catch (legacyErr) {
        if (retries > 0) {
          setTimeout(() => fetchLiveQueue(retries - 1, silent), 2000);
        }
      }
    } finally {
      if (!silent) setLiveQueueLoading(false);
    }
  };

  const sortLiveQueue = (items: LiveQueueItem[]) => {
    const rank = (status: LiveQueueItem["status"]) => {
      if (status === "serving") return 0;
      return 1;
    };

    return [...items].sort((a, b) => {
      const statusDiff = rank(a.status) - rank(b.status);
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  };

  const fetchLegacyLiveQueue = async (): Promise<LiveQueueItem[]> => {
    const facultyRes = await fetch("/api/faculty", { credentials: "include" });
    if (!facultyRes.ok) throw new Error(`Faculty endpoint failed: ${facultyRes.status}`);
    const facultyData = await facultyRes.json();
    if (!Array.isArray(facultyData)) throw new Error("Faculty payload is not an array");

    const queueLists = await Promise.all(
      facultyData.map(async (f: any) => {
        try {
          const queueRes = await fetch(`/api/faculty/${f.id}/queue`, { credentials: "include" });
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
  };

  const handleConnectDrive = async () => {
    try {
      const response = await fetch(`/api/auth/google/url`);
      if (!response.ok) throw new Error('Failed to get auth URL');
      const data = await response.json();
      const { url, mode, message } = data;

      if (!url) {
        if (mode === "service_account") {
          void checkDriveStatus();
          alert(message || "Server-side Google integration is already active.");
          return;
        }
        throw new Error(message || "No OAuth URL returned.");
      }
      
      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        alert('Please allow popups for this site to connect your account.');
      }
    } catch (error) {
      alert('Failed to initiate Google connection.');
    }
  };

  const googleExpiryLabel = oauthExpiresAt
    ? new Date(oauthExpiresAt).toLocaleDateString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const handleDisconnectDrive = async () => {
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
    if (!confirm("Are you sure you want to disconnect Google? Meet links will not auto-generate until you reconnect. Recordings will continue saving to Supabase Storage.")) return;
    
    try {
      const res = await fetch("/api/drive/disconnect", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to disconnect");
      await checkDriveStatus();
      alert("Google OAuth disconnected successfully.");
    } catch (err) {
      alert("Failed to disconnect Google.");
    }
  };

  const fetchFaculties = async (retries = 3) => {
    try {
      const res = await fetch("/api/faculty", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaculties(data);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchFaculties(retries - 1), 2000);
      }
    }
  };

  const fetchColleges = async (retries = 3) => {
    try {
      const res = await fetch("/api/colleges", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setColleges(data);
        if (data.length > 0) {
          setCollegeId(data[0].id);
        }
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchColleges(retries - 1), 2000);
      }
    }
  };

  const fetchDepartments = async (retries = 3) => {
    try {
      const res = await fetch("/api/departments", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDepartments(data);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchDepartments(retries - 1), 2000);
      }
    }
  };

  const handleAddCollege = (e: React.FormEvent) => {
    e.preventDefault();
    setCollegeError("");

    if (!collegeName.trim()) {
      setCollegeError("College name is required.");
      return;
    }
    if (!collegeCode.trim()) {
      setCollegeError("College code is required.");
      return;
    }

    setCreateCollegePassword("");
    setCreateCollegePasswordError("");
    setCreateCollegePasswordModal(true);
  };

  const submitCreateCollege = async () => {
    if (!createCollegePassword.trim()) {
      setCreateCollegePasswordError("Admin password is required.");
      return;
    }

    setAddingCollege(true);
    try {
      const res = await fetch("/api/colleges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: collegeName.trim(), code: collegeCode.trim(), password: createCollegePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add college");
      setCollegeName("");
      setCollegeCode("");
      setCreateCollegePasswordModal(false);
      setCreateCollegePassword("");
      fetchColleges();
      alert("College added successfully");
    } catch (err: any) {
      setCreateCollegePasswordError(err.message);
    } finally {
      setAddingCollege(false);
    }
  };

  const handleAddDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    setDeptError("");

    if (!deptName.trim()) {
      setDeptError("Department name is required.");
      return;
    }
    if (!deptCode.trim()) {
      setDeptError("Department code is required.");
      return;
    }
    if (!collegeId) {
      setDeptError("College selection is required.");
      return;
    }

    setCreateDeptPassword("");
    setCreateDeptPasswordError("");
    setCreateDeptPasswordModal(true);
  };

  const submitCreateDepartment = async () => {
    if (!createDeptPassword.trim()) {
      setCreateDeptPasswordError("Admin password is required.");
      return;
    }

    setAddingDept(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: deptName.trim(), code: deptCode.trim(), college_id: collegeId, password: createDeptPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add department");
      setDeptName("");
      setDeptCode("");
      setCollegeId("");
      setCreateDeptPasswordModal(false);
      setCreateDeptPassword("");
      fetchDepartments();
      alert("Department added successfully");
    } catch (err: any) {
      setCreateDeptPasswordError(err.message);
    } finally {
      setAddingDept(false);
    }
  };

  const handleAddFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    setFacFormSubmitted(true);
    setFacError("");

    if (!facName.trim()) {
      setFacError("Faculty name is required.");
      return;
    }
    if (!facCollege) {
      setFacError("College selection is required.");
      return;
    }
    if (!facDept) {
      setFacError("Department selection is required.");
      return;
    }
    if (!facEmail.trim()) {
      setFacError("Email is required.");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(facEmail.trim())) {
      setFacError("Please enter a valid email address.");
      return;
    }

    if (!facPassword.trim()) {
      setFacError("Faculty password is required.");
      return;
    }
    if (facPassword.trim().length < 8) {
      setFacError("Faculty password must be at least 8 characters long.");
      return;
    }
    if (!/[a-zA-Z]/.test(facPassword) || !/[0-9]/.test(facPassword)) {
      setFacError("Faculty password must contain both letters and numbers (alphanumeric).");
      return;
    }

    setCreateFacPassword("");
    setCreateFacPasswordError("");
    setCreateFacPasswordModal(true);
  };

  const submitCreateFaculty = async () => {
    if (!createFacPassword.trim()) {
      setCreateFacPasswordError("Admin password is required.");
      return;
    }

    setAddingFac(true);
    try {
      const id = crypto.randomUUID();
      const res = await fetch("/api/faculty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id,
          name: facName.trim(),
          department_id: facDept,
          email: facEmail.trim(),
          password: facPassword.trim(),
          password_confirm: createFacPassword
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add faculty");
      setFacName("");
      setFacCollege("");
      setFacDept("");
      setFacEmail("");
      setFacPassword("");
      setFacFormSubmitted(false);
      setCreateFacPasswordModal(false);
      setCreateFacPassword("");
      fetchFaculties();
      alert("Faculty added successfully");
    } catch (err: any) {
      setCreateFacPasswordError(err.message);
    } finally {
      setAddingFac(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
    } finally {
      safeClearStorage();
      navigate("/admin/login");
    }
  };

  const handleDeleteCollege = async () => {
    if (!deleteCollegePassword.trim()) {
      setDeleteCollegePasswordError("Password is required to confirm deletion");
      return;
    }
    try {
      const res = await fetch(`/api/colleges/${deleteCollegeModal.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: deleteCollegePassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete college");
      fetchColleges();
      setDeleteCollegeModal({ isOpen: false, id: "", name: "" });
      setDeleteCollegePassword("");
      setDeleteCollegePasswordError("");
      alert("College deleted successfully");
    } catch (err: any) {
      setDeleteCollegePasswordError(err.message);
    }
  };

  const openEditCollegeModal = (id: string, name: string, code: string) => {
    setEditCollegeModal({ isOpen: true, id, name });
    setEditCollegeNameInput(name);
    setEditCollegeCodeInput(code || "");
    setEditCollegeError("");
  };

  const closeEditCollegeModal = () => {
    setEditCollegeModal({ isOpen: false, id: "", name: "" });
    setEditCollegeNameInput("");
    setEditCollegeCodeInput("");
    setEditCollegeError("");
  };

  const handleSaveCollegeName = async () => {
    const name = editCollegeNameInput.trim();
    const code = editCollegeCodeInput.trim();
    if (!name) {
      setEditCollegeError("College name is required.");
      return;
    }
    if (!code) {
      setEditCollegeError("College code is required.");
      return;
    }

    // Prompt for password first
    setEditCollegePasswordModal(true);
  };

  const confirmSaveCollege = async () => {
    if (!editCollegePassword.trim()) {
      alert("Password is required");
      return;
    }

    const name = editCollegeNameInput.trim();
    const code = editCollegeCodeInput.trim();

    setEditCollegeSaving(true);
    setEditCollegeError("");
    try {
      const res = await fetch(`/api/colleges/${editCollegeModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, code, password: editCollegePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update college name");

      closeEditCollegeModal();
      setEditCollegePasswordModal(false);
      setEditCollegePassword("");
      fetchColleges();
      alert("College updated successfully.");
    } catch (err: any) {
      setEditCollegeError(err.message || "Failed to update college");
    } finally {
      setEditCollegeSaving(false);
    }
  };

  const openEditDepartmentModal = (id: string, name: string, collegeId: string) => {
    setEditDepartmentModal({ isOpen: true, id, name });
    setEditDepartmentNameInput(name);
    setEditDepartmentCollegeIdInput(String(collegeId || ""));
    setEditDepartmentError("");
  };

  const closeEditDepartmentModal = () => {
    setEditDepartmentModal({ isOpen: false, id: "", name: "" });
    setEditDepartmentNameInput("");
    setEditDepartmentCollegeIdInput("");
    setEditDepartmentError("");
  };

  const handleSaveDepartmentName = async () => {
    const name = editDepartmentNameInput.trim();
    const college_id = editDepartmentCollegeIdInput;
    if (!name) {
      setEditDepartmentError("Department name is required.");
      return;
    }
    if (!college_id) {
      setEditDepartmentError("College selection is required.");
      return;
    }

    // Prompt for password first
    setEditDepartmentPasswordModal(true);
  };

  const confirmSaveDepartment = async () => {
    if (!editDepartmentPassword.trim()) {
      alert("Password is required");
      return;
    }

    const name = editDepartmentNameInput.trim();
    const college_id = editDepartmentCollegeIdInput;

    setEditDepartmentSaving(true);
    setEditDepartmentError("");
    try {
      const res = await fetch(`/api/departments/${editDepartmentModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, college_id, password: editDepartmentPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update department name");

      closeEditDepartmentModal();
      setEditDepartmentPasswordModal(false);
      setEditDepartmentPassword("");
      fetchDepartments();
      fetchFaculties();
      alert("Department updated successfully.");
    } catch (err: any) {
      setEditDepartmentError(err.message || "Failed to update department");
    } finally {
      setEditDepartmentSaving(false);
    }
  };

  const handleDeleteDepartment = async () => {
    if (!deleteDepartmentPassword.trim()) {
      setDeleteDepartmentPasswordError("Password is required to confirm deletion");
      return;
    }
    try {
      const res = await fetch(`/api/departments/${deleteDepartmentModal.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: deleteDepartmentPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete department");
      fetchDepartments();
      fetchFaculties();
      setDeleteDepartmentModal({ isOpen: false, id: "", name: "" });
      setDeleteDepartmentPassword("");
      setDeleteDepartmentPasswordError("");
      alert("Department deleted successfully.");
    } catch (err: any) {
      setDeleteDepartmentPasswordError(err.message);
    }
  };

  const openEditFacultyProfileModal = (id: string, name: string, email: string, department_id?: string, college_id?: string) => {
    setEditFacultyProfileModal({ isOpen: true, id, name });
    setEditFacultyNameInput(name || "");
    setEditFacultyEmailInput(email || "");
    setEditFacultyDepartmentInput(department_id || "");
    setEditFacultyCollegeInput(college_id || "");
    setEditFacultyProfileError("");
  };

  const closeEditFacultyProfileModal = () => {
    setEditFacultyProfileModal({ isOpen: false, id: "", name: "" });
    setEditFacultyNameInput("");
    setEditFacultyEmailInput("");
    setEditFacultyDepartmentInput("");
    setEditFacultyCollegeInput("");
    setEditFacultyProfileError("");
  };

  const handleSaveFacultyProfile = async () => {
    const name = editFacultyNameInput.trim();
    const email = editFacultyEmailInput.trim();
    const department_id = editFacultyDepartmentInput.trim();
    const college_id = editFacultyCollegeInput.trim();

    if (!name) {
      setEditFacultyProfileError("Faculty name is required.");
      return;
    }
    if (!email) {
      setEditFacultyProfileError("Email is required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEditFacultyProfileError("Please enter a valid email address.");
      return;
    }

    // Close the edit modal and open password confirmation modal
    setEditFacultyPasswordSource("profile");
    setEditFacultyPasswordModal({ isOpen: true, id: editFacultyProfileModal.id, name: editFacultyProfileModal.name });
  };

  const confirmSaveFacultyProfile = async () => {
    if (editFacultyPasswordSource !== "profile") return;
    if (!facultyPasswordInput.trim()) {
      setFacultyPasswordError("Password is required");
      return;
    }

    const name = editFacultyNameInput.trim();
    const email = editFacultyEmailInput.trim();
    const department_id = editFacultyDepartmentInput.trim();
    const college_id = editFacultyCollegeInput.trim();

    setEditFacultyProfileSaving(true);
    setFacultyPasswordError("");
    try {
      const res = await fetch(`/api/faculty/${editFacultyPasswordModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, department_id, college_id, password: facultyPasswordInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update faculty profile");
      closeEditFacultyProfileModal();
      closeEditFacultyPasswordModal();
      setFacultyPasswordInput("");
      setFacultyPasswordConfirm("");
      setFacultyPasswordError("");
      fetchFaculties();
      alert("Faculty profile updated successfully.");
    } catch (err: any) {
      setFacultyPasswordError(err.message || "Failed to update faculty profile");
    } finally {
      setEditFacultyProfileSaving(false);
    }
  };

  const handleDeleteFaculty = async () => {
    if (!deleteFacultyPassword.trim()) {
      setDeleteFacultyPasswordError("Password is required to confirm deletion");
      return;
    }
    setDeleteFacultyLoading(true);
    try {
      const res = await fetch(`/api/faculty/${deleteFacultyModal.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: deleteFacultyPassword })
      });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        // Handle specific HTTP status codes with better error messages
        if (res.status === 409) {
          // Conflict - likely due to foreign key constraints
          const errorMsg = data.details?.instruction 
            ? `${data.error}\n\n${data.details.instruction}`
            : data.error || "Cannot delete faculty due to existing records";
          setDeleteFacultyPasswordError(errorMsg);
          return;
        }
        throw new Error(data.error || "Failed to delete faculty");
      }
      
      fetchFaculties();
      setDeleteFacultyModal({ isOpen: false, id: "", name: "" });
      setDeleteFacultyPassword("");
      setDeleteFacultyPasswordError("");
      alert("Faculty deleted successfully");
    } catch (err: any) {
      setDeleteFacultyPasswordError(err.message || "An error occurred while deleting faculty");
    } finally {
      setDeleteFacultyLoading(false);
    }
  };

  const openEditFacultyPasswordModal = (id: string, name: string) => {
    setEditFacultyPasswordSource("faculty");
    setEditFacultyPasswordModal({ isOpen: true, id, name });
    setFacultyPasswordInput("");
    setFacultyPasswordConfirm("");
    setFacultyPasswordError("");
  };

  const closeEditFacultyPasswordModal = () => {
    setEditFacultyPasswordModal({ isOpen: false, id: "", name: "" });
    setEditFacultyPasswordSource("faculty");
    setFacultyPasswordInput("");
    setFacultyPasswordConfirm("");
    setFacultyPasswordError("");
  };

  const handleSaveFacultyPassword = async () => {
    if (editFacultyPasswordSource !== "faculty") return;
    if (!facultyPasswordInput.trim()) {
      setFacultyPasswordError("Password is required.");
      return;
    }
    if (facultyPasswordInput.trim().length < 8) {
      setFacultyPasswordError("Password must be at least 8 characters long.");
      return;
    }
    if (!/[a-zA-Z]/.test(facultyPasswordInput) || !/[0-9]/.test(facultyPasswordInput)) {
      setFacultyPasswordError("Password must contain both letters and numbers (alphanumeric).");
      return;
    }
    if (facultyPasswordInput !== facultyPasswordConfirm) {
      setFacultyPasswordError("Passwords do not match.");
      return;
    }

    setFacultyPasswordSaving(true);
    setFacultyPasswordError("");
    try {
      const res = await fetch(`/api/faculty/${editFacultyPasswordModal.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: facultyPasswordInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update password");
      closeEditFacultyPasswordModal();
      alert("Faculty password updated successfully.");
    } catch (err: any) {
      setFacultyPasswordError(err.message || "Failed to update password");
    } finally {
      setFacultyPasswordSaving(false);
    }
  };

  const openAdminPasswordModal = () => {
    setAdminPasswordInput("");
    setAdminPasswordConfirm("");
    setAdminPasswordError("");
    setAdminEmailInput(adminEmail);
    setAdminEmailError("");
    setAdminEmailSuccess(false);
    setAdminPasswordModalOpen(true);
  };

  const closeAdminPasswordModal = () => {
    setAdminPasswordModalOpen(false);
    setAdminPasswordInput("");
    setAdminPasswordConfirm("");
    setAdminPasswordError("");
  };

  const handleSaveAdminPassword = async () => {
    if (!adminPasswordInput.trim()) {
      setAdminPasswordError("Password is required.");
      return;
    }
    if (adminPasswordInput.trim().length < 6) {
      setAdminPasswordError("Password must be at least 6 characters long.");
      return;
    }
    if (adminPasswordInput !== adminPasswordConfirm) {
      setAdminPasswordError("Passwords do not match.");
      return;
    }

    setAdminPasswordSaving(true);
    setAdminPasswordError("");
    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: adminPasswordInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update admin password");
      closeAdminPasswordModal();
      alert("Admin password updated successfully.");
    } catch (err: any) {
      setAdminPasswordError(err.message || "Failed to update admin password");
    } finally {
      setAdminPasswordSaving(false);
    }
  };

  const fetchAdminEmail = async () => {
    try {
      const res = await fetch("/api/admin/email");
      const data = await res.json();
      setAdminEmail(data.email || "");
    } catch {
      // ignore
    }
  };

  const handleSaveAdminEmail = async () => {
    const email = adminEmailInput.trim().toLowerCase();
    if (!email) {
      setAdminEmailError("Email is required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setAdminEmailError("Invalid email format.");
      return;
    }
    setAdminEmailSaving(true);
    setAdminEmailError("");
    setAdminEmailSuccess(false);
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save admin email");
      setAdminEmail(email);
      setAdminEmailSuccess(true);
    } catch (err: any) {
      setAdminEmailError(err.message || "Failed to save admin email");
    } finally {
      setAdminEmailSaving(false);
    }
  };

  const getFacultyNameForRecording = (recording: DriveRecording) => {
    if (recording.facultyName) return recording.facultyName;
    if (!recording.facultyId) return "Unknown faculty";
    const matchedFaculty = faculties.find((item: any) => String(item.id) === String(recording.facultyId));
    return matchedFaculty?.name || `Faculty ${recording.facultyId}`;
  };

  const getStudentNameForRecording = (recording: DriveRecording) => {
    if (recording.studentName) return recording.studentName;
    if (recording.studentNumber) return `Student ${recording.studentNumber}`;
    return "Unknown student";
  };

  const getStudentDetailForRecording = (recording: DriveRecording) => {
    const studentName = getStudentNameForRecording(recording);
    return recording.studentNumber ? `${studentName} (${recording.studentNumber})` : studentName;
  };

  const formatRecordingDate = (value: string | null) => {
    if (!value) return "Unknown upload date";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Unknown upload date";
    return formatDisplayDateTimePHT(parsed);
  };

  const formatRecordingSize = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "Unknown size";
    if (value < 1024) return `${value} B`;

    const units = ["KB", "MB", "GB"];
    let size = value / 1024;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const servingStudents = liveQueue.filter((item) => item.status === "serving");
  const nextStudents = liveQueue.filter((item) => item.status === "serving");
  const waitingStudents = liveQueue.filter((item) => item.status === "waiting");
  const filteredDepartments = departments.filter((d: any) => String(d.college_id) === String(facCollege));

  const normalizedDriveSearch = driveRecordingsSearch.trim().toLowerCase();
  const filteredDriveRecordings = driveRecordings.filter((recording) => {
    if (!normalizedDriveSearch) return true;
    const facultyName = getFacultyNameForRecording(recording).toLowerCase();
    const studentName = getStudentNameForRecording(recording).toLowerCase();
    const studentNumber = (recording.studentNumber || "").toLowerCase();
    return (
      recording.name.toLowerCase().includes(normalizedDriveSearch) ||
      facultyName.includes(normalizedDriveSearch) ||
      studentName.includes(normalizedDriveSearch) ||
      studentNumber.includes(normalizedDriveSearch)
    );
  });
  const selectedRecording =
    filteredDriveRecordings.find((recording) => recording.id === selectedRecordingId) ||
    filteredDriveRecordings[0] ||
    null;
  const selectedRecordingContentUrl = selectedRecording
    ? `/api/recordings/content?path=${encodeURIComponent(selectedRecording.path)}`
    : "";

  const departmentById = new Map<string, any>((departments || []).map((d: any) => [String(d.id), d]));
  const collegeById = new Map<string, any>((colleges || []).map((c: any) => [String(c.id), c]));
  const facultiesByCollege = (colleges || []).map((college: any) => {
    const collegeDepts = (departments || []).filter((d: any) => String(d.college_id) === String(college.id));
    const deptGroups = collegeDepts.map((dept: any) => {
      const deptFaculties = (faculties || []).filter((fac: any) => String(fac.department_id) === String(dept.id));
      return { id: String(dept.id), name: dept.name, items: deptFaculties };
    });
    const totalFaculty = deptGroups.reduce((sum: number, g: any) => sum + g.items.length, 0);
    return { id: String(college.id), name: college.name, departments: deptGroups, totalFaculty };
  });
  
  // Filter faculties by college based on search query
  const filteredFacultiesByCollege = facultySearch.trim() === "" 
    ? facultiesByCollege 
    : facultiesByCollege
        .map((college: any) => ({
          ...college,
          departments: college.departments
            .map((dept: any) => ({
              ...dept,
              items: dept.items.filter((fac: any) =>
                fac.name.toLowerCase().includes(facultySearch.toLowerCase()) ||
                fac.email.toLowerCase().includes(facultySearch.toLowerCase()) ||
                dept.name.toLowerCase().includes(facultySearch.toLowerCase()) ||
                college.name.toLowerCase().includes(facultySearch.toLowerCase())
              )
            }))
            .filter((dept: any) => dept.items.length > 0)
        }))
        .filter((college: any) => college.departments.length > 0);
  
  const unassignedCollegeFaculties = (faculties || []).filter((fac: any) => {
    const dept = departmentById.get(String(fac.department_id));
    if (!dept) return true;
    return !collegeById.has(String(dept.college_id));
  });

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <header className="bg-white shadow-sm p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/admin/login")} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-neutral-600" />
          </button>
          <Shield className="w-8 h-8 text-red-600" />
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Admin Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden xl:flex items-center gap-2 mr-4 border-r border-neutral-200 pr-4">
            {oauthConnected && !oauthExpired ? (
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-sm font-medium rounded-lg border border-emerald-100">
                Google Connected
              </span>
            ) : oauthExpired ? (
              <span className="px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-medium rounded-lg border border-amber-100">
                Google Expired â€” Reconnect
              </span>
            ) : driveMode === "service_account" ? (
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg border border-blue-100">
                Google: Service Account
              </span>
            ) : (
              <span className="px-3 py-1.5 bg-red-50 text-red-700 text-sm font-medium rounded-lg border border-red-100">
                Google Not Connected
              </span>
            )}
          </div>
          <button
            onClick={openAdminPasswordModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
          >
            <KeyRound className="w-4 h-4" /> Admin Settings
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-neutral-200 px-8 py-4">
        <div className="max-w-7xl mx-auto flex gap-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-6 py-2 font-medium rounded-xl transition-colors ${
              activeTab === "dashboard"
                ? "bg-indigo-100 text-indigo-700"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("audit-logs")}
            className={`flex items-center gap-2 px-6 py-2 font-medium rounded-xl transition-colors ${
              activeTab === "audit-logs"
                ? "bg-indigo-100 text-indigo-700"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            <FileText className="w-4 h-4" />
             Logs
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Audit Logs View */}
        {activeTab === "audit-logs" && (
          <div className="p-8 max-w-7xl mx-auto w-full">
            <AuditLogs />
          </div>
        )}

        {/* Dashboard View */}
        {activeTab === "dashboard" && (
          <>
      {/* Admin Google Email Banner */}
      {!adminEmail && (
        <section className="px-8 pt-6 max-w-7xl mx-auto w-full">
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 shrink-0">
              <div className="p-2 bg-amber-100 rounded-xl">
                <Mail className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900 text-sm">Set Up Admin Google Account</h3>
                <p className="text-xs text-amber-700">Required for Google Sign-In and password recovery on the admin login page.</p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
              <input
                type="email"
                value={adminEmailInput}
                onChange={(e) => { setAdminEmailInput(e.target.value); setAdminEmailSuccess(false); }}
                placeholder="your-email@gmail.com"
                className="flex-1 sm:w-64 p-2.5 border-2 border-amber-300 rounded-xl bg-white focus:border-amber-500 focus:ring-0 outline-none transition-colors text-sm"
              />
              <button
                onClick={handleSaveAdminEmail}
                disabled={adminEmailSaving}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold rounded-xl transition-colors text-sm whitespace-nowrap"
              >
                {adminEmailSaving ? "Saving..." : "Save"}
              </button>
            </div>
            {adminEmailError && <p className="text-xs text-red-600 w-full">{adminEmailError}</p>}
          </div>
        </section>
      )}

      {/* Live Queue Monitoring */}
      <section className="px-8 pt-8 max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-3xl shadow-lg p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 rounded-2xl">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-neutral-900">Live Student Monitoring</h2>
                <p className="text-sm text-neutral-500">Real-time view of students in queue and ongoing consultations.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-100">
                Ongoing: {servingStudents.length}
              </span>
              <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium border border-blue-100">
                Waiting: {waitingStudents.length}
              </span>
            </div>
          </div>

          {liveQueueLoading && liveQueue.length === 0 ? (
            <div className="p-6 rounded-2xl bg-neutral-50 text-neutral-500 text-sm border border-neutral-200">
              Loading live queue...
            </div>
          ) : liveQueue.length === 0 ? (
            <div className="p-6 rounded-2xl bg-neutral-50 text-neutral-500 text-sm border border-neutral-200">
              No active students in queue right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-3">Currently Serving</h3>
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {[...servingStudents, ...nextStudents].length === 0 ? (
                    <div className="text-sm text-neutral-400">No students currently serving or next.</div>
                  ) : (
                    [...servingStudents, ...nextStudents].map((item) => (
                      <div key={item.id} className="p-3 rounded-xl bg-white border border-neutral-200">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-neutral-900">{item.student_name}</p>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                            item.status === "serving"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600">Student Number: {item.student_number || "N/A"}</p>
                        <p className="text-xs text-neutral-500 mt-1">Faculty: {item.faculty_name}</p>
                        {item.consultation_date_display && <p className="text-xs text-neutral-500">Date: {item.consultation_date_display}</p>}
                        <p className="text-xs text-neutral-500">Slot: {item.time_period || "Walk-in / No slot"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-3">Waiting Queue</h3>
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {waitingStudents.length === 0 ? (
                    <div className="text-sm text-neutral-400">No students waiting.</div>
                  ) : (
                    waitingStudents.map((item) => (
                      <div key={item.id} className="p-3 rounded-xl bg-white border border-neutral-200">
                        <p className="font-semibold text-neutral-900">{item.student_name}</p>
                        <p className="text-sm text-neutral-600">Student Number: {item.student_number || "N/A"}</p>
                        <p className="text-xs text-neutral-500 mt-1">Faculty: {item.faculty_name}</p>
                        {item.consultation_date_display && <p className="text-xs text-neutral-500">Date: {item.consultation_date_display}</p>}
                        <p className="text-xs text-neutral-500">Slot: {item.time_period || "Walk-in / No slot"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="px-8 pt-8 max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-2xl">
                <FolderOpen className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-neutral-900">Consultation Recordings</h2>
                <p className="text-sm text-neutral-500">Browse consultation audio recordings, including the faculty and student tied to each recording.</p>
              </div>
            </div>
            <button
              onClick={() => {
                void checkRecordingStorageStatus().then((ready) => {
                  if (ready) {
                    void fetchDriveRecordings();
                  }
                });
              }}
              disabled={driveRecordingsLoading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400 text-neutral-700 rounded-xl transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${driveRecordingsLoading ? "animate-spin" : ""}`} />
              Refresh Recordings
            </button>
          </div>

          {!recordingStorageReady ? (
            <div className="p-6 rounded-2xl bg-neutral-50 text-neutral-500 text-sm border border-neutral-200">
              Consultation recording storage is unavailable right now. Recordings will appear here once storage is reachable again.
            </div>
          ) : (
            <>
              <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex items-center gap-2 bg-white rounded-2xl shadow-md p-4 border border-neutral-200 flex-1">
                <Search className="w-5 h-5 text-neutral-400 flex-shrink-0" />
                <input
                  type="text"
                  value={driveRecordingsSearch}
                  onChange={(e) => setDriveRecordingsSearch(e.target.value)}
                  placeholder="Search recordings by file name, faculty, or student"
                  className="flex-1 p-2 bg-transparent outline-none text-neutral-900 placeholder-neutral-400"
                />
                {driveRecordingsSearch && (
                  <button
                    type="button"
                    onClick={() => setDriveRecordingsSearch("")}
                    className="px-3 py-1 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-lg transition-colors flex-shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
                <div className="px-4 py-3 rounded-2xl bg-neutral-50 border border-neutral-200 text-sm text-neutral-600">
                  Showing {filteredDriveRecordings.length} of {driveRecordings.length} recordings
                </div>
              </div>

              {driveRecordingsError ? (
                <div className="p-4 rounded-2xl bg-red-50 text-red-700 text-sm border border-red-100">
                  {driveRecordingsError}
                </div>
              ) : null}

              {driveRecordingsLoading && driveRecordings.length === 0 ? (
                <div className="p-6 rounded-2xl bg-neutral-50 text-neutral-500 text-sm border border-neutral-200">
                  Loading consultation recordings...
                </div>
              ) : filteredDriveRecordings.length === 0 ? (
                <div className="p-6 rounded-2xl bg-neutral-50 text-neutral-500 text-sm border border-neutral-200">
                  {driveRecordings.length === 0 ? "No consultation recordings have been uploaded yet." : "No recordings match your search."}
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] gap-6">
                  <div className="rounded-3xl border border-neutral-200 overflow-hidden bg-neutral-50">
                    <div className="px-5 py-4 border-b border-neutral-200 bg-white">
                      <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider">Recording Library</h3>
                    </div>
                    <div className="max-h-[32rem] overflow-y-auto">
                      {filteredDriveRecordings.map((recording) => {
                        const isSelected = selectedRecording?.id === recording.id;

                        return (
                          <button
                            key={recording.id}
                            type="button"
                            onClick={() => setSelectedRecordingId(recording.id)}
                            className={`w-full text-left px-5 py-4 border-b border-neutral-200 last:border-b-0 transition-colors ${
                              isSelected ? "bg-amber-50" : "bg-white hover:bg-neutral-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-xl ${isSelected ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>
                                    <FileAudio className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-neutral-900 truncate">{recording.name}</p>
                                    <p className="text-sm text-neutral-500 truncate">Faculty: {getFacultyNameForRecording(recording)}</p>
                                    <p className="text-sm text-neutral-500 truncate">Student: {getStudentDetailForRecording(recording)}</p>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                                  <span>{formatRecordingDate(recording.createdTime)}</span>
                                  <span className="text-neutral-300">|</span>
                                  <span>{formatRecordingSize(recording.size)}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {driveRecordingsNextPageToken ? (
                      <div className="px-5 py-4 border-t border-neutral-200 bg-white">
                        <button
                          type="button"
                          onClick={() => void fetchDriveRecordings(true)}
                          disabled={driveRecordingsLoading}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400 text-neutral-700 rounded-xl transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 ${driveRecordingsLoading ? "animate-spin" : ""}`} />
                          Load Older Recordings
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6 space-y-5">
                    {selectedRecording ? (
                      <>
                        <div>
                          <p className="text-sm font-bold text-neutral-700 uppercase tracking-wider">Now Playing</p>
                          <h3 className="mt-2 text-xl font-bold text-neutral-900 break-words">{selectedRecording.name}</h3>
                        </div>

                        <div className="space-y-3 text-sm text-neutral-600">
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-neutral-400">Faculty</span>
                            <span className="text-right text-neutral-700">{getFacultyNameForRecording(selectedRecording)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-neutral-400">Student</span>
                            <span className="text-right text-neutral-700">{getStudentNameForRecording(selectedRecording)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-neutral-400">Student Number</span>
                            <span className="text-right text-neutral-700">{selectedRecording.studentNumber || "Unknown"}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-neutral-400">Consultation ID</span>
                            <span className="text-right text-neutral-700">{selectedRecording.consultationId || "Unknown"}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-neutral-400">Uploaded</span>
                            <span className="text-right text-neutral-700">{formatRecordingDate(selectedRecording.createdTime)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-neutral-400">Size</span>
                            <span className="text-right text-neutral-700">{formatRecordingSize(selectedRecording.size)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-neutral-400">Format</span>
                            <span className="text-right text-neutral-700 break-all">{selectedRecording.mimeType || "Unknown"}</span>
                          </div>
                        </div>

                        <audio
                          key={selectedRecording.id}
                          controls
                          preload="metadata"
                          className="w-full"
                        >
                          <source src={selectedRecordingContentUrl} type={selectedRecording.mimeType || "audio/webm"} />
                          Your browser does not support the audio player.
                        </audio>

                        <div className="flex flex-wrap gap-3">
                          <a
                            href={`${selectedRecordingContentUrl}&download=1`}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                          <a
                            href={selectedRecordingContentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-neutral-100 text-neutral-700 rounded-xl border border-neutral-200 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Open in New Tab
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="h-full min-h-64 rounded-2xl border border-dashed border-neutral-200 bg-white flex items-center justify-center text-center text-neutral-400 text-sm px-6">
                        Select a recording from the library to preview it here.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add College */}
        <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6 self-start">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-purple-100 rounded-2xl">
              <Building className="w-6 h-6 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Add College</h2>
          </div>

          <form onSubmit={handleAddCollege} className="space-y-4">
            {collegeError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
                {collegeError}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                College Name
              </label>
              <input
                type="text"
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                placeholder="e.g. College of Engineering"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                College Code
              </label>
              <input
                type="text"
                value={collegeCode}
                onChange={(e) => setCollegeCode(e.target.value)}
                placeholder="e.g. CEN"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={addingCollege || !collegeName || !collegeCode}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-100 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              {addingCollege ? "Adding..." : "Add College"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-neutral-100">
            <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4">Existing Colleges</h3>
            <ul className="space-y-2">
              {colleges.length === 0 ? (
                <li className="text-neutral-400 text-sm">No colleges found.</li>
              ) : (
                colleges.map((c: any) => (
                  <li key={c.id} className="p-3 bg-neutral-50 rounded-xl text-neutral-700 font-medium flex items-center justify-between group">
                    <span>{c.name} ({c.code})</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEditCollegeModal(c.id, c.name, c.code)}
                        className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        title="Edit College"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteCollegeModal({ isOpen: true, id: c.id, name: c.name })}
                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete College"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Add Department */}
        <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6 self-start">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 rounded-2xl">
              <Building className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Add Department</h2>
          </div>

          <form onSubmit={handleAddDepartment} className="space-y-4">
            {deptError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
                {deptError}
              </div>
            )}
            {colleges.length > 0 ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">
                  Select College
                </label>
                <select
                  value={collegeId}
                  onChange={(e) => setCollegeId(e.target.value)}
                  className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                  required
                >
                  <option value="" disabled>Select College</option>
                  {colleges.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">
                  College ID (Required)
                </label>
                <input
                  type="text"
                  value={collegeId}
                  onChange={(e) => setCollegeId(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Department Name
              </label>
              <input
                type="text"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="e.g. Computer Engineering"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Department Code
              </label>
              <input
                type="text"
                value={deptCode}
                onChange={(e) => setDeptCode(e.target.value)}
                placeholder="e.g. BSCpE"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={addingDept || !deptName || !deptCode || !collegeId}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-100 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              {addingDept ? "Adding..." : "Add Department"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-neutral-100">
            <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4">Existing Departments</h3>
            <ul className="space-y-2">
              {departments.length === 0 ? (
                <li className="text-neutral-400 text-sm">No departments found.</li>
              ) : (
                departments.map((d: any) => (
                  <li key={d.id} className="p-3 bg-neutral-50 rounded-xl text-neutral-700 font-medium flex items-center justify-between group">
                    <div>
                      <p>{d.name}</p>
                      <p className="text-xs text-neutral-500">
                        {collegeById.get(String(d.college_id))?.name || "Unknown College"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEditDepartmentModal(d.id, d.name, String(d.college_id || ""))}
                        className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        title="Edit Department"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteDepartmentModal({ isOpen: true, id: d.id, name: d.name })}
                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Department"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Add Faculty */}
        <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6 self-start">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-emerald-100 rounded-2xl">
              <UserPlus className="w-6 h-6 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Add Faculty Member</h2>
          </div>

          <form onSubmit={handleAddFaculty} className="space-y-4">
            {facError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
                {facError}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Full Name
              </label>
              <input
                type="text"
                value={facName}
                onChange={(e) => setFacName(e.target.value)}
                placeholder="e.g. Dr. Alan Turing"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                College
              </label>
              <select
                value={facCollege}
                onChange={(e) => {
                  setFacCollege(e.target.value);
                  setFacDept("");
                }}
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                required
              >
                <option value="" disabled>Select College</option>
                {colleges.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Department
              </label>
              <select
                value={facDept}
                onChange={(e) => setFacDept(e.target.value)}
                disabled={!facCollege}
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                required
              >
                <option value="" disabled>
                  {facCollege ? "Select Department" : "Select College First"}
                </option>
                {filteredDepartments.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Email Address
              </label>
              <input
                type="email"
                value={facEmail}
                onChange={(e) => setFacEmail(e.target.value)}
                placeholder="e.g. faculty@example.com"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Password
              </label>
              <div className="relative">
                <input
                  type={showAddFacPassword ? "text" : "password"}
                  value={facPassword}
                  onChange={(e) => setFacPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full p-4 pr-12 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowAddFacPassword(!showAddFacPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showAddFacPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {facFormSubmitted && facPassword && (
                <div className="mt-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                  <p className="text-xs font-semibold text-neutral-600 mb-2">Password Requirements:</p>
                  <div className="space-y-1 text-xs">
                    <div className={`flex items-center gap-2 ${facPassword.length >= 8 ? 'text-emerald-600' : 'text-neutral-500'}`}>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${facPassword.length >= 8 ? 'bg-emerald-100' : 'bg-neutral-200'}`}>
                        {facPassword.length >= 8 ? '✓' : '○'}
                      </span>
                      At least 8 characters
                    </div>
                    <div className={`flex items-center gap-2 ${/[a-zA-Z]/.test(facPassword) ? 'text-emerald-600' : 'text-neutral-500'}`}>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${/[a-zA-Z]/.test(facPassword) ? 'bg-emerald-100' : 'bg-neutral-200'}`}>
                        {/[a-zA-Z]/.test(facPassword) ? '✓' : '○'}
                      </span>
                      Contains letters
                    </div>
                    <div className={`flex items-center gap-2 ${/[0-9]/.test(facPassword) ? 'text-emerald-600' : 'text-neutral-500'}`}>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${/[0-9]/.test(facPassword) ? 'bg-emerald-100' : 'bg-neutral-200'}`}>
                        {/[0-9]/.test(facPassword) ? '✓' : '○'}
                      </span>
                      Contains numbers
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={addingFac || !facName || !facCollege || !facDept || !facEmail || !facPassword}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-100 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              {addingFac ? "Adding..." : "Add Faculty"}
            </button>
          </form>
        </div>
      </main>

      {/* Registered Faculties by College */}
      <section className="px-8 pb-12 max-w-7xl mx-auto w-full space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Registered Faculties by College</h2>
          <p className="text-sm text-neutral-500 mt-1">Faculty records are grouped per college for easier monitoring.</p>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2 bg-white rounded-2xl shadow-md p-4 border border-neutral-200">
          <Search className="w-5 h-5 text-neutral-400" />
          <input
            type="text"
            value={facultySearch}
            onChange={(e) => setFacultySearch(e.target.value)}
            placeholder="Search by faculty name, email, college, or department..."
            className="flex-1 p-2 bg-transparent outline-none text-neutral-900 placeholder-neutral-400"
          />
          {facultySearch && (
            <button
              onClick={() => setFacultySearch("")}
              className="px-3 py-1 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {faculties.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-lg p-8 text-center text-neutral-500">
            No faculties registered yet.
          </div>
        ) : filteredFacultiesByCollege.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-lg p-8 text-center text-neutral-500">
            No faculties found matching "{facultySearch}".
          </div>
        ) : (
          <>
            {filteredFacultiesByCollege.map((group) => (
              <div key={group.id} className="bg-white rounded-3xl shadow-lg p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-neutral-900">{group.name}</h3>
                  <span className="px-3 py-1 rounded-lg bg-neutral-100 text-neutral-600 text-sm font-medium">
                    {group.totalFaculty} faculty
                  </span>
                </div>
                {group.departments.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-neutral-50 text-neutral-500 text-sm border border-neutral-200">
                    No departments in this college.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {group.departments.map((dept: any) => (
                      <div key={dept.id} className="border border-neutral-200 rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
                          <h4 className="text-base font-semibold text-neutral-700">{dept.name}</h4>
                          <span className="px-2.5 py-0.5 rounded-lg bg-white text-neutral-500 text-xs font-medium border border-neutral-200">
                            {dept.items.length} faculty
                          </span>
                        </div>
                        {dept.items.length === 0 ? (
                          <div className="p-4 text-neutral-400 text-sm">
                            No faculty registered in this department.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-neutral-100">
                                  <th className="py-3 px-4 font-bold text-neutral-600 uppercase tracking-wider text-xs">Name</th>
                                  <th className="py-3 px-4 font-bold text-neutral-600 uppercase tracking-wider text-xs">Email</th>
                                  <th className="py-3 px-4 font-bold text-neutral-600 uppercase tracking-wider text-xs">Status</th>
                                  <th className="py-3 px-4 font-bold text-neutral-600 uppercase tracking-wider text-xs text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {dept.items.map((fac: any) => (
                                  <tr key={fac.id} className="hover:bg-neutral-50 transition-colors group">
                                    <td className="py-4 px-4 font-medium text-neutral-900">{fac.name}</td>
                                    <td className="py-4 px-4 text-neutral-600">{fac.email}</td>
                                    <td className="py-4 px-4">
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        fac.status === 'available' ? 'bg-green-100 text-green-800' :
                                        fac.status === 'busy' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {fac.status}
                                      </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          onClick={() => openEditFacultyProfileModal(fac.id, fac.name, fac.email, fac.department_id, fac.college_id)}
                                          className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                          title="Edit Faculty Profile"
                                        >
                                          Edit Info
                                        </button>
                                        <button
                                          onClick={() => openEditFacultyPasswordModal(fac.id, fac.name)}
                                          className="p-2 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                          title="Change Password"
                                          type="button"
                                        >
                                          <KeyRound className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => setDeleteFacultyModal({ isOpen: true, id: fac.id, name: fac.name })}
                                          className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Delete Faculty"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {unassignedCollegeFaculties.length > 0 && (
              <div className="bg-white rounded-3xl shadow-lg p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-neutral-900">Unassigned / Unknown College</h3>
                  <span className="px-3 py-1 rounded-lg bg-amber-100 text-amber-700 text-sm font-medium">
                    {unassignedCollegeFaculties.length} faculty
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-neutral-100">
                        <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Name</th>
                        <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Email</th>
                        <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Department</th>
                        <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Status</th>
                        <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {unassignedCollegeFaculties.filter((fac: any) => {
                        if (!facultySearch) return true;
                        return fac.name.toLowerCase().includes(facultySearch.toLowerCase()) ||
                               fac.email.toLowerCase().includes(facultySearch.toLowerCase());
                      }).map((fac: any) => (
                        <tr key={fac.id} className="hover:bg-neutral-50 transition-colors group">
                          <td className="py-4 px-4 font-medium text-neutral-900">{fac.name}</td>
                          <td className="py-4 px-4 text-neutral-600">{fac.email}</td>
                          <td className="py-4 px-4 text-neutral-600">
                            {departmentById.get(String(fac.department_id))?.name || fac.department || "Unknown Department"}
                          </td>
                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              fac.status === 'available' ? 'bg-green-100 text-green-800' :
                              fac.status === 'busy' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {fac.status}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEditFacultyProfileModal(fac.id, fac.name, fac.email, fac.department_id, fac.college_id)}
                                className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                title="Edit Faculty Profile"
                              >
                                Edit Info
                              </button>
                              <button
                                onClick={() => openEditFacultyPasswordModal(fac.id, fac.name)}
                                className="p-2 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Change Password"
                                type="button"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteFacultyModal({ isOpen: true, id: fac.id, name: fac.name })}
                                className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete Faculty"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Modals */}
      {editCollegeModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <Building className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Edit College</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Update the details for <span className="font-bold text-neutral-900">{editCollegeModal.name}</span>.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">College Name</label>
              <input
                type="text"
                value={editCollegeNameInput}
                onChange={(e) => {
                  setEditCollegeNameInput(e.target.value);
                  setEditCollegeError("");
                }}
                placeholder="Enter college name"
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">College Code</label>
              <input
                type="text"
                value={editCollegeCodeInput}
                onChange={(e) => {
                  setEditCollegeCodeInput(e.target.value);
                  setEditCollegeError("");
                }}
                placeholder="Enter college code"
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              />
              {editCollegeError && <p className="text-sm text-red-600 mt-2">{editCollegeError}</p>}
            </div>
            <div className="flex gap-4">
              <button
                onClick={closeEditCollegeModal}
                disabled={editCollegeSaving}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCollegeName}
                disabled={editCollegeSaving}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl transition-colors"
              >
                {editCollegeSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit College Password Confirmation */}
      {editCollegePasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <KeyRound className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Edit College</h2>
            </div>
            <p className="text-neutral-600 mb-6">Enter your admin password to confirm changes.</p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Admin Password</label>
              <div className="relative">
                <input
                  type={showEditCollegePassword ? "text" : "password"}
                  value={editCollegePassword}
                  onChange={(e) => {
                    setEditCollegePassword(e.target.value);
                    setEditCollegeError("");
                  }}
                  placeholder="Enter admin password"
                  className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowEditCollegePassword(!showEditCollegePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showEditCollegePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {editCollegeError && <p className="text-sm text-red-600 mt-2">{editCollegeError}</p>}
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setEditCollegePasswordModal(false);
                  setEditCollegePassword("");
                  setEditCollegeError("");
                }}
                disabled={editCollegeSaving}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveCollege}
                disabled={editCollegeSaving}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl transition-colors"
              >
                {editCollegeSaving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editDepartmentModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <FolderOpen className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Edit Department</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Update the details for <span className="font-bold text-neutral-900">{editDepartmentModal.name}</span>.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Department Name</label>
              <input
                type="text"
                value={editDepartmentNameInput}
                onChange={(e) => {
                  setEditDepartmentNameInput(e.target.value);
                  setEditDepartmentError("");
                }}
                placeholder="Enter department name"
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">College</label>
              <select
                value={editDepartmentCollegeIdInput}
                onChange={(e) => {
                  setEditDepartmentCollegeIdInput(e.target.value);
                  setEditDepartmentError("");
                }}
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              >
                <option value="" disabled>Select College</option>
                {colleges.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {editDepartmentError && <p className="text-sm text-red-600 mt-2">{editDepartmentError}</p>}
            </div>
            <div className="flex gap-4">
              <button
                onClick={closeEditDepartmentModal}
                disabled={editDepartmentSaving}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDepartmentName}
                disabled={editDepartmentSaving}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl transition-colors"
              >
                {editDepartmentSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Department Password Confirmation */}
      {editDepartmentPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <KeyRound className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Confirm Department Edit</h2>
            </div>
            <p className="text-neutral-600 mb-6">Enter your admin password to confirm changes.</p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Admin Password</label>
              <div className="relative">
                <input
                  type={showEditDeptPassword ? "text" : "password"}
                  value={editDepartmentPassword}
                  onChange={(e) => {
                    setEditDepartmentPassword(e.target.value);
                    setEditDepartmentError("");
                  }}
                  placeholder="Enter admin password"
                  className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowEditDeptPassword(!showEditDeptPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showEditDeptPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {editDepartmentError && <p className="text-sm text-red-600 mt-2">{editDepartmentError}</p>}
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setEditDepartmentPasswordModal(false);
                  setEditDepartmentPassword("");
                  setEditDepartmentError("");
                }}
                disabled={editDepartmentSaving}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveDepartment}
                disabled={editDepartmentSaving}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl transition-colors"
              >
                {editDepartmentSaving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteCollegeModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-red-600 mb-6">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Delete College</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Are you sure you want to delete <span className="font-bold text-neutral-900">{deleteCollegeModal.name}</span>? This action cannot be undone.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Admin Password</label>
              <div className="relative">
                <input
                  type={showDeleteCollegePassword ? "text" : "password"}
                  value={deleteCollegePassword}
                  onChange={(e) => {
                    setDeleteCollegePassword(e.target.value);
                    setDeleteCollegePasswordError("");
                  }}
                  placeholder="Enter your admin password"
                  className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-red-500 focus:ring-0 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowDeleteCollegePassword(!showDeleteCollegePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showDeleteCollegePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {deleteCollegePasswordError && (
                <p className="text-sm text-red-600 mt-2">{deleteCollegePasswordError}</p>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setDeleteCollegeModal({ isOpen: false, id: "", name: "" });
                  setDeleteCollegePassword("");
                  setDeleteCollegePasswordError("");
                }}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCollege}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDepartmentModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-red-600 mb-6">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Delete Department</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Are you sure you want to delete <span className="font-bold text-neutral-900">{deleteDepartmentModal.name}</span>? This action cannot be undone.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Admin Password</label>
              <div className="relative">
                <input
                  type={showDeleteDeptPassword ? "text" : "password"}
                  value={deleteDepartmentPassword}
                  onChange={(e) => {
                    setDeleteDepartmentPassword(e.target.value);
                    setDeleteDepartmentPasswordError("");
                  }}
                  placeholder="Enter your admin password"
                  className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-red-500 focus:ring-0 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowDeleteDeptPassword(!showDeleteDeptPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showDeleteDeptPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {deleteDepartmentPasswordError && (
                <p className="text-sm text-red-600 mt-2">{deleteDepartmentPasswordError}</p>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setDeleteDepartmentModal({ isOpen: false, id: "", name: "" });
                  setDeleteDepartmentPassword("");
                  setDeleteDepartmentPasswordError("");
                }}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDepartment}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteFacultyModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-red-600 mb-6">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Delete Faculty</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Are you sure you want to delete <span className="font-bold text-neutral-900">{deleteFacultyModal.name}</span>? This action cannot be undone.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Admin Password</label>
              <div className="relative">
                <input
                  type={showDeleteFacPassword ? "text" : "password"}
                  value={deleteFacultyPassword}
                  onChange={(e) => {
                    setDeleteFacultyPassword(e.target.value);
                    setDeleteFacultyPasswordError("");
                  }}
                  placeholder="Enter your admin password"
                  className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-red-500 focus:ring-0 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowDeleteFacPassword(!showDeleteFacPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showDeleteFacPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {deleteFacultyPasswordError && (
                <p className="text-sm text-red-600 mt-2">{deleteFacultyPasswordError}</p>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setDeleteFacultyModal({ isOpen: false, id: "", name: "" });
                  setDeleteFacultyPassword("");
                  setDeleteFacultyPasswordError("");
                }}
                disabled={deleteFacultyLoading}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFaculty}
                disabled={deleteFacultyLoading}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold rounded-xl transition-colors"
              >
                {deleteFacultyLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create College Password Modal */}
      {createCollegePasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-purple-600 mb-6">
              <div className="p-3 bg-purple-100 rounded-full">
                <Building className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Create College</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Confirm creation of <span className="font-bold text-neutral-900">{collegeName}</span> by entering your admin password.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Admin Password</label>
              <div className="relative">
                <input
                  type={showCreateCollegePassword ? "text" : "password"}
                  value={createCollegePassword}
                  onChange={(e) => {
                    setCreateCollegePassword(e.target.value);
                    setCreateCollegePasswordError("");
                  }}
                  placeholder="Enter your admin password"
                  className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCreateCollegePassword(!showCreateCollegePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showCreateCollegePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {createCollegePasswordError && (
                <p className="text-sm text-red-600 mt-2">{createCollegePasswordError}</p>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setCreateCollegePasswordModal(false);
                  setCreateCollegePassword("");
                  setCreateCollegePasswordError("");
                }}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitCreateCollege}
                disabled={addingCollege}
                className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-bold rounded-xl transition-colors"
              >
                {addingCollege ? "Creating..." : "Create College"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Department Password Modal */}
      {createDeptPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-blue-600 mb-6">
              <div className="p-3 bg-blue-100 rounded-full">
                <Building className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Create Department</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Confirm creation of <span className="font-bold text-neutral-900">{deptName}</span> by entering your admin password.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Admin Password</label>
              <div className="relative">
                <input
                  type={showCreateDeptPassword ? "text" : "password"}
                  value={createDeptPassword}
                  onChange={(e) => {
                    setCreateDeptPassword(e.target.value);
                    setCreateDeptPasswordError("");
                  }}
                  placeholder="Enter your admin password"
                  className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCreateDeptPassword(!showCreateDeptPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showCreateDeptPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {createDeptPasswordError && (
                <p className="text-sm text-red-600 mt-2">{createDeptPasswordError}</p>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setCreateDeptPasswordModal(false);
                  setCreateDeptPassword("");
                  setCreateDeptPasswordError("");
                }}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitCreateDepartment}
                disabled={addingDept}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl transition-colors"
              >
                {addingDept ? "Creating..." : "Create Department"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Faculty Password Modal */}
      {createFacPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-emerald-600 mb-6">
              <div className="p-3 bg-emerald-100 rounded-full">
                <Users className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Create Faculty</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Confirm creation of <span className="font-bold text-neutral-900">{facName}</span> by entering your admin password.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Admin Password</label>
              <div className="relative">
                <input
                  type={showCreateFacPassword ? "text" : "password"}
                  value={createFacPassword}
                  onChange={(e) => {
                    setCreateFacPassword(e.target.value);
                    setCreateFacPasswordError("");
                  }}
                  placeholder="Enter your admin password"
                  className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCreateFacPassword(!showCreateFacPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showCreateFacPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {createFacPasswordError && (
                <p className="text-sm text-red-600 mt-2">{createFacPasswordError}</p>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setCreateFacPasswordModal(false);
                  setCreateFacPassword("");
                  setCreateFacPasswordError("");
                }}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitCreateFaculty}
                disabled={addingFac}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold rounded-xl transition-colors"
              >
                {addingFac ? "Creating..." : "Create Faculty"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editFacultyProfileModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <Users className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Edit Faculty Profile</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Update the profile for <span className="font-bold text-neutral-900">{editFacultyProfileModal.name}</span>.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Full Name</label>
              <input
                type="text"
                value={editFacultyNameInput}
                onChange={(e) => {
                  setEditFacultyNameInput(e.target.value);
                  setEditFacultyProfileError("");
                }}
                placeholder="Enter full name"
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Email Address</label>
              <input
                type="email"
                value={editFacultyEmailInput}
                onChange={(e) => {
                  setEditFacultyEmailInput(e.target.value);
                  setEditFacultyProfileError("");
                }}
                placeholder="Enter email address"
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">College</label>
              <select
                value={editFacultyCollegeInput}
                onChange={(e) => {
                  setEditFacultyCollegeInput(e.target.value);
                  setEditFacultyDepartmentInput(""); // Clear department when college changes
                  setEditFacultyProfileError("");
                }}
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              >
                <option value="">Select a college</option>
                {colleges.map((college) => (
                  <option key={college.id} value={college.id}>
                    {college.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">Department</label>
              <select
                value={editFacultyDepartmentInput}
                onChange={(e) => {
                  setEditFacultyDepartmentInput(e.target.value);
                  setEditFacultyProfileError("");
                }}
                disabled={!editFacultyCollegeInput}
                className="w-full px-4 py-2 border-2 border-neutral-300 rounded-xl disabled:bg-neutral-100 disabled:text-neutral-400 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              >
                <option value="">
                  {editFacultyCollegeInput ? "Select a department" : "Select a college first"}
                </option>
                {editFacultyCollegeInput &&
                  departments
                    .filter((dept) => dept.college_id === editFacultyCollegeInput)
                    .map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
              </select>
            </div>
            {editFacultyProfileError && <p className="text-sm text-red-600 mb-4">{editFacultyProfileError}</p>}
            <div className="flex gap-4">
              <button
                onClick={closeEditFacultyProfileModal}
                disabled={editFacultyProfileSaving}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFacultyProfile}
                disabled={editFacultyProfileSaving}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl transition-colors"
              >
                {editFacultyProfileSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editFacultyPasswordModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <KeyRound className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">
                {editFacultyPasswordSource === "profile" ? "Edit Faculty" : "Set Faculty Password"}
              </h2>
            </div>
            <p className="text-neutral-600 mb-6">
              {editFacultyPasswordSource === "profile" 
                ? `Enter your admin password to confirm editing ${editFacultyPasswordModal.name}.`
                : `Set a new password for ${editFacultyPasswordModal.name}.`
              }
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                {editFacultyPasswordSource === "profile" ? "Admin Password" : "New Password"}
              </label>
              <div className="relative">
                <input
                  type={showFacultyPassword ? "text" : "password"}
                  value={facultyPasswordInput}
                  onChange={(e) => {
                    setFacultyPasswordInput(e.target.value);
                    setFacultyPasswordError("");
                  }}
                  placeholder={editFacultyPasswordSource === "profile" ? "Enter your admin password" : "Enter new password"}
                  className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowFacultyPassword(!showFacultyPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showFacultyPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {facultyPasswordError && (
                <p className="text-sm text-red-600 mt-2">{facultyPasswordError}</p>
              )}
            </div>
            {editFacultyPasswordSource === "faculty" && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-neutral-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showFacultyPasswordConfirm ? "text" : "password"}
                    value={facultyPasswordConfirm}
                    onChange={(e) => {
                      setFacultyPasswordConfirm(e.target.value);
                      setFacultyPasswordError("");
                    }}
                    placeholder="Re-enter new password"
                    className="w-full px-4 py-2 pr-10 border-2 border-neutral-300 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFacultyPasswordConfirm(!showFacultyPasswordConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    {showFacultyPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-4">
              <button
                onClick={closeEditFacultyPasswordModal}
                disabled={facultyPasswordSaving || editFacultyProfileSaving}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editFacultyPasswordSource === "profile" ? confirmSaveFacultyProfile : handleSaveFacultyPassword}
                disabled={facultyPasswordSaving || editFacultyProfileSaving}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl transition-colors"
              >
                {(facultyPasswordSaving || editFacultyProfileSaving) ? "Processing..." : (editFacultyPasswordSource === "profile" ? "Confirm" : "Save Password")}
              </button>
            </div>
          </div>
        </div>
      )}

          </>
        )}
      </div>

      {adminPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <KeyRound className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Admin Settings</h2>
            </div>

            {/* Admin Email for Google OAuth */}
            <div className="mb-8 p-4 bg-neutral-50 rounded-2xl border border-neutral-200">
              <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-3">Admin Google Email</h3>
              <p className="text-xs text-neutral-500 mb-3">
                Set the Google email used for Google Sign-In and password recovery on the admin login page.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={adminEmailInput}
                  onChange={(e) => { setAdminEmailInput(e.target.value); setAdminEmailSuccess(false); }}
                  placeholder="admin@gmail.com"
                  className="flex-1 p-3 border-2 border-neutral-200 rounded-xl bg-white focus:border-indigo-500 focus:ring-0 outline-none transition-colors text-sm"
                />
                <button
                  onClick={handleSaveAdminEmail}
                  disabled={adminEmailSaving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl transition-colors text-sm whitespace-nowrap"
                >
                  {adminEmailSaving ? "Saving..." : "Save"}
                </button>
              </div>
              {adminEmailError && <p className="text-xs text-red-600 mt-2">{adminEmailError}</p>}
              {adminEmailSuccess && <p className="text-xs text-emerald-600 mt-2">Admin email saved successfully.</p>}
            </div>

            {/* Google Account Connection */}
            <div className="mb-8 p-4 bg-neutral-50 rounded-2xl border border-neutral-200">
              <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-3">Google Account Connection</h3>
              <p className="text-xs text-neutral-500 mb-3">
                Connect Google to enable auto-generated Meet links for faculty consultations.
              </p>
              {oauthConnected && !oauthExpired ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-sm font-medium text-emerald-700">Google Connected</span>
                    {googleExpiryLabel && (
                      <span className="text-xs text-neutral-400 ml-auto">Expires {googleExpiryLabel}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConnectDrive}
                      className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors text-sm"
                    >
                      Reconnect
                    </button>
                    <button
                      onClick={handleDisconnectDrive}
                      className="flex-1 px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold rounded-xl transition-colors text-sm"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : oauthExpired ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="text-sm font-medium text-amber-700">Session Expired</span>
                  </div>
                  <button
                    onClick={handleConnectDrive}
                    className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors text-sm"
                  >
                    Reconnect Google
                  </button>
                </div>
              ) : driveMode === "service_account" ? (
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-sm font-medium text-blue-700">Connected via Service Account</span>
                </div>
              ) : (
                <button
                  onClick={handleConnectDrive}
                  className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors text-sm"
                >
                  Connect Google Account
                </button>
              )}
            </div>

            {/* Admin Password */}
            <p className="text-neutral-600 mb-4">
              Enter a new password for the admin account.
            </p>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">New Password</label>
                <div className="relative">
                  <input
                    type={showAdminPassword ? "text" : "password"}
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="Enter new admin password"
                    className="w-full p-3 pr-10 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showAdminPasswordConfirm ? "text" : "password"}
                    value={adminPasswordConfirm}
                    onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                    placeholder="Re-enter admin password"
                    className="w-full p-3 pr-10 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPasswordConfirm(!showAdminPasswordConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    {showAdminPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {adminPasswordError && <p className="text-sm text-red-600">{adminPasswordError}</p>}
            </div>
            <div className="flex gap-4">
              <button
                onClick={closeAdminPasswordModal}
                disabled={adminPasswordSaving}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAdminPassword}
                disabled={adminPasswordSaving}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl transition-colors"
              >
                {adminPasswordSaving ? "Saving..." : "Save Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

