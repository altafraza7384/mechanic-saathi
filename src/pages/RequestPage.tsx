import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import {
  categoryLabel,
  type SosRequest,
  type SosRequestDetails,
} from "../lib/types";
import { useNavigate, useParams } from "react-router-dom";
import { t, statusLabel } from "../lib/i18n";

export default function RequestPage() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [req, setReq] = useState<SosRequest | null>(null);  
  const [details, setDetails] = useState<SosRequestDetails | null>(null);
  const [detailsError, setDetailsError] = useState(false);
  const [detailsRetry, setDetailsRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "sos_requests", id), (snap) => {
      if (!snap.exists()) {
        setNotFound(true);
        return;
      }
      setReq({ id: snap.id, ...snap.data() } as SosRequest);
    }, () => {
      // A failed listener used to leave a stale/empty page with no
      // message (audit 2026-10-24).
      setError(t("req.errLoad"));
    });
    return unsub;
  }, [id]);

  // Once this mechanic owns the request, load the private details doc
  // (driver phone + exact location) via a live listener, not a one-shot
  // getDoc: a single failed fetch used to strand the mechanic forever
  // on "Driver ki detail load ho rahi hai..." with no retry (audit
  // 2026-10-24).
  useEffect(() => {
    if (!req || req.mechanicId !== user?.uid || !id) return;
    setDetailsError(false);
    const unsub = onSnapshot(doc(db, "sos_request_details", id), (snap) => {
      if (snap.exists()) {
        setDetails({ id: snap.id, ...snap.data() } as SosRequestDetails);
      }
    }, () => {
      setDetailsError(true);
    });
    return unsub;
  }, [req, user, id, detailsRetry]);

  const accept = async () => {
    if (!req || !user || !id) return;
    // Held mechanics cannot accept, and a not-yet-loaded profile must
    // never accept blind — refuse safely in both cases, before any
    // transaction runs or the details doc is claimed.
    if (!profile) {
      setError(t("req.errProfile"));
      return;
    }
    if (profile.status === "held") {
      setError(
        t("req.errHold"),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Transaction: only accept if the request is still pending, so two
      // mechanics tapping at once cannot both grab the same job.
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "sos_requests", id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(t("req.errNotFound"));
        if (snap.data().status !== "pending") {
          throw new Error(t("req.errTaken"));
        }
        tx.update(ref, {
          status: "accepted",
          mechanicId: user.uid,
          mechanicName: profile.name,
          mechanicPhone: profile.phone || user.phoneNumber || "",
        });
      });
      // Claim the private details doc (rules: allowed because the request
      // doc now names this mechanic as assigned).
      await updateDoc(doc(db, "sos_request_details", id), {
        mechanicId: user.uid,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("req.errAccept"));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: "onway" | "arrived" | "completed") => {
    if (!id) return;
    if (status === "completed" && !window.confirm(t("req.confirmComplete"))) return;
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "sos_requests", id), { status });
    } catch {
      setError(t("req.errStatus"));
    } finally {
      setBusy(false);
    }
  };

  const cancelJob = async () => {
    if (!id) return;
    if (!cancelReason.trim()) {
      setError(t("req.errReason"));
      return;
    }
    if (!window.confirm(t("req.cancelConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "sos_requests", id), {
        status: "cancelled",
        cancelReason: cancelReason.trim(),
      });
    } catch {
      setError(t("req.errCancel"));
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="page">
        <h1>{t("req.notFound")}</h1>
        <button onClick={() => navigate("/")}>{t("backPlain")}</button>
      </div>
    );
  }

  if (!req) {
    return (
      <div className="page">
        <p className="muted">{t("req.loading")}</p>
      </div>
    );
  }

  const mine = req.mechanicId === user?.uid;
  const mapsUrl =
    details?.exactLat !== null &&
    details?.exactLat !== undefined &&
    details?.exactLng !== null &&
    details?.exactLng !== undefined
      ? `https://maps.google.com/maps?q=${details.exactLat},${details.exactLng}`
      : req.approxLat !== null && req.approxLng !== null
        ? `https://maps.google.com/maps?q=${req.approxLat},${req.approxLng}`
        : null;

  return (
    <div className="page">
      <button className="ghost small" onClick={() => navigate("/")}>
        {t("back")}
      </button>
      <div className="card" style={{ gap: 10 }}>
        <span className="small" style={{ color: "#C74718", fontWeight: 700 }}>REQUEST DETAIL</span>
        <h1>{categoryLabel(req.category)}</h1>
        <p className="muted">{t("req.status", { n: statusLabel(req.status) })}</p>
        {req.description && <p>{req.description}</p>}
        <p>📍 {req.areaText ?? t("areaMissing")}</p>
        <p className="muted small">{new Date(req.created_at).toLocaleString("en-IN")}</p>
      </div>

      {req.status === "pending" && (
        <>
          <p className="muted">
            {t("req.acceptHint")}
          </p>
          {profile?.charges && (
            <>
              <p>
                {t("req.visitingCharge", { n: profile.charges })}
              </p>
              <p className="muted">
                {t("req.estimateNote")}
              </p>
            </>
          )}
          {profile?.status === "held" && (
            <p className="error">
              {t("req.holdAccept")}
            </p>
          )}
          <button onClick={accept} disabled={busy}>
            {busy ? t("req.accepting") : t("req.acceptBtn")}
          </button>
        </>
      )}

      {req.status === "accepted" && !mine && (
        <p className="error">{t("req.acceptedOther")}</p>
      )}

      {mine && (req.status === "accepted" || req.status === "onway" || req.status === "arrived") && (
          <div className="card">
            <h2>{t("req.driverDetail")}</h2>
            <p className="muted small">Phone aur exact pin ab unlock ho gaye hain.</p>
          {details ? (
            <>
              <p>
                📞{" "}
                <a href={`tel:${details.driverPhone}`}>
                  {details.driverPhone}
                </a>
                {details.driverName && <> - {details.driverName}</>}
                </p>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noreferrer">
                  <button className="ghost">{t("req.navigate")}</button>
                </a>
              )}
              <a href={`tel:${details.driverPhone}`}>
                <button>{t("req.callDriver")}</button>
              </a>
            </>
          ) : detailsError ? (
            <>
              <p className="error">{t("req.detailError")}</p>
              <button className="ghost" onClick={() => setDetailsRetry((n) => n + 1)}>
                {t("retry")}
              </button>
            </>
          ) : (
            <p className="muted">{t("req.detailLoading")}</p>
          )}
          <div className="row">
            {req.status === "accepted" && (
              <button onClick={() => setStatus("onway")} disabled={busy}>
                {t("req.onway")}
              </button>
            )}
            {req.status === "onway" && (
              <button onClick={() => setStatus("arrived")} disabled={busy}>
                {t("req.arrived")}
              </button>
            )}
            {req.status === "arrived" && (
              <button onClick={() => setStatus("completed")} disabled={busy}>
                {t("req.completedBtn")}
              </button>
            )}
          </div>
          <label>{t("req.cancelReasonLabel")}</label>
          <input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder={t("req.cancelReasonPlaceholder")}
          />
          <button className="ghost" onClick={cancelJob} disabled={busy}>
            {t("req.cancelBtn")}
          </button>
        </div>
      )}

      {req.status === "completed" && (
        <p className="muted">
          {t("req.completedMsg")}
          {req.rating ? t("req.rated", { n: req.rating }) : ""}
        </p>
      )}
      {req.status === "cancelled" && (
        <p className="muted">
          {req.cancelReason
            ? t("req.cancelledByMe", { n: req.cancelReason })
            : t("req.cancelledMsg")}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
