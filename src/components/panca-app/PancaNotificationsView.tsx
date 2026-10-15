import React, { useState, useEffect } from 'react';
import { Bell, CheckCheck, Clock, AlertTriangle, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { supabaseService } from '../../../task/services/supabaseService';

interface NotificationItem {
  id: string;
  type?: 'invitation' | 'info' | 'alert';
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
}

export const PancaNotificationsView: React.FC<PancaNotificationsViewProps> = ({ 
  currentUser,
  onCountChange 
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

  const filtered = notifications.filter(n => filter === 'all' || !n.read);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {/* Top Header */}
      <div className="bg-white px-5 py-3.5 border-b border-slate-200/80 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 leading-tight">Pusat Notifikasi</h2>
            <p className="text-[10px] text-slate-400">Pemberitahuan sistem & task proyek</p>
          </div>
        </div>

        <button
          onClick={markAllAsRead}
          className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1 active:scale-95 transition"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Tandai Semua</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-100">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition ${
            filter === 'all'
              ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Semua ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition ${
            filter === 'unread'
              ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Belum Dibaca ({notifications.filter(n => !n.read).length})
        </button>
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-4">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
            <p className="text-xs font-semibold">Tidak ada notifikasi baru</p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => markOneRead(item.id)}
              className={`p-4 rounded-2xl border transition active:scale-[0.99] cursor-pointer shadow-sm ${
                item.read
                  ? 'bg-white border-slate-200/80 text-slate-600 opacity-80'
                  : 'bg-violet-50/60 border-violet-200 text-slate-900 shadow-violet-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${item.read ? 'bg-slate-300' : 'bg-violet-600 animate-pulse'}`} />
                  <h4 className="text-xs font-extrabold line-clamp-1">{item.title}</h4>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {item.date}
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed pl-4">
                {item.message}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
