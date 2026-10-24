export interface WebKnowledgeSite {
  title: string;
  url: string;
  description: string;
  subsections?: Record<string, {
    title: string;
    focus: string;
    key_points: string[];
    articles_and_guides?: string[];
  }>;
  key_products?: string[];
  solutions?: string[];
  services?: string[];
  tech_specs?: string;
  articles?: string[];
  about?: string;
  expertise?: string;
}

export interface AnswerSource {
  title: string;
  category: 'crm_product' | 'crm_trade' | 'crm_task' | 'crm_qa' | 'web_sensor' | 'web_fumigasi' | 'web_corporate' | 'general';
  url?: string;
  detail: string;
}

export const WEB_KNOWLEDGE_BASE: Record<string, WebKnowledgeSite> = {
  "pancaprimawijaya.id": {
    title: "PT. Panca Prima Wijaya (Official Portal)",
    url: "https://pancaprimawijaya.id/",
    description: "Portal utama PT. Panca Prima Wijaya yang terbagi ke dalam 2 cabang fokus bisnis: Sistem Sensor & Keselamatan Gedung (/sensor) dan Solusi Pasca-Panen Komoditas Pertanian (/panca).",
    subsections: {
      "/sensor": {
        title: "Panca Prima Wijaya - Sensor & Safety Systems (pancaprimawijaya.id/sensor)",
        focus: "Sistem Sensor Gempa Bumi Toyo, Early Warning System (EWS), Real-Time Monitoring System (RTMS), dan Building Management System (BMS).",
        key_points: [
          "Toyo Earthquake Sensors (Toyo Automation Co., Ltd. Jepang): Seri V-207CMX, V-555, V-925, V-858, Vibline, dan Vibcon.",
          "Solusi Keselamatan Lift/Elevator: Integrasi sensor gempa ke kontroler lift. Saat gelombang gempa terdeteksi, sistem otomatis menghentikan lift di lantai terdekat dan membuka pintu secara darurat agar penumpang dapat evakuasi dengan aman tanpa terjebak di poros lift.",
          "Earthquake Relay & BMS: Fitur otomatis mematikan aliran gas industri dan pasokan daya berisiko tinggi saat terjadi guncangan hebat guna mencegah kebakaran sekunder.",
          "Real-Time Monitoring System (RTMS): Monitoring getaran dan kondisi operasional fasilitas secara terus-menerus dengan pengiriman data instan.",
          "Layanan Lift & Eskalator: Pengadaan suku cadang keselamatan, instalasi, kalibrasi, dan perawatan berkala."
        ],
        articles_and_guides: [
          "Artikel: Regulasi dan Standar Keselamatan Gedung Bertingkat Terhadap Bahaya Seismik.",
          "Artikel: Mengapa Lift Membutuhkan Sensor Gempa Otomatis dan Cara Kerjanya.",
          "Panduan: Prosedur Pemasangan dan Kalibrasi Toyo Vibline & Vibcon pada Bangunan Komersial dan Industri."
        ]
      },
      "/panca": {
        title: "Panca Prima Wijaya - Post-Harvest & Agricultural Solutions (pancaprimawijaya.id/panca)",
        focus: "Perlindungan komoditas pasca-panen (beras, jagung, gandum, kedelai, pakan ternak), sanitasi gudang, dan alat uji laboratorium.",
        key_points: [
          "Pelapis Kedap Udara & Gas Silogard / Silogud: Cat pelapis kedap gas untuk dinding, lantai, dan silo guna mencegah hama bersarang di celah mikro gudang.",
          "Terpal Fumigasi Khusus (Heavy-Duty Gas-Tight PVC Tarpaulin): Terpal kedap gas standar internasional untuk sungkup komoditas saat proses fumigasi.",
          "Alat Pengukur Kadar Air (Grain Moisture Meter): Pengukur kadar air akurat untuk biji kopi, kakao, jagung, gabah, dan beras guna memastikan standar penyimpanan aman dari jamur aflatoksin.",
          "Grain Sampling Probe: Tombak pengambil sampel biji-bijian berkualitas tinggi untuk pengujian mutu di lapangan.",
          "Insektisida & Sanitasi: Fumiphos, Silogud 250 EC, K-Obiol, dan Sanisol untuk kebersihan gudang dan pabrik pakan ternak."
        ],
        articles_and_guides: [
          "Artikel: Identifikasi Siklus Hidup Kumbang Bubuk (Tribolium castaneum) dan Kutu Beras (Sitophilus oryzae).",
          "Artikel: Standar Kadar Air Ideal Komoditas Pertanian untuk Mencegah Susut Bobot dan Pembusukan di Gudang.",
          "Panduan: Teknik Sanitasi Ruang Gudang (Space Spraying & Surface Treatment) Sebelum Memasukkan Stok Baru."
        ]
      }
    },
    about: "Penyedia solusi terpadu (one-stop solution) untuk proteksi infrastruktur bangunan modern dan perlindungan ketahanan pangan nasional."
  },
  "pancaprimawijaya.com": {
    title: "PT. Panca Prima Wijaya - Corporate & Trading Hub",
    url: "https://pancaprimawijaya.com/",
    description: "Hub korporat terpadu penyedia produk pestisida resmi berizin Kementan RI, peralatan laboratorium mutu pangan, dan integrasi teknologi keselamatan industri.",
    key_products: [
      "Fumiphos (Fosfin / Phosphine 56 TB): Tablet dan pellet fumigan bersertifikasi resmi untuk basmi hama gudang hingga tuntas (telur, larva, pupa, imago).",
      "Silogud 250 EC: Insektisida kontak untuk sanitasi lingkungan gudang, pengendalian rayap, dan serangga pengganggu.",
      "Laboratorium & Alat Uji: Rice grading machine (mesin pemisah menir/patah beras), grain moisture tester, dan alat uji residu pestisida.",
      "Mesin Pertanian Mini: Mini rice huller (mesin pengupas gabah mini untuk laboratorium dan industri rumahan).",
      "Perlengkapan Industri: Selang fleksibel industri tahan kimia, terpal sungkup kedap gas, dan perlengkapan safety K3 fumigasi.",
      "Teknologi Keselamatan: Suku cadang lift/elevator dan integrasi Early Warning System (EWS)."
    ],
    articles: [
      "Artikel: Cara Menghitung Kebutuhan Dosis Fumiphos Berdasarkan Volume Ruang Gudang (m3).",
      "Artikel: Keunggulan Fosfin Dibandingkan Metode Insektisida Konvensional pada Komoditas Ekspor.",
      "Artikel: Pengendalian Hama Terpadu (IPM) pada Industri Pengolahan Makanan dan Pakan Ternak."
    ],
    about: "Berkantor pusat di Kelapa Gading, Jakarta Utara, melayani distribusi kebutuhan industri pangan, logistik pergudangan, dan gedung di seluruh Indonesia."
  },
  "sensorgempa.com": {
    title: "SensorGempa.com - Pusat Solusi Monitoring Seismik & EWS",
    url: "https://sensorgempa.com/",
    description: "Distributor resmi instrumen deteksi getaran dan gempa bumi dari Toyo Automation Co., Ltd. (Jepang) di Indonesia.",
    solutions: [
      "Seismic Accelerometer Sensor: Sensor akselerometer 3-axis dengan sensitivitas tinggi untuk mendeteksi getaran gempa bumi P-wave (gelombang primer) dan S-wave (gelombang sekunder).",
      "Industrial Earthquake Warning System (EWS): Sistem peringatan dini otomatis dengan output relay kontak kering untuk memutus suplai gas berbahaya, menghentikan mesin pabrik berkecepatan tinggi, dan mengunci sistem kelistrikan darurat.",
      "Integrasi Keselamatan Lift: Modul deteksi gempa yang terhubung langsung dengan kontroler elevator gedung komersial, hotel, rumah sakit, dan apartemen.",
      "Structural Health Monitoring (SHM): Sistem pemantauan getaran berkelanjutan untuk memantau integritas struktural jembatan bentang panjang, bendungan, gedung pencakar langit, dan menara telekomunikasi.",
      "Geotechnical Monitoring: Pemantauan pergeseran lereng tambang dan tanah longsor (Landslide Mitigation)."
    ],
    tech_specs: "Standar industri Jepang (Toyo Automation). Output relay alarm, protokol komunikasi Modbus RTU / RS485, 4G LTE IoT Gateway, dan akurasi pengukuran akselerasi Gal yang presisi sesuai standar SNI gempa.",
    articles: [
      "Artikel: Memahami Satuan Akselerasi Tanah (Gal), Skala MMI, dan Skala Richter dalam Mitigasi Gempa Gedung.",
      "Artikel: Pentingnya P-Wave Detection untuk Memberikan Jeda Evakuasi Sebelum Gelombang Gempa Perusak Datang.",
      "Panduan Teknis: Standar Integrasi Relay Seismik dengan Panel BMS dan PLC Otomasi Industri."
    ]
  },
  "ahlifumigasi.com": {
    title: "AhliFumigasi.com - Jasa Profesional Fumigasi & Pest Control",
    url: "https://ahlifumigasi.com/",
    description: "Pusat layanan jasa profesional fumigasi, pengendalian hama (pest control), dan sanitasi industri berstandar nasional dan internasional dari PT. Panca Prima Wijaya.",
    services: [
      "Fumigasi Gudang Pangan: Penanganan hama gudang skala besar untuk beras, jagung, tembakau, rempah-rempah, dan biji kopi dalam tumpukan palet atau silo kedap gas.",
      "Fumigasi Kontainer Ekspor (FCL & LCL): Sterilisasi komoditas ekspor menggunakan standar karantina internasional AFAS (Australian Fumigation Accreditation Scheme) dan standar Badan Karantina Indonesia.",
      "Fumigasi Kapal (Ship & Vessel Fumigation): Fumigasi palka kapal kargo pengangkut komoditas pangan antar pulau dan internasional.",
      "Penerbitan Sertifikat Resmi: Memberikan Sertifikat Fumigasi resmi yang diakui karantina negara tujuan ekspor, serta pendampingan dokumen Phytosanitary Certificate.",
      "Pest Management & Sanitasi: Pengendalian hama rayap (anti-rayap pra dan pasca konstruksi), tikus gudang (rodent control), kecoa, semut, lalat, kutu kasur, dan serangga pengganggu lainnya.",
      "Penyemprotan Disinfektan Lingkungan: Sterilisasi lingkungan industri, kantor, dan gudang."
    ],
    expertise: "Didukung oleh teknisi berlisensi resmi, APD lengkap (respirator full-face dengan canister filter khusus fosfin), alat ukur konsentrasi gas (gas detector), dan prosedur K3 ketat.",
    articles: [
      "Artikel: Syarat Wajib Fumigasi Kontainer Ekspor Standar AFAS untuk Tujuan Australia dan Negara Ketat Karantina.",
      "Artikel: SOP Keamanan K3 Fumigasi: Prosedur Aerasi dan Uji Bebas Gas Beracun Sebelum Ruang Boleh Dimasuki Manusia.",
      "Panduan: Solusi Mengatasi Hama Gudang yang Resisten (Kebal) Terhadap Bahan Kimia Konvensional Menggunakan Fumiphos."
    ]
  }
};

