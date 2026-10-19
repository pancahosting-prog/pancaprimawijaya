import express from "express";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { supabaseServer } from "./supabaseServer.ts";

// File storage paths for WA state
const SESSION_DIR = path.resolve("./wa-session");
const SETTINGS_FILE = path.resolve("./wa-ai-settings.json");
const CHATS_FILE = path.resolve("./wa-chats.json");
const CONNECTED_NUMBERS_FILE = path.resolve("./wa-connected-numbers.json");

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
  connectedPhone?: string; // Nomor terhubung pemilik sesi chat
}

export interface WAKBProduct {
  id: string;
  productName: string;
  description: string;
  price: string;
  keywords: string[];
  faq: { q: string; a: string }[];
}

export interface WAKBTextSnippet {
  id: string;
  title: string;
  category: string; // "Profil Perusahaan" | "Kebijakan & S&K" | "Prosedur Pemesanan" | "Rekening & Pembayaran" | "Garansi & Retur" | "Lainnya"
  content: string;
  keywords: string[];
  updatedAt?: number;
}

export interface WAKBWebSource {
  id: string;
  url: string;
  title: string;
  summary: string;
  isActive: boolean;
  updatedAt?: number;
}

export interface WAIHandoverConfig {
  enabled: boolean;
  triggerKeywords: string[];
  handoverContact: string;
  handoverMessage: string;
}

export interface WAISalesCtaConfig {
  enabled: boolean;
  ctaMessage: string;
  triggerKeywords: string[];
}

export interface WAISettings {
  autoReplyEnabled: boolean;
  botName: string;
  systemInstructions: string;
  toneOfVoice: string;
  responseLanguage: string;
  greetingMessage: string;
  fallbackMessage: string;
  restrictedTopics: string[];
  handoverToHuman: WAIHandoverConfig;
  salesCta: WAISalesCtaConfig;

  // Separated Knowledge Containers
  knowledgeProducts: WAKBProduct[];
  knowledgeSnippets: WAKBTextSnippet[]; // Paragraf biasa yang diinput user
  knowledgeWebSources: WAKBWebSource[]; // Source website

  // Backward compatibility
  knowledgeBase?: WAKBProduct[];
  tone?: string;

  logs: {
    id: string;
    timestamp: number;
    sender: string;
    incoming: string;
    reply: string;
    modelUsed: string;
    isHandover?: boolean;
    isRestricted?: boolean;
  }[];
}

class WAService {
  private socket: any = null;
  public qrCodeBase64: string | null = null;
  public qrTimestamp: number = 0;
  public qrVersion: number = 0;
  public qrExpired: boolean = false;
  public connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  public userJid: string | null = null;
  public userPhone: string | null = null;
  public userName: string | null = null;

  public isQRExpired(): boolean {
    if (this.connectionState === "connected") return false;
    if (!this.qrCodeBase64) return true;
    // Beri batas waktu realistis 60 detik bagi pengguna untuk membuka WA HP, membuka Perangkat Tertaut, dan men-scan barcode
    return (Date.now() - this.qrTimestamp) > 60000;
  }

  // Chats organized by connected phone number: Map<connectedPhone, Map<jid, WAChat>>
  private chatsByPhone: Map<string, Map<string, WAChat>> = new Map();
  private knownConnectedPhones: Set<string> = new Set();

  public aiSettings: WAISettings = {
    autoReplyEnabled: true,
    botName: "Customer Assistant AI",
    systemInstructions: "Anda adalah asisten AI customer service resmi PT. Panca Prima Wijaya di WhatsApp. Tugas utama Anda adalah melayani pertanyaan pelanggan seputar produk, penawaran harga, prosedur pemesanan, dan informasi perusahaan secara ramah, ringkas, sopan, dan solutif.",
    toneOfVoice: "Ramah & Solutif",
    tone: "Ramah & Solutif",
    responseLanguage: "Bahasa Indonesia",
    greetingMessage: "Halo! Terima kasih telah menghubungi PT. Panca Prima Wijaya. Ada yang bisa kami bantu terkait produk dan layanan kami?",
    fallbackMessage: "Mohon maaf, pesan Anda telah kami catat. Tim sales dan customer service kami akan segera menghubungi Anda kembali untuk memberikan informasi lebih detail.",
    restrictedTopics: [
      "Isu SARA, politik, dan konten sensitif",
      "Perbandingan atau menjelekkan kompetitor",
      "Membocorkan harga modal internal atau rahasia supplier",
      "Menjanjikan diskon khusus tanpa persetujuan tim sales"
    ],
    handoverToHuman: {
      enabled: true,
      triggerKeywords: ["bicara dengan manusia", "hubungi sales", "komplain", "bicara cs", "customer service", "mau telpon", "bisa bicara sales"],
      handoverContact: "0811-1234-5678",
      handoverMessage: "Baik Bapak/Ibu, pertanyaan/kendala Anda telah kami teruskan langsung ke Sales & CS Specialist kami di nomor {contact}. Tim kami akan segera merespon secara langsung."
    },
    salesCta: {
      enabled: true,
      ctaMessage: "Apakah Bapak/Ibu ingin kami buatkan penawaran harga resmi (Quotation) untuk kebutuhan ini?",
      triggerKeywords: ["harga", "pesan", "order", "quotation", "penawaran", "katalog", "stok", "beli"]
    },
    knowledgeProducts: [
      {
        id: "kb-prod-1",
        productName: "Layanan Produk & Transaksi Panca",
        description: "Layanan pengadaan produk, penawaran harga, dan pemesanan barang resmi PT. Panca Prima Wijaya.",
        price: "Hubungi Sales",
        keywords: ["produk", "harga", "transaksi", "penawaran", "stok", "order"],
        faq: [
          { q: "Bagaimana cara melakukan pemesanan?", a: "Pemesanan dapat dilakukan langsung melalui tim sales atau melalui quotation penawaran resmi kami." },
          { q: "Apakah tersedia faktur pajak?", a: "Ya, kami menerbitkan faktur pajak resmi untuk setiap transaksi ber-PPN." }
        ]
      }
    ],
    knowledgeSnippets: [
      {
        id: "kb-snip-1",
        title: "Profil & Jam Operasional Perusahaan",
        category: "Profil Perusahaan",
        content: "PT. Panca Prima Wijaya beroperasi setiap hari Senin hingga Jumat pukul 08:30 - 17:00 WIB, dan Sabtu pukul 08:30 - 13:00 WIB. Hari Minggu dan libur nasional operasional kantor tutup, namun pesan yang masuk akan segera diproses di hari kerja berikutnya.",
        keywords: ["jam kerja", "operasional", "buka", "tutup", "profil", "alamat", "kantor"]
      },
      {
        id: "kb-snip-2",
        title: "Prosedur Pembayaran & Rekening Bank Resmi",
        category: "Rekening & Pembayaran",
        content: "Seluruh pembayaran transaksi resmi PT. Panca Prima Wijaya hanya dilakukan melalui transfer rekening bank perusahaan resmi atas nama PT. Panca Prima Wijaya (BCA / Mandiri). Kami tidak pernah meminta transfer ke rekening atas nama perorangan/pribadi.",
        keywords: ["rekening", "transfer", "pembayaran", "bca", "mandiri", "bank"]
      }
    ],
    knowledgeWebSources: [
      {
        id: "kb-web-1",
        url: "https://pancaprima.co.id",
        title: "Website Resmi PT. Panca Prima Wijaya",
        summary: "Situs web portal resmi untuk melihat portofolio solusi, sertifikasi resmi, layanan konsultasi teknis, dan informasi kontak kantor pusat serta cabang di Indonesia.",
        isActive: true,
        updatedAt: Date.now()
      }
    ],
    knowledgeBase: [],
    logs: []
  };

