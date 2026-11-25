-- ============================================================================
-- SQL Setup untuk Menu HR -> Kandidat (Folder Posisi & Data CV PDF Kandidat)
-- Jalankan script ini di Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Tabel Folder Posisi Kandidat (dibuat manual oleh HR / Superadmin)
CREATE TABLE IF NOT EXISTS public.candidate_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  drive_folder_url TEXT DEFAULT '',
  company_id TEXT DEFAULT '1',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabel Kandidat / Pelamar Kerja (PDF tersimpan di ImageKit & hasil ekstraksi AI)
CREATE TABLE IF NOT EXISTS public.candidates (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES public.candidate_folders(id) ON DELETE CASCADE,
  nama_kandidat TEXT NOT NULL,
  email TEXT DEFAULT '',
  no_hp TEXT DEFAULT '',
  domisili TEXT DEFAULT '',
  posisi_dilamar TEXT DEFAULT '',
  pendidikan TEXT DEFAULT '',
  pengalaman_tahun TEXT DEFAULT '',
  pengalaman_utama TEXT DEFAULT '',
  skills JSONB DEFAULT '[]'::jsonb,
  ringkasan_ai TEXT DEFAULT '',
  kelebihan_utama TEXT DEFAULT '',
  ai_full_text TEXT DEFAULT '',
  ai_status TEXT DEFAULT 'pending', -- 'pending' | 'done' | 'error'
  ai_analyzed_at TIMESTAMP WITH TIME ZONE,
  status_rekrutmen TEXT DEFAULT 'Baru', -- 'Baru' | 'Review' | 'Interview' | 'Diterima' | 'Ditolak'
  catatan_hr TEXT DEFAULT '',
  source_type TEXT DEFAULT 'manual', -- 'manual' | 'drive'
  drive_file_id TEXT DEFAULT '',
  drive_file_url TEXT DEFAULT '',
  pdf_url TEXT NOT NULL,
  imagekit_file_id TEXT DEFAULT '',
  file_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  company_id TEXT DEFAULT '1',
  uploaded_by TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Pastikan tabel app_settings tersedia untuk pengaturan sistem & cadangan
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT
);

-- 4. Index untuk performa query & pencegahan duplikat import Google Drive
CREATE INDEX IF NOT EXISTS idx_candidate_folders_company ON public.candidate_folders(company_id);
CREATE INDEX IF NOT EXISTS idx_candidates_folder_id ON public.candidates(folder_id);
CREATE INDEX IF NOT EXISTS idx_candidates_drive_file_id ON public.candidates(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status_rekrutmen ON public.candidates(status_rekrutmen);
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON public.candidates(created_at DESC);

-- 5. Hak akses & Row Level Security (RLS)
GRANT ALL ON TABLE public.candidate_folders TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.candidates TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.app_settings TO anon, authenticated, service_role;

ALTER TABLE public.candidate_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to candidate_folders" ON public.candidate_folders;
CREATE POLICY "Allow all access to candidate_folders"
  ON public.candidate_folders FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to candidates" ON public.candidates;
CREATE POLICY "Allow all access to candidates"
  ON public.candidates FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);
