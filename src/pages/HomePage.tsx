import { useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { categoryLabel, type SosRequest } from "../lib/types";
import { distanceKm } from "../lib/geohash";
import {
  cancelRequestNotification,
  ensureSosChannel,
  getPermissionRows,
  isNative,
  notifyNewRequest,
  startOnlineService,
  stopOnlineService,
} from "../lib/permissions";
import { Link, useNavigate } from "react-router-dom";

export default function HomePage() {
  const { user, profile, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<SosRequest[]>([]);
  const [toggling, setToggling] = useState(false);
  const [holdNotice, setHoldNotice] = useState(false);
  const [permBanner, setPermBanner] = useState(false);
  const forcedOfflineRef = useRef(false);
  // Notification bookkeeping. seenRef = every request id ever shown (so the
  // first snapshot — the existing backlog — never pings); notifiedRef =
  // ids with a live notification, cancelled when the request leaves pending.
  const seenRef = useRef<Set<string>>(new Set());
  const notifiedRef = useRef<Set<string>>(new Set());
  const firstOnlineSnapshotRef = useRef(false);
  // Old docs have no status field — treat missing status as "active".
  const isHeld = profile?.status === "held";
  const warningCount = profile?.warnings ?? 0;

  // Live listener: every pending SOS request, filtered client-side by
  // the mechanic's own categories + service radius.
  useEffect(() => {
    const q = query(
      collection(db, "sos_requests"),
      where("status", "==", "pending"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as SosRequest,
      );
      rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      setRequests(rows);
    });
    return unsub;
  }, []);

  const visible = requests.filter((r) => {
    if (!profile) return false;
    if (!profile.categories.includes(r.category)) return false;
    if (
      profile.lat !== null &&
      profile.lng !== null &&
      r.approxLat !== null &&
      r.approxLng !== null
    ) {
      const d = distanceKm(profile.lat, profile.lng, r.approxLat, r.approxLng);
      if (d > profile.serviceRadiusKm) return false;
    }
    return true;
  });

  // Foreground service follows the ONLINE flag: it keeps the process alive
  // so the listener above keeps running while the app is backgrounded.
  // Held mechanics never get the service (their force-offline flips
  // isOnline, which stops it here too).
  useEffect(() => {
    if (!profile) return;
    if (profile.isOnline && profile.status !== "held") {
      ensureSosChannel();
      startOnlineService();
    } else {
      stopOnlineService();
    }
  }, [profile?.isOnline, profile?.status]);

  // New-request notifications. Only arrivals AFTER the first online snapshot
  // ping — the backlog on first open just shows in the list. While offline
  // (or held) nothing is marked seen, and outstanding pings are cancelled.
  // Caveat: this listener lives in HomePage, so it only covers the app
  // while Home is mounted (backgrounded app included — the tree stays
  // mounted). A mechanic browsing Jobs/Profile gets no ping until they
  // return to Home; moving this watcher to the App shell is a follow-up.
  useEffect(() => {
    if (!profile?.isOnline || profile?.status === "held") {
      notifiedRef.current.forEach((id) => {
        cancelRequestNotification(id);
      });
      notifiedRef.current.clear();
      return;
    }
    if (!firstOnlineSnapshotRef.current) {
      visible.forEach((r) => seenRef.current.add(r.id));
      firstOnlineSnapshotRef.current = true;
      return;
    }
    visible.forEach((r) => {
      if (!seenRef.current.has(r.id)) {
        seenRef.current.add(r.id);
        notifiedRef.current.add(r.id);
        notifyNewRequest(r);
      }
    });
    notifiedRef.current.forEach((id) => {
      if (!visible.some((r) => r.id === id)) {
        notifiedRef.current.delete(id);
        cancelRequestNotification(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, profile?.isOnline, profile?.status]);

  // Permission banner: re-checked on mount and whenever the mechanic
  // returns to Home (e.g. from the Permissions screen).
  useEffect(() => {
    if (!isNative) return;
    const check = () => {
      getPermissionRows()
        .then((rows) => setPermBanner(rows.some((r) => r.state === "missing")))
        .catch(() => {});
    };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);
  // Held mechanic: force offline once so no new requests reach them.
  // The ref guard makes this fire only while held && online — after the
  // write + refresh, isOnline is false and the effect becomes a no-op,
  // so there is no loop. The ref resets if the hold is later lifted,
  // so a re-hold forces offline again.
  useEffect(() => {
    if (profile?.status !== "held") {
      forcedOfflineRef.current = false;
      return;
    }
    if (!user || !profile.isOnline || forcedOfflineRef.current) return;
    forcedOfflineRef.current = true;
    updateDoc(doc(db, "mechanics", user.uid), { isOnline: false })
      .then(() => refreshProfile())
      .catch(() => {
        forcedOfflineRef.current = false;
      });
  }, [user, profile, refreshProfile]);

  const toggleOnline = async () => {
    if (!user || !profile) return;
    // Held mechanics cannot toggle: show the held message instead.
    if (isHeld) {
      setHoldNotice(true);
      return;
    }
    setToggling(true);
    try {
      await updateDoc(doc(db, "mechanics", user.uid), {
        isOnline: !profile.isOnline,
      });
      await refreshProfile();
    } finally {
      setToggling(false);
    }
  };

  const handleLogout = async () => {
    // Never leave the ONLINE service running after logout.
    await stopOnlineService();
    logout();
  };

  if (!profile) {
    return (
      <div className="page">
        <h1>Profile adhoori hai</h1>
        <p className="muted">
          Pehle apni shop ki detail bharo, tabhi requests milengi.
        </p>
        <button onClick={() => navigate("/profile")}>
          Profile bharo
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row between">
        <h1>Namaste, {profile.name} 👋</h1>
        <button className="ghost small" onClick={handleLogout}>
          Logout
        </button>
      </div>
      {permBanner && !isHeld && (
        <div className="card warn">
          <strong>⚠ Kuch permissions off hain</strong>
          <span>Background me requests miss ho sakti hain.</span>
          <button className="ghost" onClick={() => navigate("/permissions")}>
            Settings theek karein
          </button>
        </div>
      )}
      {isHeld && (
        <div className="card hold-banner">
          <strong>⛔ Account hold par hai</strong>
          <span>
            Admin ne tumhara account hold kar diya hai, isliye nayi
            requests nahi milengi.
          </span>
          {profile.held_reason && (
            <span>Reason: {profile.held_reason}</span>
          )}
          <span className="muted small">Warnings: {warningCount}</span>
        </div>
      )}
      <div
        className={
          isHeld ? "status off" : profile.isOnline ? "status on" : "status off"
        }
        onClick={toggleOnline}
      >
        <span className="dot" />
        {isHeld
          ? "ACCOUNT HOLD — Nayi requests band hain"
          : toggling
            ? "Badal rahe hain..."
            : profile.isOnline
              ? "ONLINE — Requests mil rahi hain"
              : "OFFLINE — Requests ke liye ONLINE karo"}
      </div>
      {holdNotice && (
        <p className="error">
          Account hold par hai — online tabhi ho sakoge jab admin hold
          hatayega.
        </p>
      )}
      {!isHeld && !profile.isOnline && (
        <p className="muted">
          Offline ho to koi request nahi milegi. Kaam ke liye ONLINE karo.
        </p>
      )}
      {isHeld ? (
        <p className="muted">
          Hold hatne ke baad hi nayi requests yahan dikhengi.
        </p>
      ) : (
        <>
          <h2>
            Nayi requests {profile.isOnline ? `(${visible.length})` : ""}
          </h2>
          {!profile.isOnline ? (
            <p className="muted">Online hone par yahan requests dikhengi.</p>
          ) : visible.length === 0 ? (
            <p className="muted">
              Abhi tumhari services/radius me koi pending request nahi hai.
            </p>
          ) : (
            <div className="list">
              {visible.map((r) => (
                <Link key={r.id} to={`/request/${r.id}`} className="card">
                  <strong>{categoryLabel(r.category)}</strong>
                  <span>{r.areaText ?? "Area nahi diya"}</span>
                  {r.description && (
                    <span className="muted">{r.description}</span>
                  )}
                  <span className="muted small">
                    {new Date(r.created_at).toLocaleString("en-IN")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      <div className="row">
        <button className="ghost" onClick={() => navigate("/profile")}>
          Profile edit karo
        </button>
        <button className="ghost" onClick={() => navigate("/jobs")}>
          Meri jobs
        </button>
        <button className="ghost" onClick={() => navigate("/permissions")}>
          Permissions
        </button>
      </div>
    </div>
  );
}
