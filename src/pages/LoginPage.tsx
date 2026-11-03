import { useState } from "react";
import { useAuth } from "../lib/auth";
import { signInWithGoogle } from "../lib/googleAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { getLanguage, setLanguage, t, LANGUAGES, type Language } from "../lib/i18n";


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
  const [lang, setLang] = useState<Language>(getLanguage());


  if (loading) {
    return (
      <div className="page">
        <p className="muted">{t("loading")}</p>
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;


  const chooseLanguage = (l: Language) => {
    setLanguage(l);
    setLang(l);
  };

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
        e instanceof Error ? e.message : t("login.googleFail"),
      );
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="page">
      <img src="/favicon.png" alt="" style={{ width: 96, height: 96 }} />
      <h1>🔧 Mechanic Saathi</h1>
      <p className="muted">{t("login.desc")}</p>
      <p className="muted">{t("login.langLabel")}</p>
      <div className="chips">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            className={lang === l.code ? "chip on" : "chip"}
            onClick={() => chooseLanguage(l.code)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <button onClick={handleGoogle} disabled={busy}>
        {busy ? t("login.googleBusy") : t("login.googleBtn")}
      </button>
      {error && <p className="error">{error}</p>}
      <p className="muted small">
        <strong>{t("login.terms")}</strong>
      </p>
      <p className="muted small">
        {t("login.termsNote")}
      </p>
      </div>
  );
}
