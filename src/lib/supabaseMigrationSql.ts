export const SUPABASE_MIGRATION_SQL = `-- ==============================================================================
-- UPDATE SCRIPT SQL SUPABASE - MYPANCA BRM (SAFE & NON-DESTRUCTIVE)
-- AMAN: Tidak menghapus atau merusak data yang sudah ada di database Anda.
-- Menangani tabel lama dengan kolom 'id' secara otomatis & aman.
-- ==============================================================================

-- 1. TABEL APP_SETTINGS (Penyimpanan API Key Gemini & Pengaturan Global Multi-Perangkat)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT
);

-- JIKA TABEL SUDAH ADA SEBELUMNYA: Tambahkan kolom yang dibutuhkan secara aman
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS value JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- JIKA TABEL LAMA MEMILIKI KOLOM 'id' DENGAN CONSTRAINT NOT NULL:
-- Lepaskan NOT NULL jika bukan PK dan pasang nilai DEFAULT otomatis
DO $$
DECLARE
  col_type text;
  is_pk boolean := false;
BEGIN
  SELECT data_type INTO col_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'id';

  IF col_type IS NOT NULL THEN
    -- Cek apakah id adalah PRIMARY KEY
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'public.app_settings'::regclass 
        AND c.contype = 'p' 
        AND a.attname = 'id'
    ) INTO is_pk;

    -- Jika id bukan primary key, lepaskan constraint NOT NULL
    IF NOT is_pk THEN
      BEGIN
        EXECUTE 'ALTER TABLE public.app_settings ALTER COLUMN id DROP NOT NULL';
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    -- Pasang default otomatis sesuai tipe data kolom id
    BEGIN
      IF col_type IN ('text', 'character varying') THEN
        EXECUTE 'ALTER TABLE public.app_settings ALTER COLUMN id SET DEFAULT gen_random_uuid()::text';
      ELSIF col_type = 'uuid' THEN
        EXECUTE 'ALTER TABLE public.app_settings ALTER COLUMN id SET DEFAULT gen_random_uuid()';
      ELSIF col_type IN ('integer', 'bigint', 'smallint') THEN
        EXECUTE 'CREATE SEQUENCE IF NOT EXISTS app_settings_id_seq';
        EXECUTE 'ALTER TABLE public.app_settings ALTER COLUMN id SET DEFAULT nextval(''app_settings_id_seq'')';
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- Pastikan kolom 'key' memiliki index unik agar upsert/simpan data berjalan lancar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.app_settings'::regclass 
    AND (contype = 'p' OR contype = 'u')
    AND pg_get_constraintdef(oid) LIKE '%key%'
  ) THEN
    BEGIN
      ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_key_unique UNIQUE (key);
    EXCEPTION WHEN OTHERS THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_key ON public.app_settings(key);
    END;
  END IF;
END $$;

-- Berikan izin akses penuh ke tabel app_settings
GRANT ALL ON TABLE public.app_settings TO anon, authenticated, service_role;

-- Aktifkan Row Level Security (RLS) & Policy
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Allow all access to app_settings" ON public.app_settings;
  CREATE POLICY "Allow all access to app_settings" ON public.app_settings 
    FOR ALL 
    TO public, anon, authenticated
    USING (true) 
    WITH CHECK (true);
END $$;


-- 2. TABEL WA_CHATS (Riwayat Chat WhatsApp Berdasarkan Nomor Terhubung)
CREATE TABLE IF NOT EXISTS public.wa_chats (
  id TEXT PRIMARY KEY,                       -- Format: {connected_phone}_{jid}
  connected_phone TEXT NOT NULL,             -- Nomor WhatsApp terhubung (cth: 6281234567890)
  jid TEXT NOT NULL,                         -- JID kontak lawan bicara
  name TEXT,                                 -- Nama kontak lawan bicara
  phone TEXT,                                -- Nomor telepon lawan bicara (+62...)
  unread_count INT DEFAULT 0,
  last_message TEXT,
  last_message_time BIGINT,
  messages JSONB DEFAULT '[]'::jsonb,        -- Array JSON riwayat pesan masuk & keluar
  assigned_user TEXT,                        -- Nama/Username pengguna pemilik koneksi WA
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- JIKA TABEL SUDAH ADA SEBELUMNYA: Tambahkan kolom yang mungkin belum ada
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS connected_phone TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS jid TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS unread_count INT DEFAULT 0;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS last_message TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS last_message_time BIGINT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS assigned_user TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Index performa pencarian chat
CREATE INDEX IF NOT EXISTS idx_wa_chats_connected_phone ON public.wa_chats(connected_phone);
CREATE INDEX IF NOT EXISTS idx_wa_chats_last_message_time ON public.wa_chats(last_message_time DESC);
CREATE INDEX IF NOT EXISTS idx_wa_chats_jid ON public.wa_chats(jid);

-- Berikan izin akses penuh ke tabel wa_chats
GRANT ALL ON TABLE public.wa_chats TO anon, authenticated, service_role;

-- Aktifkan Row Level Security (RLS) & Policy
ALTER TABLE public.wa_chats ENABLE ROW LEVEL SECURITY;
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Allow all access to wa_chats" ON public.wa_chats;
  CREATE POLICY "Allow all access to wa_chats" ON public.wa_chats 
    FOR ALL 
    TO public, anon, authenticated
    USING (true) 
    WITH CHECK (true);
END $$;


-- 3. INITIAL SEED (Template Setting Gemini jika belum ada)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'gemini_settings') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'id'
    ) THEN
      BEGIN
        INSERT INTO public.app_settings (id, key, value, updated_at, updated_by)
        VALUES (
          'gemini_settings',
          'gemini_settings',
          '{"apiKeys": [], "activeKeyIndex": 0, "model": "gemini-2.5-flash", "temperature": 0.7, "autoRotate": true, "lastUpdated": "2026-10-15T00:00:00.000Z"}'::jsonb,
          NOW(),
          'system_init'
        );
      EXCEPTION WHEN OTHERS THEN
        BEGIN
          INSERT INTO public.app_settings (key, value, updated_at, updated_by)
          VALUES (
            'gemini_settings',
            '{"apiKeys": [], "activeKeyIndex": 0, "model": "gemini-2.5-flash", "temperature": 0.7, "autoRotate": true, "lastUpdated": "2026-10-15T00:00:00.000Z"}'::jsonb,
            NOW(),
            'system_init'
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END;
    ELSE
      INSERT INTO public.app_settings (key, value, updated_at, updated_by)
      VALUES (
        'gemini_settings',
        '{"apiKeys": [], "activeKeyIndex": 0, "model": "gemini-2.5-flash", "temperature": 0.7, "autoRotate": true, "lastUpdated": "2026-10-15T00:00:00.000Z"}'::jsonb,
        NOW(),
        'system_init'
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- 4. INITIAL SEED (Knowledge Base, Instruksi Sistem & Guardrails WhatsApp AI - Perangkat 1)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'wa_ai_settings') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'id'
    ) THEN
      BEGIN
        INSERT INTO public.app_settings (id, key, value, updated_at, updated_by)
        VALUES (
          'wa_ai_settings',
          'wa_ai_settings',
          '{"autoReplyEnabled": true, "botName": "Customer Assistant AI", "systemInstructions": "Anda adalah customer service profesional yang ramah, komunikatif, solutif, dan natural. Tujuanmu adalah membantu pelanggan menyelesaikan kebutuhannya dengan luwes dan memahami konteks percakapan.", "toneOfVoice": "Sangat Ramah, Bersahabat & Solutif", "tone": "Sangat Ramah, Bersahabat & Solutif", "responseLanguage": "Bahasa Indonesia", "greetingMessage": "Halo! Selamat datang di layanan WhatsApp resmi kami. Ada yang bisa kami bantu seputar produk atau pemesanan hari ini?", "fallbackMessage": "Mohon maaf ya Kak, untuk informasi spesifik terkait hal tersebut saat ini belum tercatat di sistem kami. Apakah ada hal lain yang bisa kami bantu seputar produk atau layanan pemesanan kami?", "restrictedTopics": ["Isu SARA, politik, dan konten sensitif", "Perbandingan atau menjelekkan kompetitor lain", "Membocorkan harga modal internal atau rahasia supplier pabrik", "Menjanjikan diskon khusus sepihak tanpa persetujuan tim sales resmi", "Data pribadi karyawan di luar nomor kontak layanan resmi"], "handoverToHuman": {"enabled": true, "triggerKeywords": ["bicara dengan manusia", "hubungi sales", "komplain", "bicara cs", "customer service", "mau telpon", "bisa bicara sales", "minta nomor sales", "keluhan barang"], "handoverContact": "0811-1234-5678", "handoverMessage": "Baik Kak {name}, obrolan Anda telah kami teruskan langsung ke Sales & CS Specialist kami di nomor WhatsApp {contact}. Tim kami akan segera menghubungi Kakak secara langsung ya."}, "salesCta": {"enabled": true, "ctaMessage": "Apakah Kakak ingin kami buatkan Surat Penawaran Harga resmi (Quotation) untuk kebutuhan ini?", "triggerKeywords": ["harga", "pesan", "order", "quotation", "penawaran", "katalog", "stok", "beli", "minimal order", "sample", "sampel"]}, "knowledgeProducts": [], "knowledgeSnippets": [], "knowledgeWebSources": [], "knowledgeBase": [], "logs": []}'::jsonb,
          NOW(),
          'system_init'
        );
      EXCEPTION WHEN OTHERS THEN
        BEGIN
          INSERT INTO public.app_settings (key, value, updated_at, updated_by)
          VALUES (
            'wa_ai_settings',
            '{"autoReplyEnabled": true, "botName": "Customer Assistant AI", "systemInstructions": "Anda adalah customer service profesional yang ramah, komunikatif, solutif, dan natural. Tujuanmu adalah membantu pelanggan menyelesaikan kebutuhannya dengan luwes dan memahami konteks percakapan.", "toneOfVoice": "Sangat Ramah, Bersahabat & Solutif", "tone": "Sangat Ramah, Bersahabat & Solutif", "responseLanguage": "Bahasa Indonesia", "greetingMessage": "Halo! Selamat datang di layanan WhatsApp resmi kami. Ada yang bisa kami bantu seputar produk atau pemesanan hari ini?", "fallbackMessage": "Mohon maaf ya Kak, untuk informasi spesifik terkait hal tersebut saat ini belum tercatat di sistem kami. Apakah ada hal lain yang bisa kami bantu seputar produk atau layanan pemesanan kami?", "restrictedTopics": ["Isu SARA, politik, dan konten sensitif", "Perbandingan atau menjelekkan kompetitor lain", "Membocorkan harga modal internal atau rahasia supplier pabrik", "Menjanjikan diskon khusus sepihak tanpa persetujuan tim sales resmi", "Data pribadi karyawan di luar nomor kontak layanan resmi"], "handoverToHuman": {"enabled": true, "triggerKeywords": ["bicara dengan manusia", "hubungi sales", "komplain", "bicara cs", "customer service", "mau telpon", "bisa bicara sales", "minta nomor sales", "keluhan barang"], "handoverContact": "0811-1234-5678", "handoverMessage": "Baik Kak {name}, obrolan Anda telah kami teruskan langsung ke Sales & CS Specialist kami di nomor WhatsApp {contact}. Tim kami akan segera menghubungi Kakak secara langsung ya."}, "salesCta": {"enabled": true, "ctaMessage": "Apakah Kakak ingin kami buatkan Surat Penawaran Harga resmi (Quotation) untuk kebutuhan ini?", "triggerKeywords": ["harga", "pesan", "order", "quotation", "penawaran", "katalog", "stok", "beli", "minimal order", "sample", "sampel"]}, "knowledgeProducts": [], "knowledgeSnippets": [], "knowledgeWebSources": [], "knowledgeBase": [], "logs": []}'::jsonb,
            NOW(),
            'system_init'
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END;
    ELSE
      INSERT INTO public.app_settings (key, value, updated_at, updated_by)
      VALUES (
        'wa_ai_settings',
        '{"autoReplyEnabled": true, "botName": "Customer Assistant AI", "systemInstructions": "Anda adalah customer service profesional yang ramah, komunikatif, solutif, dan natural. Tujuanmu adalah membantu pelanggan menyelesaikan kebutuhannya dengan luwes dan memahami konteks percakapan.", "toneOfVoice": "Sangat Ramah, Bersahabat & Solutif", "tone": "Sangat Ramah, Bersahabat & Solutif", "responseLanguage": "Bahasa Indonesia", "greetingMessage": "Halo! Selamat datang di layanan WhatsApp resmi kami. Ada yang bisa kami bantu seputar produk atau pemesanan hari ini?", "fallbackMessage": "Mohon maaf ya Kak, untuk informasi spesifik terkait hal tersebut saat ini belum tercatat di sistem kami. Apakah ada hal lain yang bisa kami bantu seputar produk atau layanan pemesanan kami?", "restrictedTopics": ["Isu SARA, politik, dan konten sensitif", "Perbandingan atau menjelekkan kompetitor lain", "Membocorkan harga modal internal atau rahasia supplier pabrik", "Menjanjikan diskon khusus sepihak tanpa persetujuan tim sales resmi", "Data pribadi karyawan di luar nomor kontak layanan resmi"], "handoverToHuman": {"enabled": true, "triggerKeywords": ["bicara dengan manusia", "hubungi sales", "komplain", "bicara cs", "customer service", "mau telpon", "bisa bicara sales", "minta nomor sales", "keluhan barang"], "handoverContact": "0811-1234-5678", "handoverMessage": "Baik Kak {name}, obrolan Anda telah kami teruskan langsung ke Sales & CS Specialist kami di nomor WhatsApp {contact}. Tim kami akan segera menghubungi Kakak secara langsung ya."}, "salesCta": {"enabled": true, "ctaMessage": "Apakah Kakak ingin kami buatkan Surat Penawaran Harga resmi (Quotation) untuk kebutuhan ini?", "triggerKeywords": ["harga", "pesan", "order", "quotation", "penawaran", "katalog", "stok", "beli", "minimal order", "sample", "sampel"]}, "knowledgeProducts": [], "knowledgeSnippets": [], "knowledgeWebSources": [], "knowledgeBase": [], "logs": []}'::jsonb,
        NOW(),
        'system_init'
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- 5. VERIFIKASI INSTALASI TABEL
SELECT 'app_settings' AS table_name, count(*) AS total_records FROM public.app_settings
UNION ALL
SELECT 'wa_chats' AS table_name, count(*) AS total_records FROM public.wa_chats;
`;
