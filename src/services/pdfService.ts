import path from 'path';
import PDFDocument from 'pdfkit';
import { RegistrationRecord } from '../types/registration';
import { SystemSettings } from '../types/settings';
import { generateQrCodeBuffer } from './qrService';
import { formatIndonesianDate, getNowInJakarta } from '../utils/dateUtils';
import { formatCellLocation } from '../utils/formatCellLocation';
import { maskNik } from '../utils/maskNik';

const MONO_BLACK = '#000000';
const MONO_WHITE = '#ffffff';
const PROOF_LOGO_LEFT = path.resolve(
  __dirname,
  '../../public/images/logo-kemenimipas.png'
);
const PROOF_LOGO_RIGHT = path.resolve(
  __dirname,
  '../../public/images/logo-pemasyarakatan.png'
);

function maskPhone(phone: string): string {
  const clean = (phone ?? '').trim();
  if (clean.length <= 7) return clean;
  return `${clean.slice(0, 4)}****${clean.slice(-3)}`;
}

export async function generateRegistrationProofA6(
  record: RegistrationRecord,
  settings: SystemSettings
): Promise<Buffer> {
  const qrBuffer = await generateQrCodeBuffer(record.registrationNumber, 360);

  return await new Promise<Buffer>((resolve, reject) => {
    // A6 portrait: 105 x 148 mm = 297.64 x 419.53 pt
    const doc = new PDFDocument({
      size: [297.64, 419.53],
      margins: { top: 16, bottom: 16, left: 18, right: 18 }
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const left = 18;
    const contentWidth = doc.page.width - left * 2;
    const bottomLimit = doc.page.height - 16;
    let y = 16;

    const setText = (
      fontSize: number,
      font = 'Helvetica',
      color = MONO_BLACK
    ) => {
      doc.font(font).fontSize(fontSize).fillColor(color);
    };

    const drawCenteredText = (
      text: string,
      yPos: number,
      fontSize: number,
      font = 'Helvetica',
      color = MONO_BLACK
    ): number => {
      setText(fontSize, font, color);
      const height = doc.heightOfString(text, {
        width: contentWidth,
        align: 'center'
      });
      doc.text(text, left, yPos, { width: contentWidth, align: 'center' });
      return yPos + height;
    };

    const drawRule = (
      yPos: number,
      width = contentWidth,
      x = left,
      lineWidth = 0.5
    ) => {
      doc
        .save()
        .lineWidth(lineWidth)
        .strokeColor(MONO_BLACK)
        .moveTo(x, yPos)
        .lineTo(x + width, yPos)
        .stroke()
        .restore();
    };

    const drawSectionTitle = (title: string, yPos: number): number => {
      setText(7.5, 'Helvetica-Bold');
      const height = doc.heightOfString(title, { width: contentWidth });
      doc.text(title, left, yPos, { width: contentWidth });
      drawRule(yPos + height + 1.5);
      return yPos + height + 5;
    };

    const drawKeyValue = (
      label: string,
      value: string,
      yPos: number,
      bold = false,
      maxLines?: number
    ): number => {
      const labelWidth = 64;
      const gap = 4;
      const valueWidth = contentWidth - labelWidth - gap;
      const labelText = `${label} :`;

      setText(6.5, 'Helvetica');
      const labelHeight = doc.heightOfString(labelText, { width: labelWidth });
      doc.text(labelText, left, yPos, { width: labelWidth });

      setText(8, bold ? 'Helvetica-Bold' : 'Helvetica');
      const fullValueHeight = doc.heightOfString(value, { width: valueWidth });
      const lineHeight = doc.heightOfString('X', { width: valueWidth });
      const maxValueHeight = maxLines
        ? lineHeight * maxLines
        : fullValueHeight;
      const valueHeight = Math.min(fullValueHeight, maxValueHeight);
      const textOptions: PDFKit.Mixins.TextOptions = {
        width: valueWidth
      };
      if (fullValueHeight > maxValueHeight + 0.5) {
        textOptions.height = maxValueHeight;
        textOptions.ellipsis = true;
      }
      doc.text(value, left + labelWidth + gap, yPos, textOptions);

      return yPos + Math.max(labelHeight, valueHeight) + 1.2;
    };

    const drawColumnHeading = (
      title: string,
      xPos: number,
      yPos: number,
      width: number
    ): number => {
      setText(7, 'Helvetica-Bold');
      const height = doc.heightOfString(title, { width });
      doc.text(title, xPos, yPos, { width });
      drawRule(yPos + height + 1.2, width, xPos, 0.5);
      return yPos + height + 4;
    };

    const drawColumnKeyValue = (
      label: string,
      value: string,
      xPos: number,
      yPos: number,
      width: number,
      bold = false,
      maxLines?: number
    ): number => {
      const labelWidth = 38;
      const gap = 3;
      const valueWidth = width - labelWidth - gap;
      const labelText = `${label} :`;

      setText(6.5, 'Helvetica');
      const labelHeight = doc.heightOfString(labelText, { width: labelWidth });
      doc.text(labelText, xPos, yPos, { width: labelWidth });

      setText(7.5, bold ? 'Helvetica-Bold' : 'Helvetica');
      const fullValueHeight = doc.heightOfString(value, { width: valueWidth });
      const lineHeight = doc.heightOfString('X', { width: valueWidth });
      const maxValueHeight = maxLines
        ? lineHeight * maxLines
        : fullValueHeight;
      const valueHeight = Math.min(fullValueHeight, maxValueHeight);
      const textOptions: PDFKit.Mixins.TextOptions = {
        width: valueWidth
      };
      if (fullValueHeight > maxValueHeight + 0.5) {
        textOptions.height = maxValueHeight;
        textOptions.ellipsis = true;
      }
      doc.text(value, xPos + labelWidth + gap, yPos, textOptions);

      return yPos + Math.max(labelHeight, valueHeight) + 1.2;
    };

    // --- HEADER ---
    const headerLogoSize = 30;
    const headerLogoGap = 4;
    const headerTextX = left + headerLogoSize + headerLogoGap;
    const headerTextWidth =
      contentWidth - (headerLogoSize + headerLogoGap) * 2;

    const drawHeaderText = (
      text: string,
      yPos: number,
      fontSize: number,
      font = 'Helvetica',
      color = MONO_BLACK
    ): number => {
      setText(fontSize, font, color);
      const height = doc.heightOfString(text, {
        width: headerTextWidth,
        align: 'center'
      });
      doc.text(text, headerTextX, yPos, {
        width: headerTextWidth,
        align: 'center'
      });
      return yPos + height;
    };

    doc.image(PROOF_LOGO_LEFT, left, y, {
      fit: [headerLogoSize, headerLogoSize],
      align: 'center',
      valign: 'center'
    });
    doc.image(PROOF_LOGO_RIGHT, left + contentWidth - headerLogoSize, y, {
      fit: [headerLogoSize, headerLogoSize],
      align: 'center',
      valign: 'center'
    });

    y = drawHeaderText(settings.ministry.toUpperCase(), y, 5.5);
    y += 1;
    y = drawHeaderText(
      settings.agencyName.toUpperCase(),
      y,
      7,
      'Helvetica-Bold'
    );
    y += 0.5;
    y = drawHeaderText(
      'BUKTI PENDAFTARAN KUNJUNGAN',
      y,
      9,
      'Helvetica-Bold'
    );
    y += 3;
    drawRule(y, contentWidth, left, 1.5);
    y += 6;

    // --- NOMOR REGISTRASI ---
    const regBoxWidth = 196;
    const regBoxX = left + (contentWidth - regBoxWidth) / 2;
    const regBoxHeight = 32;

    doc
      .save()
      .lineWidth(1)
      .strokeColor(MONO_BLACK)
      .rect(regBoxX, y, regBoxWidth, regBoxHeight)
      .stroke()
      .restore();

    setText(6.5, 'Helvetica');
    doc.text('NOMOR REGISTRASI', regBoxX, y + 4, {
      width: regBoxWidth,
      align: 'center'
    });
    setText(15, 'Helvetica-Bold');
    doc.text(record.registrationNumber, regBoxX, y + 10.5, {
      width: regBoxWidth,
      align: 'center'
    });

    y += regBoxHeight + 6;

    // --- QR ---
    const qrSize = 76;
    const qrX = left + (contentWidth - qrSize) / 2;
    doc.image(qrBuffer, qrX, y, { fit: [qrSize, qrSize] });
    doc
      .save()
      .lineWidth(0.5)
      .strokeColor(MONO_BLACK)
      .rect(qrX - 2, y - 2, qrSize + 4, qrSize + 4)
      .stroke()
      .restore();

    y += qrSize + 5;
    y = drawCenteredText('Pindai QR di loket verifikasi', y, 6.5);
    y += 6;

    // --- DATA WBP ---
    y = drawSectionTitle('DATA WBP', y);
    y = drawKeyValue('Nama WBP', record.wbp.nama, y, true, 2);
    y = drawKeyValue('Status WBP', record.wbp.jenisWbp, y, true);
    y = drawKeyValue(
      'Kamar Sel',
      formatCellLocation(record.wbp.lokasiSel),
      y,
      true
    );
    y = drawKeyValue(
      'Tanggal Kunjungan',
      formatIndonesianDate(record.visitDate),
      y
    );
    y += 5;

    // --- PENDAFTAR & PENGIKUT ---
    const columnGap = 10;
    const columnWidth = (contentWidth - columnGap) / 2;
    const rightColumnX = left + columnWidth + columnGap;
    const columnsTop = y;

    let leftY = drawColumnHeading('PENDAFTAR', left, columnsTop, columnWidth);
    leftY = drawColumnKeyValue(
      'Nama',
      record.primaryVisitor.nama,
      left,
      leftY,
      columnWidth,
      true,
      2
    );
    leftY = drawColumnKeyValue(
      'NIK',
      maskNik(record.primaryVisitor.nik),
      left,
      leftY,
      columnWidth
    );
    leftY = drawColumnKeyValue(
      'No. HP',
      maskPhone(record.primaryVisitor.telepon),
      left,
      leftY,
      columnWidth
    );
    leftY = drawColumnKeyValue(
      'Relasi',
      record.primaryVisitor.relasi,
      left,
      leftY,
      columnWidth
    );

    let rightY = drawColumnHeading(
      `PENGIKUT (${record.adultFollowers.length})`,
      rightColumnX,
      columnsTop,
      columnWidth
    );

    if (record.adultFollowers.length === 0) {
      setText(7.5, 'Helvetica-Oblique');
      const emptyHeight = doc.heightOfString('Tidak ada pengikut', {
        width: columnWidth
      });
      doc.text('Tidak ada pengikut', rightColumnX, rightY, {
        width: columnWidth
      });
      rightY += emptyHeight + 1.2;
    } else {
      record.adultFollowers.forEach((follower, index) => {
        const line = `${index + 1}. ${follower.nama} (${follower.relasi})`;
        setText(7.5, 'Helvetica');
        const fullLineHeight = doc.heightOfString(line, { width: columnWidth });
        const lineHeight = doc.heightOfString('X', { width: columnWidth });
        const maxLineHeight = lineHeight * 2;
        const displayLineHeight = Math.min(fullLineHeight, maxLineHeight);
        const textOptions: PDFKit.Mixins.TextOptions = {
          width: columnWidth
        };
        if (fullLineHeight > maxLineHeight + 0.5) {
          textOptions.height = maxLineHeight;
          textOptions.ellipsis = true;
        }
        doc.text(line, rightColumnX, rightY, textOptions);
        rightY += displayLineHeight + 1.2;
      });
    }

    rightY = drawColumnKeyValue(
      'Anak',
      `${record.childrenCount} orang`,
      rightColumnX,
      rightY,
      columnWidth,
      true
    );

    y = Math.max(leftY, rightY) + 6;

    // --- TOTAL ---
    const totalBarHeight = 18;
    doc
      .save()
      .fillColor(MONO_BLACK)
      .rect(left, y, contentWidth, totalBarHeight)
      .fill()
      .restore();

    setText(8.5, 'Helvetica-Bold', MONO_WHITE);
    doc.text(
      `TOTAL PENGUNJUNG: ${record.totalVisitors} ORANG`,
      left + 4,
      y + 5,
      { width: contentWidth - 8, align: 'center' }
    );

    y += totalBarHeight + 6;

    // --- CATATAN ---
    const staticNote = 'Tunjukkan bukti ini dan KTP asli saat verifikasi.';
    const customNote = (settings.proofCustomNotes || '').trim();
    const noteWidth = contentWidth - 12;

    setText(6.5, 'Helvetica');
    const staticNoteHeight = doc.heightOfString(staticNote, {
      width: noteWidth
    });
    let customNoteHeight = customNote
      ? Math.min(doc.heightOfString(customNote, { width: noteWidth }), 18)
      : 0;
    let notesBoxHeight =
      6 + staticNoteHeight + (customNoteHeight > 0 ? 2 + customNoteHeight : 0) + 6;

    if (y + notesBoxHeight > bottomLimit - 2) {
      customNoteHeight = customNote
        ? Math.min(doc.heightOfString(customNote, { width: noteWidth }), 9)
        : 0;
      notesBoxHeight =
        6 +
        staticNoteHeight +
        (customNoteHeight > 0 ? 2 + customNoteHeight : 0) +
        6;
    }

    doc
      .save()
      .lineWidth(0.75)
      .strokeColor(MONO_BLACK)
      .rect(left, y, contentWidth, notesBoxHeight)
      .stroke()
      .restore();

    setText(6.5, 'Helvetica', MONO_BLACK);
    doc.text(staticNote, left + 6, y + 5, { width: noteWidth });
    if (customNote) {
      doc.text(customNote, left + 6, y + 5 + staticNoteHeight + 2, {
        width: noteWidth,
        height: customNoteHeight,
        ellipsis: true
      });
    }

    y += notesBoxHeight + 5;

    doc.end();
  });
}

export async function generateSupervisorTicketA6(
  record: RegistrationRecord,
  queueNumber: string,
  sequence: number,
  settings: SystemSettings
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    // A6 portrait: 105 x 148 mm = 297.64 x 419.53 pt
    const doc = new PDFDocument({
      size: [297.64, 419.53],
      margins: { top: 16, bottom: 16, left: 18, right: 18 }
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const left = 18;
    const contentWidth = doc.page.width - left * 2;
    const bottomLimit = doc.page.height - 16;
    let y = 16;

    const setText = (
      fontSize: number,
      font = 'Helvetica',
      color = MONO_BLACK
    ) => {
      doc.font(font).fontSize(fontSize).fillColor(color);
    };

    const drawCenteredText = (
      text: string,
      yPos: number,
      fontSize: number,
      font = 'Helvetica',
      color = MONO_BLACK
    ): number => {
      setText(fontSize, font, color);
      const height = doc.heightOfString(text, {
        width: contentWidth,
        align: 'center'
      });
      doc.text(text, left, yPos, { width: contentWidth, align: 'center' });
      return yPos + height;
    };

    const drawRule = (
      yPos: number,
      width = contentWidth,
      x = left,
      lineWidth = 0.5
    ) => {
      doc
        .save()
        .lineWidth(lineWidth)
        .strokeColor(MONO_BLACK)
        .moveTo(x, yPos)
        .lineTo(x + width, yPos)
        .stroke()
        .restore();
    };

    const drawSectionTitle = (title: string, yPos: number): number => {
      setText(7.5, 'Helvetica-Bold');
      const height = doc.heightOfString(title, { width: contentWidth });
      doc.text(title, left, yPos, { width: contentWidth });
      drawRule(yPos + height + 1.5);
      return yPos + height + 5;
    };

    const drawKeyValue = (
      label: string,
      value: string,
      yPos: number,
      bold = false,
      maxLines?: number
    ): number => {
      const labelWidth = 76;
      const gap = 4;
      const valueWidth = contentWidth - labelWidth - gap;
      const labelText = `${label} :`;

      setText(6.5, 'Helvetica');
      const labelHeight = doc.heightOfString(labelText, { width: labelWidth });
      doc.text(labelText, left, yPos, { width: labelWidth });

      setText(8, bold ? 'Helvetica-Bold' : 'Helvetica');
      const fullValueHeight = doc.heightOfString(value, { width: valueWidth });
      const lineHeight = doc.heightOfString('X', { width: valueWidth });
      const maxValueHeight = maxLines ? lineHeight * maxLines : fullValueHeight;
      const valueHeight = Math.min(fullValueHeight, maxValueHeight);
      const textOptions: PDFKit.Mixins.TextOptions = { width: valueWidth };
      if (fullValueHeight > maxValueHeight + 0.5) {
        textOptions.height = maxValueHeight;
        textOptions.ellipsis = true;
      }
      doc.text(value, left + labelWidth + gap, yPos, textOptions);

      return yPos + Math.max(labelHeight, valueHeight) + 1.2;
    };

    const drawBorderedTextBox = (
      text: string,
      yPos: number,
      fontSize: number,
      maxLines: number
    ): number => {
      const boxWidth = contentWidth;
      const innerWidth = boxWidth - 12;
      setText(fontSize, 'Helvetica');
      const oneLineHeight = doc.heightOfString('X', { width: innerWidth });
      const fullHeight = doc.heightOfString(text, { width: innerWidth });
      const maxHeight = oneLineHeight * maxLines;
      const displayHeight = Math.min(fullHeight, maxHeight);
      const boxHeight = 6 + displayHeight + 6;

      doc
        .save()
        .lineWidth(0.75)
        .strokeColor(MONO_BLACK)
        .rect(left, yPos, boxWidth, boxHeight)
        .stroke()
        .restore();

      const options: PDFKit.Mixins.TextOptions = { width: innerWidth };
      if (fullHeight > maxHeight + 0.5) {
        options.height = maxHeight;
        options.ellipsis = true;
      }
      doc.text(text, left + 6, yPos + 6, options);

      return yPos + boxHeight;
    };

    // --- HEADER TIKET ---
    y = drawCenteredText(
      settings.agencyName.toUpperCase(),
      y,
      8.5,
      'Helvetica-Bold'
    );
    y += 1;
    y = drawCenteredText(
      'TIKET KUNJUNGAN - PENGAWASAN PETUGAS',
      y,
      7.5,
      'Helvetica-Bold'
    );
    y += 3;
    drawRule(y, contentWidth, left, 1.5);
    y += 6;

    // --- NOMOR ANTREAN BESAR ---
    const queueBoxHeight = 54;
    doc
      .save()
      .lineWidth(1.5)
      .strokeColor(MONO_BLACK)
      .rect(left, y, contentWidth, queueBoxHeight)
      .stroke()
      .restore();

    setText(7, 'Helvetica-Bold');
    doc.text('NOMOR ANTREAN', left, y + 6, {
      width: contentWidth,
      align: 'center'
    });
    setText(28, 'Helvetica-Bold');
    doc.text(queueNumber, left, y + 16, {
      width: contentWidth,
      align: 'center'
    });

    y += queueBoxHeight + 6;

    // --- SUB-INFO REGISTRASI ---
    y = drawCenteredText(
      `No. Reg: ${record.registrationNumber}  |  Urutan: ${sequence}`,
      y,
      7.5
    );
    y = drawCenteredText(
      `Tanggal: ${formatIndonesianDate(record.visitDate)}`,
      y,
      7.5
    );
    y += 6;

    // --- DETAIL WBP LENGKAP UNTUK PETUGAS ---
    y = drawSectionTitle('DATA WARGA BINAAN (WBP)', y);
    y = drawKeyValue('Nama WBP', record.wbp.nama, y, true, 3);
    y = drawKeyValue(
      'Tgl Lahir / Usia',
      `${record.wbp.tanggalLahir} (${record.wbp.usia} thn)`,
      y
    );
    y = drawKeyValue('Tanggal Masuk', record.wbp.tanggalMasuk, y);
    y = drawKeyValue('Status WBP', record.wbp.jenisWbp, y, true);
    y = drawKeyValue(
      'Kamar Sel',
      formatCellLocation(record.wbp.lokasiSel),
      y,
      true
    );
    y = drawKeyValue('Status Kunjungan', record.wbp.bolehDikunjungi, y);
    y += 5;

    // --- DETAIL PENGUNJUNG ---
    y = drawSectionTitle('DATA PENGUNJUNG', y);
    y = drawKeyValue(
      'Pendaftar',
      `${record.primaryVisitor.nama} (${record.primaryVisitor.relasi})`,
      y,
      true,
      2
    );
    y = drawKeyValue('NIK', record.primaryVisitor.nik, y);
    y = drawKeyValue(
      'Total Pengunjung',
      `${record.totalVisitors} Orang (${record.totalAdults} Dewasa, ${record.childrenCount} Anak)`,
      y,
      true
    );
    y += 5;

    // --- RINGKASAN BARANG TITIPAN ---
    y = drawSectionTitle('BARANG TITIPAN', y);
    let luggageText = 'Tidak ada barang titipan.';
    if (record.luggageItems.length > 0) {
      luggageText = record.luggageItems
        .map(
          (item) =>
            `${item.itemName} (${item.unit === 'Rupiah' ? 'Rp ' : ''}${item.quantity} ${item.unit})`
        )
        .join(', ');
    }
    y = drawBorderedTextBox(luggageText, y, 7, 3);
    y += 6;

    // --- CATATAN CETAK ---
    const ticketNotes = (settings.ticketCustomNotes || '').trim();
    if (ticketNotes) {
      y = drawBorderedTextBox(ticketNotes, y, 6.5, 2);
      y += 5;
    }

    // --- FOOTER ---
    const footerY = bottomLimit - 8;
    setText(6, 'Helvetica', MONO_BLACK);
    doc.text(
      `Dicetak: ${getNowInJakarta().toFormat('dd MMM yyyy HH:mm')} WIB`,
      left,
      footerY,
      { width: contentWidth, align: 'center' }
    );

    doc.end();
  });
}
