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
  /**
   * Cambia la contraseña del usuario autenticado. Reautentica con la
   * contraseña actual antes de actualizarla (§27).
   */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /**
   * Envía un correo de restablecimiento de contraseña (autoservicio para
   * usuarios que no pueden iniciar sesión, §27).
   */
  sendPasswordReset: (email: string) => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
