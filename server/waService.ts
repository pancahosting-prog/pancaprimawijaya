import express from "express";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { supabaseServer } from "./supabaseServer.ts";

// File storage paths for WA state
const SESSION_DIR = path.resolve("./wa-session");
const SETTINGS_FILE = path.resolve("./wa-ai-settings.json");
const CHATS_FILE = path.resolve("./wa-chats.json");
const CONNECTED_NUMBERS_FILE = path.resolve("./wa-connected-numbers.json");

export interface WAChatMedia {
  type: 'image' | 'document' | 'video' | 'audio';
  data?: string;
  url?: string;
  mimetype?: string;
  fileName?: string;
  fileSize?: number;
}

export interface WAChatMessage {
  id: string;
  fromMe: boolean;
  sender: string;
  senderName?: string;
  text: string;
  timestamp: number;
  status?: string;
  media?: WAChatMedia;
}

export interface WAChat {
  id: string;
  jid: string;
  name: string;
  phone: string;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: number;
  messages: WAChatMessage[];
  connectedPhone?: string; // Nomor terhubung pemilik sesi chat
  isHandedOverToHuman?: boolean; // Jika true, AI berhenti auto-reply percakapan ini
  fallbackCount?: number; // Jumlah berturut-turut bot mengalami fallback
  waitingHandoverConsent?: boolean; // Sedang menunggu konfirmasi user (setuju dialihkan ke CS)
}

export interface WAKBProduct {
  id: string;
  productName: string;
  description: string;
  price: string;
  keywords: string[];
  faq: { q: string; a: string }[];
}

export interface WAKBTextSnippet {
  id: string;
  title: string;
  category: string; // "Profil Perusahaan" | "Kebijakan & S&K" | "Prosedur Pemesanan" | "Rekening & Pembayaran" | "Garansi & Retur" | "Lainnya"
  content: string;
  keywords: string[];
  updatedAt?: number;
}

export interface WAKBWebSource {
  id: string;
  url: string;
  title: string;
  summary: string;
  isActive: boolean;
  updatedAt?: number;
}

export interface WAIHandoverConfig {
  enabled: boolean;
  triggerKeywords: string[];
  handoverContact: string;
  handoverMessage: string;
}

export interface WAISalesCtaConfig {
  enabled: boolean;
  ctaMessage: string;
  triggerKeywords: string[];
}

export interface WAISettings {
  autoReplyEnabled: boolean;
  botName: string;
  systemInstructions: string;
  toneOfVoice: string;
  responseLanguage: string;
  greetingMessage: string;
  fallbackMessage: string;
  restrictedTopics: string[];
  handoverToHuman: WAIHandoverConfig;
  salesCta: WAISalesCtaConfig;

  // Separated Knowledge Containers
  knowledgeProducts: WAKBProduct[];
  knowledgeSnippets: WAKBTextSnippet[]; // Paragraf biasa yang diinput user
  knowledgeWebSources: WAKBWebSource[]; // Source website

  // Backward compatibility
  knowledgeBase?: WAKBProduct[];
  tone?: string;

  logs: {
    id: string;
    timestamp: number;
    sender: string;
    incoming: string;
    reply: string;
    modelUsed: string;
    isHandover?: boolean;
    isRestricted?: boolean;
  }[];
}

class WAService {
  private socket: any = null;
  public qrCodeBase64: string | null = null;
  public qrTimestamp: number = 0;
  public qrVersion: number = 0;
  public qrExpired: boolean = false;
  public connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  public userJid: string | null = null;
  public userPhone: string | null = null;
  public userName: string | null = null;

  public isQRExpired(): boolean {
    if (this.connectionState === "connected") return false;
    if (!this.qrCodeBase64 || !this.qrTimestamp) return false;
    // Beri batas waktu realistis 60 detik bagi pengguna untuk membuka WA HP, membuka Perangkat Tertaut, dan men-scan barcode
    return (Date.now() - this.qrTimestamp) > 60000;
  }

  public async persistStatus() {
    try {
      const data = {
        connectionState: this.connectionState,
        qrCodeBase64: this.qrCodeBase64,
        qrTimestamp: this.qrTimestamp,
        qrVersion: this.qrVersion,
        qrExpired: this.qrExpired,
        userJid: this.userJid,
        userPhone: this.userPhone,
        userName: this.userName,
        updatedAt: new Date().toISOString()
      };
      // Save locally
      fs.writeFileSync(path.join(process.cwd(), "wa-status.json"), JSON.stringify(data, null, 2), "utf-8");

      // Save to Supabase app_settings
      if (supabaseServer) {
        await supabaseServer.from("app_settings").upsert({
          key: "wa_connection_status",
          value: data,
          updated_at: new Date().toISOString()
        });
      }
    } catch (e) {}
  }

