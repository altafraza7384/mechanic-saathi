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
  const { user, profile, refreshProfile, logout } = useAuth(); const navigate = useNavigate();
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
  if (!profile) return <div className="page"><div className="brand-kicker">{t("ui.brand")}</div><h1>{t("ui.garageReady")}</h1><p className="muted">{t("ui.setupDesc")}</p><button onClick={() => navigate("/profile")}>{t("ui.profileSetup")}</button></div>;
  return <div className="page">
    <div className="between"><div><div className="brand-kicker" style={{fontSize:11}}>{t("ui.brand")}</div><p className="muted">{t("ui.namaste", { n: profile.name })}</p></div><div className="profile-initial">{initials(profile.name)}</div></div>
    <div className="hero">
      <div className="availability" onClick={toggleOnline}><span>● {isHeld ? t("ui.accountHold") : profile.isOnline ? t("ui.online") : t("ui.offline")}</span><span className={`toggle ${profile.isOnline && !isHeld ? "" : "off"}`}><i /></span></div>
      <h2>{isHeld ? t("ui.holdReview") : profile.isOnline ? t("ui.onlineReady") : t("ui.offlineReady")}</h2><p>{isHeld ? t("ui.holdDesc") : profile.isOnline ? t("ui.onlineDesc") : t("ui.offlineDesc")}</p>
      <div className="hero-meta"><span>⌖ {t("ui.area", { n: profile.serviceRadiusKm })}</span><span>◷ {profile.workingHours || t("ui.hoursUnset")}</span></div>
    </div>
    {permBanner && !isHeld && <div className="notice"><span>♧</span><div><strong>{t("ui.alertSetup")}</strong><a onClick={() => navigate("/permissions")}>{t("ui.setupNow")}</a></div></div>}
    {isHeld && <div className="notice"><span>!</span><div><strong>{t("ui.holdBanner")}</strong><p>{profile.held_reason || t("ui.adminReview")} · {t("ui.warnings", { n: warningCount })}</p></div></div>}
    {holdNotice && <p className="error">{t("ui.holdNotice")}</p>}
    <div className="section-head"><h2>{t("ui.newRequests")} <span style={{color:"var(--orange)"}}>{visible.length || ""}</span></h2><span>{t("ui.nearby")}</span></div>
    {loadError && <p className="error">{t("ui.loadRequests")}</p>}
    {!profile.isOnline ? <div className="card pad"><p className="muted">{t("ui.onlineEmpty")}</p></div> : visible.length === 0 ? <div className="card pad"><p className="muted">{t("ui.noPending")}</p></div> : <div className="stack">{visible.map((r) => <Link key={r.id} to={`/request/${r.id}`} className="card request-card">
      <div className="request-card-head"><span className="service-icon">{serviceIcon(r.category)}</span><div><strong>{categoryLabel(r.category)}</strong><p className="muted">{t("ui.justArrived", { n: r.id.slice(0,6).toUpperCase() })}</p></div><span className="badge">{t("ui.new")}</span></div>
      <div className="request-location"><i>⌖</i><span>{r.areaText || t("areaGps")}</span></div><p className="request-meta">{profile.lat != null && r.approxLat != null ? t("ui.kmAway", { n: distanceKm(profile.lat, profile.lng!, r.approxLat, r.approxLng!).toFixed(1) }) : ""}</p>
      {r.description && <p className="request-copy">“{r.description}”</p>}<span className="primary-card-btn" style={{display:"block",padding:"14px",borderRadius:12,textAlign:"center",background:"var(--orange)",color:"white",fontWeight:800,fontSize:13}}>{t("ui.requestView")}</span>
    </Link>)}</div>}<button className="ghost small" onClick={() => void logout()}>{t("home.logout")}</button>
  </div>;
}
