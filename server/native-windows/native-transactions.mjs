import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export class TransactionConflict extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransactionConflict';
    this.statusCode = 409;
  }
}

export class TransactionInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransactionInputError';
    this.statusCode = 400;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const monthKeyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const normalizedName = (value) => String(value).trim().normalize('NFD')
  .replace(/\p{M}/gu, '').toUpperCase();

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function mergePurchaseHistory(currentOptions, incomingOptions) {
  const existing = Array.isArray(currentOptions.purchaseHistory) ? currentOptions.purchaseHistory : [];
  const incoming = Array.isArray(incomingOptions.purchaseHistory) ? incomingOptions.purchaseHistory : [];
  const existingIds = new Set(existing.filter(isObject).map((entry) => String(entry.id || '').trim())
    .filter(Boolean));
  const seen = new Set();
  const merged = [];
  // New client records come first; the server's existing version wins for old IDs.
  for (const entry of incoming) {
    if (!isObject(entry)) continue;
    const id = String(entry.id || '').trim();
    if (!id || existingIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    merged.push(structuredClone(entry));
  }
  for (const entry of existing) {
    if (!isObject(entry)) continue;
    const id = String(entry.id || '').trim();
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    merged.push(structuredClone(entry));
  }
  return merged.slice(0, 200);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter((key) => value[key] !== undefined && key !== '_storage')
    .map((key) => [key, canonical(value[key])]));
}

export function snapshotRevision(data) {
  return createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex');
}

export function validateFullSnapshot(data) {
  if (!isObject(data)) throw new TransactionInputError('Backup sem bloco de dados válido.');
  for (const key of ['settings', 'stores', 'caixa', 'fechamento', 'lancamentos']) {
    if (!isObject(data[key])) throw new TransactionInputError(`Backup sem ${key}.`);
  }
  for (const key of ['purchaseEntries', 'purchaseOptions']) {
    if (!isObject(data.settings[key])) throw new TransactionInputError(`Backup sem settings.${key}.`);
  }
  for (const key of ['accessLogs', 'timeline']) {
    if (!Array.isArray(data.settings[key])) throw new TransactionInputError(`Backup sem settings.${key}.`);
  }
  for (const key of ['actionUsers', 'customSaldoDays', 'customSaldoSelection',
    'customSaldoHistory', 'customSaldoBackups']) {
    if (!Array.isArray(data.settings[key])) throw new TransactionInputError(`Backup sem settings.${key}.`);
  }
  if (!isObject(data.settings.customSaldoByStoreMonth))
    throw new TransactionInputError('Backup sem settings.customSaldoByStoreMonth.');
  if (!Array.isArray(data.debts)) throw new TransactionInputError('Backup sem debts.');
  if (typeof data.saldoDia !== 'number' || !Number.isFinite(data.saldoDia))
    throw new TransactionInputError('Backup sem saldoDia numérico.');
  for (const [month, entries] of Object.entries(data.settings.purchaseEntries)) {
    if (!monthKeyPattern.test(month) || !Array.isArray(entries))
      throw new TransactionInputError(`Mês de compras inválido no backup: ${month}.`);
  }
  return data;
}

export function buildRestoreTransaction(current, request) {
  if (typeof request?.expectedRevision !== 'string'
      || !/^[a-f0-9]{64}$/.test(request.expectedRevision))
    throw new TransactionInputError('Revisão esperada do backup ausente ou inválida.');
  if (snapshotRevision(current) !== request.expectedRevision)
    throw new TransactionConflict('Os dados mudaram desde a conferência do backup. Selecione o arquivo novamente.');
  return structuredClone(validateFullSnapshot(request.data));
}

