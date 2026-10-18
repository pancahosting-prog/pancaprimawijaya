import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Users,
  UserCheck,
  Lock,
  ShieldAlert,
  Eye,
  User
} from 'lucide-react';
import { 
  loadWAChatsFromSupabase, 
  saveWAChatToSupabase, 
  loadKnownConnectedNumbersFromSupabase,
  checkSupabaseTableStatus 
} from '../lib/supabaseSync';
import { SUPABASE_MIGRATION_SQL } from '../lib/supabaseMigrationSql';
import { getApiUrl } from '../lib/apiUtils';

export interface UserAccount {
  id: string;
  nama: string;
  username: string;
  password?: string;
  whatsapp: string;
  role: 'superadmin' | 'admin' | 'sales' | 'purchasing' | 'stocklist' | 'finance' | 'pajak' | string;
  companyId?: string;
}

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
  ownerUser?: string;
  profilePicUrl?: string;
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
  currentUser?: UserAccount | null;
  appUsers?: UserAccount[];
}

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({ 
  initialSubTab = 'chat',
  currentUser,
  appUsers = []
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'setting-ai' | 'perangkat'>(initialSubTab);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const isSuperAdmin = currentUser?.role === 'superadmin';
  const activeUsername = currentUser?.username || 'user';

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
    userPhone: string | null;
    userName: string | null;
  }>({
    connectionState: 'disconnected',
    qrCodeBase64: null,
    userPhone: null,
    userName: null,
  });

  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);

  // Connected Phone Partitioning & Multi-Device Selector
  const [selectedConnectedPhone, setSelectedConnectedPhone] = useState<string>('active');
  const [knownNumbers, setKnownNumbers] = useState<{ phone: string; active: boolean; chatCount: number }[]>([]);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Chats & Active Chat
  const [chats, setChats] = useState<WAChat[]>([]);
  const [selectedChatJid, setSelectedChatJid] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

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

  // Helper to resolve actual clean phone number from active selection or session
  const getActualConnectedPhone = (phoneFilter?: string): string => {
    if (phoneFilter && phoneFilter !== 'active' && phoneFilter !== 'all') {
      const clean = phoneFilter.replace(/[^a-zA-Z0-9]/g, '');
      if (clean) return clean;
    }
    if (connectionStatus.userPhone) {
      const clean = connectionStatus.userPhone.replace(/[^a-zA-Z0-9]/g, '');
      if (clean) return clean;
    }
    if (currentUser?.whatsapp) {
      const clean = currentUser.whatsapp.replace(/[^a-zA-Z0-9]/g, '');
      if (clean) return clean;
    }
    return 'default';
  };

  // Filter list of ALL CONNECTED user devices (from active session + Supabase wa_chats)
  const connectedDevicesList = useMemo(() => {
    const list: { key: string; label: string; phone: string; username: string; nama: string }[] = [];
    const phoneSet = new Set<string>();

    const activePhoneClean = connectionStatus.userPhone ? connectionStatus.userPhone.replace(/[^a-zA-Z0-9]/g, '') : '';
    if (activePhoneClean && connectionStatus.connectionState === 'connected') {
      phoneSet.add(activePhoneClean);
    }

    knownNumbers.forEach(kn => {
      const clean = kn.phone ? kn.phone.replace(/[^a-zA-Z0-9]/g, '') : '';
      if (clean && clean !== 'default') {
        phoneSet.add(clean);
      }
    });

    phoneSet.forEach(phoneClean => {
      const matchedUser = appUsers.find(u => {
        const uPhone = (u.whatsapp || '').replace(/[^a-zA-Z0-9]/g, '');
        return uPhone && (uPhone === phoneClean || uPhone.endsWith(phoneClean) || phoneClean.endsWith(uPhone));
      });

      const username = matchedUser ? matchedUser.username : (currentUser?.username || 'user');
      const nama = matchedUser ? matchedUser.nama : (currentUser?.nama || 'Pengguna');

      if (!isSuperAdmin && username !== activeUsername && activeUsername !== 'superadmin' && phoneClean !== activePhoneClean) {
        return;
      }

      list.push({
        key: phoneClean,
        phone: phoneClean,
        username: username,
        nama: nama,
        label: `${username}: (+${phoneClean} - ${nama})`
      });
    });

    return list;
  }, [connectionStatus.connectionState, connectionStatus.userPhone, knownNumbers, appUsers, currentUser, isSuperAdmin, activeUsername]);

  // Fetch WA Connection Status & Known Connected Numbers
  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch(getApiUrl('/api/wa/status'));
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus({
          connectionState: data.connectionState,
          qrCodeBase64: data.qrCodeBase64,
          userPhone: data.userPhone,
          userName: data.userName,
        });
        if (Array.isArray(data.knownNumbers)) {
          const numbers = [...data.knownNumbers];
          try {
            const cloudPhones = await loadKnownConnectedNumbersFromSupabase();
            cloudPhones.forEach(cp => {
              if (cp && !numbers.some(n => n.phone === cp)) {
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

  // Fetch Chats filtered by Connected Device Phone Number
  const fetchChats = async (targetPhone?: string) => {
    try {
      const activePhoneFilter = targetPhone || selectedConnectedPhone;
      const realPhone = getActualConnectedPhone(activePhoneFilter);

      let url = `/api/wa/chats?username=${encodeURIComponent(activeUsername)}&role=${encodeURIComponent(currentUser?.role || '')}`;
      if (realPhone && realPhone !== 'all' && realPhone !== 'default') {
        url += `&connectedPhone=${encodeURIComponent(realPhone)}`;
      }

      const res = await fetch(getApiUrl(url));
      let fetchedChats: WAChat[] = [];

      if (res.ok) {
        const data = await res.json();
        if (data.chats) {
          fetchedChats = data.chats;
        }
      }

      // Direct client fallback from Supabase with access control
      const cloudChats = await loadWAChatsFromSupabase(
        realPhone !== 'default' ? realPhone : undefined,
        activeUsername,
        isSuperAdmin
      );

      if (cloudChats && cloudChats.length > 0) {
        const chatMap = new Map<string, WAChat>();
        fetchedChats.forEach(c => chatMap.set(c.jid, c));
        cloudChats.forEach(c => {
          const existing = chatMap.get(c.jid);
          if (!existing || (c.messages && existing.messages && c.messages.length >= existing.messages.length)) {
            chatMap.set(c.jid, c);
          }
        });
        fetchedChats = Array.from(chatMap.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
      }

      setChats(fetchedChats);
      
      // Auto select first chat if desktop
      const isActuallyMobile = window.innerWidth < 768;
      if (!isActuallyMobile && !selectedChatJid && fetchedChats.length > 0) {
        setSelectedChatJid(fetchedChats[0].jid);
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    }
  };

  // Manual Supabase Chat Sync
  const handleSyncWithSupabase = async () => {
    setIsSyncingSupabase(true);
    try {
      const targetPhone = selectedConnectedPhone !== 'all' && selectedConnectedPhone !== 'active' 
        ? selectedConnectedPhone 
        : (connectionStatus.userPhone || undefined);

      // 1. Tell backend to sync from Supabase
      const srvRes = await fetch('/api/wa/sync-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          connectedPhone: targetPhone,
          username: activeUsername,
          role: currentUser?.role 
        })
      });

      if (srvRes.ok) {
        const srvData = await srvRes.json();
        if (srvData.chats) {
          setChats(srvData.chats);
        }
      }

      // 2. Direct client fallback from Supabase
      const cloudChats = await loadWAChatsFromSupabase(targetPhone, activeUsername, isSuperAdmin);
      if (cloudChats && cloudChats.length > 0) {
        setChats(cloudChats);
      }

      setSyncToast('Riwayat chat berhasil disinkronkan dari Supabase!');
      setTimeout(() => setSyncToast(null), 3000);
    } catch (err: any) {
      console.error('Error syncing WA with Supabase:', err);
    } finally {
      setIsSyncingSupabase(false);
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

  useEffect(() => {
    fetchStatus();
    fetchChats();
    fetchSettings();

    const interval = setInterval(() => {
      fetchStatus();
      fetchChats();
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedConnectedPhone, currentUser]);

  useEffect(() => {
    if (selectedChatJid) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chats, selectedChatJid]);

  const handleInitConnection = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch(getApiUrl('/api/wa/connect'), { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(prev => ({
          ...prev,
          connectionState: data.connectionState,
          qrCodeBase64: data.qrCodeBase64
        }));
      }
    } catch (err) {
      console.error('Error connecting WA:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleLogoutWA = async () => {
    if (!confirm('Putuskan koneksi WhatsApp? (Riwayat chat akan tetap tersimpan aman di database)')) return;
    try {
      await fetch(getApiUrl('/api/wa/logout'), { method: 'POST' });
      setConnectionStatus({
        connectionState: 'disconnected',
        qrCodeBase64: null,
        userPhone: null,
        userName: null,
      });
      setSelectedConnectedPhone('active');
      setSyncToast('Sesi WhatsApp berhasil diputuskan.');
      setTimeout(() => setSyncToast(null), 3000);
      fetchStatus();
      fetchChats();
    } catch (err) {
      console.error('Error logging out WA:', err);
    }
  };

  const handleDisconnectDevice = async (phone: string, nama: string) => {
    if (!confirm(`Putuskan koneksi perangkat WhatsApp milik ${nama} (+${phone})? (Riwayat chat tetap tersimpan di database)`)) return;
    try {
      const res = await fetch(getApiUrl('/api/wa/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      if (res.ok) {
        setConnectionStatus({
          connectionState: 'disconnected',
          qrCodeBase64: null,
          userPhone: null,
          userName: null,
        });
        setSelectedConnectedPhone('active');
        setSyncToast(`Koneksi perangkat +${phone} berhasil diputuskan.`);
        setTimeout(() => setSyncToast(null), 3500);
        fetchStatus();
        fetchChats();
      }
    } catch (err) {
      console.error('Error disconnecting device:', err);
    }
  };

  const handleDisconnectAllDevices = async () => {
    if (!confirm('Apakah Anda yakin ingin MEMUTUSKAN SELURUH KONEKSI perangkat WhatsApp terhubung di sistem? (Riwayat chat di database tetap aman)')) return;
    try {
      const res = await fetch(getApiUrl('/api/wa/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true })
      });
      if (res.ok) {
        setConnectionStatus({
          connectionState: 'disconnected',
          qrCodeBase64: null,
          userPhone: null,
          userName: null,
        });
        setSelectedConnectedPhone('active');
        setSyncToast('Seluruh sesi perangkat WhatsApp berhasil diputuskan.');
        setTimeout(() => setSyncToast(null), 3500);
        fetchStatus();
        fetchChats();
      }
    } catch (err) {
      console.error('Error disconnecting all devices:', err);
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

    const realConnectedPhone = getActualConnectedPhone(selectedConnectedPhone);

    setChats(prevChats => {
      return prevChats.map(c => {
        if (c.jid === selectedChatJid) {
          const updatedMessages = [...c.messages, tempMsg];
          const updatedChat = {
            ...c,
            connectedPhone: realConnectedPhone,
            lastMessage: textToSend || (mediaToSend?.type === 'image' ? '📷 [Foto]' : `📄 [${mediaToSend?.fileName || 'Dokumen'}]`),
            lastMessageTime: Date.now(),
            messages: updatedMessages,
            ownerUser: currentUser?.username || c.ownerUser || 'user'
          };
          // Sync to Supabase in background
          saveWAChatToSupabase(
            updatedChat, 
            realConnectedPhone,
            currentUser?.username || 'user'
          ).catch(console.warn);
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
          media: mediaToSend || undefined,
          username: currentUser?.username
        })
      });

      if (res.ok) {
        await fetchChats(realConnectedPhone);
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
              
              {/* List Header & User Access Controls */}
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
                  </div>
                </div>

                {/* Container Nomor Terhubung (Dengan Dropdown Superadmin Khusus Perangkat Terhubung) */}
                <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 flex flex-col gap-1.5 text-xs shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                      <Smartphone size={12} className="text-emerald-500" />
                      Nomor Terhubung:
                    </span>
                    {!isSuperAdmin && (
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                        {connectionStatus.userPhone ? `+${connectionStatus.userPhone}` : 'Belum Tersambung'}
                      </span>
                    )}
                  </div>

                  {/* Superadmin Dropdown for ONLY ACTUALLY CONNECTED Devices / Users */}
                  {isSuperAdmin && (
                    <div className="flex items-center gap-1.5">
                      {connectedDevicesList.length > 0 ? (
                        <select
                          value={selectedConnectedPhone}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedConnectedPhone(val);
                            fetchChats(val);
                          }}
                          className="w-full bg-zinc-50 dark:bg-zinc-900 border border-emerald-300 dark:border-emerald-700/80 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none cursor-pointer focus:ring-1 focus:ring-emerald-500"
                        >
                          {connectedDevicesList.map(dev => (
                            <option key={dev.key} value={dev.key}>
                              {dev.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-zinc-400 italic">Belum Ada Perangkat Terhubung</span>
                      )}
                    </div>
                  )}
                </div>

                {syncToast && (
                  <div className="p-1.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-[10px] font-semibold text-center animate-in fade-in">
                    {syncToast}
                  </div>
                )}
              </div>

              {/* Chat Item List with Contact Profile Pictures */}
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {chats.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400 text-xs italic space-y-2">
                    <p>Belum ada percakapan untuk perangkat terhubung ini.</p>
                    <p className="text-[10px] text-zinc-400">Pesan WhatsApp terhubung akan tersimpan secara otomatis.</p>
                  </div>
                ) : (
                  chats.map((c) => {
                    const isSelected = selectedChatJid === c.jid;
                    return (
                      <div
                        key={c.jid}
                        onClick={() => setSelectedChatJid(c.jid)}
                        className={`p-4 cursor-pointer transition-all flex items-start gap-3 select-none ${
                          isSelected && !isMobile
                            ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40 active:bg-zinc-100 dark:active:bg-zinc-800'
                        }`}
                      >
                        {c.profilePicUrl ? (
                          <img 
                            src={c.profilePicUrl} 
                            alt={c.name} 
                            className="w-12 h-12 rounded-full object-cover shadow-sm border border-zinc-200 dark:border-zinc-800 shrink-0" 
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-black text-sm shrink-0 shadow-sm border border-zinc-200 dark:border-zinc-800">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 py-0.5">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <h3 className="text-sm font-black truncate text-zinc-900 dark:text-zinc-100">
                              {c.name}
                            </h3>
                            <span className="text-[10px] text-zinc-400 font-bold shrink-0">
                              {new Date(c.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate pr-2">
                            {c.lastMessage}
                          </p>
                          {isSuperAdmin && (
                            <span className="inline-block mt-1 px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-[9px] font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                              Akun: @{c.ownerUser || 'default'}
                            </span>
                          )}
                        </div>
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
                  {/* Chat Header with Profile Picture */}
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
                      {selectedChat.profilePicUrl ? (
                        <img 
                          src={selectedChat.profilePicUrl} 
                          alt={selectedChat.name} 
                          className="w-10 h-10 rounded-full object-cover shadow-sm border border-zinc-200 dark:border-zinc-800 shrink-0" 
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-black text-xs shadow-sm shrink-0">
                          {selectedChat.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">
                          {selectedChat.name}
                        </h2>
                        <span className="text-[10px] font-mono text-zinc-400 block leading-none">
                          {selectedChat.phone} {selectedChat.ownerUser ? `• User: @${selectedChat.ownerUser}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Messages Scroll Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {selectedChat.messages.map((m) => (
                      <div
                        key={m.id}
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
                                  title="Download File"
                                >
                                  <Download size={14} />
                                </a>
                              )}
                            </div>
                          )}

                          {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}

                          <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-zinc-400 font-mono">
                            <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {m.fromMe && <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓✓</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Attachment Preview Banner */}
                  {attachedMedia && (
                    <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {attachedMedia.type === 'image' ? (
                          <img src={attachedMedia.data} alt="Preview" className="w-12 h-12 object-cover rounded-xl border border-zinc-300 dark:border-zinc-700 shadow-sm" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                            <FileText size={20} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate text-zinc-900 dark:text-zinc-100">{attachedMedia.fileName || 'Lampiran'}</p>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">{formatFileSize(attachedMedia.fileSize)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setAttachedMedia(null)}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition cursor-pointer"
                        title="Batal Lampiran"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  )}

                  {/* Hidden File Inputs */}
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
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, 'document')}
                  />

                  {/* Input Form */}
                  <form onSubmit={handleSendMessage} className="p-3 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="p-2.5 text-zinc-500 hover:text-emerald-600 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
                      title="Kirim Foto"
                    >
                      <ImageIcon size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 text-zinc-500 hover:text-emerald-600 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
                      title="Kirim Dokumen / File"
                    >
                      <Paperclip size={20} />
                    </button>
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Ketik pesan..."
                      className="flex-1 px-4 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={(!replyText.trim() && !attachedMedia) || isSending}
                      className="p-2.5 md:p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl disabled:opacity-40 transition-all active:scale-95 shadow-sm shrink-0 cursor-pointer"
                      title="Kirim"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400 bg-white dark:bg-zinc-900 space-y-3">
                   <MessageSquare size={64} className="opacity-10" />
                   <p className="text-sm font-black text-zinc-500">Pilih obrolan untuk mulai membaca riwayat pesan.</p>
                   <p className="text-xs text-zinc-400 max-w-sm">
                     {isSuperAdmin 
                       ? 'Superadmin dapat memilih perangkat terhubung di dropdown atas untuk melihat percakapan.'
                       : 'Sesi percakapan WhatsApp Anda terisolasi secara aman dan tersimpan di database.'
                     }
                   </p>
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
                <button onClick={handleSaveSettings} disabled={isSavingSettings} className="px-6 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-bold shadow-xs cursor-pointer">Simpan</button>
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
                 <button onClick={() => { setEditingKbItem({ id: '', productName: '', description: '', price: '', keywordsStr: '', faqList: [{ q: '', a: '' }] }); setIsKbModalOpen(true); }} className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-[10px] font-black tracking-wider cursor-pointer">+ TAMBAH PRODUK</button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {settings.knowledgeBase.map(kb => (
                   <div key={kb.id} className="p-4 border border-zinc-100 dark:border-zinc-800 rounded-xl flex justify-between items-start group">
                      <div><h4 className="text-sm font-black">{kb.productName}</h4><p className="text-[10px] text-zinc-400 mt-1">{kb.price}</p></div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingKbItem({ id: kb.id, productName: kb.productName, description: kb.description, price: kb.price, keywordsStr: kb.keywords.join(', '), faqList: kb.faq }); setIsKbModalOpen(true); }} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"><Sliders size={14}/></button>
                        <button onClick={() => handleDeleteKbItem(kb.id)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 rounded-md transition-colors cursor-pointer"><Trash2 size={14}/></button>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 3: PERANGKAT & MANAJEMEN MULTI-USER */}
        {activeSubTab === 'perangkat' && (
          <div className="h-full overflow-y-auto p-4 space-y-6 max-w-5xl mx-auto">
            
            {/* User Session Info Header */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-xl shadow-md">
                  {currentUser?.nama?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black">{currentUser?.nama || 'Pengguna'}</h2>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] uppercase border border-emerald-300 dark:border-emerald-800">
                      {currentUser?.role || 'User'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">
                    Username: @{currentUser?.username || 'user'} • WA Kontak: +{currentUser?.whatsapp || '-'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-xs max-w-md">
                <p className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 mb-1">
                  <Lock size={13} className="text-emerald-600" /> Keamanan Sesi Terisolasi
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Sesi login Anda terhubung dengan akun <strong>{currentUser?.username}</strong>. Sesuai hak akses, riwayat pesan dan koneksi perangkat disimpan di database khusus untuk akun Anda dan Superadmin.
                </p>
              </div>
            </div>

            {/* QR Connection Card for Active User */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="bg-white dark:bg-zinc-900 p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl text-center space-y-6">
                <div>
                  <h3 className="text-xl font-black tracking-tight">Koneksi Perangkat @{currentUser?.username}</h3>
                  <p className="text-xs text-zinc-500 mt-1">Sambungkan WhatsApp HP Anda khusus untuk akun {currentUser?.nama}.</p>
                </div>

                <div className="p-6 bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                  {connectionStatus.connectionState === 'connected' ? (
                    <div className="space-y-5">
                      <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                        <CheckCircle2 size={36}/>
                      </div>
                      <div>
                        <h4 className="font-black text-emerald-600 text-sm">PERANGKAT ANDA TERHUBUNG</h4>
                        <p className="text-xl font-mono font-bold mt-1 text-zinc-900 dark:text-zinc-100">+{connectionStatus.userPhone}</p>
                      </div>
                      <button 
                        onClick={handleLogoutWA} 
                        className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-rose-600/20 transition cursor-pointer"
                      >
                        PUTUSKAN PERANGKAT
                      </button>
                    </div>
                  ) : connectionStatus.qrCodeBase64 ? (
                    <div className="space-y-5">
                      <div className="p-4 bg-white rounded-2xl shadow-xl inline-block border border-zinc-100 dark:border-zinc-800">
                        <img src={connectionStatus.qrCodeBase64} alt="QR Code Login" className="w-56 h-56" />
                      </div>
                      <p className="text-[10px] font-black text-zinc-400 animate-pulse tracking-widest uppercase">
                        Scan via Perangkat Tertaut di WhatsApp HP
                      </p>
                    </div>
                  ) : (
                    <button 
                      onClick={handleInitConnection} 
                      disabled={isLoadingStatus} 
                      className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-xl transition cursor-pointer"
                    >
                      <RefreshCw size={16} className={isLoadingStatus ? 'animate-spin' : ''}/>
                      BUAT BARCODE LOGIN WA
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-User Connected Devices Dashboard (Superadmin or User Summary) */}
              <div className="bg-white dark:bg-zinc-900 p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                    <h3 className="text-lg font-black flex items-center gap-2">
                      <Users size={18} className="text-emerald-600" />
                      Status Perangkat Terhubung
                    </h3>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-2">
                        {connectedDevicesList.length > 0 && (
                          <button
                            type="button"
                            onClick={handleDisconnectAllDevices}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                            title="Putuskan seluruh koneksi perangkat WhatsApp"
                          >
                            <Trash2 size={13} />
                            <span>Putuskan Semua Perangkat</span>
                          </button>
                        )}
                        <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold text-[10px] rounded-full border border-amber-300 dark:border-amber-800">
                          Akses Superadmin
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {isSuperAdmin 
                      ? 'Daftar perangkat terhubung dari user yang sedang aktif online.' 
                      : 'Hanya akun Superadmin yang dapat memantau dan mengelola sesi perangkat user lain.'
                    }
                  </p>
                </div>

                {isSuperAdmin ? (
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[380px] pr-1">
                    {connectedDevicesList.length === 0 ? (
                      <div className="p-8 text-center text-zinc-400 text-xs italic space-y-1">
                        <p>Belum ada perangkat yang terhubung (Online).</p>
                        <p className="text-[10px] text-zinc-500">Perangkat yang sudah terputus tidak ditampilkan di sini.</p>
                      </div>
                    ) : (
                      connectedDevicesList.map(dev => {
                        return (
                          <div 
                            key={dev.key}
                            className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between gap-3 hover:border-emerald-400/50 transition"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
                                {dev.nama.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-black text-zinc-900 dark:text-zinc-100 truncate">{dev.nama}</p>
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold uppercase border border-emerald-300 dark:border-emerald-800">
                                    Online / Terhubung
                                  </span>
                                </div>
                                <p className="text-[10px] text-zinc-500 font-mono truncate">
                                  @{dev.username} • +{dev.phone}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedConnectedPhone(dev.key);
                                  setActiveSubTab('chat');
                                  fetchChats(dev.key);
                                }}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer"
                                title={`Lihat Chat Perangkat +${dev.phone}`}
                              >
                                <Eye size={12} /> Chat
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDisconnectDevice(dev.phone, dev.nama)}
                                className="px-2.5 py-1.5 bg-rose-100 dark:bg-rose-950/80 hover:bg-rose-200 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 rounded-xl text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                                title={`Putuskan koneksi perangkat +${dev.phone}`}
                              >
                                <X size={12} /> Putuskan Sesi
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="p-6 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center space-y-3">
                    <Lock size={32} className="mx-auto text-zinc-400" />
                    <div>
                      <h4 className="text-sm font-black text-zinc-800 dark:text-zinc-200">Hak Akses Terbatas</h4>
                      <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto leading-relaxed">
                        Anda saat ini login sebagai <strong>{currentUser?.nama} ({currentUser?.role})</strong>. Menu pemantauan perangkat user lain hanya terbuka untuk role <strong>Superadmin</strong>.
                      </p>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl text-[11px] text-emerald-800 dark:text-emerald-300">
                  <p className="font-bold flex items-center gap-1">
                    <CheckCircle2 size={13} /> Sesi WhatsApp Siap Digunakan
                  </p>
                </div>
              </div>

            </div>
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
               <button onClick={() => setIsKbModalOpen(false)} className="flex-1 py-3 text-xs font-black text-zinc-400 cursor-pointer">BATAL</button>
               <button onClick={handleSaveKbItem} className="flex-[2] py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-black shadow-lg shadow-zinc-900/20 cursor-pointer">SIMPAN PERUBAHAN</button>
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
                Jalankan script SQL ini di <strong>Supabase Dashboard &gt; SQL Editor &gt; New Query &gt; Run</strong> agar database Anda memiliki tabel <code>wa_chats</code> (dengan dukungan multi-user <code>owner_user</code> & <code>profile_pic_url</code>) dan <code>app_settings</code>:
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
                  <li>Tabel <code>wa_chats</code> dan <code>app_settings</code> akan diperbarui secara otomatis.</li>
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
              <span className="text-xs font-bold text-zinc-200">Pratinjau Foto WhatsApp</span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImageModal}
                  download="whatsapp-foto.jpg"
                  className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition"
                  title="Unduh Gambar"
                >
                  <Download size={14} /> Unduh
                </a>
                <button
                  onClick={() => setPreviewImageModal(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="p-2 flex-1 flex items-center justify-center overflow-auto bg-black">
              <img src={previewImageModal} alt="Preview Enlarge" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
