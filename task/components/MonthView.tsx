
import React from 'react';
import { Task } from '../types';

interface MonthViewProps {
  currentDate: Date;
  tasks: Task[];
  onTaskClick: (task: Task, logIdx: number) => void;
  onDateClick: (date: Date) => void;
}

const MonthView: React.FC<MonthViewProps> = ({ currentDate, tasks, onTaskClick, onDateClick }) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

  const getLogsForDay = (date: Date) => {
    const results: { task: Task; logIdx: number }[] = [];
    const dateStr = date.toDateString();

    tasks.forEach(task => {
      task.logs.forEach((log, idx) => {
        if (new Date(log.date).toDateString() === dateStr) {
          results.push({ task, logIdx: idx });
        }
      });
    });
    return results;
  };

  return (
    <div className="grid grid-cols-7 border-l border-t border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-white">
      {['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'].map(d => (
        <div key={d} className="p-4 text-center text-[10px] font-black text-slate-400 uppercase bg-[#F8FAFC] border-b border-r border-slate-100">{d}</div>
      ))}
      {days.map((date, idx) => {
        if (!date) return <div key={`e-${idx}`} className="h-32 bg-[#FBFCFD] border-b border-r border-slate-100" />;
        
        const logs = getLogsForDay(date);
        const isToday = date.toDateString() === new Date().toDateString();

        return (
          <div 
            key={date.toISOString()} 
            onClick={() => onDateClick(date)}
            className="h-32 p-3 border-b border-r border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors relative flex flex-col items-center"
          >
            <div className={`text-[11px] font-bold mb-3 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isToday ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-lg shadow-zinc-900/10' : 'text-slate-400'}`}>
              {date.getDate()}
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              {logs.length > 0 && (
                <div className="flex flex-col items-center gap-1 animate-fade-in">
                  <div className="bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-zinc-900 dark:bg-zinc-100 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-tighter">
                      {logs.length} Tugas
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MonthView;
