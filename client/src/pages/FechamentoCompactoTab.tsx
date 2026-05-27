import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccessLogsReport } from '@/components/AccessLogsReport';
import { Banknote, FileText, CreditCard, ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';

interface Sangria {
  id: string;
  valor: number;
}

interface Despesa {
  id: string;
  descricao: string;
  valor: number;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const parseCommaNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return parseFloat(value.toString().replace(',', '.')) || 0;
};

const formatarDataComDia = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const diaSemana = diasSemana[date.getDay()];
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year} - ${diaSemana}`;
};

const getLocalDateKey = (timestamp: number) => {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const isAnnotationActionLog = (details?: string) => {
  const t = String(details || '').toLowerCase();
  if (!t) return false;
  return (
    (t.includes('edição autorizada') || t.includes('exclusão autorizada') || t.includes('editou') || t.includes('excluiu')) &&
    (t.includes('produto') || t.includes('item') || t.includes('categoria'))
  );
};

export default function FechamentoCompactoTab() {
  const { currentStore, getAccessLogs, fechamentoData, settings } = useApp();
  const [data, setData] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const fechamentoPorData = fechamentoData[currentStore] || {};
  const fechamentoAtual = fechamentoPorData[data] || {};

  const dinheiro = fechamentoAtual.dinheiro || '';
  const sobra = fechamentoAtual.sobra || '';
  const pix = fechamentoAtual.pix || '';
  const cartao = fechamentoAtual.cartao || '';
  const boleto = fechamentoAtual.boleto || '';
  const sangrias = (fechamentoAtual.sangrias || []) as Sangria[];
  const despesas = (fechamentoAtual.despesas || []) as Despesa[];
  const nomeDigital = fechamentoAtual.nomeDigital || '';

  const valores = [
    { label: 'Dinheiro', value: parseCommaNumber(dinheiro), icon: Banknote, accent: 'border-l-green-500 text-green-600' },
    { label: 'PIX', value: parseCommaNumber(pix), icon: FileText, accent: 'border-l-blue-500 text-blue-600' },
    { label: 'Cartão', value: parseCommaNumber(cartao), icon: CreditCard, accent: 'border-l-purple-500 text-purple-600' },
    { label: 'Boleto', value: parseCommaNumber(boleto), icon: FileText, accent: 'border-l-red-500 text-red-600' },
    { label: 'Sobra', value: parseCommaNumber(sobra), icon: Banknote, accent: 'border-l-amber-500 text-amber-600' },
  ];

  const extraFechamentoIds = (settings.fechamentoCategories || [])
    .map((c: any) => c.id)
    .filter((id: string) => !['dinheiro', 'sobra', 'pix', 'cartao', 'boleto', 'sangria'].includes(id));
  const extraValores = extraFechamentoIds.map((id: string, index: number) => {
    const label = (settings.fechamentoCategories || []).find((c: any) => c.id === id)?.name || id.toUpperCase();
    const value = parseCommaNumber(fechamentoAtual[id] || '');
    const accents = ['border-l-cyan-500 text-cyan-600', 'border-l-orange-500 text-orange-600'];
    return { label, value, icon: FileText, accent: accents[index % accents.length] };
  });
  const valoresCompletos = [...valores, ...extraValores];
  const totalVendas = valoresCompletos.reduce((sum, item) => sum + item.value, 0);
  const totalSangrias = sangrias.reduce((sum, sangria) => sum + sangria.valor, 0);
  const totalDespesas = despesas.reduce((sum, despesa) => sum + despesa.valor, 0);
  const saldoDinheiro = parseCommaNumber(dinheiro) + parseCommaNumber(sobra) - totalSangrias - totalDespesas;
  const totalGeral = totalVendas - totalSangrias - totalDespesas;

  const accessLogs = getAccessLogs();
  const todayLogs = accessLogs.filter(log => {
    const logDate = (log as any).date || getLocalDateKey(log.timestamp);
    return (
      logDate === data &&
      log.storeId === currentStore &&
      (log.action === 'edit' || log.action === 'delete') &&
      isAnnotationActionLog(log.details)
    );
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const mudarDia = (offset: number) => {
    const novaData = new Date(`${data}T00:00:00`);
    novaData.setDate(novaData.getDate() + offset);
    setData(novaData.toISOString().split('T')[0]);
  };

  const renderValorCard = (label: string, value: number, Icon: any, accent: string) => (
    <Card key={label} className={`p-3 md:p-4 border-l-4 ${accent.split(' ')[0]} min-h-[96px]`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-5 h-5 ${accent.split(' ')[1]}`} />
        <span className="text-sm font-semibold text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-bold ${accent.split(' ')[1]}`}>{formatCurrency(value)}</p>
    </Card>
  );

  return (
    <div className="flex gap-4 pb-24 px-2 max-w-6xl mx-auto flex-col md:flex-row">
      <div className="flex-1 space-y-2 min-w-0">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => mudarDia(-1)} className="h-8 w-8 p-0">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Card className="flex-1 p-2 text-center">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Data</p>
            <p className="text-sm font-bold text-primary">{formatarDataComDia(data)}</p>
          </Card>
          <Button variant="outline" size="sm" onClick={() => mudarDia(1)} className="h-8 w-8 p-0">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="p-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <UserRound className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-muted-foreground uppercase">Responsável</span>
            </div>
            <span className="text-sm font-bold text-foreground truncate">{nomeDigital || 'Sem nome'}</span>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {renderValorCard(valores[0].label, valores[0].value, valores[0].icon, valores[0].accent)}
            {renderValorCard(valores[1].label, valores[1].value, valores[1].icon, valores[1].accent)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {renderValorCard(valores[2].label, valores[2].value, valores[2].icon, valores[2].accent)}
            {renderValorCard(valores[3].label, valores[3].value, valores[3].icon, valores[3].accent)}
          </div>
          <div className="grid grid-cols-1">
            {renderValorCard(valores[4].label, valores[4].value, valores[4].icon, valores[4].accent)}
          </div>
          {extraValores.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {extraValores.map(({ label, value, icon: Icon, accent }) =>
                renderValorCard(label, value, Icon, accent)
              )}
            </div>
          )}
        </motion.div>

        {(sangrias.length > 0 || despesas.length > 0) && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {sangrias.length > 0 && (
              <Card className="p-2">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Sangrias ({sangrias.length})</p>
                <div className="space-y-1">
                  {sangrias.map((sangria, index) => (
                    <div key={sangria.id} className="flex items-center justify-between text-xs">
                      <span>Sangria {index + 1}</span>
                      <span className="font-bold text-red-600">{formatCurrency(sangria.valor)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {despesas.length > 0 && (
              <Card className="p-2">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Despesas ({despesas.length})</p>
                <div className="space-y-1">
                  {despesas.map(despesa => (
                    <div key={despesa.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{despesa.descricao}</span>
                      <span className="font-bold text-red-600">{formatCurrency(despesa.valor)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
          <Card className="p-2 bg-blue-50 dark:bg-blue-950/30">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total de Vendas</p>
            <p className="text-base font-bold text-blue-600">{formatCurrency(totalVendas)}</p>
          </Card>
          <Card className="p-2 bg-red-50 dark:bg-red-950/30">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total de Sangrias</p>
            <p className="text-base font-bold text-red-600">{formatCurrency(totalSangrias)}</p>
          </Card>
          <Card className="p-2 bg-green-50 dark:bg-green-950/30">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Saldo Dinheiro</p>
            <p className="text-base font-bold text-green-600">{formatCurrency(saldoDinheiro)}</p>
          </Card>
          <Card className="p-2 bg-primary/10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Geral</p>
            <p className="text-base font-bold text-primary">{formatCurrency(totalGeral)}</p>
          </Card>
        </motion.div>
      </div>

      <div className="hidden md:block">
        <AccessLogsReport logs={todayLogs} />
      </div>
    </div>
  );
}
