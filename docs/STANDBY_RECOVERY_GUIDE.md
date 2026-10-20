# Panduan Pemulihan & Replikasi Dual-PC (Standby Recovery Guide)
## Sistem Informasi Pendaftaran Kunjungan Online Lapas Kelas IIB Purwakarta (SIKUNJUNG)

Dokumen ini memuat prosedur standar operasional (SOP) arsitektur Dual-PC tanpa RDBMS (Pure JSON Storage) sesuai spesifikasi PRD v3.0 Final (NFR 01, NFR 06, NFR 08).

---

## 1. Topologi Arsitektur Dual-PC

| Peran | Spesifikasi OS & Hardware | Perangkat Lunak Inti | Status Operasional |
| :--- | :--- | :--- | :--- |
| **PC Primary (Utama)** | Windows 10/11 Pro (64-bit), 8GB+ RAM | Node.js 20 LTS, PM2, Nginx / Port 3000 | **Active (Produksi)** |
| **PC Standby (Cadangan)** | Debian 12 Minimal (64-bit), 4GB+ RAM | Node.js 20 LTS, PM2, Nginx / Port 3000 | **Cold Standby** (Siap Switchover) |

---

## 2. Prosedur Pencadangan (Backup) Otomatis

1. **Jadwal Eksekusi:** Setiap hari tepat pukul **14.30 WIB** (setelah jam layanan kunjungan ditutup).
2. **Format Berkas:** Single file ZIP terkompresi berekstensi `.zip` ber-timestamp (contoh: `backup_auto_20261109_143000_a1b2.zip`).
3. **Lokasi Penyimpanan:** `storage/backups/auto/`.
4. **Masa Retensi:** **30 hari terakhir**. Arsip yang melampaui 30 hari dibersihkan secara otomatis oleh rutinitas `cleanupOldBackups(30)`.
5. **Replikasi ke PC Standby:**
   - Gunakan skrip sinkronisasi jaringan LAN (via rsync/SMB share) dari Windows Primary ke Debian Standby:
     ```bash
     # Contoh sinkronisasi arsip ZIP harian ke server Debian Standby
     scp storage/backups/auto/*.zip debian-standby:/var/www/sikunjung/storage/backups/auto/
     ```

---

## 3. Prosedur Switchover / Failover Manual (< 2 Jam)

Jika PC Utama (Windows) mengalami kendala hardware atau gangguan kritis, lakukan failover ke PC Cadangan (Debian) dengan langkah berikut:

### Langkah 1: Pindahkan Berkas Backup Terakhir ke PC Standby
Ambil file ZIP backup terakhir (dari folder backup auto atau flashdisk):
```bash
# Di server Debian Standby
cd /var/www/sikunjung
ls -la storage/backups/auto/
```

### Langkah 2: Ekstrak / Restore Data ke Storage Debian
Gunakan fungsi restore sistem bawaan SIKUNJUNG atau ekstrak langsung dengan integritas 100%:
```bash
# Pastikan proses Node.js sedang berhenti sementara saat ekstraksi manual
pm2 stop sikunjung

# Ekstrak berkas backup terbaru ke folder storage
unzip -o storage/backups/auto/backup_auto_YYYYMMDD_HHmmss_xxxx.zip -d storage/
```

### Langkah 3: Verifikasi Integritas Data & Izin Akses
```bash
# Pastikan folder locks, sessions, logs siap
mkdir -p storage/locks storage/sessions storage/logs

# Berikan izin akses penuh ke user service
chown -R www-data:www-data storage/
chmod -R 775 storage/
```

### Langkah 4: Jalankan Aplikasi di PC Standby
```bash
# Jalankan menggunakan PM2
pm2 start ecosystem.config.cjs
pm2 save

# Periksa status dan log aplikasi
pm2 status
pm2 logs sikunjung
```

### Langkah 5: Alihkan Alamat IP / DNS Lokal
Ubah IP LAN atau arahkan DNS Router loket Lapas ke IP server Debian Standby (misal `192.168.1.100`), sehingga petugas loket dan pengunjung langsung terhubung kembali tanpa hambatan.

---

## 4. Perintah Operasional Cepat

| Aksi | Perintah di Windows (Primary) | Perintah di Debian (Standby) |
| :--- | :--- | :--- |
| **Start Service** | `npx pm2 start ecosystem.config.cjs` | `pm2 start ecosystem.config.cjs` |
| **Restart Service** | `npx pm2 restart sikunjung` | `pm2 restart sikunjung` |
| **Stop Service** | `npx pm2 stop sikunjung` | `pm2 stop sikunjung` |
| **Monitor Log** | `npx pm2 logs sikunjung` | `pm2 logs sikunjung` |
| **Typecheck** | `npm run typecheck` | `npm run typecheck` |
| **Test Suite** | `npm test` | `npm test` |
