// Catalog of PT. Panca Prima Wijaya with high-fidelity product images & specifications
// Used by Panca AI Chat (/app) and CRM to ensure instant photo availability

export interface PancaProduct {
  id: string;
  kode: string;
  nama: string;
  stok: number;
  minStok: number;
  hargaJual: number;
  satuan: string;
  images: string[];
  specifications: string;
  mainFunction: string;
  mainApplication: string;
  panjang?: number;
  lebar?: number;
  tinggi?: number;
  berat?: number;
  lots?: any[];
}

// Crisp, high-fidelity SVG product graphics for PT Panca Prima Wijaya
const createFumiphosSvg = (): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <defs>
      <linearGradient id="bgFumi" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f0fdf4"/>
        <stop offset="100%" stop-color="#dcfce7"/>
      </linearGradient>
      <linearGradient id="canGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#1e3a8a"/>
        <stop offset="35%" stop-color="#3b82f6"/>
        <stop offset="70%" stop-color="#2563eb"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
      <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="50%" stop-color="#334155"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <filter id="shadowFumi" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="12" stdDeviation="10" flood-opacity="0.18"/>
      </filter>
    </defs>
    <rect width="400" height="400" rx="24" fill="url(#bgFumi)"/>
    <ellipse cx="200" cy="345" rx="90" ry="16" fill="#0f172a" opacity="0.12"/>
    <!-- Bottle Container -->
    <g filter="url(#shadowFumi)">
      <rect x="130" y="110" width="140" height="220" rx="20" fill="url(#canGrad)"/>
      <!-- Cap -->
      <path d="M150 70 L250 70 L245 110 L155 110 Z" fill="url(#capGrad)"/>
      <rect x="145" y="60" width="110" height="15" rx="5" fill="#475569"/>
      <!-- Label -->
      <rect x="138" y="140" width="124" height="155" rx="8" fill="#ffffff"/>
      <rect x="138" y="140" width="124" height="26" fill="#1e3a8a"/>
      <text x="200" y="157" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="11" fill="#ffffff" letter-spacing="1">PT PANCA PRIMA WIJAYA</text>
      <!-- Product Title -->
      <text x="200" y="185" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="16" fill="#b91c1c">FUMIPHOS®</text>
      <text x="200" y="202" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="12" fill="#1e293b">56 TB</text>
      <!-- Sub info -->
      <rect x="150" y="210" width="100" height="16" rx="4" fill="#fef2f2"/>
      <text x="200" y="222" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="8.5" fill="#991b1b">TABLET FUMIGAN</text>
      <text x="200" y="244" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="8" fill="#334155">Bahan Aktif:</text>
      <text x="200" y="255" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="8" fill="#0f172a">Aluminium Phosphide 56%</text>
      <line x1="150" y1="265" x2="250" y2="265" stroke="#e2e8f0" stroke-width="1"/>
      <text x="200" y="278" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="7.5" fill="#059669">PROTEKSI HAMA GUDANG</text>
      <text x="200" y="288" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="7" fill="#64748b">Isi: 334 Tablet (1 Kg)</text>
    </g>
    <rect x="18" y="18" width="145" height="24" rx="12" fill="#ffffff" opacity="0.9"/>
    <text x="90" y="34" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="9" fill="#1e3a8a">FUMIGAN FOSFIN RESMI</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const createSilogardSvg = (): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <defs>
      <linearGradient id="bgSilo" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#eff6ff"/>
        <stop offset="100%" stop-color="#dbeafe"/>
      </linearGradient>
      <linearGradient id="canisterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#047857"/>
        <stop offset="40%" stop-color="#10b981"/>
        <stop offset="80%" stop-color="#059669"/>
        <stop offset="100%" stop-color="#047857"/>
      </linearGradient>
      <filter id="shadowSilo" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="12" stdDeviation="10" flood-opacity="0.18"/>
      </filter>
    </defs>
    <rect width="400" height="400" rx="24" fill="url(#bgSilo)"/>
    <ellipse cx="200" cy="345" rx="95" ry="16" fill="#0f172a" opacity="0.12"/>
    <!-- Canister Jug -->
    <g filter="url(#shadowSilo)">
      <path d="M125 130 C125 115, 140 105, 160 105 L240 105 C260 105, 275 115, 275 130 L275 315 C275 325, 265 332, 250 332 L150 332 C135 332, 125 325, 125 315 Z" fill="url(#canisterGrad)"/>
      <!-- Handle -->
      <path d="M145 105 C145 75, 255 75, 255 105" fill="none" stroke="#047857" stroke-width="16" stroke-linecap="round"/>
      <!-- Cap -->
      <rect x="230" y="80" width="35" height="25" rx="4" fill="#dc2626"/>
      <!-- Label -->
      <rect x="135" y="145" width="130" height="150" rx="8" fill="#ffffff"/>
      <rect x="135" y="145" width="130" height="26" fill="#065f46"/>
      <text x="200" y="162" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="10" fill="#ffffff">PT PANCA PRIMA WIJAYA</text>
      <text x="200" y="192" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="17" fill="#047857">SILOGARD®</text>
      <text x="200" y="210" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="12" fill="#1e293b">250 EC</text>
      <rect x="148" y="218" width="104" height="16" rx="4" fill="#ecfdf5"/>
      <text x="200" y="230" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="8" fill="#065f46">INSEKTISIDA GUDANG</text>
      <text x="200" y="252" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="8" fill="#334155">Bahan Aktif: Deltamethrin</text>
      <text x="200" y="264" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="7.5" fill="#64748b">Pelapis Sanitasi Dinding & Lantai</text>
      <line x1="148" y1="272" x2="252" y2="272" stroke="#e2e8f0" stroke-width="1"/>
      <text x="200" y="285" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="7.5" fill="#dc2626">KEDAP UDARA & HAMA</text>
    </g>
    <rect x="18" y="18" width="140" height="24" rx="12" fill="#ffffff" opacity="0.9"/>
    <text x="88" y="34" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="9" fill="#047857">SANITASI GUDANG</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const createSanisolSvg = (): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <defs>
      <linearGradient id="bgSani" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#faf5ff"/>
        <stop offset="100%" stop-color="#ede9fe"/>
      </linearGradient>
      <linearGradient id="saniBottle" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0284c7"/>
        <stop offset="50%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#0369a1"/>
      </linearGradient>
      <filter id="shadowSani" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="12" stdDeviation="10" flood-opacity="0.18"/>
      </filter>
    </defs>
    <rect width="400" height="400" rx="24" fill="url(#bgSani)"/>
    <ellipse cx="200" cy="345" rx="85" ry="15" fill="#0f172a" opacity="0.12"/>
    <g filter="url(#shadowSani)">
      <rect x="140" y="125" width="120" height="205" rx="16" fill="url(#saniBottle)"/>
      <path d="M165 85 L235 85 L230 125 L170 125 Z" fill="#ffffff"/>
      <rect x="160" y="70" width="80" height="18" rx="4" fill="#0284c7"/>
      <!-- Label -->
      <rect x="148" y="150" width="104" height="145" rx="8" fill="#ffffff"/>
      <rect x="148" y="150" width="104" height="24" fill="#0369a1"/>
      <text x="200" y="166" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="8.5" fill="#ffffff">PT PANCA PRIMA WIJAYA</text>
      <text x="200" y="195" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="15" fill="#0284c7">SANISOL®</text>
      <text x="200" y="212" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="11" fill="#1e293b">RC</text>
      <rect x="156" y="220" width="88" height="15" rx="4" fill="#f0f9ff"/>
      <text x="200" y="231" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="8" fill="#0284c7">DISINFEKTAN INDUSTRI</text>
      <text x="200" y="252" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="7.5" fill="#334155">Sanitasi Higienis Gudang</text>
      <text x="200" y="264" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="7" fill="#64748b">Membasmi Bakteri & Jamur</text>
      <line x1="156" y1="272" x2="244" y2="272" stroke="#e2e8f0" stroke-width="1"/>
      <text x="200" y="284" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="7.5" fill="#059669">STANDAR FOOD GRADE</text>
    </g>
    <rect x="18" y="18" width="135" height="24" rx="12" fill="#ffffff" opacity="0.9"/>
    <text x="85" y="34" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="9" fill="#0284c7">DISINFEKTAN RESMI</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const createKObiolSvg = (): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <defs>
      <linearGradient id="bgKobiol" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fffbeb"/>
        <stop offset="100%" stop-color="#fef3c7"/>
      </linearGradient>
      <linearGradient id="kobiolBottle" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#b45309"/>
        <stop offset="50%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#d97706"/>
      </linearGradient>
      <filter id="shadowKob" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="12" stdDeviation="10" flood-opacity="0.18"/>
      </filter>
    </defs>
    <rect width="400" height="400" rx="24" fill="url(#bgKobiol)"/>
    <ellipse cx="200" cy="345" rx="85" ry="15" fill="#0f172a" opacity="0.12"/>
    <g filter="url(#shadowKob)">
      <rect x="140" y="120" width="120" height="210" rx="16" fill="url(#kobiolBottle)"/>
      <path d="M165 80 L235 80 L230 120 L170 120 Z" fill="#ffffff"/>
      <rect x="160" y="65" width="80" height="18" rx="4" fill="#b45309"/>
      <rect x="148" y="145" width="104" height="150" rx="8" fill="#ffffff"/>
      <rect x="148" y="145" width="104" height="24" fill="#92400e"/>
      <text x="200" y="161" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="8.5" fill="#ffffff">PT PANCA PRIMA WIJAYA</text>
      <text x="200" y="190" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="15" fill="#b45309">K-OBIOL®</text>
      <text x="200" y="208" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="11" fill="#1e293b">25 EC</text>
      <rect x="156" y="215" width="88" height="16" rx="4" fill="#fef3c7"/>
      <text x="200" y="227" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="8" fill="#b45309">PROTEKSI BIJI-BIJIAN</text>
      <text x="200" y="248" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="7.5" fill="#334155">Insektisida Semprot Butiran</text>
      <text x="200" y="260" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="7" fill="#64748b">Perlindungan Biji Jagung & Beras</text>
      <line x1="156" y1="268" x2="244" y2="268" stroke="#e2e8f0" stroke-width="1"/>
      <text x="200" y="280" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="7" fill="#047857">TAHAN HINGGA 6 BULAN</text>
    </g>
    <rect x="18" y="18" width="145" height="24" rx="12" fill="#ffffff" opacity="0.9"/>
    <text x="90" y="34" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="9" fill="#b45309">INSEKTISIDA BIJI-BIJIAN</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const createMoistureMeterSvg = (): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <defs>
      <linearGradient id="bgGmm" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc"/>
        <stop offset="100%" stop-color="#e2e8f0"/>
      </linearGradient>
      <linearGradient id="deviceBody" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#1e293b"/>
        <stop offset="50%" stop-color="#334155"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <filter id="shadowMeter" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="12" stdDeviation="10" flood-opacity="0.18"/>
      </filter>
    </defs>
    <rect width="400" height="400" rx="24" fill="url(#bgGmm)"/>
    <ellipse cx="200" cy="345" rx="80" ry="14" fill="#0f172a" opacity="0.12"/>
    <g filter="url(#shadowMeter)">
      <!-- Tester Body -->
      <rect x="135" y="80" width="130" height="250" rx="18" fill="url(#deviceBody)"/>
      <!-- Top Sensor Probe Cup -->
      <rect x="165" y="50" width="70" height="35" rx="6" fill="#94a3b8"/>
      <rect x="175" y="42" width="50" height="10" rx="3" fill="#cbd5e1"/>
      <!-- LCD Screen -->
      <rect x="150" y="110" width="100" height="60" rx="8" fill="#14532d"/>
      <rect x="154" y="114" width="92" height="52" rx="6" fill="#86efac"/>
      <text x="200" y="148" text-anchor="middle" font-family="monospace" font-weight="900" font-size="24" fill="#064e3b">12.4%</text>
      <text x="200" y="160" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="8" fill="#065f46">GRAIN MOISTURE</text>
      <!-- Buttons -->
      <circle cx="170" cy="205" r="12" fill="#ef4444"/>
      <circle cx="200" cy="205" r="12" fill="#3b82f6"/>
      <circle cx="230" cy="205" r="12" fill="#10b981"/>
      <text x="170" y="228" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="7" fill="#cbd5e1">POWER</text>
      <text x="200" y="228" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="7" fill="#cbd5e1">SELECT</text>
      <text x="230" y="228" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="7" fill="#cbd5e1">TEST</text>
      <!-- Brand badge -->
      <rect x="150" y="255" width="100" height="50" rx="8" fill="#0f172a" stroke="#475569" stroke-width="1"/>
      <text x="200" y="272" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="9" fill="#f8fafc">PANCA PRIMA</text>
      <text x="200" y="285" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="8.5" fill="#38bdf8">JV-010S</text>
      <text x="200" y="296" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="6.5" fill="#94a3b8">Digital Moisture Tester</text>
    </g>
    <rect x="18" y="18" width="160" height="24" rx="12" fill="#ffffff" opacity="0.9"/>
    <text x="98" y="34" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="9" fill="#0f172a">ALAT UKUR KADAR AIR</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const createSeismicSvg = (): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <defs>
      <linearGradient id="bgSeis" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fff1f2"/>
        <stop offset="100%" stop-color="#ffe4e6"/>
      </linearGradient>
      <linearGradient id="metalBody" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#334155"/>
        <stop offset="40%" stop-color="#64748b"/>
        <stop offset="80%" stop-color="#475569"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
      <filter id="shadowSeis" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="12" stdDeviation="10" flood-opacity="0.18"/>
      </filter>
    </defs>
    <rect width="400" height="400" rx="24" fill="url(#bgSeis)"/>
    <ellipse cx="200" cy="345" rx="90" ry="15" fill="#0f172a" opacity="0.12"/>
    <g filter="url(#shadowSeis)">
      <!-- Heavy Casing -->
      <rect x="120" y="130" width="160" height="180" rx="16" fill="url(#metalBody)"/>
      <!-- Top Flange -->
      <rect x="110" y="115" width="180" height="20" rx="6" fill="#0f172a"/>
      <!-- Base Mounting Plate -->
      <rect x="105" y="300" width="190" height="22" rx="5" fill="#0f172a"/>
      <circle cx="120" cy="311" r="5" fill="#94a3b8"/>
      <circle cx="280" cy="311" r="5" fill="#94a3b8"/>
      <!-- Cable Connector -->
      <rect x="180" y="75" width="40" height="42" rx="4" fill="#e2e8f0"/>
      <rect x="190" y="55" width="20" height="22" rx="3" fill="#0f172a"/>
      <!-- Front Indicator Plate -->
      <rect x="140" y="150" width="120" height="135" rx="10" fill="#ffffff"/>
      <rect x="140" y="150" width="120" height="24" fill="#dc2626"/>
      <text x="200" y="166" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="9" fill="#ffffff">SENSOR GEMPA & EWS</text>
      <text x="200" y="194" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="14" fill="#0f172a">SEISMIC SA-100</text>
      <!-- Tri-axial arrows -->
      <path d="M190 225 L210 225 M200 215 L200 235" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round"/>
      <text x="200" y="250" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="9" fill="#dc2626">TRIAXIAL (X-Y-Z)</text>
      <text x="200" y="262" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="7.5" fill="#334155">Akurasi: Sub-Milimeter</text>
      <text x="200" y="272" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="7" fill="#64748b">sensorgempa.com</text>
    </g>
    <rect x="18" y="18" width="165" height="24" rx="12" fill="#ffffff" opacity="0.9"/>
    <text x="100" y="34" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="9" fill="#dc2626">SENSOR GEMPA SA-100</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Initial default company products for PT. Panca Prima Wijaya
