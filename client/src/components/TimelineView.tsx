import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { TimelineEntry } from '@/lib/types';

export function TimelineView() {
  const { getTimeline, clearTimeline } = useApp();
  const timeline = getTimeline();

  const getModuleLabel = (module: string) => {
    const labels: Record<string, string> = {
      caixa: '💰 CAIXA',
      fechamento: '📋 FECHAMENTO',
      lancamentos: '📊 LANÇAMENTOS',
    };
    return labels[module] || module;
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: '✨ Criado',
      update: '✏️ Atualizado',
      delete: '🗑️ Deletado',
    };
    return labels[action] || action;
  };

  const getStoreLabel = (storeId: string) => {
    return storeId === 'loja1' ? 'Loja 1' : 'Loja 2';
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleExport = () => {
    if (timeline.length === 0) {
      toast.error('Timeline vazia!');
      return;
    }

    const csv = [
      ['Data', 'Hora', 'Módulo', 'Loja', 'Ação', 'Campo', 'Valor Anterior', 'Novo Valor', 'Descrição'].join(','),
      ...timeline.map(entry =>
        [
          formatDate(entry.date),
          formatTime(entry.timestamp),
          entry.module,
          getStoreLabel(entry.storeId),
          entry.action,
          entry.field || '',
          entry.oldValue || '',
          entry.newValue || '',
          `"${entry.description}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `timeline_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Timeline exportada!');
  };

  const handleClear = () => {
    if (confirm('Tem certeza que deseja limpar toda a timeline?')) {
      clearTimeline();
      toast.success('Timeline limpa!');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Timeline de Alterações</h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            className="gap-1 text-xs"
          >
            <Download className="w-4 h-4" />
            Exportar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClear}
            className="gap-1 text-xs"
          >
            <Trash2 className="w-4 h-4" />
            Limpar
          </Button>
        </div>
      </div>

      {timeline.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma alteração registrada</p>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-2">
          {timeline.map((entry: TimelineEntry) => (
            <div
              key={entry.id}
              className="p-3 rounded-lg border border-border bg-card/50 text-xs space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">
                  {getModuleLabel(entry.module)} • {getActionLabel(entry.action)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatDate(entry.date)} {formatTime(entry.timestamp)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="px-2 py-1 rounded bg-secondary/50">
                  {getStoreLabel(entry.storeId)}
                </span>
                {entry.field && (
                  <span className="px-2 py-1 rounded bg-secondary/50">
                    {entry.field}
                  </span>
                )}
              </div>

              <p className="text-foreground">{entry.description}</p>

              {entry.oldValue !== undefined && entry.newValue !== undefined && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="line-through text-destructive">
                    {String(entry.oldValue)}
                  </span>
                  <span>→</span>
                  <span className="text-green-600 font-semibold">
                    {String(entry.newValue)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
