-- ==============================================================================
-- UPDATE SCRIPT SQL SUPABASE: DEDICATED LIVE API KEY SETTINGS
-- AMAN & NON-DESTRUCTIVE: Script ini tidak menghapus data yang sudah ada.
-- ==============================================================================

-- 1. Pastikan tabel app_settings sudah ada
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT
);

-- 2. Pastikan kolom-kolom yang diperlukan tersedia jika tabel sudah ada sebelumnya
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS value JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- 3. Lepaskan batasan NOT NULL pada kolom id jika tabel dibuat oleh template lama
DO $$
DECLARE
  col_type text;
  is_pk boolean := false;
BEGIN
  SELECT data_type INTO col_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'id';

  IF col_type IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'public.app_settings'::regclass 
        AND c.contype = 'p' 
        AND a.attname = 'id'
    ) INTO is_pk;

    IF NOT is_pk THEN
      BEGIN
        EXECUTE 'ALTER TABLE public.app_settings ALTER COLUMN id DROP NOT NULL';
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

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

-- 4. Pastikan kolom 'key' memiliki index unik
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

-- 5. Berikan hak akses ke public, anon, authenticated, dan service_role
GRANT ALL ON TABLE public.app_settings TO anon, authenticated, service_role;

-- 6. Aktifkan Row Level Security (RLS) & Policy akses
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

-- 7. Inisialisasi baris konfigurasi gemini_live_settings jika belum ada
INSERT INTO public.app_settings (key, value, updated_at, updated_by)
VALUES (
  'gemini_live_settings',
  '{"apiKeys":[],"activeKeyIndex":0,"model":"gemini-3.8-live","temperature":0.2,"autoRotate":true}'::jsonb,
  NOW(),
  'init_script'
)
ON CONFLICT (key) DO NOTHING;

-- Verifikasi data
SELECT key, updated_at, updated_by FROM public.app_settings WHERE key IN ('gemini_settings', 'gemini_live_settings');
