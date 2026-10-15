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
            products: (dbProds || []).filter((p: any) => !recycledIds.has(p.id)).map((p: any) => ({
                ...p,
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
            })),
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
    
    // 1. Upsert Transaction record
    const { error: trxError } = await withRetry(() => supabase.from('transactions').upsert({
        id: mainTrx.id,
        no_trx: mainTrx.noTrx,
        tanggal: mainTrx.tanggal,
        customer_name: mainTrx.customerName || mainTrx.customer_name || '',
        status: mainTrx.status,
        nilai_proyek: mainTrx.nilaiProyek || 0,
        ppn: mainTrx.ppn ?? true,
        ongkir: mainTrx.ongkir ?? false,
        biaya_ongkir: mainTrx.biayaOngkir || 0,
        jasa_kirim: mainTrx.jasaKirim,
        no_resi: mainTrx.noResi,
        statuses: mainTrx.statuses || [],
        sales: mainTrx.sales,
        keterangan: mainTrx.keterangan || '',
        payment_status: mainTrx.paymentStatus || 'Belum Lunas',
        pembayaran_diterima: mainTrx.pembayaranDiterima || 0,
        sisa_pembayaran: mainTrx.sisaPembayaran || 0,
        jatuh_tempo: mainTrx.jatuhTempo,
        follow_up_date: mainTrx.followUpDate,
        follow_up_method: mainTrx.followUpMethod,
        follow_ups: mainTrx.followUps || [],
        edit_history: mainTrx.editHistory || [],
        payment_history: mainTrx.paymentHistory || [],
        company_id: mainTrx.companyId
    }));

    if (trxError) throw trxError;

    // 2. Delete old items and insert new ones (or use upsert if you have IDs)
    if (items && items.length > 0) {
        // Simple approach: delete and re-insert for the transaction
        await withRetry(() => supabase.from('transaction_items').delete().eq('transaction_id', mainTrx.id));
        
        const { error: itemsError } = await withRetry(() => supabase.from('transaction_items').upsert(
            items.map((it: any) => ({
                id: it.id || `${mainTrx.id}_${Math.random().toString(36).substr(2, 9)}`,
                transaction_id: mainTrx.id,
                produk_id: it.produkId,
                nama: it.nama,
                kode: it.kode,
                harga: it.harga,
                qty: it.qty,
                diskon: it.diskon || 0
            }))
        ));
        if (itemsError) throw itemsError;
    }
};

export const saveProductToSupabase = async (prod: any) => {
    const { lots, ...mainProd } = prod;

    const { error: prodError } = await withRetry(() => supabase.from('products').upsert({
        id: mainProd.id,
        nama: mainProd.nama,
        kode: mainProd.kode,
        satuan: mainProd.satuan,
        berat: mainProd.berat,
        panjang: mainProd.panjang,
        lebar: mainProd.lebar,
        tinggi: mainProd.tinggi,
        images: mainProd.images,
        specifications: mainProd.specifications,
        main_function: mainProd.mainFunction,
        main_application: mainProd.mainApplication,
        remarks: mainProd.remarks,
        company_id: mainProd.companyId
    }));

    if (prodError) throw prodError;

    if (lots && lots.length > 0) {
        const { error: lotsError } = await withRetry(() => supabase.from('product_lots').upsert(
            lots.map((l: any) => ({
                id: l.id || `${mainProd.id}_lot_${l.lot}`,
                product_id: mainProd.id,
                lot: l.lot,
                kode: l.kode,
                supplier_id: l.supplierId,
                stock: l.stock,
                hpp: l.hpp,
                harga_jual: l.hargaJual,
                tanggal: l.tanggal
            }))
        ));
        if (lotsError) throw lotsError;
    }

};

export const savePurchaseOrderToSupabase = async (po: any) => {
    const { items, ...mainPO } = po;

    const { error: poError } = await withRetry(() => supabase.from('purchase_orders').upsert({
        id: mainPO.id,
        tanggal_pembelian: mainPO.tanggalPembelian,
        supplier_id: mainPO.supplierId,
        status: mainPO.status,
        tanggal_diterima: mainPO.tanggalDiterima,
        ordered_by: mainPO.orderedBy,
        company_id: mainPO.companyId
    }));

    if (poError) throw poError;

    if (items && items.length > 0) {
        await withRetry(() => supabase.from('purchase_order_items').delete().eq('purchase_order_id', mainPO.id));
        const { error: itemsError } = await withRetry(() => supabase.from('purchase_order_items').upsert(
            items.map((it: any) => ({
                id: it.id || `${mainPO.id}_${Math.random().toString(36).substr(2, 9)}`,
                purchase_order_id: mainPO.id,
                produk_id: it.produkId,
                nama: it.nama,
                kode: it.kode,
                jumlah: it.jumlah,
                hpp: it.hpp,
                harga: it.harga
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
        console.log(`Syncing ${companies.length} companies...`);
        const { error } = await withRetry(() => supabase.from('companies').upsert(companies.map((c: any) => ({
            id: c.id, 
            nama: c.nama, 
            email: c.email, 
            telepon: c.telepon, 
            alamat: c.alamat, 
            npwp: c.npwp,
            logo: c.logo || null,
            bank_name: c.bankName || null,
            bank_account_name: c.bankAccountName || null,
            bank_account_number: c.bankAccountNumber || null
        }))));
        if (error) console.error('Sync Error [companies]:', error.message);
    }

    // 2. Suppliers
    if (suppliers?.length > 0) {
        console.log(`Syncing ${suppliers.length} suppliers...`);
        const { error } = await withRetry(() => supabase.from('suppliers').upsert(suppliers.map((s: any) => ({
            id: s.id, nama: s.nama, kode: s.kode, npwp: s.npwp, 
            phone: s.phone, phone_code: s.phoneCode, email: s.email, website: s.website, keterangan: s.keterangan,
            company_id: s.companyId
        }))));
        if (error) console.error('Sync Error [suppliers]:', error.message);
    }

    // 3. Customers
    if (customers?.length > 0) {
        console.log(`Syncing ${customers.length} customers...`);
        const { error } = await withRetry(() => supabase.from('customers').upsert(customers.map((c: any) => ({
            id: c.id, kode: c.kode, nama: c.nama, jenis: c.jenis, phone: c.phone,
            phone_code: c.phoneCode, email: c.email, alamat: c.alamat, sales: c.sales,
            lead_type: c.leadType, source: c.source, npwp: c.npwp, keterangan: c.keterangan || '',
            negara: c.negara, company_id: c.companyId
        }))));
        if (error) console.error('Sync Error [customers]:', error.message);
    }

    // 4. Products (individual saves because of lots)
    console.log(`Syncing ${products?.length || 0} products...`);
    for (const p of products || []) {
        try {
            await saveProductToSupabase(p);
        } catch (e: any) {
            console.error(`Product sync failed [${p.nama}]:`, e.message);
        }
    }

    // 5. Transactions (individual saves because of items)
    console.log(`Syncing ${transactions?.length || 0} transactions...`);
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
