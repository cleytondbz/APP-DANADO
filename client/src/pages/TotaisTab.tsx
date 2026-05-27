import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency, getDaysInMonth } from '@/lib/helpers';
import { MONTH_NAMES, CHART_HEX } from '@/lib/types';
import MonthSelector from '@/components/MonthSelector';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { motion } from 'framer-motion';

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

export default function TotaisTab({ embedded = false }: { embedded?: boolean }) {
  const { stores, getCategories, selectedYear, selectedMonth, settings } = useApp();
  const cats = getCategories();
  const [selCats, setSelCats] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    cats.forEach(c => { m[c.id] = true; });
    return m;
  });
  const [dailyChartType, setDailyChartType] = useState<'bar' | 'line'>('bar');
  const [yearlyChartType, setYearlyChartType] = useState<'line' | 'bar'>('line');

  const calcStoreMonthTotal = (storeId: string, y: number, m: number) => {
    const store = stores[storeId];
    if (!store) return 0;
    const md = store.months.find(x => x.year === y && x.month === m);
    if (!md) return 0;
    let t = 0;
    md.entries.forEach(e => {
      store.categories.forEach(c => {
        if (selCats[c.id] !== false && (c.operation === 'add' || c.operation === 'subtract')) {
          t += (c.operation === 'add' ? 1 : -1) * (e.values[c.id] || 0);
        }
      });
    });
    return t;
  };

  const calcStoreDailyTotal = (storeId: string, y: number, m: number, day: number) => {
    const store = stores[storeId];
    if (!store) return 0;
    const md = store.months.find(x => x.year === y && x.month === m);
    if (!md) return 0;
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const entry = md.entries.find(e => e.date === ds);
    if (!entry) return 0;
    let t = 0;
    store.categories.forEach(c => {
      if (selCats[c.id] !== false && (c.operation === 'add' || c.operation === 'subtract')) {
        t += (c.operation === 'add' ? 1 : -1) * (entry.values[c.id] || 0);
      }
    });
    return t;
  };

  const currentTotal = useMemo(() => {
    let t = 0;
    const md = stores['loja1']?.months.find(x => x.year === selectedYear && x.month === selectedMonth);
    md?.entries.forEach(e => {
      cats.forEach(c => {
        if (selCats[c.id] !== false && (c.operation === 'add' || c.operation === 'subtract')) t += (c.operation === 'add' ? 1 : -1) * (e.values[c.id] || 0);
      });
    });
    const md2 = stores['loja2']?.months.find(x => x.year === selectedYear && x.month === selectedMonth);
    md2?.entries.forEach(e => {
      stores['loja2'].categories.forEach(c => {
        if (selCats[c.id] !== false && (c.operation === 'add' || c.operation === 'subtract')) t += (c.operation === 'add' ? 1 : -1) * (e.values[c.id] || 0);
      });
    });
    return t;
  }, [stores, selectedYear, selectedMonth, selCats, cats]);

  const yearlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      name: MONTH_NAMES[i].substring(0, 3),
      loja1: calcStoreMonthTotal('loja1', selectedYear, i + 1),
      loja2: calcStoreMonthTotal('loja2', selectedYear, i + 1),
    }));
  }, [stores, selectedYear, selCats]);

  const dailyData = useMemo(() => {
    const days = getDaysInMonth(selectedYear, selectedMonth);
    return Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      loja1: calcStoreDailyTotal('loja1', selectedYear, selectedMonth, i + 1),
      loja2: calcStoreDailyTotal('loja2', selectedYear, selectedMonth, i + 1),
    }));
  }, [stores, selectedYear, selectedMonth, selCats]);

  const toggleCat = (id: string) => setSelCats(p => ({ ...p, [id]: !p[id] }));

  const tooltipTextColor = settings.dasColors?.tooltipText || '#000000';
  const tooltipBgColor = settings.dasColors?.tooltipBg || '#ffffff';

  return (
    <div className={`space-y-4 ${embedded ? '' : 'pb-24'}`}>
      {!embedded && <MonthSelector />}

      {/* Total Personalizado */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-accent rounded-2xl p-5 text-center card-glow">
        <p className="text-accent-foreground/70 text-xs">Total Personalizado (Ambas Lojas)</p>
        <p className="text-3xl font-bold text-accent-foreground font-mono-num">{formatCurrency(currentTotal)}</p>
      </motion.div>

      {/* Category Toggles */}
      <div className="bg-card rounded-2xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Categorias para Soma</h3>
        <div className="flex flex-wrap gap-2">
          {cats.map(c => (
            <button key={c.id} onClick={() => toggleCat(c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selCats[c.id] !== false ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground line-through'
              }`}>
              {c.name} ({c.operation === 'add' ? '+' : '-'})
            </button>
          ))}
        </div>
      </div>

      {/* Daily Comparison Chart */}
      <div className="bg-card rounded-2xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Comparativo Diário - {selectedMonth}/{selectedYear}</h3>
        {dailyData.some(d => d.loja1 !== 0 || d.loja2 !== 0) ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyData}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60}
                tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="loja1" name="Loja 1" fill={CHART_HEX[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="loja2" name="Loja 2" fill={CHART_HEX[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-center text-muted-foreground text-sm py-10">Sem dados para este mês</p>}
      </div>

      {/* Yearly Comparison Chart */}
      <div className="bg-card rounded-2xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Comparativo Mensal - {selectedYear}</h3>
        {yearlyData.some(d => d.loja1 !== 0 || d.loja2 !== 0) ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={yearlyData}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60}
                tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip tooltipTextColor={tooltipTextColor} tooltipBgColor={tooltipBgColor} />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="loja1" name="Loja 1" stroke={CHART_HEX[0]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="loja2" name="Loja 2" stroke={CHART_HEX[1]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="text-center text-muted-foreground text-sm py-10">Sem dados para este ano</p>}
      </div>

      {/* Monthly Summary Table */}
      <div className="bg-card rounded-2xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Resumo Mensal - {selectedYear}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 text-muted-foreground">Mês</th>
                <th className="text-right p-2 text-muted-foreground">Loja 1</th>
                <th className="text-right p-2 text-muted-foreground">Loja 2</th>
                <th className="text-right p-2 text-muted-foreground font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {yearlyData.map((d, i) => (
                <tr key={i} className={`border-b border-border/30 ${i + 1 === selectedMonth ? 'bg-primary/10' : ''}`}>
                  <td className="p-2 font-medium text-foreground">{MONTH_NAMES[i]}</td>
                  <td className="p-2 text-right font-mono-num text-foreground">{formatCurrency(d.loja1)}</td>
                  <td className="p-2 text-right font-mono-num text-foreground">{formatCurrency(d.loja2)}</td>
                  <td className="p-2 text-right font-mono-num font-bold text-primary">{formatCurrency(d.loja1 + d.loja2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
