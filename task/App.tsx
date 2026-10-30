
import React, { useState, useEffect, useMemo } from 'react';
import { Task, TaskLog, CalendarViewType, Project, QAQuestion, QAAnswer } from './types';
import CalendarHeader from './components/CalendarHeader';
import MonthView from './components/MonthView';
import WeekView from './components/WeekView';
import DayView from './components/DayView';
import ListView from './components/ListView';
import TaskCard from './components/TaskCard';
import TaskModal from './components/TaskModal';
import DayTaskPicker from './components/DayTaskPicker';
import AnalyticsView from './components/AnalyticsView';
import AboutModal from './components/AboutModal';
import { supabaseService } from './services/supabaseService';
import { DriveView } from './components/DriveView';
import { SharedPostView } from './components/SharedPostView';
import { ProjectView } from './components/ProjectView';
import { QAView } from './components/QAView';
import TimelineListView from './components/TimelineListView';


export interface ExternalUser {
  username: string;
  role: string;
  nama: string;
}

interface AppProps {
  externalUser?: ExternalUser;
  onBack?: () => void;
}

interface UserSession {
  username: string;
  role: string;
  name: string;
}

interface Notification {
  id: string;
  type?: 'invitation' | 'info';
  taskId?: string;
  title: string;
  date: string;
  priority: string;
  message: string;
  read: boolean;
}

