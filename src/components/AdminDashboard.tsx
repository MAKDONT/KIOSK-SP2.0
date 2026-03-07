import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, LogOut, Plus, Building, UserPlus, ArrowLeft, Trash2, KeyRound, AlertTriangle, Users } from "lucide-react";

interface LiveQueueItem {
  id: number;
  status: "waiting" | "next" | "serving";
  created_at: string;
  faculty_id: string;
  faculty_name: string;
  student_name: string;
  student_number: string;
  time_period?: string | null;
  meet_link?: string | null;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<any[]>([]);
  const [colleges, setColleges] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  
  // College form
  const [collegeName, setCollegeName] = useState("");
  const [collegeCode, setCollegeCode] = useState("");
  const [addingCollege, setAddingCollege] = useState(false);
  const [collegeError, setCollegeError] = useState("");
  
  // Department form
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [deptError, setDeptError] = useState("");
  
  // Faculty form
  const [facName, setFacName] = useState("");
  const [facCollege, setFacCollege] = useState("");
  const [facDept, setFacDept] = useState("");
  const [facEmail, setFacEmail] = useState("");
  const [facPassword, setFacPassword] = useState("");
  const [addingFac, setAddingFac] = useState(false);
  const [facError, setFacError] = useState("");

  // Confirmation Modals
  const [deleteCollegeModal, setDeleteCollegeModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editCollegeModal, setEditCollegeModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editCollegeNameInput, setEditCollegeNameInput] = useState("");
  const [editCollegeCodeInput, setEditCollegeCodeInput] = useState("");
  const [editCollegeSaving, setEditCollegeSaving] = useState(false);
  const [editCollegeError, setEditCollegeError] = useState("");
  const [deleteDepartmentModal, setDeleteDepartmentModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [deleteFacultyModal, setDeleteFacultyModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editDepartmentModal, setEditDepartmentModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editDepartmentNameInput, setEditDepartmentNameInput] = useState("");
  const [editDepartmentCollegeIdInput, setEditDepartmentCollegeIdInput] = useState("");
  const [editDepartmentSaving, setEditDepartmentSaving] = useState(false);
  const [editDepartmentError, setEditDepartmentError] = useState("");
  const [editFacultyProfileModal, setEditFacultyProfileModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editFacultyNameInput, setEditFacultyNameInput] = useState("");
  const [editFacultyEmailInput, setEditFacultyEmailInput] = useState("");
  const [editFacultyProfileSaving, setEditFacultyProfileSaving] = useState(false);
  const [editFacultyProfileError, setEditFacultyProfileError] = useState("");
  const [editFacultyPasswordModal, setEditFacultyPasswordModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [facultyPasswordInput, setFacultyPasswordInput] = useState("");
  const [facultyPasswordConfirm, setFacultyPasswordConfirm] = useState("");
  const [facultyPasswordSaving, setFacultyPasswordSaving] = useState(false);
  const [facultyPasswordError, setFacultyPasswordError] = useState("");
  const [adminPasswordModalOpen, setAdminPasswordModalOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [adminPasswordSaving, setAdminPasswordSaving] = useState(false);
  const [adminPasswordError, setAdminPasswordError] = useState("");

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

  useEffect(() => {
    if (localStorage.getItem("user_role") !== "admin") {
      navigate("/admin/login");
      return;
    }
    fetchDepartments();
    fetchColleges();
    fetchFaculties();
    checkDriveStatus();
    fetchLiveQueue();
  }, [navigate]);

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
    if (localStorage.getItem("user_role") !== "admin") return;

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
        console.error("Admin WS message parse error", err);
      }
    };

    const interval = setInterval(() => {
      fetchLiveQueue(1, true);
    }, 15000);

    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, []);

  const checkDriveStatus = async () => {
    try {
      const res = await fetch(`/api/drive/status`);
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
      console.error("Failed to check drive status", err);
    }
  };

