import { useEffect, useRef, useState } from 'react';

// A plain countdown to a deadline. Nothing on the page (mouse, keyboard, scrolling
// or requests) moves it; only a new deadline does. It compares against the wall
// clock, so a sleeping computer or background tab cannot stretch it.
export function useSessionCountdown(deadline, onTimeout) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));
  const timeout = useRef(onTimeout);
  timeout.current = onTimeout;

  useEffect(() => {
    let timer = null;
    let finished = false;
    const check = () => {
      if (finished) return;
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      if (left > 0) return;
      finished = true;
      clearInterval(timer);
      timeout.current();
    };
    timer = setInterval(check, 250);
    document.addEventListener('visibilitychange', check);
    check();
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [deadline]);

  return remaining;
}

export function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