const App: React.FC<AppProps> = ({ externalUser, onBack }) => {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => {
    if (externalUser) {
      const uname = externalUser.username.toLowerCase() === 'evan' ? 'Evan' : externalUser.username.toLowerCase();
      const extRole = String(externalUser.role || '').toLowerCase();
      const resolvedRole = extRole === 'superadmin' || extRole.includes('admin')
        ? 'superadmin'
        : (extRole === 'hr' || extRole === 'hrd')
        ? 'hr'
        : extRole || 'user';
      return {
        username: uname,
        role: resolvedRole,
        name: externalUser.nama || externalUser.username
      };
    }
    try {
      const saved = localStorage.getItem('mypanca_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.username && parsed.role) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Gagal memuat sesi tersimpan:', e);
    }
    return null;
  });

  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [shareDriveToken, setShareDriveToken] = useState<string | null>(null);

  useEffect(() => {
    if (externalUser) {
      const uname = externalUser.username.toLowerCase() === 'evan' ? 'Evan' : externalUser.username.toLowerCase();
      const extRole = String(externalUser.role || '').toLowerCase();
      const resolvedRole = extRole === 'superadmin' || extRole.includes('admin')
        ? 'superadmin'
        : (extRole === 'hr' || extRole === 'hrd')
        ? 'hr'
        : extRole || 'user';
      setCurrentUser({
        username: uname,
        role: resolvedRole,
        name: externalUser.nama || externalUser.username
      });
    }
  }, [externalUser]);

  const isSuperAdminOrHR = useMemo(() => {
    if (!currentUser) return false;
    const r = String(currentUser.role || '').toLowerCase();
    const u = String(currentUser.username || '').toLowerCase();
    return r === 'superadmin' || r === 'hr' || r === 'hrd' || r.includes('admin') || u === 'superadmin';
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('mypanca_session', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('mypanca_session');
    }
  }, [currentUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('shareDrive');
    if (token) {
      setShareDriveToken(token);
    }
  }, []);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [qaQuestions, setQaQuestions] = useState<QAQuestion[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewType | 'analytics' | 'users' | 'assign' | 'tracking' | 'messages' | 'drive' | 'project' | 'qa'>('analytics'); 
  const [assignSubView, setAssignSubView] = useState<CalendarViewType>('month');
  const [trackingViewMode, setTrackingViewMode] = useState<'calendar' | 'list' | 'timeline'>('calendar');
  const [trackingCalendarSubView, setTrackingCalendarSubView] = useState<CalendarViewType>('month');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedLogIndex, setSelectedLogIndex] = useState<number>(-1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false);
  const [dayPickerDate, setDayPickerDate] = useState<Date | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isMenuDropdownOpen, setIsMenuDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', name: '' });
  const [editingUser, setEditingUser] = useState<{ username: string; name: string; role: string; password: string } | null>(null);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [targetUser, setTargetUser] = useState<string>('');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [targetUserTasks, setTargetUserTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'calendar' | 'timeline'>('list');
  const [taskCalendarSubView, setTaskCalendarSubView] = useState<CalendarViewType>('month');
  const [isAddTaskMenuOpen, setIsAddTaskMenuOpen] = useState(false);
  const [isContinueTaskModalOpen, setIsContinueTaskModalOpen] = useState(false);

  const [stickyNote, setStickyNote] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);

  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastData, setBroadcastData] = useState({ recipient: 'all', title: '', message: '', priority: 'Medium' });

  useEffect(() => {
    if (currentUser) {
      fetchData();
      fetchNotifs();
      fetchSticky();
      fetchUsers();
      fetchProjects();
      fetchQAQuestions();
    }
  }, [currentUser]);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  const fetchNotifs = async () => {
    if (!currentUser) return;
    const data = await supabaseService.getNotifications(currentUser.username);
    setNotifications(data);
  };

  const fetchSticky = async () => {
    if (!currentUser) return;
    const content = await supabaseService.getStickyNote(currentUser.username);
    setStickyNote(content);
  };

  const saveStickyNote = async (val: string) => {
    if (!currentUser) return;
    setStickyNote(val);
    await supabaseService.saveStickyNote(currentUser.username, val);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await supabaseService.authenticate(loginData.username, loginData.password);
      if (res.success) {
        setCurrentUser(res.user);
      } else {
        setLoginError(res.message || 'Login gagal');
      }
    } catch (err) {
      setLoginError('Koneksi ke database gagal.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const fetchData = async () => {
    if (!currentUser) return;
    setIsSyncing(true);
    try {
      // isTrackingView = false karena ini untuk view utama (Kalender/Dashboard)
      const data = await supabaseService.getTasks(currentUser, false);
      setTasks(data);
    } catch (error) {
      console.error('Fetch tasks failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchUsers = async () => {
    const data = await supabaseService.getUsers();
    setAllUsers(data);
  };

  const fetchProjects = async () => {
    try {
      const data = await supabaseService.getProjects();
      setProjects(data);
    } catch (e) {
      console.error('Fetch projects failed:', e);
    }
  };

  const handleSaveProject = async (projectToSave: Project) => {
    setIsSyncing(true);
    try {
      const updatedList = await supabaseService.saveProject(projectToSave);
      setProjects(updatedList);
    } catch (e) {
      console.error('Save project failed:', e);
      alert('Gagal menyimpan project.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data project ini?')) return;
    setIsSyncing(true);
    try {
      const updatedList = await supabaseService.deleteProject(projectId);
      setProjects(updatedList);
    } catch (e) {
      console.error('Delete project failed:', e);
      alert('Gagal menghapus project.');
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchQAQuestions = async () => {
    try {
      const data = await supabaseService.getQAQuestions();
      setQaQuestions(data);
    } catch (e) {
      console.error('Fetch QA questions failed:', e);
    }
  };

  const handleCreateQAQuestion = async (q: QAQuestion) => {
    setIsSyncing(true);
    try {
      const updated = await supabaseService.createQAQuestion(q);
      setQaQuestions(updated);
    } catch (e) {
      console.error('Create QA question failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateQAAnswer = async (ans: QAAnswer) => {
    setIsSyncing(true);
    try {
      const updated = await supabaseService.createQAAnswer(ans);
      setQaQuestions(updated);
    } catch (e) {
      console.error('Create QA answer failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateQAQuestion = async (q: QAQuestion) => {
    setIsSyncing(true);
    try {
      const updated = await supabaseService.updateQAQuestion(q);
      setQaQuestions(updated);
    } catch (e) {
      console.error('Update QA question failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateQAAnswer = async (ans: QAAnswer) => {
    setIsSyncing(true);
    try {
      const updated = await supabaseService.updateQAAnswer(ans);
      setQaQuestions(updated);
    } catch (e) {
      console.error('Update QA answer failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteQAAnswer = async (ansId: string, qId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus jawaban ini?')) return;
    setIsSyncing(true);
    try {
      const updated = await supabaseService.deleteQAAnswer(ansId, qId);
      setQaQuestions(updated);
    } catch (e) {
      console.error('Delete QA answer failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteQAQuestion = async (qId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus pertanyaan ini?')) return;
    setIsSyncing(true);
    try {
      const updated = await supabaseService.deleteQAQuestion(qId);
      setQaQuestions(updated);
    } catch (e) {
      console.error('Delete QA question failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchTargetTasks = async (username: string) => {
    setIsSyncing(true);
    try {
      // isTrackingView = true karena kita ingin melihat semua tugas user target (bukan milik kita sendiri)
      const data = await supabaseService.getTasks({ username, role: 'user' }, true);
      setTargetUserTasks(data);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleAssignee = (username: string) => {
    setSelectedAssignees(prev => 
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
    setTargetUser(username);
    fetchTargetTasks(username);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    await supabaseService.addUser(newUser);
    setNewUser({ username: '', password: '', role: 'user', name: '' });
    await fetchUsers();
    setIsSyncing(false);
  };

  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  const toggleShowPassword = (username: string) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [username]: !prev[username]
    }));
  };

  const handleOpenEditUser = (user: any) => {
    setEditingUser({
      username: user.username,
      name: user.name || '',
      role: user.role || 'user',
      password: user.password || ''
    });
    setIsEditUserModalOpen(true);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSyncing(true);
    try {
      await supabaseService.updateUser(editingUser.username, {
        name: editingUser.name,
        role: editingUser.role,
        password: editingUser.password
      });
      setIsEditUserModalOpen(false);
      setEditingUser(null);
      await fetchUsers();
    } catch (err) {
      console.error('Update user failed:', err);
      alert('Gagal mengupdate user.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (confirm(`Hapus user ${username}?`)) {
      setIsSyncing(true);
      await supabaseService.deleteUser(username);
      await fetchUsers();
      setIsSyncing(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus tugas ini secara permanen?')) {
      setIsSyncing(true);
      try {
        await supabaseService.deleteTask(taskId);
        await fetchData();
        if (targetUser) await fetchTargetTasks(targetUser);
      } catch (e) {
        console.error('Delete task error:', e);
        alert('Gagal menghapus tugas.');
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleSaveTask = async (updatedTask: Task) => {
    if (!currentUser) return;
    setIsSyncing(true);
    try {
      if (updatedTask.pendingCollaborators && updatedTask.pendingCollaborators.length > 0) {
        for (const username of updatedTask.pendingCollaborators) {
           await supabaseService.sendNotification({
             recipient_username: username,
             type: 'invitation',
             taskId: updatedTask.id,
             title: 'Undangan Kolaborasi',
             priority: 'Medium',
             message: `${currentUser.name} mengundang Anda untuk berkolaborasi pada: ${updatedTask.title}`
           });
        }
      }

      const isAssignmentMode = (view === 'assign' || view === 'tracking');
      
      if (isAssignmentMode && view === 'assign' && selectedAssignees.length > 0) {
        for (const username of selectedAssignees) {
          const userObj = allUsers.find(u => u.username === username);
          const taskForUser = { 
            ...updatedTask, 
            id: `task_${Date.now()}_${username}`, 
            employeeName: userObj?.name || username 
          };
          await supabaseService.saveTask(taskForUser, username);
          
          await supabaseService.sendNotification({
            recipient_username: username,
            title: 'Tugas Baru Ditugaskan',
            priority: updatedTask.priority,
            message: `Admin menugaskan Anda: ${updatedTask.title}`
          });
        }
      } else {
        await supabaseService.saveTask(updatedTask, updatedTask.owner || currentUser.username);
      }
      
      await fetchData();
      if (targetUser) await fetchTargetTasks(targetUser);
    } catch (e) {
      console.error('Save task error:', e);
      alert('Gagal menyimpan data.');
    } finally {
      setIsSyncing(false);
    }
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    await supabaseService.markNotifRead(currentUser.username);
    fetchNotifs();
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    const targets = broadcastData.recipient === 'all' 
      ? allUsers.filter(u => u.username !== 'superadmin').map(u => u.username) 
      : [broadcastData.recipient];
      
    for (const username of targets) {
      await supabaseService.sendNotification({
        recipient_username: username,
        title: broadcastData.title,
        priority: broadcastData.priority,
        message: broadcastData.message
      });
    }
    setIsBroadcastOpen(false);
    setBroadcastData({ recipient: 'all', title: '', message: '', priority: 'Medium' });
    setIsSyncing(false);
    alert('Pesan berhasil disiarkan!');
  };

  const handleOpenTask = (task: Task, logIdx: number) => {
    setSelectedTask(task);
    setSelectedLogIndex(logIdx);
    setIsModalOpen(true);
  };

  const changeDate = (amount: number) => {
    const newDate = new Date(currentDate);
    if (view === 'month' || view === 'assign') newDate.setMonth(currentDate.getMonth() + amount);
    else if (view === 'week') newDate.setDate(currentDate.getDate() + amount * 7);
    else if (view === 'day') newDate.setDate(currentDate.getDate() + amount);
    setCurrentDate(newDate);
  };

  const filteredUsers = allUsers.filter(u => u.username !== 'superadmin' && (u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.username.toLowerCase().includes(userSearch.toLowerCase())));
  const unreadCount = notifications.filter(n => !n.read).length;

  if (shareDriveToken) {
    return (
      <SharedPostView
        shareToken={shareDriveToken}
        onBackToApp={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setShareDriveToken(null);
        }}
      />
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-6">
        <div className="bg-white p-8 md:p-12 rounded-[40px] shadow-xl w-full max-w-md border border-slate-100">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100 p-2">
              <img src="https://ahlifumigasi.com/wp-content/uploads/2025/12/logopancaapp.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col gap-0.5">
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">MyPanca</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">smart task manager assistant</p>
            </div>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Username</label>
              <input required type="text" value={loginData.username} onChange={e => setLoginData({...loginData, username: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-zinc-700 dark:border-zinc-300 transition-all text-slate-800 dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Password</label>
              <input required type="password" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-zinc-700 dark:border-zinc-300 transition-all text-slate-800 dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800" />
            </div>
            {loginError && <p className="text-rose-500 text-xs font-bold text-center animate-pulse">{loginError}</p>}
            <button disabled={isLoggingIn} type="submit" className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50">
              {isLoggingIn ? 'Memvalidasi...' : 'Masuk Sekarang'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const getViewLabel = (v: string) => {
    switch (v) {
      case 'analytics': return 'Dashboard';
      case 'list':
      case 'month':
      case 'week':
      case 'day': return 'Tugas';
      case 'drive': return 'Drive';
      case 'project': return 'Project Database';
      case 'qa': return 'Q&A Forum';
      case 'assign': return 'Kirim Tugas';
      case 'tracking': return 'Tracking Tugas';
      case 'users': return 'User';
      case 'messages': return 'Pesan';
      default: return 'Dashboard';
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#F0F2F5]'}`}>
      {/* Top Header Navigation Bar */}
      <header className="sticky top-0 z-[150] bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xs px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
          {/* Left: Brand Logo & Menu Navigation Dropdown */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-3 shrink-0">
              <img src="https://ahlifumigasi.com/wp-content/uploads/2025/12/logopancaapp.png" alt="Logo" className="w-9 h-9 object-contain" />
              <div className="hidden sm:flex flex-col leading-none">
                <h1 className="text-base font-black text-slate-800 dark:text-white tracking-tight">MyPanca</h1>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">smart assistant</p>
              </div>
            </div>

            {/* Menu Dropdown Navigation Button */}
            <div className="relative">
              <button
                onClick={() => setIsMenuDropdownOpen(!isMenuDropdownOpen)}
                className="flex items-center gap-2.5 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 dark:hover:bg-zinc-800 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 dark:text-zinc-700 dark:text-zinc-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border border-zinc-200 dark:border-zinc-700 active:scale-95 shadow-xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
                <span>Menu: {getViewLabel(view)}</span>
                <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isMenuDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
              </button>

              {/* Menu Dropdown Panel */}
              {isMenuDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-[190]" onClick={() => setIsMenuDropdownOpen(false)} />
                  <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2.5 z-[200] animate-fade-in space-y-1 max-h-[80vh] overflow-y-auto">
                    <div className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 mb-1">
                      Pilih Menu Aplikasi
                    </div>

                    <button
                      onClick={() => { setView('analytics'); setIsMenuDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === 'analytics' ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                      <span>Dashboard</span>
                    </button>

                    <button
                      onClick={() => { setView('list'); setIsMenuDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${['list', 'month', 'week', 'day'].includes(view) ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>
                      <span>Tugas</span>
                    </button>

                    <button
                      onClick={() => { setView('drive'); setIsMenuDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === 'drive' ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                      <span>Drive</span>
                    </button>

                    <button
                      onClick={() => { setView('project'); setIsMenuDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === 'project' ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      <span>Project Database</span>
                    </button>

                    <button
                      onClick={() => { setView('qa'); setIsMenuDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === 'qa' ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.38 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.38 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                      <span>Q&A Forum</span>
                    </button>

                    {isSuperAdminOrHR && (
                      <>
                        <div className="px-3 pt-2 pb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-100 dark:border-slate-800 mt-2">
                          Menu Superadmin & HR
                        </div>
                        <button
                          onClick={() => { setView('assign'); setIsMenuDropdownOpen(false); }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === 'assign' ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                          <span>Kirim Tugas</span>
                        </button>
                        <button
                          onClick={() => { setView('tracking'); setIsMenuDropdownOpen(false); }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === 'tracking' ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v4l2 2"/></svg>
                          <span>Tracking Tugas</span>
                        </button>
                        <button
                          onClick={() => { setView('users'); setIsMenuDropdownOpen(false); }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === 'users' ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 1 0 7.75"/></svg>
                          <span>User Management</span>
                        </button>
                      </>
                    )}

                    <div className="px-3 pt-2 pb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-100 dark:border-slate-800 mt-2">
                      Lainnya
                    </div>

                    <button
                      onClick={() => { setView('messages'); setIsMenuDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === 'messages' ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span>Pesan</span>
                      {unreadCount > 0 && (
                        <span className="ml-auto px-2 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => { setIsAboutOpen(true); setIsMenuDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                      <span>Tentang Aplikasi</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: Quick Messages & User Profile Dropdown */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('messages')}
              className={`p-2.5 rounded-2xl border transition-all relative ${view === 'messages' ? 'bg-zinc-100 dark:bg-zinc-800/60 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}
              title="Kotak Masuk Pesan"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white animate-pulse" />
              )}
            </button>

            <div className="relative">
              <button
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center gap-2.5 p-1.5 pr-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl border border-slate-200 dark:border-slate-700 transition-all active:scale-95"
              >
                <div className="w-8 h-8 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white font-black flex items-center justify-center text-xs shadow-xs shrink-0">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="hidden sm:flex flex-col text-left leading-tight">
                  <span className="text-xs font-bold text-slate-800 dark:text-white truncate max-w-[120px]">{currentUser.name}</span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase">{currentUser.role}</span>
                </div>
                <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isUserDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
              </button>

              {isUserDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-[190]" onClick={() => setIsUserDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-[200] animate-fade-in space-y-1">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                      <p className="text-xs font-bold text-slate-800 dark:text-white">{currentUser.name}</p>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">@{currentUser.username} • {currentUser.role}</p>
                    </div>

                    <button
                      onClick={() => { 
                        if (externalUser && onBack) {
                          onBack();
                        } else {
                          localStorage.removeItem('mypanca_session');
                          setCurrentUser(null);
                        }
                        setIsUserDropdownOpen(false); 
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      <span>{externalUser && externalUser.role !== 'engineer' ? 'Kembali ke CRM' : 'Keluar / Logout'}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-8 py-6 sm:py-8 flex flex-col gap-6 relative">
        {isSyncing && (
          <div className="fixed top-6 right-6 z-[300] bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-100 shadow-lg flex items-center gap-3 animate-fade-in">
             <div className="w-4 h-4 border-2 border-zinc-900 dark:border-zinc-100 border-t-transparent rounded-full animate-spin"></div>
             <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sinkronisasi Database...</span>
          </div>
        )}

        <section className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full">
           <div><h2 className="text-3xl lg:text-4xl font-black text-slate-800 dark:text-white tracking-tight">Halo, {currentUser.name}!</h2></div>
           <button onClick={() => setIsNoteOpen(true)} className="flex items-center gap-4 bg-amber-50/90 hover:bg-amber-100/80 p-2.5 pr-5 rounded-2xl border border-amber-200/80 shadow-xs transition-all group active:scale-95 shrink-0">
             <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center text-white shadow-sm group-hover:rotate-12 transition-transform shrink-0"><svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg></div>
             <div className="text-left"><p className="text-[11px] font-black text-amber-900 uppercase tracking-wider">Stickynote Pribadi</p></div>
           </button>
        </section>

        {isNoteOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-[#FFF9E5] dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl border border-amber-200 overflow-hidden animate-fade-in">
               <div className="p-8 pb-4 flex justify-between items-center border-b border-amber-100"><h3 className="text-lg font-black text-amber-900 dark:text-white uppercase tracking-widest">Stickynote</h3><button onClick={() => setIsNoteOpen(false)} className="text-amber-400 hover:text-amber-600"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
               <div className="p-8"><textarea value={stickyNote} onChange={(e) => saveStickyNote(e.target.value)} className="w-full h-80 bg-transparent text-amber-900 dark:text-slate-200 outline-none resize-none font-medium placeholder:text-amber-200" placeholder="Tulis catatan harian Anda di sini..." /></div>
            </div>
          </div>
        )}

        {isBroadcastOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
             <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
                <form onSubmit={handleSendBroadcast}>
                  <div className="p-8 pb-4 border-b border-slate-100 flex justify-between items-center"><h3 className="text-xl font-black text-slate-800 dark:text-white tracking-widest uppercase">Kirim Notifikasi</h3><button type="button" onClick={() => setIsBroadcastOpen(false)} className="text-slate-400 hover:text-slate-600"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
                  <div className="p-8 space-y-6">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Penerima</label><select required value={broadcastData.recipient} onChange={e => setBroadcastData({...broadcastData, recipient: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white dark:bg-slate-950 dark:border-slate-800"><option value="all">Semua User</option>{allUsers.filter(u => u.username !== 'superadmin').map(u => (<option key={u.username} value={u.username}>{u.name} (@{u.username})</option>))}</select></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Isi Pesan</label><textarea required value={broadcastData.message} onChange={e => setBroadcastData({...broadcastData, message: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm h-32 text-slate-800 dark:text-white dark:bg-slate-950 dark:border-slate-800" /></div>
                  </div>
                  <div className="p-8 pt-0"><button type="submit" className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white font-black rounded-2xl shadow-xl hover:bg-zinc-800 dark:bg-zinc-200 active:scale-95 transition-all">Kirim Sekarang</button></div>
                </form>
             </div>
          </div>
        )}

        <section className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 flex-1 flex flex-col overflow-hidden min-h-[600px] shadow-sm mb-10 w-full">
           {view === 'drive' && (
             <DriveView currentUser={currentUser} />
           )}

           {view === 'project' && (
             <ProjectView
               currentUser={currentUser}
               projects={projects}
               onSaveProject={handleSaveProject}
               onDeleteProject={handleDeleteProject}
             />
           )}

           {view === 'qa' && (
             <QAView
               currentUser={currentUser}
               questions={qaQuestions}
               onCreateQuestion={handleCreateQAQuestion}
               onUpdateQuestion={handleUpdateQAQuestion}
               onCreateAnswer={handleCreateQAAnswer}
               onUpdateAnswer={handleUpdateQAAnswer}
               onDeleteQuestion={handleDeleteQAQuestion}
               onDeleteAnswer={handleDeleteQAAnswer}
             />
           )}

           {view === 'messages' && (
             <div className="p-6 lg:p-10 animate-fade-in flex flex-col h-full">
                <div className="flex justify-between items-center mb-10">
                   <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Kotak Masuk</h3>
                   <div className="flex gap-4">
                     {isSuperAdminOrHR && <button onClick={() => setIsBroadcastOpen(true)} className="px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">Broadcast</button>}
                     <button onClick={markAllAsRead} className="px-6 py-3 bg-slate-100 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Tandai Dibaca</button>
                   </div>
                </div>
                <div className="space-y-4 overflow-y-auto max-h-[60vh] no-scrollbar">
                   {notifications.length === 0 ? <div className="py-20 text-center text-slate-300 font-bold uppercase tracking-widest text-xs">Belum ada pesan masuk</div> : notifications.map(n => (
                     <div key={n.id} className={`p-6 rounded-[24px] border transition-all ${n.read ? 'bg-white opacity-60' : 'bg-zinc-100/50 dark:bg-zinc-800/30 border-zinc-200 dark:border-zinc-800 shadow-sm'}`}>
                        <div className="flex justify-between items-start mb-2"><div className="flex items-center gap-2">{!n.read && <span className="w-2 h-2 bg-zinc-900 dark:bg-zinc-100 rounded-full"></span>}<span className="text-[10px] font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">{n.type === 'invitation' ? 'Undangan Kolaborasi' : 'Notifikasi'}</span></div><span className="text-[10px] font-bold text-slate-400">{new Date(n.date).toLocaleDateString()}</span></div>
                        <h4 className="text-base font-black text-slate-800 dark:text-white mb-2">{n.title}</h4><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{n.message}</p>
                     </div>
                   ))}
                </div>
             </div>
           )}

           {view === 'users' && isSuperAdminOrHR && (
             <div className="p-6 lg:p-10 animate-fade-in space-y-10">
                <div className="bg-slate-50 dark:bg-slate-950 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-widest mb-6">Tambah User Baru</h3>
                  <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <input required type="text" placeholder="Nama" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="p-3.5 bg-white border border-slate-200 rounded-xl outline-none font-bold text-sm text-slate-800 dark:text-white dark:bg-slate-900 dark:border-slate-800" />
                    <input required type="text" placeholder="Username" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="p-3.5 bg-white border border-slate-200 rounded-xl outline-none font-bold text-sm text-slate-800 dark:text-white dark:bg-slate-900 dark:border-slate-800" />
                    <input required type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="p-3.5 bg-white border border-slate-200 rounded-xl outline-none font-bold text-sm text-slate-800 dark:text-white dark:bg-slate-900 dark:border-slate-800" />
                    <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="p-3.5 bg-white border border-slate-200 rounded-xl outline-none font-bold text-sm text-slate-800 dark:text-white dark:bg-slate-900 dark:border-slate-800">
                      <option value="user">User / Standard</option>
                      <option value="engineer">Engineer</option>
                      <option value="commercial">Commercial / Sales</option>
                      <option value="finance">Finance / Admin</option>
                      <option value="hr">HR / Human Resources</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                    <button type="submit" className="bg-zinc-900 dark:bg-zinc-100 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-zinc-800 dark:bg-zinc-200 transition-all">Simpan</button>
                  </form>
                </div>
                <div className="overflow-hidden border border-slate-100 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <tr className="border-b dark:border-slate-800">
                        <th className="p-6">User</th>
                        <th className="p-6">Role</th>
                        <th className="p-6">Password</th>
                        <th className="p-6 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map(u => (
                        <tr key={u.username} className="border-b dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-6">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-white">{u.name}</p>
                              <p className="text-xs text-slate-400">@{u.username}</p>
                            </div>
                          </td>
                          <td className="p-6">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                              u.role === 'superadmin' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 dark:bg-zinc-800/70 dark:text-zinc-700 dark:text-zinc-300' :
                              u.role === 'hr' || u.role === 'hrd' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300' :
                              u.role === 'engineer' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' :
                              u.role === 'commercial' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' :
                              u.role === 'finance' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' :
                              'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="p-6">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-slate-700 dark:text-slate-300 font-bold bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 min-w-[90px] text-center inline-block">
                                {showPasswordMap[u.username] ? (u.password || '(tanpa pw)') : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleShowPassword(u.username)}
                                className="p-1.5 text-slate-400 hover:text-zinc-900 dark:text-zinc-100 dark:hover:text-zinc-600 dark:text-zinc-400 rounded-lg transition-colors"
                                title={showPasswordMap[u.username] ? 'Sembunyikan Password' : 'Lihat Password'}
                              >
                                {showPasswordMap[u.username] ? (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                ) : (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="p-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleOpenEditUser(u)} title="Edit User & Role" className="p-2 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:hover:bg-zinc-800/40 dark:bg-zinc-800/60 rounded-lg transition-colors">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              {u.username !== 'superadmin' && (
                                <button onClick={() => handleDeleteUser(u.username)} title="Hapus User" className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-lg transition-colors">
                                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </div>
           )}

           {view === 'assign' && isSuperAdminOrHR && (
             <div className="p-6 lg:p-10 animate-fade-in flex flex-col h-full">
                <div className="mb-10 flex flex-col md:flex-row justify-between items-end gap-6">
                  <div><h3 className="text-2xl font-black text-slate-800 tracking-tight">Penugasan Team</h3><p className="text-sm text-slate-400">Pilih user untuk menugaskan pekerjaan bersama.</p></div>
                  <div className="flex gap-4"><button onClick={() => setSelectedAssignees(allUsers.filter(u => u.username !== 'superadmin').map(u => u.username))} className="text-[10px] font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest hover:bg-zinc-100 dark:hover:bg-zinc-800/60 px-3 py-1.5 rounded-lg transition-all">Pilih Semua</button><button onClick={() => setSelectedAssignees([])} className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-all">Hapus Semua</button></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                   <div className="space-y-4 max-h-[500px] overflow-y-auto no-scrollbar pr-2">
                     <div className="relative mb-4"><svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="text" placeholder="Cari user..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-zinc-700 dark:border-zinc-300 text-sm font-bold transition-all text-slate-800 dark:text-white dark:bg-slate-950 dark:border-slate-800" /></div>
                     {filteredUsers.map(u => (<button key={u.username} onClick={() => toggleAssignee(u.username)} className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-95 ${selectedAssignees.includes(u.username) ? 'bg-zinc-900 dark:bg-zinc-100 text-white border-zinc-900 dark:border-zinc-100 shadow-lg' : 'bg-white border-slate-100 hover:border-slate-300'}`}><div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${selectedAssignees.includes(u.username) ? 'bg-white/20' : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100'}`}>{u.name.charAt(0)}</div><div className="text-left font-bold truncate">{u.name}</div></button>))}
                   </div>
                   <div className="lg:col-span-2">
                     {selectedAssignees.length > 0 ? (
                       <div className="space-y-8 animate-fade-in">
                         <CalendarHeader currentDate={currentDate} view={assignSubView} setView={setAssignSubView} onPrev={() => changeDate(-1)} onNext={() => changeDate(1)} onToday={() => setCurrentDate(new Date())} />
                         {assignSubView === 'month' && <MonthView currentDate={currentDate} tasks={targetUserTasks} onDateClick={(d) => { setDayPickerDate(d); setIsDayPickerOpen(true); }} onTaskClick={handleOpenTask} />}
                         {assignSubView === 'week' && <WeekView currentDate={currentDate} tasks={targetUserTasks} onDateClick={(d) => { setDayPickerDate(d); setIsDayPickerOpen(true); }} onTaskClick={handleOpenTask} />}
                         {assignSubView === 'day' && <DayView currentDate={currentDate} tasks={targetUserTasks} onDateClick={(d) => { setDayPickerDate(d); setIsDayPickerOpen(true); }} onTaskClick={handleOpenTask} />}
                         
                         <div className="flex justify-end pt-4">
                           <button onClick={() => { setSelectedTask(null); setSelectedLogIndex(-1); setDayPickerDate(new Date()); setIsModalOpen(true); }} className="px-8 py-4 bg-zinc-900 dark:bg-zinc-100 text-white font-black rounded-2xl shadow-xl hover:bg-zinc-800 dark:bg-zinc-200 transition-all active:scale-95">+ Assign Team Task</button>
                         </div>
                       </div>
                     ) : <div className="h-full flex flex-col items-center justify-center py-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-[40px] text-slate-400 font-black uppercase tracking-widest text-[10px]">Pilih user dari panel kiri untuk menugaskan pekerjaan</div>}
                   </div>
                </div>
             </div>
           )}

           {view === 'tracking' && isSuperAdminOrHR && (
             <div className="p-6 lg:p-10 animate-fade-in flex flex-col h-full space-y-8">
                {/* Header & User Selector & View Toggle */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Tracking Per User</h3>
                    <p className="text-xs font-semibold text-slate-400 mt-1">Pantau kalender dan laporan progres tugas per user secara real-time.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    {/* View Mode Toggle (Calendar vs Timeline vs List) */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                      <button
                        onClick={() => setTrackingViewMode('calendar')}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                          trackingViewMode === 'calendar' 
                            ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' 
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                        }`}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                        Kalender
                      </button>
                      <button
                        onClick={() => setTrackingViewMode('timeline')}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                          trackingViewMode === 'timeline' 
                            ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' 
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                        }`}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        Timeline List
                      </button>
                      <button
                        onClick={() => setTrackingViewMode('list')}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                          trackingViewMode === 'list' 
                            ? 'bg-zinc-900 dark:bg-zinc-100 text-white shadow-md' 
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                        }`}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>
                        Tipe List
                      </button>
                    </div>

                    {/* User Selection Dropdown */}
                    <select 
                      value={targetUser} 
                      onChange={e => { 
                        setTargetUser(e.target.value); 
                        if(e.target.value) fetchTargetTasks(e.target.value); 
                      }} 
                      className="p-3 px-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm outline-none focus:border-zinc-700 dark:border-zinc-300 transition-all shadow-xs text-slate-800 dark:text-white min-w-[240px]"
                    >
                      <option value="">-- Pilih User Untuk Track --</option>
                      {allUsers.filter(u => u.username !== 'superadmin').map(u => (
                        <option key={u.username} value={u.username}>{u.name} (@{u.username})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Content Area */}
                {targetUser ? (
                  <div className="space-y-6 flex-1">
                    {trackingViewMode === 'calendar' ? (
                      <div className="space-y-6 animate-fade-in">
                        <CalendarHeader 
                          currentDate={currentDate} 
                          view={trackingCalendarSubView} 
                          setView={setTrackingCalendarSubView} 
                          onPrev={() => changeDate(-1)} 
                          onNext={() => changeDate(1)} 
                          onToday={() => setCurrentDate(new Date())} 
                        />
                        <div className="pt-2">
                          {trackingCalendarSubView === 'month' && (
                            <MonthView currentDate={currentDate} tasks={targetUserTasks} onDateClick={(d) => { setDayPickerDate(d); setIsDayPickerOpen(true); }} onTaskClick={handleOpenTask} />
                          )}
                          {trackingCalendarSubView === 'week' && (
                            <WeekView currentDate={currentDate} tasks={targetUserTasks} onDateClick={(d) => { setDayPickerDate(d); setIsDayPickerOpen(true); }} onTaskClick={handleOpenTask} />
                          )}
                          {trackingCalendarSubView === 'day' && (
                            <DayView currentDate={currentDate} tasks={targetUserTasks} onDateClick={(d) => { setDayPickerDate(d); setIsDayPickerOpen(true); }} onTaskClick={handleOpenTask} />
                          )}
                        </div>
                      </div>
                    ) : trackingViewMode === 'timeline' ? (
                      <div className="animate-fade-in">
                        <TimelineListView 
                          tasks={targetUserTasks} 
                          onTaskClick={(t, lIdx) => handleOpenTask(t, typeof lIdx === 'number' && lIdx >= 0 ? lIdx : (t.logs ? t.logs.length - 1 : -1))}
                          onDeleteTask={handleDeleteTask}
                          showTrackingDetails={true}
                        />
                      </div>
                    ) : (
                      <div className="animate-fade-in">
                        <ListView 
                          tasks={targetUserTasks} 
                          onTaskClick={(t) => handleOpenTask(t, t.logs.length - 1)} 
                          onDeleteTask={handleDeleteTask} 
                          showTrackingDetails={true} 
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 bg-slate-50/50 dark:bg-slate-950/30 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[32px] text-center p-8">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 flex items-center justify-center mb-4 shadow-xs">
                      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <h4 className="text-base font-black text-slate-800 dark:text-white mb-1">Pilih User Terlebih Dahulu</h4>
                    <p className="text-xs font-medium text-slate-400 max-w-md">Silakan pilih salah satu user dari dropdown di atas untuk memantau kalender atau daftar tugas mereka.</p>
                  </div>
                )}
             </div>
           )}

           {['list', 'month', 'week', 'day'].includes(view) && (
             <div className="px-6 lg:px-10 pt-6 pb-2 space-y-4">
               {/* Live Current Date Banner & Top Controls */}
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                 {/* Live Date Display */}
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-300 dark:border-zinc-700">
                     <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                   </div>
                   <div>
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tanggal Terkini</span>
                     <h3 className="text-sm font-black text-slate-800 dark:text-white capitalize">
                       {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                     </h3>
                   </div>
                 </div>

                 {/* View Mode Toggle & Blue Add Task Button */}
                 <div className="flex flex-wrap items-center gap-3">
                   {/* Toggle List vs Kalender */}
                   <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                     <button
                       onClick={() => { setTaskViewMode('list'); setView('list'); }}
                       className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                         taskViewMode === 'list' && view === 'list'
                           ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 shadow-xs'
                           : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                       }`}
                     >
                       <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>
                       <span>Tipe List</span>
                     </button>
                     <button
                       onClick={() => { setTaskViewMode('timeline'); setView('list'); }}
                       className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                         taskViewMode === 'timeline' && view === 'list'
                           ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 shadow-xs'
                           : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                       }`}
                     >
                       <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                       <span>Tipe Timeline List</span>
                     </button>
                     <button
                       onClick={() => { setTaskViewMode('calendar'); setView(taskCalendarSubView); }}
                       className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                         taskViewMode === 'calendar' || ['month', 'week', 'day'].includes(view)
                           ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 shadow-xs'
                           : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                       }`}
                     >
                       <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                       <span>Tipe Kalender</span>
                     </button>
                   </div>

                   {/* Blue Add Task Button with 2 Options Dropdown */}
                   <div className="relative">
                     <button
                       onClick={() => setIsAddTaskMenuOpen(!isAddTaskMenuOpen)}
                       className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:bg-zinc-200 text-white rounded-xl text-xs font-bold shadow-md shadow-zinc-900/10 dark:shadow-black/40 active:scale-95 transition-all flex items-center gap-2"
                     >
                       <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                       <span>Tambah Tugas</span>
                       <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isAddTaskMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                     </button>

                     {/* Dropdown Options */}
                     {isAddTaskMenuOpen && (
                       <>
                         <div className="fixed inset-0 z-[190]" onClick={() => setIsAddTaskMenuOpen(false)} />
                         <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-[200] animate-fade-in space-y-1">
                           <button
                             onClick={() => {
                               setIsAddTaskMenuOpen(false);
                               setSelectedTask(null);
                               setSelectedLogIndex(-1);
                               setIsModalOpen(true);
                             }}
                             className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:hover:bg-zinc-800/50 dark:bg-zinc-900/60 hover:text-zinc-900 dark:text-zinc-100 transition-all text-left"
                           >
                             <div className="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 dark:text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
                               <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                             </div>
                             <div>
                               <div className="font-bold">Buat Tugas Baru</div>
                               <div className="text-[10px] text-slate-400 font-normal">Mulai dari tugas kosong baru</div>
                             </div>
                           </button>

                           <button
                             onClick={() => {
                               setIsAddTaskMenuOpen(false);
                               setIsContinueTaskModalOpen(true);
                             }}
                             className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:hover:bg-zinc-800/50 dark:bg-zinc-900/60 hover:text-zinc-900 dark:text-zinc-100 transition-all text-left"
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
               </div>

               {/* Calendar Navigation Header if in Calendar Mode */}
               {(taskViewMode === 'calendar' || ['month', 'week', 'day'].includes(view)) && (
                 <CalendarHeader 
                   currentDate={currentDate} 
                   view={(['month', 'week', 'day'].includes(view) ? view : taskCalendarSubView) as CalendarViewType} 
                   setView={(v) => { setTaskCalendarSubView(v as CalendarViewType); setView(v); }} 
                   onPrev={() => changeDate(-1)} 
                   onNext={() => changeDate(1)} 
                   onToday={() => setCurrentDate(new Date())} 
                 />
               )}
             </div>
           )}

           <div className="flex-1 p-6 lg:p-10 overflow-y-auto no-scrollbar">
              {(taskViewMode === 'calendar' || ['month', 'week', 'day'].includes(view)) ? (
                <>
                  {view === 'month' && <MonthView currentDate={currentDate} tasks={tasks} onDateClick={(d) => { setDayPickerDate(d); setIsDayPickerOpen(true); }} onTaskClick={handleOpenTask} />}
                  {view === 'week' && <WeekView currentDate={currentDate} tasks={tasks} onDateClick={(d) => { setDayPickerDate(d); setIsDayPickerOpen(true); }} onTaskClick={handleOpenTask} />}
                  {view === 'day' && <DayView currentDate={currentDate} tasks={tasks} onDateClick={(d) => { setDayPickerDate(d); setIsDayPickerOpen(true); }} onTaskClick={handleOpenTask} />}
                </>
              ) : taskViewMode === 'timeline' && view === 'list' ? (
                <TimelineListView 
                  tasks={tasks} 
                  onTaskClick={(t, lIdx) => handleOpenTask(t, typeof lIdx === 'number' && lIdx >= 0 ? lIdx : (t.logs ? t.logs.length - 1 : -1))} 
                  onDeleteTask={handleDeleteTask} 
                  onAddNew={() => setIsAddTaskMenuOpen(true)}
                  onAddNewChoice={(choice) => {
                    if (choice === 'new') {
                      setSelectedTask(null);
                      setSelectedLogIndex(-1);
                      setIsModalOpen(true);
                    } else {
                      setIsContinueTaskModalOpen(true);
                    }
                  }}
                />
              ) : view === 'list' ? (
                <ListView 
                  tasks={tasks} 
                  onTaskClick={(t) => handleOpenTask(t, t.logs.length - 1)} 
                  onDeleteTask={handleDeleteTask} 
                  onColorChange={() => {}} 
                  onAddNew={() => setIsAddTaskMenuOpen(true)}
                  onAddNewChoice={(choice) => {
                    if (choice === 'new') {
                      setSelectedTask(null);
                      setSelectedLogIndex(-1);
                      setIsModalOpen(true);
                    } else {
                      setIsContinueTaskModalOpen(true);
                    }
                  }}
                />
              ) : null}
              {view === 'analytics' && <AnalyticsView tasks={tasks} />}
           </div>
        </section>
      </main>

      <TaskModal isOpen={isModalOpen} task={selectedTask} logIndex={selectedLogIndex} prefilledDate={dayPickerDate?.toISOString()} onClose={() => { setIsModalOpen(false); setSelectedTask(null); setSelectedLogIndex(-1); }} onSave={handleSaveTask} allUsers={allUsers.filter(u => u.username !== currentUser?.username && u.username !== 'superadmin')} />
      <DayTaskPicker isOpen={isDayPickerOpen} date={dayPickerDate} allTasks={tasks} onClose={() => setIsDayPickerOpen(false)} onSelectTask={(t) => handleOpenTask(t, t.logs.length - 1)} onAddTask={(d) => { setSelectedTask(null); setSelectedLogIndex(-1); setDayPickerDate(d); setIsModalOpen(true); setIsDayPickerOpen(false); }} onDeleteTask={handleDeleteTask} onRescheduleTask={async (tid, date) => {
          const task = tasks.find(t => t.id === tid);
          if (task && date) {
            const updated = { 
              ...task, 
              endDate: date.toISOString(),
              status: 'Proses' as any,
              logs: [...task.logs, { 
                status: 'Proses' as any, 
                progress: task.progress, 
                date: date.toISOString(), 
                description: 'Dilanjutkan kembali pada: ' + date.toLocaleDateString('id-ID')
              }] 
            };
            await handleSaveTask(updated);
            setIsDayPickerOpen(false);
          }
      }} onQuickUpdateStatus={() => {}} />
      {isEditUserModalOpen && editingUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in">
            <form onSubmit={handleSaveEditUser}>
              <div className="p-8 pb-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-widest uppercase">Edit User & Role</h3>
                  <p className="text-xs text-slate-400">@{editingUser.username}</p>
                </div>
                <button type="button" onClick={() => setIsEditUserModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Nama Lengkap</label>
                  <input required type="text" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Role Aksen & Hak Akses</label>
                  <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})} className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white">
                    <option value="user">User / Standard</option>
                    <option value="engineer">Engineer</option>
                    <option value="commercial">Commercial / Sales</option>
                    <option value="finance">Finance / Admin</option>
                    <option value="hr">HR / Human Resources</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Password User</label>
                  <div className="relative">
                    <input
                      type={showModalPassword ? 'text' : 'password'}
                      placeholder="Ubah password user..."
                      value={editingUser.password}
                      onChange={e => setEditingUser({...editingUser, password: e.target.value})}
                      className="w-full p-4 pr-12 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModalPassword(!showModalPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-zinc-900 dark:text-zinc-100 transition-colors p-1"
                      title={showModalPassword ? 'Sembunyikan Password' : 'Tampilkan Password'}
                    >
                      {showModalPassword ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-8 pt-0 flex gap-3">
                <button type="button" onClick={() => setIsEditUserModalOpen(false)} className="w-1/3 py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-2xl transition-all">Batal</button>
                <button type="submit" className="w-2/3 py-4 bg-zinc-900 dark:bg-zinc-100 text-white font-black rounded-2xl shadow-xl hover:bg-zinc-800 dark:bg-zinc-200 transition-all">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lanjutkan Tugas */}
      {isContinueTaskModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in flex flex-col max-h-[85vh]">
            <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 flex items-center justify-center font-black">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wider">Lanjutkan Tugas Belum Selesai</h3>
                  <p className="text-xs text-slate-400">Pilih tugas yang ingin dilanjutkan hari ini</p>
                </div>
              </div>
              <button 
                onClick={() => setIsContinueTaskModalOpen(false)} 
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-xl"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {tasks.filter(t => t.status !== 'Selesai').length > 0 ? (
                tasks.filter(t => t.status !== 'Selesai').map(task => (
                  <div
                    key={task.id}
                    className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 hover:border-zinc-400 dark:hover:border-zinc-600 dark:hover:border-zinc-700 dark:hover:border-zinc-300 hover:bg-white dark:hover:bg-slate-900 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{task.companyName}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                          task.status === 'Proses' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-700 dark:text-zinc-300' :
                          task.status === 'Ulang' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {task.status || 'Belum Selesai'}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate group-hover:text-zinc-900 dark:text-zinc-100 transition-colors">{task.title}</h4>
                    </div>

                    <button
                      onClick={async () => {
                        setIsContinueTaskModalOpen(false);
                        const todayIso = new Date().toISOString();
                        const lastLog = task.logs && task.logs.length > 0 ? task.logs[task.logs.length - 1] : null;
                        const newLogIndex = task.logs ? task.logs.length : 0;
                        
                        const updatedTaskToEdit: Task = {
                          ...task,
                          endDate: todayIso,
                          status: 'Proses' as any,
                          logs: [
                            ...(task.logs || []),
                            {
                              status: 'Proses' as any,
                              progress: task.progress !== undefined ? task.progress : (lastLog?.progress || 50),
                              date: todayIso,
                              description: 'Dilanjutkan pada: ' + new Date().toLocaleString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            }
                          ]
                        };

                        // Otomatis simpan data terbaru termasuk di kalender dengan waktu terkini
                        await handleSaveTask(updatedTaskToEdit);

                        setSelectedTask(updatedTaskToEdit);
                        setSelectedLogIndex(newLogIndex);
                        setIsModalOpen(true);
                      }}
                      className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:bg-zinc-200 text-white rounded-xl text-xs font-bold shadow-md shadow-zinc-900/10 dark:shadow-black/40 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
                    >
                      <span>Lanjutkan</span>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Semua tugas telah selesai!</p>
                  <p className="text-xs text-slate-400 mt-1">Tidak ada tugas tertunda yang perlu dilanjutkan.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </div>
  );
};

export default App;
