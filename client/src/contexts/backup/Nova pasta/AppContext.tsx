import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { AppSettings, StoreData, Category, DayEntry, MonthData, Debt, StoreId, AppScreen, MainTab } from '@/lib/types';
import { DEFAULT_CATEGORIES, DEFAULT_CAIXA_CATEGORIES, DEFAULT_FECHAMENTO_CATEGORIES } from '@/lib/types';
import { generateId } from '@/lib/helpers';
import { useSyncServer } from '@/hooks/useSyncServer';
import { useSyncStorage } from '@/hooks/useSyncStorage';

interface AppContextType {
  saldoDia: number;
  setSaldoDia: (value: number) => void;
  caixaData: Record<string, any>;
  setCaixaData: (value: Record<string, any>) => void;
  fechamentoData: Record<string, any>;
  setFechamentoData: (value: Record<string, any>) => void;
  settings: AppSettings;
  updatePassword: (p: string) => void;
  updateFieldMapping: (lan: 'lan1' | 'lan2', mapping: any[]) => void;
  updateLancamentosFontSize: (size: 'xs' | 'sm' | 'base' | 'lg' | 'xl') => void;
  updateLancamentosHeaderFontSize: (size: 'xs' | 'sm' | 'base' | 'lg' | 'xl') => void;
  updateDasColors: (colors: { primary?: string; secondary?: string; accent?: string }) => void;
  updateDasChartType: (type: 'bar' | 'line') => void;
  updateDateProtection: (protection: 'none' | 'day' | 'month') => void;
  getActionUsers: () => any[];
  addActionUser: (name: string, password: string, permissions: any[]) => void;
  updateActionUser: (id: string, updates: any) => void;
  removeActionUser: (id: string) => void;
  validateActionPassword: (password: string, action: string) => boolean;
  logAccess: (action: string, status: 'success' | 'failed', userName?: string, details?: string) => void;
  getAccessLogs: () => any[];
  clearAccessLogs: () => void;
  addTimelineEntry: (module: 'caixa' | 'fechamento' | 'lancamentos', action: 'create' | 'update' | 'delete', date: string, field?: string, oldValue?: string | number, newValue?: string | number, description?: string) => void;
  getTimeline: () => any[];
  clearTimeline: () => void;
  getCaixaCategories: () => { id: string; name: string }[];
  addCaixaCategory: (name: string) => void;
  removeCaixaCategory: (id: string) => void;
  getFechamentoCategories: () => { id: string; name: string }[];
  addFechamentoCategory: (name: string) => void;
  removeFechamentoCategory: (id: string) => void;
  stores: Record<string, StoreData>;
  currentStore: StoreId;
  setCurrentStore: (s: StoreId) => void;
  getCategories: () => Category[];
  addCategory: (name: string, op: 'add' | 'subtract' | 'null') => void;
  removeCategory: (id: string) => void;
  updateCategory: (id: string, u: Partial<Category>) => void;
  getMonthData: (y: number, m: number) => MonthData | undefined;
  saveEntry: (date: string, values: Record<string, number>) => void;
  deleteEntry: (date: string) => void;
  debts: Debt[];
  addDebt: (name: string, desc: string, amount: number, date: string) => void;
  payDebt: (id: string, amt?: number) => void;
  removeDebt: (id: string) => void;
  updateDebt: (id: string, updates: Partial<Debt>) => void;
  selectedYear: number;
  selectedMonth: number;
  setSelectedYear: (y: number) => void;
  setSelectedMonth: (m: number) => void;
  filterMonths: number;
  setFilterMonths: (m: number) => void;
  screen: AppScreen;
  setScreen: (s: AppScreen) => void;
  tab: MainTab;
  setTab: (t: MainTab) => void;
  isLoading: boolean;
  isOnline: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be within AppProvider');
  return ctx;
};

const KEYS = { SETTINGS: 'fd_settings', STORES: 'fd_stores', DEBTS: 'fd_debts' };

