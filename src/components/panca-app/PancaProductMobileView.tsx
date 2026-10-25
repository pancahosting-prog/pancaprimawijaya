import React, { useState, useMemo } from 'react';
import { 
  Package, Search, Plus, AlertTriangle, CheckCircle2, 
  Layers, ArrowDownLeft, ArrowUpRight, History, X, 
  FileText, Info, Filter, ArrowLeft, RefreshCw
} from 'lucide-react';

interface PancaProductMobileViewProps {
  products: any[];
  purchaseOrders: any[];
  transactions: any[];
  setProducts?: React.Dispatch<React.SetStateAction<any[]>>;
  syncToSupabase?: (table: string, data: any) => void;
  currentUser?: {
    username: string;
    role: string;
    nama: string;
  } | null;
  activeCompany?: any;
  onGoToChatWithPrompt?: (prompt: string) => void;
}

export const PancaProductMobileView: React.FC<PancaProductMobileViewProps> = ({
  products = [],
  purchaseOrders = [],
  transactions = [],
  setProducts,
  syncToSupabase,
  currentUser,
  activeCompany,
  onGoToChatWithPrompt
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [onlyLowStock, setOnlyLowStock] = useState<boolean>(false);
  const [detailProduct, setDetailProduct] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // New product form state (without price / HPP)
  const [newProd, setNewProd] = useState<{
    nama: string;
    kode: string;
    kategori: string;
    satuan: string;
    stokAwal: number;
    minStok: number;
    spesifikasi: string;
    fungsiUtama: string;
    mainApplication: string;
    remarks: string;
  }>({
    nama: '',
    kode: '',
    kategori: 'Umum',
    satuan: 'Unit',
    stokAwal: 0,
    minStok: 10,
    spesifikasi: '',
    fungsiUtama: '',
    mainApplication: '',
    remarks: ''
  });

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.kategori) set.add(p.kategori);
    });
    return ['Semua', ...Array.from(set)];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = searchTerm.toLowerCase();
      const matchSearch = !q || 
        (p.nama || '').toLowerCase().includes(q) || 
        (p.kode || '').toLowerCase().includes(q) ||
        (p.kategori || '').toLowerCase().includes(q);

      const matchCat = selectedCategory === 'Semua' || p.kategori === selectedCategory;

      const stock = Number(p.stok) || 0;
      const min = Number(p.minStok) || 10;
      const matchLow = !onlyLowStock || stock <= min;

      return matchSearch && matchCat && matchLow;
    });
  }, [products, searchTerm, selectedCategory, onlyLowStock]);

  // Calculate stock history without financial data
  const getProductStockHistory = (prod: any) => {
    if (!prod) return [];
    const history: any[] = [];

    // From POs (IN)
    (purchaseOrders || [])
      .filter((po: any) => po.status === 'Received' || po.status === 'Lunas')
      .forEach((po: any) => {
        if (po.items && Array.isArray(po.items)) {
          const item = po.items.find((i: any) => i.produkId === prod.id || i.productId === prod.id);
          if (item) {
            history.push({
              type: 'IN',
              source: 'Purchase Order',
              id: po.id,
              date: po.tanggalDiterima || po.tanggalPembelian || po.createdAt || '-',
              qty: Number(item.jumlah) || Number(item.qty) || 0,
              user: typeof po.orderedBy === 'string' ? po.orderedBy : 'Procurement',
              ref: po.id
            });
          }
        }
      });

    // From Transactions (OUT)
    (transactions || [])
      .filter((t: any) => !(t.statuses || []).includes('Batal') && ((t.statuses || []).includes('Pengiriman') || (t.statuses || []).includes('Selesai') || t.status === 'Selesai'))
      .forEach((t: any) => {
        if (t.items && Array.isArray(t.items)) {
          const item = t.items.find((i: any) => i.produkId === prod.id || i.productId === prod.id);
          if (item) {
            history.push({
              type: 'OUT',
              source: 'Transaksi Penjualan',
              id: t.id,
              date: t.tanggal || t.createdAt || '-',
              qty: Number(item.qty) || Number(item.jumlah) || 0,
              user: t.sales || t.salesName || 'Sales Team',
              ref: t.noTrx || t.id
            });
          }
        }
      });

    // Sort newest to oldest
    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const handleSaveNewProduct = () => {
    if (!newProd.nama.trim()) {
      alert('Mohon masukkan nama produk.');
      return;
    }
    const newId = 'P-' + Date.now();
    const newProductObj = {
      id: newId,
      kode: newProd.kode.trim() || 'SKU-' + Date.now().toString().slice(-4),
      nama: newProd.nama.trim(),
      kategori: newProd.kategori,
      satuan: newProd.satuan || 'Unit',
      stok: Number(newProd.stokAwal) || 0,
      minStok: Number(newProd.minStok) || 10,
      hargaJual: 0,
      hpp: 0,
      specifications: newProd.spesifikasi,
      mainFunction: newProd.fungsiUtama,
      mainApplication: newProd.mainApplication,
      remarks: newProd.remarks,
      companyId: activeCompany?.id || '1',
      lots: [
        {
          lot: Date.now(),
          kode: 'INIT',
          stock: Number(newProd.stokAwal) || 0,
          hpp: 0,
          hargaJual: 0,
          tanggal: new Date().toISOString().split('T')[0]
        }
      ],
      createdAt: new Date().toISOString()
    };

    if (setProducts) {
      setProducts(prev => [newProductObj, ...prev]);
    }
    if (syncToSupabase) {
      syncToSupabase('products', newProductObj);
    }

    setShowAddModal(false);
    setNewProd({
      nama: '',
      kode: '',
      kategori: 'Umum',
      satuan: 'Unit',
      stokAwal: 0,
      minStok: 10,
      spesifikasi: '',
      fungsiUtama: '',
      mainApplication: '',
      remarks: ''
    });
    alert(`Produk "${newProductObj.nama}" berhasil ditambahkan ke inventaris!`);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-zinc-950 overflow-hidden font-sans pb-16">
      {/* Top Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-4 py-3 shrink-0 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Package size={18} className="text-violet-600 dark:text-violet-400" />
            <h2 className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Katalog Produk & Stok</h2>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold mt-0.5">
            {products.length} SKU Terdaftar • Mode Stocklist (Tanpa Harga)
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-xs hover:bg-black flex items-center gap-1 active:scale-95 transition"
        >
          <Plus size={14} />
          <span>Tambah</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="p-3 bg-white dark:bg-zinc-900 border-b border-slate-200/80 dark:border-zinc-800/80 space-y-2 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari kode atau nama produk..."
            className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 placeholder:font-normal outline-none focus:border-violet-500"
          />
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
        </div>

        {/* Category Filter Pills & Low Stock Toggle */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
          <button
            onClick={() => setOnlyLowStock(!onlyLowStock)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 transition flex items-center gap-1 border ${
              onlyLowStock
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
            }`}
          >
            <AlertTriangle size={11} />
            <span>Stok Menipis</span>
          </button>

          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 transition border ${
                selectedCategory === cat
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                  : 'bg-slate-50 dark:bg-zinc-850 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {filteredProducts.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800">
            <Package size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">Tidak ada produk yang cocok</p>
            <p className="text-[11px] text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau filter kategori Anda.</p>
          </div>
        ) : (
          filteredProducts.map(prod => {
            const stock = Number(prod.stok) || 0;
            const minStok = Number(prod.minStok) || 10;
            const isLow = stock <= minStok;

            return (
              <div 
                key={prod.id} 
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3.5 shadow-2xs hover:border-slate-300 dark:hover:border-zinc-700 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded font-mono font-bold text-[9px] uppercase border border-slate-200 dark:border-zinc-700">
                        {prod.kode || prod.id}
                      </span>
                      {prod.kategori && (
                        <span className="px-1.5 py-0.5 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 rounded font-bold text-[9px]">
                          {prod.kategori}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-xs text-slate-900 dark:text-zinc-100 leading-snug">
                      {prod.nama}
                    </h3>
                  </div>

                  {/* Stock Badge */}
                  <div className="text-right shrink-0">
                    <div className={`px-2 py-1 rounded-xl text-center border ${
                      isLow 
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400' 
                        : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400'
                    }`}>
                      <div className="text-[9px] font-extrabold uppercase tracking-tight">Sisa Stok</div>
                      <div className="text-sm font-black leading-tight">
                        {stock} <span className="text-[10px] font-semibold">{prod.satuan || 'Unit'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <div className="text-[10px] text-slate-400 font-medium">
                    Min. Stok: <span className="font-bold text-slate-700 dark:text-zinc-300">{minStok}</span>
                  </div>

                  <button
                    onClick={() => setDetailProduct(prod)}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 font-bold text-[10px] rounded-lg transition"
                  >
                    Lihat Detail
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* --- MODAL DETAIL PRODUK (WITHOUT PRICES) --- */}
      {detailProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-zinc-800 max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[9px] font-mono font-bold uppercase text-slate-400">DETAIL PRODUK</span>
                <h3 className="text-xs font-black text-slate-900 dark:text-zinc-100 truncate max-w-[260px]">{detailProduct.nama}</h3>
              </div>
              <button
                onClick={() => setDetailProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs custom-scrollbar">
              {/* Basic Info Card */}
              <div className="bg-slate-50 dark:bg-zinc-800/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-zinc-750 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[9px] font-bold uppercase text-slate-400 block">Kode SKU</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">{detailProduct.kode || detailProduct.id}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase text-slate-400 block">Kategori</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">{detailProduct.kategori || 'Umum'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase text-slate-400 block">Sisa Stok Fisik</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                      {detailProduct.stok || 0} {detailProduct.satuan || 'Unit'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase text-slate-400 block">Batas Min. Stok</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">{detailProduct.minStok || 10} {detailProduct.satuan || 'Unit'}</span>
                  </div>
                </div>
              </div>

              {/* Technical Information */}
              {(detailProduct.specifications || detailProduct.mainFunction || detailProduct.mainApplication || detailProduct.remarks) && (
                <div className="space-y-2.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Informasi Teknis & Spesifikasi</div>
                  {detailProduct.specifications && (
                    <div className="p-3 bg-slate-50/70 dark:bg-zinc-800/40 rounded-xl border border-slate-100 dark:border-zinc-800">
                      <div className="text-[9px] font-extrabold uppercase text-slate-500 mb-0.5">Spesifikasi</div>
                      <div className="text-[11px] text-slate-700 dark:text-zinc-300 whitespace-pre-wrap">{detailProduct.specifications}</div>
                    </div>
                  )}
                  {detailProduct.mainFunction && (
                    <div className="p-3 bg-slate-50/70 dark:bg-zinc-800/40 rounded-xl border border-slate-100 dark:border-zinc-800">
                      <div className="text-[9px] font-extrabold uppercase text-slate-500 mb-0.5">Fungsi Utama</div>
                      <div className="text-[11px] text-slate-700 dark:text-zinc-300 whitespace-pre-wrap">{detailProduct.mainFunction}</div>
                    </div>
                  )}
                  {detailProduct.mainApplication && (
                    <div className="p-3 bg-slate-50/70 dark:bg-zinc-800/40 rounded-xl border border-slate-100 dark:border-zinc-800">
                      <div className="text-[9px] font-extrabold uppercase text-slate-500 mb-0.5">Aplikasi Utama</div>
                      <div className="text-[11px] text-slate-700 dark:text-zinc-300 whitespace-pre-wrap">{detailProduct.mainApplication}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Riwayat Stok & Aktivitas (Strictly without Price/Nominal) */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <History size={13} className="text-violet-500" />
                  <span>Riwayat Stok & Aktivitas (Log Mutasi)</span>
                </div>

                {(() => {
                  const history = getProductStockHistory(detailProduct);
                  if (history.length === 0) {
                    return (
                      <div className="p-4 text-center bg-slate-50 dark:bg-zinc-800/50 rounded-xl border border-slate-100 dark:border-zinc-800 text-[11px] text-slate-400">
                        Belum ada riwayat mutasi stok tercatat.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                      {history.map((log, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                log.type === 'IN' 
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' 
                                  : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              }`}>
                                {log.type === 'IN' ? 'Barang Masuk' : 'Barang Keluar'}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400">{log.ref || log.id}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                              {log.date} • Oleh: {log.user}
                            </div>
                          </div>

                          <div className={`text-xs font-black shrink-0 ${
                            log.type === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}>
                            {log.type === 'IN' ? '+' : '-'}{log.qty} {detailProduct.satuan || 'Unit'}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 flex justify-end">
              <button
                onClick={() => setDetailProduct(null)}
                className="w-full py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-xs hover:bg-black transition active:scale-98"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL TAMBAH PRODUK (WITHOUT PRICES / HPP) --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-zinc-800 max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xs font-black uppercase text-slate-900 dark:text-zinc-100">Tambah Produk & Stok Baru</h3>
                <p className="text-[9px] text-slate-400 font-semibold">Mode Stocklist & Inventaris (Tanpa Field Harga)</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Fields */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 text-xs custom-scrollbar">
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500 mb-1 block">NAMA PRODUK *</label>
                <input
                  type="text"
                  value={newProd.nama}
                  onChange={(e) => setNewProd({ ...newProd, nama: e.target.value })}
                  placeholder="Contoh: Fumiphos 56 TB (Phospine)"
                  className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 mb-1 block">KODE / SKU</label>
                  <input
                    type="text"
                    value={newProd.kode}
                    onChange={(e) => setNewProd({ ...newProd, kode: e.target.value })}
                    placeholder="Contoh: FUM-001"
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 mb-1 block">KATEGORI</label>
                  <input
                    type="text"
                    value={newProd.kategori}
                    onChange={(e) => setNewProd({ ...newProd, kategori: e.target.value })}
                    placeholder="Fumigasi / Sensor / Alat Lab"
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 mb-1 block">SATUAN</label>
                  <input
                    type="text"
                    value={newProd.satuan}
                    onChange={(e) => setNewProd({ ...newProd, satuan: e.target.value })}
                    placeholder="Kaleng / Unit"
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 mb-1 block">STOK AWAL</label>
                  <input
                    type="number"
                    min="0"
                    value={newProd.stokAwal}
                    onChange={(e) => setNewProd({ ...newProd, stokAwal: Number(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-500 mb-1 block">MIN. STOK</label>
                  <input
                    type="number"
                    min="1"
                    value={newProd.minStok}
                    onChange={(e) => setNewProd({ ...newProd, minStok: Number(e.target.value) || 10 })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500 mb-1 block">SPESIFIKASI TEKNIS</label>
                <textarea
                  rows={2}
                  value={newProd.spesifikasi}
                  onChange={(e) => setNewProd({ ...newProd, spesifikasi: e.target.value })}
                  placeholder="Kandungan aktif, ukuran, material..."
                  className="w-full p-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500 resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500 mb-1 block">FUNGSI & APLIKASI UTAMA</label>
                <textarea
                  rows={2}
                  value={newProd.fungsiUtama}
                  onChange={(e) => setNewProd({ ...newProd, fungsiUtama: e.target.value })}
                  placeholder="Untuk pembasmian kutu beras, monitoring gempa..."
                  className="w-full p-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-500 resize-none"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-3 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-bold rounded-xl text-xs hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveNewProduct}
                className="flex-1 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-xl text-xs shadow-md hover:bg-black transition active:scale-98"
              >
                Simpan Produk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
