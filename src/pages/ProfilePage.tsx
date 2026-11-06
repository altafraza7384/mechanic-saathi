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
      if (!finalLoc) {
        finalLoc = await captureLocation();
      }
      // OTP-verified number when verified, otherwise the typed number
      // as pending — the admin verifies pending numbers by calling.
      await setDoc(
        doc(db, "mechanics", user.uid),
        {
          uid: user.uid,
          name,
          shopName,
          phone: isPhoneVerified && verifiedPhone ? verifiedPhone : fullPhone,
          categories: cats,
          customServices: customServices
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          charges: charges || null,
          workingHours: hours || null,
          lat: finalLoc.lat,
          lng: finalLoc.lng,
          geohash: encodeGeohash(finalLoc.lat, finalLoc.lng, 7),
          serviceRadiusKm: radius,
          isOnline: profile?.isOnline ?? false,
          rating: profile?.rating ?? null,
          totalJobs: profile?.totalJobs ?? 0,
          updated_at: new Date().toISOString(),
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

  return (
    <div className="page">
      <h1>{t("profile.title")}</h1>
      <p className="muted">{t("profile.subtitle")}</p>

      <label>{t("profile.name")}</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("profile.namePh")}
      />

      <label>{t("profile.shopName")}</label>
      <input
        type="text"
        value={shopName}
        onChange={(e) => setShopName(e.target.value)}
        placeholder={t("profile.shopNamePh")}
      />

      <label>{t("profile.phone")}</label>
      <input
        type="text"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={t("profile.phonePlaceholder")}
      />
      {isPhoneVerified ? (
        <p className="verify-ok">
          {t("profile.verified", { n: verifiedPhone })}
        </p>
      ) : (
        <>
          <p className="muted">{t("profile.pendingHint")}</p>
          {profile?.phone && !profile.phoneVerified && (
            <p className="verify-pending">{t("profile.pending")}</p>
          )}
        </>
      )}

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

      <label>{t("profile.customServices")}</label>
      <input
        type="text"
        value={customServices}
        onChange={(e) => setCustomServices(e.target.value)}
        placeholder={t("profile.customServicesPh")}
      />

      <label>{t("profile.charges")}</label>
      <input
        type="text"
        value={charges}
        onChange={(e) => setCharges(e.target.value)}
        placeholder={t("profile.optional")}
      />

      <h2>{t("profile.secCoverage")}</h2>
      <label>{t("profile.hours")}</label>
      <input
        type="text"
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
          ? t("profile.locationSet", {
              lat: loc.lat.toFixed(4),
              lng: loc.lng.toFixed(4),
            })
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
