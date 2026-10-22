package com.driversaathi.mechanic.permissions;

import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Minimal foreground service. It shows the persistent "you are ONLINE"
 * notification and, by being a foreground service, keeps the app process
 * alive so the WebView's Firestore SOS listener keeps running while the
 * mechanic is ONLINE — even when the app is in the background.
 *
 * It runs no logic of its own: starting/stopping is driven from JS when the
 * mechanic toggles ONLINE/OFFLINE, and the service is stopped on OFFLINE.
 * If Android kills the process anyway (or the phone reboots), the listener
 * is gone until the mechanic reopens the app — only FCM push (Blaze-gated)
 * can wake a fully-killed app, and that is a separate, later step.
 */
public class OnlineService extends Service {

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                MechanicPermissionsPlugin.onlineNotificationId(),
                MechanicPermissionsPlugin.buildOnlineNotification(this),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        } else {
            startForeground(
                MechanicPermissionsPlugin.onlineNotificationId(),
                MechanicPermissionsPlugin.buildOnlineNotification(this)
            );
        }
        // If killed, restart the service (the JS listener resumes when the
        // WebView process is restored; it does not restart by itself).
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