  public async loadPersistedStatus() {
    try {
      let data: any = null;
      const filePath = path.join(process.cwd(), "wa-status.json");
      if (fs.existsSync(filePath)) {
        try {
          data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch (e) {}
      }

      if (!data && supabaseServer) {
        try {
          const { data: dbData } = await supabaseServer.from("app_settings").select("value").eq("key", "wa_connection_status").maybeSingle();
          if (dbData?.value) {
            data = dbData.value;
          }
        } catch (e) {}
      }

      if (data) {
        if (!this.qrCodeBase64 && data.qrCodeBase64 && (Date.now() - (data.qrTimestamp || 0) < 180000)) {
          this.qrCodeBase64 = data.qrCodeBase64;
          this.qrTimestamp = data.qrTimestamp || Date.now();
          this.qrVersion = data.qrVersion || 1;
        }
        if (data.connectionState && this.connectionState === "disconnected") {
          this.connectionState = data.connectionState;
        }
        if (data.userPhone && !this.userPhone) this.userPhone = data.userPhone;
        if (data.userJid && !this.userJid) this.userJid = data.userJid;
        if (data.userName && !this.userName) this.userName = data.userName;
      }
    } catch (e) {}
  }

  public async getStatus() {
    await this.loadPersistedStatus();

    const isExpired = this.qrExpired || (this.connectionState === "disconnected" && this.isQRExpired());
    return {
      connectionState: this.connectionState,
      qrCodeBase64: this.qrCodeBase64,
      rawQrCodeBase64: this.qrCodeBase64,
      qrTimestamp: this.qrTimestamp,
      qrVersion: this.qrVersion,
      qrExpired: isExpired && this.connectionState !== "connected",
      userJid: this.userJid,
      userPhone: this.userPhone,
      userName: this.userName,
      knownNumbers: this.getKnownNumbers()
    };
  }

  // Chats organized by connected phone number: Map<connectedPhone, Map<jid, WAChat>>
  private chatsByPhone: Map<string, Map<string, WAChat>> = new Map();
  private knownConnectedPhones: Set<string> = new Set();

  public static readonly DEFAULT_CLEAN_KNOWLEDGE_SNIPPETS = [
    {
      id: "snip-1",
      title: "Profil Perusahaan & Layanan Utama PT. Panca Prima Wijaya",
      category: "Profil Perusahaan",
      content: "PT. Panca Prima Wijaya adalah perusahaan manufaktur dan distributor terpercaya di Indonesia yang bergerak di bidang penyediaan sarana produksi pertanian modern, kemasan industri, dan perlengkapan perkebunan. Kami berfokus pada penyediaan produk berkualitas tinggi seperti Plastik Sungkup Pertanian UV, Mulsa Plastik Hitam Perak (MPHP), Insect Net Kasa Hijau, Karung Plastik, dan perlengkapan greenhouse untuk mendukung produktivitas petani dan mitra industri di seluruh Indonesia.",
      keywords: ["profil", "tentang kami", "perusahaan", "panca prima wijaya", "layanan", "distributor", "pabrik", "kantor"]
    },
    {
      id: "snip-2",
      title: "Katalog Produk Unggulan & Spesifikasi Teknis",
      category: "Katalog Produk",
      content: "Produk-produk unggulan resmi PT. Panca Prima Wijaya:\n1. Plastik Sungkup Pertanian UV: Plastik transparan proteksi anti-UV tebal & ulet untuk perlindungan tanaman cabai, melon, dan semangka dari hujan ekstrem serta hama (Rp 450.000 / roll ukuran 1m x 200m, tahan hingga 2-3 musim tanam).\n2. Mulsa Plastik Hitam Perak (MPHP): Mulsa dua lapis berkualitas tinggi (sisi perak memantulkan sinar matahari menghalau serangga/kutu trips, sisi hitam menekan pertumbuhan gulma & menjaga kelembapan tanah, Rp 385.000 / roll tebal 0.35 mikron).\n3. Insect Net / Kasa Hijau 50 Mesh: Jaring pelindung greenhouse monofilament HDPE murni, rajutan kuat lock-stitch anti-hama serangga kecil tanpa menghambat sirkulasi udara (Rp 1.250.000 / roll 3m x 100m).\nTersedia juga pemesanan ukuran khusus (custom roll) untuk kebutuhan proyek perkebunan skala besar.",
      keywords: ["produk", "katalog", "plastik sungkup", "sungkup", "uv", "mulsa", "mphp", "hitam perak", "insect net", "kasa hijau", "harga", "spesifikasi"]
    },
    {
      id: "snip-3",
      title: "Jam Operasional Layanan & Respons WhatsApp",
      category: "Jam Operasional",
      content: "Jam Operasional Layanan Customer Service PT. Panca Prima Wijaya:\n• Senin s/d Jumat: 08:30 - 17:00 WIB\n• Sabtu: 08:30 - 13:00 WIB\n• Hari Minggu & Hari Libur Nasional: Tutup (Pesan yang masuk di luar jam kerja tetap tersimpan aman dan diprioritaskan untuk direspon pada jam kerja pertama berikutnya).",
      keywords: ["jam kerja", "operasional", "buka", "tutup", "hari kerja", "sabtu", "minggu", "libur"]
    },
    {
      id: "snip-4",
      title: "Prosedur Pemesanan & Penerbitan Faktur Pajak PPN",
      category: "Prosedur Pemesanan",
      content: "Alur pemesanan produk resmi PT. Panca Prima Wijaya:\n1. Pelanggan berkonsultasi mengenai tipe, ukuran, dan jumlah kebutuhan barang dengan tim sales.\n2. Tim sales menerbitkan Surat Penawaran Harga resmi (Quotation / Sales Order).\n3. Pelanggan melakukan konfirmasi dan transfer ke rekening bank resmi perusahaan.\n4. Pesanan disiapkan di gudang dan dikirim bersama Invoice asli & Surat Jalan.\nPT. Panca Prima Wijaya adalah Pengusaha Kena Pajak (PKP) resmi dan siap menerbitkan e-Faktur Pajak 11% untuk setiap transaksi bisnis maupun perorangan.",
      keywords: ["cara order", "pemesanan", "pesan", "beli", "quotation", "penawaran", "faktur pajak", "ppn", "invoice", "po", "pkp"]
    },
    {
      id: "snip-5",
      title: "Rekening Bank Pembayaran Resmi Perusahaan",
      category: "Rekening & Pembayaran",
      content: "PERINGATAN KEAMANAN TRANSAKSI:\nSeluruh transaksi pembayaran yang sah HANYA dilakukan melalui transfer ke rekening bank resmi atas nama perusahaan PT. PANCA PRIMA WIJAYA:\n• Bank BCA: No. Rek 123-456-7890 (a/n PT Panca Prima Wijaya)\n• Bank Mandiri: No. Rek 987-654-3210 (a/n PT Panca Prima Wijaya)\n\nManajemen PT. Panca Prima Wijaya TIDAK PERNAH meminta pembayaran ke rekening pribadi atas nama perorangan siapapun demi menjamin keamanan transaksi Anda.",
      keywords: ["rekening", "nomor rekening", "transfer", "bca", "mandiri", "pembayaran", "bank", "penipuan"]
    },
    {
      id: "snip-6",
      title: "Ketentuan Pengiriman & Jasa Ekspedisi Kargo",
      category: "Ketentuan Pengiriman",
      content: "Pilihan pengiriman pesanan PT. Panca Prima Wijaya:\n1. Armada Truk Pengiriman Kantor: Khusus area Jabodetabek dan sekitarnya sesuai jadwal rute reguler gudang.\n2. Jasa Ekspedisi Kargo Rekanan: Melayani pengiriman ke seluruh Indonesia via Indah Logistik Kargo, Dakota Cargo, Baraka Sarana Tama, J&T Cargo, atau ekspedisi langganan pilihan pelanggan.\n3. Pengambilan Mandiri (Self Pick-up): Dapat diambil langsung di Gudang Pusat kami dengan konfirmasi Surat Jalan dari tim Sales.",
      keywords: ["pengiriman", "kirim", "ongkir", "kargo", "ekspedisi", "dakota", "indah kargo", "baraka", "gudang", "ambil sendiri"]
    },
    {
      id: "snip-7",
      title: "Ketentuan Garansi & Prosedur Retur Barang",
      category: "Garansi & Retur",
      content: "Ketentuan klaim garansi dan pengembalian barang (retur):\n1. Komplain ketidaksesuaian atau cacat produk dapat diajukan maksimal 3x24 jam sejak barang diterima dari kurir/ekspedisi.\n2. Wajib melampirkan video unboxing lengkap tanpa jeda dan foto label Surat Jalan / Invoice pembelian.\n3. Retur berlaku untuk barang cacat produksi pabrik atau ketidaksesuaian ukuran/tipe dengan Surat Pesanan (PO).\n4. Barang pengganti yang baru akan segera dikirimkan tanpa biaya tambahan bagi pelanggan.",
      keywords: ["garansi", "retur", "klaim", "komplain", "rusak", "cacat", "tukar", "ganti baru"]
    }
  ];

  public static readonly DEFAULT_CLEAN_PRODUCTS = [
    {
      id: "prod-1",
      productName: "Plastik Sungkup Pertanian UV",
      description: "Plastik sungkup transparan berkualitas tinggi dengan proteksi anti-UV untuk perlindungan optimal tanaman cabai, semangka, dan melon dari hama serta guyuran hujan ekstrem.",
      price: "Rp 450.000 / Roll (Ukuran 1m x 200m)",
      keywords: ["plastik sungkup", "sungkup", "uv", "pertanian", "tutup tanaman", "plastik uv"],
      faq: [
        { q: "Berapa lama ketahanan plastik sungkup ini di lapangan?", a: "Plastik sungkup kami memiliki aditif stabilizer UV dengan ketahanan pemakaian hingga 2-3 musim tanam normal." },
        { q: "Apakah bisa custom ukuran lebar roll?", a: "Bisa, untuk pembelian kuantitas proyek kami melayani pemotongan ukuran custom." }
      ]
    },
    {
      id: "prod-2",
      productName: "Mulsa Plastik Hitam Perak (MPHP)",
      description: "Mulsa pertanian dua lapis (sisi hitam menekan gulma, sisi perak memantulkan sinar matahari untuk menghalau kutu daun dan hama trips). Sangat ulet dan tidak mudah sobek.",
      price: "Rp 385.000 / Roll (Tebal 0.35 mikron)",
      keywords: ["mulsa", "hitam perak", "mphp", "plastik mulsa", "gulma", "bedengan"],
      faq: [
        { q: "Apa fungsi sisi perak pada mulsa?", a: "Sisi perak menghadap ke atas untuk memantulkan sinar matahari sehingga suhu tanah stabil dan mengusir serangga hama." }
      ]
    },
    {
      id: "prod-3",
      productName: "Insect Net / Kasa Nyamuk Hijau 50 Mesh",
      description: "Jaring kasa pelindung greenhouse berbahan monofilament HDPE murni, kerapatan 50 mesh anti-serangga kecil tanpa menghambat sirkulasi udara dan cahaya tanaman.",
      price: "Rp 1.250.000 / Roll (3m x 100m)",
      keywords: ["insect net", "kasa hijau", "greenhouse", "jaring serangga", "kutu kebul"],
      faq: [
        { q: "Apakah tahan terhadap terpaan angin kencang?", a: "Ya, anyaman monofilament kami memiliki jahitan rajut kuat berpola kunci (lock-stitch) sehingga tidak mudah robek melebar." }
      ]
    }
  ];

  public static readonly DEFAULT_SYSTEM_PROMPT = `# SYSTEM PROMPT — AI CUSTOMER SERVICE WHATSAPP

## 1. Peran
Kamu adalah customer service profesional yang ramah, komunikatif, solutif, dan natural. Tujuanmu adalah membantu pelanggan menyelesaikan kebutuhannya, bukan sekadar menjawab FAQ.

## 2. Gaya percakapan
- Berkomunikasilah seperti staf CS manusia yang berpengalaman.
- Pahami maksud pelanggan meskipun kalimatnya tidak lengkap, terdapat typo, bahasa informal, singkatan, atau bahasa campuran.
- Gunakan konteks percakapan sebelumnya untuk memahami pertanyaan lanjutan.
- Jawab dengan penjelasan yang cukup, relevan, dan mudah dipahami.
- Jangan selalu menjawab dengan satu kalimat jika pelanggan membutuhkan penjelasan.
- Jangan terlalu panjang jika pertanyaannya sederhana.
- Hindari mengulang salam, memperkenalkan diri, atau menawarkan bantuan yang sama pada setiap pesan.
- Jangan memaksa pelanggan mengikuti alur percakapan yang kaku.
- Jangan terus-menerus menawarkan untuk menghubungi admin.

## 3. Cara memahami pertanyaan
Sebelum menjawab:
1. Identifikasi kebutuhan utama pelanggan.
2. Periksa konteks pesan sebelumnya.
3. Cari informasi relevan di knowledge base.
4. Gabungkan informasi relevan dari beberapa dokumen jika diperlukan.
5. Jawab sesuai maksud pertanyaan, bukan hanya berdasarkan kecocokan kata kunci.
6. Jika pertanyaan belum jelas, tanyakan satu hal yang paling penting untuk memperjelasnya.

## 4. Aturan ketika informasi tidak ditemukan
Jangan langsung melakukan fallback hanya karena jawaban tidak ditemukan secara persis di knowledge base.

Gunakan urutan berikut:
1. Cari sinonim, istilah terkait, dan informasi yang memiliki makna serupa.
2. Periksa percakapan sebelumnya dan informasi pelanggan yang tersedia.
3. Gunakan informasi perusahaan yang relevan untuk menyusun jawaban.
4. Jika memungkinkan, jelaskan hal yang sudah diketahui dan tandai bagian yang belum dapat dipastikan.
5. Jika maksud pelanggan belum jelas, tanyakan klarifikasi.
6. Eskalasikan ke admin hanya jika masalah benar-benar membutuhkan informasi, kewenangan, atau tindakan manusia.

## 5. Batasan fakta
- Jangan mengarang harga, diskon, stok, spesifikasi, garansi, jadwal, kebijakan, atau janji perusahaan.
- Bedakan fakta dari asumsi.
- Pengetahuan umum boleh digunakan untuk menjelaskan konsep umum, tetapi jangan menjadikannya sebagai fakta resmi perusahaan.
- Jika sebagian informasi tersedia, jawab bagian tersebut terlebih dahulu.
- Jangan mengklaim telah memesan, mengirim, mengubah data, atau menghubungi admin jika tindakan tersebut belum benar-benar dilakukan.

## 6. Aturan fallback
Fallback bukan jawaban default.
Jangan menggunakan kalimat "Maaf, saya tidak tahu" atau "Silakan hubungi admin" hanya karena pertanyaan tidak tercantum sebagai FAQ.

Jika informasi belum lengkap:
- Jelaskan apa yang sudah diketahui.
- Sampaikan dengan jujur bagian yang perlu dikonfirmasi.
- Tanyakan informasi tambahan jika dapat membantu.
- Tawarkan bantuan admin jika memang diperlukan atau diminta pelanggan.

Jika eskalasi diperlukan, jelaskan alasannya secara singkat dan jangan berpura-pura bahwa admin sudah menerima percakapan sebelum sistem mengonfirmasinya.

## 7. Tujuan percakapan
Utamakan penyelesaian kebutuhan pelanggan, pemahaman konteks, komunikasi natural, akurasi informasi, dan pengalaman pelanggan yang baik.

Jangan menjadikan jumlah pesan, panjang jawaban, atau keberhasilan menemukan FAQ sebagai tujuan utama. Tujuan utama adalah membantu pelanggan sampai kebutuhannya jelas dan mendapatkan solusi yang tepat.`;

  public aiSettings: WAISettings = {
    autoReplyEnabled: true,
    botName: "Customer Assistant AI",
    systemInstructions: WAService.DEFAULT_SYSTEM_PROMPT,
    toneOfVoice: "Sangat Ramah, Bersahabat & Solutif",
    tone: "Sangat Ramah, Bersahabat & Solutif",
    responseLanguage: "Bahasa Indonesia",
    greetingMessage: "Halo! Selamat datang di WhatsApp resmi PT. Panca Prima Wijaya 😊 Senang bisa terhubung dengan Kakak. Ada yang bisa kami bantu seputar produk pertanian kami atau informasi pemesanan hari ini?",
    fallbackMessage: "Mohon maaf ya Kak, untuk informasi spesifik terkait hal tersebut saat ini di luar panduan resmi kami 🙏 Sekadar informasi, di PT. Panca Prima Wijaya kami merupakan spesialis penyedia sarana pertanian & perkebunan berkualitas, seperti Plastik Sungkup UV, Mulsa Hitam Perak (MPHP), dan Insect Net kasa hijau. Apakah Kakak ingin melihat katalog produk atau penawaran harga kami?",
    restrictedTopics: [
      "Isu SARA, politik, dan konten sensitif",
      "Perbandingan atau menjelekkan kompetitor lain",
      "Membocorkan harga modal internal atau rahasia supplier pabrik",
      "Menjanjikan diskon khusus sepihak tanpa persetujuan tim sales resmi",
      "Data pribadi karyawan di luar nomor kontak layanan resmi"
    ],
    handoverToHuman: {
      enabled: true,
      triggerKeywords: ["bicara dengan manusia", "hubungi sales", "komplain", "bicara cs", "customer service", "mau telpon", "bisa bicara sales", "minta nomor sales", "keluhan barang"],
      handoverContact: "0811-1234-5678",
      handoverMessage: "Baik Kak {name}, obrolan Anda telah kami teruskan langsung ke Sales & CS Specialist kami di nomor WhatsApp {contact}. Tim kami akan segera menghubungi Kakak secara langsung ya."
    },
    salesCta: {
      enabled: true,
      ctaMessage: "Apakah Kakak ingin kami buatkan Surat Penawaran Harga resmi (Quotation) untuk kebutuhan ini?",
      triggerKeywords: ["harga", "pesan", "order", "quotation", "penawaran", "katalog", "stok", "beli", "minimal order", "sample", "sampel"]
    },
    knowledgeProducts: WAService.DEFAULT_CLEAN_PRODUCTS,
    knowledgeSnippets: WAService.DEFAULT_CLEAN_KNOWLEDGE_SNIPPETS,
    knowledgeWebSources: [
      {
        id: "kb-web-1",
        url: "https://pancaprima.co.id",
        title: "Website Resmi PT. Panca Prima Wijaya",
        summary: "Situs web portal resmi untuk melihat portofolio produk sarana pertanian modern, sertifikasi mutu, visi misi perseroan, dan informasi kantor pusat serta gudang distribusi di Indonesia.",
        isActive: true,
        updatedAt: Date.now()
      }
    ],
    knowledgeBase: WAService.DEFAULT_CLEAN_PRODUCTS,
    logs: []
  };

  constructor() {
    this.loadSettings();
    this.loadKnownNumbers();
    this.loadAllChats();
  }

  /**
   * Helper to get cleaned phone string for the currently connected phone or fallback
   */
  public getConnectedPhoneKey(overridePhone?: string | null): string {
    if (!overridePhone || overridePhone === "active") {
      const raw = this.userPhone || "default";
      return raw.replace(/[^a-zA-Z0-9]/g, "");
    }
    return overridePhone.replace(/[^a-zA-Z0-9]/g, "");
  }

  private loadKnownNumbers() {
    try {
      if (fs.existsSync(CONNECTED_NUMBERS_FILE)) {
        const raw = fs.readFileSync(CONNECTED_NUMBERS_FILE, "utf-8");
        const list: string[] = JSON.parse(raw);
        list.forEach(n => this.knownConnectedPhones.add(n));
      }
    } catch (e) {
      console.error("[waService] Error loading known connected numbers:", e);
    }
  }

  private saveKnownNumbers() {
    try {
      const list = Array.from(this.knownConnectedPhones);
      fs.writeFileSync(CONNECTED_NUMBERS_FILE, JSON.stringify(list, null, 2), "utf-8");
    } catch (e) {
      console.error("[waService] Error saving known connected numbers:", e);
    }
  }

  private getChatFilePath(phone: string): string {
    const clean = phone.replace(/[^a-zA-Z0-9]/g, "");
    return clean === "default" 
      ? CHATS_FILE 
      : path.resolve(`./wa-chats-${clean}.json`);
  }

  private async loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        const products = parsed.knowledgeProducts || parsed.knowledgeBase || this.aiSettings.knowledgeProducts;
        this.aiSettings = {
          ...this.aiSettings,
          ...parsed,
          knowledgeProducts: products,
          knowledgeBase: products,
          knowledgeSnippets: parsed.knowledgeSnippets || this.aiSettings.knowledgeSnippets,
          knowledgeWebSources: parsed.knowledgeWebSources || this.aiSettings.knowledgeWebSources,
          restrictedTopics: parsed.restrictedTopics || this.aiSettings.restrictedTopics,
          handoverToHuman: { ...this.aiSettings.handoverToHuman, ...(parsed.handoverToHuman || {}) },
          salesCta: { ...this.aiSettings.salesCta, ...(parsed.salesCta || {}) },
          toneOfVoice: parsed.toneOfVoice || parsed.tone || this.aiSettings.toneOfVoice,
          responseLanguage: parsed.responseLanguage || this.aiSettings.responseLanguage,
          systemInstructions: parsed.systemInstructions || this.aiSettings.systemInstructions
        };
      }

