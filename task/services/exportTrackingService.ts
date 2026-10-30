import ExcelJS from 'exceljs';
import { Task } from '../types';

export interface ExportUserOption {
  username: string;
  name: string;
  role?: string;
}

export interface ExportTrackingFilterOptions {
  users: ExportUserOption[];
  statusFilter: string[]; // e.g. ['all'] or ['Selesai', 'Proses', 'Belum Mulai', 'Ulang']
  monthFilter: number; // 0 for all months, 1-12 for specific month
  yearFilter: number; // e.g. 2026
}

const MONTH_NAMES_ID = [
  'Semua Bulan',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

export const getMonthNameID = (monthIndex: number): string => {
  return MONTH_NAMES_ID[monthIndex] || `Bulan ${monthIndex}`;
};

const formatDateToDDMMYYYY = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
};

const mapToDisplayStatus = (status: string): string => {
  const s = (status || '').toLowerCase().trim();
  if (s === 'selesai' || s === 'finish' || s === 'done') return 'Finish';
  if (s === 'proses' || s === 'on progress' || s === 'in progress') return 'On Progress';
  if (s === 'belum mulai' || s === 'not started' || s === 'pending') return 'Belum Mulai';
  if (s === 'ulang' || s === 'revisi' || s === 'revision') return 'Ulang';
  return status || 'Belum Mulai';
};

const thinBlackBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } }
};

interface ActivityRow {
  date: string;
  projectName: string;
  keterangan: string;
  kategori: string;
  progress: number; // 0 to 100
  status: string;
}

