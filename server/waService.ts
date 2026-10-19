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
  isHandedOverToHuman?: boolean; // Jika true, AI berhenti auto-reply percakapan ini
  fallbackCount?: number; // Jumlah berturut-turut bot mengalami fallback
  waitingHandoverConsent?: boolean; // Sedang menunggu konfirmasi user (setuju dialihkan ke CS)
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

  private async loadSettings() {
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

      // Sync dari Supabase app_settings jika tersedia
      if (supabaseServer) {
        try {
          const { data, error } = await supabaseServer
            .from("app_settings")
            .select("value")
            .eq("key", "wa_ai_settings")
            .maybeSingle();
          if (data && data.value && !error) {
            const dbVal = data.value;
            const products = dbVal.knowledgeProducts || dbVal.knowledgeBase || this.aiSettings.knowledgeProducts;
            // Merge snippets by ID/title so local updates are not lost
            const mergedSnippets = [...(dbVal.knowledgeSnippets || [])];
            for (const localS of (this.aiSettings.knowledgeSnippets || [])) {
              if (!mergedSnippets.some(s => s.id === localS.id || s.title.toLowerCase() === localS.title.toLowerCase())) {
                mergedSnippets.push(localS);
              }
            }

            this.aiSettings = {
              ...this.aiSettings,
              ...dbVal,
              knowledgeProducts: products,
              knowledgeBase: products,
              knowledgeSnippets: mergedSnippets,
              knowledgeWebSources: dbVal.knowledgeWebSources || this.aiSettings.knowledgeWebSources
            };
            console.log("[waService] Berhasil sinkronisasi AI settings dari Supabase app_settings.");
          }
        } catch (dbErr) {
          // Abaikan jika tabel belum ada di Supabase
        }
      }
    } catch (e) {
      console.error("[waService] Error loading WA AI settings:", e);
    }
  }

  public async saveSettings(newSettings: Partial<WAISettings>) {
    try {
      this.aiSettings = { ...this.aiSettings, ...newSettings };
      if (newSettings.knowledgeProducts) {
        this.aiSettings.knowledgeBase = newSettings.knowledgeProducts;
      }
      if (newSettings.toneOfVoice) {
        this.aiSettings.tone = newSettings.toneOfVoice;
      }
      // 1. Simpan ke file lokal wa-ai-settings.json
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.aiSettings, null, 2), "utf-8");

      // 2. Dual-Persistence: simpan juga ke tabel Supabase app_settings jika terhubung
      if (supabaseServer) {
        try {
          await supabaseServer.from("app_settings").upsert({
            key: "wa_ai_settings",
            value: this.aiSettings,
            updated_at: new Date().toISOString(),
            updated_by: "wa_service"
          }, { onConflict: "key" });
          console.log("[waService] Berhasil menyimpan AI settings ke Supabase app_settings.");
        } catch (dbErr) {
          console.warn("[waService] Supabase app_settings sync skipped:", dbErr);
        }
      }
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

  public setChatHandover(jid: string, isHandedOver: boolean): boolean {
    const connectedPhone = this.getConnectedPhoneKey();
    let phoneMap = this.chatsByPhone.get(connectedPhone) || this.chatsByPhone.get("default");
    if (!phoneMap) return false;
    let chat = phoneMap.get(jid) || Array.from(phoneMap.values()).find(c => c.jid === jid || c.id === jid);
    if (chat) {
      chat.isHandedOverToHuman = isHandedOver;
      if (!isHandedOver) {
        chat.fallbackCount = 0;
        chat.waitingHandoverConsent = false;
      }
      this.saveChatsForPhone(connectedPhone, chat);
      return true;
    }
    return false;
  }

  public async generateAIResponse(
    senderName: string, 
    userMessage: string,
    recentHistory?: { role: 'user' | 'model'; text: string }[]
  ): Promise<{
    replyText: string;
    modelUsed: string;
    isHandover: boolean;
    isRestricted: boolean;
    isFallback: boolean;
    containerMatched: 'products' | 'snippets' | 'websites' | 'guardrail' | 'handover' | 'greeting' | 'fallback';
  }> {
    const msgLower = userMessage.toLowerCase().trim();
    let replyText = "";
    let modelUsed = "Basis Pengetahuan & Aturan Cerdas";
    let isHandover = false;
    let isRestricted = false;
    let isFallback = false;
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
        replyText = `Mohon maaf Kak ${senderName}, kami tidak dapat memberikan tanggapan terkait topik tersebut demi mematuhi kebijakan dan etika layanan resmi kami. Silakan tanyakan hal lain seputar informasi produk, penawaran harga, atau layanan PT. Panca Prima Wijaya ya.`;
        break;
      }
    }

    // 2. CEK PENGALIHAN MANUAL KE AGEN MANUSIA (KEYWORD TRIGGER)
    if (!replyText && this.aiSettings.handoverToHuman?.enabled) {
      const triggers = this.aiSettings.handoverToHuman.triggerKeywords || [];
      const isHandoverTriggered = triggers.some(trg => trg.trim() && msgLower.includes(trg.trim().toLowerCase()));
      if (isHandoverTriggered) {
        isHandover = true;
        modelUsed = "Handover CS / Sales Manusia";
        containerMatched = 'handover';
        const contact = this.aiSettings.handoverToHuman.handoverContact || "0811-1234-5678";
        const template = this.aiSettings.handoverToHuman.handoverMessage || 
          "Baik Kak {name}, percakapan Anda kami teruskan langsung ke Sales & CS Specialist kami di nomor {contact}. Tim kami akan segera merespons secara langsung ya.";
        replyText = template
          .replace(/{contact}/g, contact)
          .replace(/{name}/g, senderName);
      }
    }

    // 3. PENANGANAN PERCAKAPAN HUMANIS & NATURAL (SAPAAN, INGIN BERTANYA, TERIMA KASIH, CHITCHAT)
    if (!replyText) {
      const cleanMsg = msgLower.replace(/[?!.,;:"'()\[\]\/\\]/g, ' ').trim();
      const cleanWords = cleanMsg.split(/\s+/).filter(Boolean);

      // A. Intensi ingin bertanya / membuka obrolan tanpa topik spesifik ("saya mau tanya nih", "mau nanya dong", "boleh tanya?", dll)
      const hasSpecificTopic = cleanMsg.includes("harga") || cleanMsg.includes("retur") || cleanMsg.includes("garansi") || 
        cleanMsg.includes("rekening") || cleanMsg.includes("kirim") || cleanMsg.includes("ongkir") || cleanMsg.includes("produk") || 
        cleanMsg.includes("mulsa") || cleanMsg.includes("sungkup") || cleanMsg.includes("net") || cleanMsg.includes("faktur") || 
        cleanMsg.includes("kantor") || cleanMsg.includes("jam") || cleanMsg.includes("transfer") || cleanMsg.includes("pesan") || cleanMsg.includes("beli");

      const isAskingToAsk = !hasSpecificTopic && (
        /^(?:saya\s+)?(?:mau|ingin|bisa|boleh|pengen|mo|mw)\s+(?:tanya|nanya|bertanya|konsul|konsultasi|minta\s+info|bantu)/i.test(cleanMsg) ||
        /\b(?:mau|bisa|boleh)\s+(?:tanya|nanya|bertanya)\b/i.test(cleanMsg) ||
        cleanMsg === "mau tanya" || cleanMsg === "mau nanya" || cleanMsg === "tanya dong" || cleanMsg === "nanya dong" ||
        cleanMsg.includes("mau tanya nih") || cleanMsg.includes("mau nanya nih") || cleanMsg.includes("mau tanya dong") || 
        cleanMsg.includes("ada yang mau saya tanyakan") || cleanMsg.includes("ada yang mau ditanyakan") ||
        cleanMsg === "saya mau tanya" || cleanMsg === "mau konsultasi" || cleanWords.length <= 5 && cleanMsg.includes("tanya")
      );

      // B. Sapaan murni tanpa pertanyaan spesifik ("halo", "hai", "selamat pagi", "assalam", "permisi", "p", "halo min", dll)
      const isGreetingOnly = /^(?:halo|hai|hi|hei|helo|pagi|siang|sore|malam|assalam(?:ualaikum)?|permisi|sampurasun|punten|tes|test|p)\b/i.test(cleanMsg) &&
        !cleanMsg.includes("harga") && !cleanMsg.includes("retur") && !cleanMsg.includes("rekening") && !cleanMsg.includes("kirim") && 
        !cleanMsg.includes("produk") && !cleanMsg.includes("mulsa") && !cleanMsg.includes("sungkup") && !cleanMsg.includes("net") &&
        !cleanMsg.includes("garansi") && !cleanMsg.includes("faktur") && !cleanMsg.includes("katalog") && !cleanMsg.includes("pesan") &&
        !cleanMsg.includes("beli") && !cleanMsg.includes("transfer") && cleanWords.length <= 6;

      // C. Ucapan terima kasih ("terima kasih", "makasih ya kak", "thanks", dll)
      const isGratitude = /^(?:terima\s*kasih|makasih|tengkyu|thanks|matur\s*nuwun|syukron|arigato)\b/i.test(cleanMsg);

      // D. Konfirmasi santai ("oke", "ok", "siap", "baik", "noted", dll)
      const isAck = /^(?:oke|ok|siap|baik|noted|sip|mantap|paham|mengerti|yep|yup)\b/i.test(cleanMsg) && cleanWords.length <= 4;

      // E. Cek admin / robot ("apakah ini bot?", "ini robot ya?", "ada orang?", "admin aktif?")
      const isBotCheck = /\b(?:apakah\s+(?:ini\s+)?(?:bot|robot|ai)|ini\s+(?:bot|robot|ai)|ada\s+orang|admin(?:nya)?\s+aktif)\b/i.test(cleanMsg);

      if (isAskingToAsk) {
        replyText = `Halo Kak ${senderName}! Tentu boleh banget, silakan mau tanya tentang apa nih? Apakah seputar produk pertanian kami (seperti plastik sungkup, mulsa, insect net), penawaran harga, atau prosedur pemesanan? Siap kami bantu ya! 😊`;
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Percakapan Pembuka)";
      } else if (isGreetingOnly) {
        replyText = `Halo Kak ${senderName}! Selamat datang di layanan WhatsApp PT. Panca Prima Wijaya. Senang bisa terhubung dengan Kakak. Ada yang bisa kami bantu seputar produk atau layanan kami hari ini? 😊`;
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Sapaan)";
      } else if (isGratitude) {
        replyText = `Sama-sama Kak ${senderName}! Senang bisa membantu. Jika ada hal lain yang ingin ditanyakan lagi nanti, jangan sungkan untuk hubungi kami kembali ya. Semoga hari Kakak menyenangkan! 🙏😊`;
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Terima Kasih)";
      } else if (isAck) {
        replyText = `Siap Kak ${senderName}! Jika ada yang butuh dipastikan lagi atau ingin order, langsung kabari kami ya 😊`;
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Konfirmasi)";
      } else if (isBotCheck) {
        replyText = `Halo Kak ${senderName}! Saya asisten cerdas WhatsApp PT. Panca Prima Wijaya. Saya siap merespons pertanyaan seputar produk, harga, dan ketentuan layanan secara cepat. Jika Kakak membutuhkan bantuan langsung dari tim CS atau Sales manusia, cukup sampaikan saja ya 😊`;
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Info Layanan)";
      }
    }

    // 4. SUSUN KNOWLEDGE BASE SEBAGAI PARAGRAF & KONTEN RINGKAS
    if (!replyText) {
      const snippets = this.aiSettings.knowledgeSnippets || [];
      const products = this.aiSettings.knowledgeProducts?.length 
        ? this.aiSettings.knowledgeProducts 
        : (this.aiSettings.knowledgeBase || []);
      const webSources = (this.aiSettings.knowledgeWebSources || []).filter(w => w.isActive);

      const knowledgeSections: string[] = [];

      // Semua dokumen disusun menjadi Paragraf & Konten Pengetahuan yang bersih dan fokus
      snippets.forEach((s, idx) => {
        knowledgeSections.push(`[PARAGRAF DOKUMEN #${idx + 1}: ${s.title.toUpperCase()}${s.category ? ` - ${s.category}` : ''}]\n${s.content}`);
      });

      // Produk juga disajikan sebagai paragraf konten yang to-the-point
      products.forEach((p, idx) => {
        let text = `[PARAGRAF PRODUK #${idx + 1}: ${p.productName.toUpperCase()}]\n${p.description}\nEstimasi Harga: ${p.price}`;
        if (p.faq && p.faq.length > 0) {
          text += `\nDetail: ` + p.faq.map(f => `${f.q}: ${f.a}`).join(' | ');
        }
        knowledgeSections.push(text);
      });

      // Sumber web juga disajikan sebagai paragraf konten
      webSources.forEach((w, idx) => {
        knowledgeSections.push(`[PARAGRAF REFERENSI #${idx + 1}: ${w.title}]\n${w.summary}`);
      });

      const fullKnowledgeText = knowledgeSections.join("\n\n---\n\n");

      const tone = this.aiSettings.toneOfVoice || this.aiSettings.tone || "Ramah, Bersahabat & Solutif";
      const lang = this.aiSettings.responseLanguage || "Bahasa Indonesia";

      const fullSystemPrompt = `PERAN & IDENTITAS:
Anda adalah Customer Service WhatsApp resmi dari PT. Panca Prima Wijaya.
Gaya komunikasi Anda: Sangat ramah, bersahabat, hangat, sopan, dan santun seperti staf CS manusia asli (BUKAN template bot kaku, BUKAN siaran broadcast formal).
Bahasa respon: ${lang}. Nada bicara: ${tone}.

PRINSIP JAWABAN (SANGAT KRUSIAL - PATUHI SECARA KETAT):
1. FOKUS HANYA PADA APA YANG DITANYAKAN (DILARANG MEMUNTAHKAN/DUMP INFORMASI LAIN):
   - Jika pengguna bertanya tentang Aturan A (misalnya: aturan garansi, tata cara retur, rekening transfer, atau jam buka kantor), jelaskan HANYA aturan A tersebut secara tuntas!
   - DILARANG KERAS menyertakan informasi aturan B atau C, daftar rekening (jika tidak ditanya pembayaran), atau mempromosikan produk lain yang tidak ada hubungannya dengan pertanyaan pengguna.
   - Jawab secara to-the-point, jelas, dan padat (cukup 1-2 paragraf pendek) agar sangat nyaman dan cepat dipahami di layar chat WhatsApp.

2. GAYA BAHASA NATURAL, RAMAH & ANTI-TEMPLATE:
   - Sapa nama dengan hangat dan santun (contoh: "Halo Kak ${senderName}" atau "Baik Kak ${senderName}").
   - JANGAN mengulang salam pembuka/penutup formal yang panjang dan kaku berulang kali jika percakapan sudah berjalan mengalir.
   - Hindari bahasa klise robotik seperti "Sebagai asisten AI...", "Pesan Anda telah kami catat...", dll.

3. PERCAKAPAN PEMBUKA & BASA-BASI HUMANIS:
   - Jika pengguna hanya menyapa, mengucap salam, mengatakan "mau tanya nih", "boleh tanya?", atau basa-basi pembuka, balaslah dengan sangat hangat, ramah, dan luwes selayaknya staf CS manusia yang menyambut pelanggan. JANGAN PERNAH menganggap sapaan pembuka sebagai fallback!

4. FALLBACK KONTEKSTUAL OTOMATIS:
   - Jika informasi yang ditanyakan pengguna TIDAK TERCANTUM di dalam Catatan Paragraf Basis Pengetahuan di bawah:
     * JANGAN gunakan kalimat template bot kaku.
     * Buatlah balasan ramah yang kontekstual dan mengalir wajar sesuai topik yang baru saja ditanyakan atau topik percakapan sebelumnya (misalnya: dengan sopan menjelaskan bahwa detail spesifik mengenai topik tersebut saat ini belum tercatat di panduan resmi Anda).
     * Wajib akhiri balasan fallback dengan tag rahasia: [FALLBACK_TAG] (kode ini tidak akan dilihat user dan dipakai sistem internal untuk menghitung fallback).

=== CATATAN BASIS PENGETAHUAN PERUSAHAAN (PARAGRAF & KONTEN) ===
${fullKnowledgeText || "Belum ada dokumen pengetahuan yang dimasukkan."}
`;

      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        // Susun payload dengan riwayat pesan sebelumnya agar Gemini memahami alur percakapan multi-turn
        const contentsPayload: any[] = [];
        if (recentHistory && recentHistory.length > 0) {
          for (const h of recentHistory) {
            if (h.text && h.text.trim()) {
              contentsPayload.push({
                role: h.role,
                parts: [{ text: h.text }]
              });
            }
          }
        }
        contentsPayload.push({
          role: "user",
          parts: [{ text: userMessage }]
        });

        const modelCandidates = ["gemini-3.8-flash", "gemini-2.5-flash"];
        for (const candidate of modelCandidates) {
          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: contentsPayload,
                systemInstruction: { parts: [{ text: fullSystemPrompt }] },
                generationConfig: { temperature: 0.3, maxOutputTokens: 350 }
              })
            });

            if (res.ok) {
              const data = await res.json();
              const genText = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (genText) {
                let cleanGen = genText.trim();
                if (cleanGen.includes("[FALLBACK_TAG]")) {
                  isFallback = true;
                  cleanGen = cleanGen.replace(/\[FALLBACK_TAG\]/g, "").trim();
                  containerMatched = 'fallback';
                } else {
                  isFallback = false;
                  containerMatched = 'snippets';
                }
                replyText = cleanGen;
                modelUsed = `Gemini AI (${candidate})`;
                break;
              }
            } else {
              console.warn(`[waService] Gemini API (${candidate}) status ${res.status}`);
            }
          } catch (genErr) {
            console.warn(`[waService] Gemini API (${candidate}) error:`, genErr);
          }
        }
      }

      // 4. ATURAN LOKAL CERDAS JIKA GEMINI SEDANG LIMIT / OFFLINE
      if (!replyText) {
        // Gabungkan seluruh snippets paragraf & produk menjadi daftar pengetahuan terpadu
        const allParagraphs: { title: string; category?: string; content: string; keywords: string[] }[] = [];
        snippets.forEach(s => {
          allParagraphs.push({
            title: s.title,
            category: s.category,
            content: s.content,
            keywords: s.keywords || []
          });
        });
        products.forEach(p => {
          let c = `Produk *${p.productName}*\nEstimasi Harga: ${p.price}\nDeskripsi: ${p.description}`;
          if (p.faq && p.faq.length > 0) {
            c += `\nDetail: ` + p.faq.map(f => `${f.q}: ${f.a}`).join(' | ');
          }
          allParagraphs.push({
            title: p.productName,
            category: 'Katalog Produk',
            content: c,
            keywords: p.keywords || []
          });
        });
        webSources.forEach(w => {
          allParagraphs.push({
            title: w.title,
            category: 'Referensi Website',
            content: `${w.title}\n${w.summary}`,
            keywords: [w.title.toLowerCase()]
          });
        });

        // Ekstraksi istilah kata kunci dari pesan pengguna
        const stopWords = new Set([
          'bagaimana', 'apakah', 'gimana', 'minta', 'tolong', 'info', 'bisa', 'saya', 'kami', 
          'untuk', 'dengan', 'yang', 'atau', 'pada', 'tentang', 'soal', 'punya', 'ada', 'dong', 
          'kak', 'bapak', 'ibu', 'halo', 'hai', 'siang', 'pagi', 'sore', 'malam', 'ya', 'saja', 'nya',
          'siapa', 'nama', 'saat', 'ini', 'itu', 'lama', 'tahu', 'hari', 'buat', 'mau', 'pun', 'dari', 
          'ke', 'di', 'dan', 'lah', 'kah', 'sih', 'kok', 'mana', 'kapan', 'kenapa', 'mengapa', 'seperti',
          'apa', 'jika', 'kalau', 'bila', 'oleh', 'akan', 'sudah', 'telah', 'sedang', 'lebih', 'paling'
        ]);

        const queryTerms = msgLower
          .replace(/[?!.,;:"'()\[\]\/\\]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length >= 3 && !stopWords.has(t));

        let bestMatch: { title: string; category?: string; content: string } | null = null;
        let highestScore = 0;

        for (const p of allParagraphs) {
          let score = 0;
          let matchedTitleOrKeyword = false;
          const tLower = p.title.toLowerCase();
          const cLower = p.content.toLowerCase();

          // 1. Cek kata kunci spesifik yang relevan
          for (const kw of p.keywords) {
            if (kw && msgLower.includes(kw.toLowerCase())) {
              score += 7;
              matchedTitleOrKeyword = true;
            }
          }

          // 2. Cek kecocokan istilah pertanyaan di judul (bobot tinggi)
          for (const term of queryTerms) {
            if (tLower.includes(term)) {
              score += 6;
              matchedTitleOrKeyword = true;
            } else if (cLower.includes(term)) {
              score += 2;
            }
          }

          // 3. Cek judul persis jika query singkat
          if (queryTerms.length > 0 && queryTerms.every(term => tLower.includes(term))) {
            score += 10;
            matchedTitleOrKeyword = true;
          }

          // Hanya cocok jika ada kecocokan di judul/keyword atau skor konten sangat tinggi
          if (matchedTitleOrKeyword && score > highestScore && score >= 6) {
            highestScore = score;
            bestMatch = p;
          } else if (!matchedTitleOrKeyword && score > highestScore && score >= 10) {
            highestScore = score;
            bestMatch = p;
          }
        }

        if (bestMatch) {
          // JAWAB HANYA APA YANG DITANYAKAN (RAMAH, BERSAHABAT & TO-THE-POINT)
          replyText = `Halo Kak ${senderName}! Terkait *${bestMatch.title}*:\n\n${bestMatch.content}`;
          containerMatched = 'snippets';
        } else {
          // Cek sapaan salam santai
          if (/^(halo|hai|hi|pagi|siang|sore|malam|assalam|permisi|selamat)\b/i.test(msgLower) && msgLower.length < 25) {
            replyText = `Halo Kak ${senderName}! Ada yang bisa kami bantu seputar informasi produk atau layanan kami hari ini? 😊`;
            containerMatched = 'greeting';
          } else {
            // Contextual polite fallback alih-alih kalimat robot kaku
            const previewTopic = userMessage.length > 35 ? userMessage.substring(0, 35) + '...' : userMessage;
            replyText = `Mohon maaf ya Kak ${senderName}, untuk informasi terkait "${previewTopic}" saat ini belum tercantum di catatan panduan kami.`;
            isFallback = true;
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
      isFallback,
      containerMatched
    };
  }

  private simSessions: Map<string, {
    fallbackCount: number;
    waitingHandoverConsent: boolean;
    isHandedOverToHuman: boolean;
  }> = new Map();

  public resetSimSession(sessionId: string = "default-sim") {
    this.simSessions.set(sessionId, {
      fallbackCount: 0,
      waitingHandoverConsent: false,
      isHandedOverToHuman: false
    });
  }

  public async simulateAIAutoReply(
    userMessage: string, 
    senderName: string = "Calon Pelanggan", 
    history?: { role: 'user' | 'model'; text: string }[],
    sessionId: string = "default-sim"
  ) {
    if (!this.simSessions.has(sessionId)) {
      this.resetSimSession(sessionId);
    }
    const session = this.simSessions.get(sessionId)!;

    // 1. Jika sesi simulasi sudah dialihkan ke CS Manusia, AI tidak lagi membalas
    if (session.isHandedOverToHuman) {
      return {
        replyText: `[Percakapan simulasi ini sudah dialihkan dan sedang ditangani oleh CS Manusia. AI otomatis dinonaktifkan untuk obrolan ini.]`,
        modelUsed: "Handover CS Manusia",
        isHandover: true,
        isRestricted: false,
        isFallback: false,
        containerMatched: 'handover' as const,
        isHandedOverToHuman: true,
        fallbackCount: 0,
        waitingHandoverConsent: false
      };
    }

    const msgLower = userMessage.toLowerCase().trim();

    // 2. Cek apakah sedang menunggu persetujuan pengalihan ke CS setelah 3x fallback
    if (session.waitingHandoverConsent) {
      const isConsentYes = /^(ya|iya|boleh|mau|hubungkan|alihkan|tolong|oke|ok|siap|bisa|teruskan|sambungkan|lanjut|y|hubungi|silakan|silahkan)\b/i.test(msgLower) ||
        msgLower === "ya" || msgLower === "boleh" || msgLower === "mau" || msgLower.includes("alihkan") || msgLower.includes("hubungkan") || msgLower.includes("teruskan") || msgLower.includes("hubungi");

      const isConsentNo = /^(tidak|enggak|nggak|batal|jangan|skip|ga usah|gak usah|tdk|no|g|ga|gak)\b/i.test(msgLower) ||
        msgLower.includes("tidak") || msgLower.includes("enggak") || msgLower.includes("nggak") || msgLower.includes("jangan") || msgLower.includes("batal");

      if (isConsentYes && !isConsentNo) {
        session.isHandedOverToHuman = true;
        session.waitingHandoverConsent = false;
        session.fallbackCount = 0;
        return {
          replyText: `Baik Kak ${senderName}, percakapan ini sudah kami alihkan langsung ke tim Customer Service kami ya. Tim kami akan segera merespons dan membantu Kakak secara personal di sini. Mohon ditunggu sebentar ya Kak, terima kasih banyak atas kesabarannya! 🙏`,
          modelUsed: "Handover CS Manusia (Persetujuan User)",
          isHandover: true,
          isRestricted: false,
          isFallback: false,
          containerMatched: 'handover' as const,
          isHandedOverToHuman: true,
          fallbackCount: 0,
          waitingHandoverConsent: false
        };
      } else if (isConsentNo) {
        session.waitingHandoverConsent = false;
        session.fallbackCount = 0;
        return {
          replyText: `Baik Kak ${senderName}, siap! Jika ada pertanyaan lain seputar informasi produk atau layanan kami yang bisa saya bantu, silakan tanyakan ya 😊`,
          modelUsed: "Batal Alihkan CS",
          isHandover: false,
          isRestricted: false,
          isFallback: false,
          containerMatched: 'greeting' as const,
          isHandedOverToHuman: false,
          fallbackCount: 0,
          waitingHandoverConsent: false
        };
      }
    }

    // 3. Hasilkan balasan AI
    const result = await this.generateAIResponse(senderName, userMessage, history);
    let { replyText, modelUsed, isHandover, isRestricted, isFallback, containerMatched } = result;

    if (isFallback) {
      session.fallbackCount = (session.fallbackCount || 0) + 1;
      if (session.fallbackCount >= 3) {
        replyText += `\n\nBtw Kak ${senderName}, karena saya belum menemukan informasi detail mengenai hal ini, apakah Kakak ingin obrolan ini kami alihkan ke tim terkait / Customer Service kami agar bisa dibantu langsung? (Ketik *Ya / Boleh* jika berkenan 😊)`;
        session.waitingHandoverConsent = true;
      }
    } else if (!isRestricted && !isHandover) {
      session.fallbackCount = 0;
      session.waitingHandoverConsent = false;
    }

    return {
      replyText,
      modelUsed,
      isHandover,
      isRestricted,
      isFallback,
      containerMatched,
      fallbackCount: session.fallbackCount,
      waitingHandoverConsent: session.waitingHandoverConsent,
      isHandedOverToHuman: session.isHandedOverToHuman
    };
  }

  public async handleAIAutoReply(jid: string, senderName: string, userMessage: string) {
    try {
      const connectedPhone = this.getConnectedPhoneKey();
      let phoneMap = this.chatsByPhone.get(connectedPhone) || this.chatsByPhone.get("default");
      let chat: WAChat | undefined;
      if (phoneMap) {
        chat = phoneMap.get(jid) || Array.from(phoneMap.values()).find(c => c.jid === jid || c.id === jid);
      }

      // 1. JIKA CHAT SUDAH DIALIHKAN KE CS MANUSIA, BOT TIDAK MEMBALAS LAGI
      if (chat?.isHandedOverToHuman) {
        console.log(`[waService] Percakapan ${jid} sedang ditangani CS Manusia. AI auto-reply dilewati.`);
        return;
      }

      const msgLower = userMessage.toLowerCase().trim();

      // 2. CEK STATUS MENUNGGU PERSETUJUAN PENGALIHAN KE CS (SETELAH 3x FALLBACK)
      if (chat?.waitingHandoverConsent) {
        const isConsentYes = /^(ya|iya|boleh|mau|hubungkan|alihkan|tolong|oke|ok|siap|bisa|teruskan|sambungkan|lanjut|y)\b/i.test(msgLower) ||
          msgLower === "ya" || msgLower === "boleh" || msgLower === "mau" || msgLower.includes("hubungkan") || msgLower.includes("alihkan");
        
        const isConsentNo = /^(tidak|enggak|nggak|batal|jangan|skip|ga usah|gak usah|tdk|no)\b/i.test(msgLower) ||
          msgLower.includes("tidak") || msgLower.includes("enggak") || msgLower.includes("nggak") || msgLower.includes("jangan");

        if (isConsentYes && !isConsentNo) {
          const handoverReply = `Baik Kak ${senderName}, percakapan ini sudah saya alihkan ke tim Customer Service kami. Tim kami akan segera merespons dan membantu Kakak secara langsung di sini ya. Terima kasih banyak atas kesabarannya! 🙏`;
          
          chat.isHandedOverToHuman = true;
          chat.waitingHandoverConsent = false;
          chat.fallbackCount = 0;

          await this.executeSendBotReply(jid, senderName, handoverReply, "Handover CS Manusia (Persetujuan User)", true, false);
          return;
        } else if (isConsentNo) {
          const declineReply = `Baik Kak ${senderName}, siap! Jika ada pertanyaan lain seputar produk atau layanan kami yang bisa saya bantu, silakan tanyakan ya 😊`;
          
          chat.waitingHandoverConsent = false;
          chat.fallbackCount = 0;

          await this.executeSendBotReply(jid, senderName, declineReply, "Batal Alihkan CS", false, false);
          return;
        }
      }

      // 3. AMBIL RIWAYAT PESAN TERAKHIR AGAR MEMAHAMI KONTEKS MULTI-TURN
      const recentHistory: { role: 'user' | 'model'; text: string }[] = [];
      if (chat && chat.messages && chat.messages.length > 0) {
        const priorMsgs = chat.messages.slice(-7, -1);
        for (const m of priorMsgs) {
          if (m.text && m.text.trim()) {
            recentHistory.push({
              role: m.fromMe ? 'model' : 'user',
              text: m.text
            });
          }
        }
      }

      // 4. HASILKAN BALASAN AI
      const result = await this.generateAIResponse(senderName, userMessage, recentHistory);
      let { replyText, modelUsed, isHandover, isRestricted, isFallback } = result;

      // 5. ATURAN FALLBACK 3 KALI -> TAWARKAN PENGALIHAN KE TIM CS MANUSIA
      if (isFallback && chat) {
        chat.fallbackCount = (chat.fallbackCount || 0) + 1;
        console.log(`[waService] Fallback terdeteksi untuk ${jid}, hitungan fallback ke-${chat.fallbackCount}`);
        
        if (chat.fallbackCount >= 3) {
          replyText += `\n\nBtw Kak ${senderName}, karena saya belum menemukan informasi detail mengenai hal ini, apakah Kakak ingin saya hubungkan percakapan ini ke tim Customer Service kami agar bisa dibantu langsung? (Ketik *Ya / Boleh* jika berkenan 😊)`;
          chat.waitingHandoverConsent = true;
        }
      } else if (chat && !isFallback && !isRestricted && !isHandover) {
        chat.fallbackCount = 0;
        chat.waitingHandoverConsent = false;
      }

      // 6. KIRIM DAN SIMPAN BALASAN
      await this.executeSendBotReply(jid, senderName, replyText, modelUsed, isHandover, isRestricted);
    } catch (err) {
      console.error("[waService] Error in handleAIAutoReply:", err);
    }
  }

  private async executeSendBotReply(jid: string, senderName: string, replyText: string, modelUsed: string, isHandover: boolean, isRestricted: boolean) {
    // 1. Kirim pesan ke socket WhatsApp
    if (this.socket && this.connectionState === "connected") {
      try {
        await this.socket.sendMessage(jid, { text: replyText });
        console.log(`[waService] Berhasil mengirim pesan bot ke ${jid}`);
      } catch (err) {
        console.warn(`[waService] Gagal kirim pesan ke socket WhatsApp:`, err);
      }
    }

    // 2. Simpan pesan ke riwayat chat
    const connectedPhone = this.getConnectedPhoneKey();
    let phoneMap = this.chatsByPhone.get(connectedPhone) || this.chatsByPhone.get("default");
    if (phoneMap) {
      let chat = phoneMap.get(jid) || Array.from(phoneMap.values()).find(c => c.jid === jid || c.id === jid);
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

    // 3. Simpan log aktivitas bot
    this.aiSettings.logs.unshift({
      id: "log-" + Date.now(),
      timestamp: Date.now(),
      sender: senderName + " (" + jid.split("@")[0] + ")",
      incoming: "Pesan Pengguna",
      reply: replyText,
      modelUsed,
      isHandover,
      isRestricted
    });
    if (this.aiSettings.logs.length > 50) this.aiSettings.logs.pop();
    this.saveSettings({});
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
