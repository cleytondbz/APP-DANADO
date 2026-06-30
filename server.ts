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
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';
const CLOUD_SYNC_URL = process.env.CLOUD_SYNC_URL || '';
const CLOUD_SYNC_TOKEN = process.env.CLOUD_SYNC_TOKEN || '';
const ENABLE_CLOUD_PUSH = process.env.ENABLE_CLOUD_PUSH === '1';
const CLOUD_KEEPALIVE_MS = Math.max(
  60_000,
  Number(process.env.CLOUD_KEEPALIVE_MS || 10 * 60_000),
);
const normalizeAuthValue = (v: unknown) =>
  String(v ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '');

const WEB_LOGIN_USER = normalizeAuthValue(process.env.WEB_LOGIN_USER || '');
const WEB_LOGIN_PASS = normalizeAuthValue(process.env.WEB_LOGIN_PASS || '');
const APP_BYPASS_TOKEN = process.env.APP_BYPASS_TOKEN || '';
const SESSION_COOKIE = 'danado_session';
const LOGS_DIR = path.resolve(process.cwd(), 'data', 'logs');
const SYNC_AUDIT_FILE = path.resolve(process.cwd(), 'data', 'sync-audit.log');
const CAIXA_MOVEMENTS_FILE = path.resolve(process.cwd(), 'data', 'caixa-movements.log');
const PURCHASE_MOVEMENTS_FILE = path.resolve(process.cwd(), 'data', 'purchase-movements.log');

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

const sanitizePurchaseSupplierDifTypes = (input: unknown): Record<string, 'D' | 'I' | 'F'> => {
  const out: Record<string, 'D' | 'I' | 'F'> = {};
  if (!input || typeof input !== 'object') return out;

  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    const normalizedKey = normalizeKey(String(key || ''));
    const type = String(value ?? '').trim().toUpperCase();
    if (normalizedKey && (type === 'D' || type === 'I' || type === 'F')) {
      out[normalizedKey] = type;
    }
  });

  return out;
};

const sanitizePurchaseOptionsForServer = (incoming: any = {}, current: any = {}) => {
  const hasIncomingMap = Object.prototype.hasOwnProperty.call(incoming || {}, 'supplierDifTypes');
  return {
    groups: uniqueNormalizedList(incoming?.groups || []),
    suppliers: uniqueNormalizedList(incoming?.suppliers || []),
    institutions: uniqueNormalizedList(incoming?.institutions || []),
    supplierDifTypes: hasIncomingMap
      ? sanitizePurchaseSupplierDifTypes(incoming?.supplierDifTypes)
      : sanitizePurchaseSupplierDifTypes(current?.supplierDifTypes),
  };
};

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLocalDateTimeString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
};

const mergeStoreBranch = (
  currentValue: Record<string, any> = {},
  incomingValue: Record<string, any> = {},
): Record<string, any> => {
  const next = { ...(currentValue || {}) };
  Object.entries(incomingValue || {}).forEach(([storeId, storePayload]) => {
    if (storePayload && typeof storePayload === 'object' && !Array.isArray(storePayload)) {
      next[storeId] = {
        ...(next[storeId] || {}),
        ...storePayload,
      };
    }
  });
  return next;
};

const logMonthFromPayload = (payload: Record<string, any>) => {
  const raw = String(payload?.ts || payload?.createdAt || payload?.timestamp || '');
  const dateMatch = raw.match(/^(\d{4})-(\d{2})/);
  if (dateMatch) return `${dateMatch[1]}-${dateMatch[2]}`;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const date = new Date(numeric);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const appendMonthlyLog = (type: 'sync-audit' | 'caixa-movements' | 'purchase-movements', payload: Record<string, any>) => {
  const monthKey = logMonthFromPayload(payload);
  const folder = path.join(LOGS_DIR, type);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  fs.appendFileSync(path.join(folder, `${type}-${monthKey}.log`), `${JSON.stringify(payload)}\n`, 'utf-8');
};

const appendSyncAudit = (payload: Record<string, any>) => {
  try {
    appendMonthlyLog('sync-audit', payload);
  } catch (e) {
    console.error('[SyncAudit] Falha ao gravar log:', e);
  }
};

const ensureSyncMeta = () => {
  if (!dataStore._syncMeta || typeof dataStore._syncMeta !== 'object') {
    dataStore._syncMeta = {};
  }
  if (!Number.isFinite(Number(dataStore._syncMeta.caixaFechamentoVersion))) {
    dataStore._syncMeta.caixaFechamentoVersion = 0;
  }
  return dataStore._syncMeta;
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

const appendCaixaMovementLog = (payload: Record<string, any>) => {
  try {
    appendMonthlyLog('caixa-movements', payload);
  } catch (e) {
    console.error('[CaixaMovements] Falha ao gravar log:', e);
  }
};

const appendPurchaseMovementLog = (payload: Record<string, any>) => {
  try {
    appendMonthlyLog('purchase-movements', payload);
  } catch (e) {
    console.error('[PurchaseMovements] Falha ao gravar log:', e);
  }
};

const compactPurchaseEntry = (entry: any) => ({
  id: sanitizeLogText(entry?.id),
  dueDate: sanitizeLogText(entry?.dueDate),
  group: sanitizeLogText(entry?.group),
  supplier: sanitizeLogText(entry?.supplier),
  documentNumber: sanitizeLogText(entry?.documentNumber),
  issueDate: sanitizeLogText(entry?.issueDate),
  installments: sanitizeLogText(entry?.installments),
  amount: Number(entry?.amount || 0),
  paidDate: sanitizeLogText(entry?.paidDate),
  financialInstitution: sanitizeLogText(entry?.financialInstitution),
  difType: sanitizeLogText(entry?.difType),
});

const purchaseEntryLogKey = (entry: any) => sanitizeLogText(entry?.id) || purchaseEntrySignature(entry);

const summarizePurchaseEntries = (entries: Record<string, any[]> = {}) =>
  Object.entries(entries || {}).map(([monthKey, list]) => {
    const items = Array.isArray(list) ? list : [];
    const paidTotal = items.reduce((sum, item) => sum + (item?.paidDate ? Number(item?.amount || 0) : 0), 0);
    const total = items.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
    return {
      monthKey,
      count: items.length,
      total,
      paidTotal,
      pendingTotal: total - paidTotal,
    };
  });

const diffPurchaseEntries = (
  current: Record<string, any[]> = {},
  incoming: Record<string, any[]> = {},
) => {
  const months = Array.from(new Set([...Object.keys(current || {}), ...Object.keys(incoming || {})])).sort();
  return months.map((monthKey) => {
    const currentItems = Array.isArray(current?.[monthKey]) ? current[monthKey] : [];
    const incomingItems = Array.isArray(incoming?.[monthKey]) ? incoming[monthKey] : [];
    const currentMap = new Map<string, any>();
    const incomingMap = new Map<string, any>();
    currentItems.forEach((entry) => currentMap.set(purchaseEntryLogKey(entry), entry));
    incomingItems.forEach((entry) => incomingMap.set(purchaseEntryLogKey(entry), entry));

    const added: any[] = [];
    const removed: any[] = [];
    const changed: any[] = [];

    incomingMap.forEach((entry, key) => {
      if (!currentMap.has(key)) {
        added.push(compactPurchaseEntry(entry));
        return;
      }
      const currentEntry = currentMap.get(key);
      if (JSON.stringify(currentEntry) !== JSON.stringify(entry)) {
        changed.push({
          before: compactPurchaseEntry(currentEntry),
          after: compactPurchaseEntry(entry),
        });
      }
    });

    currentMap.forEach((entry, key) => {
      if (!incomingMap.has(key)) removed.push(compactPurchaseEntry(entry));
    });

    return {
      monthKey,
      beforeCount: currentItems.length,
      incomingCount: incomingItems.length,
      addedCount: added.length,
      removedCount: removed.length,
      changedCount: changed.length,
      added: added.slice(0, 40),
      removed: removed.slice(0, 40),
      changed: changed.slice(0, 40),
    };
  }).filter((item) => item.addedCount || item.removedCount || item.changedCount || item.beforeCount !== item.incomingCount);
};

const summarizePurchaseOptions = (options: any = {}) => ({
  groups: Array.isArray(options?.groups) ? options.groups.length : 0,
  suppliers: Array.isArray(options?.suppliers) ? options.suppliers.length : 0,
  institutions: Array.isArray(options?.institutions) ? options.institutions.length : 0,
});

const findFirstStringByKeyPatterns = (obj: any, patterns: RegExp[], maxDepth = 4): string => {
  const seen = new Set<any>();
  const visit = (value: any, depth: number): string => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > maxDepth) return '';
    seen.add(value);

    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && patterns.some((p) => p.test(String(k)))) {
        const clean = sanitizeLogText(v);
        if (clean) return clean;
      }
      if (typeof v === 'number' && patterns.some((p) => p.test(String(k)))) {
        const clean = sanitizeLogText(String(v));
        if (clean) return clean;
      }
    }
    for (const v of Object.values(value)) {
      const found = visit(v, depth + 1);
      if (found) return found;
    }
    return '';
  };
  return visit(obj, 0);
};

const resolveActionUserName = (
  actionUsers: Array<{ name?: string; password?: string }> = [],
  payload: any = {},
): string => {
  const fromPayload = sanitizeLogText(
    payload?.userName ||
      payload?.username ||
      payload?.user ||
      payload?.actionUserName ||
      payload?.action_user_name ||
      payload?.actorName ||
      payload?.actor ||
      payload?.usuario ||
      payload?.usuarioAcao ||
      payload?.nomeUsuario ||
      payload?.nomeUsuarioAcao ||
      payload?.usuario_acao ||
      payload?.responsavel ||
      payload?.responsável ||
      payload?.nomeDigital ||
      payload?.nome_digital ||
      payload?.operador
  );
  if (fromPayload && fromPayload.toUpperCase() !== 'PROGRAMA') return fromPayload;

  const deepUserName = findFirstStringByKeyPatterns(payload, [
    /user.?name/i,
    /action.?user/i,
    /actor/i,
    /usuario/i,
    /operador/i,
    /responsavel/i,
    /nome/i,
    /login/i,
  ]);
  if (deepUserName && deepUserName.toUpperCase() !== 'PROGRAMA') return deepUserName;

  const passwordCandidate = String(
    payload?.password ||
      payload?.pass ||
      payload?.actionPassword ||
      payload?.action_password ||
      payload?.userPassword ||
      payload?.user_password ||
      payload?.senha ||
      payload?.senhaAcao ||
      payload?.senha_acao ||
      payload?.senhaUsuario ||
      payload?.senhaUsuarioAcao ||
      payload?.senha_usuario_acao ||
      findFirstStringByKeyPatterns(payload, [/senha/i, /pass/i, /password/i]) ||
      ''
  ).trim();
  if (!passwordCandidate) return 'PROGRAMA';

  const matchedUser = actionUsers.find((u) => String(u?.password || '').trim() === passwordCandidate);
  return sanitizeLogText(matchedUser?.name || 'PROGRAMA') || 'PROGRAMA';
};

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

