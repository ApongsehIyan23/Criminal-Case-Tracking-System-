// The one session clock, shared by every role. It counts down to the deadline,
// warns shortly before it, and ends the session at zero. Navigation bars only
// display the time it provides.
import { createContext, useContext } from 'react';
import SessionWarningModal from '../components/session/SessionWarningModal';
import { useSessionCountdown } from '../lib/useSessionCountdown';
import { useAuth } from './AuthContext';

export const WARNING_MS = 5 * 60 * 1000;
const SessionContext = createContext(0);

export function SessionProvider({ children }) {
  const { status, deadline, timeout } = useAuth();
  const active = status === 'active';
  const remaining = useSessionCountdown(active ? deadline : Infinity, timeout);
  const warning = active && remaining > 0 && remaining <= WARNING_MS;

  return (
    <SessionContext.Provider value={remaining}>
      {children}
      {warning && <SessionWarningModal remaining={remaining} />}
    </SessionContext.Provider>
  );
}

export const useSessionRemaining = () => useContext(SessionContext);
