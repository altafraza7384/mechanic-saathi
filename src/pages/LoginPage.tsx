import { useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import type { ConfirmationResult } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { Navigate, useNavigate } from "react-router-dom";

declare global {
  interface Window {
    __msRecaptcha?: RecaptchaVerifier;
  }
}

function getRecaptcha(): RecaptchaVerifier {
  if (!window.__msRecaptcha) {
    window.__msRecaptcha = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
    });
  }
  return window.__msRecaptcha;
}

export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // OTP-cost guard: pehle se logged-in mechanic ko OTP form kabhi mat
  // dikhao — warna galti se dobara "OTP bhejo" dabne par ek aur SMS ka
  // kharcha lagta. Logged-in user seedha Home flow me jata hai (profile
  // na ho to RequireProfile use /profile bhej dega).
  if (loading) {
    return (
      <div className="page">
        <p className="muted">Load ho raha hai...</p>
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  const sendCode = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Sahi 10-digit mobile number daalo.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const full = digits.length === 10 ? `+91${digits}` : `+${digits}`;
      const result = await signInWithPhoneNumber(auth, full, getRecaptcha());
      setConfirm(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "OTP bhejne me problem hui.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!confirm || code.trim().length < 4) return;
    setBusy(true);
    setError("");
    try {
      await confirm.confirm(code.trim());
      navigate("/profile", { replace: true });
    } catch {
      setError("Galat OTP. Dobara try karo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>🔧 Mechanic Saathi</h1>
      <p className="muted">
        Driver ki Car SOS request paane ke liye apne mobile se login karo.
      </p>
      <div id="recaptcha-container" />
      {!confirm ? (
        <>
          <label>Mobile number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
          />
          <button onClick={sendCode} disabled={busy}>
            {busy ? "Bhej rahe hain..." : "OTP bhejo"}
          </button>
        </>
      ) : (
        <>
          <label>OTP daalo</label>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit OTP"
          />
          <button onClick={verifyCode} disabled={busy}>
            {busy ? "Check kar rahe hain..." : "Verify karo"}
          </button>
          <button className="ghost" onClick={() => setConfirm(null)}>
            Number badlo
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
