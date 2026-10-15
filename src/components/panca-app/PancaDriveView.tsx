import React, { useState, useEffect } from 'react';
import { 
  Folder, FileText, Upload, Share2, Download, Search, Plus, 
  Trash2, Copy, Check, Eye, X, ExternalLink, HardDrive, FileSpreadsheet,
  FileImage, FileCode, CheckCircle2, Clock
} from 'lucide-react';
import { supabaseService } from '../../../task/services/supabaseService';
import { DrivePost, DriveAttachment } from '../../../task/types';

interface PancaDriveViewProps {
  currentUser: {
    username: string;
    role: string;
    nama: string;
  };
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Share modal states
  const [sharingPost, setSharingPost] = useState<DrivePost | null>(null);
  const [shareHours, setShareHours] = useState(24);
  const [generatedShareLink, setGeneratedShareLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Preview file state
  const [previewFile, setPreviewFile] = useState<DriveAttachment | null>(null);

  useEffect(() => {
    fetchDrivePosts();
  }, []);

  const fetchDrivePosts = async () => {
    setIsLoading(true);
    try {
      const data = await supabaseService.getDrivePosts();
      setPosts(data || []);
    } catch (e) {
      console.warn("Error fetching drive posts:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Convert File to Base64 Data URL for robust storage
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim()) {
      setUploadError('Judul berkas/post wajib diisi.');
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      const attachments: DriveAttachment[] = [];

      for (const file of selectedFiles) {
        let fileUrl = '';
        try {
          fileUrl = await fileToBase64(file);
        } catch (err) {
          fileUrl = URL.createObjectURL(file);
        }

        attachments.push({
          name: file.name,
          url: fileUrl,
          fileType: file.type || 'application/octet-stream',
          fileId: 'file-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          size: file.size
        });
      }

      await supabaseService.createDrivePost({
        title: postTitle.trim(),
        content: postContent.trim(),
        attachments: attachments,
        owner_username: currentUser.username
      });

      // Reset and refresh
      setPostTitle('');
      setPostContent('');
      setSelectedFiles([]);
      setShowUploadModal(false);
      await fetchDrivePosts();
    } catch (err: any) {
      setUploadError(err.message || 'Gagal mengunggah berkas.');
    } finally {
      setIsUploading(false);
    }
  };

  // Open Share Modal
  const openShare = (post: DrivePost) => {
    setSharingPost(post);
    setCopiedLink(false);
    // Generate or use existing share token
    const token = post.share_token || Math.random().toString(36).substring(2, 12);
    const link = `${window.location.origin}/app?share_token=${token}`;
    setGeneratedShareLink(link);

    // Save token if new
    if (!post.share_token) {
      const expiresAt = new Date(Date.now() + shareHours * 3600000).toISOString();
      supabaseService.updateDrivePost(post.id, {
        share_token: token,
        share_expires_at: expiresAt
      }).catch(() => {});
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(generatedShareLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus berkas/postingan ini?')) return;
    try {
      await supabaseService.deleteDrivePost(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      alert('Gagal menghapus postingan');
    }
  };

  const filteredPosts = posts.filter(p => {
    const q = searchQuery.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.content && p.content.toLowerCase().includes(q)) ||
      p.owner_username.toLowerCase().includes(q) ||
      (p.attachments && p.attachments.some(a => a.name.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {/* Top Header */}
      <div className="bg-white px-5 py-3.5 border-b border-slate-200/80 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 leading-tight">Drive & Berkas</h2>
            <p className="text-[10px] text-slate-400">Penyimpanan dokumen & tautan berbagi</p>
          </div>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 active:scale-95 transition"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Unggah</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 bg-white border-b border-slate-100">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama berkas, postingan, atau lampiran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-400 transition"
          />
        </div>
      </div>

      {/* Drive Posts & Files List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-4">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Memuat berkas Drive...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Folder className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-semibold">Belum ada berkas di Drive</p>
            <p className="text-[10px] mt-1">Ketuk tombol "Unggah" di atas untuk menambahkan berkas baru.</p>
          </div>
        ) : (
          filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition space-y-3"
            >
              {/* Post Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs font-extrabold text-slate-900 leading-snug line-clamp-1">
                    {post.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                    <span>Oleh <strong>{post.owner_name || post.owner_username}</strong></span>
                    <span>•</span>
                    <span>{post.created_at ? new Date(post.created_at).toLocaleDateString('id-ID') : 'Baru'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openShare(post)}
                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    title="Bagikan Tautan"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  {(post.owner_username === currentUser.username || currentUser.role === 'superadmin') && (
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              {post.content && (
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {post.content}
                </p>
              )}

              {/* Attachments */}
              {post.attachments && post.attachments.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Lampiran ({post.attachments.length} berkas)
                  </span>

                  <div className="grid grid-cols-1 gap-1.5">
                    {post.attachments.map((att, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 p-2 bg-slate-50 hover:bg-indigo-50/50 rounded-xl border border-slate-200/60 transition text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="truncate font-semibold text-slate-800">{att.name}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setPreviewFile(att)}
                            className="p-1 hover:text-indigo-600 rounded text-slate-400 transition"
                            title="Pratinjau"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={att.url}
                            download={att.name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:text-indigo-600 rounded text-slate-400 transition"
                            title="Unduh"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl relative text-slate-800 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowUploadModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-4">
              <Upload className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900">Unggah Berkas Baru ke Drive</h3>
            <p className="text-xs text-slate-500 mt-0.5">Unggah dokumen untuk proyek atau dibagikan ke tim.</p>

            {uploadError && (
              <div className="mt-3 p-3 bg-rose-50 text-rose-600 rounded-xl text-xs border border-rose-200">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Judul Dokumen / Post *</label>
                <input
                  type="text"
                  placeholder="Contoh: Laporan Commissioning Proyek PLTU"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
                <textarea
                  placeholder="Rincian catatan berkas atau instruksi pengerjaan..."
                  rows={2}
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih File Lampiran</label>
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelection}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              {selectedFiles.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400">File terpilih:</span>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                        <span className="truncate max-w-[200px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="text-rose-500 hover:text-rose-700 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-lg shadow-indigo-200 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

      {/* Share Modal */}
      {sharingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl relative text-slate-800">
            <button
              onClick={() => setSharingPost(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-4">
              <Share2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900">Bagikan Berkas Drive</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tautan publik untuk dokumen <strong>{sharingPost.title}</strong>.</p>

            <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tautan Berbagi</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedShareLink}
                  className="flex-1 bg-transparent text-xs text-slate-800 outline-none select-all truncate font-mono"
                />
                <button
                  onClick={copyShareLink}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95 ${
                    copiedLink ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Disalin' : 'Salin'}</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setSharingPost(null)}
              className="mt-5 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition"
            >
              Selesai
            </button>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl relative text-slate-800 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="text-xs font-bold text-slate-900 truncate pr-4">{previewFile.name}</h4>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto py-4 flex items-center justify-center min-h-[200px]">
              {previewFile.fileType.startsWith('image/') || previewFile.url.startsWith('data:image/') ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-sm"
                />
              ) : (
                <div className="text-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <FileText className="w-16 h-16 text-indigo-400 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-800">{previewFile.name}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Pratinjau dokumen tidak didukung langsung di mobile viewer.</p>
                  <a
                    href={previewFile.url}
                    download={previewFile.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Dokumen</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