const CAIXA_ITEM_CATEGORIES = ['dinheiro', 'pix', 'cartao', 'boleto'] as const;

const summarizeCaixaPayload = (payload: Record<string, any> = {}) =>
  Object.entries(payload || {}).flatMap(([storeId, storePayload]) => {
    if (!storePayload || typeof storePayload !== 'object' || Array.isArray(storePayload)) return [];
    return Object.entries(storePayload).map(([date, dayPayload]) => {
      const counts: Record<string, number> = {};
      CAIXA_ITEM_CATEGORIES.forEach((category) => {
        counts[category] = Array.isArray((dayPayload as any)?.[category])
          ? (dayPayload as any)[category].length
          : 0;
      });
      return { storeId, date, counts };
    });
  });

const normalizeCaixaCategory = (value: any) => {
  const key = normalizeKey(value).replace(/[^A-Z0-9]/g, '');
  if (key === 'CARTAO' || key === 'CARTAOJB') return 'cartao';
  if (key === 'DINHEIRO') return 'dinheiro';
  if (key === 'PIX') return 'pix';
  if (key === 'BOLETO') return 'boleto';
  return String(value || '').trim().toLowerCase();
};

const getCaixaItemDescription = (item: any) =>
  sanitizeLogText(item?.descricao || item?.produto || item?.description || item?.name || '').trim();

const getCaixaItemQuantity = (item: any) => toNum(item?.quantidade ?? item?.qtd ?? item?.qty ?? 1) || 1;
const getCaixaItemValue = (item: any) => toNum(item?.valor ?? item?.value ?? item?.amount);
const getCaixaItemTotal = (item: any) => getCaixaItemQuantity(item) * getCaixaItemValue(item);

const getCaixaItemTimeKey = (item: any) =>
  sanitizeLogText(item?.hora || item?.time || item?.createdAt || item?.created_at || item?.timestamp || '');

const getCaixaItemKey = (item: any) => {
  const rawId = item?.id ?? item?._id ?? item?.uuid;
  if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '') {
    return `id:${String(rawId).trim()}`;
  }

  return [
    'sig',
    normalizeKey(getCaixaItemDescription(item)),
    getCaixaItemQuantity(item).toFixed(4),
    getCaixaItemValue(item).toFixed(4),
    getCaixaItemTimeKey(item),
  ].join('|');
};

const incrementKeyCount = (map: Map<string, number>, key: string) => {
  map.set(key, (map.get(key) || 0) + 1);
};

const consumeKeyCount = (map: Map<string, number>, key: string) => {
  const count = map.get(key) || 0;
  if (count <= 0) return false;
  if (count === 1) map.delete(key);
  else map.set(key, count - 1);
  return true;
};

const normalizeNumericText = (value: any) => String(value ?? '').replace(/[^\d]/g, '');

const normalizeCaixaDateKey = (value: any) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  return raw;
};

const normalizeStoreKey = (value: any) => {
  const key = normalizeKey(value).replace(/[^A-Z0-9]/g, '');
  if (key === 'LOJA1' || key === '1') return 'loja1';
  if (key === 'LOJA2' || key === '2') return 'loja2';
  return String(value ?? '').trim().toLowerCase();
};

const programDeleteEventMatchesItem = (
  event: any,
  ctx: { storeId: string; date: string; category: string; item: any },
) => {
  if (!event || typeof event !== 'object') return false;
  const details = sanitizeLogText(event.details || event.description || event.descricao || '');
  const detailsKey = normalizeKey(details);
  const actionKey = normalizeKey([
    event.action,
    event.type,
    event.operacao,
    event.operation,
    event.acao,
    event.tipoAcao,
    event.actionType,
    event.kind,
    event.event,
    event.status,
    event.label,
    details,
  ].filter(Boolean).join(' '));
  if (!actionKey.includes('DELETE') && !actionKey.includes('EXCL') && !actionKey.includes('REMOV')) return false;

  const actionUsers = Array.isArray(dataStore.settings?.actionUsers) ? dataStore.settings.actionUsers : [];
  const resolvedUser = resolveActionUserName(actionUsers, event);
  if (!resolvedUser || normalizeKey(resolvedUser) === 'PROGRAMA') return false;

  const eventStore = normalizeStoreKey(event.storeId || event.store || event.loja);
  if (eventStore && eventStore !== normalizeStoreKey(ctx.storeId)) return false;

  const eventDate = normalizeCaixaDateKey(event.date || event.data || event.day);
  if (eventDate && eventDate !== normalizeCaixaDateKey(ctx.date)) return false;

  const eventCategory = normalizeCaixaCategory(event.field || event.category || event.categoria || event.tipo || event.typeName);
  const categoryLabelKey = normalizeKey(ctx.category);
  if (eventCategory && eventCategory !== ctx.category && !detailsKey.includes(categoryLabelKey)) return false;

  const itemId = String(ctx.item?.id ?? ctx.item?._id ?? ctx.item?.uuid ?? '').trim();
  const eventItemId = String(event.itemId ?? event.annotationId ?? event.productId ?? event.idItem ?? '').trim();
  if (itemId && eventItemId && itemId === eventItemId) return true;

  const descKey = normalizeKey(getCaixaItemDescription(ctx.item));
  const amountDigits = normalizeNumericText(getCaixaItemTotal(ctx.item).toFixed(2));
  const eventAmountDigits = normalizeNumericText(
    event.oldValue ?? event.value ?? event.valor ?? event.amount ?? event.total ?? details,
  );
  const hasDescriptionMatch =
    !!descKey &&
    (detailsKey.includes(descKey) ||
      normalizeKey(event.descricao || event.description || event.produto || event.product || event.name).includes(descKey));
  const hasAmountMatch = amountDigits && eventAmountDigits.includes(amountDigits);

  if (hasDescriptionMatch && hasAmountMatch) return true;
  if (hasDescriptionMatch && eventCategory === ctx.category) return true;
  if (hasAmountMatch && eventCategory === ctx.category && !detailsKey && !descKey) return true;
  return false;
};

function mergeProgramCaixaBranch(
  currentValue: Record<string, any> = {},
  incomingValue: Record<string, any> = {},
  context: { programAuditEvents?: any[]; clientId?: string; machineName?: string } = {},
): Record<string, any> {
  const next = mergeStoreBranch(currentValue || {}, incomingValue || {});
  const events = Array.isArray(context.programAuditEvents) ? context.programAuditEvents : [];

  Object.entries(incomingValue || {}).forEach(([storeId, storePayload]) => {
    if (!storePayload || typeof storePayload !== 'object' || Array.isArray(storePayload)) return;
    const currentStore = currentValue?.[storeId] || {};
    const nextStore = next?.[storeId] || {};

    Object.entries(storePayload).forEach(([date, incomingDay]) => {
      if (!incomingDay || typeof incomingDay !== 'object' || Array.isArray(incomingDay)) return;
      const currentDay = currentStore?.[date] || {};
      const nextDay = nextStore?.[date] || {};

      CAIXA_ITEM_CATEGORIES.forEach((category) => {
        if (!Object.prototype.hasOwnProperty.call(incomingDay, category)) return;
        const currentItems = Array.isArray(currentDay?.[category]) ? currentDay[category] : [];
        const incomingItems = Array.isArray((incomingDay as any)?.[category]) ? (incomingDay as any)[category] : [];
        const incomingKeyCounts = new Map<string, number>();
        incomingItems.forEach((item: any) => {
          incrementKeyCount(incomingKeyCounts, getCaixaItemKey(item));
        });
        const restoredItems: any[] = [];

        currentItems.forEach((item: any) => {
          const itemKey = getCaixaItemKey(item);
          if (consumeKeyCount(incomingKeyCounts, itemKey)) return;

          const hasExplicitDelete = events.some((event) =>
            programDeleteEventMatchesItem(event, { storeId, date, category, item })
          );
          if (hasExplicitDelete) return;

          const hasDeleteEvent = events.some((event) => {
            const actionKey = normalizeKey([
              event?.action,
              event?.type,
              event?.operacao,
              event?.operation,
              event?.acao,
              event?.tipoAcao,
              event?.actionType,
              event?.kind,
              event?.event,
              event?.status,
              event?.label,
              event?.details,
            ].filter(Boolean).join(' '));
            return actionKey.includes('DELETE') || actionKey.includes('EXCL') || actionKey.includes('REMOV');
          });
          if (hasDeleteEvent) {
            appendSyncAudit({
              ts: getLocalDateTimeString(),
              event: 'program_delete_event_not_matched',
              source: 'program',
              storeId,
              date,
              category,
              itemKey,
              description: getCaixaItemDescription(item),
              total: Number(getCaixaItemTotal(item).toFixed(2)),
              clientId: sanitizeLogText(context.clientId),
              machineName: sanitizeLogText(context.machineName),
              sampleEvents: events.slice(-5).map((event: any) => ({
                action: sanitizeLogText(event?.action),
                storeId: sanitizeLogText(event?.storeId || event?.store || event?.loja),
                date: sanitizeLogText(event?.date || event?.data || event?.day),
                field: sanitizeLogText(event?.field || event?.category || event?.categoria || event?.tipo || event?.typeName),
                details: sanitizeLogText(event?.details || event?.description || event?.descricao),
                oldValue: event?.oldValue,
                value: event?.value ?? event?.valor ?? event?.amount ?? event?.total,
                userName: sanitizeLogText(event?.userName || event?.usuario || event?.user || event?.actionUserName),
              })),
            });
          }

          restoredItems.push(item);
          appendSyncAudit({
            ts: getLocalDateTimeString(),
            event: 'prevented_program_implicit_delete',
            source: 'program',
            storeId,
            date,
            category,
            itemKey,
            description: getCaixaItemDescription(item),
            total: Number(getCaixaItemTotal(item).toFixed(2)),
            clientId: sanitizeLogText(context.clientId),
            machineName: sanitizeLogText(context.machineName),
            currentCount: currentItems.length,
            incomingCount: incomingItems.length,
          });
          appendCaixaMovementLog({
            ts: getLocalDateTimeString(),
            event: 'server_restored_missing_item',
            reason: 'incoming_program_payload_removed_item_without_matching_delete_event',
            source: 'program',
            storeId,
            date,
            category,
            itemKey,
            description: getCaixaItemDescription(item),
            total: Number(getCaixaItemTotal(item).toFixed(2)),
            clientId: sanitizeLogText(context.clientId),
            machineName: sanitizeLogText(context.machineName),
            currentCount: currentItems.length,
            incomingCount: incomingItems.length,
          });
        });

        if (restoredItems.length > 0) {
          next[storeId] = { ...(next[storeId] || {}) };
          next[storeId][date] = { ...(next[storeId][date] || {}) };
          next[storeId][date][category] = [...incomingItems, ...restoredItems];
        }
      });
    });
  });

  return next;
}

