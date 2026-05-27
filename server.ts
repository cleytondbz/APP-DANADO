import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DEBUG_SYNC = process.env.DEBUG_SYNC === '1';

const normalizeKey = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

const purchaseEntrySignature = (entry: any) => {
  const amount = Number(entry?.amount || 0).toFixed(2);
  return [
    entry?.dueDate || '',
    normalizeKey(entry?.group),
    normalizeKey(entry?.supplier),
    normalizeKey(entry?.documentNumber),
    entry?.issueDate || '',
    normalizeKey(entry?.installments),
    amount,
    entry?.paidDate || '',
    normalizeKey(entry?.financialInstitution),
  ].join('|');
};

const mergePurchaseEntries = (current: Record<string, any[]> = {}, incoming: Record<string, any[]> = {}) => {
  const out: Record<string, any[]> = { ...current };
  // Para compras, os meses enviados pelo cliente devem substituir o mês no servidor.
  // Isso permite editar/excluir/limpar sem "voltar" após F5.
  Object.keys(incoming || {}).forEach((monthKey) => {
    const nextMonth = Array.isArray(incoming?.[monthKey]) ? incoming[monthKey] : [];
    const map = new Map<string, any>();
    nextMonth.forEach((entry) => {
      map.set(purchaseEntrySignature(entry), entry);
    });
    out[monthKey] = Array.from(map.values());
  });
  return out;
};

const mergeUniqueList = (a: string[] = [], b: string[] = []) => {
  const seen = new Set<string>();
  const out: string[] = [];
  [...a, ...b].forEach((item) => {
    const key = normalizeKey(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(String(item).trim());
  });
  return out;
};

const uniqueNormalizedList = (list: string[] = []) => {
  const seen = new Set<string>();
  const out: string[] = [];
  list.forEach((item) => {
    const key = normalizeKey(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(String(item).trim());
  });
  return out;
};

const cleanLogText = (value: any) =>
  String(value ?? '')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã£/g, 'ã')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã/g, 'à')
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}\n\r\t]/gu, '')
    .trim();

const decodeMojibake = (value: string) => {
  let text = value;
  for (let i = 0; i < 2; i += 1) {
    if (!/[ÃÂ]/.test(text)) break;
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    if (!decoded || decoded === text) break;
    text = decoded;
  }
  return text;
};

const sanitizeLogText = (value: any) =>
  decodeMojibake(cleanLogText(value))
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}\n\r\t]/gu, '')
    .trim();

const toNum = (v: any) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  return parseFloat(String(v).replace(',', '.')) || 0;
};

const sumItems = (arr: any[] = []) =>
  (Array.isArray(arr) ? arr : []).reduce((sum, item) => {
    const q = toNum(item?.quantidade || 1) || 1;
    const val = toNum(item?.valor);
    return sum + q * val;
  }, 0);

