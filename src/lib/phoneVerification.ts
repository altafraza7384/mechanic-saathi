import {
  linkWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult,
} from "firebase/auth";
import { auth } from "./firebase";
import { t } from "./i18n";

/**
 * One-time phone verification at profile/biodata time — the ONLY place an
 * OTP is ever sent in Mechanic Saathi (user decision 2026-10-22, OTP-cost
 * reason). Login itself is Google-only and never sends an SMS.
 *
 * This uses linkWithPhoneNumber, NOT signInWithPhoneNumber: the mechanic is
 * already signed in with Google, and linking proves they own the number
 * while keeping the SAME Firebase uid (signing in by phone would switch
 * the session to a different, phone-based uid and orphan the profile).
 * After a successful link, auth.currentUser.phoneNumber is the verified
 * number. A verified number is stored on the mechanics doc as
 * phone + phoneVerified: true; an unverified number is never saved.
 *
 * Cost: one SMS per verification (per new number). Number badalne par
 * dobara ek OTP lagta hai; login par kabhi nahi.
 */

let verifier: RecaptchaVerifier | null = null;

function resetVerifier() {
  if (verifier) {
    try {
      verifier.clear();
    } catch {
      // Already cleared — ignore.
    }
    verifier = null;
  }
}

/** Send one OTP to `fullPhone` (e.g. +919876543210) for the signed-in user. */
export async function sendPhoneVerification(
  fullPhone: string,
): Promise<ConfirmationResult> {
  const user = auth.currentUser;
  if (!user) throw new Error(t("otp.loginFirst"));
  resetVerifier();
  verifier = new RecaptchaVerifier(auth, "phone-verify-recaptcha-container", {
    size: "invisible",
  });
  try {
    return await linkWithPhoneNumber(user, fullPhone, verifier);
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "auth/credential-already-in-use") {
      throw new Error(t("otp.alreadyUsed"));
    }
    if (code === "auth/requires-recent-login") {
      throw new Error(t("otp.sessionOld"));
    }
    if (code === "auth/too-many-requests") {
      throw new Error(t("otp.tooMany"));
    }
    throw new Error(t("otp.sendError", { code: code || "unknown" }));
  }
}

/** Confirm the OTP code. On success the number is linked + verified. */
export async function confirmPhoneVerification(
  confirm: ConfirmationResult,
  code: string,
): Promise<void> {
  try {
    await confirm.confirm(code);
  } catch {
    throw new Error(t("otp.wrong"));
  } finally {
    resetVerifier();
  }
}

/** Normalize a typed number to +91... form. Returns null if not usable. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}
