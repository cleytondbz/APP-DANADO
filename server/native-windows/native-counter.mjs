import { randomUUID } from 'node:crypto';
import { TransactionConflict, TransactionInputError, snapshotRevision } from './native-transactions.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stores = ['loja1', 'loja2', 'loja3'];

// Calculate from the authoritative launch records, never from a client-supplied total.
export function buildCounterTransaction(current, request, { actor, now = Date.now() }) {
  const { storeId, monthKey, expectedConfig, config } = request || {};
  if (!stores.includes(storeId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey))
      || !isObject(config) || !Array.isArray(config.selection)
      || !isObject(config.daysByStore))
    throw new TransactionInputError('Loja, mês ou configuração do Contador inválidos.');
  const existing = current.settings?.customSaldoByStoreMonth?.[storeId]?.[monthKey] ?? null;
  if (snapshotRevision(existing) !== snapshotRevision(expectedConfig ?? null))
    throw new TransactionConflict('O Contador deste mês mudou em outra máquina. Recarregue antes de salvar.');
  const selection = [...new Set(config.selection)];
  if (selection.length > 21 || selection.some((key) => typeof key !== 'string'
      || !/^loja[123]:[a-z_]{1,32}$/.test(key)))
    throw new TransactionInputError('Categorias do Contador inválidas.');
  const daysByStore = {};
  const [year, month] = monthKey.split('-').map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (const key of stores) {
    const days = config.daysByStore[key] ?? [];
    if (!Array.isArray(days) || days.some((day) => !Number.isInteger(day) || day < 1 || day > maxDay))
      throw new TransactionInputError(`Dias inválidos para ${key}.`);
    daysByStore[key] = [...new Set(days)].sort((a, b) => a - b);
  }
  const daysBySelection = {};
  const requestedDaysBySelection = isObject(config.daysBySelection) ? config.daysBySelection : {};
  for (const key of selection) {
    if (!Object.prototype.hasOwnProperty.call(requestedDaysBySelection, key)) continue;
    const days = requestedDaysBySelection[key];
    if (!Array.isArray(days) || days.some((day) => !Number.isInteger(day) || day < 1 || day > maxDay))
      throw new TransactionInputError(`Dias específicos inválidos para ${key}.`);
    daysBySelection[key] = [...new Set(days)].sort((a, b) => a - b);
  }
  let total = 0;
  for (const key of selection) {
    const [selectedStore, category] = key.split(':');
    const selectedDays = Object.prototype.hasOwnProperty.call(daysBySelection, key)
      ? daysBySelection[key] : daysByStore[selectedStore];
    for (const day of selectedDays) {
      const date = `${monthKey}-${String(day).padStart(2, '0')}`;
      const value = Number(current.lancamentos?.[selectedStore]?.[date]?.values?.[category] || 0);
      if (!Number.isFinite(value)) throw new TransactionInputError('Valor de Lançamento inválido para o Contador.');
      total += value;
    }
  }
  total = Math.round((total + Number.EPSILON) * 100) / 100;
  const timestamp = Number(now);
  const updatedAt = new Date(timestamp).toISOString();
  const nextConfig = {
    ...(isObject(existing) ? structuredClone(existing) : {}),
    label: 'Contador', selection, daysByStore, daysBySelection,
    days: [...new Set(Object.values(daysByStore).flat())].sort((a, b) => a - b),
    updatedAt, total,
  };
  const next = structuredClone(current);
  next.settings.customSaldoByStoreMonth ||= {};
  next.settings.customSaldoByStoreMonth[storeId] ||= {};
  next.settings.customSaldoByStoreMonth[storeId][monthKey] = nextConfig;
  next.settings.customSaldoHistory ||= [];
  next.settings.customSaldoHistory.push({ id: randomUUID(), timestamp, updatedAt,
    storeId, monthKey, selection, daysByStore, daysBySelection, total, action: 'windows_update', actor });
  next.settings.customSaldoHistory = next.settings.customSaldoHistory.slice(-500);
  next.settings.timeline ||= [];
  next.settings.timeline.push({ id: randomUUID(), timestamp, module: 'lancamentos',
    action: 'update', source: 'manual-windows', storeId, date: `${monthKey}-01`,
    field: 'contador', userName: actor, oldValue: existing?.total ?? null, newValue: total,
    description: `Contador atualizado: ${monthKey}` });
  next.settings.timeline = next.settings.timeline.slice(-2000);
  return { next, config: nextConfig };
}