  constructor() {
    this.loadSettings();
    this.loadKnownNumbers();
    this.loadAllChats();
  }

  /**
   * Helper to get cleaned phone string for the currently connected phone or fallback
   */
  public getConnectedPhoneKey(overridePhone?: string | null): string {
    if (!overridePhone || overridePhone === "active") {
      const raw = this.userPhone || "default";
      return raw.replace(/[^a-zA-Z0-9]/g, "");
    }
    return overridePhone.replace(/[^a-zA-Z0-9]/g, "");
  }

  private loadKnownNumbers() {
    try {
      if (fs.existsSync(CONNECTED_NUMBERS_FILE)) {
        const raw = fs.readFileSync(CONNECTED_NUMBERS_FILE, "utf-8");
        const list: string[] = JSON.parse(raw);
        list.forEach(n => this.knownConnectedPhones.add(n));
      }
    } catch (e) {
      console.error("[waService] Error loading known connected numbers:", e);
    }
  }

  private saveKnownNumbers() {
    try {
      const list = Array.from(this.knownConnectedPhones);
      fs.writeFileSync(CONNECTED_NUMBERS_FILE, JSON.stringify(list, null, 2), "utf-8");
    } catch (e) {
      console.error("[waService] Error saving known connected numbers:", e);
    }
  }

  private getChatFilePath(phone: string): string {
    const clean = phone.replace(/[^a-zA-Z0-9]/g, "");
    return clean === "default" 
      ? CHATS_FILE 
      : path.resolve(`./wa-chats-${clean}.json`);
  }

