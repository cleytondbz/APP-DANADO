import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { DollarSign, Delete } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoginScreen() {
  const { settings, setScreen } = useApp();
  const [password, setPassword] = useState('');

  const handleKey = (d: string) => {
    if (password.length < 6) setPassword(p => p + d);
  };
  const handleDel = () => setPassword(p => p.slice(0, -1));

  const handleLogin = () => {
    if (password === settings.password) {
      setPassword('');
      setScreen('selection');
    } else {
      toast.error('Senha incorreta!');
      setPassword('');
    }
  };

  // Auto-submit when 4 digits
  if (password.length === 4 && password === settings.password) {
    setTimeout(() => { setPassword(''); setScreen('selection'); }, 200);
  }

  const keys = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','del']];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
        <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mb-4 card-glow">
          <DollarSign className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
        <span className="text-xl font-extrabold text-accent glow-primary">DANADO</span>
      </motion.div>

      <p className="text-muted-foreground text-sm mt-8 mb-4">Digite sua senha</p>

      <div className="flex gap-3 mb-8">
        {[0,1,2,3].map(i => (
          <motion.div key={i} animate={{ scale: i < password.length ? 1.2 : 1 }}
            className={`w-4 h-4 rounded-full border-2 border-primary transition-colors ${i < password.length ? 'bg-primary shadow-[0_0_10px_var(--primary)]' : 'bg-transparent'}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {keys.flat().map((k, i) => (
          <button key={i} disabled={k === ''}
            onClick={() => k === 'del' ? handleDel() : handleKey(k)}
            className={`h-14 rounded-xl text-xl font-semibold transition-all active:scale-95 ${
              k === '' ? 'invisible' :
              k === 'del' ? 'bg-card text-destructive hover:bg-destructive/20' :
              'bg-card text-foreground hover:bg-primary/20 active:bg-primary/30'
            }`}
          >
            {k === 'del' ? <Delete className="w-5 h-5 mx-auto" /> : k}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {password.length >= 4 && (
          <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={handleLogin}
            className="mt-6 px-12 py-3 bg-primary text-primary-foreground rounded-full font-bold text-lg hover:opacity-90 active:scale-95 transition-all"
          >
            ENTRAR
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
