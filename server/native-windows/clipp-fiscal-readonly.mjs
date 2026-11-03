import { spawn } from 'node:child_process';

const FIELD_SEPARATOR = String.fromCharCode(31);
const DEFAULT_TIMEOUT_MS = 30_000;

function cleanText(value) {
  return String(value ?? '').replace(/[\r\n\u001f]/g, ' ').trim();
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function monthStart(referenceDate, months) {
  const date = new Date(`${referenceDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error('Data de referência fiscal inválida.');
  const start = new Date(date.getFullYear(), date.getMonth() - (months - 1), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const format = (item) => `${item.getFullYear()}-${String(item.getMonth() + 1).padStart(2, '0')}-${String(item.getDate()).padStart(2, '0')}`;
  return { start: format(start), end: format(end) };
}

function buildSql(start, end) {
  return `
SET BAIL ON;
SET HEADING OFF;
SET LIST OFF;
SET COUNT OFF;
COMMIT;
SET TRANSACTION READ ONLY READ COMMITTED RECORD_VERSION WAIT;
SET WIDTH ROW_DATA 1024;
SELECT CAST(
  CAST(EXTRACT(YEAR FROM DT_EMISSAO) AS INTEGER) || ASCII_CHAR(31) ||
  CAST(EXTRACT(MONTH FROM DT_EMISSAO) AS INTEGER) || ASCII_CHAR(31) ||
  CAST(EXTRACT(DAY FROM DT_EMISSAO) AS INTEGER) || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(tnf.NF_NUMERO AS VARCHAR(30))), '') || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(tnf.NF_SERIE AS VARCHAR(20))), '') || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(tnf.NF_MODELO AS VARCHAR(10))), '') || ASCII_CHAR(31) ||
  REPLACE(REPLACE(REPLACE(COALESCE(TRIM(CAST(tcl.NOME AS VARCHAR(160))), ''), ASCII_CHAR(13), ' '), ASCII_CHAR(10), ' '), ASCII_CHAR(31), ' ') || ASCII_CHAR(31) ||
  CAST(CAST((SELECT TOTALNF FROM SP_TOTAL_NFV(tnf.ID_NFVENDA)) AS NUMERIC(18,2)) AS VARCHAR(40)) || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(tnf.STATUS AS VARCHAR(10))), '') || ASCII_CHAR(31) ||
  '' || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(nfe.STATUS AS VARCHAR(20))), '') || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(nfe.ID_NFE AS VARCHAR(80))), '')
AS VARCHAR(1024)) AS ROW_DATA
FROM TB_NFVENDA tnf
JOIN TB_CLIENTE tcl ON tcl.ID_CLIENTE = tnf.ID_CLIENTE
LEFT JOIN TB_NFE nfe ON nfe.ID_NFVENDA = tnf.ID_NFVENDA
WHERE tnf.DT_EMISSAO >= ${sqlText(start)}
  AND tnf.DT_EMISSAO < ${sqlText(end)}
  AND tnf.NF_MODELO IN ('55', '65')
ORDER BY tnf.DT_EMISSAO DESC, tnf.NF_MODELO, tnf.NF_NUMERO;
COMMIT;
QUIT;
`;
}

function buildPurchaseSql(start, end) {
  return `
