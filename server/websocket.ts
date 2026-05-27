import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

export interface SyncMessage {
  type: 'caixa' | 'fechamento' | 'lancamentos' | 'opcoes' | 'dashboard' | 'totais';
  store?: 'loja1' | 'loja2';
  date?: string;
  data: Record<string, any>;
  timestamp: number;
}

export function setupWebSocket(server: HTTPServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Track connected clients
  const connectedClients = new Map<string, { id: string; type: string }>();

  io.on('connection', (socket: Socket) => {
    console.log(`[WebSocket] Cliente conectado: ${socket.id}`);
    connectedClients.set(socket.id, { id: socket.id, type: 'browser' });

    // Broadcast quando um cliente se conecta
    io.emit('clientConnected', {
      clientId: socket.id,
      totalClients: connectedClients.size,
      timestamp: Date.now(),
    });

    // ===== SINCRONIZAÇÃO CAIXA =====
    socket.on('updateCaixa', (message: SyncMessage) => {
      console.log(`[WebSocket] Atualização Caixa recebida:`, message);
      
      // Broadcast para todos os clientes (incluindo o que enviou)
      io.emit('caixaUpdated', {
        ...message,
        updatedBy: socket.id,
        timestamp: Date.now(),
      });
    });

    // ===== SINCRONIZAÇÃO FECHAMENTO =====
    socket.on('updateFechamento', (message: SyncMessage) => {
      console.log(`[WebSocket] Atualização Fechamento recebida:`, message);
      
      io.emit('fechamentoUpdated', {
        ...message,
        updatedBy: socket.id,
        timestamp: Date.now(),
      });
    });

    // ===== SINCRONIZAÇÃO LANÇAMENTOS =====
    socket.on('updateLancamentos', (message: SyncMessage) => {
      console.log(`[WebSocket] Atualização Lançamentos recebida:`, message);
      
      io.emit('lancamentosUpdated', {
        ...message,
        updatedBy: socket.id,
        timestamp: Date.now(),
      });
    });

    // ===== SINCRONIZAÇÃO OPÇÕES =====
    socket.on('updateOpcoes', (message: SyncMessage) => {
      console.log(`[WebSocket] Atualização Opções recebida:`, message);
      
      io.emit('opcoesUpdated', {
        ...message,
        updatedBy: socket.id,
        timestamp: Date.now(),
      });
    });

    // ===== SINCRONIZAÇÃO DASHBOARD =====
    socket.on('updateDashboard', (message: SyncMessage) => {
      console.log(`[WebSocket] Atualização Dashboard recebida:`, message);
      
      io.emit('dashboardUpdated', {
        ...message,
        updatedBy: socket.id,
        timestamp: Date.now(),
      });
    });

    // ===== SINCRONIZAÇÃO TOTAIS =====
    socket.on('updateTotais', (message: SyncMessage) => {
      console.log(`[WebSocket] Atualização Totais recebida:`, message);
      
      io.emit('totaisUpdated', {
        ...message,
        updatedBy: socket.id,
        timestamp: Date.now(),
      });
    });

    // ===== SINCRONIZAÇÃO GENÉRICA =====
    socket.on('syncData', (message: SyncMessage) => {
      console.log(`[WebSocket] Sincronização genérica:`, message.type);
      
      // Broadcast para todos os clientes
      io.emit('dataSynced', {
        ...message,
        updatedBy: socket.id,
        timestamp: Date.now(),
      });
    });

    // ===== PING/PONG (Verificar conexão) =====
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // ===== DESCONEXÃO =====
    socket.on('disconnect', () => {
      console.log(`[WebSocket] Cliente desconectado: ${socket.id}`);
      connectedClients.delete(socket.id);

      io.emit('clientDisconnected', {
        clientId: socket.id,
        totalClients: connectedClients.size,
        timestamp: Date.now(),
      });
    });

    // ===== ERRO =====
    socket.on('error', (error) => {
      console.error(`[WebSocket] Erro no cliente ${socket.id}:`, error);
    });
  });

  return io;
}

// Função auxiliar para emitir evento para todos os clientes
export function broadcastSync(io: SocketIOServer, message: SyncMessage) {
  io.emit('dataSynced', {
    ...message,
    timestamp: Date.now(),
  });
}
