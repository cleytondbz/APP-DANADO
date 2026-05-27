import { VercelRequest, VercelResponse } from '@vercel/node';
import mysql from 'mysql2/promise';

const dataStore: Record<string, any> = {
  debts: [],
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
    console.error('[Debts] Database error:', error);
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
    const { id } = req.query;

    if (req.method === 'GET') {
      if (pool) {
        const connection = await pool.getConnection();
        const [debts] = await connection.execute('SELECT * FROM debts');
        connection.release();
        res.status(200).json(debts || []);
      } else {
        res.status(200).json(dataStore.debts);
      }
    } else if (req.method === 'POST') {
      const { id, personName, description, amount, date } = req.body;
      const debt = { id, personName, description, amount, date, paid: false, createdAt: new Date().toISOString() };

      if (pool) {
        const connection = await pool.getConnection();
        await connection.execute(
          'INSERT INTO debts (id, personName, description, amount, date) VALUES (?, ?, ?, ?, ?)',
          [id, personName, description, amount, date]
        );
        connection.release();
      } else {
        dataStore.debts.push(debt);
      }

      res.status(200).json(debt);
    } else if (req.method === 'PUT') {
      const { paid, paidDate, paidAmount } = req.body;

      if (pool) {
        const connection = await pool.getConnection();
        await connection.execute(
          'UPDATE debts SET paid = ?, paidDate = ?, paidAmount = ? WHERE id = ?',
          [paid, paidDate, paidAmount, id]
        );
        const [result] = await connection.execute('SELECT * FROM debts WHERE id = ?', [id]);
        connection.release();
        res.status(200).json(result?.[0] || {});
      } else {
        const index = dataStore.debts.findIndex((d: any) => d.id === id);
        if (index !== -1) {
          dataStore.debts[index] = { ...dataStore.debts[index], paid, paidDate, paidAmount };
          res.status(200).json(dataStore.debts[index]);
        } else {
          res.status(404).json({ error: 'Debt not found' });
        }
      }
    } else if (req.method === 'DELETE') {
      if (pool) {
        const connection = await pool.getConnection();
        await connection.execute('DELETE FROM debts WHERE id = ?', [id]);
        connection.release();
      } else {
        dataStore.debts = dataStore.debts.filter((d: any) => d.id !== id);
      }

      res.status(200).json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[Debts] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
