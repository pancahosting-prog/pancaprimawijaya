-- Script Seed untuk Supabase - Menambahkan Perusahaan Default dan User
-- Jalankan script ini di SQL Editor Supabase Anda

-- 1. Tambahkan Perusahaan Utama (Penting: User membutuhkan company_id)
INSERT INTO companies (id, nama, email, telepon, alamat)
VALUES ('00000000-0000-0000-0000-000000000001', 'Panca Prima Wijaya', 'info@pancaprima.com', '628123456789', 'Jl. Raya No. 123, Jakarta')
ON CONFLICT (id) DO NOTHING;

-- 2. Tambahkan User Superadmin
INSERT INTO user_accounts (id, nama, username, password, whatsapp, role, company_id)
VALUES (
  '00000000-0000-0000-0000-000000000002', 
  'Superadmin', 
  'superadmin', 
  'suksesbersamaa', 
  '628000000001', 
  'superadmin', 
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (username) DO UPDATE 
SET password = EXCLUDED.password, role = EXCLUDED.role;

-- 3. Tambahkan User Admin Lainnya (Contoh)
INSERT INTO user_accounts (id, nama, username, password, whatsapp, role, company_id)
VALUES 
  ('00000000-0000-0000-0000-000000000003', 'Angel', 'angel1', 'tanogaidomaju', '628000000002', 'admin', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000004', 'Maria', 'maria1', 'tanogaidosukses', '628000000003', 'admin', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000005', 'Dwi', 'dwi1', 'tanogaidojaya', '628000000004', 'sales', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (username) DO NOTHING;
