import React, { useState, useCallback } from "react";

export function useFaculties() {
  const [faculties, setFaculties] = useState<any[]>([]);
  const [facName, setFacName] = useState("");
  const [facCollege, setFacCollege] = useState("");
  const [facDept, setFacDept] = useState("");
  const [facEmail, setFacEmail] = useState("");
  const [facPassword, setFacPassword] = useState("");
  const [addingFac, setAddingFac] = useState(false);
  const [facError, setFacError] = useState("");
  const [facultySearch, setFacultySearch] = useState("");
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
  const [deleteFacultyModal, setDeleteFacultyModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });

  const fetchFaculties = useCallback(async (retries = 3) => {
    try {
      const res = await fetch("/api/faculty");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFaculties(data);
        return data;
      }
    } catch (err) {
      console.error(err);
      if (retries > 0) {
        setTimeout(() => fetchFaculties(retries - 1), 2000);
      }
    }
    return [];
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const handleAddFaculty = useCallback(async (e: React.FormEvent) => {
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
    if (!validateEmail(facEmail)) {
      setFacError("Please enter a valid email address.");
      return;
    }
    if (!facPassword.trim()) {
      setFacError("Password is required.");
      return;
    }
    if (facPassword.trim().length < 8) {
      setFacError("Password must be at least 8 characters long.");
      return;
    }
    if (!/[a-zA-Z]/.test(facPassword) || !/[0-9]/.test(facPassword)) {
      setFacError("Password must contain both letters and numbers (alphanumeric).");
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
          password: facPassword.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add faculty");
      setFacName("");
      setFacCollege("");
      setFacDept("");
      setFacEmail("");
      setFacPassword("");
      await fetchFaculties();
      alert("Faculty added successfully");
    } catch (err: any) {
      console.error(err);
      setFacError(err.message);
    } finally {
      setAddingFac(false);
    }
  }, [facName, facCollege, facDept, facEmail, facPassword, fetchFaculties]);

  const openEditFacultyProfileModal = useCallback((id: string, name: string, email: string) => {
    setEditFacultyProfileModal({ isOpen: true, id, name });
    setEditFacultyNameInput(name || "");
    setEditFacultyEmailInput(email || "");
    setEditFacultyProfileError("");
  }, []);

  const closeEditFacultyProfileModal = useCallback(() => {
    setEditFacultyProfileModal({ isOpen: false, id: "", name: "" });
    setEditFacultyNameInput("");
    setEditFacultyEmailInput("");
    setEditFacultyProfileError("");
  }, []);

  const handleSaveFacultyProfile = useCallback(async () => {
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
    if (!validateEmail(email)) {
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
      await fetchFaculties();
      alert("Faculty profile updated successfully.");
    } catch (err: any) {
      setEditFacultyProfileError(err.message || "Failed to update faculty profile");
    } finally {
      setEditFacultyProfileSaving(false);
    }
  }, [editFacultyProfileModal.id, editFacultyNameInput, editFacultyEmailInput, closeEditFacultyProfileModal, fetchFaculties]);

  const openEditFacultyPasswordModal = useCallback((id: string, name: string) => {
    setEditFacultyPasswordModal({ isOpen: true, id, name });
    setFacultyPasswordInput("");
    setFacultyPasswordConfirm("");
    setFacultyPasswordError("");
  }, []);

  const closeEditFacultyPasswordModal = useCallback(() => {
    setEditFacultyPasswordModal({ isOpen: false, id: "", name: "" });
    setFacultyPasswordInput("");
    setFacultyPasswordConfirm("");
    setFacultyPasswordError("");
  }, []);

  const handleSaveFacultyPassword = useCallback(async () => {
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
  }, [editFacultyPasswordModal.id, facultyPasswordInput, facultyPasswordConfirm, closeEditFacultyPasswordModal]);

  // NOTE: handleDeleteFaculty is now implemented in AdminDashboard.tsx with proper password handling
  // This hook no longer handles deletion - use the AdminDashboard implementation instead

  return {
    faculties,
    facName,
    setFacName,
    facCollege,
    setFacCollege,
    facDept,
    setFacDept,
    facEmail,
    setFacEmail,
    facPassword,
    setFacPassword,
    addingFac,
    facError,
    facultySearch,
    setFacultySearch,
    editFacultyProfileModal,
    setEditFacultyProfileModal,
    editFacultyNameInput,
    setEditFacultyNameInput,
    editFacultyEmailInput,
    setEditFacultyEmailInput,
    editFacultyProfileSaving,
    editFacultyProfileError,
    editFacultyPasswordModal,
    setEditFacultyPasswordModal,
    facultyPasswordInput,
    setFacultyPasswordInput,
    facultyPasswordConfirm,
    setFacultyPasswordConfirm,
    facultyPasswordSaving,
    facultyPasswordError,
    deleteFacultyModal,
    setDeleteFacultyModal,
    fetchFaculties,
    handleAddFaculty,
    handleSaveFacultyProfile,
    openEditFacultyProfileModal,
    closeEditFacultyProfileModal,
    handleSaveFacultyPassword,
    openEditFacultyPasswordModal,
    closeEditFacultyPasswordModal,
  };
}
