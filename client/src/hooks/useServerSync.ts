import { useEffect, useRef, useCallback } from 'react';
import { serverApi } from '@/lib/server-api';
import type { StoreData, Debt } from '@/lib/types';

interface SyncOptions {
  enabled?: boolean;
  interval?: number; // milliseconds
  onError?: (error: Error) => void;
}

export function useServerSync(
  stores: Record<string, StoreData>,
  debts: Debt[],
  onStoresUpdate?: (stores: Record<string, StoreData>) => void,
  onDebtsUpdate?: (debts: Debt[]) => void,
  options: SyncOptions = {}
) {
  const { enabled = true, interval = 5000, onError } = options;
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);
  const isSyncingRef = useRef(false);

  // Check server availability
  const checkServerAvailability = useCallback(async () => {
    try {
      const health = await serverApi.health();
      return health.status === 'ok';
    } catch {
      return false;
    }
  }, []);

  // Sync all data to server
  const syncToServer = useCallback(async () => {
    if (!enabled || isSyncingRef.current) return;

    try {
      isSyncingRef.current = true;
      const isAvailable = await checkServerAvailability();

      if (!isAvailable) {
        console.log('[Sync] Server not available, skipping sync');
        return;
      }

      // Sync stores and categories
      for (const [storeId, store] of Object.entries(stores)) {
        // Ensure store exists on server
        try {
          await serverApi.createStore(storeId, store.storeName, store.cnpj);
        } catch {
          // Store might already exist
        }

        // Sync categories
        if (store.categories && Array.isArray(store.categories)) {
          for (const cat of store.categories) {
            try {
              await serverApi.updateCategory(cat.id, cat.name, cat.operation || 'add', cat.order || 0);
            } catch {
              // Try creating if update fails
              try {
                await serverApi.createCategory(cat.id, storeId, cat.name, cat.operation || 'add', cat.order || 0);
              } catch (e) {
                console.error('[Sync] Error syncing category:', e);
              }
            }
          }
        }

        // Sync entries
        if (store.months && Array.isArray(store.months)) {
          for (const month of store.months) {
            if (month.entries && Array.isArray(month.entries)) {
              for (const entry of month.entries) {
                  try {
                    const entryId = `${storeId}-${entry.date}`;
                    await serverApi.updateEntry(entryId, entry.values);
                  } catch {
                    // Try creating if update fails
                    try {
                      const entryId = `${storeId}-${entry.date}`;
                      await serverApi.createEntry(entryId, storeId, entry.date, entry.values);
                  } catch (e) {
                    console.error('[Sync] Error syncing entry:', e);
                  }
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
            await serverApi.updateDebt(debt.id, debt.paid, debt.paidDate, debt.paidAmount);
          } catch {
            // Try creating if update fails
            try {
              await serverApi.createDebt(debt.id, debt.personName, debt.description, debt.amount, debt.date);
            } catch (e) {
              console.error('[Sync] Error syncing debt:', e);
            }
          }
        }
      }

      console.log('[Sync] Data synced to server successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Sync] Error during sync:', err);
      onError?.(err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [stores, debts, enabled, checkServerAvailability, onError]);

  // Pull data from server
  const pullFromServer = useCallback(async () => {
    if (!enabled) return;

    try {
      const isAvailable = await checkServerAvailability();
      if (!isAvailable) {
        console.log('[Sync] Server not available, skipping pull');
        return;
      }

      // Pull debts (simpler for now)
      const serverDebts = await serverApi.getDebts();
      if (serverDebts && Array.isArray(serverDebts) && onDebtsUpdate) {
        onDebtsUpdate(serverDebts);
      }

      console.log('[Sync] Data pulled from server successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Sync] Error pulling data:', err);
      onError?.(err);
    }
  }, [enabled, checkServerAvailability, onDebtsUpdate, onError]);

  // Start periodic sync
  useEffect(() => {
    if (!enabled) return;

    // Initial pull
    pullFromServer();

    // Start sync interval
    syncIntervalRef.current = setInterval(() => {
      const now = Date.now();
      if (now - lastSyncRef.current >= interval) {
        lastSyncRef.current = now;
        syncToServer();
      }
    }, Math.max(1000, interval / 2)); // Check at least every second

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [enabled, interval, syncToServer, pullFromServer]);

  return { syncToServer, pullFromServer };
}
