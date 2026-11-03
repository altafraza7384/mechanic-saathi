import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import type { ConfirmationResult } from "firebase/auth";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { CATEGORIES, type CarSosCategory } from "../lib/types";
import { encodeGeohash } from "../lib/geohash";
import {
  confirmPhoneVerification,
  normalizePhone,
  sendPhoneVerification,
} from "../lib/phoneVerification";
import { useNavigate } from "react-router-dom";
import { t } from "../lib/i18n";

async function captureLocation(): Promise<{ lat: number; lng: number }> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    // fall through to browser geolocation
  }
  if (navigator.geolocation) {
    return await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (p) =>
          resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject(new Error("gps")),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }
  throw new Error("gps");
}

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.name ?? "");
  const [shopName, setShopName] = useState(profile?.shopName ?? "");
  const [cats, setCats] = useState<CarSosCategory[]>(profile?.categories ?? []);
  const [charges, setCharges] = useState(profile?.charges ?? "");
  const [hours, setHours] = useState(profile?.workingHours ?? "");
  const [radius, setRadius] = useState(profile?.serviceRadiusKm ?? 10);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(
    profile?.lat !== null && profile?.lat !== undefined && profile?.lng !== null && profile?.lng !== undefined
      ? { lat: profile.lat, lng: profile.lng }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // ---- One-time phone verification (the ONLY OTP in the app) ----
  // Login is Google-only and never sends an SMS. The mobile number is
  // verified once — by OTP when it works, or manually by the admin
  // (the admin calls the number, then marks it verified in the admin
  // panel). A profile can be saved with an unverified number; it stays
  // pending until the admin verifies it. Changing the number later
  // requires fresh verification for the new number; leaving an
  // already-verified number untouched needs no OTP at all.
  const initialVerified: string | null =
    profile?.phoneVerified && profile.phone
      ? profile.phone
      : profile?.phone && user?.phoneNumber === profile.phone
        ? profile.phone
        : null;
  const [phone, setPhone] = useState(profile?.phone?.replace(/^\+91/, "") ?? "");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(
    initialVerified,
  );
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmationResult | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");

  const isPhoneVerified =
    verifiedPhone !== null && normalizePhone(phone) === verifiedPhone;

  const toggleCat = (c: CarSosCategory) =>
    setCats((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  const sendOtp = async () => {
    const full = normalizePhone(phone);
    if (!full) {
      setError(t("profile.errPhone"));
      return;
    }
    setSending(true);
    setError("");
    setVerifyMsg("");
    try {
      const result = await sendPhoneVerification(full);
      setPendingPhone(full);
      setConfirm(result);
      setVerifyMsg(t("profile.otpSentMsg"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("profile.errOtpSend"));
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    if (!confirm || code.trim().length < 4) return;
    setVerifying(true);
    setError("");
    try {
      await confirmPhoneVerification(confirm, code.trim());
      if (pendingPhone) setVerifiedPhone(pendingPhone);
      setConfirm(null);
      setCode("");
      setPendingPhone(null);
      setVerifyMsg(t("profile.verifiedMsg"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("profile.errOtpWrong"));
    } finally {
      setVerifying(false);
    }
  };

  const save = async () => {
    if (!user) return;
    if (!name.trim() || !shopName.trim() || cats.length === 0) {
      setError(t("profile.errForm"));
      return;
    }
    const fullPhone = normalizePhone(phone);
    if (!fullPhone) {
      setError(t("profile.errPhone"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setDoc(
        doc(db, "mechanics", user.uid),
        {
          name: name.trim(),
          shopName: shopName.trim(),
          // OTP-verified number when verified, otherwise the typed number
          // as pending — the admin verifies pending numbers by calling.
          phone: isPhoneVerified && verifiedPhone ? verifiedPhone : fullPhone,
          phoneVerified: isPhoneVerified && verifiedPhone ? true : false,
          phoneVerifiedAt:
            isPhoneVerified && verifiedPhone
              ? profile?.phoneVerifiedAt && profile.phone === verifiedPhone
                ? profile.phoneVerifiedAt
                : new Date().toISOString()
              : null,
          categories: cats,
          charges: charges.trim() || null,
          workingHours: hours.trim() || null,
          lat: loc ? loc.lat : null,
          lng: loc ? loc.lng : null,
          geohash: loc ? encodeGeohash(loc.lat, loc.lng, 7) : null,
          serviceRadiusKm: radius,
          isOnline: profile?.isOnline ?? false,
          // isVerified is admin-managed and must never be written by the app:
          // including it here denied the very first save (create rule blocks it).
          rating: profile?.rating ?? null,
          totalJobs: profile?.totalJobs ?? 0,
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
      await refreshProfile();
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("profile.errSave"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>{t("profile.title")}</h1>
      <p className="muted">
        {t("profile.desc")}
      </p>
      <h2>{t("profile.secIdentity")}</h2>
      <label>{t("profile.name")}</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>{t("profile.shop")}</label>
      <input value={shopName} onChange={(e) => setShopName(e.target.value)} />
      <label>{t("profile.phoneLabel")}</label>
      <div id="phone-verify-recaptcha-container" />
      <div className="phone-field">
        <span className="phone-prefix">+91</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => {
            let digits = e.target.value.replace(/\D/g, "");
            if (digits.startsWith("91") && digits.length > 10) digits = digits.slice(2);
            setPhone(digits.slice(0, 10));
          }}
          placeholder="9876543210"
          inputMode="numeric"
        />
      </div>
      {isPhoneVerified ? (
        <p className="verify-ok">{t("profile.verified", { n: verifiedPhone })}</p>
      ) : !confirm ? (
        <>
          <p className="muted">
            {t("profile.otpHint")}
          </p>
          {profile?.phone && !profile?.phoneVerified && (
            <p className="verify-pending">
              {t("profile.pending")}
            </p>
          )}
          <button className="ghost" onClick={sendOtp} disabled={sending}>
            {sending ? t("profile.sendingOtp") : t("profile.sendOtp")}
          </button>
        </>
      ) : (
        <>
          <label>{t("profile.enterOtp")}</label>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("profile.otpPlaceholder")}
          />
          <button onClick={verifyOtp} disabled={verifying}>
            {verifying ? t("profile.verifying") : t("profile.verifyBtn")}
          </button>
          <button
            className="ghost"
            onClick={() => {
              setConfirm(null);
              setPendingPhone(null);
            }}
          >
            {t("profile.changeNumber")}
          </button>
        </>
      )}
      {verifyMsg && <p className="muted">{verifyMsg}</p>}
      <h2>{t("profile.secServices")}</h2>
      <label>{t("profile.services")}</label>
      <div className="chips">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={cats.includes(c.id) ? "chip on" : "chip"}
            onClick={() => toggleCat(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <label>{t("profile.charges")}</label>
      <input
        value={charges}
        onChange={(e) => setCharges(e.target.value)}
        placeholder={t("profile.optional")}
      />
            <h2>{t("profile.secCoverage")}</h2>
      <label>{t("profile.hours")}</label>
      <input
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        placeholder={t("profile.optional")}
      />
      <label>{t("profile.radius", { n: radius })}</label>
      <input
        type="range"
        min={5}
        max={30}
        step={5}
        value={radius}
        onChange={(e) => setRadius(Number(e.target.value))}
      />
      <button
        className="ghost"
        disabled={locating}
        onClick={async () => {
          setLocating(true);
          try {
            setLoc(await captureLocation());
          } catch {
            setError(t("profile.errLocation"));
          } finally {
            setLocating(false);
          }
        }}
      >
        {loc
          ? t("profile.locationSet", { lat: loc.lat.toFixed(4), lng: loc.lng.toFixed(4) })
          : locating
            ? t("profile.locating")
            : t("profile.setLocation")}
      </button>
      <button onClick={save} disabled={busy}>
        {busy ? t("profile.saving") : t("profile.save")}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
