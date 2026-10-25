import { supabase, withRetry } from './supabase';

export const loadDataFromSupabase = async () => {
    try {
        const { data: dbComps } = await supabase.from('companies').select('*');
        const { data: dbSupps } = await supabase.from('suppliers').select('*');
        const { data: dbProds } = await supabase.from('products').select('*');
        const { data: dbProductLots } = await supabase.from('product_lots').select('*');
        const { data: dbCusts } = await supabase.from('customers').select('*');
        const { data: dbTrxs } = await supabase.from('transactions').select('*');
        const { data: dbTrxItems } = await supabase.from('transaction_items').select('*');
        const { data: dbAppUsers } = await supabase.from('user_accounts').select('id, nama, username, password, whatsapp, role, permissions, company_id, created_at');
        const { data: dbPOs } = await supabase.from('purchase_orders').select('*');
        const { data: dbPOItems } = await supabase.from('purchase_order_items').select('*');
        const { data: dbRecycled } = await supabase.from('recycled_items').select('*');
        const { data: dbUserLogs, error: logErr } = await supabase.from('user_logs').select('*').order('created_at', { ascending: false }).limit(1000);
        if (logErr) console.warn('Could not load user logs, table might not exist yet:', logErr);
        const { data: dbTutorials, error: tutErr } = await supabase.from('tutorials').select('*').order('id', { ascending: true });
        if (tutErr) console.warn('Could not load tutorials, table might not exist yet:', tutErr);

        console.log(`Cloud Load: Fetched ${dbAppUsers?.length || 0} users from user_accounts table.`);
        if (dbAppUsers && dbAppUsers.length > 0) {
            const sampleUser = dbAppUsers[0];
            console.log('User Mapping Check (Sample):', {
                hasPassword: !!sampleUser.password,
                username: sampleUser.username
            });
        }

        const recycledIds = new Set((dbRecycled || []).map((r: any) => r.data?.id).filter(Boolean));

        return {
            companies: (dbComps || []).filter((c: any) => !recycledIds.has(c.id)).map((c: any) => ({
                id: c.id,
                nama: c.nama,
                email: c.email,
                telepon: c.telepon,
                alamat: c.alamat,
                npwp: c.npwp,
                logo: c.logo,
                bankName: c.bank_name || null,
                bankAccountName: c.bank_account_name || null,
                bankAccountNumber: c.bank_account_number || null
            })),
            suppliers: (dbSupps || []).filter((s: any) => !recycledIds.has(s.id)).map((s: any) => ({ ...s, companyId: s.company_id, phoneCode: s.phone_code, website: s.website })),
            products: (dbProds || []).filter((p: any) => !recycledIds.has(p.id)).map((p: any) => {
                const lotStockSum = (dbProductLots || [])
                    .filter((l: any) => l.product_id === p.id)
                    .reduce((sum: number, l: any) => sum + (Number(l.stock) || Number(l.stok) || Number(l.qty) || 0), 0);
                const rootStock = Number(p.stok) || Number(p.stock) || Number(p.qty) || 0;
                const finalStock = rootStock > 0 ? rootStock : lotStockSum;

                return {
                    ...p,
                    stok: finalStock,
                    stock: finalStock,
                    companyId: p.company_id,
                    mainFunction: p.main_function,
                    mainApplication: p.main_application,
                    lots: (dbProductLots || [])
                        .filter((l: any) => l.product_id === p.id)
                        .map((l: any) => ({
                            ...l,
                            supplierId: l.supplier_id,
                            hargaJual: l.harga_jual
                        }))
                };
            }),
            customers: (dbCusts || []).filter((c: any) => !recycledIds.has(c.id)).map((c: any) => ({
                ...c,
                companyId: c.company_id,
                phoneCode: c.phone_code,
                leadType: c.lead_type
            })),
            transactions: (dbTrxs || []).filter((t: any) => !recycledIds.has(t.id)).map((t: any) => ({
                ...t,
                noTrx: t.no_trx,
                customerName: t.customer_name || t.customerName || '',
                nilaiProyek: parseFloat(t.nilai_proyek as any) || 0,
                biayaOngkir: parseFloat(t.biaya_ongkir as any) || 0,
                jasaKirim: t.jasa_kirim,
                noResi: t.no_resi,
                paymentStatus: t.payment_status,
                pembayaranDiterima: parseFloat(t.pembayaran_diterima as any) || 0,
                sisaPembayaran: parseFloat(t.sisa_pembayaran as any) || 0,
                jatuhTempo: t.jatuh_tempo,
                followUpDate: t.follow_up_date,
                followUpMethod: t.follow_up_method,
                followUps: t.follow_ups || [],
                editHistory: t.edit_history || [],
                paymentHistory: t.payment_history || [],
                companyId: t.company_id,
                items: (dbTrxItems || [])
                    .filter((item: any) => item.transaction_id === t.id)
                    .map((item: any) => ({
                        ...item,
                        produkId: item.produk_id
                    }))
            })),
            appUsers: (dbAppUsers || []).filter((u: any) => !recycledIds.has(u.id)).map((u: any) => ({
                ...u,
                companyId: u.company_id,
                createdAt: u.created_at
            })),
            purchaseOrders: (dbPOs || []).filter((po: any) => !recycledIds.has(po.id)).map((po: any) => ({
                ...po,
                tanggalPembelian: po.tanggal_pembelian,
                supplierId: po.supplier_id,
                tanggalDiterima: po.tanggal_diterima,
                orderedBy: po.ordered_by,
                companyId: po.company_id,
                items: (dbPOItems || [])
                    .filter((item: any) => item.purchase_order_id === po.id)
                    .map((item: any) => ({
                        ...item,
                        produkId: item.produk_id
                    }))
            })),
            deletedItems: (dbRecycled || []).map((r: any) => ({
                id: r.id,
                type: r.type,
                data: r.data,
                deletedAt: r.deleted_at,
                deletedBy: r.deleted_by,
                deletedByName: r.deleted_by_name
            })),
            userLogs: (dbUserLogs || []).map((l: any) => ({
                id: l.id,
                userId: l.user_id,
                userName: l.user_name,
                action: l.action,
                details: l.details,
                entity: l.entity,
                createdAt: l.created_at
            })),
            tutorials: (dbTutorials || []).map((t: any) => ({
                id: t.id,
                title: t.title,
                content: t.content,
                images: t.images || [],
                order: t.order_index || 0
            }))
        };
    } catch (err) {
        console.error('Error fetching data from Supabase:', err);
        return null;
    }
};

