import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, ArrowLeft, Trash2, Copy, Check, Sparkles, 
  Bot, User, Download, Mic, Square, Volume2, VolumeX,
  AlertCircle, Radio, CheckCircle2, XCircle, Search, Plus, Package
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabaseService } from '../../../task/services/supabaseService';
import { Task, Project, DrivePost } from '../../../task/types';
import { queryPancaAI, PancaAIContext } from '../../services/pancaAIService';

export interface DraftData {
  type: 'customer' | 'transaction' | 'penawaran';
  payload: Record<string, any>;
  isSaved?: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isNew?: boolean;
  draftData?: DraftData;
}

const TypewriterText: React.FC<{
  content: string;
  isNew?: boolean;
  onComplete?: () => void;
}> = ({ content, isNew = false, onComplete }) => {
  const [displayedText, setDisplayedText] = useState(isNew ? '' : content);
  const [isTyping, setIsTyping] = useState(isNew);

  useEffect(() => {
    if (!isNew) {
      setDisplayedText(content);
      setIsTyping(false);
      if (onComplete) onComplete();
      return;
    }

    setIsTyping(true);
    let currLength = 0;
    const totalLength = content.length;
    const chunkSize = Math.max(5, Math.floor(totalLength / 50));

    const interval = setInterval(() => {
      currLength += chunkSize;
      if (currLength >= totalLength) {
        setDisplayedText(content);
        setIsTyping(false);
        clearInterval(interval);
        if (onComplete) onComplete();
      } else {
        setDisplayedText(content.slice(0, currLength));
      }
    }, 12);

    return () => clearInterval(interval);
  }, [content, isNew]);

  return (
    <div className="relative overflow-x-auto">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto rounded-2xl bg-slate-100/60 dark:bg-zinc-800/40 p-1 shadow-2xs">
              <table className="min-w-full text-xs text-left border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-200/60 dark:bg-zinc-800/80 text-slate-900 dark:text-zinc-100 font-extrabold text-[11px] border-b border-slate-200/80 dark:border-zinc-700/60">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="bg-transparent divide-y divide-slate-200/30 dark:divide-zinc-800/30">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-white/60 dark:hover:bg-zinc-800/60 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-bold text-slate-800 dark:text-zinc-200 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-700 dark:text-zinc-300 align-top whitespace-nowrap">
              {children}
            </td>
          ),
          ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-extrabold text-slate-900 dark:text-zinc-100">{children}</strong>,
          code: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded-md bg-violet-50 dark:bg-zinc-800 text-violet-700 dark:text-violet-300 font-mono text-[11px]">
              {children}
            </code>
          )
        }}
      >
        {displayedText}
      </Markdown>
      {isTyping && (
        <span className="inline-block w-2 h-4 ml-1 bg-violet-600 animate-pulse rounded-xs align-middle" />
      )}
    </div>
  );
};

interface PancaAIChatViewProps {
  currentUser: {
    username: string;
    role: string;
    nama: string;
  };
  activeCompany?: any;
  transactions?: any[];
  customers?: any[];
  products?: any[];
  suppliers?: any[];
  purchaseOrders?: any[];
  employees?: any[];
  setCustomers?: React.Dispatch<React.SetStateAction<any[]>>;
  setTransactions?: React.Dispatch<React.SetStateAction<any[]>>;
  setProducts?: React.Dispatch<React.SetStateAction<any[]>>;
  syncToSupabase?: (table: string, data: any) => void;
  initialPrompt?: string;
  onBack: () => void;
}

// Gentle pleasant chime generator via Web Audio API
const playTone = (frequency = 600, duration = 0.12) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
};

