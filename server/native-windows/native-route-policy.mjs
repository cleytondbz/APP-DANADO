// Use this exact allowlist when integrating with the legacy web/sync-token gate.
// Register handlers before dynamic /api/compras/:year routes.
export const nativeRoutes = Object.freeze([
  ['get', '/api/native/session-capability', 'sessionCapability'],
  ['get', '/api/native/access-context', 'accessContext'],
  ['post', '/api/native/session', 'login'],
  ['get', '/api/native/sync/load', 'syncLoad'],
  ['get', '/api/native/fiscal', 'fiscalRead'],
  ['post', '/api/native/clipp-prices/search', 'clippPricesSearch'],
  ['post', '/api/native/clipp-prices/update', 'clippPricesUpdate'],
  ['post', '/api/native/clipp-prices/mobile-search', 'clippPricesMobileSearch'],
  ['post', '/api/native/clipp-prices/mobile-update', 'clippPricesMobileUpdate'],
  ['post', '/api/native/clipp-products/mobile-registry', 'clippProductsMobileRegistry'],
  ['get', '/api/native/fiscal-document-cache/:accessKey', 'fiscalDocumentCacheGet'],
  ['post', '/api/native/fiscal-document-cache', 'fiscalDocumentCacheSave'],
  ['get', '/api/native/gadget-fiscal-summary', 'gadgetFiscalSummary'],
  ['post', '/api/native/sync/save', 'syncSave'],
  ['post', '/api/native/counter/save', 'counterSave'],
  ['post', '/api/native/history/clear', 'historyClear'],
  ['post', '/api/native/occurrences/clear', 'occurrencesClear'],
  ['post', '/api/native/verify-action', 'verifyAction'],
  ['post', '/api/native/verify-sales', 'verifySales'],
  ['post', '/api/native/backup-export', 'backupExport'],
  ['get', '/api/native/action-users', 'actionUsersList'],
  ['post', '/api/native/action-users', 'actionUsersChange'],
  ['get', '/api/compras/transaction-capability', 'purchaseCapability'],
  ['post', '/api/compras/transaction', 'purchaseTransaction'],
  ['post', '/api/compras/native-options', 'purchaseOptionsSave'],
  ['get', '/api/backup/restore-capability', 'restoreCapability'],
  ['post', '/api/backup/restore-full', 'restoreFull'],
]);

const routeKeys = new Set(nativeRoutes.map(([method, route]) => `${method.toUpperCase()} ${route}`));

export function isNativeRoute(method, route) {
  return routeKeys.has(`${String(method).toUpperCase()} ${route}`);
}

export function registerNativeRoutes(app, handlers) {
  for (const [method, route, name] of nativeRoutes) {
    if (typeof app?.[method] !== 'function' || typeof handlers?.[name] !== 'function')
      throw new Error(`Rota nativa sem manipulador: ${method.toUpperCase()} ${route}`);
  }
  for (const [method, route, name] of nativeRoutes) app[method](route, handlers[name]);
}

export function nativeBodyLimit(route) {
  return route === '/api/backup/restore-full' ? '32mb' : '10mb';
}
