import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf8');

const modals = `      {/* --- IMPORT PRODUCT MODAL (SUPERADMIN ONLY) --- */}
      {showModal === 'IMPORT_PRODUCT' && currentUser?.role === 'superadmin' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-sky-50 text-slate-800">
                <div className="flex items-center gap-2">
                    <Copy className="text-sky-600 animate-pulse" size={20} />
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">
                        Import / Copy Semua Produk
                    </h3>
                </div>
                <button onClick={() => setShowModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-sky-50 rounded-xl border border-sky-100 text-slate-700">
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm">Salin Seluruh Produk Sekaligus?</h4>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1">
                            Fitur ini menyalin semua data produk dari perusahaan lain yang belum ada di perusahaan saat ini (pengecekan nama produk unik).
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            if (confirm('Yakin copy semua produk unik dari perusahaan lain?')) {
                                let importCount = 0;
                                const activeCompProdNames = products.filter(p => (p.companyId || p.company_id) === activeCompanyId).map(p => (p.nama || '').trim().toLowerCase());
                                const otherProducts = products.filter(p => (p.companyId || p.company_id) !== activeCompanyId);
                                const newAdded = [];
                                
                                otherProducts.forEach(oldP => {
                                    const nm = (oldP.nama || '').trim().toLowerCase();
                                    const isDup = activeCompProdNames.includes(nm) || newAdded.some(a => (a.nama || '').trim().toLowerCase() === nm);
                                    if (!isDup) {
                                        const newP = {
                                            ...oldP,
                                            id: 'P' + Date.now() + Math.floor(Math.random() * 100000).toString(),
                                            kode: 'PRD-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 1000),
                                            companyId: activeCompanyId,
                                            company_id: activeCompanyId,
                                            createdAt: new Date().toISOString()
                                        };
                                        newAdded.push(newP);
                                        syncToSupabase('products', newP);
                                        importCount++;
                                    }
                                });
                                
                                if (newAdded.length > 0) {
                                    setProducts(prev => [...prev, ...newAdded]);
                                    logUserAction('IMPORT_ALL_PRODUCTS', \`Superadmin mengimport \${importCount} produk baru dari perusahaan lain\`, 'System');
                                    alert(\`Sukses mengcopy \${importCount} produk ke perusahaan ini.\`);
                                } else {
                                    alert('Tidak ada produk baru yang unik ditemukan.');
                                }
                            }
                        }}
                        className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm shrink-0 cursor-pointer"
                    >
                        <Copy size={13} /> Copy Semua Sekarang
                    </button>
                </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50">
                <button onClick={() => setShowModal(null)} className="px-5 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* --- IMPORT TRANSACTION MODAL (SUPERADMIN ONLY) --- */}
      {showModal === 'IMPORT_TRANSACTION' && currentUser?.role === 'superadmin' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50 text-slate-800">
                <div className="flex items-center gap-2">
                    <Copy className="text-indigo-600 animate-pulse" size={20} />
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">
                        Import Data {activeView}
                    </h3>
                </div>
                <button onClick={() => setShowModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6 space-y-4">
                <div className="flex flex-col gap-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-slate-700">
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm">Salin Transaksi ({activeView}) Berdasarkan Sales</h4>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1 mb-4">
                            Pilih nama Sales untuk menyalin semua data <b>{activeView}</b> (dari perusahaan lain) yang dikelola oleh Sales tersebut.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Pilih Sales</label>
                                <select 
                                    className="w-full text-sm border-slate-200 rounded-lg p-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    id="importSalesSelect"
                                >
                                    <option value="">-- Pilih Sales --</option>
                                    {salesMembers.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <button
                        onClick={() => {
                            const selectedSales = (document.getElementById('importSalesSelect') as HTMLSelectElement).value;
                            if (!selectedSales) {
                                alert('Silakan pilih nama sales terlebih dahulu!');
                                return;
                            }
                            
                            if (confirm(\`Yakin copy semua transaksi (\${activeView}) milik sales \${selectedSales} dari perusahaan lain?\`)) {
                                let importCount = 0;
                                
                                // Determine the status filter based on the current active view mapping roughly
                                let targetStatuses = [];
                                if (activeView === 'Penawaran') targetStatuses = ['Penawaran'];
                                else if (activeView === 'Invoice') targetStatuses = ['Invoice'];
                                else if (activeView === 'Pembayaran' || activeView === 'Belum Lunas') targetStatuses = ['Payment', 'Penawaran', 'Invoice']; // We bring in their entire pipeline 
                                else if (activeView === 'Pengiriman') targetStatuses = ['Pengiriman'];
                                else if (activeView === 'Pesanan Selesai') targetStatuses = ['Selesai'];
                                else if (activeView === 'Pesanan Batal') targetStatuses = ['Batal'];
                                else targetStatuses = [activeView];
                                
                                // To make life easier, we will just copy transactions where t.sales === selectedSales 
                                // AND it doesn't already exist here. But since these are from other companies, 
                                // duplication check by noTrx is safest.
                                const activeCompNoTrx = transactions.filter(t => (t.companyId || t.company_id) === activeCompanyId).map(t => t.noTrx);
                                const otherTrx = transactions.filter(t => (t.companyId || t.company_id) !== activeCompanyId && t.sales === selectedSales);
                                
                                const filteredOtherTrx = otherTrx.filter(t => {
                                    if (activeView === 'Penawaran' && t.status !== 'Penawaran') return false;
                                    if (activeView === 'Invoice' && t.status !== 'Invoice') return false;
                                    if (activeView === 'Pesanan Selesai' && t.status !== 'Selesai') return false;
                                    if (activeView === 'Pesanan Batal' && t.status !== 'Batal') return false;
                                    if (activeView === 'Pengiriman' && t.status !== 'Pengiriman') return false;
                                    
                                    // For 'Pembayaran' and 'Belum Lunas' we copy if it has sales matching.
                                    // Let's just allow all that match the sales in those statuses if they want.
                                    return true;
                                });

                                const newAdded = [];
                                
                                filteredOtherTrx.forEach(oldT => {
                                    if (!activeCompNoTrx.includes(oldT.noTrx)) {
                                        const newT = {
                                            ...oldT,
                                            id: 'T' + Date.now() + Math.floor(Math.random() * 100000).toString(),
                                            companyId: activeCompanyId,
                                            company_id: activeCompanyId,
                                            createdAt: new Date().toISOString()
                                        };
                                        // Avoid duplicate loop by doing local array push
                                        activeCompNoTrx.push(newT.noTrx);
                                        newAdded.push(newT);
                                        syncToSupabase('transactions', newT);
                                        importCount++;
                                    }
                                });
                                
                                if (newAdded.length > 0) {
                                    setTransactions(prev => [...prev, ...newAdded]);
                                    logUserAction('IMPORT_TRANSACTION', \`Superadmin mengimport \${importCount} transaksi (\${activeView}) milik sales \${selectedSales}\`, 'System');
                                    alert(\`Sukses mengcopy \${importCount} transaksi ke perusahaan ini.\`);
                                } else {
                                    alert('Tidak ada transaksi baru yang ditemukan untuk kriteria ini.');
                                }
                            }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm shrink-0 cursor-pointer w-full md:w-auto mt-2"
                    >
                        <Copy size={13} /> Copy Semua Transaksi Ini
                    </button>
                </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50">
                <button onClick={() => setShowModal(null)} className="px-5 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Tutup</button>
            </div>
          </div>
        </div>
      )}
`;

const searchStrEnd = `{showModal === 'scanner'`;

if (content.includes(searchStrEnd)) {
    content = content.replace(`      {/* --- SCANNER MODAL --- */}\n      {showModal === 'scanner' && (`, modals + `\n      {/* --- SCANNER MODAL --- */}\n      {showModal === 'scanner' && (`);
    fs.writeFileSync('App.tsx', content, 'utf8');
    console.log('Modals injected!');
}

