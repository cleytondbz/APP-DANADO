import { VercelRequest, VercelResponse } from '@vercel/node';

// Simulação de banco de dados em memória (em produção, usar banco de dados real)
const database: Record<string, any> = {};

export default function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action, userId = 'default-user', data } = req.body;

  try {
    // Inicializar dados do usuário se não existirem
    if (!database[userId]) {
      database[userId] = {
        settings: { password: '2512' },
        stores: {
          loja1: { storeId: 'loja1', storeName: 'Loja 1', cnpj: '09.545.637/0001/38', months: [], categories: [] },
          loja2: { storeId: 'loja2', storeName: 'Loja 2', cnpj: '42.016.151/0001-88', months: [], categories: [] },
        },
        debts: [],
      };
    }

    switch (action) {
      case 'load':
        // Carregar todos os dados
        return res.status(200).json({
          success: true,
          data: database[userId],
        });

      case 'save-settings':
        // Salvar configurações
        database[userId].settings = data;
        return res.status(200).json({ success: true });

      case 'save-stores':
        // Salvar lojas
        database[userId].stores = data;
        return res.status(200).json({ success: true });

      case 'save-debts':
        // Salvar dívidas
        database[userId].debts = data;
        return res.status(200).json({ success: true });

      case 'save-all':
        // Salvar tudo
        database[userId] = data;
        return res.status(200).json({ success: true });

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
