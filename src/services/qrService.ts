import QRCode from 'qrcode';

export async function generateQrCodeBuffer(payload: string, width = 180): Promise<Buffer> {
  return await QRCode.toBuffer(payload, {
    type: 'png',
    width,
    margin: 2,
    color: {
      dark: '#1e1b4b', // Dark purple/indigo matching OKLCH theme
      light: '#ffffff'
    }
  });
}

export async function generateQrCodeDataUrl(payload: string, width = 180): Promise<string> {
  return await QRCode.toDataURL(payload, {
    width,
    margin: 2,
    color: {
      dark: '#1e1b4b',
      light: '#ffffff'
    }
  });
}
