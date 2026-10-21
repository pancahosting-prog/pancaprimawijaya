import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Search, RefreshCw, Send, ChevronLeft, Phone, User, 
  Check, CheckCheck, QrCode, Smartphone, AlertCircle, ArrowLeft,
  Filter, LogOut
} from 'lucide-react';
import { formatDisplayPhone, WAChat, WAChatMessage } from '../WhatsAppView';
import { loadWAChatsFromSupabase, loadKnownConnectedNumbersFromSupabase } from '../../lib/supabaseSync';

interface PancaWhatsAppMobileViewProps {
  currentUser?: {
    username: string;
    role: string;
    nama: string;
  } | null;
  onBack?: () => void;
}

export const PancaWhatsAppMobileView: React.FC<PancaWhatsAppMobileViewProps> = ({
  currentUser,
  onBack
}) => {
  const isSuperadmin = 
    currentUser?.role === 'superadmin' || 
    currentUser?.username === 'superadmin' ||
    (currentUser?.role || '').toLowerCase().includes('admin');

  // WA Connection Status
  const [connectionStatus, setConnectionStatus] = useState<{
    connectionState: 'disconnected' | 'connecting' | 'connected';
    qrCodeBase64: string | null;
    userPhone: string | null;
    userName: string | null;
    qrExpired?: boolean;
  }>({
    connectionState: 'disconnected',
    qrCodeBase64: null,
    userPhone: null,
    userName: null,
  });

  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(true);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [chats, setChats] = useState<WAChat[]>([]);
  const [selectedChatJid, setSelectedChatJid] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Multi-device numbers for Superadmin
  const [connectedNumbers, setConnectedNumbers] = useState<string[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string>('active');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch connection status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/wa/status');
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus({
          connectionState: data.connectionState || 'disconnected',
          qrCodeBase64: data.qrCodeBase64 || null,
          userPhone: data.userPhone || null,
          userName: data.userName || null,
          qrExpired: data.qrExpired
        });
      }
    } catch (err) {
      console.warn('Error fetching WA status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Fetch all known connected phone numbers (for Superadmin)
  const fetchKnownNumbers = async () => {
    if (!isSuperadmin) return;
    try {
      // 1. Fetch from backend API
      const res = await fetch('/api/wa/numbers');
      let apiNumbers: string[] = [];
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.numbers)) {
          apiNumbers = data.numbers;
        }
      }
      // 2. Fetch from Supabase
      const supaNumbers = await loadKnownConnectedNumbersFromSupabase();
      
      const allUnique = Array.from(new Set([
        ...apiNumbers,
        ...supaNumbers,
        connectionStatus.userPhone || ''
      ])).filter(n => n && n !== 'default' && n.length >= 6);

      setConnectedNumbers(allUnique);
    } catch (e) {
      console.warn('Could not load connected numbers:', e);
    }
  };

  // Fetch chats list (from API and fallback to Supabase)
  const fetchChats = async (phoneFilter?: string) => {
    const targetPhone = phoneFilter || (selectedNumber !== 'active' ? selectedNumber : undefined);
    try {
      let url = '/api/wa/chats';
      if (targetPhone && targetPhone !== 'active' && targetPhone !== 'all') {
        url += `?connectedPhone=${encodeURIComponent(targetPhone)}`;
      }
      
      const res = await fetch(url);
      let loadedChats: WAChat[] = [];
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.chats)) {
          loadedChats = data.chats;
        }
      }

      // If API returned empty or user requested specific device, also merge with Supabase
      if (loadedChats.length === 0) {
        const supaChats = await loadWAChatsFromSupabase(targetPhone);
        if (supaChats && supaChats.length > 0) {
          loadedChats = supaChats as WAChat[];
        }
      }

      setChats(loadedChats);
    } catch (err) {
      console.warn('Error fetching chats:', err);
      // Fallback directly to Supabase
      const supaChats = await loadWAChatsFromSupabase(targetPhone);
      if (supaChats && supaChats.length > 0) {
        setChats(supaChats as WAChat[]);
      }
    }
  };

  // Connect / Generate QR
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch('/api/wa/connect?force=true', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(prev => ({
          ...prev,
          connectionState: data.connectionState,
          qrCodeBase64: data.qrCodeBase64,
          qrExpired: false
        }));
      }
    } catch (err) {
      console.error('Error initiating WA connection:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  // Logout WA
  const handleLogout = async () => {
    if (!confirm('Apakah Anda yakin ingin logout dari perangkat WhatsApp ini?')) return;
    try {
      await fetch('/api/wa/logout', { method: 'POST' });
      fetchStatus();
      setSelectedChatJid(null);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  // Send reply
  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedChatJid || !replyText.trim() || isSending) return;

    const textToSend = replyText.trim();
    const chatJid = selectedChatJid;
    setIsSending(true);
    setReplyText('');

    // Optimistic UI update
    const optimisticMsg: WAChatMessage = {
      id: 'opt_' + Date.now(),
      fromMe: true,
      sender: connectionStatus.userPhone || 'me',
      text: textToSend,
      timestamp: Date.now(),
      status: 'sending'
    };

    setChats(prev => prev.map(c => {
      if (c.jid === chatJid) {
        return {
          ...c,
          lastMessage: textToSend,
          lastMessageTime: Date.now(),
          messages: [...(c.messages || []), optimisticMsg]
        };
      }
      return c;
    }));

    try {
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: chatJid, text: textToSend })
      });

      if (res.ok) {
        // Re-fetch after short delay
        setTimeout(() => fetchChats(), 1000);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Lifecycle
  useEffect(() => {
    fetchStatus();
    fetchChats();
    if (isSuperadmin) {
      fetchKnownNumbers();
    }

    pollingRef.current = setInterval(() => {
      fetchStatus();
      fetchChats();
    }, 4000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedNumber, isSuperadmin]);

  // Scroll to bottom when active chat updates
  useEffect(() => {
    if (selectedChatJid) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedChatJid, chats]);

  // Active chat object
  const activeChat = chats.find(c => c.jid === selectedChatJid);

  // Filtered chats by search query
  const filteredChats = chats.filter(c => {
    const { name, phone } = formatDisplayPhone(c.jid, c.name);
    const q = searchQuery.toLowerCase();
    return (
      (name && name.toLowerCase().includes(q)) ||
      (phone && phone.toLowerCase().includes(q)) ||
      (c.lastMessage && c.lastMessage.toLowerCase().includes(q))
    );
  });

  // ----------------------------------------------------
  // VIEW: Active Chat Room
  // ----------------------------------------------------
  if (selectedChatJid && activeChat) {
    const { name: contactName, phone: cleanPhone } = formatDisplayPhone(activeChat.jid, activeChat.name);

    return (
      <div className="flex flex-col h-full bg-[#f0f2f5] dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 select-none">
        {/* Room Header */}
        <div className="bg-white dark:bg-zinc-900 px-3 py-2.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shadow-xs shrink-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setSelectedChatJid(null)}
              className="p-1.5 -ml-1 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition active:scale-95"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>
            <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
              {contactName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-black text-slate-900 dark:text-zinc-100 truncate leading-tight">
                {contactName}
              </h3>
              <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold truncate">
                {cleanPhone}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <a
              href={`https://wa.me/${cleanPhone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1 hover:bg-emerald-100 transition active:scale-95"
              title="Buka di aplikasi WA HP"
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Messages List Area */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-[#efeae2]/50 dark:bg-zinc-950/90">
          {(!activeChat.messages || activeChat.messages.length === 0) ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 dark:text-zinc-500 py-12">
              <MessageCircle className="w-10 h-10 stroke-[1.2] opacity-30 mb-2" />
              <p className="text-xs font-semibold">Belum ada riwayat pesan tersimpan</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Ketik pesan di bawah untuk memulai percakapan</p>
            </div>
          ) : (
            activeChat.messages.map((m, idx) => {
              const isOutgoing = m.fromMe;
              const timeStr = m.timestamp
                ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div
                  key={m.id || `msg-${idx}`}
                  className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-xs transition ${
                      isOutgoing
                        ? 'bg-emerald-600 text-white rounded-tr-none'
                        : 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 border border-slate-200/70 dark:border-zinc-700/60 rounded-tl-none'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <div
                      className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                        isOutgoing ? 'text-emerald-100' : 'text-slate-400 dark:text-zinc-400'
                      }`}
                    >
                      <span>{timeStr}</span>
                      {isOutgoing && (
                        <CheckCheck className="w-3 h-3 stroke-[2.5]" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Form */}
        <form
          onSubmit={handleSendReply}
          className="p-2.5 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            placeholder="Ketik pesan WhatsApp..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="flex-1 px-3.5 py-2.5 bg-slate-100 dark:bg-zinc-800 border-0 rounded-2xl text-xs text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
          />
          <button
            type="submit"
            disabled={!replyText.trim() || isSending}
            className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-2xl transition active:scale-95 shadow-xs shrink-0 flex items-center justify-center"
          >
            <Send className="w-4 h-4 stroke-[2]" />
          </button>
        </form>
      </div>
    );
  }

  // ----------------------------------------------------
  // VIEW: Belum Login / Disconnected (Barcode / QR Login)
  // ----------------------------------------------------
  if (connectionStatus.connectionState !== 'connected') {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100">
        {/* Header */}
        <div className="bg-white dark:bg-zinc-900 px-4 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-300 transition active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-xs shadow-xs">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 leading-tight">
                WhatsApp Connect
              </h3>
              <p className="text-[10px] text-slate-400">Hubungkan akun WhatsApp Anda</p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xl space-y-5">
            <div>
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs">
                <QrCode className="w-6 h-6 stroke-[2]" />
              </div>
              <h2 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                Pindai Barcode Login
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                Gunakan WhatsApp di HP Anda untuk menghubungkan nomor ke sistem MyPanca.
              </p>
            </div>

            {/* QR Area */}
            <div className="p-4 bg-slate-50 dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-800 flex flex-col items-center justify-center min-h-[220px]">
              {connectionStatus.qrCodeBase64 ? (
                <div className="space-y-3">
                  <div className="p-2 bg-white rounded-xl shadow-md inline-block border border-slate-200">
                    <img
                      src={connectionStatus.qrCodeBase64}
                      alt="WhatsApp QR Code"
                      className="w-48 h-48 object-contain"
                    />
                  </div>
                  <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 animate-pulse tracking-widest uppercase">
                    Scan via Perangkat Tertaut WhatsApp
                  </p>
                </div>
              ) : (
                <div className="space-y-3 py-4">
                  <Smartphone className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto stroke-[1.5]" />
                  <p className="text-xs text-slate-400 font-semibold">
                    {connectionStatus.connectionState === 'connecting'
                      ? 'Menghubungkan ke server Baileys...'
                      : 'Barcode belum digenerate.'}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isConnecting ? 'animate-spin' : ''}`} />
                {connectionStatus.qrCodeBase64 ? 'Perbarui Barcode (Refresh)' : 'Buat Barcode Login'}
              </button>
            </div>

            {/* Instruction Steps */}
            <div className="text-left bg-slate-50 dark:bg-zinc-950 p-3.5 rounded-2xl border border-slate-100 dark:border-zinc-800/80 space-y-1.5">
              <p className="text-[11px] font-black text-slate-700 dark:text-zinc-300">Cara Menghubungkan:</p>
              <ol className="text-[10px] text-slate-500 dark:text-zinc-400 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Buka aplikasi <b>WhatsApp</b> di ponsel Anda.</li>
                <li>Ketuk <b>Menu (titik tiga)</b> atau <b>Pengaturan</b>.</li>
                <li>Pilih <b>Perangkat Tertaut</b> lalu ketuk <b>Tautkan Perangkat</b>.</li>
                <li>Arahkan kamera ponsel Anda ke kode barcode di atas.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // VIEW: Sudah Login / Terhubung (WhatsApp Main UI)
  // ----------------------------------------------------
  const displayUserPhone = formatDisplayPhone(connectionStatus.userPhone || '', connectionStatus.userName || '').phone;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 select-none">
      {/* WhatsApp Header */}
      <div className="bg-white dark:bg-zinc-900 px-4 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between shadow-xs shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-300 transition active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-xs shadow-xs">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 leading-tight">
                WhatsApp
              </h3>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" title="Online & Terhubung" />
            </div>
            <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
              {displayUserPhone}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchStatus();
              fetchChats();
            }}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 transition active:scale-95"
            title="Muat ulang pesan"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition active:scale-95"
            title="Keluar / Putuskan WA"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Superadmin Multi-Number Selector */}
      {isSuperadmin && (
        <div className="bg-emerald-50/70 dark:bg-emerald-950/20 px-3 py-2 border-b border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-900 dark:text-emerald-300">
            <Filter className="w-3.5 h-3.5 text-emerald-600" />
            <span>Nomor Sistem:</span>
          </div>
          <select
            value={selectedNumber}
            onChange={(e) => {
              setSelectedNumber(e.target.value);
              fetchChats(e.target.value);
            }}
            className="bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 text-slate-800 dark:text-zinc-100 text-[11px] font-bold rounded-xl px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="active">Nomor Aktif ({displayUserPhone})</option>
            {connectedNumbers.map((num) => {
              const formatted = formatDisplayPhone(num).phone;
              return (
                <option key={num} value={num}>
                  SIM: {formatted}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Search Bar */}
      <div className="px-3 pt-3 pb-2 bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-800/80 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kontak atau nomor telepon..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-slate-100 dark:bg-zinc-800 text-xs rounded-xl border-0 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-zinc-100 transition"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/60 bg-white dark:bg-zinc-900">
        {filteredChats.length === 0 ? (
          <div className="py-14 text-center text-slate-400 dark:text-zinc-500 px-4">
            <MessageCircle className="w-10 h-10 mx-auto stroke-[1.2] opacity-30 mb-2" />
            <p className="text-xs font-semibold">
              {searchQuery ? 'Kontak tidak ditemukan' : 'Belum ada percakapan WhatsApp'}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Pesan baru yang masuk akan otomatis tersimpan di sini
            </p>
          </div>
        ) : (
          filteredChats.map((c) => {
            const { name, phone } = formatDisplayPhone(c.jid, c.name);
            const timeStr = c.lastMessageTime
              ? new Date(c.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';

            return (
              <div
                key={c.jid || c.id}
                onClick={() => setSelectedChatJid(c.jid)}
                className="p-3.5 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 active:bg-slate-100 dark:active:bg-zinc-800 cursor-pointer transition select-none"
              >
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-emerald-600/90 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs border border-emerald-500/20">
                  {name.charAt(0).toUpperCase()}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <h4 className="text-xs font-black text-slate-900 dark:text-zinc-100 truncate">
                      {name}
                    </h4>
                    <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                      {timeStr}
                    </span>
                  </div>

                  {/* Clean Real Phone Number Display */}
                  <p className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">
                    {phone}
                  </p>

                  {/* Last message */}
                  <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                    {c.lastMessage || 'Tidak ada teks pesan'}
                  </p>
                </div>

                {/* Unread badge */}
                {c.unreadCount > 0 && (
                  <span className="mt-1 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-xs">
                    {c.unreadCount}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
