import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { categoryLabel, type SosRequest } from "./types";

/**
 * Permission onboarding + background-service bridge for Mechanic Saathi.
 *
 * The four rows on the Permissions screen:
 * - notifications: POST_NOTIFICATIONS runtime permission (Android 13+).
 *   Checked via the native plugin, requested via LocalNotifications.
 * - overlay: SYSTEM_ALERT_WINDOW — lets a request pop up while the app is in
 *   the background. A settings toggle, not a runtime permission.
 * - battery: exemption from battery optimization, so Android's Doze mode
 *   does not kill the background listener. Requested via the system dialog.
 * - autostart: vendor autostart screens (Xiaomi/Oppo/Vivo/...). HONEST LIMIT:
 *   Android exposes NO API to read whether autostart was actually granted,
 *   so this row can only record that the mechanic opened the vendor screen
 *   (localStorage flag). The row subtitle says so. On devices with no vendor
 *   autostart screen (e.g. Pixel) the row is "notNeeded" and auto-passes.
 *
 * On web (browser preview) every check is skipped — all rows read granted —
 * so the flow never blocks development; real checks run on device only.
 */

export type PermissionKind = "notifications" | "overlay" | "battery" | "autostart";
export type RowState = "granted" | "missing" | "notNeeded";

export interface PermissionRow {
  kind: PermissionKind;
  state: RowState;
}

interface NativeStatus {
  notifications: boolean;
  overlay: boolean;
  batteryExempt: boolean;
  autostartSupported: boolean;
}

interface MechanicPermissionsPlugin {
  checkStatus(): Promise<NativeStatus>;
  openOverlaySettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  openAutostartSettings(): Promise<{ opened: boolean; fallback: boolean }>;
  startOnlineService(): Promise<void>;
  stopOnlineService(): Promise<void>;
}

const AUTOSTART_CONFIRMED_KEY = "ms_autostart_confirmed";
export const PERMISSIONS_DONE_KEY = "ms_permissions_done";

const Native = registerPlugin<MechanicPermissionsPlugin>("MechanicPermissions", {
  web: {
    async checkStatus(): Promise<NativeStatus> {
      return {
        notifications: true,
        overlay: true,
        batteryExempt: true,
        autostartSupported: false,
      };
    },
    async openOverlaySettings(): Promise<void> {},
    async openBatterySettings(): Promise<void> {},
    async openAutostartSettings(): Promise<{ opened: boolean; fallback: boolean }> {
      return { opened: false, fallback: true };
    },
    async startOnlineService(): Promise<void> {},
    async stopOnlineService(): Promise<void> {},
  },
});

export const isNative = Capacitor.isNativePlatform();

export function permissionsDone(): boolean {
  try {
    return localStorage.getItem(PERMISSIONS_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPermissionsDone(): void {
  try {
    localStorage.setItem(PERMISSIONS_DONE_KEY, "1");
  } catch {
    // Private-mode storage failure: the guard re-asks next open. Acceptable.
  }
}

export async function getPermissionRows(): Promise<PermissionRow[]> {
  if (!isNative) {
    return [
      { kind: "notifications", state: "granted" },
      { kind: "overlay", state: "granted" },
      { kind: "battery", state: "granted" },
      { kind: "autostart", state: "notNeeded" },
    ];
  }
  const s = await Native.checkStatus();
  let autostartConfirmed = false;
  try {
    autostartConfirmed = localStorage.getItem(AUTOSTART_CONFIRMED_KEY) === "1";
  } catch {
    autostartConfirmed = false;
  }
  return [
    { kind: "notifications", state: s.notifications ? "granted" : "missing" },
    { kind: "overlay", state: s.overlay ? "granted" : "missing" },
    { kind: "battery", state: s.batteryExempt ? "granted" : "missing" },
    {
      kind: "autostart",
      state: !s.autostartSupported
        ? "notNeeded"
        : autostartConfirmed
          ? "granted"
          : "missing",
    },
  ];
}

/** Opens the right prompt/settings screen for a row. Never flips a toggle. */
export async function requestPermission(kind: PermissionKind): Promise<void> {
  if (!isNative) return;
  if (kind === "notifications") {
    await LocalNotifications.requestPermissions();
    return;
  }
  if (kind === "overlay") {
    await Native.openOverlaySettings();
    return;
  }
  if (kind === "battery") {
    await Native.openBatterySettings();
    return;
  }
  // autostart: record that the mechanic opened the vendor screen — Android
  // cannot verify the grant itself (see the header comment).
  try {
    localStorage.setItem(AUTOSTART_CONFIRMED_KEY, "1");
  } catch {
    // Ignore; the row stays "missing" until storage works.
  }
  await Native.openAutostartSettings();
}

const SOS_CHANNEL_ID = "sos_requests";

export async function ensureSosChannel(): Promise<void> {
  if (!isNative) return;
  try {
    await LocalNotifications.createChannel({
      id: SOS_CHANNEL_ID,
      name: "SOS Requests",
      description: "Nayi SOS requests ke alerts",
      importance: 4,
      vibration: true,
    });
  } catch {
    // Channel creation failure must not break going online.
  }
}

function hashRequestId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 1000000000 + 1;
}

/** Heads-up notification for a new SOS request. Fail-soft by design. */
export async function notifyNewRequest(r: SosRequest): Promise<void> {
  if (!isNative) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: hashRequestId(r.id),
          title: `Nayi SOS request — ${categoryLabel(r.category)}`,
          body: r.areaText ?? "Nayi request aayi hai, turant dekho",
          extra: { requestId: r.id },
          channelId: SOS_CHANNEL_ID,
        },
      ],
    });
  } catch {
    // The list still shows the request; a missed ping is not fatal.
  }
}

export async function cancelRequestNotification(requestId: string): Promise<void> {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: hashRequestId(requestId) }],
    });
  } catch {
    // Ignore; stale notifications clear when tapped or on reboot.
  }
}

/** Foreground service control. No-ops on web. */
export async function startOnlineService(): Promise<void> {
  if (!isNative) return;
  try {
    await Native.startOnlineService();
  } catch {
    // The listener still works while the app is foregrounded.
  }
}

export async function stopOnlineService(): Promise<void> {
  if (!isNative) return;
  try {
    await Native.stopOnlineService();
  } catch {
    // Ignore; the service stops when the app process ends.
  }
}
