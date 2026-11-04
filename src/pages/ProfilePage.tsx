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
  const [phoneError, setPhoneError] = useState<string | null>(null);

  function toggleCat(cat: CarSosCategory) {
    setCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function normalizePhoneOrNull() {
    if (!phone.trim()) return "";
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setPhoneError(
        t("profile.invalidPhone") ??
          "Enter a valid 10-digit mobile number (with or without +91).",
      );
      return null;
    }
    return normalized;
  }

  async function handleCaptureLocation() {
    setLocating(true);
    try {
      const pos = await captureLocation();
      setLoc(pos);
      setError(null);
    } catch {
      setError(t("profile.locationFailed") ?? "Could not capture location.");
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    if (!user) return;
    setError(null);
    setPhoneError(null);
    const normalizedPhone = normalizePhoneOrNull();
    if (normalizedPhone === null) return;
    setBusy(true);
    try {
      const custom = customServices
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const data = {
        uid: user.uid,
        name: name.trim(),
        shopName: shopName.trim(),
        categories: cats,
        customServices: custom,
        charges: charges.trim(),
        workingHours: hours.trim(),
        serviceRadiusKm: radius,
        phone: normalizedPhone || null,
        phoneVerified: verifiedPhone === normalizedPhone,
        ...(loc ? { lat: loc.lat, lng: loc.lng, geohash: encodeGeohash(loc.lat, loc.lng) } : {}),
      };
      await setDoc(doc(db, "mechanics", user.uid), data, { merge: true });
      await refreshProfile();
      navigate("/jobs");
    } catch {
      setError(t("profile.saveFailed") ?? "Failed to save profile.");
    } finally {
      setBusy(false);
    }
  }

  const pendingHint =
    phone.trim() && verifiedPhone !== normalizePhone(phone)
      ? t("profile.pendingHint") ?? "This number will show as pending until an admin verifies it."
      : null;

  return (
    <main>
      <h1>{t("profile.title") ?? "Mechanic profile"}</h1>

      <label>
        {t("profile.name") ?? "Name"}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label>
        {t("profile.shopName") ?? "Shop name"}
        <input value={shopName} onChange={(e) => setShopName(e.target.value)} />
      </label>

      <div>
        <p>{t("profile.categories") ?? "Categories"}</p>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => toggleCat(cat)}
            aria-pressed={cats.includes(cat)}
            className={cats.includes(cat) ? "chip active" : "chip"}
          >
            {cat}
          </button>
        ))}
      </div>

      <label>
        {t("profile.customServices") ?? "Custom services"}
        <input
          value={customServices}
          onChange={(e) => setCustomServices(e.target.value)}
          placeholder="e.g. brake repair, oil change"
        />
      </label>

      <label>
        {t("profile.charges") ?? "Charges"}
        <input value={charges} onChange={(e) => setCharges(e.target.value)} />
      </label>

      <label>
        {t("profile.workingHours") ?? "Working hours"}
        <input value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>

      <label>
        {t("profile.serviceRadiusKm") ?? "Service radius (km)"}
        <input
          type="number"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
        />
      </label>

      <div>
        <button type="button" onClick={handleCaptureLocation} disabled={locating}>
          {locating
            ? t("profile.locating") ?? "Locating..."
            : t("profile.useMyLocation") ?? "Use my location"}
        </button>
        {loc && (
          <p>
            {t("profile.locationSet") ?? "Location set"}: {loc.lat.toFixed(5)},{" "}
            {loc.lng.toFixed(5)}
          </p>
        )}
      </div>

      <div>
        <label>
          {t("profile.phone") ?? "Phone number"}
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="10-digit mobile number"
          />
        </label>
        {verifiedPhone && phone.trim() && verifiedPhone === normalizePhone(phone) && (
          <p>{t("profile.verified") ?? "Verified"}</p>
        )}
        {verifiedPhone && (
          <p>
            {t("profile.pending") ?? "Pending verification"}: {verifiedPhone}
          </p>
        )}
        {pendingHint && <p>{pendingHint}</p>}
        {phoneError && <p role="alert">{phoneError}</p>}
      </div>

      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={save} disabled={busy}>
        {busy ? t("profile.saving") ?? "Saving..." : t("profile.save") ?? "Save profile"}
      </button>
    </main>
  );
}
