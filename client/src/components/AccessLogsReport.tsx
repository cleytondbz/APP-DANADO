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
  const descricaoPair = descricaoMatch?.[1]
    ?.split(/\s+-\s+/)
    .map((item) => item.trim())
    .filter(Boolean) || [];
  const parseDescriptionAndCategory = (value: string) => {
    const cleanValue = String(value || '').replace(/\s+Valor\s*:.*$/i, '').trim();
    const match = cleanValue.match(/^(.*?)\s*\((dinheiro|pix|cart[aã]o|boleto|sobra|sangria|despesa)\)\s*$/i);
    if (!match) return { description: cleanValue, category: '' };
    return {
      description: match[1].trim(),
      category: match[2]
        .toLowerCase()
        .replace('cartao', 'Cartão')
        .replace('cartão', 'Cartão')
        .replace('pix', 'PIX')
        .replace('dinheiro', 'Dinheiro')
        .replace('boleto', 'Boleto')
        .replace('sobra', 'Sobra')
        .replace('sangria', 'Sangria')
        .replace('despesa', 'Despesa'),
    };
  };
  const beforeAfterMatch = details.match(/R\$?\s*([\d.,]+)\s*(?:->|→|\s+-\s+)\s*R\$?\s*([\d.,]+)/i);
  const valorSingleMatch = details.match(/Valor[:\s]+R\$?\s*([\d.,]+)/i);
  const singleDescription = descricaoMatch?.[1]?.trim() || '';
  const beforeDescription = parseDescriptionAndCategory(descricaoPair[0] || singleDescription);
  const afterDescription = parseDescriptionAndCategory(descricaoPair[1] || descricaoPair[0] || singleDescription);

  return {
    details,
    tipo: extractTipo(details),
    descricao: parseDescriptionAndCategory(singleDescription).description || singleDescription,
    categoriaAntes: beforeDescription.category || extractTipo(details),
    categoriaDepois: afterDescription.category || beforeDescription.category || extractTipo(details),
    descricaoAntes: beforeDescription.description || singleDescription,
    descricaoDepois: afterDescription.description || beforeDescription.description || singleDescription,
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
    <div className="flex h-full min-h-0 w-full min-w-[280px] flex-col space-y-2">
      <h3 className="text-xs font-bold text-muted-foreground uppercase mb-2">OCORRÊNCIA</h3>
      <div className="min-h-[520px] flex-1 space-y-2 overflow-y-auto border border-border rounded-lg p-2 bg-muted/30">
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
                className="p-2.5 bg-background rounded-lg border border-border/50 text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{normalizeText(log.userName) || 'Desconhecido'}</span>
                  <span className={`text-xs font-medium ${acaoCor}`}>{acaoLabel}</span>
                </div>
                {parsed.before && parsed.after ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-red-200 bg-red-50/70 p-2">
                      <div className="font-bold text-red-700">ANTES</div>
                      <div className="mt-1 text-muted-foreground">
                        <span className="font-semibold text-foreground">CATEGORIA:</span> {parsed.categoriaAntes || '-'}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        <span className="font-semibold text-foreground">DESCRIÇÃO PRODUTO:</span> {parsed.descricaoAntes || '-'}
                      </div>
                      <div className="text-muted-foreground">
                        <span className="font-semibold text-foreground">VALOR:</span> R$ {parsed.before}
                      </div>
                    </div>
                    <div className="rounded-md border border-green-200 bg-green-50/70 p-2">
                      <div className="font-bold text-green-700">DEPOIS</div>
                      <div className="mt-1 text-muted-foreground">
                        <span className="font-semibold text-foreground">CATEGORIA:</span> {parsed.categoriaDepois || '-'}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        <span className="font-semibold text-foreground">DESCRIÇÃO PRODUTO:</span> {parsed.descricaoDepois || '-'}
                      </div>
                      <div className="text-muted-foreground">
                        <span className="font-semibold text-foreground">VALOR:</span> R$ {parsed.after}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-muted/40 p-2 text-muted-foreground">
                    <div>
                      <span className="font-semibold text-foreground">CATEGORIA:</span> {parsed.tipo || '-'}
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold text-foreground">DESCRIÇÃO PRODUTO:</span> {parsed.descricao || '-'}
                    </div>
                    {parsed.valor && (
                      <div>
                        <span className="font-semibold text-foreground">VALOR:</span> R$ {parsed.valor}
                      </div>
                    )}
                  </div>
                )}
                <div className="text-muted-foreground/70 text-xs">{diaHora}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
