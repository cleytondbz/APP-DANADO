import { useApp } from '@/contexts/AppContext';
import { MONTH_NAMES } from '@/lib/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function MonthSelector() {
  const { selectedYear, selectedMonth, setSelectedYear, setSelectedMonth } = useApp();

  const nav = (dir: number) => {
    let m = selectedMonth + dir, y = selectedYear;
    if (m > 12) { m = 1; y++; } else if (m < 1) { m = 12; y--; }
    setSelectedMonth(m); setSelectedYear(y);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-card rounded-xl px-4 py-3">
        <button onClick={() => nav(-1)} className="p-1 hover:bg-primary/20 rounded-lg transition-colors">
          <ChevronLeft className="w-5 h-5 text-primary" />
        </button>
        <div className="text-center">
          <div className="text-lg font-bold text-foreground">{MONTH_NAMES[selectedMonth - 1]}</div>
          <div className="text-xs text-muted-foreground">{selectedYear}</div>
        </div>
        <button onClick={() => nav(1)} className="p-1 hover:bg-primary/20 rounded-lg transition-colors">
          <ChevronRight className="w-5 h-5 text-primary" />
        </button>
      </div>


    </div>
  );
}
