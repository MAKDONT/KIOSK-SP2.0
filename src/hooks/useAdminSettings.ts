import { useState, useCallback } from "react";

export function useAdminSettings() {
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [adminPasswordSaving, setAdminPasswordSaving] = useState(false);
  const [adminPasswordError, setAdminPasswordError] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [adminEmailSaving, setAdminEmailSaving] = useState(false);
  const [adminEmailError, setAdminEmailError] = useState("");
  const [adminEmailSuccess, setAdminEmailSuccess] = useState(false);
  const [adminPasswordModalOpen, setAdminPasswordModalOpen] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const fetchAdminEmail = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email");
      const data = await res.json();
      setAdminEmail(data.email || "");
    } catch {
      // ignore
    }
  }, []);

  const handleSaveAdminPassword = useCallback(async () => {
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
  }, [adminPasswordInput, adminPasswordConfirm]);

  const handleSaveAdminEmail = useCallback(async () => {
    const email = adminEmailInput.trim().toLowerCase();
    if (!email) {
      setAdminEmailError("Email is required.");
      return;
    }
    if (!validateEmail(email)) {
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
  }, [adminEmailInput]);

  const openAdminPasswordModal = useCallback(() => {
    setAdminPasswordInput("");
    setAdminPasswordConfirm("");
    setAdminPasswordError("");
    setAdminEmailInput(adminEmail);
    setAdminEmailError("");
    setAdminEmailSuccess(false);
    setAdminPasswordModalOpen(true);
  }, [adminEmail]);

  const closeAdminPasswordModal = useCallback(() => {
    setAdminPasswordModalOpen(false);
    setAdminPasswordInput("");
    setAdminPasswordConfirm("");
    setAdminPasswordError("");
  }, []);

  return {
    adminPassword,
    setAdminPassword,
    adminPasswordInput,
    setAdminPasswordInput,
    adminPasswordConfirm,
    setAdminPasswordConfirm,
    adminPasswordSaving,
    adminPasswordError,
    adminEmail,
    setAdminEmail,
    adminEmailInput,
    setAdminEmailInput,
    adminEmailSaving,
    adminEmailError,
    adminEmailSuccess,
    setAdminEmailSuccess,
    adminPasswordModalOpen,
    setAdminPasswordModalOpen,
    fetchAdminEmail,
    handleSaveAdminPassword,
    handleSaveAdminEmail,
    openAdminPasswordModal,
    closeAdminPasswordModal,
  };
}
