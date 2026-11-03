import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from './clipp-fiscal-readonly.mjs';

test('consulta fiscal é explicitamente somente leitura', () => {
  const sql = _test.buildSql('2026-01-01', '2026-11-01');
  assert.match(sql, /SET TRANSACTION READ ONLY READ COMMITTED RECORD_VERSION/);
  assert.match(sql, /FROM TB_NFVENDA tnf/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|EXECUTE\s+BLOCK)\b/i);
});

test('consulta de entradas calcula o total com os dois parâmetros exigidos pelo Clipp', () => {
  const sql = _test.buildPurchaseSql('2026-01-01', '2026-11-01');
  assert.match(sql, /SP_TOTAL_NFC\(tnc\.ID_NFCOMPRA, 0\)/);
  assert.match(sql, /EXTRACT\(MONTH FROM COALESCE\(tnc\.DT_ENTRADA, tnc\.DT_EMISSAO\)\)/);
  assert.match(sql, /WHERE COALESCE\(tnc\.DT_ENTRADA, tnc\.DT_EMISSAO\) >= '2026-01-01'/);
  assert.match(sql, /SET TRANSACTION READ ONLY READ COMMITTED RECORD_VERSION/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|EXECUTE\s+BLOCK)\b/i);
});

test('consulta de NF não cadastradas usa MDe e continua estritamente somente leitura', () => {
  const sql = _test.buildUnregisteredPurchaseSql('2026-01-01', '2026-11-01');
  assert.match(sql, /FROM TB_NFE_MDE m/);
  assert.match(sql, /TB_NFE_MDE_EVENTOS/);
  assert.match(sql, /NOT EXISTS/);
  assert.match(sql, /TB_NFCOMPRA n/);
  assert.match(sql, /TIP_EVENTO = '210200'/);
  assert.match(sql, /SET TRANSACTION READ ONLY READ COMMITTED RECORD_VERSION/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|EXECUTE\s+BLOCK)\b/i);
});

test('parser diferencia NF não cadastrada pendente e confirmada', () => {
  const sep = String.fromCharCode(31);
  const output = [
    ['2026', '10', '20', '2080104', '1', '55', 'GAZIN', '3697.00', '', 'NF PENDENTE MDE', 'PENDENTE', 'chave1'].join(sep),
    ['2026', '10', '2', '94387', '1', '55', 'BLUEVIX', '30.00', '', 'NF PENDENTE MDE', 'CONFIRMADA', 'chave2'].join(sep),
  ].join('\r\n');
  const rows = _test.parseRows(output, { storeId: 'loja1', storeName: 'Loja 1' });
  assert.equal(rows[0].documentType, 'NF não cadastrada');
  assert.equal(rows[0].status, 'Pendente');
  assert.equal(rows[1].status, 'Confirmada');
  assert.equal(rows[1].includedInClippTotal, false);
});

test('período inclui o mês atual e os nove anteriores', () => {
  assert.deepEqual(_test.monthStart('2026-10-11', 10), {
    start: '2026-01-01',
    end: '2026-11-01',
  });
});

test('parser exclui documentos sem autorização SEFAZ do total do Clipp', () => {
  const sep = String.fromCharCode(31);
  const output = [
    ['2026', '8', '15', '110877', '1', '65', 'CONSUMIDOR', '291.20', 'E', '', '', 'chave1'].join(sep),
    ['2026', '8', '15', '110878', '1', '65', 'CLIENTES DIVERSOS', '10.00', 'E', '', '100', 'chave2'].join(sep),
  ].join('\r\n');
  const rows = _test.parseRows(output);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'Não autorizada');
  assert.equal(rows[0].includedInClippTotal, false);
  assert.equal(rows[1].status, 'Autorizada');
  assert.equal(rows[1].includedInClippTotal, true);
});

test('parser não inclui canceladas mesmo quando possuem protocolo de autorização anterior', () => {
  const sep = String.fromCharCode(31);
  const output = ['2026', '8', '15', '110879', '1', '55', 'CLIENTE', '250.00',
    'C', 'Cancelada', '100', 'chave3'].join(sep);
  const [row] = _test.parseRows(output);
  assert.equal(row.status, 'Cancelada');
  assert.equal(row.includedInClippTotal, false);
});

test('parser identifica a loja correspondente à fonte consultada', () => {
  const sep = String.fromCharCode(31);
  const output = ['2026', '10', '13', '42', '1', '55', 'CLIENTE', '125.50',
    'E', '', '100', 'chave-loja-2'].join(sep);
  const [row] = _test.parseRows(output, { storeId: 'loja2', storeName: 'Loja 2' });
  assert.equal(row.storeId, 'loja2');
  assert.equal(row.storeName, 'Loja 2');
  assert.equal(row.includedInClippTotal, true);
});
