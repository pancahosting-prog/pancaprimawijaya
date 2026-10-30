import React, { useState } from 'react';
import { ExportUserOption, generateTrackingExcel, getMonthNameID } from '../services/exportTrackingService';
import { Task } from '../types';

interface ExportTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  allUsers: any[];
  fetchUserTasks: (username: string) => Promise<Task[]>;
}

export const ExportTrackingModal: React.FC<ExportTrackingModalProps> = ({
  isOpen,
  onClose,
  allUsers,
  fetchUserTasks
}) => {
  // Filter out system account if needed, keep real users
  const availableUsers: ExportUserOption[] = allUsers
    .filter(u => u.username !== 'superadmin' || allUsers.length === 1)
    .map(u => ({
      username: u.username,
      name: u.name || u.username,
      role: u.role || 'user'
    }));

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  const [selectedUsernames, setSelectedUsernames] = useState<string[]>(() => 
    availableUsers.map(u => u.username)
  );
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['all']);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [userSearch, setUserSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const toggleUser = (username: string) => {
    setSelectedUsernames(prev => 
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  };

  const handleSelectAllUsers = () => {
    setSelectedUsernames(availableUsers.map(u => u.username));
  };

  const handleDeselectAllUsers = () => {
    setSelectedUsernames([]);
  };

  const toggleStatus = (statusKey: string) => {
    if (statusKey === 'all') {
      setSelectedStatuses(['all']);
      return;
    }

    let next = selectedStatuses.filter(s => s !== 'all');
    if (next.includes(statusKey)) {
      next = next.filter(s => s !== statusKey);
    } else {
      next.push(statusKey);
    }

    if (next.length === 0) {
      setSelectedStatuses(['all']);
    } else {
      setSelectedStatuses(next);
    }
  };

  const filteredUsers = availableUsers.filter(u => 
    u.name.toLowerCase().includes(userSearch.toLowerCase()) || 
    u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.role && u.role.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const handleDownload = async () => {
    setErrorMessage('');
    if (selectedUsernames.length === 0) {
      setErrorMessage('Pilih minimal 1 user untuk di-export ke Excel.');
      return;
    }

    setIsExporting(true);
    try {
      const selectedUsersList = availableUsers.filter(u => selectedUsernames.includes(u.username));
      await generateTrackingExcel(
        {
          users: selectedUsersList,
          statusFilter: selectedStatuses,
          monthFilter: selectedMonth,
          yearFilter: selectedYear
        },
        fetchUserTasks
      );
      onClose();
    } catch (err: any) {
      console.error('Export failed:', err);
      setErrorMessage(err.message || 'Gagal membuat file Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  const statusOptions = [
    { key: 'all', label: 'Semua Status' },
    { key: 'Selesai', label: 'Finish / Selesai' },
    { key: 'Proses', label: 'On Progress / Proses' },
    { key: 'Belum Mulai', label: 'Belum Mulai' },
    { key: 'Ulang', label: 'Ulang / Revisi' }
  ];

  const months = [
    { value: 0, label: 'Semua Bulan' },
    { value: 1, label: 'Januari' },
    { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' },
    { value: 4, label: 'April' },
    { value: 5, label: 'Mei' },
    { value: 6, label: 'Juni' },
    { value: 7, label: 'Juli' },
    { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' },
    { value: 12, label: 'Desember' }
  ];

  const years = [2024, 2025, 2026, 2027, 2028];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 md:p-8 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black shadow-lg shadow-emerald-500/20 shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
                Download Laporan Excel Tracking
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Format standar Engineering Monitoring Activity (1 user = 1 sheet terpisah).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-6 overflow-y-auto no-scrollbar flex-1">
          
          {/* Section 1: Periode & Bulan */}
          <div className="space-y-3">
            <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              1. Pilih Periode Laporan (Bulan & Tahun)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 mb-1 block">Bulan</label>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm text-slate-800 dark:text-white outline-none focus:border-emerald-500 transition-all cursor-pointer"
                >
                  {months.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 mb-1 block">Tahun</label>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-sm text-slate-800 dark:text-white outline-none focus:border-emerald-500 transition-all cursor-pointer"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Filter Status */}
          <div className="space-y-3">
            <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              2. Pilih Status Pekerjaan
            </label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(st => {
                const isSelected = selectedStatuses.includes(st.key);
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => toggleStatus(st.key)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Pilih User (1 User 1 Sheet) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                3. Pilih User Karyawan ({selectedUsernames.length} dari {availableUsers.length} dipilih)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllUsers}
                  className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Pilih Semua
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAllUsers}
                  className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer"
                >
                  Hapus Semua
                </button>
              </div>
            </div>

            {/* User Search Input */}
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Cari user karyawan..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-emerald-500 transition-all"
              />
            </div>

            {/* User List with Checkboxes */}
            <div className="max-h-56 overflow-y-auto no-scrollbar border border-slate-100 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 p-1">
              {filteredUsers.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 font-semibold">
                  Tidak ada user yang cocok dengan pencarian
                </div>
              ) : (
                filteredUsers.map(u => {
                  const isChecked = selectedUsernames.includes(u.username);
                  return (
                    <div
                      key={u.username}
                      onClick={() => toggleUser(u.username)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
                          : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                          isChecked
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                            {u.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            @{u.username} {u.role ? `• ${u.role}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                        isChecked
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                      }`}>
                        {isChecked && (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Template Info Card */}
          <div className="p-4 bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/50 rounded-2xl flex items-start gap-3">
            <svg className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div className="text-xs text-sky-900 dark:text-sky-200 leading-relaxed">
              <p className="font-bold">Informasi Ekspor Excel:</p>
              <p className="text-[11px] text-sky-700 dark:text-sky-300 mt-0.5">
                Setiap user yang dipilih akan memiliki tab sheet tersendiri. Kolom mencakup <strong>No, Tanggal, Nama Project, Keterangan, Kategori, Persentase Progres, dan Status</strong> dengan pewarnaan rapi sesuai template Engineering Monitoring Activity.
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 font-bold text-xs">
              {errorMessage}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 md:p-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end items-center gap-3 bg-slate-50/50 dark:bg-slate-950/20">
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="px-5 py-3 rounded-2xl font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isExporting || selectedUsernames.length === 0}
            onClick={handleDownload}
            className="px-7 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Membuat Excel...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download Excel ({selectedUsernames.length} User)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
