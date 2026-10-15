
export type TaskStatus = 'Proses' | 'Selesai' | 'Ulang' | 'Belum Mulai';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export interface TaskLog {
  status: TaskStatus;
  progress: number;
  date: string; // ISO String
  description: string;
}

export interface Task {
  id: string;
  title: string;
  priority: TaskPriority;
  companyName: string;
  jobType: string;
  employeeName: string;
  category: string;
  color?: string;
  startDate: string; // ISO String
  endDate: string;   // ISO String
  status: TaskStatus;
  progress: number;
  logs: TaskLog[]; 
  owner?: string;
  collaborators?: string[]; // Array of usernames
  pendingCollaborators?: string[]; // Array of usernames waiting for approval
}

export type CalendarViewType = 'day' | 'week' | 'month' | 'list';

export interface DriveAttachment {
  name: string;
  url: string;
  fileType: string;
  fileId: string;
  size?: number;
}

export interface DrivePost {
  id: string;
  title: string;
  content: string;
  attachments: DriveAttachment[];
  owner_username: string;
  owner_name?: string;
  share_token?: string;
  share_expires_at?: string;
  created_at?: string;
}

export type UserRole = 'superadmin' | 'user' | 'engineer' | 'commercial' | 'finance';

export type ProjectFolderCategory = 'engineering' | 'commercial' | 'finance' | 'documentation';

export interface ProjectFile {
  id: string;
  name: string;
  url: string;
  fileType: string;
  size?: number;
  uploadedBy: string;
  uploadedAt: string;
  notes?: string;
}

export interface ProjectNote {
  id: string;
  title: string;
  content: string;
  category: 'SLD / Wiring' | 'Konfigurasi Sistem' | 'Kendala & Solusi' | 'Testing & Commissioning' | 'Catatan Umum';
  author: string;
  createdAt: string;
}

export interface Project {
  id: string;
  code?: string;
  title: string;
  clientName: string;
  location?: string;
  status: 'Perencanaan' | 'Sedang Berjalan' | 'Selesai' | 'Garansi';
  leadEngineer?: string;
  startDate: string;
  completionDate?: string;
  description?: string;
  files: {
    engineering: ProjectFile[];
    commercial: ProjectFile[];
    finance: ProjectFile[];
    documentation: ProjectFile[];
  };
  notes: ProjectNote[];
  created_at?: string;
  updated_at?: string;
}

export interface QAAttachment {
  id: string;
  name: string;
  url: string;
  fileType: string;
  size?: number;
}

export interface QAAnswer {
  id: string;
  question_id: string;
  content: string;
  attachments?: QAAttachment[];
  author_username: string;
  author_name: string;
  author_role: string;
  created_at: string;
}

export interface QAQuestion {
  id: string;
  title: string;
  content: string;
  category: string;
  attachments?: QAAttachment[];
  author_username: string;
  author_name: string;
  author_role: string;
  created_at: string;
  answers: QAAnswer[];
  latest_answer_at?: string;
}
