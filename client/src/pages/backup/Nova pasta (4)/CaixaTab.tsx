'use client';

import { useApp } from '@/contexts/AppContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, Edit2, Calendar, Banknote, FileText, CreditCard, Save, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import React, { useRef, useState, useEffect } from 'react';

interface Sangria {
  id: string;
  valor: number;
}

interface Despesa {
  id: string;
  descricao: string;
  valor: number;
}

interface Produto {
  id: string;
  descricao: string;
  quantidade: number;
  valor: string;
  hora: string;
}

interface CaixaData {
  dinheiro: Produto[];
  pix: Produto[];
  cartao: Produto[];
  boleto: Produto[];
}

interface FechamentoData {
  dinheiro: string;
  sobra: string;
  pix: string;
  boleto: string;
  cartao: string;
  sangrias: Sangria[];
  despesas: Despesa[];
  nomeDigital: string;
}

type CaixaTab = 'caixa' | 'fechamento';
type TipoPagamento = 'dinheiro' | 'pix' | 'cartao' | 'boleto';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

  // Limpar casas decimais desnecessárias
const limparDecimais = (value: number): number => {
  return Math.round(value * 100) / 100;
};



// Parse comma-separated numbers
const parseCommaNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return parseFloat(value.toString().replace(',', '.')) || 0;
};

// Format input to accept only comma as decimal separator
const handleNumberInput = (value: string): string => {
  return value.replace(/[^0-9,]/g, '');
};

// Formatar data para DD/MM/YYYY
const formatarData = (dateString: string): string => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

