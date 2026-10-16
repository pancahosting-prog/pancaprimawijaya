import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, ArrowLeft, Trash2, Copy, Check, Sparkles, 
  Bot, User, Download, Mic, Square, Volume2, VolumeX,
  AlertCircle, Radio, CheckCircle2, XCircle
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
    const chunkSize = Math.max(3, Math.floor(totalLength / 80));

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
    }, 15);

    return () => clearInterval(interval);
  }, [content, isNew]);

  return (
    <div className="relative overflow-x-auto">
      <Markdown remarkPlugins={[remarkGfm]}>
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
        content: `Halo, **${currentUser?.nama || 'Bapak/Ibu'}**! 👋 Selamat datang di **Panca AI Chat**.\n\nSaya siap melayani Anda melalui **teks maupun suara (voice chat)** untuk mencari informasi data transaksi (seperti **TRX-70**), status piutang, stok produk, serta tugas & proyek tim.\n\nTekan tombol mikrofon 🎙️ di bawah untuk mulai bicara, atau ketik langsung di kolom pesan!`,
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

    // 2. TRANSACTION GUIDED WIZARD
    if (activeSession.type === 'transaction') {
      if (activeSession.step === 1) {
        data.customerName = userText.trim();
        return {
          responseText: `### 🛍️ Input Transaksi Penjualan Baru (Langkah 2 dari 4)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n\nSelanjutnya, **Item Produk / Barang** apa yang dibeli?\n*(Contoh: Fumiphos 5 box)*`,
          nextSession: { type: 'transaction', step: 2, data }
        };
      }

      if (activeSession.step === 2) {
        data.productName = userText.trim();
        return {
          responseText: `### 🛍️ Input Transaksi Penjualan Baru (Langkah 3 dari 4)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n- **Produk Dibeli**: **${data.productName}** ✅\n\nSelanjutnya, berapa **Total Nominal Transaksi (Rp)**?\n*(Contoh: 15.000.000 atau 15 juta)*`,
          nextSession: { type: 'transaction', step: 3, data }
        };
      }

      if (activeSession.step === 3) {
        let totalAmt = 1000000;
        const rawAmt = userText.toLowerCase().trim();
        if (rawAmt.includes('juta') || rawAmt.includes('jt')) {
          const num = parseFloat(rawAmt.replace(/[^0-9.]/g, ''));
          if (!isNaN(num)) totalAmt = num * 1000000;
        } else {
          const num = parseFloat(rawAmt.replace(/[^0-9]/g, ''));
          if (!isNaN(num) && num > 0) totalAmt = num;
        }

        data.totalAmount = totalAmt;
        return {
          responseText: `### 🛍️ Input Transaksi Penjualan Baru (Langkah 4 dari 4)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n- **Produk Dibeli**: **${data.productName}** ✅\n- **Total Nominal**: **Rp ${data.totalAmount.toLocaleString('id-ID')}** ✅\n\nTerakhir! Apakah status pembayaran transaksi ini **Lunas** atau **Belum Lunas**?\n*(Ketik \`Lunas\` atau \`Belum Lunas\`)*`,
          nextSession: { type: 'transaction', step: 4, data }
        };
      }

      if (activeSession.step === 4) {
        const isPaid = userText.toLowerCase().includes('lunas') && !userText.toLowerCase().includes('belum');
        data.paymentStatus = isPaid ? 'Lunas' : 'Belum Lunas';
        const todayStr = new Date().toISOString().split('T')[0];

        const draftPayload = {
          noTrx: 'TRX-' + new Date().getFullYear() + (new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000),
          customerName: data.customerName,
          tanggal: todayStr,
          total: data.totalAmount,
          status: 'Selesai',
          paymentStatus: data.paymentStatus,
          sales: currentUser?.nama || 'General Sales',
          items: [{ nama: data.productName, qty: 1, harga: data.totalAmount }]
        };

        return {
          responseText: `### 📝 PRATINJAU DRAFT FORM TRANSAKSI PENJUALAN (SIAP DISIMPAN)\n\nSeluruh data transaksi telah berhasil terkumpul:\n\n| Field Form Asli | Nilai Terbaca | Status Validasi |\n|---|---|---|\n| **No. Transaksi** | **${draftPayload.noTrx}** | 🟢 Auto-Generate |\n| **Nama Pelanggan** | **${data.customerName}** | ✅ Valid |\n| **Item Produk** | **${data.productName}** | ✅ Valid |\n| **Total Nominal** | **Rp ${data.totalAmount.toLocaleString('id-ID')}** | ✅ Valid |\n| **Status Pembayaran** | **${data.paymentStatus}** | 💳 Tervalidasi |\n| **Sales** | **${draftPayload.sales}** | ✅ Terhubung |\n\n---\n⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
          draftData: {
            type: 'transaction',
            payload: draftPayload,
            isSaved: false
          },
          nextSession: null
        };
      }
    }

    // 3. PENAWARAN GUIDED WIZARD
    if (activeSession.type === 'penawaran') {
      if (activeSession.step === 1) {
        data.customerName = userText.trim();
        return {
          responseText: `### 📋 Input Penawaran Harga Baru (Langkah 2 dari 3)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n\nSelanjutnya, **Item / Produk** apa yang ditawarkan?\n*(Contoh: Fumiphos 5 box)*`,
          nextSession: { type: 'penawaran', step: 2, data }
        };
      }

      if (activeSession.step === 2) {
        data.productName = userText.trim();
        return {
          responseText: `### 📋 Input Penawaran Harga Baru (Langkah 3 dari 3)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n- **Produk Ditawarkan**: **${data.productName}** ✅\n\nSelanjutnya, berapa **Total Nilai Penawaran (Rp)**?\n*(Contoh: 8.000.000 atau 8 juta)*`,
          nextSession: { type: 'penawaran', step: 3, data }
        };
      }

      if (activeSession.step === 3) {
        let totalAmt = 1000000;
        const rawAmt = userText.toLowerCase().trim();
        if (rawAmt.includes('juta') || rawAmt.includes('jt')) {
          const num = parseFloat(rawAmt.replace(/[^0-9.]/g, ''));
          if (!isNaN(num)) totalAmt = num * 1000000;
        } else {
          const num = parseFloat(rawAmt.replace(/[^0-9]/g, ''));
          if (!isNaN(num) && num > 0) totalAmt = num;
        }

        data.totalAmount = totalAmt;
        const todayStr = new Date().toISOString().split('T')[0];

        const draftPayload = {
          noTrx: 'QUO-' + new Date().getFullYear() + (new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000),
          customerName: data.customerName,
          tanggal: todayStr,
          total: data.totalAmount,
          status: 'Penawaran',
          paymentStatus: 'Belum Lunas',
          sales: currentUser?.nama || 'General Sales',
          items: [{ nama: data.productName, qty: 1, harga: data.totalAmount }]
        };

        return {
          responseText: `### 📝 PRATINJAU DRAFT FORM PENAWARAN HARGA (SIAP DISIMPAN)\n\nSeluruh data penawaran telah berhasil terkumpul:\n\n| Field Form Asli | Nilai Terbaca | Status Validasi |\n|---|---|---|\n| **No. Penawaran** | **${draftPayload.noTrx}** | 🟢 Auto-Generate |\n| **Nama Pelanggan** | **${data.customerName}** | ✅ Valid |\n| **Item Produk** | **${data.productName}** | ✅ Valid |\n| **Total Nilai Penawaran** | **Rp ${data.totalAmount.toLocaleString('id-ID')}** | ✅ Valid |\n| **Status** | **Penawaran Berjalan** | 📌 Default |\n| **Sales** | **${draftPayload.sales}** | ✅ Terhubung |\n\n---\n⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
          draftData: {
            type: 'penawaran',
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

    // 1. Customer Input / Creation
    if (
      lower.startsWith('/input customer') || lower.startsWith('input customer') ||
      lower.startsWith('/tambah customer') || lower.startsWith('tambah customer') ||
      lower === 'tambah customer baru' || lower === 'customer baru'
    ) {
      const prefixRegex = /^(\/input customer|input customer|\/tambah customer|tambah customer|tambah customer baru|customer baru)/i;
      const rawData = text.replace(prefixRegex, '').trim();

      if (!rawData) {
        return {
          responseText: `### 👥 Input Customer Baru (Langkah 1 dari 3)\n\nMari kita isi data customer baru satu per satu!\n\nSilakan masukkan **Nama Pelanggan / Perusahaan**:\n*(Contoh: PT Jaya Abadi)*\n\n*(Ketik \`batal\` jika ingin membatalkan)*`,
          nextSession: { type: 'customer', step: 1, data: {} }
        };
      }

      const parts = rawData.split(',').map(s => s.trim());
      const waMatch = rawData.match(/(?:wa|phone|hp|telp|whatsapp)[\s:]*([0-9\-\+\s]{9,15})/i) || rawData.match(/\b(08[0-9\s\-]{8,13})\b/);
      
      const name = parts[0] || 'Customer Baru';
      const wa = waMatch?.[1]?.replace(/[^0-9]/g, '') || parts.find(p => /08[0-9]{8,}/.test(p)) || '08123456789';
      const city = parts.find(p => !p.includes('08') && !p.toLowerCase().includes('sales') && !p.toLowerCase().includes('pic') && p !== parts[0]) || 'Surabaya';
      const salesName = currentUser?.nama || 'General Sales';
      const picName = name;

      const draftPayload = {
        nama: name,
        perusahaan: name,
        whatsapp: wa,
        phone: wa,
        kota: city,
        sales: salesName,
        pic: picName,
        leadType: 'Belum Transaksi'
      };

      return {
        responseText: `### 📝 DRAFT FORM CUSTOMER BARU (BRM CONTACTS)\n\nAI telah mengekstrak parameter data sesuai Form Asli MyPanca:\n\n| Field Form Asli | Nilai Terbaca | Status Validasi |\n|---|---|---|\n| **Nama Customer** | **${name}** | ✅ Valid |\n| **No. WA / Telepon** | **${wa}** | ✅ Valid |\n| **Kota / Wilayah** | **${city}** | ✅ Valid |\n| **Sales Penanggung Jawab** | **${salesName}** | ✅ Terhubung |\n| **Status Lead** | **Belum Transaksi** | 🟢 Aktif |\n\n---\n⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
        draftData: {
          type: 'customer',
          payload: draftPayload,
          isSaved: false
        },
        nextSession: null
      };
    }

    // 2. Transaksi / Penawaran Input
    if (
      lower.startsWith('/input transaksi') || lower.startsWith('input transaksi') ||
      lower.startsWith('/input penawaran') || lower.startsWith('input penawaran') ||
      lower.startsWith('/tambah transaksi') || lower.startsWith('tambah transaksi') ||
      lower.startsWith('/tambah penawaran') || lower.startsWith('tambah penawaran') ||
      lower === 'transaksi baru' || lower === 'tambah transaksi baru' ||
      lower === 'penawaran baru' || lower === 'tambah penawaran baru'
    ) {
      const isQuote = lower.includes('penawaran');
      const prefixRegex = /^(\/input transaksi|input transaksi|\/input penawaran|input penawaran|\/tambah transaksi|tambah transaksi|\/tambah penawaran|tambah penawaran|tambah transaksi baru|transaksi baru|tambah penawaran baru|penawaran baru)/i;
      const rawData = text.replace(prefixRegex, '').trim();

      if (!rawData) {
        return {
          responseText: `### ${isQuote ? '📋 Input Penawaran Harga Baru' : '🛍️ Input Transaksi Penjualan Baru'} (Langkah 1 dari ${isQuote ? '3' : '4'})\n\nMari kita isi data ${isQuote ? 'penawaran' : 'transaksi'} baru satu per satu!\n\nSiapa **Nama Pelanggan** untuk ${isQuote ? 'penawaran' : 'transaksi'} ini?\n*(Contoh: PT Jaya Abadi)*\n\n*(Ketik \`batal\` jika ingin membatalkan)*`,
          nextSession: { type: isQuote ? 'penawaran' : 'transaction', step: 1, data: {} }
        };
      }

      const parts = rawData.split(',').map(s => s.trim());
      const custName = parts[0] || 'Pelanggan Umum';
      const prodName = parts[1] || 'Item Transaksi AI';
      
      const amtMatch = rawData.match(/(?:total|nominal|harga|rp)?\s*([0-9\.\,]+|[\d\s]+juta|[\d\s]+jt)/i);
      let totalAmt = 1000000;
      if (amtMatch?.[1]) {
        const rawAmt = amtMatch[1].toLowerCase();
        if (rawAmt.includes('juta') || rawAmt.includes('jt')) {
          const num = parseFloat(rawAmt.replace(/[^0-9.]/g, ''));
          if (!isNaN(num)) totalAmt = num * 1000000;
        } else {
          const num = parseFloat(rawAmt.replace(/[^0-9]/g, ''));
          if (!isNaN(num) && num > 0) totalAmt = num;
        }
      }

      const isPaid = lower.includes('lunas') && !lower.includes('belum lunas');
      const todayStr = new Date().toISOString().split('T')[0];

      const draftPayload = {
        noTrx: (isQuote ? 'QUO-' : 'TRX-') + new Date().getFullYear() + (new Date().getMonth() + 1).toString().padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000),
        customerName: custName,
        tanggal: todayStr,
        total: totalAmt,
        status: isQuote ? 'Penawaran' : 'Selesai',
        paymentStatus: isPaid ? 'Lunas' : 'Belum Lunas',
        sales: currentUser?.nama || 'General Sales',
        items: [{ nama: prodName, qty: 1, harga: totalAmt }]
      };

      return {
        responseText: `### 📝 DRAFT FORM ${isQuote ? 'PENAWARAN' : 'TRANSAKSI PENJUALAN'} BARU\n\nAI telah mengekstrak parameter data sesuai Form Asli MyPanca:\n\n| Field Form Asli | Nilai Terbaca | Status Validasi |\n|---|---|---|\n| **No. ${isQuote ? 'Penawaran' : 'Transaksi'}** | **${draftPayload.noTrx}** | 🟢 Auto-Generate |\n| **Nama Pelanggan** | **${custName}** | ✅ Valid |\n| **Item Produk** | **${prodName}** | ✅ Valid |\n| **Total Nominal** | **Rp ${totalAmt.toLocaleString('id-ID')}** | ✅ Valid |\n| **Status** | **${isQuote ? 'Penawaran Berjalan' : 'Selesai'}** | 📌 Status Fix |\n| **Status Pembayaran** | **${isPaid ? 'Lunas' : 'Belum Lunas'}** | 💳 Valid |\n| **Sales** | **${draftPayload.sales}** | ✅ Terhubung |\n\n---\n⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
        draftData: {
          type: isQuote ? 'penawaran' : 'transaction',
          payload: draftPayload,
          isSaved: false
        },
        nextSession: null
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
        const newTrx = {
          id: 'TRX-' + Date.now(),
          noTrx: payload.noTrx || ('TRX-' + Date.now()),
          customerName: payload.customerName,
          tanggal: payload.tanggal || new Date().toISOString().split('T')[0],
          total: payload.total || 1000000,
          nilaiProyek: payload.total || 1000000,
          status: payload.status || 'Selesai',
          paymentStatus: payload.paymentStatus || 'Belum Lunas',
          sales: payload.sales || currentUser?.nama || 'General Sales',
          items: payload.items || [{ nama: 'Item AI', qty: 1, harga: payload.total || 1000000 }],
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
              content: m.content + `\n\n---\n🎉 **SUKSES TERSIMPAN KE DATABASE TRANSAKSI!**\n\nNomor **${newTrx.noTrx}** (${newTrx.customerName} - Rp ${newTrx.total.toLocaleString('id-ID')}) telah resmi tersimpan.`,
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
          <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            🤖
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
                ? 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-bold'
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
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((m) => {
          const isUser = m.role === 'user';
          const isSpeaking = speakingMessageId === m.id;

          return (
            <div
              key={m.id}
              className={`flex gap-2.5 max-w-[92%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1 shadow-xs ${
                  isUser
                    ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white'
                    : isSpeaking 
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
                }`}
              >
                {isUser ? currentUser?.nama?.charAt(0) || 'U' : '🤖'}
              </div>

              <div className="min-w-0">
                <div
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                    isUser
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-tr-none'
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
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800 not-prose">
                          {!m.draftData.isSaved ? (
                            <button
                              type="button"
                              onClick={() => handleConfirmDraftSave(m.id)}
                              className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <CheckCircle2 size={16} />
                              <span>Konfirmasi Simpan ke Database MyPanca</span>
                            </button>
                          ) : (
                            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 rounded-xl text-emerald-700 dark:text-emerald-300 font-extrabold text-xs flex items-center gap-2 shadow-xs">
                              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Tersimpan di Database MyPanca</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Interactive Buttons for Product Specs */}
                      {(m.content.includes('Apakah Anda mau mengisi') || m.content.includes('spesifikasi produk ini sekarang')) && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex items-center gap-2 not-prose">
                          <button
                            type="button"
                            onClick={() => handleSendMessage("Ya, isi sekarang")}
                            className="py-1.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-95 text-white font-bold text-xs transition flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            <CheckCircle2 size={14} />
                            Ya, Isi Sekarang
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendMessage("Tidak, terima kasih")}
                            className="py-1.5 px-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold text-xs transition flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle size={14} />
                            Tidak
                          </button>
                        </div>
                      )}

                      {/* Interactive Buttons for Transaction Details / Menunggak / Omzet */}
                      {((m.content.includes('Apakah Anda ingin') || m.content.includes('mau melihat')) && (m.content.includes('tampilkan rincian') || m.content.includes('melihat list') || m.content.includes('melihat rincian') || m.content.includes('daftar transaksinya') || m.content.includes('detail transaksinya') || m.content.includes('list transaksinya') || m.content.includes('rincian detail'))) && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex items-center gap-2 not-prose">
                          <button
                            type="button"
                            onClick={() => handleSendMessage("Ya, tampilkan list transaksinya")}
                            className="py-1.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-95 text-white font-bold text-xs transition flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            <CheckCircle2 size={14} />
                            Ya, Tampilkan List Transaksi
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendMessage("Tidak, ringkasan saja cukup")}
                            className="py-1.5 px-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold text-xs transition flex items-center gap-1 cursor-pointer"
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
                        className={`hover:text-violet-600 dark:hover:text-violet-400 transition flex items-center gap-0.5 ${
                          isSpeaking ? 'text-violet-600 font-bold' : ''
                        }`}
                        title={isSpeaking ? "Hentikan Suara" : "Dengarkan Jawaban AI"}
                      >
                        {isSpeaking ? (
                          <>
                            <Square className="w-2.5 h-2.5 fill-violet-600 text-violet-600 animate-pulse" />
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
                        className="hover:text-violet-600 dark:hover:text-violet-400 transition flex items-center gap-0.5"
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
          <div className="flex gap-2.5 mr-auto max-w-[85%]">
            <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
              🤖
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-3 rounded-2xl rounded-tl-none flex items-center gap-1.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce [animation-delay:0.4s]" />
              <span className="text-xs text-slate-400 dark:text-zinc-400 font-medium ml-1">Mencari data sistem...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar if input is empty */}
      {!inputPrompt && !isListening && (
        <div className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200/80 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0">
          <span className="text-[10px] text-slate-400 dark:text-zinc-400 font-extrabold uppercase shrink-0">Cepat:</span>
          {[
            { label: '👤 Tambah Customer Baru', prompt: 'tambah customer baru' },
            { label: '🛍️ Transaksi Baru', prompt: 'tambah transaksi baru' },
            { label: '📋 Penawaran Baru', prompt: 'tambah penawaran baru' },
            { label: '📊 Omzet Bulan Ini', prompt: 'Omzet bulan ini' },
            { label: '📦 Stok Menipis', prompt: 'Stok menipis' }
          ].map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip.prompt)}
              className="px-3 py-1.5 bg-white dark:bg-zinc-900 hover:bg-violet-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:text-violet-700 dark:hover:text-violet-300 border border-slate-200 dark:border-zinc-800 rounded-full text-xs font-bold whitespace-nowrap shadow-xs transition active:scale-95 shrink-0"
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
          <div className="mb-2.5 px-3.5 py-2.5 bg-gradient-to-r from-rose-500 via-purple-600 to-indigo-600 text-white rounded-2xl flex items-center justify-between text-xs shadow-lg animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              <div className="min-w-0">
                <p className="font-extrabold truncate">Mendengarkan suara Anda...</p>
                <p className="text-[10px] text-violet-200 truncate">Silakan bicara sekarang (contoh: "Tambah customer baru")</p>
              </div>
            </div>

            <button
              type="button"
              onClick={stopVoiceInput}
              className="px-3 py-1.5 bg-white text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-extrabold shadow-xs active:scale-95 transition shrink-0"
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
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-300 ring-4 ring-rose-200 animate-pulse'
                : 'bg-violet-100 dark:bg-violet-950/80 hover:bg-violet-200 dark:hover:bg-violet-900 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 shadow-xs'
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
                  : 'bg-slate-100 dark:bg-zinc-950 hover:bg-slate-100/80 focus:bg-white dark:focus:bg-zinc-950 border-slate-200 dark:border-zinc-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40'
              }`}
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputPrompt.trim() || isLoading}
            className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white flex items-center justify-center shadow-md shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-90 shrink-0"
            title="Kirim Pesan"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
