import { ArrowLeft } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import ComprasTab from './ComprasTab';

export default function ComprasScreen() {
  const { setScreen } = useApp();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-xl border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => setScreen('selection')} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="w-4 h-4 text-primary" />
        </button>
        <h1 className="text-sm font-bold text-foreground">Compras</h1>
      </header>

      <main className="flex-1 px-4 py-4">
        <div className="w-full max-w-[1480px] mx-auto">
          <ComprasTab />
        </div>
      </main>
    </div>
  );
}

