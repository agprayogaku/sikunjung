# SIKUNJUNG v1.0
### Sistem Informasi Pendaftaran Kunjungan Online Lapas Kelas IIB Purwakarta
**Kementerian Imigrasi dan Pemasyarakatan Republik Indonesia**

[![Node.js Version](https://img.shields.io/badge/Node.js-20%20LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express.js](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/Architecture-Zero--Database%20JSON-orange)](#-arsitektur-zero-database)
[![Tests](https://img.shields.io/badge/Automated%20Tests-98%20Passed%20(100%25)-brightgreen?logo=jest&logoColor=white)](#-pengujian-otomatis)
[![Security](https://img.shields.io/badge/Security-Argon2id%20%7C%20CSRF%20%7C%20CSP%20Nonce-blue)](#-keamanan--otentikasi)

---

## 📌 Ringkasan Eksekutif

**SIKUNJUNG** (*Sistem Informasi Layanan Pendaftaran Kunjungan Online Lapas Purwakarta*) adalah aplikasi web terpadu untuk mendigitalisasi proses registrasi dan antrean kunjungan keluarga bagi Warga Binaan Pemasyarakatan (WBP) di **Lembaga Pemasyarakatan Kelas IIB Purwakarta**.

Sistem ini dirancang dengan tiga prinsip utama:
1. **Sederhana & Aksesibel bagi Masyarakat:** Pengunjung mendaftar secara online tanpa perlu membuat akun (*no-login registration*), ramah perangkat seluler (*mobile-first*), dan menyediakan dokumen resmi bukti kunjungan PDF A6 ber-QR code.
2. **Ketat & Presisi di Sisi Backend:** Mencegah pendaftaran ganda secara mutlak (*atomic locking*), menegakkan batas kuota harian dan komposisi rombongan, serta mematuhi formula jadwal rotasi kunjungan hari Sabtu.
3. **Cepat & Praktis bagi Petugas Loket:** Verifikasi fisik KTP 1-klik, penerbitan nomor antrean sekuensial harian otomatis, dan pencetakan tiket pengawas monokrom A6 instan.

Aplikasi beroperasi secara mandiri **tanpa ketergantungan pada server database eksternal (Zero RDBMS Engine)**. Seluruh data disimpan dalam berkas JSON modular dengan mekanisme *file locking* eksklusif dan *atomic write*, sangat cocok untuk keandalan jaringan lokal dan arsitektur *Dual-PC Standby*.

---

## ✨ Fitur-Fitur Utama

### 1. Modul Pengunjung Publik (Tanpa Akun)
* **Pencarian WBP Cepat (< 10 ms):** Menggunakan *in-memory cache* dengan normalisasi spasi dan *case-insensitive matching*. Data sensitif kamar sel dan nomor registrasi instansi diproteksi penuh dari antarmuka publik.
* **Jadwal Kunjungan Cerdas (H+0 s/d H+3):**
  * Deteksi otomatis jenis WBP (**Narapidana** vs **Tahanan**) berdasarkan status putusan sidang.
  * Evaluasi otomatis rotasi hari Sabtu:
    * **Narapidana:** Buka Senin, Selasa, Kamis, dan **Sabtu Minggu ke-2 & ke-4**.
    * **Tahanan:** Buka Senin, Rabu, dan **Sabtu Minggu ke-1, ke-3, & ke-5**.
  * Penegakan jam tutup (*cutoff*) pendaftaran hari H (14.30 WIB untuk hari kerja, 11.30 WIB untuk hari Sabtu). Jumat dan Minggu tutup dinas.
* **Validasi Kuota Rombongan Dinamis:**
  * Maksimal 4 Dewasa (0 Anak), **ATAU**
  * Maksimal 3 Dewasa (1–2 Anak di bawah 17 tahun).
* **Barang Bawaan & Titipan Uang:** Validasi kategori barang titipan (Makanan maks 3 bungkus, Pakaian maks 3 potong, Obat resep klinik, dan Uang titipan maksimal Rp 200.000).
* **Nomor Registrasi Unik & Bukti PDF A6:** Terbit nomor registrasi acak anti-ambigu (format `REG YYYYMMDD XXXXXX`) dan unduh dokumen bukti pendaftaran berstandar cetak A6 dengan kop resmi instansi dan QR verifikasi.
* **Cek Status & Pembatalan Mandiri:** Pengunjung dapat memantau status atau membatalkan pendaftaran secara mandiri dengan konfirmasi NIK untuk melepaskan kuota kembali.
* **Auto-fill NIK Pengunjung Berulang:** Otomatisasi pengisian biodata nama, gender, dan relasi saat NIK pernah berkunjung sebelumnya (alamat dan nomor telepon diproteksi).

### 2. Modul Petugas Loket & Pengawas Kunjungan
* **Verifikasi Fisik KTP:** Pencocokan data pengunjung saat tiba di loket Lapas pada hari kunjungan. Tombol verifikasi terkunci otomatis jika pengunjung datang sebelum tanggal kunjungan.
* **Penerbitan Nomor Antrean Harian Otomatis:** Menghasilkan nomor antrean berurutan (`A 001`, `A 002`, dst.) secara atomik berbasis kedatangan fisik (*FIFO*).
* **Cetak Tiket Pengawas A6:** Cetak tiket monokrom font besar untuk petugas pengawas dengan penyingkatan lokasi kamar sel WBP (misal `A.04`).
* **Manajemen Antrean Real-time:** Pelacakan transisi status kunjungan (`MENUNGGU DIPANGGIL` $\rightarrow$ `DIPANGGIL` $\rightarrow$ `SEDANG BERKUNJUNG` $\rightarrow$ `SELESAI` / `DILEWATI`).
* **Kelola Data WBP & Upload Data:** Unggah berkas JSON data warga binaan baru dengan validasi integritas struktur dan pencadangan otomatis.
* **Laporan Kunjungan:** Rekapitulasi pendaftaran harian dengan ekspor format PDF dan CSV standar UTF-8.

### 3. Keamanan & Manajemen Akses
* **Multi-Role RBAC:** Pemisahan wewenang antara **ADMIN** (operasional loket & data) dan **MASTER** (manajemen akun admin & persetujuan reset kata sandi).
* **Kriptografi Argon2id:** Password admin disimpan dengan hash modern Argon2id, dilengkapi verifikasi *dummy hash* untuk mencegah *timing attack* (enumerasi akun).
* **Double CSRF Protection:** Seluruh transaksi POST dilindungi token CSRF ganda.
* **Content Security Policy (CSP):** Menggunakan *cryptographic nonce* dinamis per-request untuk seluruh skrip inline.
* **Rate Limiting:** Pembatasan frekuensi percobaan login, pendaftaran publik, dan lookup NIK guna mencegah *brute-force* maupun *scraping*.
* **Embedded SQLite Session Store:** Sesi login disimpan pada database SQLite lokal (`storage/sessions/sessions.db`) dengan *sliding expiration* 30 menit.

### 4. Pemeliharaan Harian & Ketahanan Sistem
* **Daily Maintenance Scheduler (14.30 WIB):**
  * Mengubah seluruh pendaftaran hari ini yang belum hadir verifikasi menjadi status `TIDAK HADIR` secara otomatis.
  * Membuat arsip pencadangan ZIP harian ke folder `storage/backups/auto/`.
  * Membersihkan arsip backup yang melampaui masa retensi 30 hari.
* **Dual-PC Architecture Ready:** Prosedur *cold-standby recovery* ke server Debian 12 terdokumentasi lengkap dengan target waktu pemulihan (*RTO*) < 2 jam.

---

## 🏗 Arsitektur Zero-Database

Sistem memanfaatkan penyimpanan modular berbasis berkas JSON yang dilindungi oleh dua lapisan keamanan konkurensi:

```
[ Request HTTP Masuk ]
         │
         ▼
[ FileLockManager (proper-lockfile) ]
  ├── withDateLock(visitDate)  --> Mengunci date_YYYY-MM-DD.lock
  └── withGlobalLock(resource) --> Mengunci global_resource.lock
         │
         ▼
[ Atomic JSON Storage Engine ]
  ├── 1. fs.writeFile ke file temporer (.tmp)
  ├── 2. fs.rename atomik ke file target (.json)
  └── 3. Re-read & JSON.parse verification (Anti-Korup)
         │
         ▼
[ Berkas Runtime storage/ ]
  ├── registrations/YYYY-MM/reg_YYYY-MM-DD.json
  ├── queues/queue_YYYY-MM-DD.json
  ├── indexes/nik_history.json & reg_lookup.json
  └── config/admins.json & settings.json
```

---

## 📁 Struktur Direktori Proyek

```text
sikunjung/
├── docs/                               # Dokumentasi teknis & SOP
│   └── STANDBY_RECOVERY_GUIDE.md       # Panduan failover server cadangan Debian 12
├── public/                             # Aset web statis lokal (Zero CDN)
│   ├── css/global.css                  # Desain token warna OKLCH & dark mode
│   ├── images/                         # Logo resmi Kemenimipas & Pemasyarakatan
│   ├── js/ (ui.js, themeToggle.js)     # Logika frontend interaktif
│   └── vendor/                         # Bundle Bootstrap 5.3 & Icons lokal
├── src/                                # Sumber kode utama (TypeScript)
│   ├── bootstrap/                      # Inisialisasi storage, seed data, & scheduler 14:30
│   ├── config/                         # Konfigurasi env (Zod) & konstanta aplikasi
│   ├── controllers/                    # Penanganan request (Public, Admin, API)
│   ├── middleware/                     # RBAC Auth, CSRF, Rate Limiting, CSP
│   ├── scripts/                        # Skrip utilitas audit & pemeliharaan
│   ├── services/                       # Logika bisnis inti sistem
│   ├── storage/                        # JSON storage engine, file lock manager, paths
│   ├── types/                          # Definisi tipe TypeScript
│   ├── utils/                          # Utilitas tanggal Jakarta, SHA256, PDF, logger
│   ├── validators/                     # Validasi skema runtime Zod
│   ├── app.ts                          # Express application factory
│   └── server.ts                       # Entry point server HTTP & graceful shutdown
├── storage/                            # Direktori penyimpanan data transaksi
│   └── .gitkeep                        # Folder runtime (registrations, config, sessions)
├── tests/                              # Suite pengujian otomatis Jest
│   ├── helpers/                        # Helper simulasi request & CSRF
│   ├── integration/                    # Test alur admin dan pendaftaran publik
│   └── unit/                           # Test unit seluruh service dan storage engine
├── ecosystem.config.cjs                # Konfigurasi proses daemon PM2
├── package.json                        # Konfigurasi dependensi dan skrip proyek
└── tsconfig.json                       # Konfigurasi TypeScript Strict Mode
```

---

## 🚀 Panduan Memulai

### Prasyarat
* **Node.js:** Versi 20 LTS atau lebih tinggi ([Unduh Node.js](https://nodejs.org/))
* **Git:** Versi 2.x atau lebih tinggi

### 1. Kloning Repositori
```bash
git clone https://github.com/agprayogaku/sikunjung.git
cd sikunjung
```

### 2. Instal Dependensi
```bash
npm install
```

### 3. Konfigurasi Lingkungan (.env)
Salin berkas templat `.env.example` menjadi `.env`:
```bash
# Di Windows PowerShell:
Copy-Item .env.example .env

# Di Linux / macOS:
cp .env.example .env
```
Sesuaikan konfigurasi rahasia pada berkas `.env`:
* `SESSION_SECRET`: Kunci acak hex 64 karakter untuk sesi login.
* `CSRF_SECRET`: Kunci acak hex 64 karakter untuk token proteksi CSRF.
* `ADMIN_MASTER_INITIAL_PASSWORD`: Password awal untuk akun master (wajib diganti saat login pertama).

### 4. Inisialisasi Data Awal (Seeding)
Jalankan skrip seeding untuk membuat konfigurasi dan data WBP sampel:
```bash
npm run seed
```

### 5. Jalankan Aplikasi

#### Mode Pengembangan (*Development*):
```bash
npm run dev
```
Aplikasi aktif di: `http://localhost:3000`

#### Mode Produksi (*Production*):
```bash
# 1. Kompilasi TypeScript ke folder dist/
npm run build

# 2. Jalankan aplikasi
npm start

# Atau jalankan menggunakan PM2 daemon (Direkomendasikan di Server):
npx pm2 start ecosystem.config.cjs
npx pm2 save
```

---

## 🧪 Pengujian Otomatis

Aplikasi dilengkapi pengujian otomatis terisolasi yang berjalan pada direktori temporer OS tanpa menyentuh data produksi:

```bash
# Menjalankan seluruh test suite (14 suites, 98 tests)
npm test

# Memeriksa kepatuhan tipe TypeScript (Strict Mode)
npm run typecheck
```

---

## 🔐 Alamat URL Penting

| Halaman | Alamat URL | Keterangan |
| :--- | :--- | :--- |
| **Beranda Layanan** | `http://localhost:3000/` | Informasi layanan, jadwal besuk, dan FAQ |
| **Form Pendaftaran** | `http://localhost:3000/daftar` | Alur pendaftaran mandiri tanpa akun |
| **Cek Status & Batal** | `http://localhost:3000/status` | Monitoring dan pembatalan dengan NIK |
| **Portal Petugas/Admin** | `http://localhost:3000/admin/login` | Akses masuk petugas loket dan master |
| **Verifikasi Loket** | `http://localhost:3000/admin/verifikasi` | Verifikasi fisik KTP & penerbitan antrean |
| **Antrean Kunjungan** | `http://localhost:3000/admin/antrean` | Manajemen antrean ruang kunjungan |
| **Pencadangan Data** | `http://localhost:3000/admin/backup` | Backup manual & upload restore ZIP |

---

## 📄 Hak Cipta & Lisensi

Hak Cipta © 2026 **Lembaga Pemasyarakatan Kelas IIB Purwakarta**  
Direktorat Jenderal Pemasyarakatan — Kementerian Imigrasi dan Pemasyarakatan Republik Indonesia.  
Dikelola di bawah lisensi operasional dinas pemasyarakatan.
