import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogIn, Users } from "lucide-react";
import { getStaffSessionUserId, setStaffSession } from "../staffSession";

export default function StaffLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const staffUserId = getStaffSessionUserId();
    if (staffUserId) {
      navigate(`/faculty/${staffUserId}`);
    }
  }, [navigate]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const normalizedEmail = email.trim();
      const res = await fetch("/api/faculty/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      setStaffSession(String(data.id));
      navigate(`/faculty/${data.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6" style={{ background: 'var(--clay-bg-primary)' }}>
      <div className="max-w-md w-full rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 sm:space-y-8" style={{ background: 'var(--clay-bg-secondary)', boxShadow: '0 4px 20px var(--clay-shadow-soft)' }}>
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 transition-colors" style={{ color: 'var(--clay-text-secondary)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Student Portal
        </button>

        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl" style={{ background: 'rgba(200, 184, 228, 0.2)' }}>
            <Users className="w-7 h-7" style={{ color: 'var(--clay-accent-lavender)' }} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--clay-text-primary)' }}>Staff Login</h1>
          <p style={{ color: 'var(--clay-text-secondary)' }}>Faculty members sign in here.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium block" style={{ color: 'var(--clay-text-primary)' }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="faculty@school.edu"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full p-4 rounded-2xl focus:ring-0 outline-none transition-colors" style={{ borderColor: 'var(--clay-border)', borderWidth: '2px', background: 'var(--clay-bg-secondary)' }}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium block" style={{ color: 'var(--clay-text-primary)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full p-4 rounded-2xl focus:ring-0 outline-none transition-colors" style={{ borderColor: 'var(--clay-border)', borderWidth: '2px', background: 'var(--clay-bg-secondary)' }}
              required
            />
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--clay-accent-soft-coral)' }}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full flex items-center justify-center gap-2 py-4 px-4 text-white text-lg font-bold rounded-2xl transition-colors" style={{ background: 'var(--clay-accent-lavender)' }}
          >
            <LogIn className="w-5 h-5" />
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
