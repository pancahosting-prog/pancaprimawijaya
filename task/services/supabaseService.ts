
import { createClient } from '@supabase/supabase-js';
import { Task, TaskLog, TaskStatus, TaskPriority, DrivePost, DriveAttachment, Project, QAQuestion, QAAnswer, QAAttachment } from '../types';

// Menggunakan kredensial yang diberikan oleh user
const supabaseUrl = 'https://ujoiqrmcszrkvbebacvm.supabase.co';
const supabaseAnonKey = 'sb_publishable_-MHpR3GpYei3rdlIi-x9qA_IlQqj_3h';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper untuk mapping data dari database (snake_case) ke interface aplikasi (camelCase)
const mapTaskFromDB = (dbTask: any, dbLogs: any[] = []): Task => ({
  id: dbTask.id,
  title: dbTask.title,
  priority: dbTask.priority as TaskPriority,
  companyName: dbTask.company_name,
  jobType: dbTask.job_type,
  employeeName: dbTask.employee_name,
  category: dbTask.category,
  color: dbTask.color,
  startDate: dbTask.start_date,
  endDate: dbTask.end_date,
  status: dbTask.status as TaskStatus,
  progress: dbTask.progress,
  owner: dbTask.owner_username,
  collaborators: dbTask.collaborators || [],
  pendingCollaborators: dbTask.pending_collaborators || [],
  logs: (dbLogs || []).map(l => ({
    status: l.status as TaskStatus,
    progress: l.progress,
    date: l.date,
    description: l.description
  }))
});

