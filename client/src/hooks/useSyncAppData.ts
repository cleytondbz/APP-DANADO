import { useEffect, useRef } from 'react';

/**
 * Hook para sincronizar dados do AppContext com o servidor
 * Salva dados a cada mudança e carrega dados do servidor a cada 5 segundos
 */
export function useSyncAppData(
  settings: any,
  stores: any,
  debts: any,
  onDataLoaded?: (data: any) => void
) {
  const lastSyncRef = useRef<number>(0);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Salvar dados no servidor quando mudam
  useEffect(() => {
    const saveData = async () => {
      try {
        await fetch('/api/sync/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings, stores, debts })
        });
      } catch (error) {
        console.error('[Sync] Erro ao salvar dados:', error);
      }
    };

    // Debounce: salvar apenas 1 segundo após a última mudança
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(saveData, 1000);

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [settings, stores, debts]);

  // Carregar dados do servidor a cada 5 segundos
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/api/sync/load');
        const data = await response.json();
        
        // Verificar se os dados mudaram desde a última sincronização
        const now = Date.now();
        if (now - lastSyncRef.current > 5000) {
          lastSyncRef.current = now;
          if (onDataLoaded) {
            onDataLoaded(data);
          }
        }
      } catch (error) {
        console.error('[Sync] Erro ao carregar dados:', error);
      }
    };

    // Carregar dados imediatamente
    loadData();

    // Depois, carregar a cada 5 segundos
    const interval = setInterval(loadData, 5000);

    return () => clearInterval(interval);
  }, [onDataLoaded]);
}
