// Brings custody timers up to date when the app loads and every minute while it
// stays open. `synced` counts finished checks. `version` changes only when a
// check found something new, so case views reload no more than needed.
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

const CustodySyncContext = createContext({ version: 0, synced: 0 });
const EVERY_MS = 60 * 1000;

export function CustodySyncProvider({ active, children }) {
  const [state, setState] = useState({ version: 0, synced: 0 });

  useEffect(() => {
    if (!active) return undefined;
    let current = true;
    const sync = () => api.post('/custody/sync')
      .then((result) => {
        if (!current) return;
        const changed = Boolean(result?.expired || result?.alerted);
        setState((s) => ({ version: s.version + (changed ? 1 : 0), synced: s.synced + 1 }));
      })
      .catch(() => {});
    sync();
    const timer = setInterval(sync, EVERY_MS);
    return () => { current = false; clearInterval(timer); };
  }, [active]);

  return <CustodySyncContext.Provider value={state}>{children}</CustodySyncContext.Provider>;
}

export const useCustodySync = () => useContext(CustodySyncContext);