SET BAIL ON;
SET HEADING OFF;
SET LIST OFF;
SET COUNT OFF;
COMMIT;
SET TRANSACTION READ ONLY READ COMMITTED RECORD_VERSION WAIT;
SET WIDTH ROW_DATA 1024;
SELECT CAST(
  CAST(EXTRACT(YEAR FROM COALESCE(tnc.DT_ENTRADA, tnc.DT_EMISSAO)) AS INTEGER) || ASCII_CHAR(31) ||
  CAST(EXTRACT(MONTH FROM COALESCE(tnc.DT_ENTRADA, tnc.DT_EMISSAO)) AS INTEGER) || ASCII_CHAR(31) ||
  CAST(EXTRACT(DAY FROM COALESCE(tnc.DT_ENTRADA, tnc.DT_EMISSAO)) AS INTEGER) || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(tnc.NF_NUMERO AS VARCHAR(30))), '') || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(tnc.NF_SERIE AS VARCHAR(20))), '') || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(tnc.NF_MODELO AS VARCHAR(10))), '') || ASCII_CHAR(31) ||
  REPLACE(REPLACE(REPLACE(COALESCE(TRIM(CAST(tfr.NOME AS VARCHAR(160))), ''), ASCII_CHAR(13), ' '), ASCII_CHAR(10), ' '), ASCII_CHAR(31), ' ') || ASCII_CHAR(31) ||
  CAST(CAST((SELECT TOTALNF FROM SP_TOTAL_NFC(tnc.ID_NFCOMPRA, 0)) AS NUMERIC(18,2)) AS VARCHAR(40)) || ASCII_CHAR(31) ||
  COALESCE(TRIM(CAST(tnc.STATUS AS VARCHAR(10))), '') || ASCII_CHAR(31) ||
  'NF de entrada' || ASCII_CHAR(31) ||
  '' || ASCII_CHAR(31) ||
  COALESCE(NULLIF(TRIM(CAST(tcc.CHAVE_ACESSO AS VARCHAR(80))), ''),
    NULLIF(TRIM(CAST((SELECT FIRST 1 mde.ID_NFE FROM V_NFE_MDE mde
      WHERE CAST(mde.NF_NUMERO AS BIGINT) = CAST(tnc.NF_NUMERO AS BIGINT)
        AND CAST(mde.EMISSAO AS DATE) = CAST(tnc.DT_EMISSAO AS DATE)
        AND REPLACE(REPLACE(REPLACE(TRIM(CAST(mde.CNPJ AS VARCHAR(30))), '.', ''), '/', ''), '-', '') =
            REPLACE(REPLACE(REPLACE(TRIM(CAST(tfr.CNPJ AS VARCHAR(30))), '.', ''), '/', ''), '-', '')
        AND CHAR_LENGTH(TRIM(CAST(mde.ID_NFE AS VARCHAR(80)))) = 44) AS VARCHAR(80))), ''), '')
AS VARCHAR(1024)) AS ROW_DATA
FROM TB_NFCOMPRA tnc
JOIN TB_FORNECEDOR tfr ON tfr.ID_FORNEC = tnc.ID_FORNEC
LEFT JOIN TB_NFCOMPRA_COMPL tcc ON tcc.ID_NFCOMPRA = tnc.ID_NFCOMPRA
WHERE COALESCE(tnc.DT_ENTRADA, tnc.DT_EMISSAO) >= ${sqlText(start)}
  AND COALESCE(tnc.DT_ENTRADA, tnc.DT_EMISSAO) < ${sqlText(end)}
ORDER BY COALESCE(tnc.DT_ENTRADA, tnc.DT_EMISSAO) DESC, tnc.NF_NUMERO;
COMMIT;
QUIT;
`;
}

function buildUnregisteredPurchaseSql(start, end) {
  return `
