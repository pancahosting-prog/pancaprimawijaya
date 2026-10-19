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
    tone: "Ramah & Solutif",
    greetingMessage: "Halo! Terima kasih telah menghubungi kami. Ada yang bisa saya bantu terkait produk & layanan kami?",
    fallbackMessage: "Mohon maaf, pesan Anda telah kami catat. Tim customer service kami akan segera menghubungi Anda kembali.",
    knowledgeBase: [
      {
        id: "kb-1",
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
        this.aiSettings = { ...this.aiSettings, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error("[waService] Error loading WA AI settings:", e);
    }
  }

  public saveSettings(newSettings: Partial<WAISettings>) {
    try {
      this.aiSettings = { ...this.aiSettings, ...newSettings };
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

  public async handleAIAutoReply(jid: string, senderName: string, userMessage: string) {
    try {
      const kbText = this.aiSettings.knowledgeBase
        .map(k => `Produk: ${k.productName}\nDeskripsi: ${k.description}\nHarga: ${k.price}\nFAQ:\n` + k.faq.map(f => `- Q: ${f.q}\n  A: ${f.a}`).join("\n"))
        .join("\n\n");

      const systemPrompt = `Anda adalah Customer Service AI bernama "${this.aiSettings.botName}".
Gaya Bahasa: ${this.aiSettings.tone}.
Pesan Salam default jika sesuai: "${this.aiSettings.greetingMessage}".
Pesan Fallback jika tidak yakin: "${this.aiSettings.fallbackMessage}".

Basis Pengetahuan Produk:
${kbText}

Instruksi:
Jawablah pertanyaan pelanggan (${senderName}) dengan sopan, ringkas, profesional, dan akurat berdasarkan basis pengetahuan produk di atas.
Jika pelanggan menanyakan informasi di luar basis pengetahuan, sampaikan permintaan maaf dan catat bahwa tim customer service akan segera menghubungi mereka.`;

      const apiKey = process.env.GEMINI_API_KEY;
      let replyText = "";
      let modelUsed = "Basis Pengetahuan & Aturan Cerdas";

      if (apiKey) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: userMessage }] }],
              systemInstruction: { parts: [{ text: systemPrompt }] },
              generationConfig: { temperature: 0.3, maxOutputTokens: 300 }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const genText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (genText) {
              replyText = genText;
              modelUsed = "Gemini AI (gemini-2.5-flash)";
            }
          } else {
            console.warn(`[waService] Gemini API returned status ${res.status}, using Knowledge Base fallback.`);
          }
        } catch (genErr) {
          console.warn("[waService] Gemini API call error, using Knowledge Base fallback:", genErr);
        }
      }

      // Fallback cerdas berbasis Knowledge Base & Kata Kunci jika Gemini quota habis (429) atau error
      if (!replyText) {
        const msgLower = userMessage.toLowerCase().trim();
        let matched = false;
        for (const kb of this.aiSettings.knowledgeBase) {
          if (kb.keywords.some(kw => msgLower.includes(kw.toLowerCase()))) {
            replyText = `Halo ${senderName}! Terkait ${kb.productName}: ${kb.description}. Informasi harga: ${kb.price}.`;
            if (kb.faq && kb.faq.length > 0) {
              replyText += `\n\nFAQ:\n` + kb.faq.map(f => `• ${f.q}\n  ${f.a}`).join("\n");
            }
            matched = true;
            break;
          }
        }
        if (!matched) {
          if (/halo|hai|hi|pagi|siang|sore|malam|assalam|permisi/i.test(msgLower)) {
            replyText = `Halo ${senderName}! ` + this.aiSettings.greetingMessage;
          } else {
            replyText = this.aiSettings.fallbackMessage || `Halo ${senderName}! Pesan Anda telah kami terima. Tim customer service kami akan segera menghubungi Anda kembali.`;
          }
        }
      }

      console.log(`[waService] Menyiapkan auto-reply untuk ${jid} via model [${modelUsed}]: "${replyText}"`);

      if (this.socket && this.connectionState === "connected") {
        await this.socket.sendMessage(jid, { text: replyText });
        console.log(`[waService] Berhasil mengirim auto-reply ke WhatsApp ${jid}`);
      } else {
        console.warn(`[waService] Soket WhatsApp tidak dalam status connected, tidak dapat mengirim auto-reply`);
      }

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

      this.aiSettings.logs.unshift({
        id: "log-" + Date.now(),
        timestamp: Date.now(),
        sender: senderName + " (" + jid.split("@")[0] + ")",
        incoming: userMessage,
        reply: replyText,
        modelUsed
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