const defaultSettings: AppSettings = {
  password: '2512',
  caixaCategories: DEFAULT_CAIXA_CATEGORIES,
  fechamentoCategories: DEFAULT_FECHAMENTO_CATEGORIES,
  fieldMappingLan1: [
    { fechamento_field: 'dinheiro', lancamento_field: 'dinheiro' },
    { fechamento_field: 'pix', lancamento_field: 'pix' },
    { fechamento_field: 'sobra', lancamento_field: 'sobra' },
    { fechamento_field: 'cartao', lancamento_field: 'cartao' },
    { fechamento_field: 'boleto', lancamento_field: 'boleto' },
    { fechamento_field: 'sangria', lancamento_field: 'sangria' },
    { fechamento_field: 'despesa', lancamento_field: 'est_desp' },
  ],
  fieldMappingLan2: [
    { fechamento_field: 'dinheiro', lancamento_field: 'dinheiro' },
    { fechamento_field: 'pix', lancamento_field: 'pix' },
    { fechamento_field: 'sobra', lancamento_field: 'sobra' },
    { fechamento_field: 'cartao', lancamento_field: 'cartao' },
    { fechamento_field: 'boleto', lancamento_field: 'boleto' },
    { fechamento_field: 'sangria', lancamento_field: 'sangria' },
    { fechamento_field: 'despesa', lancamento_field: 'est_desp' },
  ],
};

