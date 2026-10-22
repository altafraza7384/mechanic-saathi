# Project: Mechanic Saathi

## What this product does

Mechanic Saathi is the mechanic-side companion app to Driver Saathi's "Car SOS"
feature, sharing the same Firebase project. A mechanic signs in with Google
only (phone OTP login was REMOVED 2026-10-22 by user decision, OTP-cost
reason), sets up a shop profile (services, charges, hours, service radius,
shop GPS location) with a ONE-TIME OTP verification of the mobile number at
profile time, toggles ONLINE, and sees live pending SOS requests from nearby
stranded drivers filtered by category + radius. Accepting a request reveals
the driver's phone + exact location with Call and Navigate actions; the
mechanic then marks the job on-way and completed. Launch area is Mumbai first.

## Stack (do not change without asking)

- Frontend: Vite + React + TypeScript + plain CSS (no Tailwind/shadcn here).
- Backend: Firebase project **driver-saathi-app** (shared with Driver Saathi) —
  Firestore (asia-south1) + Firebase Auth with the **Google provider** for
  login (native via @capacitor-firebase/authentication 8.5.2 with
  skipNativeAuth, JS SDK signInWithCredential; web popup + redirect
  fallback) and the **Phone provider ONLY for one-time number verification**
  at profile time (linkWithPhoneNumber + invisible reCAPTCHA, JS SDK —
  never signInWithPhoneNumber, which would switch the session to a
  different phone-based uid). There is NO custom backend server.
- Android: Capacitor, package `com.driversaathi.mechanic`. Builds are delivered
  as zips for the user to build on his own computer (the sandbox cannot run
  Gradle). `google-services.json` in `android/app/` is the pre-fingerprint
  project-level file; the user refreshes it after adding SHA-1 fingerprints.
- This repo is NOT a Lovable project. Do not route edits through Lovable.

## Rules

- Never commit server secrets. Only publishable Firebase client keys belong in
  the repo/bundle.
- Never ask the user for passwords, OTPs, or keystore secrets in chat. The
  keystore is generated and kept on the user's own computer only.
- Profile saves MUST use `setDoc(..., { merge: true })` and MUST NOT include
  admin-managed fields (`status`, `warnings`, `warning_history`, `held_at`,
  `held_reason`) — merge semantics keep admin-set hold/warning data intact
  across profile saves.