function buildProgramAuditLogs(
  oldCaixa: Record<string, any> = {},
  newCaixa: Record<string, any> = {},
  oldFech: Record<string, any> = {},
  newFech: Record<string, any> = {},
) {
  const accessLogs: any[] = [];
  const timeline: any[] = [];
  const now = Date.now();
  let seq = 0;

  const pushAccess = (storeId: 'loja1' | 'loja2', date: string, details: string) => {
    seq += 1;
    accessLogs.push({
      id: `program_access_${now}_${seq}`,
      timestamp: now + seq,
      storeId,
      action: 'edit',
      status: 'success',
      userName: 'PROGRAMA',
      details: sanitizeLogText(details),
    });
  };

  const pushTimeline = (storeId: 'loja1' | 'loja2', date: string, field: string, oldValue: any, newValue: any, description: string) => {
    seq += 1;
    timeline.push({
      id: `program_timeline_${now}_${seq}`,
      timestamp: now + seq,
      module: 'fechamento',
      storeId,
      action: 'update',
      date,
      field,
      oldValue: typeof oldValue === 'number' ? Number(oldValue.toFixed(2)) : oldValue,
      newValue: typeof newValue === 'number' ? Number(newValue.toFixed(2)) : newValue,
      description: sanitizeLogText(description),
    });
  };

  const stores: ('loja1' | 'loja2')[] = ['loja1', 'loja2'];
  const catKeys = ['dinheiro', 'pix', 'cartao', 'boleto', 'sobra', 'sangria', 'despesa'];
  const label: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao: 'Cartão',
    boleto: 'Boleto',
    sobra: 'Sobra',
    sangria: 'Sangria',
    despesa: 'Despesa',
  };

  stores.forEach((storeId) => {
    const oC = oldCaixa?.[storeId] || {};
    const nC = newCaixa?.[storeId] || {};
    const oF = oldFech?.[storeId] || {};
    const nF = newFech?.[storeId] || {};
    const dates = new Set<string>([
      ...Object.keys(oC || {}),
      ...Object.keys(nC || {}),
      ...Object.keys(oF || {}),
      ...Object.keys(nF || {}),
    ]);

    dates.forEach((date) => {
      const oldDayCaixa = oC?.[date] || {};
      const newDayCaixa = nC?.[date] || {};
      const oldDayFech = oF?.[date] || {};
      const newDayFech = nF?.[date] || {};

      const catMap = {
        dinheiro: { old: sumItems(oldDayCaixa?.dinheiro), now: sumItems(newDayCaixa?.dinheiro) },
        pix: { old: sumItems(oldDayCaixa?.pix), now: sumItems(newDayCaixa?.pix) },
        cartao: { old: sumItems(oldDayCaixa?.cartao), now: sumItems(newDayCaixa?.cartao) },
        boleto: { old: sumItems(oldDayCaixa?.boleto), now: sumItems(newDayCaixa?.boleto) },
        sobra: { old: toNum(oldDayFech?.sobra), now: toNum(newDayFech?.sobra) },
        sangria: {
          old: (Array.isArray(oldDayFech?.sangrias) ? oldDayFech.sangrias : []).reduce((s: number, x: any) => s + toNum(x?.valor), 0),
          now: (Array.isArray(newDayFech?.sangrias) ? newDayFech.sangrias : []).reduce((s: number, x: any) => s + toNum(x?.valor), 0),
        },
        despesa: {
          old: (Array.isArray(oldDayFech?.despesas) ? oldDayFech.despesas : []).reduce((s: number, x: any) => s + toNum(x?.valor), 0),
          now: (Array.isArray(newDayFech?.despesas) ? newDayFech.despesas : []).reduce((s: number, x: any) => s + toNum(x?.valor), 0),
        },
      };

      catKeys.forEach((k) => {
        const oldVal = catMap[k as keyof typeof catMap].old;
        const newVal = catMap[k as keyof typeof catMap].now;
        if (Math.abs(oldVal - newVal) > 0.0001) {
          const details = `${storeId.toUpperCase()} ${date} ${label[k]}: R$ ${oldVal.toFixed(2)} -> R$ ${newVal.toFixed(2)}`;
          pushAccess(storeId, date, details);
          pushTimeline(storeId, date, k, oldVal, newVal, `Programa alterou ${label[k]} de R$ ${oldVal.toFixed(2)} para R$ ${newVal.toFixed(2)}`);
        }
      });

      const oldNome = String(oldDayFech?.nomeDigital || '').trim();
      const newNome = String(newDayFech?.nomeDigital || '').trim();
      if (oldNome !== newNome) {
        const details = `${storeId.toUpperCase()} ${date} Nome digital: "${oldNome || '-'}" -> "${newNome || '-'}"`;
        pushAccess(storeId, date, details);
        pushTimeline(storeId, date, 'nomeDigital', oldNome, newNome, `Programa alterou nome digital para ${newNome || '-'}`);
      }
    });
  });

  return { accessLogs, timeline };
}

function appendProgramAudit(
  storeId: 'loja1' | 'loja2',
  action: 'create' | 'update' | 'delete',
  module: 'caixa' | 'fechamento',
  date: string,
  details: string,
  field?: string,
  oldValue?: any,
  newValue?: any,
) {
  const now = Date.now();
  const accessLog = {
    id: `program_access_${now}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    storeId,
    action: action === 'delete' ? 'delete' : 'edit',
    status: 'success',
    userName: 'PROGRAMA',
    details: sanitizeLogText(details),
  };

  const timeline = {
    id: `program_timeline_${now}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    module,
    storeId,
    action,
    date,
    field,
    oldValue,
    newValue,
    description: sanitizeLogText(details),
  };

  dataStore.settings = {
    ...(dataStore.settings || {}),
    accessLogs: [...(dataStore.settings?.accessLogs || []), accessLog].slice(-300),
    timeline: [...(dataStore.settings?.timeline || []), timeline].slice(-800),
  };
}

