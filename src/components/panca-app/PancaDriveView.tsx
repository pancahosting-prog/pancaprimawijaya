import React, { useState, useEffect, useMemo } from 'react';
import { 
  Folder, FolderOpen, FileText, Upload, Share2, Download, Search, Plus, 
  Trash2, Copy, Check, Eye, X, ExternalLink, HardDrive, FileSpreadsheet,
  FileImage, FileCode, FileArchive, CheckCircle2, Clock, AlertTriangle, AlertCircle, Loader2,
  ChevronRight, ArrowLeft, LayoutGrid, List, File
} from 'lucide-react';
import { supabaseService } from '../../../task/services/supabaseService';
import { DrivePost, DriveAttachment } from '../../../task/types';
import { getProxiedUrl, isImageFile, isPdfFile, handleImageError } from '../../../task/services/proxyService';

interface PancaDriveViewProps {
  currentUser?: {
    username: string;
    role: string;
    nama?: string;
    name?: string;
  } | null;
  openUploadOnMount?: boolean;
}

export const PancaDriveView: React.FC<PancaDriveViewProps> = ({ 
  currentUser,
  openUploadOnMount = false
}) => {
  const [posts, setPosts] = useState<DrivePost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(openUploadOnMount);
  
  // Upload modal states
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: 'pending' | 'uploading' | 'success' | 'error' }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // ImageKit configuration states
  const [ikUrl, setIkUrl] = useState('');
  const [ikPublic, setIkPublic] = useState('');
  const [ikPrivate, setIkPrivate] = useState('');

  // Sharing states (Identical to task/components/DriveView)
  const [sharingPost, setSharingPost] = useState<DrivePost | null>(null);
  const [shareValue, setShareValue] = useState<number>(1);
  const [shareUnit, setShareUnit] = useState<'hours' | 'days' | 'weeks'>('hours');
  const [generatedShareLink, setGeneratedShareLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Preview file state
  const [previewFile, setPreviewFile] = useState<DriveAttachment | null>(null);

  // Folder & View mode states (like computer file explorer)
  const [selectedFolder, setSelectedFolder] = useState<DrivePost | null>(null);
  const [fileViewMode, setFileViewMode] = useState<'thumbnail' | 'list'>('thumbnail');

  const activeUsername = currentUser?.username || 'user';
  const isSuperadmin = currentUser?.role === 'superadmin' || currentUser?.username === 'superadmin';

  useEffect(() => {
    // Load ImageKit settings from env or localStorage
    const envUrl = (import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || '').trim();
    const envPublic = (import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || '').trim();
    const envPrivate = (import.meta.env.VITE_IMAGEKIT_PRIVATE_KEY || '').trim();

    const savedUrl = envUrl || localStorage.getItem('mypanca_imagekit_url') || '';
    const savedPublic = envPublic || localStorage.getItem('mypanca_imagekit_public') || '';
    const savedPrivate = envPrivate || localStorage.getItem('mypanca_imagekit_private') || '';

    setIkUrl(savedUrl);
    setIkPublic(savedPublic);
    setIkPrivate(savedPrivate);

    fetchDrivePosts();
  }, [currentUser?.username, currentUser?.role]);

  const fetchDrivePosts = async () => {
    setIsLoading(true);
    try {
      // User hanya bisa mengakses file miliknya sendiri, KECUALI superadmin yang bisa melihat semua file
      const userFilter = isSuperadmin ? undefined : activeUsername;
      const data = await supabaseService.getDrivePosts(userFilter);
      setPosts(data || []);
    } catch (e) {
      console.warn("Error fetching drive posts:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (files: File[]) => {
    setSelectedFiles(prev => [...prev, ...files]);
    const progressMap = { ...uploadProgress };
    files.forEach(f => {
      progressMap[f.name] = 'pending';
    });
    setUploadProgress(progressMap);
  };

  const removeFile = (index: number, fileName: string) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    const progressMap = { ...uploadProgress };
    delete progressMap[fileName];
    setUploadProgress(progressMap);
  };

  // Convert File to Base64 Data URL as reliable local/storage fallback
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Direct upload to ImageKit using WebCrypto HMAC SHA1 signature
  const uploadToImageKit = async (file: File): Promise<DriveAttachment> => {
    if (!ikUrl || !ikPublic || !ikPrivate) {
      throw new Error('ImageKit credentials missing');
    }

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expire = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

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
    formData.append('folder', '/mypanca_drive');

    let cleanEndpoint = ikUrl.trim();
    if (cleanEndpoint.endsWith('/')) {
      cleanEndpoint = cleanEndpoint.slice(0, -1);
    }

    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsed;
      try { parsed = JSON.parse(errText); } catch(e) {}
      throw new Error(parsed?.message || `ImageKit Error: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      name: file.name,
      url: result.url,
      fileType: file.type || 'application/octet-stream',
      fileId: result.fileId,
      size: result.size || file.size,
    };
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim()) {
      setUploadError('Judul berkas/postingan wajib diisi.');
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      const attachments: DriveAttachment[] = [];

      for (const file of selectedFiles) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 'uploading' }));

        let attachment: DriveAttachment | null = null;

        // 1. Try ImageKit if credentials available
        if (ikUrl && ikPublic && ikPrivate) {
          try {
            attachment = await uploadToImageKit(file);
          } catch (ikErr) {
            console.warn("ImageKit upload error, falling back to storage:", ikErr);
          }
        }

        // 2. Fallback to Data URL / Base64 if ImageKit not configured or failed
        if (!attachment) {
          try {
            const dataUrl = await fileToBase64(file);
            attachment = {
              name: file.name,
              url: dataUrl,
              fileType: file.type || 'application/octet-stream',
              fileId: 'file-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
              size: file.size
            };
          } catch (b64Err) {
            setUploadProgress(prev => ({ ...prev, [file.name]: 'error' }));
            throw new Error(`Gagal memproses file "${file.name}".`);
          }
        }

        attachments.push(attachment);
        setUploadProgress(prev => ({ ...prev, [file.name]: 'success' }));
      }

      await supabaseService.createDrivePost({
        title: postTitle.trim(),
        content: postContent.trim(),
        attachments: attachments,
        owner_username: activeUsername
      });

      // Reset and refresh
      setPostTitle('');
      setPostContent('');
      setSelectedFiles([]);
      setUploadProgress({});
      setShowUploadModal(false);
      await fetchDrivePosts();
    } catch (err: any) {
      setUploadError(err.message || 'Gagal menerbitkan postingan ke Drive.');
    } finally {
      setIsUploading(false);
    }
  };

  // Open Share Modal (matching task/components/DriveView & user request)
  const openShare = (post: DrivePost) => {
    setSharingPost(post);
    setShareValue(1);
    setShareUnit('hours');
    setCopiedLink(false);
    // Always start with duration rules form to generate a fresh new link
    setGeneratedShareLink('');
  };

  // Open existing active share link detail
  const openActiveShare = (post: DrivePost) => {
    setSharingPost(post);
    setCopiedLink(false);
    if (post.share_token) {
      const link = `${window.location.origin}/app?shareDrive=${post.share_token}`;
      setGeneratedShareLink(link);
    } else {
      setGeneratedShareLink('');
    }
  };

  // Generate Temporary Share Link with Expiration (hours/days/weeks)
  const handleGenerateShareLink = async () => {
    if (!sharingPost) return;

    let msToAdd = 0;
    if (shareUnit === 'hours') {
      msToAdd = shareValue * 60 * 60 * 1000;
    } else if (shareUnit === 'days') {
      msToAdd = shareValue * 24 * 60 * 60 * 1000;
    } else if (shareUnit === 'weeks') {
      msToAdd = shareValue * 7 * 24 * 60 * 60 * 1000;
    }

    const expiresAt = new Date(Date.now() + msToAdd).toISOString();
    const token = 'sh_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    try {
      await supabaseService.updateDrivePost(sharingPost.id, {
        share_token: token,
        share_expires_at: expiresAt,
      });

      const fullLink = `${window.location.origin}/app?shareDrive=${token}`;
      setGeneratedShareLink(fullLink);
      
      // Update local state
      setPosts(prev => prev.map(p => p.id === sharingPost.id ? { ...p, share_token: token, share_expires_at: expiresAt } : p));
    } catch (err) {
      console.error('Gagal membuat link share:', err);
      alert('Gagal membuat link sharing.');
    }
  };

  // Cancel / Revoke Share Link
  const handleCancelShare = async (postId: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan/menarik link berbagi ini? Link yang sudah dibagikan tidak akan dapat diakses lagi.')) return;
    try {
      await supabaseService.updateDrivePost(postId, {
        share_token: undefined,
        share_expires_at: undefined,
      });
      if (sharingPost && sharingPost.id === postId) {
        setGeneratedShareLink('');
      }
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, share_token: undefined, share_expires_at: undefined } : p));
    } catch (err) {
      console.error('Gagal membatalkan sharing:', err);
      alert('Gagal membatalkan link sharing.');
    }
  };

  const copyShareLink = () => {
    if (!generatedShareLink) return;
    navigator.clipboard.writeText(generatedShareLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus postingan berkas ini secara permanen dari Drive?')) return;
    try {
      await supabaseService.deleteDrivePost(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      alert('Gagal menghapus postingan');
    }
  };

  // Formatting helpers
  const formatBytes = (bytes?: number, decimals = 1) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  };

  const getFileBadge = (fileType: string, name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
      return <FileImage className="w-4 h-4 text-amber-500 shrink-0" />;
    }
    if (fileType === 'application/pdf' || ext === 'pdf') {
      return <FileText className="w-4 h-4 text-rose-500 shrink-0" />;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext) || fileType.includes('sheet') || fileType.includes('excel')) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <Folder className="w-4 h-4 text-purple-600 shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-slate-500 shrink-0" />;
  };

  const getFileTypeLabel = (fileType: string, name: string) => {
    const ext = name.split('.').pop()?.toUpperCase() || '';
    if (['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF'].includes(ext)) return `${ext} File`;
    if (ext === 'PDF' || fileType.includes('pdf')) return 'PDF Document';
    if (['DOC', 'DOCX'].includes(ext)) return 'Word Document';
    if (['XLS', 'XLSX', 'CSV'].includes(ext)) return 'Excel Spreadsheet';
    if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(ext)) return 'Archive File';
    if (['TXT', 'MD'].includes(ext)) return 'Text Document';
    return ext ? `${ext} File` : 'File';
  };

  const formatFileDate = (dateStr?: string) => {
    if (!dateStr) return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' 11:07';
    const d = new Date(dateStr);
    const valid = isNaN(d.getTime()) ? new Date() : d;
    const day = String(valid.getDate()).padStart(2, '0');
    const month = String(valid.getMonth() + 1).padStart(2, '0');
    const year = valid.getFullYear();
    const hours = String(valid.getHours()).padStart(2, '0');
    const mins = String(valid.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  };

  // Render thumbnail icon like Windows File Explorer (Matches Lampiran 1 image_b21846d6.png)
  const renderThumbnailBox = (att: DriveAttachment) => {
    const isImg = isImageFile(att.fileType, att.name || att.url);
    const ext = (att.name || '').split('.').pop()?.toLowerCase() || '';

    if (isImg) {
      return (
        <div className="w-full aspect-square bg-slate-100 dark:bg-zinc-800 rounded-xl overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 relative flex items-center justify-center group-hover:border-blue-400 transition">
          <img
            src={getProxiedUrl(att.url)}
            alt={att.name}
            onError={(e) => handleImageError(e, att.url)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/15 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Eye className="w-5 h-5 text-white drop-shadow-md" />
          </div>
        </div>
      );
    }

    // Word Document Icon (Blue card with W sheet like Image 1)
    if (['doc', 'docx'].includes(ext)) {
      return (
        <div className="w-full aspect-square bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-200/80 dark:border-blue-900/50 flex flex-col items-center justify-center p-2 relative group-hover:border-blue-400 transition">
          <div className="w-12 h-14 bg-white dark:bg-zinc-800 rounded-lg shadow-xs border border-blue-200 dark:border-blue-800 flex flex-col justify-between p-1.5">
            <div className="w-6 h-6 rounded bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
              W
            </div>
            <div className="space-y-1">
              <div className="h-1 bg-blue-200 dark:bg-blue-800 rounded-full w-full" />
              <div className="h-1 bg-blue-200 dark:bg-blue-800 rounded-full w-3/4" />
            </div>
          </div>
        </div>
      );
    }

    // Excel Spreadsheet Icon (Green card with X sheet)
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return (
        <div className="w-full aspect-square bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 flex flex-col items-center justify-center p-2 relative group-hover:border-emerald-400 transition">
          <div className="w-12 h-14 bg-white dark:bg-zinc-800 rounded-lg shadow-xs border border-emerald-200 dark:border-emerald-800 flex flex-col justify-between p-1.5">
            <div className="w-6 h-6 rounded bg-emerald-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
              X
            </div>
            <div className="space-y-1">
              <div className="h-1 bg-emerald-200 dark:bg-emerald-800 rounded-full w-full" />
              <div className="h-1 bg-emerald-200 dark:bg-emerald-800 rounded-full w-3/4" />
            </div>
          </div>
        </div>
      );
    }

    // PDF Document Icon (Red card with PDF sheet)
    if (ext === 'pdf' || att.fileType.includes('pdf')) {
      return (
        <div className="w-full aspect-square bg-rose-50/70 dark:bg-rose-950/30 rounded-xl border border-rose-200/80 dark:border-rose-900/50 flex flex-col items-center justify-center p-2 relative group-hover:border-rose-400 transition">
          <div className="w-12 h-14 bg-white dark:bg-zinc-800 rounded-lg shadow-xs border border-rose-200 dark:border-rose-800 flex flex-col justify-between p-1.5">
            <div className="w-7 h-5 rounded bg-rose-600 text-white font-black text-[9px] flex items-center justify-center shadow-xs">
              PDF
            </div>
            <div className="space-y-1">
              <div className="h-1 bg-rose-200 dark:bg-rose-800 rounded-full w-full" />
              <div className="h-1 bg-rose-200 dark:bg-rose-800 rounded-full w-2/3" />
            </div>
          </div>
        </div>
      );
    }

    // ZIP / RAR Books Icon (Matches WinRAR in Lampiran 1!)
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return (
        <div className="w-full aspect-square bg-purple-50/70 dark:bg-purple-950/30 rounded-xl border border-purple-200/80 dark:border-purple-900/50 flex flex-col items-center justify-center p-2 relative group-hover:border-purple-400 transition">
          <div className="w-12 h-14 flex flex-col items-center justify-center relative">
            <div className="w-11 h-3 bg-purple-600 rounded-t-sm border border-purple-700" />
            <div className="w-11 h-3 bg-blue-600 border border-blue-700" />
            <div className="w-11 h-3 bg-emerald-600 rounded-b-sm border border-emerald-700" />
            <div className="absolute w-3.5 h-11 bg-amber-500 border border-amber-600 rounded-xs flex items-center justify-center">
              <div className="w-1.5 h-2 border border-white/80 rounded-2xs" />
            </div>
          </div>
        </div>
      );
    }

    // Default File Icon
    return (
      <div className="w-full aspect-square bg-slate-50 dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 flex flex-col items-center justify-center p-2 group-hover:border-slate-400 transition">
        <FileText className="w-9 h-9 text-slate-400 dark:text-zinc-500" />
      </div>
    );
  };

  const accessiblePosts = posts.filter(p => {
    if (isSuperadmin) return true;
    const owner = (p.owner_username || '').toLowerCase();
    const me = activeUsername.toLowerCase();
    return owner === me || !p.owner_username;
  });

  const isSearchActive = searchQuery.trim().length > 0;

  // Single files search across all accessible folders
  const matchingSingleFiles = useMemo(() => {
    if (!isSearchActive) return [];
    const q = searchQuery.toLowerCase().trim();
    const files: Array<DriveAttachment & { parentPost: DrivePost }> = [];
    accessiblePosts.forEach(post => {
      (post.attachments || []).forEach(att => {
        if (att.name.toLowerCase().includes(q)) {
          files.push({ ...att, parentPost: post });
        }
      });
    });
    return files;
  }, [accessiblePosts, searchQuery, isSearchActive]);

  // Matching folders
  const matchingFolders = useMemo(() => {
    if (!isSearchActive) return accessiblePosts;
    const q = searchQuery.toLowerCase().trim();
    return accessiblePosts.filter(p => 
      p.title.toLowerCase().includes(q) || 
      (p.content && p.content.toLowerCase().includes(q))
    );
  }, [accessiblePosts, searchQuery, isSearchActive]);

  return (
    <div className="flex flex-col h-full bg-[#fafafa] dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans select-none">
      {/* Top Search & Upload Bar */}
      <div className="p-3 bg-white dark:bg-zinc-900 border-b border-slate-200/80 dark:border-zinc-800 flex items-center gap-2 shrink-0 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari folder atau single file berkas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700/80 rounded-xl pl-9 pr-7 py-2 text-xs font-medium text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-none focus:border-slate-400 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-200 text-white dark:text-slate-900 rounded-xl text-xs font-bold shadow-xs active:scale-95 transition shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Unggah</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-slate-500" />
            <p className="text-xs font-medium">Memuat data Panca Drive...</p>
          </div>
        ) : isSearchActive ? (
          // ================= SEARCH RESULTS (SINGLE FILES & FOLDERS) =================
          <div className="space-y-4 animate-fade-in">
            {/* 1. Single Files Results */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Berkas Ditemukan ({matchingSingleFiles.length} file)
                </span>
              </div>

              {matchingSingleFiles.length === 0 ? (
                <div className="p-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/80 dark:border-zinc-800 text-center text-xs text-slate-400">
                  Tidak ada single file yang cocok dengan "{searchQuery}".
                </div>
              ) : (
                <div className="space-y-2">
                  {matchingSingleFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-850 border border-slate-200/90 dark:border-zinc-800 rounded-2xl shadow-2xs flex items-center justify-between gap-3 group transition"
                    >
                      <div 
                        onClick={() => setPreviewFile(file)}
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                          {getFileBadge(file.fileType, file.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 transition-colors">
                            {file.name}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                            <span className="truncate">Folder: {file.parentPost.title}</span>
                            <span>•</span>
                            <span>{formatBytes(file.size)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setPreviewFile(file)}
                          className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg transition"
                          title="Lihat Pratinjau"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={file.url}
                          download={file.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg transition"
                          title="Unduh"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Folders Results */}
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Folder Ditemukan ({matchingFolders.length} folder)
              </span>

              {matchingFolders.length === 0 ? (
                <div className="p-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/80 dark:border-zinc-800 text-center text-xs text-slate-400">
                  Tidak ada folder yang cocok.
                </div>
              ) : (
                <div className="space-y-2">
                  {matchingFolders.map(post => (
                    <div
                      key={post.id}
                      onClick={() => setSelectedFolder(post)}
                      className="p-3 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-850 border border-slate-200/90 dark:border-zinc-800 rounded-2xl shadow-2xs flex items-center justify-between gap-3 cursor-pointer group transition"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 flex items-center justify-center text-amber-500 shrink-0">
                          <Folder className="w-5 h-5 fill-amber-400 text-amber-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 transition-colors">
                            {post.title}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {post.attachments?.length || 0} file • {formatFileDate(post.created_at)}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-800 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : selectedFolder ? (
          // ================= INSIDE FOLDER VIEW (COMPUTER EXPLORER) =================
          <div className="space-y-3.5 animate-fade-in">
            {/* Folder Header & Navigation */}
            <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelectedFolder(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 text-slate-700 dark:text-zinc-300 text-xs font-bold transition active:scale-95"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Semua Folder</span>
                </button>

                {/* View Switcher: Thumbnail vs List */}
                <div className="flex items-center p-0.5 bg-slate-100 dark:bg-zinc-800 rounded-xl border border-slate-200/80 dark:border-zinc-700">
                  <button
                    onClick={() => setFileViewMode('thumbnail')}
                    className={`p-1.5 rounded-lg transition ${
                      fileViewMode === 'thumbnail'
                        ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="Tampilan Thumbnail Preview (Lampiran 1)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setFileViewMode('list')}
                    className={`p-1.5 rounded-lg transition ${
                      fileViewMode === 'list'
                        ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="Tampilan List Detail (Lampiran 2)"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Folder Details */}
              <div className="flex items-start justify-between gap-3 pt-1 border-t border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center text-amber-500 shrink-0">
                    <FolderOpen className="w-5 h-5 fill-amber-400 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {selectedFolder.title}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {selectedFolder.attachments?.length || 0} berkas • Dibuat {formatFileDate(selectedFolder.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openShare(selectedFolder)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition"
                    title="Bagikan Folder"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  {(selectedFolder.owner_username === activeUsername || isSuperadmin) && (
                    <button
                      onClick={async () => {
                        await handleDeletePost(selectedFolder.id);
                        setSelectedFolder(null);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                      title="Hapus Folder"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {selectedFolder.content && (
                <p className="text-[11px] text-slate-600 dark:text-zinc-300 leading-relaxed bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800">
                  {selectedFolder.content}
                </p>
              )}
            </div>

            {/* Folder Files Content */}
            {!selectedFolder.attachments || selectedFolder.attachments.length === 0 ? (
              <div className="p-8 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 text-center text-xs text-slate-400">
                Folder ini belum memiliki file lampiran.
              </div>
            ) : fileViewMode === 'thumbnail' ? (
              // ===== TIPE THUMBNAIL PREVIEW (LAMPIRAN 1) =====
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-fade-in">
                {selectedFolder.attachments.map((att, i) => (
                  <div
                    key={i}
                    onClick={() => setPreviewFile(att)}
                    className="bg-white dark:bg-zinc-900 hover:bg-slate-50/80 dark:hover:bg-zinc-850 p-2.5 rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-2xs flex flex-col justify-between cursor-pointer group transition active:scale-[0.98]"
                  >
                    {/* Thumbnail Box */}
                    <div className="mb-2">
                      {renderThumbnailBox(att)}
                    </div>

                    {/* File Info Beneath Thumbnail */}
                    <div className="text-center pt-1">
                      <p className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors" title={att.name}>
                        {att.name}
                      </p>
                      <span className="text-[9px] font-semibold text-slate-400 mt-0.5 block">
                        {formatBytes(att.size)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // ===== TIPE LIST DETAIL (LAMPIRAN 2 - COMPUTER DETAILS VIEW) =====
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 overflow-hidden shadow-2xs divide-y divide-slate-100 dark:divide-zinc-800 animate-fade-in">
                {selectedFolder.attachments.map((att, i) => (
                  <div
                    key={i}
                    onClick={() => setPreviewFile(att)}
                    className="p-3 hover:bg-slate-50 dark:hover:bg-zinc-850 flex items-center justify-between gap-3 cursor-pointer group transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                        {getFileBadge(att.fileType, att.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate group-hover:text-blue-600 transition-colors" title={att.name}>
                          {att.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span>{formatFileDate(selectedFolder.created_at)}</span>
                          <span>•</span>
                          <span>{getFileTypeLabel(att.fileType, att.name)}</span>
                          <span>•</span>
                          <span>{formatBytes(att.size)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setPreviewFile(att)}
                        className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg transition"
                        title="Lihat Pratinjau"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={att.url}
                        download={att.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg transition"
                        title="Unduh"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // ================= ROOT FOLDER LIST (PER BARIS FOLDER) =================
          accessiblePosts.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <HardDrive className="w-14 h-14 mx-auto text-slate-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">Belum ada folder di Panca Drive</p>
              <p className="text-xs mt-1 text-slate-400">Ketuk tombol "Unggah" di atas untuk menambahkan berkas baru.</p>
            </div>
          ) : (
            <div className="space-y-2.5 animate-fade-in">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Daftar Folder ({accessiblePosts.length} folder)
                </span>
                <span className="text-[10px] text-slate-400">
                  Ketuk folder untuk melihat isi berkas
                </span>
              </div>

              {accessiblePosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => setSelectedFolder(post)}
                  className="p-3.5 bg-white dark:bg-zinc-900 hover:bg-slate-50/90 dark:hover:bg-zinc-850 border border-slate-200/90 dark:border-zinc-800 rounded-2xl shadow-2xs flex items-center justify-between gap-3 cursor-pointer group transition active:scale-[0.99]"
                >
                  {/* Left: Folder Icon and Details */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 flex items-center justify-center text-amber-500 shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                      <Folder className="w-5 h-5 fill-amber-400 text-amber-500" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 transition-colors">
                        {post.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span className="font-semibold text-slate-600 dark:text-zinc-300">
                          {post.attachments?.length || 0} berkas
                        </span>
                        <span>•</span>
                        <span>{formatFileDate(post.created_at)}</span>
                        <span>•</span>
                        <span className="truncate">Oleh {post.owner_name || post.owner_username}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions & Arrow */}
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => openShare(post)}
                      className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg transition"
                      title="Bagikan Tautan"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>

                    {(post.owner_username === activeUsername || isSuperadmin) && (
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                        title="Hapus Folder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-800 ml-1" />
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Upload Modal (Drag and Drop + Multi File Support) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-zinc-900 p-6 shadow-2xl relative text-slate-800 dark:text-zinc-100 max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setShowUploadModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white flex items-center justify-center mb-3">
              <Upload className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">Unggah Berkas Baru ke Panca Drive</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Unggah dokumen arsip untuk keperluan tim dan perusahaan.</p>

            {uploadError && (
              <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs border border-rose-200 dark:border-rose-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Judul Dokumen / Postingan *</label>
                <input
                  type="text"
                  placeholder="Contoh: Dokumen Penawaran & Spesifikasi Proyek"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Catatan Tambahan (Opsional)</label>
                <textarea
                  placeholder="Keterangan lampiran atau instruksi penggunaan file..."
                  rows={2}
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                />
              </div>

              {/* Drag and drop upload zone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Pilih File Lampiran</label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
                    isDragging 
                      ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-950/20' 
                      : 'border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/30 hover:border-slate-400'
                  }`}
                >
                  <Upload className="w-7 h-7 mx-auto text-slate-400 dark:text-zinc-500 mb-1.5" />
                  <p className="text-xs font-bold text-slate-700 dark:text-zinc-200">Tarik & letakkan berkas ke sini</p>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">atau klik tombol di bawah untuk memilih file</p>
                  <label className="mt-3 inline-block px-4 py-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 cursor-pointer shadow-2xs">
                    Pilih File
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelection}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Selected Files preview list */}
              {selectedFiles.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                    File Terpilih ({selectedFiles.length})
                  </span>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                    {selectedFiles.map((file, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between text-xs bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl border border-slate-200 dark:border-zinc-700"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {getFileBadge(file.type, file.name)}
                          <span className="truncate font-semibold text-slate-800 dark:text-zinc-200">{file.name}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">({formatBytes(file.size)})</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {uploadProgress[file.name] === 'uploading' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />
                          )}
                          {uploadProgress[file.name] === 'success' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(idx, file.name)}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading}
                className="w-full py-3 bg-slate-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-200 text-white dark:text-slate-900 font-bold rounded-2xl text-xs shadow-md transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke Drive...</span>
                  </>
                ) : (
                  <span>Simpan & Terbitkan</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Share Modal (Matching Task App Drive View Expiration System) */}
      {sharingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 p-6 shadow-2xl relative text-slate-800 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
                BAGIKAN POSTINGAN DRIVE
              </h3>
              <button
                onClick={() => setSharingPost(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Judul Postingan box matching screenshot */}
              <div className="bg-slate-50 dark:bg-zinc-800/60 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800/80">
                <span className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest block mb-1">
                  JUDUL POSTINGAN
                </span>
                <p className="text-sm font-bold text-slate-900 dark:text-zinc-100 leading-snug">
                  {sharingPost.title}
                </p>
              </div>

              {!generatedShareLink ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium leading-relaxed">
                    Tentukan masa aktif durasi berlakunya link sharing di bawah ini. Setelah durasi berakhir, link otomatis tidak dapat diakses.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
                        MASA BERLAKU
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={shareValue}
                        onChange={e => setShareValue(parseInt(e.target.value) || 1)}
                        className="w-full p-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
                        SATUAN WAKTU
                      </label>
                      <select
                        value={shareUnit}
                        onChange={e => setShareUnit(e.target.value as any)}
                        className="w-full p-3 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none text-xs font-bold text-slate-800 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="hours">Jam (Hours)</option>
                        <option value="days">Hari (Days)</option>
                        <option value="weeks">Minggu (Weeks)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateShareLink}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl shadow-md transition text-xs uppercase tracking-wider active:scale-98"
                  >
                    DAPATKAN LINK TEMPORARY
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                    Link Share Temporary (Siap Dibagikan)
                  </label>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedShareLink}
                      className="flex-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-2.5 rounded-xl text-xs font-mono text-slate-800 dark:text-zinc-200 outline-none select-all truncate"
                    />
                    <button
                      onClick={copyShareLink}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 active:scale-95 ${
                        copiedLink ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Tersalin!' : 'Salin'}</span>
                    </button>
                  </div>

                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Link aktif tersimpan di database.</span>
                    </div>
                    <button
                      onClick={() => handleCancelShare(sharingPost.id)}
                      className="text-rose-600 hover:text-rose-700 text-[10px] font-bold underline ml-2"
                    >
                      Tarik Akses
                    </button>
                  </div>

                  <button
                    onClick={() => setGeneratedShareLink('')}
                    className="w-full py-2.5 border border-dashed border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-bold rounded-xl text-xs transition"
                  >
                    + Buat Link Baru dengan Durasi Lain
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-zinc-800 flex justify-end">
              <button
                onClick={() => setSharingPost(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-bold rounded-xl transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between p-4 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3 md:px-5 rounded-2xl w-full max-w-4xl mx-auto mb-3 text-white">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {getFileBadge(previewFile.fileType, previewFile.name)}
              <span className="truncate text-xs md:text-sm font-bold">{previewFile.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <a
                href={previewFile.url}
                download={previewFile.name}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Unduh</span>
              </a>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Viewer */}
          <div className="flex-1 max-w-4xl w-full mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden flex items-center justify-center p-4">
            {isImageFile(previewFile.fileType, previewFile.name || previewFile.url) ? (
              <img
                src={getProxiedUrl(previewFile.url)}
                alt={previewFile.name}
                onError={(e) => handleImageError(e, previewFile.url)}
                className="max-h-full max-w-full object-contain rounded-xl"
              />
            ) : isPdfFile(previewFile.fileType, previewFile.name || previewFile.url) ? (
              <iframe
                src={getProxiedUrl(previewFile.url)}
                title={previewFile.name}
                className="w-full h-full rounded-xl bg-white"
              />
            ) : (
              <div className="text-center p-8 text-slate-400">
                <FileText className="w-16 h-16 mx-auto mb-3 text-slate-500" />
                <p className="text-sm font-bold text-white mb-1">{previewFile.name}</p>
                <p className="text-xs mb-4">Pratinjau tidak tersedia langsung untuk tipe berkas ini.</p>
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 font-bold rounded-xl text-xs hover:bg-slate-100 transition shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Berkas Sekarang</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
