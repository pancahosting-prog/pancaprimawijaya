import React, { useState, useEffect, useMemo } from 'react';
import { 
  Award, TrendingUp, Users, Calendar, ChevronRight, X, 
  CheckCircle2, AlertCircle, BarChart3, Briefcase, ShieldCheck, 
  Layers
} from 'lucide-react';
import { loadAllKPIDataFromSupabase, KPIMasterCloudData } from '../../lib/kpiSupabaseSync';

interface PancaKPIHomeWidgetProps {
  currentUser?: {
    username: string;
    role: string;
    nama: string;
  } | null;
}

export const PancaKPIHomeWidget: React.FC<PancaKPIHomeWidgetProps> = ({ currentUser }) => {
  // 1. Role Security Check: Strictly Superadmin and HR only
  const userRole = (currentUser?.role || '').toLowerCase();
  const isSuperadmin = userRole === 'superadmin' || currentUser?.username?.toLowerCase() === 'superadmin';
  const isHR = userRole === 'hr' || userRole === 'hrd';
  const isAuthorized = isSuperadmin || isHR;

  if (!isAuthorized) {
    return null;
  }

  // 2. Month and Year Filter States
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    return (new Date().getMonth() + 1).toString().padStart(2, '0');
  });
  const [filterYear, setFilterYear] = useState<string>(() => new Date().getFullYear().toString());

  // 3. Cloud & Local KPI Master Data States
  const [kpiData, setKpiData] = useState<KPIMasterCloudData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeSubTab, setActiveSubTab] = useState<'rekap' | 'project'>('rekap');
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<any | null>(null);

  // Load KPI data from Supabase Cloud (with fallback to localStorage)
  const fetchKPIData = async () => {
    setIsLoading(true);
    try {
      const res = await loadAllKPIDataFromSupabase();
      if (res.success && res.data) {
        setKpiData(res.data);
      } else {
        // Fallback to localStorage
        const localEmployees = localStorage.getItem('mypanca_kpi_employees');
        const localJabatans = localStorage.getItem('mypanca_kpi_jabatans');
        const localRecords = localStorage.getItem('mypanca_kpi_records');
        const localFinancials = localStorage.getItem('mypanca_kpi_monthly_financials');
        const localSheets = localStorage.getItem('mypanca_kpi_bonus_project_sheets');
        const localTemplates = localStorage.getItem('mypanca_kpi_templates');
        const localIndivSheets = localStorage.getItem('mypanca_kpi_employee_individual_sheets');
        const localCustomInds = localStorage.getItem('mypanca_kpi_employee_custom_indicators');
        const localAddBonuses = localStorage.getItem('mypanca_kpi_additional_bonuses');

        setKpiData({
          kpiEmployees: localEmployees ? JSON.parse(localEmployees) : [],
          jabatans: localJabatans ? JSON.parse(localJabatans) : [],
          kpiRecords: localRecords ? JSON.parse(localRecords) : [],
          kpiMonthlyFinancials: localFinancials ? JSON.parse(localFinancials) : {},
          bonusProjectSheets: localSheets ? JSON.parse(localSheets) : {},
          kpiTemplates: localTemplates ? JSON.parse(localTemplates) : [],
          employeeIndividualSheets: localIndivSheets ? JSON.parse(localIndivSheets) : {},
          employeeCustomIndicators: localCustomInds ? JSON.parse(localCustomInds) : {},
          additionalBonuses: localAddBonuses ? JSON.parse(localAddBonuses) : {}
        });
      }
    } catch (err) {
      console.warn('Gagal memuat KPI untuk /app:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKPIData();
  }, []);

  // Format IDR Rupiah
  const formatRupiah = (num: number | undefined | null) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num || 0);
  };

  const getIndoMonthName = (mStr: string): string => {
    const num = parseInt(mStr, 10);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return months[num - 1] || 'Januari';
  };

  // Helper grading KPI matching /app style
  const getKPIGrade = (score: number | null) => {
    if (score === null || score === undefined) {
      return { grade: '-', label: 'Belum Dinilai', color: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' };
    }
    if (score >= 95) return { grade: 'A', label: '≥ 95 (Excellent)', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' };
    if (score >= 85) return { grade: 'B', label: '85 - 94 (Baik)', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800' };
    if (score >= 75) return { grade: 'C', label: '75 - 84 (Cukup)', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800' };
    if (score >= 65) return { grade: 'D', label: '65 - 74 (Kurang)', color: 'bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800' };
    return { grade: 'E', label: '< 65 (Buruk)', color: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800' };
  };

  // Derived Active Sheet & Financials
  const monthKey = `${filterYear}-${filterMonth}`;
  const activeSheet = useMemo(() => {
    if (kpiData?.bonusProjectSheets && kpiData.bonusProjectSheets[monthKey]) {
      return kpiData.bonusProjectSheets[monthKey];
    }
    if (monthKey === '2026-09') {
      return {
        sales: [
          { id: 'sb-1', nama: 'Yadi', jabatan: 'Head of Sales', targetBulanan: 200000000, pencapaian: 133716920, pajak: 14701861, biayaKirim: 0, biayaLain: 14500000, additional: 0 },
          { id: 'sb-2', nama: 'Sanjaya', jabatan: 'Sales Staff', targetBulanan: 200000000, pencapaian: 0, pajak: 0, biayaKirim: 0, biayaLain: 0, additional: 0 }
        ],
        engineers: [
          { id: 'eb-1', nama: 'Arie Putra', jabatan: 'Head of Engineering', persentaseKomisi: 0.05 },
          { id: 'eb-2', nama: 'Evan', jabatan: 'Engineering Staff', persentaseKomisi: 0.05 },
          { id: 'eb-3', nama: 'Jeremia', jabatan: 'Engineering Staff', persentaseKomisi: 0.05 }
        ]
      };
    }
    return { sales: [], engineers: [] };
  }, [kpiData, monthKey]);

  // Total Sales and Commission Calculations
  const salesTotals = useMemo(() => {
    const list = activeSheet.sales || [];
    return list.reduce((acc: any, r: any) => {
      const target = Number(r.targetBulanan) || 0;
      const capai = Number(r.pencapaian) || 0;
      const pajak = Number(r.pajak) || 0;
      const kirim = Number(r.biayaKirim) || 0;
      const lain = Number(r.biayaLain) || 0;
      const omsetBersih = Math.max(0, capai - pajak - kirim - lain);
      const capaianPct = target > 0 ? (capai / target) * 100 : 0;
      
      let komisiPct = 1;
      if (capaianPct >= 120) komisiPct = 4;
      else if (capaianPct >= 100) komisiPct = 3;
      else if (capaianPct >= 80) komisiPct = 2;

      const komisi = omsetBersih * (komisiPct / 100);
      const grandTotal = komisi + (Number(r.additional) || 0);

      return {
        targetBulanan: acc.targetBulanan + target,
        pencapaian: acc.pencapaian + capai,
        omsetBersih: acc.omsetBersih + omsetBersih,
        komisi: acc.komisi + komisi,
        grandTotal: acc.grandTotal + grandTotal
      };
    }, { targetBulanan: 0, pencapaian: 0, omsetBersih: 0, komisi: 0, grandTotal: 0 });
  }, [activeSheet]);

  const engineerRows = useMemo(() => {
    const engList = activeSheet.engineers || [];
    const basis = salesTotals.grandTotal;
    return engList.map((e: any) => {
      const totalKomisi = basis * (Number(e.persentaseKomisi) || 0.05);
      return {
        ...e,
        totalKomisi
      };
    });
  }, [activeSheet, salesTotals]);

  const engineerTotalKomisi = useMemo(() => {
    return engineerRows.reduce((sum: number, e: any) => sum + (Number(e.totalKomisi) || 0), 0);
  }, [engineerRows]);

  // Target Perusahaan dynamically follows salesTotals.targetBulanan
  const targetPerusahaan = salesTotals.targetBulanan > 0 ? salesTotals.targetBulanan : 100000000;
  const isTargetMet = salesTotals.pencapaian >= targetPerusahaan;

  // Process Employees Recap matching KPI CRM module
  const employeesRecap = useMemo(() => {
    const emps = kpiData?.kpiEmployees || [];
    const jabatans = kpiData?.jabatans || [];
    const records = kpiData?.kpiRecords || [];
    const indivSheets = kpiData?.employeeIndividualSheets || {};
    const addBonuses = kpiData?.additionalBonuses || {};

    return emps.map((emp: any) => {
      const key = `kpi-${emp.id}-${filterMonth}-${filterYear}`;
      const record = records.find((r: any) => r.id === key);
      const indSheet = indivSheets[emp.id];
      const jab = jabatans.find((j: any) => j.id === emp.jabatanId);
      const jabName = jab?.name || emp.jabatan || emp.role || 'Staff';

      let score: number | null = null;
      let hardKPIs: any[] = [];
      let softSkills: any[] = [];

      if (record && record.hardKPIs && record.softSkills) {
        hardKPIs = record.hardKPIs;
        softSkills = record.softSkills;
        const hardScore = hardKPIs.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
        const softScore = softSkills.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
        const hW = record.hardWeight ?? 80;
        const sW = record.softWeight ?? 20;
        score = Math.round(((hardScore * hW / 100) + (softScore * sW / 100)) * 100) / 100;
      } else if (record && record.finalScore !== undefined) {
        score = record.finalScore;
        hardKPIs = record.hardKPIs || [];
        softSkills = record.softSkills || [];
      } else if (indSheet && indSheet.hardKPIs && indSheet.softSkills) {
        hardKPIs = indSheet.hardKPIs;
        softSkills = indSheet.softSkills;
        const hardScore = hardKPIs.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
        const softScore = softSkills.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
        const hW = indSheet.hardWeight ?? 80;
        const sW = indSheet.softWeight ?? 20;
        score = Math.round(((hardScore * hW / 100) + (softScore * sW / 100)) * 100) / 100;
      } else {
        // Fallback demo score for September 2026 if empty
        if (`${filterYear}-${filterMonth}` === '2026-09') {
          const empClean = emp.nama.toLowerCase();
          if (empClean.includes('yadi')) score = 79.66;
          else if (empClean.includes('arie')) score = 103.33;
          else if (empClean.includes('evan')) score = 98.95;
          else if (empClean.includes('jeremia')) score = 106.02;
          else if (empClean.includes('angel')) score = 161.25;
          else if (empClean.includes('mustaqim')) score = 97.25;
          else score = 80;
        }
      }

      const grade = getKPIGrade(score);
      const gaji = emp.gaji || 3000000;
      const jabPct = (jab?.percentage ?? 5) / 100;
      const multiplier = isTargetMet ? 1.0 : 0;
      const bonusBulanan = score !== null ? gaji * jabPct * (score >= 95 ? 1.0 : score >= 85 ? 0.75 : score >= 75 ? 0.6 : 0) * multiplier : 0;

      // Project bonus matching
      const empNameClean = emp.nama.toLowerCase().trim();
      const matchSales = activeSheet.sales?.find((s: any) => 
        (s.employeeId && s.employeeId === emp.id) || s.nama.toLowerCase().trim() === empNameClean || empNameClean.includes(s.nama.toLowerCase().trim())
      );
      const matchEng = engineerRows.find((e: any) => 
        (e.employeeId && e.employeeId === emp.id) || e.nama.toLowerCase().trim() === empNameClean || empNameClean.includes(e.nama.toLowerCase().trim())
      );

      let projectBonus = 0;
      if (matchSales) {
        const target = Number(matchSales.targetBulanan) || 200000000;
        const capai = Number(matchSales.pencapaian) || 0;
        const omsetBersih = Math.max(0, capai - (Number(matchSales.pajak) || 0) - (Number(matchSales.biayaKirim) || 0) - (Number(matchSales.biayaLain) || 0));
        const pct = target > 0 ? (capai / target) * 100 : 0;
        let cPct = 1;
        if (pct >= 120) cPct = 4;
        else if (pct >= 100) cPct = 3;
        else if (pct >= 80) cPct = 2;
        projectBonus = (omsetBersih * (cPct / 100)) + (Number(matchSales.additional) || 0);
      } else if (matchEng) {
        projectBonus = Number(matchEng.totalKomisi) || 0;
      }

      const addKey = `${emp.id}-${filterMonth}-${filterYear}`;
      const additional = addBonuses[addKey] !== undefined ? addBonuses[addKey] : (addBonuses[emp.id] || 0);

      const totalBonus = bonusBulanan + projectBonus + additional;
      const takeHomePay = gaji + totalBonus;

      return {
        ...emp,
        jabatanName: jabName,
        score,
        grade,
        gaji,
        bonusBulanan,
        projectBonus,
        additional,
        totalBonus,
        takeHomePay,
        hardKPIs,
        softSkills,
        status: record?.status || (score !== null ? 'approved' : 'unrated')
      };
    });
  }, [kpiData, filterMonth, filterYear, activeSheet, engineerRows, isTargetMet]);

  // Aggregate Metrics
  const summaryTotals = useMemo(() => {
    return employeesRecap.reduce((acc, e) => {
      return {
        totalGaji: acc.totalGaji + e.gaji,
        totalBonus: acc.totalBonus + e.totalBonus,
        totalTHP: acc.totalTHP + e.takeHomePay,
        ratedCount: acc.ratedCount + (e.score !== null ? 1 : 0),
        scoreSum: acc.scoreSum + (e.score || 0)
      };
    }, { totalGaji: 0, totalBonus: 0, totalTHP: 0, ratedCount: 0, scoreSum: 0 });
  }, [employeesRecap]);

  const avgScore = summaryTotals.ratedCount > 0 ? Math.round((summaryTotals.scoreSum / summaryTotals.ratedCount) * 10) / 10 : 0;

  return (
    <div className="w-full space-y-4">
      {/* 1. Control Filter Bar (Month & Year) */}
      <div className="flex items-center justify-between gap-2 p-3 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-2xl shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
            Periode Penilaian
          </span>
        </div>

        {/* Dropdown Bulan & Tahun */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800 px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-zinc-700">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-900 dark:text-zinc-100 outline-none cursor-pointer pr-1"
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
            className="bg-transparent text-xs font-bold text-slate-900 dark:text-zinc-100 outline-none cursor-pointer"
          >
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
      </div>

      {/* 2. Top Summary Metrics Cards (2 Baris Kecil - Grid 2x2) */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-2xs flex flex-col justify-between overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block leading-tight truncate">
            TARGET SALES
          </span>
          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-1 block truncate">
            {formatRupiah(targetPerusahaan)}
          </span>
          <div className="mt-1">
            {isTargetMet ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] flex items-center gap-1 truncate">
                <CheckCircle2 className="w-3 h-3 shrink-0" /> Target Tercapai
              </span>
            ) : (
              <span className="text-amber-500 font-bold text-[10px] flex items-center gap-1 truncate">
                <AlertCircle className="w-3 h-3 shrink-0" /> Belum Tercapai
              </span>
            )}
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-2xs flex flex-col justify-between overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block leading-tight truncate">
            TOTAL TAKE-HOME PAY
          </span>
          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-1 block truncate">
            {formatRupiah(summaryTotals.totalTHP)}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 block mt-1 truncate">
            Gaji + Seluruh Bonus
          </span>
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-2xs flex flex-col justify-between overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block leading-tight truncate">
            TOTAL BONUS TIM
          </span>
          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-1 block truncate">
            {formatRupiah(summaryTotals.totalBonus)}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 block mt-1 truncate">
            Bulanan & Project
          </span>
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-2xs flex flex-col justify-between overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block leading-tight truncate">
            SKOR RATA-RATA
          </span>
          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-1 block truncate">
            {avgScore > 0 ? `${avgScore}` : '-'}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 block mt-1 truncate">
            {summaryTotals.ratedCount} dari {employeesRecap.length} Karyawan
          </span>
        </div>
      </div>

      {/* 3. Sub Tabs: Segmented Control matching /app */}
      <div className="p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-2xl flex border border-slate-200/60 dark:border-zinc-800">
        <button
          onClick={() => setActiveSubTab('rekap')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeSubTab === 'rekap'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-900 shadow-2xs'
              : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Daftar Karyawan & KPI</span>
        </button>

        <button
          onClick={() => setActiveSubTab('project')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeSubTab === 'project'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-900 shadow-2xs'
              : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Bonus Project Tim</span>
        </button>
      </div>

      {/* 4. Tab 1: Daftar Karyawan & Tombol Detail */}
      {activeSubTab === 'rekap' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-wider px-1">
            <span>KARYAWAN & JABATAN</span>
            <span>SKOR & THP</span>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
            {employeesRecap.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 dark:text-zinc-500 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
                Belum ada data karyawan.
              </div>
            ) : (
              employeesRecap.map((emp) => (
                <div
                  key={emp.id}
                  onClick={() => setSelectedEmployeeDetail(emp)}
                  className="p-3.5 bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/60 rounded-2xl cursor-pointer transition flex items-center justify-between gap-3 shadow-2xs group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {emp.nama}
                      </span>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${emp.grade.color}`}>
                        {emp.grade.grade}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 block truncate mt-0.5 font-medium">
                      {emp.jabatanName}
                    </span>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2.5">
                    <div>
                      <span className="text-xs font-black text-slate-900 dark:text-white block">
                        {formatRupiah(emp.takeHomePay)}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 block">
                        {emp.score !== null ? `Skor: ${emp.score}` : 'Belum dinilai'}
                      </span>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-400 group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-zinc-900 flex items-center justify-center transition">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 2: Bonus Project Data (Sales & Engineering) */}
      {activeSubTab === 'project' && (
        <div className="space-y-4">
          {/* Sales Project Bonus */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300" />
                <span>Sales Bonus Project</span>
              </span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                Total Komisi: {formatRupiah(salesTotals.grandTotal)}
              </span>
            </div>

            <div className="space-y-2">
              {(activeSheet.sales || []).length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 dark:text-zinc-500 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
                  Tidak ada data proyek sales untuk periode ini.
                </div>
              ) : (
                activeSheet.sales.map((s: any) => {
                  const target = Number(s.targetBulanan) || 200000000;
                  const pencapaian = Number(s.pencapaian) || 0;
                  const capPct = target > 0 ? Math.round((pencapaian / target) * 100) : 0;
                  const omsetBersih = Math.max(0, pencapaian - (Number(s.pajak) || 0) - (Number(s.biayaKirim) || 0) - (Number(s.biayaLain) || 0));
                  let cPct = 1;
                  if (capPct >= 120) cPct = 4;
                  else if (capPct >= 100) cPct = 3;
                  else if (capPct >= 80) cPct = 2;
                  const komisi = omsetBersih * (cPct / 100);

                  return (
                    <div key={s.id} className="p-3.5 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs shadow-2xs">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 dark:text-white">{s.nama}</span>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-400 font-medium">({s.jabatan})</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                          Target: {formatRupiah(target)} • Capaian: {formatRupiah(pencapaian)} ({capPct}%)
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-black text-slate-900 dark:text-white block">
                          {formatRupiah(komisi)}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500">
                          Komisi {cPct}%
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Engineer Project Bonus */}
          <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-zinc-800">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300" />
                <span>Engineer Bonus Project</span>
              </span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                Total Komisi: {formatRupiah(engineerTotalKomisi)}
              </span>
            </div>

            <div className="space-y-2">
              {engineerRows.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 dark:text-zinc-500 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
                  Tidak ada data insentif engineer untuk periode ini.
                </div>
              ) : (
                engineerRows.map((e: any) => (
                  <div key={e.id} className="p-3.5 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs shadow-2xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">{e.nama}</span>
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mt-0.5 font-medium">
                        {e.jabatan}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-slate-900 dark:text-white block">
                        {formatRupiah(e.totalKomisi)}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500">
                        {(Number(e.persentaseKomisi) * 100).toFixed(0)}% Basis Komisi Sales
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal Detail KPI Karyawan */}
      {selectedEmployeeDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                    {selectedEmployeeDetail.nama}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      {selectedEmployeeDetail.jabatanName}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.2 rounded-md ${selectedEmployeeDetail.grade.color}`}>
                      Grade {selectedEmployeeDetail.grade.grade}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmployeeDetail(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content Scrollable */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* Financial Snapshot */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3.5 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl border border-slate-200/60 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase block">
                    Gaji Pokok
                  </span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5 block">
                    {formatRupiah(selectedEmployeeDetail.gaji)}
                  </span>
                </div>
                <div className="p-3.5 bg-slate-900 text-white dark:bg-white dark:text-zinc-900 rounded-2xl">
                  <span className="text-[10px] font-bold opacity-75 uppercase block">
                    Total Take-Home Pay
                  </span>
                  <span className="text-xs sm:text-sm font-black mt-0.5 block">
                    {formatRupiah(selectedEmployeeDetail.takeHomePay)}
                  </span>
                </div>
              </div>

              {/* Rincian Komponen Bonus */}
              <div className="p-3.5 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl border border-slate-200/60 dark:border-zinc-800/80 space-y-2">
                <span className="text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase block tracking-wider">
                  Rincian Komponen Bonus Bulan {getIndoMonthName(filterMonth)} {filterYear}
                </span>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-zinc-400 font-medium">Bonus Bulanan KPI:</span>
                  <span className="font-bold text-slate-900 dark:text-zinc-100">{formatRupiah(selectedEmployeeDetail.bonusBulanan)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-zinc-400 font-medium">Bonus Project / Komisi:</span>
                  <span className="font-bold text-slate-900 dark:text-zinc-100">{formatRupiah(selectedEmployeeDetail.projectBonus)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-zinc-400 font-medium">Additional Bonus:</span>
                  <span className="font-bold text-slate-900 dark:text-zinc-100">{formatRupiah(selectedEmployeeDetail.additional)}</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-slate-200 dark:border-zinc-700">
                  <span className="font-bold text-slate-800 dark:text-zinc-200">Total Semua Bonus:</span>
                  <span className="font-black text-slate-900 dark:text-white">{formatRupiah(selectedEmployeeDetail.totalBonus)}</span>
                </div>
              </div>

              {/* Rincian Hard KPI */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300" />
                    <span>Bagian A: Key Performance Indicators</span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">Bobot 80%</span>
                </div>

                <div className="space-y-1.5">
                  {(selectedEmployeeDetail.hardKPIs || []).length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl">
                      Belum ada rincian indikator Hard KPI.
                    </div>
                  ) : (
                    selectedEmployeeDetail.hardKPIs.map((k: any, idx: number) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl border border-slate-200/60 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 dark:text-zinc-100 block truncate">
                            {k.name}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 block font-medium">
                            Target: {k.target || 100} {k.satuan || '%'} • Realisasi: {k.realisasi ?? 0} {k.satuan || '%'}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-slate-900 dark:text-white block">
                            {k.score ?? 0}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">Bobot: {k.bobot}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Rincian Soft Skill */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300" />
                    <span>Bagian B: Soft Skills</span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">Bobot 20%</span>
                </div>

                <div className="space-y-1.5">
                  {(selectedEmployeeDetail.softSkills || []).length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl">
                      Belum ada rincian aspek Soft Skill.
                    </div>
                  ) : (
                    selectedEmployeeDetail.softSkills.map((s: any, idx: number) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl border border-slate-200/60 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 dark:text-zinc-100 block truncate">
                            {s.name}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 block font-medium">
                            Nilai: {s.nilai ?? 80} / 100
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-slate-900 dark:text-white block">
                            {s.score ?? 0}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">Bobot: {s.bobot}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-100 dark:border-zinc-800 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedEmployeeDetail(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-slate-900 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
