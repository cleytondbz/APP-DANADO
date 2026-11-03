import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, ReceiptText, ShoppingCart, X } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import type { MainTab, PurchaseEntry, StoreId } from '@/lib/types';

const STORE_IDS: StoreId[] = ['loja1', 'loja2'];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const parseValue = (value: any) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return Number(String(value || '0').replace(/\./g, '').replace(',', '.')) || 0;
};

const getPreviousMonthInfo = (date: string) => {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return { year: previousYear, month: previousMonth };
};

const shiftIsoDate = (date: string, days: number) => {
  if (!date) return '';
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() + days);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function AnimatedDashboardTotal({
  baseTotal,
  addedTotal,
}: {
  baseTotal: number;
  addedTotal: number;
}) {
  const [shownTotal, setShownTotal] = useState(baseTotal);

  useEffect(() => {
    let frame = 0;
    setShownTotal(baseTotal);

    const startTimer = window.setTimeout(() => {
      const duration = 2200;
      const start = performance.now();

      const animate = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        setShownTotal(baseTotal + addedTotal * eased);
        if (progress < 1) {
          frame = window.requestAnimationFrame(animate);
        }
      };

      frame = window.requestAnimationFrame(animate);
    }, 2200);

    const finishTimer = window.setTimeout(() => {
      setShownTotal(baseTotal + addedTotal);
    }, 4500);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(finishTimer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [baseTotal, addedTotal]);

  return (
    <div className="relative text-right">
      <motion.span
        className="block text-3xl font-black"
        initial={{ opacity: 0.75, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {formatCurrency(shownTotal)}
      </motion.span>
    </div>
  );
}

export function MorningSalesPanel() {
  const { accessContext, stores, fechamentoData, settings, setTab } = useApp();
  const [open, setOpen] = useState(false);
  const [purchaseEntriesByYear, setPurchaseEntriesByYear] = useState<Record<string, PurchaseEntry[]>>({});

  const referenceDate = accessContext?.defaultDate || '';
  const purchaseDate = accessContext?.serverDate || referenceDate;
  const purchaseMonth = purchaseDate ? purchaseDate.slice(0, 7) : '';
  const purchaseYear = purchaseDate ? Number(purchaseDate.slice(0, 4)) : new Date().getFullYear();
  const referenceDayLabel = accessContext?.fechamentoPreviousDay ? 'dia anterior' : 'hoje';
  const fechamentoReferenceLabel = accessContext?.fechamentoPreviousDay ? 'ontem' : 'hoje';

  useEffect(() => {
    if (accessContext?.specialMorning) {
      setOpen(true);
    }
  }, [accessContext?.specialMorning]);

  useEffect(() => {
    if (!open || !purchaseYear) return;
    let cancelled = false;

    const loadPurchases = async () => {
      try {
        const response = await fetch(`/api/compras/${purchaseYear}`);
        if (!response.ok) return;
        const result = await response.json();
        if (!cancelled && result?.success) {
          setPurchaseEntriesByYear(result.data || {});
        }
      } catch (error) {
        console.warn('[MorningSalesPanel] Falha ao carregar compras:', error);
      }
    };

    loadPurchases();
    return () => {
      cancelled = true;
    };
  }, [open, purchaseYear]);

  const getStoreDayTotal = (storeId: StoreId, date: string) => {
    const store = stores[storeId];
    if (!store || !date) return 0;
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const entry = store.months
      ?.find((item) => item.year === year && item.month === month)
      ?.entries?.find((item) => item.date === date);
    if (!entry) return 0;

    return (store.categories || []).reduce((sum, category) => {
      if (category.operation === 'null') return sum;
      const value = Number(entry.values?.[category.id] || 0);
      return sum + (category.operation === 'subtract' ? -value : value);
    }, 0);
  };

  const getStoreMonthTotalUntilDay = (storeId: StoreId, year: number, month: number, dayLimit: number) => {
    const store = stores[storeId];
    if (!store || !dayLimit) return 0;
    const monthData = store.months?.find((item) => item.year === year && item.month === month);
    if (!monthData) return 0;

    return (monthData.entries || []).reduce((sum, entry) => {
      const day = Number(String(entry.date || '').slice(8, 10));
      if (!day || day > dayLimit) return sum;
      return sum + getStoreDayTotal(storeId, entry.date);
    }, 0);
  };

  const dashboardRows = useMemo(() => {
    if (!referenceDate) return [];
    const referenceYear = Number(referenceDate.slice(0, 4));
    const referenceMonth = Number(referenceDate.slice(5, 7));
    const referenceDay = Number(referenceDate.slice(8, 10));
    const comparisonDay = Number(String(accessContext?.serverDate || referenceDate).slice(8, 10)) || referenceDay;
    const previousMonth = getPreviousMonthInfo(accessContext?.serverDate || referenceDate);

    return STORE_IDS.map((storeId) => {
      const store = stores[storeId];
      const previousDayTotal = getStoreDayTotal(storeId, referenceDate);
      const monthBeforePreviousDay = getStoreMonthTotalUntilDay(
        storeId,
        referenceYear,
        referenceMonth,
        Math.max(0, referenceDay - 1)
      );
      const monthTotalWithPreviousDay = monthBeforePreviousDay + previousDayTotal;
      const previousMonthComparable = getStoreMonthTotalUntilDay(
        storeId,
        previousMonth.year,
        previousMonth.month,
        comparisonDay
      );
      const diffPercent = previousMonthComparable > 0
        ? ((monthTotalWithPreviousDay - previousMonthComparable) / Math.abs(previousMonthComparable)) * 100
        : 0;
      const basePercent = monthTotalWithPreviousDay > 0
        ? Math.min(100, Math.max(0, (monthBeforePreviousDay / monthTotalWithPreviousDay) * 100))
        : 0;
      const dayPercent = monthTotalWithPreviousDay > 0
        ? Math.min(100 - basePercent, Math.max(0, (previousDayTotal / monthTotalWithPreviousDay) * 100))
        : 0;
      return {
        storeId,
        label: store?.storeName || (storeId === 'loja1' ? 'Loja 1' : 'Loja 2'),
        previousDayTotal,
        monthBeforePreviousDay,
        monthTotalWithPreviousDay,
        previousMonthComparable,
        diffPercent,
        comparisonDay,
        basePercent,
        dayPercent,
      };
    });
  }, [stores, referenceDate, accessContext?.serverDate]);

  const purchaseSummary = useMemo(() => {
    const sourceEntries = Object.keys(purchaseEntriesByYear).length
      ? purchaseEntriesByYear
      : (settings.purchaseEntries || {});
    const entries = Object.values(sourceEntries).flat();
    const pending = entries.filter((entry) => {
      const dueDate = String(entry.dueDate || '');
      return !entry.paidDate && dueDate.startsWith(purchaseMonth) && dueDate <= purchaseDate;
    });
    return {
      count: pending.length,
      total: pending.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    };
  }, [purchaseEntriesByYear, settings.purchaseEntries, purchaseDate, purchaseMonth]);

  const fechamentoRows = useMemo(() => {
    const getFechamentoTotal = (storeId: StoreId, date: string) => {
      const day = fechamentoData?.[storeId]?.[date] || {};
      const totalVendas = Object.entries(day).reduce((sum, [key, value]) => {
        if (['nomeDigital', 'sangrias', 'despesas', 'data', 'date'].includes(key)) return sum;
        return sum + parseValue(value);
      }, 0);
      const totalDespesas = Array.isArray(day.despesas)
        ? day.despesas.reduce((sum: number, item: any) => sum + parseValue(item?.valor), 0)
        : 0;
      return totalVendas - totalDespesas;
    };
    const previousWeekDate = shiftIsoDate(referenceDate, -7);

    return STORE_IDS.map((storeId) => {
      const total = getFechamentoTotal(storeId, referenceDate);
      const previousWeekTotal = getFechamentoTotal(storeId, previousWeekDate);
      const weekDiffPercent = previousWeekTotal > 0
        ? ((total - previousWeekTotal) / Math.abs(previousWeekTotal)) * 100
        : 0;
      return {
        storeId,
        label: stores[storeId]?.storeName || (storeId === 'loja1' ? 'Loja 1' : 'Loja 2'),
        total,
        previousWeekTotal,
        weekDiffPercent,
      };
    });
  }, [fechamentoData, stores, referenceDate]);

  const openTab = (tab: MainTab) => {
    setTab(tab);
    setOpen(false);
  };

  if (!accessContext?.specialMorning) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative w-full max-w-[1320px] overflow-visible rounded-[2rem] p-2"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.35 }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -right-2 -top-2 z-10 rounded-full bg-white/20 p-2 text-white shadow-lg backdrop-blur hover:bg-white/30"
              aria-label="Fechar painel"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="grid gap-6 lg:grid-cols-3">
              <motion.button
                type="button"
                onClick={() => openTab('dashboard')}
                className="min-h-[360px] rounded-[2rem] border border-blue-300/40 bg-gradient-to-br from-blue-700 via-blue-500 to-cyan-400 p-7 text-left text-white shadow-2xl shadow-blue-950/30 transition-transform hover:-translate-y-1"
                initial={{ opacity: 0, x: '110%', scale: 1.12 }}
                animate={{ opacity: [0, 1, 1], x: ['110%', '110%', 0], scale: [1.12, 1.12, 1] }}
                transition={{ delay: 0.25, duration: 6, times: [0, 0.72, 1], ease: 'easeInOut' }}
              >
                <div className="mb-7 flex items-center gap-4">
                  <span className="rounded-3xl bg-white/20 p-4">
                    <BarChart3 className="h-9 w-9" />
                  </span>
                  <div>
                    <p className="text-sm font-bold uppercase text-white/70">Dashboard</p>
                    <h3 className="text-2xl font-black leading-tight">Mês + {referenceDayLabel}</h3>
                  </div>
                </div>
                <div className="space-y-4">
                  {dashboardRows.map((row) => (
                    <div key={row.storeId} className="rounded-3xl bg-white/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-lg font-bold">{row.label}</span>
                        <AnimatedDashboardTotal
                          baseTotal={row.monthBeforePreviousDay}
                          addedTotal={row.previousDayTotal}
                        />
                      </div>
                      <div className="mt-3 overflow-hidden rounded-full bg-white/20">
                        <div className="relative h-3">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-white/45"
                            style={{ width: `${row.basePercent}%` }}
                          />
                          <motion.div
                            className="absolute inset-y-0 rounded-full bg-white"
                            style={{ left: `${row.basePercent}%` }}
                            initial={{ width: 0 }}
                            animate={{ width: `${row.dayPercent}%` }}
                            transition={{ delay: 2.2, duration: 2.2, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white/75">
                        {row.previousMonthComparable > 0
                          ? `${row.diffPercent >= 0 ? '+' : ''}${row.diffPercent.toFixed(1)}% vs mês anterior até dia ${row.comparisonDay}`
                          : 'Sem comparação no mês anterior'}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.button>

              <motion.button
                type="button"
                onClick={() => openTab('compras')}
                className="min-h-[360px] rounded-[2rem] border border-amber-300/40 bg-gradient-to-br from-amber-400 via-orange-500 to-orange-600 p-7 text-left text-white shadow-2xl shadow-orange-950/30 transition-transform hover:-translate-y-1 lg:order-3"
                initial={{ opacity: 0, x: '-110%', scale: 1.08 }}
                animate={{ opacity: [0, 1, 1], x: ['-110%', '-110%', 0], scale: [1.08, 1.08, 1] }}
                transition={{ delay: 6.85, duration: 3.8, times: [0, 0.56, 1], ease: 'easeInOut' }}
              >
                <div className="mb-8 flex items-center gap-4">
                  <span className="rounded-3xl bg-white/20 p-4">
                    <ShoppingCart className="h-9 w-9" />
                  </span>
                  <div>
                    <p className="text-sm font-bold uppercase text-white/70">Compras</p>
                    <h3 className="text-2xl font-black leading-tight">Boletos vencidos</h3>
                  </div>
                </div>
                <div className="rounded-[2rem] bg-white/20 p-7 text-center">
                  <p className="text-7xl font-black">{purchaseSummary.count}</p>
                  <p className="mt-2 text-base font-bold text-white/80">pendente(s) no mês até hoje</p>
                  <p className="mt-5 text-4xl font-black">{formatCurrency(purchaseSummary.total)}</p>
                </div>
              </motion.button>

              <motion.button
                type="button"
                onClick={() => openTab('fechamentoCompacto')}
                className="min-h-[360px] rounded-[2rem] border border-emerald-300/40 bg-gradient-to-br from-emerald-500 via-teal-500 to-teal-700 p-7 text-left text-white shadow-2xl shadow-emerald-950/30 transition-transform hover:-translate-y-1 lg:order-2"
                initial={{ opacity: 0, y: 52, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 11.05, duration: 1.15, ease: 'easeOut' }}
              >
                <div className="mb-7 flex items-center gap-4">
                  <span className="rounded-3xl bg-white/20 p-4">
                    <ReceiptText className="h-9 w-9" />
                  </span>
                  <div>
                    <p className="text-sm font-bold uppercase text-white/70">Fechamento compacto</p>
                    <h3 className="text-2xl font-black leading-tight">Total de {fechamentoReferenceLabel}</h3>
                  </div>
                </div>
                <div className="space-y-4">
                  {fechamentoRows.map((row) => (
                    <div key={row.storeId} className="rounded-3xl bg-white/20 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-lg font-bold">{row.label}</span>
                        <span className="text-3xl font-black">{formatCurrency(row.total)}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white/75">
                        {row.previousWeekTotal > 0
                          ? `${row.weekDiffPercent >= 0 ? '+' : ''}${row.weekDiffPercent.toFixed(1)}% vs semana passada`
                          : 'Sem comparação na semana passada'}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
