import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Bot,
  QrCode,
  Send,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Save,
  Check,
  X,
  Sliders,
  Database,
  ChevronLeft,
  MessageCircle,
  Code,
  Copy,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Download,
  Maximize2,
  RotateCcw,
  Globe,
  BookOpen,
  Tag,
  ShieldAlert,
  Headphones,
  Sparkles,
  Languages,
  Volume2,
  ExternalLink,
  HelpCircle,
  FileEdit,
  PlusCircle,
  Layers,
  Play,
  UserCheck,
  Bell
} from 'lucide-react';
import { WANotifDeviceTab } from './WANotifDeviceTab';
import { 
  loadWAChatsFromSupabase, 
  saveWAChatToSupabase, 
  deleteWAChatFromSupabase,
  clearWAChatsFromSupabase,
  loadKnownConnectedNumbersFromSupabase,
  checkSupabaseTableStatus 
} from '../lib/supabaseSync';
import { SUPABASE_MIGRATION_SQL } from '../lib/supabaseMigrationSql';
import { getApiUrl } from '../lib/apiUtils';

export const formatDisplayPhone = (rawPhoneOrJid?: string, name?: string): { phone: string; name: string } => {
  if (!rawPhoneOrJid) {
    const cleanName = (name && !name.includes("@")) ? name : "Pengguna WA";
    return { phone: cleanName, name: cleanName };
  }

  let val = rawPhoneOrJid.split("@")[0].split(":")[0];
  let digits = val.replace(/[^0-9]/g, "");

  // Fallback: check if name contains phone digits
  if ((!digits || digits.length < 8) && name) {
    const nDigits = name.replace(/[^0-9]/g, "");
    if (nDigits.length >= 8 && nDigits.length <= 15) {
      digits = nDigits;
    }
  }

  if (digits && digits.length >= 8 && digits.length <= 15) {
    let formatted = digits;
    if (formatted.startsWith("62")) {
      formatted = "0" + formatted.slice(2);
    } else if (!formatted.startsWith("0")) {
      formatted = "0" + formatted;
    }
    const isCleanName = name && !name.includes("@lid") && !name.includes("@s.whatsapp.net") && !name.includes("@g.us");
    const displayName = isCleanName ? name : formatted;

    return { phone: formatted, name: displayName };
  }

  const isCleanName = name && !name.includes("@lid") && !name.includes("@s.whatsapp.net") && !name.includes("@g.us");
  const fallbackName = isCleanName ? name : (rawPhoneOrJid || "Pengguna WA");
  const fallbackPhone = digits && digits.length >= 6 ? digits : fallbackName;

  return { phone: fallbackPhone, name: fallbackName };
};

export interface WAChatMedia {
  type: 'image' | 'document' | 'video' | 'audio';
  data?: string;
  url?: string;
  mimetype?: string;
  fileName?: string;
  fileSize?: number;
}

export interface WAChatMessage {
  id: string;
  fromMe: boolean;
  sender: string;
  senderName?: string;
  text: string;
  timestamp: number;
  status?: string;
  media?: WAChatMedia;
}

export interface WAChat {
  id: string;
  jid: string;
  name: string;
  phone: string;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: number;
  messages: WAChatMessage[];
  connectedPhone?: string;
  isHandedOverToHuman?: boolean;
  fallbackCount?: number;
  waitingHandoverConsent?: boolean;
}

export interface WAKBProduct {
  id: string;
  productName: string;
  description: string;
  price: string;
  keywords: string[];
  faq: { q: string; a: string }[];
}

export interface WAKBTextSnippet {
  id: string;
  title: string;
  category: string;
  content: string;
  keywords: string[];
  updatedAt?: number;
}

export interface WAKBWebSource {
  id: string;
  url: string;
  title: string;
  summary: string;
  isActive: boolean;
  updatedAt?: number;
}

export interface WAIHandoverConfig {
  enabled: boolean;
  triggerKeywords: string[];
  handoverContact: string;
  handoverMessage: string;
}

export interface WAISalesCtaConfig {
  enabled: boolean;
  ctaMessage: string;
  triggerKeywords: string[];
}

export interface WAISettings {
  autoReplyEnabled: boolean;
  botName: string;
  systemInstructions: string;
  toneOfVoice: string;
  responseLanguage: string;
  greetingMessage: string;
  fallbackMessage: string;
  restrictedTopics: string[];
  handoverToHuman: WAIHandoverConfig;
  salesCta: WAISalesCtaConfig;

  // Separated Knowledge Containers
  knowledgeProducts: WAKBProduct[];
  knowledgeSnippets: WAKBTextSnippet[];
  knowledgeWebSources: WAKBWebSource[];

  // Backward compatibility
  knowledgeBase?: WAKBProduct[];
  tone?: string;

  logs: {
    id: string;
    timestamp: number;
    sender: string;
    incoming: string;
    reply: string;
    modelUsed: string;
    isHandover?: boolean;
    isRestricted?: boolean;
  }[];
}

