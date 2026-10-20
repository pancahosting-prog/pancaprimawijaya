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
        version,
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
    }
    if (!clean.includes("@s.whatsapp.net")) {
      clean = clean + "@s.whatsapp.net";
    }
    return clean;
  }

  public async sendMessage(targetPhoneOrJid: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (this.connectionState !== "connected" || !this.socket) {
      return { success: false, error: "Perangkat WhatsApp Notifikasi belum terhubung (Scan QR terlebih dahulu)." };
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
  public async executeRemoteCommand(command: string, superadminName: string = "Superadmin"): Promise<{
    success: boolean;
    targetName: string;
    targetPhone: string;
    messageSent: string;
    error?: string;
  }> {
    try {
      console.log(`[waNotifService] Remote command from ${superadminName}: "${command}"`);

      // 1. Fetch potential targets from Supabase Cloud / local DB
      let customers: any[] = [];
      let employees: any[] = [];
      let appUsers: any[] = [];

      if (supabaseServer) {
        try {
          const [cRes, eRes, uRes] = await Promise.all([
            supabaseServer.from("customers").select("*"),
            supabaseServer.from("employees").select("*"),
            supabaseServer.from("app_users").select("*")
          ]);
          customers = cRes.data || [];
          employees = eRes.data || [];
          appUsers = uRes.data || [];
        } catch (dbErr) {
          console.warn("[waNotifService] Supabase load error:", dbErr);
        }
      }

      // Extract target name/phone and message from command
      // Examples: "kirim pesan ke maria: tolong followup cust A", "kirim wa ke 08123456789: halo maria"
      const cleanCmd = command.trim();
      let targetName = "";
      let targetPhone = "";
      let messageContent = "";

      // Check if command specifies target explicitly after "ke "
      const matchWithColon = cleanCmd.match(/kirim\s+(?:pesan|wa|whatsapp|notifikasi)?\s*ke\s+([^:]+):\s*(.+)/i);
      
      if (matchWithColon) {
        const rawTarget = matchWithColon[1].trim();
        messageContent = matchWithColon[2].trim();

        // Check if rawTarget is a direct phone number
        if (/^[0-9+]+$/.test(rawTarget.replace(/\s/g, ""))) {
          targetPhone = rawTarget.replace(/[^0-9]/g, "");
          targetName = targetPhone;
        } else {
          targetName = rawTarget;
        }
      } else {
        // Fallback pattern matching
        const words = cleanCmd.split(/\s+/);
        messageContent = cleanCmd;

        // Find any contact name mentioned
        const targetPersonMatch = cleanCmd.match(/(?:ke|untuk|kepada)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:tolong|pesan|minta|agar|untuk|isi)|$)/i);
        if (targetPersonMatch) {
          targetName = targetPersonMatch[1].trim();
        }
      }

      // Search registered contact by targetName in customers/employees/users
      if (targetName && !targetPhone) {
        const searchLower = targetName.toLowerCase();
        
        // Search in customers
        const foundCustomer = customers.find(c => 
          (c.nama || "").toLowerCase().includes(searchLower) || 
          (c.pic || "").toLowerCase().includes(searchLower)
        );

        if (foundCustomer && (foundCustomer.whatsapp || foundCustomer.phone)) {
          targetPhone = foundCustomer.whatsapp || foundCustomer.phone;
          targetName = foundCustomer.nama;
        } else {
          // Search in employees
          const foundEmp = employees.find(e => (e.nama || "").toLowerCase().includes(searchLower));
          if (foundEmp && foundEmp.whatsapp) {
            targetPhone = foundEmp.whatsapp;
            targetName = foundEmp.nama;
          } else {
            // Search in app_users
            const foundUser = appUsers.find(u => (u.nama || "").toLowerCase().includes(searchLower));
            if (foundUser && foundUser.whatsapp) {
              targetPhone = foundUser.whatsapp;
              targetName = foundUser.nama;
            }
          }
        }
      }

      if (!targetPhone) {
        return {
          success: false,
          targetName: targetName || "Tidak Diketahui",
          targetPhone: "-",
          messageSent: messageContent,
          error: `Nomor WhatsApp terdaftar untuk kontak "${targetName || "penerima"}" tidak ditemukan di database sistem.`
        };
      }

      // Check device connection
      if (this.connectionState !== "connected") {
        return {
          success: false,
          targetName,
          targetPhone,
          messageSent: messageContent,
          error: "Perangkat WhatsApp Notifikasi (Perangkat 2) belum terhubung. Silakan scan QR code di menu Pengaturan Notifikasi."
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
}

export const waNotifService = new WANotifService();
