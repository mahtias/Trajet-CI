import QRCode from "qrcode";

export async function generateQrCode(data: string): Promise<string> {
  return QRCode.toDataURL(data, { width: 300, margin: 2 });
}
