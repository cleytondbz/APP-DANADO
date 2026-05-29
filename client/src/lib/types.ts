export interface Category {
  id: string;
  name: string;
  operation: 'add' | 'subtract' | 'null';
  order: number;
}

export interface DayEntry {
  date: string;
  values: Record<string, number>;
  manualFields?: string[];
}

export interface MonthData {
  year: number;
  month: number;
  entries: DayEntry[];
}

export interface StoreData {
  storeId: string;
  storeName: string;
  cnpj: string;
  months: MonthData[];
  categories: Category[];
}

export interface Debt {
  id: string;
  personName: string;
  description: string;
  amount: number;
  date: string;
  paid: boolean;
  paidDate?: string;
  paidAmount?: number;
}

export interface PurchaseEntry {
  id: string;
  dueDate: string; // YYYY-MM-DD
  group: string; // JBIM, JT, outros
  supplier: string;
  documentNumber: string;
  issueDate: string; // YYYY-MM-DD
  installments: string; // ex: 1/10
  amount: number;
  paidDate?: string; // YYYY-MM-DD
  financialInstitution: string;
  difType?: 'D' | 'I' | 'F';
}

export interface PurchaseOptions {
  groups: string[];
  suppliers: string[];
  institutions: string[];
}

export interface FieldMapping {
  fechamento_field: string; // dinheiro, sobra, cartao, boleto, sangria
  lancamento_field: string; // dinheiro, pix, sobra, cartao, duplicata, cart_jb, est_desp, sangria
}

export interface ActionUser {
  id: string;
  name: string;
  password: string;
  permissions: ('delete' | 'edit' | 'changeDate')[];
}

export interface AccessLog {
  id: string;
  timestamp: number;
  storeId?: StoreId;
  action: 'delete' | 'edit' | 'changeDate' | 'login';
  status: 'success' | 'failed';
  userName?: string;
  details?: string;
}

export interface TimelineEntry {
  id: string;
  timestamp: number;
  module: 'caixa' | 'fechamento' | 'lancamentos';
  storeId: 'loja1' | 'loja2';
  action: 'create' | 'update' | 'delete';
  date: string; // YYYY-MM-DD
  field?: string; // Nome do campo alterado
  oldValue?: string | number;
  newValue?: string | number;
  description: string; // Descrição legível da mudança
}

export interface AppSettings {
  password: string;
  senhaVendas?: string;
  actionUsers?: ActionUser[];
  accessLogs?: AccessLog[];
  timeline?: TimelineEntry[];
  fieldMappingLan1?: FieldMapping[];
  fieldMappingLan2?: FieldMapping[];
  fieldMappingCompacto1?: FieldMapping[];
  fieldMappingCompacto2?: FieldMapping[];
  caixaCategories?: { id: string; name: string }[];
  fechamentoCategories?: { id: string; name: string }[];
  lancamentosFontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  lancamentosHeaderFontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  dasChartType?: 'bar' | 'line';
  dasColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    monthTotal?: string;
    tooltipText?: string;
    tooltipBg?: string;
    totalText?: string;
    valueText?: string;
    averageText?: string;
    labelColor?: string;
  };
  dateProtection?: 'none' | 'day' | 'month';
  customSaldoSelection?: string[];
  customSaldoDays?: number[];
  syncPreference?: 'site' | 'program' | 'both';
  purchaseEntries?: Record<string, PurchaseEntry[]>;
  purchaseOptions?: PurchaseOptions;
}

export type StoreId = 'loja1' | 'loja2';
export type AppScreen = 'login' | 'selection' | 'storeSelection' | 'caixaSelection' | 'caixa' | 'main' | 'compras';
export type MainTab = 'dashboard' | 'lancamentos' | 'fechamentoCompacto' | 'compras' | 'dividas' | 'totais' | 'caixa' | 'opcoes';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'dinheiro', name: 'Dinheiro', operation: 'add', order: 1 },
  { id: 'pix', name: 'PIX', operation: 'add', order: 2 },
  { id: 'sobra', name: 'Sobra', operation: 'add', order: 3 },
  { id: 'cartao', name: 'Cartão', operation: 'add', order: 4 },
  { id: 'duplicata', name: 'Duplicata', operation: 'add', order: 5 },
  { id: 'cart_jb', name: 'Cart/JB', operation: 'add', order: 6 },
  { id: 'est_desp', name: 'Est/Desp', operation: 'subtract', order: 7 },
  { id: 'sangria', name: 'Sangria', operation: 'null', order: 8 },
];

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DAY_NAMES_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const CHART_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
  '#8B5CF6', '#EC4899',
];

export const CHART_HEX = ['#3B82F6', '#06B6D4', '#10B981', '#F59E0B', '#A855F7', '#8B5CF6', '#EC4899'];

export const DEFAULT_CAIXA_CATEGORIES = [
  { id: 'dinheiro', name: 'Dinheiro' },
  { id: 'pix', name: 'PIX' },
  { id: 'cartao', name: 'Cartão' },
  { id: 'boleto', name: 'Boleto' },
];

export const DEFAULT_FECHAMENTO_CATEGORIES = [
  { id: 'dinheiro', name: 'Dinheiro' },
  { id: 'pix', name: 'PIX' },
  { id: 'sobra', name: 'Sobra' },
  { id: 'cartao', name: 'Cartão' },
  { id: 'boleto', name: 'Boleto' },
  { id: 'sangria', name: 'Sangria' },
];