function buildProgramCaixaMergeSummary(
  beforeValue: Record<string, any> = {},
  incomingValue: Record<string, any> = {},
  afterValue: Record<string, any> = {},
) {
  const summaries: any[] = [];

  Object.entries(incomingValue || {}).forEach(([storeId, storePayload]) => {
    if (!storePayload || typeof storePayload !== 'object' || Array.isArray(storePayload)) return;

    Object.entries(storePayload).forEach(([date, incomingDay]) => {
      if (!incomingDay || typeof incomingDay !== 'object' || Array.isArray(incomingDay)) return;

      CAIXA_ITEM_CATEGORIES.forEach((category) => {
        if (!Object.prototype.hasOwnProperty.call(incomingDay, category)) return;

        const beforeItems = Array.isArray(beforeValue?.[storeId]?.[date]?.[category])
          ? beforeValue[storeId][date][category]
          : [];
        const incomingItems = Array.isArray((incomingDay as any)?.[category])
          ? (incomingDay as any)[category]
          : [];
        const afterItems = Array.isArray(afterValue?.[storeId]?.[date]?.[category])
          ? afterValue[storeId][date][category]
          : [];

        summaries.push({
          storeId,
          date,
          category,
          beforeCount: beforeItems.length,
          incomingCount: incomingItems.length,
          afterCount: afterItems.length,
          beforeTotal: Number(beforeItems.reduce((sum: number, item: any) => sum + getCaixaItemTotal(item), 0).toFixed(2)),
          incomingTotal: Number(incomingItems.reduce((sum: number, item: any) => sum + getCaixaItemTotal(item), 0).toFixed(2)),
          afterTotal: Number(afterItems.reduce((sum: number, item: any) => sum + getCaixaItemTotal(item), 0).toFixed(2)),
        });
      });
    });
  });

  return summaries;
}

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
  userName?: string,
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
    userName: sanitizeLogText(userName || 'PROGRAMA') || 'PROGRAMA',
    details: sanitizeLogText(details),
    date,
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

function buildUserContextFromObjects(...sources: any[]) {
  const merged: Record<string, any> = {};
  sources.forEach((src) => {
    if (!src || typeof src !== 'object') return;
    Object.assign(merged, src);
  });
  return merged;
}

function appendProgramAuditEvents(events: any[] = []) {
  if (!Array.isArray(events) || events.length === 0) return;

  const existingAccessSignatures = new Set<string>(
    (dataStore.settings?.accessLogs || []).map((x: any) =>
      [
        String(x?.storeId || ''),
        String(x?.action || ''),
        String(x?.date || ''),
        String(x?.details || ''),
        String(x?.timestamp || ''),
      ].join('|')
    )
  );
  const existingTimelineSignatures = new Set<string>(
    (dataStore.settings?.timeline || []).map((x: any) =>
      [
        String(x?.storeId || ''),
        String(x?.action || ''),
        String(x?.module || ''),
        String(x?.date || ''),
        String(x?.description || ''),
        String(x?.timestamp || ''),
      ].join('|')
    )
  );
  const accessToAdd: any[] = [];
  const timelineToAdd: any[] = [];

  const actionUsers = Array.isArray(dataStore.settings?.actionUsers) ? dataStore.settings.actionUsers : [];
  events.forEach((ev: any, idx: number) => {
    if (!ev || !ev.storeId || !ev.action || !ev.details) return;
    const baseId = String(ev.id || `program_evt_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`);
    const ts = Number(ev.timestamp) || Date.now();
    const safeDetails = sanitizeLogText(ev.details);
    const accessId = `${baseId}_a`;
    const timelineId = `${baseId}_t`;
    const accessSignature = [String(ev.storeId), String(ev.action), String(ev.date || ''), safeDetails, String(ts)].join('|');
    const timelineAction = ev.action === 'delete' ? 'delete' : 'update';
    const timelineModule = ev.module || 'caixa';
    const timelineSignature = [
      String(ev.storeId),
      String(timelineAction),
      String(timelineModule),
      String(ev.date || ''),
      safeDetails,
      String(ts),
    ].join('|');

    const resolvedUserName = resolveActionUserName(actionUsers, ev);
    const effectiveUserName = resolvedUserName && resolvedUserName.toUpperCase() !== 'PROGRAMA'
      ? resolvedUserName
      : resolveActionUserName(actionUsers, { ...ev, ...(dataStore.settings || {}) });
    if (!existingAccessSignatures.has(accessSignature)) {
      accessToAdd.push({
        id: accessId,
        timestamp: ts,
        storeId: ev.storeId,
        action: ev.action === 'delete' ? 'delete' : 'edit',
        status: 'success',
        userName: effectiveUserName,
        details: safeDetails,
        date: ev.date,
      });
      existingAccessSignatures.add(accessSignature);
    }

    if (!existingTimelineSignatures.has(timelineSignature)) {
      timelineToAdd.push({
        id: timelineId,
        timestamp: ts,
        module: timelineModule,
        storeId: ev.storeId,
        action: timelineAction,
        date: ev.date,
        field: ev.field,
        oldValue: ev.oldValue,
        newValue: ev.newValue,
        description: safeDetails,
      });
      existingTimelineSignatures.add(timelineSignature);
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
  const buildCountedItemMap = (items: any[] = []) => {
    const seen = new Map<string, number>();
    const map = new Map<string, any>();
    items.forEach((item) => {
      const baseKey = getCaixaItemKey(item);
      const occurrence = seen.get(baseKey) || 0;
      seen.set(baseKey, occurrence + 1);
      map.set(`${baseKey}#${occurrence}`, item);
    });
    return map;
  };

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
        const oldMap = buildCountedItemMap(oldItems);
        const newMap = buildCountedItemMap(newItems);
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
const DATA_DIR = path.dirname(DATA_FILE);
const CLOUD_SYNC_QUEUE_FILE = path.join(path.dirname(DATA_FILE), 'cloud-sync-pending.json');
const DAILY_BACKUP_DIR = path.resolve(process.cwd(), 'backups-diarios');
let lastDailyBackupDate = '';

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (error) {
  console.error('[Server] Erro ao preparar pasta de dados:', error);
}

// Função para carregar dados do arquivo
const SPLIT_STORAGE_VERSION = 1;
const splitDirs = {
  caixa: path.join(DATA_DIR, 'caixa'),
  fechamento: path.join(DATA_DIR, 'fechamento'),
  lancamentos: path.join(DATA_DIR, 'lancamentos'),
  compras: path.join(DATA_DIR, 'compras'),
};

const pad2 = (value: number | string) => String(value).padStart(2, '0');

function safeFilePart(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'sem-chave';
}

function safeWriteJson(filePath: string, data: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readJsonFile(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`[Storage] Erro ao ler ${filePath}:`, error);
    return null;
  }
}

function listJsonFiles(dir: string) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .map((name) => path.join(dir, name));
  } catch (error) {
    console.error(`[Storage] Erro ao listar ${dir}:`, error);
    return [];
  }
}

function clearJsonFiles(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  for (const filePath of listJsonFiles(dir)) fs.unlinkSync(filePath);
}

function periodFromDate(dateKey: string, mode: 'semester' | 'year' | 'month') {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})/);
  const year = match?.[1] || 'sem-ano';
  const month = Number(match?.[2] || 1);
  if (mode === 'month') return `${year}-${pad2(month)}`;
  if (mode === 'year') return year;
  return `${year}-${month <= 6 ? '01_06' : '07_12'}`;
}

function splitStoreDateBranch(branch: any, mode: 'semester' | 'year') {
  const grouped: Record<string, any> = {};
  if (!branch || typeof branch !== 'object') return grouped;
  for (const [storeId, byDate] of Object.entries(branch)) {
    if (!byDate || typeof byDate !== 'object') continue;
    for (const [dateKey, value] of Object.entries(byDate as Record<string, any>)) {
      const period = periodFromDate(dateKey, mode);
      const fileKey = `${safeFilePart(storeId)}-${period}`;
      grouped[fileKey] ||= {};
      grouped[fileKey][storeId] ||= {};
      grouped[fileKey][storeId][dateKey] = value;
    }
  }
  return grouped;
}

function writeStoreDateBranch(dir: string, branch: any, mode: 'semester' | 'year') {
  clearJsonFiles(dir);
  const grouped = splitStoreDateBranch(branch, mode);
  for (const [fileKey, payload] of Object.entries(grouped)) {
    safeWriteJson(path.join(dir, `${fileKey}.json`), payload);
  }
}

function readStoreDateBranch(dir: string) {
  const merged: Record<string, any> = {};
  for (const filePath of listJsonFiles(dir)) {
    const payload = readJsonFile(filePath);
    if (!payload || typeof payload !== 'object') continue;
    for (const [storeId, byDate] of Object.entries(payload)) {
      merged[storeId] ||= {};
      Object.assign(merged[storeId], byDate || {});
    }
  }
  return merged;
}

