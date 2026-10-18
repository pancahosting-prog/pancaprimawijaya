import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Send, X, Maximize2, Minimize2, Trash2, 
  Copy, Check, RefreshCw, AlertCircle, ShieldCheck, 
  HelpCircle, User, Bot, ArrowRight, CornerDownLeft, 
  Building2, Lock, ExternalLink, CheckCircle2, XCircle, PlusCircle, FilePlus,
  FileSpreadsheet, Download, Settings as SettingsIcon, Key
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabaseService } from '../../task/services/supabaseService';
import { Task, Project, DrivePost } from '../../task/types';
import { detectLackingContext, isConversationalGreeting, getConversationalGreetingResponse } from '../services/pancaAIService';
import { callGeminiWithKeyRotation, getStoredGeminiSettings } from '../services/geminiKeyService';
import { safeSetLocalStorage } from '../lib/apiUtils';

interface UserAccount {
  id: string;
  nama: string;
  username: string;
  role: string;
  companyId?: string;
  company_id?: string;
  permissions?: { id: string; canView: boolean; canEdit: boolean }[];
}

interface Company {
  id: string;
  nama: string;
  kode?: string;
}

interface Transaction {
  id: string;
  noTrx?: string;
  tanggal: string;
  customerName: string;
  sales?: string;
  salesName?: string;
  nilaiProyek?: number;
  total?: number;
  status?: string;
  paymentStatus?: string;
  statuses?: string[];
  companyId?: string;
  company_id?: string;
  createdAt?: string;
  items?: { nama: string; qty: number; harga: number; kode?: string }[];
}

interface Customer {
  id: string;
  nama: string;
  perusahaan?: string;
  whatsapp?: string;
  telepon?: string;
  phone?: string;
  kota?: string;
  leadType?: string;
  pic?: string;
  sales?: string;
  alamat?: string;
  companyId?: string;
  company_id?: string;
  createdAt?: string;
}

interface Product {
  id: string;
  nama: string;
  kode?: string;
  kategori?: string;
  stok?: number;
  minStok?: number;
  satuan?: string;
  hargaJual?: number;
  hpp?: number;
  lots?: { stock: number; hargaJual?: number; hpp?: number }[];
  panjang?: number;
  lebar?: number;
  tinggi?: number;
  berat?: number;
  specifications?: string;
  mainFunction?: string;
  mainApplication?: string;
  remarks?: string;
  deskripsi?: string;
  description?: string;
  companyId?: string;
  company_id?: string;
}

interface Supplier {
  id: string;
  nama: string;
  kode?: string;
  companyId?: string;
  company_id?: string;
}

interface PurchaseOrder {
  id: string;
  noPO?: string;
  noPo?: string;
  tanggalPembelian?: string;
  tanggal?: string;
  supplierName?: string;
  supplierId?: string;
  total?: number;
  status: string;
  items?: { nama: string; jumlah?: number; qty?: number; harga?: number; hpp?: number }[];
  companyId?: string;
  company_id?: string;
}

interface Employee {
  id: string;
  nama: string;
  role: string;
  jabatan?: string;
  whatsapp?: string;
  gaji?: number;
  companyId?: string;
  company_id?: string;
}

export interface GeminiAIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  activeCompany: Company;
  activeCompanyId?: string;
  filterMonth?: string;
  filterYear?: string;
  companies: Company[];
  roleTemplates: Record<string, { id: string; canView: boolean; canEdit: boolean }[]>;
  transactions: Transaction[];
  customers: Customer[];
  products: Product[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  employees: Employee[];
  appUsers?: any[];
  deletedItems?: any[];
  userLogs?: any[];
  setCustomers?: React.Dispatch<React.SetStateAction<Customer[]>>;
  setTransactions?: React.Dispatch<React.SetStateAction<Transaction[]>>;
  setPurchaseOrders?: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  syncToSupabase?: (table: string, data: any) => Promise<any> | void;
  onOpenPancaApp?: () => void;
  onOpenSettings?: () => void;
}

export interface DraftInputData {
  type: 'customer' | 'transaction' | 'penawaran' | 'po' | 'product_spec';
  payload: any;
  isSaved?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  draftData?: DraftInputData;
  isNew?: boolean;
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
    <div className="relative">
      <Markdown remarkPlugins={[remarkGfm]}>
        {displayedText}
      </Markdown>
      {isTyping && (
        <span className="inline-block w-2 h-4 ml-1 bg-indigo-600 dark:bg-indigo-400 animate-pulse rounded-xs align-middle" />
      )}
    </div>
  );
};

