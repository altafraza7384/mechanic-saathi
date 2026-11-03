import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { categoryLabel, type SosRequest } from "../lib/types";
import { Link } from "react-router-dom";
import { t, statusLabel } from "../lib/i18n";

export default function JobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<SosRequest[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Done jobs only: status in [completed, cancelled] + assigned to me.
    const q = query(
      collection(db, "sos_requests"),
      where("assignedMechanicId", "==", user.uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoadError(false);
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as SosRequest)
          .filter((r) => r.status === "completed" || r.status === "cancelled")
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setJobs(rows);
      },
      () => {
        setLoadError(true);
      },
    );
    return unsub;
  }, [user]);

  return (
    <div className="page">
      <Link to="/" className="back">
        ← {t("back")}
      </Link>
      <h1>{t("jobs.title")}</h1>
      {loadError && (
        <p className="error">
          {t("jobs.loadError")}
        </p>
      )}
      {jobs.length === 0 ? (
        <p className="muted">
          {t("jobs.empty")}
        </p>
      ) : (
        <div className="list">
          {jobs.map((r) => (
            <div key={r.id} className="card">
              <strong>{categoryLabel(r.category)}</strong>
              <span>{r.areaText ?? t("areaMissing")}</span>
              <span className="muted small">
                {new Date(r.created_at).toLocaleString("en-IN")}
              </span>
              <span>{t("jobs.status", { s: statusLabel(r.status) })}</span>
              {r.driverPhone && (
                <a href={`tel:${r.driverPhone}`} className="small">
                  📞 {t("jobs.driverCall")}
                </a>
              )}
              {r.driverName && (
                <span className="muted small">{t("jobs.driverName", { n: r.driverName })}</span>
              )}
              {r.driverLat !== null &&
                r.driverLng !== null &&
                r.driverLat !== undefined &&
                r.driverLng !== undefined && (
                  <a
                    className="small"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://maps.google.com/maps?q=${r.driverLat},${r.driverLng}`}
                  >
                    🗺️ {t("jobs.maps")}
                  </a>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
