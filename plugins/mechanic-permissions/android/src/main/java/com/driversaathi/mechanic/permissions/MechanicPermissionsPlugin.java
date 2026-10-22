package com.driversaathi.mechanic.permissions;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native bridge for the Mechanic Saathi permission onboarding screen and the
 * "online" foreground service.
 *
 * Why a custom plugin: Capacitor ships no API for draw-over-other-apps,
 * battery-optimization exemption, or vendor autostart screens. All three are
 * system-settings toggles, so this plugin only CHECKS their state and OPENS
 * the right settings screen — it never flips a toggle silently.
 *
 * The foreground service keeps the app process alive while the mechanic is
 * ONLINE so the Firestore SOS listener keeps running in the background and
 * can raise a local notification for new requests. It does NOT run any JS by
 * itself; the WebView listener does the work. True push (app fully killed)
 * still needs FCM via Cloud Functions (Blaze-gated) — see AGENTS.md.
 */
@CapacitorPlugin(name = "MechanicPermissions")
public class MechanicPermissionsPlugin extends Plugin {

    private static final String ONLINE_CHANNEL_ID = "mechanic_online";
    private static final int ONLINE_NOTIFICATION_ID = 1001;

    // Vendor autostart screens. Order matters only for the fallback chain;
    // resolveActivity() decides which (if any) actually exists on the device.
    private static final String[][] AUTOSTART_INTENTS = {
        // Xiaomi / Redmi / Poco
        {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
        // Oppo / Realme (ColorOS)
        {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
        {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
        {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
        // Vivo / iQOO
        {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
        // Huawei / Honor
        {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
        {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
        // OnePlus
        {"com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"},
        // Asus
        {"com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity"},
    };

    private Intent autostartIntent() {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        for (String[] comp : AUTOSTART_INTENTS) {
            Intent intent = new Intent();
            intent.setComponent(new ComponentName(comp[0], comp[1]));
            if (intent.resolveActivity(pm) != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                return intent;
            }
        }
        return null;
    }

    private Intent appDetailsIntent() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }

    @PluginMethod
    public void checkStatus(PluginCall call) {
        Context ctx = getContext();
        String pkg = ctx.getPackageName();

        boolean notifications;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            notifications = nm != null && nm.areNotificationsEnabled();
        } else {
            notifications = true;
        }

        boolean overlay = Settings.canDrawOverlays(ctx);

        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        boolean batteryExempt = pm != null && pm.isIgnoringBatteryOptimizations(pkg);

        // Autostart only exists on some vendors. If no vendor screen resolves,
        // the device does not need it — report unsupported so the UI auto-passes.
        boolean autostartSupported = autostartIntent() != null;

        JSObject ret = new JSObject();
        ret.put("notifications", notifications);
        ret.put("overlay", overlay);
        ret.put("batteryExempt", batteryExempt);
        ret.put("autostartSupported", autostartSupported);
        call.resolve(ret);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        // Shows the system dialog "Let app always run in background?" — the
        // user still confirms; we cannot exempt silently.
        Intent intent = new Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        Intent intent = autostartIntent();
        boolean fallback = false;
        if (intent == null) {
            intent = appDetailsIntent();
            fallback = true;
        }
        try {
            getContext().startActivity(intent);
        } catch (Exception e) {
            // Vendor screen vanished between resolve and launch (OEM ROM
            // drift) — fall back to the app details page, never crash.
            try {
                getContext().startActivity(appDetailsIntent());
                fallback = true;
            } catch (Exception ignored) {
                call.reject("Could not open autostart settings");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("opened", true);
        ret.put("fallback", fallback);
        call.resolve(ret);
    }

    @PluginMethod
    public void startOnlineService(PluginCall call) {
        Context ctx = getContext().getApplicationContext();
        Intent intent = new Intent(ctx, OnlineService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopOnlineService(PluginCall call) {
        Context ctx = getContext().getApplicationContext();
        ctx.stopService(new Intent(ctx, OnlineService.class));
        call.resolve();
    }

    /** Creates the persistent "you are online" notification channel. */
    static void createOnlineChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(ONLINE_CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            ONLINE_CHANNEL_ID,
            "Online status",
            NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription("Shows while you are ONLINE so SOS requests keep arriving in the background.");
        nm.createNotificationChannel(ch);
    }

    static Notification buildOnlineNotification(Context ctx) {
        createOnlineChannel(ctx);
        return new NotificationCompat.Builder(ctx, ONLINE_CHANNEL_ID)
            .setContentTitle("Mechanic Saathi — Aap ONLINE hain")
            .setContentText("Nayi SOS requests ke liye taiyaar")
            .setSmallIcon(ctx.getApplicationInfo().icon)
            .setOngoing(true)
            .build();
    }

    static int onlineNotificationId() {
        return ONLINE_NOTIFICATION_ID;
    }
}