function splitPurchaseEntriesByYear(purchaseEntries: any) {
  const grouped: Record<string, any> = {};
  if (!purchaseEntries || typeof purchaseEntries !== 'object') return grouped;
  for (const [monthKey, entries] of Object.entries(purchaseEntries)) {
    const year = String(monthKey).match(/^(\d{4})-/)?.[1] || 'sem-ano';
    grouped[year] ||= {};
    grouped[year][monthKey] = entries;
  }
  return grouped;
}

function writePurchaseEntries(purchaseEntries: any) {
  clearJsonFiles(splitDirs.compras);
  const grouped = splitPurchaseEntriesByYear(purchaseEntries);
  for (const [year, payload] of Object.entries(grouped)) {
    safeWriteJson(path.join(splitDirs.compras, `compras-${safeFilePart(year)}.json`), payload);
  }
}

function readPurchaseEntries() {
  const merged: Record<string, any> = {};
  for (const filePath of listJsonFiles(splitDirs.compras)) {
    const payload = readJsonFile(filePath);
    if (!payload || typeof payload !== 'object') continue;
    Object.assign(merged, payload);
  }
  return merged;
}

function readPurchaseEntriesByYear(year: string | number) {
  const filePath = path.join(splitDirs.compras, `compras-${safeFilePart(year)}.json`);
  const payload = readJsonFile(filePath);
  return payload && typeof payload === 'object' ? payload : {};
}

function readPurchaseEntriesByMonth(monthKey: string) {
  const year = String(monthKey || '').match(/^(\d{4})-\d{2}$/)?.[1];
  if (!year) return [];
  const yearEntries = readPurchaseEntriesByYear(year);
  const entries = (yearEntries as Record<string, any[]>)[monthKey];
  return Array.isArray(entries) ? entries : [];
}

function readStoreDateBranchPeriod(dir: string, storeId: string, period: string) {
  const filePath = path.join(dir, `${safeFilePart(storeId)}-${safeFilePart(period)}.json`);
  const payload = readJsonFile(filePath);
  if (!payload || typeof payload !== 'object') return {};
  return (payload as Record<string, any>)[storeId] || {};
}

function filterStoreDateBranchByMonth(branch: Record<string, any>, monthKey: string) {
  const out: Record<string, any> = {};
  Object.entries(branch || {}).forEach(([dateKey, value]) => {
    if (String(dateKey).startsWith(`${monthKey}-`)) out[dateKey] = value;
  });
  return out;
}

function sanitizeSettingsForBootstrap(settings: any = {}) {
  const light = { ...(settings || {}) };
  delete light.purchaseEntries;
  return {
    ...light,
    accessLogs: (light.accessLogs || []).map((item: any) => ({
      ...item,
      details: sanitizeLogText(item?.details),
      description: sanitizeLogText(item?.description),
      userName: sanitizeLogText(item?.userName),
      field: sanitizeLogText(item?.field),
    })),
    timeline: (light.timeline || []).map((item: any) => ({
      ...item,
      details: sanitizeLogText(item?.details),
      description: sanitizeLogText(item?.description),
      userName: sanitizeLogText(item?.userName),
      field: sanitizeLogText(item?.field),
    })),
  };
}

function buildLightDataFile(data: Record<string, any>) {
  const settings = { ...(data.settings || {}) };
  delete (settings as any).purchaseEntries;
  const light = {
    ...data,
    settings,
    _storage: {
      version: SPLIT_STORAGE_VERSION,
      split: true,
      updatedAt: getLocalDateTimeString(),
      folders: {
        caixa: 'data/caixa',
        fechamento: 'data/fechamento',
        lancamentos: 'data/lancamentos',
        compras: 'data/compras',
      },
    },
  };
  delete (light as any).caixa;
  delete (light as any).fechamento;
  delete (light as any).lancamentos;
  return light;
}

function materializeSplitData(baseData: Record<string, any>) {
  const caixa = readStoreDateBranch(splitDirs.caixa);
  const fechamento = readStoreDateBranch(splitDirs.fechamento);
  const lancamentos = readStoreDateBranch(splitDirs.lancamentos);
  const purchaseEntries = readPurchaseEntries();
  const settings = { ...(baseData.settings || {}) };
  if (Object.keys(purchaseEntries).length > 0) settings.purchaseEntries = purchaseEntries;
  return {
    ...baseData,
    settings,
    caixa,
    fechamento,
    lancamentos,
  };
}

function loadDataFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return materializeSplitData(JSON.parse(data));
    }
  } catch (error) {
    console.error('[Server] Erro ao carregar dados:', error);
  }
  return null;
}

// Função para salvar dados no arquivo
function saveDataToFile(data: Record<string, any>) {
  try {
    writeStoreDateBranch(splitDirs.caixa, data.caixa || {}, 'semester');
    writeStoreDateBranch(splitDirs.fechamento, data.fechamento || {}, 'year');
    writeStoreDateBranch(splitDirs.lancamentos, data.lancamentos || {}, 'year');
    writePurchaseEntries(data.settings?.purchaseEntries || {});
    safeWriteJson(DATA_FILE, buildLightDataFile(data));
    scheduleCloudPush();
  } catch (error) {
    console.error('[Server] Erro ao salvar dados:', error);
  }
}

function createDailyBackup(reason = 'automatico') {
  try {
    const now = new Date();
    const pad = (value: number, size = 2) => String(value).padStart(size, '0');
    const dateKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeKey = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const unique = Math.random().toString(36).slice(2, 8);
    fs.mkdirSync(DAILY_BACKUP_DIR, { recursive: true });
    const fileName = `backup-completo-${dateKey}_${timeKey}-${unique}.json`;
    const filePath = path.join(DAILY_BACKUP_DIR, fileName);
    const snapshot = {
      backupType: 'completo-diario',
      reason,
      createdAt: getLocalDateTimeString(),
      sourceFile: DATA_FILE,
      data: dataStore,
    };
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    lastDailyBackupDate = dateKey;
    console.log(`[Backup] Backup diario criado: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('[Backup] Falha ao criar backup diario:', error);
    return null;
  }
}

function checkDailyBackupSchedule() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const dateKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (now.getHours() === 20 && now.getMinutes() === 0 && lastDailyBackupDate !== dateKey) {
    createDailyBackup('agendado-20h');
  }
}

type CloudSyncQueue = {
  id: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  payload: Record<string, any>;
};

let cloudPushTimer: NodeJS.Timeout | null = null;
let cloudPushInFlight = false;
let cloudPushQueued = false;
let cloudSyncQueue: CloudSyncQueue | null = null;

const createCloudSyncId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildCloudSyncPayload = (cloudSyncId: string) => ({
  cloudSyncId,
  source: 'site',
  settings: dataStore.settings || {},
  stores: dataStore.stores || {},
  debts: dataStore.debts || [],
  saldoDia: dataStore.saldoDia || 0,
  caixa: dataStore.caixa || {},
  fechamento: dataStore.fechamento || {},
  lancamentos: dataStore.lancamentos || {},
});

const persistCloudSyncQueue = () => {
  try {
    if (!cloudSyncQueue) {
      if (fs.existsSync(CLOUD_SYNC_QUEUE_FILE)) fs.unlinkSync(CLOUD_SYNC_QUEUE_FILE);
      return;
    }
    fs.mkdirSync(path.dirname(CLOUD_SYNC_QUEUE_FILE), { recursive: true });
    const tempFile = `${CLOUD_SYNC_QUEUE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(cloudSyncQueue, null, 2), 'utf-8');
    try {
      fs.renameSync(tempFile, CLOUD_SYNC_QUEUE_FILE);
    } catch {
      fs.copyFileSync(tempFile, CLOUD_SYNC_QUEUE_FILE);
      fs.unlinkSync(tempFile);
    }
  } catch (error) {
    console.error('[CloudSync] Falha ao persistir fila:', error);
  }
};

const loadCloudSyncQueue = () => {
  try {
    if (!fs.existsSync(CLOUD_SYNC_QUEUE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(CLOUD_SYNC_QUEUE_FILE, 'utf-8'));
    if (parsed?.id && parsed?.payload && typeof parsed.payload === 'object') {
      parsed.payload.cloudSyncId = parsed.id;
      cloudSyncQueue = {
        ...parsed,
        attempts: Number(parsed.attempts || 0),
        nextAttemptAt: Number(parsed.nextAttemptAt || 0),
      };
      console.log(`[${getLocalDateTimeString()}] [CloudSync] Envio pendente restaurado: ${cloudSyncQueue?.id}`);
    }
  } catch (error) {
    console.error('[CloudSync] Falha ao restaurar fila:', error);
  }
};

const cloudRetryDelay = (attempts: number) => {
  const steps = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
  return steps[Math.min(Math.max(attempts - 1, 0), steps.length - 1)];
};

function armCloudPush(delayMs: number) {
  if (!ENABLE_CLOUD_PUSH || !CLOUD_SYNC_URL || !CLOUD_SYNC_TOKEN) return;
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    cloudPushTimer = null;
    void pushDataToCloud();
  }, Math.max(0, delayMs));
}

async function pushDataToCloud() {
  if (!ENABLE_CLOUD_PUSH || !CLOUD_SYNC_URL || !CLOUD_SYNC_TOKEN || !cloudSyncQueue) return;
  if (cloudPushInFlight) {
    cloudPushQueued = true;
    return;
  }

  const queued = cloudSyncQueue;
  const waitMs = queued.nextAttemptAt - Date.now();
  if (waitMs > 0) {
    armCloudPush(waitMs);
    return;
  }

  cloudPushInFlight = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const resp = await fetch(CLOUD_SYNC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sync-token': CLOUD_SYNC_TOKEN,
        'x-cloud-sync-id': queued.id,
      },
      body: JSON.stringify(queued.payload),
      signal: controller.signal,
    });
    const responseText = await resp.text().catch(() => '');
    let responseBody: any = null;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = null;
    }

    const confirmed =
      resp.ok &&
      responseBody?.success === true &&
      responseBody?.cloudSyncId === queued.id;

    if (!confirmed) {
      throw new Error(
        `HTTP ${resp.status}; confirmacao=${String(responseBody?.cloudSyncId || 'ausente')}; ${responseText.slice(0, 300)}`
      );
    }

    if (cloudSyncQueue?.id === queued.id) {
      cloudSyncQueue = null;
      persistCloudSyncQueue();
    }
    // Confirmações são muito frequentes; exibir somente quando o modo de
    // diagnóstico estiver habilitado para não poluir o terminal.
    if (DEBUG_SYNC) {
      console.log(`[CloudSync] Confirmado pela nuvem: ${queued.id}`);
    }
  } catch (error: any) {
    if (cloudSyncQueue?.id === queued.id) {
      const attempts = queued.attempts + 1;
      const delay = cloudRetryDelay(attempts);
      cloudSyncQueue = {
        ...queued,
        attempts,
        nextAttemptAt: Date.now() + delay,
        lastError: String(error?.message || error),
      };
      persistCloudSyncQueue();
      console.error(
        `[${getLocalDateTimeString()}] [CloudSync] Envio pendente ${queued.id}; tentativa ${attempts}; nova tentativa em ${Math.round(delay / 1000)}s:`,
        error?.message || error,
      );
    }
  } finally {
    clearTimeout(timeout);
    cloudPushInFlight = false;
    if (cloudPushQueued) {
      cloudPushQueued = false;
      armCloudPush(250);
    } else if (cloudSyncQueue) {
      armCloudPush(Math.max(250, cloudSyncQueue.nextAttemptAt - Date.now()));
    }
  }
}

