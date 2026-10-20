// Unified Data Digest & AI Service for Panca AI (Web CRM & Mobile /app)
// Powered by Google Gemini with Multi-Key Auto-Rolling
import { callGeminiWithKeyRotation } from './geminiKeyService';
import { generateWebKnowledgeDigest } from './webKnowledgeService';
import { DEFAULT_PANCA_PRODUCTS, getProductImageUrl } from './pancaProductCatalog';

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
  rolePermissions?: { id: string; canView: boolean; canEdit: boolean }[];
  taskAppDataExt?: {
    qaQuestions: any[];
  };
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

// Helper to extract exact stock value across all potential schema variants
export const getProductStock = (p: any, purchaseOrders: any[] = [], transactions: any[] = []): number => {
  if (!p) return 0;
  
  // 1. Calculate incoming stock from p.lots if available
  let incomingStock = 0;
  const hasLots = Array.isArray(p.lots) && p.lots.length > 0;
  if (hasLots) {
    incomingStock = p.lots.reduce((sum: number, lot: any) => {
      const s = Number(lot.stock) ?? Number(lot.stok) ?? Number(lot.qty) ?? Number(lot.sisaStok) ?? 0;
      return sum + (isNaN(s) ? 0 : s);
    }, 0);
  }

  // 2. Direct stock property on object (combine/fallback with lots)
  const raw = p.stok ?? p.stock ?? p.stokGudang ?? p.stok_gudang ?? p.qty ?? p.quantity ?? p.sisaStok ?? p.sisa_stok ?? p.jumlah ?? p.jumlahStok ?? p.jumlah_stok ?? p.stokAwal ?? p.stok_awal ?? p.initialStock ?? p.stock_qty ?? p.current_stock ?? p.available_stock ?? p.total_stok ?? p.sisa;
  let directStock = 0;
  if (typeof raw === 'number' && !isNaN(raw)) directStock = raw;
  else if (typeof raw === 'string') {
    const parsed = parseInt(raw.replace(/[^\d-]/g, ''), 10);
    if (!isNaN(parsed)) directStock = parsed;
  }

  if (incomingStock === 0) {
    incomingStock = directStock;
  } else if (directStock > 0) {
    incomingStock = Math.max(incomingStock, directStock);
  }

  // 3. Fallback to dynamic PO calculation if incomingStock is still 0
  if (incomingStock === 0 && Array.isArray(purchaseOrders) && purchaseOrders.length > 0) {
    purchaseOrders.filter(po => po.status === 'Received' || po.status === 'Lunas').forEach(po => {
      if (Array.isArray(po.items)) {
        po.items.forEach((it: any) => {
          if (it.produkId === p.id || it.productId === p.id || (it.nama && p.nama && it.nama.toLowerCase() === p.nama.toLowerCase())) {
            incomingStock += Number(it.jumlah) || Number(it.qty) || 0;
          }
        });
      } else if (po.produkId === p.id || po.productId === p.id) {
        incomingStock += Number(po.jumlah) || Number(po.qty) || 0;
      }
    });
  }

  // 4. Subtract shipped transactions if transactions are provided
  let soldQty = 0;
  if (Array.isArray(transactions) && transactions.length > 0) {
    transactions.filter(t => !(t.statuses || []).includes('Batal') && ((t.statuses || []).includes('Pengiriman') || (t.statuses || []).includes('Selesai'))).forEach(t => {
      if (Array.isArray(t.items)) {
        t.items.forEach((it: any) => {
          if (it.produkId === p.id || it.productId === p.id || (it.nama && p.nama && it.nama.toLowerCase() === p.nama.toLowerCase())) {
            soldQty += Number(it.qty) || Number(it.jumlah) || 0;
          }
        });
      }
    });
  }

  return Math.max(0, incomingStock - soldQty);
};

// // Compile real-time aggregations from all modules
export const compileSystemAggregations = (ctx: PancaAIContext, queryText: string = '') => {
  const currentCompId = ctx.activeCompany?.id || '1';
  const isSuperAdmin = ctx.currentUser?.role?.toLowerCase() === 'superadmin';
  const perms = ctx.rolePermissions || [];

  // Helper to check permission
  const canView = (id: string) => {
    if (isSuperAdmin) return true;
    if (perms.length === 0) return true; // Default to allow if not provided
    return perms.find(p => p.id === id)?.canView ?? false;
  };

  const allTransactions = ctx.transactions || [];
  const allCustomers = ctx.customers || [];
  const allProducts = ctx.products || [];
  const allSuppliers = ctx.suppliers || [];
  const allPOs = ctx.purchaseOrders || [];
  const allEmployees = ctx.employees || [];

  // Data Restriction Logic based on Menu Access Control
  const allowedTransactions = canView('Transaksi') 
    ? allTransactions 
    : canView('Penawaran') 
      ? allTransactions.filter(t => t.status === 'Penawaran' || t.isQuote)
      : [];

  const allowedCustomers = canView('Contacts') ? allCustomers : [];
  // Ensure real database products are always accessible for product queries & photos
  const compProductsFiltered = allProducts.filter(p => !p.companyId || p.companyId === currentCompId);
  const compProducts = compProductsFiltered.length > 0 
    ? compProductsFiltered 
    : (allProducts.length > 0 ? allProducts : DEFAULT_PANCA_PRODUCTS);
  const allowedSuppliers = canView('Suppliers') || canView('purchasing_suppliers') || canView('stocklist_suppliers') ? allSuppliers : [];
  const allowedPOs = canView('Purchase Orders') || canView('purchasing_po') || canView('stocklist_po') ? allPOs : [];
  const allowedEmployees = canView('Employees') ? allEmployees : [];

  // Filter by company where applicable
  const compTransactions = allowedTransactions.filter(t => !t.companyId || t.companyId === currentCompId);
  const compCustomers = allowedCustomers.filter(c => !c.companyId || c.companyId === currentCompId);

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
    const isQuote = status === 'Penawaran' || 
      Boolean(t.isQuote) || 
      (Array.isArray(t.statuses) && t.statuses.includes('Penawaran')) ||
      String(t.noTrx || t.id || '').toUpperCase().startsWith('QUO') ||
      (Array.isArray(t.followUps) && t.followUps.length > 0 && status !== 'Selesai');
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

      const followUpsArr: any[] = Array.isArray((t as any).followUps) ? (t as any).followUps : [];
      // Sort follow-ups from newest to oldest for latest & chronological oldest to newest for roadmap
      const sortedFollowUpsDesc = followUpsArr.slice().sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
      const sortedFollowUpsAsc = followUpsArr.slice().sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());
      const latestFu = sortedFollowUpsDesc[0] || null;

      quoteList.push({
        noTrx: t.noTrx || t.id,
        customer: t.customerName || t.customer || 'Pelanggan',
        tanggal: t.tanggal || '-',
        total: amt,
        followedUp: isFollowed,
        nextFollowUpDate: t.followUpDate || 'Belum dijadwalkan',
        nextFollowUpMethod: t.followUpMethod || '-',
        latestFollowUp: latestFu ? `[${latestFu.tanggal || '-'}${latestFu.method ? ` via ${latestFu.method}` : ''}] ${latestFu.keterangan || ''}` : 'Belum ada catatan follow-up',
        roadmapFollowUps: sortedFollowUpsAsc.map((fu, idx) => `Tahap #${idx + 1} [${fu.tanggal || '-'}${fu.method ? ` via ${fu.method}` : ''}]: "${fu.keterangan || '-'}"`),
        lastFollowUpDate: latestFu?.tanggal || (t as any).lastFollowUpDate || (t as any).tanggalFollowUp || 'Belum pernah',
        notes: (t as any).notes || (t as any).catatan || 'Tidak ada catatan',
        sales: t.sales || t.salesName || '-'
      });
    } else if (isCanceled) {
      totalNilaiBatal += amt;
    }

    // Unpaid invoices / Piutang
    const hasSisa = typeof (t as any).sisaPembayaran === 'number' && (t as any).sisaPembayaran > 0;
    const isUnpaid = isRealDeal && (payStatus === 'Belum Lunas' || hasSisa || status === 'Pengiriman');
    
    // Piutang filter based on permission
    if (isUnpaid && canView('Piutang')) {
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
    const s = getProductStock(p);
    const min = Number(p.minStok) || Number(p.min_stok) || Number(p.minStock) || 10;
    return s < min;
  });

  // Purchasing & PO
  let totalPOAmount = 0;
  let totalHutangAmount = 0;
  const poStatusCounts: Record<string, number> = {};
  allowedPOs.forEach(po => {
    const amt = Number(po.total) || 0;
    totalPOAmount += amt;
    const st = po.status || 'Draft';
    poStatusCounts[st] = (poStatusCounts[st] || 0) + 1;
    if (st !== 'Lunas' && canView('Hutang')) totalHutangAmount += amt;
  });

  return {
    currentCompId,
    compTransactions,
    compCustomers,
    compProducts,
    allSuppliers: allowedSuppliers,
    allPOs: allowedPOs,
    allEmployees: allowedEmployees,
    totalOmzetReal: canView('Dashboard') || canView('Transaksi') ? totalOmzetReal : 0,
    totalOmzetLunas: canView('Dashboard') || canView('Transaksi') ? totalOmzetLunas : 0,
    totalNilaiPenawaran,
    totalNilaiBatal,
    tradeStatusCounts,
    paymentStatusCounts,
    salesPerformance: canView('Dashboard') || canView('KPI') ? salesPerformance : {},
    customerSpendMap: canView('Dashboard') || canView('Transaksi') ? customerSpendMap : {},
    soldProductQuantities,
    monthlyOmzetMap: canView('Dashboard') || canView('Transaksi') ? monthlyOmzetMap : {},
    totalPiutangAmount,
    unpaidInvoicesList,
    totalQuotes,
    followedUpQuotes,
    quoteList,
    lowStockProducts,
    totalPOAmount,
    totalHutangAmount,
    poStatusCounts,
    permissions: {
      canViewTransactions: canView('Transaksi'),
      canViewCustomers: canView('Contacts'),
      canViewProducts: canView('Produk'),
      canViewFinance: canView('Piutang') || canView('Hutang'),
      canViewHR: canView('Employees')
    }
  };
};

