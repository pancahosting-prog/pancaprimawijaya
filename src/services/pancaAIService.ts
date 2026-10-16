// Unified Data Digest & AI Service for Panca AI (Web CRM & Mobile /app)
// Powered by Google Gemini with Multi-Key Auto-Rolling
import { callGeminiWithKeyRotation } from './geminiKeyService';

export interface PancaAIContext {
  currentUser: {
    username: string;
    role: string;
    nama: string;
  };
  activeCompany?: {
    id: string;
    nama: string;
  };
  transactions: any[];
  customers: any[];
  products: any[];
  suppliers: any[];
  purchaseOrders: any[];
  employees: any[];
  taskAppData?: {
    tasks: any[];
    projects: any[];
    drivePosts: any[];
  };
  appUsers?: any[];
  deletedItems?: any[];
}

// Helper to calculate exact amount of a transaction
export const getTransactionAmount = (t: any): number => {
  if (typeof t.nilaiProyek === 'number' && !isNaN(t.nilaiProyek) && t.nilaiProyek > 0) return t.nilaiProyek;
  if (typeof t.total === 'number' && !isNaN(t.total) && t.total > 0) return t.total;
  if (Array.isArray(t.items) && t.items.length > 0) {
    return t.items.reduce((sum: number, it: any) => sum + ((Number(it.harga) || 0) * (Number(it.qty) || 1)), 0);
  }
  return 0;
};

// Compile real-time aggregations from all modules
export const compileSystemAggregations = (ctx: PancaAIContext, queryText: string = '') => {
  const currentCompId = ctx.activeCompany?.id || '1';
  const isSuperAdmin = ctx.currentUser?.role?.toLowerCase() === 'superadmin';

  const allTransactions = ctx.transactions || [];
  const allCustomers = ctx.customers || [];
  const allProducts = ctx.products || [];
  const allSuppliers = ctx.suppliers || [];
  const allPOs = ctx.purchaseOrders || [];
  const allEmployees = ctx.employees || [];

  // Filter by company where applicable
  const compTransactions = allTransactions.filter(t => !t.companyId || t.companyId === currentCompId);
  const compCustomers = allCustomers.filter(c => !c.companyId || c.companyId === currentCompId);
  const compProducts = allProducts.filter(p => !p.companyId || p.companyId === currentCompId);

  // Sales & Trade Analysis
  let totalOmzetReal = 0;
  let totalOmzetLunas = 0;
  let totalNilaiPenawaran = 0;
  let totalNilaiBatal = 0;
  const tradeStatusCounts: Record<string, number> = {};
  const paymentStatusCounts: Record<string, number> = {};
  const salesPerformance: Record<string, { count: number; omzet: number }> = {};
  const customerSpendMap: Record<string, { count: number; total: number }> = {};
  const soldProductQuantities: Record<string, { qty: number; revenue: number }> = {};
  const monthlyOmzetMap: Record<string, { totalDeals: number; omzetSelesai: number; totalNominal: number; customers: string[] }> = {};

  // Finance & Receivables
  let totalPiutangAmount = 0;
  const unpaidInvoicesList: { noTrx: string; customer: string; tanggal: string; total: number; sisa: number; sales: string }[] = [];

  // Quotes / Penawaran
  let totalQuotes = 0;
  let followedUpQuotes = 0;
  const quoteList: any[] = [];

  compTransactions.forEach(t => {
    const amt = getTransactionAmount(t);
    const status = t.status || 'Selesai';
    const payStatus = t.paymentStatus || (status === 'Selesai' ? 'Lunas' : 'Belum Lunas');
    const isQuote = status === 'Penawaran' || t.isQuote;
    const isCanceled = status === 'Pesanan Batal' || status === 'Batal';
    const isRealDeal = !isQuote && !isCanceled;

    tradeStatusCounts[status] = (tradeStatusCounts[status] || 0) + 1;
    paymentStatusCounts[payStatus] = (paymentStatusCounts[payStatus] || 0) + 1;

    if (isRealDeal) {
      totalOmzetReal += amt;
      if (payStatus === 'Lunas' || status === 'Selesai') {
        totalOmzetLunas += amt;
      }

      // Monthly breakdown
      let mKey = 'Tanpa Tanggal';
      if (t.tanggal) {
        try {
          const d = new Date(t.tanggal);
          if (!isNaN(d.getTime())) {
            const mNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            mKey = `${mNames[d.getMonth()]} ${d.getFullYear()}`;
          }
        } catch {}
      }
      if (!monthlyOmzetMap[mKey]) monthlyOmzetMap[mKey] = { totalDeals: 0, omzetSelesai: 0, totalNominal: 0, customers: [] };
      monthlyOmzetMap[mKey].totalDeals += 1;
      monthlyOmzetMap[mKey].totalNominal += amt;
      if (payStatus === 'Lunas' || status === 'Selesai') {
        monthlyOmzetMap[mKey].omzetSelesai += amt;
      }
      const cName = t.customerName || t.customer || 'Pelanggan';
      if (!monthlyOmzetMap[mKey].customers.includes(cName)) {
        monthlyOmzetMap[mKey].customers.push(cName);
      }

      // Sales rep performance
      const rep = t.sales || t.salesName || 'Unassigned';
      if (!salesPerformance[rep]) salesPerformance[rep] = { count: 0, omzet: 0 };
      salesPerformance[rep].count += 1;
      salesPerformance[rep].omzet += amt;

      // Customer spend
      const cust = t.customerName || t.customer || 'Pelanggan';
      if (!customerSpendMap[cust]) customerSpendMap[cust] = { count: 0, total: 0 };
      customerSpendMap[cust].count += 1;
      customerSpendMap[cust].total += amt;

      // Item sales
      if (Array.isArray(t.items)) {
        t.items.forEach((it: any) => {
          const pName = it.nama || it.productName;
          if (pName) {
            const q = Number(it.qty) || 1;
            const hg = (Number(it.harga) || 0) * q;
            if (!soldProductQuantities[pName]) soldProductQuantities[pName] = { qty: 0, revenue: 0 };
            soldProductQuantities[pName].qty += q;
            soldProductQuantities[pName].revenue += hg;
          }
        });
      }
    } else if (isQuote) {
      totalNilaiPenawaran += amt;
      totalQuotes += 1;
      const isFollowed = (t as any).followedUp || (Array.isArray((t as any).followUps) && (t as any).followUps.length > 0);
      if (isFollowed) followedUpQuotes += 1;
      quoteList.push({
        noTrx: t.noTrx || t.id,
        customer: t.customerName || t.customer || 'Pelanggan',
        tanggal: t.tanggal || '-',
        total: amt,
        followedUp: isFollowed,
        sales: t.sales || t.salesName || '-'
      });
    } else if (isCanceled) {
      totalNilaiBatal += amt;
    }

    // Unpaid invoices / Piutang
    const hasSisa = typeof (t as any).sisaPembayaran === 'number' && (t as any).sisaPembayaran > 0;
    const isUnpaid = isRealDeal && (payStatus === 'Belum Lunas' || hasSisa || status === 'Pengiriman');
    if (isUnpaid) {
      const sisa = hasSisa ? (t as any).sisaPembayaran : amt;
      totalPiutangAmount += sisa;
      unpaidInvoicesList.push({
        noTrx: t.noTrx || t.id,
        customer: t.customerName || t.customer || 'Pelanggan',
        tanggal: t.tanggal || '-',
        total: amt,
        sisa,
        sales: t.sales || t.salesName || '-'
      });
    }
  });

  // Stock Analysis
  const lowStockProducts = compProducts.filter(p => {
    const s = typeof p.stok === 'number' ? p.stok : 0;
    const min = p.minStok || 10;
    return s < min;
  });

  // Purchasing & PO
  let totalPOAmount = 0;
  let totalHutangAmount = 0;
  const poStatusCounts: Record<string, number> = {};
  allPOs.forEach(po => {
    const amt = Number(po.total) || 0;
    totalPOAmount += amt;
    const st = po.status || 'Draft';
    poStatusCounts[st] = (poStatusCounts[st] || 0) + 1;
    if (st !== 'Lunas') totalHutangAmount += amt;
  });

  return {
    currentCompId,
    compTransactions,
    compCustomers,
    compProducts,
    allSuppliers,
    allPOs,
    allEmployees,
    totalOmzetReal,
    totalOmzetLunas,
    totalNilaiPenawaran,
    totalNilaiBatal,
    tradeStatusCounts,
    paymentStatusCounts,
    salesPerformance,
    customerSpendMap,
    soldProductQuantities,
    monthlyOmzetMap,
    totalPiutangAmount,
    unpaidInvoicesList,
    totalQuotes,
    followedUpQuotes,
    quoteList,
    lowStockProducts,
    totalPOAmount,
    totalHutangAmount,
    poStatusCounts
  };
};

