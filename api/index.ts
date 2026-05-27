import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { createServer } from 'http';
import { setupWebSocket } from '../server/websocket';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==================== DATABASE CONNECTION ====================
let pool: mysql.Pool;

async function initDatabase() {
  try {
    const dbUrl = process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/financeiro';
    
    // Parse DATABASE_URL
    const url = new URL(dbUrl);
    const config: any = {
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: { rejectUnauthorized: false }, // Use SSL for TiDB Cloud
    };

    pool = mysql.createPool(config as any);
    
    // Test connection
    const connection = await pool.getConnection();
    console.log('[Database] Connected successfully');
    connection.release();

    // Create tables if they don't exist
    await createTables();
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    console.log('[Database] Using in-memory storage as fallback');
  }
}

async function createTables() {
  if (!pool) return;

  const connection = await pool.getConnection();
  
  try {
    // Stores table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS stores (
        id VARCHAR(50) PRIMARY KEY,
        storeName VARCHAR(255) NOT NULL,
        cnpj VARCHAR(20),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Categories table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(100) PRIMARY KEY,
        storeId VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        operation VARCHAR(20),
        order_num INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Entries table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS entries (
        id VARCHAR(100) PRIMARY KEY,
        storeId VARCHAR(50) NOT NULL,
        date DATE NOT NULL,
        data JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Debts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS debts (
        id VARCHAR(100) PRIMARY KEY,
        personName VARCHAR(255) NOT NULL,
        description TEXT,
        amount DECIMAL(10, 2),
        date DATE,
        paid BOOLEAN DEFAULT FALSE,
        paidDate DATE,
        paidAmount DECIMAL(10, 2),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('[Database] Tables created successfully');
  } catch (error) {
    console.error('[Database] Error creating tables:', error);
  } finally {
    connection.release();
  }
}

// ==================== FALLBACK IN-MEMORY STORAGE ====================
const dataStore: Record<string, any> = {
  stores: [],
  categories: [],
  entries: [],
  debts: [],
};

// ==================== HELPER FUNCTIONS ====================
async function queryDB(sql: string, params: any[] = []) {
  if (!pool) return null;
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(sql, params);
    connection.release();
    return rows;
  } catch (error) {
    console.error('[Database] Query error:', error);
    return null;
  }
}

async function executeDB(sql: string, params: any[] = []) {
  if (!pool) return null;
  try {
    const connection = await pool.getConnection();
    const result = await connection.execute(sql, params);
    connection.release();
    return result;
  } catch (error) {
    console.error('[Database] Execute error:', error);
    return null;
  }
}

// ==================== APIs REST ====================

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), database: pool ? 'connected' : 'fallback' });
});

// ==================== STORES ====================
app.get('/api/stores', async (_req: Request, res: Response) => {
  if (pool) {
    const stores = await queryDB('SELECT * FROM stores');
    res.json(stores || []);
  } else {
    res.json(dataStore.stores);
  }
});

app.post('/api/stores', async (req: Request, res: Response) => {
  const { id, storeName, cnpj } = req.body;
  const store = { id, storeName, cnpj, createdAt: new Date().toISOString() };

  if (pool) {
    await executeDB(
      'INSERT INTO stores (id, storeName, cnpj) VALUES (?, ?, ?)',
      [id, storeName, cnpj]
    );
  } else {
    dataStore.stores.push(store);
  }

  res.json(store);
});

// ==================== CATEGORIES ====================
app.get('/api/categories/:storeId', async (req: Request, res: Response) => {
  const { storeId } = req.params;

  if (pool) {
    const categories = await queryDB(
      'SELECT * FROM categories WHERE storeId = ?',
      [storeId]
    );
    res.json(categories || []);
  } else {
    const categories = dataStore.categories.filter((c: any) => c.storeId === storeId);
    res.json(categories);
  }
});

app.post('/api/categories', async (req: Request, res: Response) => {
  const { id, storeId, name, operation, order } = req.body;
  const category = { id, storeId, name, operation, order, createdAt: new Date().toISOString() };

  if (pool) {
    await executeDB(
      'INSERT INTO categories (id, storeId, name, operation, order_num) VALUES (?, ?, ?, ?, ?)',
      [id, storeId, name, operation, order]
    );
  } else {
    dataStore.categories.push(category);
  }

  res.json(category);
});

