import React, { useState, useEffect } from "react";
import {
  BellRing,
  QrCode,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Phone,
  Send,
  LogOut,
  Sparkles,
  Info,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import { getApiUrl } from "../lib/apiUtils";

export interface WANotifStatus {
  connectionState: "disconnected" | "connecting" | "connected";
  qrCodeBase64: string | null;
  qrTimestamp: number;
  qrVersion: number;
  qrExpired: boolean;
  userJid: string | null;
  userPhone: string | null;
  userName: string | null;
}

export const WANotifSettingsSection: React.FC = () => {
  const [status, setStatus] = useState<WANotifStatus>({
    connectionState: "disconnected",
    qrCodeBase64: null,
    qrTimestamp: 0,
    qrVersion: 0,
    qrExpired: false,
    userJid: null,
    userPhone: null,
    userName: null
  });

  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Halo! Ini tes pesan notifikasi dari Sistem MyPanca CRM.");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const safeParseResponse = async (res: Response) => {
    try {
      if (!res || !res.ok) return null;
      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      if (!text || text.trim().startsWith("<") || text.trim().toLowerCase().startsWith("<!doctype")) {
        return null;
      }
      if (!contentType.includes("application/json") && !text.trim().startsWith("{")) {
        return null;
      }
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(getApiUrl("/api/wa-notif/status"));
      const data = await safeParseResponse(res);
      if (data && data.success) {
        setStatus({
          connectionState: data.connectionState,
          qrCodeBase64: data.qrCodeBase64,
          qrTimestamp: data.qrTimestamp,
          qrVersion: data.qrVersion,
          qrExpired: data.qrExpired,
          userJid: data.userJid,
          userPhone: data.userPhone,
          userName: data.userName
        });
      }
    } catch (err) {
      // Ignore background status polling failures
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async (force = false) => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/wa-notif/connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force })
      });
      const data = await safeParseResponse(res);
      if (data && data.success) {
        await fetchStatus();
      } else {
        const errorMsg = data?.error || "Koneksi sedang diproses, silakan tunggu beberapa detik.";
        alert(`Gagal koneksi WA Notifikasi: ${errorMsg}`);
      }
    } catch (err: any) {
      console.error("Gagal menyambungkan WA Notifikasi:", err);
      alert(`Gagal menyambungkan WA Notifikasi: ${err.message || "Gagal terkoneksi ke server"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm("Apakah Anda yakin ingin memutuskan sesi WhatsApp Notifikasi Sistem ini?")) return;
    setLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/wa-notif/logout"), { method: "POST" });
      const data = await safeParseResponse(res);
      if (data && data.success) {
        await fetchStatus();
      }
    } catch (err: any) {
      console.error("Gagal logout WA Notifikasi:", err);
      alert(`Gagal logout WA Notifikasi: ${err.message || "Gagal koneksi ke server"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async () => {
    if (!testPhone.trim() || !testMessage.trim()) return;
    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch(getApiUrl("/api/send-whatsapp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone, message: testMessage })
      });

      const data = await safeParseResponse(res);
      if (data && data.success) {
        setTestResult({
          success: true,
          message: `Berhasil dikirim via ${data.provider === "baileys_notif" ? "WhatsApp Notifikasi Baileys" : "Fonnte API"}!`
        });
      } else {
        setTestResult({
          success: false,
          message: data?.error || "Gagal mengirim pesan."
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Gagal koneksi ke server."
      });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 rounded-xl">
            <BellRing size={22} />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              Koneksi WhatsApp Notifikasi Sistem & AI Command Gateway
              <span className="text-[10px] bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Khusus Notifikasi & AI
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sesi WhatsApp khusus untuk mengirimkan notifikasi otomatis (reminder follow-up, tagihan jatuh tempo) dan mengeksekusi pesan perintah bahasa alami dari Asisten AI (<code className="font-mono bg-muted px-1 rounded">/app</code>).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status.connectionState === "connected" ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-bold">
              <CheckCircle2 size={16} /> Terhubung
            </div>
          ) : status.connectionState === "connecting" ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-bold animate-pulse">
              <RefreshCw size={16} className="animate-spin" /> Menghubungkan...
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-bold">
              <XCircle size={16} /> Terputus
            </div>
          )}
        </div>
      </div>

      {/* Main Connection Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status & Connection Details */}
        <div className="space-y-4">
          <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Phone size={14} /> Status Perangkat Terhubung
            </h4>

            {status.connectionState === "connected" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Nomor Pengirim:</span>
                  <span className="font-mono font-bold text-foreground">{status.userPhone || "-"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Nama Pengirim:</span>
                  <span className="font-medium text-foreground">{status.userName || "WhatsApp Notifikasi"}</span>
                </div>
                <div className="pt-3 border-t border-border flex justify-end">
                  <button
                    onClick={handleLogout}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-bold transition-colors"
                  >
                    <LogOut size={14} /> Putuskan Sesi WA Notifikasi
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground space-y-2">
                <p>
                  Nomor ini digunakan khusus untuk sistem notifikasi otomatis dan mengeksekusi pesan perintah Superadmin di halaman Asisten AI.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={() => handleConnect(true)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                  >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    {loading ? "Proses..." : "Sambungkan / Muat QR Code Baru"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
            <Info size={16} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <div>
              <span className="font-bold block mb-0.5">Pemisahan Sesi Otomatis & Terisolasi:</span>
              Sesi WhatsApp Notifikasi ini terpisah sepenuhnya dari Sesi WhatsApp CS AI. Pesan notifikasi tidak akan memicu balasan otomatis CS AI atau mencampuri obrolan dengan pelanggan.
            </div>
          </div>
        </div>

        {/* QR Code Display Panel */}
        <div className="flex flex-col items-center justify-center p-4 bg-muted/20 border border-border rounded-xl min-h-[200px]">
          {status.connectionState === "connected" ? (
            <div className="text-center space-y-3 p-4">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-xs border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck size={32} />
              </div>
              <h4 className="font-bold text-foreground">Sesi WhatsApp Notifikasi Aktif</h4>
              <p className="text-xs text-muted-foreground max-w-xs">
                Sistem siap mengendalikan dan mengirimkan notifikasi serta pesan perintah AI secara otomatis.
              </p>
            </div>
          ) : status.qrCodeBase64 ? (
            <div className="text-center space-y-3">
              <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200 inline-block">
                <img src={status.qrCodeBase64} alt="QR Code WhatsApp Notifikasi" className="w-48 h-48 object-contain" />
              </div>
              <p className="text-xs font-bold text-foreground">
                Pindai QR Code di atas menggunakan fitur WhatsApp Web pada ponsel Notifikasi perusahaan Anda.
              </p>
              <button
                onClick={() => handleConnect(true)}
                className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 mx-auto"
              >
                <RefreshCw size={12} /> Segarkan QR Code
              </button>
            </div>
          ) : (
            <div className="text-center space-y-3 p-4">
              <QrCode size={40} className="text-muted-foreground mx-auto opacity-50" />
              <p className="text-xs text-muted-foreground">
                Belum ada QR Code aktif. Klik tombol di bawah untuk membuat koneksi baru.
              </p>
              <button
                onClick={() => handleConnect(true)}
                disabled={loading}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs inline-flex items-center gap-2"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Generasi QR Code WA Notifikasi
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Direct Test Send Form */}
      <div className="pt-4 border-t border-border">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Send size={14} /> Pengujian Pengiriman Notifikasi WA Mandiri
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Nomor Tujuan (Contoh: 081234567890)"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="p-2.5 bg-background border border-input rounded-xl text-xs outline-none focus:ring-2 focus:ring-violet-500 font-mono"
          />
          <input
            type="text"
            placeholder="Isi Pesan Notifikasi"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            className="p-2.5 bg-background border border-input rounded-xl text-xs outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            onClick={handleSendTest}
            disabled={sendingTest || !testPhone.trim()}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send size={14} className={sendingTest ? "animate-spin" : ""} />
            {sendingTest ? "Mengirim..." : "Kirim Pesan Uji Coba"}
          </button>
        </div>

        {testResult && (
          <div
            className={`mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              testResult.success
                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
            }`}
          >
            {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
};
