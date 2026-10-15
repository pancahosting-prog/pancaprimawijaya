import React, { useState, useEffect } from 'react';
import { 
  Key, Plus, Trash2, Eye, EyeOff, CheckCircle2, AlertCircle, 
  RefreshCw, Sparkles, Shield, Cpu, Zap, Activity, Check, Copy
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

export const GeminiSettingsSection: React.FC = () => {
  const [settings, setSettings] = useState<GeminiSettings>(() => getStoredGeminiSettings());
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<string, boolean>>({});
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; latencyMs: number; modelUsed?: string }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Sync settings from server database on mount
  useEffect(() => {
    let mounted = true;
    loadGeminiSettingsFromDatabase().then((serverSettings) => {
      if (mounted && serverSettings && serverSettings.apiKeys.length > 0) {
        setSettings(serverSettings);
      }
    });
    return () => { mounted = false; };
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
      setTimeout(() => setSaveSuccess(false), 3500);
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
                  Gemini 3.5 Flash
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
            <button
              type="button"
              onClick={handleAddKey}
              className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold px-3 py-1.5 rounded-lg border border-violet-200 text-xs transition active:scale-95"
            >
              <Plus size={14} />
              Tambah API Key Baru
            </button>
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

          <div className="flex items-center gap-3">
            {saveSuccess && (
              <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-bold animate-pulse">
                <CheckCircle2 size={14} />
                <span>{saveMessage || 'Tersimpan di Database & LocalStorage!'}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="bg-violet-600 hover:bg-violet-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md shadow-violet-200 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-60 text-xs"
            >
              <Check size={16} />
              {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan Gemini AI'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
