import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
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

export default function RequestPage() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [req, setReq] = useState<SosRequest | null>(null);
  const [details, setDetails] = useState<SosRequestDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "sos_requests", id), (snap) => {
      if (!snap.exists()) {
        setNotFound(true);
        return;
      }
      setReq({ id: snap.id, ...snap.data() } as SosRequest);
    });
    return unsub;
  }, [id]);

  // Once this mechanic owns the request, load the private details doc
  // (driver phone + exact location).
  useEffect(() => {
    if (!req || req.mechanicId !== user?.uid || !id) return;
    getDoc(doc(db, "sos_request_details", id)).then((snap) => {
      if (snap.exists()) {
        setDetails({ id: snap.id, ...snap.data() } as SosRequestDetails);
      }
    });
  }, [req, user, id]);

  const accept = async () => {
    if (!req || !user || !id) return;
    // Held mechanics cannot accept, and a not-yet-loaded profile must
    // never accept blind — refuse safely in both cases, before any
    // transaction runs or the details doc is claimed.
    if (!profile) {
      setError("Profile load nahi hui. Page refresh karke dobara try karo.");
      return;
    }
    if (profile.status === "held") {
      setError(
        "Aapka account hold par hai, isliye nayi request accept nahi kar sakte.",
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
        if (!snap.exists()) throw new Error("Request nahi mili.");
        if (snap.data().status !== "pending") {
          throw new Error("Ye request kisi aur ne accept kar li hai.");
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
      setError(e instanceof Error ? e.message : "Accept karne me problem hui.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: "onway" | "completed") => {
    if (!id) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "sos_requests", id), { status });
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="page">
        <h1>Request nahi mili</h1>
        <button onClick={() => navigate("/")}>Wapas jao</button>
      </div>
    );
  }

  if (!req) {
    return (
      <div className="page">
        <p className="muted">Request load ho rahi hai...</p>
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
        ← Wapas
      </button>
      <h1>{categoryLabel(req.category)}</h1>
      <p className="muted">
        Status: <strong>{req.status}</strong>
      </p>
      {req.description && <p>{req.description}</p>}
      <p>📍 {req.areaText ?? "Area nahi diya"}</p>
      <p className="muted small">
        {new Date(req.created_at).toLocaleString("en-IN")}
      </p>

      {req.status === "pending" && (
        <>
          <p className="muted">
            Accept karne par driver ka phone number aur exact location
            dikhegi.
          </p>
          {profile?.status === "held" && (
            <p className="error">
              Aapka account hold par hai — nayi request accept nahi kar
              sakte.
            </p>
          )}
          <button onClick={accept} disabled={busy}>
            {busy ? "Accept ho raha hai..." : "✅ Request accept karo"}
          </button>
        </>
      )}

      {req.status === "accepted" && !mine && (
        <p className="error">Ye request kisi aur mechanic ne accept kar li hai.</p>
      )}

      {mine && (req.status === "accepted" || req.status === "onway") && (
        <div className="card">
          <h2>Driver ki detail</h2>
          {details ? (
            <>
              <p>
                📞{" "}
                <a href={`tel:${details.driverPhone}`}>
                  {details.driverPhone}
                </a>
              </p>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noreferrer">
                  <button className="ghost">🗺️ Navigate karo</button>
                </a>
              )}
              <a href={`tel:${details.driverPhone}`}>
                <button>📞 Driver ko call karo</button>
              </a>
            </>
          ) : (
            <p className="muted">Driver ki detail load ho rahi hai...</p>
          )}
          <div className="row">
            {req.status === "accepted" && (
              <button onClick={() => setStatus("onway")} disabled={busy}>
                🚗 Raste me hoon
              </button>
            )}
            <button onClick={() => setStatus("completed")} disabled={busy}>
              ✔️ Kaam ho gaya
            </button>
          </div>
        </div>
      )}

      {req.status === "completed" && (
        <p className="muted">
          Ye job poori ho gayi hai.
          {req.rating ? ` Driver ne ${req.rating} star diye.` : ""}
        </p>
      )}
      {req.status === "cancelled" && (
        <p className="muted">Driver ne ye request cancel kar di hai.</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
