import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseEntry, PurchaseOptions } from '@/lib/types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

const DEFAULT_PURCHASE_OPTIONS: PurchaseOptions = {
  groups: ['M', 'JB'],
  suppliers: [],
  institutions: [],
};

const emptyForm = {
  dueDate: '',
  group: 'M',
  supplier: '',
  documentNumber: '',
  issueDate: '',
  installments: '',
  amount: '',
  paidDate: '',
  financialInstitution: '',
  difType: '' as '' | 'D' | 'I' | 'F',
};

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDateBr = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const normalizeKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const mergeUnique = (base: string[], extra: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  [...base, ...extra].forEach((item) => {
    const key = normalizeKey(item || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push((item || '').trim());
  });
  return out;
};

const parseCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ';' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((x) => x.trim());
};

const csvEscape = (value: string | number | undefined) => {
  const text = String(value ?? '');
  if (text.includes(';') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const normalizeInstallments = (raw: string) => {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 4);
  const left = digits.slice(0, 2);
  const right = digits.slice(2, 4);
  if (digits.length <= 2) return left;
  return `${left}/${right}`;
};

const toInstallmentsFixed = (raw: string) => {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length < 4) return '';
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
};

const normalizeAmountInput = (raw: string) => {
  const cleaned = (raw || '').replace(/[^0-9,]/g, '');
  if (!cleaned) return '';
  if (cleaned.includes(',')) {
    const [intPart, decPart = ''] = cleaned.split(',');
    return `${intPart || '0'},${decPart.slice(0, 2).padEnd(2, '0')}`;
  }
  return `${cleaned},00`;
};

const difTypeColors: Record<'D' | 'I' | 'F', string> = {
  D: 'bg-blue-600 text-white',
  I: 'bg-amber-500 text-white',
  F: 'bg-emerald-600 text-white',
};

