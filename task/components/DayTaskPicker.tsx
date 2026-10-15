
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

  const todayTasks = useMemo(() => {
    if (!date) return [];
    return allTasks.filter(task => {
      const start = new Date(task.startDate);
      const end = new Date(task.endDate);
      const compareDate = new Date(date);
      compareDate.setHours(0,0,0,0);
      const startDate = new Date(start);
      startDate.setHours(0,0,0,0);
      const endDate = new Date(end);
      endDate.setHours(0,0,0,0);
      return compareDate >= startDate && compareDate <= endDate;
    });
  }, [allTasks, date]);

  const historyTasks = useMemo(() => {
    if (!date) return [];
    return allTasks.filter(task => {
      const end = new Date(task.endDate);
      const compareDate = new Date(date);
      compareDate.setHours(0,0,0,0);
      const endDate = new Date(end);
      endDate.setHours(0,0,0,0);
      
      const isFinishedBefore = endDate < compareDate;
      const matchesStatus = statusFilter === 'All' || task.status === statusFilter;
      return isFinishedBefore && matchesStatus;
    });
  }, [allTasks, date, statusFilter]);

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
      <div className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-200 border border-white/20 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 bg-zinc-900 dark:bg-zinc-100 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.5)]" />
                <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
                  {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </h3>
              </div>
              <p className="text-xs font-medium text-slate-500">Pilih laporan pengerjaan.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400 hover:text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('today')}
              className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider ${
                activeTab === 'today' ? 'bg-white text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Hari Ini ({todayTasks.length})
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider ${
                activeTab === 'history' ? 'bg-white text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Histori ({historyTasks.length})
            </button>
          </div>
        </div>

        {activeTab === 'history' && (
          <div className="px-6 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1 shrink-0">Filter:</span>
            <button 
              onClick={() => setStatusFilter('All')}
              className={`px-3 py-1.5 rounded-full text-[9px] font-bold whitespace-nowrap transition-all ${
                statusFilter === 'All' ? 'bg-zinc-900 dark:bg-zinc-100 text-white' : 'bg-white border border-slate-200 text-slate-500'
              }`}
            >
              Semua
            </button>
            {statuses.map(s => (
              <button 
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-[9px] font-bold whitespace-nowrap transition-all ${
                  statusFilter === s ? 'bg-zinc-900 dark:bg-zinc-100 text-white' : 'bg-white border border-slate-200 text-slate-500'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Task List Section */}
        <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-4 bg-slate-50/30">
          {displayedTasks.length > 0 ? (
            displayedTasks.map(task => (
              <div 
                key={task.id}
                style={task.color ? { borderLeft: `6px solid ${task.color}` } : {}}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col p-4"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="cursor-pointer flex-1 mr-2" onClick={() => handleEditTask(task)}>
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                       <h4 className="font-bold text-sm text-slate-800 group-hover:text-zinc-900 dark:text-zinc-100 transition-colors leading-tight">
                        {task.title}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-900 dark:text-zinc-100 font-bold">
                      {task.companyName} 
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {activeTab === 'history' && (
                      <button 
                        onClick={() => handlePickPrevious(task)}
                        title="Tarik ke hari ini"
                        className="p-2 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase hover:bg-emerald-100 transition-all border border-emerald-100"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                      </button>
                    )}
                    <button 
                      onClick={() => handleEditTask(task)}
                      className="p-2 text-slate-300 hover:text-zinc-900 dark:text-zinc-100 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); if(onDeleteTask) onDeleteTask(task.id); }}
                      className="p-2 text-slate-200 hover:text-rose-500 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${STATUS_COLORS[task.status]}`}>
                    {task.status}
                  </span>
                  <div className="text-[10px] font-bold text-slate-400">
                    {task.progress}%
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center">
              <p className="text-slate-500 font-bold text-sm">Kosong</p>
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
