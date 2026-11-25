import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ limit: "100mb", extended: true }));

  // Handle PayloadTooLargeError gracefully
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === "entity.too.large" || err.status === 413)) {
      return res.status(413).json({
        success: false,
        error: "Ukuran data/file terlalu besar. Maksimal ukuran payload adalah 100MB."
      });
    }
    next(err);
  });

  // Disable caching for HTML responses to ensure instant UI updates on refresh
  app.use((req, res, next) => {
    if (req.path === "/" || req.path.endsWith(".html") || req.headers.accept?.includes("text/html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    next();
  });

  // WhatsApp Baileys Endpoints (CS AI & Notification Engine & Company AI)
  const { waService } = await import("./server/waService.ts");
  const { waNotifService } = await import("./server/waNotifService.ts");
  const { companyAIService } = await import("./server/companyAiService.ts");
  const { supabaseServer } = await import("./server/supabaseServer.ts");
  
  // Auto-initialize WhatsApp CS & WhatsApp Notifikasi on server startup
  waService.initBaileys().catch((err: any) => console.error("Auto-init WhatsApp CS failed:", err));
  waNotifService.initBaileys().catch((err: any) => console.error("Auto-init WhatsApp Notifikasi failed:", err));

  // --- Company AI Settings & Whitelist Endpoints ---
  app.get("/api/company-ai/status", (_req, res) => {
    res.json({
      success: true,
      connectionState: companyAIService.connectionState,
      qrCodeBase64: companyAIService.qrCodeBase64,
      userPhone: companyAIService.userPhone,
      userName: companyAIService.userName
    });
  });

  app.get("/api/company-ai/settings", async (_req, res) => {
    await companyAIService.syncFromSupabaseCloud().catch(() => {});
    res.json({ success: true, settings: companyAIService.settings });
  });

  app.post("/api/company-ai/settings", async (req, res) => {
    await companyAIService.saveSettings(req.body);
    res.json({ success: true, settings: companyAIService.settings });
  });

  app.post("/api/company-ai/connect", async (_req, res) => {
    await companyAIService.initBaileys();
    res.json({
      success: true,
      connectionState: companyAIService.connectionState,
      qrCodeBase64: companyAIService.qrCodeBase64
    });
  });

  app.post("/api/company-ai/logout", async (_req, res) => {
    companyAIService.connectionState = "disconnected";
    res.json({ success: true, message: "Koneksi Company AI diputuskan." });
  });

  app.post("/api/company-ai/whitelist/add", async (req, res) => {
    const { name, phone, role } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ success: false, error: "Nama dan Nomor WA wajib diisi." });
    }
    const cleanPhone = String(phone).replace(/\D/g, "");
    const newUser = {
      id: "wl-" + Date.now(),
      name: String(name),
      phone: cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone,
      role: role || "sales",
      isActive: true,
      addedAt: Date.now()
    };
    const updatedUsers = [...(companyAIService.settings.whitelistedUsers || []), newUser];
    await companyAIService.saveSettings({ whitelistedUsers: updatedUsers });
    res.json({ success: true, settings: companyAIService.settings });
  });

  app.post("/api/company-ai/whitelist/delete", async (req, res) => {
    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ success: false, error: "ID pengguna tidak ditemukan." });
    }
    const updatedUsers = (companyAIService.settings.whitelistedUsers || []).filter(u => u.id !== id);
    await companyAIService.saveSettings({ whitelistedUsers: updatedUsers });
    res.json({ success: true, settings: companyAIService.settings });
  });

  // WhatsApp Notification Sender Endpoint (Eksklusif Perangkat 2 / Baileys Gateway)
  app.post("/api/send-whatsapp", async (req, res) => {
    const { phone, message, text } = req.body;
    const content = message || text;

    if (!phone || !content) {
      return res.status(400).json({ success: false, error: "Nomor tujuan (phone) dan pesan (message/text) diperlukan." });
    }

    // Perangkat 2 (Baileys WhatsApp Gateway)
    if (waNotifService.connectionState !== "connected") {
      return res.status(503).json({ 
        success: false, 
        error: "WhatsApp Notifikasi (Perangkat 2 / Baileys) belum terhubung. Silakan buka menu Pengaturan WhatsApp Notifikasi dan scan QR Code untuk menghubungkan perangkat.",
        connectionState: waNotifService.connectionState
      });
    }

    try {
      const result = await waNotifService.sendMessage(phone, content);
      if (result.success) {
        return res.json({ success: true, via: "Perangkat 2 (Baileys)", ...result });
      } else {
        return res.status(500).json({ success: false, error: result.error || "Gagal mengirim pesan melalui Perangkat 2 (Baileys)." });
      }
    } catch (err: any) {
      console.error("Gagal kirim via Perangkat 2:", err);
      return res.status(500).json({ success: false, error: err.message || "Gagal mengirim melalui WhatsApp Gateway Perangkat 2." });
    }
  });

  // --- WhatsApp Notifikasi (Perangkat 2) Endpoints ---
  app.get("/api/wa-notif/status", (_req, res) => {
    const isExpired = waNotifService.qrExpired || (waNotifService.connectionState === "disconnected" && waNotifService.isQRExpired());
    res.json({
      success: true,
      connectionState: waNotifService.connectionState,
      qrCodeBase64: waNotifService.qrCodeBase64,
      rawQrCodeBase64: waNotifService.qrCodeBase64,
      qrTimestamp: waNotifService.qrTimestamp,
      qrVersion: waNotifService.qrVersion,
      qrExpired: isExpired && waNotifService.connectionState !== "connected",
      userJid: waNotifService.userJid,
      userPhone: waNotifService.userPhone,
      userName: waNotifService.userName
    });
  });

  app.post("/api/wa-notif/connect", async (req, res) => {
    const force = req.query.force === "true" || req.body?.force === true;
    await waNotifService.initBaileys(force);
    const isExpired = waNotifService.qrExpired || (waNotifService.connectionState === "disconnected" && waNotifService.isQRExpired());
    res.json({
      success: true,
      message: "Inisialisasi WhatsApp Notifikasi (Perangkat 2) dimulai.",
      connectionState: waNotifService.connectionState,
      qrCodeBase64: waNotifService.qrCodeBase64,
      qrVersion: waNotifService.qrVersion,
      qrTimestamp: waNotifService.qrTimestamp,
      qrExpired: isExpired && waNotifService.connectionState !== "connected",
      userPhone: waNotifService.userPhone
    });
  });

  app.post("/api/wa-notif/logout", async (_req, res) => {
    await waNotifService.disconnectSession();
    res.json({ success: true, message: "Sesi WhatsApp Notifikasi berhasil diputuskan." });
  });

  app.post("/api/wa-notif/send", async (req, res) => {
    const { phone, text, message } = req.body;
    const bodyText = text || message;
    if (!phone || !bodyText) {
      return res.status(400).json({ success: false, error: "Nomor tujuan dan teks pesan diperlukan." });
    }
    const result = await waNotifService.sendMessage(phone, bodyText);
    res.json(result);
  });

  app.post("/api/wa-notif/execute-command", async (req, res) => {
    try {
      const { command, superadminName, providedContacts } = req.body || {};
      if (!command || !command.trim()) {
        return res.status(400).json({ success: false, error: "Perintah tidak boleh kosong." });
      }
      const result = await waNotifService.executeRemoteCommand(command, superadminName, providedContacts || []);
      return res.json(result);
    } catch (err: any) {
      console.error("[server] execute-command error:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Gagal memproses perintah WhatsApp Notifikasi di server.",
        targetName: "Error",
        targetPhone: "-",
        messageSent: ""
      });
    }
  });

  app.get("/api/wa-notif/settings", (_req, res) => {
    res.json({ success: true, settings: waNotifService.notifSettings });
  });

  app.post("/api/wa-notif/settings", async (req, res) => {
    const updated = await waNotifService.saveSettings(req.body);
    res.json({ success: true, settings: updated });
  });

  app.get("/api/wa/status", async (_req, res) => {
    const status = await waService.getStatus();
    res.json({
      success: true,
      ...status
    });
  });

  app.post("/api/wa/connect", async (req, res) => {
    const force = req.query.force === "true" || req.body?.force === true;
    await waService.initBaileys(force);
    const status = await waService.getStatus();
    res.json({
      success: true,
      message: "Proses inisialisasi Baileys WhatsApp dimulai.",
      ...status
    });
  });
  app.post("/api/wa/reset-session", async (_req, res) => {
    const result = await waService.resetTotalSession();
    res.json(result);
  });

  app.post("/api/wa-notif/reset-session", async (_req, res) => {
    const result = await waNotifService.resetTotalSession();
    res.json(result);
  });

  app.get("/api/wa/debug", (_req, res) => {
    res.json(waService.getDebugInfo());
  });

  app.post("/api/wa/emergency-wipe", async (_req, res) => {
    console.log("[server] EMERGENCY WIPE REQUESTED");
    await waService.resetTotalSession();
    await waNotifService.resetTotalSession();
    res.json({ success: true, message: "Seluruh folder sesi Baileys telah dibersihkan secara paksa." });
  });

  // Get Chats per Connected Phone Number
  app.get("/api/wa/chats", (req, res) => {
    const requestedPhone = req.query.connectedPhone as string | undefined;
    const list = waService.getChats(requestedPhone);
    const activeTargetPhone = requestedPhone || waService.userPhone || "default";
    res.json({ 
      success: true, 
      connectedPhone: activeTargetPhone,
      chats: list 
    });
  });

  // List all connected numbers that have saved chat history
  app.get("/api/wa/numbers", (_req, res) => {
    res.json({
      success: true,
      activePhone: waService.userPhone,
      numbers: waService.getKnownNumbers()
    });
  });

  // Force sync chats from Supabase
  app.post("/api/wa/sync-supabase", async (req, res) => {
    const phone = req.body?.connectedPhone;
    await waService.syncAllChatsFromSupabase(phone);
    res.json({
      success: true,
      message: "Sinkronisasi riwayat chat dengan Supabase selesai.",
      chats: waService.getChats(phone)
    });
  });

  app.post("/api/wa/send", async (req, res) => {
    const { jid, text } = req.body;
    if (!jid || !text) {
      return res.status(400).json({ success: false, error: "JID dan teks pesan diperlukan." });
    }
    const result = await waService.sendMessage(jid, text);
    res.json(result);
  });

  app.get("/api/wa/settings", (_req, res) => {
    res.json({ success: true, settings: waService.aiSettings });
  });

  app.post("/api/wa/settings", async (req, res) => {
    await waService.saveSettings(req.body);
    res.json({ success: true, settings: waService.aiSettings });
  });

  // Test / Simulate AI Auto-Reply without sending real WhatsApp message
  app.post("/api/wa/test-ai-reply", async (req, res) => {
    try {
      const { message, senderName = "Calon Pelanggan", history, sessionId = "default-sim" } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: "Pesan uji tidak boleh kosong." });
      }
      const result = await waService.simulateAIAutoReply(message, senderName, history, sessionId);
      res.json({
        success: true,
        ...result
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Gagal menguji balasan AI." });
    }
  });

  app.post("/api/wa/reset-sim", (req, res) => {
    const { sessionId = "default-sim" } = req.body;
    waService.resetSimSession(sessionId);
    res.json({ success: true, message: "Sesi simulator berhasil direset." });
  });

  // Reset Knowledge Base to clean default paragraphs & products
  app.post("/api/wa/reset-knowledge", async (_req, res) => {
    try {
      const updatedSettings = await waService.resetKnowledgeToBase();
      res.json({ 
        success: true, 
        message: "Basis pengetahuan berhasil direset ke format default bersih PT. Panca Prima Wijaya.",
        settings: updatedSettings
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Gagal mereset basis pengetahuan." });
    }
  });

  // Manual toggle Handover to Human CS for a specific chat
  app.post("/api/wa/chat-toggle-handover", (req, res) => {
    const { jid, isHandedOver } = req.body;
    if (!jid) {
      return res.status(400).json({ success: false, error: "JID obrolan diperlukan." });
    }
    const success = waService.setChatHandover(jid, Boolean(isHandedOver));
    res.json({ success, isHandedOver: Boolean(isHandedOver) });
  });

  app.post("/api/wa/delete-chat", async (req, res) => {
    const { jid, connectedPhone } = req.body;
    if (!jid) {
      return res.status(400).json({ success: false, error: "JID obrolan diperlukan." });
    }
    await waService.deleteChat(jid, connectedPhone);
    res.json({
      success: true,
      message: "Obrolan berhasil dihapus.",
      chats: waService.getChats(connectedPhone)
    });
  });

  app.delete("/api/wa/chats", async (req, res) => {
    const jid = req.query.jid as string;
    const connectedPhone = req.query.connectedPhone as string | undefined;
    if (!jid) {
      return res.status(400).json({ success: false, error: "JID obrolan diperlukan." });
    }
    await waService.deleteChat(jid, connectedPhone);
    res.json({
      success: true,
      message: "Obrolan berhasil dihapus.",
      chats: waService.getChats(connectedPhone)
    });
  });

  app.post("/api/wa/clear-all-data", async (_req, res) => {
    await waService.clearAllData();
    res.json({ success: true, message: "Seluruh data percakapan WhatsApp dan nomor terhubung berhasil dibersihkan." });
  });

  app.post("/api/wa/logout", async (_req, res) => {
    await waService.disconnectSession();
    res.json({ success: true, message: "Sesi WhatsApp berhasil diputuskan." });
  });

  // Gemini Settings & Multi-Key Storage File
  const GEMINI_SETTINGS_FILE = path.resolve("./gemini-settings.json");

  // Get Gemini Settings (Checks Supabase Cloud first, then fallback to local file)
  app.get("/api/gemini/settings", async (_req, res) => {
    try {
      const fs = await import("fs/promises");
      let data: any = null;

      // 1. Try Supabase cloud database first
      if (supabaseServer) {
        try {
          const { data: dbRow, error } = await supabaseServer
            .from("app_settings")
            .select("value")
            .eq("key", "gemini_settings")
            .maybeSingle();

          if (!error && dbRow?.value && Array.isArray(dbRow.value.apiKeys) && dbRow.value.apiKeys.length > 0) {
            data = dbRow.value;
            // Backup to local file
            await fs.writeFile(GEMINI_SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8").catch(() => {});
          }
        } catch (dbErr) {
          console.warn("[server] Supabase app_settings load notice:", dbErr);
        }
      }

      // 2. Fallback to local file if not loaded from Supabase
      if (!data) {
        try {
          const raw = await fs.readFile(GEMINI_SETTINGS_FILE, "utf-8");
          data = JSON.parse(raw);
        } catch {
          // file doesn't exist yet
        }
      }

      // If env has a default GEMINI_API_KEY and settings has no keys yet, seed it
      const envKey = process.env.GEMINI_API_KEY;
      if ((!data || !Array.isArray(data.apiKeys) || data.apiKeys.length === 0) && envKey) {
        data = {
          apiKeys: [
            {
              id: "key-env-1",
              key: envKey,
              label: "API Key Utama (Environment)",
              isActive: true,
              isExhausted: false,
              successCount: 0,
              failCount: 0
            }
          ],
          activeKeyIndex: 0,
          model: "gemini-3.5-flash",
          temperature: 0.2,
          autoRotate: true,
          lastUpdated: new Date().toISOString()
        };
      }

      res.json({ success: true, settings: data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Save Gemini Settings (Persists to local file AND Supabase Cloud Database)
  app.post("/api/gemini/settings", async (req, res) => {
    try {
      const fs = await import("fs/promises");
      const settings = req.body;
      
      // 1. Write to local file
      await fs.writeFile(GEMINI_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");

      // 2. Persist to Supabase app_settings table
      let cloudSaved = false;
      let cloudError = "";
      if (supabaseServer) {
        try {
          // 1. Try upsert specifying onConflict: 'key'
          let { error } = await supabaseServer.from("app_settings").upsert(
            {
              key: "gemini_settings",
              value: settings,
              updated_at: new Date().toISOString(),
              updated_by: "server_api"
            },
            { onConflict: "key" }
          );

          // 2. Fallback: If unique constraint error occurs, update existing row or insert
          if (error && (error.message.includes("unique constraint") || error.message.includes("duplicate key"))) {
            const { data: existing } = await supabaseServer
              .from("app_settings")
              .select("key")
              .eq("key", "gemini_settings")
              .maybeSingle();

            if (existing) {
              const updateRes = await supabaseServer
                .from("app_settings")
                .update({
                  value: settings,
                  updated_at: new Date().toISOString(),
                  updated_by: "server_api"
                })
                .eq("key", "gemini_settings");
              error = updateRes.error;
            } else {
              const insertRes = await supabaseServer.from("app_settings").insert({
                key: "gemini_settings",
                value: settings,
                updated_at: new Date().toISOString(),
                updated_by: "server_api"
              });
              error = insertRes.error;
            }
          }

          if (!error) {
            cloudSaved = true;
          } else {
            cloudError = error.message;
            console.warn("[server] Supabase app_settings error:", error.message);
          }
        } catch (dbErr: any) {
          cloudError = dbErr.message;
          console.warn("[server] Supabase app_settings upsert error:", dbErr.message);
        }
      }

      // Update in-memory GEMINI_API_KEY for server bot if an active key exists
      if (Array.isArray(settings?.apiKeys)) {
        const activeKey = settings.apiKeys.find((k: any) => k.isActive && !k.isExhausted && k.key?.trim()?.length > 0);
        if (activeKey?.key) {
          process.env.GEMINI_API_KEY = activeKey.key.trim();
        }
      }

      res.json({ 
        success: true, 
        cloudSaved,
        cloudError: cloudError || undefined,
        message: cloudSaved 
          ? "Pengaturan Gemini berhasil disimpan ke Cloud Database Supabase (Aktif di semua perangkat)." 
          : "Pengaturan Gemini berhasil disimpan ke database sistem." 
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Dedicated Live / Voice Call Settings Endpoints
  const GEMINI_LIVE_SETTINGS_FILE = path.resolve(process.cwd(), "gemini-live-settings.json");

  app.get("/api/gemini/live-settings", async (_req, res) => {
    try {
      const fs = await import("fs/promises");
      let data: any = null;

      if (supabaseServer) {
        try {
          const { data: row, error } = await supabaseServer
            .from("app_settings")
            .select("value")
            .eq("key", "gemini_live_settings")
            .maybeSingle();

          if (!error && row?.value) {
            data = row.value;
          }
        } catch (dbErr: any) {
          console.warn("[server] Supabase load live settings fallback to file:", dbErr.message);
        }
      }

      if (!data) {
        try {
          const content = await fs.readFile(GEMINI_LIVE_SETTINGS_FILE, "utf-8");
          data = JSON.parse(content);
        } catch {
          // ignore
        }
      }

      res.json({ success: true, settings: data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/gemini/live-settings", async (req, res) => {
    try {
      const fs = await import("fs/promises");
      const settings = req.body;

      await fs.writeFile(GEMINI_LIVE_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");

      let cloudSaved = false;
      let cloudError = "";
      if (supabaseServer) {
        try {
          let { error } = await supabaseServer.from("app_settings").upsert(
            {
              key: "gemini_live_settings",
              value: settings,
              updated_at: new Date().toISOString(),
              updated_by: "server_api"
            },
            { onConflict: "key" }
          );

          if (error && (error.message.includes("unique constraint") || error.message.includes("duplicate key"))) {
            const { data: existing } = await supabaseServer
              .from("app_settings")
              .select("key")
              .eq("key", "gemini_live_settings")
              .maybeSingle();

            if (existing) {
              const updateRes = await supabaseServer
                .from("app_settings")
                .update({
                  value: settings,
                  updated_at: new Date().toISOString(),
                  updated_by: "server_api"
                })
                .eq("key", "gemini_live_settings");
              error = updateRes.error;
            } else {
              const insertRes = await supabaseServer.from("app_settings").insert({
                key: "gemini_live_settings",
                value: settings,
                updated_at: new Date().toISOString(),
                updated_by: "server_api"
              });
              error = insertRes.error;
            }
          }

          if (!error) cloudSaved = true;
          else cloudError = error.message;
        } catch (dbErr: any) {
          cloudError = dbErr.message;
        }
      }

      res.json({
        success: true,
        cloudSaved,
        cloudError: cloudError || undefined,
        message: cloudSaved
          ? "Pengaturan Gemini Live API berhasil disimpan ke Cloud Database Supabase."
          : "Pengaturan Gemini Live API tersimpan di database sistem."
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Test Gemini API Key
  app.post("/api/gemini/test-key", async (req, res) => {
    const { key, model = "gemini-3.5-flash" } = req.body;
    const cleanKey = (key || "").trim() || process.env.GEMINI_API_KEY || "";
    if (!cleanKey) {
      return res.status(400).json({ success: false, message: "API Key tidak boleh kosong." });
    }

    const startTime = Date.now();
    const candidateModels = [model, "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    const uniqueModels = Array.from(new Set(candidateModels));

    for (const mod of uniqueModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent?key=${cleanKey}`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Halo! Jawab singkat: Sistem Online" }] }],
            generationConfig: { maxOutputTokens: 20, temperature: 0.1 }
          })
        });

        const latencyMs = Date.now() - startTime;
        if (response.ok) {
          const data = await response.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Online";
          return res.json({
            success: true,
            message: `Koneksi Berhasil (${latencyMs}ms) menggunakan model ${mod}: "${reply.trim()}"`,
            latencyMs,
            modelUsed: mod
          });
        }

        if (response.status === 404) {
          continue; // try next model
        }

        const errJson: any = await response.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${response.status} (${response.statusText})`;
        if (response.status === 429 || errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("exhausted")) {
          return res.json({ success: false, message: `Batas kuota terlampaui (429): ${errMsg}`, latencyMs });
        }

        return res.json({ success: false, message: `Gagal: ${errMsg}`, latencyMs });
      } catch (callErr: any) {
        return res.json({ success: false, message: `Kendala Jaringan: ${callErr.message}`, latencyMs: Date.now() - startTime });
      }
    }

    return res.json({ success: false, message: "Model tidak merespons pada endpoint Gemini API.", latencyMs: Date.now() - startTime });
  });

  // ============================================================================
  // HR KANDIDAT ENDPOINTS (Google Drive Folder Scraper, ImageKit Upload, Gemini PDF OCR/AI)
  // ============================================================================

  const extractDriveFolderId = (rawUrlOrId: string): string | null => {
    const trimmed = String(rawUrlOrId || "").trim();
    if (!trimmed) return null;
    if (/^[a-zA-Z0-9_-]{18,}$/.test(trimmed) && !trimmed.includes("http")) {
      return trimmed;
    }
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
    if (folderMatch) return folderMatch[1];
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (idParamMatch) return idParamMatch[1];
    return null;
  };

  const decodeHtmlEntities = (str: string): string => {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
      .trim();
  };

  const resolveImageKitCreds = (ikConfig?: any) => {
    const urlEndpoint = String(
      ikConfig?.urlEndpoint ||
        process.env.VITE_IMAGEKIT_URL_ENDPOINT ||
        process.env.IMAGEKIT_URL_ENDPOINT ||
        ""
    ).trim();
    const publicKey = String(
      ikConfig?.publicKey ||
        process.env.VITE_IMAGEKIT_PUBLIC_KEY ||
        process.env.IMAGEKIT_PUBLIC_KEY ||
        ""
    ).trim();
    const privateKey = String(
      ikConfig?.privateKey ||
        process.env.VITE_IMAGEKIT_PRIVATE_KEY ||
        process.env.IMAGEKIT_PRIVATE_KEY ||
        ""
    ).trim();

    return { urlEndpoint, publicKey, privateKey };
  };

  const uploadPdfBufferToImageKit = async (
    buffer: Buffer,
    fileName: string,
    folderName: string,
    ikCreds: { urlEndpoint: string; publicKey: string; privateKey: string }
  ) => {
    const crypto = await import("crypto");
    const safeFolderSlug =
      String(folderName || "umum")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "umum";

    const cleanFileName = String(fileName || `kandidat_${Date.now()}.pdf`)
      .replace(/[/\\?%*:|"<>]/g, "_")
      .trim();
    const finalFileName = cleanFileName.toLowerCase().endsWith(".pdf")
      ? cleanFileName
      : `${cleanFileName}.pdf`;

    const token = crypto.randomBytes(12).toString("hex");
    const expire = Math.floor(Date.now() / 1000) + 1800;
    const signature = crypto
      .createHmac("sha1", ikCreds.privateKey)
      .update(token + String(expire))
      .digest("hex");

    const formData = new FormData();
    const pdfBlob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
    formData.append("file", pdfBlob, finalFileName);
    formData.append("fileName", finalFileName);
    formData.append("publicKey", ikCreds.publicKey);
    formData.append("signature", signature);
    formData.append("token", token);
    formData.append("expire", String(expire));
    formData.append("useUniqueFileName", "true");
    formData.append("folder", `/mypanca_kandidat/${safeFolderSlug}`);

    const uploadRes = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: formData as any,
    });

    if (!uploadRes.ok) {
      const errTxt = await uploadRes.text();
      let errMsg = `ImageKit error (${uploadRes.status})`;
      try {
        const parsed = JSON.parse(errTxt);
        errMsg = parsed?.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    const ikJson: any = await uploadRes.json();
    return {
      pdfUrl: String(ikJson.url),
      imagekitFileId: String(ikJson.fileId || ""),
      fileName: finalFileName,
      fileSize: Number(ikJson.size || buffer.length),
    };
  };

  const downloadPublicDrivePdfBuffer = async (fileId: string): Promise<Buffer> => {
    const directUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    };

    let response = await fetch(directUrl, { method: "GET", headers, redirect: "follow" });
    let arrayBuf = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuf);

    // Check if Google Drive returned a virus-scan confirmation HTML page
    const headStr = buffer.slice(0, 64).toString("utf-8").trim();
    if (!headStr.startsWith("%PDF")) {
      const html = buffer.toString("utf-8");
      if (
        html.includes("accounts.google.com") ||
        html.includes("ServiceLogin") ||
        html.includes("You need access") ||
        html.includes("Minta akses")
      ) {
        throw new Error(
          "File Google Drive bersifat privat / membutuhkan izin akses. Pastikan link diatur ke 'Siapa saja yang memiliki link (Anyone with the link)'."
        );
      }

      // Extract virus scan / usercontent confirmation URL or form inputs
      const actionMatch = html.match(/<form[^>]+action="([^"]+)"/i);
      const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/i) || html.match(/[?&]confirm=([^&"']+)/i);
      const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/i) || html.match(/[?&]uuid=([^&"']+)/i);

      if (actionMatch || confirmMatch) {
        const baseAction = actionMatch
          ? decodeHtmlEntities(actionMatch[1])
          : "https://drive.usercontent.google.com/download";
        const confirmVal = confirmMatch ? decodeHtmlEntities(confirmMatch[1]) : "t";
        const uuidVal = uuidMatch ? decodeHtmlEntities(uuidMatch[1]) : "";
        const params = new URLSearchParams({
          id: fileId,
          export: "download",
          confirm: confirmVal,
        });
        if (uuidVal) params.set("uuid", uuidVal);

        const retryUrl = baseAction.includes("?") ? `${baseAction}&${params.toString()}` : `${baseAction}?${params.toString()}`;
        const setCookie = response.headers.get("set-cookie");
        const retryHeaders = { ...headers };
        if (setCookie) retryHeaders["Cookie"] = setCookie;

        response = await fetch(retryUrl, { method: "GET", headers: retryHeaders, redirect: "follow" });
        arrayBuf = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      }
    }

    const finalHead = buffer.slice(0, 16).toString("utf-8").trim();
    if (!finalHead.startsWith("%PDF")) {
      throw new Error(
        "File yang diunduh bukan dokumen PDF yang valid atau akses Google Drive masih terkunci."
      );
    }

    return buffer;
  };

  const resolveServerGeminiKeys = async (providedKey?: string): Promise<string[]> => {
    const keys: string[] = [];
    const pushKey = (k?: string) => {
      const clean = String(k || "").trim();
      if (clean && !keys.includes(clean)) keys.push(clean);
    };

    pushKey(providedKey);
    pushKey(process.env.GEMINI_API_KEY);

    // Check gemini-settings.json
    try {
      const fsp = await import("fs/promises");
      const raw = await fsp.readFile(GEMINI_SETTINGS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.apiKeys)) {
        parsed.apiKeys
          .filter((k: any) => k?.isActive && !k?.isExhausted && k?.key)
          .forEach((k: any) => pushKey(k.key));
        parsed.apiKeys
          .filter((k: any) => k?.key)
          .forEach((k: any) => pushKey(k.key));
      }
    } catch {}

    // Check Supabase app_settings
    if (supabaseServer) {
      try {
        const { data: row } = await supabaseServer
          .from("app_settings")
          .select("value")
          .eq("key", "gemini_settings")
          .maybeSingle();
        if (row?.value && Array.isArray(row.value.apiKeys)) {
          row.value.apiKeys
            .filter((k: any) => k?.isActive && !k?.isExhausted && k?.key)
            .forEach((k: any) => pushKey(k.key));
          row.value.apiKeys
            .filter((k: any) => k?.key)
            .forEach((k: any) => pushKey(k.key));
        }
      } catch {}
    }

    return keys;
  };

  // 1. Parse Public Google Drive Folder URL for PDF Files
  app.post("/api/hr/candidates/parse-drive-folder", async (req, res) => {
    try {
      const { folderUrl } = req.body || {};
      const folderId = extractDriveFolderId(folderUrl);
      if (!folderId) {
        return res.status(400).json({
          success: false,
          error: "Link folder Google Drive tidak valid. Pastikan Anda menyalin URL folder Google Drive lengkap.",
        });
      }

      // Optional Google Drive API fallback if key exists in server env
      const driveApiKey = process.env.GOOGLE_DRIVE_API_KEY;
      if (driveApiKey) {
        try {
          const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
          const apiUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&pageSize=100&key=${encodeURIComponent(driveApiKey)}`;
          const apiRes = await fetch(apiUrl);
          if (apiRes.ok) {
            const apiJson: any = await apiRes.json();
            const allFiles = Array.isArray(apiJson.files) ? apiJson.files : [];
            const pdfFiles = allFiles
              .filter(
                (f: any) =>
                  f.mimeType === "application/pdf" ||
                  String(f.name || "").toLowerCase().endsWith(".pdf")
              )
              .map((f: any) => ({
                fileId: String(f.id),
                fileName: String(f.name || `${f.id}.pdf`),
                driveUrl: `https://drive.google.com/file/d/${f.id}/view`,
                fileSize: Number(f.size || 0),
                isPdf: true,
              }));
            return res.json({
              success: true,
              folderId,
              totalDetected: allFiles.length,
              files: pdfFiles,
            });
          }
        } catch {}
      }

      // Public HTML embeddedfolderview scraping (No OAuth / API key required)
      const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
      const htmlRes = await fetch(embedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow",
      });

      const html = await htmlRes.text();
      if (!htmlRes.ok || html.includes("accounts.google.com/ServiceLogin") || html.includes("You need permission")) {
        return res.status(403).json({
          success: false,
          error:
            "Folder Google Drive tidak dapat diakses secara publik. Pastikan setting berbagi folder adalah 'Siapa saja yang memiliki link (Viewer)'.",
        });
      }

      const detectedMap = new Map<string, { fileId: string; fileName: string; driveUrl: string; isPdf: boolean }>();

      // Pattern 1: flip-entry blocks in embeddedfolderview
      const entryRegex = /id="entry-([a-zA-Z0-9_-]{10,})"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/gi;
      let match: RegExpExecArray | null;
      while ((match = entryRegex.exec(html)) !== null) {
        const fileId = match[1];
        const rawTitle = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ""));
        if (fileId && rawTitle && !detectedMap.has(fileId)) {
          const isPdf = rawTitle.toLowerCase().endsWith(".pdf");
          detectedMap.set(fileId, {
            fileId,
            fileName: rawTitle,
            driveUrl: `https://drive.google.com/file/d/${fileId}/view`,
            isPdf,
          });
        }
      }

      // Pattern 2: Fallback link scanning for /file/d/<ID>/
      if (detectedMap.size === 0) {
        const linkRegex = /href="https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        while ((match = linkRegex.exec(html)) !== null) {
          const fileId = match[1];
          const rawTitle = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ""));
          if (fileId && rawTitle && !detectedMap.has(fileId)) {
            detectedMap.set(fileId, {
              fileId,
              fileName: rawTitle,
              driveUrl: `https://drive.google.com/file/d/${fileId}/view`,
              isPdf: rawTitle.toLowerCase().endsWith(".pdf"),
            });
          }
        }
      }

      const allEntries = Array.from(detectedMap.values());
      const pdfEntries = allEntries.filter((e) => e.isPdf);

      return res.json({
        success: true,
        folderId,
        totalDetected: allEntries.length,
        nonPdfSkipped: allEntries.length - pdfEntries.length,
        files: pdfEntries,
      });
    } catch (err: any) {
      console.error("[HR Kandidat] parse-drive-folder error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Gagal membaca isi folder Google Drive.",
      });
    }
  });

  // 2. Import Single Public Google Drive PDF -> Upload to ImageKit
  app.post("/api/hr/candidates/import-drive-file", async (req, res) => {
    try {
      const { fileId, fileName, folderName, ikConfig } = req.body || {};
      if (!fileId) {
        return res.status(400).json({ success: false, error: "fileId Google Drive wajib diisi." });
      }

      const ikCreds = resolveImageKitCreds(ikConfig);
      if (!ikCreds.urlEndpoint || !ikCreds.publicKey || !ikCreds.privateKey) {
        return res.status(400).json({
          success: false,
          error:
            "Konfigurasi ImageKit belum lengkap. Silakan lengkapi URL Endpoint, Public Key, dan Private Key di pengaturan ImageKit terlebih dahulu.",
        });
      }

      const buffer = await downloadPublicDrivePdfBuffer(String(fileId));
      const uploaded = await uploadPdfBufferToImageKit(
        buffer,
        String(fileName || `${fileId}.pdf`),
        String(folderName || "umum"),
        ikCreds
      );

      return res.json({
        success: true,
        ...uploaded,
        driveFileId: String(fileId),
        driveFileUrl: `https://drive.google.com/file/d/${fileId}/view`,
      });
    } catch (err: any) {
      console.error("[HR Kandidat] import-drive-file error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Gagal menarik PDF dari Google Drive ke ImageKit.",
      });
    }
  });

  // 3. Upload Manual PDF Base64 -> ImageKit
  app.post("/api/hr/candidates/upload-manual-pdf", async (req, res) => {
    try {
      const { fileName, fileBase64, folderName, ikConfig } = req.body || {};
      if (!fileBase64) {
        return res.status(400).json({ success: false, error: "File PDF wajib dipilih." });
      }

      const ikCreds = resolveImageKitCreds(ikConfig);
      if (!ikCreds.urlEndpoint || !ikCreds.publicKey || !ikCreds.privateKey) {
        return res.status(400).json({
          success: false,
          error:
            "Konfigurasi ImageKit belum lengkap. Silakan atur kredensial ImageKit di tombol Konfigurasi ImageKit.",
        });
      }

      const cleanBase64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const head = buffer.slice(0, 12).toString("utf-8").trim();
      if (!head.startsWith("%PDF")) {
        return res.status(400).json({
          success: false,
          error: "File yang diunggah bukan format PDF yang valid.",
        });
      }

      const uploaded = await uploadPdfBufferToImageKit(
        buffer,
        String(fileName || `cv_${Date.now()}.pdf`),
        String(folderName || "umum"),
        ikCreds
      );

      return res.json({
        success: true,
        ...uploaded,
      });
    } catch (err: any) {
      console.error("[HR Kandidat] upload-manual-pdf error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Gagal mengunggah PDF ke ImageKit.",
      });
    }
  });

  // 4. Analyze Candidate PDF via Gemini Multimodal InlineData
  app.post("/api/hr/candidates/analyze-pdf", async (req, res) => {
    try {
      const { pdfUrl, pdfBase64, fileName, folderName, preferredModel, apiKey } = req.body || {};

      let base64Data = String(pdfBase64 || "").replace(/^data:[^;]+;base64,/, "").trim();
      if (!base64Data) {
        if (!pdfUrl) {
          return res.status(400).json({
            success: false,
            error: "pdfUrl atau pdfBase64 diperlukan untuk analisa AI.",
          });
        }
        const pdfRes = await fetch(String(pdfUrl));
        if (!pdfRes.ok) {
          return res.status(400).json({
            success: false,
            error: `Gagal mengunduh file PDF dari ImageKit (HTTP ${pdfRes.status}).`,
          });
        }
        const arrBuf = await pdfRes.arrayBuffer();
        const buf = Buffer.from(arrBuf);
        if (buf.length > 18 * 1024 * 1024) {
          return res.status(400).json({
            success: false,
            error: "Ukuran PDF melebihi batas 18MB untuk analisa langsung Gemini.",
          });
        }
        base64Data = buf.toString("base64");
      }

      const geminiKeys = await resolveServerGeminiKeys(apiKey);
      if (geminiKeys.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            "API Key Gemini belum dikonfigurasi. Silakan atur API Key Gemini di menu Settings CRM terlebih dahulu.",
        });
      }

      const promptText = `Anda adalah HR Recruitment Analyst profesional. Baca dan analisa SELURUH isi dokumen PDF CV / Surat Lamaran kerja berikut secara teliti (Folder/Posisi Target: "${folderName || 'Umum'}", Nama File: "${fileName || 'CV.pdf'}").

Ekstrak informasi faktual yang tertulis di dalam PDF menjadi JSON murni (TANPA markdown fence \`\`\`, hanya objek JSON valid) dengan struktur persis berikut:
{
  "nama_kandidat": "Nama lengkap pelamar sesuai CV (atau nama file jika benar-benar tidak tercantum)",
  "email": "Alamat email pelamar atau string kosong",
  "no_hp": "Nomor HP / WhatsApp pelamar atau string kosong",
  "domisili": "Kota/kabupaten tempat tinggal atau string kosong",
  "posisi_dilamar": "Jabatan/posisi yang dilamar sesuai CV atau folder",
  "pendidikan": "Pendidikan terakhir beserta jurusan & universitas/sekolah",
  "pengalaman_tahun": "Estimasi total lama pengalaman kerja (misal: '3 Tahun' atau 'Fresh Graduate')",
  "pengalaman_utama": "Ringkasan riwayat pekerjaan perusahaan, jabatan & tahun secara padat (maks 400 karakter)",
  "skills": ["Skill 1", "Skill 2", "Skill 3"],
  "ringkasan_ai": "Ringkasan profil kandidat 2-3 kalimat yang objektif untuk HRD",
  "kelebihan_utama": "2-3 poin nilai jual / keunggulan utama kandidat berdasarkan CV",
  "ai_full_text": "Ekstraksi rinci & terstruktur isi lengkap CV mencakup profil, seluruh riwayat kerja & pencapaian angka, pendidikan, sertifikasi, dan keahlian (800-1800 karakter) agar HR bisa menanyakan detail isi CV lewat AI Chat."
}

ATURAN MUTLAK:
- Hanya tulis fakta yang benar-benar ada di PDF, dilarang mengarang data fiktif.
- Gunakan Bahasa Indonesia yang rapi dan profesional.`;

      const modelCandidates = Array.from(
        new Set([
          preferredModel || "gemini-2.5-flash",
          "gemini-2.5-flash",
          "gemini-3.5-flash",
          "gemini-2.0-flash",
        ])
      );

      let lastErr = "Gagal menghubungi Gemini API.";
      for (const gKey of geminiKeys) {
        for (const mod of modelCandidates) {
          try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent?key=${encodeURIComponent(gKey)}`;
            const aiRes = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [
                      { text: promptText },
                      {
                        inlineData: {
                          mimeType: "application/pdf",
                          data: base64Data,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 4096,
                  responseMimeType: "application/json",
                },
              }),
            });

            if (aiRes.status === 404) {
              continue; // try next model alias
            }

            const aiJson: any = await aiRes.json().catch(() => ({}));
            if (!aiRes.ok) {
              lastErr = aiJson?.error?.message || `HTTP ${aiRes.status}`;
              if (
                aiRes.status === 429 ||
                lastErr.toLowerCase().includes("quota") ||
                lastErr.toLowerCase().includes("exhausted") ||
                aiRes.status === 401 ||
                aiRes.status === 403
              ) {
                break; // rotate to next API key
              }
              continue;
            }

            const rawText = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (!rawText.trim()) {
              lastErr = "Gemini mengembalikan respons kosong.";
              continue;
            }

            let parsed: any = null;
            try {
              const cleaned = rawText
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/```$/i, "")
                .trim();
              parsed = JSON.parse(cleaned);
            } catch {
              const objMatch = rawText.match(/\{[\s\S]*\}/);
              if (objMatch) {
                parsed = JSON.parse(objMatch[0]);
              }
            }

            if (!parsed || typeof parsed !== "object") {
              lastErr = "Format JSON hasil pembacaan PDF tidak valid.";
              continue;
            }

            return res.json({
              success: true,
              modelUsed: mod,
              analysis: {
                nama_kandidat: String(parsed.nama_kandidat || fileName?.replace(/\.pdf$/i, "") || "Kandidat"),
                email: String(parsed.email || ""),
                no_hp: String(parsed.no_hp || ""),
                domisili: String(parsed.domisili || ""),
                posisi_dilamar: String(parsed.posisi_dilamar || folderName || ""),
                pendidikan: String(parsed.pendidikan || ""),
                pengalaman_tahun: String(parsed.pengalaman_tahun || ""),
                pengalaman_utama: String(parsed.pengalaman_utama || ""),
                skills: Array.isArray(parsed.skills)
                  ? parsed.skills.map(String).filter(Boolean).slice(0, 15)
                  : [],
                ringkasan_ai: String(parsed.ringkasan_ai || ""),
                kelebihan_utama: String(parsed.kelebihan_utama || ""),
                ai_full_text: String(parsed.ai_full_text || parsed.ringkasan_ai || ""),
              },
            });
          } catch (loopErr: any) {
            lastErr = loopErr?.message || lastErr;
          }
        }
      }

      return res.status(502).json({
        success: false,
        error: lastErr,
      });
    } catch (err: any) {
      console.error("[HR Kandidat] analyze-pdf error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Gagal menganalisa file PDF dengan AI.",
      });
    }
  });

  // Serve static dist in production, fallback to Vite middleware if dist not yet built
  const distPath = path.resolve(process.cwd(), "dist");
  const indexPath = path.join(distPath, "index.html");

  if (fs.existsSync(indexPath)) {
    console.log(`[server] Serving static build from: ${distPath}`);
    app.use(express.static(distPath, {
      setHeaders: (res, filepath) => {
        if (filepath.endsWith('.html')) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      }
    }));
    app.use((_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(indexPath);
    });
  } else {
    console.log("[server] 'dist/index.html' not found, using Vite dev middleware");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
