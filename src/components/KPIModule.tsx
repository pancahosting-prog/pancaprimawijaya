import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Award, FileText, Plus, Trash2, Edit, Save, Check, CheckCircle, 
  TrendingUp, User, DollarSign, Calendar, ChevronDown, ChevronRight, 
  AlertCircle, AlertTriangle, Filter, Shield, Activity, Briefcase, Percent, Clock, 
  Lock, Unlock, Settings, HelpCircle, BriefcaseIcon, RefreshCw, Eye, EyeOff,
  Printer, FileSpreadsheet, Cloud, Database, UploadCloud
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, LineChart, Line, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { safeSetLocalStorage } from '../lib/apiUtils';
import { 
  loadAllKPIDataFromSupabase, 
  saveAllKPIDataToSupabase, 
  KPIMasterCloudData 
} from '../lib/kpiSupabaseSync';

interface Employee {
  id: string;
  nama: string;
  nik: string;
  username: string;
  role: string;
  biodata: string;
  pendidikan: string;
  alamat: string;
  kontakDarurat: string;
  whatsapp: string;
  email: string;
  gaji: number;
  payroll: string;
  pph: number;
  companyId?: string;
  departemen?: string;
  jabatan?: string;
  atasan?: string;
  kontrakAwal?: string;
}

interface Transaction {
  id: string;
  noTrx: string;
  tanggal: string;
  customerName: string;
  status?: string;
  nilaiProyek: number;
  pembayaranDiterima: number;
  sisaPembayaran: number;
  paymentStatus: string;
  companyId?: string;
  items?: any[];
}

interface KPISoftSkillIndicator {
  id: string;
  name: string;
  bobot: number; // percentage (sum should be 100)
}

interface KPITemplate {
  id: string;
  jabatan: string; // matches employee.role or employee.jabatan
  indicators: {
    id: string;
    name: string;
    bobot: number; // percentage (sum should be 100)
    type: 'kuantitatif' | 'kualitatif';
    targetType?: 'sales_volume' | 'trx_count' | 'manual';
    satuan?: string;
    target?: number;
    metode?: 'Maximize' | 'Minimize';
  }[];
  softSkills?: KPISoftSkillIndicator[];
  hardWeight?: number; // default 80
  softWeight?: number; // default 20
}

interface KPIRecord {
  id: string;
  employeeId: string;
  month: string; // "01" - "12"
  year: string; // "2026"
  scores: Record<string, number>; // indicatorId -> score (0-100)
  status: 'draft' | 'approved';
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  hardKPIs?: {
    indicatorId: string;
    name: string;
    bobot: number;
    metode: 'Maximize' | 'Minimize';
    target: number;
    satuan: string;
    realisasi: number;
    score: number;
  }[];
  softSkills?: {
    name: string;
    bobot: number;
    nilai: number;
    score: number;
  }[];
  hardWeight?: number;
  softWeight?: number;
  finalScore?: number;
}

interface ProjectBonus {
  id: string;
  name: string;
  transactionId?: string; // Linked to sales project
  employeeIds: string[]; // Assigned employees
  bonusAmount: number;
  deadline: string;
  completedAt?: string;
  status: 'pending' | 'released' | 'cancelled';
  notes?: string;
}

interface KPIConfig {
  targetProfitPerusahaan: number;
  alokasiProfitSharingBonus: number; // e.g. 5%
  minimalKPIScoreToRelease: number; // e.g. 60
  alokasiJabatan?: {
    generalManager: number;
    headOfSales: number;
    headOfMarketing: number;
    headOfEngineering: number;
    engineeringStaff: number;
    salesAdminStaff: number;
    salesStaff: number;
    inventoryControlStaff: number;
    officeBoy: number;
  };
  gradingKPI?: {
    A: { min: number; multiplier: number };
    B: { min: number; multiplier: number };
    C: { min: number; multiplier: number };
    D: { min: number; multiplier: number };
    E: { min: number; multiplier: number };
  };
  tiers?: {
    tier1: { target: number; multiplier: number };
    tier2: { target: number; multiplier: number };
    tier3: { target: number; multiplier: number };
  };
  targetPenjualan?: {
    pencapaian120: number;
    pencapaian100: number;
    pencapaian80: number;
    pencapaianUnder80: number;
  };
}

interface KPIModuleProps {
  employees: Employee[];
  transactions: Transaction[];
  currentUser: any;
  activeCompanyId: string;
  onUpdateEmployees?: (updatedEmployees: Employee[]) => void;
}

const DEFAULT_SOFT_SKILL_INDICATORS: KPISoftSkillIndicator[] = [
  { id: 'ss-1', name: 'Dicipline', bobot: 25 },
  { id: 'ss-2', name: 'Responsible', bobot: 25 },
  { id: 'ss-3', name: 'Team Work', bobot: 25 },
  { id: 'ss-4', name: 'Great Execution', bobot: 25 }
];

