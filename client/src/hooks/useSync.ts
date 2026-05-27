import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

export function useSync(
  stores: Record<string, any>,
  debts: any[],
  onStoresUpdate: (stores: Record<string, any>) => void,
  onDebtsUpdate: (debts: any[]) => void,
) {
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    // Check if server is available
    const checkServer = async () => {
      try {
        const health = await api.health();
        if (health.status === 'ok') {
          console.log('[Sync] Server is available, starting sync...');
          startSync();
        } else {
          console.log('[Sync] Server not available, using localStorage only');
        }
      } catch (e) {
        console.log('[Sync] Server not available, using localStorage only');
      }
    };

    checkServer();

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  const startSync = () => {
    // Sync every 5 seconds
    syncIntervalRef.current = setInterval(() => {
      syncData();
    }, 5000);
  };

  const syncData = async () => {
    try {
      const now = Date.now();
      if (now - lastSyncRef.current < 2000) return; // Prevent too frequent syncs
      lastSyncRef.current = now;

      // Sync stores and categories
      for (const [storeId, store] of Object.entries(stores)) {
        // Sync categories
        if (store.categories && Array.isArray(store.categories)) {
          for (const cat of store.categories) {
            try {
              await api.updateCategory(cat.id, cat.name, cat.operation, cat.order);
            } catch (e) {
              console.error('[Sync] Error syncing category:', e);
            }
          }
        }

        // Sync entries
        if (store.months && Array.isArray(store.months)) {
          for (const month of store.months) {
            if (month.entries && Array.isArray(month.entries)) {
              for (const entry of month.entries) {
                try {
                  await api.updateEntry(entry.id || `${storeId}-${entry.date}`, entry.values);
                } catch (e) {
                  console.error('[Sync] Error syncing entry:', e);
                }
              }
            }
          }
        }
      }

      // Sync debts
      if (debts && Array.isArray(debts)) {
        for (const debt of debts) {
          try {
            await api.updateDebt(debt.id, debt.paid, debt.paidDate, debt.paidAmount);
          } catch (e) {
            console.error('[Sync] Error syncing debt:', e);
          }
        }
      }

      console.log('[Sync] Data synced successfully');
    } catch (e) {
      console.error('[Sync] Error during sync:', e);
    }
  };

  const pullData = async () => {
    try {
      console.log('[Sync] Pulling data from server...');
      
      // Pull debts
      const serverDebts = await api.getDebts();
      if (serverDebts && Array.isArray(serverDebts)) {
        onDebtsUpdate(serverDebts);
      }

      console.log('[Sync] Data pulled successfully');
    } catch (e) {
      console.error('[Sync] Error pulling data:', e);
    }
  };

  return { pullData, syncData };
}