app.put('/api/categories/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, operation, order } = req.body;

  if (pool) {
    await executeDB(
      'UPDATE categories SET name = ?, operation = ?, order_num = ? WHERE id = ?',
      [name, operation, order, id]
    );
    const result = await queryDB('SELECT * FROM categories WHERE id = ?', [id]);
    res.json(result?.[0] || {});
  } else {
    const index = dataStore.categories.findIndex((c: any) => c.id === id);
    if (index !== -1) {
      dataStore.categories[index] = { ...dataStore.categories[index], name, operation, order, updatedAt: new Date().toISOString() };
      res.json(dataStore.categories[index]);
    } else {
      res.status(404).json({ error: 'Category not found' });
    }
  }
});

app.delete('/api/categories/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (pool) {
    await executeDB('DELETE FROM categories WHERE id = ?', [id]);
  } else {
    dataStore.categories = dataStore.categories.filter((c: any) => c.id !== id);
  }

  res.json({ success: true });
});

// ==================== ENTRIES ====================
app.get('/api/entries/:storeId/:year/:month', async (req: Request, res: Response) => {
  const { storeId, year, month } = req.params;
  const monthStr = String(month).padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;

  if (pool) {
    const entries = await queryDB(
      'SELECT * FROM entries WHERE storeId = ? AND date LIKE ?',
      [storeId, `${datePrefix}%`]
    );
    res.json(entries || []);
  } else {
    const entries = dataStore.entries.filter((e: any) => 
      e.storeId === storeId && e.date.startsWith(datePrefix)
    );
    res.json(entries);
  }
});

app.post('/api/entries', async (req: Request, res: Response) => {
  const { id, storeId, date, values } = req.body;
  const entry = { id, storeId, date, values, createdAt: new Date().toISOString() };

  if (pool) {
    await executeDB(
      'INSERT INTO entries (id, storeId, date, data) VALUES (?, ?, ?, ?)',
      [id, storeId, date, JSON.stringify(values)]
    );
  } else {
    dataStore.entries.push(entry);
  }

  res.json(entry);
});

app.put('/api/entries/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { values } = req.body;

  if (pool) {
    await executeDB(
      'UPDATE entries SET data = ? WHERE id = ?',
      [JSON.stringify(values), id]
    );
    const result = await queryDB('SELECT * FROM entries WHERE id = ?', [id]);
    res.json(result?.[0] || {});
  } else {
    const index = dataStore.entries.findIndex((e: any) => e.id === id);
    if (index !== -1) {
      dataStore.entries[index] = { ...dataStore.entries[index], values, updatedAt: new Date().toISOString() };
      res.json(dataStore.entries[index]);
    } else {
      res.status(404).json({ error: 'Entry not found' });
    }
  }
});

// ==================== DEBTS ====================
app.get('/api/debts', async (_req: Request, res: Response) => {
  if (pool) {
    const debts = await queryDB('SELECT * FROM debts');
    res.json(debts || []);
  } else {
    res.json(dataStore.debts);
  }
});

app.post('/api/debts', async (req: Request, res: Response) => {
  const { id, personName, description, amount, date } = req.body;
  const debt = { id, personName, description, amount, date, paid: false, createdAt: new Date().toISOString() };

  if (pool) {
    await executeDB(
      'INSERT INTO debts (id, personName, description, amount, date) VALUES (?, ?, ?, ?, ?)',
      [id, personName, description, amount, date]
    );
  } else {
    dataStore.debts.push(debt);
  }

  res.json(debt);
});

app.put('/api/debts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { paid, paidDate, paidAmount } = req.body;

  if (pool) {
    await executeDB(
      'UPDATE debts SET paid = ?, paidDate = ?, paidAmount = ? WHERE id = ?',
      [paid, paidDate, paidAmount, id]
    );
    const result = await queryDB('SELECT * FROM debts WHERE id = ?', [id]);
    res.json(result?.[0] || {});
  } else {
    const index = dataStore.debts.findIndex((d: any) => d.id === id);
    if (index !== -1) {
      dataStore.debts[index] = { ...dataStore.debts[index], paid, paidDate, paidAmount, updatedAt: new Date().toISOString() };
      res.json(dataStore.debts[index]);
    } else {
      res.status(404).json({ error: 'Debt not found' });
    }
  }
});

app.delete('/api/debts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (pool) {
    await executeDB('DELETE FROM debts WHERE id = ?', [id]);
  } else {
    dataStore.debts = dataStore.debts.filter((d: any) => d.id !== id);
  }

  res.json({ success: true });
});

// Initialize database
initDatabase().catch(error => {
  console.error('[Server] Failed to initialize database:', error);
});

// Start server with WebSocket
const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);
const io = setupWebSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[WebSocket] Listening on ws://localhost:${PORT}`);
});

const server = httpServer;

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    if (pool) {
      pool.end().catch(err => console.error('[Server] Error closing pool:', err));
    }
    process.exit(0);
  });
});

export default app;