  private loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        const products = parsed.knowledgeProducts || parsed.knowledgeBase || this.aiSettings.knowledgeProducts;
        this.aiSettings = {
          ...this.aiSettings,
          ...parsed,
          knowledgeProducts: products,
          knowledgeBase: products,
          knowledgeSnippets: parsed.knowledgeSnippets || this.aiSettings.knowledgeSnippets,
          knowledgeWebSources: parsed.knowledgeWebSources || this.aiSettings.knowledgeWebSources,
          restrictedTopics: parsed.restrictedTopics || this.aiSettings.restrictedTopics,
          handoverToHuman: { ...this.aiSettings.handoverToHuman, ...(parsed.handoverToHuman || {}) },
          salesCta: { ...this.aiSettings.salesCta, ...(parsed.salesCta || {}) },
          toneOfVoice: parsed.toneOfVoice || parsed.tone || this.aiSettings.toneOfVoice,
          responseLanguage: parsed.responseLanguage || this.aiSettings.responseLanguage,
          systemInstructions: parsed.systemInstructions || this.aiSettings.systemInstructions
        };
      }
    } catch (e) {
      console.error("[waService] Error loading WA AI settings:", e);
    }
  }

  public saveSettings(newSettings: Partial<WAISettings>) {
    try {
      this.aiSettings = { ...this.aiSettings, ...newSettings };
      if (newSettings.knowledgeProducts) {
        this.aiSettings.knowledgeBase = newSettings.knowledgeProducts;
      }
      if (newSettings.toneOfVoice) {
        this.aiSettings.tone = newSettings.toneOfVoice;
      }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.aiSettings, null, 2), "utf-8");
    } catch (e) {
      console.error("[waService] Error saving WA AI settings:", e);
    }
  }

  /**
   * Loads chats for all known connected numbers from local files & Supabase
   */
  private loadAllChats() {
    // 1. Load default chat file
    this.loadChatsForPhone("default");

    // 2. Load any known numbers
    this.knownConnectedPhones.forEach(phone => {
      this.loadChatsForPhone(phone);
    });

    // 3. Scan directory for existing wa-chats-*.json files
    try {
      const files = fs.readdirSync(path.resolve("."));
      files.forEach(f => {
        if (f.startsWith("wa-chats-") && f.endsWith(".json")) {
          const phone = f.replace("wa-chats-", "").replace(".json", "");
          this.knownConnectedPhones.add(phone);
          this.loadChatsForPhone(phone);
        }
      });
      this.saveKnownNumbers();
    } catch (err) {
      console.error("[waService] Error scanning chat files:", err);
    }

    // 4. Asynchronously pull from Supabase if configured
    this.syncAllChatsFromSupabase().catch(err => {
      console.warn("[waService] Supabase initial chat sync notice:", err.message);
    });
  }

  /**
   * Load chats for a specific connected number
   */
  public loadChatsForPhone(phone: string) {
    const cleanPhone = this.getConnectedPhoneKey(phone);
    const filePath = this.getChatFilePath(cleanPhone);

    let phoneMap = this.chatsByPhone.get(cleanPhone);
    if (!phoneMap) {
      phoneMap = new Map();
      this.chatsByPhone.set(cleanPhone, phoneMap);
    }

    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const list: WAChat[] = JSON.parse(raw);
        list.forEach(c => {
          c.connectedPhone = cleanPhone;
          const cleanInfo = this.sanitizePhoneAndName(c.phone || c.jid || c.id, c.name);
          c.phone = cleanInfo.phone;
          if (cleanInfo.name && cleanInfo.name !== cleanInfo.phone) {
            c.name = cleanInfo.name;
          }
          phoneMap!.set(c.jid || c.id, c);
        });
        if (cleanPhone !== "default") {
          this.knownConnectedPhones.add(cleanPhone);
          this.saveKnownNumbers();
        }
      }
    } catch (e) {
      console.error(`[waService] Error loading chats for phone ${cleanPhone}:`, e);
    }
  }

  /**
   * Saves chats for a given connected phone number to local file and Supabase
   */
  public async saveChatsForPhone(phone?: string, singleChat?: WAChat) {
    const cleanPhone = this.getConnectedPhoneKey(phone);
    const phoneMap = this.chatsByPhone.get(cleanPhone);
    if (!phoneMap) return;

    const list = Array.from(phoneMap.values());
    const filePath = this.getChatFilePath(cleanPhone);

    // Save local file
    try {
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
      if (cleanPhone !== "default") {
        this.knownConnectedPhones.add(cleanPhone);
        this.saveKnownNumbers();
        // Also keep master wa-chats.json updated
        fs.writeFileSync(CHATS_FILE, JSON.stringify(list, null, 2), "utf-8");
      }
    } catch (e) {
      console.error(`[waService] Error writing chats file for ${cleanPhone}:`, e);
    }

    // Sync to Supabase cloud database if available
    if (supabaseServer) {
      try {
        const chatsToSync = singleChat ? [singleChat] : list;
        for (const c of chatsToSync) {
          const cleanJid = c.jid || c.id;
          const assignedUser = (c as any).assignedUser || (cleanPhone === this.getConnectedPhoneKey() ? this.userName : null);
          await supabaseServer.from("wa_chats").upsert({
            id: `${cleanPhone}_${cleanJid}`,
            connected_phone: cleanPhone,
            jid: cleanJid,
            name: c.name || "",
            phone: c.phone || "",
            unread_count: c.unreadCount || 0,
            last_message: c.lastMessage || "",
            last_message_time: c.lastMessageTime || Date.now(),
            messages: c.messages || [],
            assigned_user: assignedUser || null,
            updated_at: new Date().toISOString()
          });
        }
      } catch (dbErr: any) {
        console.warn(`[waService] Supabase cloud sync error for ${cleanPhone}:`, dbErr.message);
      }
    }
  }

  /**
   * Pull all chats from Supabase database to populate local cache
   */
  public async syncAllChatsFromSupabase(filterPhone?: string) {
    if (!supabaseServer) return;

    try {
      let query = supabaseServer.from("wa_chats").select("*").order("last_message_time", { ascending: false });
      if (filterPhone && filterPhone !== "all" && filterPhone !== "active") {
        const clean = this.getConnectedPhoneKey(filterPhone);
        query = query.eq("connected_phone", clean);
      }

      const { data, error } = await query;
      if (error) {
        console.warn("[waService] Supabase fetch error:", error.message);
        return;
      }

      if (data && Array.isArray(data)) {
        for (const row of data) {
          const phone = row.connected_phone || "default";
          let phoneMap = this.chatsByPhone.get(phone);
          if (!phoneMap) {
            phoneMap = new Map();
            this.chatsByPhone.set(phone, phoneMap);
          }

          const cleanInfo = this.sanitizePhoneAndName(row.phone || row.jid, row.name);

          const chatObj: WAChat & { assignedUser?: string } = {
            id: row.jid,
            jid: row.jid,
            name: cleanInfo.name,
            phone: cleanInfo.phone,
            unreadCount: row.unread_count || 0,
            lastMessage: row.last_message || "",
            lastMessageTime: Number(row.last_message_time) || Date.now(),
            messages: Array.isArray(row.messages) ? row.messages : [],
            connectedPhone: phone,
            assignedUser: row.assigned_user || ""
          };

          phoneMap.set(row.jid, chatObj);
          this.knownConnectedPhones.add(phone);
        }
        this.saveKnownNumbers();
        console.log(`[waService] Synced ${data.length} chats from Supabase across known numbers.`);
      }
    } catch (err: any) {
      console.warn("[waService] Error syncing from Supabase:", err.message);
    }
  }

  /**
   * Backward compatible getter for default chats
   */
  public get chats(): Map<string, WAChat> {
    const key = this.getConnectedPhoneKey();
    let map = this.chatsByPhone.get(key);
    if (!map) {
      map = new Map();
      this.chatsByPhone.set(key, map);
    }
    return map;
  }

  public saveChats() {
    this.saveChatsForPhone(this.getConnectedPhoneKey());
  }

  /**
   * Delete a chat by JID for a specific connected number or across all phone maps
   */
  public async deleteChat(jid: string, connectedPhone?: string) {
    const cleanPhone = this.getConnectedPhoneKey(connectedPhone);
    
    // Remove from in-memory maps
    if (connectedPhone && connectedPhone !== "all") {
      const phoneMap = this.chatsByPhone.get(cleanPhone);
      if (phoneMap) {
        phoneMap.delete(jid);
      }
      this.saveChatsForPhone(cleanPhone);
    } else {
      // Remove across all phone maps
      this.chatsByPhone.forEach((phoneMap, phoneKey) => {
        if (phoneMap.has(jid)) {
          phoneMap.delete(jid);
          this.saveChatsForPhone(phoneKey);
        }
      });
    }

    // Delete from Supabase Cloud Database
    if (supabaseServer) {
      try {
        if (connectedPhone && connectedPhone !== "all") {
          await supabaseServer
            .from("wa_chats")
            .delete()
            .eq("connected_phone", cleanPhone)
            .eq("jid", jid);
        } else {
          await supabaseServer
            .from("wa_chats")
            .delete()
            .eq("jid", jid);
        }
      } catch (err: any) {
        console.warn("[waService] Supabase delete error:", err.message);
      }
    }
  }

  /**
   * Get chats for a specific connected number or current active session or all numbers
   */
  public getChats(connectedPhone?: string): WAChat[] {
    if (connectedPhone === "all") {
      const allChatsMap = new Map<string, WAChat>();
      this.chatsByPhone.forEach((phoneMap) => {
        phoneMap.forEach((chat) => {
          const existing = allChatsMap.get(chat.jid);
          if (!existing || chat.lastMessageTime > existing.lastMessageTime) {
            allChatsMap.set(chat.jid, chat);
          }
        });
      });
      return Array.from(allChatsMap.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    }

    const key = this.getConnectedPhoneKey(connectedPhone);
    let map = this.chatsByPhone.get(key);

    if ((!map || map.size === 0) && key !== "default") {
      // If requested phone has no chats yet, check default
      const defaultMap = this.chatsByPhone.get("default");
      if (defaultMap && defaultMap.size > 0) {
        return Array.from(defaultMap.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
      }
    }

    if (!map) return [];
    return Array.from(map.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  }

  /**
   * Returns metadata of all known connected numbers with chat counts and assigned user info
   */
  public getKnownNumbers(): { phone: string; active: boolean; chatCount: number; assignedUser?: string; lastActive?: number }[] {
    const activeClean = this.userPhone ? this.getConnectedPhoneKey(this.userPhone) : null;
    const allPhones = new Set<string>(this.knownConnectedPhones);
    if (activeClean && activeClean !== "default") allPhones.add(activeClean);
    allPhones.delete("default");

    return Array.from(allPhones)
      .filter(phone => phone && phone !== "default")
      .map(phone => {
        const map = this.chatsByPhone.get(phone);
        const chatCount = map ? map.size : 0;
        let assignedUser = "";
        let lastActive = 0;
        if (map && map.size > 0) {
          const firstChat = Array.from(map.values())[0];
          assignedUser = (firstChat as any).assignedUser || "";
          lastActive = Math.max(...Array.from(map.values()).map(c => c.lastMessageTime || 0));
        }

        return {
          phone,
          active: Boolean(activeClean && phone === activeClean),
          chatCount,
          assignedUser: assignedUser || (phone === activeClean ? (this.userName || "User WA") : ""),
          lastActive: lastActive || Date.now()
        };
      });
  }

  /**
   * Clears all stored WA chat data and connected numbers from memory, files, and Supabase
   */
  public async clearAllData() {
    this.chatsByPhone.clear();
    this.knownConnectedPhones.clear();

    try {
      const files = fs.readdirSync(path.resolve("."));
      files.forEach(f => {
        if ((f.startsWith("wa-chats") || f.startsWith("wa-connected-numbers")) && f.endsWith(".json")) {
          try {
            fs.unlinkSync(path.resolve(".", f));
          } catch (e) {}
        }
      });
    } catch (err) {
      console.error("[waService] Error clearing local JSON files:", err);
    }

    if (supabaseServer) {
      try {
        await supabaseServer.from("wa_chats").delete().neq("id", "none");
      } catch (dbErr: any) {
        console.warn("[waService] Supabase clear error:", dbErr.message);
      }
    }

    console.log("[waService] All WhatsApp chats and connected numbers cleared.");
  }

  /**
   * Helper to format raw JID or LID strings into clean Indonesian phone numbers (08...)
   */
  public sanitizePhoneAndName(jidOrPhone?: string, name?: string, altJid?: string, pushName?: string): { phone: string; name: string } {
    let target = jidOrPhone || "";
    if (target.endsWith("@lid") && altJid && altJid.endsWith("@s.whatsapp.net")) {
      target = altJid;
    }

    const rawDigits = target.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");

    if (rawDigits && !target.endsWith("@lid") && rawDigits.length >= 8 && rawDigits.length <= 15) {
      let formattedPhone = rawDigits;
      if (formattedPhone.startsWith("62")) {
        formattedPhone = "0" + formattedPhone.slice(2);
      } else if (!formattedPhone.startsWith("0")) {
        formattedPhone = "0" + formattedPhone;
      }

      const displayName = (name && !name.includes("@lid") && !name.includes("@s.whatsapp.net")) 
        ? name 
        : (pushName && !pushName.includes("@lid") ? pushName : formattedPhone);

      return { phone: formattedPhone, name: displayName };
    }

    const fallbackName = (name && !name.includes("@lid") && !name.includes("@s.whatsapp.net"))
      ? name
      : (pushName && !pushName.includes("@lid") ? pushName : "Pengguna WhatsApp");

    return { phone: fallbackName, name: fallbackName };
  }

  public async initBaileys(force = false) {
    if (!force && this.connectionState === "connected") {
      return;
    }

    if (!force && this.connectionState === "connecting" && this.socket && !this.isQRExpired()) {
      return;
    }

    // Clean up previous socket if forcing reinit or if previous session was expired
    if (this.socket) {
      try {
        this.socket.ev?.removeAllListeners?.();
        this.socket.end?.();
      } catch (e) {}
      this.socket = null;
    }

    this.connectionState = "connecting";
    this.qrExpired = false;

    try {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const useMultiFileAuthState = baileys.useMultiFileAuthState;
      const DisconnectReason = baileys.DisconnectReason;

      const pino = (await import("pino")).default;
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
      const Browsers = baileys.Browsers || (baileys as any).default?.Browsers;

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
        browser: Browsers ? Browsers.ubuntu("Chrome") : ["Ubuntu", "Chrome", "20.0.04"],
        keepAliveIntervalMs: 25000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 2000
      });

      this.socket.ev.on("creds.update", saveCreds);

      this.socket.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCodeBase64 = await QRCode.toDataURL(qr);
          this.qrTimestamp = Date.now();
          this.qrVersion = (this.qrVersion || 0) + 1;
          this.qrExpired = false;
          this.connectionState = "connecting";
          console.log(`[waService] QR Code refreshed (version ${this.qrVersion}) at ${new Date().toLocaleTimeString()}`);
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;

          console.log(`[waService] Koneksi tertutup. Status: ${statusCode}, isLoggedOut: ${isLoggedOut}, isRestartRequired: ${isRestartRequired}`);

          try {
            this.socket?.ev?.removeAllListeners?.();
          } catch (e) {}
          this.socket = null;

          if (isLoggedOut) {
            console.log("[waService] Sesi WhatsApp logout (401). Menghapus kredensial sesi.");
            this.connectionState = "disconnected";
            this.qrCodeBase64 = null;
            this.qrExpired = true;
            this.userPhone = null;
            this.userJid = null;
            try {
              fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            } catch (err) {}
          } else if (isRestartRequired || statusCode === 428 || (statusCode && statusCode !== 408 && statusCode !== 401 && !this.userPhone)) {
            // KRUSIAL: Saat HP melakukan scan QR barcode, WhatsApp mengirim sinyal restartRequired (515)
            // untuk beralih dari soket QR sementara ke soket terotentikasi penuh.
            // JANGAN DITANDAI EXPIRED! Harus segera initBaileys(false) agar proses masuk (login) selesai!
            console.log(`[waService] Scan handshake berhasil diterima (status: ${statusCode}). Melanjutkan proses masuk...`);
            this.connectionState = "connecting";
            this.qrExpired = false;
            setTimeout(() => this.initBaileys(false), 1000);
          } else if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
            if (!this.userPhone) {
              // Server WhatsApp menutup soket karena barcode tidak di-scan setelah beberapa putaran
              this.qrExpired = true;
              this.connectionState = "disconnected";
              console.log(`[waService] Barcode tidak di-scan sampai timeout (${statusCode}). Meminta muat ulang.`);
            } else {
              this.connectionState = "connecting";
              setTimeout(() => this.initBaileys(false), 3000);
            }
          } else {
            // Putus koneksi sementara -> auto reconnect
            console.log(`[waService] Putus koneksi sementara (status: ${statusCode}). Menyambungkan kembali...`);
            this.connectionState = "connecting";
            setTimeout(() => this.initBaileys(false), 2000);
          }
        } else if (connection === "open") {
          this.connectionState = "connected";
          this.qrCodeBase64 = null;
          this.qrExpired = false;
          const user = this.socket?.user;
          this.userJid = user?.id || null;
          
          let rawConnectedPhone = "";
          if (user?.id) {
            const cleanId = user.id.split(":")[0].split("@")[0];
            if (!user.id.includes("@lid") || cleanId.length <= 13) {
              rawConnectedPhone = cleanId.replace(/[^0-9]/g, "");
            }
          }
          if (!rawConnectedPhone && (user as any)?.phone) {
            rawConnectedPhone = String((user as any).phone).replace(/[^0-9]/g, "");
          }
          let cleanPhoneNum = rawConnectedPhone || (user?.id ? user.id.split(":")[0].replace(/[^0-9]/g, "") : null);
          if (cleanPhoneNum && cleanPhoneNum.startsWith("62")) {
            cleanPhoneNum = "0" + cleanPhoneNum.slice(2);
          }
          this.userPhone = cleanPhoneNum;
          this.userName = user?.name || "WhatsApp Business Bot";

          console.log(`[waService] WhatsApp Connected! Nomor Terhubung: ${this.userPhone}`);
          if (this.userPhone) {
            const clean = this.getConnectedPhoneKey(this.userPhone);
            this.knownConnectedPhones.add(clean);
            this.saveKnownNumbers();
            this.loadChatsForPhone(clean);
            this.syncAllChatsFromSupabase(clean);
          }
        }
      });

      this.socket.ev.on("messages.upsert", async (m: any) => {
        if (!m.messages || !m.messages.length) return;
        if (m.type !== "notify" && m.type !== "append") return;

        for (const msg of m.messages) {
          if (!msg.message) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

          // Unwrap modern WhatsApp messages (ephemeral, viewOnce, documentWithCaption)
          let messageContent = msg.message;
          if (messageContent.ephemeralMessage?.message) {
            messageContent = messageContent.ephemeralMessage.message;
          }
          if (messageContent.viewOnceMessage?.message) {
            messageContent = messageContent.viewOnceMessage.message;
          }
          if (messageContent.viewOnceMessageV2?.message) {
            messageContent = messageContent.viewOnceMessageV2.message;
          }
          if (messageContent.documentWithCaptionMessage?.message) {
            messageContent = messageContent.documentWithCaptionMessage.message;
          }

          let text = messageContent.conversation || 
                     messageContent.extendedTextMessage?.text || 
                     "";
          let incomingMedia: WAChatMedia | undefined = undefined;

          if (messageContent.imageMessage) {
            text = messageContent.imageMessage.caption || "📷 [Foto]";
            incomingMedia = {
              type: "image",
              mimetype: messageContent.imageMessage.mimetype || "image/jpeg"
            };
          } else if (messageContent.documentMessage) {
            const fileName = messageContent.documentMessage.fileName || "Dokumen";
            text = messageContent.documentMessage.caption || `📄 [${fileName}]`;
            incomingMedia = {
              type: "document",
              fileName,
              mimetype: messageContent.documentMessage.mimetype || "application/octet-stream"
            };
          } else if (messageContent.videoMessage) {
            text = messageContent.videoMessage.caption || "🎥 [Video]";
            incomingMedia = {
              type: "video",
              mimetype: messageContent.videoMessage.mimetype || "video/mp4"
            };
          } else if (messageContent.audioMessage) {
            text = "🎵 [Pesan Suara]";
            incomingMedia = {
              type: "audio",
              mimetype: messageContent.audioMessage.mimetype || "audio/ogg"
            };
          }

          if (!text && !incomingMedia) continue;

          const isFromMe = Boolean(msg.key.fromMe);

          // Extract real phone number when WhatsApp sends LID JID
          const altJid = msg.key?.remoteJidAlt || msg.key?.participant || msg.participant;
          const cleanInfo = this.sanitizePhoneAndName(remoteJid, undefined, altJid, msg.pushName);
          const senderName = isFromMe 
            ? (this.userName || "Anda") 
            : (cleanInfo.name || msg.pushName || cleanInfo.phone || "Pengguna WhatsApp");

          const connectedPhone = this.getConnectedPhoneKey();
          let phoneMap = this.chatsByPhone.get(connectedPhone);
          if (!phoneMap) {
            phoneMap = new Map();
            this.chatsByPhone.set(connectedPhone, phoneMap);
          }

          let chat = phoneMap.get(remoteJid);
          if (!chat && altJid) {
            chat = phoneMap.get(altJid);
          }

          if (!chat) {
            chat = {
              id: remoteJid,
              jid: remoteJid,
              name: isFromMe ? cleanInfo.name : senderName,
              phone: cleanInfo.phone,
              unreadCount: 0,
              lastMessage: text,
              lastMessageTime: Date.now(),
              messages: [],
              connectedPhone
            };
            phoneMap.set(remoteJid, chat);
          } else {
            chat.phone = cleanInfo.phone;
            if (!isFromMe && senderName && senderName !== cleanInfo.phone) {
              chat.name = senderName;
            }
          }

          const newMsg: WAChatMessage = {
            id: msg.key.id || "msg-" + Date.now(),
            fromMe: isFromMe,
            sender: isFromMe ? "me" : remoteJid,
            senderName,
            text,
            timestamp: Date.now(),
            status: isFromMe ? "read" : "unread",
            media: incomingMedia
          };

          chat.messages.push(newMsg);
          chat.lastMessage = text;
          chat.lastMessageTime = Date.now();
          if (!isFromMe) chat.unreadCount += 1;

          console.log(`[waService] Pesan baru (${isFromMe ? 'Keluar' : 'Masuk'}) dari ${remoteJid}: "${text}"`);

          // Save to local file & Supabase for this connected phone
          this.saveChatsForPhone(connectedPhone, chat);

          // Auto reply AI logic: hanya balas jika pesan masuk bukan dari diri sendiri dan bot aktif
          if (!isFromMe && this.aiSettings.autoReplyEnabled) {
            this.handleAIAutoReply(remoteJid, senderName, text);
          }
        }
      });
    } catch (err) {
      console.error("[waService] Failed to initialize Baileys:", err);
      this.connectionState = "disconnected";
      QRCode.toDataURL("https://mypanca-crm.app/wa-connect-" + Date.now()).then(qr => {
        this.qrCodeBase64 = qr;
      });
    }
  }

  public async generateAIResponse(senderName: string, userMessage: string): Promise<{
    replyText: string;
    modelUsed: string;
    isHandover: boolean;
    isRestricted: boolean;
    containerMatched: 'products' | 'snippets' | 'websites' | 'guardrail' | 'handover' | 'greeting' | 'fallback';
  }> {
    const msgLower = userMessage.toLowerCase().trim();
    let replyText = "";
    let modelUsed = "Basis Pengetahuan & Aturan Cerdas";
    let isHandover = false;
    let isRestricted = false;
    let containerMatched: 'products' | 'snippets' | 'websites' | 'guardrail' | 'handover' | 'greeting' | 'fallback' = 'fallback';

    // 1. CEK TOPIK TERLARANG (RESTRICTED TOPICS)
    const restrictedList = this.aiSettings.restrictedTopics || [];
    for (const topic of restrictedList) {
      if (!topic.trim()) continue;
      const topicLower = topic.toLowerCase();
      const topicTerms = topicLower
        .split(/[,|;/]+|\b(?:atau|dan)\b/)
        .map(t => t.trim().replace(/^(?:isu|membocorkan|menjanjikan|perbandingan|konten|rahasia)\s+/i, '').trim())
        .filter(t => t.length >= 3);

      const hit = topicTerms.some(term => msgLower.includes(term)) ||
        (topicLower.includes("modal") && (msgLower.includes("modal") || msgLower.includes("harga modal"))) ||
        (topicLower.includes("sara") && msgLower.includes("sara")) ||
        (topicLower.includes("politik") && msgLower.includes("politik")) ||
        (topicLower.includes("kompetitor") && (msgLower.includes("kompetitor") || msgLower.includes("pesaing")));

      if (hit) {
        isRestricted = true;
        modelUsed = "Guardrail (Topik Terlarang)";
        containerMatched = 'guardrail';
        replyText = `Mohon maaf ${senderName}, kami tidak dapat memberikan tanggapan terkait topik tersebut demi mematuhi kebijakan dan etika layanan resmi kami. Silakan tanyakan hal lain seputar informasi produk, penawaran harga, atau layanan PT. Panca Prima Wijaya.`;
        break;
      }
    }

    // 2. CEK PENGALIHAN KE AGEN MANUSIA (HANDOVER TO HUMAN)
    if (!replyText && this.aiSettings.handoverToHuman?.enabled) {
      const triggers = this.aiSettings.handoverToHuman.triggerKeywords || [];
      const isHandoverTriggered = triggers.some(trg => trg.trim() && msgLower.includes(trg.trim().toLowerCase()));
      if (isHandoverTriggered) {
        isHandover = true;
        modelUsed = "Handover CS / Sales Manusia";
        containerMatched = 'handover';
        const contact = this.aiSettings.handoverToHuman.handoverContact || "0811-1234-5678";
        const template = this.aiSettings.handoverToHuman.handoverMessage || 
          "Baik Bapak/Ibu {name}, percakapan Anda kami teruskan langsung ke Sales & CS Specialist kami di nomor {contact}. Tim kami akan segera merespon secara langsung.";
        replyText = template
          .replace(/{contact}/g, contact)
          .replace(/{name}/g, senderName);
      }
    }

    // 3. JIKA BUKAN TOPIK TERLARANG & BUKAN HANDOVER, RANGKAI SEMUA KONTEN KNOWLEDGE BASE (3 KONTAINER)
    if (!replyText) {
      // Kontainer 1: Produk & Layanan
      const products = this.aiSettings.knowledgeProducts?.length 
        ? this.aiSettings.knowledgeProducts 
        : (this.aiSettings.knowledgeBase || []);
      
      const productsText = products.map((p, idx) => {
        let str = `[PRODUK #${idx + 1}] ${p.productName}\nHarga: ${p.price}\nDeskripsi: ${p.description}\nKata Kunci: ${(p.keywords || []).join(', ')}`;
        if (p.faq && p.faq.length > 0) {
          str += `\nFAQ Produk:\n` + p.faq.map(f => `  • Tanya: ${f.q}\n    Jawab: ${f.a}`).join('\n');
        }
        return str;
      }).join('\n\n');

      // Kontainer 2: Paragraf Biasa / Catatan Dokumen Bebas yang Diinput User
      const snippets = this.aiSettings.knowledgeSnippets || [];
      const snippetsText = snippets.map((s, idx) => 
        `[DOKUMEN/CATATAN #${idx + 1}: ${s.title} (Kategori: ${s.category || 'Umum'})]\n${s.content}\nKata Kunci Terkait: ${(s.keywords || []).join(', ')}`
      ).join('\n\n');

      // Kontainer 3: Sumber Website Resmi
      const webSources = (this.aiSettings.knowledgeWebSources || []).filter(w => w.isActive);
      const webText = webSources.map((w, idx) => 
        `[SUMBER WEBSITE #${idx + 1}: ${w.title} (${w.url})]\nRingkasan Informasi: ${w.summary}`
      ).join('\n\n');

      // Setup Prompt & AI Instructions
      const tone = this.aiSettings.toneOfVoice || this.aiSettings.tone || "Ramah & Solutif";
      const lang = this.aiSettings.responseLanguage || "Bahasa Indonesia";
      const sysInstructions = this.aiSettings.systemInstructions || 
        "Anda adalah asisten AI customer service resmi PT. Panca Prima Wijaya di WhatsApp. Jawablah pertanyaan pelanggan secara ramah, ringkas, sopan, dan akurat.";
      const ctaRule = this.aiSettings.salesCta?.enabled 
        ? `\nSALES CALL-TO-ACTION (CTA):\nJika pelanggan menanyakan harga, pemesanan, atau berminat dengan produk, sertakan ajakan bertindak yang halus di akhir jawaban: "${this.aiSettings.salesCta.ctaMessage}"` 
        : "";

      const fullSystemPrompt = `${sysInstructions}

PANDUAN GAYA BAHASA & RESPON:
- Gaya Bahasa / Tone of Voice: ${tone}
- Bahasa Respon: ${lang}
- Pesan Fallback jika tidak yakin: "${this.aiSettings.fallbackMessage}"${ctaRule}

=== KONTAINER BASIS PENGETAHUAN PERUSAHAAN ===
--- 1. KATEGORI PRODUK & LAYANAN ---
${productsText || "Belum ada produk yang didaftarkan."}

--- 2. DOKUMEN & PARAGRAF PERUSAHAAN (SOP, ALAMAT, REKENING, PROSEDUR) ---
${snippetsText || "Belum ada dokumen teks tambahan."}

--- 3. SUMBER RESMI WEBSITE ---
${webText || "Belum ada tautan website resmi."}

=== ATURAN KERJA ===
1. Jawab pertanyaan pelanggan (${senderName}) hanya berdasarkan fakta di atas.
2. Jangan pernah mengarang data teknis, harga, atau nomor rekening di luar dokumen resmi.
3. Buat jawaban padat, nyaman dibaca di layar chat WhatsApp (gunakan bullet point bila ada beberapa poin).`;

      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        // Coba model resmi gemini-3.8-flash, lalu fallback ke gemini-2.5-flash
        const modelCandidates = ["gemini-3.8-flash", "gemini-2.5-flash"];
        for (const candidate of modelCandidates) {
          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userMessage }] }],
                systemInstruction: { parts: [{ text: fullSystemPrompt }] },
                generationConfig: { temperature: 0.3, maxOutputTokens: 350 }
              })
            });

            if (res.ok) {
              const data = await res.json();
              const genText = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (genText) {
                replyText = genText.trim();
                modelUsed = `Gemini AI (${candidate})`;
                // Determine container matched based on content keywords
                if (products.some(p => msgLower.includes(p.productName.toLowerCase()) || (p.keywords || []).some(k => k && msgLower.includes(k.toLowerCase())))) {
                  containerMatched = 'products';
                } else if (snippets.some(s => msgLower.includes(s.title.toLowerCase()) || (s.keywords || []).some(k => k && msgLower.includes(k.toLowerCase())))) {
                  containerMatched = 'snippets';
                } else if (webSources.some(w => msgLower.includes(w.title.toLowerCase()) || msgLower.includes('web') || msgLower.includes('situs'))) {
                  containerMatched = 'websites';
                }
                break;
              }
            } else {
              console.warn(`[waService] Gemini API (${candidate}) returned status ${res.status}`);
            }
          } catch (genErr) {
            console.warn(`[waService] Gemini API (${candidate}) call error:`, genErr);
          }
        }
      }

      // 4. ATURAN CERDAS LOKAL (FALLBACK JIKA GEMINI LIMIT 429 ATAU OFFLINE)
      if (!replyText) {
        let matched = false;

        // Cek Pencocokan Produk
        for (const p of products) {
          const keywords = (p.keywords || []).map(k => k.toLowerCase());
          if (keywords.some(kw => kw && msgLower.includes(kw)) || msgLower.includes(p.productName.toLowerCase())) {
            replyText = `Halo ${senderName}! Terkait *${p.productName}*:\n${p.description}\n\n💰 *Harga:* ${p.price}`;
            if (p.faq && p.faq.length > 0) {
              replyText += `\n\n*FAQ Terkait:*\n` + p.faq.slice(0, 2).map(f => `• _${f.q}_\n  ${f.a}`).join('\n');
            }
            matched = true;
            containerMatched = 'products';
            break;
          }
        }

        // Cek Pencocokan Paragraf Biasa / Catatan Teks (SOP, Alamat, Rekening, dll)
        if (!matched) {
          for (const s of snippets) {
            const keywords = (s.keywords || []).map(k => k.toLowerCase());
            const titleLower = s.title.toLowerCase();
            const catLower = (s.category || '').toLowerCase();
            if (
              keywords.some(kw => kw && msgLower.includes(kw)) || 
              msgLower.includes(titleLower) ||
              (catLower && msgLower.includes(catLower)) ||
              (titleLower.includes("rekening") && (msgLower.includes("rekening") || msgLower.includes("transfer") || msgLower.includes("bank") || msgLower.includes("bca") || msgLower.includes("mandiri"))) ||
              (titleLower.includes("operasional") && (msgLower.includes("jam") || msgLower.includes("buka") || msgLower.includes("tutup") || msgLower.includes("operasional") || msgLower.includes("libur"))) ||
              (titleLower.includes("pemesanan") && (msgLower.includes("faktur") || msgLower.includes("ppn") || msgLower.includes("pajak") || msgLower.includes("surat jalan")))
            ) {
              replyText = `Halo ${senderName}! Terkait *${s.title}*:\n\n${s.content}`;
              matched = true;
              containerMatched = 'snippets';
              break;
            }
          }
        }

        // Cek Pencocokan Sumber Website
        if (!matched) {
          for (const w of webSources) {
            const titleLower = w.title.toLowerCase();
            if (
              msgLower.includes("website") || msgLower.includes("link") || 
              msgLower.includes("situs") || msgLower.includes("web") || 
              msgLower.includes("portal") || msgLower.includes("katalog") ||
              msgLower.includes(titleLower)
            ) {
              replyText = `Halo ${senderName}! Informasi resmi dapat Anda lihat melalui website kami:\n🔗 *${w.title}*\n${w.url}\n\n${w.summary}`;
              matched = true;
              containerMatched = 'websites';
              break;
            }
          }
        }

        // Tambahkan Sales CTA jika berkaitan dengan pembelian/harga
        if (matched && this.aiSettings.salesCta?.enabled) {
          const ctaKeywords = (this.aiSettings.salesCta.triggerKeywords || ["harga", "pesan", "order", "beli"]).map(k => k.toLowerCase());
          if (ctaKeywords.some(kw => msgLower.includes(kw))) {
            replyText += `\n\n📌 _${this.aiSettings.salesCta.ctaMessage}_`;
          }
        }

        // Respon Salam
        if (!matched) {
          if (/halo|hai|hi|pagi|siang|sore|malam|assalam|permisi|selamat/i.test(msgLower)) {
            replyText = `Halo ${senderName}! ` + this.aiSettings.greetingMessage;
            containerMatched = 'greeting';
          } else {
            replyText = this.aiSettings.fallbackMessage || 
              `Halo ${senderName}! Terima kasih telah menghubungi PT. Panca Prima Wijaya. Pesan Anda telah kami terima dan tim kami akan segera menghubungi Anda kembali.`;
            containerMatched = 'fallback';
          }
        }
      }
    }

    return {
      replyText,
      modelUsed,
      isHandover,
      isRestricted,
      containerMatched
    };
  }

  public async simulateAIAutoReply(userMessage: string, senderName: string = "Calon Pelanggan") {
    return this.generateAIResponse(senderName, userMessage);
  }

  public async handleAIAutoReply(jid: string, senderName: string, userMessage: string) {
    try {
      const result = await this.generateAIResponse(senderName, userMessage);
      const { replyText, modelUsed, isHandover, isRestricted } = result;

      console.log(`[waService] Menyiapkan auto-reply untuk ${jid} via model [${modelUsed}]: "${replyText}"`);

      // 5. KIRIM PESAN KE WHATSAPP JIKA SOKET TERHUBUNG
      if (this.socket && this.connectionState === "connected") {
        await this.socket.sendMessage(jid, { text: replyText });
        console.log(`[waService] Berhasil mengirim auto-reply ke WhatsApp ${jid}`);
      } else {
        console.warn(`[waService] Soket WhatsApp tidak dalam status connected, tidak dapat mengirim auto-reply`);
      }

      // 6. SIMPAN BALASAN KE RIWAYAT CHAT LOKAL & SUPABASE
      const connectedPhone = this.getConnectedPhoneKey();
      let phoneMap = this.chatsByPhone.get(connectedPhone);
      if (phoneMap) {
        let chat = phoneMap.get(jid);
        if (!chat) {
          chat = Array.from(phoneMap.values()).find(c => c.jid === jid || c.id === jid);
        }
        if (chat) {
          chat.messages.push({
            id: "bot-" + Date.now(),
            fromMe: true,
            sender: "bot",
            senderName: this.aiSettings.botName,
            text: replyText,
            timestamp: Date.now(),
            status: "read"
          });
          chat.lastMessage = replyText;
          chat.lastMessageTime = Date.now();
          this.saveChatsForPhone(connectedPhone, chat);
        }
      }

      // 7. SIMPAN LOG AKTIVITAS BOT
      this.aiSettings.logs.unshift({
        id: "log-" + Date.now(),
        timestamp: Date.now(),
        sender: senderName + " (" + jid.split("@")[0] + ")",
        incoming: userMessage,
        reply: replyText,
        modelUsed,
        isHandover,
        isRestricted
      });
      if (this.aiSettings.logs.length > 50) this.aiSettings.logs.pop();
      this.saveSettings({});
    } catch (err) {
      console.error("[waService] Error in handleAIAutoReply:", err);
    }
  }

  public async sendMessage(jid: string, text: string, media?: WAChatMedia): Promise<{ success: boolean; message: WAChatMessage }> {
    const connectedPhone = this.getConnectedPhoneKey();
    let phoneMap = this.chatsByPhone.get(connectedPhone);
    if (!phoneMap) {
      phoneMap = new Map();
      this.chatsByPhone.set(connectedPhone, phoneMap);
    }

    const displaySummary = text || (media?.type === 'image' ? '📷 [Foto]' : `📄 [${media?.fileName || 'Dokumen'}]`);

    let chat = phoneMap.get(jid);
    if (!chat) {
      chat = {
        id: jid,
        jid: jid,
        name: jid.split("@")[0],
        phone: "+" + jid.split("@")[0],
        unreadCount: 0,
        lastMessage: displaySummary,
        lastMessageTime: Date.now(),
        messages: [],
        connectedPhone
      };
      phoneMap.set(jid, chat);
    }

    const msg: WAChatMessage = {
      id: "out-" + Date.now(),
      fromMe: true,
      sender: "me",
      text: text || "",
      timestamp: Date.now(),
      status: "read",
      media
    };

    chat.messages.push(msg);
    chat.lastMessage = displaySummary;
    chat.lastMessageTime = Date.now();
    chat.unreadCount = 0;
    this.saveChatsForPhone(connectedPhone, chat);

    if (this.socket && this.connectionState === "connected") {
      try {
        if (media && media.data) {
          const rawBase64 = media.data.includes(",") ? media.data.split(",")[1] : media.data;
          const buffer = Buffer.from(rawBase64, "base64");
          if (media.type === "image") {
            await this.socket.sendMessage(jid, {
              image: buffer,
              caption: text || "",
              mimetype: media.mimetype || "image/jpeg"
            });
          } else {
            await this.socket.sendMessage(jid, {
              document: buffer,
              mimetype: media.mimetype || "application/octet-stream",
              fileName: media.fileName || "dokumen",
              caption: text || ""
            });
          }
        } else {
          await this.socket.sendMessage(jid, { text });
        }
      } catch (err) {
        console.error("Failed to send WA message via Baileys socket:", err);
      }
    }

    return { success: true, message: msg };
  }

  public async disconnectSession() {
    if (this.socket) {
      try {
        await this.socket.logout();
      } catch (e) {}
      try {
        this.socket.ev?.removeAllListeners?.();
        this.socket.end?.();
      } catch (e) {}
      this.socket = null;
    }
    this.connectionState = "disconnected";
    this.userJid = null;
    this.userPhone = null;
    this.userName = null;
    this.qrCodeBase64 = null;
    this.qrExpired = true;
    this.qrVersion = 0;
    this.qrTimestamp = 0;

    try {
      if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

export const waService = new WAService();
