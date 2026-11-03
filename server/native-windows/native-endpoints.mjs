import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { canPerform, createNativeAuth } from './native-auth.mjs';
import {
  TransactionConflict, TransactionInputError, buildPurchaseOptionsTransaction,
  buildPurchaseTransaction, buildRestoreTransaction,
  commitWithJournal, createPreRestoreBackup, recoverWithJournal, snapshotRevision,
} from './native-transactions.mjs';
import { createStrictSplitStorage, sameStoredSnapshot } from './strict-split-persistence.mjs';
import { projectNativeData } from './native-projection.mjs';
import { classifyCaixaDayChange, describeCaixaDayChanges } from './native-day-change.mjs';
import { buildCounterTransaction } from './native-counter.mjs';
import { buildHistoryClearTransaction, buildOccurrenceClearTransaction } from './native-clear.mjs';
import { buildNativeAccessContext } from './native-access-context.mjs';

const pendingJournal = (dataDir) => path.join(dataDir, '.native-transaction.json');
const reply = (res, code, body) => res.status(code).json(body);

// Call this before the live server loads its data or accepts any request.
export function recoverNativeStorage({ dataDir, dataFile }) {
  const storage = createStrictSplitStorage({ dataDir, dataFile });
  const result = recoverWithJournal({ dataDir, ...storage, verify: sameStoredSnapshot });
  return { result, data: result === 'none' ? null : storage.reload() };
}

