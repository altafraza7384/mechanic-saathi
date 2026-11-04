import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { CATEGORIES, normalizeCategory, type CarSosCategory } from "../lib/types";
import { encodeGeohash } from "../lib/geohash";
import { useNavigate } from "react-router-dom";
import { t } from "../lib/i18n";

async function captureLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("no-geolocation"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/** Normalize a typed number to +91... form. Returns null if not usable. */
function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.name ?? "");
  const [shopName, setShopName] = useState(profile?.shopName ?? "");
  const [cats, setCats] = useState<CarSosCategory[]>(() =>
    (profile?.categories ?? [])
      .map(normalizeCategory)
      .filter((c): c is CarSosCategory => c !== null),
  );
  const [customServices, setCustomServices] = useState(
    (profile?.customServices ?? []).join(", "),
  );
  const [charges, setCharges] = useState(profile?.charges ?? "");
  const [hours, setHours] = useState(profile?.workingHours ?? "");
  const [radius, setRadius] = useState(profile?.serviceRadiusKm ?? 10);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ---- Phone verification is pending-only ----
  // There is no OTP anywhere in the app now. The mechanic types a
  // number and saves it unverified; it shows as pending until an
  // admin verifies it from the admin panel ("Verify phone").
  // Login stays Google-only and never sends an OTP.
  const [phone, setPhone] = useState(profile?.phone?.replace(/^\+91/, "") ?? "");
  const verifiedPhone = profile?.phoneVerified && profile.phone ? profile.phone : null;
  const isPhoneVerified =
    verifiedPhone !== null && normalizePhone(phone) === verifiedPhone;

  const toggleCat = (c: CarSosCategory) => {
    setCats((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const save = async () => {
    setError(null);
    const fullPhone = normalizePhone(phone);
    if (!fullPhone) {
      setError(t("profile.errPhone"));
      return;
    }
    if (cats.length === 0) {
      setError(t("profile.errCats"));
      return;
    }
    if (!user) {
      setError(t("profile.errLogin"));
      return;
    }
    setBusy(true);
    try {
      let finalLoc = loc;
      if (!finalLoc && profile?.lat != null && profile?.lng != null) {
        finalLoc = { lat: profile.lat, lng: profile.lng };
      }
      const custom = customServices
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const isNew = !profile;
      await setDoc(
        doc(db, "mechanics", user.uid),
        {
          uid: user.uid,
          name,
          shopName,
          categories: cats,
          customServices: custom,
          charges,
          workingHours: hours,
          serviceRadiusKm: radius,
          isOnline: profile?.isOnline ?? true,
          phone: fullPhone,
          phoneVerified: isPhoneVerified,
          ...(finalLoc
            ? {
                lat: finalLoc.lat,
                lng: finalLoc.lng,
                geohash: encodeGeohash(finalLoc.lat, finalLoc.lng),
              }
            : {}),
          ...(isNew
            ? { rating: 0, totalJobs: 0, created_at: new Date() }
            : {}),
          updated_at: new Date(),
        },
        { merge: true },
      );
      await refreshProfile();
      navigate("/jobs");
    } catch {
      setError(t("profile.errSave"));
    } finally {
      setBusy(false);
    }
  };

  const pendingHint =
    phone.trim() && !isPhoneVerified && normalizePhone(phone) !== null
      ? t("profile.pendingHint")
      : null;

  const locationLabel =
    loc != null
      ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`
      : profile?.lat != null && profile?.lng != null
        ? `${profile.lat.toFixed(5)}, ${profile.lng.toFixed(5)}`
        : null;

  return (
    <div className="page">
      <h1>{t("profile.title")}</h1>
      <p className="muted">{t("profile.subtitle")}</p>

      <label>
        {t("profile.name")}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("profile.namePh")}
        />
      </label>

      <label>
        {t("profile.shop")}
        <input
          type="text"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          placeholder={t("profile.shopPh")}
        />
      </label>

      <div>
        <p>{t("profile.services")}</p>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cats.includes(c.id) ? "chip on" : "chip"}
              onClick={() => toggleCat(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <label>
        {t("profile.custom")}
        <input
          type="text"
          value={customServices}
          onChange={(e) => setCustomServices(e.target.value)}
          placeholder={t("profile.customPh")}
        />
      </label>

      <label>
        {t("profile.charges")}
        <input
          type="text"
          value={charges}
          onChange={(e) => setCharges(e.target.value)}
          placeholder={t("profile.chargesPh")}
        />
      </label>

      <label>
        {t("profile.hours")}
        <input
          type="text"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder={t("profile.hoursPh")}
        />
      </label>

      <label>
        {t("profile.radius")}
        <input
          type="number"
          min={1}
          max={50}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
        />
      </label>

      <div>
        <button
          type="button"
          onClick={async () => {
            setLocating(true);
            try {
              setLoc(await captureLocation());
            } catch {
              setError(t("profile.errLoc"));
            } finally {
              setLocating(false);
            }
          }}
          disabled={locating}
        >
          {locating ? t("profile.locating") : t("profile.useLoc")}
        </button>
        {locationLabel && <p className="muted">📍 {locationLabel}</p>}
      </div>

      <label>
        {t("profile.phone")}
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="10-digit mobile number"
        />
      </label>
      {isPhoneVerified ? (
        <p className="ok">
          ✓ {t("profile.verified")}: {verifiedPhone}
        </p>
      ) : (
        <>
          {pendingHint && <p className="muted">{pendingHint}</p>}
          {verifiedPhone && (
            <p className="muted">
              {t("profile.pending")}: {verifiedPhone}
            </p>
          )}
        </>
      )}

      {error && <p className="err">{error}</p>}
      <button type="button" onClick={save} disabled={busy}>
        {busy ? t("profile.saving") : t("profile.save")}
      </button>
    </div>
  );
}
