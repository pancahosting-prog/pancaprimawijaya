import { getApiUrl } from '../lib/apiUtils';
// Service for Gemini API Key Management, Multi-Key Rolling, and Database Persistence
// Model target: Gemini 3.5 Flash (with multi-key auto-rolling & fallback cascade)

export interface GeminiApiKeyConfig {
  id: string;
  key: string;
  label: string;
  isActive: boolean;
  isExhausted: boolean;
  exhaustedAt?: string;
  lastUsedAt?: string;
  successCount: number;
  failCount: number;
  lastLatencyMs?: number;
}

export interface GeminiSettings {
  apiKeys: GeminiApiKeyConfig[];
  activeKeyIndex: number;
  model: string;
  temperature: number;
  autoRotate: boolean;
  lastUpdated?: string;
}

const STORAGE_KEY = 'mypanca_gemini_settings';

export const SUPPORTED_GEMINI_MODELS = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Paling Canggih, Cepat & Cerdas)', isRecommended: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Stabil & Responsif)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash Latest' }
];

export const DEFAULT_GEMINI_SETTINGS: GeminiSettings = {
  apiKeys: [],
  activeKeyIndex: 0,
  model: 'gemini-3.5-flash',
  temperature: 0.2,
  autoRotate: true,
  lastUpdated: new Date().toISOString()
};

/**
 * Loads Gemini settings from LocalStorage
 */
export const getStoredGeminiSettings = (): GeminiSettings => {
  if (typeof window === 'undefined') return { ...DEFAULT_GEMINI_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_GEMINI_SETTINGS,
        ...parsed,
        apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : []
      };
    }
  } catch (err) {
    console.warn('[GeminiKeyService] Gagal membaca dari localStorage:', err);
  }
  return { ...DEFAULT_GEMINI_SETTINGS };
};

/**
 * Saves Gemini settings to LocalStorage
 */
export const saveStoredGeminiSettings = (settings: GeminiSettings): void => {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      ...settings,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('[GeminiKeyService] Gagal menyimpan ke localStorage:', err);
  }
};

/**
 * Persists Gemini settings both to database (backend endpoint / Supabase) and LocalStorage
 */
export const syncGeminiSettingsToDatabase = async (
  settings: GeminiSettings
): Promise<{ success: boolean; message: string }> => {
  saveStoredGeminiSettings(settings);

  try {
    // 1. Sync to backend API endpoint which saves to database / server persistence
    const res = await fetch(getApiUrl('/api/gemini/settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: data.message || 'Pengaturan Gemini AI berhasil disimpan ke database sistem.'
      };
    }
  } catch (err: any) {
    console.warn('[GeminiKeyService] Server persistence sync notice:', err.message);
  }

  return {
    success: true,
    message: 'Pengaturan Gemini AI tersimpan di database lokal (browser).'
  };
};

/**
 * Loads Gemini settings from database / backend and updates local storage
 */
export const loadGeminiSettingsFromDatabase = async (): Promise<GeminiSettings> => {
  try {
    const res = await fetch(getApiUrl('/api/gemini/settings'));
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings && Array.isArray(data.settings.apiKeys) && data.settings.apiKeys.length > 0) {
        const local = getStoredGeminiSettings();
        // If local has keys, keep local as primary or merge
        const merged: GeminiSettings = {
          ...data.settings,
          apiKeys: local.apiKeys.length > 0 ? local.apiKeys : data.settings.apiKeys
        };
        saveStoredGeminiSettings(merged);
        return merged;
      }
    }
  } catch (err) {
    console.warn('[GeminiKeyService] Failed loading from server, using local:', err);
  }
  return getStoredGeminiSettings();
};

/**
 * Tests a single Gemini API key with a ping prompt
 */
