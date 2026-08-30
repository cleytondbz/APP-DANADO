import { useApp } from '@/contexts/AppContext';
import type { MainTab, StoreId } from '@/lib/types';
import { useEffect, lazy, Suspense, useState } from 'react';
import { LayoutDashboard, FileSpreadsheet, Receipt, ShoppingCart, Settings, ArrowLeft, CreditCard, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { MONTH_NAMES } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DashboardTab = lazy(() => import('./DashboardTab'));
const LancamentosTab = lazy(() => import('./LancamentosTab'));
const FechamentoCompactoTab = lazy(() => import('./FechamentoCompactoTab'));
const ComprasTab = lazy(() => import('./ComprasTab'));
const OpcoesTab = lazy(() => import('./OpcoesTab'));
const CaixaTab = lazy(() => import('./CaixaTab'));

const tabs: { id: MainTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'lancamentos', label: 'Lancamentos', icon: FileSpreadsheet },
  { id: 'fechamentoCompacto', label: 'Fechamento Compacto', icon: Receipt },
  { id: 'compras', label: 'Compras', icon: ShoppingCart },
  { id: 'opcoes', label: 'Opcoes', icon: Settings },
];

const STORE_THEME: Record<StoreId, { label: string; color: string; soft: string; border: string; text: string }> = {
  loja1: { label: 'Loja 1', color: '#0d6efd', soft: 'rgba(13,110,253,0.10)', border: 'rgba(13,110,253,0.35)', text: '#0d6efd' },
  loja2: { label: 'Loja 2', color: '#f59e0b', soft: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.45)', text: '#b45309' },
  loja3: { label: 'Loja 3', color: '#7c3aed', soft: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.40)', text: '#7c3aed' },
};

