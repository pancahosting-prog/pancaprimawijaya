
import React, { useState, useMemo } from 'react';
import { Task, TaskStatus, TaskPriority } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';

interface AnalyticsViewProps {
  tasks: Task[];
}

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ tasks }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'All'>('All');

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Selesai').length;
    const inProgress = tasks.filter(t => t.status === 'Proses').length;
    const pending = tasks.filter(t => t.status === 'Belum Mulai' || t.status === 'Ulang').length;
    
    const avgProgress = total > 0 ? tasks.reduce((acc, t) => acc + t.progress, 0) / total : 0;
    
    const statusData = [
      { name: 'Selesai', value: completed, color: '#10B981' },
      { name: 'Proses', value: inProgress, color: '#3B82F6' },
      { name: 'Pending', value: pending, color: '#F59E0B' },
    ];

    const categoryCounts: Record<string, number> = {};
    tasks.forEach(t => {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    });

    const categoryData = Object.entries(categoryCounts).map(([name, count]) => ({
      name,
      count
    })).sort((a, b) => b.count - a.count).slice(0, 5);

    return { total, completed, inProgress, pending, avgProgress, statusData, categoryData };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = 
        task.title.toLowerCase().includes(search.toLowerCase()) || 
        task.companyName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'All' || task.status === statusFilter;
      const matchesPriority = priorityFilter === 'All' || task.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tasks, search, statusFilter, priorityFilter]);

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white">Performance Overview</h3>
        <div className="flex gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">Global Metrics</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Total Tasks</p>
          <p className="text-3xl font-black text-slate-800 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Completion Rate</p>
          <p className="text-3xl font-black text-emerald-600">{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Avg. Progress</p>
          <p className="text-3xl font-black text-zinc-900 dark:text-zinc-100">{Math.round(stats.avgProgress)}%</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">In Progress</p>
          <p className="text-3xl font-black text-zinc-900 dark:text-zinc-100">{stats.inProgress}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold text-slate-800 dark:text-white mb-6 uppercase tracking-wider">Status Distribution</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {stats.statusData.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold text-slate-800 dark:text-white mb-6 uppercase tracking-wider">Top Categories</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" opacity={0.5} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fontWeight: 600, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F1F5F9' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="count" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Advanced Task List Section */}
      <div className="mt-12 bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">Detailed Task Reports</h3>
          
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input 
                type="text" 
                placeholder="Search task or company"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs outline-none focus:border-zinc-700 dark:border-zinc-300 transition-all"
              />
            </div>
            <select 
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-400 outline-none"
            >
              <option value="All">All Status</option>
              {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select 
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-400 outline-none"
            >
              <option value="All">All Priority</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50 dark:border-slate-800">
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Task</th>
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Company</th>
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Priority</th>
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filteredTasks.length > 0 ? (
                filteredTasks.map(task => (
                  <tr key={task.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-4">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{task.title}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{task.category}</p>
                    </td>
                    <td className="py-4">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{task.companyName}</p>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${PRIORITY_COLORS[task.priority] || 'bg-slate-100 text-slate-500'}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-bold ${STATUS_COLORS[task.status]}`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-black text-slate-800 dark:text-slate-200">{task.progress}%</span>
                        <div className="w-16 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${task.progress}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 text-sm font-medium">No tasks match your filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
