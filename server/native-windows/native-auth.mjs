import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const allowedPermissions = new Set(['edit', 'delete', 'changeDate', 'viewSales']);
const allowedOperations = new Set([
  'caixa:read', 'caixa:create', 'caixa:edit', 'caixa:delete',
  'dashboard:read', 'launch:edit', 'date:change',
  'purchases:read', 'purchases:write', 'closing:read',
  'settings:read', 'settings:write', 'counter:write', 'backup:export', 'restore:full',
]);
const sessionLifetimeMs = 8 * 60 * 60 * 1000;

function equalText(left, right) {
  const a = createHmac('sha256', 'danado-native-password-compare').update(String(left)).digest();
  const b = createHmac('sha256', 'danado-native-password-compare').update(String(right)).digest();
  return timingSafeEqual(a, b);
}

function actionUsers(settings) {
  return Array.isArray(settings?.actionUsers) ? settings.actionUsers : [];
}

function actionId(user, index) {
  return String(user?.id || `legacy-index-${index}`);
}

function credentials(settings) {
  const salesPassword = String(settings?.senhaVendas || '2512').trim();
  const actions = actionUsers(settings);
  return { salesPassword, actions };
}

export function createNativeAuth({ getSettings, secret = randomBytes(32), now = Date.now } = {}) {
  if (typeof getSettings !== 'function') throw new Error('Leitura das configurações é obrigatória.');
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('Chave de sessão inválida.');
  const sign = (input) => createHmac('sha256', secret).update(input).digest('base64url');
  const credentialTag = (password) => sign(`credential:${password}`);

  function authenticate(role, password) {
    const candidate = String(password || '').trim();
    if (!candidate) return null;
    const { salesPassword, actions } = credentials(getSettings());
    let principal;
    if (role === 'sales' && equalText(candidate, salesPassword)) {
      principal = { role: 'sales', id: 'sales', name: 'Vendas', password: salesPassword };
    } else if (role === 'action') {
      const index = actions.findIndex((user) => equalText(candidate, String(user?.password || '').trim()));
      if (index >= 0 && String(actions[index]?.password || '').trim()) {
        principal = {
          role: 'action', id: actionId(actions[index], index),
          name: String(actions[index]?.name || 'Usuário de ação'),
          password: String(actions[index].password).trim(),
        };
      }
    }
    if (!principal) return null;
    const issuedAt = now();
    const payload = {
      v: 1, role: principal.role, id: principal.id,
      iat: issuedAt, exp: issuedAt + sessionLifetimeMs,
      credentialTag: credentialTag(principal.password),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return { token: `${body}.${sign(body)}`, role: principal.role,
      name: principal.name, expiresAt: payload.exp };
  }

  function verify(token) {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra !== undefined) return null;
    const expected = Buffer.from(sign(body), 'base64url');
    const supplied = Buffer.from(signature, 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    let payload;
    try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
    catch { return null; }
    if (payload?.v !== 1 || !Number.isSafeInteger(payload.iat)
        || !Number.isSafeInteger(payload.exp) || payload.exp - payload.iat !== sessionLifetimeMs
        || payload.iat > now() || payload.exp <= now()) return null;
    const { salesPassword, actions } = credentials(getSettings());
    if (payload.role === 'sales' && payload.id === 'sales'
        && equalText(payload.credentialTag, credentialTag(salesPassword)))
      return { role: 'sales', id: 'sales', name: 'Vendas', permissions: [...allowedPermissions] };
    if (payload.role !== 'action') return null;
    const index = actions.findIndex((user, position) => actionId(user, position) === payload.id);
    if (index < 0 || !String(actions[index]?.password || '').trim()
        || !equalText(payload.credentialTag, credentialTag(String(actions[index].password).trim()))) return null;
    return { role: 'action', id: payload.id,
      name: String(actions[index]?.name || 'Usuário de ação'),
      permissions: (Array.isArray(actions[index].permissions) ? actions[index].permissions : [])
        .filter((permission) => allowedPermissions.has(permission)) };
  }

  return { authenticate, verify };
}

export function canPerform(principal, operation) {
  if (!principal || !allowedOperations.has(operation)) return false;
  if (principal.role === 'sales') return true;
  if (principal.role !== 'action') return false;
  const permissions = new Set(principal.permissions || []);
  switch (operation) {
    case 'caixa:read':
    case 'caixa:create': return true;
    case 'dashboard:read': return true;
    case 'counter:write': return true;
    case 'caixa:edit':
    case 'launch:edit': return permissions.has('edit');
    case 'caixa:delete': return permissions.has('delete');
    case 'date:change': return permissions.has('changeDate');
    default: return false;
  }
}
