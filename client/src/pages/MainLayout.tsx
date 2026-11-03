import { useApp } from '@/contexts/AppContext';
import type { MainTab, StoreId } from '@/lib/types';
import { useEffect, lazy, Suspense, useState } from 'react';
import { LayoutDashboard, FileSpreadsheet, Receipt, ShoppingCart, Settings, ArrowLeft, Archive, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { MONTH_NAMES } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MorningSalesPanel } from '@/components/MorningSalesPanel';

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

const TAB_THEME: Record<MainTab, { color: string; soft: string; shadow: string }> = {
  dashboard: { color: '#2563eb', soft: 'rgba(37,99,235,0.14)', shadow: 'rgba(37,99,235,0.35)' },
  lancamentos: { color: '#16a34a', soft: 'rgba(22,163,74,0.14)', shadow: 'rgba(22,163,74,0.35)' },
  fechamentoCompacto: { color: '#7c3aed', soft: 'rgba(124,58,237,0.14)', shadow: 'rgba(124,58,237,0.35)' },
  compras: { color: '#f97316', soft: 'rgba(249,115,22,0.16)', shadow: 'rgba(249,115,22,0.35)' },
  dividas: { color: '#dc2626', soft: 'rgba(220,38,38,0.14)', shadow: 'rgba(220,38,38,0.35)' },
  totais: { color: '#0891b2', soft: 'rgba(8,145,178,0.14)', shadow: 'rgba(8,145,178,0.35)' },
  caixa: { color: '#0f766e', soft: 'rgba(15,118,110,0.14)', shadow: 'rgba(15,118,110,0.35)' },
  opcoes: { color: '#64748b', soft: 'rgba(100,116,139,0.16)', shadow: 'rgba(100,116,139,0.35)' },
};

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
      <MorningSalesPanel />
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
          {!isAndroidAppMode && tab === 'compras' && purchaseServerStatus === 'offline' && (
            <div className="animate-pulse rounded-lg border-2 border-white bg-red-800 px-4 py-1 text-xl font-black tracking-wide text-white shadow-lg">
              NÃO SALVO
            </div>
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
          <button
            onClick={() => setTab('caixa')}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-extrabold text-accent-foreground shadow-sm transition-colors hover:bg-accent/80"
            title="Ir para CAIXA"
          >
            <Archive className="w-5 h-5" />
            Caixa
          </button>
        )}
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

      <nav className="sticky bottom-0 z-30 border-t border-border bg-card/90 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        <div className="flex justify-around gap-2 py-1.5">
          {availableTabs.map(t => {
            const active = tab === t.id;
            const theme = TAB_THEME[t.id];
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex min-w-[82px] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-1.5 transition-all active:scale-95 sm:min-w-[112px] sm:px-3 sm:py-2"
                style={{
                  color: active ? '#ffffff' : theme.color,
                  background: active
                    ? `linear-gradient(135deg, ${theme.color}, ${theme.color}dd)`
                    : theme.soft,
                  borderColor: active ? theme.color : `${theme.color}55`,
                  boxShadow: active ? `0 10px 24px ${theme.shadow}` : '0 2px 8px rgba(15,23,42,0.06)',
                }}
              >
                <t.icon className={`h-5 w-5 ${active ? 'scale-110' : 'opacity-90'} transition-transform sm:h-6 sm:w-6`} />
                <span className={`mt-0.5 text-[12px] font-black leading-none sm:text-sm ${active ? '' : 'opacity-90'}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