// Generate full real-time database digest
export const generatePancaDataDigest = (ctx: PancaAIContext, queryText: string = ''): string => {
  const agg = compileSystemAggregations(ctx, queryText);
  const isSuperAdmin = ctx.currentUser?.role?.toLowerCase() === 'superadmin';
  const queryLower = queryText.toLowerCase();

  let digest = `=== DATA REAL-TIME SISTEM DARI SEMUA MENU (PT. PANCA PRIMA WIJAYA) ===
- Perusahaan Aktif: ${ctx.activeCompany?.nama || 'PT. PANCA PRIMA WIJAYA'}
- Total Transaksi Real Deals: ${agg.compTransactions.filter(t => !['Penawaran', 'Pesanan Batal'].includes(t.status || '')).length} Transaksi
- Total Omzet Real (Selesai/Lunas): Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')}
- Total Pelanggan/Customer Terdaftar: ${agg.compCustomers.length} Pelanggan
- Total SKU Produk: ${agg.compProducts.length} SKU (Stok Menipis: ${agg.lowStockProducts.length} SKU)
- Total Piutang Belum Lunas: Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.unpaidInvoicesList.length} tagihan belum lunas)

--- [REKAP OMZET PER BULAN] ---
${Object.entries(agg.monthlyOmzetMap).map(([m, data]) => `* Periode ${m}: Total Omzet Selesai Rp ${data.omzetSelesai.toLocaleString('id-ID')} (${data.totalDeals} transaksi: ${data.customers.join(', ')})`).join('\n') || '* (Belum ada data bulanan)'}

--- [MENU 1: TRADE & TRANSAKSI PENJUALAN REAL] ---
* Status Pesanan Breakdown: ${Object.entries(agg.tradeStatusCounts).map(([k, v]) => `${k}: ${v} transaksi`).join(' | ')}
* Status Pembayaran: ${Object.entries(agg.paymentStatusCounts).map(([k, v]) => `${k}: ${v} transaksi`).join(' | ')}
* Performa Sales Rep (Omzet Real Deals):
${Object.entries(agg.salesPerformance).map(([s, d]) => `  - Sales ${s}: ${d.count} trx deals | Total Omzet: Rp ${d.omzet.toLocaleString('id-ID')}`).join('\n') || '  (Belum ada data sales)'}

* Top Pelanggan dengan Nilai Belanja Terbesar:
${Object.entries(agg.customerSpendMap).sort((a, b) => b[1].total - a[1].total).slice(0, 15).map(([c, d], i) => `  ${i + 1}. ${c}: ${d.count} transaksi | Total Belanja: Rp ${d.total.toLocaleString('id-ID')}`).join('\n') || '  (Belum ada)'}

* Rincian Transaksi Lengkap (Database Real MyPanca - Semua Transaksi Terbaca):
${agg.compTransactions.slice(0, 100).map(t => {
  const amt = getTransactionAmount(t);
  const itemsStr = Array.isArray(t.items) ? t.items.map((it: any) => `${it.nama || it.productName || 'Barang'} (${it.qty || 1} unit @ Rp ${(Number(it.harga) || 0).toLocaleString('id-ID')})`).join(', ') : '';
  return `  - [${t.noTrx || t.id}] Tanggal: ${t.tanggal || '-'} | Pelanggan: ${t.customerName || t.customer || '-'} | Total Nilai: Rp ${amt.toLocaleString('id-ID')} | Status Pesanan: ${t.status || 'Selesai'} | Pembayaran: ${t.paymentStatus || 'Lunas'} | Sales: ${t.sales || t.salesName || '-'} | Item: [${itemsStr || 'N/A'}]`;
}).join('\n')}

--- [MENU 2: BRM - DAFTAR KONTAK & PELANGGAN LENGKAP] ---
* Total Kontak: ${agg.compCustomers.length} Pelanggan
${agg.compCustomers.slice(0, 60).map(c => `  - ${c.nama} (Perusahaan: ${c.perusahaan || '-'}, PIC: ${c.pic || '-'}, Kota: ${c.kota || '-'}, Telp/WA: ${c.whatsapp || c.phone || '-'}, Sales Rep: ${c.sales || '-'}, Status Lead: ${c.leadType || 'Aktif'})`).join('\n')}

--- [MENU 3: BRM - PENAWARAN (QUOTATIONS) - BUKAN OMZET] ---
* Total Penawaran: ${agg.totalQuotes} penawaran (Nilai Total: Rp ${agg.totalNilaiPenawaran.toLocaleString('id-ID')})
${agg.quoteList.slice(0, 20).map(q => `  - [${q.noTrx}] ${q.customer} | Tanggal: ${q.tanggal} | Rp ${q.total.toLocaleString('id-ID')} | Follow-Up: ${q.followedUp ? 'Sudah Follow-Up' : 'Menunggu Follow-Up'}`).join('\n')}

--- [MENU 4: INVENTARIS & STOK PRODUK LENGKAP] ---
* Total SKU: ${agg.compProducts.length} Produk
* KATALOG & SPESIFIKASI PRODUK LENGKAP:
${agg.compProducts.map(p => {
  const specStr = p.specifications || p.deskripsi || p.description || 'Belum diisi';
  const mainFunc = p.mainFunction || 'Belum diisi';
  const mainApp = p.mainApplication || 'Belum diisi';
  const dim = (p.panjang || p.lebar || p.tinggi) ? `${p.panjang || 0} x ${p.lebar || 0} x ${p.tinggi || 0} cm` : 'Belum diisi';
  const weight = p.berat ? `${p.berat} kg` : 'Belum diisi';
  const remarks = p.remarks || 'Belum diisi';
  return `  - SKU [${p.kode || p.id}] ${p.nama} (Kategori: ${p.kategori || 'Umum'}, Stok: ${p.stok || 0} ${p.satuan || 'unit'}) | Harga: Rp ${(p.hargaJual || 0).toLocaleString('id-ID')}
    * Fungsi Utama: ${mainFunc}
    * Aplikasi Utama: ${mainApp}
    * Spesifikasi Detail: ${specStr}
    * Dimensi (P x L x T): ${dim}
    * Berat: ${weight}
    * Remarks / Catatan: ${remarks}`;
}).join('\n')}
* Produk Stok Menipis (< batas aman):
${agg.lowStockProducts.map(p => `  - ⚠️ ${p.nama} (Kode: ${p.kode || '-'}): sisa ${p.stok || 0} ${p.satuan || 'unit'} (Min: ${p.minStok || 10}) | Harga: Rp ${(p.hargaJual || 0).toLocaleString('id-ID')}`).join('\n') || '  - ✅ Semua stok produk dalam batas aman.'}
* Produk Terlaris All-Time:
${Object.entries(agg.soldProductQuantities).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10).map(([name, d], i) => `  ${i + 1}. ${name}: ${d.qty} unit terjual | Pendapatan: Rp ${d.revenue.toLocaleString('id-ID')}`).join('\n')}

--- [MENU 5: FINANCE - PIUTANG USAHA (TAGIHAN BELUM LUNAS)] ---
* Total Piutang Usaha: Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.unpaidInvoicesList.length} tagihan belum lunas)
${agg.unpaidInvoicesList.slice(0, 40).map(u => `  - Invoice [${u.noTrx}] Pelanggan: ${u.customer} | Tanggal: ${u.tanggal} | Total: Rp ${u.total.toLocaleString('id-ID')} | Sisa Tagihan: Rp ${u.sisa.toLocaleString('id-ID')} | Sales: ${u.sales}`).join('\n') || '  - ✅ Tidak ada piutang tertunggak.'}

--- [MENU 6: PURCHASING & SUPPLIER] ---
* Total Supplier: ${agg.allSuppliers.length} vendor | Total PO: ${agg.allPOs.length} PO (Total Nilai: Rp ${agg.totalPOAmount.toLocaleString('id-ID')})
${agg.allPOs.slice(0, 15).map(po => `  - PO [${po.noPO || po.id}] Vendor: ${po.supplierName || '-'} | Tanggal: ${po.tanggal || po.tanggalPembelian || '-'} | Total: Rp ${(Number(po.total) || 0).toLocaleString('id-ID')} | Status: ${po.status || 'Draft'}`).join('\n')}

--- [MENU 7: HR - KARYAWAN & TIM] ---
* Total Karyawan: ${agg.allEmployees.length} staf
${agg.allEmployees.map(e => `  - ${e.nama} | Posisi/Jabatan: ${e.role || '-'} | WA: ${e.whatsapp || '-'}${isSuperAdmin && e.gaji ? ` | Gaji: Rp ${Number(e.gaji).toLocaleString('id-ID')}` : ''}`).join('\n')}
`;

  // Include Task App data if available (SuperAdmin / Team)
  if (ctx.taskAppData && (ctx.taskAppData.tasks?.length || ctx.taskAppData.projects?.length)) {
    const tasks = ctx.taskAppData.tasks || [];
    const projects = ctx.taskAppData.projects || [];
    digest += `\n--- [MENU 8: TASK APP & PROYEK TIM] ---
* Total Task: ${tasks.length} task (${tasks.filter(t => t.status === 'Selesai').length} Selesai, ${tasks.filter(t => t.status !== 'Selesai').length} Berjalan/Pending)
${tasks.slice(0, 15).map(t => `  - Task: "${t.title}" | Status: ${t.status} | Prioritas: ${t.priority || 'Medium'} | Progress: ${t.progress || 0}% | PIC: ${t.employeeName || t.owner || '-'}`).join('\n')}
* Total Proyek Database: ${projects.length} proyek
${projects.slice(0, 10).map(p => `  - Proyek [${p.code || 'PRJ'}]: "${p.title}" | Klien: ${p.clientName || '-'} | Status: ${p.status} | Lead: ${p.leadEngineer || '-'}`).join('\n')}
`;
  }

  // Dynamic Keyword Search Injection for Precision Context
  const keywords = queryLower.split(/\s+/).filter(w => w.length >= 2 && !['berapa', 'siapa', 'apakah', 'gimana', 'tolong', 'minta', 'data', 'pada', 'yang', 'untuk', 'dari', 'cek', 'lihat'].includes(w));
  if (keywords.length > 0) {
    const matchedTrx = agg.compTransactions.filter(t => {
      const full = `${t.noTrx || ''} ${t.id || ''} ${t.customerName || ''} ${t.customer || ''} ${t.sales || ''} ${t.status || ''}`.toLowerCase();
      return keywords.some(k => full.includes(k));
    });

    if (matchedTrx.length > 0) {
      digest += `\n=== PENCARIAN RELEVAN TERHADAP KATA KUNCI PERTANYAAN ("${queryText}") ===\n`;
      matchedTrx.slice(0, 10).forEach(t => {
        const amt = getTransactionAmount(t);
        digest += `* TRANSAKSI COCOK [${t.noTrx || t.id}]: Pelanggan: ${t.customerName || t.customer || '-'} | Tanggal: ${t.tanggal} | Nominal: Rp ${amt.toLocaleString('id-ID')} | Status Pesanan: ${t.status} | Pembayaran: ${t.paymentStatus} | Sales: ${t.sales || '-'}\n`;
      });
    }
  }

  return digest;
};

