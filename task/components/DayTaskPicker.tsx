
import React, { useState, useMemo } from 'react';
import { Task, TaskStatus } from '../types';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';

interface DayTaskPickerProps {
  isOpen: boolean;
  date: Date | null;
  allTasks: Task[];
  onClose: () => void;
  onSelectTask: (task: Task) => void;
  onAddTask: (date: Date) => void;
  onQuickUpdateStatus: (taskId: string, newStatus: TaskStatus) => void;
  onRescheduleTask?: (taskId: string, newDate: Date) => void;
  onDeleteTask?: (taskId: string) => void;
}

const DayTaskPicker: React.FC<DayTaskPickerProps> = ({ 
  isOpen, date, allTasks, onClose, onSelectTask, onAddTask, onQuickUpdateStatus, onRescheduleTask, onDeleteTask
}) => {
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const todayTasks = useMemo(() => {
    let list = allTasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = allTasks.filter(t => (t.title || '').toLowerCase().includes(q) || (t.companyName || '').toLowerCase().includes(q));
    } else {
      // Show unfinished / active tasks or tasks matching date
      const activeOrToday = allTasks.filter(t => t.status !== 'Selesai');
      if (activeOrToday.length > 0) list = activeOrToday;
    }
    return list;
  }, [allTasks, searchQuery]);

  const historyTasks = useMemo(() => {
    if (!date) return [];
    return allTasks.filter(task => {
      const matchesStatus = statusFilter === 'All' || task.status === statusFilter;
      const matchesQuery = !searchQuery.trim() || (task.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || (task.companyName || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [allTasks, date, statusFilter, searchQuery]);

  if (!isOpen || !date) return null;

  const statuses: TaskStatus[] = ['Belum Mulai', 'Proses', 'Selesai', 'Ulang'];
  const displayedTasks = activeTab === 'today' ? todayTasks : historyTasks;

  const handlePickPrevious = (task: Task) => {
    if (onRescheduleTask) {
      onRescheduleTask(task.id, date);
    }
  };

  const handleEditTask = (task: Task) => {
    onSelectTask(task);
    onClose(); // Explicitly close the picker when opening edit modal
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-[32px] sm:rounded-[32px] w-full max-w-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-200 border border-white/20 max-h-[90vh] flex flex-col">
        {/* Header matching image_a40ae895.png */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-200/80 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-zinc-200 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  LANJUTKAN TUGAS BELUM SELESAI
                </h3>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">Pilih tugas yang ingin dilanjutkan hari ini</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama tugas atau perusahaan/klien..."
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-semibold text-slate-800 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>

          <div className="flex bg-slate-200/60 dark:bg-slate-800 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('today')}
              className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider ${
                activeTab === 'today' ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Tugas Aktif ({todayTasks.length})
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider ${
                activeTab === 'history' ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Semua Tugas ({historyTasks.length})
            </button>
          </div>
        </div>

        {/* Task List Section */}
        <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-3 bg-slate-50/50 dark:bg-slate-950">
          {displayedTasks.length > 0 ? (
            displayedTasks.map(task => (
              <div 
                key={task.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md transition-all p-4 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleEditTask(task)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-400 truncate">
                      {task.companyName || 'PANCA PRIMA WIJAYA'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider ${STATUS_COLORS[task.status] || 'bg-slate-100 text-slate-700'}`}>
                      {task.status}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                    {task.title}
                  </h4>
                  <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                    Progress: <span className="font-extrabold text-slate-900 dark:text-white">{task.progress}%</span>
                  </div>
                </div>

                <button 
                  onClick={() => handleEditTask(task)}
                  className="px-4 py-2 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900 rounded-xl text-xs font-black shrink-0 shadow-xs flex items-center gap-1.5 transition active:scale-95"
                >
                  <span>Lanjutkan</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
              </div>
            ))
          ) : (
            <div className="py-12 text-center">
              <p className="text-slate-400 font-extrabold text-xs">Tidak ada tugas ditemukan</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 md:p-8 bg-white border-t border-slate-100 space-y-3">
          <div className="flex gap-3">
            <button 
              onClick={() => onAddTask(date)}
              className="flex-1 py-3.5 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 transition-all text-xs flex items-center justify-center gap-2"
            >
              + Buat Baru
            </button>
            <button 
              onClick={onClose}
              className="flex-1 py-3.5 bg-slate-100 text-slate-500 font-black rounded-xl hover:bg-slate-200 transition-all text-xs"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayTaskPicker;