/**
 * Normalizes user role check.
 * Superadmin, Admin, Sales, Marketing, and variations are authorized to access external web knowledge.
 */
export const isRoleAuthorizedForWebKnowledge = (userRole?: string): boolean => {
  if (!userRole) return false;
  const normalized = userRole.trim().toLowerCase();
  return (
    normalized.includes('superadmin') ||
    normalized.includes('super admin') ||
    normalized.includes('admin') ||
    normalized.includes('sales') ||
    normalized.includes('marketing') ||
    normalized.includes('engineer') ||
    normalized === 'owner' ||
    normalized === 'director'
  );
};

/**
 * Generates an extensive, highly informative digest of external website knowledge.
 * For Engineer: strictly 2 websites (pancaprimawijaya.id/sensor and sensorgempa.com).
 * For Sales & Superadmin: all 4 websites.
 */
export const generateWebKnowledgeDigest = (userRole: string): string => {
  if (!isRoleAuthorizedForWebKnowledge(userRole)) {
    return "";
  }

  const normalized = (userRole || '').trim().toLowerCase();
  const isEngineer = normalized.includes('engineer');

  if (isEngineer) {
    let digest = "\n=== KNOWLEDGE BASE WEBSITE TEKNIS SENSOR & KESELAMATAN (KHUSUS ROLE ENGINEER) ===\n";
    digest += "OTORITAS RESMI ENGINEER:\n";
    digest += "- Role Engineer memiliki wewenang penuh untuk pengetahuan teknis Sistem Sensor Gempa Toyo, EWS, BMS, RTMS, elevator safety, dan Structural Health Monitoring (SHM) yang bersumber dari 2 website resmi: pancaprimawijaya.id/sensor dan sensorgempa.com beserta artikel edukasi seismiknya.\n";
    digest += "- PENTING: Role Engineer TIDAK memiliki akses ke data komersial CRM (transaksi penjualan, omzet, customer/kontak, penawaran, serta harga/stok produk CRM), dan tidak mengakses website fumigasi/trading. Jika engineer bertanya tentang data komersial CRM tersebut, tolak dengan sopan dan arahkan ke modul Task App atau topik teknis sensor gempa.\n";

    // 1. pancaprimawijaya.id/sensor ONLY
    const mainSite = WEB_KNOWLEDGE_BASE["pancaprimawijaya.id"];
    const sensorSub = mainSite.subsections?.["/sensor"];
    digest += `\n[1. SUMBER RESMI: ${sensorSub?.title || 'pancaprimawijaya.id/sensor'} - https://pancaprimawijaya.id/sensor]\n`;
    digest += `FOKUS TEKNIS: ${sensorSub?.focus || 'Sistem Sensor Gempa Toyo, EWS, BMS, & Elevator Safety'}\n`;
    if (sensorSub?.key_points) {
      digest += `POIN UTAMA: ${sensorSub.key_points.join(' | ')}\n`;
    }
    if (sensorSub?.articles_and_guides) {
      digest += `ARTIKEL & PANDUAN: ${sensorSub.articles_and_guides.join(' | ')}\n`;
    }

    // 2. sensorgempa.com
    const sensorSite = WEB_KNOWLEDGE_BASE["sensorgempa.com"];
    digest += `\n[2. SUMBER RESMI: ${sensorSite.title} - ${sensorSite.url}]\n`;
    digest += `DESKRIPSI: ${sensorSite.description}\n`;
    if (sensorSite.solutions) {
      digest += `SOLUSI SEISMIK & EWS: ${sensorSite.solutions.join(' | ')}\n`;
    }
    if (sensorSite.tech_specs) {
      digest += `SPESIFIKASI TEKNIS: ${sensorSite.tech_specs}\n`;
    }
    if (sensorSite.articles) {
      digest += `ARTIKEL MITIGASI SEISMIK: ${sensorSite.articles.join(' | ')}\n`;
    }

    digest += "\nINSTRUKSI PENYINTESISAN JAWABAN ENGINEER:\n";
    digest += "- Berikan jawaban teknis, presisi, mendalam, dan solutif seputar sensor getaran, sensor gempa bumi Toyo, proteksi elevator, EWS, BMS, dan SHM.\n";
    return digest;
  }

  let digest = "\n=== KNOWLEDGE BASE WEBSITE EKSTERNAL PT PANCA PRIMA WIJAYA (OTORITAS RESMI SALES & SUPERADMIN) ===\n";
  digest += "CATATAN PENTING UNTUK AI: Sebagai Sales / Superadmin, pengguna memiliki hak penuh mendapatkan informasi komprehensif, fleksibel, dan solutif dari 4 website resmi di bawah ini beserta sub-halaman dan artikel edukasinya. Dilarang menolak pertanyaan bisnis yang relevan dengan topik-topik ini!\n";

  // 1. pancaprimawijaya.id
  const mainSite = WEB_KNOWLEDGE_BASE["pancaprimawijaya.id"];
  digest += `\n[1. SUMBER RESMI: ${mainSite.title} - ${mainSite.url}]\n`;
  digest += `DESKRIPSI: ${mainSite.description}\n`;
  if (mainSite.subsections) {
    Object.entries(mainSite.subsections).forEach(([path, sub]) => {
      digest += `  * CABANG HALAMAN ${path} (${sub.title}):\n`;
      digest += `    - Fokus: ${sub.focus}\n`;
      digest += `    - Poin Utama & Solusi: ${sub.key_points.join(' | ')}\n`;
      if (sub.articles_and_guides) {
        digest += `    - Referensi Artikel & Panduan: ${sub.articles_and_guides.join(' | ')}\n`;
      }
    });
  }

  // 2. pancaprimawijaya.com
  const corpSite = WEB_KNOWLEDGE_BASE["pancaprimawijaya.com"];
  digest += `\n[2. SUMBER RESMI: ${corpSite.title} - ${corpSite.url}]\n`;
  digest += `DESKRIPSI: ${corpSite.description}\n`;
  if (corpSite.key_products) {
    digest += `  * KATALOG PRODUK & ALAT: ${corpSite.key_products.join(' | ')}\n`;
  }
  if (corpSite.articles) {
    digest += `  * ARTIKEL & EDUKASI TEKNIS: ${corpSite.articles.join(' | ')}\n`;
  }
  if (corpSite.about) {
    digest += `  * TENTANG KORPORAT: ${corpSite.about}\n`;
  }

  // 3. sensorgempa.com
  const sensorSite = WEB_KNOWLEDGE_BASE["sensorgempa.com"];
  digest += `\n[3. SUMBER RESMI: ${sensorSite.title} - ${sensorSite.url}]\n`;
  digest += `DESKRIPSI: ${sensorSite.description}\n`;
  if (sensorSite.solutions) {
    digest += `  * SOLUSI SEISMIK & EWS: ${sensorSite.solutions.join(' | ')}\n`;
  }
  if (sensorSite.tech_specs) {
    digest += `  * SPESIFIKASI TEKNIS: ${sensorSite.tech_specs}\n`;
  }
  if (sensorSite.articles) {
    digest += `  * ARTIKEL & MITIGASI GEMPA: ${sensorSite.articles.join(' | ')}\n`;
  }

  // 4. ahlifumigasi.com
  const fumigasiSite = WEB_KNOWLEDGE_BASE["ahlifumigasi.com"];
  digest += `\n[4. SUMBER RESMI: ${fumigasiSite.title} - ${fumigasiSite.url}]\n`;
  digest += `DESKRIPSI: ${fumigasiSite.description}\n`;
  if (fumigasiSite.services) {
    digest += `  * LAYANAN PROFESIONAL & SERTIFIKASI: ${fumigasiSite.services.join(' | ')}\n`;
  }
  if (fumigasiSite.expertise) {
    digest += `  * STANDAR KEAHLIAN & K3: ${fumigasiSite.expertise}\n`;
  }
  if (fumigasiSite.articles) {
    digest += `  * ARTIKEL TEKNIS & K3 FUMIGASI: ${fumigasiSite.articles.join(' | ')}\n`;
  }

  digest += "\nINSTRUKSI PENYINTESISAN JAWABAN:\n";
  digest += "- Jangan membatasi jawaban secara kaku antar website. Topik gempa/sensor ada di pancaprimawijaya.id/sensor dan sensorgempa.com. Topik fumigasi, pest control, dan pasca panen ada di pancaprimawijaya.id/panca, ahlifumigasi.com, dan pancaprimawijaya.com.\n";
  digest += "- Olah informasi secara mengalir, komprehensif, cerdas, dan langsung menjawab esensi pertanyaan pengguna.\n";

  return digest;
};