export const saveTransactionToSupabase = async (trx: any) => {
    const { items, ...mainTrx } = trx;
    
    // Sanitize dates (avoid Postgres 22007 invalid input syntax for empty strings)
    const sanitizeDate = (val: any) => {
        if (!val || typeof val !== 'string' || !val.trim()) return null;
        return val.trim();
    };

    const trxId = mainTrx.id || ('TRX-' + Date.now());
    const grandTotal = Number(mainTrx.nilaiProyek ?? mainTrx.total ?? 0);
    const received = Number(mainTrx.pembayaranDiterima ?? mainTrx.pembayaran_diterima ?? 0);
    const remaining = Number(mainTrx.sisaPembayaran ?? mainTrx.sisa_pembayaran ?? (grandTotal - received));

    // 1. Upsert Transaction record
    const { error: trxError } = await withRetry(() => supabase.from('transactions').upsert({
        id: trxId,
        no_trx: mainTrx.noTrx || mainTrx.no_trx || trxId,
        tanggal: sanitizeDate(mainTrx.tanggal) || new Date().toISOString().split('T')[0],
        customer_name: mainTrx.customerName || mainTrx.customer_name || 'Pelanggan Umum',
        status: mainTrx.status || 'Invoice',
        nilai_proyek: grandTotal,
        ppn: mainTrx.ppn ?? true,
        ongkir: mainTrx.ongkir ?? false,
        biaya_ongkir: Number(mainTrx.biayaOngkir ?? mainTrx.biaya_ongkir ?? 0),
        jasa_kirim: mainTrx.jasaKirim || mainTrx.jasa_kirim || null,
        no_resi: mainTrx.noResi || mainTrx.no_resi || null,
        statuses: Array.isArray(mainTrx.statuses) && mainTrx.statuses.length > 0 ? mainTrx.statuses : [mainTrx.status || 'Invoice'],
        sales: mainTrx.sales || 'Sales',
        keterangan: mainTrx.keterangan || '',
        payment_status: mainTrx.paymentStatus || mainTrx.payment_status || 'Belum Lunas',
        pembayaran_diterima: received,
        sisa_pembayaran: remaining,
        jatuh_tempo: sanitizeDate(mainTrx.jatuhTempo || mainTrx.jatuh_tempo),
        follow_up_date: sanitizeDate(mainTrx.followUpDate || mainTrx.follow_up_date),
        follow_up_method: mainTrx.followUpMethod || mainTrx.follow_up_method || null,
        follow_ups: Array.isArray(mainTrx.followUps || mainTrx.follow_ups) ? (mainTrx.followUps || mainTrx.follow_ups) : [],
        edit_history: Array.isArray(mainTrx.editHistory || mainTrx.edit_history) ? (mainTrx.editHistory || mainTrx.edit_history) : [],
        payment_history: Array.isArray(mainTrx.paymentHistory || mainTrx.payment_history) ? (mainTrx.paymentHistory || mainTrx.payment_history) : [],
        company_id: String(mainTrx.companyId || mainTrx.company_id || '1')
    }));

    if (trxError) throw trxError;

    // 2. Delete old items and insert new ones
    if (items && items.length > 0) {
        await withRetry(() => supabase.from('transaction_items').delete().eq('transaction_id', trxId));
        
        const { error: itemsError } = await withRetry(() => supabase.from('transaction_items').upsert(
            items.map((it: any) => ({
                id: it.id || `${trxId}_${Math.random().toString(36).substr(2, 9)}`,
                transaction_id: trxId,
                produk_id: it.produkId || it.produk_id || null,
                nama: it.nama || 'Item Transaksi',
                kode: it.kode || '',
                harga: Number(it.harga || 0),
                qty: Number(it.qty || 1),
                diskon: Number(it.diskon || 0)
            }))
        ));
        if (itemsError) throw itemsError;
    }
};