export function createPreRestoreBackup({ backupDir, snapshot, now = new Date() }) {
  validateFullSnapshot(snapshot);
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(backupDir, `backup-antes-restauracao-${stamp}-${randomUUID()}.json`);
  const temporary = `${filePath}.tmp`;
  const backup = { backupType: 'antes-restauracao-nativa', createdAt: now.toISOString(), data: snapshot };
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, JSON.stringify(backup), 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    const readBack = JSON.parse(fs.readFileSync(temporary, 'utf8'));
    if (!sameJson(readBack, backup)) throw new Error('Cópia anterior não conferiu após gravação.');
    fs.renameSync(temporary, filePath);
    return filePath;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function buildPurchaseTransaction(current, request) {
  if (!isObject(current?.settings?.purchaseEntries) || !isObject(current?.settings?.purchaseOptions))
    throw new Error('Estado de compras do servidor incompleto.');
  if (!isObject(request?.expectedMonths) || !isObject(request?.changedMonths)
      || !isObject(request?.expectedOptions) || !isObject(request?.purchaseOptions))
    throw new TransactionInputError('Transação de compras incompleta.');
  const changedKeys = Object.keys(request.changedMonths).sort();
  const expectedKeys = Object.keys(request.expectedMonths).sort();
  if (changedKeys.length === 0 || !sameJson(changedKeys, expectedKeys))
    throw new TransactionInputError('Meses alterados e versões esperadas não correspondem.');
  for (const key of changedKeys) {
    if (!monthKeyPattern.test(key) || !Array.isArray(request.changedMonths[key])
        || !Array.isArray(request.expectedMonths[key]))
      throw new TransactionInputError(`Mês de compras inválido: ${key}.`);
    const currentMonth = current.settings.purchaseEntries[key] ?? [];
    const expectedMonth = request.expectedMonths[key];
    if (!sameJson(currentMonth, expectedMonth))
      throw new TransactionConflict(`As compras de ${key} mudaram em outra máquina.`);
    const seenIds = new Set();
    for (const entry of request.changedMonths[key]) {
      if (!isObject(entry) || typeof entry.dueDate !== 'string'
          || !entry.dueDate.startsWith(`${key}-`))
        throw new TransactionInputError(`Compra com vencimento fora do mês ${key}.`);
      if (!validIsoDate(entry.dueDate))
        throw new TransactionInputError(`Compra com data de vencimento inválida: ${entry.dueDate}.`);
      const id = String(entry.id || '').trim();
      if (id && seenIds.has(id))
        throw new TransactionInputError(`Compra com ID repetido em ${key}: ${id}.`);
      if (id) seenIds.add(id);
    }
  }
  if (!sameJson(current.settings.purchaseOptions, request.expectedOptions))
    throw new TransactionConflict('Listas ou histórico de compras mudaram em outra máquina.');
  const next = structuredClone(current);
  for (const key of changedKeys)
    next.settings.purchaseEntries[key] = structuredClone(request.changedMonths[key]);
  next.settings.purchaseOptions = structuredClone(request.purchaseOptions);
  if (Array.isArray(current.settings.purchaseOptions.purchaseHistory)
      || Array.isArray(request.purchaseOptions.purchaseHistory))
    next.settings.purchaseOptions.purchaseHistory = mergePurchaseHistory(
      current.settings.purchaseOptions, request.purchaseOptions);
  return next;
}

export function buildPurchaseOptionsTransaction(current, request, { actor = 'Gerencial Windows', now = Date.now() } = {}) {
  if (!isObject(request?.expectedOptions) || !isObject(request?.purchaseOptions))
    throw new TransactionInputError('Listas de Compras incompletas.');
  const existing = current.settings?.purchaseOptions;
  if (!isObject(existing)) throw new TransactionInputError('Listas de Compras ausentes no servidor.');
  if (snapshotRevision(existing) !== snapshotRevision(request.expectedOptions))
    throw new TransactionConflict('As listas de Compras mudaram em outra máquina. Atualize antes de salvar.');
  const proposed = request.purchaseOptions;
  const nextOptions = structuredClone(existing);
  const changes = [];
  for (const field of ['groups', 'suppliers', 'institutions']) {
    const list = proposed[field];
    if (!Array.isArray(list) || list.length > 10000
        || list.some((value) => typeof value !== 'string' || !value.trim() || value.length > 200))
      throw new TransactionInputError(`Lista inválida: ${field}.`);
    const values = list.map((value) => value.trim());
    if (new Set(values.map(normalizedName)).size !== values.length)
      throw new TransactionInputError(`Lista com nomes repetidos: ${field}.`);
    const before = Array.isArray(existing[field]) ? existing[field] : [];
    const beforeKeys = new Set(before.map(normalizedName));
    const afterKeys = new Set(values.map(normalizedName));
    for (const value of values) if (!beforeKeys.has(normalizedName(value)))
      changes.push({ field, action: 'add', value });
    for (const value of before) if (!afterKeys.has(normalizedName(value)))
      changes.push({ field, action: 'delete', value: String(value) });
    nextOptions[field] = values;
  }
  const types = proposed.supplierDifTypes ?? {};
  if (!isObject(types) || Object.values(types).some((value) => !['D', 'I', 'F'].includes(value)))
    throw new TransactionInputError('Tipos de fornecedores inválidos.');
  nextOptions.supplierDifTypes = structuredClone(types);
  const next = structuredClone(current);
  next.settings.purchaseOptions = nextOptions;
  if (changes.length || snapshotRevision(existing.supplierDifTypes || {}) !== snapshotRevision(types)) {
    next.settings.timeline ||= [];
    next.settings.timeline.push({ id: randomUUID(), timestamp: now, module: 'opcoes',
      action: 'update', field: 'purchaseOptions', userName: actor,
      description: 'Listas de Compras alteradas pelo programa Windows',
      changes: changes.slice(0, 100),
      beforeTypes: structuredClone(existing.supplierDifTypes || {}), afterTypes: structuredClone(types) });
    next.settings.timeline = next.settings.timeline.slice(-2000);
  }
  return next;
}

function writeJournal(filePath, record) {
  const temp = `${filePath}.${randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(temp, 'wx');
    try {
      fs.writeFileSync(descriptor, JSON.stringify(record), 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (fs.existsSync(filePath)) throw new Error('Já existe uma transação pendente.');
    fs.renameSync(temp, filePath);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function commitWithJournal({ dataDir, before, after, persist, reload, verify = sameJson }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const journal = path.join(dataDir, '.native-transaction.json');
  if (fs.existsSync(journal))
    throw new Error('Há uma transação pendente. Recupere-a antes de gravar novamente.');
  // Removing the journal is the commit point. Any interrupted transaction is
  // rolled back, including a crash after the data files were written.
  const record = { version: 1, state: 'prepared', before, after };
  writeJournal(journal, record);
  try {
    persist(after);
    if (!verify(reload(), after)) throw new Error('A leitura após gravar não confere com a transação.');
  } catch (error) {
    try {
      persist(before);
      if (!verify(reload(), before)) throw new Error('Rollback não conferiu.');
      fs.unlinkSync(journal);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError],
        'Gravação e recuperação falharam; transação pendente para recuperação no início do servidor.');
    }
    throw error;
  }
  // If this removal fails, the caller must stop serving writes and run recovery.
  // Recovery will restore "before", so success is returned only after removal.
  fs.unlinkSync(journal);
}

export function recoverWithJournal({ dataDir, persist, reload, verify = sameJson }) {
  const journal = path.join(dataDir, '.native-transaction.json');
  if (!fs.existsSync(journal)) return 'none';
  const record = JSON.parse(fs.readFileSync(journal, 'utf8'));
  if (record?.version !== 1 || record.state !== 'prepared'
      || !isObject(record.before) || !isObject(record.after))
    throw new Error('Diário de transação inválido; não iniciar o servidor automaticamente.');
  persist(record.before);
  if (!verify(reload(), record.before)) throw new Error('Recuperação da transação não conferiu.');
  fs.unlinkSync(journal);
  return 'rolled-back';
}
