import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseEntry, PurchaseOptions } from '@/lib/types';
import { localDateStr } from '@/lib/helpers';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

const DEFAULT_PURCHASE_OPTIONS: PurchaseOptions = {
  groups: ['M', 'JB'],
  suppliers: [],
  institutions: [],
  supplierDifTypes: {},
};

type PurchaseDifType = 'D' | 'I' | 'F';

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

const parseInstallmentParts = (value: string) => {
  const fixed = toInstallmentsFixed(value);
  const match = fixed.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return { current: 1, total: 1, fixed };
  return {
    current: Math.max(1, Number(match[1] || 1)),
    total: Math.max(1, Number(match[2] || 1)),
    fixed,
  };
};

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

const fixMojibake = (value: string) => {
  const raw = String(value || '');
  if (!raw) return '';
  if (!/[ÃÂ�]/.test(raw)) return raw;
  try {
    const bytes = Uint8Array.from(Array.from(raw).map((ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return decoded || raw;
  } catch {
    return raw;
  }
};

const isLikelyMojibakeSafe = (value: string) => {
  const raw = String(value || '');
  if (!raw) return false;
  return /(Ã¡|Ã¢|Ã£|Ã¤|Ãª|Ã©|Ã¨|Ã­|Ã³|Ã´|Ãµ|Ãº|Ã§|Ã‡|Âº|Âª|Â°|ï¿½|�)/.test(raw);
};

const fixMojibakeSafe = (value: string) => {
  const raw = String(value || '');
  if (!raw) return '';
  if (!isLikelyMojibakeSafe(raw)) return raw;
  try {
    const bytes = Uint8Array.from(Array.from(raw).map((ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return decoded || raw;
  } catch {
    return raw;
  }
};

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

const hasBrokenEncoding = (value: string) => /Ã|Â|�/.test(String(value || ''));
const sanitizeStoredText = (value: string) =>
  fixMojibakeSafe(String(value || ''))
    .replace(/�/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const sanitizeOptionList = (list: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  (list || []).forEach((raw) => {
    const fixed = fixMojibakeSafe(String(raw || '').trim());
    if (!fixed) return;
    if (isLikelyMojibakeSafe(fixed)) return;
    const key = normalizeKey(fixed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(fixed);
  });
  return out.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
};

const normalizeDifType = (value: unknown): PurchaseDifType | undefined =>
  value === 'D' || value === 'I' || value === 'F' ? value : undefined;

const normalizeOptionMapKey = (value: string) => normalizeKey(sanitizeStoredText(value || ''));

const sanitizeSupplierDifTypes = (map?: Record<string, PurchaseDifType>) => {
  const out: Record<string, PurchaseDifType> = {};
  Object.entries(map || {}).forEach(([key, value]) => {
    const normalized = normalizeOptionMapKey(key);
    const type = normalizeDifType(value);
    if (normalized && type) out[normalized] = type;
  });
  return out;
};

const sanitizePurchaseOptions = (input?: Partial<PurchaseOptions>): PurchaseOptions => ({
  groups: sanitizeOptionList(input?.groups || []),
  suppliers: sanitizeOptionList(input?.suppliers || []),
  institutions: sanitizeOptionList(input?.institutions || []),
  supplierDifTypes: sanitizeSupplierDifTypes(input?.supplierDifTypes as Record<string, PurchaseDifType> | undefined),
});

const getMappedSupplierDif = (supplier: string, options?: PurchaseOptions): PurchaseDifType | '' =>
  sanitizeSupplierDifTypes(options?.supplierDifTypes as Record<string, PurchaseDifType> | undefined)[normalizeOptionMapKey(supplier)] || '';

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

const sanitizeAmountTyping = (raw: string) => {
  const cleaned = (raw || '').replace(/\./g, ',').replace(/[^0-9,]/g, '');
  const commaIndex = cleaned.indexOf(',');
  if (commaIndex === -1) return cleaned;
  const intPart = cleaned.slice(0, commaIndex) || '0';
  const decPart = cleaned.slice(commaIndex + 1).replace(/,/g, '').slice(0, 2);
  return `${intPart},${decPart}`;
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
  const [showAddPurchase, setShowAddPurchase] = useState(false);
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
  const [rowEditAmountText, setRowEditAmountText] = useState('');
  const [rowEditOriginalDueDate, setRowEditOriginalDueDate] = useState('');
  const [rowExtraDueDates, setRowExtraDueDates] = useState<string[]>([]);
  const [showClearMonthDialog, setShowClearMonthDialog] = useState(false);
  const [clearMonthPassword, setClearMonthPassword] = useState('');
  const [clearMonthConfirmText, setClearMonthConfirmText] = useState('');
  const [savePendingMessage, setSavePendingMessage] = useState('');
  const [saveFailureMessage, setSaveFailureMessage] = useState('');
  const [showSaveFailureDialog, setShowSaveFailureDialog] = useState(false);
  const purchaseSaveAttemptRef = useRef(false);
  const purchaseSaveAttemptIdRef = useRef(0);
  const purchaseSaveStartedAtRef = useRef(0);
  const purchaseSaveSuccessMessageRef = useRef('');
  const purchaseSaveTimeoutRef = useRef<number | null>(null);
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
  const rowDueDateRef = useRef<HTMLInputElement | null>(null);
  const rowGroupRef = useRef<HTMLInputElement | null>(null);
  const rowSupplierRef = useRef<HTMLInputElement | null>(null);
  const rowDocumentRef = useRef<HTMLInputElement | null>(null);
  const rowIssueDateRef = useRef<HTMLInputElement | null>(null);
  const rowInstallmentsRef = useRef<HTMLInputElement | null>(null);
  const rowAmountRef = useRef<HTMLInputElement | null>(null);
  const rowPaidDateRef = useRef<HTMLInputElement | null>(null);
  const rowInstitutionRef = useRef<HTMLInputElement | null>(null);
  const rowDifSelectorRef = useRef<HTMLDivElement | null>(null);
  const [editingOption, setEditingOption] = useState<null | {
    field: 'groups' | 'suppliers' | 'institutions';
    oldValue: string;
    value: string;
  }>(null);

  const currentMonthKey = monthKey(selectedYear, selectedMonth);
  const allEntries = settings.purchaseEntries || {};
  const entries: PurchaseEntry[] = allEntries[currentMonthKey] || [];

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadMonthEntries = async () => {
      try {
        const response = await fetch(`/api/compras/${selectedYear}/${String(selectedMonth).padStart(2, '0')}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json();
        if (cancelled || !result?.success || !Array.isArray(result.data)) return;

        setSettings((prev) => ({
          ...prev,
          purchaseEntries: {
            ...(prev.purchaseEntries || {}),
            [currentMonthKey]: result.data,
          },
        }));
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.warn('[Compras] Falha ao carregar mês parcial:', error);
        }
      }
    };

    loadMonthEntries();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedYear, selectedMonth, currentMonthKey, setSettings]);

  const options: PurchaseOptions = useMemo(() => {
    const current = sanitizePurchaseOptions(settings.purchaseOptions || DEFAULT_PURCHASE_OPTIONS);
    return {
      groups: sanitizeOptionList(mergeUnique(DEFAULT_PURCHASE_OPTIONS.groups, current.groups)),
      suppliers: sanitizeOptionList(mergeUnique(DEFAULT_PURCHASE_OPTIONS.suppliers, current.suppliers)),
      institutions: sanitizeOptionList(mergeUnique(DEFAULT_PURCHASE_OPTIONS.institutions, current.institutions)),
      supplierDifTypes: current.supplierDifTypes || {},
    };
  }, [settings.purchaseOptions]);

  useEffect(() => {
    const openPurchaseForm = () => {
      clearForm();
      const today = localDateStr();
      setShowAddPurchase(true);
      setRowEditForm({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        dueDate: today,
        group: 'M',
        supplier: '',
        documentNumber: '',
        issueDate: today,
        installments: '01/01',
        amount: 0,
        paidDate: undefined,
        financialInstitution: '',
        difType: 'D',
      });
      setRowEditAmountText('');
      setRowEditOriginalDueDate('');
      setRowExtraDueDates([]);
      setShowRowEdit(true);
      window.setTimeout(() => rowDueDateRef.current?.focus(), 80);
    };
    window.addEventListener('open-purchase-form', openPurchaseForm);
    return () => window.removeEventListener('open-purchase-form', openPurchaseForm);
  }, []);

  useEffect(() => {
    const updateSearch = (event: Event) => {
      setSearchField('all');
      setSearchTerm(String((event as CustomEvent<string>).detail || ''));
    };
    window.addEventListener('purchase-search-change', updateSearch);
    return () => window.removeEventListener('purchase-search-change', updateSearch);
  }, []);

  useEffect(() => {
    const openGlobalSearch = () => setShowGlobalSearch(true);
    window.addEventListener('open-purchase-global-search', openGlobalSearch);
    return () => window.removeEventListener('open-purchase-global-search', openGlobalSearch);
  }, []);

  const rowInstallmentInfo = useMemo(
    () => parseInstallmentParts(rowEditForm?.installments || '01/01'),
    [rowEditForm?.installments]
  );
  const rowExtraCount = showAddPurchase && rowEditForm
    ? Math.max(0, rowInstallmentInfo.total - rowInstallmentInfo.current)
    : 0;

  useEffect(() => {
    if (!showAddPurchase || !rowEditForm) {
      setRowExtraDueDates([]);
      return;
    }
    setRowExtraDueDates((prev) =>
      Array.from({ length: rowExtraCount }, (_item, index) => prev[index] || '')
    );
  }, [showAddPurchase, rowEditForm?.id, rowExtraCount]);

  useEffect(() => {
    const current = settings.purchaseOptions || DEFAULT_PURCHASE_OPTIONS;
    const next = sanitizePurchaseOptions(current);
    const changed =
      JSON.stringify(current.groups || []) !== JSON.stringify(next.groups) ||
      JSON.stringify(current.suppliers || []) !== JSON.stringify(next.suppliers) ||
      JSON.stringify(current.institutions || []) !== JSON.stringify(next.institutions) ||
      JSON.stringify(current.supplierDifTypes || {}) !== JSON.stringify(next.supplierDifTypes || {});
    if (!changed) return;
    setSettings((prev) => ({
      ...prev,
      purchaseOptions: next,
    }));
  }, [settings.purchaseOptions, setSettings]);

  useEffect(() => {
    const currentEntries = (settings.purchaseEntries || {}) as Record<string, PurchaseEntry[]>;
    let changed = false;
    const nextEntries: Record<string, PurchaseEntry[]> = {};

    Object.entries(currentEntries).forEach(([month, list]) => {
      nextEntries[month] = (list || []).map((entry) => {
        const nextSupplier = sanitizeStoredText(entry.supplier || '');
        const nextInstitution = sanitizeStoredText(entry.financialInstitution || '');
        if (nextSupplier !== (entry.supplier || '') || nextInstitution !== (entry.financialInstitution || '')) {
          changed = true;
          return { ...entry, supplier: nextSupplier, financialInstitution: nextInstitution };
        }
        return entry;
      });
    });

    if (!changed) return;
    setSettings((prev) => ({ ...prev, purchaseEntries: nextEntries }));
  }, [settings.purchaseEntries, setSettings]);

  const normalizeText = (value: string | number | undefined | null) =>
    fixMojibakeSafe(String(value || ''))
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
      const key = fixMojibakeSafe((entry.supplier || 'Sem fornecedor').trim() || 'Sem fornecedor');
      totals.set(key, (totals.get(key) || 0) + (entry.amount || 0));
    });
    return Array.from(totals.entries())
      .map(([supplier, total]) => ({ supplier, total }))
      .sort((a, b) => b.total - a.total);
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
        if (a.dueDate !== b.dueDate) return b.dueDate.localeCompare(a.dueDate);
        return a.supplier.localeCompare(b.supplier);
      });
  }, [allEntriesFlat, globalSearchTerm, globalSearchType]);

  const saveSettingsEntries = (
    updater: (
      prev: Record<string, PurchaseEntry[]>,
      currentOptions: PurchaseOptions
    ) => Record<string, PurchaseEntry[]>,
    successMessage = 'Alteracao em compras salva no servidor.',
    optionsUpdater?: (prev: PurchaseOptions) => PurchaseOptions
  ) => {
    const attemptId = markPurchaseSavePending(successMessage);
    setSettings((prev) => {
      const currentEntries = (prev.purchaseEntries || {}) as Record<string, PurchaseEntry[]>;
      const currentOptions = sanitizePurchaseOptions(prev.purchaseOptions || DEFAULT_PURCHASE_OPTIONS);
      const nextEntries = updater(currentEntries, currentOptions);
      const changedMonths = Object.keys({ ...currentEntries, ...nextEntries }).filter(
        (month) => JSON.stringify(currentEntries[month] || []) !== JSON.stringify(nextEntries[month] || [])
      );
      const changedEntries = Object.fromEntries(
        changedMonths.map((month) => [month, nextEntries[month] || []])
      ) as Record<string, PurchaseEntry[]>;
      if (!optionsUpdater) {
        void confirmPurchaseSave({ purchaseEntries: changedEntries }, attemptId);
        return { ...prev, purchaseEntries: nextEntries };
      }

      const nextOptions = sanitizePurchaseOptions(optionsUpdater(currentOptions));
      void confirmPurchaseSave({ purchaseEntries: changedEntries, purchaseOptions: nextOptions }, attemptId);
      return { ...prev, purchaseEntries: nextEntries, purchaseOptions: nextOptions };
    });
  };

  const saveOptions = (next: PurchaseOptions, successMessage = 'Lista de compras salva no servidor.') => {
    const clean = sanitizePurchaseOptions(next);
    const attemptId = markPurchaseSavePending(successMessage);
    setSettings((prev) => {
      void confirmPurchaseSave({ purchaseOptions: clean }, attemptId);
      return { ...prev, purchaseOptions: clean };
    });
  };

  const withEntryOptions = (
    base: PurchaseOptions,
    entry: Pick<PurchaseEntry, 'supplier' | 'financialInstitution' | 'difType'>
  ) => {
    const next = sanitizePurchaseOptions(base);
    const supplier = sanitizeStoredText(entry.supplier || '');
    const institution = sanitizeStoredText(entry.financialInstitution || '');

    if (supplier && !next.suppliers.some((item) => normalizeKey(item) === normalizeKey(supplier))) {
      next.suppliers = [...next.suppliers, supplier];
    }

    if (institution && !next.institutions.some((item) => normalizeKey(item) === normalizeKey(institution))) {
      next.institutions = [...next.institutions, institution];
    }

    const mappedType = normalizeDifType(entry.difType);
    if (supplier && mappedType) {
      next.supplierDifTypes = {
        ...(next.supplierDifTypes || {}),
        [normalizeOptionMapKey(supplier)]: mappedType,
      };
    }

    return sanitizePurchaseOptions(next);
  };

  const withEntriesOptions = (
    base: PurchaseOptions,
    list: Pick<PurchaseEntry, 'supplier' | 'financialInstitution' | 'difType'>[]
  ) => list.reduce((acc, entry) => withEntryOptions(acc, entry), base);

  const applySupplierDifToEntries = (
    entriesByMonth: Record<string, PurchaseEntry[]>,
    supplier: string,
    difType: PurchaseDifType | undefined
  ) => {
    const key = normalizeOptionMapKey(supplier || '');
    if (!key) return entriesByMonth;

    const next: Record<string, PurchaseEntry[]> = {};
    Object.entries(entriesByMonth).forEach(([month, monthEntries]) => {
      next[month] = (monthEntries || []).map((entry) =>
        normalizeOptionMapKey(entry.supplier || '') === key ? { ...entry, difType } : entry
      );
    });
    return next;
  };

  const applySupplierToForm = (supplier: string) => {
    const mappedType = getMappedSupplierDif(supplier, options);
    setForm((prev) => ({
      ...prev,
      supplier,
      difType: mappedType || prev.difType,
    }));
  };

  const applySupplierToRowEdit = (supplier: string) => {
    const mappedType = getMappedSupplierDif(supplier, options);
    setRowEditForm((prev) =>
      prev
        ? {
            ...prev,
            supplier,
            difType: mappedType || prev.difType,
          }
        : prev
    );
  };

  const setSupplierDifOption = (supplier: string, difType: '' | PurchaseDifType) => {
    const key = normalizeOptionMapKey(supplier);
    if (!key) return;

    saveSettingsEntries(
      (prev) => {
        const next: Record<string, PurchaseEntry[]> = {};
        Object.entries(prev).forEach(([month, monthEntries]) => {
          next[month] = (monthEntries || []).map((entry) => {
            if (normalizeOptionMapKey(entry.supplier) !== key) return entry;
            return {
              ...entry,
              difType: difType || undefined,
            };
          });
        });
        return next;
      },
      'Vinculo do fornecedor atualizado no servidor.',
      (prevOptions) => {
        const clean = sanitizePurchaseOptions(prevOptions);
        const nextMap = { ...(clean.supplierDifTypes || {}) };
        if (difType) nextMap[key] = difType;
        else delete nextMap[key];
        return sanitizePurchaseOptions({
          ...clean,
          supplierDifTypes: nextMap,
        });
      }
    );

    if (normalizeOptionMapKey(form.supplier) === key) {
      setForm((prev) => ({ ...prev, difType }));
    }

    if (rowEditForm && normalizeOptionMapKey(rowEditForm.supplier) === key) {
      setRowEditForm((prev) => (prev ? { ...prev, difType: difType || undefined } : prev));
    }
  };

  const syncSupplierDifFromEntry = (
    entriesByMonth: Record<string, PurchaseEntry[]>,
    entry: Pick<PurchaseEntry, 'supplier' | 'difType'>,
    sourceOptions: PurchaseOptions = options
  ) => {
    const mappedType = normalizeDifType(entry.difType) || getMappedSupplierDif(entry.supplier || '', sourceOptions);
    if (!entry.supplier || !mappedType) return entriesByMonth;
    return applySupplierDifToEntries(entriesByMonth, entry.supplier, mappedType);
  };

  const clearPurchaseSaveTimeout = () => {
    if (purchaseSaveTimeoutRef.current !== null) {
      window.clearTimeout(purchaseSaveTimeoutRef.current);
      purchaseSaveTimeoutRef.current = null;
    }
  };

  const getPurchaseServerUrl = () => {
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    if (window.location.port === '5173') return `${protocol}//${host}:3000`;
    return `${protocol}//${host}${window.location.port ? `:${window.location.port}` : ''}`;
  };

  const showPurchaseSaveFailure = (attemptId?: number) => {
    if (attemptId !== undefined && attemptId !== purchaseSaveAttemptIdRef.current) return;
    clearPurchaseSaveTimeout();
    purchaseSaveAttemptRef.current = false;
    purchaseSaveSuccessMessageRef.current = '';
    setSavePendingMessage('');
    const time = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setSaveFailureMessage(
      `Falha ao salvar compras no servidor (${time}). Nao atualize a pagina. Verifique a rede/terminal do servidor e salve novamente quando a conexao voltar.`
    );
    setShowSaveFailureDialog(true);
  };

  const checkPurchaseServerImmediately = async (attemptId: number) => {
    const serverUrl = getPurchaseServerUrl();
    if (!serverUrl) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 900);
    try {
      const response = await fetch(`${serverUrl}/api/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        showPurchaseSaveFailure(attemptId);
      }
    } catch {
      showPurchaseSaveFailure(attemptId);
    } finally {
      window.clearTimeout(timer);
    }
  };

  const confirmPurchaseSave = async (
    partialSettings: Partial<{
      purchaseEntries: Record<string, PurchaseEntry[]>;
      purchaseOptions: PurchaseOptions;
    }>,
    attemptId: number
  ) => {
    const serverUrl = getPurchaseServerUrl();
    if (!serverUrl) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4500);

    try {
      const monthEntries = partialSettings.purchaseEntries || {};
      const monthKeys = Object.keys(monthEntries);

      for (const monthKey of monthKeys) {
        const [year, month] = monthKey.split('-');
        if (!year || !month) continue;
        const response = await fetch(`${serverUrl}/api/compras/${year}/${month}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
          body: JSON.stringify({
            source: 'site',
            entries: monthEntries[monthKey] || [],
            ...(partialSettings.purchaseOptions ? { purchaseOptions: partialSettings.purchaseOptions } : {}),
          }),
        });
        if (!response.ok) {
          showPurchaseSaveFailure(attemptId);
          return;
        }
        const result = await response.json().catch(() => null);
        if (!result?.success) {
          showPurchaseSaveFailure(attemptId);
          return;
        }
      }

      if (partialSettings.purchaseOptions && monthKeys.length === 0) {
        const response = await fetch(`${serverUrl}/api/compras/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
          body: JSON.stringify({
            source: 'site',
            purchaseOptions: partialSettings.purchaseOptions,
          }),
        });
        if (!response.ok) {
          showPurchaseSaveFailure(attemptId);
          return;
        }
        const result = await response.json().catch(() => null);
        if (!result?.success) {
          showPurchaseSaveFailure(attemptId);
          return;
        }
      }

      if (attemptId !== purchaseSaveAttemptIdRef.current || !purchaseSaveAttemptRef.current) return;
      clearPurchaseSaveTimeout();
      purchaseSaveAttemptRef.current = false;
      if (purchaseSaveSuccessMessageRef.current) {
        toast.success(purchaseSaveSuccessMessageRef.current);
      }
      purchaseSaveSuccessMessageRef.current = '';
      setSavePendingMessage('');
      setSaveFailureMessage('');
      setShowSaveFailureDialog(false);
    } catch {
      showPurchaseSaveFailure(attemptId);
    } finally {
      window.clearTimeout(timer);
    }
  };

  const markPurchaseSavePending = (successMessage: string) => {
    clearPurchaseSaveTimeout();
    const attemptId = purchaseSaveAttemptIdRef.current + 1;
    purchaseSaveAttemptIdRef.current = attemptId;
    purchaseSaveStartedAtRef.current = Date.now();
    purchaseSaveAttemptRef.current = true;
    purchaseSaveSuccessMessageRef.current = successMessage;
    setSaveFailureMessage('');
    setShowSaveFailureDialog(false);
    setSavePendingMessage('Aguardando confirmacao do servidor...');
    void checkPurchaseServerImmediately(attemptId);

    purchaseSaveTimeoutRef.current = window.setTimeout(() => {
      if (!purchaseSaveAttemptRef.current) return;
      if (purchaseSaveAttemptIdRef.current !== attemptId) return;
      showPurchaseSaveFailure(attemptId);
    }, 2500);
    return attemptId;
  };

  useEffect(() => {
    const handleServerSaveError = () => {
      if (!purchaseSaveAttemptRef.current) return;
      showPurchaseSaveFailure(purchaseSaveAttemptIdRef.current);
    };

    const handleServerSaveSuccess = () => {
      // Compras confirma diretamente no /api/sync/save para evitar falso sucesso de outro sync.
    };

    window.addEventListener('danado:server-save-error', handleServerSaveError);
    window.addEventListener('danado:server-save-success', handleServerSaveSuccess);
    return () => {
      clearPurchaseSaveTimeout();
      window.removeEventListener('danado:server-save-error', handleServerSaveError);
      window.removeEventListener('danado:server-save-success', handleServerSaveSuccess);
    };
  }, []);

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

  const todayIso = localDateStr();
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
    const cleanSupplier = sanitizeStoredText(form.supplier);
    const cleanInstitution = sanitizeStoredText(form.financialInstitution);
    const resolvedDifType = normalizeDifType(form.difType) || getMappedSupplierDif(cleanSupplier, options);
    const entry: PurchaseEntry = {
      id: editingId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      dueDate: form.dueDate,
      group: form.group.trim() || 'M',
      supplier: cleanSupplier,
      documentNumber: form.documentNumber.trim(),
      issueDate: form.issueDate || '',
      installments: fixedInstallments,
      amount,
      paidDate: form.paidDate || undefined,
      financialInstitution: cleanInstitution,
      difType: resolvedDifType || undefined,
    };

    const targetMonth = form.dueDate.slice(0, 7);

    saveSettingsEntries((prev, currentOptions) => {
      const monthItems = [...(prev[targetMonth] || [])];
      const idx = monthItems.findIndex((x) => x.id === entry.id);
      if (idx >= 0) monthItems[idx] = entry;
      else monthItems.push(entry);
      return syncSupplierDifFromEntry({ ...prev, [targetMonth]: monthItems }, entry, currentOptions);
    }, editingId ? 'Compra atualizada no servidor.' : 'Compra adicionada no servidor.', (prevOptions) =>
      withEntryOptions(prevOptions, entry)
    );

    clearForm();
  };

  const editEntry = (entry: PurchaseEntry) => {
    setEditingId(entry.id);
    setForm({
      dueDate: entry.dueDate,
      group: entry.group,
      supplier: sanitizeStoredText(entry.supplier),
      documentNumber: entry.documentNumber,
      issueDate: entry.issueDate,
      installments: entry.installments,
      amount: entry.amount.toFixed(2).replace('.', ','),
      paidDate: entry.paidDate || '',
      financialInstitution: sanitizeStoredText(entry.financialInstitution),
      difType: (entry.difType as 'D' | 'I' | 'F' | '') || '',
    });
  };

  const openRowEdit = (entry: PurchaseEntry) => {
    setShowAddPurchase(false);
    setRowEditForm({ ...entry });
    setRowEditAmountText(Number(entry.amount || 0).toFixed(2).replace('.', ','));
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
    const installmentInfo = parseInstallmentParts(fixedInstallments);
    const extraCount = Math.max(0, installmentInfo.total - installmentInfo.current);
    const filledExtraDueDates = showAddPurchase && extraCount > 0
      ? rowExtraDueDates.slice(0, extraCount)
          .map((dueDate, index) => ({ dueDate, index }))
          .filter((item) => !!item.dueDate)
      : [];

    const cleanSupplier = sanitizeStoredText(rowEditForm.supplier || '');
    const cleanInstitution = sanitizeStoredText(rowEditForm.financialInstitution || '');
    const resolvedDifType = normalizeDifType(rowEditForm.difType) || getMappedSupplierDif(cleanSupplier, options);
    const nextEntry: PurchaseEntry = {
      ...rowEditForm,
      amount: Number.isFinite(Number(rowEditForm.amount)) ? Number(rowEditForm.amount) : 0,
      group: (rowEditForm.group || '').trim() || 'M',
      supplier: cleanSupplier,
      documentNumber: (rowEditForm.documentNumber || '').trim(),
      issueDate: rowEditForm.issueDate || '',
      installments: fixedInstallments,
      paidDate: rowEditForm.paidDate || undefined,
      financialInstitution: cleanInstitution,
      difType: resolvedDifType || undefined,
    };

    const oldMonth = rowEditOriginalDueDate.slice(0, 7);
    const newMonth = nextEntry.dueDate.slice(0, 7);

    saveSettingsEntries((prev, currentOptions) => {
      const next = { ...prev };

      if (showAddPurchase && filledExtraDueDates.length > 0) {
        const totalText = String(installmentInfo.total).padStart(2, '0');
        const entriesToCreate: PurchaseEntry[] = [
          nextEntry,
          ...filledExtraDueDates.map(({ dueDate, index }) => ({
            ...nextEntry,
            id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
            dueDate,
            paidDate: undefined,
            installments: `${String(installmentInfo.current + index + 1).padStart(2, '0')}/${totalText}`,
          })),
        ];
        entriesToCreate[0] = {
          ...entriesToCreate[0],
          installments: `${String(installmentInfo.current).padStart(2, '0')}/${totalText}`,
        };

        entriesToCreate.forEach((entry) => {
          const month = entry.dueDate.slice(0, 7);
          next[month] = [...(next[month] || []).filter((item) => item.id !== entry.id), entry];
        });

        return entriesToCreate.reduce(
          (acc, entry) => syncSupplierDifFromEntry(acc, entry, currentOptions),
          next
        );
      }

      const dueDateChanged = rowEditOriginalDueDate !== nextEntry.dueDate;

      if (!showAddPurchase && !dueDateChanged && oldMonth === newMonth) {
        next[newMonth] = (next[newMonth] || []).map((entry) =>
          entry.id === nextEntry.id ? nextEntry : entry
        );
      } else {
        if (oldMonth) {
          next[oldMonth] = (next[oldMonth] || []).filter((x) => x.id !== nextEntry.id);
        }
        next[newMonth] = [...(next[newMonth] || []).filter((x) => x.id !== nextEntry.id), nextEntry];
      }
      return syncSupplierDifFromEntry(next, nextEntry, currentOptions);
    }, showAddPurchase && filledExtraDueDates.length > 0
      ? `${filledExtraDueDates.length + 1} parcelas adicionadas no servidor.`
      : showAddPurchase ? 'Compra adicionada no servidor.' : 'Compra atualizada no servidor.',
      (prevOptions) => withEntryOptions(prevOptions, nextEntry)
    );

    setShowRowEdit(false);
    setShowAddPurchase(false);
    setRowEditForm(null);
    setRowEditAmountText('');
    setRowEditOriginalDueDate('');
    setRowExtraDueDates([]);
  };

  const removeEntry = (entry: PurchaseEntry) => {
    if (!confirm(`Excluir compra de ${entry.supplier}?`)) return;
    const targetMonth = entry.dueDate.slice(0, 7);
    saveSettingsEntries((prev) => {
      return { ...prev, [targetMonth]: (prev[targetMonth] || []).filter((x) => x.id !== entry.id) };
    }, 'Compra excluida no servidor.');
    if (editingId === entry.id) clearForm();
  };

  const addOption = (field: 'groups' | 'suppliers' | 'institutions', value: string, reset: () => void) => {
    const name = value.trim();
    if (!name) return;
    const current = options[field] || [];
    if (current.some((x) => x.toLowerCase() === name.toLowerCase())) {
      toast.error('Opcao ja existe.');
      return;
    }
    saveOptions({ ...options, [field]: [...current, name] }, 'Opcao adicionada no servidor.');
    reset();
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

  const exportCsvAnualFile = () => {
    const annualEntries = Object.entries(allEntries)
      .filter(([month]) => month.startsWith(`${selectedYear}-`))
      .flatMap(([, monthEntries]) => monthEntries || []);
    if (annualEntries.length === 0) {
      toast.error('Sem compras para exportar em CSV.');
      return;
    }
    const lines = buildCsvLines(annualEntries);
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compras_backup_${selectedYear}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Backup CSV anual exportado.');
  };

  const exportCsvAnual = () => {
    const yearPrefix = `${selectedYear}-`;
    const annualEntriesByMonth = Object.fromEntries(
      Object.entries(allEntries)
        .filter(([month]) => month.startsWith(yearPrefix))
        .map(([month, monthEntries]) => [month, monthEntries || []])
    );
    const annualEntries = Object.values(annualEntriesByMonth).flatMap((monthEntries) => monthEntries || []);

    const cleanOptions = sanitizePurchaseOptions(options);
    const hasOptions =
      cleanOptions.groups.length > 0 ||
      cleanOptions.suppliers.length > 0 ||
      cleanOptions.institutions.length > 0 ||
      Object.keys(cleanOptions.supplierDifTypes || {}).length > 0;

    if (annualEntries.length === 0 && !hasOptions) {
      toast.error('Sem compras ou listas para gerar backup.');
      return;
    }

    const backup = {
      type: 'compras-annual-backup',
      version: 2,
      year: selectedYear,
      exportedAt: new Date().toISOString(),
      purchaseEntries: annualEntriesByMonth,
      purchaseOptions: cleanOptions,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compras_backup_${selectedYear}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Backup anual exportado.');
  };

  const exportPurchaseListsBackup = () => {
    const cleanOptions = sanitizePurchaseOptions(options);
    const backup = {
      type: 'compras-lists-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      purchaseOptions: cleanOptions,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compras_listas_backup_${selectedYear}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Backup das listas exportado.');
  };

  const importPurchaseListsBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result || '').replace(/^\uFEFF/, '').trim();
        if (!content.startsWith('{')) {
          toast.error('Importe um backup JSON de listas.');
          return;
        }

        const parsed = JSON.parse(content);
        const importedOptions = sanitizePurchaseOptions(parsed.purchaseOptions || parsed);
        const hasOptions =
          importedOptions.groups.length > 0 ||
          importedOptions.suppliers.length > 0 ||
          importedOptions.institutions.length > 0 ||
          Object.keys(importedOptions.supplierDifTypes || {}).length > 0;

        if (!hasOptions) {
          toast.error('Backup de listas sem dados.');
          return;
        }

        saveOptions(importedOptions, 'Listas importadas no servidor.');
      } catch {
        toast.error('Erro ao importar backup de listas.');
      }
    };
    reader.readAsText(file);
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
        }, `CSV importado no servidor (${imported.length} linhas).`, (prevOptions) =>
          withEntriesOptions(prevOptions, imported)
        );
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
        const trimmed = content.trim();

        if (trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed);
          const importedOptions = sanitizePurchaseOptions(parsed.purchaseOptions || {});
          const importedEntriesByMonth = parsed.purchaseEntries && typeof parsed.purchaseEntries === 'object'
            ? (parsed.purchaseEntries as Record<string, PurchaseEntry[]>)
            : {};
          const months = Object.keys(importedEntriesByMonth).filter((month) => month.startsWith(`${selectedYear}-`));
          const importedCount = months.reduce(
            (total, month) => total + (Array.isArray(importedEntriesByMonth[month]) ? importedEntriesByMonth[month].length : 0),
            0
          );

          saveSettingsEntries((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((month) => {
              if (month.startsWith(`${selectedYear}-`)) next[month] = [];
            });

            months.forEach((month) => {
              next[month] = (importedEntriesByMonth[month] || []).map((entry, index) => ({
                ...entry,
                id: entry.id || `${Date.now()}_${month}_${index}_${Math.random().toString(36).slice(2, 6)}`,
                supplier: sanitizeStoredText(entry.supplier || ''),
                financialInstitution: sanitizeStoredText(entry.financialInstitution || ''),
                group: sanitizeStoredText(entry.group || ''),
                difType: normalizeDifType(entry.difType) as PurchaseEntry['difType'],
              }));
            });
            return next;
          }, `Backup importado no servidor (${importedCount} compras).`, (prevOptions) => {
            const prevClean = sanitizePurchaseOptions(prevOptions);
            return sanitizePurchaseOptions({
              groups: mergeUnique(prevClean.groups, importedOptions.groups),
              suppliers: mergeUnique(prevClean.suppliers, importedOptions.suppliers),
              institutions: mergeUnique(prevClean.institutions, importedOptions.institutions),
              supplierDifTypes: {
                ...(prevClean.supplierDifTypes || {}),
                ...(importedOptions.supplierDifTypes || {}),
              },
            });
          });
          return;
        }

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
        }, `CSV importado no servidor (${imported.length} linhas).`, (prevOptions) =>
          withEntriesOptions(prevOptions, imported)
        );
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
    const nextOptions: PurchaseOptions = { ...options, [editingOption.field]: nextList };
    if (editingOption.field === 'suppliers') {
      const nextMap = { ...(options.supplierDifTypes || {}) };
      const oldKey = normalizeOptionMapKey(editingOption.oldValue);
      const nextKey = normalizeOptionMapKey(nextValue);
      if (oldKey !== nextKey) {
        const mapped = nextMap[oldKey];
        delete nextMap[oldKey];
        if (mapped) nextMap[nextKey] = mapped;
      }
      nextOptions.supplierDifTypes = nextMap;
    }
    saveOptions(nextOptions, 'Item da lista atualizado no servidor.');
    setEditingOption(null);
  };

  const removeOption = (field: 'groups' | 'suppliers' | 'institutions', value: string) => {
    if (!confirm(`Excluir "${value}"?`)) return;
    const targetNorm = normalizeKey(value);
    const nextList = (options[field] || []).filter((item) => normalizeKey(item) !== targetNorm);
    const nextOptions: PurchaseOptions = { ...options, [field]: nextList };
    if (field === 'suppliers') {
      const nextMap = { ...(options.supplierDifTypes || {}) };
      delete nextMap[normalizeOptionMapKey(value)];
      nextOptions.supplierDifTypes = nextMap;
    }
    saveOptions(nextOptions, 'Item removido da lista no servidor.');
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

    saveSettingsEntries((prev) => ({ ...prev, [currentMonthKey]: [] }), 'Compras do mes removidas no servidor.');
    if (editingId) clearForm();
    setShowClearMonthDialog(false);
    setClearMonthPassword('');
    setClearMonthConfirmText('');
  };

  return (
    <div className="space-y-4 pb-24">
      {savePendingMessage && !saveFailureMessage && (
        <div className="rounded-xl border border-amber-500 bg-amber-50 p-3 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="text-sm font-bold">Salvando compras</div>
              <div className="text-sm font-semibold">{savePendingMessage}</div>
            </div>
          </div>
        </div>
      )}
      {saveFailureMessage && (
        <div className="rounded-xl border-2 border-red-700 bg-red-600 p-4 text-white shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
            <div>
              <div className="text-base font-bold">Falha ao salvar compras</div>
              <div className="text-sm font-semibold">{saveFailureMessage}</div>
            </div>
          </div>
        </div>
      )}
      <Dialog open={showSaveFailureDialog} onOpenChange={setShowSaveFailureDialog}>
        <DialogContent className="border-2 border-red-600">
          <DialogHeader>
            <DialogTitle className="text-red-700">Falha ao salvar compras</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-700">
            {saveFailureMessage || 'A alteracao em compras nao foi confirmada pelo servidor.'}
          </div>
          <p className="text-sm text-muted-foreground">
            A informacao pode estar somente nesta tela. Nao atualize a pagina ate confirmar que o servidor voltou.
          </p>
          <Button onClick={() => setShowSaveFailureDialog(false)}>Entendi</Button>
        </DialogContent>
      </Dialog>
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Compras</h3>
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 p-1">
              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value as typeof searchField)}
                className="h-7 w-[112px] rounded-md border border-input bg-background px-2 text-[11px]"
                title="Campo da pesquisa local"
              >
                <option value="all">Tudo</option>
                <option value="dueDate">Vencimento</option>
                <option value="supplier">Fornecedor</option>
                <option value="document">Documento</option>
                <option value="issueDate">Emissao</option>
                <option value="amount">Valor</option>
                <option value="institution">Instituicao</option>
              </select>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtro local"
                className="h-7 w-[170px] px-2 text-xs"
              />
            </div>
            <label>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importCsvAnual(file);
                  e.currentTarget.value = '';
                }}
              />
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
                <span>Importar</span>
              </Button>
            </label>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={exportCsvAnual}>
              Backup
            </Button>
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
              <Button asChild size="sm" variant="ghost" className="h-5 px-1.5 text-[9px] text-muted-foreground">
                <span>Importar CSV</span>
              </Button>
            </label>
            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[9px] text-muted-foreground" onClick={exportCsvAnualFile}>
              Backup CSV
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
              onChange={(e) => applySupplierToForm(e.target.value)}
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

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_440px] gap-4 items-stretch">
        <Card className="p-4">
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/50 p-4">
              <p className="text-sm font-bold text-muted-foreground uppercase">Total mes</p>
              <p className="mt-1 text-2xl font-black font-mono-num">{formatCurrency(totalMonth)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              <p className="text-sm font-bold uppercase">Pago mes</p>
              <p className="mt-1 text-2xl font-black font-mono-num">{formatCurrency(paidMonth)}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              <p className="text-sm font-bold uppercase">Pendente</p>
              <p className="mt-1 text-2xl font-black font-mono-num">{formatCurrency(pendingMonth)}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 lg:hidden">
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as typeof searchField)}
              className="h-8 w-[120px] rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="all">Tudo</option>
              <option value="dueDate">Vencimento</option>
              <option value="supplier">Fornecedor</option>
              <option value="document">Documento</option>
              <option value="issueDate">Emissao</option>
              <option value="amount">Valor</option>
              <option value="institution">Instituicao</option>
            </select>
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtro local"
              className="h-8 max-w-[190px] px-2 text-xs"
            />
          </div>
        </Card>

        <Card className="p-3">
          {difChartData.length > 0 ? (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={difChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={118}
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
            <p className="text-xs text-muted-foreground">Sem dados no mes.</p>
          )}
        </Card>

        <Card className="p-4">
          <h4 className="text-sm font-bold mb-2">Top 20 fornecedores do mes</h4>
          {supplierChartData.length > 0 ? (
            <div className="h-[250px] overflow-y-auto pr-1 space-y-1.5">
              {supplierChartData.slice(0, 20).map((item, index) => {
                const max = supplierChartData[0]?.total || 1;
                const width = Math.max(6, (item.total / max) * 100);
                return (
                  <div key={`${item.supplier}-${index}`} className="rounded border border-border/60 p-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold truncate">{index + 1}. {item.supplier}</span>
                      <span className="font-bold whitespace-nowrap">{formatCurrency(item.total)}</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded bg-muted overflow-hidden">
                      <div className="h-full rounded bg-blue-600" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sem dados no mes.</p>
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
                      <td className="px-3 py-2 truncate">{fixMojibakeSafe(entry.supplier || '-')}</td>
                      <td className="px-3 py-2 truncate">{entry.documentNumber || '-'}</td>
                      <td className="px-3 py-2">{entry.issueDate ? formatDateBr(entry.issueDate) : '-'}</td>
                      <td className="px-3 py-2">{entry.installments || '-'}</td>
                      <td className="px-3 py-2 font-semibold">{formatCurrency(entry.amount)}</td>
                      <td className="px-3 py-2">{entry.paidDate ? formatDateBr(entry.paidDate) : '-'}</td>
                      <td className="px-3 py-2 truncate">{fixMojibakeSafe(entry.financialInstitution || '-')}</td>
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
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>Listas de Compras</DialogTitle>
              <div className="flex items-center gap-2">
                <label>
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importPurchaseListsBackup(file);
                      e.currentTarget.value = '';
                    }}
                  />
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
                    <span>Importar</span>
                  </Button>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={exportPurchaseListsBackup}
                >
                  Backup
                </Button>
              </div>
            </div>
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
                    <span className="text-sm break-words">{fixMojibakeSafe(item)}</span>
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
                {options.suppliers.map((item) => {
                  const mapped = options.supplierDifTypes?.[normalizeOptionMapKey(item)];
                  return (
                    <div key={`supplier-${item}`} className="bg-secondary/30 rounded px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm break-words">{fixMojibakeSafe(item)}</span>
                        <Button size="icon" variant="outline" onClick={() => removeOption('suppliers', item)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                      <div className="mt-1 flex gap-1">
                        {(['D', 'I', 'F'] as const).map((type) => (
                          <button
                            type="button"
                            key={type}
                            onClick={() => setSupplierDifOption(item, mapped === type ? '' : type)}
                            className={`h-7 min-w-7 rounded-full border px-2 text-xs font-bold ${
                              mapped === type
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-background text-muted-foreground'
                            }`}
                            title={type === 'D' ? 'Despesa' : type === 'I' ? 'Imposto' : 'Fornecedor'}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
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
                    <span className="text-sm break-words">{fixMojibakeSafe(item)}</span>
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
                      <td className="px-2 py-2">{fixMojibakeSafe(item.supplier || '-')}</td>
                      <td className="px-2 py-2">{item.documentNumber || '-'}</td>
                      <td className="px-2 py-2">{item.issueDate ? formatDateBr(item.issueDate) : '-'}</td>
                      <td className="px-2 py-2">{item.installments || '-'}</td>
                      <td className="px-2 py-2">{item.paidDate ? formatDateBr(item.paidDate) : '-'}</td>
                      <td className="px-2 py-2 truncate max-w-[240px]">{fixMojibakeSafe(item.financialInstitution || '-')}</td>
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

      <Dialog
        open={showRowEdit}
        onOpenChange={(open) => {
          setShowRowEdit(open);
          if (!open) {
            setShowAddPurchase(false);
            setRowEditAmountText('');
            setRowExtraDueDates([]);
          }
        }}
      >
        <DialogContent className="w-[98vw] !max-w-[98vw] sm:!max-w-[98vw]">
          <DialogHeader>
            <DialogTitle>{showAddPurchase ? 'Adicionar compra' : 'Editar compra'}</DialogTitle>
          </DialogHeader>
          {rowEditForm && (
            <div>
            <div className="grid grid-cols-9 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Vencimento</label>
                <Input ref={rowDueDateRef} type="date" value={rowEditForm.dueDate} onChange={(e) => setRowEditForm((p) => (p ? { ...p, dueDate: e.target.value } : p))} onKeyDown={(e) => handleEnterAdvance(e, rowGroupRef)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Loja</label>
                <Input
                  ref={rowGroupRef}
                  list="group-list"
                  value={rowEditForm.group}
                  onChange={(e) => setRowEditForm((p) => (p ? { ...p, group: e.target.value } : p))}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => handleEnterAdvance(e, rowSupplierRef)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Fornecedor</label>
                <Input
                  ref={rowSupplierRef}
                  list="suppliers-list"
                  value={rowEditForm.supplier}
                  onChange={(e) => applySupplierToRowEdit(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => handleEnterAdvance(e, rowDocumentRef)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Boleto / Documento</label>
                <Input
                  ref={rowDocumentRef}
                  value={rowEditForm.documentNumber}
                  onChange={(e) => setRowEditForm((p) => (p ? { ...p, documentNumber: e.target.value } : p))}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => handleEnterAdvance(e, rowIssueDateRef)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Emissao</label>
                <Input ref={rowIssueDateRef} type="date" value={rowEditForm.issueDate} onChange={(e) => setRowEditForm((p) => (p ? { ...p, issueDate: e.target.value } : p))} onKeyDown={(e) => handleEnterAdvance(e, rowInstallmentsRef)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Parcela</label>
                <Input
                  ref={rowInstallmentsRef}
                  value={rowEditForm.installments}
                  onChange={(e) => setRowEditForm((p) => (p ? { ...p, installments: normalizeInstallments(e.target.value) } : p))}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) =>
                    setRowEditForm((p) => (p ? { ...p, installments: toInstallmentsFixed(e.target.value) || p.installments } : p))
                  }
                  onKeyDown={(e) => handleEnterAdvance(e, rowAmountRef)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Valor</label>
                <Input
                  ref={rowAmountRef}
                  type="text"
                  inputMode="decimal"
                  value={rowEditAmountText}
                  onChange={(e) => {
                    const nextText = sanitizeAmountTyping(e.target.value);
                    setRowEditAmountText(nextText);
                    setRowEditForm((p) => (p ? { ...p, amount: parseAmount(nextText) } : p));
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => {
                    const fixed = normalizeAmountInput(rowEditAmountText);
                    setRowEditAmountText(fixed);
                    setRowEditForm((p) => (p ? { ...p, amount: parseAmount(fixed) } : p));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const fixed = normalizeAmountInput(rowEditAmountText);
                      setRowEditAmountText(fixed);
                      setRowEditForm((p) => (p ? { ...p, amount: parseAmount(fixed) } : p));
                      rowPaidDateRef.current?.focus();
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Pago (data)</label>
                <Input ref={rowPaidDateRef} type="date" value={rowEditForm.paidDate || ''} onChange={(e) => setRowEditForm((p) => (p ? { ...p, paidDate: e.target.value || undefined } : p))} onKeyDown={(e) => handleEnterAdvance(e, rowInstitutionRef)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Instituicao Financeira</label>
                <Input
                  ref={rowInstitutionRef}
                  list="institutions-list"
                  value={rowEditForm.financialInstitution}
                  onChange={(e) => setRowEditForm((p) => (p ? { ...p, financialInstitution: e.target.value } : p))}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      rowDifSelectorRef.current?.focus();
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">D / I / F</label>
                <div
                  ref={rowDifSelectorRef}
                  tabIndex={0}
                  className="flex gap-2 h-10 items-center outline-none"
                  onKeyDown={(e) => {
                    const order: Array<'D' | 'I' | 'F'> = ['D', 'I', 'F'];
                    const current = order.indexOf((rowEditForm.difType as 'D' | 'I' | 'F') || 'D');
                    if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      setRowEditForm((p) => (p ? { ...p, difType: order[(current + 1) % order.length] } : p));
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      setRowEditForm((p) => (p ? { ...p, difType: order[(current - 1 + order.length) % order.length] } : p));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      saveRowEdit();
                    }
                  }}
                >
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
            {showAddPurchase && rowExtraCount > 0 && (
              <div className="mt-2 rounded-lg border border-border bg-secondary/15 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">Vencimentos das próximas parcelas</p>
                  <p className="text-xs text-muted-foreground">Opcional. Preencha apenas as parcelas que quiser criar agora.</p>
                </div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {Array.from({ length: rowExtraCount }, (_item, index) => {
                    const parcelaNumero = rowInstallmentInfo.current + index + 1;
                    const totalText = String(rowInstallmentInfo.total).padStart(2, '0');
                    return (
                      <div key={`extra-due-${index}`}>
                        <label className="text-xs font-bold text-muted-foreground uppercase">
                          {String(parcelaNumero).padStart(2, '0')}/{totalText}
                        </label>
                        <Input
                          type="date"
                          value={rowExtraDueDates[index] || ''}
                          className="h-11 text-base font-semibold"
                          onChange={(e) => {
                            const value = e.target.value;
                            setRowExtraDueDates((prev) =>
                              Array.from({ length: rowExtraCount }, (_unused, i) => (i === index ? value : prev[i] || ''))
                            );
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowRowEdit(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={saveRowEdit}>
              {showAddPurchase ? 'Adicionar' : 'Salvar'}
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
