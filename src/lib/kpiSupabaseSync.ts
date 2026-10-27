import { supabase, withRetry } from './supabase';
import { saveAppSettingToSupabase, loadAppSettingFromSupabase } from './supabaseSync';

export const KPI_CLOUD_STORAGE_KEY = 'kpi_cloud_data_v1';

export interface KPIMasterCloudData {
  jabatans?: any[];
  kpiEmployees?: any[];
  gradingKPIItems?: any[];
  omsetTiers?: any[];
  salesCommissions?: any[];
  kpiMonthlyFinancials?: Record<string, any>;
  bonusProjectSheets?: Record<string, any>;
  employeeIndividualSheets?: Record<string, any>;
  employeeCustomIndicators?: Record<string, any[]>;
  kpiTemplates?: any[];
  kpiRecords?: any[];
  additionalBonuses?: Record<string, number>;
  lastSyncedAt?: string;
  syncedBy?: string;
}

/**
 * Memuat semua data KPI dari Supabase Database Cloud
 */
export async function loadAllKPIDataFromSupabase(): Promise<{
  success: boolean;
  data: KPIMasterCloudData | null;
  source: 'cloud_bundle' | 'relational_tables' | 'none';
  error?: string;
}> {
  try {
    // 1. Coba baca dari master bundle di app_settings
    const bundle = await loadAppSettingFromSupabase(KPI_CLOUD_STORAGE_KEY);
    if (bundle && typeof bundle === 'object' && Object.keys(bundle).length > 0) {
      return {
        success: true,
        data: bundle as KPIMasterCloudData,
        source: 'cloud_bundle'
      };
    }

    // 2. Jika belum ada bundle, coba baca dari tabel relasional Supabase yang sudah dibuat user
    const [jabatansRes, tiersRes, financialsRes, templatesRes, recordsRes] = await Promise.allSettled([
      supabase.from('kpi_jabatans').select('*'),
      supabase.from('kpi_omset_tiers').select('*'),
      supabase.from('kpi_monthly_financials').select('*'),
      supabase.from('kpi_templates').select('*'),
      supabase.from('kpi_records').select('*')
    ]);

    const partialData: KPIMasterCloudData = {};
    let hasAnyData = false;

    if (jabatansRes.status === 'fulfilled' && jabatansRes.value.data && jabatansRes.value.data.length > 0) {
      partialData.jabatans = jabatansRes.value.data.map(j => ({
        id: j.id,
        name: j.name,
        percentage: j.percentage ?? 0
      }));
      hasAnyData = true;
    }

    if (tiersRes.status === 'fulfilled' && tiersRes.value.data && tiersRes.value.data.length > 0) {
      partialData.omsetTiers = tiersRes.value.data.map(t => ({
        id: t.id,
        name: t.name,
        target: t.target_omset_bersih ?? 0,
        multiplier: t.multiplier ?? 1
      }));
      hasAnyData = true;
    }

    if (financialsRes.status === 'fulfilled' && financialsRes.value.data && financialsRes.value.data.length > 0) {
      const finMap: Record<string, any> = {};
      financialsRes.value.data.forEach(f => {
        if (f.year_month) {
          finMap[f.year_month] = {
            omsetKotor: f.omset_kotor ?? 0,
            pajak: f.pajak ?? 0,
            pengiriman: f.pengiriman ?? 0,
            lainLain: f.lain_lain ?? 0
          };
        }
      });
      partialData.kpiMonthlyFinancials = finMap;
      hasAnyData = true;
    }

    if (templatesRes.status === 'fulfilled' && templatesRes.value.data && templatesRes.value.data.length > 0) {
      partialData.kpiTemplates = templatesRes.value.data.map(tpl => ({
        id: tpl.id,
        jabatan: tpl.jabatan_name || tpl.jabatan_id,
        hardWeight: tpl.hard_weight ?? 80,
        softWeight: tpl.soft_weight ?? 20,
        indicators: []
      }));
      hasAnyData = true;
    }

    if (recordsRes.status === 'fulfilled' && recordsRes.value.data && recordsRes.value.data.length > 0) {
      partialData.kpiRecords = recordsRes.value.data.map(r => ({
        id: r.id,
        employeeId: r.employee_id,
        month: r.month,
        year: String(r.year || '2026'),
        status: r.status || 'draft',
        scores: {},
        notes: r.notes || '',
        hardWeight: r.hard_weight,
        softWeight: r.soft_weight,
        finalScore: r.final_score
      }));
      hasAnyData = true;
    }

    if (hasAnyData) {
      return {
        success: true,
        data: partialData,
        source: 'relational_tables'
      };
    }

    return {
      success: true,
      data: null,
      source: 'none'
    };
  } catch (err: any) {
    console.warn('[kpiSupabaseSync] Error loading data from Supabase:', err.message);
    return {
      success: false,
      data: null,
      source: 'none',
      error: err.message
    };
  }
}

