import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const folders = ['caixa', 'fechamento', 'lancamentos', 'compras'];

function safeFilePart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'sem-chave';
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(temporary, 'wx');
    try {
      fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .map((name) => path.join(directory, name));
}

function groupStoreDates(branch, mode) {
  const grouped = {};
  for (const [storeId, dates] of Object.entries(branch || {})) {
    if (!dates || typeof dates !== 'object' || Array.isArray(dates)) continue;
    for (const [date, value] of Object.entries(dates)) {
      const match = date.match(/^(\d{4})-(\d{2})/);
      const year = match?.[1] || 'sem-ano';
      const month = Number(match?.[2] || 1);
      const period = mode === 'semester' ? `${year}-${month <= 6 ? '01_06' : '07_12'}` : year;
      const name = `${safeFilePart(storeId)}-${period}.json`;
      grouped[name] ||= {};
      grouped[name][storeId] ||= {};
      grouped[name][storeId][date] = value;
    }
  }
  return grouped;
}

function groupPurchases(entries) {
  const grouped = {};
  for (const [month, rows] of Object.entries(entries || {})) {
    const year = month.match(/^(\d{4})-/)?.[1] || 'sem-ano';
    const name = `compras-${safeFilePart(year)}.json`;
    grouped[name] ||= {};
    grouped[name][month] = rows;
  }
  return grouped;
}

function replaceFolder(directory, grouped) {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, payload] of Object.entries(grouped))
    atomicWriteJson(path.join(directory, name), payload);
  for (const file of jsonFiles(directory)) {
    if (!Object.hasOwn(grouped, path.basename(file))) fs.unlinkSync(file);
  }
}

function readFolder(directory, branch) {
  const merged = {};
  for (const file of jsonFiles(directory)) {
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new Error(`Arquivo dividido inválido em ${branch}: ${path.basename(file)}`);
    if (branch === 'compras') Object.assign(merged, payload);
    else for (const [storeId, dates] of Object.entries(payload)) {
      merged[storeId] ||= {};
      Object.assign(merged[storeId], dates);
    }
  }
  return merged;
}

function normalized(value) {
  const copy = JSON.parse(JSON.stringify(value));
  delete copy._storage;
  // Empty store buckets are not written to the split folders. Treat their
  // presence in an in-memory snapshot as equivalent to being omitted when
  // verifying a persisted transaction.
  for (const branch of ['caixa', 'fechamento', 'lancamentos']) {
    if (!copy[branch] || typeof copy[branch] !== 'object' || Array.isArray(copy[branch])) continue;
    for (const [storeId, dates] of Object.entries(copy[branch])) {
      if (dates && typeof dates === 'object' && !Array.isArray(dates) && Object.keys(dates).length === 0)
        delete copy[branch][storeId];
    }
  }
  return copy;
}

export function sameStoredSnapshot(actual, expected) {
  return isDeepStrictEqual(normalized(actual), normalized(expected));
}

export function createStrictSplitStorage({ dataDir, dataFile }) {
  if (!path.isAbsolute(dataDir) || !path.isAbsolute(dataFile))
    throw new Error('Caminhos absolutos são obrigatórios.');
  const directory = (name) => path.join(dataDir, name);
  return {
    persist(snapshot) {
      if (!snapshot || typeof snapshot !== 'object' || !snapshot.settings)
        throw new Error('Dados incompletos para gravação dividida.');
      replaceFolder(directory('caixa'), groupStoreDates(snapshot.caixa, 'semester'));
      replaceFolder(directory('fechamento'), groupStoreDates(snapshot.fechamento, 'year'));
      replaceFolder(directory('lancamentos'), groupStoreDates(snapshot.lancamentos, 'year'));
      replaceFolder(directory('compras'), groupPurchases(snapshot.settings.purchaseEntries));
      const settings = { ...snapshot.settings };
      delete settings.purchaseEntries;
      const light = {
        ...snapshot,
        settings,
        _storage: {
          version: 1, split: true, updatedAt: new Date().toISOString(),
          folders: Object.fromEntries(folders.map((name) => [name, `data/${name}`])),
        },
      };
      delete light.caixa;
      delete light.fechamento;
      delete light.lancamentos;
      atomicWriteJson(dataFile, light);
    },
    reload() {
      const base = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      return {
        ...base,
        settings: { ...base.settings, purchaseEntries: readFolder(directory('compras'), 'compras') },
        caixa: readFolder(directory('caixa'), 'caixa'),
        fechamento: readFolder(directory('fechamento'), 'fechamento'),
        lancamentos: readFolder(directory('lancamentos'), 'lancamentos'),
      };
    },
  };
}
