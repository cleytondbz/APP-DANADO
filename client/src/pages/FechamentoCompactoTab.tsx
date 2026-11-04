import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccessLogsReport } from '@/components/AccessLogsReport';
import { AlertTriangle, Banknote, FileText, CreditCard, ChevronLeft, ChevronRight, UserRound, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { addDaysToDateStr, localDateStr } from '@/lib/helpers';
import { toast } from 'sonner';

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
  const hasAction =
    t.includes('edição') ||
    t.includes('edicao') ||
    t.includes('editou') ||
    t.includes('exclusão') ||
    t.includes('exclusao') ||
    t.includes('excluiu') ||
    t.includes('update') ||
    t.includes('delete');
  const hasCaixaSignal =
    t.includes('produto') ||
    t.includes('item') ||
    t.includes('categoria') ||
    t.includes('loja') ||
    t.includes('dinheiro') ||
    t.includes('pix') ||
    t.includes('cartao') ||
    t.includes('cartão') ||
    t.includes('boleto') ||
    t.includes('sobra');
  return hasAction && hasCaixaSignal;
};

export default function FechamentoCompactoTab() {
  const { accessContext, currentStore, getAccessLogs, clearAccessLogsByDate, fechamentoData, caixaData, settings, refreshPeriodData } = useApp();
  const [data, setData] = useState<string>(() => localDateStr());
  const [showBoletoCompanies, setShowBoletoCompanies] = useState(false);
  const [showOccurrences, setShowOccurrences] = useState(false);
  const [showSangrias, setShowSangrias] = useState(false);
  const morningDefaultDateAppliedRef = useRef(false);

  useEffect(() => {
    if (!accessContext?.fechamentoPreviousDay || !accessContext.defaultDate || morningDefaultDateAppliedRef.current) return;
    morningDefaultDateAppliedRef.current = true;
    setData(accessContext.defaultDate);
  }, [accessContext?.defaultDate, accessContext?.fechamentoPreviousDay]);

  useEffect(() => {
    const [year, month] = data.split('-').map(Number);
    if (!year || !month) return;
    void refreshPeriodData(currentStore, year, month);
    const timer = window.setInterval(() => {
      void refreshPeriodData(currentStore, year, month);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [currentStore, data, refreshPeriodData]);

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
  const totalGeral = totalVendas - totalDespesas;
  const boletoItems = Array.isArray(caixaData?.[currentStore]?.[data]?.boleto)
    ? caixaData[currentStore][data].boleto
    : [];
  const boletoCompanies = boletoItems
    .filter((item: any) => String(item?.descricao || '').trim())
    .map((item: any) => ({
      label: String(item.descricao || '').trim(),
      amount: parseCommaNumber(item.valor) * (parseCommaNumber(item.quantidade || 1) || 1),
    }));

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
    setData((current) => addDaysToDateStr(current, offset));
  };

  const limparOcorrenciasDoDia = async () => {
    if (todayLogs.length === 0) {
      toast.info('Este dia não tem ocorrências para limpar.');
      return;
    }
    if (!window.confirm(`Limpar ${todayLogs.length} ocorrência(s) de ${formatarDataComDia(data)}?`)) return;
    const password = window.prompt('Digite a senha de vendas para limpar as ocorrências deste dia:');
    if (password === null) return;
    if (password !== (settings.senhaVendas || '2512')) {
      toast.error('Senha de vendas incorreta.');
      return;
    }
    try {
      await clearAccessLogsByDate(data, currentStore, password);
      toast.success('Ocorrências do dia limpas.');
    } catch (error) {
      console.error('[FechamentoCompacto] Erro ao limpar ocorrências do dia:', error);
      toast.error('Falha ao limpar ocorrências do dia no servidor.');
    }
  };

  const getValorCardFill = (label: string) => {
    const normalized = label.toLowerCase();
    if (normalized.includes('dinheiro')) return 'bg-green-50/90 dark:bg-green-950/25';
    if (normalized.includes('pix')) return 'bg-blue-50/90 dark:bg-blue-950/25';
    if (normalized.includes('cart')) return 'bg-purple-50/90 dark:bg-purple-950/25';
    if (normalized.includes('boleto')) return 'bg-red-50/90 dark:bg-red-950/25';
    return 'bg-card';
  };

  const renderValorCard = (label: string, value: number, Icon: any, accent: string, onClick?: () => void) => (
    <Card
      key={label}
      onClick={onClick}
      className={`px-3 py-2 border-l-[6px] ${accent.split(' ')[0]} ${getValorCardFill(label)} min-h-[68px] shadow-sm ${onClick ? 'cursor-pointer hover:brightness-95 transition-all' : ''}`}
    >
      <div className="flex items-center gap-2 mb-0">
        <Icon className={`w-5 h-5 ${accent.split(' ')[1]}`} />
        <span className={`text-base font-extrabold ${accent.split(' ')[1]}`}>{label}</span>
      </div>
      <p className={`text-3xl font-black leading-none ${accent.split(' ')[1]}`}>{formatCurrency(value)}</p>
    </Card>
  );

  return (
    <div className={`flex gap-4 pb-24 px-2 mx-auto flex-col md:flex-row transition-[max-width] duration-300 ${
      showOccurrences ? 'max-w-[1500px]' : 'max-w-[980px]'
    }`}>
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
            {renderValorCard(valores[3].label, valores[3].value, valores[3].icon, valores[3].accent, () => setShowBoletoCompanies(true))}
          </div>
          {showBoletoCompanies && (
            <div className="relative">
              <Card className="absolute right-0 top-0 z-40 w-full max-w-sm p-3 space-y-2 border-red-200 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold text-red-600">Empresas do Boleto</p>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setShowBoletoCompanies(false)}>×</Button>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5">
                  {boletoCompanies.length > 0 ? boletoCompanies.map((item: { label: string; amount: number }, index: number) => (
                    <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-secondary/60 px-2 py-1.5 text-xs">
                      <span className="font-semibold truncate">{item.label}</span>
                      <span className="font-bold text-red-600">{formatCurrency(item.amount)}</span>
                    </div>
                  )) : (
                    <p className="text-xs text-muted-foreground text-center py-3">Nenhuma empresa registrada em boleto neste dia.</p>
                  )}
                </div>
              </Card>
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            <Card className="p-2 border-l-4 border-l-amber-500 min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Sobra</p>
              <p className="text-sm font-bold text-amber-600 truncate">{formatCurrency(valores[4].value)}</p>
            </Card>
            <Card
              onClick={() => sangrias.length > 0 && setShowSangrias((value) => !value)}
              className={`p-2 border-l-4 border-l-red-500 min-w-0 ${
                sangrias.length > 0 ? 'cursor-pointer hover:bg-red-50/70 transition-colors' : ''
              }`}
              title={sangrias.length > 0 ? 'Clique para ver as sangrias' : undefined}
            >
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Sangria</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-red-600 truncate">{formatCurrency(totalSangrias)}</p>
                {sangrias.length > 0 && (
                  <span className="text-[10px] font-black text-red-600">
                    {showSangrias ? '▲' : '▼'}
                  </span>
                )}
              </div>
            </Card>
            <Card className="p-2 border-l-4 border-l-green-500 bg-green-50/60 dark:bg-green-950/20 min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Saldo Dinheiro</p>
              <p className="text-sm font-bold text-green-600 truncate">{formatCurrency(saldoDinheiro)}</p>
            </Card>
          </div>
          {extraValores.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {extraValores.map(({ label, value, icon: Icon, accent }) =>
                renderValorCard(label, value, Icon, accent)
              )}
            </div>
          )}
        </motion.div>

        {((showSangrias && sangrias.length > 0) || despesas.length > 0) && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {showSangrias && sangrias.length > 0 && (
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

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-4 bg-primary/15 border-2 border-primary/40 flex items-center justify-between gap-4 shadow-sm">
            <p className="text-xl md:text-2xl font-black text-primary uppercase">Total Geral</p>
            <p className="text-3xl md:text-4xl font-black text-primary text-right">{formatCurrency(totalGeral)}</p>
          </Card>
        </motion.div>
      </div>

      <div className={`hidden md:flex md:h-[calc(100vh-120px)] shrink-0 flex-col transition-all duration-300 ${
        showOccurrences ? 'md:w-[360px] lg:w-[460px] xl:w-[540px]' : 'md:w-16'
      }`}>
        {!showOccurrences ? (
          <button
            type="button"
            onClick={() => setShowOccurrences(true)}
            className={`relative flex h-20 w-20 items-center justify-center rounded-3xl border shadow-md transition-all ${
              todayLogs.length > 0
                ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
                : 'border-border bg-card text-muted-foreground hover:bg-secondary'
            }`}
            title={todayLogs.length > 0 ? `${todayLogs.length} ocorrência(s)` : 'Sem ocorrências'}
          >
            {todayLogs.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-black text-white">
                {todayLogs.length > 99 ? '99+' : todayLogs.length}
              </span>
            )}
            {todayLogs.length > 0 && <span className="absolute inset-0 rounded-3xl bg-red-500/25 animate-ping" />}
            <AlertTriangle className="relative h-10 w-10" />
          </button>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setShowOccurrences(false)}>
                <X className="mr-1 h-4 w-4" />
                Ocultar
              </Button>
              {todayLogs.length > 0 && !accessContext?.readOnly && (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={limparOcorrenciasDoDia}>
                  Limpar dia
                </Button>
              )}
            </div>
            <AccessLogsReport logs={todayLogs} />
          </>
        )}
      </div>
    </div>
  );
}
