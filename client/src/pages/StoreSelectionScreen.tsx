import { useApp } from '@/contexts/AppContext';
import { Store, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import type { StoreId } from '@/lib/types';

export default function StoreSelectionScreen() {
  const { setScreen, setCurrentStore, stores } = useApp();

  const pick = (s: StoreId) => {
    setCurrentStore(s);
    setScreen('main');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <button onClick={() => setScreen('selection')} className="absolute top-6 left-4 flex items-center gap-1 text-primary text-sm font-medium">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
        <h1 className="text-2xl font-bold text-foreground">Área de Vendas</h1>
        <p className="text-muted-foreground text-sm mt-2">Selecione a loja</p>
      </motion.div>

      <div className="flex gap-6 w-full max-w-4xl">
        {(['loja1', 'loja2'] as StoreId[]).map((id, i) => (
          <motion.button key={id}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * (i + 1) }}
            onClick={() => pick(id)}
            className={`flex-1 rounded-2xl p-8 flex flex-col items-center gap-4 hover:opacity-90 active:scale-95 transition-all card-glow ${
              i === 0 ? 'bg-primary' : 'bg-accent'
            }`}
          >
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center">
              <Store className="w-10 h-10 text-white" />
            </div>
            <span className="text-white font-bold text-2xl">{stores[id].storeName.toUpperCase()}</span>
            <span className="text-white/60 text-xs">{stores[id].cnpj}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
