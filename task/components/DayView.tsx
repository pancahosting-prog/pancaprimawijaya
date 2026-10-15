
import React from 'react';
import { Task } from '../types';

interface DayViewProps {
  currentDate: Date;
  tasks: Task[];
  onTaskClick: (task: Task, logIdx: number) => void;
  onDateClick: (date: Date) => void;
}

const DayView: React.FC<DayViewProps> = ({ currentDate, tasks, onTaskClick, onDateClick }) => {
  const getLogsForDay = () => {
    const results: { task: Task; logIdx: number }[] = [];
    const dateStr = currentDate.toDateString();

    tasks.forEach(task => {
      task.logs.forEach((log, idx) => {
        if (new Date(log.date).toDateString() === dateStr) {
          results.push({ task, logIdx: idx });
        }
      });
    });
    return results;
  };

  const dayLogs = getLogsForDay();
  const finishedCount = dayLogs.filter(l => l.task.logs[l.logIdx].status === 'Selesai').length;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden flex flex-col md:flex-row shadow-sm">
      {/* Summary Section */}
      <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-100 bg-[#F8FAFC] p-8 md:p-10 flex flex-col justify-between">
        <div>
          <div className="mb-10">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ringkasan Hari Ini</p>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">
              {currentDate.toLocaleDateString('id-ID', { weekday: 'long' })}
            </h2>
          </div>

          <div className="space-y-5">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-transform hover:scale-[1.02]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Laporan</p>
              <p className="text-4xl font-black text-slate-800">{dayLogs.length}</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-transform hover:scale-[1.02]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status Selesai</p>
              <p className="text-4xl font-black text-emerald-600">{finishedCount}</p>
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => onDateClick(currentDate)}
          className="mt-10 w-full py-5 bg-slate-900 text-white font-bold rounded-2xl shadow-xl shadow-slate-200 hover:bg-zinc-900 dark:bg-zinc-100 transition-all flex items-center justify-center gap-3 active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
          Update Pengerjaan
        </button>
      </div>
      
      {/* Timeline Section */}
      <div className="flex-1 overflow-y-auto max-h-[700px] p-8 md:p-10">
        {dayLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            </div>
            <p className="font-bold text-slate-500">Belum ada laporan aktivitas hari ini</p>
            <p className="text-xs text-slate-400 mt-1 mb-6">Klik tombol di samping untuk menambah laporan baru.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Aktivitas Terdaftar</h4>
            {dayLogs.map(({ task, logIdx }) => {
               const log = task.logs[logIdx];
               return (
                <div 
                  key={`${task.id}-${logIdx}`}
                  onClick={() => onTaskClick(task, logIdx)}
                  className="flex items-center gap-6 p-5 bg-white rounded-[24px] border border-slate-100 hover:border-zinc-300 dark:border-zinc-700 hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="w-1.5 h-12 rounded-full" style={{ backgroundColor: task.color || '#3b82f6' }} />
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-base font-black text-slate-800 group-hover:text-zinc-900 dark:text-zinc-100 transition-colors">{task.title}</h4>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                       <span className="text-zinc-900 dark:text-zinc-100">{task.companyName}</span>
                       <span>•</span>
                       <span>{task.employeeName}</span>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-2">
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                      log.status === 'Selesai' ? 'bg-emerald-50 text-emerald-600' : 
                      log.status === 'Proses' ? 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {log.status}
                    </span>
                    <span className="text-xs font-black text-slate-800">{log.progress}%</span>
                  </div>
                </div>
               );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DayView;
