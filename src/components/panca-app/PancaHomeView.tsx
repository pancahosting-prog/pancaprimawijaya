import React, { useState } from 'react';
import { 
  Bell, Search, ArrowRight, Sparkles, Send, User, FileText, 
  Tag, BarChart3, Zap, Target, FileEdit, TrendingUp, LayoutGrid
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
  onLogout?: () => void;
}

export const PancaHomeView: React.FC<PancaHomeViewProps> = ({
  currentUser,
  unreadNotificationsCount = 2,
  onSelectPrompt,
  onOpenNotifications,
  onGoToAI,
  onLogout,
}) => {
  const [chatInput, setChatInput] = useState('');

  const firstName = currentUser?.nama ? currentUser.nama.split(' ')[0] : 'Ahmad';
  const fullName = currentUser?.nama || 'Ahmad Rahmat';

  const handleSendInput = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) {
      onGoToAI();
      return;
    }
    onSelectPrompt(chatInput.trim());
    setChatInput('');
  };

  const tindakanCepat = [
    { label: 'Tambah Customer', icon: User, prompt: 'tambah customer baru' },
    { label: 'Transaksi Baru', icon: FileText, prompt: 'tambah transaksi baru' },
    { label: 'Penawaran Baru', icon: Tag, prompt: 'tambah penawaran baru' },
  ];

  const pilihanCepatAI = [
    {
      title: 'Tambah Customer Baru',
      desc: 'Input kontak & lead pelanggan ke database CRM',
      icon: BarChart3,
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
      icon: Zap,
      prompt: 'tambah penawaran baru'
    },
    {
      title: 'Ringkasan Omzet Bisnis',
      desc: 'Cek omzet real deals & performa sales',
      icon: Target,
      prompt: 'Tolong buatkan ringkasan omzet dan performa penjualan saat ini.'
    }
  ];

  const fiturLayanan = [
    {
      title: 'Riset Pasar',
      desc: 'Temukan peluang pasar, tren terbaru, dan insight kompetitor.',
      icon: Search,
      prompt: 'Tolong analisis tren pasar dan peluang bisnis saat ini.'
    },
    {
      title: 'Buat Konten',
      desc: 'Ide konten, copywriting, artikel blog, atau caption media sosial.',
      icon: FileEdit,
      prompt: 'Tolong buatkan draf konten promosi produk Panca Prima Wijaya.'
    },
    {
      title: 'Analisis Kompetitor',
      desc: 'Pantau strategi, kekuatan, dan celah kompetitor kamu.',
      icon: TrendingUp,
      prompt: 'Tolong buatkan analisis kekuatan dan strategi kompetitor.'
    }
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
          Asisten AI untuk membantu kamu bekerja lebih cepat, lebih cerdas, dan lebih produktif.
        </p>
      </div>

      {/* 3. Hero Card: AI Assistant with 3D Robot & Input Bar */}
      <div className="relative rounded-[28px] p-5 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200/60 dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-800/80 border border-slate-200/80 dark:border-zinc-800 shadow-xs overflow-hidden">
        {/* Top-left Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/80 dark:bg-zinc-800 text-[10px] font-bold text-slate-700 dark:text-zinc-300 mb-3 shadow-2xs">
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

          {/* 3D Robot Character Mascot */}
          <div className="w-28 h-28 -mr-2 -mt-4 relative flex items-center justify-center shrink-0">
            <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-md">
              <defs>
                {/* Robot Body Ceramic Gradient */}
                <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="60%" stopColor="#f1f5f9" />
                  <stop offset="100%" stopColor="#cbd5e1" />
                </linearGradient>
                {/* Head Top Gloss Highlight */}
                <linearGradient id="headHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
                {/* Visor Screen Glass Gradient */}
                <linearGradient id="visorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="85%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#020617" />
                </linearGradient>
                {/* Ear Cup Gradient */}
                <linearGradient id="earGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#94a3b8" />
                </linearGradient>
                {/* Shadow Gradient */}
                <radialGradient id="robotShadow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#000000" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Ground Shadow */}
              <ellipse cx="80" cy="150" rx="38" ry="7" fill="url(#robotShadow)" />

              {/* Antenna on head */}
              <circle cx="80" cy="20" r="4.5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
              <rect x="78.5" y="24" width="3" height="7" rx="1.5" fill="#cbd5e1" />

              {/* Torso / Body */}
              <path d="M 60 110 C 60 100 100 100 100 110 L 98 136 C 98 143 62 143 62 136 Z" fill="url(#bodyGrad)" stroke="#cbd5e1" strokeWidth="1" />
              {/* Chest Badge 'S' */}
              <circle cx="80" cy="122" r="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.8" />
              <text x="80" y="125" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#0f172a">S</text>

              {/* Left Arm (Relaxed) */}
              <path d="M 60 114 Q 50 125 54 135 Q 57 138 61 133 Q 63 124 64 118 Z" fill="url(#bodyGrad)" stroke="#cbd5e1" strokeWidth="1" />

              {/* Right Arm (Waving Hand!) */}
              <path d="M 98 114 Q 112 110 116 98 Q 120 94 118 100 Q 112 116 99 122 Z" fill="url(#bodyGrad)" stroke="#cbd5e1" strokeWidth="1" />
              {/* Right Hand Waving Palm */}
              <circle cx="117" cy="95" r="4.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
              <circle cx="119" cy="91" r="1.8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.8" />
              <circle cx="122" cy="94" r="1.8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.8" />

              {/* Head Base (Curved Smooth Cube/Oval) */}
              <rect x="42" y="30" width="76" height="68" rx="28" fill="url(#bodyGrad)" stroke="#cbd5e1" strokeWidth="1.2" />
              {/* Head Gloss Highlight */}
              <ellipse cx="80" cy="38" rx="26" ry="6" fill="url(#headHighlight)" />

              {/* Ears / Headphone Cushions */}
              <ellipse cx="40" cy="64" rx="4.5" ry="11" fill="url(#earGrad)" stroke="#94a3b8" strokeWidth="0.8" />
              <ellipse cx="120" cy="64" rx="4.5" ry="11" fill="url(#earGrad)" stroke="#94a3b8" strokeWidth="0.8" />

              {/* Glossy Black Visor Screen */}
              <rect x="49" y="42" width="62" height="44" rx="18" fill="url(#visorGrad)" stroke="#334155" strokeWidth="1" />

              {/* Visor Glare / Reflection Arc */}
              <path d="M 54 50 Q 80 44 104 50" fill="none" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />

              {/* Smiling Happy Eyes (^ ^) */}
              <path d="M 64 63 Q 70 56 76 63" fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
              <path d="M 84 63 Q 90 56 96 63" fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />

              {/* Cute Cheek Blushes */}
              <ellipse cx="61" cy="72" rx="3.5" ry="2" fill="#38bdf8" opacity="0.4" />
              <ellipse cx="99" cy="72" rx="3.5" ry="2" fill="#38bdf8" opacity="0.4" />
            </svg>
          </div>
        </div>

        {/* Input Bar inside Card */}
        <form onSubmit={handleSendInput} className="mt-4 relative flex items-center">
          <div className="w-full bg-white dark:bg-zinc-900/90 rounded-full py-1.5 pl-4 pr-1.5 flex items-center justify-between border border-slate-200 dark:border-zinc-700 shadow-2xs">
            <div className="flex items-center gap-2.5 flex-1 mr-2">
              <Sparkles className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ketik pesan atau perintah..."
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
                onClick={() => onSelectPrompt(item.prompt)}
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
                onClick={() => onSelectPrompt(item.prompt)}
                className="w-40 shrink-0 p-3.5 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/80 border border-slate-200/90 dark:border-zinc-800 rounded-2xl text-left shadow-2xs transition active:scale-95 group flex flex-col justify-between"
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
    </div>
  );
};
