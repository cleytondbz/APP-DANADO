import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { AppSettings, StoreData, Category, DayEntry, MonthData, Debt, StoreId, AppScreen, MainTab } from '@/lib/types';
import { DEFAULT_CATEGORIES, DEFAULT_CAIXA_CATEGORIES, DEFAULT_FECHAMENTO_CATEGORIES } from '@/lib/types';
import { generateId } from '@/lib/helpers';
import { useSyncServer } from '@/hooks/useSyncServer';

interface AppContextType {
  saldoDia: number;
  setSaldoDia: (value: number) => void;
  caixaData: Record<string, any>;
  setCaixaData: (value: Record<string, any>) => void;
  fechamentoData: Record<string, any>;
  setFechamentoData: (value: Record<string, any>) => void;
  settings: AppSettings;
  setSettings: (updater: (s: AppSettings) => AppSettings) => void;
  updatePassword: (p: string) => void;
  updateFieldMapping: (lan: 'lan1' | 'lan2' | 'compacto1' | 'compacto2', mapping: any[]) => void;
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
  setStores: (value: Record<string, StoreData>) => void;
  currentStore: StoreId;
  setCurrentStore: (s: StoreId) => void;
  getCategories: () => Category[];
  addCategory: (name: string, op: 'add' | 'subtract' | 'null') => void;
  removeCategory: (id: string) => void;
  updateCategory: (id: string, u: Partial<Category>) => void;
  getMonthData: (y: number, m: number) => MonthData | undefined;
  saveEntry: (date: string, values: Record<string, number>, source?: 'sync' | 'manual') => void;
  clearManualFieldMark: (date: string, fieldId: string) => void;
  saveLancamentoEntry: (date: string, values: Record<string, number>) => void;
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

const defaultSettings: AppSettings = {
  password: '2512',
  syncPreference: 'program',
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

const parseSyncNumber = (value: any): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const buildStoresFromFechamento = (
  baseStores: Record<string, StoreData>,
  fechamento: Record<string, Record<string, any>>,
  appSettings: AppSettings
): Record<string, StoreData> => {
  const nextStores: Record<string, StoreData> = { ...baseStores };

  const storeIds = Object.keys(fechamento || {});
  storeIds.forEach((storeId) => {
    const store = nextStores[storeId];
    if (!store) return;

    const mapping = storeId === 'loja1'
      ? (appSettings.fieldMappingLan1 || [])
      : (appSettings.fieldMappingLan2 || []);

    if (!mapping.length) return;

    const monthMap = new Map<string, MonthData>();
    (store.months || []).forEach((m) => {
      monthMap.set(`${m.year}-${m.month}`, { ...m, entries: [...m.entries] });
    });

    const fechamentoPorData = fechamento[storeId] || {};
    Object.entries(fechamentoPorData).forEach(([date, fechamentoDia]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const [yS, mS] = date.split('-');
      const y = parseInt(yS, 10);
      const m = parseInt(mS, 10);
      if (!y || !m) return;

      const values: Record<string, number> = {};
      mapping.forEach((map: any) => {
        if (!map?.fechamento_field || !map?.lancamento_field) return;
        values[map.lancamento_field] = parseSyncNumber((fechamentoDia || {})[map.fechamento_field]);
      });

      const key = `${y}-${m}`;
      const monthData = monthMap.get(key) || { year: y, month: m, entries: [] };
      const entryIndex = monthData.entries.findIndex((e) => e.date === date);
      if (entryIndex >= 0) {
        const prevEntry = monthData.entries[entryIndex];
        const manualFields = prevEntry.manualFields || [];
        const mergedValues = { ...(prevEntry.values || {}) };
        Object.entries(values).forEach(([field, val]) => {
          if (!manualFields.includes(field)) {
            mergedValues[field] = val;
          }
        });
        monthData.entries[entryIndex] = { ...prevEntry, date, values: mergedValues, manualFields };
      } else {
        monthData.entries.push({ date, values, manualFields: [] });
      }
      monthMap.set(key, monthData);
    });

    nextStores[storeId] = {
      ...store,
      months: Array.from(monthMap.values()),
    };
  });

  return nextStores;
};

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
  const [hasLoadedFromServer, setHasLoadedFromServer] = useState(false);

  const { loadFromServer, saveToServer } = useSyncServer();
  
  // Estado para dados de Caixa e Fechamento (sincronizados com servidor)
  // Estrutura: { loja1: { data: {...} }, loja2: { data: {...} } }
  const [caixaData, setCaixaData] = useState<Record<string, Record<string, any>>>({});
  const [fechamentoData, setFechamentoData] = useState<Record<string, Record<string, any>>>({});
  const [lancamentosData, setLancamentosData] = useState<Record<string, Record<string, any>>>({});
  const [isOnline, setIsOnline] = useState(true);
  const [isPullingServerData, setIsPullingServerData] = useState(false);
  const lastServerSnapshotRef = useRef<string>('');
  const lastLocalChangeRef = useRef<number>(0);
  const suppressServerPushUntilRef = useRef<number>(0);

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

  // Atualizar automaticamente com alteracoes vindas de outros clientes (desktop/web), sem F5
  useEffect(() => {
    if (!hasInitialized || !hasLoadedFromServer || !isOnline) return;

    const pullLatest = async () => {
      // Evita sobrescrever alteracoes locais antes do save ao servidor concluir
      if (Date.now() - lastLocalChangeRef.current < 1800) return;

      try {
        setIsPullingServerData(true);
        const serverData = await loadFromServer();
        if (serverData) {
          const snapshot = JSON.stringify({
            settings: serverData.settings || {},
            stores: serverData.stores || {},
            debts: serverData.debts || [],
            saldoDia: serverData.saldoDia || 0,
            caixa: serverData.caixa || {},
            fechamento: serverData.fechamento || {},
            lancamentos: serverData.lancamentos || {},
          });

          if (snapshot !== lastServerSnapshotRef.current) {
            lastServerSnapshotRef.current = snapshot;
            applyServerData(serverData);
          }
        }
      } catch (e) {
        console.warn('[AppContext] Auto refresh failed:', e);
      } finally {
        setIsPullingServerData(false);
      }
    };

    const timer = setInterval(pullLatest, 1200);
    const onFocus = () => { pullLatest(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [hasInitialized, hasLoadedFromServer, isOnline, loadFromServer, applyServerData]);

  function applyServerData(serverData: any) {
    if (!serverData) return;
    suppressServerPushUntilRef.current = Date.now() + 1800;

    const mergedSettings = { ...defaultSettings, ...(serverData.settings || {}) };
    setSettings(mergedSettings);

    const defaultStores = {
      loja1: mkStore('loja1', 'Loja 1', '09.545.637/0001/38'),
      loja2: mkStore('loja2', 'Loja 2', '42.016.151/0001-88'),
    };

    const storesFromServer = serverData.stores || {};
    const mergedStores = Object.keys(storesFromServer).length > 0
      ? storesFromServer
      : defaultStores;

    const fechamento = serverData.fechamento || { loja1: {}, loja2: {} };
    const storesWithLancamentos = buildStoresFromFechamento(
      mergedStores as Record<string, StoreData>,
      fechamento,
      mergedSettings
    );
    setStores(storesWithLancamentos);
    setDebts(serverData.debts || []);
    setSaldoDia(serverData.saldoDia || 0);
    setCaixaData(serverData.caixa || { loja1: {}, loja2: {} });
    setFechamentoData(fechamento);
    setLancamentosData(serverData.lancamentos || {});
  }

  // Carregar dados na inicialização
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Tentar carregar do servidor primeiro
        const serverData = await loadFromServer();
        
        if (serverData) {
          // Dados do servidor disponíveis
          setSettings({ ...defaultSettings, ...(serverData.settings || {}) });
          
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
          // Dados operacionais vem somente do servidor.
          setCaixaData(serverData.caixa || { loja1: {}, loja2: {} });
          setFechamentoData(serverData.fechamento || { loja1: {}, loja2: {} });
          setLancamentosData(serverData.lancamentos || {});
          setHasLoadedFromServer(true);
          setIsOnline(true);
          
          console.log('[AppContext] Loaded from server');
        } else {
          // Sem servidor, os dados ficam apenas em memoria nesta sessao.
          setCaixaData({ loja1: {}, loja2: {} });
          setFechamentoData({ loja1: {}, loja2: {} });
          setLancamentosData({});
          setHasLoadedFromServer(false);
          setIsOnline(false);
          console.warn('[AppContext] Server unavailable; using in-memory defaults');
        }
      } catch (e) {
        console.error('[AppContext] Init error:', e);
        setHasLoadedFromServer(false);
        setIsOnline(false);
      }
      setIsLoading(false);
      setHasInitialized(true);
    };

    initializeData();
  }, []);

