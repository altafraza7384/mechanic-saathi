import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getPermissionRows,
  markPermissionsDone,
  requestPermission,
  type PermissionKind,
  type PermissionRow,
} from "../lib/permissions";

const META: Record<
  PermissionKind,
  { icon: string; title: string; subtitle: string }
> = {
  notifications: {
    icon: "🔔",
    title: "Notifications",
    subtitle: "Nayi request ka alert milega, chahe app background me ho",
  },
  overlay: {
    icon: "📱",
    title: "Draw over Other Apps",
    subtitle: "App background me ho tab bhi request ka popup dikhega",
  },
  battery: {
    icon: "🔋",
    title: "Battery Optimization",
    subtitle:
      "Battery bachane ke chakkar me phone app ko background me band na kare",
  },
  autostart: {
    icon: "🔄",
    title: "Autostart",
    subtitle:
      "Phone restart ya app band hone ke baad bhi app apne aap chale",
  },
};

export default function PermissionsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getPermissionRows());
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-check every time the mechanic returns from a settings screen.
  useEffect(() => {
    refresh();
    const onReturn = () => refresh();
    window.addEventListener("focus", onReturn);
    const onVis = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const allOk = rows.every((r) => r.state !== "missing");
  const missing = rows.filter((r) => r.state === "missing");

  const openRow = async (kind: PermissionKind) => {
    await requestPermission(kind);
    // Do NOT refresh immediately: the settings screen is still in front and
    // the user has not toggled yet. The focus/visibility listener refreshes
    // on return; the manual button covers the rest.
  };

  const done = () => {
    if (allOk) {
      markPermissionsDone();
      navigate("/", { replace: true });
    } else {
      setConfirming(true);
    }
  };

  const proceedAnyway = () => {
    markPermissionsDone();
    navigate("/", { replace: true });
  };

  return (
    <div className="page">
      <h1>Permissions Required</h1>
      <p className="muted">
        Requests miss na hon, isliye ye 4 settings ON honi chahiye. Jo row
        grey hai us par tap karo — sahi settings khul jayengi. Wapas aate hi
        status dobara check ho jayega.
      </p>

      {loading && <p className="muted">Status check ho raha hai...</p>}

      <div className="list">
        {rows.map((r) => {
          const meta = META[r.kind];
          const ok = r.state !== "missing";
          return (
            <button
              key={r.kind}
              type="button"
              className={`perm-row ${ok ? "ok" : ""}`}
              onClick={() => openRow(r.kind)}
            >
              <span className="perm-icon">{meta.icon}</span>
              <span className="perm-text">
                <strong>{meta.title}</strong>
                <span className="muted small">{meta.subtitle}</span>
                {r.kind === "autostart" && r.state === "granted" && (
                  <span className="muted small">
                    Note: Autostart ki haalat Android se poochhi nahi ja
                    sakti — ye row settings kholne par green hoti hai.
                    Wahan Autostart ON zaroor rakhein.
                  </span>
                )}
                {r.state === "notNeeded" && (
                  <span className="muted small">
                    Is device par ye setting hoti hi nahi — zaroori nahi.
                  </span>
                )}
              </span>
              <span className={`perm-check ${ok ? "ok" : ""}`}>
                {ok ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <button className="ghost" onClick={refresh} disabled={loading}>
        Dobara check karein
      </button>

      {confirming && (
        <div className="card warn">
          <strong>⚠ Kuch settings abhi bhi off hain:</strong>
          <span>{missing.map((r) => META[r.kind].title).join(", ")}</span>
          <span className="muted small">
            Inke bina background me requests miss ho sakti hain. Aap baad me
            Home se bhi ye settings theek kar sakte ho.
          </span>
          <button onClick={proceedAnyway}>Phir bhi aage badhein</button>
          <button className="ghost" onClick={() => setConfirming(false)}>
            Pehle settings theek karein
          </button>
        </div>
      )}

      {!confirming && (
        <button onClick={done} disabled={loading}>
          Done
        </button>
      )}
    </div>
  );
}
