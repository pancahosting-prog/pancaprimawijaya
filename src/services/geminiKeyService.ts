// Service for Gemini API Key Management, Multi-Key Rolling, and Database Persistence
// Model target: Gemini 3.5 Flash (with multi-key auto-rolling & fallback cascade)
import { saveAppSettingToSupabase, loadAppSettingFromSupabase } from '../lib/supabaseSync';

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
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash Latest' }
];

export const DEFAULT_GEMINI_SETTINGS: GeminiSettings = {
  apiKeys: [],
  activeKeyIndex: 0,
  model: 'gemini-3-flash',
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
 * Persists Gemini settings both to database (Supabase Cloud & backend endpoint) and LocalStorage.
 * Guarantees cross-device availability when Supabase table app_settings is installed.
 */
export const syncGeminiSettingsToDatabase = async (
  settings: GeminiSettings
): Promise<{ success: boolean; message: string; isCloudSynced: boolean; errorDetail?: string }> => {
  saveStoredGeminiSettings(settings);

  let isCloudSynced = false;
  let cloudMsg = '';
  let cloudError = '';

  // 1. Direct Cloud Sync to Supabase Database (Persists across ALL devices)
  try {
    const supabaseRes = await saveAppSettingToSupabase('gemini_settings', settings, 'gemini_settings_ui');
    if (supabaseRes && !supabaseRes.error) {
      isCloudSynced = true;
      cloudMsg = 'Pengaturan & API Key berhasil disimpan ke Cloud Database Supabase (Aktif di semua perangkat).';
      console.log('[GeminiKeyService] Saved to Supabase cloud successfully');
    } else if (supabaseRes?.error) {
      cloudError = supabaseRes.error.message || 'Tabel app_settings belum siap di database Supabase.';
      console.warn('[GeminiKeyService] Supabase direct save returned error:', supabaseRes.error);
    }
  } catch (dbErr: any) {
    cloudError = dbErr.message || 'Koneksi ke Supabase gagal.';
    console.warn('[GeminiKeyService] Supabase direct save exception:', cloudError);
  }

  // 2. Sync to backend API endpoint (saves server backup & updates Baileys auto-reply)
  try {
    const res = await fetch('/api/gemini/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.cloudSaved) {
        isCloudSynced = true;
      }
      if (!cloudMsg && data.message) {
        cloudMsg = data.message;
      }
    }
  } catch (err: any) {
    console.warn('[GeminiKeyService] Server persistence sync notice:', err.message);
  }

  let finalMessage = '';
  if (isCloudSynced) {
    finalMessage = 'Pengaturan & API Key berhasil disimpan ke Cloud Database Supabase (Aktif di semua perangkat).';
  } else if (cloudError) {
    finalMessage = `Tersimpan secara lokal. Perhatian: Belum tersimpan di Database Supabase (${cloudError}). Harap jalankan Update Script SQL di Supabase agar aktif lintas perangkat.`;
  } else {
    finalMessage = cloudMsg || 'Pengaturan Gemini AI tersimpan di database lokal browser & server.';
  }

  return {
    success: true,
    isCloudSynced,
    message: finalMessage,
    errorDetail: cloudError || undefined
  };
};

/**
 * Loads Gemini settings from Supabase database / backend and updates local storage.
 * Prioritizes Supabase cloud database so any new device gets the settings immediately.
 */
