import express from "express";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";

// File storage paths for WA state
const SESSION_DIR = path.resolve("./wa-session");
const SETTINGS_FILE = path.resolve("./wa-ai-settings.json");
const CHATS_FILE = path.resolve("./wa-chats.json");

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

class WAService {
  private socket: any = null;
  public qrCodeBase64: string | null = null;
  public connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  public userJid: string | null = null;
  public userPhone: string | null = null;
  public userName: string | null = null;

  public chats: Map<string, WAChat> = new Map();
  public aiSettings: WAISettings = {
    autoReplyEnabled: true,
    botName: "Customer Assistant AI",
    tone: "Ramah, Ramah & Sangat Membantu",
    greetingMessage: "Halo! Terima kasih telah menghubungi kami. Ada yang bisa saya bantu terkait produk & layanan kami?",
    fallbackMessage: "Mohon maaf, pesan Anda telah kami catat. Tim customer service kami akan segera menghubungi Anda kembali.",
    knowledgeBase: [
      {
        id: "kb-1",
        productName: "Layanan Hosting & Domain Panca",
        description: "Layanan cloud hosting super cepat dengan uptime 99.9% dan SSL gratis.",
        price: "Mulai Rp 50.000 / bulan",
        keywords: ["hosting", "domain", "cloud", "server", "harga"],
        faq: [
          { q: "Berapa lama proses aktivasi?", a: "Aktivasi otomatis instan dalam 5 menit setelah konfirmasi pembayaran." },
          { q: "Apakah dapat SSL gratis?", a: "Ya, SSL Let's Encrypt gratis sudah disertakan untuk semua paket." }
        ]
      },
      {
        id: "kb-2",
        productName: "Aplikasi Manajemen Task & CRM",
        description: "Sistem CRM dan manajemen tugas terpadu untuk efisiensi operasional tim.",
        price: "Paket Pro Rp 150.000 / user / bulan",
        keywords: ["crm", "task", "aplikasi", "fitur", "manajemen"],
        faq: [
          { q: "Apakah ada uji coba gratis?", a: "Tersedia uji coba gratis 14 hari tanpa kartu kredit." }
        ]
      }
    ],
    logs: []
  };

  constructor() {
    this.loadSettings();
    this.loadChats();
  }

