
import React from 'react';
import { CalendarViewType } from '../types';

interface CalendarHeaderProps {
  currentDate: Date;
  view: CalendarViewType;
  setView: (view: CalendarViewType) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({ 
  currentDate, view, setView, onPrev, onNext, onToday 
}) => {
  const formatDate = () => {
    return currentDate.toLocaleDateString('id-ID', { 
      month: 'long', 
      year: 'numeric',
      day: view === 'day' ? 'numeric' : undefined
    });
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <h2 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight">
          {formatDate()}
        </h2>
        <div className="flex bg-white rounded-2xl border border-slate-100 p-1 shadow-sm w-full sm:w-auto justify-between sm:justify-start">
          <button 
            onClick={onPrev}
            className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button 
            onClick={onToday}
            className="px-4 text-xs font-black uppercase tracking-widest hover:text-zinc-900 dark:text-zinc-100 transition-colors border-x border-slate-50 text-slate-500"
          >
            Hari Ini
          </button>
          <button 
            onClick={onNext}
            className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      </div>

      <div className="flex bg-slate-100/50 p-1.5 rounded-2xl w-full sm:w-auto">
        {(['day', 'week', 'month'] as CalendarViewType[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 sm:px-5 py-2.5 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${
              view === v 
                ? 'bg-white text-zinc-900 dark:text-zinc-100 shadow-sm' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {v === 'day' ? 'Hari' : v === 'week' ? 'Minggu' : 'Bulan'}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CalendarHeader;
