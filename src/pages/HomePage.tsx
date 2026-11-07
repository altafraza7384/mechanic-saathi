import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { categoryLabel, servesCategory, type SosRequest } from "../lib/types";
import { distanceKm } from "../lib/geohash";
import { cancelRequestNotification, ensureSosChannel, getPermissionRows, isNative, notifyNewRequest, startOnlineService, stopOnlineService } from "../lib/permissions";
import { cancelFullscreenNotification, readLaunchAction, registerFcmToken } from "../lib/fullscreenNotify";
import { Link, useNavigate } from "react-router-dom";
import { t } from "../lib/i18n";

function initials(name: string) { return name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase(); }
function serviceIcon(category: string) { return category === "battery" ? "▣" : category === "towing" ? "▱" : category === "other" ? "+" : "◉"; }

export default function HomePage() {
  const { user, profile, refreshProfile } = useAuth(); const navigate = useNavigate();
  const [requests, setRequests] = useState<SosRequest[]>([]); const [loadError, setLoadError] = useState(false); const [holdNotice, setHoldNotice] = useState(false); const [permBanner, setPermBanner] = useState(false);
  const forcedOfflineRef = useRef(false); const seenRef = useRef<Set<string>>(new Set()); const notifiedRef = useRef<Set<string>>(new Set()); const firstOnlineSnapshotRef = useRef(false);
  const isHeld = profile?.status === "held"; const warningCount = profile?.warnings ?? 0;
  useEffect(() => { const q = query(collection(db, "sos_requests"), where("status", "==", "pending")); return onSnapshot(q, (snap) => { setLoadError(false); const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SosRequest); rows.sort((a,b) => a.created_at < b.created_at ? 1 : -1); setRequests(rows); }, () => setLoadError(true)); }, []);
  const visible = requests.filter((r) => { if (!profile || !servesCategory(profile.categories, r.category)) return false; if (profile.lat !== null && profile.lng !== null && r.approxLat !== null && r.approxLng !== null && distanceKm(profile.lat, profile.lng, r.approxLat, r.approxLng) > profile.serviceRadiusKm) return false; return true; });
  useEffect(() => { if (!profile) return; if (profile.isOnline && profile.status !== "held") { ensureSosChannel(); startOnlineService(); if (user) void registerFcmToken(user.uid); } else stopOnlineService(); }, [user, profile?.isOnline, profile?.status]);
  useEffect(() => { if (!profile?.isOnline || profile?.status === "held") { notifiedRef.current.forEach((id) => { cancelRequestNotification(id); void cancelFullscreenNotification(id); }); notifiedRef.current.clear(); return; } if (!firstOnlineSnapshotRef.current) { visible.forEach((r) => seenRef.current.add(r.id)); firstOnlineSnapshotRef.current = true; return; } visible.forEach((r) => { if (!seenRef.current.has(r.id)) { seenRef.current.add(r.id); notifiedRef.current.add(r.id); notifyNewRequest(r); } }); notifiedRef.current.forEach((id) => { if (!visible.some((r) => r.id === id)) { notifiedRef.current.delete(id); cancelRequestNotification(id); void cancelFullscreenNotification(id); } }); }, [visible, profile?.isOnline, profile?.status]);
  useEffect(() => { let cancelled = false; const check = async () => { const launch = await readLaunchAction(); if (!cancelled && launch?.action === "accept") navigate(`/request/${launch.requestId}`); }; void check(); window.addEventListener("focus", check); return () => { cancelled = true; window.removeEventListener("focus", check); }; }, [navigate]);
  useEffect(() => { if (!isNative) return; const check = () => getPermissionRows().then((rows) => setPermBanner(rows.some((r) => r.state === "missing"))).catch(() => {}); check(); window.addEventListener("focus", check); return () => window.removeEventListener("focus", check); }, [isNative]);
  useEffect(() => { if (profile?.status !== "held") { forcedOfflineRef.current = false; return; } if (!user || !profile.isOnline || forcedOfflineRef.current) return; forcedOfflineRef.current = true; updateDoc(doc(db, "mechanics", user.uid), { isOnline: false }).then(refreshProfile).catch(() => { forcedOfflineRef.current = false; }); }, [user, profile, refreshProfile]);
  const toggleOnline = async () => { if (!user || !profile) return; if (isHeld) { setHoldNotice(true); return; } await updateDoc(doc(db, "mechanics", user.uid), { isOnline: !profile.isOnline }); await refreshProfile(); };
  if (!profile) return <div className="page"><div className="brand-kicker">Mechanic Saathi</div><h1>Apna garage ready karein.</h1><p className="muted">Pehle apni service details bharein, tabhi nearby requests milengi.</p><button onClick={() => navigate("/profile")}>Profile setup karein →</button></div>;
  return <div className="page">
    <div className="between"><div><div className="brand-kicker" style={{fontSize:11}}>Mechanic Saathi</div><p className="muted">Namaste, {profile.name}</p></div><div className="profile-initial">{initials(profile.name)}</div></div>
    <div className="hero">
      <div className="availability" onClick={toggleOnline}><span>● {isHeld ? "ACCOUNT HOLD" : profile.isOnline ? "ONLINE" : "OFFLINE"}</span><span className={`toggle ${profile.isOnline && !isHeld ? "" : "off"}`}><i /></span></div>
      <h2>{isHeld ? "Account review mein hai." : profile.isOnline ? "Kaam ke liye taiyaar." : "Jab ready ho, online aayein."}</h2><p>{isHeld ? "Nayi requests abhi band hain." : profile.isOnline ? "Aapke area ki nayi requests yahan aayengi." : "Online hote hi nearby drivers ki requests milengi."}</p>
      <div className="hero-meta"><span>⌖ {profile.serviceRadiusKm} km area</span><span>◷ {profile.workingHours || "Hours set nahi"}</span></div>
    </div>
    {permBanner && !isHeld && <div className="notice"><span>♧</span><div><strong>Background alerts setup baaki hai</strong><a onClick={() => navigate("/permissions")}>Setup poora karein →</a></div></div>}
    {isHeld && <div className="notice"><span>!</span><div><strong>Account hold par hai</strong><p>{profile.held_reason || "Admin review ke baad yahan status update hoga."} · Warnings: {warningCount}</p></div></div>}
    {holdNotice && <p className="error">Account hold par hai — admin hold hatayega tab online ho sakoge.</p>}
    <div className="section-head"><h2>Nayi requests <span style={{color:"var(--orange)"}}>{visible.length || ""}</span></h2><span>Nearby</span></div>
    {loadError && <p className="error">Requests load nahi ho payi. Dobara try karein.</p>}
    {!profile.isOnline ? <div className="card pad"><p className="muted">Online hone par yahan requests dikhengi.</p></div> : visible.length === 0 ? <div className="card pad"><p className="muted">Abhi aapke area mein koi pending request nahi hai.</p></div> : <div className="stack">{visible.map((r) => <Link key={r.id} to={`/request/${r.id}`} className="card request-card">
      <div className="request-card-head"><span className="service-icon">{serviceIcon(r.category)}</span><div><strong>{categoryLabel(r.category)}</strong><p className="muted">Abhi aaya · #{r.id.slice(0,6).toUpperCase()}</p></div><span className="badge">Naya</span></div>
      <div className="request-location"><i>⌖</i><span>{r.areaText || t("areaGps")}</span></div><p className="request-meta">{profile.lat != null && r.approxLat != null ? `${distanceKm(profile.lat, profile.lng!, r.approxLat, r.approxLng!).toFixed(1)} km door · approx. 6 min` : "Location available"}</p>
      {r.description && <p className="request-copy">“{r.description}”</p>}<span className="primary-card-btn" style={{display:"block",padding:"14px",borderRadius:12,textAlign:"center",background:"var(--orange)",color:"white",fontWeight:800,fontSize:13}}>Request dekhein →</span>
    </Link>)}</div>}
  </div>;
}
