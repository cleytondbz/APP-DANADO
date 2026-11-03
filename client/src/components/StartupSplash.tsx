import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function StartupSplash() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !window.sessionStorage.getItem('danado-startup-splash-seen');
  });

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem('danado-startup-splash-seen', '1');
      setVisible(false);
    }, 7000);

    return () => window.clearTimeout(timer);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-slate-950"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          <motion.div
            className="absolute h-[460px] w-[460px] rounded-full bg-blue-500/25 blur-3xl"
            initial={{ scale: 0.7, opacity: 0.45 }}
            animate={{ scale: [0.7, 1.15, 0.9], opacity: [0.45, 0.8, 0.55] }}
            transition={{ duration: 2.1, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute h-[320px] w-[320px] rounded-full bg-emerald-400/20 blur-3xl"
            initial={{ x: -120, y: 80, opacity: 0 }}
            animate={{ x: -60, y: 20, opacity: 0.8 }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute h-[300px] w-[300px] rounded-full bg-amber-400/20 blur-3xl"
            initial={{ x: 120, y: -80, opacity: 0 }}
            animate={{ x: 70, y: -20, opacity: 0.8 }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
          />

          <motion.div
            className="relative flex min-w-[440px] max-w-[90vw] flex-col items-center rounded-[2.25rem] border border-white/15 bg-white/10 px-12 py-10 text-center shadow-2xl backdrop-blur-xl"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -16, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <motion.div
              className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-4xl font-black text-blue-600 shadow-2xl"
              initial={{ y: 8, scale: 0.88, opacity: 0 }}
              animate={{
                y: [0, -5, 0],
                scale: [1, 1.06, 1],
                opacity: 1,
              }}
              transition={{
                y: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
                scale: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
                opacity: { duration: 0.35 },
              }}
            >
              D
            </motion.div>
            <motion.h1
              className="text-4xl font-black tracking-tight text-white"
              initial={{ letterSpacing: '0.16em', opacity: 0 }}
              animate={{ letterSpacing: '0.02em', opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.65 }}
            >
              Danado SIM
            </motion.h1>
            <motion.p
              className="mt-2 text-base font-semibold text-white/70"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.45 }}
            >
              Carregando seu painel financeiro...
            </motion.p>
            <motion.div className="mt-7 h-3 w-80 max-w-[70vw] overflow-hidden rounded-full border border-white/15 bg-white/15 shadow-inner">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 via-emerald-300 to-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.75)]"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.65, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
