import { useApp } from '@/contexts/AppContext';
import LoginScreen from './LoginScreen';
import SelectionScreen from './SelectionScreen';
import StoreSelectionScreen from './StoreSelectionScreen';
import CaixaSelectionScreen from './CaixaSelectionScreen';
import CaixaTab from './CaixaTab';
import MainLayout from './MainLayout';
import ComprasScreen from './ComprasScreen';
import { AnimatePresence, motion } from 'framer-motion';

export default function Home() {
  const { screen, isLoading } = useApp();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
        {screen === 'login' && <LoginScreen />}
        {screen === 'selection' && <SelectionScreen />}
        {screen === 'storeSelection' && <StoreSelectionScreen />}
        {screen === 'caixaSelection' && <CaixaSelectionScreen />}
        {screen === 'caixa' && <CaixaTab />}
        {screen === 'main' && <MainLayout />}
        {screen === 'compras' && <ComprasScreen />}
      </motion.div>
    </AnimatePresence>
  );
}
