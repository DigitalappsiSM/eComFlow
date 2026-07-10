import { createContext } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { AppUser } from '@/types/user';

export interface AuthState {
  /** Cargando el estado inicial de sesión / documento de usuario. */
  loading: boolean;
  firebaseUser: FirebaseUser | null;
  /** Documento users/{uid}. null si no existe. */
  appUser: AppUser | null;
  /** Mensaje de configuración/estado si Firebase no está disponible. */
  configError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