export const PancaAIChatView: React.FC<PancaAIChatViewProps> = ({
  currentUser,
  activeCompany = { id: '1', nama: 'PT. PANCA PRIMA WIJAYA' },
  transactions = [],
  customers = [],
  products = [],
  suppliers = [],
  purchaseOrders = [],
  employees = [],
  setCustomers,
  setTransactions,
  setProducts,
  syncToSupabase,
  initialPrompt = '',
  onBack
}) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('mypanca_mobile_ai_chat');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: '1',
        role: 'assistant',
        content: `Halo, **${currentUser?.nama || 'Bapak/Ibu'}**. Selamat datang di **Panca AI Chat**.\n\nSaya siap melayani Anda melalui **teks maupun suara** untuk mencari informasi data transaksi (seperti **TRX-70** atau **PP-001**), status piutang, stok produk, serta tugas & proyek tim.\n\nTekan tombol mikrofon di bawah untuk mulai bicara, atau ketik langsung di kolom pesan!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSuperAdmin = currentUser?.role?.toLowerCase() === 'superadmin';

  // Active Session for guided multi-step form wizard (Customer, Transaksi, Penawaran)
  const [activeSession, setActiveSession] = useState<{
    type: 'customer' | 'transaction' | 'penawaran';
    step: number;
    data: Record<string, any>;
  } | null>(null);

  // Search box states for interactive form wizards
  const [wizardCustSearch, setWizardCustSearch] = useState('');
  const [wizardProdSearch, setWizardProdSearch] = useState('');
  const [wizardProdQty, setWizardProdQty] = useState(1);

  // Helper to update active form state dynamically
  const updateActiveData = (field: string, val: any) => {
    setActiveSession(prev => prev ? {
      ...prev,
      data: { ...prev.data, [field]: val }
    } : null);
  };

  // Helper to directly save CRM form input to state & Supabase
  const handleDirectSaveFromForm = () => {
    if (!activeSession) return;
    const { type, data } = activeSession;
    const isQuote = type === 'penawaran';
    const activeCompanyId = activeCompany?.id || '1';

    if (type === 'customer') {
      const name = data.nama?.trim() || 'Customer Baru';
      const wa = data.whatsapp?.trim() || '08123456789';
      const city = data.kota?.trim() || 'Surabaya';
      const salesName = data.sales || currentUser?.nama || 'General Sales';

      const newCust = {
        id: 'CUST-' + Date.now(),
        nama: name,
        perusahaan: name,
        whatsapp: wa,
        phone: wa,
        kota: city,
        sales: salesName,
        leadType: data.leadType || 'Belum Transaksi',
        pic: name,
        companyId: activeCompanyId,
        company_id: activeCompanyId,
        createdAt: new Date().toISOString()
      };

      if (setCustomers) setCustomers(prev => [newCust, ...prev]);
      if (syncToSupabase) syncToSupabase('customers', newCust);

      playTone(800, 0.15);
      const successMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `### ✅ DATA CUSTOMER BERHASIL DISIMPAN KE DATABASE MYPANCA!\n\n| Field Customer | Data Tersimpan |\n|---|---|\n| **Nama Pelanggan** | **${newCust.nama}** |\n| **WhatsApp / Telp** | **${newCust.whatsapp}** |\n| **Kota / Wilayah** | **${newCust.kota}** |\n| **Sales Penanggung Jawab** | **${newCust.sales}** |\n| **Status Lead** | **${newCust.leadType}** |\n\nData pelanggan telah aktif dan siap digunakan untuk transaksi/penawaran selanjutnya! 🎉`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, successMsg]);
      setActiveSession(null);
      setWizardCustSearch('');
      return;
    }

    // Transaction or Penawaran
    const items = data.items && data.items.length > 0 ? data.items : [
      { produkId: 'PROD-' + Date.now(), kode: 'SKU-CUSTOM', nama: 'Produk Transaksi', harga: 100000, qty: 1, diskon: 0 }
    ];

    const subtotal = items.reduce((sum: number, it: any) => sum + (it.harga * it.qty) - (it.diskon || 0), 0);
    const ppnAmt = data.ppn ? Math.round(subtotal * 0.11) : 0;
    const ongkirAmt = data.ongkir ? (Number(data.biayaOngkir) || 0) : 0;
    const grandTotal = subtotal + ppnAmt + ongkirAmt;

    const docNo = (isQuote ? 'QUO-' : 'PP-') + new Date().getFullYear() + (new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000);
    const payStatus = isQuote ? 'Penawaran' : (data.paymentStatus || 'Belum Lunas');
    const dpAmt = payStatus === 'Lunas' ? grandTotal : (Number(data.dpAmt) || 0);
    const sisaPay = Math.max(0, grandTotal - dpAmt);
    const todayStr = new Date().toISOString().split('T')[0];

    const newTrx = {
      id: docNo,
      noTrx: docNo,
      customerName: data.customerName || 'Pelanggan Umum',
      tanggal: todayStr,
      total: grandTotal,
      nilaiProyek: grandTotal,
      items: items,
      ppn: Boolean(data.ppn),
      ongkir: Boolean(data.ongkir),
      biayaOngkir: ongkirAmt,
      jasaKirim: data.jasaKirim || 'JNE',
      status: isQuote ? 'Penawaran' : 'Selesai',
      paymentStatus: payStatus,
      pembayaranDiterima: dpAmt,
      sisaPembayaran: sisaPay,
      sales: currentUser?.nama || 'General Sales',
      keterangan: data.keterangan || 'Input via Panca AI Assistant',
      companyId: activeCompanyId,
      company_id: activeCompanyId,
      createdAt: new Date().toISOString()
    };

    if (setTransactions) setTransactions(prev => [newTrx, ...prev]);
    if (syncToSupabase) syncToSupabase('transactions', newTrx);

    playTone(880, 0.2);

    let itemsTable = `| No | SKU | Nama Produk | Qty | Harga | Subtotal |\n|---|---|---|---|---|---|\n`;
    items.forEach((it: any, i: number) => {
      itemsTable += `| ${i + 1} | ${it.kode || '-'} | **${it.nama}** | ${it.qty} unit | Rp ${(it.harga || 0).toLocaleString('id-ID')} | **Rp ${(((it.harga || 0) * it.qty) - (it.diskon || 0)).toLocaleString('id-ID')}** |\n`;
    });

    const successMsg: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `### 🎉 ${isQuote ? 'PENAWARAN HARGA' : 'TRANSAKSI PENJUALAN'} BERHASIL DISIMPAN KE DATABASE MYPANCA!\n\n| Detail Dokumen | Data Terdaftar |\n|---|---|\n| **No. Dokumen** | **${docNo}** (Resmi) |\n| **Pelanggan** | **${newTrx.customerName}** |\n| **Subtotal Produk** | **Rp ${subtotal.toLocaleString('id-ID')}** |\n| **PPN 11%** | **${data.ppn ? `Rp ${ppnAmt.toLocaleString('id-ID')}` : 'Tidak PPN'}** |\n| **Biaya Kirim** | **Rp ${ongkirAmt.toLocaleString('id-ID')}** (${newTrx.jasaKirim}) |\n| **GRAND TOTAL** | **Rp ${grandTotal.toLocaleString('id-ID')}** |\n| **Status Pembayaran** | **${payStatus}** (Diterima: Rp ${dpAmt.toLocaleString('id-ID')}, Sisa: Rp ${sisaPay.toLocaleString('id-ID')}) |\n| **Sales Representative** | **${newTrx.sales}** |\n\n**Rincian Barang:**\n${itemsTable}\n\nDokumen transaksi telah resmi terdata di CRM MyPanca & Supabase! 🚀`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, successMsg]);
    setActiveSession(null);
    setWizardCustSearch('');
    setWizardProdSearch('');
  };

  // Voice Speech-to-Text states
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Voice Text-to-Speech states
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    return localStorage.getItem('mypanca_ai_autospeak') === 'true';
  });
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Task App data state for SuperAdmin
  const [taskAppData, setTaskAppData] = useState<{
    tasks: Task[];
    projects: Project[];
    drivePosts: DrivePost[];
  }>({ tasks: [], projects: [], drivePosts: [] });

  useEffect(() => {
    if (isSuperAdmin) {
      let isMounted = true;
      const loadTaskAppData = async () => {
        try {
          const [tasksList, projectsList, postsList] = await Promise.all([
            supabaseService.getTasks({ username: 'superadmin', role: 'superadmin' }, true),
            supabaseService.getProjects(),
            supabaseService.getDrivePosts()
          ]);
          if (isMounted) {
            setTaskAppData({
              tasks: tasksList || [],
              projects: projectsList || [],
              drivePosts: postsList || []
            });
          }
        } catch (e) {
          console.warn("Failed loading task app data for Mobile AI:", e);
        }
      };
      loadTaskAppData();
      return () => { isMounted = false; };
    }
  }, [isSuperAdmin]);

  // Save chat to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mypanca_mobile_ai_chat', JSON.stringify(messages));
    } catch (e) {}
  }, [messages]);

  // Save auto-speak preference
  useEffect(() => {
    localStorage.setItem('mypanca_ai_autospeak', autoSpeak ? 'true' : 'false');
  }, [autoSpeak]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isListening]);

  // Handle initial prompt from home
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      handleSendMessage(initialPrompt);
    }
  }, [initialPrompt]);

  // Clean up speech recognition & synthesis on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // --- Voice Input (Speech-to-Text) ---
  const isSpeechRecognitionSupported = typeof window !== 'undefined' && 
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  const startVoiceInput = () => {
    if (!isSpeechRecognitionSupported) {
      setSpeechError('Browser ini belum mendukung Web Speech Recognition. Gunakan Chrome, Edge, atau Safari.');
      setTimeout(() => setSpeechError(null), 4000);
      return;
    }

    if (isListening) {
      stopVoiceInput();
      return;
    }

    // Stop ongoing speech output if speaking
    stopSpeaking();

    try {
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;

      recognition.lang = 'id-ID';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
        playTone(660, 0.12);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputPrompt(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setSpeechError('Izin mikrofon belum diberikan. Silakan izinkan akses mikrofon di pengaturan browser Anda.');
        } else if (event.error !== 'no-speech') {
          setSpeechError(`Kendala suara: ${event.error}`);
        }
        setTimeout(() => setSpeechError(null), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
        playTone(480, 0.12);
      };

      recognition.start();
    } catch (e: any) {
      console.error('Failed to start speech recognition:', e);
      setIsListening(false);
      setSpeechError('Gagal mengaktifkan mikrofon perangkat.');
      setTimeout(() => setSpeechError(null), 4000);
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
  };

  // --- Voice Output (Text-to-Speech) ---
  const cleanMarkdownForSpeech = (text: string): string => {
    return text
      .replace(/###?\s+/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\|.*\|/g, '') // remove markdown table lines
      .replace(/---/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/`{1,3}.*?`{1,3}/g, '')
      .replace(/[-*•]\s+/g, ', ')
      .replace(/\n+/g, '. ')
      .trim();
  };

  const speakText = (text: string, msgId: string) => {
    if (!('speechSynthesis' in window)) {
      alert('Browser tidak mendukung Speech Synthesis.');
      return;
    }

    if (speakingMessageId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = cleanMarkdownForSpeech(text);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'id-ID';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find(v => v.lang.includes('id') || v.lang.includes('ID'));
    if (idVoice) utterance.voice = idVoice;

    utterance.onstart = () => {
      setSpeakingMessageId(msgId);
    };

    utterance.onend = () => {
      setSpeakingMessageId(null);
    };

    utterance.onerror = () => {
      setSpeakingMessageId(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    stopSpeaking();
    stopVoiceInput();
    const welcome: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Obrolan telah dibersihkan. Halo **${currentUser?.nama || 'Bapak/Ibu'}**, ada data atau laporan apa yang ingin kita cek selanjutnya?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([welcome]);
    try {
      localStorage.removeItem('mypanca_mobile_ai_chat');
    } catch (e) {}
  };

  // Helper amount
  const getTrxAmount = (t: any): number => {
    if (typeof t.nilaiProyek === 'number' && !isNaN(t.nilaiProyek) && t.nilaiProyek > 0) return t.nilaiProyek;
    if (typeof t.total === 'number' && !isNaN(t.total) && t.total > 0) return t.total;
    if (Array.isArray(t.items) && t.items.length > 0) {
      return t.items.reduce((sum: number, it: any) => sum + ((Number(it.harga) || 0) * (Number(it.qty) || 1)), 0);
    }
    return 0;
  };

  // Local Smart Synthesizer (Same logic as main system)
  const generateSmartResponse = (query: string): string => {
    const lower = query.toLowerCase();
    const trimmed = lower.trim().replace(/[!\?\.,]/g, '');
    const userName = currentUser?.nama || 'Bapak/Ibu';

    // 0. Greetings & Human Conversation Handler
    const greetingList = ['halo', 'hello', 'hi', 'hai', 'pagi', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam', 'siang', 'sore', 'malam', 'ping', 'p', "assalamu'alaikum", 'assalamualaikum', 'salam'];
    const thanksList = ['terima kasih', 'makasih', 'thanks', 'thank you', 'trims', 'maturnuwun', 'ok makasih', 'oke makasih', 'siap makasih', 'mantap'];
    const identityList = ['siapa kamu', 'siapa anda', 'kamu siapa', 'anda siapa', 'fungsi kamu', 'bisa apa', 'fitur ai', 'bisa bantu apa'];

    const isSimpleGreeting = greetingList.includes(trimmed) || trimmed === 'halo ai' || trimmed === 'hi ai' || trimmed.startsWith('halo ') || trimmed.startsWith('hi ') || trimmed.startsWith('selamat ');
    const isSimpleThanks = thanksList.some(t => trimmed.includes(t));
    const isSimpleIdentity = identityList.some(i => trimmed.includes(i));

    if (isSimpleGreeting && !lower.includes('trx') && !lower.includes('quo') && !lower.includes('po') && !lower.includes('inv') && !lower.includes('transaksi') && !lower.includes('omzet') && !lower.includes('stok') && !lower.includes('tugas') && !lower.includes('task') && !lower.includes('kontak')) {
      const hour = new Date().getHours();
      let timeGreeting = "pagi";
      if (hour >= 11 && hour < 15) timeGreeting = "siang";
      else if (hour >= 15 && hour < 18) timeGreeting = "sore";
      else if (hour >= 18 || hour < 5) timeGreeting = "malam";

      return `Halo, **${userName}**! 👋 Selamat ${timeGreeting}.\n\nSaya **Panca AI Assistant**, asisten virtual Anda di PT. Panca Prima Wijaya.\n\nAda data atau informasi bisnis yang bisa saya bantu carikan hari ini? Silakan sebutkan apa yang Anda butuhkan melalui teks atau suara, contohnya:\n- 🔍 *"Cek transaksi TRX-70"* atau *"cari kontak PT ABC"*\n- 📊 *"Berapa omzet dan total penjualan bulan ini?"*\n- 📦 *"Cek produk yang stoknya menipis"*\n- 📌 *"Tampilkan tugas/task tim hari ini"*\n\nSilakan tanyakan apa saja! 😊`;
    }

    if (isSimpleThanks) {
      return `Sama-sama, **${userName}**! 😊 Senang sekali bisa membantu Anda. Jika ada data atau informasi lain yang perlu dicari, silakan panggil saya kapan saja ya!`;
    }

    if (isSimpleIdentity) {
      return `Halo **${userName}**! Saya adalah **Panca AI Assistant**, asisten cerdas yang terhubung ke seluruh database MyPanca (PT. Panca Prima Wijaya).\n\nSaya dapat melayani Anda via teks dan suara untuk:\n1. 🔍 **Pencarian Data Presisi**: Mencari nomor transaksi (seperti TRX-70), kontak pelanggan, PO supplier, atau invoice.\n2. 📈 **Laporan & Omzet**: Menyajikan rekap penjualan real, performa sales, dan tren bulanan.\n3. 📦 **Stok & Inventaris**: Memeriksa sisa stok produk, item terlaris, dan kebutuhan restock.\n4. 📌 **Task App & Proyek**: Memantau tugas tim, progress proyek, dan dokumen terlampir.\n\nAda yang ingin kita periksa bersama sekarang?`;
    }

    // 0.1 Direct Transaction Code / ID Search (e.g. TRX-70, trx 70, QUO-001, PO-123)
    const searchClean = lower.replace(/[^a-z0-9]/g, '');
    if (searchClean.length >= 2) {
      const matchedTrx = transactions.filter(t => {
        const noTrxStr = (t.noTrx || t.id || '').toLowerCase();
        const noTrxClean = noTrxStr.replace(/[^a-z0-9]/g, '');
        if (noTrxStr.includes(lower) || (searchClean.length >= 2 && noTrxClean.includes(searchClean))) {
          return true;
        }
        return false;
      });

      if (matchedTrx.length > 0 && (lower.includes('trx') || lower.includes('quo') || lower.includes('inv') || matchedTrx.length <= 5)) {
        let res = `### 🧾 Detail Transaksi / Penawaran "${query}":\n\n`;
        res += `Ditemukan **${matchedTrx.length} data transaksi** yang cocok dengan kode **"${query}"**:\n\n`;
        res += `| No. Transaksi | Tanggal | Pelanggan | Nominal Total | Status Pesanan | Pembayaran | Sales |\n|---|---|---|---|---|---|---|\n`;
        matchedTrx.forEach(t => {
          const amt = getTrxAmount(t);
          res += `| **${t.noTrx || t.id}** | ${t.tanggal || '-'} | **${t.customerName || t.customer || '-'}** | **Rp ${amt.toLocaleString('id-ID')}** | ${t.status || 'Selesai'} | ${t.paymentStatus || 'Lunas'} | ${t.sales || t.salesName || '-'} |\n`;
        });

        if (matchedTrx.length === 1) {
          const t = matchedTrx[0];
          res += `\n**📦 Rincian Item Produk Transaksi ${t.noTrx || t.id}:**\n`;
          if (Array.isArray(t.items) && t.items.length > 0) {
            res += `| No | Nama Item Produk | Qty | Harga Satuan | Subtotal |\n|---|---|---|---|---|\n`;
            t.items.forEach((it: any, i: number) => {
              const qty = Number(it.qty) || 1;
              const hg = Number(it.harga) || 0;
              res += `| ${i + 1} | **${it.nama || it.productName || 'Item'}** | ${qty} unit | Rp ${hg.toLocaleString('id-ID')} | **Rp ${(qty * hg).toLocaleString('id-ID')}** |\n`;
            });
          }
          if (t.catatan || (t as any).notes) {
            res += `\n📝 **Catatan Transaksi**: ${t.catatan || (t as any).notes}\n`;
          }
        }
        return res;
      }
    }

    // 0.2 Task App Query (KHUSUS SUPERADMIN)
    const isTaskQuery = isSuperAdmin && (
      lower.includes('task') || lower.includes('tugas') || lower.includes('proyek') || lower.includes('project') || lower.includes('pekerjaan')
    );

    if (isTaskQuery) {
      let res = `### 📌 Data Task App & Proyek (Akses SuperAdmin):\n\n`;
      const searchToks = lower.split(/\s+/).filter(w => w.length >= 2 && !['task', 'tugas', 'proyek', 'project', 'app', 'menu', 'data', 'info', 'cek', 'list', 'daftar'].includes(w));
      
      let filteredTasks = taskAppData.tasks;
      if (searchToks.length > 0) {
        filteredTasks = filteredTasks.filter(t => {
          const full = `${t.title || ''} ${t.category || ''} ${t.employeeName || ''} ${t.owner || ''} ${t.status || ''}`.toLowerCase();
          return searchToks.some(tok => full.includes(tok));
        });
      }

      const pendingTasks = filteredTasks.filter(t => t.status !== 'Selesai');
      res += `**📊 Ringkasan Tugas:**\n`;
      res += `- Total Task: **${taskAppData.tasks.length} task** (${taskAppData.tasks.filter(t => t.status === 'Selesai').length} Selesai, ${pendingTasks.length} Pending/Berjalan)\n\n`;

      if (filteredTasks.length > 0) {
        res += `**📋 Daftar Task Terkait:**\n`;
        res += `| No | Judul Task | Prioritas | Status | Progress | Petugas |\n|---|---|---|---|---|---|\n`;
        filteredTasks.slice(0, 10).forEach((t, idx) => {
          res += `| ${idx + 1} | **${t.title}** | ${t.priority || 'Medium'} | ${t.status} | ${t.progress || 0}% | ${t.employeeName || t.owner || '-'} |\n`;
        });
        res += `\n`;
      }

      if (taskAppData.projects.length > 0) {
        res += `**🏗️ Proyek Database (${taskAppData.projects.length} Proyek):**\n`;
        res += `| No | Kode & Nama Proyek | Klien | Status | Lead Engineer |\n|---|---|---|---|---|\n`;
        taskAppData.projects.slice(0, 8).forEach((p, idx) => {
          res += `| ${idx + 1} | **[${p.code || 'PRJ'}] ${p.title}** | ${p.clientName || '-'} | ${p.status} | ${p.leadEngineer || '-'} |\n`;
        });
      }

      return res;
    }

    // 0.3 Omzet / Penjualan Query
    const isOmzetQuery = lower.includes('omzet') || lower.includes('penjualan') || lower.includes('rekap') || lower.includes('transaksi');
    if (isOmzetQuery) {
      const deals = transactions.filter(t => t.status === 'Selesai');
      const totalOmzet = deals.reduce((acc, t) => acc + getTrxAmount(t), 0);
      const pendingPay = transactions.filter(t => t.paymentStatus === 'Belum Lunas' || t.status === 'Pengiriman');
      const totalPiutang = pendingPay.reduce((acc, t) => acc + getTrxAmount(t), 0);

      let res = `### 📊 Laporan Penjualan & Omzet Bisnis:\n\n`;
      res += `- **Total Transaksi Terdaftar**: **${transactions.length} transaksi**\n`;
      res += `- **Total Omzet Real (Selesai)**: **Rp ${totalOmzet.toLocaleString('id-ID')}** (${deals.length} deals sukses)\n`;
      res += `- **Sisa Piutang Berjalan**: **Rp ${totalPiutang.toLocaleString('id-ID')}** (${pendingPay.length} transaksi belum lunas)\n\n`;
      
      res += `**📋 Transaksi Terbaru:**\n`;
      res += `| No. Transaksi | Tanggal | Pelanggan | Nominal | Status | Pembayaran |\n|---|---|---|---|---|---|\n`;
      transactions.slice(0, 8).forEach(t => {
        res += `| **${t.noTrx || t.id}** | ${t.tanggal || '-'} | ${t.customerName || '-'} | Rp ${getTrxAmount(t).toLocaleString('id-ID')} | ${t.status} | ${t.paymentStatus} |\n`;
      });
      return res;
    }

    // 0.4 Stok Query
    const isStockQuery = lower.includes('stok') || lower.includes('produk') || lower.includes('barang');
    if (isStockQuery) {
      const lowStock = products.filter(p => (p.stok || 0) < 10);
      let res = `### 📦 Informasi Stok & Produk:\n\n`;
      res += `- Total Produk Terdaftar: **${products.length} SKU**\n`;
      res += `- Produk Perlu Restock (< 10 unit): **${lowStock.length} SKU**\n\n`;

      if (lowStock.length > 0) {
        res += `**⚠️ Daftar Produk Stok Menipis:**\n`;
        res += `| No | Nama Produk | Kategori | Sisa Stok | Satuan |\n|---|---|---|---|---|\n`;
        lowStock.slice(0, 10).forEach((p, idx) => {
          res += `| ${idx + 1} | **${p.nama}** | ${p.kategori || '-'} | <span style="color:red; font-weight:bold;">${p.stok || 0}</span> | ${p.satuan || 'Unit'} |\n`;
        });
      } else {
        res += `✅ Seluruh produk saat ini berada dalam status stok aman.\n`;
      }
      return res;
    }

    return `Halo **${userName}**! Saya tidak menemukan data spesifik terkait **"${query}"**.\n\nBisa tolong sebutkan nama pelanggan, nomor transaksi (seperti **TRX-70**), produk, atau topik yang ingin Anda tanyakan?`;
  };

  // Guided multi-step session handler
  const handleActiveSessionStep = (userText: string): { responseText: string; draftData?: DraftData; nextSession: typeof activeSession } | null => {
    if (!activeSession) return null;

    const lower = userText.toLowerCase().trim();
    if (lower === 'batal' || lower === 'cancel' || lower === 'exit' || lower === 'stop') {
      return {
        responseText: '❌ **Proses input data telah dibatalkan.**\n\nAda data atau laporan lain yang bisa saya bantu carikan?',
        nextSession: null
      };
    }

    const data = { ...activeSession.data };

    // 1. CUSTOMER GUIDED WIZARD
    if (activeSession.type === 'customer') {
      if (activeSession.step === 1) {
        data.customerName = userText.trim();
        return {
          responseText: `### 👥 Input Customer Baru (Langkah 2 dari 3)\n\n- **Nama Customer**: **${data.customerName}** ✅\n\nSelanjutnya, silakan masukkan **Nomor WA / Telepon** dan **Kota / Wilayah** customer:\n*(Contoh: \`08123456789, Surabaya\`)*\n\n*(Ketik \`batal\` jika ingin membatalkan)*`,
          nextSession: { type: 'customer', step: 2, data }
        };
      }

      if (activeSession.step === 2) {
        const parts = userText.split(',').map(s => s.trim());
        const waMatch = userText.match(/(?:wa|phone|hp|telp|whatsapp)[\s:]*([0-9\-\+\s]{9,15})/i) || userText.match(/\b(08[0-9\s\-]{8,13})\b/);
        data.wa = waMatch?.[1]?.replace(/[^0-9]/g, '') || parts.find(p => /08[0-9]{8,}/.test(p)) || '08123456789';
        data.city = parts.find(p => !p.includes('08') && p !== parts[0]) || 'Surabaya';

        return {
          responseText: `### 👥 Input Customer Baru (Langkah 3 dari 3)\n\n- **Nama Customer**: **${data.customerName}** ✅\n- **No. WA / Telepon**: **${data.wa}** ✅\n- **Kota / Wilayah**: **${data.city}** ✅\n\nTerakhir, siapa **Nama PIC / Kontak Penanggung Jawab**?\n*(Contoh: Pak Budi atau ketik \`-\` jika sama dengan nama customer)*`,
          nextSession: { type: 'customer', step: 3, data }
        };
      }

      if (activeSession.step === 3) {
        const pic = userText.trim() === '-' ? data.customerName : userText.trim();
        data.pic = pic;
        const salesName = currentUser?.nama || 'General Sales';

        const draftPayload = {
          nama: data.customerName,
          perusahaan: data.customerName,
          whatsapp: data.wa,
          phone: data.wa,
          kota: data.city,
          sales: salesName,
          pic: data.pic,
          leadType: 'Belum Transaksi'
        };

        return {
          responseText: `### 📝 PRATINJAU DRAFT FORM CUSTOMER BARU (SIAP DISIMPAN)\n\nSeluruh data customer baru telah berhasil terkumpul:\n\n| Field Form Asli | Nilai Terbaca | Status Validasi |\n|---|---|---|\n| **Nama Customer** | **${data.customerName}** | ✅ Valid |\n| **No. WA / Telepon** | **${data.wa}** | ✅ Valid |\n| **Kota / Wilayah** | **${data.city}** | ✅ Valid |\n| **Nama PIC** | **${data.pic}** | ✅ Valid |\n| **Sales Penanggung Jawab** | **${salesName}** | ✅ Terhubung |\n| **Status Lead** | **Belum Transaksi** | 🟢 Aktif |\n\n---\n⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
          draftData: {
            type: 'customer',
            payload: draftPayload,
            isSaved: false
          },
          nextSession: null
        };
      }
    }

    // 2. TRANSACTION & PENAWARAN GUIDED WIZARD
    if (activeSession.type === 'transaction' || activeSession.type === 'penawaran') {
      const isQuote = activeSession.type === 'penawaran';

      // STEP 1: CUSTOMER SEARCH FROM DATABASE
      if (activeSession.step === 1) {
        const searchTerm = userText.trim().toLowerCase();
        const matchedCust = customers.find(c => c.nama?.toLowerCase().includes(searchTerm) || c.perusahaan?.toLowerCase().includes(searchTerm));
        const custName = matchedCust ? matchedCust.nama : userText.trim();
        data.customerName = custName;
        data.isNewCustomer = !matchedCust;
        data.items = [];

        // Show available top products with real stock info
        let prodListStr = '';
        if (products.length > 0) {
          prodListStr = `\n\n**📦 Katalog Produk & Sisa Stok Gudang Currently Available:**\n`;
          prodListStr += `| No | Kode / SKU | Nama Produk | Sisa Stok | Harga Jual |\n|---|---|---|---|---|\n`;
          products.slice(0, 6).forEach((p, idx) => {
            prodListStr += `| ${idx + 1} | **${p.kode || p.id}** | **${p.nama}** | ${p.stok || 0} ${p.satuan || 'unit'} | Rp ${(p.hargaJual || 0).toLocaleString('id-ID')} |\n`;
          });
        }

        return {
          responseText: `### ${isQuote ? '📋' : '🛍️'} Input ${isQuote ? 'Penawaran' : 'Transaksi'} (Langkah 2: Pilih Produk)\n\n- **Pelanggan**: **${data.customerName}** ${matchedCust ? '✅ *(Pelanggan Terdaftar di Database)*' : '📌 *(Pelanggan Baru)*'}${prodListStr}\n\nSilakan masukkan **Nama / Kode Produk** dan **Jumlah (Qty)**:\n*(Contoh: \`Fumiphos, 5 box\` atau \`Phostoxin 2\`)*`,
          nextSession: { type: activeSession.type, step: 2, data }
        };
      }

      // STEP 2: MULTI-PRODUCT SELECTION WITH STOCK & PRICE LOOKUP
      if (activeSession.step === 2) {
        const inputLower = userText.trim().toLowerCase();

        // Check if user wants to finish adding products
        if (data.items?.length > 0 && (inputLower === 'lanjut' || inputLower === 'selesai' || inputLower === 'sudah' || inputLower === 'tidak' || inputLower === 'next')) {
          if (isQuote) {
            // Quotes jump directly to notes / summary
            const todayStr = new Date().toISOString().split('T')[0];
            const itemsSubtotal = data.items.reduce((sum: number, it: any) => sum + (it.harga * it.qty), 0);
            
            const draftPayload = {
              noTrx: 'QUO-' + new Date().getFullYear() + (new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000),
              customerName: data.customerName,
              tanggal: todayStr,
              total: itemsSubtotal,
              status: 'Penawaran',
              paymentStatus: 'Belum Lunas',
              sales: currentUser?.nama || 'General Sales',
              items: data.items
            };

            let itemsTableStr = `| No | Nama Produk | Qty | Harga Satuan | Subtotal |\n|---|---|---|---|---|\n`;
            data.items.forEach((it: any, idx: number) => {
              itemsTableStr += `| ${idx + 1} | **${it.nama}** | ${it.qty} unit | Rp ${it.harga.toLocaleString('id-ID')} | **Rp ${(it.harga * it.qty).toLocaleString('id-ID')}** |\n`;
            });

            return {
              responseText: `### 📝 PRATINJAU DRAFT FORM PENAWARAN HARGA (SIAP DISIMPAN)\n\nSeluruh data penawaran telah terkumpul:\n\n| Field Form Asli | Nilai Terbaca | Status Validasi |\n|---|---|---|\n| **No. Penawaran** | **${draftPayload.noTrx}** | 🟢 Auto-Generate |\n| **Pelanggan** | **${data.customerName}** | ${data.isNewCustomer ? '📌 Pelanggan Baru' : '✅ Terdaftar'} |\n| **Jumlah Item** | **${data.items.length} Produk** | ✅ Valid |\n| **Total Nilai Penawaran** | **Rp ${itemsSubtotal.toLocaleString('id-ID')}** | ✅ Sesuai Katalog |\n| **Sales** | **${draftPayload.sales}** | ✅ Terhubung |\n\n**Rincian Produk Ditawarkan:**\n${itemsTableStr}\n---\n⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
              draftData: {
                type: 'penawaran',
                payload: draftPayload,
                isSaved: false
              },
              nextSession: null
            };
          }

          // Move to Step 3: Biaya Ongkir & Ekspedisi for Transactions
          return {
            responseText: `### 🚚 Biaya Ongkir & Jasa Ekspedisi (Langkah 3 dari 5)\n\n- **Pelanggan**: **${data.customerName}** ✅\n- **Total ${data.items.length} Item Produk**: Subtotal Rp ${data.items.reduce((s: number, i: any) => s + (i.harga * i.qty), 0).toLocaleString('id-ID')} ✅\n\nBerapa **Biaya Ongkir (Rp)** dan **Nama Jasa Ekspedisi / Kurir**?\n*(Contoh: \`50000, JNE\` atau ketik \`0\` jika gratis ongkir)*`,
            nextSession: { type: 'transaction', step: 3, data }
          };
        }

        // Parse product input
        const parts = userText.split(',').map(s => s.trim());
        const prodQuery = parts[0].toLowerCase();
        const qtyMatch = userText.match(/\b(\d+)\b/);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

        // Match product from database catalog
        const matchedProd = products.find(p => p.nama?.toLowerCase().includes(prodQuery) || p.kode?.toLowerCase().includes(prodQuery));
        
        const prodName = matchedProd ? matchedProd.nama : parts[0];
        const prodCode = matchedProd ? matchedProd.kode : 'SKU-CUSTOM';
        const prodPrice = matchedProd ? (matchedProd.hargaJual || 100000) : 100000;
        const prodStock = matchedProd ? (matchedProd.stok || 0) : 100;

        const newItem = {
          produkId: matchedProd ? matchedProd.id : 'PROD-' + Date.now(),
          nama: prodName,
          kode: prodCode,
          harga: prodPrice,
          qty: qty,
          diskon: 0
        };

        const existingItems = data.items || [];
        const updatedItems = [...existingItems, newItem];
        data.items = updatedItems;

        let itemsSummary = `**Daftar Item Produk Terpilih (${updatedItems.length} Item):**\n`;
        updatedItems.forEach((it: any, idx: number) => {
          itemsSummary += `- Item ${idx + 1}: **${it.nama}** (${it.qty} unit @ Rp ${it.harga.toLocaleString('id-ID')} = Rp ${(it.harga * it.qty).toLocaleString('id-ID')})\n`;
        });

        return {
          responseText: `### 🛍️ Item Produk Berhasil Ditambahkan!\n\n${itemsSummary}\n*(Catatan Stok: **${prodName}** sisa ${prodStock} unit di gudang)*\n\nApakah ada **produk lain** yang ingin ditambahkan ke ${isQuote ? 'penawaran' : 'transaksi'} ini?\n\n- Ketik **Nama Produk Selanjutnya** (Contoh: \`Phostoxin 2 box\`)\n- ATAU Ketik **\`Lanjut\`** jika produk sudah selesai.`,
          nextSession: { type: activeSession.type, step: 2, data }
        };
      }

      // STEP 3: BIAYA ONGKIR & EKSPEDISI (TRANSACTION)
      if (activeSession.step === 3) {
        let ongkirAmt = 0;
        let jasaKirim = 'JNE / Ekspedisi';

        const parts = userText.split(',').map(s => s.trim());
        const numMatch = userText.replace(/[^0-9]/g, '');
        if (numMatch) {
          ongkirAmt = parseInt(numMatch, 10) || 0;
        }
        if (parts.length >= 2) {
          jasaKirim = parts[1];
        } else if (userText.toLowerCase().includes('jne')) jasaKirim = 'JNE';
        else if (userText.toLowerCase().includes('sicepat')) jasaKirim = 'SiCepat';
        else if (userText.toLowerCase().includes('j&t')) jasaKirim = 'J&T';

        data.biayaOngkir = ongkirAmt;
        data.jasaKirim = jasaKirim;

        return {
          responseText: `### 📄 Pajak PPN 11% (Langkah 4 dari 5)\n\n- **Biaya Ongkir**: **Rp ${ongkirAmt.toLocaleString('id-ID')}** (${jasaKirim}) ✅\n\nApakah transaksi ini dikenakan **Pajak PPN 11%**?\n*(Ketik \`Ya\` atau \`Tidak\`)*`,
          nextSession: { type: 'transaction', step: 4, data }
        };
      }

      // STEP 4: PAJAK PPN 11% (TRANSACTION)
      if (activeSession.step === 4) {
        const isPpn = userText.toLowerCase().includes('ya') || userText.toLowerCase().includes('ppn') || userText.toLowerCase().includes('11');
        data.ppn = isPpn;

        const subtotal = data.items.reduce((sum: number, it: any) => sum + (it.harga * it.qty), 0);
        const ppnAmt = isPpn ? Math.round(subtotal * 0.11) : 0;
        const grandTotal = subtotal + (data.biayaOngkir || 0) + ppnAmt;
        data.grandTotal = grandTotal;

        return {
          responseText: `### 💳 Status Pembayaran & Pembayaran Diterima (Langkah 5 dari 5)\n\n- **Subtotal Produk**: **Rp ${subtotal.toLocaleString('id-ID')}** ✅\n- **Pajak PPN 11%**: **${isPpn ? `Rp ${ppnAmt.toLocaleString('id-ID')}` : 'Tanpa PPN'}** ✅\n- **Grand Total Transaksi**: **Rp ${grandTotal.toLocaleString('id-ID')}** ✅\n\nTerakhir! Apakah status pembayaran transaksi ini **Lunas**, **Belum Lunas**, atau **DP / Pembayaran Parsial**?\n*(Jika DP, masukkan nominal DP. Contoh: \`DP 5.000.000\` atau \`Lunas\`)*`,
          nextSession: { type: 'transaction', step: 5, data }
        };
      }

      // STEP 5: STATUS PEMBAYARAN & FINAL DRAFT GENERATION
      if (activeSession.step === 5) {
        const lowerInput = userText.toLowerCase();
        const isPaid = lowerInput.includes('lunas') && !lowerInput.includes('belum') && !lowerInput.includes('dp');
        let dpAmt = 0;

        if (lowerInput.includes('dp') || lowerInput.includes('uang muka') || lowerInput.includes('parsial')) {
          const numMatch = userText.replace(/[^0-9]/g, '');
          if (numMatch) dpAmt = parseInt(numMatch, 10) || 0;
        } else if (isPaid) {
          dpAmt = data.grandTotal;
        }

        const payStatus = isPaid ? 'Lunas' : (dpAmt > 0 ? 'DP / Parsial' : 'Belum Lunas');
        const sisaPay = Math.max(0, data.grandTotal - dpAmt);
        const todayStr = new Date().toISOString().split('T')[0];

        const subtotal = data.items.reduce((sum: number, it: any) => sum + (it.harga * it.qty), 0);
        const ppnAmt = data.ppn ? Math.round(subtotal * 0.11) : 0;

        const draftPayload = {
          noTrx: 'PP-' + new Date().getFullYear() + (new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000),
          customerName: data.customerName,
          tanggal: todayStr,
          total: data.grandTotal,
          nilaiProyek: data.grandTotal,
          items: data.items,
          ppn: data.ppn,
          ongkir: (data.biayaOngkir || 0) > 0,
          biayaOngkir: data.biayaOngkir || 0,
          jasaKirim: data.jasaKirim || 'Ekspedisi',
          status: 'Selesai',
          paymentStatus: payStatus,
          pembayaranDiterima: dpAmt,
          sisaPembayaran: sisaPay,
          sales: currentUser?.nama || 'General Sales',
          keterangan: 'Input via Panca AI Assistant'
        };

        let itemsTableStr = `| No | Kode SKU | Nama Produk | Qty | Harga Satuan | Subtotal |\n|---|---|---|---|---|---|\n`;
        data.items.forEach((it: any, idx: number) => {
          itemsTableStr += `| ${idx + 1} | ${it.kode} | **${it.nama}** | ${it.qty} unit | Rp ${it.harga.toLocaleString('id-ID')} | **Rp ${(it.harga * it.qty).toLocaleString('id-ID')}** |\n`;
        });

        return {
          responseText: `### 📝 PRATINJAU DRAFT FORM TRANSAKSI PENJUALAN (SIAP DISIMPAN)\n\nSeluruh data transaksi telah lengkap terverifikasi:\n\n| Field Form Asli | Nilai Terbaca | Status Validasi |\n|---|---|---|\n| **No. Transaksi** | **${draftPayload.noTrx}** | 🟢 Auto-Generate (PP-..)\n| **Nama Pelanggan** | **${data.customerName}** | ${data.isNewCustomer ? '📌 Pelanggan Baru' : '✅ Terdaftar di Database'} |\n| **Rincian Item** | **${data.items.length} Jenis Produk** | ✅ Sesuai Katalog |\n| **Subtotal Produk** | **Rp ${subtotal.toLocaleString('id-ID')}** | ✅ Terhitung |\n| **Biaya Ongkir** | **Rp ${(data.biayaOngkir || 0).toLocaleString('id-ID')}** (${data.jasaKirim}) | ✅ Valid |\n| **Pajak PPN (11%)** | **${data.ppn ? `Rp ${ppnAmt.toLocaleString('id-ID')}` : 'Tidak Ada (0%)'}** | 📄 Terhitung |\n| **GRAND TOTAL TRANSAKSI** | **Rp ${data.grandTotal.toLocaleString('id-ID')}** | 💰 Total Akhir |\n| **Status Pembayaran** | **${payStatus}** | 💳 Pembayaran Diterima: Rp ${dpAmt.toLocaleString('id-ID')} (Sisa: Rp ${sisaPay.toLocaleString('id-ID')}) |\n| **Sales Penanggung Jawab** | **${draftPayload.sales}** | ✅ Terhubung |\n\n**Rincian Barang Diproses:**\n${itemsTableStr}\n---\n⚠️ **Silakan periksa kembali data transaksi di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan secara resmi ke database MyPanca!`,
          draftData: {
            type: 'transaction',
            payload: draftPayload,
            isSaved: false
          },
          nextSession: null
        };
      }
    }

    return null;
  };

  // Dedicated Intent & Command Handler (Customer, Transaksi, Penawaran)
  const handleCommandOrIntent = (text: string): { responseText: string; draftData?: DraftData; nextSession?: typeof activeSession } | null => {
    const lower = text.toLowerCase().trim();

    // 1. Customer Input / Creation Intent
    const isCustomerIntent = 
      lower.startsWith('/input customer') || lower.startsWith('input customer') ||
      lower.startsWith('/tambah customer') || lower.startsWith('tambah customer') ||
      lower.includes('tambah customer') || lower.includes('input customer') ||
      lower === 'tambah customer baru' || lower === 'customer baru';

    if (isCustomerIntent) {
      const prefixRegex = /^(\/input customer|input customer|\/tambah customer|tambah customer|tambah customer baru|customer baru)/i;
      const rawData = text.replace(prefixRegex, '').trim();
      const parts = rawData.split(',').map(s => s.trim()).filter(Boolean);

      const initName = parts[0] || '';
      const initWa = parts.find(p => /08[0-9]{8,}/.test(p)) || '';
      const initCity = parts.find(p => p !== initName && !p.includes('08')) || '';

      return {
        responseText: `### 👤 Form CRM Customer Baru\n\nSilakan isi data pelanggan baru pada **Form CRM Interactive** di bawah ini:`,
        nextSession: {
          type: 'customer',
          step: 1,
          data: {
            nama: initName,
            perusahaan: initName,
            whatsapp: initWa,
            kota: initCity,
            sales: currentUser?.nama || 'General Sales',
            leadType: 'Belum Transaksi'
          }
        }
      };
    }

    // 2. Transaksi / Penawaran Input Intent
    const isTrxIntent = 
      lower.startsWith('/input transaksi') || lower.startsWith('input transaksi') ||
      lower.startsWith('/input penawaran') || lower.startsWith('input penawaran') ||
      lower.startsWith('/tambah transaksi') || lower.startsWith('tambah transaksi') ||
      lower.startsWith('/tambah penawaran') || lower.startsWith('tambah penawaran') ||
      lower.includes('tambah transaksi') || lower.includes('tambah penawaran') ||
      lower === 'transaksi baru' || lower === 'tambah transaksi baru' ||
      lower === 'penawaran baru' || lower === 'tambah penawaran baru';

    if (isTrxIntent) {
      const isQuote = lower.includes('penawaran');
      const prefixRegex = /^(\/input transaksi|input transaksi|\/input penawaran|input penawaran|\/tambah transaksi|tambah transaksi|\/tambah penawaran|tambah penawaran|tambah transaksi baru|transaksi baru|tambah penawaran baru|penawaran baru)/i;
      const rawData = text.replace(prefixRegex, '').trim();
      const parts = rawData.split(',').map(s => s.trim()).filter(Boolean);

      const initCust = parts[0] || '';
      const initProd = parts[1] || '';

      const initItems = initProd ? [{
        produkId: 'PROD-' + Date.now(),
        nama: initProd,
        kode: 'SKU-AI',
        harga: 100000,
        qty: 1,
        diskon: 0
      }] : [];

      return {
        responseText: `### ${isQuote ? '📋 Form CRM Penawaran Harga Baru' : '🛍️ Form CRM Transaksi Penjualan Baru'}\n\nSilakan isi dan periksa rincian transaksi pada **Form CRM Interactive** di bawah ini:`,
        nextSession: {
          type: isQuote ? 'penawaran' : 'transaction',
          step: 1,
          data: {
            docType: isQuote ? 'penawaran' : 'transaction',
            customerName: initCust,
            items: initItems,
            ppn: false,
            ongkir: false,
            biayaOngkir: 0,
            jasaKirim: 'JNE',
            paymentStatus: isQuote ? 'Penawaran' : 'Belum Lunas',
            dpAmt: 0,
            keterangan: 'Input via Panca AI Assistant'
          }
        }
      };
    }

    return null;
  };

  const handleConfirmDraftSave = (messageId: string) => {
    const targetMsg = messages.find(m => m.id === messageId);
    if (!targetMsg || !targetMsg.draftData || targetMsg.draftData.isSaved) return;

    const { type, payload } = targetMsg.draftData;
    const activeCompanyId = activeCompany?.id || '1';

    try {
      if (type === 'customer') {
        const newCust = {
          id: 'CUST-' + Date.now(),
          nama: payload.nama,
          perusahaan: payload.perusahaan || payload.nama,
          kota: payload.kota || 'Surabaya',
          whatsapp: payload.whatsapp || '08123456789',
          phone: payload.whatsapp || '08123456789',
          sales: payload.sales || currentUser?.nama || 'General Sales',
          leadType: payload.leadType || 'Belum Transaksi',
          pic: payload.pic || payload.nama,
          companyId: activeCompanyId,
          company_id: activeCompanyId,
          createdAt: new Date().toISOString()
        };

        if (setCustomers) setCustomers(prev => [newCust, ...prev]);
        if (syncToSupabase) syncToSupabase('customers', newCust);

        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              content: m.content + `\n\n---\n🎉 **SUKSES TERSIMPAN KE DATABASE BRM CONTACTS!**\n\nData customer **${newCust.nama}** (${newCust.kota}) telah resmi tersimpan ke database MyPanca.`,
              draftData: { ...m.draftData!, isSaved: true }
            };
          }
          return m;
        }));
      } else if (type === 'transaction' || type === 'penawaran') {
        const isQuote = type === 'penawaran';
        const newTrx = {
          id: (isQuote ? 'QUO-' : 'PP-') + Date.now(),
          noTrx: payload.noTrx || ((isQuote ? 'QUO-' : 'PP-') + Date.now()),
          customerName: payload.customerName,
          tanggal: payload.tanggal || new Date().toISOString().split('T')[0],
          total: payload.total || 1000000,
          nilaiProyek: payload.total || 1000000,
          items: payload.items || [{ produkId: 'P1', nama: 'Item AI', kode: 'SKU-AI', qty: 1, harga: payload.total || 1000000, diskon: 0 }],
          ppn: Boolean(payload.ppn),
          ongkir: Boolean(payload.ongkir),
          biayaOngkir: payload.biayaOngkir || 0,
          jasaKirim: payload.jasaKirim || 'Ekspedisi',
          status: payload.status || (isQuote ? 'Penawaran' : 'Selesai'),
          paymentStatus: payload.paymentStatus || 'Belum Lunas',
          pembayaranDiterima: payload.pembayaranDiterima || 0,
          sisaPembayaran: payload.sisaPembayaran || 0,
          sales: payload.sales || currentUser?.nama || 'General Sales',
          keterangan: payload.keterangan || 'Input via Panca AI Assistant',
          companyId: activeCompanyId,
          company_id: activeCompanyId,
          createdAt: new Date().toISOString()
        };

        if (setTransactions) setTransactions(prev => [newTrx, ...prev]);
        if (syncToSupabase) syncToSupabase('transactions', newTrx);

        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              content: m.content + `\n\n---\n🎉 **SUKSES TERSIMPAN KE DATABASE ${isQuote ? 'PENAWARAN' : 'TRANSAKSI'}!**\n\nDokumen **${newTrx.noTrx}** (${newTrx.customerName} - Rp ${newTrx.total.toLocaleString('id-ID')}) telah resmi tersimpan ke database MyPanca.`,
              draftData: { ...m.draftData!, isSaved: true }
            };
          }
          return m;
        }));
      }
    } catch (e) {
      console.error("Draft Save Error:", e);
      alert("Gagal menyimpan data ke database. Silakan coba kembali.");
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputPrompt;
    if (!query.trim() || isLoading) return;

    // Stop voice listening if running
    stopVoiceInput();
    stopSpeaking();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputPrompt('');

    // 1. Check for activeSession step processing first
    if (activeSession) {
      const stepRes = handleActiveSessionStep(query.trim());
      if (stepRes) {
        setActiveSession(stepRes.nextSession || null);
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: stepRes.responseText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          draftData: stepRes.draftData,
          isNew: true
        };
        setMessages(prev => [...prev, assistantMessage]);
        return;
      }
    }

    // 2. Check for draft command / intent initiation
    const cmdResult = handleCommandOrIntent(query.trim());
    if (cmdResult) {
      if (cmdResult.nextSession !== undefined) {
        setActiveSession(cmdResult.nextSession);
      }
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: cmdResult.responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        draftData: cmdResult.draftData,
        isNew: true
      };
      setMessages(prev => [...prev, assistantMessage]);
      return;
    }

    setIsLoading(true);

    try {
      const historyPayload = messages.map(m => ({ role: m.role, content: m.content }));
      const contextPayload: PancaAIContext = {
        currentUser,
        activeCompany,
        transactions,
        customers,
        products,
        suppliers,
        purchaseOrders,
        employees,
        taskAppData
      };

      const responseText = await queryPancaAI(query.trim(), historyPayload, contextPayload);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isNew: true
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Auto speak if enabled
      if (autoSpeak) {
        speakText(responseText, assistantMessage.id);
      }
    } catch (e) {
      console.error("Panca AI Chat Error:", e);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Maaf, terjadi kendala saat memproses pertanyaan Anda. Silakan coba kembali.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans relative">
      {/* Top Header */}
      <div className="bg-white dark:bg-zinc-900 px-4 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between shadow-xs shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              stopSpeaking();
              stopVoiceInput();
              onBack();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 flex items-center justify-center text-slate-600 dark:text-zinc-300 transition active:scale-95"
            title="Kembali ke Beranda"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-extrabold text-xs shadow-xs">
            P
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 leading-tight">Panca AI Chat</h3>
            <p className="text-[10px] text-slate-400 dark:text-zinc-400">Teks, Suara & Input Data Cepat</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Auto Speak Toggle */}
          <button
            onClick={() => {
              const next = !autoSpeak;
              setAutoSpeak(next);
              if (!next) stopSpeaking();
            }}
            className={`p-2 rounded-xl transition active:scale-95 ${
              autoSpeak
                ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold'
                : 'text-slate-400 dark:text-zinc-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
            title={autoSpeak ? "Suara AI Otomatis Aktif (Klik untuk Matikan)" : "Nyalakan Suara AI Otomatis"}
          >
            {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Clear Chat */}
          <button
            onClick={clearChat}
            className="p-2 text-slate-400 dark:text-zinc-400 hover:text-rose-500 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition active:scale-95"
            title="Bersihkan Percakapan"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3.5">
        {messages.map((m) => {
          const isUser = m.role === 'user';
          const isSpeaking = speakingMessageId === m.id;

          return (
            <div
              key={m.id}
              className={`max-w-[88%] ${isUser ? 'ml-auto text-right' : 'mr-auto text-left'}`}
            >
              <div className="min-w-0">
                <div
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-2xs text-left ${
                    isUser
                      ? 'bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-tr-none font-medium'
                      : 'bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 border border-slate-200/80 dark:border-zinc-800 rounded-tl-none prose prose-xs dark:prose-invert max-w-none'
                  }`}
                >
                  {isUser ? (
                    <p className="font-medium whitespace-pre-wrap">{m.content}</p>
                  ) : (
                    <>
                      <TypewriterText
                        content={m.content}
                        isNew={Boolean(m.isNew)}
                        onComplete={() => {
                          if (m.isNew) {
                            setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, isNew: false } : msg));
                          }
                        }}
                      />

                      {/* Interactive Action Card for Draft Savings (Customer, Transaksi, Penawaran) */}
                      {m.draftData && (
                        <div className="mt-3 not-prose">
                          {!m.draftData.isSaved ? (
                            <button
                              type="button"
                              onClick={() => handleConfirmDraftSave(m.id)}
                              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 active:scale-98 text-white dark:text-zinc-900 font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <CheckCircle2 size={16} />
                              <span>Konfirmasi Simpan ke Database MyPanca</span>
                            </button>
                          ) : (
                            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 rounded-xl text-emerald-700 dark:text-emerald-300 font-extrabold text-xs flex items-center gap-2 shadow-2xs">
                              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Tersimpan di Database MyPanca</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Interactive Buttons for Product Specs */}
                      {(m.content.includes('Apakah Anda mau mengisi') || m.content.includes('spesifikasi produk ini sekarang')) && (
                        <div className="mt-3 flex items-center gap-2 not-prose">
                          <button
                            type="button"
                            onClick={() => handleSendMessage("Ya, isi sekarang")}
                            className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 active:scale-95 text-white dark:text-zinc-900 font-bold text-xs transition flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            <CheckCircle2 size={14} />
                            Ya, Isi Sekarang
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendMessage("Tidak, terima kasih")}
                            className="py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold text-xs transition flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle size={14} />
                            Tidak
                          </button>
                        </div>
                      )}

                      {/* Interactive Buttons for Transaction Details / Menunggak / Omzet */}
                      {((m.content.includes('Apakah Anda ingin') || m.content.includes('mau melihat')) && (m.content.includes('tampilkan rincian') || m.content.includes('melihat list') || m.content.includes('melihat rincian') || m.content.includes('daftar transaksinya') || m.content.includes('detail transaksinya') || m.content.includes('list transaksinya') || m.content.includes('rincian detail'))) && (
                        <div className="mt-3 flex items-center gap-2 not-prose">
                          <button
                            type="button"
                            onClick={() => handleSendMessage("Ya, tampilkan list transaksinya")}
                            className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 active:scale-95 text-white dark:text-zinc-900 font-bold text-xs transition flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            <CheckCircle2 size={14} />
                            Ya, Tampilkan List Transaksi
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendMessage("Tidak, ringkasan saja cukup")}
                            className="py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold text-xs transition flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle size={14} />
                            Tidak, Ringkasan Cukup
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className={`flex items-center gap-2 mt-1 px-1 text-[10px] text-slate-400 dark:text-zinc-500 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <span>{m.timestamp}</span>

                  {!isUser && (
                    <>
                      {/* Speak Button */}
                      <button
                        onClick={() => speakText(m.content, m.id)}
                        className={`hover:text-slate-900 dark:hover:text-white transition flex items-center gap-0.5 ${
                          isSpeaking ? 'text-slate-900 dark:text-white font-bold' : ''
                        }`}
                        title={isSpeaking ? "Hentikan Suara" : "Dengarkan Jawaban AI"}
                      >
                        {isSpeaking ? (
                          <>
                            <Square className="w-2.5 h-2.5 fill-slate-900 dark:fill-white text-slate-900 dark:text-white animate-pulse" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-2.5 h-2.5" />
                            <span>Dengarkan</span>
                          </>
                        )}
                      </button>

                      {/* Copy Button */}
                      <button
                        onClick={() => copyToClipboard(m.content, m.id)}
                        className="hover:text-slate-900 dark:hover:text-white transition flex items-center gap-0.5"
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-500" />
                            <span className="text-emerald-500">Disalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="mr-auto max-w-[85%]">
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-3 rounded-2xl rounded-tl-none flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-slate-900 dark:bg-zinc-200 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-slate-900 dark:bg-zinc-200 animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-slate-900 dark:bg-zinc-200 animate-bounce [animation-delay:0.4s]" />
              <span className="text-xs text-slate-400 dark:text-zinc-400 font-medium ml-1">Mencari data sistem...</span>
            </div>
          </div>
        )}

        {/* EMBEDDED INTERACTIVE CRM FORM CARD WHEN ACTIVE SESSION IS OPEN */}
        {activeSession && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-violet-200 dark:border-violet-800/80 shadow-xl p-4 my-2 text-xs space-y-3.5 animate-in fade-in slide-in-from-bottom-3 duration-300">
            {/* Header with Type Selector & Close Button */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h4 className="font-extrabold text-slate-900 dark:text-zinc-100 text-sm tracking-tight">
                  {activeSession.type === 'customer' 
                    ? '👤 Form Input Customer Baru (CRM)' 
                    : activeSession.type === 'penawaran'
                      ? '📋 Form Input Penawaran Harga (QUO)'
                      : '🛍️ Form Input Transaksi Penjualan (PP)'}
                </h4>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveSession(null);
                  setWizardCustSearch('');
                  setWizardProdSearch('');
                }}
                className="p-1 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition cursor-pointer"
                title="Tutup Form"
              >
                <XCircle size={18} />
              </button>
            </div>

            {/* FORM TYPE SWITCHER FOR TRANSACTIONS / PENAWARAN */}
            {(activeSession.type === 'transaction' || activeSession.type === 'penawaran') && (
              <div className="space-y-3">
                {/* Switch Document Type */}
                <div className="flex items-center gap-2 p-1 bg-slate-100/80 dark:bg-zinc-800/80 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => updateActiveData('docType', 'transaction')}
                    className={`flex-1 py-2 px-3 rounded-xl font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      activeSession.type === 'transaction'
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900'
                    }`}
                  >
                    <span>🛍️ Transaksi Penjualan (PP-..)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSession(prev => prev ? { ...prev, type: 'penawaran' } : null);
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      activeSession.type === 'penawaran'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-zinc-300 hover:text-slate-900'
                    }`}
                  >
                    <span>📋 Penawaran Harga (QUO-..)</span>
                  </button>
                </div>

                {/* 1. CUSTOMER SEARCH & SELECTOR */}
                <div className="space-y-1.5 bg-slate-50/80 dark:bg-zinc-950/50 p-3 rounded-2xl border border-slate-200/50 dark:border-zinc-800/60">
                  <label className="font-extrabold text-slate-800 dark:text-zinc-200 text-xs flex items-center gap-1.5">
                    <User size={14} className="text-violet-600" />
                    <span>Pilih Pelanggan / Customer (Search Database):</span>
                  </label>

                  {activeSession.data.customerName ? (
                    <div className="flex items-center justify-between p-2.5 bg-violet-50 dark:bg-violet-950/80 border border-violet-200 dark:border-violet-800 rounded-xl text-violet-900 dark:text-violet-200 font-extrabold">
                      <div className="min-w-0">
                        <p className="truncate text-xs">✅ {activeSession.data.customerName}</p>
                        <p className="text-[10px] text-violet-600 dark:text-violet-400 font-normal">
                          {customers.find(c => c.nama === activeSession.data.customerName)?.perusahaan || 'Pelanggan Terdaftar'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateActiveData('customerName', '')}
                        className="text-[10px] text-rose-600 dark:text-rose-400 underline font-bold ml-2 cursor-pointer"
                      >
                        Ganti
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          value={wizardCustSearch}
                          onChange={(e) => setWizardCustSearch(e.target.value)}
                          placeholder="Cari nama pelanggan, perusahaan, atau whatsapp..."
                          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-violet-500 outline-none shadow-xs"
                        />
                      </div>

                      <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
                        {customers
                          .filter(c => 
                            !wizardCustSearch || 
                            c.nama?.toLowerCase().includes(wizardCustSearch.toLowerCase()) || 
                            c.perusahaan?.toLowerCase().includes(wizardCustSearch.toLowerCase()) ||
                            c.whatsapp?.includes(wizardCustSearch)
                          )
                          .slice(0, 6)
                          .map((cust) => (
                            <button
                              key={cust.id || cust.nama}
                              type="button"
                              onClick={() => {
                                updateActiveData('customerName', cust.nama);
                                setWizardCustSearch('');
                              }}
                              className="w-full p-2 bg-white dark:bg-zinc-900 hover:bg-violet-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 rounded-xl text-left flex items-center justify-between transition cursor-pointer"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="font-extrabold text-slate-900 dark:text-zinc-100 text-xs truncate">{cust.nama}</p>
                                <p className="text-[10px] text-slate-400 truncate">{cust.perusahaan || '-'} • {cust.kota || '-'} ({cust.whatsapp || '-'})</p>
                              </div>
                              <span className="px-2 py-0.5 bg-violet-600 text-white rounded-md text-[10px] font-bold">Pilih</span>
                            </button>
                          ))}

                        {wizardCustSearch && (
                          <button
                            type="button"
                            onClick={() => {
                              updateActiveData('customerName', wizardCustSearch);
                              setWizardCustSearch('');
                            }}
                            className="w-full p-2 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 border border-amber-300 text-amber-900 dark:text-amber-200 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus size={13} />
                            <span>Gunakan "{wizardCustSearch}" sebagai Customer Baru</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. PRODUCT CATALOG SEARCH & BASKET */}
                <div className="space-y-2.5 bg-slate-50 dark:bg-zinc-950/60 p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800">
                  <label className="font-extrabold text-slate-800 dark:text-zinc-200 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Package size={14} className="text-violet-600" />
                      <span>Keranjang Item Produk & Barang:</span>
                    </span>
                    <span className="text-[11px] font-extrabold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950 px-2 py-0.5 rounded-full">
                      {activeSession.data.items?.length || 0} Item
                    </span>
                  </label>

                  {/* Basket Table */}
                  {activeSession.data.items?.length > 0 ? (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead className="bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-extrabold uppercase text-[10px]">
                          <tr>
                            <th className="p-2">Item</th>
                            <th className="p-2 text-center">Qty</th>
                            <th className="p-2 text-right">Harga</th>
                            <th className="p-2 text-right">Subtotal</th>
                            <th className="p-2 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                          {activeSession.data.items.map((it: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                              <td className="p-2 font-extrabold text-slate-800 dark:text-zinc-100 max-w-[120px] truncate">
                                {it.nama}
                              </td>
                              <td className="p-2 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={it.qty}
                                  onChange={(e) => {
                                    const newQty = Math.max(1, parseInt(e.target.value, 10) || 1);
                                    const updated = [...activeSession.data.items];
                                    updated[idx].qty = newQty;
                                    updateActiveData('items', updated);
                                  }}
                                  className="w-12 text-center bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-md py-0.5 font-bold"
                                />
                              </td>
                              <td className="p-2 text-right font-medium">
                                Rp {(it.harga || 0).toLocaleString('id-ID')}
                              </td>
                              <td className="p-2 text-right font-extrabold text-emerald-600 dark:text-emerald-400">
                                Rp {((it.harga * it.qty) - (it.diskon || 0)).toLocaleString('id-ID')}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = activeSession.data.items.filter((_: any, i: number) => i !== idx);
                                    updateActiveData('items', updated);
                                  }}
                                  className="text-rose-500 hover:text-rose-700 p-1 rounded-md cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic text-center py-2 bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-slate-300 dark:border-zinc-800">
                      Keranjang masih kosong. Cari & pilih produk di bawah ini:
                    </p>
                  )}

                  {/* Add Product Search Input */}
                  <div className="flex gap-2 pt-1">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={wizardProdSearch}
                        onChange={(e) => setWizardProdSearch(e.target.value)}
                        placeholder="Cari & tambah barang dari katalog..."
                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-violet-500 outline-none shadow-xs"
                      />
                    </div>

                    <div className="flex items-center bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-2">
                      <button
                        type="button"
                        onClick={() => setWizardProdQty(Math.max(1, wizardProdQty - 1))}
                        className="px-1.5 font-extrabold text-slate-600 dark:text-zinc-300 hover:text-violet-600 cursor-pointer"
                      >-</button>
                      <span className="px-2 font-bold text-xs">{wizardProdQty}</span>
                      <button
                        type="button"
                        onClick={() => setWizardProdQty(wizardProdQty + 1)}
                        className="px-1.5 font-extrabold text-slate-600 dark:text-zinc-300 hover:text-violet-600 cursor-pointer"
                      >+</button>
                    </div>
                  </div>

                  {/* Product Catalog Results */}
                  <div className="max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar">
                    {products
                      .filter(p => 
                        !wizardProdSearch || 
                        p.nama?.toLowerCase().includes(wizardProdSearch.toLowerCase()) || 
                        p.kode?.toLowerCase().includes(wizardProdSearch.toLowerCase())
                      )
                      .slice(0, 6)
                      .map((prod) => (
                        <div
                          key={prod.id || prod.kode}
                          className="p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl flex items-center justify-between"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-extrabold text-slate-900 dark:text-zinc-100 text-xs truncate">{prod.nama}</p>
                            <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                              SKU: <strong>{prod.kode || '-'}</strong> • Rp {(prod.hargaJual || 0).toLocaleString('id-ID')} • Stok: <span className="font-extrabold text-emerald-600">{prod.stok || 0} unit</span>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const newItem = {
                                produkId: prod.id || 'PROD-' + Date.now(),
                                nama: prod.nama,
                                kode: prod.kode || 'SKU',
                                harga: prod.hargaJual || 100000,
                                qty: wizardProdQty,
                                diskon: 0
                              };
                              const updated = [...(activeSession.data.items || []), newItem];
                              updateActiveData('items', updated);
                              setWizardProdSearch('');
                              setWizardProdQty(1);
                            }}
                            className="px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[10px] font-extrabold cursor-pointer flex items-center gap-1 transition active:scale-95 shrink-0"
                          >
                            <Plus size={12} />
                            <span>+ Tambah</span>
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                {/* 3. PPN, SHIPPING & PAYMENT OPTIONS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Tax & Ongkir Options */}
                  <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-2">
                    <label className="font-extrabold text-slate-800 dark:text-zinc-200 text-xs block border-b pb-1">
                      📄 Pajak & Pengiriman:
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={Boolean(activeSession.data.ppn)}
                        onChange={(e) => updateActiveData('ppn', e.target.checked)}
                        className="rounded text-violet-600 w-4 h-4"
                      />
                      <span>Kenakan Pajak PPN (11%)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={Boolean(activeSession.data.ongkir)}
                        onChange={(e) => updateActiveData('ongkir', e.target.checked)}
                        className="rounded text-violet-600 w-4 h-4"
                      />
                      <span>Biaya Kirim / Shipping Fee</span>
                    </label>

                    {activeSession.data.ongkir && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-400">Nominal Ongkir (Rp):</span>
                          <input
                            type="number"
                            value={activeSession.data.biayaOngkir || 0}
                            onChange={(e) => updateActiveData('biayaOngkir', parseInt(e.target.value, 10) || 0)}
                            className="w-full p-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg font-bold text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-400">Kurir / Ekspedisi:</span>
                          <select
                            value={activeSession.data.jasaKirim || 'JNE'}
                            onChange={(e) => updateActiveData('jasaKirim', e.target.value)}
                            className="w-full p-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg font-bold text-xs"
                          >
                            <option value="JNE">JNE Express</option>
                            <option value="SiCepat">SiCepat</option>
                            <option value="J&T">J&T Express</option>
                            <option value="Lalamove">Lalamove</option>
                            <option value="Deliveree">Deliveree</option>
                            <option value="Ekspedisi Custom">Ekspedisi Lainnya</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment Status & Received Amount */}
                  <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-200/80 dark:border-zinc-800 space-y-2">
                    <label className="font-extrabold text-slate-800 dark:text-zinc-200 text-xs block border-b pb-1">
                      💳 Status Pembayaran:
                    </label>

                    <div className="flex gap-1">
                      {['Lunas', 'Belum Lunas', 'DP / Parsial'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => updateActiveData('paymentStatus', st)}
                          className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] transition cursor-pointer ${
                            activeSession.data.paymentStatus === st
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {activeSession.data.paymentStatus === 'DP / Parsial' && (
                      <div className="pt-1">
                        <span className="text-[10px] font-extrabold text-slate-400">Nominal DP Diterima (Rp):</span>
                        <input
                          type="number"
                          value={activeSession.data.dpAmt || 0}
                          onChange={(e) => updateActiveData('dpAmt', parseInt(e.target.value, 10) || 0)}
                          placeholder="Masukkan DP..."
                          className="w-full p-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg font-bold text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. GRAND TOTAL SUMMARY CARD & SUBMIT BUTTON */}
                {(() => {
                  const items = activeSession.data.items || [];
                  const subtotal = items.reduce((s: number, i: any) => s + (i.harga * i.qty) - (i.diskon || 0), 0);
                  const ppnAmt = activeSession.data.ppn ? Math.round(subtotal * 0.11) : 0;
                  const ongkirAmt = activeSession.data.ongkir ? (Number(activeSession.data.biayaOngkir) || 0) : 0;
                  const grandTotal = subtotal + ppnAmt + ongkirAmt;

                  return (
                    <div className="p-3.5 bg-gradient-to-r from-violet-900 via-indigo-900 to-slate-900 text-white rounded-xl space-y-3 shadow-md">
                      <div className="flex justify-between items-center text-xs border-b border-violet-700/60 pb-2">
                        <span>Subtotal Produk: <strong>Rp {subtotal.toLocaleString('id-ID')}</strong></span>
                        <span>PPN: <strong>Rp {ppnAmt.toLocaleString('id-ID')}</strong></span>
                        <span>Ongkir: <strong>Rp {ongkirAmt.toLocaleString('id-ID')}</strong></span>
                      </div>

                      <div className="flex justify-between items-center font-black text-sm">
                        <span className="text-violet-200">TOTAL AKHIR TRANSAKSI:</span>
                        <span className="text-emerald-400 text-base">Rp {grandTotal.toLocaleString('id-ID')}</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleDirectSaveFromForm}
                        className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 size={18} />
                        <span>Simpan {activeSession.type === 'penawaran' ? 'Penawaran' : 'Transaksi'} ke Database MyPanca</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* FORM FOR CUSTOMER BARU */}
            {activeSession.type === 'customer' && (
              <div className="space-y-3">
                <div className="space-y-2 bg-slate-50 dark:bg-zinc-950/60 p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-zinc-300 text-xs">Nama Lengkap / Perusahaan:</label>
                    <input
                      type="text"
                      value={activeSession.data.nama || ''}
                      onChange={(e) => updateActiveData('nama', e.target.value)}
                      placeholder="Contoh: PT Jaya Abadi"
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl font-medium text-xs mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-zinc-300 text-xs">No. WhatsApp / HP:</label>
                      <input
                        type="text"
                        value={activeSession.data.whatsapp || ''}
                        onChange={(e) => updateActiveData('whatsapp', e.target.value)}
                        placeholder="08123456789"
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl font-medium text-xs mt-1"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 dark:text-zinc-300 text-xs">Kota / Wilayah:</label>
                      <input
                        type="text"
                        value={activeSession.data.kota || ''}
                        onChange={(e) => updateActiveData('kota', e.target.value)}
                        placeholder="Surabaya"
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl font-medium text-xs mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-zinc-300 text-xs">Sales Rep Penanggung Jawab:</label>
                    <input
                      type="text"
                      value={activeSession.data.sales || currentUser?.nama || ''}
                      onChange={(e) => updateActiveData('sales', e.target.value)}
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl font-medium text-xs mt-1"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDirectSaveFromForm}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={18} />
                  <span>Simpan Data Customer ke Database MyPanca</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar if input is empty */}
      {!inputPrompt && !isListening && (
        <div className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200/80 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0">
          <span className="text-[10px] text-slate-400 dark:text-zinc-400 font-extrabold uppercase shrink-0">Cepat:</span>
          {[
            { label: 'Tambah Customer', prompt: 'tambah customer baru' },
            { label: 'Transaksi Baru', prompt: 'tambah transaksi baru' },
            { label: 'Penawaran Baru', prompt: 'tambah penawaran baru' },
            { label: 'Omzet Bulan Ini', prompt: 'Omzet bulan ini' },
            { label: 'Stok Menipis', prompt: 'Stok menipis' }
          ].map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip.prompt)}
              className="px-3 py-1.5 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 rounded-full text-xs font-bold whitespace-nowrap shadow-xs transition active:scale-95 shrink-0"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Bar Section (ALWAYS 100% VISIBLE & PROMINENT) */}
      <div className="bg-white dark:bg-zinc-900 p-3 border-t border-slate-200 dark:border-zinc-800 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] shrink-0 z-20">
        {/* Real-time Voice Listening Visualizer */}
        {isListening && (
          <div className="mb-2.5 px-3.5 py-2.5 bg-slate-900 dark:bg-zinc-800 text-white rounded-2xl flex items-center justify-between text-xs shadow-lg animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              <div className="min-w-0">
                <p className="font-extrabold truncate">Mendengarkan suara Anda...</p>
                <p className="text-[10px] text-slate-300 truncate">Silakan bicara sekarang (contoh: "Tambah customer baru")</p>
              </div>
            </div>

            <button
              type="button"
              onClick={stopVoiceInput}
              className="px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-extrabold shadow-xs active:scale-95 transition shrink-0"
            >
              Selesai
            </button>
          </div>
        )}

        {/* Speech Error Banner if any */}
        {speechError && (
          <div className="mb-2 p-2.5 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 rounded-xl text-xs flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">{speechError}</span>
            </div>
            <button onClick={() => setSpeechError(null)} className="text-amber-500 hover:text-amber-700 font-bold px-1">✕</button>
          </div>
        )}

        {/* Interactive Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          {/* Voice Microphone Button */}
          <button
            type="button"
            onClick={startVoiceInput}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition active:scale-90 shrink-0 ${
              isListening
                ? 'bg-rose-500 text-white shadow-lg ring-4 ring-rose-200 animate-pulse'
                : 'bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 shadow-xs'
            }`}
            title={isListening ? "Hentikan perekaman suara" : "Bicara dengan suara (Voice Search)"}
          >
            {isListening ? (
              <Square className="w-4 h-4 fill-white" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          {/* Text Input Box */}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder={isListening ? "Sedang mendengarkan suara Anda..." : "Tanyakan AI atau tambah customer / transaksi baru..."}
              className={`w-full rounded-2xl px-4 py-3 text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none transition border shadow-inner ${
                isListening
                  ? 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-300 text-rose-900 dark:text-rose-200'
                  : 'bg-slate-100 dark:bg-zinc-950 hover:bg-slate-100/80 focus:bg-white dark:focus:bg-zinc-950 border-slate-200 dark:border-zinc-800 focus:border-slate-800 focus:ring-2 focus:ring-slate-200 dark:focus:ring-zinc-800'
              }`}
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputPrompt.trim() || isLoading}
            className="w-11 h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 flex items-center justify-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-90 shrink-0"
            title="Kirim Pesan"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
