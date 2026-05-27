import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useSyncServer } from '@/hooks/useSyncServer';

export function ServerConfig() {
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('fd_serverUrl') || '');
  const [userId, setUserId] = useState(localStorage.getItem('fd_userId') || 'default-user');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const { setServer, checkServerHealth, startSync, stopSync } = useSyncServer();

  // Verificar conexão ao montar
  useEffect(() => {
    if (serverUrl) {
      checkConnection();
    }
  }, []);

  const checkConnection = async () => {
    setIsConnecting(true);
    const isHealthy = await checkServerHealth();
    setIsConnected(isHealthy);
    if (isHealthy) {
      toast.success('Servidor conectado!');
    } else {
      toast.error('Servidor não respondeu');
    }
    setIsConnecting(false);
  };

  const handleConnect = async () => {
    if (!serverUrl.trim()) {
      toast.error('Digite o URL do servidor');
      return;
    }

    // Validar e normalizar URL
    let urlToUse = serverUrl.trim();
    
    // Se não tiver protocolo, adicionar https://
    if (!urlToUse.startsWith('http://') && !urlToUse.startsWith('https://')) {
      urlToUse = `https://${urlToUse}`;
    }

    try {
      new URL(urlToUse);
    } catch {
      toast.error('URL inválida. Exemplo: 192.168.1.50:3000 ou https://192.168.1.50:3000');
      return;
    }

    setServer(urlToUse, userId);
    await checkConnection();

    if (isConnected) {
      startSync();
    }
  };

  const handleDisconnect = () => {
    stopSync();
    localStorage.removeItem('fd_serverUrl');
    localStorage.removeItem('fd_userId');
    setServerUrl('');
    setUserId('default-user');
    setIsConnected(false);
    toast.success('Desconectado do servidor');
  };

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border border-border">
      <h3 className="font-semibold text-foreground">Configuração do Servidor</h3>

      {isConnected ? (
        <div className="space-y-2">
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              ✅ Conectado ao servidor: <span className="font-mono">{serverUrl}</span>
            </p>
            <p className="text-xs text-green-700 mt-1">
              Usuário: <span className="font-mono">{userId}</span>
            </p>
          </div>
          <Button
            onClick={handleDisconnect}
            variant="outline"
            className="w-full"
          >
            Desconectar
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
              URL do Servidor
            </label>
            <Input
              type="text"
              placeholder="192.168.1.50:3000"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Exemplo: 192.168.1.50:3000 (HTTPS será usado automaticamente)
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
              ID do Usuário
            </label>
            <Input
              type="text"
              placeholder="seu-usuario"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Identificador único para sincronização
            </p>
          </div>

          <Button
            onClick={handleConnect}
            disabled={isConnecting || !serverUrl.trim()}
            className="w-full"
          >
            {isConnecting ? 'Conectando...' : 'Conectar ao Servidor'}
          </Button>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>Como encontrar o IP do servidor:</strong>
            </p>
            <ul className="text-xs text-blue-700 mt-2 space-y-1 ml-4">
              <li>1. Inicie o servidor Node.js no PC com: npm run start:https</li>
              <li>2. Procure pela mensagem "Acesse em:"</li>
              <li>3. Use um dos IPs listados (ex: 192.168.1.50)</li>
              <li>4. Digite apenas o IP e porta (ex: 192.168.1.50:3000)</li>
            </ul>
            <p className="text-xs text-blue-700 mt-2 font-semibold">
              ⚠️ Certificado auto-assinado: Você pode receber um aviso de segurança. Clique em "Avançado" e "Continuar" para aceitar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
