import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { supabaseServer } from "./supabaseServer.ts";

const COMPANY_SESSION_DIR = path.resolve("./wa-company-session");
const COMPANY_AI_SETTINGS_FILE = path.resolve("./company-ai-settings.json");

export interface WhitelistUser {
  id: string;
  name: string;
  phone: string; // e.g., "6281234567890"
  role: "superadmin" | "admin" | "sales" | "finance" | "hr" | "employee";
  isActive: boolean;
  addedAt: number;
}

export interface CompanyAISettings {
  enabled: boolean;
  botName: string;
  whitelistedUsers: WhitelistUser[];
  allowReadTransactions: boolean;
  allowReadProducts: boolean;
  allowReadContacts: boolean;
  allowReadFinance: boolean;
  allowReadEmployees: boolean;
  systemInstruction: string;
  unauthorizedMessage: string;
  logs: {
    id: string;
    timestamp: number;
    phone: string;
    userName: string;
    userRole: string;
    question: string;
    answer: string;
  }[];
}

class CompanyAIService {
  private socket: any = null;
  public qrCodeBase64: string | null = null;
  public connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  public userJid: string | null = null;
  public userPhone: string | null = null;
  public userName: string | null = null;

  public settings: CompanyAISettings = {
    enabled: true,
    botName: "AI Perusahaan MyPanca",
    whitelistedUsers: [
      {
        id: "wl-1",
        name: "Super Admin",
        phone: "6281234567890",
        role: "superadmin",
        isActive: true,
        addedAt: Date.now()
      },
      {
        id: "wl-2",
        name: "Manager Sales",
        phone: "6289876543210",
        role: "sales",
        isActive: true,
        addedAt: Date.now()
      }
    ],
    allowReadTransactions: true,
    allowReadProducts: true,
    allowReadContacts: true,
    allowReadFinance: true,
    allowReadEmployees: true,
    systemInstruction: "Anda adalah Asisten Eksekutif AI Perusahaan MyPanca. Tugas Anda adalah membantu tim internal memberikan data transaksional, stok produk, progres penawaran, dan laporan secara akurat.",
    unauthorizedMessage: "Mohon maaf, nomor WhatsApp Anda belum terdaftar dalam Whitelist AI Perusahaan. Silakan hubungi Administrator untuk meminta akses.",
    logs: []
  };

  constructor() {
    this.loadSettings();
  }