export async function generateTrackingExcel(
  options: ExportTrackingFilterOptions,
  fetchUserTasks: (username: string) => Promise<Task[]>
): Promise<void> {
  const { users, statusFilter, monthFilter, yearFilter } = options;
  if (!users || users.length === 0) {
    throw new Error('Pilih minimal 1 user untuk di-download');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MyPanca System';
  workbook.lastModifiedBy = 'MyPanca System';
  workbook.created = new Date();
  workbook.modified = new Date();

  const usedSheetNames = new Set<string>();

  for (const user of users) {
    // Sanitize sheet name: max 31 chars, no forbidden chars: \ / ? * : [ ]
    let rawSheetName = (user.name || user.username || 'User').replace(/[\\/?*:[\]]/g, ' ').trim();
    if (rawSheetName.length > 28) {
      rawSheetName = rawSheetName.substring(0, 28).trim();
    }
    let sheetName = rawSheetName || 'Sheet';
    let counter = 1;
    while (usedSheetNames.has(sheetName.toLowerCase())) {
      sheetName = `${rawSheetName.substring(0, 25)}_${counter}`;
      counter++;
    }
    usedSheetNames.add(sheetName.toLowerCase());

    const ws = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }]
    });

    // Column widths matched with reference screenshot
    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'tanggal', width: 14 },
      { key: 'namaProject', width: 36 },
      { key: 'keterangan', width: 46 },
      { key: 'kategori', width: 18 },
      { key: 'progress', width: 16 },
      { key: 'status', width: 15 }
    ];

    // --- Header Top Meta (Row 1 & 2) ---
    // Title in C1:E1 or C1:D1
    ws.mergeCells('B1:E2');
    const titleCell = ws.getCell('B1');
    titleCell.value = 'Engineering Monitoring Activity';
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF000000' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Meta labels & values
    const namaLabelCell = ws.getCell('F1');
    namaLabelCell.value = 'Nama:';
    namaLabelCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    namaLabelCell.alignment = { vertical: 'middle', horizontal: 'right' };

    const namaValueCell = ws.getCell('G1');
    namaValueCell.value = user.name || user.username;
    namaValueCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    namaValueCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const bulanLabelCell = ws.getCell('F2');
    bulanLabelCell.value = 'Bulan:';
    bulanLabelCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    bulanLabelCell.alignment = { vertical: 'middle', horizontal: 'right' };

    const bulanValueCell = ws.getCell('G2');
    const monthLabel = monthFilter > 0 ? `${getMonthNameID(monthFilter)} ${yearFilter}` : `Semua Bulan ${yearFilter}`;
    bulanValueCell.value = monthFilter > 0 ? getMonthNameID(monthFilter) : monthLabel;
    bulanValueCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    bulanValueCell.alignment = { vertical: 'middle', horizontal: 'left' };

    ws.getRow(1).height = 22;
    ws.getRow(2).height = 22;

    // --- Table Headers (Row 3) ---
    const headers = [
      'No',
      'Tanggal\n(dd/mm/yyyy)',
      'Nama Project\n(Nama project dapat diisi berulang dengan nama yang sama)',
      'Keterangan\n(Isi kegiatan sesuai aktifitas yang dilaksanakan)',
      'Kategori',
      'Persentase\nProgres\n(% overall)',
      'Status'
    ];

    const headerRow = ws.getRow(3);
    headerRow.height = 46;

    headers.forEach((h, idx) => {
      const colNum = idx + 1;
      const cell = headerRow.getCell(colNum);
      cell.value = h;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF00A2E8' } // Bright Cyan blue from the user's template
      };
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: 'FF000000' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true
      };
      cell.border = thinBlackBorder;
    });

    // --- Fetch User Tasks and Extract Activities ---
    let userTasks: Task[] = [];
    try {
      userTasks = await fetchUserTasks(user.username);
    } catch (err) {
      console.warn(`Gagal memuat tugas untuk user ${user.username}:`, err);
      userTasks = [];
    }

    const activityRows: ActivityRow[] = [];

    userTasks.forEach(task => {
      // Determine if task has detailed logs
      if (task.logs && task.logs.length > 0) {
        task.logs.forEach(log => {
          activityRows.push({
            date: log.date || task.startDate,
            projectName: task.title || task.companyName || 'Project',
            keterangan: log.description || task.jobType || task.title,
            kategori: task.category || 'Project',
            progress: typeof log.progress === 'number' ? log.progress : task.progress || 0,
            status: log.status || task.status
          });
        });
      } else {
        activityRows.push({
          date: task.startDate || task.endDate || new Date().toISOString(),
          projectName: task.title || task.companyName || 'Project',
          keterangan: task.jobType || task.title,
          kategori: task.category || 'Project',
          progress: task.progress || 0,
          status: task.status
        });
      }
    });

    // --- Filter by Month & Status ---
    const isAllStatus = statusFilter.includes('all') || statusFilter.length === 0;

    const filteredActivities = activityRows.filter(act => {
      // Date filter
      if (act.date) {
        const d = new Date(act.date);
        if (!isNaN(d.getTime())) {
          if (yearFilter && d.getFullYear() !== yearFilter) return false;
          if (monthFilter > 0 && (d.getMonth() + 1) !== monthFilter) return false;
        }
      }

      // Status filter
      if (!isAllStatus) {
        const rawStatus = (act.status || '').toLowerCase().trim();
        const displaySt = mapToDisplayStatus(act.status).toLowerCase();
        
        const matches = statusFilter.some(sf => {
          const sfLower = sf.toLowerCase().trim();
          return rawStatus === sfLower || 
                 displaySt === sfLower ||
                 (sfLower === 'selesai' && (rawStatus === 'finish' || rawStatus === 'selesai')) ||
                 (sfLower === 'proses' && (rawStatus === 'on progress' || rawStatus === 'proses'));
        });
        if (!matches) return false;
      }

      return true;
    });

    // Sort chronologically by date
    filteredActivities.sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeA - timeB;
    });

    // --- Fill Data Rows ---
    if (filteredActivities.length === 0) {
      const emptyRow = ws.addRow([
        1,
        '-',
        'Tidak ada aktivitas yang tercatat pada periode ini',
        '-',
        '-',
        0,
        '-'
      ]);
      emptyRow.height = 24;
      emptyRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
        cell.border = thinBlackBorder;
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 3 ? 'left' : 'center' };
      });
    } else {
      filteredActivities.forEach((act, idx) => {
        const rowNum = idx + 1;
        const displayStatus = mapToDisplayStatus(act.status);
        const progressDecimal = Math.max(0, Math.min(100, act.progress)) / 100;
        const formattedDate = formatDateToDDMMYYYY(act.date);

        const dataRow = ws.addRow([
          rowNum,
          formattedDate,
          act.projectName,
          act.keterangan,
          act.kategori,
          progressDecimal,
          displayStatus
        ]);

        dataRow.height = 24;

        // Apply cell formatting & styles
        // Cell 1: No
        const c1 = dataRow.getCell(1);
        c1.alignment = { vertical: 'middle', horizontal: 'center' };
        c1.font = { name: 'Calibri', size: 10 };
        c1.border = thinBlackBorder;

        // Cell 2: Tanggal
        const c2 = dataRow.getCell(2);
        c2.alignment = { vertical: 'middle', horizontal: 'center' };
        c2.font = { name: 'Calibri', size: 10 };
        c2.border = thinBlackBorder;

        // Cell 3: Nama Project
        const c3 = dataRow.getCell(3);
        c3.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        c3.font = { name: 'Calibri', size: 10 };
        c3.border = thinBlackBorder;

        // Cell 4: Keterangan
        const c4 = dataRow.getCell(4);
        c4.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        c4.font = { name: 'Calibri', size: 10 };
        c4.border = thinBlackBorder;

        // Cell 5: Kategori
        const c5 = dataRow.getCell(5);
        c5.alignment = { vertical: 'middle', horizontal: 'center' };
        c5.font = { name: 'Calibri', size: 10 };
        c5.border = thinBlackBorder;

        // Cell 6: Persentase Progres (numFmt = 0.00% matching image '100,00%')
        const c6 = dataRow.getCell(6);
        c6.numFmt = '0.00%';
        c6.alignment = { vertical: 'middle', horizontal: 'right' };
        c6.font = { name: 'Calibri', size: 10, bold: act.progress >= 100 };
        c6.border = thinBlackBorder;

        // If 100% or finished, soft green tint in progress cell like reference screenshot
        if (progressDecimal >= 1) {
          c6.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' } // Soft pastel green
          };
          c6.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF006100' } };
        } else if (progressDecimal > 0) {
          c6.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F4EA' } // Very light green
          };
        }

        // Cell 7: Status (with soft green / yellow background like reference screenshot)
        const c7 = dataRow.getCell(7);
        c7.alignment = { vertical: 'middle', horizontal: 'center' };
        c7.border = thinBlackBorder;

        if (displayStatus === 'Finish') {
          c7.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD1FAE5' } // Soft pastel green
          };
          c7.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF15803D' } }; // green-700
        } else if (displayStatus === 'On Progress') {
          c7.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEF9C3' } // Soft pastel yellow
          };
          c7.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB45309' } }; // amber-700
        } else if (displayStatus === 'Ulang') {
          c7.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEE2E2' } // Soft pastel red
          };
          c7.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
        } else {
          c7.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' } // Slate-100
          };
          c7.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };
        }
      });
    }
  }

  // --- Trigger Download ---
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const monthStr = monthFilter > 0 ? getMonthNameID(monthFilter) : 'Semua_Bulan';
  a.download = `Engineering_Monitoring_Activity_${monthStr}_${yearFilter}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