const mkStore = (id: StoreId, name: string, cnpj: string): StoreData => ({
  storeId: id, storeName: name, cnpj, months: [], categories: [...DEFAULT_CATEGORIES],
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [stores, setStores] = useState<Record<string, StoreData>>({
    loja1: mkStore('loja1', 'Loja 1', '09.545.637/0001/38'),
    loja2: mkStore('loja2', 'Loja 2', '42.016.151/0001-88'),
  });
  const [currentStore, setCurrentStore] = useState<StoreId>('loja1');
  const [debts, setDebts] = useState<Debt[]>([]);
  const [saldoDia, setSaldoDia] = useState<number>(0);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [filterMonths, setFilterMonths] = useState(1);
  const [screen, setScreen] = useState<AppScreen>('selection');
  const [tab, setTab] = useState<MainTab>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);

  const { loadFromServer, saveToServer, isConfigured } = useSyncServer();
  
  // Estado para dados de Caixa e Fechamento (sincronizados com servidor)
  // Estrutura: { loja1: { data: {...} }, loja2: { data: {...} } }
  const [caixaData, setCaixaData] = useState<Record<string, Record<string, any>>>({});
  const [fechamentoData, setFechamentoData] = useState<Record<string, Record<string, any>>>({});
  const [isOnline, setIsOnline] = useState(true);

  // Detectar conexão online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Carregar dados na inicialização
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Tentar carregar do servidor primeiro
        const serverData = await loadFromServer();
        
        if (serverData) {
          // Dados do servidor disponíveis
          setSettings(serverData.settings || defaultSettings);
          
          // Garantir que stores sempre tenha as lojas padrão
          const defaultStores = {
            loja1: mkStore('loja1', 'Loja 1', '09.545.637/0001/38'),
            loja2: mkStore('loja2', 'Loja 2', '42.016.151/0001-88'),
          };
          
          const storesFromServer = serverData.stores || {};
          const mergedStores = Object.keys(storesFromServer).length > 0 
            ? storesFromServer 
            : defaultStores;
          
          setStores(mergedStores);
          setDebts(serverData.debts || []);
          setSaldoDia(serverData.saldoDia || 0);
          // Se o servidor não tem dados de caixa/fechamento, tentar localStorage
          const caixaFromServer = serverData.caixa || {};
          const fechamentoFromServer = serverData.fechamento || {};
          
          // Se servidor está vazio, usar localStorage como fallback
          if (Object.keys(caixaFromServer).length === 0) {
            const cx = localStorage.getItem('fd_caixa');
            if (cx) {
              const parsed = JSON.parse(cx);
              setCaixaData(parsed);
            } else {
              setCaixaData({ loja1: {}, loja2: {} });
            }
          } else {
            setCaixaData(caixaFromServer);
          }
          
          if (Object.keys(fechamentoFromServer).length === 0) {
            const fech = localStorage.getItem('fd_fechamento');
            if (fech) {
              const parsed = JSON.parse(fech);
              setFechamentoData(parsed);
            } else {
              setFechamentoData({ loja1: {}, loja2: {} });
            }
          } else {
            setFechamentoData(fechamentoFromServer);
          }
          
          console.log('[AppContext] Loaded from server');
        } else {
          // Fallback para localStorage
          const s = localStorage.getItem(KEYS.SETTINGS);
          const st = localStorage.getItem(KEYS.STORES);
          const d = localStorage.getItem(KEYS.DEBTS);
          const sd = localStorage.getItem('fd_saldoDia');
          const cx = localStorage.getItem('fd_caixa');
          const fech = localStorage.getItem('fd_fechamento');
          if (s) setSettings(JSON.parse(s));
          if (st) setStores(JSON.parse(st));
          if (d) setDebts(JSON.parse(d));
          if (sd) setSaldoDia(JSON.parse(sd));
          if (cx) setCaixaData(JSON.parse(cx));
          if (fech) setFechamentoData(JSON.parse(fech));
          console.log('[AppContext] Loaded from localStorage');
        }
      } catch (e) {
        console.error('[AppContext] Init error:', e);
      }
      setIsLoading(false);
      setHasInitialized(true);
    };

    initializeData();
  }, []);

  // Sincronizar com servidor quando dados mudam
  useEffect(() => {
    if (!isLoading && hasInitialized && isOnline) {
      const syncData = async () => {
        const success = await saveToServer({ settings, stores, debts, saldoDia, caixa: caixaData, fechamento: fechamentoData });
        if (success) {
          console.log('[AppContext] Synced to server');
        }
      };

      // Sincronizar após 1 segundo de inatividade
      const timer = setTimeout(syncData, 1000);
      return () => clearTimeout(timer);
    }
  }, [settings, stores, debts, saldoDia, caixaData, fechamentoData, isLoading, hasInitialized, isOnline]);

  // Salvar em localStorage como fallback
  useEffect(() => {
    if (!isLoading && hasInitialized) {
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
      localStorage.setItem(KEYS.STORES, JSON.stringify(stores));
      localStorage.setItem(KEYS.DEBTS, JSON.stringify(debts));
      localStorage.setItem('fd_saldoDia', JSON.stringify(saldoDia));
      localStorage.setItem('fd_caixa', JSON.stringify(caixaData));
      localStorage.setItem('fd_fechamento', JSON.stringify(fechamentoData));
    }
  }, [settings, stores, debts, saldoDia, caixaData, fechamentoData, isLoading, hasInitialized]);

  // Sincronizar dados com localStorage entre abas
  useSyncStorage(KEYS.SETTINGS, settings);
  useSyncStorage(KEYS.STORES, stores);
  useSyncStorage('fd_saldoDia', saldoDia, setSaldoDia);
  useSyncStorage(KEYS.DEBTS, debts, (data) => {
    setDebts(data);
  });

  // Sincronização com servidor é feita via useSyncServer (loadFromServer/saveToServer)
  // que já está configurado acima

  const updatePassword = (p: string) => setSettings(s => ({ ...s, password: p }));

  const updateFieldMapping = (lan: 'lan1' | 'lan2', mapping: any[]) => {
    const key = lan === 'lan1' ? 'fieldMappingLan1' : 'fieldMappingLan2';
    setSettings(s => ({ ...s, [key]: mapping }));
  };

  const updateLancamentosFontSize = (size: 'xs' | 'sm' | 'base' | 'lg' | 'xl') => {
    setSettings(s => ({ ...s, lancamentosFontSize: size }));
  };

  const updateLancamentosHeaderFontSize = (size: 'xs' | 'sm' | 'base' | 'lg' | 'xl') => {
    setSettings(s => ({ ...s, lancamentosHeaderFontSize: size }));
  };

  const updateDasColors = (colors: { primary?: string; secondary?: string; accent?: string }) => {
    setSettings(s => ({ ...s, dasColors: { ...s.dasColors, ...colors } }));
  };

  const updateDasChartType = (type: 'bar' | 'line') => {
    setSettings(s => ({ ...s, dasChartType: type }));
  };

  const updateDateProtection = (protection: 'none' | 'day' | 'month') => {
    setSettings(s => ({ ...s, dateProtection: protection }));
  };

  const getCaixaCategories = useCallback(() => {
    return settings.caixaCategories || DEFAULT_CAIXA_CATEGORIES;
  }, [settings.caixaCategories]);

  const addCaixaCategory = (name: string) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    setSettings(s => ({
      ...s,
      caixaCategories: [...(s.caixaCategories || DEFAULT_CAIXA_CATEGORIES), { id, name }],
    }));
  };

  const removeCaixaCategory = (id: string) => {
    setSettings(s => ({
      ...s,
      caixaCategories: (s.caixaCategories || DEFAULT_CAIXA_CATEGORIES).filter(c => c.id !== id),
    }));
  };

  const getFechamentoCategories = useCallback(() => {
    return settings.fechamentoCategories || DEFAULT_FECHAMENTO_CATEGORIES;
  }, [settings.fechamentoCategories]);

  const addFechamentoCategory = (name: string) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    setSettings(s => ({
      ...s,
      fechamentoCategories: [...(s.fechamentoCategories || DEFAULT_FECHAMENTO_CATEGORIES), { id, name }],
    }));
  };

  const removeFechamentoCategory = (id: string) => {
    setSettings(s => ({
      ...s,
      fechamentoCategories: (s.fechamentoCategories || DEFAULT_FECHAMENTO_CATEGORIES).filter(c => c.id !== id),
    }));
  };

  const getCategories = useCallback(() => {
    const cats = stores[currentStore]?.categories || DEFAULT_CATEGORIES;
    return [...cats].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [stores, currentStore]);

  const addCategory = (name: string, op: 'add' | 'subtract' | 'null') => {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    setStores(p => ({
      ...p,
      [currentStore]: {
        ...p[currentStore],
        categories: [...p[currentStore].categories, { id, name, operation: op, order: p[currentStore].categories.length + 1 }],
      },
    }));
  };

  const removeCategory = (id: string) => {
    setStores(p => ({
      ...p,
      [currentStore]: { ...p[currentStore], categories: p[currentStore].categories.filter(c => c.id !== id) },
    }));
  };

  const updateCategory = (id: string, u: Partial<Category>) => {
    setStores(p => ({
      ...p,
      [currentStore]: {
        ...p[currentStore],
        categories: p[currentStore].categories.map(c => c.id === id ? { ...c, ...u } : c),
      },
    }));
  };

  const getMonthData = useCallback((y: number, m: number) => {
    return stores[currentStore]?.months.find(md => md.year === y && md.month === m);
  }, [stores, currentStore]);

  const saveEntry = (date: string, values: Record<string, number>) => {
    setStores(prev => {
      const store = { ...prev[currentStore], months: [...prev[currentStore].months] };
      const [yS, mS] = date.split('-');
      const y = parseInt(yS), m = parseInt(mS);
      let mi = store.months.findIndex(md => md.year === y && md.month === m);
      if (mi < 0) {
        store.months.push({ year: y, month: m, entries: [] });
        mi = store.months.length - 1;
      } else {
        store.months[mi] = { ...store.months[mi], entries: [...store.months[mi].entries] };
      }
      const ei = store.months[mi].entries.findIndex(e => e.date === date);
      if (ei >= 0) store.months[mi].entries[ei] = { date, values };
      else store.months[mi].entries.push({ date, values });
      return { ...prev, [currentStore]: store };
    });
  };

  const deleteEntry = (date: string) => {
    setStores(prev => {
      const store = { ...prev[currentStore], months: [...prev[currentStore].months] };
      const [yS, mS] = date.split('-');
      const y = parseInt(yS), m = parseInt(mS);
      const mi = store.months.findIndex(md => md.year === y && md.month === m);
      if (mi >= 0) {
        store.months[mi] = { ...store.months[mi], entries: store.months[mi].entries.filter(e => e.date !== date) };
      }
      return { ...prev, [currentStore]: store };
    });
  };

  const addDebt = (name: string, desc: string, amount: number, date: string) => {
    setDebts(d => [...d, { id: generateId(), personName: name, description: desc, amount, date, paid: false }]);
  };

  const payDebt = (id: string, amt?: number) => {
    setDebts(d => d.map(debt => debt.id === id ? { ...debt, paid: true, paidAmount: (debt.paidAmount || 0) + (amt || debt.amount) } : debt));
  };

  const removeDebt = (id: string) => {
    setDebts(d => d.filter(debt => debt.id !== id));
  };

  const updateDebt = (id: string, updates: Partial<Debt>) => {
    setDebts(d => d.map(debt => debt.id === id ? { ...debt, ...updates } : debt));
  };

  const getActionUsers = () => settings.actionUsers || [];

  const addActionUser = (name: string, password: string, permissions: any[]) => {
    setSettings(prev => ({
      ...prev,
      actionUsers: [...(prev.actionUsers || []), { id: generateId(), name, password, permissions }]
    }));
  };

  const updateActionUser = (id: string, updates: any) => {
    setSettings(prev => ({
      ...prev,
      actionUsers: (prev.actionUsers || []).map(u => u.id === id ? { ...u, ...updates } : u)
    }));
  };

  const removeActionUser = (id: string) => {
    setSettings(prev => ({
      ...prev,
      actionUsers: (prev.actionUsers || []).filter(u => u.id !== id)
    }));
  };

  const validateActionPassword = (password: string, action: string) => {
    const user = (settings.actionUsers || []).find(u => u.password === password && u.permissions.includes(action as any));
    return !!user;
  };

  const logAccess = (action: string, status: 'success' | 'failed', userName?: string, details?: string) => {
    const newLog = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      action: action as any,
      status,
      userName,
      details,
    };
    setSettings(s => ({
      ...s,
      accessLogs: [...(s.accessLogs || []), newLog].slice(-100), // Manter últimas 100 tentativas
    }));
  };

  const getAccessLogs = () => {
    return (settings.accessLogs || []).sort((a, b) => b.timestamp - a.timestamp);
  };

  const clearAccessLogs = () => {
    setSettings(s => ({ ...s, accessLogs: [] }));
  };

  const addTimelineEntry = (module: 'caixa' | 'fechamento' | 'lancamentos', action: 'create' | 'update' | 'delete', date: string, field?: string, oldValue?: string | number, newValue?: string | number, description?: string) => {
    const newEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      module,
      storeId: currentStore,
      action,
      date,
      field,
      oldValue,
      newValue,
      description: description || `${action === 'create' ? 'Criado' : action === 'update' ? 'Atualizado' : 'Deletado'} em ${module}`,
    };
    setSettings(s => ({
      ...s,
      timeline: [...(s.timeline || []), newEntry].slice(-500),
    }));
  };

  const getTimeline = () => {
    return (settings.timeline || []).sort((a, b) => b.timestamp - a.timestamp);
  };

  const clearTimeline = () => {
    setSettings(s => ({ ...s, timeline: [] }));
  };

  const value: AppContextType = {
    saldoDia,
    setSaldoDia,
    caixaData,
    setCaixaData,
    fechamentoData,
    setFechamentoData,
    settings,
    updatePassword,
    updateFieldMapping,
    updateLancamentosFontSize,
    updateLancamentosHeaderFontSize,
    updateDasColors,
    updateDasChartType,
    updateDateProtection,
    getActionUsers,
    addActionUser,
    updateActionUser,
    removeActionUser,
    validateActionPassword,
    logAccess,
    getAccessLogs,
    clearAccessLogs,
    addTimelineEntry,
    getTimeline,
    clearTimeline,
    getCaixaCategories,
    addCaixaCategory,
    removeCaixaCategory,
    getFechamentoCategories,
    addFechamentoCategory,
    removeFechamentoCategory,
    stores,
    currentStore,
    setCurrentStore,
    getCategories,
    addCategory,
    removeCategory,
    updateCategory,
    getMonthData,
    saveEntry,
    deleteEntry,
    debts,
    addDebt,
    payDebt,
    removeDebt,
    updateDebt,
    selectedYear,
    selectedMonth,
    setSelectedYear,
    setSelectedMonth,
    filterMonths,
    setFilterMonths,
    screen,
    setScreen,
    tab,
    setTab,
    isLoading,
    isOnline,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