  // Sincronizar com servidor quando dados mudam
  useEffect(() => {
    if (!isLoading && hasInitialized && hasLoadedFromServer && isOnline && !isPullingServerData) {
      const syncData = async () => {
        if (Date.now() < suppressServerPushUntilRef.current) return;
        const success = await saveToServer({ 
          settings, 
          stores, 
          debts, 
          saldoDia, 
          caixa: caixaData,
          fechamento: fechamentoData,
          lancamentos: lancamentosData
        });
        if (success) {
          console.log('[AppContext] Synced to server');
        }
      };

      // Sincronizar após 1 segundo de inatividade
      const timer = setTimeout(syncData, 1000);
      return () => clearTimeout(timer);
    }
  }, [settings, stores, debts, saldoDia, caixaData, fechamentoData, lancamentosData, isLoading, hasInitialized, hasLoadedFromServer, isOnline, isPullingServerData]);

  // Marca quando houve edicao local para proteger contra pull prematuro
  useEffect(() => {
    if (!hasInitialized || isPullingServerData) return;
    lastLocalChangeRef.current = Date.now();
  }, [settings, stores, debts, saldoDia, caixaData, fechamentoData, lancamentosData, hasInitialized, isPullingServerData]);

  // Sincronização com servidor é feita via useSyncServer (loadFromServer/saveToServer)
  // que já está configurado acima

