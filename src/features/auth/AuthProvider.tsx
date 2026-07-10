import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
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
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const doc = await fetchUser(user.uid);
          setAppUser(doc);
        } catch {
          setAppUser(null);
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsub;
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
    }),
    [loading, firebaseUser, appUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