SET BAIL ON;
SET HEADING OFF;
SET LIST OFF;
SET COUNT OFF;
COMMIT;
SET TRANSACTION READ ONLY READ COMMITTED RECORD_VERSION WAIT;
SET WIDTH ROW_DATA 1024;
SELECT CAST(
  CAST(EXTRACT(YEAR FROM m.EMISSAO) AS INTEGER) || ASCII_CHAR(31) ||
  CAST(EXTRACT(MONTH FROM m.EMISSAO) AS INTEGER) || ASCII_CHAR(31) ||
  CAST(EXTRACT(DAY FROM m.EMISSAO) AS INTEGER) || ASCII_CHAR(31) ||
  TRIM(CAST(CAST(SUBSTRING(m.ID_NFE FROM 26 FOR 9) AS BIGINT) AS VARCHAR(30))) || ASCII_CHAR(31) ||
  TRIM(SUBSTRING(m.ID_NFE FROM 23 FOR 3)) || ASCII_CHAR(31) ||
  SUBSTRING(m.ID_NFE FROM 21 FOR 2) || ASCII_CHAR(31) ||
  REPLACE(REPLACE(REPLACE(COALESCE(TRIM(CAST(m.NOME AS VARCHAR(160))), ''), ASCII_CHAR(13), ' '), ASCII_CHAR(10), ' '), ASCII_CHAR(31), ' ') || ASCII_CHAR(31) ||
  CAST(CAST(COALESCE(m.VALOR, 0) AS NUMERIC(18,2)) AS VARCHAR(40)) || ASCII_CHAR(31) ||
  '' || ASCII_CHAR(31) ||
  'NF PENDENTE MDE' || ASCII_CHAR(31) ||
  CASE WHEN EXISTS(SELECT 1 FROM TB_NFE_MDE_EVENTOS e
    WHERE e.ID_MDE = m.ID_MDE AND e.TIP_EVENTO = '210200') THEN 'CONFIRMADA' ELSE 'PENDENTE' END || ASCII_CHAR(31) ||
  TRIM(CAST(m.ID_NFE AS VARCHAR(80)))
AS VARCHAR(1024)) AS ROW_DATA
FROM TB_NFE_MDE m
WHERE m.EMISSAO >= ${sqlText(start)}
  AND m.EMISSAO < ${sqlText(end)}
  AND CHAR_LENGTH(TRIM(m.ID_NFE)) = 44
  AND NOT EXISTS(
    SELECT 1
    FROM TB_NFCOMPRA n
    JOIN TB_FORNECEDOR f ON f.ID_FORNEC = n.ID_FORNEC
    LEFT JOIN TB_NFCOMPRA_COMPL c ON c.ID_NFCOMPRA = n.ID_NFCOMPRA
    WHERE TRIM(c.CHAVE_ACESSO) = TRIM(m.ID_NFE)
       OR (CAST(n.NF_NUMERO AS BIGINT) = CAST(SUBSTRING(m.ID_NFE FROM 26 FOR 9) AS BIGINT)
         AND CAST(n.DT_EMISSAO AS DATE) = m.EMISSAO
         AND REPLACE(REPLACE(REPLACE(TRIM(CAST(f.CNPJ AS VARCHAR(30))), '.', ''), '/', ''), '-', '') = SUBSTRING(m.ID_NFE FROM 7 FOR 14))
  )
ORDER BY m.EMISSAO DESC, m.NOME;
COMMIT;
QUIT;
`;
}

function buildMdeNsuSql() {
  return `SET HEADING OFF; SET LIST OFF; SELECT COALESCE(MAX(NSU), 0) FROM TB_NFE_MDE; QUIT;`;
}

function parseRows(output, source = {}) {
  const storeId = /^loja[123]$/.test(String(source.storeId || '')) ? String(source.storeId) : 'loja1';
  const storeName = String(source.storeName || '').trim() || `Loja ${storeId.slice(-1)}`;
  const documents = [];
  for (const rawLine of String(output).split(/\r?\n/)) {
    if (!rawLine.includes(FIELD_SEPARATOR)) continue;
    const fields = rawLine.trimEnd().split(FIELD_SEPARATOR).map(cleanText);
    if (fields.length !== 12) continue;
    const [year, month, day, number, series, model, recipient, amount,
      saleStatus, visualStatus, fiscalStatus, accessKey] = fields;
    const emissionDate = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00`;
    const total = Number(amount);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(emissionDate) || !Number.isFinite(total)) continue;
    const saleCode = saleStatus.toUpperCase();
    const statusCode = fiscalStatus.trim();
    const isPurchase = visualStatus === 'NF de entrada';
    const isUnregisteredPurchase = visualStatus === 'NF PENDENTE MDE';
    let status = isPurchase ? 'Entrada registrada'
      : isUnregisteredPurchase ? (statusCode === 'CONFIRMADA' ? 'Confirmada' : 'Pendente')
      : visualStatus || 'Não autorizada';
    if (!isPurchase && (/cancel/i.test(status) || saleCode === 'C')) status = 'Cancelada';
    else if (!isPurchase && saleCode === 'X') status = 'Inutilizada';
    else if (!isPurchase && (statusCode === '100' || statusCode === '150')) status = 'Autorizada';
    else if (!isPurchase && saleCode === 'I') status = 'Impressa';
    else if (!isPurchase && saleCode === 'E' && !visualStatus) status = 'Não autorizada';
    const includedInClippTotal = !isPurchase && status === 'Autorizada';
    documents.push({
      emissionDate,
      documentType: isPurchase ? 'NF de entrada' : isUnregisteredPurchase ? 'NF não cadastrada' : model === '65' ? 'NFC-e' : 'NF-e',
      storeId,
      storeName,
      number,
      series,
      accessKey,
      recipient: recipient || 'Consumidor não identificado',
      recipientDocument: '',
      payment: isUnregisteredPurchase ? 'Disponível no MDe do Clipp' : 'Registrada no Clipp',
      total,
      status,
      fiscalStatusCode: statusCode,
      source: 'Clipp/Firebird',
      includedInClippTotal,
    });
  }
  return documents;
}

