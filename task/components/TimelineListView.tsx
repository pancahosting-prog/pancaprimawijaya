import React, { useState, useMemo } from 'react';
import { Task, TaskLog } from '../types';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';

interface TimelineItem {
  task: Task;
  log: TaskLog | null;
  logIndex: number;
  date: Date;
  dateKey: string; // YYYY-MM-DD
  timeStr: string;
  progress: number;
  status: string;
  description: string;
}

interface TimelineListViewProps {
  tasks: Task[];
  onTaskClick: (task: Task, logIdx?: number) => void;
  onDeleteTask?: (taskId: string) => void;
  onAddNew?: () => void;
  onAddNewChoice?: (choice: 'new' | 'continue') => void;
  showTrackingDetails?: boolean;
}

const TimelineListView: React.FC<TimelineListViewProps> = ({
  tasks,
  onTaskClick,
  onDeleteTask,
  onAddNew,
  onAddNewChoice,
  showTrackingDetails = false
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedMonthYear, setSelectedMonthYear] = useState('All');
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(30); // Number of days to render initially

  // Extract all timeline entries from tasks and their logs
  const timelineEntries = useMemo(() => {
    const entries: TimelineItem[] = [];

    tasks.forEach(task => {
      if (task.logs && task.logs.length > 0) {
        task.logs.forEach((log, logIdx) => {
          const d = new Date(log.date || task.endDate || task.startDate);
          const validDate = isNaN(d.getTime()) ? new Date() : d;
          const dateKey = `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}-${String(validDate.getDate()).padStart(2, '0')}`;
          const timeStr = validDate.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
          });

          entries.push({
            task,
            log,
            logIndex: logIdx,
            date: validDate,
            dateKey,
            timeStr,
            progress: typeof log.progress === 'number' ? log.progress : (task.progress || (log.status === 'Selesai' ? 100 : 50)),
            status: log.status || task.status || 'Belum Mulai',
            description: log.description || ''
          });
        });
      } else {
        // Task has no logs yet, use startDate or endDate
        const d = new Date(task.startDate || task.endDate || Date.now());
        const validDate = isNaN(d.getTime()) ? new Date() : d;
        const dateKey = `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}-${String(validDate.getDate()).padStart(2, '0')}`;
        const timeStr = validDate.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit'
        });

        entries.push({
          task,
          log: null,
          logIndex: -1,
          date: validDate,
          dateKey,
          timeStr,
          progress: typeof task.progress === 'number' ? task.progress : (task.status === 'Selesai' ? 100 : 0),
          status: task.status || 'Belum Mulai',
          description: task.jobType ? `Pekerjaan: ${task.jobType}` : ''
        });
      }
    });

    return entries;
  }, [tasks]);

  // Extract unique available months for quick jump filtering
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    timelineEntries.forEach(item => {
      const monthYear = item.date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      monthsSet.add(monthYear);
    });
    return Array.from(monthsSet);
  }, [timelineEntries]);

  // Filter items by search, status, and month/year
  const filteredEntries = useMemo(() => {
    return timelineEntries.filter(item => {
      const matchesSearch =
        item.task.title.toLowerCase().includes(search.toLowerCase()) ||
        item.task.companyName.toLowerCase().includes(search.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;

      const itemMonthYear = item.date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const matchesMonth = selectedMonthYear === 'All' || itemMonthYear === selectedMonthYear;

      return matchesSearch && matchesStatus && matchesMonth;
    });
  }, [timelineEntries, search, statusFilter, selectedMonthYear]);

  // Group filtered entries by dateKey (Descending: newest date first, down to older past dates)
  const groupedByDay = useMemo(() => {
    const groups: { [dateKey: string]: { date: Date; items: TimelineItem[] } } = {};

    filteredEntries.forEach(item => {
      if (!groups[item.dateKey]) {
        groups[item.dateKey] = {
          date: item.date,
          items: []
        };
      }
      groups[item.dateKey].items.push(item);
    });

    // Sort dates in descending order (latest date at top, older dates below)
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    return sortedKeys.map(key => {
      // Sort tasks within the day descending by time
      const items = groups[key].items.sort((a, b) => b.date.getTime() - a.date.getTime());
      return {
        dateKey: key,
        date: groups[key].date,
        items
      };
    });
  }, [filteredEntries]);

  // Check if a date is today
  const todayStr = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, []);

  const visibleDays = groupedByDay.slice(0, displayCount);
  const hasMoreDays = groupedByDay.length > displayCount;

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls Bar */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Cari tugas, perusahaan, atau catatan..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:border-zinc-700 dark:border-zinc-300 outline-none transition-all text-sm font-medium"
            />
          </div>

          {/* Filters: Status & Month Selector */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filter Status */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-zinc-700 dark:border-zinc-300 transition-all cursor-pointer"
            >
              <option value="All">Semua Status</option>
              <option value="Proses">Proses</option>
              <option value="Selesai">Selesai</option>
              <option value="Ulang">Ulang</option>
              <option value="Belum Mulai">Belum Mulai</option>
            </select>

            {/* Filter Bulan / Tahun */}
            {availableMonths.length > 0 && (
              <select
                value={selectedMonthYear}
                onChange={e => setSelectedMonthYear(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-zinc-700 dark:border-zinc-300 transition-all cursor-pointer"
              >
                <option value="All">Semua Bulan</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}

            {/* Blue Add Task Button if enabled */}
            {onAddNew && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (onAddNewChoice) {
                      setIsAddMenuOpen(!isAddMenuOpen);
                    } else {
                      onAddNew();
                    }
                  }}
                  className="px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:bg-zinc-200 text-white rounded-xl text-xs font-bold shadow-md shadow-zinc-900/10 dark:shadow-black/40 active:scale-95 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                  <span>Tambah Tugas</span>
                  {onAddNewChoice && (
                    <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isAddMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                  )}
                </button>

                {onAddNewChoice && isAddMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[190]" onClick={() => setIsAddMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-[200] animate-fade-in space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          onAddNewChoice('new');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:hover:bg-zinc-800/50 dark:bg-zinc-900/60 hover:text-zinc-900 dark:text-zinc-100 transition-all text-left"
                      >
                        <div className="w-6 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                        </div>
                        <div>
                          <div className="font-bold">Buat Tugas Baru</div>
                          <div className="text-[9px] text-slate-400 font-normal">Mulai tugas kosong</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          onAddNewChoice('continue');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:hover:bg-zinc-800/50 dark:bg-zinc-900/60 hover:text-zinc-900 dark:text-zinc-100 transition-all text-left"
                      >
                        <div className="w-6 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                        </div>
                        <div>
                          <div className="font-bold">Lanjutkan Tugas</div>
                          <div className="text-[9px] text-slate-400 font-normal">Tugas belum selesai</div>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Timeline Quick Statistics */}
        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-zinc-700 dark:bg-zinc-300" />
            <span>Total Hari Tercatat: <strong className="text-slate-800 dark:text-white">{groupedByDay.length} Hari</strong></span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Total Log Aktivitas: <strong className="text-slate-800 dark:text-white">{filteredEntries.length} Item</strong></span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-100" />
            <span>Urutan: <strong className="text-slate-800 dark:text-white">Terbaru (Paling Atas) ke Masa Lalu</strong></span>
          </div>
        </div>
      </div>

      {/* Timeline Day-by-Day List */}
      <div className="space-y-8 relative">
        {/* Continuous vertical timeline guide line */}
        <div className="absolute left-[39px] sm:left-[47px] top-6 bottom-6 w-0.5 bg-slate-200 dark:bg-slate-800 hidden sm:block pointer-events-none" />

        {visibleDays.length > 0 ? (
          visibleDays.map(({ dateKey, date, items }) => {
            const isToday = dateKey === todayStr;
            const dayName = date.toLocaleDateString('id-ID', { weekday: 'long' });
            const dayNum = date.getDate();
            const monthYearStr = date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
            const fullDateStr = date.toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });

            const finishedItemsCount = items.filter(it => it.status === 'Selesai').length;

            return (
              <div key={dateKey} className="relative flex flex-col sm:flex-row gap-4 sm:gap-6 group">
                {/* Left: Date Badge Pill */}
                <div className="sm:sticky sm:top-24 sm:self-start z-10 shrink-0 flex sm:flex-col items-center sm:items-center justify-between sm:justify-start gap-2 bg-white dark:bg-slate-900 p-3 sm:py-3.5 sm:px-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm w-full sm:w-[94px]">
                  <div className="flex sm:flex-col items-center gap-2 sm:gap-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {dayName}
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white leading-none">
                      {String(dayNum).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] font-extrabold uppercase text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 tracking-wider">
                      {monthYearStr}
                    </span>
                  </div>

                  {isToday && (
                    <span className="px-2 py-0.5 bg-emerald-500 text-white rounded-md text-[9px] font-black uppercase tracking-wider shadow-xs">
                      Hari Ini
                    </span>
                  )}

                  <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 hidden sm:block text-center mt-1 border-t border-slate-100 dark:border-slate-800 pt-1.5 w-full">
                    {items.length} Tugas
                  </div>
                </div>

                {/* Right: Tasks List for this day */}
                <div className="flex-1 space-y-3">
                  {/* Day Header Bar */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-slate-800 dark:text-white">
                        {fullDateStr}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                        {items.length} aktivitas
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 font-medium">
                      {finishedItemsCount > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {finishedItemsCount} selesai
                        </span>
                      ) : (
                        <span>{items.length} tugas aktif</span>
                      )}
                    </div>
                  </div>

                  {/* List of Tasks for this Day */}
                  <div className="space-y-3">
                    {items.map((item, idx) => {
                      const { task, log, logIndex, timeStr, progress, status, description } = item;
                      const progressVal = Math.min(100, Math.max(0, Number(progress) || 0));

                      return (
                        <div
                          key={`${task.id}_${logIndex}_${idx}`}
                          onClick={() => onTaskClick(task, logIndex !== -1 ? logIndex : (task.logs ? task.logs.length - 1 : -1))}
                          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-zinc-400 dark:border-zinc-600 dark:hover:border-zinc-700 dark:hover:border-zinc-300 transition-all cursor-pointer group/card flex flex-col gap-3"
                        >
                          {/* Row 1: Company, Time, Status, Priority */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Time Badge */}
                              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 text-xs font-bold">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                <span>{timeStr} WIB</span>
                              </div>

                              {/* Company Name */}
                              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                                </svg>
                                <span>{task.companyName}</span>
                              </div>

                              {/* Category tag */}
                              {task.category && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  {task.category}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Status Badge */}
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                  status === 'Selesai'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : status === 'Proses'
                                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 dark:bg-zinc-900/60 dark:text-zinc-700 dark:text-zinc-300'
                                    : status === 'Ulang'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {status}
                              </span>

                              {/* Priority Badge */}
                              {task.priority && (
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                    task.priority === 'High'
                                      ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300'
                                      : task.priority === 'Medium'
                                      ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 dark:bg-zinc-900/60 dark:text-zinc-700 dark:text-zinc-300'
                                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                                >
                                  {task.priority}
                                </span>
                              )}

                              {/* Delete Button */}
                              {onDeleteTask && (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (confirm(`Hapus tugas "${task.title}"?`)) {
                                      onDeleteTask(task.id);
                                    }
                                  }}
                                  className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors rounded-lg"
                                  title="Hapus Tugas"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Task Title and Progress */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-base font-extrabold text-slate-800 dark:text-white group-hover/card:text-zinc-900 dark:text-zinc-100 dark:group-hover/card:text-zinc-600 dark:text-zinc-400 transition-colors">
                                {task.title}
                              </h4>
                              {description && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                  {description}
                                </p>
                              )}
                            </div>

                            {/* Progress Bar & Percentage */}
                            <div className="flex items-center gap-3 shrink-0 min-w-[180px]">
                              <div className="flex-1">
                                <div className="flex justify-between items-center text-[10px] font-black mb-1">
                                  <span className="text-slate-400 uppercase tracking-wider">Progress</span>
                                  <span className="text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 font-extrabold">{progressVal}%</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-200/60 dark:border-slate-700/60">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      progressVal >= 100
                                        ? 'bg-emerald-500'
                                        : progressVal >= 50
                                        ? 'bg-zinc-900 dark:bg-zinc-100'
                                        : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${progressVal}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Row 3: Meta details (Assignee, Job Type, Date) */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            <div className="flex items-center gap-3">
                              {task.employeeName && (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-900/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[8px] font-black uppercase">
                                    {task.employeeName.charAt(0)}
                                  </div>
                                  <span className="font-semibold text-slate-600 dark:text-slate-300">{task.employeeName}</span>
                                </div>
                              )}
                              {task.jobType && (
                                <span>Jenis: <strong className="text-slate-600 dark:text-slate-300">{task.jobType}</strong></span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 group-hover/card:translate-x-0.5 transition-transform">
                              <span>Detail & Update</span>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-20 flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 flex items-center justify-center mb-4">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
                <line x1="16" x2="16" y1="2" y2="6"/>
                <line x1="8" x2="8" y1="2" y2="6"/>
                <line x1="3" x2="21" y1="10" y2="10"/>
              </svg>
            </div>
            <h4 className="text-base font-black text-slate-800 dark:text-white mb-1">
              Tidak Ada Aktivitas Tugas pada Rentang Waktu Ini
            </h4>
            <p className="text-xs text-slate-400 max-w-sm">
              Coba reset filter pencarian atau pilih bulan lain untuk melihat riwayat aktivitas tugas di masa lalu.
            </p>
          </div>
        )}

        {/* Load More Days / Scroll Downward Indicator */}
        {hasMoreDays && (
          <div className="pt-6 text-center">
            <button
              type="button"
              onClick={() => setDisplayCount(prev => prev + 30)}
              className="px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-black shadow-xs hover:border-zinc-500 dark:hover:border-zinc-500 hover:text-zinc-900 dark:text-zinc-100 transition-all active:scale-95 inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
              <span>Muat Lebih Banyak Riwayat Hari ke Bawah ({groupedByDay.length - displayCount} hari lagi)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelineListView;
