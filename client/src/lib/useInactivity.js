import { useEffect, useRef, useState } from 'react';

export const SESSION_MS = 15 * 60 * 1000;
export const HEARTBEAT_MS = 30 * 1000;
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];

// Counts down from the last interaction. Wall-clock based, so a sleeping
// computer or a throttled background tab cannot stretch the session.
export function useInactivity({ onTimeout, onHeartbeat }) {
  const [remaining, setRemaining] = useState(SESSION_MS);
  const handlers = useRef({ onTimeout, onHeartbeat });
  handlers.current = { onTimeout, onHeartbeat };

  useEffect(() => {
    let lastActivity = Date.now();
    let lastHeartbeat = Date.now();
    let finished = false;

    const check = () => {
      if (finished) return false;
      const left = SESSION_MS - (Date.now() - lastActivity);
      setRemaining(Math.max(0, left));
      if (left > 0) return true;
      finished = true;
      handlers.current.onTimeout();
      return false;
    };

    const onActivity = () => {
      // An interaction after the deadline must not revive the session.
      if (!check()) return;
      lastActivity = Date.now();
      if (lastActivity - lastHeartbeat >= HEARTBEAT_MS) {
        lastHeartbeat = lastActivity;
        handlers.current.onHeartbeat();
      }
      setRemaining(SESSION_MS);
    };

    EVENTS.forEach((name) => window.addEventListener(name, onActivity, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 1000);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
    };
  }, []);

  return remaining;
}

export function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