function scheduleCloudPush() {
  if (!ENABLE_CLOUD_PUSH || !CLOUD_SYNC_URL || !CLOUD_SYNC_TOKEN) return;
  const now = getLocalDateTimeString();
  const id = createCloudSyncId();
  cloudSyncQueue = {
    id,
    createdAt: cloudSyncQueue?.createdAt || now,
    updatedAt: now,
    attempts: 0,
    nextAttemptAt: Date.now() + 700,
    payload: buildCloudSyncPayload(id),
  };
  persistCloudSyncQueue();
  if (cloudPushInFlight) {
    cloudPushQueued = true;
    return;
  }
  armCloudPush(700);
}

function startCloudSyncKeepAlive() {
  if (!ENABLE_CLOUD_PUSH || !CLOUD_SYNC_URL || !CLOUD_SYNC_TOKEN) {
    console.log('[CloudSync] Sincronizacao automatica com a nuvem desativada.');
    return;
  }

  const reconcile = () => {
    if (cloudSyncQueue) {
      armCloudPush(Math.max(250, cloudSyncQueue.nextAttemptAt - Date.now()));
      return;
    }
    scheduleCloudPush();
  };

  // Envia o estado atual logo depois que o servidor inicia, sem depender
  // de o navegador abrir o localhost.
  setTimeout(reconcile, 2_000);

  // Mantem o Render ativo e reconcilia periodicamente todo o estado local.
  setInterval(reconcile, CLOUD_KEEPALIVE_MS);
  console.log(
    `[CloudSync] Sincronizacao autonoma ativa a cada ${Math.round(CLOUD_KEEPALIVE_MS / 60_000)} minuto(s).`,
  );
}

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

const parseCookies = (cookieHeader: string | undefined) => {
  const out: Record<string, string> = {};
  String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const eq = pair.indexOf('=');
      if (eq <= 0) return;
      const k = decodeURIComponent(pair.slice(0, eq).trim());
      const v = decodeURIComponent(pair.slice(eq + 1).trim());
      out[k] = v;
    });
  return out;
};

const hasSessionAuth = (req: Request) => {
  if (!WEB_LOGIN_USER || !WEB_LOGIN_PASS) return true;
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] === 'ok';
};

const hasAppBypass = (req: Request) => {
  if (!APP_BYPASS_TOKEN) return false;
  const headerToken = String(req.headers['x-app-token'] || req.headers['x-sync-token'] || '');
  return headerToken === APP_BYPASS_TOKEN;
};

const isAuthEnabled = () => !!(WEB_LOGIN_USER && WEB_LOGIN_PASS);

// Login simples para proteger acesso web público em produção.
app.get('/login', (_req: Request, res: Response) => {
  if (!isAuthEnabled()) {
    return res.redirect('/');
  }
  return res.status(200).send(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Login</title>
        <style>
          body{font-family:Arial,sans-serif;background:#0b1220;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
          .box{background:#111827;padding:24px;border-radius:12px;min-width:320px;border:1px solid #374151}
          input{width:100%;padding:10px 12px;margin:8px 0;border-radius:8px;border:1px solid #374151;background:#0f172a;color:#e5e7eb}
          button{width:100%;padding:10px 12px;border-radius:8px;border:0;background:#2563eb;color:white;font-weight:600;cursor:pointer}
          .err{color:#f87171;min-height:18px}
        </style>
      </head>
      <body>
        <form class="box" method="POST" action="/login">
          <h2 style="margin-top:0">Acesso protegido</h2>
          <label>Usuário</label>
          <input name="user" autocomplete="username" />
          <label>Senha</label>
          <input name="pass" type="password" autocomplete="current-password" />
          <div class="err">${''}</div>
          <button type="submit">Entrar</button>
        </form>
      </body>
    </html>
  `);
});

app.post('/login', express.urlencoded({ extended: false }), (req: Request, res: Response) => {
  if (!isAuthEnabled()) return res.redirect('/');
  const user = normalizeAuthValue(req.body?.user || '');
  const pass = normalizeAuthValue(req.body?.pass || '');
  if (user === WEB_LOGIN_USER && pass === WEB_LOGIN_PASS) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=ok; Path=/; HttpOnly; SameSite=Lax${secure}`);
    return res.redirect('/');
  }
  return res.status(401).send(`
    <!doctype html>
    <html lang="pt-BR">
      <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Login</title></head>
      <body style="font-family:Arial;background:#0b1220;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center">
        <form method="POST" action="/login" style="background:#111827;padding:24px;border-radius:12px;min-width:320px;border:1px solid #374151">
          <h2 style="margin-top:0">Acesso protegido</h2>
          <label>Usuário</label>
          <input name="user" style="width:100%;padding:10px;margin:8px 0;border-radius:8px;border:1px solid #374151;background:#0f172a;color:#e5e7eb" />
          <label>Senha</label>
          <input name="pass" type="password" style="width:100%;padding:10px;margin:8px 0;border-radius:8px;border:1px solid #374151;background:#0f172a;color:#e5e7eb" />
          <div style="color:#f87171;min-height:18px">Usuário ou senha inválidos</div>
          <button style="width:100%;padding:10px;border-radius:8px;border:0;background:#2563eb;color:white;font-weight:600" type="submit">Entrar</button>
        </form>
      </body>
    </html>
  `);
});

app.post('/logout', (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
  return res.json({ success: true });
});

// Em produção online (Render), bloqueia qualquer escrita pública.
// Escrita só é permitida com token enviado pelo servidor local.
app.use((req: Request, res: Response, next) => {
  const isApiRoute = req.path.startsWith('/api/');
  const isAuthRoute = req.path === '/login' || req.path === '/logout';
  const providedSyncToken = String(req.headers['x-sync-token'] || '');
  const hasSyncTokenAuth = !!SYNC_TOKEN && providedSyncToken === SYNC_TOKEN;

  // Proteção de leitura/escrita para APIs quando login está ativo:
  // aceita sessão web OU token de bypass do app.
  if (isAuthEnabled() && isApiRoute && req.path !== '/api/health') {
    if (!hasSessionAuth(req) && !hasAppBypass(req) && !hasSyncTokenAuth) {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
  }

  // Proteção para páginas web públicas.
  if (isAuthEnabled() && !isApiRoute && !isAuthRoute) {
    if (!hasSessionAuth(req)) {
      return res.redirect('/login');
    }
  }

  const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (!SYNC_TOKEN || !isApiRoute || !isWriteMethod) return next();

  const appBypassWritePaths = new Set([
    '/api/settings/clear-occurrences-by-date',
  ]);
  if (appBypassWritePaths.has(req.path) && hasAppBypass(req)) {
    return next();
  }

  if (!hasSyncTokenAuth) {
    return res.status(401).json({ success: false, error: 'write_blocked' });
  }
  return next();
});

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
  saveDataToFile(dataStore);
  console.log('[Storage] Estrutura de dados separada carregada/atualizada');
}
loadCloudSyncQueue();
if (cloudSyncQueue) {
  armCloudPush(Math.max(500, cloudSyncQueue.nextAttemptAt - Date.now()));
}
// ==================== APIs REST ====================

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: getLocalDateTimeString() });
});

// ==================== STORES ====================
app.get('/api/stores', (_req: Request, res: Response) => {
  res.json(dataStore.stores);
});

app.post('/api/stores', (req: Request, res: Response) => {
  const { id, storeName, cnpj } = req.body;
  const store = { id, storeName, cnpj, createdAt: getLocalDateTimeString() };
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
  const category = { id, storeId, name, operation, order, createdAt: getLocalDateTimeString() };
  dataStore.categories.push(category);
  res.json(category);
});

app.put('/api/categories/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, operation, order } = req.body;
  const index = dataStore.categories.findIndex((c: any) => c.id === id);
  if (index !== -1) {
    dataStore.categories[index] = { ...dataStore.categories[index], name, operation, order, updatedAt: getLocalDateTimeString() };
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
  const entry = { id, storeId, date, values, createdAt: getLocalDateTimeString() };
  dataStore.entries.push(entry);
  res.json(entry);
});

app.put('/api/entries/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { values } = req.body;
  const index = dataStore.entries.findIndex((e: any) => e.id === id);
  if (index !== -1) {
    dataStore.entries[index] = { ...dataStore.entries[index], values, updatedAt: getLocalDateTimeString() };
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
  const debt = { id, personName, description, amount, date, paid: false, createdAt: getLocalDateTimeString() };
  dataStore.debts.push(debt);
  res.json(debt);
});

