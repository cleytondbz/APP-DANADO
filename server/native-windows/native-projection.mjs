const salesSettingKeys = [
  'syncPreference', 'caixaCategories', 'fechamentoCategories',
  'fieldMappingLan1', 'fieldMappingLan2', 'accessLogs', 'timeline',
  'purchaseEntries', 'purchaseOptions', 'actionUsers',
  'customSaldoDays', 'customSaldoSelection', 'customSaldoByStoreMonth',
  'customSaldoHistory', 'customSaldoBackups', 'boletoCompanies', 'clippSources',
  'historicalPurchaseXmlPath',
];

function pick(source, keys) {
  const result = {};
  for (const key of keys) if (Object.hasOwn(source || {}, key))
    result[key] = structuredClone(source[key]);
  return result;
}

export function projectNativeData(data, principal) {
  if (!principal || !['sales', 'action'].includes(principal.role))
    throw new Error('Sessão nativa obrigatória.');
  if (principal.role === 'sales') {
    const settings = pick(data.settings, salesSettingKeys);
    settings.actionUsers = (Array.isArray(settings.actionUsers) ? settings.actionUsers : [])
      .map((user) => {
        const { password, ...publicUser } = user;
        return { ...publicUser, hasPassword: Boolean(String(password || '').trim()) };
      });
    return {
      ...structuredClone(data),
      settings,
    };
  }
  const canViewSales = principal.role === 'action';
  return {
    stores: pick(data.stores, ['loja1', 'loja2', 'loja3']),
    caixa: structuredClone(data.caixa || {}),
    fechamento: {},
    lancamentos: canViewSales ? structuredClone(data.lancamentos || {}) : {},
    settings: {
      ...pick(data.settings, ['syncPreference', 'caixaCategories']),
      ...(canViewSales ? pick(data.settings, ['customSaldoByStoreMonth']) : {}),
    },
    _syncMeta: structuredClone(data._syncMeta || {}),
  };
}