interface WhatsAppViewProps {
  initialSubTab?: 'chat' | 'setting-ai' | 'perangkat' | 'perangkat-notif';
  currentUser?: {
    id?: string;
    nama?: string;
    username?: string;
    role?: string;
  };
}

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({ initialSubTab = 'chat', currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'setting-ai' | 'perangkat' | 'perangkat-notif'>(initialSubTab);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const isSuperAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'admin';

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Status Koneksi WA & QR
  const [connectionStatus, setConnectionStatus] = useState<{
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
    rawQrCodeBase64: null,
    qrTimestamp: 0,
    qrVersion: 0,
    qrExpired: false,
    userPhone: null,
    userName: null,
  });

  const [qrCountdown, setQrCountdown] = useState<number>(60);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);

  // Connected Phone Partitioning & Multi-SIM History
  const [selectedConnectedPhone, setSelectedConnectedPhone] = useState<string>('active');
  const [knownNumbers, setKnownNumbers] = useState<{ phone: string; active: boolean; chatCount: number; assignedUser?: string; lastActive?: number }[]>([]);

  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Chats & Active Chat
  const [chats, setChats] = useState<WAChat[]>([]);
  const [selectedChatJid, setSelectedChatJid] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

  // Delete Chat State
  const [deleteConfirmChat, setDeleteConfirmChat] = useState<WAChat | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState<boolean>(false);

  // File & Image Attachments
  const [attachedMedia, setAttachedMedia] = useState<{
    type: 'image' | 'document';
    data: string; // base64 data url
    fileName?: string;
    fileSize?: number;
    mimetype?: string;
  } | null>(null);
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Settings AI
  const [settings, setSettings] = useState<WAISettings>({
    autoReplyEnabled: true,
    botName: 'Customer Assistant AI',
    systemInstructions: 'Anda adalah asisten AI customer service resmi PT. Panca Prima Wijaya di WhatsApp. Tugas utama Anda adalah melayani pertanyaan pelanggan seputar produk, penawaran harga, prosedur pemesanan, dan informasi perusahaan secara ramah, ringkas, sopan, dan solutif.',
    toneOfVoice: 'Ramah & Solutif',
    tone: 'Ramah & Solutif',
    responseLanguage: 'Bahasa Indonesia',
    greetingMessage: 'Halo! Terima kasih telah menghubungi PT. Panca Prima Wijaya. Ada yang bisa kami bantu terkait produk dan layanan kami?',
    fallbackMessage: 'Mohon maaf, pesan Anda telah kami catat. Tim sales dan customer service kami akan segera menghubungi Anda kembali untuk memberikan informasi lebih detail.',
    restrictedTopics: [
      'Isu SARA, politik, dan konten sensitif',
      'Perbandingan atau menjelekkan kompetitor',
      'Membocorkan harga modal internal atau rahasia supplier',
      'Menjanjikan diskon khusus tanpa persetujuan tim sales'
    ],
    handoverToHuman: {
      enabled: true,
      triggerKeywords: ['bicara dengan manusia', 'hubungi sales', 'komplain', 'bicara cs', 'customer service', 'mau telpon', 'bisa bicara sales'],
      handoverContact: '0811-1234-5678',
      handoverMessage: 'Baik Bapak/Ibu {name}, pertanyaan/kendala Anda telah kami teruskan langsung ke Sales & CS Specialist kami di nomor {contact}. Tim kami akan segera merespon secara langsung.'
    },
    salesCta: {
      enabled: true,
      ctaMessage: 'Apakah Bapak/Ibu ingin kami buatkan penawaran harga resmi (Quotation) untuk kebutuhan ini?',
      triggerKeywords: ['harga', 'pesan', 'order', 'quotation', 'penawaran', 'katalog', 'stok', 'beli']
    },
    knowledgeProducts: [],
    knowledgeSnippets: [],
    knowledgeWebSources: [],
    knowledgeBase: [],
    logs: []
  });
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Sub-tabs in AI Setting View
  const [aiActiveSection, setAiActiveSection] = useState<'knowledge' | 'prompt-setup' | 'guardrails' | 'simulator' | 'logs'>('knowledge');
  const [kbActiveContainer, setKbActiveContainer] = useState<'snippets' | 'products' | 'websites'>('snippets');
  const [kbSearchQuery, setKbSearchQuery] = useState<string>('');

  // Simulator / Test State
  const [testQueryInput, setTestQueryInput] = useState<string>('Berapa harga plastik sungkup?');
  const [isTestingAi, setIsTestingAi] = useState<boolean>(false);
  const [testAiResult, setTestAiResult] = useState<{
    replyText: string;
    modelUsed: string;
    isHandover: boolean;
    isRestricted: boolean;
    containerMatched: string;
    fallbackCount?: number;
    waitingHandoverConsent?: boolean;
    isHandedOverToHuman?: boolean;
  } | null>(null);

  interface SimMessage {
    id: string;
    sender: 'user' | 'bot';
    text: string;
    modelUsed?: string;
    containerMatched?: string;
    isHandover?: boolean;
    isRestricted?: boolean;
    isFallback?: boolean;
  }

  const [simMessages, setSimMessages] = useState<SimMessage[]>([]);
  const [simFallbackCount, setSimFallbackCount] = useState<number>(0);
  const [simWaitingConsent, setSimWaitingConsent] = useState<boolean>(false);
  const [simHandedOver, setSimHandedOver] = useState<boolean>(false);
  const [isResettingKnowledge, setIsResettingKnowledge] = useState<boolean>(false);

  const handleResetKnowledge = async () => {
    if (!confirm('Reset basis pengetahuan ke format default bersih PT. Panca Prima Wijaya?\n\nSeluruh dokumen akan dirapikan menjadi format paragraf & dokumen resmi yang ringkas, terstruktur, dan humanis.')) {
      return;
    }
    try {
      setIsResettingKnowledge(true);
      const res = await fetch(getApiUrl('/api/wa/reset-knowledge'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
        setKbActiveContainer('snippets');
        setSaveSuccessMsg('Basis pengetahuan berhasil direset ke format bersih!');
        setTimeout(() => setSaveSuccessMsg(null), 3500);
      } else {
        alert(data.error || 'Gagal mereset basis pengetahuan.');
      }
    } catch (err: any) {
      alert(err.message || 'Gagal mereset basis pengetahuan.');
    } finally {
      setIsResettingKnowledge(false);
    }
  };

  const handleResetSim = async () => {
    try {
      await fetch(getApiUrl('/api/wa/reset-sim'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sim-user' })
      });
      setSimMessages([]);
      setSimFallbackCount(0);
      setSimWaitingConsent(false);
      setSimHandedOver(false);
      setTestAiResult(null);
    } catch (err) {
      console.error('Error resetting sim:', err);
    }
  };

  const handleTestAiReply = async (customQuery?: string) => {
    const q = (customQuery || testQueryInput).trim();
    if (!q) return;
    setTestQueryInput('');
    setIsTestingAi(true);

    const userMsg: SimMessage = {
      id: 'sim-u-' + Date.now(),
      sender: 'user',
      text: q
    };
    const updatedMessages = [...simMessages, userMsg];
    setSimMessages(updatedMessages);

    // Multi-turn context history
    const historyPayload = simMessages.slice(-6).map(m => ({
      role: (m.sender === 'bot' ? 'model' : 'user') as 'model' | 'user',
      text: m.text
    }));

    try {
      const res = await fetch(getApiUrl('/api/wa/test-ai-reply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          senderName: 'Pelanggan Uji',
          history: historyPayload,
          sessionId: 'sim-user'
        })
      });
      if (res.ok) {
        const data = await res.json();
        const botMsg: SimMessage = {
          id: 'sim-b-' + Date.now(),
          sender: 'bot',
          text: data.replyText,
          modelUsed: data.modelUsed,
          containerMatched: data.containerMatched || 'fallback',
          isHandover: Boolean(data.isHandover),
          isRestricted: Boolean(data.isRestricted),
          isFallback: Boolean(data.isFallback)
        };
        setSimMessages([...updatedMessages, botMsg]);
        setSimFallbackCount(data.fallbackCount ?? 0);
        setSimWaitingConsent(Boolean(data.waitingHandoverConsent));
        setSimHandedOver(Boolean(data.isHandedOverToHuman));
        setTestAiResult({
          replyText: data.replyText,
          modelUsed: data.modelUsed,
          isHandover: Boolean(data.isHandover),
          isRestricted: Boolean(data.isRestricted),
          containerMatched: data.containerMatched || 'fallback',
          fallbackCount: data.fallbackCount,
          waitingHandoverConsent: data.waitingHandoverConsent,
          isHandedOverToHuman: data.isHandedOverToHuman
        });
      }
    } catch (err) {
      console.error('Error testing AI reply:', err);
    } finally {
      setIsTestingAi(false);
    }
  };

  // Modal 1: Knowledge Product Edit
  const [isKbModalOpen, setIsKbModalOpen] = useState<boolean>(false);
  const [editingKbItem, setEditingKbItem] = useState<{
    id: string;
    productName: string;
    description: string;
    price: string;
    keywordsStr: string;
    faqList: { q: string; a: string }[];
  }>({
    id: '',
    productName: '',
    description: '',
    price: '',
    keywordsStr: '',
    faqList: [{ q: '', a: '' }]
  });

  // Modal 2: Paragraf Biasa / Catatan Teks Edit
  const [isSnippetModalOpen, setIsSnippetModalOpen] = useState<boolean>(false);
  const [editingSnippetItem, setEditingSnippetItem] = useState<{
    id: string;
    title: string;
    category: string;
    content: string;
    keywordsStr: string;
  }>({
    id: '',
    title: '',
    category: 'Profil Perusahaan',
    content: '',
    keywordsStr: ''
  });

  // Modal 3: Source Website Edit
  const [isWebSourceModalOpen, setIsWebSourceModalOpen] = useState<boolean>(false);
  const [editingWebSourceItem, setEditingWebSourceItem] = useState<{
    id: string;
    url: string;
    title: string;
    summary: string;
    isActive: boolean;
  }>({
    id: '',
    url: '',
    title: '',
    summary: '',
    isActive: true
  });

  // Interactive quick add inputs for tags
  const [newRestrictedInput, setNewRestrictedInput] = useState<string>('');
  const [newHandoverKeywordInput, setNewHandoverKeywordInput] = useState<string>('');
  const [newSalesCtaKeywordInput, setNewSalesCtaKeywordInput] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevChatJidRef = useRef<string | null>(null);
  const isUserScrollingUpRef = useRef<boolean>(false);

  const handleEmergencyWipe = async () => {
    if (!confirm("PERINGATAN KERAS: Tindakan ini akan menghapus paksa seluruh file sesi di server dan Supabase. Gunakan hanya jika reset biasa gagal. Lanjutkan?")) return;
    setIsLoadingStatus(true);
    try {
      const res = await fetch(getApiUrl('/api/wa/emergency-wipe'), { method: 'POST' });
      if (res.ok) {
        alert("Sesi server telah dibersihkan total. Silakan 'Buat Barcode' kembali.");
        fetchStatus();
      }
    } catch (e) {
      alert("Gagal melakukan emergency wipe.");
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Fetch WA Connection Status & Known Connected Numbers
  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch(getApiUrl(`/api/wa/status?t=${Date.now()}`));
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(prev => {
          if (data.qrVersion && data.qrVersion !== prev.qrVersion) {
            setQrCountdown(60);
          } else if (data.qrExpired) {
            setQrCountdown(0);
          }
          return {
            connectionState: data.connectionState,
            qrCodeBase64: data.qrCodeBase64,
            rawQrCodeBase64: data.rawQrCodeBase64,
            qrTimestamp: data.qrTimestamp,
            qrVersion: data.qrVersion,
            qrExpired: data.qrExpired,
            userPhone: data.userPhone,
            userName: data.userName,
          };
        });
        if (Array.isArray(data.knownNumbers)) {
          const numbers = data.knownNumbers.filter((n: any) => n.phone && n.phone !== 'default');
          try {
            const cloudPhones = await loadKnownConnectedNumbersFromSupabase();
            cloudPhones.forEach(cp => {
              if (cp && cp !== 'default' && !numbers.some(n => n.phone === cp)) {
                numbers.push({ phone: cp, active: cp === data.userPhone, chatCount: 0 });
              }
            });
          } catch {}
          setKnownNumbers(numbers);
        }
      }
    } catch (err) {
      console.error('Error fetching WA status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Fetch Chats filtered by Connected Phone Number
  const fetchChats = async (targetPhone?: string) => {
    try {
      const activeFilter = targetPhone || selectedConnectedPhone;
      let url = '/api/wa/chats';
      if (activeFilter && activeFilter !== 'all' && activeFilter !== 'active') {
        url += `?connectedPhone=${encodeURIComponent(activeFilter)}`;
      }
      const res = await fetch(getApiUrl(url));
      if (res.ok) {
        const data = await res.json();
        if (data.chats && Array.isArray(data.chats)) {
          // Deduplicate chats by JID/ID to prevent duplicate React key warnings
          const seenJids = new Set<string>();
          const uniqueChats: WAChat[] = [];
          data.chats.forEach((chat: WAChat) => {
            const cleanJid = chat.jid || chat.id;
            if (cleanJid && !seenJids.has(cleanJid)) {
              seenJids.add(cleanJid);

              // Format display phone & name cleanly (08... format, no @lid/@s.whatsapp.net)
              const cleanInfo = formatDisplayPhone(chat.phone || chat.jid || chat.id, chat.name);
              chat.phone = cleanInfo.phone;
              chat.name = cleanInfo.name;

              uniqueChats.push(chat);
            }
          });

          setChats(uniqueChats);
          
          // Only auto-select on desktop if no chat is already selected
          const isActuallyMobile = window.innerWidth < 768;
          if (!isActuallyMobile && !selectedChatJid && uniqueChats.length > 0) {
            setSelectedChatJid(uniqueChats[0].jid || uniqueChats[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    }
  };

  // Manual Supabase Chat Sync
  const handleSyncWithSupabase = async () => {
    setIsSyncingSupabase(true);
    try {
      const target = selectedConnectedPhone !== 'all' && selectedConnectedPhone !== 'active' 
        ? selectedConnectedPhone 
        : (connectionStatus.userPhone || undefined);

      // 1. Tell backend to sync from Supabase
      const srvRes = await fetch('/api/wa/sync-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectedPhone: target })
      });

      if (srvRes.ok) {
        const srvData = await srvRes.json();
        if (srvData.chats) {
          const cleaned = srvData.chats.map((c: WAChat) => {
            const info = formatDisplayPhone(c.phone || c.jid || c.id, c.name);
            return { ...c, phone: info.phone, name: info.name };
          });
          setChats(cleaned);
        }
      }

      // 2. Direct client fallback from Supabase
      const cloudChats = await loadWAChatsFromSupabase(target);
      if (cloudChats && cloudChats.length > 0) {
        const cleaned = cloudChats.map((c: any) => {
          const info = formatDisplayPhone(c.phone || c.jid || c.id, c.name);
          return { ...c, phone: info.phone, name: info.name };
        });
        setChats(cleaned);
      }

      setSyncToast('Riwayat chat berhasil disinkronkan dari Supabase!');
      setTimeout(() => setSyncToast(null), 3000);
    } catch (err: any) {
      console.error('Error syncing WA with Supabase:', err);
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  // Clear ALL Chat History and Connected Numbers
  const handleClearAllData = async () => {
    if (!confirm('Apakah Anda yakin ingin bersihkan SELURUH data percakapan WhatsApp & nomor terhubung? Tindakan ini tidak dapat dibatalkan.')) return;

    setIsSyncingSupabase(true);
    try {
      await fetch(getApiUrl('/api/wa/clear-all-data'), { method: 'POST' });
      await clearWAChatsFromSupabase();

      setChats([]);
      setKnownNumbers([]);
      setSelectedChatJid(null);
      setSyncToast('Seluruh data percakapan WhatsApp berhasil dibersihkan!');
      setTimeout(() => setSyncToast(null), 4000);
      fetchStatus();
    } catch (err) {
      console.error('Error clearing all WA data:', err);
      alert('Gagal bersihkan data WhatsApp.');
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  // Handle Delete Chat
  const handleDeleteChat = async (chatToDelete: WAChat | null) => {
    if (!chatToDelete) return;
    setIsDeletingChat(true);
    try {
      const jid = chatToDelete.jid || chatToDelete.id;
      
      // 1. Call Backend API endpoint
      await fetch(getApiUrl('/api/wa/delete-chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid, connectedPhone: selectedConnectedPhone })
      });

      // 2. Call Supabase delete directly
      await deleteWAChatFromSupabase(jid, selectedConnectedPhone);

      // 3. Update local state
      setChats(prev => prev.filter(c => (c.jid || c.id) !== jid));
      if (selectedChatJid === jid) {
        setSelectedChatJid(null);
      }

      setSyncToast(`Obrolan dengan ${chatToDelete.name || 'kontak'} berhasil dihapus.`);
      setTimeout(() => setSyncToast(null), 3000);
    } catch (err) {
      console.error('Error deleting chat:', err);
      alert('Gagal menghapus obrolan.');
    } finally {
      setIsDeletingChat(false);
      setDeleteConfirmChat(null);
    }
  };

  // Fetch AI Settings
  const fetchSettings = async () => {
    try {
      const res = await fetch(getApiUrl('/api/wa/settings'));
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          const s = data.settings;
          const products = s.knowledgeProducts || s.knowledgeBase || [];
          setSettings({
            autoReplyEnabled: s.autoReplyEnabled ?? true,
            botName: s.botName || 'Customer Assistant AI',
            systemInstructions: s.systemInstructions || 'Anda adalah asisten AI customer service resmi PT. Panca Prima Wijaya di WhatsApp. Tugas utama Anda adalah melayani pertanyaan pelanggan seputar produk, penawaran harga, prosedur pemesanan, dan informasi perusahaan secara ramah, ringkas, sopan, dan solutif.',
            toneOfVoice: s.toneOfVoice || s.tone || 'Ramah & Solutif',
            tone: s.toneOfVoice || s.tone || 'Ramah & Solutif',
            responseLanguage: s.responseLanguage || 'Bahasa Indonesia',
            greetingMessage: s.greetingMessage || 'Halo! Terima kasih telah menghubungi PT. Panca Prima Wijaya. Ada yang bisa kami bantu terkait produk dan layanan kami?',
            fallbackMessage: s.fallbackMessage || 'Mohon maaf, pesan Anda telah kami catat. Tim sales dan customer service kami akan segera menghubungi Anda kembali untuk memberikan informasi lebih detail.',
            restrictedTopics: s.restrictedTopics || [],
            handoverToHuman: s.handoverToHuman || {
              enabled: true,
              triggerKeywords: ['bicara dengan manusia', 'hubungi sales', 'komplain', 'bicara cs', 'customer service'],
              handoverContact: '0811-1234-5678',
              handoverMessage: 'Baik Bapak/Ibu {name}, pertanyaan/kendala Anda telah kami teruskan langsung ke Sales & CS Specialist kami di nomor {contact}. Tim kami akan segera merespon secara langsung.'
            },
            salesCta: s.salesCta || {
              enabled: true,
              ctaMessage: 'Apakah Bapak/Ibu ingin kami buatkan penawaran harga resmi (Quotation) untuk kebutuhan ini?',
              triggerKeywords: ['harga', 'pesan', 'order', 'quotation', 'penawaran', 'katalog', 'stok', 'beli']
            },
            knowledgeProducts: products,
            knowledgeSnippets: s.knowledgeSnippets || [],
            knowledgeWebSources: s.knowledgeWebSources || [],
            knowledgeBase: products,
            logs: s.logs || []
          });
        }
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  // QR Countdown timer like WhatsApp Web (auto-refresh / expiration indicator)
  useEffect(() => {
    if (connectionStatus.connectionState === 'connected' || !connectionStatus.qrCodeBase64 || connectionStatus.qrExpired) {
      return;
    }

    const timer = setInterval(() => {
      setQrCountdown(prev => {
        if (prev <= 1) {
          fetchStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [connectionStatus.connectionState, connectionStatus.qrCodeBase64, connectionStatus.qrExpired, connectionStatus.qrVersion]);

  useEffect(() => {
    fetchStatus();
    fetchChats();
    fetchSettings();

    // Poll faster (every 2.5s) when on 'chat' tab or waiting for QR scan on 'perangkat' tab
    const pollInterval = activeSubTab === 'chat' ? 2500 : (activeSubTab === 'perangkat' && connectionStatus.connectionState !== 'connected' ? 2500 : 5000);
    const interval = setInterval(() => {
      fetchStatus();
      if (activeSubTab === 'chat') {
        fetchChats();
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [selectedConnectedPhone, activeSubTab, connectionStatus.connectionState]);

  useEffect(() => {
    if (!selectedChatJid) return;

    if (selectedChatJid !== prevChatJidRef.current) {
      prevChatJidRef.current = selectedChatJid;
      isUserScrollingUpRef.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (!isUserScrollingUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chats, selectedChatJid]);

  const handleInitConnection = async (force = false) => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch(getApiUrl(`/api/wa/connect?force=${force ? 'true' : 'false'}`), { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(prev => ({
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
      console.error('Error connecting WA:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleResetSession = async () => {
    if (!confirm('Apakah Anda yakin ingin MERESET TOTAL sesi Baileys WhatsApp? Seluruh folder sesi lama akan dibersihkan untuk membuat barcode QR segar baru.')) return;
    setIsLoadingStatus(true);
    try {
      const res = await fetch(getApiUrl('/api/wa/reset-session'), { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(prev => ({
          ...prev,
          connectionState: data.connectionState || 'connecting',
          qrCodeBase64: data.qrCodeBase64,
          rawQrCodeBase64: data.qrCodeBase64,
          qrVersion: data.qrVersion || 1,
          qrExpired: false,
          qrTimestamp: Date.now()
        }));
        setQrCountdown(60);
      }
    } catch (err) {
      console.error('Error resetting WA session:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleLogoutWA = async () => {
    if (!confirm('Logout WA?')) return;
    try {
      await fetch(getApiUrl('/api/wa/logout'), { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error('Error logging out WA:', err);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('Ukuran file maksimal 15MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedMedia({
        type,
        data: reader.result as string,
        fileName: file.name,
        fileSize: file.size,
        mimetype: file.type || (type === 'image' ? 'image/jpeg' : 'application/octet-stream')
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedChatJid || (!replyText.trim() && !attachedMedia) || isSending) return;

    setIsSending(true);
    isUserScrollingUpRef.current = false;
    const textToSend = replyText.trim();
    const mediaToSend = attachedMedia;
    setReplyText('');
    setAttachedMedia(null);

    // Optimistically update chat in UI
    const tempMsg: WAChatMessage = {
      id: "out-" + Date.now(),
      fromMe: true,
      sender: "me",
      text: textToSend,
      timestamp: Date.now(),
      status: "read",
      media: mediaToSend || undefined
    };

    setChats(prevChats => {
      return prevChats.map(c => {
        if (c.jid === selectedChatJid) {
          const updatedMessages = [...c.messages, tempMsg];
          const updatedChat = {
            ...c,
            lastMessage: textToSend || (mediaToSend?.type === 'image' ? '📷 [Foto]' : `📄 [${mediaToSend?.fileName || 'Dokumen'}]`),
            lastMessageTime: Date.now(),
            messages: updatedMessages
          };
          // Sync to Supabase in background
          saveWAChatToSupabase(updatedChat, selectedConnectedPhone !== 'all' ? selectedConnectedPhone : (connectionStatus.userPhone || 'default')).catch(console.warn);
          return updatedChat;
        }
        return c;
      });
    });

    try {
      const res = await fetch(getApiUrl('/api/wa/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          jid: selectedChatJid, 
          text: textToSend,
          media: mediaToSend || undefined
        })
      });

      if (res.ok) {
        await fetchChats();
      }
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const saveSettingsToServer = async (customSettings?: WAISettings) => {
    const toSave = customSettings || settings;
    setIsSavingSettings(true);
    try {
      const res = await fetch(getApiUrl('/api/wa/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.settings) {
          setSettings(data.settings);
        }
        setSaveSuccessMsg('Tersimpan Otomatis!');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveSettings = async () => {
    await saveSettingsToServer();
  };

  const handleToggleChatHandover = async (jid: string, currentStatus?: boolean) => {
    try {
      const nextStatus = !currentStatus;
      const res = await fetch(getApiUrl('/api/wa/chat-toggle-handover'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid, isHandedOver: nextStatus })
      });
      if (res.ok) {
        setChats(prev => prev.map(c => (c.jid === jid || c.id === jid) ? { ...c, isHandedOverToHuman: nextStatus, waitingHandoverConsent: false } : c));
      }
    } catch (err) {
      console.error('Error toggling chat handover:', err);
    }
  };

  // Product KB CRUD with Immediate Auto-Save
  const handleSaveKbItem = async () => {
    if (!editingKbItem.productName.trim()) {
      alert('Nama produk tidak boleh kosong.');
      return;
    }
    const keywords = editingKbItem.keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
    const newKb: WAKBProduct = {
      id: editingKbItem.id || 'kb-prod-' + Date.now(),
      productName: editingKbItem.productName.trim(),
      description: editingKbItem.description.trim(),
      price: editingKbItem.price.trim() || 'Hubungi Sales',
      keywords,
      faq: editingKbItem.faqList.filter(f => f.q.trim() && f.a.trim())
    };

    const currentList = settings.knowledgeProducts?.length ? settings.knowledgeProducts : (settings.knowledgeBase || []);
    let updatedList = [...currentList];
    const existingIdx = updatedList.findIndex(k => k.id === newKb.id);
    if (existingIdx >= 0) {
      updatedList[existingIdx] = newKb;
    } else {
      updatedList.push(newKb);
    }

    const updated = { 
      ...settings, 
      knowledgeProducts: updatedList, 
      knowledgeBase: updatedList 
    };
    setSettings(updated);
    setIsKbModalOpen(false);
    await saveSettingsToServer(updated);
  };

  const handleDeleteKbItem = async (id: string) => {
    if (!confirm('Hapus produk ini dari basis pengetahuan AI?')) return;
    const currentList = settings.knowledgeProducts?.length ? settings.knowledgeProducts : (settings.knowledgeBase || []);
    const updatedList = currentList.filter(k => k.id !== id);
    const updated = { 
      ...settings, 
      knowledgeProducts: updatedList, 
      knowledgeBase: updatedList 
    };
    setSettings(updated);
    await saveSettingsToServer(updated);
  };

  // Paragraf Biasa / Catatan Teks CRUD with Immediate Auto-Save
  const handleSaveSnippetItem = async () => {
    if (!editingSnippetItem.title.trim() || !editingSnippetItem.content.trim()) {
      alert('Judul dan isi dokumen/paragraf wajib diisi.');
      return;
    }
    const keywords = editingSnippetItem.keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
    const newSnippet: WAKBTextSnippet = {
      id: editingSnippetItem.id || 'kb-snip-' + Date.now(),
      title: editingSnippetItem.title.trim(),
      category: editingSnippetItem.category || 'Profil Perusahaan',
      content: editingSnippetItem.content.trim(),
      keywords,
      updatedAt: Date.now()
    };

    let updatedList = [...(settings.knowledgeSnippets || [])];
    const existingIdx = updatedList.findIndex(s => s.id === newSnippet.id);
    if (existingIdx >= 0) {
      updatedList[existingIdx] = newSnippet;
    } else {
      updatedList.push(newSnippet);
    }

    const updated = { ...settings, knowledgeSnippets: updatedList };
    setSettings(updated);
    setIsSnippetModalOpen(false);
    await saveSettingsToServer(updated);
  };

  const handleDeleteSnippetItem = async (id: string) => {
    if (!confirm('Hapus dokumen/paragraf ini dari basis pengetahuan?')) return;
    const updated = {
      ...settings,
      knowledgeSnippets: (settings.knowledgeSnippets || []).filter(s => s.id !== id)
    };
    setSettings(updated);
    await saveSettingsToServer(updated);
  };

  const handleMigrateAllToSnippets = async () => {
    if (!settings.knowledgeProducts || settings.knowledgeProducts.length === 0) return;
    if (!confirm('Pindahkan semua data produk ke format Paragraf Pengetahuan agar lebih simpel dan terpadu?')) return;
    const newSnippets = [...(settings.knowledgeSnippets || [])];
    settings.knowledgeProducts.forEach(p => {
      let content = `Produk: ${p.productName}\nEstimasi Harga: ${p.price}\nDeskripsi: ${p.description}`;
      if (p.faq && p.faq.length > 0) {
        content += `\nDetail Tanya-Jawab:\n` + p.faq.map(f => `• ${f.q}: ${f.a}`).join('\n');
      }
      newSnippets.push({
        id: 'kb-snip-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        title: p.productName,
        category: 'Katalog Produk',
        content: content,
        keywords: p.keywords || [],
        updatedAt: Date.now()
      });
    });

    const updated = {
      ...settings,
      knowledgeSnippets: newSnippets,
      knowledgeProducts: []
    };
    setSettings(updated);
    setKbActiveContainer('snippets');
    await saveSettingsToServer(updated);
  };

  // Source Website & Referensi CRUD with Immediate Auto-Save
  const handleSaveWebSourceItem = async () => {
    if (!editingWebSourceItem.url.trim() || !editingWebSourceItem.title.trim()) {
      alert('URL dan judul sumber website wajib diisi.');
      return;
    }
    let url = editingWebSourceItem.url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const newSource: WAKBWebSource = {
      id: editingWebSourceItem.id || 'kb-web-' + Date.now(),
      url,
      title: editingWebSourceItem.title.trim(),
      summary: editingWebSourceItem.summary.trim(),
      isActive: editingWebSourceItem.isActive,
      updatedAt: Date.now()
    };

    let updatedList = [...(settings.knowledgeWebSources || [])];
    const existingIdx = updatedList.findIndex(w => w.id === newSource.id);
    if (existingIdx >= 0) {
      updatedList[existingIdx] = newSource;
    } else {
      updatedList.push(newSource);
    }

    const updated = { ...settings, knowledgeWebSources: updatedList };
    setSettings(updated);
    setIsWebSourceModalOpen(false);
    await saveSettingsToServer(updated);
  };

  const handleDeleteWebSourceItem = async (id: string) => {
    if (!confirm('Hapus sumber website ini?')) return;
    const updated = {
      ...settings,
      knowledgeWebSources: (settings.knowledgeWebSources || []).filter(w => w.id !== id)
    };
    setSettings(updated);
    await saveSettingsToServer(updated);
  };

  const handleToggleWebSourceActive = async (id: string) => {
    const updated = {
      ...settings,
      knowledgeWebSources: (settings.knowledgeWebSources || []).map(w => 
        w.id === id ? { ...w, isActive: !w.isActive } : w
      )
    };
    setSettings(updated);
    await saveSettingsToServer(updated);
  };

  // Tag Adders with Auto-Save
  const handleAddRestrictedTopic = async () => {
    if (!newRestrictedInput.trim()) return;
    const current = settings.restrictedTopics || [];
    if (!current.includes(newRestrictedInput.trim())) {
      const updated = { ...settings, restrictedTopics: [...current, newRestrictedInput.trim()] };
      setSettings(updated);
      await saveSettingsToServer(updated);
    }
    setNewRestrictedInput('');
  };

  const handleRemoveRestrictedTopic = async (topic: string) => {
    const updated = {
      ...settings,
      restrictedTopics: (settings.restrictedTopics || []).filter(t => t !== topic)
    };
    setSettings(updated);
    await saveSettingsToServer(updated);
  };

  const handleAddHandoverTrigger = async () => {
    if (!newHandoverKeywordInput.trim()) return;
    const current = settings.handoverToHuman?.triggerKeywords || [];
    if (!current.includes(newHandoverKeywordInput.trim())) {
      const updated = {
        ...settings,
        handoverToHuman: {
          ...settings.handoverToHuman,
          triggerKeywords: [...current, newHandoverKeywordInput.trim()]
        }
      };
      setSettings(updated);
      await saveSettingsToServer(updated);
    }
    setNewHandoverKeywordInput('');
  };

  const handleRemoveHandoverTrigger = async (kw: string) => {
    const updated = {
      ...settings,
      handoverToHuman: {
        ...settings.handoverToHuman,
        triggerKeywords: (settings.handoverToHuman?.triggerKeywords || []).filter(k => k !== kw)
      }
    };
    setSettings(updated);
    await saveSettingsToServer(updated);
  };

  const handleAddSalesCtaTrigger = async () => {
    if (!newSalesCtaKeywordInput.trim()) return;
    const current = settings.salesCta?.triggerKeywords || [];
    if (!current.includes(newSalesCtaKeywordInput.trim())) {
      const updated = {
        ...settings,
        salesCta: {
          ...settings.salesCta,
          triggerKeywords: [...current, newSalesCtaKeywordInput.trim()]
        }
      };
      setSettings(updated);
      await saveSettingsToServer(updated);
    }
    setNewSalesCtaKeywordInput('');
  };

  const handleRemoveSalesCtaTrigger = async (kw: string) => {
    const updated = {
      ...settings,
      salesCta: {
        ...settings.salesCta,
        triggerKeywords: (settings.salesCta?.triggerKeywords || []).filter(k => k !== kw)
      }
    };
    setSettings(updated);
    await saveSettingsToServer(updated);
  };

  const selectedChat = chats.find(c => c.jid === selectedChatJid);

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
      
      {/* Top Universal WhatsApp Hub Header with 3 Tabs */}
      <div className="shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
            <MessageSquare size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black text-zinc-900 dark:text-zinc-100">WhatsApp Hub</h1>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                connectionStatus.connectionState === 'connected'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}>
                {connectionStatus.connectionState === 'connected' ? (connectionStatus.userPhone ? `+${connectionStatus.userPhone}` : 'Online') : 'Offline'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 hidden sm:block">
"              {activeSubTab === 'chat' && 'Percakapan pelanggan & interaksi pesan WhatsApp'}
              {activeSubTab === 'setting-ai' && 'Basis pengetahuan multi-kontainer, guardrails & instruksi AI'}
              {activeSubTab === 'perangkat' && 'Status barcode QR & perangkat tertaut CS AI (Perangkat 1)'}
            </p>
          </div>
        </div>

        {/* 3 Nav Tabs */}
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl text-xs font-bold overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => setActiveSubTab('chat')}
            className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'chat'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <MessageSquare size={14} />
            <span>Chat Langsung</span>
            {chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0) > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500 text-white font-mono">
                {chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('setting-ai')}
            className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'setting-ai'
                ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Bot size={14} />
            <span>Knowledge & AI CS</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('perangkat')}
            className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'perangkat'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Smartphone size={14} />
            <span>WA CS (Perangkat 1)</span>
          </button>
        </div>"
      </div>

      {/* Main Body Content */}
      <div className={`flex-1 overflow-hidden ${isMobile && activeSubTab === 'chat' ? 'p-0' : 'p-3 lg:p-4'}`}>
        
        {/* SUB-TAB 1: CHAT WA */}
        {activeSubTab === 'chat' && (
          <div className={`h-full bg-white dark:bg-zinc-900 shadow-sm flex overflow-hidden ${isMobile ? 'border-0' : 'border border-zinc-200 dark:border-zinc-800 rounded-2xl'}`}>
            
            {/* Sidebar Chat List */}
            <div className={`w-full md:w-80 lg:w-96 border-r border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0 bg-white dark:bg-zinc-900 ${isMobile && selectedChatJid ? 'hidden' : 'flex'}`}>
              
              {/* List Header & Nomor Terhubung Indicator */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black tracking-tight">WhatsApp</h2>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      connectionStatus.connectionState === 'connected' 
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' 
                        : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus.connectionState === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {connectionStatus.connectionState === 'connected' ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSyncWithSupabase}
                      disabled={isSyncingSupabase}
                      className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                      title="Sinkronkan riwayat chat dari Supabase Cloud Database"
                    >
                      <RefreshCw size={13} className={isSyncingSupabase ? "animate-spin text-emerald-600" : ""} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSqlModalOpen(true)}
                      className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-violet-600 dark:text-violet-400 transition cursor-pointer"
                      title="Lihat Script SQL Supabase untuk tabel wa_chats"
                    >
                      <Code size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllData}
                      disabled={isSyncingSupabase}
                      className="p-1.5 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 transition cursor-pointer"
                      title="Bersihkan Seluruh Data Percakapan & Perangkat WhatsApp"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Status Nomor Terhubung */}
                <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                      <Smartphone size={11} className="text-emerald-500" />
                      Nomor Terhubung (Sesi):
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                      {connectionStatus.userPhone ? `+${connectionStatus.userPhone}` : 'Belum Tersambung'}
                    </span>
                  </div>

                  {/* Selector Riwayat Nomor Terhubung (Multi-SIM / Multi-Perangkat) */}
                  {knownNumbers.length > 0 && (
                    <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500">Filter Riwayat:</span>
                      <select
                        value={selectedConnectedPhone}
                        onChange={(e) => {
                          setSelectedConnectedPhone(e.target.value);
                          fetchChats(e.target.value);
                        }}
                        className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 outline-none max-w-[170px]"
                      >
                        <option value="active">Nomor Aktif Saat Ini</option>
                        <option value="all">Semua Riwayat Nomor</option>
                        {knownNumbers.filter(n => n.phone && n.phone !== 'default').map(n => (
                          <option key={n.phone} value={n.phone}>
                            +{n.phone} ({n.chatCount} chat) {n.active ? '★' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {syncToast && (
                  <div className="p-1.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-[10px] font-semibold text-center animate-in fade-in">
                    {syncToast}
                  </div>
                )}
              </div>

              {/* Chat Item List */}
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {chats.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400 text-xs italic">
                    Belum ada percakapan.
                  </div>
                ) : (
                  chats.map((c, idx) => {
                    const isSelected = selectedChatJid === c.jid || selectedChatJid === c.id;
                    return (
                      <div
                        key={`${c.jid || c.id}_${idx}`}
                        onClick={() => setSelectedChatJid(c.jid || c.id)}
                        className={`p-4 cursor-pointer transition-all flex items-start gap-3 select-none group relative ${
                          isSelected && !isMobile
                            ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40 active:bg-zinc-100 dark:active:bg-zinc-800'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-black text-sm shrink-0 shadow-sm border border-zinc-200 dark:border-zinc-800">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 py-0.5">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h3 className="text-sm font-black truncate text-zinc-900 dark:text-zinc-100">
                                {c.name}
                              </h3>
                              {c.isHandedOverToHuman && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 shrink-0">
                                  CS Manusia
                                </span>
                              )}
                              {c.waitingHandoverConsent && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                                  Tawaran CS
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-400 font-bold shrink-0">
                              {new Date(c.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate pr-6">
                            {c.lastMessage}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChat(c);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-500 rounded transition absolute right-2 bottom-2"
                          title="Hapus Obrolan Ini"
                        >
                          <Trash2 size={13} />
                        </button>
                        {c.unreadCount > 0 && (
                          <span className="mt-1 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Main Chat Box */}
            <div className={`flex-1 flex flex-col bg-[#efeae2] dark:bg-zinc-950 ${isMobile && !selectedChatJid ? 'hidden' : 'flex'}`}>
              {selectedChat ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 sticky top-0 z-50">
                    <div className="flex items-center gap-3">
                      {isMobile && (
                        <button 
                          onClick={() => setSelectedChatJid(null)}
                          className="p-2 -ml-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
                        >
                          <ChevronLeft size={24} />
                        </button>
                      )}
                      <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-black text-xs shadow-sm">
                        {selectedChat.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">
                            {selectedChat.name}
                          </h2>
                          {selectedChat.isHandedOverToHuman && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                              ● Ditangani CS Manusia
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400 block leading-none">
                          {selectedChat.phone}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleChatHandover(selectedChat.jid, selectedChat.isHandedOverToHuman)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          selectedChat.isHandedOverToHuman
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border border-amber-300 dark:border-amber-800 hover:bg-amber-200'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                        }`}
                        title={selectedChat.isHandedOverToHuman ? 'Klik untuk mengaktifkan kembali bot AI' : 'Alihkan penanganan percakapan ini ke CS manusia'}
                      >
                        <UserCheck size={14} />
                        <span>{selectedChat.isHandedOverToHuman ? 'Aktifkan AI Kembali' : 'Alihkan ke CS'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteChat(selectedChat)}
                        className="p-2 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-500 rounded-xl transition flex items-center gap-1 text-xs font-bold cursor-pointer"
                        title="Hapus Obrolan"
                      >
                        <Trash2 size={16} />
                        <span className="hidden sm:inline">Hapus Obrolan</span>
                      </button>
                    </div>
                  </div>

                  {/* Banner jika chat sedang ditangani CS Manusia */}
                  {selectedChat.isHandedOverToHuman && (
                    <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-300 animate-in fade-in shrink-0">
                      <div className="flex items-center gap-2">
                        <UserCheck size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>Percakapan ini dialihkan dari AI dan <strong>sedang ditangani oleh CS Manusia</strong>. Bot AI dinonaktifkan untuk obrolan ini.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleChatHandover(selectedChat.jid, true)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shrink-0 transition cursor-pointer"
                      >
                        Kembalikan ke AI
                      </button>
                    </div>
                  )}

                  {/* Messages Scroll Area */}
                  <div 
                    className="flex-1 overflow-y-auto p-4 space-y-3"
                    onScroll={(e) => {
                      const target = e.currentTarget;
                      const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
                      isUserScrollingUpRef.current = !isNearBottom;
                    }}
                  >
                    {selectedChat.messages.filter((m, idx, arr) => {
                      const firstIdx = arr.findIndex(x => (x.id && m.id && x.id === m.id));
                      if (firstIdx !== -1 && firstIdx !== idx) return false;
                      const dupIdx = arr.findIndex((x, i) => 
                        i < idx && 
                        x.fromMe === m.fromMe && 
                        x.text === m.text && 
                        Math.abs((x.timestamp || 0) - (m.timestamp || 0)) < 5000
                      );
                      return dupIdx === -1;
                    }).map((m, idx) => (
                      <div
                        key={`${m.id || 'm'}_${idx}`}
                        className={`flex flex-col ${m.fromMe ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] md:max-w-[70%] p-3 px-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                            m.fromMe
                              ? 'bg-emerald-100 dark:bg-emerald-900 text-zinc-800 dark:text-emerald-50 rounded-tr-none'
                              : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-tl-none'
                          }`}
                        >
                          {/* Image Attachment Rendering */}
                          {m.media && m.media.type === 'image' && (
                            <div className="mb-2 rounded-xl overflow-hidden cursor-pointer group relative max-w-xs sm:max-w-sm">
                              <img
                                src={m.media.data || m.media.url}
                                alt="Foto WhatsApp"
                                className="w-full max-h-72 object-cover rounded-xl transition duration-200 group-hover:scale-[1.02]"
                                onClick={() => setPreviewImageModal(m.media?.data || m.media?.url || null)}
                              />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                                <span className="p-1.5 px-2.5 rounded-lg bg-black/70 text-white text-xs flex items-center gap-1 font-bold shadow">
                                  <Maximize2 size={13} /> Lihat Foto
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Document File Attachment Rendering */}
                          {m.media && m.media.type === 'document' && (
                            <div className="mb-2 p-3 bg-black/5 dark:bg-white/10 rounded-xl border border-black/10 dark:border-white/15 flex items-center justify-between gap-3 max-w-xs sm:max-w-sm">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                                  <FileText size={18} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold truncate text-zinc-900 dark:text-zinc-100">{m.media.fileName || 'Dokumen'}</p>
                                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">{formatFileSize(m.media.fileSize)}</p>
                                </div>
                              </div>
                              {m.media.data && (
                                <a
                                  href={m.media.data}
                                  download={m.media.fileName || 'dokumen'}
                                  className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition shrink-0 shadow-sm"
                                  title="Unduh File"
                                >
                                  <Download size={14} />
                                </a>
                              )}
                            </div>
                          )}

                          {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className={`text-[9px] font-bold ${
                              m.fromMe ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'
                            }`}>
                              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {m.fromMe && <Check size={10} className="text-emerald-600 dark:text-emerald-400" />}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Attachment Preview Strip */}
                  {attachedMedia && (
                    <div className="px-4 py-2 bg-emerald-50 dark:bg-zinc-800/90 border-t border-emerald-200 dark:border-zinc-700 flex items-center justify-between gap-3 animate-in fade-in duration-200">
                      <div className="flex items-center gap-3 min-w-0">
                        {attachedMedia.type === 'image' ? (
                          <img src={attachedMedia.data} alt="Pratinjau" className="w-11 h-11 object-cover rounded-xl border border-emerald-300 dark:border-zinc-600 shadow-sm" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                            <FileText size={20} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">
                            {attachedMedia.type === 'image' ? (attachedMedia.fileName || 'Foto WhatsApp') : (attachedMedia.fileName || 'Dokumen')}
                          </p>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            {formatFileSize(attachedMedia.fileSize)} • Siap dikirim
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachedMedia(null)}
                        className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition"
                        title="Hapus Lampiran"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* Chat Input Bar with File & Image Attachments */}
                  <form onSubmit={handleSendMessage} className="p-2.5 md:p-3 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 md:gap-2 shrink-0">
                    {/* Hidden Native File Inputs */}
                    <input
                      type="file"
                      ref={imageInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e, 'image')}
                    />
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="*/*"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e, 'document')}
                    />

                    {/* Attachment Action Buttons */}
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="p-2.5 text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors shrink-0"
                      title="Kirim Foto / Gambar"
                    >
                      <ImageIcon size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors shrink-0"
                      title="Kirim File Dokumen (PDF, Excel, Word, dll.)"
                    >
                      <Paperclip size={20} />
                    </button>

                    <input
                      type="text"
                      placeholder={attachedMedia ? "Tambahkan keterangan (opsional)..." : "Ketik pesan..."}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="flex-1 px-4 py-2.5 md:py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:border-emerald-600 dark:focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={(!replyText.trim() && !attachedMedia) || isSending}
                      className="p-2.5 md:p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl disabled:opacity-40 transition-all active:scale-95 shadow-sm shrink-0"
                      title="Kirim"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400 bg-white dark:bg-zinc-900">
                   <MessageSquare size={64} className="opacity-10 mb-4" />
                   <p className="text-sm font-black text-zinc-500">Pilih obrolan untuk mulai.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB-TAB 2: SETTING AI */}
        {/* SUB-TAB 2: SETTING AI DENGAN KONTAINER TERPISAH & KONTROL PROMPT LENGKAP */}
        {activeSubTab === 'setting-ai' && (
          <div className="h-full overflow-y-auto space-y-6 max-w-5xl mx-auto pb-12">
            {/* Top Control Banner */}
            <div className="bg-white dark:bg-zinc-900 p-5 sm:p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Bot size={26} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">Knowledge & AI WhatsApp Bot</h2>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      settings.autoReplyEnabled 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' 
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {settings.autoReplyEnabled ? '● Aktif' : '○ Nonaktif'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Basis pengetahuan multi-kontainer, guardrails topik terlarang, serah terima CS, dan gaya bahasa bot.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800">
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Auto-Reply</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={settings.autoReplyEnabled} 
                      onChange={(e) => {
                        const updated = { ...settings, autoReplyEnabled: e.target.checked };
                        setSettings(updated);
                        saveSettingsToServer(updated);
                      }} 
                      className="sr-only peer" 
                    />
                    <div className="w-10 h-5 bg-zinc-300 dark:bg-zinc-700 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => setIsSqlModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition flex items-center gap-1.5 cursor-pointer"
                  title="Lihat status & script SQL Supabase"
                >
                  <Database size={13} />
                  <span>Script SQL Tabel</span>
                </button>

                <button 
                  type="button"
                  onClick={handleSaveSettings} 
                  disabled={isSavingSettings} 
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Save size={14} />
                  <span>{isSavingSettings ? 'Menyimpan...' : (saveSuccessMsg || 'Simpan Pengaturan')}</span>
                </button>
              </div>
            </div>

            {/* Sub-Section Navigation Pills */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setAiActiveSection('knowledge')}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  aiActiveSection === 'knowledge'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Layers size={14} className="text-emerald-500" />
                <span>Basis Pengetahuan (Paragraf & Konten)</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono">
                  {(settings.knowledgeProducts?.length || 0) + (settings.knowledgeSnippets?.length || 0) + (settings.knowledgeWebSources?.length || 0)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAiActiveSection('prompt-setup')}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  aiActiveSection === 'prompt-setup'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Sparkles size={14} className="text-amber-500" />
                <span>Instruksi & Persona AI</span>
              </button>

              <button
                type="button"
                onClick={() => setAiActiveSection('guardrails')}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  aiActiveSection === 'guardrails'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <ShieldAlert size={14} className="text-rose-500" />
                <span>Guardrails, Handover & CTA</span>
              </button>

              <button
                type="button"
                onClick={() => setAiActiveSection('simulator')}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  aiActiveSection === 'simulator'
                    ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Play size={14} className="text-emerald-500 fill-emerald-500" />
                <span>Uji / Simulator Respon</span>
              </button>

              <button
                type="button"
                onClick={() => setAiActiveSection('logs')}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  aiActiveSection === 'logs'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <MessageSquare size={14} />
                <span>Log Aktivitas Bot ({settings.logs?.length || 0})</span>
              </button>
            </div>

            {/* SECTION 1: BASIS PENGETAHUAN (PARAGRAF & KONTEN) */}
            {aiActiveSection === 'knowledge' && (
              <div className="space-y-6">
                {/* Switcher Kontainer Pengetahuan */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Container 1 Tab: Paragraf & Dokumen (Utama) */}
                  <div 
                    onClick={() => setKbActiveContainer('snippets')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      kbActiveContainer === 'snippets'
                        ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-500 shadow-xs ring-1 ring-blue-500/20'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        kbActiveContainer === 'snippets' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600'
                      }`}>
                        <BookOpen size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-100">Paragraf & Konten</h4>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold">Utama</span>
                        </div>
                        <p className="text-[10px] text-zinc-500">Aturan, SOP, info, kebijakan</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {settings.knowledgeSnippets?.length || 0}
                    </span>
                  </div>

                  {/* Container 2 Tab: Katalog Produk */}
                  <div 
                    onClick={() => setKbActiveContainer('products')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      kbActiveContainer === 'products'
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-500 shadow-xs ring-1 ring-emerald-500/20'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        kbActiveContainer === 'products' ? 'bg-emerald-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600'
                      }`}>
                        <Tag size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-100">Katalog Produk</h4>
                        <p className="text-[10px] text-zinc-500">Daftar harga & spesifikasi</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {settings.knowledgeProducts?.length || 0}
                    </span>
                  </div>

                  {/* Container 3 Tab: Website */}
                  <div 
                    onClick={() => setKbActiveContainer('websites')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      kbActiveContainer === 'websites'
                        ? 'bg-violet-50/80 dark:bg-violet-950/30 border-violet-500 shadow-xs ring-1 ring-violet-500/20'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        kbActiveContainer === 'websites' ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600'
                      }`}>
                        <Globe size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-100">Referensi Website</h4>
                        <p className="text-[10px] text-zinc-500">Tautan & ringkasan web</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {settings.knowledgeWebSources?.length || 0}
                    </span>
                  </div>
                </div>

                {/* Search Bar & Add Button */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <input
                    type="text"
                    placeholder={`Cari dalam kontainer ${kbActiveContainer === 'products' ? 'produk' : kbActiveContainer === 'snippets' ? 'paragraf' : 'website'}...`}
                    value={kbSearchQuery}
                    onChange={(e) => setKbSearchQuery(e.target.value)}
                    className="w-full sm:w-80 px-3.5 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />

                  {kbActiveContainer === 'products' && (
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleResetKnowledge}
                        disabled={isResettingKnowledge}
                        className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Kembalikan basis pengetahuan ke format default bersih PT. Panca Prima Wijaya"
                      >
                        <RotateCcw size={13} className={isResettingKnowledge ? 'animate-spin' : ''} />
                        <span>{isResettingKnowledge ? 'Mereset...' : 'Reset Knowledge'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingKbItem({
                            id: '',
                            productName: '',
                            description: '',
                            price: '',
                            keywordsStr: '',
                            faqList: [{ q: '', a: '' }]
                          });
                          setIsKbModalOpen(true);
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>Tambah Produk Baru</span>
                      </button>
                    </div>
                  )}

                  {kbActiveContainer === 'snippets' && (
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleResetKnowledge}
                        disabled={isResettingKnowledge}
                        className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Kembalikan basis pengetahuan ke format paragraf default resmi PT. Panca Prima Wijaya"
                      >
                        <RotateCcw size={13} className={isResettingKnowledge ? 'animate-spin' : ''} />
                        <span>{isResettingKnowledge ? 'Mereset...' : 'Reset Knowledge ke Default'}</span>
                      </button>

                      {settings.knowledgeProducts && settings.knowledgeProducts.length > 0 && (
                        <button
                          type="button"
                          onClick={handleMigrateAllToSnippets}
                          className="px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                          title="Pindahkan produk ke dalam format paragraf dokumen"
                        >
                          <Layers size={13} />
                          <span>Satukan Produk ke Paragraf ({settings.knowledgeProducts.length})</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSnippetItem({
                            id: '',
                            title: '',
                            category: 'Kebijakan & S&K',
                            content: '',
                            keywordsStr: ''
                          });
                          setIsSnippetModalOpen(true);
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>Tambah Paragraf Pengetahuan</span>
                      </button>
                    </div>
                  )}

                  {kbActiveContainer === 'websites' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWebSourceItem({
                          id: '',
                          url: '',
                          title: '',
                          summary: '',
                          isActive: true
                        });
                        setIsWebSourceModalOpen(true);
                      }}
                      className="w-full sm:w-auto px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Tambah Tautan Website</span>
                    </button>
                  )}
                </div>

                {/* CONTENT CONTAINER 1: PRODUK & LAYANAN */}
                {kbActiveContainer === 'products' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(settings.knowledgeProducts?.length ? settings.knowledgeProducts : (settings.knowledgeBase || []))
                        .filter(p => !kbSearchQuery || p.productName.toLowerCase().includes(kbSearchQuery.toLowerCase()) || p.description.toLowerCase().includes(kbSearchQuery.toLowerCase()))
                        .map(item => (
                          <div 
                            key={item.id} 
                            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-800 transition flex flex-col justify-between space-y-4"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                                    Kategori Produk
                                  </span>
                                  <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-1">{item.productName}</h4>
                                </div>
                                <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 shrink-0">
                                  {item.price}
                                </span>
                              </div>

                              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-3">
                                {item.description}
                              </p>

                              {/* Keywords */}
                              {item.keywords && item.keywords.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {item.keywords.map((kw, i) => (
                                    <span key={i} className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-md">
                                      #{kw}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* FAQ List Preview */}
                              {item.faq && item.faq.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                    <HelpCircle size={11} /> {item.faq.length} Tanya Jawab (FAQ)
                                  </span>
                                  {item.faq.slice(0, 2).map((f, fi) => (
                                    <div key={fi} className="text-[11px] bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                                      <p className="font-bold text-zinc-800 dark:text-zinc-200">Q: {f.q}</p>
                                      <p className="text-zinc-500 dark:text-zinc-400 text-[10px] mt-0.5">A: {f.a}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingKbItem({
                                    id: item.id,
                                    productName: item.productName,
                                    description: item.description,
                                    price: item.price,
                                    keywordsStr: (item.keywords || []).join(', '),
                                    faqList: item.faq?.length ? item.faq : [{ q: '', a: '' }]
                                  });
                                  setIsKbModalOpen(true);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center gap-1 cursor-pointer"
                              >
                                <FileEdit size={13} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteKbItem(item.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={13} />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>

                    {(!settings.knowledgeProducts?.length && !settings.knowledgeBase?.length) && (
                      <div className="p-10 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 space-y-3">
                        <Tag className="mx-auto text-zinc-400" size={32} />
                        <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Belum Ada Produk Terdaftar</h4>
                        <p className="text-xs text-zinc-500 max-w-sm mx-auto">Tambahkan produk agar bot WhatsApp dapat memberikan penawaran harga, spesifikasi, dan FAQ otomatis kepada pelanggan.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* CONTENT CONTAINER 2: PARAGRAF BIASA / CATATAN BEBAS */}
                {kbActiveContainer === 'snippets' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(settings.knowledgeSnippets || [])
                        .filter(s => !kbSearchQuery || s.title.toLowerCase().includes(kbSearchQuery.toLowerCase()) || s.content.toLowerCase().includes(kbSearchQuery.toLowerCase()))
                        .map(item => (
                          <div 
                            key={item.id} 
                            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs hover:border-blue-300 dark:hover:border-blue-800 transition flex flex-col justify-between space-y-4"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">
                                    {item.category || 'Paragraf Pengetahuan'}
                                  </span>
                                  <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-1">{item.title}</h4>
                                </div>
                              </div>

                              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto pr-1">
                                {item.content}
                              </p>

                              {/* Keywords */}
                              {item.keywords && item.keywords.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {item.keywords.map((kw, i) => (
                                    <span key={i} className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md">
                                      #{kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSnippetItem({
                                    id: item.id,
                                    title: item.title,
                                    category: item.category || 'Profil Perusahaan',
                                    content: item.content,
                                    keywordsStr: (item.keywords || []).join(', ')
                                  });
                                  setIsSnippetModalOpen(true);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center gap-1 cursor-pointer"
                              >
                                <FileEdit size={13} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSnippetItem(item.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={13} />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>

                    {(!settings.knowledgeSnippets || settings.knowledgeSnippets.length === 0) && (
                      <div className="p-10 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 space-y-3">
                        <BookOpen className="mx-auto text-zinc-400" size={32} />
                        <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Belum Ada Paragraf / Catatan Bebas</h4>
                        <p className="text-xs text-zinc-500 max-w-sm mx-auto">Input teks bebas seperti profil perusahaan, SOP pengiriman, garansi retur, atau nomor rekening resmi agar bot dapat menjawab dengan tepat.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* CONTENT CONTAINER 3: SOURCE WEBSITE & LINK */}
                {kbActiveContainer === 'websites' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(settings.knowledgeWebSources || [])
                        .filter(w => !kbSearchQuery || w.title.toLowerCase().includes(kbSearchQuery.toLowerCase()) || w.url.toLowerCase().includes(kbSearchQuery.toLowerCase()))
                        .map(item => (
                          <div 
                            key={item.id} 
                            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs hover:border-violet-300 dark:hover:border-violet-800 transition flex flex-col justify-between space-y-4"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-[10px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 rounded-md">
                                    Sumber Website
                                  </span>
                                  <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-1">{item.title}</h4>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleWebSourceActive(item.id)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer ${
                                    item.isActive 
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' 
                                      : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800'
                                  }`}
                                >
                                  {item.isActive ? '● Dipelajari Bot' : '○ Nonaktif'}
                                </button>
                              </div>

                              <a 
                                href={item.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 truncate"
                              >
                                <ExternalLink size={12} className="shrink-0" />
                                <span className="truncate">{item.url}</span>
                              </a>

                              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Ringkasan Materi yang Diserap Bot:</p>
                                <p className="line-clamp-4">{item.summary}</p>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingWebSourceItem({
                                    id: item.id,
                                    url: item.url,
                                    title: item.title,
                                    summary: item.summary,
                                    isActive: item.isActive
                                  });
                                  setIsWebSourceModalOpen(true);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center gap-1 cursor-pointer"
                              >
                                <FileEdit size={13} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWebSourceItem(item.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={13} />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>

                    {(!settings.knowledgeWebSources || settings.knowledgeWebSources.length === 0) && (
                      <div className="p-10 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 space-y-3">
                        <Globe className="mx-auto text-zinc-400" size={32} />
                        <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Belum Ada Tautan Website Referensi</h4>
                        <p className="text-xs text-zinc-500 max-w-sm mx-auto">Cantumkan URL website perusahaan dan rangkuman poin-poin utamanya agar bot dapat mereferensikan sumber resmi kepada pelanggan.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 2: SETUP PROMPT, PERSONA & GUARDRAILS */}
            {aiActiveSection === 'prompt-setup' && (
              <div className="space-y-6">
                {/* 1. Core System Instructions */}
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-zinc-900 dark:text-zinc-100">
                      <Sparkles className="text-amber-500" size={20} />
                      <div>
                        <h3 className="text-sm font-black">1. System Instructions (Core Prompt AI Customer Service)</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Instruksi sistem utama yang mendikte peran, identitas, wewenang, batasan fakta, dan aturan percakapan bot AI saat melayani pelanggan.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettings({
                        ...settings,
                        systemInstructions: `# SYSTEM PROMPT — AI CUSTOMER SERVICE WHATSAPP\n\n## 1. Peran\nKamu adalah customer service profesional yang ramah, komunikatif, solutif, dan natural. Tujuanmu adalah membantu pelanggan menyelesaikan kebutuhannya, bukan sekadar menjawab FAQ.\n\n## 2. Gaya percakapan\n- Berkomunikasilah seperti staf CS manusia yang berpengalaman.\n- Pahami maksud pelanggan meskipun kalimatnya tidak lengkap, terdapat typo, bahasa informal, singkatan, atau bahasa campuran.\n- Gunakan konteks percakapan sebelumnya untuk memahami pertanyaan lanjutan.\n- Jawab dengan penjelasan yang cukup, relevan, dan mudah dipahami.\n- Jangan selalu menjawab dengan satu kalimat jika pelanggan membutuhkan penjelasan.\n- Jangan terlalu panjang jika pertanyaannya sederhana.\n- Hindari mengulang salam, memperkenalkan diri, atau menawarkan bantuan yang sama pada setiap pesan.\n- Jangan memaksa pelanggan mengikuti alur percakapan yang kaku.\n- Jangan terus-menerus menawarkan untuk menghubungi admin.\n\n## 3. Cara memahami pertanyaan\nSebelum menjawab:\n1. Identifikasi kebutuhan utama pelanggan.\n2. Periksa konteks pesan sebelumnya.\n3. Cari informasi relevan di knowledge base.\n4. Gabungkan informasi relevan dari beberapa dokumen jika diperlukan.\n5. Jawab sesuai maksud pertanyaan, bukan hanya berdasarkan kecocokan kata kunci.\n6. Jika pertanyaan belum jelas, tanyakan satu hal yang paling penting untuk memperjelasnya.\n\n## 4. Aturan ketika informasi tidak ditemukan\nJangan langsung melakukan fallback hanya karena jawaban tidak ditemukan secara persis di knowledge base.\n\nGunakan urutan berikut:\n1. Cari sinonim, istilah terkait, dan informasi yang memiliki makna serupa.\n2. Periksa percakapan sebelumnya dan informasi pelanggan yang tersedia.\n3. Gunakan informasi perusahaan yang relevan untuk menyusun jawaban.\n4. Jika memungkinkan, jelaskan hal yang sudah diketahui dan tandai bagian yang belum dapat dipastikan.\n5. Jika maksud pelanggan belum jelas, tanyakan klarifikasi.\n6. Eskalasikan ke admin hanya jika masalah benar-benar membutuhkan informasi, kewenangan, atau tindakan manusia.\n\n## 5. Batasan fakta\n- Jangan mengarang harga, diskon, stok, spesifikasi, garansi, jadwal, kebijakan, atau janji perusahaan.\n- Bedakan fakta dari asumsi.\n- Pengetahuan umum boleh digunakan untuk menjelaskan konsep umum, tetapi jangan menjadikannya sebagai fakta resmi perusahaan.\n- Jika sebagian informasi tersedia, jawab bagian tersebut terlebih dahulu.\n- Jangan mengklaim telah memesan, mengirim, mengubah data, atau menghubungi admin jika tindakan tersebut belum benar-benar dilakukan.\n\n## 6. Aturan fallback\nFallback bukan jawaban default.\nJangan menggunakan kalimat "Maaf, saya tidak tahu" atau "Silakan hubungi admin" hanya karena pertanyaan tidak tercantum sebagai FAQ.\n\nJika informasi belum lengkap:\n- Jelaskan apa yang sudah diketahui.\n- Sampaikan dengan jujur bagian yang perlu dikonfirmasi.\n- Tanyakan informasi tambahan jika dapat membantu.\n- Tawarkan bantuan admin jika memang diperlukan atau diminta pelanggan.\n\nJika eskalasi diperlukan, jelaskan alasannya secara singkat dan jangan berpura-pura bahwa admin sudah menerima percakapan sebelum sistem mengonfirmasinya.\n\n## 7. Tujuan percakapan\nUtamakan penyelesaian kebutuhan pelanggan, pemahaman konteks, komunikasi natural, akurasi informasi, dan pengalaman pelanggan yang baik.\n\nJangan menjadikan jumlah pesan, panjang jawaban, atau keberhasilan menemukan FAQ sebagai tujuan utama. Tujuan utama adalah membantu pelanggan sampai kebutuhannya jelas dan mendapatkan solusi yang tepat.`
                      })}
                      className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40 text-xs font-bold hover:bg-amber-100 transition cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                      <RotateCcw size={13} />
                      <span>Reset ke 7 Poin Standard Prompt</span>
                    </button>
                  </div>

                  <textarea
                    rows={14}
                    value={settings.systemInstructions}
                    onChange={(e) => setSettings({ ...settings, systemInstructions: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed font-mono"
                    placeholder="Tuliskan instruksi sistem persona AI di sini..."
                  />

                  {/* Quick Presets */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Preset Lainnya:</span>
                    <button
                      type="button"
                      onClick={() => setSettings({
                        ...settings,
                        systemInstructions: "Anda adalah asisten AI customer service resmi PT. Panca Prima Wijaya di WhatsApp. Tugas utama Anda adalah melayani pertanyaan pelanggan seputar produk, penawaran harga, prosedur pemesanan, dan informasi perusahaan secara ramah, ringkas, sopan, dan solutif."
                      })}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
                    >
                      Ringkas & To-the-point
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({
                        ...settings,
                        systemInstructions: "Anda adalah Sales Specialist AI PT. Panca Prima Wijaya yang berorientasi pada transaksi. Berikan penjelasan keunggulan produk secara antusias, berikan perkiraan harga, dan dorong pelanggan untuk membuat quotation resmi."
                      })}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
                    >
                      Sales Specialist Aktif
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({
                        ...settings,
                        systemInstructions: "Anda adalah Technical Support AI PT. Panca Prima Wijaya. Jawab pertanyaan teknis, sertifikasi standar barang, dan prosedur garansi dengan data akurat dan bahasa baku profesional."
                      })}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
                    >
                      Technical Support Formal
                    </button>
                  </div>
                </div>

                {/* 2. Tone of Voice & Response Language */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tone of Voice */}
                  <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                      <Volume2 className="text-emerald-500" size={18} />
                      <h3 className="text-sm font-black">2. Tone of Voice (Gaya Bahasa)</h3>
                    </div>
                    <p className="text-xs text-zinc-500">Pilih intonasi bicara bot yang mewakili identitas brand Anda:</p>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { title: 'Ramah & Solutif', desc: 'Hangat, sopan, emotikon natural' },
                        { title: 'Formal & Profesional', desc: 'Resmi, baku, cocok corporate' },
                        { title: 'Kasual & Santai', desc: 'Akrab, luwes seperti teman' },
                        { title: 'Tegas & Informatif', desc: 'To-the-point, fokus data' },
                        { title: 'Luxury & Elegan', desc: 'Prestisius, bahasa berkelas' }
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSettings({ ...settings, toneOfVoice: item.title, tone: item.title })}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                            (settings.toneOfVoice || settings.tone) === item.title
                              ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                              : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                          }`}
                        >
                          <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">{item.title}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Response Language */}
                  <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                      <Languages className="text-blue-500" size={18} />
                      <h3 className="text-sm font-black">3. Response Language (Bahasa Respon)</h3>
                    </div>
                    <p className="text-xs text-zinc-500">Bahasa utama yang digunakan bot saat menyusun jawaban:</p>

                    <div className="space-y-2">
                      {[
                        { title: 'Bahasa Indonesia', desc: 'Standar komunikasi bisnis di Indonesia' },
                        { title: 'Bilingual (Indonesia & English)', desc: 'Menyesuaikan otomatis dengan bahasa pelanggan' },
                        { title: 'English Only', desc: 'Komunikasi internasional dalam bahasa Inggris' },
                        { title: 'Bahasa Jawa Sopan (Krama Inggil)', desc: 'Layanan lokal ramah untuk area Jawa Tengah & Timur' }
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSettings({ ...settings, responseLanguage: item.title })}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-center justify-between ${
                            settings.responseLanguage === item.title
                              ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                              : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">{item.title}</p>
                            <p className="text-[10px] text-zinc-500">{item.desc}</p>
                          </div>
                          {settings.responseLanguage === item.title && (
                            <CheckCircle2 size={16} className="text-blue-600" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Pesan Otomatis (Greeting & Fallback) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Pesan Salam Pembuka (Greeting)</h3>
                    <p className="text-xs text-zinc-500">Pesan otomatis saat pelanggan menyapa pertama kali (halo, pagi, salam):</p>
                    <textarea
                      rows={3}
                      value={settings.greetingMessage}
                      onChange={(e) => setSettings({ ...settings, greetingMessage: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Pesan Fallback (Saat Tidak Tahu)</h3>
                    <p className="text-xs text-zinc-500">Pesan cadangan jika pertanyaan pelanggan di luar basis pengetahuan:</p>
                    <textarea
                      rows={3}
                      value={settings.fallbackMessage}
                      onChange={(e) => setSettings({ ...settings, fallbackMessage: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: GUARDRAILS, HANDOVER & SALES CTA */}
            {aiActiveSection === 'guardrails' && (
              <div className="space-y-6">
                {/* 1. Guardrails: Restricted Topics (Topik Terlarang) */}
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                      <ShieldAlert className="text-rose-500" size={20} />
                      <div>
                        <h3 className="text-sm font-black">1. Restricted Topics (Topik Terlarang & Batasan Layanan)</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Topik yang otomatis ditolak secara sopan oleh bot agar tidak membocorkan rahasia bisnis atau melanggar etika.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const presets = [
                          'Isu SARA, politik, dan konten sensitif',
                          'Perbandingan atau menjelekkan kompetitor lain',
                          'Membocorkan harga modal internal atau rahasia supplier pabrik',
                          'Menjanjikan diskon khusus sepihak tanpa persetujuan tim sales resmi',
                          'Data pribadi karyawan di luar nomor kontak layanan resmi'
                        ];
                        setSettings(prev => ({
                          ...prev,
                          restrictedTopics: Array.from(new Set([...(prev.restrictedTopics || []), ...presets]))
                        }));
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40 text-xs font-bold hover:bg-rose-100 transition cursor-pointer shrink-0"
                    >
                      + Pasang Rekomendasi Guardrail
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {(settings.restrictedTopics || []).map((topic, idx) => (
                      <span 
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50"
                      >
                        <span>{topic}</span>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveRestrictedTopic(topic)}
                          className="hover:text-rose-900 dark:hover:text-white cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {(!settings.restrictedTopics || settings.restrictedTopics.length === 0) && (
                      <p className="text-xs text-zinc-400 italic">Belum ada topik terlarang yang didaftarkan.</p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <input
                      type="text"
                      placeholder="Tambah topik terlarang (cth: Bocoran Modal, Politik, Kompetitor)..."
                      value={newRestrictedInput}
                      onChange={(e) => setNewRestrictedInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRestrictedTopic(); } }}
                      className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddRestrictedTopic}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      + Tambah Topik
                    </button>
                  </div>
                </div>

                {/* 2. Handover to Human (Serah Terima CS) */}
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                      <Headphones className="text-violet-500" size={20} />
                      <div>
                        <h3 className="text-sm font-black">2. Handover to Human (Pengalihan ke Tim CS / Sales Manusia)</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Otomatis mengalihkan percakapan ke nomor WhatsApp tim manusia saat pelanggan komplain atau meminta berbicara langsung.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={settings.handoverToHuman?.enabled ?? true} 
                        onChange={(e) => setSettings({
                          ...settings,
                          handoverToHuman: { ...settings.handoverToHuman, enabled: e.target.checked }
                        })}
                        className="sr-only peer" 
                      />
                      <div className="w-10 h-5 bg-zinc-300 dark:bg-zinc-700 rounded-full peer peer-checked:bg-violet-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">Nomor WhatsApp CS / Sales Tujuan</label>
                      <input
                        type="text"
                        value={settings.handoverToHuman?.handoverContact || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          handoverToHuman: { ...settings.handoverToHuman, handoverContact: e.target.value }
                        })}
                        placeholder="Contoh: 0811-1234-5678"
                        className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">Pesan Serah Terima ke Pelanggan</label>
                      <input
                        type="text"
                        value={settings.handoverToHuman?.handoverMessage || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          handoverToHuman: { ...settings.handoverToHuman, handoverMessage: e.target.value }
                        })}
                        placeholder="Gunakan {contact} dan {name} sebagai placeholder"
                        className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1.5">Kata Kunci Pemicu Handover</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(settings.handoverToHuman?.triggerKeywords || []).map((kw, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-900/40">
                          <span>{kw}</span>
                          <button type="button" onClick={() => handleRemoveHandoverTrigger(kw)} className="cursor-pointer hover:text-rose-500"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Tambah kata kunci pemicu (cth: mau telpon, komplain, bicara sales)..."
                        value={newHandoverKeywordInput}
                        onChange={(e) => setNewHandoverKeywordInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddHandoverTrigger(); } }}
                        className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                      />
                      <button type="button" onClick={handleAddHandoverTrigger} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition cursor-pointer">+ Tambah</button>
                    </div>
                  </div>
                </div>

                {/* 3. Sales CTA (Call to Action Otomatis) */}
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                      <Sparkles className="text-amber-500" size={20} />
                      <div>
                        <h3 className="text-sm font-black">3. Sales CTA (Ajakan Aksi Penutupan Penjualan Otomatis)</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Menyematkan ajakan bertindak (Quotation, cek stok, atau sampel) saat pelanggan menanyakan harga atau berminat dengan produk.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={settings.salesCta?.enabled ?? true} 
                        onChange={(e) => setSettings({
                          ...settings,
                          salesCta: { ...settings.salesCta, enabled: e.target.checked }
                        })}
                        className="sr-only peer" 
                      />
                      <div className="w-10 h-5 bg-zinc-300 dark:bg-zinc-700 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                    </label>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">Teks Pesan Call to Action (CTA)</label>
                    <input
                      type="text"
                      value={settings.salesCta?.ctaMessage || ''}
                      onChange={(e) => setSettings({
                        ...settings,
                        salesCta: { ...settings.salesCta, ctaMessage: e.target.value }
                      })}
                      placeholder="Contoh: Apakah Bapak/Ibu ingin kami buatkan penawaran harga resmi (Quotation) untuk kebutuhan ini?"
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1.5">Kata Kunci Pemicu CTA Penjualan</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(settings.salesCta?.triggerKeywords || []).map((kw, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
                          <span>{kw}</span>
                          <button type="button" onClick={() => handleRemoveSalesCtaTrigger(kw)} className="cursor-pointer hover:text-rose-500"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Tambah kata kunci (cth: harga, pesan, beli, katalog)..."
                        value={newSalesCtaKeywordInput}
                        onChange={(e) => setNewSalesCtaKeywordInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSalesCtaTrigger(); } }}
                        className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                      />
                      <button type="button" onClick={handleAddSalesCtaTrigger} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer">+ Tambah</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: SIMULATOR & UJI COBA BALASAN AI */}
            {aiActiveSection === 'simulator' && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-zinc-900 dark:text-zinc-100">
                      <Play className="text-emerald-500 fill-emerald-500" size={20} />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black">Simulator & Uji Percakapan AI</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            simHandedOver 
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300' 
                              : simWaitingConsent 
                                ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border border-violet-300' 
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}>
                            {simHandedOver ? '● Ditangani CS Manusia' : simWaitingConsent ? '⏳ Menunggu Konfirmasi Handover' : '● Bot AI Aktif'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            simFallbackCount >= 3 ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}>
                            Fallback: {simFallbackCount}/3
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Uji jawaban to-the-point (hanya jawab apa yang ditanyakan), fallback kontekstual, dan otomatis tawarkan handover CS saat 3x fallback.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleResetSim}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                      title="Hapus riwayat simulasi dan mulai percakapan baru"
                    >
                      <RotateCcw size={13} />
                      <span>Reset Simulator</span>
                    </button>
                  </div>

                  {/* Preset Question Buttons */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Coba Pertanyaan Skenario:</span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: '👋 Sapaan Pagi / Siang (Humanis)', q: 'Halo selamat siang kak, apa kabar?' },
                        { label: '🤝 Obrolan Pembuka (Mau Tanya)', q: 'Permisi min, saya mau tanya-tanya nih' },
                        { label: '📌 Tanya Aturan S&K (To-the-point)', q: 'Bagaimana ketentuan dan cara pengiriman barang ke luar kota?' },
                        { label: '🏷️ Tanya Info Produk & Harga', q: 'Berapa perkiraan harga mulsa plastik dan fungsinya apa?' },
                        { label: '❓ Tanya Luar Topik #1 (Fallback Edukatif)', q: 'Apakah perusahaan menjual sepeda motor listrik?' },
                        { label: '❓ Tanya Luar Topik #2 (Fallback Fleksibel)', q: 'Bisa minta rekomendasi dokter gigi anak?' },
                        { label: '❓ Tanya Luar Topik #3 (Tawarkan Alihkan CS)', q: 'Siapa nama dokter spesialis tanah yang bisa kami panggil?' },
                        { label: '✅ Ketik Setuju Alihkan ke CS', q: 'Ya, boleh tolong hubungkan ke CS' },
                        { label: '❌ Tolak Alihkan', q: 'Tidak usah, terima kasih' }
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setTestQueryInput(item.q);
                            handleTestAiReply(item.q);
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Simulator Multi-turn Chat Window */}
                  <div className="min-h-[220px] max-h-[420px] overflow-y-auto p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
                    {simMessages.length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center text-center text-zinc-400 space-y-2">
                        <MessageSquare size={32} className="opacity-20" />
                        <p className="text-xs font-bold text-zinc-500">Belum ada percakapan simulasi.</p>
                        <p className="text-[11px] text-zinc-400 max-w-md">
                          Ketik pesan di bawah atau klik salah satu tombol skenario di atas untuk menguji respon bot AI WhatsApp secara langsung.
                        </p>
                      </div>
                    ) : (
                      simMessages.map((m) => (
                        <div 
                          key={m.id} 
                          className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'} space-y-1`}
                        >
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 px-1">
                            <span className="font-bold">{m.sender === 'user' ? 'Pelanggan Uji' : settings.botName}</span>
                            {m.modelUsed && (
                              <span className="px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">
                                {m.modelUsed}
                              </span>
                            )}
                            {m.isFallback && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold">
                                Fallback
                              </span>
                            )}
                            {m.isHandover && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold">
                                Handover CS
                              </span>
                            )}
                          </div>
                          <div 
                            className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                              m.sender === 'user' 
                                ? 'bg-emerald-600 text-white rounded-tr-xs shadow-xs' 
                                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-tl-xs shadow-2xs'
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      ))
                    )}
                    {isTestingAi && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400 p-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        <span>AI sedang memikirkan balasan terbaik...</span>
                      </div>
                    )}
                  </div>

                  {/* Input Query Bar */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testQueryInput}
                      onChange={(e) => setTestQueryInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleTestAiReply(); } }}
                      placeholder={simHandedOver ? "Sesi sedang di-handle CS manusia (klik Reset untuk mulai lagi)..." : "Ketik pesan uji simulasi pelanggan..."}
                      className="flex-1 px-4 py-3 rounded-2xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleTestAiReply()}
                      disabled={isTestingAi || !testQueryInput.trim()}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      <Play size={14} className={isTestingAi ? "animate-spin" : "fill-white"} />
                      <span>{isTestingAi ? 'Memproses...' : 'Kirim Uji'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: LOG AKTIVITAS BOT */}
            {aiActiveSection === 'logs' && (
              <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                    <MessageSquare className="text-emerald-500" size={18} />
                    <h3 className="text-sm font-black">Riwayat Log Interaksi Bot WhatsApp</h3>
                  </div>
                  <span className="text-xs text-zinc-400">{settings.logs?.length || 0} aktivitas tercatat</span>
                </div>

                <div className="space-y-3">
                  {settings.logs && settings.logs.length > 0 ? (
                    settings.logs.map((log) => (
                      <div 
                        key={log.id} 
                        className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/80 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">{log.sender}</span>
                            {log.isHandover && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                                Handover CS
                              </span>
                            )}
                            {log.isRestricted && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                Topik Ditolak
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {new Date(log.timestamp).toLocaleString()} • {log.modelUsed}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <span className="font-bold text-zinc-400 text-[10px] block uppercase">Pesan Pelanggan:</span>
                          {log.incoming}
                        </p>
                        <p className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[10px] block uppercase">Balasan Otomatis:</span>
                          {log.reply}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-zinc-400 text-xs">
                      Belum ada riwayat pesan yang dibalas bot secara otomatis.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 3: PERANGKAT */}
        {activeSubTab === 'perangkat' && (
          <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Card Scanner QR Perangkat */}
              <div className="bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl text-center space-y-6">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">WhatsApp QR Code</h2>
                  <p className="text-xs text-zinc-500 mt-1">Sambungkan perangkat WhatsApp Anda ke sistem MyPanca.</p>
                </div>

                <div className="p-6 bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                  {connectionStatus.connectionState === 'connected' ? (
                    <div className="space-y-5">
                      <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                        <CheckCircle2 size={36}/>
                      </div>
                      <div>
                        <h3 className="font-black text-emerald-600 text-xs uppercase tracking-wider">PERANGKAT TERHUBUNG</h3>
                        <p className="text-xl font-mono font-bold mt-1 text-zinc-900 dark:text-zinc-100">+{connectionStatus.userPhone}</p>
                      </div>
                      <button 
                        onClick={handleLogoutWA} 
                        className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-rose-600/20 transition cursor-pointer"
                      >
                        LOGOUT PERANGKAT INI
                      </button>
                    </div>
                  ) : (connectionStatus.qrCodeBase64 || connectionStatus.rawQrCodeBase64) ? (
                    <div className="space-y-4">
                      {/* WhatsApp Web Style QR Card with Expired Overlay */}
                      <div className="relative p-4 bg-white rounded-2xl shadow-xl inline-block border border-zinc-100 dark:border-zinc-800 overflow-hidden group">
                        <img 
                          src={connectionStatus.qrCodeBase64 || connectionStatus.rawQrCodeBase64!} 
                          alt="WhatsApp QR Code" 
                          className={`w-56 h-56 mx-auto transition-all duration-300 ${
                            (connectionStatus.qrExpired || (qrCountdown === 0 && connectionStatus.connectionState === 'disconnected'))
                              ? 'filter blur-sm brightness-75 scale-95 opacity-40' 
                              : 'opacity-100'
                          }`} 
                        />

                        {/* WhatsApp Web Expired Overlay (hanya muncul jika benar-benar expired/timeout) */}
                        {(connectionStatus.qrExpired || (qrCountdown === 0 && connectionStatus.connectionState === 'disconnected')) && (
                          <div 
                            onClick={() => handleInitConnection(true)}
                            className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 text-center cursor-pointer transition-all duration-200"
                            title="Klik untuk memuat ulang barcode baru"
                          >
                            <div className="w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/40 mb-2.5 transition-transform transform active:scale-90 hover:scale-110">
                              <RefreshCw size={26} className={isLoadingStatus ? 'animate-spin' : ''} />
                            </div>
                            <p className="text-white text-xs font-black tracking-wide drop-shadow-sm">
                              Kode QR telah kedaluwarsa
                            </p>
                            <p className="text-emerald-300 text-[11px] font-semibold mt-1 underline hover:text-emerald-200">
                              Klik di sini untuk memuat ulang kode QR
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Status info bar & countdown like WhatsApp Web */}
                      {!(connectionStatus.qrExpired || (qrCountdown === 0 && connectionStatus.connectionState === 'disconnected')) ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                            <span className="text-[11px]">
                              {connectionStatus.connectionState === 'connecting' && qrCountdown === 0
                                ? 'Sedang menyinkronkan barcode...'
                                : <span>Barcode aktif • Berganti dalam <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black">{qrCountdown}s</span></span>}
                            </span>
                          </div>
                          <div className="w-48 mx-auto bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full transition-all duration-1000 ease-linear"
                              style={{ width: `${Math.min(100, Math.max(0, (qrCountdown / 60) * 100))}%` }}
                            />
                          </div>
                          <p className="text-[10px] font-black text-zinc-400 tracking-wider uppercase">
                            Scan via Perangkat Tertaut di WhatsApp HP
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] font-semibold text-rose-500">
                          Barcode telah kedaluwarsa demi keamanan. Silakan klik gambar untuk memuat ulang.
                        </p>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleInitConnection(true)}
                          disabled={isLoadingStatus}
                          className="flex-1 py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                        >
                          <RefreshCw size={13} className={isLoadingStatus ? 'animate-spin' : ''} />
                          <span>Ganti Barcode Sekarang</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleResetSession}
                          disabled={isLoadingStatus}
                          className="py-2.5 px-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Reset Sesi Bersih & Hapus Cache"
                        >
                          <RotateCcw size={13} />
                          <span>Reset Sesi</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleEmergencyWipe}
                          disabled={isLoadingStatus}
                          className="py-2.5 px-3 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50 rounded-xl text-[10px] font-black uppercase transition flex items-center justify-center gap-1 cursor-pointer"
                          title="Wipe Server Files (Emergency Only)"
                        >
                          <Trash2 size={12} />
                          <span>Wipe All</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => handleInitConnection(true)} 
                      disabled={isLoadingStatus} 
                      className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-xl transition cursor-pointer"
                    >
                      <RefreshCw size={16} className={isLoadingStatus ? 'animate-spin' : ''}/>
                      BUAT BARCODE LOGIN
                    </button>
                  )}
                </div>

                {/* Info Cloud Sync per Nomor Terhubung */}
                <div className="p-3.5 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/50 rounded-2xl text-left space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-violet-800 dark:text-violet-300 font-bold">
                    <Database size={15} />
                    <span>Riwayat Chat Per Nomor Terhubung</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Setiap nomor yang Anda sambungkan disimpan riwayat percakapannya secara terpisah (berdasarkan <strong>no terhubung</strong>) dan otomatis disinkronkan ke Cloud Database Supabase (tabel <code>wa_chats</code>).
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsSqlModalOpen(true)}
                    className="w-full mt-1 py-2 px-3 bg-white dark:bg-zinc-900 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 rounded-xl text-xs font-bold hover:bg-violet-100/50 dark:hover:bg-zinc-800 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Code size={13} />
                    <span>Lihat & Salin Script SQL Supabase</span>
                  </button>
                </div>
              </div>

              {/* Status Ringkasan & Informasi Role Akses */}
              <div className="space-y-4">
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                      <Smartphone size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Status Akses Akun</h3>
                      <p className="text-xs text-zinc-500">
                        {isSuperAdmin ? 'Akses Superadmin (Dapat memantau semua nomor)' : 'Akses CS / Staf (Mengelola nomor milik sendiri)'}
                      </p>
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                    <div>User Login: <strong className="text-zinc-900 dark:text-zinc-200">{currentUser?.nama || 'Pengguna'}</strong></div>
                    <div>Role: <span className="uppercase font-bold text-violet-600 dark:text-violet-400">{currentUser?.role || 'User'}</span></div>
                  </div>
                </div>

                {/* Quick Info list of registered numbers */}
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400">Nomor Terdaftar di Sistem ({knownNumbers.filter(n => n.phone && n.phone !== 'default').length})</h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {knownNumbers.filter(n => n.phone && n.phone !== 'default').map((num, i) => (
                      <div key={i} className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${num.active ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300'}`}></span>
                          <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">+{num.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-zinc-400">{num.chatCount} Chat</span>
                          <button 
                            onClick={() => {
                              setSelectedConnectedPhone(num.phone);
                              fetchChats(num.phone);
                              setActiveSubTab('chat');
                            }}
                            className="px-2.5 py-1 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-[10px] font-bold transition"
                          >
                            Lihat
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* SUPERADMIN SPECIFIC: Full Organization Devices Table */}
            {isSuperAdmin && (
              <div className="max-w-4xl mx-auto bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      <Smartphone size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">Daftar Seluruh Perangkat Terhubung (Akses Superadmin)</h3>
                      <p className="text-xs text-zinc-500">Superadmin dapat memantau dan membuka riwayat chat dari setiap nomor WhatsApp user yang terdaftar</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 shrink-0">
                    {knownNumbers.filter(n => n.phone && n.phone !== 'default' && n.active).length} Aktif Online
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-[11px] font-black uppercase tracking-wider text-zinc-400">
                        <th className="py-3 px-4">Perangkat / Nomor WA</th>
                        <th className="py-3 px-4">User / Penanggung Jawab</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Total Chat</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                      {knownNumbers.filter(n => n.phone && n.phone !== 'default').map((num, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                            +{num.phone}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-zinc-700 dark:text-zinc-300">
                            {num.assignedUser || (num.active ? (connectionStatus.userName || currentUser?.nama || 'User WA') : 'Staf CS')}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {num.active ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ONLINE
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                TERSIMPAN
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-zinc-800 dark:text-zinc-200">
                            {num.chatCount} Chat
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedConnectedPhone(num.phone);
                                fetchChats(num.phone);
                                setActiveSubTab('chat');
                              }}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1"
                            >
                              <MessageSquare size={13} />
                              Lihat Chat
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 4: PERANGKAT WA NOTIFIKASI (PERANGKAT 2) */}
        {activeSubTab === 'perangkat-notif' && (
          <WANotifDeviceTab />
        )}
      </div>

      {/* Modal 1: Knowledge Product with Dynamic FAQ Editor */}
      {isKbModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-6 sm:p-7 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Tag size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                    {editingKbItem.id ? 'Edit Katalog Produk' : 'Tambah Produk Baru'}
                  </h3>
                  <p className="text-[11px] text-zinc-400">Kontainer 1: Informasi produk, harga & FAQ untuk AI</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsKbModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Nama Produk / Layanan</label>
                <input 
                  type="text" 
                  placeholder="Contoh: Plastik Sungkup Pertanian UV"
                  value={editingKbItem.productName} 
                  onChange={e => setEditingKbItem({ ...editingKbItem, productName: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Harga / Satuan</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: Rp 450.000 / Roll"
                    value={editingKbItem.price} 
                    onChange={e => setEditingKbItem({ ...editingKbItem, price: e.target.value })} 
                    className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Kata Kunci (Koma)</label>
                  <input 
                    type="text" 
                    placeholder="sungkup, uv, penutup bedengan"
                    value={editingKbItem.keywordsStr} 
                    onChange={e => setEditingKbItem({ ...editingKbItem, keywordsStr: e.target.value })} 
                    className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Deskripsi Spesifikasi & Keunggulan</label>
                <textarea 
                  rows={3}
                  placeholder="Jelaskan spesifikasi, bahan, ukuran roll, dan fungsi produk..."
                  value={editingKbItem.description} 
                  onChange={e => setEditingKbItem({ ...editingKbItem, description: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" 
                />
              </div>

              {/* Dynamic FAQ List per Product */}
              <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1">
                    <HelpCircle size={12} /> Tanya Jawab Khas Produk Ini (FAQ)
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingKbItem({
                      ...editingKbItem,
                      faqList: [...editingKbItem.faqList, { q: '', a: '' }]
                    })}
                    className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                  >
                    + Tambah FAQ
                  </button>
                </div>

                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {editingKbItem.faqList.map((faq, fIdx) => (
                    <div key={fIdx} className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5 relative group">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-zinc-400">FAQ #{fIdx + 1}</span>
                        {editingKbItem.faqList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = editingKbItem.faqList.filter((_, i) => i !== fIdx);
                              setEditingKbItem({ ...editingKbItem, faqList: updated });
                            }}
                            className="text-rose-500 hover:text-rose-700 cursor-pointer p-0.5"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Pertanyaan (Q): cth. Berapa lama ketahanan di lapangan?"
                        value={faq.q}
                        onChange={e => {
                          const updated = [...editingKbItem.faqList];
                          updated[fIdx].q = e.target.value;
                          setEditingKbItem({ ...editingKbItem, faqList: updated });
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"
                      />
                      <input
                        type="text"
                        placeholder="Jawaban (A): cth. Kuat hingga 2-3 musim tanam."
                        value={faq.a}
                        onChange={e => {
                          const updated = [...editingKbItem.faqList];
                          updated[fIdx].a = e.target.value;
                          setEditingKbItem({ ...editingKbItem, faqList: updated });
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button 
                type="button"
                onClick={() => setIsKbModalOpen(false)} 
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleSaveKbItem} 
                disabled={isSavingSettings}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Save size={13} />
                <span>{isSavingSettings ? 'Menyimpan...' : 'Simpan Produk (Auto-Save)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Paragraf Biasa / Catatan Dokumen User */}
      {isSnippetModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-6 sm:p-7 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                    {editingSnippetItem.id ? 'Edit Paragraf Dokumen' : 'Tambah Paragraf Dokumen Baru'}
                  </h3>
                  <p className="text-[11px] text-zinc-400">Kontainer 2: Teks bebas seperti profil, SOP, rekening, dsb.</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsSnippetModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Judul / Topik Pengetahuan</label>
                <input 
                  type="text" 
                  placeholder="Contoh: Ketentuan Garansi & Tata Cara Retur Barang"
                  value={editingSnippetItem.title} 
                  onChange={e => setEditingSnippetItem({ ...editingSnippetItem, title: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Kategori</label>
                  <select 
                    value={editingSnippetItem.category} 
                    onChange={e => setEditingSnippetItem({ ...editingSnippetItem, category: e.target.value })} 
                    className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Kebijakan & S&K">Kebijakan & S&K</option>
                    <option value="Garansi & Retur">Garansi & Retur</option>
                    <option value="Prosedur Pemesanan">Prosedur Pemesanan</option>
                    <option value="Rekening & Pembayaran">Rekening & Pembayaran</option>
                    <option value="Ekspedisi & Pengiriman">Ekspedisi & Pengiriman</option>
                    <option value="Profil Perusahaan">Profil Perusahaan</option>
                    <option value="Katalog Produk">Katalog Produk</option>
                    <option value="Catatan Bebas Lainnya">Catatan Bebas Lainnya</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Kata Kunci (Opsional)</label>
                  <input 
                    type="text" 
                    placeholder="retur, garansi, rusak (opsional)"
                    value={editingSnippetItem.keywordsStr} 
                    onChange={e => setEditingSnippetItem({ ...editingSnippetItem, keywordsStr: e.target.value })} 
                    className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Isi Paragraf & Konten Pengetahuan</label>
                  <span className="text-[10px] text-zinc-400">AI membaca makna konteks paragraf ini</span>
                </div>
                <textarea 
                  rows={6}
                  placeholder="Tuliskan isi paragraf secara lengkap dan jelas di sini. Bot AI akan membaca langsung konteks paragraf ini dan hanya menjawab poin yang ditanyakan oleh pelanggan secara ramah dan to-the-point..."
                  value={editingSnippetItem.content} 
                  onChange={e => setEditingSnippetItem({ ...editingSnippetItem, content: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed font-sans" 
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button 
                type="button"
                onClick={() => setIsSnippetModalOpen(false)} 
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleSaveSnippetItem} 
                disabled={isSavingSettings}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Save size={13} />
                <span>{isSavingSettings ? 'Menyimpan...' : 'Simpan Paragraf (Auto-Save)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Source Website & Tautan Resmi */}
      {isWebSourceModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg p-6 sm:p-7 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                  <Globe size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                    {editingWebSourceItem.id ? 'Edit Sumber Website' : 'Tambah Sumber Website Baru'}
                  </h3>
                  <p className="text-[11px] text-zinc-400">Kontainer 3: Tautan dan ringkasan website resmi</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsWebSourceModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">URL Website Resmi</label>
                <input 
                  type="text" 
                  placeholder="https://pancaprima.co.id/katalog"
                  value={editingWebSourceItem.url} 
                  onChange={e => setEditingWebSourceItem({ ...editingWebSourceItem, url: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-violet-500" 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Judul Halaman / Portal</label>
                <input 
                  type="text" 
                  placeholder="Contoh: Katalog Digital Resmi & Portofolio Produk"
                  value={editingWebSourceItem.title} 
                  onChange={e => setEditingWebSourceItem({ ...editingWebSourceItem, title: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-violet-500" 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400 ml-1">Ringkasan Materi yang Diserap Bot</label>
                <textarea 
                  rows={4}
                  placeholder="Tuliskan rangkuman poin-poin yang ada di website ini agar bot dapat mereferensikannya secara akurat kepada pelanggan..."
                  value={editingWebSourceItem.summary} 
                  onChange={e => setEditingWebSourceItem({ ...editingWebSourceItem, summary: e.target.value })} 
                  className="w-full px-3.5 py-2.5 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-violet-500 leading-relaxed" 
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <div>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 block text-xs">Status Penyerapan Materi</span>
                  <span className="text-[10px] text-zinc-400">Aktifkan agar bot mempelajari dan merujuk link ini di chat</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={editingWebSourceItem.isActive} 
                    onChange={e => setEditingWebSourceItem({ ...editingWebSourceItem, isActive: e.target.checked })} 
                    className="sr-only peer" 
                  />
                  <div className="w-10 h-5 bg-zinc-300 dark:bg-zinc-700 rounded-full peer peer-checked:bg-violet-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button 
                type="button"
                onClick={() => setIsWebSourceModalOpen(false)} 
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleSaveWebSourceItem} 
                disabled={isSavingSettings}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-600/20 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Save size={13} />
                <span>{isSavingSettings ? 'Menyimpan...' : 'Simpan Sumber Web (Auto-Save)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Script SQL Supabase */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <Database className="text-violet-600" size={18} />
                <h3 className="font-bold text-sm text-zinc-800 dark:text-zinc-100">Script SQL Update Supabase (wa_chats & app_settings)</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsSqlModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
              <p className="text-zinc-600 dark:text-zinc-300">
                Jalankan script SQL ini di <strong>Supabase Dashboard &gt; SQL Editor &gt; New Query &gt; Run</strong> agar database Anda memiliki tabel <code>wa_chats</code> (riwayat per nomor terhubung) dan <code>app_settings</code> (pengaturan & API key lintas perangkat):
              </p>

              <div className="relative">
                <pre className="p-3 bg-zinc-950 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto max-h-72 border border-zinc-800 select-all leading-relaxed">
                  {SUPABASE_MIGRATION_SQL}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_MIGRATION_SQL);
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
                <p className="font-bold">💡 Petunjuk Singkat:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-violet-700 dark:text-violet-300">
                  <li>Buka project Supabase Anda di browser.</li>
                  <li>Buka tab <strong>SQL Editor</strong>.</li>
                  <li>Tempel (Paste) script SQL di atas dan klik <strong>Run</strong>.</li>
                  <li>Tabel <code>wa_chats</code> dan <code>app_settings</code> akan dibuat secara otomatis dengan index dan izin akses yang sesuai.</li>
                </ol>
              </div>
            </div>

            <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2 bg-zinc-50/50 dark:bg-zinc-900/50">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_MIGRATION_SQL);
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
                className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Lightbox Preview Foto */}
      {previewImageModal && (
        <div 
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImageModal(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300">Pratinjau Foto WhatsApp</span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImageModal}
                  download="whatsapp-foto.jpg"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow"
                >
                  <Download size={14} /> Unduh
                </a>
                <button
                  onClick={() => setPreviewImageModal(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="p-2 flex items-center justify-center overflow-auto max-h-[80vh]">
              <img
                src={previewImageModal}
                alt="Pratinjau Besar"
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
