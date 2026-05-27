// API service for communicating with the backend server
const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = {
  // ==================== STORES ====================
  async getStores() {
    const res = await fetch(`${API_BASE_URL}/stores`);
    return res.json();
  },

  async createStore(id: string, storeName: string, cnpj: string) {
    const res = await fetch(`${API_BASE_URL}/stores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, storeName, cnpj }),
    });
    return res.json();
  },

  // ==================== CATEGORIES ====================
  async getCategories(storeId: string) {
    const res = await fetch(`${API_BASE_URL}/categories/${storeId}`);
    return res.json();
  },

  async createCategory(id: string, storeId: string, name: string, operation: 'add' | 'subtract' | 'null', order: number) {
    const res = await fetch(`${API_BASE_URL}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, storeId, name, operation, order }),
    });
    return res.json();
  },

  async updateCategory(id: string, name?: string, operation?: 'add' | 'subtract' | 'null', order?: number) {
    const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, operation, order }),
    });
    return res.json();
  },

  async deleteCategory(id: string) {
    const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  // ==================== ENTRIES ====================
  async getEntries(storeId: string, year: number, month: number) {
    const res = await fetch(`${API_BASE_URL}/entries/${storeId}/${year}/${month}`);
    return res.json();
  },

  async createEntry(id: string, storeId: string, date: string, values: Record<string, number>) {
    const res = await fetch(`${API_BASE_URL}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, storeId, date, values }),
    });
    return res.json();
  },

  async updateEntry(id: string, values: Record<string, number>) {
    const res = await fetch(`${API_BASE_URL}/entries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    return res.json();
  },

  // ==================== DEBTS ====================
  async getDebts() {
    const res = await fetch(`${API_BASE_URL}/debts`);
    return res.json();
  },

  async createDebt(id: string, personName: string, description: string, amount: number, date: string) {
    const res = await fetch(`${API_BASE_URL}/debts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, personName, description, amount, date }),
    });
    return res.json();
  },

  async updateDebt(id: string, paid?: boolean, paidDate?: string, paidAmount?: number) {
    const res = await fetch(`${API_BASE_URL}/debts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid, paidDate, paidAmount }),
    });
    return res.json();
  },

  async deleteDebt(id: string) {
    const res = await fetch(`${API_BASE_URL}/debts/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  // ==================== HEALTH ====================
  async health() {
    try {
      const res = await fetch(`${API_BASE_URL.replace('/api', '')}/api/health`);
      return res.json();
    } catch {
      return { status: 'error' };
    }
  },
};
