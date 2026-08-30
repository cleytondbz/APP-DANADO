import { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency, getDaysInMonth, getDayOfWeek, dateStr } from '@/lib/helpers';
import { DAY_NAMES } from '@/lib/types';
import { Plus, Settings2, Pencil, Trash2, X, Check, GripVertical, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MONTH_NAMES } from '@/lib/types';
import type { Category } from '@/lib/types';

const HIDDEN_LANCAMENTO_CATEGORY_IDS = new Set(['cart_jb', 'est_desp', 'sangria']);
const STORE_THEME: Record<string, { label: string; color: string; soft: string; border: string; text: string }> = {
  loja1: { label: 'Loja 1', color: '#0d6efd', soft: 'rgba(13,110,253,0.12)', border: 'rgba(13,110,253,0.35)', text: '#0d6efd' },
  loja2: { label: 'Loja 2', color: '#f59e0b', soft: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.45)', text: '#b45309' },
  loja3: { label: 'Loja 3', color: '#7c3aed', soft: 'rgba(124,58,237,0.14)', border: 'rgba(124,58,237,0.40)', text: '#7c3aed' },
};

export default function LancamentosTab({ readOnly = false }: { readOnly?: boolean }) {
  const { settings, setSettings, getCategories, getMonthData, saveEntry, clearManualFieldMark, deleteEntry, removeCategory, updateCategory, selectedYear, selectedMonth, currentStore, stores, setStores, fechamentoData, setFechamentoData, caixaData, addTimelineEntry } = useApp();
  const allCats = getCategories();
  const md = getMonthData(selectedYear, selectedMonth);
  const days = getDaysInMonth(selectedYear, selectedMonth);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [showCustomSaldo, setShowCustomSaldo] = useState(false);
  const [showBoletoLists, setShowBoletoLists] = useState(false);
  const [newBoletoCompany, setNewBoletoCompany] = useState('');
  const [customSaldoLabelDraft, setCustomSaldoLabelDraft] = useState('');
  const [selDay, setSelDay] = useState(1);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [editDate, setEditDate] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatOp, setNewCatOp] = useState<'add' | 'subtract' | 'null'>('add');
  const [newCatMonths, setNewCatMonths] = useState<string[]>([]);
  const [keepOpen, setKeepOpen] = useState(false);
  const [draggedCat, setDraggedCat] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const customSaldoLabelEditingRef = useRef(false);
  const currentMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const boletoMappedCategory = useMemo(() => {
    const mapping = currentStore === 'loja1'
      ? settings.fieldMappingLan1
      : currentStore === 'loja2'
        ? settings.fieldMappingLan2
        : [];
    return (mapping || []).find((item: any) => item?.fechamento_field === 'boleto')?.lancamento_field || '';
  }, [currentStore, settings.fieldMappingLan1, settings.fieldMappingLan2]);

  const getBoletoDetailsForDay = (date: string, categoryId: string) => {
    const savedDetails = md?.entries.find(e => e.date === date)?.details?.[categoryId];
    if (Array.isArray(savedDetails) && savedDetails.length > 0) return savedDetails;
    if (categoryId !== boletoMappedCategory) return [];
    const items = Array.isArray(caixaData?.[currentStore]?.[date]?.boleto)
      ? caixaData[currentStore][date].boleto
      : [];
    return items
      .filter((item: any) => String(item?.descricao || '').trim())
      .map((item: any) => ({
        label: String(item.descricao || '').trim(),
        amount: Number(String(item.valor || '0').replace(',', '.')) * (Number(item.quantidade || 1) || 1),
      }));
  };
  const storeTheme = STORE_THEME[currentStore] || STORE_THEME.loja1;
  const cats = useMemo(() => {
    return allCats.filter((cat) => !cat.activeMonths?.length || cat.activeMonths.includes(currentMonthKey));
  }, [allCats, currentMonthKey]);
  const categoryMonthOptions = useMemo(() => (
    Array.from({ length: 12 }, (_v, idx) => `${selectedYear}-${String(idx + 1).padStart(2, '0')}`)
  ), [selectedYear]);
  const allMonthDays = useMemo(() => Array.from({ length: days }, (_, i) => i + 1), [days]);

  const customSaldoOptions = useMemo(() => {
    const opts: { key: string; storeId: string; storeLabel: string; catId: string; catLabel: string; color: string; soft: string; border: string }[] = [];
    (['loja1', 'loja2', 'loja3'] as const).forEach((storeId) => {
      const store = stores[storeId];
      (store?.categories || [])
        .filter((c) => !HIDDEN_LANCAMENTO_CATEGORY_IDS.has(c.id) && (!c.activeMonths?.length || c.activeMonths.includes(currentMonthKey)))
        .forEach((c) => {
          const theme = STORE_THEME[storeId];
          opts.push({
            key: `${storeId}:${c.id}`,
            storeId,
            storeLabel: theme.label,
            catId: c.id,
            catLabel: c.name,
            color: theme.text,
            soft: theme.soft,
            border: theme.border,
          });
        });
    });
    return opts;
  }, [stores, currentMonthKey]);

  const legacyCustomSaldoSelection = useMemo(() => {
    return (settings.customSaldoSelection || [])
      .map((key) => {
        const [storeId, categoryId] = key.split(':');
        return categoryId ? `${storeId}:${categoryId}` : `${currentStore}:${key}`;
      })
      .filter((key) => customSaldoOptions.some((opt) => opt.key === key));
  }, [settings.customSaldoSelection, currentStore, customSaldoOptions]);

  const customSaldoConfig = settings.customSaldoByStoreMonth?.[currentStore]?.[currentMonthKey];
  const customSaldoLabel = customSaldoConfig?.label || 'Saldo Personalizado';
  const customSaldoSelection = customSaldoConfig?.selection || legacyCustomSaldoSelection;
  const activeCustomDays = customSaldoConfig
    ? customSaldoConfig.days
    : (settings.customSaldoDays?.length ? settings.customSaldoDays : allMonthDays);

  const calculateCustomSaldoTotal = (selection: string[], selectedDays: number[]) => {
    return selection.reduce((acc, categoryId) => {
      const opt = customSaldoOptions.find((item) => item.key === categoryId);
      if (!opt) return acc;
      const store = stores[opt.storeId as keyof typeof stores];
      if (!store) return acc;
      const monthData = store.months.find((m) => m.year === selectedYear && m.month === selectedMonth);
      if (!monthData) return acc;
      const catTotal = monthData.entries.reduce((sum, e) => {
        const day = parseInt((e.date || '').split('-')[2] || '0', 10);
        if (!selectedDays.includes(day)) return sum;
        return sum + (e.values?.[opt.catId] || 0);
      }, 0);
      return acc + catTotal;
    }, 0);
  };

  const customSaldoTotal = useMemo(() => {
    return calculateCustomSaldoTotal(customSaldoSelection, activeCustomDays);
  }, [customSaldoSelection, activeCustomDays, stores, currentStore, selectedYear, selectedMonth]);

  const getCustomSaldoLabels = (selection: string[]) =>
    selection.map((key) => {
      const opt = customSaldoOptions.find((item) => item.key === key);
      return opt ? `${opt.catLabel} (${opt.storeLabel})` : key;
    });

  const saveCustomSaldoConfig = (selection: string[], selectedDays: number[], action: string, label = customSaldoLabel) => {
    const cleanSelection = selection.filter((key) => customSaldoOptions.some((opt) => opt.key === key));
    const cleanDays = Array.from(new Set(selectedDays.filter((day) => day >= 1 && day <= days))).sort((a, b) => a - b);
    const total = calculateCustomSaldoTotal(cleanSelection, cleanDays);
    const updatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace('T', ' ');
    const historyEntry = {
      id: `custom_saldo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      updatedAt,
      storeId: currentStore,
      monthKey: currentMonthKey,
      selection: cleanSelection,
      selectionLabels: getCustomSaldoLabels(cleanSelection),
      days: cleanDays,
      total,
      action,
    };

    setSettings((s) => ({
      ...s,
      customSaldoByStoreMonth: {
        ...(s.customSaldoByStoreMonth || {}),
        [currentStore]: {
          ...(s.customSaldoByStoreMonth?.[currentStore] || {}),
          [currentMonthKey]: {
            label: 'Contador',
            selection: cleanSelection,
            days: cleanDays,
            updatedAt,
            total,
          },
        },
      },
      customSaldoHistory: [...(s.customSaldoHistory || []), historyEntry].slice(-500),
    }));
  };

  const toggleCustomSaldo = (key: string) => {
    const next = customSaldoSelection.includes(key)
      ? customSaldoSelection.filter((x) => x !== key)
      : [...customSaldoSelection, key];
    saveCustomSaldoConfig(next, activeCustomDays, 'toggle_category');
  };

  const toggleCustomSaldoDay = (day: number) => {
    const next = activeCustomDays.includes(day)
      ? activeCustomDays.filter((d) => d !== day)
      : [...activeCustomDays, day].sort((a, b) => a - b);
    saveCustomSaldoConfig(customSaldoSelection, next, 'toggle_day');
  };

  const setAllCustomSaldoDays = () => {
    saveCustomSaldoConfig(customSaldoSelection, allMonthDays, 'select_all_days');
  };

  const clearCustomSaldoDays = () => {
    saveCustomSaldoConfig(customSaldoSelection, [], 'clear_days');
  };

  const updateCustomSaldoLabel = (label: string) => {
    saveCustomSaldoConfig(customSaldoSelection, activeCustomDays, 'update_label', label);
  };

  useEffect(() => {
    if (!showCustomSaldo) return;
    if (customSaldoLabelEditingRef.current) return;
    setCustomSaldoLabelDraft(customSaldoLabel);
  }, [showCustomSaldo, customSaldoLabel]);

  const commitCustomSaldoLabel = () => {
    updateCustomSaldoLabel(customSaldoLabelDraft);
  };

  const addBoletoCompany = () => {
    const name = newBoletoCompany.trim();
    if (!name) return;
    setSettings((s) => {
      const current = s.boletoCompanies || [];
      const exists = current.some((item) => item.localeCompare(name, 'pt-BR', { sensitivity: 'base' }) === 0);
      if (exists) return s;
      return {
        ...s,
        boletoCompanies: [...current, name].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      };
    });
    setNewBoletoCompany('');
    toast.success('Empresa adicionada à lista.');
  };

  const toggleNewCatMonth = (monthKey: string) => {
    setNewCatMonths((prev) => {
      if (prev.includes(monthKey)) return prev.filter((m) => m !== monthKey);
      if (prev.length >= 6) {
        toast.error('Selecione no máximo 6 meses para a categoria.');
        return prev;
      }
      return [...prev, monthKey].sort();
    });
  };

  const monthTotal = useMemo(() => {
    let t = 0;
    md?.entries.forEach(e => { cats.forEach(c => { 
      if (c.operation !== 'null') {
        t += (c.operation === 'add' ? 1 : -1) * (e.values[c.id] || 0); 
      }
    }); });
    return t;
  }, [md, cats]);

  const openAdd = () => {
    if (readOnly) return;
    const v: Record<string, string> = {};
    cats.forEach(c => { v[c.id] = ''; });
    setVals(v); setSelDay(1); setShowAdd(true);
  };

  const openEdit = (ds: string) => {
    if (readOnly) return;
    const entry = md?.entries.find(e => e.date === ds);
    const v: Record<string, string> = {};
    cats.forEach(c => { v[c.id] = entry?.values[c.id]?.toString() || ''; });
    setVals(v); setEditDate(ds); setShowEdit(true);
  };

  const handleSave = () => {
    if (readOnly) return;
    const ds = dateStr(selectedYear, selectedMonth, selDay);
    const values: Record<string, number> = {};
    cats.forEach(c => { values[c.id] = parseFloat(vals[c.id]?.replace(',', '.') || '0') || 0; });
    saveEntry(ds, values, 'manual');
    toast.success('Lançamento salvo!');
    
    const valoresStr = Object.entries(values)
      .filter(([_, v]) => v > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    
    addTimelineEntry(
      'lancamentos',
      'create',
      ds,
      'Lançamento',
      undefined,
      valoresStr,
      `Novo lançamento criado: ${valoresStr}`
    );
    
    if (keepOpen) {
      // Reset form for next entry
      const v: Record<string, string> = {};
      cats.forEach(c => { v[c.id] = ''; });
      setVals(v);
      setSelDay(selDay < days ? selDay + 1 : selDay);
    } else {
      setShowAdd(false);
    }
  };

  const handleUpdate = () => {
    if (readOnly) return;
    const values: Record<string, number> = {};
    cats.forEach(c => { values[c.id] = parseFloat(vals[c.id]?.replace(',', '.') || '0') || 0; });
    saveEntry(editDate, values, 'manual');
    setShowEdit(false);
    toast.success('Lançamento atualizado!');
    
    const valoresStr = Object.entries(values)
      .filter(([_, v]) => v > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    
    addTimelineEntry(
      'lancamentos',
      'update',
      editDate,
      'Lançamento',
      'Anterior',
      valoresStr,
      `Lançamento atualizado: ${valoresStr}`
    );
  };

  const isFieldManualOnEdit = (fieldId: string) => {
    const entry = md?.entries.find(e => e.date === editDate);
    return !!entry?.manualFields?.includes(fieldId);
  };

  const handleDelete = (ds: string) => {
    if (readOnly) return;
    if (confirm('Excluir este lançamento?')) {
      const entry = md?.entries.find(e => e.date === ds);
      deleteEntry(ds);
      toast.success('Excluído!');
      
      if (entry) {
        const valoresStr = Object.entries(entry.values)
          .filter(([_, v]) => v > 0)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        
        addTimelineEntry(
          'lancamentos',
          'delete',
          ds,
          'Lançamento',
          valoresStr,
          undefined,
          `Lançamento removido: ${valoresStr}`
        );
      }
    }
  };

  const handleSyncToFechamento = (ds: string) => {
    if (readOnly) return;
    const entry = md?.entries.find(e => e.date === ds);
    if (!entry) return;

    if (!confirm(`Enviar dados do dia ${ds} para Fechamento?`)) return;

    const storeFechamento = fechamentoData[currentStore] || {};
    const fechamentoDia = { ...(storeFechamento[ds] || {}) };
    const values = entry.values;

    cats.forEach(c => {
      if (c.name.toLowerCase() === 'dinheiro') fechamentoDia.dinheiro = values[c.id] || 0;
      if (c.name.toLowerCase() === 'pix') fechamentoDia.pix = values[c.id] || 0;
      if (c.name.toLowerCase() === 'cartão') fechamentoDia.cartao = values[c.id] || 0;
      if (c.name.toLowerCase() === 'boleto') fechamentoDia.boleto = values[c.id] || 0;
    });

    setFechamentoData({
      ...fechamentoData,
      [currentStore]: {
        ...storeFechamento,
        [ds]: fechamentoDia,
      },
    });
    toast.success('Enviado para Fechamento!');
  };

  const handleAddCat = () => {
    if (!newCatName.trim()) { toast.error('Digite o nome'); return; }
    const months = newCatMonths.length ? newCatMonths : [currentMonthKey];
    if (months.length > 6) {
      toast.error('Selecione no máximo 6 meses.');
      return;
    }
    const id = newCatName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const newCategory: Category = {
      id,
      name: newCatName.trim(),
      operation: newCatOp,
      order: (stores[currentStore]?.categories || []).length + 1,
      activeMonths: months,
    };
    setStores({
      ...stores,
      [currentStore]: {
        ...stores[currentStore],
        categories: [...(stores[currentStore]?.categories || []), newCategory],
      },
    });
    setNewCatName('');
    setNewCatOp('add');
    setNewCatMonths([]);
    toast.success(`Categoria adicionada em ${months.length} mês(es).`);
  };

  const getDayTotal = (ds: string) => {
    const entry = md?.entries.find(e => e.date === ds);
    if (!entry) return 0;
    let t = 0;
    cats.forEach(c => { 
      if (c.operation === 'add' || c.operation === 'subtract') {
        t += (c.operation === 'add' ? 1 : -1) * (entry.values[c.id] || 0); 
      }
    });
    return t;
  };

  const allDays = useMemo(() => {
    return Array.from({ length: days }, (_, i) => {
      const d = i + 1;
      const ds = dateStr(selectedYear, selectedMonth, d);
      return { day: d, ds, entry: md?.entries.find(e => e.date === ds), dow: getDayOfWeek(ds) };
    });
  }, [md, selectedYear, selectedMonth, days]);

  const handleMoveCategory = (catId: string, direction: 'up' | 'down') => {
    const index = allCats.findIndex(c => c.id === catId);
    if ((direction === 'up' && index > 0) || (direction === 'down' && index < allCats.length - 1)) {
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      const cat1 = allCats[index];
      const cat2 = allCats[newIndex];
      const temp = cat1.order;
      updateCategory(cat1.id, { order: cat2.order });
      updateCategory(cat2.id, { order: temp });
      toast.success(`Categoria movida para ${direction === 'up' ? 'cima' : 'baixo'}!`);
    }
  };

  const handleExportExcel = () => {
    try {
      const csvRows: string[] = [
        ['Dia', ...cats.map(c => c.name), 'Total'].map(v => `"${v}"`).join(','),
      ];

      allDays.forEach(({ day, ds, entry }) => {
        const row = [day];
        let dayTotal = 0;
        cats.forEach(c => {
          const val = entry?.values[c.id] || 0;
          row.push(val);
          if (c.operation === 'add' || c.operation === 'subtract') {
            dayTotal += (c.operation === 'add' ? 1 : -1) * val;
          }
        });
        row.push(dayTotal);
        csvRows.push(row.map(v => `"${v}"`).join(','));
      });

      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Lancamentos_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Lançamentos exportados!');
    } catch (error) {
      toast.error('Erro ao exportar');
      console.error(error);
    }
  };

  const handleImportExcel = () => {
    if (!importFile) { toast.error('Selecione um arquivo'); return; }
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csv = e.target?.result as string;
        const lines = csv.split('\n').filter(l => l.trim());
        if (lines.length < 2) { toast.error('Arquivo vazio'); return; }

        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
          if (!row[0]) continue;

          const day = parseInt(row[0]);
          if (day < 1 || day > days) continue;

          const ds = dateStr(selectedYear, selectedMonth, day);
          const values: Record<string, number> = {};

          cats.forEach((c, idx) => {
            const val = parseFloat(row[idx + 1]) || 0;
            if (val !== 0) values[c.id] = val;
          });

          if (Object.keys(values).length > 0) {
            saveEntry(ds, values, 'manual');
            count++;
          }
        }

        toast.success(`${count} lançamentos importados!`);
        setImportFile(null);
      };
      reader.readAsText(importFile);
        } catch (error) {
          toast.error('Erro ao processar arquivo');
          console.error(error);
        }
  };

  const handleExportAnnual = () => {
    try {
      const store = stores[currentStore];
      if (!store) { toast.error('Loja não encontrada'); return; }

      const csvRows: string[] = [
        ['Mês', 'Dia', ...cats.map(c => c.name), 'Total'].map((v: string) => `"${v}"`).join(','),
      ];

      for (let m = 1; m <= 12; m++) {
        const monthData = store.months.find(x => x.year === selectedYear && x.month === m);
        if (monthData) {
          monthData.entries.forEach(e => {
            const row: string[] = [MONTH_NAMES[m - 1], e.date.split('-')[2]];
            let dayTotal = 0;
            cats.forEach(c => {
              const val = e.values[c.id] || 0;
              row.push(String(val));
              if (c.operation === 'add' || c.operation === 'subtract') {
                dayTotal += (c.operation === 'add' ? 1 : -1) * val;
              }
            });
            row.push(String(dayTotal));
            csvRows.push(row.map(v => `"${v}"`).join(','));
          });
        }
      }

      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Lancamentos_Backup_${selectedYear}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Backup anual exportado!');
    } catch (error) {
      toast.error('Erro ao exportar backup anual');
      console.error(error);
    }
  };

  const handleImportAnnual = () => {
    if (!importFile) { toast.error('Selecione um arquivo'); return; }
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const csv = e.target?.result as string;
          const lines = csv.split('\n').filter(l => l.trim());
          if (lines.length < 2) { toast.error('Arquivo vazio'); return; }

          let count = 0;
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',').map(p => p.replace(/^\"|\"$/g, ''));
            if (parts.length < 3) continue;

            const monthName = parts[0];
            const day = parts[1];
            const monthIndex = MONTH_NAMES.indexOf(monthName);
            if (monthIndex === -1) continue;

            const month = monthIndex + 1;
            const date = dateStr(selectedYear, month, parseInt(day));
            const values: Record<string, number> = {};

            cats.forEach((c, idx) => {
              const val = parseFloat(parts[idx + 2]) || 0;
              values[c.id] = val;
            });

            saveEntry(date, values, 'manual');
            count++;
          }

          toast.success(`${count} lançamentos importados de ${selectedYear}!`);
          setImportFile(null);
        } catch (parseError) {
          toast.error('Erro ao processar arquivo');
          console.error(parseError);
        }
      };
      reader.readAsText(importFile);
    } catch (error) {
      toast.error('Erro ao importar backup anual');
      console.error(error);
    }
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Actions */}
      <div className="flex gap-2 flex-col">
        {!readOnly && (
          <>
            <Button onClick={openAdd} className="w-full h-12 gap-2 text-base font-semibold"><Plus className="w-5 h-5" /> Lançar</Button>
            <div className="flex gap-2 flex-wrap items-center">
              <Button onClick={() => setShowCatMgr(true)} variant="secondary" className="gap-1 h-7 text-xs"><Settings2 className="w-3 h-3" /> Categorias</Button>
              <Button onClick={handleExportExcel} variant="outline" className="gap-1 h-7 text-xs"><Download className="w-3 h-3" /> CSV</Button>
              <label className="cursor-pointer h-7 w-7 flex items-center justify-center bg-secondary hover:bg-secondary/80 rounded text-xs">
                <Upload className="w-3 h-3" />
                <Input type="file" accept=".csv" onChange={e => setImportFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
              <Button onClick={handleImportExcel} disabled={!importFile} variant="secondary" className="h-7 text-xs px-1">Imp</Button>
              <Button onClick={handleExportAnnual} variant="outline" className="gap-1 h-7 text-xs"><Download className="w-3 h-3" /> Anual</Button>
              <label className="cursor-pointer h-7 w-7 flex items-center justify-center bg-secondary hover:bg-secondary/80 rounded text-xs">
                <Upload className="w-3 h-3" />
                <Input type="file" accept=".csv" onChange={e => setImportFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
              <Button onClick={handleImportAnnual} disabled={!importFile} variant="secondary" className="h-7 text-xs px-1">Imp</Button>
            </div>
          </>
        )}
        {readOnly && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Acesso somente visualizacao: voce pode consultar Dashboard, Lancamentos e configurar o Contador.
          </div>
        )}
      </div>

      {/* Total bar */}
      <div className="flex flex-col md:flex-row gap-2 md:items-stretch">
        <div className="rounded-xl px-3 py-1.5 text-center flex-1 min-w-0 flex items-center justify-center gap-2" style={{ background: storeTheme.soft, border: `1px solid ${storeTheme.border}` }}>
          <span className="text-sm text-muted-foreground">Total:</span>
          <span className="font-extrabold font-mono-num text-2xl md:text-3xl" style={{ color: storeTheme.text }}>{formatCurrency(monthTotal)}</span>
        </div>
        <div className="rounded-xl px-3 py-2 flex items-center justify-between gap-2 md:w-[260px] md:ml-auto" style={{ background: storeTheme.soft, border: `1px solid ${storeTheme.border}` }}>
          <div>
            <div className="text-[11px] text-muted-foreground">Contador</div>
            <div className="font-bold font-mono-num" style={{ color: storeTheme.text }}>{formatCurrency(customSaldoTotal)}</div>
          </div>
          <Button onClick={() => setShowCustomSaldo(true)} variant="secondary" className="h-7 text-xs px-2">
            Configurar
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setShowBoletoLists(true)}
          className="bg-secondary/80 hover:bg-secondary border border-border rounded-xl px-3 py-2 flex flex-col items-center justify-center gap-0.5 md:w-[92px] transition-colors"
        >
          <span className="text-[11px] text-muted-foreground">Boleto</span>
          <span className="text-sm font-bold text-foreground">Listas</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <div className="inline-block min-w-full">
            {/* Header */}
            <div className={`flex text-white font-bold !static !top-auto !z-0 ${
              settings.lancamentosHeaderFontSize === 'xs' ? 'text-sm' :
              settings.lancamentosHeaderFontSize === 'sm' ? 'text-base' :
              settings.lancamentosHeaderFontSize === 'lg' ? 'text-3xl' :
              settings.lancamentosHeaderFontSize === 'xl' ? 'text-4xl' :
              'text-2xl'
            }`} style={{ fontFamily: 'Century, serif', background: storeTheme.color }}>
              <div className="w-20 p-3 text-center shrink-0">Dia</div>
              {cats.map(c => <div key={c.id} className="w-36 p-3 text-center shrink-0">{c.name}</div>)}
              <div className="w-36 p-3 text-center shrink-0">Saldo</div>
              <div className="w-28 p-3 text-center shrink-0">Ações</div>
            </div>
            {/* Rows */}
            {allDays.map(({ day, ds, entry, dow }) => {
              const isSun = dow === 0;
              return (
                <div key={day} className={`flex text-2xl border-b border-border/50 ${isSun ? 'bg-destructive/10' : day % 2 === 0 ? 'bg-secondary/30' : ''} ${readOnly ? '' : 'cursor-pointer hover:bg-primary/5'} transition-colors`} style={{ fontFamily: 'Century, serif', minHeight: '74px' }} onClick={() => !readOnly && openEdit(ds)}>
                  <div className="w-20 px-3 py-1.5 text-center shrink-0 flex flex-col justify-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`font-bold text-2xl ${isSun ? 'text-destructive' : 'text-foreground'}`}>{String(day).padStart(2, '0')}</div>
                      </TooltipTrigger>
                      <TooltipContent className="bg-primary text-primary-foreground font-semibold" sideOffset={6}>Dia</TooltipContent>
                    </Tooltip>
                    <div className={`text-sm ${isSun ? 'text-destructive' : 'text-muted-foreground'}`}>{DAY_NAMES[dow]}</div>
                  </div>
                   {cats.map(c => {
                     const fontSizeClass = settings.lancamentosFontSize === 'xs' ? 'text-sm' : settings.lancamentosFontSize === 'sm' ? 'text-base' : settings.lancamentosFontSize === 'lg' ? 'text-2xl' : settings.lancamentosFontSize === 'xl' ? 'text-3xl' : 'text-lg';
                     const isManualField = !!entry?.manualFields?.includes(c.id);
                     const categoryDetails = getBoletoDetailsForDay(ds, c.id);
                    return (
                    <div key={c.id} className="w-36 px-3 py-1.5 text-center shrink-0 flex items-center justify-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex flex-col items-center leading-none">
                            {isManualField && (
                              <span
                                className="inline-block w-1.5 h-1.5 bg-warning rounded-full mb-0.5"
                                title="Alterado manualmente"
                              />
                            )}
                            <span className={`font-mono-num ${fontSizeClass} font-bold ${entry?.values[c.id] ? (c.operation === 'subtract' ? 'text-destructive' : c.operation === 'add' ? 'text-foreground' : 'text-muted-foreground') : 'text-muted-foreground/40'}`}>
                              {entry?.values[c.id] ? formatCurrency(entry.values[c.id]) : '-'}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-primary text-primary-foreground font-semibold max-w-xs" sideOffset={6}>
                          <div className="space-y-1">
                            <div>{c.name}</div>
                            {categoryDetails.length > 0 && (
                              <div className="pt-1 border-t border-primary-foreground/25 text-xs font-normal">
                                {categoryDetails.slice(0, 8).map((detail: { label: string; amount: number }, index: number) => (
                                  <div key={`${detail.label}-${index}`} className="flex justify-between gap-3">
                                    <span className="truncate max-w-[150px]">{detail.label}</span>
                                    <span className="font-bold">{formatCurrency(Number(detail.amount || 0))}</span>
                                  </div>
                                ))}
                                {categoryDetails.length > 8 && (
                                  <div className="opacity-80">+{categoryDetails.length - 8} empresas</div>
                                )}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                  })}
                  <div className="w-36 px-3 py-1.5 text-center shrink-0 flex items-center justify-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`font-bold font-mono-num ${settings.lancamentosFontSize === 'xs' ? 'text-sm' : settings.lancamentosFontSize === 'sm' ? 'text-base' : settings.lancamentosFontSize === 'lg' ? 'text-2xl' : settings.lancamentosFontSize === 'xl' ? 'text-3xl' : 'text-lg'} ${entry ? (getDayTotal(ds) >= 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground/40'}`}>
                          {entry ? formatCurrency(getDayTotal(ds)) : '-'}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="bg-primary text-primary-foreground font-semibold" sideOffset={6}>Saldo</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="w-28 px-3 py-1.5 flex items-center justify-center gap-2 shrink-0">
                    {entry && !readOnly && (
                      <>
                        <button onClick={() => openEdit(ds)} className="p-1 rounded bg-warning/20 hover:bg-warning/30" title="Editar">
                          <Pencil className="w-4 h-4 text-warning" />
                        </button>
                        <button onClick={() => handleDelete(ds)} className="p-1 rounded bg-destructive/20 hover:bg-destructive/30" title="Deletar">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>

                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Entry Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Dia</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Array.from({ length: days }, (_, i) => i + 1).map(d => (
                  <button key={d} onClick={() => setSelDay(d)}
                    className={`w-9 h-8 rounded-lg text-xs font-semibold transition-all ${selDay === d ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-primary/20'}`}>
                    {String(d).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
            {cats.map(c => (
              <div key={c.id}>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-sm font-medium">{c.name}</label>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.operation === 'add' ? 'bg-success/20 text-success' : c.operation === 'subtract' ? 'bg-destructive/20 text-destructive' : 'bg-muted/20 text-muted-foreground'}`}>
                    {c.operation === 'add' ? '+' : c.operation === 'subtract' ? '-' : 'Nulo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isFieldManualOnEdit(c.id)) return;
                      clearManualFieldMark(editDate, c.id);
                      toast.success(`Marca manual removida de ${c.name}`);
                    }}
                    disabled={!isFieldManualOnEdit(c.id)}
                    className={`ml-auto text-[10px] px-2 py-0.5 rounded border font-semibold ${
                      isFieldManualOnEdit(c.id)
                        ? 'border-warning/60 text-warning hover:bg-warning/10'
                        : 'border-border text-muted-foreground opacity-50 cursor-not-allowed'
                    }`}
                    title="Limpar marca manual"
                  >
                    Limpar marca
                  </button>
                </div>
                <Input 
                  ref={el => { if (el) inputRefs.current[c.id] = el; }}
                  type="text" inputMode="decimal" placeholder="0,00"
                  value={vals[c.id] || ''}
                  onChange={e => setVals(p => ({ ...p, [c.id]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const catIds = cats.map(cat => cat.id);
                      const currentIndex = catIds.indexOf(c.id);
                      
                      if (currentIndex < catIds.length - 1) {
                        const nextCatId = catIds[currentIndex + 1];
                        setTimeout(() => {
                          inputRefs.current[nextCatId]?.focus();
                          inputRefs.current[nextCatId]?.select();
                        }, 0);
                      } else {
                        setTimeout(() => handleSave(), 0);
                      }
                    }
                  }}
                  className="font-mono-num" />
              </div>
            ))}
            
            {/* Keep Open Option */}
            <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
              <input type="checkbox" id="keepOpen" checked={keepOpen} onChange={e => setKeepOpen(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="keepOpen" className="text-sm font-medium cursor-pointer flex-1">Continuar adicionando</label>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowAdd(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleSave} className="flex-1">Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Saldo Dialog */}
      <Dialog open={showBoletoLists} onOpenChange={setShowBoletoLists}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Listas - Empresas de Boleto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newBoletoCompany}
                onChange={(e) => setNewBoletoCompany(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addBoletoCompany();
                }}
                placeholder="Nome da empresa"
              />
              <Button onClick={addBoletoCompany} className="gap-1">
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {(settings.boletoCompanies || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhuma empresa cadastrada.
                </p>
              ) : (
                (settings.boletoCompanies || []).map((name) => (
                  <div key={name} className="flex items-center justify-between gap-2 rounded-lg border bg-secondary/40 px-3 py-2">
                    <span className="text-sm font-semibold truncate">{name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setSettings((s) => ({
                          ...s,
                          boletoCompanies: (s.boletoCompanies || []).filter((item) => item !== name),
                        }));
                        toast.success('Empresa removida.');
                      }}
                      title="Apagar empresa"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCustomSaldo} onOpenChange={setShowCustomSaldo}>
        <DialogContent
          className="max-h-[88vh] overflow-y-auto p-5 md:p-6"
          style={{ borderColor: storeTheme.border, width: 'min(1280px, 96vw)', maxWidth: '96vw' }}
        >
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-1">
              <span>Configurar contador - {storeTheme.label} / {currentMonthKey}</span>
              <span className="text-4xl md:text-5xl font-extrabold font-mono-num" style={{ color: storeTheme.text }}>
                {formatCurrency(customSaldoTotal)}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-xl p-3 mb-4" style={{ background: storeTheme.soft, border: `1px solid ${storeTheme.border}` }}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Dias incluidos</h4>
              <div className="flex gap-2">
                <button type="button" onClick={setAllCustomSaldoDays} className="text-xs font-bold hover:underline" style={{ color: storeTheme.text }}>Todos</button>
                <button type="button" onClick={clearCustomSaldoDays} className="text-xs font-bold hover:underline" style={{ color: storeTheme.text }}>Limpar</button>
              </div>
            </div>
            <div className="grid gap-1 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(34px, 1fr))' }}>
              {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                const checked = activeCustomDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleCustomSaldoDay(day)}
                    className="h-8 rounded-md text-xs font-bold border"
                    style={checked ? { background: storeTheme.color, color: '#fff', borderColor: storeTheme.color } : { background: 'rgba(148,163,184,0.12)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                  >
                    {String(day).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Selecione categorias das lojas 1, 2 e 3. Est/Desp, Sangria e Cart/JB ficam fora do contador.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {(['loja1', 'loja2', 'loja3'] as const).map((storeId) => {
                const theme = STORE_THEME[storeId];
                const opts = customSaldoOptions.filter((opt) => opt.storeId === storeId);
                return (
                  <div key={storeId} className="rounded-xl border p-4 min-w-0" style={{ borderColor: theme.border, background: theme.soft }}>
                    <h4 className="text-sm font-extrabold mb-2" style={{ color: theme.text }}>{theme.label}</h4>
                    <div className="grid grid-cols-1 gap-2">
                      {opts.map((opt) => {
                        const checked = customSaldoSelection.includes(opt.key);
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => toggleCustomSaldo(opt.key)}
                            className="w-full text-left px-3 py-2 rounded-lg border flex items-center justify-between gap-3 bg-card/80 min-w-0"
                            style={checked ? { borderColor: theme.color, boxShadow: `0 0 0 1px ${theme.border}` } : { borderColor: 'var(--border)' }}
                          >
                            <span className="text-sm font-semibold truncate">{opt.catLabel}</span>
                            <span className="text-xs font-bold shrink-0" style={{ color: checked ? theme.text : 'var(--muted-foreground)' }}>
                              {checked ? 'Somar' : 'Ignorar'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar - {editDate.split('-').reverse().join('/')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {cats.map(c => (
              <div key={c.id}>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-sm font-medium">{c.name}</label>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.operation === 'add' ? 'bg-success/20 text-success' : c.operation === 'subtract' ? 'bg-destructive/20 text-destructive' : 'bg-muted/20 text-muted-foreground'}`}>
                    {c.operation === 'add' ? '+' : c.operation === 'subtract' ? '-' : 'Nulo'}
                  </span>
                </div>
                <Input 
                  ref={el => { if (el) inputRefs.current[c.id] = el; }}
                  type="text" inputMode="decimal" placeholder="0,00"
                  value={vals[c.id] || ''}
                  onChange={e => setVals(p => ({ ...p, [c.id]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const catIds = cats.map(cat => cat.id);
                      const currentIndex = catIds.indexOf(c.id);
                      
                      if (currentIndex < catIds.length - 1) {
                        const nextCatId = catIds[currentIndex + 1];
                        setTimeout(() => {
                          inputRefs.current[nextCatId]?.focus();
                          inputRefs.current[nextCatId]?.select();
                        }, 0);
                      } else {
                        setTimeout(() => handleUpdate(), 0);
                      }
                    }
                  }}
                  className="font-mono-num" />
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowEdit(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleUpdate} className="flex-1">Atualizar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Manager Dialog */}
      <Dialog open={showCatMgr} onOpenChange={setShowCatMgr}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Gerenciar Categorias</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {allCats.map((c, idx) => (
              <div key={c.id} className="flex items-center gap-2 p-2 bg-secondary rounded-lg">
                <div className="flex flex-col gap-1">
                  <button onClick={() => handleMoveCategory(c.id, 'up')} disabled={idx === 0}
                    className="p-0.5 rounded hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed" title="Mover para cima">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M3.707 9.293a1 1 0 010 1.414l5 5a1 1 0 001.414 0l5-5a1 1 0 00-1.414-1.414L10 12.586 5.121 7.707a1 1 0 00-1.414 0z" transform="rotate(180 10 10)" /></svg>
                  </button>
                  <button onClick={() => handleMoveCategory(c.id, 'down')} disabled={idx === allCats.length - 1}
                    className="p-0.5 rounded hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed" title="Mover para baixo">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M3.707 9.293a1 1 0 010 1.414l5 5a1 1 0 001.414 0l5-5a1 1 0 00-1.414-1.414L10 12.586 5.121 7.707a1 1 0 00-1.414 0z" /></svg>
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  {c.activeMonths?.length ? (
                    <div className="text-[10px] text-muted-foreground">
                      Meses: {c.activeMonths.map((m) => m.slice(5, 7)).join(', ')}
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground">Fixa: todos os meses</div>
                  )}
                </div>
                <button onClick={() => updateCategory(c.id, { operation: (c.operation === 'add' ? 'subtract' : c.operation === 'subtract' ? 'null' : 'add') as 'add' | 'subtract' | undefined })}
                  className={`text-xs font-bold px-2 py-1 rounded-lg ${c.operation === 'add' ? 'bg-success/20 text-success' : c.operation === 'subtract' ? 'bg-destructive/20 text-destructive' : 'bg-muted/20 text-muted-foreground'}`}>
                  {c.operation === 'add' ? '+ Soma' : c.operation === 'subtract' ? '- Subtrai' : 'Nulo'}
                </button>
                <button onClick={() => { if (confirm(`Excluir "${c.name}"?`)) removeCategory(c.id); }}
                  className="p-1 rounded bg-destructive/20 hover:bg-destructive/30">
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
            <div className="border-t border-border pt-3 space-y-2">
              <h4 className="text-sm font-bold text-foreground">Adicionar Categoria</h4>
              <Input placeholder="Nome da categoria" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
              <div className="rounded-lg border border-border p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Meses da categoria</span>
                  <span className="text-[10px] text-muted-foreground">{newCatMonths.length || 1}/6</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {categoryMonthOptions.map((monthKey) => {
                    const checked = (newCatMonths.length ? newCatMonths : [currentMonthKey]).includes(monthKey);
                    return (
                      <button
                        key={monthKey}
                        type="button"
                        onClick={() => toggleNewCatMonth(monthKey)}
                        className={`h-8 rounded-md border text-xs font-bold ${
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary/40 text-muted-foreground'
                        }`}
                      >
                        {MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1].slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Se não selecionar nada, entra apenas no mês atual. Máximo de 6 meses.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setNewCatOp('add')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold ${newCatOp === 'add' ? 'bg-success text-success-foreground' : 'bg-secondary text-foreground'}`}>
                  + Soma
                </button>
                <button onClick={() => setNewCatOp('subtract')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold ${newCatOp === 'subtract' ? 'bg-destructive text-destructive-foreground' : 'bg-secondary text-foreground'}`}>
                  - Subtrai
                </button>
                <button onClick={() => setNewCatOp('null')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold ${newCatOp === 'null' ? 'bg-muted text-muted-foreground' : 'bg-secondary text-foreground'}`}>
                  Nulo
                </button>
              </div>
              <Button onClick={handleAddCat} className="w-full">Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
