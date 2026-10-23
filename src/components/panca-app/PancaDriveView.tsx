import React, { useState, useEffect } from 'react';
import { 
  Folder, FileText, Upload, Share2, Download, Search, Plus, 
  Trash2, Copy, Check, Eye, X, ExternalLink, HardDrive, FileSpreadsheet,
  FileImage, FileCode, CheckCircle2, Clock, AlertTriangle, AlertCircle, Loader2
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
      return <Folder className="w-4 h-4 text-yellow-600 shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-slate-500 shrink-0" />;
  };

  const filteredPosts = posts
    .filter(p => {
      if (isSuperadmin) return true;
      const owner = (p.owner_username || '').toLowerCase();
      const me = activeUsername.toLowerCase();
      return owner === me || !p.owner_username;
    })
    .filter(p => {
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        (p.content && p.content.toLowerCase().includes(q)) ||
        (p.owner_username && p.owner_username.toLowerCase().includes(q)) ||
        (p.attachments && p.attachments.some(a => a.name.toLowerCase().includes(q)))
      );
    });

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100">
      {/* Top Search & Upload Bar */}
      <div className="p-3 md:p-4 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2 shrink-0 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Cari berkas, postingan, nama file..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
          />
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold shadow-xs active:scale-95 transition shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Unggah</span>
        </button>
      </div>

      {/* Drive Postings & File List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-slate-500" />
            <p className="text-xs font-medium">Memuat data Panca Drive...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <HardDrive className="w-14 h-14 mx-auto text-slate-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">Belum ada berkas di Panca Drive</p>
            <p className="text-xs mt-1 text-slate-400">Ketuk tombol "Unggah" di atas untuk menambahkan berkas baru.</p>
          </div>
        ) : (
          filteredPosts.map((post) => {
            const isShared = Boolean(post.share_token);
            const hasExpired = isShared && post.share_expires_at 
              ? new Date(post.share_expires_at).getTime() < Date.now() 
              : false;

            return (
              <div
                key={post.id}
                className="bg-white dark:bg-zinc-900 p-4 md:p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs hover:shadow-md transition space-y-3"
              >
                {/* Header Card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 dark:text-zinc-400">
                      <span>Oleh <strong className="text-slate-700 dark:text-zinc-200">{post.owner_name || post.owner_username}</strong></span>
                      <span>•</span>
                      <span>{post.created_at ? new Date(post.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Baru'}</span>
                    </div>
                  </div>

                  {/* Actions (Share & Delete) */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openShare(post)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition"
                      title="Bagikan Tautan"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    {(post.owner_username === activeUsername || isSuperadmin) && (
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                        title="Hapus Postingan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Content / Description */}
                {post.content && (
                  <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-slate-100 dark:border-zinc-800">
                    {post.content}
                  </p>
                )}

                {/* Shared State Status Banner - Hanya tampil jika link masih aktif, TIDAK tampil jika sudah kedaluwarsa */}
                {isShared && !hasExpired && (
                  <div className="p-3 rounded-xl border text-xs font-semibold flex flex-wrap items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>
                        Link share aktif s.d: {new Date(post.share_expires_at!).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openActiveShare(post)}
                        className="px-2.5 py-1 bg-white dark:bg-zinc-800 hover:bg-slate-50 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                      >
                        Detail Link
                      </button>
                      <button
                        onClick={() => handleCancelShare(post.id)}
                        className="px-2.5 py-1 bg-white dark:bg-zinc-800 hover:bg-rose-50 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                      >
                        Tarik Link
                      </button>
                    </div>
                  </div>
                )}

                {/* Attachments Section */}
                {post.attachments && post.attachments.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                      Lampiran ({post.attachments.length} berkas)
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {post.attachments.map((att, i) => {
                        const isImg = isImageFile(att.fileType, att.name || att.url);
                        return (
                          <div
                            key={i}
                            className="group flex flex-col p-2.5 bg-slate-50 dark:bg-zinc-800/40 hover:bg-white dark:hover:bg-zinc-800 rounded-xl border border-slate-200/80 dark:border-zinc-700/60 transition shadow-2xs overflow-hidden"
                          >
                            {/* Image Thumbnail preview if image */}
                            {isImg && (
                              <div 
                                onClick={() => setPreviewFile(att)}
                                className="w-full h-32 bg-slate-900 rounded-lg overflow-hidden mb-2 relative flex items-center justify-center cursor-pointer border border-slate-200 dark:border-zinc-800"
                              >
                                <img
                                  src={getProxiedUrl(att.url)}
                                  alt={att.name}
                                  onError={(e) => handleImageError(e, att.url)}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-transparent transition-all flex items-center justify-center">
                                  <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {getFileBadge(att.fileType, att.name)}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-bold text-slate-800 dark:text-zinc-200" title={att.name}>
                                    {att.name}
                                  </p>
                                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-semibold">
                                    {formatBytes(att.size)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => setPreviewFile(att)}
                                  className="p-1.5 hover:text-slate-900 dark:hover:text-white rounded text-slate-400 transition"
                                  title="Pratinjau"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <a
                                  href={att.url}
                                  download={att.name}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 hover:text-slate-900 dark:hover:text-white rounded text-slate-400 transition"
                                  title="Unduh"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
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