app.put('/api/debts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { paid, paidDate, paidAmount } = req.body;
  const index = dataStore.debts.findIndex((d: any) => d.id === id);
  if (index !== -1) {
    dataStore.debts[index] = { ...dataStore.debts[index], paid, paidDate, paidAmount, updatedAt: getLocalDateTimeString() };
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

// Limpeza explícita do relatório de acessos (persistente em arquivo)
app.post('/api/settings/clear-access-logs', (_req: Request, res: Response) => {
  try {
    const currentSettings = dataStore.settings || {};
    dataStore.settings = {
      ...currentSettings,
      accessLogs: [],
    };
    saveDataToFile(dataStore);
    return res.json({
      success: true,
      message: 'Relatório de acessos limpo com sucesso.',
      timestamp: getLocalDateTimeString(),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Falha ao limpar relatório de acessos.',
      error: String(error?.message || error),
    });
  }
});

app.post('/api/settings/clear-occurrences-by-date', (req: Request, res: Response) => {
  try {
    const date = String(req.body?.date || '').slice(0, 10);
    const storeId = String(req.body?.storeId || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Data inválida.' });
    }

    const localDateFromTimestamp = (timestamp: any) => {
      const d = new Date(Number(timestamp || 0));
      if (!Number.isFinite(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const itemDate = (item: any) => String(item?.date || '').slice(0, 10) || localDateFromTimestamp(item?.timestamp);
    const matches = (item: any) => itemDate(item) === date && (!storeId || item?.storeId === storeId);

    const currentSettings = dataStore.settings || {};
    const beforeAccess = Array.isArray(currentSettings.accessLogs) ? currentSettings.accessLogs.length : 0;
    const beforeTimeline = Array.isArray(currentSettings.timeline) ? currentSettings.timeline.length : 0;
    const accessLogs = (currentSettings.accessLogs || []).filter((item: any) => !matches(item));
    const timeline = (currentSettings.timeline || []).filter((item: any) => !matches(item));

    dataStore.settings = {
      ...currentSettings,
      accessLogs,
      timeline,
    };
    saveDataToFile(dataStore);

    return res.json({
      success: true,
      date,
      storeId,
      removedAccessLogs: beforeAccess - accessLogs.length,
      removedTimeline: beforeTimeline - timeline.length,
      timestamp: getLocalDateTimeString(),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Falha ao limpar ocorrências do dia.',
      error: String(error?.message || error),
    });
  }
});

// ==================== APP DATA SYNC ====================
// Salvar dados do AppContext (settings, stores, debts, saldoDia)
app.post('/api/sync/save', (req: Request, res: Response) => {
  const {
    source = 'site',
    settings,
    stores,
    debts,
    saldoDia,
    caixa,
    fechamento,
    lancamentos,
    lancamentosCompacto,
    programAuditEvents,
    clientId,
    machineName,
    actionUserName,
    actionPassword,
    userName,
    username,
    user,
    actorName,
    actor,
    password,
    pass,
    senha,
    senhaAcao,
    senha_acao,
    action_password,
    user_password,
    senhaUsuario,
    senhaUsuarioAcao,
    senha_usuario_acao,
    syncMeta,
    cloudSyncId,
  } = req.body;
  if (DEBUG_SYNC) {
    console.log('[DEBUG] Sync/Save recebido');
  console.log('[DEBUG] Lancamentos:', lancamentos ? 'SIM' : 'NÃO');
  console.log('[DEBUG] Settings:', settings ? 'SIM' : 'NÃO');
  }
  // Modo estabilização temporário: força sincronização "ambos" para reduzir conflitos de bloqueio.
  const currentSyncPreference = dataStore.settings?.syncPreference;
  const syncPreference = currentSyncPreference === 'site' || currentSyncPreference === 'program'
    ? currentSyncPreference
    : 'program';
  const hasSyncTokenAuth = !!SYNC_TOKEN && String(req.headers['x-sync-token'] || '') === SYNC_TOKEN;
  const sourceAllowed = true;
  const programEventContext = {
    actionUserName,
    actionPassword,
    userName,
    username,
    user,
    actorName,
    actor,
    password,
    pass,
    senha,
    senhaAcao,
    senha_acao,
    action_password,
    user_password,
    senhaUsuario,
    senhaUsuarioAcao,
    senha_usuario_acao,
  };
  const normalizedProgramAuditEvents = Array.isArray(programAuditEvents)
    ? programAuditEvents.map((ev: any) => ({ ...programEventContext, ...ev }))
    : [];
  if (source === 'program' && caixa) {
    appendCaixaMovementLog({
      ts: getLocalDateTimeString(),
      event: 'program_caixa_payload_received',
      source,
      clientId: sanitizeLogText(clientId),
      machineName: sanitizeLogText(machineName),
      syncVersion: Number(syncMeta?.caixaFechamentoVersion ?? req.body?._syncMeta?.caixaFechamentoVersion),
      auditEventsCount: normalizedProgramAuditEvents.length,
      storeDays: summarizeCaixaPayload(caixa || {}),
    });
  }
  if (source === 'program' && normalizedProgramAuditEvents.length > 0) {
    normalizedProgramAuditEvents.forEach((event: any) => {
      appendCaixaMovementLog({
        ts: getLocalDateTimeString(),
        event: 'program_audit_event_received',
        source,
        clientId: sanitizeLogText(clientId),
        machineName: sanitizeLogText(machineName),
        action: sanitizeLogText(event?.action),
        storeId: sanitizeLogText(event?.storeId || event?.store || event?.loja),
        date: sanitizeLogText(event?.date || event?.data || event?.day),
        field: sanitizeLogText(event?.field || event?.category || event?.categoria || event?.tipo || event?.typeName),
        details: sanitizeLogText(event?.details || event?.description || event?.descricao),
        oldValue: event?.oldValue,
        newValue: event?.newValue,
        userName: sanitizeLogText(event?.userName || event?.actionUserName || event?.usuario || event?.user),
      });
    });
  }

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
        partialSettings.purchaseOptions = sanitizePurchaseOptionsForServer(
          incomingPurchaseOptions,
          dataStore.settings?.purchaseOptions,
        );
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
          timestamp: getLocalDateTimeString(),
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
        timestamp: getLocalDateTimeString(),
      });
    }
    return res.json({
      success: true,
      ignored: true,
      reason: `source_blocked_by_sync_preference:${syncPreference}`,
      timestamp: getLocalDateTimeString(),
    });
  }

  if (settings) {
    const incomingSettings = { ...settings };
    const programSentPurchaseEntries =
      source === 'program' && Object.prototype.hasOwnProperty.call(incomingSettings, 'purchaseEntries');
    const programSentPurchaseOptions =
      source === 'program' && Object.prototype.hasOwnProperty.call(incomingSettings, 'purchaseOptions');
    if (programSentPurchaseEntries || programSentPurchaseOptions) {
      appendPurchaseMovementLog({
        ts: getLocalDateTimeString(),
        event: 'program_purchase_payload_ignored',
        source,
        clientId: sanitizeLogText(clientId),
        machineName: sanitizeLogText(machineName),
        incomingEntriesSummary: programSentPurchaseEntries
          ? summarizePurchaseEntries(incomingSettings.purchaseEntries || {})
          : undefined,
        incomingOptionsSummary: programSentPurchaseOptions
          ? summarizePurchaseOptions(incomingSettings.purchaseOptions || {})
          : undefined,
      });
      delete (incomingSettings as any).purchaseEntries;
      delete (incomingSettings as any).purchaseOptions;
    }
    const hasPurchaseEntries =
      source !== 'program' && Object.prototype.hasOwnProperty.call(incomingSettings, 'purchaseEntries');
    const hasPurchaseOptions =
      source !== 'program' && Object.prototype.hasOwnProperty.call(incomingSettings, 'purchaseOptions');
    if (hasPurchaseEntries || hasPurchaseOptions) {
      appendPurchaseMovementLog({
        ts: getLocalDateTimeString(),
        event: 'purchase_settings_received',
        source,
        clientId: sanitizeLogText(clientId),
        machineName: sanitizeLogText(machineName),
        hasPurchaseEntries,
        hasPurchaseOptions,
        currentEntriesSummary: hasPurchaseEntries
          ? summarizePurchaseEntries(dataStore.settings?.purchaseEntries || {})
          : undefined,
        incomingEntriesSummary: hasPurchaseEntries
          ? summarizePurchaseEntries(incomingSettings.purchaseEntries || {})
          : undefined,
        entriesDiff: hasPurchaseEntries
          ? diffPurchaseEntries(dataStore.settings?.purchaseEntries || {}, incomingSettings.purchaseEntries || {})
          : undefined,
        currentOptionsSummary: hasPurchaseOptions
          ? summarizePurchaseOptions(dataStore.settings?.purchaseOptions || {})
          : undefined,
        incomingOptionsSummary: hasPurchaseOptions
          ? summarizePurchaseOptions(incomingSettings.purchaseOptions || {})
          : undefined,
      });
    }
    if (Array.isArray(incomingSettings.actionUsers)) {
      const seen = new Set<string>();
      for (const user of incomingSettings.actionUsers) {
        const pass = String(user?.password || '').trim();
        if (!pass) continue;
        if (seen.has(pass)) {
          return res.status(400).json({
            success: false,
            error: 'duplicate_action_user_password',
            message: 'Nao e permitido repetir senha em usuarios de acao.',
          });
        }
        seen.add(pass);
      }
    }
    delete (incomingSettings as any).syncPreference;
    const isAuthenticatedCloudPush = hasSyncTokenAuth && !!cloudSyncId;
    const mergeRemoteLogs = (current: any[] = [], incoming: any[] = [], limit: number) => {
      const merged = new Map<string, any>();
      [...current, ...incoming].forEach((item: any) => {
        const key = String(
          item?.id ||
          `${item?.timestamp || ''}|${item?.storeId || ''}|${item?.date || ''}|${item?.action || ''}|${item?.details || item?.description || ''}`
        );
        merged.set(key, item);
      });
      return Array.from(merged.values())
        .sort((a: any, b: any) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0))
        .slice(-limit);
    };
    if (isAuthenticatedCloudPush) {
      if (Array.isArray(incomingSettings.accessLogs)) {
        dataStore.settings = {
          ...(dataStore.settings || {}),
          // O localhost é a fonte autoritativa das ocorrências. Substituir a
          // lista permite propagar também exclusões e limpezas para o Render.
          accessLogs: incomingSettings.accessLogs.slice(-300),
        };
      }
      if (Array.isArray(incomingSettings.timeline)) {
        dataStore.settings = {
          ...(dataStore.settings || {}),
          timeline: incomingSettings.timeline.slice(-800),
        };
      }
    }
    // accessLogs/timeline são autoritativos no servidor para evitar perda por sobrescrita de sync concorrente.
    delete (incomingSettings as any).accessLogs;
    delete (incomingSettings as any).timeline;
    if (source === 'program') {
      // Evita que o programa desktop sobrescreva dados gerenciados no site.
      delete (incomingSettings as any).actionUsers;
      delete (incomingSettings as any).senhaVendas;
      delete (incomingSettings as any).purchaseEntries;
      delete (incomingSettings as any).purchaseOptions;
    }

    const nextPurchaseEntries = hasPurchaseEntries
      ? mergePurchaseEntries({}, incomingSettings.purchaseEntries || {})
      : (dataStore.settings?.purchaseEntries || {});
    const incomingPurchaseOptions = hasPurchaseOptions ? (incomingSettings.purchaseOptions || {}) : undefined;
    const nextPurchaseOptions = hasPurchaseOptions
      ? sanitizePurchaseOptionsForServer(incomingPurchaseOptions, dataStore.settings?.purchaseOptions)
      : (dataStore.settings?.purchaseOptions || {});
    delete (incomingSettings as any).purchaseEntries;
    delete (incomingSettings as any).purchaseOptions;

    dataStore.settings = {
      ...(dataStore.settings || {}),
      ...incomingSettings,
      purchaseEntries: nextPurchaseEntries,
      purchaseOptions: nextPurchaseOptions,
      syncPreference,
    };
    if (hasPurchaseEntries || hasPurchaseOptions) {
      appendPurchaseMovementLog({
        ts: getLocalDateTimeString(),
        event: 'purchase_settings_applied',
        source,
        clientId: sanitizeLogText(clientId),
        machineName: sanitizeLogText(machineName),
        savedEntriesSummary: hasPurchaseEntries
          ? summarizePurchaseEntries(dataStore.settings?.purchaseEntries || {})
          : undefined,
        savedOptionsSummary: hasPurchaseOptions
          ? summarizePurchaseOptions(dataStore.settings?.purchaseOptions || {})
          : undefined,
      });
    }
    if (DEBUG_SYNC) {
      console.log('[DEBUG] fieldMappingCompacto1:', settings.fieldMappingCompacto1);
    }
  }
  // Stores/Lancamentos devem ser autoritativos do SITE.
  // O programa desktop só controla Caixa/Fechamento.
  if (stores && source !== 'program') dataStore.stores = stores;
  if (debts) dataStore.debts = debts;
  const oldCaixaSnapshot = JSON.parse(JSON.stringify(dataStore.caixa || {}));
  const oldFechSnapshot = JSON.parse(JSON.stringify(dataStore.fechamento || {}));
  const beforeCaixaJson = JSON.stringify(dataStore.caixa || {});
  const beforeFechamentoJson = JSON.stringify(dataStore.fechamento || {});

  if (saldoDia !== undefined) dataStore.saldoDia = saldoDia;
  const caixaSourceAllowed = hasSyncTokenAuth || source === syncPreference;
  const fechamentoSourceAllowed = hasSyncTokenAuth || source === syncPreference;
  const beforeCaixaStores = Object.keys(dataStore.caixa || {});
  const beforeFechStores = Object.keys(dataStore.fechamento || {});
  let mergedCaixaStores: string[] = [];
  let mergedFechStores: string[] = [];
  const currentSyncMeta = ensureSyncMeta();
  const hasCaixaFechamentoPayload = Boolean((caixa && caixaSourceAllowed) || (fechamento && fechamentoSourceAllowed));
  const incomingCaixaFechamentoVersion = Number(syncMeta?.caixaFechamentoVersion ?? req.body?._syncMeta?.caixaFechamentoVersion);
  let programCaixaMergeSummary: any[] = [];

  if (source === 'program' && hasCaixaFechamentoPayload) {
    if (!Number.isFinite(incomingCaixaFechamentoVersion)) {
      appendSyncAudit({
        ts: getLocalDateTimeString(),
        event: 'strict_reject_missing_version',
        source,
        clientId: sanitizeLogText(clientId),
        machineName: sanitizeLogText(machineName),
        currentVersion: currentSyncMeta.caixaFechamentoVersion,
        storeIds: [...Object.keys(caixa || {}), ...Object.keys(fechamento || {})],
      });
      return res.status(409).json({
        success: false,
        error: 'missing_sync_version',
        message: 'Cliente sem versao de sincronizacao. Recarregue os dados antes de salvar.',
        currentSyncMeta,
        timestamp: getLocalDateTimeString(),
      });
    }
    if (incomingCaixaFechamentoVersion !== currentSyncMeta.caixaFechamentoVersion) {
      appendSyncAudit({
        ts: getLocalDateTimeString(),
        event: 'strict_reject_stale_version',
        source,
        clientId: sanitizeLogText(clientId),
        machineName: sanitizeLogText(machineName),
        incomingVersion: incomingCaixaFechamentoVersion,
        currentVersion: currentSyncMeta.caixaFechamentoVersion,
        storeIds: [...Object.keys(caixa || {}), ...Object.keys(fechamento || {})],
      });
      return res.status(409).json({
        success: false,
        error: 'stale_sync_version',
        message: 'Dados antigos rejeitados para evitar sobrescrita.',
        currentSyncMeta,
        timestamp: getLocalDateTimeString(),
      });
    }
  }

  if (caixa && caixaSourceAllowed) {
    dataStore.caixa = source === 'program'
      ? mergeProgramCaixaBranch(dataStore.caixa || {}, caixa || {}, {
          programAuditEvents: normalizedProgramAuditEvents,
          clientId,
          machineName,
        })
      : mergeStoreBranch(dataStore.caixa || {}, caixa || {});
    if (source === 'program') {
      programCaixaMergeSummary = buildProgramCaixaMergeSummary(oldCaixaSnapshot, caixa || {}, dataStore.caixa || {});
    }
    mergedCaixaStores = Object.keys(caixa || {});
  }
  if (fechamento && fechamentoSourceAllowed) {
    dataStore.fechamento = mergeStoreBranch(dataStore.fechamento || {}, fechamento || {});
    mergedFechStores = Object.keys(fechamento || {});
  }

  // Quando o programa já envia eventos explícitos, evita duplicar logs via diff.
  const hasProgramAuditEvents = source === 'program' && Array.isArray(programAuditEvents) && programAuditEvents.length > 0;

  if (source === 'program' && caixa && caixaSourceAllowed && !hasProgramAuditEvents) {
    const rawAudits = buildProgramAnnotationAuditLogs(oldCaixaSnapshot, dataStore.caixa || {});
    const suppressedDeletes = rawAudits.filter((audit) => audit.action === 'delete');
    if (suppressedDeletes.length > 0) {
      appendSyncAudit({
        ts: getLocalDateTimeString(),
        event: 'suppressed_program_implicit_delete_audit',
        source,
        clientId: sanitizeLogText(clientId),
        machineName: sanitizeLogText(machineName),
        count: suppressedDeletes.length,
        items: suppressedDeletes.slice(0, 20).map((audit) => ({
          storeId: audit.storeId,
          date: audit.date,
          field: audit.field,
          oldValue: audit.oldValue,
          details: sanitizeLogText(audit.details),
        })),
      });
    }
    const audits = rawAudits.filter((audit) => audit.action !== 'delete');
    audits.forEach((audit) => {
      appendProgramAudit(
        audit.storeId,
        audit.action === 'delete' ? 'delete' : 'update',
        'caixa',
        audit.date,
        audit.details,
        undefined,
        audit.field,
        audit.oldValue,
        audit.newValue,
      );
    });
  }

  if (hasProgramAuditEvents) {
    appendProgramAuditEvents(normalizedProgramAuditEvents);
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
          date: getLocalDateString(),
          description: 'Alteracao recebida do programa desktop',
        }];

    dataStore.settings = {
      ...(dataStore.settings || {}),
      accessLogs: [...(dataStore.settings?.accessLogs || []), ...finalAccess].slice(-300),
      timeline: [...(dataStore.settings?.timeline || []), ...finalTimeline].slice(-800),
    };
  }

  const caixaFechamentoChanged =
    beforeCaixaJson !== JSON.stringify(dataStore.caixa || {}) ||
    beforeFechamentoJson !== JSON.stringify(dataStore.fechamento || {});

  if (hasCaixaFechamentoPayload && caixaFechamentoChanged) {
    const meta = ensureSyncMeta();
    meta.caixaFechamentoVersion = Number(meta.caixaFechamentoVersion || 0) + 1;
    meta.caixaFechamentoUpdatedAt = getLocalDateTimeString();
    meta.caixaFechamentoUpdatedBy = source;
    meta.caixaFechamentoClientId = sanitizeLogText(clientId);
    meta.caixaFechamentoMachineName = sanitizeLogText(machineName);
  } else if (source === 'program' && hasCaixaFechamentoPayload) {
    appendSyncAudit({
      ts: getLocalDateTimeString(),
      event: 'program_no_change_no_version_bump',
      source,
      clientId: sanitizeLogText(clientId),
      machineName: sanitizeLogText(machineName),
      incomingVersion: incomingCaixaFechamentoVersion,
      currentVersion: ensureSyncMeta().caixaFechamentoVersion,
      mergedCaixaStores,
      mergedFechStores,
    });
  }
  
  // Lancamentos ja chegam mapeados pelo frontend (Opcoes + Caixa).
  // Persistir diretamente evita remapeamento incorreto entre lojas.
  if (lancamentos && source !== 'program') {
    dataStore.lancamentos = lancamentos;
  }
  
  saveDataToFile(dataStore);
  const ignoredFields: string[] = [];
  if (caixa && !caixaSourceAllowed) ignoredFields.push('caixa');
  if (fechamento && !fechamentoSourceAllowed) ignoredFields.push('fechamento');
  appendSyncAudit({
    ts: getLocalDateTimeString(),
    source,
    syncPreference,
    hasSyncTokenAuth,
    actionUserName,
    mergedCaixaStores,
    mergedFechStores,
    beforeCaixaStores,
    beforeFechStores,
    afterCaixaStores: Object.keys(dataStore.caixa || {}),
    afterFechStores: Object.keys(dataStore.fechamento || {}),
    ignoredFields,
    caixaFechamentoChanged,
    programCaixaMergeSummary: programCaixaMergeSummary.slice(0, 80),
    hasProgramAuditEvents,
    programAuditEventsCount: Array.isArray(programAuditEvents) ? programAuditEvents.length : 0,
    clientId: sanitizeLogText(clientId),
    machineName: sanitizeLogText(machineName),
    syncMeta: ensureSyncMeta(),
  });
  res.json({
    success: true,
    timestamp: getLocalDateTimeString(),
    ignoredFields,
    syncMeta: ensureSyncMeta(),
    cloudSyncId: sanitizeLogText(cloudSyncId || req.headers['x-cloud-sync-id']),
  });
});

