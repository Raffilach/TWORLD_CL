import { useEffect, useState } from "react";

import { onQueueChange } from "../offline/queue";

/** Статус сети и число несинхронизированных изменений. */
export function useSyncStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const unsubscribe = onQueueChange(setPending);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      unsubscribe();
    };
  }, []);

  return { online, pending };
}