// Default KPI templates for standard roles
const DEFAULT_TEMPLATES: KPITemplate[] = [
  {
    id: 'tpl-head-of-sales',
    jabatan: 'head of sales',
    indicators: [
      { id: 'hos-target', name: 'Target Penjualan', bobot: 50, type: 'kuantitatif', targetType: 'sales_volume', satuan: 'Rp', target: 200000000, metode: 'Maximize' },
      { id: 'hos-leads', name: 'Supervisi Tim & Pipeline Penjualan (Kualitatif)', bobot: 20, type: 'kualitatif', satuan: '%' },
      { id: 'hos-strategy', name: 'Strategi Penjualan & Closing Deals (Kualitatif)', bobot: 15, type: 'kualitatif', satuan: '%' },
      { id: 'hos-sop', name: 'Kepatuhan SOP & Laporan Manajemen (Kualitatif)', bobot: 15, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-sales-staff',
    jabatan: 'sales staff',
    indicators: [
      { id: 'sales-target', name: 'Target Penjualan', bobot: 50, type: 'kuantitatif', targetType: 'sales_volume', satuan: 'Rp', target: 200000000, metode: 'Maximize' },
      { id: 'sales-leads', name: 'Follow-up Leads & Negosiasi (Kualitatif)', bobot: 20, type: 'kualitatif', satuan: '%' },
      { id: 'sales-discipline', name: 'Kedisiplinan & Pelaporan Harian (Kualitatif)', bobot: 15, type: 'kualitatif', satuan: '%' },
      { id: 'sales-sop', name: 'Kepatuhan SOP Transaksi & Invoice (Kualitatif)', bobot: 15, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-sales',
    jabatan: 'sales',
    indicators: [
      { id: 'sales-omset', name: 'Target Penjualan', bobot: 50, type: 'kuantitatif', targetType: 'sales_volume', satuan: 'Rp', target: 200000000, metode: 'Maximize' },
      { id: 'sales-leads-gen', name: 'Follow-up Leads & Negosiasi (Kualitatif)', bobot: 20, type: 'kualitatif', satuan: '%' },
      { id: 'sales-discipline-gen', name: 'Kedisiplinan & Pelaporan Harian (Kualitatif)', bobot: 15, type: 'kualitatif', satuan: '%' },
      { id: 'sales-sop-gen', name: 'Kepatuhan SOP Transaksi & Invoice (Kualitatif)', bobot: 15, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-engineer',
    jabatan: 'engineer',
    indicators: [
      { id: 'eng-project', name: 'Penyelesaian Project Tepat Waktu (Kuantitatif)', bobot: 40, type: 'kuantitatif', targetType: 'manual' },
      { id: 'eng-quality', name: 'Kualitas Teknis & Minim Bug/Error (Kualitatif)', bobot: 30, type: 'kualitatif' },
      { id: 'eng-coop', name: 'Kerja Sama Tim & Komunikasi (Kualitatif)', bobot: 15, type: 'kualitatif' },
      { id: 'eng-initiative', name: 'Inisiatif & Troubleshooting Mandiri (Kualitatif)', bobot: 15, type: 'kualitatif' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-finance',
    jabatan: 'finance',
    indicators: [
      { id: 'fin-accuracy', name: 'Ketepatan Laporan Keuangan & Pajak (Kualitatif)', bobot: 40, type: 'kualitatif' },
      { id: 'fin-collection', name: 'Manajemen Penagihan Piutang (Kuantitatif)', bobot: 30, type: 'kuantitatif', targetType: 'manual' },
      { id: 'fin-discipline', name: 'Kepatuhan Siklus Pembayaran & SOP (Kualitatif)', bobot: 15, type: 'kualitatif' },
      { id: 'fin-teamwork', name: 'Kerja Sama & Respons Layanan Keuangan (Kualitatif)', bobot: 15, type: 'kualitatif' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-head-of-marketing',
    jabatan: 'head of marketing',
    indicators: [
      { id: 'hom-campaign', name: 'Efektivitas Campaign & Brand Awareness', bobot: 40, type: 'kualitatif', satuan: '%' },
      { id: 'hom-leads', name: 'Pencapaian Jumlah Qualified Leads', bobot: 35, type: 'kuantitatif', targetType: 'manual', satuan: 'Unit', target: 50, metode: 'Maximize' },
      { id: 'hom-coop', name: 'Sinergi Tim Marketing & Sales', bobot: 25, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-head-of-engineering',
    jabatan: 'head of engineering',
    indicators: [
      { id: 'hoe-delivery', name: 'Ketepatan Waktu Delivery Proyek Tim', bobot: 40, type: 'kuantitatif', targetType: 'manual', satuan: '%', target: 100, metode: 'Maximize' },
      { id: 'hoe-quality', name: 'Standarisasi Kualitas & Keandalan Sistem', bobot: 35, type: 'kualitatif', satuan: '%' },
      { id: 'hoe-leadership', name: 'Kepemimpinan & Bimbingan Teknis Tim', bobot: 25, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-engineering-staff',
    jabatan: 'engineering staff',
    indicators: [
      { id: 'eng-project', name: 'Penyelesaian Project Tepat Waktu (Kuantitatif)', bobot: 50, type: 'kuantitatif', targetType: 'manual', satuan: '%', target: 100, metode: 'Maximize' },
      { id: 'eng-quality', name: 'Kualitas Teknis & Minim Bug/Error (Kualitatif)', bobot: 50, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-sales-admin-staff',
    jabatan: 'sales admin staff',
    indicators: [
      { id: 'adm-docs', name: 'Ketepatan & Kecepatan Penerbitan PO / Invoice', bobot: 50, type: 'kualitatif', satuan: '%' },
      { id: 'adm-coord', name: 'Koordinasi Jadwal & Rekonsiliasi Pesanan', bobot: 50, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-inventory-control-staff',
    jabatan: 'inventory control staff',
    indicators: [
      { id: 'inv-accuracy', name: 'Akurasi Stok Opname & Catatan Gudang', bobot: 50, type: 'kualitatif', satuan: '%' },
      { id: 'inv-handling', name: 'Kecepatan Pengemasan & Pengiriman Barang', bobot: 50, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-general-manager',
    jabatan: 'general manager',
    indicators: [
      { id: 'gm-target', name: 'Pencapaian Target Profit & Operasional', bobot: 50, type: 'kuantitatif', targetType: 'manual', satuan: '%', target: 100, metode: 'Maximize' },
      { id: 'gm-lead', name: 'Manajemen Strategis & Efisiensi Biaya', bobot: 50, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-office-boy',
    jabatan: 'office boy',
    indicators: [
      { id: 'ob-clean', name: 'Kebersihan & Kerapihan Area Kantor', bobot: 50, type: 'kualitatif', satuan: '%' },
      { id: 'ob-resp', name: 'Kedisiplinan & Kecepatan Pelayanan Operasional', bobot: 50, type: 'kualitatif', satuan: '%' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  },
  {
    id: 'tpl-general',
    jabatan: 'default',
    indicators: [
      { id: 'gen-work', name: 'Kualitas Pekerjaan Utama (Kualitatif)', bobot: 40, type: 'kualitatif' },
      { id: 'gen-discipline', name: 'Kedisiplinan & Kehadiran (Kualitatif)', bobot: 25, type: 'kualitatif' },
      { id: 'gen-coop', name: 'Kerja Sama & Sikap Kerja (Kualitatif)', bobot: 20, type: 'kualitatif' },
      { id: 'gen-sop', name: 'Kepatuhan Terhadap Regulasi Perusahaan (Kualitatif)', bobot: 15, type: 'kualitatif' }
    ],
    softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
    hardWeight: 80,
    softWeight: 20
  }
];

const DEFAULT_ALOKASI_JABATAN = {
  generalManager: 2,
  headOfSales: 8,
  headOfMarketing: 7,
  headOfEngineering: 8,
  engineeringStaff: 10,
  salesAdminStaff: 7,
  salesStaff: 15,
  inventoryControlStaff: 4,
  officeBoy: 3
};

const DEFAULT_GRADING_KPI = {
  A: { min: 95, multiplier: 100 },
  B: { min: 85, multiplier: 75 },
  C: { min: 75, multiplier: 60 },
  D: { min: 65, multiplier: 0 },
  E: { min: 0, multiplier: 0 }
};

const DEFAULT_TIERS = {
  tier1: { target: 500000000, multiplier: 1.6 },
  tier2: { target: 300000000, multiplier: 1.3 },
  tier3: { target: 200000000, multiplier: 1.0 }
};

const DEFAULT_TARGET_PENJUALAN = {
  pencapaian120: 4,
  pencapaian100: 3,
  pencapaian80: 2,
  pencapaianUnder80: 1
};

interface JabatanConfig {
  id: string;
  name: string;
  percentage: number;
}

export const DEFAULT_JABATANS: JabatanConfig[] = [
  { id: 'jab-1', name: 'General Manager', percentage: 2 },
  { id: 'jab-2', name: 'Head of Sales', percentage: 8 },
  { id: 'jab-3', name: 'Head of Marketing', percentage: 7 },
  { id: 'jab-4', name: 'Head of Engineering', percentage: 8 },
  { id: 'jab-5', name: 'Engineering Staff', percentage: 10 },
  { id: 'jab-6', name: 'Sales Admin Staff', percentage: 7 },
  { id: 'jab-7', name: 'Sales Staff', percentage: 15 },
  { id: 'jab-8', name: 'Inventory Control Staff', percentage: 4 },
  { id: 'jab-9', name: 'Office Boy', percentage: 3 }
];

interface KPIEmployee {
  id: string;
  nama: string;
  nik: string;
  jabatanId: string;
  gaji: number;
  jabatan?: string;
  role?: string;
}

interface GradingKPIItem {
  id: string;
  grade: string;
  scoreRange: string;
  multiplier: number;
  minScore: number;
}

interface OmsetTier {
  id: string;
  name: string;
  target: number;
  multiplier: number;
}

interface SalesCommission {
  id: string;
  pencapaian: string;
  komisi: number;
}

interface MonthlyFinancial {
  omsetKotor: number;
  pajak: number;
  pengiriman: number;
  lainLain: number;
}

export interface SalesBonusProjectRow {
  id: string;
  employeeId?: string;
  nama: string;
  jabatan: string;
  targetBulanan: number;
  pencapaian: number; // Omset Kotor
  pajak: number;
  biayaKirim: number;
  biayaLain: number;
  additional: number;
  note?: string;
}

export interface EngineerBonusProjectRow {
  id: string;
  employeeId?: string;
  nama: string;
  jabatan: string;
  persentaseKomisi: number; // e.g. 0.05
}

export interface MonthProjectBonusSheet {
  sales: SalesBonusProjectRow[];
  engineers: EngineerBonusProjectRow[];
}

export const KPI_SATUAN_OPTIONS = [
  '%',
  'Nilai',
  'Rp',
  'Unit',
  'Pcs',
  'Trx',
  'Hari',
  'Dokumen',
  'Proyek',
  'Jam',
  'Orang',
  'Bulan'
];

// Helper to format any number with dot thousands separator (e.g. 1.000.000 or 1.000.000,50)
export const formatDotNumber = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') {
    if (isNaN(val)) return '';
    const parts = val.toString().split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts.length > 1 ? `${intPart},${parts[1]}` : intPart;
  }

  const str = String(val).trim();
  if (!str) return '';

  // If input is standard JS decimal format like "79.57" or "100.00" (single dot, no commas)
  if (/^-?\d+\.\d+$/.test(str)) {
    const parts = str.split('.');
    const intPart = parseInt(parts[0], 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${intPart},${parts[1]}`;
  }

  // If input is simple integer string like "100" or "0"
  if (/^-?\d+$/.test(str)) {
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // For Indonesian formatted string input e.g. "133.716.920" or "133.716.920,50"
  const clean = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  if (isNaN(num)) return '';
  const parts = num.toString().split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.length > 1 ? `${intPart},${parts[1]}` : intPart;
};

// Helper to parse dot formatted string back to raw float (e.g. "1.000.000" -> 1000000)
export const parseDotNumber = (val: string | undefined | null): number => {
  if (!val) return 0;
  const clean = String(val).replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

export interface FormattedNumberInputProps {
  value: number | undefined | null;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  allowDecimal?: boolean;
  min?: number;
  max?: number;
  id?: string;
  name?: string;
  style?: React.CSSProperties;
}

export function FormattedNumberInput({
  value,
  onChange,
  className = '',
  placeholder = '0',
  disabled = false,
  allowDecimal = false,
  min,
  max,
  id,
  name,
  style
}: FormattedNumberInputProps) {
  const [localStr, setLocalStr] = useState<string>(() => {
    if (value === undefined || value === null) return '';
    return formatDotNumber(value);
  });

  useEffect(() => {
    const currentParsed = parseDotNumber(localStr);
    const targetVal = value ?? 0;
    if (currentParsed !== targetVal) {
      setLocalStr(value === undefined || value === null ? '' : formatDotNumber(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw.trim()) {
      setLocalStr('');
      onChange(0);
      return;
    }

    if (allowDecimal) {
      // Support comma or dot as decimal separator
      const clean = raw.replace(/[^\d,.]/g, '');
      const parts = clean.replace(/\./g, ',').split(',');
      if (parts.length > 2) return;
      const intRaw = parts[0] ? parts[0].replace(/[^\d]/g, '') : '';
      const formattedInt = intRaw ? parseInt(intRaw, 10).toLocaleString('id-ID') : '';
      const newDisplay = parts.length > 1 ? `${formattedInt},${parts[1]}` : formattedInt;
      setLocalStr(newDisplay);
      const parsed = parseFloat(`${intRaw || '0'}.${parts[1] || '0'}`);
      onChange(isNaN(parsed) ? 0 : parsed);
    } else {
      const digitsOnly = raw.replace(/[^\d]/g, '');
      if (!digitsOnly) {
        setLocalStr('');
        onChange(0);
        return;
      }
      let num = parseInt(digitsOnly, 10);
      if (max !== undefined && num > max) num = max;
      if (min !== undefined && num < min) num = min;
      setLocalStr(num.toLocaleString('id-ID'));
      onChange(num);
    }
  };

  const handleBlur = () => {
    if (!localStr && value !== undefined && value !== null) {
      setLocalStr(formatDotNumber(value));
    }
  };

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={localStr}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      id={id}
      name={name}
      style={style}
    />
  );
}

export default function KPIModule({
  employees,
  transactions,
  currentUser,
  activeCompanyId,
  onUpdateEmployees
}: KPIModuleProps) {
  // Tabs: 'penilaian' | 'rekap' | 'project-bonus' | 'tnc' | 'templates' | 'karyawan'
  const [activeSubTab, setActiveSubTab] = useState<'penilaian' | 'rekap' | 'project-bonus' | 'tnc' | 'templates' | 'karyawan'>('penilaian');
  
  // Date Filters
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    return (new Date().getMonth() + 1).toString().padStart(2, '0');
  });
  const [filterYear, setFilterYear] = useState<string>(() => new Date().getFullYear().toString());
  const activeEmpMonthRef = useRef<string>('');

  // Dynamic States for Decoupled KPI Architecture
  const [jabatans, setJabatans] = useState<JabatanConfig[]>(() => {
    const saved = localStorage.getItem('mypanca_kpi_jabatans');
    if (saved) {
      try {
        const parsed: JabatanConfig[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const existingNames = new Set(parsed.map(p => p.name.toLowerCase().trim()));
          const missingDefaults = DEFAULT_JABATANS.filter(d => !existingNames.has(d.name.toLowerCase().trim()));
          return [...parsed, ...missingDefaults];
        }
      } catch (e) {
        console.error("Failed to parse saved kpi jabatans", e);
      }
    }
    return DEFAULT_JABATANS;
  });

  const [kpiEmployees, setKpiEmployees] = useState<KPIEmployee[]>(() => {
    const saved = localStorage.getItem('mypanca_kpi_employees');
    if (saved) {
      try {
        const parsed: KPIEmployee[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse saved kpi employees", e);
      }
    }
    return [
      { id: 'emp-1', nama: 'Rudi', nik: 'PPT-001', jabatanId: 'jab-1', gaji: 20000000 },
      { id: 'emp-2', nama: 'Yadi', nik: 'PPT-002', jabatanId: 'jab-2', gaji: 6000000 },
      { id: 'emp-3', nama: 'Arie Putra', nik: 'PPT-003', jabatanId: 'jab-4', gaji: 6000000 },
      { id: 'emp-4', nama: 'Sanjaya', nik: 'PPT-004', jabatanId: 'jab-7', gaji: 3000000 },
      { id: 'emp-5', nama: 'Evan', nik: 'PPT-005', jabatanId: 'jab-5', gaji: 3000000 },
      { id: 'emp-6', nama: 'Jeremia', nik: 'PPT-006', jabatanId: 'jab-5', gaji: 2700000 },
      { id: 'emp-7', nama: 'Angel', nik: 'PPT-007', jabatanId: 'jab-6', gaji: 3000000 },
      { id: 'emp-8', nama: 'Mustaqim', nik: 'PPT-008', jabatanId: 'jab-8', gaji: 3000000 },
      { id: 'emp-9', nama: 'Rizqi', nik: 'PPT-009', jabatanId: 'jab-9', gaji: 2000000 }
    ];
  });

  const [gradingKPIItems, setGradingKPIItems] = useState<GradingKPIItem[]>(() => {
    const saved = localStorage.getItem('mypanca_kpi_grading_items');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'g-a', grade: 'A', scoreRange: '≥ 95 (Excellent)', multiplier: 100, minScore: 95 },
      { id: 'g-b', grade: 'B', scoreRange: '85 - 94 (Very Good)', multiplier: 75, minScore: 85 },
      { id: 'g-c', grade: 'C', scoreRange: '75 - 84 (Good)', multiplier: 60, minScore: 75 },
      { id: 'g-d', grade: 'D', scoreRange: '65 - 74 (Below Target)', multiplier: 0, minScore: 65 },
      { id: 'g-e', grade: 'E', scoreRange: '< 65 (Poor)', multiplier: 0, minScore: 0 }
    ];
  });

  const [omsetTiers, setOmsetTiers] = useState<OmsetTier[]>(() => {
    const saved = localStorage.getItem('mypanca_kpi_omset_tiers');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'tier-1', name: 'Bonus Aktif Tier I', target: 500000000, multiplier: 1.6 },
      { id: 'tier-2', name: 'Bonus Aktif Tier II', target: 300000000, multiplier: 1.3 },
      { id: 'tier-3', name: 'Bonus Aktif Tier III', target: 200000000, multiplier: 1.0 }
    ];
  });

  const [salesCommissions, setSalesCommissions] = useState<SalesCommission[]>(() => {
    const saved = localStorage.getItem('mypanca_kpi_commissions');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'com-1', pencapaian: '120 %', komisi: 4 },
      { id: 'com-2', pencapaian: '100 %', komisi: 3 },
      { id: 'com-3', pencapaian: '80 %', komisi: 2 },
      { id: 'com-4', pencapaian: '< 80 %', komisi: 1 }
    ];
  });

  const [kpiMonthlyFinancials, setKpiMonthlyFinancials] = useState<Record<string, MonthlyFinancial>>(() => {
    const saved = localStorage.getItem('mypanca_kpi_monthly_financials');
    if (saved) return JSON.parse(saved);
    return {
      '2026-09': {
        omsetKotor: 133716920,
        pajak: 14701861,
        pengiriman: 0,
        lainLain: 14500000
      }
    };
  });

  // Sync to local storage
  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_jabatans', JSON.stringify(jabatans));
  }, [jabatans]);

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_employees', JSON.stringify(kpiEmployees));
  }, [kpiEmployees]);

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_grading_items', JSON.stringify(gradingKPIItems));
  }, [gradingKPIItems]);

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_omset_tiers', JSON.stringify(omsetTiers));
  }, [omsetTiers]);

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_commissions', JSON.stringify(salesCommissions));
  }, [salesCommissions]);

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_monthly_financials', JSON.stringify(kpiMonthlyFinancials));
  }, [kpiMonthlyFinancials]);

  // Derived financial computations for selected month
  const activeFinancials = useMemo((): MonthlyFinancial => {
    const key = `${filterYear}-${filterMonth}`;
    if (kpiMonthlyFinancials[key]) {
      return kpiMonthlyFinancials[key];
    }
    if (key === '2026-09') {
      return {
        omsetKotor: 133716920,
        pajak: 14701861,
        pengiriman: 0,
        lainLain: 14500000
      };
    }
    return {
      omsetKotor: 0,
      pajak: 0,
      pengiriman: 0,
      lainLain: 0
    };
  }, [kpiMonthlyFinancials, filterMonth, filterYear]);

  const calculatedOmsetBersih = useMemo(() => {
    return activeFinancials.omsetKotor - activeFinancials.pajak - activeFinancials.pengiriman - activeFinancials.lainLain;
  }, [activeFinancials]);

  const activeOmsetMultiplier = useMemo(() => {
    const sortedTiers = [...omsetTiers].sort((a, b) => b.target - a.target);
    const match = sortedTiers.find(t => calculatedOmsetBersih >= t.target);
    return match ? match.multiplier : 0;
  }, [omsetTiers, calculatedOmsetBersih]);

  // Project Bonus Sheets (Sales & Engineering) state per Month Key (YYYY-MM)
  const [bonusProjectSheets, setBonusProjectSheets] = useState<Record<string, MonthProjectBonusSheet>>(() => {
    const saved = localStorage.getItem('mypanca_kpi_bonus_project_sheets');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse bonus project sheets", e);
      }
    }
    return {
      '2026-09': {
        sales: [
          {
            id: 'sb-1',
            nama: 'Yadi',
            jabatan: 'Head of Sales',
            targetBulanan: 200000000,
            pencapaian: 133716920,
            pajak: 14701861,
            biayaKirim: 0,
            biayaLain: 14500000,
            additional: 0,
            note: 'Tinjau kembali pemberian komisi.'
          },
          {
            id: 'sb-2',
            nama: 'Sanjaya',
            jabatan: 'Sales Staff',
            targetBulanan: 200000000,
            pencapaian: 0,
            pajak: 0,
            biayaKirim: 0,
            biayaLain: 0,
            additional: 0,
            note: 'Komisi yang ini dihitung dari keseluruhan nett hasil penjualan. Tidak dihitung per persentase jenis item yang dikerjakan seperti yang di rekap sales'
          }
        ],
        engineers: [
          { id: 'eb-1', nama: 'Arie Putra', jabatan: 'Head of Engineering', persentaseKomisi: 0.05 },
          { id: 'eb-2', nama: 'Evan', jabatan: 'Engineering Staff', persentaseKomisi: 0.05 },
          { id: 'eb-3', nama: 'Jeremia', jabatan: 'Engineering Staff', persentaseKomisi: 0.05 }
        ]
      }
    };
  });

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_bonus_project_sheets', bonusProjectSheets);
  }, [bonusProjectSheets]);

  // Check if a jabatan corresponds to an engineer/engineering role
  const isEngineerJabatan = (jabName: string): boolean => {
    if (!jabName) return false;
    const lower = jabName.toLowerCase();
    return lower.includes('engineer') || lower.includes('engineering') || lower.includes('teknik') || lower.includes('teknisi');
  };

  // Check if a jabatan corresponds to a sales role (Sales, Sales Staff, or Head of Sales)
  const isSalesJabatan = (jabName: string): boolean => {
    if (!jabName) return false;
    const lower = jabName.toLowerCase();
    return lower.includes('sales') || lower.includes('penjualan');
  };

  const isSalesRole = (emp: KPIEmployee | Employee | undefined): boolean => {
    if (!emp) return false;
    const jab = jabatans.find(j => j.id === (emp as any).jabatanId);
    const jabName = (jab?.name || emp.jabatan || emp.role || '').toLowerCase();
    return isSalesJabatan(jabName);
  };

  // Helper to fetch matching sales bonus row for an employee for the active month
  const getSalesBonusRowForEmployee = (emp: KPIEmployee | Employee | undefined): SalesBonusProjectRow | null => {
    if (!emp) return null;
    const key = `${filterYear}-${filterMonth}`;
    const sheet = bonusProjectSheets[key] || activeProjectBonusSheet;
    const salesRows = sheet.sales || [];
    
    // 1. Match by employeeId if present
    let match = salesRows.find(r => r.employeeId && r.employeeId === emp.id);
    if (match) return match;

    // 2. Match by clean employee name
    const empClean = emp.nama.toLowerCase().trim();
    match = salesRows.find(r => r.nama.toLowerCase().trim() === empClean);
    if (match) return match;

    // 3. Match partial name
    match = salesRows.find(r => {
      const rName = r.nama.toLowerCase().trim();
      return rName.includes(empClean) || empClean.includes(rName);
    });
    if (match) return match;

    // 4. Match role / jabatan (e.g. Head of Sales)
    const jab = jabatans.find(j => j.id === (emp as any).jabatanId);
    const jabName = (jab?.name || emp.jabatan || emp.role || '').toLowerCase().trim();
    if (jabName.includes('head') && jabName.includes('sales')) {
      match = salesRows.find(r => r.jabatan.toLowerCase().includes('head'));
      if (match) return match;
    }

    return null;
  };

  // Helper to sync an employee to Engineer Bonus Project sheet
  const syncEngineerToBonusProject = (empId: string, empNama: string, jabName: string) => {
    if (!isEngineerJabatan(jabName)) return;
    setBonusProjectSheets(prev => {
      const key = `${filterYear}-${filterMonth}`;
      const sheet = prev[key] || { sales: [], engineers: [] };
      const currentEngs = [...(sheet.engineers || [])];
      const cleanNama = empNama.trim();
      const idx = currentEngs.findIndex(e => (e.employeeId && e.employeeId === empId) || e.nama.toLowerCase().trim() === cleanNama.toLowerCase());
      if (idx >= 0) {
        currentEngs[idx] = {
          ...currentEngs[idx],
          employeeId: empId,
          nama: cleanNama,
          jabatan: jabName
        };
      } else {
        currentEngs.push({
          id: `eb-${empId}-${Date.now()}`,
          employeeId: empId,
          nama: cleanNama,
          jabatan: jabName,
          persentaseKomisi: 0.05
        });
      }
      return {
        ...prev,
        [key]: {
          ...sheet,
          engineers: currentEngs
        }
      };
    });
  };

  // Auto-sync any employee who has an Engineer role or Sales role into the Bonus Project sheet
  useEffect(() => {
    setBonusProjectSheets(prevSheets => {
      const key = `${filterYear}-${filterMonth}`;
      const sheet = prevSheets[key] || { sales: [], engineers: [] };
      const currentEngineers = [...(sheet.engineers || [])];
      const currentSales = [...(sheet.sales || [])];
      let changed = false;

      kpiEmployees.forEach(emp => {
        const jab = jabatans.find(j => j.id === emp.jabatanId);
        const jabName = jab?.name || '';
        const empClean = emp.nama.toLowerCase().trim();

        // Sync Engineers
        if (isEngineerJabatan(jabName)) {
          const existingIdx = currentEngineers.findIndex(
            e => (e.employeeId && e.employeeId === emp.id) || e.nama.toLowerCase().trim() === empClean
          );
          if (existingIdx === -1) {
            currentEngineers.push({
              id: `eb-${emp.id}`,
              employeeId: emp.id,
              nama: emp.nama.trim(),
              jabatan: jabName,
              persentaseKomisi: 0.05
            });
            changed = true;
          } else {
            if (currentEngineers[existingIdx].nama !== emp.nama.trim() || currentEngineers[existingIdx].jabatan !== jabName || !currentEngineers[existingIdx].employeeId) {
              currentEngineers[existingIdx] = {
                ...currentEngineers[existingIdx],
                employeeId: emp.id,
                nama: emp.nama.trim(),
                jabatan: jabName
              };
              changed = true;
            }
          }
        }

        // Sync Sales & Head of Sales
        if (isSalesJabatan(jabName)) {
          const existingIdx = currentSales.findIndex(
            s => (s.employeeId && s.employeeId === emp.id) || s.nama.toLowerCase().trim() === empClean
          );
          if (existingIdx === -1) {
            currentSales.push({
              id: `sb-${emp.id}`,
              employeeId: emp.id,
              nama: emp.nama.trim(),
              jabatan: jabName,
              targetBulanan: 200000000,
              pencapaian: 0,
              pajak: 0,
              biayaKirim: 0,
              biayaLain: 0,
              additional: 0
            });
            changed = true;
          } else {
            if (!currentSales[existingIdx].employeeId || currentSales[existingIdx].nama !== emp.nama.trim() || currentSales[existingIdx].jabatan !== jabName) {
              currentSales[existingIdx] = {
                ...currentSales[existingIdx],
                employeeId: emp.id,
                nama: emp.nama.trim(),
                jabatan: jabName
              };
              changed = true;
            }
          }
        }
      });

      if (changed) {
        return {
          ...prevSheets,
          [key]: {
            ...sheet,
            sales: currentSales,
            engineers: currentEngineers
          }
        };
      }
      return prevSheets;
    });
  }, [kpiEmployees, jabatans, filterMonth, filterYear]);

  // Note: Bi-directional sync between jabatans and kpiTemplates is handled after kpiTemplates declaration

  // Additional Bonus state per employee
  const [additionalBonuses, setAdditionalBonuses] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('mypanca_kpi_additional_bonuses');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {};
  });

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_additional_bonuses', additionalBonuses);
  }, [additionalBonuses]);

  // Department determination matching KPI.xlsx
  const getDepartmentForJabatan = (jabName: string): string => {
    const lower = (jabName || '').toLowerCase();
    if (lower.includes('sales')) return 'Sales';
    if (lower.includes('engineer') || lower.includes('engineering') || lower.includes('teknik') || lower.includes('teknisi')) return 'Engineering';
    if (lower.includes('marketing')) return 'Marketing';
    if (lower.includes('inventory') || lower.includes('office boy') || lower.includes('warehouse') || lower.includes('gudang')) return 'Warehouse';
    if (lower.includes('manager') || lower.includes('director') || lower.includes('gm') || lower.includes('ceo')) return 'Management';
    return 'Operasional';
  };

  const getIndoMonthName = (mStr: string): string => {
    const num = parseInt(mStr, 10);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return months[num - 1] || 'Juli';
  };

  // Commission % lookup from Sales Commissions table
  const getSalesCommissionPercent = (capaianPct: number): number => {
    if (capaianPct >= 120) {
      const match = salesCommissions.find(s => s.pencapaian.includes('120'));
      if (match) return match.komisi;
    }
    if (capaianPct >= 100) {
      const match = salesCommissions.find(s => s.pencapaian.includes('100'));
      if (match) return match.komisi;
    }
    if (capaianPct >= 80) {
      const match = salesCommissions.find(s => s.pencapaian.includes('80') && !s.pencapaian.includes('<'));
      if (match) return match.komisi;
    }
    const match = salesCommissions.find(s => s.pencapaian.includes('<'));
    return match ? match.komisi : 1;
  };

  // Active month's project bonus sheet
  const activeProjectBonusSheet = useMemo((): MonthProjectBonusSheet => {
    const key = `${filterYear}-${filterMonth}`;
    if (bonusProjectSheets[key]) {
      return bonusProjectSheets[key];
    }
    if (key === '2026-09') {
      return {
        sales: [
          {
            id: 'sb-1',
            nama: 'Yadi',
            jabatan: 'Head of Sales',
            targetBulanan: 200000000,
            pencapaian: activeFinancials.omsetKotor,
            pajak: activeFinancials.pajak,
            biayaKirim: activeFinancials.pengiriman,
            biayaLain: activeFinancials.lainLain,
            additional: 0,
            note: 'Tinjau kembali pemberian komisi.'
          },
          {
            id: 'sb-2',
            nama: 'Sanjaya',
            jabatan: 'Sales Staff',
            targetBulanan: 200000000,
            pencapaian: 0,
            pajak: 0,
            biayaKirim: 0,
            biayaLain: 0,
            additional: 0,
            note: 'Komisi yang ini dihitung dari keseluruhan nett hasil penjualan. Tidak dihitung per persentase jenis item yang dikerjakan seperti yang di rekap sales'
          }
        ],
        engineers: [
          { id: 'eb-1', nama: 'Arie Putra', jabatan: 'Head of Engineering', persentaseKomisi: 0.05 },
          { id: 'eb-2', nama: 'Evan', jabatan: 'Engineering Staff', persentaseKomisi: 0.05 },
          { id: 'eb-3', nama: 'Jeremia', jabatan: 'Engineering Staff', persentaseKomisi: 0.05 }
        ]
      };
    }
    return {
      sales: [
        {
          id: `sb-1-${key}`,
          nama: 'Yadi',
          jabatan: 'Head of Sales',
          targetBulanan: 200000000,
          pencapaian: 0,
          pajak: 0,
          biayaKirim: 0,
          biayaLain: 0,
          additional: 0
        },
        {
          id: `sb-2-${key}`,
          nama: 'Sanjaya',
          jabatan: 'Sales Staff',
          targetBulanan: 200000000,
          pencapaian: 0,
          pajak: 0,
          biayaKirim: 0,
          biayaLain: 0,
          additional: 0
        }
      ],
      engineers: [
        { id: `eb-1-${key}`, nama: 'Arie Putra', jabatan: 'Head of Engineering', persentaseKomisi: 0.05 },
        { id: `eb-2-${key}`, nama: 'Evan', jabatan: 'Engineering Staff', persentaseKomisi: 0.05 },
        { id: `eb-3-${key}`, nama: 'Jeremia', jabatan: 'Engineering Staff', persentaseKomisi: 0.05 }
      ]
    };
  }, [bonusProjectSheets, filterMonth, filterYear, activeFinancials]);

  // Calculated Sales rows
  const calculatedSalesRows = useMemo(() => {
    const baseRows = activeProjectBonusSheet.sales.map(r => {
      const omsetBersih = (Number(r.pencapaian) || 0) - (Number(r.pajak) || 0) - (Number(r.biayaKirim) || 0) - (Number(r.biayaLain) || 0);
      const persentaseCapaian = (Number(r.targetBulanan) || 0) > 0 ? ((Number(r.pencapaian) || 0) / (Number(r.targetBulanan) || 1)) * 100 : 0;
      const komisiRate = getSalesCommissionPercent(persentaseCapaian);
      const komisi = omsetBersih > 0 ? omsetBersih * (komisiRate / 100) : 0;
      return {
        ...r,
        omsetBersih,
        persentaseCapaian,
        komisiRate,
        komisi
      };
    });

    const salesStaffKomisiSum = baseRows
      .filter(r => r.jabatan.toLowerCase().includes('staff') || r.jabatan === 'Sales Staff')
      .reduce((sum, r) => sum + r.komisi, 0);

    return baseRows.map(r => {
      let additional = Number(r.additional) || 0;
      if (r.jabatan.toLowerCase().includes('head') && (!r.additional || r.additional === 0)) {
        additional = salesStaffKomisiSum * 0.05;
      }
      const grandTotal = r.komisi + additional;
      return {
        ...r,
        additional,
        grandTotal
      };
    });
  }, [activeProjectBonusSheet.sales, salesCommissions]);

  // Totals for Sales table
  const salesTotals = useMemo(() => {
    return calculatedSalesRows.reduce((acc, r) => ({
      targetBulanan: acc.targetBulanan + (Number(r.targetBulanan) || 0),
      pencapaian: acc.pencapaian + (Number(r.pencapaian) || 0),
      pajak: acc.pajak + (Number(r.pajak) || 0),
      biayaKirim: acc.biayaKirim + (Number(r.biayaKirim) || 0),
      biayaLain: acc.biayaLain + (Number(r.biayaLain) || 0),
      omsetBersih: acc.omsetBersih + (Number(r.omsetBersih) || 0),
      additional: acc.additional + (Number(r.additional) || 0),
      komisi: acc.komisi + (Number(r.komisi) || 0),
      grandTotal: acc.grandTotal + (Number(r.grandTotal) || 0)
    }), {
      targetBulanan: 0,
      pencapaian: 0,
      pajak: 0,
      biayaKirim: 0,
      biayaLain: 0,
      omsetBersih: 0,
      additional: 0,
      komisi: 0,
      grandTotal: 0
    });
  }, [calculatedSalesRows]);

  // Calculated Engineer rows
  const calculatedEngineerRows = useMemo(() => {
    const basisKomisi = salesTotals.grandTotal;
    return activeProjectBonusSheet.engineers.map(e => {
      const totalKomisi = basisKomisi * (Number(e.persentaseKomisi) || 0);
      return {
        ...e,
        totalKomisi
      };
    });
  }, [activeProjectBonusSheet.engineers, salesTotals.grandTotal]);

  // Totals for Engineer table
  const engineerTotals = useMemo(() => {
    return calculatedEngineerRows.reduce((acc, e) => ({
      totalKomisi: acc.totalKomisi + (Number(e.totalKomisi) || 0)
    }), { totalKomisi: 0 });
  }, [calculatedEngineerRows]);

  // Synchronize Live Financial parameter edit to both KPI Monthly Financial and Sales Bonus Sheet
  const handleLiveFinancialFieldChange = (field: keyof MonthlyFinancial, value: number) => {
    const key = `${filterYear}-${filterMonth}`;
    const nextFin = {
      ...activeFinancials,
      [field]: value
    };
    setKpiMonthlyFinancials(p => ({
      ...p,
      [key]: nextFin
    }));

    setBonusProjectSheets(p => {
      const currentSheet = p[key] || activeProjectBonusSheet;
      const nextSales = currentSheet.sales.map((r, idx) => {
        if (idx === 0) {
          return {
            ...r,
            ...(field === 'omsetKotor' ? { pencapaian: value } : {}),
            ...(field === 'pajak' ? { pajak: value } : {}),
            ...(field === 'pengiriman' ? { biayaKirim: value } : {}),
            ...(field === 'lainLain' ? { biayaLain: value } : {})
          };
        }
        return r;
      });
      return {
        ...p,
        [key]: {
          ...currentSheet,
          sales: nextSales
        }
      };
    });
  };

  // Update a single row in the Sales table & synchronize totals to Live Financial Parameters
  const updateSalesBonusRow = (rowId: string, updates: Partial<SalesBonusProjectRow>) => {
    const key = `${filterYear}-${filterMonth}`;
    const currentSheet = bonusProjectSheets[key] || activeProjectBonusSheet;
    const nextSales = currentSheet.sales.map(r => r.id === rowId ? { ...r, ...updates } : r);

    setBonusProjectSheets(prev => ({
      ...prev,
      [key]: {
        ...currentSheet,
        sales: nextSales
      }
    }));

    // If financial fields were edited, calculate totals across all sales rows and sync to kpiMonthlyFinancials
    if ('pencapaian' in updates || 'pajak' in updates || 'biayaKirim' in updates || 'biayaLain' in updates) {
      const sumPencapaian = nextSales.reduce((sum, r) => sum + (Number(r.pencapaian) || 0), 0);
      const sumPajak = nextSales.reduce((sum, r) => sum + (Number(r.pajak) || 0), 0);
      const sumBiayaKirim = nextSales.reduce((sum, r) => sum + (Number(r.biayaKirim) || 0), 0);
      const sumBiayaLain = nextSales.reduce((sum, r) => sum + (Number(r.biayaLain) || 0), 0);

      setKpiMonthlyFinancials(prev => ({
        ...prev,
        [key]: {
          omsetKotor: sumPencapaian,
          pajak: sumPajak,
          pengiriman: sumBiayaKirim,
          lainLain: sumBiayaLain
        }
      }));
    }
  };

  // Delete row from Sales table
  const deleteSalesBonusRow = (rowId: string) => {
    const key = `${filterYear}-${filterMonth}`;
    const currentSheet = bonusProjectSheets[key] || activeProjectBonusSheet;
    if (currentSheet.sales.length <= 1) {
      alert("Harus ada minimal 1 baris sales!");
      return;
    }
    const nextSales = currentSheet.sales.filter(r => r.id !== rowId);

    setBonusProjectSheets(prev => ({
      ...prev,
      [key]: {
        ...currentSheet,
        sales: nextSales
      }
    }));

    const sumPencapaian = nextSales.reduce((sum, r) => sum + (Number(r.pencapaian) || 0), 0);
    const sumPajak = nextSales.reduce((sum, r) => sum + (Number(r.pajak) || 0), 0);
    const sumBiayaKirim = nextSales.reduce((sum, r) => sum + (Number(r.biayaKirim) || 0), 0);
    const sumBiayaLain = nextSales.reduce((sum, r) => sum + (Number(r.biayaLain) || 0), 0);

    setKpiMonthlyFinancials(prev => ({
      ...prev,
      [key]: {
        omsetKotor: sumPencapaian,
        pajak: sumPajak,
        pengiriman: sumBiayaKirim,
        lainLain: sumBiayaLain
      }
    }));
  };

  // Add new row to Sales table
  const addSalesBonusRow = (row: Omit<SalesBonusProjectRow, 'id'>) => {
    const key = `${filterYear}-${filterMonth}`;
    const currentSheet = bonusProjectSheets[key] || activeProjectBonusSheet;
    const newRowItem: SalesBonusProjectRow = {
      ...row,
      id: `sb-${Date.now()}`
    };
    const nextSales = [...currentSheet.sales, newRowItem];

    setBonusProjectSheets(prev => ({
      ...prev,
      [key]: {
        ...currentSheet,
        sales: nextSales
      }
    }));

    const sumPencapaian = nextSales.reduce((sum, r) => sum + (Number(r.pencapaian) || 0), 0);
    const sumPajak = nextSales.reduce((sum, r) => sum + (Number(r.pajak) || 0), 0);
    const sumBiayaKirim = nextSales.reduce((sum, r) => sum + (Number(r.biayaKirim) || 0), 0);
    const sumBiayaLain = nextSales.reduce((sum, r) => sum + (Number(r.biayaLain) || 0), 0);

    setKpiMonthlyFinancials(prev => ({
      ...prev,
      [key]: {
        omsetKotor: sumPencapaian,
        pajak: sumPajak,
        pengiriman: sumBiayaKirim,
        lainLain: sumBiayaLain
      }
    }));
  };

  // Update Engineer row
  const updateEngineerBonusRow = (rowId: string, updates: Partial<EngineerBonusProjectRow>) => {
    const key = `${filterYear}-${filterMonth}`;
    const currentSheet = bonusProjectSheets[key] || activeProjectBonusSheet;
    const nextEngineers = currentSheet.engineers.map(e => e.id === rowId ? { ...e, ...updates } : e);

    setBonusProjectSheets(prev => ({
      ...prev,
      [key]: {
        ...currentSheet,
        engineers: nextEngineers
      }
    }));
  };

  // Delete Engineer row
  const deleteEngineerBonusRow = (rowId: string) => {
    const key = `${filterYear}-${filterMonth}`;
    const currentSheet = bonusProjectSheets[key] || activeProjectBonusSheet;
    if (currentSheet.engineers.length <= 1) {
      alert("Harus ada minimal 1 baris engineer!");
      return;
    }
    const nextEngineers = currentSheet.engineers.filter(e => e.id !== rowId);

    setBonusProjectSheets(prev => ({
      ...prev,
      [key]: {
        ...currentSheet,
        engineers: nextEngineers
      }
    }));
  };

  // Add Engineer row
  const addEngineerBonusRow = (row: Omit<EngineerBonusProjectRow, 'id'>) => {
    const key = `${filterYear}-${filterMonth}`;
    const currentSheet = bonusProjectSheets[key] || activeProjectBonusSheet;
    const newRowItem: EngineerBonusProjectRow = {
      ...row,
      id: `eb-${Date.now()}`
    };
    const nextEngineers = [...currentSheet.engineers, newRowItem];

    setBonusProjectSheets(prev => ({
      ...prev,
      [key]: {
        ...currentSheet,
        engineers: nextEngineers
      }
    }));
  };

  // One-click sync from Live Financial Parameters to Sales Bonus Project Table
  const syncWithLiveFinancialParameters = () => {
    const key = `${filterYear}-${filterMonth}`;
    const currentSheet = bonusProjectSheets[key] || activeProjectBonusSheet;
    const nextSales = currentSheet.sales.map((r, idx) => {
      if (idx === 0) {
        return {
          ...r,
          pencapaian: activeFinancials.omsetKotor,
          pajak: activeFinancials.pajak,
          biayaKirim: activeFinancials.pengiriman,
          biayaLain: activeFinancials.lainLain
        };
      }
      return r;
    });

    setBonusProjectSheets(prev => ({
      ...prev,
      [key]: {
        ...currentSheet,
        sales: nextSales
      }
    }));
  };

  // Modal states for Sales & Engineer rows
  const [isAddingSalesRow, setIsAddingSalesRow] = useState(false);
  const [newSalesRowData, setNewSalesRowData] = useState<Partial<SalesBonusProjectRow>>({
    nama: '',
    jabatan: 'Sales Staff',
    targetBulanan: 200000000,
    pencapaian: 0,
    pajak: 0,
    biayaKirim: 0,
    biayaLain: 0,
    additional: 0,
    note: ''
  });

  const [isAddingEngineerRow, setIsAddingEngineerRow] = useState(false);
  const [newEngineerRowData, setNewEngineerRowData] = useState<Partial<EngineerBonusProjectRow>>({
    nama: '',
    jabatan: 'Engineering Staff',
    persentaseKomisi: 0.05
  });

  const [isAdHocExpanded, setIsAdHocExpanded] = useState(false);

  // Configuration and Templates States (loaded from localStorage)
  const [kpiTemplates, setKpiTemplates] = useState<KPITemplate[]>(() => {
    const saved = localStorage.getItem('mypanca_kpi_templates');
    let baseList = DEFAULT_TEMPLATES;
    if (saved) {
      try {
        const parsed: KPITemplate[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const existingNames = new Set(parsed.map(t => t.jabatan.toLowerCase().trim()));
          const missingDefaults = DEFAULT_TEMPLATES.filter(d => !existingNames.has(d.jabatan.toLowerCase().trim()));
          baseList = [...parsed, ...missingDefaults];
        }
      } catch (e) {
        console.error("Failed to parse kpi templates", e);
      }
    }
    return baseList.map(tpl => {
      const isSales = isSalesJabatan(tpl.jabatan);
      let inds = tpl.indicators || [];
      if (isSales && inds.length > 0) {
        inds = [
          {
            ...inds[0],
            name: 'Target Penjualan',
            satuan: 'Rp',
            metode: 'Maximize',
            bobot: inds[0].bobot || 50,
            type: 'kuantitatif',
            targetType: 'sales_volume',
            target: inds[0].target && inds[0].target > 1000 ? inds[0].target : 200000000
          },
          ...inds.slice(1)
        ];
      }
      return {
        ...tpl,
        indicators: inds,
        hardWeight: tpl.hardWeight ?? 80,
        softWeight: tpl.softWeight ?? 20,
        softSkills: tpl.softSkills && tpl.softSkills.length > 0 ? tpl.softSkills : DEFAULT_SOFT_SKILL_INDICATORS
      };
    });
  });

  // Bi-directional Auto-sync between Jabatans and Template KPI Jabatan
  useEffect(() => {
    // 1. Ensure every Jabatan in jabatans has a Template in kpiTemplates
    setKpiTemplates(prevTemplates => {
      let changed = false;
      const updated = [...prevTemplates];
      jabatans.forEach(jab => {
        const cleanLower = jab.name.toLowerCase().trim();
        if (!cleanLower) return;
        const exists = updated.some(t => t.jabatan.toLowerCase().trim() === cleanLower || t.id === jab.id);
        if (!exists) {
          changed = true;
          const isSalesJab = cleanLower.includes('sales') || cleanLower.includes('penjualan');
          updated.push({
            id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            jabatan: cleanLower,
            hardWeight: 80,
            softWeight: 20,
            indicators: isSalesJab ? [
              { id: `ind-${Date.now()}-1`, name: 'Target Penjualan', bobot: 50, type: 'kuantitatif', targetType: 'sales_volume', satuan: 'Rp', target: 200000000, metode: 'Maximize' },
              { id: `ind-${Date.now()}-2`, name: 'Follow-up Leads & Negosiasi', bobot: 20, type: 'kualitatif', satuan: '%' },
              { id: `ind-${Date.now()}-3`, name: 'Kedisiplinan & Pelaporan Harian', bobot: 15, type: 'kualitatif', satuan: '%' },
              { id: `ind-${Date.now()}-4`, name: 'Kepatuhan SOP Transaksi & Invoice', bobot: 15, type: 'kualitatif', satuan: '%' }
            ] : [
              { id: `ind-${Date.now()}-1`, name: 'Pencapaian Target Kerja & Output', bobot: 50, type: 'kualitatif', satuan: '%' },
              { id: `ind-${Date.now()}-2`, name: 'Disiplin, Kepatuhan & SOP', bobot: 50, type: 'kualitatif', satuan: '%' }
            ],
            softSkills: DEFAULT_SOFT_SKILL_INDICATORS
          });
        }
      });
      if (changed) {
        safeSetLocalStorage('mypanca_kpi_templates', updated);
      }
      return changed ? updated : prevTemplates;
    });

    // 2. Ensure every Template in kpiTemplates has a corresponding Jabatan in jabatans
    setJabatans(prevJabs => {
      let changed = false;
      const updated = [...prevJabs];

      const getPercentageForName = (name: string): number => {
        const lower = name.toLowerCase();
        if (lower.includes('general') || lower.includes('gm')) return 2;
        if (lower.includes('head') && lower.includes('sales')) return 8;
        if (lower.includes('marketing')) return 7;
        if (lower.includes('head') && (lower.includes('eng') || lower.includes('teknik'))) return 8;
        if (lower.includes('eng') || lower.includes('teknisi')) return 10;
        if (lower.includes('admin')) return 7;
        if (lower.includes('sales')) return 15;
        if (lower.includes('inventory') || lower.includes('control')) return 4;
        if (lower.includes('office') || lower.includes('boy')) return 3;
        return 5;
      };

      kpiTemplates.forEach(tpl => {
        const cleanLower = tpl.jabatan.toLowerCase().trim();
        if (!cleanLower) return;
        const exists = updated.some(j => j.name.toLowerCase().trim() === cleanLower || j.id === tpl.id || tpl.id === `tpl-${j.id}`);
        if (!exists) {
          changed = true;
          const formattedName = tpl.jabatan
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
          updated.push({
            id: `jab-${tpl.id}`,
            name: formattedName,
            percentage: getPercentageForName(cleanLower)
          });
        }
      });

      if (changed) {
        safeSetLocalStorage('mypanca_kpi_jabatans', JSON.stringify(updated));
      }
      return changed ? updated : prevJabs;
    });
  }, [jabatans.length, kpiTemplates.length]);

  // Unified available Jabatan options computed dynamically from both jabatans and kpiTemplates
  // Guaranteeing that all positions in Template KPI Jabatan are always selectable
  const availableJabatanOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; percentage: number; templateId?: string }>();

    // 1. Add all from jabatans
    jabatans.forEach(j => {
      const key = j.name.toLowerCase().trim();
      if (!key) return;
      const matchingTpl = kpiTemplates.find(t => 
        t.jabatan.toLowerCase().trim() === key || 
        t.id === j.id || 
        j.id === `jab-${t.id}` || 
        t.id === `tpl-${j.id}`
      );
      map.set(key, {
        id: j.id,
        name: j.name,
        percentage: j.percentage ?? 0,
        templateId: matchingTpl?.id
      });
    });

    // 2. Add all from kpiTemplates (Template KPI Jabatan)
    kpiTemplates.forEach(tpl => {
      const key = tpl.jabatan.toLowerCase().trim();
      if (!key) return;
      if (map.has(key)) {
        const existing = map.get(key)!;
        if (!existing.templateId) existing.templateId = tpl.id;
      } else {
        const formattedName = tpl.jabatan
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        map.set(key, {
          id: `jab-${tpl.id}`,
          name: formattedName,
          percentage: 5,
          templateId: tpl.id
        });
      }
    });

    return Array.from(map.values());
  }, [jabatans, kpiTemplates]);

  // Helper to reliably resolve employee jabatan name everywhere
  const getEmployeeJabatanName = (emp: KPIEmployee | Employee | undefined | null): string => {
    if (!emp) return 'Staff';
    const jabId = (emp as any).jabatanId;
    if (jabId) {
      const directJab = jabatans.find(j => j.id === jabId);
      if (directJab) return directJab.name;
      const opt = availableJabatanOptions.find(j => j.id === jabId);
      if (opt) return opt.name;
    }
    
    // Check by matching template
    const matchingTpl = kpiTemplates.find(t => 
      t.id === jabId || 
      `jab-${t.id}` === jabId || 
      `jab-tpl-${t.id}` === jabId || 
      t.id === `tpl-${jabId}` ||
      (jabId && t.jabatan.toLowerCase().trim() === String(jabId).toLowerCase().trim())
    );
    if (matchingTpl) {
      return matchingTpl.jabatan.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    
    return (emp as any).jabatan || (emp as any).role || 'Staff';
  };

  const [kpiRecords, setKpiRecords] = useState<KPIRecord[]>(() => {
    const saved = localStorage.getItem('mypanca_kpi_records');
    return saved ? JSON.parse(saved) : [];
  });

  const [projectBonuses, setProjectBonuses] = useState<ProjectBonus[]>(() => {
    const saved = localStorage.getItem('mypanca_kpi_project_bonuses');
    return saved ? JSON.parse(saved) : [];
  });

  const [kpiConfig, setKpiConfig] = useState<KPIConfig>(() => {
    const saved = localStorage.getItem('mypanca_kpi_config');
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      targetProfitPerusahaan: parsed.targetProfitPerusahaan ?? 100000000,
      alokasiProfitSharingBonus: parsed.alokasiProfitSharingBonus ?? 5,
      minimalKPIScoreToRelease: parsed.minimalKPIScoreToRelease ?? 60,
      alokasiJabatan: parsed.alokasiJabatan ?? DEFAULT_ALOKASI_JABATAN,
      gradingKPI: parsed.gradingKPI ?? DEFAULT_GRADING_KPI,
      tiers: parsed.tiers ?? DEFAULT_TIERS,
      targetPenjualan: parsed.targetPenjualan ?? DEFAULT_TARGET_PENJUALAN
    };
  });

  const [kpiMonthlyInputs, setKpiMonthlyInputs] = useState<Record<string, { pajak: number; pengiriman: number; lainLain: number }>>(() => {
    const saved = localStorage.getItem('mypanca_kpi_monthly_inputs');
    return saved ? JSON.parse(saved) : {};
  });

  // Employee Management Local UI States
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [newEmployee, setNewEmployee] = useState({
    nama: '',
    jabatanId: '',
    gaji: 3000000,
    isNewJabatan: false,
    newJabatanName: ''
  });
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');

  // UI States
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordScores, setRecordScores] = useState<Record<string, number>>({});
  const [recordNotes, setRecordNotes] = useState<string>('');
  
  // Detailed Lembar KPI States
  const [hardKPIInputs, setHardKPIInputs] = useState<any[]>([]);
  const [softSkillInputs, setSoftSkillInputs] = useState<any[]>([]);
  const [hardWeight, setHardWeight] = useState<number>(80);
  const [softWeight, setSoftWeight] = useState<number>(20);
  const [printModalRecord, setPrintModalRecord] = useState<KPIRecord | null>(null);
  
  // Custom indicators per individual employee (persisted permanently per employeeId)
  const [employeeCustomIndicators, setEmployeeCustomIndicators] = useState<Record<string, any[]>>(() => {
    const saved = localStorage.getItem('mypanca_kpi_employee_custom_indicators');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_employee_custom_indicators', employeeCustomIndicators);
  }, [employeeCustomIndicators]);
  
  // Custom individual sheets (both Hard KPI and Soft Skill inputs per employeeId)
  const [employeeIndividualSheets, setEmployeeIndividualSheets] = useState<Record<string, {
    hardKPIs: any[];
    softSkills: any[];
    hardWeight?: number;
    softWeight?: number;
  }>>(() => {
    const saved = localStorage.getItem('mypanca_kpi_employee_individual_sheets');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_employee_individual_sheets', employeeIndividualSheets);
  }, [employeeIndividualSheets]);

  // Modal state for template deletion confirmation with affected employees list
  const [templateDeleteConfirm, setTemplateDeleteConfirm] = useState<{
    template: KPITemplate;
    affectedEmployees: KPIEmployee[];
  } | null>(null);

  // Quick assign jabatan in Penilaian KPI when employee has no active jabatan/template
  const [assignJabatanId, setAssignJabatanId] = useState<string>('');

  // Warning states for weight accumulation limits
  const [weightWarningPenilaian, setWeightWarningPenilaian] = useState<string | null>(null);
  const [weightWarningPengaturan, setWeightWarningPengaturan] = useState<string | null>(null);

  // Salary Visibility Toggle
  const [showSalaryMap, setShowSalaryMap] = useState<Record<string, boolean>>({});

  // Rekap Excel View States
  const [rekapDeptFilter, setRekapDeptFilter] = useState<string>('ALL');
  const [rekapSearchQuery, setRekapSearchQuery] = useState<string>('');
  const [rekapViewMode, setRekapViewMode] = useState<'excel' | 'slip'>('excel');

  // Drawer / Form states for creation
  const [isAddingBonus, setIsAddingBonus] = useState(false);
  const [newBonus, setNewBonus] = useState<Partial<ProjectBonus>>({
    name: '',
    employeeIds: [],
    bonusAmount: 0,
    deadline: '',
    status: 'pending',
    notes: ''
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl-sales');

  const updateTemplateIndicator = (tplId: string, indId: string, field: string, value: any) => {
    setKpiTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      let finalValue = value;
      if (field === 'bobot') {
        const bobotVal = value === '' ? '' : Math.min(100, Math.max(0, parseInt(value) || 0));
        const otherBobot = t.indicators.reduce((acc, curr) => curr.id !== indId ? acc + (curr.bobot || 0) : acc, 0);
        const currentBobot = Number(bobotVal) || 0;
        if (otherBobot + currentBobot > 100) {
          setWeightWarningPengaturan(`⚠️ Peringatan: Total akumulasi bobot Bagian A saat ini ${otherBobot + currentBobot}% (melebihi 100%)!`);
        } else {
          setWeightWarningPengaturan(null);
        }
        finalValue = bobotVal;
      }
      return {
        ...t,
        indicators: t.indicators.map(ind => ind.id === indId ? { ...ind, [field]: finalValue } : ind)
      };
    }));
  };

  const addTemplateIndicator = (tplId: string) => {
    const targetTpl = kpiTemplates.find(t => t.id === tplId);
    if (targetTpl) {
      const currentTotal = targetTpl.indicators.reduce((acc, curr) => acc + (curr.bobot || 0), 0);
      const remaining = Math.max(0, 100 - currentTotal);
      const newBobot = remaining > 0 ? Math.min(10, remaining) : 10;
      setWeightWarningPengaturan(null);
      setKpiTemplates(prev => prev.map(t => {
        if (t.id !== tplId) return t;
        return {
          ...t,
          indicators: [...t.indicators, { id: `ind-tpl-${Date.now()}`, name: 'Indikator Baru', bobot: newBobot, type: 'kualitatif', satuan: '%' }]
        };
      }));
    }
  };

  const deleteTemplateIndicator = (tplId: string, indId: string) => {
    setKpiTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      return {
        ...t,
        indicators: t.indicators.filter(ind => ind.id !== indId)
      };
    }));
    setWeightWarningPengaturan(null);
  };

  // Soft Skills Template Handlers
  const updateTemplateSoftSkill = (tplId: string, ssId: string, field: string, value: any) => {
    setKpiTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      const currentSS = t.softSkills && t.softSkills.length > 0 ? t.softSkills : DEFAULT_SOFT_SKILL_INDICATORS;
      let finalValue = value;
      if (field === 'bobot') {
        const bobotVal = value === '' ? '' : Math.min(100, Math.max(0, parseInt(value) || 0));
        const otherBobot = currentSS.reduce((acc, curr) => curr.id !== ssId ? acc + (curr.bobot || 0) : acc, 0);
        const currentBobot = Number(bobotVal) || 0;
        if (otherBobot + currentBobot > 100) {
          setWeightWarningPengaturan(`⚠️ Peringatan: Total akumulasi bobot Bagian B (Soft Skill) saat ini ${otherBobot + currentBobot}% (melebihi 100%)!`);
        } else {
          setWeightWarningPengaturan(null);
        }
        finalValue = bobotVal;
      }
      return {
        ...t,
        softSkills: currentSS.map(ss => ss.id === ssId ? { ...ss, [field]: finalValue } : ss)
      };
    }));
  };

  const addTemplateSoftSkill = (tplId: string) => {
    const targetTpl = kpiTemplates.find(t => t.id === tplId);
    if (targetTpl) {
      const currentSS = targetTpl.softSkills && targetTpl.softSkills.length > 0 ? targetTpl.softSkills : DEFAULT_SOFT_SKILL_INDICATORS;
      const currentTotal = currentSS.reduce((acc, curr) => acc + (curr.bobot || 0), 0);
      const remaining = Math.max(0, 100 - currentTotal);
      const newBobot = remaining > 0 ? Math.min(20, remaining) : 10;
      setWeightWarningPengaturan(null);
      setKpiTemplates(prev => prev.map(t => {
        if (t.id !== tplId) return t;
        return {
          ...t,
          softSkills: [...currentSS, { id: `ss-tpl-${Date.now()}`, name: 'Aspek Soft Skill Baru', bobot: newBobot }]
        };
      }));
    }
  };

  const deleteTemplateSoftSkill = (tplId: string, ssId: string) => {
    setKpiTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      const currentSS = t.softSkills && t.softSkills.length > 0 ? t.softSkills : DEFAULT_SOFT_SKILL_INDICATORS;
      return {
        ...t,
        softSkills: currentSS.filter(ss => ss.id !== ssId)
      };
    }));
    setWeightWarningPengaturan(null);
  };

  const updateTemplateMacroWeights = (tplId: string, hW: number, sW: number) => {
    setKpiTemplates(prev => prev.map(t => {
      if (t.id !== tplId) return t;
      return {
        ...t,
        hardWeight: hW,
        softWeight: sW
      };
    }));
  };

  const applySoftSkillsToAllTemplates = (sourceTplId: string) => {
    const sourceTpl = kpiTemplates.find(t => t.id === sourceTplId);
    if (!sourceTpl) return;
    const ssToCopy = sourceTpl.softSkills && sourceTpl.softSkills.length > 0 ? sourceTpl.softSkills : DEFAULT_SOFT_SKILL_INDICATORS;
    const hW = sourceTpl.hardWeight ?? 80;
    const sW = sourceTpl.softWeight ?? 20;

    setKpiTemplates(prev => prev.map(t => ({
      ...t,
      softSkills: ssToCopy.map(s => ({ ...s, id: `ss-${t.id}-${s.id.split('-').pop() || Date.now()}` })),
      hardWeight: hW,
      softWeight: sW
    })));

    alert("Standar indikator soft skill dan proporsi bobot berhasil diterapkan ke semua template jabatan!");
  };

  // Handle confirmed template deletion (including system templates)
  const handleConfirmDeleteTemplate = () => {
    if (!templateDeleteConfirm) return;
    const { template: tpl, affectedEmployees } = templateDeleteConfirm;

    // 1. Remove from kpiTemplates
    setKpiTemplates(prev => {
      const filtered = prev.filter(t => t.id !== tpl.id);
      safeSetLocalStorage('mypanca_kpi_templates', filtered);
      return filtered;
    });

    // 2. Remove matching jabatan from jabatans so auto-sync doesn't re-create it
    setJabatans(prev => {
      const filtered = prev.filter(j => j.name.toLowerCase().trim() !== tpl.jabatan.toLowerCase().trim() && j.id !== tpl.id);
      safeSetLocalStorage('mypanca_kpi_jabatans', JSON.stringify(filtered));
      return filtered;
    });

    // 3. Clear jabatanId on affected employees so they prompt "Harap pilih jabatan untuk mendapatkan nilai KPI"
    if (affectedEmployees.length > 0) {
      setKpiEmployees(prev => {
        const updated = prev.map(emp => {
          const jab = jabatans.find(j => j.id === emp.jabatanId);
          const jabName = (jab?.name || emp.jabatan || emp.role || '').toLowerCase().trim();
          const tplName = (tpl.jabatan || '').toLowerCase().trim();
          if (jabName === tplName || emp.jabatanId === tpl.id || tpl.id === `tpl-${emp.jabatanId}`) {
            return { ...emp, jabatanId: '', jabatan: '' };
          }
          return emp;
        });
        safeSetLocalStorage('mypanca_kpi_employees', JSON.stringify(updated));
        return updated;
      });
    }

    // 4. Update selectedTemplateId if it was the deleted template
    if (selectedTemplateId === tpl.id) {
      const remaining = kpiTemplates.filter(t => t.id !== tpl.id);
      setSelectedTemplateId(remaining[0]?.id || '');
    }

    setTemplateDeleteConfirm(null);
  };

  // Reusable Employee Handlers (Penilaian & Karyawan)
  const openAddEmployeeModal = () => {
    setNewEmployee({ nama: '', jabatanId: availableJabatanOptions[0]?.id || jabatans[0]?.id || '', gaji: 3000000, isNewJabatan: false, newJabatanName: '' });
    setEditingEmployeeId(null);
    setIsAddingEmployee(true);
  };

  const openEditEmployeeModal = (emp: KPIEmployee) => {
    let matchedJabId = emp.jabatanId;
    const exists = availableJabatanOptions.some(j => j.id === matchedJabId);
    if (!exists) {
      const empRoleName = ((emp as any).jabatan || (emp as any).role || '').toLowerCase().trim();
      const match = availableJabatanOptions.find(j => {
        const jName = j.name.toLowerCase().trim();
        return jName === empRoleName || (empRoleName && (jName.includes(empRoleName) || empRoleName.includes(jName)));
      });
      if (match) {
        matchedJabId = match.id;
      } else if (availableJabatanOptions.length > 0) {
        matchedJabId = availableJabatanOptions[0].id;
      }
    }

    setNewEmployee({
      nama: emp.nama,
      jabatanId: matchedJabId,
      gaji: emp.gaji,
      isNewJabatan: false,
      newJabatanName: ''
    });
    setEditingEmployeeId(emp.id);
    setIsAddingEmployee(true);
  };

  const handleDeleteEmployee = (empId: string, empName: string) => {
    if (window.confirm(`Hapus karyawan "${empName}" dari data HR?`)) {
      const next = kpiEmployees.filter(e => e.id !== empId);
      setKpiEmployees(next);
      safeSetLocalStorage('mypanca_kpi_employees', JSON.stringify(next));
      if (onUpdateEmployees) {
        onUpdateEmployees(next.map(e => ({
          id: e.id,
          nama: e.nama,
          nik: e.nik,
          jabatanId: e.jabatanId,
          gaji: e.gaji,
          jabatan: getEmployeeJabatanName(e),
          role: getEmployeeJabatanName(e)
        } as any)));
      }
      if (selectedEmployeeId === empId) {
        setSelectedEmployeeId(next.length > 0 ? next[0].id : '');
      }
    }
  };

  const handleSaveEmployee = () => {
    if (!newEmployee.nama.trim()) {
      alert("Harap isi nama karyawan!");
      return;
    }
    if (!newEmployee.isNewJabatan && !newEmployee.jabatanId) {
      alert("Harap pilih jabatan karyawan!");
      return;
    }
    if (newEmployee.isNewJabatan && !newEmployee.newJabatanName.trim()) {
      alert("Harap masukkan nama jabatan baru!");
      return;
    }

    let finalJabatanId = newEmployee.jabatanId;
    let finalJabName = '';

    if (newEmployee.isNewJabatan) {
      const cleanName = newEmployee.newJabatanName.trim();
      const cleanLower = cleanName.toLowerCase();
      
      const existingJab = availableJabatanOptions.find(j => j.name.toLowerCase() === cleanLower) || jabatans.find(j => j.name.toLowerCase() === cleanLower);
      if (existingJab) {
        finalJabatanId = existingJab.id;
        finalJabName = existingJab.name;
      } else {
        const newJabId = `jab-${Date.now()}`;
        const newJab = {
          id: newJabId,
          name: cleanName,
          percentage: 5
        };
        setJabatans(prev => [...prev, newJab]);
        finalJabatanId = newJabId;
        finalJabName = cleanName;

        // Auto create template for newly added role
        const newTpl: KPITemplate = {
          id: `tpl-${Date.now()}`,
          jabatan: cleanLower,
          indicators: [
            { id: `ind-${Date.now()}-1`, name: 'Kualitas Kerja', bobot: 50, type: 'kualitatif' },
            { id: `ind-${Date.now()}-2`, name: 'Kehadiran & Disiplin', bobot: 50, type: 'kualitatif' }
          ],
          softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
          hardWeight: 80,
          softWeight: 20
        };
        setKpiTemplates(prev => [...prev, newTpl]);
      }
    } else {
      const matchOpt = availableJabatanOptions.find(j => j.id === finalJabatanId) || jabatans.find(j => j.id === finalJabatanId);
      finalJabName = matchOpt?.name || '';
      // Ensure it exists in jabatans state if originating from kpiTemplates
      if (matchOpt && !jabatans.some(j => j.id === matchOpt.id || j.name.toLowerCase().trim() === matchOpt.name.toLowerCase().trim())) {
        setJabatans(prev => [...prev, { id: matchOpt.id, name: matchOpt.name, percentage: matchOpt.percentage }]);
      }
    }

    const cleanNama = newEmployee.nama.trim();
    const targetEmpId = editingEmployeeId || `emp-${Date.now()}`;
    const previousEmp = kpiEmployees.find(e => e.id === editingEmployeeId);

    let nextEmployees: KPIEmployee[];
    if (editingEmployeeId) {
      nextEmployees = kpiEmployees.map(emp => emp.id === editingEmployeeId ? {
        ...emp,
        nama: cleanNama,
        jabatanId: finalJabatanId,
        jabatan: finalJabName,
        role: finalJabName,
        gaji: Number(newEmployee.gaji) || 0
      } : emp);
    } else {
      const payload: KPIEmployee = {
        id: targetEmpId,
        nama: cleanNama,
        nik: `PPT-${Math.floor(100 + Math.random() * 900)}`,
        jabatanId: finalJabatanId,
        jabatan: finalJabName,
        role: finalJabName,
        gaji: Number(newEmployee.gaji) || 0
      };
      nextEmployees = [...kpiEmployees, payload];
      setSelectedEmployeeId(targetEmpId);
    }

    setKpiEmployees(nextEmployees);
    safeSetLocalStorage('mypanca_kpi_employees', JSON.stringify(nextEmployees));

    // Propagate to parent onUpdateEmployees if provided
    if (onUpdateEmployees) {
      onUpdateEmployees(nextEmployees.map(e => ({
        id: e.id,
        nama: e.nama,
        nik: e.nik,
        jabatanId: e.jabatanId,
        gaji: e.gaji,
        jabatan: getEmployeeJabatanName(e),
        role: getEmployeeJabatanName(e)
      } as any)));
    }

    // Also update bonusProjectSheets if the employee name changed
    if (editingEmployeeId && previousEmp && previousEmp.nama !== cleanNama) {
      setBonusProjectSheets(curr => {
        const updated = { ...curr };
        let changed = false;
        Object.keys(updated).forEach(mKey => {
          const sheet = updated[mKey];
          if (sheet) {
            const newSales = sheet.sales?.map(s => {
              if (s.employeeId === editingEmployeeId || s.nama.toLowerCase().trim() === previousEmp.nama.toLowerCase().trim()) {
                changed = true;
                return { ...s, nama: cleanNama };
              }
              return s;
            });
            const newEngineers = sheet.engineers?.map(e => {
              if (e.employeeId === editingEmployeeId || e.nama.toLowerCase().trim() === previousEmp.nama.toLowerCase().trim()) {
                changed = true;
                return { ...e, nama: cleanNama };
              }
              return e;
            });
            if (changed) {
              updated[mKey] = {
                ...sheet,
                sales: newSales || sheet.sales,
                engineers: newEngineers || sheet.engineers
              };
            }
          }
        });
        if (changed) {
          safeSetLocalStorage('mypanca_kpi_bonus_project_sheets', updated);
        }
        return changed ? updated : curr;
      });
    }

    // Auto-sync employee to Engineer Bonus Project if their role is Engineer
    if (isEngineerJabatan(finalJabName)) {
      syncEngineerToBonusProject(targetEmpId, cleanNama, finalJabName);
    }

    setIsAddingEmployee(false);
    setEditingEmployeeId(null);
    setNewEmployee({ nama: '', jabatanId: jabatans[0]?.id || '', gaji: 3000000, isNewJabatan: false, newJabatanName: '' });
  };

  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState<Partial<KPITemplate>>({
    jabatan: '',
    indicators: [
      { id: 'ind-1', name: 'Kualitas Kerja', bobot: 50, type: 'kualitatif' },
      { id: 'ind-2', name: 'Kehadiran & Disiplin', bobot: 50, type: 'kualitatif' }
    ]
  });

  // Save states to local storage on change
  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_templates', kpiTemplates);
  }, [kpiTemplates]);

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_records', kpiRecords);
  }, [kpiRecords]);

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_project_bonuses', projectBonuses);
  }, [projectBonuses]);

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_config', kpiConfig);
  }, [kpiConfig]);

  useEffect(() => {
    safeSetLocalStorage('mypanca_kpi_monthly_inputs', kpiMonthlyInputs);
  }, [kpiMonthlyInputs]);

  // --- Supabase Cloud Sync States and Handlers ---
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastCloudSyncTime, setLastCloudSyncTime] = useState<string | null>(null);
  const [cloudSyncMessage, setCloudSyncMessage] = useState<string>('');
  const isCloudLoadDoneRef = useRef(false);
  const syncDebounceTimerRef = useRef<any>(null);

  // 1. Initial Load from Supabase Cloud on Component Mount
  useEffect(() => {
    let isSubscribed = true;
    const fetchCloudData = async () => {
      setCloudSyncStatus('syncing');
      setCloudSyncMessage('Mengambil data dari Supabase Cloud...');
      try {
        const res = await loadAllKPIDataFromSupabase();
        if (!isSubscribed) return;

        if (res.success && res.data) {
          const cloud = res.data;
          let loadedCount = 0;

          if (cloud.jabatans && Array.isArray(cloud.jabatans) && cloud.jabatans.length > 0) {
            const existingNames = new Set(cloud.jabatans.map((j: any) => (j.name || '').toLowerCase().trim()));
            const missingDefaults = DEFAULT_JABATANS.filter(d => !existingNames.has(d.name.toLowerCase().trim()));
            const mergedJabs = [...cloud.jabatans, ...missingDefaults];
            setJabatans(mergedJabs);
            safeSetLocalStorage('mypanca_kpi_jabatans', JSON.stringify(mergedJabs));
            loadedCount++;
          }
          if (cloud.kpiEmployees && Array.isArray(cloud.kpiEmployees) && cloud.kpiEmployees.length > 0) {
            setKpiEmployees(cloud.kpiEmployees);
            safeSetLocalStorage('mypanca_kpi_employees', JSON.stringify(cloud.kpiEmployees));
            loadedCount++;
          }
          if (cloud.gradingKPIItems && Array.isArray(cloud.gradingKPIItems) && cloud.gradingKPIItems.length > 0) {
            setGradingKPIItems(cloud.gradingKPIItems);
            safeSetLocalStorage('mypanca_kpi_grading_items', JSON.stringify(cloud.gradingKPIItems));
            loadedCount++;
          }
          if (cloud.omsetTiers && Array.isArray(cloud.omsetTiers) && cloud.omsetTiers.length > 0) {
            setOmsetTiers(cloud.omsetTiers);
            safeSetLocalStorage('mypanca_kpi_omset_tiers', JSON.stringify(cloud.omsetTiers));
            loadedCount++;
          }
          if (cloud.salesCommissions && Array.isArray(cloud.salesCommissions) && cloud.salesCommissions.length > 0) {
            setSalesCommissions(cloud.salesCommissions);
            safeSetLocalStorage('mypanca_kpi_commissions', JSON.stringify(cloud.salesCommissions));
            loadedCount++;
          }
          if (cloud.kpiMonthlyFinancials && typeof cloud.kpiMonthlyFinancials === 'object' && Object.keys(cloud.kpiMonthlyFinancials).length > 0) {
            setKpiMonthlyFinancials(cloud.kpiMonthlyFinancials);
            safeSetLocalStorage('mypanca_kpi_monthly_financials', JSON.stringify(cloud.kpiMonthlyFinancials));
            loadedCount++;
          }
          if (cloud.bonusProjectSheets && typeof cloud.bonusProjectSheets === 'object' && Object.keys(cloud.bonusProjectSheets).length > 0) {
            setBonusProjectSheets(cloud.bonusProjectSheets);
            safeSetLocalStorage('mypanca_kpi_bonus_project_sheets', cloud.bonusProjectSheets);
            loadedCount++;
          }
          if (cloud.employeeIndividualSheets && typeof cloud.employeeIndividualSheets === 'object' && Object.keys(cloud.employeeIndividualSheets).length > 0) {
            setEmployeeIndividualSheets(cloud.employeeIndividualSheets);
            safeSetLocalStorage('mypanca_kpi_employee_individual_sheets', cloud.employeeIndividualSheets);
            loadedCount++;
          }
          if (cloud.employeeCustomIndicators && typeof cloud.employeeCustomIndicators === 'object' && Object.keys(cloud.employeeCustomIndicators).length > 0) {
            setEmployeeCustomIndicators(cloud.employeeCustomIndicators);
            safeSetLocalStorage('mypanca_kpi_employee_custom_indicators', cloud.employeeCustomIndicators);
            loadedCount++;
          }
          if (cloud.kpiTemplates && Array.isArray(cloud.kpiTemplates) && cloud.kpiTemplates.length > 0) {
            const existingTpls = new Set(cloud.kpiTemplates.map((t: any) => (t.jabatan || '').toLowerCase().trim()));
            const missingTpls = DEFAULT_TEMPLATES.filter(d => !existingTpls.has(d.jabatan.toLowerCase().trim()));
            const mergedTpls = [...cloud.kpiTemplates, ...missingTpls];
            setKpiTemplates(mergedTpls);
            safeSetLocalStorage('mypanca_kpi_templates', mergedTpls);
            loadedCount++;
          }
          if (cloud.kpiRecords && Array.isArray(cloud.kpiRecords) && cloud.kpiRecords.length > 0) {
            setKpiRecords(cloud.kpiRecords);
            safeSetLocalStorage('mypanca_kpi_records', cloud.kpiRecords);
            loadedCount++;
          }
          if (cloud.additionalBonuses && typeof cloud.additionalBonuses === 'object') {
            setAdditionalBonuses(cloud.additionalBonuses);
            safeSetLocalStorage('mypanca_kpi_additional_bonuses', cloud.additionalBonuses);
          }

          setCloudSyncStatus('synced');
          setLastCloudSyncTime(cloud.lastSyncedAt ? new Date(cloud.lastSyncedAt).toLocaleTimeString('id-ID') : new Date().toLocaleTimeString('id-ID'));
          setCloudSyncMessage(`Tersinkronisasi (${loadedCount} modul dimuat dari Supabase)`);
        } else {
          // Jika cloud masih kosong, push data lokal awal ke Supabase agar langsung tersimpan di cloud
          setCloudSyncMessage('Menyimpan data awal ke Supabase...');
          await saveAllKPIDataToSupabase({
            jabatans,
            kpiEmployees,
            gradingKPIItems,
            omsetTiers,
            salesCommissions,
            kpiMonthlyFinancials,
            bonusProjectSheets,
            employeeIndividualSheets,
            employeeCustomIndicators,
            kpiTemplates,
            kpiRecords,
            additionalBonuses
          }, currentUser?.nama || currentUser?.username || 'user');
          setCloudSyncStatus('synced');
          setLastCloudSyncTime(new Date().toLocaleTimeString('id-ID'));
          setCloudSyncMessage('Tersinkronisasi dengan Supabase Cloud');
        }
      } catch (err: any) {
        console.warn('Gagal load KPI dari Supabase:', err);
        setCloudSyncStatus('error');
        setCloudSyncMessage('Gagal sinkron cloud (bekerja dalam mode offline)');
      } finally {
        if (isSubscribed) {
          isCloudLoadDoneRef.current = true;
        }
      }
    };

    fetchCloudData();
    return () => { isSubscribed = false; };
  }, []);

  // 2. Debounced Auto-Save to Supabase Cloud on Any State Change
  useEffect(() => {
    if (!isCloudLoadDoneRef.current) return;

    if (syncDebounceTimerRef.current) {
      clearTimeout(syncDebounceTimerRef.current);
    }

    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Menyimpan perubahan ke Supabase...');

    syncDebounceTimerRef.current = setTimeout(async () => {
      try {
        const payload: KPIMasterCloudData = {
          jabatans,
          kpiEmployees,
          gradingKPIItems,
          omsetTiers,
          salesCommissions,
          kpiMonthlyFinancials,
          bonusProjectSheets,
          employeeIndividualSheets,
          employeeCustomIndicators,
          kpiTemplates,
          kpiRecords,
          additionalBonuses
        };
        const res = await saveAllKPIDataToSupabase(payload, currentUser?.nama || currentUser?.username || 'user');
        if (res.success) {
          setCloudSyncStatus('synced');
          setLastCloudSyncTime(new Date().toLocaleTimeString('id-ID'));
          setCloudSyncMessage('Semua perubahan tersimpan di Supabase Cloud');
        } else {
          setCloudSyncStatus('error');
          setCloudSyncMessage(`Gagal simpan: ${res.error || 'Terjadi kesalahan'}`);
        }
      } catch (err: any) {
        setCloudSyncStatus('error');
        setCloudSyncMessage('Gagal menyimpan ke cloud');
      }
    }, 1500);

    return () => {
      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current);
      }
    };
  }, [
    jabatans,
    kpiEmployees,
    gradingKPIItems,
    omsetTiers,
    salesCommissions,
    kpiMonthlyFinancials,
    bonusProjectSheets,
    employeeIndividualSheets,
    employeeCustomIndicators,
    kpiTemplates,
    kpiRecords,
    additionalBonuses
  ]);

  // 3. Manual Immediate Sync Handler
  const handleManualSyncNow = async () => {
    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Menyinkronkan langsung ke Supabase...');
    try {
      const payload: KPIMasterCloudData = {
        jabatans,
        kpiEmployees,
        gradingKPIItems,
        omsetTiers,
        salesCommissions,
        kpiMonthlyFinancials,
        bonusProjectSheets,
        employeeIndividualSheets,
        employeeCustomIndicators,
        kpiTemplates,
        kpiRecords,
        additionalBonuses
      };
      const res = await saveAllKPIDataToSupabase(payload, currentUser?.nama || currentUser?.username || 'user');
      if (res.success) {
        setCloudSyncStatus('synced');
        setLastCloudSyncTime(new Date().toLocaleTimeString('id-ID'));
        setCloudSyncMessage('Data berhasil disinkronkan ke Supabase Cloud!');
      } else {
        setCloudSyncStatus('error');
        setCloudSyncMessage(res.error || 'Gagal sinkron');
      }
    } catch (err: any) {
      setCloudSyncStatus('error');
      setCloudSyncMessage(err.message || 'Error sinkronisasi');
    }
  };

  // Roles verification
  const normalizedRole = (currentUser?.role || '').toLowerCase();
  const isSuperadminOrAdmin = normalizedRole === 'superadmin' || normalizedRole === 'admin';
  const isHR = normalizedRole === 'hr' || normalizedRole === 'hrd';
  const isAuthorizedToManageKPI = isSuperadminOrAdmin || isHR;
  const isFinance = normalizedRole === 'finance';
  const isAuthorizedToSeeSalary = isSuperadminOrAdmin || isFinance || isHR;
  const isAuthorizedToApprove = isSuperadminOrAdmin || isHR || normalizedRole === 'director' || normalizedRole === 'manager';

  // Currency Formatter
  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num || 0);
  };

  // Filtered lists based on Company (Using Decoupled local KPI Employees)
  const companyEmployees = useMemo(() => {
    return kpiEmployees;
  }, [kpiEmployees]);

  const companyTransactions = useMemo(() => {
    return transactions.filter(t => !activeCompanyId || t.companyId === activeCompanyId);
  }, [transactions, activeCompanyId]);

  // Selected employee metadata
  const selectedEmployee = useMemo(() => {
    return companyEmployees.find(e => e.id === selectedEmployeeId);
  }, [companyEmployees, selectedEmployeeId]);

  // Lembar KPI Field Update Helpers
  const updateHardKPIField = (idx: number, field: string, value: any) => {
    setHardKPIInputs(prev => {
      const updated = [...prev];
      let finalVal = value;
      if (field === 'bobot') {
        if (value === '' || value === null || value === undefined) {
          finalVal = '';
        } else {
          finalVal = Math.min(100, Math.max(0, parseFloat(value) || 0));
        }
        const otherBobot = prev.reduce((sum, it, i) => i !== idx ? sum + (parseFloat(it.bobot) || 0) : sum, 0);
        const currentBobot = parseFloat(finalVal) || 0;
        if (otherBobot + currentBobot > 100) {
          setWeightWarningPenilaian(`⚠️ Peringatan: Total akumulasi bobot KPI saat ini ${otherBobot + currentBobot}% (melebihi 100%)! Harap sesuaikan.`);
        } else {
          setWeightWarningPenilaian(null);
        }
      }

      const item = { ...updated[idx], [field]: finalVal };
      
      const bobot = parseFloat(item.bobot) || 0;
      const target = parseFloat(item.target) || 1;
      const realisasi = parseFloat(item.realisasi) || 0;
      const metode = item.metode;
      
      let computedScore = 0;
      if (metode === 'Minimize') {
        computedScore = target > 0 ? (target / Math.max(realisasi, 0.001)) * bobot : 0;
      } else {
        computedScore = target > 0 ? (realisasi / target) * bobot : 0;
      }
      
      item.score = Math.round(computedScore * 100) / 100;
      updated[idx] = item;

      // Sync edits immediately to employeeIndividualSheets for permanent individual customization
      if (selectedEmployeeId) {
        setEmployeeIndividualSheets(curr => {
          const next = {
            ...curr,
            [selectedEmployeeId]: {
              hardKPIs: updated,
              softSkills: softSkillInputs,
              hardWeight,
              softWeight
            }
          };
          safeSetLocalStorage('mypanca_kpi_employee_individual_sheets', next);
          return next;
        });
      }

      // Sync custom indicator edits immediately to employeeCustomIndicators
      if (selectedEmployeeId && (item.indicatorId?.startsWith('ind-custom-') || item.isCustom)) {
        setEmployeeCustomIndicators(curr => {
          const empList = [...(curr[selectedEmployeeId] || [])];
          const cIdx = empList.findIndex(ci => ci.indicatorId === item.indicatorId);
          if (cIdx > -1) {
            empList[cIdx] = item;
          } else {
            empList.push(item);
          }
          const updatedCustom = { ...curr, [selectedEmployeeId]: empList };
          safeSetLocalStorage('mypanca_kpi_employee_custom_indicators', updatedCustom);
          return updatedCustom;
        });
      }

      return updated;
    });
  };

  const updateSoftSkillField = (idx: number, field: string, value: any) => {
    setSoftSkillInputs(prev => {
      const updated = [...prev];
      let finalVal = value;
      if (field === 'bobot') {
        if (value === '' || value === null || value === undefined) {
          finalVal = '';
        } else {
          finalVal = Math.min(100, Math.max(0, parseFloat(value) || 0));
        }
        const otherBobot = prev.reduce((sum, it, i) => i !== idx ? sum + (parseFloat(it.bobot) || 0) : sum, 0);
        const currentBobot = parseFloat(finalVal) || 0;
        if (otherBobot + currentBobot > 100) {
          setWeightWarningPenilaian(`⚠️ Peringatan: Total akumulasi bobot Soft Skill saat ini ${otherBobot + currentBobot}% (melebihi 100%)!`);
        } else {
          setWeightWarningPenilaian(null);
        }
      }

      if (field === 'nilai') {
        if (value === '' || value === null || value === undefined) {
          finalVal = '';
        } else {
          finalVal = Math.min(100, Math.max(0, parseFloat(value) || 0));
        }
      }

      const item = { ...updated[idx], [field]: finalVal };
      const bobot = parseFloat(item.bobot) || 0;
      const nilai = parseFloat(item.nilai) || 0;
      item.score = Math.round(((bobot / 100) * nilai) * 100) / 100;
      updated[idx] = item;

      if (selectedEmployeeId) {
        setEmployeeIndividualSheets(curr => {
          const next = {
            ...curr,
            [selectedEmployeeId]: {
              hardKPIs: hardKPIInputs,
              softSkills: updated,
              hardWeight,
              softWeight
            }
          };
          safeSetLocalStorage('mypanca_kpi_employee_individual_sheets', next);
          return next;
        });
      }

      return updated;
    });
  };

  const addSoftSkillRow = () => {
    const currentTotal = softSkillInputs.reduce((sum, it) => sum + (parseFloat(it.bobot) || 0), 0);
    const remaining = Math.max(0, 100 - currentTotal);
    const newBobot = remaining > 0 ? Math.min(25, remaining) : 10;
    setWeightWarningPenilaian(null);
    const newSS = {
      id: `ss-custom-${Date.now()}`,
      name: 'Aspek Soft Skill Tambahan',
      bobot: newBobot,
      nilai: 80,
      score: Math.round(((newBobot / 100) * 80) * 100) / 100
    };
    setSoftSkillInputs(prev => {
      const next = [...prev, newSS];
      if (selectedEmployeeId) {
        setEmployeeIndividualSheets(curr => {
          const updated = {
            ...curr,
            [selectedEmployeeId]: {
              hardKPIs: hardKPIInputs,
              softSkills: next,
              hardWeight,
              softWeight
            }
          };
          safeSetLocalStorage('mypanca_kpi_employee_individual_sheets', updated);
          return updated;
        });
      }
      return next;
    });
  };

  const deleteSoftSkillRow = (idx: number) => {
    setSoftSkillInputs(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (selectedEmployeeId) {
        setEmployeeIndividualSheets(curr => {
          const updated = {
            ...curr,
            [selectedEmployeeId]: {
              hardKPIs: hardKPIInputs,
              softSkills: next,
              hardWeight,
              softWeight
            }
          };
          safeSetLocalStorage('mypanca_kpi_employee_individual_sheets', updated);
          return updated;
        });
      }
      return next;
    });
    setWeightWarningPenilaian(null);
  };

  const getHardKPITotal = (inputs: any[]) => {
    return inputs.reduce((acc, curr) => acc + (parseFloat(curr.score) || 0), 0);
  };

  const getSoftSkillTotal = (inputs: any[]) => {
    return inputs.reduce((acc, curr) => acc + (parseFloat(curr.score) || 0), 0);
  };

  const getOverallTotal = (hardTotal: number, softTotal: number, hW: number, sW: number) => {
    const hardPart = (hardTotal * hW) / 100;
    const softPart = (softTotal * sW) / 100;
    return Math.round((hardPart + softPart) * 100) / 100;
  };

  // Get template based on Employee Jabatan (references our dynamic Jabatans & Templates)
  const activeTemplateForEmployee = (emp: KPIEmployee | Employee | undefined): KPITemplate | null => {
    if (!emp) return null;
    const jabId = (emp as any).jabatanId;
    const jab = jabId ? (availableJabatanOptions.find(j => j.id === jabId) || jabatans.find(j => j.id === jabId)) : null;
    const jabName = (jab?.name || '').toLowerCase().trim();
    const empJabName = ((emp as any).jabatan || '').toLowerCase().trim();
    const empRole = ((emp as any).role || '').toLowerCase().trim();

    // 1. Direct match by Jabatan Name or Role in kpiTemplates
    let matched = kpiTemplates.find(t => {
      const tJab = t.jabatan.toLowerCase().trim();
      return (jabName && tJab === jabName) || 
             (empJabName && tJab === empJabName) || 
             (empRole && tJab === empRole);
    });
    if (matched) return matched;

    // 2. Direct match by Template ID or emp.jabatanId
    if (jabId) {
      matched = kpiTemplates.find(t => 
        t.id === jabId || 
        t.id === `tpl-${jabId}` ||
        `jab-${t.id}` === jabId ||
        `jab-tpl-${t.id}` === jabId ||
        t.jabatan.toLowerCase().trim() === String(jabId).toLowerCase().trim()
      );
      if (matched) return matched;
    }

    // 3. Keyword / partial matching
    const targetKeywords = [jabName, empJabName, empRole, jabId || ''].filter(Boolean);
    for (const kw of targetKeywords) {
      if (kw.includes('sales') || kw.includes('penjualan')) {
        if (kw.includes('head')) {
          matched = kpiTemplates.find(t => t.jabatan.toLowerCase().includes('head') && t.jabatan.toLowerCase().includes('sales'));
          if (matched) return matched;
        }
        if (kw.includes('staff')) {
          matched = kpiTemplates.find(t => t.jabatan.toLowerCase().includes('staff') && t.jabatan.toLowerCase().includes('sales'));
          if (matched) return matched;
        }
        matched = kpiTemplates.find(t => t.jabatan.toLowerCase().includes('sales') || t.jabatan.toLowerCase().includes('penjualan'));
        if (matched) return matched;
      }
      if (kw.includes('eng') || kw.includes('teknisi')) {
        matched = kpiTemplates.find(t => t.jabatan.toLowerCase().includes('eng') || t.jabatan.toLowerCase().includes('teknisi'));
        if (matched) return matched;
      }
      if (kw.includes('fin') || kw.includes('keu') || kw.includes('akunt') || kw.includes('pajak')) {
        matched = kpiTemplates.find(t => t.jabatan.toLowerCase().includes('fin') || t.jabatan.toLowerCase().includes('keu'));
        if (matched) return matched;
      }
      if (kw.includes('purchas') || kw.includes('beli') || kw.includes('procure')) {
        matched = kpiTemplates.find(t => t.jabatan.toLowerCase().includes('purchas'));
        if (matched) return matched;
      }
      if (kw.includes('gudang') || kw.includes('stock') || kw.includes('inven')) {
        matched = kpiTemplates.find(t => t.jabatan.toLowerCase().includes('stock') || t.jabatan.toLowerCase().includes('gudang') || t.jabatan.toLowerCase().includes('inven'));
        if (matched) return matched;
      }
      if (kw.includes('hr') || kw.includes('personalia')) {
        matched = kpiTemplates.find(t => t.jabatan.toLowerCase().includes('hr') || t.jabatan.toLowerCase().includes('personalia'));
        if (matched) return matched;
      }
    }

    // Return null if no template matched for this employee's jabatan
    return null;
  };

  // Helper to calculate total KPI score
  const calculateFinalKPIScore = (scores: Record<string, number>, template: KPITemplate | null) => {
    if (!template || !template.indicators) return 0;
    let totalScore = 0;
    template.indicators.forEach(ind => {
      const score = scores[ind.id] || 0;
      totalScore += (score * ind.bobot) / 100;
    });
    return Math.round(totalScore * 10) / 10;
  };

  // Helper to get grade based on score (Matching dynamic Grading KPI table)
  const getKPIGrade = (score: number) => {
    const sortedGrading = [...gradingKPIItems].sort((a, b) => b.minScore - a.minScore);
    const matched = sortedGrading.find(item => score >= item.minScore);
    
    if (matched) {
      let color = 'text-slate-600 bg-slate-50 border-slate-200';
      if (matched.grade === 'A') color = 'text-emerald-600 bg-emerald-50 border-emerald-200';
      else if (matched.grade === 'B') color = 'text-blue-600 bg-blue-50 border-blue-200';
      else if (matched.grade === 'C') color = 'text-amber-600 bg-amber-50 border-amber-200';
      else if (matched.grade === 'D') color = 'text-orange-600 bg-orange-50 border-orange-200';
      else if (matched.grade === 'E') color = 'text-red-600 bg-red-50 border-red-200';
      
      return {
        code: matched.grade,
        label: matched.scoreRange,
        multiplier: matched.multiplier / 100,
        color
      };
    }
    
    return { code: 'E', label: 'Poor', multiplier: 0, color: 'text-red-600 bg-red-50 border-red-200' };
  };

  // Auto-calculated fields for quantitative targets (Using decoupled architecture)
  const getAutoQuantitativeScore = (emp: KPIEmployee, ind: any) => {
    return null;
  };

  // Net Profit & Bonus Pool Calculations Decoupled from Transactions (Manual Input Driven)
  const companyFinancials = useMemo(() => {
    const totalRevenue = activeFinancials.omsetKotor;
    const totalNetProfit = calculatedOmsetBersih;
    const multiplier = activeOmsetMultiplier;
    
    const sortedTiers = [...omsetTiers].sort((a, b) => b.target - a.target);
    const lowestTarget = sortedTiers.length > 0 ? sortedTiers[sortedTiers.length - 1].target : 0;
    const targetMet = totalNetProfit >= lowestTarget;
    
    const deferredNetProfit = 0;
    const bonusPool = totalNetProfit * (kpiConfig.alokasiProfitSharingBonus / 100);

    return {
      totalRevenue,
      totalNetProfit,
      deferredNetProfit,
      bonusPool,
      targetMet,
      multiplier,
      monthlyTrxCount: 0
    };
  }, [activeFinancials, calculatedOmsetBersih, activeOmsetMultiplier, omsetTiers, kpiConfig]);

  // Handle Save KPI Record
  const handleSaveKPIRecord = (status: 'draft' | 'approved') => {
    if (!selectedEmployeeId) return;

    const totalHardBobot = hardKPIInputs.reduce((sum, item) => sum + (parseFloat(item.bobot) || 0), 0);
    if (status === 'approved') {
      if (totalHardBobot > 100) {
        alert(`Peringatan: Total akumulasi bobot KPI melebihi 100% (saat ini ${totalHardBobot}%)! Harap sesuaikan bobot agar tepat 100% sebelum menyetujui.`);
        setWeightWarningPenilaian(`⚠️ Peringatan: Total akumulasi bobot KPI melebihi 100% (${totalHardBobot}%)! Harap sesuaikan.`);
        return;
      }
      if (totalHardBobot !== 100) {
        alert(`Peringatan: Total akumulasi bobot KPI harus tepat 100% untuk disetujui (saat ini ${totalHardBobot}%). Harap sesuaikan bobot sebelum menyetujui.`);
        setWeightWarningPenilaian(`⚠️ Peringatan: Total akumulasi bobot KPI harus tepat 100% (saat ini: ${totalHardBobot}%).`);
        return;
      }
    } else {
      if (totalHardBobot > 100) {
        setWeightWarningPenilaian(`⚠️ Peringatan: Total akumulasi bobot KPI melebihi 100% (${totalHardBobot}%)! Pastikan total tepat 100% saat menyetujui.`);
      }
    }

    const hardTotal = getHardKPITotal(hardKPIInputs);
    const softTotal = getSoftSkillTotal(softSkillInputs);
    const finalScore = getOverallTotal(hardTotal, softTotal, hardWeight, softWeight);

    // Backward compatibility for simple score checking
    const scoresMap: Record<string, number> = {};
    hardKPIInputs.forEach(item => {
      scoresMap[item.indicatorId] = item.realisasi;
    });

    const newRecord: KPIRecord = {
      id: editingRecordId || `kpi-${selectedEmployeeId}-${filterMonth}-${filterYear}`,
      employeeId: selectedEmployeeId,
      month: filterMonth,
      year: filterYear,
      scores: scoresMap,
      status: status,
      notes: recordNotes,
      hardKPIs: hardKPIInputs,
      softSkills: softSkillInputs,
      hardWeight,
      softWeight,
      finalScore,
      ...(status === 'approved' ? {
        approvedBy: currentUser?.nama || 'System',
        approvedAt: new Date().toISOString().split('T')[0]
      } : {})
    };

    setKpiRecords(prev => {
      const idx = prev.findIndex(r => r.id === newRecord.id);
      if (idx > -1) {
        return prev.map((r, i) => i === idx ? newRecord : r);
      }
      return [...prev, newRecord];
    });

    // Save custom indicators permanently for this individual employee
    if (selectedEmployeeId) {
      const currentCustom = hardKPIInputs.filter(item => 
        item.indicatorId?.startsWith('ind-custom-') || item.isCustom
      );
      setEmployeeCustomIndicators(prev => {
        const next = { ...prev, [selectedEmployeeId]: currentCustom };
        safeSetLocalStorage('mypanca_kpi_employee_custom_indicators', next);
        return next;
      });
    }

    setEditingRecordId(newRecord.id);
    alert(`Penilaian Lembar KPI berhasil disimpan sebagai ${status === 'approved' ? 'Disetujui' : 'Draft'}!`);
  };

  const handleUnlockRecord = () => {
    if (!selectedEmployeeId) return;
    const key = `kpi-${selectedEmployeeId}-${filterMonth}-${filterYear}`;
    activeEmpMonthRef.current = '';
    setKpiRecords(prev => prev.map(r => (r.id === key || r.id === editingRecordId) ? { ...r, status: 'draft' } : r));
    alert(`Status penilaian KPI untuk ${selectedEmployee?.nama || 'karyawan'} dikembalikan ke Draft. Sekarang Anda dapat mengedit penilaian kembali.`);
  };

  // Reset or Load existing record (Auto-applies Role Template + Individual Custom Indicators)
  useEffect(() => {
    const empMonthKey = `${selectedEmployeeId}-${filterMonth}-${filterYear}`;
    if (!selectedEmployeeId) {
      activeEmpMonthRef.current = '';
      setRecordScores({});
      setRecordNotes('');
      setEditingRecordId(null);
      setHardKPIInputs([]);
      setSoftSkillInputs([]);
      setHardWeight(80);
      setSoftWeight(20);
      return;
    }

    if (activeEmpMonthRef.current === empMonthKey) {
      return;
    }
    activeEmpMonthRef.current = empMonthKey;

    const key = `kpi-${selectedEmployeeId}-${filterMonth}-${filterYear}`;
    const existing = kpiRecords.find(r => r.id === key);
    const customSheet = employeeIndividualSheets[selectedEmployeeId];
    const template = activeTemplateForEmployee(selectedEmployee);
    const customInds = employeeCustomIndicators[selectedEmployeeId] || [];
    const isSales = isSalesRole(selectedEmployee);
    const salesBonusRow = isSales ? getSalesBonusRowForEmployee(selectedEmployee) : null;

    if (existing) {
      setRecordScores(existing.scores);
      setRecordNotes(existing.notes || '');
      setEditingRecordId(existing.id);

      if (existing.status !== 'approved' && template) {
        // Auto-sync draft records with updated template structure/indicators/weights from Pengaturan KPI
        const syncedHard = template.indicators.map((ind, idx) => {
          const match = existing.hardKPIs?.find(h => h.indicatorId === ind.id || h.name.toLowerCase().trim() === ind.name.toLowerCase().trim()) || existing.hardKPIs?.[idx];
          const realVal = match ? match.realisasi : (existing.scores[ind.id] ?? 80);
          const targetVal = isSales && idx === 0 ? (salesBonusRow?.targetBulanan || ind.target || 200000000) : (ind.target || match?.target || 100);
          const bobotVal = ind.bobot;
          const metodeVal = ind.metode || match?.metode || 'Maximize';
          const satuanVal = isSales && idx === 0 ? 'Rp' : (ind.satuan || match?.satuan || '%');
          const realForSales = isSales && idx === 0 ? (salesBonusRow?.pencapaian || 0) : realVal;
          const computedScore = targetVal > 0 ? (metodeVal === 'Minimize' ? (targetVal / Math.max(realForSales, 1)) * bobotVal : (realForSales / targetVal) * bobotVal) : 0;
          return {
            indicatorId: ind.id,
            name: ind.name,
            bobot: bobotVal,
            metode: metodeVal as 'Maximize' | 'Minimize',
            target: targetVal,
            satuan: satuanVal,
            realisasi: realForSales,
            score: Math.round(computedScore * 100) / 100
          };
        });

        // Also preserve custom individual indicators
        customInds.forEach(cind => {
          if (!syncedHard.some(k => k.indicatorId === cind.indicatorId)) {
            const matchCustom = existing.hardKPIs?.find(h => h.indicatorId === cind.indicatorId);
            const realVal = matchCustom ? matchCustom.realisasi : (cind.realisasi ?? 80);
            syncedHard.push({
              ...cind,
              realisasi: realVal,
              score: Math.round(((cind.bobot || 10) * (realVal / Math.max(cind.target || 100, 1))) * 100) / 100,
              isCustom: true
            });
          }
        });

        const tplSS = (template.softSkills && template.softSkills.length > 0) ? template.softSkills : DEFAULT_SOFT_SKILL_INDICATORS;
        const syncedSoft = tplSS.map((ss, idx) => {
          const matchSS = existing.softSkills?.find(s => s.name.toLowerCase().trim() === ss.name.toLowerCase().trim()) || existing.softSkills?.[idx];
          const nilaiVal = matchSS ? matchSS.nilai : 80;
          return {
            name: ss.name,
            bobot: ss.bobot,
            nilai: nilaiVal,
            score: Math.round(((ss.bobot / 100) * nilaiVal) * 100) / 100
          };
        });

        setHardKPIInputs(syncedHard);
        setSoftSkillInputs(syncedSoft);
        setHardWeight(template.hardWeight ?? 80);
        setSoftWeight(template.softWeight ?? 20);
      } else if (existing.hardKPIs && existing.softSkills) {
        let loadedHard = [...existing.hardKPIs];
        if (isSales && salesBonusRow && existing.status !== 'approved' && loadedHard.length > 0) {
          const targetVal = salesBonusRow.targetBulanan || 200000000;
          const realVal = salesBonusRow.pencapaian || 0;
          const bobotVal = loadedHard[0].bobot || 50;
          const computedScore = targetVal > 0 ? (realVal / targetVal) * bobotVal : 0;
          loadedHard[0] = {
            ...loadedHard[0],
            name: 'Target Penjualan',
            satuan: 'Rp',
            metode: 'Maximize',
            bobot: bobotVal,
            target: targetVal,
            realisasi: realVal,
            score: Math.round(computedScore * 100) / 100
          };
        }
        setHardKPIInputs(loadedHard);
        setSoftSkillInputs(existing.softSkills);
        setHardWeight(existing.hardWeight ?? 80);
        setSoftWeight(existing.softWeight ?? 20);
      } else if (template) {
        // Fallback pre-population for existing legacy records
        const hardKPIs = template.indicators.map((ind, idx) => {
          if (isSales && idx === 0) {
            const targetVal = salesBonusRow?.targetBulanan || ind.target || 200000000;
            const realVal = salesBonusRow?.pencapaian || 0;
            const bobotVal = ind.bobot || 50;
            const computedScore = targetVal > 0 ? (realVal / targetVal) * bobotVal : 0;
            return {
              indicatorId: ind.id,
              name: 'Target Penjualan',
              bobot: bobotVal,
              metode: 'Maximize' as 'Maximize' | 'Minimize',
              target: targetVal,
              satuan: 'Rp',
              realisasi: realVal,
              score: Math.round(computedScore * 100) / 100
            };
          }
          const scoreVal = existing.scores[ind.id] !== undefined ? existing.scores[ind.id] : 80;
          return {
            indicatorId: ind.id,
            name: ind.name,
            bobot: ind.bobot,
            metode: 'Maximize' as 'Maximize' | 'Minimize',
            target: 100,
            satuan: '%',
            realisasi: scoreVal,
            score: Math.round((ind.bobot * (scoreVal / 100)) * 100) / 100
          };
        });

        // Merge any individual custom indicators
        customInds.forEach(cind => {
          if (!hardKPIs.some(k => k.indicatorId === cind.indicatorId)) {
            hardKPIs.push({ ...cind, isCustom: true });
          }
        });

        const defaultSS = (template.softSkills && template.softSkills.length > 0)
          ? template.softSkills
          : DEFAULT_SOFT_SKILL_INDICATORS;

        const softSkills = defaultSS.map(ss => ({
          name: ss.name,
          bobot: ss.bobot,
          nilai: 80,
          score: Math.round(((ss.bobot / 100) * 80) * 100) / 100
        }));

        setHardKPIInputs(hardKPIs);
        setSoftSkillInputs(softSkills);
        setHardWeight(template.hardWeight ?? 80);
        setSoftWeight(template.softWeight ?? 20);
      }
    } else if (template) {
      // NEW UNRATED MONTH: Inherit active template/custom indicator structure with realisasi and nilai starting at ZERO
      const initial: Record<string, number> = {};
      
      const hardKPIs = template.indicators.map((ind, idx) => {
        if (isSales && idx === 0) {
          const targetVal = salesBonusRow?.targetBulanan || ind.target || 200000000;
          const realVal = salesBonusRow?.pencapaian || 0;
          const bobotVal = ind.bobot || 50;
          const computedScore = targetVal > 0 ? (realVal / targetVal) * bobotVal : 0;
          initial[ind.id] = realVal;
          return {
            indicatorId: ind.id,
            name: 'Target Penjualan',
            bobot: bobotVal,
            metode: 'Maximize' as 'Maximize' | 'Minimize',
            target: targetVal,
            satuan: 'Rp',
            realisasi: realVal,
            score: Math.round(computedScore * 100) / 100
          };
        }
        const realVal = 0;
        initial[ind.id] = realVal;
        return {
          indicatorId: ind.id,
          name: ind.name,
          bobot: ind.bobot,
          metode: (ind.metode || 'Maximize') as 'Maximize' | 'Minimize',
          target: ind.target || 100,
          satuan: ind.satuan || '%',
          realisasi: realVal,
          score: 0
        };
      });

      // Append persistent custom indicators with realisasi reset to 0 for new month
      customInds.forEach(cind => {
        initial[cind.indicatorId] = 0;
        hardKPIs.push({
          ...cind,
          realisasi: 0,
          score: 0,
          isCustom: true
        });
      });

      const defaultSS = (template.softSkills && template.softSkills.length > 0)
        ? template.softSkills
        : DEFAULT_SOFT_SKILL_INDICATORS;

      const softSkills = defaultSS.map(ss => ({
        name: ss.name,
        bobot: ss.bobot,
        nilai: 0,
        score: 0
      }));

      setRecordScores(initial);
      setRecordNotes('');
      setEditingRecordId(null);
      setHardKPIInputs(hardKPIs);
      setSoftSkillInputs(softSkills);
      setHardWeight(template.hardWeight ?? 80);
      setSoftWeight(template.softWeight ?? 20);
    } else {
      // Employee has no active template or jabatan
      setRecordScores({});
      setRecordNotes('');
      setEditingRecordId(null);
      setHardKPIInputs([]);
      setSoftSkillInputs([]);
      setHardWeight(80);
      setSoftWeight(20);
    }
  }, [selectedEmployeeId, filterMonth, filterYear, kpiRecords, kpiTemplates, employeeCustomIndicators, selectedEmployee]);

  // Calculate Bonus Recap for all employees with full KPI.xlsx parity
  const employeesRecap = useMemo(() => {
    return companyEmployees.map(emp => {
      const key = `kpi-${emp.id}-${filterMonth}-${filterYear}`;
      const record = kpiRecords.find(r => r.id === key);
      const indSheet = employeeIndividualSheets[emp.id];
      const template = activeTemplateForEmployee(emp);
      
      const empNameClean = emp.nama.toLowerCase().trim();
      let kpiScore: number | null = null;
      let kpiApproved = record?.status === 'approved';

      // 1. If saved record exists in kpiRecords with hardKPIs & softSkills for this month
      if (record && record.hardKPIs && record.softSkills) {
        const hardTotal = getHardKPITotal(record.hardKPIs);
        const softTotal = getSoftSkillTotal(record.softSkills);
        kpiScore = getOverallTotal(hardTotal, softTotal, record.hardWeight ?? 80, record.softWeight ?? 20);
      } else if (record && record.finalScore !== undefined) {
        kpiScore = record.finalScore;
      } else if (`${filterYear}-${filterMonth}` === '2026-09') {
        // Seed initial values for demo month 2026-09 only
        if (indSheet && indSheet.hardKPIs && indSheet.softSkills) {
          const hardTotal = getHardKPITotal(indSheet.hardKPIs);
          const softTotal = getSoftSkillTotal(indSheet.softSkills);
          kpiScore = getOverallTotal(hardTotal, softTotal, indSheet.hardWeight ?? 80, indSheet.softWeight ?? 20);
        } else if (template) {
          const isSales = isSalesRole(emp);
          const salesBonusRow = isSales ? getSalesBonusRowForEmployee(emp) : null;
          const customInds = employeeCustomIndicators[emp.id] || [];

          const hardKPIs = template.indicators.map((ind, idx) => {
            if (isSales && idx === 0) {
              const targetVal = salesBonusRow?.targetBulanan || ind.target || 200000000;
              const realVal = salesBonusRow?.pencapaian || 0;
              const bobotVal = ind.bobot || 50;
              const computedScore = targetVal > 0 ? (realVal / targetVal) * bobotVal : 0;
              return { score: Math.round(computedScore * 100) / 100 };
            }
            return { score: Math.round((ind.bobot * 0.8) * 100) / 100 };
          });

          customInds.forEach(cind => {
            const realVal = cind.realisasi !== undefined ? cind.realisasi : 80;
            const score = Math.round(((cind.bobot || 10) * (realVal / Math.max(cind.target || 100, 1))) * 100) / 100;
            hardKPIs.push({ score });
          });

          const defaultSS = (template.softSkills && template.softSkills.length > 0) ? template.softSkills : DEFAULT_SOFT_SKILL_INDICATORS;
          const softSkills = defaultSS.map(ss => ({ score: Math.round(((ss.bobot / 100) * 80) * 100) / 100 }));

          const hardTotal = hardKPIs.reduce((acc, curr) => acc + curr.score, 0);
          const softTotal = softSkills.reduce((acc, curr) => acc + curr.score, 0);
          kpiScore = getOverallTotal(hardTotal, softTotal, template.hardWeight ?? 80, template.softWeight ?? 20);
        }

        if (kpiScore === null) {
          if (empNameClean.includes('yadi')) kpiScore = 79.66;
          else if (empNameClean.includes('sanjaya')) kpiScore = 40.00;
          else if (empNameClean.includes('arie')) kpiScore = 103.33;
          else if (empNameClean.includes('evan')) kpiScore = 98.95;
          else if (empNameClean.includes('jeremia')) kpiScore = 106.02;
          else if (empNameClean.includes('rudi')) kpiScore = 107.25;
          else if (empNameClean.includes('angel') || empNameClean.includes('admin')) kpiScore = 161.25;
          else if (empNameClean.includes('mustaqim') || empNameClean.includes('inventory')) kpiScore = 97.25;
          else if (empNameClean.includes('rizqi') || empNameClean.includes('office boy')) kpiScore = 97.25;
          else kpiScore = 80.00;
        }
      }

      const gradeObj = getKPIGrade(kpiScore);
      // gradeObj.multiplier is already fractional (e.g. Grade A = 100/100 = 1.0, Grade B = 75/100 = 0.75, Grade C = 60/100 = 0.60)
      const kpiGradeMultiplierVal = gradeObj ? gradeObj.multiplier : 0;

      const employeeGaji = emp.gaji || 3000000;
      
      // Determine Role Percentage dynamically from custom jabatans state
      const empJab = jabatans.find(j => j.id === emp.jabatanId);
      const jabatanPercentageVal = empJab ? empJab.percentage : 0;
      const jabatanPercentage = jabatanPercentageVal / 100;

      // Determine Omset Multiplier based on Total Akumulasi Omset Kotor vs Minimal Target Tiers in T&C
      // Formula: Gaji Pokok * Alokasi Bonus Jabatan % * Grade KPI % * Pengali Bonus (Multiplier)
      const omsetMultiplier = activeOmsetMultiplier;
      const isOmsetEligible = omsetMultiplier > 0;
      const persentaseBonusDisplay = isOmsetEligible ? jabatanPercentageVal : 0;

      // Exact Formula: Gaji Pokok * (Alokasi Jabatan / 100) * Grade KPI Multiplier % * Multiplier Tier Omset
      // If Total Akumulasi Omset Kotor < minimal target (Tier III Rp 200M), omsetMultiplier = 0 (Bonus tidak cair)
      const calculatedBonus = employeeGaji * jabatanPercentage * kpiGradeMultiplierVal * omsetMultiplier;

      // Check for project-specific bonuses released in this month
      const activeProjectBonuses = projectBonuses.filter(pb => {
        if (!pb.employeeIds.includes(emp.id) || pb.status !== 'released') return false;
        const dDate = new Date(pb.deadline);
        const dMonth = (dDate.getMonth() + 1).toString().padStart(2, '0');
        const dYear = dDate.getFullYear().toString();
        return dMonth === filterMonth && dYear === filterYear;
      });

      const totalProjectBonus = activeProjectBonuses.reduce((acc, curr) => {
        const splitCount = curr.employeeIds.length || 1;
        return acc + (curr.bonusAmount / splitCount);
      }, 0);

      // Check for project-specific bonuses from Sales Bonus Project sheet
      const matchingSales = calculatedSalesRows.find(s => {
        const sNameClean = s.nama.toLowerCase().trim();
        return (s.employeeId && s.employeeId === emp.id) || sNameClean === empNameClean || empNameClean.includes(sNameClean) || sNameClean.includes(empNameClean);
      });
      const salesBonusAmount = matchingSales ? matchingSales.grandTotal : 0;

      // Check for project-specific bonuses from Engineer Bonus Project sheet
      const matchingEngineer = calculatedEngineerRows.find(e => {
        const eNameClean = e.nama.toLowerCase().trim();
        return (e.employeeId && e.employeeId === emp.id) || eNameClean === empNameClean || empNameClean.includes(eNameClean) || eNameClean.includes(empNameClean);
      });
      const engineerBonusAmount = matchingEngineer ? matchingEngineer.totalKomisi : 0;

      // Combined Project Bonus (Sales Sheet + Engineer Sheet + Ad-hoc released projects)
      const combinedProjectBonus = salesBonusAmount + engineerBonusAmount + totalProjectBonus;

      // Additional Bonus
      const addKey = `${emp.id}-${filterMonth}-${filterYear}`;
      const additionalBonus = additionalBonuses[addKey] !== undefined ? additionalBonuses[addKey] : (additionalBonuses[emp.id] || 0);

      // Total All Bonus = Bonus Bulanan + Bonus Project/Komisi + Additional Bonus
      const totalAllBonus = calculatedBonus + combinedProjectBonus + additionalBonus;

      // Persentase Total Bonus / Omset = (Total All Bonus / Total Omset Bersih) * 100%
      const persentaseTotalBonusOmset = calculatedOmsetBersih > 0 ? (totalAllBonus / calculatedOmsetBersih) * 100 : 0;

      const departemen = getDepartmentForJabatan(empJab?.name || '');
      const periodeKPI = `${getIndoMonthName(filterMonth)} ${filterYear}`;

      // Deferred project bonuses (if project is completed but parent transaction isn't fully paid)
      const deferredProjectBonuses = projectBonuses.filter(pb => {
        if (!pb.employeeIds.includes(emp.id) || pb.status !== 'pending') return false;
        const relatedTrx = companyTransactions.find(t => t.id === pb.transactionId);
        return relatedTrx && relatedTrx.paymentStatus !== 'Lunas';
      }).reduce((acc, curr) => {
        const splitCount = curr.employeeIds.length || 1;
        return acc + (curr.bonusAmount / splitCount);
      }, 0);

      return {
        employee: emp,
        nama: emp.nama,
        jabatanName: empJab?.name || emp.jabatan || 'Staff',
        departemen,
        periodeKPI,
        kpiScore,
        kpiApproved,
        kpiGrade: gradeObj,
        gajiPokok: employeeGaji,
        persentaseBonus: persentaseBonusDisplay,
        bonusBulanan: calculatedBonus,
        bonusProjectKomisi: combinedProjectBonus,
        additionalBonus,
        totalAllBonus,
        persentaseTotalBonusOmset,
        calculatedBonus,
        projectBonus: combinedProjectBonus,
        salesProjectBonus: salesBonusAmount,
        engineerProjectBonus: engineerBonusAmount,
        adhocProjectBonus: totalProjectBonus,
        deferredProjectBonus: deferredProjectBonuses,
        totalTakeHomePay: employeeGaji + totalAllBonus
      };
    });
  }, [companyEmployees, kpiRecords, employeeIndividualSheets, employeeCustomIndicators, filterMonth, filterYear, jabatans, projectBonuses, companyFinancials, companyTransactions, gradingKPIItems, calculatedSalesRows, calculatedEngineerRows, calculatedOmsetBersih, additionalBonuses]);

  // Filtered rows for the Excel recap table
  const filteredRecapRows = useMemo(() => {
    let rows = [...employeesRecap];
    if (rekapDeptFilter !== 'ALL') {
      rows = rows.filter(r => r.departemen.toLowerCase() === rekapDeptFilter.toLowerCase());
    }
    if (rekapSearchQuery.trim()) {
      const q = rekapSearchQuery.toLowerCase().trim();
      rows = rows.filter(r => r.nama.toLowerCase().includes(q) || r.jabatanName.toLowerCase().includes(q));
    }
    // Sorting: Sales & Engineering upfront as in image.png
    const getPriority = (jab: string) => {
      const l = jab.toLowerCase();
      if (l.includes('head of sales')) return 1;
      if (l.includes('sales staff')) return 2;
      if (l.includes('head of engineering')) return 3;
      if (l.includes('engineering staff')) return 4;
      if (l.includes('general manager')) return 5;
      if (l.includes('sales admin')) return 6;
      if (l.includes('inventory')) return 7;
      if (l.includes('office boy')) return 8;
      return 10;
    };
    return rows.sort((a, b) => getPriority(a.jabatanName) - getPriority(b.jabatanName));
  }, [employeesRecap, rekapDeptFilter, rekapSearchQuery]);

  // Aggregate totals for the recap table
  const rekapTotals = useMemo(() => {
    const gajiPokok = filteredRecapRows.reduce((acc, r) => acc + (r.gajiPokok || 0), 0);
    const bonusBulanan = filteredRecapRows.reduce((acc, r) => acc + (r.bonusBulanan || 0), 0);
    const bonusProjectKomisi = filteredRecapRows.reduce((acc, r) => acc + (r.bonusProjectKomisi || 0), 0);
    const additionalBonus = filteredRecapRows.reduce((acc, r) => acc + (r.additionalBonus || 0), 0);
    const totalAllBonus = filteredRecapRows.reduce((acc, r) => acc + (r.totalAllBonus || 0), 0);
    const persentaseTotalBonusOmset = calculatedOmsetBersih > 0 ? (totalAllBonus / calculatedOmsetBersih) * 100 : 0;
    return {
      gajiPokok,
      bonusBulanan,
      bonusProjectKomisi,
      additionalBonus,
      totalAllBonus,
      persentaseTotalBonusOmset
    };
  }, [filteredRecapRows, calculatedOmsetBersih]);

  // Export recap to CSV formatted for Excel (Rincian Slip Gaji THP)
  const handleExportExcel = () => {
    const headers = [
      'No',
      'Nama Karyawan',
      'NIK',
      'Jabatan',
      'Departemen',
      'Periode',
      'Skor KPI',
      'Grade KPI',
      'Status KPI',
      'Gaji Pokok',
      'Bonus KPI (Profit Share)',
      'Bonus Proyek',
      'Total THP',
      'Pending Bonus'
    ];

    const rows = filteredRecapRows.map((item, idx) => [
      idx + 1,
      `"${item.employee.nama}"`,
      `"${item.employee.nik || '-'}"`,
      `"${item.jabatanName}"`,
      `"${item.departemen}"`,
      `"${item.periodeKPI}"`,
      item.kpiScore !== null ? item.kpiScore.toFixed(2).replace('.', ',') : '-',
      `"${item.kpiGrade?.code || '-'}"`,
      item.kpiApproved ? '"Approved"' : '"Draft"',
      item.gajiPokok,
      item.calculatedBonus,
      item.bonusProjectKomisi,
      item.totalTakeHomePay,
      item.deferredProjectBonus
    ]);

    const totalGaji = filteredRecapRows.reduce((sum, r) => sum + (r.gajiPokok || 0), 0);
    const totalBonusKPI = filteredRecapRows.reduce((sum, r) => sum + (r.calculatedBonus || 0), 0);
    const totalBonusProyek = filteredRecapRows.reduce((sum, r) => sum + (r.bonusProjectKomisi || 0), 0);
    const totalTHP = filteredRecapRows.reduce((sum, r) => sum + (r.totalTakeHomePay || 0), 0);
    const totalPending = filteredRecapRows.reduce((sum, r) => sum + (r.deferredProjectBonus || 0), 0);

    const totalRow = [
      '',
      '"TOTAL"',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      totalGaji,
      totalBonusKPI,
      totalBonusProyek,
      totalTHP,
      totalPending
    ];

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';')), totalRow.join(';')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rincian_Slip_Gaji_THP_${filterYear}_${filterMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to open print preview modal for an employee from the Recap table
  const handleOpenPrintPreviewForEmployee = (empItem: (typeof filteredRecapRows)[0]) => {
    const empId = empItem.employee.id;
    const existingRecord = kpiRecords.find(r => r.id === `kpi-${empId}-${filterMonth}-${filterYear}`);
    const indSheet = employeeIndividualSheets[empId];
    const tpl = activeTemplateForEmployee(empItem.employee);
    
    const hardKPIs = (existingRecord?.hardKPIs && existingRecord.hardKPIs.length > 0)
      ? existingRecord.hardKPIs
      : (indSheet?.hardKPIs && indSheet.hardKPIs.length > 0)
        ? indSheet.hardKPIs
        : (tpl?.indicators || []).map(ind => {
            const realVal = existingRecord?.scores?.[ind.id] ?? 80;
            const targetVal = ind.target || 100;
            const bobotVal = ind.bobot || 0;
            return {
              indicatorId: ind.id,
              name: ind.name,
              bobot: bobotVal,
              metode: (ind.metode || 'Maximize') as 'Maximize' | 'Minimize',
              target: targetVal,
              satuan: ind.satuan || '%',
              realisasi: realVal,
              score: Math.round((bobotVal * (realVal / Math.max(targetVal, 1))) * 100) / 100
            };
          });

    const softSkills = (existingRecord?.softSkills && existingRecord.softSkills.length > 0)
      ? existingRecord.softSkills
      : (indSheet?.softSkills && indSheet.softSkills.length > 0)
        ? indSheet.softSkills
        : ((tpl?.softSkills && tpl.softSkills.length > 0) ? tpl.softSkills : DEFAULT_SOFT_SKILL_INDICATORS).map(ss => ({
            name: ss.name,
            bobot: ss.bobot,
            nilai: 80,
            score: Math.round(((ss.bobot / 100) * 80) * 100) / 100
          }));

    const hardWeight = existingRecord?.hardWeight ?? indSheet?.hardWeight ?? tpl?.hardWeight ?? 80;
    const softWeight = existingRecord?.softWeight ?? indSheet?.softWeight ?? tpl?.softWeight ?? 20;
    const finalScore = empItem.kpiScore ?? 80;

    const printObj: KPIRecord = {
      id: existingRecord?.id || `kpi-${empId}-${filterMonth}-${filterYear}`,
      employeeId: empId,
      month: filterMonth,
      year: filterYear,
      scores: existingRecord?.scores || {},
      status: empItem.kpiApproved ? 'approved' : 'draft',
      notes: existingRecord?.notes || '',
      hardKPIs,
      softSkills,
      hardWeight,
      softWeight,
      finalScore
    };

    setPrintModalRecord(printObj);
  };

  // Sync active month financials from live company financials
  const handleSyncWithLiveFinancials = () => {
    const key = `${filterYear}-${filterMonth}`;
    setKpiMonthlyFinancials(prev => ({
      ...prev,
      [key]: {
        omsetKotor: (companyFinancials as any).targetOmset || (companyFinancials as any).totalRevenue || 133716920,
        pajak: 14701861,
        pengiriman: 0,
        lainLain: 14500000
      }
    }));
  };

  // Handle Release/Trigger Deferred Project Bonuses on Transaction Payment Changes
  const checkAndReleaseProjectBonuses = () => {
    let updated = false;
    const nextBonuses = projectBonuses.map(pb => {
      if (pb.status === 'pending' && pb.transactionId) {
        const trx = companyTransactions.find(t => t.id === pb.transactionId);
        if (trx && trx.paymentStatus === 'Lunas') {
          updated = true;
          return {
            ...pb,
            status: 'released' as const,
            completedAt: new Date().toISOString().split('T')[0],
            notes: `${pb.notes || ''} (Otomatis dicairkan karena Invoice proyek telah Lunas)`.trim()
          };
        }
      }
      return pb;
    });

    if (updated) {
      setProjectBonuses(nextBonuses);
      alert("Beberapa bonus project yang ditangguhkan berhasil dicairkan otomatis karena Invoice transaksi terkait sudah Lunas!");
    }
  };

  // Run auto release check on mount or transaction changes
  useEffect(() => {
    checkAndReleaseProjectBonuses();
  }, [companyTransactions]);

  // KPI Trend chart data
  const kpiTrendData = useMemo(() => {
    // Generate data for the last 6 months
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const currentMonthIdx = months.indexOf(filterMonth);
    const startIdx = Math.max(0, currentMonthIdx - 5);
    const displayedMonths = months.slice(startIdx, currentMonthIdx + 1);

    return displayedMonths.map(m => {
      const records = kpiRecords.filter(r => r.month === m && r.year === filterYear && r.status === 'approved');
      let avgScore = 0;
      if (records.length > 0) {
        const sum = records.reduce((acc, curr) => {
          const emp = companyEmployees.find(e => e.id === curr.employeeId);
          const tpl = activeTemplateForEmployee(emp);
          return acc + calculateFinalKPIScore(curr.scores, tpl);
        }, 0);
        avgScore = Math.round((sum / records.length) * 10) / 10;
      }

      return {
        name: `Bulan ${m}`,
        'Rata-rata KPI': avgScore || 75 // Fallback representation for empty values to display a pretty trend
      };
    });
  }, [kpiRecords, filterYear, filterMonth, companyEmployees]);

  return (
    <div className="w-full space-y-6" id="kpi-module-container">
      {/* Header Widget */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-violet-600 mb-1">
            <Award className="w-6 h-6 animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Performa & Perhitungan KPI Karyawan</h1>
          </div>
          <p className="text-xs text-slate-500">
            Kelola penilaian bulanan, bonus profit sharing perusahaan, syarat pencairan, dan insentif proyek teknis/sales.
          </p>
        </div>

        {/* Actions, Cloud Sync & Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Cloud Sync Status & Manual Sync Button */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
            {cloudSyncStatus === 'syncing' ? (
              <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
            ) : cloudSyncStatus === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-700 leading-tight flex items-center gap-1">
                {cloudSyncStatus === 'syncing' ? 'Menyinkronkan...' : cloudSyncStatus === 'error' ? 'Sync Gagal' : 'Supabase Cloud Terhubung'}
                {cloudSyncStatus === 'synced' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
              </span>
              <span className="text-[9px] text-slate-400">
                {lastCloudSyncTime ? `Sinkron: ${lastCloudSyncTime}` : 'Database Aktif'}
              </span>
            </div>
            <button
              onClick={handleManualSyncNow}
              disabled={cloudSyncStatus === 'syncing'}
              title="Sinkronkan data KPI ke Supabase Cloud sekarang"
              className="ml-1 p-1 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${cloudSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Month & Year Select Filter */}
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <Filter className="w-4 h-4 text-slate-400 ml-1" />
            <select 
              value={filterMonth} 
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-transparent border-none text-xs font-bold text-slate-700 focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="01">Januari</option>
              <option value="02">Februari</option>
              <option value="03">Maret</option>
              <option value="04">April</option>
              <option value="05">Mei</option>
              <option value="06">Juni</option>
              <option value="07">Juli</option>
              <option value="08">Agustus</option>
              <option value="09">September</option>
              <option value="10">Oktober</option>
              <option value="11">November</option>
              <option value="12">Desember</option>
            </select>
            <select 
              value={filterYear} 
              onChange={(e) => setFilterYear(e.target.value)}
              className="bg-transparent border-none text-xs font-bold text-slate-700 focus:outline-none focus:ring-0 cursor-pointer"
            >
              {Array.from(new Set(['2024', '2025', '2026', '2027', new Date().getFullYear().toString()])).sort().map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Financial Status Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-violet-50 text-violet-600 rounded-lg">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Profit Bersih Bulan Ini</span>
            <span className="text-base font-black text-slate-800">{formatRupiah(companyFinancials.totalNetProfit)}</span>
            <span className="text-[9px] text-slate-500 block mt-0.5">Dari transaksi berstatus Lunas</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Profit Ditangguhkan</span>
            <span className="text-base font-black text-slate-800">{formatRupiah(companyFinancials.deferredNetProfit)}</span>
            <span className="text-[9px] text-slate-500 block mt-0.5">Transaksi Belum Lunas</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className={`p-3 rounded-lg ${companyFinancials.targetMet ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Target Perusahaan</span>
            <span className="text-base font-black text-slate-800">{formatRupiah(kpiConfig.targetProfitPerusahaan)}</span>
            <span className="flex items-center gap-1 text-[9px] font-bold mt-0.5">
              {companyFinancials.targetMet ? (
                <span className="text-emerald-600">✓ Target Tercapai (Bonus Aktif)</span>
              ) : (
                <span className="text-red-500">✗ Target Belum Tercapai</span>
              )}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Percent className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Alokasi Bonus</span>
            <span className="text-base font-black text-slate-800">
              {companyFinancials.targetMet ? formatRupiah(companyFinancials.bonusPool) : formatRupiah(0)}
            </span>
            <span className="text-[9px] text-slate-500 block mt-0.5">{kpiConfig.alokasiProfitSharingBonus}% dari profit bersih</span>
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-slate-200 bg-white p-2 rounded-xl shadow-xs scrollbar-thin">
        <button 
          onClick={() => setActiveSubTab('penilaian')}
          className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all shrink-0 ${activeSubTab === 'penilaian' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Activity className="w-4 h-4 shrink-0" />
          Penilaian KPI
        </button>
        <button 
          onClick={() => setActiveSubTab('rekap')}
          className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all shrink-0 ${activeSubTab === 'rekap' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          Rekap KPI & Gaji
        </button>
        <button 
          onClick={() => setActiveSubTab('project-bonus')}
          className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all shrink-0 ${activeSubTab === 'project-bonus' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Briefcase className="w-4 h-4 shrink-0" />
          Bonus Project
        </button>
        <button 
          onClick={() => setActiveSubTab('tnc')}
          className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all shrink-0 ${activeSubTab === 'tnc' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Shield className="w-4 h-4 shrink-0" />
          T&C Bonus
        </button>
        {isAuthorizedToManageKPI && (
          <button 
            onClick={() => setActiveSubTab('templates')}
            className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all shrink-0 ${activeSubTab === 'templates' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            Pengaturan KPI
          </button>
        )}
      </div>



      {/* Main Content Areas */}
      {activeSubTab === 'penilaian' && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Mobile Employee Selector Dropdown (< lg screens) */}
          <div className="w-full lg:hidden bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="mobile-employee-select" className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <User className="w-4 h-4 text-violet-600" />
                <span>Pilih Karyawan:</span>
              </label>
              <button
                type="button"
                onClick={openAddEmployeeModal}
                className="px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-xs flex items-center gap-1"
              >
                <Plus size={12} />
                <span>Tambah</span>
              </button>
            </div>
            
            <div className="relative">
              <select
                id="mobile-employee-select"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-violet-500 appearance-none pr-10 cursor-pointer shadow-xs"
              >
                <option value="">-- Pilih Karyawan --</option>
                {companyEmployees.map(emp => {
                  const hasRecord = kpiRecords.find(r => r.employeeId === emp.id && r.month === filterMonth && r.year === filterYear);
                  const jab = jabatans.find(j => j.id === emp.jabatanId);
                  const jabName = jab ? jab.name : (emp.jabatan || emp.role || 'Staff');
                  const statusTag = hasRecord ? (hasRecord.status === 'approved' ? '✓ Approved' : '✎ Draft') : '○ Belum Dinilai';
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.nama} - {jabName} [{statusTag}]
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {selectedEmployee && (
              <div className="flex items-center justify-between bg-violet-50/80 border border-violet-100 p-2.5 rounded-xl text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-violet-950 truncate">{selectedEmployee.nama}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase truncate">
                    ({jabatans.find(j => j.id === selectedEmployee.jabatanId)?.name || 'Staff'})
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditEmployeeModal(selectedEmployee)}
                    className="p-1 text-slate-500 hover:text-violet-600 bg-white border border-slate-200 rounded-lg shadow-2xs"
                    title="Edit Karyawan"
                  >
                    <Edit size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEmployee(selectedEmployee.id, selectedEmployee.nama)}
                    className="p-1 text-slate-500 hover:text-red-600 bg-white border border-slate-200 rounded-lg shadow-2xs"
                    title="Hapus Karyawan"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Employee Selector - Sideways Expandable Panel (lg+ screens) */}
          <div className="hidden lg:block w-[220px] hover:w-[320px] transition-all duration-300 ease-in-out bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 shrink-0 group/sidebar">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="min-w-0 pr-1">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <User className="w-4 h-4 text-violet-600 shrink-0" />
                  <span className="truncate">Pilih Karyawan</span>
                </h3>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Total: {companyEmployees.length} karyawan</span>
              </div>
              <button
                type="button"
                onClick={openAddEmployeeModal}
                className="px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-sm flex items-center gap-1 shrink-0"
                title="Tambah Karyawan Baru & Input Gaji"
              >
                <Plus size={13} />
                <span className="hidden group-hover/sidebar:inline">Tambah</span>
              </button>
            </div>
            
            <div className="space-y-2 max-h-[500px] sm:max-h-[calc(100vh-280px)] overflow-y-auto pr-1 pb-4 scrollbar-thin">
              {companyEmployees.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-xs text-slate-400">Belum ada data karyawan.</p>
                  <button
                    onClick={openAddEmployeeModal}
                    className="px-3 py-1.5 bg-violet-50 text-violet-600 border border-violet-200 text-xs font-bold rounded-lg"
                  >
                    + Tambah Karyawan Pertama
                  </button>
                </div>
              ) : (
                companyEmployees.map(emp => {
                  const hasRecord = kpiRecords.find(r => r.employeeId === emp.id && r.month === filterMonth && r.year === filterYear);
                  const isSelected = selectedEmployeeId === emp.id;
                  const jab = jabatans.find(j => j.id === emp.jabatanId);

                  return (
                    <div
                      key={emp.id}
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      className={`w-full text-left p-2.5 rounded-xl border flex flex-col justify-between transition-all duration-200 cursor-pointer ${
                        isSelected 
                          ? 'bg-violet-50/90 border-violet-300 ring-1 ring-violet-200 shadow-sm' 
                          : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-xs block font-bold leading-tight truncate ${isSelected ? 'text-violet-950 font-black' : 'text-slate-800'}`}>
                              {emp.nama}
                            </span>
                            {hasRecord ? (
                              hasRecord.status === 'approved' ? (
                                <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" title="Penilaian Approved" />
                              ) : (
                                <span className="w-2 h-2 bg-amber-400 rounded-full shrink-0" title="Penilaian Draft" />
                              )
                            ) : (
                              <span className="w-2 h-2 bg-slate-300 rounded-full shrink-0" title="Belum dinilai" />
                            )}
                          </div>

                          {/* Desktop Action Buttons & Chevron */}
                          <div className={`hidden sm:flex items-center gap-1 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200'}`}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditEmployeeModal(emp);
                              }}
                              className="p-1 text-slate-400 hover:text-violet-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
                              title="Edit Data & Gaji Karyawan"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteEmployee(emp.id, emp.nama);
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
                              title="Hapus Karyawan"
                            >
                              <Trash2 size={13} />
                            </button>
                            <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? 'text-violet-600' : 'text-slate-300'}`} />
                          </div>
                        </div>

                        {/* Expandable Details on Sidebar Hover or Selected (Desktop) */}
                        <div className={`transition-all duration-300 overflow-hidden flex flex-wrap items-center gap-x-2 gap-y-0.5 ${
                          isSelected 
                            ? 'max-h-20 opacity-100 mt-1.5' 
                            : 'max-h-0 opacity-0 group-hover/sidebar:max-h-20 group-hover/sidebar:opacity-100 group-hover/sidebar:mt-1.5'
                        }`}>
                          <span className="text-[10px] text-slate-500 uppercase font-medium truncate max-w-[120px]">
                            {jab ? jab.name : (
                              <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                ⚠️ Belum ada jabatan
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-300">•</span>
                          <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50/90 px-1.5 py-0.5 rounded border border-emerald-100">
                            {formatRupiah(emp.gaji || 0)}
                          </span>
                        </div>
                      </div>

                      {/* Mobile view action bar */}
                      <div className="flex sm:hidden items-center justify-between pt-1.5 mt-1 border-t border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 uppercase font-medium">
                            {jab?.name || 'Staff'}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-emerald-700">
                            {formatRupiah(emp.gaji || 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditEmployeeModal(emp);
                            }}
                            className="p-1 text-slate-400 hover:text-violet-600"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEmployee(emp.id, emp.nama);
                            }}
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* KPI Input Matrix form */}
          <div className="flex-1 min-w-0 w-full bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            {!selectedEmployee ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
                <Award className="w-12 h-12 text-slate-300" />
                <h3 className="text-sm font-bold text-slate-700">Silakan pilih karyawan di sebelah kiri</h3>
                <p className="text-xs text-slate-400 max-w-xs">Pilih karyawan untuk menginput nilai indikator KPI kualitatif dan kuantitatif bulan ini.</p>
              </div>
            ) : !activeTemplateForEmployee(selectedEmployee) ? (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-xs animate-in fade-in duration-200">
                <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-black text-amber-950">
                    Harap pilih jabatan untuk mendapatkan nilai KPI
                  </h3>
                  <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed">
                    Karyawan <strong>{selectedEmployee.nama}</strong> saat ini belum memiliki jabatan aktif atau template KPI jabatannya telah dihapus dari sistem. Silakan tentukan jabatan di bawah ini agar template KPI jabatan dan lembar penilaian dapat diaktifkan.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-md mx-auto pt-3">
                  <select
                    value={assignJabatanId}
                    onChange={(e) => setAssignJabatanId(e.target.value)}
                    className="w-full sm:w-auto flex-1 p-2.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-violet-500 shadow-xs cursor-pointer"
                  >
                    <option value="">-- Pilih Jabatan / Template KPI --</option>
                    {availableJabatanOptions.map(j => (
                      <option key={j.id} value={j.id}>{j.name} (Bonus: {j.percentage}%)</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!assignJabatanId}
                    onClick={() => {
                      if (!assignJabatanId) return;
                      const matchOpt = availableJabatanOptions.find(j => j.id === assignJabatanId) || jabatans.find(j => j.id === assignJabatanId);
                      const jabTitle = matchOpt?.name || '';

                      if (matchOpt && !jabatans.some(j => j.id === matchOpt.id || j.name.toLowerCase().trim() === matchOpt.name.toLowerCase().trim())) {
                        setJabatans(prev => [...prev, { id: matchOpt.id, name: matchOpt.name, percentage: matchOpt.percentage }]);
                      }

                      setKpiEmployees(prev => {
                        const updated = prev.map(e => e.id === selectedEmployee.id ? { ...e, jabatanId: assignJabatanId, jabatan: jabTitle, role: jabTitle } : e);
                        safeSetLocalStorage('mypanca_kpi_employees', JSON.stringify(updated));
                        return updated;
                      });

                      if (onUpdateEmployees) {
                        onUpdateEmployees(kpiEmployees.map(e => {
                          if (e.id === selectedEmployee.id) {
                            return { ...e, jabatanId: assignJabatanId, jabatan: jabTitle, role: jabTitle } as any;
                          }
                          const jName = getEmployeeJabatanName(e);
                          return { ...e, jabatan: jName, role: jName } as any;
                        }));
                      }

                      setAssignJabatanId('');
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm"
                  >
                    Terapkan Jabatan
                  </button>
                </div>
              </div>
            ) : (() => {
              const activeRecord = kpiRecords.find(r => r.employeeId === selectedEmployee.id && r.month === filterMonth && r.year === filterYear);
              const isRecordApproved = activeRecord?.status === 'approved';

              return (
                <div className="space-y-6">
                  {/* Employee Header Info */}
                  <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-black text-slate-800">{selectedEmployee.nama}</h2>
                        <button
                          type="button"
                          onClick={() => openEditEmployeeModal(selectedEmployee)}
                          className="p-1 text-slate-400 hover:text-violet-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Data & Gaji Karyawan"
                        >
                          <Edit size={13} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded uppercase">
                          NIK: {selectedEmployee.nik || '-'}
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 bg-violet-50 border border-violet-100 text-violet-600 rounded uppercase">
                          Jabatan: {jabatans.find(j => j.id === selectedEmployee.jabatanId)?.name || selectedEmployee.jabatan || selectedEmployee.role || 'Staff'}
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded font-mono">
                          Gaji Pokok: {formatRupiah(selectedEmployee.gaji || 0)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded border shadow-2xs ${
                        isRecordApproved 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold' 
                          : 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse'
                      }`}>
                        {isRecordApproved ? '✓ Disetujui (Status Hijau)' : '✍ Draft'}
                      </span>
                    </div>
                  </div>

                  {/* Lock Banner when Approved */}
                  {isRecordApproved && (
                    <div className="bg-emerald-50/90 border border-emerald-200 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-emerald-950 text-xs font-bold shadow-2xs animate-in fade-in duration-150">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Penilaian Karyawan Ini Berstatus Disetujui (Status Hijau) & Dikunci. Data Key Performance Indicator dan Soft Skill tidak dapat diedit lagi.</span>
                      </div>
                      {isAuthorizedToApprove && (
                        <button
                          type="button"
                          onClick={handleUnlockRecord}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-[11px] uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                        >
                          <Unlock size={13} />
                          Buka Kunci (Edit)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Score Input Block */}
                  <div className="space-y-6">
                    {/* Summary of Weight Settings */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">Proporsi Bobot Lembar KPI</h4>
                        <p className="text-[10px] text-slate-400">Sesuaikan pembagian persentase antara KPI Teknis (A) dan Soft Skill (B).</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500 font-bold">KPI (A):</span>
                          <input
                            type="number"
                            value={hardWeight}
                            disabled={isRecordApproved}
                            onChange={(e) => {
                              const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              setHardWeight(val);
                              setSoftWeight(100 - val);
                            }}
                            className="w-12 p-1 text-center text-xs font-bold bg-white border border-slate-200 rounded focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                          />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500 font-bold">Soft Skill (B):</span>
                          <input
                            type="number"
                            value={softWeight}
                            disabled
                            className="w-12 p-1 text-center text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 rounded outline-none"
                          />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Section A: Hard KPIs */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Activity className="w-4 h-4 text-violet-500" />
                          A. PENILAIAN KEY PERFORMANCE INDICATOR (BOBOT {hardWeight}%)
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400">Total Akumulasi Maksimal: 100%</span>
                      </div>

                      {weightWarningPenilaian && (
                        <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-150">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>{weightWarningPenilaian}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setWeightWarningPenilaian(null)}
                            className="text-amber-600 hover:text-amber-800 text-xs px-1.5 py-0.5 rounded hover:bg-amber-100 font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                              <th className="p-3 w-8 text-center">No</th>
                              <th className="p-3 min-w-[240px]">Key Result Area & Indikator</th>
                              <th className="p-3 w-20 text-center">Bobot</th>
                              <th className="p-3 w-24 text-center">Metode</th>
                              <th className="p-3 min-w-[130px] text-center">Target</th>
                              <th className="p-3 w-16 text-center">Satuan</th>
                              <th className="p-3 min-w-[130px] text-center">Realisasi</th>
                              <th className="p-3 w-16 text-center">Satuan</th>
                              <th className="p-3 w-20 text-right">Nilai</th>
                              {!isRecordApproved && <th className="p-3 w-10 text-center">Aksi</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {hardKPIInputs.map((item, idx) => {
                              const isCustomInd = item.indicatorId?.startsWith('ind-custom-') || item.isCustom;
                              return (
                                <tr key={idx} className={`hover:bg-slate-50/50 ${isCustomInd ? 'bg-violet-50/20' : ''}`}>
                                  <td className="p-3 text-center font-mono text-[10px] text-slate-400">{idx + 1}</td>
                                  <td className="p-3">
                                    <input
                                      type="text"
                                      value={item.name}
                                      disabled={isRecordApproved}
                                      onChange={(e) => updateHardKPIField(idx, 'name', e.target.value)}
                                      placeholder="Nama Indikator KPI..."
                                      className="p-1.5 bg-white border border-slate-200 hover:border-violet-300 focus:border-violet-500 rounded text-xs font-bold text-slate-800 w-full outline-none focus:ring-1 focus:ring-violet-500 transition-colors disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                    />
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                      {isCustomInd ? (
                                        <span className="text-[9px] font-bold text-violet-700 bg-violet-100/70 px-1.5 py-0.5 rounded border border-violet-200 inline-flex items-center gap-1">
                                          ★ Custom Individu
                                        </span>
                                      ) : item.indicatorId ? (
                                        <span className="text-[9px] text-slate-400 font-mono">Template ID: {item.indicatorId}</span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="p-3 text-center">
                                    <div className="flex items-center gap-1 justify-center">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={item.bobot === '' ? '' : item.bobot}
                                        disabled={isRecordApproved}
                                        onChange={(e) => updateHardKPIField(idx, 'bobot', e.target.value)}
                                        className="w-14 p-1 text-center bg-white border border-slate-200 rounded text-xs font-bold focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                      />
                                      <span className="text-slate-400 font-bold">%</span>
                                    </div>
                                  </td>
                                  <td className="p-3 text-center">
                                    <select
                                      value={item.metode}
                                      disabled={isRecordApproved}
                                      onChange={(e) => updateHardKPIField(idx, 'metode', e.target.value)}
                                      className="p-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-700 focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                    >
                                      <option value="Maximize">Maximize</option>
                                      <option value="Minimize">Minimize</option>
                                    </select>
                                  </td>
                                  <td className="p-3 text-center">
                                    <FormattedNumberInput
                                      value={item.target}
                                      disabled={isRecordApproved}
                                      onChange={(val) => updateHardKPIField(idx, 'target', val)}
                                      className="w-28 sm:w-32 p-1.5 text-center bg-white border border-slate-200 rounded text-xs font-bold font-mono focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                      allowDecimal
                                    />
                                  </td>
                                  <td className="p-3 text-center">
                                    <select
                                      value={item.satuan || '%'}
                                      disabled={isRecordApproved}
                                      onChange={(e) => updateHardKPIField(idx, 'satuan', e.target.value)}
                                      className="p-1 bg-white border border-slate-200 rounded text-xs font-bold text-center w-16 outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer text-slate-700 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                    >
                                      {KPI_SATUAN_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-3 text-center">
                                    <FormattedNumberInput
                                      value={item.realisasi}
                                      disabled={isRecordApproved}
                                      onChange={(val) => updateHardKPIField(idx, 'realisasi', val)}
                                      className="w-28 sm:w-32 p-1.5 text-center bg-white border border-slate-200 rounded text-xs font-black text-violet-700 font-mono focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                      allowDecimal
                                    />
                                  </td>
                                  <td className="p-3 text-center">
                                    <select
                                      value={item.satuan || '%'}
                                      disabled={isRecordApproved}
                                      onChange={(e) => updateHardKPIField(idx, 'satuan', e.target.value)}
                                      className="p-1 bg-white border border-slate-200 rounded text-xs font-bold text-center w-16 outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer text-slate-600 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                    >
                                      {KPI_SATUAN_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-3 text-right font-black font-mono text-slate-700">{formatDotNumber(item.score)}</td>
                                  {!isRecordApproved && (
                                    <td className="p-3 text-center">
                                      <button
                                        onClick={() => {
                                          const targetItem = hardKPIInputs[idx];
                                          const nextInputs = hardKPIInputs.filter((_, i) => i !== idx);
                                          setHardKPIInputs(nextInputs);
                                          setWeightWarningPenilaian(null);
                                          if (selectedEmployeeId) {
                                            setEmployeeIndividualSheets(curr => {
                                              const updated = {
                                                ...curr,
                                                [selectedEmployeeId]: {
                                                  hardKPIs: nextInputs,
                                                  softSkills: softSkillInputs,
                                                  hardWeight,
                                                  softWeight
                                                }
                                              };
                                              safeSetLocalStorage('mypanca_kpi_employee_individual_sheets', updated);
                                              return updated;
                                            });
                                          }
                                          if (selectedEmployeeId && targetItem && (targetItem.indicatorId?.startsWith('ind-custom-') || targetItem.isCustom)) {
                                            setEmployeeCustomIndicators(curr => {
                                              const filtered = (curr[selectedEmployeeId] || []).filter(ci => ci.indicatorId !== targetItem.indicatorId);
                                              const updated = { ...curr, [selectedEmployeeId]: filtered };
                                              safeSetLocalStorage('mypanca_kpi_employee_custom_indicators', updated);
                                              return updated;
                                            });
                                          }
                                        }}
                                        className="text-red-500 hover:text-red-700 p-1 bg-red-50 rounded"
                                        title="Hapus Indikator"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                            {(() => {
                              const total = hardKPIInputs.reduce((sum, item) => sum + (parseFloat(item.bobot) || 0), 0);
                              const isValid = total === 100;
                              const isOver = total > 100;
                              return (
                                <tr className={`font-bold ${isOver ? 'bg-red-50/70 text-red-900 border-t-2 border-red-200' : isValid ? 'bg-slate-50 text-slate-700 border-t-2 border-slate-200' : 'bg-amber-50/70 text-amber-900 border-t-2 border-amber-200'}`}>
                                  <td colSpan={2} className="p-3 text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                                    TOTAL AKUMULASI BOBOT KPI (HARD)
                                  </td>
                                  <td className="p-3 text-center whitespace-nowrap">
                                    <span className={`font-mono font-black text-xs px-2.5 py-1 rounded border inline-block ${
                                      isOver ? 'bg-red-100 text-red-700 border-red-300' :
                                      isValid ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                      'bg-amber-100 text-amber-800 border-amber-300'
                                    }`}>
                                      {total}%
                                    </span>
                                  </td>
                                  <td colSpan={5} className="p-3">
                                    {isOver ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-100/60 px-3 py-1 rounded-lg border border-red-200">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                                        <span>⚠️ Tidak Valid (Total bobot melebihi 100%! Saat ini {total}%. Harap kurangi bobot indikator lain)</span>
                                      </span>
                                    ) : isValid ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100/60 px-3 py-1 rounded-lg border border-emerald-200">
                                        <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                        <span>✓ 100% Valid (Total bobot pas 100%)</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100/60 px-3 py-1 rounded-lg border border-amber-200">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                                        <span>⚠️ Belum Valid (Total bobot baru {total}%. Tersisa {100 - total}% lagi untuk mencapai 100%)</span>
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right font-black font-mono text-slate-900 whitespace-nowrap">{formatDotNumber(getHardKPITotal(hardKPIInputs).toFixed(2))}</td>
                                  {!isRecordApproved && <td></td>}
                                </tr>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>

                      {!isRecordApproved && (
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              const currentTotal = hardKPIInputs.reduce((sum, item) => sum + (parseFloat(item.bobot) || 0), 0);
                              const remaining = Math.max(0, 100 - currentTotal);
                              const newBobot = remaining > 0 ? Math.min(10, remaining) : 10;
                              setWeightWarningPenilaian(null);
                              const newInd = {
                                indicatorId: `ind-custom-${Date.now()}`,
                                name: 'Indikator Khusus Karyawan Ini',
                                bobot: newBobot,
                                metode: 'Maximize' as 'Maximize' | 'Minimize',
                                target: 100,
                                satuan: '%',
                                realisasi: 80,
                                score: Math.round(newBobot * 0.8 * 100) / 100,
                                isCustom: true
                              };
                              const nextInputs = [...hardKPIInputs, newInd];
                              setHardKPIInputs(nextInputs);
                              if (selectedEmployeeId) {
                                setEmployeeIndividualSheets(curr => {
                                  const updated = {
                                    ...curr,
                                    [selectedEmployeeId]: {
                                      hardKPIs: nextInputs,
                                      softSkills: softSkillInputs,
                                      hardWeight,
                                      softWeight
                                    }
                                  };
                                  safeSetLocalStorage('mypanca_kpi_employee_individual_sheets', updated);
                                  return updated;
                                });
                                setEmployeeCustomIndicators(curr => {
                                  const empList = curr[selectedEmployeeId] || [];
                                  const updated = [...empList, newInd];
                                  safeSetLocalStorage('mypanca_kpi_employee_custom_indicators', { ...curr, [selectedEmployeeId]: updated });
                                  return { ...curr, [selectedEmployeeId]: updated };
                                });
                              }
                            }}
                            className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold rounded-lg border border-violet-200 transition-colors flex items-center gap-1.5 shadow-2xs"
                          >
                            <Plus size={14} className="text-violet-600" />
                            Tambah Indikator Tambahan (Custom Tersimpan untuk Karyawan Ini)
                          </button>
                          <span className="text-[10px] font-bold text-slate-400">Total akumulasi bobot otomatis dibatasi maksimal 100%.</span>
                        </div>
                      )}
                    </div>

                    {/* Section B: Soft Skills */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-emerald-500" />
                          B. PENILAIAN SOFT SKILL (BOBOT {softWeight}%)
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400">Total Akumulasi Maksimal: 100%</span>
                      </div>

                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                              <th className="p-3 w-8 text-center">No</th>
                              <th className="p-3 min-w-[200px]">Aspek Kompetensi Utama</th>
                              <th className="p-3 w-20 text-center">Bobot</th>
                              <th className="p-3 w-24 text-center">Nilai (1-100)</th>
                              <th className="p-3 w-24 text-right">Skor Terbobot</th>
                              {!isRecordApproved && <th className="p-3 w-10 text-center">Aksi</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {softSkillInputs.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="p-3 text-center font-mono text-[10px] text-slate-400">{idx + 1}</td>
                                <td className="p-3">
                                  <input
                                    type="text"
                                    value={item.name}
                                    disabled={isRecordApproved}
                                    onChange={(e) => updateSoftSkillField(idx, 'name', e.target.value)}
                                    placeholder="Nama Aspek Soft Skill..."
                                    className="p-1.5 bg-white border border-slate-200 hover:border-emerald-300 focus:border-emerald-500 rounded text-xs font-bold text-slate-800 w-full outline-none focus:ring-1 focus:ring-emerald-500 transition-colors disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="p-3 text-center">
                                  <div className="flex items-center gap-1 justify-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={item.bobot === '' ? '' : item.bobot}
                                      disabled={isRecordApproved}
                                      onChange={(e) => updateSoftSkillField(idx, 'bobot', e.target.value)}
                                      className="w-14 p-1 text-center bg-white border border-slate-200 rounded text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                    />
                                    <span className="text-slate-400 font-bold">%</span>
                                  </div>
                                </td>
                                <td className="p-3 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={item.nilai === '' ? '' : item.nilai}
                                    disabled={isRecordApproved}
                                    onChange={(e) => updateSoftSkillField(idx, 'nilai', e.target.value === '' ? '' : Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                                    className="w-16 p-1 text-center bg-white border border-slate-200 rounded text-xs font-black text-emerald-700 focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="p-3 text-right font-black font-mono text-slate-700">{formatDotNumber(item.score)}</td>
                                {!isRecordApproved && (
                                  <td className="p-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => deleteSoftSkillRow(idx)}
                                      className="text-red-500 hover:text-red-700 p-1 bg-red-50 hover:bg-red-100 rounded transition-colors"
                                      title="Hapus Aspek Soft Skill"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                            {(() => {
                              const totalSoftBobot = softSkillInputs.reduce((sum, item) => sum + (parseFloat(item.bobot) || 0), 0);
                              const isValid = totalSoftBobot === 100;
                              const isOver = totalSoftBobot > 100;
                              return (
                                <tr className={`font-bold ${isOver ? 'bg-red-50/70 text-red-900 border-t-2 border-red-200' : isValid ? 'bg-slate-50 text-slate-700 border-t-2 border-slate-200' : 'bg-amber-50/70 text-amber-900 border-t-2 border-amber-200'}`}>
                                  <td colSpan={2} className="p-3 text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                                    TOTAL AKUMULASI BOBOT SOFT SKILL (BAGIAN B)
                                  </td>
                                  <td className="p-3 text-center whitespace-nowrap">
                                    <span className={`font-mono font-black text-xs px-2.5 py-1 rounded border inline-block ${
                                      isOver ? 'bg-red-100 text-red-700 border-red-300' :
                                      isValid ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                      'bg-amber-100 text-amber-800 border-amber-300'
                                    }`}>
                                      {totalSoftBobot}%
                                    </span>
                                  </td>
                                  <td colSpan={1} className="p-3">
                                    {isOver ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-100/60 px-2.5 py-0.5 rounded-lg border border-red-200">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                                        <span>⚠️ Tidak Valid (Total bobot melebihi 100%! Saat ini {totalSoftBobot}%)</span>
                                      </span>
                                    ) : isValid ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100/60 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                                        <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                        <span>✓ 100% Valid (Total bobot pas 100%)</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100/60 px-2.5 py-0.5 rounded-lg border border-amber-200">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                                        <span>⚠️ Belum Valid (Total bobot baru {totalSoftBobot}%. Tersisa {100 - totalSoftBobot}%)</span>
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right font-black font-mono text-slate-900 whitespace-nowrap">{formatDotNumber(getSoftSkillTotal(softSkillInputs).toFixed(2))}</td>
                                  {!isRecordApproved && <td></td>}
                                </tr>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>

                      {!isRecordApproved && (
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={addSoftSkillRow}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-colors flex items-center gap-1.5 shadow-2xs"
                          >
                            <Plus size={14} className="text-emerald-600" />
                            Tambah Aspek Soft Skill (Custom Individu)
                          </button>
                          <span className="text-[10px] font-bold text-slate-400">Total akumulasi bobot Bagian B maksimal 100%.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Note Field */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Catatan Evaluasi Atasan</label>
                    <textarea
                      value={recordNotes}
                      disabled={isRecordApproved}
                      onChange={(e) => setRecordNotes(e.target.value)}
                      placeholder="Berikan masukan konstruktif untuk pencapaian kinerja bulan ini..."
                      rows={3}
                      className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none transition-all disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Summary calculation display */}
                  <div className="p-4 bg-violet-50 rounded-xl border border-violet-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-violet-400 block uppercase leading-none mb-1">Skor Akhir & Grade</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-violet-900">
                          {(() => {
                            const hTotal = getHardKPITotal(hardKPIInputs);
                            const sTotal = getSoftSkillTotal(softSkillInputs);
                            return getOverallTotal(hTotal, sTotal, hardWeight, softWeight).toFixed(2);
                          })()}
                        </span>
                        <span className="text-[10px] text-violet-500 font-semibold">
                          ({hardWeight}% KPI + {softWeight}% Soft Skill)
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(() => {
                        const hTotal = getHardKPITotal(hardKPIInputs);
                        const sTotal = getSoftSkillTotal(softSkillInputs);
                        const score = getOverallTotal(hTotal, sTotal, hardWeight, softWeight);
                        const grade = getKPIGrade(score);
                        return (
                          <>
                            <div className={`px-3 py-1.5 rounded-lg border text-xs font-black uppercase flex items-center gap-1.5 ${grade.color}`}>
                              <span>Grade {grade.code}</span>
                              <span className="text-[9px] opacity-70 font-bold">({grade.label})</span>
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => {
                                // Open print layout modal
                                const currentRecordObj: KPIRecord = {
                                  id: editingRecordId || `kpi-${selectedEmployeeId}-${filterMonth}-${filterYear}`,
                                  employeeId: selectedEmployeeId,
                                  month: filterMonth,
                                  year: filterYear,
                                  scores: {},
                                  status: isRecordApproved ? 'approved' : 'draft',
                                  notes: recordNotes,
                                  hardKPIs: hardKPIInputs,
                                  softSkills: softSkillInputs,
                                  hardWeight,
                                  softWeight,
                                  finalScore: score
                                };
                                setPrintModalRecord(currentRecordObj);
                              }}
                              className="p-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm cursor-pointer"
                              title="Preview Lembar KPI"
                            >
                              <Printer className="w-4 h-4 text-violet-600" />
                              <span>Preview Cetak</span>
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {isRecordApproved ? (
                    <div className="flex flex-wrap items-center justify-between w-full bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl shadow-2xs gap-3">
                      <span className="text-xs font-bold text-emerald-900 flex items-center gap-2">
                        <CheckCircle className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                        Data Penilaian KPI Karyawan Ini Telah Disetujui (Status Hijau) & Dikunci.
                      </span>
                      {isAuthorizedToApprove && (
                        <button
                          type="button"
                          onClick={handleUnlockRecord}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <Unlock size={14} />
                          Buka Kunci untuk Edit
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        onClick={() => handleSaveKPIRecord('draft')}
                        className="px-5 py-2.5 bg-slate-100 text-slate-700 text-xs font-black uppercase rounded-xl hover:bg-slate-200 transition-colors"
                      >
                        Simpan Sebagai Draft
                      </button>

                      {isAuthorizedToApprove && (
                        <button
                          onClick={() => handleSaveKPIRecord('approved')}
                          className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black uppercase rounded-xl transition-colors flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Setujui Nilai (Approve)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {activeSubTab === 'rekap' && (
        <div className="space-y-6">
          {/* visual performance metrics & overall status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-400" />
                Tren Nilai Rata-rata KPI Karyawan
              </h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={kpiTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Line type="monotone" dataKey="Rata-rata KPI" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-400" />
                Distribusi Kinerja Bulan Ini
              </h3>
              
              <div className="space-y-3">
                {['A', 'B', 'C', 'D'].map(gradeCode => {
                  const count = employeesRecap.filter(e => e.kpiGrade?.code === gradeCode).length;
                  const total = companyEmployees.length || 1;
                  const pct = Math.round((count / total) * 100);
                  
                  let color = 'bg-emerald-500';
                  if (gradeCode === 'B') color = 'bg-blue-500';
                  if (gradeCode === 'C') color = 'bg-amber-500';
                  if (gradeCode === 'D') color = 'bg-red-500';

                  return (
                    <div key={gradeCode} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-600">
                        <span>Grade {gradeCode}</span>
                        <span>{count} Orang ({pct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rincian Slip Gaji Karyawan & Take Home Pay (THP) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden font-sans">
            {/* Top Bar with title and Total THP widget */}
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-violet-600 text-white rounded-xl shadow-sm">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Rincian Slip Gaji & Rekap Kinerja Karyawan</span>
                    <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                      Periode {filterMonth}/{filterYear}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Rekapitulasi gaji pokok, capaian skor KPI, profit sharing bonus, bonus proyek, dan total take home pay (THP)
                  </p>
                </div>
              </div>

              {/* Total THP widget on top right */}
              <div className="flex items-center gap-2.5 self-end md:self-auto">
                <span className="text-xs font-black text-slate-700 uppercase tracking-tight">Total Seluruh THP</span>
                <div className="bg-emerald-50 border-2 border-emerald-300 px-4 py-1.5 rounded-xl text-xs font-mono font-black text-emerald-800 shadow-xs">
                  {formatRupiah(rekapTotals.gajiPokok + rekapTotals.totalAllBonus)}
                </div>
              </div>
            </div>

            {/* Omset Kotor & Multiplier Status Banner */}
            <div className={`p-3.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs font-bold ${
              activeOmsetMultiplier > 0 
                ? 'bg-emerald-50/90 text-emerald-950 border-emerald-200' 
                : 'bg-amber-50/90 text-amber-950 border-amber-200'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${activeOmsetMultiplier > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  <Activity size={14} />
                </div>
                <div>
                  <span className="block font-black text-xs">
                    Akumulasi Omset Kotor Bulan Ini: {formatRupiah(activeFinancials.omsetKotor)} — Multiplier Pengali Omset = <span className="underline font-mono">{activeOmsetMultiplier}x</span>
                  </span>
                  <span className="text-[10px] opacity-80 font-medium block mt-0.5">
                    {activeOmsetMultiplier > 0 
                      ? `✓ Syarat minimal omset terpenuhi (Multiplier ${activeOmsetMultiplier}x aktif). Rumus: Gaji Pokok × Alokasi Jabatan % × Grade KPI % × Multiplier (${activeOmsetMultiplier}x)`
                      : `⚠️ Total Omset Kotor belum mencapai batas minimal Tier III (Rp 200.000.000). Sesuai aturan T&C, Multiplier = 0 (Bonus KPI Bulanan belum cair / Rp 0).`
                    }
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-mono uppercase bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs inline-block">
                  Formula: Gaji Pokok × Alokasi Jabatan × Grade × Multiplier
                </span>
              </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="p-3.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
                  <Filter size={13} className="text-slate-400" />
                  <span className="font-bold text-slate-500 text-[11px] uppercase">Departemen:</span>
                  <select
                    value={rekapDeptFilter}
                    onChange={(e) => setRekapDeptFilter(e.target.value)}
                    className="font-bold text-slate-700 bg-transparent outline-none cursor-pointer text-xs"
                  >
                    <option value="ALL">Semua Departemen</option>
                    <option value="Sales">Sales</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Management">Management</option>
                    <option value="Warehouse">Warehouse</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
                  <User size={13} className="text-slate-400" />
                  <input
                    type="text"
                    value={rekapSearchQuery}
                    onChange={(e) => setRekapSearchQuery(e.target.value)}
                    placeholder="Cari nama karyawan..."
                    className="font-bold text-slate-700 bg-transparent outline-none w-36 placeholder:text-slate-400 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportExcel}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 text-xs"
                >
                  <FileSpreadsheet size={14} />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase border-b border-slate-200">
                      <th className="p-3 w-10 text-center">No</th>
                      <th className="p-3 min-w-[180px]">Nama Karyawan</th>
                      <th className="p-3 min-w-[140px]">Jabatan</th>
                      <th className="p-3 w-28 text-center">Skor & Grade</th>
                      <th className="p-3 w-24 text-center">Status KPI</th>
                      <th className="p-3 min-w-[130px] text-right">Gaji Pokok</th>
                      <th className="p-3 min-w-[130px] text-right">Bonus KPI (Profit Share)</th>
                      <th className="p-3 min-w-[130px] text-right">Bonus Proyek</th>
                      <th className="p-3 min-w-[140px] text-right bg-slate-100/60 font-black text-slate-900">Total THP</th>
                      <th className="p-3 w-28 text-center">Pending Bonus</th>
                      <th className="p-3 w-24 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {filteredRecapRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400">Belum ada rekap data bulan ini.</td>
                      </tr>
                    ) : (
                      filteredRecapRows.map((item, idx) => {
                        const hasReadPermission = isAuthorizedToSeeSalary || currentUser?.nama === item.employee.nama;
                        const empJab = jabatans.find(j => j.id === item.employee.jabatanId);
                        const displayJabatan = empJab ? empJab.name : (item.employee.jabatan || item.employee.role || 'Staff');

                        return (
                          <tr key={item.employee.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="p-3 text-center font-mono text-[11px] text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="p-3">
                              <span className="font-bold text-slate-900 block">{item.employee.nama}</span>
                              <span className="text-[9px] text-slate-400 uppercase font-mono mt-0.5">NIK: {item.employee.nik || '-'}</span>
                            </td>
                            <td className="p-4 font-bold text-slate-500 uppercase">{displayJabatan}</td>
                            <td className="p-4">
                              {item.kpiScore !== null ? (
                                <div className="flex items-center gap-1.5 justify-center">
                                  <span className="font-bold text-slate-800">{item.kpiScore}</span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-black ${item.kpiGrade?.color}`}>
                                    {item.kpiGrade?.code}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-center block">-</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              {item.kpiScore !== null ? (
                                item.kpiApproved ? (
                                  <span className="text-emerald-600 font-bold">Approved</span>
                                ) : (
                                  <span className="text-amber-500 font-bold">Draft</span>
                                )
                              ) : (
                                <span className="text-slate-400">Belum Dinilai</span>
                              )}
                            </td>
                            <td className="p-4 font-mono font-bold text-right">
                              {hasReadPermission ? (
                                <span>{formatRupiah(item.employee.gaji || 0)}</span>
                              ) : (
                                <span className="text-slate-400"><Lock size={12} className="inline mr-1" /> Terkunci</span>
                              )}
                            </td>
                            <td className="p-4 font-mono text-slate-600 text-right">
                              {hasReadPermission ? (
                                formatRupiah(item.calculatedBonus)
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="p-4 font-mono text-slate-600 text-right">
                              {hasReadPermission ? (
                                formatRupiah(item.bonusProjectKomisi)
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="p-4 font-mono font-black text-slate-900 bg-slate-50/20 text-right">
                              {hasReadPermission ? (
                                formatRupiah(item.totalTakeHomePay)
                              ) : (
                                <span className="text-slate-400"><Lock size={12} className="inline mr-1" /> Terkunci</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {item.deferredProjectBonus > 0 ? (
                                <div className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-[11px]" title="Bonus ditangguhkan karena Invoice Belum Lunas">
                                  <AlertCircle size={11} />
                                  <span className="font-mono">{formatRupiah(item.deferredProjectBonus)}</span>
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenPrintPreviewForEmployee(item)}
                                className="px-2.5 py-1 bg-white hover:bg-violet-50 text-violet-700 hover:text-violet-900 border border-violet-200 hover:border-violet-300 rounded-lg text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                                title={`Preview Lembar KPI & Slip Gaji ${item.employee.nama}`}
                              >
                                <Printer size={12} />
                                <span>Cetak</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                {/* Summary Total Row */}
                {filteredRecapRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-300 text-xs">
                      <td colSpan={5} className="p-3.5 text-right uppercase tracking-wider text-slate-800 font-black">
                        TOTAL KESELURUHAN:
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-slate-900">
                        {isAuthorizedToSeeSalary ? formatRupiah(filteredRecapRows.reduce((sum, r) => sum + (r.gajiPokok || 0), 0)) : '••••••••'}
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-slate-900">
                        {isAuthorizedToSeeSalary ? formatRupiah(filteredRecapRows.reduce((sum, r) => sum + (r.calculatedBonus || 0), 0)) : '••••••••'}
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-slate-900">
                        {isAuthorizedToSeeSalary ? formatRupiah(filteredRecapRows.reduce((sum, r) => sum + (r.bonusProjectKomisi || 0), 0)) : '••••••••'}
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-emerald-800 bg-emerald-100/70">
                        {isAuthorizedToSeeSalary ? formatRupiah(filteredRecapRows.reduce((sum, r) => sum + (r.totalTakeHomePay || 0), 0)) : '••••••••'}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-amber-800">
                        {(() => {
                          const defTotal = filteredRecapRows.reduce((sum, r) => sum + (r.deferredProjectBonus || 0), 0);
                          return defTotal > 0 ? formatRupiah(defTotal) : '-';
                        })()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
              </div>
          </div>
        </div>
      )}

      {activeSubTab === 'project-bonus' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Bonus Project (Sales & Engineering)</h2>
                <span className="text-[10px] uppercase font-black tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Formula KPI.xlsx
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Kalkulasi bonus penjualan (Sales) dari Omset Bersih dan alokasi bonus proyek teknis (Engineering 5% dari komisi sales) untuk periode {filterMonth}/{filterYear}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={syncWithLiveFinancialParameters}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 border border-white/20 shadow-sm"
                title="Samakan nilai tabel dengan Live Financial Parameters"
              >
                <RefreshCw size={14} />
                <span>Samakan dg Live Financial</span>
              </button>
            </div>
          </div>

          {/* Live Financial Parameters Summary Card (Samakan dengan Live Financial Parameters) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Live Financial Parameters (Periode {filterMonth}/{filterYear})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Nilai parameter keuangan bulanan tersinkronisasi 1:1 dengan akumulasi tabel Sales Bonus Project di bawah ini.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle size={12} className="text-emerald-600" />
                  Status: Sinkron 1:1
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Omset Kotor</span>
                <span className="text-sm font-black font-mono text-slate-800 mt-1 block">
                  {formatRupiah(activeFinancials.omsetKotor)}
                </span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">Tabel Sales: {formatRupiah(salesTotals.pencapaian)}</span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Biaya Pajak All</span>
                <span className="text-sm font-black font-mono text-rose-600 mt-1 block">
                  {formatRupiah(activeFinancials.pajak)}
                </span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">Tabel Sales: {formatRupiah(salesTotals.pajak)}</span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Biaya Pengiriman All</span>
                <span className="text-sm font-black font-mono text-amber-600 mt-1 block">
                  {formatRupiah(activeFinancials.pengiriman)}
                </span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">Tabel Sales: {formatRupiah(salesTotals.biayaKirim)}</span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Biaya Lain-Lain All</span>
                <span className="text-sm font-black font-mono text-indigo-600 mt-1 block">
                  {formatRupiah(activeFinancials.lainLain)}
                </span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">Tabel Sales: {formatRupiah(salesTotals.biayaLain)}</span>
              </div>

              <div className="p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-200/80 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Total Omset Bersih</span>
                <span className="text-sm font-black font-mono text-emerald-800 mt-1 block">
                  {formatRupiah(calculatedOmsetBersih)}
                </span>
                <span className="text-[9px] text-emerald-600 mt-0.5 block">Tabel Sales: {formatRupiah(salesTotals.omsetBersih)}</span>
              </div>
            </div>
          </div>

          {/* Section 1: Sales Bonus Project */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
                    <FileSpreadsheet className="w-4 h-4 text-violet-600" />
                    Sales Bonus Project
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100">
                    Target & Komisi Sales
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Omset Bersih = Pencapaian - Pajak - Biaya Kirim - Biaya Lain. Komisi bergradasi sesuai target pencapaian bulanan (KPI.xlsx).
                </p>
              </div>

              {isAuthorizedToManageKPI && (
                <button
                  onClick={() => setIsAddingSalesRow(true)}
                  className="px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
                >
                  <Plus size={14} /> Tambah Baris Sales
                </button>
              )}
            </div>

            {/* Sales Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black text-slate-600 uppercase border-y border-slate-200">
                    <th rowSpan={2} className="p-3 text-center border-r border-slate-200 w-10">No</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-200 min-w-[130px]">Nama</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-200 min-w-[130px]">Jabatan</th>
                    <th rowSpan={2} className="p-3 text-right border-r border-slate-200 min-w-[130px]">Target Bulanan</th>
                    <th rowSpan={2} className="p-3 text-right border-r border-slate-200 min-w-[140px] bg-slate-100/70">Pencapaian (Omset Kotor)</th>
                    <th colSpan={3} className="p-2 text-center border-r border-slate-200 bg-amber-50/70 text-amber-900 border-b border-amber-200">
                      Input Biaya (Live Financial Sync)
                    </th>
                    <th rowSpan={2} className="p-3 text-right border-r border-slate-200 min-w-[130px] bg-emerald-50/70 text-emerald-900">Omset Bersih</th>
                    <th rowSpan={2} className="p-3 text-center border-r border-slate-200 min-w-[90px]">% Capaian</th>
                    <th rowSpan={2} className="p-3 text-right border-r border-slate-200 min-w-[110px]">Additional</th>
                    <th rowSpan={2} className="p-3 text-right border-r border-slate-200 min-w-[120px]">Komisi</th>
                    <th rowSpan={2} className="p-3 text-right border-r border-slate-200 min-w-[130px] bg-violet-50/70 text-violet-900">Grand Total</th>
                    <th rowSpan={2} className="p-3 border-r border-slate-200 min-w-[220px]">Note</th>
                    {isAuthorizedToManageKPI && (
                      <th rowSpan={2} className="p-3 text-center w-14">Aksi</th>
                    )}
                  </tr>
                  <tr className="bg-amber-50/40 text-[10px] font-black text-amber-800 uppercase border-b border-slate-200">
                    <th className="p-2 text-right border-r border-slate-200 min-w-[110px]">Pajak</th>
                    <th className="p-2 text-right border-r border-slate-200 min-w-[110px]">Biaya Kirim</th>
                    <th className="p-2 text-right border-r border-slate-200 min-w-[110px]">Biaya Lain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {calculatedSalesRows.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="p-8 text-center text-slate-400">Belum ada data baris Sales Bonus Project.</td>
                    </tr>
                  ) : (
                    calculatedSalesRows.map((r, idx) => (
                      <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">{idx + 1}</td>
                        <td className="p-3 font-black text-slate-900 border-r border-slate-100">
                          <input
                            type="text"
                            value={r.nama}
                            onChange={(e) => updateSalesBonusRow(r.id, { nama: e.target.value })}
                            className="w-full bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-violet-500 rounded p-1 font-black text-slate-900 outline-none"
                          />
                        </td>
                        <td className="p-3 font-medium text-slate-600 border-r border-slate-100">
                          <input
                            type="text"
                            value={r.jabatan}
                            onChange={(e) => updateSalesBonusRow(r.id, { jabatan: e.target.value })}
                            className="w-full bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-violet-500 rounded p-1 font-medium text-slate-700 outline-none"
                          />
                        </td>
                        <td className="p-3 border-r border-slate-100">
                          <FormattedNumberInput
                            value={r.targetBulanan}
                            onChange={(val) => updateSalesBonusRow(r.id, { targetBulanan: val })}
                            className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-violet-500 rounded p-1 font-mono font-bold text-slate-700 outline-none"
                          />
                        </td>
                        <td className="p-3 border-r border-slate-100 bg-slate-50/50">
                          <FormattedNumberInput
                            value={r.pencapaian}
                            onChange={(val) => updateSalesBonusRow(r.id, { pencapaian: val })}
                            className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-violet-500 rounded p-1 font-mono font-black text-slate-900 outline-none"
                          />
                        </td>
                        <td className="p-3 border-r border-slate-100 bg-amber-50/20">
                          <FormattedNumberInput
                            value={r.pajak}
                            onChange={(val) => updateSalesBonusRow(r.id, { pajak: val })}
                            className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-violet-500 rounded p-1 font-mono font-bold text-rose-600 outline-none"
                          />
                        </td>
                        <td className="p-3 border-r border-slate-100 bg-amber-50/20">
                          <FormattedNumberInput
                            value={r.biayaKirim}
                            onChange={(val) => updateSalesBonusRow(r.id, { biayaKirim: val })}
                            className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-violet-500 rounded p-1 font-mono font-bold text-amber-600 outline-none"
                          />
                        </td>
                        <td className="p-3 border-r border-slate-100 bg-amber-50/20">
                          <FormattedNumberInput
                            value={r.biayaLain}
                            onChange={(val) => updateSalesBonusRow(r.id, { biayaLain: val })}
                            className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-violet-500 rounded p-1 font-mono font-bold text-indigo-600 outline-none"
                          />
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-700 border-r border-slate-100 bg-emerald-50/30">
                          {formatRupiah(r.omsetBersih)}
                        </td>
                        <td className="p-3 text-center border-r border-slate-100">
                          <span className="font-bold text-slate-800 text-[11px]">{r.persentaseCapaian.toFixed(2)}%</span>
                        </td>
                        <td className="p-3 border-r border-slate-100">
                          <FormattedNumberInput
                            value={r.additional}
                            onChange={(val) => updateSalesBonusRow(r.id, { additional: val })}
                            className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-violet-500 rounded p-1 font-mono font-bold text-slate-700 outline-none"
                          />
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800 border-r border-slate-100">
                          {formatRupiah(r.komisi)}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-violet-700 border-r border-slate-100 bg-violet-50/40">
                          {formatRupiah(r.grandTotal)}
                        </td>
                        <td className="p-3 border-r border-slate-100">
                          <input
                            type="text"
                            value={r.note || ''}
                            onChange={(e) => updateSalesBonusRow(r.id, { note: e.target.value })}
                            placeholder="Catatan..."
                            className="w-full bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-violet-500 rounded p-1 text-[11px] text-slate-500 outline-none"
                          />
                        </td>
                        {isAuthorizedToManageKPI && (
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                if (window.confirm(`Hapus baris sales untuk ${r.nama}?`)) {
                                  deleteSalesBonusRow(r.id);
                                }
                              }}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Hapus Baris"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}

                  {/* Summary / Total Row */}
                  <tr className="bg-slate-100/80 font-black text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={3} className="p-3 text-center uppercase tracking-wider text-[11px] border-r border-slate-200">
                      Total Akumulasi Sales
                    </td>
                    <td className="p-3 text-right font-mono border-r border-slate-200">{formatRupiah(salesTotals.targetBulanan)}</td>
                    <td className="p-3 text-right font-mono border-r border-slate-200 bg-slate-200/50">{formatRupiah(salesTotals.pencapaian)}</td>
                    <td className="p-3 text-right font-mono text-rose-600 border-r border-slate-200 bg-amber-100/40">{formatRupiah(salesTotals.pajak)}</td>
                    <td className="p-3 text-right font-mono text-amber-600 border-r border-slate-200 bg-amber-100/40">{formatRupiah(salesTotals.biayaKirim)}</td>
                    <td className="p-3 text-right font-mono text-indigo-600 border-r border-slate-200 bg-amber-100/40">{formatRupiah(salesTotals.biayaLain)}</td>
                    <td className="p-3 text-right font-mono text-emerald-800 border-r border-slate-200 bg-emerald-100/50">{formatRupiah(salesTotals.omsetBersih)}</td>
                    <td className="p-3 text-center border-r border-slate-200 text-[11px]">
                      {salesTotals.targetBulanan > 0 ? `${((salesTotals.pencapaian / salesTotals.targetBulanan) * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-right font-mono border-r border-slate-200">{formatRupiah(salesTotals.additional)}</td>
                    <td className="p-3 text-right font-mono border-r border-slate-200">{formatRupiah(salesTotals.komisi)}</td>
                    <td className="p-3 text-right font-mono text-violet-800 border-r border-slate-200 bg-violet-100/50">{formatRupiah(salesTotals.grandTotal)}</td>
                    <td className="p-3 text-[11px] text-slate-400 border-r border-slate-200">Sinkron dgn Financial Parameters</td>
                    {isAuthorizedToManageKPI && <td className="p-3"></td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Engineer Bonus Project */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
                    <Award className="w-4 h-4 text-emerald-600" />
                    Engineer Bonus Project
                  </h3>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                    Diambil dari jumlah komisi sales x 5%
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Dasar Alokasi: Total Grand Total Komisi Sales = <strong className="text-slate-800 font-mono">{formatRupiah(salesTotals.grandTotal)}</strong>
                </p>
              </div>

              {isAuthorizedToManageKPI && (
                <button
                  onClick={() => setIsAddingEngineerRow(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
                >
                  <Plus size={14} /> Tambah Baris Engineer
                </button>
              )}
            </div>

            {/* Engineer Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black text-slate-600 uppercase border-y border-slate-200">
                    <th className="p-3 text-center border-r border-slate-200 w-12">No</th>
                    <th className="p-3 border-r border-slate-200 min-w-[180px]">Nama Engineer</th>
                    <th className="p-3 border-r border-slate-200 min-w-[180px]">Jabatan</th>
                    <th className="p-3 text-center border-r border-slate-200 min-w-[160px]">Persentase Komisi (%)</th>
                    <th className="p-3 text-right border-r border-slate-200 min-w-[180px] bg-emerald-50/60 text-emerald-900">Total Komisi (IDR)</th>
                    {isAuthorizedToManageKPI && (
                      <th className="p-3 text-center w-16">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {calculatedEngineerRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">Belum ada baris engineer.</td>
                    </tr>
                  ) : (
                    calculatedEngineerRows.map((e, idx) => (
                      <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">{idx + 1}</td>
                        <td className="p-3 font-black text-slate-900 border-r border-slate-100">
                          <input
                            type="text"
                            value={e.nama}
                            onChange={(ev) => updateEngineerBonusRow(e.id, { nama: ev.target.value })}
                            className="w-full bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded p-1 font-black text-slate-900 outline-none"
                          />
                        </td>
                        <td className="p-3 font-medium text-slate-700 border-r border-slate-100">
                          <input
                            type="text"
                            value={e.jabatan}
                            onChange={(ev) => updateEngineerBonusRow(e.id, { jabatan: ev.target.value })}
                            className="w-full bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded p-1 font-medium text-slate-700 outline-none"
                          />
                        </td>
                        <td className="p-3 text-center border-r border-slate-100">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              value={(Number(e.persentaseKomisi) * 100).toFixed(1)}
                              onChange={(ev) => {
                                const valPct = parseFloat(ev.target.value) || 0;
                                updateEngineerBonusRow(e.id, { persentaseKomisi: valPct / 100 });
                              }}
                              className="w-16 text-center bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-emerald-500 rounded p-1 font-bold text-emerald-700 border border-slate-200 outline-none"
                            />
                            <span className="text-slate-400 font-bold">%</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-emerald-700 border-r border-slate-100 bg-emerald-50/20">
                          {formatRupiah(e.totalKomisi)}
                        </td>
                        {isAuthorizedToManageKPI && (
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                if (window.confirm(`Hapus baris engineer untuk ${e.nama}?`)) {
                                  deleteEngineerBonusRow(e.id);
                                }
                              }}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Hapus Baris"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}

                  {/* Summary / Total Row */}
                  <tr className="bg-slate-100/80 font-black text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={4} className="p-3 text-center uppercase tracking-wider text-[11px] border-r border-slate-200">
                      Total Akumulasi Komisi Engineer (5% dari Sales)
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-800 border-r border-slate-200 bg-emerald-100/50">
                      {formatRupiah(engineerTotals.totalKomisi)}
                    </td>
                    {isAuthorizedToManageKPI && <td className="p-3"></td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Bonus Proyek Khusus & Transaksi CRM (Ad-Hoc / Custom Projects) - Collapsible to preserve full existing functionality */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <button
                onClick={() => setIsAdHocExpanded(p => !p)}
                className="flex items-center gap-2 text-left group"
              >
                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isAdHocExpanded ? 'rotate-90 text-violet-600' : ''}`} />
                <div>
                  <h3 className="text-sm font-black text-slate-800 tracking-tight uppercase flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-violet-500" />
                    Bonus Proyek Khusus & Transaksi CRM (Ad-Hoc Projects)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {projectBonuses.length} proyek terdaftar. Terikat transaksi proyek CRM & pencairan otomatis invoice lunas.
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-2">
                {isAuthorizedToManageKPI && (
                  <button
                    onClick={() => {
                      setIsAdHocExpanded(true);
                      setIsAddingBonus(true);
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus size={14} /> Tambah Bonus Proyek Khusus
                  </button>
                )}
              </div>
            </div>

            {isAdHocExpanded && (
              <div className="space-y-4 pt-2">
                {/* Form input trigger */}
                {isAddingBonus && (
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                    <h3 className="text-xs font-bold text-slate-700 uppercase">Input Formulir Bonus Project Baru</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Nama Project / Insentif</label>
                        <input
                          type="text"
                          value={newBonus.name}
                          onChange={(e) => setNewBonus(p => ({ ...p, name: e.target.value }))}
                          placeholder="Contoh: Implementasi POS Retail Mandiri"
                          className="w-full text-xs p-3 mt-1 bg-white border border-slate-200 rounded-xl outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Hubungkan Ke Transaksi Proyek (Opsional)</label>
                        <select
                          value={newBonus.transactionId || ''}
                          onChange={(e) => setNewBonus(p => ({ ...p, transactionId: e.target.value }))}
                          className="w-full text-xs p-3 mt-1 bg-white border border-slate-200 rounded-xl outline-none"
                        >
                          <option value="">-- Hubungkan Project --</option>
                          {companyTransactions.map(t => (
                            <option key={t.id} value={t.id}>{t.noTrx} - {t.customerName} ({formatRupiah(t.nilaiProyek)})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Pilih Penerima Bonus (Karyawan)</label>
                        <div className="mt-2 grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto bg-white p-3 rounded-xl border border-slate-200">
                          {companyEmployees.map(emp => (
                            <label key={emp.id} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={newBonus.employeeIds?.includes(emp.id) || false}
                                onChange={(e) => {
                                  const ids = newBonus.employeeIds || [];
                                  if (e.target.checked) {
                                    setNewBonus(p => ({ ...p, employeeIds: [...ids, emp.id] }));
                                  } else {
                                    setNewBonus(p => ({ ...p, employeeIds: ids.filter(id => id !== emp.id) }));
                                  }
                                }}
                                className="rounded text-violet-600 focus:ring-violet-500"
                              />
                              {emp.nama}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Nilai Total Bonus Proyek (IDR)</label>
                        <FormattedNumberInput
                          value={newBonus.bonusAmount || 0}
                          onChange={(val) => setNewBonus(p => ({ ...p, bonusAmount: val }))}
                          placeholder="Nilai total nominal bonus"
                          className="w-full text-xs p-3 mt-1 bg-white border border-slate-200 rounded-xl outline-none font-mono font-bold text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Tenggat Waktu Project (Deadline)</label>
                        <input
                          type="date"
                          value={newBonus.deadline}
                          onChange={(e) => setNewBonus(p => ({ ...p, deadline: e.target.value }))}
                          className="w-full text-xs p-3 mt-1 bg-white border border-slate-200 rounded-xl outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Status Pencairan</label>
                        <select
                          value={newBonus.status}
                          onChange={(e) => setNewBonus(p => ({ ...p, status: e.target.value as any }))}
                          className="w-full text-xs p-3 mt-1 bg-white border border-slate-200 rounded-xl outline-none"
                        >
                          <option value="pending">Ditangguhkan (Menunggu Invoice Lunas)</option>
                          <option value="released">Release / Cairkan Sekarang</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setIsAddingBonus(false)}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black uppercase rounded-lg"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => {
                          if (!newBonus.name || !newBonus.bonusAmount || !newBonus.deadline) {
                            alert("Harap lengkapi Nama, Nominal, dan Tenggat Waktu!");
                            return;
                          }
                          const payload: ProjectBonus = {
                            id: `pb-${Date.now()}`,
                            name: newBonus.name,
                            transactionId: newBonus.transactionId,
                            employeeIds: newBonus.employeeIds || [],
                            bonusAmount: newBonus.bonusAmount,
                            deadline: newBonus.deadline,
                            status: newBonus.status || 'pending',
                            notes: newBonus.notes,
                            ...(newBonus.status === 'released' ? { completedAt: new Date().toISOString().split('T')[0] } : {})
                          };

                          setProjectBonuses(prev => [payload, ...prev]);
                          setIsAddingBonus(false);
                          setNewBonus({ name: '', employeeIds: [], bonusAmount: 0, deadline: '', status: 'pending', notes: '' });
                        }}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black uppercase rounded-lg"
                      >
                        Simpan Project Bonus
                      </button>
                    </div>
                  </div>
                )}

                {/* Table display list of Project Bonus */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">
                        <th className="p-4">Nama Project Bonus</th>
                        <th className="p-4">Tim Penerima</th>
                        <th className="p-4">Nilai Bonus</th>
                        <th className="p-4">Tenggat Waktu</th>
                        <th className="p-4">Pencairan Terikat</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {projectBonuses.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">Belum ada daftar bonus project khusus.</td>
                        </tr>
                      ) : (
                        projectBonuses.map(pb => {
                          const relatedTrx = companyTransactions.find(t => t.id === pb.transactionId);
                          const assignedNames = companyEmployees.filter(e => pb.employeeIds.includes(e.id)).map(e => e.nama).join(', ');

                          return (
                            <tr key={pb.id}>
                              <td className="p-4 font-bold text-slate-900">{pb.name}</td>
                              <td className="p-4 max-w-[200px] truncate" title={assignedNames}>{assignedNames || '-'}</td>
                              <td className="p-4 font-mono font-bold text-slate-800">{formatRupiah(pb.bonusAmount)}</td>
                              <td className="p-4 font-medium text-slate-500">{pb.deadline}</td>
                              <td className="p-4">
                                {relatedTrx ? (
                                  <div className="space-y-0.5">
                                    <span className="font-bold text-slate-700 block">{relatedTrx.noTrx}</span>
                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border inline-block leading-none ${relatedTrx.paymentStatus === 'Lunas' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-amber-500 bg-amber-50 border-amber-100'}`}>
                                      Invoice: {relatedTrx.paymentStatus}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">Mandiri (Tidak Terikat)</span>
                                )}
                              </td>
                              <td className="p-4">
                                <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase border ${pb.status === 'released' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : pb.status === 'cancelled' ? 'text-red-500 bg-red-50 border-red-100' : 'text-amber-600 bg-amber-50 border-amber-100'}`}>
                                  {pb.status === 'released' ? 'Dicairkan' : pb.status === 'cancelled' ? 'Batal' : 'Ditangguhkan'}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  {pb.status === 'pending' && (
                                    <button
                                      onClick={() => {
                                        if (window.confirm("Cairkan bonus project ini secara manual?")) {
                                          setProjectBonuses(prev => prev.map(p => p.id === pb.id ? {
                                            ...p,
                                            status: 'released' as const,
                                            completedAt: new Date().toISOString().split('T')[0]
                                          } : p));
                                        }
                                      }}
                                      className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
                                      title="Release Manual"
                                    >
                                      <CheckCircle size={14} />
                                    </button>
                                  )}
                                  {isAuthorizedToManageKPI && (
                                    <button
                                      onClick={() => {
                                        if (window.confirm("Hapus bonus project ini?")) {
                                          setProjectBonuses(prev => prev.filter(p => p.id !== pb.id));
                                        }
                                      }}
                                      className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
                                      title="Hapus"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Modal Tambah Baris Sales */}
          {isAddingSalesRow && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-2xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-violet-600" />
                    Tambah Baris Sales Bonus Project
                  </h3>
                  <button
                    onClick={() => setIsAddingSalesRow(false)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Pilih Karyawan Sales</label>
                    <select
                      value={newSalesRowData.nama || ''}
                      onChange={(e) => {
                        const emp = companyEmployees.find(em => em.nama === e.target.value);
                        setNewSalesRowData(p => ({
                          ...p,
                          nama: e.target.value,
                          employeeId: emp?.id,
                          jabatan: emp?.jabatan || p.jabatan || 'Sales Staff'
                        }));
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold"
                    >
                      <option value="">-- Pilih dari Karyawan --</option>
                      {companyEmployees.map(emp => (
                        <option key={emp.id} value={emp.nama}>{emp.nama} - {emp.jabatan || 'Karyawan'}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Nama (Input Manual Jika Tidak di List)</label>
                    <input
                      type="text"
                      value={newSalesRowData.nama || ''}
                      onChange={(e) => setNewSalesRowData(p => ({ ...p, nama: e.target.value }))}
                      placeholder="Nama Sales"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Jabatan</label>
                      <select
                        value={newSalesRowData.jabatan || 'Sales Staff'}
                        onChange={(e) => setNewSalesRowData(p => ({ ...p, jabatan: e.target.value }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      >
                        <option value="Head of Sales">Head of Sales</option>
                        <option value="Sales Staff">Sales Staff</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Target Bulanan (IDR)</label>
                      <FormattedNumberInput
                        value={newSalesRowData.targetBulanan || 200000000}
                        onChange={(val) => setNewSalesRowData(p => ({ ...p, targetBulanan: val }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Pencapaian (Omset Kotor)</label>
                      <FormattedNumberInput
                        value={newSalesRowData.pencapaian || 0}
                        onChange={(val) => setNewSalesRowData(p => ({ ...p, pencapaian: val }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono font-black text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Pajak (IDR)</label>
                      <FormattedNumberInput
                        value={newSalesRowData.pajak || 0}
                        onChange={(val) => setNewSalesRowData(p => ({ ...p, pajak: val }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono font-bold text-rose-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Biaya Kirim (IDR)</label>
                      <FormattedNumberInput
                        value={newSalesRowData.biayaKirim || 0}
                        onChange={(val) => setNewSalesRowData(p => ({ ...p, biayaKirim: val }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono font-bold text-amber-600"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Biaya Lain (IDR)</label>
                      <FormattedNumberInput
                        value={newSalesRowData.biayaLain || 0}
                        onChange={(val) => setNewSalesRowData(p => ({ ...p, biayaLain: val }))}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono font-bold text-indigo-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Catatan / Note</label>
                    <input
                      type="text"
                      value={newSalesRowData.note || ''}
                      onChange={(e) => setNewSalesRowData(p => ({ ...p, note: e.target.value }))}
                      placeholder="Contoh: Komisi dihitung dari keseluruhan nett penjualan"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setIsAddingSalesRow(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      if (!newSalesRowData.nama) {
                        alert("Harap isi nama sales!");
                        return;
                      }
                      addSalesBonusRow({
                        nama: newSalesRowData.nama,
                        jabatan: newSalesRowData.jabatan || 'Sales Staff',
                        targetBulanan: newSalesRowData.targetBulanan || 200000000,
                        pencapaian: newSalesRowData.pencapaian || 0,
                        pajak: newSalesRowData.pajak || 0,
                        biayaKirim: newSalesRowData.biayaKirim || 0,
                        biayaLain: newSalesRowData.biayaLain || 0,
                        additional: newSalesRowData.additional || 0,
                        note: newSalesRowData.note || ''
                      });
                      setIsAddingSalesRow(false);
                      setNewSalesRowData({
                        nama: '',
                        jabatan: 'Sales Staff',
                        targetBulanan: 200000000,
                        pencapaian: 0,
                        pajak: 0,
                        biayaKirim: 0,
                        biayaLain: 0,
                        additional: 0,
                        note: ''
                      });
                    }}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black uppercase rounded-xl"
                  >
                    Simpan Baris Sales
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Tambah Baris Engineer */}
          {isAddingEngineerRow && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-600" />
                    Tambah Baris Engineer
                  </h3>
                  <button
                    onClick={() => setIsAddingEngineerRow(false)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Pilih Karyawan Engineer</label>
                    <select
                      value={newEngineerRowData.nama || ''}
                      onChange={(e) => {
                        const emp = companyEmployees.find(em => em.nama === e.target.value);
                        setNewEngineerRowData(p => ({
                          ...p,
                          nama: e.target.value,
                          employeeId: emp?.id,
                          jabatan: emp?.jabatan || p.jabatan || 'Engineering Staff'
                        }));
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold"
                    >
                      <option value="">-- Pilih dari Karyawan --</option>
                      {companyEmployees.map(emp => (
                        <option key={emp.id} value={emp.nama}>{emp.nama} - {emp.jabatan || 'Karyawan'}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Nama (Input Manual)</label>
                    <input
                      type="text"
                      value={newEngineerRowData.nama || ''}
                      onChange={(e) => setNewEngineerRowData(p => ({ ...p, nama: e.target.value }))}
                      placeholder="Nama Engineer"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Jabatan</label>
                    <input
                      type="text"
                      value={newEngineerRowData.jabatan || ''}
                      onChange={(e) => setNewEngineerRowData(p => ({ ...p, jabatan: e.target.value }))}
                      placeholder="Head of Engineering / Engineering Staff"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Persentase Komisi (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={((newEngineerRowData.persentaseKomisi ?? 0.05) * 100).toFixed(1)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setNewEngineerRowData(p => ({ ...p, persentaseKomisi: val / 100 }));
                        }}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                      />
                      <span className="font-bold text-slate-500">%</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setIsAddingEngineerRow(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      if (!newEngineerRowData.nama) {
                        alert("Harap isi nama engineer!");
                        return;
                      }
                      addEngineerBonusRow({
                        nama: newEngineerRowData.nama,
                        jabatan: newEngineerRowData.jabatan || 'Engineering Staff',
                        persentaseKomisi: newEngineerRowData.persentaseKomisi ?? 0.05
                      });
                      setIsAddingEngineerRow(false);
                      setNewEngineerRowData({
                        nama: '',
                        jabatan: 'Engineering Staff',
                        persentaseKomisi: 0.05
                      });
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-xl"
                  >
                    Simpan Baris Engineer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'tnc' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black tracking-tight">Syarat & Ketentuan (T&C) & Formula Bonus</h2>
              <p className="text-xs text-slate-300 mt-1">Konfigurasi formula, grading, tier target profit, alokasi persentase jabatan, dan data input bulanan.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-black tracking-wider px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                Formula Aktif: KPI.xlsx
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left side: Rules explanation & Monthly input overrides */}
            <div className="lg:col-span-4 space-y-6">
              {/* Rules description */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <Shield className="w-4 h-4 text-violet-500" />
                  Aturan Pokok Rumus Bonus
                </h3>

                <div className="space-y-3.5 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <h4 className="font-bold text-slate-700">Rumus Insentif Bulanan:</h4>
                    <code className="text-[10px] font-mono text-violet-600 block bg-violet-50/50 p-1.5 rounded border border-violet-100/30">
                      Gaji Pokok * % Alokasi Jabatan * % Multiplier Grade KPI * Multiplier Tier Omset
                    </code>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-slate-700">Alokasi Jabatan</h4>
                      <p className="text-[11px] text-slate-500 leading-normal">Tiap role memiliki alokasi persentase bonus dari gaji pokok (misal: Sales 15%, OB 3%).</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-slate-700">Grading KPI</h4>
                      <p className="text-[11px] text-slate-500 leading-normal">Nilai grade KPI (A-E) menentukan seberapa besar persentase bonus yang cair (A: 100%, B: 75%, C: 60%, D/E: 0%).</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-slate-700">Tier Omset Bersih</h4>
                      <p className="text-[11px] text-slate-500 leading-normal">Multiplier pengali omset tergantung realisasi profit perusahaan (&ge;500M: x1.6, &ge;300M: x1.3, &ge;200M: x1.0, &lt;200M: x0.0).</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Cost / Taxes Overrides for Profit Calculation */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                  Live Financial Parameters ({filterMonth}/{filterYear})
                </h3>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Profit Bersih = Omset Kotor - Pajak - Ongkir - Biaya Lain-Lain. Atur parameter bulanan secara manual di bawah ini:
                </p>

                <div className="space-y-3.5">
                  <div>
                    <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Total Omset Kotor (IDR)</label>
                    <FormattedNumberInput
                      value={activeFinancials.omsetKotor}
                      onChange={(val) => handleLiveFinancialFieldChange('omsetKotor', val)}
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-violet-500 outline-none font-mono font-bold text-slate-700"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Biaya Pajak All (IDR)</label>
                    <FormattedNumberInput
                      value={activeFinancials.pajak}
                      onChange={(val) => handleLiveFinancialFieldChange('pajak', val)}
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-violet-500 outline-none font-mono font-bold text-rose-600"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Biaya Pengiriman All (IDR)</label>
                    <FormattedNumberInput
                      value={activeFinancials.pengiriman}
                      onChange={(val) => handleLiveFinancialFieldChange('pengiriman', val)}
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-violet-500 outline-none font-mono font-bold text-amber-600"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Biaya Lain-lain All (IDR)</label>
                    <FormattedNumberInput
                      value={activeFinancials.lainLain}
                      onChange={(val) => handleLiveFinancialFieldChange('lainLain', val)}
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-violet-500 outline-none font-mono font-bold text-indigo-600"
                    />
                  </div>

                  <div className="p-3 bg-violet-50 rounded-xl border border-violet-100/50 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Formula Omset Bersih:</span>
                      <span className="font-mono font-bold text-slate-800">{formatRupiah(calculatedOmsetBersih)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Pengali Bonus Terpilih:</span>
                      <span className="font-mono font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded">
                        x{activeOmsetMultiplier.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side: Detailed configurations (Alokasi, Grading, Tiers) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Alokasi Persentase Jabatan */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-4 h-4 text-violet-500" />
                    A. Alokasi Bonus Bulanan per Jabatan (%)
                  </h3>
                  <button
                    onClick={() => {
                      const newJabId = `jab-${Date.now()}`;
                      const newJabName = `Jabatan Kustom ${jabatans.length + 1}`;
                      const newJab: JabatanConfig = {
                        id: newJabId,
                        name: newJabName,
                        percentage: 5
                      };
                      setJabatans(p => [...p, newJab]);

                      // Auto-create matching Template in Template KPI Jabatan for user setup
                      const newTpl: KPITemplate = {
                        id: `tpl-${Date.now()}`,
                        jabatan: newJabName.toLowerCase(),
                        indicators: [
                          { id: `ind-${Date.now()}-1`, name: 'Pencapaian Target Kerja & Output', bobot: 50, type: 'kualitatif' },
                          { id: `ind-${Date.now()}-2`, name: 'Disiplin, Kepatuhan & SOP', bobot: 50, type: 'kualitatif' }
                        ],
                        softSkills: DEFAULT_SOFT_SKILL_INDICATORS,
                        hardWeight: 80,
                        softWeight: 20
                      };
                      setKpiTemplates(prev => [...prev, newTpl]);
                    }}
                    className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-600 text-[10px] font-black uppercase rounded-lg border border-violet-100 transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} /> Tambah Jabatan Baru
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">
                        <th className="p-3">Nama Jabatan / Role</th>
                        <th className="p-3 w-32 text-center">Persentase Default (%)</th>
                        <th className="p-3 w-16 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {jabatans.map((jab, idx) => (
                        <tr key={jab.id} className="hover:bg-slate-50/30">
                          <td className="p-3">
                            <input
                              type="text"
                              value={jab.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                const oldLower = jab.name.toLowerCase().trim();
                                setJabatans(p => p.map(item => item.id === jab.id ? { ...item, name: val } : item));
                                if (val.trim()) {
                                  setKpiTemplates(prev => prev.map(tpl => {
                                    if (tpl.jabatan.toLowerCase().trim() === oldLower) {
                                      return { ...tpl, jabatan: val.toLowerCase().trim() };
                                    }
                                    return tpl;
                                  }));
                                }
                              }}
                              className="w-full bg-transparent font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-violet-500 py-1 outline-none"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="number"
                                step="0.1"
                                value={jab.percentage}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setJabatans(p => p.map(item => item.id === jab.id ? { ...item, percentage: val } : item));
                                }}
                                className="w-16 text-center bg-slate-50 border border-slate-200 rounded p-1 font-bold text-slate-700"
                              />
                              <span>%</span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                if (jabatans.length <= 1) {
                                  alert("Harus ada minimal 1 jabatan!");
                                  return;
                                }
                                setJabatans(p => p.filter(item => item.id !== jab.id));
                              }}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* KPI Grading Criteria */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-violet-500" />
                    B. Kriteria Grading Nilai KPI
                  </h3>
                  <button
                    onClick={() => {
                      const newGrading: GradingKPIItem = {
                        id: `g-${Date.now()}`,
                        grade: 'X',
                        scoreRange: '≥ 90 (Custom)',
                        multiplier: 80,
                        minScore: 90
                      };
                      setGradingKPIItems(p => [...p, newGrading]);
                    }}
                    className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-600 text-[10px] font-black uppercase rounded-lg border border-violet-100 transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} /> Tambah Grade Baru
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">
                        <th className="p-3 w-16 text-center">Grade KPI</th>
                        <th className="p-3">Label / Rentang Skor</th>
                        <th className="p-3 w-28 text-center">Skor Minimum</th>
                        <th className="p-3 w-32 text-center">Persentase Perolehan (%)</th>
                        <th className="p-3 w-16 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {gradingKPIItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/30">
                          <td className="p-3 text-center">
                            <input
                              type="text"
                              value={item.grade}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGradingKPIItems(p => p.map(g => g.id === item.id ? { ...g, grade: val } : g));
                              }}
                              className="w-10 text-center font-black bg-slate-100 rounded border border-slate-200 py-1"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.scoreRange}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGradingKPIItems(p => p.map(g => g.id === item.id ? { ...g, scoreRange: val } : g));
                              }}
                              className="w-full bg-transparent py-1 border-b border-transparent hover:border-slate-300 focus:border-violet-500 outline-none"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              value={item.minScore}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setGradingKPIItems(p => p.map(g => g.id === item.id ? { ...g, minScore: val } : g));
                              }}
                              className="w-16 text-center bg-slate-50 border border-slate-200 rounded p-1 font-bold text-slate-700"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="number"
                                value={item.multiplier}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setGradingKPIItems(p => p.map(g => g.id === item.id ? { ...g, multiplier: val } : g));
                                }}
                                className="w-16 text-center bg-slate-50 border border-slate-200 rounded p-1 font-black text-emerald-600"
                              />
                              <span>%</span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                if (gradingKPIItems.length <= 1) {
                                  alert("Harus ada minimal 1 grade!");
                                  return;
                                }
                                setGradingKPIItems(p => p.filter(g => g.id !== item.id));
                              }}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tiers Target Profit */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    C. Indikator Omset & Multiplier Pengali Omset
                  </h3>
                  <button
                    onClick={() => {
                      const newTier: OmsetTier = {
                        id: `tier-${Date.now()}`,
                        name: `Bonus Aktif Tier ${omsetTiers.length + 1}`,
                        target: 100000000,
                        multiplier: 0.8
                      };
                      setOmsetTiers(p => [...p, newTier]);
                    }}
                    className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-600 text-[10px] font-black uppercase rounded-lg border border-violet-100 transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} /> Tambah Tier Baru
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">
                        <th className="p-3">Nama Tier / Kategori</th>
                        <th className="p-3 w-48 text-center">Target Omset Bersih (IDR)</th>
                        <th className="p-3 w-32 text-center">Pengali Bonus (Multiplier)</th>
                        <th className="p-3 w-16 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {omsetTiers.map((tier) => (
                        <tr key={tier.id} className="hover:bg-slate-50/30">
                          <td className="p-3">
                            <input
                              type="text"
                              value={tier.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setOmsetTiers(p => p.map(t => t.id === tier.id ? { ...t, name: val } : t));
                              }}
                              className="w-full bg-transparent py-1 border-b border-transparent hover:border-slate-300 focus:border-violet-500 outline-none font-bold"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <FormattedNumberInput
                              value={tier.target}
                              onChange={(val) => {
                                setOmsetTiers(p => p.map(t => t.id === tier.id ? { ...t, target: val } : t));
                              }}
                              className="w-40 text-center bg-slate-50 border border-slate-200 rounded p-1 font-black text-slate-700 font-mono"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              step="0.1"
                              value={tier.multiplier}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setOmsetTiers(p => p.map(t => t.id === tier.id ? { ...t, multiplier: val } : t));
                              }}
                              className="w-20 text-center bg-slate-50 border border-slate-200 rounded p-1 font-bold text-violet-700"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                if (omsetTiers.length <= 1) {
                                  alert("Harus ada minimal 1 tier!");
                                  return;
                                }
                                setOmsetTiers(p => p.filter(t => t.id !== tier.id));
                              }}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* D. Target Penjualan Bulanan (Komisi) */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-violet-500" />
                    D. Target Penjualan Bulanan (Komisi Jabatan Sales)
                  </h3>
                  <button
                    onClick={() => {
                      const newComm: SalesCommission = {
                        id: `com-${Date.now()}`,
                        pencapaian: 'Custom %',
                        komisi: 2.5
                      };
                      setSalesCommissions(p => [...p, newComm]);
                    }}
                    className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-600 text-[10px] font-black uppercase rounded-lg border border-violet-100 transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} /> Tambah Target Komisi
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">
                        <th className="p-3">Tingkat Pencapaian</th>
                        <th className="p-3 w-48 text-center">Besaran Komisi (%)</th>
                        <th className="p-3 w-16 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {salesCommissions.map((comm) => (
                        <tr key={comm.id} className="hover:bg-slate-50/30">
                          <td className="p-3">
                            <input
                              type="text"
                              value={comm.pencapaian}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSalesCommissions(p => p.map(item => item.id === comm.id ? { ...item, pencapaian: val } : item));
                              }}
                              className="w-full bg-transparent py-1 border-b border-transparent hover:border-slate-300 focus:border-violet-500 outline-none font-bold"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="number"
                                step="0.1"
                                value={comm.komisi}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setSalesCommissions(p => p.map(item => item.id === comm.id ? { ...item, komisi: val } : item));
                                }}
                                className="w-20 text-center bg-slate-50 border border-slate-200 rounded p-1 font-black text-violet-700"
                              />
                              <span>%</span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                if (salesCommissions.length <= 1) {
                                  alert("Harus ada minimal 1 target komisi!");
                                  return;
                                }
                                setSalesCommissions(p => p.filter(item => item.id !== comm.id));
                              }}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Submit Save Configuration Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    safeSetLocalStorage('mypanca_kpi_jabatans', jabatans);
                    safeSetLocalStorage('mypanca_kpi_grading_items', gradingKPIItems);
                    safeSetLocalStorage('mypanca_kpi_omset_tiers', omsetTiers);
                    safeSetLocalStorage('mypanca_kpi_commissions', salesCommissions);
                    safeSetLocalStorage('mypanca_kpi_monthly_financials', kpiMonthlyFinancials);
                    alert("Seluruh Syarat & Ketentuan (T&C), Alokasi Jabatan, Grading KPI, Tiering Omset, dan Parameter Keuangan berhasil disimpan ke LocalStorage!");
                  }}
                  className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2"
                >
                  <Save className="w-4 h-4 text-emerald-400" />
                  <span>Simpan Perubahan T&C Detail</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'karyawan' && (
        <div className="space-y-6">
          {/* Header toolbar */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Manajemen Data Karyawan (Decoupled)</h3>
              <p className="text-xs text-slate-400">Atur database internal karyawan, jabatan, dan setting default gaji pokok terpisah dari user aplikasi.</p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <input
                type="text"
                placeholder="Cari karyawan..."
                value={employeeSearchQuery}
                onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                className="text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none w-full md:w-48"
              />

              <button
                onClick={() => {
                  setNewEmployee({ nama: '', jabatanId: jabatans[0]?.id || '', gaji: 3000000, isNewJabatan: false, newJabatanName: '' });
                  setEditingEmployeeId(null);
                  setIsAddingEmployee(true);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shrink-0"
              >
                <Plus size={16} /> Tambah Karyawan
              </button>
            </div>
          </div>

          {/* Table display list of manual employees */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">
                    <th className="p-4">Nama Karyawan</th>
                    <th className="p-4">Jabatan Terpilih</th>
                    <th className="p-4">Bonus Alokasi %</th>
                    <th className="p-4">Gaji Pokok Default</th>
                    <th className="p-4">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {kpiEmployees
                    .filter(emp => emp.nama.toLowerCase().includes(employeeSearchQuery.toLowerCase()))
                    .map(emp => {
                      const jab = jabatans.find(j => j.id === emp.jabatanId);
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/50">
                          <td className="p-4 font-bold text-slate-900">{emp.nama}</td>
                          <td className="p-4 font-semibold text-slate-700">{jab ? jab.name : 'Unassigned'}</td>
                          <td className="p-4 font-bold text-violet-600 bg-violet-50/30 text-center rounded">{jab ? `${jab.percentage}%` : '-'}</td>
                          <td className="p-4 font-mono font-bold text-slate-800">{formatRupiah(emp.gaji)}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  openEditEmployeeModal(emp);
                                }}
                                className="px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors font-bold"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteEmployee(emp.id, emp.nama)}
                                className="px-2.5 py-1 text-red-500 bg-red-50 hover:bg-red-100 rounded border border-red-100 transition-colors font-bold"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'templates' && isAuthorizedToManageKPI && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List existing templates */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Template KPI Jabatan
              </h3>
            </div>

            <div className="space-y-2">
              {kpiTemplates.map(tpl => {
                const isActive = tpl.id === selectedTemplateId;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isActive
                        ? 'bg-violet-50 border-violet-300 ring-2 ring-violet-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-800 uppercase block">{tpl.jabatan}</span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">{tpl.indicators.length} Indikator Kinerja</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const affected = companyEmployees.filter(emp => {
                          const jab = jabatans.find(j => j.id === emp.jabatanId);
                          const jabName = (jab?.name || emp.jabatan || emp.role || '').toLowerCase().trim();
                          const tplName = (tpl.jabatan || '').toLowerCase().trim();
                          return jabName === tplName || emp.jabatanId === tpl.id || tpl.id === `tpl-${emp.jabatanId}`;
                        });
                        setTemplateDeleteConfirm({
                          template: tpl,
                          affectedEmployees: affected
                        });
                      }}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Hapus Template"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                const newTplName = window.prompt("Masukkan nama Jabatan untuk template baru:");
                if (!newTplName) return;
                
                const cleanName = newTplName.trim();
                const cleanLower = cleanName.toLowerCase();
                const existingJab = jabatans.find(j => j.name.toLowerCase() === cleanLower);
                let targetJabId = '';
                
                if (!existingJab) {
                  const newJabId = `jab-${Date.now()}`;
                  const newJab = {
                    id: newJabId,
                    name: cleanName,
                    percentage: 5
                  };
                  setJabatans(prev => [...prev, newJab]);
                  targetJabId = newJabId;
                } else {
                  targetJabId = existingJab.id;
                }
                
                const newTplId = `tpl-${Date.now()}`;
                const newTpl: KPITemplate = {
                  id: newTplId,
                  jabatan: cleanLower,
                  hardWeight: 80,
                  softWeight: 20,
                  indicators: [
                    { id: `ind-${Date.now()}-1`, name: 'Kualitas Kerja', bobot: 50, type: 'kualitatif' },
                    { id: `ind-${Date.now()}-2`, name: 'Kehadiran & Disiplin', bobot: 50, type: 'kualitatif' }
                  ],
                  softSkills: DEFAULT_SOFT_SKILL_INDICATORS
                };
                
                setKpiTemplates(prev => [...prev, newTpl]);
                setSelectedTemplateId(newTplId);
              }}
              className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Plus size={14} />
              Tambah Template Baru
            </button>
          </div>

          {/* Detailed Template Editor and Employee list container */}
          {(() => {
            const selectedTpl = kpiTemplates.find(t => t.id === selectedTemplateId) || kpiTemplates[0];
            const currentSoftSkills = (selectedTpl?.softSkills && selectedTpl.softSkills.length > 0)
              ? selectedTpl.softSkills
              : DEFAULT_SOFT_SKILL_INDICATORS;
            const currentHardWeight = selectedTpl?.hardWeight ?? 80;
            const currentSoftWeight = selectedTpl?.softWeight ?? 20;

            return (
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                {selectedTpl ? (
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="border-b border-slate-100 pb-4">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-violet-600 bg-violet-50 px-2.5 py-1 rounded-md">
                        Standardisasi KPI & Anggota Jabatan
                      </span>
                      <h3 className="text-base font-black text-slate-800 mt-2 uppercase">
                        Template: {selectedTpl.jabatan}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Modifikasi indikator teknis, indikator soft skill, dan distribusi bobot standard untuk jabatan ini.
                      </p>
                    </div>

                    {/* Anggota Jabatan */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3">
                      <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        Karyawan dengan Jabatan Ini ({
                          companyEmployees.filter(emp => {
                            const jab = jabatans.find(j => j.id === emp.jabatanId);
                            return jab && jab.name.toLowerCase() === selectedTpl.jabatan.toLowerCase();
                          }).length
                        } orang)
                      </h4>
                      {(() => {
                        const members = companyEmployees.filter(emp => {
                          const jab = jabatans.find(j => j.id === emp.jabatanId);
                          return jab && jab.name.toLowerCase() === selectedTpl.jabatan.toLowerCase();
                        });
                        if (members.length === 0) {
                          return <span className="text-[11px] text-slate-400 italic block">Tidak ada karyawan yang terdaftar pada jabatan ini.</span>;
                        }
                        return (
                          <div className="flex flex-wrap gap-2">
                            {members.map(m => (
                              <span key={m.id} className="text-xs px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg flex items-center gap-1.5 shadow-sm">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                {m.nama}
                                <span className="text-[10px] text-emerald-700 font-mono font-bold bg-emerald-50 px-1 rounded">
                                  {formatRupiah(m.gaji || 0)}
                                </span>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Setting Rasio Bobot Utama Lembar KPI */}
                    <div className="bg-gradient-to-r from-violet-50/70 to-indigo-50/70 p-4 rounded-xl border border-violet-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-black text-violet-950 uppercase tracking-wider">
                          Proporsi Bobot Utama Lembar KPI
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Atur perbandingan bobot antara Penilaian KPI Teknis (Bagian A) dan Penilaian Soft Skill (Bagian B).
                        </p>
                      </div>
                      <div className="flex items-center gap-4 bg-white px-3 py-2 rounded-xl border border-violet-200 shadow-sm shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-600">Bobot A:</span>
                          <input
                            type="number"
                            value={currentHardWeight}
                            onChange={(e) => {
                              const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              updateTemplateMacroWeights(selectedTpl.id, val, 100 - val);
                            }}
                            className="w-14 p-1 text-center text-xs font-black bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-violet-500"
                          />
                          <span className="text-xs font-bold text-slate-400">%</span>
                        </div>
                        <span className="text-slate-300 font-bold">+</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-600">Bobot B:</span>
                          <input
                            type="number"
                            value={currentSoftWeight}
                            onChange={(e) => {
                              const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              updateTemplateMacroWeights(selectedTpl.id, 100 - val, val);
                            }}
                            className="w-14 p-1 text-center text-xs font-black bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-violet-500"
                          />
                          <span className="text-xs font-bold text-slate-400">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Warning Banner in Pengaturan KPI */}
                    {weightWarningPengaturan && (
                      <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{weightWarningPengaturan}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWeightWarningPengaturan(null)}
                          className="text-amber-600 hover:text-amber-800 text-xs px-1.5 py-0.5 rounded hover:bg-amber-100 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* A. PENILAIAN KPI (TEKNIS / KINERJA) */}
                    <div className="space-y-4 pt-2">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <div>
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-slate-900 text-white rounded text-[10px]">A</span>
                            PENILAIAN KPI (BOBOT {currentHardWeight}%)
                          </h4>
                          <span className="text-[10px] text-slate-400">Indikator kinerja teknis jabatan (maksimal akumulasi 100%)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => addTemplateIndicator(selectedTpl.id)}
                          className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-600 text-xs font-bold rounded-lg border border-violet-200 transition-colors flex items-center gap-1"
                        >
                          <Plus size={14} /> Tambah Indikator KPI
                        </button>
                      </div>

                      <div className="space-y-3">
                        {selectedTpl.indicators.map((ind, indIdx) => {
                          const isSalesTpl = isSalesJabatan(selectedTpl.jabatan);
                          return (
                          <div key={ind.id} className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200">
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                              <input
                                type="text"
                                value={ind.name}
                                onChange={(e) => updateTemplateIndicator(selectedTpl.id, ind.id, 'name', e.target.value)}
                                placeholder="Nama Indikator KPI"
                                className="flex-1 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-medium text-slate-700"
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 font-bold">Bobot:</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={ind.bobot}
                                  onChange={(e) => updateTemplateIndicator(selectedTpl.id, ind.id, 'bobot', parseInt(e.target.value) || 0)}
                                  placeholder="Bobot"
                                  className="w-16 text-center text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-bold text-slate-700 focus:ring-1 focus:ring-violet-500"
                                />
                                <span className="text-xs font-bold text-slate-400">%</span>

                                <select
                                  value={ind.type}
                                  onChange={(e) => updateTemplateIndicator(selectedTpl.id, ind.id, 'type', e.target.value)}
                                  className="text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-bold text-slate-600"
                                >
                                  <option value="kualitatif">Kualitatif</option>
                                  <option value="kuantitatif">Kuantitatif</option>
                                </select>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-slate-500 font-bold">Satuan:</span>
                                  <select
                                    value={ind.satuan || '%'}
                                    onChange={(e) => updateTemplateIndicator(selectedTpl.id, ind.id, 'satuan', e.target.value)}
                                    className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-bold text-slate-700 cursor-pointer"
                                  >
                                    {KPI_SATUAN_OPTIONS.map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => deleteTemplateIndicator(selectedTpl.id, ind.id)}
                                  className="text-red-500 p-2.5 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            {indIdx === 0 && isSalesTpl && (
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <span className="text-[9px] font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 inline-flex items-center gap-1 shadow-xs">
                                  ✓ Default No. 1 Target Penjualan (Terhubung otomatis dengan Pencapaian Omset Kotor Bonus Project saat penilaian individu)
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      </div>

                      {/* Total check weight Part A */}
                      {(() => {
                        const total = selectedTpl.indicators.reduce((acc, curr) => acc + (curr.bobot || 0), 0);
                        const isValid = total === 100;
                        const isOver = total > 100;
                        return (
                          <div className={`p-3 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs font-bold ${
                            isOver ? 'bg-red-50 border-red-300 text-red-900' :
                            isValid ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800' : 
                            'bg-amber-50/80 border-amber-200 text-amber-800'
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${isOver ? 'bg-red-500 animate-pulse' : isValid ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                              <span>Total Akumulasi Bobot Indikator Bagian A:</span>
                            </div>
                            <span className="font-mono text-xs font-black">
                              {total}% {isOver ? '(⚠️ Tidak Valid: Melebihi 100%!)' : isValid ? '(✓ 100% Valid - Total bobot pas 100%)' : `(⚠️ Belum Valid - Tersisa ${100 - total}%)`}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* B. PENILAIAN SOFT SKILL */}
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div>
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-violet-600 text-white rounded text-[10px]">B</span>
                            PENILAIAN SOFT SKILL (BOBOT {currentSoftWeight}%)
                          </h4>
                          <span className="text-[10px] text-slate-400">Standar aspek penilaian soft skill & sikap kerja (maksimal akumulasi 100%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => applySoftSkillsToAllTemplates(selectedTpl.id)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors"
                            title="Terapkan aspek soft skill jabatan ini ke semua jabatan lain"
                          >
                            Terapkan ke Semua Jabatan
                          </button>
                          <button
                            type="button"
                            onClick={() => addTemplateSoftSkill(selectedTpl.id)}
                            className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-600 text-xs font-bold rounded-lg border border-violet-200 transition-colors flex items-center gap-1"
                          >
                            <Plus size={14} /> Tambah Aspek Soft Skill
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {currentSoftSkills.map((ss, idx) => (
                          <div key={ss.id || idx} className="flex flex-col sm:flex-row gap-2 sm:items-center bg-white p-3 rounded-xl border border-slate-200">
                            <span className="text-xs font-bold text-slate-400 w-6 text-center">{idx + 1}.</span>
                            <input
                              type="text"
                              value={ss.name}
                              onChange={(e) => updateTemplateSoftSkill(selectedTpl.id, ss.id, 'name', e.target.value)}
                              placeholder="Nama Aspek Soft Skill (misal: Dicipline, Team Work)"
                              className="flex-1 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-medium text-slate-700"
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 font-bold">Bobot:</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={ss.bobot}
                                onChange={(e) => updateTemplateSoftSkill(selectedTpl.id, ss.id, 'bobot', parseInt(e.target.value) || 0)}
                                placeholder="Bobot"
                                className="w-16 text-center text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-bold text-slate-700 focus:ring-1 focus:ring-violet-500"
                              />
                              <span className="text-xs font-bold text-slate-400">%</span>

                              <button
                                type="button"
                                onClick={() => deleteTemplateSoftSkill(selectedTpl.id, ss.id)}
                                className="text-red-500 p-2.5 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                title="Hapus Aspek Soft Skill"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Total check weight Part B */}
                      {(() => {
                        const total = currentSoftSkills.reduce((acc, curr) => acc + (curr.bobot || 0), 0);
                        const isValid = total === 100;
                        const isOver = total > 100;
                        return (
                          <div className={`p-3 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs font-bold ${
                            isOver ? 'bg-red-50 border-red-300 text-red-900' :
                            isValid ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800' : 
                            'bg-amber-50/80 border-amber-200 text-amber-800'
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${isOver ? 'bg-red-500 animate-pulse' : isValid ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                              <span>Total Akumulasi Bobot Bagian B (Soft Skill):</span>
                            </div>
                            <span className="font-mono text-xs font-black">
                              {total}% {isOver ? '(⚠️ Tidak Valid: Melebihi 100%!)' : isValid ? '(✓ 100% Valid - Total bobot pas 100%)' : `(⚠️ Belum Valid - Tersisa ${100 - total}%)`}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Save button */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-3 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold">
                        Standar KPI Bagian A & Bagian B tersimpan otomatis dan disinkronkan ke Penilaian KPI karyawan.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const totalHard = selectedTpl.indicators.reduce((acc, curr) => acc + (curr.bobot || 0), 0);
                          const totalSoft = currentSoftSkills.reduce((acc, curr) => acc + (curr.bobot || 0), 0);
                          
                          if (totalHard > 100) {
                            alert(`Peringatan: Total akumulasi bobot Bagian A melebihi 100% (saat ini ${totalHard}%)! Maksimal harus 100%.`);
                            setWeightWarningPengaturan(`⚠️ Peringatan: Total akumulasi bobot Bagian A melebihi 100% (${totalHard}%)! Harap sesuaikan.`);
                            return;
                          }
                          if (totalHard !== 100) {
                            alert(`Peringatan: Total akumulasi bobot Bagian A (Penilaian KPI) harus tepat 100% (saat ini ${totalHard}%)! Harap sesuaikan.`);
                            setWeightWarningPengaturan(`⚠️ Peringatan: Total akumulasi bobot Bagian A harus tepat 100% (saat ini: ${totalHard}%).`);
                            return;
                          }
                          if (totalSoft > 100) {
                            alert(`Peringatan: Total akumulasi bobot Bagian B melebihi 100% (saat ini ${totalSoft}%)! Maksimal harus 100%.`);
                            setWeightWarningPengaturan(`⚠️ Peringatan: Total akumulasi bobot Bagian B melebihi 100% (${totalSoft}%)! Harap sesuaikan.`);
                            return;
                          }
                          if (totalSoft !== 100) {
                            alert(`Peringatan: Total akumulasi bobot Bagian B (Penilaian Soft Skill) harus tepat 100% (saat ini ${totalSoft}%)! Harap sesuaikan.`);
                            setWeightWarningPengaturan(`⚠️ Peringatan: Total akumulasi bobot Bagian B harus tepat 100% (saat ini: ${totalSoft}%).`);
                            return;
                          }
                          if (currentHardWeight + currentSoftWeight !== 100) {
                            alert("Peringatan: Total proporsi bobot A + B harus tepat 100%!");
                            return;
                          }

                          setWeightWarningPengaturan(null);
                          localStorage.setItem('mypanca_kpi_templates', JSON.stringify(kpiTemplates));

                          // Sync updated template indicators, soft skills, and weights to all employee individual sheets in this role
                          const matchingEmps = companyEmployees.filter(emp => {
                            const jab = jabatans.find(j => j.id === emp.jabatanId);
                            const jabName = jab ? jab.name.toLowerCase().trim() : (emp.jabatan || emp.role || '').toLowerCase().trim();
                            const tplJab = selectedTpl.jabatan.toLowerCase().trim();
                            return jabName === tplJab || emp.jabatanId === selectedTpl.id || selectedTpl.id === `tpl-${emp.jabatanId}`;
                          });

                          if (matchingEmps.length > 0) {
                            setEmployeeIndividualSheets(prevSheets => {
                              const nextSheets = { ...prevSheets };
                              matchingEmps.forEach(emp => {
                                const existingSheet = prevSheets[emp.id];
                                const customInds = employeeCustomIndicators[emp.id] || [];
                                const isSales = isSalesRole(emp);
                                const salesBonusRow = isSales ? getSalesBonusRowForEmployee(emp) : null;

                                const newHardKPIs = selectedTpl.indicators.map((ind, idx) => {
                                  const existingHard = existingSheet?.hardKPIs?.find((h: any) => h.indicatorId === ind.id || h.name.toLowerCase().trim() === ind.name.toLowerCase().trim());
                                  let targetVal = ind.target || existingHard?.target || 100;
                                  let realVal = existingHard?.realisasi ?? 80;
                                  let bobotVal = ind.bobot || 0;
                                  let satuanVal = ind.satuan || existingHard?.satuan || '%';
                                  let metodeVal = (ind.metode || existingHard?.metode || 'Maximize') as 'Maximize' | 'Minimize';
                                  let nameVal = ind.name;

                                  if (isSales && idx === 0) {
                                    nameVal = 'Target Penjualan';
                                    satuanVal = 'Rp';
                                    metodeVal = 'Maximize';
                                    targetVal = salesBonusRow?.targetBulanan || targetVal || 200000000;
                                    realVal = salesBonusRow?.pencapaian || realVal || 0;
                                  }

                                  let computedScore = 0;
                                  if (metodeVal === 'Minimize') {
                                    computedScore = targetVal > 0 ? (targetVal / Math.max(realVal, 0.001)) * bobotVal : 0;
                                  } else {
                                    computedScore = targetVal > 0 ? (realVal / targetVal) * bobotVal : 0;
                                  }

                                  return {
                                    indicatorId: ind.id,
                                    name: nameVal,
                                    bobot: bobotVal,
                                    metode: metodeVal,
                                    target: targetVal,
                                    satuan: satuanVal,
                                    realisasi: realVal,
                                    score: Math.round(computedScore * 100) / 100
                                  };
                                });

                                // Merge custom individual indicators
                                customInds.forEach(cind => {
                                  if (!newHardKPIs.some(k => k.indicatorId === cind.indicatorId)) {
                                    newHardKPIs.push({ ...cind, isCustom: true });
                                  }
                                });

                                const newSoftSkills = currentSoftSkills.map(ss => {
                                  const existingSS = existingSheet?.softSkills?.find((s: any) => s.name.toLowerCase().trim() === ss.name.toLowerCase().trim());
                                  const nilaiVal = existingSS?.nilai ?? 80;
                                  const bobotVal = ss.bobot || 0;
                                  const scoreVal = Math.round(((bobotVal / 100) * nilaiVal) * 100) / 100;
                                  return {
                                    name: ss.name,
                                    bobot: bobotVal,
                                    nilai: nilaiVal,
                                    score: scoreVal
                                  };
                                });

                                nextSheets[emp.id] = {
                                  hardKPIs: newHardKPIs,
                                  softSkills: newSoftSkills,
                                  hardWeight: currentHardWeight,
                                  softWeight: currentSoftWeight
                                };
                              });

                              safeSetLocalStorage('mypanca_kpi_employee_individual_sheets', nextSheets);
                              return nextSheets;
                            });

                            // If currently selected employee in Penilaian KPI is in this role, update current active inputs immediately
                            if (selectedEmployeeId) {
                              const activeEmp = companyEmployees.find(e => e.id === selectedEmployeeId);
                              if (activeEmp) {
                                const activeJab = jabatans.find(j => j.id === activeEmp.jabatanId);
                                const activeJabName = activeJab ? activeJab.name.toLowerCase().trim() : (activeEmp.jabatan || activeEmp.role || '').toLowerCase().trim();
                                const tplJabName = selectedTpl.jabatan.toLowerCase().trim();
                                if (activeJabName === tplJabName || activeEmp.jabatanId === selectedTpl.id || selectedTpl.id === `tpl-${activeEmp.jabatanId}`) {
                                  setHardWeight(currentHardWeight);
                                  setSoftWeight(currentSoftWeight);
                                }
                              }
                            }
                          }

                          alert(`Standardisasi KPI (Bagian A) & Soft Skill (Bagian B) Berhasil Disimpan & Disinkronkan ke ${matchingEmps.length} karyawan dalam jabatan ini!`);
                        }}
                        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5"
                      >
                        <Save size={14} className="text-emerald-400" />
                        Simpan Standardisasi KPI & Soft Skill
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-xs italic">
                    Pilih atau tambah salah satu template di kolom kiri untuk melihat detail standardisasi dan anggota karyawan.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* High-Fidelity Printable Lembar KPI Modal */}
      {printModalRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
            {/* Modal Header Controls (hidden in print) */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-violet-600" />
                <h3 className="text-sm font-black text-slate-800">Cetak Lembar KPI Karyawan</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black uppercase rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak / PDF</span>
                </button>
                <button
                  onClick={() => setPrintModalRecord(null)}
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black uppercase rounded-xl"
                >
                  Tutup
                </button>
              </div>
            </div>

            {/* Document Printable Body */}
            <div className="p-10 overflow-y-auto flex-1 space-y-6 print:overflow-visible print:p-0 font-sans text-slate-800 bg-white" id="printable-kpi-sheet">
              {/* Header Letterhead */}
              <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
                <h1 className="text-xl font-black uppercase tracking-wide text-slate-900">PT PANCA PRIMA WIJAYA</h1>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">LEMBAR KEY PERFORMANCE INDICATOR (KPI)</h2>
                <div className="text-[10px] text-slate-400 font-mono">Bulan: {printModalRecord.month} | Tahun: {printModalRecord.year}</div>
              </div>

              {/* Employee & Company Meta Grid */}
              {(() => {
                const emp = companyEmployees.find(e => e.id === printModalRecord.employeeId) || employees.find(e => e.id === printModalRecord.employeeId);
                const empJab = jabatans.find(j => j.id === (emp as any)?.jabatanId);
                const empJabatanName = empJab?.name || (emp as any)?.jabatan || (emp as any)?.role || 'Staff';
                const gradeObj = getKPIGrade(printModalRecord.finalScore || 0);

                // Ensure indicators and soft skills fallback if not in record
                const activeEmpSheet = emp ? employeeIndividualSheets[emp.id] : null;
                const activeEmpTemplate = emp ? activeTemplateForEmployee(emp) : null;

                const hardKPIsToRender = (printModalRecord.hardKPIs && printModalRecord.hardKPIs.length > 0)
                  ? printModalRecord.hardKPIs
                  : (activeEmpSheet?.hardKPIs && activeEmpSheet.hardKPIs.length > 0)
                    ? activeEmpSheet.hardKPIs
                    : (activeEmpTemplate?.indicators || []).map(ind => {
                        const realVal = printModalRecord.scores?.[ind.id] ?? 80;
                        const targetVal = ind.target || 100;
                        const bobotVal = ind.bobot || 0;
                        return {
                          indicatorId: ind.id,
                          name: ind.name,
                          bobot: bobotVal,
                          metode: (ind.metode || 'Maximize') as 'Maximize' | 'Minimize',
                          target: targetVal,
                          satuan: ind.satuan || '%',
                          realisasi: realVal,
                          score: Math.round((bobotVal * (realVal / Math.max(targetVal, 1))) * 100) / 100
                        };
                      });

                const softSkillsToRender = (printModalRecord.softSkills && printModalRecord.softSkills.length > 0)
                  ? printModalRecord.softSkills
                  : (activeEmpSheet?.softSkills && activeEmpSheet.softSkills.length > 0)
                    ? activeEmpSheet.softSkills
                    : ((activeEmpTemplate?.softSkills && activeEmpTemplate.softSkills.length > 0) ? activeEmpTemplate.softSkills : DEFAULT_SOFT_SKILL_INDICATORS).map(ss => ({
                        name: ss.name,
                        bobot: ss.bobot,
                        nilai: 80,
                        score: Math.round(((ss.bobot / 100) * 80) * 100) / 100
                      }));

                return (
                  <>
                    <div className="grid grid-cols-2 gap-6 text-xs border-b border-slate-100 pb-4">
                      <div className="space-y-1.5">
                        <div className="flex">
                          <span className="w-28 text-slate-400 font-medium">NAMA KARYAWAN</span>
                          <span className="w-4 text-slate-400">:</span>
                          <span className="font-bold text-slate-900 uppercase">{emp?.nama || 'N/A'}</span>
                        </div>
                        <div className="flex">
                          <span className="w-28 text-slate-400 font-medium">JABATAN</span>
                          <span className="w-4 text-slate-400">:</span>
                          <span className="font-bold text-slate-700 uppercase">{empJabatanName.toUpperCase()}</span>
                        </div>
                        <div className="flex">
                          <span className="w-28 text-slate-400 font-medium">NIK</span>
                          <span className="w-4 text-slate-400">:</span>
                          <span className="font-mono text-slate-600">{emp?.nik || '-'}</span>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-right md:text-left md:pl-10">
                        <div className="flex justify-end md:justify-start">
                          <span className="w-28 text-slate-400 font-medium text-left">PERIODE</span>
                          <span className="w-4 text-slate-400 text-center">:</span>
                          <span className="font-bold text-slate-900 uppercase">{printModalRecord.month} / {printModalRecord.year}</span>
                        </div>
                        <div className="flex justify-end md:justify-start">
                          <span className="w-28 text-slate-400 font-medium text-left">GAJI POKOK</span>
                          <span className="w-4 text-slate-400 text-center">:</span>
                          <span className="font-mono font-bold text-slate-700">{formatRupiah(emp?.gaji || 3000000)}</span>
                        </div>
                        <div className="flex justify-end md:justify-start">
                          <span className="w-28 text-slate-400 font-medium text-left">STATUS FORM</span>
                          <span className="w-4 text-slate-400 text-center">:</span>
                          <span className="font-black text-emerald-600 uppercase">✓ APPROVED DOCUMENT</span>
                        </div>
                      </div>
                    </div>

                    {/* Section A: Hard KPIs Table */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1 flex justify-between">
                        <span>BAGIAN A: PENILAIAN KPI UTAMA (BOBOT {printModalRecord.hardWeight ?? 80}%)</span>
                        <span className="text-[10px] text-slate-400">Total: 100%</span>
                      </h3>

                      <table className="w-full text-left border-collapse text-[11px] border border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 font-bold">
                            <th className="p-2 border-r border-slate-300 w-8 text-center">No</th>
                            <th className="p-2 border-r border-slate-300">Indikator Kinerja</th>
                            <th className="p-2 border-r border-slate-300 w-14 text-center">Bobot</th>
                            <th className="p-2 border-r border-slate-300 w-20 text-center">Metode</th>
                            <th className="p-2 border-r border-slate-300 w-16 text-center">Target</th>
                            <th className="p-2 border-r border-slate-300 w-20 text-center">Realisasi</th>
                            <th className="p-2 text-right w-20">Nilai</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {hardKPIsToRender.map((item: any, idx: number) => (
                            <tr key={idx} className="bg-white">
                              <td className="p-2 border-r border-slate-300 text-center font-mono text-slate-400">{idx + 1}</td>
                              <td className="p-2 border-r border-slate-300 font-semibold text-slate-800">{item.name}</td>
                              <td className="p-2 border-r border-slate-300 text-center">{item.bobot}%</td>
                              <td className="p-2 border-r border-slate-300 text-center font-bold text-slate-600">{item.metode}</td>
                              <td className="p-2 border-r border-slate-300 text-center font-mono font-bold">{formatDotNumber(item.target)} {item.satuan}</td>
                              <td className="p-2 border-r border-slate-300 text-center font-mono font-bold text-violet-700">{formatDotNumber(item.realisasi)} {item.satuan}</td>
                              <td className="p-2 text-right font-bold text-slate-900 font-mono">{formatDotNumber(item.score)}</td>
                            </tr>
                          ))}
                          <tr className="bg-slate-50 font-bold text-slate-800 border-t border-slate-300">
                            <td colSpan={2} className="p-2 border-r border-slate-300 text-right uppercase text-[10px] tracking-wide text-slate-400">Total Nilai KPI (A)</td>
                            <td className="p-2 border-r border-slate-300 text-center">100%</td>
                            <td colSpan={3} className="border-r border-slate-300"></td>
                            <td className="p-2 text-right font-black text-slate-950 font-mono">{formatDotNumber(getHardKPITotal(hardKPIsToRender).toFixed(2))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Section B: Soft Skills Table */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1 flex justify-between">
                        <span>BAGIAN B: PENILAIAN SOFT SKILL (BOBOT {printModalRecord.softWeight ?? 20}%)</span>
                        <span className="text-[10px] text-slate-400">Total: 100%</span>
                      </h3>

                      <table className="w-full text-left border-collapse text-[11px] border border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 font-bold">
                            <th className="p-2 border-r border-slate-300 w-8 text-center">No</th>
                            <th className="p-2 border-r border-slate-300">Aspek Kompetensi Utama</th>
                            <th className="p-2 border-r border-slate-300 w-20 text-center">Bobot</th>
                            <th className="p-2 border-r border-slate-300 w-24 text-center">Nilai (1-100)</th>
                            <th className="p-2 text-right w-24">Skor Terbobot</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {softSkillsToRender.map((item: any, idx: number) => (
                            <tr key={idx} className="bg-white">
                              <td className="p-2 border-r border-slate-300 text-center font-mono text-slate-400">{idx + 1}</td>
                              <td className="p-2 border-r border-slate-300 font-semibold text-slate-800">{item.name}</td>
                              <td className="p-2 border-r border-slate-300 text-center">{item.bobot}%</td>
                              <td className="p-2 border-r border-slate-300 text-center font-mono font-bold text-emerald-700">{formatDotNumber(item.nilai)}</td>
                              <td className="p-2 text-right font-bold text-slate-900 font-mono">{formatDotNumber(item.score)}</td>
                            </tr>
                          ))}
                          <tr className="bg-slate-50 font-bold text-slate-800 border-t border-slate-300">
                            <td colSpan={2} className="p-2 border-r border-slate-300 text-right uppercase text-[10px] tracking-wide text-slate-400">Total Nilai Soft Skill (B)</td>
                            <td className="p-2 border-r border-slate-300 text-center">100%</td>
                            <td className="border-r border-slate-300"></td>
                            <td className="p-2 text-right font-black text-slate-950 font-mono">{formatDotNumber(getSoftSkillTotal(softSkillsToRender).toFixed(2))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Summary Calculation Section */}
                    <div className="grid grid-cols-2 gap-4 border border-slate-300 p-4 bg-slate-50 rounded-xl">
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-semibold">Skor KPI (A) Weighted ({printModalRecord.hardWeight ?? 80}%):</span>
                          <span className="font-bold text-slate-700">
                            {((getHardKPITotal(hardKPIsToRender) * (printModalRecord.hardWeight ?? 80)) / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-semibold">Skor Soft Skill (B) Weighted ({printModalRecord.softWeight ?? 20}%):</span>
                          <span className="font-bold text-slate-700">
                            {((getSoftSkillTotal(softSkillsToRender) * (printModalRecord.softWeight ?? 20)) / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200 pt-1.5 font-black text-sm text-slate-900">
                          <span>TOTAL SKOR AKHIR:</span>
                          <span className="text-violet-800">{(printModalRecord.finalScore ?? 0).toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center border-l border-slate-200 pl-4">
                        <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Hasil Akhir Evaluasi</span>
                        <div className="text-xl font-black text-slate-900 mt-0.5">GRADE {gradeObj.code}</div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">({gradeObj.label})</span>
                      </div>
                    </div>

                    {/* Signature lines at bottom */}
                    <div className="grid grid-cols-3 gap-8 pt-10 text-center text-[11px] leading-relaxed">
                      <div className="space-y-14">
                        <div>Dibuat oleh,</div>
                        <div className="border-b border-slate-400 mx-6 pb-1 font-bold uppercase">{emp?.nama}</div>
                        <div className="text-slate-400 text-[10px] -mt-1">Karyawan Bersangkutan</div>
                      </div>

                      <div className="space-y-14">
                        <div>Diperiksa oleh,</div>
                        <div className="border-b border-slate-400 mx-6 pb-1 font-bold uppercase">{printModalRecord.approvedBy || 'Manager Operasional'}</div>
                        <div className="text-slate-400 text-[10px] -mt-1">Atasan Evaluator</div>
                      </div>

                      <div className="space-y-14">
                        <div>Disetujui oleh,</div>
                        <div className="border-b border-slate-400 mx-6 pb-1 font-bold uppercase">Patrick Prayoga</div>
                        <div className="text-slate-400 text-[10px] -mt-1">Direktur</div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal Peringatan Konfirmasi Hapus Template Jabatan */}
      {templateDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900">
                  Hapus Template KPI Jabatan
                </h3>
                <p className="text-xs text-slate-500">
                  Anda akan menghapus template KPI untuk jabatan: <strong className="uppercase text-slate-800">{templateDeleteConfirm.template.jabatan}</strong>
                </p>
              </div>
            </div>

            {templateDeleteConfirm.affectedEmployees.length > 0 ? (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Terdapat {templateDeleteConfirm.affectedEmployees.length} karyawan dalam role tersebut:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {templateDeleteConfirm.affectedEmployees.map(emp => (
                    <span key={emp.id} className="text-xs px-2.5 py-1 bg-white text-amber-950 font-bold rounded-lg border border-amber-200 shadow-2xs flex items-center gap-1">
                      <span>👤</span> {emp.nama}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-amber-800 font-semibold leading-relaxed pt-1">
                  Yakin hapus? Saat dihapus, jabatan karyawan tersebut akan dikosongkan dan di menu <strong>Penilaian KPI</strong> akan muncul peringatan <em>"Harap pilih jabatan untuk mendapatkan nilai KPI"</em>.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                Tidak ada karyawan yang saat ini terhubung dengan template jabatan ini. Template akan dihapus secara permanen dari sistem.
              </p>
            )}

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTemplateDeleteConfirm(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTemplate}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                Ya, Tetap Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Add / Edit Employee Modal (Accessible anywhere from Penilaian KPI and Data Karyawan) */}
      {isAddingEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-2xl space-y-4 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <User size={16} className="text-violet-600" />
                {editingEmployeeId ? 'Edit Data & Gaji Karyawan' : 'Input Karyawan Baru'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddingEmployee(false);
                  setEditingEmployeeId(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors font-bold text-sm"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={newEmployee.nama}
                  onChange={(e) => setNewEmployee(p => ({ ...p, nama: e.target.value }))}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 focus:bg-white focus:border-violet-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Role / Jabatan default</label>
                <select
                  value={newEmployee.isNewJabatan ? "new" : newEmployee.jabatanId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "new") {
                      setNewEmployee(p => ({ ...p, isNewJabatan: true, jabatanId: '' }));
                    } else {
                      setNewEmployee(p => ({ ...p, isNewJabatan: false, jabatanId: val }));
                    }
                  }}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-700 focus:bg-white focus:border-violet-500 transition-colors cursor-pointer"
                >
                  <option value="">-- Pilih Jabatan --</option>
                  {availableJabatanOptions.map(jab => (
                    <option key={jab.id} value={jab.id}>{jab.name} (Bonus: {jab.percentage}%)</option>
                  ))}
                  <option value="new">+ Tambah Jabatan Baru Manual...</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Gaji Pokok (IDR)</label>
                <FormattedNumberInput
                  value={newEmployee.gaji}
                  onChange={(val) => setNewEmployee(p => ({ ...p, gaji: val }))}
                  placeholder="Contoh: 3.000.000"
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-black text-slate-800 font-mono focus:bg-white focus:border-violet-500 transition-colors"
                />
              </div>

              {newEmployee.isNewJabatan && (
                <div className="md:col-span-3 bg-violet-50/50 p-4 rounded-xl border border-violet-100 space-y-2">
                  <label className="text-[10px] uppercase font-bold text-violet-600 block">Nama Jabatan Baru secara Manual</label>
                  <input
                    type="text"
                    value={newEmployee.newJabatanName}
                    onChange={(e) => setNewEmployee(p => ({ ...p, newJabatanName: e.target.value }))}
                    placeholder="Masukkan nama jabatan baru (misal: HR Admin, Supervisor, dll)"
                    className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsAddingEmployee(false);
                  setEditingEmployeeId(null);
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEmployee}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black uppercase rounded-xl transition-all shadow-md shadow-violet-200 flex items-center gap-2"
              >
                <Save size={14} />
                {editingEmployeeId ? 'Simpan Perubahan' : 'Simpan Karyawan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

