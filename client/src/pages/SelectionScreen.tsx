import { useApp } from '@/contexts/AppContext';
import { TrendingUp, CreditCard } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const MATRIX_PASSWORD = 'Spys32636995';

export default function SelectionScreen() {
  const { setScreen, setTab, settings, setSettings } = useApp();
  const [showSenhaVendas, setShowSenhaVendas] = useState(false);
  const [senhaVendasInput, setSenhaVendasInput] = useState('');
  const [showAlterarSenha, setShowAlterarSenha] = useState(false);
  const [senhaAntiga, setSenhaAntiga] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmarSenhaNova, setConfirmarSenhaNova] = useState('');
  const [senhaVendasAtual, setSenhaVendasAtual] = useState(settings.senhaVendas || '2512');

  const abrirVendas = () => {
    setShowSenhaVendas(true);
    setSenhaVendasInput('');
  };

  const confirmarSenhaVendas = () => {
    if (senhaVendasInput !== senhaVendasAtual && senhaVendasInput !== MATRIX_PASSWORD) {
      toast.error('Senha incorreta!');
      setSenhaVendasInput('');
      return;
    }
    setShowSenhaVendas(false);
    setSenhaVendasInput('');
    setTab('fechamentoCompacto');
    setScreen('main');
  };

  const alterarSenha = () => {
    if (senhaAntiga !== senhaVendasAtual) {
      toast.error('Senha antiga incorreta!');
      setSenhaAntiga('');
      return;
    }
    if (senhaNova !== confirmarSenhaNova) {
      toast.error('As senhas novas nao conferem!');
      setSenhaNova('');
      setConfirmarSenhaNova('');
      return;
    }
    if (senhaNova.length < 4) {
      toast.error('A senha deve ter pelo menos 4 digitos!');
      return;
    }
    setSettings(s => ({ ...s, senhaVendas: senhaNova }));
    setSenhaVendasAtual(senhaNova);
    toast.success('Senha alterada com sucesso!');
    setShowAlterarSenha(false);
    setSenhaAntiga('');
    setSenhaNova('');
    setConfirmarSenhaNova('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
        <h1 className="text-2xl font-bold text-foreground">app <span className="text-accent">Danado</span></h1>
        <p className="text-muted-foreground text-sm mt-2">Selecione a area desejada</p>
      </motion.div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <motion.button initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
          onClick={abrirVendas}
          className="w-full bg-primary rounded-2xl p-6 flex flex-col items-center gap-3 hover:opacity-90 active:scale-95 transition-all card-glow"
        >
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
            <TrendingUp className="w-7 h-7 text-primary-foreground" />
          </div>
          <span className="text-primary-foreground font-bold text-lg">VENDAS</span>
          <span className="text-primary-foreground/70 text-xs">Gerenciar vendas</span>
        </motion.button>

        <motion.button initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          onClick={() => setScreen('caixaSelection')}
          className="w-full bg-accent rounded-2xl p-6 flex flex-col items-center gap-3 hover:opacity-90 active:scale-95 transition-all card-glow"
        >
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
            <CreditCard className="w-7 h-7 text-accent-foreground" />
          </div>
          <span className="text-accent-foreground font-bold text-lg">CAIXA</span>
          <span className="text-accent-foreground/70 text-xs">Fechamento de caixa</span>
        </motion.button>
      </div>

      {showAlterarSenha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-background rounded-lg shadow-lg p-6 w-96 max-w-[90vw]"
          >
            <h2 className="text-lg font-bold text-foreground mb-4">Alterar Senha de Vendas</h2>
            <div className="mb-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Senha Antiga</label>
              <Input type="tel" value={senhaAntiga} onChange={(e) => setSenhaAntiga(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Digite a senha antiga" className="w-full tracking-widest" maxLength={4} autoFocus />
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Senha Nova</label>
              <Input type="tel" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Digite a senha nova" className="w-full tracking-widest" maxLength={4} />
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Confirmar Senha Nova</label>
              <Input type="tel" value={confirmarSenhaNova} onChange={(e) => setConfirmarSenhaNova(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Confirme a senha nova" className="w-full tracking-widest" maxLength={4} />
            </div>
            <div className="flex gap-3">
              <Button onClick={() => { setShowAlterarSenha(false); setSenhaAntiga(''); setSenhaNova(''); setConfirmarSenhaNova(''); }} variant="outline" className="flex-1">Cancelar</Button>
              <Button onClick={alterarSenha} className="flex-1 bg-primary hover:bg-primary/90">Alterar</Button>
            </div>
          </motion.div>
        </div>
      )}

      {showSenhaVendas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-background rounded-lg shadow-lg p-6 w-96 max-w-[90vw]"
          >
            <h2 className="text-lg font-bold text-foreground mb-4">Acesso a Area de Vendas</h2>
            <p className="text-sm text-muted-foreground mb-4">Digite a senha para acessar a area.</p>
            <div className="mb-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Senha</label>
              <Input
                type="password"
                inputMode="numeric"
                value={senhaVendasInput}
                onChange={(e) => setSenhaVendasInput(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Digite a senha"
                onKeyDown={(e) => { if (e.key === 'Enter') confirmarSenhaVendas(); }}
                className="w-full tracking-widest"
                autoFocus
                maxLength={15}
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={() => { setShowSenhaVendas(false); setSenhaVendasInput(''); }} variant="outline" className="flex-1">Cancelar</Button>
              <Button onClick={confirmarSenhaVendas} className="flex-1 bg-primary hover:bg-primary/90">Confirmar</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
