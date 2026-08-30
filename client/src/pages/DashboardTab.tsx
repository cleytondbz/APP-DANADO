import { useEffect, useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency, getDaysInMonth, getDayOfWeek } from '@/lib/helpers';
import { CHART_HEX, DAY_NAMES_FULL } from '@/lib/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend, AreaChart, Area } from 'recharts';
import { motion } from 'framer-motion';
import { exportReportPDF } from '@/lib/pdf-export';
import { Download } from 'lucide-react';
import TotaisTab from './TotaisTab';



interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string | number;
  tooltipTextColor?: string;
  tooltipBgColor?: string;
}

const CustomTooltip = ({ active, payload, label, tooltipTextColor = '#000000', tooltipBgColor = '#ffffff' }: CustomTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;
  
  return (
    <div style={{
      backgroundColor: tooltipBgColor,
      border: `1px solid ${tooltipTextColor}`,
      borderRadius: '8px',
      padding: '8px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
    }}>
      <p style={{ color: tooltipTextColor, fontSize: '12px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
        {label}
      </p>
      {payload.map((entry, index) => (
        <p key={index} style={{ color: tooltipTextColor, fontSize: '12px', margin: '2px 0' }}>
          {entry.name}: {typeof entry.value === 'number' ? formatCurrency(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
};

const normalizeCompanyKey = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const formatCompanyName = (value: string) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean
    .toLowerCase()
    .split(' ')
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    .join(' ');
};

const abbreviateCompanyName = (value: string, maxLength = 18) => {
  const clean = formatCompanyName(value);
  if (clean.length <= maxLength) return clean;

  const replacements: Array<[RegExp, string]> = [
    [/\bCONDOMINIO\b/gi, 'Cond.'],
    [/\bCOND\b/gi, 'Cond.'],
    [/\bCHACARA\b/gi, 'Chác.'],
    [/\bCOMERCIO\b/gi, 'Com.'],
    [/\bSERVICOS\b/gi, 'Serv.'],
    [/\bANTONIO\b/gi, 'Ant.'],
    [/\bFILHO\b/gi, 'Fº'],
  ];
  let abbreviated = clean;
  replacements.forEach(([pattern, replacement]) => {
    abbreviated = abbreviated.replace(pattern, replacement);
  });
  abbreviated = abbreviated.replace(/\s+/g, ' ').trim();
  return abbreviated.length <= maxLength ? abbreviated : `${abbreviated.slice(0, maxLength - 1).trim()}…`;
};

const normalizeCategoryName = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const STORE_THEME: Record<string, { color: string; soft: string; border: string; text: string }> = {
  loja1: { color: '#0d6efd', soft: 'rgba(13,110,253,0.12)', border: 'rgba(13,110,253,0.35)', text: '#0d6efd' },
  loja2: { color: '#f59e0b', soft: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.45)', text: '#b45309' },
  loja3: { color: '#7c3aed', soft: 'rgba(124,58,237,0.14)', border: 'rgba(124,58,237,0.40)', text: '#7c3aed' },
};

export default function DashboardTab() {
  const { settings, stores, currentStore, getCategories, getMonthData, selectedYear, selectedMonth, caixaData } = useApp();
  const storeTheme = STORE_THEME[currentStore] || STORE_THEME.loja1;
  const cats = getCategories();
  const md = getMonthData(selectedYear, selectedMonth);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selDays, setSelDays] = useState<number[]>([0,1,2,3,4,5,6]);
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('bar');
  const [annualDashboardSummary, setAnnualDashboardSummary] = useState<Array<{
    month: number;
    monthKey: string;
    compras: number;
    comprasFornecedor?: number;
    vendas: number;
    vendasPorLoja?: Record<string, number>;
  }> | null>(null);
  const [purchaseComparisonMode, setPurchaseComparisonMode] = useState<'total' | 'fornecedor'>('total');
  const currentMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadDashboardSummary = async () => {
      try {
        const response = await fetch(`/api/dashboard/${selectedYear}`, { signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json();
        if (cancelled || !result?.success || !Array.isArray(result.data)) return;
        setAnnualDashboardSummary(result.data);
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.warn('[Dashboard] Falha ao carregar resumo anual parcial:', error);
        }
      }
    };

    setAnnualDashboardSummary(null);
    loadDashboardSummary();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedYear]);
  const [pieChartType, setPieChartType] = useState<'pie' | 'donut'>('pie');

  // Get previous month data for comparison
  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const prevMd = getMonthData(prevYear, prevMonth);

  const catTotals = useMemo(() => {
    const t: Record<string, number> = {};
    cats.forEach(c => { t[c.id] = 0; });
    md?.entries.forEach(e => { cats.forEach(c => { t[c.id] += e.values[c.id] || 0; }); });
    return t;
  }, [md, cats]);

  const monthTotal = useMemo(() => {
    let t = 0;
    cats.forEach(c => { if (c.operation !== 'null') t += (c.operation === 'add' ? 1 : -1) * (catTotals[c.id] || 0); });
    return t;
  }, [catTotals, cats]);

  const customSaldoConfig = settings.customSaldoByStoreMonth?.[currentStore]?.[currentMonthKey];

  const customSaldoCategoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    const selectedCategories = customSaldoConfig?.selection || [];
    const selectedDays = customSaldoConfig?.days || [];
    if (selectedCategories.length === 0 || selectedDays.length === 0) return totals;

    selectedCategories.forEach((selectionKey) => {
      const [maybeStoreId, maybeCatId] = String(selectionKey).split(':');
      const storeId = maybeCatId ? maybeStoreId : currentStore;
      const categoryId = maybeCatId || maybeStoreId;
      const store = stores[storeId];
      const monthData = store?.months?.find((m) => m.year === selectedYear && m.month === selectedMonth);
      monthData?.entries?.forEach((entry) => {
        const day = parseInt((entry.date || '').split('-')[2] || '0', 10);
        if (!selectedDays.includes(day)) return;
        totals[selectionKey] = (totals[selectionKey] || 0) + (entry.values?.[categoryId] || 0);
      });
    });

    return totals;
  }, [customSaldoConfig, stores, currentStore, selectedYear, selectedMonth]);

  const customSaldoTotal = useMemo(() => (
    Object.values(customSaldoCategoryTotals).reduce((sum, value) => sum + Number(value || 0), 0)
  ), [customSaldoCategoryTotals]);

  const monthTotalAfterCustomSaldo = monthTotal - customSaldoTotal;

  const prevMonthTotal = useMemo(() => {
    let t = 0;
    const prevCatTotals: Record<string, number> = {};
    cats.forEach(c => { prevCatTotals[c.id] = 0; });
    prevMd?.entries.forEach(e => { cats.forEach(c => { prevCatTotals[c.id] += e.values[c.id] || 0; }); });
    cats.forEach(c => { if (c.operation !== 'null') t += (c.operation === 'add' ? 1 : -1) * (prevCatTotals[c.id] || 0); });
    return t;
  }, [prevMd, cats]);

  const monthComparison = useMemo(() => {
    if (prevMonthTotal === 0) return 0;
    return ((monthTotal - prevMonthTotal) / Math.abs(prevMonthTotal)) * 100;
  }, [monthTotal, prevMonthTotal]);

  const dailyData = useMemo(() => {
    const days = getDaysInMonth(selectedYear, selectedMonth);
    const data: { day: number; total: number }[] = [];
    for (let d = 1; d <= days; d++) {
      const ds = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const entry = md?.entries.find(e => e.date === ds);
      let total = 0;
      if (entry) cats.forEach(c => { if (c.operation !== 'null') total += (c.operation === 'add' ? 1 : -1) * (entry.values[c.id] || 0); });
      data.push({ day: d, total });
    }
    return data;
  }, [md, cats, selectedYear, selectedMonth]);

  const catDailyData = useMemo(() => {
    if (!selCat) return [];
    const days = getDaysInMonth(selectedYear, selectedMonth);
    const data: { day: number; valor: number }[] = [];
    for (let d = 1; d <= days; d++) {
      const ds = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const entry = md?.entries.find(e => e.date === ds);
      data.push({ day: d, valor: entry?.values[selCat] || 0 });
    }
    return data;
  }, [selCat, md, selectedYear, selectedMonth]);

  const pieData = useMemo(() => {
    return cats.filter(c => catTotals[c.id] > 0).map((c, i) => ({
      name: c.name, value: catTotals[c.id], fill: CHART_HEX[i % CHART_HEX.length],
    }));
  }, [catTotals, cats]);

  const boletoCompanyData = useMemo(() => {
    const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const totals = new Map<string, { name: string; value: number }>();
    Object.values(caixaData || {}).forEach((storeCaixa: any) => {
      Object.entries(storeCaixa || {}).forEach(([date, dayData]: [string, any]) => {
        if (!String(date).startsWith(monthKey)) return;
        const items = Array.isArray(dayData?.boleto) ? dayData.boleto : [];
        items.forEach((item: any) => {
          const rawLabel = String(item?.descricao || '').trim();
          const key = normalizeCompanyKey(rawLabel);
          if (!key) return;
          const amount = Number(String(item?.valor || '0').replace(',', '.')) * (Number(item?.quantidade || 1) || 1);
          const current = totals.get(key);
          totals.set(key, {
            name: current?.name || formatCompanyName(rawLabel),
            value: (current?.value || 0) + amount,
          });
        });
      });
    });
    return Array.from(totals.values())
      .map((item, index) => ({
        ...item,
        shortName: abbreviateCompanyName(item.name),
        fill: CHART_HEX[index % CHART_HEX.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [caixaData, selectedYear, selectedMonth]);

  const boletoCompanyChartHeight = Math.max(340, boletoCompanyData.length * 52 + 52);

  const comprasVsVendasData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    if (annualDashboardSummary?.length) {
      return months.map((name, idx) => {
        const row = annualDashboardSummary.find((item) => item.month === idx + 1);
        const compras = purchaseComparisonMode === 'fornecedor'
          ? row?.comprasFornecedor || 0
          : row?.compras || 0;
        return { name, compras, vendas: row?.vendas || 0 };
      });
    }

    const getStoreMonthTotal = (storeId: string, year: number, month: number) => {
      const store = stores[storeId];
      if (!store) return 0;
      const monthData = store.months.find((m) => m.year === year && m.month === month);
      if (!monthData) return 0;
      return monthData.entries.reduce((sum, entry) => {
        let entryTotal = 0;
        (store.categories || []).forEach((cat) => {
          if (cat.operation !== 'null') {
            entryTotal += (cat.operation === 'add' ? 1 : -1) * (entry.values[cat.id] || 0);
          }
        });
        return sum + entryTotal;
      }, 0);
    };

    return months.map((name, idx) => {
      const month = idx + 1;
      const monthKey = `${selectedYear}-${String(month).padStart(2, '0')}`;
      const compras = (settings.purchaseEntries?.[monthKey] || []).reduce((sum, item) => {
        if (purchaseComparisonMode === 'fornecedor' && String(item.difType || '').toUpperCase() !== 'F') return sum;
        return sum + (item.amount || 0);
      }, 0);
      const vendas = Object.keys(stores || {}).reduce(
        (sum, storeId) => sum + getStoreMonthTotal(storeId, selectedYear, month),
        0
      );
      return { name, compras, vendas };
    });
  }, [annualDashboardSummary, settings.purchaseEntries, stores, selectedYear, purchaseComparisonMode]);

  const dowData = useMemo(() => {
    const dt: Record<number, { total: number; count: number }> = {};
    for (let i = 0; i < 7; i++) dt[i] = { total: 0, count: 0 };
    md?.entries.forEach(e => {
      const dow = getDayOfWeek(e.date);
      let t = 0;
      cats.forEach(c => { t += (c.operation === 'add' ? 1 : -1) * (e.values[c.id] || 0); });
      dt[dow].total += t; dt[dow].count++;
    });
    return selDays.map(d => ({
      name: DAY_NAMES_FULL[d].substring(0, 3),
      media: dt[d].count > 0 ? Math.round(dt[d].total / dt[d].count) : 0,
    }));
  }, [md, cats, selDays]);

  const toggleDay = (d: number) => setSelDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort());

  const handleExportPDF = () => {
    const storeData = [{ name: 'Loja 1', total: monthTotal }];
    exportReportPDF({
      year: selectedYear,
      month: selectedMonth,
      monthTotal,
      prevMonthTotal,
      monthComparison,
      categories: cats,
      catTotals,
      dailyData,
      stores: storeData,
    });
  };

  const tooltipTextColor = settings.dasColors?.tooltipText || '#000000';
  const tooltipBgColor = settings.dasColors?.tooltipBg || '#ffffff';

  return (
    <div className="flex flex-col gap-4 pb-24">

      {/* Botão de Exportação */}
      <button onClick={handleExportPDF}
        className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-2xl p-3 font-semibold transition-colors">
        <Download className="w-5 h-5" />
        Exportar Relatório em PDF
      </button>

      {/* Total do Mês com Comparação */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5 text-center card-glow"
        style={{
          backgroundColor: settings.dasColors?.monthTotal || storeTheme.color,
          color: '#ffffff'
        }}>
        <p className="text-white/70 text-xs">Total do Mês</p>
        <p className="text-5xl font-black text-white font-mono-num tracking-tight" style={{ textShadow: '0 3px 8px rgba(0,0,0,0.28)' }}>{formatCurrency(monthTotal)}</p>
        {prevMonthTotal !== 0 && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <p className="text-xs text-white/60">vs. mês anterior:</p>
            <span className={`text-sm font-bold ${monthComparison >= 0 ? 'text-success' : 'text-destructive'}`}>
              {monthComparison >= 0 ? '+' : ''}{monthComparison.toFixed(1)}%
            </span>
          </div>
        )}
      </motion.div>

      {/* Category Summary */}
      <div className="bg-card rounded-2xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Resumo por Categoria</h3>
        <div className={`grid gap-2 ${currentStore === 'loja3' ? 'grid-cols-1' : 'grid-cols-3 sm:grid-cols-4'}`}>
          {currentStore === 'loja3' ? (
            <div className="rounded-2xl p-6 text-center border border-amber-300 bg-gradient-to-br from-amber-100 via-orange-100 to-yellow-50">
              <div className="text-lg font-extrabold text-amber-700 truncate">Contador</div>
              <div className="mt-2 text-4xl font-black font-mono-num text-amber-900">{formatCurrency(customSaldoTotal)}</div>
            </div>
          ) : (
          cats.map((c, i) => (
            <div key={`dashboard-summary-${c.id}`} className="contents">
              <button key={c.id} onClick={() => setSelCat(p => p === c.id ? null : c.id)}
                className={`rounded-xl p-2.5 text-center transition-all border ${selCat === c.id ? 'scale-105' : 'bg-secondary'}`}
                style={selCat === c.id ? { borderColor: storeTheme.color, background: storeTheme.soft } : {}}>
                <div className="text-[10px] font-semibold text-muted-foreground truncate">{c.name}</div>
                <div className="text-sm font-bold font-mono-num text-foreground">{formatCurrency(catTotals[c.id] || 0)}</div>
              </button>
            </div>
          ))
          )}
          {currentStore !== 'loja3' && (
            <div key="dashboard-contador-card" className="rounded-xl p-2.5 text-center border border-amber-300 bg-gradient-to-br from-amber-100 via-orange-100 to-yellow-50">
              <div className="text-[10px] font-semibold text-amber-700 truncate">Contador</div>
              <div className="text-sm font-extrabold font-mono-num text-amber-900">{formatCurrency(customSaldoTotal)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Category-specific chart */}
      {selCat && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="bg-card rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-bold text-foreground">
              Evolução - {cats.find(c => c.id === selCat)?.name}
            </h3>
            <span className="text-sm font-bold font-mono-num" style={{color: settings.dasColors?.valueText || '#06b6d4'}}>
              Valor: {formatCurrency(catDailyData.reduce((sum, d) => sum + d.valor, 0))}
            </span>
          </div>
          {catDailyData.some(d => d.valor !== 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={catDailyData}>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60}
                  tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
                <Bar dataKey="valor" fill={settings.dasColors?.secondary || CHART_HEX[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-muted-foreground text-sm py-10">Sem dados</p>}
        </motion.div>
      )}

      <div className="order-[100] bg-card rounded-2xl p-5">
        <h3 className="text-lg font-extrabold text-foreground mb-4">Empresas no Boleto</h3>
        {boletoCompanyData.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-center">
            <ResponsiveContainer width="100%" height={boletoCompanyChartHeight}>
              <BarChart data={boletoCompanyData} layout="vertical" margin={{ left: 24, right: 24, top: 8, bottom: 8 }}>
                <XAxis type="number" tick={{ fontSize: 13, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `R$${(Number(v)/1000).toFixed(0)}k`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={210}
                  tick={{ fontSize: 14, fontWeight: 800, fill: 'hsl(var(--foreground))' }}
                  tickFormatter={(value) => abbreviateCompanyName(String(value || ''), 28)}
                  interval={0}
                />
                <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
                <Bar dataKey="value" name="Valor" radius={[0, 6, 6, 0]}>
                  {boletoCompanyData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {boletoCompanyData.map((item) => (
                <div key={item.name} className="flex justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2.5 text-sm">
                  <span className="font-semibold truncate">{item.name}</span>
                  <span className="font-extrabold text-red-600 shrink-0">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground text-sm py-8">Sem empresas de boleto neste mês</p>
        )}
      </div>

      {/* Daily Evolution */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-foreground">Evolução Diária - Total</h3>
            <span className="text-sm font-bold font-mono-num" style={{color: settings.dasColors?.totalText || '#3b82f6'}}>
              Total: {formatCurrency(dailyData.reduce((sum, d) => sum + d.total, 0))}
            </span>
          </div>
          <div className="flex gap-1">
            {(['line', 'bar', 'area'] as const).map(type => (
              <button key={type} onClick={() => setChartType(type)} className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                chartType === type ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}>
                {type === 'line' ? 'Linha' : type === 'bar' ? 'Barras' : 'Área'}
              </button>
            ))}
          </div>
        </div>
        {dailyData.some(d => d.total !== 0) ? (
          <ResponsiveContainer width="100%" height={200}>
            {chartType === 'line' ? (
              <LineChart data={dailyData}>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60}
                  tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
                <Line type="monotone" dataKey="total" stroke={settings.dasColors?.primary || CHART_HEX[0]} strokeWidth={2} dot={false} />
              </LineChart>
            ) : chartType === 'bar' ? (
              <BarChart data={dailyData}>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60}
                  tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
                <Bar dataKey="total" fill={settings.dasColors?.primary || CHART_HEX[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={dailyData}>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60}
                  tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
                <Area type="monotone" dataKey="total" fill={settings.dasColors?.primary || CHART_HEX[0]} stroke={settings.dasColors?.primary || CHART_HEX[0]} fillOpacity={0.3} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        ) : <p className="text-center text-muted-foreground text-sm py-10">Sem dados para este mês</p>}
      </div>

      {/* Category-specific chart */}
      {false && selCat && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="order-[10] bg-card rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-bold text-foreground">
              Evolução - {cats.find(c => c.id === selCat)?.name}
            </h3>
            <span className="text-sm font-bold font-mono-num" style={{color: settings.dasColors?.valueText || '#06b6d4'}}>
              Valor: {formatCurrency(catDailyData.reduce((sum, d) => sum + d.valor, 0))}
            </span>
          </div>
          {catDailyData.some(d => d.valor !== 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={catDailyData}>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60}
                  tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
                <Bar dataKey="valor" fill={settings.dasColors?.secondary || CHART_HEX[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-muted-foreground text-sm py-10">Sem dados</p>}
        </motion.div>
      )}

      {/* Pie Chart */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground">Distribuição por Categoria (%)</h3>
          <div className="flex gap-1">
            {(['pie', 'donut'] as const).map(type => (
              <button key={type} onClick={() => setPieChartType(type)} className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                pieChartType === type ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}>
                {type === 'pie' ? 'Pizza' : 'Rosca'}
              </button>
            ))}
          </div>
        </div>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} innerRadius={pieChartType === 'donut' ? 50 : 0} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}>
                {pieData.map((_, i) => <Cell key={i} fill={CHART_HEX[i % CHART_HEX.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
            </PieChart>
          </ResponsiveContainer>
        ) : <p className="text-center text-muted-foreground text-sm py-10">Sem dados</p>}
      </div>

      {false && (
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-foreground">Comparativo por Dia da Semana</h3>
            <span className="text-sm font-bold font-mono-num" style={{color: settings.dasColors?.averageText || '#10b981'}}>
              Média: {formatCurrency(dowData.reduce((sum, d) => sum + d.media, 0) / (dowData.length || 1))}
            </span>
          </div>
          <button onClick={() => setSelDays([0,1,2,3,4,5,6])} className="text-xs text-primary hover:underline">Resetar</button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">Clique para selecionar/desselecionar dias:</p>
        <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
          {DAY_NAMES_FULL.map((name, i) => (
            <button key={i} onClick={() => toggleDay(i)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                selDays.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}>
              {name.substring(0, 3)}
            </button>
          ))}
        </div>
        {dowData.some(d => d.media !== 0) ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dowData}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60}
                tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
              <Bar dataKey="media" fill={CHART_HEX[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-center text-muted-foreground text-sm py-10">Sem dados</p>}
      </div>
      )}

      <div className="bg-card rounded-2xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-4">Totais (Resumo Geral)</h3>
        <TotaisTab embedded />
      </div>

      <div className="order-[90] bg-card rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Comparativo Anual {selectedYear} ({purchaseComparisonMode === 'fornecedor' ? 'Fornecedores x Vendas' : 'Compras x Vendas'})
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {purchaseComparisonMode === 'fornecedor'
                ? 'Compras soma apenas itens marcados como Fornecedor.'
                : 'Compras soma fornecedor, imposto e despesa.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPurchaseComparisonMode((mode) => mode === 'total' ? 'fornecedor' : 'total')}
            className="shrink-0 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold text-primary shadow-sm transition hover:bg-muted"
            title="Alternar tipo de comparação"
          >
            {purchaseComparisonMode === 'total' ? 'Ver fornecedor' : 'Ver total'}
          </button>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={comprasVsVendasData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={60}
              tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
            <Legend />
            <Bar
              dataKey="compras"
              name={purchaseComparisonMode === 'fornecedor' ? 'Compras Fornecedor' : 'Compras'}
              fill={purchaseComparisonMode === 'fornecedor' ? '#16a34a' : '#f59e0b'}
              radius={[6, 6, 0, 0]}
            />
            <Bar dataKey="vendas" name="Vendas (L1+L2)" fill="#2563eb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


