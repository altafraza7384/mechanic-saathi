import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { AuthProvider, useAuth } from "./lib/auth";
import { permissionsDone } from "./lib/permissions";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import PermissionsPage from "./pages/PermissionsPage";
import HomePage from "./pages/HomePage";
import RequestPage from "./pages/RequestPage";
import JobsPage from "./pages/JobsPage";

import type { ReactNode } from "react";
import { t } from "./lib/i18n";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page"><p className="muted">{t("loading")}</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireProfile({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return <div className="page"><p className="muted">{t("loading")}</p></div>;
  if (!profile) return <Navigate to="/profile" replace />;
  return <>{children}</>;
}

// One-time onboarding gate for the Permissions screen. Only Home is gated:
// /request/:id must stay reachable from a tapped notification even if the
// mechanic skipped permissions, or the request would be lost.
function RequirePermissions({ children }: { children: ReactNode }) {
  if (!permissionsDone()) return <Navigate to="/permissions" replace />;
  return <>{children}</>;
}

// Notification tap -> open that SOS request. Registered once at app level
// (not in HomePage) so it also works when the tap relaunches the app.
function SosNotificationTapHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: { remove: () => Promise<void> } | null = null;
    LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (e) => {
        const id = (e.notification.extra as { requestId?: string } | undefined)?.requestId;
        if (id) navigate(`/request/${id}`);
      },
    ).then((l) => {
      listener = l;
    });
    return () => {
      listener?.remove();
    };
  }, [navigate]);
  return null;
}

function BottomNav() {
    const { user } = useAuth();
    const location = useLocation();
    if (!user) return null;
    const items = [
      { to: "/", label: t("nav.requests") },
      { to: "/jobs", label: t("nav.jobs") },
      { to: "/profile", label: t("nav.profile") },
      { to: "/permissions", label: t("nav.alerts") },
        ];
    return (
          <nav className="bottom-nav">
            {items.map((item) => (
                    <Link
                                key={item.to}
                                to={item.to}
                                className={location.pathname === item.to ? "on" : ""}
                              >
                      {item.label}
                    </Link>
                  ))}
          </nav>
        );
}
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SosNotificationTapHandler />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/permissions"
            element={
              <RequireAuth>
                <RequireProfile>
                  <PermissionsPage />
                </RequireProfile>
              </RequireAuth>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <RequireProfile>
                  <RequirePermissions>
                    <HomePage />
                  </RequirePermissions>
                </RequireProfile>
              </RequireAuth>
            }
          />
          <Route
            path="/request/:id"
            element={
              <RequireAuth>
                <RequireProfile>
                  <RequestPage />
                </RequireProfile>
              </RequireAuth>
            }
          />
          <Route
            path="/jobs"
            element={
              <RequireAuth>
                <RequireProfile>
                  <JobsPage />
                </RequireProfile>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
                <BottomNav />
      </BrowserRouter>
    </AuthProvider>
  );
}
