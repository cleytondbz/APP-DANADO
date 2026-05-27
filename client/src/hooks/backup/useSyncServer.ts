import { useEffect, useRef, useState } from 'react';

interface SyncData {
  settings: any;
  stores: any;
  debts: any;
  saldoDia?: number | null;
  caixa?: Record<string, any>;
  fechamento?: Record<string, any>;
}

interface UseSyncServerOptions {
  serverUrl?: string;
  userId?: string;
  onDataLoaded?: (data: SyncData) => void;
  onError?: (error: Error) => void;
  syncInterval?: number; // em ms, padrão 3000 (3 segundos)
}

export function useSyncServer(options: UseSyncServerOptions = {}) {
  // Auto-detect server URL: se estiver em 5173 (Vite), conectar ao 3000 (Express) no mesmo host
  const getDefaultServerUrl = () => {
    if (typeof window === 'undefined') return '';
    
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    
    // Se estiver em 5173 (Vite dev), conectar ao 3000 (Express) no mesmo host
    if (window.location.port === '5173') {
      return `${protocol}//${host}:3000`;
    }
    
    // Se estiver em produção, usar o mesmo host
    return `${protocol}//${host}`;
  };

  const {
    serverUrl = localStorage.getItem('fd_serverUrl') || getDefaultServerUrl(),
    userId = localStorage.getItem('fd_userId') || '',
    onDataLoaded,
    onError,
    syncInterval = 3000,
  } = options;

  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(!!serverUrl);

  // Salvar dados no servidor
  const saveToServer = async (data: SyncData) => {
    if (!serverUrl) {
      console.warn('[useSyncServer] Servidor não configurado');
      return false;
    }

    try {
      const response = await fetch(`${serverUrl}/api/sync/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(userId && { userId }),
          settings: data.settings,
          stores: data.stores,
          debts: data.debts,
          saldoDia: data.saldoDia,
          caixa: data.caixa,
          fechamento: data.fechamento,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('[useSyncServer] Dados salvos com sucesso:', result);
      return true;
    } catch (error) {
      console.error('[useSyncServer] Erro ao salvar:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  };

  // Carregar dados do servidor
  const loadFromServer = async (): Promise<SyncData | null> => {
    if (!serverUrl) {
      console.warn('[useSyncServer] Servidor não configurado');
      return null;
    }

    try {
      // Se tem userId, usar rota com userId; senão, usar rota simples
      const url = userId 
        ? `${serverUrl}/api/sync/load/${userId}`
        : `${serverUrl}/api/sync/load`;
      
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        console.log('[useSyncServer] Dados carregados:', result.data);
        lastSyncRef.current = result.timestamp;
        // Garantir que caixa e fechamento sejam objetos vazios se não existirem
        const dataWithDefaults = {
          ...result.data,
          caixa: result.data.caixa || {},
          fechamento: result.data.fechamento || {},
        };
        onDataLoaded?.(dataWithDefaults);
        return dataWithDefaults;
      }

      return null;
    } catch (error) {
      console.error('[useSyncServer] Erro ao carregar:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  };

  // Verificar status do servidor
  const checkServerHealth = async (): Promise<boolean> => {
    if (!serverUrl) {
      return false;
    }

    try {
      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
      });

      return response.ok;
    } catch (error) {
      console.warn('[useSyncServer] Servidor indisponível:', error);
      return false;
    }
  };

  // Configurar servidor (suporta HTTP e HTTPS)
  const setServer = (url: string, userId_: string) => {
    // Garantir que a URL tenha protocolo
    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Se não tiver protocolo, assumir HTTPS para evitar Mixed Content
      finalUrl = `https://${url}`;
    }
    
    localStorage.setItem('fd_serverUrl', finalUrl);
    localStorage.setItem('fd_userId', userId_);
    setIsConfigured(true);
    console.log('[useSyncServer] Servidor configurado:', finalUrl);
  };

  // Iniciar sincronização periódica
  const startSync = () => {
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
    }

    // Carregar dados imediatamente
    loadFromServer();

    // Depois sincronizar periodicamente
    syncTimerRef.current = setInterval(() => {
      loadFromServer();
    }, syncInterval);

    console.log('[useSyncServer] Sincronização iniciada (intervalo:', syncInterval, 'ms)');
  };

  // Parar sincronização
  const stopSync = () => {
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    console.log('[useSyncServer] Sincronização parada');
  };

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      stopSync();
    };
  }, []);

  return {
    saveToServer,
    loadFromServer,
    checkServerHealth,
    setServer,
    startSync,
    stopSync,
    isConfigured,
    serverUrl,
    userId,
  };
}
