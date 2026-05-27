import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useApp } from '@/contexts/AppContext';

export interface SyncMessage {
  type: 'caixa' | 'fechamento' | 'lancamentos' | 'opcoes' | 'dashboard' | 'totais';
  store?: 'loja1' | 'loja2';
  date?: string;
  data: Record<string, any>;
  timestamp: number;
}

export function useWebSocketSync() {
  const socketRef = useRef<Socket | null>(null);
  const app = useApp();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Conectar ao WebSocket
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        // Detectar URL do servidor (localhost ou IP da rede)
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.hostname;
        const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80);
        
        const socketUrl = `${protocol}://${host}:${port}`;

        console.log(`[WebSocket] Conectando a ${socketUrl}`);

        const socket = io(socketUrl, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: maxReconnectAttempts,
          transports: ['websocket', 'polling'],
        });

        // Evento: Conectado
        socket.on('connect', () => {
          console.log(`[WebSocket] Conectado! ID: ${socket.id}`);
          reconnectAttempts.current = 0;
        });

        // Evento: Cliente conectado
        socket.on('clientConnected', (data) => {
          console.log(`[WebSocket] Novo cliente conectado. Total: ${data.totalClients}`);
        });

        // Evento: Cliente desconectado
        socket.on('clientDisconnected', (data) => {
          console.log(`[WebSocket] Cliente desconectado. Total: ${data.totalClients}`);
        });

        // ===== SINCRONIZAÇÃO CAIXA =====
        socket.on('caixaUpdated', (message: SyncMessage) => {
          console.log(`[WebSocket] Caixa atualizada:`, message);
          // Aqui você atualiza o estado do AppContext
          if (message.store === 'loja1') {
            // Atualizar Caixa 1
          } else if (message.store === 'loja2') {
            // Atualizar Caixa 2
          }
        });

        // ===== SINCRONIZAÇÃO FECHAMENTO =====
        socket.on('fechamentoUpdated', (message: SyncMessage) => {
          console.log(`[WebSocket] Fechamento atualizado:`, message);
          // Atualizar Fechamento
        });

        // ===== SINCRONIZAÇÃO LANÇAMENTOS =====
        socket.on('lancamentosUpdated', (message: SyncMessage) => {
          console.log(`[WebSocket] Lançamentos atualizado:`, message);
          // Atualizar Lançamentos
        });

        // ===== SINCRONIZAÇÃO OPÇÕES =====
        socket.on('opcoesUpdated', (message: SyncMessage) => {
          console.log(`[WebSocket] Opções atualizada:`, message);
          // Atualizar Opções
        });

        // ===== SINCRONIZAÇÃO DASHBOARD =====
        socket.on('dashboardUpdated', (message: SyncMessage) => {
          console.log(`[WebSocket] Dashboard atualizado:`, message);
          // Atualizar Dashboard
        });

        // ===== SINCRONIZAÇÃO TOTAIS =====
        socket.on('totaisUpdated', (message: SyncMessage) => {
          console.log(`[WebSocket] Totais atualizado:`, message);
          // Atualizar Totais
        });

        // ===== SINCRONIZAÇÃO GENÉRICA =====
        socket.on('dataSynced', (message: SyncMessage) => {
          console.log(`[WebSocket] Dados sincronizados:`, message.type);
        });

        // Evento: Pong (resposta ao ping)
        socket.on('pong', (data) => {
          console.log(`[WebSocket] Pong recebido. Latência: ${Date.now() - data.timestamp}ms`);
        });

        // Evento: Erro
        socket.on('error', (error) => {
          console.error(`[WebSocket] Erro:`, error);
        });

        // Evento: Desconectado
        socket.on('disconnect', () => {
          console.log(`[WebSocket] Desconectado`);
          reconnectAttempts.current++;
        });

        socketRef.current = socket;
      } catch (error) {
        console.error(`[WebSocket] Erro ao conectar:`, error);
      }
    };

    connectWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Função para enviar atualização de Caixa
  const sendCaixaUpdate = useCallback((message: SyncMessage) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('updateCaixa', message);
    } else {
      console.warn('[WebSocket] Socket não conectado. Dados não sincronizados.');
    }
  }, []);

  // Função para enviar atualização de Fechamento
  const sendFechamentoUpdate = useCallback((message: SyncMessage) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('updateFechamento', message);
    } else {
      console.warn('[WebSocket] Socket não conectado. Dados não sincronizados.');
    }
  }, []);

  // Função para enviar atualização de Lançamentos
  const sendLancamentosUpdate = useCallback((message: SyncMessage) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('updateLancamentos', message);
    } else {
      console.warn('[WebSocket] Socket não conectado. Dados não sincronizados.');
    }
  }, []);

  // Função para enviar atualização de Opções
  const sendOpcoesUpdate = useCallback((message: SyncMessage) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('updateOpcoes', message);
    } else {
      console.warn('[WebSocket] Socket não conectado. Dados não sincronizados.');
    }
  }, []);

  // Função para enviar atualização genérica
  const sendSync = useCallback((message: SyncMessage) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('syncData', message);
    } else {
      console.warn('[WebSocket] Socket não conectado. Dados não sincronizados.');
    }
  }, []);

  // Função para verificar conexão
  const ping = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('ping');
    }
  }, []);

  // Função para obter status da conexão
  const isConnected = useCallback(() => {
    return socketRef.current?.connected ?? false;
  }, []);

  return {
    socket: socketRef.current,
    isConnected: isConnected(),
    sendCaixaUpdate,
    sendFechamentoUpdate,
    sendLancamentosUpdate,
    sendOpcoesUpdate,
    sendSync,
    ping,
  };
}
