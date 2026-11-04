package com.driversaathi.mechanic.fullscreen;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * FCM receiver for SOS pushes. Data-only messages only: "sos_request" shows
 * the incoming-call-style full-screen popup (same "sos_requests" channel the
 * app already uses, auto-dismiss after 60 seconds); "sos_cancel" clears it.
 * Payload carries only public fields (request id, category, area text) —
 * never the driver phone or exact location. A missing notification
 * permission must never crash the service: the request still waits in the
 * in-app list.
 */
public class SosMessagingService extends FirebaseMessagingService {

    static final String CHANNEL_ID = "sos_requests";
    static final String CHANNEL_NAME = "SOS Requests";

    @Override
    public void onNewToken(String token) {
        getSharedPreferences(FullscreenNotifyPlugin.PREFS, MODE_PRIVATE).edit().putString(FullscreenNotifyPlugin.KEY_TOKEN, token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        String type = message.getData().get("type");
        String requestId = message.getData().get("requestId");
        if (requestId == null) {
            return;
        }
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        if ("sos_cancel".equals(type)) {
            nm.cancel(FullscreenNotifyPlugin.notificationIdFor(requestId));
            return;
        }
        if (!"sos_request".equals(type)) {
            return;
        }
        String category = message.getData().get("category");
        String areaText = message.getData().get("areaText");
        ensureChannel(nm);
        Intent full = new Intent(this, FullscreenActivity.class);
        full.putExtra("requestId", requestId);
        full.putExtra("category", category);
        full.putExtra("areaText", areaText);
        full.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int id = FullscreenNotifyPlugin.notificationIdFor(requestId);
        PendingIntent fullPi = PendingIntent.getActivity(this, id, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent contentPi = launch == null ? fullPi : PendingIntent.getActivity(this, id + 1000000000, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("New SOS request - " + categoryLabel(category))
            .setContentText(areaText == null || areaText.isEmpty() ? "A driver nearby needs help" : areaText)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setFullScreenIntent(fullPi, true)
            .setContentIntent(contentPi)
            .setAutoCancel(true)
            .setTimeoutAfter(60000)
            .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_VIBRATE);
        try {
            nm.notify(id, b.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted: the request still waits in the
            // in-app list; never crash the service over a missing permission.
        }
    }

    private void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        if (nm.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
    }

        private static String categoryLabel(String category) {
        if ("car".equals(category) || "mechanic".equals(category)) {
            return "Car Problem";
        }
        if ("battery".equals(category)) {
            return "Battery Problem";
        }
        if ("towing".equals(category)) {
            return "Towing";
        }
        if ("other".equals(category)) {
            return "Other";
        }
        if ("custom".equals(category)) {
            return "Custom";
        }
        if ("tyre".equals(category)) {
            return "Tyre Help";
        }
        return "Other Help";
    }
}