// Carregar dados do AppContext (sem userId, sincroniza tudo)
app.get('/api/sync/load', (_req: Request, res: Response) => {
  const syncMeta = ensureSyncMeta();
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
      _syncMeta: syncMeta,
    },
    timestamp: getLocalDateTimeString()
  });
});

// Rota alternativa com userId (para compatibilidade)
app.get('/api/sync/load/:userId', (_req: Request, res: Response) => {
  const syncMeta = ensureSyncMeta();
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
      _syncMeta: syncMeta,
    },
    timestamp: getLocalDateTimeString()
  });
});

// Carregamento leve para telas que nao precisam do historico completo.
// Mantem /api/sync/load intacto para compatibilidade com programas e app antigo.
app.get('/api/sync/bootstrap', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      settings: sanitizeSettingsForBootstrap(dataStore.settings || {}),
      stores: dataStore.stores || {},
      debts: dataStore.debts || [],
      saldoDia: dataStore.saldoDia || 0,
      _syncMeta: ensureSyncMeta(),
    },
    timestamp: getLocalDateTimeString(),
  });
});

app.get('/api/compras/:year', (req: Request, res: Response) => {
  const year = String(req.params.year || '');
  res.json({
    success: true,
    year,
    data: readPurchaseEntriesByYear(year),
    timestamp: getLocalDateTimeString(),
  });
});

