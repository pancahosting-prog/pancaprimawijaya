
import React, { useState, useEffect } from 'react';
import { Task, TaskLog, TaskStatus, TaskPriority } from '../types';
import { CATEGORIES, TASK_COLORS } from '../constants';

interface TaskModalProps {
  task: Task | null;
  logIndex: number; 
  prefilledDate?: string;
  onClose: () => void;
  onSave: (task: Task) => void;
  isOpen: boolean;
  allUsers?: any[];
}

const TaskModal: React.FC<TaskModalProps> = ({ task, logIndex, prefilledDate, onClose, onSave, isOpen, allUsers = [] }) => {
  const [basicInfoState, setBasicInfoState] = useState({
    title: '',
    companyName: '',
    jobType: '',
    priority: 'Medium' as TaskPriority,
    category: CATEGORIES[0],
    color: TASK_COLORS[0].hex,
    employeeName: ''
  });

  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [pendingCollaborators, setPendingCollaborators] = useState<string[]>([]);

  const [currentLog, setCurrentLog] = useState<TaskLog>({
    status: 'Belum Mulai',
    progress: 0,
    date: prefilledDate || new Date().toISOString(),
    description: ''
  });

  const isExisting = !!task;

  useEffect(() => {
    if (task && logIndex !== -1 && task.logs[logIndex]) {
      setBasicInfoState({
        title: task.title,
        companyName: task.companyName,
        jobType: task.jobType,
        priority: task.priority,
        category: task.category,
        color: task.color || TASK_COLORS[0].hex,
        employeeName: task.employeeName
      });
      setCollaborators(task.collaborators || []);
      setPendingCollaborators(task.pendingCollaborators || []);
      setCurrentLog({ ...task.logs[logIndex] });
    } else {
      setBasicInfoState({
        title: '',
        companyName: '',
        jobType: '',
        priority: 'Medium',
        category: CATEGORIES[0],
        color: TASK_COLORS[0].hex,
        employeeName: ''
      });
      setCollaborators([]);
      setPendingCollaborators([]);
      setCurrentLog({
        status: 'Belum Mulai',
        progress: 0,
        date: prefilledDate || new Date().toISOString(),
        description: ''
      });
    }
  }, [task, logIndex, prefilledDate, isOpen]);

  if (!isOpen) return null;

  const toggleCollaborator = (username: string) => {
    setPendingCollaborators(prev => 
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const isLatestLog = task && logIndex === (task.logs.length - 1);

    const updatedTask: Task = task ? {
      ...task,
      ...basicInfoState,
      status: isLatestLog ? currentLog.status : task.status,
      progress: isLatestLog ? currentLog.progress : task.progress,
      logs: task.logs.map((l, i) => i === logIndex ? { ...currentLog } : l),
      collaborators,
      pendingCollaborators
    } : {
      id: `task_${Date.now()}`,
      ...basicInfoState,
      startDate: currentLog.date,
      endDate: currentLog.date,
      status: currentLog.status,
      progress: currentLog.progress,
      logs: [{ ...currentLog }],
      collaborators: [],
      pendingCollaborators
    };

    onSave(updatedTask);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-[32px] sm:rounded-[32px] w-full max-w-6xl max-h-[92vh] sm:max-h-[85vh] shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-bottom duration-300">
        
        {/* Sidebar History & Collaborators */}
        <div className="w-full md:w-2/5 bg-[#F8FAFC] dark:bg-slate-950 p-6 md:p-8 border-b md:border-b-0 md:border-r border-slate-100 overflow-y-auto custom-scrollbar">
          <div className="space-y-10">
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Tim Kolaborasi</h4>
              <div className="space-y-2">
                {collaborators.map(u => (
                  <div key={u} className="flex items-center gap-2 p-2 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <div className="w-6 h-6 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white flex items-center justify-center text-[10px] font-bold uppercase">{u.charAt(0)}</div>
                    <span className="text-[10px] font-bold text-zinc-900 dark:text-zinc-200">{u}</span>
                  </div>
                ))}
                {collaborators.length === 0 && <p className="text-[10px] text-slate-400 italic">Belum ada kolaborator aktif.</p>}
              </div>
            </div>

            {!isExisting && (
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Undang Teman</h4>
                <div className="grid grid-cols-2 gap-2">
                  {allUsers.map(user => (
                    <button 
                      key={user.username}
                      type="button"
                      onClick={() => toggleCollaborator(user.username)}
                      className={`p-2 rounded-xl border text-[10px] font-bold text-left transition-all ${
                        pendingCollaborators.includes(user.username) 
                        ? 'bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white shadow-md' 
                        : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {user.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Riwayat Perubahan (History)</h4>
              <div className="space-y-6 relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-[1.5px] bg-slate-200" />
                {task?.logs.slice().reverse().map((log, reversedIdx) => {
                  const originalIdx = task.logs.length - 1 - reversedIdx;
                  return (
                    <div key={originalIdx} className="relative pl-6">
                      <div className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-all ${originalIdx === logIndex ? 'bg-zinc-900 dark:bg-zinc-100 scale-125 z-10 shadow-zinc-900/10' : 'bg-slate-300'}`} />
                      <div className="flex flex-col gap-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                          {new Date(log.date).toLocaleString('id-ID', { 
                            day: 'numeric', 
                            month: 'short', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <div className={`p-4 rounded-2xl border transition-all ${originalIdx === logIndex ? 'bg-white border-zinc-200 dark:border-zinc-800 shadow-md ring-1 ring-zinc-300 dark:ring-zinc-700' : 'bg-transparent border-slate-100'}`}>
                           <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{log.status}</span>
                              <span className="text-[10px] font-black text-zinc-900 dark:text-zinc-100">{log.progress}%</span>
                           </div>
                           <p className="text-[11px] text-slate-500 leading-relaxed italic">
                             {log.description || "Tidak ada catatan perubahan."}
                           </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Form Area */}
        <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white">
                {isExisting ? (logIndex === task.logs.length - 1 ? 'Update Laporan Terkini' : 'Koreksi Data Riwayat') : 'Tugas Baru'}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Formulir Detail Pekerjaan</p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-500 transition-colors">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Judul Pekerjaan</label>
                <input required disabled={isExisting} value={basicInfoState.title} onChange={e => setBasicInfoState({...basicInfoState, title: e.target.value})} className="w-full p-4 rounded-2xl border border-slate-200 font-bold focus:border-zinc-700 dark:border-zinc-300 outline-none transition-all text-sm bg-slate-50/50 focus:bg-white text-slate-800 dark:text-white dark:bg-slate-950 dark:border-slate-800" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Perusahaan / Klien</label>
                <input required disabled={isExisting} value={basicInfoState.companyName} onChange={e => setBasicInfoState({...basicInfoState, companyName: e.target.value})} className="w-full p-4 rounded-2xl border border-slate-200 focus:border-zinc-700 dark:border-zinc-300 outline-none text-sm bg-slate-50/50 focus:bg-white text-slate-800 dark:text-white dark:bg-slate-950 dark:border-slate-800" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Prioritas</label>
                <select value={basicInfoState.priority} onChange={e => setBasicInfoState({...basicInfoState, priority: e.target.value as TaskPriority})} className="w-full p-4 rounded-2xl border border-slate-200 font-bold text-sm outline-none bg-slate-50/50 focus:bg-white text-slate-800 dark:text-white dark:bg-slate-950 dark:border-slate-800">
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            <div className="p-8 rounded-[32px] border bg-zinc-100 dark:bg-zinc-800/60/20 border-zinc-200 dark:border-zinc-800/50 shadow-inner">
              <div className="flex items-center justify-between mb-8">
                <h4 className="font-black text-[10px] uppercase tracking-widest text-zinc-900 dark:text-zinc-200">Detail Perubahan Log ({new Date(currentLog.date).toLocaleDateString('id-ID')})</h4>
                <span className="px-3 py-1 bg-zinc-900 dark:bg-zinc-100 text-white text-[10px] font-black rounded-full uppercase tracking-tighter shadow-lg shadow-zinc-900/10">Aktif</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Status Pengerjaan</label>
                  <select value={currentLog.status} onChange={e => setCurrentLog({...currentLog, status: e.target.value as TaskStatus})} className="w-full p-4 rounded-2xl border border-slate-200 bg-white font-bold text-sm shadow-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:ring-zinc-700 transition-all text-slate-800 dark:text-white dark:bg-slate-950 dark:border-slate-800">
                    <option value="Belum Mulai">Belum Mulai</option>
                    <option value="Proses">Proses</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Ulang">Ulang</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Progres Capaian ({currentLog.progress}%)</label>
                  <div className="flex items-center gap-4">
                    <input type="range" min="0" max="100" step="5" value={currentLog.progress} onChange={e => setCurrentLog({...currentLog, progress: parseInt(e.target.value)})} className="flex-1 h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-zinc-900 dark:accent-zinc-100" />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Deskripsi Perubahan / Catatan</label>
                  <textarea rows={4} value={currentLog.description} onChange={e => setCurrentLog({...currentLog, description: e.target.value})} className="w-full p-5 rounded-2xl border border-slate-200 bg-white shadow-sm outline-none text-sm resize-none focus:ring-2 focus:ring-zinc-300 dark:ring-zinc-700 transition-all text-slate-800 dark:text-white dark:bg-slate-950 dark:border-slate-800" placeholder="Jelaskan apa yang berubah atau apa yang dilakukan pada tahap ini..." />
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button type="button" onClick={onClose} className="flex-1 py-4 font-bold text-slate-500 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all text-sm active:scale-95">Batal</button>
              <button type="submit" className="flex-[2] py-4 font-black text-white bg-slate-900 rounded-2xl shadow-2xl hover:bg-zinc-900 dark:bg-zinc-100 transition-all text-sm active:scale-95">Simpan Perubahan</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