export const saveCustomerToSupabase = async (cust: any) => {
    const custId = String(cust.id || ('CUST-' + Date.now()));
    const custKode = cust.kode || ('CUST-' + custId.slice(-4));

    const { error } = await withRetry(() => supabase.from('customers').upsert({
        id: custId,
        kode: custKode,
        nama: cust.nama || cust.pic || 'Kontak Baru',
        jenis: cust.jenis || cust.jenisKontak || 'Perusahaan',
        phone: cust.phone || cust.whatsapp || cust.no_hp || '',
        phone_code: cust.phoneCode || cust.phone_code || '+62',
        email: cust.email || '',
        alamat: cust.alamat || '',
        sales: cust.sales || 'Sales',
        lead_type: cust.leadType || cust.lead_type || 'Belum Transaksi',
        source: cust.source || 'Organic',
        npwp: cust.npwp || '',
        keterangan: cust.keterangan || '',
        negara: cust.negara || 'Indonesia',
        company_id: String(cust.companyId || cust.company_id || '1')
    }));

    if (error) throw error;
    return { success: true };
};

export const saveSupplierToSupabase = async (supp: any) => {
    const suppId = String(supp.id || ('SUPP-' + Date.now()));
    const { error } = await withRetry(() => supabase.from('suppliers').upsert({
        id: suppId,
        nama: supp.nama || 'Supplier Baru',
        kode: supp.kode || ('SUP-' + suppId.slice(-4)),
        npwp: supp.npwp || null,
        phone: supp.phone || supp.whatsapp || '',
        phone_code: supp.phoneCode || supp.phone_code || '+62',
        email: supp.email || null,
        website: supp.website || null,
        keterangan: supp.keterangan || null,
        company_id: String(supp.companyId || supp.company_id || '1')
    }));

    if (error) throw error;
    return { success: true };
};

export const saveCompanyToSupabase = async (comp: any) => {
    const compId = String(comp.id || '1');
    // Note: Do not send bank_name, bank_account_name, bank_account_number as they don't exist in Supabase schema
    const { error } = await withRetry(() => supabase.from('companies').upsert({
        id: compId,
        nama: comp.nama,
        email: comp.email || null,
        telepon: comp.telepon || null,
        alamat: comp.alamat || null,
        npwp: comp.npwp || null,
        logo: comp.logo || null
    }));

    if (error) throw error;
    return { success: true };
};

