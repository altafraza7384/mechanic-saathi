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
import { t } from "../lib/i18n";

export default function HomePage() {
  const { user, profile, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<SosRequest[]>([]);
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as SosRequest,
      );
      rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      setRequests(rows);
    }, () => {
      // A failed listener used to leave a silent empty list (audit
      // 2026-10-24): show the failure instead of "koi request nahi".
      setLoadError(true);
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
        <h1>{t("home.noProfileTitle")}</h1>
        <p className="muted">
          {t("home.noProfileDesc")}
        </p>
        <button onClick={() => navigate("/profile")}>
          {t("home.fillProfile")}
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row between">
        <h1>{t("home.greet", { n: profile.name })}</h1>
        <button className="ghost small" onClick={handleLogout}>
          {t("home.logout")}
        </button>
      </div>
      {permBanner && !isHeld && (
        <div className="card warn">
          <strong>{t("home.permTitle")}</strong>
          <span>{t("home.permDesc")}</span>
          <button className="ghost" onClick={() => navigate("/permissions")}>
            {t("home.fixSettings")}
          </button>
        </div>
      )}
      {isHeld && (
        <div className="card hold-banner">
          <strong>{t("home.holdTitle")}</strong>
          <span>
            {t("home.holdDesc")}
          </span>
          {profile.held_reason && (
            <span>{t("home.holdReason", { n: profile.held_reason })}</span>
          )}
          <span className="muted small">{t("home.warnings", { n: warningCount })}</span>
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
          ? t("home.holdStatus")
          : toggling
            ? t("home.toggling")
            : profile.isOnline
              ? t("home.online")
              : t("home.offline")}
      </div>
      {holdNotice && (
        <p className="error">
          {t("home.holdNotice")}
        </p>
      )}
      {!isHeld && !profile.isOnline && (
        <p className="muted">
          {t("home.offlineHint")}
        </p>
      )}
      {isHeld ? (
        <p className="muted">
          {t("home.holdHint")}
        </p>
      ) : (
        <>
          {loadError && (
            <p className="error">
              {t("home.loadError")}
            </p>
          )}
          <h2>
            {profile.isOnline ? t("home.requestsCount", { n: visible.length }) : t("home.requestsTitle")}
          </h2>
          {!profile.isOnline ? (
            <p className="muted">{t("home.onlineEmpty")}</p>
          ) : visible.length === 0 ? (
            <p className="muted">
              {t("home.noRequests")}
            </p>
          ) : (
            <div className="list">
              {visible.map((r) => (
                <Link key={r.id} to={`/request/${r.id}`} className="card">
                  <strong>{categoryLabel(r.category)}</strong>
                  <span>{r.areaText ?? t("areaMissing")}</span>
                  {profile?.lat !== null &&
                      profile?.lat !== undefined &&
                    profile?.lng !== null &&
                    profile?.lng !== undefined &&
                    r.approxLat !== null &&
                    r.approxLng !== null && (
                      <span className="muted small">
                        {t("distanceApprox", {
                        n: distanceKm(
                          profile.lat,
                          profile.lng,
                          r.approxLat,
                          r.approxLng,
                          ).toFixed(1),
                      })}
                      </span>
                      )}
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
          {t("home.editProfile")}
        </button>
        <button className="ghost" onClick={() => navigate("/jobs")}>
          {t("home.myJobs")}
        </button>
        <button className="ghost" onClick={() => navigate("/permissions")}>
          {t("home.permissions")}
        </button>
      </div>
    </div>
  );
}
