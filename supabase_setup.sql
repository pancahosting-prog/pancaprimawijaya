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

-- Enable Row Level Security (RLS) - Basic Example
-- Note: You should refine these policies based on your auth logic
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON companies FOR ALL USING (true);

-- Repeat for other tables...
