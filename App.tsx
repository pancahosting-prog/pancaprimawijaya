
import { GoogleGenAI } from "@google/genai";
import { supabase, testSupabaseConnection, withRetry } from "./src/lib/supabase";
import { loadDataFromSupabase, saveTransactionToSupabase, saveProductToSupabase, savePurchaseOrderToSupabase, saveAllToSupabase, saveRecycledItemToSupabase, deleteRecycledItemFromSupabase, saveUserLogToSupabase, saveTutorialToSupabase } from "./src/lib/supabaseSync";
import { supabaseService as taskSupabaseService } from "./task/services/supabaseService";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';
import { QRCodeCanvas } from 'qrcode.react';
import QRCode from 'qrcode';
import { QrReader } from 'react-qr-reader';
import { 
  Menu, X, Sun, Moon, Search, Plus, Trash2, ChevronDown, Check, 
  TrendingUp, TrendingDown, Calendar as CalendarIcon, Store, Tag, Box,
  Settings, User, Bell, ChevronLeft, ChevronRight, Filter, 
  Eye, RefreshCw, Download, Printer, MoreVertical, MoreHorizontal, LayoutGrid, List,
  History as HistoryIcon, ArrowLeft,
  Wallet, Activity, Users, Package, FileText, CheckCircle, Save, ChevronRight as ChevronRightIcon, Award,
  Truck, Mail, MapPin, AlignLeft, Send, DollarSign, Archive, AlertTriangle, Info, RotateCcw, Camera, MessageSquare, ArrowRightCircle, ArrowRight, Phone, Circle, Edit, LayoutDashboard, ShoppingCart, Globe, Briefcase, ShoppingBag,
  Book, BookOpen, ArrowUpRight, ArrowDownLeft, Sparkles, ShieldCheck, ExternalLink, CloudUpload, CloudDownload, AlertCircle, Lightbulb, Image as ImageIcon, UserPlus, Copy,
  Bot, LogOut
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import CompanyLogo from './logo-pancaprimawijaya.jpg';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TaskApp from './task/App';
import KPIModule from './src/components/KPIModule';
import { GeminiAIAssistant } from './src/components/GeminiAIAssistant';
import { PancaMobileApp } from './src/components/panca-app/PancaMobileApp';
import { GeminiSettingsSection } from './src/components/GeminiSettingsSection';
import { WhatsAppView } from './src/components/WhatsAppView';
import { callGeminiWithKeyRotation, loadGeminiSettingsFromDatabase } from './src/services/geminiKeyService';

// --- Interfaces ---
interface TutorialSection {
  id: string;
  title: string;
  content: string;
  images: string[];
  order: number;
}

interface Supplier { id: string; nama: string; kode: string; npwp: string; companyId?: string; company_id?: string; phoneCode?: string; phone?: string; email?: string; keterangan?: string; website?: string; }

interface Company {
  id: string;
  nama: string;
  email: string;
  telepon: string;
  alamat: string;
  npwp: string;
  logo?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
}

interface ProductLot {
  id?: string;
  lot: number;
  kode: string;
  supplierId: string;
  stock: number;
  hpp: number;
  hargaJual: number;
  tanggal: string;
}

interface Product { 
  id: string; 
  nama: string; 
  kode: string; 
  stok?: number;
  hargaJual?: number;
  supplierId?: string;
  hpp?: number;
  lots: ProductLot[]; 
  panjang?: number; 
  lebar?: number;   
  tinggi?: number;  
  berat?: number;    
  satuan?: string;   
  images?: string[]; // Base64 or URLs
  specifications?: string;
  mainFunction?: string;
  mainApplication?: string;
  remarks?: string;
  editHistory?: EditLog[];
  companyId?: string;
  company_id?: string;
}

interface EditLog {
  timestamp: string;
  user: string;
  role: string;
  changes: string;
  type: 'Transaction' | 'PurchaseOrder' | 'Customer' | 'Product' | 'Supplier' | 'Employee';
  id: string;
}

interface Employee {
  id: string;
  nama: string;
  nik: string;
  username: string;
  role: 'superadmin' | 'admin' | 'sales' | 'purchasing' | 'stocklist' | 'finance' | 'pajak' | string;
  biodata: string;
  pendidikan: string;
  foto?: string;
  alamat: string;
  kontakDarurat: string;
  whatsapp: string;
  email: string;
  kontrakAwal: string;
  gaji: number;
  payroll: string;
  pph: number;
  editHistory?: EditLog[];
  companyId?: string;
  company_id?: string;
}

interface UserAccount {
  id: string;
  nama: string;
  username: string;
  password?: string;
  whatsapp: string;
  role: 'superadmin' | 'admin' | 'sales' | 'purchasing' | 'stocklist' | 'finance' | 'pajak' | string;
  createdAt: string;
  permissions?: {
    id: string;
    canView: boolean;
    canEdit: boolean;
  }[];
  companyId?: string;
  company_id?: string;
}

interface RecycledItem {
  id: string;
  type: 'Transaction' | 'Customer' | 'Product' | 'Supplier' | 'Employee' | 'UserAccount';
  data: any;
  deletedAt: string;
  deletedBy?: string; // userId
  deletedByName?: string; // userName
  companyId?: string;
  company_id?: string;
}

interface UserLog {
  id: string;
  userId: string;
  userName: string;
  action: 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'SYNC' | string;
  details: string;
  entity?: string;
  createdAt: string;
}

interface Customer {
  id: string; kode: string; nama: string; jenis: string; phone: string;
  phoneCode?: string;
  email: string; alamat: string; sales: string; leadType: string;
  source: string; npwp: string; keterangan: string; negara: string;
  editHistory?: EditLog[];
  companyId?: string;
  company_id?: string;
}

interface TransactionItem {
  produkId: string; nama: string; kode: string; harga: number; qty: number; diskon: number;
}

interface POItem {
  produkId: string;
  nama: string;
  kode: string;
  jumlah: number;
  hpp: number;
  harga: number;
}

interface PurchaseOrder {
  id: string;
  items: POItem[];
  tanggalPembelian: string;
  supplierId: string;
  status: 'Process' | 'Received' | 'Lunas';
  tanggalDiterima?: string;
  orderedBy?: string;
  // Legacy fields for compatibility during migration if needed
  produkId?: string;
  jumlah?: number;
  hpp?: number;
  harga?: number;
  editHistory?: EditLog[];
  companyId?: string;
  company_id?: string;
}

interface FollowUp {
  tanggal: string;
  keterangan: string;
  method?: 'WhatsApp' | 'Email' | 'Telepon';
  history?: { tanggal: string; keterangan: string; method?: string; editedAt: string }[];
}

interface Transaction {
  id: string; noTrx: string; tanggal: string; customerName: string;
  status?: 'Penawaran' | 'Invoice' | 'Payment' | 'Pengiriman' | 'Selesai' | 'Batal' | 'Progress';
  items: TransactionItem[]; nilaiProyek: number; ppn: boolean; ongkir: boolean;
  biayaOngkir: number; jasaKirim: string; customJasaKirim?: string; noResi?: string; 
  statuses: string[];
  sales: string; keterangan: string;
  paymentStatus?: 'Lunas' | 'Belum Lunas' | string;
  pembayaranDiterima?: number;
  sisaPembayaran?: number;
  jatuhTempo?: string;
  followUpDate?: string;
  followUpMethod?: 'WhatsApp' | 'Email' | 'Telepon';
  followUps?: FollowUp[];
  lastNotifiedAt?: string;
  editHistory?: EditLog[];
  paymentHistory?: { tanggal: string; jumlah: number; keterangan?: string }[];
  companyId?: string;
  company_id?: string;
}

// --- Constants & Dummy Data ---
const DEFAULT_TUTORIALS: TutorialSection[] = [
    {
        id: 'tut-1',
        title: '1. Pengenalan Menu',
        content: `**A. Menu Utama (BRM)**
- **Dashboard**: Melihat ringkasan performa penjualan, grafik penjualan, target sales, dan produk terlaris.
- **Contacts**: Mengelola database pelanggan dan prospek (leads).
- **Penawaran**: Mengelola dan membuat surat penawaran (quotation) untuk pelanggan, lengkap dengan riwayat "Follow-up" untuk setiap transaksi. (Catatan: Penawaran pada sistem lama disebut dengan "Pesanan").

**B. Menu Transaksi (Finance/Logistik)**
- **Transaksi**: Tempat transaksi berproses. Segala pesanan yang disetujui untuk diproses bergeser ke menu transaksi ini. Disinilah Anda bisa mengubah status pesanan dari (Invoice -> Pembayaran -> Pengiriman -> Selesai).

**C. Menu Asset (Gudang/Inventaris)**
- **Dashboard Produk**: Memantau perputaran stok barang.
- **Produk BRM**: Manajemen Database Produk (Harga, Stok, HPP).

**D. Modul Purchasing & Stocklist**
- Menangani pembelian barang (Purchase Order), manajemen supplier, dan riwayat mutasi stok.`,
        images: [],
        order: 1
    },
    {
        id: 'tut-2',
        title: '2. Alur Penawaran hingga Transaksi Selesai',
        content: `1. **Buat Penawaran**: Masuk ke menu "Penawaran" -> klik tombol Tambah Penawaran. Pilih pelanggan, masukkan produk, dan isi ongkos kirim (jika ada).
2. **Follow-up**: Klik detail penawaran -> "Tambah Follow-up". Catat hasil komunikasi dengan pelanggan. Anda juga bisa mengatur status penawaran menjadi *Progress*, *Hold*, atau *Batal*.
3. **Konversi ke Invoice (Deal)**: Jika pelanggan setuju dan bersedia membayar/memproses (Deal), Anda cukup mengklik tombol buat invoice dan mengatur ulang dan memastikan produk yang dipesan sebelum invoice dikirim.
> *Penting: Jika Anda mengatur status menjadi **Invoice**, stok barang tidak akan otomatis dipotong sebelum status transaksi menjadi pengiriman. Jika saat membuat invoice produk yang dimasukkan stoknya di gudang kurang, sistem akan memberikan peringatan dan tidak mengizinkan save hingga Anda melakukan Purchase Order (PO) / Restock.*
4. **Pembayaran**: Masuk ke menu "Transaksi" -> buka transaksi terkait. Klik Action -> Tambah Pembayaran. Jika sudah lunas, status pembayaran otomatis berubah menjadi "Lunas".
5. **Pengiriman**: Jika barang siap dikirim, ubah status transaksi menjadi *Pengiriman*.
6. **Selesai**: Setelah barang diterima pelanggan dan pembayaran lunas, ubah status menjadi *Selesai*. Transaksi ditutup.`,
        images: [],
        order: 2
    },
    {
        id: 'tut-3',
        title: '3. Cara Menambah dan Mengupdate Stock',
        content: `Stok produk **harus** diupdate menggunakan fitur Purchase Order (PO) agar semua transaksi tercatat dengan benar:

1. **Buat Supplier**: Buka modul "Purchasing" -> "Suppliers" -> Tambah data supplier Anda.
2. **Buat Purchase Order (PO)**: Masuk ke menu "Purchase Orders" -> Klik Tambah PO.
3. **Pilih Produk**: Pilih supplier, kemudian masukkan produk beserta jumlah (Qty) dan Harga (HPP). Klik **Simpan**.
4. **Terima Barang**: Saat barang sampai di gudang, buka PO tersebut -> Pada Log Status, klik **Terima** (Ubah status menuju *Received*).
   > *Sistem akan secara otomatis menambahkan stok* produk ke menu Products sesuai jumlah yang ada di PO.
5. **Pelunasan PO**: Saat PO dibayar, klik tombol **Lunas** pada PO tersebut.`,
        images: [],
        order: 3
    },
    {
        id: 'tut-4',
        title: '4. Cara Mengembalikan Data yang Terhapus',
        content: `1. Buka Modul / Menu **Control Panel** (hanya tersedia untuk Superadmin).
2. Pilih submenu **Recycle Bin**.
3. Di sana Anda akan melihat daftar semua data (Kontak, Produk, Transaksi, PO) yang telah dihapus dalam 30 hari terakhir.
4. Klik tombol **Restore** (ikon <kbd>RotateCcw</kbd>) pada data yang ingin dikembalikan. Data akan kembali ke menu asalnya.`,
        images: [],
        order: 4
    },
    {
        id: 'tut-5',
        title: '5. Cara Mendownload Data Excel',
        content: `Hampir di setiap menu (seperti Contacts, Produk, atau Dashboard Laporan) terdapat fasilitas export:
1. Perhatikan tombol **Export** atau ikon <kbd>Download</kbd> (Kuning / Hijau) di pojok kanan atas tabel/dashboard.
2. Lakukan filter data terlebih dahulu jika ingin men-download data spesifik (misalnya filter bulan, atau cari nama).
3. Klik tombol **Export (*.csv / Excel)**.
4. File akan otomatis ter-download ke perangkat Anda dan dapat dibuka menggunakan Microsoft Excel atau Google Sheets.`,
        images: [],
        order: 5
    }
];

const UNIT_LIST = ['Pcs', 'Unit', 'Set', 'Box', 'Kg', 'Mtr', 'Roll', 'Lembar', 'Pack', 'Kaleng', 'Liter', 'Galon'];
const SHIPPING_SERVICES = ['JNE Regular', 'J&T Express', 'SiCepat Halu', 'SiCepat Gokil', 'AnterAja', 'GoSend Instant', 'GrabExpress', 'Kurir Internal', 'Ambil Sendiri', 'Lainnya'];

const MONTHS = [
  { value: '01', label: 'Januari' },
  { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mei' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' },
];

const COUNTRY_CODES = [
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+1', name: 'USA', flag: '🇺🇸' },
  { code: '+44', name: 'UK', flag: '🇬🇧' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: '+34', name: 'Spain', flag: '🇪🇸' },
  { code: '+7', name: 'Russia', flag: '🇷🇺' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+31', name: 'Netherlands', flag: '🇳🇱' },
  { code: '+41', name: 'Switzerland', flag: '🇨🇭' },
  { code: '+46', name: 'Sweden', flag: '🇸🇪' },
  { code: '+47', name: 'Norway', flag: '🇳🇴' },
  { code: '+45', name: 'Denmark', flag: '🇩🇰' },
  { code: '+358', name: 'Finland', flag: '🇫🇮' },
  { code: '+353', name: 'Ireland', flag: '🇮🇪' },
  { code: '+32', name: 'Belgium', flag: '🇧🇪' },
  { code: '+43', name: 'Austria', flag: '🇦🇹' },
  { code: '+351', name: 'Portugal', flag: '🇵🇹' },
  { code: '+30', name: 'Greece', flag: '🇬🇷' },
  { code: '+90', name: 'Turkey', flag: '🇹🇷' },
  { code: '+20', name: 'Egypt', flag: '🇪🇬' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: '+212', name: 'Morocco', flag: '🇲🇦' },
  { code: '+54', name: 'Argentina', flag: '🇦🇷' },
  { code: '+56', name: 'Chile', flag: '🇨🇱' },
  { code: '+57', name: 'Colombia', flag: '🇨🇴' },
  { code: '+51', name: 'Peru', flag: '🇵🇪' },
  { code: '+52', name: 'Mexico', flag: '🇲🇽' },
  { code: '+1', name: 'Canada', flag: '🇨🇦' },
  { code: '+64', name: 'New Zealand', flag: '🇳🇿' },
].sort((a, b) => a.name.localeCompare(b.name));

// Dummy Data Generators
const DUMMY_CUSTOMERS: Customer[] = [];

const DUMMY_SUPPLIERS: Supplier[] = [];

const DUMMY_PRODUCTS: Product[] = [];

const DUMMY_TRANSACTIONS: Transaction[] = [];

const MENU_STRUCTURE = [
  { 
    category: 'BRM', 
    icon: Briefcase,
    items: [
      { label: 'Dashboard', id: 'Dashboard' },
      { label: 'Contacts', id: 'Contacts' },
      { label: 'Penawaran', id: 'Penawaran' }
    ]
  },
  { 
    category: 'TRADE', 
    icon: ShoppingCart,
    items: [
      { label: 'Transaksi', id: 'Transaksi' },
      { label: 'Invoice', id: 'Invoice' },
      { label: 'Pembayaran', id: 'Pembayaran' },
      { label: 'Belum Lunas', id: 'Belum Lunas' },
      { label: 'Pengiriman', id: 'Pengiriman' },
      { label: 'Pesanan Selesai', id: 'Pesanan Selesai' },
      { label: 'Pesanan Batal', id: 'Pesanan Batal' }
    ]
  },
  { 
    category: 'Purchasing', 
    icon: ShoppingBag,
    items: [
      { label: 'Produk', id: 'Produk', permId: 'purchasing_produk' }, 
      { label: 'Suppliers', id: 'Suppliers', permId: 'purchasing_suppliers' },
      { label: 'Tambah stock', id: 'Purchase Orders', permId: 'purchasing_po' }
    ]
  },
  { 
    category: 'Stocklist', 
    icon: Box,
    items: [
      { label: 'Stock Produk', id: 'Produk', permId: 'stocklist_produk' }, 
      { label: 'Suppliers Stock', id: 'Suppliers', permId: 'stocklist_suppliers' },
      { label: 'Tambah stock produk', id: 'Purchase Orders', permId: 'stocklist_po' }
    ]
  },
  { 
    category: 'Asset', 
    icon: LayoutDashboard,
    items: [
      { label: 'Dashboard Produk', id: 'Dashboard Produk' },
      { label: 'Produk BRM', id: 'Produk', permId: 'asset_produk' }
    ]
  },
  { 
    category: 'FINANCE', 
    icon: Wallet,
    items: [
      { label: 'Buku Besar', id: 'Buku Besar' },
      { label: 'Jurnal', id: 'Jurnal' },
      { label: 'Hutang', id: 'Hutang' },
      { label: 'Piutang', id: 'Piutang' },
      { label: 'PPN', id: 'PPN' },
      { label: 'NON PPN', id: 'NON PPN' },
      { label: 'Ongkir', id: 'Ongkir' }
    ]
  },
  { 
    category: 'HR', 
    icon: Users,
    items: [
      { label: 'Employees', id: 'Employees' },
      { label: 'Skills', id: 'Skills' },
      { label: 'KPI', id: 'KPI' }
    ]
  },
  { 
    category: 'Admin', 
    icon: ShieldCheck,
    items: [
      { label: 'Users', id: 'Users' },
      { label: 'Akses Kontrol', id: 'Access Control' },
      { label: 'Recycle Bin', id: 'Recycle Bin' },
      { label: 'Settings', id: 'Settings' }
    ]
  },
  { 
    category: 'WhatsApp', 
    icon: MessageSquare,
    items: [
      { label: 'Chat WA', id: 'WA Chat' },
      { label: 'Setting AI', id: 'WA Setting AI' },
      { label: 'Perangkat (QR)', id: 'WA Perangkat' }
    ]
  },
  { 
    category: 'Control Panel', 
    icon: Settings,
    items: [
      { label: 'Upload Data', id: 'Upload Data' },
      { label: 'Users', id: 'Users' },
      { label: 'Akses Kontrol', id: 'Access Control' },
      { label: 'Recycle Bin', id: 'Recycle Bin' },
      { label: 'Pengaturan Perusahaan', id: 'Pengaturan Perusahaan' },
      { label: 'Settings', id: 'Settings' },
      { label: 'Log User', id: 'Log User' }
    ]
  }
];

const ROLE_TEMPLATES: Record<string, { id: string; canView: boolean; canEdit: boolean }[]> = {
    'admin': [
        { id: 'Dashboard', canView: true, canEdit: true },
        { id: 'Dashboard Produk', canView: true, canEdit: true },
        { id: 'purchasing_produk', canView: true, canEdit: true },
        { id: 'purchasing_suppliers', canView: true, canEdit: true },
        { id: 'purchasing_po', canView: true, canEdit: true },
        { id: 'stocklist_produk', canView: true, canEdit: true },
        { id: 'stocklist_suppliers', canView: true, canEdit: true },
        { id: 'stocklist_po', canView: true, canEdit: true },
        { id: 'asset_produk', canView: true, canEdit: true },
        { id: 'Produk', canView: true, canEdit: true },
        { id: 'Contacts', canView: true, canEdit: true },
        { id: 'Transaksi', canView: true, canEdit: true },
        { id: 'Penawaran', canView: true, canEdit: true },
        { id: 'Invoice', canView: true, canEdit: true },
        { id: 'Pembayaran', canView: true, canEdit: true },
        { id: 'Belum Lunas', canView: true, canEdit: true },
        { id: 'Pengiriman', canView: true, canEdit: true },
        { id: 'Pesanan Selesai', canView: true, canEdit: true },
        { id: 'Pesanan Batal', canView: true, canEdit: true },
        { id: 'Suppliers', canView: true, canEdit: true },
        { id: 'Purchase Orders', canView: true, canEdit: true },
        { id: 'Buku Besar', canView: true, canEdit: true },
        { id: 'Jurnal', canView: true, canEdit: true },
        { id: 'Hutang', canView: true, canEdit: true },
        { id: 'Piutang', canView: true, canEdit: true },
        { id: 'PPN', canView: true, canEdit: true },
        { id: 'NON PPN', canView: true, canEdit: true },
        { id: 'Ongkir', canView: true, canEdit: true },
        { id: 'Employees', canView: true, canEdit: true },
        { id: 'Skills', canView: true, canEdit: true },
        { id: 'KPI', canView: true, canEdit: true },
        { id: 'Upload Data', canView: true, canEdit: true }
    ],
    'sales': [
        { id: 'Dashboard', canView: true, canEdit: false },
        { id: 'purchasing_produk', canView: true, canEdit: false },
        { id: 'stocklist_produk', canView: true, canEdit: false },
        { id: 'Produk', canView: true, canEdit: false },
        { id: 'Contacts', canView: true, canEdit: true },
        { id: 'Transaksi', canView: true, canEdit: true },
        { id: 'Penawaran', canView: true, canEdit: true },
        { id: 'Invoice', canView: true, canEdit: true },
        { id: 'Pembayaran', canView: true, canEdit: true },
        { id: 'KPI', canView: true, canEdit: false },
        { id: 'Pengiriman', canView: true, canEdit: false },
        { id: 'Pesanan Selesai', canView: true, canEdit: false }
    ],
    'purchasing': [
        { id: 'Dashboard', canView: true, canEdit: false },
        { id: 'purchasing_produk', canView: true, canEdit: true },
        { id: 'purchasing_suppliers', canView: true, canEdit: true },
        { id: 'purchasing_po', canView: true, canEdit: true },
        { id: 'Produk', canView: true, canEdit: true },
        { id: 'Suppliers', canView: true, canEdit: true },
        { id: 'KPI', canView: true, canEdit: false },
        { id: 'Purchase Orders', canView: true, canEdit: true }
    ],
    'stocklist': [
        { id: 'Dashboard', canView: true, canEdit: false },
        { id: 'stocklist_produk', canView: true, canEdit: true },
        { id: 'stocklist_suppliers', canView: true, canEdit: false },
        { id: 'stocklist_po', canView: true, canEdit: false },
        { id: 'Produk', canView: true, canEdit: true },
        { id: 'Suppliers', canView: true, canEdit: false },
        { id: 'KPI', canView: true, canEdit: false },
        { id: 'Purchase Orders', canView: true, canEdit: false }
    ],
    'finance': [
        { id: 'Dashboard', canView: true, canEdit: false },
        { id: 'Buku Besar', canView: true, canEdit: true },
        { id: 'Jurnal', canView: true, canEdit: true },
        { id: 'Hutang', canView: true, canEdit: true },
        { id: 'Piutang', canView: true, canEdit: true },
        { id: 'PPN', canView: true, canEdit: true },
        { id: 'NON PPN', canView: true, canEdit: true },
        { id: 'Ongkir', canView: true, canEdit: true },
        { id: 'KPI', canView: true, canEdit: true },
        { id: 'Pembayaran', canView: true, canEdit: true }
    ],
    'hr': [
        { id: 'Employees', canView: true, canEdit: true },
        { id: 'Skills', canView: true, canEdit: true },
        { id: 'KPI', canView: true, canEdit: true }
    ],
    'engineer': [
        { id: 'Dashboard', canView: true, canEdit: false },
        { id: 'Contacts', canView: true, canEdit: false },
        { id: 'Penawaran', canView: true, canEdit: false },
        { id: 'Transaksi', canView: true, canEdit: false },
        { id: 'asset_produk', canView: true, canEdit: false },
        { id: 'purchasing_produk', canView: true, canEdit: false },
        { id: 'stocklist_produk', canView: true, canEdit: false },
        { id: 'KPI', canView: true, canEdit: false },
        { id: 'Produk', canView: true, canEdit: false }
    ],
    'view_only': [
        { id: 'Dashboard', canView: true, canEdit: false },
        { id: 'Dashboard Produk', canView: true, canEdit: false },
        { id: 'asset_produk', canView: true, canEdit: false },
        { id: 'purchasing_produk', canView: true, canEdit: false },
        { id: 'stocklist_produk', canView: true, canEdit: false },
        { id: 'Produk', canView: true, canEdit: false },
        { id: 'Contacts', canView: true, canEdit: false },
        { id: 'Transaksi', canView: true, canEdit: false },
        { id: 'Invoice', canView: true, canEdit: false },
        { id: 'Pembayaran', canView: true, canEdit: false },
        { id: 'KPI', canView: true, canEdit: false },
        { id: 'Pengiriman', canView: true, canEdit: false }
    ]
};

// --- Helpers ---
const generateProductCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

const generateSupplierCode = () => Math.floor(10000 + Math.random() * 90000).toString();

const generateInvoiceNumber = () => {
    const timestampSnippet = Date.now().toString().slice(-6);
    const random2 = Math.floor(10 + Math.random() * 90);
    return `PP${timestampSnippet}${random2}WJY`;
};

const formatInputNumber = (val: number | string | undefined) => {
  if (val === undefined || val === null || val === '') return '';
  const num = typeof val === 'string' ? parseInt(val.replace(/\./g, '')) : val;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('id-ID').format(num);
};

const parseInputNumber = (val: string) => parseInt(val.replace(/\./g, '')) || 0;

const formatRupiah = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
};

const getProductStockHistory = (product: Product, purchaseOrders: PurchaseOrder[], transactions: Transaction[]) => {
  const history: any[] = [];
  
  // From Purchase Orders (Additions)
  purchaseOrders.filter(po => po.status === 'Received' || po.status === 'Lunas').forEach(po => {
    // Handle both old structure and new structure
    if (po.items && po.items.length > 0) {
      const item = po.items.find(i => i.produkId === product.id);
      if (item) {
        history.push({
          type: 'IN',
          source: 'Purchase Order',
          id: po.id,
          date: po.tanggalDiterima || po.tanggalPembelian,
          qty: item.jumlah,
          user: typeof po.orderedBy === 'string' ? po.orderedBy : 'Unknown', 
          role: 'Procurement',
          ref: po.id,
          fullPO: po
        });
      }
    } else if (po.produkId === product.id) {
      history.push({
        type: 'IN',
        source: 'Purchase Order',
        id: po.id,
        date: po.tanggalDiterima || po.tanggalPembelian,
        qty: po.jumlah || 0,
        user: typeof po.orderedBy === 'string' ? po.orderedBy : 'Unknown', 
        role: 'Procurement',
        ref: po.id,
        fullPO: po
      });
    }
  });
  
  // From Transactions (Subtractions)
  transactions.filter(t => !(t.statuses || []).includes('Batal') && ((t.statuses || []).includes('Pengiriman') || (t.statuses || []).includes('Selesai'))).forEach(t => {
    const item = t.items.find(i => i.produkId === product.id);
    if (item) {
      history.push({
        type: 'OUT',
        source: 'Transaction',
        id: t.id,
        date: t.tanggal,
        qty: item.qty,
        user: t.sales,
        role: 'Sales Rep',
        ref: t.id,
        noTrx: t.noTrx,
        fullTrx: t,
        customerName: t.customerName,
        status: t.status
      });
    }
  });
  
  // From Edit History (Manual Adjustments)
  if (product.editHistory && product.editHistory.length > 0) {
      product.editHistory.forEach(log => {
          const match = log.changes.match(/Tambah Stok: (\d+)/);
          if (match) {
              // Convert "DD/MM/YYYY, HH.mm.ss" to a sortable date "YYYY-MM-DD" approximately for sorting
              const dateParts = log.timestamp.split(', ')[0].split('/');
              const isoDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : log.timestamp;
              
              history.push({
                  type: 'IN',
                  source: 'Penyesuaian Manual',
                  id: `adj-${log.timestamp}`,
                  date: isoDate,
                  qty: parseInt(match[1], 10),
                  user: log.user,
                  role: log.role,
                  ref: 'Adjustment',
                  fullPO: null
              });
          }
      });
  }
  
  return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

const TransactionPreview = ({ trx, onClose }: { trx: Transaction; onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 w-full max-w-2xl rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/60 dark:bg-zinc-900/40">
          <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Eye size={16} className="text-zinc-500"/>
            Pratinjau Transaksi (Tanpa Harga)
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md transition-colors"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1">No. Transaksi</div>
              <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{trx.noTrx}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1">Tanggal</div>
              <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{trx.tanggal}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1">Customer</div>
              <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{trx.customerName}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1">Sales</div>
              <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{trx.sales}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1">Status</div>
              <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{trx.status || 'N/A'}</div>
            </div>
          </div>

          {trx.keterangan && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-1">Keterangan</div>
              <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-lg border border-zinc-200 dark:border-zinc-800">{trx.keterangan}</div>
            </div>
          )}
          
          {!(trx.statuses || []).includes('Penawaran') && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-400 mb-2">Item Pesanan</div>
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-zinc-500">Produk</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-zinc-500">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {trx.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">{item.nama}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{item.kode}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center font-semibold text-zinc-700 dark:text-zinc-300">{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900 text-xs font-medium rounded-md transition-colors shadow-xs cursor-pointer">Tutup</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Custom Components ---

const StatCard = ({ title, value, icon, trend, trendLabel, colorClass, trendType = 'up', onClick, subtext }: { title: string; value: string; icon: React.ReactNode; trend: string; trendLabel?: string; colorClass: string; trendType?: 'up' | 'down'; onClick?: () => void; subtext?: string }) => {
  return (
    <div 
      onClick={onClick}
      className={`rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xs transition-all hover:border-zinc-300 dark:hover:border-zinc-700 group ${onClick ? 'cursor-pointer hover:shadow-md hover:border-emerald-500/50 active:scale-[0.99]' : ''}`}
    >
      <div className="flex items-center justify-between pb-3">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 tracking-tight flex items-center gap-1">
          {title}
          {onClick && <ArrowUpRight size={12} className="text-emerald-600 dark:text-emerald-400 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />}
        </span>
        <div className="h-8 w-8 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0">
          {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { 
            size: 16,
            className: "text-zinc-700 dark:text-zinc-300"
          })}
        </div>
      </div>
      
      <div>
        <div className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{value}</div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <div className="flex items-center gap-2">
            {trend !== '0%' ? (
              <span className={`inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded text-[11px] ${
                trendType === 'up' 
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' 
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
              }`}>
                {trendType === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {trend}
              </span>
            ) : (
              <span className="text-zinc-400 dark:text-zinc-500 text-[11px]">Stabil</span>
            )}
            {trendLabel && trend !== '0%' && (
              <span className="text-zinc-400 dark:text-zinc-500 text-[11px] truncate">{trendLabel}</span>
            )}
          </div>
          {subtext && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold underline decoration-emerald-300 underline-offset-2 flex items-center gap-0.5">
              {subtext}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const SearchableSelect = ({ 
  options, 
  value, 
  onChange, 
  placeholder, 
  className 
}: { 
  options: { value: string; label: string; image?: string }[], 
  value: string, 
  onChange: (val: string) => void, 
  placeholder: string,
  className?: string
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => { if (!isOpen) setSearch(''); }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);
  const selectedLabel = selectedOption?.label || value;
  const selectedImage = selectedOption?.image;
  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative group w-full" ref={wrapperRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)} 
        className={`relative cursor-pointer flex items-center justify-between gap-2 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-md px-3 py-2 text-sm transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 ${className} ${!value ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'} ${isOpen ? 'ring-1 ring-zinc-900 dark:ring-zinc-300 border-zinc-900 dark:border-zinc-300' : ''}`}
      >
        <div className="flex items-center gap-2 truncate w-[90%]">
           {selectedImage && <img src={selectedImage} alt="" className="w-5 h-5 rounded object-cover shrink-0" referrerPolicy="no-referrer" />}
           <span className="truncate block select-none text-sm">
              {selectedLabel || placeholder}
           </span>
        </div>
        <ChevronDown size={14} className={`text-zinc-400 dark:text-zinc-500 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-zinc-900 dark:text-zinc-100' : ''}`}/>
      </div>

      {isOpen && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="absolute z-50 w-full bg-white dark:bg-zinc-950 rounded-lg mt-1 shadow-lg border border-zinc-200 dark:border-zinc-800 max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="p-2 sticky top-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur z-10 border-b border-zinc-100 dark:border-zinc-800">
            <input 
                autoFocus
                type="text" 
                className="w-full bg-zinc-50 dark:bg-zinc-900 rounded-md py-1.5 px-3 text-xs outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
                placeholder="Cari..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    e.stopPropagation();
                }}
            />
          </div>
          <div className="p-1">
            {filteredOptions.length > 0 ? filteredOptions.map(opt => (
                <div 
                    key={opt.value} 
                    onClick={() => { onChange(opt.value); setIsOpen(false); }}
                    className={`px-3 py-2 text-xs rounded-md cursor-pointer transition-colors flex justify-between items-center ${value === opt.value ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300'}`}
                >
                    <div className="flex items-center gap-2">
                        {opt.image && <img src={opt.image} alt="" className="w-6 h-6 rounded object-cover shrink-0" referrerPolicy="no-referrer" />}
                        <span>{opt.label}</span>
                    </div>
                    {value === opt.value && <Check size={12} className="text-zinc-900 dark:text-zinc-100"/>}
                </div>
            )) : (
                <div className="p-4 text-center text-zinc-400 dark:text-zinc-500 text-xs">No options found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TopTab = ({ label, active, onClick, onClose }: { label: string, active: boolean, onClick: () => void, onClose?: () => void, key?: string }) => (
    <div 
        onClick={onClick}
        className={`
            group relative h-8 px-3 rounded-md text-xs font-medium cursor-pointer flex items-center gap-2 transition-all duration-150 border select-none
            ${active 
                ? 'bg-black text-white dark:bg-black dark:text-white border-black font-semibold shadow-xs' 
                : 'bg-zinc-100/60 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 border-transparent'}
        `}
    >
        <span className="truncate max-w-[140px]">{label.replace(/^#/, '')}</span>
        {onClose && (
            <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="opacity-40 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 rounded-sm p-0.5 transition-all"
            >
                <X size={11} />
            </button>
        )}
    </div>
);

const processImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Max dimensions to avoid huge canvases
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                
                // Convert to WebP with quality adjustment
                let quality = 0.8;
                let dataUrl = canvas.toDataURL('image/webp', quality);
                
                // If still too large (approximate check), we can reduce quality further
                // 1MB is roughly 1,000,000 bytes. Base64 is ~1.33x larger.
                // We target around 800KB (800,000 * 1.33 = ~1,064,000 chars)
                while (dataUrl.length > 1000000 && quality > 0.1) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/webp', quality);
                }
                
                resolve(dataUrl);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
};

const Login = ({ onLogin, users, dbStatus, dbError }: { onLogin: (user: UserAccount) => void, users: UserAccount[], dbStatus: string, dbError: string | null }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(`Login attempt: ${username} (Password length: ${password.length})`);
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      console.log('Login successful for user:', user.nama);
      onLogin(user);
    } else {
      console.log('Login failed: User not found or password mismatch. Total users in state:', users.length);
      const userExists = users.find(u => u.username === username);
      if (userExists) {
        console.log(`User ${username} exists but password check failed. User object has password: ${!!userExists.password}`);
      }
      setError('Username atau password salah');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 font-sans text-zinc-900 dark:text-zinc-100">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 shadow-xl p-8 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center text-center mb-6">
           <div className="w-12 h-12 rounded-xl bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 flex items-center justify-center font-bold text-xl mb-3 shadow-xs">
               MP
           </div>
           <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Masuk ke MyPanca</h1>
           <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Platform Manajemen Bisnis & ERP Terpadu</p>
           
           <div className="mt-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[11px]">
                <div className={`w-2 h-2 rounded-full ${
                    dbStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                    dbStatus === 'error' ? 'bg-rose-500 animate-pulse' : 
                    'bg-amber-400 animate-bounce'
                }`} />
                <span className={`font-medium ${
                    dbStatus === 'connected' ? 'text-emerald-700 dark:text-emerald-400' : 
                    dbStatus === 'error' ? 'text-rose-600 dark:text-rose-400' : 
                    'text-amber-600 dark:text-amber-400'
                }`}>
                    {dbStatus === 'connected' ? 'Cloud Supabase Terhubung' : dbStatus === 'error' ? 'Koneksi Cloud Terputus' : 'Menghubungkan Cloud...'}
                </span>
           </div>
           {dbStatus === 'error' && dbError && (
               <p className="text-[10px] text-rose-500 mt-1 max-w-xs">{dbError}</p>
           )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
           <div>
               <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Username / Email</label>
               <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                       <User size={16} />
                   </div>
                   <input 
                       type="text" 
                       required
                       className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-300 transition-colors shadow-xs"
                       placeholder="contoh: superadmin"
                       value={username}
                       onChange={(e) => setUsername(e.target.value)}
                   />
               </div>
           </div>

           <div>
               <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Password</label>
               <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                       <ShieldCheck size={16} />
                   </div>
                   <input 
                       type="password" 
                       required
                       className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-300 transition-colors shadow-xs"
                       placeholder="••••••••••••"
                       value={password}
                       onChange={(e) => setPassword(e.target.value)}
                   />
               </div>
           </div>

           {error && (
               <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium py-2.5 px-3 rounded-md flex items-center gap-2">
                   <AlertTriangle size={14} className="shrink-0" />
                   <span>{error}</span>
               </div>
           )}

           <button 
               type="submit"
               className="w-full h-10 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900 font-medium text-sm rounded-md transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
           >
               <span>Masuk Sistem</span>
               <ArrowRight size={15} />
           </button>
        </form>

        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                PT. Panca Prima Wijaya &bull; Versi Modern Shadcn
            </p>
        </div>
      </div>
    </div>
  );
};

const UPLOAD_HEADERS: Record<string, string[]> = {
  'Contact': ['Nama', 'Jenis', 'Email', 'Telepon', 'Alamat', 'Sales', 'Lead Type', 'NPWP', 'Negara', 'Keterangan'],
  'Transaksi': ['Tanggal', 'Customer', 'Jenis Customer', 'No Telepon', 'Alamat', 'Produk', 'Harga', 'Kuantiti', 'Nilai Proyek', 'Sales', 'Status', 'Keterangan', 'No Transaksi'],
  'Produk': ['Nama', 'Stock', 'HPP', 'Harga Jual', 'Deskripsi']
};

const UploadDataView = ({ 
  activeUploadType, setActiveUploadType, 
  uploadGridData, setUploadGridData, 
  isUploading, setIsUploading,
  customers, setCustomers,
  products, setProducts,
  transactions, setTransactions,
  suppliers, setSuppliers,
  activeCompanyId, syncToSupabase,
  salesMembers
}: any) => {
  const headers = UPLOAD_HEADERS[activeUploadType] || [];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true, cellNF: false, cellText: false });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (data.length > 0) {
          const fileHeaders = data[0].map((h: any) => h?.toString()?.trim() || '');
          const rows = data.slice(1);
          
          const newGridData = rows.map(row => {
            const obj: any = {};
            headers.forEach((h: string, idx: number) => {
              let fileColIdx = -1;
              
              // Direct mapping for Transaksi if headers are missing or to force A/A-M mapping
              if (activeUploadType === 'Transaksi') {
                if (idx === 0) fileColIdx = 0; // Tanggal column A
                if (idx === 1) fileColIdx = 1; // Customer column B
                if (idx === 2) fileColIdx = 2; // Jenis Customer column C
                if (idx === 3) fileColIdx = 3; // No Telepon column D
                if (idx === 4) fileColIdx = 4; // Alamat column E
                if (idx === 5) fileColIdx = 5; // Produk column F
                if (idx === 6) fileColIdx = 6; // Harga column G
                if (idx === 7) fileColIdx = 7; // Kuantiti column H
                if (idx === 8) fileColIdx = 8; // Nilai Proyek column I
                if (idx === 9) fileColIdx = 9; // Sales column J
                if (idx === 10) fileColIdx = 10; // Status column K
                if (idx === 11) fileColIdx = 11; // Keterangan column L
                if (idx === 12) fileColIdx = 12; // No Transaksi column M
              }

              if (fileColIdx === -1) {
                fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase() === h.toLowerCase());
              }
              
              // Fallbacks for variations
              if (fileColIdx === -1) {
                if (h === 'Customer') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase() === 'name' || fh.toLowerCase() === 'nama');
                if (h === 'No Telepon') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase().includes('telepon') || fh.toLowerCase().includes('phone') || fh.toLowerCase().includes('hp'));
                if (h === 'Nama') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase().includes('nama produk') || fh.toLowerCase() === 'produk');
                if (h === 'Stock') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase() === 'unit' || fh.toLowerCase() === 'stok' || fh.toLowerCase() === 'qty');
                if (h === 'HPP') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase().includes('hpp') || fh.toLowerCase().includes('pokok'));
                if (h === 'Harga Jual') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase().includes('jual') || fh.toLowerCase() === 'harga');
                if (h === 'Telepon') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase() === 'phone' || fh.toLowerCase() === 'hp' || fh.toLowerCase() === 'mobile' || fh.toLowerCase() === 'whatsapp');
                if (h === 'Produk') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase() === 'product' || fh.toLowerCase().includes('item'));
                if (h === 'Harga') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase() === 'price' || fh.toLowerCase().includes('harga satuan'));
                if (h === 'Kuantiti') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase() === 'quantity' || fh.toLowerCase() === 'qty' || fh.toLowerCase() === 'jumlah');
                if (h === 'Sales') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase().includes('sales') || fh.toLowerCase().includes('marketing') || fh.toLowerCase() === 'nama');
                if (h === 'Nilai Proyek') fileColIdx = fileHeaders.findIndex(fh => fh.toLowerCase().includes('nilai') || fh.toLowerCase().includes('projek') || fh.toLowerCase().includes('total'));
              }

              if (fileColIdx > -1) {
                let rawVal = row[fileColIdx];
                let val = '';
                
                if (rawVal instanceof Date) {
                  // Format as YYYY-MM-DD
                  const y = rawVal.getFullYear();
                  const m = String(rawVal.getMonth() + 1).padStart(2, '0');
                  const d = String(rawVal.getDate()).padStart(2, '0');
                  val = `${y}-${m}-${d}`;
                } else {
                  val = rawVal?.toString()?.trim() || '';
                }
                
                // Logic: jika no diawali 62 (hapus angka 62 nya)
                if (h === 'Telepon' && val.startsWith('62')) {
                  val = val.substring(2);
                }
                
                obj[h] = val;
              }
            });
            return obj;
          });

          const filteredData = newGridData.filter(row => Object.values(row).some(v => v !== ''));

          if (filteredData.length > 0) {
            setUploadGridData((prev: any[]) => {
              // Place imported data starting from first empty row or at the end
              const existingOccupiedRows = prev.filter(r => Object.values(r).some(v => v !== ''));
              const combined = [...existingOccupiedRows, ...filteredData];
              if (combined.length < 10) {
                return [...combined, ...Array(10 - combined.length).fill({})];
              }
              return combined;
            });
            alert(`Berhasil mengimpor ${filteredData.length} baris.`);
          }
        }
      } catch (err: any) {
        alert("Gagal mengimpor file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData) return;
    
    // Improved TSV parsing to handle quoted multiline strings from Excel
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < pasteData.length; i++) {
        const char = pasteData[i];
        const nextChar = pasteData[i+1];
        
        if (char === '"' && (i === 0 || pasteData[i-1] === '\t' || pasteData[i-1] === '\n' || pasteData[i-1] === '\r' || inQuotes)) {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === '\t' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    if (currentCell !== '' || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }
    
    setUploadGridData((prev: any[]) => {
      const newData = [...prev];
      
      rows.forEach((rowCells, rIdx) => {
        const targetRowIdx = rowIndex + rIdx;
        if (targetRowIdx >= newData.length) newData.push({});
        
        const rowData = { ...newData[targetRowIdx] };
        rowCells.forEach((cellValue, cIdx) => {
          const targetColIdx = colIndex + cIdx;
          if (targetColIdx < headers.length) {
            rowData[headers[targetColIdx]] = cellValue.trim();
          }
        });
        newData[targetRowIdx] = rowData;
      });
      return newData;
    });
  };

  const handleValueChange = (rowIndex: number, header: string, value: string) => {
    setUploadGridData((prev: any[]) => {
      const newData = [...prev];
      newData[rowIndex] = { ...newData[rowIndex], [header]: value };
      return newData;
    });
  };

  const handleRemoveRow = (rowIndex: number) => {
    setUploadGridData(prev => prev.filter((_, i) => i !== rowIndex));
  };

  const handleSave = async () => {
    const validRows = uploadGridData.filter(row => Object.values(row).some(v => v !== undefined && v !== ''));
    if (validRows.length === 0) {
      alert("Tidak ada data untuk disimpan.");
      return;
    }

    setIsUploading(true);
    try {
      let count = 0;
      if (activeUploadType === 'Contact') {
        const updatedList = [...customers];
        for (const row of validRows) {
          const nama = row['Nama'] || '';
          if (!nama) continue;
          
          const existingIdx = updatedList.findIndex(c => c.nama.toLowerCase() === nama.toLowerCase());
          
          if (existingIdx > -1) {
            const updated = {
              ...updatedList[existingIdx],
              jenis: (row['Jenis'] === 'Personal' ? 'Personal' : 'Perusahaan') as any,
              email: row['Email'] || updatedList[existingIdx].email,
              phone: row['Telepon'] || updatedList[existingIdx].phone,
              alamat: row['Alamat'] || updatedList[existingIdx].alamat,
              sales: row['Sales'] || updatedList[existingIdx].sales,
              leadType: (row['Lead Type'] || updatedList[existingIdx].leadType) as any,
              npwp: row['NPWP'] || updatedList[existingIdx].npwp,
              negara: row['Negara'] || updatedList[existingIdx].negara,
              keterangan: row['Keterangan'] || updatedList[existingIdx].keterangan,
            };
            updatedList[existingIdx] = updated;
            syncToSupabase('customers', updated);
          } else {
            const newOne = {
              id: 'C' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
              kode: `CUST-${updatedList.length + 1}`,
              nama,
              jenis: (row['Jenis'] === 'Personal' ? 'Personal' : 'Perusahaan') as any,
              email: row['Email'] || '',
              phone: row['Telepon'] || '',
              phoneCode: '+62',
              alamat: row['Alamat'] || '',
              sales: row['Sales'] || salesMembers[0],
              leadType: (row['Lead Type'] || 'Belum Transaksi') as any,
              source: 'Manual Upload',
              npwp: row['NPWP'] || '',
              negara: row['Negara'] || 'Indonesia',
              keterangan: row['Keterangan'] || '',
              companyId: activeCompanyId
            };
            updatedList.push(newOne);
            syncToSupabase('customers', newOne);
          }
          count++;
        }
        setCustomers(updatedList);
      } else if (activeUploadType === 'Produk') {
        const updatedList = [...products];

        // Find or create default supplier PT. Panca Prima Wijaya
        let defaultSupplier = suppliers.find((s: Supplier) => s.nama.toLowerCase().includes('panca prima wijaya'));
        if (!defaultSupplier) {
          defaultSupplier = {
              id: 'S-DEFAULTPANCA',
              nama: 'PT. Panca Prima Wijaya',
              kode: 'SUP-PANCA',
              npwp: '',
              companyId: activeCompanyId
          };
          // Sync to state and supabase
          setSuppliers((prev: Supplier[]) => [...prev, defaultSupplier]);
          syncToSupabase('suppliers', defaultSupplier);
        }

        for (const row of validRows) {
          const nama = row['Nama'] || '';
          if (!nama) continue;

          const cleanNum = (v: any) => {
            if (typeof v === 'number') return v;
            if (!v) return 0;
            // Remove Rp, Spaces, and common non-numeric chars
            let s = v.toString().replace(/Rp/gi, '').replace(/\s/g, '').trim();
            
            // Check if it's standard English format (one dot for decimal, no comma or comma for thousand)
            // Or Indonesian format (one comma for decimal, dots for thousand)
            
            // If it has multiple dots it's probably thousand separators
            if ((s.match(/\./g) || []).length > 1) {
              s = s.replace(/\./g, '');
            }
            
            // If it has a comma and a dot, comma is usually decimal (ID) or thousand (EN)
            // For now, let's stick to Indonesian preference but be safer
            const lastComma = s.lastIndexOf(',');
            const lastDot = s.lastIndexOf('.');
            
            if (lastComma > lastDot) {
              // Probably ID format: 1.000,50 -> 1000.50
              s = s.replace(/\./g, '').replace(',', '.');
            } else if (lastDot > lastComma && lastComma !== -1) {
              // Probably EN format: 1,000.50 -> 1000.50
              s = s.replace(/,/g, '');
            } else if (lastDot === -1 && lastComma !== -1) {
              // Only comma: 1000,50 -> 1000.50
              s = s.replace(',', '.');
            } else if (lastDot !== -1 && lastComma === -1) {
              // Only dot: could be 1.000 or 1.5
              // If it's like "1.000" it's probably thousand. If "1.5" probably decimal.
              // Heuristic: if 3 digits after dot, it's thousand separator? risky.
              // Let's assume dot is thousand separator if used in context of "Harga" in ID app.
              // But if it's small value, it's tricky.
              // We'll keep the .replace(/\./g, '') for now if it's a large value.
              if (s.length - lastDot === 4) {
                s = s.replace(/\./g, '');
              }
            }

            return parseFloat(s) || 0;
          };

          const stockVal = cleanNum(row['Stock'] || row['Unit']);
          const hppVal = cleanNum(row['HPP']);
          const priceVal = cleanNum(row['Harga Jual'] || row['Hrg Jual']);
          
          const existingIdx = updatedList.findIndex(p => p.nama.toLowerCase() === nama.toLowerCase());
          
          if (existingIdx > -1) {
            const product = { ...updatedList[existingIdx] };
            product.hpp = hppVal || product.hpp;
            product.deskripsi = row['Deskripsi'] || product.deskripsi;
            
            // Deterministic Lot ID for imports to prevent duplication on re-import
            const importLotId = `${product.id}_lot_IMPORT`;
            const otherLots = (product.lots || []).filter(l => l.id !== importLotId);
            
            product.lots = [
              ...otherLots,
              {
                id: importLotId,
                lot: Date.now(),
                kode: `${product.kode}-IMPORT`,
                supplierId: defaultSupplier.id,
                stock: stockVal,
                hpp: hppVal || product.hpp || 0,
                hargaJual: priceVal || (product.lots.length > 0 ? product.lots[product.lots.length - 1].hargaJual : 0) || 0,
                tanggal: new Date().toISOString()
              }
            ];

            updatedList[existingIdx] = product;
            await syncToSupabase('products', product);
          } else {
            const kode = generateProductCode();
            const id = 'P' + Date.now().toString() + Math.random().toString(36).substr(2, 5);
            const newOne = {
              id,
              kode,
              nama,
              kategori: 'Lainnya',
              satuan: 'Pcs',
              hpp: hppVal,
              panjang: 0,
              lebar: 0,
              tinggi: 0,
              berat: 0,
              deskripsi: row['Deskripsi'] || '',
              lots: [{
                id: `${id}_lot_IMPORT`,
                lot: Date.now(),
                kode: `${kode}-IMPORT`,
                supplierId: defaultSupplier.id,
                stock: stockVal,
                hpp: hppVal,
                hargaJual: priceVal,
                tanggal: new Date().toISOString()
              }],
              companyId: activeCompanyId
            };
            updatedList.push(newOne);
            await syncToSupabase('products', newOne);
          }
          count++;
        }
        setProducts(updatedList);
      } else if (activeUploadType === 'Transaksi') {
        const updatedList = [...transactions];
        const updatedProducts = [...products];
        
        const cleanNum = (v: any) => {
          if (typeof v === 'number') return v;
          if (!v) return 0;
          let s = v.toString().replace(/Rp/gi, '').replace(/\s/g, '').trim();
          if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
          const lastComma = s.lastIndexOf(',');
          const lastDot = s.lastIndexOf('.');
          if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
          else if (lastDot > lastComma && lastComma !== -1) s = s.replace(/,/g, '');
          else if (lastDot === -1 && lastComma !== -1) s = s.replace(',', '.');
          else if (lastDot !== -1 && lastComma === -1 && s.length - lastDot === 4) s = s.replace(/\./g, '');
          return parseFloat(s) || 0;
        };

        for (const row of validRows) {
          // Robust key lookup for Customer
          const getVal = (r: any, keys: string[]) => {
              for (const k of keys) {
                  if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
                  // Case-insensitive fallback
                  const foundKey = Object.keys(r).find(rk => rk.toLowerCase() === k.toLowerCase());
                  if (foundKey && r[foundKey] !== undefined && r[foundKey] !== null && r[foundKey] !== '') return r[foundKey];
              }
              return '';
          };

          const customerName = getVal(row, ['Customer', 'Nama Customer', 'Nama', 'Name', 'Customer Name', 'Nama Cust']).toString().trim();
          if (!customerName) continue;
          
          const noTrxFromExcel = getVal(row, ['No Transaksi', 'No Trx', 'Invoice Number', 'No Invoice']).toString().trim();
          
          // Check if transaction already exists in local state to reuse ID
          const existingTrxIdx = noTrxFromExcel ? updatedList.findIndex(t => t.noTrx === noTrxFromExcel && t.companyId === activeCompanyId) : -1;
          const existingTrx = existingTrxIdx > -1 ? updatedList[existingTrxIdx] : null;

          // Find existing customer details in database to sync missing info
          const existingCust = customers.find((c: any) => c.nama.toLowerCase() === customerName.toLowerCase() && c.companyId === activeCompanyId);
          
          const prodStr = getVal(row, ['Produk', 'Product', 'Nama Produk', 'Item']).toString();
          const hargaStr = getVal(row, ['Harga', 'Price', 'Harga Satuan']).toString();
          const qtyStr = getVal(row, ['Kuantiti', 'Quantity', 'Qty', 'Jumlah']).toString();

          // Split by | allowing for more than 1 items
          const prods = prodStr.split('|').map(s => s.trim()).filter(s => s !== '');
          const hargas = hargaStr.split('|').map(s => s.trim());
          const qties = qtyStr.split('|').map(s => s.trim());

          const trxItems: TransactionItem[] = [];
          let calculatedTotal = 0;

          // Sequential loop for products to allow await if we create new ones
          for (let idx = 0; idx < prods.length; idx++) {
            const pName = prods[idx];
            let productMatch = updatedProducts.find(p => p.nama.toLowerCase() === pName.toLowerCase());
            
            if (!productMatch) {
              // Create new product on the fly if it doesn't exist to satisfy FK
              const newProd: Product = {
                id: 'P' + Date.now() + Math.random().toString(36).substr(2, 5),
                nama: pName,
                kode: 'AUTO-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
                lots: [],
                companyId: activeCompanyId,
                editHistory: [{
                  timestamp: new Date().toISOString(),
                  user: "System",
                  role: "admin",
                  changes: "Auto-created during Transaction Import",
                  type: 'Product',
                  id: 'H' + Date.now()
                }] as any
              };
              updatedProducts.push(newProd);
              await syncToSupabase('products', newProd);
              productMatch = newProd;
            }

            // If items count mismatch, use last available or first item
            const rawHarga = hargas[idx] !== undefined ? hargas[idx] : (hargas[hargas.length - 1] || '0');
            const rawQty = qties[idx] !== undefined ? qties[idx] : (qties[qties.length - 1] || '1');
            
            const harga = cleanNum(rawHarga);
            const qty = cleanNum(rawQty) || 1;

            trxItems.push({
              produkId: productMatch.id,
              nama: pName,
              kode: productMatch.kode || 'CODE_UNKNOWN',
              harga: harga,
              qty: qty,
              diskon: 0
            });
            calculatedTotal += (qty * harga);
          }

          // Use Excel's Total if provided, otherwise our calculated sum
          const excelTotal = cleanNum(getVal(row, ['Nilai Proyek', 'Total', 'Amount', 'Grant Total']));
          const finalTotal = excelTotal > 0 ? excelTotal : calculatedTotal;

          // Map status: Progress -> Penawaran
          const rawStatus = getVal(row, ['Status', 'State']).toString();
          let finalStatus: 'Penawaran' | 'Invoice' | 'Selesai' | 'Batal' = 'Invoice';
          if (rawStatus.toLowerCase().includes('progress')) {
            finalStatus = 'Penawaran';
          } else if (rawStatus.toLowerCase().includes('selesai')) {
            finalStatus = 'Selesai';
          } else if (rawStatus.toLowerCase().includes('batal')) {
            finalStatus = 'Batal';
          }

          const trxData: Transaction = {
            id: existingTrx ? existingTrx.id : 'TRX' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            noTrx: noTrxFromExcel || (existingTrx ? existingTrx.noTrx : generateInvoiceNumber()),
            tanggal: getVal(row, ['Tanggal', 'Date', 'Tgl']) || (existingTrx ? existingTrx.tanggal : new Date().toISOString().split('T')[0]),
            customerName: existingCust?.nama || customerName,
            status: finalStatus,
            items: trxItems,
            nilaiProyek: finalTotal,
            ppn: true,
            ongkir: false,
            biayaOngkir: 0,
            jasaKirim: '',
            statuses: existingTrx ? ((existingTrx.statuses || []).includes(finalStatus) ? (existingTrx.statuses || []) : [...(existingTrx.statuses || []), finalStatus]) : [finalStatus],
            sales: getVal(row, ['Sales', 'Marketing', 'Sales Rep']) || existingCust?.sales || existingTrx?.sales || salesMembers[0],
            keterangan: getVal(row, ['Keterangan', 'Remarks', 'Notes']) || existingTrx?.keterangan || '',
            paymentStatus: (finalStatus === 'Selesai' ? 'Lunas' : (existingTrx?.paymentStatus || 'Belum Lunas')) as any,
            pembayaranDiterima: existingTrx?.pembayaranDiterima || 0,
            sisaPembayaran: (finalStatus === 'Selesai' ? 0 : (excelTotal || calculatedTotal)),
            companyId: activeCompanyId,
            editHistory: [
              ...(existingTrx?.editHistory || []),
              {
                timestamp: new Date().toISOString(),
                user: "System",
                role: "admin",
                changes: existingTrx ? "Updated via Excel Import" : "Imported from Excel with Customer & Product Sync",
                type: 'Transaction',
                id: 'H' + Date.now()
              }
            ] as any
          };

          if (existingTrxIdx > -1) {
            updatedList[existingTrxIdx] = trxData;
          } else {
            updatedList.push(trxData);
          }
          
          await syncToSupabase('transactions', trxData);
          count++;
        }
        setProducts(updatedProducts);
        setTransactions(updatedList);
      }
      alert(`Berhasil memproses ${count} data.`);
      setUploadGridData(Array(10).fill({}));
    } catch (e: any) {
      alert("Terjadi kesalahan saat mengunggah: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CloudUpload size={24} className="text-violet-600" />
            Upload Data Batch
          </h2>
          <p className="text-sm text-slate-500">Gunakan tabel di bawah seperti Excel. Paste data langsung dari Excel/Spreadsheet.</p>
        </div>
        <div className="flex items-center gap-3">
           <select 
             value={activeUploadType} 
             onChange={(e) => {
               setActiveUploadType(e.target.value as any);
               setUploadGridData(Array(10).fill({}));
             }}
             className="px-4 py-2 bg-slate-100 border-none rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-violet-500"
           >
             <option value="Contact">Data Contact (Customer)</option>
             <option value="Produk">Data Produk</option>
             <option value="Transaksi">Data Transaksi (Header)</option>
           </select>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
              title="Upload file Excel atau CSV"
            >
              <Download size={16} />
              Upload Excel/CSV
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileImport} 
              accept=".xlsx,.xls,.csv" 
              className="hidden" 
            />
            <button 
              onClick={handleSave}
             disabled={isUploading}
             className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-violet-200 transition-all flex items-center gap-2 disabled:opacity-50"
           >
             {isUploading ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
             Simpan Data
           </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left border-collapse min-w-[2200px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 border-r border-slate-200 w-10 text-center sticky left-0 bg-slate-50">#</th>
              {headers.map(h => (
                <th key={h} className="px-3 py-3 text-[10px] font-black uppercase text-slate-600 border-r border-slate-200 min-w-[150px] max-w-[300px] truncate">
                  {h}
                </th>
              ))}
              <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 border-r border-slate-200 w-10 text-center">Hapus</th>
            </tr>
          </thead>
          <tbody>
            {uploadGridData.map((row, rIdx) => (
              <tr key={rIdx} className="border-b border-slate-100 last:border-none group">
                <td className="px-3 py-2 text-xs font-mono text-slate-400 bg-slate-50/50 border-r border-slate-200 text-center sticky left-0">{rIdx + 1}</td>
                {headers.map((h, cIdx) => (
                  <td key={h + cIdx} className="p-0 border-r border-slate-200 focus-within:ring-2 focus-within:ring-violet-400 transition-all max-w-[300px] whitespace-nowrap overflow-hidden">
                    <input 
                      type="text"
                      className="w-full px-3 py-2 text-xs outline-none bg-transparent truncate"
                      value={row[h] || ''}
                      onChange={(e) => handleValueChange(rIdx, h, e.target.value)}
                      onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                      placeholder="..."
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-center border-r border-slate-200">
                  <button 
                    onClick={() => handleRemoveRow(rIdx)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-center">
        <button 
          onClick={() => setUploadGridData(prev => [...prev, ...Array(10).fill({})])}
          className="text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1"
        >
          <Plus size={14} /> Tambah 10 Baris
        </button>
      </div>
    </div>
  );
};


const ImportProductModal = ({ products, setProducts, activeCompanyId, setShowModal, syncToSupabase, logUserAction, companies }: any) => {
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
    const [searchTerm, setSearchTerm] = React.useState('');
    
    // Get unique products from other companies
    const activeCompProdNames = products.filter((p: any) => (p.companyId || p.company_id) === activeCompanyId).map((p: any) => (p.nama || '').trim().toLowerCase());
    const otherProducts = products.filter((p: any) => (p.companyId || p.company_id) !== activeCompanyId);
    
    // Group them or just show list, unique by name so we don't show duplicates among the 'other' companies either
    const uniqueOtherProducts = [];
    const seenNames = new Set();
    
    otherProducts.forEach((p: any) => {
        const nm = (p.nama || '').trim().toLowerCase();
        if (!activeCompProdNames.includes(nm) && !seenNames.has(nm)) {
            uniqueOtherProducts.push(p);
            seenNames.add(nm);
        }
    });

    const filtered = uniqueOtherProducts.filter(p => (p.nama||'').toLowerCase().includes(searchTerm.toLowerCase()));

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
    
    const toggleAll = () => {
        if (selectedIds.length === filtered.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filtered.map(p => p.id));
        }
    };

    const handleImport = () => {
        const toImport = uniqueOtherProducts.filter(p => selectedIds.includes(p.id));
        if (toImport.length === 0) return alert('Pilih minimal 1 produk l!');
        
        if (confirm(`Yakin copy ${toImport.length} produk dari perusahaan lain?`)) {
            const newAdded: any[] = [];
            toImport.forEach((oldP: any) => {
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
            });
            
            if (newAdded.length > 0) {
                setProducts((prev: any) => [...prev, ...newAdded]);
                logUserAction('IMPORT_PRODUCTS', `Superadmin mengimport ${newAdded.length} produk pilihan dari perusahaan lain`, 'System');
                alert(`Sukses mengcopy ${newAdded.length} produk ke perusahaan ini.`);
                setShowModal(null);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-sky-50 text-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                    <Copy className="text-sky-600 animate-pulse" size={20} />
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">
                        Import / Copy Produk
                    </h3>
                </div>
                <button onClick={() => setShowModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-sky-50 rounded-xl border border-sky-100 text-slate-700">
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm">Pilih Produk yang Ingin disalin</h4>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1">
                            (${uniqueOtherProducts.length} produk tersedia dari perusahaan lain)
                        </p>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Cari produk..." 
                        className="w-full text-sm border-slate-200 rounded-lg p-2 focus:ring-sky-500 focus:border-sky-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="p-3 w-10 text-center">
                                    <input 
                                        type="checkbox" 
                                        checked={filtered.length > 0 && selectedIds.length === filtered.length}
                                        onChange={toggleAll}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                    />
                                </th>
                                <th className="p-3">Nama Produk</th>
                                <th className="p-3">Kode</th>
                                <th className="p-3">Satuan</th>
                                <th className="p-3">Perusahaan Asal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-6 text-center text-slate-500">Tidak ada produk yang bisa diimport.</td>
                                </tr>
                            ) : filtered.map((p: any, i: number) => {
                                const originComp = companies.find((c: any) => c.id === (p.companyId || p.company_id))?.nama || 'Unknown';
                                return (
                                    <tr key={p.id + '-' + i} className="hover:bg-slate-50 cursor-pointer" onClick={() => toggleSelect(p.id)}>
                                        <td className="p-3 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.includes(p.id)}
                                                onChange={() => {}} 
                                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer pointer-events-none"
                                            />
                                        </td>
                                        <td className="p-3 font-semibold text-slate-700">{p.nama}</td>
                                        <td className="p-3 text-xs text-slate-500">{p.kode}</td>
                                        <td className="p-3 text-xs text-slate-500">{p.satuan}</td>
                                        <td className="p-3 text-xs text-slate-500">{originComp}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
                <button onClick={() => setShowModal(null)} className="px-5 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Batal</button>
                <button 
                    onClick={handleImport}
                    disabled={selectedIds.length === 0}
                    className="px-5 py-2 bg-sky-600 text-white font-bold rounded-xl text-xs hover:bg-sky-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    <Copy size={14} />
                    Import Terpilih ({selectedIds.length})
                </button>
            </div>
          </div>
        </div>
    );
};


const App: React.FC = () => {
  // Navigation State
  const [activeModule, setActiveModule] = useState('BRM');
  const [activeView, setActiveView] = useState('Dashboard'); 
  const [recycleBinCategory, setRecycleBinCategory] = useState<'All' | RecycledItem['type']>('All');
  const [activeTab, setActiveTab] = useState('#Dashboard');
  const [tabs, setTabs] = useState(['#Dashboard']);
  const topTabsRef = useRef<HTMLDivElement>(null);
  const mainTableRef = useRef<HTMLDivElement>(null);

  const activateTab = (tabLabel: string) => {
      setTabs(prev => [tabLabel, ...prev.filter(t => t !== tabLabel)]);
      setActiveTab(tabLabel);
      setTimeout(() => {
          if (topTabsRef.current) {
              topTabsRef.current.scrollTo({ left: 0, behavior: 'smooth' });
          }
      }, 50);
  };
  const [openCategory, setOpenCategory] = useState<string>('BRM'); 
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCardView, setIsCardView] = useState(false); // Toggle for mobile card view
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('mypanca_theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('mypanca_theme', theme);
  }, [theme]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [invoiceNote, setInvoiceNote] = useState<string>('');
  const [printDocType, setPrintDocType] = useState<'Invoice'|'Nota'|'PI'>('Invoice');
  const [invoiceRefPrefix, setInvoiceRefPrefix] = useState<string>('');
  const [invoiceNoPo, setInvoiceNoPo] = useState<string>('');
  const [invoiceTglPo, setInvoiceTglPo] = useState<string>('');
  
  // Proforma Invoice (PI) states
  const [piInvoiceNo, setPiInvoiceNo] = useState('');
  const [piDate, setPiDate] = useState('');
  const [piBillTo, setPiBillTo] = useState('');
  const [piShipTo, setPiShipTo] = useState('');
  const [piNotes, setPiNotes] = useState('- This is a sample order.\n- Goods are shipped to buyer\'s agent in China.\n- Final destination: Allee du Centenaire, Rue 35, Angle 30 Medina, Dakar, Senegal\n- Cargo is shipped free of charge.\n- Prices listed are for customs purposes only.\n- Samples have no commercial value.\n- Incoterms: CPT');
  const [piFooter, setPiFooter] = useState('This Proforma Invoice is issued for sample purposes only and is not a commercial invoice.');
  const [piItems, setPiItems] = useState([{ desc: 'Sample Japanese Lawn Grass Seeds', hsCode: '1209.29', qty: '100', unitPrice: '-', total: '-' }]);
  const [piShippingDesc, setPiShippingDesc] = useState('Shipping Cost (EMS Pos Indonesia)');
  const [piShippingCost, setPiShippingCost] = useState('20,33');
  const [piTotal, setPiTotal] = useState('20,33');

  
  // Penawaran states
  const [penawaranNomor, setPenawaranNomor] = useState('');
  const [penawaranPerihal, setPenawaranPerihal] = useState('');
  const [penawaranPembuka, setPenawaranPembuka] = useState('Sehubungan dengan permintaan Bapak untuk kegiatan fumigasi dan sanitasi, dengan ini kami ajukan penawaran sebagai berikut :');
  const [penawaranNama, setPenawaranNama] = useState('');
  const [penawaranBahanAktif, setPenawaranBahanAktif] = useState('');
  const [penawaranHargaStr, setPenawaranHargaStr] = useState('');
  const [penawaranKeteranganHarga, setPenawaranKeteranganHarga] = useState('Harga belum termasuk PPn 11% dan harga belum termasuk ongkos kirim.');
  const [penawaranFungsi, setPenawaranFungsi] = useState('Obat fumigasi pre-shipment untuk non komoditi pangan.');
  const [penawaranWaktuKirim, setPenawaranWaktuKirim] = useState('1 hari setelah terima full payment.');
  const [penawaranPembayaran, setPenawaranPembayaran] = useState('Pembayaran ke BNI nomor rekening 8182215056 atas nama PT. Panca Prima Wijaya');

  const [filterSales, setFilterSales] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLeadType, setFilterLeadType] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [salesPeriod, setSalesPeriod] = useState('1month');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([
    { id: '1', nama: 'PT. PANCA PRIMA WIJAYA', email: 'info@pancaprimawijaya.com', telepon: '+62 (21) 5566-7788', alamat: 'Jl. Industri Raya No. 45, Bekasi', npwp: '01.234.567.8-901.000' }
  ]);
  const [activeCompanyId, setActiveCompanyId] = useState<string>('1');
  const activeCompany = useMemo(() => companies.find(c => c.id === activeCompanyId) || companies[0], [companies, activeCompanyId]);
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);
  const [showTaskApp, setShowTaskApp] = useState(false);
  const [currentCompanyEdit, setCurrentCompanyEdit] = useState<Partial<Company>>({});
  const companySwitcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (companySwitcherRef.current && !companySwitcherRef.current.contains(event.target as Node)) {
            setShowCompanySwitcher(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  useEffect(() => {
    setFilterStatus('');
    setFilterSales('');
    setFilterDate('');
    setFilterSupplier('');
    const now = new Date();
    if (activeView === 'Dashboard' || activeView === 'Dashboard Produk') {
      setFilterMonth((now.getMonth() + 1).toString().padStart(2, '0'));
      setFilterYear(now.getFullYear().toString());
    } else {
      setFilterMonth('');
      setFilterYear('');
    }
  }, [activeView]);
  
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  // App Logic State
  const [newFollowUp, setNewFollowUp] = useState<FollowUp>({tanggal: new Date().toISOString().split('T')[0], keterangan: '', method: 'WhatsApp'});
  const [editingFollowUpIdx, setEditingFollowUpIdx] = useState<number | null>(null);
  const [showDrawer, setShowDrawer] = useState<string | null>(null);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showPOHistory, setShowPOHistory] = useState(false);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [showTrxPreview, setShowTrxPreview] = useState<boolean>(false);
  const [trxPreviewData, setTrxPreviewData] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [showFloatingAiMenu, setShowFloatingAiMenu] = useState(false);
  const floatingAiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (floatingAiRef.current && !floatingAiRef.current.contains(event.target as Node)) {
        setShowFloatingAiMenu(false);
      }
    };
    if (showFloatingAiMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFloatingAiMenu]);
  
  // Data States
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [qaQuestions, setQaQuestions] = useState<any[]>([]);

  const fetchQaQuestions = async () => {
    try {
      const data = await taskSupabaseService.getQAQuestions();
      setQaQuestions(data);
    } catch (e) {
      console.error('Failed to fetch QA questions for AI context:', e);
    }
  };

  useEffect(() => {
    fetchQaQuestions();
  }, []);
  const [appUsers, setAppUsers] = useState<UserAccount[]>([
    { id: 'U1', nama: 'Superadmin', username: 'superadmin', password: 'suksesbersamaa', whatsapp: '628000000001', role: 'superadmin', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U2', nama: 'Angel', username: 'angel1', password: 'tanogaidomaju', whatsapp: '628000000002', role: 'admin', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U3', nama: 'Maria', username: 'maria1', password: 'tanogaidosukses', whatsapp: '628000000003', role: 'admin', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U4', nama: 'Dwi', username: 'dwi1', password: 'tanogaidojaya', whatsapp: '628000000004', role: 'sales', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U5', nama: 'Yuyu', username: 'yuyu1', password: 'tanogaidosuper', whatsapp: '628000000005', role: 'admin', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U6', nama: 'Indra', username: 'indra', password: 'tanogaidobisa', whatsapp: '628000000006', role: 'admin', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U7', nama: 'Mustaqim', username: 'mustaqim', password: 'pancasukses', whatsapp: '628000000007', role: 'stocklist', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U8', nama: 'Rizqi', username: 'rizqi', password: 'pancaprimamaju', whatsapp: '628000000008', role: 'stocklist', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U9', nama: 'Rodliyah', username: 'rodliyah', password: 'semangatbekerja', whatsapp: '628000000009', role: 'sales', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U10', nama: 'Evan', username: 'evan', password: 'pancaprimawijayasukses', whatsapp: '628000000010', role: 'engineer', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U11', nama: 'Yadi', username: 'yadi', password: 'pancaprima123wijaya', whatsapp: '628000000011', role: 'sales', createdAt: new Date().toISOString(), companyId: '1' },
    { id: 'U12', nama: 'Arie', username: 'arie', password: 'sensorgempa', whatsapp: '628000000012', role: 'engineer', createdAt: new Date().toISOString(), companyId: '1' }
  ]);
  const [importUserSearch, setImportUserSearch] = useState('');
  const [importContactSearch, setImportContactSearch] = useState('');
  const [tutorials, setTutorials] = useState<TutorialSection[]>(DEFAULT_TUTORIALS);
  const [expandedTutorials, setExpandedTutorials] = useState<string[]>([]);
  const [editingTutorialId, setEditingTutorialId] = useState<string | null>(null);
  const [tutorialEditContent, setTutorialEditContent] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Dedicated /app route for Panca AI Mobile PWA
  const [isAppRoute, setIsAppRoute] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.location.pathname.startsWith('/app');
  });

  useEffect(() => {
    const handlePopState = () => {
      setIsAppRoute(window.location.pathname.startsWith('/app'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenPancaApp = () => {
    window.history.pushState({}, '', '/app');
    setIsAppRoute(true);
  };

  const handleClosePancaApp = () => {
    window.history.pushState({}, '', '/');
    setIsAppRoute(false);
  };

  // Synchronize employees with appUsers automatically
  useEffect(() => {
    let changed = false;
    const updatedEmployees = [...employees];

    appUsers.forEach(user => {
      const existingIdx = updatedEmployees.findIndex(e => e.username === user.username || e.id === user.id);
      if (existingIdx === -1) {
        // Map user to standard roles in KPI.xlsx to find their default base salary
        const defaultSalary = 
          user.nama === 'Superadmin' ? 20000000 : // Rudi in Excel has 20M Gaji Pokok
          user.nama === 'Yadi' ? 6000000 :        // Yadi has 6M Gaji Pokok
          user.nama === 'Arie' ? 6000000 :        // Arie has 6M Gaji Pokok
          user.nama === 'Evan' ? 3000000 :        // Evan has 3M Gaji Pokok
          user.nama === 'Angel' ? 3000000 :       // Angel
          user.nama === 'Maria' ? 3000000 :       // Maria
          user.nama === 'Dwi' ? 3000000 :         // Dwi
          user.nama === 'Yuyu' ? 3000000 :        // Yuyu
          user.nama === 'Indra' ? 3000000 :       // Indra
          user.nama === 'Mustaqim' ? 3000000 :    // Mustaqim
          user.nama === 'Rizqi' ? 3000000 :       // Rizqi
          user.nama === 'Rodliyah' ? 3000000 :    // Rodliyah
          user.nama === 'Yadi' ? 6000000 : 3000000; // standard default

        updatedEmployees.push({
          id: user.id || Date.now().toString() + Math.random().toString(36).substr(2, 5),
          nama: user.nama,
          nik: '',
          username: user.username,
          role: user.role,
          biodata: '',
          pendidikan: '',
          alamat: '',
          kontakDarurat: '',
          whatsapp: user.whatsapp || '',
          email: '',
          kontrakAwal: '',
          gaji: defaultSalary,
          payroll: 'Transfer',
          pph: 0,
          companyId: user.companyId || activeCompanyId
        });
        changed = true;
      } else {
        const emp = updatedEmployees[existingIdx];
        if (emp.role !== user.role || emp.nama !== user.nama || emp.whatsapp !== user.whatsapp || emp.companyId !== user.companyId) {
          updatedEmployees[existingIdx] = {
            ...emp,
            role: user.role,
            nama: user.nama,
            whatsapp: user.whatsapp || emp.whatsapp,
            companyId: user.companyId || emp.companyId
          };
          changed = true;
        }
      }
    });

    if (appUsers.length > 0) {
      const userUsernames = new Set(appUsers.map(u => u.username));
      const userIds = new Set(appUsers.map(u => u.id));
      const finalEmployees = updatedEmployees.filter(e => {
        const keep = userUsernames.has(e.username) || userIds.has(e.id);
        if (!keep) changed = true;
        return keep;
      });
      if (changed) {
        setEmployees(finalEmployees);
      }
    } else if (changed) {
      setEmployees(updatedEmployees);
    }
  }, [appUsers, activeCompanyId]);

  const getAccessibleCompanies = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'superadmin') return companies;
    const allowedIds = appUsers
      .filter(u => u.username === currentUser.username)
      .map(u => u.companyId || u.company_id);
    if (currentUser.companyId && !allowedIds.includes(currentUser.companyId)) {
      allowedIds.push(currentUser.companyId);
    }
    if (currentUser.company_id && !allowedIds.includes(currentUser.company_id)) {
      allowedIds.push(currentUser.company_id);
    }
    return companies.filter(c => allowedIds.includes(c.id));
  }, [companies, appUsers, currentUser]);

  useEffect(() => {
    if (isLoggedIn && currentUser && getAccessibleCompanies.length > 0) {
      const hasAccess = getAccessibleCompanies.some(c => c.id === activeCompanyId);
      if (!hasAccess) {
        setActiveCompanyId(getAccessibleCompanies[0].id);
      }
    }
  }, [isLoggedIn, currentUser, getAccessibleCompanies, activeCompanyId]);

  const handleLogin = (user: UserAccount) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    localStorage.setItem('mypanca_is_logged_in', 'true');
    localStorage.setItem('mypanca_current_user', JSON.stringify(user));
    logUserAction('LOGIN', 'Melakukan login ke sistem', 'System', user);
    if (user.role === 'engineer') {
      setShowTaskApp(true);
    }
    const defaultView = getDefaultViewForUser(user, roleTemplates);
    if (defaultView) {
      setActiveModule(defaultView.module);
      setActiveView(defaultView.view);
      setActiveTab(`#${defaultView.view}`);
      setTabs([`#${defaultView.view}`]);
      setOpenCategory(defaultView.module);
    }
  };

  const handleLogout = async () => {
    if (currentUser) {
       const newLog: UserLog = {
          id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
          userId: currentUser.id,
          userName: currentUser.nama,
          action: 'LOGOUT',
          details: 'Melakukan logout dari sistem',
          entity: 'System',
          createdAt: new Date().toISOString()
        };
        const savedLogs = localStorage.getItem('mypanca_db_user_logs');
        const logs = savedLogs ? JSON.parse(savedLogs) : [];
        logs.unshift(newLog);
        localStorage.setItem('mypanca_db_user_logs', JSON.stringify(logs));
        if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
            try { await saveUserLogToSupabase(newLog); } catch (e) {}
        }
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    localStorage.removeItem('mypanca_is_logged_in');
    localStorage.removeItem('mypanca_current_user');
    window.location.reload();
  };
  const [roleTemplates, setRoleTemplates] = useState<Record<string, { id: string; canView: boolean; canEdit: boolean }[]>>(ROLE_TEMPLATES);
  const [isMounted, setIsMounted] = useState(false);
  
  const salesMembers = useMemo(() => {
    const list = appUsers.filter(e => e.role === 'sales').map(e => e.nama);
    const uniqueList = Array.from(new Set(list));
    return uniqueList.length > 0 ? uniqueList : ['Angel', 'Budi', 'Chandra', 'Dewi', 'Eko']; 
  }, [appUsers]);

  const allSalesMembers = useMemo(() => {
    const set = new Set<string>();
    salesMembers.forEach(s => { if (s && s.trim()) set.add(s.trim()); });
    appUsers.forEach(u => {
      if (u.role === 'sales' && u.nama?.trim()) set.add(u.nama.trim());
    });
    employees.forEach(e => {
      if ((e.role?.toLowerCase() === 'sales' || e.role?.toLowerCase() === 'marketing') && e.nama?.trim()) {
        set.add(e.nama.trim());
      }
    });
    transactions.forEach(t => {
      if (t.sales && t.sales.trim()) set.add(t.sales.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [salesMembers, appUsers, employees, transactions]);

  const stocklistMembers = useMemo(() => {
    const list = appUsers.filter(e => e.role === 'stocklist').map(e => e.nama);
    return Array.from(new Set(list));
  }, [appUsers]);

  const canEditCurrentView = useMemo(() => {
    if (!currentUser || currentUser.role === 'superadmin') return true;
    
    let effectivePermId = activeView;
    const currentCategory = MENU_STRUCTURE.find(c => c.category === activeModule);
    if (currentCategory) {
        const currentItem = currentCategory.items.find(i => i.id === activeView);
        if (currentItem && (currentItem as any).permId) {
            effectivePermId = (currentItem as any).permId;
        }
    }

    const legacyPerm = currentUser.permissions?.find(p => p.id === activeView);
    const perm = currentUser.permissions?.find(p => p.id === effectivePermId) || legacyPerm;
    if (perm) return perm.canEdit;
    
    // Check fallback to roleTemplates
    const roleTpl = roleTemplates[currentUser.role];
    const rolePerm = roleTpl?.find(p => p.id === effectivePermId) || roleTpl?.find(p => p.id === activeView);
    if (rolePerm) return rolePerm.canEdit;

    const knownView = MENU_STRUCTURE.some(cat => cat.items.some(it => it.id === activeView));
    return !knownView; 
  }, [currentUser, activeView, activeModule, roleTemplates]);

  const getDefaultViewForUser = useCallback((user: UserAccount, templates: Record<string, any>) => {
      for (const menu of MENU_STRUCTURE) {
          const isAdminCategory = ['Admin', 'Control Panel'].includes(menu.category);
          if (isAdminCategory && user.role !== 'superadmin') continue;

          const isHRCategory = menu.category === 'HR';
          if (isHRCategory && user.role !== 'superadmin' && user.role !== 'hr') continue;
          
          for (const item of menu.items) {
             const effectiveId = (item as any).permId || item.id;
             const legacyPerm = user.permissions?.find(p => p.id === item.id);
             const perm = user.permissions?.find(p => p.id === effectiveId) || legacyPerm;
             
             let canView = false;
             if (perm) {
                 canView = perm.canView;
             } else if (user.role === 'superadmin') {
                 canView = true;
             } else if (user.role === 'hr' && isHRCategory) {
                 canView = true;
             } else {
                 const roleTpl = templates[user.role];
                 if (roleTpl) {
                     const rolePerm = roleTpl.find((p: any) => p.id === effectiveId) || roleTpl.find((p: any) => p.id === item.id);
                     if (rolePerm) canView = rolePerm.canView;
                 }
             }
             
             if (canView) {
                 return { module: menu.category, view: item.id };
             }
          }
      }
      return null;
  }, []);

  // Security guard for HR & Admin modules
  useEffect(() => {
    if (isLoggedIn && currentUser) {
      if (activeModule === 'HR' && currentUser.role !== 'superadmin' && currentUser.role !== 'hr') {
        const defaultView = getDefaultViewForUser(currentUser, roleTemplates);
        if (defaultView) {
          setActiveModule(defaultView.module);
          setActiveView(defaultView.view);
          setActiveTab(`#${defaultView.view}`);
        }
      }
    }
  }, [isLoggedIn, currentUser, activeModule, roleTemplates, getDefaultViewForUser]);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [dbStatus, setDbStatus] = useState<'connected'|'error'|'checking'>('checking');
  const [dbError, setDbError] = useState<string | null>(null);

  // Form States
  const [currentTrx, setCurrentTrx] = useState<Partial<Transaction>>({ 
    items: [], status: 'Invoice', statuses: ['Invoice'], tanggal: new Date().toISOString().split('T')[0], ppn: true, ongkir: false, biayaOngkir: 0 
  });
  const [currentCust, setCurrentCust] = useState<Partial<Customer>>({
    jenis: 'Perusahaan', leadType: 'Belum Transaksi', source: 'Organic', sales: 'Angel', negara: 'Indonesia', phone: '', phoneCode: '+62'
  });
  const [currentEmp, setCurrentEmp] = useState<Partial<Employee>>({});
  const [currentAppUser, setCurrentAppUser] = useState<Partial<UserAccount>>({});
  const [setupRoleTarget, setSetupRoleTarget] = useState<string>('admin');
  const [currentProd, setCurrentProd] = useState<Partial<Product>>({ satuan: 'Pcs' });
  const [currentSupp, setCurrentSupp] = useState<Partial<Supplier>>({});
  const [currentPO, setCurrentPO] = useState<Partial<PurchaseOrder>>({});
  const [tempStock, setTempStock] = useState<{stock: number, hpp: number, hargaJual: number, supplierId: string}>({stock: 0, hpp: 0, hargaJual: 0, supplierId: ''});
  const [deletedItems, setDeletedItems] = useState<RecycledItem[]>([]);
  const [userLogs, setUserLogs] = useState<UserLog[]>([]);
  
  const logUserAction = useCallback((action: string, details: string, entity?: string, specificUser?: any) => {
    const userToLog = specificUser || currentUser;
    if (!userToLog) return;
    const newLog: UserLog = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      userId: userToLog.id,
      userName: userToLog.nama,
      action,
      details,
      entity,
      createdAt: new Date().toISOString()
    };
    setUserLogs(prev => [newLog, ...prev]);
    if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
        saveUserLogToSupabase(newLog).catch(e => console.warn('Failed to save log to Supabase:', e));
    }
  }, [currentUser]);
  const [recycleDetailItem, setRecycleDetailItem] = useState<RecycledItem | null>(null);
  const [additionalPayment, setAdditionalPayment] = useState<number>(0);
  const [autoNotifyEnabled, setAutoNotifyEnabled] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<{images: string[], index: number} | null>(null);

  
  // Upload Data States
  const [activeUploadType, setActiveUploadType] = useState<'Contact' | 'Transaksi' | 'Produk'>('Contact');
  const [uploadGridData, setUploadGridData] = useState<any[]>(Array(10).fill({}));
  const [isUploading, setIsUploading] = useState(false);
  const [autoNotifyDays, setAutoNotifyDays] = useState<number>(7);
  const [autoNotifySuperadmin, setAutoNotifySuperadmin] = useState<boolean>(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const longPressTimerRef = useRef<any>(null);
  const longPressTriggered = useRef(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning' | 'info';
    confirmText?: string;
  } | null>(null);

  // Persistence & Dummy Data Injection
  useEffect(() => {
    const savedTrx = localStorage.getItem('mypanca_db_trx');
    const savedCust = localStorage.getItem('mypanca_db_cust');
    const savedProd = localStorage.getItem('mypanca_db_prod');
    const savedSupp = localStorage.getItem('mypanca_db_supp');
    const savedPO = localStorage.getItem('mypanca_db_po');
    const savedDeleted = localStorage.getItem('mypanca_db_deleted');
    const savedAppUsers = localStorage.getItem('mypanca_db_app_users');
    const savedEmployees = localStorage.getItem('mypanca_db_employees');
    const savedCompanies = localStorage.getItem('mypanca_db_companies');
    const savedTutorials = localStorage.getItem('mypanca_db_tutorials');
    const savedUserLogs = localStorage.getItem('mypanca_db_user_logs');
    const savedAutoNotify = localStorage.getItem('mypanca_db_auto_notify');
    const savedAutoNotifyDays = localStorage.getItem('mypanca_db_auto_notify_days');
    const savedAutoNotifySuperadmin = localStorage.getItem('mypanca_db_auto_notify_superadmin');

    const parsedTrx = savedTrx ? JSON.parse(savedTrx).map((t: any) => ({
        ...t,
        statuses: t.statuses || (t.status ? [t.status] : ['Progress'])
    })) : [];
    const parsedCust = savedCust ? JSON.parse(savedCust) : [];
    const parsedProd = savedProd ? JSON.parse(savedProd) : [];
    const parsedSupp = savedSupp ? JSON.parse(savedSupp) : [];
    const parsedPO = savedPO ? JSON.parse(savedPO) : [];
    const parsedDeleted = savedDeleted ? JSON.parse(savedDeleted) : [];
    const parsedUserLogs = savedUserLogs ? JSON.parse(savedUserLogs) : [];
    const parsedAppUsers = savedAppUsers ? JSON.parse(savedAppUsers) : [];
    const parsedEmployees = savedEmployees ? JSON.parse(savedEmployees) : [];
    const parsedCompanies = savedCompanies ? JSON.parse(savedCompanies) : [];

const DUMMY_PURCHASE_ORDERS: PurchaseOrder[] = [];

    // Load data or inject dummy if empty
    if (parsedTrx.length > 0) setTransactions(parsedTrx);
    if (parsedCust.length > 0) setCustomers(parsedCust);
    if (parsedProd.length > 0) setProducts(parsedProd);
    if (parsedSupp.length > 0) setSuppliers(parsedSupp);
    if (parsedPO.length > 0) setPurchaseOrders(parsedPO);
    if (parsedUserLogs.length > 0) setUserLogs(parsedUserLogs);
    if (parsedAppUsers.length > 0) setAppUsers(parsedAppUsers);
    if (parsedEmployees.length > 0) setEmployees(parsedEmployees);
    if (parsedCompanies.length > 0) setCompanies(parsedCompanies);
    
    const savedCurrentUser = localStorage.getItem('mypanca_current_user');
    const savedIsLoggedIn = localStorage.getItem('mypanca_is_logged_in');

    if (savedIsLoggedIn === 'true' && savedCurrentUser) {
        const parsedUser = JSON.parse(savedCurrentUser);
        setCurrentUser(parsedUser);
        setIsLoggedIn(true);
        if (parsedUser.role === 'engineer') {
            setShowTaskApp(true);
        }
        
        // Find default view based on permissions
        const defaultView = getDefaultViewForUser(parsedUser, ROLE_TEMPLATES);
        if (defaultView) {
            setActiveModule(defaultView.module);
            setActiveView(defaultView.view);
            setActiveTab(`#${defaultView.view}`);
            setTabs([`#${defaultView.view}`]);
            setOpenCategory(defaultView.module);
        }
    } else if (parsedAppUsers.length > 0) {
        // Fallback for first time or if something is missing
        // Removed auto-login
    }

    setDeletedItems(parsedDeleted);
    if (savedTutorials) setTutorials(JSON.parse(savedTutorials));
    if (savedAutoNotify !== null) setAutoNotifyEnabled(savedAutoNotify === 'true');
    if (savedAutoNotifyDays !== null) setAutoNotifyDays(parseInt(savedAutoNotifyDays));
    if (savedAutoNotifySuperadmin !== null) setAutoNotifySuperadmin(savedAutoNotifySuperadmin === 'true');
    
    // Auto detect mobile to switch to card view initially
    if (window.innerWidth < 768) setIsCardView(true);

    // --- NEW: Automatic Supabase Load ---
    const autoLoadFromSupabase = async () => {
        console.log('--- AUTO LOAD SUPABASE START ---');
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const isEnvValid = (val: any) => val && val !== 'undefined' && val !== 'null' && val !== '';

        if (isEnvValid(url) && isEnvValid(key)) {
            console.log('Supabase Credentials Found, testing connection...');
            setDbStatus('checking');
            try {
                const test = await testSupabaseConnection();
                console.log('Connection Test Result:', test);
                if (!test.success) {
                    setDbStatus('error');
                    setDbError(test.error || 'Unknown error');
                    return;
                }
                setDbStatus('connected');
                console.log('Fetching data from Supabase...');
                const cloudData = await loadDataFromSupabase();
                console.log('Cloud Data Fetched:', cloudData ? 'Successfully' : 'Failed');
                // Auto-sync Gemini API Keys & Settings from Cloud Database to ensure cross-device availability
                loadGeminiSettingsFromDatabase().catch((e) => console.warn('Gemini cloud settings load notice:', e));
                if (cloudData) {
                    if (cloudData.transactions.length > 0) setTransactions(cloudData.transactions);
                    if (cloudData.customers.length > 0) setCustomers(cloudData.customers);
                    if (cloudData.products.length > 0) setProducts(cloudData.products);
                    if (cloudData.suppliers.length > 0) setSuppliers(cloudData.suppliers);
                    if (cloudData.companies.length > 0) setCompanies(cloudData.companies);
                    if (cloudData.appUsers && cloudData.appUsers.length > 0) setAppUsers(cloudData.appUsers);
                    if (cloudData.purchaseOrders && cloudData.purchaseOrders.length > 0) setPurchaseOrders(cloudData.purchaseOrders);
                    if (cloudData.userLogs && cloudData.userLogs.length > 0) setUserLogs(cloudData.userLogs);
                    if (cloudData.tutorials && cloudData.tutorials.length > 0) setTutorials(cloudData.tutorials);
                    
                    if (cloudData.deletedItems && cloudData.deletedItems.length > 0) {
                        const now = new Date();
                        const validItems: any[] = [];
                        const expiredItems: any[] = [];
                        
                        cloudData.deletedItems.forEach(item => {
                            const deletedAt = new Date(item.deletedAt);
                            const ageInDays = (now.getTime() - deletedAt.getTime()) / (1000 * 3600 * 24);
                            if (ageInDays > 30) {
                                expiredItems.push(item);
                            } else {
                                validItems.push(item);
                            }
                        });
                        
                        setDeletedItems(validItems);
                        
                        // Background cleanup worker
                        if (expiredItems.length > 0) {
                            setTimeout(async () => {
                                console.log(`Auto-cleaning ${expiredItems.length} recycled items older than 30 days...`);
                                for (const item of expiredItems) {
                                  try {
                                      let table = '';
                                      let dependentTables: string[] = [];
                                      let dependentColumn = '';
                                      
                                      if (item.type === 'Transaction') {
                                          table = 'transactions';
                                          if ((item.data as any).tanggalPembelian) {
                                              table = 'purchase_orders';
                                              dependentTables = ['purchase_order_items'];
                                              dependentColumn = 'purchase_order_id';
                                          } else {
                                              table = 'transactions';
                                              dependentTables = ['transaction_items'];
                                              dependentColumn = 'transaction_id';
                                          }
                                      } else if (item.type === 'Product') {
                                          table = 'products';
                                          dependentTables = ['product_lots', 'transaction_items', 'purchase_order_items'];
                                          dependentColumn = 'product_id';
                                      } else if (item.type === 'Supplier') {
                                          table = 'suppliers';
                                          dependentTables = ['purchase_orders'];
                                          dependentColumn = 'supplier_id';
                                      } else if (item.type === 'Customer') { table = 'customers'; }
                                      else if (item.type === 'Employee') { table = 'employees'; }
                                      else if (item.type === 'UserAccount') { table = 'user_accounts'; }
                                      
                                      if (table && dependentTables.length > 0 && dependentColumn) {
                                          for (const depTable of dependentTables) {
                                              try { await withRetry(() => supabase.from(depTable).delete().eq(dependentColumn, item.data.id)); } catch (e) {}
                                          }
                                      }
                                      if (table) {
                                          try { await withRetry(() => supabase.from(table).delete().eq('id', item.data.id)); } catch (e) {}
                                      }
                                      await deleteRecycledItemFromSupabase(item.id);
                                  } catch (e) {
                                      console.error('Auto-cleanup err:', e);
                                  }
                                }
                            }, 5000); // 5 seconds after mount
                        }
                        
                        // User Logs background cleanup
                        if (cloudData.userLogs && cloudData.userLogs.length > 0) {
                            setTimeout(async () => {
                                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                                try {
                                    // Delete logs older than 7 days directly from Supabase to prevent buildup
                                    await withRetry(() => supabase.from('user_logs').delete().lt('created_at', sevenDaysAgo));
                                } catch (e) {
                                    console.log('Error cleaning up old user logs from Supabase:', e);
                                }
                            }, 8000); // Wait 8 seconds before triggering
                        }
                    }
                    
                    if (cloudData.appUsers.length > 0) {
                        setAppUsers(prev => {
                            // Merge logic: Start with cloud data
                            const merged = cloudData.appUsers.map((cloudUser: UserAccount) => {
                                const localUser = prev.find(u => u.id === cloudUser.id);
                                // If cloud user is missing password but local has it, keep local password
                                if (localUser && localUser.password && !cloudUser.password) {
                                    return { ...cloudUser, password: localUser.password };
                                }
                                return cloudUser;
                            });

                            // Ensure any local-only users (like new ones created while offline) are preserved
                            const cloudIds = new Set(cloudData.appUsers.map((u: any) => u.id));
                            const localOnly = prev.filter(u => !cloudIds.has(u.id));
                            
                            return [...merged, ...localOnly];
                        });
                    }
                    if (cloudData.purchaseOrders.length > 0) setPurchaseOrders(cloudData.purchaseOrders);
                    if (cloudData.userLogs && cloudData.userLogs.length > 0) setUserLogs(cloudData.userLogs);
                    if (cloudData.tutorials && cloudData.tutorials.length > 0) setTutorials(cloudData.tutorials);
                }
            } catch (err: any) {
                console.error('Supabase AutoLoad Exception:', err.message);
                setDbStatus('error');
                setDbError(err.message);
            } finally {
                // Add a slight delay to ensure a smooth transition
                setTimeout(() => setIsInitializing(false), 1000);
            }
        } else {
            console.log('Supabase Credentials Missing in Environment Variables');
            setDbStatus('error');
            setDbError('Missing API Credentials (VITE_SUPABASE_URL / ANON_KEY)');
            setIsInitializing(false);
        }
    };
    autoLoadFromSupabase();
  }, []);

  // Generic helper for Supabase sync
  const syncToSupabase = async (table: string, data: any) => {
    if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
      try {
        if (table === 'transactions') {
            await saveTransactionToSupabase(data);
        } else if (table === 'products') {
            await saveProductToSupabase(data);
        } else if (table === 'purchase_orders') {
            await savePurchaseOrderToSupabase(data);
        } else if (table === 'tutorials') {
            await saveTutorialToSupabase(data);
        } else if (table === 'customers') {
            await withRetry(() => supabase.from('customers').upsert({
                id: data.id,
                kode: data.kode,
                nama: data.nama,
                jenis: data.jenis,
                phone: data.phone,
                phone_code: data.phoneCode || data.phone_code,
                email: data.email,
                alamat: data.alamat,
                sales: data.sales,
                lead_type: data.leadType || data.lead_type,
                source: data.source,
                npwp: data.npwp,
                keterangan: data.keterangan || '',
                negara: data.negara,
                company_id: data.companyId || data.company_id
                // Note: editHistory is not synced to DB to keep payload small and avoid schema errors
            }));
        } else if (table === 'suppliers') {
            await withRetry(() => supabase.from('suppliers').upsert({
                id: data.id,
                nama: data.nama,
                kode: data.kode,
                npwp: data.npwp,
                phone: data.phone,
                phone_code: data.phoneCode || data.phone_code || '+62',
                email: data.email,
                website: data.website,
                keterangan: data.keterangan || '',
                company_id: data.companyId || data.company_id
            }));
        } else if (table === 'user_accounts') {
            const userPayload: any = {
                id: data.id,
                nama: data.nama,
                username: data.username,
                whatsapp: data.whatsapp,
                role: data.role,
                permissions: data.permissions,
                company_id: data.companyId || data.company_id,
                created_at: data.createdAt || data.created_at
            };
            if (data.password) {
                userPayload.password = data.password;
            }
            console.log(`Supabase Sync: Upserting user_account ${data.username} (hasPassword: ${!!data.password})`);
            const { error } = await withRetry(() => supabase.from('user_accounts').upsert(userPayload));
            if (error) console.error('Supabase Sync Error [user_accounts]:', error.message);
        } else if (table === 'companies') {
            const { error } = await withRetry(() => supabase.from('companies').upsert({
                id: data.id,
                nama: data.nama,
                email: data.email,
                telepon: data.telepon,
                alamat: data.alamat,
                npwp: data.npwp,
                logo: data.logo || null,
                bank_name: data.bankName || null,
                bank_account_name: data.bankAccountName || null,
                bank_account_number: data.bankAccountNumber || null
            }));
            if (error) console.error('Supabase Sync Error [companies]:', error.message);
        } else {
            await supabase.from(table).upsert(data);
        }
      } catch (err: any) {
        console.error(`Supabase Sync Exception (${table}):`, err.message);
      }
    }
  };

  useEffect(() => {
    if (!isMounted) return; // Prevent overwriting history on first mount
    
    localStorage.setItem('mypanca_db_trx', JSON.stringify(transactions));
    localStorage.setItem('mypanca_db_cust', JSON.stringify(customers));
    localStorage.setItem('mypanca_db_prod', JSON.stringify(products));
    localStorage.setItem('mypanca_db_supp', JSON.stringify(suppliers));
    localStorage.setItem('mypanca_db_po', JSON.stringify(purchaseOrders));
    localStorage.setItem('mypanca_db_deleted', JSON.stringify(deletedItems));
    localStorage.setItem('mypanca_db_user_logs', JSON.stringify(userLogs));
    localStorage.setItem('mypanca_db_app_users', JSON.stringify(appUsers));
    localStorage.setItem('mypanca_db_employees', JSON.stringify(employees));
    localStorage.setItem('mypanca_db_companies', JSON.stringify(companies));
    localStorage.setItem('mypanca_db_tutorials', JSON.stringify(tutorials));
    if (currentUser) localStorage.setItem('mypanca_current_user', JSON.stringify(currentUser));
    localStorage.setItem('mypanca_db_auto_notify', autoNotifyEnabled.toString());
    localStorage.setItem('mypanca_db_auto_notify_days', autoNotifyDays.toString());
    localStorage.setItem('mypanca_db_auto_notify_superadmin', autoNotifySuperadmin.toString());
  }, [transactions, customers, products, suppliers, purchaseOrders, deletedItems, appUsers, employees, currentUser, autoNotifyEnabled, autoNotifyDays, autoNotifySuperadmin, isMounted, tutorials, userLogs]);

  // --- NEW: Background Sync to Supabase ---
  useEffect(() => {
    if (!isMounted) return;
    
    const timeout = setTimeout(async () => {
      try {
        await saveAllToSupabase({
          companies,
          suppliers,
          products,
          customers,
          transactions,
          appUsers,
          purchaseOrders
        });
        console.log('Background Sync: Successfully synced to Supabase.');
      } catch (err) {
        console.warn('Background Sync: Failed to sync to Supabase - checking connectivity...');
      }
    }, 5000); // Sync after 5 seconds of inactivity
    
    return () => clearTimeout(timeout);
  }, [transactions, customers, products, suppliers, purchaseOrders, appUsers, companies]);

  // Recycle Bin Auto Cleanup (30 Days)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      setDeletedItems(prev => prev.filter(item => {
        const deletedTime = new Date(item.deletedAt).getTime();
        return (now - deletedTime) < thirtyDaysMs;
      }));
    }, 1000 * 60 * 60); // Check every hour
    return () => clearInterval(interval);
  }, []);

  // User Logs Auto Cleanup (7 Days)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      setUserLogs(prev => prev.filter(log => {
        const logTime = new Date(log.createdAt).getTime();
        return (now - logTime) <= sevenDaysMs;
      }));
    }, 1000 * 60 * 60 * 12); // Check every 12 hours
    
    // Initial cleanup on mount
    setUserLogs(prev => {
        const now = new Date().getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        return prev.filter(log => (now - new Date(log.createdAt).getTime()) <= sevenDaysMs);
    });

    return () => clearInterval(interval);
  }, []);

  // Auto Notification for Quotations (7 days after last follow-up)
  useEffect(() => {
    if (!autoNotifyEnabled) return;
    const checkAndNotify = async () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const dayInMs = 24 * 60 * 60 * 1000;
      let updated = false;
      const newTransactions = [...transactions];

      const salesMessages: Record<string, string[]> = {};
      const salesUpdateRecords: Record<string, { i: number, t: any, lastNotDate: string }[]> = {};

      for (let i = 0; i < newTransactions.length; i++) {
        const t = newTransactions[i];
        
        // --- 1. NOTIFICATION FOR QUOTATIONS (Penawaran) ---
        if (t.status === 'Penawaran' && t.followUps && t.followUps.length > 0) {
          const sortedFollowUps = [...t.followUps].sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
          const latestFU = sortedFollowUps[0];
          const fuDate = new Date(latestFU.tanggal);
          const diffDays = Math.floor((now.getTime() - fuDate.getTime()) / dayInMs);

          if (diffDays >= autoNotifyDays && t.lastNotifiedAt !== latestFU.tanggal) {
            const salesUser = appUsers.find(u => u.nama === t.sales);
            const targetPhone = salesUser?.whatsapp || "6285313200188";
            
            const customer = customers.find(c => c.nama === t.customerName);
            const noCust = customer?.phone ? (customer.phoneCode || '+62') + customer.phone : '-';
            const itemListStr = t.items && t.items.length > 0 ? t.items.map((item: any) => `- ${item.nama} (Qty: ${item.qty})`).join('\n') : 'Tidak ada item';
            const totalVal = t.items?.reduce((acc: number, curr: any) => acc + ((curr.harga * curr.qty) - (curr.diskon || 0)), 0) || 0;
            const roadmapStr = sortedFollowUps.map((fu: any) => `[${fu.tanggal}] ${fu.method || '-'}: ${fu.keterangan || '-'}`).join('\n') || 'Belum ada roadmap follow up';
            
            const message = `Tipe: *PENAWARAN BELUM FOLLOW-UP*\nNo. Penawaran: ${t.noTrx}\nCustomer: ${t.customerName}\nWA/Telp: ${noCust}\n\nItem:\n${itemListStr}\nTotal: ${formatRupiah(totalVal)}\n\nFollow-up Terakhir: ${latestFU.tanggal || '-'}\nKeterangan: ${latestFU.keterangan || '-'}\n`;
            
            if (!salesMessages[targetPhone]) { salesMessages[targetPhone] = []; salesUpdateRecords[targetPhone] = []; }
            salesMessages[targetPhone].push(message);
            salesUpdateRecords[targetPhone].push({ i, t, lastNotDate: latestFU.tanggal });
          }
        }

        // --- 2. NOTIFICATION FOR DUE DATES (Belum Lunas) ---
        if (t.sisaPembayaran && t.sisaPembayaran > 0 && t.jatuhTempo) {
          if (t.jatuhTempo <= todayStr && t.lastNotifiedAt !== `DUE_${t.jatuhTempo}`) {
            const salesUser = appUsers.find(u => u.nama === t.sales);
            const targetPhone = salesUser?.whatsapp || "6285313200188";
            const customer = customers.find(c => c.nama === t.customerName);
            
            const itemListStr = t.items.map(item => `- ${item.nama} (Qty: ${item.qty})`).join('\n');
            const message = `Tipe: *JATUH TEMPO PEMBAYARAN*\nNo. Penawaran: ${t.noTrx}\nCustomer: ${t.customerName}\nWA/Telp: ${customer?.phone ? (customer.phoneCode || '+62') + customer.phone : '-'}\nTgl Pesanan: ${t.tanggal}\nTgl Jatuh Tempo: ${t.jatuhTempo}\n\nItem:\n${itemListStr}\n\nSisa Tagihan: ${formatRupiah(t.sisaPembayaran)}\n`;
            
            if (!salesMessages[targetPhone]) { salesMessages[targetPhone] = []; salesUpdateRecords[targetPhone] = []; }
            salesMessages[targetPhone].push(message);
            salesUpdateRecords[targetPhone].push({ i, t, lastNotDate: `DUE_${t.jatuhTempo}` });
          }
        }
      }

      const superAdminUsers = appUsers.filter(u => u.username === 'superadmin' && u.whatsapp);
      for (const phone of Object.keys(salesMessages)) {
          const bodyMessage = `[AUTO-REMINDER] DAFTAR NOTIFIKASI\n\n${salesMessages[phone].join('\n-----------------------\n\n')}\n*_"setelah melakukan followup lanjutan harap segera melakukan update follow up terbaru di penawaran ini di BRM , link : https://mypancaapps.netlify.app/"_*`;
          
          try {
              const response = await fetch("/api/send-whatsapp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, message: bodyMessage })
              });
              
              if (autoNotifySuperadmin) {
                  for (const sa of superAdminUsers) {
                     await fetch("/api/send-whatsapp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ phone: sa.whatsapp, message: bodyMessage })
                     });
                  }
              }

              if (response.ok) {
                for (const rec of salesUpdateRecords[phone]) {
                  newTransactions[rec.i] = { ...rec.t, lastNotifiedAt: rec.lastNotDate };
                  updated = true;
                }
              }
          } catch(e) { console.error("Auto notify error:", e) }
      }

      if (updated) setTransactions(newTransactions);
    };

    // Run on mount and then every 12 hours
    checkAndNotify();
    const interval = setInterval(checkAndNotify, 12 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [transactions]); // We need transactions to check, but we use functional update or careful check to avoid loops

  // Paste images to currentProd when showDrawer === 'prod'
  useEffect(() => {
     if (showDrawer !== 'prod') return;
     const handlePaste = async (e: ClipboardEvent) => {
         const items = e.clipboardData?.items;
         if (!items) return;
         for (let i = 0; i < items.length; i++) {
             if (items[i].type.indexOf('image') !== -1) {
                 const blob = items[i].getAsFile();
                 if (blob) {
                     try {
                         const processed = await processImage(blob);
                         setCurrentProd(prev => {
                             const images = [...(prev.images || [])];
                             if (images.length < 5) {
                                 images.push(processed);
                             }
                             return { ...prev, images };
                         });
                     } catch (err) {
                         console.error("Gagal paste gambar", err);
                     }
                 }
                 e.preventDefault(); // prevent default paste behavior if it's an image
                 break; // only process the first image pasted at a time
             }
         }
     };
     window.addEventListener('paste', handlePaste);
     return () => window.removeEventListener('paste', handlePaste);
  }, [showDrawer]);
  
  // Derived Values
  const trxCalculations = useMemo(() => {
    const itemsSubtotal = currentTrx.items?.reduce((acc, i) => acc + ((i.harga || 0) * (i.qty || 0) - (i.diskon || 0)), 0) || 0;
    const ppnAmount = currentTrx.ppn ? itemsSubtotal * 0.11 : 0;
    const shippingAmount = currentTrx.ongkir ? (Number(currentTrx.biayaOngkir) || 0) : 0;
    return { itemsSubtotal, ppnAmount, shippingAmount, grandTotal: itemsSubtotal + ppnAmount + shippingAmount };
  }, [currentTrx.items, currentTrx.ppn, currentTrx.ongkir, currentTrx.biayaOngkir]);

  const stats = useMemo(() => {
      let currentFilteredTrx = transactions.filter(t => t.companyId === activeCompanyId);
      let prevFilteredTrx = transactions.filter(t => t.companyId === activeCompanyId);
      
      let trendLabel = 'Vs All Time';
      
      if (filterSales) {
          currentFilteredTrx = currentFilteredTrx.filter(t => t.sales === filterSales);
          prevFilteredTrx = prevFilteredTrx.filter(t => t.sales === filterSales);
      }
      
      if (filterMonth && filterYear) {
          trendLabel = 'Vs Bulan Sebelumnya';
          currentFilteredTrx = currentFilteredTrx.filter(t => t.tanggal?.split('-')[1] === filterMonth && t.tanggal?.split('-')[0] === filterYear);
          
          let prevMonth = parseInt(filterMonth) - 1;
          let prevYear = parseInt(filterYear);
          if (prevMonth === 0) {
              prevMonth = 12;
              prevYear -= 1;
          }
          const prevMonthStr = prevMonth.toString().padStart(2, '0');
          const prevYearStr = prevYear.toString();
          
          prevFilteredTrx = prevFilteredTrx.filter(t => t.tanggal?.split('-')[1] === prevMonthStr && t.tanggal?.split('-')[0] === prevYearStr);
      } else if (filterYear) {
          trendLabel = 'Vs Tahun Sebelumnya';
          currentFilteredTrx = currentFilteredTrx.filter(t => t.tanggal?.split('-')[0] === filterYear);
          
          const prevYear = (parseInt(filterYear) - 1).toString();
          prevFilteredTrx = prevFilteredTrx.filter(t => t.tanggal?.split('-')[0] === prevYear);
      } else if (filterMonth) {
          trendLabel = 'Vs Bulan Sebelumnya';
          currentFilteredTrx = currentFilteredTrx.filter(t => t.tanggal?.split('-')[1] === filterMonth);
          
          let prevMonth = parseInt(filterMonth) - 1;
          if (prevMonth === 0) prevMonth = 12;
          const prevMonthStr = prevMonth.toString().padStart(2, '0');
          prevFilteredTrx = prevFilteredTrx.filter(t => t.tanggal?.split('-')[1] === prevMonthStr);
      } else {
          trendLabel = '';
          prevFilteredTrx = []; // no diff
      }

      const totalOmzet = currentFilteredTrx.filter(t => t.status === 'Selesai' || t.status === 'Lunas' || t.paymentStatus === 'Lunas').reduce((acc, t) => acc + (t.nilaiProyek || 0), 0);
      const activeTrx = currentFilteredTrx.filter(t => ['Penawaran', 'Progress', 'Invoice', 'Payment', 'Pengiriman'].includes(t.status)).length;
      const ongoingPenawaran = currentFilteredTrx.filter(t => t.status === 'Penawaran' || t.status === 'Progress' || !t.status).length;
      
      const prevTotalOmzet = prevFilteredTrx.filter(t => t.status === 'Selesai' || t.status === 'Lunas' || t.paymentStatus === 'Lunas').reduce((acc, t) => acc + (t.nilaiProyek || 0), 0);
      const prevActiveTrx = prevFilteredTrx.filter(t => ['Penawaran', 'Progress', 'Invoice', 'Payment', 'Pengiriman'].includes(t.status)).length;
      const prevOngoingPenawaran = prevFilteredTrx.filter(t => t.status === 'Penawaran' || t.status === 'Progress' || !t.status).length;

      const calcTrend = (current: number, previous: number) => {
          if (!trendLabel) return { value: '0%', type: 'up' as const };
          if (previous === 0) return { value: current > 0 ? '+100%' : '0%', type: 'up' as const };
          const diff = ((current - previous) / previous) * 100;
          return {
              value: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`,
              type: diff >= 0 ? 'up' as const : 'down' as const
          };
      };

      const omzetTrend = calcTrend(totalOmzet, prevTotalOmzet);
      const trxTrend = calcTrend(activeTrx, prevActiveTrx);
      const penawaranTrend = calcTrend(ongoingPenawaran, prevOngoingPenawaran);

      const totalCust = customers.filter(c => c.companyId === activeCompanyId).length;
      const totalProd = products.filter(p => p.companyId === activeCompanyId).length;
      return { 
          totalOmzet, activeTrx, ongoingPenawaran, penawaranTrend, totalCust, totalProd, 
          omzetTrend, trxTrend, trendLabel 
      };
  }, [transactions, customers, products, filterSales, filterMonth, filterYear, activeCompanyId]);

  const soldQuantities = useMemo(() => {
      const map: Record<string, number> = {};
      transactions
          .filter(t => t.companyId === activeCompanyId && ['Pengiriman', 'Selesai'].includes(t.status))
          .forEach(t => {
              t.items?.forEach(item => {
                  map[item.nama] = (map[item.nama] || 0) + item.qty;
              });
          });
      return map;
  }, [transactions, activeCompanyId]);

  const getAvailableStock = (productName: string) => {
      const product = products.find(p => p.nama === productName && (!p.companyId || p.companyId === activeCompanyId || p.company_id === activeCompanyId));
      if (!product) return 0;
      
      let totalIncoming = 0;
      if (Array.isArray(product.lots) && product.lots.length > 0) {
          totalIncoming = product.lots.reduce((acc, lot: any) => {
              const s = Number(lot.stock) ?? Number(lot.stok) ?? Number(lot.qty) ?? 0;
              return acc + (isNaN(s) ? 0 : s);
          }, 0);
      }
      
      const rawDirect = (product as any).stok ?? (product as any).stock ?? (product as any).stokGudang ?? (product as any).qty ?? (product as any).stokAwal;
      let directVal = 0;
      if (typeof rawDirect === 'number' && !isNaN(rawDirect)) directVal = rawDirect;
      else if (typeof rawDirect === 'string') {
          const parsed = parseInt(rawDirect.replace(/[^\d-]/g, ''), 10);
          if (!isNaN(parsed)) directVal = parsed;
      }

      if (totalIncoming === 0) {
          totalIncoming = directVal;
      } else if (directVal > 0) {
          totalIncoming = Math.max(totalIncoming, directVal);
      }

      const totalSold = soldQuantities[productName] || 0;
      return Math.max(0, totalIncoming - totalSold);
  };

  const availableYears = useMemo(() => {
      const years = new Set<string>();
      years.add(new Date().getFullYear().toString());
      transactions.forEach(t => {
          if (t.tanggal) years.add(t.tanggal.split('-')[0]);
      });
      purchaseOrders.forEach(po => {
          if (po.tanggalPembelian) years.add(po.tanggalPembelian.split('-')[0]);
      });
      return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [transactions, purchaseOrders]);

  const isTransactionOrPenawaranView = useMemo(() => {
      return ['Penawaran', 'Transaksi', 'Invoice', 'Pembayaran', 'Belum Lunas', 'Pengiriman', 'Pesanan Selesai', 'Pesanan Batal', 'PPN', 'NON PPN', 'Ongkir'].includes(activeView);
  }, [activeView]);

  const activeTransactionFiltersCount = useMemo(() => {
      let count = 0;
      if (filterSales) count++;
      if (filterStatus) count++;
      if (filterMonth) count++;
      if (filterYear) count++;
      return count;
  }, [filterSales, filterStatus, filterMonth, filterYear]);

  const hasActiveTransactionFilters = activeTransactionFiltersCount > 0;

  // View Data
  const viewData = useMemo(() => {
      let result: any[] = [];
      
      const filterByCompany = (item: any) => item.companyId === activeCompanyId;

      if (activeView === 'Contacts') {
          result = customers.filter(c => {
              if (!filterByCompany(c)) return false;
              const matchesSearch = (c.nama || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                   (c.phone || '').includes(searchTerm) || 
                                   (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()));
              const matchesSales = filterSales ? c.sales === filterSales : true;
              const matchesLead = filterLeadType ? c.leadType === filterLeadType : true;
              return matchesSearch && matchesSales && matchesLead;
          }).sort((a, b) => a.nama.localeCompare(b.nama));
      } else if (activeView === 'Produk') {
          result = products.filter(p => filterByCompany(p) && (p.nama || '').toLowerCase().includes(searchTerm.toLowerCase()));
      } else if (activeView === 'Suppliers') {
          result = suppliers.filter(s => filterByCompany(s) && ((s.nama || '').toLowerCase().includes(searchTerm.toLowerCase()) || (s.kode || '').toLowerCase().includes(searchTerm.toLowerCase())));
      } else if (activeView === 'Purchase Orders' || activeView === 'Procurement') {
          result = purchaseOrders.filter(po => {
              if (!filterByCompany(po)) return false;
              const product = products.find(p => p.id === po.produkId);
              const supplier = suppliers.find(s => s.id === po.supplierId);
              const matchesSearch = (product?.nama || '').toLowerCase().includes(searchTerm.toLowerCase()) || (supplier?.nama || '').toLowerCase().includes(searchTerm.toLowerCase());
              const matchesStatus = filterStatus ? po.status === filterStatus : true;
              const matchesMonth = filterMonth ? po.tanggalPembelian.split('-')[1] === filterMonth : true;
              const matchesYear = filterYear ? po.tanggalPembelian.split('-')[0] === filterYear : true;
              const matchesDate = filterDate ? po.tanggalPembelian === filterDate : true;
              const matchesSupplier = filterSupplier ? po.supplierId === filterSupplier : true;
              return matchesSearch && matchesStatus && matchesMonth && matchesYear && matchesDate && matchesSupplier;
          }).sort((a, b) => new Date(b.tanggalPembelian).getTime() - new Date(a.tanggalPembelian).getTime());
      } else if (activeView === 'Recycle Bin') {
          result = deletedItems.filter(item => {
              if (!filterByCompany(item.data)) return false;
              
              if (recycleBinCategory !== 'All' && item.type !== recycleBinCategory) return false;

              const search = searchTerm.toLowerCase();
              const data = item.data;
              return (data.nama?.toLowerCase().includes(search) || 
                      data.noTrx?.toLowerCase().includes(search) || 
                      data.kode?.toLowerCase().includes(search));
          }).sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
      } else if (activeView === 'Employees') {
          result = employees.filter(e => filterByCompany(e) && ((e.nama || '').toLowerCase().includes(searchTerm.toLowerCase()) || (e.nik || '').toLowerCase().includes(searchTerm.toLowerCase()) || (e.username && e.username.toLowerCase().includes(searchTerm.toLowerCase()))));
      } else if (activeView === 'Users' || activeView === 'Access Control') {
          result = appUsers.filter(u => {
              if (!filterByCompany(u)) return false;
              return (u.nama || '').toLowerCase().includes(searchTerm.toLowerCase()) || (u.username || '').toLowerCase().includes(searchTerm.toLowerCase());
          });
      } else if (['Buku Besar', 'Jurnal', 'Hutang', 'Piutang'].includes(activeView)) {
          result = [];
      } else {
          const transactionViews = ['Transaksi', 'Invoice', 'Pembayaran', 'Pengiriman', 'Pesanan Selesai', 'Pesanan Batal', 'PPN', 'NON PPN', 'Ongkir', 'Penawaran'];
          const paymentViews = ['Belum Lunas'];
          
          if (transactionViews.includes(activeView) || paymentViews.includes(activeView)) {
              result = transactions.filter(t => {
                  if (!filterByCompany(t)) return false;
                  let matchesStatus = true;
                  const trxStatuses = t.statuses || (t.status ? [t.status] : []);
                  
                  if (activeView === 'Penawaran') {
                      const isPenawaran = trxStatuses.includes('Penawaran') || t.status === 'Penawaran' || (t.noTrx && t.noTrx.startsWith('PNW-'));
                      if (!isPenawaran) return false;
                      
                      if (filterStatus) {
                          if (filterStatus === 'Sudah Follow Up') {
                              matchesStatus = !!(t.followUps && t.followUps.length > 0);
                          } else if (filterStatus === 'Belum Follow Up') {
                              matchesStatus = !t.followUps || t.followUps.length === 0;
                          } else if (filterStatus.toLowerCase() === 'penawaran') {
                              matchesStatus = t.status === 'Penawaran' || trxStatuses.includes('Penawaran');
                          } else if (filterStatus.toLowerCase() === 'progress') {
                              matchesStatus = t.status === 'Progress' || trxStatuses.includes('Progress');
                          } else if (filterStatus.toLowerCase() === 'batal') {
                              matchesStatus = t.status === 'Batal' || trxStatuses.includes('Batal');
                          } else {
                              matchesStatus = trxStatuses.some(s => s.toLowerCase() === filterStatus.toLowerCase()) || 
                                              (t.status && t.status.toLowerCase() === filterStatus.toLowerCase());
                          }
                      } else {
                          matchesStatus = true;
                      }
                  } else if (transactionViews.includes(activeView)) {
                      const baseMatches = 
                        activeView === 'Transaksi' ? (trxStatuses.includes('Progress') || trxStatuses.includes('Invoice') || trxStatuses.includes('Payment') || trxStatuses.includes('Pengiriman') || trxStatuses.includes('Selesai') || trxStatuses.includes('Batal') || ['Progress', 'Invoice', 'Payment', 'Pengiriman', 'Selesai', 'Batal'].includes(t.status || '')) :
                        activeView === 'Invoice' ? (trxStatuses.includes('Invoice') || t.status === 'Invoice') :
                        activeView === 'Pembayaran' ? (trxStatuses.includes('Payment') || t.status === 'Payment') :
                        activeView === 'Pengiriman' ? (trxStatuses.includes('Pengiriman') || t.status === 'Pengiriman') :
                        activeView === 'Pesanan Selesai' ? (trxStatuses.includes('Selesai') || t.status === 'Selesai') :
                        activeView === 'Pesanan Batal' ? (trxStatuses.includes('Batal') || t.status === 'Batal') :
                        activeView === 'PPN' ? (t.ppn === true && (trxStatuses.includes('Selesai') || t.status === 'Selesai')) :
                        activeView === 'NON PPN' ? (t.ppn === false && (trxStatuses.includes('Selesai') || t.status === 'Selesai')) :
                        activeView === 'Ongkir' ? (t.ongkir === true && (trxStatuses.includes('Selesai') || t.status === 'Selesai')) : true;
                      
                      if (!baseMatches) return false;
                      
                      if (filterStatus) {
                          const statusMap: Record<string, string[]> = {
                              'progress': ['progress'],
                              'invoice': ['invoice'],
                              'pembayaran': ['payment', 'pembayaran'],
                              'payment': ['payment', 'pembayaran'],
                              'pengiriman': ['pengiriman'],
                              'pesanan selesai': ['selesai', 'pesanan selesai'],
                              'selesai': ['selesai', 'pesanan selesai'],
                              'batal': ['batal', 'pesanan batal']
                          };
                          const targetAliases = statusMap[filterStatus.toLowerCase()] || [filterStatus.toLowerCase()];
                          matchesStatus = trxStatuses.some(s => targetAliases.includes(s.toLowerCase())) ||
                                          (t.status && targetAliases.includes(t.status.toLowerCase()));
                      } else {
                          matchesStatus = true;
                      }
                  } else if (paymentViews.includes(activeView)) {
                      matchesStatus = t.paymentStatus === 'Belum Lunas' && (trxStatuses.includes('Pengiriman') || t.status === 'Pengiriman');
                      if (filterStatus) {
                          matchesStatus = matchesStatus && (trxStatuses.some(s => s.toLowerCase() === filterStatus.toLowerCase()) || (t.status && t.status.toLowerCase() === filterStatus.toLowerCase()));
                      }
                  }
                  
                  const matchesSearch = (t.noTrx || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                        (t.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        (t.sales || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        (t.keterangan || '').toLowerCase().includes(searchTerm.toLowerCase());
                  const matchesSales = filterSales ? t.sales === filterSales : true;
                  
                  let matchesMonth = true;
                  let matchesYear = true;
                  if (t.tanggal) {
                      const parts = t.tanggal.split('-');
                      const trxYear = parts[0];
                      const trxMonth = parts[1];
                      if (filterMonth) matchesMonth = trxMonth === filterMonth;
                      if (filterYear) matchesYear = trxYear === filterYear;
                  } else if (filterMonth || filterYear) {
                      matchesMonth = false;
                      matchesYear = false;
                  }
                  
                  return matchesStatus && matchesSearch && matchesSales && matchesMonth && matchesYear;
              }).sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
          }
      }
      return result;
  }, [activeView, activeCompanyId, customers, employees, appUsers, products, suppliers, transactions, purchaseOrders, deletedItems, searchTerm, filterSales, filterLeadType, filterMonth, filterYear, filterStatus, filterDate, filterSupplier, recycleBinCategory]);

  const handleAIAnalyze = async () => {
      setIsAnalyzingAI(true);
      setShowAIModal(true);
      setAiAnalysis("");
      try {
          // Filter data based on current period and company
          const periodTransactions = transactions.filter(t => {
              if (t.companyId !== activeCompanyId) return false;
              if (!['Pengiriman', 'Selesai'].includes(t.status)) return false;
              if (!t.tanggal) return true;
              const [y, m] = t.tanggal.split('-');
              const monthMatch = filterMonth ? m === filterMonth : true;
              const yearMatch = filterYear ? y === filterYear : true;
              const salesMatch = filterSales ? t.sales === filterSales : true;
              return monthMatch && yearMatch && salesMatch;
          });

          const periodSalesMap: Record<string, number> = {};
          const periodRevenueMap: Record<string, number> = {};
          periodTransactions.forEach(t => {
              t.items?.forEach(item => {
                  periodSalesMap[item.nama] = (periodSalesMap[item.nama] || 0) + item.qty;
                  periodRevenueMap[item.nama] = (periodRevenueMap[item.nama] || 0) + (item.qty * item.harga);
              });
          });

          // Overall Stats for the company
          const activeCustomers = customers.filter(c => c.companyId === activeCompanyId);
          const activeProducts = products.filter(p => p.companyId === activeCompanyId);
          
          // Calculate Omzet
          const totalOmzet = periodTransactions.reduce((acc, t) => acc + t.nilaiProyek, 0);
          
          // Performance Follow-up (CRM aspect)
          const quotes = transactions.filter(t => 
            t.companyId === activeCompanyId && 
            t.status === 'Penawaran' && 
            (!filterSales || t.sales === filterSales)
          );
          const totalQuotes = quotes.length;
          const followedUpQuotes = quotes.filter(q => q.followUps && q.followUps.length > 0).length;

          // Prepare data for context - Slice to prevent extremely long prompts
          const topProductData = Object.entries(periodSalesMap)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .slice(0, 10)
              .map(([name, qty]) => `${name} (${qty} terjual, Nilai: ${formatRupiah(periodRevenueMap[name])})`)
              .join(', ');

          const lowStockData = activeProducts
              .filter(p => getAvailableStock(p.nama) < 10)
              .slice(0, 10)
              .map(p => `${p.nama} (Sisa: ${getAvailableStock(p.nama)})`)
              .join(', ');

          const currentMonthName = filterMonth ? MONTHS.find(m => m.value === filterMonth)?.label : 'Keseluruhan';
          const currentYearName = filterYear || 'Semua Tahun';
          const salesName = filterSales || 'Semua Sales';

          const promptText = `Anda adalah Business Analyst Professional untuk MyPanca BRM.
              Lakukan analisa mendalam untuk data bisnis berikut:
              
              IDENTITAS & PERIODE:
              - Perusahaan: ${activeCompany.nama}
              - Periode: ${currentMonthName} ${currentYearName}
              - Sales Filter: ${salesName}
              
              DATA RINGKASAN:
              - Total Omzet Lunas/Selesai: ${formatRupiah(totalOmzet)}
              - Total Transaksi dalam Periode: ${periodTransactions.length}
              - Lead Customer Aktif: ${activeCustomers.length}
              - Total SKU Produk: ${activeProducts.length}
              
              ASPEK PRODUK & INVENTARIS:
              - Produk Terlaris (Top 10): ${topProductData || 'Belum ada data penjualan lunas'}
              - Isu Stok (Stok Rendah < 10, Tampilkan 10 teratas): ${lowStockData || 'Semua stok dalam level aman'}
              
              KINERJA FOLLOW-UP (BRM):
              - Total Penawaran Aktif (PNW): ${totalQuotes}
              - Penawaran Sudah di-Follow Up: ${followedUpQuotes}
              - Persentase Aktivitas Follow Up: ${totalQuotes > 0 ? ((followedUpQuotes/totalQuotes)*100).toFixed(1) : 0}%
              
              INSTRUKSI ANALISA:
              1. Analisa Tren Penjualan & Omzet: Berikan insight tentang performa keuangan periode ini.
              2. Analisa Produk: Evaluasi produk terlaris dan berikan strategi untuk produk yang stoknya menipis.
              3. Analisa Kinerja BRM: Evaluasi efektivitas follow-up sales dan berikan saran perbaikan.
              4. Insight Strategis: Berikan 3 poin aksi nyata untuk meningkatkan profitabilitas di periode berikutnya.
              
              FORMAT OUTPUT:
              Gunakan format Markdown yang sangat rapi dan profesional:
              - Gunakan ## untuk Judul Bagian.
              - Gunakan elemen Bold untuk angka-angka kunci.
              - Gunakan List Berbutir untuk rekomendasi.
              - Berikan kesimpulan akhir (Executive Summary).
              
              Jawab dalam Bahasa Indonesia.`;

          let aiText = "";
          try {
              aiText = await callGeminiWithKeyRotation({
                  systemPrompt: "Anda adalah Business Analyst Professional untuk platform CRM & ERP MyPanca PT. Panca Prima Wijaya.",
                  messages: [],
                  userPrompt: promptText,
                  preferredModel: "gemini-3.5-flash",
                  temperature: 0.2,
                  maxTokens: 2000
              });
          } catch (geminiError: any) {
              console.warn("Gemini Analysis call error:", geminiError);
          }
          
          if (!aiText) {
              throw new Error("Model AI tidak mengembalikan teks hasil analisa.");
          }
          
          setAiAnalysis(aiText);
      } catch (error: any) {
          console.error("AI Analysis Failed:", error);
          const errorMsg = error?.message || (typeof error === 'string' ? error : "Terjadi kesalahan sistem saat menghubungi AI.");
          setAiAnalysis(`Gagal melakukan analisa AI: ${errorMsg}`);
      } finally {
          setIsAnalyzingAI(false);
      }
  };

  // Actions
  const handleNavClick = (module: string, view: string) => {
      setActiveModule(module);
      setActiveView(view);
      if (view === 'Recycle Bin') {
          setRecycleBinCategory('All');
      }
      setFilterSales('');
      setFilterLeadType('');
      const now = new Date();
      if (view === 'Dashboard' || view === 'Dashboard Produk') {
          setFilterMonth((now.getMonth() + 1).toString().padStart(2, '0'));
          setFilterYear(now.getFullYear().toString());
      } else {
          setFilterMonth('');
          setFilterYear('');
      }
      setFilterDate('');
      setFilterSupplier('');
      setFilterStatus('');
      setSearchTerm('');
      const newTabLabel = `#${view}`;
      activateTab(newTabLabel);
      setSelectedIds([]);
      setIsMobileMenuOpen(false); // Close sidebar on mobile
  };

  const handleTabClick = (tabLabel: string) => {
      const viewId = tabLabel.replace('#', '');
      
      if (viewId === 'Recycle Bin') {
          setRecycleBinCategory('All');
      }

      // Find category for this view
      let foundModule = activeModule;
      for (const cat of MENU_STRUCTURE) {
          if (cat.items.some(item => item.id === viewId)) {
              foundModule = cat.category;
              break;
          }
      }
      
      handleNavClick(foundModule, viewId);
  };

  // Delete Handlers
  const handleDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Hapus',
      message: 'Apakah Anda yakin ingin menghapus data ini? Data akan dipindahkan ke Recycle Bin.',
      type: 'danger',
      onConfirm: async () => {
        let deletedItem: any = null;
        let type: RecycledItem['type'] = 'Transaction';
        let table = '';
        let dependentTables: string[] = [];
        let dependentColumn = '';

        const trx = transactions.find(t => t.id === id);
        if (trx) {
          deletedItem = trx;
          type = 'Transaction';
          table = 'transactions';
          dependentTables = ['transaction_items'];
          dependentColumn = 'transaction_id';
          setTransactions(prev => prev.filter(t => t.id !== id));
        } else {
          const cust = customers.find(c => c.id === id);
          if (cust) {
            deletedItem = cust;
            type = 'Customer';
            table = 'customers';
            setCustomers(prev => prev.filter(c => c.id !== id));
          } else {
            const prod = products.find(p => p.id === id);
            if (prod) {
              deletedItem = prod;
              type = 'Product';
              table = 'products';
              dependentTables = ['product_lots', 'transaction_items', 'purchase_order_items'];
              dependentColumn = 'product_id';
              setProducts(prev => prev.filter(p => p.id !== id));
            } else {
              const supp = suppliers.find(s => s.id === id);
              if (supp) {
                deletedItem = supp;
                type = 'Supplier';
                table = 'suppliers';
                dependentTables = ['purchase_orders'];
                dependentColumn = 'supplier_id';
                setSuppliers(prev => prev.filter(s => s.id !== id));
              } else {
                const po = purchaseOrders.find(p => p.id === id);
                if (po) {
                  deletedItem = po;
                  type = 'Transaction';
                  table = 'purchase_orders';
                  dependentTables = ['purchase_order_items'];
                  dependentColumn = 'purchase_order_id';
                  setPurchaseOrders(prev => prev.filter(p => p.id !== id));
                } else {
                  const emp = employees.find(e => e.id === id);
                  if (emp) {
                    deletedItem = emp;
                    type = 'Employee';
                    table = 'employees';
                    setEmployees(prev => prev.filter(e => e.id !== id));
                  } else {
                    const user = appUsers.find(u => u.id === id);
                    if (user) {
                      deletedItem = user;
                      type = 'UserAccount';
                      table = 'user_accounts';
                      setAppUsers(prev => prev.filter(u => u.id !== id));
                    }
                  }
                }
              }
            }
          }
        }

        if (deletedItem && table) {
          const recycled: RecycledItem = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            data: deletedItem,
            deletedAt: new Date().toISOString(),
            deletedBy: currentUser?.id || 'Unknown',
            deletedByName: currentUser?.nama || 'Unknown',
            companyId: currentUser?.companyId
          };
          
          setDeletedItems(prev => [recycled, ...prev]);
          logUserAction('DELETE', `Menghapus item ID ${deletedItem.id || 'N/A'}`, type);
          
          try {
              // Simply save it to recycled_items in Supabase. We do NOT delete the main record yet, 
              // it's soft-deleted because loadDataFromSupabase filters it out.
              await saveRecycledItemToSupabase(recycled);
              console.log('Saved recycled item to Cloud:', recycled.id);
          } catch (err: any) {
              console.error('Failed to sync recycle bin creation to cloud:', err.message || err);
          }
        }
        setConfirmModal(null);
      }
    });
  };

  const handleRestore = (item: RecycledItem) => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Restore',
      message: 'Apakah Anda yakin ingin mengembalikan data ini?',
      type: 'info',
      onConfirm: async () => {
        let table = '';
        if (item.type === 'Transaction') {
            setTransactions(prev => [item.data, ...prev]);
            table = item.data.noTrx ? 'transactions' : 'purchase_orders';
        }
        else if (item.type === 'Customer') { setCustomers(prev => [item.data, ...prev]); table = 'customers'; }
        else if (item.type === 'Product') { setProducts(prev => [item.data, ...prev]); table = 'products'; }
        else if (item.type === 'Supplier') { setSuppliers(prev => [item.data, ...prev]); table = 'suppliers'; }
        else if (item.type === 'Employee') { setEmployees(prev => [item.data, ...prev]); table = 'employees'; }
        else if (item.type === 'UserAccount') { setAppUsers(prev => [item.data, ...prev]); table = 'user_accounts'; }

        setDeletedItems(prev => prev.filter(i => i.id !== item.id));
        logUserAction('RESTORE', `Mengembalikan item ID ${item.data?.id || 'N/A'}`, item.type);

        try {
            // Remove from recycled items
            await deleteRecycledItemFromSupabase(item.id);
            
            if (table === 'transactions') await saveTransactionToSupabase(item.data);
            else if (table === 'products') await saveProductToSupabase(item.data);
            else if (table === 'purchase_orders') await savePurchaseOrderToSupabase(item.data);
            else {
                await withRetry(() => supabase.from(table).upsert({
                    ...item.data,
                    company_id: item.data.companyId || item.data.company_id,
                    phone_code: item.data.phoneCode || item.data.phone_code,
                    lead_type: item.data.leadType || item.data.lead_type
                }));
            }
        } catch (err) {
            console.error('Failed to sync restore to cloud:', err);
        }

        setConfirmModal(null);
      }
    });
  };

  const handlePermanentDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Permanen',
      message: 'Data ini akan dihapus secara permanen dari database. Lanjutkan?',
      type: 'danger',
      onConfirm: async () => {
        const item = deletedItems.find(i => i.id === id);
        setDeletedItems(prev => prev.filter(i => i.id !== id));
        
        if (item) {
            try {
                  // Figure out table name and dependent tables
                  let table = '';
                  let dependentTables: string[] = [];
                  let dependentColumn = '';
                  
                  if (item.type === 'Transaction') {
                      table = 'transactions';
                      if ((item.data as any).tanggalPembelian) {
                          table = 'purchase_orders';
                          dependentTables = ['purchase_order_items'];
                          dependentColumn = 'purchase_order_id';
                      } else {
                          table = 'transactions';
                          dependentTables = ['transaction_items'];
                          dependentColumn = 'transaction_id';
                      }
                  } else if (item.type === 'Product') {
                      table = 'products';
                      dependentTables = ['product_lots', 'transaction_items', 'purchase_order_items'];
                      dependentColumn = 'product_id';
                  } else if (item.type === 'Customer') {
                      table = 'customers';
                  } else if (item.type === 'Supplier') {
                      table = 'suppliers';
                      dependentTables = ['purchase_orders'];
                      dependentColumn = 'supplier_id';
                  } else if (item.type === 'Employee') {
                      table = 'employees';
                  } else if (item.type === 'UserAccount') {
                      table = 'user_accounts';
                  }
                  
                  // Delete from dependents
                  if (table && dependentTables.length > 0 && dependentColumn) {
                      for (const depTable of dependentTables) {
                          try {
                              await withRetry(() => supabase.from(depTable).delete().eq(dependentColumn, item.data.id));
                          } catch (e: any) { console.error('Failed to delete dep', e.message); }
                      }
                  }
                  // Delete from main table
                  if (table) {
                      await withRetry(() => supabase.from(table).delete().eq('id', item.data.id));
                  }
                  
                  // Delete from recycled items
                  await deleteRecycledItemFromSupabase(item.id);
            } catch (err: any) {
                console.error('Failed to permanently delete item', err.message);
            }
        }
        setConfirmModal(null);
      }
    });
  };

  // Status Change Helpers
  const updateTransactionStatus = (id: string, newStatus: string, extraUpdates = {}) => {
      let updatedTrx: any = null;
      setTransactions(prev => prev.map(t => {
          if (t.id === id) {
              let updates: any = { ...extraUpdates };
              // If converting from Penawaran to Progress, generate new invoice number
              if ((t.statuses || []).includes('Penawaran') && newStatus === 'Progress') {
                  updates.noTrx = generateInvoiceNumber();
              }
              const workflowStatuses = ['Selesai', 'Progress', 'Batal', 'Pengiriman', 'Payment', 'Penawaran', 'Invoice'];
              const filteredStatuses = (t.statuses || []).filter(s => !workflowStatuses.includes(s));
              
              const now = new Date().toLocaleString('id-ID');
              const actionUserName = currentUser?.nama || "Unknown";
              const actionUserRole = currentUser?.role || "Admin";
              const oldStatus = (t.statuses || []).find(s => workflowStatuses.includes(s)) || 'Unknown';
              
              const newHistory: EditLog[] = [...(t.editHistory || [])];
              newHistory.push({
                  timestamp: now,
                  user: actionUserName,
                  role: actionUserRole,
                  changes: `Status change: ${oldStatus} → ${newStatus}${Object.keys(updates).length > 0 ? `, Updates: ${Object.keys(updates).join(', ')}` : ''}`,
                  type: 'Transaction',
                  id: t.id
              });

              const newTrx = { ...t, statuses: [...filteredStatuses, newStatus], status: newStatus as any, ...updates, editHistory: newHistory };
              logUserAction('UPDATE', `Mengubah status transaksi ${t.noTrx} menjadi ${newStatus}`, 'Transaction');
              updatedTrx = newTrx;
              return newTrx;
          }
          return t;
      }));
      if (updatedTrx) {
          syncToSupabase('transactions', updatedTrx);
      }
  };

  const handlePrintPenawaran = (t: Transaction) => {
      setCurrentTrx(t);
      const mm = (new Date().getMonth() + 1).toString().padStart(2, '0');
      const yy = new Date().getFullYear().toString().slice(2);
      setPenawaranNomor(`034/SP/FMS-PPW/${mm}/${yy}`);
      setPenawaranPerihal(`Penawaran Obat Fumigasi ${t.items?.[0]?.nama || ''}`);
      setPenawaranNama(t.items?.[0]?.nama || '');
      setPenawaranBahanAktif(t.items?.[0]?.nama || '');
      
      const priceStr = t.items?.[0] ? `Rp ${(t.items?.[0]?.harga || 0).toLocaleString('id-ID')} / ${t.items?.[0]?.qty || 1} Unit` : '';
      setPenawaranHargaStr(priceStr);
      
      setShowDrawer('printPenawaran');
  };

  const handlePrintInvoice = (t: Transaction) => {
      // 1. Change Status to Invoice
      updateTransactionStatus(t.id, 'Invoice');
      
      // 2. Set Active View to Invoice
      setActiveView('Invoice');

      // 3. Open Print Drawer
      setCurrentTrx(t);
      setPaidAmount(0); 
      setInvoiceNote('');
      setPrintDocType('Invoice');
      setInvoiceRefPrefix('');
      setInvoiceNoPo('');
      setInvoiceTglPo('');
      const cust = customers.find(c => c.nama === t.customerName);
      setPiDate(new Date(t.tanggal).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
      setPiInvoiceNo(`PI-${t.noTrx}`);
      setPiBillTo(`${t.customerName}\nContact: ${cust?.phone ? (cust.phoneCode || '') + cust.phone : ''}\nAddress: ${cust?.alamat || ''}`);
      setPiShipTo(`DABAKH CARGO\n18818805534\nAddress: Room B29, 2/F, Yidong\nDasha, No. 303, Huan Shi Middle Road,\nGuangzhou, China`);
      setPiItems(t.items && t.items.length > 0 ? t.items.map(item => ({ desc: item.nama || '', hsCode: '', qty: item.qty?.toString() || '1', unitPrice: '-', total: '-' })) : [{ desc: 'Sample Japanese Lawn Grass Seeds', hsCode: '1209.29', qty: '100', unitPrice: '-', total: '-' }]);
      setShowDrawer('printInvoice');
  };

  const handlePaymentComplete = (t: Transaction) => {
      setCurrentTrx(t);
      setAdditionalPayment(0);
      setActiveView('Pembayaran');
      setShowDrawer('paymentForm');
  };

  const handleTrxClick = (t: Transaction) => {
      setCurrentTrx(t);
      const restrictedViews = ['Pengiriman', 'Pesanan Selesai', 'Belum Lunas', 'Pesanan Batal', 'PPN', 'NON PPN', 'Ongkir', 'Invoice'];
      
      if (restrictedViews.includes(activeView)) {
          setShowDrawer('trxDetail');
      } else if (['Lunas'].includes(activeView)) {
          setShowDrawer('paymentForm');
      } else {
          setShowDrawer('trxDetail');
      }
  };

  const downloadInvoicePDF = () => {
    const element = document.getElementById('invoice-area');
    if (!element) return;
    
    const isPenawaran = showDrawer === 'printPenawaran';
    const isNota = printDocType === 'Nota';
    const isPI = printDocType === 'PI';
    const docName = isPenawaran ? 'Penawaran' : (isPI ? 'ProformaInvoice' : (isNota ? 'Nota' : 'Invoice'));
    
    const opt = {
      margin:       10,
      filename:     `${docName}-${currentTrx.noTrx}.pdf`,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
      jsPDF:        { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    // New Promise-based usage:
    html2pdf().set(opt).from(element).save();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = (data: any[]) => {
    if (selectedIds.length === data.length) setSelectedIds([]);
    else setSelectedIds(data.map(d => d.id));
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    
    const idsToDelete = [...selectedIds];
    const currentView = activeView;

    // Handle Recycle Bin specifically (Permanent Delete)
    if (currentView === 'Recycle Bin') {
      setConfirmModal({
        isOpen: true,
        title: 'Konfirmasi Hapus Permanen Massal',
        message: `Apakah Anda yakin ingin menghapus ${idsToDelete.length} data dari Recycle Bin secara permanen? Tindakan ini tidak dapat dibatalkan.`,
        type: 'danger',
        onConfirm: async () => {
          setConfirmModal(null);
          setSelectedIds([]);
          
          const itemsToPermanentlyDelete = deletedItems.filter(item => idsToDelete.includes(item.id));
          setDeletedItems(prev => prev.filter(item => !idsToDelete.includes(item.id)));
          
          try {
              for (const item of itemsToPermanentlyDelete) {
                  // Figure out table name and dependent tables
                  let table = '';
                  let dependentTables: string[] = [];
                  let dependentColumn = '';
                  
                  if (item.type === 'Transaction') {
                      table = 'transactions'; // wait, could be purchase order if we check data? Actually purchase orders use 'Transaction' too... Wait... Let's just delete by id from both just in case, or check.
                      if ((item.data as any).tanggalPembelian) {
                          table = 'purchase_orders';
                          dependentTables = ['purchase_order_items'];
                          dependentColumn = 'purchase_order_id';
                      } else {
                          table = 'transactions';
                          dependentTables = ['transaction_items'];
                          dependentColumn = 'transaction_id';
                      }
                  } else if (item.type === 'Product') {
                      table = 'products';
                      dependentTables = ['product_lots', 'transaction_items', 'purchase_order_items'];
                      dependentColumn = 'product_id';
                  } else if (item.type === 'Customer') {
                      table = 'customers';
                  } else if (item.type === 'Supplier') {
                      table = 'suppliers';
                      dependentTables = ['purchase_orders'];
                      dependentColumn = 'supplier_id';
                  } else if (item.type === 'Employee') {
                      table = 'employees';
                  } else if (item.type === 'UserAccount') {
                      table = 'user_accounts';
                  }
                  
                  // Delete from dependents
                  if (table && dependentTables.length > 0 && dependentColumn) {
                      for (const depTable of dependentTables) {
                          try {
                              await withRetry(() => supabase.from(depTable).delete().eq(dependentColumn, item.data.id));
                          } catch (e: any) { console.error('Failed to delete dep', e.message); }
                      }
                  }
                  // Delete from main table
                  if (table) {
                      await withRetry(() => supabase.from(table).delete().eq('id', item.data.id));
                  }
                  
                  // Delete from recycled items
                  await deleteRecycledItemFromSupabase(item.id);
              }
          } catch(err: any) {
              console.error('Failed to permanently delete items', err.message);
          }
        }
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Hapus Massal',
      message: `Apakah Anda yakin ingin menghapus ${idsToDelete.length} data terpilih? Data akan dipindahkan ke Recycle Bin.`,
      type: 'danger',
      onConfirm: async () => {
        // CLOSE MODAL AND CLEAR SELECTION FIRST FOR SNAPPIER UI
        setConfirmModal(null);
        setSelectedIds([]);

        try {
            let itemsToRecycle: any[] = [];
            let recycleType: RecycledItem['type'] = 'Transaction';
            let tableName = '';
            let dependentTables: string[] = [];
            let dependentColumn = '';

            // 1. DETERMINE ENTITY TYPE & TABLE
            if (currentView === 'Contacts') {
              itemsToRecycle = customers.filter(c => idsToDelete.includes(c.id));
              recycleType = 'Customer';
              tableName = 'customers';
              setCustomers(prev => prev.filter(c => !idsToDelete.includes(c.id)));
              // For customers, we might want to clean up transactions but that's risky. 
              // Usually FK will block this if there are transactions.
            } else if (currentView === 'Produk') {
              itemsToRecycle = products.filter(p => idsToDelete.includes(p.id));
              recycleType = 'Product';
              tableName = 'products';
              dependentTables = ['product_lots', 'transaction_items', 'purchase_order_items'];
              dependentColumn = 'product_id';
              setProducts(prev => prev.filter(p => !idsToDelete.includes(p.id)));
            } else if (currentView === 'Suppliers') {
              itemsToRecycle = suppliers.filter(s => idsToDelete.includes(s.id));
              recycleType = 'Supplier';
              tableName = 'suppliers';
              dependentTables = ['purchase_orders'];
              dependentColumn = 'supplier_id';
              setSuppliers(prev => prev.filter(s => !idsToDelete.includes(s.id)));
            } else if (currentView === 'Purchase Orders' || currentView === 'Procurement') {
              itemsToRecycle = purchaseOrders.filter(po => idsToDelete.includes(po.id));
              recycleType = 'Transaction';
              tableName = 'purchase_orders';
              dependentTables = ['purchase_order_items'];
              dependentColumn = 'purchase_order_id';
              setPurchaseOrders(prev => prev.filter(po => !idsToDelete.includes(po.id)));
            } else if (currentView === 'Employees') {
              itemsToRecycle = employees.filter(e => idsToDelete.includes(e.id));
              recycleType = 'Employee';
              tableName = 'employees';
              setEmployees(prev => prev.filter(e => !idsToDelete.includes(e.id)));
            } else if (currentView === 'Users' || currentView === 'Access Control') {
              itemsToRecycle = appUsers.filter(u => idsToDelete.includes(u.id));
              recycleType = 'UserAccount';
              tableName = 'user_accounts';
              setAppUsers(prev => prev.filter(u => !idsToDelete.includes(u.id)));
            } else {
              // Assume transactions for all other views (Penawaran, Invoice, etc.)
              itemsToRecycle = transactions.filter(t => idsToDelete.includes(t.id));
              recycleType = 'Transaction';
              tableName = 'transactions';
              dependentTables = ['transaction_items'];
              dependentColumn = 'transaction_id';
              setTransactions(prev => prev.filter(t => !idsToDelete.includes(t.id)));
            }

            // 2. ADD TO RECYCLE BIN (LOCAL)
            if (itemsToRecycle.length > 0 && tableName) {
              const newRecycledItems: RecycledItem[] = itemsToRecycle.map(item => ({
                id: Math.random().toString(36).substr(2, 9) + Date.now().toString(),
                type: recycleType,
                data: item,
                deletedAt: new Date().toISOString(),
                deletedBy: currentUser?.id || 'Unknown',
                deletedByName: currentUser?.nama || 'Unknown',
                companyId: currentUser?.companyId
              }));

              setDeletedItems(prev => [...newRecycledItems, ...prev]);

              // 3. BACKGROUND SYNC
              try {
                const BATCH_SIZE = 50;
                for (let i = 0; i < newRecycledItems.length; i += BATCH_SIZE) {
                    const batchItems = newRecycledItems.slice(i, i + BATCH_SIZE);
                    await Promise.all(batchItems.map(item => saveRecycledItemToSupabase(item)));
                }
                
                console.log(`Cloud Sync: Bulk moved ${idsToDelete.length} records to recycle bin from ${tableName}.`);
              } catch (err: any) {
                console.error('Failed to sync bulk recycle bin creation to cloud:', err.message || err);
              }
            }
        } catch (err: any) {
            console.error('Bulk delete logic failure:', err.message || err);
        }
      }
    });
  };

  const handleBulkExport = () => {
    if (selectedIds.length === 0) return;
    
    let dataToExport: any[] = [];
    let filename = `Export-${activeView}-${new Date().toISOString().split('T')[0]}.xlsx`;

    if (activeView === 'Contacts') {
        dataToExport = customers.filter(c => selectedIds.includes(c.id)).map(c => ({
            'Nama': c.nama,
            'Kode': c.kode,
            'Jenis': c.jenis,
            'Telepon': `${c.phoneCode || ''}${c.phone}`,
            'Email': c.email,
            'Alamat': c.alamat,
            'Sales': c.sales,
            'Lead Type': c.leadType,
            'Source': c.source,
            'NPWP': c.npwp
        }));
    } else if (activeView === 'Produk') {
        dataToExport = products.filter(p => selectedIds.includes(p.id)).map(p => ({
            'Nama': p.nama,
            'Kode': p.kode,
            'Satuan': p.satuan,
            'Berat (Kg)': p.berat,
            'Stok Tersedia': getAvailableStock(p.nama),
            'Harga Jual': getProductPrice(p)
        }));
    } else if (activeView === 'Suppliers') {
        dataToExport = suppliers.filter(s => selectedIds.includes(s.id)).map(s => ({
            'Nama': s.nama,
            'Kode': s.kode,
            'Telepon': `${s.phoneCode || '+62'}${s.phone || ''}`,
            'Email': s.email,
            'Website': s.website,
            'NPWP': s.npwp,
            'Keterangan': s.keterangan
        }));
    } else {
        dataToExport = (viewData as Transaction[]).filter(t => selectedIds.includes(t.id)).map(t => {
            const baseData: any = {
                'No Trx': t.noTrx,
                'Tanggal': t.tanggal,
                'Customer': t.customerName,
                'Nilai Proyek': t.nilaiProyek,
                'Sales': t.sales,
                'Status': t.statuses.join(', '),
                'Payment Status': t.paymentStatus,
                'Jasa Kirim': t.jasaKirim,
                'No Resi': t.noResi,
                'Keterangan': t.keterangan || '-'
            };

            if ((t.statuses || []).includes('Penawaran') || activeView === 'Penawaran') {
                const sortedFollowUps = (t.followUps || []).slice().sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
                const followUpHistory = sortedFollowUps.map(fu => 
                    `[${fu.tanggal}] ${fu.method || 'General'}: ${fu.keterangan}`
                ).join(' | ');
                
                const latestFU = sortedFollowUps[0];
                const baseDate = latestFU ? new Date(latestFU.tanggal) : new Date(t.tanggal);
                const nextFUD = new Date(baseDate.getTime() + autoNotifyDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const method = latestFU ? latestFU.method : (t.followUpMethod || 'WhatsApp');

                baseData['Histori Follow-up'] = followUpHistory || '-';
                baseData['Next Follow-up'] = nextFUD;
                baseData['Metode Follow-up'] = method;
            }
            return baseData;
        });
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
  };

  const getContactInfo = (item: any) => {
      if (item.phone !== undefined) return { nama: item.nama || item.customerName || '', phone: item.phone, phoneCode: item.phoneCode, email: item.email };
      if (item.customerName) {
          const customer = customers.find(c => c.nama === item.customerName);
          if (customer) return { nama: customer.nama, phone: customer.phone, phoneCode: customer.phoneCode, email: customer.email };
      }
      return null;
  };

  const savePayment = () => {
      if (!currentTrx.paymentStatus) {
          setConfirmModal({
              isOpen: true,
              type: 'info',
              title: 'Peringatan',
              message: 'Harap pilih Status Pembayaran',
              onConfirm: () => setConfirmModal(null)
          });
          return;
      }
      
      setConfirmModal({
          isOpen: true,
          title: 'Konfirmasi Pembayaran',
          message: 'Apakah Anda yakin ingin menyimpan data pembayaran ini?',
          type: 'info',
          onConfirm: () => {
              let updatedTrx: any = null;
              setTransactions(prev => prev.map(t => {
                  if (t.id === currentTrx.id) {
                      const workflowStatuses = ['Selesai', 'Progress', 'Batal', 'Pengiriman', 'Payment', 'Penawaran'];
                      const filteredStatuses = (t.statuses || []).filter(s => !workflowStatuses.includes(s));
                      
                      const now = new Date().toLocaleString('id-ID');
                      const actionUserName = currentUser?.nama || 'Unknown';
                      const actionUserRole = currentUser?.role || 'Admin';
                      const changes: string[] = [];
                      if (t.paymentStatus !== currentTrx.paymentStatus) changes.push(`Payment Status: ${t.paymentStatus || '-'} → ${currentTrx.paymentStatus}`);
                      if (t.pembayaranDiterima !== currentTrx.pembayaranDiterima) changes.push(`Payment Received: ${t.pembayaranDiterima || 0} → ${currentTrx.pembayaranDiterima}`);
                      
                      const newHistory: EditLog[] = [...(t.editHistory || [])];
                      if (changes.length > 0) {
                          newHistory.push({
                              timestamp: now,
                              user: actionUserName,
                              role: actionUserRole,
                              changes: changes.join(', '),
                              type: 'Transaction',
                              id: t.id
                          });
                      }

                      const newPaymentHistory = [...(t.paymentHistory || [])];
                      if (additionalPayment > 0) {
                          newPaymentHistory.push({
                              tanggal: new Date().toISOString().split('T')[0],
                              jumlah: additionalPayment,
                              keterangan: 'Pembayaran Tambahan'
                          });
                      } else if (currentTrx.paymentStatus === 'Lunas' && t.paymentStatus !== 'Lunas') {
                          const amount = t.nilaiProyek - (t.pembayaranDiterima || 0);
                          if (amount > 0) {
                              newPaymentHistory.push({
                                  tanggal: new Date().toISOString().split('T')[0],
                                  jumlah: amount,
                                  keterangan: 'Pelunasan'
                              });
                          }
                      }

                      const newTrx = { 
                          ...t, 
                          status: 'Pengiriman',
                          paymentStatus: currentTrx.paymentStatus,
                          pembayaranDiterima: currentTrx.pembayaranDiterima,
                          sisaPembayaran: currentTrx.sisaPembayaran,
                          jatuhTempo: currentTrx.jatuhTempo,
                          statuses: [...filteredStatuses, 'Pengiriman'],
                          editHistory: newHistory,
                          paymentHistory: newPaymentHistory
                      };
                      updatedTrx = newTrx;
                      return newTrx;
                  }
                  return t;
              }));
              
              if (updatedTrx) {
                  syncToSupabase('transactions', updatedTrx);
              }
              
              setShowDrawer(null);
              // Redirect to Pengiriman as requested
              setActiveView('Pengiriman');
              setConfirmModal(null);
          }
      });
  };

  const [showHistory, setShowHistory] = useState(false);
  const [showProdAbout, setShowProdAbout] = useState(false);

  useEffect(() => {
    if (showDrawer !== 'custDetail') setShowHistory(false);
    if (showDrawer !== 'prodDetail') setShowProdAbout(false);
    if (showDrawer !== 'poDetail') setShowPOHistory(false);
    if (showDrawer !== 'trxDetail') setShowActivityLog(false);
  }, [showDrawer]);

  // CRUD Save Functions
  const confirmAction = (title: string, message: string, action: () => void, type: 'info' | 'danger' | 'warning' = 'info') => {
      setConfirmModal({
          isOpen: true,
          title,
          message,
          type,
          onConfirm: () => {
              action();
              setConfirmModal(null);
          }
      });
  };

  const handleConvertQuotation = (t: Transaction) => {
      const updatedItems = t.items?.map(it => {
          const p = products.find(prod => (it.produkId && prod.id === it.produkId) || prod.nama === it.nama);
          if (p) {
              const latestPrice = getProductPrice(p);
              return { ...it, harga: latestPrice };
          }
          return it;
      }) || [];

      let subtotal = 0;
      updatedItems.forEach(i => {
          subtotal += (i.harga * i.qty) - (i.diskon || 0);
      });
      const totalAfterPpn = t.ppn ? subtotal + (subtotal * 0.11) : subtotal;
      const nilaiProyek = t.ongkir ? totalAfterPpn + (t.biayaOngkir || 0) : totalAfterPpn;

      const updatedTrx = { 
          ...t, 
          items: updatedItems,
          nilaiProyek,
          sisaPembayaran: nilaiProyek,
          status: 'Invoice' as const, 
          statuses: ['Invoice'],
          noTrx: t.noTrx?.startsWith('PNW-') ? generateInvoiceNumber() : t.noTrx,
          tanggal: new Date().toISOString().split('T')[0]
      };
      
      setCurrentTrx(updatedTrx as Transaction);
      setShowDrawer('trx');
      setActiveView('Invoice');
  };

  const saveTransaction = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Simpan',
      message: 'Apakah Anda yakin ingin menyimpan data transaksi ini?',
      type: 'info',
      onConfirm: () => {
        if (!currentTrx.customerName || (currentTrx.status !== 'Penawaran' && !currentTrx.items?.length)) {
            setConfirmModal(null);
            alert("Harap isi Nama Customer dan Item Transaksi");
            return;
        }

        // Stock Validation
        if (currentTrx.status !== 'Penawaran') {
            const insufficientStockItems = currentTrx.items?.filter(item => {
                const totalStock = getAvailableStock(item.nama);
                return item.qty > totalStock;
            });

            if (insufficientStockItems && insufficientStockItems.length > 0) {
                setConfirmModal(null);
                const itemNames = insufficientStockItems.map(i => i.nama).join(', ');
                alert(`Stok tidak mencukupi untuk item: ${itemNames}. Harap sesuaikan kuantitas.`);
                return;
            }
        }

        if (!currentTrx.sales) {
            setConfirmModal(null);
            alert("Harap pilih Sales");
            return;
        }
        
        let finalNoTrx = currentTrx.noTrx || generateInvoiceNumber();
        
        // If converting from Penawaran to Progress, and it still has PNW prefix, regenerate
        const oldTrx = transactions.find(t => t.id === currentTrx.id);
        if (oldTrx && oldTrx.status === 'Penawaran' && currentTrx.status === 'Progress' && finalNoTrx.startsWith('PNW-')) {
            finalNoTrx = generateInvoiceNumber();
        }

        const now = new Date().toLocaleString('id-ID');
        const actionUserName = currentUser?.nama || "Unknown";
        const actionUserRole = currentUser?.role || "Admin";
        const changes: string[] = [];

        if (oldTrx) {
            const fieldsToTrack: (keyof Transaction)[] = ['customerName', 'tanggal', 'status', 'sales', 'keterangan', 'ppn', 'ongkir', 'biayaOngkir', 'jasaKirim', 'noResi'];
            fieldsToTrack.forEach(field => {
                if (oldTrx[field] !== (currentTrx as any)[field]) {
                    changes.push(`${field}: ${oldTrx[field] || '-'} → ${(currentTrx as any)[field] || '-'}`);
                }
            });
            
            if (JSON.stringify(oldTrx.items) !== JSON.stringify(currentTrx.items)) {
                changes.push(`items: Updated items list`);
            }
        } else {
            changes.push(`Created new transaction: ${finalNoTrx}`);
        }

        const newHistory: EditLog[] = [...(oldTrx?.editHistory || [])];
        if (changes.length > 0) {
            newHistory.push({
                timestamp: now,
                user: actionUserName,
                role: actionUserRole,
                changes: changes.join(', '),
                type: 'Transaction',
                id: currentTrx.id || finalNoTrx
            });
        }

        const newTrx = { 
            ...currentTrx, 
            jasaKirim: currentTrx.jasaKirim === 'Lainnya' ? (currentTrx.customJasaKirim || 'Lainnya') : currentTrx.jasaKirim,
            id: currentTrx.id || Date.now().toString(), 
            noTrx: finalNoTrx, 
            nilaiProyek: trxCalculations.grandTotal,
            pembayaranDiterima: currentTrx.pembayaranDiterima || 0,
            sisaPembayaran: trxCalculations.grandTotal - (currentTrx.pembayaranDiterima || 0),
            paymentStatus: currentTrx.paymentStatus || (currentTrx.status === 'Selesai' ? 'Lunas' : 'Belum Lunas'),
            editHistory: newHistory,
            companyId: activeCompanyId
        } as Transaction;
        setTransactions(prev => {
            const result = currentTrx.id ? prev.map(t => t.id === newTrx.id ? newTrx : t) : [newTrx, ...prev];
            syncToSupabase('transactions', newTrx);
            return result;
        });
        logUserAction(currentTrx.id ? 'UPDATE' : 'CREATE', `${currentTrx.id ? 'Mengubah' : 'Membuat'} transaksi ${newTrx.noTrx}`, 'Transaction');
        if (newTrx.status === 'Invoice') {
            setActiveView('Invoice');
        }
        setShowDrawer(null);
        setConfirmModal(null);
      }
    });
  };

  const saveResi = () => {
     if(!currentTrx.noResi) {
         alert("Harap isi Nomor Resi");
         return;
     }
     setConfirmModal({
         isOpen: true,
         title: 'Konfirmasi Resi',
         message: 'Apakah Anda yakin ingin menyimpan nomor resi ini?',
         type: 'info',
         onConfirm: () => {
             updateTransactionStatus(currentTrx.id!, 'Pengiriman', { noResi: currentTrx.noResi });
             setShowDrawer(null);
             setConfirmModal(null);
         }
     });
  }

  const saveCustomer = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Simpan',
      message: 'Apakah Anda yakin ingin menyimpan data kontak ini?',
      type: 'info',
      onConfirm: () => {
        try {
            if (!currentCust.nama) {
                setConfirmModal(null);
                alert("Harap isi Nama Kontak");
                return;
            }
            
            const now = new Date().toLocaleString('id-ID');
            const actionUserName = currentUser?.nama || "Unknown";
            const actionUserRole = currentUser?.role || "Admin";
            
            // Ensure all required fields are present
            const baseCust = {
                nama: currentCust.nama || '',
                jenis: currentCust.jenis || 'Perusahaan',
                phone: currentCust.phone || '',
                phoneCode: currentCust.phoneCode || '+62',
                email: currentCust.email || '',
                alamat: currentCust.alamat || '',
                sales: currentCust.sales || 'Angel',
                leadType: currentCust.leadType || 'Belum Transaksi',
                source: currentCust.source || 'Organic',
                npwp: currentCust.npwp || '',
                keterangan: currentCust.keterangan || '',
                negara: currentCust.negara || 'Indonesia',
            };

            let newCust: Customer;
            
            if (currentCust.id) {
                // Find existing customer to compare changes
                const existingCust = customers.find(c => c.id === currentCust.id);
                const changes: string[] = [];
                
                if (existingCust) {
                    const fieldsToTrack: (keyof Customer)[] = ['nama', 'jenis', 'phone', 'email', 'alamat', 'sales', 'leadType', 'source', 'npwp', 'keterangan', 'negara'];
                    fieldsToTrack.forEach(field => {
                        if (existingCust[field] !== (currentCust as any)[field]) {
                            changes.push(`${field}: ${existingCust[field] || '-'} → ${(currentCust as any)[field] || '-'}`);
                        }
                    });
                }
                
                const newHistory: EditLog[] = [...(existingCust?.editHistory || [])];
                if (changes.length > 0) {
                    newHistory.push({
                        timestamp: now,
                        user: actionUserName,
                        role: actionUserRole,
                        changes: changes.join(', '),
                        type: 'Customer',
                        id: currentCust.id || 'new'
                    });
                }
                
                newCust = { ...existingCust, ...baseCust, editHistory: newHistory } as Customer;
            } else {
                newCust = { 
                    ...baseCust, 
                    id: Date.now().toString(), 
                    kode: currentCust.kode || `CUST-${customers.length + 1}`,
                    companyId: activeCompanyId,
                    editHistory: [{
                        timestamp: now,
                        user: actionUserName,
                        role: actionUserRole,
                        changes: "Kontak dibuat",
                        type: 'Customer',
                        id: 'new'
                    }]
                } as Customer;
            }

            setCustomers(prev => {
                const result = currentCust.id ? prev.map(c => c.id === newCust.id ? newCust : c) : [...prev, newCust];
                syncToSupabase('customers', newCust);
                return result;
            });
            setShowDrawer(null);
            setConfirmModal(null);
        } catch (error) {
            console.error("Error saving customer:", error);
            setConfirmModal(null);
        }
      }
    });
  };

  const saveProduct = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Simpan',
      message: 'Apakah Anda yakin ingin menyimpan data produk ini?',
      type: 'info',
      onConfirm: () => {
        if (!currentProd.nama) {
            setConfirmModal(null);
            alert("Harap isi Nama Produk");
            return;
        }
        
        // Check if adding initial stock, supplier is mandatory
        if (tempStock.stock > 0 && !tempStock.supplierId) {
            setConfirmModal(null);
            alert("Harap pilih Supplier untuk stok awal");
            return;
        }

        const now = new Date().toLocaleString('id-ID');
        const actionUserName = currentUser?.nama || 'Unknown';
        const actionUserRole = currentUser?.role || 'Admin';
        const existingProd = products.find(p => p.id === currentProd.id);
        const kodeOtomatis = currentProd.kode || existingProd?.kode || generateProductCode();
        
        let newProd: Product;

        if (existingProd) {
            const changes: string[] = [];
            const fieldsToTrack: (keyof Product)[] = ['nama', 'satuan', 'berat', 'panjang', 'lebar', 'tinggi', 'specifications', 'mainFunction', 'mainApplication', 'remarks'];
            
            fieldsToTrack.forEach(field => {
                if (existingProd[field] !== (currentProd as any)[field]) {
                    changes.push(`${field}: ${existingProd[field] || '-'} → ${(currentProd as any)[field] || '-'}`);
                }
            });

            // Track price changes
            const oldPrice = getProductPrice(existingProd);
            if (oldPrice !== tempStock.hargaJual) {
                changes.push(`Harga Jual: ${formatRupiah(oldPrice)} → ${formatRupiah(tempStock.hargaJual)}`);
            }
            const oldHPP = getProductHPP(existingProd);
            if (oldHPP !== tempStock.hpp) {
                changes.push(`HPP: ${formatRupiah(oldHPP)} → ${formatRupiah(tempStock.hpp)}`);
            }

            // Track stock additions
            if (tempStock.stock > 0) {
                const supp = suppliers.find(s => s.id === tempStock.supplierId);
                changes.push(`Tambah Stok: ${tempStock.stock} ${currentProd.satuan || existingProd.satuan} dari ${supp?.nama || 'Unknown'}`);
            }

            const newHistory: EditLog[] = [...(existingProd.editHistory || [])];
            if (changes.length > 0) {
                newHistory.push({
                    timestamp: now,
                    user: actionUserName,
                    role: actionUserRole,
                    changes: changes.join(', '),
                    type: 'Product',
                    id: currentProd.id || 'new'
                });
            }
            
            newProd = { ...existingProd, ...currentProd, kode: kodeOtomatis, editHistory: newHistory } as Product;
        } else {
            newProd = { 
                ...currentProd, 
                kode: kodeOtomatis, 
                id: Date.now().toString(), 
                lots: [],
                companyId: activeCompanyId,
                editHistory: [{
                    timestamp: now,
                    user: actionUserName,
                    role: actionUserRole,
                    changes: "Produk dibuat",
                    type: 'Product',
                    id: 'new'
                }]
            } as Product;
        }

        if (tempStock.stock > 0) {
            const supp = suppliers.find(s => s.id === tempStock.supplierId);
            const lotKode = `${newProd.kode}-${supp?.kode || '000'}`;
            const newLot: ProductLot = { 
                lot: Date.now(), kode: lotKode, supplierId: tempStock.supplierId || '', 
                stock: tempStock.stock || 0, hpp: tempStock.hpp || 0, hargaJual: tempStock.hargaJual || 0, 
                tanggal: new Date().toISOString() 
            };
            newProd.lots = [...newProd.lots, newLot];
        } else if (newProd.lots.length > 0) {
            // Update latest lot with tempStock values
            const updatedLots = [...newProd.lots];
            const lastIdx = updatedLots.length - 1;
            updatedLots[lastIdx] = {
                ...updatedLots[lastIdx],
                hargaJual: tempStock.hargaJual,
                hpp: tempStock.hpp || updatedLots[lastIdx].hpp
            };
            newProd.lots = updatedLots;
        } else {
            // No lots yet, create a default lot
            const lotKode = `${newProd.kode}-000`;
            const newLot: ProductLot = { 
                lot: Date.now(), kode: lotKode, supplierId: '', 
                stock: 0, hpp: tempStock.hpp || 0, hargaJual: tempStock.hargaJual || 0, 
                tanggal: new Date().toISOString() 
            };
            newProd.lots = [newLot];
        }

        // Always sync direct stok, hargaJual, hpp, and supplierId fields
        if (tempStock.hpp > 0) {
            newProd.hpp = tempStock.hpp;
        }
        if (tempStock.hargaJual > 0) {
            newProd.hargaJual = tempStock.hargaJual;
        }
        if (tempStock.supplierId) {
            newProd.supplierId = tempStock.supplierId;
        }
        newProd.stok = newProd.lots.reduce((acc, l) => acc + (l.stock || 0), 0);

        setProducts(prev => {
            const result = currentProd.id ? prev.map(p => p.id === newProd.id ? newProd : p) : [...prev, newProd];
            syncToSupabase('products', newProd);
            return result;
        });
        setShowDrawer(null);
        setTempStock({stock: 0, hpp: 0, hargaJual: 0, supplierId: ''});
        setConfirmModal(null);
      }
    });
  };

  const saveSupplier = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Simpan',
      message: 'Apakah Anda yakin ingin menyimpan data supplier ini?',
      type: 'info',
      onConfirm: () => {
        if (!currentSupp.nama) {
            setConfirmModal(null);
            return;
        }
        const newSupp = { ...currentSupp, kode: currentSupp.kode || generateSupplierCode(), id: currentSupp.id || Date.now().toString(), companyId: activeCompanyId } as Supplier;
        setSuppliers(p => {
            const result = currentSupp.id ? p.map(s => s.id === newSupp.id ? newSupp : s) : [...p, newSupp];
            syncToSupabase('suppliers', newSupp);
            return result;
        });
        setCurrentSupp({});
        setShowDrawer(null); 
        setConfirmModal(null);
      }
    });
  };

  const saveEmployee = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Simpan',
      message: 'Apakah Anda yakin ingin menyimpan data karyawan ini?',
      type: 'info',
      onConfirm: () => {
        if (!currentEmp.nama || !currentEmp.nik) {
            setConfirmModal(null);
            return;
        }
        const newEmp = { ...currentEmp, id: currentEmp.id || Date.now().toString(), companyId: activeCompanyId } as Employee;
        setEmployees(p => currentEmp.id ? p.map(e => e.id === newEmp.id ? newEmp : e) : [...p, newEmp]);
        setCurrentEmp({});
        setShowDrawer(null); 
        setConfirmModal(null);
      }
    });
  };

  const saveAppUser = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Simpan User',
      message: 'Apakah Anda yakin ingin menyimpan data user aplikasi ini?',
      type: 'info',
      onConfirm: () => {
        if (!currentAppUser.nama || !currentAppUser.username || (!currentAppUser.id && !currentAppUser.password)) {
            setConfirmModal(null);
            alert("Harap isi Nama dan Username (serta Password untuk user baru)");
            return;
        }
        const newUser = { 
          ...currentAppUser, 
          id: currentAppUser.id || 'U' + Date.now().toString(),
          createdAt: currentAppUser.createdAt || new Date().toISOString(),
          companyId: activeCompanyId
        } as UserAccount;
        setAppUsers(p => {
            const result = currentAppUser.id ? p.map(u => u.id === newUser.id ? newUser : u) : [...p, newUser];
            syncToSupabase('user_accounts', newUser);
            
            // If editing own profile, update session
            if (currentUser && currentUser.id === newUser.id) {
                console.log('Syncing current session with updated user profile.');
                setCurrentUser(newUser);
                localStorage.setItem('mypanca_current_user', JSON.stringify(newUser));
            }
            
            return result;
        });
        setCurrentAppUser({});
        setShowDrawer(null); 
        setConfirmModal(null);
      }
    });
  };

  const saveCompany = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Simpan Perusahaan',
      message: 'Apakah Anda yakin ingin menyimpan perubahan data perusahaan ini?',
      type: 'info',
      onConfirm: () => {
        if (!currentCompanyEdit.nama) {
            setConfirmModal(null);
            alert("Harap isi Nama Perusahaan");
            return;
        }
        const isEdit = !!currentCompanyEdit.id;
        const newCompany = { 
          ...currentCompanyEdit, 
          id: isEdit ? currentCompanyEdit.id : Date.now().toString()
        } as Company;
        
        setCompanies(prev => {
            const result = isEdit ? prev.map(c => c.id === newCompany.id ? newCompany : c) : [...prev, newCompany];
            syncToSupabase('companies', newCompany);
            return result;
        });
        setShowModal(null);
        setConfirmModal(null);
        setCurrentCompanyEdit({});
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 3000);
      }
    });
  };

  const handleQuickUpdateProduct = async (p: Product, field: 'stock' | 'hargaJual' | 'hpp') => {
    let currentVal = '';
    if (field === 'stock') currentVal = getAvailableStock(p.nama).toString();
    if (field === 'hargaJual') currentVal = getProductPrice(p).toString();
    if (field === 'hpp') currentVal = getProductHPP(p).toString();

    let titleLabel = field === 'stock' ? 'Stok' : field === 'hargaJual' ? 'Harga Jual' : 'HPP';
    const input = prompt(`Update ${titleLabel} untuk ${p.nama}:`, currentVal);
    
    if (input === null || input.trim() === '') return;
    const numValue = parseFloat(input);
    if (isNaN(numValue) || numValue < 0) {
        alert('Nilai tidak valid');
        return;
    }

    const updatedProd = { ...p, lots: [...(p.lots || [])] };
    const date = new Date().toISOString().split('T')[0];
    
    if (updatedProd.lots.length === 0) {
        updatedProd.lots.push({
            id: Date.now().toString(),
            lot: Date.now(),
            kode: 'AUTO',
            supplierId: '',
            stock: 0,
            hpp: 0,
            hargaJual: 0,
            tanggal: date
        });
    }

    const lastLotIndex = updatedProd.lots.length - 1;

    if (field === 'stock') {
        const totalSold = soldQuantities[p.nama] || 0;
        const totalIncoming = updatedProd.lots.reduce((acc, lot) => acc + lot.stock, 0);
        const newIncoming = numValue + totalSold;
        const diff = newIncoming - totalIncoming;
        updatedProd.stok = numValue;
        updatedProd.lots[lastLotIndex].stock += diff;
        if (updatedProd.lots[lastLotIndex].stock < 0) {
            updatedProd.lots[lastLotIndex].stock = 0; // prevent negative lot stock
        }
    } else if (field === 'hargaJual') {
        updatedProd.hargaJual = numValue;
        updatedProd.lots[lastLotIndex].hargaJual = numValue;
    } else if (field === 'hpp') {
        updatedProd.hpp = numValue;
        updatedProd.lots[lastLotIndex].hpp = numValue;
    }

    setProducts(prev => prev.map(prod => prod.id === updatedProd.id ? updatedProd : prod));
    await syncToSupabase('products', updatedProd);
  };

  const getProductPrice = (p: Product) => (p as any).hargaJual ?? (p.lots && p.lots.length > 0 ? p.lots[p.lots.length - 1].hargaJual : 0) ?? 0;
  const getProductHPP = (p: Product) => p.hpp ?? (p.lots && p.lots.length > 0 ? p.lots[p.lots.length - 1].hpp : 0) ?? 0;
  const getSupplierName = (p: Product) => {
      const supId = (p as any).supplierId || (p.lots && p.lots.length > 0 ? p.lots[p.lots.length - 1].supplierId : '');
      if (!supId) return 'No Supplier';
      const s = suppliers.find(sup => sup.id === supId);
      return s ? s.nama : 'Unknown';
  }

  // Shadcn UI Design System Tokens & Base Classes
  const inputClass = "w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-900 dark:focus:border-zinc-100 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-500 shadow-xs";
  const labelClass = "block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wide";
  const thClass = "px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/75 dark:bg-zinc-900/50 select-none whitespace-nowrap";
  const tdClass = "px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-800/60 whitespace-nowrap";
  const getTableRowClass = (i: number, isSelected: boolean = false) =>
    `${i % 2 === 0 ? 'bg-card text-card-foreground' : 'bg-muted/25 text-card-foreground'} hover:bg-muted/60 cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : ''}`;

  if (isInitializing) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-14 h-14 rounded-xl bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 flex items-center justify-center font-bold text-2xl mb-4 shadow-sm">
            MP
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-1 text-zinc-900 dark:text-zinc-50">MYPANCA</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Memuat data dan modul sistem...</p>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-zinc-900 dark:bg-zinc-100 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-zinc-900 dark:bg-zinc-100 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-zinc-900 dark:bg-zinc-100 rounded-full animate-bounce"></div>
          </div>
        </div>
      </div>
    );
  }

  if (isAppRoute) {
    const userPermissions = currentUser ? (roleTemplates[currentUser.role] || ROLE_TEMPLATES[currentUser.role] || []) : [];
    
    return (
      <PancaMobileApp
        currentUser={currentUser ? { username: currentUser.username, role: currentUser.role, nama: currentUser.nama } : null}
        activeCompany={activeCompany}
        transactions={transactions}
        customers={customers}
        products={products}
        suppliers={suppliers}
        purchaseOrders={purchaseOrders}
        employees={employees}
        setCustomers={setCustomers}
        setTransactions={setTransactions}
        syncToSupabase={syncToSupabase}
        onOpenDesktopCRM={handleClosePancaApp}
        onOpenTaskApp={() => setShowTaskApp(true)}
        onLogout={handleLogout}
        rolePermissions={userPermissions}
        qaQuestions={qaQuestions}
      />
    );
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} users={appUsers} dbStatus={dbStatus} dbError={dbError} />;
  }

  if (showTaskApp && currentUser) {
    return <TaskApp 
      externalUser={{ username: currentUser.username, role: currentUser.role, nama: currentUser.nama }} 
      onBack={currentUser.role === 'engineer' ? handleLogout : () => setShowTaskApp(false)} 
    />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      
      {/* 1. Header Utama (Sleek Modern Shadcn) */}
      <header className="h-14 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0 z-20 sticky top-0 transition-colors">
         <div className="flex items-center gap-3">
             <button 
                onClick={() => setIsMobileMenuOpen(true)} 
                className="lg:hidden p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                aria-label="Buka Menu"
             >
                <Menu size={18}/>
             </button>
             <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 flex items-center justify-center font-bold text-xs shadow-xs">
                 MP
             </div>
             <div className="flex items-center gap-2">
                 <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-zinc-50">MyPanca</span>
             </div>
             
             {/* DB Status Badge */}
             <div className="hidden sm:flex items-center gap-2 ml-2 pl-3 border-l border-zinc-200 dark:border-zinc-800">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                    dbStatus === 'connected' 
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' 
                      : dbStatus === 'error' 
                      ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300' 
                      : 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                        dbStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 
                        dbStatus === 'error' ? 'bg-rose-500 animate-pulse' : 
                        'bg-amber-400 animate-bounce'
                    }`} />
                    {dbStatus === 'connected' ? 'Supabase Sync' : dbStatus === 'error' ? 'Offline' : 'Syncing...'}
                </span>
             </div>

             <button 
                onClick={() => setShowTaskApp(true)}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors shadow-xs"
             >
                <CheckCircle size={13} className="text-zinc-500" />
                <span>Task App</span>
             </button>
         </div>

         <div className="flex items-center gap-2 sm:gap-3 text-zinc-600 dark:text-zinc-300">
             {/* Company Switcher */}
             <div className="relative" ref={companySwitcherRef}>
                 <button 
                    onClick={() => setShowCompanySwitcher(!showCompanySwitcher)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors shadow-xs"
                 >
                     <Store size={14} className="text-zinc-500" />
                     <span className="hidden sm:inline font-medium max-w-[140px] truncate">{activeCompany.nama}</span>
                     <ChevronDown size={12} className={`text-zinc-400 transition-transform duration-200 ${showCompanySwitcher ? 'rotate-180' : ''}`} />
                 </button>
                 
                 {showCompanySwitcher && (
                     <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-zinc-950 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 z-[100] animate-in fade-in zoom-in-95 duration-100 overflow-hidden text-zinc-800 dark:text-zinc-200">
                         <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                             <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Perusahaan Aktif</span>
                         </div>
                         <div className="max-h-60 overflow-y-auto p-1">
                            {getAccessibleCompanies.map((comp) => (
                                <div 
                                    key={comp.id}
                                    onClick={() => {
                                        setActiveCompanyId(comp.id);
                                        setShowCompanySwitcher(false);
                                    }}
                                    className={`px-3 py-2.5 rounded-md cursor-pointer flex items-center justify-between transition-colors ${activeCompanyId === comp.id ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400'}`}
                                >
                                    <div className="flex flex-col truncate pr-2">
                                        <span className="text-xs truncate">{comp.nama}</span>
                                        <span className="text-[10px] text-zinc-400 font-mono truncate">{comp.email}</span>
                                    </div>
                                    {activeCompanyId === comp.id && <Check size={14} className="text-zinc-900 dark:text-zinc-100 shrink-0" />}
                                </div>
                            ))}
                         </div>
                         {currentUser?.role === 'superadmin' && (
                             <div 
                                onClick={() => { setActiveView('Pengaturan Perusahaan'); activateTab('#Pengaturan Perusahaan'); setActiveModule('Control Panel'); setShowCompanySwitcher(false); }}
                                className="p-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                             >
                                 <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-center gap-1.5">
                                     <Plus size={13} /> Kelola Perusahaan
                                 </span>
                             </div>
                         )}
                     </div>
                 )}
             </div>

             {/* Theme Toggle Button */}
             <button 
               onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
               className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
               title={theme === 'dark' ? 'Ganti ke Tema Terang' : 'Ganti ke Tema Gelap'}
               aria-label="Toggle theme"
             >
               {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
             </button>

             {/* Notification Bell */}
             <button 
               onClick={() => {
                 setActiveView('Log User');
                 activateTab('#Log User');
                 setActiveModule('Control Panel');
               }}
               className="relative p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
               title="Riwayat Audit & Log"
             >
               <Bell size={16} />
             </button>

             {/* User Avatar & Menu */}
             <div className="flex items-center gap-2 pl-2 border-l border-zinc-200 dark:border-zinc-800">
                 <div className="w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 flex items-center justify-center text-xs font-semibold uppercase">
                    {(currentUser?.nama || 'SA').split(' ').map(n => n[0]).join('').slice(0, 2)}
                 </div>
                 <div className="hidden lg:flex flex-col items-start leading-tight">
                     <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[100px]">{currentUser?.nama || 'Super Admin'}</span>
                     <span className="text-[10px] text-zinc-400 uppercase font-medium">{currentUser?.role || 'admin'}</span>
                 </div>
                 <button 
                   onClick={handleLogout} 
                   title="Keluar / Logout" 
                   className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                 >
                    <RotateCcw size={14} />
                 </button>
             </div>
         </div>
      </header>

      {/* 2. Tab Navigation (Shadcn Tabs Rail) */}
      <div ref={topTabsRef} className="h-10 bg-zinc-50/70 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-3 gap-1.5 overflow-x-auto shrink-0 z-10 scrollbar-hide">
          {tabs.map(tab => (
              <TopTab 
                key={tab} 
                label={tab} 
                active={activeTab === tab} 
                onClick={() => handleTabClick(tab)}
                onClose={tabs.length > 1 ? () => setTabs(tabs.filter(t => t !== tab)) : undefined}
              />
          ))}
          <button 
            onClick={() => {
              activateTab('#Dashboard');
              setActiveView('Dashboard');
              setActiveModule('BRM');
            }}
            className="h-8 w-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
            title="Tab Baru"
          >
            <Plus size={14}/>
          </button>
      </div>

      {/* 3. Main Body (Sidebar + Content) */}
      <div className="flex-1 flex overflow-hidden relative">
          
          {/* Mobile Overlay */}
          {isMobileMenuOpen && (
              <div 
                  className="absolute inset-0 bg-black/50 z-30 lg:hidden"
                  onClick={() => setIsMobileMenuOpen(false)}
              ></div>
          )}

          {/* Sidebar */}
          <aside 
            onMouseEnter={() => {
              if (window.innerWidth >= 1024 && !isMobileMenuOpen) {
                setIsSidebarCollapsed(false);
              }
            }}
            onMouseLeave={() => {
              if (window.innerWidth >= 1024 && !isMobileMenuOpen) {
                setIsSidebarCollapsed(true);
              }
            }}
            className={`
              absolute top-0 left-0 bottom-0 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col z-40
              transform transition-all duration-200 ease-in-out shadow-lg lg:shadow-none
              ${isMobileMenuOpen ? 'translate-x-0 w-[240px]' : '-translate-x-full lg:translate-x-0'}
              ${!isMobileMenuOpen && isSidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-[240px]'}
              lg:static lg:shrink-0
            `}
          >
             <div className={`flex items-center px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80 ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'justify-between' : 'justify-center'}`}>
                 {(!isSidebarCollapsed || isMobileMenuOpen) && (
                     <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Navigasi</span>
                 )}
                 <button 
                    onClick={() => isMobileMenuOpen ? setIsMobileMenuOpen(false) : setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className={`p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors ${(!isSidebarCollapsed || isMobileMenuOpen) ? '' : 'w-full flex justify-center'}`}
                    title={isSidebarCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
                 >
                    {isMobileMenuOpen ? <X size={18}/> : (isSidebarCollapsed ? <Menu size={18}/> : <ChevronLeft size={16}/>)}
                 </button>
             </div>
             
             {/* Accordion Menu */}
             <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
                {/* Tombol Task App di Sidebar Menu (Khusus Mobile & Akses Cepat) */}
                <div className="px-2 mb-2.5">
                    <button
                       onClick={() => {
                           setShowTaskApp(true);
                           if (window.innerWidth < 1024) setIsMobileMenuOpen(false);
                       }}
                       className={`w-full py-2.5 px-3 rounded-lg cursor-pointer transition-all flex items-center text-xs font-semibold ${
                           (!isSidebarCollapsed || isMobileMenuOpen) ? 'gap-2.5 justify-start' : 'justify-center px-0'
                       } bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white shadow-xs active:scale-[0.98] group`}
                       title="Buka Task App"
                    >
                        <CheckCircle size={16} className="text-emerald-400 dark:text-emerald-600 shrink-0 group-hover:scale-110 transition-transform" />
                        {(!isSidebarCollapsed || isMobileMenuOpen) && (
                            <div className="flex items-center justify-between flex-1 min-w-0">
                                <span className="truncate">Task App</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 dark:bg-zinc-200 text-zinc-300 dark:text-zinc-700 font-medium ml-1">Proyek</span>
                            </div>
                        )}
                    </button>
                </div>

                {MENU_STRUCTURE.filter(menu => {
                    const isAdminCategory = ['Admin', 'Control Panel'].includes(menu.category);
                    if (isAdminCategory && currentUser?.role !== 'superadmin') return false;
                    if (menu.category === 'HR' && currentUser?.role !== 'superadmin' && currentUser?.role !== 'hr') return false;
                    
                    if (!currentUser) return false;
                    
                    return menu.items.some(item => {
                        const effectiveId = (item as any).permId || item.id;
                        const legacyPerm = currentUser.permissions?.find(p => p.id === item.id);
                        const perm = currentUser.permissions?.find(p => p.id === effectiveId) || legacyPerm;
                        if (perm) return perm.canView;
                        if (currentUser.role === 'superadmin') return true;
                        const roleTpl = roleTemplates[currentUser.role];
                        const rolePerm = roleTpl?.find(p => p.id === effectiveId) || roleTpl?.find(p => p.id === item.id);
                        return rolePerm ? rolePerm.canView : false;
                    });
                }).map((menu) => {
                    const CategoryIcon = (menu as any).icon;
                    const isOpen = openCategory === menu.category;
                    const isExpanded = (!isSidebarCollapsed || isMobileMenuOpen);

                    return (
                    <div key={menu.category} className="mb-1">
                        <div 
                           onClick={() => {
                               if (isSidebarCollapsed && !isMobileMenuOpen) {
                                   setIsSidebarCollapsed(false);
                                   setOpenCategory(menu.category);
                               } else {
                                   setOpenCategory(isOpen ? '' : menu.category);
                               }
                           }}
                           className={`
                               px-3 py-2 mx-1 rounded-md flex items-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group select-none
                               ${isExpanded ? 'justify-between' : 'justify-center'}
                               ${isOpen ? 'bg-zinc-100/80 dark:bg-zinc-900/80 font-semibold' : ''}
                           `}
                           title={menu.category}
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                {CategoryIcon ? (
                                    <CategoryIcon size={18} className={`shrink-0 ${isOpen ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100'}`} />
                                ) : (
                                    <div className="w-2 h-2 rounded-full bg-zinc-400 group-hover:bg-violet-500 shrink-0"></div>
                                )}
                                {isExpanded && (
                                    <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider truncate">{menu.category}</span>
                                )}
                            </div>
                            
                            {isExpanded && (
                                <ChevronDown 
                                   size={14} 
                                   className={`text-zinc-400 dark:text-zinc-500 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-violet-600 dark:text-violet-400' : ''}`}
                               />
                            )}
                        </div>

                        {/* Sub Menu Items - Without icons as requested */}
                        <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                            {menu.items.filter(item => {
                                if (!currentUser) return false;
                                const effectiveId = (item as any).permId || item.id;
                                const legacyPerm = currentUser.permissions?.find(p => p.id === item.id);
                                const perm = currentUser.permissions?.find(p => p.id === effectiveId) || legacyPerm;
                                if (perm) return perm.canView;
                                if (currentUser.role === 'superadmin') return true;
                                const roleTpl = roleTemplates[currentUser.role];
                                const rolePerm = roleTpl?.find(p => p.id === effectiveId);
                                return rolePerm ? rolePerm.canView : false;
                            }).map((item) => {
                                const isSelected = activeView === item.id;
                                return (
                                    <div 
                                       key={item.id}
                                       onClick={() => {
                                           handleNavClick(menu.category, item.id);
                                           if (window.innerWidth < 1024) setIsMobileMenuOpen(false);
                                       }}
                                       className={`
                                           my-0.5 mx-1 py-1.5 px-3 rounded-md cursor-pointer transition-colors flex items-center text-xs font-medium select-none
                                           ${isExpanded ? 'pl-8' : 'justify-center px-1'}
                                           ${isSelected 
                                               ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 shadow-xs font-semibold' 
                                               : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'}
                                       `}
                                       title={item.label}
                                    >
                                        {isExpanded ? (
                                            <span className="truncate">{item.label}</span>
                                        ) : (
                                            <span className="text-sm font-black leading-none">•</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    );
                })}
                
                <div className="mt-4 mb-6 border-t border-slate-200 dark:border-zinc-800 pt-4 px-1">
                    <div className="mb-2">
                         <h3 className={`font-black uppercase text-slate-400 dark:text-zinc-500 tracking-widest ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'px-3 text-[10px]' : 'text-[8px] text-center'}`}>
                             {(!isSidebarCollapsed || isMobileMenuOpen) ? 'APLIKASI & PANDUAN' : 'APPS'}
                         </h3>
                    </div>
                    <div className="flex flex-col space-y-1">
                        <button 
                           onClick={() => {
                               setShowTaskApp(true);
                               if (window.innerWidth < 1024) setIsMobileMenuOpen(false);
                           }}
                           className={`w-full py-2 px-2.5 rounded-md cursor-pointer transition-colors flex items-center text-xs font-medium text-left ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'gap-2.5' : 'justify-center px-0'} text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100`}
                           title="Buka Task App"
                        >
                            <CheckCircle size={15} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                            {(!isSidebarCollapsed || isMobileMenuOpen) && (
                                <span className="truncate">Task App</span>
                            )}
                        </button>
                        <button 
                           onClick={() => {
                               setActiveView('Tutorial');
                               if (window.innerWidth < 1024) setIsMobileMenuOpen(false);
                           }}
                           className={`w-full py-2 px-2.5 rounded-md cursor-pointer transition-colors flex items-center text-xs font-medium text-left ${(!isSidebarCollapsed || isMobileMenuOpen) ? 'gap-2.5' : 'justify-center px-0'} ${activeView === 'Tutorial' ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 shadow-xs' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
                           title="Tutorial & Panduan"
                        >
                            <BookOpen size={15} className={activeView === 'Tutorial' ? 'text-zinc-50 dark:text-zinc-900' : 'text-zinc-400 dark:text-zinc-500'} />
                            {(!isSidebarCollapsed || isMobileMenuOpen) && (
                                <span className="truncate">Panduan Sistem</span>
                            )}
                        </button>
                    </div>
                </div>
             </div>
          </aside>

          {/* Main Area */}
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
             {/* Subheader / Filter Bar */}
             {activeView !== 'Dashboard' && activeView !== 'Tutorial' && activeView !== 'Log User' && activeView !== 'Perusahaan' && activeView !== 'AI Assistant' && activeView !== 'Task Management' && activeView !== 'KPI' && !['WA Chat', 'WA Setting AI', 'WA Perangkat', 'WhatsApp'].includes(activeView) && (
                <div className="bg-card/70 backdrop-blur-xs border-b border-border px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                            <input 
                                type="text"
                                placeholder={`Cari di ${activeView}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-background border border-input rounded-md pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                            />
                            {searchTerm && (
                                <button 
                                   onClick={() => setSearchTerm('')}
                                   className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                   <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Filter Toggle Button for Penawaran, Transaksi, and related views */}
                        {isTransactionOrPenawaranView && (
                            <button
                                onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
                                    isFilterExpanded || hasActiveTransactionFilters
                                        ? 'bg-violet-600 text-white border-violet-600 shadow-xs ring-1 ring-violet-500/20'
                                        : 'bg-background hover:bg-accent text-foreground border-input'
                                }`}
                                title={isFilterExpanded ? 'Tutup Filter' : 'Buka Filter'}
                            >
                                <Filter size={13} className={isFilterExpanded || hasActiveTransactionFilters ? 'text-white' : 'text-muted-foreground'} />
                                <span>Filter</span>
                                {activeTransactionFiltersCount > 0 && (
                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                        isFilterExpanded || hasActiveTransactionFilters ? 'bg-white text-violet-700' : 'bg-primary text-primary-foreground'
                                    }`}>
                                        {activeTransactionFiltersCount}
                                    </span>
                                )}
                                <ChevronDown size={13} className={`transition-transform duration-200 ${isFilterExpanded ? 'rotate-180' : ''}`} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Horizontal Scroll Controls for List Containers */}
                        <div className="flex items-center gap-1 border border-border rounded-md px-2 py-1 bg-card text-card-foreground shadow-2xs text-xs">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-0.5 hidden sm:inline">Geser:</span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (mainTableRef.current) {
                                        mainTableRef.current.scrollBy({ left: -300, behavior: 'smooth' });
                                    }
                                }}
                                className="p-1 rounded hover:bg-accent text-foreground transition-colors cursor-pointer flex items-center justify-center active:scale-95"
                                title="Geser Kiri (Scroll Left)"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (mainTableRef.current) {
                                        mainTableRef.current.scrollBy({ left: 300, behavior: 'smooth' });
                                    }
                                }}
                                className="p-1 rounded hover:bg-accent text-foreground transition-colors cursor-pointer flex items-center justify-center active:scale-95"
                                title="Geser Kanan (Scroll Right)"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        {/* Grid/List Toggle */}
                         <button 
                            onClick={() => setIsCardView(!isCardView)} 
                            className={`p-2 rounded border ${isCardView ? 'bg-slate-200 text-slate-800 border-slate-300' : 'text-slate-400 border-slate-200 hover:bg-slate-50'}`}
                            title="Toggle View"
                         >
                            {isCardView ? <List size={18}/> : <LayoutGrid size={18}/>}
                         </button>

                         {(() => {
                             const showAddActions = ['Contacts', 'Produk', 'Suppliers', 'Purchase Orders', 'Procurement', 'Employees', 'Users', 'Access Control', 'Penawaran'].includes(activeView) && canEditCurrentView;
                             const showImportTrx = ['Transaksi', 'Penawaran', 'Invoice', 'Pembayaran', 'Belum Lunas', 'Pengiriman', 'Pesanan Selesai', 'Pesanan Batal'].includes(activeView as string) && currentUser?.role === 'superadmin';
                             const showImportOther = ['Users', 'Contacts', 'Produk'].includes(activeView) && currentUser?.role === 'superadmin';
                             
                             if (!showAddActions && !showImportTrx && !showImportOther) return null;
                             
                             return (
                                 <div className="flex gap-2">
                                 {showAddActions && activeView === 'Access Control' && (
                                     <button 
                                         onClick={() => setShowDrawer('setupRole')}
                                         className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                                     >
                                         <ShieldCheck size={14} />
                                         <span className="hidden md:inline">Setup Role Template</span>
                                         <span className="md:hidden">Role</span>
                                     </button>
                                 )}
                                 {showAddActions && activeView !== 'Access Control' && (
                                     <button 
                                        onClick={() => {
                                            if(activeView === 'Contacts') { setCurrentCust({jenis: 'Perusahaan', leadType: 'Belum Transaksi', source: 'Organic', sales: salesMembers[0] || 'Admin', negara: 'Indonesia', phone: '', phoneCode: '+62'} as any); setShowDrawer('cust'); }
                                            else if(activeView === 'Produk') { setCurrentProd({satuan:'Pcs', kode: generateProductCode()} as any); setTempStock({stock:0, hpp:0, hargaJual:0, supplierId:''}); setShowDrawer('prod'); }
                                            else if(activeView === 'Suppliers') { setCurrentSupp({} as any); setShowDrawer('supp'); }
                                            else if(activeView === 'Purchase Orders' || activeView === 'Procurement') { 
                                                setCurrentPO({ 
                                                    status: activeModule === 'Stocklist' ? 'Lunas' : 'Process', 
                                                    tanggalPembelian: new Date().toISOString().split('T')[0], 
                                                    tanggalDiterima: activeModule === 'Stocklist' ? new Date().toISOString().split('T')[0] : undefined,
                                                    items: [],
                                                    orderedBy: ''
                                                } as any); 
                                                setShowDrawer('po'); 
                                            }
                                            else if(activeView === 'Employees') { setCurrentEmp({} as any); setShowDrawer('emp'); }
                                            else if(activeView === 'Users') { setCurrentAppUser({role: 'admin'} as any); setShowDrawer('appUser'); }
                                            else if(['Penawaran'].includes(activeView)) { 
                                                setCurrentTrx({ 
                                                    items: [], 
                                                    status: 'Penawaran', 
                                                    statuses: ['Penawaran'],
                                                    tanggal: new Date().toISOString().split('T')[0], 
                                                    ppn: true, 
                                                    ongkir: false, 
                                                    biayaOngkir: 0, 
                                                    sales: salesMembers[0] || 'Admin', 
                                                    jasaKirim: 'JNE Regular',
                                                    noTrx: `PNW-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`
                                                } as any); 
                                                setShowDrawer('trx'); 
                                            }
                                        }}
                                        className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900 text-xs font-medium px-3.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer active:scale-[0.98]"
                                      >
                                         <Plus size={14} />
                                         <span className="hidden md:inline">Tambah {activeView === 'Users' ? 'User' : activeView === 'Contacts' ? 'Kontak' : activeView === 'Produk' ? 'Produk' : activeView === 'Employees' ? 'Karyawan' : activeView === 'Penawaran' ? 'Penawaran' : 'Data'}</span>
                                         <span className="md:hidden">Add</span>
                                      </button>
                                  )}

                                  {showImportOther && activeView === 'Users' && (
                                      <button 
                                          onClick={() => setShowModal('IMPORT_USER')}
                                          className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                                      >
                                          <UserPlus size={14} />
                                          <span className="hidden md:inline">Import/Copy User</span>
                                          <span className="md:hidden">Import</span>
                                      </button>
                                  )}
                                  {showImportOther && activeView === 'Contacts' && (
                                      <button 
                                          onClick={() => setShowModal('IMPORT_CONTACTS')}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                                      >
                                          <Copy size={14} />
                                          <span className="hidden md:inline">Import Semua Kontak</span>
                                          <span className="md:hidden">Import ALL</span>
                                      </button>
                                  )}
                                  {showImportOther && activeView === 'Produk' && (
                                      <button 
                                          onClick={() => setShowModal('IMPORT_PRODUCT')}
                                          className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                                      >
                                          <Copy size={14} />
                                          <span className="hidden md:inline">Import Produk</span>
                                          <span className="md:hidden">Import ALL</span>
                                      </button>
                                  )}
                                  {showImportTrx && (
                                      <button 
                                          onClick={() => setShowModal('IMPORT_TRANSACTION')}
                                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                                      >
                                          <Copy size={14} />
                                          <span className="hidden md:inline">Import {activeView}</span>
                                          <span className="md:hidden">Import</span>
                                      </button>
                                  )}
                              </div>
                             );
                         })()}
                     </div>
                 </div>
               )}

               {/* Expandable Filter Panel & Active Badges for Penawaran & Transaksi */}
               {isTransactionOrPenawaranView && (
                  <div className="shrink-0">
                      {/* Expandable Panel */}
                      {isFilterExpanded && (
                          <div className="bg-card/95 backdrop-blur-xs border-b border-border px-4 py-3 sm:px-6 shadow-xs">
                              <div className="flex flex-col gap-3">
                                  <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                          <Filter size={14} className="text-violet-600 dark:text-violet-400" />
                                          <span className="text-xs font-bold text-foreground">
                                              Filter Data {activeView}
                                          </span>
                                          {activeTransactionFiltersCount > 0 && (
                                              <span className="text-[11px] font-medium text-muted-foreground">
                                                  ({activeTransactionFiltersCount} filter aktif)
                                              </span>
                                          )}
                                      </div>
                                      <div className="flex items-center gap-3">
                                          {hasActiveTransactionFilters && (
                                              <button
                                                  onClick={() => {
                                                      setFilterSales('');
                                                      setFilterStatus('');
                                                      setFilterMonth('');
                                                      setFilterYear('');
                                                  }}
                                                  className="text-xs font-medium text-destructive hover:underline cursor-pointer flex items-center gap-1 transition-colors"
                                              >
                                                  <RotateCcw size={12} />
                                                  Reset Filter
                                              </button>
                                          )}
                                          <button
                                              onClick={() => setIsFilterExpanded(false)}
                                              className="text-muted-foreground hover:text-foreground text-xs p-1 rounded hover:bg-accent transition-colors cursor-pointer"
                                              title="Tutup Filter"
                                          >
                                              <X size={14} />
                                          </button>
                                      </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                      {/* 1. Filter Sales */}
                                      <div className="space-y-1">
                                          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                              Sales Rep
                                          </label>
                                          <select
                                              value={filterSales}
                                              onChange={(e) => setFilterSales(e.target.value)}
                                              className="w-full text-xs bg-background border border-input rounded-md px-2.5 py-1.5 text-foreground focus:ring-1 focus:ring-ring focus:outline-none transition-colors"
                                          >
                                              <option value="">Semua Sales</option>
                                              {allSalesMembers.map((s) => (
                                                  <option key={s} value={s}>{s}</option>
                                              ))}
                                          </select>
                                      </div>

                                      {/* 2. Filter Status */}
                                      <div className="space-y-1">
                                          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                              Status {activeView === 'Penawaran' ? 'Penawaran' : 'Transaksi'}
                                          </label>
                                          <select
                                              value={filterStatus}
                                              onChange={(e) => setFilterStatus(e.target.value)}
                                              className="w-full text-xs bg-background border border-input rounded-md px-2.5 py-1.5 text-foreground focus:ring-1 focus:ring-ring focus:outline-none transition-colors"
                                          >
                                              <option value="">Semua Status</option>
                                              {activeView === 'Penawaran' ? (
                                                  <>
                                                      <option value="Sudah Follow Up">Sudah Follow Up</option>
                                                      <option value="Belum Follow Up">Belum Follow Up</option>
                                                      <option value="Penawaran">Penawaran Baru</option>
                                                      <option value="Progress">Progress</option>
                                                      <option value="Batal">Batal</option>
                                                  </>
                                              ) : (
                                                  <>
                                                      <option value="Progress">Progress</option>
                                                      <option value="Invoice">Invoice</option>
                                                      <option value="Payment">Pembayaran</option>
                                                      <option value="Pengiriman">Pengiriman</option>
                                                      <option value="Selesai">Pesanan Selesai</option>
                                                      <option value="Batal">Batal</option>
                                                  </>
                                              )}
                                          </select>
                                      </div>

                                      {/* 3. Filter Bulan */}
                                      <div className="space-y-1">
                                          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                              Bulan
                                          </label>
                                          <select
                                              value={filterMonth}
                                              onChange={(e) => setFilterMonth(e.target.value)}
                                              className="w-full text-xs bg-background border border-input rounded-md px-2.5 py-1.5 text-foreground focus:ring-1 focus:ring-ring focus:outline-none transition-colors"
                                          >
                                              <option value="">Semua Bulan</option>
                                              {MONTHS.map((m) => (
                                                  <option key={m.value} value={m.value}>{m.label}</option>
                                              ))}
                                          </select>
                                      </div>

                                      {/* 4. Filter Tahun */}
                                      <div className="space-y-1">
                                          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                              Tahun
                                          </label>
                                          <select
                                              value={filterYear}
                                              onChange={(e) => setFilterYear(e.target.value)}
                                              className="w-full text-xs bg-background border border-input rounded-md px-2.5 py-1.5 text-foreground focus:ring-1 focus:ring-ring focus:outline-none transition-colors"
                                          >
                                              <option value="">Semua Tahun</option>
                                              {availableYears.map((y) => (
                                                  <option key={y} value={y}>{y}</option>
                                              ))}
                                          </select>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* Active Filter Chips (shown whenever any filter is active) */}
                      {hasActiveTransactionFilters && (
                          <div className="bg-muted/40 border-b border-border px-4 py-1.5 flex items-center gap-2 flex-wrap text-xs">
                              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 shrink-0">
                                  <Filter size={11} className="text-violet-600 dark:text-violet-400" /> Filter aktif:
                              </span>
                              {filterSales && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200 dark:border-violet-800 text-[11px]">
                                      Sales: <strong className="font-semibold">{filterSales}</strong>
                                      <button
                                          onClick={() => setFilterSales('')}
                                          className="hover:text-destructive cursor-pointer ml-0.5"
                                          title="Hapus filter sales"
                                      >
                                          <X size={11} />
                                      </button>
                                  </span>
                              )}
                              {filterStatus && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px]">
                                      Status: <strong className="font-semibold">{filterStatus}</strong>
                                      <button
                                          onClick={() => setFilterStatus('')}
                                          className="hover:text-destructive cursor-pointer ml-0.5"
                                          title="Hapus filter status"
                                      >
                                          <X size={11} />
                                      </button>
                                  </span>
                              )}
                              {filterMonth && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px]">
                                      Bulan: <strong className="font-semibold">{MONTHS.find(m => m.value === filterMonth)?.label || filterMonth}</strong>
                                      <button
                                          onClick={() => setFilterMonth('')}
                                          className="hover:text-destructive cursor-pointer ml-0.5"
                                          title="Hapus filter bulan"
                                      >
                                          <X size={11} />
                                      </button>
                                  </span>
                              )}
                              {filterYear && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px]">
                                      Tahun: <strong className="font-semibold">{filterYear}</strong>
                                      <button
                                          onClick={() => setFilterYear('')}
                                          className="hover:text-destructive cursor-pointer ml-0.5"
                                          title="Hapus filter tahun"
                                      >
                                          <X size={11} />
                                      </button>
                                  </span>
                              )}
                              <button
                                  onClick={() => {
                                      setFilterSales('');
                                      setFilterStatus('');
                                      setFilterMonth('');
                                      setFilterYear('');
                                  }}
                                  className="text-[11px] text-muted-foreground hover:text-destructive hover:underline cursor-pointer ml-auto flex items-center gap-1"
                              >
                                  <RotateCcw size={11} /> Reset Semua
                              </button>
                          </div>
                      )}
                  </div>
               )}

              {/* Main Content Area: Dashboard or Table */}
              <div className="flex-1 overflow-auto bg-zinc-50/60 dark:bg-zinc-950 p-4 sm:p-6">
                  {/* DASHBOARD VIEW */}
                  {activeView === 'Dashboard' ? (() => {
                      const filteredDashboardTrx = transactions.filter(t => {
                          if (t.companyId !== activeCompanyId) return false;
                          const monthMatch = filterMonth ? t.tanggal?.split('-')[1] === filterMonth : true;
                          const yearMatch = filterYear ? t.tanggal?.split('-')[0] === filterYear : true;
                          const salesMatch = filterSales ? t.sales === filterSales : true;
                          return monthMatch && yearMatch && salesMatch;
                      });

                      const topProductsData = (() => {
                          const productSales: Record<string, number> = {};
                          filteredDashboardTrx.filter(t => t.status === 'Selesai' || t.status === 'Lunas' || t.paymentStatus === 'Lunas').forEach(t => {
                              t.items?.forEach(item => {
                                  const itemValue = ((item.qty || 0) * (item.harga || 0)) - (item.diskon || 0);
                                  productSales[item.nama] = (productSales[item.nama] || 0) + itemValue;
                              });
                          });
                          
                          return Object.entries(productSales)
                              .map(([name, value]) => ({ name, value }))
                              .sort((a,b) => b.value - a.value)
                              .slice(0, 5); // top 5
                      })();

                      const salesChartData = (() => {
                          const now = new Date();
                          const aggregated: Record<string, number> = {};
                          
                          if (filterMonth || filterYear) {
                              const periodFiltered = transactions.filter(t => {
                                  if (t.companyId !== activeCompanyId) return false;
                                  // HANYA MENCATAT TRANSAKSI SELESAI / LUNAS
                                  const isCompletedOrPaid = t.status === 'Selesai' || t.status === 'Lunas' || t.paymentStatus === 'Lunas';
                                  if (!isCompletedOrPaid) return false;
                                  if (filterSales && t.sales !== filterSales) return false;
                                  if (filterMonth && t.tanggal?.split('-')[1] !== filterMonth) return false;
                                  if (filterYear && t.tanggal?.split('-')[0] !== filterYear) return false;
                                  return true;
                              });
                              
                              if (filterYear && !filterMonth) {
                                  for (let i = 1; i <= 12; i++) {
                                      const key = `${filterYear}-${i.toString().padStart(2, '0')}`;
                                      aggregated[key] = 0;
                                  }
                              } else if (filterMonth && filterYear) {
                                  const daysInMonth = new Date(parseInt(filterYear), parseInt(filterMonth), 0).getDate();
                                  for (let i = 1; i <= daysInMonth; i++) {
                                      const key = `${filterYear}-${filterMonth}-${i.toString().padStart(2, '0')}`;
                                      aggregated[key] = 0;
                                  }
                              }

                              periodFiltered.forEach(t => {
                                  let key = t.tanggal;
                                  if (filterYear && !filterMonth) {
                                      key = t.tanggal.substring(0, 7); // YYYY-MM
                                  }
                                  aggregated[key] = (aggregated[key] || 0) + (t.nilaiProyek || 0);
                              });

                              return Object.entries(aggregated)
                                  .map(([key, value]) => {
                                      let label = key;
                                      if (filterYear && !filterMonth) {
                                          label = MONTHS.find(m => m.value === key.split('-')[1])?.label || key;
                                      } else {
                                          label = key.split('-').reverse().slice(0, 2).join('/');
                                      }
                                      return { 
                                          tanggal: label,
                                          nilai: value,
                                          rawDate: key
                                      };
                                  })
                                  .sort((a,b) => a.rawDate.localeCompare(b.rawDate));
                          }

                          let startDate = new Date();
                          
                          if (salesPeriod === '7days') {
                              startDate.setDate(now.getDate() - 6);
                              // Initialize last 7 days with 0
                              for (let i = 0; i < 7; i++) {
                                  const d = new Date(startDate);
                                  d.setDate(startDate.getDate() + i);
                                  const key = d.toISOString().split('T')[0];
                                  aggregated[key] = 0;
                              }
                          } else if (salesPeriod === '1month') {
                              startDate.setMonth(now.getMonth() - 1);
                              startDate.setDate(startDate.getDate() + 1);
                              // Initialize last 30 days roughly
                              const temp = new Date(startDate);
                              while (temp <= now) {
                                  const key = temp.toISOString().split('T')[0];
                                  aggregated[key] = 0;
                                  temp.setDate(temp.getDate() + 1);
                              }
                          } else if (salesPeriod === '1year') {
                              startDate.setFullYear(now.getFullYear() - 1);
                              startDate.setMonth(now.getMonth() + 1);
                              // Initialize last 12 months
                              const temp = new Date(startDate);
                              for (let i = 0; i < 12; i++) {
                                  const key = `${temp.getFullYear()}-${(temp.getMonth() + 1).toString().padStart(2, '0')}`;
                                  aggregated[key] = 0;
                                  temp.setMonth(temp.getMonth() + 1);
                              }
                          }

                          const periodFiltered = transactions.filter(t => {
                              if (t.companyId !== activeCompanyId) return false;
                              // HANYA MENCATAT TRANSAKSI SELESAI / LUNAS
                              const isCompletedOrPaid = t.status === 'Selesai' || t.status === 'Lunas' || t.paymentStatus === 'Lunas';
                              if (!isCompletedOrPaid) return false;
                              if (filterSales && t.sales !== filterSales) return false;
                              const trDate = new Date(t.tanggal);
                              const compDate = new Date(startDate);
                              compDate.setHours(0,0,0,0);
                              return trDate >= compDate;
                          });

                          periodFiltered.forEach(t => {
                              let key = t.tanggal;
                              if (salesPeriod === '1year') {
                                  key = t.tanggal.substring(0, 7); // YYYY-MM
                              }
                              if (aggregated[key] !== undefined) {
                                  aggregated[key] += (t.nilaiProyek || 0);
                              } else if (salesPeriod !== '7days' && salesPeriod !== '1month' && salesPeriod !== '1year') {
                                  // Fallback for custom ranges if needed
                                  aggregated[key] = (aggregated[key] || 0) + (t.nilaiProyek || 0);
                              }
                          });

                          return Object.entries(aggregated)
                              .map(([key, value]) => {
                                  let label = key;
                                  if (salesPeriod === '1year') {
                                      label = MONTHS.find(m => m.value === key.split('-')[1])?.label || key;
                                  } else {
                                      label = key.split('-').reverse().slice(0, 2).join('/');
                                  }
                                  return { 
                                      tanggal: label,
                                      nilai: value,
                                      rawDate: key
                                  };
                              })
                              .sort((a,b) => a.rawDate.localeCompare(b.rawDate));
                      })();

                      const filteredSoldQuantities = filteredDashboardTrx
                          .filter(t => ['Pengiriman', 'Selesai'].includes(t.status))
                          .reduce((acc: Record<string, number>, t) => {
                              t.items?.forEach(item => {
                                  acc[item.nama] = (acc[item.nama] || 0) + item.qty;
                              });
                              return acc;
                          }, {});

                      return (
                      <div className="space-y-6">
                          {/* Dashboard Filters */}
                          <div className="grid grid-cols-2 md:flex flex-wrap gap-2 md:gap-4 items-center bg-card p-3 sm:p-4 rounded-xl shadow-xs border border-border">
                              <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-medium text-muted-foreground hidden md:inline">Sales:</span>
                                  <select 
                                      className="text-xs border border-input rounded-md py-1.5 px-2.5 outline-none bg-background text-foreground focus:ring-1 focus:ring-ring transition-all font-medium w-full md:w-auto"
                                      value={filterSales}
                                      onChange={(e) => setFilterSales(e.target.value)}
                                  >
                                      <option value="">Semua Sales</option>
                                      {salesMembers.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                              </div>
                              <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-medium text-muted-foreground hidden md:inline">Bulan:</span>
                                  <select 
                                      className="text-xs border border-input rounded-md py-1.5 px-2.5 outline-none bg-background text-foreground focus:ring-1 focus:ring-ring transition-all font-medium w-full md:w-auto"
                                      value={filterMonth}
                                      onChange={(e) => setFilterMonth(e.target.value)}
                                  >
                                      <option value="">Semua Bulan</option>
                                      {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                  </select>
                              </div>
                              <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-medium text-muted-foreground hidden md:inline">Tahun:</span>
                                  <select 
                                      className="text-xs border border-input rounded-md py-1.5 px-2.5 outline-none bg-background text-foreground focus:ring-1 focus:ring-ring transition-all font-medium w-full md:w-auto"
                                      value={filterYear}
                                      onChange={(e) => setFilterYear(e.target.value)}
                                  >
                                      <option value="">Semua Tahun</option>
                                      {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                                  </select>
                              </div>

                              <button 
                                  onClick={handleAIAnalyze}
                                  className="ml-auto col-span-2 md:col-span-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs py-1.5 px-4 rounded-md shadow-xs transition-colors cursor-pointer active:scale-95"
                              >
                                  <Sparkles size={14} className="text-amber-400" />
                                  <span>Analisa AI</span>
                              </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard 
                                title="Total Omzet (Selesai)" 
                                value={formatRupiah(stats.totalOmzet)} 
                                icon={<Wallet />} 
                                trend={stats.omzetTrend.value}
                                trendType={stats.omzetTrend.type}
                                trendLabel={stats.trendLabel}
                                colorClass="bg-violet-500"
                            />
                             <StatCard 
                                title="Transaksi Aktif" 
                                value={stats.activeTrx.toString()} 
                                icon={<Activity />} 
                                trend={stats.trxTrend.value}
                                trendType={stats.trxTrend.type}
                                trendLabel={stats.trendLabel}
                                colorClass="bg-blue-500"
                            />
                             <StatCard 
                                title="Penawaran Berjalan" 
                                value={stats.ongoingPenawaran.toString()} 
                                icon={<Briefcase />} 
                                trend={stats.penawaranTrend.value}
                                trendType={stats.penawaranTrend.type}
                                trendLabel={stats.trendLabel}
                                colorClass="bg-emerald-500"
                                onClick={() => {
                                  setActiveView('Penawaran');
                                  activateTab('#Penawaran');
                                  setActiveModule('BRM');
                                }}
                                subtext="Lihat Penawaran"
                            />
                            <StatCard 
                                title="Stok Menipis" 
                                value={products.filter(p => (p.companyId === activeCompanyId || p.company_id === activeCompanyId) && getAvailableStock(p.nama) < 10).length.toString()} 
                                icon={<Package />} 
                                trend="0%"
                                trendType="down"
                                colorClass="bg-rose-500"
                            />
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              <div className="lg:col-span-2 bg-white dark:bg-zinc-900/90 p-6 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800">
                                  <div className="flex justify-between items-center mb-8">
                                      <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Sales Overview</h3>
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200/80 dark:border-emerald-800">
                                          Selesai / Lunas
                                        </span>
                                      </div>
                                      {filterMonth || filterYear ? (
                                          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                              <span className="text-[10px] font-bold text-slate-500">Mengikuti Filter Atas</span>
                                          </div>
                                      ) : (
                                          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                              <select 
                                                  value={salesPeriod} 
                                                  onChange={(e) => setSalesPeriod(e.target.value)}
                                                  className="text-[10px] font-bold text-slate-500 bg-transparent border-none focus:outline-none cursor-pointer appearance-none pr-4"
                                                  style={{ WebkitAppearance: 'none', appearance: 'none' }}
                                              >
                                                  <option value="7days">Last 7 Days</option>
                                                  <option value="1month">1 Bulan Terakhir</option>
                                                  <option value="1year">1 Tahun Terakhir</option>
                                              </select>
                                              <ChevronDown size={12} className="text-slate-400 -ml-4 pointer-events-none" />
                                          </div>
                                      )}
                                  </div>
                                  <div className="h-[300px] w-full">
                                      {isMounted && (
                                          <ResponsiveContainer width="100%" height="100%">
                                              <BarChart data={salesChartData}>
                                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                  <XAxis 
                                                      dataKey="tanggal" 
                                                      axisLine={false} 
                                                      tickLine={false} 
                                                      tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }}
                                                      dy={10}
                                                      interval={(!filterMonth && !filterYear && salesPeriod === '7days') ? 0 : 'preserveStartEnd'}
                                                  />
                                                  <YAxis 
                                                      axisLine={false} 
                                                      tickLine={false} 
                                                      tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }}
                                                      tickFormatter={(val) => {
                                                          if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(1)}M`;
                                                          if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(0)}jt`;
                                                          if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`;
                                                          return `Rp ${val}`;
                                                      }}
                                                  />
                                                  <Tooltip 
                                                      cursor={{ fill: '#f1f5f9' }}
                                                      contentStyle={{ 
                                                          borderRadius: '12px', 
                                                          border: 'none', 
                                                          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                                          fontSize: '11px',
                                                          fontWeight: '600'
                                                      }}
                                                      formatter={(value: number) => [formatRupiah(value), 'Nilai Penjualan']}
                                                      labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                                                  />
                                                  <Bar dataKey="nilai" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={30} />
                                              </BarChart>
                                          </ResponsiveContainer>
                                      )}
                                  </div>
                              </div>

                              <div className="bg-white dark:bg-zinc-900/90 p-6 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800 flex flex-col">
                                  <div className="flex justify-between items-center mb-6">
                                      <h3 className="text-sm font-black text-slate-800">Top Produk Terlaris</h3>
                                  </div>
                                  <div className="h-[200px] w-full flex items-center justify-center">
                                      {isMounted && (
                                          <ResponsiveContainer width="100%" height="100%">
                                              <PieChart>
                                                  <Pie
                                                      data={topProductsData}
                                                      cx="50%"
                                                      cy="50%"
                                                      innerRadius={60}
                                                      outerRadius={80}
                                                      paddingAngle={5}
                                                      dataKey="value"
                                                      nameKey="name"
                                                  >
                                                      {topProductsData.map((entry, index) => (
                                                          <Cell key={`cell-${index}`} fill={['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'][index % 7]} />
                                                      ))}
                                                  </Pie>
                                                  <Tooltip formatter={(value: number) => [formatRupiah(value), 'Nilai Penjualan']} />
                                              </PieChart>
                                          </ResponsiveContainer>
                                      )}
                                  </div>
                                  <div className="mt-6 flex flex-col gap-3">
                                      {topProductsData.map((item, i) => {
                                          const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
                                          const total = topProductsData.reduce((acc, curr) => acc + curr.value, 0);
                                          const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;
                                          return (
                                              <div key={i} className="flex items-center justify-between text-xs">
                                                  <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                                                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }}></span>
                                                      <span className="font-bold text-slate-700 truncate">{item.name}</span>
                                                  </div>
                                                  <div className="flex items-center gap-3 shrink-0">
                                                      <span className="text-slate-500 font-medium">{formatRupiah(item.value)}</span>
                                                      <span className="font-black text-slate-800 w-8 text-right">{percent}%</span>
                                                  </div>
                                              </div>
                                          );
                                      })}
                                      {topProductsData.length === 0 && (
                                          <div className="text-center text-xs text-slate-400 font-bold py-4">Belum ada data</div>
                                      )}
                                  </div>
                              </div>
                          </div>

                          {/* Recent Transactions & Products Section */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div className="bg-white dark:bg-zinc-900/90 p-6 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800">
                                  <div className="flex justify-between items-center mb-6">
                                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Recent Transactions</h3>
                                      <button onClick={() => setActiveView('Transaksi')} className="text-[10px] font-black text-violet-600 uppercase tracking-widest hover:text-violet-700">View All</button>
                                  </div>
                                  <div className="overflow-x-auto">
                                      <table className="w-full">
                                          <thead>
                                              <tr className="text-left border-b border-slate-100">
                                                  <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">No. Transaksi</th>
                                                  <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                                  <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Nilai</th>
                                                  <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-50">
                                              {transactions.filter(t => t.companyId === activeCompanyId).slice(-5).reverse().map(t => (
                                                  <tr key={t.id} className="group hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => handleTrxClick(t)}>
                                                      <td className="py-3 text-xs font-bold">
                                                          <div className="text-violet-600">{t.noTrx}</div>
                                                          <div className="text-[10px] text-slate-400">{t.customerName}</div>
                                                      </td>
                                                      <td className="py-3">
                                                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                                              t.status === 'Selesai' ? 'bg-emerald-100 text-emerald-700' :
                                                              t.status === 'Batal' ? 'bg-red-100 text-red-700' :
                                                              'bg-blue-100 text-blue-700'
                                                          }`}>
                                                              {t.status}
                                                          </span>
                                                      </td>
                                                      <td className="py-3 text-xs font-bold text-slate-800 text-right">{formatRupiah(t.nilaiProyek)}</td>
                                                      <td className="py-3 text-right">
                                                          <button 
                                                              onClick={(e) => { e.stopPropagation(); handleTrxClick(t); }}
                                                              className="p-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors"
                                                          >
                                                              <Eye size={14} />
                                                          </button>
                                                      </td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>

                              <div className="bg-white dark:bg-zinc-900/90 p-6 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800">
                                  <div className="flex justify-between items-center mb-6">
                                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Master Produk</h3>
                                      <button onClick={() => setActiveView('Produk')} className="text-[10px] font-black text-violet-600 uppercase tracking-widest hover:text-violet-700">View All</button>
                                  </div>
                                  <div className="overflow-x-auto">
                                      <table className="w-full">
                                          <thead>
                                              <tr className="text-left border-b border-slate-100">
                                                  <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Produk</th>
                                                  <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stok</th>
                                                  <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Harga</th>
                                                  <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-50">
                                              {products.filter(p => p.companyId === activeCompanyId).slice(-5).reverse().map(p => {
                                                  const stock = getAvailableStock(p.nama);
                                                  return (
                                                  <tr key={p.id} className="group hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { setCurrentProd(p); setShowDrawer('prodDetail'); }}>
                                                      <td className="py-3 text-xs font-bold">
                                                          <div className="text-slate-800 line-clamp-1">{p.nama}</div>
                                                          <div className="text-[10px] text-slate-400 font-medium">{p.kode}</div>
                                                      </td>
                                                      <td className="py-3">
                                                          <div className="flex justify-center">
                                                              <div className={`flex flex-col items-center justify-center p-1.5 min-w-[50px] rounded-lg border ${
                                                                  stock < 10 ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-700'
                                                              }`}>
                                                                  <span className="text-xs font-black leading-none">{stock}</span>
                                                                  <span className="text-[8px] font-bold uppercase opacity-60 mt-1">{p.satuan}</span>
                                                              </div>
                                                          </div>
                                                      </td>
                                                      <td className="py-3 text-xs font-bold text-[#A91D3A] text-right whitespace-nowrap">
                                                          {p.lots && p.lots.length > 0 ? formatRupiah(getProductPrice(p)) : 'N/A'}
                                                      </td>
                                                      <td className="py-3 text-right">
                                                          <button 
                                                              onClick={(e) => { e.stopPropagation(); setCurrentProd(p); setShowDrawer('prodDetail'); }}
                                                              className="p-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors"
                                                          >
                                                              <Eye size={14} />
                                                          </button>
                                                      </td>
                                                  </tr>
                                              );})}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>
                          </div>
                      </div>
                      );
                  })() : activeView === 'Dashboard Produk' ? (() => {
                      const filteredDashboardTrx = transactions.filter(t => {
                          if (t.companyId !== activeCompanyId) return false;
                          const monthMatch = filterMonth ? t.tanggal?.split('-')[1] === filterMonth : true;
                          const yearMatch = filterYear ? t.tanggal?.split('-')[0] === filterYear : true;
                          const salesMatch = filterSales ? t.sales === filterSales : true;
                          return monthMatch && yearMatch && salesMatch;
                      });

                      const filteredSoldQuantities = filteredDashboardTrx
                          .filter(t => ['Pengiriman', 'Selesai'].includes(t.status))
                          .reduce((acc: Record<string, number>, t) => {
                              t.items?.forEach(item => {
                                  acc[item.nama] = (acc[item.nama] || 0) + item.qty;
                              });
                              return acc;
                          }, {});

                      return (
                      <div className="space-y-6">
                          {/* Filter Bar for Dashboard Produk */}
                          <div className="bg-white dark:bg-zinc-900/90 p-4 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4">
                              <div className="grid grid-cols-2 md:flex items-center gap-2 md:gap-4 w-full md:w-auto">
                                  <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-500 uppercase hidden md:inline">Sales</span>
                                      <select 
                                          className="text-sm border border-slate-200 rounded-lg py-1.5 px-3 outline-none bg-slate-50 focus:border-violet-600 focus:ring-1 focus:ring-violet-600 transition-all font-bold text-slate-700 w-full md:w-auto"
                                          value={filterSales}
                                          onChange={(e) => setFilterSales(e.target.value)}
                                      >
                                          <option value="">All Sales</option>
                                          {salesMembers.map(s => <option key={s} value={s}>{s}</option>)}
                                      </select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-500 uppercase hidden md:inline">Masa Filter</span>
                                      <div className="grid grid-cols-2 flex-1 md:flex items-center gap-2">
                                          <select 
                                              className="text-sm border border-slate-200 rounded-lg py-1.5 px-3 outline-none bg-slate-50 focus:border-violet-600 focus:ring-1 focus:ring-violet-600 transition-all w-full md:w-auto"
                                              value={filterMonth}
                                              onChange={(e) => setFilterMonth(e.target.value)}
                                          >
                                              <option value="">Semua Bulan</option>
                                              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                          </select>
                                          <select 
                                              className="text-sm border border-slate-200 rounded-lg py-1.5 px-3 outline-none bg-slate-50 focus:border-violet-600 focus:ring-1 focus:ring-violet-600 transition-all w-full md:w-auto"
                                              value={filterYear}
                                              onChange={(e) => setFilterYear(e.target.value)}
                                          >
                                              <option value="">Semua Tahun</option>
                                              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                                          </select>
                                      </div>
                                  </div>
                              </div>
                              <button 
                                  onClick={handleAIAnalyze}
                                  className="w-full md:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold py-2 px-6 rounded-xl shadow-lg shadow-violet-200 transition-all active:scale-95 group"
                              >
                                  <Sparkles size={18} className="animate-pulse" />
                                  <span>Analisa AI</span>
                              </button>
                          </div>

                          {/* Stats Cards */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              <StatCard 
                                  title="Total Produk" 
                                  value={products.filter(p => p.companyId === activeCompanyId).length.toString()} 
                                  icon={<Package />} 
                                  trend="Aktif"
                                  colorClass="bg-violet-500"
                              />
                              <StatCard 
                                  title="Total Stok" 
                                  value={products.filter(p => p.companyId === activeCompanyId).reduce((acc, p) => acc + getAvailableStock(p.nama), 0).toString()} 
                                  icon={<Archive />} 
                                  trend="Unit"
                                  colorClass="bg-blue-500"
                              />
                              <StatCard 
                                  title="Stok Menipis" 
                                  value={products.filter(p => (p.companyId === activeCompanyId || p.company_id === activeCompanyId) && getAvailableStock(p.nama) < 10).length.toString()} 
                                  icon={<AlertTriangle />} 
                                  trend="Item"
                                  trendType="down"
                                  colorClass="bg-rose-500"
                              />
                              <StatCard 
                                  title="Produk Terjual" 
                                  value={(() => {
                                      const filteredTrx = filteredDashboardTrx.filter(t => {
                                          if (!['Pengiriman', 'Selesai'].includes(t.status)) return false;
                                          if (!t.tanggal) return true;
                                          const [y, m] = t.tanggal.split('-');
                                          const monthMatch = filterMonth ? m === filterMonth : true;
                                          const yearMatch = filterYear ? y === filterYear : true;
                                          return monthMatch && yearMatch;
                                      });
                                      return filteredTrx.reduce((acc, t) => acc + (t.items?.reduce((iAcc, i) => iAcc + i.qty, 0) || 0), 0);
                                  })().toString()} 
                                  icon={<ShoppingCart />} 
                                  trend="Filter"
                                  colorClass="bg-emerald-500"
                              />
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Best Selling Products */}
                              <div className="bg-white dark:bg-zinc-900/90 p-6 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800">
                                  <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center justify-between">
                                      <span>Produk Terlaris</span>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filterMonth ? MONTHS.find(m => m.value === filterMonth)?.label : 'Semua Bulan'} {filterYear || 'Semua Tahun'}</span>
                                  </h3>
                                  <div className="space-y-4">
                                      {(() => {
                                          const sorted = Object.entries(filteredSoldQuantities).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5);
                                          if (sorted.length === 0) return <div className="text-center py-8 text-slate-400 font-bold italic">Belum ada data penjualan sesuai filter.</div>;
                                          return sorted.map(([name, qty], idx) => {
                                              const prod = products.find(p => p.nama === name && (p.companyId === activeCompanyId || p.company_id === activeCompanyId));
                                              return (
                                                  <div key={idx} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden">
                                                          {prod?.images?.[0] ? <img src={prod.images[0]} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Package size={20} />}
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                          <div className="text-sm font-bold text-slate-800 truncate">{name}</div>
                                                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{prod?.satuan || 'Unit'}</div>
                                                      </div>
                                                      <div className="text-right">
                                                          <div className="text-sm font-black text-violet-600">{qty}</div>
                                                          <div className="text-[10px] text-slate-400 font-bold uppercase">Terjual</div>
                                                      </div>
                                                  </div>
                                              );
                                          });
                                      })()}
                                  </div>
                              </div>

                              {/* Recent Sales for Products */}
                              <div className="bg-white dark:bg-zinc-900/90 p-6 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800">
                                  <div className="flex justify-between items-center mb-6">
                                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Penjualan Terakhir</h3>
                                      <button 
                                          onClick={() => handleNavClick('TRADE', 'Pesanan Selesai')}
                                          className="text-[10px] font-black text-violet-600 hover:text-violet-700 uppercase tracking-widest flex items-center gap-1 group"
                                      >
                                          View All
                                          <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                                      </button>
                                  </div>
                                  <div className="space-y-4">
                                      {(() => {
                                          const recent = filteredDashboardTrx.filter(t => t.status === 'Selesai').slice(-5).reverse();
                                          if (recent.length === 0) return <div className="text-center py-8 text-slate-400 font-bold italic">Belum ada data penjualan selesai sesuai filter.</div>;
                                          return recent.map((t, idx) => (
                                              <div key={idx} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => handleTrxClick(t)}>
                                                  <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center text-violet-500">
                                                      <ShoppingCart size={20} />
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                      <div className="text-sm font-bold text-slate-800 truncate">{t.noTrx}</div>
                                                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.customerName} • {t.tanggal}</div>
                                                  </div>
                                                  <div className="text-right flex items-center gap-3">
                                                      <div>
                                                          <div className="text-sm font-black text-slate-800">{formatRupiah(t.nilaiProyek)}</div>
                                                          <div className={`text-[9px] font-black uppercase tracking-wider ${t.status === 'Selesai' ? 'text-emerald-500' : 'text-blue-500'}`}>{t.status}</div>
                                                      </div>
                                                      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 hover:bg-violet-100 transition-colors">
                                                          <Eye size={14} />
                                                      </div>
                                                  </div>
                                              </div>
                                          ));
                                      })()}
                                  </div>
                              </div>
                          </div>

                          {/* Inventory Status */}
                          <div className="bg-white dark:bg-zinc-900/90 p-6 rounded-xl shadow-xs border border-zinc-200/80 dark:border-zinc-800">
                              <h3 className="text-sm font-black text-slate-800 mb-6">Status Inventaris (Stok Rendah)</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {(() => {
                                      const lowStock = products.filter(p => (p.companyId === activeCompanyId || p.company_id === activeCompanyId) && getAvailableStock(p.nama) < 10).slice(0, 6);
                                      if (lowStock.length === 0) return <div className="col-span-full text-center py-8 text-slate-400 font-bold italic">Semua stok produk dalam kondisi aman.</div>;
                                      return lowStock.map((p, idx) => {
                                          const stock = getAvailableStock(p.nama);
                                          return (
                                              <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center gap-4">
                                                  <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center text-rose-500">
                                                      <AlertTriangle size={24} />
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                      <div className="text-sm font-bold text-slate-800 truncate">{p.nama}</div>
                                                      <div className="flex items-center gap-2 mt-1">
                                                          <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                                                              <div className="h-full bg-rose-500" style={{ width: `${Math.min(100, (stock / 10) * 100)}%` }}></div>
                                                          </div>
                                                          <span className="text-xs font-black text-rose-600">{stock}</span>
                                                      </div>
                                                  </div>
                                              </div>
                                          );
                                      });
                                  })()}
                              </div>
                          </div>
                      </div>
                      );
                  })() : ['Buku Besar', 'Jurnal', 'Hutang', 'Piutang'].includes(activeView) ? (
                      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                          <div className="w-16 h-16 bg-violet-50 rounded-full flex items-center justify-center mb-4">
                              {activeView === 'Buku Besar' && <Book size={32} className="text-violet-600" />}
                              {activeView === 'Jurnal' && <BookOpen size={32} className="text-violet-600" />}
                              {activeView === 'Hutang' && <ArrowUpRight size={32} className="text-violet-600" />}
                              {activeView === 'Piutang' && <ArrowDownLeft size={32} className="text-violet-600" />}
                          </div>
                          <h2 className="text-xl font-bold text-slate-800 mb-2">{activeView}</h2>
                          <p className="text-slate-500 text-sm max-w-xs text-center">Modul {activeView} sedang dalam tahap pengembangan untuk integrasi akuntansi yang lebih mendalam.</p>
                      </div>
                  ) : activeView === 'Pengaturan Perusahaan' ? (
                      <div className="max-w-6xl mx-auto space-y-6">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                              <div>
                                  <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Pengaturan Perusahaan</h1>
                                  <p className="text-sm text-slate-500 font-medium">Kelola informasi identitas dan daftar perusahaan Anda.</p>
                              </div>
                              {currentUser?.role === 'superadmin' && (
                                  <button 
                                      onClick={() => {
                                          setCurrentCompanyEdit({});
                                          setShowModal('ADD_COMPANY');
                                      }}
                                      className="px-4 py-2 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all flex items-center gap-2 shadow-lg shadow-violet-100"
                                  >
                                      <Plus size={18} />
                                      <span>Tambah Perusahaan</span>
                                  </button>
                              )}
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              {/* Left: Active Company Detail */}
                              <div className="lg:col-span-2 space-y-6">
                                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-full">
                                      <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                                          <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center text-violet-600">
                                              <Store size={32} />
                                          </div>
                                          <div>
                                              <h2 className="text-lg font-bold text-slate-800">{activeCompany.nama}</h2>
                                              <div className="flex items-center gap-2 mt-1">
                                                  <span className="px-2 py-0.5 bg-violet-50 text-violet-600 text-[10px] font-black uppercase tracking-widest rounded-full">{activeCompany.id === '1' ? 'Perusahaan Utama' : 'Cabang/Unit'}</span>
                                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-full">Aktif</span>
                                              </div>
                                          </div>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          <div className="space-y-4">
                                              <div>
                                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nama Resmi</label>
                                                  <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700">{activeCompany.nama}</div>
                                              </div>
                                              <div>
                                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Email Korespondensi</label>
                                                  <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700">{activeCompany.email}</div>
                                              </div>
                                              <div>
                                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nomor Telepon</label>
                                                  <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700">{activeCompany.telepon}</div>
                                              </div>
                                          </div>
                                          
                                          <div className="space-y-4">
                                              <div>
                                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Alamat Kantor</label>
                                                  <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 min-h-[68px] leading-relaxed">{activeCompany.alamat}</div>
                                              </div>
                                              <div>
                                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">NPWP Tertata</label>
                                                  <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 font-mono tracking-wider">{activeCompany.npwp}</div>
                                              </div>
                                          </div>
                                      </div>
                                      
                                      <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                                          <button 
                                              onClick={() => {
                                                  setCurrentCompanyEdit(activeCompany);
                                                  setShowModal('ADD_COMPANY');
                                              }}
                                              className="px-6 py-2.5 bg-white border border-violet-600 text-violet-600 font-bold rounded-xl hover:bg-violet-50 transition-colors"
                                          >
                                              Edit Detail Perusahaan
                                          </button>
                                      </div>
                                  </div>
                              </div>

                              {/* Right: Company List (Superadmin only) */}
                              <div className="space-y-6">
                                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                      <div className="flex items-center justify-between mb-4">
                                          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Supabase Integration</h3>
                                          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${import.meta.env.VITE_SUPABASE_URL ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                              <span className={`w-1.5 h-1.5 rounded-full ${import.meta.env.VITE_SUPABASE_URL ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                              {import.meta.env.VITE_SUPABASE_URL ? 'Connected' : 'Not Configured'}
                                          </div>
                                      </div>
                                      
                                      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                          Hubungkan MyPanca dengan Supabase untuk sinkronisasi data cloud real-time dan keamanan data permanen.
                                      </p>

                                      <div className="space-y-3">
                                          <button 
                                              onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
                                              className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 transition-all text-xs font-bold text-slate-600 group"
                                          >
                                              <span>Buka Dashboard Supabase</span>
                                              <ExternalLink size={14} className="text-slate-400 group-hover:text-violet-600 transition-colors" />
                                          </button>
                                          
                                          {import.meta.env.VITE_SUPABASE_URL && (
                                              <>
                                                  <button 
                                                      onClick={async () => {
                                                          const { data, error } = await supabase.from('companies').select('*');
                                                          if (error) {
                                                              alert('Gagal test koneksi: ' + error.message);
                                                          } else {
                                                              alert('Koneksi Supabase Berhasil! Ditemukan ' + data.length + ' data perusahaan.');
                                                          }
                                                      }}
                                                      className="w-full py-2.5 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-100"
                                                  >
                                                      Test Koneksi Database
                                                  </button>
                                                  <div className="grid grid-cols-2 gap-2 mt-2">
                                                      <button 
                                                          onClick={async () => {
                                                              if (!confirm('Apakah anda yakin ingin mengunggah data lokal ke Supabase? Ini akan menimpa data di cloud (jika ID sama).')) return;
                                                              try {
                                                                  // 1. Sync Companies
                                                                  await supabase.from('companies').upsert(companies.map(c => ({
                                                                      id: c.id, nama: c.nama, email: c.email, telepon: c.telepon, alamat: c.alamat, npwp: c.npwp
                                                                  })));
                                                                  
                                                                  // 2. Sync Suppliers
                                                                  await supabase.from('suppliers').upsert(suppliers.map(s => ({
                                                                      id: s.id, nama: s.nama, kode: s.kode, npwp: s.npwp, 
                                                                      phone_code: s.phoneCode, phone: s.phone, email: s.email, keterangan: s.keterangan,
                                                                      company_id: s.companyId
                                                                  })));

                                                                  // 3. Sync Products
                                                                  await supabase.from('products').upsert(products.map(p => ({
                                                                      id: p.id, nama: p.nama, kode: p.kode, satuan: p.satuan, berat: p.berat,
                                                                      panjang: p.panjang, lebar: p.lebar, tinggi: p.tinggi, company_id: p.companyId
                                                                  })));

                                                                  // Sync product lots
                                                                  const allLots: any[] = [];
                                                                  products.forEach(p => {
                                                                      p.lots.forEach(l => allLots.push({
                                                                          id: l.id || undefined, product_id: p.id, lot: l.lot, kode: l.kode,
                                                                          supplier_id: l.supplierId, stock: l.stock, hpp: l.hpp,
                                                                          harga_jual: l.hargaJual, tanggal: l.tanggal
                                                                      }));
                                                                  });
                                                                  if (allLots.length > 0) await supabase.from('product_lots').upsert(allLots);

                                                                  // 4. Sync Customers
                                                                  await supabase.from('customers').upsert(customers.map(c => ({
                                                                      id: c.id, nama: c.nama, kode: c.kode, jenis: c.jenis, phone: c.phone,
                                                                      email: c.email, alamat: c.alamat, sales: c.sales, company_id: c.companyId
                                                                  })));

                                                                  // 5. Sync Transactions
                                                                  await supabase.from('transactions').upsert(transactions.map(t => ({
                                                                      id: t.id, no_trx: t.noTrx, tanggal: t.tanggal, customer_name: t.customerName,
                                                                      status: t.status, nilai_proyek: t.nilaiProyek, sales: t.sales, company_id: t.companyId
                                                                  })));

                                                                  alert('Data berhasil diunggah ke Supabase!');
                                                              } catch (err: any) {
                                                                  alert('Error saat sync: ' + err.message);
                                                              }
                                                          }}
                                                          className="py-2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all flex flex-col items-center justify-center gap-1"
                                                      >
                                                          <CloudUpload size={16} />
                                                          Push Cloud
                                                      </button>
                                                      <button 
                                                          onClick={async () => {
                                                              if (!confirm('Tarik data dari Supabase? Ini akan menimpa data lokal Anda.')) return;
                                                              try {
                                                                  const { data: dbComps } = await supabase.from('companies').select('*');
                                                                  const { data: dbSupps } = await supabase.from('suppliers').select('*');
                                                                  const { data: dbProds } = await supabase.from('products').select('*');
                                                                  const { data: dbCusts } = await supabase.from('customers').select('*');
                                                                  const { data: dbTrxs } = await supabase.from('transactions').select('*');
                                                                  
                                                                  if (dbComps) setCompanies(dbComps);
                                                                  if (dbSupps) setSuppliers(dbSupps.map((s: any) => ({ ...s, companyId: s.company_id, phoneCode: s.phone_code, website: s.website })));
                                                                  if (dbCusts) setCustomers(dbCusts.map((c: any) => ({ ...c, companyId: c.company_id, phoneCode: c.phone_code, leadType: c.lead_type })));
                                                                  if (dbProds) setProducts(dbProds.map((p: any) => ({ ...p, companyId: p.company_id })));
                                                                  if (dbTrxs) setTransactions(dbTrxs.map((t: any) => ({
                                                                      ...t,
                                                                      noTrx: t.no_trx,
                                                                      customerName: t.customer_name,
                                                                      nilaiProyek: parseFloat(t.nilai_proyek as any),
                                                                      biayaOngkir: parseFloat(t.biaya_ongkir as any),
                                                                      paymentStatus: t.payment_status,
                                                                      pembayaranDiterima: parseFloat(t.pembayaran_diterima as any),
                                                                      sisaPembayaran: parseFloat(t.sisa_pembayaran as any),
                                                                      companyId: t.company_id
                                                                  })));
                                                                  
                                                                  alert('Data berhasil ditarik dari Supabase!');
                                                              } catch (err: any) {
                                                                  alert('Error saat tarik data: ' + err.message);
                                                              }
                                                          }}
                                                          className="py-2 bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-all flex flex-col items-center justify-center gap-1"
                                                      >
                                                          <CloudDownload size={16} />
                                                          Pull Cloud
                                                      </button>
                                                  </div>
                                              </>
                                          )}
                                      </div>

                                      <div className="mt-4 pt-4 border-t border-slate-100">
                                          <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                                              <div className="flex items-center gap-3">
                                                  <AlertCircle size={18} className="text-amber-600" />
                                                  <div className="flex flex-col">
                                                      <span className="text-[10px] font-bold text-amber-700 uppercase">Perhatian SQL</span>
                                                      <span className="text-[10px] text-amber-600 leading-tight">Pastikan Anda sudah menjalankan script setup SQL di editor Supabase.</span>
                                                  </div>
                                              </div>
                                          </div>
                                      </div>
                                  </div>

                                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Daftar Perusahaan</h3>
                                      <div className="space-y-3">
                                          {getAccessibleCompanies.map(comp => (
                                              <div 
                                                  key={comp.id}
                                                  onClick={() => setActiveCompanyId(comp.id)}
                                                  className={`group p-4 rounded-xl border border-slate-100 cursor-pointer transition-all hover:border-violet-200 hover:shadow-md ${activeCompanyId === comp.id ? 'bg-violet-50 border-violet-200 ring-1 ring-violet-200' : 'bg-white'}`}
                                              >
                                                  <div className="flex items-center gap-3">
                                                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${activeCompanyId === comp.id ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                          <Store size={20} />
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                          <div className={`text-sm font-bold truncate ${activeCompanyId === comp.id ? 'text-violet-700' : 'text-slate-700'}`}>{comp.nama}</div>
                                                          <div className="text-[10px] text-slate-400 font-medium truncate">{comp.email}</div>
                                                      </div>
                                                      {activeCompanyId === comp.id && <CheckCircle size={14} className="text-violet-600" />}
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                      {currentUser?.role === 'superadmin' && (
                                          <button 
                                              onClick={() => {
                                                  setCurrentCompanyEdit({});
                                                  setShowModal('ADD_COMPANY');
                                              }}
                                              className="w-full mt-4 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm font-bold hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all flex items-center justify-center gap-2 group"
                                          >
                                              <Plus size={16} className="group-hover:scale-110 transition-transform" />
                                              <span>Daftarkan Cabang Baru</span>
                                          </button>
                                      )}
                                  </div>

                                  <div className="bg-slate-900 p-6 rounded-2xl shadow-xl text-white relative overflow-hidden">
                                      <div className="relative z-10">
                                          <h4 className="text-sm font-bold mb-2">Multi-Company Architecture</h4>
                                          <p className="text-[11px] text-slate-400 leading-relaxed mb-4">Setiap perusahaan memiliki database terpisah untuk Produk, Kontak, Transaksi, dan Karyawan. Pindah antar perusahaan melalui menu di bagian atas.</p>
                                          <div className="py-2 px-3 bg-slate-800 rounded-lg inline-flex items-center gap-2 text-[10px] font-mono text-violet-400">
                                              <Activity size={12} />
                                              Active ID: {activeCompanyId}
                                          </div>
                                      </div>
                                      <Sparkles size={120} className="absolute -bottom-10 -right-10 text-slate-800 opacity-20 rotate-12" />
                                  </div>
                              </div>
                          </div>
                      </div>
                  ) : activeView === 'Upload Data' ? (
                      <UploadDataView 
                        activeUploadType={activeUploadType}
                        setActiveUploadType={setActiveUploadType}
                        uploadGridData={uploadGridData}
                        setUploadGridData={setUploadGridData}
                        isUploading={isUploading}
                        setIsUploading={setIsUploading}
                        customers={customers}
                        setCustomers={setCustomers}
                        products={products}
                        setProducts={setProducts}
                        transactions={transactions}
                        setTransactions={setTransactions}
                        suppliers={suppliers}
                        setSuppliers={setSuppliers}
                        activeCompanyId={activeCompanyId}
                        syncToSupabase={syncToSupabase}
                        salesMembers={salesMembers}
                      />
                  ) : activeView === 'Log User' ? (
                      <div className="max-w-6xl mx-auto space-y-6">
                           <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-4 border-b border-slate-100 gap-4">
                               <div className="flex items-center gap-4">
                                   <div className="w-12 h-12 bg-gradient-to-br from-violet-200 to-violet-100 text-violet-600 rounded-xl flex items-center justify-center shadow-sm">
                                       <HistoryIcon size={24} />
                                   </div>
                                   <div>
                                       <h2 className="text-2xl font-black text-slate-800 tracking-tight">Log Pengguna</h2>
                                       <p className="text-sm font-medium text-slate-500">Pantau aktivitas login dan perubahan data oleh user</p>
                                   </div>
                               </div>
                               <button 
                                   onClick={async () => {
                                      if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
                                          const cloudData = await loadDataFromSupabase();
                                          if (cloudData && cloudData.userLogs) {
                                              setUserLogs(cloudData.userLogs);
                                              return;
                                          }
                                      }
                                      const savedLogs = localStorage.getItem('mypanca_db_user_logs');
                                      if (savedLogs) setUserLogs(JSON.parse(savedLogs));
                                   }}
                                   className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 transition-colors flex items-center gap-2"
                               >
                                   <RefreshCw size={14} /> Refresh Data
                               </button>
                           </div>
                           
                           <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                               <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                   <div>
                                       <label className="text-xs font-bold text-slate-500 uppercase">User</label>
                                       <select 
                                           value={filterSales} 
                                           onChange={e => setFilterSales(e.target.value)} 
                                           className="w-full mt-1 border border-slate-300 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                       >
                                           <option value="">Semua User</option>
                                           {appUsers.map((u, i) => <option key={`${u.id || u.username || i}-${i}`} value={u.nama}>{u.nama}</option>)}
                                       </select>
                                   </div>
                                   <div>
                                       <label className="text-xs font-bold text-slate-500 uppercase">Aksi</label>
                                       <select 
                                           value={filterStatus} 
                                           onChange={e => setFilterStatus(e.target.value)} 
                                           className="w-full mt-1 border border-slate-300 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                       >
                                           <option value="">Semua Aksi</option>
                                           <option value="LOGIN">Login</option>
                                           <option value="LOGOUT">Logout</option>
                                           <option value="CREATE">Create</option>
                                           <option value="UPDATE">Update</option>
                                           <option value="DELETE">Delete</option>
                                           <option value="RESTORE">Restore</option>
                                       </select>
                                   </div>
                                   <div>
                                       <label className="text-xs font-bold text-slate-500 uppercase">Tanggal</label>
                                       <select 
                                           value={filterDate} 
                                           onChange={e => setFilterDate(e.target.value)} 
                                           className="w-full mt-1 border border-slate-300 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                       >
                                           <option value="">Semua Tanggal</option>
                                           {Array.from({length: 31}, (_, i) => {
                                               const value = (i + 1).toString().padStart(2, '0');
                                               return <option key={value} value={value}>{value}</option>;
                                           })}
                                       </select>
                                   </div>
                                   <div>
                                       <label className="text-xs font-bold text-slate-500 uppercase">Bulan</label>
                                       <select 
                                           value={filterMonth} 
                                           onChange={e => setFilterMonth(e.target.value)} 
                                           className="w-full mt-1 border border-slate-300 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                       >
                                           <option value="">Semua Bulan</option>
                                           {Array.from({length: 12}, (_, i) => {
                                               const value = (i + 1).toString().padStart(2, '0');
                                               return <option key={value} value={value}>{new Date(2000, i, 1).toLocaleString('id-ID', { month: 'long' })}</option>;
                                           })}
                                       </select>
                                   </div>
                                   <div>
                                       <label className="text-xs font-bold text-slate-500 uppercase">Tahun</label>
                                       <select 
                                           value={filterYear} 
                                           onChange={e => setFilterYear(e.target.value)} 
                                           className="w-full mt-1 border border-slate-300 rounded-lg py-2 px-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                       >
                                           <option value="">Semua Tahun</option>
                                           {Array.from({length: 5}, (_, i) => {
                                               const year = (new Date().getFullYear() - i).toString();
                                               return <option key={year} value={year}>{year}</option>;
                                           })}
                                       </select>
                                   </div>
                               </div>
                           </div>
                           
                           <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                               <div className="overflow-x-auto min-h-[400px]">
                                   <table className="w-full whitespace-nowrap">
                                       <thead className="bg-[#F8FAFC] border-b border-slate-200">
                                           <tr>
                                               <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Waktu</th>
                                               <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">User</th>
                                               <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Aksi</th>
                                               <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Entitas</th>
                                               <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Detail</th>
                                           </tr>
                                       </thead>
                                       <tbody className="divide-y divide-slate-100">
                                           {userLogs.filter(log => {
                                               let match = true;
                                               if (filterSales && log.userName !== filterSales) match = false;
                                               if (filterStatus && log.action !== filterStatus) match = false;
                                               if (filterMonth || filterYear || filterDate) {
                                                   const dateObj = new Date(log.createdAt);
                                                   if (filterDate && dateObj.getDate().toString().padStart(2, '0') !== filterDate) match = false;
                                                   if (filterMonth && (dateObj.getMonth() + 1).toString().padStart(2, '0') !== filterMonth) match = false;
                                                   if (filterYear && dateObj.getFullYear().toString() !== filterYear) match = false;
                                               }
                                               return match;
                                           }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(log => (
                                               <tr key={log.id} className="hover:bg-slate-50">
                                                   <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                                                       {new Date(log.createdAt).toLocaleString('id-ID', {day: 'numeric', month: 'short', year:'numeric', hour:'2-digit', minute:'2-digit'})}
                                                   </td>
                                                   <td className="px-6 py-4 text-sm font-bold text-slate-800">{log.userName}</td>
                                                   <td className="px-6 py-4">
                                                       <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                           log.action === 'LOGIN' ? 'bg-blue-100 text-blue-700' :
                                                           log.action === 'CREATE' ? 'bg-green-100 text-green-700' :
                                                           log.action === 'UPDATE' ? 'bg-amber-100 text-amber-700' :
                                                           log.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                                                           'bg-slate-100 text-slate-700'
                                                       }`}>
                                                           {log.action}
                                                       </span>
                                                   </td>
                                                   <td className="px-6 py-4 text-sm font-bold text-slate-700">{log.entity || '-'}</td>
                                                   <td className="px-6 py-4 text-sm text-slate-500 max-w-sm truncate" title={log.details}>{log.details}</td>
                                               </tr>
                                           ))}
                                           {userLogs.length === 0 && (
                                               <tr>
                                                   <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-medium whitespace-normal">
                                                       Belum ada log aktivitas pengguna.
                                                   </td>
                                               </tr>
                                           )}
                                       </tbody>
                                   </table>
                               </div>
                           </div>
                      </div>
                  ) : activeView === 'Tutorial' ? (
                      <div className="max-w-4xl mx-auto space-y-6">
                           <div className="flex items-center gap-4 mb-8 pb-4 border-b border-slate-100">
                               <div className="w-12 h-12 bg-gradient-to-br from-amber-200 to-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm">
                                   <Lightbulb size={24} />
                               </div>
                               <div>
                                   <h2 className="text-2xl font-black text-slate-800 tracking-tight">Tutorial & Panduan</h2>
                                   <p className="text-sm font-medium text-slate-500">Panduan lengkap menggunakan sistem BRM & ERP</p>
                               </div>
                           </div>
                           
                           <div className="space-y-4">
                               {tutorials.sort((a,b) => a.order - b.order).map((tut) => {
                                   const isExpanded = expandedTutorials.includes(tut.id);
                                   const isEditing = editingTutorialId === tut.id;
                                   
                                   return (
                                       <div key={tut.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-300">
                                           <div 
                                              onClick={() => {
                                                  if (isEditing) return;
                                                  setExpandedTutorials(prev => prev.includes(tut.id) ? prev.filter(id => id !== tut.id) : [...prev, tut.id])
                                              }}
                                              className={`flex items-center justify-between p-5 cursor-pointer ${isExpanded ? 'bg-amber-50/50 border-b border-amber-100' : 'hover:bg-slate-50'} transition-colors`}
                                           >
                                               <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
                                                    {tut.title}
                                               </h3>
                                               <div className="flex items-center gap-3">
                                                    {(currentUser?.role === 'superadmin' || currentUser?.role === 'admin') && !isEditing && (
                                                         <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTutorialEditContent(tut.content);
                                                                setEditingTutorialId(tut.id);
                                                                if (!isExpanded) setExpandedTutorials(prev => [...prev, tut.id]);
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                                         >
                                                             <Edit size={16} />
                                                         </button>
                                                    )}
                                                    <div className={`w-8 h-8 flex items-center justify-center rounded-full transition-transform ${isExpanded ? 'bg-amber-100 text-amber-600 rotate-180' : 'bg-slate-100 text-slate-500'}`}>
                                                        <ChevronDown size={18} />
                                                    </div>
                                               </div>
                                           </div>
                                           
                                           {isExpanded && (
                                               <div className="p-6 bg-white">
                                                   {isEditing ? (
                                                       <div className="space-y-4">
                                                            <textarea
                                                                value={tutorialEditContent}
                                                                onChange={(e) => setTutorialEditContent(e.target.value)}
                                                                rows={12}
                                                                className="w-full border border-slate-200 rounded-xl p-4 text-sm font-medium focus:ring-2 focus:ring-violet-500 outline-none resize-y"
                                                                placeholder="Tulis konten tutorial menggunakan Markdown..."
                                                            />
                                                            <div className="flex justify-end gap-3">
                                                                 <button 
                                                                    onClick={() => setEditingTutorialId(null)}
                                                                    className="px-5 py-2 font-bold text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                                                                 >
                                                                     Batal
                                                                 </button>
                                                                 <button 
                                                                    onClick={() => {
                                                                         const updatedTut = { ...tut, content: tutorialEditContent };
                                                                         const newTuts = tutorials.map(t => t.id === tut.id ? updatedTut : t);
                                                                         setTutorials(newTuts);
                                                                         syncToSupabase('tutorials', updatedTut);
                                                                         setEditingTutorialId(null);
                                                                    }}
                                                                    className="px-5 py-2 font-bold text-sm text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors flex items-center gap-2"
                                                                 >
                                                                     <Save size={16} /> Simpan Perubahan
                                                                 </button>
                                                            </div>
                                                       </div>
                                                   ) : (
                                                       <div className="prose prose-sm prose-slate max-w-none">
                                                            <div className="markdown-body text-slate-700 leading-relaxed font-medium">
                                                                <Markdown remarkPlugins={[remarkGfm]}>{tut.content}</Markdown>
                                                            </div>
                                                            
                                                            {tut.images && tut.images.length > 0 && (
                                                                <div className="mt-8 flex flex-wrap gap-4">
                                                                    {tut.images.map((img, i) => (
                                                                        <div key={i} className="relative group">
                                                                            <img src={img} alt={`Tutorial ${i}`} className="rounded-xl border border-slate-200 shadow-sm max-w-full md:max-w-md h-auto cursor-pointer hover:shadow-md transition-all object-cover" onClick={() => setLightboxImage({ images: tut.images, index: i })} />
                                                                            {(currentUser?.role === 'superadmin' || currentUser?.role === 'admin') && (
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        if(window.confirm('Hapus gambar ini?')) {
                                                                                            const newImages = tut.images.filter((_, imgIdx) => imgIdx !== i);
                                                                                            const updatedTut = { ...tut, images: newImages };
                                                                                            const newTuts = tutorials.map(t => t.id === tut.id ? updatedTut : t);
                                                                                            setTutorials(newTuts);
                                                                                            syncToSupabase('tutorials', updatedTut);
                                                                                        }
                                                                                    }}
                                                                                    className="absolute top-2 right-2 w-8 h-8 bg-white/90 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center shadow-sm hover:bg-red-50 hover:text-red-600 transition-all"
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            
                                                            {(currentUser?.role === 'superadmin' || currentUser?.role === 'admin') && (
                                                                <div className="mt-8 pt-6 border-t border-slate-100">
                                                                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 transition-colors shadow-sm">
                                                                        <ImageIcon size={14} className="text-slate-400" />
                                                                        Tambah Gambar (Format JPG/PNG)
                                                                        <input 
                                                                            type="file" 
                                                                            accept="image/*" 
                                                                            className="hidden" 
                                                                            onChange={async (e) => {
                                                                                const file = e.target.files?.[0];
                                                                                if (!file) return;
                                                                                // validate image size (max 5MB)
                                                                                if (file.size > 5 * 1024 * 1024) {
                                                                                    alert('Size gambar terlalu besar (Maksimal 5MB)');
                                                                                    return;
                                                                                }
                                                                                try {
                                                                                    const webpStr = await processImage(file);
                                                                                    const updatedTut = { ...tut, images: [...(tut.images || []), webpStr] };
                                                                                    const newTuts = tutorials.map(t => t.id === tut.id ? updatedTut : t);
                                                                                    setTutorials(newTuts);
                                                                                    syncToSupabase('tutorials', updatedTut);
                                                                                } catch (err) {
                                                                                    console.error("Failed to process image:", err);
                                                                                    alert('Gagal memproses gambar');
                                                                                }
                                                                            }}
                                                                        />
                                                                    </label>
                                                                </div>
                                                            )}
                                                       </div>
                                                   )}
                                               </div>
                                           )}
                                       </div>
                                   );
                               })}
                           </div>
                      </div>
                  ) : ['WA Chat', 'WA Setting AI', 'WA Perangkat', 'WhatsApp'].includes(activeView) ? (
                      <WhatsAppView 
                        currentUser={currentUser ? { id: currentUser.id, nama: currentUser.nama, username: currentUser.username, role: currentUser.role } : undefined}
                        initialSubTab={
                          activeView === 'WA Setting AI' ? 'setting-ai' : 
                          activeView === 'WA Perangkat' ? 'perangkat' : 'chat'
                        } 
                      />
                  ) : activeView === 'Settings' ? (
                      <div className="max-w-4xl mx-auto space-y-6">
                          {/* Google Gemini AI Multi-Key & Auto-Rolling Configuration */}
                          <GeminiSettingsSection />

                          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                              <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                                  <Settings size={24} className="text-slate-400" />
                                  Pengaturan Aplikasi & Notifikasi
                              </h2>
                          
                              <div className="space-y-8">
                              <section>
                                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Notifikasi</h3>
                                  <div className="space-y-4">
                                      <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                                          <div>
                                              <h4 className="font-bold text-slate-800 mb-1">Notifikasi Otomatis</h4>
                                              <p className="text-xs text-slate-500">Kirim pengingat WhatsApp otomatis untuk penawaran (follow-up) dan pengingat jatuh tempo pembayaran (Belum Lunas) kepada sales terkait.</p>
                                          </div>
                                          <button 
                                              onClick={() => setAutoNotifyEnabled(!autoNotifyEnabled)}
                                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoNotifyEnabled ? 'bg-violet-600' : 'bg-slate-200'}`}
                                          >
                                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoNotifyEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                          </button>
                                      </div>
                                      
                                      <div className="p-4 bg-white border border-slate-200 rounded-xl">
                                          <div className="flex items-center justify-between mb-2">
                                              <label className="text-sm font-bold text-slate-700">Interval Pengingat (Hari)</label>
                                              <input 
                                                  type="number" 
                                                  min="1"
                                                  max="30"
                                                  value={autoNotifyDays} 
                                                  onChange={(e) => setAutoNotifyDays(parseInt(e.target.value) || 1)}
                                                  className="w-16 p-1 text-center border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-violet-500 outline-none transition-all"
                                              />
                                          </div>
                                          <p className="text-[10px] text-slate-400">Tentukan setelah berapa hari sistem akan mengirimkan pengingat jika tidak ada aktivitas follow-up.</p>
                                      </div>
                                      
                                      <div className="p-4 bg-white border border-slate-200 rounded-xl mt-4">
                                          <div className="flex items-center justify-between">
                                              <div>
                                                  <h4 className="font-bold text-slate-800 mb-1">Notifikasi Superadmin</h4>
                                                  <p className="text-xs text-slate-500">Kirim salinan notifikasi otomatis (dan test ping) ke semua akun Superadmin.</p>
                                              </div>
                                              <button 
                                                  onClick={() => setAutoNotifySuperadmin(!autoNotifySuperadmin)}
                                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoNotifySuperadmin ? 'bg-violet-600' : 'bg-slate-200'}`}
                                              >
                                                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoNotifySuperadmin ? 'translate-x-6' : 'translate-x-1'}`} />
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                              </section>

                              <section>
                                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Informasi Aplikasi</h3>
                                  <div className="grid grid-cols-2 gap-4 text-xs">
                                      <div className="p-3 bg-slate-50 rounded-lg">
                                          <span className="text-slate-400 block mb-1">Versi</span>
                                          <span className="font-bold text-slate-700">1.0.6</span>
                                      </div>
                                      <div className="p-3 bg-slate-50 rounded-lg">
                                          <span className="text-slate-400 block mb-1">Database</span>
                                          <span className="font-bold text-slate-700">Local Storage</span>
                                      </div>
                                  </div>
                              </section>

                              <div className="pt-6 border-t border-slate-100 flex justify-end items-center gap-4">
                                  {showSaveSuccess && (
                                      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 animate-pulse">
                                          <CheckCircle size={14} />
                                          <span className="text-[10px] font-bold uppercase tracking-wider">Tersimpan</span>
                                      </div>
                                  )}
                                  <button 
                                      onClick={() => {
                                          setShowSaveSuccess(true);
                                          setTimeout(() => setShowSaveSuccess(false), 3000);
                                      }}
                                      className="bg-violet-600 text-white font-black py-3 px-10 rounded-xl hover:bg-violet-700 shadow-lg shadow-violet-200 transition-all flex items-center gap-3 active:scale-95 group"
                                  >
                                      <Save size={20} className="group-hover:scale-110 transition-transform" />
                                      Simpan Semua Pengaturan
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>
                  ) : activeView === 'KPI' ? (
                      <KPIModule 
                          employees={employees}
                          transactions={transactions}
                          currentUser={currentUser}
                          activeCompanyId={activeCompanyId}
                          onUpdateEmployees={(updated) => setEmployees(updated)}
                      />
                  ) : (
                  /* LIST / TABLE VIEW */
                  <div className={`${isCardView ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 md:gap-4' : 'bg-card border border-border shadow-xs rounded-xl overflow-hidden'}`}>
                      {!isCardView && (
                          <div className="bg-muted/40 border-b border-border px-4 py-2.5 flex items-center gap-3">
                              <div 
                                   className="cursor-pointer"
                                   onClick={() => toggleSelectAll(viewData)}
                              >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.length === viewData.length && viewData.length > 0 ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-input hover:border-ring'}`}>
                                      {selectedIds.length === viewData.length && viewData.length > 0 && <Check size={11} strokeWidth={3} />}
                                  </div>
                              </div>
                              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Pilih Semua ({selectedIds.length}/{viewData.length})</span>
                          </div>
                      )}
                      
                      {/* CARD VIEW FOR MOBILE (Simplified) */}
                      {isCardView && (
                          <div className="bg-muted/40 border-b border-border px-4 py-2.5 flex items-center gap-3 col-span-full rounded-lg mb-2">
                              <div 
                                   className="cursor-pointer"
                                   onClick={() => toggleSelectAll(viewData)}
                              >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.length === viewData.length && viewData.length > 0 ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-input hover:border-ring'}`}>
                                      {selectedIds.length === viewData.length && viewData.length > 0 && <Check size={11} strokeWidth={3} />}
                                  </div>
                              </div>
                              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Pilih Semua ({selectedIds.length}/{viewData.length})</span>
                          </div>
                      )}
                      {isCardView ? (
                          viewData.map((item: any) => (
                             <div 
                                key={item.id} 
                                className={`bg-card p-3.5 rounded-lg shadow-xs border cursor-pointer flex flex-col transition-all hover:shadow-sm group relative overflow-hidden ${selectedIds.includes(item.id) ? 'border-primary ring-1 ring-primary bg-accent/40' : 'border-border hover:border-zinc-400 dark:hover:border-zinc-700'}`}
                                onMouseDown={() => {
                                    longPressTriggered.current = false;
                                    longPressTimerRef.current = setTimeout(() => {
                                        toggleSelect(item.id);
                                        longPressTriggered.current = true;
                                        longPressTimerRef.current = null;
                                    }, 2000);
                                }}
                                onMouseUp={() => {
                                    if (longPressTimerRef.current) {
                                        clearTimeout(longPressTimerRef.current);
                                        longPressTimerRef.current = null;
                                    }
                                }}
                                onMouseLeave={() => {
                                    if (longPressTimerRef.current) {
                                        clearTimeout(longPressTimerRef.current);
                                        longPressTimerRef.current = null;
                                    }
                                }}
                                onTouchStart={() => {
                                    longPressTriggered.current = false;
                                    longPressTimerRef.current = setTimeout(() => {
                                        toggleSelect(item.id);
                                        longPressTriggered.current = true;
                                        longPressTimerRef.current = null;
                                    }, 2000);
                                }}
                                onTouchEnd={() => {
                                    if (longPressTimerRef.current) {
                                        clearTimeout(longPressTimerRef.current);
                                        longPressTimerRef.current = null;
                                    }
                                }}
                                onClick={() => {
                                    if (longPressTriggered.current) {
                                        longPressTriggered.current = false;
                                        return;
                                    }
                                    if (selectedIds.length > 0) {
                                        toggleSelect(item.id);
                                    } else {
                                        if(activeView === 'Contacts') { setCurrentCust(item); setShowDrawer('custDetail'); }
                                        else if(activeView === 'Produk') { setCurrentProd(item); setShowDrawer('prodDetail'); }
                                        else if(activeView === 'Employees') { setCurrentEmp(item); setShowDrawer('empDetail'); }
                                         else if(activeView === 'Users') { setCurrentAppUser(item); setShowDrawer('appUserDetail'); }
                                         else if(activeView === 'Suppliers') { setCurrentSupp(item); setShowDrawer('suppDetail'); }
                                         else if(activeView === 'Purchase Orders' || activeView === 'Procurement') { setCurrentPO(item); setShowDrawer('poDetail'); }
                                        else { if (['Transaksi', 'Invoice', 'Pengiriman', 'Pesanan Selesai', 'Orders', 'Penawaran', 'Pembayaran', 'Belum Lunas', 'Pesanan Batal', 'PPN', 'NON PPN', 'Ongkir'].includes(activeView)) { handleTrxClick(item); } }
                                    }
                                }}
                             >
                                 <div className="flex flex-col h-full">
                                     {activeView === 'Produk' && (
                                         <div className="mb-2 -mx-4 -mt-4 overflow-hidden rounded-t-xl aspect-square bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border-b border-border">
                                             {item.images && item.images.length > 0 ? (
                                                 <img src={item.images[0]} alt={item.nama} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                                             ) : (
                                                 <Package size={32} className="text-zinc-400" />
                                             )}
                                         </div>
                                     )}
                                     
                                     {activeView !== 'Produk' && (
                                         <div className="flex justify-between items-start mb-3">
                                             <div className="bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg group-hover:bg-violet-50 dark:group-hover:bg-violet-950/40 transition-colors">
                                                 {activeView === 'Contacts' ? <User size={20} className="text-zinc-400 group-hover:text-violet-500"/> : <Package size={20} className="text-zinc-400 group-hover:text-violet-500"/>}
                                             </div>
                                             {item.status && (
                                                 <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                    item.status === 'Selesai' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' :
                                                    item.status === 'Progress' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400' :
                                                    item.status === 'Payment' ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400' :
                                                    item.status === 'Pengiriman' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400' :
                                                    item.status === 'Penawaran' ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400' :
                                                    'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                                                 }`}>
                                                     {item.status}
                                                 </span>
                                             )}
                                         </div>
                                     )}
                                     
                                     <div className="flex-1 min-w-0">
                                         <h4 className="font-bold text-foreground text-[11px] sm:text-sm line-clamp-2 mb-0.5 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{item.nama || item.noTrx}</h4>
                                         
                                         {activeView === 'Produk' && (
                                             <div className="space-y-1 mb-2">
                                                 <div className="text-[10px] text-muted-foreground font-medium">KODE: {item.kode || '-'}</div>
                                                 <div className="text-[10px] text-muted-foreground font-medium">Code: {item.kode || '-'}</div>
                                                 <div className="text-[10px] text-muted-foreground font-bold uppercase">Supplier: {getSupplierName(item)}</div>
                                             </div>
                                         )}

                                         {activeView !== 'Produk' && (
                                             <>
                                                 <div className="text-[10px] text-muted-foreground font-medium mb-1">{item.kode || item.customerName}</div>
                                                 
                                                 {['Transaksi', 'Invoice', 'Pembayaran', 'Penawaran', 'Pesanan Selesai', 'Pesanan Batal', 'Belum Lunas', 'PPN', 'NON PPN', 'Ongkir'].includes(activeView) && (
                                                     <div className="text-[10px] text-muted-foreground mb-2">
                                                         <div>Date: {item.tanggal}</div>
                                                         <div className="font-bold text-foreground/80">Sales: {item.sales}</div>
                                                         {item.keterangan && <div className="italic line-clamp-1">Ket: {item.keterangan}</div>}
                                                         {activeView === 'Penawaran' && item.followUps && item.followUps.length > 0 && (
                                                             <div className="mt-1 p-1 bg-purple-50 dark:bg-purple-950/40 rounded border border-purple-200 dark:border-purple-800/60">
                                                                 <div className="text-[9px] font-bold text-purple-700 dark:text-purple-300 uppercase">Last Follow Up:</div>
                                                                 <div className="text-[9px] text-purple-600 dark:text-purple-400 font-bold">{item.followUps[item.followUps.length - 1].tanggal}</div>
                                                                 <div className="text-[9px] text-purple-500 dark:text-purple-300 truncate">{item.followUps[item.followUps.length - 1].keterangan}</div>
                                                             </div>
                                                         )}
                                                     </div>
                                                 )}

                                                 {activeView === 'Contacts' && (
                                                     <div className="space-y-1 mb-3">
                                                         <div className="text-[10px] text-muted-foreground font-bold uppercase">Type: {item.jenis}</div>
                                                         <div className="text-[10px] text-muted-foreground font-mono">{item.phoneCode || ''}{item.phone}</div>
                                                         <div className="flex flex-wrap gap-1">
                                                             <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-foreground rounded text-[9px] font-bold uppercase">{item.leadType}</span>
                                                             <span className="px-1.5 py-0.5 bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 rounded text-[9px] font-bold uppercase">{item.sales}</span>
                                                         </div>
                                                     </div>
                                                 )}
                                                 {activeView === 'Suppliers' && (
                                                     <div className="space-y-1 mb-2">
                                                         <div className="text-[10px] text-muted-foreground font-mono">Kode: {item.kode || '-'}</div>
                                                     </div>
                                                 )}
                                                 {activeView === 'Employees' && (
                                                     <div className="space-y-1 mb-2">
                                                         <div className="text-[10px] text-muted-foreground font-bold uppercase">Role: {item.role}</div>
                                                         <div className="text-[10px] text-muted-foreground font-mono">{item.phone}</div>
                                                         <div className="text-[10px] text-muted-foreground truncate">{item.email}</div>
                                                         <div className="text-[10px] font-bold text-muted-foreground uppercase">Status: {item.status}</div>
                                                     </div>
                                                 )}
                                                 {(activeView === 'Purchase Orders' || activeView === 'Procurement') && (
                                                     <div className="space-y-1 mb-2">
                                                         <div className="text-[10px] text-muted-foreground font-bold uppercase">Product: {products.find(p => p.id === item.produkId)?.nama || '-'}</div>
                                                         <div className="text-[10px] text-muted-foreground font-bold uppercase">Supplier: {suppliers.find(s => s.id === item.supplierId)?.nama || '-'}</div>
                                                         <div className="text-[10px] text-muted-foreground">Date: {item.tanggalPembelian}</div>
                                                         <div className="text-[10px] text-muted-foreground font-bold">Qty: {item.jumlah}</div>
                                                         <div className="text-[10px] font-bold text-muted-foreground uppercase">Status: {item.status}</div>
                                                         {activeModule !== 'Stocklist' && item.status === 'Process' && (
                                                             <button onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 confirmAction('Konfirmasi Terima', 'Apakah Anda yakin ingin menerima PO ini? Tanggal terima akan diset ke hari ini.', () => {
                                                                     const date = new Date().toISOString().split('T')[0];
                                                                     const updatedPO = { ...item, status: 'Received', tanggalDiterima: date };
                                                                      setPurchaseOrders(prev => prev.map(p => p.id === item.id ? updatedPO : p));
                                                                      syncToSupabase('purchase_orders', updatedPO);
                                                                     setProducts(prev => prev.map(p => {
                                                                          if (p.id === item.produkId) {
                                                                              const updatedProd = { 
                                                                                  ...p, 
                                                                                  lots: [...(p.lots || []), { 
                                                                                      lot: Date.now(), 
                                                                                      kode: 'AUTO', 
                                                                                      supplierId: item.supplierId, 
                                                                                      stock: item.jumlah, 
                                                                                      hpp: item.harga / item.jumlah, 
                                                                                      hargaJual: 0, 
                                                                                      tanggal: date 
                                                                                  }] 
                                                                              };
                                                                              syncToSupabase('products', updatedProd);
                                                                              return updatedProd;
                                                                          }
                                                                          return p;
                                                                      }));
                                                                 });
                                                             }} className="bg-green-500 text-white px-2 py-1 rounded text-xs mt-1 mr-1">Terima</button>
                                                         )}
                                                         {activeModule !== 'Stocklist' && item.status === 'Received' && (
                                                             <button onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 confirmAction('Konfirmasi Lunas', 'Apakah Anda yakin ingin menandai PO ini sebagai Lunas?', () => {
                                                                     const updatedPO = { ...item, status: 'Lunas' };
                                                                      setPurchaseOrders(prev => prev.map(p => p.id === item.id ? updatedPO : p));
                                                                      syncToSupabase('purchase_orders', updatedPO);
                                                                 });
                                                             }} className="bg-blue-500 text-white px-2 py-1 rounded text-xs mt-1">Lunas</button>
                                                         )}
                                                     </div>
                                                 )}
                                             </>
                                         )}
                                     </div>

                                     <div className="mt-auto pt-2 border-t border-slate-50">
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
                                        )}
                                        
                                        <div className="flex items-center justify-between">
                                            {!['Transaksi', 'Invoice', 'Pengiriman', 'Pesanan Selesai', 'Pesanan Batal', 'Lunas', 'Belum Lunas', 'Penawaran'].includes(activeView) && (
                                                <div className="text-[9px] text-slate-500 font-mono truncate max-w-[60px] sm:max-w-[80px]">
                                                    {(() => {
                                                        const contact = getContactInfo(item);
                                                        return contact?.phone ? `${contact.phoneCode || ''}${contact.phone}` : '';
                                                    })()}
                                                </div>
                                            )}
                                            
                                            <div className="flex items-center gap-1 ml-auto">
                                                {activeView === 'Produk' && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setCurrentProd(item); setShowDrawer('prodDetail'); setShowProdAbout(true); }} 
                                                        className="text-violet-600 hover:bg-violet-50 p-1 rounded-md transition-colors flex items-center gap-1"
                                                        title="Tentang Produk"
                                                    >
                                                        <FileText size={12} className="sm:w-[14px] sm:h-[14px]"/>
                                                        <span className="text-[9px] sm:text-[10px] font-bold">Detail</span>
                                                    </button>
                                                )}
                                                {activeView === 'Contacts' && item.phone && (
                                                    <a 
                                                        href={`https://wa.me/${(item.phoneCode || '+62').replace('+', '')}${item.phone}`} 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className="text-emerald-500 hover:bg-emerald-50 p-1 rounded-md transition-colors"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="WhatsApp"
                                                    >
                                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.83c0 2.104.547 4.158 1.588 5.976L0 24l6.335-1.662c1.808.986 3.848 1.506 5.923 1.506h.005c6.554 0 11.89-5.335 11.893-11.83a11.79 11.79 0 00-3.48-8.367z" /></svg>
                                                    </a>
                                                )}
                                                {['Transaksi', 'Invoice', 'Pengiriman', 'Pesanan Selesai', 'Pesanan Batal', 'Lunas', 'Belum Lunas', 'Penawaran'].includes(activeView) && (() => {
                                                    const contact = getContactInfo(item);
                                                    if (!contact) return null;
                                                    return (
                                                        <>
                                                            {contact.phone && (
                                                                <a 
                                                                    href={`https://wa.me/${(contact.phoneCode || '+62').replace('+', '')}${contact.phone}`} 
                                                                    target="_blank" 
                                                                    rel="noreferrer"
                                                                    className="text-emerald-500 hover:bg-emerald-50 p-1 rounded-md transition-colors"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="WhatsApp"
                                                                >
                                                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.83c0 2.104.547 4.158 1.588 5.976L0 24l6.335-1.662c1.808.986 3.848 1.506 5.923 1.506h.005c6.554 0 11.89-5.335 11.893-11.83a11.79 11.79 0 00-3.48-8.367z" /></svg>
                                                                </a>
                                                            )}
                                                            {contact.email && (
                                                                <a 
                                                                    href={`mailto:${contact.email}`}
                                                                    className="text-blue-500 hover:bg-blue-50 p-1 rounded-md transition-colors"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="Email"
                                                                >
                                                                    <Mail size={14}/>
                                                                </a>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                                {activeView === 'Transaksi' && (
                                                    <button 
                                                        title="Lihat Transaksi" 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            const s = item.status || item.statuses[0];
                                                            let targetView = 'Transaksi';
                                                            if (s === 'Penawaran') targetView = 'Penawaran';
                                                            else if (s === 'Invoice') targetView = 'Invoice';
                                                            else if (s === 'Payment') targetView = item.paymentStatus === 'Belum Lunas' ? 'Belum Lunas' : 'Pembayaran';
                                                            else if (s === 'Pengiriman') targetView = 'Pengiriman';
                                                            else if (s === 'Selesai') targetView = 'Pesanan Selesai';
                                                            else if (s === 'Batal') targetView = 'Pesanan Batal';
                                                            
                                                            setActiveView(targetView);
                                                            setSearchTerm(item.noTrx);
                                                        }} 
                                                        className="text-violet-600 hover:bg-violet-50 p-1 rounded-md transition-colors"
                                                    >
                                                        <Eye size={14}/>
                                                    </button>
                                                )}
                                                {activeView === 'Penawaran' && (
                                                    <>
                                                        <button 
                                                           title="Add Follow Up" 
                                                           onClick={(e) => { 
                                                               e.stopPropagation(); 
                                                               setCurrentTrx(item); 
                                                               setEditingFollowUpIdx(null);
                                                               setNewFollowUp({tanggal: new Date().toISOString().split('T')[0], keterangan: '', method: 'WhatsApp'});
                                                               setShowDrawer('followUpForm'); 
                                                           }} 
                                                           className="text-purple-600 hover:bg-purple-50 p-1 rounded-md transition-colors"
                                                        >
                                                           <MessageSquare size={14}/>
                                                        </button>
                                                        <button 
                                                            title="Print Penawaran" 
                                                            onClick={(e) => { e.stopPropagation(); handlePrintPenawaran(item as Transaction); }} 
                                                            className="text-blue-600 hover:bg-blue-50 p-1 rounded-md transition-colors"
                                                        >
                                                            <Printer size={14}/>
                                                        </button>
                                                        <button 
                                                           title="Buat Invoice" 
                                                           onClick={(e) => { e.stopPropagation(); handleConvertQuotation(item); }} 
                                                           className="text-green-600 hover:bg-green-50 p-1 rounded-md transition-colors"
                                                        >
                                                            <ArrowRightCircle size={14}/>
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setCurrentTrx(item); setShowDrawer('trx'); }} 
                                                            className="text-slate-400 hover:text-orange-600 p-1 rounded-md hover:bg-slate-50 transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit size={14}/>
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} 
                                                            className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-slate-50 transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14}/>
                                                        </button>
                                                    </>
                                                )}
                                                {activeView === 'Invoice' && (
                                                    <>
                                                        <button title="Proses Pembayaran" onClick={(e) => { e.stopPropagation(); handlePaymentComplete(item); }} className="text-green-600 hover:bg-green-50 p-1 rounded-md transition-colors"><ArrowRight size={14}/></button>
                                                        <button title="Print Invoice" onClick={(e) => { e.stopPropagation(); handlePrintInvoice(item); }} className="text-blue-600 hover:bg-blue-50 p-1 rounded-md transition-colors"><Printer size={14}/></button>
                                                        <button title="Batal Transaksi" onClick={(e) => { e.stopPropagation(); confirmAction('Konfirmasi Batal', 'Apakah Anda yakin ingin membatalkan transaksi ini?', () => updateTransactionStatus(item.id, 'Batal'), 'danger'); }} className="text-red-500 hover:bg-red-50 p-1 rounded-md transition-colors"><X size={14}/></button>
                                                    </>
                                                )}
                                                {activeView === 'Pembayaran' && (
                                                    <>
                                                        <button title="Proses Pengiriman" onClick={(e) => { e.stopPropagation(); confirmAction('Proses Pengiriman', 'Apakah Anda yakin ingin memproses pengiriman untuk pesanan ini?', () => updateTransactionStatus(item.id, 'Pengiriman'), 'info'); }} className="text-green-600 hover:bg-green-50 p-1 rounded-md transition-colors"><Truck size={14}/></button>
                                                        <button title="Terima Pembayaran" onClick={(e) => { e.stopPropagation(); handlePaymentComplete(item); }} className="text-violet-600 hover:bg-violet-50 p-1 rounded-md transition-colors"><Wallet size={14}/></button>
                                                    </>
                                                )}
                                                {activeView === 'Pengiriman' && (
                                                    <>
                                                        <button title="Selesai" onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            if (item.paymentStatus !== 'Lunas') {
                                                                setConfirmModal({
                                                                    isOpen: true,
                                                                    type: 'info',
                                                                    title: 'Pesanan Belum Lunas',
                                                                    message: 'pesanan belum lunas harap lunasi transaksi terlebih dahulu di menu belum lunas',
                                                                    confirmText: 'Lihat',
                                                                    onConfirm: () => {
                                                                        setActiveView('Belum Lunas');
                                                                        setSearchTerm(item.noTrx);
                                                                        setConfirmModal(null);
                                                                    }
                                                                });
                                                                return;
                                                            }
                                                            confirmAction('Konfirmasi Selesai', 'Apakah Anda yakin ingin menandai transaksi ini sebagai selesai?', () => {
                                                                updateTransactionStatus(item.id, 'Selesai');
                                                                setActiveView('Pesanan Selesai');
                                                            });
                                                        }} className="text-green-600 hover:bg-green-50 p-1 rounded-md transition-colors"><CheckCircle size={14}/></button>
                                                        <button onClick={(e) => { e.stopPropagation(); setCurrentTrx(item); setShowDrawer('inputResi'); }} className="text-blue-600 hover:bg-blue-50 p-1 rounded-md transition-colors" title="Input Resi">
                                                            <Plus size={14}/>
                                                        </button>
                                                    </>
                                                )}
                                                {!['PPN', 'Ongkir', 'Pesanan Selesai', 'Invoice', 'Pengiriman', 'Belum Lunas', 'Pesanan Batal', 'NON PPN', 'Transaksi', 'Penawaran', 'Pembayaran'].includes(activeView) && (
                                                    <>
                                                        <button 
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                if(activeView === 'Contacts') { setCurrentCust(item); setShowDrawer('cust'); } 
                                                                 else if(activeView === 'Produk') { 
                                                                    setCurrentProd(item); 
                                                                    const latestLot = item.lots && item.lots.length > 0 ? item.lots[item.lots.length - 1] : null;
                                                                    setTempStock({
                                                                        stock: 0, 
                                                                        hpp: latestLot ? latestLot.hpp : (item.hpp || 0), 
                                                                        hargaJual: latestLot ? latestLot.hargaJual : (getProductPrice(item) || 0), 
                                                                        supplierId: latestLot ? latestLot.supplierId : ''
                                                                    });
                                                                    setShowDrawer('prod'); 
                                                                 } 
                                                                else if(activeView === 'Suppliers') { setCurrentSupp(item); setShowDrawer('supp'); } 
                                                                else if(activeView === 'Purchase Orders' || activeView === 'Procurement') { setCurrentPO(item); setShowDrawer('po'); }
                                                                else { 
                                                                    const trx = { ...item };
                                                                    if (trx.jasaKirim && !SHIPPING_SERVICES.includes(trx.jasaKirim)) {
                                                                        trx.customJasaKirim = trx.jasaKirim;
                                                                        trx.jasaKirim = 'Lainnya';
                                                                    }
                                                                    setCurrentTrx(trx); 
                                                                    setShowDrawer('trx'); 
                                                                } 
                                                            }} 
                                                            className="text-slate-400 hover:text-orange-600 p-1 rounded-md hover:bg-slate-50 transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit size={14}/>
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} 
                                                            className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-slate-50 transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14}/>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                     </div>
                                 </div>
                             </div>
                          ))
                      ) : (
                      /* DESKTOP TABLE VIEW */
                      <div ref={mainTableRef} className="overflow-x-auto w-full scroll-smooth">
                        <table className="min-w-full divide-y divide-border bg-card text-card-foreground">
                            <thead>
                                <tr>
                                    {activeView === 'Contacts' && (
                                        <th className={thClass}>Name</th>
                                    )}
                                    {activeView === 'Produk' && (
                                        <>
                                            <th className={thClass}>Product Name</th>
                                            <th className={thClass}>Code</th>
                                            <th className={thClass}>Stock</th>
                                            {activeModule !== 'Stocklist' && <th className={thClass}>Price</th>}
                                            {activeModule !== 'Stocklist' && <th className={thClass}>HPP</th>}
                                            <th className={thClass}>Supplier</th>
                                        </>
                                    )}
                                    {activeView === 'Suppliers' && (
                                        <>
                                            <th className={thClass}>Supplier Name</th>
                                            <th className={thClass}>Code</th>
                                            <th className={thClass}>Ket.</th>
                                        </>
                                    )}
                                    {activeView === 'Purchase Orders' && (
                                        <>
                                            <th className={thClass}>Product</th>
                                            <th className={thClass}>Supplier</th>
                                            <th className={thClass}>Date</th>
                                            <th className={thClass}>Qty</th>
                                            <th className={thClass}>Status</th>
                                        </>
                                    )}
                                    {['Transaksi', 'Invoice', 'Pembayaran', 'Penawaran', 'Pesanan Selesai', 'Pesanan Batal', 'Belum Lunas', 'PPN', 'NON PPN'].includes(activeView) && (
                                        <>
                                            <th className={thClass}>{activeView === 'Penawaran' ? 'Quotation #' : 'Invoice #'}</th>
                                            <th className={thClass}>Date</th>
                                            <th className={thClass}>Customer</th>
                                            <th className={thClass} align="right">{activeView === 'Penawaran' ? '' : 'Amount'}</th>
                                            {activeView === 'Belum Lunas' && (
                                                <>
                                                    <th className={thClass} align="right">Sisa</th>
                                                    <th className={thClass}>Jatuh Tempo</th>
                                                </>
                                            )}
                                            {activeView === 'PPN' && <th className={thClass} align="right">PPN (11%)</th>}
                                            <th className={thClass}>Sales Rep</th>
                                            <th className={thClass}>Keterangan</th>
                                            {activeView === 'Penawaran' && <th className={thClass}>Last Follow Up</th>}
                                            <th className={thClass} align="center">Status</th>
                                        </>
                                    )}
                                    {activeView === 'Ongkir' && (
                                        <>
                                            <th className={thClass}>Invoice #</th>
                                            <th className={thClass}>Date</th>
                                            <th className={thClass}>Customer</th>
                                            <th className={thClass} align="right">Ongkir</th>
                                            <th className={thClass}>Expedition</th>
                                            <th className={thClass}>Keterangan</th>
                                            <th className={thClass}>No. Resi</th>
                                            <th className={thClass}>Sales Rep</th>
                                        </>
                                    )}
                                    {activeView === 'Employees' && (
                                        <>
                                            <th className={thClass}>Nama</th>
                                            <th className={thClass}>NIK</th>
                                            <th className={thClass}>Role</th>
                                            <th className={thClass}>WhatsApp</th>
                                            <th className={thClass}>Email</th>
                                        </>
                                    )}
                                    {activeView === 'Users' && (
                                        <>
                                            <th className={thClass}>Nama</th>
                                            <th className={thClass}>Username</th>
                                            <th className={thClass}>WhatsApp</th>
                                            <th className={thClass}>Role</th>
                                            <th className={thClass} align="center">Action</th>
                                        </>
                                    )}
                                    {activeView === 'Access Control' && (
                                        <>
                                            <th className={thClass}>Nama User</th>
                                            <th className={thClass}>Username</th>
                                            <th className={thClass}>Role</th>
                                            <th className={thClass}>Status Akses</th>
                                            <th className={thClass} align="center">Action</th>
                                        </>
                                    )}
                                    {activeView === 'Recycle Bin' && (
                                        <>
                                            <th className={thClass}>Type</th>
                                            <th className={thClass}>Name/No. Trx</th>
                                            <th className={thClass}>Deleted At</th>
                                            <th className={thClass}>Dihapus Oleh</th>
                                            <th className={thClass} align="center">Action</th>
                                        </>
                                    )}
                                    {activeView === 'Pengiriman' && (
                                        <>
                                            <th className={thClass}>Invoice #</th>
                                            <th className={thClass}>Customer</th>
                                            <th className={thClass}>Jasa Kirim</th>
                                            <th className={thClass}>Keterangan</th>
                                            <th className={thClass}>No. Resi</th>
                                            <th className={thClass} align="center">Action</th>
                                        </>
                                    )}
                                    {/* ACTION COLUMN HEADER */}
                                    {(activeView === 'Contacts' || activeView === 'Employees' || activeView === 'Produk' || activeView === 'Suppliers' || ['Transaksi', 'Invoice', 'Pembayaran', 'Penawaran', 'Pesanan Selesai', 'Pesanan Batal', 'PPN', 'NON PPN', 'Ongkir', 'Belum Lunas', 'Purchase Orders', 'Procurement'].includes(activeView)) && (
                                        <th className={thClass} align="center">Action</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {/* CUSTOMERS DATA */}
                                {activeView === 'Contacts' && viewData.map((c: Customer, i) => (
                                    <tr 
                                        key={c.id} 
                                        className={getTableRowClass(i, selectedIds.includes(c.id))}
                                        onClick={() => { setCurrentCust(c); setShowDrawer('custDetail'); }}
                                    >
                                        <td className={tdClass}>
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    className="cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.includes(c.id) ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-input'}`}>
                                                        {selectedIds.includes(c.id) && <Check size={10} strokeWidth={4} />}
                                                    </div>
                                                </div>
                                                <span className="font-medium text-[#A91D3A] hover:underline cursor-pointer">{c.nama}</span>
                                            </div>
                                        </td>
                                        <td className={tdClass} align="center">
                                            <div className="flex items-center justify-center gap-1">
                                                <a 
                                                    href={`https://wa.me/${(c.phoneCode || '+62').replace('+', '')}${c.phone}`} 
                                                    target="_blank" 
                                                    rel="noreferrer"
                                                    className="text-emerald-500 hover:text-emerald-600 p-1 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="WhatsApp"
                                                >
                                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                                </a>
                                                {c.email && (
                                                    <a 
                                                        href={`mailto:${c.email}`}
                                                        className="text-blue-500 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="Email"
                                                    >
                                                        <Mail size={18}/>
                                                    </a>
                                                )}
                                                {canEditCurrentView && (
                                                    <button 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setConfirmModal({
                                                                isOpen: true,
                                                                title: 'Konfirmasi Edit',
                                                                message: 'Apakah Anda yakin ingin mengubah data kontak ini?',
                                                                type: 'warning',
                                                                onConfirm: () => {
                                                                    setCurrentCust(c); 
                                                                    setShowDrawer('cust');
                                                                    setConfirmModal(null);
                                                                }
                                                            });
                                                        }} 
                                                        className="text-slate-400 hover:text-orange-600 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800"
                                                    >
                                                        <Plus size={18}/>
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        setCurrentCust(c); 
                                                        setShowDrawer('custDetail'); 
                                                    }} 
                                                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800"
                                                    title="Lihat Detail Kontak"
                                                >
                                                    <Eye size={18}/>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {activeView === 'Employees' && viewData.map((e: Employee, i) => (
                                    <tr 
                                        key={e.id} 
                                        className={getTableRowClass(i)}
                                        onClick={() => { setCurrentEmp(e); setShowDrawer('empDetail'); }}
                                    >
                                        <td className={tdClass}>{e.nama}</td>
                                        <td className={tdClass}>{e.nik}</td>
                                        <td className={tdClass}><span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">{e.role}</span></td>
                                        <td className={tdClass}>
                                           <a 
                                               href={`https://wa.me/${e.whatsapp.startsWith('62') ? e.whatsapp : '62' + e.whatsapp.replace(/^0/, '')}`} 
                                               target="_blank" 
                                               rel="noreferrer"
                                               className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-bold"
                                               onClick={(ev) => ev.stopPropagation()}
                                           >
                                               <MessageSquare size={14} /> {e.whatsapp.startsWith('62') ? '+' + e.whatsapp : e.whatsapp}
                                           </a>
                                        </td>
                                        <td className={tdClass}>{e.email}</td>
                                        <td className={tdClass} align="center">
                                            {canEditCurrentView && (
                                                <button onClick={(event) => { event.stopPropagation(); setCurrentEmp(e); setShowDrawer('emp'); }} className="text-violet-600 hover:text-violet-800 p-1 rounded-full hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"><Edit size={16}/></button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {activeView === 'Users' && viewData.map((u: UserAccount, i) => (
                                    <tr 
                                        key={`${u.id || u.username || i}-${i}`} 
                                        className={getTableRowClass(i)}
                                        onClick={() => { setCurrentAppUser(u); setShowDrawer('appUserDetail'); }}
                                    >
                                        <td className={tdClass}>{u.nama}</td>
                                        <td className={tdClass}>{u.username}</td>
                                        <td className={tdClass}>
                                           <a 
                                               href={`https://wa.me/${u.whatsapp}`} 
                                               target="_blank" 
                                               rel="noreferrer"
                                               className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-bold font-mono"
                                               onClick={(ev) => ev.stopPropagation()}
                                           >
                                               <MessageSquare size={14} /> +{u.whatsapp}
                                           </a>
                                        </td>
                                        <td className={tdClass}><span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">{u.role}</span></td>
                                        <td className={tdClass} align="center">
                                            <div className="flex items-center justify-center gap-2">
                                                {canEditCurrentView && (
                                                    <button onClick={(event) => { event.stopPropagation(); setCurrentAppUser(u); setShowDrawer('appUser'); }} className="text-violet-600 hover:text-violet-800 p-1 rounded-full hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"><Edit size={16}/></button>
                                                )}
                                                {canEditCurrentView && (
                                                    <button onClick={(event) => { event.stopPropagation(); handleDelete(u.id); }} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"><Trash2 size={16}/></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {activeView === 'Access Control' && viewData.map((u: UserAccount, i) => (
                                    <tr 
                                        key={`${u.id || u.username || i}-${i}`} 
                                        className={getTableRowClass(i)}
                                        onClick={() => { setCurrentAppUser(u); setShowDrawer('appUserAccess'); }}
                                    >
                                        <td className={tdClass}>{u.nama}</td>
                                        <td className={tdClass}>{u.username}</td>
                                        <td className={tdClass}><span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-100 text-violet-700">{u.role}</span></td>
                                        <td className={tdClass}>
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck size={14} className={u.permissions && u.permissions.length > 0 ? "text-violet-600" : "text-slate-300"} />
                                                <span className="text-xs font-semibold">
                                                    {u.permissions ? `${u.permissions.filter(p => p.canView).length} Menu Aktif` : 'Default (Full Access)'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className={tdClass} align="center">
                                            <div className="flex items-center justify-center gap-2">
                                                {canEditCurrentView && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setCurrentAppUser(u); setShowDrawer('appUserAccess'); }}
                                                        className="bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded shadow-sm transition-all"
                                                    >
                                                        Akses
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {activeView === 'Produk' && viewData.map((p: Product, i) => (
                                    <tr 
                                        key={p.id} 
                                        className={getTableRowClass(i, selectedIds.includes(p.id))}
                                        onClick={() => { setCurrentProd(p); setShowDrawer('prodDetail'); }}
                                    >
                                        <td className={tdClass}>
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    className="cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.includes(p.id) ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-input'}`}>
                                                        {selectedIds.includes(p.id) && <Check size={10} strokeWidth={4} />}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 bg-muted rounded overflow-hidden flex items-center justify-center text-muted-foreground border border-border">
                                                        {p.images && p.images.length > 0 ? (
                                                            <img src={p.images[0]} alt={p.nama} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Box size={14}/>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-foreground">{p.nama}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">KODE: {p.kode || '-'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className={tdClass}><span className="font-mono text-xs">{p.kode}</span></td>
                                        <td className={tdClass}>
                                            <div className="flex items-center gap-2 group/edit">
                                                <span>{getAvailableStock(p.nama)} {p.satuan}</span>
                                                {canEditCurrentView && <button onClick={(e) => handleQuickUpdateProduct(p, 'stock')} className="text-muted-foreground hover:text-primary opacity-0 group-hover/edit:opacity-100 transition-opacity"><Edit size={12} /></button>}
                                            </div>
                                        </td>
                                        {activeModule !== 'Stocklist' && (
                                            <td className={tdClass}>
                                                <div className="flex items-center gap-2 group/edit">
                                                    <span>{formatRupiah(getProductPrice(p))}</span>
                                                    {canEditCurrentView && <button onClick={(e) => handleQuickUpdateProduct(p, 'hargaJual')} className="text-muted-foreground hover:text-primary opacity-0 group-hover/edit:opacity-100 transition-opacity"><Edit size={12} /></button>}
                                                </div>
                                            </td>
                                        )}
                                        {activeModule !== 'Stocklist' && (
                                            <td className={tdClass}>
                                                <div className="flex items-center gap-2 group/edit">
                                                    <span>{getProductHPP(p) > 0 ? formatRupiah(getProductHPP(p)) : '-'}</span>
                                                    {canEditCurrentView && <button onClick={(e) => handleQuickUpdateProduct(p, 'hpp')} className="text-muted-foreground hover:text-primary opacity-0 group-hover/edit:opacity-100 transition-opacity"><Edit size={12} /></button>}
                                                </div>
                                            </td>
                                        )}
                                        <td className={tdClass}>{getSupplierName(p)}</td>
                                         <td className={tdClass} align="center">
                                            <div className="flex items-center justify-center gap-1">
                                                {canEditCurrentView && (
                                                    <button 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setConfirmModal({
                                                                isOpen: true,
                                                                title: 'Konfirmasi Edit',
                                                                message: 'Apakah Anda yakin ingin mengubah data produk ini?',
                                                                type: 'warning',
                                                                onConfirm: () => {
                                                                    setCurrentProd(p); 
                                                                    const latestLot = p.lots && p.lots.length > 0 ? p.lots[p.lots.length - 1] : null;
                                                                    setTempStock({
                                                                        stock: 0, 
                                                                        hpp: latestLot ? latestLot.hpp : (p.hpp || 0), 
                                                                        hargaJual: latestLot ? latestLot.hargaJual : (getProductPrice(p) || 0), 
                                                                        supplierId: latestLot ? latestLot.supplierId : ''
                                                                    });
                                                                    setShowDrawer('prod');
                                                                    setConfirmModal(null);
                                                                }
                                                            });
                                                        }} 
                                                        className="text-slate-400 hover:text-orange-600 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800"
                                                    >
                                                        <Plus size={18}/>
                                                    </button>
                                                )}
                                                {canEditCurrentView && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="text-slate-400 hover:text-red-600 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800"><Trash2 size={18}/></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {/* SUPPLIERS DATA */}
                                {activeView === 'Suppliers' && viewData.map((s: Supplier, i) => (
                                    <tr 
                                        key={s.id} 
                                        className={getTableRowClass(i, selectedIds.includes(s.id))}
                                        onClick={() => { setCurrentSupp(s); setShowDrawer('suppDetail'); }}
                                    >
                                        <td className={tdClass}>
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    className="cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); toggleSelect(s.id); }}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.includes(s.id) ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-input'}`}>
                                                        {selectedIds.includes(s.id) && <Check size={10} strokeWidth={4} />}
                                                    </div>
                                                </div>
                                                <span className="font-medium text-foreground">{s.nama}</span>
                                            </div>
                                        </td>
                                        <td className={tdClass}><span className="font-mono text-xs">{s.kode}</span></td>
                                        <td className={tdClass}>
                                            <div className="max-w-[150px] truncate" title={s.keterangan || '-'}>{s.keterangan || '-'}</div>
                                        </td>
                                        <td className={tdClass} align="center">
                                            <div className="flex items-center justify-center gap-1">
                                                {s.website && (
                                                    <a 
                                                        href={s.website.startsWith('http') ? s.website : `https://${s.website}`}
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className="text-violet-500 hover:text-violet-600 p-1 rounded-full hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="Website"
                                                    >
                                                        <Globe size={18}/>
                                                    </a>
                                                )}
                                                {canEditCurrentView && (
                                                    <button 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setConfirmModal({
                                                                isOpen: true,
                                                                title: 'Konfirmasi Edit',
                                                                message: 'Apakah Anda yakin ingin mengubah data supplier ini?',
                                                                type: 'warning',
                                                                onConfirm: () => {
                                                                    setCurrentSupp(s); 
                                                                    setShowDrawer('supp');
                                                                    setConfirmModal(null);
                                                                }
                                                            });
                                                        }} 
                                                        className="text-slate-400 hover:text-orange-600 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800"
                                                    >
                                                        <Plus size={18}/>
                                                    </button>
                                                )}
                                                {canEditCurrentView && (
                                                    <button onClick={(e) => { e.stopPropagation(); setSuppliers(prev => prev.filter(sup => sup.id !== s.id)); }} className="text-slate-400 hover:text-red-600 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800"><Trash2 size={18}/></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {(activeView === 'Purchase Orders' || activeView === 'Procurement') && (viewData as PurchaseOrder[]).map((po, i) => (
                                    <tr 
                                        key={po.id} 
                                        className={getTableRowClass(i, selectedIds.includes(po.id))}
                                        onClick={() => { setCurrentPO(po); setShowDrawer('poDetail'); }}
                                    >
                                        <td className={tdClass}>
                                            {po.items && po.items.length > 0 ? (
                                                <div>
                                                    <div className="font-bold">{po.items[0].nama}</div>
                                                    {po.items.length > 1 && <div className="text-[10px] text-violet-600 font-bold">+ {po.items.length - 1} produk lainnya</div>}
                                                </div>
                                            ) : (products.find(p => p.id === po.produkId)?.nama || '-')}
                                        </td>
                                        <td className={tdClass}>{suppliers.find(s => s.id === po.supplierId)?.nama || '-'}</td>
                                        <td className={tdClass}>{po.tanggalPembelian}</td>
                                        <td className={tdClass}>
                                            {po.items && po.items.length > 0 
                                                ? po.items.reduce((acc, curr) => acc + curr.jumlah, 0) 
                                                : po.jumlah}
                                        </td>
                                        <td className={tdClass}>{po.status}</td>
                                        <td className={tdClass} align="center">
                                            <div className="flex items-center justify-center gap-1">
                                                {activeModule !== 'Stocklist' && po.status === 'Process' && canEditCurrentView && (
                                                    <button onClick={(e) => {
                                                        e.stopPropagation();
                                                        confirmAction('Konfirmasi Terima', 'Apakah Anda yakin ingin menerima PO ini? Tanggal terima akan diset ke hari ini.', () => {
                                                            const date = new Date().toISOString().split('T')[0];
                                                            const updatedPO = { ...po, status: 'Received' as const, tanggalDiterima: date };
                                                            syncToSupabase('purchase_orders', updatedPO);
                                                            setPurchaseOrders(prev => prev.map(p => p.id === po.id ? updatedPO : p));
                                                            if (currentPO.id === po.id) setCurrentPO(updatedPO);
                                                            
                                                            setProducts(prev => prev.map(p => {
                                                                if (po.items && po.items.length > 0) {
                                                                    const poItem = po.items.find(i => i.produkId === p.id);
                                                                    if (poItem) {
                                                                        return { 
                                                                            ...p, 
                                                                            lots: [...(p.lots || []), { 
                                                                                lot: Date.now() + Math.floor(Math.random() * 1000), 
                                                                                kode: 'AUTO', 
                                                                                supplierId: po.supplierId, 
                                                                                stock: poItem.jumlah, 
                                                                                hpp: poItem.hpp, 
                                                                                hargaJual: 0, 
                                                                                tanggal: date 
                                                                            }] 
                                                                        };
                                                                    }
                                                                } else if (p.id === po.produkId) {
                                                                    return { 
                                                                        ...p, 
                                                                        lots: [...(p.lots || []), { 
                                                                            lot: Date.now(), 
                                                                            kode: 'AUTO', 
                                                                            supplierId: po.supplierId, 
                                                                            stock: po.jumlah || 0, 
                                                                            hpp: (po.harga || 0) / (po.jumlah || 1), 
                                                                            hargaJual: 0, 
                                                                            tanggal: date 
                                                                        }] 
                                                                    };
                                                                }
                                                                return p;
                                                            }));
                                                        });
                                                    }} className="bg-green-500 text-white px-2 py-1 rounded text-xs mr-1">Terima</button>
                                                )}
                                                {activeModule !== 'Stocklist' && po.status === 'Received' && canEditCurrentView && (
                                                    <button onClick={(e) => {
                                                        e.stopPropagation();
                                                        confirmAction('Konfirmasi Lunas', 'Apakah Anda yakin ingin menandai PO ini sebagai Lunas?', () => {
                                                            const updatedPO = { ...po, status: 'Lunas' as const };
                                                            syncToSupabase('purchase_orders', updatedPO);
                                                            setPurchaseOrders(prev => prev.map(p => p.id === po.id ? updatedPO : p));
                                                            if (currentPO.id === po.id) setCurrentPO(updatedPO);
                                                        });
                                                    }} className="bg-blue-500 text-white px-2 py-1 rounded text-xs">Lunas</button>
                                                )}
                                                {canEditCurrentView && (
                                                    <button title="Edit" onClick={(e) => { e.stopPropagation(); setCurrentPO(po); setShowDrawer('po'); }} className="text-slate-400 hover:text-orange-600 p-1"><Edit size={16}/></button>
                                                )}
                                                {canEditCurrentView && (
                                                    <button title="Hapus" onClick={(e) => { e.stopPropagation(); handleDelete(po.id); }} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {/* TRANSAKSI DATA (Include Invoice, Selesai, Batal, Lunas, Belum Lunas, Orders, Shipments, PPN, Ongkir) */}
                                {['Transaksi', 'Invoice', 'Pembayaran', 'Penawaran', 'Pesanan Selesai', 'Pesanan Batal', 'Belum Lunas', 'PPN', 'NON PPN', 'Ongkir'].includes(activeView) && (viewData as Transaction[]).map((t, i) => (
                                    <tr 
                                        key={t.id} 
                                        className={getTableRowClass(i, selectedIds.includes(t.id))}
                                        onClick={() => handleTrxClick(t)}
                                    >
                                        <td className={tdClass}>
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    className="cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); toggleSelect(t.id); }}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.includes(t.id) ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-input'}`}>
                                                        {selectedIds.includes(t.id) && <Check size={10} strokeWidth={4} />}
                                                    </div>
                                                </div>
                                                <span className="font-medium text-[#A91D3A]">{t.noTrx}</span>
                                            </div>
                                        </td>
                                        <td className={tdClass}>{t.tanggal}</td>
                                        <td className={tdClass}>{t.customerName}</td>
                                        
                                        {activeView === 'Ongkir' ? (
                                            <>
                                                <td className={tdClass} align="right">{formatRupiah(t.biayaOngkir || 0)}</td>
                                                <td className={tdClass}>{t.jasaKirim || '-'}</td>
                                                <td className={tdClass}>
                                                    <div className="text-xs text-slate-500 truncate max-w-[150px]" title={t.keterangan}>
                                                        {t.keterangan || '-'}
                                                    </div>
                                                </td>
                                                <td className={tdClass}><span className="font-mono text-xs">{t.noResi || '-'}</span></td>
                                            </>
                                        ) : (
                                            <>
                                                <td className={tdClass} align="right">{(t.statuses || []).includes('Penawaran') ? '-' : formatRupiah(t.nilaiProyek)}</td>
                                                {activeView === 'Belum Lunas' && (
                                                    <>
                                                        <td className={`${tdClass} text-red-600 font-bold`} align="right">
                                                            {formatRupiah(t.sisaPembayaran || 0)}
                                                        </td>
                                                        <td className={`${tdClass} text-orange-600 font-bold`}>
                                                            {t.jatuhTempo || '-'}
                                                        </td>
                                                    </>
                                                )}
                                                {activeView === 'PPN' && (
                                                    <td className={`${tdClass} text-blue-600 font-bold`} align="right">
                                                        {formatRupiah(t.nilaiProyek * 0.11)}
                                                    </td>
                                                )}
                                            </>
                                        )}

                                        <td className={tdClass}>{t.sales}</td>
                                        <td className={tdClass}>
                                            <div className="text-xs text-slate-500 truncate max-w-[150px]" title={t.keterangan}>
                                                {t.keterangan || '-'}
                                            </div>
                                        </td>
                                        {activeView === 'Penawaran' && (
                                            <td className={tdClass}>
                                                {t.followUps && t.followUps.length > 0 ? (
                                                    <div className="text-[10px]">
                                                        <div className="font-bold">{t.followUps[t.followUps.length - 1].tanggal}</div>
                                                        <div className="text-slate-400 truncate max-w-[100px]">{t.followUps[t.followUps.length - 1].keterangan}</div>
                                                    </div>
                                                ) : '-'}
                                            </td>
                                        )}
                                        {activeView !== 'Ongkir' && (
                                            <td className={tdClass} align="center">
                                                <div className="flex flex-wrap gap-1 justify-center">
                                                    {(() => {
                                                        const s = t.status || t.statuses[0];
                                                        const displayStatus = 
                                                            s === 'Progress' ? 'Progress' : 
                                                            s === 'Invoice' ? 'Invoice' :
                                                            s === 'Payment' ? 'Pembayaran' : 
                                                            s === 'Pengiriman' ? 'Pengiriman' :
                                                            s === 'Selesai' ? 'Pesanan Selesai' : s;
                                                        return (
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase 
                                                                ${s==='Selesai' ? 'bg-green-100 text-green-700' : 
                                                                s==='Progress' ? 'bg-blue-100 text-blue-700' : 
                                                                s==='Payment' ? 'bg-indigo-100 text-indigo-700' :
                                                                s==='Pengiriman' ? 'bg-orange-100 text-orange-700' :
                                                                s==='Penawaran' ? 'bg-purple-100 text-purple-700' :
                                                                'bg-red-100 text-red-700'}`}>
                                                                {displayStatus}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                        )}
                                        <td className={tdClass} align="center">
                                            <div className="flex items-center justify-center gap-2">
                                                {(() => {
                                                    const contact = getContactInfo(t);
                                                    if (!contact) return null;
                                                    return (
                                                        <>
                                                            {contact.phone && (
                                                                <a 
                                                                    href={`https://wa.me/${(contact.phoneCode || '+62').replace('+', '')}${contact.phone}`} 
                                                                    target="_blank" 
                                                                    rel="noreferrer"
                                                                    className="text-emerald-500 hover:text-emerald-600 p-1 rounded-full hover:bg-emerald-50 transition-colors"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="WhatsApp"
                                                                >
                                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.83c0 2.104.547 4.158 1.588 5.976L0 24l6.335-1.662c1.808.986 3.848 1.506 5.923 1.506h.005c6.554 0 11.89-5.335 11.893-11.83a11.79 11.79 0 00-3.48-8.367z" /></svg>
                                                                </a>
                                                            )}
                                                            {contact.email && (
                                                                <a 
                                                                    href={`mailto:${contact.email}`}
                                                                    className="text-blue-500 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 transition-colors"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="Email"
                                                                >
                                                                    <Mail size={16}/>
                                                                </a>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                                {/* Transaksi View Actions */}
                                                {activeView === 'Transaksi' && (
                                                    <button 
                                                        title="Lihat Transaksi" 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            const s = t.status || t.statuses[0];
                                                            let targetView = 'Transaksi';
                                                            if (s === 'Penawaran') targetView = 'Penawaran';
                                                            else if (s === 'Invoice') targetView = 'Invoice';
                                                            else if (s === 'Payment') targetView = t.paymentStatus === 'Belum Lunas' ? 'Belum Lunas' : 'Pembayaran';
                                                            else if (s === 'Pengiriman') targetView = 'Pengiriman';
                                                            else if (s === 'Selesai') targetView = 'Pesanan Selesai';
                                                            else if (s === 'Batal') targetView = 'Pesanan Batal';
                                                            
                                                            setActiveView(targetView);
                                                            setSearchTerm(t.noTrx);
                                                        }} 
                                                        className="text-slate-400 hover:text-violet-600 p-1"
                                                    >
                                                        <Eye size={16}/>
                                                    </button>
                                                )}
                                                 {activeView === 'Penawaran' && canEditCurrentView && (
                                                     <>
                                                         <button 
                                                            title="Add Follow Up" 
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                setCurrentTrx(t); 
                                                                setEditingFollowUpIdx(null);
                                                                setNewFollowUp({tanggal: new Date().toISOString().split('T')[0], keterangan: '', method: 'WhatsApp'});
                                                                setShowDrawer('followUpForm'); 
                                                            }} 
                                                            className="text-slate-400 hover:text-purple-600 p-1"
                                                         >
                                                            <MessageSquare size={16}/>
                                                         </button>
                                                         <button title="Print Penawaran" onClick={(e) => { e.stopPropagation(); handlePrintPenawaran(t); }} className="text-slate-400 hover:text-blue-600 p-1"><Printer size={16}/></button>
                                                         <button title="Buat Invoice" onClick={(e) => { 
                                                              e.stopPropagation(); 
                                                              handleConvertQuotation(t);
                                                          }} className="text-slate-400 hover:text-green-600 p-1"><ArrowRightCircle size={16}/></button>
                                                          <button title="Edit" onClick={(e) => { e.stopPropagation(); setCurrentTrx(t); setShowDrawer('trx'); }} className="text-slate-400 hover:text-orange-600 p-1"><Edit size={16}/></button>
                                                          <button title="Hapus" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                                                     </>
                                                 )}
                                                 {/* Invoice View Actions */}
                                                {activeView === 'Invoice' && (
                                                    <>
                                                        {canEditCurrentView && (
                                                            <button title="Proses Pembayaran" onClick={(e) => { e.stopPropagation(); handlePaymentComplete(t); }} className="text-slate-400 hover:text-green-600 p-1"><ArrowRight size={16}/></button>
                                                        )}
                                                        <button title="Print Invoice" onClick={(e) => { e.stopPropagation(); handlePrintInvoice(t); }} className="text-slate-400 hover:text-blue-600 p-1"><Printer size={16}/></button>
                                                        {canEditCurrentView && (
                                                            <button title="Batal Transaksi" onClick={(e) => { e.stopPropagation(); confirmAction('Konfirmasi Batal', 'Apakah Anda yakin ingin membatalkan transaksi ini?', () => updateTransactionStatus(t.id, 'Batal'), 'danger'); }} className="text-slate-400 hover:text-red-600 p-1"><X size={16}/></button>
                                                        )}
                                                    </>
                                                )}
                                                 {activeView === 'Pembayaran' && (
                                                     <>
                                                         {canEditCurrentView && (
                                                            <button title="Proses Pengiriman" onClick={(e) => { e.stopPropagation(); confirmAction('Proses Pengiriman', 'Apakah Anda yakin ingin memproses pengiriman untuk pesanan ini?', () => updateTransactionStatus(t.id, 'Pengiriman'), 'info'); }} className="text-slate-400 hover:text-green-600 p-1"><Truck size={16}/></button>
                                                         )}
                                                         {canEditCurrentView && (
                                                            <button title="Terima Pembayaran" onClick={(e) => { e.stopPropagation(); handlePaymentComplete(t); }} className="text-slate-400 hover:text-violet-600 p-1"><Wallet size={16}/></button>
                                                         )}
                                                         {canEditCurrentView && (
                                                            <button title="Edit" onClick={(e) => { e.stopPropagation(); setCurrentTrx(t); setShowDrawer('trx'); }} className="text-slate-400 hover:text-orange-600 p-1"><Edit size={16}/></button>
                                                         )}
                                                     </>
                                                 )}
                                                 {activeView === 'Pengiriman' && (
                                                     <>
                                                         {canEditCurrentView && (
                                                            <button title="Selesai" onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                if (t.paymentStatus !== 'Lunas') {
                                                                    setConfirmModal({
                                                                        isOpen: true,
                                                                        type: 'info',
                                                                        title: 'Pesanan Belum Lunas',
                                                                        message: 'pesanan belum lunas harap lunasi transaksi terlebih dahulu di menu belum lunas',
                                                                        confirmText: 'Lihat',
                                                                        onConfirm: () => {
                                                                            setActiveView('Belum Lunas');
                                                                            setSearchTerm(t.noTrx);
                                                                            setConfirmModal(null);
                                                                        }
                                                                    });
                                                                    return;
                                                                }
                                                                updateTransactionStatus(t.id, 'Selesai');
                                                                setActiveView('Pesanan Selesai');
                                                            }} className="text-slate-400 hover:text-green-600 p-1"><CheckCircle size={16}/></button>
                                                         )}
                                                         {canEditCurrentView && (
                                                            <button title="Input Resi" onClick={(e) => { e.stopPropagation(); setCurrentTrx(t); setShowDrawer('inputResi'); }} className="text-slate-400 hover:text-orange-600 p-1"><Plus size={16}/></button>
                                                         )}
                                                     </>
                                                 )}
                                                 {activeView === 'Belum Lunas' && canEditCurrentView && (
                                                     <button title="Terima Pembayaran" onClick={(e) => { e.stopPropagation(); handlePaymentComplete(t); }} className="text-slate-400 hover:text-violet-600 p-1"><Wallet size={16}/></button>
                                                 )}
                                                 {activeView === 'Pesanan Batal' && canEditCurrentView && (
                                                    <button title="Hapus Permanen" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                                                )}
                                                {/* Common Actions for Active/Finished */}
                                                {['Orders', 'Shipments'].includes(activeView) && canEditCurrentView && (
                                                    <>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} 
                                                            className="text-slate-400 hover:text-red-600 p-1"
                                                            title="Hapus Data"
                                                        >
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    </>
                                                )}
                                                {activeView === 'Belum Lunas' && (
                                                    <>
                                                        {canEditCurrentView && (
                                                            <button 
                                                                title="Konfirmasi Lunas" 
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    confirmAction('Konfirmasi Lunas', 'Apakah Anda yakin ingin menandai transaksi ini sebagai lunas?', () => {
                                                                     let updatedTrx: any = null;
  
                                                                        setTransactions(prev => prev.map(tr => {
                                                                            if (tr.id === t.id) {
                                                                                const newTrx = { 
                                                                                    ...tr, 
                                                                                    status: tr.status === 'Pengiriman' ? 'Selesai' : tr.status, 
                                                                                    paymentStatus: 'Lunas', 
                                                                                    pembayaranDiterima: tr.nilaiProyek, 
                                                                                    sisaPembayaran: 0 
                                                                                };
                                                                                updatedTrx = newTrx;
                                                                                return newTrx;
                                                                            }
                                                                            return tr;
                                                                        }));
                                                                        if (updatedTrx) {
                                                                            syncToSupabase('transactions', updatedTrx);
                                                                        }
                                                                    });
                                                                }} 
                                                                className="text-slate-400 hover:text-green-600 p-1"
                                                            >
                                                                <DollarSign size={16}/>
                                                            </button>
                                                        )}
                                                        {canEditCurrentView && (
                                                            <button title="Edit" onClick={(e) => { e.stopPropagation(); setCurrentTrx(t); setShowDrawer('trx'); }} className="text-slate-400 hover:text-orange-600 p-1"><Edit size={16}/></button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {/* PENGIRIMAN DATA */}
                                {activeView === 'Pengiriman' && (viewData as Transaction[]).map((t, i) => (
                                     <tr 
                                        key={t.id} 
                                        className={getTableRowClass(i)}
                                        onClick={() => handleTrxClick(t)}
                                    >
                                        <td className={tdClass}><span className="font-medium text-[#A91D3A]">{t.noTrx}</span></td>
                                        <td className={tdClass}>{t.customerName}</td>
                                        <td className={tdClass}>{t.jasaKirim}</td>
                                        <td className={tdClass}>
                                            <div className="text-xs text-slate-500 truncate max-w-[150px]" title={t.keterangan}>
                                                {t.keterangan || '-'}
                                            </div>
                                        </td>
                                        <td className={tdClass}>
                                            {t.noResi ? <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{t.noResi}</span> : <span className="text-xs text-red-400 italic">Belum ada resi</span>}
                                        </td>
                                        <td className={tdClass} align="center">
                                            <div className="flex items-center justify-center gap-2">
                                                {(() => {
                                                    const contact = getContactInfo(t);
                                                    if (!contact) return null;
                                                    return (
                                                        <>
                                                            {contact.phone && (
                                                                <a 
                                                                    href={`https://wa.me/${(contact.phoneCode || '+62').replace('+', '')}${contact.phone}`} 
                                                                    target="_blank" 
                                                                    rel="noreferrer"
                                                                    className="text-emerald-500 hover:text-emerald-600 p-1 rounded-full hover:bg-emerald-50 transition-colors"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="WhatsApp"
                                                                >
                                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.83c0 2.104.547 4.158 1.588 5.976L0 24l6.335-1.662c1.808.986 3.848 1.506 5.923 1.506h.005c6.554 0 11.89-5.335 11.893-11.83a11.79 11.79 0 00-3.48-8.367z" /></svg>
                                                                </a>
                                                            )}
                                                            {contact.email && (
                                                                <a 
                                                                    href={`mailto:${contact.email}`}
                                                                    className="text-blue-500 hover:text-blue-600 p-1 rounded-full hover:bg-blue-50 transition-colors"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title="Email"
                                                                >
                                                                    <Mail size={16}/>
                                                                </a>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                                {canEditCurrentView && (
                                                    <button onClick={(e) => { e.stopPropagation(); setCurrentTrx(t); setShowDrawer('inputResi'); }} className="px-2 py-1 text-xs font-bold text-white bg-blue-500 rounded hover:bg-blue-600 flex items-center gap-1">
                                                        {t.noResi ? <CheckCircle size={12}/> : <Plus size={12}/>} Resi
                                                    </button>
                                                )}
                                                {canEditCurrentView && (
                                                    <button onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        if (t.paymentStatus !== 'Lunas') {
                                                            setConfirmModal({
                                                                isOpen: true,
                                                                type: 'info',
                                                                title: 'Pesanan Belum Lunas',
                                                                message: 'pesanan belum lunas harap lunasi transaksi terlebih dahulu di menu belum lunas',
                                                                confirmText: 'Lihat',
                                                                onConfirm: () => {
                                                                    setActiveView('Belum Lunas');
                                                                    setSearchTerm(t.noTrx);
                                                                    setConfirmModal(null);
                                                                }
                                                            });
                                                            return;
                                                        }
                                                        confirmAction('Konfirmasi Selesai', 'Apakah Anda yakin ingin menandai transaksi ini sebagai selesai?', () => {
                                                            updateTransactionStatus(t.id, 'Selesai');
                                                            setActiveView('Pesanan Selesai');
                                                        });
                                                    }} className="px-2 py-1 text-xs font-bold text-white bg-green-500 rounded hover:bg-green-600 flex items-center gap-1">
                                                        <CheckCircle size={12}/> Selesai
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                     </tr>
                                ))}

                                {/* RECYCLE BIN DATA - RESPONSIVE LIST VIEW */}
                                {activeView === 'Recycle Bin' && (
                                    <div className="flex flex-col gap-3 p-4">
                                        {(viewData as RecycledItem[]).map((item, i) => (
                                            <div 
                                                key={item.id} 
                                                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                                            >
                                                <div className="flex items-start gap-4">
                                                    <div className={`mt-1 p-2.5 rounded-lg ${
                                                        item.type === 'Transaction' ? 'bg-blue-50 text-blue-600' :
                                                        item.type === 'Customer' ? 'bg-emerald-50 text-emerald-600' :
                                                        item.type === 'Product' ? 'bg-orange-50 text-orange-600' :
                                                        'bg-slate-50 text-slate-600'
                                                    }`}>
                                                        <Archive size={20} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                                                item.type === 'Transaction' ? 'bg-blue-100 text-blue-700' :
                                                                item.type === 'Customer' ? 'bg-emerald-100 text-emerald-700' :
                                                                item.type === 'Product' ? 'bg-orange-100 text-orange-700' :
                                                                'bg-slate-100 text-slate-700'
                                                            }`}>
                                                                {item.type}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 font-medium">#{item.id.slice(-6)}</span>
                                                        </div>
                                                        <h4 className="text-sm font-bold text-slate-800 leading-tight">
                                                            {item.type === 'Transaction' ? item.data.noTrx : item.data.nama}
                                                        </h4>
                                                        {item.data.kode && <span className="text-[10px] text-slate-400 font-mono mt-1">{item.data.kode}</span>}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 md:block md:text-right gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Waktu Hapus</span>
                                                        <span className="text-xs text-slate-600 font-medium">{new Date(item.deletedAt).toLocaleString('id-ID')}</span>
                                                    </div>
                                                    <div className="flex flex-col mt-2">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dihapus Oleh</span>
                                                        <span className="text-xs text-slate-700 font-bold">{item.deletedByName || 'Unknown'}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 justify-end">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setRecycleDetailItem(item); setShowDrawer('recycleDetail'); }} 
                                                        className="h-10 px-4 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2 text-xs font-bold"
                                                    >
                                                        <Eye size={16} /> Detail
                                                    </button>
                                                    {canEditCurrentView && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleRestore(item); }} 
                                                            className="h-10 px-4 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors flex items-center gap-2 text-xs font-bold"
                                                        >
                                                            <RotateCcw size={16}/> Restore
                                                        </button>
                                                    )}
                                                    {canEditCurrentView && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handlePermanentDelete(item.id); }} 
                                                            className="h-10 w-10 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                                            title="Hapus Permanen"
                                                        >
                                                            <Trash2 size={16}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* EMPTY STATE */}
                                {viewData.length === 0 && (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-10 text-center text-slate-400 text-sm">
                                            {activeView === 'Recycle Bin' 
                                                ? `Tidak ada data ${recycleBinCategory === 'All' ? '' : recycleBinCategory} di Recycle Bin.`
                                                : `No records found in ${activeView}.`
                                            }
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                      </div>
                      )}
                  </div>
                  )}
              </div>
          </main>
      </div>

      {/* --- DRAWERS --- */}
      {showDrawer && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setShowDrawer(null)} />
          <div className={`relative w-full ${showDrawer === 'inputResi' ? 'max-w-xl' : (showDrawer === 'printPenawaran' || (showDrawer === 'printInvoice' && printDocType === 'PI')) ? 'max-w-4xl' : showDrawer === 'printInvoice' ? 'max-w-xl' : 'lg:max-w-xl'} bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-l border-slate-200 dark:border-slate-800 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-250`}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {showDrawer === 'trx' ? (currentTrx.status === 'Penawaran' ? 'Penawaran Baru' : 'Transaksi Baru') : 
                  showDrawer === 'trxDetail' ? (currentTrx.status === 'Penawaran' ? 'Detail Penawaran' : 'Detail Transaksi') :
                  showDrawer === 'cust' ? 'Data Kontak' :
                  showDrawer === 'custDetail' ? 'Detail Kontak' :
                  showDrawer === 'prod' ? 'Produk & Stok' :
                  showDrawer === 'prodDetail' ? 'Detail Produk' : 
                  showDrawer === 'inputResi' ? 'Input Resi Pengiriman' : 
                  showDrawer === 'followUpForm' ? 'Tambah Follow-up' :
                  showDrawer === 'printInvoice' ? 'Cetak Invoice' : 
                  showDrawer === 'printPenawaran' ? 'Buat Penawaran' :
                  showDrawer === 'paymentForm' ? 'Form Pembayaran' : 
                  showDrawer === 'po' ? 'Purchase Order Baru' : 
                  showDrawer === 'poDetail' ? 'Detail Purchase Order' : 
                  showDrawer === 'emp' ? 'Karyawan Baru' :
                  showDrawer === 'appUser' ? 'User Aplikasi Baru' :
                  showDrawer === 'empDetail' ? 'Detail Karyawan' : 
                  showDrawer === 'appUserDetail' ? 'Detail User Aplikasi' : 
                  showDrawer === 'suppDetail' ? 'Detail Supplier' : 
                  showDrawer === 'recycleDetail' ? 'Detail Item Recycle Bin' : 'Supplier Baru'}
              </h3>
              <button 
                onClick={() => setShowDrawer(null)} 
                className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                title="Tutup"
              >
                <X size={18}/>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* --- RECYCLE DETAIL --- */}
              {showDrawer === 'recycleDetail' && recycleDetailItem && (
                  <div className="space-y-6">
                      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                          <div className={`p-3 rounded-lg ${
                              recycleDetailItem.type === 'Transaction' ? 'bg-blue-100 text-blue-600' :
                              recycleDetailItem.type === 'Customer' ? 'bg-emerald-100 text-emerald-600' :
                              recycleDetailItem.type === 'Product' ? 'bg-orange-100 text-orange-600' :
                              'bg-slate-100 text-slate-600'
                          }`}>
                              <Archive size={24} />
                          </div>
                          <div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipe Entitas</div>
                              <div className="text-lg font-bold text-slate-800">{recycleDetailItem.type}</div>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-700 border-b pb-2">Metadara Penghapusan</h4>
                          <div className="grid grid-cols-2 gap-4">
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dihapus Pada</div>
                                  <div className="text-xs font-bold text-slate-700">{new Date(recycleDetailItem.deletedAt).toLocaleString('id-ID')}</div>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dihapus Oleh</div>
                                  <div className="text-xs font-bold text-slate-700">{recycleDetailItem.deletedByName}</div>
                              </div>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-700 border-b pb-2">Konten Data (Snapshot)</h4>
                          <div className="bg-slate-900 rounded-xl overflow-hidden shadow-inner">
                              <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                                  <span className="text-[10px] font-mono text-slate-400">data_snapshot.json</span>
                                  <Archive size={12} className="text-slate-500" />
                              </div>
                              <div className="p-4 overflow-x-auto max-h-[400px]">
                                  <pre className="text-[11px] font-mono text-emerald-400 leading-relaxed">
                                      {JSON.stringify(recycleDetailItem.data, null, 2)}
                                  </pre>
                              </div>
                          </div>
                      </div>
                      
                      <div className="pt-4 border-t border-slate-100 flex gap-3">
                          <button 
                            onClick={() => { handleRestore(recycleDetailItem); setShowDrawer(null); }}
                            className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                          >
                              <RotateCcw size={18} /> Restore Data
                          </button>
                      </div>
                  </div>
              )}
              
              {/* --- PURCHASE ORDER DETAIL --- */}
              {showDrawer === 'poDetail' && (
                <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h4 className="font-bold text-slate-800 mb-2">Informasi PO</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="text-slate-500">ID PO:</div>
                            <div className="font-medium text-slate-800">{currentPO.id}</div>
                            <div className="text-slate-500">Supplier:</div>
                            <div className="font-medium text-slate-800">{suppliers.find(s => s.id === currentPO.supplierId)?.nama}</div>
                            <div className="text-slate-500">Tanggal Pembelian:</div>
                            <div className="font-medium text-slate-800">{currentPO.tanggalPembelian}</div>
                            <div className="text-slate-500">Status:</div>
                            <div className="font-medium text-slate-800">{currentPO.status}</div>
                            {currentPO.tanggalDiterima && (
                                <>
                                    <div className="text-slate-500">Tanggal Diterima:</div>
                                    <div className="font-medium text-slate-800">{currentPO.tanggalDiterima}</div>
                                </>
                            )}
                            <div className="text-slate-500">Ordered By:</div>
                            <div className="font-medium text-slate-800">{currentPO.orderedBy || '-'}</div>
                        </div>
                        
                        {/* Action Buttons in Detail */}
                        {activeModule !== 'Stocklist' && (
                            <div className="mt-4 flex gap-2">
                                {currentPO.status === 'Process' && (
                                    <button onClick={() => {
                                        confirmAction('Konfirmasi Terima', 'Apakah Anda yakin ingin menerima PO ini? Tanggal terima akan diset ke hari ini.', () => {
                                          const date = new Date().toISOString().split('T')[0];
                                          const now = new Date().toLocaleString('id-ID');
                                          const logEntry: EditLog = {
                                              timestamp: now,
                                              user: currentUser?.nama || 'Unknown',
                                              role: currentUser?.role || 'Admin',
                                              changes: `Status berubah: Process → Received (Barang Diterima)`,
                                              type: 'PurchaseOrder',
                                              id: currentPO.id
                                          };
                                          const updatedPO = { ...currentPO, status: 'Received' as const, tanggalDiterima: date, editHistory: [...(currentPO.editHistory || []), logEntry] };
                                          setPurchaseOrders(prev => prev.map(p => p.id === currentPO.id ? updatedPO as PurchaseOrder : p));
                                          syncToSupabase('purchase_orders', updatedPO);
                                          
                                          setProducts(prev => prev.map(p => {
                                                if (currentPO.items && currentPO.items.length > 0) {
                                                    const poItem = currentPO.items.find(i => i.produkId === p.id);
                                                    if (poItem) {
                                                        const updProd = { 
                                                            ...p, 
                                                            lots: [...(p.lots || []), { 
                                                                lot: Date.now() + Math.floor(Math.random() * 1000), 
                                                                kode: 'AUTO', 
                                                                supplierId: currentPO.supplierId || '', 
                                                                stock: poItem.jumlah, 
                                                                hpp: poItem.hpp, 
                                                                hargaJual: 0, 
                                                                tanggal: date 
                                                            }] 
                                                        };
                                                        syncToSupabase('products', updProd);
                                                        return updProd;
                                                    }
                                                } else if (p.id === currentPO.produkId) {
                                                    const updProd = { 
                                                        ...p, 
                                                        lots: [...(p.lots || []), { 
                                                            lot: Date.now(), 
                                                            kode: 'AUTO', 
                                                            supplierId: currentPO.supplierId || '', 
                                                            stock: currentPO.jumlah || 0, 
                                                            hpp: currentPO.hpp || 0, 
                                                            hargaJual: 0, 
                                                            tanggal: date 
                                                        }] 
                                                    };
                                                    syncToSupabase('products', updProd);
                                                    return updProd;
                                                }
                                                return p;
                                            }));
                                            setCurrentPO(updatedPO);
                                        });
                                    }} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                        Terima Pesanan
                                    </button>
                                )}
                                {currentPO.status === 'Received' && (
                                    <button onClick={() => {
                                        confirmAction('Konfirmasi Lunas', 'Apakah Anda yakin ingin menandai PO ini sebagai Lunas?', () => {
                                            const now = new Date().toLocaleString('id-ID');
                                            const logEntry: EditLog = {
                                                timestamp: now,
                                                user: currentUser?.nama || 'Unknown',
                                                role: currentUser?.role || 'Admin',
                                                changes: `Status berubah: Received → Lunas`,
                                                type: 'PurchaseOrder',
                                                id: currentPO.id
                                            };
                                            const updatedPO = { ...currentPO, status: 'Lunas' as const, editHistory: [...(currentPO.editHistory || []), logEntry] };
                                            setPurchaseOrders(prev => prev.map(p => p.id === currentPO.id ? updatedPO as PurchaseOrder : p));
                                            setCurrentPO(updatedPO);
                                            syncToSupabase('purchase_orders', updatedPO);
                                        });
                                    }} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                        Tandai Lunas
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Riwayat Aktivitas PO */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex justify-between items-center mb-0">
                            <button 
                                onClick={() => setShowPOHistory(!showPOHistory)}
                                className="flex items-center gap-2 group"
                            >
                                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-violet-600 transition-colors flex items-center gap-2">
                                    Riwayat Aktivitas
                                    {currentPO.editHistory && currentPO.editHistory.length > 0 && (
                                        <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[8px]">{currentPO.editHistory.length}</span>
                                    )}
                                </h5>
                                <div className={`transition-transform duration-300 ${showPOHistory ? 'rotate-180' : ''}`}>
                                    <ChevronDown size={14} className="text-slate-400" />
                                </div>
                            </button>
                            <button 
                                onClick={() => setShowPOHistory(!showPOHistory)}
                                className="text-[9px] font-black uppercase tracking-widest text-violet-600 hover:text-violet-700 flex items-center gap-1 transition-colors"
                            >
                                <Eye size={12} /> {showPOHistory ? 'Tutup' : 'Lihat Detail'}
                            </button>
                        </div>

                        {showPOHistory && (
                            <div className="mt-4 space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                                {currentPO.editHistory && currentPO.editHistory.length > 0 ? (
                                    currentPO.editHistory.slice().reverse().map((log, idx) => (
                                        <div key={idx} className="relative pl-8 group">
                                            <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-10 bg-slate-100 text-slate-500">
                                                <Activity size={10} />
                                            </div>
                                            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-violet-100 transition-all">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-[8px] font-black text-violet-600">
                                                            {log.user.substring(0,1)}
                                                        </div>
                                                        <div className="text-[10px] font-black text-slate-700">{log.user}</div>
                                                    </div>
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{log.timestamp}</div>
                                                </div>
                                                <div className="text-[11px] text-slate-600 leading-relaxed font-medium">
                                                    {log.changes.split(', ').map((change, cIdx) => (
                                                        <div key={cIdx} className="flex items-start gap-2 mb-1 last:mb-0">
                                                            <div className="mt-1.5 w-1 h-1 rounded-full bg-slate-300 shrink-0"></div>
                                                            <span>{change}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-6">
                                        <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">Belum ada riwayat aktivitas</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-2 text-left font-bold text-slate-500">Produk</th>
                                    <th className="px-4 py-2 text-center font-bold text-slate-500">Qty</th>
                                    {activeModule !== 'Stocklist' && (
                                        <>
                                            <th className="px-4 py-2 text-right font-bold text-slate-500">HPP</th>
                                            <th className="px-4 py-2 text-right font-bold text-slate-500">Total</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {currentPO.items && currentPO.items.length > 0 ? (
                                    currentPO.items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-800">{item.nama}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">{item.kode}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center">{item.jumlah}</td>
                                            {activeModule !== 'Stocklist' && (
                                                <>
                                                    <td className="px-4 py-3 text-right">Rp {item.hpp.toLocaleString('id-ID')}</td>
                                                    <td className="px-4 py-3 text-right font-bold">Rp {item.harga.toLocaleString('id-ID')}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-800">{products.find(p => p.id === currentPO.produkId)?.nama}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">{currentPO.jumlah}</td>
                                        {activeModule !== 'Stocklist' && (
                                            <>
                                                <td className="px-4 py-3 text-right">Rp {(currentPO.hpp || 0).toLocaleString('id-ID')}</td>
                                                <td className="px-4 py-3 text-right font-bold">Rp {(currentPO.harga || 0).toLocaleString('id-ID')}</td>
                                            </>
                                        )}
                                    </tr>
                                )}
                            </tbody>
                            {activeModule !== 'Stocklist' && (
                                <tfoot className="bg-slate-50 font-bold">
                                    <tr>
                                        <td colSpan={3} className="px-4 py-2 text-right">Total Pembelian</td>
                                        <td className="px-4 py-2 text-right text-violet-600">
                                            Rp {(currentPO.items && currentPO.items.length > 0 
                                                ? currentPO.items.reduce((acc, curr) => acc + curr.harga, 0) 
                                                : (currentPO.harga || 0)).toLocaleString('id-ID')}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    {activeModule !== 'Stocklist' && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <h4 className="font-bold text-blue-800 mb-2">Histori HPP Produk</h4>
                            <div className="space-y-3 text-sm">
                                {(() => {
                                    const itemsToAnalyze = currentPO.items && currentPO.items.length > 0 
                                        ? currentPO.items 
                                        : [{ produkId: currentPO.produkId, nama: products.find(p => p.id === currentPO.produkId)?.nama }];

                                    return itemsToAnalyze.map((item, idx) => {
                                        const pId = item.produkId;
                                        if (!pId) return null;

                                        const allFilteredPOs = purchaseOrders
                                            .filter(po => 
                                                (po.produkId === pId || (po.items?.some(it => it.produkId === pId)))
                                            )
                                            .sort((a, b) => new Date(b.tanggalPembelian).getTime() - new Date(a.tanggalPembelian).getTime());

                                        const getHppFromPO = (po, prodId) => {
                                            if (po.items && po.items.length > 0) {
                                                return po.items.find(i => i.produkId === prodId)?.hpp || 0;
                                            }
                                            return po.hpp || 0;
                                        };

                                        const currentIndex = allFilteredPOs.findIndex(po => po.id === currentPO.id);
                                        
                                        // Latest PO across all time
                                        const latestPO = allFilteredPOs.length > 0 ? allFilteredPOs[0] : null;
                                        
                                        // Previous relative to this PO
                                        const prevPO = currentIndex !== -1 && currentIndex + 1 < allFilteredPOs.length 
                                            ? allFilteredPOs[currentIndex + 1] 
                                            : null;

                                        return (
                                            <div key={idx} className={idx > 0 ? "pt-2 border-t border-blue-100" : ""}>
                                                {itemsToAnalyze.length > 1 && <div className="font-bold text-blue-900 mb-1 text-xs">{item.nama}</div>}
                                                <div className="flex justify-between items-center text-xs opacity-70 mb-1">
                                                    <span className="text-blue-600">HPP Sebelumnya:</span>
                                                    <span className="font-bold text-blue-900">
                                                        {prevPO ? `[${prevPO.id}] Rp ${getHppFromPO(prevPO, pId).toLocaleString('id-ID')} (${prevPO.tanggalPembelian})` : '-'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-blue-600">HPP Terkini:</span>
                                                    <span className="font-black text-blue-900">
                                                        {latestPO ? `[${latestPO.id}] Rp ${getHppFromPO(latestPO, pId).toLocaleString('id-ID')} (${latestPO.tanggalPembelian})` : '-'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    )}
                </div>
              )}

              {/* --- PURCHASE ORDER FORM --- */}
              {showDrawer === 'po' && (
                <div className="space-y-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className={labelClass}>Supplier <span className="text-red-500">*</span></label>
                        <SearchableSelect options={suppliers.filter(s => s.companyId === activeCompanyId || s.company_id === activeCompanyId).map(s => ({ value: s.id!, label: s.nama }))} value={currentPO.supplierId || ''} onChange={v => setCurrentPO({...currentPO, supplierId: v})} placeholder="Pilih Supplier..." className="bg-white" />
                        
                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                                <label className={labelClass}>Order By</label>
                                <select className={inputClass} value={currentPO.orderedBy || ''} onChange={e => setCurrentPO({...currentPO, orderedBy: e.target.value})}>
                                    <option value="">Pilih Member...</option>
                                    {stocklistMembers.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                                <label className={labelClass}>Tanggal Pembelian</label>
                                <input type="date" className={inputClass} value={currentPO.tanggalPembelian || ''} onChange={e => setCurrentPO({...currentPO, tanggalPembelian: e.target.value})} />
                            </div>
                            <div>
                                <label className={labelClass}>Status</label>
                                {activeModule === 'Stocklist' ? (
                                    <input type="text" className={`${inputClass} bg-slate-100 cursor-not-allowed`} value="Lunas" readOnly />
                                ) : (
                                    <select className={inputClass} value={currentPO.status || 'Process'} onChange={e => setCurrentPO({...currentPO, status: e.target.value as any})}>
                                        <option value="Process">Process</option>
                                        <option value="Received">Received</option>
                                        <option value="Lunas">Lunas</option>
                                    </select>
                                )}
                            </div>
                        </div>
                        {(currentPO.status === 'Received' || currentPO.status === 'Lunas') && (
                            <div className="mt-4">
                                <label className={labelClass}>Tanggal Diterima</label>
                                <input type="date" className={inputClass} value={currentPO.tanggalDiterima || ''} onChange={e => setCurrentPO({...currentPO, tanggalDiterima: e.target.value})} />
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-slate-800">Item Produk</h4>
                            <button 
                                onClick={() => {
                                    const newItems = [...(currentPO.items || []), { produkId: '', nama: '', kode: '', jumlah: 1, hpp: 0, harga: 0 }];
                                    setCurrentPO({ ...currentPO, items: newItems });
                                }}
                                className="flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-700 bg-violet-50 px-2 py-1 rounded"
                            >
                                <Plus size={14}/> Tambah Produk
                            </button>
                        </div>

                        {(currentPO.items || []).map((item, idx) => (
                            <div key={idx} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3 relative group">
                                <button 
                                    onClick={() => {
                                        const newItems = (currentPO.items || []).filter((_, i) => i !== idx);
                                        setCurrentPO({ ...currentPO, items: newItems });
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                >
                                    <X size={12}/>
                                </button>

                                <SearchableSelect 
                                    options={products.filter(p => p.companyId === activeCompanyId || p.company_id === activeCompanyId).map(p => ({ value: p.id!, label: p.nama }))} 
                                    value={item.produkId} 
                                    onChange={v => {
                                        const prod = products.find(p => p.id === v);
                                        // Find latest HPP from purchase orders (items or legacy fields)
                                        const allPOs = purchaseOrders
                                            .filter(po => 
                                                (po.produkId === v) || 
                                                (po.items?.some(it => it.produkId === v))
                                            )
                                            .sort((a, b) => new Date(b.tanggalPembelian).getTime() - new Date(a.tanggalPembelian).getTime());
                                        
                                        let latestHppFromPO = 0;
                                        if (allPOs.length > 0) {
                                            const po = allPOs[0];
                                            if (po.items) {
                                                const item = po.items.find(it => it.produkId === v);
                                                if (item) latestHppFromPO = item.hpp;
                                            } else {
                                                latestHppFromPO = po.hpp || 0;
                                            }
                                        }

                                        const lastHppFromLot = prod?.lots && prod.lots.length > 0 ? prod.lots[prod.lots.length - 1].hpp : 0;
                                        const finalLatestHpp = latestHppFromPO || lastHppFromLot;

                                        const newItems = [...(currentPO.items || [])];
                                        newItems[idx] = { 
                                            ...newItems[idx], 
                                            produkId: v, 
                                            nama: prod?.nama || '', 
                                            kode: prod?.kode || '',
                                            hpp: finalLatestHpp,
                                            harga: newItems[idx].jumlah * finalLatestHpp
                                        };
                                        setCurrentPO({ ...currentPO, items: newItems });
                                    }} 
                                    placeholder="Pilih Produk..." 
                                />

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Jumlah</label>
                                            <input 
                                                type="number" 
                                                className={inputClass} 
                                                value={item.jumlah} 
                                                onChange={e => {
                                                    const qty = parseInt(e.target.value) || 0;
                                                    const newItems = [...(currentPO.items || [])];
                                                    newItems[idx] = { ...newItems[idx], jumlah: qty, harga: qty * newItems[idx].hpp };
                                                    setCurrentPO({ ...currentPO, items: newItems });
                                                }} 
                                            />
                                        </div>
                                        {activeModule !== 'Stocklist' && (
                                            <div>
                                                <div className="flex justify-between items-center">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">HPP Satuan</label>
                                                    {item.produkId && (() => {
                                                        const allPOs = purchaseOrders
                                                            .filter(po => 
                                                                (po.produkId === item.produkId) || 
                                                                (po.items?.some(it => it.produkId === item.produkId))
                                                            )
                                                            .sort((a, b) => new Date(b.tanggalPembelian).getTime() - new Date(a.tanggalPembelian).getTime());
                                                        
                                                        let latestHpp = 0;
                                                        let latestDate = '';

                                                        if (allPOs.length > 0) {
                                                            const po = allPOs[0];
                                                            latestDate = po.tanggalPembelian;
                                                            if (po.items) {
                                                                const pItem = po.items.find(it => it.produkId === item.produkId);
                                                                if (pItem) latestHpp = pItem.hpp;
                                                            } else {
                                                                latestHpp = po.hpp || 0;
                                                            }
                                                        }

                                                        if (!latestHpp) {
                                                            const prod = products.find(p => p.id === item.produkId);
                                                            if (prod?.lots?.length) {
                                                                latestHpp = prod.lots[prod.lots.length - 1].hpp;
                                                                latestDate = prod.lots[prod.lots.length - 1].tanggal || '';
                                                            }
                                                        }

                                                        return latestHpp ? (
                                                            <span className="text-[8px] text-violet-500 font-bold">
                                                                Prev: Rp {latestHpp.toLocaleString('id-ID')} ({latestDate})
                                                            </span>
                                                        ) : null;
                                                    })()}
                                                </div>
                                                <input 
                                                    type="number" 
                                                    className={inputClass} 
                                                    value={item.hpp} 
                                                    onChange={e => {
                                                        const hpp = parseInt(e.target.value) || 0;
                                                        const newItems = [...(currentPO.items || [])];
                                                        newItems[idx] = { ...newItems[idx], hpp: hpp, harga: newItems[idx].jumlah * hpp };
                                                        setCurrentPO({ ...currentPO, items: newItems });
                                                    }} 
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {activeModule !== 'Stocklist' && (
                                        <div className="text-right text-xs font-bold text-slate-500">
                                            Total: Rp {(item.harga || 0).toLocaleString('id-ID')}
                                        </div>
                                    )}
                            </div>
                        ))}

                        {(currentPO.items || []).length === 0 && (
                            <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs italic">
                                Belum ada produk yang ditambahkan
                            </div>
                        )}
                    </div>

                    {activeModule !== 'Stocklist' && (
                        <div className="pt-4 border-t border-slate-200">
                            <div className="flex justify-between items-center text-lg font-black text-slate-800">
                                <span>Total Pembelian</span>
                                <span className="text-violet-600">
                                    Rp {(currentPO.items || []).reduce((acc, curr) => acc + (curr.harga || 0), 0).toLocaleString('id-ID')}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
              )}

              {/* --- PRINT INVOICE PREVIEW --- */}
              {showDrawer === 'printInvoice' && (
                  <div className="flex flex-col h-full bg-slate-50">
                      <div className="p-4 border-b border-slate-200">
                          <div className="flex bg-slate-200 p-1 rounded-lg">
                              <button 
                                  onClick={() => setPrintDocType('Invoice')} 
                                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${printDocType === 'Invoice' ? 'bg-white shadow text-violet-700' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                  Cetak Invoice
                              </button>
                              <button 
                                  onClick={() => setPrintDocType('Nota')} 
                                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${printDocType === 'Nota' ? 'bg-white shadow text-violet-700' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                  Buat Nota
                              </button>
                              <button 
                                  onClick={() => setPrintDocType('PI')} 
                                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${printDocType === 'PI' ? 'bg-white shadow text-violet-700' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                  Buat PI
                              </button>
                          </div>
                      </div>
                      {printDocType === 'PI' ? (
                          <div className="flex-1 overflow-y-auto p-4 flex gap-4 flex-col lg:flex-row">
                              {/* Controls */}
                              <div className="lg:w-1/3 bg-white p-4 rounded-xl border border-slate-200 flex flex-col gap-3 min-w-[300px]">
                                  <h3 className="font-bold text-sm mb-2 text-slate-800">Edit Proforma Invoice</h3>
                                  <div>
                                      <label className={labelClass}>Invoice No</label>
                                      <input type="text" className={inputClass} value={piInvoiceNo} onChange={e => setPiInvoiceNo(e.target.value)} />
                                  </div>
                                  <div>
                                      <label className={labelClass}>Date</label>
                                      <input type="text" className={inputClass} value={piDate} onChange={e => setPiDate(e.target.value)} />
                                  </div>
                                  <div>
                                      <label className={labelClass}>Bill To</label>
                                      <textarea className={inputClass} rows={4} value={piBillTo} onChange={e => setPiBillTo(e.target.value)} />
                                  </div>
                                  <div>
                                      <label className={labelClass}>Ship To</label>
                                      <textarea className={inputClass} rows={4} value={piShipTo} onChange={e => setPiShipTo(e.target.value)} />
                                  </div>
                                  <div>
                                      <div className="flex justify-between items-center mb-1"><label className={labelClass}>Items</label><button onClick={() => setPiItems([...piItems, {desc:'', hsCode:'', qty:'', unitPrice:'', total:''}])} className="text-xs text-blue-600 font-bold hover:underline">Tambah Item</button></div>
                                      {piItems.map((item, idx) => (
                                          <div key={idx} className="border border-slate-200 p-2 rounded relative flex flex-col gap-2 mb-2 bg-slate-50">
                                              <button onClick={() => setPiItems(piItems.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1"><X size={12}/></button>
                                              <input type="text" className={`${inputClass} text-xs`} placeholder="Description" value={item.desc} onChange={e => { const n = [...piItems]; n[idx].desc = e.target.value; setPiItems(n); }} />
                                              <div className="grid grid-cols-2 gap-2">
                                                  <input type="text" className={`${inputClass} text-xs`} placeholder="HS Code" value={item.hsCode} onChange={e => { const n = [...piItems]; n[idx].hsCode = e.target.value; setPiItems(n); }} />
                                                  <input type="text" className={`${inputClass} text-xs`} placeholder="QTY" value={item.qty} onChange={e => { const n = [...piItems]; n[idx].qty = e.target.value; setPiItems(n); }} />
                                                  <input type="text" className={`${inputClass} text-xs`} placeholder="Unit Price" value={item.unitPrice} onChange={e => { const n = [...piItems]; n[idx].unitPrice = e.target.value; setPiItems(n); }} />
                                                  <input type="text" className={`${inputClass} text-xs`} placeholder="Total" value={item.total} onChange={e => { const n = [...piItems]; n[idx].total = e.target.value; setPiItems(n); }} />
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                                      <div>
                                          <label className={labelClass}>Shipping Desc</label>
                                          <input type="text" className={inputClass} value={piShippingDesc} onChange={e => setPiShippingDesc(e.target.value)} />
                                      </div>
                                      <div>
                                          <label className={labelClass}>Shipping Cost</label>
                                          <input type="text" className={inputClass} value={piShippingCost} onChange={e => setPiShippingCost(e.target.value)} />
                                      </div>
                                  </div>
                                  <div>
                                      <label className={labelClass}>Total Amount</label>
                                      <input type="text" className={inputClass} value={piTotal} onChange={e => setPiTotal(e.target.value)} />
                                  </div>
                                  <div>
                                      <label className={labelClass}>Notes</label>
                                      <textarea className={inputClass} rows={4} value={piNotes} onChange={e => setPiNotes(e.target.value)} />
                                  </div>
                                  <div>
                                      <label className={labelClass}>Footer Text</label>
                                      <textarea className={inputClass} rows={2} value={piFooter} onChange={e => setPiFooter(e.target.value)} />
                                  </div>
                              </div>
                              
                              {/* PI Preview Area */}
                              <div className="flex-1 bg-white border border-slate-200 p-8 shadow-sm flex flex-col font-sans text-black min-h-[900px] w-full max-w-[816px] self-start text-[12px]" id="invoice-area">
                                  {/* Header (Same as Invoice, with the PROFORMA INVOICE text on the right) */}
                                  <div className="flex justify-between items-end mb-4 text-left">
                                      <div className="flex flex-col">
                                          <img 
                                              src="https://ik.imagekit.io/cej2dcwlx/4dc7f785-a33f-4508-8bcc-192df95b329c_removalai_preview.png" 
                                              alt="Logo Panca Prima Wijaya" 
                                              className="h-14 w-14 object-contain mb-3" 
                                          />
                                          <h1 className="text-[15px] font-black text-black uppercase leading-none mb-1 tracking-tight">PT. PANCA PRIMA WIJAYA</h1>
                                          <div className="text-[9px] text-black leading-tight max-w-[450px]">
                                              <p>Jalan Kayu Putih VII Blok A4 No. 8, RT.3/RW.6 Pulo Gadung, Kec. Pulo</p>
                                              <p>Gadung, Kota Jakarta Timur Daerah Khusus Ibukota Jakarta 14240</p>
                                              <p className="font-bold mt-1">Telp: 0813-1989-8319</p>
                                              <p className="font-bold mt-1">NPWP : 0732.0395.1604.3000 <span className="ml-4">TDP : 09.01.1.46.51295</span></p>
                                          </div>
                                      </div>
                                      <div className="pb-1 text-right">
                                          <h2 className="text-[13px] font-black text-black uppercase tracking-wide">PROFORMA INVOICE</h2>
                                      </div>
                                  </div>
                                  <div className="border-t-[3px] border-black mb-5"></div>
                                  
                                  <div className="mb-5 leading-snug text-[11px]">
                                      <p className="font-bold text-[12px] mb-0.5">Seller (Exporter):</p>
                                      <p>PT. Panca Prima Wijaya</p>
                                      <p>Email: patrickprayogawbw@gmail.com</p>
                                      <p>Invoice No: {piInvoiceNo}</p>
                                      <p>Date : {piDate}</p>
                                  </div>
                                  
                                  <div className="mb-5 leading-snug text-[11px]">
                                      <p className="font-bold text-[12px] mb-0.5">Bill To:</p>
                                      <p className="whitespace-pre-wrap">{piBillTo}</p>
                                  </div>
                                  
                                  <div className="mb-5 leading-snug text-[11px]">
                                      <p className="font-bold text-[12px] mb-0.5">Ship to:</p>
                                      <p className="whitespace-pre-wrap">{piShipTo}</p>
                                  </div>
                                  
                                  <table className="w-full mb-5 border-collapse border border-black text-[11px]">
                                      <thead className="bg-[#f2f2f2]">
                                          <tr>
                                              <th className="border border-black p-1.5 font-bold w-10 text-center">No</th>
                                              <th className="border border-black p-1.5 font-bold text-center">Description</th>
                                              <th className="border border-black p-1.5 font-bold text-center">HS Code</th>
                                              <th className="border border-black p-1.5 font-bold text-center">QTY</th>
                                              <th className="border border-black p-1.5 font-bold whitespace-nowrap text-center">Unit Price (USD)</th>
                                              <th className="border border-black p-1.5 font-bold whitespace-nowrap text-center">Total (USD)</th>
                                          </tr>
                                      </thead>
                                      <tbody className="text-center text-[11px]">
                                          {piItems.map((item, idx) => (
                                              <tr key={idx}>
                                                  <td className="border border-black p-1.5">{idx + 1}</td>
                                                  <td className="border border-black p-1.5 text-left">{item.desc}</td>
                                                  <td className="border border-black p-1.5">{item.hsCode}</td>
                                                  <td className="border border-black p-1.5">{item.qty}</td>
                                                  <td className="border border-black p-1.5">{item.unitPrice}</td>
                                                  <td className="border border-black p-1.5">{item.total}</td>
                                              </tr>
                                          ))}
                                          <tr>
                                              <td className="border border-black p-1.5 text-left font-semibold" colSpan={4}>{piShippingDesc}</td>
                                              <td className="border border-black p-1.5"></td>
                                              <td className="border border-black p-1.5 font-semibold text-right pr-4">{piShippingCost}</td>
                                          </tr>
                                          <tr className="font-bold bg-[#fcfcfc]">
                                              <td colSpan={5} className="border border-black p-1.5 text-center uppercase tracking-wider">Total</td>
                                              <td className="border border-black p-1.5 text-right pr-4">{piTotal}</td>
                                          </tr>
                                      </tbody>
                                  </table>
                                  
                                  <div className="leading-snug text-[11px] text-gray-700 whitespace-pre-wrap mb-6 flex-grow">
                                      <p className="font-bold text-black mb-0.5">Notes:</p>
                                      <p>{piNotes}</p>
                                  </div>
                                  
                                  {piFooter && (
                                    <div className="text-center font-bold italic mt-auto pt-4 text-[11px]">
                                        {piFooter}
                                    </div>
                                  )}
                              </div>
                          </div>
                      ) : (
                          <div className="flex-1 overflow-y-auto p-4">
                          <div className="bg-white border border-slate-200 p-8 shadow-sm mb-4" id="invoice-area">
                          {printDocType === 'Invoice' ? (
                              <div className="flex justify-between items-end mb-4">
                                  <div className="flex flex-col">
                                      <img 
                                          src="https://ik.imagekit.io/cej2dcwlx/4dc7f785-a33f-4508-8bcc-192df95b329c_removalai_preview.png" 
                                          alt="Logo Panca Prima Wijaya" 
                                          className="h-16 w-16 object-contain mb-4" 
                                      />
                                      <h1 className="text-[16px] font-black text-black uppercase leading-none mb-1.5 tracking-tight">PT. PANCA PRIMA WIJAYA</h1>
                                      <div className="text-[10px] text-black leading-tight max-w-[450px]">
                                          <p>Jalan Kayu Putih VII Blok A4 No. 8, RT.3/RW.6 Pulo Gadung, Kec. Pulo</p>
                                          <p>Gadung, Kota Jakarta Timur Daerah Khusus Ibukota Jakarta 14240</p>
                                          <p className="font-bold mt-1">Telp: 0813-1989-8319</p>
                                          <p className="font-bold mt-1">NPWP : 0732.0395.1604.3000 <span className="ml-4">TDP : 09.01.1.46.51295</span></p>
                                      </div>
                                  </div>
                                  <div className="pb-1">
                                      <h2 className="text-[14px] font-black text-black uppercase tracking-wide">COMMERCIAL INVOICE</h2>
                                  </div>
                              </div>
                          ) : (
                              <div className="flex justify-end mb-4">
                                  <div className="pb-1">
                                      <h2 className="text-[14px] font-black text-black uppercase tracking-wide">NOTA</h2>
                                  </div>
                              </div>
                          )}
                          <div className="border-t-[3px] border-black mb-6"></div>
                          
                          <div className="flex justify-between items-start mb-8">
                              <div className="text-[10px]">
                                  <h3 className="font-bold text-black mb-0.5">Kepada Yth :</h3>
                                  <p className="text-black">{currentTrx.customerName}</p>
                                  {(() => {
                                      const c = customers.find(x => x.nama === currentTrx.customerName);
                                      return c ? (
                                          <div className="text-black mt-0.5">
                                              <p>{c.alamat}</p>
                                              {c.phone && <p>{c.phoneCode || ''}{c.phone}</p>}
                                          </div>
                                      ) : null;
                                  })()}
                              </div>
                              <div className="text-[10px] text-black space-y-0.5 text-right mt-1">
                                  {(() => {
                                      const d = new Date();
                                      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
                                      const yy = d.getFullYear().toString().slice(2);
                                      const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
                                      const tglPoStr = invoiceTglPo ? new Date(invoiceTglPo).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
                                      return (
                                          <>
                                              <div>
                                                  <p className="font-bold">Ref. No</p>
                                                  <p>{invoiceRefPrefix || '...'}/{printDocType === 'Invoice' ? 'INV' : 'NT'}-PPW/{mm}/{yy}</p>
                                              </div>
                                              <div>
                                                  <p className="font-bold">Tanggal</p>
                                                  <p>{dateStr}</p>
                                              </div>
                                              <div>
                                                  <p className="font-bold">No. PO</p>
                                                  <p>{invoiceNoPo || '-'}</p>
                                              </div>
                                              <div>
                                                  <p className="font-bold">Tanggal PO</p>
                                                  <p>{tglPoStr}</p>
                                              </div>
                                          </>
                                      );
                                  })()}
                              </div>
                          </div>

                          <table className="w-full mb-8">
                              <thead>
                                  <tr className="border-b-2 border-slate-800">
                                      <th className="text-left py-2 text-[10px] font-bold text-black">Description</th>
                                      <th className="text-center py-2 text-[10px] font-bold text-black">Qty</th>
                                      <th className="text-right py-2 text-[10px] font-bold text-black">Price</th>
                                      <th className="text-right py-2 text-[10px] font-bold text-black">Total</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {currentTrx.items?.map((item, i) => (
                                      <tr key={i} className="border-b border-slate-100">
                                          <td className="py-2 text-[10px] text-black">{item.nama}</td>
                                          <td className="py-2 text-[10px] text-black text-center">{item.qty}</td>
                                          <td className="py-2 text-[10px] text-black text-right">{formatRupiah(item.harga)}</td>
                                          <td className="py-2 text-[10px] text-black text-right">{formatRupiah((item.harga * item.qty) - (item.diskon || 0))}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>

                          <div className="flex justify-between items-end">
                              <div className="text-[10px] text-black max-w-[50%]">
                                  <p className="font-bold text-black mb-1">Pembayaran Transfer ke</p>
                                  {printDocType === 'Invoice' ? (
                                      <>
                                          <p>BNI 8182215056</p>
                                          <p>PT. Panca Prima Wijaya</p>
                                      </>
                                  ) : (
                                      <div className="space-y-0.5">
                                          <p className="flex"><span className="w-20">Nama Bank</span><span>: BCA</span></p>
                                          <p className="flex"><span className="w-20">Atas Nama</span><span>: Patrick Prayoga</span></p>
                                          <p className="flex"><span className="w-20">No. Rekening</span><span>: 870.520.1087</span></p>
                                      </div>
                                  )}
                              </div>
                              <div className="w-1/2 space-y-1 mt-4">
                                  {currentTrx.ppn && (
                                    <div className="flex justify-between text-[10px] text-black">
                                        <span>PPN 11%</span>
                                        <span>{formatRupiah((currentTrx.nilaiProyek || 0) * 0.11)}</span>
                                    </div>
                                  )}
                                  {currentTrx.ongkir && (
                                    <div className="flex justify-between text-[10px] text-black">
                                        <span>Shipping</span>
                                        <span>{formatRupiah(currentTrx.biayaOngkir || 0)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-[10px] font-bold text-black border-t border-black pt-1">
                                      <span>Total</span>
                                      <span>{formatRupiah(currentTrx.nilaiProyek || 0)}</span>
                                  </div>
                                  {(paidAmount > 0 || currentTrx.paymentStatus !== 'Lunas') && (
                                      <>
                                          <div className="flex justify-between text-[10px] font-bold text-black pt-1">
                                              <span>Pembayaran Diterima</span>
                                              <span>{formatRupiah(paidAmount)}</span>
                                          </div>
                                          <div className="flex justify-between text-[10px] font-bold text-black pt-1 border-t border-dashed border-black">
                                              <span>Sisa Pembayaran</span>
                                              <span>{formatRupiah((currentTrx.nilaiProyek || 0) - paidAmount)}</span>
                                          </div>
                                      </>
                                  )}
                              </div>
                          </div>
                          {invoiceNote && (
                              <div className="mt-8 text-[10px] text-black">
                                  <p className="font-bold text-black mb-1">Catatan:</p>
                                  <p className="whitespace-pre-wrap">{invoiceNote}</p>
                              </div>
                          )}

                          {/* Footer section with signature */}
                          <div className="mt-12 flex justify-between items-end relative">
                              <p className="text-[10px] text-slate-400 self-end">Ref: #{currentTrx.noTrx}</p>
                              <div className="w-64 text-center mr-8 gap-1 flex flex-col items-center">
                                  <p className="mb-2 text-[10px] text-black">Hormat kami,</p>
                                  {printDocType === 'Invoice' ? (
                                      <>
                                          <p className="font-bold text-[10px] text-black mb-2">PT. Panca Prima Wijaya.</p>
                                          <img src="https://ik.imagekit.io/cej2dcwlx/image-removebg-preview.png" alt="Signature" className="h-24 object-contain -my-2 mix-blend-multiply" />
                                          <p className="font-bold text-[10px] text-black underline mt-2">Patrick Prayoga</p>
                                      </>
                                  ) : (
                                      <>
                                          <img src="https://ik.imagekit.io/cej2dcwlx/image-removebg-preview%20(1).png?updatedAt=1779615608265" alt="Signature" className="h-24 object-contain -my-2 mix-blend-multiply" />
                                          <p className="font-bold text-[10px] text-black underline mt-2">Patrick Prayoga</p>
                                      </>
                                  )}
                              </div>
                          </div>
                      </div>

                      {/* Payment Input and Notes for Invoice */}
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className={labelClass}>Ref. No Prefix</label>
                                  <input 
                                      type="text" 
                                      className={inputClass}
                                      value={invoiceRefPrefix}
                                      onChange={(e) => setInvoiceRefPrefix(e.target.value)}
                                      placeholder="Cth: 102"
                                  />
                              </div>
                              <div>
                                  <label className={labelClass}>Nominal Pembayaran Diterima</label>
                                  <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">Rp</span>
                                      <input 
                                          type="text" 
                                          className={`${inputClass} pl-10 font-bold text-violet-700`}
                                          value={formatInputNumber(paidAmount)}
                                          onChange={(e) => setPaidAmount(parseInputNumber(e.target.value))}
                                          placeholder="0"
                                      />
                                  </div>
                              </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className={labelClass}>No. PO</label>
                                  <input 
                                      type="text" 
                                      className={inputClass}
                                      value={invoiceNoPo}
                                      onChange={(e) => setInvoiceNoPo(e.target.value)}
                                      placeholder="Cth: PO/XII/25-123"
                                  />
                              </div>
                              <div>
                                  <label className={labelClass}>Tanggal PO</label>
                                  <input 
                                      type="date" 
                                      className={inputClass}
                                      value={invoiceTglPo}
                                      onChange={(e) => setInvoiceTglPo(e.target.value)}
                                  />
                              </div>
                          </div>
                          <div>
                              <label className={labelClass}>Catatan Invoice (Tampil di cetakan)</label>
                              <textarea
                                  className={inputClass}
                                  value={invoiceNote}
                                  onChange={(e) => setInvoiceNote(e.target.value)}
                                  placeholder="Tambahkan catatan khusus di invoice..."
                                  rows={2}
                              />
                          </div>
                      </div>
                      </div>
                      )}
                      
                      <div className="p-4 bg-white border-t border-slate-200">
                          <button 
                            onClick={downloadInvoicePDF} 
                            className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-900 shadow-lg"
                          >
                              <Download size={18}/> {printDocType === 'PI' ? 'Download PDF Proforma Invoice' : printDocType === 'Invoice' ? 'Download PDF Invoice' : 'Download PDF Nota'}
                          </button>
                      </div>
                  </div>
              )}

              {/* --- PRINT PENAWARAN PREVIEW --- */}
              {showDrawer === 'printPenawaran' && (
                  <div className="flex flex-col h-full bg-slate-50">
                      <div className="flex-1 overflow-y-auto p-4 flex gap-4 flex-col lg:flex-row">
                          {/* Controls (Inputs) */}
                          <div className="lg:w-1/3 bg-white p-4 rounded-xl border border-slate-200 flex flex-col gap-3 min-w-[300px]">
                              <h3 className="font-bold text-sm mb-2 text-slate-800">Edit Penawaran</h3>
                              <div>
                                  <label className={labelClass}>Nomor</label>
                                  <input type="text" className={inputClass} value={penawaranNomor} onChange={e => setPenawaranNomor(e.target.value)} />
                              </div>
                              <div>
                                  <label className={labelClass}>Perihal</label>
                                  <input type="text" className={inputClass} value={penawaranPerihal} onChange={e => setPenawaranPerihal(e.target.value)} />
                              </div>
                              <div>
                                  <label className={labelClass}>Pembuka</label>
                                  <textarea className={inputClass} rows={3} value={penawaranPembuka} onChange={e => setPenawaranPembuka(e.target.value)} />
                              </div>
                              <div>
                                  <label className={labelClass}>Nama</label>
                                  <input type="text" className={inputClass} value={penawaranNama} onChange={e => setPenawaranNama(e.target.value)} />
                              </div>
                              <div>
                                  <label className={labelClass}>Bahan Aktif</label>
                                  <input type="text" className={inputClass} value={penawaranBahanAktif} onChange={e => setPenawaranBahanAktif(e.target.value)} />
                              </div>
                              <div>
                                  <label className={labelClass}>Harga (Teks)</label>
                                  <textarea className={inputClass} rows={2} value={penawaranHargaStr} onChange={e => setPenawaranHargaStr(e.target.value)} />
                              </div>
                              <div>
                                  <label className={labelClass}>Keterangan Harga</label>
                                  <textarea className={inputClass} rows={2} value={penawaranKeteranganHarga} onChange={e => setPenawaranKeteranganHarga(e.target.value)} />
                              </div>
                              <div>
                                  <label className={labelClass}>Fungsi</label>
                                  <textarea className={inputClass} rows={2} value={penawaranFungsi} onChange={e => setPenawaranFungsi(e.target.value)} />
                              </div>
                              <div>
                                  <label className={labelClass}>Waktu Pengiriman</label>
                                  <input type="text" className={inputClass} value={penawaranWaktuKirim} onChange={e => setPenawaranWaktuKirim(e.target.value)} />
                              </div>
                              <div>
                                  <label className={labelClass}>Pembayaran</label>
                                  <textarea className={inputClass} rows={2} value={penawaranPembayaran} onChange={e => setPenawaranPembayaran(e.target.value)} />
                              </div>
                          </div>
                          
                          {/* Preview Area */}
                          <div className="flex-1 bg-white border border-slate-200 p-8 shadow-sm flex flex-col self-start min-h-[900px] relative" id="invoice-area">
                                 {/* Header */}
                                 <div className="flex justify-between items-end mb-4">
                                      <div className="flex flex-col">
                                          <img 
                                              src="https://ik.imagekit.io/cej2dcwlx/4dc7f785-a33f-4508-8bcc-192df95b329c_removalai_preview.png" 
                                              alt="Logo Panca Prima Wijaya" 
                                              className="h-16 w-16 object-contain mb-4" 
                                          />
                                          <h1 className="text-[16px] font-black text-black uppercase leading-none mb-1.5 tracking-tight">PT. PANCA PRIMA WIJAYA</h1>
                                          <div className="text-[10px] text-black leading-tight max-w-[450px]">
                                              <p>Jalan Kayu Putih VII Blok A4 No. 8, RT.3/RW.6 Pulo Gadung, Kec. Pulo</p>
                                              <p>Gadung, Kota Jakarta Timur Daerah Khusus Ibukota Jakarta 14240</p>
                                              <p className="font-bold mt-1">Telp: 0813-1989-8319</p>
                                              <p className="font-bold mt-1">NPWP : 0732.0395.1604.3000 <span className="ml-4">TDP : 09.01.1.46.51295</span></p>
                                          </div>
                                      </div>
                                  </div>
                                  <div className="border-t-[3px] border-black mb-6"></div>

                                  {/* Body */}
                                  <div className="text-[13px] text-black w-full mb-6 relative flex-grow">
                                      <div className="flex justify-between items-start mb-6">
                                          <div className="flex flex-col w-[60%]">
                                              <div className="flex mb-1"><span className="w-16 font-bold flex-shrink-0">Nomor</span><span>: </span><span className="text-black font-bold ml-1">{penawaranNomor}</span></div>
                                              <div className="flex"><span className="w-16 font-bold flex-shrink-0">Perihal</span><span>: </span><span className="text-black font-bold ml-1">{penawaranPerihal}</span></div>
                                          </div>
                                          <div>
                                              <span className="font-bold">Jakarta, <span className="text-black">{new Date().toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'})}</span></span>
                                          </div>
                                      </div>

                                      <div className="mb-6">
                                          <p className="font-bold mb-1 underline underline-offset-2">Kepada Yth :</p>
                                          <p className="text-black font-bold">{currentTrx.customerName}</p>
                                          {(() => {
                                              const c = customers.find(x => x.nama === currentTrx.customerName);
                                              return c ? (
                                                  <div className="text-black font-bold mt-0.5 leading-snug w-2/3">
                                                      <p>{c.alamat}</p>
                                                      {c.phone && <p>Up. Bapak/Ibu ({c.phoneCode || ''}{c.phone})</p>}
                                                  </div>
                                              ) : null;
                                          })()}
                                      </div>

                                      <div className="mb-5 space-y-3">
                                          <p>Dengan hormat,</p>
                                          <p className="indent-10 text-black leading-snug pr-4">{penawaranPembuka}</p>
                                      </div>

                                      <div className="pl-[5%] pr-6 mb-8">
                                          <div className="flex text-black mb-1"><span className="w-24 flex-shrink-0 font-bold">Nama</span><span className="mr-2">:</span><span>{penawaranNama}</span></div>
                                          <div className="flex text-black mb-1"><span className="w-24 flex-shrink-0 font-bold">Bahan aktif</span><span className="mr-2">:</span><span>{penawaranBahanAktif}</span></div>
                                          <div className="flex text-black mb-1">
                                              <span className="w-24 flex-shrink-0 font-bold">Harga</span>
                                              <span className="mr-2">:</span>
                                              <div>
                                                  <p>{penawaranHargaStr}</p>
                                                  <p>{penawaranKeteranganHarga}</p>
                                              </div>
                                          </div>
                                          <div className="flex text-black"><span className="w-24 flex-shrink-0 font-bold">Fungsi</span><span className="mr-2">:</span><span>{penawaranFungsi}</span></div>
                                      </div>

                                      <div className="mb-10 text-black">
                                          <p><span className="font-bold">Waktu pengiriman barang :</span> {penawaranWaktuKirim}</p>
                                          <p>{penawaranPembayaran}</p>
                                      </div>

                                      <div>
                                          <p className="indent-10 leading-snug pr-4">Demikian surat penawaran ini kami ajukan, dan sambil menunggu pesanan Bapak/Ibu, tidak lupa kami ucapkan terima kasih.</p>
                                      </div>
                                  </div>

                                  <div className="mt-20 flex justify-end">
                                      <div className="w-64 text-center mr-8 gap-1 flex flex-col items-center">
                                          <p className="mb-2 text-[12px] text-black">Hormat kami,</p>
                                          <p className="font-bold text-[12px] text-black mb-2">PT. Panca Prima Wijaya.</p>
                                          <img src="https://ik.imagekit.io/cej2dcwlx/image-removebg-preview.png" alt="Signature" className="h-24 object-contain -my-2 mix-blend-multiply" />
                                          <p className="font-bold text-[12px] text-black underline mt-2">Patrick Prayoga</p>
                                      </div>
                                  </div>
                          </div>
                      </div>
                      <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-2">
                          <button 
                            onClick={downloadInvoicePDF} 
                            className="bg-slate-800 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-900 shadow-lg"
                          >
                              <Download size={18}/> Download PDF Penawaran
                          </button>
                      </div>
                  </div>
              )}

              {/* --- PAYMENT FORM --- */}
              {showDrawer === 'paymentForm' && (
                <div className="space-y-6">
                    <div className="bg-violet-50 p-4 rounded-lg border border-violet-100 text-sm text-violet-800">
                        Pilih status pembayaran untuk invoice <b>{currentTrx.noTrx}</b>.
                        Total Tagihan: <b>{formatRupiah(currentTrx.nilaiProyek || 0)}</b>
                    </div>
                    <div className="space-y-4">
                        <label className={labelClass}>Status Pembayaran</label>
                        <div className="grid grid-cols-1 gap-4">
                            <button 
                                onClick={() => {
                                    const amount = currentTrx.nilaiProyek - (currentTrx.pembayaranDiterima || 0);
                                    const newHistory = [...(currentTrx.paymentHistory || [])];
                                    if (amount > 0) {
                                        newHistory.push({
                                            tanggal: new Date().toISOString().split('T')[0],
                                            jumlah: amount,
                                            keterangan: 'Pelunasan'
                                        });
                                    }
                                    setCurrentTrx({
                                        ...currentTrx, 
                                        paymentStatus: 'Lunas', 
                                        pembayaranDiterima: currentTrx.nilaiProyek, 
                                        sisaPembayaran: 0,
                                        paymentHistory: newHistory
                                    });
                                }}
                                className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${currentTrx.paymentStatus === 'Lunas' ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                            >
                                <div className={`p-3 rounded-full ${currentTrx.paymentStatus === 'Lunas' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                    <CheckCircle size={24} />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-lg">Lunas</div>
                                    <div className="text-xs opacity-70">Pembayaran penuh telah diterima</div>
                                </div>
                            </button>
                            <button 
                                onClick={() => {
                                    const tenDaysLater = new Date(currentTrx.tanggal || new Date());
                                    tenDaysLater.setDate(tenDaysLater.getDate() + 10);
                                    setCurrentTrx({
                                        ...currentTrx, 
                                        paymentStatus: 'Belum Lunas',
                                        jatuhTempo: tenDaysLater.toISOString().split('T')[0]
                                    });
                                }}
                                className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${currentTrx.paymentStatus === 'Belum Lunas' ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                            >
                                <div className={`p-3 rounded-full ${currentTrx.paymentStatus === 'Belum Lunas' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                    <Activity size={24} />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-lg">DP (Belum Lunas)</div>
                                    <div className="text-xs opacity-70">Pembayaran uang muka atau belum lunas</div>
                                </div>
                            </button>
                        </div>

                        {currentTrx.paymentStatus === 'Belum Lunas' && (
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 animate-in fade-in slide-in-from-top-2">
                                {transactions.find(t => t.id === currentTrx.id)?.paymentStatus === 'Belum Lunas' && (
                                    <div>
                                        <label className={labelClass}>Tambah Pembayaran Baru</label>
                                        <input 
                                            type="text" 
                                            className={inputClass} 
                                            value={formatInputNumber(additionalPayment)} 
                                            onChange={e => {
                                                const val = parseInputNumber(e.target.value);
                                                setAdditionalPayment(val);
                                                const prevPaid = transactions.find(t => t.id === currentTrx.id)?.pembayaranDiterima || 0;
                                                const totalPaid = prevPaid + val;
                                                
                                                const newHistory = [...(transactions.find(t => t.id === currentTrx.id)?.paymentHistory || [])];
                                                // We'll handle the actual history push on "Save" if we had a save button, 
                                                // but here it updates currentTrx directly. 
                                                // To keep it simple for now, we'll just update the total.
                                                // Actually, the user wants to see history.
                                                
                                                setCurrentTrx({
                                                    ...currentTrx, 
                                                    pembayaranDiterima: totalPaid,
                                                    sisaPembayaran: (currentTrx.nilaiProyek || 0) - totalPaid,
                                                    paymentStatus: totalPaid >= (currentTrx.nilaiProyek || 0) ? 'Lunas' : 'Belum Lunas'
                                                });
                                            }} 
                                            placeholder="0"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className={labelClass}>Total Pembayaran Diterima</label>
                                    <input 
                                        type="text" 
                                        className={inputClass} 
                                        value={formatInputNumber(currentTrx.pembayaranDiterima)} 
                                        onChange={e => {
                                            const val = parseInputNumber(e.target.value);
                                            setCurrentTrx({
                                                ...currentTrx, 
                                                pembayaranDiterima: val,
                                                sisaPembayaran: (currentTrx.nilaiProyek || 0) - val,
                                                paymentStatus: val >= (currentTrx.nilaiProyek || 0) ? 'Lunas' : 'Belum Lunas'
                                            });
                                        }} 
                                        placeholder="0"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Sisa Pembayaran</label>
                                        <div className="p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-red-600">
                                            {formatRupiah(currentTrx.sisaPembayaran !== undefined ? currentTrx.sisaPembayaran : (currentTrx.nilaiProyek || 0) - (currentTrx.pembayaranDiterima || 0))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Jatuh Tempo (10 Hari)</label>
                                        <input 
                                            type="date" 
                                            className={inputClass} 
                                            value={currentTrx.jatuhTempo || ''} 
                                            onChange={e => setCurrentTrx({...currentTrx, jatuhTempo: e.target.value})} 
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
              )}

              {/* --- INPUT RESI FORM --- */}
              {showDrawer === 'inputResi' && (
                  <div className="space-y-4">
                      <div className="bg-blue-50 p-4 rounded border border-blue-100 text-sm text-blue-800 mb-2">
                          Masukkan nomor resi untuk transaksi <b>{currentTrx.noTrx}</b> menggunakan <b>{currentTrx.jasaKirim}</b>.
                      </div>
                      <div>
                          <label className={labelClass}>Nomor Resi</label>
                          <input autoFocus className={inputClass} value={currentTrx.noResi || ''} onChange={e => setCurrentTrx({...currentTrx, noResi: e.target.value})} placeholder="Contoh: JP123456789" />
                      </div>
                  </div>
              )}

              {/* --- CUSTOMER DETAIL (READ ONLY + HISTORY) --- */}
              {showDrawer === 'custDetail' && (
                  <div className="space-y-6">
                      {/* Action Buttons */}
                      <div className="flex items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs">
                          <div className="flex items-center gap-2">
                              {currentCust.phone && (
                                  <a 
                                      href={`https://wa.me/${(currentCust.phoneCode || '+62').replace('+', '')}${currentCust.phone}`} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 transition-colors text-xs font-bold"
                                  >
                                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                      WhatsApp
                                  </a>
                              )}
                              {currentCust.email && (
                                  <a 
                                      href={`mailto:${currentCust.email}`}
                                      className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 transition-colors text-xs font-bold"
                                  >
                                      <Mail size={16}/>
                                      Email
                                  </a>
                              )}
                          </div>
                          <div className="flex items-center gap-2">
                              {canEditCurrentView && (
                                  <button 
                                      onClick={() => setShowDrawer('cust')}
                                      className="p-2 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors border border-transparent"
                                      title="Edit"
                                  >
                                      <Plus size={18}/>
                                  </button>
                              )}
                              {canEditCurrentView && (
                                  <button 
                                      onClick={() => handleDelete(currentCust.id)}
                                      className="p-2 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors border border-transparent"
                                      title="Hapus"
                                  >
                                      <Trash2 size={18}/>
                                  </button>
                              )}
                          </div>
                      </div>

                      {/* Profile Header */}
                      <div className="bg-slate-50 dark:bg-slate-800/90 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                          <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-14 h-14 bg-violet-100 dark:bg-violet-950/80 text-violet-600 dark:text-violet-300 rounded-full flex items-center justify-center font-bold text-xl shadow-inner border border-violet-200 dark:border-violet-800">
                                        {currentCust.nama?.substring(0,2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-bold text-foreground leading-tight">{currentCust.nama}</h4>
                                        <div className="text-xs text-muted-foreground font-mono mb-1">{currentCust.kode}</div>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={12} className="text-muted-foreground"/> {currentCust.alamat || 'Alamat tidak tersedia'}</span>
                                    </div>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-xs ${currentCust.jenis === 'Perusahaan' ? 'bg-blue-600 text-white border-blue-700' : 'bg-amber-500 text-white border-amber-600'}`}>
                                    {currentCust.jenis}
                                </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-6 text-sm">
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Phone Number</label>
                                  <div className="font-bold text-foreground flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                      {currentCust.phoneCode || ''}{currentCust.phone}
                                  </div>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Email Address</label>
                                  <div className="font-bold text-foreground flex items-center gap-1.5 truncate">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                      {currentCust.email || '-'}
                                  </div>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Sales Representative</label>
                                  <div className="font-bold text-foreground flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                                      {currentCust.sales}
                                  </div>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Country</label>
                                  <div className="font-bold text-foreground flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                                      {currentCust.negara || '-'}
                                  </div>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Tax ID (NPWP)</label>
                                  <div className="font-bold text-foreground flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                                      {currentCust.npwp || '-'}
                                  </div>
                              </div>
                              <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Lead Source</label>
                                  <div className="font-bold text-foreground flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                      {currentCust.source || '-'}
                                  </div>
                              </div>
                          </div>
                          
                          <div className="mt-6 pt-5 border-t border-border">
                              <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Additional Notes</label>
                              <div className="text-xs text-foreground/90 italic mt-2 leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs">
                                  {currentCust.keterangan || 'No additional notes available for this contact.'}
                              </div>
                          </div>
                      </div>

                      {/* Transaction History */}
                      <div className="bg-slate-50 dark:bg-slate-800/90 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                          <h5 className="font-black text-xs uppercase tracking-widest text-foreground mb-4 flex items-center gap-2">
                              <Activity size={16} className="text-violet-500"/> Riwayat Transaksi
                          </h5>
                          
                          <div className="grid grid-cols-3 gap-3 mb-5">
                              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-center shadow-xs">
                                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-tighter">Selesai</div>
                                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">{transactions.filter(t => t.companyId === activeCompanyId && t.customerName === currentCust.nama && t.status === 'Selesai').length}</div>
                              </div>
                              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800/60 text-center shadow-xs">
                                  <div className="text-[10px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-tighter">Progress</div>
                                  <div className="text-lg font-black text-blue-700 dark:text-blue-300">{transactions.filter(t => t.companyId === activeCompanyId && t.customerName === currentCust.nama && (t.status === 'Progress' || t.status === 'Pengiriman')).length}</div>
                              </div>
                              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center shadow-xs">
                                  <div className="text-[10px] text-rose-600 dark:text-rose-400 font-black uppercase tracking-tighter">Batal</div>
                                  <div className="text-lg font-black text-rose-700 dark:text-rose-300">{transactions.filter(t => t.companyId === activeCompanyId && t.customerName === currentCust.nama && t.status === 'Batal').length}</div>
                              </div>
                          </div>

                          <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                              {transactions.filter(t => t.companyId === activeCompanyId && t.customerName === currentCust.nama).length > 0 ? (
                                  transactions.filter(t => t.companyId === activeCompanyId && t.customerName === currentCust.nama).map(t => (
                                      <div key={t.id} className="p-3 bg-muted/40 border border-border rounded-xl flex justify-between items-center hover:bg-card hover:shadow-sm transition-all cursor-pointer group" onClick={() => handleTrxClick(t)}>
                                          <div className="flex items-center gap-3">
                                              <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center border border-border group-hover:border-violet-300">
                                                  <FileText size={14} className="text-muted-foreground group-hover:text-violet-500"/>
                                              </div>
                                              <div>
                                                  <div className="text-xs font-black text-foreground">{t.noTrx}</div>
                                                  <div className="text-[10px] text-muted-foreground font-bold uppercase">{formatDateShort(t.tanggal)}</div>
                                              </div>
                                          </div>
                                          <div className="text-right">
                                              <div className="text-xs font-black text-foreground">{formatRupiah(t.nilaiProyek)}</div>
                                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                                  t.status === 'Selesai' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' :
                                                  t.status === 'Progress' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400' : 
                                                  t.status === 'Pengiriman' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                                              }`}>
                                                  {t.status}
                                              </span>
                                          </div>
                                      </div>
                                  ))
                              ) : (
                                  <div className="text-center py-8 border-2 border-dashed border-border rounded-xl text-muted-foreground text-xs font-bold uppercase tracking-widest">
                                      No transaction history
                                  </div>
                              )}
                          </div>
                      </div>

                      {/* Edit History Section */}
                      <div className="mt-6 border-t border-slate-100 pt-6">
                          <div className="flex items-center justify-between mb-4">
                              <button 
                                  onClick={() => setShowHistory(!showHistory)}
                                  className="flex items-center gap-2 group"
                              >
                                  <h5 className="font-black text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2 group-hover:text-violet-500 transition-colors">
                                      <RefreshCw size={14} className="text-violet-500"/> Activity Log
                                      {currentCust.editHistory && currentCust.editHistory.length > 0 && (
                                          <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[8px]">{currentCust.editHistory.length}</span>
                                      )}
                                  </h5>
                                  <div className={`transition-transform duration-300 ${showHistory ? 'rotate-180' : ''}`}>
                                      <ChevronDown size={14} className="text-slate-400" />
                                  </div>
                              </button>
                              <button 
                                  onClick={() => setShowHistory(!showHistory)}
                                  className="text-[9px] font-black uppercase tracking-widest text-violet-600 hover:text-violet-700 flex items-center gap-1 transition-colors"
                              >
                                  <Eye size={12} /> {showHistory ? 'Tutup' : 'Lihat Detail'}
                              </button>
                          </div>

                          {showHistory && (
                              <div className="mt-4 space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                                  {currentCust.editHistory && currentCust.editHistory.length > 0 ? (
                                      currentCust.editHistory.slice().reverse().map((log, idx) => (
                                          <div key={idx} className="relative pl-8 group">
                                              <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-10 bg-slate-100 text-slate-500">
                                                  <Activity size={10} />
                                              </div>
                                              <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-violet-100 transition-all">
                                                  <div className="flex justify-between items-start mb-2">
                                                      <div className="flex items-center gap-2">
                                                          <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-[8px] font-black text-violet-600">
                                                              {log.user.substring(0,1)}
                                                          </div>
                                                          <div className="text-[10px] font-black text-slate-700">{log.user}</div>
                                                      </div>
                                                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{log.timestamp}</div>
                                                  </div>
                                                  <div className="text-[11px] text-slate-600 leading-relaxed font-medium">
                                                      {log.changes.split(', ').map((change, cIdx) => (
                                                          <div key={cIdx} className="flex items-start gap-2 mb-1 last:mb-0">
                                                              <div className="mt-1.5 w-1 h-1 rounded-full bg-slate-300 shrink-0"></div>
                                                              <span>{change}</span>
                                                          </div>
                                                      ))}
                                                  </div>
                                              </div>
                                          </div>
                                      ))
                                  ) : (
                                      <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Belum ada history aktivitas</p>
                                      </div>
                                  )}
                              </div>
                          )}
                      </div>
                  </div>
              )}

              {/* --- TRANSACTION FORM (Updated) --- */}
              {showDrawer === 'trx' && (
                <div className="space-y-6">
                    {/* Header Info */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-1 md:col-span-2">
                            <label className={labelClass}>Customer</label>
                            <SearchableSelect options={customers.filter(c => c.companyId === activeCompanyId || c.company_id === activeCompanyId).map(c => ({ value: c.nama, label: c.nama }))} value={currentTrx.customerName || ''} onChange={v => setCurrentTrx({...currentTrx, customerName: v})} placeholder="Cari Customer..." className="bg-white" />
                        </div>
                        {currentTrx.status !== 'Penawaran' && (
                            <>
                                <div>
                                     <label className={labelClass}>Tanggal</label>
                                     <input type="date" className={inputClass} value={currentTrx.tanggal} onChange={e => setCurrentTrx({...currentTrx, tanggal: e.target.value})} />
                                </div>
                                <div>
                                     <label className={labelClass}>Status Transaksi</label>
                                     <select className={inputClass} value={currentTrx.status || 'Invoice'} onChange={e => {
                                         const val = e.target.value;
                                         setCurrentTrx({
                                             ...currentTrx, 
                                             status: val as any,
                                             statuses: [val],
                                             paymentStatus: val === 'Selesai' ? 'Lunas' : currentTrx.paymentStatus
                                         });
                                     }}>
                                         <option value="Invoice">Invoice</option>
                                         <option value="Payment">Pembayaran</option>
                                         <option value="Pengiriman">Pengiriman</option>
                                         <option value="Selesai">Pesanan Selesai</option>
                                         <option value="Batal">Batal</option>
                                     </select>
                                </div>
                                <div>
                                     <label className={labelClass}>Payment Status</label>
                                     <select className={inputClass} value={currentTrx.paymentStatus || 'Belum Lunas'} onChange={e => setCurrentTrx({...currentTrx, paymentStatus: e.target.value as any})}>
                                         <option value="Belum Lunas">Belum Lunas</option>
                                         <option value="DP">DP</option>
                                         <option value="Lunas">Lunas</option>
                                     </select>
                                </div>
                            </>
                        )}
                        <div>
                             <label className={labelClass}>Sales Responsible</label>
                             <SearchableSelect options={salesMembers.map(s => ({ value: s, label: s }))} value={currentTrx.sales || salesMembers[0]} onChange={v => setCurrentTrx({...currentTrx, sales: v})} placeholder="Pilih Sales" className="bg-white" />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                             <label className={labelClass}>Keterangan</label>
                             <textarea className={`${inputClass} h-20 resize-none`} value={currentTrx.keterangan || ''} onChange={e => setCurrentTrx({...currentTrx, keterangan: e.target.value})} placeholder="Masukkan keterangan..." />
                        </div>
                        {currentTrx.status !== 'Penawaran' && (
                            <div>
                                 <label className={labelClass}>Jasa Kirim</label>
                                 <SearchableSelect options={SHIPPING_SERVICES.map(s => ({ value: s, label: s }))} value={currentTrx.jasaKirim || 'JNE Regular'} onChange={v => setCurrentTrx({...currentTrx, jasaKirim: v})} placeholder="Pilih Ekspedisi" className="bg-white" />
                                  {currentTrx.jasaKirim === 'Lainnya' && (
                                      <input 
                                          type="text" 
                                          value={currentTrx.customJasaKirim || ''} 
                                          onChange={e => setCurrentTrx({...currentTrx, customJasaKirim: e.target.value})} 
                                          placeholder="Masukkan nama jasa kirim" 
                                          className="w-full mt-2 p-2 border border-slate-300 rounded-md text-sm"
                                      />
                                  )}
                            </div>
                        )}
                    </div>

                    {/* Penawaran Specific Fields */}
                    {currentTrx.status === 'Penawaran' && (
                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="col-span-1 md:col-span-2 font-bold text-[10px] text-purple-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                <MessageSquare size={14} /> Follow-up Information
                            </div>
                            <div>
                                <label className={labelClass}>Tanggal Follow-up</label>
                                <input type="date" className={inputClass} value={currentTrx.followUpDate || ''} onChange={e => setCurrentTrx({...currentTrx, followUpDate: e.target.value})} />
                            </div>
                            <div>
                                <label className={labelClass}>Metode Follow-up</label>
                                <select className={inputClass} value={currentTrx.followUpMethod || ''} onChange={e => setCurrentTrx({...currentTrx, followUpMethod: e.target.value as any})}>
                                    <option value="">Pilih Metode...</option>
                                    <option value="WhatsApp">WhatsApp</option>
                                    <option value="Email">Email</option>
                                    <option value="Telepon">Telepon</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Items Section */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className={labelClass}>{currentTrx.status === 'Penawaran' ? 'Item Penawaran' : 'Item Transaksi'}</label>
                            <button onClick={()=>setCurrentTrx(p=>({...p, items: [...(p.items||[]), { produkId: '', nama: '', kode: '', harga: 0, qty: 1, diskon: 0 }]}))} className="flex items-center gap-1 text-xs font-bold text-[#A91D3A] bg-red-50 px-2 py-1 rounded hover:bg-red-100"><Plus size={12}/> Tambah Produk</button>
                        </div>
                            <div className="space-y-3">
                                {currentTrx.items?.map((item, idx) => (
                                    <div key={idx} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm relative group flex gap-3">
                                        <button onClick={()=>setCurrentTrx(p=>({...p, items: p.items?.filter((_,i)=>i!==idx)}))} className="absolute -top-2 -right-2 z-10 bg-white text-red-500 border border-slate-200 rounded-full p-1 shadow-sm hover:bg-red-50"><X size={12}/></button>
                                        
                                        {(() => {
                                            const p = products.find(x => x.nama === item.nama);
                                            return p?.images?.[0] ? (
                                                <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-100 shrink-0">
                                                    <img src={p.images[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                </div>
                                            ) : (
                                                <div className="w-16 h-16 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-slate-300">
                                                    <Package size={20} />
                                                </div>
                                            );
                                        })()}

                                        <div className="flex-1 min-w-0">
                                            <div className="mb-2">
                                                <SearchableSelect 
                                                    options={products.filter(p => p.companyId === activeCompanyId || p.company_id === activeCompanyId).map(p => ({ 
                                                        value: p.nama, 
                                                        label: `${p.nama} (Stok: ${getAvailableStock(p.nama)})`,
                                                        image: p.images?.[0]
                                                    }))} 
                                                    value={item.nama} 
                                                    onChange={(val) => { 
                                                        const prod = products.find(p => p.nama === val && (p.companyId === activeCompanyId || p.company_id === activeCompanyId)); 
                                                        const lot = prod?.lots[prod.lots.length - 1]; 
                                                        const newI = [...(currentTrx.items||[])]; 
                                                        newI[idx] = { ...item, nama: val, produkId: prod?.id||'', kode: lot?.kode||'', harga: prod ? getProductPrice(prod) : 0 }; 
                                                        setCurrentTrx(p => ({...p, items: newI})); 
                                                    }} 
                                                    placeholder="Pilih Produk" 
                                                    className="bg-slate-50" 
                                                />
                                            </div>
                                            
                                            <div className="grid grid-cols-3 gap-3">
                                                <div>
                                                    <span className="text-[10px] text-slate-400 block mb-1">Harga Satuan</span>
                                                    <input 
                                                        type="text" 
                                                        className={`${inputClass} text-right bg-slate-50 cursor-not-allowed`} 
                                                        value={formatInputNumber(item.harga)} 
                                                        readOnly 
                                                        title="Harga hanya dapat diubah di menu Produk"
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <div className="text-[10px] text-slate-400 font-mono">KODE: {item.kode}</div>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-400 block mb-1">Qty</span>
                                                    <input 
                                                        type="number" 
                                                        className={`${inputClass} text-center ${(() => {
                                                            const totalStock = getAvailableStock(item.nama);
                                                            return item.qty > totalStock ? 'border-red-500 bg-red-50 text-red-600' : '';
                                                        })()}`} 
                                                        value={item.qty} 
                                                        onChange={e => { 
                                                            const val = parseInt(e.target.value) || 0;
                                                            const newI = [...(currentTrx.items || [])]; 
                                                            newI[idx] = { ...item, qty: Math.max(0, val) }; 
                                                            setCurrentTrx(p => ({...p, items: newI})); 
                                                        }} 
                                                    />
                                                    {(() => {
                                                        const totalStock = getAvailableStock(item.nama);
                                                        if (item.nama && item.qty > totalStock) {
                                                            if (currentTrx.status === 'Penawaran' || currentTrx.statuses?.includes('Penawaran')) {
                                                                return <span className="text-[9px] text-[#A91D3A] font-bold block mt-1 animate-pulse">Jumlah produk yang ditawarkan tidak cukup, pastikan untuk melakukan PO! (Max: {totalStock})</span>;
                                                            }
                                                            return <span className="text-[9px] text-red-500 font-bold block mt-1 animate-pulse">Stok tidak cukup! (Max: {totalStock})</span>;
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-400 block mb-1">Diskon Item</span>
                                                    <input type="text" className={`${inputClass} text-right text-red-500`} value={formatInputNumber(item.diskon)} onChange={e => { const newI = [...(currentTrx.items||[])]; newI[idx] = { ...item, diskon: parseInputNumber(e.target.value) }; setCurrentTrx(p => ({...p, items: newI})); }} placeholder="0" />
                                                </div>
                                            </div>
                                            <div className="mt-2 text-right text-sm font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded">
                                                Subtotal: {formatRupiah((item.qty * item.harga) - item.diskon)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {(!currentTrx.items || currentTrx.items.length === 0) && (
                                    <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">Belum ada produk dipilih</div>
                                )}
                            </div>
                        </div>

                    {/* Summary & Ongkir */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                 <input type="checkbox" checked={currentTrx.ppn} onChange={e => setCurrentTrx({...currentTrx, ppn: e.target.checked})} className="rounded text-violet-600"/>
                                 <span className="text-sm font-medium">PPN 11%</span>
                             </div>
                             <div className="font-mono text-sm">{formatRupiah(trxCalculations.ppnAmount)}</div>
                         </div>
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                 <input type="checkbox" checked={currentTrx.ongkir} onChange={e => setCurrentTrx({...currentTrx, ongkir: e.target.checked})} className="rounded text-violet-600"/>
                                 <span className="text-sm font-medium">Biaya Kirim</span>
                             </div>
                             {currentTrx.ongkir ? (
                                 <input type="text" className="w-32 text-right text-sm border rounded p-1" value={formatInputNumber(currentTrx.biayaOngkir)} onChange={e => setCurrentTrx({...currentTrx, biayaOngkir: parseInputNumber(e.target.value)})} autoFocus />
                             ) : <span className="text-sm text-slate-400">-</span>}
                         </div>
                         <div className="border-t border-slate-300 pt-3 flex justify-between items-center">
                             <span className="font-bold text-lg">Total</span>
                             <span className="font-bold text-xl text-[#A91D3A]">{formatRupiah(trxCalculations.grandTotal)}</span>
                         </div>
                    </div>
                </div>
              )}

              {/* --- CUSTOMER FORM --- */}
              {showDrawer === 'cust' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Jenis Kontak</label>
                            <select className={inputClass} value={currentCust.jenis} onChange={e => setCurrentCust({...currentCust, jenis: e.target.value})}>
                                <option value="Perusahaan">Perusahaan</option>
                                <option value="Perorangan">Perorangan</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>{currentCust.jenis === 'Perusahaan' ? 'Nama Perusahaan' : 'Nama Lengkap'}</label>
                            <input className={inputClass} value={currentCust.nama || ''} onChange={e => setCurrentCust({...currentCust, nama: e.target.value})} placeholder={currentCust.jenis === 'Perusahaan' ? 'Masukkan nama perusahaan...' : 'Masukkan nama lengkap...'} />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className={labelClass}>Telepon / WhatsApp</label>
                            <div className="flex gap-2">
                                <select 
                                    className={`${inputClass} w-40 shrink-0`} 
                                    value={currentCust.phoneCode || '+62'} 
                                    onChange={e => {
                                        const newCode = e.target.value;
                                        const cleanCode = newCode.replace('+', '');
                                        let newPhone = currentCust.phone || '';
                                        // If phone starts with the new code, strip it
                                        if (newPhone.startsWith(cleanCode)) {
                                            newPhone = newPhone.substring(cleanCode.length);
                                        }
                                        setCurrentCust({...currentCust, phoneCode: newCode, phone: newPhone});
                                    }}
                                >
                                    {COUNTRY_CODES.map(c => (
                                        <option key={c.code + c.name} value={c.code}>{c.flag} {c.code} ({c.name})</option>
                                    ))}
                                </select>
                                <input 
                                    type="text"
                                    className={`${inputClass} flex-1`} 
                                    value={currentCust.phone || ''} 
                                    onChange={e => {
                                        let val = e.target.value.replace(/\D/g, '');
                                        const cleanCode = (currentCust.phoneCode || '+62').replace('+', '');
                                        
                                        // If user types the country code at the start, strip it
                                        if (val.startsWith(cleanCode)) {
                                            val = val.substring(cleanCode.length);
                                        }
                                        // If user types '0' at the start, strip it
                                        if (val.startsWith('0')) {
                                            val = val.substring(1);
                                        }
                                        
                                        setCurrentCust({...currentCust, phone: val});
                                    }} 
                                    placeholder="8123456789" 
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Email</label>
                            <input type="email" className={inputClass} value={currentCust.email || ''} onChange={e => setCurrentCust({...currentCust, email: e.target.value})} placeholder="email@example.com" />
                        </div>
                        <div>
                            <label className={labelClass}>Negara</label>
                            <input className={inputClass} value={currentCust.negara || ''} onChange={e => setCurrentCust({...currentCust, negara: e.target.value})} />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className={labelClass}>Alamat Lengkap</label>
                            <textarea className={`${inputClass} h-20 resize-none`} value={currentCust.alamat || ''} onChange={e => setCurrentCust({...currentCust, alamat: e.target.value})} placeholder="Jl. ..." />
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-1 md:col-span-2 font-bold text-[10px] text-slate-400 uppercase tracking-widest mb-1">Sales & Marketing</div>
                        <div>
                            <label className={labelClass}>Sales Representative</label>
                            <SearchableSelect options={salesMembers.map(s => ({ value: s, label: s }))} value={currentCust.sales || salesMembers[0]} onChange={v => setCurrentCust({...currentCust, sales: v})} placeholder="Pilih Sales" className="bg-white" />
                        </div>
                        <div>
                            <label className={labelClass}>Lead Type</label>
                            <select className={inputClass} value={currentCust.leadType} onChange={e => setCurrentCust({...currentCust, leadType: e.target.value})}>
                                <option value="Pelanggan Tetap">Pelanggan Tetap</option>
                                <option value="Baru">Baru</option>
                                <option value="Belum Transaksi">Belum Transaksi</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Source</label>
                            <select className={inputClass} value={currentCust.source} onChange={e => setCurrentCust({...currentCust, source: e.target.value})}>
                                <option value="Organic">Organic</option>
                                <option value="Referral">Referral</option>
                                <option value="Website">Website</option>
                                <option value="Instagram">Instagram</option>
                                <option value="Ads">Ads</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>NPWP</label>
                            <input className={inputClass} value={currentCust.npwp || ''} onChange={e => setCurrentCust({...currentCust, npwp: e.target.value})} placeholder="00.000.000.0-000.000" />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Keterangan Tambahan</label>
                        <textarea className={`${inputClass} h-24 resize-none`} value={currentCust.keterangan || ''} onChange={e => setCurrentCust({...currentCust, keterangan: e.target.value})} placeholder="Catatan khusus..." />
                    </div>
                </div>
              )}

              {/* --- TRANSACTION DETAIL --- */}
              {showDrawer === 'followUpForm' && (
                <div className="space-y-4 p-4">
                  <h4 className="font-black text-xs uppercase tracking-widest text-slate-800 mb-2">
                    {editingFollowUpIdx !== null ? 'Update Follow-up' : 'Tambah Follow-up'}
                  </h4>
                  <div>
                    <label className={labelClass}>Tanggal Follow-up</label>
                    <input type="date" value={newFollowUp.tanggal} onChange={e => setNewFollowUp({...newFollowUp, tanggal: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Metode Follow-up</label>
                    <select className={inputClass} value={newFollowUp.method || ''} onChange={e => setNewFollowUp({...newFollowUp, method: e.target.value as any})}>
                        <option value="">Pilih Metode...</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Email">Email</option>
                        <option value="Telepon">Telepon</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Keterangan</label>
                    <textarea value={newFollowUp.keterangan} onChange={e => setNewFollowUp({...newFollowUp, keterangan: e.target.value})} className={`${inputClass} h-24 resize-none`} placeholder="Masukkan hasil follow-up..." />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {
                        setShowDrawer('trxDetail');
                        setEditingFollowUpIdx(null);
                    }} className="flex-1 bg-slate-100 text-slate-600 p-2 rounded-lg font-bold text-xs uppercase tracking-widest">Batal</button>
                    <button onClick={() => {
                        setConfirmModal({
                            isOpen: true,
                            title: editingFollowUpIdx !== null ? 'Konfirmasi Update' : 'Konfirmasi Simpan',
                            message: `Apakah Anda yakin ingin ${editingFollowUpIdx !== null ? 'mengupdate' : 'menyimpan'} data follow-up ini?`,
                            type: 'info',
                            onConfirm: () => {
                                let updatedFollowUps = [...(currentTrx.followUps || [])];
                                if (editingFollowUpIdx !== null) {
                                    const oldFU = updatedFollowUps[editingFollowUpIdx];
                                    // Only add to history if something actually changed
                                    if (oldFU.keterangan !== newFollowUp.keterangan || oldFU.method !== newFollowUp.method || oldFU.tanggal !== newFollowUp.tanggal) {
                                        const historyEntry = {
                                            tanggal: oldFU.tanggal,
                                            keterangan: oldFU.keterangan,
                                            method: oldFU.method,
                                            editedAt: new Date().toLocaleString()
                                        };
                                        updatedFollowUps[editingFollowUpIdx] = {
                                            ...newFollowUp,
                                            history: [...(oldFU.history || []), historyEntry]
                                        };
                                    } else {
                                        updatedFollowUps[editingFollowUpIdx] = newFollowUp;
                                    }
                                } else {
                                    updatedFollowUps.push(newFollowUp);
                                }
                                
                                const now = new Date().toLocaleString('id-ID');
                                const actionUserName = currentUser?.nama || 'Unknown';
                                const actionUserRole = currentUser?.role || 'Admin';
                                const logEntry: EditLog = {
                                    timestamp: now,
                                    user: actionUserName,
                                    role: actionUserRole,
                                    changes: editingFollowUpIdx !== null ? `Update follow-up: ${newFollowUp.keterangan}` : `Tambah follow-up baru: ${newFollowUp.keterangan}`,
                                    type: 'Transaction',
                                    id: currentTrx.id || ''
                                };
                                
                                const updatedTrx = {
                                    ...currentTrx, 
                                    followUps: updatedFollowUps,
                                    editHistory: [...(currentTrx.editHistory || []), logEntry]
                                };
                                setCurrentTrx(updatedTrx);
                                setTransactions(prev => prev.map(t => t.id === currentTrx.id ? updatedTrx as Transaction : t));
                                syncToSupabase('transactions', updatedTrx);
                                setShowDrawer('trxDetail');
                                setEditingFollowUpIdx(null);
                                setNewFollowUp({tanggal: new Date().toISOString().split('T')[0], keterangan: '', method: 'WhatsApp'});
                                setConfirmModal(null);
                            }
                        });
                    }} className="flex-1 bg-violet-600 text-white p-2 rounded-lg font-bold text-xs uppercase tracking-widest shadow-lg shadow-violet-200">
                        {editingFollowUpIdx !== null ? 'Update' : 'Simpan'}
                    </button>
                  </div>
                </div>
              )}
              {showDrawer === 'trxDetail' && (
                <div className="space-y-6">
                    <div className={`p-5 rounded-xl border shadow-xs ${currentTrx.status === 'Penawaran' ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/60' : 'bg-card border-border'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="text-lg font-bold text-foreground">
                                    {currentTrx.status === 'Penawaran' ? `Quotation: ${currentTrx.noTrx}` : currentTrx.noTrx}
                                </h4>
                                <p className="text-xs text-muted-foreground">{formatDateShort(currentTrx.tanggal || '')}</p>
                            </div>
                            <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase 
                                ${currentTrx.status==='Selesai' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 
                                currentTrx.status==='Progress' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400' : 
                                currentTrx.status==='Payment' ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400' :
                                currentTrx.status==='Pengiriman' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400' :
                                currentTrx.status==='Penawaran' ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400' :
                                'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'}`}>
                                {currentTrx.status === 'Progress' ? 'Invoice' : currentTrx.status === 'Payment' ? 'Pembayaran' : currentTrx.status}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-muted-foreground">Customer</label>
                                <div className="font-medium text-foreground">{currentTrx.customerName}</div>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-muted-foreground">Sales Rep</label>
                                <div className="font-medium text-foreground">{currentTrx.sales}</div>
                            </div>
                            {currentTrx.status === 'Penawaran' || currentTrx.statuses?.includes('Penawaran') ? (
                                (() => {
                                    const sortedFollowUps = (currentTrx.followUps || []).slice().sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
                                    const latestFU = sortedFollowUps[0];
                                    const baseDate = latestFU ? new Date(latestFU.tanggal) : new Date(currentTrx.tanggal);
                                    const computedNextDate = new Date(baseDate.getTime() + autoNotifyDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                                    const computedMethod = latestFU ? latestFU.method : (currentTrx.followUpMethod || 'WhatsApp');
                                    
                                    return (
                                        <>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-muted-foreground">Next Follow-up</label>
                                                <div className="font-medium text-purple-600 dark:text-purple-400">{formatDateShort(computedNextDate)}</div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-muted-foreground">Metode</label>
                                                <div className="font-medium text-purple-600 dark:text-purple-400">{computedMethod || '-'}</div>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Latest Follow-up</label>
                                            {!['PPN', 'NON PPN', 'Ongkir'].includes(activeView) && canEditCurrentView && (
                                                <button 
                                                    onClick={() => {
                                                        const lastIdx = (currentTrx.followUps?.length || 0) - 1;
                                                        if (lastIdx >= 0) {
                                                            setNewFollowUp(currentTrx.followUps![lastIdx]);
                                                            setEditingFollowUpIdx(lastIdx);
                                                        } else {
                                                            setNewFollowUp({tanggal: new Date().toISOString().split('T')[0], keterangan: '', method: 'WhatsApp'});
                                                            setEditingFollowUpIdx(null);
                                                        }
                                                        setShowDrawer('followUpForm');
                                                    }}
                                                    className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                                                >
                                                    <Plus size={10} /> Update
                                                </button>
                                            )}
                                        </div>
                                        <div className="font-medium text-foreground italic">
                                            {latestFU ? latestFU.keterangan : 'Belum ada follow up'}
                                        </div>
                                    </div>
                                    </>
                                  );
                                })()
                            ) : (
                                <>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Jasa Kirim</label>
                                        <div className="font-medium text-foreground">{currentTrx.jasaKirim}</div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-muted-foreground">No. Resi</label>
                                        <div className="font-medium text-foreground">{currentTrx.noResi || '-'}</div>
                                    </div>
                                </>
                            )}
                        </div>

                        {currentTrx.keterangan && (
                            <div className="mt-4 pt-4 border-t border-border">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground">Keterangan</label>
                                <div className="text-sm text-foreground mt-1 leading-relaxed">{currentTrx.keterangan}</div>
                            </div>
                        )}

                        {!(currentTrx.status === 'Penawaran' || currentTrx.statuses?.includes('Penawaran')) && (
                            <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Pembayaran Diterima</label>
                                    <div className="font-medium text-foreground">{formatRupiah(currentTrx.pembayaranDiterima || 0)}</div>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Jatuh Tempo</label>
                                    <div className="font-medium text-amber-600 dark:text-amber-400 font-bold">{currentTrx.jatuhTempo || '-'}</div>
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Sisa Pembayaran</label>
                                    <div className="font-medium text-rose-600 dark:text-rose-400 text-lg font-black">
                                        {formatRupiah(currentTrx.sisaPembayaran !== undefined ? currentTrx.sisaPembayaran : (currentTrx.nilaiProyek || 0) - (currentTrx.pembayaranDiterima || 0))}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Contact Buttons */}
                        {(() => {
                            if (['PPN', 'NON PPN', 'Ongkir'].includes(activeView)) return null;
                            const contact = getContactInfo(currentTrx);
                            
                            const salesUser = appUsers.find(u => u.nama === currentTrx.sales);
                            const salesWaLink = salesUser && salesUser.whatsapp 
                                ? `https://wa.me/${salesUser.whatsapp.startsWith('62') ? salesUser.whatsapp : '62' + salesUser.whatsapp.replace(/^0/, '')}`
                                : null;

                            if (!contact && !salesWaLink) return null;
                            
                            const cleanPhone = contact?.phone?.replace(/\D/g, '') || '';
                            const waLink = contact ? `https://wa.me/${contact.phoneCode?.replace('+', '') || '62'}${cleanPhone}` : '';
                            const mailLink = contact ? `mailto:${contact.email}` : '';
                            
                            // Auto-generated message for Sales
                            let salesWaMessage = '';
                            if (salesWaLink) {
                                const customerName = contact?.nama || currentTrx.customerName || 'Customer';
                                salesWaMessage = `Halo ${salesUser.nama}, mohon update untuk ${currentTrx.status === 'Penawaran' ? 'penawaran' : 'transaksi'} *${currentTrx.noTrx || ''}* (${customerName}).\n`;
                                
                                if (currentTrx.keterangan) {
                                    salesWaMessage += `\nKeterangan:\n_${currentTrx.keterangan}_\n`;
                                }

                                if (currentTrx.followUps && currentTrx.followUps.length > 0) {
                                    const lastFu = currentTrx.followUps[currentTrx.followUps.length - 1];
                                    salesWaMessage += `\nFollow-up terakhir (${lastFu.tanggal} via ${lastFu.method}):\n_${lastFu.keterangan}_`;
                                } else {
                                    salesWaMessage += `\nBelum ada follow-up tercatat di sistem.`;
                                }
                                salesWaMessage = encodeURIComponent(salesWaMessage);
                            }
                            
                            if (!contact && salesWaLink) {
                                return (
                                    <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                                         <a href={`${salesWaLink}?text=${salesWaMessage}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-[10px] uppercase tracking-wider font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"><MessageSquare size={14} /> Ping Sales ({salesUser.nama})</a>
                                         {currentUser?.role === 'superadmin' && salesUser?.whatsapp && (
                                            <button 
                                                onClick={async () => {
                                                    const sortedFollowUps = currentTrx.followUps && currentTrx.followUps.length > 0 
                                                        ? [...currentTrx.followUps].sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
                                                        : [];
                                                    const latestFU = sortedFollowUps[0] || {};
                                                    const cust = customers.find(c => c.nama === currentTrx.customerName);
                                                    const noCust = cust ? `${cust.phoneCode || ''}${cust.phone || ''}` : '-';
                                                    
                                                    const itemListStr = currentTrx.items && currentTrx.items.length > 0 ? currentTrx.items.map((item: any) => `- ${item.nama} (Qty: ${item.qty})`).join('\n') : 'Tidak ada item';
                                                    const totalVal = currentTrx.items?.reduce((acc: number, curr: any) => acc + ((curr.harga * curr.qty) - (curr.diskon || 0)), 0) || 0;
                                                    const roadmapStr = sortedFollowUps.map((fu: any) => `[${fu.tanggal}] ${fu.method || '-'}: ${fu.keterangan || '-'}`).join('\n') || 'Belum ada roadmap follow up';
                                                    const testMsg = `PENAWARAN\n\nPesan: Penawaran sudah ${autoNotifyDays} hari tanpa follow-up baru. Mohon segera diproses.\n\nNo. Penawaran: ${currentTrx.noTrx}\nSales: ${currentTrx.sales || '-'}\nCustomer: ${currentTrx.customerName}\nWA/Telp: ${noCust}\n\nItem Penawaran:\n${itemListStr}\nTotal Penawaran: ${formatRupiah(totalVal)}\n\nMetode Follow-up: ${latestFU.method || currentTrx.followUpMethod || '-'}\nFollow-up Terakhir: ${latestFU.tanggal || '-'}\nKeterangan: ${latestFU.keterangan || '-'}\n\nRoadmap Follow-up:\n${roadmapStr}\n\n*_"setelah melakukan followup lanjutan harap segera melakukan update follow up terbaru di penawaran ini di BRM , link : https://mypancaapps.netlify.app/"_*`;
                                                    try {
                                                        const res = await fetch("/api/send-whatsapp", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ phone: salesUser.whatsapp, message: testMsg })
                                                        });
                                                        
                                                        if (autoNotifySuperadmin) {
                                                            const superAdminUsers = appUsers.filter(u => u.username === 'superadmin' && u.whatsapp);
                                                            for (const sa of superAdminUsers) {
                                                                await fetch("/api/send-whatsapp", {
                                                                    method: "POST",
                                                                    headers: { "Content-Type": "application/json" },
                                                                    body: JSON.stringify({ phone: sa.whatsapp, message: testMsg })
                                                                });
                                                            }
                                                        }

                                                        if (res.ok) {
                                                            const data = await res.json();
                                                            if (data.status === false) {
                                                                alert(`Gagal kirim via API: ${data.reason || JSON.stringify(data)}`);
                                                            } else {
                                                                alert("Ping Sales Test berhasil dikirim via API!");
                                                            }
                                                        } else {
                                                            const data = await res.json().catch(()=>({}));
                                                            alert(`Gagal kirim via API: ${data.error || data.reason || res.statusText}`);
                                                        }
                                                    } catch(err) {
                                                        alert("Terjadi kesalahan sistem saat kirim test ping.");
                                                    }
                                                }}
                                                className="flex-1 bg-slate-800 hover:bg-black text-white text-[10px] tracking-wide font-bold py-2 rounded-lg flex items-center justify-center flex-col leading-none transition-colors"
                                            >
                                                <span className="flex items-center gap-1"><Send size={10} /> Test Ping (API)</span>
                                            </button>
                                        )}
                                    </div>
                                );
                            }
                            
                            return (
                                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                                    {contact && contact.phone && (
                                        <a 
                                            href={waLink} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Send size={14} /> WhatsApp Klien
                                        </a>
                                    )}
                                    {contact && contact.email && (
                                        <a 
                                            href={mailLink}
                                            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Mail size={14} /> Email Klien
                                        </a>
                                    )}
                                    {salesWaLink && (
                                        <a 
                                            href={`${salesWaLink}?text=${salesWaMessage}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="flex-1 bg-violet-500 hover:bg-violet-600 text-white text-[10px] tracking-wide font-bold py-2 rounded-lg flex items-center justify-center flex-col leading-none transition-colors"
                                        >
                                            <span className="flex items-center gap-1"><MessageSquare size={10} /> Ping Sales</span>
                                        </a>
                                    )}
                                    {currentUser?.role === 'superadmin' && salesUser?.whatsapp && (
                                        <button 
                                            onClick={async () => {
                                                const noCust = contact?.phone ? (contact.phoneCode || '+62') + contact.phone : '-';
                                                const sortedFollowUps = currentTrx.followUps && currentTrx.followUps.length > 0 
                                                    ? [...currentTrx.followUps].sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
                                                    : [];
                                                const latestFU = sortedFollowUps[0] || {};
                                                
                                                const itemListStr = currentTrx.items && currentTrx.items.length > 0 ? currentTrx.items.map((item: any) => `- ${item.nama} (Qty: ${item.qty})`).join('\n') : 'Tidak ada item';
                                                const totalVal = currentTrx.items?.reduce((acc: number, curr: any) => acc + ((curr.harga * curr.qty) - (curr.diskon || 0)), 0) || 0;
                                                const roadmapStr = sortedFollowUps.map((fu: any) => `[${fu.tanggal}] ${fu.method || '-'}: ${fu.keterangan || '-'}`).join('\n') || 'Belum ada roadmap follow up';
                                                const testMsg = `PENAWARAN\n\nPesan: Penawaran sudah ${autoNotifyDays} hari tanpa follow-up baru. Mohon segera diproses.\n\nNo. Penawaran: ${currentTrx.noTrx}\nSales: ${currentTrx.sales || '-'}\nCustomer: ${currentTrx.customerName}\nWA/Telp: ${noCust}\n\nItem Penawaran:\n${itemListStr}\nTotal Penawaran: ${formatRupiah(totalVal)}\n\nMetode Follow-up: ${latestFU.method || currentTrx.followUpMethod || '-'}\nFollow-up Terakhir: ${latestFU.tanggal || '-'}\nKeterangan: ${latestFU.keterangan || '-'}\n\nRoadmap Follow-up:\n${roadmapStr}\n\n*_"setelah melakukan followup lanjutan harap segera melakukan update follow up terbaru di penawaran ini di BRM , link : https://mypancaapps.netlify.app/"_*`;
                                                try {
                                                    const res = await fetch("/api/send-whatsapp", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ phone: salesUser.whatsapp, message: testMsg })
                                                    });
                                                    
                                                    if (autoNotifySuperadmin) {
                                                        const superAdminUsers = appUsers.filter(u => u.username === 'superadmin' && u.whatsapp);
                                                        for (const sa of superAdminUsers) {
                                                            await fetch("/api/send-whatsapp", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ phone: sa.whatsapp, message: testMsg })
                                                            });
                                                        }
                                                    }

                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        if (data.status === false) {
                                                            alert(`Gagal kirim via API: ${data.reason || JSON.stringify(data)}`);
                                                        } else {
                                                            alert("Ping Sales Test berhasil dikirim via API!");
                                                        }
                                                    } else {
                                                        const data = await res.json().catch(()=>({}));
                                                        alert(`Gagal kirim via API: ${data.error || data.reason || res.statusText}`);
                                                    }
                                                } catch(err) {
                                                    alert("Terjadi kesalahan sistem saat kirim test ping.");
                                                }
                                            }}
                                            className="flex-1 bg-slate-800 hover:bg-black text-white text-[10px] tracking-wide font-bold py-2 rounded-lg flex items-center justify-center flex-col leading-none transition-colors"
                                        >
                                            <span className="flex items-center gap-1"><Send size={10} /> Test Ping (API)</span>
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    {/* Roadmap Follow-up (Available for all transactions) */}
                    <div className="mt-6 border-t border-slate-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <button 
                                onClick={() => setShowRoadmap(!showRoadmap)}
                                className="flex items-center gap-2 group"
                            >
                                <h5 className="font-black text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2 group-hover:text-violet-500 transition-colors">
                                    <Activity size={14} className="text-violet-500"/> Roadmap Follow-up
                                    {currentTrx.followUps && currentTrx.followUps.length > 0 && (
                                        <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[8px]">{currentTrx.followUps.length}</span>
                                    )}
                                </h5>
                                <div className={`transition-transform duration-300 ${showRoadmap ? 'rotate-180' : ''}`}>
                                    <ChevronDown size={14} className="text-slate-400" />
                                </div>
                            </button>
                            <button 
                                onClick={() => setShowRoadmap(!showRoadmap)}
                                className="text-[9px] font-black uppercase tracking-widest text-violet-600 hover:text-violet-700 flex items-center gap-1 transition-colors"
                            >
                                <Eye size={12} /> {showRoadmap ? 'Tutup' : 'Lihat Detail'}
                            </button>
                        </div>
                        
                        {showRoadmap && (
                            <div className="mt-4">
                                {currentTrx.followUps && currentTrx.followUps.length > 0 ? (
                                    <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                                        {(currentTrx.followUps || []).map((fu, i) => (
                                            <div key={i} className="relative pl-8 group">
                                                <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-10 transition-colors ${
                                                    i === (currentTrx.followUps?.length || 0) - 1 ? 'bg-violet-500 text-white' : 'bg-slate-200 text-slate-500'
                                                }`}>
                                                    {fu.method === 'WhatsApp' ? <MessageSquare size={10} /> : 
                                                     fu.method === 'Email' ? <Mail size={10} /> : 
                                                     fu.method === 'Telepon' ? <Phone size={10} /> : 
                                                     <Circle size={6} fill="currentColor" />}
                                                </div>
                                                <div className={`p-3 rounded-xl border transition-all ${
                                                    i === (currentTrx.followUps?.length || 0) - 1 ? 'bg-violet-50 border-violet-100 shadow-sm' : 'bg-slate-50 border-slate-100'
                                                }`}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase">{formatDateShort(fu.tanggal)}</span>
                                                            <span className="text-[9px] font-bold text-slate-500">{fu.method || 'General'}</span>
                                                        </div>
                                                        {!['PPN', 'NON PPN', 'Ongkir'].includes(activeView) && (
                                                            <button 
                                                                onClick={() => {
                                                                    setNewFollowUp(fu);
                                                                    setEditingFollowUpIdx(i);
                                                                    setShowDrawer('followUpForm');
                                                                }}
                                                                className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-violet-600 hover:border-violet-200 transition-all shadow-sm"
                                                                title="Update Follow-up"
                                                            >
                                                                <Plus size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-700 leading-relaxed font-medium">{fu.keterangan}</p>
                                                    
                                                    {/* History of this specific follow-up */}
                                                    {fu.history && fu.history.length > 0 && (
                                                        <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-2">
                                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                                <HistoryIcon size={10} className="text-slate-400" /> History Perubahan
                                                            </div>
                                                            {fu.history.map((hist, hIdx) => (
                                                                <div key={hIdx} className="text-[10px] text-slate-500 bg-slate-100/50 p-2 rounded-lg border border-slate-200/30">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <span className="font-bold">{formatDateShort(hist.tanggal)} ({hist.method})</span>
                                                                        <span className="text-[8px] opacity-60">{hist.editedAt}</span>
                                                                    </div>
                                                                    <p className="italic">"{hist.keterangan}"</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )).reverse()}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Belum ada history follow-up</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Activity Log (Visible for all) */}
                    <div className="mt-6 border-t border-slate-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <button 
                                onClick={() => setShowActivityLog(!showActivityLog)}
                                className="flex items-center gap-2 group"
                            >
                                <h5 className="font-black text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2 group-hover:text-violet-500 transition-colors">
                                    <RefreshCw size={14} className="text-violet-500"/> Activity Log
                                    {currentTrx.editHistory && currentTrx.editHistory.length > 0 && (
                                        <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[8px]">{currentTrx.editHistory.length}</span>
                                    )}
                                </h5>
                                <div className={`transition-transform duration-300 ${showActivityLog ? 'rotate-180' : ''}`}>
                                    <ChevronDown size={14} className="text-slate-400" />
                                </div>
                            </button>
                            <button 
                                onClick={() => setShowActivityLog(!showActivityLog)}
                                className="text-[9px] font-black uppercase tracking-widest text-violet-600 hover:text-violet-700 flex items-center gap-1 transition-colors"
                            >
                                <Eye size={12} /> {showActivityLog ? 'Tutup' : 'Lihat Detail'}
                            </button>
                        </div>

                        {showActivityLog && (
                            <div className="mt-4 space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                                {currentTrx.editHistory && currentTrx.editHistory.length > 0 ? (
                                    currentTrx.editHistory.slice().reverse().map((log, idx) => (
                                        <div key={idx} className="relative pl-8 group">
                                            <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-10 bg-slate-100 text-slate-500">
                                                <Activity size={10} />
                                            </div>
                                            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-violet-100 transition-all">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-[8px] font-black text-violet-600">
                                                            {log.user.substring(0,1)}
                                                        </div>
                                                        <div className="text-[10px] font-black text-slate-700">{log.user}</div>
                                                    </div>
                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{log.timestamp}</div>
                                                </div>
                                                <div className="text-[11px] text-slate-600 leading-relaxed font-medium">
                                                    {log.changes.split(', ').map((change, cIdx) => (
                                                        <div key={cIdx} className="flex items-start gap-2 mb-1 last:mb-0">
                                                            <div className="mt-1.5 w-1 h-1 rounded-full bg-slate-300 shrink-0"></div>
                                                            <span>{change}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Belum ada history aktivitas</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Payment Summary - Only for non-quotations */}
                    {!(currentTrx.status === 'Penawaran' || currentTrx.statuses?.includes('Penawaran')) && (
                        <div className="mt-6 border-t border-slate-100 pt-6">
                            <div className="p-4 rounded-lg border space-y-3 bg-white border-slate-200">
                                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                                    Ringkasan Pembayaran
                                </h5>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Total Tagihan</span>
                                    <span className="font-bold text-slate-800">
                                        {formatRupiah(currentTrx.nilaiProyek || 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Pembayaran Diterima</span>
                                    <span className="font-bold text-green-600">{formatRupiah(currentTrx.pembayaranDiterima || 0)}</span>
                                </div>
                                
                                {/* Payment History Sub-section */}
                                {currentTrx.paymentHistory && currentTrx.paymentHistory.length > 0 && (
                                    <div className="pl-4 border-l-2 border-slate-100 space-y-2 my-2">
                                        {currentTrx.paymentHistory.map((pay, pIdx) => (
                                            <div key={pIdx} className="flex justify-between text-[10px]">
                                                <span className="text-slate-400 italic">{formatDateShort(pay.tanggal)} - {pay.keterangan || 'Pembayaran'}</span>
                                                <span className="font-bold text-slate-600">{formatRupiah(pay.jumlah)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex justify-between text-sm pt-2 border-t border-dashed border-slate-200">
                                    <span className="text-slate-500">Sisa Pembayaran</span>
                                    <span className="font-bold text-red-600">
                                        {formatRupiah(currentTrx.pembayaranDiterima === 0 ? (currentTrx.nilaiProyek || 0) : (currentTrx.sisaPembayaran !== undefined ? currentTrx.sisaPembayaran : (currentTrx.nilaiProyek || 0) - (currentTrx.pembayaranDiterima || 0)))}
                                    </span>
                                </div>
                                {currentTrx.paymentStatus === 'Belum Lunas' && currentTrx.jatuhTempo && (
                                    <div className="flex justify-between text-sm pt-2">
                                        <span className="text-slate-500">Jatuh Tempo</span>
                                        <span className="font-bold text-orange-600">{formatDateShort(currentTrx.jatuhTempo)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Items */}
                    <div className="mt-6 border-t border-slate-100 pt-6">
                        <h5 className="font-bold text-sm text-slate-800 mb-3">
                            {currentTrx.status === 'Penawaran' ? 'Produk yang Ditawarkan' : 'Items'}
                        </h5>
                        <div className="space-y-2">
                            {currentTrx.items?.map((item, i) => (
                                <div key={i} className="flex gap-3 items-center p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                                    {(() => {
                                        const p = products.find(x => x.nama === item.nama);
                                        return p?.images?.[0] ? (
                                            <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-100 shrink-0">
                                                <img src={p.images[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                            </div>
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-slate-300">
                                                <Package size={16} />
                                            </div>
                                        );
                                    })()}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-slate-800 truncate">{item.nama}</div>
                                        <div className="text-xs text-slate-500">{item.qty} x {formatRupiah(item.harga)}</div>
                                    </div>
                                    <div className="text-sm font-bold text-slate-700 shrink-0">
                                        {formatRupiah((item.harga * item.qty) - (item.diskon || 0))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">{currentTrx.status === 'Penawaran' ? 'Subtotal Penawaran' : 'Subtotal'}</span>
                            <span className="font-medium">{formatRupiah(currentTrx.items?.reduce((acc, i) => acc + ((i.harga * i.qty) - (i.diskon || 0)), 0) || 0)}</span>
                        </div>
                        {currentTrx.ppn && (
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">PPN 11%</span>
                                <span className="font-medium">{formatRupiah((currentTrx.items?.reduce((acc, i) => acc + ((i.harga * i.qty) - (i.diskon || 0)), 0) || 0) * 0.11)}</span>
                            </div>
                        )}
                        {currentTrx.ongkir && (
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Shipping</span>
                                <span className="font-medium">{formatRupiah(currentTrx.biayaOngkir || 0)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-lg font-bold border-t border-slate-200 pt-2">
                            <span>{currentTrx.status === 'Penawaran' ? 'Total Penawaran' : 'Total'}</span>
                            <span className={currentTrx.status === 'Penawaran' ? 'text-purple-700' : 'text-[#A91D3A]'}>{formatRupiah(currentTrx.nilaiProyek || 0)}</span>
                        </div>
                    </div>

                    {/* Action Section */}
                    {!['PPN', 'NON PPN', 'Ongkir'].includes(activeView) && (
                        <>
                            {['Transaksi', 'Dashboard', 'Dashboard Produk'].includes(activeView) ? (
                                <div className="mt-6 border-t border-slate-100 pt-6">
                                    <h5 className="font-black text-[10px] uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                                        <Activity size={14} className="text-violet-500"/> Action
                                    </h5>
                                    <button
                                        onClick={() => {
                                            const s = currentTrx.status || currentTrx.statuses[0];
                                            let targetView = 'Transaksi';
                                            if (s === 'Penawaran') targetView = 'Penawaran';
                                            else if (s === 'Invoice') targetView = 'Invoice';
                                            else if (s === 'Payment') targetView = currentTrx.paymentStatus === 'Belum Lunas' ? 'Belum Lunas' : 'Pembayaran';
                                            else if (s === 'Pengiriman') targetView = 'Pengiriman';
                                            else if (s === 'Selesai') targetView = 'Pesanan Selesai';
                                            else if (s === 'Batal') targetView = 'Pesanan Batal';
                                            
                                            setActiveView(targetView);
                                            setSearchTerm(currentTrx.noTrx);
                                            setShowDrawer(null);
                                        }}
                                        className="w-full bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-violet-100 flex items-center justify-center gap-2"
                                    >
                                        <Eye size={16} /> Lihat Transaksi
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="mt-6 border-t border-slate-100 pt-6">
                                        <h5 className="font-black text-[10px] uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                                            <Activity size={14} className="text-violet-500"/> Action
                                        </h5>
                                        <div className="grid grid-cols-2 gap-2">
                                            {currentTrx.status === 'Penawaran' && canEditCurrentView && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            setShowDrawer(null);
                                                            handlePrintPenawaran(currentTrx as Transaction);
                                                        }}
                                                        className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                                                    >
                                                        <Printer size={16} /> Print Penawaran
                                                    </button>
                                                    <button
                                                        onClick={() => handleConvertQuotation(currentTrx)}
                                                        className="col-span-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                                                    >
                                                        <ArrowRightCircle size={16} /> Buat Invoice
                                                    </button>
                                                </>
                                            )}
                                            
                                            {activeView === 'Pengiriman' && (
                                                <>
                                                    {canEditCurrentView && (
                                                        <button
                                                            onClick={() => {
                                                                if (currentTrx.paymentStatus !== 'Lunas') {
                                                                    setConfirmModal({
                                                                        isOpen: true,
                                                                        type: 'info',
                                                                        title: 'Pesanan Belum Lunas',
                                                                        message: 'pesanan belum lunas harap lunasi transaksi terlebih dahulu di menu belum lunas',
                                                                        confirmText: 'Lihat',
                                                                        onConfirm: () => {
                                                                            setActiveView('Belum Lunas');
                                                                            setSearchTerm(currentTrx.noTrx);
                                                                            setConfirmModal(null);
                                                                            setShowDrawer(null);
                                                                        }
                                                                    });
                                                                    return;
                                                                }
                                                                confirmAction('Konfirmasi Selesai', 'Apakah Anda yakin ingin menandai transaksi ini sebagai selesai?', () => {
                                                                    updateTransactionStatus(currentTrx.id, 'Selesai', { paymentStatus: currentTrx.paymentStatus });
                                                                    setShowDrawer(null);
                                                                });
                                                            }}
                                                            className="col-span-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                                                        >
                                                            <CheckCircle size={16} /> Selesai
                                                        </button>
                                                    )}
                                                    {canEditCurrentView && (
                                                        <button
                                                            onClick={() => { setCurrentTrx(currentTrx); setShowDrawer('inputResi'); }}
                                                            className="col-span-2 bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
                                                        >
                                                            <Truck size={16} /> Input Resi
                                                        </button>
                                                    )}
                                                </>
                                            )}

                                            {activeView === 'Invoice' && (
                                                <>
                                                    {canEditCurrentView && (
                                                        <button
                                                            onClick={() => {
                                                                updateTransactionStatus(currentTrx.id, 'Payment');
                                                                setActiveView('Pembayaran');
                                                                setShowDrawer(null);
                                                            }}
                                                            className="col-span-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                                                        >
                                                            <ArrowRight size={16} /> Proses Pembayaran
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            handlePrintInvoice(currentTrx as Transaction);
                                                        }}
                                                        className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                                                    >
                                                        <Printer size={16} /> Print Invoice
                                                    </button>
                                                </>
                                            )}

                                            {activeView === 'Pembayaran' && canEditCurrentView && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            confirmAction('Proses Pengiriman', 'Apakah Anda yakin ingin memproses pengiriman untuk pesanan ini?', () => {
                                                                updateTransactionStatus(currentTrx.id!, 'Pengiriman');
                                                                setActiveView('Pengiriman');
                                                                setShowDrawer(null);
                                                            }, 'info');
                                                        }}
                                                        className="col-span-2 md:col-span-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                                                    >
                                                        <Truck size={16} /> Proses Pengiriman
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            handlePaymentComplete(currentTrx as Transaction);
                                                        }}
                                                        className="col-span-2 md:col-span-1 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-violet-100 flex items-center justify-center gap-2"
                                                    >
                                                        <Wallet size={16} /> Terima Pembayaran
                                                    </button>
                                                </>
                                            )}
                                            
                                            {activeView === 'Belum Lunas' && (
                                                <>
                                                    {canEditCurrentView && (
                                                        <button
                                                            onClick={() => {
                                                                handlePaymentComplete(currentTrx as Transaction);
                                                            }}
                                                            className="col-span-2 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-violet-100 flex items-center justify-center gap-2"
                                                        >
                                                            <Wallet size={16} /> Terima Pembayaran
                                                        </button>
                                                    )}
                                                    {canEditCurrentView && (
                                                        <button
                                                            onClick={() => {
                                                                confirmAction('Konfirmasi Lunas', 'Apakah Anda yakin ingin menandai transaksi ini sebagai lunas?', () => {
                                                                    let updatedTrx: any = null;
                                                                    setTransactions(prev => prev.map(t => {
                                                                        if (t.id === currentTrx.id) {
                                                                            const newTrx = {
                                                                                ...t,
                                                                                status: (t.status === 'Pengiriman' ? 'Selesai' : t.status) as any,
                                                                                paymentStatus: 'Lunas' as any,
                                                                                pembayaranDiterima: t.nilaiProyek,
                                                                                sisaPembayaran: 0
                                                                            };
                                                                            updatedTrx = newTrx;
                                                                            return newTrx;
                                                                        }
                                                                        if (false && t.id === currentTrx.id) {
                                                                            return { 
                                                                                ...t, 
                                                                                status: t.status === 'Pengiriman' ? 'Selesai' : t.status,
                                                                                paymentStatus: 'Lunas', 
                                                                                pembayaranDiterima: t.nilaiProyek, 
                                                                                sisaPembayaran: 0
                                                                            };
                                                                        }
                                                                        return t;
                                                                    }));
                                                                    if (updatedTrx) {
                                                                        syncToSupabase('transactions', updatedTrx);
                                                                    }
                                                                    setShowDrawer(null);
                                                                });
                                                            }}
                                                            className="col-span-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                                                        >
                                                            <DollarSign size={16} /> Bayar Lunas
                                                        </button>
                                                    )}
                                                </>
                                            )}

                                            {/* Add Follow Up Button (Available for all transactions) */}
                                            {canEditCurrentView && (
                                                <button 
                                                    onClick={() => {
                                                        setNewFollowUp({tanggal: new Date().toISOString().split('T')[0], keterangan: '', method: 'WhatsApp'});
                                                        setEditingFollowUpIdx(null);
                                                        setShowDrawer('followUpForm');
                                                    }}
                                                    className={`col-span-2 ${currentTrx.status === 'Penawaran' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-slate-600 hover:bg-slate-700'} text-white text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-slate-100 border border-transparent`}
                                                >
                                                    <Plus size={16} /> Add Follow Up
                                                </button>
                                            )}

                                            {/* Print Invoice Removed */}

                                            {/* Edit Transaction Button */}
                                            {!['Selesai'].includes(currentTrx.status) && canEditCurrentView && (
                                                <button 
                                                    onClick={() => {
                                                        const trx = { ...currentTrx };
                                                        if (trx.jasaKirim && !SHIPPING_SERVICES.includes(trx.jasaKirim)) {
                                                            trx.customJasaKirim = trx.jasaKirim;
                                                            trx.jasaKirim = 'Lainnya';
                                                        }
                                                        setCurrentTrx(trx); 
                                                        setShowDrawer('trx');
                                                    }}
                                                    className="col-span-2 bg-orange-50 hover:bg-orange-100 text-orange-700 text-[10px] font-black uppercase tracking-widest py-2 rounded-lg flex items-center justify-center gap-2 transition-all border border-orange-100"
                                                >
                                                    <Plus size={14} /> Edit {currentTrx.status === 'Penawaran' ? 'Penawaran' : 'Transaksi'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Main Hapus button at the very bottom */}
                                     {canEditCurrentView && (
                                        <div className="mt-6">
                                            <button 
                                                onClick={() => handleDelete(currentTrx.id)}
                                                className="w-full bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest py-3 rounded-lg flex items-center justify-center gap-2 transition-all border border-red-100"
                                            >
                                                <Trash2 size={14} /> Hapus
                                            </button>
                                        </div>
                                     )}
                                </>
                            )}
                        </>
                    )}
                </div>
              )}

              {/* --- PRODUCT FORM --- */}
              {showDrawer === 'prod' && (
                <>
                  <div className="space-y-4">
                      {/* Image Upload */}
                      <div>
                          <div className="flex justify-between items-center">
                              <label className={labelClass}>Foto Produk (Maks 5, Otomatis Kompres & WebP)</label>
                              <button 
                                  onClick={async () => {
                                      try {
                                          const items = await navigator.clipboard.read();
                                          for (const item of items) {
                                              const imageTypes = item.types.filter(type => type.startsWith('image/'));
                                              if (imageTypes.length > 0) {
                                                  const blob = await item.getType(imageTypes[0]);
                                                  const file = new File([blob], 'pasted-image.png', { type: blob.type });
                                                  const processed = await processImage(file);
                                                  setCurrentProd(prev => {
                                                      const images = [...(prev.images || [])];
                                                      if (images.length < 5) images.push(processed);
                                                      return { ...prev, images };
                                                  });
                                                  break; // only paste one at a time for simplicity
                                              }
                                          }
                                      } catch (err) {
                                          alert("Tidak dapat membaca dari clipboard. Pastikan browser mengijinkan akses clipboard atau gunakan Ctrl+V / Cmd+V.");
                                      }
                                  }}
                                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2 py-1 rounded"
                              >
                                  Paste Image
                              </button>
                          </div>
                          <div className="grid grid-cols-5 gap-2 mt-2">
                              {Array.from({ length: 5 }).map((_, i) => (
                                  <div key={i} className="relative aspect-square bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden group">
                                      {currentProd.images?.[i] ? (
                                          <>
                                              <img src={currentProd.images[i]} alt={`Produk ${i+1}`} className="w-full h-full object-cover" />
                                              <button 
                                                  onClick={() => {
                                                      const newImages = [...(currentProd.images || [])];
                                                      newImages.splice(i, 1);
                                                      setCurrentProd({ ...currentProd, images: newImages });
                                                  }}
                                                  className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                              >
                                                  <X size={12} />
                                              </button>
                                          </>
                                      ) : (
                                          <label className="cursor-pointer w-full h-full flex items-center justify-center">
                                              <Plus size={20} className="text-slate-400" />
                                              <input 
                                                  type="file" 
                                                  accept="image/*" 
                                                  className="hidden" 
                                                  onChange={async (e) => {
                                                      const file = e.target.files?.[0];
                                                      if (file) {
                                                          try {
                                                              const processed = await processImage(file);
                                                              const newImages = [...(currentProd.images || [])];
                                                              newImages.push(processed);
                                                              setCurrentProd({ ...currentProd, images: newImages });
                                                          } catch (err) {
                                                              console.error("Gagal memproses gambar");
                                                          }
                                                      }
                                                  }}
                                              />
                                          </label>
                                      )}
                                  </div>
                              ))}
                          </div>
                      </div>

                      <div><label className={labelClass}>Nama Produk</label><input className={inputClass} value={currentProd.nama || ''} onChange={e => setCurrentProd({...currentProd, nama: e.target.value})} /></div>
                      {currentProd.kode && (
                          <div className="p-3 bg-violet-50 border border-violet-100 rounded-lg">
                              <div className="text-[10px] uppercase font-bold text-violet-400 mb-1">Kode Produk (Auto Generated)</div>
                              <div className="font-mono text-sm font-bold text-violet-700">{currentProd.kode}</div>
                          </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                         <div><label className={labelClass}>Satuan</label><SearchableSelect options={UNIT_LIST.map(u => ({ value: u, label: u }))} value={currentProd.satuan || 'Pcs'} onChange={val => setCurrentProd({...currentProd, satuan: val})} placeholder="Pilih Satuan" /></div>
                         <div><label className={labelClass}>Berat (Kg)</label><input className={inputClass} value={currentProd.berat || ''} onChange={e => setCurrentProd({...currentProd, berat: parseInputNumber(e.target.value)})} placeholder="0" /></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                         <div><label className={labelClass}>Panjang (cm)</label><input className={inputClass} value={currentProd.panjang || ''} onChange={e => setCurrentProd({...currentProd, panjang: parseInputNumber(e.target.value)})} placeholder="0" /></div>
                         <div><label className={labelClass}>Lebar (cm)</label><input className={inputClass} value={currentProd.lebar || ''} onChange={e => setCurrentProd({...currentProd, lebar: parseInputNumber(e.target.value)})} placeholder="0" /></div>
                         <div><label className={labelClass}>Tinggi (cm)</label><input className={inputClass} value={currentProd.tinggi || ''} onChange={e => setCurrentProd({...currentProd, tinggi: parseInputNumber(e.target.value)})} placeholder="0" /></div>
                      </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
                      <div className="font-bold text-sm text-slate-800 border-b pb-2">{currentProd.id ? 'Tambah/Penyesuaian Stok (Opsional)' : 'Stok Awal (Opsional)'}</div>
                      <div><label className={labelClass}>Supplier</label><SearchableSelect options={suppliers.filter(s => s.companyId === activeCompanyId || s.company_id === activeCompanyId).map(s => ({ value: s.id, label: s.nama }))} value={tempStock.supplierId || ''} onChange={v => setTempStock({...tempStock, supplierId: v})} placeholder="Pilih Supplier" className="bg-white" /></div>
                      <div className={`grid ${activeModule === 'Stocklist' ? 'grid-cols-1' : 'grid-cols-3'} gap-3`}>
                         <div><label className={labelClass}>Stok Masuk</label><input className={`${inputClass} bg-white`} value={formatInputNumber(tempStock.stock)} onChange={e => setTempStock({...tempStock, stock: parseInputNumber(e.target.value)})} placeholder="0"/></div>
                         {activeModule !== 'Stocklist' && (
                             <>
                                <div>
                                    <div className="flex justify-between items-center">
                                        <label className={labelClass}>Harga Beli (HPP)</label>
                                        {currentProd.id && (products.find(p => p.id === currentProd.id)?.lots?.length || 0) > 0 && (
                                            <span className="text-[9px] text-violet-500 font-bold">
                                                Prev: Rp {products.find(p => p.id === currentProd.id)?.lots?.slice(-1)[0].hpp.toLocaleString('id-ID')}
                                            </span>
                                        )}
                                    </div>
                                    <input className={`${inputClass} bg-white`} value={formatInputNumber(tempStock.hpp)} onChange={e => setTempStock({...tempStock, hpp: parseInputNumber(e.target.value)})} placeholder="0"/>
                                </div>
                                <div><label className={labelClass}>Harga Jual</label><input className={`${inputClass} bg-white font-bold text-[#A91D3A]`} value={formatInputNumber(tempStock.hargaJual)} onChange={e => setTempStock({...tempStock, hargaJual: parseInputNumber(e.target.value)})} placeholder="0"/></div>
                             </>
                         )}
                      </div>
                  </div>
                  <div className="space-y-4 pt-4 border-t border-slate-200">
                      <div className="font-bold text-sm text-slate-800">Deskripsi & Detail Produk</div>
                      <div>
                          <label className={labelClass}>Spesifikasi</label>
                          <textarea className={`${inputClass} min-h-[80px]`} value={currentProd.specifications || ''} onChange={e => setCurrentProd({...currentProd, specifications: e.target.value})} placeholder="Masukkan spesifikasi teknis..."></textarea>
                      </div>
                      <div>
                          <label className={labelClass}>Fungsi Utama</label>
                          <textarea className={`${inputClass} min-h-[80px]`} value={currentProd.mainFunction || ''} onChange={e => setCurrentProd({...currentProd, mainFunction: e.target.value})} placeholder="Apa fungsi utama produk ini?"></textarea>
                      </div>
                      <div>
                          <label className={labelClass}>Aplikasi Utama</label>
                          <textarea className={`${inputClass} min-h-[80px]`} value={currentProd.mainApplication || ''} onChange={e => setCurrentProd({...currentProd, mainApplication: e.target.value})} placeholder="Dimana produk ini biasa diaplikasikan?"></textarea>
                      </div>
                      <div>
                          <label className={labelClass}>Keterangan Tambahan</label>
                          <textarea className={`${inputClass} min-h-[80px]`} value={currentProd.remarks || ''} onChange={e => setCurrentProd({...currentProd, remarks: e.target.value})} placeholder="Catatan lainnya..."></textarea>
                      </div>
                      <button onClick={saveProduct} className="w-full bg-[#A91D3A] text-white font-bold py-2 rounded-lg">Simpan</button>
                  </div>
                </>
              )}
              
               {showDrawer === 'supp' && (
                <div className="space-y-4">
                    <div><label className={labelClass}>Nama Supplier</label><input className={inputClass} value={currentSupp.nama || ''} onChange={e => setCurrentSupp({...currentSupp, nama: e.target.value})} /></div>
                    <div className="grid grid-cols-[100px_1fr] gap-2">
                        <div>
                            <label className={labelClass}>Kode Negara</label>
                            <input className={inputClass} value={currentSupp.phoneCode || '+62'} onChange={e => setCurrentSupp({...currentSupp, phoneCode: e.target.value})} placeholder="+62" />
                        </div>
                        <div>
                            <label className={labelClass}>Nomor Telepon/HP</label>
                            <input type="tel" className={inputClass} value={currentSupp.phone || ''} onChange={e => setCurrentSupp({...currentSupp, phone: e.target.value})} placeholder="Contoh: 81234567890" />
                        </div>
                    </div>
                    <div><label className={labelClass}>Email</label><input type="email" className={inputClass} value={currentSupp.email || ''} onChange={e => setCurrentSupp({...currentSupp, email: e.target.value})} /></div>
                    <div><label className={labelClass}>Link Website</label><input type="url" className={inputClass} value={currentSupp.website || ''} onChange={e => setCurrentSupp({...currentSupp, website: e.target.value})} placeholder="https://..." /></div>
                    <div><label className={labelClass}>Keterangan (Jenis / Deskripsi)</label><textarea className={inputClass} value={currentSupp.keterangan || ''} onChange={e => setCurrentSupp({...currentSupp, keterangan: e.target.value})} rows={3} placeholder="Sediakan sparepart..." /></div>
                    <div><label className={labelClass}>NPWP / ID Pajak</label><input className={inputClass} value={currentSupp.npwp || ''} onChange={e => setCurrentSupp({...currentSupp, npwp: e.target.value})} /></div>
                    <button onClick={() => {
                        if (currentSupp.id) setSuppliers(prev => prev.map(s => s.id === currentSupp.id ? { ...s, ...currentSupp } as Supplier : s));
                        else setSuppliers(prev => [...prev, { ...currentSupp, id: Math.random().toString(36).substr(2, 9) } as Supplier]);
                        setShowDrawer(null);
                    }}
                    className="hidden"
                  >
                    Simpan
                  </button>
                </div>
              )}

              {showDrawer === 'suppDetail' && (
                  <div className="space-y-6">
                      <div className="flex items-center justify-between gap-2 p-3 bg-card border border-border rounded-xl shadow-xs">
                          <div className="flex items-center gap-2">
                              {currentSupp.phone && (
                                  <a 
                                      href={`https://wa.me/${(currentSupp.phoneCode || '+62').replace('+', '')}${currentSupp.phone}`} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 transition-colors text-xs font-bold"
                                  >
                                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                      WhatsApp
                                  </a>
                              )}
                              {currentSupp.email && (
                                  <a 
                                      href={`mailto:${currentSupp.email}`}
                                      className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 transition-colors text-xs font-bold"
                                  >
                                      <Mail size={16}/>
                                      Email
                                  </a>
                              )}
                              {currentSupp.website && (
                                  <a 
                                      href={currentSupp.website.startsWith('http') ? currentSupp.website : `https://${currentSupp.website}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 rounded-lg border border-violet-200 dark:border-violet-800/60 hover:bg-violet-100 transition-colors text-xs font-bold"
                                  >
                                      <Globe size={16}/>
                                      Website
                                  </a>
                              )}
                          </div>
                          <div className="flex items-center gap-2">
                              {canEditCurrentView && (
                                  <button 
                                      onClick={() => setShowDrawer('supp')}
                                      className="p-2 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors border border-transparent"
                                      title="Edit Data Supplier"
                                  >
                                      <Edit size={16}/>
                                  </button>
                              )}
                          </div>
                      </div>

                      <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
                          <h4 className="text-sm font-bold text-foreground mb-4">{currentSupp.nama}</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                              <div><div className="text-[10px] uppercase text-muted-foreground font-bold mb-1">Kode Supplier</div><div className="font-semibold font-mono bg-muted/60 text-foreground inline-block px-2 py-0.5 rounded border border-border">{currentSupp.kode || '-'}</div></div>
                              <div><div className="text-[10px] uppercase text-muted-foreground font-bold mb-1">NPWP</div><div className="font-semibold text-foreground">{currentSupp.npwp || '-'}</div></div>
                              <div className="col-span-2"><div className="text-[10px] uppercase text-muted-foreground font-bold mb-1">Keterangan / Jenis</div><div className="font-semibold text-foreground bg-muted/30 p-3 rounded-lg border border-border min-h-[80px] whitespace-pre-wrap">{currentSupp.keterangan || '-'}</div></div>
                          </div>
                      </div>
                  </div>
              )}
              
              {showDrawer === 'emp' && (
                <div className="space-y-4">
                    <div><label className={labelClass}>Nama</label><input className={inputClass} value={currentEmp.nama || ''} onChange={e => setCurrentEmp({...currentEmp, nama: e.target.value})} /></div>
                    <div><label className={labelClass}>NIK</label><input className={inputClass} value={currentEmp.nik || ''} onChange={e => setCurrentEmp({...currentEmp, nik: e.target.value})} /></div>
                    <div><label className={labelClass}>Username</label><input className={inputClass} value={currentEmp.username || ''} onChange={e => setCurrentEmp({...currentEmp, username: e.target.value})} /></div>
                    <div><label className={labelClass}>Role</label>
                        <select className={inputClass} value={currentEmp.role || ''} onChange={e => setCurrentEmp({...currentEmp, role: e.target.value})}>
                            <option value="">Pilih Role</option>
                            <option value="superadmin">Superadmin</option>
                            <option value="admin">Admin</option>
                            <option value="sales">Sales</option>
                            <option value="purchasing">Purchasing</option>
                            <option value="stocklist">Stocklist</option>
                            <option value="finance">Finance</option>
                            <option value="hr">HR</option>
                            <option value="engineer">Engineer</option>
                            <option value="pajak">Pajak</option>
                            <option value="view_only">View Only</option>
                        </select>
                    </div>
                    <div><label className={labelClass}>Biodata</label><textarea className={`${inputClass} min-h-[80px]`} value={currentEmp.biodata || ''} onChange={e => setCurrentEmp({...currentEmp, biodata: e.target.value})} /></div>
                    <div><label className={labelClass}>Pendidikan</label><input className={inputClass} value={currentEmp.pendidikan || ''} onChange={e => setCurrentEmp({...currentEmp, pendidikan: e.target.value})} /></div>
                    <div><label className={labelClass}>Alamat</label><textarea className={`${inputClass} min-h-[80px]`} value={currentEmp.alamat || ''} onChange={e => setCurrentEmp({...currentEmp, alamat: e.target.value})} /></div>
                    <div><label className={labelClass}>Kontak Darurat</label><input className={inputClass} value={currentEmp.kontakDarurat || ''} onChange={e => setCurrentEmp({...currentEmp, kontakDarurat: e.target.value})} /></div>
                    <div><label className={labelClass}>WhatsApp</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs text-slate-400">+62</span>
                            <input className={`${inputClass} pl-10`} placeholder="8123xxx" value={currentEmp.whatsapp?.startsWith('62') ? currentEmp.whatsapp.slice(2) : currentEmp.whatsapp || ''} onChange={e => setCurrentEmp({...currentEmp, whatsapp: '62' + e.target.value.replace(/^(\+62|62|0)/, '')})} />
                        </div>
                    </div>
                    <div><label className={labelClass}>Email</label><input className={inputClass} value={currentEmp.email || ''} onChange={e => setCurrentEmp({...currentEmp, email: e.target.value})} /></div>
                    <div><label className={labelClass}>Kontrak Awal</label><input type="date" className={inputClass} value={currentEmp.kontrakAwal || ''} onChange={e => setCurrentEmp({...currentEmp, kontrakAwal: e.target.value})} /></div>
                    <div><label className={labelClass}>Gaji</label><input type="number" className={inputClass} value={currentEmp.gaji || ''} onChange={e => setCurrentEmp({...currentEmp, gaji: parseInt(e.target.value)})} /></div>
                    <div><label className={labelClass}>Payroll</label><input className={inputClass} value={currentEmp.payroll || ''} onChange={e => setCurrentEmp({...currentEmp, payroll: e.target.value})} /></div>
                    <div><label className={labelClass}>PPh (%)</label><input type="number" className={inputClass} value={currentEmp.pph || ''} onChange={e => setCurrentEmp({...currentEmp, pph: parseInt(e.target.value)})} /></div>
                    <button onClick={saveEmployee} className="hidden">Simpan</button>
                </div>
              )}

              {showDrawer === 'appUser' && (
                <div className="space-y-4">
                    <div><label className={labelClass}>Nama</label><input className={inputClass} value={currentAppUser.nama || ''} onChange={e => setCurrentAppUser({...currentAppUser, nama: e.target.value})} /></div>
                    <div><label className={labelClass}>Username</label><input className={inputClass} value={currentAppUser.username || ''} onChange={e => setCurrentAppUser({...currentAppUser, username: e.target.value})} /></div>
                    <div><label className={labelClass}>Password</label><input type="text" className={inputClass} placeholder="Ketik password" value={currentAppUser.password || ''} onChange={e => setCurrentAppUser({...currentAppUser, password: e.target.value})} /></div>
                    <div><label className={labelClass}>WhatsApp</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs text-slate-400">+62</span>
                            <input className={`${inputClass} pl-10`} placeholder="8123xxx" value={currentAppUser.whatsapp?.startsWith('62') ? currentAppUser.whatsapp.slice(2) : currentAppUser.whatsapp || ''} onChange={e => setCurrentAppUser({...currentAppUser, whatsapp: '62' + e.target.value.replace(/^(\+62|62|0)/, '')})} />
                        </div>
                    </div>
                    <div><label className={labelClass}>Role</label>
                        <select className={inputClass} value={currentAppUser.role || ''} onChange={e => setCurrentAppUser({...currentAppUser, role: e.target.value})}>
                            <option value="">Pilih Role</option>
                            <option value="superadmin">Superadmin</option>
                            <option value="admin">Admin</option>
                            <option value="sales">Sales</option>
                            <option value="purchasing">Purchasing</option>
                            <option value="stocklist">Stocklist</option>
                            <option value="finance">Finance</option>
                            <option value="hr">HR</option>
                            <option value="engineer">Engineer</option>
                            <option value="pajak">Pajak</option>
                            <option value="view_only">View Only</option>
                        </select>
                    </div>
                    <button onClick={saveAppUser} className="hidden">Simpan</button>
                </div>
              )}

              {showDrawer === 'appUserAccess' && (
                  <div className="space-y-6 pb-20">
                      <div className="bg-card rounded-xl p-5 border border-border shadow-xs">
                          <div className="flex items-center gap-3 mb-4">
                              <ShieldCheck className="text-violet-600 dark:text-violet-400" size={24} />
                              <div>
                                  <h4 className="text-xl font-bold text-foreground leading-tight">Kelola Hak Akses</h4>
                                  <p className="text-xs text-muted-foreground font-medium">{currentAppUser.nama} (@{currentAppUser.username})</p>
                              </div>
                          </div>

                          <div className="mb-6 p-4 bg-violet-50 dark:bg-violet-950/40 rounded-xl border border-violet-200 dark:border-violet-800/60 flex justify-between items-center">
                              <div>
                                  <label className="block text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-1">Akses Bawaan Role</label>
                                  <p className="text-xs text-violet-900 dark:text-violet-200">Akses user akan mengikuti template role <strong>{currentAppUser.role}</strong> secara otomatis. <br/>Perubahan di bawah akan menjadi pengaturan khusus bagi user ini.</p>
                              </div>
                              <button 
                                  onClick={() => {
                                      confirmAction('Reset Akses', `Apakah Anda yakin ingin menghapus akses kustom dan mengembalikan hak akses ke standar role "${currentAppUser.role}"?`, () => {
                                          setCurrentAppUser({ ...currentAppUser, permissions: undefined });
                                      });
                                  }}
                                  className="px-3 py-2 bg-card border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-bold whitespace-nowrap hover:bg-violet-600 hover:text-white transition-all shadow-xs flex items-center gap-2"
                              >
                                  <RefreshCw size={14}/> Reset ke Standar
                              </button>
                          </div>

                          <div className="flex justify-between items-center mb-4 px-2">
                             <h5 className="text-sm font-bold text-foreground">Akses Kustom (Manual)</h5>
                             <div className="flex gap-2">
                                 <button 
                                    onClick={() => {
                                        const allMenuIds: string[] = [];
                                        MENU_STRUCTURE.forEach(cat => cat.items.forEach(item => { 
                                            const effectiveId = (item as any).permId || item.id;
                                            if(!allMenuIds.includes(effectiveId)) allMenuIds.push(effectiveId); 
                                        }));
                                        const newPerms = allMenuIds.map(id => ({ id, canView: true, canEdit: true }));
                                        setCurrentAppUser({ ...currentAppUser, permissions: newPerms });
                                    }}
                                    className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
                                 >
                                    All Full
                                 </button>
                                 <button 
                                    onClick={() => {
                                        const allMenuIds: string[] = [];
                                        MENU_STRUCTURE.forEach(cat => cat.items.forEach(item => { 
                                            const effectiveId = (item as any).permId || item.id;
                                            if(!allMenuIds.includes(effectiveId)) allMenuIds.push(effectiveId); 
                                        }));
                                        const newPerms = allMenuIds.map(id => ({ id, canView: false, canEdit: false }));
                                        setCurrentAppUser({ ...currentAppUser, permissions: newPerms });
                                    }}
                                    className="text-[10px] font-bold text-muted-foreground hover:underline"
                                 >
                                    All Hide
                                 </button>
                             </div>
                          </div>
                          
                          <div className="space-y-4">
                             {MENU_STRUCTURE.map((cat) => (
                                 <div key={cat.category} className="border border-border rounded-xl overflow-hidden bg-card shadow-xs">
                                     <div className="bg-muted/60 px-3 py-2 border-b border-border flex justify-between items-center">
                                         <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{cat.category}</span>
                                         <div className="flex gap-4">
                                             <span className="text-[10px] font-bold text-muted-foreground uppercase w-10 text-center">View</span>
                                             <span className="text-[10px] font-bold text-muted-foreground uppercase w-10 text-center">Edit</span>
                                         </div>
                                     </div>
                                     <div className="divide-y divide-slate-100">
                                         {cat.items.map((item) => {
                                             const effectiveId = (item as any).permId || item.id;
                                             // Fallback to legacy 'Produk'/'Suppliers'/'Purchase Orders' if specific perm is missing
                                             const customPerm = currentAppUser.permissions?.find(p => p.id === effectiveId) || currentAppUser.permissions?.find(p => p.id === item.id);
                                             const roleTpl = roleTemplates[currentAppUser.role || 'user'];
                                             const rolePerm = roleTpl?.find(p => p.id === effectiveId) || roleTpl?.find(p => p.id === item.id) || { canView: false, canEdit: false };
                                             
                                             const effectiveView = customPerm ? customPerm.canView : rolePerm.canView;
                                             const effectiveEdit = customPerm ? customPerm.canEdit : rolePerm.canEdit;
                                             
                                             return (
                                                 <div key={effectiveId} className="px-3 py-2.5 flex justify-between items-center hover:bg-slate-50 transition-colors">
                                                     <div className="flex items-center gap-2">
                                                         {item.icon && <item.icon size={14} className={customPerm ? "text-violet-500" : "text-slate-400"} />}
                                                         <span className={`text-xs font-semibold ${customPerm ? 'text-violet-700' : 'text-slate-700'}`}>
                                                             {item.label} {customPerm && <span className="text-[8px] uppercase tracking-tighter bg-violet-100 text-violet-600 px-1 py-0.5 rounded ml-1">Kustom</span>}
                                                         </span>
                                                     </div>
                                                     <div className="flex gap-4">
                                                         <div className="w-10 flex justify-center">
                                                             <input 
                                                                 type="checkbox" 
                                                                 checked={effectiveView} 
                                                                 onChange={() => {
                                                                     const perms = currentAppUser.permissions ? [...currentAppUser.permissions] : [];
                                                                     // Prioritize effectively modifying the correct specific permId
                                                                     const idx = perms.findIndex(p => p.id === effectiveId);
                                                                     if (idx > -1) perms[idx] = { ...perms[idx], canView: !effectiveView };
                                                                     else perms.push({ id: effectiveId, canView: !effectiveView, canEdit: effectiveEdit });
                                                                     setCurrentAppUser({ ...currentAppUser, permissions: perms });
                                                                 }}
                                                                 className="rounded text-violet-600 focus:ring-violet-600 h-4 w-4 cursor-pointer"
                                                             />
                                                         </div>
                                                         <div className="w-10 flex justify-center">
                                                             <input 
                                                                 type="checkbox" 
                                                                 checked={effectiveEdit} 
                                                                 onChange={() => {
                                                                     const perms = currentAppUser.permissions ? [...currentAppUser.permissions] : [];
                                                                     const idx = perms.findIndex(p => p.id === effectiveId);
                                                                     if (idx > -1) perms[idx] = { ...perms[idx], canEdit: !effectiveEdit };
                                                                     else perms.push({ id: effectiveId, canView: effectiveView, canEdit: !effectiveEdit });
                                                                     setCurrentAppUser({ ...currentAppUser, permissions: perms });
                                                                 }}
                                                                 className="rounded text-violet-600 focus:ring-violet-600 h-4 w-4 cursor-pointer"
                                                             />
                                                         </div>
                                                     </div>
                                                 </div>
                                             );
                                         })}
                                     </div>
                                 </div>
                             ))}
                          </div>
                      </div>
                      <button 
                        onClick={saveAppUser}
                        className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Save size={18} /> Simpan Hak Akses
                      </button>
                  </div>
              )}
              
              {showDrawer === 'setupRole' && (
                  <div className="space-y-6 pb-20">
                      <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                          <div className="flex items-center gap-3 mb-4">
                              <ShieldCheck className="text-violet-600" size={24} />
                              <div>
                                  <h4 className="text-xl font-bold text-slate-900 leading-tight">Setup Akses Universal per Role</h4>
                                  <p className="text-xs text-slate-500 font-medium">Pengaturan default untuk masing-masing tipe user</p>
                              </div>
                          </div>

                          <div className="mb-6">
                              <label className="block text-xs font-bold text-slate-700 mb-2">Pilih Role Template</label>
                              <select 
                                  value={setupRoleTarget}
                                  onChange={(e) => setSetupRoleTarget(e.target.value)}
                                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold shadow-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                              >
                                  {Object.keys(roleTemplates).map(role => (
                                      <option key={role} value={role}>
                                          {role.replace('_', ' ').toUpperCase()}
                                      </option>
                                  ))}
                              </select>
                          </div>

                          <div className="flex justify-between items-center mb-4 px-2">
                             <h5 className="text-sm font-bold text-slate-700">Akses Bawaan Role: {setupRoleTarget.replace('_', ' ').toUpperCase()}</h5>
                             <div className="flex gap-2">
                                 <button 
                                    onClick={() => {
                                        const allMenuIds: string[] = [];
                                        MENU_STRUCTURE.forEach(cat => cat.items.forEach(item => { 
                                            const effectiveId = (item as any).permId || item.id;
                                            if(!allMenuIds.includes(effectiveId)) allMenuIds.push(effectiveId); 
                                        }));
                                        const newPerms = allMenuIds.map(id => ({ id, canView: true, canEdit: true }));
                                        setRoleTemplates({ ...roleTemplates, [setupRoleTarget]: newPerms });
                                    }}
                                    className="text-[10px] font-bold text-violet-600 hover:underline"
                                 >
                                    All Full
                                 </button>
                                 <button 
                                    onClick={() => {
                                        const allMenuIds: string[] = [];
                                        MENU_STRUCTURE.forEach(cat => cat.items.forEach(item => { 
                                            const effectiveId = (item as any).permId || item.id;
                                            if(!allMenuIds.includes(effectiveId)) allMenuIds.push(effectiveId); 
                                        }));
                                        const newPerms = allMenuIds.map(id => ({ id, canView: false, canEdit: false }));
                                        setRoleTemplates({ ...roleTemplates, [setupRoleTarget]: newPerms });
                                    }}
                                    className="text-[10px] font-bold text-slate-500 hover:underline"
                                 >
                                    All Hide
                                 </button>
                             </div>
                          </div>
                          
                          <div className="space-y-4">
                             {MENU_STRUCTURE.map((cat) => (
                                 <div key={cat.category} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                     <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between items-center">
                                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{cat.category}</span>
                                         <div className="flex gap-4">
                                             <span className="text-[10px] font-bold text-slate-400 uppercase w-10 text-center">View</span>
                                             <span className="text-[10px] font-bold text-slate-400 uppercase w-10 text-center">Edit</span>
                                         </div>
                                     </div>
                                     <div className="divide-y divide-slate-100">
                                         {cat.items.map((item) => {
                                             const effectiveId = (item as any).permId || item.id;
                                             const targetTpl = roleTemplates[setupRoleTarget] || [];
                                             const perm = targetTpl.find(p => p.id === effectiveId) || targetTpl.find(p => p.id === item.id) || { canView: false, canEdit: false };
                                             return (
                                                 <div key={effectiveId} className="px-3 py-2.5 flex justify-between items-center hover:bg-slate-50 transition-colors">
                                                     <div className="flex items-center gap-2">
                                                         {item.icon && <item.icon size={14} className="text-slate-400" />}
                                                         <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                                                     </div>
                                                     <div className="flex gap-4">
                                                         <div className="w-10 flex justify-center">
                                                             <input 
                                                                 type="checkbox" 
                                                                 checked={perm.canView} 
                                                                 onChange={() => {
                                                                     const perms = [...targetTpl];
                                                                     const idx = perms.findIndex(p => p.id === effectiveId);
                                                                     if (idx > -1) perms[idx] = { ...perms[idx], canView: !perm.canView };
                                                                     else perms.push({ id: effectiveId, canView: !perm.canView, canEdit: perm.canEdit });
                                                                     setRoleTemplates({ ...roleTemplates, [setupRoleTarget]: perms });
                                                                 }}
                                                                 className="rounded text-violet-600 focus:ring-violet-600 h-4 w-4 cursor-pointer"
                                                             />
                                                         </div>
                                                         <div className="w-10 flex justify-center">
                                                             <input 
                                                                 type="checkbox" 
                                                                 checked={perm.canEdit} 
                                                                 onChange={() => {
                                                                     const perms = [...targetTpl];
                                                                     const idx = perms.findIndex(p => p.id === effectiveId);
                                                                     if (idx > -1) perms[idx] = { ...perms[idx], canEdit: !perm.canEdit };
                                                                     else perms.push({ id: effectiveId, canView: perm.canView, canEdit: !perm.canEdit });
                                                                     setRoleTemplates({ ...roleTemplates, [setupRoleTarget]: perms });
                                                                 }}
                                                                 className="rounded text-violet-600 focus:ring-violet-600 h-4 w-4 cursor-pointer"
                                                             />
                                                         </div>
                                                     </div>
                                                 </div>
                                             );
                                         })}
                                     </div>
                                 </div>
                             ))}
                          </div>
                      </div>
                      <button 
                        onClick={() => {
                            // Note: In real app this would save to backend/API. 
                            setShowSaveSuccess(true);
                            setTimeout(() => setShowSaveSuccess(false), 2000);
                            setShowDrawer(null);
                        }}
                        className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Save size={18} /> Selesai Setup
                      </button>
                  </div>
              )}

              {showDrawer === 'appUserDetail' && (
                  <div className="space-y-6">
                      <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                          <div className="flex justify-between items-center mb-4">
                              <h4 className="text-xl font-bold text-slate-900">{currentAppUser.nama}</h4>
                              {canEditCurrentView && (
                                  <button 
                                      onClick={() => setShowDrawer('appUser')}
                                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-violet-600 bg-violet-50 px-2 py-1 rounded hover:bg-violet-100"
                                  >
                                      <Edit size={14} /> Edit User
                                  </button>
                              )}
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Username</div><div className="font-semibold">{currentAppUser.username}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Password</div><div className="font-semibold font-mono tracking-wider">{currentAppUser.password || '-'}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Role</div><div className="font-semibold uppercase text-violet-600 font-black">{currentAppUser.role}</div></div>
                              <div>
                                  <div className="text-[10px] uppercase text-slate-400 font-bold">WhatsApp</div>
                                  <a href={`https://wa.me/${currentAppUser.whatsapp}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-600 font-bold font-mono hover:underline">
                                      <MessageSquare size={14}/> +{currentAppUser.whatsapp}
                                  </a>
                              </div>
                              <div className="col-span-2"><div className="text-[10px] uppercase text-slate-400 font-bold">Dibuat Pada</div><div className="font-semibold">{currentAppUser.createdAt ? new Date(currentAppUser.createdAt).toLocaleDateString('id-ID') : '-'}</div></div>
                          </div>
                      </div>
                  </div>
              )}
              
              {showDrawer === 'empDetail' && (
                  <div className="space-y-6">
                      <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                          <h4 className="text-xl font-bold text-slate-900 mb-4">{currentEmp.nama}</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">NIK</div><div className="font-semibold">{currentEmp.nik}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Username</div><div className="font-semibold">{currentEmp.username || '-'}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Role</div><div className="font-semibold">{currentEmp.role}</div></div>
                              <div className="col-span-2"><div className="text-[10px] uppercase text-slate-400 font-bold">Biodata</div><div className="text-slate-700">{currentEmp.biodata}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Pendidikan</div><div className="font-semibold">{currentEmp.pendidikan}</div></div>
                              <div className="col-span-2"><div className="text-[10px] uppercase text-slate-400 font-bold">Alamat</div><div className="text-slate-700">{currentEmp.alamat}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Kontak Darurat</div><div className="font-semibold">{currentEmp.kontakDarurat}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">WhatsApp</div>
                                <a href={`https://wa.me/${currentEmp.whatsapp?.replace(/^0/, '62').replace(/^\+/, '')}`} target="_blank" rel="noreferrer" className="text-emerald-600 font-semibold hover:underline">
                                  {currentEmp.whatsapp?.startsWith('62') ? '+' + currentEmp.whatsapp : currentEmp.whatsapp?.startsWith('0') ? '+62' + currentEmp.whatsapp.substring(1) : currentEmp.whatsapp}
                                </a>
                              </div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Email</div><a href={`mailto:${currentEmp.email}`} className="text-blue-600 font-semibold hover:underline">{currentEmp.email}</a></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Kontrak Awal</div><div className="font-semibold">{currentEmp.kontrakAwal}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Gaji</div><div className="font-semibold">{formatRupiah(currentEmp.gaji)}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">Payroll</div><div className="font-semibold">{currentEmp.payroll}</div></div>
                              <div><div className="text-[10px] uppercase text-slate-400 font-bold">PPh</div><div className="font-semibold">{currentEmp.pph}%</div></div>
                          </div>
                      </div>
                  </div>
              )}
              
              {showDrawer === 'prodDetail' && (
                  <div className="space-y-6">
                      {currentProd.images && currentProd.images.length > 0 ? (
                         <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                             {currentProd.images.map((img, idx) => (
                                 <img 
                                     key={idx} 
                                     src={img} 
                                     alt={`Produk ${idx+1}`} 
                                     onClick={() => setLightboxImage({ images: currentProd.images!, index: idx })}
                                     className="w-48 h-48 object-cover rounded-lg border border-slate-200 flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity" 
                                     referrerPolicy="no-referrer" 
                                 />
                             ))}
                         </div>
                     ) : (
                         <div className="w-full h-48 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                             <Package size={48} className="opacity-20" />
                             <span className="text-xs font-bold uppercase tracking-widest opacity-50">No Product Images</span>
                         </div>
                     )}

                     <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="text-xl font-bold text-slate-900">{currentProd.nama}</h4>
                                <div className="flex flex-col gap-0.5">
                                    <span className="font-mono text-xs text-slate-500">KODE: {currentProd.kode}</span>
                                    <span className="font-mono text-xs text-violet-600 font-bold">KODE: {currentProd.kode || '-'}</span>
                                </div>
                            </div>
                            <span className="px-2.5 py-1 rounded text-xs font-bold bg-[#A91D3A]/10 text-[#A91D3A]">{currentProd.satuan}</span>
                        </div>
                        <div className={`grid ${activeModule === 'Stocklist' ? 'grid-cols-2' : 'grid-cols-3'} gap-2 pt-2 border-t border-slate-200`}>
                             <div className="text-center p-2"><div className="text-[10px] uppercase text-slate-400 font-bold mb-0.5">Total Stok</div><div className="text-sm font-bold text-slate-900">{getAvailableStock(currentProd.nama)}</div></div>
                             <div className="text-center p-2 border-l"><div className="text-[10px] uppercase text-slate-400 font-bold mb-0.5">Berat</div><div className="text-sm font-semibold">{currentProd.berat} Kg</div></div>
                             {activeModule !== 'Stocklist' && (
                                 <>
                                    <div className="text-center p-2 border-l"><div className="text-[10px] uppercase text-slate-400 font-bold mb-0.5">Harga Jual</div><div className="text-sm font-semibold">{formatRupiah(getProductPrice(currentProd as Product))}</div></div>
                                 </>
                             )}
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-slate-200">
                            <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">QR Code</div>
                            <div className="flex flex-col items-center gap-2">
                                <QRCodeCanvas id={`qr-${currentProd.id}`} value={currentProd.kode || ''} size={128} />
                                <button 
                                    onClick={() => {
                                        const canvas = document.getElementById(`qr-${currentProd.id}`) as HTMLCanvasElement;
                                        const url = canvas.toDataURL("image/png");
                                        const link = document.createElement("a");
                                        link.download = `QR-${currentProd.kode}.png`;
                                        link.href = url;
                                        link.click();
                                    }}
                                    className="text-xs font-bold text-violet-600 hover:text-violet-700"
                                >
                                    Download QR
                                </button>
                            </div>
                        </div>
                        
                        {/* Supplier Info */}
                        <div className="mt-4 pt-4 border-t border-slate-200">
                            <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Supplier Terakhir</div>
                            <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Truck size={14} className="text-slate-400"/>
                                {getSupplierName(currentProd as Product)}
                            </div>
                        </div>
                        
                        {/* Dimensions */}
                        {(currentProd.panjang || currentProd.lebar || currentProd.tinggi) && (
                            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-center gap-6">
                                <div className="text-center"><div className="text-[10px] text-slate-400 font-bold">P</div><div className="text-xs font-medium">{currentProd.panjang || 0} cm</div></div>
                                <div className="text-center"><div className="text-[10px] text-slate-400 font-bold">L</div><div className="text-xs font-medium">{currentProd.lebar || 0} cm</div></div>
                                <div className="text-center"><div className="text-[10px] text-slate-400 font-bold">T</div><div className="text-xs font-medium">{currentProd.tinggi || 0} cm</div></div>
                            </div>
                        )}
                     </div>

                     {/* About Product Button */}
                     <button 
                       onClick={() => setShowProdAbout(!showProdAbout)}
                       className="w-full py-2.5 px-4 bg-slate-900 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                     >
                       <FileText size={16}/> {showProdAbout ? 'Sembunyikan Detail' : 'Tentang Produk'}
                     </button>

                     {/* Lots */}
                     <div className="bg-white rounded-lg p-4 border border-slate-200">
                         <h5 className="font-bold text-sm text-slate-800 mb-2">Daftar Stok (Lots)</h5>
                         <div className="space-y-2">
                            {(currentProd.lots || []).map((l, i) => (
                                <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100 italic">
                                    <span>{l.kode || 'Tanpa Kode'}</span>
                                    <span>Stok: {l.stock} {currentProd.satuan}</span>
                                </div>
                            ))}
                         </div>
                     </div>

                     {showProdAbout && (
                         <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-300">
                             {currentProd.specifications && (
                                 <div>
                                     <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Spesifikasi</div>
                                     <div className="text-sm text-slate-700 whitespace-pre-wrap">{currentProd.specifications}</div>
                                 </div>
                             )}
                             {currentProd.mainFunction && (
                                 <div>
                                     <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Fungsi Utama</div>
                                     <div className="text-sm text-slate-700 whitespace-pre-wrap">{currentProd.mainFunction}</div>
                                 </div>
                             )}
                             {currentProd.mainApplication && (
                                 <div>
                                     <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Aplikasi Utama</div>
                                     <div className="text-sm text-slate-700 whitespace-pre-wrap">{currentProd.mainApplication}</div>
                                 </div>
                             )}
                             {currentProd.remarks && (
                                 <div>
                                     <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Keterangan</div>
                                     <div className="text-sm text-slate-700 whitespace-pre-wrap">{currentProd.remarks}</div>
                                 </div>
                             )}
                             {!currentProd.specifications && !currentProd.mainFunction && !currentProd.mainApplication && !currentProd.remarks && (
                                 <div className="text-center text-slate-400 text-sm italic">Belum ada detail produk</div>
                             )}
                         </div>
                     )}

                     <div>
                        <h5 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2"><Store size={16} className="text-slate-400"/> Riwayat Stok & Aktivitas</h5>
                        <div className="space-y-3">
                            {(() => {
                                const history = getProductStockHistory(currentProd, purchaseOrders, transactions);
                                if (history.length === 0) return <div className="text-slate-400 text-sm text-center py-4">Belum ada riwayat stok</div>;
                                
                                return history.map((item, idx) => (
                                    <div 
                                        key={idx} 
                                        onClick={() => {
                                            if (item.type === 'OUT' && item.fullTrx) {
                                                setTrxPreviewData(item.fullTrx);
                                                setShowTrxPreview(true);
                                            } else if (item.type === 'IN' && item.fullPO) {
                                                setCurrentPO(item.fullPO);
                                                setShowDrawer('poDetail');
                                            }
                                        }}
                                        className={`p-4 border rounded-xl flex justify-between items-center bg-white shadow-sm transition-all hover:shadow-md cursor-pointer border-l-4 ${item.type === 'IN' ? 'border-l-emerald-500' : 'border-l-[#A91D3A]'}`}
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${item.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {item.type === 'IN' ? 'Masuk' : 'Keluar'}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{formatDateShort(item.date)}</span>
                                            </div>
                                            <div className="font-bold text-slate-800 text-sm">{item.source}</div>
                                            
                                            {item.type === 'OUT' && (
                                                <div className="mt-1 space-y-0.5">
                                                    <div className="text-[10px] text-slate-600 font-bold flex items-center gap-1">
                                                        <Users size={10} className="text-slate-400"/> {item.customerName || 'Unknown Buyer'}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                                        <Activity size={10} className="text-slate-400"/> Status: <span className="font-bold">{item.status || 'N/A'}</span>
                                                    </div>
                                                    {item.fullTrx?.items && item.fullTrx.items.length > 1 && (
                                                        <div className="text-[9px] text-violet-600 font-bold italic">
                                                            + {item.fullTrx.items.filter((i: any) => i.produkId !== currentProd.id).map((i: any) => i.nama).join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {item.type === 'IN' && item.fullPO?.items && item.fullPO.items.length > 1 && (
                                                <div className="mt-1 text-[9px] text-violet-600 font-bold italic">
                                                    + {item.fullPO.items.filter((i: any) => i.produkId !== currentProd.id).map((i: any) => i.nama).join(', ')}
                                                </div>
                                            )}

                                            <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-1.5">
                                                <User size={10}/> {item.user} ({item.role})
                                            </div>
                                            {item.noTrx && (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{item.noTrx}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-lg font-black ${item.type === 'IN' ? 'text-emerald-600' : 'text-[#A91D3A]'}`}>
                                                {item.type === 'IN' ? '+' : '-'}{item.qty}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase">Unit</div>
                                            <div className="mt-2 text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Eye size={14} />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            })()}
                        </div>
                    </div>
                </div>
              )}
                  {showDrawer !== 'prodDetail' && showDrawer !== 'custDetail' && showDrawer !== 'empDetail' && showDrawer !== 'trxDetail' && showDrawer !== 'printInvoice' && showDrawer !== 'poDetail' && showDrawer !== 'suppDetail' && showDrawer !== 'appUserDetail' && showDrawer !== 'recycleDetail' && (
                <div className="p-4 border-t border-slate-200 bg-[#FAFAFA]">
                    {canEditCurrentView ? (
                        <button 
                            disabled={showDrawer === 'po' && (!currentPO.supplierId || !currentPO.items || currentPO.items.length === 0)}
                            onClick={() => {
                                if(showDrawer==='prod') saveProduct();
                                else if(showDrawer==='trx') saveTransaction();
                                else if(showDrawer==='cust') saveCustomer();
                                else if(showDrawer==='supp') saveSupplier();
                                else if(showDrawer==='emp') saveEmployee();
                                else if(showDrawer==='inputResi') saveResi();
                                else if(showDrawer==='paymentForm') savePayment();
                                else if(showDrawer==='po') {
                                    if (!currentPO.supplierId || !currentPO.items || currentPO.items.length === 0) {
                                        alert('Mohon lengkapi data Supplier dan minimal 1 Produk');
                                        return;
                                    }
                                    // Check if all items have valid data
                                    const invalidItem = currentPO.items.find(i => !i.produkId || i.jumlah <= 0 || (activeModule !== 'Stocklist' && i.hpp <= 0));
                                    if (invalidItem) {
                                        alert(`Mohon lengkapi data Produk, Jumlah, ${activeModule !== 'Stocklist' ? 'dan HPP ' : ''}untuk semua item`);
                                        return;
                                    }

                                    confirmAction('Konfirmasi Simpan PO', 'Apakah Anda yakin ingin menyimpan data Purchase Order ini?', () => {
                                        const now = new Date().toLocaleString('id-ID');
                                        const newPO: PurchaseOrder = {
                                            id: 'PO' + Math.floor(Math.random() * 1000),
                                            items: currentPO.items || [],
                                            supplierId: currentPO.supplierId || '',
                                            tanggalPembelian: currentPO.tanggalPembelian || new Date().toISOString().split('T')[0],
                                            status: currentPO.status || 'Process',
                                            tanggalDiterima: currentPO.tanggalDiterima,
                                            orderedBy: currentPO.orderedBy,
                                            editHistory: [{
                                                timestamp: now,
                                                user: currentUser?.nama || 'Unknown',
                                                role: currentUser?.role || 'Admin',
                                                changes: "Purchase Order dibuat",
                                                type: 'PurchaseOrder',
                                                id: 'new'
                                             }],
                                             companyId: activeCompanyId
                                        };
                                        setPurchaseOrders(prev => {
                                            const result = [...prev, newPO];
                                            syncToSupabase('purchase_orders', newPO);
                                            return result;
                                        });
                                        if (newPO.status === 'Received' || newPO.status === 'Lunas') {
                                            const date = newPO.tanggalDiterima || new Date().toISOString().split('T')[0];
                                            setProducts(prev => prev.map(p => {
                                                if (newPO.items && newPO.items.length > 0) {
                                                    const poItem = newPO.items.find(i => i.produkId === p.id);
                                                    if (poItem) {
                                                        const updProd = { 
                                                            ...p, 
                                                            lots: [...(p.lots || []), { 
                                                                lot: Date.now() + Math.floor(Math.random() * 1000), 
                                                                kode: 'AUTO', 
                                                                supplierId: newPO.supplierId || '', 
                                                                stock: poItem.jumlah, 
                                                                hpp: poItem.hpp, 
                                                                hargaJual: 0, 
                                                                tanggal: date 
                                                            }] 
                                                        };
                                                        syncToSupabase('products', updProd);
                                                        return updProd;
                                                    }
                                                }
                                                return p;
                                            }));
                                        }
                                        setShowDrawer(null);
                                    });
                                }
                                else if(showDrawer==='appUser') saveAppUser();
                            }} 
                            className="w-full font-bold py-3 rounded-lg shadow-sm bg-[#2C3E50] hover:bg-[#1a252f] text-white transition-all active:scale-95"
                        >
                            Simpan
                        </button>
                    ) : (
                        <div className="text-center py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                            View Only Mode
                        </div>
                    )}
                </div>
            )}
            
            {(showDrawer === 'prodDetail' || showDrawer === 'custDetail' || showDrawer === 'empDetail' || showDrawer === 'trxDetail' || showDrawer === 'appUserDetail' || showDrawer === 'suppDetail') && (
                 <div className="p-4 border-t border-slate-200 bg-[#FAFAFA]">
                    {(!(showDrawer === 'trxDetail' && (currentTrx.status === 'Selesai' || currentTrx.status === 'Penawaran' || currentTrx.status === 'Pengiriman' || ['PPN', 'NON PPN', 'Ongkir'].includes(activeView))) || currentUser?.role === 'superadmin') && canEditCurrentView ? (
                        <button 
                            onClick={() => { 
                                setConfirmModal({
                                    isOpen: true,
                                    title: 'Konfirmasi Edit',
                                    message: `Apakah Anda yakin ingin mengubah data ${showDrawer === 'prodDetail' ? 'produk' : showDrawer === 'custDetail' ? 'kontak' : showDrawer === 'suppDetail' ? 'supplier' : showDrawer === 'empDetail' ? 'karyawan' : showDrawer === 'appUserDetail' ? 'user' : (currentTrx.statuses?.includes('Penawaran') ? 'penawaran' : 'transaksi')} ini?`,
                                    type: 'warning',
                                    onConfirm: () => {
                                        if (showDrawer === 'prodDetail') {
                                            const latestLot = currentProd.lots && currentProd.lots.length > 0 ? currentProd.lots[currentProd.lots.length - 1] : null;
                                            setTempStock({
                                                stock: 0,
                                                hpp: latestLot ? latestLot.hpp : (currentProd.hpp || 0),
                                                hargaJual: latestLot ? latestLot.hargaJual : (getProductPrice(currentProd as Product) || 0),
                                                supplierId: latestLot ? latestLot.supplierId : ''
                                            });
                                        }
                                        setShowDrawer(showDrawer === 'prodDetail' ? 'prod' : showDrawer === 'custDetail' ? 'cust' : showDrawer === 'suppDetail' ? 'supp' : showDrawer === 'empDetail' ? 'emp' : showDrawer === 'appUserDetail' ? 'appUser' : 'trx');
                                        setConfirmModal(null);
                                    }
                                });
                            }} 
                            className="w-full border border-slate-300 bg-white text-slate-700 font-bold py-3 rounded-lg hover:bg-slate-50"
                        >
                            {showDrawer === 'prodDetail' ? 'Edit Produk' : showDrawer === 'custDetail' ? 'Edit Kontak' : showDrawer === 'suppDetail' ? 'Edit Supplier' : showDrawer === 'empDetail' ? 'Edit Karyawan' : showDrawer === 'appUserDetail' ? 'Edit User' : (currentTrx.statuses?.includes('Penawaran') ? 'Edit Penawaran' : 'Edit Transaksi')}
                        </button>
                    ) : (
                        <div className="text-center py-2 text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                            {showDrawer === 'trxDetail' && currentTrx.status === 'Selesai' && currentUser?.role !== 'superadmin' ? 'Transaksi Selesai (Read Only)' : 
                             showDrawer === 'trxDetail' && currentTrx.status === 'Penawaran' && currentUser?.role !== 'superadmin' ? 'Detail Penawaran (Read Only)' : 
                             showDrawer === 'trxDetail' && currentTrx.status === 'Pengiriman' && currentUser?.role !== 'superadmin' ? 'Detail Pengiriman (Read Only)' : 
                             showDrawer === 'trxDetail' && ['PPN', 'NON PPN', 'Ongkir'].includes(activeView) && currentUser?.role !== 'superadmin' ? `Detail Report ${activeView} (Read Only)` : 
                             !canEditCurrentView ? 'View Only Mode' : 'Detail'}
                        </div>
                    )}
                 </div>
              )}
            </div>
          </div>
        </div>
        )}

      {/* --- TRANSACTION PREVIEW MODAL --- */}
      {showTrxPreview && trxPreviewData && (
          <TransactionPreview trx={trxPreviewData} onClose={() => setShowTrxPreview(false)} />
      )}

      {/* --- CONFIRMATION MODAL --- */}
      {confirmModal?.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className={`p-6 text-center ${
                      confirmModal.type === 'danger' ? 'bg-red-50' : 
                      confirmModal.type === 'warning' ? 'bg-orange-50' : 'bg-blue-50'
                  }`}>
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                          confirmModal.type === 'danger' ? 'bg-red-100 text-red-600' : 
                          confirmModal.type === 'warning' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                          {confirmModal.type === 'danger' ? <Trash2 size={32}/> : 
                           confirmModal.type === 'warning' ? <AlertTriangle size={32}/> : <Info size={32}/>}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2">{confirmModal.title}</h3>
                      <p className="text-slate-600">{confirmModal.message}</p>
                  </div>
                  <div className="p-4 flex gap-3 bg-slate-50">
                      <button 
                          onClick={() => setConfirmModal(null)}
                          className="flex-1 px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                      >
                          Batal
                      </button>
                      <button 
                          onClick={confirmModal.onConfirm}
                          className={`flex-1 px-4 py-3 text-sm font-bold text-white rounded-xl shadow-lg transition-all active:scale-95 ${
                              confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 
                              confirmModal.type === 'warning' ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200' : 
                              'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                          }`}
                      >
                          {confirmModal.confirmText || 'Ya, Lanjutkan'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- AI ANALYTICS MODAL --- */}
      {showAIModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
                <div className="p-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                            <Sparkles size={24} className="animate-pulse" />
                        </div>
                        <div>
                            <h2 className="font-black text-lg">Analisa Bisnis AI</h2>
                            <p className="text-xs text-white/80 font-bold uppercase tracking-widest">Powered by Gemini AI</p>
                        </div>
                    </div>
                    <button onClick={() => setShowAIModal(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-auto p-8">
                    {isAnalyzingAI ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-6">
                            <div className="relative">
                                <div className="w-20 h-20 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin"></div>
                                <Sparkles size={32} className="absolute inset-0 m-auto text-violet-600 animate-pulse" />
                            </div>
                            <div className="text-center">
                                <h3 className="font-black text-slate-800 mb-2">Sedang Menganalisa Data...</h3>
                                <p className="text-sm text-slate-400 max-w-xs mx-auto">Kami sedang memproses data inventaris dan penjualan Anda untuk memberikan wawasan terbaik.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="prose prose-slate prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-black prose-headings:text-slate-800 prose-ul:list-disc prose-ul:pl-4">
                            <div className="text-slate-600">
                                <Markdown remarkPlugins={[remarkGfm]}>
                                    {aiAnalysis || "Belum ada hasil analisa data."}
                                </Markdown>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button 
                        onClick={() => setShowAIModal(false)}
                        className="bg-white border border-slate-200 text-slate-700 font-bold py-2.5 px-6 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        Tutup
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- ADD/EDIT COMPANY MODAL --- */}
      {showModal === 'ADD_COMPANY' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 text-slate-800">
                <h3 className="text-lg font-black uppercase tracking-tight">
                    {currentCompanyEdit.id ? 'Edit Perusahaan' : 'Tambah Perusahaan Baru'}
                </h3>
                <button onClick={() => setShowModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <label className={labelClass}>Logo Perusahaan</label>
                        <div className="flex items-center gap-4">
                            {currentCompanyEdit.logo ? (
                                <img src={currentCompanyEdit.logo} alt="Logo" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                            ) : (
                                <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                                    <Store size={24} />
                                </div>
                            )}
                            <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer text-xs">
                                Upload Logo
                                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                                    const file = e.target.files?.[0];
                                    if(file) {
                                        const processed = await processImage(file);
                                        setCurrentCompanyEdit({...currentCompanyEdit, logo: processed});
                                    }
                                }} />
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Nama Bank</label>
                        <input 
                            type="text" 
                            className={inputClass} 
                            placeholder="Contoh: BCA"
                            value={currentCompanyEdit.bankName || ''}
                            onChange={e => setCurrentCompanyEdit({...currentCompanyEdit, bankName: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Nama Rekening</label>
                        <input 
                            type="text" 
                            className={inputClass} 
                            placeholder="Contoh: PT. Maju Jaya"
                            value={currentCompanyEdit.bankAccountName || ''}
                            onChange={e => setCurrentCompanyEdit({...currentCompanyEdit, bankAccountName: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Nomor Rekening</label>
                        <input 
                            type="text" 
                            className={inputClass} 
                            placeholder="Contoh: 1234567890"
                            value={currentCompanyEdit.bankAccountNumber || ''}
                            onChange={e => setCurrentCompanyEdit({...currentCompanyEdit, bankAccountNumber: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Nama Perusahaan <span className="text-rose-500">*</span></label>
                        <input 
                            type="text" 
                            className={inputClass} 
                            placeholder="Contoh: PT. Maju Jaya"
                            value={currentCompanyEdit.nama || ''}
                            onChange={e => setCurrentCompanyEdit({...currentCompanyEdit, nama: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Email Resmi</label>
                        <input 
                            type="email" 
                            className={inputClass} 
                            placeholder="admin@perusahaan.com"
                            value={currentCompanyEdit.email || ''}
                            onChange={e => setCurrentCompanyEdit({...currentCompanyEdit, email: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Nomor Telepon</label>
                        <input 
                            type="text" 
                            className={inputClass} 
                            placeholder="+62 ..."
                            value={currentCompanyEdit.telepon || ''}
                            onChange={e => setCurrentCompanyEdit({...currentCompanyEdit, telepon: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>NPWP Perusahaan</label>
                        <input 
                            type="text" 
                            className={inputClass} 
                            placeholder="00.000.000.0-000.000"
                            value={currentCompanyEdit.npwp || ''}
                            onChange={e => setCurrentCompanyEdit({...currentCompanyEdit, npwp: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Alamat Lengkap</label>
                        <textarea 
                            className={`${inputClass} h-24 resize-none`}
                            placeholder="Masukkan alamat lengkap kantor..."
                            value={currentCompanyEdit.alamat || ''}
                            onChange={e => setCurrentCompanyEdit({...currentCompanyEdit, alamat: e.target.value})}
                        />
                    </div>
                </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                <button 
                    onClick={() => setShowModal(null)}
                    className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
                >
                    Batal
                </button>
                <button 
                    onClick={saveCompany}
                    className="px-6 py-2.5 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-200"
                >
                    Simpan Perusahaan
                </button>
            </div>
          </div>
        </div>
      )}


      {/* --- IMPORT USER MODAL (COPY USER FROM OTHER COMPANY) --- */}
      {showModal === 'IMPORT_USER' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50 text-slate-800">
                <div className="flex items-center gap-2">
                    <UserPlus className="text-amber-600 animate-pulse" size={20} />
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">
                        Import / Copy User dari Perusahaan Lain
                    </h3>
                </div>
                <button onClick={() => { setShowModal(null); setImportUserSearch(''); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                    Salin informasi user dari instansi/perusahaan lain ke perusahaan aktif (<span className="font-bold text-slate-700">{getAccessibleCompanies.find(c => c.id === activeCompanyId)?.nama || 'Perusahaan Aktif'}</span>). User hasil copy akan memiliki hak akses dan data tersendiri sesuai perusahaan tujuan.
                </p>
                
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input 
                        type="text"
                        placeholder="Cari user berdasarkan nama, username, atau role..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none transition-all text-slate-700"
                        value={importUserSearch}
                        onChange={e => setImportUserSearch(e.target.value)}
                    />
                </div>

                <div className="max-h-[300px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                    {(() => {
                        const activeCompanyUsernames = appUsers
                            .filter(u => (u.companyId || u.company_id) === activeCompanyId)
                            .map(u => u.username?.toLowerCase());

                        const otherUsers = appUsers.filter(u => {
                            const compId = u.companyId || u.company_id;
                            if (compId === activeCompanyId) return false;
                            
                            // Match search keyword
                            const sMatch = !importUserSearch ? true : (
                                (u.nama || '').toLowerCase().includes(importUserSearch.toLowerCase()) ||
                                (u.username || '').toLowerCase().includes(importUserSearch.toLowerCase()) ||
                                (u.role || '').toLowerCase().includes(importUserSearch.toLowerCase())
                            );
                            return sMatch;
                        });

                        if (otherUsers.length === 0) {
                            return (
                                <div className="p-8 text-center text-xs text-slate-400 font-medium">
                                    Tidak ada user lain yang cocok atau tersedia untuk di-import.
                                </div>
                            );
                        }

                        return otherUsers.map((user, i) => {
                            const originComp = companies.find(c => c.id === (user.companyId || user.company_id))?.nama || 'Unknown Company';
                            const isAlreadyExists = activeCompanyUsernames.includes(user.username?.toLowerCase());

                            return (
                                <div key={`${user.id || user.username || i}-${i}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-800 text-sm">{user.nama}</span>
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-[10px] rounded uppercase font-bold">{user.role}</span>
                                        </div>
                                        <span className="text-xs text-slate-400 font-mono">Username: @{user.username}</span>
                                        <span className="text-[11px] text-amber-600 font-medium">Perusahaan Asal: {originComp}</span>
                                    </div>
                                    
                                    <div>
                                        {isAlreadyExists ? (
                                            <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg inline-block">
                                                Sudah Terdaftar
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    const newUid = 'U' + Date.now() + Math.floor(Math.random() * 100);
                                                    const newUser: UserAccount = {
                                                        ...user,
                                                        id: newUid,
                                                        companyId: activeCompanyId,
                                                        company_id: activeCompanyId,
                                                        createdAt: new Date().toISOString()
                                                    };
                                                    
                                                    // Save directly
                                                    setAppUsers(prev => [...prev, newUser]);
                                                    syncToSupabase('user_accounts', newUser);
                                                    logUserAction('IMPORT_USER', `Import user ${user.nama} (@${user.username}) dari ${originComp}`, 'System');
                                                    alert(`Sukses mengcopy user ${user.nama} ke perusahaan saat ini.`);
                                                }}
                                                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition-colors shadow-sm cursor-pointer"
                                            >
                                                Salin & Import
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50">
                <button 
                    onClick={() => { setShowModal(null); setImportUserSearch(''); }}
                    className="px-5 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors"
                >
                    Tutup
                </button>
            </div>
          </div>
        </div>
      )}

      {/* --- IMPORT CONTACTS MODAL (SUPERADMIN ONLY - COPY CONTACTS FROM OTHER COMPANIES) --- */}
      {showModal === 'IMPORT_CONTACTS' && currentUser?.role === 'superadmin' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50 text-slate-800">
                <div className="flex items-center gap-2">
                    <Copy className="text-emerald-600 animate-pulse" size={20} />
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">
                        Import / Copy Semua Kontak dari Perusahaan Lain
                    </h3>
                </div>
                <button onClick={() => { setShowModal(null); setImportContactSearch(''); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <div className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-slate-700">
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm">Salin Seluruh Kontak Sekaligus?</h4>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-md mt-1">
                            Fitur ini menyalin semua data kontak (customers) dari perusahaan lain yang belum ada di perusahaan saat ini (<span className="font-bold">{getAccessibleCompanies.find(c => c.id === activeCompanyId)?.nama}</span>).
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            if (confirm('Apakah Anda yakin ingin menyalin semua kontak dari seluruh perusahaan lain ke perusahaan ini? Data tidak akan menimpa kontak yang sudah ada.')) {
                                let importCount = 0;
                                
                                // Get current contacts for active company
                                const activeCompanyCustNames = customers
                                    .filter(c => (c.companyId || c.company_id) === activeCompanyId)
                                    .map(c => (c.nama || '').trim().toLowerCase());

                                // Filter other companies contacts
                                const otherContacts = customers.filter(c => {
                                    const compId = c.companyId || c.company_id;
                                    return compId !== activeCompanyId;
                                });

                                const newAddedContacts: any[] = [];

                                otherContacts.forEach(oldC => {
                                    const isDuplicate = activeCompanyCustNames.includes((oldC.nama || '').trim().toLowerCase()) || 
                                                        newAddedContacts.some(added => (added.nama || '').trim().toLowerCase() === (oldC.nama || '').trim().toLowerCase());
                                    
                                    if (!isDuplicate) {
                                        const newCid = 'C' + Date.now() + Math.floor(Math.random() * 100000).toString();
                                        const newContact = {
                                            ...oldC,
                                            id: newCid,
                                            companyId: activeCompanyId,
                                            company_id: activeCompanyId,
                                            createdAt: new Date().toISOString()
                                        };
                                        newAddedContacts.push(newContact);
                                        syncToSupabase('customers', newContact);
                                        importCount++;
                                    }
                                });

                                if (newAddedContacts.length > 0) {
                                    setCustomers(prev => [...prev, ...newAddedContacts]);
                                    logUserAction('IMPORT_ALL_CONTACTS', `Superadmin mengimport ${importCount} kontak baru dari perusahaan lain`, 'System');
                                    alert(`Sukses mengcopy ${importCount} kontak ke perusahaan ini.`);
                                } else {
                                    alert('Tidak ada kontak baru yang unik ditemukan untuk di-import.');
                                }
                            }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm shadow-emerald-100 shrink-0 cursor-pointer"
                    >
                        <Copy size={13} /> Copy Semua Sekarang
                    </button>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input 
                        type="text"
                        placeholder="Cari kontak berdasarkan nama, keterangan, atau asal perusahaan..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:ring-2 focus:ring-emerald-400 focus:bg-white outline-none transition-all text-slate-700"
                        value={importContactSearch}
                        onChange={e => setImportContactSearch(e.target.value)}
                    />
                </div>

                <div className="max-h-[260px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                    {(() => {
                        const activeCompanyCustNames = customers
                            .filter(c => (c.companyId || c.company_id) === activeCompanyId)
                            .map(c => (c.nama || '').trim().toLowerCase());

                        const otherContactsFiltered = customers.filter(c => {
                            const compId = c.companyId || c.company_id;
                            if (compId === activeCompanyId) return false;
                            
                            const sMatch = !importContactSearch ? true : (
                                (c.nama || '').toLowerCase().includes(importContactSearch.toLowerCase()) ||
                                (c.email || '').toLowerCase().includes(importContactSearch.toLowerCase()) ||
                                (c.keterangan || '').toLowerCase().includes(importContactSearch.toLowerCase())
                            );
                            return sMatch;
                        });

                        if (otherContactsFiltered.length === 0) {
                            return (
                                <div className="p-8 text-center text-xs text-slate-400 font-medium">
                                    Tidak ada kontak lain yang cocok atau tersedia untuk di-import.
                                </div>
                            );
                        }

                        return otherContactsFiltered.map(contact => {
                            const originComp = companies.find(comp => comp.id === (contact.companyId || contact.company_id))?.nama || 'Unknown Company';
                            const isAlreadyExists = activeCompanyCustNames.includes((contact.nama || '').trim().toLowerCase());

                            return (
                                <div key={contact.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                                    <div className="flex flex-col gap-0.5 max-w-md">
                                        <span className="font-bold text-slate-800 text-sm">{contact.nama}</span>
                                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                            <span>{contact.email || 'No email'}</span>
                                            <span>•</span>
                                            <span>{contact.phone || 'No phone'}</span>
                                        </div>
                                        <span className="text-[11px] text-emerald-600 font-semibold">Perusahaan Asal: {originComp}</span>
                                    </div>
                                    
                                    <div>
                                        {isAlreadyExists ? (
                                            <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg inline-block">
                                                Sudah Ada
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    const newCid = 'C' + Date.now() + Math.floor(Math.random() * 100);
                                                    const newContact = {
                                                        ...contact,
                                                        id: newCid,
                                                        companyId: activeCompanyId,
                                                        company_id: activeCompanyId,
                                                        createdAt: new Date().toISOString()
                                                    };
                                                    
                                                    setCustomers(prev => [...prev, newContact]);
                                                    syncToSupabase('customers', newContact);
                                                    logUserAction('IMPORT_CONTACT', `Superadmin mengcopy kontak ${contact.nama} dari ${originComp}`, 'System');
                                                    alert(`Sukses mengcopy kontak ${contact.nama} ke perusahaan saat ini.`);
                                                }}
                                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm cursor-pointer"
                                            >
                                                Salin & Import
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50">
                <button 
                    onClick={() => { setShowModal(null); setImportContactSearch(''); }}
                    className="px-5 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors"
                >
                    Tutup
                </button>
            </div>
          </div>
        </div>
      )}

      {/* --- IMPORT PRODUCT MODAL (SUPERADMIN ONLY) --- */}
      {showModal === 'IMPORT_PRODUCT' && currentUser?.role === 'superadmin' && (
          <ImportProductModal 
            activeCompanyId={activeCompanyId}
            products={products}
            setProducts={setProducts}
            syncToSupabase={syncToSupabase}
            logUserAction={logUserAction}
            setShowModal={setShowModal}
            companies={companies}
          />
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
                            
                            if (confirm(`Yakin copy semua transaksi (${activeView}) milik sales ${selectedSales} dari perusahaan lain?`)) {
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
                                    logUserAction('IMPORT_TRANSACTION', `Superadmin mengimport ${importCount} transaksi (${activeView}) milik sales ${selectedSales}`, 'System');
                                    alert(`Sukses mengcopy ${importCount} transaksi ke perusahaan ini.`);
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

      {/* --- SCANNER MODAL --- */}
      {showModal === 'scanner' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4 text-slate-900">Scan QR Code</h3>
            <p className="text-sm text-slate-500 mb-4">Kamera ini berfungsi untuk scan produk. Pastikan QR code produk terlihat jelas di dalam kotak.</p>
            <div className="overflow-hidden rounded-xl h-64">
              <QrReader
                onResult={(result, error) => {
                  if (result) {
                    const scannedData = result.getText();
                    const product = products.find(p => p.kode === scannedData || p.id === scannedData);
                    if (product) {
                      setCurrentProd(product);
                      setShowDrawer('prodDetail');
                      setShowModal(null);
                    } else {
                      alert("Produk tidak ditemukan");
                    }
                  }
                }}
                constraints={{ facingMode: 'environment' }}
                videoStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <button onClick={() => setShowModal(null)} className="mt-4 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors">Tutup</button>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center animate-in fade-in duration-200">
            <button 
                onClick={() => setLightboxImage(null)} 
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/50 hover:bg-black rounded-full transition-all"
            >
                <X size={24} />
            </button>
            
            <div className="relative w-full max-w-4xl max-h-screen flex items-center justify-center p-4">
                {lightboxImage.images.length > 1 && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setLightboxImage(prev => prev ? {...prev, index: prev.index === 0 ? prev.images.length - 1 : prev.index - 1} : null);
                        }}
                        className="absolute left-4 p-3 text-white/50 hover:text-white bg-black/30 hover:bg-black/60 rounded-full transition-all z-10"
                    >
                        <ArrowLeft size={24} />
                    </button>
                )}
                
                <img 
                    src={lightboxImage.images[lightboxImage.index]} 
                    alt="Penuh" 
                    className="max-w-full max-h-[85vh] object-contain rounded animate-in zoom-in-95 duration-200" 
                    referrerPolicy="no-referrer"
                />
                
                {lightboxImage.images.length > 1 && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setLightboxImage(prev => prev ? {...prev, index: (prev.index + 1) % prev.images.length} : null);
                        }}
                        className="absolute right-4 p-3 text-white/50 hover:text-white bg-black/30 hover:bg-black/60 rounded-full transition-all z-10"
                    >
                        <ArrowRight size={24} />
                    </button>
                )}
            </div>

            {lightboxImage.images.length > 1 && (
                <div className="absolute bottom-6 flex gap-2">
                    {lightboxImage.images.map((_, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => setLightboxImage(prev => prev ? {...prev, index: idx} : null)}
                            className={`w-2 h-2 rounded-full cursor-pointer transition-all ${idx === lightboxImage.index ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'}`}
                        />
                    ))}
                </div>
            )}
        </div>
      )}

      {/* Floating AI Hub (Kanan Bawah - Panca AI App & Gemini AI) */}
      {isLoggedIn && (
        <div 
          className={`fixed bottom-6 right-6 z-50 ${
            (['WA Chat', 'WA Setting AI', 'WA Perangkat', 'WhatsApp'].includes(activeView) || activeTab === 'whatsapp' || activeTab === 'WhatsApp') 
              ? 'hidden md:block' 
              : ''
          }`} 
          ref={floatingAiRef}
        >
          {/* Popup Menu when clicking Floating AI */}
          {showFloatingAiMenu && (
            <div className="absolute bottom-16 right-0 mb-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-violet-500" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Panca AI Hub</span>
                </div>
                <button 
                  onClick={() => setShowFloatingAiMenu(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-1.5">
                <button
                  onClick={() => {
                    setShowFloatingAiMenu(false);
                    handleOpenPancaApp();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-violet-50/70 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-900/50 text-left transition active:scale-95 group border border-violet-100 dark:border-violet-900/40 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-violet-500/20">
                    <Sparkles size={18} className="text-amber-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-violet-950 dark:text-violet-200 group-hover:text-violet-600">Panca AI App</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200">/app</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Mobile PWA, Voice Chat & Dashboard</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setShowFloatingAiMenu(false);
                    setShowAiAssistant(true);
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition active:scale-95 group border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                    <Bot size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600">Gemini AI Assistant</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Desktop</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Asisten Data Bisnis & Laporan ERP</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          <div className="group relative">
            <button
              onClick={() => setShowFloatingAiMenu(!showFloatingAiMenu)}
              className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-600 text-white shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 transition-all duration-300 ring-4 ring-indigo-500/20 cursor-pointer"
              title="Panca AI Hub (/app & Asisten Data)"
              aria-label="Panca AI Hub"
            >
              <Sparkles size={22} className="group-hover:rotate-12 transition-transform duration-300 animate-pulse text-amber-300" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-gradient-to-r from-pink-500 to-purple-500 text-[9px] font-extrabold items-center justify-center text-white border-2 border-white dark:border-slate-900 shadow">
                  AI
                </span>
              </span>
            </button>
            
            <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 hidden sm:flex items-center">
              <div className="bg-slate-900/90 text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-lg backdrop-blur-sm whitespace-nowrap border border-slate-700/50 flex items-center gap-1.5">
                <Sparkles size={12} className="text-amber-400" />
                Panca AI App & Gemini AI
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Gemini AI Assistant Modal */}
      {showAiAssistant && (
        <GeminiAIAssistant
          isOpen={showAiAssistant}
          onClose={() => setShowAiAssistant(false)}
          currentUser={currentUser}
          activeCompany={activeCompany}
          activeCompanyId={activeCompanyId}
          filterMonth={filterMonth}
          filterYear={filterYear}
          companies={companies}
          roleTemplates={roleTemplates}
          transactions={transactions}
          customers={customers}
          products={products}
          suppliers={suppliers}
          purchaseOrders={purchaseOrders}
          employees={employees}
          appUsers={appUsers}
          deletedItems={deletedItems}
          userLogs={userLogs}
          setCustomers={setCustomers}
          setTransactions={setTransactions}
          setPurchaseOrders={setPurchaseOrders}
          setProducts={setProducts}
          syncToSupabase={syncToSupabase}
          onOpenPancaApp={handleOpenPancaApp}
          onOpenSettings={() => {
            setActiveView('Settings');
            setActiveTab('#Settings');
            setActiveModule('Control Panel');
          }}
        />
      )}
    </div>
  );
};

export default App;
// Helper for Date display in detail view
const formatDateShort = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' }); } 
    catch { return '-'; }
};
const handleSelectAll = (ids: string[]) => {}; // Helper dummy for TS safety in loop if needed, but inlined logic preferred
