const fs = require('fs');

let content = fs.readFileSync('App.tsx', 'utf8');

const target = `                                     <div className="mt-auto pt-2 border-t border-slate-50">
                                        {activeView === 'Produk' ? (
                                            <>
                                                <div className="flex justify-between items-center mb-1 group/edit">
                                                    <span className="text-[9px] text-slate-400 uppercase font-bold">Stock</span>
                                                    <div className="flex items-center gap-1">
                                                        {canEditCurrentView && <button onClick={(e) => { e.stopPropagation(); handleQuickUpdateProduct(item, 'stock'); }} className="text-slate-300 hover:text-violet-600 opacity-0 group-hover/edit:opacity-100 transition-opacity"><Edit size={10} /></button>}
                                                        <span className="text-[10px] font-bold text-slate-700">{getAvailableStock(item.nama)}</span>
                                                    </div>
                                                </div>
                                                {activeModule !== 'Stocklist' && (
                                                    <div className="font-bold text-[#A91D3A] text-[11px] sm:text-sm mb-2 flex items-center justify-between group/edit">
                                                        <span>{item.lots && item.lots.length > 0 ? formatRupiah(item.lots[item.lots.length - 1].hargaJual) : 'Rp 0'}</span>
                                                        <div className="flex items-center gap-1">
                                                             {canEditCurrentView && <button onClick={(e) => { e.stopPropagation(); handleQuickUpdateProduct(item, 'hargaJual'); }} className="text-slate-300 hover:text-violet-600 opacity-0 group-hover/edit:opacity-100 transition-opacity"><Edit size={10} /></button>}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {activeView === 'Penawaran' ? (
                                                    <div className="font-bold text-slate-400 text-sm mb-2">-</div>
                                                ) : (
                                                    <>
                                                        {item.nilaiProyek !== undefined && <div className="font-bold text-[#A91D3A] text-sm mb-2">{formatRupiah(item.nilaiProyek)}</div>}
                                                        {activeView === 'Belum Lunas' && item.sisaPembayaran !== undefined && (
                                                            <div className="flex flex-col gap-0.5 mb-1">
                                                                <div className="text-[10px] text-red-600 font-bold">Sisa: {formatRupiah(item.sisaPembayaran)}</div>
                                                                {item.jatuhTempo && <div className="text-[9px] text-orange-600 font-bold">Due: {item.jatuhTempo}</div>}
                                                            </div>
                                                        )}
                                                        {activeView === 'PPN' && item.nilaiProyek !== undefined && (
                                                            <div className="text-[10px] text-blue-600 font-bold mb-1">PPN: {formatRupiah(item.nilaiProyek * 0.11)}</div>
                                                        )}
                                                    </>
                                                )}
                                                {item.lots && <div className="text-xs text-slate-500 mb-2">Stock: {getAvailableStock(item.nama)}</div>}
                                            </>
                                        )}`;

const replacement = `                                     <div className="mt-auto pt-2.5 border-t border-border/60">
                                        {activeView === 'Produk' ? (
                                            <>
                                                <div className="flex justify-between items-center mb-1 group/edit">
                                                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Stok Tersedia</span>
                                                    <div className="flex items-center gap-1">
                                                        {canEditCurrentView && <button onClick={(e) => { e.stopPropagation(); handleQuickUpdateProduct(item, 'stock'); }} className="text-muted-foreground hover:text-foreground opacity-0 group-hover/edit:opacity-100 transition-opacity"><Edit size={11} /></button>}
                                                        <span className="text-xs font-bold font-mono text-foreground">{getAvailableStock(item.nama)}</span>
                                                    </div>
                                                </div>
                                                {activeModule !== 'Stocklist' && (
                                                    <div className="font-bold font-mono text-foreground text-xs sm:text-sm mb-2 flex items-center justify-between group/edit">
                                                        <span>{item.lots && item.lots.length > 0 ? formatRupiah(item.lots[item.lots.length - 1].hargaJual) : 'Rp 0'}</span>
                                                        <div className="flex items-center gap-1">
                                                             {canEditCurrentView && <button onClick={(e) => { e.stopPropagation(); handleQuickUpdateProduct(item, 'hargaJual'); }} className="text-muted-foreground hover:text-foreground opacity-0 group-hover/edit:opacity-100 transition-opacity"><Edit size={11} /></button>}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {activeView === 'Penawaran' ? (
                                                    <div className="font-bold font-mono text-muted-foreground text-xs mb-2">-</div>
                                                ) : (
                                                    <>
                                                        {item.nilaiProyek !== undefined && <div className="font-bold font-mono text-foreground text-xs sm:text-sm mb-2">{formatRupiah(item.nilaiProyek)}</div>}
                                                        {activeView === 'Belum Lunas' && item.sisaPembayaran !== undefined && (
                                                            <div className="flex flex-col gap-0.5 mb-1.5">
                                                                <div className="text-[10px] text-rose-600 dark:text-rose-400 font-mono font-bold">Sisa: {formatRupiah(item.sisaPembayaran)}</div>
                                                                {item.jatuhTempo && <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Jatuh Tempo: {item.jatuhTempo}</div>}
                                                            </div>
                                                        )}
                                                        {activeView === 'PPN' && item.nilaiProyek !== undefined && (
                                                            <div className="text-[10px] text-muted-foreground font-mono font-medium mb-1">PPN: {formatRupiah(item.nilaiProyek * 0.11)}</div>
                                                        )}
                                                    </>
                                                )}
                                                {item.lots && <div className="text-[11px] font-mono text-muted-foreground mb-1.5">Stok: {getAvailableStock(item.nama)}</div>}
                                            </>
                                        )}`;

if (!content.includes(target)) {
    console.error('Target not found!');
    process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync('App.tsx', content, 'utf8');
console.log('Card footer updated successfully!');