export interface LackingContextResult {
  lacksContext: boolean;
  topic: string;
  clarificationQuestion: string;
}

// Deterministic Context Clarification Engine
// Ensures that general queries like "omset" without month/period or entity ALWAYS ask for clarification first!
export const detectLackingContext = (
  query: string,
  history: { role: string; content: string }[] = []
): LackingContextResult | null => {
  const q = query.trim().toLowerCase();
  const isAnsweringClarification = history.length > 0 && history[history.length - 1]?.role === 'assistant';
  const lastAssistantMsg = isAnsweringClarification ? (history[history.length - 1]?.content || '').toLowerCase() : '';

  const monthKeywords = [
    'januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'ags', 'agu', 'sep', 'okt', 'nov', 'des',
    'bulan ini', 'bulan lalu', 'tahun ini', 'tahun lalu', 'hari ini', 'kemarin', 'minggu ini',
    '2024', '2025', '2026', '2027', 'sepanjang tahun', 'semua bulan', '1 tahun', 'setahun'
  ];
  
  const hasTimeQualifier = monthKeywords.some(m => q.includes(m));
  const hasSpecificId = /trx[-_ ]?\d+|inv[-_ ]?\d+|po[-_ ]?\d+/i.test(q);
  const isDetailRequest = /^(ya|boleh|tampilkan|lihat|rincian|detail|rinci|breakdown|sebutkan|tunjukin)/i.test(q);

  // If last assistant message was asking for period and user provides an answer:
  if (lastAssistantMsg.includes('periode bulan') || lastAssistantMsg.includes('bulan apa')) {
    if (hasTimeQualifier || q.length >= 2) {
      return null;
    }
  }

  // If last assistant message asked about details and user asks for details:
  if (lastAssistantMsg.includes('rincian detail') && isDetailRequest) {
    return null;
  }

  // 1. Omzet / Penjualan without period or customer or ID
  const isOmzetTopic = /\b(omset|omzet|penjualan|revenue|pendapatan|sales)\b/i.test(q);
  if (isOmzetTopic && !hasTimeQualifier && !hasSpecificId) {
    const isGeneralOmzet = /^(omset|omzet|berapa omset|berapa omzet|total omset|total omzet|omsetnya|omzetnya|cek omset|cek omzet|penjualan|total penjualan|laporan penjualan|omset kita|omzet kita|omset perusahaan|omzet perusahaan|berapa penjualan|info omset|info omzet|omset saat ini|omzet saat ini)[\?\.\!]?$/i.test(q)
      || (!q.includes('pt ') && !q.includes('cv ') && q.split(' ').length <= 5 && !hasTimeQualifier);
    
    if (isGeneralOmzet) {
      return {
        lacksContext: true,
        topic: 'omzet',
        clarificationQuestion: 'Anda ingin memeriksa omzet untuk periode bulan atau tahun apa? (Misalnya: **Agustus 2026**, **September 2026**, **bulan ini**, atau **sepanjang tahun 2026**?)'
      };
    }
  }

  // 2. Transaksi without specific ID or period or customer
  const isTrxTopic = /\b(transaksi|deals|pesanan|order)\b/i.test(q);
  if (isTrxTopic && !hasTimeQualifier && !hasSpecificId) {
    const isGeneralTrx = /^(transaksi|cek transaksi|data transaksi|daftar transaksi|semua transaksi|list transaksi|transaksi berjalan|pesanan|cek pesanan)[\?\.\!]?$/i.test(q)
      || (q.split(' ').length <= 4 && !q.includes('pt ') && !q.includes('cv '));
    if (isGeneralTrx) {
      return {
        lacksContext: true,
        topic: 'transaksi',
        clarificationQuestion: 'Anda ingin memeriksa transaksi dengan nomor berapa (seperti **TRX-70**), transaksi untuk **bulan tertentu**, atau status pesanan tertentu (selesai/pengiriman)?'
      };
    }
  }

  // 3. Stok without product name
  const isStokTopic = /\b(stok|stock|persediaan|katalog)\b/i.test(q);
  if (isStokTopic && !q.includes('menipis') && !q.includes('habis') && !q.includes('aman')) {
    const isGeneralStok = /^(stok|stock|cek stok|cek stock|sisa stok|stok barang|stok produk|persediaan|daftar stok)[\?\.\!]?$/i.test(q)
      || (q.split(' ').length <= 3);
    if (isGeneralStok) {
      return {
        lacksContext: true,
        topic: 'stok',
        clarificationQuestion: 'Apakah Anda ingin melihat **produk dengan stok menipis (< 10 unit)**, mengecek ketersediaan untuk **nama produk tertentu**, atau seluruh katalog produk?'
      };
    }
  }

  // 4. Piutang / Tagihan without customer name or ID
  const isPiutangTopic = /\b(piutang|tagihan|belum lunas|hutang)\b/i.test(q);
  if (isPiutangTopic && !hasSpecificId) {
    const isGeneralPiutang = /^(piutang|tagihan|cek piutang|cek tagihan|belum lunas|daftar piutang|total piutang|sisa tagihan)[\?\.\!]?$/i.test(q)
      || (q.split(' ').length <= 3 && !q.includes('pt ') && !q.includes('cv '));
    if (isGeneralPiutang) {
      return {
        lacksContext: true,
        topic: 'piutang',
        clarificationQuestion: 'Apakah Anda ingin melihat **total seluruh tagihan yang belum lunas**, atau tagihan untuk **pelanggan tertentu**?'
      };
    }
  }

  // 5. Laporan without topic or period
  const isLaporanTopic = /^(laporan|rekap|ringkasan|summary|kinerja)[\?\.\!]?$/i.test(q);
  if (isLaporanTopic) {
    return {
      lacksContext: true,
      topic: 'laporan',
      clarificationQuestion: 'Laporan apa yang ingin Anda periksa? Apakah **omzet penjualan bulanan**, **stok produk**, **piutang pelanggan**, atau **performa tim sales**?'
    };
  }

  return null;
};

