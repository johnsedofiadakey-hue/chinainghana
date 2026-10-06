import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

export const FUNCTIONS_REGION = "europe-west1";
export const STAFF_EMAIL_DOMAIN = "cig.staff";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "demo-cig.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-cig",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "demo-cig.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
const emulatorHost = process.env.NEXT_PUBLIC_EMULATOR_HOST ?? "127.0.0.1";

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;
let storage: FirebaseStorage;

function init() {
  if (getApps().length) {
    app = getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, FUNCTIONS_REGION);
    storage = getStorage(app);
    return;
  }

  app = initializeApp(config);

  // App Check proves requests come from this site (blocks scripted spam orders). Production only.
  const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (typeof window !== "undefined" && recaptchaKey && !useEmulators) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(recaptchaKey), isTokenAutoRefreshEnabled: true });
  }

  auth = getAuth(app);

  // Offline cache so staff keep working on flaky connections.
  db =
    typeof window !== "undefined"
      ? initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        })
      : getFirestore(app);

  functions = getFunctions(app, FUNCTIONS_REGION);
  storage = getStorage(app);

  if (useEmulators) {
    // Ports can be overridden so two local test setups can run side by side.
    // (Each variable is named in full so Next.js can inline it into the browser bundle.)
    const authPort = Number(process.env.NEXT_PUBLIC_EMULATOR_AUTH_PORT ?? 9099);
    const firestorePort = Number(process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT ?? 8080);
    const functionsPort = Number(process.env.NEXT_PUBLIC_EMULATOR_FUNCTIONS_PORT ?? 5001);
    const storagePort = Number(process.env.NEXT_PUBLIC_EMULATOR_STORAGE_PORT ?? 9199);
    connectAuthEmulator(auth, `http://${emulatorHost}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, firestorePort);
    connectFunctionsEmulator(functions, emulatorHost, functionsPort);
    connectStorageEmulator(storage, emulatorHost, storagePort);
  }
}

init();

export { app, auth, db, functions, storage };
