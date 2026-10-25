import { useState } from "react";
import { useAuth } from "../lib/auth";
import { signInWithGoogle } from "../lib/googleAuth";
import { Navigate, useNavigate } from "react-router-dom";


// Login = Google ONLY (user decision 2026-10-22, OTP-cost reason).
// OTP yahan kabhi nahi bheja jata — OTP sirf ek baar profile setup me
// mobile number verify karne ke liye lagta hai (see phoneVerification.ts).
// Ek baar Google login hone ke baad session device par save rehta hai
// (browserLocalPersistence), to dobara login bhi nahi mangta — sirf
// Logout dabane par dobara login karna padta hai.
export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");


  if (loading) {
    return (
      <div className="page">
        <p className="muted">Load ho raha hai...</p>
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;


  const handleGoogle = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await signInWithGoogle();
      if (result === "cancelled") return;
      // "/" ke gates khud decide karenge: profile nahi hai to /profile,
      // warna seedha Home (permissions gate ke saath).
      navigate("/", { replace: true });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Google sign-in nahi ho paya.",
      );
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="page">
      <img src="/favicon.png" alt="" style={{ width: 96, height: 96 }} />
      <h1>🔧 Mechanic Saathi</h1>
      <p className="muted">
        Driver ki Car SOS request paane ke liye Google se login karo.
        Login par koi OTP nahi lagta — mobile number sirf ek baar profile
        bharte waqt verify hoga.
      </p>
      <button onClick={handleGoogle} disabled={busy}>
        {busy ? "Google se connect ho raha hai..." : "Google se login karo"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