      // Sync dari Supabase app_settings jika tersedia
      if (supabaseServer) {
        try {
          const { data, error } = await supabaseServer
            .from("app_settings")
            .select("value")
            .eq("key", "wa_ai_settings")
            .maybeSingle();
          if (data && data.value && !error) {
            const dbVal = data.value;
            const products = dbVal.knowledgeProducts || dbVal.knowledgeBase || this.aiSettings.knowledgeProducts;
            // Merge snippets by ID/title so local updates are not lost
            const mergedSnippets = [...(dbVal.knowledgeSnippets || [])];
            for (const localS of (this.aiSettings.knowledgeSnippets || [])) {
              if (!mergedSnippets.some(s => s.id === localS.id || s.title.toLowerCase() === localS.title.toLowerCase())) {
                mergedSnippets.push(localS);
              }
            }

            this.aiSettings = {
              ...this.aiSettings,
              ...dbVal,
              knowledgeProducts: products,
              knowledgeBase: products,
              knowledgeSnippets: mergedSnippets,
              knowledgeWebSources: dbVal.knowledgeWebSources || this.aiSettings.knowledgeWebSources
            };
            console.log("[waService] Berhasil sinkronisasi AI settings dari Supabase app_settings.");
          }
        } catch (dbErr) {
          // Abaikan jika tabel belum ada di Supabase
        }
      }
    } catch (e) {
      console.error("[waService] Error loading WA AI settings:", e);
    }
  }

  public async saveSettings(newSettings: Partial<WAISettings>) {
    try {
      this.aiSettings = { ...this.aiSettings, ...newSettings };
      if (newSettings.knowledgeProducts) {
        this.aiSettings.knowledgeBase = newSettings.knowledgeProducts;
      }
      if (newSettings.toneOfVoice) {
        this.aiSettings.tone = newSettings.toneOfVoice;
      }
      // 1. Simpan ke file lokal wa-ai-settings.json
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.aiSettings, null, 2), "utf-8");

      // 2. Dual-Persistence: simpan juga ke tabel Supabase app_settings jika terhubung
      if (supabaseServer) {
        try {
          await supabaseServer.from("app_settings").upsert({
            key: "wa_ai_settings",
            value: this.aiSettings,
            updated_at: new Date().toISOString(),
            updated_by: "wa_service"
          }, { onConflict: "key" });
          console.log("[waService] Berhasil menyimpan AI settings ke Supabase app_settings.");
        } catch (dbErr) {
          console.warn("[waService] Supabase app_settings sync skipped:", dbErr);
        }
      }
    } catch (e) {
      console.error("[waService] Error saving WA AI settings:", e);
    }
  }

  public async resetKnowledgeToBase() {
    this.aiSettings.knowledgeSnippets = [...WAService.DEFAULT_CLEAN_KNOWLEDGE_SNIPPETS];
    this.aiSettings.knowledgeProducts = [...WAService.DEFAULT_CLEAN_PRODUCTS];
    this.aiSettings.knowledgeBase = [...WAService.DEFAULT_CLEAN_PRODUCTS];
    this.aiSettings.knowledgeWebSources = [
      {
        id: "web-1",
        url: "https://pancaprima.co.id",
        title: "Website Portal Resmi PT. Panca Prima Wijaya",
        summary: "Website portal utama yang memuat profil perseroan, sertifikasi mutu, visi misi, serta jaringan kantor cabang dan gudang distribusi di seluruh wilayah Indonesia.",
        isActive: true,
        updatedAt: Date.now()
      }
    ];
    this.aiSettings.fallbackMessage = "Mohon maaf ya Kak, untuk informasi spesifik terkait hal tersebut saat ini di luar panduan resmi kami 🙏 Sekadar informasi, di PT. Panca Prima Wijaya kami merupakan spesialis penyedia sarana pertanian & perkebunan berkualitas, seperti Plastik Sungkup UV, Mulsa Hitam Perak (MPHP), dan Insect Net kasa hijau. Apakah Kakak ingin melihat katalog produk atau penawaran harga kami?";
    await this.saveSettings(this.aiSettings);
    return this.aiSettings;
  }

  /**
   * Menghasilkan pesan fallback yang ramah, fleksibel, bervariasi, dan selalu mengarahkan ke layanan & produk perusahaan
   */
  public generateDynamicFallbackMessage(senderName: string, userMessage: string, fallbackCount: number = 1): string {
    const variations = [
      `Mohon maaf ya Kak ${senderName}, untuk informasi terkait hal tersebut saat ini di luar cakupan panduan resmi kami 🙏\n\nSekadar informasi, di *PT. Panca Prima Wijaya* kami merupakan produsen & distributor sarana pertanian dan perkebunan berkualitas, seperti:\n• Plastik Sungkup Pertanian UV (anti-hama & cuaca ekstrem)\n• Mulsa Plastik Hitam Perak / MPHP (penahan gulma & penstabil suhu tanah)\n• Insect Net / Kasa Hijau 50 Mesh (pelindung greenhouse)\n\nApakah Kakak ingin melihat katalog produk kami, cek daftar harga, atau ada kebutuhan pertanian tertentu yang bisa kami bantu jelaskan? 😊`,

      `Waduh mohon maaf Kak ${senderName}, detail mengenai hal tersebut belum tercatat di data panduan kami 🙏\n\nPerusahaan kami, *PT. Panca Prima Wijaya*, berfokus pada pengadaan perlengkapan perkebunan modern dan produk pertanian unggulan (Plastik Sungkup UV, Mulsa Hitam Perak, dan Insect Net anti-serangga).\n\nApakah Kakak tertarik untuk melihat spesifikasi produk kami atau penawaran harga resmi? Siap kami bantu dengan senang hati ya!`,

      `Mohon maaf atas keterbatasan informasi kami Kak ${senderName}, hal tersebut di luar spesialisasi produk kami 🙏\n\nDi *PT. Panca Prima Wijaya*, kami siap melayani kebutuhan aneka sarana produksi agrikultur dan greenhouse dengan jaminan mutu dan pengiriman kargo ke seluruh Indonesia.\n\nApakah Kakak berkenan kami buatkan penawaran harga atau ingin melihat katalog produk pertanian kami terlebih dahulu?`,

      `Terima kasih sudah bertanya Kak ${senderName}. Namun mohon maaf, untuk informasi tersebut belum tersedia di sistem kami 🙏\n\nSebagai gambaran, kami di *PT. Panca Prima Wijaya* menyediakan aneka perlengkapan pertanian berkualitas seperti Plastik Sungkup UV, Mulsa MPHP, dan Insect Net.\n\nApakah ada hal lain seputar produk atau ketentuan pemesanan kami yang ingin Kakak tanyakan? Kami siap melayani! 😊`
    ];

    const idx = Math.abs(userMessage.length + fallbackCount) % variations.length;
    let reply = variations[idx];

    if (fallbackCount >= 3) {
      reply += `\n\nBtw Kak ${senderName}, karena kebutuhan Kakak memerlukan info khusus di luar panduan sistem saya, apakah Kakak ingin obrolan ini langsung saya alihkan ke tim Customer Service / Sales kami agar dibantu secara personal? (Ketik *Ya / Boleh* jika berkenan 😊)`;
    }

    return reply;
  }

  /**
   * Loads chats for all known connected numbers from local files & Supabase
   */
  private loadAllChats() {
    // 1. Load default chat file
    this.loadChatsForPhone("default");

    // 2. Load any known numbers
    this.knownConnectedPhones.forEach(phone => {
      this.loadChatsForPhone(phone);
    });

    // 3. Scan directory for existing wa-chats-*.json files
    try {
      const files = fs.readdirSync(path.resolve("."));
      files.forEach(f => {
        if (f.startsWith("wa-chats-") && f.endsWith(".json")) {
          const phone = f.replace("wa-chats-", "").replace(".json", "");
          this.knownConnectedPhones.add(phone);
          this.loadChatsForPhone(phone);
        }
      });
      this.saveKnownNumbers();
    } catch (err) {
      console.error("[waService] Error scanning chat files:", err);
    }

    // 4. Asynchronously pull from Supabase if configured
    this.syncAllChatsFromSupabase().catch(err => {
      console.warn("[waService] Supabase initial chat sync notice:", err.message);
    });
  }

  /**
   * Load chats for a specific connected number
   */
  public loadChatsForPhone(phone: string) {
    const cleanPhone = this.getConnectedPhoneKey(phone);
    const filePath = this.getChatFilePath(cleanPhone);

    let phoneMap = this.chatsByPhone.get(cleanPhone);
    if (!phoneMap) {
      phoneMap = new Map();
      this.chatsByPhone.set(cleanPhone, phoneMap);
    }

    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const list: WAChat[] = JSON.parse(raw);
        list.forEach(c => {
          c.connectedPhone = cleanPhone;
          const cleanInfo = this.sanitizePhoneAndName(c.phone || c.jid || c.id, c.name);
          c.phone = cleanInfo.phone;
          if (cleanInfo.name && cleanInfo.name !== cleanInfo.phone) {
            c.name = cleanInfo.name;
          }
          phoneMap!.set(c.jid || c.id, c);
        });
        if (cleanPhone !== "default") {
          this.knownConnectedPhones.add(cleanPhone);
          this.saveKnownNumbers();
        }
      }
    } catch (e) {
      console.error(`[waService] Error loading chats for phone ${cleanPhone}:`, e);
    }
  }

  /**
   * Saves chats for a given connected phone number to local file and Supabase
   */
  public async saveChatsForPhone(phone?: string, singleChat?: WAChat) {
    const cleanPhone = this.getConnectedPhoneKey(phone);
    const phoneMap = this.chatsByPhone.get(cleanPhone);
    if (!phoneMap) return;

    const list = Array.from(phoneMap.values());
    const filePath = this.getChatFilePath(cleanPhone);

    // Save local file
    try {
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
      if (cleanPhone !== "default") {
        this.knownConnectedPhones.add(cleanPhone);
        this.saveKnownNumbers();
        // Also keep master wa-chats.json updated
        fs.writeFileSync(CHATS_FILE, JSON.stringify(list, null, 2), "utf-8");
      }
    } catch (e) {
      console.error(`[waService] Error writing chats file for ${cleanPhone}:`, e);
    }

    // Sync to Supabase cloud database if available
    if (supabaseServer) {
      try {
        const chatsToSync = singleChat ? [singleChat] : list;
        for (const c of chatsToSync) {
          const cleanJid = c.jid || c.id;
          const assignedUser = (c as any).assignedUser || (cleanPhone === this.getConnectedPhoneKey() ? this.userName : null);
          await supabaseServer.from("wa_chats").upsert({
            id: `${cleanPhone}_${cleanJid}`,
            connected_phone: cleanPhone,
            jid: cleanJid,
            name: c.name || "",
            phone: c.phone || "",
            unread_count: c.unreadCount || 0,
            last_message: c.lastMessage || "",
            last_message_time: c.lastMessageTime || Date.now(),
            messages: c.messages || [],
            assigned_user: assignedUser || null,
            updated_at: new Date().toISOString()
          });
        }
      } catch (dbErr: any) {
        console.warn(`[waService] Supabase cloud sync error for ${cleanPhone}:`, dbErr.message);
      }
    }
  }

  /**
   * Pull all chats from Supabase database to populate local cache
   */
  public async syncAllChatsFromSupabase(filterPhone?: string) {
    if (!supabaseServer) return;

    try {
      let query = supabaseServer.from("wa_chats").select("*").order("last_message_time", { ascending: false });
      if (filterPhone && filterPhone !== "all" && filterPhone !== "active") {
        const clean = this.getConnectedPhoneKey(filterPhone);
        query = query.eq("connected_phone", clean);
      }

      const { data, error } = await query;
      if (error) {
        console.warn("[waService] Supabase fetch error:", error.message);
        return;
      }

      if (data && Array.isArray(data)) {
        for (const row of data) {
          const phone = row.connected_phone || "default";
          let phoneMap = this.chatsByPhone.get(phone);
          if (!phoneMap) {
            phoneMap = new Map();
            this.chatsByPhone.set(phone, phoneMap);
          }

          const cleanInfo = this.sanitizePhoneAndName(row.phone || row.jid, row.name);

          const chatObj: WAChat & { assignedUser?: string } = {
            id: row.jid,
            jid: row.jid,
            name: cleanInfo.name,
            phone: cleanInfo.phone,
            unreadCount: row.unread_count || 0,
            lastMessage: row.last_message || "",
            lastMessageTime: Number(row.last_message_time) || Date.now(),
            messages: Array.isArray(row.messages) ? row.messages : [],
            connectedPhone: phone,
            assignedUser: row.assigned_user || ""
          };

          phoneMap.set(row.jid, chatObj);
          this.knownConnectedPhones.add(phone);
        }
        this.saveKnownNumbers();
        console.log(`[waService] Synced ${data.length} chats from Supabase across known numbers.`);
      }
    } catch (err: any) {
      console.warn("[waService] Error syncing from Supabase:", err.message);
    }
  }

  /**
   * Backward compatible getter for default chats
   */
  public get chats(): Map<string, WAChat> {
    const key = this.getConnectedPhoneKey();
    let map = this.chatsByPhone.get(key);
    if (!map) {
      map = new Map();
      this.chatsByPhone.set(key, map);
    }
    return map;
  }

  public saveChats() {
    this.saveChatsForPhone(this.getConnectedPhoneKey());
  }

  /**
   * Delete a chat by JID for a specific connected number or across all phone maps
   */
  public async deleteChat(jid: string, connectedPhone?: string) {
    const cleanPhone = this.getConnectedPhoneKey(connectedPhone);
    
    // Remove from in-memory maps
    if (connectedPhone && connectedPhone !== "all") {
      const phoneMap = this.chatsByPhone.get(cleanPhone);
      if (phoneMap) {
        phoneMap.delete(jid);
      }
      this.saveChatsForPhone(cleanPhone);
    } else {
      // Remove across all phone maps
      this.chatsByPhone.forEach((phoneMap, phoneKey) => {
        if (phoneMap.has(jid)) {
          phoneMap.delete(jid);
          this.saveChatsForPhone(phoneKey);
        }
      });
    }

    // Delete from Supabase Cloud Database
    if (supabaseServer) {
      try {
        if (connectedPhone && connectedPhone !== "all") {
          await supabaseServer
            .from("wa_chats")
            .delete()
            .eq("connected_phone", cleanPhone)
            .eq("jid", jid);
        } else {
          await supabaseServer
            .from("wa_chats")
            .delete()
            .eq("jid", jid);
        }
      } catch (err: any) {
        console.warn("[waService] Supabase delete error:", err.message);
      }
    }
  }

  /**
   * Get chats for a specific connected number or current active session or all numbers
   */
  public getChats(connectedPhone?: string): WAChat[] {
    if (connectedPhone === "all") {
      const allChatsMap = new Map<string, WAChat>();
      this.chatsByPhone.forEach((phoneMap) => {
        phoneMap.forEach((chat) => {
          const existing = allChatsMap.get(chat.jid);
          if (!existing || chat.lastMessageTime > existing.lastMessageTime) {
            allChatsMap.set(chat.jid, chat);
          }
        });
      });
      return Array.from(allChatsMap.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    }

    const key = this.getConnectedPhoneKey(connectedPhone);
    let map = this.chatsByPhone.get(key);

    if ((!map || map.size === 0) && key !== "default") {
      // If requested phone has no chats yet, check default
      const defaultMap = this.chatsByPhone.get("default");
      if (defaultMap && defaultMap.size > 0) {
        return Array.from(defaultMap.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
      }
    }

    if (!map) return [];
    return Array.from(map.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  }

  /**
   * Returns metadata of all known connected numbers with chat counts and assigned user info
   */
  public getKnownNumbers(): { phone: string; active: boolean; chatCount: number; assignedUser?: string; lastActive?: number }[] {
    const activeClean = this.userPhone ? this.getConnectedPhoneKey(this.userPhone) : null;
    const allPhones = new Set<string>(this.knownConnectedPhones);
    if (activeClean && activeClean !== "default") allPhones.add(activeClean);
    allPhones.delete("default");

    return Array.from(allPhones)
      .filter(phone => phone && phone !== "default")
      .map(phone => {
        const map = this.chatsByPhone.get(phone);
        const chatCount = map ? map.size : 0;
        let assignedUser = "";
        let lastActive = 0;
        if (map && map.size > 0) {
          const firstChat = Array.from(map.values())[0];
          assignedUser = (firstChat as any).assignedUser || "";
          lastActive = Math.max(...Array.from(map.values()).map(c => c.lastMessageTime || 0));
        }

        return {
          phone,
          active: Boolean(activeClean && phone === activeClean),
          chatCount,
          assignedUser: assignedUser || (phone === activeClean ? (this.userName || "User WA") : ""),
          lastActive: lastActive || Date.now()
        };
      });
  }

  /**
   * Clears all stored WA chat data and connected numbers from memory, files, and Supabase
   */
  public async clearAllData() {
    this.chatsByPhone.clear();
    this.knownConnectedPhones.clear();

    try {
      const files = fs.readdirSync(path.resolve("."));
      files.forEach(f => {
        if ((f.startsWith("wa-chats") || f.startsWith("wa-connected-numbers")) && f.endsWith(".json")) {
          try {
            fs.unlinkSync(path.resolve(".", f));
          } catch (e) {}
        }
      });
    } catch (err) {
      console.error("[waService] Error clearing local JSON files:", err);
    }

    if (supabaseServer) {
      try {
        await supabaseServer.from("wa_chats").delete().neq("id", "none");
      } catch (dbErr: any) {
        console.warn("[waService] Supabase clear error:", dbErr.message);
      }
    }

    console.log("[waService] All WhatsApp chats and connected numbers cleared.");
  }

  /**
   * Helper to format raw JID or LID strings into clean Indonesian phone numbers (08...)
   */
  public sanitizePhoneAndName(jidOrPhone?: string, name?: string, altJid?: string, pushName?: string): { phone: string; name: string } {
    let target = jidOrPhone || "";
    if (altJid && (altJid.endsWith("@s.whatsapp.net") || altJid.includes("62") || altJid.replace(/[^0-9]/g, "").length >= 8)) {
      target = altJid;
    }

    let rawDigits = target.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");

    // Check fallback sources for digits if target was LID or empty
    if (!rawDigits || rawDigits.length < 8) {
      if (jidOrPhone) {
        const jDigits = jidOrPhone.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
        if (jDigits.length >= 8) rawDigits = jDigits;
      }
    }
    if (!rawDigits || rawDigits.length < 8) {
      if (name) {
        const nDigits = name.replace(/[^0-9]/g, "");
        if (nDigits.length >= 8 && nDigits.length <= 15) rawDigits = nDigits;
      }
      if ((!rawDigits || rawDigits.length < 8) && pushName) {
        const pDigits = pushName.replace(/[^0-9]/g, "");
        if (pDigits.length >= 8 && pDigits.length <= 15) rawDigits = pDigits;
      }
    }

    if (rawDigits && rawDigits.length >= 8 && rawDigits.length <= 15) {
      let formattedPhone = rawDigits;
      if (formattedPhone.startsWith("62")) {
        formattedPhone = "0" + formattedPhone.slice(2);
      } else if (!formattedPhone.startsWith("0")) {
        formattedPhone = "0" + formattedPhone;
      }

      const isCleanName = (str?: string) => str && !str.includes("@lid") && !str.includes("@s.whatsapp.net") && !str.includes("@g.us");
      const displayName = isCleanName(name) ? name! : (isCleanName(pushName) ? pushName! : formattedPhone);

      return { phone: formattedPhone, name: displayName };
    }

    const isCleanName = (str?: string) => str && !str.includes("@lid") && !str.includes("@s.whatsapp.net") && !str.includes("@g.us");
    const fallbackName = isCleanName(name) ? name! : (isCleanName(pushName) ? pushName! : (jidOrPhone || "Pengguna WhatsApp"));
    const fallbackPhone = rawDigits && rawDigits.length >= 6 ? rawDigits : fallbackName;

    return { phone: fallbackPhone, name: fallbackName };
  }

  public async initBaileys(force = false): Promise<string | null> {
    if (!force && this.connectionState === "connected") {
      return this.qrCodeBase64;
    }

    if (!force && this.connectionState === "connecting" && this.socket && !this.isQRExpired() && this.qrCodeBase64) {
      return this.qrCodeBase64;
    }

    // Clean up previous socket if forcing reinit or if previous session was expired
    if (this.socket) {
      try {
        this.socket.ev?.removeAllListeners?.();
        this.socket.end?.();
      } catch (e) {}
      this.socket = null;
    }

    if (force) {
      try {
        if (fs.existsSync(SESSION_DIR)) {
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        }
      } catch (e) {}
      this.qrCodeBase64 = null;
    }

    this.connectionState = "connecting";
    this.qrExpired = false;

    try {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const useMultiFileAuthState = baileys.useMultiFileAuthState;
      const DisconnectReason = baileys.DisconnectReason;

      const pino = (await import("pino")).default;
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
      const Browsers = baileys.Browsers || (baileys as any).default?.Browsers;

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
        browser: Browsers ? Browsers.ubuntu("Chrome") : ["Ubuntu", "Chrome", "20.0.04"],
        keepAliveIntervalMs: 25000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 2000
      });

      this.socket.ev.on("creds.update", saveCreds);

      const connectionPromise = new Promise<string | null>((resolve) => {
        let hasResolved = false;
        const resolveOnce = (val: string | null) => {
          if (!hasResolved) {
            hasResolved = true;
            resolve(val);
          }
        };

        const timeoutId = setTimeout(() => {
          resolveOnce(this.qrCodeBase64);
        }, 7000);

        this.socket.ev.on("connection.update", async (update: any) => {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            try {
              this.qrCodeBase64 = await QRCode.toDataURL(qr);
              this.qrTimestamp = Date.now();
              this.qrVersion = (this.qrVersion || 0) + 1;
              this.qrExpired = false;
              this.connectionState = "connecting";
              console.log(`[waService] QR Code refreshed (version ${this.qrVersion}) at ${new Date().toLocaleTimeString()}`);
              clearTimeout(timeoutId);
              resolveOnce(this.qrCodeBase64);
              this.persistStatus().catch(() => {});
            } catch (err) {
              console.error("[waService] Error generating QR data URL:", err);
            }
          }

          if (connection === "close") {
            const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;

            console.log(`[waService] Koneksi tertutup. Status: ${statusCode}, isLoggedOut: ${isLoggedOut}, isRestartRequired: ${isRestartRequired}`);

            try {
              this.socket?.ev?.removeAllListeners?.();
            } catch (e) {}
            this.socket = null;

            if (isLoggedOut || statusCode === 401) {
              console.log("[waService] Sesi WhatsApp logout (401). Menghapus kredensial sesi.");
              this.connectionState = "disconnected";
              this.qrCodeBase64 = null;
              this.qrExpired = true;
              this.userPhone = null;
              this.userJid = null;
              try {
                if (fs.existsSync(SESSION_DIR)) {
                  fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                }
              } catch (err) {}
              this.persistStatus().catch(() => {});
              clearTimeout(timeoutId);
              resolveOnce(null);
              return;
            } else if (isRestartRequired || statusCode === 428 || (statusCode && statusCode !== 408 && statusCode !== 401 && !this.userPhone)) {
              console.log(`[waService] Scan handshake berhasil diterima (status: ${statusCode}). Melanjutkan proses masuk...`);
              this.connectionState = "connecting";
              this.qrExpired = false;
              setTimeout(() => this.initBaileys(false), 1000);
            } else if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
              if (!this.userPhone) {
                this.qrExpired = true;
                this.connectionState = "disconnected";
                console.log(`[waService] Barcode tidak di-scan sampai timeout (${statusCode}). Meminta muat ulang.`);
              } else {
                this.connectionState = "connecting";
                setTimeout(() => this.initBaileys(false), 3000);
              }
            } else {
              console.log(`[waService] Putus koneksi sementara (status: ${statusCode}). Menyambungkan kembali...`);
              this.connectionState = "connecting";
              setTimeout(() => this.initBaileys(false), 2000);
            }
          }

          if (connection === "open") {
            this.connectionState = "connected";
            this.qrCodeBase64 = null;
            this.qrExpired = false;
            const user = this.socket?.user;
            this.userJid = user?.id || null;
            
            let rawConnectedPhone = "";
            if (user?.id) {
              const cleanId = user.id.split(":")[0].split("@")[0];
              if (!user.id.includes("@lid") || cleanId.length <= 13) {
                rawConnectedPhone = cleanId.replace(/[^0-9]/g, "");
              }
            }
            if (!rawConnectedPhone && (user as any)?.phone) {
              rawConnectedPhone = String((user as any).phone).replace(/[^0-9]/g, "");
            }
            let cleanPhoneNum = rawConnectedPhone || (user?.id ? user.id.split(":")[0].replace(/[^0-9]/g, "") : null);
            if (cleanPhoneNum && cleanPhoneNum.startsWith("62")) {
              cleanPhoneNum = "0" + cleanPhoneNum.slice(2);
            }
            this.userPhone = cleanPhoneNum;
            this.userName = user?.name || "WhatsApp Business Bot";

            console.log(`[waService] WhatsApp Connected! Nomor Terhubung: ${this.userPhone}`);
            if (this.userPhone) {
              const clean = this.getConnectedPhoneKey(this.userPhone);
              this.knownConnectedPhones.add(clean);
              this.saveKnownNumbers();
              this.loadChatsForPhone(clean);
            }
            clearTimeout(timeoutId);
            resolveOnce(null);
          }
        });
      });

      this.socket.ev.on("messages.upsert", async (m: any) => {
        if (!m.messages || !m.messages.length) return;
        if (m.type !== "notify" && m.type !== "append") return;

        for (const msg of m.messages) {
          if (!msg.message) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

          // Unwrap modern WhatsApp messages (ephemeral, viewOnce, documentWithCaption)
          let messageContent = msg.message;
          if (messageContent.ephemeralMessage?.message) {
            messageContent = messageContent.ephemeralMessage.message;
          }
          if (messageContent.viewOnceMessage?.message) {
            messageContent = messageContent.viewOnceMessage.message;
          }
          if (messageContent.viewOnceMessageV2?.message) {
            messageContent = messageContent.viewOnceMessageV2.message;
          }
          if (messageContent.documentWithCaptionMessage?.message) {
            messageContent = messageContent.documentWithCaptionMessage.message;
          }

          let text = messageContent.conversation || 
                     messageContent.extendedTextMessage?.text || 
                     "";
          let incomingMedia: WAChatMedia | undefined = undefined;

          if (messageContent.imageMessage) {
            text = messageContent.imageMessage.caption || "📷 [Foto]";
            incomingMedia = {
              type: "image",
              mimetype: messageContent.imageMessage.mimetype || "image/jpeg"
            };
          } else if (messageContent.documentMessage) {
            const fileName = messageContent.documentMessage.fileName || "Dokumen";
            text = messageContent.documentMessage.caption || `📄 [${fileName}]`;
            incomingMedia = {
              type: "document",
              fileName,
              mimetype: messageContent.documentMessage.mimetype || "application/octet-stream"
            };
          } else if (messageContent.videoMessage) {
            text = messageContent.videoMessage.caption || "🎥 [Video]";
            incomingMedia = {
              type: "video",
              mimetype: messageContent.videoMessage.mimetype || "video/mp4"
            };
          } else if (messageContent.audioMessage) {
            text = "🎵 [Pesan Suara]";
            incomingMedia = {
              type: "audio",
              mimetype: messageContent.audioMessage.mimetype || "audio/ogg"
            };
          }

          if (!text && !incomingMedia) continue;

          const isFromMe = Boolean(msg.key.fromMe);

          // Extract real phone number when WhatsApp sends LID JID
          const altJid = msg.key?.remoteJidAlt || msg.key?.participant || msg.participant;
          const cleanInfo = this.sanitizePhoneAndName(remoteJid, undefined, altJid, msg.pushName);
          const senderName = isFromMe 
            ? (this.userName || "Anda") 
            : (cleanInfo.name || msg.pushName || cleanInfo.phone || "Pengguna WhatsApp");

          const connectedPhone = this.getConnectedPhoneKey();
          let phoneMap = this.chatsByPhone.get(connectedPhone);
          if (!phoneMap) {
            phoneMap = new Map();
            this.chatsByPhone.set(connectedPhone, phoneMap);
          }

          let chat = phoneMap.get(remoteJid);
          if (!chat && altJid) {
            chat = phoneMap.get(altJid);
          }

          if (!chat) {
            chat = {
              id: remoteJid,
              jid: remoteJid,
              name: isFromMe ? cleanInfo.name : senderName,
              phone: cleanInfo.phone,
              unreadCount: 0,
              lastMessage: text,
              lastMessageTime: Date.now(),
              messages: [],
              connectedPhone
            };
            phoneMap.set(remoteJid, chat);
          } else {
            chat.phone = cleanInfo.phone;
            if (!isFromMe && senderName && senderName !== cleanInfo.phone) {
              chat.name = senderName;
            }
          }

          const newMsg: WAChatMessage = {
            id: msg.key.id || "msg-" + Date.now(),
            fromMe: isFromMe,
            sender: isFromMe ? "me" : remoteJid,
            senderName,
            text,
            timestamp: Date.now(),
            status: isFromMe ? "read" : "unread",
            media: incomingMedia
          };

          const isDup = chat.messages.some(existing => {
            if (msg.key?.id && existing.id === msg.key.id) return true;
            if (existing.fromMe === isFromMe && existing.text === text) {
              const diff = Math.abs((existing.timestamp || Date.now()) - Date.now());
              if (diff < 8000) return true;
            }
            return false;
          });

          if (!isDup) {
            chat.messages.push(newMsg);
          }
          chat.lastMessage = text;
          chat.lastMessageTime = Date.now();
          if (!isFromMe) chat.unreadCount += 1;

          console.log(`[waService] Pesan baru (${isFromMe ? 'Keluar' : 'Masuk'}) dari ${remoteJid}: "${text}"`);

          // Save to local file & Supabase for this connected phone
          this.saveChatsForPhone(connectedPhone, chat);

          // Auto reply AI logic: hanya balas jika pesan masuk bukan dari diri sendiri dan bot aktif
          if (!isFromMe && this.aiSettings.autoReplyEnabled) {
            this.handleAIAutoReply(remoteJid, senderName, text);
          }
        }
      });

      return await connectionPromise;
    } catch (err) {
      console.error("[waService] Failed to initialize Baileys:", err);
      this.connectionState = "disconnected";
      QRCode.toDataURL("https://mypanca-crm.app/wa-connect-" + Date.now()).then(qr => {
        this.qrCodeBase64 = qr;
      });
    }
  }

  public setChatHandover(jid: string, isHandedOver: boolean): boolean {
    const connectedPhone = this.getConnectedPhoneKey();
    let phoneMap = this.chatsByPhone.get(connectedPhone) || this.chatsByPhone.get("default");
    if (!phoneMap) return false;
    let chat = phoneMap.get(jid) || Array.from(phoneMap.values()).find(c => c.jid === jid || c.id === jid);
    if (chat) {
      chat.isHandedOverToHuman = isHandedOver;
      if (!isHandedOver) {
        chat.fallbackCount = 0;
        chat.waitingHandoverConsent = false;
      }
      this.saveChatsForPhone(connectedPhone, chat);
      return true;
    }
    return false;
  }

  public async generateAIResponse(
    senderName: string, 
    userMessage: string,
    recentHistory?: { role: 'user' | 'model'; text: string }[]
  ): Promise<{
    replyText: string;
    modelUsed: string;
    isHandover: boolean;
    isRestricted: boolean;
    isFallback: boolean;
    containerMatched: 'products' | 'snippets' | 'websites' | 'guardrail' | 'handover' | 'greeting' | 'fallback';
  }> {
    const msgLower = userMessage.toLowerCase().trim();
    let replyText = "";
    let modelUsed = "Basis Pengetahuan & Aturan Cerdas";
    let isHandover = false;
    let isRestricted = false;
    let isFallback = false;
    let containerMatched: 'products' | 'snippets' | 'websites' | 'guardrail' | 'handover' | 'greeting' | 'fallback' = 'fallback';

    // 1. CEK TOPIK TERLARANG (RESTRICTED TOPICS)
    const restrictedList = this.aiSettings.restrictedTopics || [];
    for (const topic of restrictedList) {
      if (!topic.trim()) continue;
      const topicLower = topic.toLowerCase();
      const topicTerms = topicLower
        .split(/[,|;/]+|\b(?:atau|dan)\b/)
        .map(t => t.trim().replace(/^(?:isu|membocorkan|menjanjikan|perbandingan|konten|rahasia)\s+/i, '').trim())
        .filter(t => t.length >= 3);

      const hit = topicTerms.some(term => msgLower.includes(term)) ||
        (topicLower.includes("modal") && (msgLower.includes("modal") || msgLower.includes("harga modal"))) ||
        (topicLower.includes("sara") && msgLower.includes("sara")) ||
        (topicLower.includes("politik") && msgLower.includes("politik")) ||
        (topicLower.includes("kompetitor") && (msgLower.includes("kompetitor") || msgLower.includes("pesaing")));

      if (hit) {
        isRestricted = true;
        modelUsed = "Guardrail (Topik Terlarang)";
        containerMatched = 'guardrail';
        replyText = `Mohon maaf Kak ${senderName}, kami tidak dapat memberikan tanggapan terkait topik tersebut demi mematuhi kebijakan dan etika layanan resmi kami. Silakan tanyakan hal lain seputar informasi produk, penawaran harga, atau layanan PT. Panca Prima Wijaya ya.`;
        break;
      }
    }

    // 2. CEK PENGALIHAN MANUAL KE AGEN MANUSIA (KEYWORD TRIGGER)
    if (!replyText && this.aiSettings.handoverToHuman?.enabled) {
      const triggers = this.aiSettings.handoverToHuman.triggerKeywords || [];
      const isHandoverTriggered = triggers.some(trg => trg.trim() && msgLower.includes(trg.trim().toLowerCase()));
      if (isHandoverTriggered) {
        isHandover = true;
        modelUsed = "Handover CS / Sales Manusia";
        containerMatched = 'handover';
        const contact = this.aiSettings.handoverToHuman.handoverContact || "0811-1234-5678";
        const template = this.aiSettings.handoverToHuman.handoverMessage || 
          "Baik Kak {name}, percakapan Anda kami teruskan langsung ke Sales & CS Specialist kami di nomor {contact}. Tim kami akan segera merespons secara langsung ya.";
        replyText = template
          .replace(/{contact}/g, contact)
          .replace(/{name}/g, senderName);
      }
    }

    // 3. PENANGANAN PERCAKAPAN HUMANIS & NATURAL (SAPAAN, INGIN BERTANYA, TERIMA KASIH, CHITCHAT)
    if (!replyText) {
      const cleanMsg = msgLower.replace(/[?!.,;:"'()\[\]\/\\]/g, ' ').trim();
      const cleanWords = cleanMsg.split(/\s+/).filter(Boolean);

      // Kata kunci sapaan dan salam umum Indonesia
      const greetingTokens = [
        'halo', 'hai', 'hi', 'hei', 'helo', 'hallo', 'oy', 'woi', 'p',
        'pagi', 'siang', 'sore', 'malam',
        'assalam', 'assalamualaikum', 'assalamu alaikum', 'assalamu\'alaikum',
        'permisi', 'sampurasun', 'punten', 'kulonuwun',
        'tes', 'test', 'ping', 'salam'
      ];

      // Cek apakah ada sapaan di awal kata atau dalam kalimat
      const hasGreetingWord = greetingTokens.some(g => {
        if (cleanWords.includes(g)) return true;
        if (cleanMsg.startsWith(g)) return true;
        return false;
      }) || (cleanWords[0] === 'selamat' && ['pagi', 'siang', 'sore', 'malam', 'datang', 'hari'].includes(cleanWords[1]));

      // Cek apakah ada topik spesifik yang nyata ditanyakan
      const hasSpecificTopic = cleanMsg.includes("harga") || cleanMsg.includes("retur") || cleanMsg.includes("garansi") || 
        cleanMsg.includes("rekening") || cleanMsg.includes("kirim") || cleanMsg.includes("ongkir") || cleanMsg.includes("produk") || 
        cleanMsg.includes("mulsa") || cleanMsg.includes("sungkup") || cleanMsg.includes("net") || cleanMsg.includes("faktur") || 
        cleanMsg.includes("kantor") || cleanMsg.includes("jam") || cleanMsg.includes("transfer") || cleanMsg.includes("pesan") || 
        cleanMsg.includes("beli") || cleanMsg.includes("katalog") || cleanMsg.includes("stok") || cleanMsg.includes("order");

      // A. Intensi ingin bertanya / membuka obrolan tanpa topik spesifik ("saya mau tanya nih", "mau nanya dong", "boleh tanya?", dll)
      const isAskingToAsk = !hasSpecificTopic && (
        /^(?:saya\s+)?(?:mau|ingin|bisa|boleh|pengen|mo|mw)\s+(?:tanya|nanya|bertanya|konsul|konsultasi|minta\s+info|bantu)/i.test(cleanMsg) ||
        /\b(?:mau|bisa|boleh)\s+(?:tanya|nanya|bertanya)\b/i.test(cleanMsg) ||
        cleanMsg === "mau tanya" || cleanMsg === "mau nanya" || cleanMsg === "tanya dong" || cleanMsg === "nanya dong" ||
        cleanMsg.includes("mau tanya nih") || cleanMsg.includes("mau nanya nih") || cleanMsg.includes("mau tanya dong") || 
        cleanMsg.includes("ada yang mau saya tanyakan") || cleanMsg.includes("ada yang mau ditanyakan") ||
        cleanMsg === "saya mau tanya" || cleanMsg === "mau konsultasi" || (cleanWords.length <= 5 && cleanMsg.includes("tanya"))
      );

      // B. Sapaan murni tanpa pertanyaan spesifik
      const isGreetingOnly = (hasGreetingWord || cleanMsg.startsWith("selamat")) && !hasSpecificTopic && cleanWords.length <= 9;

      // C. Ucapan terima kasih
      const isGratitude = /^(?:terima\s*kasih|makasih|tengkyu|thanks|matur\s*nuwun|syukron|arigato)\b/i.test(cleanMsg) ||
        cleanMsg.includes("terima kasih") || cleanMsg.includes("makasih");

      // D. Konfirmasi santai
      const isAck = /^(?:oke|ok|siap|baik|noted|sip|mantap|paham|mengerti|yep|yup)\b/i.test(cleanMsg) && cleanWords.length <= 4;

      // E. Cek admin / robot
      const isBotCheck = /\b(?:apakah\s+(?:ini\s+)?(?:bot|robot|ai)|ini\s+(?:bot|robot|ai)|ada\s+orang|admin(?:nya)?\s+aktif)\b/i.test(cleanMsg);

      if (isAskingToAsk) {
        replyText = `Halo Kak ${senderName}! Tentu boleh banget, silakan mau tanya tentang apa nih? 😊 Apakah seputar produk pertanian kami (seperti Plastik Sungkup UV, Mulsa MPHP, Insect Net), penawaran harga, atau prosedur pemesanan? Siap kami bantu dengan senang hati ya!`;
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Percakapan Pembuka)";
      } else if (isGreetingOnly) {
        let timeSalutation = "hari ini";
        if (cleanMsg.includes("pagi")) timeSalutation = "pagi";
        else if (cleanMsg.includes("siang")) timeSalutation = "siang";
        else if (cleanMsg.includes("sore")) timeSalutation = "sore";
        else if (cleanMsg.includes("malam")) timeSalutation = "malam";

        const greetingReplies = [
          `Halo Kak ${senderName}! Selamat ${timeSalutation} dan selamat datang di layanan WhatsApp resmi PT. Panca Prima Wijaya 😊 Senang sekali bisa terhubung dengan Kakak. Ada yang bisa kami bantu seputar produk pertanian atau layanan kami hari ini?`,
          `Halo Kak ${senderName}! Selamat ${timeSalutation} 😊 Terima kasih telah menghubungi PT. Panca Prima Wijaya. Silakan, ada yang ingin ditanyakan seputar produk kami (Plastik Sungkup UV, Mulsa Hitam Perak, Insect Net) atau layanan pemesanan?`,
          `Hai Kak ${senderName}! Senang bisa melayani Kakak hari ini 😊 Ada yang bisa kami bantu seputar informasi produk, harga, atau pengadaan sarana pertanian PT. Panca Prima Wijaya?`
        ];
        replyText = greetingReplies[Math.abs(cleanWords.length) % greetingReplies.length];
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Sapaan)";
      } else if (isGratitude) {
        replyText = `Sama-sama Kak ${senderName}! Senang bisa membantu. Jika ada hal lain yang ingin ditanyakan lagi nanti, jangan sungkan untuk hubungi kami kembali ya. Semoga hari Kakak menyenangkan! 🙏😊`;
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Terima Kasih)";
      } else if (isAck) {
        replyText = `Siap Kak ${senderName}! Jika ada yang butuh dipastikan lagi atau ingin order, langsung kabari kami ya 😊`;
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Konfirmasi)";
      } else if (isBotCheck) {
        replyText = `Halo Kak ${senderName}! Saya asisten cerdas WhatsApp PT. Panca Prima Wijaya. Saya siap merespons pertanyaan seputar produk, harga, dan ketentuan layanan secara cepat. Jika Kakak membutuhkan bantuan langsung dari tim CS atau Sales manusia, cukup sampaikan saja ya 😊`;
        containerMatched = 'greeting';
        isFallback = false;
        modelUsed = "Asisten CS Ramah (Info Layanan)";
      }
    }

    // 4. SUSUN KNOWLEDGE BASE SEBAGAI PARAGRAF & KONTEN RINGKAS
    if (!replyText) {
      const snippets = this.aiSettings.knowledgeSnippets || [];
      const products = this.aiSettings.knowledgeProducts?.length 
        ? this.aiSettings.knowledgeProducts 
        : (this.aiSettings.knowledgeBase || []);
      const webSources = (this.aiSettings.knowledgeWebSources || []).filter(w => w.isActive);

      const knowledgeSections: string[] = [];

      // Semua dokumen disusun menjadi Paragraf & Konten Pengetahuan yang bersih dan fokus
      snippets.forEach((s, idx) => {
        knowledgeSections.push(`[PARAGRAF DOKUMEN #${idx + 1}: ${s.title.toUpperCase()}${s.category ? ` - ${s.category}` : ''}]\n${s.content}`);
      });

      // Produk juga disajikan sebagai paragraf konten yang to-the-point
      products.forEach((p, idx) => {
        let text = `[PARAGRAF PRODUK #${idx + 1}: ${p.productName.toUpperCase()}]\n${p.description}\nEstimasi Harga: ${p.price}`;
        if (p.faq && p.faq.length > 0) {
          text += `\nDetail: ` + p.faq.map(f => `${f.q}: ${f.a}`).join(' | ');
        }
        knowledgeSections.push(text);
      });

      // Sumber web juga disajikan sebagai paragraf konten
      webSources.forEach((w, idx) => {
        knowledgeSections.push(`[PARAGRAF REFERENSI #${idx + 1}: ${w.title}]\n${w.summary}`);
      });

      const fullKnowledgeText = knowledgeSections.join("\n\n---\n\n");

      const tone = this.aiSettings.toneOfVoice || this.aiSettings.tone || "Sangat Ramah, Bersahabat & Solutif";
      const lang = this.aiSettings.responseLanguage || "Bahasa Indonesia";

      const fullSystemPrompt = `PERAN & IDENTITAS:
Anda adalah Customer Service WhatsApp resmi dari PT. Panca Prima Wijaya.
Gaya komunikasi Anda: Sangat ramah, bersahabat, hangat, sopan, luwes, dan mengalir natural selayaknya staf CS manusia asli Indonesia yang melayani pelanggan dengan senyuman (BUKAN robot kaku, BUKAN siaran broadcast formal).
Bahasa respon: ${lang}. Nada bicara: ${tone}.
Sapa nama pelanggan dengan santun (misal: "Halo Kak ${senderName}" atau "Baik Kak ${senderName}").

PRINSIP JAWABAN (SANGAT KRUSIAL - PATUHI SECARA KETAT):
1. PERCAKAPAN PEMBUKA & BASA-BASI HUMANIS:
   - Jika pengguna menyapa (halo, hai, pagi, siang, sore, malam, assalamualaikum, salam, permisi, p, dsb), basa-basi pembuka, atau mengatakan "mau tanya dong", balaslah dengan SANGAT HANGAT, RAMAH, dan LUWES selayaknya CS manusia yang menyambut pelanggan.
   - DILARANG KERAS menganggap sapaan pembuka sebagai fallback! DILARANG KERAS membubuhkan tag [FALLBACK_TAG] pada sapaan!

2. FOKUS HANYA PADA APA YANG DITANYAKAN:
   - Jika pengguna bertanya tentang Aturan A (misalnya: aturan garansi, tata cara retur, rekening transfer, spesifikasi produk tertentu, atau jam buka kantor), jelaskan HANYA hal tersebut secara tuntas, padat, dan jelas (1-2 paragraf pendek).
   - DILARANG KERAS menyertakan informasi aturan lain yang tidak ditanyakan (misal: jangan beri nomor rekening jika hanya tanya harga, jangan beri aturan retur jika hanya tanya jam kerja).

3. ATURAN FALLBACK DINAMIS & FLEKSIBEL (JIKA DITANYA HAL DI LUAR CATATAN BASIS PENGETAHUAN):
   - Jika pengguna bertanya hal faktual yang TIDAK TERCANTUM di Catatan Basis Pengetahuan perusahaan (misalnya produk non-pertanian, rekomendasi di luar bisnis perusahaan, hal pribadi, atau topik yang tidak diketahui):
     * JANGAN HANYA MINTA MAAF KAKU ATAU BERKATA TIDAK TAHU!
     * Berikan balasan FALLBACK YANG DINAMIS, FLEKSIBEL, DAN EDUKATIF:
       a. Sampaikan maaf secara santun atas keterbatasan informasi mengenai topik yang ditanyakan.
       b. Arahkan dan perkenalkan secara luwes bahwa PT. Panca Prima Wijaya berfokus menyediakan sarana pertanian & perkebunan berkualitas tinggi, seperti: Plastik Sungkup Pertanian UV, Mulsa Plastik Hitam Perak (MPHP), Insect Net Kasa Hijau anti-hama, dan peralatan greenhouse.
       c. Ajukan pertanyaan penutup yang fleksibel dan bersahabat (misalnya: "Apakah Kakak ingin melihat katalog produk kami, cek daftar harga, atau ada kebutuhan pertanian tertentu yang bisa kami bantu jelaskan?").
     * Buatlah kalimat yang mengalir luwes, alami, dan bervariasi (tidak kaku seperti template mesin).
     * Wajib akhiri balasan fallback dengan tag rahasia: [FALLBACK_TAG] (kode rahasia ini otomatis dihapus oleh sistem).

=== CATATAN BASIS PENGETAHUAN PERUSAHAAN (PARAGRAF & KONTEN) ===
${fullKnowledgeText || "Belum ada dokumen pengetahuan yang dimasukkan."}
`;

      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        // Susun payload dengan riwayat pesan sebelumnya agar Gemini memahami alur percakapan multi-turn
        const contentsPayload: any[] = [];
        if (recentHistory && recentHistory.length > 0) {
          for (const h of recentHistory) {
            if (h.text && h.text.trim()) {
              contentsPayload.push({
                role: h.role,
                parts: [{ text: h.text }]
              });
            }
          }
        }
        contentsPayload.push({
          role: "user",
          parts: [{ text: userMessage }]
        });

        const modelCandidates = ["gemini-3.8-flash", "gemini-2.5-flash"];
        for (const candidate of modelCandidates) {
          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: contentsPayload,
                systemInstruction: { parts: [{ text: fullSystemPrompt }] },
                generationConfig: { temperature: 0.3, maxOutputTokens: 350 }
              })
            });

            if (res.ok) {
              const data = await res.json();
              const genText = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (genText) {
                let cleanGen = genText.trim();
                if (cleanGen.includes("[FALLBACK_TAG]")) {
                  isFallback = true;
                  cleanGen = cleanGen.replace(/\[FALLBACK_TAG\]/g, "").trim();
                  containerMatched = 'fallback';
                } else {
                  isFallback = false;
                  containerMatched = 'snippets';
                }
                replyText = cleanGen;
                modelUsed = `Gemini AI (${candidate})`;
                break;
              }
            } else {
              console.warn(`[waService] Gemini API (${candidate}) status ${res.status}`);
            }
          } catch (genErr) {
            console.warn(`[waService] Gemini API (${candidate}) error:`, genErr);
          }
        }
      }

      // 4. ATURAN LOKAL CERDAS JIKA GEMINI SEDANG LIMIT / OFFLINE
      if (!replyText) {
        // Gabungkan seluruh snippets paragraf & produk menjadi daftar pengetahuan terpadu
        const allParagraphs: { title: string; category?: string; content: string; keywords: string[] }[] = [];
        snippets.forEach(s => {
          allParagraphs.push({
            title: s.title,
            category: s.category,
            content: s.content,
            keywords: s.keywords || []
          });
        });
        products.forEach(p => {
          let c = `Produk *${p.productName}*\nEstimasi Harga: ${p.price}\nDeskripsi: ${p.description}`;
          if (p.faq && p.faq.length > 0) {
            c += `\nDetail: ` + p.faq.map(f => `${f.q}: ${f.a}`).join(' | ');
          }
          allParagraphs.push({
            title: p.productName,
            category: 'Katalog Produk',
            content: c,
            keywords: p.keywords || []
          });
        });
        webSources.forEach(w => {
          allParagraphs.push({
            title: w.title,
            category: 'Referensi Website',
            content: `${w.title}\n${w.summary}`,
            keywords: [w.title.toLowerCase()]
          });
        });

        // Ekstraksi istilah kata kunci dari pesan pengguna
        const stopWords = new Set([
          'bagaimana', 'apakah', 'gimana', 'minta', 'tolong', 'info', 'bisa', 'saya', 'kami', 
          'untuk', 'dengan', 'yang', 'atau', 'pada', 'tentang', 'soal', 'punya', 'ada', 'dong', 
          'kak', 'bapak', 'ibu', 'halo', 'hai', 'siang', 'pagi', 'sore', 'malam', 'ya', 'saja', 'nya',
          'siapa', 'nama', 'saat', 'ini', 'itu', 'lama', 'tahu', 'hari', 'buat', 'mau', 'pun', 'dari', 
          'ke', 'di', 'dan', 'lah', 'kah', 'sih', 'kok', 'mana', 'kapan', 'kenapa', 'mengapa', 'seperti',
          'apa', 'jika', 'kalau', 'bila', 'oleh', 'akan', 'sudah', 'telah', 'sedang', 'lebih', 'paling'
        ]);

        const queryTerms = msgLower
          .replace(/[?!.,;:"'()\[\]\/\\]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length >= 3 && !stopWords.has(t));

        let bestMatch: { title: string; category?: string; content: string } | null = null;
        let highestScore = 0;

        for (const p of allParagraphs) {
          let score = 0;
          let matchedTitleOrKeyword = false;
          const tLower = p.title.toLowerCase();
          const cLower = p.content.toLowerCase();

          // 1. Cek kata kunci spesifik yang relevan
          for (const kw of p.keywords) {
            if (kw && msgLower.includes(kw.toLowerCase())) {
              score += 7;
              matchedTitleOrKeyword = true;
            }
          }

          // 2. Cek kecocokan istilah pertanyaan di judul (bobot tinggi)
          for (const term of queryTerms) {
            if (tLower.includes(term)) {
              score += 6;
              matchedTitleOrKeyword = true;
            } else if (cLower.includes(term)) {
              score += 2;
            }
          }

          // 3. Cek judul persis jika query singkat
          if (queryTerms.length > 0 && queryTerms.every(term => tLower.includes(term))) {
            score += 10;
            matchedTitleOrKeyword = true;
          }

          // Hanya cocok jika ada kecocokan di judul/keyword atau skor konten sangat tinggi
          if (matchedTitleOrKeyword && score > highestScore && score >= 6) {
            highestScore = score;
            bestMatch = p;
          } else if (!matchedTitleOrKeyword && score > highestScore && score >= 10) {
            highestScore = score;
            bestMatch = p;
          }
        }

        if (bestMatch) {
          // JAWAB HANYA APA YANG DITANYAKAN (RAMAH, BERSAHABAT & TO-THE-POINT)
          replyText = `Halo Kak ${senderName}! Terkait *${bestMatch.title}*:\n\n${bestMatch.content}`;
          containerMatched = 'snippets';
          isFallback = false;
        } else {
          // Cek sapaan salam santai
          const isGreetingCheck = /^(?:halo|hai|hi|hei|helo|pagi|siang|sore|malam|assalam|permisi|selamat|sampurasun|punten|tes|test|p)\b/i.test(msgLower);
          if (isGreetingCheck) {
            replyText = `Halo Kak ${senderName}! Selamat datang di layanan WhatsApp PT. Panca Prima Wijaya 😊 Ada yang bisa kami bantu seputar informasi produk pertanian atau layanan kami hari ini?`;
            containerMatched = 'greeting';
            isFallback = false;
          } else {
            // FALLBACK DINAMIS & FLEKSIBEL (EDUKASI KE LAYANAN/PRODUK PERUSAHAAN)
            replyText = this.generateDynamicFallbackMessage(senderName, userMessage, 1);
            isFallback = true;
            containerMatched = 'fallback';
          }
        }
      }
    }

    return {
      replyText,
      modelUsed,
      isHandover,
      isRestricted,
      isFallback,
      containerMatched
    };
  }

  private simSessions: Map<string, {
    fallbackCount: number;
    waitingHandoverConsent: boolean;
    isHandedOverToHuman: boolean;
  }> = new Map();

  public resetSimSession(sessionId: string = "default-sim") {
    this.simSessions.set(sessionId, {
      fallbackCount: 0,
      waitingHandoverConsent: false,
      isHandedOverToHuman: false
    });
  }

  public async simulateAIAutoReply(
    userMessage: string, 
    senderName: string = "Calon Pelanggan", 
    history?: { role: 'user' | 'model'; text: string }[],
    sessionId: string = "default-sim"
  ) {
    if (!this.simSessions.has(sessionId)) {
      this.resetSimSession(sessionId);
    }
    const session = this.simSessions.get(sessionId)!;

    // 1. Jika sesi simulasi sudah dialihkan ke CS Manusia, AI tidak lagi membalas
    if (session.isHandedOverToHuman) {
      return {
        replyText: `[Percakapan simulasi ini sudah dialihkan dan sedang ditangani oleh CS Manusia. AI otomatis dinonaktifkan untuk obrolan ini.]`,
        modelUsed: "Handover CS Manusia",
        isHandover: true,
        isRestricted: false,
        isFallback: false,
        containerMatched: 'handover' as const,
        isHandedOverToHuman: true,
        fallbackCount: 0,
        waitingHandoverConsent: false
      };
    }

    const msgLower = userMessage.toLowerCase().trim();

    // 2. Cek apakah sedang menunggu persetujuan pengalihan ke CS setelah 3x fallback
    if (session.waitingHandoverConsent) {
      const isConsentYes = /^(ya|iya|boleh|mau|hubungkan|alihkan|tolong|oke|ok|siap|bisa|teruskan|sambungkan|lanjut|y|hubungi|silakan|silahkan)\b/i.test(msgLower) ||
        msgLower === "ya" || msgLower === "boleh" || msgLower === "mau" || msgLower.includes("alihkan") || msgLower.includes("hubungkan") || msgLower.includes("teruskan") || msgLower.includes("hubungi");

      const isConsentNo = /^(tidak|enggak|nggak|batal|jangan|skip|ga usah|gak usah|tdk|no|g|ga|gak)\b/i.test(msgLower) ||
        msgLower.includes("tidak") || msgLower.includes("enggak") || msgLower.includes("nggak") || msgLower.includes("jangan") || msgLower.includes("batal");

      if (isConsentYes && !isConsentNo) {
        session.isHandedOverToHuman = true;
        session.waitingHandoverConsent = false;
        session.fallbackCount = 0;
        return {
          replyText: `Baik Kak ${senderName}, percakapan ini sudah kami alihkan langsung ke tim Customer Service kami ya. Tim kami akan segera merespons dan membantu Kakak secara personal di sini. Mohon ditunggu sebentar ya Kak, terima kasih banyak atas kesabarannya! 🙏`,
          modelUsed: "Handover CS Manusia (Persetujuan User)",
          isHandover: true,
          isRestricted: false,
          isFallback: false,
          containerMatched: 'handover' as const,
          isHandedOverToHuman: true,
          fallbackCount: 0,
          waitingHandoverConsent: false
        };
      } else if (isConsentNo) {
        session.waitingHandoverConsent = false;
        session.fallbackCount = 0;
        return {
          replyText: `Baik Kak ${senderName}, siap! Jika ada pertanyaan lain seputar informasi produk atau layanan kami yang bisa saya bantu, silakan tanyakan ya 😊`,
          modelUsed: "Batal Alihkan CS",
          isHandover: false,
          isRestricted: false,
          isFallback: false,
          containerMatched: 'greeting' as const,
          isHandedOverToHuman: false,
          fallbackCount: 0,
          waitingHandoverConsent: false
        };
      }
    }

    // 3. Hasilkan balasan AI
    const result = await this.generateAIResponse(senderName, userMessage, history);
    let { replyText, modelUsed, isHandover, isRestricted, isFallback, containerMatched } = result;

    if (isFallback) {
      session.fallbackCount = (session.fallbackCount || 0) + 1;
      if (session.fallbackCount >= 3) {
        if (!replyText.includes("hubungkan") && !replyText.includes("alihkan")) {
          replyText += `\n\nBtw Kak ${senderName}, karena saya belum menemukan informasi detail mengenai hal ini, apakah Kakak ingin obrolan ini langsung kami alihkan ke tim Customer Service / Sales kami agar bisa dibantu personal? (Ketik *Ya / Boleh* jika berkenan 😊)`;
        }
        session.waitingHandoverConsent = true;
      }
    } else if (!isRestricted && !isHandover) {
      session.fallbackCount = 0;
      session.waitingHandoverConsent = false;
    }

    return {
      replyText,
      modelUsed,
      isHandover,
      isRestricted,
      isFallback,
      containerMatched,
      fallbackCount: session.fallbackCount,
      waitingHandoverConsent: session.waitingHandoverConsent,
      isHandedOverToHuman: session.isHandedOverToHuman
    };
  }

  public async handleAIAutoReply(jid: string, senderName: string, userMessage: string) {
    try {
      const connectedPhone = this.getConnectedPhoneKey();
      let phoneMap = this.chatsByPhone.get(connectedPhone) || this.chatsByPhone.get("default");
      let chat: WAChat | undefined;
      if (phoneMap) {
        chat = phoneMap.get(jid) || Array.from(phoneMap.values()).find(c => c.jid === jid || c.id === jid);
      }

      // 1. JIKA CHAT SUDAH DIALIHKAN KE CS MANUSIA, BOT TIDAK MEMBALAS LAGI
      if (chat?.isHandedOverToHuman) {
        console.log(`[waService] Percakapan ${jid} sedang ditangani CS Manusia. AI auto-reply dilewati.`);
        return;
      }

      const msgLower = userMessage.toLowerCase().trim();

      // 2. CEK STATUS MENUNGGU PERSETUJUAN PENGALIHAN KE CS (SETELAH 3x FALLBACK)
      if (chat?.waitingHandoverConsent) {
        const isConsentYes = /^(ya|iya|boleh|mau|hubungkan|alihkan|tolong|oke|ok|siap|bisa|teruskan|sambungkan|lanjut|y)\b/i.test(msgLower) ||
          msgLower === "ya" || msgLower === "boleh" || msgLower === "mau" || msgLower.includes("hubungkan") || msgLower.includes("alihkan");
        
        const isConsentNo = /^(tidak|enggak|nggak|batal|jangan|skip|ga usah|gak usah|tdk|no)\b/i.test(msgLower) ||
          msgLower.includes("tidak") || msgLower.includes("enggak") || msgLower.includes("nggak") || msgLower.includes("jangan");

        if (isConsentYes && !isConsentNo) {
          const handoverReply = `Baik Kak ${senderName}, percakapan ini sudah saya alihkan ke tim Customer Service kami. Tim kami akan segera merespons dan membantu Kakak secara langsung di sini ya. Terima kasih banyak atas kesabarannya! 🙏`;
          
          chat.isHandedOverToHuman = true;
          chat.waitingHandoverConsent = false;
          chat.fallbackCount = 0;

          await this.executeSendBotReply(jid, senderName, handoverReply, "Handover CS Manusia (Persetujuan User)", true, false);
          return;
        } else if (isConsentNo) {
          const declineReply = `Baik Kak ${senderName}, siap! Jika ada pertanyaan lain seputar produk atau layanan kami yang bisa saya bantu, silakan tanyakan ya 😊`;
          
          chat.waitingHandoverConsent = false;
          chat.fallbackCount = 0;

          await this.executeSendBotReply(jid, senderName, declineReply, "Batal Alihkan CS", false, false);
          return;
        }
      }

      // 3. AMBIL RIWAYAT PESAN TERAKHIR AGAR MEMAHAMI KONTEKS MULTI-TURN
      const recentHistory: { role: 'user' | 'model'; text: string }[] = [];
      if (chat && chat.messages && chat.messages.length > 0) {
        const priorMsgs = chat.messages.slice(-7, -1);
        for (const m of priorMsgs) {
          if (m.text && m.text.trim()) {
            recentHistory.push({
              role: m.fromMe ? 'model' : 'user',
              text: m.text
            });
          }
        }
      }

      // 4. HASILKAN BALASAN AI
      const result = await this.generateAIResponse(senderName, userMessage, recentHistory);
      let { replyText, modelUsed, isHandover, isRestricted, isFallback } = result;

      // 5. ATURAN FALLBACK 3 KALI -> TAWARKAN PENGALIHAN KE TIM CS MANUSIA
      if (isFallback && chat) {
        chat.fallbackCount = (chat.fallbackCount || 0) + 1;
        console.log(`[waService] Fallback terdeteksi untuk ${jid}, hitungan fallback ke-${chat.fallbackCount}`);
        
        if (chat.fallbackCount >= 3) {
          if (!replyText.includes("hubungkan") && !replyText.includes("alihkan")) {
            replyText += `\n\nBtw Kak ${senderName}, karena saya belum menemukan informasi detail mengenai hal ini, apakah Kakak ingin obrolan ini langsung saya hubungkan ke tim Customer Service / Sales kami agar bisa dibantu personal? (Ketik *Ya / Boleh* jika berkenan 😊)`;
          }
          chat.waitingHandoverConsent = true;
        }
      } else if (chat && !isFallback && !isRestricted && !isHandover) {
        chat.fallbackCount = 0;
        chat.waitingHandoverConsent = false;
      }

      // 6. KIRIM DAN SIMPAN BALASAN
      await this.executeSendBotReply(jid, senderName, replyText, modelUsed, isHandover, isRestricted);
    } catch (err) {
      console.error("[waService] Error in handleAIAutoReply:", err);
    }
  }

  private async executeSendBotReply(jid: string, senderName: string, replyText: string, modelUsed: string, isHandover: boolean, isRestricted: boolean) {
    // 1. Kirim pesan ke socket WhatsApp
    if (this.socket && this.connectionState === "connected") {
      try {
        await this.socket.sendMessage(jid, { text: replyText });
        console.log(`[waService] Berhasil mengirim pesan bot ke ${jid}`);
      } catch (err) {
        console.warn(`[waService] Gagal kirim pesan ke socket WhatsApp:`, err);
      }
    }

    // 2. Simpan pesan ke riwayat chat
    const connectedPhone = this.getConnectedPhoneKey();
    let phoneMap = this.chatsByPhone.get(connectedPhone) || this.chatsByPhone.get("default");
    if (phoneMap) {
      let chat = phoneMap.get(jid) || Array.from(phoneMap.values()).find(c => c.jid === jid || c.id === jid);
      if (chat) {
        chat.messages.push({
          id: "bot-" + Date.now(),
          fromMe: true,
          sender: "bot",
          senderName: this.aiSettings.botName,
          text: replyText,
          timestamp: Date.now(),
          status: "read"
        });
        chat.lastMessage = replyText;
        chat.lastMessageTime = Date.now();
        this.saveChatsForPhone(connectedPhone, chat);
      }
    }

    // 3. Simpan log aktivitas bot
    this.aiSettings.logs.unshift({
      id: "log-" + Date.now(),
      timestamp: Date.now(),
      sender: senderName + " (" + jid.split("@")[0] + ")",
      incoming: "Pesan Pengguna",
      reply: replyText,
      modelUsed,
      isHandover,
      isRestricted
    });
    if (this.aiSettings.logs.length > 50) this.aiSettings.logs.pop();
    this.saveSettings({});
  }

  public async sendMessage(jid: string, text: string, media?: WAChatMedia): Promise<{ success: boolean; message: WAChatMessage }> {
    const connectedPhone = this.getConnectedPhoneKey();
    let phoneMap = this.chatsByPhone.get(connectedPhone);
    if (!phoneMap) {
      phoneMap = new Map();
      this.chatsByPhone.set(connectedPhone, phoneMap);
    }

    const displaySummary = text || (media?.type === 'image' ? '📷 [Foto]' : `📄 [${media?.fileName || 'Dokumen'}]`);

    let chat = phoneMap.get(jid);
    if (!chat) {
      chat = {
        id: jid,
        jid: jid,
        name: jid.split("@")[0],
        phone: "+" + jid.split("@")[0],
        unreadCount: 0,
        lastMessage: displaySummary,
        lastMessageTime: Date.now(),
        messages: [],
        connectedPhone
      };
      phoneMap.set(jid, chat);
    }

    const msg: WAChatMessage = {
      id: "out-" + Date.now(),
      fromMe: true,
      sender: "me",
      text: text || "",
      timestamp: Date.now(),
      status: "read",
      media
    };

    const isDup = chat.messages.some(m => {
      if (m.fromMe && m.text === (text || displaySummary)) {
        const diff = Math.abs((m.timestamp || Date.now()) - Date.now());
        if (diff < 8000) return true;
      }
      return false;
    });

    if (!isDup) {
      chat.messages.push(msg);
    }
    chat.lastMessage = displaySummary;
    chat.lastMessageTime = Date.now();
    chat.unreadCount = 0;
    this.saveChatsForPhone(connectedPhone, chat);

    if (this.socket && this.connectionState === "connected") {
      try {
        if (media && media.data) {
          const rawBase64 = media.data.includes(",") ? media.data.split(",")[1] : media.data;
          const buffer = Buffer.from(rawBase64, "base64");
          if (media.type === "image") {
            await this.socket.sendMessage(jid, {
              image: buffer,
              caption: text || "",
              mimetype: media.mimetype || "image/jpeg"
            });
          } else {
            await this.socket.sendMessage(jid, {
              document: buffer,
              mimetype: media.mimetype || "application/octet-stream",
              fileName: media.fileName || "dokumen",
              caption: text || ""
            });
          }
        } else {
          await this.socket.sendMessage(jid, { text });
        }
      } catch (err) {
        console.error("Failed to send WA message via Baileys socket:", err);
      }
    }

    return { success: true, message: msg };
  }

  public async disconnectSession() {
    if (this.socket) {
      try {
        await this.socket.logout();
      } catch (e) {}
      try {
        this.socket.ev?.removeAllListeners?.();
        this.socket.end?.();
      } catch (e) {}
      this.socket = null;
    }
    this.connectionState = "disconnected";
    this.userJid = null;
    this.userPhone = null;
    this.userName = null;
    this.qrCodeBase64 = null;
    this.qrExpired = true;
    this.qrVersion = 0;
    this.qrTimestamp = 0;

    try {
      if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

export const waService = new WAService();
