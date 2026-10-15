
import React, { useState, useMemo } from 'react';
import { Task } from '../types';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';

interface ListViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  onColorChange?: (taskId: string, newColor: string) => void;
  onAddNew?: () => void;
  onAddNewChoice?: (choice: 'new' | 'continue') => void;
  showTrackingDetails?: boolean;
}

const ListView: React.FC<ListViewProps> = ({ 
  tasks, 
  onTaskClick, 
  onDeleteTask, 
  onColorChange, 
  onAddNew, 
  onAddNewChoice,
  showTrackingDetails = false 
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  // Extract all available status options dynamically
  const availableStatuses = useMemo(() => {
    const defaultStatuses = Object.keys(STATUS_COLORS);
    const customStatuses = tasks.map(t => t.status).filter(Boolean);
    return Array.from(new Set([...defaultStatuses, ...customStatuses]));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase()) || 
                           task.companyName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'All' || task.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tasks, search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input 
            type="text" 
            placeholder="Cari nama tugas / perusahaan..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:border-zinc-700 dark:border-zinc-300 outline-none transition-all text-sm font-medium"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">Filter Status:</label>
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-zinc-700 dark:border-zinc-300 transition-all cursor-pointer w-full md:w-auto"
          >
            <option value="All">Semua Status ({tasks.length})</option>
            {availableStatuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {filteredTasks.length > 0 ? (
          filteredTasks.map(task => {
            const lastLog = task.logs && task.logs.length > 0 ? task.logs[task.logs.length - 1] : null;
            const lastUpdateDateStr = lastLog?.date ? new Date(lastLog.date).toLocaleString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : (task.startDate ? new Date(task.startDate).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            }) : '-');

            const calcProgress = () => {
              if (task.progress !== undefined && task.progress !== null) return Number(task.progress);
              if (lastLog?.progress !== undefined && lastLog?.progress !== null) return Number(lastLog.progress);
              if (task.status === 'Selesai' || task.status === 'Proses') return task.status === 'Selesai' ? 100 : 75;
              return 0;
            };
            const progressVal = calcProgress();

            return (
              <div 
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="group flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 px-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-2xl transition-all cursor-pointer border border-slate-100 dark:border-slate-800/80 shadow-xs hover:border-zinc-300 dark:border-zinc-700"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-5 h-5 rounded border border-slate-200 dark:border-slate-700 group-hover:border-zinc-500 dark:hover:border-zinc-500 transition-colors shrink-0 flex items-center justify-center">
                    {progressVal >= 100 && (
                      <div className="w-3 h-3 bg-emerald-500 rounded-xs" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider flex items-center gap-1">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                        {task.companyName}
                      </span>
                      {task.status && (
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                          task.status === 'Selesai' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                          task.status === 'Proses' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-700 dark:text-zinc-300' :
                          task.status === 'Ulang' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {task.status}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-zinc-900 dark:text-zinc-100 dark:group-hover:text-zinc-600 dark:text-zinc-400 transition-colors truncate">{task.title}</h4>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 dark:border-slate-800">
                  {/* Tanggal Terakhir Update */}
                  <div className="flex flex-col items-start md:items-end min-w-[130px]">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Update Terakhir</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{lastUpdateDateStr}</span>
                  </div>

                  {/* Persentase Progress */}
                  <div className="flex flex-col min-w-[110px] gap-1">
                    <div className="flex justify-between items-center text-[10px] font-black">
                      <span className="text-slate-400 dark:text-slate-500 uppercase tracking-wider">Progress</span>
                      <span className="text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 font-extrabold">{progressVal}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          progressVal >= 100 ? 'bg-emerald-500' : progressVal >= 50 ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-amber-500'
                        }`} 
                        style={{ width: `${Math.min(100, Math.max(0, progressVal))}%` }} 
                      />
                    </div>
                  </div>

                  <div className="hidden md:flex flex-col items-end">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Priority</span>
                    <span className={`text-xs font-bold ${task.priority === 'High' ? 'text-rose-500' : task.priority === 'Medium' ? 'text-zinc-800 dark:text-zinc-200' : 'text-slate-400 dark:text-slate-500'}`}>
                      {task.priority || 'Low'}
                    </span>
                  </div>

                  {onDeleteTask && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                      className="p-2 text-slate-300 hover:text-rose-500 transition-colors rounded-lg"
                      title="Hapus Tugas"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
            <p className="text-sm font-bold">Tidak ada tugas yang sesuai dengan filter ini.</p>
          </div>
        )}
      </div>

      {(onAddNew || onAddNewChoice) && (
        <div className="pt-4 flex gap-4 relative">
          <div className="relative">
            <button 
              onClick={() => {
                if (onAddNewChoice) {
                  setIsAddMenuOpen(!isAddMenuOpen);
                } else if (onAddNew) {
                  onAddNew();
                }
              }}
              className="px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white rounded-xl text-xs font-bold shadow-md shadow-zinc-900/10 dark:shadow-black/40 hover:bg-zinc-800 dark:bg-zinc-200 active:scale-95 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
              <span>Tambah Tugas</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${isAddMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
            </button>

            {isAddMenuOpen && (
              <>
                <div className="fixed inset-0 z-[190]" onClick={() => setIsAddMenuOpen(false)} />
                <div className="absolute left-0 bottom-full mb-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-[200] animate-fade-in space-y-1">
                  <button
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      if (onAddNewChoice) onAddNewChoice('new');
                      else if (onAddNew) onAddNew();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:hover:bg-zinc-800/50 dark:bg-zinc-900/60 hover:text-zinc-900 dark:text-zinc-100 transition-all text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                    </div>
                    <div>
                      <div className="font-bold">Buat Tugas Baru</div>
                      <div className="text-[10px] text-slate-400 font-normal">Mulai dari tugas baru</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      if (onAddNewChoice) onAddNewChoice('continue');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:hover:bg-zinc-800/50 dark:bg-zinc-900/60 hover:text-zinc-900 dark:text-zinc-100 transition-all text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                    </div>
                    <div>
                      <div className="font-bold">Lanjutkan Tugas</div>
                      <div className="text-[10px] text-slate-400 font-normal">Pilih tugas yang belum selesai</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ListView;
