import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Lock, Store, Info, Link2, Moon, Sun, Plus, Trash2, ChevronDown, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { TimelineView } from '@/components/TimelineView';

// LANCAMENTO_FIELDS será gerado dinamicamente do AppContext

export default function OpcoesTab() {
  const {
    settings,
    setSettings,
    updateFieldMapping,
    updateLancamentosFontSize,
    updateLancamentosHeaderFontSize,
    updateDasColors,
    updateDasChartType,
    updateDateProtection,
    stores,
    setStores,
    currentStore,
    getCaixaCategories,
    addCaixaCategory,
    removeCaixaCategory,
    getFechamentoCategories,
    addFechamentoCategory,
    removeFechamentoCategory,
    getCategories,
    getActionUsers,
    addActionUser,
    updateActionUser,
    removeActionUser,
    getAccessLogs,
    clearAccessLogs,
  } = useApp();
  const { theme, toggleTheme } = useTheme();
  const [showPwd, setShowPwd] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  
  // Gerar LANCAMENTO_FIELDS dinamicamente a partir das categorias de ambas as lojas
  const getLancamentoFields = () => {
    const loja1Categories = stores['loja1']?.categories || [];
    const loja2Categories = stores['loja2']?.categories || [];
    
    // Usar IDs reais das categorias em vez de gerar a partir de nomes
    const categoryMap = new Map<string, { id: string; name: string }>();
    
    loja1Categories.forEach(cat => {
      if (!categoryMap.has(cat.id)) {
        categoryMap.set(cat.id, { id: cat.id, name: cat.name });
      }
    });
    loja2Categories.forEach(cat => {
      if (!categoryMap.has(cat.id)) {
        categoryMap.set(cat.id, { id: cat.id, name: cat.name });
      }
    });
    
    return Array.from(categoryMap.values());
  };
  const [confirmPwd, setConfirmPwd] = useState('');
  const [senhaType, setSenhaType] = useState<'vendas' | 'caixa'>('vendas');
  const [showVendasPwd, setShowVendasPwd] = useState(false);
  const [senhaVendasAntiga, setSenhaVendasAntiga] = useState('');
  const [senhaVendasNova, setSenhaVendasNova] = useState('');
  const [confirmarSenhaVendasNova, setConfirmarSenhaVendasNova] = useState('');
  const [senhaVendas, setSenhaVendas] = useState(settings.senhaVendas || '');
  const [mappingLan1, setMappingLan1] = useState<any[]>(settings.fieldMappingLan1 || []);
  const [mappingLan2, setMappingLan2] = useState<any[]>(settings.fieldMappingLan2 || []);
  const [mappingCompacto1, setMappingCompacto1] = useState<any[]>(settings.fieldMappingCompacto1 || []);
  const [mappingCompacto2, setMappingCompacto2] = useState<any[]>(settings.fieldMappingCompacto2 || []);
  const [lancamentosFontSize, setLancamentosFontSize] = useState(settings.lancamentosFontSize || 'base');
  const [lancamentosHeaderFontSize, setLancamentosHeaderFontSize] = useState(settings.lancamentosHeaderFontSize || 'base');
  const [dasChartType, setDasChartType] = useState(settings.dasChartType || 'bar');
  const [dasColors, setDasColors] = useState(settings.dasColors || {
    primary: '#3b82f6',
    secondary: '#10b981',
    accent: '#f59e0b',
    monthTotal: '#0ea5e9',
    tooltipText: '#000000',
    tooltipBg: '#ffffff',
    totalText: '#3b82f6',
    valueText: '#06b6d4',
    averageText: '#10b981',
    labelColor: '#ffffff',
  });

  // Usuários de Ações
  const [actionUsers, setActionUsers] = useState(getActionUsers());
  const [showActionUserDialog, setShowActionUserDialog] = useState(false);
  const [newActionUserName, setNewActionUserName] = useState('');
  const [newActionUserPassword, setNewActionUserPassword] = useState('');
  const [newActionUserPermissions, setNewActionUserPermissions] = useState<any[]>(['delete']);
  const [editingActionUserId, setEditingActionUserId] = useState<string | null>(null);

  // Categorias
  const [caixaCategories, setCaixaCategories] = useState(getCaixaCategories());
  const [fechamentoCategories, setFechamentoCategories] = useState(getFechamentoCategories());
  const [newCaixaCategory, setNewCaixaCategory] = useState('');
  const [newFechamentoCategory, setNewFechamentoCategory] = useState('');
  const [showCaixaCategoryDialog, setShowCaixaCategoryDialog] = useState(false);
  const [showFechamentoCategoryDialog, setShowFechamentoCategoryDialog] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [pendingDeleteAction, setPendingDeleteAction] = useState<null | {
    type: 'actionUser' | 'caixaCategory' | 'fechamentoCategory';
    id: string;
  }>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    actionUsers: false,
    accessLogs: false,
    timeline: false,
    caixaCategories: false,
    fechamentoCategories: false,
    mapeamento: false,
    senha: false,
    tema: false,
    lancamentosFontSize: false,
    lancamentosHeaderFontSize: false,
    dasColors: false,
    backup: false,
  });
  const fechamentoFieldsForSync = [
    ...fechamentoCategories,
    { id: 'despesa', name: 'Total de Despesa' },
  ].filter((field, index, arr) => arr.findIndex(item => item.id === field.id) === index);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const decodeMojibake = (value: string) => {
    try {
      return decodeURIComponent(escape(value));
    } catch {
      return value;
    }
  };

  const normalizeLogText = (value?: string) => {
    if (!value) return '';
    return decodeMojibake(value)
      .replace(/[^\x20-\x7EÀ-ÿ\n\r\t]/g, '')
      .trim();
  };

  const isAnnotationItemLog = (detailsRaw?: string) => {
    const details = normalizeLogText(detailsRaw).toLowerCase();
    if (!details) return false;
    return (
      details.includes('edição autorizada') ||
      details.includes('exclusão autorizada') ||
      details.includes('editou') ||
      details.includes('excluiu')
    ) && (
      details.includes('categoria') ||
      details.includes('produto') ||
      details.includes('item')
    );
  };

  const filteredAccessLogs = getAccessLogs()
    .filter(
      (log) =>
        (log.action === 'edit' || log.action === 'delete') &&
        log.status === 'success' &&
        isAnnotationItemLog(log.details)
    )
    .map((log) => ({
      ...log,
      userName: normalizeLogText(log.userName),
      details: normalizeLogText(log.details),
    }));

  const syncPreference = settings.syncPreference || 'program';
  const setSyncPreference = async (mode: 'site' | 'program' | 'both') => {
    // Atualização local imediata
    setSettings((current) => ({ ...current, syncPreference: mode }));
    try {
      const host = window.location.hostname;
      const protocol = window.location.protocol;
      const serverUrl = window.location.port === '5173'
        ? `${protocol}//${host}:3000`
        : `${protocol}//${host}`;

      // Persistência imediata no servidor (rota já aceita update parcial de syncPreference)
      const resp = await fetch(`${serverUrl}/api/sync/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'site',
          settings: { syncPreference: mode },
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      toast.success('Preferência de sincronização atualizada');
    } catch (e) {
      console.error('[OpcoesTab] Falha ao persistir syncPreference:', e);
      toast.error('Não foi possível salvar a preferência no servidor');
    }
  };

  useEffect(() => {
    setMappingLan1(settings.fieldMappingLan1 || []);
    setMappingLan2(settings.fieldMappingLan2 || []);
    setMappingCompacto1(settings.fieldMappingCompacto1 || []);
    setMappingCompacto2(settings.fieldMappingCompacto2 || []);
  }, [settings]);

  useEffect(() => {
    setCaixaCategories(getCaixaCategories());
    setFechamentoCategories(getFechamentoCategories());
  }, [getCaixaCategories, getFechamentoCategories]);

  const handleChangePwd = () => {
    toast.error('A senha matriz é fixa e não pode ser alterada.');
    setOldPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setShowPwd(false);
  };

  const handleMappingChange = (lan: 'lan1' | 'lan2', fechamentoField: string, lancamentoField: string) => {
    const mapping = lan === 'lan1' ? mappingLan1 : mappingLan2;
    const newMapping = mapping.filter(m => m.fechamento_field !== fechamentoField);
    if (lancamentoField) {
      newMapping.push({ fechamento_field: fechamentoField, lancamento_field: lancamentoField });
    }
    if (lan === 'lan1') {
      setMappingLan1(newMapping);
      updateFieldMapping('lan1', newMapping);
    } else {
      setMappingLan2(newMapping);
      updateFieldMapping('lan2', newMapping);
    }
    toast.success('Mapeamento atualizado!');
  };

  const getMappedField = (lan: 'lan1' | 'lan2', fechamentoField: string) => {
    const mapping = lan === 'lan1' ? mappingLan1 : mappingLan2;
    return mapping.find(m => m.fechamento_field === fechamentoField)?.lancamento_field || '';
  };

  const handleMappingCompactoChange = (lan: 'compacto1' | 'compacto2', fechamentoField: string, lancamentoField: string) => {
    const mapping = lan === 'compacto1' ? mappingCompacto1 : mappingCompacto2;
    const newMapping = mapping.filter(m => m.fechamento_field !== fechamentoField);
    if (lancamentoField) {
      newMapping.push({ fechamento_field: fechamentoField, lancamento_field: lancamentoField });
    }
    if (lan === 'compacto1') {
      setMappingCompacto1(newMapping);
      updateFieldMapping('compacto1', newMapping);
    } else {
      setMappingCompacto2(newMapping);
      updateFieldMapping('compacto2', newMapping);
    }
    toast.success('Mapeamento Fechamento Compacto atualizado!');
  };

  const getMappedFieldCompacto = (lan: 'compacto1' | 'compacto2', fechamentoField: string) => {
    const mapping = lan === 'compacto1' ? mappingCompacto1 : mappingCompacto2;
    return mapping.find(m => m.fechamento_field === fechamentoField)?.lancamento_field || '';
  };

  const handleAddCaixaCategory = () => {
    if (!newCaixaCategory.trim()) {
      toast.error('Nome da categoria não pode estar vazio!');
      return;
    }
    addCaixaCategory(newCaixaCategory);
    setCaixaCategories(getCaixaCategories());
    setNewCaixaCategory('');
    setShowCaixaCategoryDialog(false);
    toast.success('Categoria CAIXA adicionada!');
  };

  const requestDeleteWithMasterPassword = (type: 'actionUser' | 'caixaCategory' | 'fechamentoCategory', id: string) => {
    setPendingDeleteAction({ type, id });
    setDeletePasswordInput('');
    setShowDeleteConfirmDialog(true);
  };

  const handleAddFechamentoCategory = () => {
    if (!newFechamentoCategory.trim()) {
      toast.error('Nome da categoria não pode estar vazio!');
      return;
    }
    addFechamentoCategory(newFechamentoCategory);
    setFechamentoCategories(getFechamentoCategories());
    setNewFechamentoCategory('');
    setShowFechamentoCategoryDialog(false);
    toast.success('Categoria FECHAMENTO adicionada!');
  };

  const handleAddActionUser = () => {
    if (!newActionUserName.trim()) {
      toast.error('Nome do usuário não pode estar vazio!');
      return;
    }
    if (!newActionUserPassword.trim() || newActionUserPassword.length < 4) {
      toast.error('Senha deve ter no mínimo 4 dígitos!');
      return;
    }
    if (newActionUserPermissions.length === 0) {
      toast.error('Selecione pelo menos uma permissão!');
      return;
    }
    addActionUser(newActionUserName, newActionUserPassword, newActionUserPermissions);
    setActionUsers(getActionUsers());
    setNewActionUserName('');
    setNewActionUserPassword('');
    setNewActionUserPermissions(['delete']);
    setShowActionUserDialog(false);
    toast.success('Usuário de ação adicionado!');
  };

  const confirmDeleteWithMasterPassword = () => {
    const salesPassword = settings.senhaVendas || '2512';
    if (deletePasswordInput !== salesPassword) {
      toast.error('Senha de vendas incorreta!');
      return;
    }

    if (!pendingDeleteAction) {
      setShowDeleteConfirmDialog(false);
      return;
    }

    if (pendingDeleteAction.type === 'actionUser') {
      removeActionUser(pendingDeleteAction.id);
      setActionUsers(getActionUsers());
      toast.success('Usuário de ação removido!');
    } else if (pendingDeleteAction.type === 'caixaCategory') {
      removeCaixaCategory(pendingDeleteAction.id);
      setCaixaCategories(getCaixaCategories());
      toast.success('Categoria CAIXA removida!');
    } else if (pendingDeleteAction.type === 'fechamentoCategory') {
      removeFechamentoCategory(pendingDeleteAction.id);
      setFechamentoCategories(getFechamentoCategories());
      toast.success('Categoria FECHAMENTO removida!');
    }

    setShowDeleteConfirmDialog(false);
    setDeletePasswordInput('');
    setPendingDeleteAction(null);
  };

  const handleExportBackup = () => {
    const backup = {
      settings,
      stores,
      timestamp: new Date().toISOString(),
      version: '1.0'
    };
    const dataStr = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-financeiro-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Backup exportado com sucesso!');
  };

  const handleImportBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const backup = JSON.parse(content);
        if (!backup.settings || !backup.stores) {
          toast.error('Arquivo de backup inválido!');
          return;
        }
        setSettings((current) => ({ ...current, ...backup.settings }));
        setStores(backup.stores);
        toast.success('Backup restaurado e enviado para o servidor!');
      } catch (error) {
        toast.error('Erro ao restaurar backup!');
      }
    };
    reader.readAsText(file);
  };

  const store = stores[currentStore];

  return (
    <div className="space-y-4 pb-24">
      {/* Store Info */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">{store.storeName}</h3>
            <p className="text-xs text-muted-foreground">CNPJ: {store.cnpj}</p>
          </div>
        </div>
      </div>

      {/* Preferência de Sincronização */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Sincronização (Site x Programa)</h3>
          <p className="text-xs text-muted-foreground mt-1">Define quem pode gravar no servidor</p>
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={syncPreference === 'program' ? 'default' : 'outline'}
            onClick={() => setSyncPreference('program')}
          >
            Apenas Programa
          </Button>
          <Button
            size="sm"
            variant={syncPreference === 'site' ? 'default' : 'outline'}
            onClick={() => setSyncPreference('site')}
          >
            Apenas Site
          </Button>
          <Button
            size="sm"
            variant={syncPreference === 'both' ? 'default' : 'outline'}
            onClick={() => setSyncPreference('both')}
          >
            Ambos
          </Button>
        </div>
      </div>

      {/* Usuários de Ação - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('actionUsers')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Usuários de Ação</h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setShowActionUserDialog(true);
              }}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                expandedSections.actionUsers ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>
        {expandedSections.actionUsers && (
          <div className="border-t border-border p-4 space-y-3">
            {actionUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum usuário de ação criado</p>
            ) : (
              actionUsers.map(user => (
                <div key={user.id} className="flex items-center justify-between bg-secondary/30 p-3 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">Permissões: {user.permissions.join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newPassword = prompt(`Digite a nova senha para ${user.name}:`);
                        if (newPassword) {
                          updateActionUser(user.id, { ...user, password: newPassword });
                          toast.success(`Senha de ${user.name} alterada!`);
                        }
                      }}
                      className="gap-1"
                    >
                      <Lock className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => requestDeleteWithMasterPassword('actionUser', user.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Relatório de Acessos - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('accessLogs')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Relatório de Acessos</h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                clearAccessLogs();
                toast.success('Relatório limpo!');
              }}
              className="gap-1 text-xs"
            >
              Limpar
            </Button>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                expandedSections.accessLogs ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>
        {expandedSections.accessLogs && (
          <div className="border-t border-border p-4 space-y-3">
            {filteredAccessLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem edições/exclusões registradas</p>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredAccessLogs.map(log => (
                  <div key={log.id} className={`p-3 rounded-lg text-xs ${
                    log.status === 'success' 
                      ? 'bg-green-500/10 border border-green-500/20' 
                      : 'bg-red-500/10 border border-red-500/20'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        {log.action === 'delete' ? 'Deletar' : 'Editar'}
                      </span>
                      <span className={`font-bold ${
                        log.status === 'success' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {log.status === 'success' ? 'Sucesso' : 'Falha'}
                      </span>
                    </div>
                    <div className="mt-1 space-y-1 text-muted-foreground">
                      {log.userName && <p>Usuário: {log.userName}</p>}
                      {log.details && <p>Detalhes: {log.details}</p>}
                      <p>{new Date(log.timestamp).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline de Alterações - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('timeline')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Timeline de Alterações</h3>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              expandedSections.timeline ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections.timeline && (
          <div className="border-t border-border p-4">
            <TimelineView />
          </div>
        )}
      </div>

      {/* Categorias CAIXA - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('caixaCategories')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Categorias CAIXA</h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setShowCaixaCategoryDialog(true);
              }}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                expandedSections['caixaCategories'] ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>
        {expandedSections['caixaCategories'] && (
          <div className="px-4 pb-4 border-t border-border space-y-2">
            {caixaCategories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                <span className="text-sm font-medium text-foreground">{cat.name}</span>
                <button
                  onClick={() => requestDeleteWithMasterPassword('caixaCategory', cat.id)}
                  className="p-1 hover:bg-red-500/20 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Categorias FECHAMENTO - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('fechamentoCategories')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Categorias FECHAMENTO</h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setShowFechamentoCategoryDialog(true);
              }}
              className="gap-1"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                expandedSections['fechamentoCategories'] ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>
        {expandedSections['fechamentoCategories'] && (
          <div className="px-4 pb-4 border-t border-border space-y-2">
            {fechamentoCategories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                <span className="text-sm font-medium text-foreground">{cat.name}</span>
                <button
                  onClick={() => requestDeleteWithMasterPassword('fechamentoCategory', cat.id)}
                  className="p-1 hover:bg-red-500/20 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Field Mapping - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('mapeamento')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Sincronização FECHAMENTO → LANÇAMENTOS</h3>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              expandedSections['mapeamento'] ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections['mapeamento'] && (
          <div className="px-4 pb-4 border-t border-border space-y-4">
            {/* LAN1 Mapping */}
            <div>
              <h4 className="text-xs font-bold text-muted-foreground mb-3 uppercase">LAN1 (Loja 1)</h4>
              <div className="space-y-2">
                {fechamentoFieldsForSync.map(field => (
                  <div key={field.id} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
                    <span className="text-xs font-medium text-foreground min-w-[80px]">{field.name}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <Select value={getMappedField('lan1', field.id) || 'none'} onValueChange={(val) => handleMappingChange('lan1', field.id, val === 'none' ? '' : val)}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {getLancamentoFields().map(lf => (
                          <SelectItem key={lf.id} value={lf.id}>
                            {lf.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* LAN2 Mapping */}
            <div>
              <h4 className="text-xs font-bold text-muted-foreground mb-3 uppercase">LAN2 (Loja 2)</h4>
              <div className="space-y-2">
                {fechamentoFieldsForSync.map(field => (
                  <div key={field.id} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
                    <span className="text-xs font-medium text-foreground min-w-[80px]">{field.name}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <Select value={getMappedField('lan2', field.id) || 'none'} onValueChange={(val) => handleMappingChange('lan2', field.id, val === 'none' ? '' : val)}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {getLancamentoFields().map(lf => (
                          <SelectItem key={lf.id} value={lf.id}>
                            {lf.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>



      {/* Theme */}
      <div className="bg-card rounded-2xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Aparência</h3>
        <button
          onClick={() => toggleTheme?.()}
          className="w-full flex items-center gap-3 p-3 bg-secondary rounded-xl hover:bg-secondary/80 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-blue-500" />}
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-foreground">Modo {theme === 'dark' ? 'Claro' : 'Escuro'}</p>
            <p className="text-[10px] text-muted-foreground">Tema atual: {theme === 'dark' ? 'Escuro' : 'Claro'}</p>
          </div>
        </button>
      </div>

      {/* Password - Alterar Senha de VENDAS */}
      <div className="bg-card rounded-2xl p-4">
        <button
          onClick={() => setShowVendasPwd(true)}
          className="w-full flex items-center gap-3 p-3 bg-secondary rounded-xl hover:bg-secondary/80 transition-colors"
        >
          <Lock className="w-5 h-5 text-primary" />
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-foreground">Alterar Senha de VENDAS</p>
            <p className="text-[10px] text-muted-foreground">Atualize a senha de acesso à área de vendas</p>
          </div>
        </button>
      </div>

      {/* Tamanho de Fonte em LANÇAMENTOS - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('lancamentosFontSize')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Tamanho de Números em LAN1/2</h3>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              expandedSections['lancamentosFontSize'] ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections['lancamentosFontSize'] && (
          <div className="px-4 pb-4 border-t border-border space-y-3">
            <div className="space-y-2">
              {(['xs', 'sm', 'base', 'lg', 'xl'] as const).map(size => (
                <button
                  key={size}
                  onClick={() => {
                    setLancamentosFontSize(size);
                    updateLancamentosFontSize(size as 'sm' | 'base' | 'lg' | 'xl');
                  }}
                  className={`w-full p-3 rounded-lg border-2 transition-colors ${
                    lancamentosFontSize === size
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className={`text-${size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : size === 'base' ? 'base' : size === 'lg' ? 'lg' : 'xl'} font-bold`}>
                    {size === 'xs' ? 'Muito Pequeno' : size === 'sm' ? 'Pequeno' : size === 'base' ? 'Normal' : size === 'lg' ? 'Grande' : 'Muito Grande'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tamanho do Cabeçalho em LANÇAMENTOS - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('lancamentosHeaderFontSize')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Tamanho do Cabeçalho em LAN1/2</h3>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              expandedSections['lancamentosHeaderFontSize'] ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections['lancamentosHeaderFontSize'] && (
          <div className="px-4 pb-4 border-t border-border space-y-3">
            <div className="space-y-2">
              {(['xs', 'sm', 'base', 'lg', 'xl'] as const).map(size => (
                <button
                  key={size}
                  onClick={() => {
                    setLancamentosHeaderFontSize(size);
                    updateLancamentosHeaderFontSize(size as 'sm' | 'base' | 'lg' | 'xl');
                  }}
                  className={`w-full p-3 rounded-lg border-2 transition-colors ${
                    lancamentosHeaderFontSize === size
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className={`text-${size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : size === 'base' ? 'base' : size === 'lg' ? 'lg' : 'xl'} font-bold`}>
                    {size === 'xs' ? 'Muito Pequeno' : size === 'sm' ? 'Pequeno' : size === 'base' ? 'Normal' : size === 'lg' ? 'Grande' : 'Muito Grande'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cores em DAS1/2 - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('dasColors')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Cores em DAS1/2</h3>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              expandedSections['dasColors'] ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections['dasColors'] && (
          <div className="px-4 pb-4 border-t border-border space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor Primária</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.primary || '#3b82f6'}
                  onChange={(e) => {
                    setDasColors({...dasColors, primary: e.target.value});
                    updateDasColors({primary: e.target.value});
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.primary}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor Secundária</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.secondary || '#10b981'}
                  onChange={(e) => {
                    setDasColors({...dasColors, secondary: e.target.value});
                    updateDasColors({secondary: e.target.value});
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.secondary}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor de Destaque</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.accent || '#f59e0b'}
                  onChange={(e) => {
                    setDasColors({...dasColors, accent: e.target.value});
                    updateDasColors({accent: e.target.value});
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.accent}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor do Total de Mês</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.monthTotal || '#0ea5e9'}
                  onChange={(e) => {
                    setDasColors({...dasColors, monthTotal: e.target.value});
                    updateDasColors({monthTotal: e.target.value} as any);
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.monthTotal}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor Texto Tooltip</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.tooltipText || '#000000'}
                  onChange={(e) => {
                    setDasColors({...dasColors, tooltipText: e.target.value});
                    updateDasColors({tooltipText: e.target.value} as any);
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.tooltipText}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor Fundo Tooltip</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.tooltipBg || '#ffffff'}
                  onChange={(e) => {
                    setDasColors({...dasColors, tooltipBg: e.target.value});
                    updateDasColors({tooltipBg: e.target.value} as any);
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.tooltipBg}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor Texto - Total (Evolução Diária)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.totalText || '#3b82f6'}
                  onChange={(e) => {
                    setDasColors({...dasColors, totalText: e.target.value});
                    updateDasColors({totalText: e.target.value} as any);
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.totalText}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor Texto - Valores (Evolução por Categoria)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.valueText || '#06b6d4'}
                  onChange={(e) => {
                    setDasColors({...dasColors, valueText: e.target.value});
                    updateDasColors({valueText: e.target.value} as any);
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.valueText}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor Texto - Média (Comparativo)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.averageText || '#10b981'}
                  onChange={(e) => {
                    setDasColors({...dasColors, averageText: e.target.value});
                    updateDasColors({averageText: e.target.value} as any);
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.averageText}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor dos Labels de Valores (dentro do gráfico)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dasColors.labelColor || '#ffffff'}
                  onChange={(e) => {
                    setDasColors({...dasColors, labelColor: e.target.value});
                    updateDasColors({labelColor: e.target.value} as any);
                  }}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{dasColors.labelColor}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Proteção de Datas em CAIXA - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('dateProtection')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Proteção de Datas em CAIXA</h3>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              expandedSections['dateProtection'] ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections['dateProtection'] && (
          <div className="px-4 pb-4 border-t border-border space-y-3">
            <p className="text-xs text-muted-foreground">Escolha quando pedir senha ao navegar entre datas:</p>
            <div className="space-y-2">
              {[
                { value: 'none', label: 'Sem Proteção', desc: 'Navegar livremente entre datas' },
                { value: 'day', label: 'Proteção por Dia', desc: 'Pedir senha ao mudar qualquer dia' },
                { value: 'month', label: 'Proteção por Mês', desc: 'Pedir senha ao mudar de mês' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    updateDateProtection(option.value as 'none' | 'day' | 'month');
                    toast.success(`Proteção alterada para: ${option.label}`);
                  }}
                  className={`w-full p-3 rounded-lg border-2 transition-colors text-left ${
                    (settings.dateProtection || 'month') === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* About */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <Info className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">app Danado</p>
            <p className="text-[10px] text-muted-foreground">Versão 1.0.0</p>
          </div>
        </div>
      </div>

      {/* Change Password Dialog - VENDAS */}
      <Dialog open={showVendasPwd} onOpenChange={setShowVendasPwd}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Senha de VENDAS</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Senha Atual</label>
              <Input type="tel" inputMode="numeric" maxLength={18} value={senhaVendasAntiga} onChange={e => setSenhaVendasAntiga(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
            <div>
              <label className="text-sm font-medium">Nova Senha</label>
              <Input type="tel" inputMode="numeric" maxLength={18} value={senhaVendasNova} onChange={e => setSenhaVendasNova(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
            <div>
              <label className="text-sm font-medium">Confirmar Nova Senha</label>
              <Input type="tel" inputMode="numeric" maxLength={18} value={confirmarSenhaVendasNova} onChange={e => setConfirmarSenhaVendasNova(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => {
                setShowVendasPwd(false);
                setSenhaVendasAntiga('');
                setSenhaVendasNova('');
                setConfirmarSenhaVendasNova('');
              }} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={() => {
                const senhaAtual = settings.senhaVendas || '2512';
                if (senhaVendasAntiga !== senhaAtual) {
                  toast.error('Senha atual incorreta!');
                  setSenhaVendasAntiga('');
                  return;
                }
                if (senhaVendasNova !== confirmarSenhaVendasNova) {
                  toast.error('As senhas novas não conferem!');
                  setSenhaVendasNova('');
                  setConfirmarSenhaVendasNova('');
                  return;
                }
                if (senhaVendasNova.length < 4) {
                  toast.error('A senha deve ter pelo menos 4 caracteres!');
                  return;
                }
                if (senhaVendasNova.length > 20) {
                  toast.error('A senha deve ter no máximo 20 caracteres!');
                  return;
                }
                if (!/^[a-zA-Z0-9]+$/.test(senhaVendasNova)) {
                  toast.error('A senha deve conter apenas letras e números!');
                  return;
                }
                // Salvar em settings (sincroniza com servidor)
                setSettings(s => ({ ...s, senhaVendas: senhaVendasNova }));
                toast.success('Senha de VENDAS alterada com sucesso!');
                setShowVendasPwd(false);
                setSenhaVendasAntiga('');
                setSenhaVendasNova('');
                setConfirmarSenhaVendasNova('');
              }} className="flex-1">
                Alterar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showPwd} onOpenChange={setShowPwd}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Senha - {senhaType === 'vendas' ? 'VENDAS' : 'CAIXA'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Senha Atual</label>
              <Input type="password" inputMode="numeric" maxLength={6} value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Nova Senha</label>
              <Input type="password" inputMode="numeric" maxLength={6} value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Confirmar Nova Senha</label>
              <Input type="password" inputMode="numeric" maxLength={6} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowPwd(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleChangePwd} className="flex-1">
                Alterar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Caixa Category Dialog */}
      <Dialog open={showCaixaCategoryDialog} onOpenChange={setShowCaixaCategoryDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Categoria CAIXA</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nome da Categoria</label>
              <Input
                placeholder="Ex: Débito, Crédito, etc..."
                value={newCaixaCategory}
                onChange={e => setNewCaixaCategory(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleAddCaixaCategory()}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCaixaCategoryDialog(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleAddCaixaCategory} className="flex-1">
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Action User Dialog */}
      <Dialog open={showActionUserDialog} onOpenChange={setShowActionUserDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar Usuário de Ação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome do Usuário</label>
              <Input
                placeholder="Ex: Gerente, Supervisor, etc..."
                value={newActionUserName}
                onChange={e => setNewActionUserName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Senha (mínimo 4 dígitos)</label>
              <Input
                type="password"
                placeholder="Digite a senha"
                value={newActionUserPassword}
                onChange={e => setNewActionUserPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Permissões</label>
              <div className="space-y-2 mt-2">
                {['delete', 'edit', 'changeDate'].map(perm => (
                  <label key={perm} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newActionUserPermissions.includes(perm)}
                      onChange={e => {
                        if (e.target.checked) {
                          setNewActionUserPermissions([...newActionUserPermissions, perm]);
                        } else {
                          setNewActionUserPermissions(newActionUserPermissions.filter(p => p !== perm));
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">
                      {perm === 'delete' ? 'Deletar' : perm === 'edit' ? 'Editar' : 'Trocar Data'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowActionUserDialog(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleAddActionUser} className="flex-1">
                Criar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Backup e Restauração - Colapsável */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border">
        <button
          onClick={() => toggleSection('backup')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
        >
          <h3 className="text-sm font-bold text-foreground">Backup e Restauração</h3>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              expandedSections['backup'] ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expandedSections['backup'] && (
          <div className="px-4 pb-4 border-t border-border space-y-3">
            <p className="text-xs text-muted-foreground">Faça backup de todas as suas configurações (cabeçalhos de lançamentos, usuários de ação, relatórios de acesso, categorias, cores, tamanhos, etc)</p>
            <div className="flex gap-2">
              <Button onClick={handleExportBackup} className="flex-1 gap-2">
                <Download className="w-4 h-4" />
                Exportar Backup
              </Button>
              <label className="flex-1">
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportBackup(file);
                  }}
                  className="hidden"
                />
                <Button asChild className="w-full gap-2 cursor-pointer">
                  <span>
                    <Upload className="w-4 h-4" />
                    Importar Backup
                  </span>
                </Button>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Add Fechamento Category Dialog */}
      <Dialog open={showFechamentoCategoryDialog} onOpenChange={setShowFechamentoCategoryDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Categoria FECHAMENTO</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nome da Categoria</label>
              <Input
                placeholder="Ex: Depósito, Transferência, etc..."
                value={newFechamentoCategory}
                onChange={e => setNewFechamentoCategory(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleAddFechamentoCategory()}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowFechamentoCategoryDialog(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleAddFechamentoCategory} className="flex-1">
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete with Master Password */}
      <Dialog
        open={showDeleteConfirmDialog}
        onOpenChange={(open) => {
          setShowDeleteConfirmDialog(open);
          if (!open) {
            setDeletePasswordInput('');
            setPendingDeleteAction(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Digite a senha da área de vendas para continuar.</p>
            <Input
              type="password"
              value={deletePasswordInput}
              onChange={(e) => setDeletePasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmDeleteWithMasterPassword();
              }}
              placeholder="Senha da área de vendas"
              className="w-full"
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDeleteConfirmDialog(false);
                  setDeletePasswordInput('');
                  setPendingDeleteAction(null);
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button onClick={confirmDeleteWithMasterPassword} className="flex-1">
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

