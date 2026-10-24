import React, { useState, useEffect } from 'react';
import { 
  Bell, Search, ArrowRight, Sparkles, Send, User, FileText, 
  Tag, BarChart3, Zap, Target, FileEdit, TrendingUp, LayoutGrid, MessageSquare, FolderKanban, HelpCircle,
  CheckSquare, HardDrive
} from 'lucide-react';

interface PancaHomeViewProps {
  currentUser: {
    username: string;
    role: string;
    nama: string;
  };
  unreadNotificationsCount?: number;
  transactions?: any[];
  customers?: any[];
  products?: any[];
  suppliers?: any[];
  purchaseOrders?: any[];
  rolePermissions?: { id: string; canView: boolean; canEdit: boolean }[];
  onSelectPrompt: (promptText: string) => void;
  onOpenNotifications: () => void;
  onOpenDriveUpload: () => void;
  onGoToAI: () => void;
  onOpenProject?: () => void;
  onOpenQA?: () => void;
  onOpenTugas?: () => void;
  onLogout?: () => void;
}

export const PancaHomeView: React.FC<PancaHomeViewProps> = ({
  currentUser,
  unreadNotificationsCount = 2,
  onSelectPrompt,
  onOpenNotifications,
  onOpenDriveUpload,
  onGoToAI,
  onOpenProject,
  onOpenQA,
  onOpenTugas,
  onLogout,
}) => {
  const [chatInput, setChatInput] = useState('');
  const [placeholderText, setPlaceholderText] = useState('');

  const firstName = currentUser?.nama ? currentUser.nama.split(' ')[0] : 'Ahmad';
  const fullName = currentUser?.nama || 'Ahmad Rahmat';

  // Looping Typewriter for input placeholder (smooth & not too fast)
  useEffect(() => {
    const phrases = [
      'Ketik pesan atau perintah...',
      'Tanyakan data penjualan...',
      'Cek stok produk & inventaris...',
      'Buat draf penawaran baru...',
      'Status piutang jatuh tempo...'
    ];
    let phraseIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    let timer: any;

    const handleTyping = () => {
      const current = phrases[phraseIdx];

      if (isDeleting) {
        setPlaceholderText(current.substring(0, charIdx - 1));
        charIdx--;
      } else {
        setPlaceholderText(current.substring(0, charIdx + 1));
        charIdx++;
      }

      let speed = 90; // moderate speed, comfortable to read

      if (!isDeleting && charIdx === current.length) {
        speed = 2200; // pause at end of sentence
        isDeleting = true;
      } else if (isDeleting && charIdx === 0) {
        isDeleting = false;
        phraseIdx = (phraseIdx + 1) % phrases.length;
        speed = 500; // pause before typing next sentence
      } else if (isDeleting) {
        speed = 45; // faster deletion
      }

      timer = setTimeout(handleTyping, speed);
    };

    timer = setTimeout(handleTyping, 600);
    return () => clearTimeout(timer);
  }, []);

  const handleSendInput = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) {
      onGoToAI();
      return;
    }
    onSelectPrompt(chatInput.trim());
    setChatInput('');
  };

  const userRole = (currentUser?.role || '').toLowerCase();
  const isSuperAdmin = !currentUser || userRole.includes('admin') || currentUser?.username?.toLowerCase() === 'superadmin' || currentUser?.nama?.toLowerCase() === 'superadmin';
  const isSalesOrAdmin = isSuperAdmin || userRole === 'sales';

  const tindakanCepat = isSalesOrAdmin ? [
    { label: '📞 Followup', icon: MessageSquare, prompt: 'followup penawaran' },
    { label: 'Tambah Customer', icon: User, prompt: 'tambah customer baru' },
    { label: 'Transaksi Baru', icon: FileText, prompt: 'tambah transaksi baru' },
    { label: 'Penawaran Baru', icon: Tag, prompt: 'tambah penawaran baru' },
    { label: '➕ Tugas Baru', icon: FileEdit, prompt: 'tugas baru' },
    { label: '🔄 Update Task', icon: Zap, prompt: 'update task' },
    { label: '📊 Analisa Pekerjaan', icon: Target, prompt: 'Analisa pekerjaan saya, berikan urutan prioritas pengerjaan hari ini, tips efisiensi, dan langkah penyelesaian.' },
  ] : userRole === 'engineer' ? [
    { label: '📁 Knowledge Project', icon: FolderKanban, prompt: 'buka database project', onClick: onOpenProject },
    { label: '➕ Tugas Baru', icon: FileEdit, prompt: 'tugas baru' },
    { label: '🔄 Update Task', icon: Zap, prompt: 'update task' },
    { label: '📊 Analisa Pekerjaan', icon: Target, prompt: 'Analisa pekerjaan saya, berikan urutan prioritas pengerjaan hari ini, tips efisiensi, dan langkah penyelesaian.' },
  ] : [
    { label: '➕ Tugas Baru', icon: FileEdit, prompt: 'tugas baru' },
    { label: '🔄 Update Task', icon: Zap, prompt: 'update task' },
    { label: '📊 Analisa Pekerjaan', icon: Target, prompt: 'Analisa pekerjaan saya, berikan urutan prioritas pengerjaan hari ini, tips efisiensi, dan langkah penyelesaian.' },
  ];

  const pilihanCepatAI = isSalesOrAdmin ? [
    {
      title: '📞 Follow-up Penawaran',
      desc: 'Pilih penawaran & catat hasil komunikasi follow-up terbaru',
      icon: MessageSquare,
      prompt: 'followup penawaran'
    },
    {
      title: 'Tambah Customer Baru',
      desc: 'Input kontak & lead pelanggan ke database CRM',
      icon: User,
      prompt: 'tambah customer baru'
    },
    {
      title: 'Transaksi Baru',
      desc: 'Input order & transaksi penjualan deal baru',
      icon: FileText,
      prompt: 'tambah transaksi baru'
    },
    {
      title: 'Penawaran Baru',
      desc: 'Input quotation harga penawaran untuk pelanggan',
      icon: Tag,
      prompt: 'tambah penawaran baru'
    },
    {
      title: '➕ Tambah Tugas Baru',
      desc: 'Input pekerjaan / task baru ke sistem database',
      icon: FileEdit,
      prompt: 'tugas baru'
    },
    {
      title: '🔄 Lanjutkan / Update Task',
      desc: 'Pilih tugas aktif dan perbarui progress & log pengerjaan',
      icon: Zap,
      prompt: 'update task'
    },
    {
      title: '📊 Analisa Pekerjaan AI',
      desc: 'Analisis daftar tugas, urutan prioritas, dan tips penyelesaian',
      icon: Target,
      prompt: 'Analisa pekerjaan saya, berikan urutan prioritas pengerjaan hari ini, tips efisiensi, dan langkah penyelesaian.'
    }
  ] : [
    {
      title: '➕ Tambah Tugas Baru',
      desc: 'Input pekerjaan / task teknis baru ke database',
      icon: FileEdit,
      prompt: 'tugas baru'
    },
    {
      title: '🔄 Lanjutkan / Update Task',
      desc: 'Pilih tugas aktif dan perbarui progress & log pengerjaan',
      icon: Zap,
      prompt: 'update task'
    },
    {
      title: '📊 Analisa Pekerjaan AI',
      desc: 'Rekomendasi urutan prioritas tugas hari ini, strategi & tips efisiensi',
      icon: Target,
      prompt: 'Analisa pekerjaan saya, berikan urutan prioritas pengerjaan hari ini, tips efisiensi, dan langkah penyelesaian.'
    }
  ];

  const canAccessQA = isSuperAdmin || userRole === 'sales' || userRole === 'engineer';

  const fiturLayanan = userRole === 'engineer' ? [
    {
      title: 'Tugas',
      desc: 'Timeline tugas, update progres pengerjaan & log harian teknis.',
      icon: CheckSquare,
      onClick: onOpenTugas,
      prompt: ''
    },
    {
      title: 'Project',
      desc: 'Database spek sensor, SOP instalasi, manual book & SLD.',
      icon: FolderKanban,
      onClick: onOpenProject,
      prompt: ''
    },
    {
      title: 'Drive',
      desc: 'Penyimpanan berkas, foto lapangan, dan dokumen teknis.',
      icon: HardDrive,
      onClick: onOpenDriveUpload,
      prompt: ''
    },
    {
      title: 'Q&A',
      desc: 'Tanya jawab teknis, kendala SLD, sensor, & solusi lapangan.',
      icon: HelpCircle,
      onClick: onOpenQA,
      prompt: ''
    }
  ] : [
    ...(canAccessQA ? [{
      title: 'Q&A',
      desc: 'Tanya jawab teknis, kendala SLD, sensor, & solusi lapangan.',
      icon: HelpCircle,
      onClick: onOpenQA,
      prompt: ''
    }] : [])
  ];

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-3 pb-8 text-slate-800 dark:text-zinc-100 bg-[#fafafa] dark:bg-zinc-950 font-sans space-y-5 select-none">
      {/* 1. Top Bar / Header */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-center shadow-xs">
            <span className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tighter">S<sup className="text-[10px] -top-1">+</sup></span>
          </div>
          <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">Panca App</h1>
        </div>

        {/* Bell Notification */}
        <button
          onClick={onOpenNotifications}
          className="relative w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center text-slate-700 dark:text-zinc-300 transition active:scale-95"
        >
          <Bell className="w-4 h-4" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full" />
          )}
        </button>
      </div>

      {/* 2. Welcome Greeting */}
      <div className="pt-1">
        <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Selamat Datang,</p>
        <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight mt-0.5">
          {fullName}
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed mt-1 max-w-xs">
          Asisten AI Panca Prima Wijaya
        </p>
      </div>

      {/* 3. Hero Card: Solid White Card matching GIF background */}
      <div className="relative rounded-[28px] p-5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 shadow-xs overflow-hidden">
        {/* Top-left Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-3 shadow-2xs">
          <Sparkles className="w-3 h-3 text-slate-600 dark:text-zinc-300" />
          <span>AI Assistant</span>
        </div>

        <div className="flex items-start justify-between relative z-10">
          <div className="max-w-[62%]">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
              Ada yang bisa saya bantu hari ini, {firstName}?
            </h3>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed mt-1.5">
              Tulis pertanyaan, minta ide, buat konten, atau analisis data bisnis kamu.
            </p>
          </div>

          {/* Robot GIF Mascot */}
          <div className="w-28 h-28 -mr-1 -mt-3 relative flex items-center justify-center shrink-0">
            <img 
              src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2JyeWZkamY3eTNlZWcwajRhczU0ajgxeW5jeGU0YmpibnJ4bmh1eiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/1qzirb6B4KXOHbJpd3/giphy.gif" 
              alt="Panca AI Robot" 
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Input Bar inside Card with Repeating Typewriter Placeholder */}
        <form onSubmit={handleSendInput} className="mt-4 relative flex items-center">
          <div className="w-full bg-slate-50 dark:bg-zinc-800/80 rounded-full py-1.5 pl-4 pr-1.5 flex items-center justify-between border border-slate-200/90 dark:border-zinc-700 shadow-2xs">
            <div className="flex items-center gap-2.5 flex-1 mr-2">
              <Sparkles className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={placeholderText || "Ketik pesan atau perintah..."}
                className="w-full bg-transparent text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-8 h-8 rounded-full bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900 flex items-center justify-center transition active:scale-95 shrink-0 shadow-xs"
            >
              <Send className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </form>
      </div>

      {/* 4. Tindakan Cepat */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">Tindakan Cepat</h4>
          <button 
            onClick={onGoToAI} 
            className="text-[11px] font-semibold text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-0.5"
          >
            <span>Lihat semua</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {tindakanCepat.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                onClick={() => {
                  if ((item as any).onClick) {
                    (item as any).onClick();
                  } else if (item.prompt) {
                    onSelectPrompt(item.prompt);
                  }
                }}
                className="px-3.5 py-2 rounded-full bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200/90 dark:border-zinc-800 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-200 shadow-2xs transition active:scale-95 shrink-0"
              >
                <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-300">
                  <Icon className="w-3 h-3" />
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Pilihan Cepat AI */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <Sparkles className="w-3.5 h-3.5 text-slate-900 dark:text-white" />
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">Pilihan Cepat AI</h4>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {pilihanCepatAI.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                onClick={() => onSelectPrompt(item.prompt)}
                className="p-3.5 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/80 border border-slate-200/90 dark:border-zinc-800 rounded-2xl text-left shadow-2xs transition active:scale-95 group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-700 dark:text-zinc-300">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="w-5 h-5 rounded-full bg-slate-100/60 dark:bg-zinc-800/60 flex items-center justify-center text-slate-400 group-hover:text-slate-800 dark:group-hover:text-white">
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {item.title}
                  </h5>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 6. Fitur & Layanan */}
      {fiturLayanan.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <LayoutGrid className="w-3.5 h-3.5 text-slate-900 dark:text-white" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">Fitur & Layanan</h4>
          </div>

          <div className="flex items-stretch gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
            {fiturLayanan.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    if ((item as any).onClick) {
                      (item as any).onClick();
                    } else {
                      onSelectPrompt(item.prompt);
                    }
                  }}
                  className="w-44 shrink-0 p-3.5 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/80 border border-slate-200/90 dark:border-zinc-800 rounded-2xl text-left shadow-2xs transition active:scale-95 group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-700 dark:text-zinc-300">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="w-5 h-5 rounded-full bg-slate-100/60 dark:bg-zinc-800/60 flex items-center justify-center text-slate-400 group-hover:text-slate-800 dark:group-hover:text-white">
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                      {item.title}
                    </h5>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-400 mt-1 line-clamp-3 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
