
export const WEB_KNOWLEDGE_BASE = {
  "pancaprimawijaya.id": {
    "title": "PT. Panca Prima Wijaya - Main Corporate",
    "description": "Distributor utama solusi penyimpanan komoditas pertanian dan bahan kimia industri di Indonesia.",
    "key_products": [
      "Fumiphos & Phostoxin: Insektisida fumigan untuk hama gudang (biji-bijian, tembakau, pakan ternak).",
      "Silogard: Pelapis kedap udara untuk sanitasi gudang.",
      "K-Obiol: Insektisida cair untuk proteksi biji-bijian.",
      "Sanisol: Disinfektan dan pembersih industri.",
      "Alat pengukur kadar air (Grain Moisture Meter) untuk kopi, cokelat, jagung, dll."
    ],
    "about": "Berfokus pada teknologi pasca panen dan perlindungan stok pangan nasional dengan standar internasional."
  },
  "sensorgempa.com": {
    "title": "Solusi Monitoring Seismik & EWS",
    "description": "Penyedia sistem peringatan dini (Early Warning System) gempa bumi dan monitoring getaran struktur.",
    "solutions": [
      "Seismic Accelerometer: Sensor presisi tinggi untuk mendeteksi getaran gempa bumi.",
      "Industrial EWS: Sistem yang otomatis mematikan mesin/aliran gas saat terjadi gempa kuat (Earthquake Relay).",
      "Structural Health Monitoring (SHM): Monitoring kesehatan gedung, jembatan, dan bendungan.",
      "Geotechnical Monitoring: Sensor pergerakan tanah untuk lereng tambang (Landslide Mitigation).",
      "Network Seismograph: Integrasi data sensor ke jaringan pemantauan regional/pusat."
    ],
    "tech_specs": "Mendukung protokol RS485, Modbus, 4G LTE, dan Radio Telemetry. Akurasi hingga tingkat sub-milimeter."
  },
  "ahlifumigasi.com": {
    "title": "Ahli Fumigasi & Pest Control",
    "description": "Pusat edukasi dan jasa profesional fumigasi di Indonesia.",
    "services": [
      "Fumigasi Gudang: Penanganan hama pada stok pangan dalam jumlah besar.",
      "Fumigasi Kontainer (Ekspor): Syarat wajib pengiriman barang internasional.",
      "Fumigasi Kapal (Vessel Fumigation): Sterilisasi kapal pengangkut komoditas.",
      "Pest Management: Pengendalian tikus, kecoa, dan serangga pengganggu di area industri.",
      "Pelatihan & Sertifikasi: Edukasi cara fumigasi yang aman dan efektif bagi praktisi."
    ],
    "expertise": "Menggunakan teknik standar internasional (AFAS) dan produk bersertifikasi resmi yang aman bagi lingkungan jika digunakan sesuai prosedur."
  }
};

export const generateWebKnowledgeDigest = (userRole: string): string => {
  const normalizedRole = userRole.toLowerCase();
  if (normalizedRole !== 'superadmin' && normalizedRole !== 'sales') {
    return "";
  }

  let digest = "\n=== KNOWLEDGE BASE WEBSITE EKSTERNAL (KHUSUS SUPERADMIN & SALES) ===\n";
  
  Object.values(WEB_KNOWLEDGE_BASE).forEach(site => {
    digest += `\nDOMAIN: ${site.title}\n`;
    digest += `INFO: ${site.description}\n`;
    if ((site as any).key_products) {
      digest += `PRODUK: ${(site as any).key_products.join(', ')}\n`;
    }
    if ((site as any).solutions) {
      digest += `SOLUSI: ${(site as any).solutions.join(', ')}\n`;
    }
    if ((site as any).services) {
      digest += `LAYANAN: ${(site as any).services.join(', ')}\n`;
    }
    if ((site as any).tech_specs) digest += `TEKNIS: ${(site as any).tech_specs}\n`;
    if ((site as any).about) digest += `TENTANG: ${(site as any).about}\n`;
    if ((site as any).expertise) digest += `KEAHLIAN: ${(site as any).expertise}\n`;
  });

  return digest;
};
