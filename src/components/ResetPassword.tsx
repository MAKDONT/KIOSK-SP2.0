import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Lock, CheckCircle, AlertCircle } from "lucide-react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);

  useEffect(() => {
    // Validate token on mount
    if (!token || !email) {
      setError("Invalid password reset link. Missing token or email.");
      setValidating(false);
      return;
    }
    setIsValidToken(true);
    setValidating(false);
  }, [token, email]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!password.trim()) {
      setError("Password is required");
      return;
    }

    if (password.length < 4) {
      setError("Password must be at least 4 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/students/reset-password/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email,
          password: password.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to reset password");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #faf8f5 50%, #f0ebe5 100%)' }}>
        <div className="text-center">
          <p style={{ color: 'var(--clay-text-secondary)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #faf8f5 50%, #f0ebe5 100%)' }}>
        <div className="w-full max-w-md rounded-3xl p-8 sm:p-12 card">
          <div className="flex justify-center mb-6">
            <AlertCircle className="w-16 h-16" style={{ color: 'var(--clay-accent-soft-coral)' }} />
          </div>
          <h1 className="text-3xl font-bold text-center mb-6" style={{ color: 'var(--clay-text-primary)' }}>
            Invalid Link
          </h1>
          <p className="text-lg text-center mb-8" style={{ color: 'var(--clay-text-secondary)' }}>
            The password reset link is invalid or has expired. Please request a new password reset.
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full py-4 px-6 text-xl font-bold rounded-2xl transition-all active:scale-95 btn btn-primary"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #faf8f5 50%, #f0ebe5 100%)' }}>
        <div className="w-full max-w-md rounded-3xl p-8 sm:p-12 card">
          <div className="flex justify-center mb-6">
            <CheckCircle className="w-16 h-16" style={{ color: '#a8d5ba' }} />
          </div>
          <h1 className="text-3xl font-bold text-center mb-6" style={{ color: 'var(--clay-text-primary)' }}>
            Password Reset Successful
          </h1>
          <p className="text-lg text-center mb-8" style={{ color: 'var(--clay-text-secondary)' }}>
            Your password has been successfully reset. You will be redirected to the login page in a few seconds.
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full py-4 px-6 text-xl font-bold rounded-2xl transition-all active:scale-95 btn btn-primary"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #f5f1ed 0%, #faf8f5 50%, #f0ebe5 100%)' }}>
      <div className="w-full max-w-md rounded-3xl p-8 sm:p-12 space-y-8 card">
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-4">
            <Lock className="w-12 h-12" style={{ color: 'var(--clay-accent-warm)' }} />
          </div>
          <h1 className="text-4xl font-bold" style={{ color: 'var(--clay-text-primary)' }}>
            Reset Password
          </h1>
          <p className="text-xl" style={{ color: 'var(--clay-text-secondary)' }}>
            Enter your new password
          </p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-6">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New Password"
            className="w-full p-5 border-3 rounded-2xl outline-none transition-colors text-xl font-semibold"
            style={{
              borderColor: 'var(--clay-border)',
              background: 'var(--clay-bg-secondary)',
              color: 'var(--clay-text-primary)'
            }}
            disabled={loading}
            required
          />

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm Password"
            className="w-full p-5 border-3 rounded-2xl outline-none transition-colors text-xl font-semibold"
            style={{
              borderColor: 'var(--clay-border)',
              background: 'var(--clay-bg-secondary)',
              color: 'var(--clay-text-primary)'
            }}
            disabled={loading}
            required
          />

          {error && (
            <p className="text-lg text-center font-semibold p-4 rounded-2xl" style={{
              color: 'white',
              background: 'linear-gradient(135deg, #e8b4a8 0%, #d99f88 100%)'
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="w-full py-6 px-6 text-2xl font-bold rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed btn btn-primary min-h-[60px]"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full py-4 px-6 text-lg font-bold rounded-2xl transition-all"
            style={{
              background: 'transparent',
              color: 'var(--clay-text-secondary)',
              border: '2px solid var(--clay-border)',
              cursor: 'pointer'
            }}
          >
            Back to Login
          </button>
        </form>
      </div>
    </div>
  );
}
