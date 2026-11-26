import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setSessionLostHandler, tokenStore } from '../lib/api';
import { useLanguage } from './LanguageContext';

const AuthContext = createContext(null);

export const homeFor = (role) => ({
  SYSTEM_ADMINISTRATOR: '/admin',
  JUDICIAL_POLICE_OFFICER: '/police',
  EXAMINING_MAGISTRATE: '/magistrate',
}[role] || '/login');

// status: loading | anonymous | active | expired
export function AuthProvider({ children }) {
  const { setLanguage } = useLanguage();
  const [session, setSession] = useState(() => ({ status: tokenStore.get() ? 'loading' : 'anonymous', user: null }));

  // The session is over: keep the user so the blocking sign-in screen can resume.
  const expire = useCallback(() => {
    tokenStore.clear();
    setSession((current) => (current.user
      ? { status: 'expired', user: current.user }
      : { status: 'anonymous', user: null }));
  }, []);

  useEffect(() => { setSessionLostHandler(expire); }, [expire]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get('/auth/me')
      .then(({ user }) => setSession({ status: 'active', user }))
      .catch(() => {
        tokenStore.clear();
        setSession({ status: 'anonymous', user: null });
      });
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await api.post('/auth/login', { email, password }, { auth: false });
    tokenStore.set(result.token, result.sessionMinutes);
    setLanguage(result.user.preferredLanguage);
    setSession({ status: 'active', user: result.user });
    return result;
  }, [setLanguage]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* the local session is cleared either way */ }
    tokenStore.clear();
    setSession({ status: 'anonymous', user: null });
  }, []);

  const timeout = useCallback(() => {
    // Best effort: tell the server so the expiry is recorded, then lock the screen.
    api.post('/auth/session-expired', undefined, { keepalive: true }).catch(() => {});
    expire();
  }, [expire]);

  const leave = useCallback(() => {
    tokenStore.clear();
    setSession({ status: 'anonymous', user: null });
  }, []);

  const value = useMemo(
    () => ({ ...session, login, logout, timeout, leave }),
    [session, login, logout, timeout, leave],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
