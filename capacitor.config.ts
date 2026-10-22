import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.driversaathi.mechanic',
  appName: 'Mechanic Saathi',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      // The native plugin only brokers the Google account pick and returns
      // the credential; the Firebase JS SDK performs the actual sign-in, so
      // it stays the single source of truth for auth state (same pattern as
      // Driver Saathi's Google fix — signInWithRedirect on native loses its
      // result across the WebView boundary).
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
