import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ArrowLeft, Sparkles, Plus, RefreshCw, CheckCircle2, Clock, 
  AlertTriangle, Calendar, List, Play, CheckSquare, X, ChevronRight,
  Search, Trash2, Edit3, Building, Tag, ChevronDown, Check, Filter
} from 'lucide-react';
import { Task, TaskLog, TaskStatus, TaskPriority } from '../../../task/types';
import { supabaseService } from '../../../task/services/supabaseService';

interface PancaEngineerTasksViewProps {
  currentUser: {
    username: string;
    role: string;
    nama: string;
  };
  onBack: () => void;
}

interface DailyAIAdvice {
  date: string;
  headline: string;
  recommendations: string[];
  priorityTaskTitle?: string;
  totalActiveCount: number;
}

const STATUS_COLORS_MAP: Record<TaskStatus, { bg: string; text: string; border: string }> = {
  'Selesai': {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800'
  },
  'Proses': {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800'
  },
  'Ulang': {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800'
  },
  'Belum Mulai': {
    bg: 'bg-slate-100 dark:bg-zinc-800',
    text: 'text-slate-600 dark:text-zinc-400',
    border: 'border-slate-200 dark:border-zinc-700'
  }
};

const PRIORITY_BADGE_MAP: Record<TaskPriority, { bg: string; text: string }> = {
  'High': { bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-600 dark:text-rose-400' },
  'Medium': { bg: 'bg-slate-100 dark:bg-zinc-800', text: 'text-slate-600 dark:text-zinc-400' },
  'Low': { bg: 'bg-slate-50 dark:bg-zinc-850', text: 'text-slate-500 dark:text-zinc-500' }
};

interface MobileTimelineEntry {
  task: Task;
  log: TaskLog | null;
  logIndex: number;
  date: Date;
  dateKey: string;
  timeStr: string;
  progress: number;
  status: TaskStatus;
  description: string;
}

export const PancaEngineerTasksView: React.FC<PancaEngineerTasksViewProps> = ({
  currentUser,
  onBack
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  
  // Default view starts with "timeline" as instructed
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [monthFilter, setMonthFilter] = useState<string>('All');

  // Modals & Menus
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isContinueModalOpen, setIsContinueModalOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  // Form State for Create/Edit Modal
  const [formTitle, setFormTitle] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formJobType, setFormJobType] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('Medium');
  const [formStatus, setFormStatus] = useState<TaskStatus>('Proses');
  const [formProgress, setFormProgress] = useState<number>(0);
  const [formDescription, setFormDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 24-Hour AI Daily Advice state
  const [dailyAdvice, setDailyAdvice] = useState<DailyAIAdvice | null>(null);
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState<boolean>(false);

  const username = currentUser?.username || 'engineer';
  const fullName = currentUser?.nama || currentUser?.username || 'Engineer';

  // 1. Fetch user tasks
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const uname = username.toLowerCase() === 'evan' ? 'Evan' : username;
      const fetchedTasks = await supabaseService.getTasks(
        { username: uname, role: currentUser?.role || 'engineer' },
        false
      );
      setTasks(fetchedTasks || []);
    } catch (err) {
      console.error('Error loading engineer tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [username, currentUser?.role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 2. 24-Hour AI Daily Advice Generator & Cache
  const generateOrGetDailyAdvice = useCallback((taskList: Task[], forceRefresh: boolean = false) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const cacheKey = `mypanca_engineer_daily_ai_${username}_${todayStr}`;

    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.date === todayStr && Array.isArray(parsed.recommendations)) {
            setDailyAdvice(parsed);
            return;
          }
        }
      } catch (e) {
        console.warn('Error reading AI advice cache:', e);
      }
    }

    setIsGeneratingAdvice(true);

    const activeTasks = taskList.filter(t => t.status !== 'Selesai');
    const urgentTasks = activeTasks.filter(t => t.priority === 'High');
    const inProgressTasks = activeTasks.filter(t => t.status === 'Proses');
    const reviewTasks = activeTasks.filter(t => t.status === 'Ulang');

    let headline = '';
    const recommendations: string[] = [];
    let priorityTaskTitle: string | undefined = undefined;

    if (activeTasks.length === 0) {
      headline = 'Semua tugas teknis saat ini telah selesai';
      recommendations.push(
        'Lakukan pengecekan preventif sensor seismik & modul transmisi EWS klien prioritas.',
        'Pelajari dokumen SOP instalasi atau kalibrasi sensor di folder Project Database.',
        'Buka forum Q&A teknis untuk berdiskusi atau membantu kendala rekan lapangan.'
      );
    } else {
      const topTask = urgentTasks[0] || inProgressTasks[0] || activeTasks[0];
      priorityTaskTitle = topTask.title;
      headline = `Fokus Utama: ${topTask.title} (${topTask.companyName || 'Lapangan'})`;

      if (topTask.priority === 'High') {
        recommendations.push(
          `Prioritaskan tugas tinggi "${topTask.title}" di ${topTask.companyName || 'Site'}. Pastikan konektivitas dan suplai daya sensor normal.`
        );
      } else {
        recommendations.push(
          `Lanjutkan pekerjaan "${topTask.title}" (${topTask.companyName}). Selesaikan checkpoint instalasi sesuai gambar teknis.`
        );
      }

      if (reviewTasks.length > 0) {
        recommendations.push(
          `Terdapat ${reviewTasks.length} tugas memerlukan revisi ("${reviewTasks[0].title}"). Segera telusuri log kendala sebelumnya.`
        );
      } else if (inProgressTasks.length > 1) {
        recommendations.push(
          `Ada ${inProgressTasks.length} tugas aktif. Tuntaskan satu modul pengujian hingga selesai sebelum beralih ke tugas lain.`
        );
      } else {
        recommendations.push(
          `Total ${activeTasks.length} pekerjaan sedang berjalan. Siapkan peralatan ukur dan sparepart sebelum berangkat ke lokasi.`
        );
      }

      recommendations.push(
        'Catat progres persentase dan rangkuman pengujian ke dalam log sebelum jam kerja berakhir.'
      );
    }

    const newAdvice: DailyAIAdvice = {
      date: todayStr,
      headline,
      recommendations,
      priorityTaskTitle,
      totalActiveCount: activeTasks.length
    };

    try {
      localStorage.setItem(cacheKey, JSON.stringify(newAdvice));
    } catch {}

    setDailyAdvice(newAdvice);
    setIsGeneratingAdvice(false);
  }, [username]);

  useEffect(() => {
    if (tasks.length > 0 || !loading) {
      generateOrGetDailyAdvice(tasks, false);
    }
  }, [tasks, loading, generateOrGetDailyAdvice]);

  // 3. Process Timeline Entries
  const timelineEntries = useMemo(() => {
    const list: MobileTimelineEntry[] = [];

    tasks.forEach(task => {
      if (task.logs && task.logs.length > 0) {
        task.logs.forEach((log, logIdx) => {
          const d = new Date(log.date || task.endDate || task.startDate);
          const validDate = isNaN(d.getTime()) ? new Date() : d;
          const dateKey = `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}-${String(validDate.getDate()).padStart(2, '0')}`;
          const timeStr = validDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

          list.push({
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
        const d = new Date(task.startDate || task.endDate || Date.now());
        const validDate = isNaN(d.getTime()) ? new Date() : d;
        const dateKey = `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}-${String(validDate.getDate()).padStart(2, '0')}`;
        const timeStr = validDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        list.push({
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

    return list;
  }, [tasks]);

  // Extract available months
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    timelineEntries.forEach(item => {
      const monthYear = item.date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      set.add(monthYear);
    });
    return Array.from(set);
  }, [timelineEntries]);

  // Filtered timeline entries
  const filteredTimeline = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return timelineEntries.filter(item => {
      const matchSearch = !q ||
        item.task.title.toLowerCase().includes(q) ||
        item.task.companyName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'All' || item.status === statusFilter;

      const itemMonth = item.date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const matchMonth = monthFilter === 'All' || itemMonth === monthFilter;

      return matchSearch && matchStatus && matchMonth;
    });
  }, [timelineEntries, searchQuery, statusFilter, monthFilter]);

  // Group timeline by date (newest first)
  const groupedTimeline = useMemo(() => {
    const groups: { [dateKey: string]: { date: Date; items: MobileTimelineEntry[] } } = {};

    filteredTimeline.forEach(item => {
      if (!groups[item.dateKey]) {
        groups[item.dateKey] = {
          date: item.date,
          items: []
        };
      }
      groups[item.dateKey].items.push(item);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedKeys.map(key => ({
      dateKey: key,
      date: groups[key].date,
      items: groups[key].items.sort((a, b) => b.date.getTime() - a.date.getTime())
    }));
  }, [filteredTimeline]);

  // Filtered List View
  const filteredListTasks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tasks.filter(t => {
      const matchSearch = !q ||
        t.title.toLowerCase().includes(q) ||
        t.companyName.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'All' || t.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [tasks, searchQuery, statusFilter]);

  // Unfinished tasks for continue modal
  const unfinishedTasks = useMemo(() => {
    return tasks.filter(t => t.status !== 'Selesai');
  }, [tasks]);

  // 4. Open Modal for Create or Edit
  const handleOpenCreateModal = () => {
    setEditingTask(null);
    setFormTitle('');
    setFormCompany('');
    setFormJobType('');
    setFormPriority('Medium');
    setFormStatus('Proses');
    setFormProgress(0);
    setFormDescription('');
    setIsAddMenuOpen(false);
    setIsTaskModalOpen(true);
  };

  const handleOpenEditModal = (task: Task, logIdx?: number) => {
    setEditingTask(task);
    setFormTitle(task.title || '');
    setFormCompany(task.companyName || '');
    setFormJobType(task.jobType || '');
    setFormPriority(task.priority || 'Medium');

    const activeLog = typeof logIdx === 'number' && logIdx >= 0 && task.logs && task.logs[logIdx]
      ? task.logs[logIdx]
      : (task.logs && task.logs.length > 0 ? task.logs[task.logs.length - 1] : null);

    setFormStatus(activeLog?.status || task.status || 'Proses');
    setFormProgress(activeLog?.progress ?? task.progress ?? 0);
    setFormDescription(activeLog?.description || '');
    setIsTaskModalOpen(true);
  };

  // 5. Save Task (Create or Update)
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Judul tugas wajib diisi.');
      return;
    }

    setIsSaving(true);
    const nowIso = new Date().toISOString();

    try {
      if (editingTask) {
        // Update existing task
        const updatedTask: Task = {
          ...editingTask,
          title: formTitle.trim(),
          companyName: formCompany.trim() || 'Umum',
          jobType: formJobType.trim(),
          priority: formPriority,
          status: formStatus,
          progress: formProgress,
          endDate: nowIso,
          logs: [
            ...(editingTask.logs || []),
            {
              status: formStatus,
              progress: formProgress,
              date: nowIso,
              description: formDescription.trim() || `Update status ke ${formStatus} (${formProgress}%)`
            }
          ]
        };
        await supabaseService.saveTask(updatedTask, editingTask.owner || username);
      } else {
        // Create new task
        const newTask: Task = {
          id: `task_${Date.now()}`,
          title: formTitle.trim(),
          companyName: formCompany.trim() || 'Panca Prima Wijaya',
          jobType: formJobType.trim() || 'Teknis',
          priority: formPriority,
          employeeName: fullName,
          category: 'Engineering',
          color: '#2563eb',
          startDate: nowIso,
          endDate: nowIso,
          status: formStatus,
          progress: formProgress,
          owner: username,
          collaborators: [],
          pendingCollaborators: [],
          logs: [
            {
              status: formStatus,
              progress: formProgress,
              date: nowIso,
              description: formDescription.trim() || 'Tugas baru dibuat'
            }
          ]
        };
        await supabaseService.saveTask(newTask, username);
      }

      await loadData();
      setIsTaskModalOpen(false);
      setEditingTask(null);
    } catch (err) {
      console.error('Save task error:', err);
      alert('Gagal menyimpan tugas.');
    } finally {
      setIsSaving(false);
    }
  };

  // 6. Delete Task
  const handleDeleteTask = async (taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Apakah Anda yakin ingin menghapus tugas ini secara permanen?')) return;
    setIsSyncing(true);
    try {
      await supabaseService.deleteTask(taskId);
      await loadData();
    } catch (err) {
      console.error('Delete task error:', err);
      alert('Gagal menghapus tugas.');
    } finally {
      setIsSyncing(false);
    }
  };

  // 7. Continue Unfinished Task
  const handleContinueTask = (task: Task) => {
    setIsContinueModalOpen(false);
    setEditingTask(task);
    setFormTitle(task.title || '');
    setFormCompany(task.companyName || '');
    setFormJobType(task.jobType || '');
    setFormPriority(task.priority || 'Medium');
    setFormStatus('Proses');
    setFormProgress(task.progress ?? 50);
    setFormDescription(`Melanjutkan tugas hari ini (${new Date().toLocaleDateString('id-ID')})`);
    setIsTaskModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#fafafa] dark:bg-zinc-950 font-sans overflow-hidden select-none">
      
      {/* 1. Header Bar matching /app design */}
      <div className="bg-white dark:bg-zinc-900 px-4 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between shadow-xs shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={onBack} 
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-300 transition active:scale-95 hover:bg-slate-200 dark:hover:bg-zinc-700"
            title="Kembali ke Beranda"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-black text-xs shadow-xs">
            <CheckSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-zinc-100 leading-tight">
              Tugas Engineer
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-zinc-400">
              {fullName} • {tasks.length} total pekerjaan
            </p>
          </div>
        </div>

        {/* Sync / Refresh Button */}
        <button
          onClick={loadData}
          disabled={loading || isSyncing}
          className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center text-slate-600 dark:text-zinc-300 transition active:scale-95 disabled:opacity-50"
          title="Sinkronisasi data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || isSyncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 2. Scrollable Body Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3.5">
        
        {/* === 24-HOUR AI DAILY ADVICE BANNER === */}
        <div className="relative rounded-2xl p-4 bg-gradient-to-br from-slate-900 via-zinc-900 to-slate-800 text-white shadow-xs border border-slate-800 overflow-hidden">
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-28 h-28 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
          
          <div className="relative z-10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-xs border border-white/15 text-[10px] font-bold text-zinc-200">
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Saran Singkat AI • 24 Jam</span>
              </div>

              <button
                onClick={() => generateOrGetDailyAdvice(tasks, true)}
                className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition active:scale-95"
                title="Perbarui Analisa AI"
              >
                <RefreshCw className={`w-3 h-3 ${isGeneratingAdvice ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div>
              <h4 className="text-xs font-bold text-white tracking-tight leading-snug">
                {dailyAdvice?.headline || 'Menganalisis tugas engineer hari ini...'}
              </h4>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Berdasarkan {dailyAdvice?.totalActiveCount ?? unfinishedTasks.length} tugas aktif kamu.
              </p>
            </div>

            <div className="space-y-1.5 pt-0.5">
              {dailyAdvice?.recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-white/5 border border-white/10 rounded-xl p-2 text-[11px] text-zinc-200 leading-relaxed">
                  <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold text-amber-300">
                    {idx + 1}
                  </div>
                  <span className="flex-1">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* === TAB SWITCHER & ACTION BUTTON === */}
        <div className="flex items-center justify-between gap-2">
          {/* Tab Pill Switcher */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl border border-slate-200/80 dark:border-zinc-700/80">
            <button
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all active:scale-95 ${
                viewMode === 'timeline'
                  ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white font-bold shadow-2xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white font-medium'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Tipe Timeline</span>
            </button>
            
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all active:scale-95 ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white font-bold shadow-2xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white font-medium'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Tipe List</span>
            </button>
          </div>

          {/* Single + Tambah Tugas Dropdown Button */}
          <div className="relative">
            <button
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className="px-3 py-1.5 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900 rounded-xl text-xs font-bold shadow-2xs active:scale-95 transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Tambah Tugas</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isAddMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isAddMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsAddMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-200/90 dark:border-zinc-800 p-1.5 z-50 space-y-1 animate-fade-in">
                  <button
                    onClick={handleOpenCreateModal}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 text-left transition"
                  >
                    <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-900 dark:text-white">
                      <Plus className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold">Buat Tugas Baru</div>
                      <div className="text-[9px] text-slate-400">Input pekerjaan baru</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setIsAddMenuOpen(false);
                      setIsContinueModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 text-left transition"
                  >
                    <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-900 dark:text-white">
                      <Play className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold">Lanjutkan Tugas</div>
                      <div className="text-[9px] text-slate-400">Pilih tugas belum selesai</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* === SEARCH & FILTERS (NATIVE /app STYLE) === */}
        <div className="bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-2xs space-y-2">
          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari tugas atau perusahaan..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/80 rounded-xl text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none focus:border-slate-400 dark:focus:border-zinc-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Chips / Dropdowns */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full appearance-none pl-3 pr-7 py-1.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/80 rounded-xl text-[11px] font-semibold text-slate-700 dark:text-zinc-300 outline-none cursor-pointer"
              >
                <option value="All">Semua Status</option>
                <option value="Proses">Proses</option>
                <option value="Selesai">Selesai</option>
                <option value="Ulang">Ulang</option>
                <option value="Belum Mulai">Belum Mulai</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {viewMode === 'timeline' && availableMonths.length > 0 && (
              <div className="flex-1 relative">
                <select
                  value={monthFilter}
                  onChange={e => setMonthFilter(e.target.value)}
                  className="w-full appearance-none pl-3 pr-7 py-1.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/80 rounded-xl text-[11px] font-semibold text-slate-700 dark:text-zinc-300 outline-none cursor-pointer"
                >
                  <option value="All">Semua Periode</option>
                  {availableMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* === MAIN CONTENT: TIMELINE LIST (DEFAULT) OR LIST === */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 dark:text-zinc-500 text-xs space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-slate-400" />
            <p>Memuat daftar tugas engineer...</p>
          </div>
        ) : viewMode === 'timeline' ? (
          // ================= TIMELINE VIEW (NATIVE /app) =================
          groupedTimeline.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 p-8 text-center text-slate-400 dark:text-zinc-500 text-xs">
              Tidak ada aktivitas tugas yang sesuai dengan pencarian atau filter.
            </div>
          ) : (
            <div className="space-y-4">
              {groupedTimeline.map(group => {
                const dateLabel = group.date.toLocaleDateString('id-ID', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                });

                return (
                  <div key={group.dateKey} className="space-y-2">
                    {/* Date Header Badge */}
                    <div className="flex items-center justify-between px-1">
                      <div className="inline-flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-zinc-200">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{dateLabel}</span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-full">
                        {group.items.length} aktivitas
                      </span>
                    </div>

                    {/* Timeline Item Cards */}
                    <div className="space-y-2.5">
                      {group.items.map((item, idx) => {
                        const statusStyle = STATUS_COLORS_MAP[item.status] || STATUS_COLORS_MAP['Proses'];
                        const priorityStyle = PRIORITY_BADGE_MAP[item.task.priority] || PRIORITY_BADGE_MAP['Medium'];

                        return (
                          <div
                            key={`${item.task.id}_${item.logIndex}_${idx}`}
                            onClick={() => handleOpenEditModal(item.task, item.logIndex)}
                            className="p-3.5 bg-white dark:bg-zinc-900 hover:bg-slate-50/80 dark:hover:bg-zinc-850 border border-slate-200/90 dark:border-zinc-800 rounded-2xl shadow-2xs transition active:scale-[0.99] cursor-pointer space-y-2 group"
                          >
                            {/* Top Row: Time, Company, Status Badge */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-zinc-500 shrink-0">
                                  {item.timeStr} WIB
                                </span>
                                <span className="text-slate-300 dark:text-zinc-700">•</span>
                                <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-tight truncate">
                                  {item.task.companyName || 'Panca Prima Wijaya'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
                                  {item.status}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${priorityStyle.bg} ${priorityStyle.text}`}>
                                  {item.task.priority}
                                </span>
                              </div>
                            </div>

                            {/* Task Title */}
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {item.task.title}
                              </h4>
                              {item.description && (
                                <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                                  {item.description}
                                </p>
                              )}
                            </div>

                            {/* Progress Bar & Footer */}
                            <div className="pt-1 flex items-center justify-between gap-3">
                              <div className="flex-1 flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      item.progress >= 100 
                                        ? 'bg-emerald-500' 
                                        : item.progress > 50 
                                          ? 'bg-blue-500' 
                                          : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 shrink-0">
                                  {item.progress}%
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteTask(item.task.id, e)}
                                  className="p-1 text-slate-300 hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400 transition"
                                  title="Hapus tugas"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center">
                                  Detail &gt;
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // ================= LIST VIEW (NATIVE /app) =================
          filteredListTasks.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 p-8 text-center text-slate-400 dark:text-zinc-500 text-xs">
              Tidak ada tugas yang sesuai dengan pencarian atau filter.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredListTasks.map(task => {
                const statusStyle = STATUS_COLORS_MAP[task.status] || STATUS_COLORS_MAP['Proses'];
                const priorityStyle = PRIORITY_BADGE_MAP[task.priority] || PRIORITY_BADGE_MAP['Medium'];
                const progress = task.progress ?? (task.status === 'Selesai' ? 100 : 0);

                return (
                  <div
                    key={task.id}
                    onClick={() => handleOpenEditModal(task)}
                    className="p-3.5 bg-white dark:bg-zinc-900 hover:bg-slate-50/80 dark:hover:bg-zinc-850 border border-slate-200/90 dark:border-zinc-800 rounded-2xl shadow-2xs transition active:scale-[0.99] cursor-pointer space-y-2 group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-tight truncate">
                          {task.companyName || 'Panca Prima Wijaya'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
                          {task.status}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${priorityStyle.bg} ${priorityStyle.text}`}>
                          {task.priority}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {task.title}
                      </h4>
                      {task.jobType && (
                        <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                          Kategori: {task.jobType}
                        </p>
                      )}
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-3">
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              progress >= 100 
                                ? 'bg-emerald-500' 
                                : progress > 50 
                                  ? 'bg-blue-500' 
                                  : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 shrink-0">
                          {progress}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTask(task.id, e)}
                          className="p-1 text-slate-300 hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400 transition"
                          title="Hapus tugas"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center">
                          Detail &gt;
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* 3. Modal Create / Edit Task (Mobile Native /app) */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[88vh] animate-fade-in">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-900">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-bold text-xs">
                  {editingTask ? <Edit3 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    {editingTask ? 'Update Progres Tugas' : 'Buat Tugas Baru'}
                  </h4>
                  <p className="text-[9px] text-slate-400">
                    {editingTask ? 'Perbarui status dan log aktivitas' : 'Tambah penugasan teknis baru'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveForm} className="p-5 overflow-y-auto space-y-3.5 flex-1">
              {/* Judul Tugas */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
                  Judul Tugas *
                </label>
                <input
                  required
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Misal: Kalibrasi sensor gempa Palu"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-slate-400"
                />
              </div>

              {/* Perusahaan & Job Type */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
                    Perusahaan / Site
                  </label>
                  <input
                    type="text"
                    value={formCompany}
                    onChange={e => setFormCompany(e.target.value)}
                    placeholder="PT Hisamitsu"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
                    Jenis Pekerjaan
                  </label>
                  <input
                    type="text"
                    value={formJobType}
                    onChange={e => setFormJobType(e.target.value)}
                    placeholder="Wiring SLD / EWS"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Status & Priority */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={e => {
                      const val = e.target.value as TaskStatus;
                      setFormStatus(val);
                      if (val === 'Selesai') setFormProgress(100);
                      else if (val === 'Belum Mulai') setFormProgress(0);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none font-bold"
                  >
                    <option value="Proses">Proses</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Ulang">Ulang</option>
                    <option value="Belum Mulai">Belum Mulai</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
                    Prioritas
                  </label>
                  <select
                    value={formPriority}
                    onChange={e => setFormPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none font-bold"
                  >
                    <option value="High">High (Tinggi)</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low (Rendah)</option>
                  </select>
                </div>
              </div>

              {/* Progress Slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                    Progress Pengerjaan
                  </label>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {formProgress}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={formProgress}
                  onChange={e => {
                    const p = Number(e.target.value);
                    setFormProgress(p);
                    if (p === 100) setFormStatus('Selesai');
                    else if (p > 0 && formStatus === 'Belum Mulai') setFormStatus('Proses');
                  }}
                  className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-lg"
                />
              </div>

              {/* Catatan / Log Aktivitas */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
                  Catatan Progres Hari Ini
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Deskripsi langkah kerja atau kendala lapangan..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-slate-400 resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-zinc-700 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900 font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Tugas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Continue Unfinished Task Modal (Mobile Native /app) */}
      {isContinueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[80vh] animate-fade-in">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-900">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-bold text-xs">
                  <Play className="w-3.5 h-3.5 ml-0.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Lanjutkan Tugas Belum Selesai
                  </h4>
                  <p className="text-[9px] text-slate-400">
                    Pilih pekerjaan aktif untuk dilanjutkan hari ini
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsContinueModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* List of unfinished tasks */}
            <div className="p-3.5 overflow-y-auto space-y-2 flex-1">
              {unfinishedTasks.length === 0 ? (
                <div className="py-10 text-center text-slate-400 dark:text-zinc-500 text-xs">
                  Tidak ada tugas yang berstatus belum selesai.
                </div>
              ) : (
                unfinishedTasks.map(task => {
                  const statusStyle = STATUS_COLORS_MAP[task.status] || STATUS_COLORS_MAP['Proses'];

                  return (
                    <div
                      key={task.id}
                      onClick={() => handleContinueTask(task)}
                      className="p-3 rounded-2xl border border-slate-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition flex items-center justify-between gap-3 cursor-pointer group shadow-2xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-bold text-slate-400 truncate">
                            {task.companyName || 'Umum'}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                            {task.status}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {task.title}
                        </h5>
                      </div>

                      <button
                        type="button"
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900 text-[10px] font-bold transition shrink-0"
                      >
                        Lanjut &gt;
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