// Conversational Openings & Human Greetings Detector
// Ensures flexible, natural, warm human-like chat when user sends "saya mau tanya", "mau nanya nih", "halo", etc.
export const isConversationalGreeting = (query: string): boolean => {
  const q = query.trim().toLowerCase().replace(/[?!.,;:~]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return true;

  // If query contains specific IDs, transaction numbers, or company entities, it's NOT a generic greeting
  const hasSpecificContext = /trx[-_ ]?\d+|inv[-_ ]?\d+|po[-_ ]?\d+|agustus|september|oktober|november|desember|januari|februari|maret|april|mei|juni|juli|2024|2025|2026|rp\b|indofood|mayora/i.test(q);
  if (hasSpecificContext) return false;

  const hasBusinessDataTerm = /\b(omset|omzet|transaksi|stok|stock|piutang|tagihan|laporan|produk|customer|pelanggan|karyawan|supplier|vendor|po|invoice|harga|gaji|penjualan)\b/i.test(q);
  if (hasBusinessDataTerm) return false;

  const exactGreetings = [
    'halo', 'hai', 'hi', 'hello', 'hei', 'hey', 'pagi', 'siang', 'sore', 'malam',
    'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam',
    'tes', 'test', 'testing', 'ping', 'p',
    'apa kabar', 'gimana kabar', 'kabarnya gimana',
    'siapa kamu', 'kamu siapa', 'kamu ini siapa', 'kamu aplikasi apa', 'fitur apa saja',
    'terima kasih', 'makasih', 'thanks', 'thank you', 'makasih ya', 'terima kasih ya',
    'oke', 'ok', 'siap', 'sip', 'mantap', 'keren', 'baik', 'baiklah',
    'permisi', 'punten', 'assalamualaikum', "assalamu'alaikum", 'salam'
  ];

  if (exactGreetings.includes(q)) {
    return true;
  }

  // Common Indonesian conversational question openings
  const openingPhrases = [
    'saya mau tanya', 'saya mau nanya', 'saya mau nanya nih', 'saya mau tanya nih',
    'saya mau tanya dong', 'saya mau nanya dong', 'mau tanya', 'mau nanya',
    'mau tanya nih', 'mau nanya nih', 'mau tanya dong', 'mau nanya dong',
    'tanya dong', 'nanya dong', 'boleh tanya', 'boleh nanya', 'boleh tanya gak',
    'boleh nanya gak', 'bisa tanya', 'bisa nanya', 'bisa tanya gak', 'bisa nanya gak',
    'halo mau tanya', 'halo mau nanya', 'hai mau tanya', 'hai mau nanya',
    'halo saya mau tanya', 'halo saya mau nanya', 'ada yang mau saya tanyakan',
    'ada yang mau ditanyakan', 'ada yang ingin saya tanyakan', 'bisa bantu',
    'bisa bantu saya', 'bisa tolong', 'tolong bantu', 'bantu saya', 'bisa minta tolong',
    'mo nanya', 'mo tanya', 'mo tanya nih', 'mo nanya nih', 'mau tanya min', 'mau nanya min',
    'halo min', 'halo admin', 'halo bot', 'halo ai', 'hai ai'
  ];

  if (openingPhrases.some(op => q === op || q.startsWith(op + ' ') || q.endsWith(' ' + op))) {
    return true;
  }

  // Any short statement (<= 6 words) talking about asking without data terms
  const words = q.split(' ');
  if (words.length <= 6 && (q.includes('tanya') || q.includes('nanya') || q.includes('halo') || q.includes('hai'))) {
    return true;
  }

  return false;
};

// Generates warm, human-like, flexible AI responses for conversational openings
export const getConversationalGreetingResponse = (userName: string, query: string): string => {
  const q = query.trim().toLowerCase();

  if (/terima kasih|makasih|thanks/i.test(q)) {
    return `Sama-sama, **${userName}**! Senang bisa membantu Anda. Jika ada hal lain yang ingin dicek kembali, panggil saya kapan saja ya! 😊`;
  }

  if (/^(oke|ok|siap|sip|mantap|keren|baik|baiklah)$/i.test(q)) {
    return `Siap, **${userName}**! Ada data lain yang ingin kita periksa bersama? Silakan tanyakan kapan saja! 👍`;
  }

  if (/apa kabar|gimana kabar/i.test(q)) {
    return `Kabar baik, **${userName}**! Terima kasih sudah menyapa. Bagaimana dengan Anda? Ada data atau informasi yang bisa saya bantu carikan hari ini? 😊`;
  }

  if (/siapa kamu|kamu siapa/i.test(q)) {
    return `Halo **${userName}**! Saya adalah asisten virtual cerdas untuk platform CRM & ERP MyPanca (PT. Panca Prima Wijaya). Saya siap membantu Anda mengecek transaksi, omzet, stok produk, tagihan, hingga rekap data tim. Silakan tanyakan apa saja yang Anda butuhkan! 😊`;
  }

  return `Halo **${userName}**! 👋 Silakan, tanyakan apa saja yang Anda butuhkan, saya siap membantu! 😊\n\nMisalnya, Anda bisa menanyakan:\n- 📊 Laporan omzet & performa penjualan\n- 🔍 Status transaksi nomor tertentu (seperti TRX-..)\n- 📦 Ketersediaan stok produk\n- 💰 Tagihan piutang pelanggan\n\nAda yang ingin kita periksa sekarang?`;
};

// Unified LLM Calling Function with Strict Data Reading Rules
export const queryPancaAI = async (
  userQuery: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  ctx: PancaAIContext
): Promise<string> => {
  const userName = ctx.currentUser?.nama || 'Bapak/Ibu';

  // 1. Instant Check: Conversational greeting or opening statement
  if (isConversationalGreeting(userQuery)) {
    return getConversationalGreetingResponse(userName, userQuery);
  }

  // 2. Instant Check: If query lacks context, ask for clarification first!
  const clarification = detectLackingContext(userQuery, history);
  if (clarification) {
    return `Halo **${userName}**, ${clarification.clarificationQuestion}`;
  }

  const dataDigest = generatePancaDataDigest(ctx, userQuery);

  const systemPrompt = `Anda adalah "Panca AI Assistant", asisten kecerdasan buatan terpadu dan analis data bisnis untuk PT. Panca Prima Wijaya (MyPanca CRM & ERP).
Nama Pengguna: ${userName}
Peran Pengguna: ${ctx.currentUser?.role || 'Staff'}
Perusahaan Aktif: ${ctx.activeCompany?.nama || 'PT. PANCA PRIMA WIJAYA'}

================================================================================
ATURAN WAJIB & PROTOKOL PERCAKAPAN BISNIS (INTERACTIVE & CONTEXT-AWARE AI):
================================================================================

1. KLARIFIKASI KONTEKS DAHULU JIKA PERTANYAAN TERLALU UMUM (DILARANG LANGSUNG TEBAK/DUMP DATA):
   - JIKA pengguna bertanya hal umum TANPA menyebutkan periode waktu (bulan/tahun) atau nama objek spesifik:
     * Contoh Kasus: Pengguna hanya bertanya "omset", "berapa omset", "penjualan", "laporan penjualan", "total omzet":
       -> DILARANG LANGSUNG MENJAWAB DENGAN ANGKA TEBAKAN ATAU LANGSUNG MENGIRIMKAN TABEL DATA!
       -> TANYAKAN TERLEBIH DAHULU KONTEKS DETAILNYA DENGAN RAMAH & SPESIFIK:
          "Halo **${userName}**, Anda ingin memeriksa omzet untuk periode bulan atau tahun apa? (Misalnya: **Agustus 2026**, **September 2026**, **bulan ini**, atau **sepanjang tahun 2026**?)"
     * Contoh Kasus: Pengguna hanya mengetik "transaksi" atau "cek transaksi":
       -> TANYAKAN DULU:
          "Baik **${userName}**, Anda ingin memeriksa transaksi dengan nomor spesifik (seperti **TRX-70**), transaksi untuk **bulan tertentu**, atau status pesanan tertentu (selesai/pengiriman)?"
     * Contoh Kasus: Pengguna hanya mengetik "stok":
       -> TANYAKAN DULU:
          "Baik **${userName}**, apakah Anda ingin melihat **produk dengan stok menipis (< 10 unit)**, atau mengecek stok untuk **nama barang tertentu**?"
     * Contoh Kasus: Pengguna hanya mengetik "piutang" atau "tagihan":
       -> TANYAKAN DULU:
          "Baik **${userName}**, apakah Anda ingin melihat **total seluruh tagihan belum lunas**, atau tagihan untuk **pelanggan tertentu**?"

2. KEMAMPUAN PENGETAHUAN DATA DETAIL & TABEL LENGKAP (SETARA VERSI DESKTOP):
   - JIKA PENGGUNA MEMINTA DETAIL, RINCIAN, ATAU MENJAWAB KONFIRMASI (Contoh: "ya", "iya", "tampilkan", "rincian", "rinciannya", "breakdown", "tabel", "jelaskan", "semua transaksi", "siapa saja"):
     * ANDA WAJIB LANGSUNG MENYAJIKAN DATA LENGKAP SECARA DETAIL & TERSTRUKTUR PERSIS SEPERTI KEMAMPUAN VERSI DESKTOP!
     * SAJIKAN TABEL MARKDOWN YANG RAPI DAN LENGKAP (Kolom: No. Transaksi / Dokumen, Tanggal, Nama Pelanggan, Item Barang, Total Nilai Rp, Status Pesanan, Status Pembayaran, Sales Rep).
     * BERIKAN ANALISIS MENDALAM: total nominal, perbandingan transaksi, rincian barang, dan persentase lunas/belum lunas!
     * DILARANG KERAS hanya memberikan jawaban singkat satu kalimat atau menahan data jika pengguna sudah meminta detail atau mengonfirmasi!
   - JIKA PERTANYAAN AWAL PENGGUNA SUDAH SPESIFIK:
     (Contoh: "omset bulan agustus 2026", "transaksi trx-70", "stok menipis", "piutang pt indofood", "daftar penawaran"):
     * Berikan ringkasan angka kunci di paragraf pertama, LALU LANGSUNG SAJIKAN TABEL RINCIAN LENGKAPNYA di bawahnya tanpa perlu ditanya ulang.
   - JIKA PERTANYAAN AWAL TERLALU UMUM (Hanya "omset" atau "transaksi" tanpa bulan/tahun):
     * Tanyakan periode atau nama objek yang ingin dicek terlebih dahulu secara ramah.

3. RIWAYAT PERCAKAPAN (MULTI-TURN MEMORY):
   - Sambungkan konteks percakapan dengan pesan-pesan sebelumnya. Jika Anda baru saja bertanya: "ingin cek omzet bulan apa?" dan pengguna menjawab: "Agustus 2026", Anda harus langsung memahami bahwa itu adalah jawaban untuk omzet bulan Agustus 2026 dan menyajikan omzet serta rincian lengkapnya!
   - Jika Anda baru saja bertanya: "Apakah Anda ingin saya tampilkan rincian detail transaksinya?" dan pengguna menjawab "ya" atau "tampilkan", Anda WAJIB langsung menyajikan tabel rincian transaksi bulan/objek yang sedang dibicarakan!

4. WAJIB BACA & ANALISIS DATA SISTEM SECARA TELITI:
   - Sebelum menyusun jawaban, Anda WAJIB memeriksa seluruh bagian "DATA REAL-TIME SISTEM DARI SEMUA MENU" yang dilampirkan di bawah.
   - Jawaban Anda WAJIB didasarkan pada data faktual tersebut, bukan mengarang atau membuat asumsi kosong.

5. DILARANG MENYATAKAN TIDAK MEMILIKI AKSES KE DATABASE:
   - Seluruh database real-time sistem MyPanca SUDAH DILAMPIRKAN SECARA LENGKAP di bawah ini. Anda MEMILIKI akses penuh ke data tersebut.
   - JANGAN PERNAH mengatakan "saya tidak memiliki akses ke database", "saya hanya model bahasa", atau "silakan cek sendiri di menu". Kutip dan sajikan langsung data real tersebut!

6. SIKAP CUSTOMER SERVICE KETIKA MENYAPA / KASUAL:
   - Jika pengguna hanya menyapa (misal: "halo", "hi", "selamat pagi", "siapa kamu", "terima kasih"), berikan sambutan ramah, santun, dan manusiawi. Sapa nama pengguna (${userName}), tanyakan bantuan yang dibutuhkan, dan berikan contoh pertanyaan. JANGAN menumpahkan seluruh tabel data sistem jika hanya disapa halo!

7. PROTOKOL BACA & DETEKSI SPESIFIKASI PRODUK:
   - Jika pengguna bertanya mengenai spesifikasi produk (fungsi utama, aplikasi utama, ukuran dimensi, berat, atau spesifikasi detail):
     * Periksa data spesifikasi produk pada [KATALOG & SPESIFIKASI PRODUK LENGKAP].
     * Jika data spesifikasi produk TERISI, sajikan informasi spesifikasi lengkap secara rapi.
     * JIKA DATA SPESIFIKASI PRODUK TERSEBUT BELUM DIISI (bernilai 'Belum diisi' atau kosong):
       1. Jelaskan secara ramah & jujur: "Data spesifikasi detail untuk produk **[Nama Produk]** belum terisi di database MyPanca."
       2. Tanyakan langsung: "**Apakah Anda mau mengisi data spesifikasi produk ini sekarang?**"

8. PROTOKOL KHUSUS PERTANYAAN PIUTANG / TAGIHAN / MENUNGGAK / TERTUNGGAK:
   - Jika pengguna bertanya umum: "apa ada yang menunggak?", "siapa yang menunggak?", "apakah ada tagihan belum lunas?":
     1. Tampilkan total nominal piutang tertunggak (misal: **Rp X**) dan total jumlah tagihan belum lunas (misal: **Y tagihan**).
     2. Tampilkan jumlah pelanggan yang menunggak serta sorotan 1-2 nama pelanggan utama.
     3. AKHIRI BERSAMA PERTANYAAN PROAKTIF:
        "**Apakah Anda ingin saya tampilkan rincian daftar lengkap transaksinya?**"
   - BEGITU PENGGUNA MEMINTA ATAU MENGONFIRMASI ("ya", "tampilkan", "rincian", "siapa saja"):
     -> LANGSUNG SAJIKAN TABEL RINCIAN PIUTANG LENGKAP (No. Invoice, Nama Pelanggan, Tanggal, Total Tagihan, Sisa Piutang, Sales Rep Penanggung Jawab) secara detail!

9. LARANGAN KERAS MEMOTONG JAWABAN:
   - JAWABAN ANDA HARUS LENGKAP DAN DITULIS SAMPAI SELESAI SECARA UTUH KESELURUHAN DARI AWAL HINGGA TERAKHIR.
   - DILARANG MEMOTONG TABEL, MEMOTONG KALIMAT DI TENGAH JALAN, ATAU BERHENTI SEBELUM SELURUH DATA TERPAPAR RAPI.

${dataDigest}
`;

  // Build payload messages with multi-turn history to preserve clarification back-and-forth
  const payloadMessages: any[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Keep up to 6 turns of history for multi-turn conversational context
  const recentHistory = history.slice(-6).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }));

  // Call Google Gemini API with multi-key auto-rolling
  return await callGeminiWithKeyRotation({
    systemPrompt,
    messages: recentHistory,
    userPrompt: userQuery,
    preferredModel: 'gemini-3.5-flash',
    temperature: 0.2,
    maxTokens: 8192
  });
};