/**
 * Dynamically detects the data sources referenced in an AI conversation turn.
 * Adapts to CRM databases (products, transactions, tasks, Q&A) and external web knowledge.
 */
export const detectAnswerSources = (
  query: string,
  responseText: string = '',
  hasDbMatch: { isStock?: boolean; isTrx?: boolean; isTask?: boolean; isQA?: boolean } = {},
  userRole?: string
): AnswerSource[] => {
  const qLower = query.toLowerCase();
  const resLower = responseText.toLowerCase();
  const combined = `${qLower} ${resLower}`;
  const isEngineer = (userRole || '').toLowerCase().includes('engineer');

  const sources: AnswerSource[] = [];
  const addedKeys = new Set<string>();

  const addSource = (key: string, src: AnswerSource) => {
    if (!addedKeys.has(key)) {
      addedKeys.add(key);
      sources.push(src);
    }
  };

  // 1. CRM Products / Stock / Inventory (Only for non-engineers)
  const isProductOrStock =
    !isEngineer &&
    (hasDbMatch.isStock ||
    /\b(stok|stock|harga|produk|product|katalog|lot|gudang|sisa|fumiphos|silogud|silogard|k-obiol|sanisol|probe|moisture)\b/i.test(qLower) ||
    /sisa stok|tersedia sebanyak|stok real-time|database produk|pcs|botol|kaleng|pail|kg|unit/i.test(resLower));

  if (isProductOrStock) {
    addSource('crm_product', {
      title: 'Database Produk & Inventori (CRM)',
      category: 'crm_product',
      detail: 'Data Master Produk, Sisa Stok Real-Time, Harga Resmi, & Katalog Foto MyPanca CRM'
    });
  }

  // 2. CRM Transactions / Sales / Revenue / Customers (Only for non-engineers)
  const isTrxOrSales =
    !isEngineer &&
    (hasDbMatch.isTrx ||
    /\b(transaksi|penjualan|omset|omzet|penawaran|quotation|invoice|tagihan|piutang|pelanggan|customer|lunas|po|pembayaran)\b/i.test(qLower) ||
    /\b(trx-|pp-|inv-|total nominal|status pembayaran|tenggat)/i.test(combined));

  if (isTrxOrSales) {
    addSource('crm_trade', {
      title: 'Data Transaksi & Keuangan (CRM)',
      category: 'crm_trade',
      detail: 'Database Penjualan Real-Time, Penawaran (Quotations), Riwayat Follow-Up, & Rekap Piutang'
    });
  }

  // 3. Task App / Employee Timeline / Project Analysis
  const isTaskOrTimeline =
    hasDbMatch.isTask ||
    /\b(tugas|task|pekerjaan|proyek|project|timeline|progres|progress|kerjaan|evan|marie|rudi|adam|anggota tim|aktivitas)\b/i.test(qLower) ||
    /\b(progres terkini|status pengerjaan|catatan log|maket elevator|maket ews|timeline log)/i.test(combined);

  if (isTaskOrTimeline) {
    addSource('crm_task', {
      title: 'Modul Task App & Timeline Kerja',
      category: 'crm_task',
      detail: 'Sistem Manajemen Tugas, Kronologi Riwayat Aktivitas Harian Tim, & Analisa Proyek'
    });
  }

  // 4. Q&A Forum / Technical Discussions
  const isQA =
    hasDbMatch.isQA ||
    /\b(q&a|tanya jawab|forum diskusi|forum teknis|pertanyaan teknis)\b/i.test(qLower) ||
    /topik diskusi|forum q&a|jawaban teknis/i.test(combined);

  if (isQA) {
    addSource('crm_qa', {
      title: 'Forum Q&A & Technical Knowledge',
      category: 'crm_qa',
      detail: 'Knowledge Base Forum Tanya Jawab Teknis dan Diskusi Internal Perusahaan'
    });
  }

  // 5. Seismic / Earthquake Sensors / EWS / Lift / Building Safety (Allowed for Engineer & Sales/Admin)
  const isSeismicTopic =
    /\b(gempa|seismik|seismic|sensor gempa|toyo|v-207|v-555|v-925|v-858|vibline|vibcon|ews|shm|accelerometer|lift|elevator|gal|mmi|p-wave|s-wave|bms|safety switch|earthquake relay|getaran)\b/i.test(combined);

  if (isSeismicTopic) {
    addSource('pancaprimawijaya_sensor', {
      title: 'pancaprimawijaya.id/sensor',
      category: 'web_sensor',
      url: 'https://pancaprimawijaya.id/sensor',
      detail: 'Toyo Earthquake Sensors, EWS Keselamatan Elevator, RTMS, BMS & Artikel Mitigasi Gempa Gedung'
    });
    addSource('sensorgempa_com', {
      title: 'sensorgempa.com',
      category: 'web_sensor',
      url: 'https://sensorgempa.com',
      detail: 'Pusat Solusi Monitoring Seismik Toyo Jepang, Structural Health Monitoring (SHM) & Standar Gempa'
    });
  }

  // 6. Fumigation / Pest Control / Commodity Storage / AFAS / Tarpaulin / Grain Testing (Only for non-engineers)
  const isFumigasiTopic =
    !isEngineer &&
    /\b(fumigasi|fumigant|fumigan|pest control|hama|kutu beras|kumbang bubuk|sitophilus|tribolium|afas|kontainer|vessel|kapal|phytosanitary|sertifikat fumigasi|gas detector|respirator|aerasi|silogud|silogard|terpal|sampling probe|kadar air|moisture meter)\b/i.test(combined);

  if (isFumigasiTopic) {
    addSource('ahlifumigasi_com', {
      title: 'ahlifumigasi.com',
      category: 'web_fumigasi',
      url: 'https://ahlifumigasi.com',
      detail: 'Jasa Profesional Fumigasi Gudang, Kontainer Ekspor AFAS, Kapal, Sertifikasi Karantina & Pest Control'
    });
    addSource('pancaprimawijaya_panca', {
      title: 'pancaprimawijaya.id/panca',
      category: 'web_fumigasi',
      url: 'https://pancaprimawijaya.id/panca',
      detail: 'Solusi Pasca-Panen Komoditas, Alat Ukur Kadar Air, Terpal Fumigasi PVC & Sanitasi Gudang'
    });
  }

  // 7. Corporate / General One-Stop Solution / Lab Equipment (Only for non-engineers)
  const isCorporateTopic =
    !isEngineer &&
    /\b(profil perusahaan|pancaprimawijaya\.com|one-stop solution|laboratorium pangan|rice grading|rice huller|distributor resmi)\b/i.test(combined);

  if (isCorporateTopic) {
    addSource('pancaprimawijaya_corp', {
      title: 'pancaprimawijaya.com',
      category: 'web_corporate',
      url: 'https://pancaprimawijaya.com',
      detail: 'Hub Korporat Terpadu PT Panca Prima Wijaya, Katalog Pestisida Resmi & Mesin Laboratorium Pertanian'
    });
  }

  // Default fallback if no specific source matched
  if (sources.length === 0) {
    if (isEngineer) {
      addSource('general_task_engineer', {
        title: 'Task App & Knowledge Teknis Sensor',
        category: 'general',
        detail: 'Sistem Manajemen Tugas, Dokumen Teknis, & Solusi Sensor Seismik PT Panca Prima Wijaya'
      });
    } else {
      addSource('general_mypanca', {
        title: 'Sistem Terpadu PT Panca Prima Wijaya',
        category: 'general',
        detail: 'Database Bisnis MyPanca CRM, ERP Operasional, & Pengetahuan Terpadu Perusahaan'
      });
    }
  }

  return sources;
};
