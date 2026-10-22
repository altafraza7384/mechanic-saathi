import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { CATEGORIES, type CarSosCategory } from "../lib/types";
import { encodeGeohash } from "../lib/geohash";
import { useNavigate } from "react-router-dom";

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

  const toggleCat = (c: CarSosCategory) =>
    setCats((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  const save = async () => {
    if (!user) return;
    if (!name.trim() || !shopName.trim() || cats.length === 0) {
      setError("Naam, shop ka naam aur kam se kam ek service chuno.");
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
          phone: user.phoneNumber ?? "",
          categories: cats,
          charges: charges.trim() || null,
          workingHours: hours.trim() || null,
          lat: loc ? loc.lat : null,
          lng: loc ? loc.lng : null,
          geohash: loc ? encodeGeohash(loc.lat, loc.lng, 7) : null,
          serviceRadiusKm: radius,
          isOnline: profile?.isOnline ?? false,
          isVerified: profile?.isVerified ?? false,
          rating: profile?.rating ?? null,
          totalJobs: profile?.totalJobs ?? 0,
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
      await refreshProfile();
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save karne me problem hui.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>Apni profile</h1>
      <p className="muted">
        Driver ko tumhari shop aur services isi se dikhengi.
      </p>
      <label>Apna naam</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Shop / Garage ka naam</label>
      <input value={shopName} onChange={(e) => setShopName(e.target.value)} />
      <label>Services (ek se zyada chun sakte ho)</label>
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
      <label>Charges (jaise: Tyre ₹300 se, Battery ₹500 se)</label>
      <input
        value={charges}
        onChange={(e) => setCharges(e.target.value)}
        placeholder="Optional"
      />
      <label>Kaam ke hours (jaise: 9 AM – 9 PM)</label>
      <input
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        placeholder="Optional"
      />
      <label>Service radius: {radius} km</label>
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
            setError("Location nahi mili. GPS on karke dobara try karo.");
          } finally {
            setLocating(false);
          }
        }}
      >
        {loc
          ? `📍 Shop location set: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
          : locating
            ? "Location le rahe hain..."
            : "📍 Shop ki location set karo"}
      </button>
      <button onClick={save} disabled={busy}>
        {busy ? "Save ho raha hai..." : "Save karo"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
