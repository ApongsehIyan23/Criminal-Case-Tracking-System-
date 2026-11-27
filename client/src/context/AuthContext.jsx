import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setSessionLostHandler, tokenStore } from '../lib/api';
import { draftStore } from '../lib/draftStore';
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
  const [deadline, setDeadline] = useState(tokenStore.deadline);

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
    setDeadline(tokenStore.deadline());
    draftStore.keepOnly(result.user.userId);
    draftStore.remove('guest', 'login.email');
    draftStore.remove(result.user.userId, 'login.email');
    setLanguage(result.user.preferredLanguage);
    setSession({ status: 'active', user: result.user });
    return result;
  }, [setLanguage]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* the local session is cleared either way */ }
    tokenStore.clear();
    draftStore.clearAll();
    setSession({ status: 'anonymous', user: null });
  }, []);

  // "Continue session": a fresh 15 minutes from the server.
  const extend = useCallback(async () => {
    const result = await api.post('/auth/continue');
    // The time may have run out while the request was on its way.
    if (!tokenStore.get()) return;
    tokenStore.set(result.token, result.sessionMinutes);
    setDeadline(tokenStore.deadline());
  }, []);

  const timeout = useCallback(() => {
    // Best effort: tell the server so the expiry is recorded, then lock the screen.
    api.post('/auth/session-expired', undefined, { keepalive: true }).catch(() => {});
    expire();
  }, [expire]);

  // Drops this browser's session without contacting the server (used by activation).
  const leave = useCallback(() => {
    tokenStore.clear();
    setSession({ status: 'anonymous', user: null });
  }, []);

  const value = useMemo(
    () => ({ ...session, deadline, login, logout, extend, timeout, leave }),
    [session, deadline, login, logout, extend, timeout, leave],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
