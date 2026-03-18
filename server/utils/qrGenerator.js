const QRCode = require('qrcode');

class QRCodeGenerator {
  static generateUPILink(upiId, companyName, amount, transactionNote = '') {
    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(companyName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
    return upiLink;
  }

  static async generateQRCode(upiLink) {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(upiLink, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });
      return qrCodeDataURL;
    } catch (error) {
      throw new Error('Failed to generate QR code: ' + error.message);
    }
  }

  static async generatePaymentQR(upiId, companyName, amount, bookingId) {
    try {
      const transactionNote = `Car24 Booking #${bookingId}`;
      const upiLink = this.generateUPILink(upiId, companyName, amount, transactionNote);
      const qrCode = await this.generateQRCode(upiLink);
      
      return {
        upiLink,
        qrCode,
        amount,
        transactionNote
      };
    } catch (error) {
      throw new Error('Failed to generate payment QR: ' + error.message);
    }
  }
}

module.exports = QRCodeGenerator;