export const DEFAULT_PANCA_PRODUCTS: PancaProduct[] = [
  {
    id: 'PROD-FUMIPHOS-56TB',
    kode: 'P-FUM-56',
    nama: 'Fumiphos 56 TB',
    stok: 120,
    minStok: 15,
    hargaJual: 450000,
    satuan: 'botol',
    images: [createFumiphosSvg()],
    specifications: 'Formulasi: Tablet (TB). Bahan aktif: Aluminium Phosphide 56%. Kemasan: Botol isi 334 tablet (1 kg net). Standar AFAS & Kementan RI.',
    mainFunction: 'Fumigan fosfin efektif membasmi seluruh stadia hama gudang (telur, larva, pupa, imago) hingga 100%.',
    mainApplication: 'Fumigasi komoditas pangan gudang: beras, jagung, gandum, tembakau, kopi, pakan ternak, dan fumigasi kontainer ekspor.',
    panjang: 12,
    lebar: 12,
    tinggi: 25,
    berat: 1.1
  },
  {
    id: 'PROD-SILOGARD-250EC',
    kode: 'P-SILO-250',
    nama: 'Silogard 250 EC',
    stok: 45,
    minStok: 10,
    hargaJual: 650000,
    satuan: 'jerigen',
    images: [createSilogardSvg()],
    specifications: 'Formulasi: Emulsifiable Concentrate (EC). Bahan aktif: Deltamethrin 250 g/L. Kemasan: Jerigen 1 Liter & 5 Liter.',
    mainFunction: 'Pelapis kedap udara dan insektisida residu sanitasi gudang, membunuh hama merayap dan terbang seketika.',
    mainApplication: 'Penyemprotan residual dinding gudang, lantai penyimpanan, lantai silo, serta perimeter penyimpanan pangan.',
    panjang: 18,
    lebar: 14,
    tinggi: 28,
    berat: 1.2
  },
  {
    id: 'PROD-SANISOL-RC',
    kode: 'P-SANI-01',
    nama: 'Sanisol RC',
    stok: 80,
    minStok: 10,
    hargaJual: 280000,
    satuan: 'botol',
    images: [createSanisolSvg()],
    specifications: 'Formulasi: Cairan konsentrat disinfektan higienis industri. Standar Food Grade safe.',
    mainFunction: 'Membasmi jamur, spora, bakteri pembusuk, dan virus pada ruangan penyimpanan komoditas pasca panen.',
    mainApplication: 'Sanitasi cold storage, gudang benih, pabrik pengolahan pakan ternak, dan area penampungan biji-bijian.',
    panjang: 10,
    lebar: 10,
    tinggi: 24,
    berat: 1.0
  },
  {
    id: 'PROD-KOBIOL-25EC',
    kode: 'P-KOB-25',
    nama: 'K-Obiol 25 EC',
    stok: 60,
    minStok: 10,
    hargaJual: 520000,
    satuan: 'botol',
    images: [createKObiolSvg()],
    specifications: 'Formulasi: EC. Bahan aktif: Deltamethrin + Piperonyl Butoxide (PBO). Kemasan: 1 Liter.',
    mainFunction: 'Insektisida proteksi langsung pada biji-bijian curah tanpa merusak daya kecambah dan mutu pangan.',
    mainApplication: 'Penyemprotan grain conveyor belt, pelindung stok jagung pipil, gabah, dan beras curah hingga 6-12 bulan.',
    panjang: 11,
    lebar: 11,
    tinggi: 25,
    berat: 1.1
  },
  {
    id: 'PROD-GMM-JV010S',
    kode: 'P-GMM-01',
    nama: 'Grain Moisture Meter JV-010S',
    stok: 15,
    minStok: 3,
    hargaJual: 3200000,
    satuan: 'unit',
    images: [createMoistureMeterSvg()],
    specifications: 'Akurasi: ±0.5%. Rentang ukur: 3% - 35%. Layar LCD digital dengan backlight. Kalibrasi multi-komoditas.',
    mainFunction: 'Mengukur kadar air biji-bijian secara instan dan akurat untuk mencegah kebusukan dan penolakan pabrik.',
    mainApplication: 'QC penerimaan komoditas: kopi, kakao, jagung, kedelai, beras, gandum, dan biji bunga matahari.',
    panjang: 22,
    lebar: 15,
    tinggi: 12,
    berat: 1.5
  },
  {
    id: 'PROD-SEISMIC-SA100',
    kode: 'P-SEIS-100',
    nama: 'Seismic Accelerometer SA-100',
    stok: 8,
    minStok: 2,
    hargaJual: 12500000,
    satuan: 'unit',
    images: [createSeismicSvg()],
    specifications: 'Sensor: Tri-axial MEMS Seismic Accelerometer. Output: RS485 / Modbus / 4G. Dynamic range: >100 dB.',
    mainFunction: 'Sistem peringatan dini (EWS) gempa bumi, pemantauan getaran tanah, dan earthquake automatic shutdown relay.',
    mainApplication: 'Gedung tinggi, jembatan, bendungan, kilang industri kimia, fasilitas gas, dan lereng tambang (landslide).',
    panjang: 20,
    lebar: 20,
    tinggi: 18,
    berat: 3.5
  }
];

