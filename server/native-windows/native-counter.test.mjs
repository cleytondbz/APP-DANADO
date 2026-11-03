import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCounterTransaction } from './native-counter.mjs';

const currentData = () => ({
  settings: {},
  lancamentos: {
    loja1: {},
    loja2: {
      '2026-05-01': { values: { pix: 100, cartao: 200, duplicata: 10 } },
      '2026-05-02': { values: { pix: 150, cartao: 250, duplicata: 20 } },
      '2026-05-03': { values: { pix: 175, cartao: 275, duplicata: 30 } },
    },
    loja3: {},
  },
});

test('contador permite dias específicos por categoria sem alterar o padrão da loja', () => {
  const result = buildCounterTransaction(currentData(), {
    storeId: 'loja2',
    monthKey: '2026-05',
    expectedConfig: null,
    config: {
      selection: ['loja2:pix', 'loja2:cartao', 'loja2:duplicata'],
      daysByStore: { loja1: [], loja2: [1, 2, 3], loja3: [] },
      daysBySelection: { 'loja2:duplicata': [2, 3] },
    },
  }, { actor: 'Teste', now: Date.UTC(2026, 4, 31, 12) });

  assert.equal(result.config.total, 1200);
  assert.deepEqual(result.config.daysByStore.loja2, [1, 2, 3]);
  assert.deepEqual(result.config.daysBySelection['loja2:duplicata'], [2, 3]);
});

test('contador antigo continua usando os dias padrão da loja', () => {
  const result = buildCounterTransaction(currentData(), {
    storeId: 'loja2',
    monthKey: '2026-05',
    expectedConfig: null,
    config: {
      selection: ['loja2:duplicata'],
      daysByStore: { loja1: [], loja2: [1, 2], loja3: [] },
    },
  }, { actor: 'Teste', now: Date.UTC(2026, 4, 31, 12) });

  assert.equal(result.config.total, 30);
  assert.deepEqual(result.config.daysBySelection, {});
});
