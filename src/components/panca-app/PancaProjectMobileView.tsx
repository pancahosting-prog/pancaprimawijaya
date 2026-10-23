import React, { useState, useEffect } from 'react';
import { 
  Project, ProjectFile, ProjectNote, ProjectFolderCategory 
} from '../../../task/types';
import { supabaseService } from '../../../task/services/supabaseService';
import { 
  FolderKanban, Plus, Search, ArrowLeft, Folder, FileText, 
  ExternalLink, Trash2, Eye, X, Upload, Check, AlertCircle, 
  Clock, Shield, Layers, FileCode, CheckCircle2, ChevronRight,
  BookOpen, Sparkles, Building, Calendar, User, Download, Lock
} from 'lucide-react';

interface PancaProjectMobileViewProps {
  currentUser?: {
    username: string;
    role: string;
    nama?: string;
    name?: string;
  } | null;
  onBack?: () => void;
}

export const PancaProjectMobileView: React.FC<PancaProjectMobileViewProps> = ({
  currentUser,
  onBack
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<'folders' | 'notes'>('folders');
  const [openFolder, setOpenFolder] = useState<ProjectFolderCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua');
  const [noteCategoryFilter, setNoteCategoryFilter] = useState<string>('Semua');

  // Modals
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isAddFileModalOpen, setIsAddFileModalOpen] = useState(false);
  const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; fileType: string } | null>(null);

  // New Project Form
  const [newProject, setNewProject] = useState<Partial<Project>>({
    code: `PRJ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    title: '',
    clientName: '',
    location: '',
    status: 'Sedang Berjalan',
    leadEngineer: currentUser?.nama || currentUser?.name || currentUser?.username || 'Engineer',
    startDate: new Date().toISOString().split('T')[0],
    description: ''
  });

  // File Upload States
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [newFile, setNewFile] = useState({
    name: '',
    url: '',
    fileType: 'pdf',
    notes: ''
  });

  // New Note Form
  const [newNote, setNewNote] = useState({
    title: '',
    category: 'SLD / Wiring Diagram' as string,
    content: ''
  });

  const activeName = currentUser?.nama || currentUser?.name || currentUser?.username || 'Engineer';
  const userRole = (currentUser?.role || '').toLowerCase();
  const isSuperadmin = userRole === 'superadmin';

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await supabaseService.getProjects();
      setProjects(data || []);
      // Keep selectedProject up to date if currently open
      if (selectedProject) {
        const found = (data || []).find(p => p.id === selectedProject.id);
        if (found) setSelectedProject(found);
      }
    } catch (e) {
      console.warn('Error loading projects:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert File to Base64 Data URL as reliable local fallback
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = err => reject(err);
    });
  };

  // ImageKit Web Crypto Uploader with Base64 fallback
  const uploadFileHandler = async (file: File): Promise<{ url: string; fileId?: string }> => {
    const envUrl = (import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || '').trim();
    const envPublic = (import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || '').trim();
    const envPrivate = (import.meta.env.VITE_IMAGEKIT_PRIVATE_KEY || '').trim();

    const ikUrl = envUrl || localStorage.getItem('mypanca_imagekit_url') || '';
    const ikPublic = envPublic || localStorage.getItem('mypanca_imagekit_public') || '';
    const ikPrivate = envPrivate || localStorage.getItem('mypanca_imagekit_private') || '';

    // If ImageKit credentials are fully available, attempt ImageKit direct upload
    if (ikUrl && ikPublic && ikPrivate) {
      try {
        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const expire = Math.floor(Date.now() / 1000) + 1800;

        const encoder = new TextEncoder();
        const encodedKey = encoder.encode(ikPrivate.trim());
        const encodedData = encoder.encode(token + expire);

        const hmacKey = await window.crypto.subtle.importKey(
          'raw',
          encodedKey,
          { name: 'HMAC', hash: 'SHA-1' },
          true,
          ['sign']
        );

        const signatureBuffer = await window.crypto.subtle.sign('HMAC', hmacKey, encodedData);
        const signatureHex = Array.from(new Uint8Array(signatureBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', file.name);
        formData.append('publicKey', ikPublic.trim());
        formData.append('signature', signatureHex);
        formData.append('token', token);
        formData.append('expire', expire.toString());
        formData.append('useUniqueFileName', 'true');
        formData.append('folder', `/mypanca_projects/${openFolder || 'general'}`);

        const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          return { url: result.url, fileId: result.fileId };
        }
      } catch (uploadErr) {
        console.warn('ImageKit direct upload failed, fallback to base64 storage:', uploadErr);
      }
    }

    // High fidelity Base64 fallback
    const base64Url = await fileToBase64(file);
    return { url: base64Url };
  };

  // Folder Access Control
  const canAccessFolder = (category: ProjectFolderCategory): boolean => {
    if (isSuperadmin) return true;
    if (category === 'engineering' || category === 'documentation') return true;
    if (category === 'commercial') return userRole === 'commercial' || userRole === 'finance';
    if (category === 'finance') return userRole === 'finance' || userRole === 'commercial';
    return false;
  };

  // Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.title || !newProject.clientName) {
      alert('Judul Project dan Nama Klien wajib diisi.');
      return;
    }

    const projectToSave: Project = {
      id: `proj_${Date.now()}`,
      code: newProject.code || `PRJ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      title: newProject.title.trim(),
      clientName: newProject.clientName.trim(),
      location: newProject.location || '',
      status: (newProject.status as any) || 'Sedang Berjalan',
      leadEngineer: newProject.leadEngineer || activeName,
      startDate: newProject.startDate || new Date().toISOString().split('T')[0],
      description: newProject.description || '',
      files: {
        engineering: [],
        commercial: [],
        finance: [],
        documentation: []
      },
      notes: []
    };

    const updated = await supabaseService.saveProject(projectToSave);
    setProjects(updated);
    setSelectedProject(projectToSave);
    setIsProjectModalOpen(false);
    setNewProject({
      code: `PRJ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      title: '',
      clientName: '',
      location: '',
      status: 'Sedang Berjalan',
      leadEngineer: activeName,
      startDate: new Date().toISOString().split('T')[0],
      description: ''
    });
  };

  // File Upload to Folder
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !openFolder) return;

    setIsUploading(true);
    setUploadError('');

    try {
      let finalUrl = newFile.url.trim();
      let detectedType = newFile.fileType;

      if (selectedFileObj) {
        const uploadResult = await uploadFileHandler(selectedFileObj);
        finalUrl = uploadResult.url;
        detectedType = selectedFileObj.type || selectedFileObj.name.split('.').pop() || 'pdf';
      }

      if (!finalUrl) {
        throw new Error('Pilih berkas dari perangkat atau masukkan URL/Link file.');
      }

      const fileName = newFile.name.trim() || (selectedFileObj ? selectedFileObj.name : 'Dokumen Proyek');

      const fileItem: ProjectFile = {
        id: `file_${Date.now()}`,
        name: fileName,
        url: finalUrl,
        fileType: detectedType,
        uploadedBy: activeName,
        uploadedAt: new Date().toISOString(),
        notes: newFile.notes
      };

      const currentFiles = selectedProject.files || { engineering: [], commercial: [], finance: [], documentation: [] };
      const updatedFiles = {
        ...currentFiles,
        [openFolder]: [...(currentFiles[openFolder] || []), fileItem]
      };

      const updatedProject: Project = {
        ...selectedProject,
        files: updatedFiles,
        updated_at: new Date().toISOString()
      };

      const list = await supabaseService.saveProject(updatedProject);
      setProjects(list);
      setSelectedProject(updatedProject);
      setIsAddFileModalOpen(false);
      setSelectedFileObj(null);
      setNewFile({ name: '', url: '', fileType: 'pdf', notes: '' });
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'Gagal mengunggah berkas.');
    } finally {
      setIsUploading(false);
    }
  };

  // Delete File
  const handleDeleteFile = async (fileId: string) => {
    if (!selectedProject || !openFolder) return;
    if (!confirm('Apakah Anda yakin ingin menghapus berkas ini?')) return;

    const currentFiles = selectedProject.files || { engineering: [], commercial: [], finance: [], documentation: [] };
    const folderFiles = (currentFiles[openFolder] || []).filter(f => f.id !== fileId);
    
    const updatedProject: Project = {
      ...selectedProject,
      files: {
        ...currentFiles,
        [openFolder]: folderFiles
      },
      updated_at: new Date().toISOString()
    };

    const list = await supabaseService.saveProject(updatedProject);
    setProjects(list);
    setSelectedProject(updatedProject);
  };

  // Add SOP Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newNote.title.trim() || !newNote.content.trim()) {
      alert('Judul Catatan dan Detail Penjelasan wajib diisi.');
      return;
    }

    const noteItem: ProjectNote = {
      id: `note_${Date.now()}`,
      title: newNote.title.trim(),
      category: newNote.category as any,
      content: newNote.content.trim(),
      author: activeName,
      createdAt: new Date().toISOString()
    };

    const updatedProject: Project = {
      ...selectedProject,
      notes: [...(selectedProject.notes || []), noteItem],
      updated_at: new Date().toISOString()
    };

    const list = await supabaseService.saveProject(updatedProject);
    setProjects(list);
    setSelectedProject(updatedProject);
    setIsAddNoteModalOpen(false);
    setNewNote({ title: '', category: 'SLD / Wiring Diagram', content: '' });
  };

  // Delete SOP Note
  const handleDeleteNote = async (noteId: string) => {
    if (!selectedProject) return;
    if (!confirm('Apakah Anda yakin ingin menghapus catatan SOP ini?')) return;

    const updatedProject: Project = {
      ...selectedProject,
      notes: (selectedProject.notes || []).filter(n => n.id !== noteId),
      updated_at: new Date().toISOString()
    };

    const list = await supabaseService.saveProject(updatedProject);
    setProjects(list);
    setSelectedProject(updatedProject);
  };

  const folderConfigs: {
    key: ProjectFolderCategory;
    title: string;
    subtitle: string;
    color: string;
    badgeColor: string;
    restrictedRoles: string;
  }[] = [
    {
      key: 'engineering',
      title: '1. Engineering',
      subtitle: 'SLD, drawing, wiring, setting, troubleshooting, manual, T&C',
      color: 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900',
      badgeColor: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
      restrictedRoles: 'Akses Publik / Engineer'
    },
    {
      key: 'commercial',
      title: '2. Commercial / Anggaran',
      subtitle: 'RAB, HPP, costing, margin, penawaran harga',
      color: 'border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20',
      badgeColor: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300',
      restrictedRoles: 'Terbatas: Commercial, Finance, Superadmin'
    },
    {
      key: 'finance',
      title: '3. Admin / Finance',
      subtitle: 'Quotation, PO, invoice, BAST, bukti pembayaran',
      color: 'border-purple-200/80 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20',
      badgeColor: 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300',
      restrictedRoles: 'Terbatas: Finance, Commercial, Superadmin'
    },
    {
      key: 'documentation',
      title: '4. Documentation',
      subtitle: 'Foto/video before-after, instalasi lapangan, testing',
      color: 'border-amber-200/80 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20',
      badgeColor: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300',
      restrictedRoles: 'Akses Publik / Engineer'
    }
  ];

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Sedang Berjalan':
        return 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'Perencanaan':
        return 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'Garansi':
        return 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      default:
        return 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700';
    }
  };

  const filteredProjects = projects.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      p.title.toLowerCase().includes(q) ||
      p.clientName.toLowerCase().includes(q) ||
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.leadEngineer && p.leadEngineer.toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'Semua' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate totals
  const totalProjects = projects.length;
  const totalDocs = projects.reduce((acc, p) => {
    const f = p.files || { engineering: [], commercial: [], finance: [], documentation: [] };
    return acc + (f.engineering?.length || 0) + (f.commercial?.length || 0) + (f.finance?.length || 0) + (f.documentation?.length || 0);
  }, 0);
  const totalNotes = projects.reduce((acc, p) => acc + (p.notes?.length || 0), 0);

  // ==========================================
  // VIEW: FOLDER FILE EXPLORER (INSIDE PROJECT)
  // ==========================================
  if (selectedProject && openFolder) {
    const currentFolderConfig = folderConfigs.find(f => f.key === openFolder);
    const filesInFolder = selectedProject.files?.[openFolder] || [];

    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans">
        {/* Top Folder Header */}
        <div className="p-3 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpenFolder(null)}
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition"
              title="Kembali ke Folder"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                  {selectedProject.code}
                </span>
                <h4 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 truncate max-w-[160px]">
                  {currentFolderConfig?.title}
                </h4>
              </div>
              <p className="text-[10px] text-slate-400 truncate max-w-[220px]">
                {currentFolderConfig?.subtitle}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsAddFileModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-xs transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
        </div>

        {/* Files Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          {filesInFolder.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Folder className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-2 stroke-[1.5]" />
              <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">Belum ada berkas di folder ini</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Ketuk tombol "Upload" di atas untuk menambahkan dokumen atau link gambar/PDF.</p>
            </div>
          ) : (
            filesInFolder.map((file) => (
              <div
                key={file.id}
                className="bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-zinc-700 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-700 dark:text-zinc-200 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                      {file.name}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span>{file.uploadedBy || 'Engineer'}</span>
                      <span>•</span>
                      <span>{file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('id-ID') : '-'}</span>
                    </div>
                    {file.notes && (
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1 italic line-clamp-1">
                        "{file.notes}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setPreviewFile({ url: file.url, name: file.name, fileType: file.fileType })}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition"
                    title="Lihat Berkas"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={file.name}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition"
                    title="Buka Link / Unduh"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => handleDeleteFile(file.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-500 transition"
                    title="Hapus Berkas"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Upload File (Matches Image 2) */}
        {isAddFileModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-5 overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div>
                  <h3 className="text-sm font-extrabold uppercase text-slate-900 dark:text-zinc-100">
                    Upload Dokumen ke Folder {currentFolderConfig?.title.split('.')[1]?.trim() || ''}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Penyimpanan ImageKit • Project: {selectedProject.title}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsAddFileModalOpen(false);
                    setSelectedFileObj(null);
                    setUploadError('');
                  }}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleFileUpload} className="space-y-3.5 mt-4">
                {uploadError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Dropzone File Picker */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5">
                    Pilih Berkas dari Komputer (Upload Langsung ke ImageKit)
                  </label>
                  <label className="border-2 border-dashed border-slate-200 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 dark:bg-zinc-800/40 transition">
                    <Upload className="w-6 h-6 text-slate-500 mb-1" />
                    <span className="text-xs font-bold text-slate-700 dark:text-zinc-200 text-center">
                      {selectedFileObj ? selectedFileObj.name : 'Klik untuk memilih berkas (PDF, CAD, Excel, Word, Foto, DLL)'}
                    </span>
                    {selectedFileObj && (
                      <span className="text-[10px] text-emerald-600 font-semibold mt-1">
                        ✓ Berkas siap: {(selectedFileObj.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const f = e.target.files[0];
                          setSelectedFileObj(f);
                          if (!newFile.name) {
                            setNewFile(prev => ({ ...prev, name: f.name }));
                          }
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase justify-center">
                  <span>— ATAU —</span>
                </div>

                {/* External URL */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    URL / Link File Eksternal (Opsional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://... jika berkas sudah di-host di luar"
                    value={newFile.url}
                    onChange={(e) => setNewFile(prev => ({ ...prev, url: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                  />
                </div>

                {/* File Name */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Nama Dokumen / Keterangan Berkas
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: SLD_Drawing_Panel_V1.pdf / RAB_Final.xlsx"
                    value={newFile.name}
                    onChange={(e) => setNewFile(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                  />
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Catatan Tambahan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Tambahkan catatan teknis atau versi berkas..."
                    value={newFile.notes}
                    onChange={(e) => setNewFile(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddFileModalOpen(false);
                      setSelectedFileObj(null);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-xs rounded-xl transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading || (!selectedFileObj && !newFile.url)}
                    className="flex-1 py-2.5 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50"
                  >
                    {isUploading ? 'Mengunggah...' : 'Upload ke ImageKit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW: PROJECT DETAIL (SUB-TABS: FOLDERS & NOTES)
  // ==========================================
  if (selectedProject) {
    const currentNotes = selectedProject.notes || [];
    const filteredNotes = currentNotes.filter(n => {
      if (noteCategoryFilter === 'Semua') return true;
      return n.category === noteCategoryFilter;
    });

    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans">
        {/* Project Header Banner (Matches Image 3) */}
        <div className="p-3.5 bg-slate-900 dark:bg-black text-white shrink-0 border-b border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setSelectedProject(null)}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-semibold">Semua Project</span>
            </button>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
              {selectedProject.code}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${getStatusBadgeClass(selectedProject.status)}`}>
              {selectedProject.status}
            </span>
            <span className="text-[11px] text-slate-300">
              Lead Engineer: <strong className="text-white">{selectedProject.leadEngineer || 'Ahmad'}</strong>
            </span>
          </div>

          <h2 className="text-base font-extrabold text-white tracking-tight leading-snug">
            {selectedProject.title}
          </h2>

          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
            <span>Client: <strong className="text-slate-200">{selectedProject.clientName}</strong></span>
            <span>•</span>
            <span>Mulai: <strong className="text-slate-200">{selectedProject.startDate}</strong></span>
          </div>
        </div>

        {/* Sub-Tabs: Folders vs SOP Knowledge */}
        <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center shrink-0 px-2 shadow-xs">
          <button
            onClick={() => setActiveTab('folders')}
            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'folders'
                ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span className="truncate">Folder Dokumen</span>
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'notes'
                ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="truncate">SOP & Knowledge ({currentNotes.length})</span>
          </button>
        </div>

        {/* Tab 1: FOLDER AKSES DOKUMEN TERSTRUKTUR (Matches Image 1) */}
        {activeTab === 'folders' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
              Pilih folder akses untuk melihat / mengunggah dokumen ImageKit
            </p>

            <div className="grid grid-cols-1 gap-2.5">
              {folderConfigs.map((folder) => {
                const count = (selectedProject.files?.[folder.key] || []).length;
                const hasAccess = canAccessFolder(folder.key);

                return (
                  <div
                    key={folder.key}
                    onClick={() => {
                      if (!hasAccess) {
                        alert(`Folder ini dibatasi untuk: ${folder.restrictedRoles}`);
                        return;
                      }
                      setOpenFolder(folder.key);
                    }}
                    className={`p-3.5 rounded-2xl border ${folder.color} shadow-xs transition cursor-pointer active:scale-[0.99] flex flex-col justify-between relative overflow-hidden`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-800 dark:text-zinc-100">
                        {hasAccess ? <Folder className="w-4 h-4" /> : <Lock className="w-4 h-4 text-slate-400" />}
                      </div>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${folder.badgeColor}`}>
                        {count} DOKUMEN
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100">
                        {folder.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                        {folder.subtitle}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-2.5 mt-2 border-t border-slate-100 dark:border-zinc-800/60">
                      <span>{folder.restrictedRoles}</span>
                      <span className="text-slate-700 dark:text-zinc-200 flex items-center gap-0.5">
                        Buka Folder →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: DATABASE SOP & KNOWLEDGE ENGINEERING (Matches Image 3) */}
        {activeTab === 'notes' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
            {/* Header Callout Card */}
            <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex flex-col gap-2.5">
              <div>
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100">
                  Catatan Teknis & Experience Database
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Dokumentasi wiring SLD, kendala lapangan, commissioning & SOP untuk referensi engineer lain.
                </p>
              </div>

              <button
                onClick={() => setIsAddNoteModalOpen(true)}
                className="w-full py-2 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ TAMBAH CATATAN SOP</span>
              </button>
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
              {['Semua', 'SLD / Wiring Diagram', 'Konfigurasi Sistem', 'Kendala Lapangan & Solusi', 'Setting, Testing & Commissioning', 'Catatan Umum / SOP Lainnya'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setNoteCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap font-bold transition shrink-0 ${
                    noteCategoryFilter === cat
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-white dark:bg-zinc-900 text-slate-500 border border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Notes List */}
            {filteredNotes.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl bg-white/50 dark:bg-zinc-900/40">
                <p className="text-xs text-slate-400 dark:text-zinc-500">
                  Belum ada catatan SOP atau kendala lapangan yang didokumentasikan untuk project ini.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredNotes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs space-y-2 hover:border-slate-300 dark:hover:border-zinc-700 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                        {note.category}
                      </span>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="text-slate-300 hover:text-rose-500 transition p-1"
                        title="Hapus Catatan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                      {note.title}
                    </h4>

                    <div className="bg-slate-50 dark:bg-zinc-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {note.content}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>Ditulis oleh: <strong>{note.author}</strong></span>
                      <span>{note.createdAt ? new Date(note.createdAt).toLocaleDateString('id-ID') : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Tambah Catatan SOP (Matches Image 4 & 5) */}
        {isAddNoteModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-5 overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                <h3 className="text-sm font-extrabold uppercase text-slate-900 dark:text-zinc-100">
                  Tambah Catatan SOP Engineering
                </h3>
                <button
                  onClick={() => setIsAddNoteModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddNote} className="space-y-3.5 mt-4">
                {/* Dropdown Kategori Topik */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Kategori Topik
                  </label>
                  <select
                    value={newNote.category}
                    onChange={(e) => setNewNote(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                  >
                    <option value="SLD / Wiring Diagram">SLD / Wiring Diagram</option>
                    <option value="Konfigurasi Sistem">Konfigurasi Sistem</option>
                    <option value="Kendala Lapangan & Solusi">Kendala Lapangan & Solusi</option>
                    <option value="Setting, Testing & Commissioning">Setting, Testing & Commissioning</option>
                    <option value="Catatan Umum / SOP Lainnya">Catatan Umum / SOP Lainnya</option>
                  </select>
                </div>

                {/* Judul Catatan */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Judul Catatan
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Kalibrasi Threshold Sensor Gempa Merk XYZ"
                    value={newNote.title}
                    onChange={(e) => setNewNote(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                  />
                </div>

                {/* Detail Penjelasan */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Detail Penjelasan & Solusi Teknis
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Jelaskan langkah konfigurasi, kendala yang ditemui di lapangan, dan cara penyelesaiannya..."
                    value={newNote.content}
                    onChange={(e) => setNewNote(prev => ({ ...prev, content: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddNoteModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-xs rounded-xl transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs rounded-xl shadow-xs transition"
                  >
                    Simpan Catatan
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW: MAIN PROJECT LIST
  // ==========================================
  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans">
      {/* Top Search & Actions Bar */}
      <div className="p-3 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Cari project, klien, engineer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
          />
        </div>

        <button
          onClick={() => setIsProjectModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-xs transition active:scale-95 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Project Baru</span>
        </button>
      </div>

      {/* Summary KPI Counters */}
      <div className="px-3 pt-3 grid grid-cols-3 gap-2 shrink-0">
        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-center shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Total Proyek</p>
          <p className="text-sm font-extrabold text-slate-900 dark:text-zinc-100 mt-0.5">{totalProjects}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-center shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Dokumen</p>
          <p className="text-sm font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">{totalDocs}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-center shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Catatan SOP</p>
          <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{totalNotes}</p>
        </div>
      </div>

      {/* Filter Status Chips */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 text-[11px]">
        {['Semua', 'Sedang Berjalan', 'Perencanaan', 'Selesai', 'Garansi'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap font-bold transition shrink-0 ${
              statusFilter === st
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-zinc-900 text-slate-500 border border-slate-200 dark:border-zinc-800'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Project Card List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">
            <Layers className="w-8 h-8 mx-auto animate-pulse text-slate-300 dark:text-zinc-700 mb-2" />
            <p className="text-xs font-semibold">Memuat Database Project...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 px-4">
            <FolderKanban className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-2 stroke-[1.5]" />
            <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">Belum ada project yang cocok</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Ketuk tombol "Project Baru" untuk menambahkan proyek engineering.</p>
          </div>
        ) : (
          filteredProjects.map((project) => {
            const f = project.files || { engineering: [], commercial: [], finance: [], documentation: [] };
            const docCount = (f.engineering?.length || 0) + (f.commercial?.length || 0) + (f.finance?.length || 0) + (f.documentation?.length || 0);
            const noteCount = project.notes?.length || 0;

            return (
              <div
                key={project.id}
                onClick={() => setSelectedProject(project)}
                className="bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition cursor-pointer active:scale-[0.99] space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                    {project.code}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${getStatusBadgeClass(project.status)}`}>
                    {project.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 line-clamp-1">
                    {project.title}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                    <span className="flex items-center gap-1 truncate">
                      <Building className="w-3 h-3 text-slate-400" />
                      {project.clientName}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 truncate">
                      <User className="w-3 h-3 text-slate-400" />
                      {project.leadEngineer || 'Engineer'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-[10px] text-slate-400 font-semibold">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      <FileText className="w-3 h-3" />
                      {docCount} Dokumen
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <BookOpen className="w-3 h-3" />
                      {noteCount} SOP
                    </span>
                  </div>

                  <span className="text-slate-700 dark:text-zinc-200 font-bold flex items-center gap-0.5">
                    Buka Project <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Tambah Project Baru */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-5 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <h3 className="text-sm font-extrabold uppercase text-slate-900 dark:text-zinc-100">
                Buat Project Baru
              </h3>
              <button
                onClick={() => setIsProjectModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Kode Project
                  </label>
                  <input
                    type="text"
                    required
                    value={newProject.code}
                    onChange={(e) => setNewProject(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Status
                  </label>
                  <select
                    value={newProject.status}
                    onChange={(e) => setNewProject(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-zinc-100 outline-none"
                  >
                    <option value="Sedang Berjalan">Sedang Berjalan</option>
                    <option value="Perencanaan">Perencanaan</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Garansi">Garansi</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  Judul Project
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Instalasi Sensor Gempa & Panel Kontrol"
                  value={newProject.title}
                  onChange={(e) => setNewProject(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Nama Klien
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PT Semen Indonesia"
                    value={newProject.clientName}
                    onChange={(e) => setNewProject(prev => ({ ...prev, clientName: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Lead Engineer
                  </label>
                  <input
                    type="text"
                    value={newProject.leadEngineer}
                    onChange={(e) => setNewProject(prev => ({ ...prev, leadEngineer: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  Deskripsi Singkat (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan ruang lingkup project..."
                  value={newProject.description}
                  onChange={(e) => setNewProject(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-xs rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs rounded-xl shadow-xs transition"
                >
                  Simpan Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Preview Popup Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate pr-2">
                {previewFile.name}
              </h4>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-[300px] overflow-auto p-3 flex items-center justify-center bg-slate-100 dark:bg-zinc-950">
              {previewFile.fileType.includes('image') || previewFile.url.startsWith('data:image') || ['jpg', 'jpeg', 'png', 'webp'].some(ext => previewFile.url.toLowerCase().includes(ext)) ? (
                <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-[60vh] object-contain rounded-xl" />
              ) : (
                <iframe src={previewFile.url} title={previewFile.name} className="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-zinc-800" />
              )}
            </div>
            <div className="p-3 border-t border-slate-200 dark:border-zinc-800 flex justify-end">
              <a
                href={previewFile.url}
                target="_blank"
                rel="noopener noreferrer"
                download={previewFile.name}
                className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh / Buka di Tab Baru</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
