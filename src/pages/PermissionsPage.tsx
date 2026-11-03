import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getPermissionRows,
  markPermissionsDone,
  requestPermission,
  type PermissionKind,
  type PermissionRow,
} from "../lib/permissions";
import { t } from "../lib/i18n";

const META: Record<
  PermissionKind,
  { icon: string; title: string; subtitle: string }
> = {
  notifications: {
    icon: "🔔",
    title: "Notifications",
    subtitle: t("perm.subNotifications"),
  },
  overlay: {
    icon: "📱",
    title: "Draw over Other Apps",
    subtitle: t("perm.subOverlay"),
  },
  battery: {
    icon: "🔋",
    title: "Battery Optimization",
    subtitle: t("perm.subBattery"),
  },
  autostart: {
    icon: "🔄",
    title: "Autostart",
    subtitle: t("perm.subAutostart"),
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
      <h1>{t("perm.title")}</h1>
      <p className="muted">
        {t("perm.desc")}
      </p>

      {loading && <p className="muted">{t("perm.checking")}</p>}

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
                    {t("perm.autostartNote")}
                  </span>
                )}
                {r.state === "notNeeded" && (
                  <span className="muted small">
                    {t("perm.notNeeded")}
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
        {t("perm.recheck")}
      </button>

      {confirming && (
        <div className="card warn">
          <strong>{t("perm.stillOff")}</strong>
          <span>{missing.map((r) => META[r.kind].title).join(", ")}</span>
          <span className="muted small">
            {t("perm.stillOffDesc")}
          </span>
          <button onClick={proceedAnyway}>{t("perm.proceed")}</button>
          <button className="ghost" onClick={() => setConfirming(false)}>
            {t("perm.fixFirst")}
          </button>
        </div>
      )}

      {!confirming && (
        <button onClick={done} disabled={loading}>
          {t("perm.done")}
        </button>
      )}
    </div>
  );
}