export default function MainLayout() {
  const { tab, setTab, setScreen, currentStore, setCurrentStore, selectedMonth, selectedYear, setSelectedMonth, setSelectedYear } = useApp();
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseServerStatus, setPurchaseServerStatus] = useState<'idle' | 'saving' | 'offline' | 'online'>('idle');
  const readOnlySalesUser = typeof window !== 'undefined' ? localStorage.getItem('fd_sales_readonly_user') : null;
  const isAndroidAppMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('app') === 'android';
  const availableTabs = readOnlySalesUser
    ? tabs.filter((t) => t.id === 'dashboard' || t.id === 'lancamentos')
    : isAndroidAppMode
    ? tabs.filter((t) => t.id === 'dashboard' || t.id === 'fechamentoCompacto')
    : tabs;
  const canUseLoja3 = tab === 'dashboard' || tab === 'lancamentos';
  const visibleStores: StoreId[] = canUseLoja3 ? ['loja1', 'loja2', 'loja3'] : ['loja1', 'loja2'];

  useEffect(() => {
    if (readOnlySalesUser && tab !== 'dashboard' && tab !== 'lancamentos') {
      setTab('dashboard');
      return;
    }
    if (isAndroidAppMode && tab !== 'dashboard' && tab !== 'fechamentoCompacto') {
      setTab('dashboard');
    }
  }, [isAndroidAppMode, readOnlySalesUser, tab, setTab]);

  useEffect(() => {
    if (!canUseLoja3 && currentStore === 'loja3') {
      setCurrentStore('loja1');
    }
  }, [canUseLoja3, currentStore, setCurrentStore]);

  useEffect(() => {
    const handlePurchaseServerStatus = (event: Event) => {
      const status = (event as CustomEvent).detail;
      if (status === 'idle' || status === 'saving' || status === 'offline' || status === 'online') {
        setPurchaseServerStatus(status);
      }
    };
    window.addEventListener('purchase-server-status-change', handlePurchaseServerStatus);
    return () => window.removeEventListener('purchase-server-status-change', handlePurchaseServerStatus);
  }, []);

  const navMonth = (dir: number) => {
    let m = selectedMonth + dir;
    let y = selectedYear;
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  const updatePurchaseSearch = (value: string) => {
    setPurchaseSearch(value);
    window.dispatchEvent(new CustomEvent('purchase-search-change', { detail: value }));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b px-4 py-3 flex items-center gap-3 transition-colors ${
        tab === 'compras' && purchaseServerStatus === 'offline'
          ? 'border-red-700 bg-red-600/95 text-white'
          : tab === 'compras' && purchaseServerStatus === 'online'
            ? 'border-green-700 bg-green-600/95 text-white'
            : 'border-border bg-card/80'
      }`}>
        <button onClick={() => setScreen('storeSelection')} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className={`w-4 h-4 ${tab === 'compras' && purchaseServerStatus !== 'idle' ? 'text-white' : 'text-primary'}`} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-3">
          {!isAndroidAppMode && tab === 'compras' && (
            <Button
              type="button"
              size="sm"
              className="h-9 gap-2 px-4"
              onClick={() => window.dispatchEvent(new CustomEvent('open-purchase-form'))}
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          )}
          {!isAndroidAppMode && tab === 'compras' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 whitespace-nowrap px-3"
              onClick={() => window.dispatchEvent(new CustomEvent('open-purchase-global-search'))}
            >
              Pesquisa global
            </Button>
          )}
          {!isAndroidAppMode && tab === 'compras' ? (
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={purchaseSearch}
                onChange={(e) => updatePurchaseSearch(e.target.value)}
                placeholder="Pesquisar compras..."
              className="h-9 bg-background pl-9"
              />
            </div>
          ) : (
            <div className="inline-flex rounded-lg border border-border bg-card p-1 gap-1">
              {visibleStores.map((storeId) => {
                const theme = STORE_THEME[storeId];
                const active = currentStore === storeId;
                return (
                  <button
                    key={storeId}
                    onClick={() => setCurrentStore(storeId)}
                    className="px-5 py-1.5 text-sm font-bold rounded-md transition-colors"
                    style={active
                      ? { background: theme.color, color: '#fff' }
                      : { color: theme.text, background: theme.soft, border: `1px solid ${theme.border}` }}
                  >
                    {theme.label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="inline-flex items-center rounded-lg border border-border bg-card px-2 py-1 gap-2">
            <button onClick={() => navMonth(-1)} className="p-1 rounded hover:bg-secondary">
              <ChevronLeft className={`w-4 h-4 ${tab === 'compras' && purchaseServerStatus !== 'idle' ? 'text-white' : 'text-primary'}`} />
            </button>
            <div className="text-center leading-tight min-w-[104px]">
              <div className="text-sm font-semibold">{MONTH_NAMES[selectedMonth - 1]}</div>
              <div className="text-[10px] text-muted-foreground">{selectedYear}</div>
            </div>
            <button onClick={() => navMonth(1)} className="p-1 rounded hover:bg-secondary">
              <ChevronRight className={`w-4 h-4 ${tab === 'compras' && purchaseServerStatus !== 'idle' ? 'text-white' : 'text-primary'}`} />
            </button>
          </div>
        </div>
        {!isAndroidAppMode && !readOnlySalesUser && (
          <button onClick={() => setTab('caixa')} className="p-2 rounded-lg bg-accent hover:bg-accent/80 transition-colors" title="Ir para CAIXA">
            <CreditCard className="w-4 h-4 text-accent-foreground" />
          </button>
        )}
        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">
          {tabs.find(t => t.id === tab)?.label}
        </span>
      </header>

      <main className="flex-1 px-4 py-4">
        <div className="w-full max-w-[1680px] mx-auto">
          <Suspense fallback={<div className="text-sm text-muted-foreground py-8 text-center">Carregando aba...</div>}>
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                {tab === 'dashboard' && <DashboardTab />}
                {!isAndroidAppMode && tab === 'lancamentos' && <LancamentosTab readOnly={!!readOnlySalesUser} />}
                {tab === 'fechamentoCompacto' && <FechamentoCompactoTab />}
                {!isAndroidAppMode && !readOnlySalesUser && tab === 'compras' && <ComprasTab />}
                {!isAndroidAppMode && !readOnlySalesUser && tab === 'caixa' && <CaixaTab />}
                {!isAndroidAppMode && !readOnlySalesUser && tab === 'opcoes' && <OpcoesTab />}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </main>

      <nav className="sticky bottom-0 z-30 bg-card/90 backdrop-blur-xl border-t border-border px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around">
          {availableTabs.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex flex-col items-center py-2 px-1 min-w-[56px] transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                <t.icon className={`w-5 h-5 ${active ? 'drop-shadow-[0_0_6px_var(--primary)]' : ''}`} />
                <span className="text-[9px] font-semibold mt-0.5">{t.label}</span>
                {active && <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
