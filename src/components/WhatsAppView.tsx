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
  RotateCcw
} from 'lucide-react';
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
  if (!rawPhoneOrJid) return { phone: name || "Pengguna WA", name: name || "Pengguna WA" };

  let val = rawPhoneOrJid.split("@")[0].split(":")[0];
  const digits = val.replace(/[^0-9]/g, "");

  if (digits && digits.length >= 8 && digits.length <= 15 && !val.includes("lid")) {
    let formatted = digits;
    if (formatted.startsWith("62")) {
      formatted = "0" + formatted.slice(2);
    } else if (!formatted.startsWith("0")) {
      formatted = "0" + formatted;
    }
    const displayName = (name && !name.includes("@lid") && !name.includes("@s.whatsapp.net")) ? name : formatted;
    return { phone: formatted, name: displayName };
  }

  const cleanName = (name && !name.includes("@lid") && !name.includes("@s.whatsapp.net")) ? name : "Pengguna WA";
  return { phone: cleanName, name: cleanName };
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
}

export interface WAISettings {
  autoReplyEnabled: boolean;
  botName: string;
  tone: string;
  greetingMessage: string;
  fallbackMessage: string;
  knowledgeBase: {
    id: string;
    productName: string;
    description: string;
    price: string;
    keywords: string[];
    faq: { q: string; a: string }[];
  }[];
  logs: {
    id: string;
    timestamp: number;
    sender: string;
    incoming: string;
    reply: string;
    modelUsed: string;
  }[];
}

