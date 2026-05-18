import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../data/firebase";

export function LoginPage({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return;

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged in App.tsx will handle the rest
    } catch (err: any) {
      console.error("Firebase Auth Error Details:", err);
      const code = err?.code || "unknown-error";
      const message = err?.message || "";
      
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError(`Invalid email or password. (${code})`);
      } else if (code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(`Login failed: ${code} - ${message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#024042] p-4 sm:p-8 animate-fade-in" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex w-full max-w-[420px] flex-col rounded-2xl bg-white px-8 py-10 shadow-2xl sm:px-10 animate-slide-up-fade">
        
        {/* Logo */}
        <div className="mb-6 flex items-center justify-center">
          <img src="/logo.svg" alt="Tepat Logo" className="h-10 w-auto object-contain" />
        </div>
        
        <h1 className="mb-2 text-center text-[24px] font-semibold text-[#101828]">
          Log in to your account
        </h1>
        <p className="mb-8 text-center text-[14px] text-[#475467]">
          Welcome back! Please enter your details.
        </p>

        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-medium text-[#344054]">Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#D0D5DD] px-3.5 py-2.5 text-[14px] text-[#101828] placeholder:text-[#667085] focus:border-[#027479] focus:outline-none focus:ring-4 focus:ring-[#027479]/10"
              required
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-medium text-[#344054]">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#D0D5DD] py-2.5 pl-3.5 pr-10 text-[14px] text-[#101828] placeholder:text-[#667085] focus:border-[#027479] focus:outline-none focus:ring-4 focus:ring-[#027479]/10"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#667085] hover:text-[#344054]"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          
          {error && <p className="text-[13px] font-medium text-red-600">{error}</p>}

          <div className="mt-2 flex flex-col gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#027479] px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#015c61] focus:outline-none focus:ring-4 focus:ring-[#027479]/10 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 size={16} strokeWidth={2} className="animate-spin" />}
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
