const directSalesIps = new Set(['192.168.0.13', '192.168.0.14']);

function clientIp(req) {
  const raw = String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for']
    || req.socket?.remoteAddress || req.ip || '').split(',')[0].trim();
  return raw.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
}

export function buildNativeAccessContext(req, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  const serverDate = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  const previousDay = hour < 10;
  const yesterday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1,
    Number(parts.day) - 1)).toISOString().slice(0, 10);
  const ip = clientIp(req);
  return {
    clientIp: ip, directSalesLogin: directSalesIps.has(ip), specialMorning: true,
    fechamentoPreviousDay: previousDay, serverDate,
    serverTime: `${parts.hour}:${parts.minute}`,
    defaultDate: previousDay ? yesterday : serverDate,
    morningWindow: { start: '00:00', end: '10:00' },
  };
}
