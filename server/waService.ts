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
  public connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  public userJid: string | null = null;
  public userPhone: string | null = null;
  public userName: string | null = null;

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

          const chatObj: WAChat & { assignedUser?: string } = {
            id: row.jid,
            jid: row.jid,
            name: row.name || "",
            phone: row.phone || "",
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
    if (activeClean) allPhones.add(activeClean);
    allPhones.add("default");

    return Array.from(allPhones).map(phone => {
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

  public async initBaileys() {
    if (this.connectionState === "connecting" || this.connectionState === "connected") {
      return;
    }

    this.connectionState = "connecting";

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

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
        browser: ["MyPanca CRM WA", "Chrome", "1.0.0"]
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
              fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            } catch (err) {}
          }
        } else if (connection === "open") {
          this.connectionState = "connected";
          this.qrCodeBase64 = null;
          const user = this.socket?.user;
          this.userJid = user?.id || null;
          this.userPhone = user?.id ? user.id.split(":")[0].replace(/[^0-9]/g, "") : null;
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
        if (m.type !== "notify") return;

        for (const msg of m.messages) {
          if (!msg.message) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us")) continue; // 1-on-1 chats only

          let text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
          let incomingMedia: WAChatMedia | undefined = undefined;

          if (msg.message.imageMessage) {
            text = msg.message.imageMessage.caption || "📷 [Foto]";
            incomingMedia = {
              type: "image",
              mimetype: msg.message.imageMessage.mimetype || "image/jpeg"
            };
          } else if (msg.message.documentMessage) {
            const fileName = msg.message.documentMessage.fileName || "Dokumen";
            text = msg.message.documentMessage.caption || `📄 [${fileName}]`;
            incomingMedia = {
              type: "document",
              fileName,
              mimetype: msg.message.documentMessage.mimetype || "application/octet-stream"
            };
          }

          if (!text && !incomingMedia) continue;

          const senderName = msg.pushName || remoteJid.split("@")[0];
          const isFromMe = Boolean(msg.key.fromMe);

          const connectedPhone = this.getConnectedPhoneKey();
          let phoneMap = this.chatsByPhone.get(connectedPhone);
          if (!phoneMap) {
            phoneMap = new Map();
            this.chatsByPhone.set(connectedPhone, phoneMap);
          }

          let chat = phoneMap.get(remoteJid);
          if (!chat) {
            chat = {
              id: remoteJid,
              jid: remoteJid,
              name: senderName,
              phone: "+" + remoteJid.split("@")[0],
              unreadCount: 0,
              lastMessage: text,
              lastMessageTime: Date.now(),
              messages: [],
              connectedPhone
            };
            phoneMap.set(remoteJid, chat);
          }

          const newMsg: WAChatMessage = {
            id: msg.key.id || "msg-" + Date.now(),
            fromMe: isFromMe,
            sender: remoteJid,
            senderName,
            text,
            timestamp: Date.now(),
            status: "unread",
            media: incomingMedia
          };

          chat.messages.push(newMsg);
          chat.lastMessage = text;
          chat.lastMessageTime = Date.now();
          if (!isFromMe) chat.unreadCount += 1;

          // Save to local file & Supabase for this connected phone
          this.saveChatsForPhone(connectedPhone, chat);

          // Auto reply AI logic
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
      let replyText = this.aiSettings.fallbackMessage;
      let modelUsed = "gemini-1.5-flash";

      if (apiKey) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelUsed}:generateContent?key=${apiKey}`, {
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
            replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || replyText;
          }
        } catch (genErr) {
          console.error("Gemini API call failed for WA Auto-Reply:", genErr);
        }
      } else {
        const msgLower = userMessage.toLowerCase();
        let matched = false;
        for (const kb of this.aiSettings.knowledgeBase) {
          if (kb.keywords.some(kw => msgLower.includes(kw))) {
            replyText = `Halo ${senderName}! Mengenai ${kb.productName}: ${kb.description} Informasi harga: ${kb.price}.`;
            matched = true;
            break;
          }
        }
        if (!matched) {
          replyText = `Halo ${senderName}! ` + this.aiSettings.greetingMessage;
        }
      }

      if (this.socket && this.connectionState === "connected") {
        await this.socket.sendMessage(jid, { text: replyText });
      }

      const connectedPhone = this.getConnectedPhoneKey();
      let phoneMap = this.chatsByPhone.get(connectedPhone);
      if (phoneMap) {
        const chat = phoneMap.get(jid);
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
      this.socket = null;
    }
    this.connectionState = "disconnected";
    this.userJid = null;
    this.userPhone = null;
    this.userName = null;
    this.qrCodeBase64 = null;

    try {
      if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

export const waService = new WAService();