// Formatar data com dia da semana: DD/MM/YYYY - Dia da Semana
const formatarDataComDia = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00');
  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const diaSemana = diasSemana[date.getDay()];
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year} - ${diaSemana}`;
};

// Obter hora atual em formato HH:MM
const obterHoraAtual = (): string => {
  const agora = new Date();
  const horas = String(agora.getHours()).padStart(2, '0');
  const minutos = String(agora.getMinutes()).padStart(2, '0');
  return `${horas}:${minutos}`;
};

export default function CaixaTab() {
  const { setScreen, currentStore, stores, settings, saveEntry, validateActionPassword, logAccess, addTimelineEntry, caixaData, setCaixaData, fechamentoData, setFechamentoData } = useApp();
  const store = stores[currentStore];
  
  const [activeTab, setActiveTab] = useState<CaixaTab>('caixa');
  const today = new Date().toISOString().split('T')[0];
  const [data, setData] = useState(today);
  const [dataDisplay, setDataDisplay] = useState(formatarData(today));
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  
  // Usar dados do AppContext (sincronizados com servidor)
  // Dados são estruturados por loja: caixaData[storeId][date]
  const caixaPorData = caixaData[currentStore] || {};
  const setCaixaPorData = (updater: any) => {
    setCaixaData((prev: any) => ({
      ...prev,
      [currentStore]: typeof updater === 'function' ? updater(prev[currentStore] || {}) : updater
    }));
  };
  
  const fechamentoPorData = fechamentoData[currentStore] || {};
  const setFechamentoPorData = (updater: any) => {
    setFechamentoData((prev: any) => ({
      ...prev,
      [currentStore]: typeof updater === 'function' ? updater(prev[currentStore] || {}) : updater
    }));
  };

  // Obter dados da data atual
  const getCaixaDataAtual = (): CaixaData => {
    return caixaPorData[data] || { dinheiro: [], pix: [], cartao: [], boleto: [] };
  };
  
  const getFechamentoDataAtual = (): FechamentoData => {
    // Primeiro tenta carregar do AppContext (servidor)
    const fromServer = fechamentoPorData[data];
    if (fromServer && (fromServer.dinheiro || fromServer.sobra || fromServer.pix || fromServer.boleto || fromServer.cartao)) {
      return fromServer;
    }
    
    // Se estiver vazio, tenta carregar do localStorage como fallback
    const fromLocalStorage = localStorage.getItem(`fechamento_${currentStore}_${data}`);
    if (fromLocalStorage) {
      try {
        return JSON.parse(fromLocalStorage);
      } catch (e) {
        console.error('Erro ao carregar fechamento do localStorage:', e);
      }
    }
    
    // Se ainda estiver vazio, retorna padrão
    return { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], despesas: [], nomeDigital: '' };
  };
  
  // Estado para forçar re-render quando caixaData muda
  const [, forceUpdate] = useState({});
  
  // Recarregar caixaAtual quando caixaData muda
  useEffect(() => {
    forceUpdate({});
  }, [caixaData, data]);
  
  const caixaAtual = getCaixaDataAtual();
  const fechamentoAtual = getFechamentoDataAtual();

  // Verificar se a data mudou de mês
  const mudouDeMes = (dataAtual: string, novadata: string): boolean => {
    const [anoAtual, mesAtual] = dataAtual.split('-');
    const [anoNova, mesNova] = novadata.split('-');
    return anoAtual !== anoNova || mesAtual !== mesNova;
  };

  // Validar senha para navegação de datas
  const validarSenhaNavegacao = (novadata: string) => {
    const protection = settings.dateProtection || 'month';
    let precisaSenha = false;
    if (protection === 'day') {
      precisaSenha = data !== novadata;
    } else if (protection === 'month') {
      precisaSenha = mudouDeMes(data, novadata);
    }
    if (precisaSenha) {
      setPendingDate(novadata);
      setShowPasswordDialog(true);
      setPasswordInput('');
    } else {
      setData(novadata);
      setDataDisplay(formatarData(novadata));
    }
  };

  // Confirmar senha
  const confirmarSenha = () => {
    const isOldPassword = passwordInput === '2513089';
    const actionUser = (settings.actionUsers || []).find(u => u.password === passwordInput);
    const isValid = isOldPassword || !!actionUser;
    
    if (!isValid) {
      logAccess('changeDate', 'failed', 'Desconhecido', 'Senha incorreta');
      toast.error('Senha incorreta');
      setPasswordInput('');
      return;
    }
    
    if (actionUser && !actionUser.permissions.includes('changeDate')) {
      logAccess('changeDate', 'failed', actionUser.name, 'Sem permissao para trocar data');
      toast.error('Usuario sem permissao para trocar data');
      setPasswordInput('');
      return;
    }
    
    logAccess('changeDate', 'success', actionUser?.name || 'Desconhecido', 'Troca de data autorizada');
    if (pendingDate) {
      setData(pendingDate);
      setDataDisplay(formatarData(pendingDate));
    }
    setShowPasswordDialog(false);
    setPasswordInput('');
    setPendingDate(null);
    toast.success('Acesso concedido');
  };

  // Estado de edição
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoTipo, setEditandoTipo] = useState<TipoPagamento | null>(null);

  // Formulários para adicionar/editar produtos
  const [descricaoDinheiro, setDescricaoDinheiro] = useState('');
  const [quantidadeDinheiro, setQuantidadeDinheiro] = useState('');
  const [valorDinheiro, setValorDinheiro] = useState('');

  const [descricaoPix, setDescricaoPix] = useState('');
  const [quantidadePix, setQuantidadePix] = useState('');
  const [valorPix, setValorPix] = useState('');

  const [descricaoCartao, setDescricaoCartao] = useState('');
  const [quantidadeCartao, setQuantidadeCartao] = useState('');
  const [valorCartao, setValorCartao] = useState('');

  const [descricaoBoleto, setDescricaoBoleto] = useState('');
  const [quantidadeBoleto, setQuantidadeBoleto] = useState('');
  const [valorBoleto, setValorBoleto] = useState('');

  // Aba FECHAMENTO - usar dados da data atual
  const [dinheiro, setDinheiro] = useState(fechamentoAtual.dinheiro);
  const [sobra, setSobra] = useState(fechamentoAtual.sobra);
  const [pix, setPix] = useState(fechamentoAtual.pix);
  const [boleto, setBoleto] = useState(fechamentoAtual.boleto);
  const [cartao, setCartao] = useState(fechamentoAtual.cartao);
  
  const [sangrias, setSangrias] = useState<Sangria[]>(fechamentoAtual.sangrias ?? []);
  const [novaValorSangria, setNovaValorSangria] = useState('');
  
  const [despesas, setDespesas] = useState<Despesa[]>(fechamentoAtual.despesas ?? []);
  const [novaDescricaoDespesa, setNovaDescricaoDespesa] = useState('');
  const [novaValorDespesa, setNovaValorDespesa] = useState('');
  
  const [nomeDigital, setNomeDigital] = useState(fechamentoAtual.nomeDigital);

  // Recarregar dados de FECHAMENTO quando currentStore ou data mudam
  useEffect(() => {
    const novoFechamento = getFechamentoDataAtual();
    setDinheiro(novoFechamento.dinheiro);
    setSobra(novoFechamento.sobra);
    setPix(novoFechamento.pix);
    setBoleto(novoFechamento.boleto);
    setCartao(novoFechamento.cartao);
    setSangrias(novoFechamento.sangrias ?? []);
    setDespesas(novoFechamento.despesas ?? []);
    setNomeDigital(novoFechamento.nomeDigital);
  }, [currentStore, data]);

  // Modal de senha para exclusão
  const [showSenhaModal, setShowSenhaModal] = useState(false);
  const [senhaInput, setSenhaInput] = useState('');
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<{ tipo: TipoPagamento; id: string } | null>(null);

  // Modal de edição
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalTipo, setEditModalTipo] = useState<TipoPagamento | null>(null);
  const [editModalDescricao, setEditModalDescricao] = useState('');
  const [editModalQuantidade, setEditModalQuantidade] = useState('');
  const [editModalValor, setEditModalValor] = useState('');

  // Senhas
  const [senhaCaixa, setSenhaCaixa] = useState('2513089');
  const [senhaVendas, setSenhaVendas] = useState('2512');

  // Modal de senha para editar
  const [showSenhaEditModal, setShowSenhaEditModal] = useState(false);
  const [senhaEditInput, setSenhaEditInput] = useState('');
  const [produtoParaEditar, setProdutoParaEditar] = useState<{ tipo: TipoPagamento; produto: Produto } | null>(null);

  // Modal de senha para adicionar despesa
  const [showSenhaDespesaModal, setShowSenhaDespesaModal] = useState(false);
  const [senhaDespesaInput, setSenhaDespesaInput] = useState('');

  // Refs para navegação com ENTER em CAIXA
  const inputRefsDinheiro = useRef<{ desc: HTMLInputElement | null; qtd: HTMLInputElement | null; valor: HTMLInputElement | null }>({ desc: null, qtd: null, valor: null });
  const inputRefsPix = useRef<{ desc: HTMLInputElement | null; qtd: HTMLInputElement | null; valor: HTMLInputElement | null }>({ desc: null, qtd: null, valor: null });
  const inputRefsCartao = useRef<{ desc: HTMLInputElement | null; qtd: HTMLInputElement | null; valor: HTMLInputElement | null }>({ desc: null, qtd: null, valor: null });
  const inputRefsBoleto = useRef<{ desc: HTMLInputElement | null; qtd: HTMLInputElement | null; valor: HTMLInputElement | null }>({ desc: null, qtd: null, valor: null });
  const buttonRefsDinheiro = useRef<HTMLButtonElement | null>(null);
  const buttonRefsPix = useRef<HTMLButtonElement | null>(null);
  const buttonRefsCartao = useRef<HTMLButtonElement | null>(null);
  const buttonRefsBoleto = useRef<HTMLButtonElement | null>(null);

  // Refs para navegação com ENTER em FECHAMENTO
  const inputRefsSangria = useRef<HTMLInputElement | null>(null);
  const buttonRefsSangria = useRef<HTMLButtonElement | null>(null);
  const inputRefsDespesaDesc = useRef<HTMLInputElement | null>(null);
  const inputRefsDespesaValor = useRef<HTMLInputElement | null>(null);
  const buttonRefsDespesa = useRef<HTMLButtonElement | null>(null);

  // Calcular totais para aba CAIXA
  const totalDinheiro = caixaAtual.dinheiro.reduce((sum: number, p: Produto) => sum + (parseFloat(p.valor) * p.quantidade), 0);
  const totalPix = caixaAtual.pix.reduce((sum: number, p: Produto) => sum + (parseFloat(p.valor) * p.quantidade), 0);
  const totalCartao = caixaAtual.cartao.reduce((sum: number, p: Produto) => sum + (parseFloat(p.valor) * p.quantidade), 0);
  const totalBoleto = caixaAtual.boleto.reduce((sum: number, p: Produto) => sum + (parseFloat(p.valor) * p.quantidade), 0);

  // Calcular totais para aba FECHAMENTO
  const dinheiroNum = limparDecimais(parseFloat(dinheiro.replace(',', '.')) || 0);
  const sobraNum = limparDecimais(parseFloat(sobra.replace(',', '.')) || 0);
  const pixNum = limparDecimais(parseFloat(pix.replace(',', '.')) || 0);
  const boletoNum = limparDecimais(parseFloat(boleto.replace(',', '.')) || 0);
  const cartaoNum = limparDecimais(parseFloat(cartao.replace(',', '.')) || 0);
  const totalVendas = limparDecimais(dinheiroNum + sobraNum + boletoNum + pixNum + cartaoNum);
  const totalSangria = limparDecimais(sangrias?.reduce((sum, s) => sum + s.valor, 0) || 0);
  const totalDespesa = limparDecimais(despesas?.reduce((sum, d) => sum + d.valor, 0) || 0);
  const saldoDinheiro = limparDecimais((dinheiroNum + sobraNum) - totalSangria - totalDespesa);
  const saldoGeral = limparDecimais(totalVendas - totalSangria - totalDespesa);

  // Sincronizar automaticamente CAIXA para FECHAMENTO
  // Quando CAIXA muda, atualiza FECHAMENTO com os totais
  useEffect(() => {
    // Sincronizar SEMPRE que os totais de CAIXA mudarem
    setDinheiro(totalDinheiro.toFixed(2).replace('.', ','));
    setPix(totalPix.toFixed(2).replace('.', ','));
    setCartao(totalCartao.toFixed(2).replace('.', ','));
    setBoleto(totalBoleto.toFixed(2).replace('.', ','));
  }, [totalDinheiro, totalPix, totalCartao, totalBoleto]);

  // Salvar valores de FECHAMENTO no AppContext quando mudarem
  useEffect(() => {
    setFechamentoPorData((prev: any) => ({
      ...prev,
      [data]: {
        dinheiro,
        sobra,
        pix,
        boleto,
        cartao,
        sangrias,
        despesas,
        nomeDigital
      }
    }));
  }, [dinheiro, sobra, pix, boleto, cartao, sangrias, despesas, nomeDigital, data]);

  // Salvar também no localStorage como fallback
  useEffect(() => {
    const fechamentoDataToSave = {
      dinheiro,
      sobra,
      pix,
      boleto,
      cartao,
      sangrias,
      despesas,
      nomeDigital
    };
    localStorage.setItem(`fechamento_${currentStore}_${data}`, JSON.stringify(fechamentoDataToSave));
  }, [dinheiro, sobra, pix, boleto, cartao, sangrias, despesas, nomeDigital, currentStore, data]);


  // Sincronizar em tempo real com LANÇAMENTOS quando FECHAMENTO mudar (SEM data como dependência)
  // Sincronizar automaticamente com LANCAMENTOS sempre que FECHAMENTO mudar
  useEffect(() => {
    sincronizarComLancamentos(data, {
      dinheiro: parseCommaNumber(dinheiro) || 0,
      sobra: parseCommaNumber(sobra) || 0,
      pix: parseCommaNumber(pix) || 0,
      boleto: parseCommaNumber(boleto) || 0,
      cartao: parseCommaNumber(cartao) || 0,
      sangria: sangrias.reduce((sum, s) => sum + s.valor, 0),
      despesa: despesas?.reduce((sum, d) => sum + d.valor, 0) || 0
    });
  }, [dinheiro, sobra, pix, boleto, cartao, sangrias, despesas, data, saveEntry, currentStore]);

  // Atualizar estado de fechamento quando a data mudar
  useEffect(() => {
    const novoFechamento = getFechamentoDataAtual();
    setDinheiro(novoFechamento.dinheiro);
    setSobra(novoFechamento.sobra);
    setPix(novoFechamento.pix);
    setBoleto(novoFechamento.boleto);
    setCartao(novoFechamento.cartao);
    setSangrias(novoFechamento.sangrias);
    setDespesas(novoFechamento.despesas);
    setNomeDigital(novoFechamento.nomeDigital);
    setNovaValorSangria('');
    setNovaDescricaoDespesa('');
    setNovaValorDespesa('');
    
    // Limpar formulários de CAIXA
    setDescricaoDinheiro('');
    setQuantidadeDinheiro('');
    setValorDinheiro('');
    setDescricaoPix('');
    setQuantidadePix('');
    setValorPix('');
    setDescricaoCartao('');
    setQuantidadeCartao('');
    setValorCartao('');
    setDescricaoBoleto('');
    setQuantidadeBoleto('');
    setValorBoleto('');
  }, [data]);

  // Abrir modal de senha para editar
  const abrirModalSenhaEdicao = (tipo: TipoPagamento, produto: Produto) => {
    setProdutoParaEditar({ tipo, produto });
    setShowSenhaEditModal(true);
    setSenhaEditInput('');
  };

  // Confirmar senha e abrir modal de edição
  const confirmarSenhaEdicao = () => {
    const isOldPassword = senhaEditInput === senhaCaixa;
    const actionUser = (settings.actionUsers || []).find(u => u.password === senhaEditInput);
    const isValid = isOldPassword || !!actionUser;
    
    if (!isValid) {
      logAccess('edit', 'failed', 'Desconhecido', 'Senha incorreta');
      toast.error('Senha incorreta!');
      setSenhaEditInput('');
      return;
    }
    
    if (actionUser && !actionUser.permissions.includes('edit')) {
      logAccess('edit', 'failed', actionUser.name, 'Sem permissao para editar');
      toast.error('Usuario sem permissao para editar');
      setSenhaEditInput('');
      return;
    }

    const detalhesEdicao = `Edição autorizada: ${produtoParaEditar?.tipo || 'desconhecido'} | Valor: R$ ${produtoParaEditar?.produto.valor || '0'}`;
    logAccess('edit', 'success', actionUser?.name || 'Desconhecido', detalhesEdicao);
    if (produtoParaEditar) {
      abrirModalEdicao(produtoParaEditar.tipo, produtoParaEditar.produto);
    }

    setShowSenhaEditModal(false);
    setSenhaEditInput('');
  };

  // Abrir modal de edição
  const abrirModalEdicao = (tipo: TipoPagamento, produto: Produto) => {
    setEditandoId(produto.id);
    setEditModalTipo(tipo);
    setEditModalDescricao(produto.descricao);
    setEditModalQuantidade(produto.quantidade.toString());
    setEditModalValor(produto.valor.toString().replace('.', ','));
    setShowEditModal(true);
  };

  // Salvar edição
  const salvarEdicao = () => {
    if (!editModalDescricao.trim()) {
      toast.error('Descrição é obrigatória');
      return;
    }

    const valorNum = parseCommaNumber(editModalValor);
    if (valorNum <= 0) {
      toast.error('Valor é obrigatório');
      return;
    }

    const quantidadeNum = parseCommaNumber(editModalQuantidade) || 1;
    const tipo = editModalTipo as TipoPagamento;
    const valorFormatado = valorNum.toFixed(2).replace('.', ',');

    setCaixaPorData((prev: any) => ({
      ...prev,
      [data]: {
        ...prev[data] || { dinheiro: [], pix: [], cartao: [], boleto: [] },
        [tipo]: (prev[data]?.[tipo] || []).map((p: any) => 
          p.id === editandoId ? { ...p, descricao: editModalDescricao.trim(), quantidade: quantidadeNum, valor: valorFormatado } : p
        )
      }
    }));

    // Fechar modal e limpar estados
    setShowEditModal(false);
    setEditandoId(null);
    setEditandoTipo(null);
    setEditModalDescricao('');
    setEditModalQuantidade('');
    setEditModalValor('');
    
    toast.success('Produto atualizado');
    
    // Registrar na timeline
    addTimelineEntry(
      'caixa',
      'update',
      data,
      `Produto ${tipo}`,
      `Anterior`,
      `${editModalDescricao} (${quantidadeNum}x ${valorNum})`,
      `Produto atualizado em CAIXA: ${editModalDescricao} - ${quantidadeNum}x R$ ${valorNum.toFixed(2)}`
    );
  };

  // Cancelar edição
  const cancelarEdicao = () => {
    setEditandoId(null);
    setEditandoTipo(null);
    setDescricaoDinheiro('');
    setQuantidadeDinheiro('');
    setValorDinheiro('');
    setDescricaoPix('');
    setQuantidadePix('');
    setValorPix('');
    setDescricaoCartao('');
    setQuantidadeCartao('');
    setValorCartao('');
    setDescricaoBoleto('');
    setQuantidadeBoleto('');
    setValorBoleto('');
  };

  // Adicionar produto
  const adicionarProduto = (tipo: TipoPagamento) => {
    let descricao = '';
    let quantidade = '';
    let valor = '';

    if (tipo === 'dinheiro') {
      descricao = descricaoDinheiro;
      quantidade = quantidadeDinheiro;
      valor = valorDinheiro;
    } else if (tipo === 'pix') {
      descricao = descricaoPix;
      quantidade = quantidadePix;
      valor = valorPix;
    } else if (tipo === 'cartao') {
      descricao = descricaoCartao;
      quantidade = quantidadeCartao;
      valor = valorCartao;
    } else if (tipo === 'boleto') {
      descricao = descricaoBoleto;
      quantidade = quantidadeBoleto;
      valor = valorBoleto;
    }

    if (!descricao.trim()) {
      toast.error('Descrição é obrigatória');
      return;
    }

    const valorNum = parseCommaNumber(valor);
    if (valorNum <= 0) {
      toast.error('Valor é obrigatório');
      return;
    }

    const quantidadeNum = parseCommaNumber(quantidade) || 1;

    const valorFormatado = valorNum.toFixed(2).replace('.', ',');
    
    const novoProduto: Produto = {
      id: Date.now().toString(),
      descricao: descricao.trim(),
      quantidade: quantidadeNum,
      valor: valorFormatado,
      hora: obterHoraAtual(),
    };

    setCaixaPorData((prev: any) => ({
      ...prev,
      [data]: {
        ...prev[data] || { dinheiro: [], pix: [], cartao: [], boleto: [] },
        [tipo]: [...(prev[data]?.[tipo] || []), novoProduto]
      }
    }));

    if (tipo === 'dinheiro') {
      setDescricaoDinheiro('');
      setQuantidadeDinheiro('');
      setValorDinheiro('');
    } else if (tipo === 'pix') {
      setDescricaoPix('');
      setQuantidadePix('');
      setValorPix('');
    } else if (tipo === 'cartao') {
      setDescricaoCartao('');
      setQuantidadeCartao('');
      setValorCartao('');
    } else if (tipo === 'boleto') {
      setDescricaoBoleto('');
      setQuantidadeBoleto('');
      setValorBoleto('');
    }

    toast.success('Produto adicionado');
    
    // Registrar na timeline
    addTimelineEntry(
      'caixa',
      'create',
      data,
      `Produto ${tipo}`,
      undefined,
      `${descricao} (${quantidadeNum}x ${valorNum})`,
      `Novo produto adicionado em CAIXA: ${descricao} - ${quantidadeNum}x R$ ${valorNum.toFixed(2)}`
    );
  };

  // Abrir modal de senha para exclusão
  const abrirModalExclusao = (tipo: TipoPagamento, id: string) => {
    setProdutoParaExcluir({ tipo, id });
    setShowSenhaModal(true);
    setSenhaInput('');
  };

  // Confirmar exclusão com senha
  const confirmarExclusaoComSenha = () => {
    const isOldPassword = senhaInput === senhaCaixa;
    const actionUser = (settings.actionUsers || []).find(u => u.password === senhaInput);
    const isValid = isOldPassword || !!actionUser;
    
    if (!isValid) {
      logAccess('delete', 'failed', 'Desconhecido', 'Senha incorreta');
      toast.error('Senha incorreta!');
      setSenhaInput('');
      return;
    }
    
    if (actionUser && !actionUser.permissions.includes('delete')) {
      logAccess('delete', 'failed', actionUser.name, 'Sem permissao para deletar');
      toast.error('Usuario sem permissao para deletar');
      setSenhaInput('');
      return;
    }

    const caixaAtualData = caixaPorData[data] || { dinheiro: [], pix: [], cartao: [], boleto: [] };
    const produtoParaDeletarInfo = (caixaAtualData[produtoParaExcluir?.tipo as TipoPagamento] || []).find((p: any) => p.id === produtoParaExcluir?.id);
    const detalhesExclusao = `Exclusão autorizada: ${produtoParaExcluir?.tipo || 'desconhecido'} | Valor: R$ ${produtoParaDeletarInfo?.valor || '0'}`;
    logAccess('delete', 'success', actionUser?.name || 'Desconhecido', detalhesExclusao);
    if (produtoParaExcluir) {
      removerProdutoConfirmado(produtoParaExcluir.tipo, produtoParaExcluir.id);
    }

    setShowSenhaModal(false);
    setSenhaInput('');
    setProdutoParaExcluir(null);
  };

  // Remover produto após confirmação de senha
  const removerProdutoConfirmado = (tipo: TipoPagamento, id: string) => {
    const caixaAtualData = caixaPorData[data] || { dinheiro: [], pix: [], cartao: [], boleto: [] };
    const produtoParaDeletar = (caixaAtualData[tipo] || []).find((p: any) => p.id === id);
    
    setCaixaPorData((prev: any) => ({
      ...prev,
      [data]: {
        ...prev[data] || { dinheiro: [], pix: [], cartao: [], boleto: [] },
        [tipo]: (prev[data]?.[tipo] || []).filter((p: any) => p.id !== id)
      }
    }));

    toast.success('Produto removido');
    
    if (produtoParaDeletar) {
      addTimelineEntry(
        'caixa',
        'delete',
        data,
        `Produto ${tipo}`,
        `${produtoParaDeletar.descricao} (${produtoParaDeletar.quantidade}x ${produtoParaDeletar.valor})`,
        undefined,
        `Produto removido de CAIXA: ${produtoParaDeletar.descricao}`
      );
    }
  };

  // Cancelar edição modal
  const cancelarEdicaoModal = () => {
    setShowEditModal(false);
    setEditModalTipo(null);
    setEditModalDescricao('');
    setEditModalQuantidade('');
    setEditModalValor('');
    setEditandoId(null);
  };

  // Sincronizar com LANÇAMENTOS usando AppContext
  const sincronizarComLancamentos = (data: string, fechamentoValues: Record<string, number>) => {
    try {
      // Obter mapeamento configurado em Opções
      const lanNumber = currentStore === 'loja1' ? 'lan1' : 'lan2';
      const mappingKey = lanNumber === 'lan1' ? 'fieldMappingLan1' : 'fieldMappingLan2';
      const mapping = settings[mappingKey] || [];
      
      if (!mapping || mapping.length === 0) {
        console.log('Nenhum mapeamento configurado para', lanNumber);
        return;
      }
      
      // Preparar valores para salvar em LANÇAMENTOS
      const values: Record<string, number> = {};
      
      // Aplicar mapeamento de FECHAMENTO para LANÇAMENTOS
      console.log('[SYNC DEBUG] Mapeamento:', mapping);
      console.log('[SYNC DEBUG] Valores de FECHAMENTO:', fechamentoValues);
      mapping.forEach((map: any) => {
        if (map.fechamento_field && map.lancamento_field) {
          const value = fechamentoValues[map.fechamento_field] || 0;
          console.log(`[SYNC DEBUG] Mapeando ${map.fechamento_field} (${value}) para ${map.lancamento_field}`);
          if (value > 0) {
            values[map.lancamento_field] = value;
          }
        }
      });
      console.log('[SYNC DEBUG] Valores finais para sincronizar:', values);
      
      // Salvar em AppContext (LANÇAMENTOS)
      if (Object.keys(values).length > 0) {
        saveEntry(data, values);
        console.log('Sincronização realizada para', lanNumber, 'data:', data, 'valores:', values);
      }
    } catch (error) {
      console.error('Erro na sincronização:', error);
    }
  };

  const salvarFechamento = () => {
    // Validar nome obrigatório
    if (!nomeDigital.trim()) {
      toast.error('Nome do fechamento é obrigatório!');
      return;
    }
    
    setFechamentoPorData((prev: any) => ({
      ...prev,
      [data]: {
        dinheiro,
        sobra,
        pix,
        boleto,
        cartao,
        sangrias,
        despesas,
        nomeDigital
      }
    }));
    
    // Sincronização em tempo real já foi feita pelo useEffect
    toast.success('Fechamento salvo');
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

    const novasSangrias = [...sangrias, novaSangria];
    setSangrias(novasSangrias);
    
    setFechamentoPorData((prev: any) => ({
      ...prev,
      [data]: {
        ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], despesas: [], nomeDigital: '' },
        sangrias: novasSangrias
      }
    }));

    setNovaValorSangria('');
    toast.success('Sangria adicionada');
  };

  // Adicionar despesa - pedir senha
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

    // Pedir senha antes de adicionar despesa
    setShowSenhaDespesaModal(true);
  };

  // Confirmar adição de despesa com senha
  const confirmarAdicionarDespesa = () => {
    if (!validateActionPassword(senhaDespesaInput, 'edit') && senhaDespesaInput !== senhaCaixa) {
      toast.error('Senha incorreta');
      setSenhaDespesaInput('');
      return;
    }

    const valorNum = parseCommaNumber(novaValorDespesa);
    if (valorNum <= 0) {
      toast.error('Valor é obrigatório');
      return;
    }

    const novaDespesa: Despesa = {
      id: Date.now().toString(),
      descricao: novaDescricaoDespesa.trim(),
      valor: valorNum,
    };

    const novasDespesas = [...(despesas ?? []), novaDespesa];
    setDespesas(novasDespesas);
    
    setFechamentoPorData((prev: any) => ({
      ...prev,
      [data]: {
        ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], despesas: [], nomeDigital: '' },
        despesas: novasDespesas
      }
    }));

    setNovaDescricaoDespesa('');
    setNovaValorDespesa('');
    setSenhaDespesaInput('');
    setShowSenhaDespesaModal(false);
    toast.success('Despesa adicionada');
  };

  // Remover sangria
  const removerSangria = (id: string) => {
    const novasSangrias = sangrias.filter(s => s.id !== id);
    setSangrias(novasSangrias);
    
    setFechamentoPorData((prev: any) => ({
      ...prev,
      [data]: {
        ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], despesas: [], nomeDigital: '' },
        sangrias: novasSangrias
      }
    }));

    toast.success('Sangria removida');
  };

  // Remover despesa
  const removerDespesa = (id: string) => {
    const novasDespesas = despesas.filter(d => d.id !== id);
    setDespesas(novasDespesas);
    
    setFechamentoPorData((prev: any) => ({
      ...prev,
      [data]: {
        ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], despesas: [], nomeDigital: '' },
        despesas: novasDespesas
      }
    }));

    toast.success('Despesa removida');
  };

  // Exportar PDF
  // Exportar backup de CAIXA
  const exportarBackup = () => {
    try {
      const backupData = {
        data: new Date().toISOString(),
        caixa: caixaPorData,
        fechamento: fechamentoPorData
      };
      const json = JSON.stringify(backupData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup-caixa-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Backup exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar backup:', error);
      toast.error('Erro ao exportar backup');
    }
  };

  // Importar backup de CAIXA
  const importarBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event: any) => {
        try {
          const backupData = JSON.parse(event.target.result);
          if (backupData.caixa && backupData.fechamento) {
            setCaixaPorData(backupData.caixa);
            setFechamentoPorData(backupData.fechamento);
            toast.success('Backup importado com sucesso!');
          } else {
            toast.error('Arquivo de backup inválido');
          }
        } catch (error) {
          console.error('Erro ao importar backup:', error);
          toast.error('Erro ao importar backup');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const exportarPDF = () => {
    try {
      // Usar biblioteca de PDF disponível
      const html = `
        <html>
          <head>
            <title>Fechamento de Caixa</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 10px; font-size: 11px; }
              h1 { text-align: center; margin-bottom: 8px; font-size: 12px; margin-top: 0; }
              .section { margin-bottom: 10px; }
              .section-title { font-weight: bold; font-size: 10px; margin-bottom: 5px; border-bottom: 1px solid #000; padding-bottom: 2px; }
              .item { margin-left: 10px; margin-bottom: 2px; font-size: 10px; }
              .total { font-weight: bold; margin-top: 5px; font-size: 10px; }
              .footer { margin-top: 10px; font-size: 9px; }
              p { margin: 2px 0; font-size: 10px; }
            </style>
          </head>
          <body>
            <h1>FECHAMENTO DE CAIXA</h1>
            <p><strong>Data:</strong> ${formatarDataComDia(data)}</p>
            
            <div class="section">
              <div class="section-title">Valores de Caixa</div>
              <div class="item">Dinheiro: R$ ${formatCurrency(parseFloat(dinheiro) || 0)}</div>
              <div class="item">Sobra: R$ ${formatCurrency(parseFloat(sobra) || 0)}</div>
              <div class="item">PIX: R$ ${formatCurrency(parseFloat(pix) || 0)}</div>
              <div class="item">Cartão: R$ ${formatCurrency(parseFloat(cartao) || 0)}</div>
              <div class="item">Boleto: R$ ${formatCurrency(parseFloat(boleto) || 0)}</div>
            </div>
            
            ${sangrias.length > 0 ? `
            <div class="section">
              <div class="section-title">Sangrias</div>
              ${sangrias.map(s => `<div class="item">- R$ ${formatCurrency(s.valor)}</div>`).join('')}
            </div>
            ` : ''}
            
            ${despesas.length > 0 ? `
            <div class="section">
              <div class="section-title">Despesas/Estornos</div>
              ${despesas.map(d => `<div class="item">- ${d.descricao}: R$ ${formatCurrency(d.valor)}</div>`).join('')}
            </div>
            ` : ''}
            
            <div class="section">
              <div class="section-title">Totais</div>
              <div class="item total">Saldo em Dinheiro: R$ ${formatCurrency((parseFloat(dinheiro) || 0) + (parseFloat(sobra) || 0) - despesas.reduce((sum, d) => sum + d.valor, 0))}</div>
              <div class="item total">Saldo Geral: R$ ${formatCurrency((parseFloat(dinheiro) || 0) + (parseFloat(sobra) || 0) + (parseFloat(pix) || 0) + (parseFloat(cartao) || 0) + (parseFloat(boleto) || 0) - sangrias.reduce((sum, s) => sum + s.valor, 0) - despesas.reduce((sum, d) => sum + d.valor, 0))}</div>
            </div>
            
            ${nomeDigital ? `
            <div class="footer">
              <p>Responsável: ${nomeDigital}</p>
            </div>
            ` : ''}
          </body>
        </html>
      `;
      
      // Abrir em nova janela para imprimir/salvar como PDF
      const newWindow = window.open('', '', 'width=800,height=600');
      if (newWindow) {
        newWindow.document.write(html);
        newWindow.document.close();
        newWindow.print();
        toast.success('Abrindo visualização de PDF...');
      }
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast.error('Erro ao exportar PDF');
    }
  };

  // Componente para renderizar coluna de pagamento
  const renderColunaPagamento = (
    tipo: TipoPagamento,
    titulo: string,
    cor: string,
    corBg: string,
    icone: React.ReactNode,
    descricao: string,
    setDescricao: (v: string) => void,
    quantidade: string,
    setQuantidade: (v: string) => void,
    valor: string,
    setValor: (v: string) => void,
    produtos: Produto[],
    total: number,
    inputRefs: React.MutableRefObject<{ desc: HTMLInputElement | null; qtd: HTMLInputElement | null; valor: HTMLInputElement | null }>,
    buttonRef: React.MutableRefObject<HTMLButtonElement | null>,
    compact: boolean = false,
    bloqueado: boolean = false
  ) => {
    const emEdicao = editandoTipo === tipo && editandoId;

    const handleKeyDown = (field: 'desc' | 'qtd' | 'valor', e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (field === 'desc') {
          setTimeout(() => {
            inputRefs.current.qtd?.focus();
            inputRefs.current.qtd?.select();
          }, 0);
        } else if (field === 'qtd') {
          setTimeout(() => {
            inputRefs.current.valor?.focus();
            inputRefs.current.valor?.select();
          }, 0);
        } else if (field === 'valor') {
          setTimeout(() => {
            buttonRef.current?.click();
            setTimeout(() => {
              inputRefs.current.desc?.focus();
              inputRefs.current.desc?.select();
            }, 100);
          }, 0);
        }
      }
    };

    if (compact) {
      return (
        <Card className={`p-2 border-l-4 ${corBg}`}>
          <h3 className={`text-sm font-bold ${cor} mb-2`}>{titulo}</h3>
          <div className="space-y-2 mb-2 pb-2 border-b border-border">
            <div>
              <Input
                ref={el => { if (el) inputRefs.current.desc = el; }}
                type="text"
                disabled={bloqueado}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onKeyDown={(e) => handleKeyDown('desc', e)}
                placeholder="Ex: Produto"
                className="w-full text-xs h-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Input
                ref={el => { if (el) inputRefs.current.qtd = el; }}
                type="text"
                inputMode="numeric"
                disabled={bloqueado}
                value={quantidade}
                onChange={(e) => setQuantidade(handleNumberInput(e.target.value))}
                onKeyDown={(e) => handleKeyDown('qtd', e)}
                placeholder="1"
                className="w-full text-xs h-8"
              />
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold">R$</span>
                <Input
                  ref={el => { if (el) inputRefs.current.valor = el; }}
                  type="text"
                  inputMode="numeric"
                  disabled={bloqueado}
                  value={valor}
                  onChange={(e) => setValor(handleNumberInput(e.target.value))}
                  onKeyDown={(e) => handleKeyDown('valor', e)}
                  placeholder="0,00"
                  className="flex-1 text-xs h-8"
                />
              </div>
            </div>
          </div>
          <Button
            ref={buttonRef}
            onClick={() => adicionarProduto(tipo)}
            disabled={bloqueado}
            size="sm"
            className={`w-full gap-1 text-xs h-8 ${cor.replace('text-', 'bg-').replace('-600', '-600')}`}
            style={{ backgroundColor: cor === 'text-green-600' ? '#16a34a' : cor === 'text-blue-600' ? '#2563eb' : cor === 'text-purple-600' ? '#9333ea' : '#dc2626' }}
          >
            <Plus className="w-3 h-3" /> Adicionar
          </Button>
          <div className={`${corBg} p-2 rounded-lg mt-2`}>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Total</p>
            <p className={`text-lg font-bold ${cor}`}>{formatCurrency(total)}</p>
          </div>
          <div className="space-y-1 mt-2">
            {[...produtos].reverse().map((produto) => (
              <div key={produto.id} className="flex items-center justify-between p-1 bg-background rounded-lg border border-border text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{produto.descricao}</p>
                  <p className="text-muted-foreground">{produto.quantidade}x R$ {formatCurrency(parseFloat(produto.valor))}</p>
                </div>
                <button onClick={() => removerProdutoConfirmado(tipo, produto.id)} className="ml-2 text-red-500 hover:text-red-700">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      );
    }

    return (
      <Card className={`p-4 border-l-4 ${corBg}`}>
        <h3 className={`text-lg font-bold ${cor} mb-4`}>{titulo}</h3>

        {/* Formulário */}
        <div className="space-y-3 mb-4 pb-4 border-b border-border">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">
              Descrição <span className="text-red-500">*</span>
            </label>
            <Input
              ref={el => { if (el) inputRefs.current.desc = el; }}
              type="text"
              disabled={bloqueado}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              onKeyDown={(e) => handleKeyDown('desc', e)}
              placeholder="Ex: Produto"
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Qtd</label>
              <Input
                ref={el => { if (el) inputRefs.current.qtd = el; }}
                type="text"
                inputMode="numeric"
                disabled={bloqueado}
                value={quantidade}
                onChange={(e) => setQuantidade(handleNumberInput(e.target.value))}
                onKeyDown={(e) => handleKeyDown('qtd', e)}
                placeholder="1"
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">
                Valor <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold">R$</span>
                <Input
                  ref={el => { if (el) inputRefs.current.valor = el; }}
                  type="text"
                  inputMode="numeric"
                  disabled={bloqueado}
                  value={valor}
                  onChange={(e) => setValor(handleNumberInput(e.target.value))}
                  onKeyDown={(e) => handleKeyDown('valor', e)}
                  placeholder="0,00"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <Button
            ref={buttonRef}
            onClick={() => adicionarProduto(tipo)}
            disabled={bloqueado}
            size="sm"
            className={`w-full gap-2 ${cor.replace('text-', 'bg-').replace('-600', '-600')} hover:opacity-90`}
            style={{ backgroundColor: cor === 'text-green-600' ? '#16a34a' : cor === 'text-blue-600' ? '#2563eb' : cor === 'text-purple-600' ? '#9333ea' : '#dc2626' }}
          >
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </div>

        {/* Total */}
        <div className={`${corBg} p-3 rounded-lg mb-4`}>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Total</p>
          <p className={`text-2xl font-bold ${cor}`}>{formatCurrency(total)}</p>
        </div>

        {/* Lista de Produtos */}
        <div className="space-y-2 mt-3">
          {[...produtos].reverse().map((produto) => (
            <div key={produto.id}>
              <div className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{produto.descricao}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {produto.quantidade}x {formatCurrency(parseFloat(produto.valor))} = <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatCurrency(parseFloat(produto.valor) * produto.quantidade)}</span>
                  </p>
                </div>
                <div className="flex flex-col gap-1 ml-2 items-center">
                <button
                  onClick={() => abrirModalSenhaEdicao(tipo, produto)}
                  className="text-blue-600 hover:bg-blue-50 p-1 rounded"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => abrirModalExclusao(tipo, produto.id)}
                      className="text-destructive hover:bg-destructive/10 p-1 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <p className="text-xs text-muted-foreground mt-1">{produto.hora}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between p-4 max-w-6xl mx-auto">
          <button onClick={() => setScreen('caixaSelection')} className="flex items-center gap-2 text-primary">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Voltar</span>
          </button>
          <h1 className="text-lg font-bold text-foreground">{store?.storeName?.toUpperCase() || 'LOJA'}</h1>
          <div className="w-12" />
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="sticky top-[60px] z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex max-w-6xl mx-auto">
          <button
            onClick={() => setActiveTab('caixa')}
            className={`flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'caixa'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            ANOTAÇÕES
          </button>
          <button
            onClick={() => setActiveTab('fechamento')}
            className={`flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'fechamento'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            FECHAMENTO
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        {/* Aba CAIXA - 4 Colunas */}
        {activeTab === 'caixa' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Nome Digital - Obrigatório antes de editar valores */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
              <Card className="p-4 border-2 border-primary">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Nome Digital <span className="text-red-500">*</span></label>
                </div>
                <Input
                  type="text"
                  value={nomeDigital}
                  onChange={(e) => {
                    setNomeDigital(e.target.value);
                    setFechamentoPorData((prev: any) => ({
                      ...prev,
                      [data]: { ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], despesas: [], nomeDigital: '' }, nomeDigital: e.target.value }
                    }));
                  }}
                  placeholder="Seu nome"
                  className="w-full"
                />
                {!nomeDigital.trim() && <p className="text-xs text-amber-600 mt-2">Preencha o nome digital para editar os valores</p>}
              </Card>
            </motion.div>

            {/* Data - Com Navegação */}
            <div className="flex items-center justify-between gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const novaData = new Date(data);
                  novaData.setDate(novaData.getDate() - 1);
                  const novaDataStr = novaData.toISOString().split('T')[0];
                  validarSenhaNavegacao(novaDataStr);
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
              <div className="flex-1">
                <Card className="p-4">
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-3 block">Data Selecionada</label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    <p className="text-2xl font-bold text-primary">{formatarDataComDia(data)}</p>
                  </div>
                </Card>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const novaData = new Date(data);
                  novaData.setDate(novaData.getDate() + 1);
                  const novaDataStr = novaData.toISOString().split('T')[0];
                  validarSenhaNavegacao(novaDataStr);
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* 4 Colunas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Coluna DINHEIRO */}
              {renderColunaPagamento(
                'dinheiro',
                'DINHEIRO',
                'text-green-600',
                'border-l-green-500',
                <Banknote className="w-5 h-5" />,
                descricaoDinheiro,
                setDescricaoDinheiro,
                quantidadeDinheiro,
                setQuantidadeDinheiro,
                valorDinheiro,
                setValorDinheiro,
                caixaAtual.dinheiro,
                totalDinheiro,
                inputRefsDinheiro,
                buttonRefsDinheiro,
                false,
                !nomeDigital.trim()
              )}

              {/* Coluna PIX */}
              {renderColunaPagamento(
                'pix',
                'PIX',
                'text-blue-600',
                'border-l-blue-500',
                <FileText className="w-5 h-5" />,
                descricaoPix,
                setDescricaoPix,
                quantidadePix,
                setQuantidadePix,
                valorPix,
                setValorPix,
                caixaAtual.pix,
                totalPix,
                inputRefsPix,
                buttonRefsPix,
                false,
                !nomeDigital.trim()
              )}

              {/* Coluna CARTÃO */}
              {renderColunaPagamento(
                'cartao',
                'CARTÃO',
                'text-purple-600',
                'border-l-purple-500',
                <CreditCard className="w-5 h-5" />,
                descricaoCartao,
                setDescricaoCartao,
                quantidadeCartao,
                setQuantidadeCartao,
                valorCartao,
                setValorCartao,
                caixaAtual.cartao,
                totalCartao,
                inputRefsCartao,
                buttonRefsCartao,
                false,
                !nomeDigital.trim()
              )}

              {/* Coluna BOLETO */}
              {renderColunaPagamento(
                'boleto',
                'BOLETO',
                'text-red-600',
                'border-l-red-500',
                <FileText className="w-5 h-5" />,
                descricaoBoleto,
                setDescricaoBoleto,
                quantidadeBoleto,
                setQuantidadeBoleto,
                valorBoleto,
                setValorBoleto,
                caixaAtual.boleto,
                totalBoleto,
                inputRefsBoleto,
                buttonRefsBoleto,
                true,
                !nomeDigital.trim()
              )}
            </div>
          </motion.div>
        )}

        {/* Aba FECHAMENTO */}
        {activeTab === 'fechamento' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Data - Apenas Exibição */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
              <Card className="p-4">
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">
                  Data Selecionada <span className="text-red-500">*</span>
                </label>
                <p className="text-2xl font-bold text-primary">{formatarDataComDia(data)}</p>
              </Card>
            </motion.div>

            {/* Dinheiro e Sobra - Lado a Lado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dinheiro */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Banknote className="w-5 h-5 text-green-600" />
                    <label className="text-xs font-semibold text-muted-foreground uppercase">
                      Dinheiro <span className="text-red-500">*</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">R$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    disabled={!nomeDigital.trim()}
                    value={dinheiro}
                    onChange={(e) => {
                      setDinheiro(handleNumberInput(e.target.value));
                        setFechamentoPorData((prev: any) => ({
                          ...prev,
                          [data]: { ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], nomeDigital: '' }, dinheiro: handleNumberInput(e.target.value) }
                        }));
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </Card>
              </motion.div>

              {/* Sobra */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Banknote className="w-5 h-5 text-amber-600" />
                    <label className="text-xs font-semibold text-muted-foreground uppercase">
                      Sobra <span className="text-red-500">*</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">R$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    disabled={!nomeDigital.trim()}
                    value={sobra}
                    onChange={(e) => {
                      setSobra(handleNumberInput(e.target.value));
                        setFechamentoPorData((prev: any) => ({
                          ...prev,
                          [data]: { ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], nomeDigital: '' }, sobra: handleNumberInput(e.target.value) }
                        }));
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </Card>
              </motion.div>
            </div>

            {/* PIX */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    PIX <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">R$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    disabled={!nomeDigital.trim()}
                    value={pix}
                    onChange={(e) => {
                      setPix(handleNumberInput(e.target.value));
                      setFechamentoPorData((prev: any) => ({
                        ...prev,
                        [data]: { ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], nomeDigital: '' }, pix: handleNumberInput(e.target.value) }
                      }));
                    }}
                    placeholder="0,00"
                  />
                </div>
              </Card>
            </motion.div>

            {/* BOLETO */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Boleto <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">R$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    disabled={!nomeDigital.trim()}
                    value={boleto}
                    onChange={(e) => {
                      setBoleto(handleNumberInput(e.target.value));
                      setFechamentoPorData((prev: any) => ({
                        ...prev,
                        [data]: { ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], nomeDigital: '' }, boleto: handleNumberInput(e.target.value) }
                      }));
                    }}
                    placeholder="0,00"
                  />
                </div>
              </Card>
            </motion.div>

            {/* CARTÃO */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-5 h-5 text-red-600" />
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Cartão <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">R$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    disabled={!nomeDigital.trim()}
                    value={cartao}
                    onChange={(e) => {
                      setCartao(handleNumberInput(e.target.value));
                      setFechamentoPorData((prev: any) => ({
                        ...prev,
                        [data]: { ...prev[data] || { dinheiro: '', sobra: '', pix: '', boleto: '', cartao: '', sangrias: [], nomeDigital: '' }, cartao: handleNumberInput(e.target.value) }
                      }));
                    }}
                    placeholder="0,00"
                  />
                </div>
              </Card>
            </motion.div>

            {/* Total de Vendas - ANTES DE SANGRIAS */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33 }}>
              <Card className="p-4 bg-primary/10 border-primary/20">
                <div className="text-center">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Total de Vendas</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(limparDecimais(totalVendas))}</p>
                </div>
              </Card>
            </motion.div>

            {/* SANGRIAS */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              <Card className="p-4">
                <h3 className="text-lg font-bold mb-4">Sangrias</h3>

                <div className="space-y-3 mb-4 pb-4 border-b border-border">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Valor</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">R$</span>
                      <Input
                        ref={inputRefsSangria}
                        type="text"
                        inputMode="numeric"
                        disabled={!nomeDigital.trim()}
                        value={novaValorSangria}
                        onChange={(e) => setNovaValorSangria(handleNumberInput(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            buttonRefsSangria.current?.click();
                          }
                        }}
                        placeholder="0,00"
                        className="flex-1"
                      />
                      <Button ref={buttonRefsSangria} onClick={adicionarSangria} disabled={!nomeDigital.trim()} size="sm" className="gap-1 bg-orange-600 hover:bg-orange-700">
                        <Plus className="w-4 h-4" /> Adicionar
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {sangrias.map((sangria) => (
                    <div key={sangria.id} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                      <p className="text-sm font-medium">{formatCurrency(sangria.valor)}</p>
                      <button
                        onClick={() => removerSangria(sangria.id)}
                        className="text-destructive hover:bg-destructive/10 p-1 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>

            {/* Estorno/Despesas */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.37 }}>
              <Card className="p-4">
                <h3 className="text-lg font-bold mb-4">Estorno/Despesas</h3>

                <div className="space-y-3 mb-4 pb-4 border-b border-border">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Descrição</label>
                    <Input
                      ref={inputRefsDespesaDesc}
                      type="text"
                      disabled={!nomeDigital.trim()}
                      value={novaDescricaoDespesa}
                      onChange={(e) => setNovaDescricaoDespesa(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          inputRefsDespesaValor.current?.focus();
                          inputRefsDespesaValor.current?.select();
                        }
                      }}
                      placeholder="Ex: Devolução, Desconto, etc"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Valor</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">R$</span>
                      <Input
                        ref={inputRefsDespesaValor}
                        type="text"
                        inputMode="numeric"
                        disabled={!nomeDigital.trim()}
                        value={novaValorDespesa}
                        onChange={(e) => setNovaValorDespesa(handleNumberInput(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            buttonRefsDespesa.current?.click();
                          }
                        }}
                        placeholder="0,00"
                        className="flex-1"
                      />
                      <Button ref={buttonRefsDespesa} onClick={adicionarDespesa} disabled={!nomeDigital.trim()} size="sm" className="gap-1">
                        <Plus className="w-4 h-4" /> Adicionar
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {despesas?.map((despesa) => (
                    <div key={despesa.id} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                      <div>
                        <p className="text-sm font-medium">{despesa.descricao}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(despesa.valor)}</p>
                      </div>
                      <button
                        onClick={() => removerDespesa(despesa.id)}
                        className="text-destructive hover:bg-destructive/10 p-1 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {despesas?.length > 0 && (
                  <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Total de Despesa</p>
                    <p className="text-xl font-bold text-primary">{formatCurrency(despesas?.reduce((sum, d) => sum + d.valor, 0) || 0)}</p>
                  </div>
                )}
              </Card>
            </motion.div>





            {/* Total de Sangria */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <Card className="p-4 bg-destructive/10 border-destructive/20">
                <div className="text-center">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Total de Sangria</p>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(totalSangria)}</p>
                </div>
              </Card>
            </motion.div>

            {/* Saldo em Dinheiro */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
              <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                <div className="text-center">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Saldo em Dinheiro</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(limparDecimais(saldoDinheiro))}</p>
                </div>
              </Card>
            </motion.div>

            {/* Saldo Geral */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                <div className="text-center">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Saldo Geral</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(limparDecimais(saldoGeral))}</p>
                </div>
              </Card>
            </motion.div>

            {/* Botões de Ação */}
            <div className="flex gap-2 flex-wrap">
              <Button onClick={salvarFechamento} size="lg" className="flex-1 gap-2 bg-green-600 hover:bg-green-700">
                <Save className="w-5 h-5" /> Salvar
              </Button>
              <Button onClick={exportarPDF} size="lg" variant="outline" className="flex-1">
                Exportar PDF
              </Button>
              <Button onClick={exportarBackup} size="lg" variant="outline" className="flex-1">
                Exportar Backup
              </Button>
              <Button onClick={importarBackup} size="lg" variant="outline" className="flex-1">
                Importar Backup
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Modal de Senha para Exclusão */}
      {showSenhaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 w-96">
            <h2 className="text-lg font-bold mb-4">Confirmar Exclusão</h2>
            <p className="text-sm text-muted-foreground mb-4">Digite a senha para excluir este produto:</p>
            <Input
              type="password"
              inputMode="numeric"
              value={senhaInput}
              onChange={(e) => setSenhaInput(e.target.value)}
              placeholder="Senha"
              className="mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmarExclusaoComSenha();
              }}
            />
            <div className="flex gap-2">
              <Button onClick={() => setShowSenhaModal(false)} variant="outline" className="flex-1">
                Cancelar
              </Button>
              <Button onClick={confirmarExclusaoComSenha} className="flex-1 bg-red-600 hover:bg-red-700">
                Confirmar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Senha para Adicionar Despesa */}
      {showSenhaDespesaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 w-96">
            <h2 className="text-lg font-bold mb-4">Confirmar Despesa</h2>
            <p className="text-sm text-muted-foreground mb-4">Digite a senha para adicionar esta despesa:</p>
            <Input
              type="password"
              inputMode="numeric"
              value={senhaDespesaInput}
              onChange={(e) => setSenhaDespesaInput(e.target.value)}
              placeholder="Senha"
              className="mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmarAdicionarDespesa();
              }}
            />
            <div className="flex gap-2">
              <Button onClick={() => { setShowSenhaDespesaModal(false); setSenhaDespesaInput(''); }} variant="outline" className="flex-1">
                Cancelar
              </Button>
              <Button onClick={confirmarAdicionarDespesa} className="flex-1 bg-orange-600 hover:bg-orange-700">
                Confirmar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Senha para Edição */}
      {showSenhaEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 w-96">
            <h2 className="text-lg font-bold mb-4">Confirmar Edição</h2>
            <p className="text-sm text-muted-foreground mb-4">Digite a senha para editar este produto:</p>
            <Input
              type="password"
              inputMode="numeric"
              value={senhaEditInput}
              onChange={(e) => setSenhaEditInput(e.target.value)}
              placeholder="Senha"
              className="mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmarSenhaEdicao();
              }}
            />
            <div className="flex gap-2">
              <Button onClick={() => setShowSenhaEditModal(false)} variant="outline" className="flex-1">
                Cancelar
              </Button>
              <Button onClick={confirmarSenhaEdicao} className="flex-1 bg-blue-600 hover:bg-blue-700">
                Confirmar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Edição */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 w-96">
            <h2 className="text-lg font-bold mb-4">Editar Produto</h2>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Descrição</label>
                <Input
                  type="text"
                  value={editModalDescricao}
                  onChange={(e) => setEditModalDescricao(e.target.value)}
                  placeholder="Descrição"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Quantidade</label>
                <Input
                  type="text"
                  value={editModalQuantidade}
                  onChange={(e) => setEditModalQuantidade(handleNumberInput(e.target.value))}
                  placeholder="1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Valor</label>
                <Input
                  type="text"
                  value={editModalValor}
                  onChange={(e) => setEditModalValor(handleNumberInput(e.target.value))}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={cancelarEdicaoModal} variant="outline" className="flex-1">
                Cancelar
              </Button>
              <Button onClick={salvarEdicao} className="flex-1 bg-blue-600 hover:bg-blue-700">
                Salvar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Dialog de Senha para Navegacao de Datas */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Acesso Protegido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta acao requer senha. Digite a senha para continuar.
            </p>
            <Input
              type="password"
              inputMode="numeric"
              placeholder="Digite a senha"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmarSenha();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordDialog(false);
                setPasswordInput('');
                setPendingDate(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={confirmarSenha} className="bg-blue-600 hover:bg-blue-700">
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