  const fetchLiveQueue = async (retries = 2, silent = false) => {
    if (!silent) setLiveQueueLoading(true);
    try {
      const res = await fetch("/api/admin/queue-monitor");
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
  };

  const sortLiveQueue = (items: LiveQueueItem[]) => {
    const rank = (status: LiveQueueItem["status"]) => {
      if (status === "serving") return 0;
      if (status === "next") return 1;
      return 2;
    };

    return [...items].sort((a, b) => {
      const statusDiff = rank(a.status) - rank(b.status);
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  };

  const fetchLegacyLiveQueue = async (): Promise<LiveQueueItem[]> => {
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
            .filter((item: any) => ["waiting", "next", "serving"].includes(item.status))
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
      console.error('OAuth error:', error);
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
        alert("Your Google OAuth session has expired. Reconnect Google to restore Drive uploads and Meet auto-links.");
      } else if (driveMode === "service_account") {
        alert("Server-side Google integration is managed by environment variables. There is no admin OAuth connection to disconnect.");
      } else {
        alert("No admin Google OAuth connection is currently stored.");
      }
      return;
    }
    if (!confirm("Are you sure you want to disconnect Google? New recordings will not upload and Meet links will not auto-generate until you reconnect.")) return;
    
    try {
      const res = await fetch("/api/drive/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
      await checkDriveStatus();
      alert("Google OAuth disconnected successfully.");
    } catch (err) {
      console.error("Failed to disconnect drive", err);
      alert("Failed to disconnect Google.");
    }
  };

  const fetchFaculties = async (retries = 3) => {
    try {
      const res = await fetch("/api/faculty");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaculties(data);
      }
    } catch (err) {
      console.error(err);
      if (retries > 0) {
        setTimeout(() => fetchFaculties(retries - 1), 2000);
      }
    }
  };

  const fetchColleges = async (retries = 3) => {
    try {
      const res = await fetch("/api/colleges");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setColleges(data);
        if (data.length > 0) {
          setCollegeId(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
      if (retries > 0) {
        setTimeout(() => fetchColleges(retries - 1), 2000);
      }
    }
  };

  const fetchDepartments = async (retries = 3) => {
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDepartments(data);
      }
    } catch (err) {
      console.error(err);
      if (retries > 0) {
        setTimeout(() => fetchDepartments(retries - 1), 2000);
      }
    }
  };

  const handleAddCollege = async (e: React.FormEvent) => {
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

    setAddingCollege(true);
    try {
      const res = await fetch("/api/colleges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: collegeName.trim(), code: collegeCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add college");
      setCollegeName("");
      setCollegeCode("");
      fetchColleges();
      alert("College added successfully");
    } catch (err: any) {
      console.error(err);
      setCollegeError(err.message);
    } finally {
      setAddingCollege(false);
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
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

    setAddingDept(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deptName.trim(), code: deptCode.trim(), college_id: collegeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add department");
      setDeptName("");
      setDeptCode("");
      fetchDepartments();
      alert("Department added successfully");
    } catch (err: any) {
      console.error(err);
      setDeptError(err.message);
    } finally {
      setAddingDept(false);
    }
  };

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setFacError("Password is required.");
      return;
    }
    if (facPassword.trim().length < 6) {
      setFacError("Password must be at least 6 characters long.");
      return;
    }

    setAddingFac(true);
    try {
      const id = crypto.randomUUID();
      const res = await fetch("/api/faculty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: facName.trim(),
          department_id: facDept,
          email: facEmail.trim(),
          password: facPassword.trim()
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add faculty");
      setFacName("");
      setFacCollege("");
      setFacDept("");
      setFacEmail("");
      setFacPassword("");
      fetchFaculties();
      alert("Faculty added successfully");
    } catch (err: any) {
      console.error(err);
      setFacError(err.message);
    } finally {
      setAddingFac(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user_role");
    navigate("/admin/login");
  };

  const handleDeleteCollege = async () => {
    try {
      const res = await fetch(`/api/colleges/${deleteCollegeModal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete college");
      fetchColleges();
      setDeleteCollegeModal({ isOpen: false, id: "", name: "" });
    } catch (err: any) {
      alert(err.message);
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

    setEditCollegeSaving(true);
    setEditCollegeError("");
    try {
      const res = await fetch(`/api/colleges/${editCollegeModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update college name");

      closeEditCollegeModal();
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

    setEditDepartmentSaving(true);
    setEditDepartmentError("");
    try {
      const res = await fetch(`/api/departments/${editDepartmentModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, college_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update department name");

      closeEditDepartmentModal();
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
    try {
      const res = await fetch(`/api/departments/${deleteDepartmentModal.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete department");
      fetchDepartments();
      fetchFaculties();
      setDeleteDepartmentModal({ isOpen: false, id: "", name: "" });
      alert("Department deleted successfully.");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEditFacultyProfileModal = (id: string, name: string, email: string) => {
    setEditFacultyProfileModal({ isOpen: true, id, name });
    setEditFacultyNameInput(name || "");
    setEditFacultyEmailInput(email || "");
    setEditFacultyProfileError("");
  };

  const closeEditFacultyProfileModal = () => {
    setEditFacultyProfileModal({ isOpen: false, id: "", name: "" });
    setEditFacultyNameInput("");
    setEditFacultyEmailInput("");
    setEditFacultyProfileError("");
  };

  const handleSaveFacultyProfile = async () => {
    const name = editFacultyNameInput.trim();
    const email = editFacultyEmailInput.trim();

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

    setEditFacultyProfileSaving(true);
    setEditFacultyProfileError("");
    try {
      const res = await fetch(`/api/faculty/${editFacultyProfileModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update faculty profile");
      closeEditFacultyProfileModal();
      fetchFaculties();
      alert("Faculty profile updated successfully.");
    } catch (err: any) {
      setEditFacultyProfileError(err.message || "Failed to update faculty profile");
    } finally {
      setEditFacultyProfileSaving(false);
    }
  };

  const handleDeleteFaculty = async () => {
    try {
      const res = await fetch(`/api/faculty/${deleteFacultyModal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete faculty");
      fetchFaculties();
      setDeleteFacultyModal({ isOpen: false, id: "", name: "" });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEditFacultyPasswordModal = (id: string, name: string) => {
    setEditFacultyPasswordModal({ isOpen: true, id, name });
    setFacultyPasswordInput("");
    setFacultyPasswordConfirm("");
    setFacultyPasswordError("");
  };

  const closeEditFacultyPasswordModal = () => {
    setEditFacultyPasswordModal({ isOpen: false, id: "", name: "" });
    setFacultyPasswordInput("");
    setFacultyPasswordConfirm("");
    setFacultyPasswordError("");
  };

  const handleSaveFacultyPassword = async () => {
    if (!facultyPasswordInput.trim()) {
      setFacultyPasswordError("Password is required.");
      return;
    }
    if (facultyPasswordInput.trim().length < 6) {
      setFacultyPasswordError("Password must be at least 6 characters long.");
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

  const servingStudents = liveQueue.filter((item) => item.status === "serving");
  const nextStudents = liveQueue.filter((item) => item.status === "next");
  const waitingStudents = liveQueue.filter((item) => item.status === "waiting");
  const filteredDepartments = departments.filter((d: any) => String(d.college_id) === String(facCollege));

  const departmentById = new Map<string, any>((departments || []).map((d: any) => [String(d.id), d]));
  const collegeById = new Map<string, any>((colleges || []).map((c: any) => [String(c.id), c]));
  const facultiesByCollege = (colleges || []).map((college: any) => {
    const items = (faculties || []).filter((fac: any) => {
      const dept = departmentById.get(String(fac.department_id));
      return dept && String(dept.college_id) === String(college.id);
    });
    return { id: String(college.id), name: college.name, items };
  });
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
          <div className="flex items-center gap-2 mr-4 border-r border-neutral-200 pr-4">
            {driveConnected ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="#0066DA"/>
                    <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="#00AC47"/>
                    <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="#EA4335"/>
                    <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="#FFBA00"/>
                  </svg>
                  <span className="text-sm font-medium">
                    {driveMode === "service_account" ? "Drive Connected (Server)" : "Google Connected"}
                  </span>
                </div>
                {oauthConnected && googleExpiryLabel ? (
                  <span className="px-3 py-1.5 bg-neutral-50 text-neutral-600 text-sm font-medium rounded-lg border border-neutral-200">
                    Reconnect by {googleExpiryLabel}
                  </span>
                ) : null}
                <span
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg border ${
                    meetConnected
                      ? "bg-blue-50 text-blue-700 border-blue-100"
                      : "bg-amber-50 text-amber-700 border-amber-100"
                  }`}
                >
                  {meetConnected
                    ? meetMode === "service_account"
                      ? "Meet Auto-Links (Server)"
                      : "Meet Auto-Links Ready"
                    : "Meet Auto-Links Off"}
                </span>
                {!meetConnected ? (
                  <button
                    onClick={handleConnectDrive}
                    className="px-3 py-1.5 bg-white hover:bg-neutral-50 text-neutral-600 text-sm font-medium rounded-lg border border-neutral-200 transition-colors"
                    title="Enable Google Meet auto-links"
                  >
                    Enable Meet Links
                  </button>
                ) : oauthConnected ? (
                  <button
                    onClick={handleDisconnectDrive}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg border border-red-100 transition-colors"
                    title="Disconnect Google OAuth"
                  >
                    Disconnect
                  </button>
                ) : (
                  <span className="px-3 py-1.5 bg-neutral-50 text-neutral-600 text-sm font-medium rounded-lg border border-neutral-200">
                    Managed by server
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {oauthExpired ? (
                  <span className="px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-medium rounded-lg border border-amber-100">
                    Google session expired after {tokenMaxAgeDays} days
                  </span>
                ) : null}
                <button
                  onClick={handleConnectDrive}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-neutral-50 text-neutral-600 rounded-lg border border-neutral-200 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15.3 18.5H5.4L10.3 10L15.3 18.5Z" fill="#0066DA"/>
                    <path d="M8.7 18.5H18.6L13.7 10L8.7 18.5Z" fill="#00AC47"/>
                    <path d="M12 4.5L7.1 13H16.9L12 4.5Z" fill="#EA4335"/>
                    <path d="M12 4.5L2.2 21.5H12L21.8 4.5H12Z" fill="#FFBA00"/>
                  </svg>
                  <span className="text-sm font-medium">{oauthExpired ? "Reconnect Google" : "Connect Google"}</span>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={openAdminPasswordModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
          >
            <KeyRound className="w-4 h-4" /> Edit Admin Password
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

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
              <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm font-medium border border-amber-100">
                Next: {nextStudents.length}
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
                <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-3">Ongoing and Next</h3>
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
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-purple-500 focus:ring-0 outline-none transition-colors"
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
                placeholder="e.g. COE"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-purple-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={addingCollege || !collegeName || !collegeCode}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
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
                  className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-blue-500 focus:ring-0 outline-none transition-colors"
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
                  className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-blue-500 focus:ring-0 outline-none transition-colors"
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
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-blue-500 focus:ring-0 outline-none transition-colors"
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
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-blue-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={addingDept || !deptName || !deptCode}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
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
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
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
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
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
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
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
                placeholder="e.g. aturing@earist.edu.ph"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">
                Password
              </label>
              <input
                type="password"
                value={facPassword}
                onChange={(e) => setFacPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={addingFac || !facName || !facCollege || !facDept || !facEmail || !facPassword}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
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

        {faculties.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-lg p-8 text-center text-neutral-500">
            No faculties registered yet.
          </div>
        ) : (
          <>
            {facultiesByCollege.map((group) => (
              <div key={group.id} className="bg-white rounded-3xl shadow-lg p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-neutral-900">{group.name}</h3>
                  <span className="px-3 py-1 rounded-lg bg-neutral-100 text-neutral-600 text-sm font-medium">
                    {group.items.length} faculty
                  </span>
                </div>
                {group.items.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-neutral-50 text-neutral-500 text-sm border border-neutral-200">
                    No faculty registered for this college.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b-2 border-neutral-100">
                          <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Name</th>
                          <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Email</th>
                          <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Faculty Code</th>
                          <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Department</th>
                          <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Status</th>
                          <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {group.items.map((fac: any) => (
                          <tr key={fac.id} className="hover:bg-neutral-50 transition-colors group">
                            <td className="py-4 px-4 font-medium text-neutral-900">{fac.name}</td>
                            <td className="py-4 px-4 text-neutral-600">{fac.email}</td>
                            <td className="py-4 px-4 font-mono text-sm text-neutral-500">{fac.faculty_code}</td>
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
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEditFacultyProfileModal(fac.id, fac.name, fac.email)}
                                  className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                  title="Edit Faculty Profile"
                                >
                                  Edit Info
                                </button>
                                <button
                                  onClick={() => openEditFacultyPasswordModal(fac.id, fac.name)}
                                  className="p-2 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Edit Password"
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
                        <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Faculty Code</th>
                        <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Department</th>
                        <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm">Status</th>
                        <th className="py-4 px-4 font-bold text-neutral-600 uppercase tracking-wider text-sm text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {unassignedCollegeFaculties.map((fac: any) => (
                        <tr key={fac.id} className="hover:bg-neutral-50 transition-colors group">
                          <td className="py-4 px-4 font-medium text-neutral-900">{fac.name}</td>
                          <td className="py-4 px-4 text-neutral-600">{fac.email}</td>
                          <td className="py-4 px-4 font-mono text-sm text-neutral-500">{fac.faculty_code}</td>
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
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => openEditFacultyProfileModal(fac.id, fac.name, fac.email)}
                                className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                title="Edit Faculty Profile"
                              >
                                Edit Info
                              </button>
                              <button
                                onClick={() => openEditFacultyPasswordModal(fac.id, fac.name)}
                                className="p-2 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit Password"
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
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Edit College</h2>
            <p className="text-neutral-600 mb-6">
              Update the details for <span className="font-bold text-neutral-900">{editCollegeModal.name}</span>.
            </p>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">College Name</label>
                <input
                  type="text"
                  value={editCollegeNameInput}
                  onChange={(e) => setEditCollegeNameInput(e.target.value)}
                  placeholder="Enter college name"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">College Code</label>
                <input
                  type="text"
                  value={editCollegeCodeInput}
                  onChange={(e) => setEditCollegeCodeInput(e.target.value)}
                  placeholder="Enter college code"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
              </div>
              {editCollegeError && <p className="text-sm text-red-600">{editCollegeError}</p>}
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

      {editDepartmentModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Edit Department</h2>
            <p className="text-neutral-600 mb-6">
              Update the details for <span className="font-bold text-neutral-900">{editDepartmentModal.name}</span>.
            </p>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">Department Name</label>
                <input
                  type="text"
                  value={editDepartmentNameInput}
                  onChange={(e) => setEditDepartmentNameInput(e.target.value)}
                  placeholder="Enter department name"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">College</label>
                <select
                  value={editDepartmentCollegeIdInput}
                  onChange={(e) => setEditDepartmentCollegeIdInput(e.target.value)}
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                >
                  <option value="" disabled>Select College</option>
                  {colleges.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {editDepartmentError && <p className="text-sm text-red-600">{editDepartmentError}</p>}
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

      {deleteCollegeModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-red-600 mb-6">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Delete College</h2>
            </div>
            <p className="text-neutral-600 mb-8">
              Are you sure you want to delete <span className="font-bold text-neutral-900">{deleteCollegeModal.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteCollegeModal({ isOpen: false, id: "", name: "" })}
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
            <p className="text-neutral-600 mb-8">
              Are you sure you want to delete <span className="font-bold text-neutral-900">{deleteDepartmentModal.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteDepartmentModal({ isOpen: false, id: "", name: "" })}
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
            <p className="text-neutral-600 mb-8">
              Are you sure you want to delete <span className="font-bold text-neutral-900">{deleteFacultyModal.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteFacultyModal({ isOpen: false, id: "", name: "" })}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFaculty}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {editFacultyProfileModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Edit Faculty Profile</h2>
            <p className="text-neutral-600 mb-6">
              Update the profile for <span className="font-bold text-neutral-900">{editFacultyProfileModal.name}</span>.
            </p>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">Full Name</label>
                <input
                  type="text"
                  value={editFacultyNameInput}
                  onChange={(e) => setEditFacultyNameInput(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">Email Address</label>
                <input
                  type="email"
                  value={editFacultyEmailInput}
                  onChange={(e) => setEditFacultyEmailInput(e.target.value)}
                  placeholder="Enter email address"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
              </div>
              {editFacultyProfileError && <p className="text-sm text-red-600">{editFacultyProfileError}</p>}
            </div>
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
              <h2 className="text-2xl font-bold text-neutral-900">Edit Faculty Password</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Set a new password for <span className="font-bold text-neutral-900">{editFacultyPasswordModal.name}</span>.
            </p>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">New Password</label>
                <input
                  type="password"
                  value={facultyPasswordInput}
                  onChange={(e) => setFacultyPasswordInput(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">Confirm Password</label>
                <input
                  type="password"
                  value={facultyPasswordConfirm}
                  onChange={(e) => setFacultyPasswordConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
              </div>
              {facultyPasswordError && <p className="text-sm text-red-600">{facultyPasswordError}</p>}
            </div>
            <div className="flex gap-4">
              <button
                onClick={closeEditFacultyPasswordModal}
                disabled={facultyPasswordSaving}
                className="flex-1 py-3 px-4 bg-neutral-100 hover:bg-neutral-200 disabled:bg-neutral-200 text-neutral-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFacultyPassword}
                disabled={facultyPasswordSaving}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl transition-colors"
              >
                {facultyPasswordSaving ? "Saving..." : "Save Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {adminPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-4 text-indigo-600 mb-6">
              <div className="p-3 bg-indigo-100 rounded-full">
                <KeyRound className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900">Edit Admin Password</h2>
            </div>
            <p className="text-neutral-600 mb-6">
              Enter a new password for the admin account.
            </p>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">New Password</label>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Enter new admin password"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 block">Confirm Password</label>
                <input
                  type="password"
                  value={adminPasswordConfirm}
                  onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                  placeholder="Re-enter admin password"
                  className="w-full p-3 border-2 border-neutral-200 rounded-xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
                />
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
