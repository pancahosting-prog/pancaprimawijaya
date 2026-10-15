import React, { useState, useEffect } from 'react';
import {
  Bot,
  QrCode,
  UserCheck,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Save,
  Shield,
  Database,
  Users,
  Clock,
  LogOut,
  Sliders
} from 'lucide-react';

export interface WhitelistUser {
  id: string;
  name: string;
  phone: string;
  role: 'superadmin' | 'admin' | 'sales' | 'finance' | 'hr' | 'employee';
  isActive: boolean;
  addedAt: number;
}

export interface CompanyAISettings {
  enabled: boolean;
  botName: string;
  whitelistedUsers: WhitelistUser[];
  allowReadTransactions: boolean;
  allowReadProducts: boolean;
  allowReadContacts: boolean;
  allowReadFinance: boolean;
  allowReadEmployees: boolean;
  systemInstruction: string;
  unauthorizedMessage: string;
  logs: {
    id: string;
    timestamp: number;
    phone: string;
    userName: string;
    userRole: string;
    question: string;
    answer: string;
  }[];
}

export interface CompanyAISettingsSectionProps {
  initialTab?: 'qr' | 'whitelist' | 'permissions' | 'logs';
}

export const CompanyAISettingsSection: React.FC<CompanyAISettingsSectionProps> = ({ initialTab = 'qr' }) => {
  const [activeTab, setActiveTab] = useState<'qr' | 'whitelist' | 'permissions' | 'logs'>(initialTab);

  // Sync activeTab if initialTab changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Status Koneksi WA AI Perusahaan
  const [status, setStatus] = useState<{
    connectionState: 'disconnected' | 'connecting' | 'connected';
    qrCodeBase64: string | null;
    userPhone: string | null;
    userName: string | null;
  }>({
    connectionState: 'disconnected',
    qrCodeBase64: null,
    userPhone: null,
    userName: null
  });

  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);

  // Settings & Whitelist
  const [settings, setSettings] = useState<CompanyAISettings>({
    enabled: true,
    botName: 'AI Perusahaan MyPanca',
    whitelistedUsers: [],
    allowReadTransactions: true,
    allowReadProducts: true,
    allowReadContacts: true,
    allowReadFinance: true,
    allowReadEmployees: true,
    systemInstruction: 'Anda adalah Asisten Eksekutif AI Perusahaan MyPanca...',
    unauthorizedMessage: 'Mohon maaf, nomor WhatsApp Anda belum terdaftar dalam Whitelist AI Perusahaan.',
    logs: []
  });

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Form Whitelist Baru
  const [newWhitelister, setNewWhitelister] = useState<{
    name: string;
    phone: string;
    role: WhitelistUser['role'];
  }>({
    name: '',
    phone: '',
    role: 'sales'
  });
  const [whitelistError, setWhitelistError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/company-ai/status');
      if (res.ok) {
        const data = await res.json();
        setStatus({
          connectionState: data.connectionState,
          qrCodeBase64: data.qrCodeBase64,
          userPhone: data.userPhone,
          userName: data.userName
        });
      }
    } catch (err) {
      console.error('Error fetching Company AI status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/company-ai/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (err) {
      console.error('Error fetching Company AI settings:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchSettings();

    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleInitConnection = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/company-ai/connect', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatus(prev => ({
          ...prev,
          connectionState: data.connectionState,
          qrCodeBase64: data.qrCodeBase64
        }));
      }
    } catch (err) {
      console.error('Error initializing Company AI connection:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleLogoutWA = async () => {
    if (!confirm('Putuskan koneksi nomor WhatsApp AI Perusahaan ini?')) return;
    try {
      await fetch('/api/company-ai/logout', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error('Error logging out Company AI WA:', err);
    }
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhitelister.name || !newWhitelister.phone) {
      setWhitelistError('Nama dan Nomor WhatsApp wajib diisi.');
      return;
    }

    setWhitelistError(null);
    try {
      const res = await fetch('/api/company-ai/whitelist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWhitelister)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(data.settings);
        setNewWhitelister({ name: '', phone: '', role: 'sales' });
      } else {
        setWhitelistError(data.error || 'Gagal menambahkan ke whitelist.');
      }
    } catch (err) {
      console.error('Error adding whitelist user:', err);
    }
  };

  const handleDeleteWhitelist = async (id: string) => {
    if (!confirm('Hapus pengguna ini dari Whitelist AI Perusahaan?')) return;
    try {
      const res = await fetch('/api/company-ai/whitelist/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      }
    } catch (err) {
      console.error('Error deleting whitelist item:', err);
    }
  };

  const handleToggleWhitelistActive = (id: string) => {
    const updated = settings.whitelistedUsers.map(u => 
      u.id === id ? { ...u, isActive: !u.isActive } : u
    );
    setSettings({ ...settings, whitelistedUsers: updated });
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/company-ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSaveSuccessMsg('Pengaturan AI Perusahaan & Whitelist berhasil disimpan!');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch (err) {
      console.error('Error saving Company AI settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
      
      {/* Header Utama Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-black shadow-xs">
            <Bot size={22} />
          </div>
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
              WhatsApp AI Perusahaan (Internal Assistant)
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                status.connectionState === 'connected'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
              }`}>
                {status.connectionState === 'connected' ? '● Connected' : 'Disconnected'}
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Asisten AI internal perusahaan untuk membaca data transaksi, stok, dan laporan via WhatsApp dengan filter Whitelist Pengguna.
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center gap-1.5 shadow-xs self-start sm:self-auto"
        >
          <Save size={14} />
          <span>{isSaving ? 'Simpan...' : 'Simpan Konfigurasi'}</span>
        </button>
      </div>

      {saveSuccessMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Sub Tabs Inside Settings */}
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('qr')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'qr'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <QrCode size={14} />
          <span>Perangkat (QR Code)</span>
        </button>

        <button
          onClick={() => setActiveTab('whitelist')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'whitelist'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Shield size={14} />
          <span>Whitelist User ({settings.whitelistedUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('permissions')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'permissions'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Database size={14} />
          <span>Hak Akses Data Perusahaan</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'logs'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Clock size={14} />
          <span>Riwayat Interaksi AI</span>
        </button>
      </div>

      {/* TAB 1: PERANGKAT QR CODE SCAN */}
      {activeTab === 'qr' && (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4">
          <div className="text-center max-w-lg mx-auto space-y-1">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center justify-center gap-2">
              <Smartphone size={18} /> Sambungkan Nomor WhatsApp Bot AI Perusahaan
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Nomor ini nantinya khusus menerima pesan dari pengguna Whitelist internal perusahaan.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md mx-auto">
            {status.connectionState === 'connected' ? (
              <div className="text-center space-y-3 p-2">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center mx-auto font-black shadow-xs">
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                  Bot AI Perusahaan Terhubung
                </h4>
                <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
                  <p>Nama Akun: <strong className="text-zinc-900 dark:text-zinc-100">{status.userName || 'Bot AI'}</strong></p>
                  <p>Nomor: <strong className="font-mono text-zinc-900 dark:text-zinc-100">{status.userPhone || '-'}</strong></p>
                </div>

                <button
                  onClick={handleLogoutWA}
                  className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 mx-auto shadow-xs"
                >
                  <LogOut size={14} />
                  <span>Putuskan Sesi Bot</span>
                </button>
              </div>
            ) : status.qrCodeBase64 ? (
              <div className="text-center space-y-3">
                <div className="p-3 bg-white rounded-2xl border border-zinc-200 shadow-sm inline-block">
                  <img
                    src={status.qrCodeBase64}
                    alt="Company AI WhatsApp Barcode QR"
                    className="w-52 h-52 object-contain mx-auto"
                  />
                </div>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 animate-pulse">
                  Scan QR Code di atas dari WhatsApp HP nomor khusus Bot AI Perusahaan
                </p>
              </div>
            ) : (
              <div className="text-center space-y-3 p-4">
                <QrCode size={42} className="mx-auto text-zinc-400 opacity-40" />
                <p className="text-xs text-zinc-500">
                  Klik tombol di bawah untuk membuat barcode QR koneksi AI Perusahaan.
                </p>
                <button
                  onClick={handleInitConnection}
                  disabled={isLoadingStatus}
                  className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center gap-1.5 mx-auto shadow-xs"
                >
                  <RefreshCw size={14} className={isLoadingStatus ? 'animate-spin' : ''} />
                  <span>{isLoadingStatus ? 'Memuat QR...' : 'Buat Barcode QR Koneksi'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: KELOLA WHITELIST PENGGUNA INTERNAL */}
      {activeTab === 'whitelist' && (
        <div className="space-y-4">
          
          {/* Form Tambah Whitelist */}
          <form onSubmit={handleAddWhitelist} className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <UserCheck size={14} /> Tambah Pengguna Terotorisasi (Whitelist)
            </h3>

            {whitelistError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{whitelistError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">Nama Anggota Tim</label>
                <input
                  type="text"
                  placeholder="Contoh: Budi Manager Sales"
                  value={newWhitelister.name}
                  onChange={(e) => setNewWhitelister({ ...newWhitelister, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Nomor WA (Format 08... / 628...)</label>
                <input
                  type="text"
                  placeholder="Contoh: 081234567890"
                  value={newWhitelister.phone}
                  onChange={(e) => setNewWhitelister({ ...newWhitelister, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Role / Jabatan Perusahaan</label>
                <div className="flex items-center gap-2">
                  <select
                    value={newWhitelister.role}
                    onChange={(e) => setNewWhitelister({ ...newWhitelister, role: e.target.value as WhitelistUser['role'] })}
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
                  >
                    <option value="superadmin">Super Admin / Direksi</option>
                    <option value="admin">Admin Operasional</option>
                    <option value="sales">Sales & Commercial</option>
                    <option value="finance">Finance & Akuntansi</option>
                    <option value="hr">HR & Personalia</option>
                    <option value="employee">Karyawan Umum</option>
                  </select>

                  <button
                    type="submit"
                    className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center gap-1 shrink-0 shadow-xs"
                  >
                    <Plus size={14} />
                    <span>Tambah</span>
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Tabel Whitelist User */}
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-400 font-bold uppercase text-[10px] border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="p-3">Nama Anggota</th>
                  <th className="p-3">Nomor WhatsApp</th>
                  <th className="p-3">Role Perusahaan</th>
                  <th className="p-3">Status Akses</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-medium">
                {settings.whitelistedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-zinc-400">
                      Belum ada nomor WhatsApp terdaftar di Whitelist.
                    </td>
                  </tr>
                ) : (
                  settings.whitelistedUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                      <td className="p-3 font-bold text-zinc-900 dark:text-zinc-100">
                        {u.name}
                      </td>
                      <td className="p-3 font-mono text-zinc-600 dark:text-zinc-400">
                        +{u.phone}
                      </td>
                      <td className="p-3">
                        <span className="px-2.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-full font-bold text-[10px] uppercase">
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => handleToggleWhitelistActive(u.id)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            u.isActive
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800'
                          }`}
                        >
                          {u.isActive ? 'Aktif (Diberi Akses)' : 'Non-Aktif'}
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteWhitelist(u.id)}
                          className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-500 rounded-lg transition-colors"
                          title="Hapus dari Whitelist"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: HAK AKSES DATA PERUSAHAAN */}
      {activeTab === 'permissions' && (
        <div className="space-y-4">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <Sliders size={14} /> Cakupan Data Yang Boleh Dibaca AI Perusahaan
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-bold">
              <label className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowReadTransactions}
                  onChange={(e) => setSettings({ ...settings, allowReadTransactions: e.target.checked })}
                  className="rounded text-zinc-900 focus:ring-zinc-900"
                />
                <span>Data Transaksi & Penawaran</span>
              </label>

              <label className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowReadProducts}
                  onChange={(e) => setSettings({ ...settings, allowReadProducts: e.target.checked })}
                  className="rounded text-zinc-900 focus:ring-zinc-900"
                />
                <span>Katalog Produk & Stok Asset</span>
              </label>

              <label className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowReadContacts}
                  onChange={(e) => setSettings({ ...settings, allowReadContacts: e.target.checked })}
                  className="rounded text-zinc-900 focus:ring-zinc-900"
                />
                <span>Data Kontak & Client CRM</span>
              </label>

              <label className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowReadFinance}
                  onChange={(e) => setSettings({ ...settings, allowReadFinance: e.target.checked })}
                  className="rounded text-zinc-900 focus:ring-zinc-900"
                />
                <span>Laporan Keuangan & Piutang</span>
              </label>

              <label className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowReadEmployees}
                  onChange={(e) => setSettings({ ...settings, allowReadEmployees: e.target.checked })}
                  className="rounded text-zinc-900 focus:ring-zinc-900"
                />
                <span>Data Karyawan & HR</span>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold mb-1">Pesan Rejection (Untuk Pengguna Luar Whitelist)</label>
              <input
                type="text"
                value={settings.unauthorizedMessage}
                onChange={(e) => setSettings({ ...settings, unauthorizedMessage: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium outline-none focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">Instruksi Prompt Eksekutif AI Perusahaan</label>
              <textarea
                rows={3}
                value={settings.systemInstruction}
                onChange={(e) => setSettings({ ...settings, systemInstruction: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium outline-none focus:border-zinc-900 resize-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RIWAYAT LOG PERCAKAPAN AI */}
      {activeTab === 'logs' && (
        <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-400 font-bold uppercase text-[10px] border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="p-3">Waktu</th>
                <th className="p-3">Pengguna Internal</th>
                <th className="p-3">Role</th>
                <th className="p-3">Pertanyaan</th>
                <th className="p-3">Respon AI Perusahaan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-medium">
              {settings.logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-zinc-400">
                    Belum ada riwayat pertanyaan dari pengguna Whitelist.
                  </td>
                </tr>
              ) : (
                settings.logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                    <td className="p-3 text-zinc-400 text-[10px] font-mono shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 font-bold">
                      {log.userName}
                      <span className="block text-[10px] font-mono text-zinc-400 font-normal">+{log.phone}</span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md font-bold text-[10px] uppercase">
                        {log.userRole}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-700 dark:text-zinc-300 max-w-[200px] truncate">
                      {log.question}
                    </td>
                    <td className="p-3 text-zinc-900 dark:text-zinc-100 max-w-[300px] truncate">
                      {log.answer}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};
