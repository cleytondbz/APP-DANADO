import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AccessLogsReport } from '@/components/AccessLogsReport';
import { Banknote, FileText, CreditCard, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
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

const handleNumberInput = (value: string): string => {
  return value.replace(/[^0-9,]/g, '');
};

const formatarDataComDia = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00');
  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const diaSemana = diasSemana[date.getDay()];
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year} - ${diaSemana}`;
};

export default function FechamentoCompactoTab() {
  const { settings, currentStore, validateActionPassword, getAccessLogs, getCategories, saveEntry, addTimelineEntry, fechamentoData, setFechamentoData } = useApp();
  const senhaCaixa = settings.password || '2512';

  // Estado de data
  const [data, setData] = useState<string>(() => {
    const hoje = new Date();
    return hoje.toISOString().split('T')[0];
  });

  // Estado de fechamento
  const [dinheiro, setDinheiro] = useState('');
  const [sobra, setSobra] = useState('');
  const [pix, setPix] = useState('');
  const [cartao, setCartao] = useState('');
  const [boleto, setBoleto] = useState('');
  const [sangrias, setSangrias] = useState<Sangria[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [nomeDigital, setNomeDigital] = useState('');

  // Estado de modais
  const [showSenhaModal, setShowSenhaModal] = useState(false);
  const [senhaInput, setSenhaInput] = useState('');
  const [novaValorSangria, setNovaValorSangria] = useState('');
  const [novaDescricaoDespesa, setNovaDescricaoDespesa] = useState('');
  const [novaValorDespesa, setNovaValorDespesa] = useState('');
  const [showSenhaDespesaModal, setShowSenhaDespesaModal] = useState(false);
  const [senhaDespesaInput, setSenhaDespesaInput] = useState('');
  const [despesaParaRemover, setDespesaParaRemover] = useState<string | null>(null);

  // Carregar dados de fechamento do AppContext
  useEffect(() => {
    const fechamentoPorData = fechamentoData[currentStore] || {};
    const dataFechamento = fechamentoPorData[data];
    
    if (dataFechamento) {
      setDinheiro(dataFechamento.dinheiro || '');
      setSobra(dataFechamento.sobra || '');
      setPix(dataFechamento.pix || '');
      setCartao(dataFechamento.cartao || '');
      setBoleto(dataFechamento.boleto || '');
      setSangrias(dataFechamento.sangrias || []);
      setDespesas(dataFechamento.despesas || []);
      setNomeDigital(dataFechamento.nomeDigital || '');
    } else {
      // Limpar se não houver dados para a data
      setDinheiro('');
      setSobra('');
      setPix('');
      setCartao('');
      setBoleto('');
      setSangrias([]);
      setDespesas([]);
      setNomeDigital('');
    }
  }, [data, currentStore, fechamentoData]);

  // Salvar dados de fechamento
  const salvarFechamento = () => {
    if (!nomeDigital.trim()) {
      toast.error('Nome do fechamento é obrigatório!');
      return;
    }

    // Salvar no AppContext
    setFechamentoData((prev: any) => ({
      ...prev,
      [currentStore]: {
        ...prev[currentStore],
        [data]: {
          dinheiro,
          sobra,
          pix,
          cartao,
          boleto,
          sangrias,
          despesas,
          nomeDigital
        }
      }
    }));
    
    // Registrar na timeline
    addTimelineEntry(
      'fechamento',
      'update',
      data,
      'Fechamento',
      'Anterior',
      `D: ${dinheiro}, S: ${sobra}, P: ${pix}, C: ${cartao}, B: ${boleto}`,
      `Fechamento salvo: ${nomeDigital}`
    );
    
    // Sincronizar todos os campos mapeados para Lançamentos
    const values: Record<string, number> = {};
    
    // Mapear todos os campos do Fechamento Compacto para Lançamentos
    const fechamentoCompactoFields: Record<string, number> = {
      dinheiro: parseCommaNumber(dinheiro),
      pix: parseCommaNumber(pix),
      sobra: parseCommaNumber(sobra),
      cartao: parseCommaNumber(cartao),
      boleto: parseCommaNumber(boleto),
    };
    
    // Adicionar todos os campos ao values para sincronizacao
    Object.entries(fechamentoCompactoFields).forEach(([field, value]) => {
      if (value > 0) {
        values[field] = value;
      }
    });
    
    if (Object.keys(values).length > 0) {
      saveEntry(data, values);
    }
    
    toast.success('Fechamento salvo e sincronizado!');
  };

  // Adicionar sangria
  const adicionarSangria = () => {
    const valorNum = parseCommaNumber(novaValorSangria);
    if (valorNum <= 0) {
      toast.error('Valor é obrigatório');
      return;
    }

    const novaSangria: Sangria = {
      id: Date.now().toString(),
      valor: valorNum,
    };

    setSangrias([...sangrias, novaSangria]);
    setNovaValorSangria('');
    toast.success('Sangria adicionada');
    
    addTimelineEntry(
      'fechamento',
      'create',
      data,
      'Sangria',
      undefined,
      `R$ ${valorNum.toFixed(2)}`,
      `Sangria adicionada: R$ ${valorNum.toFixed(2)}`
    );
  };

  // Remover sangria
  const removerSangria = (id: string) => {
    const sangriaParaRemover = sangrias.find(s => s.id === id);
    setSangrias(sangrias.filter(s => s.id !== id));
    toast.success('Sangria removida');
    
    if (sangriaParaRemover) {
      addTimelineEntry(
        'fechamento',
        'delete',
        data,
        'Sangria',
        `R$ ${sangriaParaRemover.valor.toFixed(2)}`,
        undefined,
        `Sangria removida: R$ ${sangriaParaRemover.valor.toFixed(2)}`
      );
    }
  };

  // Adicionar despesa
  const adicionarDespesa = () => {
    if (!novaDescricaoDespesa.trim()) {
      toast.error('Descrição é obrigatória');
      return;
    }

    const valorNum = parseCommaNumber(novaValorDespesa);
    if (valorNum <= 0) {
      toast.error('Valor é obrigatório');
      return;
    }

    setShowSenhaDespesaModal(true);
  };

  // Confirmar adição de despesa
  const confirmarAdicionarDespesa = () => {
    if (!validateActionPassword(senhaDespesaInput, 'edit') && senhaDespesaInput !== senhaCaixa) {
      toast.error('Senha incorreta');
      setSenhaDespesaInput('');
      return;
    }

    const valorNum = parseCommaNumber(novaValorDespesa);
    const novaDespesa: Despesa = {
      id: Date.now().toString(),
      descricao: novaDescricaoDespesa.trim(),
      valor: valorNum,
    };

    setDespesas([...despesas, novaDespesa]);
    setNovaDescricaoDespesa('');
    setNovaValorDespesa('');
    setSenhaDespesaInput('');
    setShowSenhaDespesaModal(false);
    toast.success('Despesa adicionada');
    
    addTimelineEntry(
      'fechamento',
      'create',
      data,
      'Despesa',
      undefined,
      `${novaDescricaoDespesa} - R$ ${valorNum.toFixed(2)}`,
      `Despesa adicionada: ${novaDescricaoDespesa} - R$ ${valorNum.toFixed(2)}`
    );
  };

  // Remover despesa
  const removerDespesa = (id: string) => {
    setDespesaParaRemover(id);
    setShowSenhaModal(true);
  };

  // Confirmar remoção de despesa
  const confirmarRemocaoDespesa = () => {
    if (!validateActionPassword(senhaInput, 'delete') && senhaInput !== senhaCaixa) {
      toast.error('Senha incorreta!');
      setSenhaInput('');
      return;
    }

    if (despesaParaRemover) {
      const despesaRemovida = despesas.find(d => d.id === despesaParaRemover);
      setDespesas(despesas.filter(d => d.id !== despesaParaRemover));
      toast.success('Despesa removida');
      
      if (despesaRemovida) {
        addTimelineEntry(
          'fechamento',
          'delete',
          data,
          'Despesa',
          `${despesaRemovida.descricao} - R$ ${despesaRemovida.valor.toFixed(2)}`,
          undefined,
          `Despesa removida: ${despesaRemovida.descricao} - R$ ${despesaRemovida.valor.toFixed(2)}`
        );
      }
    }

    setShowSenhaModal(false);
    setSenhaInput('');
    setDespesaParaRemover(null);
  };

  // Calcular totais
  const totalVendas = parseCommaNumber(dinheiro) + parseCommaNumber(sobra) + parseCommaNumber(pix) + parseCommaNumber(cartao) + parseCommaNumber(boleto);
  const totalSangrias = sangrias.reduce((sum, s) => sum + s.valor, 0);
  const totalDespesas = despesas.reduce((sum, d) => sum + d.valor, 0);
  // Saldo Dinheiro = Dinheiro + Sobra - Sangria - Despesa
  const totalDinheiro = parseCommaNumber(dinheiro) + parseCommaNumber(sobra) - totalSangrias - totalDespesas;
  const totalGeral = totalVendas - totalSangrias - totalDespesas;

  // Filtrar logs de acessos para o dia
  const accessLogs = getAccessLogs();
  const todayLogs = accessLogs.filter(log => {
    const logDate = new Date(log.timestamp).toISOString().split('T')[0];
    return logDate === data && (log.action === 'edit' || log.action === 'delete');
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="flex gap-4 pb-24 px-2 max-w-6xl mx-auto flex-col md:flex-row">
      <div className="flex-1 space-y-3 min-w-0">
      {/* Data e Navegação */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const novaData = new Date(data);
            novaData.setDate(novaData.getDate() - 1);
            setData(novaData.toISOString().split('T')[0]);
          }}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Data</p>
          <p className="text-sm font-bold text-primary">{formatarDataComDia(data)}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const novaData = new Date(data);
            novaData.setDate(novaData.getDate() + 1);
            setData(novaData.toISOString().split('T')[0]);
          }}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </motion.div>

      {/* Nome Digital */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="p-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">
            Responsável <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={nomeDigital}
            onChange={(e) => setNomeDigital(e.target.value)}
            placeholder="Nome do responsável"
            className="h-8 text-sm"
          />
        </Card>
      </motion.div>

      {/* Valores Compactos em Grid 2x3 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 gap-1.5">
        {/* Dinheiro */}
        <Card className="p-2 border-l-4 border-l-green-500">
          <div className="flex items-center gap-1 mb-1">
            <Banknote className="w-4 h-4 text-green-600" />
            <label className="text-xs font-semibold text-muted-foreground">Dinheiro</label>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold">R$</span>
            <Input
              type="text"
              inputMode="numeric"
              disabled={!nomeDigital.trim()}
              value={dinheiro}
              onChange={(e) => setDinheiro(handleNumberInput(e.target.value))}
              placeholder="0,00"
              className="h-7 text-xs flex-1"
            />
          </div>
          <p className="text-xs font-bold text-green-600 mt-1">{formatCurrency(parseCommaNumber(dinheiro))}</p>
        </Card>

        {/* Sobra */}
        <Card className="p-2 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-1 mb-1">
            <Banknote className="w-4 h-4 text-amber-600" />
            <label className="text-xs font-semibold text-muted-foreground">Sobra</label>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold">R$</span>
            <Input
              type="text"
              inputMode="numeric"
              disabled={!nomeDigital.trim()}
              value={sobra}
              onChange={(e) => setSobra(handleNumberInput(e.target.value))}
              placeholder="0,00"
              className="h-7 text-xs flex-1"
            />
          </div>
          <p className="text-xs font-bold text-amber-600 mt-1">{formatCurrency(parseCommaNumber(sobra))}</p>
        </Card>

        {/* PIX */}
        <Card className="p-2 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-1 mb-1">
            <FileText className="w-4 h-4 text-blue-600" />
            <label className="text-xs font-semibold text-muted-foreground">PIX</label>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold">R$</span>
            <Input
              type="text"
              inputMode="numeric"
              disabled={!nomeDigital.trim()}
              value={pix}
              onChange={(e) => setPix(handleNumberInput(e.target.value))}
              placeholder="0,00"
              className="h-7 text-xs flex-1"
            />
          </div>
          <p className="text-xs font-bold text-blue-600 mt-1">{formatCurrency(parseCommaNumber(pix))}</p>
        </Card>

        {/* Cartão */}
        <Card className="p-2 border-l-4 border-l-purple-500">
          <div className="flex items-center gap-1 mb-1">
            <CreditCard className="w-4 h-4 text-purple-600" />
            <label className="text-xs font-semibold text-muted-foreground">Cartão</label>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold">R$</span>
            <Input
              type="text"
              inputMode="numeric"
              disabled={!nomeDigital.trim()}
              value={cartao}
              onChange={(e) => setCartao(handleNumberInput(e.target.value))}
              placeholder="0,00"
              className="h-7 text-xs flex-1"
            />
          </div>
          <p className="text-xs font-bold text-purple-600 mt-1">{formatCurrency(parseCommaNumber(cartao))}</p>
        </Card>

        {/* Boleto */}
        <Card className="p-2 border-l-4 border-l-red-500">
          <div className="flex items-center gap-1 mb-1">
            <FileText className="w-4 h-4 text-red-600" />
            <label className="text-xs font-semibold text-muted-foreground">Boleto</label>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold">R$</span>
            <Input
              type="text"
              inputMode="numeric"
              disabled={!nomeDigital.trim()}
              value={boleto}
              onChange={(e) => setBoleto(handleNumberInput(e.target.value))}
              placeholder="0,00"
              className="h-7 text-xs flex-1"
            />
          </div>
          <p className="text-xs font-bold text-red-600 mt-1">{formatCurrency(parseCommaNumber(boleto))}</p>
        </Card>
      </motion.div>

      {/* Sangrias Compacto */}
      {sangrias.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="p-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Sangrias ({sangrias.length})</p>
            <div className="space-y-1">
              {sangrias.map(s => (
                <div key={s.id} className="flex items-center justify-between p-1 bg-background rounded border border-border text-xs">
                  <span className="font-semibold">{formatCurrency(s.valor)}</span>
                  <button onClick={() => removerSangria(s.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Adicionar Sangria */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="p-2">
          <div className="flex gap-1">
            <Input
              type="text"
              inputMode="numeric"
              disabled={!nomeDigital.trim()}
              value={novaValorSangria}
              onChange={(e) => setNovaValorSangria(handleNumberInput(e.target.value))}
              placeholder="Sangria"
              className="h-7 text-xs flex-1"
            />
            <Button
              onClick={adicionarSangria}
              disabled={!nomeDigital.trim()}
              size="sm"
              className="h-7 px-2 text-xs"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </Card>
      </motion.div>

      {/* Despesas Compacto */}
      {despesas.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="p-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Despesas ({despesas.length})</p>
            <div className="space-y-1">
              {despesas.map(d => (
                <div key={d.id} className="flex items-center justify-between p-1 bg-background rounded border border-border text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{d.descricao}</p>
                    <p className="text-muted-foreground">{formatCurrency(d.valor)}</p>
                  </div>
                  <button onClick={() => removerDespesa(d.id)} className="ml-2 text-red-500 hover:text-red-700">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Adicionar Despesa */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="p-2">
          <div className="space-y-1">
            <Input
              type="text"
              disabled={!nomeDigital.trim()}
              value={novaDescricaoDespesa}
              onChange={(e) => setNovaDescricaoDespesa(e.target.value)}
              placeholder="Descrição"
              className="h-7 text-xs"
            />
            <div className="flex gap-1">
              <Input
                type="text"
                inputMode="numeric"
                disabled={!nomeDigital.trim()}
                value={novaValorDespesa}
                onChange={(e) => setNovaValorDespesa(handleNumberInput(e.target.value))}
                placeholder="Valor"
                className="h-7 text-xs flex-1"
              />
              <Button
                onClick={adicionarDespesa}
                disabled={!nomeDigital.trim()}
                size="sm"
                className="h-7 px-2 text-xs"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

       {/* Totais Resumidos */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="grid grid-cols-2 gap-1.5">
        <Card className="p-3 bg-blue-50 dark:bg-blue-950/30">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Total de Vendas</p>
          <p className="text-lg font-bold text-blue-600">{formatCurrency(totalVendas)}</p>
        </Card>
        <Card className="p-3 bg-red-50 dark:bg-red-950/30">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Total de Sangrias</p>
          <p className="text-lg font-bold text-red-600">{formatCurrency(totalSangrias)}</p>
        </Card>
        <Card className="p-3 bg-green-50 dark:bg-green-950/30">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Saldo Dinheiro</p>
          <p className="text-lg font-bold text-green-600">{formatCurrency(totalDinheiro)}</p>
        </Card>
        <Card className="p-3 bg-primary/10">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Total Geral</p>
          <p className="text-lg font-bold text-primary">{formatCurrency(totalGeral)}</p>
        </Card>
      </motion.div>

      {/* Botão Salvar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Button
          onClick={salvarFechamento}
          disabled={!nomeDigital.trim()}
          className="w-full h-10 text-sm font-semibold"
        >
          Salvar Fechamento
        </Button>
      </motion.div>

      {/* Modal Senha Despesa */}
      <Dialog open={showSenhaDespesaModal} onOpenChange={setShowSenhaDespesaModal}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Confirmar Despesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              value={senhaDespesaInput}
              onChange={(e) => setSenhaDespesaInput(e.target.value)}
              placeholder="Digite a senha"
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmarAdicionarDespesa();
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSenhaDespesaModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmarAdicionarDespesa}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Senha Remoção */}
      <Dialog open={showSenhaModal} onOpenChange={setShowSenhaModal}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Confirmar Remoção</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              inputMode="numeric"
              value={senhaInput}
              onChange={(e) => setSenhaInput(e.target.value)}
              placeholder="Digite a senha"
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmarRemocaoDespesa();
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSenhaModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmarRemocaoDespesa}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
      <div className="hidden md:block">
        <AccessLogsReport logs={todayLogs} />
      </div>
    </div>
  );
}
