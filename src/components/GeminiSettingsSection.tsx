import React, { useState, useEffect } from 'react';
import { 
  Key, Plus, Trash2, Eye, EyeOff, CheckCircle2, AlertCircle, 
  RefreshCw, Sparkles, Shield, Cpu, Zap, Activity, Check, Copy,
  Database, Code, FileText, X, CloudCheck, Globe
} from 'lucide-react';
import { 
  GeminiApiKeyConfig, 
  GeminiSettings, 
  SUPPORTED_GEMINI_MODELS, 
  DEFAULT_GEMINI_SETTINGS,
  getStoredGeminiSettings, 
  syncGeminiSettingsToDatabase, 
  loadGeminiSettingsFromDatabase,
  testGeminiApiKey 
} from '../services/geminiKeyService';
import { SUPABASE_MIGRATION_SQL } from '../lib/supabaseMigrationSql';

const SQL_MIGRATION_SCRIPT = SUPABASE_MIGRATION_SQL;

import { checkSupabaseTableStatus } from '../lib/supabaseSync';

export const GeminiSettingsSection: React.FC = () => {
  const [settings, setSettings] = useState<GeminiSettings>(() => getStoredGeminiSettings());
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; latencyMs: number; modelUsed?: string }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveCloudStatus, setSaveCloudStatus] = useState<'synced' | 'local_only' | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [isRefreshingCloud, setIsRefreshingCloud] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [tableStatus, setTableStatus] = useState<{ isChecking: boolean; isReady: boolean; error?: string }>({
    isChecking: true,
    isReady: false
  });
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkInputText, setBulkInputText] = useState('');

  const checkTable = async () => {
    try {
      const res = await checkSupabaseTableStatus('app_settings');
      setTableStatus({ isChecking: false, isReady: res.isReady, error: res.error });
    } catch (err: any) {
      setTableStatus({ isChecking: false, isReady: false, error: err.message });
    }
  };

  const fetchCloudSettings = async () => {
    setIsRefreshingCloud(true);
    await checkTable();
    try {
      const serverSettings = await loadGeminiSettingsFromDatabase();
      if (serverSettings && serverSettings.apiKeys && serverSettings.apiKeys.length > 0) {
        setSettings(serverSettings);
        setSaveMessage('Pengaturan berhasil dimuat dari Cloud Database Supabase!');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.warn('Gagal memuat dari cloud:', err);
    } finally {
      setIsRefreshingCloud(false);
    }
  };

  // Sync settings from server/Supabase database on mount
  useEffect(() => {
    fetchCloudSettings();
  }, []);

  const toggleVisibility = (id: string) => {
    setVisibleKeyIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyKey = (id: string, keyVal: string) => {
    navigator.clipboard.writeText(keyVal);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleAddKey = () => {
    const newId = `key-${Date.now()}`;
    const newKey: GeminiApiKeyConfig = {
      id: newId,
      key: '',
      label: `API Key Cadangan ${settings.apiKeys.length + 1}`,
      isActive: true,
      isExhausted: false,
      successCount: 0,
      failCount: 0
    };
    setSettings(prev => ({
      ...prev,
      apiKeys: [...prev.apiKeys, newKey]
    }));
    setVisibleKeyIds(prev => ({ ...prev, [newId]: true }));
  };

  const handleUpdateKey = (id: string, updates: Partial<GeminiApiKeyConfig>) => {
    setSettings(prev => ({
      ...prev,
      apiKeys: prev.apiKeys.map(k => k.id === id ? { ...k, ...updates } : k)
    }));
  };

  const handleDeleteKey = (id: string) => {
    setSettings(prev => ({
      ...prev,
      apiKeys: prev.apiKeys.filter(k => k.id !== id),
      activeKeyIndex: 0
    }));
  };

  const handleResetExhausted = (id: string) => {
    setSettings(prev => ({
      ...prev,
      apiKeys: prev.apiKeys.map(k => k.id === id ? { ...k, isExhausted: false, exhaustedAt: undefined } : k)
    }));
  };

  const handleBulkImport = () => {
    const lines = bulkInputText.split('\n');
    const newKeysConfigs: GeminiApiKeyConfig[] = [];
    const existingKeys = settings.apiKeys.map(k => k.key.trim());

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed && !existingKeys.includes(trimmed)) {
        newKeysConfigs.push({
          id: `key-bulk-${Date.now()}-${idx}`,
          key: trimmed,
          label: `Key Impor ${settings.apiKeys.length + newKeysConfigs.length + 1}`,
          isActive: true,
          isExhausted: false,
          successCount: 0,
          failCount: 0
        });
      }
    });

    if (newKeysConfigs.length > 0) {
      setSettings(prev => ({
        ...prev,
        apiKeys: [...prev.apiKeys, ...newKeysConfigs]
      }));
      setSaveMessage(`Berhasil menambah ${newKeysConfigs.length} API Key baru! Klik Simpan untuk memperbarui database.`);
      setSaveSuccess(true);
      setSaveCloudStatus('local_only');
      setTimeout(() => setSaveSuccess(false), 5000);
    } else {
      alert("Tidak ada API Key baru yang valid ditemukan atau kunci sudah terdaftar.");
    }
    
    setIsBulkModalOpen(false);
    setBulkInputText('');
  };

  const handleTestKey = async (keyConfig: GeminiApiKeyConfig) => {
    if (!keyConfig.key.trim()) return;
    setTestingKeyId(keyConfig.id);
    try {
      const res = await testGeminiApiKey(keyConfig.key, settings.model || 'gemini-3.5-flash');
      setTestResults(prev => ({ ...prev, [keyConfig.id]: res }));
      if (res.success) {
        handleUpdateKey(keyConfig.id, { isExhausted: false, exhaustedAt: undefined, lastLatencyMs: res.latencyMs });
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [keyConfig.id]: { success: false, message: err.message || 'Gagal koneksi', latencyMs: 0 }
      }));
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const res = await syncGeminiSettingsToDatabase(settings);
      setSaveMessage(res.message);
      setSaveSuccess(true);
      setSaveCloudStatus(res.isCloudSynced ? 'synced' : 'local_only');
      await checkTable();
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err: any) {
      console.error('Failed to sync Gemini settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const activeKeysCount = settings.apiKeys.filter(k => k.isActive && k.key.trim().length > 0).length;
  const exhaustedKeysCount = settings.apiKeys.filter(k => k.isExhausted).length;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-700 p-6 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <Sparkles className="text-yellow-300 w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight text-white">Pengaturan Google Gemini AI</h3>
                <span className="bg-emerald-400/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-400/30 uppercase tracking-widest">
                  Gemini 3 Flash
                </span>
              </div>
              <p className="text-xs text-violet-100 mt-0.5">
                Multi-Key Management, rotasi otomatis (*auto-rolling* jika limit habis), dan tersimpan di database sistem.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-black/20 backdrop-blur-sm px-3.5 py-2 rounded-xl border border-white/10 text-xs">
            <Activity size={14} className="text-emerald-400" />
            <span className="font-medium text-slate-200">
              {activeKeysCount} Kunci Aktif
            </span>
            {exhaustedKeysCount > 0 && (
              <span className="text-amber-300 font-bold ml-1">
                ({exhaustedKeysCount} limit habis)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cloud Database Sync Status & Action Bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-700 flex-wrap">
          <Database size={15} className="text-violet-600" />
          <span className="font-semibold">Cloud Database Supabase:</span>
          {tableStatus.isReady ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Tersinkronisasi Lintas Perangkat (Tabel app_settings Aktif)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Perlu Eksekusi Script SQL Supabase
            </span>
          )}
          <span className="text-[11px] text-slate-400 hidden sm:inline">• Tabel: <code className="bg-slate-200/70 px-1 py-0.2 rounded font-mono text-[10px]">app_settings</code></span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchCloudSettings}
            disabled={isRefreshingCloud}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-700 font-semibold transition shadow-xs text-xs disabled:opacity-50 cursor-pointer"
            title="Muat ulang pengaturan langsung dari database Supabase"
          >
            <RefreshCw size={13} className={isRefreshingCloud ? "animate-spin text-violet-600" : "text-slate-500"} />
            <span>{isRefreshingCloud ? 'Memuat...' : 'Tarik dari Cloud'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSqlModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 font-semibold transition shadow-xs text-xs cursor-pointer"
            title="Lihat script SQL untuk Supabase"
          >
            <Code size={13} className="text-violet-600" />
            <span>Script SQL Supabase</span>
          </button>
        </div>
      </div>

      {/* Migration Alert Banner if Supabase table is not ready yet */}
      {!tableStatus.isChecking && !tableStatus.isReady && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 text-amber-800">
            <AlertCircle size={17} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">Tabel Database Belum Dibuat di Supabase (Penyebab API Key Belum Tersimpan)</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Supabase Anda belum memiliki tabel <code className="bg-amber-100 px-1 rounded font-bold font-mono">app_settings</code>. 
                Jalankan script update SQL di Supabase SQL Editor agar API Key otomatis aktif di perangkat lain (HP / tablet / browser lain).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSqlModalOpen(true)}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shrink-0 shadow-xs transition cursor-pointer"
          >
            <Code size={13} />
            <span>Buka & Salin Script SQL</span>
          </button>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Model Selection & Auto-Rolling Config */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Cpu size={14} className="text-violet-600" />
              Pilihan Model Gemini
            </label>
            <select
              value={settings.model}
              onChange={(e) => setSettings(prev => ({ ...prev, model: e.target.value }))}
              className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-violet-500 outline-none transition"
            >
              {SUPPORTED_GEMINI_MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Direkomendasikan menggunakan <strong>Gemini 3.5 Flash</strong> untuk kecepatan maksimal, penalaran konteks terbaik, dan konsumsi kuota hemat.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="space-y-1 pr-4">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-500" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Rotasi Kuota Otomatis (*Auto-Rolling*)</h4>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Jika salah satu API Key terkena limit kuota per menit/hari (HTTP 429), sistem otomatis beralih ke kunci berikutnya tanpa terputus.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, autoRotate: !prev.autoRotate }))}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.autoRotate ? 'bg-violet-600' : 'bg-slate-300'}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.autoRotate ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>

        {/* API Keys List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Key size={14} className="text-violet-600" />
                Daftar API Key Gemini ({settings.apiKeys.length})
              </h4>
              <p className="text-[11px] text-slate-400">
                Anda dapat menambahkan lebih dari 1 API Key. Sistem akan memakai kunci utama dan bergulir otomatis ke kunci cadangan jika kuota habis.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(true)}
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-xs transition active:scale-95"
              >
                <FileText size={14} />
                Tempel Masal
              </button>
              <button
                type="button"
                onClick={handleAddKey}
                className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold px-3 py-1.5 rounded-lg border border-violet-200 text-xs transition active:scale-95"
              >
                <Plus size={14} />
                Tambah API Key Baru
              </button>
            </div>
          </div>

          {settings.apiKeys.length === 0 ? (
            <div className="text-center py-8 px-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-3">
              <Key className="mx-auto text-slate-300 w-8 h-8" />
              <div>
                <p className="text-xs font-bold text-slate-700">Belum ada API Key Gemini yang didaftarkan</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Dapatkan API Key gratis di <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-violet-600 underline font-bold">Google AI Studio</a>, lalu tambahkan di sini.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddKey}
                className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition active:scale-95"
              >
                <Plus size={14} />
                Masukkan API Key Pertama
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {settings.apiKeys.map((keyConfig, index) => {
                const isVisible = !!visibleKeyIds[keyConfig.id];
                const testRes = testResults[keyConfig.id];
                const isTesting = testingKeyId === keyConfig.id;
                const isCurrentActive = index === settings.activeKeyIndex && keyConfig.isActive && !keyConfig.isExhausted;

                return (
                  <div
                    key={keyConfig.id}
                    className={`p-4 rounded-xl border transition-all ${
                      keyConfig.isExhausted
                        ? 'bg-amber-50/50 border-amber-200'
                        : isCurrentActive
                        ? 'bg-violet-50/40 border-violet-300 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <input
                          type="text"
                          value={keyConfig.label}
                          onChange={(e) => handleUpdateKey(keyConfig.id, { label: e.target.value })}
                          placeholder="Label (contoh: Key Utama, Key Cadangan)"
                          className="text-xs font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-300 hover:border-violet-500 focus:border-violet-600 outline-none px-1 py-0.5"
                        />
                        {isCurrentActive && (
                          <span className="bg-violet-100 text-violet-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-violet-200 flex items-center gap-1">
                            <Sparkles size={10} /> Dipakai Sekarang
                          </span>
                        )}
                        {keyConfig.isExhausted ? (
                          <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200 flex items-center gap-1">
                            <AlertCircle size={10} /> Kuota Habis (Auto-Rolled)
                          </span>
                        ) : keyConfig.isActive ? (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                            Siap Digunakan
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            Non-Aktif
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <label className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={keyConfig.isActive}
                            onChange={(e) => handleUpdateKey(keyConfig.id, { isActive: e.target.checked })}
                            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                          />
                          Aktif
                        </label>
                        {keyConfig.isExhausted && (
                          <button
                            type="button"
                            onClick={() => handleResetExhausted(keyConfig.id)}
                            className="text-[10px] text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded font-bold transition"
                            title="Reset status kuota habis agar bisa dicoba kembali"
                          >
                            Reset Kuota
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteKey(keyConfig.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="Hapus API Key ini"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Key Input Field */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={isVisible ? 'text' : 'password'}
                          value={keyConfig.key}
                          onChange={(e) => handleUpdateKey(keyConfig.id, { key: e.target.value.trim() })}
                          placeholder="AIzaSy..."
                          className="w-full p-2.5 pr-20 bg-slate-50 font-mono text-xs text-slate-800 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-violet-500 outline-none transition"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleVisibility(keyConfig.id)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded"
                            title={isVisible ? 'Sembunyikan' : 'Tampilkan'}
                          >
                            {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          {keyConfig.key && (
                            <button
                              type="button"
                              onClick={() => handleCopyKey(keyConfig.id, keyConfig.key)}
                              className="p-1 text-slate-400 hover:text-slate-600 rounded"
                              title="Salin Key"
                            >
                              {copiedKeyId === keyConfig.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTestKey(keyConfig)}
                        disabled={isTesting || !keyConfig.key.trim()}
                        className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold px-3 py-2.5 rounded-lg text-xs transition active:scale-95 whitespace-nowrap"
                      >
                        <RefreshCw size={12} className={isTesting ? 'animate-spin' : ''} />
                        {isTesting ? 'Menguji...' : 'Uji Koneksi'}
                      </button>
                    </div>

                    {/* Test result display */}
                    {testRes && (
                      <div
                        className={`mt-2 p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                          testRes.success
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {testRes.success ? (
                          <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="leading-tight">
                          <span className="font-bold">{testRes.message}</span>
                          {testRes.latencyMs > 0 && (
                            <span className="text-[10px] text-slate-500 ml-2">({testRes.latencyMs}ms)</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            {settings.lastUpdated && (
              <span>Terakhir diperbarui: {new Date(settings.lastUpdated).toLocaleString('id-ID')}</span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {saveSuccess && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${
                saveCloudStatus === 'synced'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-300'
                  : 'text-amber-800 bg-amber-50 border-amber-300'
              }`}>
                {saveCloudStatus === 'synced' ? (
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle size={15} className="text-amber-600 shrink-0" />
                )}
                <span>{saveMessage}</span>
                {saveCloudStatus === 'local_only' && (
                  <button
                    type="button"
                    onClick={() => setIsSqlModalOpen(true)}
                    className="ml-1.5 underline font-black text-amber-900 hover:text-black cursor-pointer"
                  >
                    Buka Script SQL
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="bg-violet-600 hover:bg-violet-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md shadow-violet-200 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-60 text-xs cursor-pointer"
            >
              <Check size={16} />
              {isSaving ? 'Menyimpan ke Cloud...' : 'Simpan Pengaturan Gemini AI'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Script SQL Supabase */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <Database className="text-violet-600" size={18} />
                <h3 className="font-bold text-sm text-slate-800 dark:text-zinc-100">Script SQL Update Supabase (app_settings & wa_chats)</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsSqlModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
              <p className="text-slate-600 dark:text-zinc-300">
                Jalankan script SQL ini di <strong>Supabase Dashboard &gt; SQL Editor &gt; New Query &gt; Run</strong> agar database Anda memiliki tabel <code>app_settings</code> (untuk API key aktif di semua perangkat) dan <code>wa_chats</code> (untuk riwayat chat per nomor terhubung):
              </p>

              <div className="relative">
                <pre className="p-3 bg-zinc-950 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto max-h-72 border border-zinc-800 select-all leading-relaxed">
                  {SQL_MIGRATION_SCRIPT}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SQL_MIGRATION_SCRIPT);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2500);
                  }}
                  className="absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs border border-zinc-700 shadow-sm transition cursor-pointer"
                >
                  {copiedSql ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedSql ? 'Tersalin!' : 'Salin SQL'}</span>
                </button>
              </div>

              <div className="p-3 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/50 rounded-xl text-violet-800 dark:text-violet-300 text-[11px] space-y-1">
                <p className="font-bold">💡 Petunjuk Singkat Penggunaan:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-violet-700 dark:text-violet-300">
                  <li>Buka project Supabase Anda di browser.</li>
                  <li>Klik menu <strong>SQL Editor</strong> di bilah navigasi kiri.</li>
                  <li>Tempel (Paste) script SQL di atas lalu klik tombol hijau <strong>Run</strong>.</li>
                  <li>Setelah selesai, kembali ke sini dan klik <strong>Simpan Pengaturan</strong>. Pengaturan dan API Key Anda kini otomatis aktif di semua perangkat!</li>
                </ol>
              </div>
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-zinc-900/50">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(SQL_MIGRATION_SCRIPT);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2500);
                }}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedSql ? 'Berhasil Tersalin!' : 'Salin Script SQL'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSqlModalOpen(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Bulk Import API Keys */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="text-violet-600" size={18} />
                <h3 className="font-bold text-sm text-slate-800 dark:text-zinc-100">Tempel Masal API Key Gemini</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                Tempelkan daftar API Key dari Notepad/Catatan Anda di bawah ini (pisahkan dengan baris baru). Sistem akan otomatis membersihkan spasi dan mengabaikan kunci yang sudah ada.
              </p>
              
              <textarea
                value={bulkInputText}
                onChange={(e) => setBulkInputText(e.target.value)}
                placeholder="AIzaSy...&#10;AIzaSy...&#10;AIzaSy..."
                className="w-full h-64 p-3 bg-slate-50 dark:bg-zinc-950 font-mono text-xs text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none resize-none transition"
              />

              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <Globe size={12} />
                <span>Pastikan format API Key valid dari Google AI Studio.</span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-zinc-900/50">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 text-slate-600 dark:text-zinc-400 font-bold text-xs hover:underline"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={!bulkInputText.trim()}
                className="px-6 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-sm transition active:scale-95 cursor-pointer"
              >
                Tambah Semua Kunci
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