// Helper to find a product image or fallback to default catalog image if matching
export const getProductImageUrl = (
  prod: any,
  allProducts: any[] = []
): string | null => {
  if (!prod) return null;

  // 1. Check direct image properties on the object
  if (Array.isArray(prod.images) && prod.images.length > 0 && typeof prod.images[0] === 'string' && prod.images[0].length > 5) {
    return prod.images[0];
  }
  const direct = prod.image || prod.foto || prod.gambar || prod.imageUrl;
  if (typeof direct === 'string' && direct.length > 5) {
    return direct;
  }

  // 2. Check in allProducts if by ID or code
  const found = allProducts.find(p => p.id === prod.id || p.kode === prod.kode);
  if (found) {
    if (Array.isArray(found.images) && found.images.length > 0) return found.images[0];
    const fDirect = found.image || found.foto || found.gambar || found.imageUrl;
    if (fDirect) return fDirect;
  }

  // 3. Fallback to default catalog matching by name or code
  const name = (prod.nama || prod.name || '').toLowerCase();
  const code = (prod.kode || prod.id || '').toLowerCase();

  const defMatch = DEFAULT_PANCA_PRODUCTS.find(dp => {
    const dpName = dp.nama.toLowerCase();
    const dpCode = dp.kode.toLowerCase();
    return dpName.includes(name) || name.includes(dpName) || dpCode === code || name.includes('fumi') && dpName.includes('fumi') || name.includes('silo') && dpName.includes('silo') || name.includes('sani') && dpName.includes('sani') || name.includes('k-obiol') && dpName.includes('k-obiol') || name.includes('moisture') && dpName.includes('moisture') || name.includes('gempa') && dpName.includes('seismic') || name.includes('seismic') && dpName.includes('seismic');
  });

  if (defMatch && defMatch.images.length > 0) {
    return defMatch.images[0];
  }

  return null;
};
