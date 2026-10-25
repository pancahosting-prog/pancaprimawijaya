import React, { useState, useMemo } from 'react';
import { 
  Package, Search, Plus, Filter, AlertTriangle, CheckCircle2, 
  ArrowLeft, X, Eye, Layers, Clock, ArrowDownRight, ArrowUpRight, 
  History, Calendar, FileText, ChevronRight, Box
} from 'lucide-react';

interface ProductLot {
  lot?: number;
  kode?: string;
  stock: number;
  tanggal?: string;
}

interface ProductItem {
  id: string;
  nama: string;
  kode?: string;
  kategori?: string;
  stok?: number;
  minStok?: number;
  satuan?: string;
  spesifikasi?: string;
  mainFunction?: string;
  mainApplication?: string;
  remarks?: string;
  foto?: string;
  image?: string;
  lots?: ProductLot[];
  companyId?: string;
  company_id?: string;
}

interface PancaProductsMobileViewProps {
  products: ProductItem[];
  purchaseOrders?: any[];
  transactions?: any[];
  currentUser?: {
    username: string;
    role: string;
    nama: string;
  } | null;
  activeCompany?: any;
  setProducts?: React.Dispatch<React.SetStateAction<any[]>>;
  syncToSupabase?: (table: string, data: any) => void;
  onOpenNewPO?: () => void;
}

