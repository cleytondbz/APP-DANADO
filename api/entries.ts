import { VercelRequest, VercelResponse } from '@vercel/node';
import mysql from 'mysql2/promise';

const dataStore: Record<string, any> = {
  entries: [],
};

let pool: mysql.Pool | null = null;

async function getPool() {
  if (pool) return pool;
  
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return null;

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
    connection.release();
    return pool;
  } catch (error) {
    console.error('[Entries] Database error:', error);
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
    const { storeId, year, month, id } = req.query;

    if (req.method === 'GET') {
      if (pool && storeId && year && month) {
        const monthStr = String(month).padStart(2, '0');
        const datePrefix = `${year}-${monthStr}`;
        const connection = await pool.getConnection();
        const [entries] = await connection.execute(
          'SELECT * FROM entries WHERE storeId = ? AND date LIKE ?',
          [storeId, `${datePrefix}%`]
        );
        connection.release();
        res.status(200).json(entries || []);
      } else {
        const entries = dataStore.entries.filter((e: any) => 
          e.storeId === storeId && e.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)
        );
        res.status(200).json(entries);
      }
    } else if (req.method === 'POST') {
      const { id, storeId, date, values } = req.body;
      const entry = { id, storeId, date, values, createdAt: new Date().toISOString() };

      if (pool) {
        const connection = await pool.getConnection();
        await connection.execute(
          'INSERT INTO entries (id, storeId, date, data) VALUES (?, ?, ?, ?)',
          [id, storeId, date, JSON.stringify(values)]
        );
        connection.release();
      } else {
        dataStore.entries.push(entry);
      }

      res.status(200).json(entry);
    } else if (req.method === 'PUT') {
      const { values } = req.body;

      if (pool) {
        const connection = await pool.getConnection();
        await connection.execute(
          'UPDATE entries SET data = ? WHERE id = ?',
          [JSON.stringify(values), id]
        );
        const [result] = await connection.execute('SELECT * FROM entries WHERE id = ?', [id]);
        connection.release();
        res.status(200).json(result?.[0] || {});
      } else {
        const index = dataStore.entries.findIndex((e: any) => e.id === id);
        if (index !== -1) {
          dataStore.entries[index] = { ...dataStore.entries[index], values };
          res.status(200).json(dataStore.entries[index]);
        } else {
          res.status(404).json({ error: 'Entry not found' });
        }
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[Entries] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
