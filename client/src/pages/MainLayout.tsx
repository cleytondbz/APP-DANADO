import { useApp } from '@/contexts/AppContext';
import type { MainTab } from '@/lib/types';
import { useEffect, lazy, Suspense } from 'react';
import { LayoutDashboard, FileSpreadsheet, Receipt, ShoppingCart, Settings, ArrowLeft, CreditCard, ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_NAMES } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';

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

export default function MainLayout() {
  const { tab, setTab, setScreen, currentStore, setCurrentStore, selectedMonth, selectedYear, setSelectedMonth, setSelectedYear } = useApp();
  const isAndroidAppMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('app') === 'android';
  const availableTabs = isAndroidAppMode
    ? tabs.filter((t) => t.id === 'dashboard' || t.id === 'fechamentoCompacto')
    : tabs;

  useEffect(() => {
    if (isAndroidAppMode && tab !== 'dashboard' && tab !== 'fechamentoCompacto') {
      setTab('dashboard');
    }
  }, [isAndroidAppMode, tab, setTab]);

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => setScreen('storeSelection')} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-primary" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-3">
          <div className="inline-flex rounded-lg border border-primary/30 bg-primary/10 p-1">
            <button
              onClick={() => setCurrentStore('loja1')}
              className={`px-5 py-1.5 text-sm font-bold rounded-md transition-colors ${
                currentStore === 'loja1'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-primary hover:bg-primary/15'
              }`}
            >
              Loja 1
            </button>
            <button
              onClick={() => setCurrentStore('loja2')}
              className={`px-5 py-1.5 text-sm font-bold rounded-md transition-colors ${
                currentStore === 'loja2'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-primary hover:bg-primary/15'
              }`}
            >
              Loja 2
            </button>
          </div>
          <div className="inline-flex items-center rounded-lg border border-border bg-card px-2 py-1 gap-2">
            <button onClick={() => navMonth(-1)} className="p-1 rounded hover:bg-secondary">
              <ChevronLeft className="w-4 h-4 text-primary" />
            </button>
            <div className="text-center leading-tight min-w-[104px]">
              <div className="text-sm font-semibold">{MONTH_NAMES[selectedMonth - 1]}</div>
              <div className="text-[10px] text-muted-foreground">{selectedYear}</div>
            </div>
            <button onClick={() => navMonth(1)} className="p-1 rounded hover:bg-secondary">
              <ChevronRight className="w-4 h-4 text-primary" />
            </button>
          </div>
        </div>
        {!isAndroidAppMode && (
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
                {!isAndroidAppMode && tab === 'lancamentos' && <LancamentosTab />}
                {tab === 'fechamentoCompacto' && <FechamentoCompactoTab />}
                {!isAndroidAppMode && tab === 'compras' && <ComprasTab />}
                {!isAndroidAppMode && tab === 'caixa' && <CaixaTab />}
                {!isAndroidAppMode && tab === 'opcoes' && <OpcoesTab />}
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
