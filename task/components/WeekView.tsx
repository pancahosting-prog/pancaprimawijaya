
import React from 'react';
import { Task } from '../types';

interface WeekViewProps {
  currentDate: Date;
  tasks: Task[];
  onTaskClick: (task: Task, logIdx: number) => void;
  onDateClick: (date: Date) => void;
}

const WeekView: React.FC<WeekViewProps> = ({ currentDate, tasks, onTaskClick, onDateClick }) => {
  const getWeekDays = (date: Date) => {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const weekDays = getWeekDays(currentDate);

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
    <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-[#F8FAFC]">
        {weekDays.map(date => {
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <div 
              key={date.toISOString()} 
              onClick={() => onDateClick(date)}
              className={`py-6 text-center border-r border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 transition-all ${isToday ? 'bg-zinc-100 dark:bg-zinc-800/60/50' : ''}`}
            >
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{date.toLocaleDateString('id-ID', { weekday: 'short' })}</p>
              <p className={`text-xl font-black ${isToday ? 'text-zinc-900 dark:text-zinc-100' : 'text-slate-800'}`}>{date.getDate()}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[600px]">
        {weekDays.map(date => {
          const logs = getLogsForDay(date);
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <div key={date.toISOString()} className={`p-4 border-r border-slate-100 last:border-0 hover:bg-slate-50/20 transition-colors ${isToday ? 'bg-zinc-100 dark:bg-zinc-800/60/10' : ''}`}>
              <div className="space-y-3">
                {logs.map(({ task, logIdx }) => (
                  <div 
                    key={`${task.id}-${logIdx}`}
                    onClick={(e) => { e.stopPropagation(); onTaskClick(task, logIdx); }}
                    style={{ borderLeft: `3px solid ${task.color || '#3b82f6'}` }}
                    className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:translate-y-[-2px] transition-all cursor-pointer group"
                  >
                    <h5 className="text-[11px] font-bold text-slate-800 mb-1 line-clamp-2 group-hover:text-zinc-900 dark:text-zinc-100">
                      {task.title}
                    </h5>
                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase">
                      <span>{task.logs[logIdx].progress}%</span>
                      <span>{task.logs[logIdx].status}</span>
                    </div>
                  </div>
                ))}
                {logs.length === 0 && (
                   <div className="py-10 text-center opacity-20">
                     <p className="text-[10px] font-bold text-slate-300 italic">Tidak ada update</p>
                   </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeekView;
