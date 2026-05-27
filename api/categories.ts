import { VercelRequest, VercelResponse } from '@vercel/node';
import mysql from 'mysql2/promise';

const dataStore: Record<string, any> = {
  categories: [],
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
    console.error('[Categories] Database error:', error);
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
    const { storeId, id } = req.query;

    if (req.method === 'GET') {
      if (pool && storeId) {
        const connection = await pool.getConnection();
        const [categories] = await connection.execute(
          'SELECT * FROM categories WHERE storeId = ?',
          [storeId]
        );
        connection.release();
        res.status(200).json(categories || []);
      } else {
        const categories = dataStore.categories.filter((c: any) => c.storeId === storeId);
        res.status(200).json(categories);
      }
    } else if (req.method === 'POST') {
      const { id, storeId, name, operation, order } = req.body;
      const category = { id, storeId, name, operation, order, createdAt: new Date().toISOString() };

      if (pool) {
        const connection = await pool.getConnection();
        await connection.execute(
          'INSERT INTO categories (id, storeId, name, operation, order_num) VALUES (?, ?, ?, ?, ?)',
          [id, storeId, name, operation, order]
        );
        connection.release();
      } else {
        dataStore.categories.push(category);
      }

      res.status(200).json(category);
    } else if (req.method === 'PUT') {
      const { name, operation, order } = req.body;

      if (pool) {
        const connection = await pool.getConnection();
        await connection.execute(
          'UPDATE categories SET name = ?, operation = ?, order_num = ? WHERE id = ?',
          [name, operation, order, id]
        );
        const [result] = await connection.execute('SELECT * FROM categories WHERE id = ?', [id]);
        connection.release();
        res.status(200).json(result?.[0] || {});
      } else {
        const index = dataStore.categories.findIndex((c: any) => c.id === id);
        if (index !== -1) {
          dataStore.categories[index] = { ...dataStore.categories[index], name, operation, order };
          res.status(200).json(dataStore.categories[index]);
        } else {
          res.status(404).json({ error: 'Category not found' });
        }
      }
    } else if (req.method === 'DELETE') {
      if (pool) {
        const connection = await pool.getConnection();
        await connection.execute('DELETE FROM categories WHERE id = ?', [id]);
        connection.release();
      } else {
        dataStore.categories = dataStore.categories.filter((c: any) => c.id !== id);
      }

      res.status(200).json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[Categories] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
