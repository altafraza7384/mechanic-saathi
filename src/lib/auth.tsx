import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { MechanicProfile } from "./types";

interface AuthState {
  user: User | null;
  profile: MechanicProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MechanicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "mechanics", auth.currentUser.uid));
      setProfile(
        snap.exists() ? ({ id: snap.id, ...snap.data() } as MechanicProfile) : null,
      );
    } catch {
      // A failed profile read must never break the session: the caller
      // keeps the signed-in user and can retry; a stuck screen is worse
      // than a missing profile row.
      setProfile(null);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      try {
        if (u) {
          const snap = await getDoc(doc(db, "mechanics", u.uid));
          setProfile(
            snap.exists() ? ({ id: snap.id, ...snap.data() } as MechanicProfile) : null,
          );
        } else {
          setProfile(null);
        }
      } catch {
        // First-open safety: if the profile read fails (offline, rules,
        // network), the app must still reach the login/profile screens —
        // NEVER stay stuck on "Load ho raha hai...".
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
    // Native: also sign out of the FirebaseAuthentication plugin so the
    // native Google account-chooser state is cleared and the next sign-in
    // asks for an account again. Best-effort — the JS SDK session (the
    // source of truth) is already gone at this point.
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { FirebaseAuthentication } = await import(
          "@capacitor-firebase/authentication"
        );
        await FirebaseAuthentication.signOut();
      }
    } catch {
      // Ignore — JS SDK logout already succeeded.
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, refreshProfile, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