- Hold enforcement (admin-managed from the Driver Saathi admin panel):
  - A held mechanic (`mechanics/{uid}.status == "held"`) sees a hold banner,
    cannot go ONLINE (and is forced offline if still online), and cannot
    accept new requests — enforced in the app UI AND server-side by the
    Driver Saathi Firestore rules (a held mechanic's SOS accept is rejected).
  - A mechanic held MID-JOB must still be able to finish that job (mark
    on-way/completed) — never block completion, or the driver is stranded.
  - Missing `status` on old mechanic docs counts as NOT held.
- SOS accept MUST use a Firestore transaction: accept only if the request is
  still `pending`, then claim `sos_request_details` (driver phone + exact
  location) in the same flow.
- Ask before adding a new dependency. Prefer small, reviewable changes; one
  feature per commit.
- Run typecheck and build before saying a task is done, and show the output.
  Never edit a test to make it pass — fix the code.

## Commands

- Install: `bun install` (or the package manager in `package.json`)
- Typecheck: `bun x tsc -b` (or the repo's typecheck script)
- Build: `bun run build` (emits `dist/`)
- Android sync (after a fresh clone + build): `bun x cap add android`,
  place `google-services.json` in `android/app/`, then `bun x cap sync android`

## Data model (shared Firebase project)

- `mechanics/{uid}` — one doc per mechanic, keyed by Auth uid: name, shopName,
  phone, categories (tyre/mechanic/battery/other), charges, workingHours, lat,
  lng, geohash, serviceRadiusKm (5–30), isOnline, isVerified, rating,
  totalJobs, plus admin-managed `status` ("active"|"held"), `warnings`,
  `warning_history`, `held_reason`, `held_at`.
- `sos_requests/{id}` — public request docs: driverId, category, description,
  approxLat/approxLng (~1.1 km rounding) + geohash, areaText, status
  (pending → accepted → onway → completed/cancelled), mechanicId/Name/Phone,
  chargesAgreed, rating. NO driver phone, NO exact coords here.
- `sos_request_details/{id}` — private: driverPhone, exactLat/exactLng,
  driverId, mechanicId (claimed by the assigned mechanic after accept).
- `config/admin` — admin-managed app config, incl. `mechanic_strike_limit`
  (default 3; reaching it auto-holds the mechanic).

## How work ships (do not improvise a different route)

- The sandbox GitHub App token is READ-ONLY and `git push` has no credentials.
  All GitHub writes go through the **GitHub web UI in the signed-in browser**,
  one file per commit, direct to `main`.
- Android packages are built as zips for the user to build on his own computer
  (the sandbox cannot run Gradle). Browser tasks CANNOT open localhost, so
  local web-flow tests must run on the user's machine, never via a browser
  task against localhost.

## Known limits (do not "fix" without asking)

- OTP SMS quota is 10/day on new Firebase projects until Blaze is active.
- Android phone auth REQUIRES SHA-1 fingerprints in the Firebase console
  (debug + upload + Play signing) at APK build time.
- Background delivery (2026-10-22): a Permissions onboarding screen
  (`/permissions`, gated before Home) verifies notifications, draw-over-apps,
  battery exemption, and vendor autostart via the local
  `plugins/mechanic-permissions` Capacitor plugin (Java); going ONLINE starts
  a foreground service so the Firestore listener keeps running while the app
  is backgrounded, and new requests raise a local notification (tap opens
  the request). LIMITS: autostart grant state is NOT readable on Android —
  that row only records that the mechanic opened the vendor screen; the
  listener lives in HomePage, so a mechanic browsing Jobs/Profile gets no
  ping until back on Home; and if Android kills the process (or the phone
  reboots), nothing wakes the app — true push still needs FCM via Cloud
  Functions, which are Blaze-gated.
- Login = Google only + one-time phone verification (user decision
  2026-10-22, OTP-cost reason): auth uses explicit
  `browserLocalPersistence`, so one Google login survives app close, full
  kill, and phone restart — no re-login at all. The ID token refreshes
  silently (free). Re-login happens only on explicit Logout, app-data
  clear, or account change. OTP is sent ONLY at profile time to verify
  the mobile number (linkWithPhoneNumber); only a verified number is
  saved on the mechanics doc (`phone` + `phoneVerified: true` +
  `phoneVerifiedAt`); changing the number requires a fresh OTP for the
  new number, leaving a verified number untouched needs no OTP. `/login`
  redirects an already-signed-in mechanic to Home, so no login form can
  ever trigger an SMS.
- Google sign-in on Android REQUIRES SHA-1 fingerprints in the Firebase
  console (debug + upload + Play signing) and a post-fingerprint
  google-services.json refresh — without them the native plugin returns
  no ID token and sign-in fails (friendly error tells the user this).
- First-open safety (user requirement 2026-10-22: install ke baad app
  khulte hi crash/problem nahi honi chahiye): AuthProvider ALWAYS resolves
  loading (profile-read failure → null profile, never a stuck loading
  screen); permission checks are fail-soft (native check failure → all
  rows "missing", never a crash or false green); Google plugin errors
  surface as friendly messages, never uncaught. Plugin registration is
  verified by `cap sync` (capacitor.plugins.json must list
  FirebaseAuthenticationPlugin) before any zip ships. Real-device open
  can only be verified on the user's phone (sandbox cannot run Gradle);
  the zip's BUILD_GUIDE carries a first-open checklist for both apps.
- No staging environment: one Firebase project serves production.
