import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SEP = String.fromCharCode(31);
const clean = (value) => String(value ?? '').replace(/[\r\n\u001f]/g, ' ').trim();
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const moneySql = (value) => Number(value).toFixed(2);

function runIsql({ executable, database, user, password, sql, timeoutMs = 30_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-q', '-b', database], {
      windowsHide: true,
      env: { ...process.env, ISC_USER: user, ISC_PASSWORD: password },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Tempo limite do Clipp excedido.')); }, timeoutMs);
    child.stdout.setEncoding('latin1'); child.stderr.setEncoding('latin1');
    child.stdout.on('data', (part) => { stdout += part; });
    child.stderr.on('data', (part) => { stderr += part; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`;
      if (code !== 0 || /Statement failed|SQL error|I\/O error/i.test(combined)) {
        reject(new Error('O Firebird recusou a operação ou a loja está offline.'));
        return;
      }
      resolve(stdout);
    });
    child.stdin.end(sql, 'utf8');
  });
}

function searchSql(codes) {
  const literals = codes.map(sqlText).join(',');
  const externalPurchase = (item, header, supplier) => `
    ${item}.ID_IDENTIFICADOR = e.ID_ESTOQUE
    AND ${header}.ID_NFCOMPRA = ${item}.ID_NFCOMPRA
    AND ${supplier}.ID_FORNEC = ${header}.ID_FORNEC
    AND ${header}.STATUS = 'E'
    AND REPLACE(REPLACE(REPLACE(TRIM(CAST(${supplier}.CNPJ AS VARCHAR(30))), '.', ''), '/', ''), '-', '')
      NOT IN ('09545637000138', '42016151000188', '68688596000106')`;
  return `
SET BAIL ON;
SET HEADING OFF;
SET LIST OFF;
SET COUNT OFF;
COMMIT;
SET TRANSACTION READ ONLY READ COMMITTED RECORD_VERSION WAIT;
SET WIDTH ROW_DATA 2048;
SELECT CAST(
  CAST(e.ID_ESTOQUE AS VARCHAR(30)) || ASCII_CHAR(31) ||
  REPLACE(REPLACE(REPLACE(COALESCE(TRIM(e.DESCRICAO), ''), ASCII_CHAR(13), ' '), ASCII_CHAR(10), ' '), ASCII_CHAR(31), ' ') || ASCII_CHAR(31) ||
  COALESCE(TRIM(p.COD_BARRA), '') || ASCII_CHAR(31) ||
  COALESCE(TRIM(p.REFERENCIA), '') || ASCII_CHAR(31) ||
  CAST(CAST(e.PRC_VENDA AS NUMERIC(18,2)) AS VARCHAR(40)) || ASCII_CHAR(31) ||
  COALESCE(CAST((SELECT FIRST 1 CAST(ci.VLR_UNIT AS NUMERIC(18,4))
    FROM TB_NFC_ITEM ci, TB_NFCOMPRA ch, TB_FORNECEDOR cf
    WHERE ${externalPurchase('ci', 'ch', 'cf')}
    ORDER BY COALESCE(ch.DT_ENTRADA, ch.DT_EMISSAO) DESC, ch.ID_NFCOMPRA DESC) AS VARCHAR(40)), '') || ASCII_CHAR(31) ||
  COALESCE(CAST((SELECT FIRST 1 EXTRACT(YEAR FROM COALESCE(di.DT_ENTRADA, di.DT_EMISSAO))
    FROM TB_NFC_ITEM dit, TB_NFCOMPRA di, TB_FORNECEDOR df
    WHERE ${externalPurchase('dit', 'di', 'df')}
    ORDER BY COALESCE(di.DT_ENTRADA, di.DT_EMISSAO) DESC, di.ID_NFCOMPRA DESC) AS VARCHAR(4)), '') || ASCII_CHAR(31) ||
  COALESCE(CAST((SELECT FIRST 1 EXTRACT(MONTH FROM COALESCE(mi.DT_ENTRADA, mi.DT_EMISSAO))
    FROM TB_NFC_ITEM mit, TB_NFCOMPRA mi, TB_FORNECEDOR mf
    WHERE ${externalPurchase('mit', 'mi', 'mf')}
    ORDER BY COALESCE(mi.DT_ENTRADA, mi.DT_EMISSAO) DESC, mi.ID_NFCOMPRA DESC) AS VARCHAR(2)), '') || ASCII_CHAR(31) ||
  COALESCE(CAST((SELECT FIRST 1 EXTRACT(DAY FROM COALESCE(ai.DT_ENTRADA, ai.DT_EMISSAO))
    FROM TB_NFC_ITEM ait, TB_NFCOMPRA ai, TB_FORNECEDOR af
    WHERE ${externalPurchase('ait', 'ai', 'af')}
    ORDER BY COALESCE(ai.DT_ENTRADA, ai.DT_EMISSAO) DESC, ai.ID_NFCOMPRA DESC) AS VARCHAR(2)), '') || ASCII_CHAR(31) ||
  COALESCE((SELECT FIRST 1 REPLACE(REPLACE(REPLACE(TRIM(sf.NOME), ASCII_CHAR(13), ' '), ASCII_CHAR(10), ' '), ASCII_CHAR(31), ' ')
    FROM TB_NFC_ITEM si, TB_NFCOMPRA sh, TB_FORNECEDOR sf
    WHERE ${externalPurchase('si', 'sh', 'sf')}
    ORDER BY COALESCE(sh.DT_ENTRADA, sh.DT_EMISSAO) DESC, sh.ID_NFCOMPRA DESC), '') || ASCII_CHAR(31) ||
  COALESCE((SELECT FIRST 1 TRIM(CAST(nh.NF_NUMERO AS VARCHAR(30)))
    FROM TB_NFC_ITEM ni, TB_NFCOMPRA nh, TB_FORNECEDOR nf
    WHERE ${externalPurchase('ni', 'nh', 'nf')}
    ORDER BY COALESCE(nh.DT_ENTRADA, nh.DT_EMISSAO) DESC, nh.ID_NFCOMPRA DESC), '') || ASCII_CHAR(31) ||
  CAST(CAST(COALESCE(p.QTD_ATUAL, 0) AS NUMERIC(18,3)) AS VARCHAR(40))
AS VARCHAR(2048)) AS ROW_DATA
FROM TB_ESTOQUE e
LEFT JOIN TB_EST_PRODUTO p ON p.ID_IDENTIFICADOR = e.ID_ESTOQUE
WHERE CAST(e.ID_ESTOQUE AS VARCHAR(30)) IN (${literals})
   OR TRIM(p.COD_BARRA) IN (${literals})
   OR TRIM(p.REFERENCIA) IN (${literals});
COMMIT;
QUIT;
`;
}

function updateSql(productId, oldPrice, newPrice) {
  return `
SET BAIL ON;
SET HEADING OFF;
SET LIST OFF;
SET COUNT ON;
COMMIT;
SET TRANSACTION READ WRITE READ COMMITTED RECORD_VERSION WAIT;
UPDATE TB_ESTOQUE SET PRC_VENDA = ${moneySql(newPrice)}
WHERE ID_ESTOQUE = ${Number(productId)} AND PRC_VENDA = ${moneySql(oldPrice)};
SELECT CAST(CAST(PRC_VENDA AS NUMERIC(18,2)) AS VARCHAR(40))
FROM TB_ESTOQUE WHERE ID_ESTOQUE = ${Number(productId)};
COMMIT;
QUIT;
`;
}

export function createClippPriceService({ dataDir, executable, stores, user, password }) {
  const configured = Boolean(executable && user && password && stores
    && ['loja1', 'loja2', 'loja3'].every((id) => stores[id]?.database));
  const historyFile = path.join(dataDir, 'clipp-price-history.jsonl');
  const storeList = ['loja1', 'loja2', 'loja3'].map((id, index) => ({
    id, name: `Loja ${index + 1}`, database: String(stores?.[id]?.database || ''),
  }));
  const connection = (store) => ({ executable, database: store.database, user, password });
  const normalizeCodes = (values) => [...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value)).filter((value) => value && value.length <= 80))].slice(0, 100);
  const matches = (row, code) => String(row.productId) === code
    || row.barcode.toUpperCase() === code.toUpperCase()
    || row.reference.toUpperCase() === code.toUpperCase();

  return {
    configured: () => configured,
    async search(values) {
      if (!configured) throw new Error('Sincronização de preços ainda não configurada.');
      const codes = normalizeCodes(values);
      if (!codes.length) throw new Error('Informe ao menos um código.');
      const statuses = await Promise.all(storeList.map(async (store) => {
        try {
          const output = await runIsql({ ...connection(store), sql: searchSql(codes) });
          const products = String(output).split(/\r?\n/).filter((line) => line.includes(SEP)).map((line) => {
            const fields = line.trimEnd().split(SEP).map(clean);
            const lastPurchaseDate = fields[6] && fields[7] && fields[8]
              ? `${fields[6].padStart(4, '0')}-${fields[7].padStart(2, '0')}-${fields[8].padStart(2, '0')}` : '';
            return fields.length === 12 ? {
              storeId: store.id, productId: Number(fields[0]), description: fields[1],
              barcode: fields[2], reference: fields[3], price: Number(fields[4]),
              lastPurchaseCost: fields[5] ? Number(fields[5]) : null,
              lastPurchaseDate, lastPurchaseSupplier: fields[9], lastPurchaseNumber: fields[10],
              stockQuantity: Number(fields[11] || 0),
            } : null;
          }).filter((row) => row && Number.isFinite(row.productId) && Number.isFinite(row.price));
          return { storeId: store.id, storeName: store.name, online: true, products };
        } catch (error) {
          return { storeId: store.id, storeName: store.name, online: false, message: error.message, products: [] };
        }
      }));
      return codes.map((code) => {
        const storesResult = Object.fromEntries(statuses.map((status) => [status.storeId, {
          online: status.online, message: status.message || '',
          product: status.products.find((row) => matches(row, code)) || null,
        }]));
        const description = ['loja1', 'loja2', 'loja3']
          .map((id) => storesResult[id].product?.description).find(Boolean) || 'Produto não encontrado';
        const latestPurchaseStoreId = ['loja1', 'loja2', 'loja3']
          .map((id) => ({ id, date: storesResult[id].product?.lastPurchaseDate || '' }))
          .sort((left, right) => right.date.localeCompare(left.date))[0];
        return { code, description, stores: storesResult,
          latestPurchaseStoreId: latestPurchaseStoreId?.date ? latestPurchaseStoreId.id : '' };
      });
    },
    async update({ code, newPrice, targets, actor }) {
      if (!configured) throw new Error('Sincronização de preços ainda não configurada.');
      const price = Number(newPrice);
      if (!Number.isFinite(price) || price <= 0 || price > 9_999_999) throw new Error('Novo preço inválido.');
      if (!targets || typeof targets !== 'object') throw new Error('Nenhuma loja selecionada.');
      const results = [];
      for (const store of storeList) {
        const target = targets[store.id];
        if (!target) continue;
        const productId = Number(target.productId); const oldPrice = Number(target.oldPrice);
        if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(oldPrice)) {
          results.push({ storeId: store.id, success: false, message: 'Dados anteriores inválidos.' });
          continue;
        }
        try {
          const output = await runIsql({ ...connection(store), sql: updateSql(productId, oldPrice, price) });
          if (!/Records affected:\s*1/i.test(output)) throw new Error('O preço mudou; pesquise novamente.');
          const result = { storeId: store.id, storeName: store.name, success: true, oldPrice, newPrice: price };
          results.push(result);
          fs.mkdirSync(dataDir, { recursive: true });
          fs.appendFileSync(historyFile, `${JSON.stringify({ timestamp: new Date().toISOString(), actor,
            code: clean(code), productId, ...result })}\n`, 'utf8');
        } catch (error) {
          const result = { storeId: store.id, storeName: store.name, success: false, message: error.message };
          results.push(result);
          fs.mkdirSync(dataDir, { recursive: true });
          fs.appendFileSync(historyFile, `${JSON.stringify({ timestamp: new Date().toISOString(), actor,
            code: clean(code), productId, oldPrice, newPrice: price, ...result })}\n`, 'utf8');
        }
      }
      if (!results.length) throw new Error('Nenhuma loja selecionada.');
      return results;
    },
  };
}

export const _test = { searchSql };