export const testGeminiApiKey = async (
  apiKey: string,
  modelName: string = 'gemini-3.5-flash'
): Promise<{ success: boolean; message: string; latencyMs: number; modelUsed?: string }> => {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { success: false, message: 'API Key kosong', latencyMs: 0 };
  }

  // 1. Try server-side test endpoint first
  try {
    const srvRes = await fetch(getApiUrl('/api/gemini/test-key'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: cleanKey, model: modelName })
    });
    if (srvRes.ok) {
      const srvData = await srvRes.json();
      return srvData;
    }
  } catch {
    // Fall back to direct browser fetch
  }

  // 2. Direct browser test
  const startTime = Date.now();
  const modelsToTry = [modelName, 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  const uniqueModels = Array.from(new Set(modelsToTry));

  for (const model of uniqueModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Halo! Jawab singkat: Sistem Online' }] }],
          generationConfig: { maxOutputTokens: 20, temperature: 0.1 }
        })
      });

      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Online';
        return {
          success: true,
          message: `Koneksi Berhasil (${latencyMs}ms) menggunakan model ${model}: "${reply.trim()}"`,
          latencyMs,
          modelUsed: model
        };
      }

      if (res.status === 404) {
        continue;
      }

      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${res.status} (${res.statusText})`;
      if (res.status === 429 || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted')) {
        return { success: false, message: `Batas kuota terlampaui (429): ${errMsg}`, latencyMs };
      }

      return { success: false, message: `Gagal: ${errMsg}`, latencyMs };
    } catch (netErr: any) {
      return { success: false, message: `Kendala Jaringan: ${netErr.message}`, latencyMs: Date.now() - startTime };
    }
  }

  return { success: false, message: 'Gagal menghubungi Gemini API dengan model yang tersedia.', latencyMs: Date.now() - startTime };
};

/**
 * Resolves the next usable API key with automatic rolling logic
 */
export const getActiveKeyWithRolling = (
  settings: GeminiSettings
): { key: string; index: number; keyConfig: GeminiApiKeyConfig } | null => {
  const activeKeys = settings.apiKeys.filter(k => k.isActive && k.key.trim().length > 0);
  if (activeKeys.length === 0) return null;

  // Check if all keys were marked exhausted more than 20 minutes ago; if so, reset them
  const now = Date.now();
  let updatedAny = false;
  activeKeys.forEach(k => {
    if (k.isExhausted && k.exhaustedAt) {
      const exhaustedTime = new Date(k.exhaustedAt).getTime();
      if (now - exhaustedTime > 20 * 60 * 1000) {
        k.isExhausted = false;
        k.exhaustedAt = undefined;
        updatedAny = true;
      }
    }
  });

  if (updatedAny) {
    saveStoredGeminiSettings(settings);
  }

  // Find non-exhausted key starting from activeKeyIndex
  const startIndex = Math.max(0, Math.min(settings.activeKeyIndex, activeKeys.length - 1));
  for (let i = 0; i < activeKeys.length; i++) {
    const idx = (startIndex + i) % activeKeys.length;
    const candidate = activeKeys[idx];
    if (!candidate.isExhausted) {
      if (idx !== settings.activeKeyIndex) {
        settings.activeKeyIndex = idx;
        saveStoredGeminiSettings(settings);
      }
      return { key: candidate.key.trim(), index: idx, keyConfig: candidate };
    }
  }

  // If all keys are currently exhausted, fallback to first active key
  return { key: activeKeys[0].key.trim(), index: 0, keyConfig: activeKeys[0] };
};

/**
 * Calls Google Gemini REST API with Multi-Key Rotation and Model Cascading
 */
export const callGeminiWithKeyRotation = async ({
  systemPrompt,
  messages,
  userPrompt,
  preferredModel = 'gemini-3.5-flash',
  temperature = 0.2,
  maxTokens = 8192
}: {
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  userPrompt: string;
  preferredModel?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> => {
  let settings = getStoredGeminiSettings();
  let activeKeys = settings.apiKeys.filter(k => k.isActive && k.key.trim().length > 0);

  // If local settings has no keys, try loading from server database once
  if (activeKeys.length === 0) {
    try {
      const srvSettings = await loadGeminiSettingsFromDatabase();
      if (srvSettings && srvSettings.apiKeys.some(k => k.isActive && k.key.trim().length > 0)) {
        settings = srvSettings;
        activeKeys = settings.apiKeys.filter(k => k.isActive && k.key.trim().length > 0);
      }
    } catch {
      // ignore
    }
  }

  if (activeKeys.length === 0) {
    return `⚠️ **API Key Gemini Belum Dikonfigurasi**\n\nSilakan buka menu **Settings > Pengaturan Gemini AI** untuk memasukkan API Key Gemini Anda. Sistem mendukung penambahan lebih dari 1 API Key dengan **rotasi otomatis (*auto-rolling*)** jika salah satu API Key kehabisan kuota.`;
  }

  // Prepare Gemini conversation payload
  const contentsPayload: any[] = [];
  messages.forEach(m => {
    contentsPayload.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    });
  });
  contentsPayload.push({
    role: 'user',
    parts: [{ text: userPrompt }]
  });

  const modelCandidates = [
    preferredModel || settings.model || 'gemini-3.5-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-flash-latest'
  ].filter((v, i, a) => a.indexOf(v) === i); // unique

  let attemptCount = 0;
  const maxAttempts = activeKeys.length;

  while (attemptCount < maxAttempts) {
    const activeKeyInfo = getActiveKeyWithRolling(settings);
    if (!activeKeyInfo) break;

    const { key, index: currentIdx, keyConfig } = activeKeyInfo;
    attemptCount++;

    const callStartTime = Date.now();

    // Try models in cascade
    for (const modelName of modelCandidates) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: contentsPayload,
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens
            }
          })
        });

        if (response.ok) {
          const resData = await response.json();
          const generatedText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (generatedText) {
            // Update stats
            keyConfig.successCount = (keyConfig.successCount || 0) + 1;
            keyConfig.lastUsedAt = new Date().toISOString();
            keyConfig.lastLatencyMs = Date.now() - callStartTime;
            keyConfig.isExhausted = false;
            saveStoredGeminiSettings(settings);
            return generatedText;
          }
        }

        // Check if model not found (404), continue to next model in list
        if (response.status === 404) {
          continue;
        }

        const errJson = await response.json().catch(() => ({}));
        const errMessage = (errJson.error?.message || '').toLowerCase();
        const isQuotaError = response.status === 429 ||
          response.status === 403 ||
          errMessage.includes('quota') ||
          errMessage.includes('rate') ||
          errMessage.includes('exhausted') ||
          errMessage.includes('resource_exhausted');

        if (isQuotaError && settings.autoRotate && activeKeys.length > 1) {
          console.warn(`[GeminiKeyManager] Key #${currentIdx + 1} (${keyConfig.label || 'Key'}) mencapai limit kuota (HTTP ${response.status}). Melakukan rolling otomatis ke key cadangan berikutnya...`);
          keyConfig.isExhausted = true;
          keyConfig.exhaustedAt = new Date().toISOString();
          keyConfig.failCount = (keyConfig.failCount || 0) + 1;

          // Advance to next key
          settings.activeKeyIndex = (currentIdx + 1) % activeKeys.length;
          saveStoredGeminiSettings(settings);
          // Break model loop to retry with next API key
          break;
        } else if (!isQuotaError) {
          // If fatal invalid key, log and break to try next key if available
          keyConfig.failCount = (keyConfig.failCount || 0) + 1;
          saveStoredGeminiSettings(settings);
          break;
        }
      } catch (callErr: any) {
        console.warn(`[GeminiKeyManager] Error calling model ${modelName} on key #${currentIdx + 1}:`, callErr);
        break;
      }
    }
  }

  return `⚠️ **Semua API Key Gemini Mencapai Batas Kuota**\n\nSeluruh API Key Gemini yang Anda daftarkan (${activeKeys.length} kunci) saat ini telah mencapai batas kuota pemakaian. Silakan tambahkan API key baru di menu **Settings > Pengaturan Gemini AI** atau tunggu beberapa saat agar kuota ter-reset secara otomatis.`;
};
