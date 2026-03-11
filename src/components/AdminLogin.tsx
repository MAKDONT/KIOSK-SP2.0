import { useEffect, useState, useRef, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogIn, Shield, KeyRound, Mail, Eye, EyeOff } from "lucide-react";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"login" | "reset_verify" | "reset_form">("login");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const oauthWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    if (localStorage.getItem("user_role") === "admin") {
      navigate("/admin/dashboard");
    }
  }, [navigate]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "ADMIN_LOGIN_SUCCESS") {
        oauthWindowRef.current = null;
        setGoogleLoading(false);
        localStorage.setItem("user_role", "admin");
        navigate("/admin/dashboard");
      } else if (data.type === "ADMIN_LOGIN_ERROR") {
        oauthWindowRef.current = null;
        setGoogleLoading(false);
        setError(data.error || "Google login failed");
      } else if (data.type === "ADMIN_RESET_SUCCESS") {
        oauthWindowRef.current = null;
        setGoogleLoading(false);
        setResetEmail(data.email || "");
        setView("reset_form");
      } else if (data.type === "ADMIN_RESET_ERROR") {
        oauthWindowRef.current = null;
        setGoogleLoading(false);
        setError(data.error || "Google verification failed");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [navigate]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid admin password");

      localStorage.setItem("user_role", "admin");
      navigate("/admin/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/google/login-url");
      const data = await res.json();
      if (!data.url) throw new Error("Failed to get Google login URL");
      const w = 500, h = 600;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      oauthWindowRef.current = window.open(data.url, "AdminGoogleLogin", `width=${w},height=${h},left=${left},top=${top}`);
      if (!oauthWindowRef.current) {
        throw new Error("Popup blocked. Please allow popups and try again.");
      }
    } catch (err: any) {
      setGoogleLoading(false);
      setError(err.message || "Google login failed");
    }
  };

  const handleGoogleReset = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/google/reset-url");
      const data = await res.json();
      if (!data.url) throw new Error("Failed to get Google verification URL");
      const w = 500, h = 600;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      oauthWindowRef.current = window.open(data.url, "AdminGoogleReset", `width=${w},height=${h},left=${left},top=${top}`);
      if (!oauthWindowRef.current) {
        throw new Error("Popup blocked. Please allow popups and try again.");
      }
    } catch (err: any) {
      setGoogleLoading(false);
      setError(err.message || "Google verification failed");
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      setResetSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (resetSuccess) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-6 text-center">
          <div className="inline-flex p-3 bg-emerald-100 rounded-2xl">
            <KeyRound className="w-7 h-7 text-emerald-700" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Password Reset Successful</h1>
          <p className="text-neutral-500">Your admin password has been updated. You can now sign in with your new password.</p>
          <button
            onClick={() => { setView("login"); setResetSuccess(false); setNewPassword(""); setConfirmPassword(""); setError(""); }}
            className="w-full py-4 px-4 bg-red-600 hover:bg-red-700 text-white text-lg font-bold rounded-2xl transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (view === "reset_form") {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-8">
          <button
            onClick={() => { setView("login"); setError(""); }}
            className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>

          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-amber-100 rounded-2xl">
              <KeyRound className="w-7 h-7 text-amber-700" />
            </div>
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Set New Password</h1>
            <p className="text-neutral-500">Verified as <span className="font-semibold text-neutral-700">{resetEmail}</span></p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 chars)"
                  className="w-full p-4 pr-12 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-amber-500 focus:ring-0 outline-none transition-colors"
                  required
                  minLength={6}
                />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700 block">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full p-4 pr-12 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-amber-500 focus:ring-0 outline-none transition-colors"
                  required
                  minLength={6}
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl transition-colors"
            >
              <KeyRound className="w-5 h-5" />
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === "reset_verify") {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-8">
          <button
            onClick={() => { setView("login"); setError(""); }}
            className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>

          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-amber-100 rounded-2xl">
              <KeyRound className="w-7 h-7 text-amber-700" />
            </div>
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Reset Password</h1>
            <p className="text-neutral-500">Verify your identity with Google to reset the admin password.</p>
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button
            onClick={handleGoogleReset}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-4 px-4 bg-white border-2 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-800 text-lg font-bold rounded-2xl transition-all"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? "Verifying..." : "Verify with Google"}
          </button>

          <p className="text-xs text-neutral-400 text-center">
            You must sign in with the same Google account registered as the admin email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-8">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Student Portal
        </button>

        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-red-100 rounded-2xl">
            <Shield className="w-7 h-7 text-red-700" />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Admin Login</h1>
          <p className="text-neutral-500">Administrators sign in here.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700 block">Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-red-500 focus:ring-0 outline-none transition-colors"
              required
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl transition-colors"
          >
            <LogIn className="w-5 h-5" />
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-white text-neutral-400">or</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 py-4 px-4 bg-white border-2 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-800 text-lg font-bold rounded-2xl transition-all"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {googleLoading ? "Signing in..." : "Sign in with Google"}
        </button>

        <div className="text-center">
          <button
            onClick={() => { setView("reset_verify"); setError(""); }}
            className="text-sm text-neutral-500 hover:text-red-600 transition-colors underline underline-offset-2"
          >
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  );
}
