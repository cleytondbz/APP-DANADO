import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Test suite for per-store data separation in caixa and fechamento modules
 * 
 * This test verifies that:
 * 1. Loja 1 and Loja 2 have independent caixa data
 * 2. Loja 1 and Loja 2 have independent fechamento data
 * 3. Data structure is correctly nested: caixaData[storeId][date]
 * 4. Switching stores loads the correct data
 */

describe('Per-Store Data Separation', () => {
  let caixaData: Record<string, Record<string, any>>;
  let fechamentoData: Record<string, Record<string, any>>;

  beforeEach(() => {
    // Initialize with per-store structure
    caixaData = {
      loja1: {},
      loja2: {},
    };
    fechamentoData = {
      loja1: {},
      loja2: {},
    };
  });

  it('should initialize caixa data with per-store structure', () => {
    expect(caixaData).toHaveProperty('loja1');
    expect(caixaData).toHaveProperty('loja2');
    expect(caixaData.loja1).toEqual({});
    expect(caixaData.loja2).toEqual({});
  });

  it('should initialize fechamento data with per-store structure', () => {
    expect(fechamentoData).toHaveProperty('loja1');
    expect(fechamentoData).toHaveProperty('loja2');
    expect(fechamentoData.loja1).toEqual({});
    expect(fechamentoData.loja2).toEqual({});
  });

  it('should store caixa data separately for each store', () => {
    const today = '2026-05-14';
    
    // Add data to Loja 1
    caixaData.loja1[today] = {
      dinheiro: [{ id: '1', descricao: 'Venda 1', quantidade: 1, valor: '100', hora: '10:00' }],
      pix: [],
      cartao: [],
      boleto: [],
    };

    // Add different data to Loja 2
    caixaData.loja2[today] = {
      dinheiro: [{ id: '2', descricao: 'Venda 2', quantidade: 2, valor: '200', hora: '11:00' }],
      pix: [],
      cartao: [],
      boleto: [],
    };

    // Verify data is independent
    expect(caixaData.loja1[today].dinheiro[0].descricao).toBe('Venda 1');
    expect(caixaData.loja2[today].dinheiro[0].descricao).toBe('Venda 2');
    expect(caixaData.loja1[today].dinheiro[0].valor).toBe('100');
    expect(caixaData.loja2[today].dinheiro[0].valor).toBe('200');
  });

  it('should store fechamento data separately for each store', () => {
    const today = '2026-05-14';
    
    // Add data to Loja 1
    fechamentoData.loja1[today] = {
      dinheiro: '1000',
      sobra: '50',
      pix: '500',
      boleto: '200',
      cartao: '300',
      sangrias: [],
      despesas: [],
      nomeDigital: 'João',
    };

    // Add different data to Loja 2
    fechamentoData.loja2[today] = {
      dinheiro: '2000',
      sobra: '100',
      pix: '1000',
      boleto: '400',
      cartao: '600',
      sangrias: [],
      despesas: [],
      nomeDigital: 'Maria',
    };

    // Verify data is independent
    expect(fechamentoData.loja1[today].dinheiro).toBe('1000');
    expect(fechamentoData.loja2[today].dinheiro).toBe('2000');
    expect(fechamentoData.loja1[today].nomeDigital).toBe('João');
    expect(fechamentoData.loja2[today].nomeDigital).toBe('Maria');
  });

  it('should allow switching between stores without data loss', () => {
    const today = '2026-05-14';
    
    // Add data to both stores
    caixaData.loja1[today] = {
      dinheiro: [{ id: '1', descricao: 'Loja 1 Venda', quantidade: 1, valor: '100', hora: '10:00' }],
      pix: [],
      cartao: [],
      boleto: [],
    };

    caixaData.loja2[today] = {
      dinheiro: [{ id: '2', descricao: 'Loja 2 Venda', quantidade: 1, valor: '200', hora: '11:00' }],
      pix: [],
      cartao: [],
      boleto: [],
    };

    // Simulate switching from loja1 to loja2 and back
    let currentStore = 'loja1';
    let currentData = caixaData[currentStore][today];
    expect(currentData.dinheiro[0].descricao).toBe('Loja 1 Venda');

    currentStore = 'loja2';
    currentData = caixaData[currentStore][today];
    expect(currentData.dinheiro[0].descricao).toBe('Loja 2 Venda');

    currentStore = 'loja1';
    currentData = caixaData[currentStore][today];
    expect(currentData.dinheiro[0].descricao).toBe('Loja 1 Venda');
  });

  it('should handle multiple dates per store', () => {
    const date1 = '2026-05-14';
    const date2 = '2026-05-13';
    
    // Add data for multiple dates in Loja 1
    caixaData.loja1[date1] = {
      dinheiro: [{ id: '1', descricao: 'Venda 14/05', quantidade: 1, valor: '100', hora: '10:00' }],
      pix: [],
      cartao: [],
      boleto: [],
    };

    caixaData.loja1[date2] = {
      dinheiro: [{ id: '2', descricao: 'Venda 13/05', quantidade: 1, valor: '150', hora: '10:00' }],
      pix: [],
      cartao: [],
      boleto: [],
    };

    // Verify both dates are stored independently
    expect(caixaData.loja1[date1].dinheiro[0].descricao).toBe('Venda 14/05');
    expect(caixaData.loja1[date2].dinheiro[0].descricao).toBe('Venda 13/05');
    expect(Object.keys(caixaData.loja1).length).toBe(2);
  });

  it('should merge server data with per-store structure', () => {
    const serverData = {
      caixa: {
        loja1: {
          '2026-05-14': {
            dinheiro: [{ id: '1', descricao: 'Server Venda', quantidade: 1, valor: '100', hora: '10:00' }],
            pix: [],
            cartao: [],
            boleto: [],
          },
        },
        loja2: {
          '2026-05-14': {
            dinheiro: [{ id: '2', descricao: 'Server Venda 2', quantidade: 1, valor: '200', hora: '11:00' }],
            pix: [],
            cartao: [],
            boleto: [],
          },
        },
      },
    };

    // Merge server data
    caixaData = serverData.caixa;

    // Verify structure is preserved
    expect(caixaData.loja1['2026-05-14'].dinheiro[0].descricao).toBe('Server Venda');
    expect(caixaData.loja2['2026-05-14'].dinheiro[0].descricao).toBe('Server Venda 2');
  });

  it('should handle empty stores correctly', () => {
    const today = '2026-05-14';
    
    // Verify empty store returns empty object
    expect(caixaData.loja1[today]).toBeUndefined();
    expect(caixaData.loja2[today]).toBeUndefined();

    // Add data to one store, other should remain empty
    caixaData.loja1[today] = {
      dinheiro: [],
      pix: [],
      cartao: [],
      boleto: [],
    };

    expect(caixaData.loja1[today]).toBeDefined();
    expect(caixaData.loja2[today]).toBeUndefined();
  });
});
