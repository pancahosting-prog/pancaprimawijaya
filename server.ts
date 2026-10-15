import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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
  const { waService } = await import("./server/waService.js").catch(() => import("./server/waService.ts"));
  
  // Auto-initialize WhatsApp on server startup
  waService.initBaileys().catch((err: any) => console.error("Auto-init WhatsApp failed:", err));

  app.get("/api/wa/status", (_req, res) => {
    res.json({
      success: true,
      connectionState: waService.connectionState,
      qrCodeBase64: waService.qrCodeBase64,
      userJid: waService.userJid,
      userPhone: waService.userPhone,
      userName: waService.userName
    });
  });

  app.post("/api/wa/connect", async (_req, res) => {
    await waService.initBaileys();
    res.json({
      success: true,
      message: "Proses inisialisasi Baileys WhatsApp dimulai.",
      connectionState: waService.connectionState,
      qrCodeBase64: waService.qrCodeBase64
    });
  });

  app.get("/api/wa/chats", (_req, res) => {
    const list = Array.from(waService.chats.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    res.json({ success: true, chats: list });
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

  // Get Gemini Settings
  app.get("/api/gemini/settings", async (_req, res) => {
    try {
      const fs = await import("fs/promises");
      let data: any = null;
      try {
        const raw = await fs.readFile(GEMINI_SETTINGS_FILE, "utf-8");
        data = JSON.parse(raw);
      } catch {
        // file doesn't exist yet
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

  // Save Gemini Settings
  app.post("/api/gemini/settings", async (req, res) => {
    try {
      const fs = await import("fs/promises");
      const settings = req.body;
      await fs.writeFile(GEMINI_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
      res.json({ success: true, message: "Pengaturan Gemini berhasil disimpan ke database sistem." });
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.use((_req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

startServer();
