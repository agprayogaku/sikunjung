# Walkthrough: Penyelesaian Implementasi Lengkap SIKUNJUNG v1.0

Sistem Informasi Pendaftaran Kunjungan Online **Lapas Kelas IIB Purwakarta (SIKUNJUNG)** telah selesai diimplementasikan secara menyeluruh sesuai dokumen **PRD v3.0 Final**. Seluruh fase pengembangan (Phase 1 hingga Phase 10) telah terverifikasi dengan **93 automated tests (13 test suites)** yang lulus 100% pada storage temporer terisolasi.

---

## 1. Ringkasan Arsitektur & Aturan Bisnis yang Diimplementasikan

| Aturan / Modul | Implementasi & Referensi Kode | Status |
| :--- | :--- | :--- |
| **Zero Database (JSON Storage Engine)** | Pure JSON files di folder `storage/`, dilindungi `proper-lockfile` dan `atomicWriteJson` (write tmp -> rename -> verify re-read) di [`src/storage/jsonStorageEngine.ts`](file:///c:/Users/user/Documents/silapurwa/src/storage/jsonStorageEngine.ts) dan [`src/storage/fileLockManager.ts`](file:///c:/Users/user/Documents/silapurwa/src/storage/fileLockManager.ts). | ✅ Terverifikasi |
| **WBP Engine & Pencarian Cepat (< 300ms)** | In-memory cache + normalisasi spasi + pencarian case-insensitive pada [`src/services/wbpService.ts`](file:///c:/Users/user/Documents/silapurwa/src/services/wbpService.ts). Kecepatan pencarian tercatat **4 - 8 ms** (NFR 03). Pencarian dan detail publik tidak memuat `lokasiSel` maupun `noRegInstansi`; kamar sel hanya dicetak pada bukti A6 pendaftar dan tiket petugas dalam bentuk singkat seperti `A.04`. | ✅ Terverifikasi |
| **Rotasi Hari Sabtu (BR-01)** | Narapidana: Senin, Selasa, Kamis, dan **Sabtu Minggu 2 & 4**.<br>Tahanan: Senin, Rabu, dan **Sabtu Minggu 1, 3, & 5**.<br>Formula: `saturdayOccurrence = Math.floor((day - 1) / 7) + 1` di [`src/services/scheduleService.ts`](file:///c:/Users/user/Documents/silapurwa/src/services/scheduleService.ts). | ✅ Terverifikasi |
| **Jendela Booking & Jam Tutup (BR-02 & BR-03)** | Booking H+0 s/d H+3. Hari Jumat & Minggu tutup. Cutoff H+0 pukul **14.30 WIB** (Sabtu: **11.30 WIB**). | ✅ Terverifikasi |
| **Dashboard Lintas Tanggal** | Dashboard memisahkan total operasional hari ini dari booking H+1 s/d H+3. Panel pendaftaran mendatang menampilkan total pendaftar dan jumlah yang belum diverifikasi per tanggal, dengan tautan langsung ke daftar registrasi tanggal tersebut. Ringkasan dibangun di [`src/services/registrationOverviewService.ts`](file:///c:/Users/user/Documents/silapurwa/src/services/registrationOverviewService.ts). | ✅ Terverifikasi |
| **Navigasi Pasca-Verifikasi** | Tautan ke antrean dan daftar registrasi setelah verifikasi membawa parameter `date=<visitDate>`, sehingga petugas tidak kembali ke tanggal hari ini secara tidak sengaja. Label “Daftar semua registrasi” diganti menjadi “Registrasi tanggal pantauan”, dan halaman daftar menjadi “Daftar Registrasi Kunjungan”. | ✅ Terverifikasi |
| **Komposisi Kuota Rombongan (BR-04)** | Validasi Zod di [`src/validators/registrationSchema.ts`](file:///c:/Users/user/Documents/silapurwa/src/validators/registrationSchema.ts):<br>&bull; Maks 4 dewasa (0 anak), ATAU<br>&bull; Maks 3 dewasa (1 - 2 anak). | ✅ Terverifikasi |
| **Batas Kuota Harian & WBP (BR-05 & BR-06)** | Maks 40 pendaftaran / 60 pengunjung per hari. 1 WBP hanya boleh dikunjungi 1 kali per hari. Terkunci secara atomik dengan `withDateLock(visitDate)`. | ✅ Terverifikasi |
| **Keunikan NIK Pengunjung (BR-07)** | 1 NIK hanya boleh terdaftar pada 1 pendaftaran aktif per hari kunjungan. Riwayat kunjungan di [`src/services/nikHistoryService.ts`](file:///c:/Users/user/Documents/silapurwa/src/services/nikHistoryService.ts) dipakai untuk auto-fill nama/jenis kelamin/relasi; alamat dan telepon tidak pernah dikirim lewat API publik. | ✅ Terverifikasi |
| **Status Kunjungan WBP (BR-04, TC 10)** | WBP berstatus `Tidak Boleh Dikunjungi` dan `Hanya Titipan Barang` tidak dapat didaftarkan untuk kunjungan. Alur titipan tanpa kunjungan belum tersedia sebagai modul terpisah. | ✅ Terverifikasi |
| **Integritas Kuota & Status (BR-07, BR-12)** | Kuota hanya dibebaskan sekali saat status berubah dari status pengunci ke `TIDAK HADIR`, `DITOLAK`, atau `DIBATALKAN`. Transisi status final dan nilai status liar ditolak. | ✅ Terverifikasi |
| **Antrean Kedatangan Fisik (BR-08)** | Terbit saat verifikasi fisik KTP di loket. Format nomor sekuensial harian `A 001`, `A 002`, dst. di [`src/services/queueService.ts`](file:///c:/Users/user/Documents/silapurwa/src/services/queueService.ts). Transisi status antrean divalidasi agar tidak bisa mundur atau melompati tahap final. Verifikasi hanya dapat dilakukan pada tanggal kunjungan; booking tanggal lain ditolak dan tombol verifikasi dinonaktifkan. | ✅ Terverifikasi |
| **Barang Titipan (BR-09)** | Batas maksimal makanan (3 bungkus), pakaian (3 potong), obat beresep dokter, dan uang titipan (maks Rp 200.000). | ✅ Terverifikasi |
| **Pembatalan Mandiri Publik (BR-10)** | Pengunjung dapat membatalkan pendaftaran dengan konfirmasi NIK pendaftar utama. Kuota WBP dan NIK otomatis dibebaskan kembali. | ✅ Terverifikasi |
| **Dokumen PDF Resmi (A6)** | PDFKit di [`src/services/pdfService.ts`](file:///c:/Users/user/Documents/silapurwa/src/services/pdfService.ts):<br>&bull; **Bukti Pendaftaran A6 Publik:** Hitam-putih, kop resmi Kemenimipas, nomor registrasi, QR verifikasi, data WBP dengan **Status WBP** dari Putus Sidang dan **Kamar Sel** singkat (`A.04`), data pendaftar/pengikut, total pengunjung, catatan, dan waktu cetak.<br>&bull; **Tiket A6 Pengawasan Petugas:** Monokrom, nomor antrean font besar (`A 001`), data WBP lengkap, **Status WBP** dan **Kamar Sel** singkat, NIK utuh untuk verifikasi petugas. | ✅ Terverifikasi |
| **Otentikasi & Keamanan (BR-16, BR-17, NFR 05)** | Password Argon2id, CSRF guard untuk seluruh POST, sliding session 30 menit, rate limit login (5 gagal per 15 mnt), rate limit pendaftaran & lookup NIK, alur lupa password dengan persetujuan Master & password sementara. Password master wajib diganti saat login pertama. Sesi admin diverifikasi ulang ke data akun sehingga reset password, penghapusan akun, atau perubahan role langsung mencabut sesi lama. Hardening P2: batas panjang password, verifikasi Argon2 dummy untuk mencegah enumerasi berbasis timing, respons lupa password generik, logout hanya via POST + CSRF, route ganti password dilindungi otentikasi, dan CSP nonce untuk script inline. Tautan menuju portal petugas tidak lagi ditampilkan pada navigasi maupun footer halaman publik. | ✅ Terverifikasi |
| **Backup Harian & Dual-PC (BR-15, NFR 01, NFR 06)** | Backup otomatis zip harian pukul 14.30 WIB dengan retensi 30 hari di [`src/services/backupService.ts`](file:///c:/Users/user/Documents/silapurwa/src/services/backupService.ts). Restore memakai staging, manifest, validasi path anti zip-slip, batas ukuran, safety backup, dan lock global. Panduan failover Cold Standby Debian 12 di [`docs/STANDBY_RECOVERY_GUIDE.md`](file:///c:/Users/user/Documents/silapurwa/docs/STANDBY_RECOVERY_GUIDE.md). | ✅ Terverifikasi |
| **Desain Token & Universal Dark Mode** | Desain OKLCH modern di [`public/css/global.css`](file:///c:/Users/user/Documents/silapurwa/public/css/global.css) dengan toggle Dark Mode persistensi `localStorage` di [`public/js/themeToggle.js`](file:///c:/Users/user/Documents/silapurwa/public/js/themeToggle.js) aktif pada seluruh antarmuka publik dan panel admin. | ✅ Terverifikasi |

---

## 2. Hasil Verifikasi Pengujian Otomatis

Seluruh 13 test suite lulus tanpa kegagalan:

```text
PASS tests/integration/adminFlow.test.ts (10 tests)
PASS tests/integration/publicRoutes.test.ts (7 tests)
PASS tests/unit/pdfService.test.ts (3 tests)
PASS tests/unit/registrationService.test.ts (15 tests)
PASS tests/unit/queueService.test.ts (5 tests)
PASS tests/unit/app.test.ts (3 tests)
PASS tests/unit/backupService.test.ts (7 tests)
PASS tests/unit/fileLockManager.test.ts (3 tests)
PASS tests/unit/scheduleService.test.ts (15 tests)
PASS tests/unit/wbpService.test.ts (15 tests)
PASS tests/unit/registrationOverviewService.test.ts (1 test)
PASS tests/unit/storageEngine.test.ts (4 tests)
PASS tests/unit/formatCellLocation.test.ts (5 tests)

Test Suites: 13 passed, 13 total
Tests:       93 passed, 93 total
Snapshots:   0 total
```

> `npm test` sekarang memakai `STORAGE_ROOT` temporer di direktori OS dan membersihkannya setelah selesai. Pengujian tidak lagi menyentuh `storage/` produksi.

Audit read-only untuk mendeteksi record yang terlanjur diverifikasi sebelum tanggal kunjungan:

```bash
npm run audit:early-verifications
```

Script ini tidak mengubah data. Koreksi data lama harus dilakukan setelah backup dan persetujuan operator.

Reset data operasional dengan backup safety otomatis dan konfigurasi yang dipertahankan:

```bash
npm run reset:data          # dry-run
npm run reset:data -- --apply
```

Data yang dibersihkan: registrations, queues, indexes, logs, sessions, locks, backups, dan WBP. Konfigurasi `config/admins.json`, `config/settings.json`, `config/items.json`, dan `config/pending_password_resets.json` tidak disentuh. Backup lengkap disimpan di `storage-safety-backups/pre_reset_<timestamp>/` sebelum penghapusan. Setelah reset, WBP kosong dan perlu diimpor ulang dari data resmi.

Hasil P3 (2026-11-06): audit menemukan 2 record yang terlanjur diverifikasi sebelum tanggal kunjungan. Setelah backup, seluruh data operasional dibersihkan. Empat file konfigurasi diverifikasi tidak berubah melalui perbandingan SHA-256.

### Pemeriksaan TypeScript Strict Mode
```bash
npm run typecheck
# Output: tsc --noEmit -> Bersih, 0 error.
```

### Pemeriksaan Kompilasi Build Produksi
```bash
npm run build
# Output: dist/ ter-generate lengkap (server.js, app.js, services, controllers, storage, bootstrap, dll).
```

---

## 3. Panduan Menjalankan Sistem

### Mode Pengembangan (Development)
```bash
npm run dev
```
Akses di browser:
- Halaman Pengunjung Publik: `http://localhost:3000`
- Pendaftaran Kunjungan: `http://localhost:3000/daftar`
- Cek Status / Pembatalan: `http://localhost:3000/status`
- Panel Petugas Loket / Admin: `http://localhost:3000/admin/login`
  - **Username Master Awal:** `master`
  - **Password Awal:** gunakan nilai `ADMIN_MASTER_INITIAL_PASSWORD` pada `.env` lokal Anda. Password ini wajib diganti saat login pertama.
  - Jangan pernah menuliskan password produksi ke dokumentasi, repositori, atau pesan publik.

### Mode Produksi dengan PM2 (Windows Primary / Debian Standby)
```bash
# Kompilasi TypeScript ke Javascript
npm run build

# Jalankan daemon PM2
npx pm2 start ecosystem.config.cjs

# Pantau status proses dan logs
npx pm2 status
npx pm2 logs sikunjung
```
