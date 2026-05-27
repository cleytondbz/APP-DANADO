import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency, getDaysInMonth, getDayOfWeek } from '@/lib/helpers';
import { CHART_HEX, DAY_NAMES_FULL } from '@/lib/types';
import MonthSelector from '@/components/MonthSelector';
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

export default function DashboardTab() {
  const { settings, getCategories, getMonthData, selectedYear, selectedMonth } = useApp();
  const cats = getCategories();
  const md = getMonthData(selectedYear, selectedMonth);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selDays, setSelDays] = useState<number[]>([0,1,2,3,4,5,6]);
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('bar');
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
    <div className="space-y-4 pb-24">
      <MonthSelector />

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
          backgroundColor: settings.dasColors?.monthTotal || '#0066ff',
          color: '#ffffff'
        }}>
        <p className="text-white/70 text-xs">Total do Mês</p>
        <p className="text-3xl font-bold text-white font-mono-num" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{formatCurrency(monthTotal)}</p>
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
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {cats.map((c, i) => (
            <button key={c.id} onClick={() => setSelCat(p => p === c.id ? null : c.id)}
              className={`rounded-xl p-2.5 text-center transition-all border ${
                selCat === c.id
                  ? 'border-primary bg-primary/20 scale-105'
                  : 'border-border bg-secondary hover:border-primary/50'
              }`}>
              <div className="text-[10px] font-semibold text-muted-foreground truncate">{c.name}</div>
              <div className="text-sm font-bold font-mono-num text-foreground">{formatCurrency(catTotals[c.id] || 0)}</div>

            </button>
          ))}
        </div>
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
    </div>
  );
}
