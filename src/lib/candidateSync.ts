import { supabase, withRetry } from './supabase';
import { saveAppSettingToSupabase, loadAppSettingFromSupabase } from './supabaseSync';
import { safeSetLocalStorage } from './apiUtils';

export const CANDIDATE_FALLBACK_SETTING_KEY = 'hr_kandidat_data_v1';
export const CANDIDATE_LOCAL_CACHE_KEY = 'mypanca_hr_candidates_v1';

export type RecruitmentStatus = 'Baru' | 'Review' | 'Interview' | 'Diterima' | 'Ditolak';
export type CandidateAIStatus = 'pending' | 'done' | 'error';

export interface CandidateFolder {
  id: string;
  name: string;
  description?: string;
  driveFolderUrl?: string;
  companyId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CandidateRecord {
  id: string;
  folderId: string;
  namaKandidat: string;
  email?: string;
  noHp?: string;
  domisili?: string;
  posisiDilamar?: string;
  pendidikan?: string;
  pengalamanTahun?: string;
  pengalamanUtama?: string;
  skills: string[];
  ringkasanAi?: string;
  kelebihanUtama?: string;
  aiFullText?: string;
  aiStatus: CandidateAIStatus;
  aiAnalyzedAt?: string;
  statusRekrutmen: RecruitmentStatus;
  catatanHr?: string;
  sourceType: 'manual' | 'drive';
  driveFileId?: string;
  driveFileUrl?: string;
  pdfUrl: string;
  imagekitFileId?: string;
  fileName: string;
  fileSize?: number;
  companyId?: string;
  uploadedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CandidateCloudBundle {
  folders: CandidateFolder[];
  candidates: CandidateRecord[];
  updatedAt?: string;
}

export const CANDIDATE_SUPABASE_SQL = `-- Jalankan di Supabase Dashboard -> SQL Editor
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
  ai_status TEXT DEFAULT 'pending',
  ai_analyzed_at TIMESTAMP WITH TIME ZONE,
  status_rekrutmen TEXT DEFAULT 'Baru',
  catatan_hr TEXT DEFAULT '',
  source_type TEXT DEFAULT 'manual',
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

CREATE INDEX IF NOT EXISTS idx_candidate_folders_company ON public.candidate_folders(company_id);
CREATE INDEX IF NOT EXISTS idx_candidates_folder_id ON public.candidates(folder_id);
CREATE INDEX IF NOT EXISTS idx_candidates_drive_file_id ON public.candidates(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status_rekrutmen ON public.candidates(status_rekrutmen);
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON public.candidates(created_at DESC);

GRANT ALL ON TABLE public.candidate_folders TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.candidates TO anon, authenticated, service_role;

ALTER TABLE public.candidate_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to candidate_folders" ON public.candidate_folders;
CREATE POLICY "Allow all access to candidate_folders"
  ON public.candidate_folders FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to candidates" ON public.candidates;
CREATE POLICY "Allow all access to candidates"
  ON public.candidates FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);`;

const isMissingTableError = (err: any): boolean => {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err.details || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  );
};

const mapRowToFolder = (row: any): CandidateFolder => ({
  id: String(row.id),
  name: String(row.name || 'Folder'),
  description: row.description || '',
  driveFolderUrl: row.drive_folder_url || row.driveFolderUrl || '',
  companyId: row.company_id || row.companyId || '1',
  createdBy: row.created_by || row.createdBy || '',
  createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
});

const mapFolderToRow = (folder: CandidateFolder) => ({
  id: folder.id,
  name: folder.name,
  description: folder.description || '',
  drive_folder_url: folder.driveFolderUrl || '',
  company_id: folder.companyId || '1',
  created_by: folder.createdBy || '',
  created_at: folder.createdAt || new Date().toISOString(),
  updated_at: folder.updatedAt || new Date().toISOString(),
});

const mapRowToCandidate = (row: any): CandidateRecord => ({
  id: String(row.id),
  folderId: String(row.folder_id || row.folderId || ''),
  namaKandidat: String(row.nama_kandidat || row.namaKandidat || row.file_name || 'Kandidat'),
  email: row.email || '',
  noHp: row.no_hp || row.noHp || '',
  domisili: row.domisili || '',
  posisiDilamar: row.posisi_dilamar || row.posisiDilamar || '',
  pendidikan: row.pendidikan || '',
  pengalamanTahun: row.pengalaman_tahun || row.pengalamanTahun || '',
  pengalamanUtama: row.pengalaman_utama || row.pengalamanUtama || '',
  skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
  ringkasanAi: row.ringkasan_ai || row.ringkasanAi || '',
  kelebihanUtama: row.kelebihan_utama || row.kelebihanUtama || '',
  aiFullText: row.ai_full_text || row.aiFullText || '',
  aiStatus: (row.ai_status || row.aiStatus || 'pending') as CandidateAIStatus,
  aiAnalyzedAt: row.ai_analyzed_at || row.aiAnalyzedAt || undefined,
  statusRekrutmen: (row.status_rekrutmen || row.statusRekrutmen || 'Baru') as RecruitmentStatus,
  catatanHr: row.catatan_hr || row.catatanHr || '',
  sourceType: (row.source_type || row.sourceType || 'manual') as 'manual' | 'drive',
  driveFileId: row.drive_file_id || row.driveFileId || '',
  driveFileUrl: row.drive_file_url || row.driveFileUrl || '',
  pdfUrl: String(row.pdf_url || row.pdfUrl || ''),
  imagekitFileId: row.imagekit_file_id || row.imagekitFileId || '',
  fileName: String(row.file_name || row.fileName || 'CV.pdf'),
  fileSize: Number(row.file_size ?? row.fileSize ?? 0) || 0,
  companyId: row.company_id || row.companyId || '1',
  uploadedBy: row.uploaded_by || row.uploadedBy || '',
  createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
});

const mapCandidateToRow = (cand: CandidateRecord) => ({
  id: cand.id,
  folder_id: cand.folderId,
  nama_kandidat: cand.namaKandidat,
  email: cand.email || '',
  no_hp: cand.noHp || '',
  domisili: cand.domisili || '',
  posisi_dilamar: cand.posisiDilamar || '',
  pendidikan: cand.pendidikan || '',
  pengalaman_tahun: cand.pengalamanTahun || '',
  pengalaman_utama: cand.pengalamanUtama || '',
  skills: Array.isArray(cand.skills) ? cand.skills : [],
  ringkasan_ai: cand.ringkasanAi || '',
  kelebihan_utama: cand.kelebihanUtama || '',
  ai_full_text: cand.aiFullText || '',
  ai_status: cand.aiStatus || 'pending',
  ai_analyzed_at: cand.aiAnalyzedAt || null,
  status_rekrutmen: cand.statusRekrutmen || 'Baru',
  catatan_hr: cand.catatanHr || '',
  source_type: cand.sourceType || 'manual',
  drive_file_id: cand.driveFileId || '',
  drive_file_url: cand.driveFileUrl || '',
  pdf_url: cand.pdfUrl,
  imagekit_file_id: cand.imagekitFileId || '',
  file_name: cand.fileName,
  file_size: Number(cand.fileSize || 0),
  company_id: cand.companyId || '1',
  uploaded_by: cand.uploadedBy || '',
  created_at: cand.createdAt || new Date().toISOString(),
  updated_at: cand.updatedAt || new Date().toISOString(),
});

export function readLocalCandidateCache(): CandidateCloudBundle {
  try {
    const raw = localStorage.getItem(CANDIDATE_LOCAL_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
        candidates: Array.isArray(parsed?.candidates) ? parsed.candidates : [],
        updatedAt: parsed?.updatedAt,
      };
    }
  } catch {}
  return { folders: [], candidates: [] };
}

