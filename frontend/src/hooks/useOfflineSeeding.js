import { useEffect } from 'react';

import { fetchAllQrCodes, fetchGraph, seedCommonRoutes } from '../api/index.js';

const SEEDED_FLAG = 'qrnav:seeded-this-session';

export function useOfflineSeeding(floor) {
  useEffect(() => {
    if (!floor || sessionStorage.getItem(SEEDED_FLAG) === 'true') return;

    let cancelled = false;

    async function seed() {
      try {
        await Promise.all([fetchAllQrCodes(), fetchGraph()]);
        if (!cancelled) {
          await seedCommonRoutes(floor);
          sessionStorage.setItem(SEEDED_FLAG, 'true');
        }
      } catch (err) {
        console.warn('Offline seeding failed:', err);
      }
    }

    seed();

    return () => {
      cancelled = true;
    };
  }, [floor]);
}
