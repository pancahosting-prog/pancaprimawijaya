import React, { useState, useEffect } from 'react';
import {
  Bell,
  QrCode,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Send,
  Save,
  Check,
  ShieldCheck,
  Terminal,
  MessageSquare,
  Clock,
  Sparkles
} from 'lucide-react';
import { getApiUrl } from '../lib/apiUtils';

export interface WANotifSettings {
  autoReminderEnabled: boolean;
  billingReminderTemplate: string;
  followupReminderTemplate: string;
  dueDateReminderDays: number;
  logs: {
    id: string;
    timestamp: number;
    targetPhone: string;
    targetName: string;
    message: string;
    status: 'success' | 'failed';
    type: 'billing' | 'followup' | 'remote_command' | 'manual';
  }[];
}

export const WANotifDeviceTab: React.FC = () => {
  const [notifStatus, setNotifStatus] = useState<{
    connectionState: 'disconnected' | 'connecting' | 'connected';
    qrCodeBase64: string | null;
    rawQrCodeBase64?: string | null;
    qrTimestamp?: number;
    qrVersion?: number;
    qrExpired?: boolean;
    userPhone: string | null;
    userName: string | null;
  }>({
    connectionState: 'disconnected',
    qrCodeBase64: null,
    qrTimestamp: 0,
    qrVersion: 0,
    qrExpired: false,
    userPhone: null,
    userName: null
  });

  const [qrCountdown, setQrCountdown] = useState<number>(60);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Manual Test Send State
  const [testPhone, setTestPhone] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>('Halo! Ini adalah uji coba pesan notifikasi dari Perangkat 2 (WhatsApp Notifikasi MyPanca).');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [testSendResult, setTestSendResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Settings State
  const [settings, setSettings] = useState<WANotifSettings>({
    autoReminderEnabled: true,
    billingReminderTemplate: 'Halo {nama}, ini pengingat tagihan transaksi {noTrx} senilai Rp {nominal} jatuh tempo pada {tanggal}. Terima kasih!',
    followupReminderTemplate: 'Halo {nama}, menyambung penawaran {noTrx}, apakah ada hal yang bisa kami bantu?',
    dueDateReminderDays: 3,
    logs: []
  });
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Remote Command Tester
  const [testCommand, setTestCommand] = useState<string>('kirim pesan ke maria: tolong followup cust A');
  const [isTestingCommand, setIsTestingCommand] = useState<boolean>(false);
  const [commandResult, setCommandResult] = useState<any>(null);

  const fetchNotifStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/wa-notif/status'));
      if (res.ok) {
        const data = await res.json();
        setNotifStatus({
          connectionState: data.connectionState,
          qrCodeBase64: data.qrCodeBase64,
          rawQrCodeBase64: data.rawQrCodeBase64 || data.qrCodeBase64,
          qrTimestamp: data.qrTimestamp,
          qrVersion: data.qrVersion,
          qrExpired: data.qrExpired,
          userPhone: data.userPhone,
          userName: data.userName
        });
      }
    } catch (err) {
      console.error('Error fetching WA Notif status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotifSettings = async () => {
    try {
      const res = await fetch(getApiUrl('/api/wa-notif/settings'));
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (err) {
      console.error('Error fetching WA Notif settings:', err);
    }
  };

  useEffect(() => {
    fetchNotifStatus();
    fetchNotifSettings();

    const interval = setInterval(() => {
      fetchNotifStatus();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // QR countdown
  useEffect(() => {
    if (notifStatus.connectionState === 'connected' || !notifStatus.qrCodeBase64 || notifStatus.qrExpired) {
      return;
    }
    const timer = setInterval(() => {
      setQrCountdown(prev => {
        if (prev <= 1) {
          fetchNotifStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [notifStatus.connectionState, notifStatus.qrCodeBase64, notifStatus.qrExpired, notifStatus.qrVersion]);

  const handleConnectNotif = async (force = false) => {
    setIsLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/wa-notif/connect?force=${force ? 'true' : 'false'}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });
      if (res.ok) {
        const data = await res.json();
        setNotifStatus(prev => ({
          ...prev,
          connectionState: data.connectionState,
          qrCodeBase64: data.qrCodeBase64,
          rawQrCodeBase64: data.rawQrCodeBase64 || data.qrCodeBase64,
          qrVersion: data.qrVersion,
          qrExpired: data.qrExpired,
          qrTimestamp: data.qrTimestamp
        }));
        setQrCountdown(60);
      }
    } catch (err) {
      console.error('Error connecting WA Notif:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoutNotif = async () => {
    if (!confirm('Putuskan koneksi Perangkat 2 (WhatsApp Notifikasi)?')) return;
    setIsLoading(true);
    try {
      await fetch(getApiUrl('/api/wa-notif/logout'), { method: 'POST' });
      fetchNotifStatus();
    } catch (err) {
      console.error('Error logging out WA Notif:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTestNotif = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim() || !testMessage.trim()) return;

    setIsSendingTest(true);
    setTestSendResult(null);
    try {
      const res = await fetch(getApiUrl('/api/wa-notif/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone.trim(), text: testMessage.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setTestSendResult({ success: true, msg: 'Pesan notifikasi uji coba berhasil dikirim!' });
        fetchNotifSettings();
      } else {
        setTestSendResult({ success: false, msg: data.error || 'Gagal mengirim pesan notifikasi.' });
      }
    } catch (err: any) {
      setTestSendResult({ success: false, msg: err.message || 'Error koneksi server.' });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleExecuteTestCommand = async () => {
    if (!testCommand.trim()) return;
    setIsTestingCommand(true);
    setCommandResult(null);
    try {
      const res = await fetch(getApiUrl('/api/wa-notif/execute-command'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: testCommand.trim(), superadminName: 'Superadmin' })
      });
      const data = await res.json();
      setCommandResult(data);
      fetchNotifSettings();
    } catch (err: any) {
      setCommandResult({ success: false, error: err.message });
    } finally {
      setIsTestingCommand(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const res = await fetch(getApiUrl('/api/wa-notif/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSaveSuccessMsg('Pengaturan WhatsApp Notifikasi Berhasil Disimpan!');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto custom-scrollbar overflow-y-auto h-full pb-20">
      
      {/* Title Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white rounded-2xl p-5 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-white text-xl shrink-0">
            <Bell size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight">WhatsApp Notifikasi Sistem (Perangkat 2)</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                notifStatus.connectionState === 'connected'
                  ? 'bg-emerald-400 text-zinc-950'
                  : 'bg-rose-400 text-zinc-950'
              }`}>
                {notifStatus.connectionState === 'connected' ? `Online: +${notifStatus.userPhone}` : 'Offline'}
              </span>
            </div>
            <p className="text-xs text-blue-100 mt-1">
              Khusus pengiriman notifikasi pengingat tagihan, reminder follow-up, dan eksekusi Remote Command Superadmin dari chat AI (/app).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchNotifStatus()}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg backdrop-blur-md transition flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh Status</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column: Connection & QR Code */}
        <div className="md:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <QrCode size={18} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Koneksi QR Perangkat 2</h3>
            </div>
            <span className="text-[11px] text-zinc-400">Notif Gateway</span>
          </div>

          {notifStatus.connectionState === 'connected' ? (
            <div className="p-5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 size={28} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-300">Perangkat 2 Terhubung!</h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
                  +{notifStatus.userPhone}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
                  Siap mengirimkan notifikasi tagihan & menerima Remote Command dari Superadmin.
                </p>
              </div>

              <button
                type="button"
                onClick={handleLogoutNotif}
                className="mt-3 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition shadow-sm cursor-pointer w-full"
              >
                Putuskan Sesi WhatsApp Notifikasi
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center space-y-4 p-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/40">
              {notifStatus.qrCodeBase64 && !notifStatus.qrExpired ? (
                <div className="space-y-3 flex flex-col items-center">
                  <div className="relative p-2 bg-white rounded-xl shadow-md border border-zinc-200">
                    <img src={notifStatus.qrCodeBase64} alt="QR Code Notifikasi" className="w-48 h-48 object-contain" />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <Clock size={14} />
                    <span>Kadaluarsa dalam: <b>{qrCountdown}s</b></span>
                  </div>
                </div>
              ) : (
                <div className="py-8 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Barcode QR Belum Dimuat</p>
                    <p className="text-[11px] text-zinc-400">Klik tombol di bawah untuk membuat barcode scan baru khusus nomor notifikasi.</p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleConnectNotif(true)}
                disabled={isLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                <span>{notifStatus.qrCodeBase64 ? 'Muat Ulang Barcode QR' : 'Mulai / Dapatkan Barcode QR'}</span>
              </button>
            </div>
          )}

          {/* Guide Note */}
          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl text-xs space-y-1.5 text-blue-900 dark:text-blue-300">
            <div className="font-bold flex items-center gap-1">
              <ShieldCheck size={14} className="text-blue-600" />
              <span>Petunjuk Perangkat Terhubung:</span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <li>Perangkat 2 khusus digunakan untuk <b>System Notification Engine</b>.</li>
              <li>Perangkat 1 (WA CS AI) tetap aktif melayani chat pelanggan tanpa terganggu.</li>
              <li>Nomor Perangkat 2 dapat di-scan dari HP milik admin/sistem mana saja.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Remote Command Gateway & Manual Notification Tester */}
        <div className="md:col-span-7 space-y-6">
          
          {/* Remote Command Gateway Tester Card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Remote Command Gateway (Uji Perintah Superadmin)</h3>
              </div>
              <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded text-[10px] font-bold">
                Inbound `/app` AI
              </span>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Superadmin dapat mengetik perintah kirim pesan langsung di chat AI halaman <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-indigo-600 font-mono">/app</code>. AI akan menerjemahkan perintah tersebut dan menginstruksikan **Perangkat 2 (WhatsApp Notifikasi)** untuk mengirimkannya.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Uji Perintah Perintah Bahasa Alami:
                </label>
                <input
                  type="text"
                  value={testCommand}
                  onChange={e => setTestCommand(e.target.value)}
                  placeholder="Contoh: kirim pesan ke maria: tolong followup cust A"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleExecuteTestCommand}
                disabled={isTestingCommand || !testCommand.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={14} />
                <span>{isTestingCommand ? 'Mengeksekusi...' : 'Eksekusi Remote Command'}</span>
              </button>

              {commandResult && (
                <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  commandResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-300'
                }`}>
                  <div className="font-bold flex items-center gap-1">
                    {commandResult.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    <span>{commandResult.success ? 'Remote Command Berhasil Dieksekusi!' : 'Remote Command Terkendala'}</span>
                  </div>
                  {commandResult.success ? (
                    <div className="space-y-1 text-[11px]">
                      <div><b>Penerima:</b> {commandResult.targetName} ({commandResult.targetPhone})</div>
                      <div><b>Pesan Dikirim:</b> "{commandResult.messageSent}"</div>
                      <div><b>Eksekutor:</b> WhatsApp Notifikasi (Perangkat 2)</div>
                    </div>
                  ) : (
                    <div className="text-[11px]">{commandResult.error || 'Terjadi kesalahan.'}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Direct Manual Test Notification Send */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Uji Pengiriman Notifikasi Langsung</h3>
              </div>
            </div>

            <form onSubmit={handleSendTestNotif} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    No. WA Tujuan:
                  </label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={e => setTestPhone(e.target.value)}
                    placeholder="Contoh: 08123456789"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Pesan Notifikasi:
                </label>
                <textarea
                  rows={2}
                  value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSendingTest || !testPhone.trim() || !testMessage.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send size={14} />
                <span>{isSendingTest ? 'Kirim Pesan Notifikasi...' : 'Kirim Uji Coba Notifikasi'}</span>
              </button>

              {testSendResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  testSendResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {testSendResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{testSendResult.msg}</span>
                </div>
              )}
            </form>
          </div>

          {/* Template Settings */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Template Pesan Notifikasi Otomatis</h3>
              </div>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Save size={13} />
                <span>{isSavingSettings ? 'Menyimpan...' : 'Simpan Template'}</span>
              </button>
            </div>

            {saveSuccessMsg && (
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs rounded-lg flex items-center gap-1.5">
                <Check size={15} />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Template Pengingat Tagihan (Billing Due Date Reminder):
                </label>
                <textarea
                  rows={2}
                  value={settings.billingReminderTemplate}
                  onChange={e => setSettings({ ...settings, billingReminderTemplate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
                <p className="text-[10px] text-zinc-400 mt-0.5">Placeholder: &#123;nama&#125;, &#123;noTrx&#125;, &#123;nominal&#125;, &#123;tanggal&#125;</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Template Pengingat Follow-up Penawaran:
                </label>
                <textarea
                  rows={2}
                  value={settings.followupReminderTemplate}
                  onChange={e => setSettings({ ...settings, followupReminderTemplate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
                <p className="text-[10px] text-zinc-400 mt-0.5">Placeholder: &#123;nama&#125;, &#123;noTrx&#125;, &#123;produk&#125;</p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
