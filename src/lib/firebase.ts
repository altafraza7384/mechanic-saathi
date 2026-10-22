import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

export const app = initializeApp(firebaseConfig);
// Login persistence (OTP-cost rule): EXPLICIT browserLocalPersistence
// (IndexedDB/localStorage in the Android WebView). Ek baar Google login
// hone ke baad session device par save rehta hai — app band karne, fully
// kill karne ya phone restart karne par bhi dobara login nahi mangta.
// Firebase ID token har ghante khud-b-khud (free) refresh hota hai.
// Dobara login sirf tab lagega jab mechanic khud Logout dabaye, app data
// clear kare, ya account change ho. OTP login ke liye kabhi nahi lagta —
// OTP sirf ek baar profile me number verify karne ke liye lagta hai.
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
});
export const db = getFirestore(app);
