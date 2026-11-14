'use client';

import { useEffect, useState } from 'react';

/**
 * True from Tailwind's `lg` breakpoint (1024px) up, where list screens show
 * their detail beside the list instead of on a new page. False on the server
 * and the first client render, so a phone never flashes the wide layout.
 */
export function useWide(query = '(min-width: 1024px)'): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

export default useWide;