  private loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        this.aiSettings = { ...this.aiSettings, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error("Error loading WA AI settings:", e);
    }
  }

  public saveSettings(newSettings: Partial<WAISettings>) {
    try {
      this.aiSettings = { ...this.aiSettings, ...newSettings };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.aiSettings, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving WA AI settings:", e);
    }
  }

  private loadChats() {
    try {
      if (fs.existsSync(CHATS_FILE)) {
        const raw = fs.readFileSync(CHATS_FILE, "utf-8");
        const list: WAChat[] = JSON.parse(raw);
        list.forEach(c => this.chats.set(c.id, c));
      } else {
        // Seed default sample chat data for rich UI experience
        const sampleChats: WAChat[] = [
          {
            id: "6281234567890@s.whatsapp.net",
            jid: "6281234567890@s.whatsapp.net",
            name: "Budi Santoso (Client PT Maju)",
            phone: "+62 812-3456-7890",
            unreadCount: 1,
            lastMessage: "Halo, mau tanya harga paket hosting pro berapa ya?",
            lastMessageTime: Date.now() - 300000,
            messages: [
              {
                id: "m1",
                fromMe: false,
                sender: "6281234567890@s.whatsapp.net",
                senderName: "Budi Santoso",
                text: "Selamat siang min",
                timestamp: Date.now() - 600000,
                status: "read"
              },
              {
                id: "m2",
                fromMe: true,
                sender: "me",
                text: "Selamat siang Pak Budi, ada yang bisa kami bantu hari ini?",
                timestamp: Date.now() - 540000,
                status: "read"
              },
              {
                id: "m3",
                fromMe: false,
                sender: "6281234567890@s.whatsapp.net",
                senderName: "Budi Santoso",
                text: "Halo, mau tanya harga paket hosting pro berapa ya?",
                timestamp: Date.now() - 300000,
                status: "unread"
              }
            ]
          },
          {
            id: "6289876543210@s.whatsapp.net",
            jid: "6289876543210@s.whatsapp.net",
            name: "Siti Rahmawati (CV Usaha Bersama)",
            phone: "+62 898-7654-3210",
            unreadCount: 0,
            lastMessage: "Terima kasih informasinya min!",
            lastMessageTime: Date.now() - 3600000,
            messages: [
              {
                id: "m4",
                fromMe: false,
                sender: "6289876543210@s.whatsapp.net",
                senderName: "Siti Rahmawati",
                text: "Apakah CRM ini bisa dipakai untuk banyak user?",
                timestamp: Date.now() - 4000000,
                status: "read"
              },
              {
                id: "m5",
                fromMe: true,
                sender: "me",
                text: "Bisa sekali Bu Siti. Sistem mendukung multi-role untuk admin, sales, dan finance.",
                timestamp: Date.now() - 3800000,
                status: "read"
              },
              {
                id: "m6",
                fromMe: false,
                sender: "6289876543210@s.whatsapp.net",
                senderName: "Siti Rahmawati",
                text: "Terima kasih informasinya min!",
                timestamp: Date.now() - 3600000,
                status: "read"
              }
            ]
          }
        ];
        sampleChats.forEach(c => this.chats.set(c.id, c));
        this.saveChats();
      }
    } catch (e) {
      console.error("Error loading chats:", e);
    }
  }

  public saveChats() {
    try {
      const list = Array.from(this.chats.values());
      fs.writeFileSync(CHATS_FILE, JSON.stringify(list, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving chats:", e);
    }
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

      // Dynamic import to avoid CJS/ESM bundling issues
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
            // Clean session on logout
            try {
              fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            } catch (err) {}
          }
        } else if (connection === "open") {
          this.connectionState = "connected";
          this.qrCodeBase64 = null;
          const user = this.socket?.user;
          this.userJid = user?.id || null;
          this.userPhone = user?.id ? user.id.split(":")[0] : null;
          this.userName = user?.name || "WhatsApp Business Bot";
        }
      });

      this.socket.ev.on("messages.upsert", async (m: any) => {
        if (m.type !== "notify") return;

        for (const msg of m.messages) {
          if (!msg.message) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us")) continue; // Focus on 1-on-1 chats

          const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
          if (!text) continue;

          const senderName = msg.pushName || remoteJid.split("@")[0];
          const isFromMe = Boolean(msg.key.fromMe);

          let chat = this.chats.get(remoteJid);
          if (!chat) {
            chat = {
              id: remoteJid,
              jid: remoteJid,
              name: senderName,
              phone: "+" + remoteJid.split("@")[0],
              unreadCount: 0,
              lastMessage: text,
              lastMessageTime: Date.now(),
              messages: []
            };
            this.chats.set(remoteJid, chat);
          }

          const newMsg: WAChatMessage = {
            id: msg.key.id || "msg-" + Date.now(),
            fromMe: isFromMe,
            sender: remoteJid,
            senderName,
            text,
            timestamp: Date.now(),
            status: "unread"
          };

          chat.messages.push(newMsg);
          chat.lastMessage = text;
          chat.lastMessageTime = Date.now();
          if (!isFromMe) chat.unreadCount += 1;
          this.saveChats();

          // Auto reply AI logic
          if (!isFromMe && this.aiSettings.autoReplyEnabled) {
            this.handleAIAutoReply(remoteJid, senderName, text);
          }
        }
      });
    } catch (err) {
      console.error("Failed to initialize Baileys:", err);
      this.connectionState = "disconnected";
      // Generate fallback QR for UI testing if network / socket fails
      QRCode.toDataURL("https://mypanca-crm.app/wa-connect-" + Date.now()).then(qr => {
        this.qrCodeBase64 = qr;
      });
    }
  }

  public async handleAIAutoReply(jid: string, senderName: string, userMessage: string) {
    try {
      // Build prompt using knowledge base
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
        // Keyword fallback matching
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

      // Send via WhatsApp socket if connected
      if (this.socket && this.connectionState === "connected") {
        await this.socket.sendMessage(jid, { text: replyText });
      }

      // Add to chat history
      const chat = this.chats.get(jid);
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
        this.saveChats();
      }

      // Add to AI logs
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
      console.error("Error in handleAIAutoReply:", err);
    }
  }

  public async sendMessage(jid: string, text: string): Promise<{ success: boolean; message: WAChatMessage }> {
    let chat = this.chats.get(jid);
    if (!chat) {
      chat = {
        id: jid,
        jid: jid,
        name: jid.split("@")[0],
        phone: "+" + jid.split("@")[0],
        unreadCount: 0,
        lastMessage: text,
        lastMessageTime: Date.now(),
        messages: []
      };
      this.chats.set(jid, chat);
    }

    const msg: WAChatMessage = {
      id: "out-" + Date.now(),
      fromMe: true,
      sender: "me",
      text,
      timestamp: Date.now(),
      status: "read"
    };

    chat.messages.push(msg);
    chat.lastMessage = text;
    chat.lastMessageTime = Date.now();
    chat.unreadCount = 0;
    this.saveChats();

    if (this.socket && this.connectionState === "connected") {
      try {
        await this.socket.sendMessage(jid, { text });
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
