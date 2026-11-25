import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Folder, FolderPlus, Upload, Link2, Sparkles, Search, FileText,
  ExternalLink, Trash2, Edit3, Check, X, Loader2, RefreshCw,
  Database, Copy, Settings, Eye, UserCheck, AlertCircle, CheckCircle2,
  ChevronRight, Briefcase, GraduationCap, MapPin, Phone, Mail, Clock
} from 'lucide-react';
import {
  CandidateFolder,
  CandidateRecord,
  RecruitmentStatus,
  CANDIDATE_SUPABASE_SQL,
  loadCandidateDataFromSupabase,
  saveCandidateFolder,
  deleteCandidateFolderFromDb,
  saveCandidateRecord,
  deleteCandidateRecordFromDb,
} from '../lib/candidateSync';
import { getApiUrl } from '../lib/apiUtils';
import { getStoredGeminiSettings, loadGeminiSettingsFromDatabase } from '../services/geminiKeyService';
import { saveAppSettingToSupabase, loadAppSettingFromSupabase } from '../lib/supabaseSync';

interface CandidateModuleProps {
  currentUser: {
    id?: string;
    username: string;
    nama: string;
    role: string;
  } | null;
  activeCompanyId?: string;
}

interface DetectedDrivePdf {
  fileId: string;
  fileName: string;
  driveUrl: string;
  fileSize?: number;
  selected: boolean;
  alreadyImported: boolean;
}

interface ImageKitConfigState {
  urlEndpoint: string;
  publicKey: string;
  privateKey: string;
}

const RECRUITMENT_STATUSES: RecruitmentStatus[] = ['Baru', 'Review', 'Interview', 'Diterima', 'Ditolak'];

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const fileToBase64Pure = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf('base64,');
      resolve(idx >= 0 ? res.slice(idx + 7) : res);
    };
    reader.onerror = err => reject(err);
    reader.readAsDataURL(file);
  });

