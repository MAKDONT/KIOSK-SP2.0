import type React from "react";
import { useState, useCallback } from "react";

export function useColleges() {
  const [colleges, setColleges] = useState<any[]>([]);
  const [collegeName, setCollegeName] = useState("");
  const [collegeCode, setCollegeCode] = useState("");
  const [addingCollege, setAddingCollege] = useState(false);
  const [collegeError, setCollegeError] = useState("");
  const [editCollegeModal, setEditCollegeModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editCollegeNameInput, setEditCollegeNameInput] = useState("");
  const [editCollegeCodeInput, setEditCollegeCodeInput] = useState("");
  const [editCollegeSaving, setEditCollegeSaving] = useState(false);
  const [editCollegeError, setEditCollegeError] = useState("");
  const [deleteCollegeModal, setDeleteCollegeModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });

  const fetchColleges = useCallback(async (retries = 3) => {
    try {
      const res = await fetch("/api/colleges");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setColleges(data);
        return data;
      }
    } catch (err) {
      console.error(err);
      if (retries > 0) {
        setTimeout(() => fetchColleges(retries - 1), 2000);
      }
    }
    return [];
  }, []);

  const handleAddCollege = useCallback(async (e: React.FormEvent) => {
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
      await fetchColleges();
      alert("College added successfully");
    } catch (err: any) {
      console.error(err);
      setCollegeError(err.message);
    } finally {
      setAddingCollege(false);
    }
  }, [collegeName, collegeCode, fetchColleges]);

  const handleDeleteCollege = useCallback(async () => {
    try {
      const res = await fetch(`/api/colleges/${deleteCollegeModal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete college");
      await fetchColleges();
      setDeleteCollegeModal({ isOpen: false, id: "", name: "" });
    } catch (err: any) {
      alert(err.message);
    }
  }, [deleteCollegeModal.id, fetchColleges]);

  const openEditCollegeModal = useCallback((id: string, name: string, code: string) => {
    setEditCollegeModal({ isOpen: true, id, name });
    setEditCollegeNameInput(name);
    setEditCollegeCodeInput(code || "");
    setEditCollegeError("");
  }, []);

  const closeEditCollegeModal = useCallback(() => {
    setEditCollegeModal({ isOpen: false, id: "", name: "" });
    setEditCollegeNameInput("");
    setEditCollegeCodeInput("");
    setEditCollegeError("");
  }, []);

  const handleSaveCollegeName = useCallback(async () => {
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
      await fetchColleges();
      alert("College updated successfully.");
    } catch (err: any) {
      setEditCollegeError(err.message || "Failed to update college");
    } finally {
      setEditCollegeSaving(false);
    }
  }, [editCollegeModal.id, editCollegeNameInput, editCollegeCodeInput, closeEditCollegeModal, fetchColleges]);

  return {
    colleges,
    collegeName,
    setCollegeName,
    collegeCode,
    setCollegeCode,
    addingCollege,
    collegeError,
    editCollegeModal,
    setEditCollegeModal,
    editCollegeNameInput,
    setEditCollegeNameInput,
    editCollegeCodeInput,
    setEditCollegeCodeInput,
    editCollegeSaving,
    editCollegeError,
    deleteCollegeModal,
    setDeleteCollegeModal,
    fetchColleges,
    handleAddCollege,
    handleDeleteCollege,
    openEditCollegeModal,
    closeEditCollegeModal,
    handleSaveCollegeName,
  };
}
