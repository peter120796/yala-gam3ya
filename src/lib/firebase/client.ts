"use client";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence, type Auth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let authInstance: Auth | null = null;

/**
 * Browser Firebase Auth — used ONLY to sign in and obtain an ID token, which
 * the server exchanges for an httpOnly session cookie. The browser never
 * talks to Firestore (rules deny all client access).
 */
export function clientAuth(locale: string): Auth {
  if (!authInstance) {
    if (!config.apiKey || !config.projectId) throw new Error("Firebase web config is missing (NEXT_PUBLIC_FIREBASE_*)");
    const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);
    authInstance = getAuth(app);
    void setPersistence(authInstance, browserSessionPersistence);
    const emu = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR;
    if (emu) connectAuthEmulator(authInstance, emu, { disableWarnings: true });
  }
  authInstance.languageCode = locale === "en" ? "en" : "ar";
  return authInstance;
}
