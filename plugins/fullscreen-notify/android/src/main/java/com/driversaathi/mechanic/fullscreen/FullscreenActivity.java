package com.driversaathi.mechanic.fullscreen;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.graphics.Color;

/**
 * Incoming-call-style full-screen screen for a new SOS request. Shows the
 * category + area text only (no driver phone, no exact location). Accept
 * stores a read-once action and opens the app, where the JS side navigates
 * to the request page and the mechanic taps Accept there (the accept
 * transaction still guards against double-claim). Decline and Dismiss only
 * clear this phone's popup; the request stays open for other mechanics,
 * exactly like ignoring it today.
 */
public class FullscreenActivity extends Activity {

    private String requestId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        Intent intent = getIntent();
        requestId = intent.getStringExtra("requestId");
        String category = intent.getStringExtra("category");
        String areaText = intent.getStringExtra("areaText");
        if (requestId == null) {
            finish();
            return;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(this);
        title.setText("New SOS Request");
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER);
        root.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView cat = new TextView(this);
        cat.setText(categoryLabel(category));
        cat.setTextSize(20);
        cat.setGravity(Gravity.CENTER);
        root.addView(cat, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView area = new TextView(this);
        area.setText(areaText == null || areaText.isEmpty() ? "Area not given - open the request for GPS navigation." : areaText);
        area.setTextSize(16);
        area.setGravity(Gravity.CENTER);
        root.addView(area, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button accept = new Button(this);
        accept.setText("Accept - open request");
        accept.setOnClickListener(v -> {
            getSharedPreferences(FullscreenNotifyPlugin.PREFS, MODE_PRIVATE).edit()
                .putString(FullscreenNotifyPlugin.KEY_ACTION_REQUEST, requestId)
                .putString(FullscreenNotifyPlugin.KEY_ACTION, "accept").apply();
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch != null) {
                launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(launch);
            }
            finish();
        });
        root.addView(accept, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button decline = new Button(this);
        decline.setText("Decline");
        decline.setOnClickListener(v -> {
            cancelNotification();
            finish();
        });
        root.addView(decline, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button dismiss = new Button(this);
        dismiss.setText("Dismiss");
        dismiss.setOnClickListener(v -> {
            cancelNotification();
            finish();
        });
        root.addView(dismiss, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        setContentView(root);
    }

    private void cancelNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(FullscreenNotifyPlugin.notificationIdFor(requestId));
        }
    }

    private static String categoryLabel(String category) {
        if ("tyre".equals(category)) {
            return "Tyre Help";
        }
        if ("mechanic".equals(category)) {
            return "Car Mechanic";
        }
        if ("battery".equals(category)) {
            return "Battery Problem";
        }
        return "Other Help";
    }
}