export const saveProductToSupabase = async (prod: any) => {
    const { lots, ...mainProd } = prod;

    // Note: Do NOT include stok, hpp, harga_jual on products table because they exist on product_lots
    const { error: prodError } = await withRetry(() => supabase.from('products').upsert({
        id: String(mainProd.id),
        nama: mainProd.nama,
        kode: mainProd.kode,
        satuan: mainProd.satuan || 'Pcs',
        berat: Number(mainProd.berat || 0),
        panjang: Number(mainProd.panjang || 0),
        lebar: Number(mainProd.lebar || 0),
        tinggi: Number(mainProd.tinggi || 0),
        images: mainProd.images || null,
        specifications: mainProd.specifications || null,
        main_function: mainProd.mainFunction || mainProd.main_function || null,
        main_application: mainProd.mainApplication || mainProd.main_application || null,
        remarks: mainProd.remarks || null,
        company_id: String(mainProd.companyId || mainProd.company_id || '1')
    }));

    if (prodError) throw prodError;

    if (lots && lots.length > 0) {
        const { error: lotsError } = await withRetry(() => supabase.from('product_lots').upsert(
            lots.map((l: any) => {
                let parsedLot = typeof l.lot === 'number' ? l.lot : parseInt(String(l.lot).replace(/\D/g, ''), 10);
                if (isNaN(parsedLot) || parsedLot <= 0) parsedLot = Date.now();

                return {
                    id: l.id || `${mainProd.id}_lot_${parsedLot}`,
                    product_id: String(mainProd.id),
                    lot: parsedLot,
                    kode: l.kode || mainProd.kode,
                    supplier_id: l.supplierId || l.supplier_id || null,
                    stock: Number(l.stock ?? l.stok ?? 0),
                    hpp: Number(l.hpp || 0),
                    harga_jual: Number(l.hargaJual || l.harga_jual || l.harga || 0),
                    tanggal: l.tanggal && String(l.tanggal).trim() ? String(l.tanggal).trim() : new Date().toISOString().split('T')[0]
                };
            })
        ));
        if (lotsError) throw lotsError;
    }
};

export const savePurchaseOrderToSupabase = async (po: any) => {
    const { items, ...mainPO } = po;

    const sanitizeDate = (val: any) => {
        if (!val || typeof val !== 'string' || !val.trim()) return null;
        return val.trim();
    };

    const poId = String(mainPO.id || ('PO-' + Date.now()));

    const { error: poError } = await withRetry(() => supabase.from('purchase_orders').upsert({
        id: poId,
        tanggal_pembelian: sanitizeDate(mainPO.tanggalPembelian || mainPO.tanggal_pembelian) || new Date().toISOString().split('T')[0],
        supplier_id: mainPO.supplierId || mainPO.supplier_id || null,
        status: mainPO.status || 'Pending',
        tanggal_diterima: sanitizeDate(mainPO.tanggalDiterima || mainPO.tanggal_diterima),
        ordered_by: mainPO.orderedBy || mainPO.ordered_by || 'Admin',
        company_id: String(mainPO.companyId || mainPO.company_id || '1')
    }));

    if (poError) throw poError;

    if (items && items.length > 0) {
        await withRetry(() => supabase.from('purchase_order_items').delete().eq('purchase_order_id', poId));
        const { error: itemsError } = await withRetry(() => supabase.from('purchase_order_items').upsert(
            items.map((it: any) => ({
                id: it.id || `${poId}_${Math.random().toString(36).substr(2, 9)}`,
                purchase_order_id: poId,
                produk_id: it.produkId || it.produk_id || null,
                nama: it.nama || 'Item PO',
                kode: it.kode || '',
                jumlah: Number(it.jumlah || it.qty || 1),
                hpp: Number(it.hpp || 0),
                harga: Number(it.harga || it.hpp || 0)
            }))
        ));
        if (itemsError) throw itemsError;
    }
};

