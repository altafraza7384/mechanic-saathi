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
import { Link, useNavigate } from "react-router-dom";

export default function JobsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<SosRequest[]>([]);
  const [loadError, setLoadError] = useState(false);

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

  return (
    <div className="page">
      <button className="ghost small" onClick={() => navigate("/")}>
        ← Wapas
      </button>
      <h1>Meri jobs</h1>
      {loadError && (
        <p className="error">Jobs load nahi ho paye, page refresh karke dobara try karo.</p>
      )}
      {jobs.length === 0 ? (
        <p className="muted">Abhi koi job nahi hai.</p>
      ) : (
        <div className="list">
          {jobs.map((j) => (
            // Job cards must be clickable: an accepted job vanished from
            // Home (pending-only), so this was the only way back to the
            // driver phone/navigate actions (audit 2026-10-24).
            <Link key={j.id} to={`/request/${j.id}`} className="card">
              <strong>{categoryLabel(j.category)}</strong>
              <span>{j.areaText ?? "Area nahi diya"}</span>
              <span className="muted small">
                {j.status}
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
