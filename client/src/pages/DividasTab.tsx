import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { Plus, Search, CheckCircle2, Clock, Trash2, ChevronDown, ChevronUp, DollarSign, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';


export default function DividasTab() {
  const { debts, addDebt, payDebt, removeDebt, updateDebt } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<string | null>(null);
  const [showPay, setShowPay] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [payAmount, setPayAmount] = useState('');


  const filtered = useMemo(() => {
    let d = [...debts];
    if (filter === 'pending') d = d.filter(x => !x.paid);
    if (filter === 'paid') d = d.filter(x => x.paid);
    if (search) d = d.filter(x => x.personName.toLowerCase().includes(search.toLowerCase()));
    return d;
  }, [debts, filter, search]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof filtered> = {};
    filtered.forEach(d => {
      if (!g[d.personName]) g[d.personName] = [];
      g[d.personName].push(d);
    });
    return g;
  }, [filtered]);

  const totalPending = useMemo(() => debts.filter(d => !d.paid).reduce((s, d) => s + d.amount, 0), [debts]);
  const totalPaid = useMemo(() => debts.filter(d => d.paid).reduce((s, d) => s + (d.paidAmount || d.amount), 0), [debts]);

  const handleAdd = () => {
    if (!name.trim()) { toast.error('Digite o nome'); return; }
    const a = parseFloat(amount.replace(',', '.'));
    if (!a || a <= 0) { toast.error('Valor inválido'); return; }
    addDebt(name.trim(), desc.trim(), a, date);
    setName(''); setDesc(''); setAmount(''); setDate(new Date().toISOString().split('T')[0]);
    setShowAdd(false);
    toast.success('Dívida adicionada!');
  };

  const handleEdit = (id: string) => {
    const debt = debts.find(d => d.id === id);
    if (debt) {
      setName(debt.personName);
      setDesc(debt.description);
      setAmount(debt.amount.toString());
      setDate(debt.date);
      setShowEdit(id);
    }
  };

  const handleSaveEdit = () => {
    if (!name.trim()) { toast.error('Digite o nome'); return; }
    const a = parseFloat(amount.replace(',', '.'));
    if (!a || a <= 0) { toast.error('Valor inválido'); return; }
    if (showEdit) {
      updateDebt(showEdit, { personName: name.trim(), description: desc.trim(), amount: a, date });
      setShowEdit(null);
      setName(''); setDesc(''); setAmount(''); setDate(new Date().toISOString().split('T')[0]);
      toast.success('Dívida atualizada!');
    }
  };

  const handlePay = (id: string) => {
    const pa = payAmount ? parseFloat(payAmount.replace(',', '.')) : undefined;
    payDebt(id, pa);
    setShowPay(null); setPayAmount('');
    toast.success('Dívida paga!');
  };

  const personTotal = (name: string) => {
    return grouped[name]?.filter(d => !d.paid).reduce((s, d) => s + d.amount, 0) || 0;
  };



  return (
    <div className="space-y-4 pb-24">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-destructive/20 border border-destructive/30 rounded-xl p-3 text-center">
          <Clock className="w-5 h-5 text-destructive mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground">Pendente</p>
          <p className="text-lg font-bold font-mono-num text-destructive">{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-success/20 border border-success/30 rounded-xl p-3 text-center">
          <CheckCircle2 className="w-5 h-5 text-success mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground">Pago</p>
          <p className="text-lg font-bold font-mono-num text-success">{formatCurrency(totalPaid)}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 relative min-w-[150px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar pessoa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-1"><Plus className="w-4 h-4" /> Nova</Button>

      </div>



      <div className="flex gap-1.5">
        {(['all', 'pending', 'paid'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            {f === 'all' ? 'Todas' : f === 'pending' ? 'Pendentes' : 'Pagas'}
          </button>
        ))}
      </div>

      {/* Grouped List */}
      <div className="space-y-2">
        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma dívida encontrada</p>
          </div>
        )}
        {Object.entries(grouped).map(([person, items]) => (
          <div key={person} className="bg-card rounded-xl overflow-hidden">
            <button onClick={() => setExpandedPerson(p => p === person ? null : person)}
              className="w-full flex items-center justify-between p-3 hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{person.charAt(0).toUpperCase()}</span>
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm text-foreground">{person}</p>
                  <p className="text-[10px] text-muted-foreground">{items.filter(d => !d.paid).length} pendente(s)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold font-mono-num text-sm text-destructive">{formatCurrency(personTotal(person))}</span>
                {expandedPerson === person ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            <AnimatePresence>
              {expandedPerson === person && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="border-t border-border px-3 pb-3 space-y-2">
                    {items.map(d => (
                      <div key={d.id} className={`flex items-center gap-2 p-2 rounded-lg mt-2 ${d.paid ? 'bg-success/10' : 'bg-secondary/50'}`}>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-foreground">{d.description || 'Sem descrição'}</p>
                          <p className="text-[10px] text-muted-foreground">{formatDate(d.date)}</p>
                        </div>
                        <span className={`font-bold font-mono-num text-sm ${d.paid ? 'text-success line-through' : 'text-foreground'}`}>
                          {formatCurrency(d.amount)}
                        </span>
                        {!d.paid && (
                          <>
                            <button onClick={() => handleEdit(d.id)}
                              className="p-1.5 rounded-lg bg-warning/20 hover:bg-warning/30">
                              <Pencil className="w-3.5 h-3.5 text-warning" />
                            </button>
                            <button onClick={() => { setShowPay(d.id); setPayAmount(''); }}
                              className="p-1.5 rounded-lg bg-success/20 hover:bg-success/30">
                              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                            </button>
                          </>
                        )}
                        <button onClick={() => { if (confirm('Excluir?')) removeDebt(d.id); }}
                          className="p-1.5 rounded-lg bg-destructive/20 hover:bg-destructive/30">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Add Debt Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Dívida</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nome da Pessoa</label>
              <Input placeholder="Ex: João Silva" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Input placeholder="Ex: Compra de mercadoria" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Valor (R$)</label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} className="font-mono-num" />
            </div>
            <div>
              <label className="text-sm font-medium">Data</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowAdd(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleAdd} className="flex-1">Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Debt Dialog */}
      <Dialog open={!!showEdit} onOpenChange={() => setShowEdit(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar Dívida</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nome da Pessoa</label>
              <Input placeholder="Ex: João Silva" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Input placeholder="Ex: Compra de mercadoria" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Valor (R$)</label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} className="font-mono-num" />
            </div>
            <div>
              <label className="text-sm font-medium">Data</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowEdit(null)} className="flex-1">Cancelar</Button>
              <Button onClick={handleSaveEdit} className="flex-1">Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay Debt Dialog */}
      <Dialog open={!!showPay} onOpenChange={() => setShowPay(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Dar Baixa na Dívida</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Deixe vazio para quitar o valor total, ou informe o valor pago:</p>
            <Input type="text" inputMode="decimal" placeholder="Valor pago (opcional)" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="font-mono-num" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowPay(null)} className="flex-1">Cancelar</Button>
              <Button onClick={() => showPay && handlePay(showPay)} className="flex-1 bg-success hover:bg-success/90 text-success-foreground">Confirmar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