export const PancaProductsMobileView: React.FC<PancaProductsMobileViewProps> = ({
  products = [],
  purchaseOrders = [],
  transactions = [],
  currentUser,
  activeCompany,
  setProducts,
  syncToSupabase,
  onOpenNewPO
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'safe' | 'low'>('all');
  
  // Modals state
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<ProductItem | null>(null);
  const [showAddProductModal, setShowAddProductModal] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Form New Product State (WITHOUT PRICE / HPP)
  const [newProdData, setNewProdData] = useState({
    nama: '',
    kode: '',
    kategori: 'Fumigasi',
    satuan: 'Unit',
    stok: 0,
    minStok: 5,
    spesifikasi: '',
    mainFunction: '',
    mainApplication: '',
    remarks: ''
  });

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.kategori && p.kategori.trim()) set.add(p.kategori.trim());
    });
    return ['Semua', ...Array.from(set)];
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        (p.nama || '').toLowerCase().includes(q) || 
        (p.kode || '').toLowerCase().includes(q) || 
        (p.kategori || '').toLowerCase().includes(q);

      const matchCat = selectedCategory === 'Semua' || (p.kategori || '').toLowerCase() === selectedCategory.toLowerCase();

      const stokVal = Number(p.stok) || 0;
      const minVal = Number(p.minStok) || 5;

      let matchStatus = true;
      if (stockStatusFilter === 'safe') matchStatus = stokVal > minVal;
      if (stockStatusFilter === 'low') matchStatus = stokVal <= minVal;

      return matchSearch && matchCat && matchStatus;
    });
  }, [products, searchQuery, selectedCategory, stockStatusFilter]);

  // Inventory stats
  const totalSku = products.length;
  const safeStockCount = products.filter(p => (Number(p.stok) || 0) > (Number(p.minStok) || 5)).length;
  const lowStockCount = products.filter(p => (Number(p.stok) || 0) <= (Number(p.minStok) || 5)).length;

  // Stock Movement History Helper (WITHOUT PRICE / FINANCIAL AMOUNTS)
  const getProductStockHistory = (product: ProductItem) => {
    const history: any[] = [];
    
    // Inbound from Purchase Orders
    purchaseOrders.filter(po => po.status === 'Received' || po.status === 'Lunas').forEach(po => {
      if (po.items && Array.isArray(po.items)) {
        const item = po.items.find((i: any) => i.produkId === product.id);
        if (item) {
          history.push({
            type: 'IN',
            source: 'Purchase Order',
            ref: po.id,
            date: po.tanggalDiterima || po.tanggalPembelian || po.createdAt || '-',
            qty: Number(item.jumlah) || 0,
            user: po.orderedBy || 'Purchasing',
            notes: 'Penerimaan Stok Masuk (PO)'
          });
        }
      } else if (po.produkId === product.id) {
        history.push({
          type: 'IN',
          source: 'Purchase Order',
          ref: po.id,
          date: po.tanggalDiterima || po.tanggalPembelian || po.createdAt || '-',
          qty: Number(po.jumlah) || 0,
          user: po.orderedBy || 'Purchasing',
          notes: 'Penerimaan Stok Masuk (PO)'
        });
      }
    });

    // Outbound from Transactions (Orders Shipped / Completed)
    transactions.filter(t => !(t.statuses || []).includes('Batal') && ((t.statuses || []).includes('Pengiriman') || (t.statuses || []).includes('Selesai'))).forEach(t => {
      if (t.items && Array.isArray(t.items)) {
        const item = t.items.find((i: any) => i.produkId === product.id);
        if (item) {
          history.push({
            type: 'OUT',
            source: 'Pengiriman Transaksi',
            ref: t.noTrx || t.id,
            date: t.tanggal || t.createdAt || '-',
            qty: Number(item.qty) || 0,
            user: t.sales || 'Sales',
            notes: `Pengeluaran Pesanan Pelanggan (${t.customerName || t.customer || 'Customer'})`
          });
        }
      }
    });

    // Sort newest first
    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdData.nama.trim()) {
      alert('Nama produk wajib diisi.');
      return;
    }

    const newId = 'P-' + Date.now();
    const activeCompanyId = activeCompany?.id || '1';
    const initStok = Number(newProdData.stok) || 0;

    const initialLots = initStok > 0 ? [{
      lot: Date.now(),
      kode: 'INITIAL',
      stock: initStok,
      tanggal: new Date().toISOString().split('T')[0]
    }] : [];

    const newProduct: ProductItem = {
      id: newId,
      nama: newProdData.nama.trim(),
      kode: newProdData.kode.trim() || 'SKU-' + newId.slice(-4),
      kategori: newProdData.kategori.trim() || 'Umum',
      satuan: newProdData.satuan.trim() || 'Unit',
      stok: initStok,
      minStok: Number(newProdData.minStok) || 5,
      spesifikasi: newProdData.spesifikasi.trim(),
      mainFunction: newProdData.mainFunction.trim(),
      mainApplication: newProdData.mainApplication.trim(),
      remarks: newProdData.remarks.trim(),
      lots: initialLots,
      companyId: activeCompanyId,
      company_id: activeCompanyId
    };

    if (setProducts) {
      setProducts(prev => [newProduct, ...prev]);
    }
    if (syncToSupabase) {
      syncToSupabase('products', newProduct);
    }

    setSaveSuccessMsg(`Produk "${newProduct.nama}" berhasil disimpan.`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
    setShowAddProductModal(false);
    setNewProdData({
      nama: '',
      kode: '',
      kategori: 'Fumigasi',
      satuan: 'Unit',
      stok: 0,
      minStok: 5,
      spesifikasi: '',
      mainFunction: '',
      mainApplication: '',
      remarks: ''
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-zinc-950 overflow-hidden font-sans">
      {/* Top Header */}
      <div className="px-4 py-3 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Package size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-900 dark:text-white truncate uppercase tracking-tight">Katalog & Stok Produk</h2>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold truncate">Role Stocklist • Tanpa Akses Harga</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenNewPO && (
              <button 
                onClick={onOpenNewPO}
                className="px-2.5 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-black rounded-xl shadow-xs hover:bg-black active:scale-95 transition flex items-center gap-1"
                title="Tambah Stok via Purchase Order"
              >
                <Plus size={14} />
                <span>+ Stok (PO)</span>
              </button>
            )}
            <button 
              onClick={() => setShowAddProductModal(true)}
              className="px-2.5 py-1.5 bg-violet-600 text-white text-[11px] font-black rounded-xl shadow-xs hover:bg-violet-700 active:scale-95 transition flex items-center gap-1"
              title="Tambah Master Produk Baru"
            >
              <Plus size={14} />
              <span>Produk Baru</span>
            </button>
          </div>
        </div>

        {/* Success Toast */}
        {saveSuccessMsg && (
          <div className="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span className="truncate">{saveSuccessMsg}</span>
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div 
            onClick={() => setStockStatusFilter('all')}
            className={`p-2 rounded-xl border transition cursor-pointer ${stockStatusFilter === 'all' ? 'bg-violet-50 dark:bg-violet-950/50 border-violet-300 dark:border-violet-700' : 'bg-slate-50 dark:bg-zinc-800/60 border-slate-200/80 dark:border-zinc-800'}`}
          >
            <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Total SKU</div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{totalSku}</div>
          </div>
          <div 
            onClick={() => setStockStatusFilter('safe')}
            className={`p-2 rounded-xl border transition cursor-pointer ${stockStatusFilter === 'safe' ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700' : 'bg-slate-50 dark:bg-zinc-800/60 border-slate-200/80 dark:border-zinc-800'}`}
          >
            <div className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">Stok Aman</div>
            <div className="text-sm font-black text-emerald-700 dark:text-emerald-300 mt-0.5">{safeStockCount}</div>
          </div>
          <div 
            onClick={() => setStockStatusFilter('low')}
            className={`p-2 rounded-xl border transition cursor-pointer ${stockStatusFilter === 'low' ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700' : 'bg-slate-50 dark:bg-zinc-800/60 border-slate-200/80 dark:border-zinc-800'}`}
          >
            <div className="text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 tracking-wider">Menipis/Habis</div>
            <div className="text-sm font-black text-rose-700 dark:text-rose-300 mt-0.5">{lowStockCount}</div>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mt-2.5">
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama produk, SKU, atau kategori..."
            className="w-full pl-8 pr-3 py-2 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 outline-none focus:border-violet-500"
          />
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category Horizontal Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pt-2 pb-0.5">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product List Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {filteredProducts.length > 0 ? (
          filteredProducts.map(prod => {
            const stokVal = Number(prod.stok) || 0;
            const minVal = Number(prod.minStok) || 5;
            const isLow = stokVal <= minVal;
            const isZero = stokVal <= 0;

            return (
              <div 
                key={prod.id}
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3 shadow-2xs hover:border-slate-300 dark:hover:border-zinc-700 transition"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="font-mono text-[9px] font-black uppercase bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 px-1.5 py-0.5 rounded">
                        {prod.kode || 'NO-SKU'}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">
                        {prod.kategori || 'Umum'}
                      </span>
                    </div>

                    <h3 className="font-extrabold text-xs text-slate-900 dark:text-white leading-tight">
                      {prod.nama}
                    </h3>

                    {/* Stock Status Pill */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black inline-flex items-center gap-1 ${
                        isZero 
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400' 
                          : isLow 
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' 
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                      }`}>
                        <Box size={11} />
                        <span>Stok: {stokVal} {prod.satuan || 'Unit'}</span>
                      </div>

                      <span className="text-[10px] text-slate-400 font-semibold">
                        Min: {minVal} {prod.satuan || 'Unit'}
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setSelectedDetailProduct(prod)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-[10px] font-extrabold rounded-xl transition flex items-center gap-1 shrink-0"
                  >
                    <Eye size={12} />
                    <span>Detail</span>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-2">
            <Package size={32} className="mx-auto text-slate-300 dark:text-zinc-600" />
            <div className="font-extrabold text-xs text-slate-700 dark:text-zinc-200">Tidak ada produk ditemukan</div>
            <div className="text-[11px] text-slate-400">Silakan ubah kata kunci pencarian atau filter kategori.</div>
          </div>
        )}
      </div>

      {/* MODAL 1: DETAIL PRODUK & RIWAYAT MUTASI (TANPA HARGA) */}
      {selectedDetailProduct && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-zinc-800 max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-250">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Detail Produk & Stok</span>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  {selectedDetailProduct.nama}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedDetailProduct(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Badges Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-700">
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Kode SKU</div>
                  <div className="font-mono font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{selectedDetailProduct.kode || '-'}</div>
                </div>
                <div className="bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-700">
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Kategori</div>
                  <div className="font-bold text-slate-800 dark:text-zinc-100 mt-0.5 truncate">{selectedDetailProduct.kategori || 'Umum'}</div>
                </div>
                <div className="bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-700">
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Satuan</div>
                  <div className="font-bold text-slate-800 dark:text-zinc-100 mt-0.5">{selectedDetailProduct.satuan || 'Unit'}</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/60 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <div className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase">Total Stok</div>
                  <div className="font-black text-emerald-700 dark:text-emerald-300 mt-0.5">{selectedDetailProduct.stok || 0} {selectedDetailProduct.satuan || 'Unit'}</div>
                </div>
              </div>

              {/* Technical Specifications */}
              {(selectedDetailProduct.spesifikasi || selectedDetailProduct.mainFunction || selectedDetailProduct.mainApplication || selectedDetailProduct.remarks) && (
                <div className="bg-slate-50 dark:bg-zinc-800/80 rounded-2xl p-3.5 border border-slate-200/80 dark:border-zinc-700/80 space-y-2.5">
                  <div className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider flex items-center gap-1.5">
                    <FileText size={12} />
                    <span>Informasi & Spesifikasi Teknis</span>
                  </div>
                  {selectedDetailProduct.spesifikasi && (
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Spesifikasi:</div>
                      <div className="text-slate-700 dark:text-zinc-200 whitespace-pre-wrap">{selectedDetailProduct.spesifikasi}</div>
                    </div>
                  )}
                  {selectedDetailProduct.mainFunction && (
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Fungsi Utama:</div>
                      <div className="text-slate-700 dark:text-zinc-200 whitespace-pre-wrap">{selectedDetailProduct.mainFunction}</div>
                    </div>
                  )}
                  {selectedDetailProduct.mainApplication && (
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Aplikasi:</div>
                      <div className="text-slate-700 dark:text-zinc-200 whitespace-pre-wrap">{selectedDetailProduct.mainApplication}</div>
                    </div>
                  )}
                  {selectedDetailProduct.remarks && (
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Keterangan:</div>
                      <div className="text-slate-700 dark:text-zinc-200 whitespace-pre-wrap">{selectedDetailProduct.remarks}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Stock Lots */}
              {selectedDetailProduct.lots && selectedDetailProduct.lots.length > 0 && (
                <div className="bg-white dark:bg-zinc-800/50 rounded-2xl p-3 border border-slate-200 dark:border-zinc-700">
                  <div className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider mb-2 flex items-center gap-1.5">
                    <Layers size={12} />
                    <span>Daftar Stok (Lots)</span>
                  </div>
                  <div className="space-y-1.5">
                    {selectedDetailProduct.lots.map((lot, lIdx) => (
                      <div key={lIdx} className="flex justify-between items-center text-xs py-1 border-b border-slate-100 dark:border-zinc-700/60 last:border-0">
                        <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">{lot.kode || `Lot #${lot.lot || lIdx + 1}`}</span>
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{lot.stock} {selectedDetailProduct.satuan || 'Unit'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock Movement History (NO PRICE / FINANCIAL VALUES) */}
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider flex items-center gap-1.5">
                  <History size={12} />
                  <span>Riwayat Stok & Mutasi Aktivitas (Tanpa Harga)</span>
                </div>

                {(() => {
                  const movements = getProductStockHistory(selectedDetailProduct);
                  if (movements.length === 0) {
                    return (
                      <div className="p-4 bg-slate-50 dark:bg-zinc-800 rounded-xl text-center text-slate-400 text-xs italic">
                        Belum ada catatan mutasi stok masuk atau keluar untuk produk ini.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {movements.map((m, mIdx) => (
                        <div key={mIdx} className="p-2.5 bg-slate-50 dark:bg-zinc-800 rounded-xl border border-slate-100 dark:border-zinc-700 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                m.type === 'IN' 
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              }`}>
                                {m.type === 'IN' ? 'Stok Masuk (IN)' : 'Stok Keluar (OUT)'}
                              </span>
                              <span className="font-mono text-[9px] text-slate-400">{m.ref}</span>
                            </div>
                            <div className="text-[11px] font-bold text-slate-800 dark:text-zinc-200">{m.notes}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <Calendar size={10} />
                              <span>{m.date}</span>
                              <span>•</span>
                              <span>Oleh: {m.user}</span>
                            </div>
                          </div>

                          <div className={`text-sm font-black shrink-0 ${m.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {m.type === 'IN' ? `+${m.qty}` : `-${m.qty}`} {selectedDetailProduct.satuan || 'Unit'}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 flex justify-end">
              <button 
                onClick={() => setSelectedDetailProduct(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs rounded-xl hover:bg-black transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: FORM TAMBAH PRODUK & STOK (CRM VERSION WITHOUT PRICE FIELDS) */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-zinc-800 max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-250">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Tambah Produk & Stok Baru</h3>
                <p className="text-[10px] text-slate-400 font-semibold">Formulir Stokist CRM • Tanpa Kolom Harga</p>
              </div>
              <button 
                onClick={() => setShowAddProductModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-5 space-y-3.5 text-xs">
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">Nama Produk *</label>
                <input 
                  type="text" 
                  required
                  value={newProdData.nama} 
                  onChange={(e) => setNewProdData({...newProdData, nama: e.target.value})} 
                  placeholder="Contoh: Fumiphos 56 TB (Tablet)" 
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">Kode SKU</label>
                  <input 
                    type="text" 
                    value={newProdData.kode} 
                    onChange={(e) => setNewProdData({...newProdData, kode: e.target.value})} 
                    placeholder="Contoh: SKU-FUM-01" 
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">Kategori</label>
                  <input 
                    type="text" 
                    value={newProdData.kategori} 
                    onChange={(e) => setNewProdData({...newProdData, kategori: e.target.value})} 
                    placeholder="Fumigasi / Sensor / Alat" 
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">Satuan</label>
                  <select 
                    value={newProdData.satuan} 
                    onChange={(e) => setNewProdData({...newProdData, satuan: e.target.value})} 
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                  >
                    <option value="Unit">Unit</option>
                    <option value="PCS">PCS</option>
                    <option value="Botol">Botol</option>
                    <option value="Kaleng">Kaleng</option>
                    <option value="Box">Box</option>
                    <option value="Drum">Drum</option>
                    <option value="Roll">Roll</option>
                    <option value="Set">Set</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">Stok Awal</label>
                  <input 
                    type="number" 
                    min="0"
                    value={newProdData.stok} 
                    onChange={(e) => setNewProdData({...newProdData, stok: Number(e.target.value)})} 
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">Min. Stok</label>
                  <input 
                    type="number" 
                    min="0"
                    value={newProdData.minStok} 
                    onChange={(e) => setNewProdData({...newProdData, minStok: Number(e.target.value)})} 
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">Spesifikasi</label>
                <textarea 
                  rows={2}
                  value={newProdData.spesifikasi} 
                  onChange={(e) => setNewProdData({...newProdData, spesifikasi: e.target.value})} 
                  placeholder="Bahan aktif, ukuran, berat, dll..." 
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500 resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">Fungsi Utama & Aplikasi</label>
                <textarea 
                  rows={2}
                  value={newProdData.mainFunction} 
                  onChange={(e) => setNewProdData({...newProdData, mainFunction: e.target.value})} 
                  placeholder="Kegunaan produk untuk penanganan hama / monitoring..." 
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500 resize-none"
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs rounded-xl shadow-lg transition active:scale-98"
                >
                  Simpan Produk & Stok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
