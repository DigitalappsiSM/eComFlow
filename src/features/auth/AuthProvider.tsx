import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, firebaseError } from '@/lib/firebase';
import { fetchUser } from '@/repositories/users.repository';
import type { AppUser } from '@/types/user';
import { AuthContext, type AuthState } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    let authRequest = 0;
    const unsub = onAuthStateChanged(auth, async (user) => {
      const request = ++authRequest;

      // Firebase entrega primero la sesión y después consultamos el perfil en
      // Firestore. Mantener el estado de carga durante ambas operaciones evita
      // interpretar temporalmente un perfil pendiente como acceso denegado.
      setLoading(true);
      setFirebaseUser(user);
      setAppUser(null);

      let nextAppUser: AppUser | null = null;
      if (user) {
        try {
          nextAppUser = await fetchUser(user.uid);
        } catch {
          nextAppUser = null;
        }
      }

      // Ignorar una consulta anterior si el estado de autenticación cambió
      // mientras Firestore respondía (por ejemplo, al cerrar sesión).
      if (request !== authRequest) return;

      setAppUser(nextAppUser);
      setLoading(false);
    });

    return () => {
      authRequest += 1;
      unsub();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      firebaseUser,
      appUser,
      configError: firebaseError,
      async signIn(email: string, password: string) {
        if (!auth) throw new Error(firebaseError ?? 'Firebase no configurado.');
        await signInWithEmailAndPassword(auth, email, password);
      },
      async signOut() {
        if (!auth) return;
        await fbSignOut(auth);
      },
      async changePassword(currentPassword: string, newPassword: string) {
        if (!auth) throw new Error(firebaseError ?? 'Firebase no configurado.');
        const user = auth.currentUser;
        if (!user?.email) throw new Error('No hay una sesión activa.');
        // Reautenticar con la contraseña actual antes de cambiarla: Firebase
        // exige credenciales recientes para operaciones sensibles.
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
      },
      async sendPasswordReset(email: string) {
        if (!auth) throw new Error(firebaseError ?? 'Firebase no configurado.');
        await sendPasswordResetEmail(auth, email);
      },
    }),
    [loading, firebaseUser, appUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
