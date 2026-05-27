import { AccessLog } from '@/lib/types';

interface AccessLogsReportProps {
  logs: AccessLog[];
}

const normalizeText = (value?: string) => {
  if (!value) return '';
  return value
    .replace(/Ã§/g, 'ç')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .trim();
};

const extractTipo = (details: string) => {
  const t = details.toLowerCase();
  if (t.includes('dinheiro')) return 'Dinheiro';
  if (t.includes('pix')) return 'PIX';
  if (t.includes('cartao') || t.includes('cartão')) return 'Cartão';
  if (t.includes('boleto')) return 'Boleto';
  if (t.includes('sobra')) return 'Sobra';
  if (t.includes('sangria')) return 'Sangria';
  if (t.includes('despesa')) return 'Despesa';
  return '';
};

const parseDetails = (detailsRaw?: string) => {
  const details = normalizeText(detailsRaw);
  const descricaoMatch = details.match(/(?:descricao|descrição)[:\s]+([^|]+?)(?:\s*\||$)/i);
  const beforeAfterMatch = details.match(/R\$\s*([\d.,-]+)\s*(?:->|→)\s*R\$\s*([\d.,-]+)/i);
  const valorSingleMatch = details.match(/Valor[:\s]+R\$\s*([\d.,-]+)/i);

  return {
    details,
    tipo: extractTipo(details),
    descricao: descricaoMatch?.[1]?.trim() || '',
    before: beforeAfterMatch?.[1] || '',
    after: beforeAfterMatch?.[2] || '',
    valor: valorSingleMatch?.[1] || '',
  };
};

export function AccessLogsReport({ logs }: AccessLogsReportProps) {
  const parsedLogs = logs
    .map((log) => ({ log, parsed: parseDetails(log.details) }))
    .filter(({ parsed }) => parsed.tipo);

  return (
    <div className="w-72 space-y-2" style={{ width: '220px' }}>
      <h3 className="text-xs font-bold text-muted-foreground uppercase mb-2">OCORRÊNCIA</h3>
      <div className="space-y-1 max-h-96 overflow-y-auto border border-border rounded p-2 bg-muted/30">
        {parsedLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Sem acessos</p>
        ) : (
          parsedLogs.map(({ log, parsed }) => {
            const diaHora = new Date(log.timestamp).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            const acaoLabel = log.action === 'delete' ? 'Exclusão' : 'Edição';
            const acaoCor = log.action === 'delete' ? 'text-red-600' : 'text-blue-600';

            return (
              <div
                key={log.id || log.timestamp}
                className="p-2 bg-background rounded border border-border/50 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{normalizeText(log.userName) || 'Desconhecido'}</span>
                  <span className={`text-xs font-medium ${acaoCor}`}>{acaoLabel}</span>
                </div>
                <div className="text-muted-foreground text-xs">
                  <span className="font-medium">Tipo:</span> {parsed.tipo}
                </div>
                {parsed.descricao && (
                  <div className="text-muted-foreground text-xs">
                    <span className="font-medium">Descrição:</span> {parsed.descricao}
                  </div>
                )}
                {parsed.before && parsed.after ? (
                  <div className="text-muted-foreground text-xs">
                    <span className="font-medium">Valor:</span> R$ {parsed.before} → R$ {parsed.after}
                  </div>
                ) : parsed.valor ? (
                  <div className="text-muted-foreground text-xs">
                    <span className="font-medium">Valor:</span> R$ {parsed.valor}
                  </div>
                ) : null}
                <div className="text-muted-foreground/70 text-xs">{diaHora}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