  private loadSettings() {
    try {
      if (fs.existsSync(COMPANY_AI_SETTINGS_FILE)) {
        const raw = fs.readFileSync(COMPANY_AI_SETTINGS_FILE, "utf-8");
        this.settings = { ...this.settings, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error("Error loading Company AI settings:", e);
    }

    this.syncFromSupabaseCloud().catch(err => {
      console.warn("[companyAiService] Supabase cloud fetch warning:", err?.message);
    });
  }

  public async syncFromSupabaseCloud(): Promise<void> {
    if (!supabaseServer) return;
    try {
      const { data, error } = await supabaseServer
        .from('app_settings')
        .select('value')
        .eq('key', 'company_ai_settings')
        .maybeSingle();

      if (!error && data?.value && typeof data.value === 'object') {
        this.settings = { ...this.settings, ...data.value };
        try {
          fs.writeFileSync(COMPANY_AI_SETTINGS_FILE, JSON.stringify(this.settings, null, 2), "utf-8");
        } catch {}
      }
    } catch (err: any) {
      console.warn("[companyAiService] Sync from Supabase error:", err?.message);
    }
  }

  public async saveSettings(newSettings: Partial<CompanyAISettings>) {
    try {
      this.settings = { ...this.settings, ...newSettings };
      fs.writeFileSync(COMPANY_AI_SETTINGS_FILE, JSON.stringify(this.settings, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving Company AI settings:", e);
    }

    if (supabaseServer) {
      try {
        await supabaseServer.from('app_settings').upsert({
          key: 'company_ai_settings',
          value: this.settings,
          updated_at: new Date().toISOString(),
          updated_by: 'company_ai_service'
        }, { onConflict: 'key' });
      } catch (err: any) {
        console.warn("[companyAiService] Failed saving to Supabase Cloud:", err?.message);
      }
    }
  }

  public async initBaileys() {
    if (this.connectionState === "connecting" || this.connectionState === "connected") {
      return;
    }

    this.connectionState = "connecting";

    try {
      if (!fs.existsSync(COMPANY_SESSION_DIR)) {
        fs.mkdirSync(COMPANY_SESSION_DIR, { recursive: true });
      }

      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const useMultiFileAuthState = baileys.useMultiFileAuthState;
      const DisconnectReason = baileys.DisconnectReason;
      const pino = (await import("pino")).default;

      const { state, saveCreds } = await useMultiFileAuthState(COMPANY_SESSION_DIR);

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
        browser: ["MyPanca Company AI", "Chrome", "1.0.0"]
      });

      this.socket.ev.on("creds.update", saveCreds);

      this.socket.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCodeBase64 = await QRCode.toDataURL(qr);
          this.connectionState = "disconnected";
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          this.connectionState = "disconnected";
          if (shouldReconnect) {
            setTimeout(() => this.initBaileys(), 3000);
          } else {
            try {
              fs.rmSync(COMPANY_SESSION_DIR, { recursive: true, force: true });
            } catch (err) {}
          }
        } else if (connection === "open") {
          this.connectionState = "connected";
          this.qrCodeBase64 = null;
          const user = this.socket?.user;
          this.userJid = user?.id || null;
          this.userPhone = user?.id ? user.id.split(":")[0] : null;
          this.userName = user?.name || "Company AI Assistant Bot";
        }
      });

      this.socket.ev.on("messages.upsert", async (m: any) => {
        if (m.type !== "notify") return;

        for (const msg of m.messages) {
          if (!msg.message || msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us")) continue;

          const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
          if (!text) continue;

          // Clean and normalize phone number format
          const rawPhone = remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
          const normalizePhone = (p: string) => {
            let clean = p.replace(/\D/g, "");
            if (clean.startsWith("0")) clean = "62" + clean.slice(1);
            return clean;
          };

          const normRaw = normalizePhone(rawPhone);

          // Whitelist check (Bypassed temporarily as per user request, but still logged if matched)
          const matchedUser = this.settings.whitelistedUsers.find(u => {
            const normUser = normalizePhone(u.phone);
            if (normRaw === normUser) return true;
            if (normRaw.length >= 8 && normUser.length >= 8) {
              return normRaw.slice(-9) === normUser.slice(-9) || normRaw.slice(-8) === normUser.slice(-8);
            }
            return false;
          });

          // Even if not whitelisted, we respond because user requested to disable whitelist temporarily
          const userObj = matchedUser || { name: "Pengguna Umum", role: "guest", phone: rawPhone } as any;

          console.log(`[Company AI] Processing message from ${userObj.name} (${rawPhone})`);

          // Process Company AI Query
          await this.processCompanyAIQuery(remoteJid, userObj, text);
        }
      });
    } catch (err) {
      console.error("Failed to initialize Company AI Baileys:", err);
      this.connectionState = "disconnected";
      QRCode.toDataURL("https://mypanca-crm.app/company-ai-connect-" + Date.now()).then(qr => {
        this.qrCodeBase64 = qr;
      });
    }
  }