function runIsql({ executable, database, user, password, sql, timeoutMs }) {
  return new Promise((resolve, reject) => {
    // O banco legado contém textos fora de UTF-8; charset NONE evita que uma
    // descrição antiga interrompa toda a leitura por erro de transliteração.
    const child = spawn(executable, ['-q', '-b', database], {
      windowsHide: true,
      env: { ...process.env, ISC_USER: user, ISC_PASSWORD: password },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('A consulta fiscal excedeu o tempo limite.'));
    }, timeoutMs);
    child.stdout.setEncoding('latin1');
    child.stderr.setEncoding('latin1');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || /Statement failed|SQL error|I\/O error/i.test(`${stdout}\n${stderr}`)) {
        reject(new Error(`Consulta fiscal recusada pelo Firebird (${code ?? 'sem código'}).`));
        return;
      }
      resolve(stdout);
    });
    child.stdin.end(sql, 'utf8');
  });
}

export function createClippFiscalReader(options = {}) {
  const executable = options.executable || process.env.CLIPP_ISQL_PATH || '';
  const database = options.database || process.env.CLIPP_DATABASE || '';
  const databaseLoja2 = options.databaseLoja2 || process.env.CLIPP_DATABASE_LOJA2 || '';
  const databaseLoja3 = options.databaseLoja3 || process.env.CLIPP_DATABASE_LOJA3 || '';
  const user = options.user || process.env.CLIPP_DB_USER || '';
  const password = options.password || process.env.CLIPP_DB_PASSWORD || '';
  const credentialsByStore = {
    loja1: { user, password },
    loja2: {
      user: options.userLoja2 || process.env.CLIPP_DB_USER_LOJA2 || user,
      password: options.passwordLoja2 || process.env.CLIPP_DB_PASSWORD_LOJA2 || password,
    },
    loja3: {
      user: options.userLoja3 || process.env.CLIPP_DB_USER_LOJA3 || user,
      password: options.passwordLoja3 || process.env.CLIPP_DB_PASSWORD_LOJA3 || password,
    },
  };
  const timeoutMs = Math.max(5_000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  let cache = null;

  function normalizeSources(configuredSources) {
    const items = [];
    const hasConfiguredSources = configuredSources && typeof configuredSources === 'object'
      && ['loja1', 'loja2', 'loja3'].some(storeId => configuredSources[storeId]);
    for (const storeId of ['loja1', 'loja2', 'loja3']) {
      const source = configuredSources?.[storeId];
      if (!source || typeof source !== 'object') continue;
      const sourceDatabase = String(source.database || '').trim();
      if (!sourceDatabase || sourceDatabase.length > 500) continue;
      items.push({ storeId, storeName: `Loja ${storeId.slice(-1)}`, database: sourceDatabase,
        ...credentialsByStore[storeId] });
    }
    if (!hasConfiguredSources) {
      for (const [storeId, sourceDatabase] of [
        ['loja1', database], ['loja2', databaseLoja2], ['loja3', databaseLoja3],
      ]) {
        if (sourceDatabase)
          items.push({ storeId, storeName: `Loja ${storeId.slice(-1)}`, database: sourceDatabase,
            ...credentialsByStore[storeId] });
      }
    }
    return items;
  }

  function configured(configuredSources) {
    return Boolean(executable && normalizeSources(configuredSources)
      .some(source => source.user && source.password));
  }

  async function read({ referenceDate, months = 10, sources, storeId, forceRefresh = false } = {}) {
    const requestedStoreId = /^loja[123]$/.test(String(storeId || '')) ? String(storeId) : '';
    const activeSources = normalizeSources(sources)
      .filter(source => !requestedStoreId || source.storeId === requestedStoreId);
    if (!configured(sources)) throw new Error('Leitura fiscal do Clipp ainda não configurada no servidor.');
    const safeMonths = Math.min(12, Math.max(1, Number(months) || 10));
    const today = referenceDate || new Date().toISOString().slice(0, 10);
    const period = monthStart(today, safeMonths);
    const cacheKey = `${period.start}|${period.end}|${activeSources.map(item => `${item.storeId}:${item.database}`).join('|')}`;
    if (!forceRefresh && cache?.key === cacheKey && Date.now() - cache.createdAt < 25_000) return cache.value;
    const startedAt = new Date();
    const documents = [];
    const sourceStatuses = [];
    for (const source of activeSources) {
      try {
        const output = await runIsql({ executable, database: source.database,
          user: source.user, password: source.password,
          sql: buildSql(period.start, period.end), timeoutMs });
        const rows = parseRows(output, source);
        documents.push(...rows);
        let purchaseRows = [];
        let purchaseMessage = '';
        try {
          const purchaseOutput = await runIsql({ executable, database: source.database,
            user: source.user, password: source.password,
            sql: buildPurchaseSql(period.start, period.end), timeoutMs });
          purchaseRows = parseRows(purchaseOutput, source);
          documents.push(...purchaseRows);
        } catch (error) {
          purchaseMessage = `Notas de entrada aguardando liberação de leitura: ${error instanceof Error ? error.message : 'falha desconhecida'}`;
        }
        let unregisteredRows = [];
        let unregisteredMessage = '';
        let lastNsu = 0;
        try {
          const unregisteredOutput = await runIsql({ executable, database: source.database,
            user: source.user, password: source.password,
            sql: buildUnregisteredPurchaseSql(period.start, period.end), timeoutMs });
          unregisteredRows = parseRows(unregisteredOutput, source);
          documents.push(...unregisteredRows);
          const nsuOutput = await runIsql({ executable, database: source.database,
            user: source.user, password: source.password, sql: buildMdeNsuSql(), timeoutMs });
          const nsuValues = String(nsuOutput).match(/\b\d+\b/g) || [];
          lastNsu = Number(nsuValues.at(-1) || 0);
        } catch (error) {
          unregisteredMessage = `NF não cadastradas aguardando leitura do MDe: ${error instanceof Error ? error.message : 'falha desconhecida'}`;
        }
        sourceStatuses.push({ storeId: source.storeId, success: true,
          rowsRead: rows.length + purchaseRows.length + unregisteredRows.length,
          purchasesRead: purchaseRows.length, unregisteredPurchasesRead: unregisteredRows.length,
          lastNsu,
          ...([purchaseMessage, unregisteredMessage].filter(Boolean).length
            ? { purchaseMessage: [purchaseMessage, unregisteredMessage].filter(Boolean).join(' • ') } : {}) });
      } catch (error) {
        sourceStatuses.push({ storeId: source.storeId, success: false, rowsRead: 0,
          message: error instanceof Error ? error.message : 'Falha desconhecida.' });
      }
    }
    if (!sourceStatuses.some(item => item.success))
      throw new Error('Nenhuma fonte Clipp pôde ser consultada.');
    documents.sort((a, b) => String(b.emissionDate).localeCompare(String(a.emissionDate)));
    const value = {
      source: `Clipp/Firebird (somente leitura • ${sourceStatuses.filter(item => item.success).length}/${activeSources.length} lojas)`,
      period,
      documents,
      rowsRead: documents.length,
      sourceStatuses,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    };
    cache = { key: cacheKey, createdAt: Date.now(), value };
    return value;
  }

  return { configured, read };
}

export const _test = { buildSql, buildPurchaseSql, buildUnregisteredPurchaseSql, buildMdeNsuSql, monthStart, parseRows };
