import React, { useState, useEffect } from 'react';
import { QAQuestion, QAAnswer, QAAttachment } from '../../../task/types';
import { supabaseService } from '../../../task/services/supabaseService';
import { 
  HelpCircle, Plus, Search, ArrowLeft, MessageSquare, 
  Trash2, Edit3, X, Paperclip, Send, CheckCircle2, User,
  Clock, Download, Eye, Upload, FileText, Image as ImageIcon,
  Share2, ChevronRight, AlertCircle, CornerDownRight
} from 'lucide-react';

interface PancaQAMobileViewProps {
  currentUser?: {
    username: string;
    role: string;
    nama?: string;
    name?: string;
  } | null;
  onBack?: () => void;
}

const QA_CATEGORIES = [
  'Semua',
  'Sensor & Automation',
  'Teknis & Engineering',
  'Wiring & SLD',
  'Commercial & Budget',
  'SOP & Commissioning',
  'General / Umum'
];

export const PancaQAMobileView: React.FC<PancaQAMobileViewProps> = ({
  currentUser,
  onBack
}) => {
  const [questions, setQuestions] = useState<QAQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [selectedQuestion, setSelectedQuestion] = useState<QAQuestion | null>(null);

  // Modals
  const [isAskModalOpen, setIsAskModalOpen] = useState(false);
  const [isAnswerModalOpen, setIsAnswerModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QAQuestion | null>(null);
  const [editingAnswer, setEditingAnswer] = useState<QAAnswer | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<QAAttachment | null>(null);

  // Form States: New Question
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Sensor & Automation');
  const [newContent, setNewContent] = useState('');
  const [askAttachments, setAskAttachments] = useState<QAAttachment[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Form States: New Answer
  const [answerContent, setAnswerContent] = useState('');
  const [answerAttachments, setAnswerAttachments] = useState<QAAttachment[]>([]);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);

  const activeName = currentUser?.nama || currentUser?.name || currentUser?.username || 'Anggota Tim';
  const activeUsername = currentUser?.username || 'user';
  const userRole = (currentUser?.role || '').toLowerCase();
  const isSuperadmin = userRole === 'superadmin' || activeUsername.toLowerCase() === 'superadmin';

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    setIsLoading(true);
    try {
      const data = await supabaseService.getQAQuestions();
      setQuestions(data || []);
      // If currently viewing a question, keep it synced
      if (selectedQuestion) {
        const found = (data || []).find(q => q.id === selectedQuestion.id);
        if (found) setSelectedQuestion(found);
      }
    } catch (err) {
      console.warn('Error loading QA questions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert File to Base64 Data URL for robust local attachment
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = err => reject(err);
    });
  };

  // ImageKit / Base64 File Uploader
  const uploadAttachment = async (file: File): Promise<QAAttachment> => {
    const envUrl = (import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || '').trim();
    const envPublic = (import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || '').trim();
    const envPrivate = (import.meta.env.VITE_IMAGEKIT_PRIVATE_KEY || '').trim();

    const ikUrl = envUrl || localStorage.getItem('mypanca_imagekit_url') || '';
    const ikPublic = envPublic || localStorage.getItem('mypanca_imagekit_public') || '';
    const ikPrivate = envPrivate || localStorage.getItem('mypanca_imagekit_private') || '';

    let finalUrl = '';

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
        formData.append('folder', '/mypanca_qa');

        const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          finalUrl = result.url;
        }
      } catch (err) {
        console.warn('ImageKit direct upload failed, falling back to base64:', err);
      }
    }

    if (!finalUrl) {
      finalUrl = await fileToBase64(file);
    }

    return {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: file.name,
      url: finalUrl,
      fileType: file.type || file.name.split('.').pop() || 'file',
      size: file.size
    };
  };

  // Submit New Question (Matches Image 1 & 2)
  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      alert('Judul Pertanyaan dan Isi Detail wajib diisi.');
      return;
    }

    const questionItem: QAQuestion = {
      id: `qa_${Date.now()}`,
      title: newTitle.trim(),
      content: newContent.trim(),
      category: newCategory,
      attachments: askAttachments,
      author_username: activeUsername,
      author_name: activeName,
      author_role: userRole || 'engineer',
      created_at: new Date().toISOString(),
      answers: [],
      latest_answer_at: new Date().toISOString()
    };

    const updatedList = await supabaseService.createQAQuestion(questionItem);
    setQuestions(updatedList);
    setSelectedQuestion(questionItem);
    setIsAskModalOpen(false);
    setNewTitle('');
    setNewContent('');
    setNewCategory('Sensor & Automation');
    setAskAttachments([]);
  };

  // Submit New Answer
  const handleCreateAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestion || !answerContent.trim()) return;

    setIsSubmittingAnswer(true);
    try {
      const answerItem: QAAnswer = {
        id: `ans_${Date.now()}`,
        question_id: selectedQuestion.id,
        content: answerContent.trim(),
        attachments: answerAttachments,
        author_username: activeUsername,
        author_name: activeName,
        author_role: userRole || 'engineer',
        created_at: new Date().toISOString()
      };

      const updatedList = await supabaseService.createQAAnswer(answerItem);
      setQuestions(updatedList);
      const updatedQ = updatedList.find(q => q.id === selectedQuestion.id);
      if (updatedQ) setSelectedQuestion(updatedQ);

      setAnswerContent('');
      setAnswerAttachments([]);
      setIsAnswerModalOpen(false);
    } catch (err: any) {
      console.error(err);
      alert('Gagal mengirim jawaban.');
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus pertanyaan ini beserta seluruh jawabannya?')) return;
    const updated = await supabaseService.deleteQAQuestion(questionId);
    setQuestions(updated);
    if (selectedQuestion?.id === questionId) {
      setSelectedQuestion(null);
    }
  };

  // Delete Answer
  const handleDeleteAnswer = async (answerId: string, questionId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus jawaban ini?')) return;
    const updated = await supabaseService.deleteQAAnswer(answerId, questionId);
    setQuestions(updated);
    const updatedQ = updated.find(q => q.id === questionId);
    if (updatedQ) setSelectedQuestion(updatedQ);
  };

  const filteredQuestions = questions.filter(q => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      q.title.toLowerCase().includes(query) ||
      q.content.toLowerCase().includes(query) ||
      (q.author_name && q.author_name.toLowerCase().includes(query)) ||
      (q.author_username && q.author_username.toLowerCase().includes(query));
    const matchesCategory = selectedCategory === 'Semua' || q.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getRoleBadgeStyle = (role: string) => {
    const r = (role || '').toLowerCase();
    if (r === 'superadmin') {
      return 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    }
    if (r === 'engineer') {
      return 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
    if (r === 'sales') {
      return 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    }
    return 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700';
  };

  // ==========================================
  // VIEW: DETAIL PERTANYAAN (Matches Image 3)
  // ==========================================
  if (selectedQuestion) {
    const answers = selectedQuestion.answers || [];
    const isQuestionAuthor = isSuperadmin || selectedQuestion.author_username?.toLowerCase() === activeUsername.toLowerCase();

    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans">
        {/* Top Header */}
        <div className="p-3 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0 shadow-xs">
          <button
            onClick={() => setSelectedQuestion(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Forum</span>
          </button>

          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 uppercase">
            {selectedQuestion.category}
          </span>
        </div>

        {/* Question & Answers Scroll Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3.5">
          {/* Main Question Card (Matches Image 3) */}
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3">
            {/* Author info header */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center font-extrabold text-sm text-slate-700 dark:text-zinc-200 shrink-0">
                  {selectedQuestion.author_name?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                      {selectedQuestion.author_name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      @{selectedQuestion.author_username}
                    </span>
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-sm uppercase border ${getRoleBadgeStyle(selectedQuestion.author_role)}`}>
                      {selectedQuestion.author_role || 'ENGINEER'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Ditanyakan pada: {new Date(selectedQuestion.created_at).toLocaleString('id-ID')}
                  </p>
                </div>
              </div>

              {isQuestionAuthor && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDeleteQuestion(selectedQuestion.id)}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                    title="Hapus Pertanyaan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Question Title & Content */}
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-zinc-50 leading-snug">
                {selectedQuestion.title}
              </h2>
              <div className="mt-2 text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {selectedQuestion.content}
              </div>
            </div>

            {/* Attachments if any */}
            {selectedQuestion.attachments && selectedQuestion.attachments.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Lampiran Berkas ({selectedQuestion.attachments.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedQuestion.attachments.map((att) => (
                    <div
                      key={att.id}
                      onClick={() => setPreviewAttachment(att)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center gap-2 cursor-pointer hover:border-slate-300 dark:hover:border-zinc-600 transition text-[11px] font-semibold text-slate-700 dark:text-zinc-200"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate max-w-[150px]">{att.name}</span>
                      <Eye className="w-3 h-3 text-slate-400 ml-1" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: Jawaban (Matches Image 3) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                <span>Jawaban Solusi ({answers.length})</span>
              </h3>
              <button
                onClick={() => setIsAnswerModalOpen(true)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Beri Jawaban</span>
              </button>
            </div>

            {answers.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 text-center">
                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                  Belum ada jawaban teknis untuk pertanyaan ini.
                </p>
                <button
                  onClick={() => setIsAnswerModalOpen(true)}
                  className="mt-2.5 px-3.5 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-xs"
                >
                  Tulis Jawaban Pertama
                </button>
              </div>
            ) : (
              answers.map((ans, idx) => {
                const isAnswerAuthor = isSuperadmin || ans.author_username?.toLowerCase() === activeUsername.toLowerCase();
                const isFirst = idx === 0;

                return (
                  <div
                    key={ans.id}
                    className={`p-3.5 rounded-2xl border shadow-xs space-y-2.5 ${
                      isFirst 
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60' 
                        : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 dark:border-zinc-800 pb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span className="text-[11px] font-extrabold uppercase text-slate-800 dark:text-zinc-100">
                          {isFirst ? 'Jawaban Terbaru Dari' : 'Jawaban Dari'} {ans.author_name} ({ans.author_role || 'ENGINEER'})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-slate-400">
                          {new Date(ans.created_at).toLocaleString('id-ID')}
                        </span>
                        {isAnswerAuthor && (
                          <button
                            onClick={() => handleDeleteAnswer(ans.id, selectedQuestion.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 transition"
                            title="Hapus Jawaban"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {ans.content}
                    </div>

                    {ans.attachments && ans.attachments.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-800 flex flex-wrap gap-2">
                        {ans.attachments.map(att => (
                          <button
                            key={att.id}
                            onClick={() => setPreviewAttachment(att)}
                            className="px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center gap-1.5 text-[10px] font-bold text-slate-700 dark:text-zinc-200"
                          >
                            <Paperclip className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[120px]">{att.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bottom Quick Reply Input */}
        <div className="p-3 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 shrink-0 shadow-lg">
          <button
            onClick={() => setIsAnswerModalOpen(true)}
            className="w-full py-2.5 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Tulis Jawaban Solusi Teknis</span>
          </button>
        </div>

        {/* Modal Tulis Jawaban */}
        {isAnswerModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-5 overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                <h3 className="text-sm font-extrabold uppercase text-slate-900 dark:text-zinc-100">
                  Tulis Jawaban Solusi
                </h3>
                <button
                  onClick={() => setIsAnswerModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateAnswer} className="space-y-3.5 mt-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Isi Jawaban & Penjelasan Teknis
                  </label>
                  <textarea
                    rows={5}
                    required
                    placeholder="Tuliskan solusi teknis, tahapan perbaikan, parameter setting, atau penjelasan..."
                    value={answerContent}
                    onChange={(e) => setAnswerContent(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition resize-none"
                  />
                </div>

                {/* File Attachment */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                    Lampirkan Berkas / Gambar (Opsional)
                  </label>
                  <label className="border border-dashed border-slate-200 dark:border-zinc-700 hover:border-slate-400 rounded-xl p-2.5 flex items-center justify-center gap-2 cursor-pointer bg-slate-50 dark:bg-zinc-800/40 transition text-xs font-bold text-slate-600 dark:text-zinc-300">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span>Pilih Berkas Lampiran</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={async (e) => {
                        if (e.target.files && e.target.files[0]) {
                          try {
                            const att = await uploadAttachment(e.target.files[0]);
                            setAnswerAttachments(prev => [...prev, att]);
                          } catch (err: any) {
                            alert(err.message || 'Gagal mengunggah file.');
                          }
                        }
                      }}
                    />
                  </label>

                  {answerAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {answerAttachments.map((att, i) => (
                        <div key={i} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-[10px] font-semibold flex items-center gap-1.5">
                          <span className="truncate max-w-[120px]">{att.name}</span>
                          <button
                            type="button"
                            onClick={() => setAnswerAttachments(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-rose-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAnswerModalOpen(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-xs rounded-xl transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAnswer || !answerContent.trim()}
                    className="flex-1 py-2.5 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50"
                  >
                    {isSubmittingAnswer ? 'Mengirim...' : 'Kirim Jawaban'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Attachment Preview Modal */}
        {previewAttachment && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
            <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
              <div className="p-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate pr-2">
                  {previewAttachment.name}
                </h4>
                <button
                  onClick={() => setPreviewAttachment(null)}
                  className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-[300px] overflow-auto p-3 flex items-center justify-center bg-slate-100 dark:bg-zinc-950">
                {previewAttachment.fileType.includes('image') || previewAttachment.url.startsWith('data:image') || ['jpg', 'jpeg', 'png', 'webp'].some(ext => previewAttachment.url.toLowerCase().includes(ext)) ? (
                  <img src={previewAttachment.url} alt={previewAttachment.name} className="max-w-full max-h-[60vh] object-contain rounded-xl" />
                ) : (
                  <iframe src={previewAttachment.url} title={previewAttachment.name} className="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-zinc-800" />
                )}
              </div>
              <div className="p-3 border-t border-slate-200 dark:border-zinc-800 flex justify-end">
                <a
                  href={previewAttachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={previewAttachment.name}
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
  }

  // ==========================================
  // VIEW: MAIN Q&A LIST VIEW
  // ==========================================
  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 font-sans">
      {/* Top Search & Ask Bar */}
      <div className="p-3 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Cari pertanyaan, topik, engineer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
          />
        </div>

        <button
          onClick={() => setIsAskModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-xs transition active:scale-95 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tanya Baru</span>
        </button>
      </div>

      {/* Category Filter Chips (Matches Image 2) */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 text-[11px]">
        {QA_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap font-bold transition shrink-0 ${
              selectedCategory === cat
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-zinc-900 text-slate-500 border border-slate-200 dark:border-zinc-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Question List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">
            <HelpCircle className="w-8 h-8 mx-auto animate-pulse text-slate-300 dark:text-zinc-700 mb-2" />
            <p className="text-xs font-semibold">Memuat Database Q&A...</p>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="text-center py-16 px-4">
            <HelpCircle className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-2 stroke-[1.5]" />
            <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">Belum ada topik tanya jawab</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Ketuk tombol "Tanya Baru" untuk mengajukan pertanyaan teknis ke seluruh tim.</p>
          </div>
        ) : (
          filteredQuestions.map((q) => {
            const answerCount = q.answers?.length || 0;
            const hasAttachments = q.attachments && q.attachments.length > 0;

            return (
              <div
                key={q.id}
                onClick={() => setSelectedQuestion(q)}
                className="bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition cursor-pointer active:scale-[0.99] space-y-2.5"
              >
                {/* Card Top: Category & Author Badge */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 uppercase">
                    {q.category}
                  </span>
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-sm uppercase border ${getRoleBadgeStyle(q.author_role)}`}>
                    {q.author_role || 'ENGINEER'}
                  </span>
                </div>

                <div>
                  <h3 className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 line-clamp-2 leading-snug">
                    {q.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                    {q.content}
                  </p>
                </div>

                {/* Card Bottom Meta */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-[10px] text-slate-400 font-semibold">
                  <div className="flex items-center gap-2 truncate max-w-[170px]">
                    <span className="text-slate-700 dark:text-zinc-300 font-bold truncate">
                      {q.author_name}
                    </span>
                    <span>•</span>
                    <span>{new Date(q.created_at).toLocaleDateString('id-ID')}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {hasAttachments && (
                      <span className="flex items-center gap-0.5 text-slate-500">
                        <Paperclip className="w-3 h-3" />
                        {q.attachments?.length}
                      </span>
                    )}
                    <span className={`flex items-center gap-1 font-bold ${
                      answerCount > 0 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      <MessageSquare className="w-3 h-3" />
                      {answerCount > 0 ? `${answerCount} Jawaban` : 'Belum dijawab'}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Ajukan Pertanyaan Baru (Matches Image 1 & 2) */}
      {isAskModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-5 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800 shrink-0">
              <div>
                <h3 className="text-sm font-extrabold uppercase text-slate-900 dark:text-zinc-100">
                  Ajukan Pertanyaan ke Tim PT Panca
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Forum Q&A Engineering & Troubleshooting
                </p>
              </div>
              <button
                onClick={() => setIsAskModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuestion} className="space-y-3.5 mt-4 overflow-y-auto pr-1">
              {/* Judul Pertanyaan / Topik */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  Judul Pertanyaan / Topik
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Cara kalibrasi threshold accelerometer gempa..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                />
              </div>

              {/* Kategori Topik (Matches Image 2 Dropdown) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  Kategori Topik
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                >
                  <option value="Sensor & Automation">Sensor & Automation</option>
                  <option value="Teknis & Engineering">Teknis & Engineering</option>
                  <option value="Wiring & SLD">Wiring & SLD</option>
                  <option value="Commercial & Budget">Commercial & Budget</option>
                  <option value="SOP & Commissioning">SOP & Commissioning</option>
                  <option value="General / Umum">General / Umum</option>
                </select>
              </div>

              {/* Isi Detail Pertanyaan */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  Isi Detail Pertanyaan (Enter & Teks Tempel Rapi)
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Jelaskan kronologi kendala, setting yang digunakan, atau detail pertanyaan..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition resize-none"
                />
              </div>

              {/* Lampirkan Gambar / Berkas */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1">
                  Lampirkan Gambar / Berkas (ImageKit Proxy)
                </label>
                <label className="border border-dashed border-slate-200 dark:border-zinc-700 hover:border-slate-400 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer bg-slate-50 dark:bg-zinc-800/40 transition text-xs font-bold text-slate-600 dark:text-zinc-300">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>{isUploadingFile ? 'Mengunggah...' : 'Pilih Gambar/File'}</span>
                  <input
                    type="file"
                    disabled={isUploadingFile}
                    className="hidden"
                    onChange={async (e) => {
                      if (e.target.files && e.target.files[0]) {
                        setIsUploadingFile(true);
                        try {
                          const att = await uploadAttachment(e.target.files[0]);
                          setAskAttachments(prev => [...prev, att]);
                        } catch (err: any) {
                          alert(err.message || 'Gagal mengunggah berkas.');
                        } finally {
                          setIsUploadingFile(false);
                        }
                      }
                    }}
                  />
                </label>

                {askAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {askAttachments.map((att, i) => (
                      <div key={i} className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-zinc-800 text-[10px] font-semibold flex items-center gap-1.5">
                        <Paperclip className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[140px]">{att.name}</span>
                        <button
                          type="button"
                          onClick={() => setAskAttachments(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-rose-500 hover:text-rose-700 p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAskModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold text-xs rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || !newContent.trim() || isUploadingFile}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50"
                >
                  Terbitkan Pertanyaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
