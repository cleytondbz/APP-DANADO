// API Service for server communication
// Uses server endpoints for persistent data storage

const API_BASE = '/api';

export const serverApi = {
  // Health check
  async health() {
    try {
      const res = await fetch(`${API_BASE}/health`);
      return res.ok ? { status: 'ok' } : { status: 'error' };
    } catch {
      return { status: 'error' };
    }
  },

  // Stores
  async getStores() {
    try {
      const res = await fetch(`${API_BASE}/stores`);
      return res.ok ? res.json() : [];
    } catch {
      return [];
    }
  },

  async createStore(id: string, storeName: string, cnpj: string) {
    try {
      const res = await fetch(`${API_BASE}/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, storeName, cnpj }),
      });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  // Categories
  async getCategories(storeId: string) {
    try {
      const res = await fetch(`${API_BASE}/categories/${storeId}`);
      return res.ok ? res.json() : [];
    } catch {
      return [];
    }
  },

  async createCategory(id: string, storeId: string, name: string, operation: string, order: number) {
    try {
      const res = await fetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, storeId, name, operation, order }),
      });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  async updateCategory(id: string, name: string, operation: string, order: number) {
    try {
      const res = await fetch(`${API_BASE}/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, operation, order }),
      });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  async deleteCategory(id: string) {
    try {
      const res = await fetch(`${API_BASE}/categories/${id}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Entries
  async getEntries(storeId: string, year: number, month: number) {
    try {
      const res = await fetch(`${API_BASE}/entries/${storeId}/${year}/${month}`);
      return res.ok ? res.json() : [];
    } catch {
      return [];
    }
  },

  async createEntry(id: string, storeId: string, date: string, values: Record<string, number>) {
    try {
      const res = await fetch(`${API_BASE}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, storeId, date, values }),
      });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  async updateEntry(id: string, values: Record<string, number>) {
    try {
      const res = await fetch(`${API_BASE}/entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  // Debts
  async getDebts() {
    try {
      const res = await fetch(`${API_BASE}/debts`);
      return res.ok ? res.json() : [];
    } catch {
      return [];
    }
  },

  async createDebt(id: string, personName: string, description: string, amount: number, date: string) {
    try {
      const res = await fetch(`${API_BASE}/debts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, personName, description, amount, date }),
      });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  async updateDebt(id: string, paid: boolean, paidDate?: string, paidAmount?: number) {
    try {
      const res = await fetch(`${API_BASE}/debts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid, paidDate, paidAmount }),
      });
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  },

  async deleteDebt(id: string) {
    try {
      const res = await fetch(`${API_BASE}/debts/${id}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
