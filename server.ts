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
  app.use(express.json());

  // Disable caching for HTML responses to ensure instant UI updates on refresh
  app.use((req, res, next) => {
    if (req.path === "/" || req.path.endsWith(".html") || req.headers.accept?.includes("text/html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    next();
  });

  // Fonnte API Proxy
  app.post("/api/send-whatsapp", async (req, res) => {
    const { phone, message } = req.body;
    const token = process.env.FONNTE_TOKEN;

    if (!token) {
      return res.status(500).json({ error: "Fonnte token not configured" });
    }

    try {
      const response = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          "Authorization": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target: phone,
          message: message,
        }),
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to send WhatsApp message" });
    }
  });

  // WhatsApp Baileys Endpoints
  const { waService } = await import("./server/waService.ts");
  const { supabaseServer } = await import("./server/supabaseServer.ts");
  
  // Auto-initialize WhatsApp on server startup
  waService.initBaileys().catch((err: any) => console.error("Auto-init WhatsApp failed:", err));

  app.get("/api/wa/status", (_req, res) => {
    res.json({
      success: true,
      connectionState: waService.connectionState,
      qrCodeBase64: waService.qrCodeBase64,
      userJid: waService.userJid,
      userPhone: waService.userPhone,
      userName: waService.userName,
      knownNumbers: waService.getKnownNumbers()
    });
  });

  app.post("/api/wa/connect", async (_req, res) => {
    await waService.initBaileys();
    res.json({
      success: true,
      message: "Proses inisialisasi Baileys WhatsApp dimulai.",
      connectionState: waService.connectionState,
      qrCodeBase64: waService.qrCodeBase64,
      userPhone: waService.userPhone
    });
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

  app.post("/api/wa/settings", (req, res) => {
    waService.saveSettings(req.body);
    res.json({ success: true, settings: waService.aiSettings });
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
    app.get(/(.*)/, (_req, res) => {
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