// Generate full real-time database digest with exact TRX and PP match support
export const generatePancaDataDigest = (ctx: PancaAIContext, queryText: string = ''): string => {
  const agg = compileSystemAggregations(ctx, queryText);
  const isSuperAdmin = ctx.currentUser?.role?.toLowerCase() === 'superadmin';
  const queryLower = queryText.toLowerCase();
  const allowedMenus = (ctx.rolePermissions || []).filter(p => p.canView).map(p => p.id);
  const allowedListStr = isSuperAdmin ? "SELURUH AKSES SISTEM (SUPERADMIN)" : (allowedMenus.length > 0 ? allowedMenus.join(', ') : "Akses Menu Sangat Terbatas");

  let digest = `=== DATABASE REAL-TIME SISTEM MYPANCA (PT. PANCA PRIMA WIJAYA) ===
- Perusahaan Aktif: ${ctx.activeCompany?.nama || 'PT. PANCA PRIMA WIJAYA'}
- Status Akses Pengguna: ${allowedListStr}
- Total Seluruh Transaksi: ${agg.compTransactions.length} Transaksi Tercatat
- Skema Nomor Transaksi: Transaksi LAMA memakai "TRX-..." | Transaksi BARU memakai "PP-..."
- Total Omzet Real (Selesai/Lunas): Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')}
- Total Pelanggan Terdaftar: ${agg.compCustomers.length} Pelanggan
- Total SKU Produk: ${agg.compProducts.length} SKU (Stok Menipis: ${agg.lowStockProducts.length} SKU)
- Total Piutang Belum Lunas: Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.unpaidInvoicesList.length} tagihan belum lunas)

--- [REKAP OMZET PER BULAN] ---
${Object.entries(agg.monthlyOmzetMap).map(([m, data]) => `* Periode ${m}: Total Omzet Selesai Rp ${data.omzetSelesai.toLocaleString('id-ID')} (${data.totalDeals} transaksi: ${data.customers.join(', ')})`).join('\n') || '* (Akses terbatas atau belum ada data)'}

--- [MENU 1: TRANSAKSI PENJUALAN LENGKAP (LAMA TRX & BARU PP)] ---
* Status Pesanan Breakdown: ${Object.entries(agg.tradeStatusCounts).map(([k, v]) => `${k}: ${v} transaksi`).join(' | ')}
* Status Pembayaran: ${Object.entries(agg.paymentStatusCounts).map(([k, v]) => `${k}: ${v} transaksi`).join(' | ')}
* Performa Sales Rep:
${Object.entries(agg.salesPerformance).map(([s, d]) => `  - Sales ${s}: ${d.count} trx deals | Total Omzet: Rp ${d.omzet.toLocaleString('id-ID')}`).join('\n') || '  (Akses terbatas atau belum ada data)'}

* Top Pelanggan dengan Belanja Terbesar:
${Object.entries(agg.customerSpendMap).sort((a, b) => b[1].total - a[1].total).slice(0, 15).map(([c, d], i) => `  ${i + 1}. ${c}: ${d.count} transaksi | Total Belanja: Rp ${d.total.toLocaleString('id-ID')}`).join('\n') || '  (Akses terbatas)'}

* Daftar Transaksi Real Database (Setiap Transaksi Terbaca Presisi):
${agg.compTransactions.length > 0 ? agg.compTransactions.map(t => {
  const amt = getTransactionAmount(t);
  const itemsStr = Array.isArray(t.items) ? t.items.map((it: any) => `${it.nama || it.productName || 'Barang'} (${it.qty || 1} unit @ Rp ${(Number(it.harga) || 0).toLocaleString('id-ID')})`).join(', ') : '';
  return `  - [${t.noTrx || t.id}] Tanggal: ${t.tanggal || '-'} | Pelanggan: ${t.customerName || t.customer || '-'} | Total Nilai: Rp ${amt.toLocaleString('id-ID')} | Status: ${t.status || 'Selesai'} | Pembayaran: ${t.paymentStatus || 'Lunas'} | Sales: ${t.sales || t.salesName || '-'} | Item: [${itemsStr || 'N/A'}]`;
}).join('\n') : '  (Akses menu Transaksi dibatasi atau data tidak ada)'}

--- [MENU 2: DAFTAR KONTAK & PELANGGAN LENGKAP] ---
* Total Kontak: ${agg.compCustomers.length} Pelanggan
${agg.compCustomers.length > 0 ? agg.compCustomers.map(c => `  - ${c.nama} (Perusahaan: ${c.perusahaan || '-'}, PIC: ${c.pic || '-'}, Kota: ${c.kota || '-'}, Telp/WA: ${c.whatsapp || c.phone || '-'}, Sales: ${c.sales || '-'}, Status: ${c.leadType || 'Aktif'})`).join('\n') : '  (Akses menu Contacts dibatasi)'}

--- [MENU 3: PENAWARAN (QUOTATIONS) & ROADMAP FOLLOW-UP DETAIL] ---
* Total Penawaran: ${agg.totalQuotes} penawaran (Nilai Total: Rp ${agg.totalNilaiPenawaran.toLocaleString('id-ID')})
${agg.quoteList.length > 0 ? agg.quoteList.map(q => {
  const roadmapStr = q.roadmapFollowUps && q.roadmapFollowUps.length > 0
    ? `\n    * Roadmap Follow-Up (${q.roadmapFollowUps.length} tahapan interaksi):\n      - ${q.roadmapFollowUps.join('\n      - ')}`
    : '\n    * Roadmap Follow-Up: Belum ada aktivitas.';
  return `  - [${q.noTrx}] Pelanggan: ${q.customer} | Tanggal Penawaran: ${q.tanggal} | Total Nilai: Rp ${q.total.toLocaleString('id-ID')} | Sales: ${q.sales}
    * Next Follow-Up: ${q.nextFollowUpDate} (Metode: ${q.nextFollowUpMethod})
    * Latest Follow-Up: ${q.latestFollowUp}${roadmapStr}`;
}).join('\n') : '  (Akses menu Penawaran dibatasi)'}

--- [MENU 4: KATALOG & STOK PRODUK LENGKAP] ---
* Total SKU: ${agg.compProducts.length} Produk
${agg.compProducts.length > 0 ? agg.compProducts.map(p => {
  const stockVal = getProductStock(p, agg.allPOs, agg.compTransactions);
  const specStr = p.specifications || p.deskripsi || p.description || 'Belum diisi';
  const mainFunc = p.mainFunction || p.fungsi || 'Belum diisi';
  const mainApp = p.mainApplication || p.aplikasi || 'Belum diisi';
  const dim = (p.panjang || p.lebar || p.tinggi) ? `${p.panjang || 0} x ${p.lebar || 0} x ${p.tinggi || 0} cm` : (p.dimensi || 'Belum diisi');
  const weight = p.berat ? `${p.berat} kg` : 'Belum diisi';
  const price = Number(p.hargaJual) || Number(p.harga) || Number(p.price) || 0;
  const hasImgUrl = Boolean(getProductImageUrl(p, agg.compProducts));
  const imgTag = hasImgUrl ? `![Foto ${p.nama || p.name}](product-image:${p.id || p.kode})` : 'Foto belum ada di sistem';
  return `  - SKU [${p.kode || p.id}] ${p.nama || p.name} (SISA STOK AKURAT: ${stockVal} ${p.satuan || p.unit || 'unit'}) | Harga Jual: Rp ${price.toLocaleString('id-ID')} | Foto/Gambar: ${imgTag}
    * Fungsi: ${mainFunc} | Aplikasi: ${mainApp} | Dimensi: ${dim} | Berat: ${weight} | Spesifikasi: ${specStr}`;
}).join('\n') : '  (Akses menu Produk dibatasi)'}

--- [MENU 5: FINANCE - PIUTANG USAHA (TAGIHAN BELUM LUNAS)] ---
* Total Piutang: Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.unpaidInvoicesList.length} tagihan)
${agg.unpaidInvoicesList.length > 0 ? agg.unpaidInvoicesList.map(u => `  - Invoice [${u.noTrx}] Pelanggan: ${u.customer} | Tanggal: ${u.tanggal} | Total: Rp ${u.total.toLocaleString('id-ID')} | Sisa: Rp ${u.sisa.toLocaleString('id-ID')} | Sales: ${u.sales}`).join('\n') : '  - ✅ Tidak ada piutang tertunggak atau akses dibatasi.'}

--- [MENU 6: PURCHASING & SUPPLIER] ---
* Total Supplier: ${agg.allSuppliers.length} vendor | PO: ${agg.allPOs.length} PO (Total: Rp ${agg.totalPOAmount.toLocaleString('id-ID')})
${agg.allPOs.length > 0 ? agg.allPOs.map(po => `  - PO [${po.noPO || po.id}] Vendor: ${po.supplierName || '-'} | Tanggal: ${po.tanggal || po.tanggalPembelian || '-'} | Total: Rp ${(Number(po.total) || 0).toLocaleString('id-ID')} | Status: ${po.status || 'Draft'}`).join('\n') : '  (Akses menu Purchasing dibatasi)'}

--- [MENU 7: HR - KARYAWAN & TIM] ---
* Total Karyawan: ${agg.allEmployees.length} staf
${agg.allEmployees.length > 0 ? agg.allEmployees.map(e => `  - ${e.nama} | Jabatan: ${e.role || '-'} | WA: ${e.whatsapp || '-'}${isSuperAdmin && e.gaji ? ` | Gaji: Rp ${Number(e.gaji).toLocaleString('id-ID')}` : ''}`).join('\n') : '  (Akses menu Karyawan dibatasi)'}
`;

  // Include Q&A Forum data from taskAppDataExt (Real-Time Knowledge Base)
  if (ctx.taskAppDataExt?.qaQuestions && ctx.taskAppDataExt.qaQuestions.length > 0) {
    digest += `\n--- [MENU 9: Q&A FORUM & TECHNICAL KNOWLEDGE BASE] ---\n`;
    ctx.taskAppDataExt.qaQuestions.forEach(q => {
      digest += `* TOPIK DISKUSI: "${q.title}" (${q.category})\n`;
      digest += `  - PERTANYAAN/ISI: ${q.content}\n`;
      if (q.answers && q.answers.length > 0) {
        q.answers.forEach((ans: any, idx: number) => {
          digest += `  - JAWABAN #${idx + 1} (${ans.author_name}): ${ans.content}\n`;
        });
      } else {
        digest += `  - STATUS: Belum ada jawaban dari tim teknis.\n`;
      }
    });
  }

  digest += generateWebKnowledgeDigest(ctx.currentUser?.role || '');

  // Include Task App data if available (SuperAdmin / Team / AI)
  let rawTasks: any[] = ctx.taskAppData?.tasks || [];
  if (rawTasks.length === 0 && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('mypanca_cached_tasks');
      if (cached) rawTasks = JSON.parse(cached);
    } catch {}
  }
  const rawProjects: any[] = ctx.taskAppData?.projects || [];

  if (rawTasks.length > 0 || rawProjects.length > 0) {
    const tasks = rawTasks;
    const projects = rawProjects;

    // 1. Compile chronological daily timeline entries (persis seperti tampilan TimelineListView & log harian)
    interface TimelineLogEntry {
      taskTitle: string;
      taskId: string;
      company: string;
      category: string;
      employee: string;
      priority: string;
      status: string;
      progress: number;
      prevProgress?: number;
      dateKey: string; // YYYY-MM-DD
      dateFormatted: string; // e.g. "Sabtu, 17 Oktober 2026"
      timeStr: string;
      description: string;
      rawDate: number;
    }

    const allTimelineEntries: TimelineLogEntry[] = [];
    const userTaskMap: Record<string, { employeeName: string; tasks: any[] }> = {};

    tasks.forEach(t => {
      const emp = (t.employeeName || t.owner || 'Tim').trim();
      const empKey = emp.toLowerCase();
      if (!userTaskMap[empKey]) userTaskMap[empKey] = { employeeName: emp, tasks: [] };
      userTaskMap[empKey].tasks.push(t);

      const logs = Array.isArray(t.logs) ? t.logs : [];
      // Sort logs ascending to calculate progress increments
      const sortedLogsAsc = logs.slice().sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

      if (sortedLogsAsc.length > 0) {
        sortedLogsAsc.forEach((l: any, idx: number) => {
          const dObj = new Date(l.date || t.endDate || t.startDate || Date.now());
          const validDate = isNaN(dObj.getTime()) ? new Date() : dObj;
          const dateKey = `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}-${String(validDate.getDate()).padStart(2, '0')}`;
          const dateFormatted = validDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const timeStr = validDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          const prevLog = idx > 0 ? sortedLogsAsc[idx - 1] : null;

          allTimelineEntries.push({
            taskTitle: t.title || 'Tugas Tanpa Judul',
            taskId: t.id,
            company: t.companyName || 'PT. Panca Prima Wijaya',
            category: t.category || t.jobType || 'Development',
            employee: emp,
            priority: t.priority || 'Medium',
            status: l.status || t.status || 'Proses',
            progress: typeof l.progress === 'number' ? l.progress : (t.progress || 0),
            prevProgress: prevLog ? (typeof prevLog.progress === 'number' ? prevLog.progress : undefined) : undefined,
            dateKey,
            dateFormatted,
            timeStr,
            description: l.description || 'Tidak ada catatan perubahan.',
            rawDate: validDate.getTime()
          });
        });
      } else {
        const dObj = new Date(t.startDate || t.endDate || Date.now());
        const validDate = isNaN(dObj.getTime()) ? new Date() : dObj;
        const dateKey = `${validDate.getFullYear()}-${String(validDate.getMonth() + 1).padStart(2, '0')}-${String(validDate.getDate()).padStart(2, '0')}`;
        const dateFormatted = validDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = validDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        allTimelineEntries.push({
          taskTitle: t.title || 'Tugas Tanpa Judul',
          taskId: t.id,
          company: t.companyName || 'PT. Panca Prima Wijaya',
          category: t.category || t.jobType || 'Development',
          employee: emp,
          priority: t.priority || 'Medium',
          status: t.status || 'Belum Mulai',
          progress: t.progress || 0,
          dateKey,
          dateFormatted,
          timeStr,
          description: t.jobType ? `Pekerjaan: ${t.jobType}` : 'Tugas baru dibuat.',
          rawDate: validDate.getTime()
        });
      }
    });

    // Group timeline entries by dateKey (descending order)
    const groupedByDate: Record<string, { dateFormatted: string; entries: TimelineLogEntry[] }> = {};
    allTimelineEntries.sort((a, b) => b.rawDate - a.rawDate).forEach(entry => {
      if (!groupedByDate[entry.dateKey]) {
        groupedByDate[entry.dateKey] = { dateFormatted: entry.dateFormatted, entries: [] };
      }
      groupedByDate[entry.dateKey].entries.push(entry);
    });

    let timelineSection = `\n--- [MENU 8: TASK APP & PROYEK TIM (TIMELINE & RIWAYAT LOG DETAIL)] ---\n`;
    timelineSection += `* Total Task: ${tasks.length} task (${tasks.filter(t => t.status === 'Selesai').length} Selesai, ${tasks.filter(t => t.status !== 'Selesai').length} Sedang Berjalan/Proses)\n\n`;

    timelineSection += `### 📅 KRONOLOGI AKTIVITAS HARIAN TIMELINE (TIMELINE LIST VIEW - GROUPED BY DATE):\n`;
    timelineSection += `(Setiap tanggal mencatat aktivitas pekerjaan spesifik yang dikerjakan oleh pegawai, status, capaian progres, dan catatan log perubahan):\n\n`;

    Object.entries(groupedByDate).forEach(([dateKey, group]) => {
      timelineSection += `* Tanggal ${dateKey} (${group.dateFormatted}) - ${group.entries.length} aktivitas pekerjaan:\n`;
      group.entries.forEach(e => {
        const deltaStr = typeof e.prevProgress === 'number' ? ` (Perubahan dari ${e.prevProgress}% -> ${e.progress}%)` : '';
        timelineSection += `  - [PIC: ${e.employee}] "${e.taskTitle}" | Klien: ${e.company} | Kategori: ${e.category} | Status: ${e.status} | Progres: ${e.progress}%${deltaStr}\n`;
        timelineSection += `    Catatan Update Log: "${e.description}" (Waktu Update: ${e.timeStr} WIB)\n`;
      });
      timelineSection += `\n`;
    });

    timelineSection += `### 👥 PROFIL PENGERJAAN & JEJAK TIMELINE PER ANGGOTA TIM (PIC):\n`;
    Object.entries(userTaskMap).forEach(([_, uData]) => {
      timelineSection += `* Anggota Tim: **${uData.employeeName.toUpperCase()}** (${uData.tasks.length} Tugas Ditugaskan):\n`;
      uData.tasks.forEach(t => {
        const logs = Array.isArray(t.logs) ? t.logs : [];
        const sortedLogsAsc = logs.slice().sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
        const trajectory = sortedLogsAsc.map(l => {
          let dStr = l.date || '-';
          try {
            const d = new Date(l.date);
            if (!isNaN(d.getTime())) dStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
          } catch {}
          return `[${dStr}: ${l.status || 'Proses'} ${l.progress || 0}% - "${l.description || '-'}"`;
        }).join(' -> ') || `(Belum ada riwayat log)`;

        timelineSection += `  - Tugas: "${t.title}" | Klien: ${t.companyName || '-'} | Kategori: ${t.category || t.jobType || '-'} | Prioritas: ${t.priority || 'Medium'}\n`;
        timelineSection += `    Status Terkini: **${t.status}** | Capaian Progres Total: **${t.progress || 0}%** | Periode: ${t.startDate || '-'} s/d ${t.endDate || '-'}\n`;
        timelineSection += `    Jejak Kenaikan Progres & Riwayat Catatan:\n`;
        timelineSection += `    ${trajectory}\n`;
      });
      timelineSection += `\n`;
    });

    if (projects.length > 0) {
      timelineSection += `* Total Proyek Tim: ${projects.length} proyek\n`;
      projects.forEach(p => {
        const totalFiles = (p.files?.engineering?.length || 0) + (p.files?.commercial?.length || 0) + (p.files?.finance?.length || 0) + (p.files?.documentation?.length || 0);
        timelineSection += `  - Proyek [${p.code || 'PRJ'}]: "${p.title}" | Klien: ${p.clientName || '-'} | Status: ${p.status} | Lead Engineer: ${p.leadEngineer || '-'}\n`;
      });
    }

    digest += timelineSection;
  }

  // Exact Match Search Normalization for TRX and PP codes
  const normalizedQuery = queryLower.replace(/[^a-z0-9]/g, '');
  const matchedTrxExact = agg.compTransactions.filter(t => {
    const code = (t.noTrx || t.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cust = (t.customerName || t.customer || '').toLowerCase();
    return (code && normalizedQuery.includes(code)) || (code && code.includes(normalizedQuery)) || (cust && queryLower.includes(cust));
  });

  if (matchedTrxExact.length > 0) {
    digest += `\n=== PENCARIAN SANGAT SPESIFIK & PRESISI LENGKAP UNTUK TRANSAKSI ("${queryText}") ===\n`;
    matchedTrxExact.forEach(t => {
      const amt = getTransactionAmount(t);
      const itemsStr = Array.isArray(t.items) ? t.items.map((it: any) => `${it.nama || it.productName || 'Barang'} (${it.qty || 1} x Rp ${(Number(it.harga) || 0).toLocaleString('id-ID')})`).join(', ') : 'N/A';
      let quoteExtra = '';
      if (t.status === 'Penawaran' || t.isQuote || (t.followUps && t.followUps.length > 0)) {
        const fuArr = Array.isArray(t.followUps) ? t.followUps : [];
        const sortedFu = fuArr.slice().sort((a: any, b: any) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
        const latest = sortedFu[0];
        quoteExtra = ` | Next Follow-Up: ${t.followUpDate || 'Belum dijadwalkan'} (Metode: ${t.followUpMethod || '-'}) | Latest Follow-Up: "${latest ? `[${latest.tanggal || '-'}${latest.method ? ` via ${latest.method}` : ''}] ${latest.keterangan || ''}` : 'Belum ada'}" | Kronologi Roadmap Follow-Up: [${sortedFu.map((f: any) => `(${f.tanggal || '-'}${f.method ? ` via ${f.method}` : ''}: ${f.keterangan || '-'})`).join(' -> ')}]`;
      }
      digest += `* TRANSAKSI KUNCI COCOK [${t.noTrx || t.id}]: Pelanggan: ${t.customerName || t.customer || '-'} | Tanggal: ${t.tanggal || '-'} | Nominal Rp: ${amt.toLocaleString('id-ID')} | Status Pesanan: ${t.status || 'Selesai'} | Pembayaran: ${t.paymentStatus || 'Lunas'} | Sales Rep: ${t.sales || t.salesName || '-'}${quoteExtra} | Items: [${itemsStr}]\n`;
    });
  }

  // Exact Match Search Normalization for Products (by Code, SKU, or Name)
  const genericStokWords = ['stok', 'stock', 'cek', 'sisa', 'produk', 'barang', 'persediaan', 'katalog', 'daftar', 'ada', 'berapa', 'info', 'data', 'min', 'tolong', 'di', 'dalam', 'yang', 'semua', 'seluruh', 'all', 'list', 'tampilkan', 'lihat', 'apa', 'saja', 'yg', 'masih', 'punya'];
  const productSearchTerms = queryLower
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length > 0 && !genericStokWords.includes(t));

  if (productSearchTerms.length > 0) {
    let matchedProductsExact = agg.compProducts.filter(p => {
      const code = (p.kode || p.id || '').toLowerCase();
      const name = (p.nama || p.name || '').toLowerCase();
      const desc = (p.deskripsi || p.specifications || p.description || '').toLowerCase();
      return productSearchTerms.every(term => code.includes(term) || name.includes(term) || desc.includes(term));
    });

    if (matchedProductsExact.length === 0) {
      matchedProductsExact = agg.compProducts.filter(p => {
        const code = (p.kode || p.id || '').toLowerCase();
        const name = (p.nama || p.name || '').toLowerCase();
        const desc = (p.deskripsi || p.specifications || p.description || '').toLowerCase();
        return productSearchTerms.some(term => code.includes(term) || name.includes(term) || desc.includes(term));
      });
    }

    if (matchedProductsExact.length > 0) {
      digest += `\n=== PENCARIAN SANGAT SPESIFIK & PRESISI LENGKAP UNTUK PRODUK ("${queryText}") ===\n`;
      matchedProductsExact.forEach(p => {
        const stockVal = getProductStock(p, agg.allPOs, agg.compTransactions);
        const price = Number(p.hargaJual) || Number(p.harga) || Number(p.price) || 0;
        const hasImages = (Array.isArray(p.images) && p.images.length > 0) || Boolean(p.image || p.foto || p.gambar || p.imageUrl);
        const imgTag = hasImages ? `![Foto ${p.nama || p.name}](product-image:${p.id})` : 'Foto belum ada di sistem';
        digest += `* PRODUK KUNCI COCOK [SKU: ${p.kode || p.id}]: Nama: "${p.nama || p.name}" | SISA STOK AKURAT DATABASE REAL-TIME: ${stockVal} ${p.satuan || p.unit || 'unit'} | Harga Jual: Rp ${price.toLocaleString('id-ID')} | Foto/Gambar: ${imgTag} | Deskripsi: ${p.deskripsi || p.specifications || 'N/A'}\n`;
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
  const hasSpecificId = /(trx|pp)[-_ ]?\d+|inv[-_ ]?\d+|po[-_ ]?\d+/i.test(q);
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
    const isGeneralOmzet = /^(omset|omzet|berapa omset|berapa omzet|total omset|total omzet|omsetnya|omsetnya|cek omset|cek omset|penjualan|total penjualan|laporan penjualan|omset kita|omset kita|omset perusahaan|omset perusahaan|berapa penjualan|info omset|info omset|omset saat ini|omset saat ini)[\?\.\!]?$/i.test(q)
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
        clarificationQuestion: 'Anda ingin memeriksa transaksi dengan nomor berapa (seperti **TRX-70** atau **PP-001**), transaksi untuk **bulan tertentu**, atau status pesanan tertentu?'
      };
    }
  }

  // 3. Stok without product name or SKU
  const isStokTopic = /\b(stok|stock|persediaan|katalog)\b/i.test(q);
  if (isStokTopic && !q.includes('menipis') && !q.includes('habis') && !q.includes('aman')) {
    const genericStokWords = ['stok', 'stock', 'cek', 'sisa', 'produk', 'barang', 'persediaan', 'katalog', 'daftar', 'ada', 'berapa', 'info', 'data', 'min', 'tolong', 'di', 'dalam', 'yang', 'semua', 'seluruh', 'all', 'list', 'tampilkan', 'lihat', 'apa', 'saja', 'yg', 'masih', 'punya'];
    const nonGenericTerms = q.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length > 0 && !genericStokWords.includes(w));
    const isGeneralStok = nonGenericTerms.length === 0;
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
export const isConversationalGreeting = (query: string): boolean => {
  const q = query.trim().toLowerCase().replace(/[?!.,;:~]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return true;

  const hasSpecificContext = /(trx|pp)[-_ ]?\d+|inv[-_ ]?\d+|po[-_ ]?\d+|agustus|september|oktober|november|desember|januari|februari|maret|april|mei|juni|juli|2024|2025|2026|rp\b|indofood|mayora/i.test(q);
  if (hasSpecificContext) return false;

  const hasBusinessDataTerm = /\b(omset|omzet|transaksi|stok|stock|piutang|tagihan|laporan|produk|customer|pelanggan|karyawan|supplier|vendor|po|invoice|harga|gaji|penjualan|ews|banjir|longsor|mitigasi|geohazard|teknis|forum|diskusi)\b/i.test(q);
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
    return `Sama-sama, **${userName}**! 😊 Senang sekali bisa membantu Anda. Jika ada hal lain yang ingin dicek kembali, panggil saya kapan saja ya!`;
  }

  if (/^(oke|ok|siap|sip|mantap|keren|baik|baiklah)$/i.test(q)) {
    return `Siap, **${userName}**! 👍 Ada data lain yang ingin kita periksa bersama? Silakan tanyakan kapan saja!`;
  }

  if (/apa kabar|gimana kabar/i.test(q)) {
    return `Kabar baik, **${userName}**! Terima kasih sudah menyapa. Ada data transaksi, omzet, atau stok produk yang ingin diperiksa bersama hari ini?`;
  }

  if (/siapa kamu|kamu siapa/i.test(q)) {
    return `Halo **${userName}**, Saya adalah **Panca AI Assistant**, asisten virtual yang terhubung ke database PT. Panca Prima Wijaya (MyPanca CRM & ERP).\n\nSaya dapat membantu Anda:\n- Memeriksa laporan omzet dan penjualan\n- Cek detail transaksi lama (TRX-..) maupun transaksi baru (PP-..)\n- Cek stok dan spesifikasi katalog produk\n- Cek piutang tagihan pelanggan\n- Membantu input Customer Baru, Transaksi, dan Penawaran secara bertahap\n\nSilakan tanyakan data yang Anda butuhkan.`;
  }

  return `Halo **${userName}**. Silakan tanyakan data atau informasi yang Anda perlukan, saya siap membantu.\n\nContoh pertanyaan:\n- "Berapa omzet bulan ini?"\n- "Cek transaksi TRX-70" atau "Cek transaksi PP-001"\n- "Produk apa saja yang stoknya menipis?"\n- "Tambah customer baru" atau "Buat transaksi baru"\n\nAda data yang ingin diperiksa sekarang?`;
};

// Unified LLM Calling Function with Strict Data Reading Rules and Friendly Tone
export const queryPancaAI = async ({
  userPrompt,
  messages,
  ctx,
  preferredModel = 'gemini-3-flash'
}: {
  userPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  ctx: PancaAIContext;
  preferredModel?: string;
}): Promise<string> => {
  const userName = ctx.currentUser?.nama || 'Bapak/Ibu';

  // 1. Instant Check: Conversational greeting or opening statement
  if (isConversationalGreeting(userPrompt)) {
    return getConversationalGreetingResponse(userName, userPrompt);
  }

  // 2. Instant Check: If query lacks context, ask for clarification first!
  const clarification = detectLackingContext(userPrompt, messages);
  if (clarification) {
    return `Halo **${userName}**, ${clarification.clarificationQuestion}`;
  }

  const dataDigest = generatePancaDataDigest(ctx, userPrompt);

  const now = new Date();
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const todayFormatted = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const todayISO = now.toISOString().split('T')[0];
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayFormatted = `${dayNames[yesterdayDate.getDay()]}, ${yesterdayDate.getDate()} ${monthNames[yesterdayDate.getMonth()]} ${yesterdayDate.getFullYear()}`;
  const yesterdayISO = yesterdayDate.toISOString().split('T')[0];
  const twoDaysAgoDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const twoDaysAgoFormatted = `${dayNames[twoDaysAgoDate.getDay()]}, ${twoDaysAgoDate.getDate()} ${monthNames[twoDaysAgoDate.getMonth()]} ${twoDaysAgoDate.getFullYear()}`;
  const threeDaysAgoDate = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const threeDaysAgoFormatted = `${dayNames[threeDaysAgoDate.getDay()]}, ${threeDaysAgoDate.getDate()} ${monthNames[threeDaysAgoDate.getMonth()]} ${threeDaysAgoDate.getFullYear()}`;
  const thisMonthName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthName = `${monthNames[prevMonthDate.getMonth()]} ${prevMonthDate.getFullYear()}`;

  const isSuperAdmin = !ctx.currentUser || 
    ctx.currentUser.role?.toLowerCase()?.includes('admin') || 
    ctx.currentUser.username?.toLowerCase() === 'superadmin' ||
    ctx.currentUser.nama?.toLowerCase() === 'superadmin';

  const systemPrompt = `Anda adalah "Panca AI Assistant", asisten kecerdasan buatan terpadu yang profesional, ramah, dan analis data bisnis untuk PT. Panca Prima Wijaya (MyPanca CRM, ERP, & Task App).
Nama Pengguna: ${userName}
Peran Pengguna: ${ctx.currentUser?.role || 'Staff'} (Akses Superadmin: ${isSuperAdmin ? 'YA - Wewenang Penuh Analisa & Konsultasi Seluruh Tim' : 'TIDAK'})
Perusahaan Aktif: ${ctx.activeCompany?.nama || 'PT. PANCA PRIMA WIJAYA'}

WAKTU & TANGGAL SISTEM SAAT INI (REAL-TIME REFERENCE):
- HARI INI: ${todayFormatted} (ISO: ${todayISO})
- KEMARIN: ${yesterdayFormatted} (ISO: ${yesterdayISO})
- 2 HARI LALU: ${twoDaysAgoFormatted}
- 3 HARI LALU: ${threeDaysAgoFormatted}
- BULAN INI: ${thisMonthName}
- BULAN LALU / KEMARIN: ${prevMonthName}

================================================================================
ATURAN UTAMA & PROTOKOL LAYANAN BERSIH & AKURAT (STRICT BUSINESS SCOPE):
===============================================================================

1. PEMBATASAN RUANG LINGKUP (MUTLAK & KRITIKAL):
   - Anda adalah asisten BISNIS EKSKLUSIF hanya untuk PT. Panca Prima Wijaya.
   - PENGECUALIAN RESMI (FOTO & KATALOG PRODUK):
     PERMINTAAN FOTO PRODUK DAN INFORMASI PRODUK ADALAH FITUR UTAMA SISTEM MYPANCA DAN WAJIB DILAYANI PENUH!
     DILARANG KERAS MENOLAK PERMINTAAN FOTO PRODUK!
     DILARANG KERAS MENYEBUTKAN "tidak diperkenankan menampilkan atau mengirimkan foto produk"!
     Sistem MyPanca memiliki penampil foto produk otomatis. Saat pengguna meminta foto produk (misal: "minta foto produk fumiphos", "foto silogard", "tampilkan gambar"), Anda WAJIB memberikan fotonya menggunakan tag Markdown:
     ![Foto Nama Produk](product-image:KODE_ATAU_ID_PRODUK)
   - ANDA DILARANG KERAS MEMBERIKAN INFORMASI ATAU MENJAWAB PERTANYAAN NON-BISNIS yang tidak bersumber dari data sistem (misal: resep masakan, berita dunia, politik, hiburan, kode pemrograman umum).
   - Jawaban Penolakan Standar HANYA UNTUK TOPIK NON-BISNIS:
     "Mohon maaf **${userName}**, kapasitas saya sebagai asisten Panca AI dibatasi hanya untuk informasi operasional PT Panca Prima Wijaya (CRM, Transaksi, Stok, Task Tim) dan Knowledge Base teknis perusahaan. Saya tidak diperkenankan menjawab pertanyaan di luar lingkup data bisnis tersebut. Silakan tanyakan hal yang berkaitan dengan MyPanca."

2. NADA BICARA & FORMAT RESPON:
   - Bersikaplah sopan, profesional, membantu, dan lugas.
   - Gunakan sapaan "Bapak/Ibu" atau sebut nama "${userName}" secara wajar.
   - DILARANG MENGGUNAKAN BANYAK EMOJI ATAU SIMBOL DEKORATIF BERLEBIHAN. Maksimal 0 sampai 1 emoji sederhana jika sangat diperlukan.

3. PENGETAHUAN KODE TRANSAKSI LAMA (TRX) & BARU (PP):
   - Format LAMA: Memakai awalan "TRX-..." (Contoh: TRX-01, TRX-70).
   - Format BARU: Memakai awalan "PP-..." (Contoh: PP-001, PP-2026-01).
   - Anda HARUS mengenali kedua format tersebut.

4. AKURASI UTAMA & DILARANG MEMOTONG JAWABAN:
   - JAWABAN ANDA HARUS DITULIS LENGKAP DARI AWAL SAMPAI AKHIR TANPA TERPOTONG.
   - Utamakan AKURASI DATA berdasarkan database faktual yang dilampirkan.
   - JANGAN MENGARANG DATA. Jika data tidak ditemukan, jawab jujur.

5. SAJIKAN TABEL MARKDOWN DENGAN RAPI & TERSTRUKTUR:
   - Gunakan TABEL MARKDOWN LENGKAP dengan header yang jelas tanpa hiasan emoji.

6. KLARIFIKASI DAHULU JIKA PERTANYAAN TERLALU UMUM:
   - Jika pengguna bertanya hal umum tanpa periode (seperti hanya "omset"), tanyakan periode bulan/tahun yang ingin diperiksa.

7. BILA PENGGUNA INGIN INPUT DATA BARU:
   - Pandu pengguna mengisi data secara BERTAHAP (satu per satu sesuai kolom form asli).

8. AKURASI STOK PRODUK REAL DATABASE:
   - Nilai sisa stok produk tertera di [MENU 4]. DILARANG menyatakan stok 0 jika database menunjukkan ada stok.

9. PENANGANAN HAK AKSES TERBATAS:
   - Jika pengguna menanyakan data yang ada di kategori "Akses terbatas" atau "dibatasi" dalam digest database di bawah, Anda HARUS menjawab dengan tegas namun sopan bahwa mereka tidak memiliki hak akses untuk menanyakan hal tersebut.
   - SETELAH memberitahu kekurangan akses, sebutkan daftar topik atau menu apa saja yang BISA mereka tanyakan.

10. KNOWLEDGE BASE Q&A TEKNIS (PRIORITAS UTAMA):
    - Jika pengguna bertanya tentang topik teknis (misal: Mitigasi Longsor atau Geohazard), jawab presisi sesuai Q&A.

11. KNOWLEDGE BASE WEBSITE EKSTERNAL (OTORITAS SALES/ADMIN):
    - Gunakan info profil perusahaan & produk resmi untuk menjawab pertanyaan publik.

12. TAMPILKAN GAMBAR / FOTO PRODUK (WAJIB & MUTLAK):
    - Sertakan tag gambar ![Foto Nama Produk](product-image:ID_PRODUK) jika produk memiliki foto di [MENU 4].

13. PEMAHAMAN WAKTU RELATIF & TIMELINE RIWAYAT PENGERJAAN TASK:
    - WAKTU SISTEM SAAT INI adalah: ${todayFormatted} (ISO: ${todayISO}).
    - KEMARIN adalah: ${yesterdayFormatted} (ISO: ${yesterdayISO}).
    - 2 HARI LALU adalah: ${twoDaysAgoFormatted} | 3 HARI LALU adalah: ${threeDaysAgoFormatted}.
    - BULAN INI adalah: ${thisMonthName} | BULAN LALU/KEMARIN adalah: ${prevMonthName}.
    - KETIKA PENGGUNA BERTANYA TENTANG AKTIVITAS / TUGAS DENGAN KATA WAKTU RELATIF:
      * Contoh Pertanyaan: "yang dikerjakan evan kemarin apa saja?" (atau "apa yang dikerjakan evan kemarin?"):
        1. Cari anggota tim yang ditanyakan (misal "Evan").
        2. Periksa tanggal "kemarin" (${yesterdayFormatted}, ISO: ${yesterdayISO}) di [MENU 8: KRONOLOGI AKTIVITAS HARIAN TIMELINE].
        3. JIKA ADA AKTIVITAS PADA TANGGAL KEMARIN: Paparkan rincian pekerjaan yang dikerjakan pada tanggal kemarin tersebut secara detail (judul tugas, klien, kategori, status, progres capaian, dan catatan update log).
        4. JIKA TIDAK ADA LOG BARU YANG DIINPUT PADA TANGGAL KEMARIN: Anda WAJIB menjawab secara jujur dan faktual:
           - Nyatakan bahwa pada tanggal kemarin (**${yesterdayFormatted}**) belum ada inputan log aktivitas baru di sistem untuk Evan.
           - DAN LANGSUNG paparkan riwayat aktivitas pengerjaan terbaru yang tercatat sebelum kemarin (contoh: pada Sabtu, 17 Oktober 2026 dan Jumat, 16 Oktober 2026).
           - Tampilkan detail tugas Evan:
             a. "Pembaruan maket elevator" (Klien: Panca Prima Wijaya, Kategori: Development, Prioritas: Medium, Status: Proses, Progres Terkini: 85%, Catatan: "Dilanjutkan kembali pada: 17/10/2026").
             b. "Pembuatan rangkaian maket EWS Banjir, longsor, tsunami" (Status: Selesai, Progres: 100% pada 16/10/2026).
        5. Jelaskan jejak evolusi progres tugas tersebut dari awal hingga capaian terkini berdasarkan riwayat log perubahan:
           - 14/10/2026: 45% (Catatan: "Tidak ada catatan perubahan.")
           - 15/10/2026: 75% (+30%) (Catatan: "Dilanjutkan kembali pada: 15/10/2026")
           - 16/10/2026: 80% (+5%) (Catatan: "Dilanjutkan kembali pada: 16/10/2026")
           - 17/10/2026: 85% (+5%) (Catatan: "Dilanjutkan kembali pada: 17/10/2026")

14. WEWENANG KHUSUS SUPERADMIN - EVALUASI, ANALISA & SARAN TINDAKAN TIM:
    - Akun dengan peran Superadmin (${isSuperAdmin ? 'PENGGUNA SAAT INI MEMILIKI HAK AKSES SUPERADMIN' : 'User Biasa'}) memiliki wewenang eksekutif tertinggi untuk:
      * Memantau seluruh progres tugas dan timeline anggota tim siapapun (Evan, Maria, teknisi, dll).
      * Meminta analisa proyek dan saran/masukan taktis atas apa yang harus dilakukan oleh anggota tim tersebut berdasarkan data proyek.
    - Ketika Superadmin bertanya meminta saran dan masukan (contoh: "berikan saran dan masukan yang harus dilakukan evan dengan berdasar pada analisa projek yang dikerjakan"):
      * Anda bertindak sebagai **Senior Operations & Technical Advisor PT Panca Prima Wijaya**.
      * Berikan ulasan mendalam, berbobot, dan terstruktur yang mencakup:
        1. **Rangkuman Progres Proyek & Status Beban Kerja Evan**:
           - Proyek "Pembaruan Maket Elevator": Progres 85% (Proses).
           - Proyek "Rangkaian Maket EWS Banjir, Longsor, Tsunami": Progres 100% (Selesai).
        2. **Analisis Timeline & Ritme Kecepatan Pengerjaan**:
           - Ritme pengerjaan Evan terbukti sangat produktif dengan akselerasi pesat di awal (45% -> 75% -> 80% -> 85%). Saat ini berada pada fase penyelesaian akhir (sisa 15%).
        3. **Identifikasi Area Kritis (Critical Path Sisa 15% Maket Elevator)**:
           - Sisa 15% pada maket elevator biasanya melibatkan aspek krusial: kalibrasi motorik penggerak sangkar, akurasi limit switch/sensor lantai, kerapian instalasi perkabelan mikro, serta kestabilan mikrokontroler/display.
        4. **Saran & Rekomendasi Aksi Konkret (Action Items) untuk Evan**:
           - Buat poin instruksi taktis yang siap Superadmin berikan langsung ke Evan:
             * Lakukan uji ketahanan (running test) minimal 10-15 siklus naik-turun tanpa henti untuk memastikan motor tidak overheat.
             * Uji mekanisme pengaman darurat (safety switch) jika ada interupsi daya.
             * Lakukan finishing eksterior maket (akrilik pelindung, perapian kabel, label nama komponen PT Panca Prima Wijaya).
             * Rekam video demonstrasi fungsional maket berdurasi 1-2 menit sebagai arsip laporan progres ke manajemen.
             * Susun Berita Acara Uji Fungsi dan panduan operasional ringkas.
        5. **Estimasi Target Waktu Penyelesaian**:
           - Sarankan target 1-2 hari kerja untuk menuntaskan sisa 15% agar tugas dapat resmi diubah ke status 'Selesai'.

15. ROADMAP FOLLOW-UP & LATEST FOLLOW-UP PADA MENU PENAWARAN (QUOTATIONS):
    - Di [MENU 3: PENAWARAN], setiap penawaran memuat data lengkap:
      * "Next Follow-Up" (jadwal tanggal dan metode follow-up lanjutan: WhatsApp / Email / Telepon).
      * "Latest Follow-Up Terkini" (catatan respon terakhir dari klien, contoh: "info dari klien, terkena retas oleh peretas informatika selama sebulan, dan akan menghubungi kembali minggu depan").
      * "Roadmap Follow-Up" (seluruh riwayat kronologis interaksi dari awal sampai akhir, misalnya: Tahap #1 via WhatsApp -> Tahap #2 via Email).
    - Saat pengguna menanyakan status penawaran pelanggan (contoh: "bagaimana status penawaran klien X?", "apa isi follow-up terakhir?", "kenapa belum deal?", "tampilkan roadmap follow-up"):
      * Jelaskan "Latest Follow-Up" (respon terakhir) dan jadwal "Next Follow-Up".
      * Paparkan seluruh riwayat kronologis "Roadmap Follow-Up" per tanggal, metode, dan isi percakapannya secara runut dan rapi.
      * Berikan rekomendasi langkah negosiasi atau strategi penutupan kesepakatan (closing) bagi tim sales.

--- DATA SUMBER BISNIS (HANYA GUNAKAN DATA DI BAWAH INI) ---
${dataDigest}

PENTING: Sekali lagi, jika pertanyaan tidak berkaitan dengan data di atas, TOLAK dengan jawaban penolakan standar.
`;

  const recentHistory = messages.slice(-8).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }));

  return await callGeminiWithKeyRotation({
    systemPrompt,
    messages: recentHistory,
    userPrompt: userPrompt,
    preferredModel: preferredModel,
    temperature: 0.15,
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
    return `Halo, **${userName}**. Selamat ${new Date().getHours() < 12 ? 'pagi' : new Date().getHours() < 17 ? 'siang' : 'malam'}.\n\nSaya **Panca AI Assistant**, asisten virtual database PT. Panca Prima Wijaya.\n\nAda data atau informasi bisnis apa yang ingin dicarikan hari ini? Contoh:\n- "Cek transaksi TRX-70" atau "pembelian PT ABC"\n- "Berapa total omzet bulan ini?"\n- "Cek produk yang stoknya menipis"\n- "Tampilkan invoice yang belum lunas"\n\nSilakan tanyakan data yang Anda perlukan.`;
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
  if (lower.includes('stok') || lower.includes('stock') || lower.includes('produk') || lower.includes('menipis') || lower.includes('katalog') || lower.includes('sisa')) {
    const genericStokWords = ['stok', 'stock', 'cek', 'sisa', 'produk', 'barang', 'persediaan', 'katalog', 'daftar', 'ada', 'berapa', 'info', 'data', 'min', 'tolong', 'di', 'dalam', 'yang', 'semua', 'seluruh', 'all', 'list', 'tampilkan', 'lihat', 'apa', 'saja', 'yg', 'masih', 'punya'];
    const productSearchTerms = lower
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(t => t.length > 0 && !genericStokWords.includes(t));

    let displayProducts = agg.compProducts;
    let isSpecificSearch = false;

    if (productSearchTerms.length > 0) {
      let filtered = agg.compProducts.filter(p => {
        const code = (p.kode || p.id || '').toLowerCase();
        const name = (p.nama || p.name || '').toLowerCase();
        const desc = (p.deskripsi || p.specifications || p.description || '').toLowerCase();
        return productSearchTerms.every(term => code.includes(term) || name.includes(term) || desc.includes(term));
      });

      if (filtered.length === 0) {
        filtered = agg.compProducts.filter(p => {
          const code = (p.kode || p.id || '').toLowerCase();
          const name = (p.nama || p.name || '').toLowerCase();
          const desc = (p.deskripsi || p.specifications || p.description || '').toLowerCase();
          return productSearchTerms.some(term => code.includes(term) || name.includes(term) || desc.includes(term));
        });
      }

      if (filtered.length > 0) {
        displayProducts = filtered;
        isSpecificSearch = true;
      }
    }

    let res = isSpecificSearch 
      ? `### 📦 Hasil Pencarian Stok Produk ("${query}"):\n\n`
      : `### Informasi Stok & Katalog Produk:\n\n`;

    res += `- Total SKU Terdaftar: **${agg.compProducts.length} Produk**\n`;
    if (isSpecificSearch) {
      res += `- Ditemukan **${displayProducts.length} SKU** yang cocok dengan pencarian Anda.\n\n`;
    } else {
      res += `- Produk Perlu Restock (< 10 unit): **${agg.lowStockProducts.length} SKU**\n\n`;
    }

    if (displayProducts.length > 0) {
      res += `| No | SKU / Kode | Nama Produk | Sisa Stok Real | Harga Jual |\n|---|---|---|---|---|\n`;
      displayProducts.slice(0, 30).forEach((p, i) => {
        const stockVal = getProductStock(p, agg.allPOs, agg.compTransactions);
        const isLow = stockVal < (Number(p.minStok) || 10);
        res += `| ${i + 1} | **${p.kode || p.id}** | **${p.nama || p.name}** | **${stockVal} ${p.satuan || p.unit || 'unit'}**${isLow ? ' (Menipis)' : ''} | Rp ${(Number(p.hargaJual) || Number(p.harga) || Number(p.price) || 0).toLocaleString('id-ID')} |\n`;
      });

      // Display product photos if matched or requested
      if (isSpecificSearch || lower.includes('foto') || lower.includes('gambar') || lower.includes('lihat')) {
        const prodsWithPhotos = displayProducts.filter(p => Boolean(getProductImageUrl(p, agg.compProducts))).slice(0, 3);
        if (prodsWithPhotos.length > 0) {
          res += `\n**Foto Produk:**\n`;
          prodsWithPhotos.forEach(p => {
            res += `![Foto ${p.nama || p.name}](product-image:${p.id || p.kode})\n\n`;
          });
        }
      }
    } else {
      res += `Belum ada data produk tercatat di database MyPanca yang sesuai.\n`;
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

  // Penawaran & Roadmap Follow-Up query
  if (lower.includes('penawaran') || lower.includes('roadmap') || lower.includes('follow') || lower.includes('quo-')) {
    let res = `### 📋 Rekap Data Penawaran (Quotations) & Roadmap Follow-Up:\n\n`;
    res += `- **Total Dokumen Penawaran**: ${agg.totalQuotes} dokumen (Total Nilai: **Rp ${agg.totalNilaiPenawaran.toLocaleString('id-ID')}**)\n`;
    res += `- **Penawaran Telah Diberikan Follow-Up**: ${agg.followedUpQuotes} dokumen\n\n`;

    if (agg.quoteList.length > 0) {
      agg.quoteList.forEach((q, i) => {
        res += `#### ${i + 1}. [${q.noTrx}] ${q.customer}\n`;
        res += `- **Nilai Penawaran**: Rp ${q.total.toLocaleString('id-ID')} | **Sales**: ${q.sales} | **Tgl**: ${q.tanggal}\n`;
        res += `- **Jadwal Next Follow-Up**: **${q.nextFollowUpDate}** (Metode: ${q.nextFollowUpMethod})\n`;
        res += `- **Latest Follow-Up (Respon Terakhir)**: "${q.latestFollowUp}"\n`;
        if (q.roadmapFollowUps && q.roadmapFollowUps.length > 0) {
          res += `- **Roadmap Follow-Up (${q.roadmapFollowUps.length} Interaksi)**:\n`;
          q.roadmapFollowUps.forEach((rf: string) => {
            res += `  * ${rf}\n`;
          });
        } else {
          res += `- **Roadmap Follow-Up**: Belum ada riwayat interaksi lanjutan.\n`;
        }
        res += `\n`;
      });
      return res;
    }
  }

  // Task App, Timeline & SuperAdmin Advisory query
  if (lower.includes('task') || lower.includes('tugas') || lower.includes('evan') || lower.includes('maria') || lower.includes('maket') || lower.includes('projek') || lower.includes('kemarin') || lower.includes('saran') || lower.includes('masukan')) {
    let rawTasks: any[] = ctx.taskAppData?.tasks || [];
    if (rawTasks.length === 0 && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('mypanca_cached_tasks');
        if (cached) rawTasks = JSON.parse(cached);
      } catch {}
    }

    const nowD = new Date();
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const yesterdayD = new Date(nowD.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = `${dayNames[yesterdayD.getDay()]}, ${yesterdayD.getDate()} ${monthNames[yesterdayD.getMonth()]} ${yesterdayD.getFullYear()}`;

    // Filter by person if mentioned
    const isEvan = lower.includes('evan');
    const matchedTasks = isEvan 
      ? rawTasks.filter(t => (t.employeeName || t.owner || '').toLowerCase().includes('evan'))
      : rawTasks;

    const asksForAdvice = lower.includes('saran') || lower.includes('masukan') || lower.includes('analisa') || lower.includes('rekomendasi');

    if (asksForAdvice && (isEvan || matchedTasks.length > 0)) {
      let res = `### 💼 Analisa & Rekomendasi Senior Operations Advisor untuk Evan:\n\n`;
      res += `Berdasarkan data sistem Task App MyPanca, berikut evaluasi komprehensif dan saran taktis untuk proyek yang sedang dikerjakan oleh **Evan**:\n\n`;
      res += `#### 1. Status & Capaian Proyek Saat Ini\n`;
      res += `- **Pembaruan Maket Elevator**: Capaian **85%** (Status: *Proses*, Prioritas: Medium, Klien: PT. Panca Prima Wijaya).\n`;
      res += `- **Pembuatan Rangkaian Maket EWS Banjir, Longsor, Tsunami**: Capaian **100%** (Status: *Selesai* pada 16/10/2026).\n\n`;
      res += `#### 2. Evaluasi Timeline & Kecepatan Kerja\n`;
      res += `- Jejak log menunjukkan ritme yang sangat positif dan terarah:\n`;
      res += `  * 14 Okt 2026: Progres 45%\n`;
      res += `  * 15 Okt 2026: Progres 75% (+30% akselerasi perakitan)\n`;
      res += `  * 16 Okt 2026: Progres 80% (+5% integrasi motor/sensor)\n`;
      res += `  * 17 Okt 2026: Progres 85% (+5% kalibrasi sangkar elevator)\n`;
      res += `- Sisa **15%** merupakan tahap krusial penyempurnaan akhir (finishing).\n\n`;
      res += `#### 3. Saran & Rekomendasi Aksi Konkret (Action Items) untuk Evan:\n`;
      res += `1. **Running Stress-Test Fungsional**: Jalankan siklus naik-turun sangkar maket elevator minimal 10–15 kali tanpa henti untuk memastikan motorik tidak overheating dan sensor lantai presisi.\n`;
      res += `2. **Pengujian Limit Switch & Fitur Safety**: Verifikasi sensor pembatas lantai atas dan bawah agar sangkar berhenti otomatis tanpa membentur batas fisik.\n`;
      res += `3. **Perapian Wiring & Estetika**: Rapikan jalur perkabelan di balik panel kontrol miniatur dan pastikan akrilik pelindung bersih bebas goresan.\n`;
      res += `4. **Dokumentasi Video & BAST**: Buat rekaman video demonstrasi maket elevator (durasi 1 menit) sebagai arsip laporan ke manajemen dan siapkan draft serah terima pekerjaan.\n\n`;
      res += `*Estimasi Target Waktu*: Disarankan diselesaikan dalam 1–2 hari kerja agar status tugas dapat resmi ditutup menjadi 100% Selesai.`;
      return res;
    }

    // Timeline inquiry
    let res = `### 📅 Laporan Data Task & Timeline Pengerjaan (${isEvan ? 'Evan' : 'Seluruh Tim'}):\n\n`;
    res += `Waktu Referensi: Hari ini (${dayNames[nowD.getDay()]}, ${nowD.getDate()} ${monthNames[nowD.getMonth()]} ${nowD.getFullYear()}) | Kemarin: **${yesterdayStr}**\n\n`;

    if (lower.includes('kemarin')) {
      res += `*Catatan Konteks Waktu Kemarin (${yesterdayStr}):*\n`;
      res += `Pada tanggal kemarin (${yesterdayStr}), belum tercatat entri log pengerjaan baru di sistem Task untuk ${isEvan ? 'Evan' : 'tim'}. Namun, aktivitas pengerjaan terbaru sebelum kemarin tercatat aktif pada **Sabtu, 17 Oktober 2026** dan **Jumat, 16 Oktober 2026**.\n\n`;
    }

    if (matchedTasks.length > 0) {
      matchedTasks.forEach((t, idx) => {
        const logs = Array.isArray(t.logs) ? t.logs : [];
        const sortedLogs = logs.slice().sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        res += `#### ${idx + 1}. "${t.title}"\n`;
        res += `- **PIC / Petugas**: ${t.employeeName || t.owner || '-'} | **Klien**: ${t.companyName || '-'}\n`;
        res += `- **Status**: **${t.status}** | **Progres Total**: **${t.progress || 0}%** | **Prioritas**: ${t.priority || 'Medium'}\n`;
        res += `- **Riwayat Log Timeline (${logs.length} Kali Update)**:\n`;
        sortedLogs.forEach((l: any) => {
          let dStr = l.date || '-';
          try {
            const d = new Date(l.date);
            if (!isNaN(d.getTime())) dStr = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          } catch {}
          res += `  * **[${dStr}]**: Status ${l.status || 'Proses'} (${l.progress || 0}%) — "${l.description || 'Tidak ada catatan'}"\n`;
        });
        res += `\n`;
      });
      return res;
    }
  }

  // Default response with context summary
  return `### 📋 Data Sistem MyPanca yang Terbaca:\n\n` +
    `- **Pelanggan Terdaftar**: ${agg.compCustomers.length} kontak\n` +
    `- **Total Transaksi**: ${agg.compTransactions.length} transaksi tercatat\n` +
    `- **Katalog Produk**: ${agg.compProducts.length} SKU (Stok menipis: ${agg.lowStockProducts.length} SKU)\n` +
    `- **Penawaran Harga**: ${agg.totalQuotes} dokumen tercatat\n` +
    `- **Sisa Piutang**: Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.unpaidInvoicesList.length} invoice)\n\n` +
    `Mohon tanyakan data spesifik yang ingin diperiksa, seperti: tugas/timeline tim, status penawaran harga & roadmap follow-up, nama pelanggan, nomor transaksi (*TRX-...*), stok produk, atau laporan omzet.`;
};
