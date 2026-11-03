import { TransactionInputError } from './native-transactions.mjs';

function localDate(timestamp) {
  const numeric = Number(timestamp);
  const parsed = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(parsed).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function buildHistoryClearTransaction(current, kind) {
  if (!['accessLogs', 'timeline'].includes(kind))
    throw new TransactionInputError('Histórico inválido para limpeza.');
  const next = structuredClone(current);
  const removed = Array.isArray(next.settings?.[kind]) ? next.settings[kind].length : 0;
  next.settings[kind] = [];
  return { next, removed };
}

export function buildOccurrenceClearTransaction(current, { storeId, date } = {}) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^loja[123]$/.test(String(storeId)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))
      || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
    throw new TransactionInputError('Loja ou data inválida para limpeza de ocorrências.');
  const next = structuredClone(current);
  const matchesDay = (item) => (String(item?.date || '').slice(0, 10)
    || localDate(item?.timestamp)) === date && item?.storeId === storeId;
  const access = Array.isArray(next.settings.accessLogs) ? next.settings.accessLogs : [];
  const timeline = Array.isArray(next.settings.timeline) ? next.settings.timeline : [];
  // Access reports have a different purpose: do not erase successful logins.
  next.settings.accessLogs = access.filter((item) => !matchesDay(item)
    || ['login', 'accessCaixa'].includes(item?.action));
  next.settings.timeline = timeline.filter((item) => !matchesDay(item)
    || !['caixa', 'fechamento'].includes(item?.module));
  return { next, removedAccessLogs: access.length - next.settings.accessLogs.length,
    removedTimeline: timeline.length - next.settings.timeline.length };
}
