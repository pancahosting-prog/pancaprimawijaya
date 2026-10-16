import React from 'react';
import { 
  Bell, FileText, Upload, Sparkles, TrendingUp, ChevronRight, 
  ArrowRight, Search, ShieldCheck, Download, Plus, Layers, LogOut
} from 'lucide-react';
import { PWAInstallButton } from '../PWAInstallButton';

interface PancaHomeViewProps {
  currentUser: {
    username: string;
    role: string;
    nama: string;
  };
  unreadNotificationsCount?: number;
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
  onOpenDriveUpload,
  onGoToAI,
  onLogout,
}) => {
  const recentTopics = [
    { label: "Tambah Customer", prompt: "tambah customer baru" },
    { label: "Transaksi Baru", prompt: "tambah transaksi baru" },
    { label: "Penawaran Baru", prompt: "tambah penawaran baru" },
    { label: "Laporan Omzet", prompt: "Tolong buatkan ringkasan omzet dan total penjualan bulan ini." },
    { label: "Stok Menipis", prompt: "Cek produk apa saja yang stoknya menipis dan butuh restock." },
  ];

  const trendingPrompts = [
    { tag: "Tambah Customer Baru", desc: "Input kontak & lead pelanggan ke database CRM", prompt: "tambah customer baru" },
    { tag: "Transaksi Baru", desc: "Input order & transaksi penjualan deal baru", prompt: "tambah transaksi baru" },
    { tag: "Penawaran Baru", desc: "Input quotation harga penawaran untuk pelanggan", prompt: "tambah penawaran baru" },
    { tag: "Ringkasan Omzet Bisnis", desc: "Cek omzet real deals & performa sales", prompt: "Tolong buatkan ringkasan omzet dan performa penjualan saat ini." },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6 text-slate-800 dark:text-zinc-100 bg-slate-50 dark:bg-zinc-950 font-sans space-y-6">
      {/* PWA Install Banner (Automatic if not installed) */}
      <PWAInstallButton variant="banner" className="mb-2" />

      {/* User Header Profile */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            onClick={onLogout}
            className="relative group cursor-pointer"
            title="Klik foto profil untuk Keluar / Logout"
          >
            <div className="w-12 h-12 rounded-full bg-slate-900 dark:bg-zinc-100 p-0.5 shadow-md group-hover:scale-105 transition">
              <div className="w-full h-full rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center text-slate-900 dark:text-zinc-100 font-extrabold text-base">
                {currentUser?.nama?.charAt(0) || 'U'}
              </div>
            </div>
            {/* Logout icon overlay attached directly to profile image */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-rose-600 hover:bg-rose-700 text-white rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center shadow-md transition active:scale-90">
              <LogOut className="w-2.5 h-2.5" />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 dark:text-zinc-400 font-medium">Selamat Datang,</p>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-zinc-100 leading-tight">
              {currentUser?.nama || 'Pengguna Panca'}
            </h2>
          </div>
        </div>

        {/* Notification Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative w-10 h-10 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition active:scale-95"
        >
          <Bell className="w-5 h-5" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-black flex items-center justify-center shadow-sm animate-pulse">
              {unreadNotificationsCount}
            </span>
          )}
        </button>
      </div>

      {/* Main Greeting Banner */}
      <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-lg border border-slate-800">
        <h3 className="text-lg font-extrabold leading-snug">
          Panca AI Assistant <br />
          <span className="text-slate-300 font-bold">
            Sistem CRM & ERP Terpadu
          </span>
        </h3>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Asisten pintar terintegrasi dengan CRM, transaksi, stok, dan task proyek. Silakan pilih tindakan cepat di bawah.
        </p>
      </div>

      {/* Quick Prompts & Action Section */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">Tindakan Cepat</h4>
          <button 
            onClick={onGoToAI} 
            className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-0.5"
          >
            <span>+ Buka AI Chat</span>
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-hide">
          {recentTopics.map((topic, i) => (
            <button
              key={i}
              onClick={() => onSelectPrompt(topic.prompt)}
              className="px-3.5 py-2.5 bg-white dark:bg-zinc-900 hover:bg-violet-50 dark:hover:bg-zinc-800 border border-slate-200/80 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-700 rounded-2xl text-xs font-bold text-slate-800 dark:text-zinc-100 hover:text-violet-700 dark:hover:text-violet-300 whitespace-nowrap shadow-xs transition active:scale-95 shrink-0 flex items-center gap-1.5"
            >
              {topic.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trending Prompt Section */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <TrendingUp className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">Pilihan Cepat AI</h4>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {trendingPrompts.map((item, i) => (
            <button
              key={i}
              onClick={() => onSelectPrompt(item.prompt)}
              className="p-3.5 bg-white dark:bg-zinc-900 hover:bg-violet-50/70 dark:hover:bg-zinc-800 border border-slate-200/80 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-700 rounded-2xl text-left shadow-xs transition active:scale-95 group flex flex-col justify-between"
            >
              <div>
                <span className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 leading-snug line-clamp-1 block">
                  {item.tag}
                </span>
                <p className="text-[10px] text-slate-400 dark:text-zinc-400 mt-1 line-clamp-2">
                  {item.desc}
                </p>
              </div>
              <span className="mt-3 text-[10px] text-violet-600 dark:text-violet-400 font-extrabold flex items-center gap-1">
                Jalankan Sekarang <ArrowRight className="w-2.5 h-2.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* New Updates Section */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400">Fitur & Layanan</h4>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: Summarise Data */}
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-slate-200/80 dark:border-zinc-800 shadow-xs flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 flex items-center justify-center mb-2.5">
              <FileText className="w-6 h-6" />
            </div>
            <h5 className="text-xs font-bold text-slate-900 dark:text-zinc-100">Ringkasan Bisnis</h5>
            <p className="text-[10px] text-slate-400 dark:text-zinc-400 mt-0.5 mb-3">Rekap CRM, Omzet & Tagihan</p>
            <button
              onClick={() => onSelectPrompt("Tolong buatkan ringkasan lengkap data dari seluruh menu: CRM, Transaksi, Piutang, Stok, dan Task.")}
              className="w-full py-2 bg-violet-50 dark:bg-violet-950/60 hover:bg-violet-100 dark:hover:bg-violet-900/60 text-violet-700 dark:text-violet-300 text-xs font-bold rounded-xl transition active:scale-95"
            >
              Pilih
            </button>
          </div>

          {/* Card 2: Upload File / Drive */}
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-slate-200/80 dark:border-zinc-800 shadow-xs flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2.5">
              <Upload className="w-6 h-6" />
            </div>
            <h5 className="text-xs font-bold text-slate-900 dark:text-zinc-100">Drive & File</h5>
            <p className="text-[10px] text-slate-400 dark:text-zinc-400 mt-0.5 mb-3">Unggah & simpan dokumen</p>
            <button
              onClick={onOpenDriveUpload}
              className="w-full py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold rounded-xl transition active:scale-95"
            >
              Pilih
            </button>
          </div>
        </div>
      </div>

      {/* Large Call-To-Action Button */}
      <div className="pt-2">
        <button
          onClick={onGoToAI}
          className="w-full py-4 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold rounded-2xl shadow-xl shadow-violet-500/20 flex items-center justify-center gap-2.5 transition active:scale-[0.98]"
        >
          <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
          <span className="text-sm tracking-wide">Mulai Chat dengan Panca AI</span>
        </button>
      </div>
    </div>
  );
};
