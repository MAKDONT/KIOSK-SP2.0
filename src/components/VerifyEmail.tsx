import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    // Get email from sessionStorage or URL params
    const storedEmail = sessionStorage.getItem("registration_email");
    if (storedEmail) {
      setEmail(storedEmail);
    }

    // If token is in URL, auto-verify
    const token = searchParams.get("token");
    const urlEmail = searchParams.get("email");
    if (token && urlEmail) {
      verifyEmailWithToken(token, urlEmail);
    }
  }, [searchParams]);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const verifyEmailWithToken = async (token: string, emailAddr: string) => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/students/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: emailAddr }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Verification failed:", data.error);
        throw new Error(data.error || "Email verification failed");
      }

      // Email verified successfully - show confirmation page with buttons
      console.log("✅ Email verified successfully! Setting verified state...");
      setMessage("✅ Email verified successfully!");
      setError("");
      setVerificationCode(""); // Clear the code field
      
      // Clear registration data
      sessionStorage.removeItem("registration_email");
      
      // Set verified state to show confirmation page with buttons
      setVerified(true);
      console.log("Verified state set to true");
    } catch (err: any) {
      console.error("Verification error:", err);
      setError(err.message || "Verification failed");
      setVerified(false);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyClick = async () => {
    if (!verificationCode.trim()) {
      setError("Please paste the verification code from your email");
      return;
    }

    await verifyEmailWithToken(verificationCode.trim(), email);
  };

  const handleResendEmail = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/students/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to resend verification email");
      }

      setMessage("✉️ Verification email resent! Check your inbox.");
      setResendCountdown(60); // 60 second cooldown
    } catch (err: any) {
      setError(err.message || "Failed to resend email");
    } finally {
      setLoading(false);
    }
  };

  if (verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4 animate-bounce">✅</div>
          <h1 className="text-3xl font-bold text-green-600 mb-3">Email Verified!</h1>
          <p className="text-gray-600 mb-8">Your email has been verified successfully. You're all set to book consultations!</p>
          
          <div className="space-y-3">
            <button
              onClick={() => navigate("/kiosk")}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition transform hover:scale-105"
            >
              Go to Booking Page
            </button>
            
            <button
              onClick={() => navigate("/")}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Verify Your Email</h1>
        <p className="text-gray-600 mb-6">We sent a verification link to:</p>
        
        <div className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-200">
          <p className="text-center font-semibold text-gray-800">{email}</p>
        </div>

        <div className="space-y-4">
          {/* Option 1: Click link in email */}
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
            <p className="text-sm font-semibold text-green-900 mb-2">✓ Easiest Method</p>
            <p className="text-sm text-gray-700">
              Check your email and click the verification link. You'll be automatically verified.
            </p>
          </div>

          {/* Option 2: Paste verification code */}
          <div className="border-t-2 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Or paste the code from your email:</p>
            <textarea
              value={verificationCode}
              onChange={(e) => {
                setVerificationCode(e.target.value);
                setError("");
              }}
              placeholder="Paste verification code here"
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm resize-none"
              disabled={loading}
            />
            
            <button
              onClick={handleVerifyClick}
              disabled={loading || !verificationCode.trim()}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition"
            >
              {loading ? "Verifying..." : "Verify Email"}
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <p className="text-sm text-red-800">❌ {error}</p>
          </div>
        )}

        {/* Success message */}
        {message && (
          <div className="mt-4 bg-green-50 border-l-4 border-green-500 p-4 rounded">
            <p className="text-sm text-green-800">✓ {message}</p>
          </div>
        )}

        {/* Resend button */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 mb-3">Didn't receive the email?</p>
          <button
            onClick={handleResendEmail}
            disabled={loading || resendCountdown > 0}
            className="text-blue-600 hover:text-blue-700 disabled:text-gray-400 font-semibold text-sm transition"
          >
            {resendCountdown > 0
              ? `Resend email in ${resendCountdown}s`
              : "Resend verification email"}
          </button>
        </div>

        {/* Tips */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs text-amber-900 font-semibold mb-2">💡 Tips:</p>
          <ul className="text-xs text-amber-800 space-y-1">
            <li>• Check your spam/junk folder if you don't see the email</li>
            <li>• The verification link expires in 24 hours</li>
            <li>• Verification is required to book consultations</li>
          </ul>
        </div>

        {/* Back to login button */}
        <div className="mt-6">
          <button
            onClick={() => navigate("/")}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
