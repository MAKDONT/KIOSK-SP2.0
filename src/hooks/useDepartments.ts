import React, { useState, useCallback } from "react";

export function useDepartments(colleges: any[]) {
  const [departments, setDepartments] = useState<any[]>([]);
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [deptError, setDeptError] = useState("");
  const [editDepartmentModal, setEditDepartmentModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [editDepartmentNameInput, setEditDepartmentNameInput] = useState("");
  const [editDepartmentCollegeIdInput, setEditDepartmentCollegeIdInput] = useState("");
  const [editDepartmentSaving, setEditDepartmentSaving] = useState(false);
  const [editDepartmentError, setEditDepartmentError] = useState("");
  const [deleteDepartmentModal, setDeleteDepartmentModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });

  const fetchDepartments = useCallback(async (retries = 3) => {
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDepartments(data);
        // Set default college if not set and colleges available
        if (!collegeId && colleges.length > 0) {
          setCollegeId(colleges[0].id);
        }
        return data;
      }
    } catch (err) {
      console.error(err);
      if (retries > 0) {
        setTimeout(() => fetchDepartments(retries - 1), 2000);
      }
    }
    return [];
  }, [colleges, collegeId]);

  const handleAddDepartment = useCallback(async (e: React.FormEvent) => {
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
      await fetchDepartments();
      alert("Department added successfully");
    } catch (err: any) {
      console.error(err);
      setDeptError(err.message);
    } finally {
      setAddingDept(false);
    }
  }, [deptName, deptCode, collegeId, fetchDepartments]);

  const handleDeleteDepartment = useCallback(async () => {
    try {
      const res = await fetch(`/api/departments/${deleteDepartmentModal.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete department");
      await fetchDepartments();
      setDeleteDepartmentModal({ isOpen: false, id: "", name: "" });
      alert("Department deleted successfully.");
    } catch (err: any) {
      alert(err.message);
    }
  }, [deleteDepartmentModal.id, fetchDepartments]);

  const openEditDepartmentModal = useCallback((id: string, name: string, collegeId: string) => {
    setEditDepartmentModal({ isOpen: true, id, name });
    setEditDepartmentNameInput(name);
    setEditDepartmentCollegeIdInput(String(collegeId || ""));
    setEditDepartmentError("");
  }, []);

  const closeEditDepartmentModal = useCallback(() => {
    setEditDepartmentModal({ isOpen: false, id: "", name: "" });
    setEditDepartmentNameInput("");
    setEditDepartmentCollegeIdInput("");
    setEditDepartmentError("");
  }, []);

  const handleSaveDepartmentName = useCallback(async () => {
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
      await fetchDepartments();
      alert("Department updated successfully.");
    } catch (err: any) {
      setEditDepartmentError(err.message || "Failed to update department");
    } finally {
      setEditDepartmentSaving(false);
    }
  }, [editDepartmentModal.id, editDepartmentNameInput, editDepartmentCollegeIdInput, closeEditDepartmentModal, fetchDepartments]);

  return {
    departments,
    deptName,
    setDeptName,
    deptCode,
    setDeptCode,
    collegeId,
    setCollegeId,
    addingDept,
    deptError,
    editDepartmentModal,
    setEditDepartmentModal,
    editDepartmentNameInput,
    setEditDepartmentNameInput,
    editDepartmentCollegeIdInput,
    setEditDepartmentCollegeIdInput,
    editDepartmentSaving,
    editDepartmentError,
    deleteDepartmentModal,
    setDeleteDepartmentModal,
    fetchDepartments,
    handleAddDepartment,
    handleDeleteDepartment,
    openEditDepartmentModal,
    closeEditDepartmentModal,
    handleSaveDepartmentName,
  };
}