/**
 * Menyimpan seluruh data master KPI ke Supabase Cloud
 */
export async function saveAllKPIDataToSupabase(
  data: KPIMasterCloudData,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const enrichedData: KPIMasterCloudData = {
      ...data,
      lastSyncedAt: new Date().toISOString(),
      syncedBy: userName || 'kpi_user'
    };

    // 1. Simpan ke app_settings (kpi_cloud_data_v1) untuk integritas penuh semua array & JSON nested
    const bundleRes = await saveAppSettingToSupabase(
      KPI_CLOUD_STORAGE_KEY,
      enrichedData,
      userName || 'kpi_user'
    );

    // 2. Mirroring ke tabel relasional Supabase secara non-blocking / best-effort
    mirrorToRelationalTables(enrichedData).catch(err => {
      console.warn('[kpiSupabaseSync] Non-blocking relational mirror warning:', err?.message);
    });

    if (bundleRes?.error) {
      return { success: false, error: bundleRes.error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[kpiSupabaseSync] Error saving data to Supabase:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Mirroring data ke tabel-tabel relasional Supabase
 */
async function mirrorToRelationalTables(data: KPIMasterCloudData) {
  // Mirror kpi_jabatans
  if (data.jabatans && Array.isArray(data.jabatans) && data.jabatans.length > 0) {
    const payload = data.jabatans.map(j => ({
      id: String(j.id),
      name: String(j.name || ''),
      percentage: Number(j.percentage || 0),
      updated_at: new Date().toISOString()
    }));
    await withRetry(() => supabase.from('kpi_jabatans').upsert(payload, { onConflict: 'id' }));
  }

  // Mirror kpi_omset_tiers
  if (data.omsetTiers && Array.isArray(data.omsetTiers) && data.omsetTiers.length > 0) {
    const payload = data.omsetTiers.map(t => ({
      id: String(t.id),
      name: String(t.name || ''),
      target_omset_bersih: Number(t.target || 0),
      multiplier: Number(t.multiplier || 1)
    }));
    await withRetry(() => supabase.from('kpi_omset_tiers').upsert(payload, { onConflict: 'id' }));
  }

  // Mirror kpi_monthly_financials
  if (data.kpiMonthlyFinancials && typeof data.kpiMonthlyFinancials === 'object') {
    const finEntries = Object.entries(data.kpiMonthlyFinancials);
    if (finEntries.length > 0) {
      const payload = finEntries.map(([ym, f]: [string, any]) => ({
        year_month: ym.substring(0, 7),
        omset_kotor: Number(f.omsetKotor || 0),
        omset_bersih: Number(f.omsetKotor || 0) - Number(f.pajak || 0) - Number(f.pengiriman || 0) - Number(f.lainLain || 0),
        pajak: Number(f.pajak || 0),
        pengiriman: Number(f.pengiriman || 0),
        lain_lain: Number(f.lainLain || 0),
        updated_at: new Date().toISOString()
      }));
      await withRetry(() => supabase.from('kpi_monthly_financials').upsert(payload, { onConflict: 'year_month' }));
    }
  }

  // Mirror kpi_templates
  if (data.kpiTemplates && Array.isArray(data.kpiTemplates) && data.kpiTemplates.length > 0) {
    const payload = data.kpiTemplates.map(t => ({
      id: String(t.id),
      jabatan_id: String(t.id),
      jabatan_name: String(t.jabatan || ''),
      hard_weight: Number(t.hardWeight ?? 80),
      soft_weight: Number(t.softWeight ?? 20),
      updated_at: new Date().toISOString()
    }));
    await withRetry(() => supabase.from('kpi_templates').upsert(payload, { onConflict: 'id' }));
  }

  // Mirror kpi_records
  if (data.kpiRecords && Array.isArray(data.kpiRecords) && data.kpiRecords.length > 0) {
    const payload = data.kpiRecords.map(r => ({
      id: String(r.id),
      employee_id: String(r.employeeId || 'unknown'),
      month: String(r.month || '01').padStart(2, '0').substring(0, 2),
      year: parseInt(String(r.year || '2026'), 10) || 2026,
      status: String(r.status || 'draft'),
      approved_by: r.approvedBy || null,
      approved_at: r.approvedAt || null,
      notes: r.notes || '',
      hard_weight: Number(r.hardWeight ?? 80),
      soft_weight: Number(r.softWeight ?? 20),
      final_score: Number(r.finalScore || 0),
      updated_at: new Date().toISOString()
    }));
    await withRetry(() => supabase.from('kpi_records').upsert(payload, { onConflict: 'id' }));
  }
}