// Detached Express-compatible handlers. Register only after legacy routes and
// clients are migrated to server-side authentication and scoped data responses.
export function createNativeHandlers({ getData, replaceData, dataDir, dataFile, backupDir,
  secret, now = Date.now, enabled = false, afterCommit, fiscalReader = null, priceService = null }) {
  if (typeof getData !== 'function' || typeof replaceData !== 'function')
    throw new Error('Acesso ao estado do servidor é obrigatório.');
  if (enabled && typeof afterCommit !== 'function')
    throw new Error('Sincronização após gravação é obrigatória antes de habilitar rotas nativas.');
  const storage = createStrictSplitStorage({ dataDir, dataFile });
  const auth = createNativeAuth({ getSettings: () => getData().settings, secret, now });
  const failedLogins = new Map();
  let writing = false;
  let blocked = fs.existsSync(pendingJournal(dataDir));

  function principal(req) {
    const header = String(req.headers?.authorization || '');
    return header.startsWith('Bearer ') ? auth.verify(header.slice(7)) : null;
  }

  function requireOperation(req, res, operation) {
    if (!enabled) {
      reply(res, 503, { success: false, message: 'Integração nativa ainda não habilitada.' });
      return null;
    }
    const user = principal(req);
    if (!user) { reply(res, 401, { success: false, message: 'Sessão ausente ou expirada.' }); return null; }
    if (!canPerform(user, operation)) {
      reply(res, 403, { success: false, message: 'Sem permissão para esta ação.' }); return null;
    }
    return user;
  }

  function requireLocalNetwork(req, res) {
    const address = String(req.socket?.remoteAddress || req.ip || '');
    const normalized = address.replace(/^::ffff:/, '');
    const local = normalized === '127.0.0.1' || normalized === '::1'
      || /^192\.168\./.test(normalized) || /^10\./.test(normalized)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized);
    if (!local) {
      reply(res, 403, { success: false, message: 'O aplicativo somente funciona na rede local.' });
      return null;
    }
    return normalized;
  }

  function requireSalesPassword(req, res, field = 'password') {
    const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}:sales-verify`;
    const attempts = failedLogins.get(key);
    if (attempts && attempts.until > now() && attempts.count >= 5) {
      reply(res, 429, { allowed: false, message: 'Muitas tentativas. Aguarde dez minutos.' });
      return false;
    }
    if (!auth.authenticate('sales', req.body?.[field])) {
      const count = attempts && attempts.until > now() ? attempts.count + 1 : 1;
      failedLogins.set(key, { count, until: now() + 10 * 60 * 1000 });
      reply(res, count >= 5 ? 429 : 401, { allowed: false, message: 'Senha gerencial inválida.' });
      return false;
    }
    failedLogins.delete(key);
    return true;
  }

  function publicActionUsers(data) {
    const users = Array.isArray(data.settings?.actionUsers) ? data.settings.actionUsers : [];
    return {
      revision: snapshotRevision(users),
      users: users.map((user, index) => ({
        id: String(user?.id || `legacy-index-${index}`),
        name: String(user?.name || ''), role: String(user?.role || ''),
        permissions: Array.isArray(user?.permissions) ? user.permissions : [],
        hasPassword: Boolean(String(user?.password || '').trim()),
      })),
    };
  }

  function serverDate() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(now())).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function writeSnapshot(next) {
    if (blocked || writing || fs.existsSync(pendingJournal(dataDir)))
      throw new Error('Gravação bloqueada por transação pendente.');
    writing = true;
    let committed = false;
    try {
      const before = getData();
      commitWithJournal({ dataDir, before, after: next, ...storage, verify: sameStoredSnapshot });
      committed = true;
      replaceData(next);
      afterCommit?.(next);
    } catch (error) {
      if (committed || fs.existsSync(pendingJournal(dataDir))) blocked = true;
      throw error;
    } finally {
      writing = false;
    }
  }

  function failure(res, error) {
    if (error instanceof TransactionConflict)
      return reply(res, 409, { success: false, message: error.message });
    if (blocked) return reply(res, 503, {
      success: false, message: 'Gravação bloqueada; recuperar transação pendente antes de continuar.',
    });
    if (error instanceof TransactionInputError)
      return reply(res, 400, { success: false, message: error.message });
    return reply(res, 500, { success: false, message: 'Falha ao gravar; nenhum sucesso foi confirmado.' });
  }

  const fiscalDocumentFolder = path.join(dataDir, 'fiscal-document-cache');
  const normalizedFiscalKey = (value) => String(value || '').replace(/\D/g, '');
  const fiscalDocumentPath = (key) => path.join(fiscalDocumentFolder, `${key}.pdf`);
  const isPdf = (buffer) => Buffer.isBuffer(buffer) && buffer.length >= 5
    && buffer.subarray(0, 5).toString('ascii') === '%PDF-';

  return {
    sessionCapability(_req, res) {
      return reply(res, 200, { nativeSessions: enabled });
    },
    accessContext(req, res) {
      if (!enabled) return reply(res, 503, { success: false, message: 'Integração nativa ainda não habilitada.' });
      return reply(res, 200, { success: true, data: buildNativeAccessContext(req, now()) });
    },
    login(req, res) {
      if (!enabled) return reply(res, 503, { success: false, message: 'Integração nativa ainda não habilitada.' });
      if (blocked) return reply(res, 503, { success: false, message: 'Recuperação pendente.' });
      const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}:${req.body?.role || ''}`;
      const attempts = failedLogins.get(key);
      if (attempts && attempts.until > now() && attempts.count >= 5)
        return reply(res, 429, { success: false, message: 'Muitas tentativas. Aguarde dez minutos.' });
      const requestedRole = String(req.body?.role || '');
      const session = requestedRole === 'manager'
        ? auth.authenticate('sales', req.body?.password) || auth.authenticate('action', req.body?.password)
        : auth.authenticate(requestedRole, req.body?.password);
      if (!session) {
        const count = attempts && attempts.until > now() ? attempts.count + 1 : 1;
        failedLogins.set(key, { count, until: now() + 10 * 60 * 1000 });
        return reply(res, count >= 5 ? 429 : 401,
          { success: false, message: count >= 5 ? 'Muitas tentativas. Aguarde dez minutos.' : 'Senha inválida.' });
      }
      failedLogins.delete(key);
      try {
        const next = structuredClone(getData());
        next.settings.accessLogs ||= [];
        next.settings.accessLogs.push({
          id: randomUUID(), timestamp: now(), action: 'login', status: 'success',
          userName: session.name, source: 'windows', details: 'Acesso ao programa Windows',
        });
        writeSnapshot(next);
        return reply(res, 200, { success: true, ...session,
          permissions: auth.verify(session.token)?.permissions || [] });
      } catch (error) { return failure(res, error); }
    },
    verifyAction(req, res) {
      if (!requireOperation(req, res, 'caixa:read')) return;
      const operation = { edit: 'caixa:edit', delete: 'caixa:delete',
        changeDate: 'date:change' }[req.body?.action];
      if (!operation) return reply(res, 400, { allowed: false, message: 'Ação inválida.' });
      const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}:action-verify`;
      const attempts = failedLogins.get(key);
      if (attempts && attempts.until > now() && attempts.count >= 5)
        return reply(res, 429, { allowed: false, message: 'Muitas tentativas. Aguarde dez minutos.' });
      const candidate = auth.authenticate('action', req.body?.password);
      if (!candidate || !canPerform(auth.verify(candidate.token), operation)) {
        const count = attempts && attempts.until > now() ? attempts.count + 1 : 1;
        failedLogins.set(key, { count, until: now() + 10 * 60 * 1000 });
        return reply(res, count >= 5 ? 429 : 403, { allowed: false, message: 'Senha ou permissão inválida.' });
      }
      failedLogins.delete(key);
      return reply(res, 200, { allowed: true, name: candidate.name });
    },
    verifySales(req, res) {
      if (!requireOperation(req, res, 'settings:write')) return;
      if (!requireSalesPassword(req, res)) return;
      return reply(res, 200, { allowed: true });
    },
    backupExport(req, res) {
      if (!requireOperation(req, res, 'backup:export')) return;
      if (!requireSalesPassword(req, res)) return;
      return reply(res, 200, { success: true, data: getData() });
    },
    actionUsersList(req, res) {
      if (!requireOperation(req, res, 'settings:read')) return;
      const data = getData();
      const result = publicActionUsers(data);
      if (String(req.query?.includePasswords || '') === '1') {
        const rawUsers = Array.isArray(data.settings?.actionUsers) ? data.settings.actionUsers : [];
        result.users = result.users.map((user, index) => ({
          ...user, password: String(rawUsers[index]?.password || ''),
        }));
      }
      return reply(res, 200, { success: true, ...result });
    },
    syncLoad(req, res) {
      if (!enabled) return reply(res, 503, { success: false, message: 'Integração nativa ainda não habilitada.' });
      const user = principal(req);
      if (!user) return reply(res, 401, { success: false, message: 'Sessão ausente ou expirada.' });
      return reply(res, 200, { data: projectNativeData(getData(), user) });
    },
    async fiscalRead(req, res) {
      if (!requireOperation(req, res, 'dashboard:read')) return;
      const sources = getData()?.settings?.clippSources;
      if (!fiscalReader?.configured?.(sources)) {
        return reply(res, 503, {
          success: false,
          message: 'Leitura fiscal do Clipp ainda não configurada no servidor.',
        });
      }
      const months = Number(req.query?.months || 10);
      const referenceDate = String(req.query?.referenceDate || '').trim();
      const storeId = String(req.query?.storeId || '').trim();
      if (!Number.isInteger(months) || months < 1 || months > 12
          || (referenceDate && !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate))
          || (storeId && !/^loja[123]$/.test(storeId))) {
        return reply(res, 400, { success: false, message: 'Período fiscal inválido.' });
      }
      try {
        const data = await fiscalReader.read({
          months,
          referenceDate: referenceDate || undefined,
          storeId: storeId || undefined,
          sources,
          forceRefresh: String(req.query?.refresh || '') === '1',
        });
        return reply(res, 200, { success: true, data });
      } catch (error) {
        console.error('[Fiscal/Clipp] Falha na consulta somente leitura:', error);
        return reply(res, 503, {
          success: false,
          message: 'Não foi possível consultar o Clipp em modo somente leitura.',
        });
      }
    },
    async clippPricesSearch(req, res) {
      const user = requireOperation(req, res, 'settings:read');
      if (!user) return;
      if (!priceService?.configured?.())
        return reply(res, 503, { success: false, message: 'Auxiliar de preços ainda não configurado.' });
      try {
        const data = await priceService.search(req.body?.codes);
        return reply(res, 200, { success: true, data });
      } catch (error) {
        return reply(res, 400, { success: false, message: error.message });
      }
    },
    async clippPricesUpdate(req, res) {
      const user = requireOperation(req, res, 'settings:write');
      if (!user) return;
      if (!priceService?.configured?.())
        return reply(res, 503, { success: false, message: 'Auxiliar de preços ainda não configurado.' });
      try {
        const data = await priceService.update({ ...req.body, actor: user.name || user.role || 'Android' });
        return reply(res, 200, { success: true, data });
      } catch (error) {
        return reply(res, 400, { success: false, message: error.message });
      }
    },
    async clippPricesMobileSearch(req, res) {
      const clientIp = requireLocalNetwork(req, res);
      if (!clientIp) return;
      if (!priceService?.configured?.())
        return reply(res, 503, { success: false, message: 'Auxiliar de preços ainda não configurado.' });
      try {
        const data = await priceService.search(req.body?.codes);
        return reply(res, 200, { success: true, data });
      } catch (error) {
        return reply(res, 400, { success: false, message: error.message });
      }
    },
    async clippPricesMobileUpdate(req, res) {
      const clientIp = requireLocalNetwork(req, res);
      if (!clientIp) return;
      if (!priceService?.configured?.())
        return reply(res, 503, { success: false, message: 'Auxiliar de preços ainda não configurado.' });
      try {
        const data = await priceService.update({ ...req.body, actor: `Android ${clientIp}` });
        return reply(res, 200, { success: true, data });
      } catch (error) {
        return reply(res, 400, { success: false, message: error.message });
      }
    },
    async clippProductsMobileRegistry(req, res) {
      const clientIp = requireLocalNetwork(req, res);
      if (!clientIp) return;
      const file = path.join(dataDir, 'clipp-product-registry.json');
      const photosDir = path.join(dataDir, 'clipp-product-photos');
      try {
        const records = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
        if (req.body?.action === 'list') {
          if (records.length && priceService?.configured?.()) {
            const foundRows = await priceService.search(records.map(item => String(item.code || '')).filter(Boolean));
            for (const record of records) {
              const found = foundRows.find(item => String(item?.code || '') === String(record.code || ''));
              if (!found) continue;
              const entries = ['loja1', 'loja2', 'loja3']
                .map(storeId => ({ storeId, product: found?.stores?.[storeId]?.product }))
                .filter(item => item.product)
                .sort((a, b) => String(b.product.lastPurchaseDate || '').localeCompare(String(a.product.lastPurchaseDate || '')));
              const latestEntry = entries[0] || null;
              const latest = latestEntry?.product || null;
              record.description = found.description || record.description;
              record.barcode = latest?.barcode || record.barcode || record.code;
              record.productCode = latest?.productId ?? record.productCode ?? null;
              record.salePrice = latest?.price ?? record.salePrice ?? null;
              record.systemStock = entries.reduce((sum, item) => sum + Number(item.product.stockQuantity || 0), 0);
              record.lastPurchaseDate = latest?.lastPurchaseDate || record.lastPurchaseDate || '';
              record.lastPurchaseCost = latest?.lastPurchaseCost ?? record.lastPurchaseCost ?? null;
              record.lastPurchaseSupplier = latest?.lastPurchaseSupplier || record.lastPurchaseSupplier || '';
              record.lastPurchaseStoreId = latestEntry?.storeId || record.lastPurchaseStoreId || '';
              record.lastPurchaseStoreName = latestEntry?.storeId
                ? `Loja ${latestEntry.storeId.replace('loja', '')}`
                : (record.lastPurchaseStoreName || '');
            }
            fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8');
          }
          return reply(res, 200, { success: true, data: records
            .map(item => ({ ...item, photos: Array.from(new Set([
              ...(Array.isArray(item.photos) ? item.photos : []),
              ...(item.photoFile ? [item.photoFile] : []),
            ].filter(Boolean))) }))
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) });
        }
        const code = String(req.body?.code || '').trim();
        if (!code || code.length > 80) return reply(res, 400, { success: false, message: 'Código inválido.' });
        const existingIndex = records.findIndex(item => item.code === code);
        const existing = existingIndex >= 0 ? records[existingIndex] : null;
        const existingPhotos = Array.from(new Set([
          ...(Array.isArray(existing?.photos) ? existing.photos : []),
          ...(existing?.photoFile ? [existing.photoFile] : []),
        ].filter(Boolean)));
        if (req.body?.action === 'photo') {
          const requested = path.basename(String(req.body?.photoFile || ''));
          if (!existing || !existingPhotos.includes(requested))
            return reply(res, 404, { success: false, message: 'Foto não encontrada.' });
          const photoPath = path.join(photosDir, requested);
          if (!fs.existsSync(photoPath)) return reply(res, 404, { success: false, message: 'Arquivo da foto não encontrado.' });
          return reply(res, 200, { success: true, photoBase64: fs.readFileSync(photoPath).toString('base64') });
        }
        if (req.body?.action === 'delete') {
          if (!existing) return reply(res, 404, { success: false, message: 'Produto registrado não encontrado.' });
          for (const photoName of existingPhotos) {
            const photoPath = path.join(photosDir, path.basename(photoName));
            if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
          }
          records.splice(existingIndex, 1);
          fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8');
          return reply(res, 200, { success: true });
        }
        if (req.body?.action === 'checked') {
          if (!existing) return reply(res, 404, { success: false, message: 'Produto registrado não encontrado.' });
          existing.checked = Boolean(req.body?.checked);
          existing.checkedAt = existing.checked ? new Date().toISOString() : '';
          fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8');
          return reply(res, 200, { success: true, checked: existing.checked });
        }
        if (!priceService?.configured?.()) return reply(res, 503, { success: false, message: 'Clipp ainda não configurado.' });
        const found = (await priceService.search([code]))[0];
        const productsWithStore = ['loja1', 'loja2', 'loja3']
          .map(storeId => ({ storeId, product: found?.stores?.[storeId]?.product }))
          .filter(item => item.product);
        const products = productsWithStore.map(item => item.product);
        const latestEntry = productsWithStore
          .sort((a, b) => String(b.product.lastPurchaseDate || '').localeCompare(String(a.product.lastPurchaseDate || '')))[0] || null;
        const latest = latestEntry?.product || null;
        let photoFile = '';
        const incomingPhotos = [
          ...(Array.isArray(req.body?.photosBase64) ? req.body.photosBase64 : []),
          ...(req.body?.photoBase64 ? [req.body.photoBase64] : []),
        ].map(value => String(value || '')).filter(Boolean).slice(0, 10);
        const newPhotoFiles = [];
        for (let photoIndex = 0; photoIndex < incomingPhotos.length; photoIndex++) {
          const photo = incomingPhotos[photoIndex];
          const bytes = Buffer.from(photo.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          if (bytes.length > 5_000_000) return reply(res, 400, { success: false, message: 'Foto muito grande.' });
          fs.mkdirSync(photosDir, { recursive: true });
          photoFile = `${code.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}_${photoIndex}.jpg`;
          fs.writeFileSync(path.join(photosDir, photoFile), bytes);
          newPhotoFiles.push(photoFile);
        }
        const photos = [...existingPhotos, ...newPhotoFiles];
        const record = {
          code, description: found?.description || 'Produto não encontrado',
          barcode: latest?.barcode || code,
          productCode: latest?.productId ?? null,
          salePrice: latest?.price ?? null,
          actualStock: Number(req.body?.actualStock || 0),
          systemStock: products.reduce((sum, item) => sum + Number(item.stockQuantity || 0), 0),
          lastPurchaseDate: latest?.lastPurchaseDate || '', lastPurchaseCost: latest?.lastPurchaseCost ?? null,
          lastPurchaseSupplier: latest?.lastPurchaseSupplier || '',
          lastPurchaseStoreId: latestEntry?.storeId || '',
          lastPurchaseStoreName: latestEntry?.storeId ? `Loja ${latestEntry.storeId.replace('loja', '')}` : '',
          photoFile: photoFile || existing?.photoFile || '', photos,
          updatedAt: new Date().toISOString(), updatedBy: `Android ${clientIp}`,
        };
        const index = records.findIndex(item => item.code === code);
        if (index >= 0) records[index] = { ...records[index], ...record };
        else records.push(record);
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8');
        return reply(res, 200, { success: true, data: record });
      } catch (error) { return reply(res, 400, { success: false, message: error.message }); }
    },
    fiscalDocumentCacheGet(req, res) {
      if (!requireOperation(req, res, 'dashboard:read')) return;
      const key = normalizedFiscalKey(req.params?.accessKey);
      if (key.length !== 44)
        return reply(res, 400, { success: false, message: 'Chave fiscal inválida.' });
      const file = fiscalDocumentPath(key);
      if (!fs.existsSync(file))
        return reply(res, 404, { success: false, message: 'Documento ainda não armazenado.' });
      try {
        const bytes = fs.readFileSync(file);
        if (!isPdf(bytes)) return reply(res, 500, { success: false, message: 'Documento armazenado inválido.' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(bytes.length));
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.status(200).end(bytes);
      } catch (error) {
        console.error('[Fiscal/Cache] Falha ao ler PDF:', error);
        return reply(res, 500, { success: false, message: 'Não foi possível ler o documento armazenado.' });
      }
    },
    fiscalDocumentCacheSave(req, res) {
      if (!requireOperation(req, res, 'dashboard:read')) return;
      const key = normalizedFiscalKey(req.body?.accessKey);
      if (key.length !== 44)
        return reply(res, 400, { success: false, message: 'Chave fiscal inválida.' });
      try {
        const bytes = Buffer.from(String(req.body?.pdfBase64 || ''), 'base64');
        if (!isPdf(bytes) || bytes.length > 7 * 1024 * 1024)
          return reply(res, 400, { success: false, message: 'PDF fiscal inválido ou muito grande.' });
        fs.mkdirSync(fiscalDocumentFolder, { recursive: true });
        const target = fiscalDocumentPath(key);
        const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(temporary, bytes);
        fs.renameSync(temporary, target);
        return reply(res, 200, { success: true, accessKey: key, size: bytes.length });
      } catch (error) {
        console.error('[Fiscal/Cache] Falha ao armazenar PDF:', error);
        return reply(res, 500, { success: false, message: 'Não foi possível armazenar o documento.' });
      }
    },
    async gadgetFiscalSummary(req, res) {
      const sources = getData()?.settings?.clippSources;
      if (!fiscalReader?.configured?.(sources)) {
        return reply(res, 503, { success: false, message: 'Leitura fiscal não configurada no servidor.' });
      }
      const storeId = String(req.query?.storeId || '').trim();
      const month = String(req.query?.month || '').trim();
      if (!/^loja[123]$/.test(storeId) || !/^\d{4}-\d{2}$/.test(month))
        return reply(res, 400, { success: false, message: 'Loja ou mês inválido.' });
      try {
        const referenceDate = `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
        const data = await fiscalReader.read({ months: 1, referenceDate, storeId, sources,
          forceRefresh: String(req.query?.refresh || '') === '1' });
        const authorized = (Array.isArray(data.documents) ? data.documents : []).filter((row) =>
          String(row.storeId || '') === storeId
          && String(row.emissionDate || '').startsWith(month)
          && ['NF-e', 'NFC-e'].includes(String(row.documentType || ''))
          && String(row.status || '') === 'Autorizada');
        return reply(res, 200, {
          success: true,
          data: {
            storeId,
            month,
            total: authorized.reduce((sum, row) => sum + Number(row.total || 0), 0),
            count: authorized.length,
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error('[Gadget/Fiscal] Falha na consulta:', error);
        return reply(res, 503, { success: false, message: 'Não foi possível atualizar o Sistema Alcy.' });
      }
    },
    syncSave(req, res) {
      if (!enabled) return reply(res, 503, { success: false, message: 'Integração nativa ainda não habilitada.' });
      const user = principal(req);
      if (!user) return reply(res, 401, { success: false, message: 'Sessão ausente ou expirada.' });
      try {
        const { branch, storeId, date, expectedDay, day } = req.body || {};
        const operationId = String(req.body?.operationId || '').trim().toLowerCase();
        const parsedDate = new Date(`${date}T00:00:00Z`);
        if (!['caixa', 'fechamento', 'lancamentos'].includes(branch)
            || !/^loja[123]$/.test(String(storeId))
            || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))
            || Number.isNaN(parsedDate.getTime())
            || parsedDate.toISOString().slice(0, 10) !== date
            || !day || typeof day !== 'object' || Array.isArray(day))
          throw new TransactionInputError('Área, loja, data ou dia inválido.');
        if (operationId && !/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(operationId))
          throw new TransactionInputError('Identificador da operação inválido.');
        if (branch === 'fechamento' && !canPerform(user, 'closing:read'))
          return reply(res, 403, { success: false, message: 'Sem permissão para Fechamento.' });
        if (branch === 'caixa' && !canPerform(user, 'caixa:create'))
          return reply(res, 403, { success: false, message: 'Sem permissão para Caixa.' });
        if (branch === 'lancamentos' && user.role !== 'sales')
          return reply(res, 403, { success: false, message: 'Sem permissão para Lançamento.' });
        if (branch === 'lancamentos' && (day.source !== 'manual-windows'
            || !day.values || typeof day.values !== 'object' || Array.isArray(day.values)))
          throw new TransactionInputError('Lançamento manual sem valores válidos.');
        if (user.role === 'action' && date !== serverDate()
            && !canPerform(user, 'date:change'))
          return reply(res, 403, { success: false, message: 'Sem permissão para alterar outra data.' });
        const current = getData();
        const operationFingerprint = operationId ? snapshotRevision({
          branch, storeId, date, expectedDay: expectedDay ?? null, day,
        }) : null;
        const receipts = Array.isArray(current.settings?.nativeOperationReceipts)
          ? current.settings.nativeOperationReceipts : [];
        const priorReceipt = operationId
          ? receipts.find((item) => item?.operationId === operationId) : null;
        if (priorReceipt) {
          if (priorReceipt.fingerprint !== operationFingerprint
              || priorReceipt.actor !== user.name || priorReceipt.role !== user.role)
            throw new TransactionConflict('O identificador da operação já foi usado com outros dados.');
          return reply(res, 200, { success: true, replayed: true, syncMeta: current._syncMeta });
        }
        const previous = current[branch]?.[storeId]?.[date] ?? null;
        if (snapshotRevision(previous) !== snapshotRevision(expectedDay ?? null))
          throw new TransactionConflict('Este dia mudou em outra máquina. Recarregue antes de salvar.');
        const next = structuredClone(current);
        next[branch] ||= {};
        next[branch][storeId] ||= {};
        next[branch][storeId][date] = structuredClone(day);
        next.settings.timeline ||= [];
        if (branch === 'caixa') {
          const summary = classifyCaixaDayChange(previous, day);
          if (summary.edited && !canPerform(user, 'caixa:edit'))
            return reply(res, 403, { success: false, message: 'Sem permissão para editar itens.' });
          if (summary.deleted && !canPerform(user, 'caixa:delete'))
            return reply(res, 403, { success: false, message: 'Sem permissão para excluir itens.' });
          for (const change of describeCaixaDayChanges(previous, day)) {
            next.settings.timeline.push({
              id: randomUUID(), timestamp: now(), module: 'caixa', storeId, date,
              action: change.action, userName: user.name, itemId: change.id,
              beforeCategory: change.before?.category, afterCategory: change.after?.category,
              beforeDescription: change.before?.description, afterDescription: change.after?.description,
              oldValue: change.before?.value, newValue: change.after?.value,
              description: `Caixa: ${change.action} de item ${change.id}`,
            });
          }
        } else if (branch === 'fechamento') {
          for (const key of new Set([...Object.keys(previous || {}), ...Object.keys(day)])) {
            if (snapshotRevision(previous?.[key] ?? null) === snapshotRevision(day[key] ?? null)) continue;
            next.settings.timeline.push({ id: randomUUID(), timestamp: now(),
              module: 'fechamento', storeId, date, action: 'update', userName: user.name,
              field: key, oldValue: previous?.[key] ?? null, newValue: day[key] ?? null,
              description: `Fechamento alterado: ${key}` });
          }
        } else {
          for (const key of new Set([...Object.keys(previous?.values || {}), ...Object.keys(day.values)])) {
            if (snapshotRevision(previous?.values?.[key] ?? null)
                === snapshotRevision(day.values[key] ?? null)) continue;
            next.settings.timeline.push({ id: randomUUID(), timestamp: now(),
              module: 'lancamentos', storeId, date, action: 'update', userName: user.name,
              source: 'manual-windows', field: key,
              oldValue: previous?.values?.[key] ?? null, newValue: day.values[key] ?? null,
              description: `Lançamento manual alterado: ${key}` });
          }
        }
        if (branch !== 'lancamentos') {
          next._syncMeta ||= {};
          next._syncMeta.caixaFechamentoVersion = Number(next._syncMeta.caixaFechamentoVersion || 0) + 1;
        }
        if (operationId) {
          next.settings.nativeOperationReceipts = [...receipts, {
            operationId, fingerprint: operationFingerprint, actor: user.name, role: user.role,
            branch, storeId, date, timestamp: now(),
          }].slice(-2000);
        }
        next.settings.timeline = next.settings.timeline.slice(-2000);
        writeSnapshot(next);
        return reply(res, 200, { success: true, syncMeta: next._syncMeta });
      } catch (error) { return failure(res, error); }
    },
    counterSave(req, res) {
      if (!requireOperation(req, res, 'counter:write')) return;
      try {
        const { next, config } = buildCounterTransaction(getData(), req.body,
          { actor: principal(req).name, now: now() });
        writeSnapshot(next);
        return reply(res, 200, { success: true, config });
      } catch (error) { return failure(res, error); }
    },
    historyClear(req, res) {
      if (!requireOperation(req, res, 'settings:write')) return;
      if (!requireSalesPassword(req, res)) return;
      try {
        const { next, removed } = buildHistoryClearTransaction(getData(), req.body?.kind);
        writeSnapshot(next);
        return reply(res, 200, { success: true, removed });
      } catch (error) { return failure(res, error); }
    },
    occurrencesClear(req, res) {
      if (!requireOperation(req, res, 'settings:write')) return;
      if (!requireSalesPassword(req, res)) return;
      try {
        const { next, removedAccessLogs, removedTimeline } = buildOccurrenceClearTransaction(
          getData(), req.body);
        writeSnapshot(next);
        return reply(res, 200, { success: true, removedAccessLogs, removedTimeline });
      } catch (error) { return failure(res, error); }
    },
    actionUsersChange(req, res) {
      if (!requireOperation(req, res, 'settings:write')) return;
      try {
        const before = getData();
        const current = publicActionUsers(before);
        if (req.body?.expectedRevision !== current.revision)
          throw new TransactionConflict('Os usuários mudaram em outra máquina. Atualize a lista.');
        const operation = req.body?.operation;
        if (!['create', 'update', 'delete'].includes(operation))
          throw new TransactionInputError('Operação de usuário inválida.');
        const next = structuredClone(before);
        const users = next.settings.actionUsers;
        const index = current.users.findIndex((user) => user.id === req.body?.id);
        const name = String(req.body?.name || '').trim();
        const password = String(req.body?.password || '').trim();
        const permissions = req.body?.permissions;
        if (operation === 'delete') {
          if (index < 0) throw new TransactionConflict('Usuário não encontrado na lista atual.');
          if (!requireSalesPassword(req, res, 'masterPassword')) return;
          users.splice(index, 1);
        } else {
          if (!name || !Array.isArray(permissions) || permissions.length === 0
              || permissions.some((item) => !['edit', 'delete', 'changeDate', 'viewSales'].includes(item)))
            throw new TransactionInputError('Nome ou permissões de usuário inválidos.');
          if (operation === 'create') {
            if (password.length < 4) throw new TransactionInputError('Senha precisa de ao menos quatro caracteres.');
            users.push({ id: randomUUID(), name, password, permissions });
          } else {
            if (index < 0) throw new TransactionConflict('Usuário não encontrado na lista atual.');
            if (password && password.length < 4)
              throw new TransactionInputError('Senha nova precisa de ao menos quatro caracteres.');
            users[index] = { ...users[index], id: current.users[index].id,
              name, password: password || users[index].password, permissions };
          }
          const changed = users[operation === 'create' ? users.length - 1 : index];
          if (users.some((user) => user !== changed && user.password === changed.password))
            throw new TransactionInputError('Essa senha já pertence a outro usuário.');
        }
        next.settings.timeline ||= [];
        next.settings.timeline.push({ id: randomUUID(), timestamp: now(), module: 'opcoes',
          action: operation === 'delete' ? 'delete' : 'update', field: 'actionUsers',
          userName: 'Gerencial Windows', details: `Usuário de ação ${operation}: ${operation === 'delete' ? current.users[index].name : name}` });
        writeSnapshot(next);
        return reply(res, 200, { success: true, ...publicActionUsers(next) });
      } catch (error) { return failure(res, error); }
    },
    purchaseCapability(req, res) {
      if (!requireOperation(req, res, 'purchases:write')) return;
      return reply(res, 200, { atomicTransactions: !blocked });
    },
    purchaseTransaction(req, res) {
      if (!requireOperation(req, res, 'purchases:write')) return;
      try {
        const next = buildPurchaseTransaction(getData(), req.body);
        writeSnapshot(next);
        return reply(res, 200, { success: true, revision: snapshotRevision(next) });
      } catch (error) { return failure(res, error); }
    },
    purchaseOptionsSave(req, res) {
      if (!requireOperation(req, res, 'purchases:write')) return;
      try {
        const next = buildPurchaseOptionsTransaction(getData(), req.body,
          { actor: principal(req).name, now: now() });
        writeSnapshot(next);
        return reply(res, 200, { success: true, purchaseOptions: next.settings.purchaseOptions });
      } catch (error) { return failure(res, error); }
    },
    restoreCapability(req, res) {
      if (!requireOperation(req, res, 'restore:full')) return;
      if (blocked) return reply(res, 503, { fullRestore: false });
      return reply(res, 200, { fullRestore: true, revision: snapshotRevision(getData()) });
    },
    restoreFull(req, res) {
      if (!requireOperation(req, res, 'restore:full')) return;
      if (!requireSalesPassword(req, res)) return;
      try {
        const before = getData();
        const next = buildRestoreTransaction(before, req.body);
        createPreRestoreBackup({ backupDir, snapshot: before });
        writeSnapshot(next);
        return reply(res, 200, { success: true, revision: snapshotRevision(next) });
      } catch (error) { return failure(res, error); }
    },
  };
}
