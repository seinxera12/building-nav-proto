import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

import useNavStore from '../store/useNavStore.js';
import { flushEventQueue, getCacheMetadata, healthPing, setOfflineHandler } from '../api/index.js';

export function useNetworkStatus() {
  const setOfflineStatus = useNavStore(s => s.setOfflineStatus);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    setOfflineHandler((offline, metadata = {}) => {
      const cacheMetadata = getCacheMetadata();
      setOfflineStatus(offline, { ...metadata, cachedAt: cacheMetadata?.cachedAt });
      if (!offline && wasOfflineRef.current) {
        toast.success('Back online');
        flushEventQueue();
      }
      wasOfflineRef.current = offline;
    });

    const markOffline = (metadata = {}) => {
      const cacheMetadata = getCacheMetadata();
      setOfflineStatus(true, { ...metadata, cachedAt: cacheMetadata?.cachedAt });
      wasOfflineRef.current = true;
    };

    async function checkHealth() {
      if (!navigator.onLine) {
        markOffline({ reason: 'browser-offline' });
        return;
      }

      try {
        await healthPing();
        const cacheMetadata = getCacheMetadata();
        setOfflineStatus(false, { cachedAt: cacheMetadata?.cachedAt });
        if (wasOfflineRef.current) {
          toast.success('Back online');
          flushEventQueue();
        }
        wasOfflineRef.current = false;
      } catch (err) {
        markOffline({ reason: err.message });
      }
    }

    const onOffline = () => {
      markOffline({ reason: 'browser-offline' });
    };
    const onOnline = () => checkHealth();

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    checkHealth();
    const intervalId = window.setInterval(checkHealth, 30000);

    return () => {
      setOfflineHandler(null);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.clearInterval(intervalId);
    };
  }, [setOfflineStatus]);
}
