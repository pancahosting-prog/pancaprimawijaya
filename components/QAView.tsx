import React, { useState, useMemo } from 'react';
import { QAQuestion, QAAnswer, QAAttachment } from '../types';
import { getProxiedUrl, isImageFile, isPdfFile, handleImageError } from '../services/proxyService';

interface QAViewProps {
  currentUser: {
    username: string;
    role: string;
    name: string;
  };
  questions: QAQuestion[];
  onCreateQuestion: (question: QAQuestion) => Promise<void>;
  onUpdateQuestion?: (question: QAQuestion) => Promise<void>;
  onCreateAnswer: (answer: QAAnswer) => Promise<void>;
  onUpdateAnswer?: (answer: QAAnswer) => Promise<void>;
  onDeleteQuestion?: (questionId: string) => Promise<void>;
  onDeleteAnswer?: (answerId: string, questionId: string) => Promise<void>;
}

export const QAView: React.FC<QAViewProps> = ({
  currentUser,
  questions,
  onCreateQuestion,
  onUpdateQuestion,
  onCreateAnswer,
  onUpdateAnswer,
  onDeleteQuestion,
  onDeleteAnswer
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');

  // Modals & Active View States
  const [isAskModalOpen, setIsAskModalOpen] = useState(false);
  const [isAnswerModalOpen, setIsAnswerModalOpen] = useState(false);
  const [isEditQuestionModalOpen, setIsEditQuestionModalOpen] = useState(false);
  const [isEditAnswerModalOpen, setIsEditAnswerModalOpen] = useState(false);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  const [selectedQuestion, setSelectedQuestion] = useState<QAQuestion | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<QAQuestion | null>(null);
  const [editingAnswer, setEditingAnswer] = useState<QAAnswer | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<QAAttachment | null>(null);

  // Ask Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Sensor & Automation');
  const [newContent, setNewContent] = useState('');
  const [askAttachments, setAskAttachments] = useState<QAAttachment[]>([]);
  const [isUploadingAskFile, setIsUploadingAskFile] = useState(false);
  const [askUploadError, setAskUploadError] = useState('');
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);

  // Edit Question Form State
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('Sensor & Automation');
  const [editContent, setEditContent] = useState('');
  const [editAttachments, setEditAttachments] = useState<QAAttachment[]>([]);
  const [isUploadingEditQuestionFile, setIsUploadingEditQuestionFile] = useState(false);
  const [editQuestionUploadError, setEditQuestionUploadError] = useState('');

  // Answer Form State
  const [answerContent, setAnswerContent] = useState('');
  const [answerAttachments, setAnswerAttachments] = useState<QAAttachment[]>([]);
  const [isUploadingAnswerFile, setIsUploadingAnswerFile] = useState(false);
  const [answerUploadError, setAnswerUploadError] = useState('');

  // Edit Answer Form State
  const [editAnswerContent, setEditAnswerContent] = useState('');
  const [editAnswerAttachments, setEditAnswerAttachments] = useState<QAAttachment[]>([]);
  const [isUploadingEditAnswerFile, setIsUploadingEditAnswerFile] = useState(false);
  const [editAnswerUploadError, setEditAnswerUploadError] = useState('');

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
    formData.append('folder', '/mypanca_qa');

    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr;
      try { parsedErr = JSON.parse(errText); } catch (e) {}
      throw new Error(parsedErr?.message || `Upload ImageKit Gagal (${response.status})`);
    }

    const result = await response.json();
    return {
      url: result.url,
      fileId: result.fileId,
      size: result.size || file.size,
    };
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'ask' | 'answer' | 'editQuestion' | 'editAnswer'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (target === 'ask') {
      setIsUploadingAskFile(true);
      setAskUploadError('');
    } else if (target === 'answer') {
      setIsUploadingAnswerFile(true);
      setAnswerUploadError('');
    } else if (target === 'editQuestion') {
      setIsUploadingEditQuestionFile(true);
      setEditQuestionUploadError('');
    } else {
      setIsUploadingEditAnswerFile(true);
      setEditAnswerUploadError('');
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await uploadToImageKit(file);
        const fileType = file.type.startsWith('image/')
          ? 'img'
          : file.type.includes('pdf')
          ? 'pdf'
          : 'file';

        const item: QAAttachment = {
          id: `att_${Date.now()}_${i}`,
          name: file.name,
          url: res.url,
          fileType,
          size: res.size
        };

        if (target === 'ask') {
          setAskAttachments(prev => [...prev, item]);
        } else if (target === 'answer') {
          setAnswerAttachments(prev => [...prev, item]);
        } else if (target === 'editQuestion') {
          setEditAttachments(prev => [...prev, item]);
        } else {
          setEditAnswerAttachments(prev => [...prev, item]);
        }
      }
    } catch (err: any) {
      const msg = err.message || 'Gagal mengunggah berkas.';
      if (target === 'ask') setAskUploadError(msg);
      else if (target === 'answer') setAnswerUploadError(msg);
      else if (target === 'editQuestion') setEditQuestionUploadError(msg);
      else setEditAnswerUploadError(msg);
    } finally {
      if (target === 'ask') setIsUploadingAskFile(false);
      else if (target === 'answer') setIsUploadingAnswerFile(false);
      else if (target === 'editQuestion') setIsUploadingEditQuestionFile(false);
      else setIsUploadingEditAnswerFile(false);
      e.target.value = '';
    }
  };

  // Handlers for Question
  const handleOpenAskModal = () => {
    setNewTitle('');
    setNewCategory('Sensor & Automation');
    setNewContent('');
    setAskAttachments([]);
    setAskUploadError('');
    setIsAskModalOpen(true);
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim() || isSubmittingQuestion) return;

    setIsSubmittingQuestion(true);
    try {
      const questionItem: QAQuestion = {
        id: `qa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: newTitle.trim(),
        category: newCategory,
        content: newContent.trim(),
        attachments: askAttachments,
        author_username: currentUser.username,
        author_name: currentUser.name,
        author_role: currentUser.role,
        created_at: new Date().toISOString(),
        answers: [],
        latest_answer_at: new Date().toISOString()
      };

      await onCreateQuestion(questionItem);
      setNewTitle('');
      setNewContent('');
      setAskAttachments([]);
      setAskUploadError('');
      setIsAskModalOpen(false);
    } catch (err: any) {
      console.error('Gagal membuat pertanyaan:', err);
      setAskUploadError(err.message || 'Gagal menyimpan pertanyaan. Silakan coba lagi.');
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const handleOpenEditQuestion = (q: QAQuestion) => {
    setEditingQuestion(q);
    setEditTitle(q.title);
    setEditCategory(q.category || 'Sensor & Automation');
    setEditContent(q.content);
    setEditAttachments(q.attachments || []);
    setIsEditQuestionModalOpen(true);
  };

  const handleSaveEditQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !editTitle.trim() || !editContent.trim()) return;

    const updatedQuestion: QAQuestion = {
      ...editingQuestion,
      title: editTitle.trim(),
      category: editCategory,
      content: editContent.trim(),
      attachments: editAttachments,
    };

    if (onUpdateQuestion) {
      await onUpdateQuestion(updatedQuestion);
    }
    setIsEditQuestionModalOpen(false);
    setEditingQuestion(null);
  };

  // Handlers for Answer
  const handleCreateAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestion || !answerContent.trim()) return;

    const answerItem: QAAnswer = {
      id: `ans_${Date.now()}`,
      question_id: selectedQuestion.id,
      content: answerContent.trim(),
      attachments: answerAttachments,
      author_username: currentUser.username,
      author_name: currentUser.name,
      author_role: currentUser.role,
      created_at: new Date().toISOString()
    };

    await onCreateAnswer(answerItem);

    setIsAnswerModalOpen(false);
    setAnswerContent('');
    setAnswerAttachments([]);
  };

  const handleOpenEditAnswer = (ans: QAAnswer) => {
    setEditingAnswer(ans);
    setEditAnswerContent(ans.content);
    setEditAnswerAttachments(ans.attachments || []);
    setIsEditAnswerModalOpen(true);
  };

  const handleSaveEditAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnswer || !editAnswerContent.trim()) return;

    const updatedAnswer: QAAnswer = {
      ...editingAnswer,
      content: editAnswerContent.trim(),
      attachments: editAnswerAttachments
    };

    if (onUpdateAnswer) {
      await onUpdateAnswer(updatedAnswer);
    }
    setIsEditAnswerModalOpen(false);
    setEditingAnswer(null);
  };

  const categories = [
    'Semua',
    'Sensor & Automation',
    'Teknis & Engineering',
    'Wiring & SLD',
    'Commercial & Budget',
    'SOP & Commissioning',
    'General / Umum'
  ];

  // Strictly deduplicate questions by ID to guarantee no duplicates
  const uniqueQuestions = useMemo(() => {
    const map = new Map<string, QAQuestion>();
    for (const q of questions) {
      if (!map.has(q.id)) {
        map.set(q.id, q);
      }
    }
    return Array.from(map.values());
  }, [questions]);

  const filteredQuestions = uniqueQuestions.filter(q => {
    const matchesSearch =
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.author_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.answers || []).some(a => a.content.toLowerCase().includes(searchQuery.toLowerCase()) || a.author_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'Semua' || q.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getRoleBadgeStyle = (role: string) => {
    const r = (role || '').toLowerCase();
    if (r === 'superadmin') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300';
    if (r === 'engineer' || r.includes('engineer')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
    if (r === 'commercial') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
    if (r === 'finance') return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  };

  const canEditOrDeleteQuestion = (q: QAQuestion) => {
    return currentUser.role === 'superadmin' || currentUser.username === q.author_username;
  };

  const canEditOrDeleteAnswer = (ans: QAAnswer) => {
    return currentUser.role === 'superadmin' || currentUser.username === ans.author_username;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-8 animate-fade-in text-slate-800 dark:text-slate-100 w-full max-w-full overflow-hidden box-border">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 lg:p-8 rounded-[32px] text-white shadow-xl relative overflow-hidden w-full max-w-full">
        <div className="space-y-2 z-10 max-w-2xl min-w-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-500/30 text-zinc-200 text-[10px] font-black uppercase tracking-widest border border-zinc-400/30">
            <span>💬 Forum Diskusi & Knowledge Base PT Panca</span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight leading-tight">Q&A Engineering & Project Forum</h2>
          <p className="text-sm text-zinc-200 leading-relaxed">
            Ajukan pertanyaan teknis, kendala lapangan, atau konfigurasi sistem. Setiap pertanyaan dan jawaban dapat diedit atau dihapus oleh pemiliknya atau Superadmin.
          </p>
        </div>
        <button
          onClick={handleOpenAskModal}
          className="z-10 px-6 py-3.5 sm:px-8 sm:py-4 bg-zinc-500 hover:bg-zinc-400 text-white font-black rounded-2xl shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-95 flex items-center gap-2.5 shrink-0 text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          <span>Buat Pertanyaan Baru</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between w-full max-w-full min-w-0">
        <div className="relative w-full lg:w-96 shrink-0 min-w-0">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            type="text"
            placeholder="Cari pertanyaan, kendala, atau nama engineer..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-bold outline-none focus:border-zinc-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full lg:w-auto no-scrollbar py-1 max-w-full shrink min-w-0">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                selectedCategory === cat
                  ? 'bg-zinc-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Question Cards List */}
      <div className="space-y-6 w-full max-w-full min-w-0">
        {filteredQuestions.length === 0 ? (
          <div className="p-12 sm:p-16 text-center bg-slate-50 dark:bg-slate-950 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[32px] w-full max-w-full">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">Belum ada diskusi Q&A ditemukan</p>
            <p className="text-slate-500 text-sm">Klik tombol "Buat Pertanyaan Baru" untuk memulai diskusi pertanyaan teknis.</p>
          </div>
        ) : (
          filteredQuestions.map(q => {
            const answersList = q.answers || [];
            const latestAnswer = answersList.length > 0 ? answersList[0] : null;
            const isExpanded = expandedQuestionId === q.id;

            return (
              <div
                key={q.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-5 sm:p-6 lg:p-8 shadow-sm hover:shadow-md transition-all space-y-6 w-full max-w-full overflow-hidden min-w-0"
              >
                {/* Question Header & Author Details */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800 w-full min-w-0">
                  <div className="flex items-center gap-3 min-w-0 max-w-full">
                    <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300 font-black flex items-center justify-center text-sm shadow-sm shrink-0">
                      {q.author_name ? q.author_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800 dark:text-white text-sm truncate max-w-[150px] sm:max-w-xs">{q.author_name}</span>
                        <span className="text-xs text-slate-400">@{q.author_username}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${getRoleBadgeStyle(q.author_role)}`}>
                          {q.author_role}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold">
                        Ditanyakan pada: {new Date(q.created_at).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/50 text-zinc-600 dark:text-zinc-400 font-black text-[10px] uppercase tracking-wider rounded-lg border border-zinc-100 dark:border-zinc-900/50">
                      {q.category}
                    </span>

                    {/* Edit & Delete Question Action Buttons */}
                    {canEditOrDeleteQuestion(q) && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditQuestion(q)}
                          className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                          title="Edit Pertanyaan"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          <span>Edit</span>
                        </button>

                        {onDeleteQuestion && (
                          <button
                            onClick={() => onDeleteQuestion(q.id)}
                            className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                            title="Hapus Pertanyaan"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Question Body (Preserves Line Breaks / Enters perfectly) */}
                <div className="space-y-3 min-w-0 max-w-full">
                  <h3 className="text-xl font-black text-slate-900 dark:text-white leading-snug break-words max-w-full">
                    {q.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 font-medium whitespace-pre-wrap break-words max-w-full leading-relaxed overflow-hidden">
                    {q.content}
                  </p>
                </div>

                {/* Question Attachments */}
                {q.attachments && q.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    {q.attachments.map(att => {
                      const isImg = isImageFile(att.fileType, att.name || att.url);
                      return isImg ? (
                        <button
                          key={att.id}
                          onClick={() => setPreviewAttachment(att)}
                          className="group relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 h-32 w-48 shadow-xs hover:border-zinc-500 transition-all text-left shrink-0 active:scale-98"
                        >
                          <img
                            src={getProxiedUrl(att.url)}
                            alt={att.name}
                            onError={(e) => handleImageError(e, att.url)}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent p-2.5 flex flex-col justify-end">
                            <span className="text-[10px] font-bold text-white truncate drop-shadow-xs">{att.name}</span>
                          </div>
                        </button>
                      ) : (
                        <button
                          key={att.id}
                          onClick={() => setPreviewAttachment(att)}
                          className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold hover:border-zinc-500 transition-all"
                        >
                          <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                          <span className="truncate max-w-[180px]">{att.name}</span>
                          <span className="text-[10px] text-zinc-600 font-bold uppercase">(Lihat)</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Latest Answer Preview Banner */}
                {latestAnswer ? (
                  <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 rounded-2xl p-4 sm:p-5 space-y-3 min-w-0 max-w-full overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-amber-200/50 dark:border-amber-900/30 min-w-0 max-w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse shrink-0"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-900 dark:text-amber-300 truncate">
                          Jawaban Terbaru dari {latestAnswer.author_name} ({latestAnswer.author_role})
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-bold text-amber-700/80 dark:text-amber-400">
                          {new Date(latestAnswer.created_at).toLocaleString('id-ID')}
                        </span>

                        {canEditOrDeleteAnswer(latestAnswer) && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditAnswer(latestAnswer)}
                              className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded-lg text-[10px] font-bold transition-all"
                              title="Edit Jawaban"
                            >
                              Edit
                            </button>
                            {onDeleteAnswer && (
                              <button
                                onClick={() => onDeleteAnswer(latestAnswer.id, q.id)}
                                className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/60 text-rose-700 dark:text-rose-200 rounded-lg text-[10px] font-bold transition-all"
                                title="Hapus Jawaban"
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-sm font-medium text-amber-950 dark:text-amber-100 whitespace-pre-wrap break-words max-w-full leading-relaxed overflow-hidden">
                      {latestAnswer.content}
                    </p>

                    {latestAnswer.attachments && latestAnswer.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2.5 pt-1 max-w-full">
                        {latestAnswer.attachments.map(att => {
                          const isImg = isImageFile(att.fileType, att.name || att.url);
                          return isImg ? (
                            <button
                              key={att.id}
                              onClick={() => setPreviewAttachment(att)}
                              className="group relative rounded-xl overflow-hidden border border-amber-200 dark:border-amber-900/50 bg-slate-900 h-24 w-36 shadow-xs hover:border-amber-500 transition-all shrink-0 active:scale-98"
                            >
                              <img
                                src={getProxiedUrl(att.url)}
                                alt={att.name}
                                onError={(e) => handleImageError(e, att.url)}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent p-2 flex flex-col justify-end">
                                <span className="text-[9px] font-bold text-white truncate">{att.name}</span>
                              </div>
                            </button>
                          ) : (
                            <button
                              key={att.id}
                              onClick={() => setPreviewAttachment(att)}
                              className="px-3 py-1 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-100 transition-all flex items-center gap-1.5 max-w-full"
                            >
                              <span className="truncate max-w-[200px]">📎 {att.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl text-center text-xs font-bold text-slate-400 w-full">
                    Belum ada jawaban untuk pertanyaan ini. Jadilah yang pertama memberikan jawaban!
                  </div>
                )}

                {/* Expanded All Answers List */}
                {isExpanded && answersList.length > 1 && (
                  <div className="pt-4 space-y-4 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Semua Jawaban ({answersList.length})</h4>
                    <div className="space-y-3">
                      {answersList.slice(1).map(ans => (
                        <div key={ans.id} className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-800 dark:text-white">{ans.author_name}</span>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${getRoleBadgeStyle(ans.author_role)}`}>
                                {ans.author_role}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">{new Date(ans.created_at).toLocaleString('id-ID')}</span>
                              {canEditOrDeleteAnswer(ans) && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleOpenEditAnswer(ans)}
                                    className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[9px] font-bold"
                                  >
                                    Edit
                                  </button>
                                  {onDeleteAnswer && (
                                    <button
                                      onClick={() => onDeleteAnswer(ans.id, q.id)}
                                      className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded text-[9px] font-bold"
                                    >
                                      Hapus
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{ans.content}</p>
                          {ans.attachments && ans.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {ans.attachments.map(att => {
                                const isImg = isImageFile(att.fileType, att.name || att.url);
                                return isImg ? (
                                  <button
                                    key={att.id}
                                    onClick={() => setPreviewAttachment(att)}
                                    className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 h-20 w-28 shadow-xs hover:border-zinc-500 transition-all shrink-0 active:scale-98"
                                  >
                                    <img
                                      src={getProxiedUrl(att.url)}
                                      alt={att.name}
                                      onError={(e) => handleImageError(e, att.url)}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent p-1.5 flex flex-col justify-end">
                                      <span className="text-[8px] font-bold text-white truncate">{att.name}</span>
                                    </div>
                                  </button>
                                ) : (
                                  <button
                                    key={att.id}
                                    onClick={() => setPreviewAttachment(att)}
                                    className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-300"
                                  >
                                    📎 {att.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer Action Buttons */}
                <div className="flex justify-between items-center pt-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400">
                      💬 {answersList.length} Total Jawaban
                    </span>
                    {answersList.length > 1 && (
                      <button
                        onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                        className="text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:underline"
                      >
                        {isExpanded ? 'Sembunyikan Jawaban Lain' : `Lihat Semua (${answersList.length})`}
                      </button>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setSelectedQuestion(q);
                        setIsAnswerModalOpen(true);
                      }}
                      className="px-5 py-2.5 bg-zinc-600 hover:bg-zinc-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span>Jawab Pertanyaan</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Ask Question */}
      {isAskModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
            <form onSubmit={handleCreateQuestion} className="flex flex-col h-full overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-wider text-slate-800 dark:text-white">Buat Pertanyaan Diskusi Baru</h3>
                  <p className="text-xs text-slate-400">Ajukan ke seluruh tim engineer PT Panca</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAskModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto flex-1 no-scrollbar">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Judul Pertanyaan / Topik</label>
                  <input
                    required
                    type="text"
                    placeholder="Contoh: Cara kalibrasi threshold accelerometer gempa..."
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white focus:border-zinc-500 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Kategori Topik</label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white focus:border-zinc-500 transition-all"
                  >
                    <option value="Sensor & Automation">Sensor & Automation</option>
                    <option value="Teknis & Engineering">Teknis & Engineering</option>
                    <option value="Wiring & SLD">Wiring & SLD</option>
                    <option value="Commercial & Budget">Commercial & Budget</option>
                    <option value="SOP & Commissioning">SOP & Commissioning</option>
                    <option value="General / Umum">General / Umum</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Isi Detail Pertanyaan (Enter & Teks Tempel Rapi)</label>
                  <textarea
                    required
                    rows={5}
                    placeholder="Jelaskan kronologi kendala, setting yang digunakan, atau detail pertanyaan..."
                    value={newContent}
                    onChange={e => setNewContent(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white focus:border-zinc-500 transition-all whitespace-pre-wrap break-words"
                  />
                </div>

                {/* Upload Image / File via ImageKit */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Lampirkan Gambar / Berkas (ImageKit Proxy)</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-3 bg-indigo-50 dark:bg-indigo-950/50 text-zinc-600 dark:text-zinc-300 font-bold text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 transition-all flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span>{isUploadingAskFile ? 'Mengunggah ke ImageKit...' : 'Pilih Gambar/File'}</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={e => handleFileUpload(e, 'ask')}
                        disabled={isUploadingAskFile}
                      />
                    </label>
                  </div>
                  {askUploadError && <p className="text-xs font-bold text-rose-500">{askUploadError}</p>}

                  {askAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {askAttachments.map(att => (
                        <div key={att.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
                          <span>📄 {att.name}</span>
                          <button
                            type="button"
                            onClick={() => setAskAttachments(prev => prev.filter(x => x.id !== att.id))}
                            className="text-rose-500 hover:text-rose-700 font-black ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAskModalOpen(false)}
                  className="w-1/3 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-2xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploadingAskFile || isSubmittingQuestion}
                  className="w-2/3 py-3.5 bg-zinc-600 hover:bg-zinc-700 text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingQuestion ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Kirim Pertanyaan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Question */}
      {isEditQuestionModalOpen && editingQuestion && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
            <form onSubmit={handleSaveEditQuestion} className="flex flex-col h-full overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-wider text-slate-800 dark:text-white">Edit Pertanyaan</h3>
                  <p className="text-xs text-slate-400">Perbarui judul, kategori, detail, atau berkas pertanyaan</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditQuestionModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto flex-1 no-scrollbar">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Judul Pertanyaan / Topik</label>
                  <input
                    required
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white focus:border-zinc-500 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Kategori Topik</label>
                  <select
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white focus:border-zinc-500 transition-all"
                  >
                    <option value="Sensor & Automation">Sensor & Automation</option>
                    <option value="Teknis & Engineering">Teknis & Engineering</option>
                    <option value="Wiring & SLD">Wiring & SLD</option>
                    <option value="Commercial & Budget">Commercial & Budget</option>
                    <option value="SOP & Commissioning">SOP & Commissioning</option>
                    <option value="General / Umum">General / Umum</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Isi Detail Pertanyaan</label>
                  <textarea
                    required
                    rows={5}
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white focus:border-zinc-500 transition-all whitespace-pre-wrap break-words"
                  />
                </div>

                {/* Upload Image / File for Edit Question */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tambah / Kelola Berkas (ImageKit Proxy)</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-3 bg-indigo-50 dark:bg-indigo-950/50 text-zinc-600 dark:text-zinc-300 font-bold text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 transition-all flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span>{isUploadingEditQuestionFile ? 'Mengunggah ke ImageKit...' : 'Pilih Gambar/File'}</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={e => handleFileUpload(e, 'editQuestion')}
                        disabled={isUploadingEditQuestionFile}
                      />
                    </label>
                  </div>
                  {editQuestionUploadError && <p className="text-xs font-bold text-rose-500">{editQuestionUploadError}</p>}

                  {editAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {editAttachments.map(att => (
                        <div key={att.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
                          <span>📄 {att.name}</span>
                          <button
                            type="button"
                            onClick={() => setEditAttachments(prev => prev.filter(x => x.id !== att.id))}
                            className="text-rose-500 hover:text-rose-700 font-black ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditQuestionModalOpen(false)}
                  className="w-1/3 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-2xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploadingEditQuestionFile}
                  className="w-2/3 py-3.5 bg-zinc-600 hover:bg-zinc-700 text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Answer Question */}
      {isAnswerModalOpen && selectedQuestion && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
            <form onSubmit={handleCreateAnswer} className="flex flex-col h-full overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-wider text-slate-800 dark:text-white">Beri Jawaban / Solusi</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 font-bold truncate max-w-md">Topik: {selectedQuestion.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAnswerModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto flex-1 no-scrollbar">
                {/* Question Context */}
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-black text-slate-400 uppercase mb-1">Pertanyaan dari {selectedQuestion.author_name}:</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{selectedQuestion.content}</p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Isi Jawaban Lengkap (Support Enter & Teks Tempel)</label>
                  <textarea
                    required
                    rows={6}
                    placeholder="Tuliskan solusi langkah-demi-langkah, setting threshold, atau penjelasan teknis..."
                    value={answerContent}
                    onChange={e => setAnswerContent(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white focus:border-zinc-500 transition-all whitespace-pre-wrap break-words"
                  />
                </div>

                {/* Upload Image / File for Answer */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Lampirkan Gambar / Dokumentasi Pendukung</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-3 bg-indigo-50 dark:bg-indigo-950/50 text-zinc-600 dark:text-zinc-300 font-bold text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 transition-all flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span>{isUploadingAnswerFile ? 'Mengunggah ke ImageKit...' : 'Pilih Gambar/File'}</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={e => handleFileUpload(e, 'answer')}
                        disabled={isUploadingAnswerFile}
                      />
                    </label>
                  </div>
                  {answerUploadError && <p className="text-xs font-bold text-rose-500">{answerUploadError}</p>}

                  {answerAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {answerAttachments.map(att => (
                        <div key={att.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
                          <span>📎 {att.name}</span>
                          <button
                            type="button"
                            onClick={() => setAnswerAttachments(prev => prev.filter(x => x.id !== att.id))}
                            className="text-rose-500 hover:text-rose-700 font-black ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAnswerModalOpen(false)}
                  className="w-1/3 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-2xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploadingAnswerFile}
                  className="w-2/3 py-3.5 bg-zinc-600 hover:bg-zinc-700 text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  Kirim Jawaban
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Answer */}
      {isEditAnswerModalOpen && editingAnswer && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
            <form onSubmit={handleSaveEditAnswer} className="flex flex-col h-full overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-wider text-slate-800 dark:text-white">Edit Jawaban</h3>
                  <p className="text-xs text-slate-400">Perbarui isi jawaban atau lampiran berkas</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditAnswerModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto flex-1 no-scrollbar">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Isi Jawaban Lengkap</label>
                  <textarea
                    required
                    rows={6}
                    value={editAnswerContent}
                    onChange={e => setEditAnswerContent(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none font-bold text-sm text-slate-800 dark:text-white focus:border-zinc-500 transition-all whitespace-pre-wrap break-words"
                  />
                </div>

                {/* Upload Image / File for Edit Answer */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tambah / Kelola Lampiran Berkas</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-3 bg-indigo-50 dark:bg-indigo-950/50 text-zinc-600 dark:text-zinc-300 font-bold text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 transition-all flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span>{isUploadingEditAnswerFile ? 'Mengunggah ke ImageKit...' : 'Pilih Gambar/File'}</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={e => handleFileUpload(e, 'editAnswer')}
                        disabled={isUploadingEditAnswerFile}
                      />
                    </label>
                  </div>
                  {editAnswerUploadError && <p className="text-xs font-bold text-rose-500">{editAnswerUploadError}</p>}

                  {editAnswerAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {editAnswerAttachments.map(att => (
                        <div key={att.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
                          <span>📎 {att.name}</span>
                          <button
                            type="button"
                            onClick={() => setEditAnswerAttachments(prev => prev.filter(x => x.id !== att.id))}
                            className="text-rose-500 hover:text-rose-700 font-black ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditAnswerModalOpen(false)}
                  className="w-1/3 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-2xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploadingEditAnswerFile}
                  className="w-2/3 py-3.5 bg-zinc-600 hover:bg-zinc-700 text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Attachment Viewer Modal (Proxied through /api/proxy-file) */}
      {previewAttachment && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-zinc-100 dark:bg-zinc-900/50 text-zinc-600 rounded-xl font-bold text-xs uppercase">
                  {previewAttachment.fileType}
                </span>
                <div>
                  <h4 className="font-black text-slate-800 dark:text-white text-base truncate max-w-md">{previewAttachment.name}</h4>
                  <p className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400">Proxied via Server Proxy (Anti-Block Provider)</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href={getProxiedUrl(previewAttachment.url, true, previewAttachment.name)}
                  download={previewAttachment.name}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-zinc-600 text-white rounded-xl font-bold text-xs shadow-md hover:bg-zinc-700 transition-all"
                >
                  Unduh Berkas
                </a>
                <button
                  onClick={() => setPreviewAttachment(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto flex items-center justify-center bg-slate-100 dark:bg-slate-950">
              {isImageFile(previewAttachment.fileType, previewAttachment.name || previewAttachment.url) ? (
                <img
                  src={getProxiedUrl(previewAttachment.url)}
                  alt={previewAttachment.name}
                  onError={(e) => handleImageError(e, previewAttachment.url)}
                  className="max-h-[70vh] object-contain rounded-2xl shadow-md border border-slate-200 dark:border-slate-800"
                />
              ) : isPdfFile(previewAttachment.fileType, previewAttachment.name || previewAttachment.url) ? (
                <iframe
                  src={getProxiedUrl(previewAttachment.url)}
                  className="w-full h-[70vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white"
                  title={previewAttachment.name}
                />
              ) : (
                <div className="w-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-950/50 text-zinc-600 dark:text-zinc-400 rounded-2xl font-black text-2xl">
                    📄
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-white text-sm truncate max-w-md">{previewAttachment.name}</h5>
                    <p className="text-xs text-slate-400 mt-1">Dokumen disajikan langsung via Server Proxy (Bebas Blokir Provider)</p>
                  </div>
                  <a
                    href={getProxiedUrl(previewAttachment.url, true, previewAttachment.name)}
                    download={previewAttachment.name}
                    className="px-5 py-2.5 bg-zinc-600 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                  >
                    Unduh Berkas Langsung
                  </a>
                  <iframe
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(getProxiedUrl(previewAttachment.url, true))}&embedded=true`}
                    className="w-full h-[350px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white mt-2"
                    title={previewAttachment.name}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