export default function ComprasTab() {
  const { settings, setSettings, selectedYear, selectedMonth } = useApp();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showManageOptions, setShowManageOptions] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newInstitution, setNewInstitution] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState<'all' | 'dueDate' | 'supplier' | 'document' | 'issueDate' | 'amount' | 'institution'>('all');
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchType, setGlobalSearchType] = useState<'supplier' | 'document'>('supplier');
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [showRowEdit, setShowRowEdit] = useState(false);
  const [rowEditForm, setRowEditForm] = useState<PurchaseEntry | null>(null);
  const [rowEditOriginalDueDate, setRowEditOriginalDueDate] = useState('');
  const [showClearMonthDialog, setShowClearMonthDialog] = useState(false);
  const [clearMonthPassword, setClearMonthPassword] = useState('');
  const [clearMonthConfirmText, setClearMonthConfirmText] = useState('');
  const [analyticsMode, setAnalyticsMode] = useState<'top' | 'dif'>('top');
  const dueDateRef = useRef<HTMLInputElement | null>(null);
  const groupRef = useRef<HTMLInputElement | null>(null);
  const supplierRef = useRef<HTMLInputElement | null>(null);
  const documentRef = useRef<HTMLInputElement | null>(null);
  const issueDateRef = useRef<HTMLInputElement | null>(null);
  const installmentsRef = useRef<HTMLInputElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const paidDateRef = useRef<HTMLInputElement | null>(null);
  const institutionRef = useRef<HTMLInputElement | null>(null);
  const difSelectorRef = useRef<HTMLDivElement | null>(null);
  const [editingOption, setEditingOption] = useState<null | {
    field: 'groups' | 'suppliers' | 'institutions';
    oldValue: string;
    value: string;
  }>(null);

  const currentMonthKey = monthKey(selectedYear, selectedMonth);
  const allEntries = settings.purchaseEntries || {};
  const entries: PurchaseEntry[] = allEntries[currentMonthKey] || [];
  const existingSuppliersFromEntries = Object.values(allEntries)
    .flatMap((list) => list || [])
    .map((entry) => (entry.supplier || '').trim())
    .filter((name) => name.length > 0);
  const existingInstitutionsFromEntries = Object.values(allEntries)
    .flatMap((list) => list || [])
    .map((entry) => (entry.financialInstitution || '').trim())
    .filter((name) => name.length > 0);

  const options: PurchaseOptions = {
    groups: mergeUnique(DEFAULT_PURCHASE_OPTIONS.groups, settings.purchaseOptions?.groups || []),
    suppliers: mergeUnique(
      DEFAULT_PURCHASE_OPTIONS.suppliers,
      [...(settings.purchaseOptions?.suppliers || []), ...existingSuppliersFromEntries]
    ),
    institutions: mergeUnique(
      DEFAULT_PURCHASE_OPTIONS.institutions,
      [...(settings.purchaseOptions?.institutions || []), ...existingInstitutionsFromEntries]
    ),
  };

  const normalizeText = (value: string | number | undefined | null) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const filteredEntries = useMemo(() => {
    const term = normalizeText(searchTerm.trim());
    if (!term) return entries;

    return entries.filter((entry) => {
      const due = formatDateBr(entry.dueDate);
      const issue = formatDateBr(entry.issueDate);
      const paid = formatDateBr(entry.paidDate);
      const amountBr = entry.amount.toFixed(2).replace('.', ',');

      const allBucket = [
        entry.dueDate,
        due,
        entry.group,
        entry.supplier,
        entry.documentNumber,
        entry.issueDate,
        issue,
        entry.installments,
        entry.amount,
        amountBr,
        entry.financialInstitution,
        entry.paidDate,
        paid,
      ]
        .map((v) => normalizeText(v))
        .join(' ');

      const scopedBuckets: Record<typeof searchField, string> = {
        all: allBucket,
        dueDate: [entry.dueDate, due].map((v) => normalizeText(v)).join(' '),
        supplier: normalizeText(entry.supplier),
        document: normalizeText(entry.documentNumber),
        issueDate: [entry.issueDate, issue].map((v) => normalizeText(v)).join(' '),
        amount: [entry.amount, amountBr].map((v) => normalizeText(v)).join(' '),
        institution: normalizeText(entry.financialInstitution),
      };

      return scopedBuckets[searchField].includes(term);
    });
  }, [entries, searchTerm, searchField]);

  const groupedByDueDate = useMemo(() => {
    const map = new Map<string, PurchaseEntry[]>();
    filteredEntries.forEach((entry) => {
      const key = entry.dueDate || '';
      const list = map.get(key) || [];
      list.push(entry);
      map.set(key, list);
    });

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dueDate, items]) => ({
        dueDate,
        items,
        subtotal: items.reduce((sum, i) => sum + i.amount, 0),
      }));
  }, [filteredEntries]);

  const totalMonth = useMemo(() => entries.reduce((sum, item) => sum + item.amount, 0), [entries]);
  const paidMonth = useMemo(() => entries.filter((item) => item.paidDate).reduce((sum, item) => sum + item.amount, 0), [entries]);
  const pendingMonth = totalMonth - paidMonth;
  const supplierChartData = useMemo(() => {
    const totals = new Map<string, number>();
    entries.forEach((entry) => {
      const key = (entry.supplier || 'Sem fornecedor').trim() || 'Sem fornecedor';
      totals.set(key, (totals.get(key) || 0) + (entry.amount || 0));
    });
    return Array.from(totals.entries())
      .map(([supplier, total]) => ({ supplier, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [entries]);
  const difChartData = useMemo(() => {
    const map: Record<'D' | 'I' | 'F', number> = { D: 0, I: 0, F: 0 };
    entries.forEach((entry) => {
      if (entry.difType === 'D' || entry.difType === 'I' || entry.difType === 'F') {
        map[entry.difType] += entry.amount || 0;
      }
    });
    return (['D', 'I', 'F'] as const)
      .map((type) => ({
        type,
        name: type === 'D' ? 'Despesa' : type === 'I' ? 'Imposto' : 'Fornecedor',
        value: map[type],
      }))
      .filter((x) => x.value > 0);
  }, [entries]);
  const allEntriesFlat = useMemo(
    () =>
      Object.entries(allEntries).flatMap(([month, monthEntries]) =>
        (monthEntries || []).map((entry) => ({ ...entry, month }))
      ),
    [allEntries]
  );
  const globalSearchResults = useMemo(() => {
    const term = normalizeText(globalSearchTerm.trim());
    if (!term) return [];
    return allEntriesFlat
      .filter((entry) => {
        const bucket = globalSearchType === 'supplier' ? entry.supplier : entry.documentNumber;
        return normalizeText(bucket).includes(term);
      })
      .sort((a, b) => {
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return a.supplier.localeCompare(b.supplier);
      });
  }, [allEntriesFlat, globalSearchTerm, globalSearchType]);

  const saveSettingsEntries = (updater: (prev: Record<string, PurchaseEntry[]>) => Record<string, PurchaseEntry[]>) => {
    setSettings((prev) => {
      const currentEntries = (prev.purchaseEntries || {}) as Record<string, PurchaseEntry[]>;
      return { ...prev, purchaseEntries: updater(currentEntries) };
    });
  };

  const saveOptions = (next: PurchaseOptions) => {
    setSettings((prev) => ({ ...prev, purchaseOptions: next }));
  };

  const clearForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleEnterAdvance = (
    e: React.KeyboardEvent<HTMLInputElement>,
    nextRef?: React.RefObject<HTMLInputElement | null>,
    action?: () => void
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (nextRef?.current) {
      nextRef.current.focus();
      nextRef.current.select?.();
      return;
    }
    action?.();
  };

  const parseAmount = (value: string) => {
    const normalized = value.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const isEntryOverdue = (entry: PurchaseEntry) => {
    if (!entry?.dueDate) return false;
    if (entry?.paidDate) return false;
    return entry.dueDate < todayIso;
  };

  const validateInstallments = (value: string) => /^\d{2}\/\d{2}$/.test(value);

  const handleSave = () => {
    if (!form.dueDate) {
      return toast.error('Vencimento e obrigatorio.');
    }
    const fixedInstallments = toInstallmentsFixed(form.installments);
    if (!validateInstallments(fixedInstallments)) {
      return toast.error('Parcela deve estar no formato 01/05 ou 10/10.');
    }

    const amount = form.amount.trim() ? parseAmount(form.amount) : 0;
    if (form.amount.trim() && amount < 0) return toast.error('Valor invalido.');
    const entry: PurchaseEntry = {
      id: editingId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      dueDate: form.dueDate,
      group: form.group.trim() || 'M',
      supplier: form.supplier.trim(),
      documentNumber: form.documentNumber.trim(),
      issueDate: form.issueDate || '',
      installments: fixedInstallments,
      amount,
      paidDate: form.paidDate || undefined,
      financialInstitution: form.financialInstitution.trim(),
      difType: form.difType ? (form.difType as 'D' | 'I' | 'F') : undefined,
    };

    const targetMonth = form.dueDate.slice(0, 7);

    saveSettingsEntries((prev) => {
      const monthItems = [...(prev[targetMonth] || [])];
      const idx = monthItems.findIndex((x) => x.id === entry.id);
      if (idx >= 0) monthItems[idx] = entry;
      else monthItems.push(entry);
      return { ...prev, [targetMonth]: monthItems };
    });

    toast.success(editingId ? 'Compra atualizada.' : 'Compra adicionada.');
    clearForm();
  };

  const editEntry = (entry: PurchaseEntry) => {
    setEditingId(entry.id);
    setForm({
      dueDate: entry.dueDate,
      group: entry.group,
      supplier: entry.supplier,
      documentNumber: entry.documentNumber,
      issueDate: entry.issueDate,
      installments: entry.installments,
      amount: entry.amount.toFixed(2).replace('.', ','),
      paidDate: entry.paidDate || '',
      financialInstitution: entry.financialInstitution,
      difType: (entry.difType as 'D' | 'I' | 'F' | '') || '',
    });
  };

  const openRowEdit = (entry: PurchaseEntry) => {
    setRowEditForm({ ...entry });
    setRowEditOriginalDueDate(entry.dueDate);
    setShowRowEdit(true);
  };

  const saveRowEdit = () => {
    if (!rowEditForm) return;
    if (!rowEditForm.dueDate) {
      toast.error('Vencimento e obrigatorio.');
      return;
    }
    const fixedInstallments = toInstallmentsFixed(rowEditForm.installments);
    if (!validateInstallments(fixedInstallments)) {
      toast.error('Parcela deve estar no formato 01/05 ou 10/10.');
      return;
    }

    const nextEntry: PurchaseEntry = {
      ...rowEditForm,
      amount: Number.isFinite(Number(rowEditForm.amount)) ? Number(rowEditForm.amount) : 0,
      group: (rowEditForm.group || '').trim() || 'M',
      supplier: (rowEditForm.supplier || '').trim(),
      documentNumber: (rowEditForm.documentNumber || '').trim(),
      issueDate: rowEditForm.issueDate || '',
      installments: fixedInstallments,
      paidDate: rowEditForm.paidDate || undefined,
      financialInstitution: (rowEditForm.financialInstitution || '').trim(),
      difType: rowEditForm.difType ? (rowEditForm.difType as 'D' | 'I' | 'F') : undefined,
    };

    const oldMonth = rowEditOriginalDueDate.slice(0, 7);
    const newMonth = nextEntry.dueDate.slice(0, 7);

    saveSettingsEntries((prev) => {
      const next = { ...prev };
      next[oldMonth] = (next[oldMonth] || []).filter((x) => x.id !== nextEntry.id);
      next[newMonth] = [...(next[newMonth] || []), nextEntry];
      return next;
    });

    toast.success('Compra atualizada.');
    setShowRowEdit(false);
    setRowEditForm(null);
    setRowEditOriginalDueDate('');
  };

  const removeEntry = (entry: PurchaseEntry) => {
    if (!confirm(`Excluir compra de ${entry.supplier}?`)) return;
    const targetMonth = entry.dueDate.slice(0, 7);
    saveSettingsEntries((prev) => {
      return { ...prev, [targetMonth]: (prev[targetMonth] || []).filter((x) => x.id !== entry.id) };
    });
    if (editingId === entry.id) clearForm();
    toast.success('Compra excluida.');
  };

  const addOption = (field: 'groups' | 'suppliers' | 'institutions', value: string, reset: () => void) => {
    const name = value.trim();
    if (!name) return;
    const current = options[field] || [];
    if (current.some((x) => x.toLowerCase() === name.toLowerCase())) {
      toast.error('Opcao ja existe.');
      return;
    }
    saveOptions({ ...options, [field]: [...current, name] });
    reset();
    toast.success('Opcao adicionada.');
  };

  const handleOptionEnter = (
    e: React.KeyboardEvent<HTMLInputElement>,
    field: 'groups' | 'suppliers' | 'institutions',
    value: string,
    reset: () => void,
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addOption(field, value, reset);
  };

  const buildCsvLines = (list: PurchaseEntry[]) => {
    const header = [
      'vencimento',
      'categoria',
      'fornecedor',
      'boleto_documento',
      'emissao',
      'parcela',
      'valor',
      'pago',
      'instituicao_financeira',
      'tipo_dif',
    ];

    const lines: string[] = [header.join(';')];
    const sorted = [...list].sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return a.supplier.localeCompare(b.supplier);
    });

    sorted.forEach((entry) => {
      lines.push(
        [
          csvEscape(entry.dueDate),
          csvEscape(entry.group),
          csvEscape(entry.supplier),
          csvEscape(entry.documentNumber),
          csvEscape(entry.issueDate),
          csvEscape(entry.installments),
          csvEscape(entry.amount.toFixed(2).replace('.', ',')),
          csvEscape(entry.paidDate || ''),
          csvEscape(entry.financialInstitution),
          csvEscape(entry.difType || ''),
        ].join(';')
      );
    });
    return lines;
  };

  const exportCsv = () => {
    const lines = buildCsvLines(entries);

    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compras_${currentMonthKey}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV exportado.');
  };

  const exportCsvAnual = () => {
    const yearPrefix = `${selectedYear}-`;
    const annualEntries = Object.entries(allEntries)
      .filter(([month]) => month.startsWith(yearPrefix))
      .flatMap(([, monthEntries]) => monthEntries || []);

    if (annualEntries.length === 0) {
      toast.error('Sem compras para exportar neste ano.');
      return;
    }

    const lines = buildCsvLines(annualEntries);
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compras_${selectedYear}_anual.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV anual exportado.');
  };

  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result || '').replace(/^\uFEFF/, '');
        const rows = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
        if (rows.length < 2) {
          toast.error('CSV sem dados.');
          return;
        }

        const imported: PurchaseEntry[] = [];
        for (let i = 1; i < rows.length; i += 1) {
          const cols = parseCsvLine(rows[i]);
          if (cols.length < 9) continue;

          const dueDate = cols[0];
          const group = cols[1];
          const supplier = cols[2];
          const documentNumber = cols[3];
          const issueDate = cols[4];
          const installments = cols[5];
          const amount = parseFloat((cols[6] || '0').replace(/\./g, '').replace(',', '.')) || 0;
          const paidDate = cols[7] || undefined;
          const financialInstitution = cols[8];
          const difTypeRaw = (cols[9] || '').trim().toUpperCase();
          const difType: 'D' | 'I' | 'F' | undefined = difTypeRaw === 'D' || difTypeRaw === 'I' || difTypeRaw === 'F' ? (difTypeRaw as 'D' | 'I' | 'F') : undefined;

          if (!dueDate || !supplier || !issueDate || !financialInstitution || amount <= 0) continue;

          imported.push({
            id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            dueDate,
            group,
            supplier,
            documentNumber,
            issueDate,
            installments,
            amount,
            paidDate,
            financialInstitution,
            difType,
          });
        }

        if (imported.length === 0) {
          toast.error('Nenhuma linha valida encontrada.');
          return;
        }

        saveSettingsEntries((prev) => {
          const next = { ...prev };
          const monthRows = imported.filter((x) => x.dueDate.slice(0, 7) === currentMonthKey);
          next[currentMonthKey] = monthRows;
          return next;
        });

        toast.success(`CSV importado (${imported.length} linhas).`);
      } catch {
        toast.error('Erro ao importar CSV.');
      }
    };
    reader.readAsText(file);
  };

  const importCsvAnual = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result || '').replace(/^\uFEFF/, '');
        const rows = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
        if (rows.length < 2) {
          toast.error('CSV sem dados.');
          return;
        }

        const imported: PurchaseEntry[] = [];
        for (let i = 1; i < rows.length; i += 1) {
          const cols = parseCsvLine(rows[i]);
          if (cols.length < 9) continue;

          const dueDate = cols[0];
          const group = cols[1];
          const supplier = cols[2];
          const documentNumber = cols[3];
          const issueDate = cols[4];
          const installments = cols[5];
          const amount = parseFloat((cols[6] || '0').replace(/\./g, '').replace(',', '.')) || 0;
          const paidDate = cols[7] || undefined;
          const financialInstitution = cols[8];
          const difTypeRaw = (cols[9] || '').trim().toUpperCase();
          const difType: 'D' | 'I' | 'F' | undefined = difTypeRaw === 'D' || difTypeRaw === 'I' || difTypeRaw === 'F' ? (difTypeRaw as 'D' | 'I' | 'F') : undefined;

          if (!dueDate || !supplier || !issueDate || !financialInstitution || amount <= 0) continue;
          if (!dueDate.startsWith(`${selectedYear}-`)) continue;

          imported.push({
            id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            dueDate,
            group,
            supplier,
            documentNumber,
            issueDate,
            installments,
            amount,
            paidDate,
            financialInstitution,
            difType,
          });
        }

        if (imported.length === 0) {
          toast.error('Nenhuma linha valida do ano selecionado.');
          return;
        }

        saveSettingsEntries((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((month) => {
            if (month.startsWith(`${selectedYear}-`)) next[month] = [];
          });

          imported.forEach((entry) => {
            const month = entry.dueDate.slice(0, 7);
            if (!next[month]) next[month] = [];
            next[month].push(entry);
          });
          return next;
        });

        toast.success(`CSV anual importado (${imported.length} linhas).`);
      } catch {
        toast.error('Erro ao importar CSV anual.');
      }
    };
    reader.readAsText(file);
  };

  const startEditOption = (field: 'groups' | 'suppliers' | 'institutions', oldValue: string) => {
    setEditingOption({ field, oldValue, value: oldValue });
  };

  const saveEditOption = () => {
    if (!editingOption) return;
    const nextValue = editingOption.value.trim();
    if (!nextValue) {
      toast.error('Nome nao pode ficar vazio.');
      return;
    }

    const current = options[editingOption.field] || [];
    const duplicate = current.some(
      (item) =>
        item.toLowerCase() === nextValue.toLowerCase() &&
        item.toLowerCase() !== editingOption.oldValue.toLowerCase()
    );
    if (duplicate) {
      toast.error('Ja existe um item com esse nome.');
      return;
    }

    const oldNorm = normalizeKey(editingOption.oldValue);
    const nextList = current.map((item) => (normalizeKey(item) === oldNorm ? nextValue : item));
    saveOptions({ ...options, [editingOption.field]: nextList });
    setEditingOption(null);
    toast.success('Item atualizado.');
  };

  const removeOption = (field: 'groups' | 'suppliers' | 'institutions', value: string) => {
    if (!confirm(`Excluir "${value}"?`)) return;
    const targetNorm = normalizeKey(value);
    const nextList = (options[field] || []).filter((item) => normalizeKey(item) !== targetNorm);
    saveOptions({ ...options, [field]: nextList });
    toast.success('Item removido.');
  };

  const clearMonthEntries = () => {
    const salesPassword = settings.senhaVendas || '2512';
    if (clearMonthPassword !== salesPassword) {
      toast.error('Senha da area de vendas incorreta.');
      return;
    }
    if (clearMonthConfirmText.trim().toUpperCase() !== 'LIMPAR') {
      toast.error('Digite LIMPAR para confirmar.');
      return;
    }

    saveSettingsEntries((prev) => ({ ...prev, [currentMonthKey]: [] }));
    if (editingId) clearForm();
    setShowClearMonthDialog(false);
    setClearMonthPassword('');
    setClearMonthConfirmText('');
    toast.success('Compras do mes removidas.');
  };

  return (
    <div className="space-y-4 pb-24">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Compras</h3>
          <div className="flex items-center gap-2">
            <label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importCsv(file);
                  e.currentTarget.value = '';
                }}
              />
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
                <span>Importar CSV</span>
              </Button>
            </label>
            <label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importCsvAnual(file);
                  e.currentTarget.value = '';
                }}
              />
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
                <span>Importar Anual</span>
              </Button>
            </label>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={exportCsv}>
              Exportar CSV
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={exportCsvAnual}>
              Exportar Anual
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => setShowClearMonthDialog(true)}
            >
              Limpar mes
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowManageOptions(true)}>Listas</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[1400px] grid grid-cols-9 gap-2">
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Vencimento</label>
            <Input
              ref={dueDateRef}
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
              onKeyDown={(e) => handleEnterAdvance(e, groupRef)}
            />
            </div>
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Loja</label>
            <Input
              ref={groupRef}
              list="group-list"
              value={form.group}
              onChange={(e) => setForm((p) => ({ ...p, group: e.target.value }))}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => handleEnterAdvance(e, supplierRef)}
            />
            </div>
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Fornecedor</label>
            <Input
              ref={supplierRef}
              list="suppliers-list"
              value={form.supplier}
              onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => handleEnterAdvance(e, documentRef)}
            />
            </div>
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Boleto / Documento</label>
            <Input
              ref={documentRef}
              value={form.documentNumber}
              onChange={(e) => setForm((p) => ({ ...p, documentNumber: e.target.value }))}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => handleEnterAdvance(e, issueDateRef)}
            />
            </div>
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Emissao</label>
            <Input
              ref={issueDateRef}
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))}
              onKeyDown={(e) => handleEnterAdvance(e, installmentsRef)}
            />
            </div>
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Parcela</label>
            <Input
              ref={installmentsRef}
              value={form.installments}
              onChange={(e) => setForm((p) => ({ ...p, installments: normalizeInstallments(e.target.value) }))}
              onBlur={(e) => setForm((p) => ({ ...p, installments: toInstallmentsFixed(e.target.value) || p.installments }))}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="01/05"
              onKeyDown={(e) => handleEnterAdvance(e, amountRef)}
            />
            </div>
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Valor</label>
            <Input
              ref={amountRef}
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value.replace(/[^0-9,]/g, '') }))}
              placeholder="0,00"
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setForm((p) => ({ ...p, amount: normalizeAmountInput(p.amount) }));
                  paidDateRef.current?.focus();
                  paidDateRef.current?.select?.();
                  return;
                }
                handleEnterAdvance(e, paidDateRef);
              }}
            />
            </div>
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Pago (data)</label>
            <Input
              ref={paidDateRef}
              type="date"
              value={form.paidDate}
              onChange={(e) => setForm((p) => ({ ...p, paidDate: e.target.value }))}
              onKeyDown={(e) => handleEnterAdvance(e, institutionRef)}
            />
            </div>
            <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Instituicao Financeira</label>
            <Input
              ref={institutionRef}
              list="institutions-list"
              value={form.financialInstitution}
              onChange={(e) => setForm((p) => ({ ...p, financialInstitution: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  difSelectorRef.current?.focus();
                  return;
                }
              }}
            />
            </div>
            <div className="col-span-9 mt-1">
              <div
                ref={difSelectorRef}
                tabIndex={0}
                className="flex gap-2 h-8 items-center justify-start outline-none"
                onKeyDown={(e) => {
                  const order: Array<'D' | 'I' | 'F'> = ['D', 'I', 'F'];
                  const current = order.indexOf((form.difType as 'D' | 'I' | 'F') || 'D');
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    setForm((p) => ({ ...p, difType: order[(current + 1) % order.length] }));
                    return;
                  }
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setForm((p) => ({ ...p, difType: order[(current - 1 + order.length) % order.length] }));
                    return;
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              >
                {(['D', 'I', 'F'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, difType: opt }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSave();
                      }
                    }}
                    className={`w-7 h-7 rounded-full text-xs font-bold border transition ${
                      form.difType === opt ? difTypeColors[opt] : 'bg-white text-muted-foreground border-border'
                    }`}
                    title={opt}
                  >
                    {opt}
                  </button>
                ))}
                <Button onClick={handleSave} className="gap-2 h-8 px-3 ml-1">
                  <Plus className="w-4 h-4" />
                  {editingId ? 'Atualizar' : 'Adicionar'}
                </Button>
              </div>
            </div>
            <div className="col-span-9 mt-1">
              <div className="flex items-center gap-2">
                {editingId && <Button variant="outline" onClick={clearForm}>Cancelar edicao</Button>}
              </div>
            </div>
          </div>
        </div>

        <datalist id="group-list">{options.groups.map((item) => <option key={item} value={item} />)}</datalist>
        <datalist id="suppliers-list">{options.suppliers.map((item) => <option key={item} value={item} />)}</datalist>
        <datalist id="institutions-list">{options.institutions.map((item) => <option key={item} value={item} />)}</datalist>

      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="p-4 xl:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <div className="p-2 rounded bg-secondary/50">Total mes: <b>{formatCurrency(totalMonth)}</b></div>
            <div className="p-2 rounded bg-secondary/50">Pago mes: <b>{formatCurrency(paidMonth)}</b></div>
            <div className="p-2 rounded bg-secondary/50">Pendente: <b>{formatCurrency(pendingMonth)}</b></div>
          </div>
          <div className="mt-4 max-w-[900px] mx-auto">
            <label className="text-xs font-semibold text-muted-foreground uppercase">Pesquisa</label>
            <div className="flex gap-2">
              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value as any)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[170px]"
              >
                <option value="all">Todos os campos</option>
                <option value="dueDate">Vencimento</option>
                <option value="supplier">Fornecedor</option>
                <option value="document">Boleto/Documento</option>
                <option value="issueDate">Emissao</option>
                <option value="amount">Valor</option>
                <option value="institution">Instituicao</option>
              </select>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Digite para pesquisar"
              />
              <Button variant="outline" onClick={() => setShowGlobalSearch(true)}>Pesquisa global</Button>
            </div>
          </div>
        </Card>

        <Card className="p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[11px] font-bold">
              {analyticsMode === 'top' ? 'Top 8 fornecedores do mes' : 'Distribuicao D / I / F'}
            </h4>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setAnalyticsMode((p) => (p === 'top' ? 'dif' : 'top'))}>
              Inverter
            </Button>
          </div>
          {analyticsMode === 'top' ? (
            supplierChartData.length > 0 ? (
              <div className="h-[168px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={supplierChartData.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 8, top: 2, bottom: 2 }} barCategoryGap={4}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="supplier" type="category" width={98} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="total" fill="#2563eb" radius={[0, 3, 3, 0]} barSize={8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sem dados no mes.</p>
            )
          ) : difChartData.length > 0 ? (
            <div className="h-[168px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={difChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {difChartData.map((item, index) => (
                      <Cell key={`${item.name}-${index}`} fill={item.type === 'D' ? '#2563eb' : item.type === 'I' ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sem letras D/I/F no mes.</p>
          )}
        </Card>
      </div>

      <div className="space-y-3">
        {groupedByDueDate.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground">Sem compras em {currentMonthKey}.</Card>
        )}

        {groupedByDueDate.map((group) => (
          <Card key={group.dueDate} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: '130px' }} />
                  <col style={{ width: '70px' }} />
                  <col style={{ width: '280px' }} />
                  <col style={{ width: '170px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '250px' }} />
                  <col style={{ width: '90px' }} />
                </colgroup>
                <thead className="bg-primary/10">
                  <tr>
                    <th className="text-left px-3 py-2">Vencimento</th>
                    <th className="text-left px-3 py-2">Loja</th>
                    <th className="text-left px-3 py-2">Fornecedor</th>
                    <th className="text-left px-3 py-2">Boleto</th>
                    <th className="text-left px-3 py-2">Emissao</th>
                    <th className="text-left px-3 py-2">Parcela</th>
                    <th className="text-left px-3 py-2">Valor</th>
                    <th className="text-left px-3 py-2">Pago</th>
                    <th className="text-left px-3 py-2">Instituicao Financeira</th>
                    <th className="text-right px-3 py-2">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`border-t border-border cursor-pointer transition-colors ${
                        isEntryOverdue(entry)
                          ? 'bg-red-200 hover:bg-red-300 dark:bg-red-900/55 dark:hover:bg-red-900/70'
                          : 'hover:bg-secondary/30'
                      }`}
                      onClick={() => openRowEdit(entry)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateBr(entry.dueDate)}</td>
                      <td className="px-3 py-2 font-semibold">{entry.group}</td>
                      <td className="px-3 py-2 truncate">{entry.supplier || '-'}</td>
                      <td className="px-3 py-2 truncate">{entry.documentNumber || '-'}</td>
                      <td className="px-3 py-2">{entry.issueDate ? formatDateBr(entry.issueDate) : '-'}</td>
                      <td className="px-3 py-2">{entry.installments || '-'}</td>
                      <td className="px-3 py-2 font-semibold">{formatCurrency(entry.amount)}</td>
                      <td className="px-3 py-2">{entry.paidDate ? formatDateBr(entry.paidDate) : '-'}</td>
                      <td className="px-3 py-2 truncate">{entry.financialInstitution || '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {entry.difType && (
                            <span
                              className={`w-5 h-5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
                                difTypeColors[entry.difType as 'D' | 'I' | 'F']
                              }`}
                              title={`Tipo ${entry.difType}`}
                            >
                              {entry.difType}
                            </span>
                          )}
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              editEntry(entry);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeEntry(entry);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary text-primary-foreground text-sm font-bold">
                    <td className="px-3 py-2" colSpan={6}>VENCIMENTO {formatDateBr(group.dueDate)}</td>
                    <td className="px-3 py-2">{formatCurrency(group.subtotal)}</td>
                    <td className="px-3 py-2" colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={showManageOptions} onOpenChange={setShowManageOptions}>
        <DialogContent className="w-[96vw] sm:max-w-[96vw] lg:max-w-[1600px] mt-12">
          <DialogHeader>
            <DialogTitle>Listas de Compras</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Adicionar Categoria</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  onKeyDown={(e) => handleOptionEnter(e, 'groups', newGroup, () => setNewGroup(''))}
                  placeholder="Ex: M, JB"
                />
                <Button onClick={() => addOption('groups', newGroup, () => setNewGroup(''))}>Adicionar</Button>
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {options.groups.map((item) => (
                  <div key={`group-${item}`} className="flex items-center justify-between gap-2 bg-secondary/30 rounded px-2 py-1.5">
                    <span className="text-sm break-words">{item}</span>
                    <Button size="icon" variant="outline" onClick={() => removeOption('groups', item)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Adicionar Fornecedor</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  onKeyDown={(e) => handleOptionEnter(e, 'suppliers', newSupplier, () => setNewSupplier(''))}
                  placeholder="Nome fornecedor"
                />
                <Button onClick={() => addOption('suppliers', newSupplier, () => setNewSupplier(''))}>Adicionar</Button>
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {options.suppliers.map((item) => (
                  <div key={`supplier-${item}`} className="flex items-center justify-between gap-2 bg-secondary/30 rounded px-2 py-1.5">
                    <span className="text-sm break-words">{item}</span>
                    <Button size="icon" variant="outline" onClick={() => removeOption('suppliers', item)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Adicionar Instituicao</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newInstitution}
                  onChange={(e) => setNewInstitution(e.target.value)}
                  onKeyDown={(e) => handleOptionEnter(e, 'institutions', newInstitution, () => setNewInstitution(''))}
                  placeholder="Banco/Instituicao"
                />
                <Button onClick={() => addOption('institutions', newInstitution, () => setNewInstitution(''))}>Adicionar</Button>
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {options.institutions.map((item) => (
                  <div key={`institution-${item}`} className="flex items-center justify-between gap-2 bg-secondary/30 rounded px-2 py-1.5">
                    <span className="text-sm break-words">{item}</span>
                    <Button size="icon" variant="outline" onClick={() => removeOption('institutions', item)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOption} onOpenChange={(open) => !open && setEditingOption(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editingOption?.value || ''}
              onChange={(e) =>
                setEditingOption((prev) => (prev ? { ...prev, value: e.target.value } : prev))
              }
              placeholder="Novo nome"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditingOption(null)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={saveEditOption}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showGlobalSearch} onOpenChange={setShowGlobalSearch}>
        <DialogContent className="w-[96vw] sm:max-w-[96vw] lg:max-w-[1500px]">
          <DialogHeader>
            <DialogTitle>Pesquisa global (todos os meses)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={globalSearchType}
                onChange={(e) => setGlobalSearchType(e.target.value as 'supplier' | 'document')}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[180px]"
              >
                <option value="supplier">Fornecedor</option>
                <option value="document">Boleto/Documento</option>
              </select>
              <Input
                value={globalSearchTerm}
                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                placeholder={globalSearchType === 'supplier' ? 'Digite fornecedor' : 'Digite numero de boleto/documento'}
              />
            </div>
            <div className="max-h-[460px] overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-2">Mes</th>
                    <th className="text-left px-2 py-2">Vencimento</th>
                    <th className="text-left px-2 py-2">Loja</th>
                    <th className="text-left px-2 py-2">Fornecedor</th>
                    <th className="text-left px-2 py-2">Boleto</th>
                    <th className="text-left px-2 py-2">Emissao</th>
                    <th className="text-left px-2 py-2">Parcela</th>
                    <th className="text-left px-2 py-2">Pago</th>
                    <th className="text-left px-2 py-2">Instituicao Financeira</th>
                    <th className="text-left px-2 py-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {globalSearchResults.map((item) => (
                    <tr
                      key={`${item.id}_${item.month}`}
                      className="border-t cursor-pointer hover:bg-secondary/40"
                      onClick={() => {
                        openRowEdit(item);
                        setShowGlobalSearch(false);
                      }}
                    >
                      <td className="px-2 py-2">{item.month}</td>
                      <td className="px-2 py-2">{formatDateBr(item.dueDate)}</td>
                      <td className="px-2 py-2 font-semibold">{item.group}</td>
                      <td className="px-2 py-2">{item.supplier || '-'}</td>
                      <td className="px-2 py-2">{item.documentNumber || '-'}</td>
                      <td className="px-2 py-2">{item.issueDate ? formatDateBr(item.issueDate) : '-'}</td>
                      <td className="px-2 py-2">{item.installments || '-'}</td>
                      <td className="px-2 py-2">{item.paidDate ? formatDateBr(item.paidDate) : '-'}</td>
                      <td className="px-2 py-2 truncate max-w-[240px]">{item.financialInstitution || '-'}</td>
                      <td className="px-2 py-2 font-semibold">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                  {globalSearchResults.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-2 py-8 text-center text-muted-foreground">Sem resultados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRowEdit} onOpenChange={setShowRowEdit}>
        <DialogContent className="w-[95vw] sm:max-w-[95vw] lg:max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>Editar compra</DialogTitle>
          </DialogHeader>
          {rowEditForm && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Vencimento</label>
                <Input type="date" value={rowEditForm.dueDate} onChange={(e) => setRowEditForm((p) => (p ? { ...p, dueDate: e.target.value } : p))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Loja</label>
                <Input
                  value={rowEditForm.group}
                  onChange={(e) => setRowEditForm((p) => (p ? { ...p, group: e.target.value } : p))}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Fornecedor</label>
                <Input
                  value={rowEditForm.supplier}
                  onChange={(e) => setRowEditForm((p) => (p ? { ...p, supplier: e.target.value } : p))}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Boleto / Documento</label>
                <Input
                  value={rowEditForm.documentNumber}
                  onChange={(e) => setRowEditForm((p) => (p ? { ...p, documentNumber: e.target.value } : p))}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Emissao</label>
                <Input type="date" value={rowEditForm.issueDate} onChange={(e) => setRowEditForm((p) => (p ? { ...p, issueDate: e.target.value } : p))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Parcela</label>
                <Input
                  value={rowEditForm.installments}
                  onChange={(e) => setRowEditForm((p) => (p ? { ...p, installments: normalizeInstallments(e.target.value) } : p))}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) =>
                    setRowEditForm((p) => (p ? { ...p, installments: toInstallmentsFixed(e.target.value) || p.installments } : p))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Valor</label>
                <Input
                  value={Number(rowEditForm.amount || 0).toFixed(2).replace('.', ',')}
                  onChange={(e) =>
                    setRowEditForm((p) => (p ? { ...p, amount: parseAmount(e.target.value.replace(/[^0-9,]/g, '')) } : p))
                  }
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Pago (data)</label>
                <Input type="date" value={rowEditForm.paidDate || ''} onChange={(e) => setRowEditForm((p) => (p ? { ...p, paidDate: e.target.value || undefined } : p))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Instituicao Financeira</label>
                <Input
                  value={rowEditForm.financialInstitution}
                  onChange={(e) => setRowEditForm((p) => (p ? { ...p, financialInstitution: e.target.value } : p))}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">D / I / F</label>
                <div className="flex gap-2 h-10 items-center">
                  {(['D', 'I', 'F'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setRowEditForm((p) => (p ? { ...p, difType: opt } : p))}
                      className={`w-8 h-8 rounded-full text-xs font-bold border transition ${
                        (((rowEditForm.difType as 'D' | 'I' | 'F') || 'D') === opt)
                          ? difTypeColors[opt]
                          : 'bg-white text-muted-foreground border-border'
                      }`}
                      title={opt}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowRowEdit(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={saveRowEdit}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showClearMonthDialog} onOpenChange={setShowClearMonthDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Limpar compras do mes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Essa acao remove todas as compras de <b>{currentMonthKey}</b>.
            </p>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Senha da area de vendas</label>
              <Input
                type="password"
                value={clearMonthPassword}
                onChange={(e) => setClearMonthPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Confirmacao</label>
              <Input
                value={clearMonthConfirmText}
                onChange={(e) => setClearMonthConfirmText(e.target.value)}
                placeholder="Digite LIMPAR"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowClearMonthDialog(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" variant="destructive" onClick={clearMonthEntries}>
                Limpar mes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
