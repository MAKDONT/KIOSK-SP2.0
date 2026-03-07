import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogIn, Users } from "lucide-react";

export default function StaffLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (localStorage.getItem("user_role") === "staff" && localStorage.getItem("user_id")) {
      navigate(`/faculty/${localStorage.getItem("user_id")}`);
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

      localStorage.setItem("user_role", "staff");
      localStorage.setItem("user_id", data.id);
      navigate(`/faculty/${data.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

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
          <div className="inline-flex p-3 bg-indigo-100 rounded-2xl">
            <Users className="w-7 h-7 text-indigo-700" />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Staff Login</h1>
          <p className="text-neutral-500">Faculty members sign in here.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700 block">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="faculty@school.edu"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full p-4 border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus:border-indigo-500 focus:ring-0 outline-none transition-colors"
              required
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl transition-colors"
          >
            <LogIn className="w-5 h-5" />
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