export const GeminiAIAssistant: React.FC<GeminiAIAssistantProps> = ({
  isOpen,
  onClose,
  currentUser,
  activeCompany,
  activeCompanyId,
  filterMonth,
  filterYear,
  companies,
  roleTemplates,
  transactions,
  customers,
  products,
  suppliers,
  purchaseOrders,
  employees,
  appUsers = [],
  deletedItems = [],
  userLogs = [],
  setCustomers,
  setTransactions,
  setPurchaseOrders,
  setProducts,
  syncToSupabase,
  onOpenPancaApp,
  onOpenSettings
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('mypanca_gemini_ai_chat');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<{
    type: 'customer' | 'transaction' | 'penawaran' | 'product_spec' | 'product_spec_prompt';
    step: number;
    data: Record<string, any>;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isSuperAdmin = currentUser?.role?.toLowerCase() === 'superadmin';
  const userCompanyId = currentUser?.companyId || currentUser?.company_id || activeCompany?.id || '1';

  // Task App state for SuperAdmin
  const [taskAppData, setTaskAppData] = useState<{
    tasks: Task[];
    projects: Project[];
    drivePosts: DrivePost[];
  }>({ tasks: [], projects: [], drivePosts: [] });

  // Fetch Task App data for SuperAdmin when AI assistant is opened
  useEffect(() => {
    if (isOpen && isSuperAdmin) {
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
          console.warn("Failed fetching Task App data for AI Assistant:", e);
        }
      };
      loadTaskAppData();
      return () => { isMounted = false; };
    }
  }, [isOpen, isSuperAdmin]);

  // Save conversation to local storage
  useEffect(() => {
    safeSetLocalStorage('mypanca_gemini_ai_chat', JSON.stringify(messages.slice(-50)));
  }, [messages]);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToBottom, 100);
    }
  }, [isOpen, messages, isLoading]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Quick suggestions based on role
  const quickSuggestions = [
    { title: "Ringkas Omzet Bisnis", desc: "Berapa total transaksi & omzet yang berhasil dibukukan?", prompt: "Tolong buatkan ringkasan omzet dan performa penjualan saat ini." },
    { title: "Cek Stok Menipis", desc: "Produk apa saja yang stoknya di bawah batas aman?", prompt: "Cek produk apa saja yang stoknya menipis dan butuh di-restock." },
    { title: "Status Follow-Up Penawaran", desc: "Berapa penawaran yang masih tahap follow-up?", prompt: "Bagaimana status penawaran yang sedang berjalan dan perlu di-follow up?" },
    { title: "Customer Paling Aktif", desc: "Siapa saja pelanggan yang paling sering bertransaksi?", prompt: "Tampilkan pelanggan yang paling aktif dan ringkasan riwayat pembeliannya." }
  ];

  // Helper permission
  const canView = (permId: string) => {
    if (isSuperAdmin) return true;
    if (!currentUser) return false;
    const perm = currentUser.permissions?.find(p => p.id === permId);
    if (perm !== undefined) return perm.canView;
    const tpl = roleTemplates[currentUser.role];
    const rolePerm = tpl?.find(p => p.id === permId);
    if (rolePerm !== undefined) return rolePerm.canView;
    return false;
  };

  // Helper to extract actual transaction revenue
  const getTrxAmount = (t: any): number => {
    if (typeof t.nilaiProyek === 'number' && !isNaN(t.nilaiProyek) && t.nilaiProyek > 0) return t.nilaiProyek;
    if (typeof t.total === 'number' && !isNaN(t.total) && t.total > 0) return t.total;
    if (Array.isArray(t.items) && t.items.length > 0) {
      return t.items.reduce((sum: number, it: any) => sum + ((Number(it.harga) || 0) * (Number(it.qty) || 1)), 0);
    }
    return 0;
  };

  // Helper date parsing (supports YYYY-MM-DD, DD/MM/YYYY, Indonesian text dates, timestamps, excel numbers, etc.)
  const parseDateInfo = (dateStr: any) => {
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    if (!dateStr) return { year: 'Unknown', month: 'Unknown', monthName: 'Unknown', key: 'Unknown', sortKey: '0000-00' };

    // If number (timestamp or excel serial)
    if (typeof dateStr === "number" || (!isNaN(Number(dateStr)) && Number(dateStr) > 10000 && !String(dateStr).includes("-") && !String(dateStr).includes("/"))) {
      const num = Number(dateStr);
      let d: Date;
      if (num < 100000) {
        d = new Date((num - 25569) * 86400 * 1000);
      } else {
        d = new Date(num);
      }
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear().toString();
        const m = d.getMonth() + 1;
        const mStr = m.toString().padStart(2, '0');
        const mName = monthNames[m - 1] || 'Unknown';
        return { year: y, month: mStr, monthName: mName, key: `${mName} ${y}`, sortKey: `${y}-${mStr}` };
      }
    }

    const s = String(dateStr).trim();
    const lower = s.toLowerCase();

    // Check textual Indonesian month name
    for (let idx = 0; idx < monthNames.length; idx++) {
      const mName = monthNames[idx];
      const enPrefix = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][idx];
      if (lower.includes(mName.toLowerCase()) || lower.includes(enPrefix)) {
        const yMatch = s.match(/\b(20\d{2})\b/);
        const y = yMatch ? yMatch[1] : (new Date().getFullYear().toString());
        const m = (idx + 1).toString().padStart(2, '0');
        return { year: y, month: m, monthName: mName, key: `${mName} ${y}`, sortKey: `${y}-${m}` };
      }
    }

    // Check YYYY-MM-DD or ISO
    const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/]?(\d{1,2})?/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = parseInt(isoMatch[2], 10);
      if (m >= 1 && m <= 12) {
        const mStr = m.toString().padStart(2, '0');
        const mName = monthNames[m - 1] || 'Unknown';
        return { year: y, month: mStr, monthName: mName, key: `${mName} ${y}`, sortKey: `${y}-${mStr}` };
      }
    }

    // Check DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      const y = dmyMatch[3];
      const m = parseInt(dmyMatch[2], 10);
      if (m >= 1 && m <= 12) {
        const mStr = m.toString().padStart(2, '0');
        const mName = monthNames[m - 1] || 'Unknown';
        return { year: y, month: mStr, monthName: mName, key: `${mName} ${y}`, sortKey: `${y}-${mStr}` };
      }
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear().toString();
      const m = d.getMonth() + 1;
      const mStr = m.toString().padStart(2, '0');
      const mName = monthNames[m - 1];
      return { year: y, month: mStr, monthName: mName, key: `${mName} ${y}`, sortKey: `${y}-${mStr}` };
    }

    return { year: 'Unknown', month: 'Unknown', monthName: 'Unknown', key: 'Unknown', sortKey: '0000-00' };
  };

  // Compile strictly filtered and compact real-time data across ALL MENUS
  const compileAggregations = (queryText: string = '') => {
    const currentCompId = activeCompanyId || activeCompany?.id || '1';

    // 1. Company Scope (for Dashboard KPI card alignment)
    const compCustomers = customers.filter(c => (c.companyId || c.company_id || '1') === currentCompId);
    const compProducts = products.filter(p => (p.companyId || p.company_id || '1') === currentCompId);
    const compTransactions = transactions.filter(t => (t.companyId || '1') === currentCompId);
    const compSuppliers = suppliers.filter(s => (s.companyId || s.company_id || '1') === currentCompId);
    const compPOs = purchaseOrders.filter(po => (po.companyId || po.company_id || '1') === currentCompId);
    const compEmployees = employees.filter(e => (e.companyId || e.company_id || '1') === currentCompId);

    // Calculate exact available stock for company matching App.tsx line 2893-2911
    const compSoldMap: Record<string, number> = {};
    compTransactions
      .filter(t => ['Pengiriman', 'Selesai'].includes(t.status))
      .forEach(t => {
        t.items?.forEach(item => {
          compSoldMap[item.nama] = (compSoldMap[item.nama] || 0) + item.qty;
        });
      });

    const getCompAvailStock = (productName: string) => {
      const prod = compProducts.find(p => p.nama === productName);
      if (!prod) return 0;
      const incoming = prod.lots ? prod.lots.reduce((acc, lot) => acc + lot.stock, 0) : (prod.stok || 0);
      const sold = compSoldMap[productName] || 0;
      return Math.max(0, incoming - sold);
    };

    const compLowStockProducts = compProducts.filter(p => getCompAvailStock(p.nama) < 10);

    // 2. Allowed lists based on Superadmin status
    const allowedTransactions = isSuperAdmin ? transactions : compTransactions;
    const allowedCustomers = isSuperAdmin ? customers : compCustomers;
    const allowedProducts = isSuperAdmin ? products : compProducts;
    const allowedSuppliers = isSuperAdmin ? suppliers : compSuppliers;
    const allowedPOs = isSuperAdmin ? purchaseOrders : compPOs;
    const allowedEmployees = isSuperAdmin ? employees : compEmployees;
    const allowedAppUsers = isSuperAdmin ? appUsers : appUsers.filter(u => (u.companyId || '1') === currentCompId);
    const allowedDeletedItems = isSuperAdmin ? deletedItems : deletedItems.filter(d => (d.companyId || '1') === currentCompId);

    // Permission check for each menu/module
    const canViewBRM = canView('Dashboard') || canView('Contacts') || canView('Penawaran') || isSuperAdmin;
    const canViewTrade = canView('Transaksi') || canView('Invoice') || canView('Pembayaran') || isSuperAdmin;
    const canViewPurchasing = canView('Produk') || canView('stocklist_produk') || canView('purchasing_produk') || canView('Suppliers') || canView('Purchase Orders') || isSuperAdmin;
    const canViewFinance = canView('Buku Besar') || canView('Jurnal') || canView('Hutang') || canView('Piutang') || isSuperAdmin;
    const canViewHR = canView('Employees') || canView('Skills') || canView('KPI') || isSuperAdmin;
    const canViewAdmin = canView('Users') || canView('Access Control') || canView('Recycle Bin') || isSuperAdmin;

    // 3. Multi-Menu Rich Aggregations
    const monthlyData: Record<string, {
      totalTrx: number;
      omzet: number; // Omzet Real Deal (EXCLUDES Penawaran & Pesanan Batal)
      nilaiPenawaran: number; // Potential Quote Value
      nilaiBatal: number; // Canceled Value
      sortKey: string;
      statusBreakdown: Record<string, { count: number; revenue: number }>;
      paymentStatusBreakdown: Record<string, { count: number; revenue: number }>;
      productSales: Record<string, { qty: number; revenue: number }>;
      topCustomers: Record<string, number>;
      trxList: { noTrx: string; customer: string; tanggal: string; total: number; status: string; paymentStatus?: string; sales?: string }[];
    }> = {};

    const soldQuantities: Record<string, { qty: number; revenue: number }> = {};
    let totalOmzetReal = 0; // Omzet Real Deal
    let totalOmzetLunas = 0;
    let totalNilaiPenawaran = 0; // Total Penawaran Berjalan
    let totalNilaiBatal = 0; // Total Transaksi Dibatalkan
    let totalAllRevenue = 0;

    const tradeStatusCounts: Record<string, number> = {};
    const salesPerformance: Record<string, { trxCount: number; omzet: number }> = {};
    const customerSpendMap: Record<string, { totalSpend: number; trxCount: number; lastTrx: string }> = {};

    let totalPiutangAmount = 0;
    let totalPiutangInvoices = 0;
    const unpaidInvoicesList: { noTrx: string; customer: string; tanggal: string; total: number; sisa: number; sales?: string }[] = [];

    let ppnTrxCount = 0;
    let nonPpnTrxCount = 0;
    let ppnEstimatedValue = 0;
    let ongkirTrxCount = 0;
    let totalOngkirValue = 0;

    // Quotes / Penawaran tally (BRM)
    let totalQuotes = 0;
    let followedUpQuotes = 0;
    const quoteList: { noTrx: string; customer: string; tanggal: string; total: number; followedUp: boolean; sales?: string }[] = [];

    allowedTransactions.forEach(t => {
      const amt = getTrxAmount(t);
      totalAllRevenue += amt;

      const statuses = t.statuses && t.statuses.length > 0 ? t.statuses : [t.status || 'Draft'];
      const isQuote = statuses.includes('Penawaran') || t.status === 'Penawaran';
      const isCanceled = statuses.includes('Pesanan Batal') || t.status === 'Pesanan Batal';
      const isRealDeal = !isQuote && !isCanceled;

      if (isRealDeal) {
        totalOmzetReal += amt;
        const isCompleted = statuses.some(s => ['Selesai', 'Lunas', 'Payment', 'Pengiriman', 'Progress'].includes(s));
        if (isCompleted) {
          totalOmzetLunas += amt;
        }
      } else if (isQuote) {
        totalNilaiPenawaran += amt;
      } else if (isCanceled) {
        totalNilaiBatal += amt;
      }

      statuses.forEach(s => {
        tradeStatusCounts[s] = (tradeStatusCounts[s] || 0) + 1;
      });

      // Sales performance breakdown
      const sName = t.sales || t.salesName || 'Unassigned';
      if (!salesPerformance[sName]) salesPerformance[sName] = { trxCount: 0, omzet: 0 };
      salesPerformance[sName].trxCount += 1;
      if (isRealDeal) salesPerformance[sName].omzet += amt;

      // Customer ranking
      if (t.customerName && isRealDeal) {
        if (!customerSpendMap[t.customerName]) {
          customerSpendMap[t.customerName] = { totalSpend: 0, trxCount: 0, lastTrx: t.tanggal };
        }
        customerSpendMap[t.customerName].totalSpend += amt;
        customerSpendMap[t.customerName].trxCount += 1;
        if (t.tanggal && t.tanggal > customerSpendMap[t.customerName].lastTrx) {
          customerSpendMap[t.customerName].lastTrx = t.tanggal;
        }
      }

      // Finance: Piutang (unpaid invoices)
      const isUnpaid = isRealDeal && ((typeof (t as any).sisaPembayaran === 'number' && (t as any).sisaPembayaran > 0) || statuses.includes('Belum Lunas') || statuses.includes('Invoice'));
      if (isUnpaid) {
        const sisa = typeof (t as any).sisaPembayaran === 'number' && (t as any).sisaPembayaran > 0 ? (t as any).sisaPembayaran : amt;
        totalPiutangInvoices += 1;
        totalPiutangAmount += sisa;
        unpaidInvoicesList.push({
          noTrx: t.noTrx || t.id,
          customer: t.customerName || 'Pelanggan',
          tanggal: t.tanggal || '-',
          total: amt,
          sisa,
          sales: t.sales
        });
      }

      // PPN & Ongkir
      if ((t as any).ppn) {
        ppnTrxCount++;
        ppnEstimatedValue += (amt * 0.11);
      } else {
        nonPpnTrxCount++;
      }

      if ((t as any).ongkir) {
        ongkirTrxCount++;
        totalOngkirValue += (Number((t as any).biayaOngkir) || 0);
      }

      // BRM: Quotes / Penawaran
      if (isQuote) {
        totalQuotes++;
        const hasFollowUp = Array.isArray((t as any).followUps) && (t as any).followUps.length > 0;
        if (hasFollowUp) followedUpQuotes++;
        quoteList.push({
          noTrx: t.noTrx || t.id,
          customer: t.customerName || 'Pelanggan',
          tanggal: t.tanggal || '-',
          total: amt,
          followedUp: hasFollowUp,
          sales: t.sales
        });
      }

      // Chronological Monthly Aggregation
      const dateInfo = parseDateInfo(t.tanggal);
      const periodKey = dateInfo.key;
      if (!monthlyData[periodKey]) {
        monthlyData[periodKey] = {
          totalTrx: 0,
          omzet: 0,
          nilaiPenawaran: 0,
          nilaiBatal: 0,
          sortKey: dateInfo.sortKey,
          statusBreakdown: {},
          paymentStatusBreakdown: {},
          productSales: {},
          topCustomers: {},
          trxList: []
        };
      }
      monthlyData[periodKey].totalTrx += 1;

      if (isRealDeal) {
        monthlyData[periodKey].omzet += amt;
      } else if (isQuote) {
        monthlyData[periodKey].nilaiPenawaran += amt;
      } else if (isCanceled) {
        monthlyData[periodKey].nilaiBatal += amt;
      }

      // Status Breakdown per month
      statuses.forEach(st => {
        if (!monthlyData[periodKey].statusBreakdown[st]) {
          monthlyData[periodKey].statusBreakdown[st] = { count: 0, revenue: 0 };
        }
        monthlyData[periodKey].statusBreakdown[st].count += 1;
        monthlyData[periodKey].statusBreakdown[st].revenue += amt;
      });

      // Payment Status Breakdown per month
      const pStatus = isQuote ? 'Penawaran' : isCanceled ? 'Batal' : (t.paymentStatus || (statuses.includes('Selesai') ? 'Lunas' : 'Belum Lunas'));
      if (!monthlyData[periodKey].paymentStatusBreakdown[pStatus]) {
        monthlyData[periodKey].paymentStatusBreakdown[pStatus] = { count: 0, revenue: 0 };
      }
      monthlyData[periodKey].paymentStatusBreakdown[pStatus].count += 1;
      monthlyData[periodKey].paymentStatusBreakdown[pStatus].revenue += amt;

      monthlyData[periodKey].trxList.push({
        noTrx: t.noTrx || t.id,
        customer: t.customerName || 'Pelanggan',
        tanggal: t.tanggal || '-',
        total: amt,
        status: statuses.join(', '),
        paymentStatus: pStatus,
        sales: t.sales || 'Unassigned'
      });

      if (t.customerName && isRealDeal) {
        monthlyData[periodKey].topCustomers[t.customerName] = (monthlyData[periodKey].topCustomers[t.customerName] || 0) + amt;
      }

      if (isRealDeal) {
        (t.items || []).forEach(it => {
          const pName = it.nama?.trim();
          if (pName) {
            const pQty = Number(it.qty) || 1;
            const pRev = (Number(it.harga) || 0) * pQty;

            if (!soldQuantities[pName]) soldQuantities[pName] = { qty: 0, revenue: 0 };
            soldQuantities[pName].qty += pQty;
            soldQuantities[pName].revenue += pRev;

            if (!monthlyData[periodKey].productSales[pName]) {
              monthlyData[periodKey].productSales[pName] = { qty: 0, revenue: 0 };
            }
            monthlyData[periodKey].productSales[pName].qty += pQty;
            monthlyData[periodKey].productSales[pName].revenue += pRev;
          }
        });
      }
    });

    // 4. Purchasing: PO and Supplier totals
    let totalPOAmount = 0;
    let totalHutangAmount = 0;
    const poStatusCounts: Record<string, number> = {};
    const poList: { noPO: string; supplier: string; tanggal: string; total: number; status: string }[] = [];

    allowedPOs.forEach(po => {
      const amt = Number(po.total) || 0;
      totalPOAmount += amt;
      const st = po.status || 'Draft';
      poStatusCounts[st] = (poStatusCounts[st] || 0) + 1;
      if (st !== 'Lunas') {
        totalHutangAmount += amt;
      }
      poList.push({
        noPO: po.noPO || po.noPo || po.id,
        supplier: po.supplierName || 'Supplier',
        tanggal: po.tanggalPembelian || po.tanggal || '-',
        total: amt,
        status: st
      });
    });

    // 5. Global Products Stock Status
    let totalStockValuation = 0;
    const processedProducts = allowedProducts.map(p => {
      let incoming = 0;
      if (Array.isArray(p.lots) && p.lots.length > 0) {
        incoming = p.lots.reduce((acc, lot) => acc + (Number(lot.stock) || 0), 0);
      } else if (typeof p.stok === 'number') {
        incoming = p.stok;
      }
      const sold = soldQuantities[p.nama]?.qty || 0;
      const available = Math.max(0, incoming - sold);
      const minStok = p.minStok || 10;
      const price = Number(p.hargaJual) || 0;
      totalStockValuation += (available * price);
      return {
        ...p,
        incoming,
        sold,
        availableStock: available,
        minStok,
        isLow: available < 10
      };
    });
    const lowStockProducts = processedProducts.filter(p => p.isLow);

    // 6. Customer Leads breakdown
    const leadTypeCounts: Record<string, number> = {};
    allowedCustomers.forEach(c => {
      const lt = c.leadType || 'Belum Transaksi';
      leadTypeCounts[lt] = (leadTypeCounts[lt] || 0) + 1;
    });

    // Chronologically sorted monthly entries
    const chronologicalMonthlyEntries = Object.entries(monthlyData)
      .sort((a, b) => b[1].sortKey.localeCompare(a[1].sortKey));

    return {
      currentCompId,
      compCustomerCount: compCustomers.length,
      globalCustomerCount: customers.length,
      compProductCount: compProducts.length,
      globalProductCount: products.length,
      compLowStockCount: compLowStockProducts.length,
      compLowStockProducts,
      getCompAvailStock,
      allowedTransactions,
      allowedCustomers,
      allowedProducts: processedProducts,
      allowedSuppliers,
      allowedPOs,
      allowedEmployees,
      allowedAppUsers,
      allowedDeletedItems,
      canViewBRM,
      canViewTrade,
      canViewPurchasing,
      canViewFinance,
      canViewHR,
      canViewAdmin,
      monthlyData,
      chronologicalMonthlyEntries,
      soldQuantities,
      totalOmzetReal,
      totalOmzetLunas,
      totalNilaiPenawaran,
      totalNilaiBatal,
      totalAllRevenue,
      tradeStatusCounts,
      salesPerformance,
      customerSpendMap,
      totalPiutangAmount,
      totalPiutangInvoices,
      unpaidInvoicesList,
      ppnTrxCount,
      nonPpnTrxCount,
      ppnEstimatedValue,
      ongkirTrxCount,
      totalOngkirValue,
      totalQuotes,
      followedUpQuotes,
      quoteList,
      totalPOAmount,
      totalHutangAmount,
      poStatusCounts,
      poList,
      lowStockProducts,
      totalStockValuation,
      leadTypeCounts
    };
  };

  const generateDataDigest = (queryText: string = ''): string => {
    const agg = compileAggregations(queryText);
    const lowerQuery = queryText.toLowerCase();

    let digest = `=== METRIK KUNCI DASHBOARD REAL-TIME ===
- Perusahaan Aktif: ${activeCompany.nama} (ID: ${agg.currentCompId})
- Total Customer di Perusahaan Aktif: ${agg.compCustomerCount} Pelanggan (Sesuai Kartu Dashboard "Total Customer")
- Total Customer Global (Seluruh Perusahaan): ${agg.globalCustomerCount} Pelanggan
- Stok Menipis di Perusahaan Aktif: ${agg.compLowStockCount} SKU dengan stok < 10 unit (Sesuai Kartu Dashboard "Stok Menipis")
- Total Produk di Perusahaan Aktif: ${agg.compProductCount} SKU (Global: ${agg.globalProductCount} SKU)
- Total Transaksi: ${agg.allowedTransactions.length} | Omzet Selesai: Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')}

=== DATA TERBACA LENGKAP SEMUA 9 MENU APLIKASI MYPANCA ===

[MENU 1: DASHBOARD KPI CARD]
* Total Customer: ${agg.compCustomerCount} (Kartu KPI Aktif) | ${agg.globalCustomerCount} (Global)
* Stok Menipis: ${agg.compLowStockCount} SKU (< 10 unit)
* Total Transaksi Selesai: ${agg.tradeStatusCounts['Selesai'] || 0} Trx | Omzet: Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')}

[MENU 2: BRM - CONTACTS / CUSTOMER]
* Total Kontak: ${agg.compCustomerCount} di perusahaan ini (${agg.globalCustomerCount} global)
* Kategori Lead: ${Object.entries(agg.leadTypeCounts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'N/A'}
* DAFTAR LENGKAP CONTAKS / PELANGGAN TERDAFTAR:
${agg.allowedCustomers.map(c => `  - ${c.nama} (Perusahaan: ${c.perusahaan || '-'}, PIC: ${c.pic || '-'}, Lead: ${c.leadType || '-'}, Kota: ${c.kota || '-'}, Sales: ${c.sales || '-'}, Telp/WA: ${c.whatsapp || c.phone || '-'}, Alamat: ${c.alamat || '-'})`).join('\n') || '  (Tidak ada kontak)'}

[MENU 3: BRM - PENAWARAN (QUOTATIONS) - TIDAK MASUK OMZET]
* Total Penawaran: ${agg.totalQuotes} penawaran (${agg.followedUpQuotes} di-follow up, ${agg.totalQuotes - agg.followedUpQuotes} belum follow-up)
* Total Nilai Penawaran Berjalan: Rp ${agg.totalNilaiPenawaran.toLocaleString('id-ID')} (*Hanya Prospek/Quotation - BUKAN OMZET REAL*)
* Daftar Penawaran Terbaru:
${agg.quoteList.slice(0, 10).map(q => `  - ${q.noTrx} | ${q.customer} | Tanggal: ${q.tanggal} | Rp ${q.total.toLocaleString('id-ID')} | Status Follow-Up: ${q.followedUp ? 'Sudah Follow-Up' : 'Menunggu Follow-Up'} (Nilai Penawaran Berjalan)`).join('\n') || '  (Tidak ada penawaran aktif)'}

[MENU 4: TRADE - TRANSAKSI REAL, PIPELINE & SALES]
* Total Transaksi Real (Non-Penawaran, Non-Batal): ${agg.allowedTransactions.filter(t => !['Penawaran', 'Pesanan Batal'].includes(t.status || '')).length} transaksi (Omzet Penjualan Real: Rp ${agg.totalOmzetReal.toLocaleString('id-ID')}, Omzet Selesai/Lunas: Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')})
* Catatan Penting Omzet: OMZET PENJUALAN HANYA MENGHITUNG TRANSAKSI DEAL/SELESAI. PENAWARAN & PESANAN BATAL DIPISAHKAN & TIDAK MASUK OMZET.
* Status Transaksi Pipeline: ${Object.entries(agg.tradeStatusCounts).map(([k, v]) => `${k}: ${v}`).join(' | ')}
* Performa Sales Tim (Omzet Real Deals & Trx):
${Object.entries(agg.salesPerformance).map(([s, d]) => `  * ${s}: ${d.trxCount} transaksi | Omzet Real: Rp ${d.omzet.toLocaleString('id-ID')}`).join('\n')}
* Top Pelanggan Transaksi Terbesar (Omzet Real):
${Object.entries(agg.customerSpendMap).sort((a, b) => b[1].totalSpend - a[1].totalSpend).slice(0, 5).map(([cName, d]) => `  * ${cName}: ${d.trxCount} trx | Total Belanja: Rp ${d.totalSpend.toLocaleString('id-ID')}`).join('\n')}

[MENU 5: STOCKLIST & PURCHASING - PRODUK & STOK FISIK]
* Total SKU: ${agg.compProductCount} SKU (${agg.globalProductCount} global) | Valuasi Inventaris: ~Rp ${agg.totalStockValuation.toLocaleString('id-ID')}
* Stok Menipis (< 10 unit - ${agg.compLowStockCount} SKU):
${agg.compLowStockProducts.slice(0, 6).map(p => `  * ${p.nama}: sisa ${agg.getCompAvailStock(p.nama)} ${p.satuan || 'unit'} (Min: ${p.minStok || 10})`).join('\n') || '  * Stok aman'}
* Produk Terlaris All-Time:
${Object.entries(agg.soldQuantities).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5).map(([pName, d], i) => `  ${i + 1}. ${pName}: ${d.qty} unit (Rp ${d.revenue.toLocaleString('id-ID')})`).join('\n')}

[MENU 6: PURCHASING - SUPPLIER & PURCHASE ORDER (PO)]
* Total Supplier: ${agg.allowedSuppliers.length} vendor
${agg.allowedSuppliers.slice(0, 6).map(s => `  * ${s.nama} (Kode: ${s.kode || '-'})`).join('\n')}
* Total PO: ${agg.allowedPOs.length} PO | Total Nilai PO: Rp ${agg.totalPOAmount.toLocaleString('id-ID')}
* Status PO: ${Object.entries(agg.poStatusCounts).map(([k, v]) => `${k}: ${v}`).join(' | ')}
${agg.poList.slice(0, 5).map(po => `  * PO ${po.noPO}: ${po.supplier} (${po.tanggal}) - Rp ${po.total.toLocaleString('id-ID')} [${po.status}]`).join('\n')}

[MENU 7: FINANCE - KEUANGAN, PIUTANG, HUTANG, PPN, ONGKIR]
* Piutang Usaha (Invoice Belum Lunas Customer): Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.totalPiutangInvoices} tagihan)
${agg.unpaidInvoicesList.slice(0, 5).map(u => `  * ${u.noTrx} - ${u.customer}: Sisa Rp ${u.sisa.toLocaleString('id-ID')} (${u.tanggal})`).join('\n') || '  * Tidak ada piutang tertunggak'}
* Hutang Usaha (PO Belum Lunas Supplier): Rp ${agg.totalHutangAmount.toLocaleString('id-ID')}
* Transaksi PPN: ${agg.ppnTrxCount} Trx (Estimasi PPN 11%: Rp ${agg.ppnEstimatedValue.toLocaleString('id-ID')}) | Non-PPN: ${agg.nonPpnTrxCount} Trx
* Transaksi Ongkos Kirim: ${agg.ongkirTrxCount} Trx (Total Ongkir: Rp ${agg.totalOngkirValue.toLocaleString('id-ID')})

[MENU 8: HR - KARYAWAN & JABATAN]
* Total Karyawan: ${agg.allowedEmployees.length} staf terdaftar
${agg.allowedEmployees.map(e => `  * ${e.nama} - Jabatan: ${e.role}${isSuperAdmin && e.gaji ? ` | Gaji: Rp ${e.gaji.toLocaleString('id-ID')}` : ''} | WA: ${e.whatsapp || '-'}`).join('\n')}

[MENU 9: ADMIN & CONTROL PANEL]
* Pengguna Sistem Login: ${agg.allowedAppUsers.map(u => `${u.nama} (${u.role})`).join(', ')}
* Item Recycle Bin: ${agg.allowedDeletedItems.length} item terhapus sementara

=== REKAP PENJUALAN LENGKAP SEMUA BULAN (KRONOLOGIS TERBARU) ===
${agg.chronologicalMonthlyEntries.map(([period, data]) => {
  const topProd = Object.entries(data.productSales).sort((a, b) => b[1].qty - a[1].qty)[0];
  const topStr = topProd ? ` | Top: ${topProd[0]} (${topProd[1].qty} unit - Rp ${topProd[1].revenue.toLocaleString('id-ID')})` : '';
  const statusStr = Object.entries(data.statusBreakdown).map(([s, d]) => `${s}: ${d.count} Trx (Rp ${d.revenue.toLocaleString('id-ID')})`).join(', ');
  
  const salesMap: Record<string, { count: number; rev: number }> = {};
  data.trxList.forEach(item => {
    const sName = item.sales || 'Unassigned';
    if (!salesMap[sName]) salesMap[sName] = { count: 0, rev: 0 };
    salesMap[sName].count += 1;
    if (!item.status.includes('Penawaran') && !item.status.includes('Pesanan Batal')) {
      salesMap[sName].rev += item.total;
    }
  });
  const salesStr = Object.entries(salesMap).map(([s, d]) => `${s}: ${d.count} trx (Rp ${d.rev.toLocaleString('id-ID')})`).join(' | ');

  return `- ${period}: ${data.totalTrx} Transaksi Real Deals | Omzet Real: Rp ${data.omzet.toLocaleString('id-ID')} | Sales Breakdown: [${salesStr}] | Penawaran Berjalan: Rp ${data.nilaiPenawaran.toLocaleString('id-ID')} (*TIDAK TERMASUK OMZET*) | Status: [${statusStr || 'N/A'}]${topStr}`;
}).join('\n')}
`;

    // Dynamic Entity Keyword Match Search in Data Digest
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length > 0) {
      const matchedCustList = agg.allowedCustomers.filter(c => {
        const full = `${c.nama || ''} ${c.perusahaan || ''} ${c.pic || ''} ${c.kota || ''}`.toLowerCase();
        return queryWords.some(tok => full.includes(tok));
      });

      if (matchedCustList.length > 0) {
        digest += `\n=== ENTITAS PELANGGAN COCOK DENGAN PENCARIAN "${queryText}": ===\n`;
        matchedCustList.forEach(c => {
          digest += `* PELANGGAN TERDAFTAR: ${c.nama} (Perusahaan: ${c.perusahaan || '-'}, PIC: ${c.pic || '-'}) | Lead: ${c.leadType || 'Aktif'} | Kota: ${c.kota || '-'} | WA: ${c.whatsapp || c.phone || '-'} | Sales: ${c.sales || '-'}\n`;
          const cTrx = agg.allowedTransactions.filter(t => (t.customerName || '').toLowerCase().includes(c.nama.toLowerCase()) || (c.nama || '').toLowerCase().includes((t.customerName || '').toLowerCase()));
          cTrx.forEach(t => {
            const isQ = (t.statuses || [t.status]).includes('Penawaran') || t.status === 'Penawaran';
            digest += `  - Trx/Penawaran ID: ${t.noTrx || t.id} (${t.tanggal}) - Rp ${getTrxAmount(t).toLocaleString('id-ID')} | Status: [${t.status}] ${isQ ? '(PENAWARAN BERJALAN - BUKAN OMZET)' : '(OMZET PENJUALAN DEAL)'}\n`;
          });
        });
      }

      const matchedProdList = (products || []).filter(p => {
        const full = `${p.nama || ''} ${p.kode || ''} ${p.kategori || ''} ${p.deskripsi || (p as any).description || ''}`.toLowerCase();
        return queryWords.some(tok => full.includes(tok));
      });

      if (matchedProdList.length > 0) {
        digest += `\n=== ENTITAS PRODUK COCOK DENGAN PENCARIAN "${queryText}": ===\n`;
        matchedProdList.forEach(p => {
          const availStock = agg.getCompAvailStock(p.nama);
          digest += `* PRODUK TERDAFTAR: ${p.nama} (Kode: ${p.kode || '-'}) | Kategori: ${p.kategori || 'Umum'} | Stok Tersedia: ${availStock} ${p.satuan || 'Unit'} | Harga Jual: Rp ${(p.hargaJual || 0).toLocaleString('id-ID')} | HPP: Rp ${(p.hpp || 0).toLocaleString('id-ID')} | Deskripsi: ${p.deskripsi || (p as any).description || '-'}\n`;
        });
      }

      const matchedTrxList = agg.allowedTransactions.filter(t => {
        const noTrxStr = (t.noTrx || t.id || '').toLowerCase();
        const noTrxClean = noTrxStr.replace(/[^a-z0-9]/g, '');
        const custName = (t.customerName || t.customer || '').toLowerCase();
        return queryWords.some(tok => {
          const tokClean = tok.replace(/[^a-z0-9]/g, '');
          return noTrxStr.includes(tok) || 
                 (tokClean.length >= 2 && noTrxClean.includes(tokClean)) ||
                 custName.includes(tok);
        });
      });

      if (matchedTrxList.length > 0) {
        digest += `\n=== ENTITAS TRANSAKSI & PENAWARAN COCOK DENGAN PENCARIAN "${queryText}": ===\n`;
        matchedTrxList.forEach(t => {
          const amt = getTrxAmount(t);
          const itemsStr = (t.items || []).map((it: any) => `${it.nama || it.productName} (${it.qty} unit @ Rp ${(it.harga || 0).toLocaleString('id-ID')})`).join(', ');
          digest += `* TRANSAKSI MATCH: [${t.noTrx || t.id}] Tanggal: ${t.tanggal} | Pelanggan: ${t.customerName || t.customer} | Total Nominal: Rp ${amt.toLocaleString('id-ID')} | Status Pesanan: ${t.status} | Status Pembayaran: ${t.paymentStatus} | Sales Rep: ${t.sales || t.salesName || '-'} | Item Produk: ${itemsStr || '-'}\n`;
        });
      }
    }

    // Detect month focus (Agustus, September, etc.)
    const monthFocusObj = getMatchedMonthObject(lowerQuery);

    if (monthFocusObj) {
      const matchedMonthName = monthFocusObj.name.toLowerCase();
      const matching = agg.chronologicalMonthlyEntries.filter(([p]) => p.toLowerCase().includes(matchedMonthName) || p.toLowerCase().includes(monthFocusObj.key));
      if (matching.length > 0) {
        digest += `\n=== DETAIL KHUSUS BULAN ${monthFocusObj.name.toUpperCase()} (BERDASARKAN STATUS TRANSAKSI & PEMBAYARAN) ===\n`;
        matching.forEach(([pKey, m]) => {
          const statusList = Object.entries(m.statusBreakdown)
            .map(([st, d]) => `  - Status ${st}: ${d.count} transaksi (Total Rp ${d.revenue.toLocaleString('id-ID')})`)
            .join('\n');
          const payList = Object.entries(m.paymentStatusBreakdown)
            .map(([pst, d]) => `  - Pembayaran ${pst}: ${d.count} transaksi (Total Rp ${d.revenue.toLocaleString('id-ID')})`)
            .join('\n');
          const topList = Object.entries(m.productSales)
            .sort((a, b) => b[1].qty - a[1].qty || b[1].revenue - a[1].revenue)
            .slice(0, 10)
            .map(([pName, pData], idx) => `  ${idx + 1}. ${pName}: ${pData.qty} unit terjual | Omzet Rp ${pData.revenue.toLocaleString('id-ID')}`)
            .join('\n');
          const sampleTrx = m.trxList.slice(0, 8).map(tx => `  - ${tx.noTrx} | ${tx.customer} | Rp ${tx.total.toLocaleString('id-ID')} | Status: ${tx.status} | Bayar: ${tx.paymentStatus}`).join('\n');
          digest += `* Periode: ${pKey} (${m.totalTrx} transaksi real deals, Omzet Real: Rp ${m.omzet.toLocaleString('id-ID')}, Penawaran Berjalan: Rp ${m.nilaiPenawaran.toLocaleString('id-ID')} *TIDAK MASUK OMZET*):\n` +
                    `* RINCIAN STATUS PESANAN (MANDATORY TO SEPARATE):\n${statusList || '  - Tidak ada data status'}\n` +
                    `* RINCIAN STATUS PEMBAYARAN:\n${payList || '  - Tidak ada data pembayaran'}\n` +
                    `* PRODUK TERLARIS BULAN INI:\n${topList || '  (Tidak ada item)'}\n` +
                    `* DAFTAR TRANSAKSI BULAN INI:\n${sampleTrx || '  (Tidak ada list)'}\n`;
        });
      }
    }

    // Add Strategy & Business Action Plan digest section
    digest += `\n=== REKAP REKOMENDASI & DRAFT STRATEGI PLAN USAHA BULAN DEPAN ===\n`;
    const openTrx = agg.allowedTransactions.filter(t => !['Selesai', 'Pesanan Batal', 'Penawaran'].includes(t.status));
    digest += `* Transaksi Berjalan Perlu Follow-Up: ${openTrx.length} Trx\n`;
    openTrx.slice(0, 8).forEach(t => {
      digest += `  - [${t.noTrx || t.id}] ${t.customerName} - Rp ${getTrxAmount(t).toLocaleString('id-ID')} | Status: ${t.status} | Tgl: ${t.tanggal} | Sales: ${t.salesName || t.sales || '-'}\n`;
    });

    const openQuotes = agg.allowedTransactions.filter(t => (t.statuses || [t.status]).includes('Penawaran') || t.status === 'Penawaran');
    digest += `* Penawaran (Quotes) Aktif Perlu Closing: ${openQuotes.length} Penawaran\n`;
    openQuotes.slice(0, 8).forEach(q => {
      digest += `  - [${q.noTrx || q.id}] ${q.customerName} - Nilai Penawaran: Rp ${getTrxAmount(q).toLocaleString('id-ID')} | Tgl: ${q.tanggal} | Sales: ${q.salesName || q.sales || '-'}\n`;
    });

    digest += `* Produk Stok Menipis Perlu PO Restock (< 10 unit): ${agg.compLowStockProducts.length} SKU\n`;
    agg.compLowStockProducts.slice(0, 8).forEach(p => {
      const avail = agg.getCompAvailStock(p.nama);
      digest += `  - ${p.nama} (Stok Sisa: ${avail} ${p.satuan || 'Unit'})\n`;
    });

    // Task App Data (ONLY accessible by SuperAdmin)
    if (isSuperAdmin && (taskAppData.tasks.length > 0 || taskAppData.projects.length > 0 || taskAppData.drivePosts.length > 0)) {
      digest += `\n=== [MENU 10: KHUSUS SUPERADMIN - DATA TASK APP, PROYEK & DRIVE] ===\n`;
      digest += `* Total Task/Tugas: ${taskAppData.tasks.length} task (${taskAppData.tasks.filter(t => t.status === 'Selesai').length} Selesai, ${taskAppData.tasks.filter(t => t.status !== 'Selesai').length} Berjalan/Pending)\n`;
      digest += `* Daftar Task Aktif/Pending Terbaru:\n`;
      taskAppData.tasks.slice(0, 25).forEach(t => {
        digest += `  - [${t.priority || 'Medium'}] ${t.title} | Status: ${t.status} | Progress: ${t.progress || 0}% | Perusahaan: ${t.companyName || '-'} | Kategori: ${t.category || '-'} | Petugas: ${t.employeeName || t.owner || '-'} | Tgl: ${t.startDate || '-'} s/d ${t.endDate || '-'}\n`;
      });

      digest += `* Total Proyek Database: ${taskAppData.projects.length} proyek\n`;
      taskAppData.projects.slice(0, 15).forEach(p => {
        const fileCount = (p.files?.engineering?.length || 0) + (p.files?.commercial?.length || 0) + (p.files?.finance?.length || 0) + (p.files?.documentation?.length || 0);
        digest += `  - [PROYEK ${p.code || ''}] ${p.title} | Klien: ${p.clientName || '-'} | Lokasi: ${p.location || '-'} | Status: ${p.status} | Lead: ${p.leadEngineer || '-'} | Total File: ${fileCount} berkas\n`;
      });

      digest += `* Total Drive Posts/Public Files: ${taskAppData.drivePosts.length} postingan\n`;
      taskAppData.drivePosts.slice(0, 10).forEach(post => {
        digest += `  - [DRIVE POST] ${post.title} oleh ${post.owner_name || post.owner_username || '-'} | File: ${post.attachments?.length || 0} lampiran\n`;
      });
    }

    return digest;
  };

  // Helper to accurately match target month without substring false positives (e.g., 'maria' triggering 'mar'/Maret)
  const getMatchedMonthObject = (queryText: string): { key: string; numStr: string; name: string } | null => {
    if (!queryText) return null;
    const lower = queryText.toLowerCase();

    // 1. Full month names (Indonesian & English)
    const fullMonths: { key: string; numStr: string; name: string }[] = [
      { key: 'januari', numStr: '01', name: 'Januari' },
      { key: 'january', numStr: '01', name: 'Januari' },
      { key: 'februari', numStr: '02', name: 'Februari' },
      { key: 'february', numStr: '02', name: 'Februari' },
      { key: 'maret', numStr: '03', name: 'Maret' },
      { key: 'march', numStr: '03', name: 'Maret' },
      { key: 'april', numStr: '04', name: 'April' },
      { key: 'mei', numStr: '05', name: 'Mei' },
      { key: 'may', numStr: '05', name: 'Mei' },
      { key: 'juni', numStr: '06', name: 'Juni' },
      { key: 'june', numStr: '06', name: 'Juni' },
      { key: 'juli', numStr: '07', name: 'Juli' },
      { key: 'july', numStr: '07', name: 'Juli' },
      { key: 'agustus', numStr: '08', name: 'Agustus' },
      { key: 'august', numStr: '08', name: 'Agustus' },
      { key: 'september', numStr: '09', name: 'September' },
      { key: 'oktober', numStr: '10', name: 'Oktober' },
      { key: 'october', numStr: '10', name: 'Oktober' },
      { key: 'november', numStr: '11', name: 'November' },
      { key: 'desember', numStr: '12', name: 'Desember' },
      { key: 'december', numStr: '12', name: 'Desember' }
    ];

    for (const m of fullMonths) {
      if (lower.includes(m.key)) {
        return m;
      }
    }

    // 2. Short 3-letter month abbreviations (strict regex word boundary \b to prevent matching 'mar' inside 'maria' or 'pemasaran')
    const shortMonths: { key: string; numStr: string; name: string }[] = [
      { key: 'jan', numStr: '01', name: 'Januari' },
      { key: 'feb', numStr: '02', name: 'Februari' },
      { key: 'mar', numStr: '03', name: 'Maret' },
      { key: 'apr', numStr: '04', name: 'April' },
      { key: 'jun', numStr: '06', name: 'Juni' },
      { key: 'jul', numStr: '07', name: 'Juli' },
      { key: 'agu', numStr: '08', name: 'Agustus' },
      { key: 'aug', numStr: '08', name: 'Agustus' },
      { key: 'sep', numStr: '09', name: 'September' },
      { key: 'okt', numStr: '10', name: 'Oktober' },
      { key: 'oct', numStr: '10', name: 'Oktober' },
      { key: 'nov', numStr: '11', name: 'November' },
      { key: 'des', numStr: '12', name: 'Desember' },
      { key: 'dec', numStr: '12', name: 'Desember' }
    ];

    for (const sm of shortMonths) {
      const reg = new RegExp(`\\b${sm.key}\\b`, 'i');
      if (reg.test(lower)) {
        return sm;
      }
    }

    return null;
  };

  // Smart local synthesizer for immediate, accurate answer across all menus
  const generateSmartLocalResponse = (query: string): string => {
    const agg = compileAggregations(query);
    const lower = query.toLowerCase();
    const trimmed = lower.trim().replace(/[!\?\.,]/g, '');
    const userName = currentUser?.nama || (currentUser as any)?.name || 'Bapak/Ibu';

    // 0. Conversational & Human Greetings Handler
    if (isConversationalGreeting(query)) {
      return getConversationalGreetingResponse(userName, query);
    }

    // 0.1 Context Clarification Check (Never dump data if context is missing)
    const clarification = detectLackingContext(query, messages);
    if (clarification) {
      return `Halo **${userName}**, ${clarification.clarificationQuestion}`;
    }

    // Intent Classification
    const matchedMonthObj = getMatchedMonthObject(lower);
    const matchedMonth = matchedMonthObj ? matchedMonthObj.name.toLowerCase() : null;

    const isInvoiceQuery = lower.includes('invoice') || lower.includes('tagihan') || lower.includes('piutang');
    const isTrxQuery = lower.includes('transaksi') || lower.includes('penjualan') || lower.includes('omzet') || lower.includes('pesanan');
    const isQuoteQuery = lower.includes('penawaran') || lower.includes('quotation') || lower.includes('quote');
    const isPOQuery = lower.includes('purchase order') || lower.includes('po ') || lower.endsWith('po') || lower.includes('supplier');
    const isStockQuery = lower.includes('stok') || lower.includes('produk') || lower.includes('inventaris');
    const isHRQuery = lower.includes('karyawan') || lower.includes('hr') || lower.includes('gaji') || lower.includes('pegawai');
    const isAllMenuQuery = lower.includes('semua menu') || lower.includes('semua data') || lower.includes('audit') || lower.includes('rekap');
    const isExplicitContactQuery = lower.includes('kontak') || lower.includes('customer') || lower.includes('pelanggan') || lower.includes('pic') || lower.includes('profil');

    const isExplicitProductQuery = lower.includes('produk') || lower.includes('stok') || lower.includes('katalog') || lower.includes('sku') || lower.includes('item');
    const isStrategyPlanQuery = 
      lower.includes('saran') || 
      lower.includes('masukan') || 
      lower.includes('plan') || 
      lower.includes('rencana') || 
      lower.includes('strategi') || 
      lower.includes('bulan depan') || 
      lower.includes('follow up') || 
      lower.includes('followup') || 
      lower.includes('prospek') || 
      lower.includes('rekomendasi') || 
      lower.includes('bagus') ||
      lower.includes('terlaris') ||
      lower.includes('langkah') ||
      lower.includes('target');

    const isModuleOrReportQuery = isInvoiceQuery || isTrxQuery || isQuoteQuery || isPOQuery || isStockQuery || isHRQuery || isAllMenuQuery || isStrategyPlanQuery || Boolean(matchedMonth);

    // 0.0 Direct Transaction & Code Search (e.g. "TRX-70", "trx 70", "QUO-001", "PO-123", "INV-101")
    const searchClean = lower.replace(/[^a-z0-9]/g, '');
    if (searchClean.length >= 2) {
      const matchedTrx = agg.allowedTransactions.filter(t => {
        const noTrxStr = (t.noTrx || t.id || '').toLowerCase();
        const noTrxClean = noTrxStr.replace(/[^a-z0-9]/g, '');
        if (noTrxStr.includes(lower) || (searchClean.length >= 2 && noTrxClean.includes(searchClean))) {
          return true;
        }
        return false;
      });

      if (matchedTrx.length > 0 && (lower.includes('trx') || lower.includes('quo') || lower.includes('inv') || matchedTrx.length <= 5)) {
        let res = `### 🧾 Detail Transaksi / Penawaran "${query}":\n\n`;
        res += `Ditemukan **${matchedTrx.length} data transaksi** yang cocok dengan nomor/kode **"${query}"**:\n\n`;
        res += `| No. Transaksi | Tanggal | Pelanggan | Nominal Total | Status Pesanan | Status Pembayaran | Sales Rep |\n|---|---|---|---|---|---|---|\n`;
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
          } else {
            res += `*(Tidak ada rincian item terpisah)*\n`;
          }

          if (t.catatan || (t as any).notes) {
            res += `\n📝 **Catatan Transaksi**: ${t.catatan || (t as any).notes}\n`;
          }
        }

        return res;
      }

      // Direct Purchase Order (PO) Search
      const matchedPOs = agg.allowedPOs.filter(po => {
        const noPOStr = (po.noPO || po.id || '').toLowerCase();
        const noPOClean = noPOStr.replace(/[^a-z0-9]/g, '');
        return noPOStr.includes(lower) || (searchClean.length >= 2 && noPOClean.includes(searchClean));
      });

      if (matchedPOs.length > 0 && (lower.includes('po') || matchedPOs.length <= 3)) {
        let res = `### 📦 Detail Purchase Order (PO) "${query}":\n\n`;
        res += `| No. PO | Tanggal | Supplier | Total Nominal | Status |\n|---|---|---|---|---|\n`;
        matchedPOs.forEach(po => {
          res += `| **${po.noPO || po.id}** | ${po.tanggal || '-'} | **${po.supplierName || po.supplier || '-'}** | **Rp ${(po.total || 0).toLocaleString('id-ID')}** | ${po.status || 'Aktif'} |\n`;
        });
        return res;
      }
    }

    // 0.1 Direct Product Search & Rich Product Profile (e.g. "apa ada produk lem", "produk phostoxin", "stok lem", etc.)
    if ((isExplicitProductQuery || !isModuleOrReportQuery) && lower.trim().length > 2 && !lower.includes('stok menipis') && !lower.includes('menipis')) {
      const prodStopWords = new Set([
        'apa', 'ada', 'produk', 'apakah', 'stok', 'cari', 'info', 'detail', 'tolong', 'cek',
        'data', 'di', 'ini', 'yang', 'semua', 'katalog', 'menu', 'list', 'daftar', 'transaksi', 'laporan'
      ]);
      const prodTokens = lower.split(/\s+/).filter(w => w.length >= 2 && !prodStopWords.has(w));

      // Filter products for active company
      const companyProducts = (products || []).filter(p => !activeCompanyId || !p.companyId || p.companyId === activeCompanyId || (p as any).company_id === activeCompanyId);
      
      const matchedProds = companyProducts.filter(p => {
        const fullStr = `${p.nama || ''} ${p.kode || ''} ${p.kategori || ''} ${p.deskripsi || (p as any).description || ''}`.toLowerCase();
        if (fullStr.includes(lower)) return true;
        if (prodTokens.length > 0) {
          return prodTokens.some(tok => fullStr.includes(tok));
        }
        return false;
      });

      if (matchedProds.length > 0 && prodTokens.length > 0) {
        let res = `### 📦 Hasil Pencarian Data Produk (${matchedProds.length} Produk Ditemukan):\n\n`;

        matchedProds.forEach((p, idx) => {
          const availStock = agg.getCompAvailStock(p.nama);
          const descStr = p.deskripsi || (p as any).description || '- Tidak ada deskripsi -';

          // Search all transactions for this product
          const pTrx = agg.allowedTransactions.filter(t => 
            Array.isArray(t.items) && t.items.some((it: any) => 
              (it.nama || '').toLowerCase().includes(p.nama.toLowerCase()) || 
              (p.nama || '').toLowerCase().includes((it.nama || '').toLowerCase())
            )
          );

          let totalQtySold = 0;
          let totalRevenue = 0;
          pTrx.forEach(t => {
            (t.items || []).forEach((it: any) => {
              if ((it.nama || '').toLowerCase().includes(p.nama.toLowerCase()) || (p.nama || '').toLowerCase().includes((it.nama || '').toLowerCase())) {
                const qty = Number(it.qty) || 1;
                const price = Number(it.harga) || 0;
                totalQtySold += qty;
                totalRevenue += (qty * price);
              }
            });
          });

          const mainFunc = p.mainFunction || '⚠️ Belum diisi';
          const mainApp = p.mainApplication || '⚠️ Belum diisi';
          const specDetail = p.specifications || p.deskripsi || (p as any).description || '⚠️ Belum diisi';
          const dimStr = (p.panjang || p.lebar || p.tinggi) ? `${p.panjang || 0} x ${p.lebar || 0} x ${p.tinggi || 0} cm` : '⚠️ Belum diisi';
          const weightStr = p.berat ? `${p.berat} kg` : '⚠️ Belum diisi';
          const remarksStr = p.remarks || '⚠️ Belum diisi';

          const isMissingSpecs = !p.specifications && !p.mainFunction && !p.mainApplication && !p.panjang && !p.berat;

          res += `#### ${idx + 1}. **${p.nama}** ${p.kode ? `\`[${p.kode}]\`` : ''}\n`;
          res += `- **Kategori**: **${p.kategori || 'Umum'}**\n`;
          res += `- **Stok Tersedia Saat Ini**: **${availStock} ${p.satuan || 'Unit'}** *(Batas Min. Stok: ${p.minStok || 10} ${p.satuan || 'Unit'})*\n`;
          res += `- **Harga Jual / HET**: **Rp ${(p.hargaJual || 0).toLocaleString('id-ID')}** / ${p.satuan || 'Unit'}\n`;
          if (isSuperAdmin && p.hpp) {
            res += `- **HPP / Modal**: **Rp ${(p.hpp || 0).toLocaleString('id-ID')}**\n`;
          }
          res += `\n**📋 Spesifikasi Detail Produk:**\n`;
          res += `- **Fungsi Utama**: ${mainFunc}\n`;
          res += `- **Aplikasi Utama**: ${mainApp}\n`;
          res += `- **Spesifikasi Teknis**: ${specDetail}\n`;
          res += `- **Ukuran Dimensi (P x L x T)**: ${dimStr}\n`;
          res += `- **Berat**: ${weightStr}\n`;
          res += `- **Catatan / Remarks**: ${remarksStr}\n\n`;

          if (isMissingSpecs) {
            res += `⚠️ **Data Spesifikasi Detail Produk Belum Terisi!**\nData spesifikasi tentang produk **${p.nama}** belum terisi di database MyPanca.\n\n**Apakah Anda mau mengisi spesifikasi produk ini sekarang?**\n\n`;
          }

          res += `**📊 Performa Penjualan Produk Ini:**\n`;
          res += `- **Total Qty Terjual**: **${totalQtySold} ${p.satuan || 'Unit'}** (${pTrx.length} Transaksi)\n`;
          res += `- **Total Omzet Terbentuk**: **Rp ${totalRevenue.toLocaleString('id-ID')}**\n\n`;

          if (pTrx.length > 0) {
            res += `**📜 Riwayat Transaksi Penjualan Terakhir:**\n`;
            res += `| No. Trx | Tanggal | Customer / Pelanggan | Qty Purchased | Nominal Total (Rp) | Status | Sales |\n|---|---|---|---|---|---|---|\n`;
            pTrx.slice(0, 5).forEach(tx => {
              const matchedItem = (tx.items || []).find((it: any) => (it.nama || '').toLowerCase().includes(p.nama.toLowerCase()) || (p.nama || '').toLowerCase().includes((it.nama || '').toLowerCase()));
              const itemQty = matchedItem ? Number(matchedItem.qty) || 1 : 1;
              const itemPrice = matchedItem ? Number(matchedItem.harga) || 0 : 0;
              const totalVal = itemQty * itemPrice || getTrxAmount(tx);
              res += `| **${tx.noTrx || tx.id}** | ${tx.tanggal || '-'} | ${tx.customerName || '-'} | **${itemQty} ${p.satuan || 'Unit'}** | **Rp ${totalVal.toLocaleString('id-ID')}** | ${tx.status || 'Selesai'} | ${tx.sales || '-'} |\n`;
            });
            res += `\n`;
          } else {
            res += `*Belum ada riwayat transaksi penjualan untuk produk ini.*\n\n`;
          }
        });

        return res;
      } else if (isExplicitProductQuery && prodTokens.length > 0) {
        let res = `### 📦 Hasil Pencarian Katalog Produk\n\n`;
        res += `Produk dengan kata kunci **"${prodTokens.join(' ')}"** tidak ditemukan di katalog produk perusahaan **${activeCompany.nama}**.\n\n`;
        res += `**💡 Katalog Produk Terdaftar Saat Ini (${companyProducts.length} SKU):**\n\n`;
        res += `| No | Nama Produk | Kategori | Stok Tersedia | Harga Jual | Satuan |\n|---|---|---|---|---|---|\n`;
        companyProducts.slice(0, 10).forEach((p, idx) => {
          const availStock = agg.getCompAvailStock(p.nama);
          res += `| ${idx + 1} | **${p.nama}** | ${p.kategori || 'Umum'} | **${availStock}** | Rp ${(p.hargaJual || 0).toLocaleString('id-ID')} | ${p.satuan || 'Unit'} |\n`;
        });
        return res;
      }
    }

    // 0.05 Dedicated Business Plan & Strategy Recommendation Handler
    if (isStrategyPlanQuery) {
      const activeCompany = (companies || []).find(c => c.id === activeCompanyId) || { nama: 'PT. PANCA PRIMA WIJAYA' };

      // 1. Pending / Active Transactions
      const activeTrx = agg.allowedTransactions.filter(t => 
        !['Selesai', 'Pesanan Batal', 'Penawaran'].includes(t.status) &&
        !((t.statuses || []).includes('Selesai') || (t.statuses || []).includes('Pesanan Batal'))
      );

      // 2. Open Quotes
      const openQuotes = agg.allowedTransactions.filter(t => 
        (t.statuses || [t.status]).includes('Penawaran') || t.status === 'Penawaran'
      );

      // 3. Unpaid Invoices (AR)
      const unpaidTrx = agg.allowedTransactions.filter(t => {
        const st = (t.statuses || [t.status]).map((s: string) => s.toLowerCase());
        const sisa = typeof (t as any).sisaPembayaran === 'number' ? (t as any).sisaPembayaran : (t.status === 'Selesai' ? 0 : getTrxAmount(t));
        return (sisa > 0 || st.includes('belum lunas') || (t as any).paymentStatus === 'Belum Lunas') && !st.includes('penawaran') && !st.includes('pesanan batal');
      });

      // 4. Product Sales Ranking
      const productSalesMap: Record<string, { qty: number; revenue: number }> = {};
      agg.allowedTransactions.forEach(t => {
        if (t.status !== 'Pesanan Batal' && !((t.statuses || []).includes('Penawaran') || t.status === 'Penawaran')) {
          (t.items || []).forEach((it: any) => {
            const pName = it.nama?.trim();
            if (pName) {
              const qty = Number(it.qty) || 1;
              const rev = (Number(it.harga) || 0) * qty;
              if (!productSalesMap[pName]) productSalesMap[pName] = { qty: 0, revenue: 0 };
              productSalesMap[pName].qty += qty;
              productSalesMap[pName].revenue += rev;
            }
          });
        }
      });

      const sortedProducts = Object.entries(productSalesMap)
        .sort((a, b) => b[1].revenue - a[1].revenue);

      // Build structured response
      let res = `### 🚀 Rencana & Strategi Bisnis Bulan Depan (${activeCompany.nama})\n\n`;
      res += `Berikut adalah analisa data komprehensif dan **Rencana Tindakan (Action Plan) Strategis** untuk meningkatkan omzet, mempercepat pencairan piutang, dan menjaga kelancaran stok perusahaan Anda bulan depan:\n\n`;

      // Section 1: Dynamic KPI Summary
      const realDealTrxCount = agg.allowedTransactions.filter(t => !['Penawaran', 'Pesanan Batal'].includes(t.status || '')).length;
      res += `#### 📊 1. Ringkasan Kinerja & Potensi Bulan Depan:\n`;
      res += `- **Total Omzet Terbentuk**: **Rp ${agg.totalOmzetReal.toLocaleString('id-ID')}** (${realDealTrxCount} Transaksi Real Deals)\n`;
      res += `- **Sisa Piutang Wajib Ditagih (AR)**: **Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')}** (${unpaidTrx.length} Invoice Belum Lunas)\n`;
      res += `- **Nilai Penawaran Berjalan (Pipeline Quotes)**: **Rp ${agg.totalNilaiPenawaran.toLocaleString('id-ID')}** (${openQuotes.length} Penawaran Aktif)\n`;
      res += `- **Jumlah Stok Menipis (< 10 unit)**: **${agg.compLowStockCount} SKU Produk** *(Perlu Restock Segera)*\n\n`;

      // Section 2: Active Transactions & Follow-Up Recommendations
      res += `#### 🔄 2. Transaksi Berjalan & Order Wajib Di-Follow Up:\n`;
      if (activeTrx.length > 0) {
        res += `| No | No. Trx | Pelanggan | Nominal (Rp) | Status Saat Ini | Sales Rep | Rekomendasi Aksi Follow-Up |\n|---|---|---|---|---|---|---|\n`;
        activeTrx.slice(0, 7).forEach((t, idx) => {
          const amt = getTrxAmount(t);
          const st = t.status || 'Progress';
          let actionNote = "Hubungi pelanggan untuk konfirmasi penerimaan barang.";
          if (st === 'Progress' || st === 'Proses') actionNote = "Segera selesaikan pengerjaan/penyiapan barang & terbitkan SJ.";
          else if (st === 'Pengiriman') actionNote = "Pantau kurir & minta konfirmasi Bukti Tanda Terima (BTT).";
          else if (st === 'Invoice' || st === 'Belum Lunas') actionNote = `Kirimkan reminder penagihan invoice Rp ${amt.toLocaleString('id-ID')}.`;

          res += `| ${idx + 1} | **${t.noTrx || t.id}** | **${t.customerName}** | Rp ${amt.toLocaleString('id-ID')} | ${st} | ${t.salesName || t.sales || '-'} | ${actionNote} |\n`;
        });
        res += `\n`;
      } else {
        res += `*Semua transaksi berjalan telah berstatus Selesai.* Namun pastikan untuk memeriksa sisa piutang tertunggak.\n\n`;
      }

      // Section 3: Pending Quotes / Pipeline
      res += `#### 📝 3. Penawaran (Quotes) Potensial yang Harus Segera Closing:\n`;
      if (openQuotes.length > 0) {
        res += `| No | No. Penawaran | Pelanggan | Estimasi Nilai | Tanggal | Sales | Aksi Strategis Closing |\n|---|---|---|---|---|---|---|\n`;
        openQuotes.slice(0, 7).forEach((q, idx) => {
          const val = getTrxAmount(q);
          res += `| ${idx + 1} | **${q.noTrx || q.id}** | **${q.customerName}** | **Rp ${val.toLocaleString('id-ID')}** | ${q.tanggal} | ${q.salesName || q.sales || '-'} | Berikan garansi / penawaran promo khusus untuk closing minggu ini. |\n`;
        });
        res += `\n`;
      } else {
        res += `*Tidak ada penawaran menggantung saat ini.* Disarankan sales membuat penawaran baru ke kontak Warm Lead.\n\n`;
      }

      // Section 4: Best Seller Products & Restock Plan
      res += `#### 📦 4. Produk Unggulan & Rencana Restock Stok Menipis:\n`;
      if (sortedProducts.length > 0) {
        res += `**🏆 Top 5 Produk Paling Laris & Penyumbang Omzet Terbesar:**\n`;
        sortedProducts.slice(0, 5).forEach(([pName, pData], idx) => {
          const avail = agg.getCompAvailStock(pName);
          res += `${idx + 1}. **${pName}**: Terjual **${pData.qty} unit** (Total Omzet: **Rp ${pData.revenue.toLocaleString('id-ID')}**) — *Sisa Stok: ${avail} unit*\n`;
        });
        res += `\n`;
      }

      if (agg.compLowStockProducts.length > 0) {
        res += `**⚠️ Rencana Restock / PO Supplier (Stok Menipis < 10 Unit):**\n`;
        res += `| No | Nama Produk SKU | Stok Sisa | Batas Min | Satuan | Rekomendasi Aksi Purchasing |\n|---|---|---|---|---|---|\n`;
        agg.compLowStockProducts.slice(0, 6).forEach((p, idx) => {
          const avail = agg.getCompAvailStock(p.nama);
          res += `| ${idx + 1} | **${p.nama}** | **${avail}** | 10 | ${p.satuan || 'Unit'} | Terbitkan Purchase Order (PO) ke Supplier minggu ini. |\n`;
        });
        res += `\n`;
      }

      // Section 5: 4-Step Strategic Action Plan
      res += `#### 🎯 5. Action Plan 4-Langkah Utama Bulan Depan:\n`;
      res += `1. **💵 Penagihan Piutang (Cashflow Booster)**:\n`;
      res += `   - Fokus mengumpulkan tagihan invoice tertunggak senilai **Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')}** dari ${unpaidTrx.length} pelanggan.\n`;
      res += `2. **🤝 Sales Closing Campaign (Penawaran Active Deals)**:\n`;
      res += `   - Hubungi ulang ${openQuotes.length} pelanggan yang sedang memegang penawaran senilai **Rp ${agg.totalNilaiPenawaran.toLocaleString('id-ID')}**.\n`;
      res += `3. **📦 Purchasing & Management Stok**:\n`;
      res += `   - Buat PO baru ke Supplier untuk **${agg.compLowStockCount} SKU produk stok menipis** agar tidak kehabisan stok saat permintaan tinggi.\n`;
      res += `4. **👥 Prospek & Penetrasi Pelanggan Baru**:\n`;
      res += `   - Alokasikan sales untuk mem-follow up kontak dengan status **Warm Lead** dan memberikan penawaran khusus produk best-seller.\n\n`;

      return res;
    }

    // 0. Direct Contact Search & Similar Suggestions (ONLY if not asking for a module report OR explicitly asking for contact)
    if ((!isModuleOrReportQuery || isExplicitContactQuery) && lower.trim().length > 2) {
      const stopWords = new Set([
        'invoice', 'berjalan', 'transaksi', 'penjualan', 'omzet', 'penawaran', 'quotation',
        'po', 'purchase', 'order', 'stok', 'produk', 'karyawan', 'hr', 'gaji', 'piutang', 'hutang',
        'ppn', 'ongkir', 'laporan', 'rekap', 'bulan', 'semua', 'menu', 'data', 'lunas', 'belum',
        'januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
      ]);
      const searchTokens = lower.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

      const matchedCustomers = agg.allowedCustomers.filter(c => {
        const fullStr = `${c.nama || ''} ${c.perusahaan || ''} ${c.pic || ''} ${c.kota || ''}`.toLowerCase();
        if (fullStr.includes(lower)) return true;
        if (searchTokens.length > 0) {
          return searchTokens.some(tok => fullStr.includes(tok));
        }
        return false;
      });

      if (matchedCustomers.length > 0) {
        let res = `### 👤 Profil & Riwayat Transaksi Lengkap Pelanggan (${matchedCustomers.length} Ditemukan):\n\n`;
        matchedCustomers.forEach((c, idx) => {
          // Find customer's transactions
          const cTrx = agg.allowedTransactions.filter(t => 
            (t.customerName || '').toLowerCase().includes(c.nama.toLowerCase()) || 
            (c.nama || '').toLowerCase().includes((t.customerName || '').toLowerCase())
          );
          const cPenawaran = cTrx.filter(t => (t.statuses || [t.status]).includes('Penawaran') || t.status === 'Penawaran');
          const cRealTrx = cTrx.filter(t => !((t.statuses || [t.status]).includes('Penawaran') || t.status === 'Penawaran') && t.status !== 'Pesanan Batal');
          
          let totalOmzetDeal = 0;
          cRealTrx.forEach(t => { totalOmzetDeal += getTrxAmount(t); });

          let totalPenawaranVal = 0;
          cPenawaran.forEach(q => { totalPenawaranVal += getTrxAmount(q); });

          // Unpaid invoices
          const cUnpaid = cRealTrx.filter(t => (typeof (t as any).sisaPembayaran === 'number' && (t as any).sisaPembayaran > 0) || (t.statuses || []).includes('Belum Lunas') || t.status === 'Invoice');
          let totalSisaPiutang = 0;
          cUnpaid.forEach(u => {
            const sisa = typeof (u as any).sisaPembayaran === 'number' && (u as any).sisaPembayaran > 0 ? (u as any).sisaPembayaran : getTrxAmount(u);
            totalSisaPiutang += sisa;
          });

          // Product aggregation
          const productMap: Record<string, { qty: number; spend: number }> = {};
          cRealTrx.forEach(t => {
            (t.items || []).forEach((it: any) => {
              const pName = it.nama?.trim();
              if (pName) {
                const qty = Number(it.qty) || 1;
                const spend = (Number(it.harga) || 0) * qty;
                if (!productMap[pName]) productMap[pName] = { qty: 0, spend: 0 };
                productMap[pName].qty += qty;
                productMap[pName].spend += spend;
              }
            });
          });

          // Extract all follow-up notes across transactions
          const allFollowUps: { tanggal: string; method: string; note: string }[] = [];
          cTrx.forEach(t => {
            if (Array.isArray((t as any).followUps)) {
              (t as any).followUps.forEach((fu: any) => {
                allFollowUps.push({
                  tanggal: fu.tanggal || t.tanggal || '-',
                  method: fu.method || fu.metode || 'WhatsApp',
                  note: fu.keterangan || fu.catatan || '-'
                });
              });
            } else if ((t as any).followUpNote || (t as any).keterangan) {
              allFollowUps.push({
                tanggal: (t as any).followUpDate || t.tanggal || '-',
                method: (t as any).followUpMethod || 'WhatsApp',
                note: (t as any).followUpNote || (t as any).keterangan || '-'
              });
            }
          });

          res += `#### ${idx + 1}. **${c.nama}** ${c.perusahaan ? `(${c.perusahaan})` : ''}\n`;
          res += `- **Status Lead**: **${c.leadType || 'Aktif'}**\n`;
          res += `- **Kota / Wilayah**: ${c.kota || '-'}\n`;
          res += `- **No. WhatsApp / Telp**: **${c.whatsapp || c.phone || '-'}**\n`;
          res += `- **Sales Penanggung Jawab**: **${c.sales || '-'}**\n`;
          res += `- **PIC / Kontak**: ${c.pic || c.nama}\n`;
          if (c.email) res += `- **Email**: ${c.email}\n`;
          if (c.alamat) res += `- **Alamat Lengkap**: ${c.alamat}\n\n`;

          res += `**📊 Ringkasan Finansial Pelanggan Ini:**\n`;
          res += `- **Total Belanja Real Deals**: **Rp ${totalOmzetDeal.toLocaleString('id-ID')}** (${cRealTrx.length} Transaksi)\n`;
          res += `- **Total Nilai Penawaran Berjalan**: **Rp ${totalPenawaranVal.toLocaleString('id-ID')}** (${cPenawaran.length} Penawaran — *TIDAK MASUK OMZET*)\n`;
          res += `- **Sisa Piutang / Tagihan Belum Lunas**: **Rp ${totalSisaPiutang.toLocaleString('id-ID')}** (${cUnpaid.length} Invoice)\n\n`;

          // 1. All Real Deals History
          if (cRealTrx.length > 0) {
            res += `**📜 1. Semua Riwayat Transaksi Deal (Omzet Real):**\n`;
            res += `| No Trx | Tanggal | Produk / Item | Nominal (Rp) | Status Pesanan | Status Bayar | Sales |\n|---|---|---|---|---|---|---|\n`;
            cRealTrx.forEach(t => {
              const amt = getTrxAmount(t);
              const itemsStr = (t.items || []).map((it: any) => `${it.nama} (${it.qty})`).join(', ') || 'Transaksi';
              const pStatus = t.paymentStatus || (['Selesai'].includes(t.status) ? 'Lunas' : 'Belum Lunas');
              res += `| **${t.noTrx || t.id}** | ${t.tanggal || '-'} | ${itemsStr} | **Rp ${amt.toLocaleString('id-ID')}** | ${t.status || 'Selesai'} | ${pStatus} | ${t.sales || '-'} |\n`;
            });
            res += `\n`;
          } else {
            res += `*Belum ada riwayat transaksi deal yang selesai.*\n\n`;
          }

          // 2. All Active Penawaran
          if (cPenawaran.length > 0) {
            res += `**📋 2. Semua Riwayat Penawaran Berjalan (Quotations):**\n`;
            res += `| No Penawaran | Tanggal | Item Penawaran | Nilai Penawaran | Status Follow-Up | Sales |\n|---|---|---|---|---|---|\n`;
            cPenawaran.forEach(q => {
              const amt = getTrxAmount(q);
              const itemsStr = (q.items || []).map((it: any) => `${it.nama} (${it.qty})`).join(', ') || 'Penawaran';
              const hasFollowUp = Array.isArray((q as any).followUps) && (q as any).followUps.length > 0;
              res += `| **${q.noTrx || q.id}** | ${q.tanggal || '-'} | ${itemsStr} | Rp ${amt.toLocaleString('id-ID')} | ${hasFollowUp ? '✅ Sudah Follow-Up' : '⏳ Menunggu Follow-Up'} | ${q.sales || '-'} |\n`;
            });
            res += `\n`;
          }

          // 3. Products Purchased Summary
          const prodEntries = Object.entries(productMap);
          if (prodEntries.length > 0) {
            res += `**📦 3. Daftar Produk yang Pernah Dibeli:**\n`;
            res += `| No | Nama Produk | Total Qty Dibeli | Total Nominal Belanja |\n|---|---|---|---|\n`;
            prodEntries.forEach(([pName, pData], pIdx) => {
              res += `| ${pIdx + 1} | **${pName}** | ${pData.qty} unit | Rp ${pData.spend.toLocaleString('id-ID')} |\n`;
            });
            res += `\n`;
          }

          // 4. Follow-Up Log
          if (allFollowUps.length > 0) {
            res += `**📝 4. Riwayat Catatan Follow-Up & Interaksi BRM:**\n`;
            res += `| Tanggal | Metode | Catatan / Hasil Interaksi |\n|---|---|---|\n`;
            allFollowUps.forEach(fu => {
              res += `| ${fu.tanggal} | ${fu.method} | ${fu.note} |\n`;
            });
            res += `\n`;
          }

          res += `---\n`;
        });
        return res;
      } else if (isExplicitContactQuery) {
        // Generate similar contact suggestions ONLY if explicitly asking for contact
        const suggestions = agg.allowedCustomers
          .map(c => {
            const fullStr = `${c.nama || ''} ${c.perusahaan || ''} ${c.pic || ''} ${c.kota || ''} ${c.sales || ''}`.toLowerCase();
            let score = 0;
            const qTokens = searchTokens;
            qTokens.forEach(tok => {
              if (fullStr.includes(tok)) score += 2;
            });
            const charsQ = new Set(lower.replace(/\s+/g, ''));
            const charsC = new Set(fullStr.replace(/\s+/g, ''));
            let common = 0;
            charsQ.forEach(ch => { if (charsC.has(ch)) common++; });
            score += (common / Math.max(charsQ.size, charsC.size));
            return { customer: c, score };
          })
          .filter(item => item.score > 0.2)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        if (suggestions.length > 0) {
          let res = `### 🔍 Kontak "${query}" Tidak Ditemukan\n\n`;
          res += `Maaf, data kontak dengan nama **"${query}"** tidak ditemukan secara persis pada sistem.\n\n`;
          res += `💡 **Apakah Anda bermaksud mencari salah satu kontak pelanggan yang mirip di bawah ini?**\n\n`;
          res += `| No | Nama Pelanggan | Perusahaan | PIC / Kontak | Kota | Sales Rep | Status Lead |\n|---|---|---|---|---|---|---|\n`;
          suggestions.forEach(({ customer: c }, idx) => {
            res += `| ${idx + 1} | **${c.nama}** | ${c.perusahaan || '-'} | ${c.pic || c.nama} | ${c.kota || '-'} | ${c.sales || '-'} | ${c.leadType || 'Aktif'} |\n`;
          });
          res += `\n*Silakan ketikkan nama lengkap kontak di atas untuk melihat detail & seluruh riwayat transaksi lengkapnya.*`;
          return res;
        }
      }
    }

    // 0.5 Task App / Proyek / Drive Handler (KHUSUS SUPERADMIN)
    const isTaskQuery = isSuperAdmin && (
      lower.includes('task') || 
      lower.includes('tugas') || 
      lower.includes('proyek') || 
      lower.includes('project') || 
      lower.includes('pekerjaan') || 
      lower.includes('drive') || 
      lower.includes('postingan') ||
      lower.includes('shared post')
    );

    if (isTaskQuery) {
      let res = `### 📌 Data Menu Task App & Proyek (Akses Khusus SuperAdmin):\n\n`;

      const searchToks = lower.split(/\s+/).filter(w => w.length >= 2 && !['task', 'tugas', 'proyek', 'project', 'app', 'menu', 'data', 'info', 'cek', 'list', 'daftar', 'apa', 'saja', 'semua'].includes(w));

      // Filter tasks
      let filteredTasks = taskAppData.tasks;
      if (searchToks.length > 0) {
        filteredTasks = filteredTasks.filter(t => {
          const full = `${t.title || ''} ${t.category || ''} ${t.employeeName || ''} ${t.owner || ''} ${t.companyName || ''} ${t.priority || ''} ${t.status || ''}`.toLowerCase();
          return searchToks.some(tok => full.includes(tok));
        });
      }

      res += `**📊 Ringkasan Modul Task:**\n`;
      res += `- Total Task Terdaftar: **${taskAppData.tasks.length} task** (${taskAppData.tasks.filter(t => t.status === 'Selesai').length} Selesai, ${taskAppData.tasks.filter(t => t.status !== 'Selesai').length} Pending/Berjalan)\n`;
      if (searchToks.length > 0) {
        res += `- Hasil Pencarian Spesifik: **${filteredTasks.length} task** cocok dengan pencarian Anda.\n`;
      }
      res += `\n`;

      if (filteredTasks.length > 0) {
        res += `**📋 Daftar Task (${filteredTasks.length} Task):**\n`;
        res += `| No | Judul Task | Prioritas | Status | Progress | Petugas / Owner | Kategori | Periode |\n|---|---|---|---|---|---|---|---|\n`;
        filteredTasks.slice(0, 15).forEach((t, idx) => {
          res += `| ${idx + 1} | **${t.title}** | ${t.priority || 'Medium'} | ${t.status} | ${t.progress || 0}% | ${t.employeeName || t.owner || '-'} | ${t.category || '-'} | ${t.startDate || '-'} s/d ${t.endDate || '-'} |\n`;
        });
        res += `\n`;
      }

      // Filter projects
      let filteredProjects = taskAppData.projects;
      if (searchToks.length > 0) {
        filteredProjects = filteredProjects.filter(p => {
          const full = `${p.title || ''} ${p.code || ''} ${p.clientName || ''} ${p.location || ''} ${p.leadEngineer || ''} ${p.status || ''}`.toLowerCase();
          return searchToks.some(tok => full.includes(tok));
        });
      }

      if (filteredProjects.length > 0) {
        res += `**🏗️ Project Database (${filteredProjects.length} Proyek):**\n`;
        res += `| No | Kode & Nama Proyek | Klien | Lokasi | Status | Lead Engineer | Total Berkas |\n|---|---|---|---|---|---|---|\n`;
        filteredProjects.slice(0, 10).forEach((p, idx) => {
          const fileCount = (p.files?.engineering?.length || 0) + (p.files?.commercial?.length || 0) + (p.files?.finance?.length || 0) + (p.files?.documentation?.length || 0);
          res += `| ${idx + 1} | **[${p.code || 'PRJ'}] ${p.title}** | ${p.clientName || '-'} | ${p.location || '-'} | ${p.status} | ${p.leadEngineer || '-'} | ${fileCount} file |\n`;
        });
        res += `\n`;
      }

      // Filter Drive Posts
      if (taskAppData.drivePosts.length > 0) {
        res += `**☁️ Drive Posts / Berkas Publik (${taskAppData.drivePosts.length} Post):**\n`;
        res += `| No | Judul Post | Pengunggah | Kategori | Jumlah Lampiran |\n|---|---|---|---|---|\n`;
        taskAppData.drivePosts.slice(0, 8).forEach((post, idx) => {
          res += `| ${idx + 1} | **${post.title}** | ${post.owner_name || post.owner_username || '-'} | ${post.content ? 'Post/Dokumen' : 'File'} | ${post.attachments?.length || 0} lampiran |\n`;
        });
      }

      return res;
    }

    // 1. Dedicated Invoice & Transaksi Status Handler (e.g. "transaksi belum lunas", "transaksi lunas", "invoice berjalan juli", "transaksi selesai", etc.)
    if (isInvoiceQuery || isTrxQuery || lower.includes('belum lunas') || lower.includes('lunas') || lower.includes('selesai') || lower.includes('pengiriman') || lower.includes('progress') || lower.includes('batal')) {
      let filteredTrx = agg.allowedTransactions;
      let statusTitle = "Seluruh Transaksi & Invoice";

      if (matchedMonth) {
        filteredTrx = filteredTrx.filter(t => {
          const dInfo = parseDateInfo(t.tanggal);
          return dInfo.monthName.toLowerCase().includes(matchedMonth) || dInfo.key.toLowerCase().includes(matchedMonth);
        });
        statusTitle += ` Bulan ${matchedMonth.toUpperCase()}`;
      }

      if (lower.includes('belum lunas') || lower.includes('unpaid') || lower.includes('piutang')) {
        statusTitle = matchedMonth ? `Transaksi Belum Lunas (Sisa Tagihan) Bulan ${matchedMonth.toUpperCase()}` : "Transaksi Belum Lunas (Sisa Tagihan / Piutang)";
        filteredTrx = filteredTrx.filter(t => {
          const st = (t.statuses || [t.status]).map((s: string) => s.toLowerCase());
          const sisa = typeof (t as any).sisaPembayaran === 'number' ? (t as any).sisaPembayaran : (t.status === 'Selesai' ? 0 : getTrxAmount(t));
          const isUnpaid = sisa > 0 || st.includes('belum lunas') || (t as any).paymentStatus === 'Belum Lunas' || st.includes('invoice');
          return isUnpaid && !st.includes('penawaran') && !st.includes('pesanan batal');
        });
      } else if (lower.includes('lunas') || lower.includes('paid')) {
        statusTitle = matchedMonth ? `Transaksi Lunas Bulan ${matchedMonth.toUpperCase()}` : "Transaksi Sudah Lunas";
        filteredTrx = filteredTrx.filter(t => {
          const st = (t.statuses || [t.status]).map((s: string) => s.toLowerCase());
          const sisa = typeof (t as any).sisaPembayaran === 'number' ? (t as any).sisaPembayaran : (t.status === 'Selesai' ? 0 : getTrxAmount(t));
          const isPaid = (t as any).paymentStatus === 'Lunas' || st.includes('lunas') || sisa === 0;
          return isPaid && !st.includes('penawaran') && !st.includes('pesanan batal');
        });
      } else if (lower.includes('selesai')) {
        statusTitle = matchedMonth ? `Transaksi Status Selesai Bulan ${matchedMonth.toUpperCase()}` : "Transaksi Status Selesai";
        filteredTrx = filteredTrx.filter(t => (t.statuses || [t.status]).includes('Selesai') || t.status === 'Selesai');
      } else if (lower.includes('pengiriman') || lower.includes('kirim')) {
        statusTitle = matchedMonth ? `Transaksi Pengiriman Bulan ${matchedMonth.toUpperCase()}` : "Transaksi Dalam Pengiriman";
        filteredTrx = filteredTrx.filter(t => (t.statuses || [t.status]).includes('Pengiriman') || t.status === 'Pengiriman');
      } else if (lower.includes('progress') || lower.includes('proses')) {
        statusTitle = matchedMonth ? `Transaksi Progress Bulan ${matchedMonth.toUpperCase()}` : "Transaksi Dalam Progress / Proses";
        filteredTrx = filteredTrx.filter(t => (t.statuses || [t.status]).includes('Progress') || t.status === 'Progress');
      } else if (lower.includes('batal')) {
        statusTitle = matchedMonth ? `Transaksi Dibatalkan Bulan ${matchedMonth.toUpperCase()}` : "Transaksi Dibatalkan";
        filteredTrx = filteredTrx.filter(t => (t.statuses || [t.status]).includes('Pesanan Batal') || t.status === 'Pesanan Batal');
      } else {
        // General transactions filter out quotes and cancels
        filteredTrx = filteredTrx.filter(t => !['Penawaran', 'Pesanan Batal'].includes(t.status || ''));
      }

      let totalVal = 0;
      let totalSisa = 0;
      filteredTrx.forEach(t => {
        const amt = getTrxAmount(t);
        totalVal += amt;
        const sisa = typeof (t as any).sisaPembayaran === 'number' && (t as any).sisaPembayaran > 0 ? (t as any).sisaPembayaran : (t.status === 'Selesai' ? 0 : amt);
        totalSisa += sisa;
      });

      let res = `### 🛒 Laporan ${statusTitle} (${filteredTrx.length} Transaksi Ditemukan)\n\n`;
      res += `- **Total Nilai Penjualan**: **Rp ${totalVal.toLocaleString('id-ID')}**\n`;
      if (lower.includes('belum lunas') || lower.includes('unpaid') || lower.includes('piutang') || lower.includes('invoice')) {
        res += `- **Total Sisa Piutang / Belum Lunas**: **Rp ${totalSisa.toLocaleString('id-ID')}**\n`;
      }
      res += `- **Jumlah Transaksi**: **${filteredTrx.length} Transaksi**\n\n`;

      if (filteredTrx.length > 0) {
        res += `| No | No. Trx / Invoice | Pelanggan | Tanggal | Nominal Total | ${lower.includes('belum lunas') ? 'Sisa Tagihan | ' : ''}Status Pesanan | Status Bayar | Sales |\n`;
        res += `|---|---|---|---|---|${lower.includes('belum lunas') ? '---|' : ''}---|---|---|\n`;
        filteredTrx.slice(0, 25).forEach((t, idx) => {
          const amt = getTrxAmount(t);
          const sisa = typeof (t as any).sisaPembayaran === 'number' && (t as any).sisaPembayaran > 0 ? (t as any).sisaPembayaran : (t.status === 'Selesai' ? 0 : amt);
          const pStatus = (t as any).paymentStatus || (sisa > 0 ? `Belum Lunas (Sisa Rp ${sisa.toLocaleString('id-ID')})` : 'Lunas');
          res += `| ${idx + 1} | **${t.noTrx || t.id}** | **${t.customerName || '-'}** | ${t.tanggal || '-'} | Rp ${amt.toLocaleString('id-ID')} | ${lower.includes('belum lunas') ? `**Rp ${sisa.toLocaleString('id-ID')}** | ` : ''}${t.status || 'Selesai'} | ${pStatus} | ${t.sales || '-'} |\n`;
        });

        if (filteredTrx.length > 25) {
          res += `\n*Menampilkan 25 dari ${filteredTrx.length} transaksi. Silakan buka menu Trade untuk melihat seluruhnya.*`;
        }
      } else {
        res += `*Tidak ditemukan transaksi yang sesuai dengan kriteria status tersebut.*`;
      }

      return res;
    }

    // 1. Check if asking about "semua data", "semua menu", "tidak membaca", "baca data", "kenapa", "pastikan"
    if (lower.includes('semua menu') || lower.includes('semua data') || lower.includes('tidak membaca') || lower.includes('baca data') || lower.includes('kenapa') || lower.includes('pastikan')) {
      let res = `### 📊 Audit & Rekap Lengkap Seluruh 9 Menu MyPanca\n\n`;
      res += `Sistem telah **membaca dan memverifikasi 100% data** dari seluruh menu di aplikasi **MyPanca** untuk perusahaan **${activeCompany.nama}**:\n\n`;
      res += `| No | Menu / Modul | Rangkuman Data Terbaca | Detail Utama |\n|---|---|---|---|\n`;
      res += `| 1 | **Dashboard KPI** | **${agg.compCustomerCount}** Pelanggan, **${agg.compLowStockCount}** Stok Menipis | Kartu KPI Perusahaan Aktif sinkron |\n`;
      res += `| 2 | **BRM (Contacts)** | **${agg.compCustomerCount}** Kontak Aktif (**${agg.globalCustomerCount}** Global) | ${Object.entries(agg.leadTypeCounts).map(([k, v]) => `${k}: ${v}`).join(', ')} |\n`;
      res += `| 3 | **BRM (Penawaran)** | **${agg.totalQuotes}** Penawaran (${agg.followedUpQuotes} di-follow up) | ${agg.quoteList.length} penawaran tercatat |\n`;
      res += `| 4 | **TRADE (Transaksi)** | **${agg.allowedTransactions.length}** Transaksi (Omzet: **Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')}**) | Selesai (${agg.tradeStatusCounts['Selesai'] || 0}), Progress (${agg.tradeStatusCounts['Progress'] || 0}) |\n`;
      res += `| 5 | **STOCKLIST & PRODUK** | **${agg.compProductCount}** SKU Produk Aktif | **${agg.compLowStockCount}** SKU stok < 10, Valuasi: Rp ${agg.totalStockValuation.toLocaleString('id-ID')} |\n`;
      res += `| 6 | **PURCHASING (PO & Supplier)**| **${agg.allowedSuppliers.length}** Supplier, **${agg.allowedPOs.length}** Purchase Orders | Total Nilai PO: Rp ${agg.totalPOAmount.toLocaleString('id-ID')} |\n`;
      res += `| 7 | **FINANCE** | Piutang: **Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')}**, Hutang: **Rp ${agg.totalHutangAmount.toLocaleString('id-ID')}** | PPN (${agg.ppnTrxCount} Trx), Ongkir (${agg.ongkirTrxCount} Trx) |\n`;
      res += `| 8 | **HR (Karyawan)** | **${agg.allowedEmployees.length}** Staf / Karyawan terdaftar | ${agg.allowedEmployees.map(e => e.nama).join(', ')} |\n`;
      res += `| 9 | **ADMIN / PANEL** | **${agg.allowedAppUsers.length}** Akun Pengguna, **${agg.allowedDeletedItems.length}** Item Recycle Bin | Sistem Berjalan Normal |\n\n`;

      const augEntry = agg.chronologicalMonthlyEntries.find(([p]) => p.toLowerCase().includes('agustus'));
      if (augEntry) {
        res += `#### 🗓️ Data Khusus Penjualan ${augEntry[0]}:\n`;
        res += `- **Total Transaksi**: ${augEntry[1].totalTrx} transaksi\n`;
        res += `- **Total Omzet**: **Rp ${augEntry[1].omzet.toLocaleString('id-ID')}**\n`;
        const topAugProds = Object.entries(augEntry[1].productSales).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
        if (topAugProds.length > 0) {
          res += `\n**Top Produk Terlaris ${augEntry[0]}:**\n`;
          topAugProds.forEach(([pName, pData], idx) => {
            res += `${idx + 1}. **${pName}** — ${pData.qty} unit (Rp ${pData.revenue.toLocaleString('id-ID')})\n`;
          });
        }
      }

      return res;
    }

    // 2. Kontak / Customer / Pelanggan
    if (lower.includes('kontak') || lower.includes('customer') || lower.includes('pelanggan')) {
      let res = `### 👥 Data Pelanggan & Kontak (Menu BRM):\n`;
      res += `- **Perusahaan Aktif (${activeCompany.nama})**: **${agg.compCustomerCount} pelanggan** *(sesuai dengan kartu KPI Dashboard)*\n`;
      res += `- **Total Global**: **${agg.globalCustomerCount} pelanggan**\n`;
      res += `- **Status Lead**: ${Object.entries(agg.leadTypeCounts).map(([k, v]) => `${k} (${v})`).join(', ')}\n\n`;
      res += `| No | Nama Pelanggan | Status Lead | Kota | Sales Penanggung Jawab |\n|---|---|---|---|---|\n`;
      agg.allowedCustomers.slice(0, 10).forEach((c, idx) => {
        res += `| ${idx + 1} | **${c.nama}** | ${c.leadType || '-'} | ${c.kota || '-'} | ${c.sales || '-'} |\n`;
      });
      return res;
    }

    // 3. Stok Menipis / Stok / Inventaris
    if (lower.includes('stok menipis') || lower.includes('menipis') || (lower.includes('stok') && !lower.includes('tambah'))) {
      let res = `### 📦 Status Stok Menipis (Menu Stocklist):\n`;
      res += `- **Perusahaan Aktif (${activeCompany.nama})**: **${agg.compLowStockCount} SKU** memiliki stok menipis (< 10 unit) *(sesuai dengan kartu KPI Dashboard)*.\n`;
      res += `- **Total SKU Produk**: **${agg.compProductCount} SKU** di perusahaan aktif (**${agg.globalProductCount} SKU** global).\n\n`;
      res += `| No | Nama Produk | Stok Tersedia | Batas Minimum | Satuan |\n|---|---|---|---|---|\n`;
      agg.compLowStockProducts.slice(0, 10).forEach((p, idx) => {
        const avail = agg.getCompAvailStock(p.nama);
        res += `| ${idx + 1} | **${p.nama}** | **${avail}** | < 10 | ${p.satuan || 'Unit'} |\n`;
      });
      return res;
    }

    // 4. Karyawan / HR / Gaji
    if (lower.includes('karyawan') || lower.includes('hr') || lower.includes('pegawai') || lower.includes('staf') || lower.includes('gaji')) {
      let res = `### 👥 Data Karyawan (${agg.allowedEmployees.length} Karyawan Terdaftar):\n\n`;
      res += `| No | Nama Karyawan | Jabatan / Role | No. WhatsApp ${isSuperAdmin ? '| Gaji Pokok ' : ''}|\n|---|---|---|---${isSuperAdmin ? '|---' : ''}|\n`;
      agg.allowedEmployees.forEach((e, idx) => {
        res += `| ${idx + 1} | **${e.nama}** | ${e.role} | ${e.whatsapp || '-'} ${isSuperAdmin && e.gaji ? `| Rp ${e.gaji.toLocaleString('id-ID')} ` : ''}|\n`;
      });
      return res;
    }

    // 5. Sales / Tim Penjualan / Performa Sales (Smart Filter per Sales Person & Month)
    const salesKeywords = ['sales', 'penjualan', 'kinerja', 'salesperson', 'marketing', 'omzet sales', 'performa sales'];
    const hasSalesKeyword = salesKeywords.some(kw => lower.includes(kw));

    // Find known sales reps from appUsers, employees, or transactions
    const knownSalesReps = Array.from(new Set([
      ...appUsers.filter(u => u.role === 'sales').map(u => u.nama.toLowerCase()),
      ...employees.filter(e => (e.role || '').toLowerCase().includes('sales')).map(e => e.nama.toLowerCase()),
      ...agg.allowedTransactions.map(t => (t.sales || t.salesName || '').toLowerCase()).filter(Boolean)
    ]));

    let targetSales: string | null = null;
    for (const sName of knownSalesReps) {
      if (!sName || sName.length < 2) continue;
      const reg = new RegExp(`\\b${sName}\\b`, 'i');
      if (reg.test(lower)) {
        targetSales = sName;
        break;
      }
    }

    if (!targetSales) {
      if (/\bmaria\b/i.test(lower) || lower.includes('maria')) targetSales = 'maria';
      else if (/\byadi\b/i.test(lower) || lower.includes('yadi')) targetSales = 'yadi';
      else if (/\bdwi\b/i.test(lower) || lower.includes('dwi')) targetSales = 'dwi';
      else if (/\bangel\b/i.test(lower) || lower.includes('angel')) targetSales = 'angel';
    }

    if (hasSalesKeyword || targetSales) {
      // Check month match using accurate month matcher
      const targetMonthObj = getMatchedMonthObject(lower);

      // Filter transactions according to targetSales and/or targetMonthObj
      let filteredTrx = agg.allowedTransactions;

      if (targetSales) {
        filteredTrx = filteredTrx.filter(t => (t.sales || t.salesName || '').toLowerCase().includes(targetSales));
      }

      if (targetMonthObj) {
        filteredTrx = filteredTrx.filter(t => {
          if (!t.tanggal) return false;
          const dLower = String(t.tanggal).toLowerCase();
          if (dLower.includes(targetMonthObj.name.toLowerCase()) || dLower.includes(targetMonthObj.key)) return true;
          if (dLower.includes(`-${targetMonthObj.numStr}-`) || dLower.includes(`/${targetMonthObj.numStr}/`)) return true;
          const d = new Date(t.tanggal);
          if (!isNaN(d.getTime())) {
            return String(d.getMonth() + 1).padStart(2, '0') === targetMonthObj.numStr;
          }
          return false;
        });
      }

      // Display Title
      let titleHeader = `### 🏆 Performa Sales`;
      if (targetSales) titleHeader += ` - **${targetSales.toUpperCase()}**`;
      if (targetMonthObj) titleHeader += ` (Bulan **${targetMonthObj.name}**)`;
      else titleHeader += ` (Keseluruhan / All-Time)`;

      let res = `${titleHeader}:\n\n`;

      if (filteredTrx.length === 0) {
        res += `⚠️ *Tidak ditemukan catatan transaksi untuk ${targetSales ? `sales **${targetSales.toUpperCase()}**` : 'tim sales'} ${targetMonthObj ? `pada bulan **${targetMonthObj.name}**` : ''}.*\n\n`;
        res += `**Daftar Ringkas Performa Seluruh Tim Sales (All-Time):**\n\n`;
        res += `| No | Nama Sales | Total Trx | Omzet Selesai |\n|---|---|---|---|\n`;
        Object.entries(agg.salesPerformance).sort((a, b) => b[1].omzet - a[1].omzet).forEach(([sName, d], idx) => {
          res += `| ${idx + 1} | **${sName}** | ${d.trxCount} transaksi | **Rp ${d.omzet.toLocaleString('id-ID')}** |\n`;
        });
        return res;
      }

      // Calculate totals for filtered transactions
      let totalRealOmzet = 0;
      let totalPenawaranVal = 0;
      let realDealCount = 0;
      let quoteCount = 0;

      const salesProductMap: Record<string, { qty: number; subtotal: number }> = {};

      filteredTrx.forEach(t => {
        const amt = getTrxAmount(t);
        const stList = t.statuses && t.statuses.length > 0 ? t.statuses : [t.status || 'Draft'];
        const isQ = stList.includes('Penawaran') || t.status === 'Penawaran';
        const isCan = stList.includes('Pesanan Batal') || t.status === 'Pesanan Batal';

        if (!isQ && !isCan) {
          totalRealOmzet += amt;
          realDealCount++;
          (t.items || []).forEach(it => {
            const pName = it.nama?.trim();
            if (pName) {
              const pQty = Number(it.qty) || 1;
              const pSub = (Number(it.harga) || 0) * pQty;
              if (!salesProductMap[pName]) salesProductMap[pName] = { qty: 0, subtotal: 0 };
              salesProductMap[pName].qty += pQty;
              salesProductMap[pName].subtotal += pSub;
            }
          });
        } else if (isQ) {
          totalPenawaranVal += amt;
          quoteCount++;
        }
      });

      res += `- **Total Transaksi Deal/Selesai**: ${realDealCount} transaksi\n`;
      res += `- **Total Omzet Penjualan Real**: **Rp ${totalRealOmzet.toLocaleString('id-ID')}**\n`;
      if (quoteCount > 0) {
        res += `- **Total Penawaran (Quotation) Berjalan**: ${quoteCount} penawaran (Nilai: Rp ${totalPenawaranVal.toLocaleString('id-ID')})\n`;
      }
      res += `\n`;

      // 1. Transaction Table Breakdown
      res += `#### 📑 Rincian Daftar Transaksi (${filteredTrx.length} Transaksi):\n\n`;
      res += `| No | No. Trx | Tanggal | Pelanggan | Sales | Nominal Rp | Status |\n|---|---|---|---|---|---|---|\n`;
      filteredTrx.slice(0, 20).forEach((t, idx) => {
        const amt = getTrxAmount(t);
        res += `| ${idx + 1} | **${t.noTrx || t.id}** | ${t.tanggal || '-'} | ${t.customerName || '-'} | ${t.sales || t.salesName || 'Sales'} | Rp ${amt.toLocaleString('id-ID')} | [${t.status || 'Selesai'}] |\n`;
      });

      if (filteredTrx.length > 20) {
        res += `\n*...dan ${filteredTrx.length - 20} transaksi lainnya.* \n`;
      }

      // 2. Product breakdown if available
      const topProds = Object.entries(salesProductMap).sort((a, b) => b[1].subtotal - a[1].subtotal);
      if (topProds.length > 0) {
        res += `\n#### 📦 Rincian Produk Terjual:\n\n`;
        res += `| No | Nama Produk | Unit Terjual | Total Subtotal Rp |\n|---|---|---|---|\n`;
        topProds.slice(0, 10).forEach(([pName, d], idx) => {
          res += `| ${idx + 1} | **${pName}** | ${d.qty} unit | Rp ${d.subtotal.toLocaleString('id-ID')} |\n`;
        });
      }

      return res;
    }

    // 6. Supplier / Vendor
    if (lower.includes('supplier') || lower.includes('vendor')) {
      let res = `### 🏢 Data Supplier (${agg.allowedSuppliers.length} Supplier Terdaftar):\n\n`;
      res += `| No | Nama Supplier | Kode | Kontak |\n|---|---|---|---|\n`;
      agg.allowedSuppliers.forEach((s, idx) => {
        res += `| ${idx + 1} | **${s.nama}** | ${s.kode || '-'} | ${s.phone || '-'} |\n`;
      });
      return res;
    }

    // 7. Purchase Order / PO
    if (lower.includes('purchase order') || lower.includes('po ') || lower.endsWith('po')) {
      let res = `### 📑 Data Purchase Order (${agg.allowedPOs.length} PO Terdaftar):\n`;
      res += `- **Total Nilai PO**: **Rp ${agg.totalPOAmount.toLocaleString('id-ID')}**\n`;
      res += `- **Status**: ${Object.entries(agg.poStatusCounts).map(([k, v]) => `${k} (${v})`).join(', ')}\n\n`;
      res += `| No | No. PO | Supplier | Tanggal | Nominal | Status |\n|---|---|---|---|---|---|\n`;
      agg.poList.slice(0, 10).forEach((po, idx) => {
        res += `| ${idx + 1} | **${po.noPO}** | ${po.supplier} | ${po.tanggal} | Rp ${po.total.toLocaleString('id-ID')} | ${po.status} |\n`;
      });
      return res;
    }

    // 8. Finance / Piutang / Hutang / PPN / Ongkir
    if (lower.includes('piutang') || lower.includes('hutang') || lower.includes('finance') || lower.includes('ppn') || lower.includes('ongkir')) {
      let res = `### 💳 Ringkasan Finansial & Keuangan (Menu FINANCE):\n`;
      res += `- **Piutang Usaha**: **Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')}** (${agg.totalPiutangInvoices} invoice belum lunas)\n`;
      res += `- **Hutang Usaha**: **Rp ${agg.totalHutangAmount.toLocaleString('id-ID')}** (PO belum lunas)\n`;
      res += `- **Transaksi PPN 11%**: **${agg.ppnTrxCount} transaksi** (Estimasi PPN: **Rp ${agg.ppnEstimatedValue.toLocaleString('id-ID')}**)\n`;
      res += `- **Transaksi Non-PPN**: **${agg.nonPpnTrxCount} transaksi**\n`;
      res += `- **Ongkos Kirim**: **${agg.ongkirTrxCount} transaksi** (Total: **Rp ${agg.totalOngkirValue.toLocaleString('id-ID')}**)\n\n`;
      if (agg.unpaidInvoicesList.length > 0) {
        res += `#### Daftar Piutang Belum Lunas:\n`;
        res += `| No | No. Trx | Pelanggan | Tanggal | Sisa Tagihan |\n|---|---|---|---|---|\n`;
        agg.unpaidInvoicesList.slice(0, 8).forEach((u, idx) => {
          res += `| ${idx + 1} | **${u.noTrx}** | ${u.customer} | ${u.tanggal} | **Rp ${u.sisa.toLocaleString('id-ID')}** |\n`;
        });
      }
      return res;
    }

    // 9. Penawaran (Quotes)
    if (lower.includes('penawaran') || lower.includes('quotation') || lower.includes('quote')) {
      let res = `### 📋 Data Penawaran Harga (Menu BRM / Penawaran):\n`;
      res += `- **Total Penawaran**: **${agg.totalQuotes} penawaran**\n`;
      res += `- **Status Follow-Up**: **${agg.followedUpQuotes} sudah follow-up**, **${agg.totalQuotes - agg.followedUpQuotes} belum**\n\n`;
      res += `| No | No. Penawaran | Pelanggan | Tanggal | Nominal | Status Follow-Up |\n|---|---|---|---|---|---|\n`;
      agg.quoteList.slice(0, 10).forEach((q, idx) => {
        res += `| ${idx + 1} | **${q.noTrx}** | ${q.customer} | ${q.tanggal} | Rp ${q.total.toLocaleString('id-ID')} | ${q.followedUp ? '✅ Selesai' : '⏳ Pending'} |\n`;
      });
      return res;
    }

    // 10. Bulan Tertentu (Agustus, Juli, dsb)
    if (matchedMonth) {
      const matchingKeys = Object.keys(agg.monthlyData).filter(k => k.toLowerCase().includes(matchedMonth));
      if (matchingKeys.length === 0) {
        return `Tidak ditemukan data transaksi penjualan untuk bulan **${matchedMonth.toUpperCase()}** pada sistem.`;
      }

      let res = `### 📊 Rekap Transaksi Penjualan Bulan ${matchedMonth.toUpperCase()}\n\n`;
      matchingKeys.forEach(pKey => {
        const m = agg.monthlyData[pKey];
        const sortedProducts = Object.entries(m.productSales).sort((a, b) => b[1].qty - a[1].qty || b[1].revenue - a[1].revenue);

        res += `**Periode Laporan**: **${pKey}**\n`;
        res += `- **Total Seluruh Pesanan**: **${m.totalTrx} transaksi**\n`;
        res += `- **Total Nilai Penjualan**: **Rp ${m.omzet.toLocaleString('id-ID')}**\n\n`;

        // 1. Order Status Breakdown
        res += `#### 🚚 1. Rincian Berdasarkan Status Pesanan (Pipeline Status)\n`;
        res += `| Status Pesanan | Jumlah Trx | Total Nominal (Rp) | Persentase Omzet |\n|---|---|---|---|\n`;
        Object.entries(m.statusBreakdown).sort((a, b) => b[1].revenue - a[1].revenue).forEach(([st, d]) => {
          const pct = m.omzet > 0 ? ((d.revenue / m.omzet) * 100).toFixed(1) : '0';
          res += `| **${st}** | ${d.count} transaksi | **Rp ${d.revenue.toLocaleString('id-ID')}** | ${pct}% |\n`;
        });
        res += `\n`;

        // 2. Payment Status Breakdown
        res += `#### 💳 2. Rincian Berdasarkan Status Pembayaran\n`;
        res += `| Status Pembayaran | Jumlah Trx | Total Nominal Tagihan (Rp) |\n|---|---|---|\n`;
        Object.entries(m.paymentStatusBreakdown).sort((a, b) => b[1].revenue - a[1].revenue).forEach(([pst, d]) => {
          res += `| **${pst}** | ${d.count} transaksi | **Rp ${d.revenue.toLocaleString('id-ID')}** |\n`;
        });
        res += `\n`;

        // 3. Top Products
        if (sortedProducts.length > 0) {
          res += `#### 📦 3. Produk Terlaris Bulan ${pKey}\n`;
          res += `| No | Nama Produk | Qty Terjual | Total Omzet |\n|---|---|---|---|\n`;
          sortedProducts.slice(0, 10).forEach(([pName, pData], idx) => {
            res += `| ${idx + 1} | **${pName}** | ${pData.qty} unit | Rp ${pData.revenue.toLocaleString('id-ID')} |\n`;
          });
          res += `\n`;
        }

        // 4. Sample Transaction List
        if (m.trxList && m.trxList.length > 0) {
          res += `#### 📄 4. Daftar Transaksi Terdaftar di Bulan ${pKey}\n`;
          res += `| No | No. Trx | Pelanggan | Tanggal | Nominal | Status Pesanan | Status Bayar | Sales |\n|---|---|---|---|---|---|---|---|\n`;
          m.trxList.slice(0, 10).forEach((tx, idx) => {
            res += `| ${idx + 1} | **${tx.noTrx}** | ${tx.customer} | ${tx.tanggal} | Rp ${tx.total.toLocaleString('id-ID')} | ${tx.status} | ${tx.paymentStatus} | ${tx.sales} |\n`;
          });
          res += `\n`;
        }
      });
      return res;
    }

    if (lower.includes('terlaris') || lower.includes('top produk')) {
      const sorted = Object.entries(agg.soldQuantities).sort((a, b) => b[1].qty - a[1].qty || b[1].revenue - a[1].revenue);
      let res = `### 🏆 Top Produk Terlaris Keseluruhan (All-Time)\n\n| No | Nama Produk | Qty Terjual | Total Omzet |\n|---|---|---|---|\n`;
      sorted.slice(0, 10).forEach(([pName, d], idx) => {
        res += `| ${idx + 1} | **${pName}** | ${d.qty} unit | Rp ${d.revenue.toLocaleString('id-ID')} |\n`;
      });
      return res;
    }

    if (lower.includes('omzet') || lower.includes('pendapatan')) {
      return `### 💰 Ringkasan Omzet Bisnis
- **Omzet Selesai / Lunas**: **Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')}**
- **Total Seluruh Transaksi**: **Rp ${agg.totalAllRevenue.toLocaleString('id-ID')}**
- **Jumlah Transaksi**: **${agg.allowedTransactions.length} transaksi**
- **Piutang Usaha**: **Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')}**`;
    }

    return `### Ringkasan Lengkap Data Sistem MyPanca (${activeCompany.nama})
- **Dashboard KPI**: ${agg.compCustomerCount} Total Customer | ${agg.compLowStockCount} Stok Menipis (< 10 unit)
- **Menu BRM**: ${agg.compCustomerCount} Kontak Pelanggan | ${agg.totalQuotes} Penawaran
- **Menu TRADE**: ${agg.allowedTransactions.length} Transaksi (Omzet Selesai: Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')})
- **Menu Stocklist & Purchasing**: ${agg.compProductCount} SKU Produk | ${agg.allowedSuppliers.length} Supplier | ${agg.allowedPOs.length} PO (Rp ${agg.totalPOAmount.toLocaleString('id-ID')})
- **Menu Finance**: Piutang Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} | Hutang Rp ${agg.totalHutangAmount.toLocaleString('id-ID')} | PPN ${agg.ppnTrxCount} Trx
- **Menu HR**: ${agg.allowedEmployees.length} Karyawan (${agg.allowedEmployees.map(e => e.nama).join(', ')})
- **Menu Admin**: ${agg.allowedAppUsers.length} Pengguna Sistem | ${agg.allowedDeletedItems.length} Item Recycle Bin

Semua data di semua menu telah terbaca secara aktif. Silakan tanyakan informasi spesifik yang Anda butuhkan!`;
  };

  // Step-by-Step Guided Questions Handler
  const handleStepByStepInput = (userText: string): { responseText: string; draftData?: DraftInputData; nextSession: typeof activeSession } => {
    const lower = userText.toLowerCase().trim();

    if (lower === 'batal' || lower === '/batal' || lower === 'cancel' || lower === '/cancel') {
      return {
        responseText: `ℹ️ **Mode Input AI telah dibatalkan.**\n\nSilakan tanyakan informasi data atau ketik \`/input\` kapan saja jika ingin memulai kembali.`,
        nextSession: null
      };
    }

    if (!activeSession) return { responseText: '', nextSession: null };

    // 1. CUSTOMER STEP-BY-STEP
    if (activeSession.type === 'customer') {
      const data = { ...activeSession.data };

      if (activeSession.step === 1) {
        data.nama = userText.trim();
        data.perusahaan = userText.trim();
        return {
          responseText: `### 👥 Input Customer Baru (Langkah 2 dari 4)\n\n- **Nama Customer**: **${data.nama}** ✅\n\nSelanjutnya, berapa **No. WhatsApp / Telepon** untuk **${data.nama}**?\n*(Contoh: 08123456789)*\n\n*(Ketik \`batal\` jika ingin membatalkan)*`,
          nextSession: { type: 'customer', step: 2, data }
        };
      }

      if (activeSession.step === 2) {
        const cleanWa = userText.replace(/[^0-9]/g, '') || userText.trim();
        data.whatsapp = cleanWa;
        data.phone = cleanWa;
        return {
          responseText: `### 👥 Input Customer Baru (Langkah 3 dari 4)\n\n- **Nama Customer**: **${data.nama}** ✅\n- **No. WA / Telepon**: **${data.whatsapp}** ✅\n\nSelanjutnya, di **Kota / Wilayah** mana **${data.nama}** berlokasi?\n*(Contoh: Surabaya)*`,
          nextSession: { type: 'customer', step: 3, data }
        };
      }

      if (activeSession.step === 3) {
        data.kota = userText.trim();
        return {
          responseText: `### 👥 Input Customer Baru (Langkah 4 dari 4)\n\n- **Nama Customer**: **${data.nama}** ✅\n- **No. WA / Telepon**: **${data.whatsapp}** ✅\n- **Kota**: **${data.kota}** ✅\n\nLangkah Terakhir! Siapa **Nama PIC / Kontak** dan **Sales Penanggung Jawab**?\n*(Contoh: \`PIC Budi, Sales Andi\` atau ketik \`-\` jika menggunakan default)*`,
          nextSession: { type: 'customer', step: 4, data }
        };
      }

      if (activeSession.step === 4) {
        const picMatch = userText.match(/(?:pic)[\s:]*([a-z\s]+?)(?:,|$)/i);
        const salesMatch = userText.match(/(?:sales)[\s:]*([a-z\s]+?)(?:,|$)/i);

        const picName = picMatch?.[1]?.trim() || (userText !== '-' ? userText.trim() : data.nama);
        const salesName = salesMatch?.[1]?.trim() || currentUser?.nama || 'General Sales';

        data.pic = picName;
        data.sales = salesName;
        data.leadType = 'Belum Transaksi';

        return {
          responseText: `### 📝 PRATINJAU DRAFT FORM CUSTOMER BARU (SIAP DISIMPAN)\n\nSeluruh data wajib & opsional telah berhasil terkumpul:\n\n| Field Form Asli | Nilai Terbaca | Status Validasi |\n|---|---|---|\n| **Nama Customer** | **${data.nama}** | ✅ Valid |\n| **No. WA / Telepon** | **${data.whatsapp}** | ✅ Valid |\n| **Kota / Wilayah** | **${data.kota}** | ✅ Valid |\n| **Sales Penanggung Jawab** | **${data.sales}** | ✅ Terhubung |\n| **Nama PIC** | **${data.pic}** | ℹ️ Terisi |\n| **Status Lead** | **Belum Transaksi** | 🟢 Default |\n\n---\n⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
          draftData: {
            type: 'customer',
            payload: data,
            isSaved: false
          },
          nextSession: null
        };
      }
    }

    // 2. TRANSAKSI STEP-BY-STEP
    if (activeSession.type === 'transaction') {
      const data = { ...activeSession.data };

      if (activeSession.step === 1) {
        data.customerName = userText.trim();
        return {
          responseText: `### 🛍️ Input Transaksi Penjualan (Langkah 2 dari 4)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n\nSelanjutnya, **Produk** apa yang dibeli dan berapa jumlahnya?\n*(Contoh: Phostoxin 10 kaleng)*`,
          nextSession: { type: 'transaction', step: 2, data }
        };
      }

      if (activeSession.step === 2) {
        data.productName = userText.trim();
        return {
          responseText: `### 🛍️ Input Transaksi Penjualan (Langkah 3 dari 4)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n- **Produk Dibeli**: **${data.productName}** ✅\n\nSelanjutnya, berapa **Total Nominal Transaksi (Rp)**?\n*(Contoh: 15.000.000 atau 15 juta)*`,
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
          responseText: `### 🛍️ Input Transaksi Penjualan (Langkah 4 dari 4)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n- **Produk Dibeli**: **${data.productName}** ✅\n- **Total Nominal**: **Rp ${data.totalAmount.toLocaleString('id-ID')}** ✅\n\nLangkah Terakhir! Apakah status pembayaran transaksi ini **Lunas** atau **Belum Lunas**?\n*(Ketik \`Lunas\` atau \`Belum Lunas\`)*`,
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

    // 3. PENAWARAN STEP-BY-STEP
    if (activeSession.type === 'penawaran') {
      const data = { ...activeSession.data };

      if (activeSession.step === 1) {
        data.customerName = userText.trim();
        return {
          responseText: `### 📋 Input Penawaran Harga (Langkah 2 dari 3)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n\nSelanjutnya, **Item / Produk** apa yang ditawarkan?\n*(Contoh: Fumiphos 5 box)*`,
          nextSession: { type: 'penawaran', step: 2, data }
        };
      }

      if (activeSession.step === 2) {
        data.productName = userText.trim();
        return {
          responseText: `### 📋 Input Penawaran Harga (Langkah 3 dari 3)\n\n- **Nama Pelanggan**: **${data.customerName}** ✅\n- **Produk Ditawarkan**: **${data.productName}** ✅\n\nSelanjutnya, berapa **Total Nilai Penawaran (Rp)**?\n*(Contoh: 8.000.000 atau 8 juta)*`,
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

    // 4. PRODUCT SPEC PROMPT RESPONSE
    if (activeSession.type === 'product_spec_prompt') {
      const data = { ...activeSession.data };
      const lowerResp = userText.toLowerCase().trim();
      const isAffirmative = lowerResp.includes('ya') || lowerResp.includes('boleh') || lowerResp.includes('mau') || lowerResp.includes('isi') || lowerResp.includes('ok') || lowerResp.includes('siap') || lowerResp.includes('setuju');

      if (isAffirmative) {
        const pName = data.productName || 'Produk';
        return {
          responseText: `### 📦 Pengisian Spesifikasi Produk: **${pName}** (Langkah 1 dari 6)\n\nLangkah 1: **Fungsi Utama**\nApa fungsi utama dari produk **${pName}**?\n*(Contoh: Insektisida / Fumigan serbaguna untuk gudang penyimpanan beras & gandum)*`,
          nextSession: { type: 'product_spec', step: 1, data }
        };
      } else {
        return {
          responseText: `Baik, tidak apa-apa! Jika sewaktu-waktu Anda ingin melengkapi data spesifikasi produk **${data.productName || ''}**, Anda dapat mengetikkan \`/input spesifikasi\` atau tanyakan kembali kapan saja. 😊`,
          nextSession: null
        };
      }
    }

    // 5. PRODUCT SPECIFICATION STEP-BY-STEP
    if (activeSession.type === 'product_spec') {
      const data = { ...activeSession.data };

      if (activeSession.step === 1) {
        data.mainFunction = userText.trim();
        return {
          responseText: `### 📦 Pengisian Spesifikasi Produk: **${data.productName}** (Langkah 2 dari 6)\n\n- **Fungsi Utama**: **${data.mainFunction}** ✅\n\nLangkah 2: **Aplikasi Utama**\nApa sektor/bidang aplikasi utama penggunaan produk ini?\n*(Contoh: Gudang pangan, kargo kapal, atau pabrik pemrosesan makanan)*`,
          nextSession: { type: 'product_spec', step: 2, data }
        };
      }

      if (activeSession.step === 2) {
        data.mainApplication = userText.trim();
        return {
          responseText: `### 📦 Pengisian Spesifikasi Produk: **${data.productName}** (Langkah 3 dari 6)\n\n- **Fungsi Utama**: **${data.mainFunction}** ✅\n- **Aplikasi Utama**: **${data.mainApplication}** ✅\n\nLangkah 3: **Spesifikasi Teknis / Bahan / Kemasan**\nSebutkan spesifikasi teknis detail (bahan aktif, konsentrasi, atau isi kemasan)?\n*(Contoh: Aluminium Phosphide 56%, kemasan kaleng 1 kg isi 334 tablet)*`,
          nextSession: { type: 'product_spec', step: 3, data }
        };
      }

      if (activeSession.step === 3) {
        data.specifications = userText.trim();
        return {
          responseText: `### 📦 Pengisian Spesifikasi Produk: **${data.productName}** (Langkah 4 dari 6)\n\n- **Fungsi Utama**: **${data.mainFunction}** ✅\n- **Aplikasi Utama**: **${data.mainApplication}** ✅\n- **Spesifikasi Detail**: **${data.specifications}** ✅\n\nLangkah 4: **Ukuran Dimensi (cm)**\nBerapa ukuran dimensi produk dalam cm (Panjang x Lebar x Tinggi)?\n*(Contoh: \`20 x 15 x 25\` atau ketik \`-\` jika tidak ada)*`,
          nextSession: { type: 'product_spec', step: 4, data }
        };
      }

      if (activeSession.step === 4) {
        const nums = userText.match(/\d+(?:\.\d+)?/g);
        data.panjang = nums?.[0] ? parseFloat(nums[0]) : 0;
        data.lebar = nums?.[1] ? parseFloat(nums[1]) : 0;
        data.tinggi = nums?.[2] ? parseFloat(nums[2]) : 0;
        return {
          responseText: `### 📦 Pengisian Spesifikasi Produk: **${data.productName}** (Langkah 5 dari 6)\n\n- **Fungsi Utama**: **${data.mainFunction}** ✅\n- **Aplikasi Utama**: **${data.mainApplication}** ✅\n- **Spesifikasi Detail**: **${data.specifications}** ✅\n- **Dimensi (P x L x T)**: **${data.panjang} x ${data.lebar} x ${data.tinggi} cm** ✅\n\nLangkah 5: **Berat Produk (kg)**\nBerapa berat bersih/kotor produk dalam kg?\n*(Contoh: \`1.2\` atau \`1\`)*`,
          nextSession: { type: 'product_spec', step: 5, data }
        };
      }

      if (activeSession.step === 5) {
        const wNums = userText.match(/\d+(?:\.\d+)?/g);
        data.berat = wNums?.[0] ? parseFloat(wNums[0]) : 0;
        return {
          responseText: `### 📦 Pengisian Spesifikasi Produk: **${data.productName}** (Langkah 6 dari 6)\n\n- **Fungsi Utama**: **${data.mainFunction}** ✅\n- **Aplikasi Utama**: **${data.mainApplication}** ✅\n- **Spesifikasi Detail**: **${data.specifications}** ✅\n- **Dimensi (P x L x T)**: **${data.panjang} x ${data.lebar} x ${data.tinggi} cm** ✅\n- **Berat**: **${data.berat} kg** ✅\n\nLangkah 6: **Catatan / Remarks Tambahan**\nApakah ada catatan atau rekomendasi penyimpanan/penggunaan?\n*(Contoh: Simpan di ruangan sejuk & kering atau ketik \`-\` jika tidak ada)*`,
          nextSession: { type: 'product_spec', step: 6, data }
        };
      }

      if (activeSession.step === 6) {
        data.remarks = userText !== '-' ? userText.trim() : 'Tidak ada catatan';
        return {
          responseText: `### 📝 PRATINJAU DRAFT SPESIFIKASI PRODUK (SIAP DISIMPAN)\n\nSeluruh data spesifikasi untuk produk **${data.productName}** telah berhasil terkumpul:\n\n| Field Spesifikasi Form | Nilai Terbaca | Status Validasi |\n|---|---|---|\n| **Nama Produk** | **${data.productName}** | ✅ Valid |\n| **Fungsi Utama** | **${data.mainFunction}** | ✅ Tervalidasi |\n| **Aplikasi Utama** | **${data.mainApplication}** | ✅ Tervalidasi |\n| **Spesifikasi Detail** | **${data.specifications}** | ✅ Tervalidasi |\n| **Dimensi (P x L x T)** | **${data.panjang} x ${data.lebar} x ${data.tinggi} cm** | 📐 Terukur |\n| **Berat** | **${data.berat} kg** | ⚖️ Terukur |\n| **Catatan / Remarks** | **${data.remarks}** | 📝 Tervalidasi |\n\n---\n⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
          draftData: {
            type: 'product_spec',
            payload: data,
            isSaved: false
          },
          nextSession: null
        };
      }
    }

    return { responseText: '', nextSession: null };
  };

  // Input AI Command Parser & Draft Card Generator
  const handleInputAiCommand = (text: string): { responseText: string; draftData?: DraftInputData; nextSession?: typeof activeSession } => {
    const lower = text.toLowerCase().trim();

    // 1. Generic Menu Choice
    if (lower === '/input' || lower === '/input ai' || lower === 'input ai' || lower === '/tambah' || lower === 'tambah ai') {
      return {
        responseText: `### 📝 Mode Input AI MyPanca (Guided Assistant)

Silakan pilih atau ketikkan jenis data yang ingin Anda input ke dalam sistem:

1. 👥 **/input customer** — *Input Kontak Pelanggan Baru (Menu BRM)*
2. 📋 **/input penawaran** — *Input Penawaran Harga / Quotation (Menu BRM)*
3. 🛍️ **/input transaksi** — *Input Transaksi Penjualan Baru (Menu Trade)*

---
💡 **Atau Anda bisa langsung mengetikkan kalimat perintah lengkap, contoh:**
- \`Input customer PT Jaya Abadi, WA 08123456789, Surabaya, PIC Pak Budi, Sales Andi\`
- \`Input transaksi PT Jaya Abadi, produk Phostoxin 10 kaleng, total 15 juta, lunas\`
- \`Input penawaran Toko Sinar, produk Fumiphos 5 box, total 8 juta\``
      };
    }

    // 2. Customer Input
    if (lower.startsWith('/input customer') || lower.startsWith('input customer') || lower.startsWith('/tambah customer') || lower.startsWith('tambah customer')) {
      const rawData = text.replace(/^(\/input customer|input customer|\/tambah customer|tambah customer)/i, '').trim();

      if (!rawData) {
        return {
          responseText: `### 👥 Input Customer Baru (Langkah 1 dari 4)

Mari kita isi data customer baru satu per satu!

Silakan masukkan **Nama Pelanggan / Perusahaan**:
*(Contoh: PT Jaya Abadi)*

*(Ketik \`batal\` kapan saja jika ingin membatalkan)*`,
          nextSession: { type: 'customer', step: 1, data: {} }
        };
      }

      // Regex / Splitting parameter extraction
      const parts = rawData.split(',').map(s => s.trim());
      const waMatch = rawData.match(/(?:wa|phone|hp|telp|whatsapp)[\s:]*([0-9\-\+\s]{9,15})/i) || rawData.match(/\b(08[0-9\s\-]{8,13})\b/);
      
      const name = parts[0] || 'Customer Baru';
      const wa = waMatch?.[1]?.replace(/[^0-9]/g, '') || parts.find(p => /08[0-9]{8,}/.test(p)) || '08123456789';
      const city = parts.find(p => !p.includes('08') && !p.toLowerCase().includes('sales') && !p.toLowerCase().includes('pic') && p !== parts[0]) || 'Surabaya';
      const salesMatch = rawData.match(/(?:sales)[\s:]*([a-z\s]+?)(?:,|$)/i);
      const salesName = salesMatch?.[1]?.trim() || currentUser?.nama || 'General Sales';
      const picMatch = rawData.match(/(?:pic)[\s:]*([a-z\s]+?)(?:,|$)/i);
      const picName = picMatch?.[1]?.trim() || name;

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
        responseText: `### 📝 DRAFT FORM CUSTOMER BARU (BRM CONTACTS)

AI telah mengekstrak parameter data sesuai Form Asli MyPanca:

| Field Form Asli | Nilai Terbaca | Status Validasi |
|---|---|---|
| **Nama Customer** | **${name}** | ✅ Valid |
| **No. WA / Telepon** | **${wa}** | ✅ Valid |
| **Kota / Wilayah** | **${city}** | ✅ Valid |
| **Sales Penanggung Jawab** | **${salesName}** | ✅ Terhubung |
| **Status Lead** | **Belum Transaksi** | 🟢 Aktif |
| **Nama PIC** | **${picName}** | ℹ️ Terisi |

---
⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
        draftData: {
          type: 'customer',
          payload: draftPayload,
          isSaved: false
        },
        nextSession: null
      };
    }

    // 3. Transaction / Penawaran Input
    if (lower.startsWith('/input transaksi') || lower.startsWith('input transaksi') || lower.startsWith('/input penawaran') || lower.startsWith('input penawaran') || lower.startsWith('/tambah transaksi') || lower.startsWith('tambah transaksi')) {
      const isQuote = lower.includes('penawaran');
      const prefixRegex = /^(\/input transaksi|input transaksi|\/input penawaran|input penawaran|\/tambah transaksi|tambah transaksi)/i;
      const rawData = text.replace(prefixRegex, '').trim();

      if (!rawData) {
        return {
          responseText: `### ${isQuote ? '📋 Input Penawaran Harga Baru' : '🛍️ Input Transaksi Penjualan Baru'} (Langkah 1 dari ${isQuote ? '3' : '4'})

Mari kita isi data ${isQuote ? 'penawaran' : 'transaksi'} baru satu per satu!

Siapa **Nama Pelanggan** untuk ${isQuote ? 'penawaran' : 'transaksi'} ini?
*(Contoh: PT Jaya Abadi)*

*(Ketik \`batal\` kapan saja jika ingin membatalkan)*`,
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
        responseText: `### 📝 DRAFT FORM ${isQuote ? 'PENAWARAN' : 'TRANSAKSI PENJUALAN'} BARU

AI telah mengekstrak parameter data sesuai Form Asli MyPanca:

| Field Form Asli | Nilai Terbaca | Status Validasi |
|---|---|---|
| **No. ${isQuote ? 'Penawaran' : 'Transaksi'}** | **${draftPayload.noTrx}** | 🟢 Auto-Generate |
| **Nama Pelanggan** | **${custName}** | ✅ Valid |
| **Item Produk** | **${prodName}** | ✅ Valid |
| **Total Nominal** | **Rp ${totalAmt.toLocaleString('id-ID')}** | ✅ Valid |
| **Status** | **${isQuote ? 'Penawaran Berjalan' : 'Selesai'}** | 📌 Status Fix |
| **Status Pembayaran** | **${isPaid ? 'Lunas' : 'Belum Lunas'}** | 💳 Valid |
| **Sales** | **${draftPayload.sales}** | ✅ Terhubung |

---
⚠️ **Silakan periksa kembali data di atas.** Klik tombol di bawah untuk mengonfirmasi dan menyimpan ke database MyPanca!`,
        draftData: {
          type: isQuote ? 'penawaran' : 'transaction',
          payload: draftPayload,
          isSaved: false
        },
        nextSession: null
      };
    }

    return { responseText: '' };
  };

  const handleConfirmDraftSave = (messageId: string) => {
    const targetMsg = messages.find(m => m.id === messageId);
    if (!targetMsg || !targetMsg.draftData || targetMsg.draftData.isSaved) return;

    const { type, payload } = targetMsg.draftData;

    try {
      if (type === 'customer') {
        const newCust: Customer = {
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
              content: m.content + `\n\n---\n🎉 **SUKSES TERSIMPAN KE BRM CONTACTS!**\n\nData customer **${newCust.nama}** (${newCust.kota}) telah resmi tersimpan ke database MyPanca untuk perusahaan **${activeCompany.nama}**.`,
              draftData: { ...m.draftData!, isSaved: true }
            };
          }
          return m;
        }));
      } else if (type === 'transaction' || type === 'penawaran') {
        const newTrx: Transaction = {
          id: 'TRX-' + Date.now(),
          noTrx: payload.noTrx || ('TRX-' + Date.now()),
          customerName: payload.customerName,
          tanggal: payload.tanggal || new Date().toISOString().split('T')[0],
          total: payload.total || 1000000,
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

        const targetMenu = type === 'penawaran' ? 'BRM Penawaran' : 'Trade Transaksi';

        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              content: m.content + `\n\n---\n🎉 **SUKSES TERSIMPAN KE MENU ${targetMenu.toUpperCase()}!**\n\nData **${newTrx.noTrx}** (${newTrx.customerName}) senilai **Rp ${newTrx.total.toLocaleString('id-ID')}** telah resmi tersimpan ke database MyPanca.`,
              draftData: { ...m.draftData!, isSaved: true }
            };
          }
          return m;
        }));
      } else if (type === 'product_spec') {
        const targetProdId = payload.productId || payload.id;
        const existingProd = products.find(p => p.id === targetProdId || p.nama.toLowerCase() === (payload.productName || '').toLowerCase());
        
        if (existingProd) {
          const updatedProd: Product = {
            ...existingProd,
            mainFunction: payload.mainFunction || existingProd.mainFunction || '',
            mainApplication: payload.mainApplication || existingProd.mainApplication || '',
            specifications: payload.specifications || existingProd.specifications || '',
            panjang: payload.panjang ?? existingProd.panjang ?? 0,
            lebar: payload.lebar ?? existingProd.lebar ?? 0,
            tinggi: payload.tinggi ?? existingProd.tinggi ?? 0,
            berat: payload.berat ?? existingProd.berat ?? 0,
            remarks: payload.remarks || existingProd.remarks || ''
          };

          if (setProducts) {
            setProducts(prev => prev.map(p => p.id === updatedProd.id ? updatedProd : p));
          }
          if (syncToSupabase) {
            syncToSupabase('products', updatedProd);
          }

          setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
              return {
                ...m,
                content: m.content + `\n\n---\n🎉 **SPESIFIKASI PRODUK SUKSES TERSIMPAN!**\n\nData spesifikasi detail untuk produk **${updatedProd.nama}** telah resmi tersimpan dan diperbarui ke database MyPanca. AI kini dapat membaca spesifikasi produk ini secara lengkap!`,
                draftData: { ...m.draftData!, isSaved: true }
              };
            }
            return m;
          }));
        }
      }
    } catch (err) {
      console.error("Error saving AI draft:", err);
      alert("Gagal menyimpan data draft AI. Silakan coba lagi.");
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const userText = (textToSend || inputPrompt).trim();
    if (!userText || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputPrompt('');

    // 1. Check if user is in an active step-by-step input session
    const lowerUser = userText.toLowerCase().trim();
    if (activeSession && !lowerUser.startsWith('/')) {
      const stepRes = handleStepByStepInput(userText);
      if (stepRes.responseText) {
        if (stepRes.nextSession !== undefined) {
          setActiveSession(stepRes.nextSession);
        }
        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: stepRes.responseText,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          draftData: stepRes.draftData,
          isNew: true
        };
        setMessages(prev => [...prev, aiMessage]);
        return;
      }
    }

    // 2. Check if command is an /input AI command
    if (lowerUser.startsWith('/') || lowerUser.includes('input') || lowerUser.startsWith('tambah ')) {
      const inputRes = handleInputAiCommand(userText);
      if (inputRes.responseText) {
        if (inputRes.nextSession !== undefined) {
          setActiveSession(inputRes.nextSession);
        }
        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: inputRes.responseText,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          draftData: inputRes.draftData,
          isNew: true
        };
        setMessages(prev => [...prev, aiMessage]);
        return;
      }
    }

    // 3. Check if query is a conversational greeting / opening statement
    if (isConversationalGreeting(userText)) {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: getConversationalGreetingResponse(currentUser?.nama || 'Bapak/Ibu', userText),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isNew: true
      };
      setMessages(prev => [...prev, aiMessage]);
      return;
    }

    // 4. Check if query lacks context and needs clarification first
    const clarification = detectLackingContext(userText, messages);
    if (clarification) {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Halo **${currentUser?.nama || 'Bapak/Ibu'}**, ${clarification.clarificationQuestion}`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isNew: true
      };
      setMessages(prev => [...prev, aiMessage]);
      return;
    }

    setIsLoading(true);

    try {
      // Include context of previous conversation to understand follow-ups like "kenapa"
      const recentContext = messages.slice(-2).map(m => m.content).join(' ');
      const combinedQuery = `${userText} ${recentContext}`;
      const dataDigest = generateDataDigest(combinedQuery);
      const agg = compileAggregations(combinedQuery);

      const systemPrompt = `Anda adalah "MyPanca Gemini AI", asisten data dan analis bisnis eksekutif cerdas untuk platform ERP & CRM MyPanca.
Tugas: Menjawab pertanyaan pengguna dengan RAMAH, SOPAN, MANUSIAWI SEPERTI CUSTOMER SERVICE PROPRIETARY, AKURAT, LENGKAP MEMBACA DATA SEMUA MENU, dan MEMBANTU.

================================================================================
ATURAN WAJIB & PROTOKOL PERCAKAPAN BISNIS (INTERACTIVE & CONTEXT-AWARE AI):
================================================================================

1. KLARIFIKASI KONTEKS DAHULU JIKA PERTANYAAN TERLALU UMUM (DILARANG LANGSUNG TEBAK/DUMP DATA):
   - JIKA pengguna bertanya hal umum TANPA menyebutkan periode waktu (bulan/tahun) atau nama objek spesifik:
     * Contoh Kasus: Pengguna hanya bertanya "omset", "berapa omset", "penjualan", "laporan penjualan", "total omzet":
       -> DILARANG LANGSUNG MENJAWAB DENGAN ANGKA TEBAKAN ATAU LANGSUNG MENGIRIMKAN TABEL DATA!
       -> TANYAKAN TERLEBIH DAHULU KONTEKS DETAILNYA DENGAN RAMAH & SPESIFIK:
          "Halo **${currentUser?.nama || 'Bapak/Ibu'}**, Anda ingin mengecek omzet untuk periode bulan atau tahun apa? (Misalnya: **Agustus 2026**, **September 2026**, **bulan ini**, atau **sepanjang tahun 2026**?)"
     * Contoh Kasus: Pengguna hanya mengetik "transaksi" atau "cek transaksi":
       -> TANYAKAN DULU:
          "Baik **${currentUser?.nama || 'Bapak/Ibu'}**, Anda ingin mengecek transaksi nomor berapa (seperti **TRX-70**), transaksi untuk **bulan tertentu**, atau status pesanan tertentu (selesai/pengiriman)?"
     * Contoh Kasus: Pengguna hanya mengetik "stok":
       -> TANYAKAN DULU:
          "Baik **${currentUser?.nama || 'Bapak/Ibu'}**, apakah Anda ingin melihat **produk dengan stok menipis (< 10 unit)**, atau mengecek stok untuk **nama barang tertentu**?"
     * Contoh Kasus: Pengguna hanya mengetik "piutang" atau "tagihan":
       -> TANYAKAN DULU:
          "Baik **${currentUser?.nama || 'Bapak/Ibu'}**, apakah Anda ingin melihat **total seluruh tagihan belum lunas**, atau tagihan untuk **pelanggan tertentu**?"

2. JAWABAN HARUS SESUAI KONTEKS & JANGAN LANGSUNG MENGIRIMKAN DETAIL JIKA TIDAK DIMINTA:
   - Jawablah secara fokus, ringkas, dan tepat pada intinya (high-level summary) terlebih dahulu.
   - JANGAN LANGSUNG MENGIRIMKAN TABEL DETAIL PANJANG, RINCIAN ITEM PER ITEM, ATAU CATATAN EKSTRA JIKA PENGGUNA HANYA MENANYAKAN ANGKA/TOTAL/STATUS!
   - Contoh Kasus Nyata: Jika pengguna bertanya "omset bulan agustus 2026" (atau setelah menjawab klarifikasi bulan):
     * Jawab ringkas intinya terlebih dahulu:
       "Total omzet transaksi pesanan selesai pada bulan **Agustus 2026** adalah **Rp 15.000.000** (dari 1 transaksi: PT Indofood CBP Sukses Makmur).\n\nApakah Anda ingin saya tampilkan rincian detail transaksinya?"
     * HANYA kirimkan tabel rincian transaksi jika pengguna meminta (misalnya: "ya", "tampilkan detailnya", "rincian", "breakdown").
   - Jangan menyertakan informasi yang tidak ditanyakan (misal user tanya omset, jangan tiba-tiba menyertakan data stok dan PO supplier jika tidak diminta).

3. RIWAYAT PERCAKAPAN (MULTI-TURN MEMORY):
   - Sambungkan konteks percakapan dengan pesan-pesan sebelumnya. Jika Anda baru saja bertanya: "ingin cek omzet bulan apa?" dan pengguna menjawab: "Agustus 2026", Anda harus langsung memahami bahwa itu adalah jawaban untuk omzet bulan Agustus 2026!

4. WAJIB BACA & ANALISIS DATA SISTEM SECARA TELITI:
   - Sebelum menyusun jawaban, Anda WAJIB memeriksa seluruh bagian "DATA REAL-TIME SISTEM DARI SEMUA MENU" yang dilampirkan di bawah.
   - Jawaban Anda WAJIB didasarkan pada data faktual tersebut, bukan mengarang atau membuat asumsi kosong.

5. DILARANG MENYATAKAN TIDAK MEMILIKI AKSES KE DATABASE:
   - Seluruh database real-time sistem MyPanca SUDAH DILAMPIRKAN SECARA LENGKAP di bawah ini. Anda MEMILIKI akses penuh ke data tersebut.
   - JANGAN PERNAH mengatakan "saya tidak memiliki akses ke database", "saya hanya model bahasa", atau "silakan cek sendiri di menu". Kutip dan sajikan data real tersebut!

6. SIKAP CUSTOMER SERVICE KETIKA MENYAPA / KASUAL:
   - Jika pengguna hanya menyapa (misal: "halo", "hi", "selamat pagi", "siapa kamu", "terima kasih"), berikan sambutan ramah, santun, dan manusiawi. Sapa nama pengguna (${currentUser?.nama || 'Bapak/Ibu'}), tanyakan bantuan yang dibutuhkan, dan berikan contoh pertanyaan. JANGAN menumpahkan seluruh tabel data sistem jika hanya disapa halo!

DATA REAL-TIME SISTEM DARI SEMUA MENU:
${dataDigest}`;

      // Keep up to 6 turns of history to preserve multi-turn context
      const recentHistory: { role: 'user' | 'assistant'; content: string }[] = [];
      const pastTurns = messages.slice(-6);
      pastTurns.forEach(m => {
        recentHistory.push({
          role: m.role,
          content: m.role === 'assistant' && m.content.length > 350 ? m.content.slice(0, 350) + '... (ringkasan)' : m.content
        });
      });
      recentHistory.push({ role: 'user', content: userText });

      const payloadMessages = [
        { role: 'system', content: systemPrompt },
        ...recentHistory
      ];

      let aiResponseText = "";

      // Call Google Gemini API (Gemini 3.5 Flash) with Multi-Key Auto-Rolling
      try {
        const geminiHistory = recentHistory
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          }));

        aiResponseText = await callGeminiWithKeyRotation({
          systemPrompt,
          messages: geminiHistory,
          userPrompt: userText,
          preferredModel: 'gemini-3.5-flash',
          temperature: 0.2,
          maxTokens: 8192
        });
      } catch (geminiErr: any) {
        console.warn("Gemini call error:", geminiErr);
      }

      // Fail-safe Smart Local Synthesizer if Gemini returned empty
      if (!aiResponseText || aiResponseText.trim().length === 0) {
        aiResponseText = generateSmartLocalResponse(userText);
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponseText,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isNew: true
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error("AI Assistant Error:", err);
      const fallbackText = generateSmartLocalResponse(userText);
      const errMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fallbackText,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadExcel = (content: string) => {
    try {
      const lines = content.split('\n');
      let htmlBody = `
        <table border="0" style="font-family: Calibri, Arial, sans-serif; width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td colspan="6" style="font-size: 16pt; font-weight: bold; color: #1e293b; padding-bottom: 4px;">Laporan Data AI MyPanca ERP & CRM</td>
          </tr>
          <tr>
            <td colspan="6" style="font-size: 10pt; color: #64748b; padding-bottom: 12px; border-bottom: 2px solid #2563eb;">
              Perusahaan: <b>${activeCompany?.nama || 'MyPanca'}</b> | Tanggal Ekspor: <b>${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</b>
            </td>
          </tr>
        </table>
      `;

      let inTable = false;
      let tableHeaders: string[] = [];
      let tableRows: string[][] = [];

      const flushTable = () => {
        if (tableHeaders.length > 0 || tableRows.length > 0) {
          htmlBody += `<table border="1" style="border-collapse: collapse; width: 100%; font-family: Calibri, Arial, sans-serif; font-size: 10pt; margin-top: 10px; margin-bottom: 20px; border: 1px solid #cbd5e1;">`;
          if (tableHeaders.length > 0) {
            htmlBody += `<thead style="background-color: #2563eb; color: #ffffff;"><tr>`;
            tableHeaders.forEach(th => {
              htmlBody += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: bold; text-align: left; background-color: #2563eb; color: #ffffff;">${th}</th>`;
            });
            htmlBody += `</tr></thead>`;
          }
          htmlBody += `<tbody>`;
          tableRows.forEach((row, idx) => {
            const bg = idx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
            htmlBody += `<tr style="${bg}">`;
            row.forEach(td => {
              htmlBody += `<td style="border: 1px solid #cbd5e1; padding: 6px 12px; text-align: left; vertical-align: middle;">${td}</td>`;
            });
            htmlBody += `</tr>`;
          });
          htmlBody += `</tbody></table>`;
        }
        tableHeaders = [];
        tableRows = [];
        inTable = false;
      };

      let metricRows: { key: string; val: string }[] = [];

      const flushMetrics = () => {
        if (metricRows.length > 0) {
          htmlBody += `<table border="1" style="border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 10pt; margin-top: 8px; margin-bottom: 16px; border: 1px solid #e2e8f0;">`;
          metricRows.forEach(m => {
            htmlBody += `<tr>
              <td style="background-color: #f1f5f9; font-weight: bold; padding: 6px 12px; border: 1px solid #cbd5e1; color: #334155; min-width: 200px;">${m.key}</td>
              <td style="padding: 6px 12px; border: 1px solid #cbd5e1; color: #0f172a;">${m.val}</td>
            </tr>`;
          });
          htmlBody += `</table>`;
          metricRows = [];
        }
      };

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        // Strip Markdown bold/italic/code tags
        const cleanLine = line
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/`(.*?)`/g, '$1')
          .replace(/\[(.*?)\]\(.*?\)/g, '$1');

        // Table Row
        if (cleanLine.startsWith('|') && cleanLine.endsWith('|')) {
          flushMetrics();
          if (/^\|[\s\-:|]+\|$/.test(cleanLine)) {
            continue; // Header separator line like |---|---|
          }
          const cells = cleanLine
            .slice(1, -1)
            .split('|')
            .map(c => c.trim());

          if (!inTable) {
            inTable = true;
            tableHeaders = cells;
          } else {
            tableRows.push(cells);
          }
        } else {
          if (inTable) {
            flushTable();
          }

          // Headings
          if (cleanLine.startsWith('#')) {
            flushMetrics();
            const title = cleanLine.replace(/^#+\s*/, '');
            htmlBody += `<div style="font-size: 12pt; font-weight: bold; color: #1e293b; margin-top: 16px; margin-bottom: 8px; border-left: 4px solid #2563eb; padding-left: 8px;">${title}</div>`;
          } 
          // Bullet points / Key-Value Pairs
          else if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
            const content = cleanLine.replace(/^[\-\*]\s*/, '');
            if (content.includes(':')) {
              const parts = content.split(':');
              metricRows.push({
                key: parts[0].trim(),
                val: parts.slice(1).join(':').trim()
              });
            } else {
              flushMetrics();
              htmlBody += `<div style="margin: 4px 0; font-size: 10pt; color: #334155;">• ${content}</div>`;
            }
          } 
          else {
            flushMetrics();
            htmlBody += `<div style="margin: 4px 0; font-size: 10pt; color: #334155;">${cleanLine}</div>`;
          }
        }
      }

      if (inTable) flushTable();
      flushMetrics();

      const excelDocument = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
          <!--[if gte mso 9]>
          <xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>Laporan AI MyPanca</x:Name>
                  <x:WorksheetOptions>
                    <x:DisplayGridlines/>
                  </x:WorksheetOptions>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml>
          <![endif]-->
          <style>
            body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; }
            table { border-collapse: collapse; }
          </style>
        </head>
        <body>
          ${htmlBody}
        </body>
        </html>
      `;

      const blob = new Blob([excelDocument], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Laporan_MyPanca_AI_${new Date().toISOString().split('T')[0]}.xls`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download Excel:", err);
      alert("Gagal mengunduh file Excel.");
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Hapus seluruh percakapan AI?")) {
      setMessages([]);
      localStorage.removeItem('mypanca_gemini_ai_chat');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-all duration-300 ${
          isFullscreen 
            ? 'w-full h-full rounded-none' 
            : 'w-full max-w-4xl h-[90vh] max-h-[820px] rounded-3xl overflow-hidden'
        }`}
      >
        {/* Gemini Top Header */}
        <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  MyPanca Gemini AI
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
                  Data Assistant
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="flex items-center gap-1">
                  <Building2 size={12} className="text-slate-400" />
                  {isSuperAdmin ? 'Semua Perusahaan (Akses Global)' : activeCompany.nama}
                </span>
                <span>•</span>
                <span className={`inline-flex items-center gap-1 font-medium ${isSuperAdmin ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                  {isSuperAdmin ? <ShieldCheck size={12} /> : <Lock size={12} />}
                  Role: {currentUser?.role || 'User'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenSettings && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition active:scale-95 mr-1"
                title="Buka Pengaturan API Key Gemini AI di menu Settings"
              >
                <SettingsIcon size={13} className="text-violet-600 dark:text-violet-400" />
                <span className="hidden md:inline">Gemini Key</span>
              </button>
            )}
            {onOpenPancaApp && (
              <button
                onClick={() => {
                  onClose();
                  onOpenPancaApp();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/60 dark:hover:bg-violet-900/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60 text-xs font-bold transition active:scale-95 mr-1"
                title="Buka Panca AI Mobile PWA App (/app)"
              >
                <Sparkles size={13} className="text-violet-600 dark:text-violet-400" />
                <span className="hidden sm:inline">Panca AI App</span>
                <span className="text-[10px] px-1 py-0.5 rounded bg-violet-200/70 dark:bg-violet-800 text-violet-800 dark:text-violet-200">/app</span>
              </button>
            )}
            {messages.length > 0 && (
              <button
                onClick={handleClearHistory}
                title="Hapus riwayat chat"
                className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Trash2 size={17} />
              </button>
            )}
            <button
              onClick={() => setIsFullscreen(prev => !prev)}
              title={isFullscreen ? "Kecilkan Tampilan" : "Layar Penuh"}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden sm:block"
            >
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button
              onClick={onClose}
              title="Tutup AI"
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Conversation Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-gradient-to-b from-slate-50/30 to-slate-100/30 dark:from-slate-900/50 dark:to-slate-950/50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center max-w-2xl mx-auto py-8 text-center animate-in fade-in duration-300">
              <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/25 mb-4">
                <Sparkles size={28} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Halo, {currentUser?.nama || 'Rekan'}!
                </span>
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-8 max-w-md">
                Tanyakan informasi apa pun terkait data transaksi, produk, omzet, atau status pelanggan sesuai hak akses Anda.
              </p>

              {/* Prompt Suggestion Chips */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {quickSuggestions.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(item.prompt)}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-850/80 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition-all group cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex items-center justify-between">
                        {item.title}
                        <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-indigo-500" />
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {item.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex gap-3 sm:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white flex-shrink-0 shadow-md shadow-indigo-500/10 mt-1">
                      <Sparkles size={16} />
                    </div>
                  )}

                  <div className={`relative max-w-[85%] sm:max-w-[78%] group ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-3xl rounded-tr-sm px-4 sm:px-5 py-3 shadow-md shadow-blue-500/10'
                      : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-3xl rounded-tl-sm px-4 sm:px-6 py-4 shadow-sm'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 leading-relaxed break-words">
                        <TypewriterText
                          content={msg.content}
                          isNew={Boolean(msg.isNew)}
                          onComplete={() => {
                            if (msg.isNew) {
                              setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isNew: false } : m));
                            }
                          }}
                        />

                        {(msg.content.includes('Apakah Anda mau mengisi') || msg.content.includes('spesifikasi produk ini sekarang')) && (
                          <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5 not-prose">
                            <button
                              type="button"
                              onClick={() => handleSendMessage("Ya, isi sekarang")}
                              className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 size={16} />
                              Ya, Isi Sekarang
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendMessage("Tidak, terima kasih")}
                              className="py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle size={16} />
                              Tidak
                            </button>
                          </div>
                        )}

                        {((msg.content.includes('Apakah Anda ingin') || msg.content.includes('mau melihat')) && (msg.content.includes('tampilkan rincian') || msg.content.includes('melihat list') || msg.content.includes('melihat rincian') || msg.content.includes('daftar transaksinya') || msg.content.includes('detail transaksinya') || msg.content.includes('list transaksinya') || msg.content.includes('rincian detail'))) && (
                          <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5 not-prose">
                            <button
                              type="button"
                              onClick={() => handleSendMessage("Ya, tampilkan list transaksinya")}
                              className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 size={16} />
                              Ya, Tampilkan List Transaksi
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendMessage("Tidak, ringkasan saja cukup")}
                              className="py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle size={16} />
                              Tidak, Ringkasan Cukup
                            </button>
                          </div>
                        )}

                        {msg.draftData && (
                          <div className="mt-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex flex-col gap-3 not-prose">
                            <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-200">
                              <span className="flex items-center gap-1.5">
                                <Sparkles size={14} className="text-amber-600 dark:text-amber-400 animate-pulse" />
                                Draft Form Input AI
                              </span>
                              {msg.draftData.isSaved ? (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-bold">
                                  <CheckCircle2 size={14} /> Tersimpan
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-semibold">
                                  <AlertCircle size={14} /> Menunggu Konfirmasi Anda
                                </span>
                              )}
                            </div>

                            {!msg.draftData.isSaved && (
                              <div className="flex items-center gap-2 pt-2 border-t border-amber-200/80 dark:border-amber-800/60">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmDraftSave(msg.id)}
                                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                  <CheckCircle2 size={16} />
                                  ✅ Konfirmasi & Simpan ke System
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: m.content + '\n\n*Draft input dibatalkan.*', draftData: { ...m.draftData!, isSaved: true } } : m));
                                  }}
                                  className="py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-all cursor-pointer"
                                >
                                  ❌ Batal
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm sm:text-[15px] leading-relaxed">
                        {msg.content}
                      </p>
                    )}

                    <div className={`flex items-center gap-2 mt-3 pt-2 border-t text-[11px] ${
                      msg.role === 'user' 
                        ? 'text-blue-100/80 justify-end border-white/20' 
                        : 'text-slate-400 justify-between border-slate-100 dark:border-slate-800'
                    }`}>
                      <span className="text-[10px]">{msg.timestamp}</span>

                      {msg.role === 'assistant' ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadExcel(msg.content)}
                            className="py-1 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                            title="Unduh data jawaban ini sebagai file Excel (.csv)"
                          >
                            <FileSpreadsheet size={13} className="text-emerald-600 dark:text-emerald-400" />
                            <span>Download Excel</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.id, msg.content)}
                            className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
                            title="Salin jawaban AI"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check size={13} className="text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Tersalin!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13} />
                                <span>Salin Respon</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.id, msg.content)}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white font-medium text-[10px] flex items-center gap-1 transition-all cursor-pointer ml-auto"
                          title="Salin pesan Anda"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check size={11} className="text-emerald-300" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <span>Salin Pesan</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 flex-shrink-0 mt-1">
                      <User size={16} />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 sm:gap-4 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white flex-shrink-0 animate-pulse mt-1">
                    <Sparkles size={16} />
                  </div>
                  <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-3xl rounded-tl-sm px-5 py-4 shadow-sm flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce"></span>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Menganalisa data sistem sesuai hak akses Anda...
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Gemini Floating Bottom Capsule Input */}
        <div className="p-3 sm:p-5 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
          {/* Quick Input AI Chips */}
          <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => handleSendMessage('/input')}
              className="px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            >
              <Sparkles size={12} className="text-amber-500 animate-pulse" /> Mode /Input AI
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('/input customer')}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
            >
              + Customer Baru
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('/input transaksi')}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
            >
              + Transaksi Baru
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('/input penawaran')}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
            >
              + Penawaran Baru
            </button>
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative flex items-center rounded-2xl sm:rounded-3xl border border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-850/80 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 shadow-inner transition-all p-1.5 sm:p-2"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={`Tanya data ${isSuperAdmin ? 'seluruh sistem' : activeCompany.nama}...`}
              className="flex-1 bg-transparent px-3 py-1.5 text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none resize-none max-h-32 min-h-[36px]"
            />
            
            <button
              type="submit"
              disabled={!inputPrompt.trim() || isLoading}
              className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all ${
                inputPrompt.trim() && !isLoading
                  ? 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25 hover:scale-105 active:scale-95'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send size={16} />
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-3 pt-2">
            <span>Data terlindungi dan tersaring otomatis sesuai kontrol akses peran <strong>{currentUser?.role}</strong></span>
            <span className="hidden sm:inline">Tekan Enter untuk mengirim</span>
          </div>
        </div>
      </div>
    </div>
  );
};
