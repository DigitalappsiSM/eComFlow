/**
 * Validación de variables de entorno de Firebase (§28).
 *
 * Detecta variables faltantes y produce un error claro y accionable en lugar
 * de fallar de forma opaca dentro del SDK. Solo maneja claves PÚBLICAS de
 * cliente; nunca credenciales administrativas.
 */

export interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  useEmulators: boolean;
}

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  env: FirebaseEnv | null;
}

export function validateFirebaseEnv(
  source: Record<string, string | undefined> = import.meta.env as unknown as Record<
    string,
    string | undefined
  >,
): EnvValidationResult {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = source[key];
    return value === undefined || value.trim() === '';
  });

  if (missing.length > 0) {
    return { ok: false, missing, env: null };
  }

  return {
    ok: true,
    missing: [],
    env: {
      apiKey: source.VITE_FIREBASE_API_KEY!,
      authDomain: source.VITE_FIREBASE_AUTH_DOMAIN!,
      projectId: source.VITE_FIREBASE_PROJECT_ID!,
      storageBucket: source.VITE_FIREBASE_STORAGE_BUCKET!,
      messagingSenderId: source.VITE_FIREBASE_MESSAGING_SENDER_ID!,
      appId: source.VITE_FIREBASE_APP_ID!,
      useEmulators: source.VITE_USE_FIREBASE_EMULATORS === 'true',
    },
  };
}