// Comprehensive Local Dynamic Fallback that accurately reads real data
export const generateSmartDynamicFallback = (query: string, ctx: PancaAIContext): string => {
  const lower = query.toLowerCase();
  const trimmed = lower.trim().replace(/[!\?\.,]/g, '');
  const userName = ctx.currentUser?.nama || 'Bapak/Ibu';
  const agg = compileSystemAggregations(ctx, query);

  // Greetings check
  const greetingList = ['halo', 'hello', 'hi', 'hai', 'pagi', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam', 'siang', 'sore', 'malam', 'ping', 'p', "assalamu'alaikum", 'assalamualaikum', 'salam'];
  if (greetingList.includes(trimmed) || trimmed === 'halo ai' || trimmed === 'hi ai') {
    return `Halo, **${userName}**! 👋 Selamat ${new Date().getHours() < 12 ? 'pagi' : new Date().getHours() < 17 ? 'siang' : 'malam'}.\n\nSaya **Panca AI Assistant**, asisten virtual terhubung database PT. Panca Prima Wijaya.\n\nAda data atau informasi bisnis apa yang ingin saya bantu carikan hari ini? Misalnya:\n- 🔍 *"Cek transaksi TRX-70"* atau *"pembelian PT ABC"*\n- 📊 *"Berapa total omzet bulan ini?"*\n- 📦 *"Cek produk yang stoknya menipis"*\n- 💰 *"Tampilkan invoice yang belum lunas"*\n\nSilakan tanyakan apa saja! 😊`;
  }

  // Search by transaction code (e.g. TRX-70, QUO, PO)
  const codeMatch = lower.replace(/[^a-z0-9]/g, '');
  if (codeMatch.length >= 2) {
    const matched = agg.compTransactions.filter(t => {
      const code = (t.noTrx || t.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return code.includes(codeMatch);
    });

    if (matched.length > 0 && (lower.includes('trx') || lower.includes('quo') || lower.includes('inv') || matched.length <= 5)) {
      let res = `### 🧾 Detail Transaksi Cocok "${query}":\n\n`;
      res += `| No. Transaksi | Tanggal | Pelanggan | Nominal | Status Pesanan | Pembayaran | Sales |\n|---|---|---|---|---|---|---|\n`;
      matched.forEach(t => {
        const amt = getTransactionAmount(t);
        res += `| **${t.noTrx || t.id}** | ${t.tanggal || '-'} | **${t.customerName || t.customer || '-'}** | **Rp ${amt.toLocaleString('id-ID')}** | ${t.status || 'Selesai'} | ${t.paymentStatus || 'Lunas'} | ${t.sales || t.salesName || '-'} |\n`;
      });
      return res;
    }
  }

  // Search by Customer / Contact Name
  const matchedCustomers = agg.compCustomers.filter(c => {
    const name = `${c.nama || ''} ${c.perusahaan || ''}`.toLowerCase();
    return lower.includes(c.nama.toLowerCase()) || name.split(/\s+/).some(part => part.length > 3 && lower.includes(part));
  });

  if (matchedCustomers.length > 0) {
    const c = matchedCustomers[0];
    const cTrx = agg.compTransactions.filter(t => (t.customerName || t.customer || '').toLowerCase().includes(c.nama.toLowerCase()));
    let res = `### 👤 Data Pelanggan: **${c.nama}**\n\n`;
    res += `- **Perusahaan**: ${c.perusahaan || '-'}\n`;
    res += `- **PIC / Kontak**: ${c.pic || '-'} (${c.whatsapp || c.phone || '-'})\n`;
    res += `- **Kota / Alamat**: ${c.kota || '-'} - ${c.alamat || '-'}\n`;
    res += `- **Sales Rep**: ${c.sales || '-'}\n`;
    res += `- **Total Riwayat Transaksi**: ${cTrx.length} transaksi tercatat\n\n`;

    if (cTrx.length > 0) {
      res += `**Daftar Transaksi ${c.nama}:**\n`;
      res += `| No. Transaksi | Tanggal | Nominal | Status | Pembayaran |\n|---|---|---|---|---|\n`;
      cTrx.slice(0, 5).forEach(t => {
        res += `| **${t.noTrx || t.id}** | ${t.tanggal || '-'} | Rp ${getTransactionAmount(t).toLocaleString('id-ID')} | ${t.status} | ${t.paymentStatus} |\n`;
      });
    }
    return res;
  }

  // Stock query
  if (lower.includes('stok') || lower.includes('produk') || lower.includes('menipis')) {
    let res = `### 📦 Informasi Stok Produk:\n\n`;
    res += `- Total Produk: **${agg.compProducts.length} SKU**\n`;
    res += `- Produk Perlu Restock (< 10 unit): **${agg.lowStockProducts.length} SKU**\n\n`;

    if (agg.lowStockProducts.length > 0) {
      res += `| No | Nama Produk | Sisa Stok | Min. Stok | Harga Jual |\n|---|---|---|---|---|\n`;
      agg.lowStockProducts.slice(0, 10).forEach((p, i) => {
        res += `| ${i + 1} | **${p.nama}** | <span style="color:red; font-weight:bold;">${p.stok || 0} ${p.satuan || 'unit'}</span> | ${p.minStok || 10} | Rp ${(p.hargaJual || 0).toLocaleString('id-ID')} |\n`;
      });
    } else {
      res += `✅ Seluruh produk berada dalam status stok aman.\n`;
    }
    return res;
  }

  // Omzet & Sales query
  if (lower.includes('omzet') || lower.includes('penjualan') || lower.includes('laporan')) {
    let res = `### 📊 Rekap Omzet & Penjualan Bisnis:\n\n`;
    res += `- **Total Transaksi Terdaftar**: ${agg.compTransactions.length} transaksi\n`;
    res += `- **Total Omzet Real (Selesai)**: **Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')}**\n`;
    res += `- **Sisa Piutang Berjalan**: **Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')}** (${agg.unpaidInvoicesList.length} tagihan)\n\n`;
    res += `**Performa Sales:**\n`;
    Object.entries(agg.salesPerformance).forEach(([rep, d]) => {
      res += `- Sales **${rep}**: ${d.count} transaksi deals (Total: **Rp ${d.omzet.toLocaleString('id-ID')}**)\n`;
    });
    return res;
  }

  // Piutang query
  if (lower.includes('piutang') || lower.includes('tagihan') || lower.includes('belum lunas')) {
    let res = `### 💰 Status Piutang & Tagihan Belum Lunas:\n\n`;
    res += `- Total Piutang Belum Terbayar: **Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')}**\n`;
    res += `- Jumlah Invoice Belum Lunas: **${agg.unpaidInvoicesList.length} tagihan**\n\n`;
    if (agg.unpaidInvoicesList.length > 0) {
      res += `| No. Invoice | Pelanggan | Tanggal | Total Nilai | Sisa Tagihan |\n|---|---|---|---|---|\n`;
      agg.unpaidInvoicesList.slice(0, 10).forEach(u => {
        res += `| **${u.noTrx}** | **${u.customer}** | ${u.tanggal} | Rp ${u.total.toLocaleString('id-ID')} | **Rp ${u.sisa.toLocaleString('id-ID')}** |\n`;
      });
    }
    return res;
  }

  // Default response with context summary
  return `### 📋 Data Sistem MyPanca yang Terbaca:\n\n` +
    `- **Pelanggan Terdaftar**: ${agg.compCustomers.length} kontak\n` +
    `- **Total Transaksi**: ${agg.compTransactions.length} transaksi tercatat\n` +
    `- **Katalog Produk**: ${agg.compProducts.length} SKU (Stok menipis: ${agg.lowStockProducts.length} SKU)\n` +
    `- **Sisa Piutang**: Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.unpaidInvoicesList.length} invoice)\n\n` +
    `Mohon tanyakan data spesifik yang ingin diperiksa, seperti: nama pelanggan, nomor transaksi (*TRX-...*), stok produk, atau laporan omzet.`;
};
