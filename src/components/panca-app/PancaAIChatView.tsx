import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, ArrowLeft, Trash2, Copy, Check, Sparkles, 
  Bot, User, Download, Mic, Square, Volume2, VolumeX,
  AlertCircle, Radio, CheckCircle2, XCircle, Search, Plus, Package,
  ChevronUp, ChevronDown, CheckCircle, MessageSquare, Zap
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabaseService } from '../../../task/services/supabaseService';
import { supabase } from '../../lib/supabase';
import { Task, Project, DrivePost } from '../../../task/types';
import { queryPancaAI, PancaAIContext, generateSmartDynamicFallback } from '../../services/pancaAIService';
import { SUPPORTED_GEMINI_MODELS } from '../../services/geminiKeyService';
import { DEFAULT_PANCA_PRODUCTS, getProductImageUrl, extractProductPhoto, hasDatabaseProductImage } from '../../services/pancaProductCatalog';
import { safeSetLocalStorage, getApiUrl } from '../../lib/apiUtils';
import TaskModal from '../../../task/components/TaskModal';
import DayTaskPicker from '../../../task/components/DayTaskPicker';

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
  tokenUsage?: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  };
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
      // If currLength is slicing inside an unclosed markdown image tag, advance past it
      const partial = content.slice(0, currLength);
      const lastExcl = partial.lastIndexOf('![');
      if (lastExcl !== -1) {
        const afterExcl = partial.slice(lastExcl);
        if (!afterExcl.includes(')')) {
          const closeParen = content.indexOf(')', lastExcl);
          if (closeParen !== -1) {
            currLength = closeParen + 1;
          }
        }
      }

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
            const combinedCatalog = [...(products || []), ...DEFAULT_PANCA_PRODUCTS];
            let matchedProduct: any = null;
            if (src && src.startsWith('product-image:')) {
              const rawKey = src.replace('product-image:', '').trim();
              const key = rawKey.toLowerCase();
              matchedProduct = (products || []).find((p: any) => {
                if (!p) return false;
                const pId = String(p.id || '').trim().toLowerCase();
                const pCode = String(p.kode || '').trim().toLowerCase();
                const pName = String(p.nama || p.name || '').trim().toLowerCase();
                return pId === key || pCode === key || pName === key || (pName && key && (pName.includes(key) || key.includes(pName)));
              });
              imageSrc = getProductImageUrl(src, combinedCatalog) || undefined;
            }
            if (!imageSrc || imageSrc.startsWith('product-image:') || imageSrc === 'undefined' || imageSrc === 'null') {
              return null;
            }

            const isDbPhoto = Boolean(matchedProduct && extractProductPhoto(matchedProduct));

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
                    <span className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md ${
                      isDbPhoto 
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800' 
                        : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60'
                    }`}>
                      {isDbPhoto ? 'Foto Database' : 'Katalog MyPanca'}
                    </span>
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
  appUsers?: any[];
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
  appUsers = [],
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
  const isSuperAdmin = !currentUser || 
    currentUser?.role?.toLowerCase()?.includes('admin') || 
    currentUser?.username?.toLowerCase() === 'superadmin' || 
    currentUser?.nama?.toLowerCase() === 'superadmin';

  // Task Input & Update Modal States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<Task | null>(null);
  const [selectedLogIndex, setSelectedLogIndex] = useState<number>(-1);
  const [isDayPickerOpen, setIsDayPickerOpen] = useState(false);

  // Live Database Products: combines props, LocalStorage, and direct Supabase database fetch
  const [effectiveProducts, setEffectiveProducts] = useState<any[]>(() => {
    if (products && products.length > 0) return products;
    try {
      const saved = localStorage.getItem('mypanca_db_prod');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  // Keep synchronized if parent products update
  useEffect(() => {
    if (products && products.length > 0) {
      setEffectiveProducts(products);
    }
  }, [products]);

  // Read latest products and photos directly from Supabase database on mount
  useEffect(() => {
    let isMounted = true;
    const loadDatabaseProducts = async () => {
      try {
        const { data: dbProds, error } = await supabase.from('products').select('*');
        if (!error && dbProds && dbProds.length > 0 && isMounted) {
          setEffectiveProducts(prev => {
            const map = new Map<string, any>();
            (prev || []).forEach(p => map.set(p.id, p));
            dbProds.forEach((p: any) => map.set(p.id, { ...map.get(p.id), ...p }));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn('[PancaAIChatView] Direct database product load notice:', err);
      }
    };
    loadDatabaseProducts();
    return () => { isMounted = false; };
  }, []);

  const salesOptions = Array.from(new Set([
    currentUser?.nama,
    ...(employees || []).map((e: any) => e.nama || e.username).filter(Boolean),
    'maria', 'yadi', 'superadmin', 'angel1', 'dwi1'
  ])).filter(Boolean);

  // Active Session for guided multi-step form wizard (Customer, Transaksi, Penawaran, Task, Follow-up)
  const [activeSession, setActiveSession] = useState<{
    type: 'customer' | 'transaction' | 'penawaran' | 'task_new' | 'task_update' | 'followup';
    step: number;
    data: Record<string, any>;
  } | null>(null);

  // Search box states for interactive form wizards
  const [wizardCustSearch, setWizardCustSearch] = useState('');
  const [wizardProdSearch, setWizardProdSearch] = useState('');
  const [wizardQuotationSearch, setWizardQuotationSearch] = useState('');
  const [wizardProdQty, setWizardProdQty] = useState(1);

  // Helper to update active form state dynamically
  const updateActiveData = (field: string, val: any) => {
    setActiveSession(prev => prev ? {
      ...prev,
      data: { ...prev.data, [field]: val }
    } : null);
  };

  // Helper to directly save CRM & Task form input to state & Supabase
  const handleDirectSaveFromForm = async () => {
    if (!activeSession) return;
    const { type, data } = activeSession;
    const isQuote = type === 'penawaran';
    const activeCompanyId = activeCompany?.id || '1';

    if (type === 'task_new') {
      const title = data.title?.trim() || 'Pekerjaan Baru';
      const companyName = data.companyName?.trim() || 'PT. Panca Prima Wijaya';
      const priority = data.priority || 'Medium';
      const status = data.status || 'Belum Mulai';
      const progress = Number(data.progress || 0);
      const description = data.description?.trim() || 'Pekerjaan baru dibuat.';
      const nowIso = new Date().toISOString();

      const newTask: Task = {
        id: `task_${Date.now()}`,
        title,
        companyName,
        priority,
        status,
        progress,
        jobType: 'Umum',
        category: 'Pengembangan',
        startDate: nowIso,
        endDate: nowIso,
        employeeName: currentUser?.nama || 'Superadmin',
        owner: currentUser?.username || 'superadmin',
        collaborators: [],
        pendingCollaborators: [],
        logs: [{
          status,
          progress,
          date: nowIso,
          description
        }]
      };

      try {
        const owner = currentUser?.username || 'superadmin';
        await supabaseService.saveTask(newTask, owner);
        
        setTaskAppData(prev => {
          const updated = [newTask, ...prev.tasks];
          try { localStorage.setItem('mypanca_cached_tasks', JSON.stringify(updated)); } catch {}
          return { ...prev, tasks: updated };
        });

        playTone(880, 0.2);

        const successMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `### 📝 TUGAS BARU BERHASIL DISIMPAN KE DATABASE!\n\n| Field Tugas | Data Terdaftar |\n|---|---|\n| **Judul Pekerjaan** | **${newTask.title}** |\n| **Perusahaan / Klien** | **${newTask.companyName}** |\n| **Prioritas** | **${newTask.priority}** |\n| **Status Pengerjaan** | **${newTask.status}** |\n| **Progres Capaian** | **${newTask.progress}%** |\n| **Penanggung Jawab** | **${newTask.employeeName}** |\n| **Catatan Log Awal** | ${description} |\n\nData tugas telah tersimpan resmi ke Supabase & Task Tracker MyPanca! 🚀`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, successMsg]);
      } catch (err) {
        console.error("Gagal menyimpan task_new:", err);
        alert("Gagal menyimpan tugas baru ke database. Silakan coba kembali.");
      }
      setActiveSession(null);
      return;
    }

    if (type === 'task_update') {
      const selectedTask = data.selectedTask;
      if (!selectedTask) {
        alert("Silakan pilih tugas yang ingin dilanjutkan terlebih dahulu.");
        return;
      }

      const priority = data.priority || selectedTask.priority || 'Medium';
      const status = data.status || selectedTask.status || 'Proses';
      const progress = Number(data.progress !== undefined ? data.progress : selectedTask.progress || 85);
      const description = data.description?.trim() || `Dilanjutkan pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      const nowIso = new Date().toISOString();

      const newLog = {
        status,
        progress,
        date: nowIso,
        description
      };

      const updatedLogs = [...(selectedTask.logs || []), newLog];

      const updatedTask: Task = {
        ...selectedTask,
        priority,
        status,
        progress,
        logs: updatedLogs
      };

      try {
        const owner = currentUser?.username || 'superadmin';
        await supabaseService.saveTask(updatedTask, owner);

        setTaskAppData(prev => {
          const idx = prev.tasks.findIndex(t => t.id === updatedTask.id);
          let updatedList = [...prev.tasks];
          if (idx >= 0) updatedList[idx] = updatedTask;
          else updatedList.unshift(updatedTask);
          try { localStorage.setItem('mypanca_cached_tasks', JSON.stringify(updatedList)); } catch {}
          return { ...prev, tasks: updatedList };
        });

        playTone(880, 0.2);

        const successMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `### 🔄 UPDATE LAPORAN TERKINI BERHASIL DISIMPAN!\n\n| Field Tugas | Detail Perubahan |\n|---|---|\n| **Judul Pekerjaan** | **${updatedTask.title}** |\n| **Perusahaan / Klien** | **${updatedTask.companyName}** |\n| **Prioritas** | **${updatedTask.priority}** |\n| **Status Pengerjaan** | **${updatedTask.status}** |\n| **Progres Capaian** | **${updatedTask.progress}%** |\n| **Deskripsi / Catatan** | ${description} |\n\nLog perubahan pekerjaan telah berhasil diperbarui dan tersimpan permanen di Supabase! 🚀`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, successMsg]);
      } catch (err) {
        console.error("Gagal update task:", err);
        alert("Gagal memperbarui tugas ke database. Silakan coba kembali.");
      }
      setActiveSession(null);
      return;
    }

    if (type === 'followup') {
      const selectedQuotation = data.selectedQuotation;
      if (!selectedQuotation) {
        alert("Silakan pilih penawaran yang ingin di-followup terlebih dahulu.");
        return;
      }

      const followUpDate = data.followUpDate || new Date().toISOString().split('T')[0];
      const followUpMethod = data.followUpMethod || 'WhatsApp';
      const keterangan = data.keterangan?.trim() || 'Follow-up penawaran';
      const salesName = currentUser?.nama || selectedQuotation.sales || 'Sales';

      const newFollowUpItem = {
        tanggal: followUpDate,
        method: followUpMethod,
        keterangan: keterangan,
        sales: salesName,
        createdAt: new Date().toISOString()
      };

      const existingFollowUps = Array.isArray(selectedQuotation.followUps) ? selectedQuotation.followUps : [];
      const updatedFollowUps = [newFollowUpItem, ...existingFollowUps];

      const updatedQuotation = {
        ...selectedQuotation,
        followedUp: true,
        followedUpDate: followUpDate,
        followUpDate: followUpDate,
        followUpMethod: followUpMethod,
        latestFollowUp: `${followUpDate} - ${followUpMethod}: ${keterangan}`,
        followUps: updatedFollowUps
      };

      try {
        if (setTransactions) {
          setTransactions(prev => prev.map(t => (t.id === selectedQuotation.id || t.noTrx === selectedQuotation.noTrx) ? updatedQuotation : t));
        }
        if (syncToSupabase) {
          syncToSupabase('transactions', updatedQuotation);
        }

        playTone(880, 0.2);

        const successMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `### 📞 FOLLOW-UP PENAWARAN BERHASIL DISIMPAN!\n\n| Detail Follow-up | Data Terdaftar |\n|---|---|\n| **No. Penawaran** | **${selectedQuotation.noTrx || selectedQuotation.id}** |\n| **Pelanggan** | **${selectedQuotation.customerName || selectedQuotation.customer || selectedQuotation.perusahaan || '-'}** |\n| **Tanggal Follow-up** | **${followUpDate}** |\n| **Metode Follow-up** | **${followUpMethod}** |\n| **Sales Officer** | **${salesName}** |\n| **Hasil / Keterangan** | ${keterangan} |\n\nData follow-up telah berhasil diperbarui dan tersimpan permanen di **Latest Follow-up** & **Roadmap Follow-up** Supabase! 🚀`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, successMsg]);
      } catch (err) {
        console.error("Gagal menyimpan follow-up:", err);
        alert("Gagal menyimpan data follow-up ke database. Silakan coba kembali.");
      }
      setActiveSession(null);
      return;
    }

    if (type === 'customer') {
      const name = data.nama?.trim() || data.perusahaan?.trim() || 'Customer Baru';
      const phoneCode = data.phoneCode || '+62';
      const rawWa = data.whatsapp?.trim() || '8123456789';
      const wa = rawWa.startsWith('+') ? rawWa : `${phoneCode} ${rawWa}`;
      const city = data.kota?.trim() || 'Surabaya';
      const salesName = data.sales || currentUser?.nama || 'maria';

      const newCust = {
        id: 'CUST-' + Date.now(),
        nama: name,
        perusahaan: data.perusahaan || name,
        jenisKontak: data.jenisKontak || 'Perusahaan',
        whatsapp: wa,
        phone: wa,
        email: data.email || '',
        negara: data.negara || 'Indonesia',
        alamat: data.alamat || '',
        kota: city,
        sales: salesName,
        leadType: data.leadType || 'Belum Transaksi',
        source: data.source || 'Organic',
        npwp: data.npwp || '',
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
        content: `### ✅ DATA CUSTOMER BERHASIL DISIMPAN KE DATABASE MYPANCA!\n\n| Field Customer | Data Tersimpan |\n|---|---|\n| **Nama / Perusahaan** | **${newCust.nama}** |\n| **Jenis Kontak** | **${newCust.jenisKontak}** |\n| **WhatsApp / Telp** | **${newCust.whatsapp}** |\n| **Email** | **${newCust.email || '-'}** |\n| **Negara & Alamat** | **${newCust.negara}** (${newCust.alamat || '-'}) |\n| **Sales Representative** | **${newCust.sales}** |\n| **Status Lead Type** | **${newCust.leadType}** |\n| **Source / Sumber** | **${newCust.source}** |\n| **NPWP** | **${newCust.npwp || '-'}** |\n\nData pelanggan telah tersimpan di database MyPanca dan dapat langsung digunakan! 🎉`,
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

    // Status mapping:
    // If quote: status is 'Penawaran'
    // If transaction: status is taken from data.status dropdown ('Invoice', 'Pembayaran', 'Pengiriman', 'Pesanan Selesai', 'Batal')
    let rawStatus = isQuote ? 'Penawaran' : (data.status || 'Invoice');
    let mappedStatus = rawStatus;
    if (rawStatus === 'Pesanan Selesai') mappedStatus = 'Selesai';
    if (rawStatus === 'Pembayaran') mappedStatus = 'Payment';

    const payStatus = isQuote ? 'Penawaran' : (data.paymentStatus || 'Belum Lunas');
    const dpAmt = payStatus === 'Lunas' ? grandTotal : (Number(data.dpAmt) || 0);
    const sisaPay = Math.max(0, grandTotal - dpAmt);
    const dateVal = data.tanggal || new Date().toISOString().split('T')[0];

    const newTrx = {
      id: docNo,
      noTrx: docNo,
      customerName: data.customerName || 'Pelanggan Umum',
      tanggal: dateVal,
      total: grandTotal,
      nilaiProyek: grandTotal,
      items: items,
      ppn: Boolean(data.ppn),
      ongkir: Boolean(data.ongkir),
      biayaOngkir: ongkirAmt,
      jasaKirim: data.jasaKirim || 'JNE Regular',
      status: mappedStatus,
      rawStatusText: rawStatus,
      paymentStatus: payStatus,
      pembayaranDiterima: dpAmt,
      sisaPembayaran: sisaPay,
      sales: data.sales || currentUser?.nama || 'General Sales',
      keterangan: data.keterangan || 'Input via Panca AI Assistant',
      followUpDate: data.followUpDate || '',
      followUpMethod: data.followUpMethod || '',
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
      content: `### 🎉 ${isQuote ? 'PENAWARAN HARGA' : 'TRANSAKSI PENJUALAN'} BERHASIL DISIMPAN KE DATABASE MYPANCA!\n\n| Detail Dokumen | Data Terdaftar |\n|---|---|\n| **No. Dokumen** | **${docNo}** (Resmi) |\n| **Pelanggan** | **${newTrx.customerName}** |\n| **Tanggal** | **${newTrx.tanggal}** |\n| **Status Transaksi** | **${rawStatus}** (Langsung masuk tab ${rawStatus}) |\n| **Status Pembayaran** | **${payStatus}** |\n| **Jasa Kirim** | **${newTrx.jasaKirim}** |\n| **Subtotal Produk** | **Rp ${subtotal.toLocaleString('id-ID')}** |\n| **PPN 11%** | **${data.ppn ? `Rp ${ppnAmt.toLocaleString('id-ID')}` : 'Tidak PPN'}** |\n| **Biaya Kirim** | **Rp ${ongkirAmt.toLocaleString('id-ID')}** |\n| **GRAND TOTAL** | **Rp ${grandTotal.toLocaleString('id-ID')}** |\n| **Sales Responsible** | **${newTrx.sales}** |\n${data.followUpDate ? `| **Follow-up Scheduled** | **${data.followUpDate}** (${data.followUpMethod || 'WhatsApp'}) |\n` : ''}\n**Rincian Barang:**\n${itemsTable}\n\nDokumen transaksi telah resmi terdata dan langsung masuk ke status **${rawStatus}** di CRM MyPanca & Supabase! 🚀`,
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

  // Task App data state for SuperAdmin & AI
  const [taskAppData, setTaskAppData] = useState<{
    tasks: Task[];
    projects: Project[];
    drivePosts: DrivePost[];
  }>(() => {
    let initialTasks: Task[] = [];
    try {
      const cached = localStorage.getItem('mypanca_cached_tasks');
      if (cached) initialTasks = JSON.parse(cached);
    } catch {}
    return { tasks: initialTasks, projects: [], drivePosts: [] };
  });

  useEffect(() => {
    let isMounted = true;
    const loadTaskAppData = async () => {
      try {
        const userObj = {
          username: currentUser?.username || 'superadmin',
          role: currentUser?.role || (isSuperAdmin ? 'superadmin' : 'user')
        };
        // Request full tracking view (true) so the AI has access to all team tasks and timelines
        const [tasksList, projectsList, postsList] = await Promise.all([
          supabaseService.getTasks(userObj, true),
          supabaseService.getProjects(),
          supabaseService.getDrivePosts()
        ]);
        if (isMounted) {
          setTaskAppData(prev => ({
            tasks: (tasksList && tasksList.length > 0) ? tasksList : prev.tasks,
            projects: projectsList || [],
            drivePosts: postsList || []
          }));
        }
      } catch (e) {
        console.warn("Failed loading task app data for Mobile AI:", e);
      }
    };
    loadTaskAppData();
    return () => { isMounted = false; };
  }, [isSuperAdmin, currentUser]);

  // Filter tasks visible to current user for updating tasks (always user's own tasks for Lanjutkan Task)
  const userVisibleTasks = React.useMemo(() => {
    const currentName = (currentUser?.nama || '').toLowerCase();
    const currentUsername = (currentUser?.username || '').toLowerCase();
    return taskAppData.tasks.filter(t => {
      const emp = (t.employeeName || '').toLowerCase();
      const owner = ((t as any).owner_username || (t as any).owner || '').toLowerCase();
      const isCollab = Array.isArray(t.collaborators) && t.collaborators.some(c => String(c).toLowerCase() === currentUsername || String(c).toLowerCase() === currentName);
      return emp === currentName || emp === currentUsername || owner === currentUsername || owner === currentName || isCollab;
    });
  }, [taskAppData.tasks, currentUser]);

  const handleOpenNewTaskModal = () => {
    setWizardCustSearch('');
    setActiveSession({
      type: 'task_new',
      step: 1,
      data: {
        title: '',
        companyName: 'Panca Prima Wijaya',
        priority: 'Medium',
        status: 'Belum Mulai',
        progress: 0,
        description: ''
      }
    });
  };

  const handleOpenUpdateTaskPicker = () => {
    setWizardCustSearch('');
    setActiveSession({
      type: 'task_update',
      step: 1,
      data: {
        selectedTask: null,
        priority: 'Medium',
        status: 'Proses',
        progress: 85,
        description: ''
      }
    });
  };

  const handleSelectTaskFromPicker = (task: Task) => {
    const latestLogIdx = task.logs && task.logs.length > 0 ? task.logs.length - 1 : -1;
    setSelectedTaskForEdit(task);
    setSelectedLogIndex(latestLogIdx >= 0 ? latestLogIdx : 0);
    setIsDayPickerOpen(false);
    setIsTaskModalOpen(true);
  };

  const handleSaveTaskFromModal = async (savedTask: Task) => {
    try {
      const owner = currentUser?.username || 'superadmin';
      await supabaseService.saveTask(savedTask, owner);
      
      // Update local taskAppData immediately
      setTaskAppData(prev => {
        const existingIdx = prev.tasks.findIndex(t => t.id === savedTask.id);
        let updatedTasksList = [...prev.tasks];
        if (existingIdx >= 0) {
          updatedTasksList[existingIdx] = savedTask;
        } else {
          updatedTasksList.unshift(savedTask);
        }
        try {
          localStorage.setItem('mypanca_cached_tasks', JSON.stringify(updatedTasksList));
        } catch {}
        return { ...prev, tasks: updatedTasksList };
      });

      const isUpdate = Boolean(selectedTaskForEdit);
      const latestLog = savedTask.logs && savedTask.logs.length > 0 ? savedTask.logs[savedTask.logs.length - 1] : null;

      const confirmMsg = isUpdate
        ? `✅ **Update Laporan Terkini Berhasil Disimpan!**\n\n📌 **Tugas:** ${savedTask.title}\n🏢 **Klien:** ${savedTask.companyName || '-'}\n📊 **Status:** ${savedTask.status} (${savedTask.progress}%)\n📝 **Catatan Log:** ${latestLog?.description || '-'}`
        : `✅ **Tugas Baru Berhasil Ditambahkan!**\n\n📌 **Judul Pekerjaan:** ${savedTask.title}\n🏢 **Perusahaan/Klien:** ${savedTask.companyName || '-'}\n⚡ **Prioritas:** ${savedTask.priority}\n📊 **Status:** ${savedTask.status} (${savedTask.progress}%)`;

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: confirmMsg,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isNew: true
      }]);
    } catch (err) {
      console.error("Gagal menyimpan task ke database:", err);
      alert("Terjadi kendala saat menyimpan data task. Silakan coba kembali.");
    } finally {
      setIsTaskModalOpen(false);
    }
  };

  // Save chat to localStorage safely
  useEffect(() => {
    safeSetLocalStorage('mypanca_mobile_ai_chat', JSON.stringify(messages.slice(-50)));
  }, [messages]);

  // Save auto-speak preference
  useEffect(() => {
    safeSetLocalStorage('mypanca_ai_autospeak', autoSpeak ? 'true' : 'false');
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
    if (lower.includes('tugas baru') || lower.includes('input task') || lower.includes('tambah task') || lower.includes('buat task') || lower.includes('input tugas') || lower.includes('tambah tugas')) {
      handleOpenNewTaskModal();
      return {
        responseText: '### 📝 Formulir Tugas Baru\n\nFormulir Tugas Baru telah dibuka. Silakan lengkapi detail pekerjaan pada formulir secara lengkap.',
        nextSession: null
      };
    }
    if (lower.includes('update task') || lower.includes('lanjutkan task') || lower.includes('lanjutkan tugas') || lower.includes('update tugas') || lower.includes('progres task') || lower.includes('log task')) {
      handleOpenUpdateTaskPicker();
      return {
        responseText: '### 🔄 Lanjutkan Pekerjaan / Update Task\n\nPilih tugas yang ingin Anda perbarui dari daftar tugas aktif di bawah ini.',
        nextSession: null
      };
    }
    if (lower.includes('tambah customer')) {
      return {
        responseText: '### 👤 Form CRM Customer Baru\n\nSilakan isi data pelanggan baru pada **Form CRM Interactive** di bawah ini:',
        nextSession: { type: 'customer', step: 1, data: {} }
      };
    }
    if (lower.includes('followup') || lower.includes('follow up') || lower.includes('folowup')) {
      return {
        responseText: '### 📞 Tambah Follow-up Penawaran\n\nPilih dokumen penawaran yang ingin Anda catat hasil komunikasi follow-up-nya dari daftar di bawah ini:',
        nextSession: { type: 'followup', step: 1, data: {} }
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

    // 2.5. Remote WhatsApp Command Gateway (Perangkat 2 / WA Notifikasi Sistem)
    const lowerUser = query.toLowerCase().trim();
    const isRemoteWaCmd = isSuperAdmin && (
      lowerUser.includes('kirim pesan ke') || 
      lowerUser.includes('kirim wa ke') || 
      lowerUser.includes('kirim whatsapp ke') || 
      lowerUser.includes('kirim notifikasi ke') ||
      (lowerUser.startsWith('kirim pesan') && lowerUser.includes(' ke ')) ||
      (lowerUser.startsWith('kirim wa') && lowerUser.includes(' ke ')) ||
      (lowerUser.startsWith('wa ke ') && lowerUser.length > 7) ||
      (lowerUser.startsWith('pesan ke ') && lowerUser.length > 9)
    );

    if (isRemoteWaCmd) {
      setIsLoading(true);
      try {
        let cachedUsers: any[] = [];
        try {
          const raw = localStorage.getItem('mypanca_db_app_users');
          if (raw) cachedUsers = JSON.parse(raw);
        } catch {}

        const cleanContacts = [
          ...(appUsers || []).map((u: any) => ({ name: u.nama || u.username, username: u.username, phone: u.whatsapp || u.phone || u.no_hp || u.noWa })),
          ...(cachedUsers || []).map((u: any) => ({ name: u.nama || u.username, username: u.username, phone: u.whatsapp || u.phone || u.no_hp || u.noWa })),
          ...(employees || []).map((e: any) => ({ name: e.nama || e.username || e.name, username: e.username, phone: e.whatsapp || e.phone || e.no_hp || e.noWa })),
          ...(customers || []).map((c: any) => ({ name: c.nama || c.perusahaan || c.pic, username: '', phone: c.whatsapp || c.phone || c.no_hp })),
          ...(currentUser ? [{ name: currentUser.nama || currentUser.username, username: currentUser.username, phone: (currentUser as any).whatsapp || '' }] : [])
        ].filter(c => c.name && c.phone);

        // Pre-parse intent on client side for resilient error reporting
        const delimiterMatch = query.trim().match(/(?:kirim(?:kan)?\s+(?:pesan|wa|whatsapp|notifikasi)?|wa|pesan)?\s*(?:ke|kepada|untuk)\s+([^:,\n-]+?)\s*[:,\-]\s*(.+)$/i);
        const withoutDelimiterMatch = query.trim().match(/(?:kirim(?:kan)?\s+(?:pesan|wa|whatsapp|notifikasi)?|wa|pesan)?\s*(?:ke|kepada|untuk)\s+([a-zA-Z0-9\+._]+)\s+(.+)$/i);
        
        const clientTarget = delimiterMatch ? delimiterMatch[1].trim() : (withoutDelimiterMatch ? withoutDelimiterMatch[1].trim() : '');
        const clientMsg = delimiterMatch ? delimiterMatch[2].trim() : (withoutDelimiterMatch ? withoutDelimiterMatch[2].trim() : query.trim());
        const matchedContact = cleanContacts.find((c: any) => 
          c.name?.toLowerCase() === clientTarget.toLowerCase() || 
          (c.username && c.username.toLowerCase() === clientTarget.toLowerCase()) ||
          c.name?.toLowerCase().includes(clientTarget.toLowerCase())
        );

        const apiUrl = getApiUrl('/api/wa-notif/execute-command');

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: query.trim(),
            superadminName: currentUser?.nama || 'Superadmin',
            providedContacts: cleanContacts
          })
        });

        let data: any = null;
        try {
          const rawText = await res.text();
          data = rawText ? JSON.parse(rawText) : null;
        } catch (parseErr) {
          console.warn("[PancaAIChatView] Non-JSON response:", parseErr);
        }

        if (!data) {
          data = {
            success: false,
            targetName: matchedContact?.name || clientTarget || 'Penerima',
            targetPhone: matchedContact?.phone || '-',
            messageSent: clientMsg,
            error: res.status !== 200 
              ? `Server backend (${apiUrl}) merespons status ${res.status}. Pastikan server backend sedang aktif.`
              : 'Respon server kosong atau tidak dapat dibaca sebagai JSON.'
          };
        }

        let contentText = "";

        if (data.success) {
          contentText = `### 📱 Eksekusi Perintah Remote Command Gateway\n\nPerintah WhatsApp instan Anda berhasil dieksekusi oleh AI Assistant:\n\n| Parameter Eksekusi | Detail Terbaca |\n|---|---|\n| **📱 Perangkat Eksekutor** | **WhatsApp Notifikasi (Perangkat 2)** |\n| **👤 Penerima Pesan** | **${data.targetName}** (\`${data.targetPhone}\`) |\n| **💬 Isi Pesan Dikirim** | "${data.messageSent}" |\n| **⚡ Status Pengiriman** | ✅ **BERHASIL TERKIRIM** |\n\n---\n✅ Pesan telah dikirimkan secara langsung dari nomor WhatsApp Notifikasi sistem.`;
        } else {
          contentText = `### ⚠️ Eksekusi Remote Command Gateway Terkendala\n\nPerintah pengiriman WhatsApp belum dapat diselesaikan:\n\n- **Tujuan Kontak**: **${data.targetName || matchedContact?.name || clientTarget || 'Penerima'}** (${data.targetPhone || matchedContact?.phone || '-'})\n- **Pesan yang Dicoba**: "${data.messageSent || clientMsg || query.trim()}"\n- **Penyebab Kendala**: ${data.error || 'Perangkat WhatsApp Notifikasi belum terhubung atau nomor kontak tidak ditemukan.'}\n\n---\n💡 **Petunjuk**: Pastikan nomor HP kontak terdaftar di database sistem (menu Users/Kontak) dan status WhatsApp Notifikasi dalam posisi **Online/Connected** pada menu Pengaturan Aplikasi & Notifikasi.`;
        }

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: contentText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isNew: true
        }]);
      } catch (err: any) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `⚠️ **Gagal Mengeksekusi Remote Command**: ${err.message || 'Server API tidak merespons.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isNew: true
        }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);

    const historyPayload = messages.slice(-6).map(m => {
      if (m.role === 'assistant' && m.content.length > 600) {
        return {
          role: m.role,
          content: m.content.substring(0, 600) + '\n... [Ringkasan respon sebelumnya]'
        };
      }
      return { role: m.role, content: m.content };
    });
    const contextPayload: PancaAIContext = {
      currentUser,
      activeCompany,
      transactions,
      customers,
      products: effectiveProducts,
      suppliers,
      purchaseOrders,
      employees,
      taskAppData,
      rolePermissions,
      taskAppDataExt: { qaQuestions }
    };

    try {
      const queryRes = await queryPancaAI({
        userPrompt: query.trim(), 
        messages: historyPayload, 
        ctx: contextPayload,
        preferredModel: selectedModel
      });

      let responseText = typeof queryRes === 'string' ? queryRes : (queryRes?.responseText || '');
      const tokenUsage = typeof queryRes === 'object' ? queryRes?.usage : undefined;

      // Auto-detect if user asks about a product, product photo, or if AI recommends/discusses products with images
      const lowerQ = query.toLowerCase();
      const asksForPhoto = /foto|gambar|photo|image|lihat|tampilkan|pic|picture/i.test(lowerQ);
      const isGeneralPhotoReq = asksForPhoto && /produk|semua|katalog|ada apa|apa saja|database|sistem|stok|daftar/i.test(lowerQ);

      // If user specifically requested a photo, clean up any LLM refusal disclaimer about sending photos
      if (asksForPhoto) {
        responseText = responseText
          .replace(/Mohon maaf [^,\n]+, kapasitas saya sebagai asisten Panca AI dibatasi hanya untuk informasi operasional PT Panca Prima Wijaya[^.\n]*\./gi, '')
          .replace(/Saya tidak diperkenankan[^.\n]*foto produk[^.\n]*\./gi, '')
          .replace(/Saya tidak dapat (mengirimkan|menampilkan) foto[^.\n]*\./gi, '')
          .replace(/tidak dapat (mengirimkan|menampilkan) foto[^.\n]*\./gi, '')
          .replace(/tidak memiliki kemampuan (mengirimkan|menampilkan) (gambar|foto)[^.\n]*\./gi, '')
          .replace(/tidak bisa (mengirimkan|menampilkan) (gambar|foto)[^.\n]*\./gi, '')
          .trim();

        if (responseText.startsWith('Sebagai informasi')) {
          responseText = 'Berikut adalah foto produk dan informasi resmi yang tersedia di database MyPanca:\n\n' + responseText;
        } else if (!responseText) {
          responseText = 'Berikut adalah foto produk yang tersedia di database MyPanca:';
        }
      }

      const allDbAndCatalog = [...(effectiveProducts || []), ...DEFAULT_PANCA_PRODUCTS];
      const matchedProducts: any[] = [];

      allDbAndCatalog.forEach(p => {
        const pName = String(p.nama || p.name || '').toLowerCase();
        const pCode = String(p.kode || p.id || '').toLowerCase();
        const nameTokens = pName.split(/[\s-]+/).filter((t: string) => t.length >= 3);

        // Does user prompt mention this product or its code/tokens?
        const queryMention = (pName && lowerQ.includes(pName)) ||
          (pCode && lowerQ.includes(pCode)) ||
          nameTokens.some((token: string) => lowerQ.includes(token));

        // Does the AI response mention this product?
        const responseMention = (pName && responseText.toLowerCase().includes(pName)) ||
          (pCode && responseText.toLowerCase().includes(pCode)) ||
          (nameTokens.length > 0 && nameTokens.some((token: string) => responseText.toLowerCase().includes(token)));

        const hasImg = Boolean(getProductImageUrl(p, allDbAndCatalog));

        if (hasImg) {
          if (queryMention || responseMention || isGeneralPhotoReq) {
            matchedProducts.push(p);
          }
        }
      });

      // If user specifically asked for photos, prioritize products with real photos from the database
      if (asksForPhoto) {
        (effectiveProducts || []).forEach(p => {
          if (hasDatabaseProductImage(p)) {
            const pName = String(p.nama || p.name || '').toLowerCase();
            const pCode = String(p.kode || p.id || '').toLowerCase();
            const tokens = pName.split(/[\s-]+/).filter((t: string) => t.length >= 3);
            if (isGeneralPhotoReq || tokens.some(t => lowerQ.includes(t)) || (pCode && lowerQ.includes(pCode))) {
              matchedProducts.unshift(p);
            } else if (matchedProducts.length === 0) {
              matchedProducts.push(p);
            }
          }
        });

        // Fallback to default catalog if still no products
        if (matchedProducts.length === 0) {
          DEFAULT_PANCA_PRODUCTS.forEach(dp => matchedProducts.push(dp));
        }
      }

      if (matchedProducts.length > 0) {
        // Sort: products with real database photos come FIRST!
        matchedProducts.sort((a, b) => {
          const aHasDb = hasDatabaseProductImage(a) ? 1 : 0;
          const bHasDb = hasDatabaseProductImage(b) ? 1 : 0;
          return bHasDb - aHasDb;
        });

        // Deduplicate by ID or code or name
        const seen = new Set<string>();
        const uniqueProds: any[] = [];
        for (const p of matchedProducts) {
          const key = p.id || p.kode || p.nama || p.name;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueProds.push(p);
          }
        }

        const maxPhotos = isGeneralPhotoReq ? 4 : 2;
        uniqueProds.slice(0, maxPhotos).forEach(p => {
          const pId = p.id || '';
          const pKode = p.kode || '';
          const hasImageTag = (pId && responseText.includes(`(product-image:${pId})`)) || 
                             (pKode && responseText.includes(`(product-image:${pKode})`)) ||
                             (p.nama && responseText.includes(`![Foto ${p.nama}]`)) ||
                             (p.name && responseText.includes(`![Foto ${p.name}]`));

          if (!hasImageTag) {
            responseText += `\n\n![Foto ${p.nama || p.name}](product-image:${pId || pKode})`;
          }
        });
      }

      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isNew: true,
        tokenUsage: tokenUsage
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (autoSpeak) speakText(responseText, assistantMessage.id);
    } catch (e) {
      console.error("Panca AI Chat Error:", e);
      let fallbackContent = '';
      try {
        fallbackContent = generateSmartDynamicFallback(query.trim(), contextPayload);
      } catch (fbErr) {
        console.error("Fallback generator error:", fbErr);
      }
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fallbackContent || 'Maaf, terjadi kendala saat memproses pertanyaan Anda. Silakan coba kembali.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isNew: true
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
                      products={effectiveProducts}
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
                      {m.tokenUsage && (
                        <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 px-2 py-0.5 rounded-full font-mono text-[9px] font-bold shadow-2xs ml-0.5">
                          <Zap size={10} className="text-amber-500 fill-amber-500 shrink-0" />
                          <span>{m.tokenUsage.totalTokens.toLocaleString('id-ID')} token ({m.tokenUsage.promptTokens.toLocaleString('id-ID')} in / {m.tokenUsage.candidateTokens.toLocaleString('id-ID')} out)</span>
                        </div>
                      )}
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
              <h4 className="text-xs font-black uppercase">
                {activeSession.type === 'task_new' ? 'Tugas Baru (Formulir Detail Pekerjaan)' :
                 activeSession.type === 'task_update' ? (activeSession.data.selectedTask ? 'Update Laporan Terkini' : 'Lanjutkan Tugas Belum Selesai') :
                 activeSession.type === 'followup' ? 'Tambah Follow-up Penawaran' :
                 activeSession.type === 'penawaran' ? 'Form Penawaran' :
                 activeSession.type === 'transaction' ? 'Form Transaksi Penjualan' : 'Form Customer Baru'}
              </h4>
              <button onClick={() => setActiveSession(null)} className="text-slate-400 hover:text-rose-500"><XCircle size={18} /></button>
            </div>
            
            {/* 1. FORM TUGAS BARU (Matches Image 1, 2, 3) */}
            {activeSession.type === 'task_new' && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">JUDUL PEKERJAAN</label>
                  <input 
                    type="text" 
                    value={activeSession.data.title || ''} 
                    onChange={(e) => updateActiveData('title', e.target.value)} 
                    placeholder="Masukkan judul pekerjaan / task..." 
                    className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100 placeholder:font-normal" 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">PERUSAHAAN / KLIEN</label>
                    <input 
                      type="text" 
                      value={activeSession.data.companyName || ''} 
                      onChange={(e) => updateActiveData('companyName', e.target.value)} 
                      placeholder="Nama perusahaan / klien..." 
                      className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 placeholder:font-normal" 
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">PRIORITAS</label>
                    <select 
                      value={activeSession.data.priority || 'Medium'} 
                      onChange={(e) => updateActiveData('priority', e.target.value)} 
                      className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>

                {/* Detail Perubahan Log Container */}
                <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                      DETAIL PERUBAHAN LOG ({new Date().toLocaleDateString('id-ID')})
                    </span>
                    <span className="px-2 py-0.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[9px] font-black rounded-md uppercase">AKTIF</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">STATUS PENGERJAAN</label>
                      <select 
                        value={activeSession.data.status || 'Belum Mulai'} 
                        onChange={(e) => updateActiveData('status', e.target.value)} 
                        className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100"
                      >
                        <option value="Belum Mulai">Belum Mulai</option>
                        <option value="Proses">Proses</option>
                        <option value="Selesai">Selesai</option>
                        <option value="Ulang">Ulang</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">PROGRES CAPAIAN ({activeSession.data.progress || 0}%)</label>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        step="5" 
                        value={activeSession.data.progress || 0} 
                        onChange={(e) => updateActiveData('progress', Number(e.target.value))} 
                        className="w-full h-2 bg-slate-200 rounded-full cursor-pointer accent-slate-900 dark:accent-white mt-2" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">DESKRIPSI PERUBAHAN / CATATAN</label>
                    <textarea 
                      rows={3} 
                      value={activeSession.data.description || ''} 
                      onChange={(e) => updateActiveData('description', e.target.value)} 
                      placeholder="Jelaskan apa yang berubah atau apa yang dilakukan pada tahap ini..." 
                      className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 resize-none" 
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button type="button" onClick={() => setActiveSession(null)} className="flex-1 py-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-bold rounded-xl text-xs hover:bg-slate-200">Batal</button>
                  <button type="button" onClick={handleDirectSaveFromForm} className="flex-[2] py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-xl text-xs shadow-md hover:bg-black">Simpan Perubahan</button>
                </div>
              </div>
            )}

            {/* 2. FORM UPDATE / LANJUTKAN TASK (Matches Image 4 & 5) */}
            {activeSession.type === 'task_update' && (
              <div className="space-y-3.5 text-xs">
                {!activeSession.data.selectedTask ? (
                  /* Step A: Searchbox & Task Selection matching image_a40ae895.png */
                  <div className="space-y-3">
                    <div className="text-[10px] font-extrabold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      Pilih tugas yang ingin dilanjutkan hari ini:
                    </div>

                    {/* Search input */}
                    <div className="relative">
                      <input 
                        type="text" 
                        value={wizardCustSearch} 
                        onChange={(e) => setWizardCustSearch(e.target.value)} 
                        placeholder="Cari tugas / nama perusahaan..." 
                        className="w-full pl-8 pr-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 placeholder:font-normal" 
                      />
                      <Search size={12} className="absolute left-2.5 top-3 text-slate-400" />
                    </div>

                    {/* Task Cards List */}
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {userVisibleTasks.filter(t => {
                        if (!wizardCustSearch.trim()) return true;
                        const q = wizardCustSearch.toLowerCase();
                        return (t.title || '').toLowerCase().includes(q) || (t.companyName || '').toLowerCase().includes(q);
                      }).length > 0 ? (
                        userVisibleTasks.filter(t => {
                          if (!wizardCustSearch.trim()) return true;
                          const q = wizardCustSearch.toLowerCase();
                          return (t.title || '').toLowerCase().includes(q) || (t.companyName || '').toLowerCase().includes(q);
                        }).map(task => (
                          <div key={task.id} className="bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl p-3 flex items-center justify-between gap-2 shadow-2xs hover:border-slate-400 transition">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[9px] font-black uppercase text-slate-400 truncate">{task.companyName || 'PANCA PRIMA WIJAYA'}</span>
                                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-200 rounded-md text-[8px] font-black uppercase">{task.status}</span>
                              </div>
                              <div className="font-extrabold text-xs text-slate-900 dark:text-zinc-100 truncate">{task.title}</div>
                              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Progress saat ini: <span className="font-extrabold text-slate-800 dark:text-zinc-200">{task.progress}%</span></div>
                            </div>

                            <button 
                              type="button" 
                              onClick={() => {
                                const latestLog = task.logs && task.logs.length > 0 ? task.logs[task.logs.length - 1] : null;
                                updateActiveData('selectedTask', task);
                                updateActiveData('title', task.title);
                                updateActiveData('companyName', task.companyName);
                                updateActiveData('priority', task.priority || 'Medium');
                                updateActiveData('status', task.status || 'Proses');
                                updateActiveData('progress', task.progress !== undefined ? task.progress : 85);
                                updateActiveData('description', latestLog?.description || `Dilanjutkan pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`);
                              }} 
                              className="px-3 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-black rounded-xl shadow-xs hover:bg-black shrink-0 flex items-center gap-1 active:scale-95 transition"
                            >
                              <span>Lanjutkan</span>
                              <span className="text-[11px]">➔</span>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-slate-400 text-xs font-semibold">
                          Tidak ada tugas yang cocok.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Step B: Update Form pre-filled with selectedTask matching image_039fef55.png */
                  <div className="space-y-3.5">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">JUDUL PEKERJAAN</label>
                      <input 
                        type="text" 
                        disabled 
                        value={activeSession.data.title || ''} 
                        className="w-full p-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-200 cursor-not-allowed opacity-90" 
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">PERUSAHAAN / KLIEN</label>
                        <input 
                          type="text" 
                          disabled 
                          value={activeSession.data.companyName || ''} 
                          className="w-full p-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-200 cursor-not-allowed opacity-90" 
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">PRIORITAS</label>
                        <select 
                          value={activeSession.data.priority || 'Medium'} 
                          onChange={(e) => updateActiveData('priority', e.target.value)} 
                          className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                      </div>
                    </div>

                    {/* Detail Perubahan Log Container */}
                    <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                          DETAIL PERUBAHAN LOG ({new Date().toLocaleDateString('id-ID')})
                        </span>
                        <span className="px-2 py-0.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[9px] font-black rounded-md uppercase">AKTIF</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">STATUS PENGERJAAN</label>
                          <select 
                            value={activeSession.data.status || 'Proses'} 
                            onChange={(e) => updateActiveData('status', e.target.value)} 
                            className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100"
                          >
                            <option value="Belum Mulai">Belum Mulai</option>
                            <option value="Proses">Proses</option>
                            <option value="Selesai">Selesai</option>
                            <option value="Ulang">Ulang</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">PROGRES CAPAIAN ({activeSession.data.progress || 0}%)</label>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            step="5" 
                            value={activeSession.data.progress || 0} 
                            onChange={(e) => updateActiveData('progress', Number(e.target.value))} 
                            className="w-full h-2 bg-slate-200 rounded-full cursor-pointer accent-slate-900 dark:accent-white mt-2" 
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">DESKRIPSI PERUBAHAN / CATATAN</label>
                        <textarea 
                          rows={3} 
                          value={activeSession.data.description || ''} 
                          onChange={(e) => updateActiveData('description', e.target.value)} 
                          placeholder="Jelaskan apa yang berubah atau apa yang dilakukan pada tahap ini..." 
                          className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 resize-none" 
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={() => updateActiveData('selectedTask', null)} className="flex-1 py-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-bold rounded-xl text-xs hover:bg-slate-200">Ganti Tugas</button>
                      <button type="button" onClick={handleDirectSaveFromForm} className="flex-[2] py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-xl text-xs shadow-md hover:bg-black">Simpan Perubahan</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* 1. FORM CUSTOMER BARU (Data Kontak - Matches Image 1) */}
            {activeSession.type === 'customer' && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">JENIS KONTAK</label>
                    <select 
                      value={activeSession.data.jenisKontak || 'Perusahaan'} 
                      onChange={(e) => updateActiveData('jenisKontak', e.target.value)} 
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100"
                    >
                      <option value="Perusahaan">Perusahaan</option>
                      <option value="Perorangan">Perorangan</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">NAMA PERUSAHAAN / PELANGGAN</label>
                    <input 
                      type="text" 
                      value={activeSession.data.nama || activeSession.data.perusahaan || ''} 
                      onChange={(e) => {
                        updateActiveData('nama', e.target.value);
                        updateActiveData('perusahaan', e.target.value);
                      }} 
                      placeholder="Masukkan nama perusahaan..." 
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400" 
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">TELEPON / WHATSAPP</label>
                  <div className="flex gap-2">
                    <select 
                      value={activeSession.data.phoneCode || '+62'} 
                      onChange={(e) => updateActiveData('phoneCode', e.target.value)} 
                      className="w-36 p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 shrink-0"
                    >
                      <option value="+62">ID +62 (Indonesia)</option>
                      <option value="+65">SG +65 (Singapore)</option>
                      <option value="+60">MY +60 (Malaysia)</option>
                      <option value="+1">US +1 (USA)</option>
                    </select>
                    <input 
                      type="text" 
                      value={activeSession.data.whatsapp || ''} 
                      onChange={(e) => updateActiveData('whatsapp', e.target.value)} 
                      placeholder="8123456789" 
                      className="flex-1 p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">EMAIL</label>
                    <input 
                      type="email" 
                      value={activeSession.data.email || ''} 
                      onChange={(e) => updateActiveData('email', e.target.value)} 
                      placeholder="email@example.com" 
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400" 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">NEGARA</label>
                    <input 
                      type="text" 
                      value={activeSession.data.negara !== undefined ? activeSession.data.negara : 'Indonesia'} 
                      onChange={(e) => updateActiveData('negara', e.target.value)} 
                      placeholder="Indonesia" 
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400" 
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">ALAMAT LENGKAP</label>
                  <textarea 
                    rows={2} 
                    value={activeSession.data.alamat || activeSession.data.kota || ''} 
                    onChange={(e) => {
                      updateActiveData('alamat', e.target.value);
                      updateActiveData('kota', e.target.value);
                    }} 
                    placeholder="Jl. ..." 
                    className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 resize-none" 
                  />
                </div>

                {/* Sales & Marketing Card */}
                <div className="bg-slate-50/80 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-3 space-y-2.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-300">SALES & MARKETING</div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 mb-1 block">SALES REPRESENTATIVE</label>
                      <select 
                        value={activeSession.data.sales || currentUser?.nama || 'maria'} 
                        onChange={(e) => updateActiveData('sales', e.target.value)} 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100"
                      >
                        {salesOptions.map((s, idx) => (
                          <option key={idx} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 mb-1 block">LEAD TYPE</label>
                      <select 
                        value={activeSession.data.leadType || 'Belum Transaksi'} 
                        onChange={(e) => updateActiveData('leadType', e.target.value)} 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100"
                      >
                        <option value="Belum Transaksi">Belum Transaksi</option>
                        <option value="Prospek">Prospek</option>
                        <option value="Pelanggan">Pelanggan</option>
                        <option value="Aktif">Aktif</option>
                        <option value="Prioritas">Prioritas</option>
                        <option value="Inaktif">Inaktif</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 mb-1 block">SOURCE</label>
                      <select 
                        value={activeSession.data.source || 'Organic'} 
                        onChange={(e) => updateActiveData('source', e.target.value)} 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100"
                      >
                        <option value="Organic">Organic</option>
                        <option value="Ads">Ads / Iklan</option>
                        <option value="Referral">Referral</option>
                        <option value="Website">Website</option>
                        <option value="Pameran">Pameran</option>
                        <option value="Lainnya">Lainnya</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 mb-1 block">NPWP</label>
                      <input 
                        type="text" 
                        value={activeSession.data.npwp || ''} 
                        onChange={(e) => updateActiveData('npwp', e.target.value)} 
                        placeholder="00.000.000.0-000.000" 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400" 
                      />
                    </div>
                  </div>
                </div>

                <button onClick={handleDirectSaveFromForm} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg mt-2 transition">Simpan Customer Baru</button>
              </div>
            )}

            {/* FORM FOLLOW-UP PENAWARAN (Matches Image 52c70ef9.png) */}
            {activeSession.type === 'followup' && (
              <div className="space-y-3.5 text-xs">
                {!activeSession.data.selectedQuotation ? (
                  <div className="space-y-3">
                    <div className="text-[10px] font-extrabold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      Pilih dokumen Penawaran yang ingin di-followup:
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Search size={14} />
                      </div>
                      <input 
                        type="text" 
                        value={wizardQuotationSearch} 
                        onChange={(e) => setWizardQuotationSearch(e.target.value)} 
                        placeholder="Cari No. Penawaran, Pelanggan..." 
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500" 
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                      {((transactions || []).filter((t: any) => t.status === 'Penawaran' || t.isQuote || (t.noTrx || '').startsWith('QUO') || (t.noTrx || '').startsWith('PES') || t.type === 'Penawaran')).length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-xs font-medium border border-dashed rounded-xl">
                          Tidak ada dokumen penawaran ditemukan dalam database.
                        </div>
                      ) : (
                        (transactions || []).filter((t: any) => t.status === 'Penawaran' || t.isQuote || (t.noTrx || '').startsWith('QUO') || (t.noTrx || '').startsWith('PES') || t.type === 'Penawaran').filter((q: any) => {
                          const qStr = `${q.noTrx || q.id || ''} ${q.customerName || q.customer || q.perusahaan || ''} ${q.tanggal || ''}`.toLowerCase();
                          return qStr.includes((wizardQuotationSearch || '').toLowerCase());
                        }).slice(0, 10).map((q: any, idx: number) => (
                          <div 
                            key={idx} 
                            onClick={() => {
                              updateActiveData('selectedQuotation', q);
                              updateActiveData('followUpDate', new Date().toISOString().split('T')[0]);
                              updateActiveData('followUpMethod', 'WhatsApp');
                              updateActiveData('keterangan', '');
                            }}
                            className="p-3 bg-slate-50 dark:bg-zinc-800/80 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-slate-200 dark:border-zinc-700 hover:border-purple-300 dark:hover:border-purple-800 rounded-xl cursor-pointer transition flex items-center justify-between"
                          >
                            <div className="space-y-0.5">
                              <div className="font-extrabold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
                                <span>{q.noTrx || q.id}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold">PENAWARAN</span>
                              </div>
                              <div className="text-[11px] font-medium text-slate-600 dark:text-zinc-300">
                                👤 {q.customerName || q.customer || q.perusahaan || 'Customer Umum'}
                              </div>
                              {q.latestFollowUp && (
                                <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium truncate max-w-xs">
                                  📌 FU Terakhir: {q.latestFollowUp}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">
                                Rp {Number(q.total || q.nilaiProyek || 0).toLocaleString('id-ID')}
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium">{q.tanggal || ''}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  /* Step B: Exact "Tambah Follow-up" Form matching image_52c70ef9.png */
                  <div className="space-y-3.5">
                    {/* Selected Penawaran Info */}
                    <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300">PENAWARAN TERPILIH</div>
                        <div className="font-extrabold text-xs text-slate-800 dark:text-zinc-100">
                          {activeSession.data.selectedQuotation.noTrx || activeSession.data.selectedQuotation.id} - {activeSession.data.selectedQuotation.customerName || activeSession.data.selectedQuotation.customer || 'Customer'}
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => updateActiveData('selectedQuotation', null)}
                        className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-bold"
                      >
                        Ganti
                      </button>
                    </div>

                    <div className="border-t border-slate-200 dark:border-zinc-800 pt-3 space-y-3">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 dark:text-zinc-100">
                        TAMBAH FOLLOW-UP
                      </div>

                      <div>
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">TANGGAL FOLLOW-UP</label>
                        <input 
                          type="date" 
                          value={activeSession.data.followUpDate || new Date().toISOString().split('T')[0]} 
                          onChange={(e) => updateActiveData('followUpDate', e.target.value)} 
                          className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100" 
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">METODE FOLLOW-UP</label>
                        <select 
                          value={activeSession.data.followUpMethod || 'WhatsApp'} 
                          onChange={(e) => updateActiveData('followUpMethod', e.target.value)} 
                          className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100"
                        >
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Telepon">Telepon</option>
                          <option value="Email">Email</option>
                          <option value="Meeting Direct">Meeting Direct</option>
                          <option value="Kunjungan">Kunjungan</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">KETERANGAN</label>
                        <textarea 
                          rows={3} 
                          value={activeSession.data.keterangan || ''} 
                          onChange={(e) => updateActiveData('keterangan', e.target.value)} 
                          placeholder="Masukkan hasil follow-up..." 
                          className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 resize-none" 
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button 
                          type="button" 
                          onClick={() => setActiveSession(null)} 
                          className="flex-1 py-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-bold rounded-xl text-xs hover:bg-slate-200 transition"
                        >
                          BATAL
                        </button>
                        <button 
                          type="button" 
                          onClick={handleDirectSaveFromForm} 
                          className="flex-[2] py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs shadow-md transition"
                        >
                          SIMPAN
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. FORM PENAWARAN BARU (Quotation - Matches Image 2) */}
            {activeSession.type === 'penawaran' && (
              <div className="space-y-3 text-xs">
                <div className="bg-slate-50/80 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-3 space-y-2.5">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">CUSTOMER</label>
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
                        placeholder="Cari Customer..." 
                        className="w-full pl-8 pr-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100" 
                      />
                    </div>
                    {wizardCustSearch && (
                      <div className="mt-1 max-h-32 overflow-y-auto bg-white dark:bg-zinc-800 border rounded-xl shadow-md divide-y text-[10px] z-10 relative">
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

                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">SALES RESPONSIBLE</label>
                    <select 
                      value={activeSession.data.sales || currentUser?.nama || 'maria'} 
                      onChange={(e) => updateActiveData('sales', e.target.value)} 
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100"
                    >
                      {salesOptions.map((s, idx) => (
                        <option key={idx} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">KETERANGAN</label>
                    <textarea 
                      rows={2} 
                      value={activeSession.data.keterangan || ''} 
                      onChange={(e) => updateActiveData('keterangan', e.target.value)} 
                      placeholder="Masukkan keterangan..." 
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 resize-none" 
                    />
                  </div>
                </div>

                {/* Follow-Up Information Box */}
                <div className="bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 rounded-2xl p-3 space-y-2.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1">
                    <MessageSquare size={12} />
                    <span>FOLLOW-UP INFORMATION</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 mb-1 block">TANGGAL FOLLOW-UP</label>
                      <input 
                        type="date" 
                        value={activeSession.data.followUpDate || new Date().toISOString().split('T')[0]} 
                        onChange={(e) => updateActiveData('followUpDate', e.target.value)} 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 mb-1 block">METODE FOLLOW-UP</label>
                      <select 
                        value={activeSession.data.followUpMethod || 'WhatsApp'} 
                        onChange={(e) => updateActiveData('followUpMethod', e.target.value)} 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100"
                      >
                        <option value="Pilih Metode...">Pilih Metode...</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Telepon">Telepon</option>
                        <option value="Email">Email</option>
                        <option value="Meeting Direct">Meeting Direct</option>
                        <option value="Kunjungan">Kunjungan</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Item Penawaran */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400">ITEM PENAWARAN</label>
                    <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">+ Tambah Produk di bawah</span>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                      <Package size={12} />
                    </div>
                    <input 
                      type="text" 
                      value={wizardProdSearch} 
                      onChange={(e) => setWizardProdSearch(e.target.value)} 
                      placeholder="Cari nama produk / SKU..." 
                      className="w-full pl-8 pr-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100" 
                    />
                  </div>
                  {wizardProdSearch && (
                    <div className="mt-1 max-h-36 overflow-y-auto bg-white dark:bg-zinc-800 border rounded-xl shadow-md divide-y text-[10px]">
                      {effectiveProducts.filter(p => (p.nama || '').toLowerCase().includes(wizardProdSearch.toLowerCase()) || (p.kode || '').toLowerCase().includes(wizardProdSearch.toLowerCase())).slice(0, 6).map(p => (
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

                  {activeSession.data.items && activeSession.data.items.length > 0 ? (
                    <div className="space-y-1.5 border-t pt-2">
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
                  ) : (
                    <div className="p-4 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl text-center text-slate-400 text-[11px] font-medium">
                      Belum ada produk dipilih
                    </div>
                  )}
                </div>

                <button onClick={handleDirectSaveFromForm} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg mt-2 transition">Simpan Penawaran Sekarang</button>
              </div>
            )}

            {/* 3. FORM TRANSAKSI BARU (Matches Image 3 & Image 4 with Status Transaksi Dropdown) */}
            {activeSession.type === 'transaction' && (
              <div className="space-y-3 text-xs">
                <div className="bg-slate-50/80 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-3 space-y-2.5">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">CUSTOMER</label>
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
                        placeholder="Cari Customer..." 
                        className="w-full pl-8 pr-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100" 
                      />
                    </div>
                    {wizardCustSearch && (
                      <div className="mt-1 max-h-32 overflow-y-auto bg-white dark:bg-zinc-800 border rounded-xl shadow-md divide-y text-[10px] z-10 relative">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">TANGGAL</label>
                      <input 
                        type="date" 
                        value={activeSession.data.tanggal || new Date().toISOString().split('T')[0]} 
                        onChange={(e) => updateActiveData('tanggal', e.target.value)} 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100" 
                      />
                    </div>
                    <div>
                      {/* STATUS TRANSAKSI DROPDOWN (Directly routes transaction to selected status, matches Image 3 & Image 4) */}
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">STATUS TRANSAKSI</label>
                      <select 
                        value={activeSession.data.status || 'Invoice'} 
                        onChange={(e) => updateActiveData('status', e.target.value)} 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-blue-500 dark:border-blue-400 rounded-xl text-xs font-bold text-blue-700 dark:text-blue-300 shadow-xs focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Invoice">Invoice</option>
                        <option value="Pembayaran">Pembayaran</option>
                        <option value="Pengiriman">Pengiriman</option>
                        <option value="Pesanan Selesai">Pesanan Selesai</option>
                        <option value="Batal">Batal</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">PAYMENT STATUS</label>
                      <select 
                        value={activeSession.data.paymentStatus || 'Belum Lunas'} 
                        onChange={(e) => updateActiveData('paymentStatus', e.target.value)} 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100"
                      >
                        <option value="Belum Lunas">Belum Lunas</option>
                        <option value="Lunas">Lunas</option>
                        <option value="DP">DP</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">SALES RESPONSIBLE</label>
                      <select 
                        value={activeSession.data.sales || currentUser?.nama || 'yadi'} 
                        onChange={(e) => updateActiveData('sales', e.target.value)} 
                        className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100"
                      >
                        {salesOptions.map((s, idx) => (
                          <option key={idx} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">KETERANGAN</label>
                    <textarea 
                      rows={2} 
                      value={activeSession.data.keterangan || ''} 
                      onChange={(e) => updateActiveData('keterangan', e.target.value)} 
                      placeholder="Masukkan keterangan transaksi..." 
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 resize-none" 
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">JASA KIRIM</label>
                    <select 
                      value={activeSession.data.jasaKirim || 'JNE Regular'} 
                      onChange={(e) => updateActiveData('jasaKirim', e.target.value)} 
                      className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100"
                    >
                      <option value="JNE Regular">JNE Regular</option>
                      <option value="JNE YES">JNE YES</option>
                      <option value="J&T Express">J&T Express</option>
                      <option value="SiCepat">SiCepat</option>
                      <option value="Kargo / Truk">Kargo / Truk</option>
                      <option value="Kurir PPW">Kurir PPW</option>
                      <option value="Self Pickup">Self Pickup (Ambil Sendiri)</option>
                    </select>
                  </div>
                </div>

                {/* Item Transaksi */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400">ITEM TRANSAKSI</label>
                    <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">+ Tambah Produk di bawah</span>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                      <Package size={12} />
                    </div>
                    <input 
                      type="text" 
                      value={wizardProdSearch} 
                      onChange={(e) => setWizardProdSearch(e.target.value)} 
                      placeholder="Cari nama produk / SKU..." 
                      className="w-full pl-8 pr-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100" 
                    />
                  </div>
                  {wizardProdSearch && (
                    <div className="mt-1 max-h-36 overflow-y-auto bg-white dark:bg-zinc-800 border rounded-xl shadow-md divide-y text-[10px]">
                      {effectiveProducts.filter(p => (p.nama || '').toLowerCase().includes(wizardProdSearch.toLowerCase()) || (p.kode || '').toLowerCase().includes(wizardProdSearch.toLowerCase())).slice(0, 6).map(p => (
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

                  {activeSession.data.items && activeSession.data.items.length > 0 ? (
                    <div className="space-y-1.5 border-t pt-2">
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
                  ) : (
                    <div className="p-4 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl text-center text-slate-400 text-[11px] font-medium">
                      Belum ada produk dipilih
                    </div>
                  )}
                </div>

                {/* Ringkasan & PPN / Ongkir */}
                <div className="bg-slate-50/80 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={Boolean(activeSession.data.ppn)} 
                        onChange={(e) => updateActiveData('ppn', e.target.checked)} 
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" 
                      />
                      <span>PPN 11%</span>
                    </label>
                    <span className="text-slate-500">
                      Rp {((activeSession.data.items || []).reduce((s: number, it: any) => s + (it.harga * it.qty), 0) * (activeSession.data.ppn ? 0.11 : 0)).toLocaleString('id-ID')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={Boolean(activeSession.data.ongkir)} 
                        onChange={(e) => updateActiveData('ongkir', e.target.checked)} 
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" 
                      />
                      <span>Biaya Kirim</span>
                    </label>
                    {activeSession.data.ongkir && (
                      <input 
                        type="number" 
                        value={activeSession.data.biayaOngkir || 0} 
                        onChange={(e) => updateActiveData('biayaOngkir', Number(e.target.value))} 
                        placeholder="Nominal Ongkir" 
                        className="w-32 p-1 bg-white dark:bg-zinc-900 border rounded-lg text-xs text-right font-bold" 
                      />
                    )}
                  </div>
                </div>

                <button onClick={handleDirectSaveFromForm} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg mt-2 transition">Simpan Transaksi Sekarang</button>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!inputPrompt && !isListening && (
        <div className="px-3 py-1.5 bg-white dark:bg-zinc-950 flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0 border-t border-slate-100 dark:border-zinc-900">
          {(
            (isSuperAdmin || (currentUser?.role || '').toLowerCase() === 'sales') ? [
              { label: '📞 Followup', action: () => setActiveSession({ type: 'followup', step: 1, data: {} }) },
              { label: '➕ Tugas Baru', action: handleOpenNewTaskModal },
              { label: '🔄 Lanjutkan Task', action: handleOpenUpdateTaskPicker },
              { label: '📊 Analisa Pekerjaan', prompt: 'Analisa pekerjaan saya, berikan urutan prioritas pengerjaan hari ini, tips efisiensi, dan langkah penyelesaian.' },
              { label: 'Tambah Customer', prompt: 'tambah customer baru' },
              { label: 'Transaksi Baru', prompt: 'tambah transaksi baru' },
              { label: 'Tambah Penawaran', prompt: 'tambah penawaran baru' },
              { label: 'Stok Menipis', prompt: 'Stok menipis' }
            ] : [
              { label: '➕ Tugas Baru', action: handleOpenNewTaskModal },
              { label: '🔄 Lanjutkan Task', action: handleOpenUpdateTaskPicker },
              { label: '📊 Analisa Pekerjaan', prompt: 'Analisa pekerjaan saya, berikan urutan prioritas pengerjaan hari ini, tips efisiensi, dan langkah penyelesaian.' }
            ]
          ).map((chip, idx) => (
            <button
              key={idx}
              onClick={() => chip.action ? chip.action() : handleSendMessage(chip.prompt)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-full text-[10px] font-bold text-slate-700 dark:text-zinc-300 whitespace-nowrap shadow-2xs active:scale-95 transition-transform hover:bg-slate-100 dark:hover:bg-zinc-800"
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
