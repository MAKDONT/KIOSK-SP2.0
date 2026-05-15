import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Lock, CheckCircle, AlertCircle } from "lucide-react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);

  useEffect(() => {
    // Validate token on mount
    if (!token || !email) {
      setError("Invalid PIN reset link. Missing token or email.");
      setValidating(false);
      return;
    }
    setIsValidToken(true);
    setValidating(false);
  }, [token, email]);

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!pin.trim()) {
      setError("PIN is required");
      return;
    }

    // PIN must be 4-6 digits
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must be between 4-6 digits");
      return;
    }

    if (pin !== confirmPin) {
      setError("PINs do not match");
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
          password: pin.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to reset PIN");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setPin("");
      setConfirmPin("");

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Failed to reset PIN");
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
            The PIN reset link is invalid or has expired. Please request a new PIN reset.
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
            PIN Reset Successful
          </h1>
          <p className="text-lg text-center mb-8" style={{ color: 'var(--clay-text-secondary)' }}>
            Your PIN has been successfully reset. You will be redirected to the login page in a few seconds.
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
            Reset PIN
          </h1>
          <p className="text-xl" style={{ color: 'var(--clay-text-secondary)' }}>
            Enter your new PIN (4-6 digits)
          </p>
        </div>

        <form onSubmit={handleResetPin} className="space-y-6">
          <input
            type="text"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="New PIN (4-6 digits)"
            maxLength={6}
            inputMode="numeric"
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
            type="text"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            placeholder="Confirm PIN (4-6 digits)"
            maxLength={6}
            inputMode="numeric"
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
            disabled={loading || !pin || !confirmPin}
            className="w-full py-6 px-6 text-2xl font-bold rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed btn btn-primary min-h-[60px]"
          >
            {loading ? "Resetting..." : "Reset PIN"}
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