export function writeLocalCandidateCache(bundle: CandidateCloudBundle) {
  try {
    safeSetLocalStorage(
      CANDIDATE_LOCAL_CACHE_KEY,
      JSON.stringify({
        folders: bundle.folders || [],
        candidates: bundle.candidates || [],
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {}
}

export async function loadCandidateDataFromSupabase(): Promise<{
  folders: CandidateFolder[];
  candidates: CandidateRecord[];
  tablesReady: boolean;
  source: 'tables' | 'app_settings' | 'local';
  error?: string;
}> {
  try {
    const [foldersRes, candidatesRes] = await Promise.all([
      supabase.from('candidate_folders').select('*').order('created_at', { ascending: true }),
      supabase.from('candidates').select('*').order('created_at', { ascending: false }),
    ]);

    const tableMissing = isMissingTableError(foldersRes.error) || isMissingTableError(candidatesRes.error);

    if (!tableMissing && !foldersRes.error && !candidatesRes.error) {
      let folders = (foldersRes.data || []).map(mapRowToFolder);
      let candidates = (candidatesRes.data || []).map(mapRowToCandidate);

      // Auto-migrate data if user previously saved to app_settings before running SQL
      if (folders.length === 0 && candidates.length === 0) {
        const fallback = await loadAppSettingFromSupabase(CANDIDATE_FALLBACK_SETTING_KEY);
        if (fallback && (Array.isArray(fallback.folders) && fallback.folders.length > 0)) {
          folders = fallback.folders;
          candidates = Array.isArray(fallback.candidates) ? fallback.candidates : [];
          try {
            if (folders.length > 0) {
              await supabase.from('candidate_folders').upsert(folders.map(mapFolderToRow), { onConflict: 'id' });
            }
            if (candidates.length > 0) {
              await supabase.from('candidates').upsert(candidates.map(mapCandidateToRow), { onConflict: 'id' });
            }
          } catch {}
        }
      }

      writeLocalCandidateCache({ folders, candidates });
      return { folders, candidates, tablesReady: true, source: 'tables' };
    }

    // Fallback to app_settings
    const settingData = await loadAppSettingFromSupabase(CANDIDATE_FALLBACK_SETTING_KEY);
    if (settingData && typeof settingData === 'object') {
      const folders = Array.isArray(settingData.folders) ? settingData.folders.map(mapRowToFolder) : [];
      const candidates = Array.isArray(settingData.candidates) ? settingData.candidates.map(mapRowToCandidate) : [];
      writeLocalCandidateCache({ folders, candidates });
      return {
        folders,
        candidates,
        tablesReady: !tableMissing,
        source: 'app_settings',
        error: foldersRes.error?.message || candidatesRes.error?.message,
      };
    }

    const cached = readLocalCandidateCache();
    return {
      folders: cached.folders,
      candidates: cached.candidates,
      tablesReady: !tableMissing,
      source: 'local',
      error: foldersRes.error?.message || candidatesRes.error?.message,
    };
  } catch (err: any) {
    const cached = readLocalCandidateCache();
    return {
      folders: cached.folders,
      candidates: cached.candidates,
      tablesReady: false,
      source: 'local',
      error: err?.message,
    };
  }
}

export async function saveCandidateBundleFallback(
  folders: CandidateFolder[],
  candidates: CandidateRecord[],
  updatedBy = 'hr_user'
) {
  writeLocalCandidateCache({ folders, candidates });
  try {
    await saveAppSettingToSupabase(
      CANDIDATE_FALLBACK_SETTING_KEY,
      { folders, candidates, updatedAt: new Date().toISOString() },
      updatedBy
    );
  } catch {}
}

export async function saveCandidateFolder(
  folder: CandidateFolder,
  allFolders: CandidateFolder[],
  allCandidates: CandidateRecord[],
  updatedBy = 'hr_user'
): Promise<{ success: boolean; tablesReady: boolean; error?: string }> {
  const nextFolders = allFolders.some(f => f.id === folder.id)
    ? allFolders.map(f => (f.id === folder.id ? folder : f))
    : [...allFolders, folder];

  writeLocalCandidateCache({ folders: nextFolders, candidates: allCandidates });

  try {
    const res = await withRetry(() =>
      supabase.from('candidate_folders').upsert(mapFolderToRow(folder), { onConflict: 'id' })
    );
    if (res?.error) {
      await saveCandidateBundleFallback(nextFolders, allCandidates, updatedBy);
      return {
        success: true,
        tablesReady: !isMissingTableError(res.error),
        error: res.error.message,
      };
    }
    return { success: true, tablesReady: true };
  } catch (err: any) {
    await saveCandidateBundleFallback(nextFolders, allCandidates, updatedBy);
    return {
      success: true,
      tablesReady: !isMissingTableError(err),
      error: err?.message,
    };
  }
}

export async function deleteCandidateFolderFromDb(
  folderId: string,
  allFolders: CandidateFolder[],
  allCandidates: CandidateRecord[],
  updatedBy = 'hr_user'
): Promise<{ success: boolean; tablesReady: boolean; error?: string }> {
  const nextFolders = allFolders.filter(f => f.id !== folderId);
  const nextCandidates = allCandidates.filter(c => c.folderId !== folderId);
  writeLocalCandidateCache({ folders: nextFolders, candidates: nextCandidates });

  try {
    const res = await withRetry(() =>
      supabase.from('candidate_folders').delete().eq('id', folderId)
    );
    if (res?.error) {
      await saveCandidateBundleFallback(nextFolders, nextCandidates, updatedBy);
      return {
        success: true,
        tablesReady: !isMissingTableError(res.error),
        error: res.error.message,
      };
    }
    return { success: true, tablesReady: true };
  } catch (err: any) {
    await saveCandidateBundleFallback(nextFolders, nextCandidates, updatedBy);
    return { success: true, tablesReady: !isMissingTableError(err), error: err?.message };
  }
}

export async function saveCandidateRecord(
  candidate: CandidateRecord,
  allFolders: CandidateFolder[],
  allCandidates: CandidateRecord[],
  updatedBy = 'hr_user'
): Promise<{ success: boolean; tablesReady: boolean; error?: string }> {
  const nextCandidates = allCandidates.some(c => c.id === candidate.id)
    ? allCandidates.map(c => (c.id === candidate.id ? candidate : c))
    : [candidate, ...allCandidates];

  writeLocalCandidateCache({ folders: allFolders, candidates: nextCandidates });

  try {
    const res = await withRetry(() =>
      supabase.from('candidates').upsert(mapCandidateToRow(candidate), { onConflict: 'id' })
    );
    if (res?.error) {
      await saveCandidateBundleFallback(allFolders, nextCandidates, updatedBy);
      return {
        success: true,
        tablesReady: !isMissingTableError(res.error),
        error: res.error.message,
      };
    }
    return { success: true, tablesReady: true };
  } catch (err: any) {
    await saveCandidateBundleFallback(allFolders, nextCandidates, updatedBy);
    return { success: true, tablesReady: !isMissingTableError(err), error: err?.message };
  }
}

export async function deleteCandidateRecordFromDb(
  candidateId: string,
  allFolders: CandidateFolder[],
  allCandidates: CandidateRecord[],
  updatedBy = 'hr_user'
): Promise<{ success: boolean; tablesReady: boolean; error?: string }> {
  const nextCandidates = allCandidates.filter(c => c.id !== candidateId);
  writeLocalCandidateCache({ folders: allFolders, candidates: nextCandidates });

  try {
    const res = await withRetry(() =>
      supabase.from('candidates').delete().eq('id', candidateId)
    );
    if (res?.error) {
      await saveCandidateBundleFallback(allFolders, nextCandidates, updatedBy);
      return {
        success: true,
        tablesReady: !isMissingTableError(res.error),
        error: res.error.message,
      };
    }
    return { success: true, tablesReady: true };
  } catch (err: any) {
    await saveCandidateBundleFallback(allFolders, nextCandidates, updatedBy);
    return { success: true, tablesReady: !isMissingTableError(err), error: err?.message };
  }
}
