import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { categoryLabel, type SosRequest } from "../lib/types";
import { distanceKm } from "../lib/geohash";
import { Link, useNavigate } from "react-router-dom";
import { t, statusLabel } from "../lib/i18n";

export default function JobsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<SosRequest[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<"active" | "completed">("active");

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "sos_requests"),
      where("mechanicId", "==", user.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setLoadError(false);
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as SosRequest,
      );
      rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      setJobs(rows);
    }, () => {
      // A failed listener used to leave a silent empty list (audit
      // 2026-10-24): show the failure instead of "koi job nahi hai".
      setLoadError(true);
    });
    return unsub;
  }, [user]);

  const activeJobs = jobs.filter((j) =>
    ["accepted", "onway", "arrived"].includes(j.status),
  );
  const completedJobs = jobs.filter((j) =>
    ["completed", "cancelled"].includes(j.status),
  );
  const shown = tab === "active" ? activeJobs : completedJobs;

  return (
    <div className="page">
      <button className="ghost small" onClick={() => navigate("/")}>
        {t("back")}
      </button>
      <h1>{t("jobs.title")}</h1>
      <div className="chips">
        <button
          className={tab === "active" ? "chip on" : "chip"}
          onClick={() => setTab("active")}
        >
          {t("jobs.tabActive")}
        </button>
        <button
          className={tab === "completed" ? "chip on" : "chip"}
          onClick={() => setTab("completed")}
        >
          {t("jobs.tabCompleted")}
        </button>
      </div>
      {loadError && (
        <p className="error">{t("jobs.loadError")}</p>
      )}
      {shown.length === 0 ? (
        <p className="muted">
          {tab === "active" ? t("jobs.emptyActive") : t("jobs.emptyCompleted")}
        </p>
      ) : (
        <div className="list">
          {shown.map((j) => (
            // Job cards must be clickable: an accepted job vanished from
            // Home (pending-only), so this was the only way back to the
            // driver phone/navigate actions (audit 2026-10-24).
            <Link key={j.id} to={`/request/${j.id}`} className="card">
              <strong>{categoryLabel(j.category)}</strong>
              <span>{j.areaText || (j.approxLat !== null && j.approxLng !== null ? t("areaGps") : t("areaMissing"))}</span>
              {profile?.lat !== null &&
                profile?.lat !== undefined &&
                profile?.lng !== null &&
                profile?.lng !== undefined &&
                j.approxLat !== null &&
                j.approxLng !== null && (
                  <span className="muted small">
                    {t("distanceApprox", {
                      n: distanceKm(
                        profile.lat,
                        profile.lng,
                        j.approxLat,
                        j.approxLng,
                      ).toFixed(1),
                    })}
                  </span>
                )}
              <span className="muted small">
                {statusLabel(j.status)}
                {j.rating ? ` • ⭐ ${j.rating}` : ""} •{" "}
                {new Date(j.created_at).toLocaleDateString("en-IN")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