export const saveAllToSupabase = async (data: any) => {
    const { companies, suppliers, products, customers, transactions, appUsers, purchaseOrders } = data;

    console.log('--- GLOBAL CLOUD SYNC START ---');

    // 1. Companies
    if (companies?.length > 0) {
        for (const c of companies) {
            try {
                await saveCompanyToSupabase(c);
            } catch (e: any) {
                console.error(`Company sync failed [${c.nama}]:`, e.message);
            }
        }
    }

    // 2. Suppliers
    if (suppliers?.length > 0) {
        for (const s of suppliers) {
            try {
                await saveSupplierToSupabase(s);
            } catch (e: any) {
                console.error(`Supplier sync failed [${s.nama}]:`, e.message);
            }
        }
    }

    // 3. Customers
    if (customers?.length > 0) {
        for (const c of customers) {
            try {
                await saveCustomerToSupabase(c);
            } catch (e: any) {
                console.error(`Customer sync failed [${c.nama}]:`, e.message);
            }
        }
    }

    // 4. Products (individual saves because of lots)
    for (const p of products || []) {
        try {
            await saveProductToSupabase(p);
        } catch (e: any) {
            console.error(`Product sync failed [${p.nama}]:`, e.message);
        }
    }

    // 5. Transactions (individual saves because of items)
    for (const t of transactions || []) {
        try {
            await saveTransactionToSupabase(t);
        } catch (e: any) {
            console.error(`Transaction sync failed [${t.noTrx}]:`, e.message);
        }
    }

    // 6. Users
    if (appUsers?.length > 0) {
        console.log(`Syncing ${appUsers.length} users...`);
        // We carefully map to ensure we don't send undefined for critical fields like password
        const userPayload = appUsers.map((u: any) => {
            const mappedUser: any = {
                id: u.id,
                nama: u.nama,
                username: u.username,
                whatsapp: u.whatsapp,
                role: u.role,
                permissions: u.permissions,
                company_id: u.companyId || u.company_id,
                created_at: u.createdAt || u.created_at
            };
            
            // Only include password if it exists to avoid overwriting with null/undefined
            if (u.password) {
                mappedUser.password = u.password;
            }
            
            return mappedUser;
        });

        const { error } = await withRetry(() => supabase.from('user_accounts').upsert(userPayload));
        if (error) console.error('Sync Error [user_accounts]:', error.message);
        else console.log('User database synced successfully.');
    }

    // 7. POs
    console.log(`Syncing ${purchaseOrders?.length || 0} purchase orders...`);
    for (const po of purchaseOrders || []) {
        try {
            await savePurchaseOrderToSupabase(po);
        } catch (e: any) {
            console.error(`PO sync failed [${po.id}]:`, e.message);
        }
    }
    console.log('--- GLOBAL CLOUD SYNC END ---');
};

export const saveRecycledItemToSupabase = async (item: any) => {
    return await withRetry(() => supabase.from('recycled_items').upsert({
        id: item.id,
        type: item.type,
        data: item.data,
        deleted_at: item.deletedAt,
        deleted_by: item.deletedBy,
        deleted_by_name: item.deletedByName,
        company_id: item.companyId
    }));
};

export const saveUserLogToSupabase = async (log: any) => {
    return await withRetry(() => supabase.from('user_logs').upsert({
        id: log.id,
        user_id: log.userId,
        user_name: log.userName,
        action: log.action,
        details: log.details,
        entity: log.entity,
        created_at: log.createdAt
    }));
};

export const saveTutorialToSupabase = async (tut: any) => {
    return await withRetry(() => supabase.from('tutorials').upsert({
        id: tut.id,
        title: tut.title,
        content: tut.content,
        images: tut.images,
        order_index: tut.order
    }));
};

export const deleteRecycledItemFromSupabase = async (id: string) => {
    return await withRetry(() => supabase.from('recycled_items').delete().eq('id', id));
};

// --- App Settings (Gemini API Key, Global Config) Cloud Persistence ---
export const checkSupabaseTableStatus = async (tableName: string): Promise<{ isReady: boolean; error?: string }> => {
    try {
        const { error } = await supabase.from(tableName).select('*').limit(1);
        if (error) {
            return { isReady: false, error: error.message };
        }
        return { isReady: true };
    } catch (err: any) {
        return { isReady: false, error: err.message };
    }
};

