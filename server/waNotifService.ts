import express from "express";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { supabaseServer } from "./supabaseServer.ts";

const SESSION_DIR = path.resolve("./wa-notif-session");
const SETTINGS_FILE = path.resolve("./wa-notif-settings.json");

export interface WANotifSettings {
  autoReminderEnabled: boolean;
  billingReminderTemplate: string;
  followupReminderTemplate: string;
  dueDateReminderDays: number;
  lastRunAt?: string;
  logs: {
    id: string;
    timestamp: number;
    targetPhone: string;
    targetName: string;
    message: string;
    status: 'success' | 'failed';
    type: 'billing' | 'followup' | 'remote_command' | 'manual';
  }[];
}

class WANotifService {
  private socket: any = null;
  public qrCodeBase64: string | null = null;
  public qrTimestamp: number = 0;
  public qrVersion: number = 0;
  public qrExpired: boolean = false;
  public connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  public userJid: string | null = null;
  public userPhone: string | null = null;
  public userName: string | null = null;
  public notifSettings: WANotifSettings;

  constructor() {
    this.notifSettings = this.loadSettings();
  }

  private loadSettings(): WANotifSettings {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn("[waNotifService] Failed loading settings file, using default.");
    }
    return {
      autoReminderEnabled: true,
      billingReminderTemplate: "Halo {nama}, ini adalah pengingat dari sistem bahwa tagihan No. Transaksi {noTrx} sebesar Rp {nominal} jatuh tempo pada {tanggal}. Mohon segera melakukan pembayaran. Terima kasih!",
      followupReminderTemplate: "Halo {nama}, menyambung penawaran No. {noTrx} terkait {produk}, apakah ada hal yang perlu kami bantu lebih lanjut?",
      dueDateReminderDays: 3,
      logs: []
    };
  }

  public async saveSettings(newSettings: Partial<WANotifSettings>): Promise<WANotifSettings> {
    this.notifSettings = { ...this.notifSettings, ...newSettings };
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.notifSettings, null, 2), "utf-8");
    } catch (e) {
      console.error("[waNotifService] Error saving settings:", e);
    }
    return this.notifSettings;
  }

  public isQRExpired(): boolean {
    if (this.connectionState === "connected") return false;
    if (!this.qrCodeBase64) return true;
    return (Date.now() - this.qrTimestamp) > 60000;
  }

  public async initBaileys(forceNew: boolean = false): Promise<void> {
    if (this.connectionState === "connecting" && !forceNew) return;

    try {
      this.connectionState = "connecting";
      const baileys = await import("@whiskeysockets/baileys");
      const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

      if (forceNew && this.socket) {
        try { this.socket.ev.removeAllListeners(); this.socket.end(undefined); } catch {}
        this.socket = null;
      }

      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      const pino = (await import("pino")).default;
      const logger = pino({ level: "silent" });

      this.socket = makeWASocket({
        version: version as any,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ["MyPanca Notification WA", "Chrome", "1.0.0"],
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        retryRequestDelayMs: 2000,
      });

      this.socket.ev.on("creds.update", saveCreds);

      this.socket.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeBase64 = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
            this.qrTimestamp = Date.now();
            this.qrVersion += 1;
            this.qrExpired = false;
            this.connectionState = "disconnected";
          } catch (qrErr) {
            console.error("[waNotifService] Failed converting QR code:", qrErr);
          }
        }

        if (connection === "open") {
          this.connectionState = "connected";
          this.qrCodeBase64 = null;
          this.qrExpired = false;

          const user = this.socket.user;
          if (user) {
            this.userJid = user.id;
            let rawNum = user.id.split("@")[0].split(":")[0];
            if (rawNum.startsWith("62")) {
              this.userPhone = "0" + rawNum.slice(2);
            } else if (!rawNum.startsWith("0")) {
              this.userPhone = "0" + rawNum;
            } else {
              this.userPhone = rawNum;
            }
            this.userName = user.name || user.verifiedName || "WA Notifikasi MyPanca";
          }
          console.log(`[waNotifService] Connected successfully as: ${this.userPhone}`);
        }

        if (connection === "close") {
          this.connectionState = "disconnected";
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`[waNotifService] Connection closed, status: ${statusCode}, reconnect: ${shouldReconnect}`);

          if (shouldReconnect) {
            setTimeout(() => this.initBaileys(), 3000);
          } else {
            this.qrCodeBase64 = null;
            this.userJid = null;
            this.userPhone = null;
            this.userName = null;
          }
        }
      });
    } catch (err) {
      console.error("[waNotifService] Error in initBaileys:", err);
      this.connectionState = "disconnected";
    }
  }

  public async disconnectSession(): Promise<void> {
    try {
      if (this.socket) {
        await this.socket.logout().catch(() => {});
        this.socket.end(undefined);
        this.socket = null;
      }
      this.connectionState = "disconnected";
      this.qrCodeBase64 = null;
      this.userJid = null;
      this.userPhone = null;
      this.userName = null;

      if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      }
    } catch (err) {
      console.error("[waNotifService] Error disconnecting session:", err);
    }
  }

  public formatJid(phone: string): string {
    let clean = phone.replace(/[^0-9]/g, "");
    if (clean.startsWith("0")) {
      clean = "62" + clean.slice(1);
    } else if (clean.startsWith("8")) {
      clean = "62" + clean;
    }
    if (!clean.endsWith("@s.whatsapp.net")) {
      clean = clean + "@s.whatsapp.net";
    }
    return clean;
  }

  public async sendMessage(targetPhoneOrJid: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (this.connectionState !== "connected" || !this.socket) {
      return { success: false, error: "Perangkat WhatsApp Notifikasi (Perangkat 2) belum terhubung. Silakan scan QR code di menu Pengaturan Aplikasi & Notifikasi terlebih dahulu." };
    }

    try {
      const jid = this.formatJid(targetPhoneOrJid);
      const res = await this.socket.sendMessage(jid, { text });
      
      // Log notification
      const logEntry = {
        id: "log-" + Date.now(),
        timestamp: Date.now(),
        targetPhone: targetPhoneOrJid,
        targetName: targetPhoneOrJid,
        message: text,
        status: "success" as const,
        type: "manual" as const
      };
      this.notifSettings.logs = [logEntry, ...(this.notifSettings.logs || []).slice(0, 49)];
      this.saveSettings(this.notifSettings).catch(() => {});

      return { success: true, messageId: res?.key?.id || "notif-" + Date.now() };
    } catch (err: any) {
      console.error("[waNotifService] Send notification failed:", err);
      return { success: false, error: err.message || "Gagal mengirim pesan notifikasi." };
    }
  }

  // Execute Remote Command from Superadmin via AI Chat (/app)
  public async executeRemoteCommand(command: string, superadminName: string = "Superadmin", providedContacts: any[] = []): Promise<{
    success: boolean;
    targetName: string;
    targetPhone: string;
    messageSent: string;
    error?: string;
  }> {
    try {
      console.log(`[waNotifService] Remote command from ${superadminName}: "${command}"`);

      // 1. Fetch potential targets from Supabase Cloud
      let customers: any[] = [];
      let employees: any[] = [];
      let appUsers: any[] = [];
      let usersList: any[] = [];
      let contactsList: any[] = [];

      if (supabaseServer) {
        try {
          const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ data: [] }), 2000));
          const [cRes, eRes, uRes, usersRes, ctRes, uaRes] = await Promise.all([
            Promise.race([Promise.resolve(supabaseServer.from("customers").select("nama, whatsapp, phone, no_hp")), timeoutPromise]).catch(() => ({ data: [] })),
            Promise.race([Promise.resolve(supabaseServer.from("employees").select("nama, username, whatsapp, phone, no_hp")), timeoutPromise]).catch(() => ({ data: [] })),
            Promise.race([Promise.resolve(supabaseServer.from("app_users").select("nama, username, whatsapp, phone, no_hp")), timeoutPromise]).catch(() => ({ data: [] })),
            Promise.race([Promise.resolve(supabaseServer.from("users").select("nama, username, whatsapp, phone, no_hp")), timeoutPromise]).catch(() => ({ data: [] })),
            Promise.race([Promise.resolve(supabaseServer.from("contacts").select("nama, whatsapp, phone, no_hp")), timeoutPromise]).catch(() => ({ data: [] })),
            Promise.race([Promise.resolve(supabaseServer.from("user_accounts").select("nama, username, whatsapp, phone, no_hp")), timeoutPromise]).catch(() => ({ data: [] }))
          ]);
          customers = (cRes as any)?.data || [];
          employees = (eRes as any)?.data || [];
          appUsers = (uRes as any)?.data || [];
          usersList = (usersRes as any)?.data || [];
          contactsList = (ctRes as any)?.data || [];
          const userAccounts = (uaRes as any)?.data || [];
          userAccounts.forEach(u => addRecord(u, "UserAccount"));
        } catch (dbErr) {
          console.warn("[waNotifService] Supabase load error:", dbErr);
        }
      }

      // Combine all user & contact records for matching
      const allContactRecords: { name: string; username?: string; phone: string; role?: string; type: string }[] = [];

      const addRecord = (item: any, type: string) => {
        if (!item || typeof item !== "object") return;
        const name = (item.nama || item.name || item.username || item.nama_lengkap || item.namaLengkap || item.pic || item.email || "").toString().trim();
        const username = (item.username || "").toString().trim();
        const rawPhone = (item.whatsapp || item.phone || item.no_hp || item.no_wa || item.telepon || item.noHp || item.noWa || item.mobile || item.contact || "").toString().trim();
        const phone = rawPhone.replace(/[^0-9]/g, "");
        if (name && phone) {
          allContactRecords.push({ name, username, phone, role: item.role, type });
        }
      };

      // Ingest provided contacts first (from client state / props)
      if (Array.isArray(providedContacts)) {
        providedContacts.forEach(c => addRecord(c, "Client State"));
      }

      // Ingest users from Menu Users (app_users, users, user_accounts)
      appUsers.forEach(u => addRecord(u, "User"));
      usersList.forEach(u => addRecord(u, "User"));

      // Ingest employees and customers
      employees.forEach(e => addRecord(e, "Karyawan"));
      customers.forEach(c => addRecord(c, "Pelanggan"));
      contactsList.forEach(c => addRecord(c, "Kontak"));

      // Ingest default system accounts if not already loaded from DB/client
      const DEFAULT_SYSTEM_ACCOUNTS = [
        { nama: "Maria", username: "maria1", whatsapp: "628000000003", role: "admin" },
        { nama: "Super Admin", username: "superadmin", whatsapp: "6285313200188", role: "superadmin" }
      ];
      DEFAULT_SYSTEM_ACCOUNTS.forEach(acc => {
        const exists = allContactRecords.some(r => 
          (r.username && r.username.toLowerCase() === acc.username.toLowerCase()) || 
          r.name.toLowerCase() === acc.nama.toLowerCase()
        );
        if (!exists) {
          addRecord(acc, "Default");
        }
      });

      // Extract target name/phone and message from command
      // Strip outer quotes (both standard " / ' and Unicode smart quotes “ ” ‘ ’), backticks, brackets
      let cleanCmd = command
        .trim()
        .replace(/^["'“‘”’`«»]+|["'“‘”’`«»]+$/g, "")
        .replace(/^["'“‘”’`«»]+|["'“‘”’`«»]+$/g, "")
        .trim();

      // Strip conversational leading greetings / AI fillers
      cleanCmd = cleanCmd
        .replace(/^(?:halo\s+|hai\s+|hi\s+)?(?:ai|asisten|bot)?[\s,:]*(?:tolong\s+|mohon\s+|bantu\s+|coba\s+|minta\s+)?/i, "")
        .trim();

      let targetName = "";
      let targetPhone = "";
      let messageContent = "";

      // 1. Check if command matches: kirim [pesan/wa] ke [target] : [pesan]
      const colonMatch = cleanCmd.match(/(?:kirim(?:kan)?\s+(?:pesan|wa|whatsapp|notifikasi)?|wa|pesan)?\s*(?:ke|kepada|untuk)\s+([^:,\n-]+?)\s*[:,\-]\s*(.+)$/i);
      
      // 2. Check if command matches without colon: kirim [pesan/wa] ke [target] [pesan]
      const withoutColonMatch = cleanCmd.match(/(?:kirim(?:kan)?\s+(?:pesan|wa|whatsapp|notifikasi)?|wa|pesan)?\s*(?:ke|kepada|untuk)\s+([a-zA-Z0-9\+._]+)\s+(?:bahwa\s+|isi\s+pesan(?:nya)?\s*[:\s]*|pesan\s*[:\s]*|tolong\s+|minta\s+)?(.+)$/i);

      if (colonMatch) {
        targetName = colonMatch[1].trim();
        messageContent = colonMatch[2].trim();
      } else if (withoutColonMatch) {
        targetName = withoutColonMatch[1].trim();
        messageContent = withoutColonMatch[2].trim();
      } else {
        // Fallback: search for " ke " or " kepada " or " untuk "
        const keMatch = cleanCmd.match(/(?:ke|kepada|untuk)\s+([^:,\n\s]+)(?:[\s:]+(.+))?$/i);
        if (keMatch) {
          targetName = keMatch[1].trim();
          messageContent = (keMatch[2] || cleanCmd).trim();
        } else {
          messageContent = cleanCmd;
        }
      }

      // If targetName is still not found, check if cleanCmd mentions any known contact by name
      if (!targetName) {
        for (const record of allContactRecords) {
          const recName = record.name.trim().toLowerCase();
          if (recName.length >= 3 && cleanCmd.toLowerCase().includes(recName)) {
            targetName = record.name;
            targetPhone = record.phone;
            const idx = cleanCmd.toLowerCase().indexOf(recName);
            const after = cleanCmd.slice(idx + recName.length).replace(/^[\s:,-]+/, '');
            if (after.trim()) {
              messageContent = after.trim();
            }
            break;
          }
        }
      }

      // Clean targetName and messageContent
      targetName = targetName.replace(/[:,\-]/g, "").trim().replace(/^["'“‘”’`]+|["'“‘”’`]+$/g, "").trim();
      messageContent = messageContent
        .replace(/^(?:isi\s+pesan(?:nya)?\s*[:\-]?\s*|pesan\s*[:\-]?\s*|text\s*[:\-]?\s*)/i, "")
        .replace(/^["'“‘”’`]+|["'“‘”’`]+$/g, "")
        .trim();

      // Check if target is directly a phone number
      if (/^[0-9+]+$/.test(targetName.replace(/\s/g, "")) && targetName.replace(/[^0-9]/g, "").length >= 8) {
        targetPhone = targetName.replace(/[^0-9]/g, "");
      }

      // Search matching contact record if phone not yet determined
      if (targetName && !targetPhone) {
        const searchLower = targetName.toLowerCase().trim();

        // 1. Exact match by name or username
        let matched = allContactRecords.find(c => 
          c.name.toLowerCase() === searchLower || 
          (c.username && c.username.toLowerCase() === searchLower)
        );

        // 2. Word boundary / startswith match
        if (!matched) {
          matched = allContactRecords.find(c => {
            const cLower = c.name.toLowerCase();
            const words = cLower.split(/\s+/);
            return words.includes(searchLower) || cLower.startsWith(searchLower) || searchLower.startsWith(cLower);
          });
        }

        // 3. Substring match
        if (!matched) {
          matched = allContactRecords.find(c => 
            c.name.toLowerCase().includes(searchLower) || 
            searchLower.includes(c.name.toLowerCase())
          );
        }

        if (matched) {
          targetPhone = matched.phone;
          targetName = matched.name;
        }
      }

      if (!targetPhone) {
        return {
          success: false,
          targetName: targetName || "Tidak Diketahui",
          targetPhone: "-",
          messageSent: messageContent,
          error: `Nomor WhatsApp terdaftar untuk user/kontak "${targetName || "penerima"}" tidak ditemukan di database sistem. Pastikan nomor terdaftar di menu Users/Kontak.`
        };
      }

      // Check device connection
      if (this.connectionState !== "connected") {
        return {
          success: false,
          targetName,
          targetPhone,
          messageSent: messageContent,
          error: "Perangkat WhatsApp Notifikasi (Perangkat 2) belum terhubung. Silakan scan QR code di menu Pengaturan Aplikasi & Notifikasi terlebih dahulu."
        };
      }

      // Send actual WhatsApp message via Perangkat 2
      const sendRes = await this.sendMessage(targetPhone, messageContent);

      if (!sendRes.success) {
        return {
          success: false,
          targetName,
          targetPhone,
          messageSent: messageContent,
          error: sendRes.error || "Gagal mengirim pesan melalui WhatsApp Notifikasi."
        };
      }

      // Log success
      const logEntry = {
        id: "remote-" + Date.now(),
        timestamp: Date.now(),
        targetPhone,
        targetName,
        message: messageContent,
        status: "success" as const,
        type: "remote_command" as const
      };
      this.notifSettings.logs = [logEntry, ...(this.notifSettings.logs || []).slice(0, 49)];
      this.saveSettings(this.notifSettings).catch(() => {});

      return {
        success: true,
        targetName,
        targetPhone,
        messageSent: messageContent
      };
    } catch (err: any) {
      console.error("[waNotifService] Error executing remote command:", err);
      return {
        success: false,
        targetName: "Error",
        targetPhone: "-",
        messageSent: "",
        error: err.message || "Gagal memproses perintah remote command."
      };
    }
  }

  public async resetTotalSession() {
    console.log("[waNotifService] Performing total Baileys session reset...");
    if (this.socket) {
      try {
        this.socket.ev.removeAllListeners();
        this.socket.end(undefined);
      } catch (e) {}
      this.socket = null;
    }

    this.connectionState = "disconnected";
    this.qrCodeBase64 = null;
    this.qrTimestamp = 0;
    this.userPhone = null;

    try {
      if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        console.log("[waNotifService] Successfully removed wa-notif-session folder.");
      }
    } catch (e) {}

    await this.initBaileys(true);

    return {
      success: true,
      message: "Sesi WhatsApp Notifikasi berhasil di-reset total.",
      connectionState: this.connectionState,
      qrCodeBase64: this.qrCodeBase64,
      userPhone: this.userPhone
    };
  }
}

export const waNotifService = new WANotifService();
