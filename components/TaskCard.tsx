
import React from 'react';
import { Task } from '../types';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  mini?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, mini = false }) => {
  const isCollaborative = (task.collaborators && task.collaborators.length > 0) || (task.pendingCollaborators && task.pendingCollaborators.length > 0);

  if (mini) {
    return (
      <div 
        onClick={() => onClick(task)}
        className={`px-1.5 py-0.5 mb-1 text-[10px] rounded border cursor-pointer truncate transition-transform hover:scale-[1.02] ${STATUS_COLORS[task.status]}`}
      >
        {isCollaborative && '👥 '}{task.title}
      </div>
    );
  }

  return (
    <div 
      onClick={() => onClick(task)}
      className="p-6 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:-translate-y-1 cursor-pointer transition-all group flex flex-col h-full ring-1 ring-transparent hover:ring-zinc-100 dark:hover:ring-slate-600"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col gap-1.5 w-full">
          <div className="flex justify-between items-center w-full mb-1">
            <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{task.companyName}</span>
            {isCollaborative && (
              <span className="bg-indigo-50 text-zinc-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Kolaborasi
              </span>
            )}
          </div>
          <h4 className="text-base font-bold text-slate-800 dark:text-white group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors line-clamp-2 leading-snug">
            {task.title}
          </h4>
          
          {/* Job Type & Employee Info */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
               <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
               <span className="text-[11px] font-semibold">{task.employeeName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 border-l border-slate-100 dark:border-slate-700 pl-3">
               <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="14" x="3" y="5" rx="2" ry="2"/><path d="M7 11h10"/><path d="M7 15h10"/><path d="M10 7V5"/></svg>
               <span className="text-[11px] italic">{task.jobType}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-6 space-y-4">
        {isCollaborative && task.collaborators && (
          <div className="flex -space-x-2 overflow-hidden mb-2">
            {[task.owner, ...task.collaborators].map((u, i) => u && (
              <div key={i} title={u} className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-slate-800 bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold uppercase text-slate-600 dark:text-slate-300">
                {u.charAt(0)}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${PRIORITY_COLORS[task.priority]}`}>
            {task.priority}
          </span>
          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${STATUS_COLORS[task.status]}`}>
            {task.status}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] font-bold">
            <span className="text-slate-400 dark:text-slate-500">Progress</span>
            <span className="text-slate-700 dark:text-slate-300">{task.progress}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-zinc-500 h-full transition-all duration-700 ease-out rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]" 
              style={{ width: `${task.progress}%` }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
