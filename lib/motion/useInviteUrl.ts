"use client";

import { useCallback, useSyncExternalStore } from 'react';

const EVENT = 'invite-url-change';
function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener('popstate', callback); window.removeEventListener(EVENT, callback); };
}
export function useInviteUrl(): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get('invite') === '1', () => false);
  const setOpen = useCallback((next: boolean) => {
    const url = new URL(window.location.href);
    if (next) {
      if (url.searchParams.get('invite') === '1') return;
      url.searchParams.set('invite', '1');
      window.history.pushState(window.history.state, '', url);
    } else {
      url.searchParams.delete('invite');
      window.history.replaceState(window.history.state, '', url);
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [open, setOpen];
}
