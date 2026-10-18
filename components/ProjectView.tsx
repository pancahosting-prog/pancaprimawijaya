import React, { useState } from 'react';
import { Project, ProjectFile, ProjectNote, ProjectFolderCategory } from '../types';
import { getProxiedUrl, isImageFile, isPdfFile, handleImageError } from '../services/proxyService';

interface ProjectViewProps {
  currentUser: {
    username: string;
    role: string; // 'superadmin' | 'user' | 'engineer' | 'commercial' | 'finance'
    name: string;
  };
  projects: Project[];
  onSaveProject: (project: Project) => Promise<void>;
  onDeleteProject?: (projectId: string) => Promise<void>;
}

export const ProjectView: React.FC<ProjectViewProps> = ({
  currentUser,
  projects,
  onSaveProject,
  onDeleteProject
}) => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<'folders' | 'notes'>('folders');
  const [openFolder, setOpenFolder] = useState<ProjectFolderCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua');

  // Modals
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isAddFileModalOpen, setIsAddFileModalOpen] = useState(false);
  const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState(false);

  // Direct In-App File Preview State
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; fileType: string } | null>(null);

  // New Project Form
  const [newProject, setNewProject] = useState<Partial<Project>>({
    code: `PRJ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    title: '',
    clientName: '',
    location: '',
    status: 'Sedang Berjalan',
    leadEngineer: currentUser.name,
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
    category: 'SLD / Wiring' as ProjectNote['category'],
    content: ''
  });

  // ImageKit Web Crypto Uploader
  const uploadToImageKit = async (file: File): Promise<{ url: string; fileId: string; size: number }> => {
    const envUrl = (import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || '').trim();
    const envPublic = (import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || '').trim();
    const envPrivate = (import.meta.env.VITE_IMAGEKIT_PRIVATE_KEY || '').trim();

    const ikUrl = envUrl || localStorage.getItem('mypanca_imagekit_url') || '';
    const ikPublic = envPublic || localStorage.getItem('mypanca_imagekit_public') || '';
    const ikPrivate = envPrivate || localStorage.getItem('mypanca_imagekit_private') || '';

    if (!ikUrl || !ikPublic || !ikPrivate) {
      throw new Error('Konfigurasi ImageKit belum lengkap. Pastikan VITE_IMAGEKIT_URL_ENDPOINT, VITE_IMAGEKIT_PUBLIC_KEY, dan VITE_IMAGEKIT_PRIVATE_KEY terisi.');
    }

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

    const signatureBuffer = await window.crypto.subtle.sign(
      'HMAC',
      hmacKey,
      encodedData
    );

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

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr;
      try { parsedErr = JSON.parse(errText); } catch (e) {}
      throw new Error(parsedErr?.message || `ImageKit Upload Error (${response.status})`);
    }

    const result = await response.json();
    return {
      url: result.url,
      fileId: result.fileId,
      size: result.size || file.size,
    };
  };

  // Access Control Helper
  const canAccessFolder = (category: ProjectFolderCategory): boolean => {
    const role = currentUser.role?.toLowerCase() || 'user';
    if (role === 'superadmin') return true;

    if (category === 'engineering' || category === 'documentation') {
      return true; // Everyone / Engineers can access engineering & documentation
    }

    if (category === 'commercial') {
      return role === 'commercial' || role === 'finance';
    }

    if (category === 'finance') {
      return role === 'finance' || role === 'commercial';
    }

    return false;
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = 
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.leadEngineer && p.leadEngineer.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'Semua' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.title || !newProject.clientName) return;

    const projectToSave: Project = {
      id: `proj_${Date.now()}`,
      code: newProject.code || `PRJ-${Date.now()}`,
      title: newProject.title,
      clientName: newProject.clientName,
      location: newProject.location || '',
      status: (newProject.status as any) || 'Sedang Berjalan',
      leadEngineer: newProject.leadEngineer || currentUser.name,
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

    await onSaveProject(projectToSave);
    setIsProjectModalOpen(false);
    setNewProject({
      code: `PRJ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      title: '',
      clientName: '',
      location: '',
      status: 'Sedang Berjalan',
      leadEngineer: currentUser.name,
      startDate: new Date().toISOString().split('T')[0],
      description: ''
    });
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !openFolder) return;

    setIsUploading(true);
    setUploadError('');

    try {
      let finalUrl = newFile.url;
      let detectedType = newFile.fileType;

      if (selectedFileObj) {
        const uploadResult = await uploadToImageKit(selectedFileObj);
        finalUrl = uploadResult.url;
        detectedType = selectedFileObj.type || selectedFileObj.name.split('.').pop() || 'pdf';
      }

      if (!finalUrl) {
        throw new Error('Pilih berkas dari komputer atau masukkan link/URL berkas.');
      }

      const fileName = newFile.name || (selectedFileObj ? selectedFileObj.name : 'Dokumen');

      const fileItem: ProjectFile = {
        id: `file_${Date.now()}`,
        name: fileName,
        url: finalUrl,
        fileType: detectedType,
        uploadedBy: currentUser.name,
        uploadedAt: new Date().toISOString(),
        notes: newFile.notes
      };

      const updatedFiles = {
        ...selectedProject.files,
        [openFolder]: [...(selectedProject.files[openFolder] || []), fileItem]
      };

      const updatedProject = {
        ...selectedProject,
        files: updatedFiles,
        updated_at: new Date().toISOString()
      };

      await onSaveProject(updatedProject);
      setSelectedProject(updatedProject);
      setIsAddFileModalOpen(false);
      setSelectedFileObj(null);
      setNewFile({ name: '', url: '', fileType: 'pdf', notes: '' });
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'Gagal mengunggah berkas ke ImageKit.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newNote.title || !newNote.content) return;

    const noteItem: ProjectNote = {
      id: `note_${Date.now()}`,
      title: newNote.title,
      category: newNote.category,
      content: newNote.content,
      author: currentUser.name,
      createdAt: new Date().toISOString()
    };

    const updatedProject = {
      ...selectedProject,
      notes: [...(selectedProject.notes || []), noteItem],
      updated_at: new Date().toISOString()
    };

    await onSaveProject(updatedProject);
    setSelectedProject(updatedProject);
    setIsAddNoteModalOpen(false);
    setNewNote({ title: '', category: 'SLD / Wiring', content: '' });
  };

  const folderConfigs: {
    key: ProjectFolderCategory;
    title: string;
    subtitle: string;
    color: string;
    icon: React.ReactNode;
    restrictedRoles: string;
  }[] = [
    {
      key: 'engineering',
      title: '1. Engineering',
      subtitle: 'SLD, drawing, wiring, setting, troubleshooting, manual, T&C',
      color: 'border-zinc-200 bg-blue-50/50 dark:bg-blue-950/20 text-zinc-700 dark:text-zinc-300',
      icon: (
        <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      restrictedRoles: 'Akses Publik / Engineer'
    },
    {
      key: 'commercial',
      title: '2. Commercial / Anggaran',
      subtitle: 'RAB, HPP, costing, margin, penawaran harga',
      color: 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300',
      icon: (
        <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      restrictedRoles: 'Terbatas: Commercial, Finance, Superadmin'
    },
    {
      key: 'finance',
      title: '3. Admin / Finance',
      subtitle: 'Quotation, PO, invoice, BAST, bukti pembayaran',
      color: 'border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300',
      icon: (
        <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      restrictedRoles: 'Terbatas: Finance, Commercial, Superadmin'
    },
    {
      key: 'documentation',
      title: '4. Documentation',
      subtitle: 'Foto/video before-after, instalasi lapangan, testing',
      color: 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300',
      icon: (
        <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      restrictedRoles: 'Akses Publik / Engineer'
    }
  ];

  const getFileIcon = (fileType: string, name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (fileType.includes('image') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext || '')) {
      return '🖼️';
    }
    if (fileType.includes('pdf') || ext === 'pdf') {
      return '📄';
    }
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) {
      return '📊';
    }
    if (['doc', 'docx'].includes(ext || '')) {
      return '📝';
    }
    return '📁';
  };

  return (
    <div className="p-6 lg:p-10 space-y-8 animate-fade-in w-full">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-600 text-white flex items-center justify-center font-black shadow-md">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl lg:text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                Database Knowledge Project PT Panca
              </h2>
              <p className="text-xs text-slate-400 font-semibold">
                Penyimpanan Berkas via ImageKit, Viewer Aplikasi & SOP Engineering Terstruktur
              </p>
            </div>
          </div>
        </div>

        {selectedProject ? (
          <button
            onClick={() => {
              setSelectedProject(null);
              setOpenFolder(null);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold text-xs transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Kembali ke Daftar Project
          </button>
        ) : (
          <button
            onClick={() => setIsProjectModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-zinc-600 hover:bg-zinc-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path d="M12 4v16m8-8H4" />
            </svg>
            Tambah Project Baru
          </button>
        )}
      </div>

      {/* VIEW: PROJECT LIST OR PROJECT DETAIL */}
      {!selectedProject ? (
        <div className="space-y-6">
          {/* SEARCH & FILTERS */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50 dark:bg-slate-950 p-4 rounded-3xl border border-slate-200 dark:border-slate-800">
            <div className="relative w-full md:w-96">
              <svg className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Cari project, SLD, kendala, client..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold outline-none text-slate-800 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
              {['Semua', 'Sedang Berjalan', 'Selesai', 'Perencanaan', 'Garansi'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
                    statusFilter === st
                      ? 'bg-zinc-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* PROJECT CARDS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-[32px] border border-dashed border-slate-200 dark:border-slate-800">
                <p className="text-sm font-bold text-slate-400">Belum ada project ditemukan</p>
                <p className="text-xs text-slate-400 mt-1">Klik "+ Tambah Project Baru" untuk membuat dokumentasi pertama.</p>
              </div>
            ) : (
              filteredProjects.map(proj => {
                const totalFiles = 
                  (proj.files?.engineering?.length || 0) +
                  (proj.files?.commercial?.length || 0) +
                  (proj.files?.finance?.length || 0) +
                  (proj.files?.documentation?.length || 0);
                const totalNotes = proj.notes?.length || 0;

                return (
                  <div
                    key={proj.id}
                    onClick={() => setSelectedProject(proj)}
                    className="bg-white dark:bg-slate-900 p-6 rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-xl">
                          {proj.code || 'PRJ'}
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-xl ${
                          proj.status === 'Selesai' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60' :
                          proj.status === 'Sedang Berjalan' ? 'bg-blue-50 text-zinc-600 dark:bg-blue-950/60 animate-pulse' :
                          'bg-amber-50 text-amber-600 dark:bg-amber-950/60'
                        }`}>
                          {proj.status}
                        </span>
                      </div>

                      <h3 className="text-lg font-black text-slate-800 dark:text-white group-hover:text-zinc-600 transition-colors mb-2 line-clamp-2">
                        {proj.title}
                      </h3>

                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-4 flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {proj.clientName} {proj.location ? `• ${proj.location}` : ''}
                      </p>

                      {proj.description && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2 mb-4">
                          {proj.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
                          📁 {totalFiles} Dokumen
                        </span>
                        <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
                          📘 {totalNotes} Catatan SOP
                        </span>
                      </div>
                      <span className="text-zinc-600 font-bold group-hover:translate-x-1 transition-transform">
                        Detail &rarr;
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* PROJECT DETAIL VIEW */
        <div className="space-y-8 animate-fade-in">
          {/* PROJECT SUMMARY CARD */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-8 rounded-[36px] shadow-xl relative overflow-hidden">
            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-xl text-xs font-black tracking-wider uppercase">
                  {selectedProject.code}
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-xl text-xs font-black tracking-wider uppercase">
                  {selectedProject.status}
                </span>
                <span className="text-slate-300 text-xs font-semibold">
                  Lead Engineer: {selectedProject.leadEngineer || 'PT Panca Team'}
                </span>
              </div>

              <h1 className="text-2xl lg:text-4xl font-black tracking-tight text-white">
                {selectedProject.title}
              </h1>

              <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300 font-medium">
                <p className="flex items-center gap-2">
                  <span className="text-zinc-400 font-bold">Client:</span> {selectedProject.clientName}
                </p>
                {selectedProject.location && (
                  <p className="flex items-center gap-2">
                    <span className="text-zinc-400 font-bold">Lokasi:</span> {selectedProject.location}
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <span className="text-zinc-400 font-bold">Mulai:</span> {selectedProject.startDate}
                </p>
              </div>

              {selectedProject.description && (
                <p className="text-sm text-slate-300 max-w-3xl pt-2 border-t border-white/10">
                  {selectedProject.description}
                </p>
              )}
            </div>
          </div>

          {/* DETAIL TABS */}
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => {
                setActiveTab('folders');
                setOpenFolder(null);
              }}
              className={`px-8 py-4 font-black text-sm uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'folders'
                  ? 'border-zinc-600 text-zinc-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <span>📁</span>
              Folder Akses Dokumen Terstruktur
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`px-8 py-4 font-black text-sm uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'notes'
                  ? 'border-zinc-600 text-zinc-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <span>📘</span>
              Database SOP & Knowledge Engineering ({selectedProject.notes?.length || 0})
            </button>
          </div>

          {/* TAB CONTENT: FOLDERS */}
          {activeTab === 'folders' && (
            <div className="space-y-6">
              {!openFolder ? (
                <div>
                  <div className="mb-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Pilih Folder Akses untuk Melihat / Mengunggah Dokumen ImageKit
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {folderConfigs.map(f => {
                      const hasAccess = canAccessFolder(f.key);
                      const count = selectedProject.files[f.key]?.length || 0;

                      return (
                        <div
                          key={f.key}
                          onClick={() => setOpenFolder(f.key)}
                          className={`p-6 rounded-[28px] border-2 transition-all cursor-pointer relative overflow-hidden group ${f.color} ${
                            !hasAccess ? 'opacity-80' : 'hover:scale-[1.02] hover:shadow-lg'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                              {f.icon}
                            </div>

                            {!hasAccess ? (
                              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 px-3 py-1 rounded-xl">
                                🔒 Akses Terbatas
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-wider bg-white/80 dark:bg-slate-900/80 px-3 py-1 rounded-xl">
                                {count} Dokumen
                              </span>
                            )}
                          </div>

                          <h3 className="text-lg font-black mb-1">{f.title}</h3>
                          <p className="text-xs font-medium opacity-80 mb-4">{f.subtitle}</p>

                          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider opacity-70 border-t border-black/5 dark:border-white/5 pt-3">
                            <span>{f.restrictedRoles}</span>
                            <span className="group-hover:translate-x-1 transition-transform">
                              Buka Folder &rarr;
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* INSIDE SPECIFIC FOLDER */
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-6 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setOpenFolder(null)}
                        className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 rounded-2xl transition-all"
                      >
                        <svg className="w-5 h-5 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                      </button>
                      <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white capitalize">
                          Folder: {openFolder}
                        </h3>
                        <p className="text-xs text-slate-400 font-semibold">
                          Dokumen dalam folder {openFolder} project {selectedProject.title}
                        </p>
                      </div>
                    </div>

                    {canAccessFolder(openFolder) && (
                      <button
                        onClick={() => {
                          setSelectedFileObj(null);
                          setUploadError('');
                          setIsAddFileModalOpen(true);
                        }}
                        className="px-5 py-3 bg-zinc-600 hover:bg-zinc-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path d="M12 4v16m8-8H4" />
                        </svg>
                        Upload Dokumen ImageKit
                      </button>
                    )}
                  </div>

                  {/* CHECK ACCESS CONTROL */}
                  {!canAccessFolder(openFolder) ? (
                    <div className="p-12 text-center bg-rose-50 dark:bg-rose-950/20 border-2 border-dashed border-rose-200 dark:border-rose-900 rounded-[32px] space-y-4">
                      <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-2xl">
                        🔒
                      </div>
                      <h4 className="text-lg font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">
                        Akses Dibatasi
                      </h4>
                      <p className="text-xs text-rose-600 dark:text-rose-400 max-w-md mx-auto font-medium">
                        Folder <strong>{openFolder.toUpperCase()}</strong> mengandung informasi sensitif (RAB, HPP, Costing / Keuangan) dan hanya dapat diakses oleh tim dengan Role Commercial, Finance, atau Superadmin.
                      </p>
                      <button
                        onClick={() => setOpenFolder(null)}
                        className="px-6 py-2.5 bg-rose-600 text-white font-bold text-xs rounded-xl shadow-md"
                      >
                        Kembali ke Root Folder
                      </button>
                    </div>
                  ) : (
                    /* FILE LIST */
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-5">Nama Dokumen</th>
                            <th className="p-5">Pengunggah</th>
                            <th className="p-5">Tanggal</th>
                            <th className="p-5">Catatan / Keterangan</th>
                            <th className="p-5 text-right">Aksi Viewer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {selectedProject.files[openFolder]?.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-10 text-center text-slate-400 text-xs font-bold">
                                Belum ada dokumen di folder ini. Klik tombol "Upload Dokumen ImageKit" di atas untuk mengunggah berkas.
                              </td>
                            </tr>
                          ) : (
                            selectedProject.files[openFolder]?.map(file => (
                              <tr key={file.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="p-5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-zinc-600 flex items-center justify-center font-bold text-sm shrink-0">
                                      {getFileIcon(file.fileType, file.name)}
                                    </div>
                                    <div>
                                      <p className="font-bold text-sm text-slate-800 dark:text-white">
                                        {file.name}
                                      </p>
                                      <span className="text-[10px] font-black text-slate-400 uppercase">
                                        {file.fileType.toUpperCase()}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-5 text-xs font-medium text-slate-600 dark:text-slate-300">
                                  {file.uploadedBy}
                                </td>
                                <td className="p-5 text-xs text-slate-400 font-medium">
                                  {new Date(file.uploadedAt).toLocaleDateString('id-ID')}
                                </td>
                                <td className="p-5 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                                  {file.notes || '-'}
                                </td>
                                <td className="p-5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => setPreviewFile(file)}
                                      className="px-4 py-2 bg-zinc-600 hover:bg-zinc-700 text-white rounded-xl font-bold text-xs transition-colors shadow-sm active:scale-95 flex items-center gap-1.5"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                      </svg>
                                      Lihat di Aplikasi
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: KNOWLEDGE BASE NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-6 rounded-3xl border border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white">
                    Catatan Teknis & Experience Database
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold">
                    Dokumentasi wiring SLD, kendala lapangan, commissioning & SOP untuk referensi engineer lain.
                  </p>
                </div>

                <button
                  onClick={() => setIsAddNoteModalOpen(true)}
                  className="px-5 py-3 bg-zinc-600 hover:bg-zinc-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah Catatan SOP
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedProject.notes?.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-slate-400 text-xs font-bold bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                    Belum ada catatan SOP atau kendala lapangan yang didokumentasikan untuk project ini.
                  </div>
                ) : (
                  selectedProject.notes?.map(note => (
                    <div
                      key={note.id}
                      className="bg-white dark:bg-slate-900 p-6 rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-amber-50 text-amber-700 dark:bg-amber-950/60 rounded-xl">
                          {note.category}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(note.createdAt).toLocaleDateString('id-ID')}
                        </span>
                      </div>

                      <h4 className="text-base font-black text-slate-800 dark:text-white">
                        {note.title}
                      </h4>

                      <div className="text-xs text-slate-600 dark:text-slate-300 font-medium whitespace-pre-line bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                        {note.content}
                      </div>

                      <p className="text-[10px] text-slate-400 font-bold text-right">
                        Ditulis oleh: {note.author}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: TAMBAH PROJECT */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in">
            <form onSubmit={handleCreateProject}>
              <div className="p-8 pb-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-widest uppercase">
                  Tambah Project Baru
                </h3>
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-8 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Kode Project</label>
                    <input
                      required
                      type="text"
                      value={newProject.code}
                      onChange={e => setNewProject({ ...newProject, code: e.target.value })}
                      className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Status Project</label>
                    <select
                      value={newProject.status}
                      onChange={e => setNewProject({ ...newProject, status: e.target.value as any })}
                      className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                    >
                      <option value="Sedang Berjalan">Sedang Berjalan</option>
                      <option value="Selesai">Selesai</option>
                      <option value="Perencanaan">Perencanaan</option>
                      <option value="Garansi">Garansi</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Nama Project</label>
                  <input
                    required
                    type="text"
                    placeholder="Contoh: Instalasi EWS Sensor Gempa & Automasi"
                    value={newProject.title}
                    onChange={e => setNewProject({ ...newProject, title: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Nama Client / Perusahaan</label>
                    <input
                      required
                      type="text"
                      placeholder="Contoh: PT Smelter Utama"
                      value={newProject.clientName}
                      onChange={e => setNewProject({ ...newProject, clientName: e.target.value })}
                      className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Lokasi Project</label>
                    <input
                      type="text"
                      placeholder="Contoh: Site Gresik, Jatim"
                      value={newProject.location}
                      onChange={e => setNewProject({ ...newProject, location: e.target.value })}
                      className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Lead Engineer</label>
                    <input
                      type="text"
                      value={newProject.leadEngineer}
                      onChange={e => setNewProject({ ...newProject, leadEngineer: e.target.value })}
                      className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Tanggal Mulai</label>
                    <input
                      type="date"
                      value={newProject.startDate}
                      onChange={e => setNewProject({ ...newProject, startDate: e.target.value })}
                      className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Deskripsi Singkat Project</label>
                  <textarea
                    rows={3}
                    placeholder="Tuliskan gambaran umum lingkup pekerjaan..."
                    value={newProject.description}
                    onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-8 pt-0 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(false)}
                  className="w-1/3 py-4 bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 rounded-2xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-4 bg-zinc-600 hover:bg-zinc-700 text-white font-black rounded-2xl shadow-xl transition-all"
                >
                  Simpan Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UPLOAD FILE KE IMAGEKIT */}
      {isAddFileModalOpen && openFolder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in">
            <form onSubmit={handleFileUpload}>
              <div className="p-8 pb-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-widest uppercase">
                    Upload Dokumen Ke Folder {openFolder.toUpperCase()}
                  </h3>
                  <p className="text-xs text-slate-400">Penyimpanan ImageKit • Project: {selectedProject?.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddFileModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-8 space-y-4">
                {/* File Picker ImageKit */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                    Pilih Berkas Dari Komputer (Upload Langsung ke ImageKit)
                  </label>
                  <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-zinc-500 rounded-2xl p-4 text-center bg-slate-50 dark:bg-slate-950 transition-all cursor-pointer">
                    <input
                      type="file"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setSelectedFileObj(file);
                          if (!newFile.name) {
                            setNewFile(prev => ({ ...prev, name: file.name }));
                          }
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-2xl">📤</span>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {selectedFileObj ? selectedFileObj.name : 'Klik untuk memilih berkas (PDF, CAD, Excel, Word, Foto, DLL)'}
                      </p>
                      {selectedFileObj && (
                        <p className="text-[10px] text-emerald-600 font-bold uppercase">
                          {(selectedFileObj.size / (1024 * 1024)).toFixed(2)} MB • Siap diunggah
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  — ATAU —
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">URL / Link File Eksternal (Opsional)</label>
                  <input
                    type="text"
                    placeholder="https://... jika berkas sudah di-host di luar"
                    value={newFile.url}
                    onChange={e => setNewFile({ ...newFile, url: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Nama Dokumen / Keterangan Berkas</label>
                  <input
                    required
                    type="text"
                    placeholder="Contoh: SLD_Drawing_Panel_V1.pdf / RAB_Final.xlsx"
                    value={newFile.name}
                    onChange={e => setNewFile({ ...newFile, name: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Catatan Tambahan (Opsional)</label>
                  <textarea
                    rows={2}
                    placeholder="Tambahkan catatan teknis atau versi berkas..."
                    value={newFile.notes}
                    onChange={e => setNewFile({ ...newFile, notes: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                  />
                </div>

                {uploadError && (
                  <p className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/20 p-3 rounded-xl border border-rose-100">
                    {uploadError}
                  </p>
                )}
              </div>

              <div className="p-8 pt-0 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddFileModalOpen(false)}
                  className="w-1/3 py-4 bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 rounded-2xl"
                >
                  Batal
                </button>
                <button
                  disabled={isUploading}
                  type="submit"
                  className="w-2/3 py-4 bg-zinc-600 hover:bg-zinc-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Mengunggah ke ImageKit...
                    </>
                  ) : (
                    'Upload ke ImageKit'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH CATATAN KNOWLEDGE BASE */}
      {isAddNoteModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in">
            <form onSubmit={handleAddNote}>
              <div className="p-8 pb-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-widest uppercase">
                  Tambah Catatan SOP Engineering
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddNoteModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-8 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Kategori Topik</label>
                  <select
                    value={newNote.category}
                    onChange={e => setNewNote({ ...newNote, category: e.target.value as any })}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                  >
                    <option value="SLD / Wiring">SLD / Wiring Diagram</option>
                    <option value="Konfigurasi Sistem">Konfigurasi Sistem</option>
                    <option value="Kendala & Solusi">Kendala Lapangan & Solusi</option>
                    <option value="Testing & Commissioning">Setting, Testing & Commissioning</option>
                    <option value="Catatan Umum">Catatan Umum / SOP Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Judul Catatan</label>
                  <input
                    required
                    type="text"
                    placeholder="Contoh: Kalibrasi Threshold Sensor Gempa Merk XYZ"
                    value={newNote.title}
                    onChange={e => setNewNote({ ...newNote, title: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Detail Penjelasan & Solusi Teknis</label>
                  <textarea
                    required
                    rows={6}
                    placeholder="Jelaskan langkah konfigurasi, kendala yang ditemui di lapangan, dan cara penyelesaiannya..."
                    value={newNote.content}
                    onChange={e => setNewNote({ ...newNote, content: e.target.value })}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-8 pt-0 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddNoteModalOpen(false)}
                  className="w-1/3 py-4 bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 rounded-2xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-4 bg-zinc-600 hover:bg-zinc-700 text-white font-black rounded-2xl shadow-xl transition-all"
                >
                  Simpan Catatan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREVIEW MODAL (IN-APP DOCUMENT & IMAGE VIEWER) */}
      {previewFile && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-between p-4 md:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 md:px-6 rounded-3xl shadow-xl w-full max-w-5xl mx-auto mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-slate-800 rounded-xl shrink-0 text-xl">
                {getFileIcon(previewFile.fileType, previewFile.name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-200 truncate leading-tight" title={previewFile.name}>
                  {previewFile.name}
                </p>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Direct In-App Viewer</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={getProxiedUrl(previewFile.url, true, previewFile.name)}
                download={previewFile.name}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-600 hover:bg-zinc-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Unduh
              </a>

              <button
                onClick={() => setPreviewFile(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Viewer Stage */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-[32px] overflow-hidden relative shadow-2xl w-full max-w-5xl mx-auto flex items-center justify-center p-4">
            {isImageFile(previewFile.fileType, previewFile.name || previewFile.url) ? (
              <div className="max-w-full max-h-full overflow-auto flex items-center justify-center">
                <img
                  src={getProxiedUrl(previewFile.url)}
                  alt={previewFile.name}
                  onError={(e) => handleImageError(e, previewFile.url)}
                  className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-lg border border-slate-800 bg-slate-950"
                />
              </div>
            ) : isPdfFile(previewFile.fileType, previewFile.name || previewFile.url) ? (
              <div className="w-full h-full relative flex flex-col justify-center items-center">
                <iframe
                  src={getProxiedUrl(previewFile.url)}
                  className="w-full h-full border-0 relative z-10 rounded-2xl bg-white"
                  title={previewFile.name}
                />
              </div>
            ) : (
              <div className="w-full h-full relative flex flex-col justify-center items-center p-6 text-center space-y-4">
                <div className="p-4 bg-slate-800 rounded-2xl text-slate-300">
                  {getFileIcon(previewFile.fileType, previewFile.name)}
                </div>
                <div>
                  <h5 className="text-white font-bold text-sm truncate max-w-md">{previewFile.name}</h5>
                  <p className="text-xs text-slate-400 mt-1">Dokumen disajikan langsung via Server Proxy (Bebas Blokir ISP)</p>
                </div>
                <div className="flex gap-3 pt-2 z-20">
                  <a
                    href={getProxiedUrl(previewFile.url, true, previewFile.name)}
                    download={previewFile.name}
                    className="px-5 py-2.5 bg-zinc-600 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                  >
                    Unduh Berkas Langsung
                  </a>
                </div>
                <iframe
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(getProxiedUrl(previewFile.url, true))}&embedded=true`}
                  className="w-full h-[350px] border-0 relative z-10 rounded-2xl bg-white mt-2"
                  title="Google Document Viewer"
                />
              </div>
            )}
          </div>

          <div className="text-center text-[8px] font-black text-slate-600 uppercase tracking-widest pt-4">
            Didukung oleh Google Docs Viewer Engine & ImageKit Storage
          </div>
        </div>
      )}
    </div>
  );
};
