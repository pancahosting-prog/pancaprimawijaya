import React, { useState, useEffect, useRef } from 'react';
import { 
  PhoneOff, Mic, MicOff, Volume2, VolumeX, Settings, 
  Sparkles, Bot, AlertCircle, RefreshCw, Plus, Trash2, Check,
  Radio, X, ExternalLink, Hand, Volume1, ShieldCheck
} from 'lucide-react';
import { 
  getStoredGeminiLiveSettings, 
  saveStoredGeminiLiveSettings, 
  syncGeminiLiveSettingsToDatabase,
  getStoredGeminiSettings,
  SUPPORTED_GEMINI_LIVE_MODELS,
  callGeminiLiveVoiceWithRolling,
  GeminiSettings,
  GeminiApiKeyConfig
} from '../../services/geminiKeyService';
import { 
  PancaAIContext, 
  generatePancaDataDigest, 
  compileSystemAggregations,
  getProductStock
} from '../../services/pancaAIService';

interface PancaAICallModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    username: string;
    role: string;
    nama: string;
  };
  context: PancaAIContext;
}

export const PancaAICallModal: React.FC<PancaAICallModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  context
}) => {
  const [callDuration, setCallDuration] = useState<number>(0);
  const [callState, setCallState] = useState<'connecting' | 'listening' | 'processing' | 'speaking' | 'idle' | 'cooldown'>('connecting');
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<{ userText: string; aiText: string }>({
    userText: '',
    aiText: 'Halo! Saya Panca AI Assistant. Silakan bicara langsung, ada data stok produk, laporan omzet, atau transaksi yang ingin diperiksa?'
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [liveSettings, setLiveSettings] = useState<GeminiSettings>(getStoredGeminiLiveSettings());
  const [newKeyInput, setNewKeyInput] = useState<string>('');
  const [newKeyLabel, setNewKeyLabel] = useState<string>('');
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [recognitionActive, setRecognitionActive] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Anti-Echo & Loudspeaker Acoustic Gate Refs
  const isAISpeakingRef = useRef<boolean>(false);
  const lastAISpokenTextRef = useRef<string>('');
  const lastAISpokenTimeRef = useRef<number>(0);
  const echoCooldownTimerRef = useRef<any>(null);
  const speechSafetyTimeoutRef = useRef<any>(null);
  const isProcessingRef = useRef<boolean>(false);

  // Initialize SpeechSynthesis
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Handle call timer & greeting lifecycle
  useEffect(() => {
    if (isOpen) {
      setCallDuration(0);
      setCallState('connecting');
      isAISpeakingRef.current = false;
      isProcessingRef.current = false;

      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      const connectTimer = setTimeout(() => {
        const greeting = 'Halo! Saya Panca AI Assistant. Silakan bicara langsung, ada data stok produk, laporan omzet, atau transaksi yang ingin diperiksa?';
        setTranscript(prev => ({ ...prev, aiText: greeting }));
        speakAIResponse(greeting);
      }, 1000);

      return () => {
        clearInterval(timerRef.current);
        clearTimeout(connectTimer);
        clearTimeout(echoCooldownTimerRef.current);
        clearTimeout(speechSafetyTimeoutRef.current);
        stopSpeech();
        stopRecognition();
        isAISpeakingRef.current = false;
        isProcessingRef.current = false;
      };
    }
  }, [isOpen]);

  // Acoustic Echo Detector: suppresses loudspeaker bleed
  const isAcousticEcho = (userSpeech: string): boolean => {
    if (!userSpeech || !userSpeech.trim()) return true;
    const now = Date.now();
    // If AI speech finished less than 1100ms ago, it's very likely speaker bleed
    if (now - lastAISpokenTimeRef.current < 1100) {
      console.log('[EchoGuard] Rejected speech within 1.1s cooldown of AI speech');
      return true;
    }

    const cleanUser = userSpeech.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const cleanAI = lastAISpokenTextRef.current.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

    if (!cleanUser || !cleanAI) return false;

    // Direct substring or inclusion if speech is long enough
    if (cleanAI.includes(cleanUser) && cleanUser.length > 4) {
      console.log('[EchoGuard] Rejected user speech matching AI spoken text substring');
      return true;
    }

    // Word overlap check
    const userWords = cleanUser.split(/\s+/).filter(w => w.length > 3);
    if (userWords.length > 0) {
      const aiWordsSet = new Set(cleanAI.split(/\s+/));
      let matchCount = 0;
      for (const w of userWords) {
        if (aiWordsSet.has(w)) matchCount++;
      }
      const overlapRatio = matchCount / userWords.length;
      if (overlapRatio > 0.6 && now - lastAISpokenTimeRef.current < 5000) {
        console.log('[EchoGuard] Rejected user speech due to >60% word overlap with AI response');
        return true;
      }
    }

    return false;
  };

  // Handle Speech Recognition with Half-Duplex Gate (Muted during AI Speech)
  const startRecognition = () => {
    if (typeof window === 'undefined' || isAISpeakingRef.current) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available in this browser');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalUserSpeech = '';

      recognition.onstart = () => {
        setRecognitionActive(true);
      };

      recognition.onresult = (event: any) => {
        // If AI is currently speaking or in cooldown, discard immediately to prevent feedback loop!
        if (isAISpeakingRef.current) {
          return;
        }

        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalUserSpeech += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = (finalUserSpeech || interimTranscript).trim();
        if (currentText) {
          setTranscript(prev => ({ ...prev, userText: currentText }));
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[CallModal] Speech recognition notice:', event.error);
        if (event.error === 'not-allowed') {
          setStatusMessage('Izin mikrofon belum diberikan pada browser.');
        }
      };

      recognition.onend = () => {
        setRecognitionActive(false);
        // If final utterance captured, not muted, and AI is not speaking
        if (finalUserSpeech.trim().length > 0 && !isMicMuted && !isAISpeakingRef.current) {
          const userQuery = finalUserSpeech.trim();
          finalUserSpeech = '';
          if (!isAcousticEcho(userQuery)) {
            handleProcessVoiceQuery(userQuery);
          } else {
            console.log('[CallModal] Echo detected from loudspeaker, discarding');
            setCallState('listening');
          }
        } else if (isOpen && !isMicMuted && callState === 'listening' && !isAISpeakingRef.current) {
          // Restart listening loop safely
          try {
            recognition.start();
          } catch {
            // ignore
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
    }
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setRecognitionActive(false);
  };

  // Turn management: start/stop listening based on state
  useEffect(() => {
    if (isOpen && !isMicMuted && callState === 'listening' && !isAISpeakingRef.current) {
      startRecognition();
    } else {
      stopRecognition();
    }
  }, [isOpen, isMicMuted, callState]);

  // Speak AI Response with Natural Voice and Acoustic Echo Protection
  const speakAIResponse = (text: string) => {
    if (!isOpen) return;

    // 1. Immediately abort microphone so it NEVER captures the loudspeaker sound
    stopRecognition();

    if (isSpeakerMuted || !synthRef.current) {
      isAISpeakingRef.current = false;
      setCallState('listening');
      return;
    }

    try {
      // Cancel previous speech safely
      synthRef.current.cancel();
      clearTimeout(echoCooldownTimerRef.current);
      clearTimeout(speechSafetyTimeoutRef.current);

      isAISpeakingRef.current = true;
      setCallState('speaking');

      // Clean text for natural speech synthesis
      const cleanVoiceText = text
        .replace(/#{1,6}\s+/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/[-*•]\s+/g, ', ')
        .replace(/\|.*?\|/g, '')
        .replace(/`{1,3}.*?`{1,3}/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/---/g, '')
        .replace(/\n+/g, ' ')
        .trim();

      lastAISpokenTextRef.current = cleanVoiceText;
      lastAISpokenTimeRef.current = Date.now();

      // Safe tick (60ms) to prevent Chrome engine speech cancellation race condition
      setTimeout(() => {
        if (!synthRef.current || !isOpen) return;

        const utterance = new SpeechSynthesisUtterance(cleanVoiceText);
        utterance.lang = 'id-ID';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        const voices = synthRef.current.getVoices();
        const idVoice = voices.find(v => v.lang.startsWith('id') || v.lang.includes('ID'));
        if (idVoice) utterance.voice = idVoice;

        const onFinishUtterance = () => {
          clearTimeout(speechSafetyTimeoutRef.current);
          lastAISpokenTimeRef.current = Date.now();

          // Echo Silence Buffer (850ms) to allow audio hardware buffer and room reverberations to clear
          setCallState('cooldown');
          echoCooldownTimerRef.current = setTimeout(() => {
            isAISpeakingRef.current = false;
            if (isOpen && !isMicMuted) {
              setCallState('listening');
            } else {
              setCallState('idle');
            }
          }, 850);
        };

        utterance.onend = onFinishUtterance;
        utterance.onerror = (e) => {
          console.warn('[CallModal] Utterance error/interrupted:', e);
          onFinishUtterance();
        };

        // Fallback watchdog: in case browser drops onend (happens on some Android/iOS)
        const estimatedDurationMs = Math.max(3000, (cleanVoiceText.length / 14) * 1000);
        speechSafetyTimeoutRef.current = setTimeout(() => {
          if (isAISpeakingRef.current) {
            console.log('[CallModal] Safety watchdog released speaking state');
            onFinishUtterance();
          }
        }, estimatedDurationMs + 4000);

        synthRef.current.speak(utterance);
      }, 60);

    } catch (e) {
      console.warn('Speech synthesis error:', e);
      isAISpeakingRef.current = false;
      setCallState('listening');
    }
  };

  const stopSpeech = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    clearTimeout(echoCooldownTimerRef.current);
    clearTimeout(speechSafetyTimeoutRef.current);
    isAISpeakingRef.current = false;
  };

  // User manually interrupts AI to speak immediately
  const handleInterruptAI = () => {
    stopSpeech();
    isAISpeakingRef.current = false;
    lastAISpokenTimeRef.current = Date.now() - 3000;
    if (!isMicMuted) {
      setCallState('listening');
    }
  };

  // Process User Query by reading REAL database data with Complete, Informative Instruction
  const handleProcessVoiceQuery = async (queryText: string) => {
    if (!queryText.trim() || isProcessingRef.current) return;

    if (isAcousticEcho(queryText)) {
      console.log('[CallModal] Suppressed loudspeaker echo:', queryText);
      setCallState('listening');
      return;
    }

    isProcessingRef.current = true;
    stopRecognition();
    stopSpeech();
    setCallState('processing');

    // 1. Generate real-time system data digest
    const dataDigest = generatePancaDataDigest(context, queryText);

    // 2. Comprehensive voice system instruction
    const voiceSystemPrompt = `Anda adalah "Panca AI Assistant" yang sedang berbicara langsung melalui sambungan telepon suara dengan ${currentUser.nama || 'Bapak/Ibu'}.
Perusahaan: ${context.activeCompany?.nama || 'PT. PANCA PRIMA WIJAYA'}.

PETUNJUK JAWABAN SUARA LENGKAP, INFORMATIF, FAKTUAL & RAMAH:
1. BERIKAN JAWABAN LENGKAP & MEMUASKAN:
   - Jawablah pertanyaan dengan tuntas, jelas, dan berbobot berdasarkan database real-time terkini.
   - JANGAN MENJAWAB TERLALU PENDEK/SINGKAT ATAU SEPOTONG-POTONG (hindari jawaban 1 kata atau 1 kalimat pendek tanpa konteks). Pengguna ingin informasi yang jelas dan komprehensif.
   - BILA MENANYAKAN STOK PRODUK: Sebutkan nama produk, total sisa stok yang akurat dari database, satuannya (unit, roll, pcs, dus), harga jual atau HPP bila ada, serta status apakah stok aman, menipis, atau perlu dipesan ulang. Jika stok tertera di database > 0 (misalnya 1 roll atau 5 unit), Anda WAJIB menyebutkan jumlah stok tersebut (DILARANG mengatakan stok kosong atau 0 bila data tersedia).
   - BILA MENANYAKAN OMZET / PENJUALAN: Sebutkan angka total omzet penjualan dalam nominal rupiah secara jelas dan lengkap (misal: "Sekitar dua puluh lima juta lima ratus ribu rupiah"), jumlah total transaksi, rata-rata transaksi, dan performa penjualan periode tersebut.
   - BILA MENANYAKAN TRANSAKSI / INVOICE (TRX / PP): Sebutkan nomor transaksi lengkap, tanggal transaksi, nama pelanggan, nominal rupiah, rincian produk yang dibeli bila ada, status pengiriman/pesanan, dan status lunas atau belum lunas.
   - BILA MENANYAKAN PIUTANG / TAGIHAN: Sebutkan daftar nama pelanggan yang masih memiliki tagihan, nomor invoice terkait, tanggal jatuh tempo, dan nominal sisa tagihannya secara rinci.
   - BILA MENANYAKAN PEMBELIAN / PO SUPPLIER: Sebutkan nomor PO, nama supplier, nominal, dan status penerimaan barang di gudang.

2. GAYA BICARA NATURAL & ENAK DIDENGAR:
   - Gunakan bahasa percakapan lisan Indonesia yang santun, luwes, dan ramah seperti seorang konsultan bisnis terpercaya.
   - JANGAN gunakan simbol visual markdown seperti tanda bintang tebal (**), tanda pagar (#), garis tabel (|), atau tanda minus bullet (-) karena jawaban ini akan dibacakan langsung melalui suara ke telinga pengguna.
   - Rangkai data angka dan nama-nama menjadi kalimat penjelas yang mengalir lancar dan enak didengarkan.

DATABASE REAL-TIME TERKINI:
${dataDigest}
`;

    try {
      const reply = await callGeminiLiveVoiceWithRolling(voiceSystemPrompt, queryText);
      setTranscript({
        userText: queryText,
        aiText: reply
      });
      speakAIResponse(reply);
    } catch (err: any) {
      const errReply = 'Maaf, terjadi kendala saat membaca data dari database. Silakan coba tanyakan kembali.';
      setTranscript({
        userText: queryText,
        aiText: errReply
      });
      speakAIResponse(errReply);
    } finally {
      isProcessingRef.current = false;
    }
  };

  // Quick Action Voice Prompts (User can tap to speak instant query)
  const quickVoicePrompts = [
    'Berapa sisa stok plastik sungkup sekarang?',
    'Berapa total omzet bulan ini?',
    'Produk apa saja yang stoknya menipis?',
    'Apakah ada tagihan invoice yang belum lunas?'
  ];

  // Key Settings Management
  const handleAddLiveKey = () => {
    if (!newKeyInput.trim()) return;
    const cleanKey = newKeyInput.trim();
    const newConfig: GeminiApiKeyConfig = {
      id: `live-key-${Date.now()}`,
      key: cleanKey,
      label: newKeyLabel.trim() || `Live Key #${liveSettings.apiKeys.length + 1}`,
      isActive: true,
      isExhausted: false,
      successCount: 0,
      failCount: 0
    };

    const updated: GeminiSettings = {
      ...liveSettings,
      apiKeys: [...liveSettings.apiKeys, newConfig],
      lastUpdated: new Date().toISOString()
    };

    setLiveSettings(updated);
    saveStoredGeminiLiveSettings(updated);
    syncGeminiLiveSettingsToDatabase(updated);
    setNewKeyInput('');
    setNewKeyLabel('');
    setStatusMessage('API Key Live baru berhasil ditambahkan dan disimpan.');
  };

  const handleCopyFromMainKeys = () => {
    const main = getStoredGeminiSettings();
    if (main.apiKeys.length === 0) {
      setStatusMessage('Belum ada API Key di pengaturan Chat utama.');
      return;
    }
    const cloned = main.apiKeys.map(k => ({ ...k, id: `cloned-${Date.now()}-${Math.random()}` }));
    const updated: GeminiSettings = {
      ...liveSettings,
      apiKeys: cloned,
      lastUpdated: new Date().toISOString()
    };
    setLiveSettings(updated);
    saveStoredGeminiLiveSettings(updated);
    syncGeminiLiveSettingsToDatabase(updated);
    setStatusMessage(`Berhasil menyalin ${cloned.length} API Key dari pengaturan chat.`);
  };

  const handleDeleteLiveKey = (id: string) => {
    const updated: GeminiSettings = {
      ...liveSettings,
      apiKeys: liveSettings.apiKeys.filter(k => k.id !== id),
      lastUpdated: new Date().toISOString()
    };
    setLiveSettings(updated);
    saveStoredGeminiLiveSettings(updated);
    syncGeminiLiveSettingsToDatabase(updated);
  };

  const handleToggleKeyActive = (id: string) => {
    const updated: GeminiSettings = {
      ...liveSettings,
      apiKeys: liveSettings.apiKeys.map(k => k.id === id ? { ...k, isActive: !k.isActive } : k),
      lastUpdated: new Date().toISOString()
    };
    setLiveSettings(updated);
    saveStoredGeminiLiveSettings(updated);
    syncGeminiLiveSettingsToDatabase(updated);
  };

  const handleTestLiveKey = async (config: GeminiApiKeyConfig) => {
    setTestingKeyId(config.id);
    setStatusMessage('Menguji koneksi model Live API...');
    try {
      const res = await fetch('/api/gemini/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: config.key, model: liveSettings.model || 'gemini-3.8-live' })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage(`Tes Berhasil: ${data.message}`);
      } else {
        setStatusMessage(`Tes Gagal: ${data.message}`);
      }
    } catch (err: any) {
      setStatusMessage(`Gagal menghubungi server: ${err.message}`);
    } finally {
      setTestingKeyId(null);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-3 animate-in fade-in duration-200 select-none">
      {/* Phone Call Container */}
      <div className="relative w-full max-w-sm h-[92vh] max-h-[720px] bg-gradient-to-b from-slate-900 via-zinc-900 to-black text-white rounded-[38px] p-6 flex flex-col justify-between shadow-2xl border border-slate-800 overflow-hidden">
        
        {/* Ambient Glow Effects */}
        <div className={`absolute -top-20 -left-20 w-64 h-64 rounded-full blur-3xl transition-opacity duration-1000 pointer-events-none ${
          callState === 'speaking' ? 'bg-emerald-500/25 opacity-100' : callState === 'processing' ? 'bg-blue-500/25 opacity-100' : 'bg-violet-500/15 opacity-70'
        }`} />
        <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />

        {/* Top Header: Network & Settings */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                callState === 'speaking' ? 'bg-emerald-400' : callState === 'processing' ? 'bg-blue-400' : 'bg-emerald-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                callState === 'speaking' ? 'bg-emerald-500' : callState === 'processing' ? 'bg-blue-500' : 'bg-emerald-500'
              }`}></span>
            </span>
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
              {liveSettings.model || 'Gemini 3.8 Live'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95 border border-slate-700/60"
              title="Pengaturan Kunci Live API"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition active:scale-95 border border-slate-700/60"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings Dropdown / Panel */}
        {showSettings ? (
          <div className="relative z-20 flex-1 bg-slate-900/95 border border-slate-800 rounded-3xl p-4 my-3 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white">Pengaturan Kunci Live API</h4>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-xs text-slate-400 hover:text-white">
                Tutup
              </button>
            </div>

            {/* Quick copy from main settings */}
            <button
              onClick={handleCopyFromMainKeys}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-emerald-400 border border-slate-700 flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Salin Kunci dari Gemini Chat Utama</span>
            </button>

            {/* List of Live Keys */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Daftar Kunci Live Voice ({liveSettings.apiKeys.length})
              </label>
              {liveSettings.apiKeys.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic p-2 bg-slate-950/60 rounded-xl text-center">
                  Belum ada API Key khusus Live. Sistem akan otomatis memakai Kunci dari Chat utama.
                </p>
              ) : (
                liveSettings.apiKeys.map((k, idx) => (
                  <div key={k.id} className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-white truncate">{k.label}</span>
                        {k.isActive ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">Aktif</span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-400 font-bold">Mati</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono truncate">
                        {k.key ? `${k.key.slice(0, 7)}••••${k.key.slice(-4)}` : '-'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleTestLiveKey(k)}
                        disabled={testingKeyId === k.id}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                        title="Tes Koneksi"
                      >
                        {testingKeyId === k.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Tes'}
                      </button>
                      <button
                        onClick={() => handleDeleteLiveKey(k.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 text-[10px]"
                        title="Hapus"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Key Input */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Tambah API Key Baru
              </label>
              <input
                type="text"
                value={newKeyLabel}
                onChange={e => setNewKeyLabel(e.target.value)}
                placeholder="Label Kunci (opsional)"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 outline-none focus:border-emerald-500"
              />
              <input
                type="password"
                value={newKeyInput}
                onChange={e => setNewKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 outline-none focus:border-emerald-500 font-mono"
              />
              <button
                onClick={handleAddLiveKey}
                disabled={!newKeyInput.trim()}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Simpan Kunci Live API</span>
              </button>
            </div>

            {statusMessage && (
              <div className="p-2 rounded-xl bg-slate-800/90 text-[10px] text-emerald-300 border border-emerald-500/20">
                {statusMessage}
              </div>
            )}
          </div>
        ) : (
          /* Main Call Center Body */
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center my-auto py-4">
            
            {/* Caller Identity */}
            <div className="relative mb-6">
              {/* Animated Ripple Soundwave */}
              <div className={`absolute -inset-4 rounded-full border-2 transition-all duration-700 pointer-events-none ${
                callState === 'speaking'
                  ? 'border-emerald-500/60 scale-125 animate-ping'
                  : callState === 'processing'
                  ? 'border-blue-500/60 scale-110 animate-pulse'
                  : 'border-slate-700/40 scale-100'
              }`} />
              <div className={`absolute -inset-8 rounded-full border border-emerald-500/30 transition-all duration-1000 pointer-events-none ${
                callState === 'speaking' ? 'scale-150 opacity-40 animate-pulse' : 'opacity-0'
              }`} />

              {/* Bot Avatar Icon */}
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-400 p-1 shadow-xl flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center">
                  <Bot className={`w-12 h-12 transition-transform duration-300 ${
                    callState === 'speaking' ? 'text-emerald-400 scale-110' : 'text-slate-300'
                  }`} />
                </div>
              </div>
            </div>

            {/* Caller Name & Status */}
            <h2 className="text-xl font-black text-white tracking-tight mb-0.5">
              Panca AI Voice
            </h2>
            <p className="text-xs text-slate-400 font-medium mb-2">
              Database Real-Time • {context.activeCompany?.nama || 'PT Panca'}
            </p>

            {/* Loudspeaker Status Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 mb-2.5">
              {isSpeakerMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className="text-[10px] font-bold text-slate-300">
                {isSpeakerMuted ? 'Speaker: Senyap' : 'Mode Loudspeaker Aktif'}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold ml-1">
                Anti-Echo
              </span>
            </div>

            {/* Call State Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 mb-2.5 shadow-sm">
              <span className={`w-2 h-2 rounded-full ${
                callState === 'speaking'
                  ? 'bg-emerald-400 animate-pulse'
                  : callState === 'processing'
                  ? 'bg-blue-400 animate-spin'
                  : callState === 'cooldown'
                  ? 'bg-amber-400'
                  : callState === 'listening'
                  ? 'bg-emerald-400 animate-ping'
                  : 'bg-slate-400'
              }`} />
              <span className="text-[11px] font-extrabold text-slate-200">
                {callState === 'connecting' && 'Menyambungkan Panggilan...'}
                {callState === 'speaking' && 'Panca AI Sedang Berbicara...'}
                {callState === 'cooldown' && 'Mengalihkan ke Mikrofon...'}
                {callState === 'listening' && 'Mendengarkan Anda (Silakan Bicara)...'}
                {callState === 'processing' && 'Membaca Database Real-Time...'}
                {callState === 'idle' && 'Siaga'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {formatTimer(callDuration)}
              </span>
            </div>

            {/* User Interruption Button (when AI is speaking) */}
            {callState === 'speaking' && (
              <button
                onClick={handleInterruptAI}
                className="mb-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                title="Hentikan suara AI dan mulai bicara sekarang"
              >
                <Hand className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sela & Bicara Sekarang</span>
              </button>
            )}

            {/* Audio Waveform Bars Simulation */}
            <div className="flex items-center justify-center gap-1 h-8 my-1.5">
              {[40, 75, 100, 60, 90, 45, 80, 50, 70, 30].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-200 ${
                    callState === 'speaking'
                      ? 'bg-emerald-400 animate-pulse'
                      : callState === 'listening' && !isMicMuted
                      ? 'bg-emerald-500/70'
                      : 'bg-slate-700'
                  }`}
                  style={{
                    height: callState === 'speaking' ? `${h}%` : callState === 'listening' ? `${Math.max(20, h * 0.4)}%` : '15%'
                  }}
                />
              ))}
            </div>

            {/* Real-time Subtitle / Transcript Box */}
            <div className="w-full mt-2.5 p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 text-left max-h-32 overflow-y-auto">
              {transcript.userText && (
                <div className="text-[11px] text-slate-400 mb-1 leading-snug">
                  <span className="font-bold text-slate-300">Anda: </span>
                  &ldquo;{transcript.userText}&rdquo;
                </div>
              )}
              <div className="text-[11px] text-emerald-300 font-medium leading-snug">
                <span className="font-bold text-emerald-400">Panca AI: </span>
                {transcript.aiText}
              </div>
            </div>

            {/* Quick Voice Chips */}
            <div className="w-full mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {quickVoicePrompts.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleProcessVoiceQuery(q)}
                  className="px-2.5 py-1 rounded-full bg-slate-800/70 hover:bg-slate-700 border border-slate-700/60 text-[10px] text-slate-300 hover:text-white whitespace-nowrap transition active:scale-95"
                >
                  📞 {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Call Controls */}
        <div className="relative z-10 pt-3 border-t border-slate-800/60 flex items-center justify-around">
          
          {/* Mute Microphone Button */}
          <button
            onClick={() => {
              setIsMicMuted(!isMicMuted);
              if (!isMicMuted) stopRecognition();
            }}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition active:scale-90 border ${
              isMicMuted
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                : 'bg-slate-800/90 text-white hover:bg-slate-700 border-slate-700'
            }`}
            title={isMicMuted ? 'Nyalakan Mikrofon' : 'Matikan Mikrofon (Mute)'}
          >
            {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* End Call Button (Merah Menonjol) */}
          <button
            onClick={onClose}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition active:scale-90 ring-4 ring-rose-600/20"
            title="Tutup Panggilan"
          >
            <PhoneOff className="w-7 h-7" />
          </button>

          {/* Speaker / Loudspeaker Button */}
          <button
            onClick={() => {
              const next = !isSpeakerMuted;
              setIsSpeakerMuted(next);
              if (next) stopSpeech();
            }}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition active:scale-90 border ${
              isSpeakerMuted
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-emerald-600/25 text-emerald-400 hover:bg-emerald-600/35 border-emerald-500/40'
            }`}
            title={isSpeakerMuted ? 'Nyalakan Loudspeaker' : 'Matikan Suara Speaker (Mute)'}
          >
            {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

      </div>
    </div>
  );
};
