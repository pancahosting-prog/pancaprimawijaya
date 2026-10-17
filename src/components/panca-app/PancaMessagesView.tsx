import React, { useState, useEffect } from 'react';
import { Send, MessageSquare, User, Search, Clock, CheckCheck, Plus } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  role: string;
  text: string;
  time: string;
  isSelf?: boolean;
}

interface PancaMessagesViewProps {
  currentUser: {
    username: string;
    role: string;
    nama: string;
  };
}

export const PancaMessagesView: React.FC<PancaMessagesViewProps> = ({ currentUser }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('mypanca_mobile_team_messages');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: '1',
        sender: 'Dwi (Sales Rep)',
        role: 'sales',
        text: 'Halo tim, penawaran untuk PT Indofood sudah di-follow up hari ini. Mohon dicek status stok phostoxin.',
        time: '09:30',
        isSelf: false
      },
      {
        id: '2',
        sender: 'Evan (Engineering)',
        role: 'engineer',
        text: 'Siap Pak Dwi, instalasi sensor accelerometer di project PLTU sudah selesai 100% dan berkas commissioning sudah saya upload di Drive.',
        time: '10:15',
        isSelf: false
      },
      {
        id: '3',
        sender: 'Finance Team',
        role: 'finance',
        text: 'Tagihan untuk invoice INV-2026-004 sudah diterima pembayaran sebagian sebesar Rp 45.000.000.',
        time: '11:00',
        isSelf: false
      }
    ];
  });

  const [inputMessage, setInputMessage] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('mypanca_mobile_team_messages', JSON.stringify(messages));
    } catch (e) {}
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: currentUser.nama,
      role: currentUser.role,
      text: inputMessage.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: true
    };

    setMessages(prev => [...prev, newMsg]);
    setInputMessage('');
  };

  const filtered = messages.filter(m => 
    m.text.toLowerCase().includes(searchFilter.toLowerCase()) || 
    m.sender.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {/* Top Header */}
      <div className="bg-white px-5 py-3.5 border-b border-slate-200/80 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-zinc-50 text-zinc-600 flex items-center justify-center font-bold">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 leading-tight">Pesan & Diskusi Tim</h2>
            <p className="text-[10px] text-slate-400">Komunikasi internal & koordinasi task</p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 bg-white border-b border-slate-100">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari pesan atau nama anggota..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-zinc-400 transition"
          />
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
        {filtered.map((msg) => {
          const isMe = msg.isSelf || msg.sender === currentUser.nama;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[90%] ${isMe ? 'ml-auto' : 'mr-auto'}`}
            >
              <span className="text-[10px] font-semibold text-slate-400 px-1 mb-1">
                {isMe ? 'Anda' : msg.sender}
              </span>
              <div
                className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                  isMe
                    ? 'bg-gradient-to-r from-zinc-600 to-slate-600 text-white rounded-tr-none'
                    : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none'
                }`}
              >
                {msg.text}
              </div>
              <div className="flex items-center gap-1 mt-1 px-1 text-[9px] text-slate-400">
                <Clock className="w-2.5 h-2.5" />
                <span>{msg.time}</span>
                {isMe && <CheckCheck className="w-3 h-3 text-zinc-500 ml-0.5" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="bg-white p-3 border-t border-slate-200/80 shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Ketik pesan untuk tim..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            className="flex-1 bg-slate-100 hover:bg-slate-100/80 focus:bg-white border border-transparent focus:border-zinc-400 rounded-2xl px-4 py-3 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim()}
            className="w-10 h-10 rounded-2xl bg-zinc-600 hover:bg-zinc-700 text-white flex items-center justify-center shadow-md shadow-zinc-200 disabled:opacity-40 transition active:scale-95 shrink-0"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
