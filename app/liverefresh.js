'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// While games are being played, reloads the page data every minute so the
// ticket tracks live scores. Pauses when the tab is in the background.
export default function LiveRefresh({ seconds = 60 }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    const onShow = () => document.visibilityState === 'visible' && router.refresh();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [router, seconds]);
  return null;
}
