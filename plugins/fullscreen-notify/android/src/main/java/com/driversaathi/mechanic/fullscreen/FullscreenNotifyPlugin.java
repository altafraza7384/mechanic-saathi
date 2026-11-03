package com.driversaathi.mechanic.fullscreen;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Native bridge for the full-screen SOS notification.
 * Methods: getToken (FCM token, with stored-token fallback), cancelNotification
 * (clears the popup for one request), getLaunchAction (read-once Accept action
 * left by FullscreenActivity). Notification ids are derived from the request
 * id with the same 32-bit hash the app JS uses, so either side cancels the
 * same notification row.
 */
@CapacitorPlugin(name = "FullscreenNotify")
public class FullscreenNotifyPlugin extends Plugin {

    static final String PREFS = "sos_fullscreen_prefs";
    static final String KEY_ACTION_REQUEST = "launch_request_id";
    static final String KEY_ACTION = "launch_action";
    static final String KEY_TOKEN = "fcm_token";

    static int notificationIdFor(String requestId) {
        int h = 0;
        for (int i = 0; i < requestId.length(); i++) {
            h = 31 * h + requestId.charAt(i);
        }
        return Math.abs(h % 1000000000) + 1;
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) {
                String stored = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TOKEN, null);
                if (stored != null) {
                    JSObject ret = new JSObject();
                    ret.put("token", stored);
                    call.resolve(ret);
                } else {
                    call.reject("No FCM token available");
                }
                return;
            }
            JSObject ret = new JSObject();
            ret.put("token", task.getResult());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void cancelNotification(PluginCall call) {
        String requestId = call.getString("requestId");
        if (requestId == null) {
            call.reject("requestId is required");
            return;
        }
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(notificationIdFor(requestId));
        }
        call.resolve();
    }

    @PluginMethod
    public void getLaunchAction(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String requestId = prefs.getString(KEY_ACTION_REQUEST, null);
        String action = prefs.getString(KEY_ACTION, null);
        // Read-once: clear immediately so a later read cannot re-fire it.
        prefs.edit().remove(KEY_ACTION_REQUEST).remove(KEY_ACTION).apply();
        JSObject ret = new JSObject();
        ret.put("requestId", requestId == null ? JSObject.NULL : requestId);
        ret.put("action", action == null ? JSObject.NULL : action);
        call.resolve(ret);
    }
}
