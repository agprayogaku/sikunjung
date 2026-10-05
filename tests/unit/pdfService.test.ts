import { generateRegistrationProofA6, generateSupervisorTicketA6 } from '../../src/services/pdfService';
import * as qrService from '../../src/services/qrService';
import { RegistrationRecord } from '../../src/types/registration';
import { SystemSettings } from '../../src/types/settings';

describe('PDF Service Tests (A6 Proof & A6 Ticket - FR P11, FR A07, TC 23, TC 24)', () => {
  const dummySettings: SystemSettings = {
    appTitle: 'SIKUNJUNG',
    agencyName: 'Lembaga Pemasyarakatan Kelas IIB Purwakarta',
    regionalOffice: 'KANTOR WILAYAH DIREKTORAT JENDERAL PEMASYARAKATAN JAWA BARAT',
    ministry: 'KEMENTERIAN IMIGRASI DAN PEMASYARAKATAN REPUBLIK INDONESIA',
    address: 'JL. MR. DR. Kusuma Atmaja No. 14, Cipaisan, Purwakarta, Cipaisan, Kec. Purwakarta, Kabupaten Purwakarta, Jawa Barat 41114',
    phone: '(0264) 200045',
    maxDailyRegistrations: 40,
    maxDailyVisitors: 60,
    openDays: [1, 2, 3, 4, 6],
    closedDays: [5, 7],
    closedSpecialDates: [],
    visitingHoursWeekday: {
      session1: { start: '08:30', end: '11:30' },
      session2: { start: '13:00', end: '14:30' }
    },
    visitingHoursSaturday: {
      session1: { start: '08:30', end: '11:30' }
    },
    ticketCustomNotes: 'Bawalah tiket ini dan KTP asli saat memasuki ruang kunjungan.',
    proofCustomNotes: 'Nomor antrean resmi diterbitkan saat verifikasi fisik di loket Lapas Purwakarta.',
    welcomeGreetingText: 'Selamat Datang',
    showCellLocationToPublic: false,
    defaultVisitDurationMinutes: 30
  };

  const sampleRecord: RegistrationRecord = {
    id: 'test-uuid-1234',
    registrationNumber: 'REG-20261109-0001',
    verifyToken: 'abcdef1234567890',
    createdAt: '2026-11-06T10:00:00.000Z',
    visitDate: '2026-11-09',
    status: 'MENUNGGU VERIFIKASI',
    wbp: {
      wbpId: 'dummy-wbp-id',
      nama: 'TATANG BIN TEDI',
      tanggalLahir: '1978-09-21',
      usia: 48,
      tanggalMasuk: '2024-12-19',
      putusSidang: 'Sudah',
      jenisWbp: 'Narapidana',
      bolehDikunjungi: 'Boleh Dikunjungi',
      lokasiSel: 'TP Umum LT 1/A.04'
    },
    primaryVisitor: {
      nik: '3201011234560001',
      nama: 'Budi Santoso',
      jenisKelamin: 'Laki-laki',
      relasi: 'Saudara Kandung',
      alamat: 'Jl. Veteran No. 10 Purwakarta',
      telepon: '081234567890'
    },
    adultFollowers: [
      {
        nik: '3201011234560002',
        nama: 'Siti Aminah',
        jenisKelamin: 'Perempuan',
        relasi: 'Istri',
        alamat: 'Jl. Veteran No. 10 Purwakarta'
      }
    ],
    childrenCount: 1,
    totalAdults: 2,
    totalVisitors: 3,
    luggageItems: [
      { itemId: 'ITM-001', itemName: 'Makanan Matang', quantity: 2, unit: 'Bungkus', notes: 'Nasi padang' },
      { itemId: 'ITM-004', itemName: 'Uang Titipan', quantity: 50000, unit: 'Rupiah' }
    ],
    statusHistory: [
      {
        status: 'MENUNGGU VERIFIKASI',
        changedAt: '2026-11-06T10:00:00.000Z',
        changedBy: 'Pengunjung'
      }
    ]
  };

  it('TC 23: generateRegistrationProofA6 menghasilkan buffer PDF A6 yang valid dengan header %PDF-', async () => {
    const buffer = await generateRegistrationProofA6(sampleRecord, dummySettings);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    // Verifikasi magic bytes PDF: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    const magic = buffer.toString('utf8', 0, 5);
    expect(magic).toBe('%PDF-');

    // MediaBox A6 portrait: 297.64 x 419.53 pt
    const pdfText = buffer.toString('latin1');
    expect(pdfText).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+297\.64\s+419\.5[23]\s*\]/);
  });

  it('QR bukti pendaftaran hanya berisi nomor registrasi', async () => {
    const qrSpy = jest.spyOn(qrService, 'generateQrCodeBuffer');

    try {
      await generateRegistrationProofA6(sampleRecord, dummySettings);

      expect(qrSpy).toHaveBeenCalledTimes(1);
      expect(qrSpy).toHaveBeenCalledWith(sampleRecord.registrationNumber, 360);
    } finally {
      qrSpy.mockRestore();
    }
  });

  it('menangani pengikut maksimal, nama panjang, dan tanpa pengikut tanpa error', async () => {
    const maxFollowersRecord: RegistrationRecord = {
      ...sampleRecord,
      primaryVisitor: {
        ...sampleRecord.primaryVisitor,
        nama: 'Budi Santoso Kusumawardhana Putra Pratama Adisaputra Wiranegara'
      },
      adultFollowers: [
        {
          nik: '3201011234560002',
          nama: 'Siti Aminah Binti Muhammad Yusuf',
          jenisKelamin: 'Perempuan',
          relasi: 'Istri',
          alamat: 'Jl. Veteran No. 10 Purwakarta'
        },
        {
          nik: '3201011234560003',
          nama: 'Ahmad Fauzi Bin Abdullah',
          jenisKelamin: 'Laki-laki',
          relasi: 'Kakak',
          alamat: 'Jl. Veteran No. 10 Purwakarta'
        },
        {
          nik: '3201011234560004',
          nama: 'Rina Kusumawati',
          jenisKelamin: 'Perempuan',
          relasi: 'Sepupu',
          alamat: 'Jl. Veteran No. 10 Purwakarta'
        }
      ],
      totalAdults: 4,
      childrenCount: 2,
      totalVisitors: 6
    };

    const maxBuffer = await generateRegistrationProofA6(maxFollowersRecord, dummySettings);
    expect(maxBuffer.toString('utf8', 0, 5)).toBe('%PDF-');
    expect(
      maxBuffer.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []
    ).toHaveLength(1);

    const noFollowersBuffer = await generateRegistrationProofA6(
      {
        ...sampleRecord,
        adultFollowers: [],
        totalAdults: 1,
        childrenCount: 0,
        totalVisitors: 1
      },
      dummySettings
    );
    expect(noFollowersBuffer.toString('utf8', 0, 5)).toBe('%PDF-');
  });

  it('TC 24: generateSupervisorTicketA6 menghasilkan buffer PDF tiket A6 yang valid dengan header %PDF-', async () => {
    const buffer = await generateSupervisorTicketA6(sampleRecord, 'A 001', 1, dummySettings);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    const magic = buffer.toString('utf8', 0, 5);
    expect(magic).toBe('%PDF-');

    expect(buffer.toString('latin1')).toMatch(
      /\/MediaBox\s*\[\s*0\s+0\s+297\.64\s+419\.5[23]\s*\]/
    );
  });
});
