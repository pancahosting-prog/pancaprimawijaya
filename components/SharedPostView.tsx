import React, { useState, useEffect } from 'react';
import { DrivePost } from '../types';
import { supabaseService } from '../services/supabaseService';

interface SharedPostViewProps {
  shareToken: string;
  onBackToApp: () => void;
}

export const SharedPostView: React.FC<SharedPostViewProps> = ({ shareToken, onBackToApp }) => {
  const [post, setPost] = useState<DrivePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; fileType: string } | null>(null);

  useEffect(() => {
    const fetchSharedPost = async () => {
      setLoading(true);
      try {
        const data = await supabaseService.getSharedDrivePost(shareToken);
        if (data) {
          setPost(data);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Gagal mengambil data share:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchSharedPost();
  }, [shareToken]);

  // Format bytes helper
  const formatBytes = (bytes?: number, decimals = 2) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Icon selector helper
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

    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '') || fileType.includes('zip') || fileType.includes('compressed')) {
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

    if (['doc', 'docx', 'txt', 'rtf'].includes(ext || '') || fileType.includes('word') || fileType.includes('text')) {
      return (
        <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      );
    }

    if (['xls', 'xlsx', 'csv'].includes(ext || '') || fileType.includes('excel') || fileType.includes('sheet')) {
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

    return (
      <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 md:p-12 rounded-[40px] shadow-xl w-full max-w-md border border-slate-100 text-center space-y-4">
          <div className="w-12 h-12 border-4 border-zinc-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-black uppercase tracking-widest text-slate-400">Memeriksa Link Berbagi...</p>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 md:p-12 rounded-[40px] shadow-xl w-full max-w-md border border-slate-100 text-center space-y-6">
          <div className="w-20 h-20 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500 shadow-inner">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Link Kedaluwarsa / Tidak Valid</h1>
            <p className="text-xs text-slate-400 mt-2 font-medium">Masa berlaku link temporary ini mungkin telah habis, atau postingan telah ditarik oleh pengirim.</p>
          </div>
          <button
            onClick={onBackToApp}
            className="w-full py-4 bg-zinc-600 hover:bg-zinc-700 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all text-sm uppercase tracking-wider"
          >
            Masuk Ke Aplikasi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col justify-between p-6">
      <div className="w-full max-w-3xl mx-auto my-auto space-y-6">
        {/* Header App */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1 border shadow-sm">
              <img src="https://ahlifumigasi.com/wp-content/uploads/2025/12/logopancaapp.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-md font-black text-slate-800 tracking-tight">MyPanca Drive</h2>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Smart File Sharing</p>
            </div>
          </div>
          <button
            onClick={onBackToApp}
            className="px-4 py-2 bg-indigo-50 hover:bg-zinc-100 text-zinc-600 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
          >
            Masuk MyPanca
          </button>
        </div>

        {/* Post Card */}
        <div className="bg-white p-8 md:p-12 rounded-[40px] shadow-xl border border-slate-100 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-6 border-b border-slate-50">
            <div>
              <span className="px-3 py-1 bg-indigo-50 text-zinc-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                File Dibagikan
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mt-3">
                {post.title}
              </h1>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 shrink-0 self-start sm:self-auto">
              <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center font-black text-zinc-600 text-sm">
                {post.owner_name?.charAt(0) || 'U'}
              </div>
              <div className="text-left">
                <p className="text-xs font-black text-slate-800 leading-none">{post.owner_name}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">Pengirim</p>
              </div>
            </div>
          </div>

          {post.content && (
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Keterangan / Deskripsi</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap font-medium bg-slate-50/50 p-6 rounded-3xl border border-slate-50 leading-relaxed">
                {post.content}
              </p>
            </div>
          )}

          {/* Attachments */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daftar Lampiran ({post.attachments?.length || 0})</p>
            {post.attachments && post.attachments.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {post.attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl border border-slate-100 bg-white shadow-sm hover:border-zinc-100 transition-all"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="p-3 bg-slate-50 rounded-2xl shrink-0">
                        {getFileIcon(file.fileType, file.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-700 truncate leading-tight" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-none">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {/* Lihat/Preview Button */}
                      <button
                        onClick={() => setPreviewFile(file)}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        Lihat
                      </button>

                      {/* Download Button */}
                      <a
                        href={`${file.url}${file.url.includes('?') ? '&' : '?'}ik-attachment=true`}
                        download={file.name}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-600 hover:bg-zinc-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-100 active:scale-95"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Unduh
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-slate-400 uppercase tracking-widest">
                Tidak ada file yang dilampirkan pada postingan ini
              </div>
            )}
          </div>

          {post.share_expires_at && (
            <div className="pt-4 border-t border-slate-50 flex items-center gap-2 text-[10px] font-black uppercase text-amber-600 tracking-wider">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Link sharing ini bersifat sementara dan aktif hingga:{' '}
              {new Date(post.share_expires_at).toLocaleString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}
            </div>
          )}
        </div>
      </div>

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
                href={`${previewFile.url}${previewFile.url.includes('?') ? '&' : '?'}ik-attachment=true`}
                download={previewFile.name}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-600 hover:bg-zinc-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
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
            {previewFile.fileType.startsWith('image/') ? (
              <div className="max-w-full max-h-full overflow-auto flex items-center justify-center">
                <img
                  referrerPolicy="no-referrer"
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-lg border border-slate-800 bg-slate-950"
                />
              </div>
            ) : (
              <div className="w-full h-full relative flex flex-col justify-center items-center">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 z-0">
                  <div className="w-10 h-10 border-4 border-zinc-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black uppercase tracking-wider">Memuat Dokumen via Google Engine...</p>
                </div>
                <iframe
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(previewFile.url)}&embedded=true`}
                  className="w-full h-full border-0 relative z-10 rounded-2xl bg-white"
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

      {/* Footer copyright */}
      <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest py-8">
        MyPanca Smart Task Manager &copy; 2026
      </div>
    </div>
  );
};
