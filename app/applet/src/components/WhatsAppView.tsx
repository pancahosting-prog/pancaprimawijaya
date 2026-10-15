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
  MessageCircle
} from 'lucide-react';

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

  // Fetch WA Connection Status
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
      }
    } catch (err) {
      console.error('Error fetching WA status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Fetch Chats
  const fetchChats = async () => {
    try {
      const res = await fetch('/api/wa/chats');
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
  }, []);

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
      
      {/* Sub-Tabs Navigation for WhatsApp */}
      <div className="flex items-center gap-2 p-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <button 
          onClick={() => setActiveSubTab('chat')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${activeSubTab === 'chat' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
        >
          CHAT
        </button>
        <button 
          onClick={() => setActiveSubTab('setting-ai')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${activeSubTab === 'setting-ai' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
        >
          SETTING AI
        </button>
        <button 
          onClick={() => setActiveSubTab('perangkat')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${activeSubTab === 'perangkat' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
        >
          PERANGKAT
        </button>
      </div>

      <div className={`flex-1 overflow-hidden ${isMobile && activeSubTab === 'chat' ? 'p-0' : 'p-3 lg:p-4'}`}>
        
        {activeSubTab === 'chat' && (
          <div className={`h-full bg-white dark:bg-zinc-900 shadow-sm flex overflow-hidden ${isMobile ? 'border-0' : 'border border-zinc-200 dark:border-zinc-800 rounded-2xl'}`}>
            <div className={`w-full md:w-80 lg:w-96 border-r border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0 bg-white dark:bg-zinc-900 ${isMobile && selectedChatJid ? 'hidden' : 'flex'}`}>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="text-xl font-black tracking-tight">WhatsApp</h2>
                <div className={`w-2.5 h-2.5 rounded-full ${connectionStatus.connectionState === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'} shadow-sm`} />
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {chats.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400 text-xs italic">Belum ada percakapan.</div>
                ) : (
                  chats.map((c) => (
                    <div
                      key={c.jid}
                      onClick={() => setSelectedChatJid(c.jid)}
                      className={`p-4 cursor-pointer transition-all flex items-start gap-3 select-none ${selectedChatJid === c.jid && !isMobile ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40 active:bg-zinc-100 dark:active:bg-zinc-800'}`}
                    >
                      <div className="w-12 h-12 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-black text-sm shrink-0 shadow-sm border border-zinc-200 dark:border-zinc-800">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <h3 className="text-sm font-black truncate text-zinc-900 dark:text-zinc-100">{c.name}</h3>
                          <span className="text-[10px] text-zinc-400 font-bold shrink-0">{new Date(c.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate pr-6">{c.lastMessage}</p>
                      </div>
                      {c.unreadCount > 0 && <span className="mt-1 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">{c.unreadCount}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className={`flex-1 flex flex-col bg-[#efeae2] dark:bg-zinc-950 ${isMobile && !selectedChatJid ? 'hidden' : 'flex'}`}>
              {selectedChat ? (
                <>
                  <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 sticky top-0 z-50">
                    <div className="flex items-center gap-3">
                      {isMobile && (
                        <button onClick={() => setSelectedChatJid(null)} className="p-2 -ml-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors">
                          <ChevronLeft size={24} />
                        </button>
                      )}
                      <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-black text-xs shadow-sm">{selectedChat.name.charAt(0).toUpperCase()}</div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">{selectedChat.name}</h2>
                        <span className="text-[10px] font-mono text-zinc-400 block leading-none">{selectedChat.phone}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {selectedChat.messages.map((m) => (
                      <div key={m.id} className={`flex flex-col ${m.fromMe ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] md:max-w-[70%] p-3 px-4 rounded-2xl text-sm leading-relaxed shadow-sm ${m.fromMe ? 'bg-emerald-100 dark:bg-emerald-900 text-zinc-800 dark:text-emerald-50 rounded-tr-none' : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-tl-none'}`}>
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className={`text-[9px] font-bold ${m.fromMe ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {m.fromMe && <Check size={10} className="text-emerald-600 dark:text-emerald-400" />}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <form onSubmit={handleSendMessage} className="p-3 md:p-4 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 shrink-0">
                    <input type="text" placeholder="Ketik pesan..." value={replyText} onChange={(e) => setReplyText(e.target.value)} className="flex-1 px-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:border-zinc-900 transition-colors" />
                    <button type="submit" disabled={!replyText.trim() || isSending} className="p-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-all active:scale-95 shadow-sm shrink-0"><Send size={18} /></button>
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

        {activeSubTab === 'perangkat' && (
          <div className="h-full flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 p-10 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full text-center space-y-8">
              <div><h2 className="text-2xl font-black tracking-tight">WhatsApp QR</h2><p className="text-xs text-zinc-500 mt-1">Sambungkan perangkat Anda ke sistem.</p></div>
              <div className="p-8 bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                {connectionStatus.connectionState === 'connected' ? (
                  <div className="space-y-6">
                    <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20"><CheckCircle2 size={40}/></div>
                    <div><h3 className="font-black text-emerald-600 text-sm">TERHUBUNG</h3><p className="text-lg font-mono mt-1">{connectionStatus.userPhone}</p></div>
                    <button onClick={handleLogoutWA} className="w-full py-3 bg-rose-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-rose-600/20">LOGOUT PERANGKAT</button>
                  </div>
                ) : connectionStatus.qrCodeBase64 ? (
                  <div className="space-y-6">
                    <div className="p-4 bg-white rounded-2xl shadow-xl inline-block border border-zinc-100 dark:border-zinc-800"><img src={connectionStatus.qrCodeBase64} alt="QR" className="w-56 h-56" /></div>
                    <p className="text-[10px] font-black text-zinc-400 animate-pulse tracking-widest uppercase">Scan via Perangkat Tertaut</p>
                  </div>
                ) : (
                  <button onClick={handleInitConnection} disabled={isLoadingStatus} className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-xl"><RefreshCw size={16} className={isLoadingStatus ? 'animate-spin' : ''}/> BUAT BARCODE LOGIN</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
};
