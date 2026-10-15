
import React from 'react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-2xl max-h-[85vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
        {/* Header */}
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-[#F8FAFC] dark:bg-slate-950">
          <div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-widest leading-none">Tentang Aplikasi</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Smart Task Management System</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-500 transition-colors">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
          <section>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-zinc-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <img src="https://ahlifumigasi.com/wp-content/uploads/2025/12/logopancaapp.png" alt="Logo" className="w-8 h-8 object-contain brightness-0 invert" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-800 dark:text-white">MyPanca v2.0</h4>
                <p className="text-sm text-slate-500">Sistem Pelaporan Tugas Karyawan Terpadu</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              MyPanca adalah platform manajemen tugas modern yang dirancang untuk memudahkan koordinasi antara admin dan tim lapangan. Aplikasi ini mengintegrasikan pelaporan tugas harian dengan visualisasi kalender dan analisis performa secara real-time.
            </p>
          </section>

          <section className="space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cara Menggunakan</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 bg-zinc-100 text-zinc-600 rounded-lg flex items-center justify-center font-black mb-3 text-xs">01</div>
                <h5 className="font-bold text-slate-800 dark:text-white text-sm mb-1">Pelaporan Tugas</h5>
                <p className="text-xs text-slate-500">Klik pada tanggal di Kalender untuk melihat daftar tugas hari tersebut atau menambah laporan baru.</p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center font-black mb-3 text-xs">02</div>
                <h5 className="font-bold text-slate-800 dark:text-white text-sm mb-1">Update Progres</h5>
                <p className="text-xs text-slate-500">Gunakan slider untuk memperbarui persentase pengerjaan dan pilih status yang sesuai (Proses/Selesai).</p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center font-black mb-3 text-xs">03</div>
                <h5 className="font-bold text-slate-800 dark:text-white text-sm mb-1">Kolaborasi</h5>
                <p className="text-xs text-slate-500">Gunakan fitur undangan untuk bekerja sama dengan anggota tim lain dalam satu tugas yang sama.</p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 bg-zinc-100 text-zinc-600 rounded-lg flex items-center justify-center font-black mb-3 text-xs">04</div>
                <h5 className="font-bold text-slate-800 dark:text-white text-sm mb-1">Dashboard Analitik</h5>
                <p className="text-xs text-slate-500">Pantau produktivitas harian dan bulanan melalui menu Dashboard untuk melihat ringkasan performa.</p>
              </div>
            </div>
          </section>

          <section className="bg-indigo-50 dark:bg-zinc-900/20 p-6 rounded-[24px] border border-zinc-100 dark:border-zinc-800">
            <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2">Tips Produktivitas</h4>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 italic">
              "Gunakan Stickynote Pribadi untuk mencatat pengingat cepat atau daftar belanjaan inventaris sebelum dimasukkan ke dalam sistem pelaporan formal."
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-8 pt-4 border-t border-slate-50 dark:border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-8 py-3 bg-slate-900 text-white font-bold rounded-2xl shadow-xl hover:bg-zinc-600 transition-all text-sm active:scale-95">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