export const loadGeminiSettingsFromDatabase = async (): Promise<GeminiSettings> => {
  // 1. Check Supabase Cloud Database first (Source of Truth for multi-device sync)
  try {
    const cloudValue = await loadAppSettingFromSupabase('gemini_settings');
    if (cloudValue && Array.isArray(cloudValue.apiKeys) && cloudValue.apiKeys.length > 0) {
      const merged: GeminiSettings = {
        ...DEFAULT_GEMINI_SETTINGS,
        ...cloudValue,
        apiKeys: cloudValue.apiKeys
      };
      saveStoredGeminiSettings(merged);
      console.log('[GeminiKeyService] Successfully loaded Gemini settings from Supabase Cloud Database:', merged.apiKeys.length, 'keys');
      return merged;
    }
  } catch (cloudErr) {
    console.warn('[GeminiKeyService] Supabase load warning:', cloudErr);
  }

  // 2. Fallback to server endpoint
  try {
    const res = await fetch('/api/gemini/settings');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings && Array.isArray(data.settings.apiKeys) && data.settings.apiKeys.length > 0) {
        const merged: GeminiSettings = {
          ...DEFAULT_GEMINI_SETTINGS,
          ...data.settings,
          apiKeys: data.settings.apiKeys
        };
        saveStoredGeminiSettings(merged);
        console.log('[GeminiKeyService] Successfully loaded Gemini settings from server API:', merged.apiKeys.length, 'keys');
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
  modelName: string = 'gemini-3-flash'
): Promise<{ success: boolean; message: string; latencyMs: number; modelUsed?: string }> => {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { success: false, message: 'API Key kosong', latencyMs: 0 };
  }

  // 1. Try server-side test endpoint first
  try {
    const srvRes = await fetch('/api/gemini/test-key', {
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
  const modelsToTry = [modelName, 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
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
export interface GeminiCallResult {
  text: string;
  usage?: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  };
}

export const callGeminiWithKeyRotationDetails = async ({
  systemPrompt,
  messages,
  userPrompt,
  preferredModel = 'gemini-3-flash',
  temperature = 0.2,
  maxTokens = 8192
}: {
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  userPrompt: string;
  preferredModel?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<GeminiCallResult> => {
  let settings = getStoredGeminiSettings();
  let activeKeys = settings.apiKeys.filter(k => k.isActive && k.key.trim().length > 0);

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
    return {
      text: `⚠️ **API Key Gemini Belum Dikonfigurasi**\n\nSilakan buka menu **Settings > Pengaturan Gemini AI** untuk memasukkan API Key Gemini Anda.`
    };
  }

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
    preferredModel || settings.model || 'gemini-3-flash',
    'gemini-3-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest'
  ].filter((v, i, a) => a.indexOf(v) === i);

  let attemptCount = 0;
  const maxAttempts = activeKeys.length;

  while (attemptCount < maxAttempts) {
    const activeKeyInfo = getActiveKeyWithRolling(settings);
    if (!activeKeyInfo) break;

    const { key, index: currentIdx, keyConfig } = activeKeyInfo;
    attemptCount++;

    const callStartTime = Date.now();

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
            keyConfig.successCount = (keyConfig.successCount || 0) + 1;
            keyConfig.lastUsedAt = new Date().toISOString();
            keyConfig.lastLatencyMs = Date.now() - callStartTime;
            keyConfig.isExhausted = false;
            saveStoredGeminiSettings(settings);

            const usageMeta = resData.usageMetadata;
            const promptTokens = usageMeta?.promptTokenCount || Math.ceil((systemPrompt.length + userPrompt.length + JSON.stringify(messages).length) / 3.8);
            const candidateTokens = usageMeta?.candidatesTokenCount || Math.ceil(generatedText.length / 3.8);
            const totalTokens = usageMeta?.totalTokenCount || (promptTokens + candidateTokens);

            return {
              text: generatedText,
              usage: {
                promptTokens,
                candidateTokens,
                totalTokens
              }
            };
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

  return {
    text: `⚠️ **Semua API Key Gemini Mencapai Batas Kuota**\n\nSeluruh API Key Gemini yang Anda daftarkan (${activeKeys.length} kunci) saat ini telah mencapai batas kuota pemakaian.`
  };
};

export const callGeminiWithKeyRotation = async (params: any): Promise<string> => {
  const res = await callGeminiWithKeyRotationDetails(params);
  return res.text;
};

// ==============================================================================
// GEMINI LIVE API (VOICE CALL AUDIO DIALOG) MANAGEMENT & AUTO-ROLLING
// ==============================================================================

export const LIVE_STORAGE_KEY = 'mypanca_gemini_live_settings';

export const SUPPORTED_GEMINI_LIVE_MODELS = [
  { id: 'gemini-3.8-live', label: 'Gemini 3.8 Live (Paling Direkomendasikan untuk Panggilan Suara Telepon)', isRecommended: true },
  { id: 'gemini-3.8-live-extended-thinking', label: 'Gemini 3.8 Live Extended Thinking (Penalaran Mendalam)' },
  { id: 'gemini-3-flash-live', label: 'Gemini 3 Flash Live' },
  { id: 'gemini-2.5-flash-native-audio', label: 'Gemini 2.5 Flash Native Audio Dialog' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Fallback Cepat)' }
];

export const DEFAULT_GEMINI_LIVE_SETTINGS: GeminiSettings = {
  apiKeys: [],
  activeKeyIndex: 0,
  model: 'gemini-3.8-live',
  temperature: 0.2,
  autoRotate: true,
  lastUpdated: new Date().toISOString()
};

export const getStoredGeminiLiveSettings = (): GeminiSettings => {
  if (typeof window === 'undefined') return { ...DEFAULT_GEMINI_LIVE_SETTINGS };
  try {
    const raw = localStorage.getItem(LIVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_GEMINI_LIVE_SETTINGS,
        ...parsed,
        apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : []
      };
    }
  } catch (err) {
    console.warn('[GeminiKeyService] Gagal membaca gemini live settings dari localStorage:', err);
  }
  return { ...DEFAULT_GEMINI_LIVE_SETTINGS };
};

export const saveStoredGeminiLiveSettings = (settings: GeminiSettings): void => {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      ...settings,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(LIVE_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('[GeminiKeyService] Gagal menyimpan gemini live settings ke localStorage:', err);
  }
};

export const syncGeminiLiveSettingsToDatabase = async (
  settings: GeminiSettings
): Promise<{ success: boolean; message: string; isCloudSynced: boolean; errorDetail?: string }> => {
  saveStoredGeminiLiveSettings(settings);

  let isCloudSynced = false;
  let cloudMsg = '';
  let cloudError = '';

  // 1. Direct Cloud Sync to Supabase Database with key 'gemini_live_settings'
  try {
    const supabaseRes = await saveAppSettingToSupabase('gemini_live_settings', settings, 'gemini_live_settings_ui');
    if (supabaseRes && !supabaseRes.error) {
      isCloudSynced = true;
      cloudMsg = 'Pengaturan Live API Key berhasil disimpan ke Cloud Database Supabase.';
    } else if (supabaseRes?.error) {
      cloudError = supabaseRes.error.message;
    }
  } catch (dbErr: any) {
    cloudError = dbErr.message || 'Koneksi ke Supabase gagal.';
  }

  // 2. Sync to server endpoint
  try {
    const res = await fetch('/api/gemini/live-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.cloudSaved) isCloudSynced = true;
    }
  } catch (err: any) {
    console.warn('[GeminiKeyService] Server persistence sync notice for live settings:', err.message);
  }

  return {
    success: true,
    isCloudSynced,
    message: isCloudSynced
      ? 'Kunci Live API tersimpan di Database Supabase Cloud (Aktif di semua perangkat).'
      : 'Kunci Live API tersimpan di penyimpanan lokal browser.',
    errorDetail: cloudError || undefined
  };
};

export const loadGeminiLiveSettingsFromDatabase = async (): Promise<GeminiSettings> => {
  try {
    const cloudValue = await loadAppSettingFromSupabase('gemini_live_settings');
    if (cloudValue && Array.isArray(cloudValue.apiKeys) && cloudValue.apiKeys.length > 0) {
      const merged: GeminiSettings = {
        ...DEFAULT_GEMINI_LIVE_SETTINGS,
        ...cloudValue,
        apiKeys: cloudValue.apiKeys
      };
      saveStoredGeminiLiveSettings(merged);
      return merged;
    }
  } catch (cloudErr) {
    console.warn('[GeminiKeyService] Supabase live load warning:', cloudErr);
  }

  try {
    const res = await fetch('/api/gemini/live-settings');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings && Array.isArray(data.settings.apiKeys) && data.settings.apiKeys.length > 0) {
        const merged: GeminiSettings = {
          ...DEFAULT_GEMINI_LIVE_SETTINGS,
          ...data.settings,
          apiKeys: data.settings.apiKeys
        };
        saveStoredGeminiLiveSettings(merged);
        return merged;
      }
    }
  } catch (err) {
    // ignore
  }

  return getStoredGeminiLiveSettings();
};

export const callGeminiLiveVoiceWithRolling = async (
  systemPrompt: string,
  userSpeechText: string
): Promise<string> => {
  // Try Live Settings first; if empty, fallback to main Gemini Settings
  let liveSettings = getStoredGeminiLiveSettings();
  let availableKeys = liveSettings.apiKeys.filter(k => k.isActive && !k.isExhausted && k.key?.trim()?.length > 0);
  let isUsingFallback = false;

  if (availableKeys.length === 0) {
    const mainSettings = getStoredGeminiSettings();
    availableKeys = mainSettings.apiKeys.filter(k => k.isActive && !k.isExhausted && k.key?.trim()?.length > 0);
    isUsingFallback = true;
  }

  if (availableKeys.length === 0) {
    return 'Halo! Mohon pasang API Key Gemini terlebih dahulu melalui tombol Pengaturan agar asisten suara dapat terhubung.';
  }

  // Model cascade for voice dialog
  const candidateModels = [
    liveSettings.model || 'gemini-3.8-live',
    'gemini-3.8-live-extended-thinking',
    'gemini-3-flash-live',
    'gemini-3.5-flash',
    'gemini-2.5-flash'
  ];

  for (let i = 0; i < availableKeys.length; i++) {
    const activeKeyConfig = availableKeys[i];
    const cleanKey = activeKeyConfig.key.trim();

    for (const model of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: userSpeechText }]
              }
            ],
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            generationConfig: {
              temperature: 0.25,
              maxOutputTokens: 1500 // Allow comprehensive, informative and complete voice responses
            }
          })
        });

        if (res.ok) {
          const data = await res.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply && reply.trim().length > 0) {
            activeKeyConfig.successCount = (activeKeyConfig.successCount || 0) + 1;
            activeKeyConfig.lastUsedAt = new Date().toISOString();
            if (!isUsingFallback) saveStoredGeminiLiveSettings(liveSettings);
            return reply.trim();
          }
        }

        if (res.status === 404) continue;

        if (res.status === 429) {
          activeKeyConfig.isExhausted = true;
          activeKeyConfig.failCount = (activeKeyConfig.failCount || 0) + 1;
          if (!isUsingFallback) saveStoredGeminiLiveSettings(liveSettings);
          break; // Advance to next key
        }
      } catch (err) {
        console.warn(`[GeminiLiveRolling] Error on model ${model}:`, err);
        break;
      }
    }
  }

  return 'Maaf, terjadi kendala saat menghubungkan suara ke server. Silakan periksa koneksi internet atau kuota API Key Anda.';
};

