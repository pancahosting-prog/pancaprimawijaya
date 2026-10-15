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
  Copy
} from 'lucide-react';
import { 
  loadWAChatsFromSupabase, 
  saveWAChatToSupabase, 
  loadKnownConnectedNumbersFromSupabase,
  checkSupabaseTableStatus 
} from '../lib/supabaseSync';
import { SUPABASE_MIGRATION_SQL } from '../lib/supabaseMigrationSql';

export interface WAChatMessage {
  id: string;
  fromMe: boolean;
  sender: string;
  senderName?: string;
  text: string;
  timestamp: number;
  status?: string;
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
}

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({ initialSubTab = 'chat' }) => {
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'setting-ai' | 'perangkat'>(initialSubTab);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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

  // Connected Phone Partitioning & Multi-SIM History
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
      const res = await fetch('/api/wa/status');
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

  // Fetch Chats filtered by Connected Phone Number
  const fetchChats = async (targetPhone?: string) => {
    try {
      const activeFilter = targetPhone || selectedConnectedPhone;
      let url = '/api/wa/chats';
      if (activeFilter && activeFilter !== 'all' && activeFilter !== 'active') {
        url += `?connectedPhone=${encodeURIComponent(activeFilter)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.chats) {
          setChats(data.chats);
          
          // Only auto-select on desktop if no chat is already selected
          const isActuallyMobile = window.innerWidth < 768;
          if (!isActuallyMobile && !selectedChatJid && data.chats.length > 0) {
            setSelectedChatJid(data.chats[0].jid);
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
          setChats(srvData.chats);
        }
      }

      // 2. Direct client fallback from Supabase
      const cloudChats = await loadWAChatsFromSupabase(target);
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
      const res = await fetch('/api/wa/settings');
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
  }, [selectedConnectedPhone]);

  useEffect(() => {
    if (selectedChatJid) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chats, selectedChatJid]);

  const handleInitConnection = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/wa/connect', { method: 'POST' });
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
    if (!confirm('Logout WA?')) return;
    try {
      await fetch('/api/wa/logout', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error('Error logging out WA:', err);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedChatJid || !replyText.trim() || isSending) return;

    setIsSending(true);
    const textToSend = replyText.trim();
    setReplyText('');

    try {
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: selectedChatJid, text: textToSend })
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
      const res = await fetch('/api/wa/settings', {
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
                        {knownNumbers.map(n => (
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
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
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

                  {/* Chat Input Bar */}
                  <form onSubmit={handleSendMessage} className="p-3 md:p-4 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      placeholder="Ketik pesan..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="flex-1 px-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:border-zinc-900 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={!replyText.trim() || isSending}
                      className="p-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-all active:scale-95 shadow-sm shrink-0"
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
          <div className="h-full flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full text-center space-y-6">
              <div>
                <h2 className="text-2xl font-black tracking-tight">WhatsApp QR</h2>
                <p className="text-xs text-zinc-500 mt-1">Sambungkan perangkat WhatsApp Anda ke sistem.</p>
              </div>

              <div className="p-6 bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                {connectionStatus.connectionState === 'connected' ? (
                  <div className="space-y-5">
                    <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                      <CheckCircle2 size={36}/>
                    </div>
                    <div>
                      <h3 className="font-black text-emerald-600 text-sm">PERANGKAT TERHUBUNG</h3>
                      <p className="text-xl font-mono font-bold mt-1 text-zinc-900 dark:text-zinc-100">+{connectionStatus.userPhone}</p>
                    </div>
                    <button 
                      onClick={handleLogoutWA} 
                      className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-rose-600/20 transition cursor-pointer"
                    >
                      LOGOUT PERANGKAT
                    </button>
                  </div>
                ) : connectionStatus.qrCodeBase64 ? (
                  <div className="space-y-5">
                    <div className="p-4 bg-white rounded-2xl shadow-xl inline-block border border-zinc-100 dark:border-zinc-800">
                      <img src={connectionStatus.qrCodeBase64} alt="QR" className="w-56 h-56" />
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
    </div>
  );
};