  public async processCompanyAIQuery(remoteJid: string, user: WhitelistUser, question: string) {
    try {
      // Read live company database from ./company-database.json
      let dbData: any = null;
      try {
        const dbPath = path.resolve("./company-database.json");
        if (fs.existsSync(dbPath)) {
          const raw = fs.readFileSync(dbPath, "utf-8");
          dbData = JSON.parse(raw);
        }
      } catch (e) {
        console.error("Error loading company-database.json:", e);
      }

      // Construct detailed Company Data Context (Matching Desktop AI Digest logic)
      let companyDataContext = "=== DATABASE REAL-TIME PERUSAHAAN MYPANCA ===\n";
      
      if (dbData) {
        const trxs: any[] = dbData.transactions || [];
        const prods: any[] = dbData.products || [];
        const custs: any[] = dbData.customers || [];
        const pos: any[] = dbData.purchaseOrders || [];
        const supps: any[] = dbData.suppliers || [];

        // 1. Transaction Metrics
        const realDeals = trxs.filter(t => !['Penawaran', 'Pesanan Batal'].includes(t.status));
        const totalOmzetReal = realDeals.reduce((acc, t) => acc + (t.nilaiProyek || t.total || 0), 0);
        const lunasDeals = realDeals.filter(t => ['Selesai', 'Lunas', 'Payment', 'Pengiriman'].includes(t.status) || t.paymentStatus === 'Lunas');
        const totalOmzetLunas = lunasDeals.reduce((acc, t) => acc + (t.nilaiProyek || t.total || 0), 0);
        const penawaranDeals = trxs.filter(t => t.status === 'Penawaran');
        const totalNilaiPenawaran = penawaranDeals.reduce((acc, t) => acc + (t.nilaiProyek || t.total || 0), 0);
        const piutangDeals = realDeals.filter(t => t.paymentStatus === 'Belum Lunas' || t.status === 'Invoice');
        const totalPiutang = piutangDeals.reduce((acc, t) => acc + (t.nilaiProyek || t.total || 0), 0);

        companyDataContext += `[RINGKASAN EKSEKUTIF]\n`;
        companyDataContext += `- Total Omset (Deal/Real): Rp ${totalOmzetReal.toLocaleString('id-ID')}\n`;
        companyDataContext += `- Omset Selesai/Lunas: Rp ${totalOmzetLunas.toLocaleString('id-ID')}\n`;
        companyDataContext += `- Total Piutang (Belum Bayar): Rp ${totalPiutang.toLocaleString('id-ID')}\n`;
        companyDataContext += `- Total Nilai Prospek (Penawaran): Rp ${totalNilaiPenawaran.toLocaleString('id-ID')}\n\n`;

        // 2. Top Products & Low Stock
        if (this.settings.allowReadProducts) {
          const lowStock = prods.filter(p => (p.stock || p.availableStock || 0) < 10);
          companyDataContext += `[STOK & PRODUK]\n`;
          companyDataContext += `- Total Produk: ${prods.length} SKU\n`;
          companyDataContext += `- Produk Stok Menipis (<10): ${lowStock.length} items\n`;
          lowStock.slice(0, 10).forEach(p => {
             companyDataContext += `  * ${p.nama}: sisa ${p.stock || 0} ${p.satuan || 'unit'}\n`;
          });
          companyDataContext += `\n`;
        }

        // 3. Transactions Detail
        if (this.settings.allowReadTransactions) {
          companyDataContext += `[TRANSAKSI TERBARU (30 Record)]\n`;
          trxs.slice(0, 30).forEach((t, i) => {
            const amt = t.nilaiProyek || t.total || 0;
            companyDataContext += `${i + 1}. [${t.noTrx || t.id}] ${t.tanggal} | ${t.customerName || t.perusahaan || '-'} | Rp ${amt.toLocaleString('id-ID')} | Status: ${t.status} | Bayar: ${t.paymentStatus || 'N/A'}\n`;
          });
          companyDataContext += `\n`;
        }

        // 4. Contacts
        if (this.settings.allowReadContacts) {
          companyDataContext += `[PELANGGAN/CLIENT]\n`;
          custs.slice(0, 15).forEach((c, i) => {
            companyDataContext += `- ${c.nama} (${c.perusahaan || '-'}) | Lead: ${c.leadType || '-'} | Sales: ${c.sales || '-'}\n`;
          });
          companyDataContext += `\n`;
        }

        // 5. Purchasing
        if (this.settings.allowReadFinance) {
           const totalPO = pos.reduce((acc, p) => acc + (p.total || 0), 0);
           const pendingPO = pos.filter(p => p.status !== 'Lunas').reduce((acc, p) => acc + (p.total || 0), 0);
           companyDataContext += `[PURCHASING & HUTANG]\n`;
           companyDataContext += `- Total Purchase Orders: Rp ${totalPO.toLocaleString('id-ID')}\n`;
           companyDataContext += `- Total Hutang (PO Belum Lunas): Rp ${pendingPO.toLocaleString('id-ID')}\n`;
           companyDataContext += `\n`;
        }
      }

      const systemInstruction = `Anda adalah "${this.settings.botName}".
Pengguna yang Bertanya: ${user.name} (Role: ${user.role}).
Instruksi Utama: ${this.settings.systemInstruction}

DATA REAL-TIME PERUSAHAAN (Ground Truth):
${companyDataContext}

TUGAS ANDA:
1. Jawablah pertanyaan pengguna secara mendalam dan profesional menggunakan data di atas.
2. Jika ditanya tentang omset, piutang, stok, atau detail transaksi, berikan angka dan rincian yang ada di database.
3. Jangan pernah mengarang data yang tidak ada di konteks di atas.
4. Gunakan bahasa Indonesia yang formal namun ramah.
5. Berikan rincian jika diminta (misal: "tampilkan 5 transaksi terakhir").`;

      // Retrieve API key from env or gemini-settings.json
      let apiKey = process.env.GEMINI_API_KEY;
      try {
        const settingsPath = path.resolve("./gemini-settings.json");
        if (fs.existsSync(settingsPath)) {
          const raw = fs.readFileSync(settingsPath, "utf-8");
          const json = JSON.parse(raw);
          if (Array.isArray(json.apiKeys) && json.apiKeys.length > 0) {
            const activeObj = json.apiKeys.find((k: any) => k.isActive && !k.isExhausted) || json.apiKeys[0];
            if (activeObj?.key) {
              apiKey = activeObj.key;
            }
          }
        }
      } catch (e) {}

      let replyText: string | null = null;
      const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.5-flash"];

      if (apiKey) {
        for (const model of candidateModels) {
          try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: question }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
              })
            });

            if (res.ok) {
              const data = await res.json();
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text && text.trim()) {
                replyText = text.trim();
                break;
              }
            }
          } catch (genErr) {
            console.error(`[Company AI] Call failed for ${model}:`, genErr);
          }
        }
      }

      // Smart Fallback if API key is not configured or network call failed
      if (!replyText) {
        replyText = `Halo ${user.name} (${user.role})! Panca AI Assistant menerima pertanyaan Anda: "${question}".\n\n` +
          `Ringkasan Sistem Perusahaan (${this.settings.botName}):\n` +
          `${companyDataContext}\n` +
          `Tim Customer Service dan Admin akan mengonfirmasi detail pertanyaan Anda secara langsung. Ada yang bisa kami bantu lagi?`;
      }

      // Send response via WhatsApp socket
      if (this.socket && this.connectionState === "connected") {
        await this.socket.sendMessage(remoteJid, { text: replyText });
      }

      // Record in logs
      this.settings.logs.unshift({
        id: "log-" + Date.now(),
        timestamp: Date.now(),
        phone: user.phone,
        userName: user.name,
        userRole: user.role,
        question,
        answer: replyText
      });
      if (this.settings.logs.length > 50) this.settings.logs.pop();
      this.saveSettings({});
    } catch (err) {
      console.error("Error in processCompanyAIQuery:", err);
    }
  }

  public async disconnectSession() {
    if (this.socket) {
      try {
        await this.socket.logout();
      } catch (e) {}
      this.socket = null;
    }
    this.connectionState = "disconnected";
    this.userJid = null;
    this.userPhone = null;
    this.userName = null;
    this.qrCodeBase64 = null;

    try {
      if (fs.existsSync(COMPANY_SESSION_DIR)) {
        fs.rmSync(COMPANY_SESSION_DIR, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

export const companyAIService = new CompanyAIService();
