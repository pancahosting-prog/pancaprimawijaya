import fs from 'fs';

let content = fs.readFileSync('App.tsx', 'utf8');

const prodImportBtn = `                                  {activeView === 'Produk' && currentUser?.role === 'superadmin' && (
                                      <button 
                                          onClick={() => setShowModal('IMPORT_PRODUCT')}
                                          className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                                      >
                                          <Copy size={14} />
                                          <span className="hidden md:inline">Import Produk</span>
                                          <span className="md:hidden">Import ALL</span>
                                      </button>
                                  )}`;

const trxImportBtn = `                                  {['Penawaran', 'Invoice', 'Pembayaran', 'Belum Lunas', 'Pengiriman', 'Pesanan Selesai', 'Pesanan Batal'].includes(activeView as string) && currentUser?.role === 'superadmin' && (
                                      <button 
                                          onClick={() => setShowModal('IMPORT_TRANSACTION')}
                                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                                      >
                                          <Copy size={14} />
                                          <span className="hidden md:inline">Import {activeView}</span>
                                          <span className="md:hidden">Import</span>
                                      </button>
                                  )}`;

const searchStr = `Import Semua Kontak`;

if (content.includes(searchStr)) {
    const lines = content.split(/\r?\n/);
    let startIdx = -1;
    for (let i=0; i<lines.length; i++) {
        if (lines[i].includes('Import Semua Kontak')) {
            startIdx = i;
            break;
        }
    }
    
    if (startIdx !== -1) {
        let closingIdx = -1;
        for (let j=startIdx; j<startIdx+5; j++) {
            if (lines[j].includes(')}')) {
                closingIdx = j;
                break;
            }
        }
        if (closingIdx !== -1) {
            lines.splice(closingIdx + 1, 0, prodImportBtn, trxImportBtn);
            content = lines.join('\n');
            fs.writeFileSync('App.tsx', content, 'utf8');
            console.log('Buttons injected!');
        }
    }
}