  const updatePassword = (p: string) => setSettings(s => ({ ...s, password: p }));

  const updateFieldMapping = (lan: 'lan1' | 'lan2' | 'compacto1' | 'compacto2', mapping: any[]) => {
    let key: string;
    if (lan === 'lan1') key = 'fieldMappingLan1';
    else if (lan === 'lan2') key = 'fieldMappingLan2';
    else if (lan === 'compacto1') key = 'fieldMappingCompacto1';
    else key = 'fieldMappingCompacto2';
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

  const saveEntry = (date: string, values: Record<string, number>, source: 'sync' | 'manual' = 'sync') => {
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
      if (ei >= 0) {
        const prevEntry = store.months[mi].entries[ei];
        const prevValues = prevEntry.values || {};
        const prevManual = prevEntry.manualFields || [];
        const incomingFields = Object.keys(values);
        const touchedManualFields = source === 'manual'
          ? incomingFields.filter((field) => {
              const before = Number(prevValues[field] || 0);
              const after = Number(values[field] || 0);
              return Math.abs(before - after) > 0.000001;
            })
          : [];
        const nextManualFields = source === 'manual'
          ? Array.from(new Set([...prevManual, ...touchedManualFields]))
          : prevManual;

        const mergedValues = { ...prevValues };
        incomingFields.forEach((field) => {
          if (source === 'manual' || !prevManual.includes(field)) {
            mergedValues[field] = values[field];
          }
        });

        store.months[mi].entries[ei] = { ...prevEntry, date, values: mergedValues, manualFields: nextManualFields };
      } else {
        store.months[mi].entries.push({
          date,
          values,
          manualFields: source === 'manual'
            ? Object.keys(values).filter((field) => Math.abs(Number(values[field] || 0)) > 0.000001)
            : [],
        });
      }
      return { ...prev, [currentStore]: store };
    });
    
    // Tambem atualizar lancamentosData para sincronizar com servidor
    setLancamentosData(prev => ({
      ...prev,
      [currentStore]: {
        ...prev[currentStore],
        [date]: { date, values, source }
      }
    }));
  };

  // Salvar apenas em lancamentosData (para Fechamento Compacto)
  const saveLancamentoEntry = (date: string, values: Record<string, number>) => {
    setLancamentosData(prev => ({
      ...prev,
      [currentStore]: {
        ...prev[currentStore],
        [date]: { date, values }
      }
    }));
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

  const clearManualFieldMark = (date: string, fieldId: string) => {
    setStores(prev => {
      const store = { ...prev[currentStore], months: [...prev[currentStore].months] };
      const [yS, mS] = date.split('-');
      const y = parseInt(yS), m = parseInt(mS);
      const mi = store.months.findIndex(md => md.year === y && md.month === m);
      if (mi < 0) return prev;

      store.months[mi] = { ...store.months[mi], entries: [...store.months[mi].entries] };
      const ei = store.months[mi].entries.findIndex(e => e.date === date);
      if (ei < 0) return prev;

      const entry = store.months[mi].entries[ei];
      const nextManual = (entry.manualFields || []).filter((f) => f !== fieldId);
      store.months[mi].entries[ei] = { ...entry, manualFields: nextManual };
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
      storeId: currentStore,
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
    setStores,
    currentStore,
    setCurrentStore,
    getCategories,
    addCategory,
    removeCategory,
    updateCategory,
    getMonthData,
    saveEntry,
    clearManualFieldMark,
    saveLancamentoEntry,
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
    setSettings,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
