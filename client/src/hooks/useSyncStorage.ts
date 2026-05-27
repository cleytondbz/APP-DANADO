import { useEffect, useRef } from 'react';

/**
 * Hook para sincronizar dados entre abas/navegadores usando localStorage
 * Sincroniza automaticamente quando dados mudam e quando outra aba faz alterações
 */
export function useSyncStorage(
  storageKey: string,
  data: any,
  onDataChanged?: (newData: any) => void
) {
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Salvar dados no localStorage quando mudam
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
        console.log(`[Storage] Saved ${storageKey}:`, data);
      } catch (error) {
        console.error(`[Storage] Error saving ${storageKey}:`, error);
      }
    }, 500); // Debounce de 500ms

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [data, storageKey]);

  // Sincronizar quando outra aba faz alterações
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue) {
        try {
          const newData = JSON.parse(event.newValue);
          console.log(`[Storage] Received update from another tab for ${storageKey}:`, newData);
          if (onDataChanged) {
            onDataChanged(newData);
          }
        } catch (error) {
          console.error(`[Storage] Error parsing ${storageKey}:`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey, onDataChanged]);
}
