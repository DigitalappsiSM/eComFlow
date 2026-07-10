/**
 * Inicialización única de Firebase (§28, §29).
 *
 * Usa EXCLUSIVAMENTE el SDK Web modular (firebase/app, firebase/auth,
 * firebase/firestore). No usa Admin SDK, Service Accounts ni credenciales
 * secretas. Activa persistencia local (IndexedDB) multi-ventana.
 *
 * Si faltan variables de entorno, exporta `firebaseError` y deja los servicios
 * en null para que la UI muestre un estado de configuración claro, en vez de
 * romperse dentro del SDK.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { validateFirebaseEnv } from './env';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let firebaseError: string | null = null;

const validation = validateFirebaseEnv();

if (!validation.ok || validation.env === null) {
  firebaseError =
    'Faltan variables de entorno de Firebase: ' +
    validation.missing.join(', ') +
    '. Copie .env.example a .env y complete la configuración de su proyecto.';
} else {
  const env = validation.env;
  app = initializeApp({
    apiKey: env.apiKey,
    authDomain: env.authDomain,
    projectId: env.projectId,
    storageBucket: env.storageBucket,
    messagingSenderId: env.messagingSenderId,
    appId: env.appId,
  });

  auth = getAuth(app);

  // Persistencia local multi-ventana (§29).
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });

  if (env.useEmulators) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
  }
}

/** Servicios de Firebase. Serán null si la configuración es inválida. */
export { app, auth, db, firebaseError };

/** Helper para obtener Firestore garantizado (lanza si no está configurado). */
export function requireDb(): Firestore {
  if (!db) {
    throw new Error(firebaseError ?? 'Firestore no está inicializado.');
  }
  return db;
}

export function requireAuth(): Auth {
  if (!auth) {
    throw new Error(firebaseError ?? 'Firebase Auth no está inicializado.');
  }
  return auth;
}
