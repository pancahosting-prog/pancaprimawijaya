-- SQL Setup for Supabase - MyPanca BRM

-- 1. Companies Table
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  email TEXT,
  telepon TEXT,
  alamat TEXT,
  npwp TEXT,
  logo TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Suppliers Table
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT NOT NULL,
  npwp TEXT,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Products Table
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT NOT NULL,
  satuan TEXT,
  berat FLOAT,
  panjang FLOAT,
  lebar FLOAT,
  tinggi FLOAT,
  images TEXT[], -- Array of URLs or Base64
  specifications TEXT,
  main_function TEXT,
  main_application TEXT,
  remarks TEXT,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Product Lots Table
CREATE TABLE product_lots (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  lot BIGINT NOT NULL,
  kode TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  stock INT DEFAULT 0,
  hpp NUMERIC(15, 2) DEFAULT 0,
  harga_jual NUMERIC(15, 2) DEFAULT 0,
  tanggal DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Customers Table
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  kode TEXT NOT NULL,
  nama TEXT NOT NULL,
  jenis TEXT,
  phone TEXT,
  phone_code TEXT DEFAULT '+62',
  email TEXT,
  alamat TEXT,
  sales TEXT,
  lead_type TEXT,
  source TEXT,
  npwp TEXT,
  keterangan TEXT,
  negara TEXT DEFAULT 'Indonesia',
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. User Accounts Table
CREATE TABLE user_accounts (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  whatsapp TEXT,
  role TEXT DEFAULT 'admin',
  permissions JSONB,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Transactions Table
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  no_trx TEXT NOT NULL,
  tanggal DATE DEFAULT CURRENT_DATE,
  customer_name TEXT,
  status TEXT DEFAULT 'Progress',
  nilai_proyek NUMERIC(15, 2) DEFAULT 0,
  ppn BOOLEAN DEFAULT TRUE,
  ongkir BOOLEAN DEFAULT FALSE,
  biaya_ongkir NUMERIC(15, 2) DEFAULT 0,
  jasa_kirim TEXT,
  no_resi TEXT,
  statuses TEXT[], -- Array of workflow statuses
  sales TEXT,
  keterangan TEXT,
  payment_status TEXT DEFAULT 'Belum Lunas',
  pembayaran_diterima NUMERIC(15, 2) DEFAULT 0,
  sisa_pembayaran NUMERIC(15, 2) DEFAULT 0,
  jatuh_tempo DATE,
  follow_up_date DATE,
  follow_up_method TEXT,
  follow_ups JSONB,
  edit_history JSONB,
  payment_history JSONB,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Transaction Items Table
CREATE TABLE transaction_items (
  id TEXT PRIMARY KEY,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
  produk_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  nama TEXT,
  kode TEXT,
  harga NUMERIC(15, 2),
  qty INT DEFAULT 0,
  diskon NUMERIC(15, 2) DEFAULT 0
);

-- 9. Purchase Orders Table
CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,
  tanggal_pembelian DATE DEFAULT CURRENT_DATE,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'Process',
  tanggal_diterima DATE,
  ordered_by TEXT,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Purchase Order Items Table
CREATE TABLE purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
  produk_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  nama TEXT,
  kode TEXT,
  jumlah INT DEFAULT 0,
  hpp NUMERIC(15, 2),
  harga NUMERIC(15, 2)
);

-- 11. Application Settings Table (For Gemini API Keys & Global System Config across all devices)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT
);

-- JIKA TABEL SUDAH ADA SEBELUMNYA: Tambahkan kolom yang dibutuhkan secara aman
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS value JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Pastikan kolom key berstatus unique jika tabel lama tidak memiliki primary key di 'key'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.app_settings'::regclass 
    AND (contype = 'p' OR contype = 'u')
    AND pg_get_constraintdef(oid) LIKE '%key%'
  ) THEN
    BEGIN
      ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_key_unique UNIQUE (key);
    EXCEPTION WHEN OTHERS THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_key ON public.app_settings(key);
    END;
  END IF;
END $$;

-- 12. WhatsApp Chats Table (Per Connected Phone Number)
CREATE TABLE IF NOT EXISTS public.wa_chats (
  id TEXT PRIMARY KEY,                       -- Format: {connected_phone}_{jid}
  connected_phone TEXT NOT NULL,             -- Nomor WhatsApp terhubung (cth: 6281234567890)
  jid TEXT NOT NULL,                         -- JID kontak lawan bicara
  name TEXT,                                 -- Nama kontak
  phone TEXT,                                -- Nomor telepon kontak
  unread_count INT DEFAULT 0,
  last_message TEXT,
  last_message_time BIGINT,
  messages JSONB DEFAULT '[]'::jsonb,        -- Array JSON riwayat pesan
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- JIKA TABEL SUDAH ADA SEBELUMNYA: Tambahkan kolom yang dibutuhkan
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS connected_phone TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS jid TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS unread_count INT DEFAULT 0;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS last_message TEXT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS last_message_time BIGINT;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.wa_chats ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_wa_chats_connected_phone ON public.wa_chats(connected_phone);
CREATE INDEX IF NOT EXISTS idx_wa_chats_last_message_time ON public.wa_chats(last_message_time DESC);
CREATE INDEX IF NOT EXISTS idx_wa_chats_jid ON public.wa_chats(jid);

-- Grant Table Permissions to anon, authenticated, and service_role
GRANT ALL ON TABLE public.companies TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.suppliers TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.products TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_lots TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.customers TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_accounts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.transactions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.transaction_items TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.purchase_orders TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.purchase_order_items TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.app_settings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.wa_chats TO anon, authenticated, service_role;

-- Enable Row Level Security (RLS) & Policies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.companies FOR ALL USING (true);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to app_settings" ON public.app_settings;
CREATE POLICY "Allow all access to app_settings" ON public.app_settings FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.wa_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to wa_chats" ON public.wa_chats;
CREATE POLICY "Allow all access to wa_chats" ON public.wa_chats FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);