export const supabaseService = {
  // --- Autentikasi Profiles ---
  async authenticate(username, password) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();
    
    if (error || !data) return { success: false, message: 'Username atau password salah' };
    return { success: true, user: data };
  },

  async getUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('username, role, name, password')
      .order('name', { ascending: true });
    return data || [];
  },

  async addUser(userData) {
    return await supabase.from('profiles').insert([userData]);
  },

  async updateUser(username: string, updates: { name?: string; password?: string; role?: string }) {
    const cleanUpdates: any = {};
    if (updates.name) cleanUpdates.name = updates.name;
    if (updates.role) cleanUpdates.role = updates.role;
    if (updates.password && updates.password.trim() !== '') cleanUpdates.password = updates.password;

    const { error } = await supabase
      .from('profiles')
      .update(cleanUpdates)
      .eq('username', username);
    if (error) throw error;
    return { success: true };
  },

  async deleteUser(username) {
    return await supabase.from('profiles').delete().eq('username', username);
  },

  // --- Manajemen Tugas ---
  async getTasks(currentUser: { username: string; role: string }, isTrackingView: boolean = false) {
    // Join dengan task_logs untuk mendapatkan history lengkap
    let query = supabase.from('tasks').select('*, task_logs(*)');
    
    // Jika BUKAN tampilan tracking (artinya tampilan Kalender/Dashboard/List Pribadi)
    if (!isTrackingView) {
      // Semua user (termasuk superadmin) hanya melihat tugas di mana mereka adalah OWNER atau COLLABORATOR
      // Ini memastikan kalender superadmin tidak kotor oleh tugas yang ia tugaskan ke orang lain
      query = query.or(`owner_username.eq.${currentUser.username},collaborators.cs.{${currentUser.username}}`);
    } else {
      // Jika INI ADALAH tampilan tracking dan dia superadmin, biarkan ambil semua (atau filter per target user di App.tsx)
      if (currentUser.role !== 'superadmin') {
        query = query.or(`owner_username.eq.${currentUser.username},collaborators.cs.{${currentUser.username}}`);
      }
      // Jika superadmin di view tracking, query tidak difilter di sini karena App.tsx akan memfilter berdasarkan targetUser
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
    
    return data.map(t => mapTaskFromDB(t, t.task_logs));
  },

  async saveTask(task: Task, ownerUsername: string) {
    const isNew = task.id.startsWith('task_');
    
    const dbTask = {
      title: task.title,
      priority: task.priority,
      company_name: task.companyName,
      job_type: task.jobType,
      employee_name: task.employeeName,
      category: task.category,
      color: task.color,
      start_date: task.startDate,
      end_date: task.endDate,
      status: task.status,
      progress: task.progress,
      owner_username: ownerUsername,
      collaborators: task.collaborators,
      pending_collaborators: task.pendingCollaborators
    };

    let taskId = task.id;
    
    if (isNew) {
      // Insert Task Baru
      const { data, error } = await supabase.from('tasks').insert([dbTask]).select().single();
      if (error) throw error;
      taskId = data.id;
    } else {
      // Update Task Lama
      const { error } = await supabase.from('tasks').update(dbTask).eq('id', task.id);
      if (error) throw error;
    }

    // Sinkronisasi Logs: Hapus log lama dan masukkan versi terbaru
    await supabase.from('task_logs').delete().eq('task_id', taskId);
    
    if (task.logs && task.logs.length > 0) {
      const dbLogs = task.logs.map(l => ({
        task_id: taskId,
        status: l.status,
        progress: l.progress,
        date: l.date,
        description: l.description
      }));
      const { error: logError } = await supabase.from('task_logs').insert(dbLogs);
      if (logError) throw logError;
    }

    return { success: true, id: taskId };
  },

  async deleteTask(taskId: string) {
    await supabase.from('task_logs').delete().eq('task_id', taskId);
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
    return { success: true };
  },

  // --- Stickynote Pribadi ---
  async getStickyNote(username: string) {
    const { data, error } = await supabase
      .from('sticky_notes')
      .select('content')
      .eq('username', username)
      .single();
    if (error && error.code !== 'PGRST116') console.error('Error getting note:', error);
    return data?.content || '';
  },

  async saveStickyNote(username: string, content: string) {
    return await supabase.from('sticky_notes').upsert({ 
      username, 
      content, 
      updated_at: new Date().toISOString() 
    });
  },

  // --- Notifikasi & Pesan ---
  async getNotifications(username: string) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_username', username)
      .order('date', { ascending: false });
    return (data || []).map(n => ({ 
      id: n.id,
      type: n.type,
      taskId: n.task_id,
      title: n.title,
      message: n.message,
      priority: n.priority,
      date: n.date,
      read: n.is_read 
    }));
  },

  async sendNotification(notif: any) {
    return await supabase.from('notifications').insert([{
      recipient_username: notif.recipient_username,
      type: notif.type || 'info',
      task_id: notif.taskId,
      title: notif.title,
      message: notif.message,
      priority: notif.priority,
      is_read: false
    }]);
  },

  async markNotifRead(username: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_username', username);
    return !error;
  },

  // --- Drive Postingan ---
  async getDrivePosts(username?: string) {
    let query = supabase
      .from('drive_posts')
      .select('*, profiles(name)');
    
    if (username) {
      query = query.eq('owner_username', username);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching drive posts:', error);
      return [];
    }
    
    return (data || []).map(p => ({
      id: p.id,
      title: p.title,
      content: p.content,
      attachments: p.attachments || [],
      owner_username: p.owner_username,
      owner_name: p.profiles?.name || p.owner_username,
      share_token: p.share_token,
      share_expires_at: p.share_expires_at,
      created_at: p.created_at
    }));
  },

  async createDrivePost(post: { title: string; content: string; attachments: DriveAttachment[]; owner_username: string }) {
    const { data, error } = await supabase
      .from('drive_posts')
      .insert([post])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateDrivePost(id: string, updates: Partial<DrivePost>) {
    const { data, error } = await supabase
      .from('drive_posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteDrivePost(id: string) {
    const { error } = await supabase
      .from('drive_posts')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  async getSharedDrivePost(shareToken: string) {
    const { data, error } = await supabase
      .from('drive_posts')
      .select('*')
      .eq('share_token', shareToken)
      .single();
      
    if (error || !data) return null;
    
    if (data.share_expires_at && new Date() > new Date(data.share_expires_at)) {
      return null;
    }
    
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('name')
      .eq('username', data.owner_username)
      .single();
      
    return {
      id: data.id,
      title: data.title,
      content: data.content,
      attachments: data.attachments || [],
      owner_username: data.owner_username,
      owner_name: ownerProfile?.name || data.owner_username,
      share_token: data.share_token,
      share_expires_at: data.share_expires_at,
      created_at: data.created_at
    };
  },

  // --- Manajemen Project Knowledge Database ---
  async getProjects(): Promise<Project[]> {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        if (data.length > 0) {
          const mapped = data.map((p: any) => ({
            id: p.id,
            code: p.code,
            title: p.title,
            clientName: p.client_name,
            location: p.location,
            status: p.status,
            leadEngineer: p.lead_engineer,
            startDate: p.start_date,
            completionDate: p.completion_date,
            description: p.description,
            files: p.files || { engineering: [], commercial: [], finance: [], documentation: [] },
            notes: p.notes || [],
            created_at: p.created_at
          }));
          localStorage.setItem('mypanca_projects_db', JSON.stringify(mapped));
          return mapped;
        }
      }
    } catch (e) {
      console.log('Supabase project table query fallback to local storage', e);
    }

    // Fallback LocalStorage Sync
    const local = localStorage.getItem('mypanca_projects_db');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (err) {
        console.error('Failed to parse local projects:', err);
      }
    }

    // Sample Default Projects PT Panca
    const defaultProjects: Project[] = [
      {
        id: 'proj_001',
        code: 'PRJ-2026-001',
        title: 'Instalasi Sensor Gempa & Automation System',
        clientName: 'BMKG / Stasiun Geofisika Jakarta',
        location: 'Jakarta Pusat',
        status: 'Selesai',
        leadEngineer: 'Arie (Senior Engineer)',
        startDate: '2026-01-10',
        description: 'Pemasangan sensor pemicu relai gempa bumi otomatis, wiring panel shutdown darurat & kalibrasi threshold.',
        files: {
          engineering: [
            {
              id: 'f1',
              name: 'SLD_Sensor_Wiring_V1.pdf',
              url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
              fileType: 'pdf',
              uploadedBy: 'Arie',
              uploadedAt: '2026-01-15T00:00:00Z',
              notes: 'Single Line Diagram Wiring Panel & Relay Output'
            },
            {
              id: 'f2',
              name: 'Manual_Setting_Threshold_Sensor.pdf',
              url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
              fileType: 'pdf',
              uploadedBy: 'Evan',
              uploadedAt: '2026-01-18T00:00:00Z',
              notes: 'Panduan konfigurasi sensitivitas sensor Mgal'
            }
          ],
          commercial: [
            {
              id: 'f3',
              name: 'RAB_Final_Sensor_Gempa_BMKG.xlsx',
              url: '#',
              fileType: 'xlsx',
              uploadedBy: 'Commercial Team',
              uploadedAt: '2026-01-08T00:00:00Z',
              notes: 'Rincian HPP, Margin & Budgeting'
            }
          ],
          finance: [
            {
              id: 'f4',
              name: 'BAST_Pembayaran_100.pdf',
              url: '#',
              fileType: 'pdf',
              uploadedBy: 'Finance Team',
              uploadedAt: '2026-01-25T00:00:00Z',
              notes: 'Invoice Lunas & BAST Pekerjaan Selesai'
            }
          ],
          documentation: [
            {
              id: 'f5',
              name: 'Foto_Pemasangan_Panel_Sensor.img',
              url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800',
              fileType: 'img',
              uploadedBy: 'Jeremy',
              uploadedAt: '2026-01-20T00:00:00Z',
              notes: 'Foto dokumentasi hasil kelistrikan akhir'
            }
          ]
        },
        notes: [
          {
            id: 'n1',
            title: 'SOP Kalibrasi Sensitivitas Sensor Gempa',
            category: 'Testing & Commissioning',
            content: '1. Pastikan ground terpasang kuat < 1 Ohm.\n2. Lakukan zeroing level pada accelerometer.\n3. Atur threshold tripping pada 50 Mgal agar tidak terpicu oleh getaran kendaraan berat di sekitar lokasi.',
            author: 'Arie',
            createdAt: '2026-01-22T00:00:00Z'
          },
          {
            id: 'n2',
            title: 'Troubleshooting Induksi Noise Sinyal',
            category: 'Kendala & Solusi',
            content: 'Kendala: Sensor sempat membaca false-alarm saat motor BAST berjalan.\nSolusi: Memindahkan kabel sinyal ke jalur tray terpisah dan menggunakan kabel STP (Shielded Twisted Pair) dengan grounding satu titik.',
            author: 'Evan',
            createdAt: '2026-01-23T00:00:00Z'
          }
        ]
      },
      {
        id: 'proj_002',
        code: 'PRJ-2026-002',
        title: 'Sistem Automasi EWS Early Warning Gempa',
        clientName: 'PT Smelter Utama',
        location: 'Site Gresik, Jawa Timur',
        status: 'Sedang Berjalan',
        leadEngineer: 'Evan',
        startDate: '2026-02-01',
        description: 'Integrasi sistem peringatan dini gempa bumi ke sirine utama pabrik & autoshutdown gas solenoid valve.',
        files: {
          engineering: [
            {
              id: 'f6',
              name: 'Drawing_EWS_Smelter.dwg',
              url: '#',
              fileType: 'dwg',
              uploadedBy: 'Evan',
              uploadedAt: '2026-02-05T00:00:00Z',
              notes: 'Layout wiring solenoid valve'
            }
          ],
          commercial: [],
          finance: [],
          documentation: []
        },
        notes: [
          {
            id: 'n3',
            title: 'Integrasi Sirine & Interlock Gas Valve',
            category: 'Konfigurasi Sistem',
            content: 'Relay 1 dihubungkan ke PLC Utama Pabrik untuk membunyikan sirine evacuation. Relay 2 memutus arus solenoid valve saluran gas.',
            author: 'Evan',
            createdAt: '2026-02-08T00:00:00Z'
          }
        ]
      }
    ];

    localStorage.setItem('mypanca_projects_db', JSON.stringify(defaultProjects));
    return defaultProjects;
  },

  async saveProject(project: Project): Promise<Project[]> {
    const currentProjects = await this.getProjects();
    const existingIndex = currentProjects.findIndex(p => p.id === project.id);
    
    let updatedList: Project[];
    if (existingIndex >= 0) {
      updatedList = [...currentProjects];
      updatedList[existingIndex] = project;
    } else {
      updatedList = [project, ...currentProjects];
    }

    localStorage.setItem('mypanca_projects_db', JSON.stringify(updatedList));

    try {
      const { error } = await supabase.from('projects').upsert({
        id: project.id,
        code: project.code,
        title: project.title,
        client_name: project.clientName,
        location: project.location,
        status: project.status,
        lead_engineer: project.leadEngineer,
        start_date: project.startDate,
        completion_date: project.completionDate,
        description: project.description,
        files: project.files,
        notes: project.notes,
        updated_at: new Date().toISOString()
      });
      if (error) {
        console.warn('Supabase projects table error (run SQL script in Supabase dashboard if table is missing):', error.message);
      }
    } catch (e) {
      console.log('Supabase project save fallback to local storage', e);
    }

    return updatedList;
  },

  async deleteProject(projectId: string): Promise<Project[]> {
    const currentProjects = await this.getProjects();
    const updatedList = currentProjects.filter(p => p.id !== projectId);
    localStorage.setItem('mypanca_projects_db', JSON.stringify(updatedList));

    try {
      await supabase.from('projects').delete().eq('id', projectId);
    } catch (e) {
      console.log('Supabase project delete fallback to local storage');
    }

    return updatedList;
  },

  // --- Q&A Forum System ---
  async getQAQuestions(): Promise<QAQuestion[]> {
    try {
      const { data: qData, error: qError } = await supabase
        .from('qa_questions')
        .select('*, qa_answers(*)')
        .order('created_at', { ascending: false });

      if (!qError && qData) {
        const questions: QAQuestion[] = qData.map((q: any) => {
          const answers: QAAnswer[] = (q.qa_answers || [])
            .map((a: any) => ({
              id: a.id,
              question_id: a.question_id,
              content: a.content,
              attachments: a.attachments || [],
              author_username: a.author_username,
              author_name: a.author_name,
              author_role: a.author_role,
              created_at: a.created_at
            }))
            // Sort answers so latest answers appear first
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          return {
            id: q.id,
            title: q.title,
            content: q.content,
            category: q.category || 'Teknis & Engineering',
            attachments: q.attachments || [],
            author_username: q.author_username,
            author_name: q.author_name,
            author_role: q.author_role,
            created_at: q.created_at,
            answers,
            latest_answer_at: answers.length > 0 ? answers[0].created_at : q.created_at
          };
        });

        // Sort questions by latest answer or question creation date
        questions.sort((a, b) => {
          const timeA = new Date(a.latest_answer_at || a.created_at).getTime();
          const timeB = new Date(b.latest_answer_at || b.created_at).getTime();
          return timeB - timeA;
        });

        // Deduplicate questions by ID
        const uniqueMap = new Map<string, QAQuestion>();
        for (const q of questions) {
          if (!uniqueMap.has(q.id)) {
            uniqueMap.set(q.id, q);
          }
        }
        const deduplicated = Array.from(uniqueMap.values());

        localStorage.setItem('mypanca_qa_questions', JSON.stringify(deduplicated));
        return deduplicated;
      }
    } catch (e) {
      console.log('Supabase QA query fallback to local storage', e);
    }

    const local = localStorage.getItem('mypanca_qa_questions');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const uniqueMap = new Map<string, QAQuestion>();
          for (const q of parsed) {
            if (!uniqueMap.has(q.id)) {
              uniqueMap.set(q.id, q);
            }
          }
          return Array.from(uniqueMap.values());
        }
      } catch (err) {
        console.error('Failed to parse local QA questions:', err);
      }
    }

    // Default Initial Questions
    const defaultQuestions: QAQuestion[] = [
      {
        id: 'qa_001',
        title: 'Bagaimana cara mengatasi false alarm pada Sensor Gempa saat motor industri start?',
        content: 'Saat motor bertenaga tinggi di plant dihidupkan, vibration sensor gempa di panel terkadang terpicu dan memicu sinyal shutdown darurat. Mohon panduan cara filter noise atau penyesuaian threshold sensitivitasnya.',
        category: 'Sensor & Automation',
        attachments: [],
        author_username: 'arie',
        author_name: 'Arie',
        author_role: 'Engineer',
        created_at: '2026-02-10T08:30:00Z',
        latest_answer_at: '2026-02-10T10:15:00Z',
        answers: [
          {
            id: 'ans_001',
            question_id: 'qa_001',
            content: 'Gunakan kabel Shielded Twisted Pair (STP) dan pastikan grounding tersambung satu titik (single-point grounding) di panel utama. Selain itu, aktifkan waktu tunda (time delay filter) 500ms pada PLC agar spike getaran saat motor start-up tidak memicu shutdown.',
            attachments: [],
            author_username: 'evan',
            author_name: 'Evan',
            author_role: 'Senior Engineer',
            created_at: '2026-02-10T10:15:00Z'
          }
        ]
      }
    ];

    localStorage.setItem('mypanca_qa_questions', JSON.stringify(defaultQuestions));
    return defaultQuestions;
  },

  async createQAQuestion(question: QAQuestion): Promise<QAQuestion[]> {
    const questions = await this.getQAQuestions();
    const existingIndex = questions.findIndex(q => q.id === question.id);
    
    let updated: QAQuestion[];
    if (existingIndex >= 0) {
      updated = [...questions];
      updated[existingIndex] = question;
    } else {
      updated = [question, ...questions];
    }

    // Deduplicate strictly by ID
    const uniqueMap = new Map<string, QAQuestion>();
    for (const q of updated) {
      if (!uniqueMap.has(q.id)) {
        uniqueMap.set(q.id, q);
      }
    }
    const finalUpdated = Array.from(uniqueMap.values());
    localStorage.setItem('mypanca_qa_questions', JSON.stringify(finalUpdated));

    try {
      const { error } = await supabase.from('qa_questions').upsert([{
        id: question.id,
        title: question.title,
        content: question.content,
        category: question.category,
        attachments: question.attachments,
        author_username: question.author_username,
        author_name: question.author_name,
        author_role: question.author_role,
        created_at: question.created_at
      }]);
      if (error) console.warn('Supabase createQAQuestion table error:', error.message);
    } catch (e) {
      console.log('Supabase createQAQuestion fallback to local storage', e);
    }

    return finalUpdated;
  },

  async createQAAnswer(answer: QAAnswer): Promise<QAQuestion[]> {
    const questions = await this.getQAQuestions();
    const qIndex = questions.findIndex(q => q.id === answer.question_id);

    if (qIndex >= 0) {
      const q = questions[qIndex];
      const newAnswers = [answer, ...(q.answers || [])];
      const updatedQ: QAQuestion = {
        ...q,
        answers: newAnswers,
        latest_answer_at: answer.created_at
      };
      questions[qIndex] = updatedQ;
    }

    localStorage.setItem('mypanca_qa_questions', JSON.stringify(questions));

    try {
      const { error } = await supabase.from('qa_answers').insert([{
        id: answer.id,
        question_id: answer.question_id,
        content: answer.content,
        attachments: answer.attachments,
        author_username: answer.author_username,
        author_name: answer.author_name,
        author_role: answer.author_role,
        created_at: answer.created_at
      }]);
      if (error) console.warn('Supabase createQAAnswer table error:', error.message);
    } catch (e) {
      console.log('Supabase createQAAnswer fallback to local storage', e);
    }

    return questions;
  },

  async updateQAQuestion(question: QAQuestion): Promise<QAQuestion[]> {
    const questions = await this.getQAQuestions();
    const index = questions.findIndex(q => q.id === question.id);
    if (index >= 0) {
      questions[index] = { ...questions[index], ...question };
    }
    localStorage.setItem('mypanca_qa_questions', JSON.stringify(questions));

    try {
      const { error } = await supabase.from('qa_questions').upsert([{
        id: question.id,
        title: question.title,
        content: question.content,
        category: question.category,
        attachments: question.attachments,
        author_username: question.author_username,
        author_name: question.author_name,
        author_role: question.author_role,
        created_at: question.created_at
      }]);
      if (error) console.warn('Supabase updateQAQuestion table error:', error.message);
    } catch (e) {
      console.log('Supabase updateQAQuestion fallback to local storage', e);
    }

    return questions;
  },

  async updateQAAnswer(answer: QAAnswer): Promise<QAQuestion[]> {
    const questions = await this.getQAQuestions();
    const qIndex = questions.findIndex(q => q.id === answer.question_id);

    if (qIndex >= 0) {
      const q = questions[qIndex];
      const ansIndex = (q.answers || []).findIndex(a => a.id === answer.id);
      if (ansIndex >= 0) {
        q.answers[ansIndex] = { ...q.answers[ansIndex], ...answer };
        questions[qIndex] = { ...q };
      }
    }

    localStorage.setItem('mypanca_qa_questions', JSON.stringify(questions));

    try {
      const { error } = await supabase.from('qa_answers').upsert([{
        id: answer.id,
        question_id: answer.question_id,
        content: answer.content,
        attachments: answer.attachments,
        author_username: answer.author_username,
        author_name: answer.author_name,
        author_role: answer.author_role,
        created_at: answer.created_at
      }]);
      if (error) console.warn('Supabase updateQAAnswer table error:', error.message);
    } catch (e) {
      console.log('Supabase updateQAAnswer fallback to local storage', e);
    }

    return questions;
  },

  async deleteQAAnswer(answerId: string, questionId: string): Promise<QAQuestion[]> {
    const questions = await this.getQAQuestions();
    const qIndex = questions.findIndex(q => q.id === questionId);

    if (qIndex >= 0) {
      const q = questions[qIndex];
      q.answers = (q.answers || []).filter(a => a.id !== answerId);
      q.latest_answer_at = q.answers.length > 0 ? q.answers[0].created_at : q.created_at;
      questions[qIndex] = { ...q };
    }

    localStorage.setItem('mypanca_qa_questions', JSON.stringify(questions));

    try {
      await supabase.from('qa_answers').delete().eq('id', answerId);
    } catch (e) {
      console.log('Supabase deleteQAAnswer fallback to local storage', e);
    }

    return questions;
  },

  async deleteQAQuestion(questionId: string): Promise<QAQuestion[]> {
    const questions = await this.getQAQuestions();
    const updated = questions.filter(q => q.id !== questionId);
    localStorage.setItem('mypanca_qa_questions', JSON.stringify(updated));

    try {
      await supabase.from('qa_answers').delete().eq('question_id', questionId);
      await supabase.from('qa_questions').delete().eq('id', questionId);
    } catch (e) {
      console.log('Supabase deleteQAQuestion fallback to local storage', e);
    }

    return updated;
  }
};

