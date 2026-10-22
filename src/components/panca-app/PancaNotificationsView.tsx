import React, { useState, useEffect } from 'react';
import { 
  Bell, CheckCheck, Clock, AlertTriangle, Calendar, FileText, CheckCircle2, 
  ExternalLink, X, User, Phone, DollarSign, ListFilter, ArrowRight, MessageSquare, Send
} from 'lucide-react';
import { supabaseService } from '../../../task/services/supabaseService';

interface NotificationItem {
  id: string;
  type?: 'invitation' | 'info' | 'alert';
  taskId?: string;
  title: string;
  date: string;
  priority?: string;
  message: string;
  read: boolean;
}

interface PancaNotificationsViewProps {
  currentUser: {
    username: string;
    role: string;
    nama: string;
  };
  onCountChange?: (count: number) => void;
  transactions?: any[];
  customers?: any[];
}

export const PancaNotificationsView: React.FC<PancaNotificationsViewProps> = ({ 
  currentUser,
  onCountChange,
  transactions = [],
  customers = []
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      type: 'alert',
      title: 'Stok Menipis: Lem Pipa PVC',
      date: new Date().toISOString().split('T')[0],
      priority: 'high',
      message: 'Sisa stok produk Lem Pipa PVC berada di bawah batas aman (< 5 unit). Segera buat PO restock.',
      read: false
    },
    {
      id: 'notif-2',
      type: 'info',
      title: 'Update Task Proyek PLTU',
      date: new Date().toISOString().split('T')[0],
      priority: 'medium',
      message: 'Dokumen Testing & Commissioning telah diunggah ke Drive Proyek oleh Evan.',
      read: false
    },
    {
      id: 'notif-3',
      type: 'invitation',
      title: 'Tugas Baru Diberikan: Rekap Invoice',
      date: new Date().toISOString().split('T')[0],
      priority: 'medium',
      message: 'Anda ditugaskan untuk melakukan verifikasi status pelunasan transaksi TRX-70.',
      read: true
    }
  ]);

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedTrx, setSelectedTrx] = useState<any | null>(null);

  // Format currency IDR
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(val || 0);
  };

  useEffect(() => {
    const fetchSupabaseNotifications = async () => {
      try {
        const data = await supabaseService.getNotifications(currentUser.username);
        if (data && data.length > 0) {
          setNotifications(prev => {
            const combined = [...data, ...prev.filter(p => !data.some((d: any) => d.id === p.id))];
            return combined;
          });
        }
      } catch (e) {
        console.warn("Could not fetch remote notifications", e);
      }
    };
    fetchSupabaseNotifications();
  }, [currentUser.username]);

  useEffect(() => {
    const unread = notifications.filter(n => !n.read).length;
    if (onCountChange) onCountChange(unread);
  }, [notifications, onCountChange]);

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    supabaseService.markNotifRead(currentUser.username).catch(() => {});
  };

  const markOneRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    supabaseService.markNotifRead(currentUser.username).catch(() => {});
  };

  // Helper to find matched transaction from notification item
  const getMatchedTransaction = (item: NotificationItem) => {
    if (!transactions || transactions.length === 0) return null;

    // 1. By taskId (noTrx or id)
    if (item.taskId) {
      const match = transactions.find(t => 
        String(t.noTrx || '').toLowerCase() === String(item.taskId).toLowerCase() ||
        String(t.id || '').toLowerCase() === String(item.taskId).toLowerCase()
      );
      if (match) return match;
    }

    // 2. Search by noTrx inside title or message
    for (const t of transactions) {
      if (t.noTrx && (item.title?.includes(t.noTrx) || item.message?.includes(t.noTrx))) {
        return t;
      }
    }

    return null;
  };

  const filtered = notifications.filter(n => filter === 'all' || !n.read);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100">
      {/* Filter Tabs & Actions */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              filter === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
            }`}
          >
            Semua ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              filter === 'unread'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
            }`}
          >
            Belum Dibaca ({notifications.filter(n => !n.read).length})
          </button>
        </div>

        <button
          onClick={markAllAsRead}
          className="text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-zinc-200 flex items-center gap-1 active:scale-95 transition"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Tandai Semua</span>
        </button>
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-6">
        {filtered.length === 0 ? (
          <div className="text-center py-14 text-slate-400">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
            <p className="text-xs font-semibold">Tidak ada notifikasi baru</p>
          </div>
        ) : (
          filtered.map((item) => {
            const matchedTrx = getMatchedTransaction(item);

            return (
              <div
                key={item.id}
                onClick={() => markOneRead(item.id)}
                className={`p-4 rounded-2xl border transition shadow-sm ${
                  item.read
                    ? 'bg-white dark:bg-zinc-900 border-slate-200/80 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 opacity-90'
                    : 'bg-slate-50/90 dark:bg-zinc-900/90 border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${item.read ? 'bg-slate-300 dark:bg-zinc-600' : 'bg-emerald-500 animate-pulse'}`} />
                    <h4 className="text-xs font-black truncate">{item.title}</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {item.date}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed pl-4 whitespace-pre-line mb-2">
                  {item.message}
                </p>

                {/* Direct Action: Detail Transaksi if matched */}
                {matchedTrx && (
                  <div className="pl-4 pt-1 flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markOneRead(item.id);
                        setSelectedTrx(matchedTrx);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 shadow-xs"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Lihat Detail Transaksi ({matchedTrx.noTrx})</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Detail Transaksi */}
      {selectedTrx && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50 dark:bg-zinc-950 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                      {selectedTrx.noTrx}
                    </h3>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      selectedTrx.status === 'Lunas'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : selectedTrx.status === 'Penawaran'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                    }`}>
                      {selectedTrx.status || 'Invoice'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">Detail Lengkap Transaksi Sistem</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTrx(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 flex items-center justify-center text-slate-600 dark:text-zinc-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Customer & Sales Information */}
              {(() => {
                const customer = customers.find(c => c.nama === selectedTrx.customerName);
                const rawPhone = customer?.phone || '';
                const cleanCustPhone = rawPhone.replace(/[^0-9]/g, '');
                const waCustLink = cleanCustPhone 
                  ? `https://wa.me/${cleanCustPhone.startsWith('0') ? '62' + cleanCustPhone.slice(1) : cleanCustPhone}` 
                  : null;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-800">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Customer / Klien</span>
                      <p className="font-extrabold text-slate-900 dark:text-zinc-100 text-xs mb-1">
                        {selectedTrx.customerName || '-'}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{customer?.phone ? (customer.phoneCode || '+62') + customer.phone : '-'}</span>
                        {waCustLink && (
                          <a
                            href={waCustLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:underline font-bold flex items-center gap-1 text-[10px]"
                          >
                            <Send className="w-3 h-3" /> Chat WA
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-800">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Sales Representative</span>
                      <p className="font-extrabold text-slate-900 dark:text-zinc-100 text-xs mb-1">
                        {selectedTrx.sales || selectedTrx.salesRep || '-'}
                      </p>
                      <span className="text-[11px] text-slate-500">Penanggung Jawab Follow-up</span>
                    </div>
                  </div>
                );
              })()}

              {/* Dates & Values */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Tgl Transaksi</span>
                  <p className="font-extrabold text-slate-900 dark:text-zinc-100">{selectedTrx.tanggal || '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Jatuh Tempo</span>
                  <p className={`font-extrabold ${selectedTrx.jatuhTempo ? 'text-rose-600' : 'text-slate-900 dark:text-zinc-100'}`}>
                    {selectedTrx.jatuhTempo || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Total Transaksi</span>
                  <p className="font-extrabold text-slate-900 dark:text-zinc-100">
                    {formatRupiah(
                      selectedTrx.items?.reduce((acc: number, curr: any) => acc + ((curr.harga * curr.qty) - (curr.diskon || 0)), 0) || 0
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Sisa Piutang</span>
                  <p className="font-extrabold text-rose-600">
                    {formatRupiah(selectedTrx.sisaPembayaran || 0)}
                  </p>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  Daftar Produk / Item
                </h4>
                <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
                  {(!selectedTrx.items || selectedTrx.items.length === 0) ? (
                    <div className="p-3 text-center text-slate-400 italic">Tidak ada item tercatat</div>
                  ) : (
                    selectedTrx.items.map((item: any, idx: number) => {
                      const itemTotal = (item.harga * item.qty) - (item.diskon || 0);
                      return (
                        <div key={idx} className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900">
                          <div className="min-w-0">
                            <p className="font-extrabold text-slate-900 dark:text-zinc-100 truncate">{item.nama}</p>
                            <p className="text-[10px] text-slate-400">
                              Qty: {item.qty} &times; {formatRupiah(item.harga)}
                              {item.diskon ? ` (Diskon: ${formatRupiah(item.diskon)})` : ''}
                            </p>
                          </div>
                          <span className="font-black text-slate-900 dark:text-zinc-100 shrink-0">
                            {formatRupiah(itemTotal)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Roadmap Follow-up */}
              <div>
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  Riwayat & Roadmap Follow-up
                </h4>
                <div className="space-y-2">
                  {(!selectedTrx.followUps || selectedTrx.followUps.length === 0) ? (
                    <div className="p-3 bg-slate-50 dark:bg-zinc-950 rounded-2xl text-center text-slate-400 italic">
                      Belum ada follow-up tercatat di transaksi ini
                    </div>
                  ) : (
                    selectedTrx.followUps.map((fu: any, fIdx: number) => (
                      <div key={fIdx} className="p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-extrabold text-slate-800 dark:text-zinc-200">
                            {fu.tanggal || '-'} &bull; {fu.method || 'Follow-up'}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-zinc-400 text-xs">
                          {fu.keterangan || '-'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800 flex justify-end">
              <button
                onClick={() => setSelectedTrx(null)}
                className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-extrabold text-xs rounded-xl shadow-xs active:scale-95 transition"
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
