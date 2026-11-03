import { TransactionInputError, snapshotRevision } from './native-transactions.mjs';

const categories = ['dinheiro', 'pix', 'cartao', 'boleto'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const metadata = (day) => Object.fromEntries(Object.entries(day || {})
  .filter(([key]) => !categories.includes(key)));
const describeMetadataValue = (value) => value === undefined ? '(ausente)'
  : JSON.stringify(value).slice(0, 240);

function collect(day) {
  const items = new Map();
  let hasLegacyIds = false;
  let count = 0;
  for (const category of categories) {
    const rows = day?.[category] ?? [];
    if (!Array.isArray(rows)) throw new TransactionInputError(`Categoria ${category} inválida.`);
    for (const row of rows) {
      if (!isObject(row)) throw new TransactionInputError('Item de Caixa inválido.');
      count++;
      const id = String(row.id || '').trim();
      if (!id) { hasLegacyIds = true; continue; }
      if (items.has(id)) throw new TransactionInputError(`ID duplicado no Caixa: ${id}.`);
      items.set(id, { category, row });
    }
  }
  return { items, hasLegacyIds, count };
}

export function classifyCaixaDayChange(before, after) {
  if (before != null && !isObject(before)) throw new TransactionInputError('Dia anterior inválido.');
  if (!isObject(after)) throw new TransactionInputError('Novo dia de Caixa inválido.');
  const oldDay = before || {};
  const oldItems = collect(oldDay);
  const newItems = collect(after);
  const result = { added: 0, edited: 0, deleted: 0 };
  if (oldItems.hasLegacyIds || newItems.hasLegacyIds) {
    if (snapshotRevision(oldDay) !== snapshotRevision(after)) {
      // Legacy rows without IDs cannot be matched safely. Require both rights
      // whenever a change could have replaced or removed an existing row.
      if (oldItems.count > 0) { result.edited++; result.deleted++; }
      if (newItems.count > oldItems.count) result.added += newItems.count - oldItems.count;
    }
    return result;
  }
  for (const [id, previous] of oldItems.items) {
    const next = newItems.items.get(id);
    if (!next) result.deleted++;
    else if (previous.category !== next.category
        || snapshotRevision(previous.row) !== snapshotRevision(next.row)) result.edited++;
  }
  for (const id of newItems.items.keys()) if (!oldItems.items.has(id)) result.added++;
  if (snapshotRevision(metadata(oldDay)) !== snapshotRevision(metadata(after))) result.edited++;
  return result;
}

export function describeCaixaDayChanges(before, after) {
  const oldItems = collect(before || {});
  const newItems = collect(after);
  if (oldItems.hasLegacyIds || newItems.hasLegacyIds)
    throw new TransactionInputError('Itens sem ID precisam ser corrigidos antes de salvar pelo modo nativo.');
  const changes = [];
  const detail = (entry) => entry ? {
    category: entry.category,
    description: String(entry.row.descricao || ''),
    value: entry.row.valor ?? null,
  } : null;
  for (const [id, previous] of oldItems.items) {
    const next = newItems.items.get(id);
    if (!next) changes.push({ id, action: 'delete', before: detail(previous), after: null });
    else if (previous.category !== next.category
        || snapshotRevision(previous.row) !== snapshotRevision(next.row))
      changes.push({ id, action: 'update', before: detail(previous), after: detail(next) });
  }
  for (const [id, next] of newItems.items)
    if (!oldItems.items.has(id)) changes.push({ id, action: 'create', before: null, after: detail(next) });
  const beforeMetadata = metadata(before);
  const afterMetadata = metadata(after);
  for (const key of new Set([...Object.keys(beforeMetadata), ...Object.keys(afterMetadata)])) {
    if (Object.hasOwn(beforeMetadata, key) === Object.hasOwn(afterMetadata, key)
        && snapshotRevision(beforeMetadata[key] ?? null) === snapshotRevision(afterMetadata[key] ?? null)) continue;
    changes.push({ id: `day-field:${key}`, action: 'update',
      before: { category: 'dia', description: `${key}: ${describeMetadataValue(beforeMetadata[key])}`, value: null },
      after: { category: 'dia', description: `${key}: ${describeMetadataValue(afterMetadata[key])}`, value: null } });
  }
  return changes;
}
