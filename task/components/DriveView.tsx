import React, { useState, useEffect } from 'react';
import { DrivePost, DriveAttachment } from '../types';
import { supabaseService } from '../services/supabaseService';
import { getProxiedUrl, isImageFile, isPdfFile, handleImageError } from '../services/proxyService';

interface DriveViewProps {
  currentUser: {
    username: string;
    role: 'superadmin' | 'user';
    name: string;
  };
}

export const DriveView: React.FC<DriveViewProps> = ({ currentUser }) => {
  const [posts, setPosts] = useState<DrivePost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Form states for new post
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: 'pending' | 'uploading' | 'success' | 'error' }>({});
  const [errorMessage, setErrorMessage] = useState('');

  // ImageKit states from environment variables (with localStorage fallback)
  const [ikUrl, setIkUrl] = useState('');
  const [ikPublic, setIkPublic] = useState('');
  const [ikPrivate, setIkPrivate] = useState('');

  // Sharing states
  const [sharingPost, setSharingPost] = useState<DrivePost | null>(null);
  const [shareValue, setShareValue] = useState<number>(1);
  const [shareUnit, setShareUnit] = useState<'hours' | 'days' | 'weeks'>('hours');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; fileType: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // Load ImageKit settings from environment variables first, then fallback to localStorage
    const envUrl = (import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || '').trim();
    const envPublic = (import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || '').trim();
    const envPrivate = (import.meta.env.VITE_IMAGEKIT_PRIVATE_KEY || '').trim();

    const savedUrl = envUrl || localStorage.getItem('mypanca_imagekit_url') || '';
    const savedPublic = envPublic || localStorage.getItem('mypanca_imagekit_public') || '';
    const savedPrivate = envPrivate || localStorage.getItem('mypanca_imagekit_private') || '';

    setIkUrl(savedUrl);
    setIkPublic(savedPublic);
    setIkPrivate(savedPrivate);

    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const data = await supabaseService.getDrivePosts(currentUser.username);
      setPosts(data);
    } catch (err) {
      console.error('Gagal mengambil postingan:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArr = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...filesArr]);
      
      const newProgress = { ...uploadProgress };
      filesArr.forEach(f => {
        newProgress[f.name] = 'pending';
      });
      setUploadProgress(newProgress);
    }
  };

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
      const filesArr = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...filesArr]);
      
      const newProgress = { ...uploadProgress };
      filesArr.forEach(f => {
        newProgress[f.name] = 'pending';
      });
      setUploadProgress(newProgress);
    }
  };

  const removeSelectedFile = (index: number, fileName: string) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    const newProgress = { ...uploadProgress };
    delete newProgress[fileName];
    setUploadProgress(newProgress);
  };

  // Helper function to upload a file directly to ImageKit using browser Web Crypto
  const uploadToImageKit = async (file: File): Promise<DriveAttachment> => {
    if (!ikUrl || !ikPublic || !ikPrivate) {
      throw new Error('Konfigurasi ImageKit belum lengkap. Silakan lengkapi di panel pengaturan.');
    }

    // 1. Generate token & expire
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expire = Math.floor(Date.now() / 1000) + 1800; // valid for 30 mins

    // 2. Generate HMAC-SHA1 signature using browser Web Crypto
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

    // 3. Prepare Form Data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', file.name);
    formData.append('publicKey', ikPublic.trim());
    formData.append('signature', signatureHex);
    formData.append('token', token);
    formData.append('expire', expire.toString());
    formData.append('useUniqueFileName', 'true');
    formData.append('folder', '/mypanca_drive');

    // Clean endpoint URL
    let cleanEndpoint = ikUrl.trim();
    if (cleanEndpoint.endsWith('/')) {
      cleanEndpoint = cleanEndpoint.slice(0, -1);
    }

    // 4. Send request to ImageKit
    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr;
      try {
        parsedErr = JSON.parse(errText);
      } catch (e) {}
      throw new Error(parsedErr?.message || `ImageKit Error: ${response.statusText}`);
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

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (selectedFiles.length > 0 && (!ikUrl || !ikPublic || !ikPrivate)) {
      setErrorMessage('Ada file yang dipilih, tetapi konfigurasi ImageKit belum lengkap di environment variables (VITE_IMAGEKIT_URL_ENDPOINT, VITE_IMAGEKIT_PUBLIC_KEY, VITE_IMAGEKIT_PRIVATE_KEY).');
      return;
    }

    setIsPublishing(true);
    setErrorMessage('');
    const uploadedAttachments: DriveAttachment[] = [];

    try {
      // Upload each file to ImageKit
      for (const file of selectedFiles) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 'uploading' }));
        try {
          const attachment = await uploadToImageKit(file);
          uploadedAttachments.push(attachment);
          setUploadProgress(prev => ({ ...prev, [file.name]: 'success' }));
        } catch (uploadErr: any) {
          setUploadProgress(prev => ({ ...prev, [file.name]: 'error' }));
          throw new Error(`Gagal mengunggah file "${file.name}": ${uploadErr.message}`);
        }
      }

      // Save Post with Attachments to Supabase
      const newPost = {
        title: title.trim(),
        content: content.trim(),
        attachments: uploadedAttachments,
        owner_username: currentUser.username,
      };

      await supabaseService.createDrivePost(newPost);
      
      // Reset form states
      setTitle('');
      setContent('');
      setSelectedFiles([]);
      setUploadProgress({});
      
      // Refresh posts list
      fetchPosts();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Gagal menerbitkan postingan.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus postingan ini secara permanen?')) {
      try {
        await supabaseService.deleteDrivePost(postId);
        fetchPosts();
      } catch (err) {
        console.error('Gagal menghapus postingan:', err);
        alert('Gagal menghapus postingan.');
      }
    }
  };

  // Link Sharing Logic
  const handleOpenShare = (post: DrivePost) => {
    setSharingPost(post);
    setShareValue(1);
    setShareUnit('hours');
    setGeneratedLink('');
    setCopied(false);
  };

  const handleGenerateShareLink = async () => {
    if (!sharingPost) return;

    // Calculate expiration date
    let msToAdd = 0;
    if (shareUnit === 'hours') {
      msToAdd = shareValue * 60 * 60 * 1000;
    } else if (shareUnit === 'days') {
      msToAdd = shareValue * 24 * 60 * 60 * 1000;
    } else if (shareUnit === 'weeks') {
      msToAdd = shareValue * 7 * 24 * 60 * 60 * 1000;
    }

    const expiresAt = new Date(Date.now() + msToAdd).toISOString();
    // Unique share token
    const token = 'sh_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    try {
      await supabaseService.updateDrivePost(sharingPost.id, {
        share_token: token,
        share_expires_at: expiresAt,
      });

      const fullLink = `${window.location.origin}?shareDrive=${token}`;
      setGeneratedLink(fullLink);
      
      // Update posts in view
      fetchPosts();
    } catch (err) {
      console.error('Gagal membuat link share:', err);
      alert('Gagal membuat link sharing.');
    }
  };

  const handleCancelShare = async (postId: string) => {
    try {
      await supabaseService.updateDrivePost(postId, {
        share_token: undefined,
        share_expires_at: undefined,
      });
      alert('Link sharing berhasil ditarik/dibatalkan.');
      if (sharingPost && sharingPost.id === postId) {
        setGeneratedLink('');
      }
      fetchPosts();
    } catch (err) {
      console.error('Gagal membatalkan sharing:', err);
      alert('Gagal membatalkan sharing.');
    }
  };

  const copyToClipboard = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper for rendering size
  const formatBytes = (bytes?: number, decimals = 2) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Helper to determine icon based on MIME type or extension
  const getFileIcon = (fileType: string, name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    
    if (fileType.startsWith('image/')) {
      return (
        <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    }
    
    if (fileType === 'application/pdf' || ext === 'pdf') {
      return (
        <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    }

    if (
      ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '') ||
      fileType.includes('zip') ||
      fileType.includes('compressed')
    ) {
      return (
        <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M12 12v6" />
          <path d="M10 12h4" />
          <path d="M10 15h4" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }

    if (
      ['doc', 'docx', 'txt', 'rtf'].includes(ext || '') ||
      fileType.includes('word') ||
      fileType.includes('text')
    ) {
      return (
        <svg className="w-8 h-8 text-zinc-800 dark:text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      );
    }

    if (
      ['xls', 'xlsx', 'csv'].includes(ext || '') ||
      fileType.includes('excel') ||
      fileType.includes('sheet')
    ) {
      return (
        <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      );
    }

    // Default File Icon
    return (
      <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  };

  return (
    <div className="p-6 lg:p-10 animate-fade-in flex flex-col h-full space-y-10">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h3 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Panca Drive</h3>
          <p className="text-sm text-slate-400">Bagikan postingan, lampirkan berbagai tipe file, dan buat link akses temporary via ImageKit.</p>
        </div>
      </div>

      {/* WARNING IF NO IMAGEKIT */}
      {!ikUrl && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="font-bold text-amber-900">Upload Lampiran Memerlukan Konfigurasi Env ImageKit</p>
              <p className="text-xs text-amber-700">
                Silakan isi environment variables <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">VITE_IMAGEKIT_URL_ENDPOINT</code>, <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">VITE_IMAGEKIT_PUBLIC_KEY</code>, dan <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">VITE_IMAGEKIT_PRIVATE_KEY</code> untuk mengaktifkan fitur upload lampiran.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* NEW POST FORM */}
      <div className="bg-slate-50 dark:bg-slate-900/40 p-8 rounded-[32px] border border-slate-200/80">
        <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-wider mb-6 flex items-center gap-2">
          <svg className="w-5 h-5 text-zinc-900 dark:text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
          </svg>
          Buat Postingan Drive Baru
        </h3>

        <form onSubmit={handlePublishPost} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Judul Postingan</label>
                <input
                  required
                  type="text"
                  placeholder="Masukkan judul postingan, e.g. Laporan Keuangan Bulan Juni"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full p-4 bg-white border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-2xl outline-none font-bold text-sm focus:border-zinc-700 dark:border-zinc-300 transition-all text-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Isi / Deskripsi Postingan</label>
                <textarea
                  placeholder="Tuliskan keterangan detail mengenai berkas atau postingan ini..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  className="w-full p-4 bg-white border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-2xl outline-none font-medium text-sm h-32 focus:border-zinc-700 dark:border-zinc-300 transition-all resize-none text-slate-800 dark:text-white"
                />
              </div>
            </div>

            {/* ATTACHMENT BOX */}
            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Lampiran File (Semua Jenis Berkas)</label>
                
                {/* Drag Drop Area */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] group ${
                    isDragging
                      ? 'border-zinc-700 dark:border-zinc-300 bg-zinc-100 dark:bg-zinc-950/20 scale-[1.02]'
                      : 'border-slate-200 dark:border-slate-800 hover:border-zinc-700 dark:border-zinc-300 dark:hover:border-zinc-700 dark:border-zinc-300 bg-white dark:bg-slate-950'
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <svg className={`w-10 h-10 transition-colors mb-2 ${isDragging ? 'text-zinc-900 dark:text-zinc-100' : 'text-slate-400 group-hover:text-zinc-900 dark:text-zinc-100'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="text-xs font-black text-slate-600 dark:text-slate-400">Pilih atau Seret Beberapa Berkas</p>
                  <p className="text-[9px] text-slate-400 mt-1">PDF, DOCX, ZIP, JPG, DLL</p>
                </div>
              </div>

              {/* Uploading status list */}
              {selectedFiles.length > 0 && (
                <div className="bg-white dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-2 max-h-[120px] overflow-y-auto custom-scrollbar">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-1.5 border-b last:border-0 border-slate-50 dark:border-slate-900">
                      <span className="font-bold text-slate-600 dark:text-slate-300 truncate max-w-[150px]">{file.name}</span>
                      <div className="flex items-center gap-2">
                        {uploadProgress[file.name] === 'pending' && <span className="text-[9px] font-black text-slate-400 uppercase">Menunggu</span>}
                        {uploadProgress[file.name] === 'uploading' && <span className="text-[9px] font-black text-amber-500 uppercase flex items-center gap-1"><div className="w-2 h-2 border border-amber-500 border-t-transparent rounded-full animate-spin"></div>Unggah...</span>}
                        {uploadProgress[file.name] === 'success' && <span className="text-[9px] font-black text-emerald-500 uppercase">Sukses</span>}
                        {uploadProgress[file.name] === 'error' && <span className="text-[9px] font-black text-rose-500 uppercase">Gagal</span>}
                        
                        {!isPublishing && (
                          <button type="button" onClick={() => removeSelectedFile(idx, file.name)} className="text-slate-400 hover:text-rose-500">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {errorMessage && (
            <p className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/20 p-3 rounded-xl border border-rose-100 dark:border-rose-900/50">
              {errorMessage}
            </p>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              disabled={isPublishing || !title.trim()}
              type="submit"
              className="px-10 py-4 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:bg-zinc-200 disabled:opacity-50 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-2"
            >
              {isPublishing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Mengunggah & Menyimpan...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  Terbitkan Postingan
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* FEED FEED LIST */}
      <div className="space-y-6">
        <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <svg className="w-5 h-5 text-zinc-900 dark:text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Semua Postingan & File ({posts.length})
        </h3>

        {isLoading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-zinc-900 dark:border-zinc-100 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Memuat berkas drive...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="py-20 text-center bg-slate-50 dark:bg-slate-900/20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[32px] text-slate-400 font-bold uppercase tracking-widest text-xs">
            Belum ada postingan atau file di Drive tim Anda
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {posts.map(post => {
              const isOwner = post.owner_username === currentUser.username;
              const isAdmin = currentUser.role === 'superadmin';
              const isShared = post.share_token && post.share_expires_at;
              const hasExpired = isShared && new Date() > new Date(post.share_expires_at!);

              return (
                <div key={post.id} className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-6 relative group hover:border-slate-200 transition-all">
                  {/* Creator avatar column */}
                  <div className="flex md:flex-col items-center md:items-start shrink-0 gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-slate-800 flex items-center justify-center text-zinc-900 dark:text-zinc-100 dark:text-zinc-600 dark:text-zinc-400 font-black text-base shadow-sm">
                      {post.owner_name ? post.owner_name.charAt(0) : post.owner_username.charAt(0)}
                    </div>
                    <div className="text-left md:mt-2">
                      <p className="text-xs font-black text-slate-800 dark:text-white leading-none">{post.owner_name || post.owner_username}</p>
                      <p className="text-[10px] text-slate-400 mt-1 font-semibold">{post.created_at ? new Date(post.created_at).toLocaleDateString('id-ID') : ''}</p>
                    </div>
                  </div>

                  {/* Body Column */}
                  <div className="flex-1 space-y-4">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h4 className="text-lg font-black text-slate-800 dark:text-white leading-tight">{post.title}</h4>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {/* Share link button */}
                        <button
                          onClick={() => handleOpenShare(post)}
                          className={`p-2 rounded-xl border transition-all ${
                            isShared 
                              ? hasExpired
                                ? 'bg-rose-50 border-rose-100 text-rose-500'
                                : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                              : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-300'
                          }`}
                          title="Bagikan Link Sementara"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                            <polyline points="16 6 12 2 8 6" />
                            <line x1="12" y1="2" x2="12" y2="15" />
                          </svg>
                        </button>

                        {/* Delete post button */}
                        {(isOwner || isAdmin) && (
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all border border-rose-100/50"
                            title="Hapus Postingan"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {post.content && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-medium">{post.content}</p>
                    )}

                    {/* Shared state indicators */}
                    {isShared && (
                      <div className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-wrap items-center justify-between gap-2 ${
                        hasExpired 
                          ? 'bg-rose-50/50 border-rose-100 text-rose-700' 
                          : 'bg-emerald-50/50 border-emerald-100 text-emerald-800'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${hasExpired ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                          <span>
                            {hasExpired 
                              ? 'Link temporary sudah kedaluwarsa!' 
                              : `Link share aktif s.d: ${new Date(post.share_expires_at!).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}`
                            }
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {!hasExpired && (
                            <button
                              onClick={() => {
                                handleOpenShare(post);
                                const fullLink = `${window.location.origin}?shareDrive=${post.share_token}`;
                                setGeneratedLink(fullLink);
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[10px] uppercase tracking-wider"
                            >
                              Detail Link
                            </button>
                          )}
                          <button
                            onClick={() => handleCancelShare(post.id)}
                            className="px-2.5 py-1 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-[10px] uppercase tracking-wider"
                          >
                            Tarik Link
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ATTACHMENT TILES */}
                    {post.attachments && post.attachments.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        {post.attachments.map((file, fIdx) => {
                          const isImg = isImageFile(file.fileType, file.name || file.url);
                          return (
                            <button
                              key={fIdx}
                              onClick={() => setPreviewFile(file)}
                              className="group flex flex-col p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 hover:border-zinc-400 dark:border-zinc-600 hover:bg-white dark:hover:bg-slate-950 transition-all text-left w-full active:scale-98 overflow-hidden shadow-xs"
                            >
                              {isImg && (
                                <div className="w-full h-40 bg-slate-900 rounded-xl overflow-hidden mb-2.5 relative flex items-center justify-center border border-slate-200 dark:border-slate-800">
                                  <img
                                    src={getProxiedUrl(file.url)}
                                    alt={file.name}
                                    onError={(e) => handleImageError(e, file.url)}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    loading="lazy"
                                  />
                                  <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-transparent transition-all" />
                                </div>
                              )}
                              <div className="flex items-center gap-3 w-full">
                                <div className="p-2 bg-white dark:bg-slate-900 rounded-xl shadow-xs shrink-0">
                                  {getFileIcon(file.fileType, file.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-black text-slate-700 dark:text-slate-200 truncate leading-tight" title={file.name}>
                                    {file.name}
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-none">
                                    {formatBytes(file.size)}
                                  </p>
                                </div>
                                <div className="text-slate-300 group-hover:text-zinc-900 dark:text-zinc-100 shrink-0">
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SHARE TEMPORARY LINK MODAL */}
      {sharingPost && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-8 pb-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-wider">
                Bagikan Postingan Drive
              </h3>
              <button onClick={() => setSharingPost(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Judul Postingan</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{sharingPost.title}</p>
              </div>

              {!generatedLink ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">Tentukan masa aktif durasi berlakunya link sharing di bawah ini. Setelah durasi berakhir, link otomatis tidak dapat diakses.</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Masa Berlaku</label>
                      <input
                        type="number"
                        min="1"
                        value={shareValue}
                        onChange={e => setShareValue(parseInt(e.target.value) || 1)}
                        className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-sm font-bold text-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Satuan Waktu</label>
                      <select
                        value={shareUnit}
                        onChange={e => setShareUnit(e.target.value as any)}
                        className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-sm font-bold text-slate-800 dark:text-white"
                      >
                        <option value="hours">Jam (Hours)</option>
                        <option value="days">Hari (Days)</option>
                        <option value="weeks">Minggu (Weeks)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateShareLink}
                    className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:bg-zinc-200 text-white font-black rounded-2xl shadow-md transition-all uppercase tracking-wider text-xs"
                  >
                    Dapatkan Link Temporary
                  </button>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Temporary Link (Siap Dibagikan)
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      type="text"
                      value={generatedLink}
                      className="flex-1 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none font-bold text-xs text-zinc-900 dark:text-zinc-100 select-all"
                    />
                    <button
                      onClick={copyToClipboard}
                      className={`px-6 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all border shrink-0 ${
                        copied
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {copied ? 'Tersalin!' : 'Salin'}
                    </button>
                  </div>
                  
                  <div className="flex justify-between items-center p-3 rounded-xl border border-emerald-100 bg-emerald-50 text-[11px] font-semibold text-emerald-800">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                      <span>Masa berlaku link telah diaktifkan ke database.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 pt-0 border-t border-slate-50 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSharingPost(null)}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs uppercase tracking-wider"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW MODAL */}
      {previewFile && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-between p-4 md:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 md:px-6 rounded-3xl shadow-xl w-full max-w-5xl mx-auto mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-slate-800 rounded-xl shrink-0">
                {getFileIcon(previewFile.fileType, previewFile.name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-200 truncate leading-tight" title={previewFile.name}>
                  {previewFile.name}
                </p>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Preview Dokumen</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Unduh button in header */}
              <a
                href={getProxiedUrl(previewFile.url, true, previewFile.name)}
                download={previewFile.name}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:bg-zinc-200 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Unduh
              </a>

              {/* Close Button */}
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
                    className="px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:bg-zinc-200 text-white font-bold text-xs rounded-xl shadow-md transition-all"
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

          {/* Footer inside modal */}
          <div className="text-center text-[8px] font-black text-slate-600 uppercase tracking-widest pt-4">
            Didukung oleh Google Docs Viewer Engine
          </div>
        </div>
      )}
    </div>
  );
};