function appendProgramAuditEvents(events: any[] = []) {
  if (!Array.isArray(events) || events.length === 0) return;

  const existingAccessIds = new Set<string>((dataStore.settings?.accessLogs || []).map((x: any) => String(x?.id || '')));
  const existingTimelineIds = new Set<string>((dataStore.settings?.timeline || []).map((x: any) => String(x?.id || '')));
  const accessToAdd: any[] = [];
  const timelineToAdd: any[] = [];

  events.forEach((ev: any) => {
    if (!ev || !ev.storeId || !ev.action || !ev.details) return;
    const baseId = String(ev.id || `program_evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const ts = Number(ev.timestamp) || Date.now();
    const accessId = `${baseId}_a`;
    const timelineId = `${baseId}_t`;

    if (!existingAccessIds.has(accessId)) {
      accessToAdd.push({
        id: accessId,
        timestamp: ts,
        storeId: ev.storeId,
        action: ev.action === 'delete' ? 'delete' : 'edit',
        status: 'success',
        userName: sanitizeLogText(ev.userName || 'PROGRAMA'),
        details: sanitizeLogText(ev.details),
        date: ev.date,
      });
      existingAccessIds.add(accessId);
    }

    if (!existingTimelineIds.has(timelineId)) {
      timelineToAdd.push({
        id: timelineId,
        timestamp: ts,
        module: ev.module || 'caixa',
        storeId: ev.storeId,
        action: ev.action === 'delete' ? 'delete' : 'update',
        date: ev.date,
        field: ev.field,
        oldValue: ev.oldValue,
        newValue: ev.newValue,
        description: sanitizeLogText(ev.details),
      });
      existingTimelineIds.add(timelineId);
    }
  });

  if (accessToAdd.length === 0 && timelineToAdd.length === 0) return;

  dataStore.settings = {
    ...(dataStore.settings || {}),
    accessLogs: [...(dataStore.settings?.accessLogs || []), ...accessToAdd].slice(-300),
    timeline: [...(dataStore.settings?.timeline || []), ...timelineToAdd].slice(-800),
  };
}

type ProgramAnnotationAudit = {
  storeId: 'loja1' | 'loja2';
  action: 'update' | 'delete';
  date: string;
  details: string;
  field?: string;
  oldValue?: any;
  newValue?: any;
};

function buildProgramAnnotationAuditLogs(
  oldCaixa: Record<string, any> = {},
  newCaixa: Record<string, any> = {},
): ProgramAnnotationAudit[] {
  const audits: ProgramAnnotationAudit[] = [];
  const stores: ('loja1' | 'loja2')[] = ['loja1', 'loja2'];
  const categorias = ['dinheiro', 'pix', 'cartao', 'boleto'];
  const categoriaLabel: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao: 'Cartao',
    boleto: 'Boleto',
  };

  stores.forEach((storeId) => {
    const oldStore = oldCaixa?.[storeId] || {};
    const newStore = newCaixa?.[storeId] || {};
    const dates = new Set<string>([...Object.keys(oldStore), ...Object.keys(newStore)]);

    dates.forEach((date) => {
      const oldDay = oldStore?.[date] || {};
      const newDay = newStore?.[date] || {};

      categorias.forEach((categoria) => {
        const oldItems = Array.isArray(oldDay?.[categoria]) ? oldDay[categoria] : [];
        const newItems = Array.isArray(newDay?.[categoria]) ? newDay[categoria] : [];
        const oldMap = new Map<string, any>(oldItems.map((x: any) => [String(x?.id), x]));
        const newMap = new Map<string, any>(newItems.map((x: any) => [String(x?.id), x]));
        const nomeCat = categoriaLabel[categoria] || categoria;

        oldMap.forEach((oldItem, id) => {
          const nextItem = newMap.get(id);
          const oldDesc = String(oldItem?.descricao || '-');
          const oldVal = toNum(oldItem?.valor);
          const oldQtd = toNum(oldItem?.quantidade || 1);
          const oldTotal = oldVal * (oldQtd || 1);

          if (!nextItem) {
            audits.push({
              storeId,
              action: 'delete',
              date,
              details: `${storeId.toUpperCase()} ${date} excluiu item em ${nomeCat} | descricao: ${oldDesc} | Valor: R$ ${oldTotal.toFixed(2)}`,
              field: categoria,
              oldValue: oldTotal,
            });
            return;
          }

          const newDesc = String(nextItem?.descricao || '-');
          const newVal = toNum(nextItem?.valor);
          const newQtd = toNum(nextItem?.quantidade || 1);
          const newTotal = newVal * (newQtd || 1);
          const changed =
            oldDesc !== newDesc ||
            Math.abs(oldVal - newVal) > 0.0001 ||
            Math.abs(oldQtd - newQtd) > 0.0001;
          if (!changed) return;

          audits.push({
            storeId,
            action: 'update',
            date,
            details: `${storeId.toUpperCase()} ${date} editou item em ${nomeCat} | descricao: ${oldDesc} -> ${newDesc} | Valor: R$ ${oldTotal.toFixed(2)} -> R$ ${newTotal.toFixed(2)}`,
            field: categoria,
            oldValue: oldTotal,
            newValue: newTotal,
          });
        });
      });
    });
  });

  return audits;
}

// Arquivo de persistência de dados
const defaultDataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const resolvedDataFile = process.env.DATA_FILE || path.join(defaultDataDir, 'data.json');
const DATA_FILE = path.resolve(resolvedDataFile);

try {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
} catch (error) {
  console.error('[Server] Erro ao preparar pasta de dados:', error);
}

// Função para carregar dados do arquivo
function loadDataFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Server] Erro ao carregar dados:', error);
  }
  return null;
}

// Função para salvar dados no arquivo
function saveDataToFile(data: Record<string, any>) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Server] Erro ao salvar dados:', error);
  }
}

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Dados em memória (para teste local)
// Em produção, isso seria um banco de dados
let dataStore: Record<string, any> = {
  stores: {},
  categories: [],
  entries: [],
  debts: [],
  settings: {},
  saldoDia: 0,
  caixa: {},
  fechamento: {},
  lancamentos: {},
};

// Carregar dados do arquivo na inicialização
const loadedData = loadDataFromFile();
if (loadedData) {
  dataStore = loadedData;
  console.log('[Server] Dados carregados do arquivo');
}
// ==================== APIs REST ====================

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== STORES ====================
app.get('/api/stores', (_req: Request, res: Response) => {
  res.json(dataStore.stores);
});

app.post('/api/stores', (req: Request, res: Response) => {
  const { id, storeName, cnpj } = req.body;
  const store = { id, storeName, cnpj, createdAt: new Date().toISOString() };
  dataStore.stores.push(store);
  res.json(store);
});

// ==================== CATEGORIES ====================
app.get('/api/categories/:storeId', (req: Request, res: Response) => {
  const { storeId } = req.params;
  const categories = dataStore.categories.filter((c: any) => c.storeId === storeId);
  res.json(categories);
});

app.post('/api/categories', (req: Request, res: Response) => {
  const { id, storeId, name, operation, order } = req.body;
  const category = { id, storeId, name, operation, order, createdAt: new Date().toISOString() };
  dataStore.categories.push(category);
  res.json(category);
});

app.put('/api/categories/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, operation, order } = req.body;
  const index = dataStore.categories.findIndex((c: any) => c.id === id);
  if (index !== -1) {
    dataStore.categories[index] = { ...dataStore.categories[index], name, operation, order, updatedAt: new Date().toISOString() };
    res.json(dataStore.categories[index]);
  } else {
    res.status(404).json({ error: 'Category not found' });
  }
});

app.delete('/api/categories/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  dataStore.categories = dataStore.categories.filter((c: any) => c.id !== id);
  res.json({ success: true });
});

// ==================== ENTRIES ====================
app.get('/api/entries/:storeId/:year/:month', (req: Request, res: Response) => {
  const { storeId, year, month } = req.params;
  const monthStr = String(month).padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;
  const entries = dataStore.entries.filter((e: any) => 
    e.storeId === storeId && e.date.startsWith(datePrefix)
  );
  res.json(entries);
});

app.post('/api/entries', (req: Request, res: Response) => {
  const { id, storeId, date, values } = req.body;
  const entry = { id, storeId, date, values, createdAt: new Date().toISOString() };
  dataStore.entries.push(entry);
  res.json(entry);
});

app.put('/api/entries/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { values } = req.body;
  const index = dataStore.entries.findIndex((e: any) => e.id === id);
  if (index !== -1) {
    dataStore.entries[index] = { ...dataStore.entries[index], values, updatedAt: new Date().toISOString() };
    res.json(dataStore.entries[index]);
  } else {
    res.status(404).json({ error: 'Entry not found' });
  }
});

// ==================== DEBTS ====================
app.get('/api/debts', (_req: Request, res: Response) => {
  res.json(dataStore.debts);
});

app.post('/api/debts', (req: Request, res: Response) => {
  const { id, personName, description, amount, date } = req.body;
  const debt = { id, personName, description, amount, date, paid: false, createdAt: new Date().toISOString() };
  dataStore.debts.push(debt);
  res.json(debt);
});

app.put('/api/debts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { paid, paidDate, paidAmount } = req.body;
  const index = dataStore.debts.findIndex((d: any) => d.id === id);
  if (index !== -1) {
    dataStore.debts[index] = { ...dataStore.debts[index], paid, paidDate, paidAmount, updatedAt: new Date().toISOString() };
    res.json(dataStore.debts[index]);
  } else {
    res.status(404).json({ error: 'Debt not found' });
  }
});

app.delete('/api/debts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  dataStore.debts = dataStore.debts.filter((d: any) => d.id !== id);
  res.json({ success: true });
});

// ==================== APP DATA SYNC ====================
// Salvar dados do AppContext (settings, stores, debts, saldoDia)
app.post('/api/sync/save', (req: Request, res: Response) => {
  const { source = 'site', settings, stores, debts, saldoDia, caixa, fechamento, lancamentos, lancamentosCompacto, programAuditEvents } = req.body;
  if (DEBUG_SYNC) {
    console.log('[DEBUG] Sync/Save recebido');
  console.log('[DEBUG] Lancamentos:', lancamentos ? 'SIM' : 'NÃO');
  console.log('[DEBUG] Settings:', settings ? 'SIM' : 'NÃO');
  }
  const syncPreference = dataStore.settings?.syncPreference || 'both';
  const sourceAllowed =
    syncPreference === 'both' ||
    (syncPreference === 'site' && source === 'site') ||
    (syncPreference === 'program' && source === 'program');

  if (!sourceAllowed) {
    if (source === 'site' && settings) {
      const has = (k: string) => Object.prototype.hasOwnProperty.call(settings, k);
      const partialSettings: Record<string, any> = {};
      let changed = false;

      if (has('senhaVendas') && typeof settings.senhaVendas === 'string' && settings.senhaVendas.trim()) {
        partialSettings.senhaVendas = settings.senhaVendas.trim();
      }
      if (has('actionUsers') && Array.isArray(settings.actionUsers)) {
        partialSettings.actionUsers = settings.actionUsers;
      }
      if (has('accessLogs') && Array.isArray(settings.accessLogs)) {
        partialSettings.accessLogs = settings.accessLogs;
      }
      if (has('timeline') && Array.isArray(settings.timeline)) {
        partialSettings.timeline = settings.timeline;
      }
      if (has('purchaseEntries')) {
        partialSettings.purchaseEntries = mergePurchaseEntries(
          dataStore.settings?.purchaseEntries || {},
          settings.purchaseEntries || {}
        );
      }
      if (has('purchaseOptions')) {
        const incomingPurchaseOptions = settings.purchaseOptions || {};
        partialSettings.purchaseOptions = {
          groups: uniqueNormalizedList(incomingPurchaseOptions.groups || []),
          suppliers: uniqueNormalizedList(incomingPurchaseOptions.suppliers || []),
          institutions: uniqueNormalizedList(incomingPurchaseOptions.institutions || []),
        };
      }

      if (Object.keys(partialSettings).length > 0) {
        dataStore.settings = {
          ...(dataStore.settings || {}),
          ...partialSettings,
        };
        changed = true;
      }
      if (changed) {
        saveDataToFile(dataStore);
        return res.json({
          success: true,
          partial: true,
          message: 'settings parciais sincronizadas',
          timestamp: new Date().toISOString(),
        });
      }
    }
    // Permite somente troca da preferência de sincronização para destravar o modo.
    if (settings?.syncPreference && ['site', 'program', 'both'].includes(settings.syncPreference)) {
      dataStore.settings = { ...(dataStore.settings || {}), syncPreference: settings.syncPreference };
      saveDataToFile(dataStore);
      return res.json({
        success: true,
        partial: true,
        message: 'syncPreference atualizado',
        timestamp: new Date().toISOString(),
      });
    }
    return res.json({
      success: true,
      ignored: true,
      reason: `source_blocked_by_sync_preference:${syncPreference}`,
      timestamp: new Date().toISOString(),
    });
  }

  if (settings) {
    const incomingSettings = { ...settings };
    if (source === 'program') {
      // Evita que o programa desktop sobrescreva dados gerenciados no site.
      delete (incomingSettings as any).timeline;
      delete (incomingSettings as any).accessLogs;
      delete (incomingSettings as any).actionUsers;
      delete (incomingSettings as any).senhaVendas;
      delete (incomingSettings as any).purchaseEntries;
      delete (incomingSettings as any).purchaseOptions;
    }

    const mergedPurchaseEntries = mergePurchaseEntries(
      dataStore.settings?.purchaseEntries || {},
      incomingSettings.purchaseEntries || {}
    );
    const incomingPurchaseOptions = incomingSettings.purchaseOptions || {};
    const mergedPurchaseOptions = {
      groups: uniqueNormalizedList(incomingPurchaseOptions.groups || dataStore.settings?.purchaseOptions?.groups || []),
      suppliers: uniqueNormalizedList(incomingPurchaseOptions.suppliers || dataStore.settings?.purchaseOptions?.suppliers || []),
      institutions: uniqueNormalizedList(incomingPurchaseOptions.institutions || dataStore.settings?.purchaseOptions?.institutions || []),
    };
    dataStore.settings = {
      ...(dataStore.settings || {}),
      ...incomingSettings,
      purchaseEntries: mergedPurchaseEntries,
      purchaseOptions: mergedPurchaseOptions,
    };
    if (DEBUG_SYNC) {
      console.log('[DEBUG] fieldMappingCompacto1:', settings.fieldMappingCompacto1);
    }
  }
  if (stores) dataStore.stores = stores;
  if (debts) dataStore.debts = debts;
  const oldCaixaSnapshot = JSON.parse(JSON.stringify(dataStore.caixa || {}));
  const oldFechSnapshot = JSON.parse(JSON.stringify(dataStore.fechamento || {}));

  if (saldoDia !== undefined) dataStore.saldoDia = saldoDia;
  if (caixa) dataStore.caixa = caixa;
  if (fechamento) dataStore.fechamento = fechamento;

  // Quando o programa já envia eventos explícitos, evita duplicar logs via diff.
  const hasProgramAuditEvents = source === 'program' && Array.isArray(programAuditEvents) && programAuditEvents.length > 0;

  if (source === 'program' && caixa && !hasProgramAuditEvents) {
    const audits = buildProgramAnnotationAuditLogs(oldCaixaSnapshot, dataStore.caixa || {});
    audits.forEach((audit) => {
      appendProgramAudit(
        audit.storeId,
        audit.action === 'delete' ? 'delete' : 'update',
        'caixa',
        audit.date,
        audit.details,
        audit.field,
        audit.oldValue,
        audit.newValue,
      );
    });
  }

  if (hasProgramAuditEvents) {
    appendProgramAuditEvents(programAuditEvents);
  }

  if (false && source === 'program' && (caixa || fechamento)) {
    const { accessLogs, timeline } = buildProgramAuditLogs(
      oldCaixaSnapshot,
      dataStore.caixa || {},
      oldFechSnapshot,
      dataStore.fechamento || {},
    );

    // Se não houver diff detectado, cria 1 log mínimo para não parecer "sem ação".
    const fallbackNow = Date.now();
    const finalAccess = accessLogs.length
      ? accessLogs
      : [{
          id: `program_${fallbackNow}`,
          timestamp: fallbackNow,
          action: 'edit',
          status: 'success',
          userName: 'PROGRAMA',
          details: 'Atualizacao enviada pelo programa desktop',
        }];
    const finalTimeline = timeline.length
      ? timeline
      : [{
          id: `timeline_program_${fallbackNow}`,
          timestamp: fallbackNow,
          module: 'fechamento',
          storeId: 'loja1',
          action: 'update',
          date: new Date().toISOString().slice(0, 10),
          description: 'Alteracao recebida do programa desktop',
        }];

    dataStore.settings = {
      ...(dataStore.settings || {}),
      accessLogs: [...(dataStore.settings?.accessLogs || []), ...finalAccess].slice(-300),
      timeline: [...(dataStore.settings?.timeline || []), ...finalTimeline].slice(-800),
    };
  }
  
  // Lancamentos ja chegam mapeados pelo frontend (Opcoes + Caixa).
  // Persistir diretamente evita remapeamento incorreto entre lojas.
  if (lancamentos) {
    dataStore.lancamentos = lancamentos;
  }
  
  saveDataToFile(dataStore);
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// Carregar dados do AppContext (sem userId, sincroniza tudo)
app.get('/api/sync/load', (_req: Request, res: Response) => {
  const sanitizeLogs = (items: any[] = []) =>
    items.map((item) => ({
      ...item,
      details: sanitizeLogText(item?.details),
      description: sanitizeLogText(item?.description),
      userName: sanitizeLogText(item?.userName),
      field: sanitizeLogText(item?.field),
    }));

  res.json({
    success: true,
    data: {
      settings: {
        ...(dataStore.settings || {}),
        accessLogs: sanitizeLogs(dataStore.settings?.accessLogs || []),
        timeline: sanitizeLogs(dataStore.settings?.timeline || []),
      },
      stores: dataStore.stores || {},
      debts: dataStore.debts || [],
      saldoDia: dataStore.saldoDia || 0,
      caixa: dataStore.caixa || {},
      fechamento: dataStore.fechamento || {},
      lancamentos: dataStore.lancamentos || {},
    },
    timestamp: new Date().toISOString()
  });
});

// Rota alternativa com userId (para compatibilidade)
app.get('/api/sync/load/:userId', (_req: Request, res: Response) => {
  const sanitizeLogs = (items: any[] = []) =>
    items.map((item) => ({
      ...item,
      details: sanitizeLogText(item?.details),
      description: sanitizeLogText(item?.description),
      userName: sanitizeLogText(item?.userName),
      field: sanitizeLogText(item?.field),
    }));

  res.json({
    success: true,
    data: {
      settings: {
        ...(dataStore.settings || {}),
        accessLogs: sanitizeLogs(dataStore.settings?.accessLogs || []),
        timeline: sanitizeLogs(dataStore.settings?.timeline || []),
      },
      stores: dataStore.stores || {},
      debts: dataStore.debts || [],
      saldoDia: dataStore.saldoDia || 0,
      caixa: dataStore.caixa || {},
      fechamento: dataStore.fechamento || {},
      lancamentos: dataStore.lancamentos || {},
    },
    timestamp: new Date().toISOString()
  });
});

// ==================== SYNC ENDPOINTS (Desktop App) ====================

// Health check para o programa desktop
app.get('/api/sync/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Adicionar anotação
app.post('/api/sync/annotation/add', (req: Request, res: Response) => {
  try {
    const { storeId, date, annotation } = req.body;
    console.log('[Server] Recebendo anotação:', { storeId, date, annotation });
    
    if (!dataStore.caixa[storeId]) {
      dataStore.caixa[storeId] = {};
    }
    if (!dataStore.caixa[storeId][date]) {
      dataStore.caixa[storeId][date] = { annotations: [] };
    }
    
    const newAnnotation = {
      id: Date.now(),
      ...annotation,
      createdAt: new Date().toISOString(),
    };
    
    dataStore.caixa[storeId][date].annotations.push(newAnnotation);
    saveDataToFile(dataStore);
    console.log('[Server] Anotação adicionada com sucesso:', newAnnotation);
    
    res.json({ success: true, data: newAnnotation });
  } catch (error) {
    console.error('[Server] Erro ao adicionar anotação:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Atualizar anotação
app.post('/api/sync/annotation/update', (req: Request, res: Response) => {
  try {
    const { storeId, date, id, annotation } = req.body;
    
    if (dataStore.caixa[storeId] && dataStore.caixa[storeId][date]) {
      const annotations = dataStore.caixa[storeId][date].annotations || [];
      const index = annotations.findIndex((a: any) => a.id == id);
      
      if (index !== -1) {
        const previous = { ...annotations[index] };
        annotations[index] = { ...annotations[index], ...annotation, updatedAt: new Date().toISOString() };
        const oldValue = toNum(previous?.valor);
        const newValue = toNum(annotations[index]?.valor);
        appendProgramAudit(
          storeId,
          'update',
          'caixa',
          date,
          `${storeId.toUpperCase()} ${date} editou item em ${annotations[index]?.categoria || 'categoria'} | descricao: ${previous?.descricao || '-'} -> ${annotations[index]?.descricao || '-'} | Valor: R$ ${oldValue.toFixed(2)} -> R$ ${newValue.toFixed(2)}`,
          annotations[index]?.categoria || 'anotacao',
          oldValue,
          newValue
        );
        saveDataToFile(dataStore);
        res.json({ success: true, data: annotations[index] });
      } else {
        res.status(404).json({ success: false, error: 'Anotação não encontrada' });
      }
    } else {
      res.status(404).json({ success: false, error: 'Data ou loja não encontrada' });
    }
  } catch (error) {
    console.error('[Server] Erro ao atualizar anotação:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Deletar anotação
app.post('/api/sync/annotation/delete', (req: Request, res: Response) => {
  try {
    const { storeId, date, id } = req.body;
    
    if (dataStore.caixa[storeId] && dataStore.caixa[storeId][date]) {
      const annotations = dataStore.caixa[storeId][date].annotations || [];
      const index = annotations.findIndex((a: any) => a.id == id);
      
      if (index !== -1) {
        const removed = annotations[index];
        const removedValue = toNum(removed?.valor);
        annotations.splice(index, 1);
        appendProgramAudit(
          storeId,
          'delete',
          'caixa',
          date,
          `${storeId.toUpperCase()} ${date} excluiu item em ${removed?.categoria || 'categoria'} | descricao: ${removed?.descricao || '-'} | Valor: R$ ${removedValue.toFixed(2)}`
        );
        saveDataToFile(dataStore);
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: 'Anotação não encontrada' });
      }
    } else {
      res.status(404).json({ success: false, error: 'Data ou loja não encontrada' });
    }
  } catch (error) {
    console.error('[Server] Erro ao deletar anotação:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Salvar fechamento
app.post('/api/sync/closing/save', (req: Request, res: Response) => {
  try {
    const { storeId, date, closing } = req.body;
    console.log('[Server] Recebendo fechamento:', { storeId, date, closing });
    
    if (!dataStore.fechamento[storeId]) {
      dataStore.fechamento[storeId] = {};
    }
    
    dataStore.fechamento[storeId][date] = {
      ...closing,
      updatedAt: new Date().toISOString(),
    };
    
    saveDataToFile(dataStore);
    console.log('[Server] Fechamento salvo com sucesso');
    
    res.json({ success: true, data: dataStore.fechamento[storeId][date] });
  } catch (error) {
    console.error('[Server] Erro ao salvar fechamento:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Obter anotações de uma data
app.get('/api/sync/annotations/:storeId/:date', (req: Request, res: Response) => {
  try {
    const { storeId, date } = req.params;
    
    if (dataStore.caixa[storeId] && dataStore.caixa[storeId][date]) {
      res.json({ success: true, data: dataStore.caixa[storeId][date].annotations || [] });
    } else {
      res.json({ success: true, data: [] });
    }
  } catch (error) {
    console.error('[Server] Erro ao obter anotações:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Obter fechamento de uma data
app.get('/api/sync/closing/:storeId/:date', (req: Request, res: Response) => {
  try {
    const { storeId, date } = req.params;
    
    if (dataStore.fechamento[storeId] && dataStore.fechamento[storeId][date]) {
      res.json({ success: true, data: dataStore.fechamento[storeId][date] });
    } else {
      res.json({ success: true, data: {} });
    }
  } catch (error) {
    console.error('[Server] Erro ao obter fechamento:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// ==================== STATIC FILES ====================
// Serve static files from dist/client in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'public');
  app.use(express.static(distPath));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Em desenvolvimento, redirecionar para Vite
  app.get('/', (req: Request, res: Response) => {
    const host = req.get('host') || 'localhost:5173';
    const ipAddress = host.split(':')[0];
    const viteUrl = `http://${ipAddress}:5173`;
    
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Financeiro DANADO</title>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <script type="module" src="${viteUrl}/@vite/client"><\/script>
          <script type="module" src="${viteUrl}/client/src/main.tsx"><\/script>
        </head>
        <body>
          <div id="root"><\/div>
        </body>
      </html>
    `);
  });
}

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Server] API available at http://0.0.0.0:${PORT}/api`);
});