interface WhatsAppViewProps {
  initialSubTab?: 'chat' | 'setting-ai' | 'perangkat';
  currentUser?: {
    id?: string;
    nama?: string;
    username?: string;
    role?: string;
  };
}

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({ initialSubTab = 'chat', currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'setting-ai' | 'perangkat'>(initialSubTab);
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
    tone: 'Sopan & Ramah',
    greetingMessage: 'Halo! Ada yang bisa kami bantu terkait produk dan layanan kami?',
    fallbackMessage: 'Mohon maaf, pesan Anda telah kami catat dan tim CS kami akan segera menghubungi Anda.',
    knowledgeBase: [],
    logs: []
  });
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Modal Knowledge Base Edit
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch WA Connection Status & Known Connected Numbers
  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch(getApiUrl('/api/wa/status'));
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
          setSettings(data.settings);
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

    // Poll status faster (every 2.5s) when on 'perangkat' tab waiting for QR scan, otherwise every 6s
    const pollInterval = activeSubTab === 'perangkat' && connectionStatus.connectionState !== 'connected' ? 2500 : 6000;
    const interval = setInterval(() => {
      fetchStatus();
      if (activeSubTab === 'chat') {
        fetchChats();
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [selectedConnectedPhone, activeSubTab, connectionStatus.connectionState]);

  useEffect(() => {
    if (selectedChatJid) {
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
    setIsLoadingStatus(true);
    try {
      await fetch(getApiUrl('/api/wa/logout'), { method: 'POST' });
      await new Promise(r => setTimeout(r, 800));
      await handleInitConnection(true);
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

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const res = await fetch(getApiUrl('/api/wa/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSaveSuccessMsg('Disimpan!');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveKbItem = () => {
    const keywords = editingKbItem.keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
    const newKb = {
      id: editingKbItem.id || 'kb-' + Date.now(),
      productName: editingKbItem.productName,
      description: editingKbItem.description,
      price: editingKbItem.price,
      keywords,
      faq: editingKbItem.faqList.filter(f => f.q.trim() && f.a.trim())
    };

    let updatedList = [...settings.knowledgeBase];
    const existingIdx = updatedList.findIndex(k => k.id === newKb.id);
    if (existingIdx >= 0) {
      updatedList[existingIdx] = newKb;
    } else {
      updatedList.push(newKb);
    }

    setSettings({ ...settings, knowledgeBase: updatedList });
    setIsKbModalOpen(false);
  };

  const handleDeleteKbItem = (id: string) => {
    if (!confirm('Hapus?')) return;
    setSettings({
      ...settings,
      knowledgeBase: settings.knowledgeBase.filter(k => k.id !== id)
    });
  };

  const selectedChat = chats.find(c => c.jid === selectedChatJid);

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden">
      
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
                            <h3 className="text-sm font-black truncate text-zinc-900 dark:text-zinc-100">
                              {c.name}
                            </h3>
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
                        <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">
                          {selectedChat.name}
                        </h2>
                        <span className="text-[10px] font-mono text-zinc-400 block leading-none">
                          {selectedChat.phone}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteChat(selectedChat)}
                      className="p-2 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-500 rounded-xl transition flex items-center gap-1 text-xs font-bold"
                      title="Hapus Obrolan"
                    >
                      <Trash2 size={16} />
                      <span className="hidden sm:inline">Hapus Obrolan</span>
                    </button>
                  </div>

                  {/* Messages Scroll Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {selectedChat.messages.map((m, idx) => (
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
        {activeSubTab === 'setting-ai' && (
          <div className="h-full overflow-y-auto space-y-4 max-w-4xl mx-auto">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-zinc-100"><Bot size={24} /></div>
                <div><h2 className="text-base font-black">Bot Auto-Reply AI</h2><p className="text-xs text-zinc-500">Otomatis membalas pesan WhatsApp via Gemini AI.</p></div>
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.autoReplyEnabled} onChange={(e) => setSettings({ ...settings, autoReplyEnabled: e.target.checked })} className="sr-only peer" />
                  <div className="w-11 h-6 bg-zinc-200 rounded-full peer dark:bg-zinc-800 peer-checked:bg-zinc-900 dark:peer-checked:bg-zinc-100 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
                <button onClick={handleSaveSettings} disabled={isSavingSettings} className="px-6 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-bold shadow-xs">Simpan</button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Profil Bot</h3>
                  <div className="space-y-3">
                    <div><label className="text-[10px] font-bold uppercase mb-1 block">Nama Bot</label><input type="text" value={settings.botName} onChange={e => setSettings({...settings, botName: e.target.value})} className="w-full px-3 py-2 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800" /></div>
                    <div><label className="text-[10px] font-bold uppercase mb-1 block">Tone</label><select value={settings.tone} onChange={e => setSettings({...settings, tone: e.target.value})} className="w-full px-3 py-2 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800"><option>Ramah & Sopan</option><option>Formal</option></select></div>
                  </div>
               </div>
               <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Pesan Otomatis</h3>
                  <div className="space-y-3">
                    <div><label className="text-[10px] font-bold uppercase mb-1 block">Salam</label><input type="text" value={settings.greetingMessage} onChange={e => setSettings({...settings, greetingMessage: e.target.value})} className="w-full px-3 py-2 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800" /></div>
                    <div><label className="text-[10px] font-bold uppercase mb-1 block">Fallback</label><input type="text" value={settings.fallbackMessage} onChange={e => setSettings({...settings, fallbackMessage: e.target.value})} className="w-full px-3 py-2 border rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800" /></div>
                  </div>
               </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
               <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Knowledge Base</h3>
                 <button onClick={() => { setEditingKbItem({ id: '', productName: '', description: '', price: '', keywordsStr: '', faqList: [{ q: '', a: '' }] }); setIsKbModalOpen(true); }} className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-[10px] font-black tracking-wider">+ TAMBAH PRODUK</button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {settings.knowledgeBase.map(kb => (
                   <div key={kb.id} className="p-4 border border-zinc-100 dark:border-zinc-800 rounded-xl flex justify-between items-start group">
                      <div><h4 className="text-sm font-black">{kb.productName}</h4><p className="text-[10px] text-zinc-400 mt-1">{kb.price}</p></div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingKbItem({ id: kb.id, productName: kb.productName, description: kb.description, price: kb.price, keywordsStr: kb.keywords.join(', '), faqList: kb.faq }); setIsKbModalOpen(true); }} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><Sliders size={14}/></button>
                        <button onClick={() => handleDeleteKbItem(kb.id)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 rounded-md transition-colors"><Trash2 size={14}/></button>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
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
      </div>

      {/* Modal Knowledge Base */}
      {isKbModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] w-full max-w-md p-8 space-y-6 shadow-2xl">
            <h3 className="text-lg font-black">{editingKbItem.id ? 'Edit Produk' : 'Tambah Produk'}</h3>
            <div className="space-y-4">
               <div className="space-y-1"><label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Nama</label><input type="text" value={editingKbItem.productName} onChange={e => setEditingKbItem({...editingKbItem, productName: e.target.value})} className="w-full px-4 py-3 border rounded-xl text-sm bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800" /></div>
               <div className="space-y-1"><label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Deskripsi</label><textarea value={editingKbItem.description} onChange={e => setEditingKbItem({...editingKbItem, description: e.target.value})} className="w-full px-4 py-3 border rounded-xl text-sm bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800" rows={3} /></div>
               <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Harga</label><input type="text" value={editingKbItem.price} onChange={e => setEditingKbItem({...editingKbItem, price: e.target.value})} className="w-full px-4 py-3 border rounded-xl text-sm bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Keywords</label><input type="text" value={editingKbItem.keywordsStr} onChange={e => setEditingKbItem({...editingKbItem, keywordsStr: e.target.value})} className="w-full px-4 py-3 border rounded-xl text-sm bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800" /></div>
               </div>
            </div>
            <div className="flex gap-3 pt-2">
               <button onClick={() => setIsKbModalOpen(false)} className="flex-1 py-3 text-xs font-black text-zinc-400">BATAL</button>
               <button onClick={handleSaveKbItem} className="flex-[2] py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-black shadow-lg shadow-zinc-900/20">SIMPAN PERUBAHAN</button>
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
