import { VercelRequest, VercelResponse } from '@vercel/node';
import mysql from 'mysql2/promise';

// In-memory fallback storage
const dataStore: Record<string, any> = {
  stores: [],
  categories: [],
  entries: [],
  debts: [],
};

let pool: mysql.Pool | null = null;

async function getPool() {
  if (pool) return pool;
  
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.log('[Stores] No DATABASE_URL, using in-memory storage');
      return null;
    }

    const url = new URL(dbUrl);
    pool = mysql.createPool({
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      ssl: { rejectUnauthorized: false },
    });

    const connection = await pool.getConnection();
    console.log('[Stores] Database connected');
    connection.release();
    
    return pool;
  } catch (error) {
    console.error('[Stores] Database error:', error);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const pool = await getPool();

    if (req.method === 'GET') {
      if (pool) {
        const connection = await pool.getConnection();
        const [stores] = await connection.execute('SELECT * FROM stores');
        connection.release();
        res.status(200).json(stores || []);
      } else {
        res.status(200).json(dataStore.stores);
      }
    } else if (req.method === 'POST') {
      const { id, storeName, cnpj } = req.body;
      const store = { id, storeName, cnpj, createdAt: new Date().toISOString() };

      if (pool) {
        const connection = await pool.getConnection();
        await connection.execute(
          'INSERT INTO stores (id, storeName, cnpj) VALUES (?, ?, ?)',
          [id, storeName, cnpj]
        );
        connection.release();
      } else {
        dataStore.stores.push(store);
      }

      res.status(200).json(store);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[Stores] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