export const saveAppSettingToSupabase = async (key: string, value: any, updatedBy?: string) => {
    const payload: any = {
        key,
        value,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || 'user'
    };

    // 1. Try upsert with onConflict target 'key'
    let res = await withRetry(() => supabase.from('app_settings').upsert(payload, { onConflict: 'key' }));

    // 2. If unique constraint violation or missing column id occurs, fallback to select -> update/insert
    if (res?.error && (res.error.message.includes('unique constraint') || res.error.message.includes('duplicate key') || res.error.message.includes('column "id"'))) {
        const { data: existing } = await supabase.from('app_settings').select('key').eq('key', key).maybeSingle();
        if (existing) {
            res = await withRetry(() => supabase.from('app_settings').update({
                value: payload.value,
                updated_at: payload.updated_at,
                updated_by: payload.updated_by
            }).eq('key', key));
        } else {
            res = await withRetry(() => supabase.from('app_settings').insert(payload));
        }
    }
    return res;
};

export const loadAppSettingFromSupabase = async (key: string) => {
    const { data, error } = await withRetry(() => supabase.from('app_settings').select('value').eq('key', key).maybeSingle());
    if (error) {
        console.warn(`[SupabaseSync] Error loading app_settings (${key}):`, error.message);
        return null;
    }
    return data?.value || null;
};

// --- WhatsApp Chats Cloud Persistence (By Connected Phone Number) ---
export const saveWAChatToSupabase = async (chat: any, connectedPhone: string) => {
    const cleanPhone = (connectedPhone || 'default').replace(/[^a-zA-Z0-9]/g, '');
    const cleanJid = chat.jid || chat.id;
    const docId = `${cleanPhone}_${cleanJid}`;

    return await withRetry(() => supabase.from('wa_chats').upsert({
        id: docId,
        connected_phone: cleanPhone,
        jid: cleanJid,
        name: chat.name || '',
        phone: chat.phone || '',
        unread_count: chat.unreadCount || 0,
        last_message: chat.lastMessage || '',
        last_message_time: chat.lastMessageTime || Date.now(),
        messages: chat.messages || [],
        updated_at: new Date().toISOString()
    }));
};

export const loadWAChatsFromSupabase = async (connectedPhone?: string) => {
    try {
        let query = supabase.from('wa_chats').select('*').order('last_message_time', { ascending: false });
        if (connectedPhone && connectedPhone !== 'all' && connectedPhone !== 'active') {
            const cleanPhone = connectedPhone.replace(/[^a-zA-Z0-9]/g, '');
            query = query.eq('connected_phone', cleanPhone);
        }
        const { data, error } = await withRetry(() => query);
        if (error) {
            console.warn('[SupabaseSync] Could not load wa_chats from Supabase:', error.message);
            return null;
        }
        return (data || []).map((row: any) => ({
            id: row.jid,
            jid: row.jid,
            name: row.name,
            phone: row.phone,
            unreadCount: row.unread_count || 0,
            lastMessage: row.last_message || '',
            lastMessageTime: Number(row.last_message_time) || Date.now(),
            messages: Array.isArray(row.messages) ? row.messages : [],
            connectedPhone: row.connected_phone
        }));
    } catch (err: any) {
        console.warn('[SupabaseSync] Error in loadWAChatsFromSupabase:', err.message);
        return null;
    }
};

export const loadKnownConnectedNumbersFromSupabase = async (): Promise<string[]> => {
    try {
        const { data, error } = await withRetry(() => supabase.from('wa_chats').select('connected_phone'));
        if (error || !data) return [];
        const unique = Array.from(new Set(data.map((r: any) => r.connected_phone).filter(p => p && p !== 'default' && /^[0-9]+$/.test(p))));
        return unique as string[];
    } catch {
        return [];
    }
};

export const deleteWAChatFromSupabase = async (jid: string, connectedPhone?: string) => {
    try {
        let query = supabase.from('wa_chats').delete().eq('jid', jid);
        if (connectedPhone && connectedPhone !== 'all' && connectedPhone !== 'active') {
            const cleanPhone = connectedPhone.replace(/[^a-zA-Z0-9]/g, '');
            query = query.eq('connected_phone', cleanPhone);
        }
        return await withRetry(() => query);
    } catch (err: any) {
        console.warn('[SupabaseSync] Error deleting wa_chat:', err.message);
        return null;
    }
};

export const clearWAChatsFromSupabase = async () => {
    try {
        return await withRetry(() => supabase.from('wa_chats').delete().neq('id', 'none'));
    } catch (err: any) {
        console.warn('[SupabaseSync] Error clearing wa_chats from Supabase:', err.message);
        return null;
    }
};
