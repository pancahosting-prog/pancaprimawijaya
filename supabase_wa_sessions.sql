-- Script SQL untuk Tabel Penyimpanan Sesi WhatsApp (Baileys Persistence)
-- Mencegah ter-logout / scan QR ulang saat server restart atau deployment baru.

CREATE TABLE IF NOT EXISTS wa_sessions (
  id TEXT PRIMARY KEY,          -- Kombinasi session_name dan key_id (contoh: 'wa_notif_creds')
  session_name TEXT NOT NULL,   -- Nama sesi ('wa_notif' untuk Perangkat 2, 'wa_cs' untuk Perangkat 1)
  key_id TEXT NOT NULL,         -- Jenis kunci/file kredensial ('creds', 'app-state', dll)
  data JSONB NOT NULL,          -- Data kredensial / auth state Baileys dalam format JSON
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Buat indeks untuk mempercepat pencarian data sesi
CREATE INDEX IF NOT EXISTS idx_wa_sessions_lookup ON wa_sessions(session_name, key_id);

-- Komentar tabel
COMMENT ON TABLE wa_sessions IS 'Penyimpanan persisten sesi Baileys WhatsApp agar tidak ter-logout saat server restart.';