export const CandidateModule: React.FC<CandidateModuleProps> = ({
  currentUser,
  activeCompanyId = '1',
}) => {
  const [folders, setFolders] = useState<CandidateFolder[]>([]);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [tablesReady, setTablesReady] = useState<boolean>(true);
  const [syncNotice, setSyncNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Filters & Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Semua' | RecruitmentStatus>('Semua');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // ImageKit Credentials (compatible with PancaDriveView localStorage + env + app_settings)
  const [ikConfig, setIkConfig] = useState<ImageKitConfigState>(() => ({
    urlEndpoint: (import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || localStorage.getItem('mypanca_imagekit_url') || '').trim(),
    publicKey: (import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || localStorage.getItem('mypanca_imagekit_public') || '').trim(),
    privateKey: (import.meta.env.VITE_IMAGEKIT_PRIVATE_KEY || localStorage.getItem('mypanca_imagekit_private') || '').trim(),
  }));
  const [showIkModal, setShowIkModal] = useState(false);
  const [ikDraft, setIkDraft] = useState<ImageKitConfigState>(ikConfig);

  // Folder Create/Edit Modal
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<CandidateFolder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [folderDescInput, setFolderDescInput] = useState('');
  const [folderDriveUrlInput, setFolderDriveUrlInput] = useState('');
  const [isSavingFolder, setIsSavingFolder] = useState(false);

  // Delete Confirmation Modal
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'folder' | 'candidate';
    id: string;
    label: string;
  } | null>(null);

  // SQL Setup Modal
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  // Google Drive Import Modal
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [isScanningDrive, setIsScanningDrive] = useState(false);
  const [detectedDriveFiles, setDetectedDriveFiles] = useState<DetectedDrivePdf[]>([]);
  const [driveScanSummary, setDriveScanSummary] = useState<string>('');
  const [autoAnalyzeOnImport, setAutoAnalyzeOnImport] = useState(true);
  const [isImportingDrive, setIsImportingDrive] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
    logs: string[];
  } | null>(null);

  // Manual Upload State
  const manualFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingManual, setIsUploadingManual] = useState(false);
  const [manualProgress, setManualProgress] = useState<string>('');

  // AI Analysis State
  const [analyzingIds, setAnalyzingIds] = useState<Record<string, boolean>>({});
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);

  // Editable HR notes inside Detail Drawer
  const [hrNotesDraft, setHrNotesDraft] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setSyncNotice({ type, message });
  };

  useEffect(() => {
    if (!syncNotice) return;
    const t = setTimeout(() => setSyncNotice(null), 5500);
    return () => clearTimeout(t);
  }, [syncNotice]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [candRes, cloudIk] = await Promise.all([
        loadCandidateDataFromSupabase(),
        loadAppSettingFromSupabase('imagekit_settings').catch(() => null),
      ]);

      setFolders(candRes.folders);
      setCandidates(candRes.candidates);
      setTablesReady(candRes.tablesReady);

      if (candRes.folders.length > 0) {
        setSelectedFolderId(prev =>
          prev && candRes.folders.some(f => f.id === prev) ? prev : candRes.folders[0].id
        );
      }

      if (cloudIk && typeof cloudIk === 'object' && !ikConfig.publicKey) {
        const merged: ImageKitConfigState = {
          urlEndpoint: String(cloudIk.urlEndpoint || ikConfig.urlEndpoint || '').trim(),
          publicKey: String(cloudIk.publicKey || ikConfig.publicKey || '').trim(),
          privateKey: String(cloudIk.privateKey || ikConfig.privateKey || '').trim(),
        };
        if (merged.urlEndpoint && merged.publicKey && merged.privateKey) {
          setIkConfig(merged);
          setIkDraft(merged);
          localStorage.setItem('mypanca_imagekit_url', merged.urlEndpoint);
          localStorage.setItem('mypanca_imagekit_public', merged.publicKey);
          localStorage.setItem('mypanca_imagekit_private', merged.privateKey);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    loadGeminiSettingsFromDatabase().catch(() => {});
  }, []);

  const selectedFolder = useMemo(
    () => folders.find(f => f.id === selectedFolderId) || null,
    [folders, selectedFolderId]
  );

  const folderCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return candidates
      .filter(c => c.folderId === selectedFolderId)
      .filter(c => statusFilter === 'Semua' || c.statusRekrutmen === statusFilter)
      .filter(c => {
        if (!q) return true;
        const haystack = [
          c.namaKandidat,
          c.email,
          c.noHp,
          c.domisili,
          c.posisiDilamar,
          c.pendidikan,
          c.pengalamanUtama,
          c.ringkasanAi,
          c.aiFullText,
          c.fileName,
          ...(c.skills || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
  }, [candidates, selectedFolderId, statusFilter, searchQuery]);

  const selectedCandidate = useMemo(
    () => candidates.find(c => c.id === selectedCandidateId) || null,
    [candidates, selectedCandidateId]
  );

  useEffect(() => {
    if (selectedCandidate) {
      setHrNotesDraft(selectedCandidate.catatanHr || '');
    }
  }, [selectedCandidate?.id]);

  const folderCounts = useMemo(() => {
    const map: Record<string, { total: number; analyzed: number }> = {};
    candidates.forEach(c => {
      if (!map[c.folderId]) map[c.folderId] = { total: 0, analyzed: 0 };
      map[c.folderId].total += 1;
      if (c.aiStatus === 'done') map[c.folderId].analyzed += 1;
    });
    return map;
  }, [candidates]);

  const isIkConfigured = Boolean(
    ikConfig.urlEndpoint.trim() && ikConfig.publicKey.trim() && ikConfig.privateKey.trim()
  );

  const getActiveGeminiPayload = () => {
    const settings = getStoredGeminiSettings();
    const activeKeyObj =
      settings.apiKeys.find(k => k.isActive && !k.isExhausted && k.key?.trim()) ||
      settings.apiKeys.find(k => k.key?.trim());
    return {
      apiKey: activeKeyObj?.key?.trim() || undefined,
      preferredModel: settings.model || 'gemini-2.5-flash',
    };
  };

  // Save ImageKit Config
  const handleSaveIkConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned: ImageKitConfigState = {
      urlEndpoint: ikDraft.urlEndpoint.trim(),
      publicKey: ikDraft.publicKey.trim(),
      privateKey: ikDraft.privateKey.trim(),
    };
    setIkConfig(cleaned);
    localStorage.setItem('mypanca_imagekit_url', cleaned.urlEndpoint);
    localStorage.setItem('mypanca_imagekit_public', cleaned.publicKey);
    localStorage.setItem('mypanca_imagekit_private', cleaned.privateKey);
    await saveAppSettingToSupabase('imagekit_settings', cleaned, currentUser?.username || 'hr').catch(() => {});
    setShowIkModal(false);
    showToast('success', 'Konfigurasi ImageKit tersimpan dan siap digunakan.');
  };

  // Folder CRUD
  const openCreateFolderModal = () => {
    setEditingFolder(null);
    setFolderNameInput('');
    setFolderDescInput('');
    setFolderDriveUrlInput('');
    setShowFolderModal(true);
  };

  const openEditFolderModal = (folder: CandidateFolder) => {
    setEditingFolder(folder);
    setFolderNameInput(folder.name);
    setFolderDescInput(folder.description || '');
    setFolderDriveUrlInput(folder.driveFolderUrl || '');
    setShowFolderModal(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = folderNameInput.trim();
    if (!cleanName) return;

    setIsSavingFolder(true);
    try {
      const now = new Date().toISOString();
      const folderObj: CandidateFolder = editingFolder
        ? {
            ...editingFolder,
            name: cleanName,
            description: folderDescInput.trim(),
            driveFolderUrl: folderDriveUrlInput.trim(),
            updatedAt: now,
          }
        : {
            id: `cfolder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: cleanName,
            description: folderDescInput.trim(),
            driveFolderUrl: folderDriveUrlInput.trim(),
            companyId: activeCompanyId,
            createdBy: currentUser?.nama || currentUser?.username || 'HR',
            createdAt: now,
            updatedAt: now,
          };

      const nextFolders = editingFolder
        ? folders.map(f => (f.id === folderObj.id ? folderObj : f))
        : [...folders, folderObj];

      const res = await saveCandidateFolder(
        folderObj,
        folders,
        candidates,
        currentUser?.username || 'hr'
      );

      setFolders(nextFolders);
      setTablesReady(res.tablesReady);
      setSelectedFolderId(folderObj.id);
      setShowFolderModal(false);
      showToast('success', `Folder "${folderObj.name}" berhasil disimpan.`);
    } finally {
      setIsSavingFolder(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'folder') {
      const res = await deleteCandidateFolderFromDb(
        confirmDelete.id,
        folders,
        candidates,
        currentUser?.username || 'hr'
      );
      const nextFolders = folders.filter(f => f.id !== confirmDelete.id);
      const nextCandidates = candidates.filter(c => c.folderId !== confirmDelete.id);
      setFolders(nextFolders);
      setCandidates(nextCandidates);
      setTablesReady(res.tablesReady);
      if (selectedFolderId === confirmDelete.id) {
        setSelectedFolderId(nextFolders[0]?.id || '');
      }
      showToast('info', `Folder "${confirmDelete.label}" dan kandidat di dalamnya telah dihapus.`);
    } else {
      const res = await deleteCandidateRecordFromDb(
        confirmDelete.id,
        folders,
        candidates,
        currentUser?.username || 'hr'
      );
      setCandidates(prev => prev.filter(c => c.id !== confirmDelete.id));
      if (selectedCandidateId === confirmDelete.id) setSelectedCandidateId(null);
      setTablesReady(res.tablesReady);
      showToast('info', `Data kandidat "${confirmDelete.label}" telah dihapus.`);
    }
    setConfirmDelete(null);
  };

  // Run AI Analysis on a Single Candidate Record
  const analyzeSingleCandidate = async (
    candidate: CandidateRecord,
    folderName: string,
    overrideBase64?: string,
    currentListOverride?: CandidateRecord[]
  ): Promise<CandidateRecord> => {
    setAnalyzingIds(prev => ({ ...prev, [candidate.id]: true }));
    try {
      const { apiKey, preferredModel } = getActiveGeminiPayload();
      const res = await fetch(getApiUrl('/api/hr/candidates/analyze-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfUrl: candidate.pdfUrl,
          pdfBase64: overrideBase64,
          fileName: candidate.fileName,
          folderName,
          preferredModel,
          apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.analysis) {
        throw new Error(data.error || 'Gagal menganalisa PDF');
      }

      const a = data.analysis;
      const updated: CandidateRecord = {
        ...candidate,
        namaKandidat: a.nama_kandidat || candidate.namaKandidat,
        email: a.email || candidate.email || '',
        noHp: a.no_hp || candidate.noHp || '',
        domisili: a.domisili || candidate.domisili || '',
        posisiDilamar: a.posisi_dilamar || folderName || candidate.posisiDilamar || '',
        pendidikan: a.pendidikan || candidate.pendidikan || '',
        pengalamanTahun: a.pengalaman_tahun || candidate.pengalamanTahun || '',
        pengalamanUtama: a.pengalaman_utama || candidate.pengalamanUtama || '',
        skills: Array.isArray(a.skills) ? a.skills : candidate.skills,
        ringkasanAi: a.ringkasan_ai || '',
        kelebihanUtama: a.kelebihan_utama || '',
        aiFullText: a.ai_full_text || a.ringkasan_ai || '',
        aiStatus: 'done',
        aiAnalyzedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const baseList = currentListOverride || candidates;
      await saveCandidateRecord(updated, folders, baseList, currentUser?.username || 'hr');
      setCandidates(prev => prev.map(c => (c.id === updated.id ? updated : c)));
      return updated;
    } catch (err: any) {
      const errUpdated: CandidateRecord = {
        ...candidate,
        aiStatus: 'error',
        ringkasanAi: err?.message || 'Gagal membaca PDF dengan AI',
        updatedAt: new Date().toISOString(),
      };
      const baseList = currentListOverride || candidates;
      await saveCandidateRecord(errUpdated, folders, baseList, currentUser?.username || 'hr');
      setCandidates(prev => prev.map(c => (c.id === errUpdated.id ? errUpdated : c)));
      return errUpdated;
    } finally {
      setAnalyzingIds(prev => ({ ...prev, [candidate.id]: false }));
    }
  };

  // Manual Multi-PDF Upload
  const handleManualFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (fileList.length === 0 || !selectedFolder) return;

    const pdfFiles = fileList.filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (pdfFiles.length === 0) {
      showToast('error', 'Harap pilih file berformat PDF (.pdf).');
      return;
    }

    if (!isIkConfigured) {
      setIkDraft(ikConfig);
      setShowIkModal(true);
      showToast('error', 'Konfigurasi ImageKit belum diisi. Silakan lengkapi terlebih dahulu.');
      return;
    }

    setIsUploadingManual(true);
    let workingList = [...candidates];
    let successCount = 0;

    try {
      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        setManualProgress(`Mengunggah (${i + 1}/${pdfFiles.length}): ${file.name}`);

        const fileBase64 = await fileToBase64Pure(file);
        const upRes = await fetch(getApiUrl('/api/hr/candidates/upload-manual-pdf'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileBase64,
            folderName: selectedFolder.name,
            ikConfig,
          }),
        });
        const upJson = await upRes.json();
        if (!upRes.ok || !upJson.success) {
          showToast('error', `Gagal upload "${file.name}": ${upJson.error || 'Server error'}`);
          continue;
        }

        const now = new Date().toISOString();
        const newCand: CandidateRecord = {
          id: `cand_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          folderId: selectedFolder.id,
          namaKandidat: file.name.replace(/\.pdf$/i, ''),
          posisiDilamar: selectedFolder.name,
          skills: [],
          aiStatus: 'pending',
          statusRekrutmen: 'Baru',
          sourceType: 'manual',
          pdfUrl: upJson.pdfUrl,
          imagekitFileId: upJson.imagekitFileId,
          fileName: upJson.fileName || file.name,
          fileSize: upJson.fileSize || file.size,
          companyId: activeCompanyId,
          uploadedBy: currentUser?.nama || currentUser?.username || 'HR',
          createdAt: now,
          updatedAt: now,
        };

        workingList = [newCand, ...workingList];
        setCandidates(workingList);
        const saveRes = await saveCandidateRecord(newCand, folders, workingList, currentUser?.username || 'hr');
        setTablesReady(saveRes.tablesReady);

        setManualProgress(`Analisa AI PDF (${i + 1}/${pdfFiles.length}): ${file.name}`);
        const analyzed = await analyzeSingleCandidate(newCand, selectedFolder.name, fileBase64, workingList);
        workingList = workingList.map(c => (c.id === analyzed.id ? analyzed : c));
        successCount += 1;
      }

      if (successCount > 0) {
        showToast('success', `${successCount} CV PDF berhasil disimpan ke ImageKit & dianalisa AI.`);
      }
    } finally {
      setIsUploadingManual(false);
      setManualProgress('');
    }
  };

  // Google Drive Folder Import
  const openDriveImportModal = () => {
    if (!selectedFolder) return;
    setDriveUrlInput(selectedFolder.driveFolderUrl || '');
    setDetectedDriveFiles([]);
    setDriveScanSummary('');
    setImportProgress(null);
    setShowDriveModal(true);
  };

  const handleScanDriveFolder = async () => {
    if (!driveUrlInput.trim() || !selectedFolder) return;
    setIsScanningDrive(true);
    setDetectedDriveFiles([]);
    setDriveScanSummary('');

    try {
      const res = await fetch(getApiUrl('/api/hr/candidates/parse-drive-folder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderUrl: driveUrlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memindai folder Google Drive.');
      }

      const existingDriveIds = new Set(
        candidates
          .filter(c => c.folderId === selectedFolder.id && c.driveFileId)
          .map(c => String(c.driveFileId))
      );

      const mapped: DetectedDrivePdf[] = (data.files || []).map((f: any) => {
        const alreadyImported = existingDriveIds.has(String(f.fileId));
        return {
          fileId: String(f.fileId),
          fileName: String(f.fileName),
          driveUrl: String(f.driveUrl),
          fileSize: f.fileSize,
          alreadyImported,
          selected: !alreadyImported,
        };
      });

      setDetectedDriveFiles(mapped);
      const skippedText =
        data.nonPdfSkipped > 0 ? ` (${data.nonPdfSkipped} file non-PDF diabaikan)` : '';
      setDriveScanSummary(
        mapped.length > 0
          ? `Ditemukan ${mapped.length} file PDF di folder Drive${skippedText}.`
          : `Tidak ditemukan file PDF langsung di folder Drive tersebut${skippedText}.`
      );

      // Save folder's Drive URL shortcut cleanly
      if (selectedFolder.driveFolderUrl !== driveUrlInput.trim()) {
        const updatedFolder: CandidateFolder = {
          ...selectedFolder,
          driveFolderUrl: driveUrlInput.trim(),
          updatedAt: new Date().toISOString(),
        };
        setFolders(prev => prev.map(f => (f.id === updatedFolder.id ? updatedFolder : f)));
        saveCandidateFolder(updatedFolder, folders, candidates, currentUser?.username || 'hr').catch(() => {});
      }
    } catch (err: any) {
      setDriveScanSummary(`Kendala: ${err?.message || 'Gagal membaca folder Drive.'}`);
    } finally {
      setIsScanningDrive(false);
    }
  };

  const handleImportSelectedDrivePdfs = async () => {
    if (!selectedFolder) return;
    const toImport = detectedDriveFiles.filter(f => f.selected);
    if (toImport.length === 0) {
      showToast('error', 'Pilih minimal 1 file PDF yang belum ditarik.');
      return;
    }

    if (!isIkConfigured) {
      setIkDraft(ikConfig);
      setShowIkModal(true);
      showToast('error', 'Konfigurasi ImageKit belum lengkap. Lengkapi terlebih dahulu sebelum menarik file.');
      return;
    }

    setIsImportingDrive(true);
    const logs: string[] = [];
    let workingList = [...candidates];
    let okCount = 0;

    try {
      for (let i = 0; i < toImport.length; i++) {
        const fileItem = toImport[i];
        setImportProgress({
          current: i + 1,
          total: toImport.length,
          currentFile: fileItem.fileName,
          logs: [...logs],
        });

        try {
          const impRes = await fetch(getApiUrl('/api/hr/candidates/import-drive-file'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileId: fileItem.fileId,
              fileName: fileItem.fileName,
              folderName: selectedFolder.name,
              ikConfig,
            }),
          });
          const impJson = await impRes.json();
          if (!impRes.ok || !impJson.success) {
            logs.push(`Gagal (${fileItem.fileName}): ${impJson.error || 'Error'}`);
            continue;
          }

          const now = new Date().toISOString();
          const newCand: CandidateRecord = {
            id: `cand_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            folderId: selectedFolder.id,
            namaKandidat: fileItem.fileName.replace(/\.pdf$/i, ''),
            posisiDilamar: selectedFolder.name,
            skills: [],
            aiStatus: 'pending',
            statusRekrutmen: 'Baru',
            sourceType: 'drive',
            driveFileId: fileItem.fileId,
            driveFileUrl: fileItem.driveUrl,
            pdfUrl: impJson.pdfUrl,
            imagekitFileId: impJson.imagekitFileId,
            fileName: impJson.fileName || fileItem.fileName,
            fileSize: impJson.fileSize || 0,
            companyId: activeCompanyId,
            uploadedBy: currentUser?.nama || currentUser?.username || 'HR',
            createdAt: now,
            updatedAt: now,
          };

          workingList = [newCand, ...workingList];
          setCandidates(workingList);
          const saveRes = await saveCandidateRecord(newCand, folders, workingList, currentUser?.username || 'hr');
          setTablesReady(saveRes.tablesReady);

          if (autoAnalyzeOnImport) {
            const analyzed = await analyzeSingleCandidate(newCand, selectedFolder.name, undefined, workingList);
            workingList = workingList.map(c => (c.id === analyzed.id ? analyzed : c));
            logs.push(`Berhasil + AI (${analyzed.namaKandidat})`);
          } else {
            logs.push(`Berhasil tersimpan (${fileItem.fileName})`);
          }
          okCount += 1;

          setDetectedDriveFiles(prev =>
            prev.map(d =>
              d.fileId === fileItem.fileId ? { ...d, alreadyImported: true, selected: false } : d
            )
          );
        } catch (itemErr: any) {
          logs.push(`Gagal (${fileItem.fileName}): ${itemErr?.message || 'Error'}`);
        }
      }

      setImportProgress({
        current: toImport.length,
        total: toImport.length,
        currentFile: 'Selesai',
        logs,
      });

      if (okCount > 0) {
        showToast('success', `${okCount} lamaran PDF berhasil ditarik dari Google Drive ke ImageKit & Database.`);
      }
    } finally {
      setIsImportingDrive(false);
    }
  };

  // Batch AI Analysis for pending PDFs in active folder
  const handleBatchAnalyzePending = async () => {
    if (!selectedFolder) return;
    const pendingList = candidates.filter(
      c => c.folderId === selectedFolder.id && c.aiStatus !== 'done'
    );
    if (pendingList.length === 0) return;

    setIsBatchAnalyzing(true);
    let workingList = [...candidates];
    try {
      for (const cand of pendingList) {
        const updated = await analyzeSingleCandidate(cand, selectedFolder.name, undefined, workingList);
        workingList = workingList.map(c => (c.id === updated.id ? updated : c));
      }
      showToast('success', `Analisa AI selesai untuk ${pendingList.length} PDF kandidat.`);
    } finally {
      setIsBatchAnalyzing(false);
    }
  };

  // Update Recruitment Status / HR Notes
  const handleUpdateCandidateStatus = async (cand: CandidateRecord, newStatus: RecruitmentStatus) => {
    const updated: CandidateRecord = {
      ...cand,
      statusRekrutmen: newStatus,
      updatedAt: new Date().toISOString(),
    };
    setCandidates(prev => prev.map(c => (c.id === cand.id ? updated : c)));
    await saveCandidateRecord(updated, folders, candidates, currentUser?.username || 'hr');
  };

  const handleSaveHrNotes = async () => {
    if (!selectedCandidate) return;
    setIsSavingNotes(true);
    try {
      const updated: CandidateRecord = {
        ...selectedCandidate,
        catatanHr: hrNotesDraft,
        updatedAt: new Date().toISOString(),
      };
      setCandidates(prev => prev.map(c => (c.id === updated.id ? updated : c)));
      await saveCandidateRecord(updated, folders, candidates, currentUser?.username || 'hr');
      showToast('success', 'Catatan HR berhasil disimpan.');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const pendingInFolderCount = useMemo(
    () => candidates.filter(c => c.folderId === selectedFolderId && c.aiStatus !== 'done').length,
    [candidates, selectedFolderId]
  );

  return (
    <div className="h-full flex flex-col gap-4 text-foreground">
      {/* Top Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-xl px-5 py-4">
        <div>
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <h1 className="text-lg font-bold tracking-tight">Manajemen Kandidat & Pelamar Kerja</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Kelola folder lowongan secara manual, tarik CV PDF dari link folder Google Drive atau upload langsung ke ImageKit, lalu ekstrak profil otomatis via AI.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!tablesReady && (
            <button
              type="button"
              onClick={() => setShowSqlModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition cursor-pointer"
            >
              <Database size={14} />
              <span>Setup SQL Supabase</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIkDraft(ikConfig);
              setShowIkModal(true);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              isIkConfigured
                ? 'bg-background hover:bg-accent text-foreground border-border'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
            }`}
          >
            <Settings size={14} />
            <span>{isIkConfigured ? 'ImageKit Terhubung' : 'Atur ImageKit'}</span>
          </button>
          <button
            type="button"
            onClick={loadAll}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-background hover:bg-accent text-foreground border border-border transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Sinkronkan</span>
          </button>
          <button
            type="button"
            onClick={openCreateFolderModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition cursor-pointer"
          >
            <FolderPlus size={14} />
            <span>Buat Folder Posisi</span>
          </button>
        </div>
      </div>

      {/* Inline Notification Banner */}
      {syncNotice && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-xs font-medium ${
            syncNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : syncNotice.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncNotice.type === 'success' ? (
              <CheckCircle2 size={15} />
            ) : (
              <AlertCircle size={15} />
            )}
            <span>{syncNotice.message}</span>
          </div>
          <button type="button" onClick={() => setSyncNotice(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Split Content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Sidebar: Manual Position Folders */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Folder Posisi ({folders.length})
            </span>
            <button
              type="button"
              onClick={openCreateFolderModal}
              className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
            >
              + Tambah
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isLoading && folders.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={18} className="animate-spin" />
                <span>Memuat folder kandidat...</span>
              </div>
            ) : folders.length === 0 ? (
              <div className="p-5 text-center space-y-3">
                <Folder className="w-8 h-8 mx-auto text-muted-foreground/50" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">Belum ada folder posisi</p>
                  <p className="text-[11px] text-muted-foreground">
                    Buat folder manual (misal: Sales, Digital Marketing, Engineering) untuk mengelompokkan pelamar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateFolderModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 cursor-pointer"
                >
                  <FolderPlus size={13} />
                  <span>Buat Folder Pertama</span>
                </button>
              </div>
            ) : (
              folders.map(folder => {
                const active = folder.id === selectedFolderId;
                const count = folderCounts[folder.id] || { total: 0, analyzed: 0 };
                return (
                  <div
                    key={folder.id}
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      setSelectedCandidateId(null);
                    }}
                    className={`group px-3 py-2.5 rounded-lg cursor-pointer transition flex items-start justify-between gap-2 border ${
                      active
                        ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 border-transparent'
                        : 'bg-transparent hover:bg-muted/60 border-transparent text-foreground'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Folder size={15} className={active ? 'text-violet-400 dark:text-violet-600 shrink-0' : 'text-muted-foreground shrink-0'} />
                        <span className="text-xs font-bold truncate">{folder.name}</span>
                      </div>
                      <div className={`text-[11px] mt-1 flex items-center gap-1.5 ${active ? 'text-zinc-300 dark:text-zinc-600' : 'text-muted-foreground'}`}>
                        <span>{count.total} PDF</span>
                        <span aria-hidden="true">·</span>
                        <span>{count.analyzed} teranalisa AI</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          openEditFolderModal(folder);
                        }}
                        title="Edit Folder"
                        className={`p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer`}
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setConfirmDelete({ type: 'folder', id: folder.id, label: folder.name });
                        }}
                        title="Hapus Folder"
                        className="p-1 rounded hover:bg-rose-500/20 text-rose-500 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Area: Selected Folder Workspace */}
        <div className="lg:col-span-9 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          {!selectedFolder ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3">
              <Briefcase className="w-10 h-10 text-muted-foreground/40" />
              <div className="space-y-1 max-w-md">
                <h2 className="text-sm font-bold">Pilih atau Buat Folder Posisi</h2>
                <p className="text-xs text-muted-foreground">
                  Setelah folder dipilih, Anda dapat mengunggah CV PDF secara manual atau menarik seluruh PDF dari link folder Google Drive ke ImageKit dan langsung dibaca oleh AI.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Folder Action Toolbar */}
              <div className="p-4 border-b border-border space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Folder Kandidat</span>
                      <ChevronRight size={13} />
                      <span className="font-semibold text-foreground">{selectedFolder.name}</span>
                    </div>
                    <h2 className="text-base font-bold mt-0.5">{selectedFolder.name}</h2>
                    {selectedFolder.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedFolder.description}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={manualFileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      multiple
                      className="hidden"
                      onChange={handleManualFilesSelected}
                    />
                    <button
                      type="button"
                      disabled={isUploadingManual}
                      onClick={() => manualFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-background hover:bg-accent text-foreground border border-border transition cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingManual ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      <span>Upload Manual PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={openDriveImportModal}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition cursor-pointer"
                    >
                      <Link2 size={14} />
                      <span>Tarik dari Google Drive</span>
                    </button>

                    {pendingInFolderCount > 0 && (
                      <button
                        type="button"
                        disabled={isBatchAnalyzing}
                        onClick={handleBatchAnalyzePending}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer disabled:opacity-50"
                      >
                        {isBatchAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        <span>Analisa AI ({pendingInFolderCount} PDF)</span>
                      </button>
                    )}
                  </div>
                </div>

                {manualProgress && (
                  <div className="px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs text-violet-700 dark:text-violet-300 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin shrink-0" />
                    <span>{manualProgress}</span>
                  </div>
                )}

                {/* Search & Status Filters */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Cari nama, skill, domisili, pendidikan..."
                      className="w-full bg-background border border-input rounded-lg pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* Interactive Filter Segmented Controls */}
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-muted/60 rounded-lg border border-border">
                    {(['Semua', ...RECRUITMENT_STATUSES] as const).map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                          statusFilter === st
                            ? 'bg-background text-foreground shadow-xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Candidate Table */}
              <div className="flex-1 overflow-auto">
                {folderCandidates.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <FileText className="w-9 h-9 mx-auto text-muted-foreground/40" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Belum ada CV kandidat di folder ini</p>
                      <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        Klik "Upload Manual PDF" untuk mengunggah lamaran dari komputer, atau "Tarik dari Google Drive" untuk menarik seluruh PDF dari folder Google Drive publik.
                      </p>
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Kandidat & Kontak</th>
                        <th className="px-4 py-3 font-semibold">Pendidikan & Pengalaman</th>
                        <th className="px-4 py-3 font-semibold">Keahlian & Ringkasan AI</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {folderCandidates.map(cand => {
                        const isAnalyzingThis = Boolean(analyzingIds[cand.id]);
                        return (
                          <tr
                            key={cand.id}
                            onClick={() => setSelectedCandidateId(cand.id)}
                            className={`hover:bg-muted/40 transition cursor-pointer ${
                              selectedCandidateId === cand.id ? 'bg-muted/60' : ''
                            }`}
                          >
                            <td className="px-4 py-3 align-top min-w-[200px]">
                              <div className="font-bold text-foreground">{cand.namaKandidat}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
                                <div>
                                  {cand.noHp || 'No. HP belum terbaca'}
                                  {cand.domisili ? ` · ${cand.domisili}` : ''}
                                </div>
                                {cand.email && <div className="truncate max-w-[200px]">{cand.email}</div>}
                                <div className="text-[10px] opacity-80">
                                  Sumber: {cand.sourceType === 'drive' ? 'Google Drive' : 'Upload Manual'} · {formatBytes(cand.fileSize)}
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3 align-top min-w-[190px]">
                              <div className="font-medium text-foreground">
                                {cand.pendidikan || <span className="text-muted-foreground italic">Belum terbaca AI</span>}
                              </div>
                              {cand.pengalamanTahun && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  Pengalaman: {cand.pengalamanTahun}
                                </div>
                              )}
                              {cand.pengalamanUtama && (
                                <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2 max-w-[240px]">
                                  {cand.pengalamanUtama}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 align-top max-w-[300px]">
                              {cand.aiStatus === 'done' ? (
                                <div className="space-y-1">
                                  {cand.skills.length > 0 && (
                                    <div className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
                                      {cand.skills.slice(0, 5).join(' · ')}
                                    </div>
                                  )}
                                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                                    {cand.ringkasanAi || cand.aiFullText}
                                  </p>
                                </div>
                              ) : cand.aiStatus === 'error' ? (
                                <div className="text-[11px] text-rose-600 dark:text-rose-400">
                                  Gagal analisa AI: {cand.ringkasanAi || 'Coba ulangi'}
                                </div>
                              ) : (
                                <div className="text-[11px] text-muted-foreground italic">
                                  Menunggu pembacaan PDF oleh AI
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 align-top" onClick={e => e.stopPropagation()}>
                              <select
                                value={cand.statusRekrutmen}
                                onChange={e =>
                                  handleUpdateCandidateStatus(cand, e.target.value as RecruitmentStatus)
                                }
                                className="bg-background border border-input rounded-md px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                              >
                                {RECRUITMENT_STATUSES.map(st => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="px-4 py-3 align-top text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedCandidateId(cand.id)}
                                  title="Lihat Detail & Hasil AI"
                                  className="p-1.5 rounded-md hover:bg-muted text-foreground cursor-pointer"
                                >
                                  <Eye size={14} />
                                </button>
                                <a
                                  href={cand.pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Buka PDF di ImageKit"
                                  className="p-1.5 rounded-md hover:bg-muted text-violet-600 dark:text-violet-400"
                                >
                                  <ExternalLink size={14} />
                                </a>
                                <button
                                  type="button"
                                  disabled={isAnalyzingThis}
                                  onClick={() => analyzeSingleCandidate(cand, selectedFolder.name)}
                                  title="Analisa Ulang PDF dengan AI"
                                  className="p-1.5 rounded-md hover:bg-muted text-emerald-600 dark:text-emerald-400 disabled:opacity-50 cursor-pointer"
                                >
                                  {isAnalyzingThis ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Sparkles size={14} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDelete({
                                      type: 'candidate',
                                      id: cand.id,
                                      label: cand.namaKandidat,
                                    })
                                  }
                                  title="Hapus Kandidat"
                                  className="p-1.5 rounded-md hover:bg-rose-500/10 text-rose-500 cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal: Create / Edit Folder */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {editingFolder ? 'Edit Folder Posisi' : 'Buat Folder Posisi Baru'}
              </h3>
              <button type="button" onClick={() => setShowFolderModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveFolder} className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold block">Nama Folder / Posisi *</label>
                <input
                  type="text"
                  required
                  value={folderNameInput}
                  onChange={e => setFolderNameInput(e.target.value)}
                  placeholder="Contoh: Sales, Digital Marketing, Teknisi"
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold block">Deskripsi Singkat</label>
                <textarea
                  rows={2}
                  value={folderDescInput}
                  onChange={e => setFolderDescInput(e.target.value)}
                  placeholder="Kriteria umum posisi atau keterangan batch rekrutmen..."
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold block">Link Folder Google Drive (Opsional)</label>
                <input
                  type="url"
                  value={folderDriveUrlInput}
                  onChange={e => setFolderDriveUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="text-[11px] text-muted-foreground">
                  Gunakan folder Google Drive publik yang berisi file PDF lamaran secara langsung.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-muted font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingFolder}
                  className="px-4 py-2 rounded-lg bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingFolder ? 'Menyimpan...' : 'Simpan Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import from Public Google Drive Folder */}
      {showDriveModal && selectedFolder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold">Tarik Lamaran PDF dari Google Drive</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Target Folder: {selectedFolder.name} (File PDF otomatis disimpan permanen ke ImageKit)
                </p>
              </div>
              <button
                type="button"
                disabled={isImportingDrive}
                onClick={() => setShowDriveModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
              <div className="space-y-1.5">
                <label className="font-semibold block">Link Folder Google Drive Publik</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={driveUrlInput}
                    onChange={e => setDriveUrlInput(e.target.value)}
                    placeholder="Tempel link https://drive.google.com/drive/folders/..."
                    className="flex-1 bg-background border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    disabled={isScanningDrive || isImportingDrive || !driveUrlInput.trim()}
                    onClick={handleScanDriveFolder}
                    className="px-4 py-2 rounded-lg bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {isScanningDrive ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    <span>Scan Isi Folder</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Pastikan akses berbagi folder diatur ke "Siapa saja yang memiliki link (Anyone with the link)" dan file lamaran PDF berada langsung di dalam folder tersebut.
                </p>
              </div>

              {driveScanSummary && (
                <div className="px-3 py-2 rounded-lg bg-muted/60 border border-border text-xs font-medium">
                  {driveScanSummary}
                </div>
              )}

              {detectedDriveFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      Daftar File PDF ({detectedDriveFiles.filter(f => f.selected).length} dipilih)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDetectedDriveFiles(prev =>
                          prev.map(f => (f.alreadyImported ? f : { ...f, selected: !f.selected }))
                        )
                      }
                      className="text-violet-600 dark:text-violet-400 hover:underline font-medium cursor-pointer"
                    >
                      Toggle Pilih Baru
                    </button>
                  </div>

                  <div className="border border-border rounded-lg divide-y divide-border max-h-56 overflow-y-auto">
                    {detectedDriveFiles.map(file => (
                      <label
                        key={file.fileId}
                        className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer ${
                          file.alreadyImported ? 'opacity-60 bg-muted/30' : 'hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={file.selected}
                            disabled={isImportingDrive}
                            onChange={e =>
                              setDetectedDriveFiles(prev =>
                                prev.map(d =>
                                  d.fileId === file.fileId ? { ...d, selected: e.target.checked } : d
                                )
                              )
                            }
                          />
                          <FileText size={14} className="text-rose-500 shrink-0" />
                          <span className="truncate font-medium">{file.fileName}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {file.alreadyImported ? 'Sudah Ada' : 'Siap Tarik'}
                        </span>
                      </label>
                    ))}
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoAnalyzeOnImport}
                      onChange={e => setAutoAnalyzeOnImport(e.target.checked)}
                    />
                    <span>Langsung baca & ekstrak isi CV PDF dengan Gemini AI setelah ditarik ke ImageKit</span>
                  </label>
                </div>
              )}

              {importProgress && (
                <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                  <div className="flex items-center justify-between font-semibold">
                    <span>
                      Proses {importProgress.current} / {importProgress.total}: {importProgress.currentFile}
                    </span>
                    <span>
                      {Math.round((importProgress.current / Math.max(1, importProgress.total)) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-600 transition-all"
                      style={{
                        width: `${Math.round((importProgress.current / Math.max(1, importProgress.total)) * 100)}%`,
                      }}
                    />
                  </div>
                  {importProgress.logs.length > 0 && (
                    <div className="max-h-24 overflow-y-auto text-[11px] text-muted-foreground space-y-0.5 pt-1">
                      {importProgress.logs.map((l, idx) => (
                        <div key={idx}>{l}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2 shrink-0">
              <button
                type="button"
                disabled={isImportingDrive}
                onClick={() => setShowDriveModal(false)}
                className="px-4 py-2 rounded-lg border border-border hover:bg-muted text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={
                  isImportingDrive || detectedDriveFiles.filter(f => f.selected).length === 0
                }
                onClick={handleImportSelectedDrivePdfs}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isImportingDrive ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>
                  Tarik ke ImageKit ({detectedDriveFiles.filter(f => f.selected).length} PDF)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Candidate Detail & AI Extracted Profile + ImageKit PDF Viewer */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-bold truncate">{selectedCandidate.namaKandidat}</h3>
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-0.5">
                  <span>{selectedCandidate.posisiDilamar || selectedFolder?.name || 'Kandidat'}</span>
                  <span aria-hidden="true">·</span>
                  <span>File: {selectedCandidate.fileName}</span>
                  <span aria-hidden="true">·</span>
                  <span>Status: {selectedCandidate.statusRekrutmen}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={Boolean(analyzingIds[selectedCandidate.id])}
                  onClick={() =>
                    analyzeSingleCandidate(
                      selectedCandidate,
                      selectedFolder?.name || selectedCandidate.posisiDilamar || 'Umum'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                >
                  {analyzingIds[selectedCandidate.id] ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  <span>Analisa Ulang AI</span>
                </button>
                <a
                  href={selectedCandidate.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <ExternalLink size={13} />
                  <span>Buka PDF Penuh</span>
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedCandidateId(null)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border text-xs">
              {/* Extracted AI Info & HR Notes */}
              <div className="lg:col-span-6 p-5 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Mail size={12} /> Email
                    </div>
                    <div className="font-medium break-all">{selectedCandidate.email || '-'}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Phone size={12} /> No. HP / WhatsApp
                    </div>
                    <div className="font-medium">{selectedCandidate.noHp || '-'}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <MapPin size={12} /> Domisili
                    </div>
                    <div className="font-medium">{selectedCandidate.domisili || '-'}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock size={12} /> Lama Pengalaman
                    </div>
                    <div className="font-medium">{selectedCandidate.pengalamanTahun || '-'}</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border space-y-1">
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <GraduationCap size={13} /> Pendidikan
                  </div>
                  <div className="font-medium">{selectedCandidate.pendidikan || '-'}</div>
                </div>

                <div className="pt-2 border-t border-border space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground">Ringkasan AI</div>
                  <p className="leading-relaxed text-foreground">
                    {selectedCandidate.ringkasanAi || 'Belum ada ringkasan AI.'}
                  </p>
                </div>

                {selectedCandidate.kelebihanUtama && (
                  <div className="pt-2 border-t border-border space-y-1">
                    <div className="text-[11px] font-semibold text-muted-foreground">Nilai Jual / Kelebihan</div>
                    <p className="leading-relaxed">{selectedCandidate.kelebihanUtama}</p>
                  </div>
                )}

                {selectedCandidate.skills.length > 0 && (
                  <div className="pt-2 border-t border-border space-y-1">
                    <div className="text-[11px] font-semibold text-muted-foreground">Keahlian (Skills)</div>
                    <p className="font-medium text-violet-700 dark:text-violet-300 leading-relaxed">
                      {selectedCandidate.skills.join(' · ')}
                    </p>
                  </div>
                )}

                {selectedCandidate.pengalamanUtama && (
                  <div className="pt-2 border-t border-border space-y-1">
                    <div className="text-[11px] font-semibold text-muted-foreground">Riwayat Pengalaman Kerja</div>
                    <p className="leading-relaxed whitespace-pre-line">{selectedCandidate.pengalamanUtama}</p>
                  </div>
                )}

                {selectedCandidate.aiFullText && (
                  <div className="pt-2 border-t border-border space-y-1">
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      Hasil Ekstraksi Lengkap CV (Referensi Panca AI)
                    </div>
                    <div className="p-3 rounded-lg bg-muted/40 border border-border leading-relaxed whitespace-pre-line text-[11px]">
                      {selectedCandidate.aiFullText}
                    </div>
                  </div>
                )}

                {/* HR Status & Notes */}
                <div className="pt-3 border-t border-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold">Status & Catatan HR</label>
                    <select
                      value={selectedCandidate.statusRekrutmen}
                      onChange={e =>
                        handleUpdateCandidateStatus(
                          selectedCandidate,
                          e.target.value as RecruitmentStatus
                        )
                      }
                      className="bg-background border border-input rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer"
                    >
                      {RECRUITMENT_STATUSES.map(st => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    rows={3}
                    value={hrNotesDraft}
                    onChange={e => setHrNotesDraft(e.target.value)}
                    placeholder="Tulis catatan hasil screening / jadwal interview HR..."
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={isSavingNotes}
                      onClick={handleSaveHrNotes}
                      className="px-3.5 py-1.5 rounded-lg bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingNotes ? 'Menyimpan...' : 'Simpan Catatan HR'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Embedded ImageKit PDF Viewer */}
              <div className="lg:col-span-6 bg-muted/20 flex flex-col min-h-[380px]">
                <div className="px-4 py-2 border-b border-border text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>Pratinjau Dokumen PDF (ImageKit)</span>
                  {selectedCandidate.driveFileUrl && (
                    <a
                      href={selectedCandidate.driveFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 dark:text-violet-400 hover:underline"
                    >
                      Link Asal Drive
                    </a>
                  )}
                </div>
                <iframe
                  src={selectedCandidate.pdfUrl}
                  title={`CV ${selectedCandidate.namaKandidat}`}
                  className="w-full flex-1 min-h-[450px] bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ImageKit Configuration */}
      {showIkModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold">Konfigurasi ImageKit</h3>
              <button type="button" onClick={() => setShowIkModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveIkConfig} className="p-5 space-y-3.5 text-xs">
              <p className="text-[11px] text-muted-foreground">
                Kredensial ini terhubung bersama fitur Panca Drive untuk menyimpan file PDF lamaran secara permanen.
              </p>
              <div className="space-y-1">
                <label className="font-semibold block">URL Endpoint</label>
                <input
                  type="url"
                  required
                  value={ikDraft.urlEndpoint}
                  onChange={e => setIkDraft(p => ({ ...p, urlEndpoint: e.target.value }))}
                  placeholder="https://ik.imagekit.io/..."
                  className="w-full bg-background border border-input rounded-lg px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold block">Public Key</label>
                <input
                  type="text"
                  required
                  value={ikDraft.publicKey}
                  onChange={e => setIkDraft(p => ({ ...p, publicKey: e.target.value }))}
                  placeholder="public_..."
                  className="w-full bg-background border border-input rounded-lg px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold block">Private Key</label>
                <input
                  type="password"
                  required
                  value={ikDraft.privateKey}
                  onChange={e => setIkDraft(p => ({ ...p, privateKey: e.target.value }))}
                  placeholder="private_..."
                  className="w-full bg-background border border-input rounded-lg px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIkModal(false)}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-muted font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 font-semibold hover:opacity-90 cursor-pointer"
                >
                  Simpan ImageKit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm p-5 space-y-4 shadow-xl text-xs">
            <h3 className="text-sm font-bold">Konfirmasi Hapus</h3>
            <p className="text-muted-foreground leading-relaxed">
              Yakin ingin menghapus {confirmDelete.type === 'folder' ? 'folder posisi beserta seluruh kandidat di dalamnya' : 'data kandidat'}:{' '}
              <strong className="text-foreground">{confirmDelete.label}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg border border-border hover:bg-muted font-medium cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Supabase SQL Setup Helper */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Script SQL Supabase: Tabel Kandidat</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Jalankan script ini di Supabase Dashboard → SQL Editor agar data tersimpan di tabel khusus candidate_folders & candidates.
                </p>
              </div>
              <button type="button" onClick={() => setShowSqlModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <pre className="p-3.5 rounded-lg bg-zinc-950 text-zinc-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
                {CANDIDATE_SUPABASE_SQL}
              </pre>
            </div>
            <div className="px-5 py-3.5 border-t border-border flex justify-between items-center">
              <span className="text-[11px] text-muted-foreground">
                Setelah dijalankan di Supabase, klik tombol "Sinkronkan" untuk migrasi otomatis.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(CANDIDATE_SUPABASE_SQL);
                    setSqlCopied(true);
                    setTimeout(() => setSqlCopied(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {sqlCopied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{sqlCopied ? 'Tersalin' : 'Salin Script SQL'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateModule;
