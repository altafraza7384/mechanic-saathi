import { Capacitor } from "@capacitor/core";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { auth } from "./firebase";

/**
 * Google sign-in — the ONLY login method in Mechanic Saathi (user decision
 * 2026-10-22, OTP-cost reason). No OTP is ever sent for login.
 *
 * Native (Capacitor): the @capacitor-firebase/authentication plugin brokers
 * the Google account pick natively and — because capacitor.config.ts sets
 * skipNativeAuth — returns the Google credential WITHOUT signing in; the
 * Firebase JS SDK then performs the actual sign-in via signInWithCredential,
 * so the JS SDK stays the single source of truth for auth state. (The old
 * signInWithRedirect approach lost its result across the WebView boundary
 * in Driver Saathi and dropped users back on the Log In page, signed out.)
 *
 * Web (browser preview): popup first; if the popup is blocked/unavailable,
 * fall back to signInWithRedirect. On the redirect return leg the auth
 * state listener in AuthProvider picks the session up, so no separate
 * getRedirectResult handling is needed for the session itself.
 *
 * Returns "cancelled" when the user backs out of the account chooser/popup
 * (callers treat that as a quiet no-op, not an error). Throws a friendly
 * Error for genuine failures.
 */
export async function signInWithGoogle(): Promise<"ok" | "cancelled"> {
  if (Capacitor.isNativePlatform()) {
    return signInWithGoogleNative();
  }
  return signInWithGoogleWeb();
}

function isCancelled(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "auth/popup-closed-by-user") return true;
  if (code.startsWith("auth/")) return false;
  const message = e instanceof Error ? e.message : String(e ?? "");
  const haystack = `${code} ${message}`.toLowerCase();
  // Native plugin cancellations surface as the platform SDK's error:
  // Android Credential Manager "user canceled", legacy status 12501.
  return haystack.includes("cancel") || haystack.includes("12501");
}

async function signInWithGoogleNative(): Promise<"ok" | "cancelled"> {
  // Everything (including the plugin import) inside try: a missing or
  // unregistered plugin must surface as a friendly error, never a crash.
  let result;
  try {
    const { FirebaseAuthentication } = await import(
      "@capacitor-firebase/authentication"
    );
    result = await FirebaseAuthentication.signInWithGoogle();
  } catch (e) {
    if (isCancelled(e)) return "cancelled";
    throw new Error("Google sign-in nahi ho paya. Dobara try karo.");
  }
  const idToken = result.credential?.idToken;
  if (!idToken) {
    // Almost always: SHA-1 not registered for this app in the Firebase
    // console, or google-services.json is stale (pre-fingerprint).
    throw new Error(
      "Google sign-in complete nahi hua. Firebase console me is app ka SHA-1 register karo aur google-services.json refresh karo, phir dobara try karo.",
    );
  }
  const credential = GoogleAuthProvider.credential(
    idToken,
    result.credential?.accessToken ?? undefined,
  );
  await signInWithCredential(auth, credential);
  return "ok";
}

async function signInWithGoogleWeb(): Promise<"ok" | "cancelled"> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
    return "ok";
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    if (
      code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, provider);
      return "ok";
    }
    if (isCancelled(e)) return "cancelled";
    throw new Error("Google sign-in nahi ho paya. Dobara try karo.");
  }
}
