import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, ArrowLeft, Trash2, Copy, Check, Sparkles, 
  Bot, User, Download, Mic, Square, Volume2, VolumeX,
  AlertCircle, Radio, CheckCircle2, XCircle, Search, Plus, Package,
  ChevronUp, ChevronDown, CheckCircle
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabaseService } from '../../../task/services/supabaseService';
import { Task, Project, DrivePost } from '../../../task/types';
import { queryPancaAI, PancaAIContext } from '../../services/pancaAIService';
import { SUPPORTED_GEMINI_MODELS } from '../../services/geminiKeyService';
import { DEFAULT_PANCA_PRODUCTS, getProductImageUrl } from '../../services/pancaProductCatalog';

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
  products?: any[];
  onComplete?: () => void;
}> = ({ content, isNew = false, products = [], onComplete }) => {
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
    <div className="relative overflow-x-auto text-[12px] leading-relaxed">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-[13px] font-black text-slate-900 dark:text-zinc-100 my-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[13px] font-bold text-slate-900 dark:text-zinc-100 my-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[12px] font-bold text-slate-900 dark:text-zinc-100 my-1">{children}</h3>,
          h4: ({ children }) => <h4 className="text-[12px] font-bold text-slate-900 dark:text-zinc-100 my-0.5">{children}</h4>,
          img: ({ src, alt }: { src?: string; alt?: string }) => {
            let imageSrc = src;
            const effectiveCatalog = (products && products.length > 0) ? products : DEFAULT_PANCA_PRODUCTS;
            if (src && src.startsWith('product-image:')) {
              const prodKey = src.replace('product-image:', '').trim().toLowerCase();
              const foundProd = effectiveCatalog.find((p: any) => {
                const pId = (p.id || '').toLowerCase();
                const pCode = (p.kode || '').toLowerCase();
                const pName = (p.nama || p.name || '').toLowerCase();
                return pId === prodKey || pCode === prodKey || pName === prodKey || pName.includes(prodKey) || prodKey.includes(pName);
              });
              if (foundProd) {
                imageSrc = getProductImageUrl(foundProd, effectiveCatalog) || undefined;
              }
            }
            if (!imageSrc || imageSrc.startsWith('product-image:') || imageSrc === 'undefined' || imageSrc === 'null') {
              return null;
            }
            return (
              <div className="my-3 max-w-[280px] sm:max-w-xs rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 shadow-md bg-white dark:bg-zinc-900 group">
                <div className="relative overflow-hidden bg-slate-50 dark:bg-zinc-950 p-2 flex items-center justify-center min-h-[160px]">
                  <img 
                    src={imageSrc} 
                    alt={alt || 'Foto Produk'} 
                    className="w-full max-h-56 object-contain rounded-xl transition-transform duration-300 group-hover:scale-105"
                    loading="lazy" 
                  />
                </div>
                {alt && (
                  <div className="px-3 py-2 text-[11px] font-bold text-slate-800 dark:text-zinc-200 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between">
                    <span className="truncate">{alt}</span>
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded-md">MyPanca</span>
                  </div>
                )}
              </div>
            );
          },
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto rounded-xl bg-slate-100/70 dark:bg-zinc-800/50 p-1 border border-slate-200/80 dark:border-zinc-700/60 shadow-2xs">
              <table className="min-w-full text-[11px] text-left border-collapse">
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
            <th className="px-2.5 py-1.5 font-bold text-slate-800 dark:text-zinc-200 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2 py-1 text-slate-700 dark:text-zinc-300 align-top whitespace-nowrap">
              {children}
            </td>
          ),
          ul: ({ children }) => <ul className="list-disc list-inside my-1.5 space-y-1 text-[12px]">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-1.5 space-y-1 text-[12px]">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed text-[12px]">{children}</li>,
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-[12px]">{children}</p>,
          strong: ({ children }) => <strong className="font-extrabold text-slate-900 dark:text-zinc-100">{children}</strong>,
          code: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-950 dark:text-slate-400 font-mono text-[11px]">
              {children}
            </code>
          )

        }}
      >
        {displayedText}
      </Markdown>
      {isTyping && (
        <span className="inline-block w-2 h-3.5 ml-1 bg-slate-900 animate-pulse rounded-xs align-middle" />
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
  rolePermissions?: { id: string; canView: boolean; canEdit: boolean }[];
  qaQuestions?: any[];
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
  rolePermissions = [],
  qaQuestions = [],
  onBack
}) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('mypanca_mobile_ai_chat');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash-lite');
  const [showModelSelector, setShowModelSelector] = useState(false);
  


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
      .replace(/!\[(.*?)\]\(.*?\)/g, '') // remove markdown images
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\|.*\|/g, '') // remove markdown table lines
      .replace(/---/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/\n/g, ' ')
      .trim();
  };

  const speakText = (text: string, messageId: string) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = cleanMarkdownForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'id-ID';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(messageId);
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
    if (confirm('Bersihkan seluruh percakapan?')) {
      setMessages([]);
      localStorage.removeItem('mypanca_mobile_ai_chat');
    }
  };

  const handleActiveSessionStep = (text: string): { responseText: string; draftData?: DraftData; nextSession?: typeof activeSession } | null => {
    if (!activeSession) return null;
    const { type, step, data } = activeSession;

    if (type === 'customer') {
      if (step === 1) {
        return {
          responseText: `✅ Nama terdata: **${text}**.\n\nSelanjutnya, berapa **Nomor WhatsApp/HP** beliau? (Contoh: 08123456789)`,
          nextSession: { ...activeSession, step: 2, data: { ...data, nama: text, perusahaan: text } }
        };
      }
      if (step === 2) {
        return {
          responseText: `✅ WA terdata: **${text}**.\n\nTerakhir, di **Kota/Wilayah** mana beliau berlokasi?`,
          nextSession: { ...activeSession, step: 3, data: { ...data, whatsapp: text } }
        };
      }
      if (step === 3) {
        const draftPayload: any = { ...data, kota: text };
        return {
          responseText: `### 👤 PRATINJAU DRAFT DATA CUSTOMER BARU\n\nSeluruh informasi telah terkumpul:\n\n| Field CRM | Nilai Terbaca |\n|---|---|\n| **Nama Pelanggan** | **${draftPayload.nama}** |\n| **WhatsApp / HP** | **${draftPayload.whatsapp}** |\n| **Kota / Lokasi** | **${draftPayload.kota}** |\n| **Sales Officer** | **${currentUser?.nama || 'Admin'}** |\n\n⚠️ **Klik tombol di bawah ini** untuk mengonfirmasi dan menyimpan secara permanen ke database MyPanca!`,
          draftData: { type: 'customer', payload: draftPayload, isSaved: false },
          nextSession: null
        };
      }
    }

    if (type === 'transaction' || type === 'penawaran') {
      const isQuote = type === 'penawaran';
      if (step === 1) {
        return {
          responseText: `✅ Pelanggan: **${text}**.\n\nProduk/Barang apa saja yang dipesan? Sebutkan nama produk & kuantiti (misal: "Fumiphos 2 unit, Silogard 1")`,
          nextSession: { ...activeSession, step: 2, data: { ...data, customerName: text } }
        };
      }
      if (step === 2) {
        const subtotal = 1000000; 
        const ppnAmt = data.ppn ? subtotal * 0.11 : 0;
        const grandTotal = subtotal + ppnAmt;
        const draftPayload = { ...data, itemsRaw: text, total: grandTotal, noTrx: (isQuote ? 'QUO-' : 'PP-') + Date.now(), sales: currentUser?.nama || 'Admin' };

        return {
          responseText: `### 📝 PRATINJAU DRAFT ${isQuote ? 'PENAWARAN' : 'TRANSAKSI'}\n\nData telah disiapkan:\n\n| Field | Rincian |\n|---|---|\n| **Pelanggan** | **${data.customerName}** |\n| **Item Pesanan** | ${text} |\n| **Grand Total** | **Rp ${grandTotal.toLocaleString('id-ID')}** |\n| **Penanggung Jawab** | **${draftPayload.sales}** |\n\n⚠️ Periksa kembali data di atas, lalu klik tombol konfirmasi di bawah untuk menyimpan.`,
          draftData: { type, payload: draftPayload, isSaved: false },
          nextSession: null
        };
      }
    }

    return null;
  };

  const handleCommandOrIntent = (text: string): { responseText: string; draftData?: DraftData; nextSession?: typeof activeSession } | null => {
    const lower = text.toLowerCase().trim();
    if (lower.includes('tambah customer')) {
      return {
        responseText: '### 👤 Form CRM Customer Baru\n\nSilakan isi data pelanggan baru pada **Form CRM Interactive** di bawah ini:',
        nextSession: { type: 'customer', step: 1, data: {} }
      };
    }
    if (lower.includes('tambah transaksi') || lower.includes('tambah penawaran')) {
      const isQuote = lower.includes('penawaran');
      return {
        responseText: `### ${isQuote ? '📋 Form CRM Penawaran Harga Baru' : '🛍️ Form CRM Transaksi Penjualan Baru'}\n\nSilakan isi dan periksa rincian transaksi pada **Form CRM Interactive** di bawah ini:`,
        nextSession: { type: isQuote ? 'penawaran' : 'transaction', step: 1, data: { items: [], ppn: false, ongkir: false } }
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
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputPrompt;
    if (!query.trim() || isLoading) return;

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

    if (activeSession) {
      const stepRes = handleActiveSessionStep(query.trim());
      if (stepRes) {
        setActiveSession(stepRes.nextSession || null);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: stepRes.responseText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          draftData: stepRes.draftData,
          isNew: true
        }]);
        return;
      }
    }

    const cmdResult = handleCommandOrIntent(query.trim());
    if (cmdResult) {
      setActiveSession(cmdResult.nextSession || null);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: cmdResult.responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        draftData: cmdResult.draftData,
        isNew: true
      }]);
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
        taskAppData,
        rolePermissions,
        taskAppDataExt: { qaQuestions }
      };

      let responseText = await queryPancaAI({
        userPrompt: query.trim(), 
        messages: historyPayload, 
        ctx: contextPayload,
        preferredModel: selectedModel
      });

      // Auto-detect if user asks about a product, product photo, or if AI recommends/discusses products with images
      const effectiveProds = (products && products.length > 0) ? products : DEFAULT_PANCA_PRODUCTS;
      const lowerQ = query.toLowerCase();
      const asksForPhoto = /foto|gambar|photo|image|lihat|tampilkan|pic|picture/i.test(lowerQ);
      const isGeneralPhotoReq = asksForPhoto && /produk|semua|katalog|ada apa|apa saja/i.test(lowerQ);

      const matchedProducts: any[] = [];
      effectiveProds.forEach(p => {
        const pName = (p.nama || p.name || '').toLowerCase();
        const pCode = (p.kode || p.id || '').toLowerCase();
        const nameTokens = pName.split(/[\s-]+/).filter((t: string) => t.length >= 4);

        // Does user prompt mention this product or its code/tokens?
        const queryMention = (pName && lowerQ.includes(pName)) ||
          (pCode && lowerQ.includes(pCode)) ||
          nameTokens.some((token: string) => lowerQ.includes(token));

        // Does the AI response mention this product?
        const responseMention = (pName && responseText.toLowerCase().includes(pName)) ||
          (pCode && responseText.toLowerCase().includes(pCode)) ||
          (nameTokens.length > 0 && nameTokens.every((token: string) => responseText.toLowerCase().includes(token)));

        const hasImg = Boolean(getProductImageUrl(p, effectiveProds));

        if (hasImg) {
          if (queryMention || responseMention || isGeneralPhotoReq) {
            matchedProducts.push(p);
          }
        }
      });

      if (matchedProducts.length > 0) {
        // Unique products, up to 3 to keep chat clean and fast
        const uniqueProds = Array.from(new Set(matchedProducts)).slice(0, 3);
        uniqueProds.forEach(p => {
          const alreadyHasImg = responseText.includes(p.id) || responseText.includes(p.kode) || (p.nama && responseText.includes(`![Foto ${p.nama}]`));
          if (!alreadyHasImg) {
            responseText += `\n\n![Foto ${p.nama || p.name}](product-image:${p.id || p.kode})`;
          }
        });
      }
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isNew: true
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (autoSpeak) speakText(responseText, assistantMessage.id);
    } catch (e) {
      console.error("Panca AI Chat Error:", e);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Maaf, terjadi kendala saat memproses pertanyaan Anda.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-white dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans relative overflow-hidden">
      {/* Top Header */}
      <div className="bg-white dark:bg-zinc-900 px-4 py-3 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between shadow-2xs shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <button onClick={() => { stopSpeaking(); stopVoiceInput(); onBack(); }} className="w-8 h-8 rounded-full bg-slate-50 dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700 flex items-center justify-center text-slate-600 dark:text-zinc-300 transition active:scale-95"><ArrowLeft className="w-4 h-4" /></button>
          <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-extrabold text-xs shadow-xs">P</div>
          <div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 leading-tight">Panca AI Chat</h3>
            <div className="relative mt-0.5">
              <button onClick={() => setShowModelSelector(!showModelSelector)} className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer">
                <span>Model: {SUPPORTED_GEMINI_MODELS.find(m => m.id === selectedModel)?.label || '3.5 Flash Lite'}</span>
                <ChevronDown size={10} className={`transition-transform duration-200 ${showModelSelector ? 'rotate-180' : ''}`} />
              </button>
              {showModelSelector && (
                <div className="absolute left-0 top-full mt-2 w-48 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 py-1.5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  {SUPPORTED_GEMINI_MODELS.map(m => (
                    <button key={m.id} onClick={() => { setSelectedModel(m.id); setShowModelSelector(false); }} className={`w-full text-left px-3 py-2 text-[10px] font-bold flex items-center justify-between transition-colors ${selectedModel === m.id ? 'bg-slate-900 text-white' : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>
                      <span>{m.label}</span>
                      {selectedModel === m.id && <CheckCircle size={10} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1">
          {/* Tombol Mute */}
          <button onClick={() => { const next = !autoSpeak; setAutoSpeak(next); if (!next) stopSpeaking(); }} className={`p-2 rounded-xl transition active:scale-95 ${autoSpeak ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}>{autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
          
          {/* Tombol Clear */}
          <button onClick={clearChat} className="p-2 text-slate-400 hover:text-rose-500 transition active:scale-95"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 flex flex-col bg-white dark:bg-zinc-950">
        {messages.length === 0 ? (
          <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center text-center p-6 my-auto select-none">
            <div className="w-32 h-32 mb-3 relative flex items-center justify-center">
              <img 
                src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2JyeWZkamY3eTNlZWcwajRhczU0ajgxeW5jeGU0YmpibnJ4bmh1eiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/1qzirb6B4KXOHbJpd3/giphy.gif" 
                alt="Panca AI Robot" 
                className="w-full h-full object-contain"
              />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-zinc-100 max-w-xs leading-relaxed">
              Selamat datang di Panca AI Assistant, silahkan sampaikan apa saja yang kamu butuhkan
            </h3>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div key={m.id} className={isUser ? "max-w-[85%] ml-auto text-right" : "w-full text-left py-1"}>
                {isUser ? (
                  <div className="inline-block p-3 rounded-2xl rounded-tr-none bg-slate-900 text-white font-medium text-left shadow-2xs text-[12px] leading-relaxed">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ) : (
                  <div className="w-full text-left text-slate-800 dark:text-zinc-100 leading-relaxed text-[12px]">
                    <TypewriterText 
                      content={m.content} 
                      isNew={m.isNew} 
                      products={products}
                      onComplete={() => { 
                        if (m.isNew) setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, isNew: false } : msg));
                      }} 
                    />
                    {m.draftData && !m.draftData.isSaved && (
                      <button 
                        onClick={() => handleConfirmDraftSave(m.id)} 
                        className="w-full max-w-sm mt-3 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xs active:scale-98 transition flex items-center justify-center gap-2"
                      >
                        <CheckCircle size={14} className="text-emerald-400" />
                        <span>Konfirmasi Simpan ke Database</span>
                      </button>
                    )}
                  </div>
                )}
                
                <div className={`flex items-center gap-2.5 mt-1.5 px-0.5 text-[10px] text-slate-400 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <span>{m.timestamp}</span>
                  {!isUser && (
                    <>
                      <button onClick={() => speakText(m.content, m.id)} className={`flex items-center gap-1 hover:text-slate-800 dark:hover:text-zinc-200 transition ${speakingMessageId === m.id ? 'text-slate-900 font-bold' : ''}`}>
                        {speakingMessageId === m.id ? <Square size={11} className="fill-current animate-pulse text-rose-500" /> : <Volume2 size={11} />}
                        <span>Dengar</span>
                      </button>
                      <button onClick={() => copyToClipboard(m.content, m.id)} className="flex items-center gap-1 hover:text-slate-800 dark:hover:text-zinc-200 transition">
                        {copiedId === m.id ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                        <span>Salin</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        {isLoading && (
          <div className="bg-white border border-slate-200 p-2.5 rounded-xl w-fit flex items-center gap-1.5 shadow-2xs animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce delay-75" />
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce delay-150" />
          </div>
        )}
        {activeSession && (
          <div className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-3xl p-4 shadow-xl space-y-3 animate-in slide-in-from-bottom-3 duration-300 my-2">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="text-xs font-black uppercase">Form {activeSession.type === 'penawaran' ? 'Penawaran' : activeSession.type === 'transaction' ? 'Transaksi Penjualan' : 'Customer'} Baru</h4>
              <button onClick={() => setActiveSession(null)} className="text-slate-400 hover:text-rose-500"><XCircle size={18} /></button>
            </div>
            
            {activeSession.type === 'customer' && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 mb-1 block">Nama Pelanggan / Perusahaan</label>
                  <input type="text" value={activeSession.data.nama || ''} onChange={(e) => updateActiveData('nama', e.target.value)} placeholder="Contoh: PT Sumber Rejeki" className="w-full p-2 bg-slate-50 dark:bg-zinc-800 border rounded-xl text-xs" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 mb-1 block">Nomor WhatsApp / HP</label>
                  <input type="text" value={activeSession.data.whatsapp || ''} onChange={(e) => updateActiveData('whatsapp', e.target.value)} placeholder="Contoh: 08123456789" className="w-full p-2 bg-slate-50 dark:bg-zinc-800 border rounded-xl text-xs" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 mb-1 block">Kota / Wilayah</label>
                  <input type="text" value={activeSession.data.kota || ''} onChange={(e) => updateActiveData('kota', e.target.value)} placeholder="Contoh: Surabaya" className="w-full p-2 bg-slate-50 dark:bg-zinc-800 border rounded-xl text-xs" />
                </div>
                <button onClick={handleDirectSaveFromForm} className="w-full py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-lg mt-2">Simpan Customer Baru</button>
              </div>
            )}

            {(activeSession.type === 'transaction' || activeSession.type === 'penawaran') && (
              <div className="space-y-3">
                {/* 1. Search Box Nama Customer */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 mb-1 block">1. Cari / Pilih Nama Customer</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                      <Search size={12} />
                    </div>
                    <input 
                      type="text" 
                      value={wizardCustSearch !== undefined ? wizardCustSearch : (activeSession.data.customerName || '')} 
                      onChange={(e) => {
                        setWizardCustSearch(e.target.value);
                        updateActiveData('customerName', e.target.value);
                      }} 
                      placeholder="Ketik nama customer..." 
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-zinc-800 border rounded-xl text-xs" 
                    />
                  </div>
                  {wizardCustSearch && (
                    <div className="mt-1 max-h-32 overflow-y-auto bg-white dark:bg-zinc-800 border rounded-xl shadow-md divide-y text-[10px]">
                      {customers.filter(c => (c.nama || '').toLowerCase().includes(wizardCustSearch.toLowerCase())).slice(0, 5).map(c => (
                        <div key={c.id} onClick={() => { updateActiveData('customerName', c.nama); setWizardCustSearch(''); }} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-700 cursor-pointer font-bold">
                          {c.nama} ({c.kota || 'Kota -'})
                        </div>
                      ))}
                    </div>
                  )}
                  {activeSession.data.customerName && !wizardCustSearch && (
                    <div className="text-[10px] text-emerald-600 font-bold mt-1">Customer terpilih: {activeSession.data.customerName}</div>
                  )}
                </div>

                {/* 2. Search Box Produk */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 mb-1 block">2. Cari & Tambah Produk</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                      <Package size={12} />
                    </div>
                    <input 
                      type="text" 
                      value={wizardProdSearch} 
                      onChange={(e) => setWizardProdSearch(e.target.value)} 
                      placeholder="Cari nama produk / SKU..." 
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-zinc-800 border rounded-xl text-xs" 
                    />
                  </div>
                  {wizardProdSearch && (
                    <div className="mt-1 max-h-36 overflow-y-auto bg-white dark:bg-zinc-800 border rounded-xl shadow-md divide-y text-[10px]">
                      {products.filter(p => (p.nama || '').toLowerCase().includes(wizardProdSearch.toLowerCase()) || (p.kode || '').toLowerCase().includes(wizardProdSearch.toLowerCase())).slice(0, 6).map(p => (
                        <div key={p.id} onClick={() => {
                          const existingItems = activeSession.data.items || [];
                          const foundIndex = existingItems.findIndex((it: any) => it.produkId === p.id);
                          let newItems = [...existingItems];
                          if (foundIndex >= 0) {
                            newItems[foundIndex].qty += 1;
                          } else {
                            newItems.push({
                              produkId: p.id,
                              kode: p.kode || 'SKU',
                              nama: p.nama,
                              harga: p.hargaJual || p.harga || 100000,
                              qty: 1,
                              diskon: 0
                            });
                          }
                          updateActiveData('items', newItems);
                          setWizardProdSearch('');
                        }} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-700 cursor-pointer flex justify-between items-center">
                          <span className="font-bold">{p.nama} ({p.kode})</span>
                          <span className="text-emerald-600 font-extrabold">Rp {(p.hargaJual || p.harga || 100000).toLocaleString('id-ID')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Items List */}
                {activeSession.data.items && activeSession.data.items.length > 0 && (
                  <div className="space-y-1.5 border-t pt-2">
                    <span className="text-[10px] font-bold text-slate-500">Daftar Item ({activeSession.data.items.length})</span>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {activeSession.data.items.map((it: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl text-[10px]">
                          <div>
                            <div className="font-bold">{it.nama}</div>
                            <div className="text-slate-400">Rp {it.harga.toLocaleString('id-ID')} x {it.qty}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => {
                              const items = [...activeSession.data.items];
                              if (items[idx].qty > 1) items[idx].qty -= 1;
                              else items.splice(idx, 1);
                              updateActiveData('items', items);
                            }} className="w-5 h-5 bg-slate-200 dark:bg-zinc-700 rounded-md font-bold flex items-center justify-center">-</button>
                            <span className="font-bold w-4 text-center">{it.qty}</span>
                            <button type="button" onClick={() => {
                              const items = [...activeSession.data.items];
                              items[idx].qty += 1;
                              updateActiveData('items', items);
                            }} className="w-5 h-5 bg-slate-200 dark:bg-zinc-700 rounded-md font-bold flex items-center justify-center">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Toggles PPN & Ongkir */}
                <div className="flex items-center gap-4 pt-1 text-[10px]">
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold">
                    <input type="checkbox" checked={Boolean(activeSession.data.ppn)} onChange={(e) => updateActiveData('ppn', e.target.checked)} className="rounded" />
                    <span>PPN 11%</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold">
                    <input type="checkbox" checked={Boolean(activeSession.data.ongkir)} onChange={(e) => updateActiveData('ongkir', e.target.checked)} className="rounded" />
                    <span>Ongkir</span>
                  </label>
                </div>

                {activeSession.type === 'transaction' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">Status Pembayaran</label>
                    <select value={activeSession.data.paymentStatus || 'Belum Lunas'} onChange={(e) => updateActiveData('paymentStatus', e.target.value)} className="w-full p-2 bg-slate-50 dark:bg-zinc-800 border rounded-xl text-xs font-bold">
                      <option value="Belum Lunas">Belum Lunas (Piutang)</option>
                      <option value="Lunas">Lunas</option>
                      <option value="DP">DP (Sebagian)</option>
                    </select>
                  </div>
                )}

                <button onClick={handleDirectSaveFromForm} className="w-full py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-lg mt-2">
                  Simpan {activeSession.type === 'penawaran' ? 'Penawaran' : 'Transaksi'} Sekarang
                </button>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!inputPrompt && !isListening && (
        <div className="px-3 py-1.5 bg-white dark:bg-zinc-950 flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0 border-t border-slate-100 dark:border-zinc-900">
          {[
            { label: 'Tambah Customer', prompt: 'tambah customer baru' },
            { label: 'Transaksi Baru', prompt: 'tambah transaksi baru' },
            { label: 'Tambah Penawaran', prompt: 'tambah penawaran baru' },
            { label: 'Stok Menipis', prompt: 'Stok menipis' }
          ].map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip.prompt)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-full text-[10px] font-bold text-slate-700 dark:text-zinc-300 whitespace-nowrap shadow-2xs active:scale-95 transition-transform"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 px-4 py-3 border-t border-slate-100 dark:border-zinc-800 shrink-0 z-20">
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="relative flex items-center">
          <div className="w-full bg-slate-50 dark:bg-zinc-800/80 rounded-full py-1.5 pl-3 pr-1.5 flex items-center justify-between border border-slate-200/90 dark:border-zinc-700 shadow-2xs">
            <div className="flex items-center gap-2.5 flex-1 mr-2 min-w-0">
              <button
                type="button"
                onClick={isListening ? stopVoiceInput : startVoiceInput}
                title={isListening ? "Mendengarkan..." : "Input Suara (Mic)"}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90 shrink-0 ${
                  isListening
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200'
                }`}
              >
                {isListening ? <Square className="w-3.5 h-3.5 fill-white" /> : <Mic className="w-4 h-4" />}
              </button>
              <input
                ref={inputRef}
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={isListening ? "Mendengarkan..." : "Ketik pesan atau perintah..."}
                className="w-full bg-transparent text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!inputPrompt.trim() || isLoading}
              className="w-8 h-8 rounded-full bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900 flex items-center justify-center transition active:scale-95 shrink-0 shadow-xs disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
