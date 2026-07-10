import { useContext } from 'react';
import { AuthContext, type AuthState } from '@/features/auth/auth-context';

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }
  return ctx;
}
