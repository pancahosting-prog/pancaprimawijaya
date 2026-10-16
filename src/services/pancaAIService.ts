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
        lastFollowUpDate: (t as any).lastFollowUpDate || (t as any).tanggalFollowUp || 'Belum pernah',
        notes: (t as any).notes || (t as any).catatan || 'Tidak ada catatan',
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
    const s = getProductStock(p);
    const min = Number(p.minStok) || Number(p.min_stok) || Number(p.minStock) || 10;
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

// Generate full real-time database digest with exact TRX and PP match support
export const generatePancaDataDigest = (ctx: PancaAIContext, queryText: string = ''): string => {
  const agg = compileSystemAggregations(ctx, queryText);
  const isSuperAdmin = ctx.currentUser?.role?.toLowerCase() === 'superadmin';
  const queryLower = queryText.toLowerCase();

  let digest = `=== DATABASE REAL-TIME SISTEM MYPANCA (PT. PANCA PRIMA WIJAYA) ===
- Perusahaan Aktif: ${ctx.activeCompany?.nama || 'PT. PANCA PRIMA WIJAYA'}
- Total Seluruh Transaksi: ${agg.compTransactions.length} Transaksi Tercatat
- Skema Nomor Transaksi: Transaksi LAMA memakai "TRX-..." | Transaksi BARU memakai "PP-..."
- Total Omzet Real (Selesai/Lunas): Rp ${agg.totalOmzetLunas.toLocaleString('id-ID')}
- Total Pelanggan Terdaftar: ${agg.compCustomers.length} Pelanggan
- Total SKU Produk: ${agg.compProducts.length} SKU (Stok Menipis: ${agg.lowStockProducts.length} SKU)
- Total Piutang Belum Lunas: Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.unpaidInvoicesList.length} tagihan belum lunas)

--- [REKAP OMZET PER BULAN] ---
${Object.entries(agg.monthlyOmzetMap).map(([m, data]) => `* Periode ${m}: Total Omzet Selesai Rp ${data.omzetSelesai.toLocaleString('id-ID')} (${data.totalDeals} transaksi: ${data.customers.join(', ')})`).join('\n') || '* (Belum ada data bulanan)'}

--- [MENU 1: TRANSAKSI PENJUALAN LENGKAP (LAMA TRX & BARU PP)] ---
* Status Pesanan Breakdown: ${Object.entries(agg.tradeStatusCounts).map(([k, v]) => `${k}: ${v} transaksi`).join(' | ')}
* Status Pembayaran: ${Object.entries(agg.paymentStatusCounts).map(([k, v]) => `${k}: ${v} transaksi`).join(' | ')}
* Performa Sales Rep:
${Object.entries(agg.salesPerformance).map(([s, d]) => `  - Sales ${s}: ${d.count} trx deals | Total Omzet: Rp ${d.omzet.toLocaleString('id-ID')}`).join('\n') || '  (Belum ada data sales)'}

* Top Pelanggan dengan Belanja Terbesar:
${Object.entries(agg.customerSpendMap).sort((a, b) => b[1].total - a[1].total).slice(0, 15).map(([c, d], i) => `  ${i + 1}. ${c}: ${d.count} transaksi | Total Belanja: Rp ${d.total.toLocaleString('id-ID')}`).join('\n') || '  (Belum ada)'}

* Daftar Transaksi Real Database (Setiap Transaksi Terbaca Presisi):
${agg.compTransactions.map(t => {
  const amt = getTransactionAmount(t);
  const itemsStr = Array.isArray(t.items) ? t.items.map((it: any) => `${it.nama || it.productName || 'Barang'} (${it.qty || 1} unit @ Rp ${(Number(it.harga) || 0).toLocaleString('id-ID')})`).join(', ') : '';
  return `  - [${t.noTrx || t.id}] Tanggal: ${t.tanggal || '-'} | Pelanggan: ${t.customerName || t.customer || '-'} | Total Nilai: Rp ${amt.toLocaleString('id-ID')} | Status: ${t.status || 'Selesai'} | Pembayaran: ${t.paymentStatus || 'Lunas'} | Sales: ${t.sales || t.salesName || '-'} | Item: [${itemsStr || 'N/A'}]`;
}).join('\n')}

--- [MENU 2: DAFTAR KONTAK & PELANGGAN LENGKAP] ---
* Total Kontak: ${agg.compCustomers.length} Pelanggan
${agg.compCustomers.map(c => `  - ${c.nama} (Perusahaan: ${c.perusahaan || '-'}, PIC: ${c.pic || '-'}, Kota: ${c.kota || '-'}, Telp/WA: ${c.whatsapp || c.phone || '-'}, Sales: ${c.sales || '-'}, Status: ${c.leadType || 'Aktif'})`).join('\n')}

--- [MENU 3: PENAWARAN (QUOTATIONS) & FOLLOW-UP DETAIL] ---
* Total Penawaran: ${agg.totalQuotes} penawaran (Nilai Total: Rp ${agg.totalNilaiPenawaran.toLocaleString('id-ID')})
${agg.quoteList.map(q => `  - [${q.noTrx}] Pelanggan: ${q.customer} | Tanggal: ${q.tanggal} | Rp ${q.total.toLocaleString('id-ID')} | Status: ${q.followedUp ? 'Sudah Follow-Up' : 'Menunggu'} | Terakhir: ${q.lastFollowUpDate} | Catatan: ${q.notes} | Sales: ${q.sales}`).join('\n')}

--- [MENU 4: KATALOG & STOK PRODUK LENGKAP] ---
* Total SKU: ${agg.compProducts.length} Produk
${agg.compProducts.map(p => {
  const stockVal = getProductStock(p, agg.allPOs, agg.compTransactions);
  const specStr = p.specifications || p.deskripsi || p.description || 'Belum diisi';
  const mainFunc = p.mainFunction || p.fungsi || 'Belum diisi';
  const mainApp = p.mainApplication || p.aplikasi || 'Belum diisi';
  const dim = (p.panjang || p.lebar || p.tinggi) ? `${p.panjang || 0} x ${p.lebar || 0} x ${p.tinggi || 0} cm` : (p.dimensi || 'Belum diisi');
  const weight = p.berat ? `${p.berat} kg` : 'Belum diisi';
  const price = Number(p.hargaJual) || Number(p.harga) || Number(p.price) || 0;
  return `  - SKU [${p.kode || p.id}] ${p.nama || p.name} (SISA STOK AKURAT: ${stockVal} ${p.satuan || p.unit || 'unit'}) | Harga Jual: Rp ${price.toLocaleString('id-ID')}
    * Fungsi: ${mainFunc} | Aplikasi: ${mainApp} | Dimensi: ${dim} | Berat: ${weight} | Spesifikasi: ${specStr}`;
}).join('\n') || '  (Belum ada data produk di database)'}

--- [MENU 5: FINANCE - PIUTANG USAHA (TAGIHAN BELUM LUNAS)] ---
* Total Piutang: Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.unpaidInvoicesList.length} tagihan)
${agg.unpaidInvoicesList.map(u => `  - Invoice [${u.noTrx}] Pelanggan: ${u.customer} | Tanggal: ${u.tanggal} | Total: Rp ${u.total.toLocaleString('id-ID')} | Sisa: Rp ${u.sisa.toLocaleString('id-ID')} | Sales: ${u.sales}`).join('\n') || '  - ✅ Tidak ada piutang tertunggak.'}

--- [MENU 6: PURCHASING & SUPPLIER] ---
* Total Supplier: ${agg.allSuppliers.length} vendor | PO: ${agg.allPOs.length} PO (Total: Rp ${agg.totalPOAmount.toLocaleString('id-ID')})
${agg.allPOs.map(po => `  - PO [${po.noPO || po.id}] Vendor: ${po.supplierName || '-'} | Tanggal: ${po.tanggal || po.tanggalPembelian || '-'} | Total: Rp ${(Number(po.total) || 0).toLocaleString('id-ID')} | Status: ${po.status || 'Draft'}`).join('\n')}

--- [MENU 7: HR - KARYAWAN & TIM] ---
* Total Karyawan: ${agg.allEmployees.length} staf
${agg.allEmployees.map(e => `  - ${e.nama} | Jabatan: ${e.role || '-'} | WA: ${e.whatsapp || '-'}${isSuperAdmin && e.gaji ? ` | Gaji: Rp ${Number(e.gaji).toLocaleString('id-ID')}` : ''}`).join('\n')}
`;

  // Include Task App data if available (SuperAdmin / Team)
  if (ctx.taskAppData && (ctx.taskAppData.tasks?.length || ctx.taskAppData.projects?.length)) {
    const tasks = ctx.taskAppData.tasks || [];
    const projects = ctx.taskAppData.projects || [];
    digest += `\n--- [MENU 8: TASK APP & PROYEK TIM] ---
* Total Task: ${tasks.length} task (${tasks.filter(t => t.status === 'Selesai').length} Selesai)
${tasks.map(t => `  - Task: "${t.title}" | Status: ${t.status} | Prioritas: ${t.priority || 'Medium'} | Progress: ${t.progress || 0}% | PIC: ${t.employeeName || t.owner || '-'}`).join('\n')}
* Total Proyek: ${projects.length} proyek
${projects.map(p => `  - Proyek [${p.code || 'PRJ'}]: "${p.title}" | Klien: ${p.clientName || '-'} | Status: ${p.status} | Lead: ${p.leadEngineer || '-'}`).join('\n')}
`;
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
      digest += `* TRANSAKSI KUNCI COCOK [${t.noTrx || t.id}]: Pelanggan: ${t.customerName || t.customer || '-'} | Tanggal: ${t.tanggal || '-'} | Nominal Rp: ${amt.toLocaleString('id-ID')} | Status Pesanan: ${t.status || 'Selesai'} | Pembayaran: ${t.paymentStatus || 'Lunas'} | Sales Rep: ${t.sales || t.salesName || '-'} | Items: [${itemsStr}]\n`;
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
        digest += `* PRODUK KUNCI COCOK [SKU: ${p.kode || p.id}]: Nama: "${p.nama || p.name}" | SISA STOK AKURAT DATABASE REAL-TIME: ${stockVal} ${p.satuan || p.unit || 'unit'} | Harga Jual: Rp ${price.toLocaleString('id-ID')} | Deskripsi: ${p.deskripsi || p.specifications || 'N/A'}\n`;
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

  const systemPrompt = `Anda adalah "Panca AI Assistant", asisten kecerdasan buatan terpadu yang profesional, ramah, dan analis data bisnis untuk PT. Panca Prima Wijaya (MyPanca CRM & ERP).
Nama Pengguna: ${userName}
Peran Pengguna: ${ctx.currentUser?.role || 'Staff'}
Perusahaan Aktif: ${ctx.activeCompany?.nama || 'PT. PANCA PRIMA WIJAYA'}

================================================================================
ATURAN UTAMA & PROTOKOL LAYANAN BERSIH & AKURAT (NO-EMOJI CLUTTER GUARANTEE):
================================================================================

1. NADA BICARA & FORMAT RESPON:
   - Bersikaplah sopan, profesional, membantu, dan lugas.
   - Gunakan sapaan "Bapak/Ibu" atau sebut nama "${userName}" secara wajar.
   - DILARANG MENGGUNAKAN BANYAK EMOJI ATAU SIMBOL DEKORATIF BERLEBIHAN. Jangan gunakan emoji di setiap baris, setiap poin, atau setiap sel tabel. Maksimal 0 sampai 1 emoji sederhana jika sangat diperlukan. Tampilan harus bersih dan elegan.

2. PENGETAHUAN KODE TRANSAKSI LAMA (TRX) & BARU (PP):
   - Sistem MyPanca menggunakan 2 format nomor transaksi:
     * Format LAMA: Memakai awalan "TRX-..." (Contoh: TRX-01, TRX-70, TRX70).
     * Format BARU: Memakai awalan "PP-..." (Contoh: PP-001, PP-2026-01, PP001).
   - Anda HARUS mengenali kedua format tersebut secara setara dari database real-time yang dilampirkan.

3. AKURASI UTAMA & DILARANG MEMOTONG JAWABAN:
   - JAWABAN ANDA HARUS DITULIS LENGKAP DARI AWAL SAMPAI AKHIR TANPA TERPOTONG DI TENGAH JALAN.
   - Utamakan AKURASI DATA berdasarkan database faktual yang dilampirkan.
   - JANGAN MENGARANG DRAFT ATAU DATA TRANSAKSI JIKA TIDAK ADA DI DATABASE. Jika transaksi tidak ditemukan, jawab jujur:
     "Maaf **${userName}**, nomor transaksi **[Nomor]** tidak ditemukan di database MyPanca. Silakan periksa kembali nomor transaksinya."

4. SAJIKAN TABEL MARKDOWN DENGAN RAPI & TERSTRUKTUR:
   - Ketika menyajikan daftar transaksi, piutang, produk, atau laporan, gunakan TABEL MARKDOWN LENGKAP dengan header yang jelas tanpa hiasan emoji di judul/kolom.
   - Contoh Header Tabel Transaksi:
     | No. Transaksi | Tanggal | Pelanggan | Nominal Rp | Status Pesanan | Status Pembayaran | Sales Rep |

5. KLARIFIKASI DAHULU JIKA PERTANYAAN TERLALU UMUM:
   - Jika pengguna bertanya hal umum tanpa periode (seperti hanya "omset" atau "transaksi"), tanyakan periode bulan/tahun yang ingin diperiksa secara jelas.

6. BILA PENGGUNA INGIN INPUT DATA BARU (CUSTOMER, TRANSAKSI, PENAWARAN):
   - Pandu pengguna mengisi data secara BERTAHAP (satu per satu sesuai kolom form asli), lalu di akhir tampilkan tabel pratinjau draft dan minta konfirmasi simpan.

7. AKURASI STOK PRODUK REAL DATABASE:
   - Nilai sisa stok produk tertera dengan jelas di [MENU 4: KATALOG & STOK PRODUK LENGKAP] dan di bagian [PENCARIAN SANGAT SPESIFIK & PRESISI LENGKAP UNTUK PRODUK] sebagai "SISA STOK AKURAT DATABASE REAL-TIME: X unit".
   - Jika nilai stok pada database tertera > 0 (misalnya 1 unit, 5 unit, dsb.), ANDA WAJIB MENJAWAB DENGAN JUMLAH STOK TERSEBUT. DILARANG KERAS MENYATAKAN STOK 0 ATAU KOSONG BILA DATABASE MENUNJUKKAN STOK TERSEDIA.

${dataDigest}
`;

  const recentHistory = history.slice(-8).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }));

  return await callGeminiWithKeyRotation({
    systemPrompt,
    messages: recentHistory,
    userPrompt: userQuery,
    preferredModel: 'gemini-3.5-flash',
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

  // Default response with context summary
  return `### 📋 Data Sistem MyPanca yang Terbaca:\n\n` +
    `- **Pelanggan Terdaftar**: ${agg.compCustomers.length} kontak\n` +
    `- **Total Transaksi**: ${agg.compTransactions.length} transaksi tercatat\n` +
    `- **Katalog Produk**: ${agg.compProducts.length} SKU (Stok menipis: ${agg.lowStockProducts.length} SKU)\n` +
    `- **Sisa Piutang**: Rp ${agg.totalPiutangAmount.toLocaleString('id-ID')} (${agg.unpaidInvoicesList.length} invoice)\n\n` +
    `Mohon tanyakan data spesifik yang ingin diperiksa, seperti: nama pelanggan, nomor transaksi (*TRX-...*), stok produk, atau laporan omzet.`;
};