app.get('/api/compras/:year/:month', (req: Request, res: Response) => {
  const year = String(req.params.year || '');
  const month = pad2(req.params.month || '');
  const monthKey = `${year}-${month}`;
  res.json({
    success: true,
    monthKey,
    data: readPurchaseEntriesByMonth(monthKey),
    timestamp: getLocalDateTimeString(),
  });
});

app.post('/api/compras/options', (req: Request, res: Response) => {
  const incomingOptions = req.body?.purchaseOptions || req.body?.options || {};
  dataStore.settings = {
    ...(dataStore.settings || {}),
    purchaseOptions: sanitizePurchaseOptionsForServer(incomingOptions, dataStore.settings?.purchaseOptions),
  };
  saveDataToFile(dataStore);
  res.json({
    success: true,
    data: dataStore.settings.purchaseOptions,
    timestamp: getLocalDateTimeString(),
  });
});

app.post('/api/compras/:year/:month', (req: Request, res: Response) => {
  const year = String(req.params.year || '');
  const month = pad2(req.params.month || '');
  const monthKey = `${year}-${month}`;
  const entries = Array.isArray(req.body?.entries)
    ? req.body.entries
    : Array.isArray(req.body?.purchaseEntries)
      ? req.body.purchaseEntries
      : [];

  dataStore.settings = {
    ...(dataStore.settings || {}),
    purchaseEntries: {
      ...(dataStore.settings?.purchaseEntries || {}),
      [monthKey]: entries,
    },
  };

  if (req.body?.purchaseOptions || req.body?.options) {
    dataStore.settings.purchaseOptions = sanitizePurchaseOptionsForServer(
      req.body.purchaseOptions || req.body.options,
      dataStore.settings?.purchaseOptions,
    );
  }

  saveDataToFile(dataStore);
  res.json({
    success: true,
    monthKey,
    count: entries.length,
    timestamp: getLocalDateTimeString(),
  });
});

app.get('/api/periodo/:branch/:storeId/:year/:month', (req: Request, res: Response) => {
  const branch = String(req.params.branch || '');
  const storeId = String(req.params.storeId || '');
  const year = String(req.params.year || '');
  const month = pad2(req.params.month || '');
  const monthKey = `${year}-${month}`;
  const semester = `${year}-${Number(month) <= 6 ? '01_06' : '07_12'}`;

  if (!['caixa', 'fechamento', 'lancamentos'].includes(branch)) {
    return res.status(400).json({ success: false, error: 'branch_invalido' });
  }

  if (branch === 'caixa') {
    const bySemester = readStoreDateBranchPeriod(splitDirs.caixa, storeId, semester);
    return res.json({
      success: true,
      branch,
      storeId,
      monthKey,
      data: filterStoreDateBranchByMonth(bySemester, monthKey),
      timestamp: getLocalDateTimeString(),
    });
  }

  const dir = branch === 'fechamento' ? splitDirs.fechamento : splitDirs.lancamentos;
  const byYear = readStoreDateBranchPeriod(dir, storeId, year);
  return res.json({
    success: true,
    branch,
    storeId,
    monthKey,
    data: filterStoreDateBranchByMonth(byYear, monthKey),
    timestamp: getLocalDateTimeString(),
  });
});

app.get('/api/dashboard/:year', (req: Request, res: Response) => {
  const year = Number(req.params.year || 0);
  if (!Number.isFinite(year) || year < 1900) {
    return res.status(400).json({ success: false, error: 'ano_invalido' });
  }

  const monthRows = Array.from({ length: 12 }, (_v, idx) => {
    const month = idx + 1;
    const monthKey = `${year}-${pad2(month)}`;
    const compras = readPurchaseEntriesByMonth(monthKey).reduce(
      (sum, item: any) => sum + Number(item?.amount || 0),
      0,
    );

    const vendasPorLoja: Record<string, number> = {};
    Object.entries(dataStore.stores || {}).forEach(([storeId, store]: [string, any]) => {
      const monthData = (store?.months || []).find((m: any) => Number(m?.year) === year && Number(m?.month) === month);
      const categories = Array.isArray(store?.categories) ? store.categories : [];
      const vendas = (monthData?.entries || []).reduce((sum: number, entry: any) => {
        const entryTotal = categories.reduce((entrySum: number, cat: any) => {
          if (cat?.operation === 'null') return entrySum;
          const value = Number(entry?.values?.[cat?.id] || 0);
          return entrySum + (cat?.operation === 'subtract' ? -value : value);
        }, 0);
        return sum + entryTotal;
      }, 0);
      vendasPorLoja[storeId] = vendas;
    });

    return {
      month,
      monthKey,
      compras,
      vendasPorLoja,
      vendas: Object.values(vendasPorLoja).reduce((sum, value) => sum + Number(value || 0), 0),
    };
  });

  res.json({
    success: true,
    year,
    data: monthRows,
    timestamp: getLocalDateTimeString(),
  });
});

// ==================== SYNC ENDPOINTS (Desktop App) ====================

// Health check para o programa desktop
app.get('/api/sync/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: getLocalDateTimeString() });
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
      createdAt: getLocalDateTimeString(),
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
    const actionUsers = Array.isArray(dataStore.settings?.actionUsers) ? dataStore.settings.actionUsers : [];
    if (DEBUG_SYNC) {
      console.log('[DEBUG][annotation/update] keys:', Object.keys(req.body || {}));
    }

    if (dataStore.caixa[storeId] && dataStore.caixa[storeId][date]) {
      const annotations = dataStore.caixa[storeId][date].annotations || [];
      const index = annotations.findIndex((a: any) => a.id == id);
      
      if (index !== -1) {
        const previous = { ...annotations[index] };
        annotations[index] = { ...annotations[index], ...annotation, updatedAt: getLocalDateTimeString() };
        const resolvedUserName = resolveActionUserName(
          actionUsers,
          buildUserContextFromObjects(req.body, annotation, previous, annotations[index])
        );
        const oldValue = toNum(previous?.valor);
        const newValue = toNum(annotations[index]?.valor);
        appendProgramAudit(
          storeId,
          'update',
          'caixa',
          date,
          `${storeId.toUpperCase()} ${date} editou item em ${annotations[index]?.categoria || 'categoria'} | descricao: ${previous?.descricao || '-'} -> ${annotations[index]?.descricao || '-'} | Valor: R$ ${oldValue.toFixed(2)} -> R$ ${newValue.toFixed(2)}`,
          resolvedUserName,
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
    const actionUsers = Array.isArray(dataStore.settings?.actionUsers) ? dataStore.settings.actionUsers : [];
    if (DEBUG_SYNC) {
      console.log('[DEBUG][annotation/delete] keys:', Object.keys(req.body || {}));
    }
    
    if (dataStore.caixa[storeId] && dataStore.caixa[storeId][date]) {
      const annotations = dataStore.caixa[storeId][date].annotations || [];
      const index = annotations.findIndex((a: any) => a.id == id);
      
      if (index !== -1) {
        const removed = annotations[index];
        const resolvedUserName = resolveActionUserName(
          actionUsers,
          buildUserContextFromObjects(req.body, removed)
        );
        const removedValue = toNum(removed?.valor);
        annotations.splice(index, 1);
        appendProgramAudit(
          storeId,
          'delete',
          'caixa',
          date,
          `${storeId.toUpperCase()} ${date} excluiu item em ${removed?.categoria || 'categoria'} | descricao: ${removed?.descricao || '-'} | Valor: R$ ${removedValue.toFixed(2)}`,
          resolvedUserName
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
      updatedAt: getLocalDateTimeString(),
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

// Conexões podem ser encerradas pelo cliente durante o envio (queda de rede,
// fechamento do programa ou suspensão do computador). Mantém o terminal
// legível sem ocultar outros erros reais.
app.use((error: any, req: Request, res: Response, next: any) => {
  const aborted =
    error?.type === 'request.aborted' ||
    error?.code === 'ECONNABORTED' ||
    String(error?.message || '').toLowerCase() === 'request aborted';
  if (!aborted) return next(error);
  console.warn(
    `[${getLocalDateTimeString()}] [HTTP] Requisicao interrompida pelo cliente: ${req.method} ${req.originalUrl || req.url}`
  );
  if (!res.headersSent) res.status(400).json({ success: false, error: 'request_aborted' });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Server] API available at http://0.0.0.0:${PORT}/api`);
  console.log(`[Backup] Backup completo diario agendado para 20:00 em: ${DAILY_BACKUP_DIR}`);
  checkDailyBackupSchedule();
  setInterval(checkDailyBackupSchedule, 30_000);
  startCloudSyncKeepAlive();
});
