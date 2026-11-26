import { useEffect, useMemo, useState } from 'react';

export const URGENT_MS = 2 * 60 * 60 * 1000;
export const CUSTODY_MS = 48 * 60 * 60 * 1000;

// The current time as the server sees it, ticking every second. A station
// computer with a wrong clock therefore still shows the correct time remaining.
export function useServerNow(serverNow) {
  const offset = useMemo(() => (serverNow ? new Date(serverNow).getTime() - Date.now() : 0), [serverNow]);
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return Date.now() + offset;
}

export const remainingMs = (expiresAt, now) => Math.max(0, new Date(expiresAt).getTime() - now);

export const isUrgent = (expiresAt, now) => remainingMs(expiresAt, now) < URGENT_MS;

export function formatRemaining(expiresAt, now) {
  const total = Math.floor(remainingMs(expiresAt, now) / 1000);
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export const formatBytes = (bytes) => `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
