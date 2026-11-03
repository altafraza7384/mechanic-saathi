import { registerPlugin } from "@capacitor/core";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { isNative } from "./permissions";

type FullscreenNotifyPlugin = {
  getToken(options: Record<string, never>): Promise<{ token: string }>;
  cancelNotification(options: { requestId: string }): Promise<void>;
  getLaunchAction(options: Record<string, never>): Promise<{ requestId: string | null; action: string | null }>;
};

const FullscreenNotify = registerPlugin<FullscreenNotifyPlugin>("FullscreenNotify");

// Register this phone's FCM token on the mechanics doc. fcmToken and
// fcmTokenUpdatedAt are owner-writable fields (the mechanics update rule
// only blocks admin-managed fields), so no rules change is needed.
// Fail-soft by design: push is an addition to the in-app list, never a
// blocker for going online.
export async function registerFcmToken(uid: string): Promise<void> {
  if (!isNative) return;
  try {
    const { token } = await FullscreenNotify.getToken({});
    if (token) {
      await updateDoc(doc(db, "mechanics", uid), {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString(),
      });
    }
  } catch {
    // Token fetch or write failure must not break going online.
  }
}

export async function cancelFullscreenNotification(requestId: string): Promise<void> {
  if (!isNative) return;
  try {
    await FullscreenNotify.cancelNotification({ requestId });
  } catch {
    // Fail-soft: the server cancel message clears it anyway.
  }
}

// Read-once Accept action left by the full-screen popup; null when none.
export async function readLaunchAction(): Promise<{ requestId: string; action: string } | null> {
  if (!isNative) return null;
  try {
    const { requestId, action } = await FullscreenNotify.getLaunchAction({});
    if (requestId && action) return { requestId, action };
    return null;
  } catch {
    return null;
  }
}
